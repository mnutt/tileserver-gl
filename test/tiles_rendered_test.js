const fs = require("fs");
const makeApp = require("../src/app");
const StyleManager = require("../src/managers/style");
const DataManager = require("../src/managers/data");
const FontManager = require("../src/managers/font");
const RenderManager = require("../src/managers/render");

process.chdir(__dirname + "/../test_data");
const config = JSON.parse(fs.readFileSync("./config.json"));
config.options.publicUrl = "/test/";

let app;
before(async () => {
  const styleManager = await StyleManager.init(config.options, config.styles);
  const dataManager = await DataManager.init(config.options, config.data);
  const fontManager = await FontManager.init(config.options, styleManager.fontsList);

  const extraSources = dataManager
    .validateSources(styleManager.sourcesList)
    .filter((s) => s.newData);
  for (let { id, item } of extraSources) {
    dataManager.add(id, item);
  }

  await RenderManager.init(config.options, config.styles);
  app = makeApp(config.options);
});

var testTile = function (prefix, z, x, y, format, status, scale, type) {
  if (scale) y += "@" + scale + "x";
  var path = "/styles/" + prefix + "/" + z + "/" + x + "/" + y + "." + format;
  it(path + " returns " + status, function (done) {
    var test = supertest(app).get(path);
    test.expect(status);
    if (type) test.expect("Content-Type", type);
    test.end(done);
  });
};

var prefix = "test-style";

describe("Raster tiles", function () {
  describe("valid requests", function () {
    describe("various formats", function () {
      testTile(prefix, 0, 0, 0, "png", 200, undefined, /image\/png/);
      testTile(prefix, 0, 0, 0, "jpg", 200, undefined, /image\/jpeg/);
      testTile(prefix, 0, 0, 0, "jpeg", 200, undefined, /image\/jpeg/);
      testTile(prefix, 0, 0, 0, "webp", 200, undefined, /image\/webp/);
    });

    describe("different coordinates and scales", function () {
      testTile(prefix, 1, 1, 1, "png", 200);

      testTile(prefix, 0, 0, 0, "png", 200, 2);
      testTile(prefix, 0, 0, 0, "png", 200, 3);
      testTile(prefix, 2, 1, 1, "png", 200, 3);
    });
  });

  describe("invalid requests return 4xx", function () {
    testTile("non_existent", 0, 0, 0, "png", 404);
    testTile(prefix, -1, 0, 0, "png", 404);
    testTile(prefix, 25, 0, 0, "png", 404);
    testTile(prefix, 0, 1, 0, "png", 404);
    testTile(prefix, 0, 0, 1, "png", 404);
    testTile(prefix, 0, 0, 0, "gif", 400);
    testTile(prefix, 0, 0, 0, "pbf", 400);

    testTile(prefix, 0, 0, 0, "png", 404, 1);
    testTile(prefix, 0, 0, 0, "png", 404, 5);

    //testTile('hybrid', 0, 0, 0, 'png', 404); //TODO: test this
  });
});
