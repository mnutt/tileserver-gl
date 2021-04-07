const { loadImage, createCanvas, ImageData, Image } = require('canvas');
const { memoize } = require('./memoize');
const sharp = require('sharp');

const oneDay = 24 * 60 * 60 * 1000;
const sizes = { s: "s", m: "m", l: "l" };

async function getImageData(path) {
  return
}

async function _templateForSize(size) {
  const path = `${__dirname}/../../images/marker-${sizes[size]}.png`;
  const inputData = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  const data = new Uint32Array(inputData.data.buffer);

  let mask = [];

  for (let i = 0, len = data.length; i < len; i++) {
    // Data is in ARGB format, check if red channel is 255
    //console.log(data[i] >> 24 & 255);
    if ((data[i] >> 16) & 255 === 255) {
      const alpha = (data[i] >> 24) & 255;
      mask.push([i, alpha]);
    }
  }

  return {
    buffer: inputData.data.buffer,
    width: inputData.info.width,
    height: inputData.info.height,
    mask: mask
  };
}

const templateForSize = memoize(_templateForSize);

exports.create = async function create(size, hex) {
  const { result } = await templateForSize(size, oneDay, size);
  const template = await result;

  if(!template) {
    throw new Error("Missing marker size");
  }

  const { width, height } = template;

  // Make a duplicate buffer so as not to modify the original
  const buffer = template.buffer.slice(0);
  const argb = new Uint32Array(buffer);

  let color = parseInt(hex, 16);
  const r = color >> 16 & 255;
  const g = color >> 8 & 255;
  const b = color & 255;

  function debugColor(color) {
    console.log(color >> 24 & 255, color >> 16 & 255, color >> 8 & 255, color & 255);
  }

  // Fill in all of the color-masked areas with the new color + source alpha channel
  for (let [i, alpha] of template.mask) {
      argb[i] = (alpha << 24) | (b << 16) | (g << 8) | r;
  }

  debugColor(argb[460]);

  const image = createCanvas(width, height);
  const ctx = image.getContext('2d');
  const imageData = new ImageData(new Uint8ClampedArray(buffer), width, height);
  ctx.putImageData(imageData, 0, 0);

  return image;
};

exports.createCached = memoize(exports.create);
