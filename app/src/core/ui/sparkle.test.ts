import { describe, expect, it } from 'vitest';
import { sparklePoints } from './sparkle';

describe('sparklePoints (2026-10-22)', () => {
  it('evenly around the centre at the radius, the first straight up, then clockwise', () => {
    const p = sparklePoints({ x: 100, y: 200 }, 50, 4);
    expect(p).toHaveLength(4);
    expect(p[0]!.x).toBeCloseTo(100);
    expect(p[0]!.y).toBeCloseTo(150);
    expect(p[1]!.x).toBeCloseTo(150);
    expect(p[1]!.y).toBeCloseTo(200);
    for (const q of p) expect(Math.hypot(q.x - 100, q.y - 200)).toBeCloseTo(50);
  });
});
