const colorMarker = require("./color");

const hexRegex = /^([0-9A-Fa-f]{3}){1,2}$/;
const offset = "generated:".length;

const oneHour = 60 * 60 * 1000;

exports.get = function (markerUrl) {
  var size = markerUrl[offset];
  var color = markerUrl.slice(offset + 2);

  if (!color.match(hexRegex)) {
    throw new Error("Invalid marker color");
  }

  return colorMarker.createCached(size + color, oneHour, size, color);
};
