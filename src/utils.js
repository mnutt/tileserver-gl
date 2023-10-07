'use strict';

import path from 'path';
import fs from 'node:fs';
import * as fflate from 'fflate';

import clone from 'clone';
import glyphCompose from '@mapbox/glyph-pbf-composite';
import PMTiles from 'pmtiles';

/**
 * Generate new URL object
 * @param req
 * @params {object} req - Express request
 * @returns {URL} object
 */
const getUrlObject = (req) => {
  const urlObject = new URL(`${req.protocol}://${req.headers.host}/`);
  // support overriding hostname by sending X-Forwarded-Host http header
  urlObject.hostname = req.hostname;
  return urlObject;
};

export const getPublicUrl = (publicUrl, req) => {
  if (publicUrl) {
    return publicUrl;
  }
  return getUrlObject(req).toString();
};

export const getTileUrls = (req, domains, path, format, publicUrl, aliases) => {
  const urlObject = getUrlObject(req);
  if (domains) {
    if (domains.constructor === String && domains.length > 0) {
      domains = domains.split(',');
    }
    const hostParts = urlObject.host.split('.');
    const relativeSubdomainsUsable =
      hostParts.length > 1 &&
      !/^([0-9]{1,3}\.){3}[0-9]{1,3}(\:[0-9]+)?$/.test(urlObject.host);
    const newDomains = [];
    for (const domain of domains) {
      if (domain.indexOf('*') !== -1) {
        if (relativeSubdomainsUsable) {
          const newParts = hostParts.slice(1);
          newParts.unshift(domain.replace('*', hostParts[0]));
          newDomains.push(newParts.join('.'));
        }
      } else {
        newDomains.push(domain);
      }
    }
    domains = newDomains;
  }
  if (!domains || domains.length == 0) {
    domains = [urlObject.host];
  }

  const queryParams = [];
  if (req.query.key) {
    queryParams.push(`key=${encodeURIComponent(req.query.key)}`);
  }
  if (req.query.style) {
    queryParams.push(`style=${encodeURIComponent(req.query.style)}`);
  }
  const query = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

  if (aliases && aliases[format]) {
    format = aliases[format];
  }

  const uris = [];
  if (!publicUrl) {
    for (const domain of domains) {
      uris.push(
        `${req.protocol}://${domain}/${path}/{z}/{x}/{y}.${format}${query}`,
      );
    }
  } else {
    uris.push(`${publicUrl}${path}/{z}/{x}/{y}.${format}${query}`);
  }

  return uris;
};

export const fixTileJSONCenter = (tileJSON) => {
  if (tileJSON.bounds && !tileJSON.center) {
    const fitWidth = 1024;
    const tiles = fitWidth / 256;
    tileJSON.center = [
      (tileJSON.bounds[0] + tileJSON.bounds[2]) / 2,
      (tileJSON.bounds[1] + tileJSON.bounds[3]) / 2,
      Math.round(
        -Math.log((tileJSON.bounds[2] - tileJSON.bounds[0]) / 360 / tiles) /
          Math.LN2,
      ),
    ];
  }
};

const getFontPbf = (allowedFonts, fontPath, name, range, fallbacks) =>
  new Promise((resolve, reject) => {
    if (!allowedFonts || (allowedFonts[name] && fallbacks)) {
      const filename = path.join(fontPath, name, `${range}.pbf`);
      if (!fallbacks) {
        fallbacks = clone(allowedFonts || {});
      }
      delete fallbacks[name];
      fs.readFile(filename, (err, data) => {
        if (err) {
          console.error(`ERROR: Font not found: ${name}`);
          if (fallbacks && Object.keys(fallbacks).length) {
            let fallbackName;

            let fontStyle = name.split(' ').pop();
            if (['Regular', 'Bold', 'Italic'].indexOf(fontStyle) < 0) {
              fontStyle = 'Regular';
            }
            fallbackName = `Noto Sans ${fontStyle}`;
            if (!fallbacks[fallbackName]) {
              fallbackName = `Open Sans ${fontStyle}`;
              if (!fallbacks[fallbackName]) {
                fallbackName = Object.keys(fallbacks)[0];
              }
            }

            console.error(`ERROR: Trying to use ${fallbackName} as a fallback`);
            delete fallbacks[fallbackName];
            getFontPbf(null, fontPath, fallbackName, range, fallbacks).then(
              resolve,
              reject,
            );
          } else {
            reject(`Font load error: ${name}`);
          }
        } else {
          resolve(data);
        }
      });
    } else {
      reject(`Font not allowed: ${name}`);
    }
  });

export const getFontsPbf = (
  allowedFonts,
  fontPath,
  names,
  range,
  fallbacks,
) => {
  const fonts = names.split(',');
  const queue = [];
  for (const font of fonts) {
    queue.push(
      getFontPbf(
        allowedFonts,
        fontPath,
        font,
        range,
        clone(allowedFonts || fallbacks),
      ),
    );
  }

  return Promise.all(queue).then((values) => glyphCompose.combine(values));
};

function ReadFileBytes(fd, sharedBuffer, offset) {
  return new Promise((resolve, reject) => {
      fs.read(
          fd, 
          sharedBuffer,
          0,
          sharedBuffer.length,
          offset,
          (err) => {
              if(err) { return reject(err); }
              resolve();
          }
      );
  });
}

