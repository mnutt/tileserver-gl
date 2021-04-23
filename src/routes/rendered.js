const RenderManager = require("../managers/render");

const { Router } = require("express");
const util = require("util");
const log = require("../log");
const metrics = require("../metrics");

const sharp = require("sharp");
const { createCanvas } = require("canvas");
const mercator = new (require("@mapbox/sphericalmercator"))();
const utils = require("../utils");
const markers = require("../markers");
const { BadRequestError, NotFoundError, asyncRoute } = require("./support");

const getScale = (scale) => (scale || "@1x").slice(1, 2) | 0;

const floatPattern = "[+-]?(?:\\d+|\\d+.?\\d+)";
const centerPattern = util.format(
  ":x(%s),:y(%s),:z(%s)(@:bearing(%s)(,:pitch(%s))?)?",
  floatPattern,
  floatPattern,
  floatPattern,
  floatPattern,
  floatPattern
);
const autoPattern = "auto";
const boundsPattern = util.format(
  ":minx(%s),:miny(%s),:maxx(%s),:maxy(%s)",
  floatPattern,
  floatPattern,
  floatPattern,
  floatPattern
);

const extractPathFromQuery = (query, transformer) => {
  const pathParts = (query.path || "").split("|");
  const path = [];
  for (const pair of pathParts) {
    const pairParts = pair.split(",");
    if (pairParts.length === 2) {
      let pair;
      if (query.latlng === "1" || query.latlng === "true") {
        pair = [+pairParts[1], +pairParts[0]];
      } else {
        pair = [+pairParts[0], +pairParts[1]];
      }
      if (transformer) {
        pair = transformer(pair);
      }
      path.push(pair);
    }
  }
  return path;
};

const precisePx = (ll, zoom) => {
  const px = mercator.px(ll, 20);
  const scale = Math.pow(2, zoom - 20);
  return [px[0] * scale, px[1] * scale];
};

const georeferenceMapCenter = (x, y, z, h) => {
  let center = precisePx([x, y], z);

  const mapHeight = 512 * (1 << z);
  const maxEdge = center[1] + h / 2;
  const minEdge = center[1] - h / 2;
  if (maxEdge > mapHeight) {
    center[1] -= maxEdge - mapHeight;
  } else if (minEdge < 0) {
    center[1] -= minEdge;
  }

  return center;
};

function renderOverlay(z, x, y, bearing, pitch, w, h, scale, path, query) {
  if (!path || path.length < 2) {
    return null;
  }

  const center = georeferenceMapCenter(x, y, z, h);

  const canvas = createCanvas(scale * w, scale * h);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  if (bearing) {
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-bearing / 180) * Math.PI);
    ctx.translate(-center[0], -center[1]);
  } else {
    // optimized path
    ctx.translate(-center[0] + w / 2, -center[1] + h / 2);
  }
  const lineWidth = query.width !== undefined ? parseFloat(query.width) : 1;
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = query.stroke || "rgba(0,64,255,0.7)";
  ctx.fillStyle = query.fill || "rgba(255,255,255,0.4)";
  ctx.beginPath();
  for (const pair of path) {
    const px = precisePx(pair, z);
    ctx.lineTo(px[0], px[1]);
  }
  if (path[0][0] === path[path.length - 1][0] && path[0][1] === path[path.length - 1][1]) {
    ctx.closePath();
  }
  ctx.fill();
  if (lineWidth > 0) {
    ctx.stroke();
  }

  return canvas.toBuffer();
}

function renderMarkersOverlay(z, x, y, bearing, pitch, w, h, scale, markerList) {
  if (!markerList || !markerList.length) {
    return null;
  }

  const center = georeferenceMapCenter(x, y, z, h);

  const canvas = createCanvas(scale * w, scale * h);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  if (bearing) {
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-bearing / 180) * Math.PI);
    ctx.translate(-center[0], -center[1]);
  } else {
    ctx.translate(-center[0] + w / 2, -center[1] + h / 2);
  }

  for (let marker of markerList) {
    const location = precisePx([marker.x, marker.y], z);

    ctx.drawImage(
      marker.image,
      location[0] - marker.image.width / 2,
      location[1] - marker.image.height / 2,
      marker.image.width,
      marker.image.height
    );
  }

  return canvas.toBuffer();
}

