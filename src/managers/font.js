const fs = require("fs").promises;
const path = require("path");
const glyphCompose = require("@mapbox/glyph-pbf-composite");

function toObject(list) {
  return list.reduce((acc, item) => {
    acc[item] = true;
    return acc;
  }, {});
}

class FontManager {
  constructor(options, allowedFonts, serveAllFonts = true) {
    const { root, fonts } = options.paths;
    this.fontsPath = path.resolve(root || "", fonts || "fonts");
    this.allowedFonts = allowedFonts ? toObject(allowedFonts) : null;
    this.existingFonts = {};
    this.loaded = false;
    this.serveAllFonts = serveAllFonts;
  }

  static async init(options, allowedFonts, serveAllFonts) {
    const manager = new FontManager(options, allowedFonts, serveAllFonts);
    await manager.loadFonts();

    FontManager.instance = manager;
    return manager;
  }

  async loadFonts() {
    this.existingFonts = await this.findFonts(this.fontsPath);
    this.lastModified = new Date().toUTCString();
    this.loaded = true;
  }

  async allowFonts(fontsList) {
    if (!this.allowedFonts) {
      this.allowedFonts = {};
    }

    for (let font of fontsList) {
      this.allowedFonts[font] = true;
    }
  }

  async findFonts(fontsPath) {
    const files = await fs.readdir(fontsPath);
    const existingFonts = {};

    for (const name of files) {
      const fontPath = path.join(fontsPath, name);

      const stats = await fs.stat(fontPath);

      if (stats.isDirectory()) {
        try {
          await fs.access(path.join(fontsPath, name, "0-255.pbf"), fs.constants.F_OK);
          existingFonts[path.basename(name)] = true;
        } catch (_) {
          // ignore
        }
      }
      existingFonts[path.basename(name)] = true;
    }

    return existingFonts;
  }

  allowedFont(name) {
    return !this.allowedFonts || !!this.allowedFonts[name];
  }

  // Prefer a fallback that is the same font style as the originally requested font
  chooseFallback(name, fallbacks) {
    let fontStyle = name.split(" ").pop();
    if (["Regular", "Bold", "Italic"].indexOf(fontStyle) < 0) {
      fontStyle = "Regular";
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

  async getFontPbf(name, range, fallbacks = []) {
    if (!this.allowedFont(name)) {
      throw new Error(`Font not allowed: ${name}`);
    }

    fallbacks = fallbacks.filter((f) => f !== name);

    const filename = path.join(this.fontsPath, name, `${range}.pbf`);

    try {
      const file = await fs.readFile(filename);
      return file;
    } catch (e) {
      console.error(`Font not found: ${name}`);

      if (fallbacks && fallbacks.length) {
        const fallback = this.chooseFallback(name, fallbacks);
        const updatedFallbacks = fallbacks.filter((f) => f !== fallback);

        return this.getFontPbf(fallback, range, updatedFallbacks);
      } else {
        throw new Error(`Font load error: ${name}`);
      }
    }
  }

  async getFontsPbf(names, range) {
    const fonts = names.split(/,\s?/);
    const fallbacks = Object.keys(this.allowedFonts || this.existingFonts);

    const pbfs = await Promise.all(fonts.map((f) => this.getFontPbf(f, range, fallbacks)));
    return glyphCompose.combine(pbfs);
  }

  list() {
    return Object.keys(this.serveAllFonts ? this.existingFonts : this.allowedFonts).sort();
  }
}

module.exports = FontManager;
