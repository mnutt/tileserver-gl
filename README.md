![tileserver-gl](https://cloud.githubusercontent.com/assets/59284/18173467/fa3aa2ca-7069-11e6-86b1-0f1266befeb6.jpeg)


# TileServer GL
[![Build Status](https://travis-ci.org/wifidb/tileserver-gl.svg?branch=master)](https://travis-ci.org/wifidb/tileserver-gl)
[![Docker Hub](https://img.shields.io/badge/docker-hub-blue.svg)](https://hub.docker.com/r/wifidb/tileserver-gl/)

Vector and raster maps with GL styles. Server side rendering by Mapbox GL Native. Map tile server for Mapbox GL JS, Android, iOS, Leaflet, OpenLayers, GIS via WMTS, etc.

## Get Started

Make sure you have Node.js version **12** or above installed (up to node 16 has been tested)

Install `@acalcutt/tileserver-gl` with server-side raster rendering of vector tiles with npm

```bash
npm install -g @acalcutt/tileserver-gl
```

Once installed, you can use it like the following example.

using a mbtiles file
```bash
wget https://github.com/acalcutt/tileserver-gl/releases/download/test_data/zurich_switzerland.mbtiles
tileserver-gl zurich_switzerland.mbtiles
```

using a config.json + style + mbtiles file
```bash
wget https://github.com/acalcutt/tileserver-gl/releases/download/test_data/test_data.zip
unzip test_data.zip
tileserver-gl
```

Alternatively, you can use the `tileserver-gl-light` package instead, which is pure javascript (does not have any native dependencies) and can run anywhere, but does not contain rasterization on the server side made with MapBox GL Native.

## Using Docker

An alternative to npm to start the packed software easier is to install [Docker](https://www.docker.com/) on your computer and then run from the tileserver-gl directory

Example using a mbtiles file
```bash
wget https://github.com/acalcutt/tileserver-gl/releases/download/test_data/zurich_switzerland.mbtiles
docker run --rm -it -v $(pwd):/data -p 8080:80 wifidb/tileserver-gl zurich_switzerland.mbtiles
```

Example using a config.json + style + mbtiles file
```bash
wget https://github.com/acalcutt/tileserver-gl/releases/download/test_data/test_data.zip
unzip test_data.zip
docker run --rm -it -v $(pwd):/data -p 8080:80 wifidb/tileserver-gl
```

Example using a different path
docker run --rm -it -v $(pwd):/data -p 8080:80 wifidb/tileserver-gl

This will download and start a ready to use container on your computer and the maps are going to be available in webbrowser on localhost:8080.

On laptop you can use [Docker Kitematic](https://kitematic.com/) and search "tileserver-gl" and run it, then drop in the 'data' folder the MBTiles.

## Documentation

You can read full documentation of this project at https://tileserver.readthedocs.io/.