function calcZForBBox(bbox, w, h, query) {
  let z = 25;

  const padding = query.padding !== undefined ? parseFloat(query.padding) : 0.1;

  const minCorner = mercator.px([bbox[0], bbox[3]], z),
    maxCorner = mercator.px([bbox[2], bbox[1]], z);
  const w_ = w / (1 + 2 * padding);
  const h_ = h / (1 + 2 * padding);

  z -=
    Math.max(
      Math.log((maxCorner[0] - minCorner[0]) / w_),
      Math.log((maxCorner[1] - minCorner[1]) / h_)
    ) / Math.LN2;

  z = Math.max(Math.log(Math.max(w, h) / 256) / Math.LN2, Math.min(25, z));

  return z / 1.015;
}

module.exports = function (options) {
  // Returns a sharp image
  async function renderMapImage(item, z, lon, lat, bearing, pitch, width, height, scale) {
    if (Math.abs(lon) > 180 || Math.abs(lat) > 85.06 || lon !== lon || lat !== lat) {
      throw new BadRequestError("Invalid center");
    }

    if (
      Math.min(width, height) <= 0 ||
      Math.max(width, height) * scale > (options.maxSize || 2048) ||
      width !== width ||
      height !== height
    ) {
      throw new BadRequestError("Invalid size");
    }

    const pool = item.renderers[scale];

    const renderer = await new Promise((resolve, reject) => {
      pool.acquire((err, renderer) => (err ? reject(err) : resolve(renderer)));
    });

    const mbglZ = Math.max(0, z - 1);
    const params = {
      zoom: mbglZ,
      center: [lon, lat],
      bearing: bearing,
      pitch: pitch,
      width: width,
      height: height,
    };

    if (z === 0) {
      params.width *= 2;
      params.height *= 2;
    }

    const tileMargin = Math.max(options.tileMargin || 0, 0);
    if (z > 2 && tileMargin > 0) {
      params.width += tileMargin * 2;
      params.height += tileMargin * 2;
    }

    const data = await new Promise((resolve, reject) => {
      renderer.render(params, (err, data) => {
        err ? reject(err) : resolve(data);
      });
    });
    pool.release(renderer);

    // Fix semi-transparent outlines on raw, premultiplied input
    // https://github.com/maptiler/tileserver-gl/issues/350#issuecomment-477857040
    for (var i = 0; i < data.length; i += 4) {
      var alpha = data[i + 3];
      var norm = alpha / 255;
      if (alpha === 0) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      } else {
        data[i] = data[i] / norm;
        data[i + 1] = data[i + 1] / norm;
        data[i + 2] = data[i + 2] / norm;
      }
    }

    const image = sharp(data, {
      raw: {
        width: params.width * scale,
        height: params.height * scale,
        channels: 4,
      },
    });

    if (z > 2 && tileMargin > 0) {
      image.extract({
        left: tileMargin * scale,
        top: tileMargin * scale,
        width: width * scale,
        height: height * scale,
      });
    }

    if (z === 0) {
      // HACK: when serving zoom 0, resize the 0 tile from 512 to 256
      image.resize(width * scale, height * scale);
    }

    return image;
  }

  function renderWatermarkOverlay(watermark, width, height, scale) {
    const canvas = createCanvas(scale * width, scale * height);
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.font = "10px sans-serif";
    ctx.strokeWidth = "1px";
    ctx.strokeStyle = "rgba(255,255,255,.4)";
    ctx.strokeText(watermark, 5, height - 5);
    ctx.fillStyle = "rgba(0,0,0,.4)";
    ctx.fillText(watermark, 5, height - 5);

    return canvas.toBuffer();
  }

  function formatImage(image, format) {
    const formatQuality = (options.formatQuality || {})[format];

    if (format === "png") {
      return image.png({ adaptiveFiltering: false });
    } else if (format === "jpeg") {
      return image.jpeg({ quality: formatQuality || 80 });
    } else if (format === "webp") {
      return image.webp({ quality: formatQuality || 90 });
    } else {
      throw new BadRequestError("Bad image format");
    }
  }

  async function renderRoute(req, res) {
    const item = RenderManager.instance.get(req.params.id);

    if (!item) {
      throw new NotFoundError();
    }

    const modifiedSince = req.get("if-modified-since"),
      cc = req.get("cache-control");
    if (modifiedSince && (!cc || cc.indexOf("no-cache") === -1)) {
      if (new Date(item.lastModified) <= new Date(modifiedSince)) {
        return res.sendStatus(304);
      }
    }

    const z = req.params.z | 0,
      x = req.params.x | 0,
      y = req.params.y | 0,
      scale = getScale(req.params.scale),
      format = RenderManager.formats[req.params.format];
    if (z < 0 || x < 0 || y < 0 || z > 22 || x >= Math.pow(2, z) || y >= Math.pow(2, z)) {
      throw new NotFoundError("Out of bounds");
    }
    const tileSize = 256;
    const tileCenter = mercator.ll(
      [((x + 0.5) / (1 << z)) * (256 << z), ((y + 0.5) / (1 << z)) * (256 << z)],
      z
    );

    let image = await renderMapImage(
      item,
      z,
      tileCenter[0],
      tileCenter[1],
      0,
      0,
      tileSize,
      tileSize,
      scale
    );

    if (item.watermark) {
      const watermark = renderWatermarkOverlay(item.watermark, tileSize, tileSize, scale);
      image = image.composite([{ input: watermark }]);
    }

    const imageOutput = formatImage(image, format);

    const buffer = await imageOutput.toBuffer();

    if (!buffer) {
      throw new NotFoundError();
    }

    res.set({
      "Last-Modified": item.lastModified,
      "Content-Type": `image/${format}`,
    });
    res.status(200).send(buffer);
  }

  async function renderCenterRoute(req, res) {
    const item = RenderManager.instance.get(req.params.id);

    if (!item) {
      return res.sendStatus(404);
    }

    const raw = req.params.raw;
    let z = +req.params.z,
      x = +req.params.x,
      y = +req.params.y,
      bearing = +(req.params.bearing || "0"),
      pitch = +(req.params.pitch || "0"),
      w = req.params.width | 0,
      h = req.params.height | 0,
      scale = getScale(req.params.scale),
      format = RenderManager.formats[req.params.format];

    if (z < 0) {
      throw new NotFoundError("Invalid zoom");
    }

    const transformer = raw ? mercator.inverse.bind(mercator) : item.dataProjWGStoInternalWGS;

    if (transformer) {
      const ll = transformer([x, y]);
      x = ll[0];
      y = ll[1];
    }

    const path = extractPathFromQuery(req.query, transformer);
    const overlay = renderOverlay(z, x, y, bearing, pitch, w, h, scale, path, req.query);

    let image = await renderMapImage(item, z, x, y, 0, 0, w, h, scale);

    if (overlay) {
      image = image.composite([{ input: overlay }]);
    }

    if (item.watermark) {
      const watermark = renderWatermarkOverlay(item.watermark, w, h, scale);
      image = image.composite([{ input: watermark }]);
    }

    const imageOutput = formatImage(image, format);

    const buffer = await imageOutput.toBuffer();

    if (!buffer) {
      throw new NotFoundError();
    }

    res.set({
      "Last-Modified": item.lastModified,
      "Content-Type": `image/${format}`,
    });
    res.status(200).send(buffer);
  }

  async function renderBoundsRoute(req, res) {
    const { id } = req.params;
    const item = RenderManager.instance.get(id);

    if (!item) {
      return res.sendStatus(404);
    }

    const raw = req.params.raw;
    const bbox = [+req.params.minx, +req.params.miny, +req.params.maxx, +req.params.maxy];
    let center = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];

    const transformer = raw ? mercator.inverse.bind(mercator) : item.dataProjWGStoInternalWGS;

    if (transformer) {
      const minCorner = transformer(bbox.slice(0, 2));
      const maxCorner = transformer(bbox.slice(2));
      bbox[0] = minCorner[0];
      bbox[1] = minCorner[1];
      bbox[2] = maxCorner[0];
      bbox[3] = maxCorner[1];
      center = transformer(center);
    }

    const w = req.params.width | 0,
      h = req.params.height | 0,
      scale = getScale(req.params.scale),
      format = RenderManager.formats[req.params.format];

    const z = calcZForBBox(bbox, w, h, req.query),
      x = center[0],
      y = center[1],
      bearing = 0,
      pitch = 0;

    const path = extractPathFromQuery(req.query, transformer);
    const overlay = renderOverlay(z, x, y, bearing, pitch, w, h, scale, path, req.query);

    let image = await renderMapImage(item, z, x, y, 0, 0, w, h, scale);

    if (overlay) {
      image = image.composite([{ input: overlay }]);
    }

    if (item.watermark) {
      const watermark = renderWatermarkOverlay(item.watermark, w, h, scale);
      image = image.composite([{ input: watermark }]);
    }

    const imageOutput = formatImage(image, format);

    const buffer = await imageOutput.toBuffer();

    if (!buffer) {
      throw new NotFoundError();
    }

    res.set({
      "Last-Modified": item.lastModified,
      "Content-Type": `image/${format}`,
    });
    res.status(200).send(buffer);
  }

  async function renderMarkersRoute(req, res) {
    const { id } = req.params;
    const item = RenderManager.instance.get(id);

    if (!item) {
      return res.sendStatus(404);
    }

    let w = req.params.width | 0,
      h = req.params.height | 0,
      z = req.params.z,
      x = +req.params.x,
      y = +req.params.y,
      bearing = +(req.params.bearing || "0"),
      pitch = +(req.params.pitch || "0"),
      scale = getScale(req.params.scale),
      format = RenderManager.formats[req.params.format];

    const markerList = markers.parse(req.params.overlay);

    const bbox = [Infinity, Infinity, -Infinity, -Infinity];

    for (const marker of markerList) {
      bbox[0] = Math.min(bbox[0], marker.x);
      bbox[1] = Math.min(bbox[1], marker.y);
      bbox[2] = Math.max(bbox[2], marker.x);
      bbox[3] = Math.max(bbox[3], marker.y);
    }

    const bbox_ = mercator.convert(bbox, "900913");
    const center = mercator.inverse([(bbox_[0] + bbox_[2]) / 2, (bbox_[1] + bbox_[3]) / 2]);

    if (z === "auto") {
      z = calcZForBBox(bbox, w, h, req.query);
      x = center[0];
      y = center[1];

      z = Math.min(z, 17);
    } else {
      z = +z;
    }

    const markerFetchStart = new Date();
    const fetchedMarkersList = await Promise.all(
      markerList.map((m) => {
        return markers.fetch(m).catch((e) => {
          metrics.markerErrorCounter.inc();
          log.error(e);
        });
      })
    );
    metrics.markerRequestDurationMillisecondsSummary.observe(new Date() - markerFetchStart);

    const overlay = renderMarkersOverlay(
      z,
      x,
      y,
      bearing,
      pitch,
      w,
      h,
      scale,
      fetchedMarkersList.filter(Boolean)
    );

    let image = await renderMapImage(item, z, x, y, 0, 0, w, h, scale);

    image = image.composite([{ input: overlay }]);

    if (item.watermark) {
      const watermark = renderWatermarkOverlay(item.watermark, w, h, scale);
      image = image.composite([{ input: watermark }]);
    }

    const imageOutput = formatImage(image, format);

    const buffer = await imageOutput.toBuffer();

    if (!buffer) {
      throw new NotFoundError();
    }

    res.set({
      "Last-Modified": item.lastModified,
      "Content-Type": `image/${format}`,
    });
    res.status(200).send(buffer);
  }

  function renderStaticRoute(req, res) {
    for (let key in req.query) {
      req.query[key.toLowerCase()] = req.query[key];
    }
    req.params.raw = true;
    req.params.format = (req.query.format || "image/png").split("/").pop();
    const bbox = (req.query.bbox || "").split(",");
    req.params.minx = bbox[0];
    req.params.miny = bbox[1];
    req.params.maxx = bbox[2];
    req.params.maxy = bbox[3];
    req.params.width = req.query.width || "256";
    req.params.height = req.query.height || "256";
    if (req.query.scale) {
      req.params.width /= req.query.scale;
      req.params.height /= req.query.scale;
      req.params.scale = `@${req.query.scale}`;
    }

    return renderBoundsRoute(req, res);
  }

  async function renderAutoRoute(req, res) {
    const { id } = req.params;
    const item = RenderManager.instance.get(id);

    if (!item) {
      throw new NotFoundError();
    }

    const raw = req.params.raw;
    const w = req.params.width | 0,
      h = req.params.height | 0,
      bearing = 0,
      pitch = 0,
      scale = getScale(req.params.scale),
      format = RenderManager.formats[req.params.format];

    const transformer = raw ? mercator.inverse.bind(mercator) : item.dataProjWGStoInternalWGS;

    const path = extractPathFromQuery(req.query, transformer);
    if (path.length < 2) {
      throw new BadRequestError("Invalid path");
    }

    const bbox = [Infinity, Infinity, -Infinity, -Infinity];
    for (const pair of path) {
      bbox[0] = Math.min(bbox[0], pair[0]);
      bbox[1] = Math.min(bbox[1], pair[1]);
      bbox[2] = Math.max(bbox[2], pair[0]);
      bbox[3] = Math.max(bbox[3], pair[1]);
    }

    const bbox_ = mercator.convert(bbox, "900913");
    const center = mercator.inverse([(bbox_[0] + bbox_[2]) / 2, (bbox_[1] + bbox_[3]) / 2]);

    const z = calcZForBBox(bbox, w, h, req.query),
      x = center[0],
      y = center[1];

    const overlay = renderOverlay(z, x, y, bearing, pitch, w, h, scale, path, req.query);

    let image = await renderMapImage(item, z, x, y, 0, 0, w, h, scale);

    if (overlay) {
      image = image.composite([{ input: overlay }]);
    }

    if (item.watermark) {
      const watermark = renderWatermarkOverlay(item.watermark, w, h, scale);
      image = image.composite([{ input: watermark }]);
    }

    const imageOutput = formatImage(image, format);

    const buffer = await imageOutput.toBuffer();

    if (!buffer) {
      throw new NotFoundError();
    }

    res.set({
      "Last-Modified": item.lastModified,
      "Content-Type": `image/${format}`,
    });
    res.status(200).send(buffer);
  }

  function getStyle(req, res) {
    const item = RenderManager.instance.get(req.params.id);

    if (!item) {
      throw new NotFoundError();
    }

    const info = item.tileJSON;
    const tiles = utils.getTileUrls(
      req,
      info.tiles,
      `styles/${req.params.id}`,
      info.format,
      item.publicUrl
    );

    return res.send(Object.assign({}, item.tileJSON, { tiles }));
  }

  const routes = new Router();
  const scalePattern = RenderManager.scalePattern(options.maxScaleFactor);

  routes.get(
    `/:id/:z(\\d+)/:x(\\d+)/:y(\\d+):scale(${scalePattern})?.:format([\\w]+)`,
    asyncRoute(renderRoute)
  );
  routes.get(
    `/:id/static/:raw(raw)?/${centerPattern}/:width(\\d+)x:height(\\d+):scale(${scalePattern})?.:format([\\w]+)`,
    asyncRoute(renderCenterRoute)
  );
  routes.get(
    `/:id/static/:raw(raw)?/${boundsPattern}/:width(\\d+)x:height(\\d+):scale(${scalePattern})?.:format([\\w]+)`,
    asyncRoute(renderBoundsRoute)
  );
  routes.get(
    `/:id/static/:raw(raw)?/${autoPattern}/:width(\\d+)x:height(\\d+):scale(${scalePattern})?.:format([\\w]+)`,
    asyncRoute(renderAutoRoute)
  );
  routes.get(
    `/:id/static/:overlay(pin-[^/]+)/${autoPattern}/:width(\\d+)x:height(\\d+):scale(${scalePattern})?.:format([\\w]+)`,
    asyncRoute(renderMarkersRoute)
  );
  routes.get("/:id/static", asyncRoute(renderStaticRoute));
  routes.get("/:id.json", asyncRoute(getStyle));

  return routes;
};
