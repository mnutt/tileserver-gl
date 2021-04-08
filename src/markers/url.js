const { loadImage } = require('canvas');
const TIMEOUT = 3000;

exports.get = function(markerUrl) {
  const timer = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Timeout")), TIMEOUT);
  });

  const image = loadImage(markerUrl);

  return Promise.race([timer, image]);
};
