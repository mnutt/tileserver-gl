"use strict";

const morgan = require("morgan");

function log(data, device = "log") {
  if (typeof data === "string") {
    data = { message: data };
  }

  data.date = new Date().toISOString();
  console[device](JSON.stringify(data));
}

function logStdout(data) {
  log(data, "log");
}

function logStderr(data) {
  log(data, "error");
}

morgan.token("pid", function getPid() {
  return process.pid;
});

function jsonFormat(tokens, req, res) {
  return JSON.stringify({
    remoteAddress: tokens["remote-addr"](req, res),
    time: tokens["date"](req, res, "iso"),
    method: tokens["method"](req, res),
    url: tokens["url"](req, res),
    httpVersion: tokens["http-version"](req, res),
    statusCode: tokens["status"](req, res),
    contentLength: tokens["res"](req, res, "content-length"),
    referrer: tokens["referrer"](req, res),
    userAgent: tokens["user-agent"](req, res),
    responseTime: tokens["response-time"](req, res),
    pid: tokens["pid"](req, res),
  });
}

module.exports = {
  debug: logStdout, // for debugging only, rarely used
  info: logStdout, // request logging
  error: logStderr, // something bad happened
  notice: logStderr, // something happened that we should know about, outside of the request/response cycle
  warn: logStderr, // something potentially concerning happened
  jsonFormat: jsonFormat, // For use by morgan
};
