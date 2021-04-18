const fs = require('fs').promises;
const path = require('path');
const { validate } = require('@mapbox/mapbox-gl-style-spec');

const httpTester = /^(http(s)?:)?\/\//;

function onlyUnique(value, index, self) {
  return self.indexOf(value) === index;
}

function flatten(a, b) {
  return a.concat(b);
}

class StyleManager {
  constructor(options) {
    const { styles, sprites, root } = options.paths;
    this.stylesPath = path.resolve(root || '', styles || 'styles');
    this.spritesPath = path.resolve(root || '', sprites || 'sprites');
    this.foundFontNames = [];

    this.styles = {};
    this.foundMbtilesData = {};
  }

  static async init(options, styles) {
    const manager = new StyleManager(options);

    await Promise.all(Object.keys(styles).map(id => {
      const item = styles[id];
      if (!item.style || item.style.length === 0) {
        console.log(`Missing "style" property for ${id}`);
        return;
      }

      return manager.add(item, id);
    }).filter(Boolean));

    StyleManager.instance = manager;
    return manager;
  }

  get fontsList() {
    return Object.values(this.styles).map(style => style.fontList).reduce(flatten, []);
  }

  get sourcesList() {
    return Object.values(this.styles).map(style => style.sourceList).reduce(flatten, []);
  }

  allTiles() {
    return Object.entries(this.styles).map(([id, item]) => [id, item.tileJSON]);
  }

  get(id) {
    return this.styles[id];
  }

  remove(id) {
    delete this.styles[id];
  }

  async add(item, id) {
    const style = await this.parse(item, id);

    this.styles[id] = style;
    return style;
  }

  lookupSource(url, mapping={}, allowNewSource) {
    if (!(url && url.startsWith('mbtiles:'))) {
      return false;
    }

    let mbtilesFile = url.substring('mbtiles://'.length);
    const fromData = mbtilesFile.startsWith('{') && mbtilesFile.endsWith('}');

    if (fromData) {
      mbtilesFile = mbtilesFile.substr(1, mbtilesFile.length - 2);
      const mapsTo = (item.mapping || {})[mbtilesFile];
      if (mapsTo) {
        mbtilesFile = mapsTo;
      }
    }

    const existing = this.foundMbtilesData(mbtilesFile);
  }

  async parse(item, id) {
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
    const sourceList = Object.entries(styleJSON.sources)
                             .map(([name, source]) => { return { name, source, mapping: item.mapping }; });

    const fontList = styleJSON.layers
                              .filter(obj => obj.type === 'symbol')
                              .map(obj => (obj['layout'] || {})['text-font'])
                              .reduce(flatten, [])
                              .filter(onlyUnique);

    if (!fontList.length) {
      fontList.push('Open Sans Regular');
      fontList.push('Arial Unicode MS Regular');
    }

    let spritePath;

    if (styleJSON.sprite && !httpTester.test(styleJSON.sprite)) {
      spritePath = path.join(this.spritesPath,
        styleJSON.sprite
          .replace('{style}', path.basename(styleFile, '.json'))
          .replace('{styleJsonFolder}', path.relative(this.spritesPath, path.dirname(styleFile)))
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

    return {
      styleJSON,
      spritePath,
      fontList,
      sourceList,
      name: styleJSON.name
    };
  }
}

module.exports = StyleManager;
