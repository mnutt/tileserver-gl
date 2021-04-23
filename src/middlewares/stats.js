const metrics = require("../metrics");

function statsMiddleware(req, res, next) {
  const start = new Date();

  res.on("finish", function () {
    var reqTime = new Date() - start;
    metrics.httpRequestDurationMillisecondsSummary.observe(
      {
        status_code: res.statusCode,
        method: req.method,
      },
      reqTime
    );
  });

  next();
}

module.exports = statsMiddleware;
