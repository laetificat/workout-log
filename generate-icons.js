#!/usr/bin/env node
// Generates PNG app icons for the Workout Log PWA
// Uses only built-in Node.js modules (zlib, fs, Buffer)

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(w, h, rgba) {
  // Raw image: filter byte (0) + RGB per row (no alpha in output for simplicity)
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = y * (1 + w * 3) + 1 + x * 3;
      raw[dst]     = rgba[src];
      raw[dst + 1] = rgba[src + 1];
      raw[dst + 2] = rgba[src + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function createIcon(size) {
  const rgba = new Uint8Array(size * size * 4);

  // Background: #111111
  const BG   = [17,  17,  17,  255];
  // Accent: #c8f96e
  const ACC  = [200, 249, 110, 255];

  function setPixel(x, y, c) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    rgba[i] = c[0]; rgba[i+1] = c[1]; rgba[i+2] = c[2]; rgba[i+3] = c[3];
  }

  function fillRect(x, y, w, h, c) {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        setPixel(x + dx, y + dy, c);
  }

  function fillRoundRect(x, y, w, h, r, c) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const px = x + dx, py = y + dy;
        // Corner check
        const inCornerTL = dx < r && dy < r && (dx-r)*(dx-r)+(dy-r)*(dy-r) > r*r;
        const inCornerTR = dx >= w-r && dy < r && (dx-(w-r-1))*(dx-(w-r-1))+(dy-r)*(dy-r) > r*r;
        const inCornerBL = dx < r && dy >= h-r && (dx-r)*(dx-r)+(dy-(h-r-1))*(dy-(h-r-1)) > r*r;
        const inCornerBR = dx >= w-r && dy >= h-r && (dx-(w-r-1))*(dx-(w-r-1))+(dy-(h-r-1))*(dy-(h-r-1)) > r*r;
        if (!inCornerTL && !inCornerTR && !inCornerBL && !inCornerBR)
          setPixel(px, py, c);
      }
    }
  }

  // Fill entire background
  fillRect(0, 0, size, size, BG);

  // Scale all coordinates from a 512-unit design space
  const sc = (v) => Math.round(v * size / 512);

  // --- Dumbbell design centered in the icon ---
  // The dumbbell spans roughly x: 52..460, y: 180..332 in 512-space
  // That's 408 wide x 152 tall, centered at (256, 256)

  const barR = sc(6); // bar corner radius

  // Central bar: y center=256, height=28
  fillRoundRect(sc(148), sc(242), sc(216), sc(28), barR, ACC);

  // Left collar (thicker section where bar meets weights)
  fillRoundRect(sc(122), sc(222), sc(28), sc(68), sc(4), ACC);

  // Right collar
  fillRoundRect(sc(362), sc(222), sc(28), sc(68), sc(4), ACC);

  // Left inner plate
  fillRoundRect(sc(82), sc(200), sc(42), sc(112), sc(5), ACC);

  // Left outer plate
  fillRoundRect(sc(52), sc(180), sc(32), sc(152), sc(5), ACC);

  // Right inner plate
  fillRoundRect(sc(388), sc(200), sc(42), sc(112), sc(5), ACC);

  // Right outer plate
  fillRoundRect(sc(428), sc(180), sc(32), sc(152), sc(5), ACC);

  return encodePNG(size, size, rgba);
}

const outDir = path.join(__dirname);
fs.writeFileSync(path.join(outDir, 'icon-512.png'), createIcon(512));
fs.writeFileSync(path.join(outDir, 'icon-192.png'), createIcon(192));
fs.writeFileSync(path.join(outDir, 'icon-180.png'), createIcon(180));
console.log('Icons generated: icon-512.png, icon-192.png, icon-180.png');
