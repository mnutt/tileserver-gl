const fs = require("fs").promises;
const request = require("request");
const path = require("path");
const DataManager = require("./managers/data");
const { DataSource } = DataManager;

const defaultMbtilesUrl =
  "https://github.com/maptiler/tileserver-gl/releases/download/v1.3.0/zurich_switzerland.mbtiles";
const defaultMbtilesFilename = "zurich_switzerland.mbtiles";

module.exports = async function loadConfig(options) {
  try {
    const configData = await fs.stat(path.resolve(options.config));
    return JSON.parse(configData);
  } catch (e) {
    console.log(`[INFO] Automatically creating config file`);
    console.log(`[INFO] Only a basic preview style will be used.`);
    console.log(`[INFO] See documentation to learn how to create config.json file.`);

    const config = await createDefaultConfig(options);

    if (options.verbose) {
      console.log("Generated config:", JSON.stringify(config, undefined, 2));
    } else {
      console.log("Run with --verbose to see the generated config file here.");
    }

    return config;
  }
};

async function findMbtilesFile() {
  const files = await fs.readdir(process.cwd());

  for (let filename of files) {
    if (filename.endsWith(".mbtiles")) {
      const mbtilesStats = await fs.stat(filename);

      if (mbtilesStats.isFile() && mbtilesStats.size > 0) {
        return filename;
      }
    }
  }

  // No mbtiles file found; download a default one
  return downloadDefaultMbtilesFile();
}

async function downloadDefaultMbtilesFile() {
  const stream = fs.createWriteStream(defaultMbtilesFilename);

  console.log(`No MBTiles found`);
  console.log(
    `[DEMO] Downloading sample data (${defaultMbtilesFilename}) from ${defaultMbtilesUrl}`
  );

  await pipeline(request.get(url), stream);

  return path.resolve(filename);
}

async function createDefaultConfig(options) {
  let mbtiles = options.mbtiles || (await findMbtilesFile());

  const mbtilesFile = path.resolve(process.cwd(), mbtiles);
  try {
    await fs.stat(mbtilesFile);
  } catch (e) {
    console.log("ERROR: Unable to open MBTiles.");
    console.log(`       Make sure ${path.basename(mbtilesFile)} is valid MBTiles.`);
    process.exit(1);
  }

  const dataManager = new DataManager({ paths: {} });

  let source;
  try {
    source = new DataSource(await dataManager.loadMbTiles(mbtilesFile));
  } catch (e) {
    console.log("ERROR: Metadata missing in the MBTiles.");
    console.log(`       Make sure ${path.basename(mbtilesFile)} is valid MBTiles.`);
    process.exit(1);
  }

  const info = await source.getInfo();

  const { bounds } = info;
  const styleDir = path.dirname(require.resolve("tileserver-gl-styles/package.json"));

  const config = {
    options: {
      paths: {
        root: styleDir,
        fonts: "fonts",
        styles: "styles",
        mbtiles: path.dirname(mbtilesFile),
      },
    },
    styles: {},
    data: {},
  };

  if (info.format === "pbf" && info.name.toLowerCase().includes("openmaptiles")) {
    config.data["v3"] = {
      mbtiles: path.basename(mbtilesFile),
    };

    const styles = await fs.readdir(path.resolve(styleDir, "styles"));

    for (let styleName of styles) {
      const styleFileRel = styleName + "/style.json";
      const styleFile = path.resolve(styleDir, "styles", styleFileRel);
      try {
        await fs.stat(styleFile);
        config.styles[styleName] = {
          style: styleFileRel,
          tilejson: {
            bounds: bounds,
          },
        };
      } catch (_e) {
        // Ignore failure
      }
    }
  } else {
    console.log(`WARN: MBTiles not in "openmaptiles" format. Serving raw data only...`);
    const dataName = (info.id || "mbtiles")
      .replace(/\//g, "_")
      .replace(/:/g, "_")
      .replace(/\?/g, "_");

    config.data[dataName] = {
      mbtiles: path.basename(mbtilesFile),
    };
  }

  return config;
}
