const zlib = require('zlib');
const util = require('util');
const DataManager = require('../managers/data');
const { Router } = require('express');

const unzip = util.promisify(zlib.unzip);

module.exports = function(options) {
  async function dataCoordinatesRoute(req, res, next) {
    const item = DataManager.instance.get(req.params.id);

    if (!item) {
      return res.sendStatus(404);
    }

    let tileJSONFormat = item.tileJSON.format;

    const z = req.params.z | 0;
    const x = req.params.x | 0;
    const y = req.params.y | 0;

    let format = req.params.format;
    if (format === options.pbfAlias) {
      format = 'pbf';
    }

    if (format !== tileJSONFormat &&
        !(format === 'geojson' && tileJSONFormat === 'pbf')) {
      return res.status(404).send('Invalid format');
    }

    if (z < item.tileJSON.minzoom || 0 || x < 0 || y < 0 ||
        z > item.tileJSON.maxzoom ||
        x >= Math.pow(2, z) || y >= Math.pow(2, z)) {
      return res.status(404).send('Out of bounds');
    }

    try {
      const { data, headers } = await item.source.getTile(z, x, y);

      if (data == null) {
        return res.status(404).send('Not found');
      }

      let isGzipped = false;
      if (tileJSONFormat === 'pbf') {
        isGzipped = data.slice(0, 2).indexOf(
          Buffer.from([0x1f, 0x8b])) === 0;
        if (options.dataDecoratorFunc) {
          if (isGzipped) {
            data = await unzip(data);
            isGzipped = false;
          }
          data = options.dataDecoratorFunc(req.params.id, 'data', data, z, x, y);
        }
      }

      if (format === 'pbf') {
        headers['Content-Type'] = 'application/x-protobuf';
      } else if (format === 'geojson') {
        headers['Content-Type'] = 'application/json';

        if (isGzipped) {
          data = await unzip(data);
          isGzipped = false;
        }

        const tile = new VectorTile(new Pbf(data));
        const geojson = {
          "type": "FeatureCollection",
          "features": []
        };

        for (let layerName in tile.layers) {
          const layer = tile.layers[layerName];
          for (let i = 0; i < layer.length; i++) {
            const feature = layer.feature(i);
            const featureGeoJSON = feature.toGeoJSON(x, y, z);
            featureGeoJSON.properties.layer = layerName;
            geojson.features.push(featureGeoJSON);
          }
        }
        data = JSON.stringify(geojson);
      }

      delete headers['ETag']; // do not trust the tile ETag -- regenerate
      headers['Content-Encoding'] = 'gzip';
      res.set(headers);

      if (!isGzipped) {
        data = zlib.gzipSync(data);
        isGzipped = true;
      }

      return res.status(200).send(data);
    } catch (err) {
      if (/does not exist/.test(err.message)) {
        return res.status(204).send();
      } else {
        return res.status(500).send(err.message);
      }
    }

    item.source.getTile(z, x, y, (err, data, headers) => {
      let isGzipped;
      if (err) {
        if (/does not exist/.test(err.message)) {
          return res.status(204).send();
        } else {
          return res.status(500).send(err.message);
        }
      } else {
        if (data == null) {
          return res.status(404).send('Not found');
        } else {
          if (tileJSONFormat === 'pbf') {
            isGzipped = data.slice(0, 2).indexOf(
              Buffer.from([0x1f, 0x8b])) === 0;
            if (options.dataDecoratorFunc) {
              if (isGzipped) {
                data = zlib.unzipSync(data);
                isGzipped = false;
              }
              data = options.dataDecoratorFunc(id, 'data', data, z, x, y);
            }
          }
          if (format === 'pbf') {
            headers['Content-Type'] = 'application/x-protobuf';
          } else if (format === 'geojson') {
            headers['Content-Type'] = 'application/json';

            if (isGzipped) {
              data = zlib.unzipSync(data);
              isGzipped = false;
            }

            const tile = new VectorTile(new Pbf(data));
            const geojson = {
              "type": "FeatureCollection",
              "features": []
            };
            for (let layerName in tile.layers) {
              const layer = tile.layers[layerName];
              for (let i = 0; i < layer.length; i++) {
                const feature = layer.feature(i);
                const featureGeoJSON = feature.toGeoJSON(x, y, z);
                featureGeoJSON.properties.layer = layerName;
                geojson.features.push(featureGeoJSON);
              }
            }
            data = JSON.stringify(geojson);
          }
          delete headers['ETag']; // do not trust the tile ETag -- regenerate
          headers['Content-Encoding'] = 'gzip';
          res.set(headers);

          if (!isGzipped) {
            data = zlib.gzipSync(data);
            isGzipped = true;
          }

          return res.status(200).send(data);
        }
      }
    });
  }

  async function dataRoute(req, res, next) {
    const { id } = req.params;
    const item = DataManager.instance.get(id);

    if (!item) {
      return res.sendStatus(404);
    }

    const info = Object.assign({}, item.tileJSON);
    info.tiles = utils.getTileUrls(req, info.tiles, `data/${id}`, info.format,
                                   options.publicUrl, { 'pbf': options.pbfAlias });
    return res.send(info);
  }

  const routes = new Router();
  routes.get('/:id.json', dataRoute);
  routes.get('/:id/:z(\\d+)/:x(\\d+)/:y(\\d+).:format([\\w.]+)', dataCoordinatesRoute);

  return routes;
}
