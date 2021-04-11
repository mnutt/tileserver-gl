const fs = require('fs').promises;
const path = require('path');

class DataSource {
  constructor(source) {
    this.source = source;
  }

  getInfo() {
    return new Promise((resolve, reject) => {
      this.source.getInfo((err, info) => err ? reject(err) : resolve(info));
    });
  }

  getTile(z, x, y) {
    return new Promise((resolve, reject) => {
      this.source.getTile(z, x, y, (err, data, headers) => err ? reject(err) : resolve({ data, headers }));
    })
  }
}

class DataManager {
  constructor(options) {
    this.options = options;
    this.data = {};
    this.mbtilesDirectory = options.paths.mbtiles;
  }

  async init(item, ids) {
    const datas = Promise.all(ids.map(id => this.parse(item, id)))

    for (let data of datas) {
      this.data[data.tileJSON.name] = data;
    }
  }

  get(id) {
    return this.data[id];
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
      format: 'pbf'
    }

    Object.assign(tileJSON, info, { tilejson: '2.0.0' });

    delete tileJSON['filesize'];
    delete tileJSON['mtime'];
    delete tileJSON['scheme'];

    Object.assign(tileJSON, item.tilejson || {});
    utils.fixTileJSONCenter(tileJSON);

    if (this.options.dataDecoratorFunc) {
      tileJSON = this.options.dataDecoratorFunc(id, 'tilejson', tileJSON);
    }

    return { tileJSON, source };
  }

  async loadMbTiles(mbtilesFile) {
    return new Promise((resolve, reject) => {
      let source;
      source = new MBTiles(mbtilesFile, err => {
        err ? reject(err) : resolve(source);
      });
    });
  }
}
