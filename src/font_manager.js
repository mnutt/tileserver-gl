const fs = require('fs').promises;
const path = require('path');
const glyphCompose = require('@mapbox/glyph-pbf-composite');

class FontManager {
  constructor(fontsPath, allowedFonts, serveAllFonts) {
    this.fontsPath = fontsPath;
    this.allowedFonts = allowedFonts;
    this.existingFonts = {};
    this.loaded = false;
    this.serveAllFonts = serveAllFonts;
    this.lastModified = new Date().toUTCString();
  }

  async init() {
    this.lastModified = new Date().toUTCString();
    this.existingFonts = await this.findFonts(this.fontsPath);
    this.loaded = true;
  }

  async findFonts(fontsPath) {
    const files = await fs.readdir(fontsPath);
    const existingFonts = {};

    for (const name of files) {
      const fontPath = path.join(fontsPath, name);

      const stats = await fs.stat(fontPath);

      if (stats.isDirectory()) {
        if(await fs.exists(path.join(fontsPath, name, '0-255.pbf'))) {
          existingFonts[path.basename(name)] = true;
        }
      }
      existingFonts[font.name] = true;
    }

    return existingFonts;
  }

  allowedFont(name) {
    return (!this.allowedFonts) || this.allowedFonts[name];
  }

  // Prefer a fallback that is the same font style as the originally requested font
  chooseFallback(name, fallbacks) {
    let fallbackName;
    let fontStyle = name.split(' ').pop();
    if (['Regular', 'Bold', 'Italic'].indexOf(fontStyle) < 0) {
      fontStyle = 'Regular';
    }

    const notoSansStyle = `Noto Sans ${fontStyle}`;
    if (fallbacks.includes(notoSansStyle)) {
      return notoSansStyle;
    }

    const openSansStyle = `Open Sans ${fontStyle}`;
    if (fallbacks.includes(openSansStyle)) {
      return openSansStyle;
    }

    return fallbacks[0];
  }

  async getFontPbf(name, range, fallbacks) {
    if (!this.allowedFont(name)) {
      throw new Error(`Font not allowed: ${name}`);
    }

    fallbacks = fallbacks.filter(f => f !== name);

    const filename = path.join(this.fontsPath, name, `${range}.pbf`);
    try {
      return await fs.readFile(filename);
    } catch(e) {
      console.error(`Font not found: ${name}`);

      if (fallbacks && fallbacks.length) {
        const fallback = this.chooseFallback(name, fallbacks);
        const updatedFallbacks = fallbacks.filter(f => f !== fallback);

        return this.getFontPbf(name, range, updatedFallbacks);
      } else {
        throw new Error(`Font load error: ${name}`);
      }
    }
  }

  async getFontsPbf(names, range) {
    const fonts = names.split(', ');
    const fallbacks = this.allowedFonts || Object.keys(this.existingFonts);

    const pbfs = await Promise.all(fonts.map(f => this.getFontPbf(f, range, fallbacks)));
    return glyphCompose.combine(values);
  }

  list() {
    return Object.keys(this.serveAllFonts ? this.existingFonts : this.allowedFonts).sort();
  }
}

module.exports = FontManager;
