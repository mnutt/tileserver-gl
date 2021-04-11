const { URL }= require('url');
const FontManager = require('./font_manager');
const StyleManager = require('./style_manager');

async function requestSprites(url, paths) {
  const dir = paths.sprites;
  const file = unescape(url).substring(protocol.length + 3);
  const data = await fs.readFile(path.join(dir, file));
  return { data };
}

async function requestFonts(url) {
  const parts = url.split('/');
  const fontstack = unescape(parts[2]);
  const range = parts[3].split('.')[0];

  const concated = await FontManager.instance.getFontsPbf(fontstack, range);
  return { data: concated };
}

async function requestMbtiles(url) {
  const parts = url.split('/');
  const sourceId = parts[2];
  const { source } = DataManager.instance.get(sourceId);

  const z = parts[3] | 0,
        x = parts[4] | 0,
        y = parts[5].split('.')[0] | 0,
        format = parts[5].split('.')[1];

  try {
    const { data, headers } = await source.getTile(z, x, y);

    const response = {};
    if (headers['Last-Modified']) {
      response.modified = new Date(headers['Last-Modified']);
    }

    if (format === 'pbf') {
      try {
        response.data = await unzip(data);
      } catch (err) {
        console.log("Skipping incorrect header for tile mbtiles://%s/%s/%s/%s.pbf", id, z, x, y);
      }

      if (options.dataDecoratorFunc) {
        response.data = options.dataDecoratorFunc(
          sourceId, 'data', response.data, z, x, y);
      }
    } else {
      response.data = data;
    }

    return response;
  } catch (err) {
    const sourceInfo = StyleManager.instance.get(sourceId).styleJSON;
    console.log('MBTiles error, serving empty', err);
    return createEmptyResponse(sourceInfo.format, sourceInfo.color);
  }
}

async function requestUrl(url) {
  try {
    const { res, body } = await new Promise((resolve, reject) => {
      request({
        url,
        encoding: null,
        gzip: true
      }, (err, res, body) => {
        if (err || res.statusCode < 200 || res.statusCode >= 300) {
          reject(err || `http ${res.statusCode}`);
        } else {
          resolve({ res, body });
        }
      });
    });

    const parts = new URL(url);
    const extension = path.extname(parts.pathname).toLowerCase();
    const format = extensionToFormat[extension] || '';

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
  } catch(err) {
    return createEmptyResponse(format, '', callback);
  }
}

class RenderManager {
  constructor() {
    this.repo = {};
  }

  get(id) {
    return this.repo[id];
  }

  remove(id) {
    let mapRenderer = this.get(id);
    if (mapRenderer) {
      mapRenderer.renderers.forEach(pool => pool.close());
    }
    delete this.repo[id];
  }

  async add(item, id, dataResolver) {
    const styleJSON = StyleManager.instance.get(item.style).styleJSON;

    function requestMap(url) {
      const protocol = url.split(':')[0];

      if (protocol === 'sprites') {
        return requestSprites(url, paths);
      } else if (protocol === 'fonts') {
        return requestFonts(url);
      } else if (protocol === 'mbtiles') {
        return requestMbtiles(url, map, styleJSON);
      } else if (protocol === 'http' || protocol === 'https') {
        return requestUrl(url);
      }
    }

    const createPool = (ratio, min, max) => {
      const createRenderer = (ratio, createCallback) => {
        const renderer = new mbgl.Map({
          mode: "tile",
          ratio: ratio,
          request: (req, callback) => {
            requestMap(req.url)
              .then((data) => callback(null, data))
              .catch((err) => callback(err, null));
          }
        });

        renderer.load(styleJSON);
        createCallback(null, renderer);
      };

      return new advancedPool.Pool({
        min: min,
        max: max,
        create: createRenderer.bind(null, ratio),
        destroy: renderer => {
          renderer.release();
        }
      });
    };

    const minPoolSizes = this.options.minRendererPoolSizes || [8, 4, 2];
    const maxPoolSizes = this.options.maxRendererPoolSizes || [16, 8, 4];
    for (let s = 1; s <= maxScaleFactor; s++) {
      const i = Math.min(minPoolSizes.length - 1, s - 1);
      const j = Math.min(maxPoolSizes.length - 1, s - 1);
      const minPoolSize = minPoolSizes[i];
      const maxPoolSize = Math.max(minPoolSize, maxPoolSizes[j]);
      map.renderers[s] = createPool(s, minPoolSize, maxPoolSize);
    }

    const tileJSON = {
      'tilejson': '2.0.0',
      'name': styleJSON.name,
      'attribution': '',
      'minzoom': 0,
      'maxzoom': 20,
      'bounds': [-180, -85.0511, 180, 85.0511],
      'format': 'png',
      'type': 'baselayer'
    };

    const attributionOverride = item.tilejson && item.tilejson.attribution;
    Object.assign(tileJSON, item.tilejson || {});
    tileJSON.tiles = item.domains || this.options.domains;
    utils.fixTileJSONCenter(tileJSON);

    const sources = Object.values(tileJSON.sources).map(originalSource => {
      const source = Object.assign({}, originalSource);

      const url = source.url;

      if (url && url.lastIndexOf('mbtiles:', 0) === 0) {
        // found mbtiles source, replace with info from local file
        delete source.url;
      }
    });

    const renderers = [];
    const minPoolSizes = this.options.minRendererPoolSizes || [8, 4, 2];
    const maxPoolSizes = this.options.maxRendererPoolSizes || [16, 8, 4];
    for (let s = 1; s <= maxScaleFactor; s++) {
      const i = Math.min(minPoolSizes.length - 1, s - 1);
      const j = Math.min(maxPoolSizes.length - 1, s - 1);
      const minPoolSize = minPoolSizes[i];
      const maxPoolSize = Math.max(minPoolSize, maxPoolSizes[j]);
      renderers[s] = createPool(s, minPoolSize, maxPoolSize);
    }

    const mapRenderer = {
      tileJSON,
      renderers,
      dataProjWGStoInternalWGS: null,
      lastModified: new Date().toUTCString(),
      watermark: item.watermark || this.options.watermark
    };

    this.repo[id] = mapRenderer;
  }
}
