// Renders the app icons from public/icons/icon.svg (the Seventy3 "73" mark on its dark tile):
// the PWA icons, the Apple touch icon and a 32 px favicon. The SVG itself serves as the
// scalable favicon, and public/icons/logo.svg (no tile) is the mark on the login page.
// Run: node scripts/make-icons.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const dir = path.resolve(process.cwd(), "public/icons");
const svg = readFileSync(path.join(dir, "icon.svg"));

const OUT = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
  ["favicon-32.png", 32],
];

for (const [name, size] of OUT) {
  await sharp(svg, { density: Math.ceil((72 * size) / 512) * 2 })
    .resize(size, size)
    .png()
    .toFile(path.join(dir, name));
  console.log(`wrote public/icons/${name}`);
}
