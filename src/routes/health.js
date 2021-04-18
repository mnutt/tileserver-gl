const StyleManager = require("../managers/style");
const FontManager = require("../managers/font");
const DataManager = require("../managers/data");
const RenderManager = require("../managers/render");

module.exports = function (options) {
  return function (req, res, next) {
    let started = StyleManager.instance && FontManager.instance && DataManager.instance;

    if (options.serveRendered) {
      started = started && RenderManager.instance;
    }

    if (started) {
      res.status(200).send("OK");
    } else {
      res.status(503).send("Starting");
    }
  };
};
