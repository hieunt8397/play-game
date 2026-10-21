import { describe, expect, it } from 'vitest';
import { clipHalfPlane, convexHull, distToPolyline, minWidth, padHull, pointInPolygon, polygonDistance, separatePair } from './geometry.ts';

const sq = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

describe('geometry', () => {
  it('convexHull drops interior and collinear points', () => {
    const hull = convexHull([...sq(0, 0, 10), { x: 5, y: 5 }, { x: 5, y: 0 }, { x: 0, y: 0 }]);
    expect(hull).toHaveLength(4);
    expect(convexHull([{ x: 1, y: 1 }])).toHaveLength(1);
  });

  it('padHull grows a polygon by at least the pad everywhere', () => {
    const padded = padHull(sq(0, 0, 100), 24);
    expect(minWidth(padded)).toBeGreaterThanOrEqual(148);
    expect(minWidth(padded)).toBeLessThan(150);
    for (const p of [{ x: -23.9, y: 50 }, { x: 50, y: 123.9 }, { x: -16.9, y: -16.9 }]) expect(pointInPolygon(p, padded)).toBe(true);
  });

  it('minWidth is the calipers width', () => {
    expect(minWidth(sq(0, 0, 80))).toBeCloseTo(80);
    expect(minWidth([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: 30 }])).toBeCloseTo(30);
  });

  it('polygonDistance is 0 when they intersect or contain', () => {
    expect(polygonDistance(sq(0, 0, 10), sq(5, 5, 10))).toBe(0);
    expect(polygonDistance(sq(0, 0, 100), sq(10, 10, 5))).toBe(0);
    expect(polygonDistance(sq(0, 0, 10), sq(40, 0, 10))).toBeCloseTo(30);
  });

  it('pointInPolygon and distToPolyline', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, sq(0, 0, 10))).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, sq(0, 0, 10))).toBe(false);
    expect(distToPolyline({ x: 5, y: 3 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBeCloseTo(3);
    expect(distToPolyline({ x: 13, y: 4 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBeCloseTo(5);
  });

  it('clipHalfPlane keeps one side of a line', () => {
    const clipped = clipHalfPlane(sq(0, 0, 10), { x: 1, y: 0 }, 4);
    expect(Math.max(...clipped.map((p) => p.x))).toBeCloseTo(4);
    expect(minWidth(clipped)).toBeCloseTo(4);
  });

  it('separatePair leaves the gap between overlapping polygons', () => {
    const [a, b] = separatePair(sq(0, 0, 100), sq(80, 0, 100), 40);
    expect(polygonDistance(a, b)).toBeGreaterThanOrEqual(40 - 1e-9);
    expect(minWidth(a)).toBeCloseTo(70);
    expect(minWidth(b)).toBeCloseTo(70);
    const far = separatePair(sq(0, 0, 10), sq(100, 0, 10), 40);
    expect(far[0]).toEqual(sq(0, 0, 10));
  });
});
