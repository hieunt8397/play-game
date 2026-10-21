import { describe, expect, it } from 'vitest';
import { iouReport, silhouetteIoU, type Mask } from './shadow-distinct';

/** A w × h mask filled where `inside(x, y)`. */
function mask(w: number, h: number, inside: (x: number, y: number) => boolean): Mask {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = inside(x, y) ? 1 : 0;
  return { w, h, data };
}

describe('silhouetteIoU (Story 3.6)', () => {
  it('identical masks → 1; the same shape at another size → 1 (scaled to one longest side)', () => {
    const a = mask(40, 20, (x, y) => y > 5 || x < 10);
    expect(silhouetteIoU(a, a)).toBe(1);
    const big = mask(80, 40, (x, y) => y > 11 || x < 20);
    expect(silhouetteIoU(a, big)).toBeGreaterThan(0.97);
  });

  it('disjoint masks → 0; two empty masks → 0', () => {
    const left = mask(40, 40, (x) => x < 20);
    const right = mask(40, 40, (x) => x >= 20);
    expect(silhouetteIoU(left, right)).toBe(0);
    const empty = mask(10, 10, () => false);
    expect(silhouetteIoU(empty, empty)).toBe(0);
  });

  it('bottom-centre alignment: a shorter body standing on the same ground overlaps at its share', () => {
    const tall = mask(20, 40, () => true);
    const half = mask(20, 20, () => true);
    // half → scaled to 128×128, tall → 64×128: the overlap is the tall one's area within the square.
    expect(silhouetteIoU(tall, half)).toBeCloseTo(0.5, 2);
  });

  it('a same-group pair over the threshold fails naming both ids; every pair is an info line; other groups are skipped', () => {
    const body = mask(40, 20, (_x, y) => y > 4);
    const horns = mask(40, 20, (x, y) => y > 4 || x < 4);
    const box = mask(40, 20, () => true);
    const masks = new Map<string, Mask>([
      ['horse', body],
      ['donkey', body],
      ['cow', horns],
      ['truck', box],
    ]);
    const items = [
      { id: 'horse', shapeGroup: 'quadruped' },
      { id: 'donkey', shapeGroup: 'quadruped' },
      { id: 'cow', shapeGroup: 'quadruped' },
      { id: 'truck', shapeGroup: 'truck' },
    ];
    const r = iouReport(masks, items, 0.85);
    expect(r.info).toHaveLength(3);
    expect(r.problems.some((p) => p.includes('"horse" and "donkey"') && p.includes('IoU 1.000'))).toBe(true);
    expect(r.problems.every((p) => !p.includes('truck'))).toBe(true);
  });
});
