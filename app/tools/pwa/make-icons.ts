// `npm run pwa:icons` (Story 1.11) — writes the PWA / Home-Screen icons to public/icons/ with no
// network and no image library: a sky background, a yellow `button-play` disc and a white ▶,
// painted with 4×4 supersampling and encoded by a tiny PNG encoder (node:zlib deflate + crc32).
// Output is deterministic (byte-identical on rerun). The icons are committed and can be replaced
// later by real artwork with the same file names and sizes.
//   icon-192.png, icon-512.png       manifest icons (purpose "any")
//   icon-maskable-512.png            manifest icon (purpose "maskable"): content inside the 80 % safe zone
//   apple-touch-icon.png (180²)      <link rel="apple-touch-icon"> for iPadOS Home Screen
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { designTokens } from '../../src/core/tokens.generated.ts';

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ICON_DIR = join(APP_DIR, 'public', 'icons');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** IHDR: 8-bit depth, colour type 6 (RGBA), deflate, filter method 0, no interlace; each row is unfiltered (filter type 0). */
const BIT_DEPTH = 8;
const COLOR_RGBA = 6;
const FILTER_NONE = 0;
const ZLIB_LEVEL = 9;

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** Encodes `rgba` (w·h·4 bytes, row-major) as a PNG. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== width * height * 4) throw new Error(`encodePng: expected ${width * height * 4} bytes, got ${rgba.length}`);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = BIT_DEPTH;
  ihdr[9] = COLOR_RGBA;
  // [10] compression 0, [11] filter method 0, [12] interlace 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = FILTER_NONE;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: ZLIB_LEVEL })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

type Rgb = readonly [number, number, number];

const rgb = (value: number): Rgb => [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];

const SKY = rgb(designTokens.colors.sky.value);
const PLAY = rgb(designTokens.colors.buttonPlay.value);
const WHITE: Rgb = [0xff, 0xff, 0xff];

/** Disc radius as a fraction of the icon size: "any" icons fill more; maskable stays in the 40 %-radius safe circle. */
const DISC_RADIUS = { any: 0.4, maskable: 0.3 } as const;
/** ▶ size relative to the disc radius: half-height and the centroid shift right so it looks centred. */
const TRIANGLE_HALF_HEIGHT = 0.5;
const TRIANGLE_WIDTH = 0.866 * 2 * TRIANGLE_HALF_HEIGHT;
const SUPERSAMPLE = 4;

export type IconPurpose = keyof typeof DISC_RADIUS;

/** Inside the ▶ whose centroid is (cx, cy), pointing right, of half-height h and width w. */
function inTriangle(x: number, y: number, cx: number, cy: number, h: number, w: number): boolean {
  const left = cx - w / 3;
  const right = cx + (2 * w) / 3;
  if (x < left || x > right) return false;
  const halfAt = h * ((right - x) / w);
  return Math.abs(y - cy) <= halfAt;
}

function colourAt(x: number, y: number, size: number, purpose: IconPurpose): Rgb {
  const c = size / 2;
  const r = size * DISC_RADIUS[purpose];
  const dx = x - c;
  const dy = y - c;
  if (dx * dx + dy * dy > r * r) return SKY;
  if (inTriangle(x, y, c, c, r * TRIANGLE_HALF_HEIGHT, r * TRIANGLE_WIDTH)) return WHITE;
  return PLAY;
}

/** Paints one square icon as RGBA (opaque; iOS fills transparent touch-icon pixels with black). */
export function paintIcon(size: number, purpose: IconPurpose): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const n = SUPERSAMPLE * SUPERSAMPLE;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const [cr, cg, cb] = colourAt(px + (sx + 0.5) / SUPERSAMPLE, py + (sy + 0.5) / SUPERSAMPLE, size, purpose);
          r += cr;
          g += cg;
          b += cb;
        }
      }
      const i = (py * size + px) * 4;
      out[i] = Math.round(r / n);
      out[i + 1] = Math.round(g / n);
      out[i + 2] = Math.round(b / n);
      out[i + 3] = 0xff;
    }
  }
  return out;
}

/** The icon set: file name → size and purpose. Paths match the manifest in vite.config.ts and index.html. */
export const ICONS = [
  { file: 'icon-192.png', size: 192, purpose: 'any' },
  { file: 'icon-512.png', size: 512, purpose: 'any' },
  { file: 'icon-maskable-512.png', size: 512, purpose: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, purpose: 'any' },
] as const satisfies ReadonlyArray<{ file: string; size: number; purpose: IconPurpose }>;

/** PNG bytes of every icon, by file name. */
export function buildIcons(): Array<{ file: string; png: Buffer }> {
  return ICONS.map(({ file, size, purpose }) => ({ file, png: encodePng(size, size, paintIcon(size, purpose)) }));
}

function main(): void {
  mkdirSync(ICON_DIR, { recursive: true });
  for (const { file, png } of buildIcons()) {
    writeFileSync(join(ICON_DIR, file), png);
    console.log(`pwa:icons: wrote public/icons/${file} (${png.length} bytes)`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
