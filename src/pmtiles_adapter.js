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
    const sharedBuffer = Buffer.alloc(length);
    const fd = fs.openSync(this.file); // file descriptor
    let bytesRead = 0; // how many bytes were read
  
    for (let i = 0; i < length; i++) {
      let postion = offset + i;
      await ReadBytes(fd, sharedBuffer, postion);
      bytesRead = (i + 1) * length;
      if (bytesRead === length) {
        break;
      }
    }
    fs.closeSync(fd); //close file when finished
    return { data: BufferToArrayBuffer(sharedBuffer) };
  }
};

const ReadBytes = async (fd, sharedBuffer, offset) => {
  return new Promise((resolve, reject) => {
    fs.read(fd, sharedBuffer, 0, sharedBuffer.length, offset, (err) => {
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
