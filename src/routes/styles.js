const StyleManager = require("../managers/style");
const utils = require("../utils");
const { Router } = require("express");
const fs = require("fs").promises;
const { asyncRoute } = require("./support");

const fixUrl = (req, url, publicUrl, opt_nokey) => {
  if (!url || typeof url !== "string" || url.indexOf("local://") !== 0) {
    return url;
  }
  const queryParams = [];
  if (!opt_nokey && req.query.key) {
    queryParams.unshift(`key=${encodeURIComponent(req.query.key)}`);
  }
  let query = "";
  if (queryParams.length) {
    query = `?${queryParams.join("&")}`;
  }

  return url.replace("local://", utils.getPublicUrl(publicUrl, req)) + query;
};

module.exports = function (options) {
  function getStyleRoute(req, res) {
    const { id } = req.params;

    const item = StyleManager.instance.get(id);
    if (!item) {
      return res.sendStatus(404);
    }

    const styleJSON = Object.assign({}, item.styleJSON);

    const sources = Object.entries(styleJSON.sources).map(([id, source]) => {
      const url = `local://data/${id}.json`;
      return [id, Object.assign({}, source, { url })];
    });

    styleJSON.sources = Object.assign({}, utils.fromEntries(sources));

    for (const name of Object.keys(styleJSON.sources)) {
      const source = styleJSON.sources[name];
      const url = fixUrl(req, source.url, options.publicUrl);
      styleJSON.sources[name] = Object.assign({}, source, { url });
    }

    // mapbox-gl-js viewer cannot handle sprite urls with query
    if (styleJSON.sprite) {
      styleJSON.sprite = fixUrl(req, styleJSON.sprite, options.publicUrl, false);
    }

    if (styleJSON.glyphs) {
      styleJSON.glyphs = fixUrl(req, styleJSON.glyphs, options.publicUrl, false);
    }

    return res.send(styleJSON);
  }

  async function getStyleSpriteRoute(req, res) {
    const { scale, format, id } = req.params;

    const item = StyleManager.instance.get(id);
    if (!item || !item.spritePath) {
      return res.sendStatus(404);
    }

    const filename = `${item.spritePath + (scale || "")}.${format}`;

    try {
      const data = await fs.readFile(filename);

      if (format === "json") {
        res.header("Content-type", "application/json");
      } else if (format === "png") {
        res.header("Content-type", "image/png");
      }

      return res.send(data);
    } catch (err) {
      return res.sendStatus(404);
    }
  }

  const routes = new Router();
  routes.get("/:id/style.json", asyncRoute(getStyleRoute));
  routes.get("/:id/sprite:scale(@[23]x)?.:format([\\w]+)", asyncRoute(getStyleSpriteRoute));

  return routes;
};
