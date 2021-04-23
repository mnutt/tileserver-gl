const express = require("express");
const { register } = require("prom-client");

exports.makeServer = function makeTelemetryServer() {
  const server = express();

  server.get("/metrics", async (req, res) => {
    try {
      res.set("Content-Type", register.contentType);
      res.end(await register.metrics());
    } catch (ex) {
      res.status(500).end(ex);
    }
  });

  return server;
};
