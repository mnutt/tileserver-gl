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

async function requestMbtiles(url, decoratorFunc) {
  const parts = url.split("/");
  let sourceId = parts[2];
  const { source } = DataManager.instance.get(sourceId);

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
        console.log(
          "Skipping incorrect header for tile mbtiles://%s/%s/%s/%s.pbf",
          sourceId,
          z,
          x,
          y,
          err
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
    console.log("MBTiles error, serving empty", err);
    return createEmptyResponse(sourceInfo.format, sourceInfo.color);
  }
}

async function requestUrl(url) {
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

    const parts = new URL(url);
    const extension = path.extname(parts.pathname).toLowerCase();
    const format = extensionToFormat[extension] || "";

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
    return createEmptyResponse(format, "", callback);
  }
}

class RenderManager {
  constructor(options) {
    this.options = options;
    this.repo = {};
    this.maxScaleFactor = Math.min(Math.floor(options.maxScaleFactor || 3), 9);
  }

  static async init(options, styles) {
    const manager = new RenderManager(options);

    await Promise.all(
      Object.keys(styles)
        .map((id) => {
          const item = styles[id];
          if (!item.style || item.style.length == 0) {
            console.log(`Missing "style" property for ${id}`);
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
    for (let i = 2; i <= maxScaleFactor; i++) {
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
              console.error(e);
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

    const attributionOverride = item.tilejson && item.tilejson.attribution;
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
