// 依存ライブラリなしで PNG アイコン（16〜1024px）を生成する。
// 紺色の角丸背景に、白いゲージ（下が開いたC字のメーター）を描く（トレイ/アプリ共用）。

import zlib from 'zlib';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'icons');

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

function inRoundedRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || py < y0 || px >= x1 || py >= y1) return false;
  const cxMin = x0 + r, cxMax = x1 - r - 1, cyMin = y0 + r, cyMax = y1 - r - 1;
  if (px < cxMin && py < cyMin) return dist(px, py, cxMin, cyMin) <= r;
  if (px > cxMax && py < cyMin) return dist(px, py, cxMax, cyMin) <= r;
  if (px < cxMin && py > cyMax) return dist(px, py, cxMin, cyMax) <= r;
  if (px > cxMax && py > cyMax) return dist(px, py, cxMax, cyMax) <= r;
  return true;
}

function angleGap(a, b) { return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))); }

function makeIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    const i = (y * size + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  const bgRadius = size * 0.22;
  const cx = size / 2, cy = size / 2;
  const rOuter = size * 0.34, rInner = size * 0.20;
  const gapHalf = Math.PI / 6;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inRoundedRect(x, y, 0, 0, size, size, bgRadius)) set(x, y, 0x5b, 0x6c, 0xff, 255);
      const d = dist(x + 0.5, y + 0.5, cx, cy);
      if (d >= rInner && d <= rOuter) {
        const ang = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
        if (angleGap(ang, Math.PI / 2) > gapHalf) set(x, y, 255, 255, 255, 255);
      }
    }
  }
  return buf;
}

mkdirSync(iconsDir, { recursive: true });
for (const size of [16, 32, 48, 128, 256, 512, 1024]) {
  const png = encodePNG(size, size, makeIcon(size));
  const file = join(iconsDir, `icon${size}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
