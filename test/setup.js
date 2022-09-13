exports.mochaGlobalSetup = () => {
  process.env.NODE_ENV = "test";

  global.should = require("should");
  global.supertest = require("supertest");

  process.chdir(__dirname + "/../test_data");
};
