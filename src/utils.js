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

function readBytes(fd, sharedBuffer, offset) {
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
      await readBytes(fd, sharedBuffer, postion);
      bytesRead = (i + 1) * size;
      if(bytesRead > stats.size) {
         // When we reach the end of file, 
         // we have to calculate how many bytes were actually read
         end = size - (bytesRead - stats.size);
      }
      if(bytesRead === size) {break;}
  }

  return sharedBuffer;
}

function BufferToArrayBuffer(buffer) {
  const arrayBuffer = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  const v = new DataView(arrayBuffer);
  return arrayBuffer;
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




export const GetPMtilesInfo = async (pmtilesFile) => {
  var buffer = await ReadBytes(pmtilesFile, 0, 16384)
  const headerBuf = BufferToArrayBuffer(buffer);
  //console.log(headerBuf)
  const header = PMTiles.bytesToHeader(headerBuf, undefined)
  const compression = header.internalCompression
  //console.log(header);

  const jsonMetadataOffset = header.jsonMetadataOffset;
  const jsonMetadataLength = header.jsonMetadataLength;
  var metadataBytes = await ReadBytes(pmtilesFile, jsonMetadataOffset, jsonMetadataLength)
  const metadataBuf = BufferToArrayBuffer(metadataBytes);

  //console.log(metadataBytes)
  var decompressed;
  if (compression === PMTiles.Compression.None || compression === PMTiles.Compression.Unknown) {
    decompressed = metadataBuf;
  } else if (compression === PMTiles.Compression.Gzip) {
    decompressed = fflate.decompressSync(new Uint8Array(metadataBuf));
  } else {
    throw Error("Compression method not supported");
  }
  //console.log(metadata)
  const dec = new TextDecoder("utf-8");
  var metadata = JSON.parse(dec.decode(decompressed));


  const bounds = [header.minLat, header.minLon, header.maxLat, header.maxLon]
  const center = [header.centerLon, header.centerLat, header.centerLat]
  return { header: header, metadata: metadata, bounds: bounds, center: center };
}