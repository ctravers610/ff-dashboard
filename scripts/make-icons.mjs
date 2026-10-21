// Draws the app icons (apps/web/public/icons): a teal football with laces on
// the app's navy background, as PNGs, with no image library. Re-run after
// changing the design: node scripts/make-icons.mjs
//
// The ball stays inside the middle 60% of the square, so the same image works
// as a "maskable" icon, which phones crop to a circle or rounded square.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public', 'icons');
const NAVY = [0x0b, 0x12, 0x20];
const TEAL = [0x5d, 0xca, 0xa5];

// What one point (x, y in -1..1) shows: 0 background, 1 ball, 2 lace (cut out of the ball).
function shade(x, y) {
  // Rotate so the ball points to the upper right, like the app's header icon.
  const angle = Math.PI / 4;
  const u = x * Math.cos(angle) + y * Math.sin(angle);
  const v = -x * Math.sin(angle) + y * Math.cos(angle);
  // A football is a lens: the overlap of two circles, pointed at both ends.
  const a = 0.66; // half length, tip to tip
  const b = 0.34; // half width
  const c = (a * a - b * b) / (2 * b); // each circle's center sits this far off the long axis
  const r = c + b;
  if (u * u + (v - c) ** 2 > r * r || u * u + (v + c) ** 2 > r * r) return 0;
  const line = 0.035;
  if (Math.abs(v) < line && Math.abs(u) < a * 0.5) return 2; // the seam
  for (const k of [-0.2, -0.1, 0, 0.1, 0.2]) {
    if (Math.abs(u - k) < line && Math.abs(v) < b * 0.32) return 2; // stitches
  }
  return 1;
}

function draw(size) {
  const samples = 4; // supersampling, for smooth edges
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = [0]; // PNG filter type: none
    for (let px = 0; px < size; px++) {
      let ball = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = ((px + (sx + 0.5) / samples) / size) * 2 - 1;
          const y = 1 - ((py + (sy + 0.5) / samples) / size) * 2;
          const s = shade(x, y);
          if (s === 1) ball++;
        }
      }
      const n = samples * samples;
      // Laces are cut out of the ball, so they show the navy background.
      const t = ball / n;
      for (let c = 0; c < 3; c++) row.push(Math.round(NAVY[c] * (1 - t) + TEAL[c] * t));
    }
    rows.push(Buffer.from(row));
  }
  return png(size, Buffer.concat(rows));
}

function png(size, raw) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(outDir, { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  fs.writeFileSync(path.join(outDir, name), draw(size));
  console.log(`wrote icons/${name}`);
}
