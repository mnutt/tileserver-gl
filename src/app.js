const path = require('path');

const express = require('express');
const dataRoute = require('./routes/data');
const fontsRoute = require('./routes/fonts');
const stylesRoute = require('./routes/styles');
const renderedRoute = require('./routes/rendered');
const healthRoute = require('./routes/health');
const metaRoute = require('./routes/meta');
const templatesRoute = require('./routes/templates');

module.exports = function(options) {
  const app = express().disable('x-powered-by');

  app.use('/data', dataRoute(options));
  app.use('/styles', stylesRoute(options));
  app.use('/', fontsRoute(options));
  app.use('/styles', renderedRoute(options));
  app.get('/health', healthRoute(options));
  app.use('/', metaRoute(options));

  app.use('/', express.static(path.join(__dirname, '../public/resources')));
  app.use('/', templatesRoute(options));

  return app;
};
