const fs = require("fs").promises;
const path = require("path");
const MBTiles = require("@mapbox/mbtiles");
const utils = require("../utils");

class DataSource {
  constructor(source) {
    this.source = source;
  }

  getInfo() {
    return new Promise((resolve, reject) => {
      this.source.getInfo((err, info) => (err ? reject(err) : resolve(info)));
    });
  }

  getTile(z, x, y) {
    return new Promise((resolve, reject) => {
      this.source.getTile(z, x, y, (err, data, headers) =>
        err ? reject(err) : resolve({ data, headers })
      );
    });
  }
}

class DataManager {
  constructor(options) {
    this.options = options;

    const { mbtiles, root } = options.paths;
    this.mbtilesDirectory = path.resolve(root || "", mbtiles || "");

    this.data = {};
    this.sourceMapping = {};
    this.aliases = {};
  }

  allTiles() {
    return Object.entries(this.data).map(([id, item]) => [id, item.tileJSON]);
  }

  static async init(options, data) {
    const manager = new DataManager(options);

    await Promise.all(
      Object.keys(data)
        .map((id) => {
          const item = data[id];
          return manager.add(item, id);
        })
        .filter(Boolean)
    );

    DataManager.instance = manager;
    return manager;
  }

  validateSources(sourcesList, allowNewSource) {
    return sourcesList.map(({ name, source, mapping }) => {
      const { url } = source;

      if (!(url && url.startsWith("mbtiles:"))) {
        throw new Error(`Invalid protocol: ${url}`);
      }

      let mbtilesFile = url.slice("mbtiles://".length);
      const fromData = mbtilesFile.startsWith("{") && mbtilesFile.endsWith("}");
      if (fromData) {
        mbtilesFile = mbtilesFile.slice(1, -1);
        const mapsTo = (mapping || {})[mbtilesFile];
        if (mapsTo) {
          mbtilesFile = mapsTo;
        }
      }

      const { identifier, newData } = this.lookupSourceId(mbtilesFile, fromData);
      if (newData && (fromData || !allowNewSource)) {
        throw new Error(`Could not validate source identifier from ${name}`);
      }

      this.aliases[name] = identifier;

      return { newData, id: identifier, item: { mbtiles: url } };
    });
  }

  lookupSourceId(mbtiles, fromData) {
    let dataItemId;
    for (const id of Object.keys(this.data)) {
      if (fromData) {
        if (id === mbtiles) {
          dataItemId = id;
        }
      } else {
        if (this.get(id).mbtiles === mbtiles) {
          dataItemId = id;
        }
      }
    }

    if (dataItemId) {
      // mbtiles exist in the data config
      return { identifier: dataItemId, newData: false };
    } else {
      if (fromData) {
        throw new Error(
          `ERROR: style "${item.style}" using unknown mbtiles "${mbtiles}"! Skipping...`
        );
      } else {
        let identifier = mbtiles.substr(0, mbtiles.lastIndexOf(".")) || mbtiles;
        while (this.get(identifier)) identifier += "_";

        return { identifier, newData: true };
      }
    }
  }

  get(id) {
    if (this.aliases[id]) {
      id = this.aliases[id];
    }
    return this.data[id];
  }

  async add(item, id) {
    const data = await this.parse(item, id);
    this.data[id] = data;
    return data;
  }

  async parse(item, id) {
    const mbtilesFile = path.resolve(this.mbtilesDirectory, item.mbtiles);
    const mbtilesFileStats = await fs.stat(mbtilesFile);

    if (!mbtilesFileStats.isFile() || mbtilesFileStats.size === 0) {
      throw new Error(`Not valid MBTiles file: ${mbtilesFile}`);
    }

    const source = new DataSource(await this.loadMbTiles(mbtilesFile));
    const info = await source.getInfo();

    let tileJSON = {
      tiles: item.domains || this.options.domains,
      name: id,
      format: "pbf",
    };

    Object.assign(tileJSON, info, { tilejson: "2.0.0" });

    delete tileJSON["filesize"];
    delete tileJSON["mtime"];
    delete tileJSON["scheme"];

    Object.assign(tileJSON, item.tilejson || {});
    utils.fixTileJSONCenter(tileJSON);

    if (this.options.dataDecoratorFunc) {
      tileJSON = this.options.dataDecoratorFunc(id, "tilejson", tileJSON);
    }

    return { tileJSON, source };
  }

  async loadMbTiles(mbtilesFile) {
    return new Promise((resolve, reject) => {
      let source;
      source = new MBTiles(mbtilesFile, (err) => {
        err ? reject(err) : resolve(source);
      });
    });
  }
}

module.exports = DataManager;
module.exports.DataSource = DataSource;
