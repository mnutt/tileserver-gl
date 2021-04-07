const { memoize } = require('./memoize');
const generatedMarker = require('./generated');
const urlMarker = require('./url');

const innerMarkerRegex = /(url|pin|ref)-([^\(]+)\(([0-9\.\-]+),([0-9\.\-]+)\)(\:\d*)?/g;

exports.parse = function(markerList="") {
  let result, markers = [], refs = {};

  while (
    ((result = innerMarkerRegex.exec(markerList)), result != null)
  ) {
    let [_, type, url, x, y, ref] = result;

    if (type === "pin") {
      url = "generated:" + url;
    }

    if (ref) {
      refs[ref.slice(1)] = url;
    }

    if (type === "ref") {
      url = refs[url];
    }

    if (url) {
      markers.push({ url: url, x: +x, y: +y });
    }
  }

  return markers;
};

async function fetch(marker) {
  let image;
  if(marker.url.startsWith('generated:')) {
    const { result } = await generatedMarker.get(marker.url);
    image = await result;
  } else {
    image = await urlMarker.get(marker.url);;
  }

  return Object.assign({}, marker, { image });
}

exports.fetch = fetch;
exports.cachedFetch = memoize(fetch);
