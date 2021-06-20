const { URL } = require("url");
const FontManager = require("./font");
const StyleManager = require("./style");
const DataManager = require("./data");
const advancedPool = require("advanced-pool");
const mbgl = require("@mapbox/mapbox-gl-native");
const utils = require("../utils");
const fs = require("fs").promises;
const path = require("path");
const zlib = require("zlib");
const util = require("util");
const Color = require("color");
const sharp = require("sharp");
const request = require("request");
const metrics = require("../metrics");
const log = require("../log");

const unzip = util.promisify(zlib.unzip);

async function requestSprites(url) {
  const protocol = url.split(":")[0];
  const file = unescape(url).slice(protocol.length + 3);
  const data = await fs.readFile(file);
  return { data };
}

async function requestFonts(url) {
  const parts = url.split("/");
  const fontstack = unescape(parts[2]);
  const range = parts[3].split(".")[0];

  const concated = await FontManager.instance.getFontsPbf(fontstack, range);
  return { data: concated };
}

/**
 * Cache of response data by sharp output format and color.  Entry for empty
 * string is for unknown or unsupported formats.
 */
const cachedEmptyResponses = {
  "": Buffer.alloc(0),
};

/**
 * Create an appropriate mbgl response for http errors.
 * @param {string} format The format (a sharp format or 'pbf').
 * @param {string} color The background color (or empty string for transparent).
 * @param {Function} callback The mbgl callback.
 */
async function createEmptyResponse(format, color) {
  if (!format || format === "pbf") {
    return { data: cachedEmptyResponses[""] };
  }

  if (format === "jpg") {
    format = "jpeg";
  }

  if (!color) {
    color = "rgba(255,255,255,0)";
  }

  const cacheKey = `${format},${color}`;
  const data = cachedEmptyResponses[cacheKey];
  if (data) {
    return { data: data };
  }

  // create an "empty" response image
  color = new Color(color);
  const array = color.array();
  const channels = array.length === 4 && format !== "jpeg" ? 4 : 3;

  const input = {
    raw: {
      width: 1,
      height: 1,
      channels: channels,
    },
  };

  try {
    const buffer = await sharp(Buffer.from(array), input).toFormat(format).toBuffer();

    cachedEmptyResponses[cacheKey] = buffer;
    return { data: buffer };
  } catch (_e) {
    return { data: null };
  }
}

async function requestMbtiles(url, decoratorFunc) {
  const parts = url.split("/");
  let sourceId = parts[2];
  const data = DataManager.instance.get(sourceId);
  if (!data) {
    throw new Error(`Missing data: ${sourceId}`);
  }
  const { source } = data;

  const z = parts[3] | 0,
    x = parts[4] | 0,
    y = parts[5].split(".")[0] | 0,
    format = parts[5].split(".")[1];

  try {
    const { data, headers } = await source.getTile(z, x, y);

    const response = {};
    if (headers["Last-Modified"]) {
      response.modified = new Date(headers["Last-Modified"]);
    }

    if (format === "pbf") {
      try {
        response.data = await unzip(data);
      } catch (err) {
        log.warn(
          `Skipping incorrect header for tile mbtiles://${sourceId}/${z}/${x}/${y}.pbf: ${err.message}`
        );
      }

      if (decoratorFunc) {
        response.data = decoratorFunc(sourceId, "data", response.data, z, x, y);
      }
    } else {
      response.data = data;
    }

    return response;
  } catch (err) {
    const sourceInfo = StyleManager.instance.get(sourceId).styleJSON;
    log.error(`MBTiles error, serving empty: ${err.message}`);
    return createEmptyResponse(sourceInfo.format, sourceInfo.color);
  }
}

async function requestUrl(url) {
  const parts = new URL(url);
  const extension = path.extname(parts.pathname).toLowerCase();
  const format = RenderManager.formats[extension] || "";

  try {
    const { res, body } = await new Promise((resolve, reject) => {
      request(
        {
          url,
          encoding: null,
          gzip: true,
        },
        (err, res, body) => {
          if (err || res.statusCode < 200 || res.statusCode >= 300) {
            reject(err || `http ${res.statusCode}`);
          } else {
            resolve({ res, body });
          }
        }
      );
    });

    const response = {};

    if (res.headers.modified) {
      response.modified = new Date(res.headers.modified);
    }

    if (res.headers.expires) {
      response.expires = new Date(res.headers.expires);
    }

    if (res.headers.etag) {
      response.etag = res.headers.etag;
    }

    response.data = body;
    return response;
  } catch (err) {
    return createEmptyResponse(format, "");
  }
}

class RenderManager {
  constructor(options) {
    this.options = options;
    this.repo = {};
    this.maxScaleFactor = Math.min(Math.floor(options.maxScaleFactor || 3), 9);
  }

  static get formats() {
    return {
      png: "png",
      webp: "webp",
      jpg: "jpeg",
      jpeg: "jpeg",
    };
  }

