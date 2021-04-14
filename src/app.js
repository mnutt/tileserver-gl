const express = require('express');
const dataRoute = require('./routes/data');
const fontsRoute = require('./routes/fonts');
const stylesRoute = require('./routes/styles');
const renderedRoute = require('./routes/rendered');

module.exports = function(options) {
  const app = express().disable('x-powered-by');

  app.use('/data', dataRoute(options));
  app.use('/styles', stylesRoute(options));
  app.use('/', fontsRoute(options));
  app.use('/styles', renderedRoute(options));

  return app;
};
