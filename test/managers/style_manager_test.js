const fs = require("fs");
const StyleManager = require("../../src/managers/style");

const testConfig = JSON.parse(fs.readFileSync(__dirname + "/../../test_data/config.json"));

describe("StyleManager", () => {
  describe("parse()", () => {
    it("parses a style", async () => {
      const styleManager = new StyleManager(testConfig.options);
      const id = "test-style";
      const item = testConfig.styles[id];

      const style = await styleManager.parse(
        item,
        id,
        (id) => id,
        () => {}
      );
      should(style.styleJSON.name).equal("OSM Bright");
      should(Object.keys(style.styleJSON.sources)).deepEqual(["openmaptiles"]);
      should(style.spritePath).equal("styles/osm-bright/sprite");
    });
  });
});
