const fs = require("fs");
const supertest = require("supertest");
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
  await FontManager.init(config.options, styleManager.fontsList);

  const extraSources = dataManager
    .validateSources(styleManager.sourcesList)
    .filter((s) => s.newData);
  for (let { id, item } of extraSources) {
    dataManager.add(id, item);
  }

  await RenderManager.init(config.options, config.styles);
  app = makeApp(config.options);
});

var testTileJSONArray = function (url) {
  describe(url + " is array of TileJSONs", function () {
    it("is json", function (done) {
      supertest(app)
        .get(url)
        .expect(200)
        .expect("Content-Type", /application\/json/, done);
    });

    it("is non-empty array", function (done) {
      supertest(app)
        .get(url)
        .expect(function (res) {
          res.body.should.be.Array();
          res.body.length.should.be.greaterThan(0);
        })
        .end(done);
    });
  });
};

var testTileJSON = function (url) {
  describe(url + " is TileJSON", function () {
    it("is json", function (done) {
      supertest(app)
        .get(url)
        .expect(200)
        .expect("Content-Type", /application\/json/, done);
    });

    it("has valid tiles", function (done) {
      supertest(app)
        .get(url)
        .expect(function (res) {
          res.body.tiles.length.should.be.greaterThan(0);
        })
        .end(done);
    });
  });
};

describe("Metadata", function () {
  describe("/health", function () {
    it("returns 200", function (done) {
      supertest(app).get("/health").expect(200, done);
    });
  });

  testTileJSONArray("/index.json");
  testTileJSONArray("/rendered.json");
  testTileJSONArray("/data.json");

  describe("/styles.json is valid array", function () {
    it("is json", function (done) {
      supertest(app)
        .get("/styles.json")
        .expect(200)
        .expect("Content-Type", /application\/json/, done);
    });

    it("contains valid item", function (done) {
      supertest(app)
        .get("/styles.json")
        .expect(function (res) {
          res.body.should.be.Array();
          res.body.length.should.be.greaterThan(0);
          res.body[0].version.should.equal(8);
          res.body[0].id.should.be.String();
          res.body[0].name.should.be.String();
        })
        .end(done);
    });
  });

  testTileJSON("/styles/test-style.json");
  testTileJSON("/data/openmaptiles.json");
});