const ReadBytes = async (filePath, offset, size) => {
  const sharedBuffer = Buffer.alloc(size);
  const stats = fs.statSync(filePath); // file details
  const fd = fs.openSync(filePath); // file descriptor
  let bytesRead = 0; // how many bytes were read
  let end = size; 
  
  for(let i = 0; i < size; i++) {
      let postion = offset + i
      await ReadFileBytes(fd, sharedBuffer, postion);
      bytesRead = (i + 1) * size;
      if(bytesRead > stats.size) {
         // When we reach the end of file, 
         // we have to calculate how many bytes were actually read
         end = size - (bytesRead - stats.size);
      }
      if(bytesRead === size) {break;}
  }

  return BufferToArrayBuffer(sharedBuffer);
}

function BufferToArrayBuffer(buffer) {
  const arrayBuffer = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  return arrayBuffer;
}

function ArrayBufferToBuffer(ab) {
  var buffer = Buffer.alloc(ab.byteLength);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buffer.length; ++i) {
      buffer[i] = view[i];
  }
  return buffer;
}

const PMTilesLocalSource = class {
  constructor(file) {
    this.file = file;
  }
  getKey() {
    return this.file.name;
  }
  async getBytes(offset, length) {
    const blob = this.file.slice(offset, offset + length);
    return { data: blob };
  }
};

export const GetPMtilesHeader = async (pmtilesFile) => {
  var buffer = await ReadBytes(pmtilesFile, 0, 127)
  const header = PMTiles.bytesToHeader(buffer, undefined)
  return header
}

export const GetPMtilesDecompress = async (header, buffer) => {
  const compression = header.internalCompression;
  var decompressed;
  if (compression === PMTiles.Compression.None || compression === PMTiles.Compression.Unknown) {
    decompressed = buffer;
  } else if (compression === PMTiles.Compression.Gzip) {
    decompressed = fflate.decompressSync(new Uint8Array(buffer));
  } else {
    throw Error("Compression method not supported");
  }

  return decompressed
}

export const GetPMtilesInfo = async (pmtilesFile) => {
  var header = await GetPMtilesHeader(pmtilesFile)
  const jsonMetadataOffset = header.jsonMetadataOffset;
  const jsonMetadataLength = header.jsonMetadataLength;
  const compression = header.internalCompression;
  const metadataBytes = await ReadBytes(pmtilesFile, jsonMetadataOffset, jsonMetadataLength)
  const metadataDecomp = await GetPMtilesDecompress(header, metadataBytes)
  const dec = new TextDecoder("utf-8");
  const metadata = JSON.parse(dec.decode(metadataDecomp));

  var tileType
  switch (header.tileType) {
    case 0:
      tileType = "Unknown"
      break;
    case 1:
      tileType = "pbf"
      break;
    case 2:
      tileType = "png"
      break;
    case 3:
      tileType = "jpg"
      break;
    case 4:
      tileType = "webp"
      break;
    case 5:
      tileType = "avif"
      break;
  }
  metadata['format'] = tileType;

  if(header.minLat != 0 && header.minLon != 0 && header.maxLat != 0 && header.maxLon != 0) {
    const bounds = [header.minLat, header.minLon, header.maxLat, header.maxLon]
    metadata['bounds'] = bounds;
  }
  if(header.centerLon != 0 && header.centerLat != 0) {
    const center = [header.centerLon, header.centerLat, header.centerLat]
    metadata['center'] = center;
  }
  metadata['minzoom'] = header.minZoom;
  metadata['maxzoom'] = header.maxZoom;

  return { header: header, metadata: metadata };
}

function toNum(low, high) {
  return (high >>> 0) * 0x100000000 + (low >>> 0);
}

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
  throw new Error("Expected varint not more than 10 bytes");
}

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

export const GetPMtilesTile = async (pmtilesFile, z, x, y) => {
  const tile_id = PMTiles.zxyToTileId(z, x, y);
  const header = await GetPMtilesHeader(pmtilesFile)

  if (z < header.minZoom || z > header.maxZoom) {
    return undefined;
  }

  let rootDirectoryOffset = header.rootDirectoryOffset;
  let rootDirectoryLength = header.rootDirectoryLength;
  for (let depth = 0; depth <= 3; depth++) {
    const RootDirectoryBytes = await ReadBytes(pmtilesFile, rootDirectoryOffset, rootDirectoryLength)
    const RootDirectoryBytesaDecomp = await GetPMtilesDecompress(header, RootDirectoryBytes)
    const Directory = deserializeIndex(RootDirectoryBytesaDecomp)
    const entry = PMTiles.findTile(Directory, tile_id);
    if (entry) {
      if (entry.runLength > 0) {
        const EntryBytesArrayBuff = await ReadBytes(pmtilesFile, header.tileDataOffset + entry.offset, entry.length)
        const EntryBytes = ArrayBufferToBuffer(EntryBytesArrayBuff)
        //const EntryDecomp = await GetPMtilesDecompress(header, EntryBytes)
        const EntryTileType = GetPmtilesTileType(header.tileType)
        return {data: EntryBytes, header: EntryTileType.header}

      } else {
        rootDirectoryOffset = header.leafDirectoryOffset + entry.offset;
        rootDirectoryLength = entry.length;
      }
    } else {
      return undefined;
    }
  }
}

function GetPmtilesTileType(typenum) {
  let head = {};
  let tileType
  switch (typenum) {
    case 0:
      tileType = "Unknown"
      break;
    case 1:
      tileType = "pbf"
      head['Content-Type'] = 'application/x-protobuf';
      break;
    case 2:
      tileType = "png"
      head['Content-Type'] = 'image/png';
      break;
    case 3:
      tileType = "jpg"
      head['Content-Type'] = 'image/jpeg';
      break;
    case 4:
      tileType = "webp"
      head['Content-Type'] = 'image/webp';
      break;
    case 5:
      tileType = "avif"
      head['Content-Type'] = 'image/avif';
      break;
  }
  return {type: tileType, header: head}
}