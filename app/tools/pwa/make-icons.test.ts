// tools/pwa/make-icons.ts (Story 1.11): manifest icons with no network — valid PNG signature, IHDR
// size, decodable pixels and identical bytes across two runs.
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { designTokens } from '../../src/core/tokens.generated.ts';
import { buildIcons, encodePng, ICONS, paintIcon } from './make-icons.ts';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function ihdr(png: Buffer): { width: number; height: number; depth: number; colour: number } {
  expect(png.toString('ascii', 12, 16)).toBe('IHDR');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), depth: png[24] ?? -1, colour: png[25] ?? -1 };
}

/** Pixel (x, y) of an RGBA PNG written by encodePng (single IDAT, filter 0 rows). */
function pixel(png: Buffer, x: number, y: number): number[] {
  const { width } = ihdr(png);
  const idatLen = png.readUInt32BE(33);
  expect(png.toString('ascii', 37, 41)).toBe('IDAT');
  const raw = inflateSync(png.subarray(41, 41 + idatLen));
  const at = y * (width * 4 + 1) + 1 + x * 4;
  return [...raw.subarray(at, at + 4)];
}

describe('encodePng', () => {
  it('writes the PNG signature, an RGBA IHDR of the given size and IEND', () => {
    const png = encodePng(3, 2, new Uint8Array(3 * 2 * 4).fill(0x80));
    expect([...png.subarray(0, 8)]).toEqual(SIGNATURE);
    expect(ihdr(png)).toEqual({ width: 3, height: 2, depth: 8, colour: 6 });
    expect(png.toString('ascii', png.length - 8, png.length - 4)).toBe('IEND');
    expect(pixel(png, 2, 1)).toEqual([0x80, 0x80, 0x80, 0x80]);
  });

  it('rejects a buffer of the wrong length', () => {
    expect(() => encodePng(2, 2, new Uint8Array(3))).toThrow(/expected 16 bytes/);
  });
});

describe('icons', () => {
  it('has the four files the manifest and index.html reference, at their sizes', () => {
    expect(ICONS.map((i) => [i.file, i.size, i.purpose])).toEqual([
      ['icon-192.png', 192, 'any'],
      ['icon-512.png', 512, 'any'],
      ['icon-maskable-512.png', 512, 'maskable'],
      ['apple-touch-icon.png', 180, 'any'],
    ]);
    for (const { file, png } of buildIcons()) {
      const size = ICONS.find((i) => i.file === file)?.size;
      expect([...png.subarray(0, 8)]).toEqual(SIGNATURE);
      expect(ihdr(png)).toMatchObject({ width: size, height: size });
    }
  });

  it('is byte-identical across two runs', () => {
    const a = buildIcons();
    const b = buildIcons();
    expect(a.map((i) => i.png.equals(b.find((j) => j.file === i.file)?.png ?? Buffer.alloc(0)))).toEqual([true, true, true, true]);
  });

  it('paints a sky corner, a yellow disc and a white ▶ in the centre; the maskable disc stays in the 80 % safe zone', () => {
    const sky = designTokens.colors.sky.value;
    const play = designTokens.colors.buttonPlay.value;
    const toRgb = (v: number) => [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff, 0xff];
    const png = encodePng(512, 512, paintIcon(512, 'any'));
    expect(pixel(png, 0, 0)).toEqual(toRgb(sky));
    expect(pixel(png, 256, 256)).toEqual([0xff, 0xff, 0xff, 0xff]);
    expect(pixel(png, 256, 256 - 160)).toEqual(toRgb(play));
    const mask = encodePng(512, 512, paintIcon(512, 'maskable'));
    // Safe zone = circle of radius 40 % (204.8 px): everything past ~0.3·512 from the centre is background.
    expect(pixel(mask, 256, 256 - 170)).toEqual(toRgb(sky));
    expect(pixel(mask, 256, 256 - 140)).toEqual(toRgb(play));
  });
});
