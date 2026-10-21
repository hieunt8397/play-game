// Story 3.5: the measured shadow contrast on the ledges, the cave luminance and the shadow-match ring sites.
import { describe, expect, it } from 'vitest';
import type { ScreenLayout } from '../../src/content/layout-types.ts';
import { Tokens } from '../../src/core/tokens.ts';
import {
  caveLuminanceProblems,
  percentileLuminance,
  rgbOf,
  shadowContrastProblems,
  shadowMatchPlateProblems,
  shadowMatchRings,
  shadowSites,
  type RawImage,
  type Rgb,
} from './hint-contrast.ts';
import { join } from 'node:path';

const SHADOW = rgbOf(Tokens.colors.shadowTarget.value);

/** A w×h RGB image filled with `fill`, with `paint(x, y)` overriding single pixels. */
function image(w: number, h: number, fill: Rgb, paint: (x: number, y: number) => Rgb | undefined = () => undefined): RawImage {
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = paint(x, y) ?? fill;
      data.set(c, (y * w + x) * 3);
    }
  }
  return { data, width: w, height: h, channels: 3 };
}

const site = { label: 'slot.shadow-2-1', x0: 0, y0: 0, x1: 20, y1: 20 };

describe('shadowContrastProblems (Story 3.5)', () => {
  it('a bright ledge passes ≥ 5:1 against the shadow colour; the flat cave-mouth token alone is borderline', () => {
    expect(shadowContrastProblems(image(20, 20, [250, 245, 235]), [site], SHADOW)).toEqual([]);
    // DESIGN's caveMouth #E9D8B4 is only ≈ 5:1 flat: any shading below it fails, hence LEDGE_EMISSION.
    const flat = rgbOf(Tokens.colors.caveMouth.value);
    expect(shadowContrastProblems(image(20, 20, flat), [site], SHADOW, 5.05)).toHaveLength(1);
  });

  it('a ledge rendered too dark fails naming the slot', () => {
    const p = shadowContrastProblems(image(20, 20, [190, 180, 160]), [site], SHADOW);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^shadow contrast "shadow-match" slot\.shadow-2-1: the ledge under the shadow gives [0-9.]+:1 against the shadow colour \(min 5:1/);
  });

  it('the 5th percentile: a few dark pixels (≤ 5 %) are tolerated, more are not', () => {
    const few = image(20, 20, [250, 245, 235], (x, y) => (y === 0 && x < 15 ? [20, 20, 20] : undefined)); // 15 / 400
    expect(shadowContrastProblems(few, [site], SHADOW)).toEqual([]);
    const many = image(20, 20, [250, 245, 235], (_x, y) => (y < 2 ? [20, 20, 20] : undefined)); // 40 / 400
    expect(shadowContrastProblems(many, [site], SHADOW)).toHaveLength(1);
    expect(percentileLuminance(many, site, 0)).toBeLessThan(0.01);
  });

  it('a site off the plate fails', () => {
    expect(shadowContrastProblems(image(20, 20, [255, 255, 255]), [{ ...site, x0: 40, x1: 60 }], SHADOW)).toEqual(['shadow contrast "shadow-match" slot.shadow-2-1: the site is outside the plate']);
  });
});

describe('caveLuminanceProblems (Story 3.5)', () => {
  const poly = [
    { x: 2, y: 2 },
    { x: 8, y: 2 },
    { x: 8, y: 8 },
    { x: 2, y: 8 },
  ];

  it('a bright cave passes; one dark pixel inside hit.cave fails; dark pixels outside it do not count', () => {
    expect(caveLuminanceProblems(image(20, 20, [240, 235, 220], (x) => (x > 17 ? [0, 0, 0] : undefined)), poly, 2)).toEqual([]);
    const dark = image(20, 20, [240, 235, 220], (x, y) => (x === 10 && y === 10 ? [10, 10, 10] : undefined));
    const p = caveLuminanceProblems(dark, poly, 2);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^cave luminance "shadow-match" hit\.cave: 1\/144 pixels are darker than 0\.35/);
  });

  it('a missing polygon is reported', () => {
    expect(caveLuminanceProblems(image(4, 4, [255, 255, 255]), [], 2)).toEqual(['cave luminance "shadow-match" hit.cave: missing']);
  });
});

describe('shadow-match ring sites (Story 3.5)', () => {
  const layout = {
    v: 1,
    screenId: 'shadow-match',
    design: { width: 1024, height: 768 },
    renderScale: 2,
    anchors: { triceratops: { x: 470, y: 492 }, 'triceratops-hand': { x: 508, y: 560 } },
    hits: {},
    slots: { 'shadow-2-1': { x: 150, y: 385 }, 'shadow-2-2': { x: 830, y: 385 } },
    paths: {},
  } as unknown as ScreenLayout;

  it('a ring of shadowR + pad on every shadow slot and one of heldR + pad at the hand; ui.shadowItemPx without an atlas', () => {
    const pad = Tokens.ui.hintRingPad;
    const atlas = { frames: { 'item-horse/color/00': { spriteSourceSize: { x: 0, y: 0, w: 320, h: 200 } } } };
    const rings = shadowMatchRings(layout, atlas);
    expect(rings.map((r) => r.label)).toEqual(['slot.shadow-2-1', 'slot.shadow-2-2', 'anchor.triceratops-hand']);
    expect(rings[0]!.ring).toEqual({ cx: 150, cy: 385, rx: 80 + pad, ry: 80 + pad });
    expect(rings[2]!.ring.rx).toBeCloseTo(80 * Tokens.ui.shadowHeldScale + pad);
    expect(shadowMatchRings(layout, undefined)[0]!.ring.rx).toBe(Tokens.ui.shadowItemPx / 2 + pad);
  });

  it('the shadow sites are the shadowR squares of the shadow slots, in plate px', () => {
    expect(shadowSites(layout, 75)).toEqual([
      { label: 'slot.shadow-2-1', x0: 150, y0: 620, x1: 450, y1: 920 },
      { label: 'slot.shadow-2-2', x0: 1510, y0: 620, x1: 1810, y1: 920 },
    ]);
  });

  it('the real bg.shadow-match passes the measured contrast and the cave luminance', async () => {
    const app = join(import.meta.dirname, '..', '..');
    expect(await shadowMatchPlateProblems(join(app, 'public'), join(app, 'src', 'content', 'generated'))).toEqual([]);
  });
});

describe('raceRings (Story 4.1)', () => {
  it('a ring of kart.size + 2·hintRingPad at each road start', async () => {
    const { raceRings } = await import('./hint-contrast.ts');
    const layout = { paths: { 'straight-1': [{ x: 150, y: 400 }, { x: 880, y: 400 }] } } as unknown as ScreenLayout;
    const r = Tokens.components.kart.size / 2 + Tokens.ui.hintRingPad;
    expect(raceRings(layout)).toEqual([{ label: 'path straight-1 start', ring: { cx: 150, cy: 400, rx: r, ry: r } }]);
  });
});
