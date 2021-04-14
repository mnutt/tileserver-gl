const fs = require('fs');
const DataManager = require('../../src/managers/data');

const testConfig = JSON.parse(fs.readFileSync(__dirname + '/../../test_data/config.json'));

describe("DataManager", () => {
  describe("parse()", () => {
    it ("parses a data", async () => {
      const dataManager = new DataManager(testConfig.options);
      const id = 'openmaptiles';
      const item = testConfig.data[id];

      const data = await dataManager.parse(item, id);
      console.log(data);
    });
  });
});
