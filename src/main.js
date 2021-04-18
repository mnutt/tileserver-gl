#!/usr/bin/env node
const fs = require("fs");
const enableShutdown = require("http-shutdown");
const packageJson = require("../package");
const path = require("path");
const loadConfig = require("./config");
const chokidar = require("chokidar");
const makeOptions = require("./options");

const StyleManager = require("./managers/style");
const DataManager = require("./managers/data");
const FontManager = require("./managers/font");
const TemplateManager = require("./managers/template");

const args = process.argv;
if (args.length >= 3 && args[2][0] !== "-") {
  args.splice(2, 0, "--mbtiles");
}

const isLight = packageJson.name.slice(-6) === "-light";

async function startServer(config, opts) {
  let publicUrl = opts.public_url;
  if (publicUrl && publicUrl.lastIndexOf("/") !== publicUrl.length - 1) {
    publicUrl += "/";
  }

  const styleManager = await StyleManager.init(config.options, config.styles);
  const dataManager = await DataManager.init(config.options, config.data);
  const fontManager = await FontManager.init(config.options, styleManager.fontsList);

  const extraSources = dataManager
    .validateSources(styleManager.sourcesList)
    .filter((s) => s.newData);
  for (let { id, item } of extraSources) {
    dataManager.add(id, item);
  }

  fontManager.allowFonts(styleManager.fontsList);

  let renderManager;
  if (!isLight) {
    const RenderManager = require("./managers/render");
    renderManager = await RenderManager.init(config.options, config.styles);
  }

  const watcher = chokidar.watch(path.join(config.options.paths.styles, "*.json"), {});
  watcher.on("all", (eventType, filename) => {
    if (filename) {
      const id = path.basename(filename, ".json");
      console.log(`Style "${id}" changed, updating...`);

      styleManager.remove(id);
      if (renderManager) {
        renderManager.remove(id);
      }

      if (eventType == "add" || eventType == "change") {
        let item = {
          style: filename,
        };

        styleManager.add(item, id);

        if (renderManager) {
          renderManager.add(item, id);
        }
      }
    }
  });

  await TemplateManager.init();

  const app = require("./app")(config.options);

  const server = app.listen(
    process.env.PORT || opts.port,
    process.env.BIND || opts.bind,
    function () {
      let address = this.address().address;
      if (address.indexOf("::") === 0) {
        address = `[${address}]`; // literal IPv6 address
      }
      console.log(`Listening at http://${address}:${this.address().port}/`);
    }
  );

  process.on("SIGINT", () => {
    process.exit();
  });

  process.on("SIGHUP", () => {
    console.log("Stopping server and reloading config");

    running.server.shutdown(() => {
      for (const key in require.cache) {
        delete require.cache[key];
      }

      const restarted = start(opts);
      running.server = restarted.server;
      running.app = restarted.app;
    });
  });

  enableShutdown(server);
}

(async function start() {
  const opts = makeOptions(args);
  console.log(`Starting ${packageJson.name} v${packageJson.version}`);

  const config = await loadConfig(opts);

  await startServer(config, opts);
})();
