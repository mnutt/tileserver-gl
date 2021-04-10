exports.mochaGlobalSetup = async () => {
  process.env.NODE_ENV = 'test';

  global.should = require('should');
  global.supertest = require('supertest');

  console.log('global setup');
  process.chdir(__dirname + '/../test_data');
  const { app, startupPromise } = require('../src/server')({
    configPath: 'config.json',
    port: 8888,
    publicUrl: '/test/'
  });

  global.app = app;
  await startupPromise;
}
