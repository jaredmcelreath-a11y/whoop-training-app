// Writes public/icons/icon-192.png and icon-512.png: a dark square with a green
// ring (a recovery-dial mark). No dependencies: raw RGBA rows, zlib, PNG chunks.
// Run: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

const BG = [0x12, 0x16, 0x1b];
const RING = [0x2f, 0xd0, 0x8a];
const DOT = [0xe9, 0xed, 0xf2];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function icon(size) {
  const c = size / 2;
  // Keep the mark inside the maskable safe zone (inner 80%).
  const outer = size * 0.3;
  const inner = size * 0.22;
  const dot = size * 0.07;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      // Leave a gap in the ring at the top-right, like a dial.
      const angle = Math.atan2(y + 0.5 - c, x + 0.5 - c);
      const inGap = angle > -Math.PI / 2 && angle < -Math.PI / 4;
      let px = BG;
      if (d <= outer && d >= inner && !inGap) px = RING;
      else if (d <= dot) px = DOT;
      const i = row + 1 + x * 4;
      raw[i] = px[0];
      raw[i + 1] = px[1];
      raw[i + 2] = px[2];
      raw[i + 3] = 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = path.resolve(import.meta.dirname, "..", "public", "icons");
mkdirSync(dir, { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(path.join(dir, `icon-${size}.png`), icon(size));
  console.log(`wrote public/icons/icon-${size}.png`);
}
