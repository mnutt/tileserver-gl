import fs from 'node:fs';
import zlib from 'zlib';
import PMTiles from 'pmtiles';

export const GetPMtilesHeader = async (pmtilesFile) => {
  var buffer = await ReadBytes(pmtilesFile, 0, 127);
  const header = PMTiles.bytesToHeader(buffer, undefined);
  return header;
};

export const GetPMtilesInfo = async (pmtilesFile) => {
  //Get metadata from pmtiles file
  var header = await GetPMtilesHeader(pmtilesFile);
  const metadataBytes = await ReadBytes(
    pmtilesFile,
    header.jsonMetadataOffset,
    header.jsonMetadataLength,
  );
  const metadataDecomp = await GetPMtilesDecompress(header, metadataBytes);
  const dec = new TextDecoder('utf-8');
  const metadata = JSON.parse(dec.decode(metadataDecomp));

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
  const tile_id = PMTiles.zxyToTileId(z, x, y);
  const header = await GetPMtilesHeader(pmtilesFile);

  if (z < header.minZoom || z > header.maxZoom) {
    return undefined;
  }

  let rootDirectoryOffset = header.rootDirectoryOffset;
  let rootDirectoryLength = header.rootDirectoryLength;
  for (let depth = 0; depth <= 3; depth++) {
    const RootDirectoryBytes = await ReadBytes(
      pmtilesFile,
      rootDirectoryOffset,
      rootDirectoryLength,
    );
    const RootDirectoryBytesaDecomp = await GetPMtilesDecompress(
      header,
      RootDirectoryBytes,
    );
    const Directory = deserializeIndex(RootDirectoryBytesaDecomp);
    const entry = PMTiles.findTile(Directory, tile_id);
    if (entry) {
      if (entry.runLength > 0) {
        const EntryBytesArrayBuff = await ReadBytes(
          pmtilesFile,
          header.tileDataOffset + entry.offset,
          entry.length,
        );
        const EntryBytes = ArrayBufferToBuffer(EntryBytesArrayBuff);
        const EntryTileType = GetPmtilesTileType(header.tileType);
        return { data: EntryBytes, header: EntryTileType.header };
      } else {
        rootDirectoryOffset = header.leafDirectoryOffset + entry.offset;
        rootDirectoryLength = entry.length;
      }
    } else {
      return undefined;
    }
  }
};

/**
 *
 * @param typenum
 */
function GetPmtilesTileType(typenum) {
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
}
/**
 *
 * @param buffer
 */
function BufferToArrayBuffer(buffer) {
  const arrayBuffer = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  return arrayBuffer;
}

/**
 *
 * @param ab
 */
function ArrayBufferToBuffer(ab) {
  var buffer = Buffer.alloc(ab.byteLength);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buffer.length; ++i) {
    buffer[i] = view[i];
  }
  return buffer;
}

const ReadBytes = async (filePath, offset, size) => {
  const sharedBuffer = Buffer.alloc(size);
  const fd = fs.openSync(filePath); // file descriptor
  const stats = fs.fstatSync(fd); // file details
  let bytesRead = 0; // how many bytes were read

  for (let i = 0; i < size; i++) {
    let postion = offset + i;
    await ReadFileBytes(fd, sharedBuffer, postion);
    bytesRead = (i + 1) * size;
    if (bytesRead > stats.size) {
      // When we reach the end of file,
      // we have to calculate how many bytes were actually read
      end = size - (bytesRead - stats.size);
    }
    if (bytesRead === size) {
      break;
    }
  }
  fs.closeSync(fd); //close file when finished

  return BufferToArrayBuffer(sharedBuffer);
};

/**
 *
 * @param fd
 * @param sharedBuffer
 * @param offset
 */
function ReadFileBytes(fd, sharedBuffer, offset) {
  return new Promise((resolve, reject) => {
    fs.read(fd, sharedBuffer, 0, sharedBuffer.length, offset, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

export const GetPMtilesDecompress = async (header, buffer) => {
  const compression = header.internalCompression;
  var decompressed;
  if (
    compression === PMTiles.Compression.None ||
    compression === PMTiles.Compression.Unknown
  ) {
    decompressed = buffer;
  } else if (compression === PMTiles.Compression.Gzip) {
    decompressed = zlib.unzipSync(buffer);
  } else {
    throw Error('Compression method not supported');
  }

  return decompressed;
};

/**
 *
 * @param low
 * @param high
 */
function toNum(low, high) {
  return (high >>> 0) * 0x100000000 + (low >>> 0);
}

/**
 *
 * @param l
 * @param p
 */
function readVarintRemainder(l, p) {
  const buf = p.buf;
  let h, b;
  b = buf[p.pos++];
  h = (b & 0x70) >> 4;
  if (b < 0x80) return toNum(l, h);
  b = buf[p.pos++];
  h |= (b & 0x7f) << 3;
  if (b < 0x80) return toNum(l, h);
  b = buf[p.pos++];
  h |= (b & 0x7f) << 10;
  if (b < 0x80) return toNum(l, h);
  b = buf[p.pos++];
  h |= (b & 0x7f) << 17;
  if (b < 0x80) return toNum(l, h);
  b = buf[p.pos++];
  h |= (b & 0x7f) << 24;
  if (b < 0x80) return toNum(l, h);
  b = buf[p.pos++];
  h |= (b & 0x01) << 31;
  if (b < 0x80) return toNum(l, h);
  throw new Error('Expected varint not more than 10 bytes');
}

/**
 *
 * @param p
 */
export function readVarint(p) {
  const buf = p.buf;
  let val, b;

  b = buf[p.pos++];
  val = b & 0x7f;
  if (b < 0x80) return val;
  b = buf[p.pos++];
  val |= (b & 0x7f) << 7;
  if (b < 0x80) return val;
  b = buf[p.pos++];
  val |= (b & 0x7f) << 14;
  if (b < 0x80) return val;
  b = buf[p.pos++];
  val |= (b & 0x7f) << 21;
  if (b < 0x80) return val;
  b = buf[p.pos];
  val |= (b & 0x0f) << 28;

  return readVarintRemainder(val, p);
}

/**
 *
 * @param buffer
 */
function deserializeIndex(buffer) {
  const p = { buf: new Uint8Array(buffer), pos: 0 };
  const numEntries = readVarint(p);

  var entries = [];

  let lastId = 0;
  for (let i = 0; i < numEntries; i++) {
    const v = readVarint(p);
    entries.push({ tileId: lastId + v, offset: 0, length: 0, runLength: 1 });
    lastId += v;
  }

  for (let i = 0; i < numEntries; i++) {
    entries[i].runLength = readVarint(p);
  }

  for (let i = 0; i < numEntries; i++) {
    entries[i].length = readVarint(p);
  }

  for (let i = 0; i < numEntries; i++) {
    const v = readVarint(p);
    if (v === 0 && i > 0) {
      entries[i].offset = entries[i - 1].offset + entries[i - 1].length;
    } else {
      entries[i].offset = v - 1;
    }
  }

  return entries;
}
