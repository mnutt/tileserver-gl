import fs from 'node:fs';
import PMTiles from 'pmtiles';

const PMTilesLocalSource = class {
  constructor(file) {
    this.file = file;
  }
  getKey() {
    return this.file.name;
  }
  async getBytes(offset, length) {
    const buffer = Buffer.alloc(length);
    const fd = fs.openSync(this.file, 'r'); //Open the file in read mode
    await ReadBytes(fd, buffer, offset); //Read the specifed bytes from the file
    fs.closeSync(fd); //close the file
    return { data: BufferToArrayBuffer(buffer) };
  }
};

const ReadBytes = async (fd, buffer, offset) => {
  return new Promise((resolve, reject) => {
    fs.read(fd, buffer, 0, buffer.length, offset, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
};

export const GetPMtilesInfo = async (pmtilesFile) => {
  const source = new PMTilesLocalSource(pmtilesFile);
  const pmtiles = new PMTiles.PMTiles(source);
  const header = await pmtiles.getHeader();
  const metadata = await pmtiles.getMetadata();

  //Add missing metadata from header
  const bounds = [header.minLon, header.minLat, header.maxLon, header.maxLat];
  const center = [header.centerLon, header.centerLat, header.centerZoom];

  metadata['bounds'] = bounds;
  metadata['center'] = center;
  metadata['minzoom'] = header.minZoom;
  metadata['maxzoom'] = header.maxZoom;
  metadata['format'] = GetPmtilesTileType(header.tileType).type;

  return { header: header, metadata: metadata };
};

export const GetPMtilesTile = async (pmtilesFile, z, x, y) => {
  const source = new PMTilesLocalSource(pmtilesFile);
  const pmtiles = new PMTiles.PMTiles(source);
  const header = await pmtiles.getHeader();
  const TileType = GetPmtilesTileType(header.tileType);
  let zxyTile = await pmtiles.getZxy(z, x, y);
  if (zxyTile.data !== undefined) {
    zxyTile = ArrayBufferToBuffer(zxyTile.data);
  } else {
    zxyTile = undefined;
  }
  return { data: zxyTile, header: TileType.header };
};

const GetPmtilesTileType = (typenum) => {
  let head = {};
  let tileType;
  switch (typenum) {
    case 0:
      tileType = 'Unknown';
      break;
    case 1:
      tileType = 'pbf';
      head['Content-Type'] = 'application/x-protobuf';
      break;
    case 2:
      tileType = 'png';
      head['Content-Type'] = 'image/png';
      break;
    case 3:
      tileType = 'jpg';
      head['Content-Type'] = 'image/jpeg';
      break;
    case 4:
      tileType = 'webp';
      head['Content-Type'] = 'image/webp';
      break;
    case 5:
      tileType = 'avif';
      head['Content-Type'] = 'image/avif';
      break;
  }
  return { type: tileType, header: head };
};

const BufferToArrayBuffer = (buffer) => {
  const arrayBuffer = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  return arrayBuffer;
};

const ArrayBufferToBuffer = (array_buffer) => {
  var buffer = Buffer.alloc(array_buffer.byteLength);
  var view = new Uint8Array(array_buffer);
  for (var i = 0; i < buffer.length; ++i) {
    buffer[i] = view[i];
  }
  return buffer;
};
