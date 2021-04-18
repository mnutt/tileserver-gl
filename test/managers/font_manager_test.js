const fs = require("fs");
const FontManager = require("../../src/managers/font");

const config = fs.readFileSync("./test_data/config.json");

const fontsPath = __dirname + "/../../test_data/fonts";
const fontList = ["Open Sans Bold", "Open Sans Italic", "Open Sans Regular", "Open Sans Semibold"];

describe("FontManager", () => {
  describe("loadFonts()", () => {
    it("loads fonts", async () => {
      const fontManager = await FontManager.init(fontsPath, [], false);
      should(Object.keys(fontManager.existingFonts)).deepEqual(fontList);
    });
  });

  describe("allowedFonts()", () => {
    it("allows a font on the allowed list", async () => {
      const fontManager = await FontManager.init(fontsPath, ["Open Sans Bold"], false);
      should(fontManager.allowedFont("Open Sans Bold")).equal(true);
    });

    it("denies a font not on the allowed list", async () => {
      const fontManager = await FontManager.init(fontsPath, ["Open Sans Bold"], false);
      should(fontManager.allowedFont("Noto Sans Bold")).equal(false);
    });
  });

  describe("getFontPbf()", () => {
    let fontManager;

    before(async () => {
      fontManager = await FontManager.init(fontsPath, null, false);
    });

    it("returns the pbf data for a known font", async () => {
      const pbf = await fontManager.getFontPbf("Open Sans Bold", "22272-22527", []);
      should(pbf.byteLength).equal(31);
    });

    it("returns fallback pbf data for an unknown font", async () => {
      const pbf = await fontManager.getFontPbf("Comic Sans Bold", "22272-22527", [
        "Open Sans Italic",
        "Open Sans Bold",
      ]);
      should(pbf.byteLength).equal(31); // Open Sans Bold 22272-22527 has length 31
    });

    it("throws error if no suitable fallbacks exist", async () => {
      const result = fontManager.getFontPbf("Comic Sans Bold", "22272-22527", [
        "Marker Bold",
        "Comic Sans Regular",
      ]);
      should(result).be.rejectedWith("Font load error: Comic Sans Bold");
    });

    describe("getFontsPbf()", () => {
      it("returns composed glyphs", async () => {
        const fonts = await fontManager.getFontsPbf(
          "Open Sans Bold, Open Sans Italic, Open Sans Regular",
          "22272-22527"
        );
        should(fonts.byteLength).equal(68);
      });
    });
  });
});
