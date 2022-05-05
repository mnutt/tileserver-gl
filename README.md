# MapLibre TileServer GL
[![Build Status](https://travis-ci.org/wifidb/tileserver-gl.svg?branch=master)](https://travis-ci.org/wifidb/tileserver-gl)
[![Docker Hub](https://img.shields.io/badge/docker-hub-blue.svg)](https://hub.docker.com/r/wifidb/tileserver-gl/)

Vector and raster maps with GL styles. Server side rendering by MapLibre GL Native. Map tile server for MapLibre GL JS, Android, iOS, Leaflet, OpenLayers, GIS via WMTS, etc.

## Getting Started with Node

Make sure you have Node.js version **12** or above installed (up to node 16 has been tested)

Install `@acalcutt/tileserver-gl` with server-side raster rendering of vector tiles with npm

```bash
npm install -g @acalcutt/tileserver-gl
```

Once installed, you can use it like the following examples.

using a mbtiles file
```bash
wget https://github.com/acalcutt/tileserver-gl/releases/download/test_data/zurich_switzerland.mbtiles
tileserver-gl --mbtiles zurich_switzerland.mbtiles
[in your browser, visit http://[server ip]:8080]
```

using a config.json + style + mbtiles file
```bash
wget https://github.com/acalcutt/tileserver-gl/releases/download/test_data/test_data.zip
unzip test_data.zip
tileserver-gl
[in your browser, visit http://[server ip]:8080]
```

Alternatively, you can use the `@acalcutt/tileserver-gl-light` npm package instead, which is pure javascript, does not have any native dependencies, and can run anywhere, but does not contain rasterization on the server side made with Maplibre GL Native.

## Getting Started with Docker

An alternative to npm to start the packed software easier is to install [Docker](https://www.docker.com/) on your computer and then run from the tileserver-gl directory

Example using a mbtiles file
```bash
wget https://github.com/acalcutt/tileserver-gl/releases/download/test_data/zurich_switzerland.mbtiles
docker run --rm -it -v $(pwd):/data -p 8080:80 wifidb/tileserver-gl --mbtiles zurich_switzerland.mbtiles
[in your browser, visit http://[server ip]:8080]
```

Example using a config.json + style + mbtiles file
```bash
wget https://github.com/acalcutt/tileserver-gl/releases/download/test_data/test_data.zip
unzip test_data.zip
docker run --rm -it -v $(pwd):/data -p 8080:80 wifidb/tileserver-gl
[in your browser, visit http://[server ip]:8080]
```

Example using a different path
```bash
docker run --rm -it -v /your/local/config/path:/data -p 8080:80 wifidb/tileserver-gl
```
replace '/your/local/config/path' with the path to your config file


Alternatively, you can use the `wifidb/tileserver-gl-light` docker image instead, which is pure javascript, does not have any native dependencies, and can run anywhere, but does not contain rasterization on the server side made with Maplibre GL Native.

## Documentation

You can read full documentation of this project at https://tileserver.readthedocs.io/.
