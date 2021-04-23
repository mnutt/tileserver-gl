const client = require("prom-client");

const metrics = {
  httpRequestDurationMillisecondsSummary: new client.Summary({
    name: "tileserver_http_request_duration_milliseconds_summary",
    help: "Summary of duration for requests made to the tileserver",
    percentiles: [0.5, 0.9, 0.95, 0.99],
    labelNames: ["status_code", "method"],
  }),
  markerRequestDurationMillisecondsSummary: new client.Summary({
    name: "tileserver_marker_request_duration_milliseconds_summary",
    help: "Summary of duration for marker requests made to the tileserver",
    percentiles: [0.5, 0.9, 0.95, 0.99],
  }),
  markerErrorCounter: new client.Counter({
    name: "tileserver_marker_error_counter",
    help: "Number of tileserver marker errors",
  }),
  tileRequestDurationMillisecondsSummary: new client.Summary({
    name: "tileserver_tile_request_duration_milliseconds_summary",
    help: "Summary of duration for tile requests made to the tileserver",
    percentiles: [0.5, 0.9, 0.95, 0.99],
  }),
  tileErrorCounter: new client.Counter({
    name: "tileserver_tile_error_counter",
    help: "Number of tileserver tile errors",
  }),
};

module.exports = metrics;
