// Story 1.9: the hint ring contrast rule (pure part) and its ring geometry.
import { describe, expect, it } from 'vitest';
import { Tokens } from '../../src/core/tokens.ts';
import { contrastRatio, iceCreamRings, mapRings, outsidePoints, ringContrastProblems, ringLayers, ringReach, RING_SAMPLES, type Rgb } from './hint-contrast.ts';

const PINK: Rgb = [0xff, 0xc6, 0xe4];
const GRASS: Rgb = [0x5c, 0xb8, 0x4a];
/** Mid grey: just under 3:1 against white and against the purple line. */
const GREY: Rgb = [149, 149, 149];

describe('ringContrastProblems', () => {
  it('contrast ratios follow WCAG', () => {
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21);
    expect(contrastRatio(GREY, ringLayers().core)).toBeLessThan(3);
    expect(contrastRatio(GREY, ringLayers().line)).toBeLessThan(3);
  });

  it('a counter or grass pixel passes (against the line or the core)', () => {
    expect(ringContrastProblems('ice-cream', [{ label: 'slot.scoop-1', pixels: [PINK, GRASS, [255, 255, 255]] }])).toEqual([]);
  });

  it('a pixel below 3:1 on both layers fails, naming the screen and the slot', () => {
    const problems = ringContrastProblems('ice-cream', [{ label: 'slot.scoop-2', pixels: [PINK, GREY] }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"ice-cream" slot.scoop-2');
    expect(problems[0]).toContain('1/2');
  });
});

describe('ring geometry', () => {
  it('samples 32 points just outside the halo at the largest pulse', () => {
    const pts = outsidePoints({ cx: 100, cy: 100, rx: 50, ry: 40 });
    expect(pts).toHaveLength(RING_SAMPLES);
    expect(pts[0]!.x).toBeCloseTo(100 + 50 * Tokens.components.hintRing.pulse.to + ringReach());
  });

  it('ice-cream: one ring per slot.scoop-*, from the frame bounds + pad, or the minSize circle without an atlas', () => {
    const layout = {
      v: 1 as const,
      screenId: 'ice-cream',
      design: { width: 1024, height: 768 },
      renderScale: 2,
      anchors: {},
      hits: {},
      paths: {},
      slots: { 'scoop-1': { x: 152, y: 520 }, 'scoop-2': { x: 332, y: 520 }, 'cone-1': { x: 512, y: 400 } },
    };
    const pad = Tokens.ui.hintRingPad;
    const bare = iceCreamRings(layout, undefined);
    expect(bare.map((r) => r.label)).toEqual(['slot.scoop-1', 'slot.scoop-2']);
    expect(bare[0]!.ring).toEqual({ cx: 152, cy: 520, rx: 45 + pad, ry: 45 + pad });
    const atlas = { frames: { 'scoop-vanilla/idle/00': { spriteSourceSize: { x: 544, y: 908, w: 230, h: 168 } } } };
    const withAtlas = iceCreamRings(layout, atlas);
    expect(withAtlas[1]!.ring).toEqual({ cx: 329.5, cy: 496, rx: 57.5 + pad, ry: 42 + pad });
    expect(withAtlas[0]!.ring.cx).toBeCloseTo(149.5);
  });

  it('map: the ellipse inscribed in each hit bbox', () => {
    const rings = mapRings({
      v: 1,
      screenId: 'map',
      design: { width: 1024, height: 768 },
      renderScale: 2,
      anchors: {},
      slots: {},
      paths: {},
      hits: { pizza: [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 60, y: 80 }] },
    });
    expect(rings).toEqual([{ label: 'station pizza', ring: { cx: 60, cy: 50, rx: 50, ry: 30 } }]);
  });
});
