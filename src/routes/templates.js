const { Router } = require("express");

const TemplateManager = require("../managers/template");
const StyleManager = require("../managers/style");
const DataManager = require("../managers/data");
const RenderManager = require("../managers/render");
const packageJson = require("../../package");

const mercator = new (require("@mapbox/sphericalmercator"))();
const utils = require("../utils");

const isLight = packageJson.name.slice(-6) === "-light";

module.exports = function (options) {
  function defaultData(req) {
    const { key } = req.query;

    return {
      server_version: `${packageJson.name} v${packageJson.version}`,
      public_url: options.publicUrl || "/",
      is_light: isLight,
      key_query_part: key ? `key=${encodeURIComponent(key)}&amp;` : "",
      key_query: key ? `?key=${encodeURIComponent(key)}` : "",
    };
  }

  function indexTemplate(req, res) {
    const template = TemplateManager.instance.get("index");

    const styles = Object.entries(StyleManager.instance.styles).map(([id, _style]) => {
      const style = Object.assign({}, _style);

      style.serving_data = !!StyleManager.instance.get(id);
      style.serving_rendered = !isLight;

      if (!isLight) {
        const rendered = RenderManager.instance.get(id);
        const { center } = rendered.tileJSON;
        if (center) {
          style.viewer_hash = `#${center[2]}/${center[1].toFixed(5)}/${center[0].toFixed(5)}`;

          const centerPx = mercator.px([center[0], center[1]], center[2]);
          style.thumbnail = `${center[2]}/${Math.floor(centerPx[0] / 256)}/${Math.floor(
            centerPx[1] / 256
          )}.png`;
        }

        style.xyz_link = utils.getTileUrls(
          req,
          rendered.tileJSON.tiles,
          `styles/${id}`,
          rendered.tileJSON.format,
          options.publicUrl
        )[0];
      }

      return [id, style];
    });

    const data = Object.entries(DataManager.instance.data).map(([id, _data]) => {
      const data = Object.assign({}, _data);
      const { tileJSON } = data;
      const { center } = tileJSON;

      if (center) {
        data.viewer_hash = `#${center[2]}/${center[1].toFixed(5)}/${center[0].toFixed(5)}`;
      }
      data.is_vector = tileJSON.format === "pbf";
      if (!data.is_vector) {
        if (center) {
          const centerPx = mercator.px([center[0], center[1]], center[2]);
          data.thumbnail = `${center[2]}/${Math.floor(centerPx[0] / 256)}/${Math.floor(
            centerPx[1] / 256
          )}.${tileJSON.format}`;
        }

        data.xyz_link = utils.getTileUrls(
          req,
          tileJSON.tiles,
          `data/${id}`,
          tileJSON.format,
          options.publicUrl,
          {
            pbf: options.pbfAlias,
          }
        )[0];
      }

      if (data.filesize) {
        let suffix = "kB";
        let size = parseInt(data.filesize, 10) / 1024;
        if (size > 1024) {
          suffix = "MB";
          size /= 1024;
        }
        if (size > 1024) {
          suffix = "GB";
          size /= 1024;
        }
        data.formatted_filesize = `${size.toFixed(2)} ${suffix}`;
      }

      return [id, data];
    });

    const response = Object.assign(defaultData(req), {
      styles: styles.length && utils.fromEntries(styles),
      data: data.length && utils.fromEntries(data),
    });

    res.status(200).send(template(response));
  }

  function viewerTemplate(req, res) {
    const template = TemplateManager.instance.get("viewer");

    const { id } = req.params;

    const style = StyleManager.instance.get(id) || {};
    const { styleJSON } = style;

    if (!styleJSON) {
      return res.sendStatus(404);
    }

    const response = Object.assign(
      {},
      styleJSON,
      {
        id,
        name: style.name,
        serving_data: !!StyleManager.instance.get(id),
        serving_rendered: !!RenderManager.instance.get(id),
      },
      defaultData(req)
    );

    res.status(200).send(template(response));
  }

  function wmtsTemplate(req, res) {
    const template = TemplateManager.instance.get("wmts");

    const { id } = req.params;

    const style = StyleManager.instance.get(id) || {};
    const { styleJSON } = style;

    if (!styleJSON) {
      return res.sendStatus(404);
    }

    const rendered = RenderManager.instance.get(id);
    if (!rendered) {
      return res.sendStatus(404);
    }

    const response = Object.assign(
      {},
      styleJSON,
      {
        id,
        name: (style || rendered).name,
        baseUrl: `${req.get("X-Forwarded-Protocol") || req.protocol}://${req.get("host")}`,
      },
      defaultData(req)
    );

    res.status(200).send(template(response));
  }

  function dataTemplate(req, res) {
    const template = TemplateManager.instance.get("data");

    const { id } = req.params;

    const data = DataManager.instance.get(id);

    if (!data) {
      return res.sendStatus(404);
    }

    const response = Object.assign(
      {},
      data,
      {
        id,
        is_vector: data.tileJSON.format === "pbf",
      },
      defaultData(req)
    );

    res.status(200).send(template(response));
  }

  const routes = new Router();

  routes.get("/$", indexTemplate);
  routes.get("/styles/:id/$", viewerTemplate);
  routes.get("/styles/:id/wmts.xml", wmtsTemplate);
  routes.get("/data/:id/$", dataTemplate);

  return routes;
};
