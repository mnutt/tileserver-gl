const { Router } = require("express");
const utils = require("../utils");

const RenderManager = require("../managers/render");
const DataManager = require("../managers/data");
const StyleManager = require("../managers/style");

module.exports = function (options) {
  const routes = new Router();

  function formatTiles(req, tileList, type) {
    return tileList.map(([id, tileJSON]) => {
      let path = "";
      if (type === "rendered") {
        path = `styles/${id}`;
      } else {
        path = `${type}/${id}`;
      }

      const tiles = utils.getTileUrls(
        req,
        tileJSON.tiles,
        path,
        tileJSON.format,
        options.publicUrl,
        {
          pbf: options.pbfAlias,
        }
      );

      return Object.assign({}, tileJSON, { tiles });
    });
  }

  function renderedTiles(req, res) {
    const tiles = RenderManager.instance.allTiles();

    res.send(formatTiles(req, tiles, "rendered"));
  }

  function dataTiles(req, res) {
    const tiles = DataManager.instance.allTiles();

    res.send(formatTiles(req, tiles, "data"));
  }

  function allTiles(req, res) {
    const renderedTiles = RenderManager.instance.allTiles();
    const dataTiles = RenderManager.instance.allTiles();

    const rendered = formatTiles(req, renderedTiles, "rendered");
    const data = formatTiles(req, dataTiles, "data");

    res.send(rendered.concat(data));
  }

  function allStyles(req, res) {
    const styles = Object.entries(StyleManager.instance.styles);

    const response = styles.map(([id, item]) => {
      const { styleJSON } = item;
      const query = req.query.key ? `?key=${encodeURIComponent(req.query.key)}` : "";

      return {
        version: styleJSON.version,
        name: styleJSON.name,
        id,
        url: `${utils.getPublicUrl(options.publicUrl, req)}styles/${id}/style.json${query}`,
      };
    });

    res.send(response);
  }

  routes.get("/rendered.json", renderedTiles);
  routes.get("/data.json", dataTiles);
  routes.get("/index.json", allTiles);
  routes.get("/styles.json", allStyles);

  return routes;
};
