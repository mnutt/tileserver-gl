const { loadImage } = require('canvas');

exports.get = async function(markerUrl) {
  return loadImage(markerUrl);
};

function fetch(uri, callback) {
  return request.get({
    uri: uri,
    encoding: null,
    timeout: 10e3
  }, function(err, rsp, body) {
    if (err) {
      return callback(err);
    }

    switch (rsp.statusCode) {
    case 200:
    case 403:
    case 404:
      return callback(null, rsp, body);

    default:
      err = new Error(util.format("Upstream error: %s returned %d", uri, rsp.statusCode));

      return callback(err, rsp, body);
    }
  });
};
