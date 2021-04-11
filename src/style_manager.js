const fs = require('fs').promises;
const { validate } = require('@mapbox/mapbox-gl-style-spec');

const httpTester = /^(http(s)?:)?\/\//;

class StyleManager {
  constructor(options) {
    this.options = options;
    this.stylesPath = options.paths.styles;
    this.repo = {};
  }

  get(id) {
    return this.repo[id];
  }

  remove(id) {
    delete this.repo[id];
  }

  async add(item, id, reportTiles, reportFont) {
    const styleFile = path.resolve(this.stylesPath, item.style);

    let styleFileData;
    try {
      styleFileData = await fs.readFile(styleFile);
    } catch (e) {
      console.log('Error reading style file');
      return false;
    }

    let validationErrors = validate(styleFileData);
    if (validationErrors.length > 0) {
      console.log(`The file "${item.style}" is not valid a valid style file:`);
      for (const err of validationErrors) {
        console.log(`${err.line}: ${err.message}`);
      }
      return false;
    }

    let styleJSON = JSON.parse(styleFileData);

    for (const name of Object.keys(styleJSON.sources)) {
      const source = styleJSON.sources[name];
      const url = source.url;
      if (url && url.lastIndexOf('mbtiles:', 0) === 0) {
        let mbtilesFile = url.substring('mbtiles://'.length);
        const fromData = mbtilesFile[0] === '{' &&
          mbtilesFile[mbtilesFile.length - 1] === '}';

        if (fromData) {
          mbtilesFile = mbtilesFile.substr(1, mbtilesFile.length - 2);
          const mapsTo = (item.mapping || {})[mbtilesFile];
          if (mapsTo) {
            mbtilesFile = mapsTo;
          }
        }
        const identifier = reportTiles(mbtilesFile, fromData);
        if (!identifier) {
          return false;
        }
        source.url = `local://data/${identifier}.json`;
      }
    }

    for (let obj of styleJSON.layers) {
      if (obj['type'] === 'symbol') {
        const fonts = (obj['layout'] || {})['text-font'];
        if (fonts && fonts.length) {
          fonts.forEach(reportFont);
        } else {
          reportFont('Open Sans Regular');
          reportFont('Arial Unicode MS Regular');
        }
      }
    }

    let spritePath;

    if (styleJSON.sprite && !httpTester.test(styleJSON.sprite)) {
      spritePath = path.join(options.paths.sprites,
        styleJSON.sprite
          .replace('{style}', path.basename(styleFile, '.json'))
          .replace('{styleJsonFolder}', path.relative(options.paths.sprites, path.dirname(styleFile)))
      );
      styleJSON.sprite = `local://styles/${id}/sprite`;
    }

    if (styleJSON.glyphs && !httpTester.test(styleJSON.glyphs)) {
      styleJSON.glyphs = 'local://fonts/{fontstack}/{range}.pbf';
    }

    for (const layer of (styleJSON.layers || [])) {
      if (layer && layer.paint) {
        // Remove (flatten) 3D buildings
        if (layer.paint['fill-extrusion-height']) {
          layer.paint['fill-extrusion-height'] = 0;
        }
        if (layer.paint['fill-extrusion-base']) {
          layer.paint['fill-extrusion-base'] = 0;
        }
      }
    }

    this.repo[id] = {
      styleJSON,
      spritePath,
      name: styleJSON.name
    };

    return true;
  }
}