  static async init(options, styles) {
    const manager = new RenderManager(options);

    await Promise.all(
      Object.keys(styles)
        .map((id) => {
          const item = styles[id];
          if (!item.style || item.style.length == 0) {
            log.error(`Missing "style" property for ${id}`);
            return;
          }
          return manager.add(item, id);
        })
        .filter(Boolean)
    );

    RenderManager.instance = manager;
    return manager;
  }

  get(id) {
    return this.repo[id];
  }

  allTiles() {
    return Object.entries(this.repo).map(([id, renderer]) => [id, renderer.tileJSON]);
  }

  remove(id) {
    let mapRenderer = this.get(id);
    if (mapRenderer) {
      mapRenderer.renderers.forEach((pool) => pool.close());
    }
    delete this.repo[id];
  }

  async add(item, id) {
    const mapRenderer = await this.createMapRenderer(item, id);
    this.repo[id] = mapRenderer;
    return mapRenderer;
  }

  static scalePattern(maxScaleFactor = 3) {
    let scalePattern = "";
    for (let i = 1; i <= maxScaleFactor; i++) {
      scalePattern += i.toFixed();
    }
    return `@[${scalePattern}]x`;
  }

  rewriteStyleSources({ styleJSON, spritePath }) {
    const sources = Object.entries(styleJSON.sources)
      .map(([name, source]) => {
        const { url } = source;

        if (!url.startsWith("mbtiles:")) {
          return false;
        }

        let sourceId = url.slice("mbtiles://".length);

        if (sourceId.startsWith("{") && sourceId.endsWith("}")) {
          sourceId = sourceId.slice(1, -1);
        }

        const data = DataManager.instance.get(sourceId);
        const type = data.tileJSON.format === "pbf" ? "vector" : data.tileJSON.type;

        const tiles = [
          // meta url which will be detected when requested
          `mbtiles://${data.tileJSON.id}/{z}/{x}/{y}.pbf`,
        ];

        return [name, Object.assign({}, data.tileJSON, { tiles, type })];
      })
      .filter(Boolean);

    let { sprite } = styleJSON;
    if (spritePath) {
      sprite = `sprites://${spritePath}`;
    }

    return Object.assign({}, styleJSON, {
      glyphs: "fonts://{fontstack}/{range}.pbf",
      sprite,
      sources: utils.fromEntries(sources),
    });
  }

  async createMapRenderer(item, id) {
    const style = StyleManager.instance.get(id);
    const styleJSON = this.rewriteStyleSources(style);
    const { dataDecoratorFunc } = this.options;

    const renderers = [];

    function requestMap(url) {
      const protocol = url.split(":")[0];

      if (protocol === "sprites") {
        return requestSprites(url);
      } else if (protocol === "fonts") {
        return requestFonts(url);
      } else if (protocol === "mbtiles") {
        return requestMbtiles(url, dataDecoratorFunc);
      } else if (protocol === "http" || protocol === "https") {
        return requestUrl(url);
      } else {
        return Promise.reject(new Error(`Unkown protocol: ${protocol}`));
      }
    }

    const createPool = (ratio, min, max) => {
      const createRenderer = (ratio, createCallback) => {
        const renderer = new mbgl.Map({
          mode: "tile",
          ratio: ratio,
          request: (req, callback) => {
            try {
              requestMap(req.url)
                .then((data) => callback(null, data))
                .catch((err) => callback(err, null));
            } catch (e) {
              metrics.tileErrorCounter.inc();

              log.error(e.message);
            }
          },
        });

        renderer.load(styleJSON);
        createCallback(null, renderer);
      };

      return new advancedPool.Pool({
        min: min,
        max: max,
        create: createRenderer.bind(null, ratio),
        destroy: (renderer) => {
          renderer.release();
        },
      });
    };

    const minPoolSizes = this.options.minRendererPoolSizes || [8, 4, 2];
    const maxPoolSizes = this.options.maxRendererPoolSizes || [16, 8, 4];
    for (let s = 1; s <= this.maxScaleFactor; s++) {
      const i = Math.min(minPoolSizes.length - 1, s - 1);
      const j = Math.min(maxPoolSizes.length - 1, s - 1);
      const minPoolSize = minPoolSizes[i];
      const maxPoolSize = Math.max(minPoolSize, maxPoolSizes[j]);
      renderers[s] = createPool(s, minPoolSize, maxPoolSize);
    }

    const tileJSON = {
      tilejson: "2.0.0",
      name: styleJSON.name,
      attribution: "",
      minzoom: 0,
      maxzoom: 20,
      bounds: [-180, -85.0511, 180, 85.0511],
      format: "png",
      type: "baselayer",
    };

    // TODO: attributionOverride
    // const attributionOverride = item.tilejson && item.tilejson.attribution;

    Object.assign(tileJSON, item.tilejson || {});
    tileJSON.tiles = item.domains || this.options.domains;
    utils.fixTileJSONCenter(tileJSON);

    const mapRenderer = {
      tileJSON,
      renderers,
      dataProjWGStoInternalWGS: null,
      lastModified: new Date().toUTCString(),
      watermark: item.watermark || this.options.watermark,
    };

    return mapRenderer;
  }
}

module.exports = RenderManager;
