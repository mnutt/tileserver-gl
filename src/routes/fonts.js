const FontManager = require("../managers/font");
const { Router } = require("express");

module.exports = () => {
  async function fontStackRoute(req, res, next) {
    const { fontstack, range } = req.params;

    const fontManager = FontManager.instance;

    try {
      const concated = await fontManager.getFontsPbf(decodeURI(fontstack), range);

      res.header("Content-type", "application/x-protobuf");
      res.header("Last-Modified", fontManager.lastModified);
      return res.send(concated);
    } catch (err) {
      res.status(400).send(err);
    }
  }

  function fontListRoute(req, res, next) {
    res.header("Content-type", "application/json");

    return res.send(fontManager.list());
  }

  const routes = new Router();
  routes.get("/fonts/:fontstack/:range([\\d]+-[\\d]+).pbf", fontStackRoute);
  routes.get("/fonts.json", fontListRoute);

  return routes;
};
