const { memoize } = require("../memoize");
const generatedMarker = require("./generated");
const urlMarker = require("./url");

const innerMarkerRegex = /(url|pin|ref)-([^(]+)\(([0-9.-]+),([0-9.-]+)\)(:\d*)?/g;

function groupBy(xs, fn) {
  return xs.reduce(function (rv, x) {
    (rv[fn(x)] = rv[fn(x)] || []).push(x);
    return rv;
  }, {});
}

exports.parse = function (markerList = "") {
  let result,
    markers = [],
    refs = {};

  while (((result = innerMarkerRegex.exec(markerList)), result != null)) {
    let [, type, url, x, y, ref] = result;

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
  if (marker.url.startsWith("generated:")) {
    const { result } = await generatedMarker.get(marker.url);
    image = await result;
  } else {
    image = await urlMarker.get(marker.url);
  }

  return Object.assign({}, marker, { image });
}

function sourceForMarkerGroup(group) {
  return {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: group.map((marker) => {
        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [marker.x, marker.y],
          },
          properties: {},
        };
      }),
    },
  };
}

function layerForMarkerUrl(url) {
  return {
    id: url,
    type: "symbol",
    source: url,
    layout: {
      "icon-image": url,
    },
  };
}

function imageForMarker(marker) {
  return {
    data: marker.image.data,
    options: {
      width: marker.image.info.width,
      height: marker.image.info.height,
      pixelRatio: 1.0,
    },
  };
}

exports.makeLayerList = function (markerList) {
  const markerGroups = groupBy(markerList, (a) => a.url);

  return Object.entries(markerGroups).map(([url, group]) => {
    return {
      url,
      source: sourceForMarkerGroup(group),
      layer: layerForMarkerUrl(url),
      image: imageForMarker(group[0]),
    };
  });
};

exports.fetch = fetch;
exports.cachedFetch = memoize(fetch);
