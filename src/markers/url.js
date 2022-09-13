const sharp = require("sharp");
const fetch = require("node-fetch");
const TIMEOUT = 3000;

exports.get = function (markerUrl) {
  if (!markerUrl.match(/^\w+:/)) {
    markerUrl = `http://${markerUrl}`;
  }

  const timer = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Timeout")), TIMEOUT);
  });

  const image = fetch(markerUrl)
    .then((res) => res.buffer())
    .then((buffer) => sharp(buffer).raw().toBuffer({ resolveWithObject: true }));

  return Promise.race([timer, image]);
};
