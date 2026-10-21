import { describe, expect, it } from 'vitest';
import { LAYOUTS } from '../content/layouts';
import { createRoad } from './road';

// An L: (0,0) → (100,0) → (100,50).
const L = createRoad([
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
]);

describe('createRoad', () => {
  it('length is the sum of the segments', () => {
    expect(L.length).toBe(150);
  });

  it('project: interior, end and corner points', () => {
    expect(L.project({ x: 40, y: 10 })).toBeCloseTo(40);
    expect(L.project({ x: 110, y: 30 })).toBeCloseTo(130);
    expect(L.project({ x: -20, y: -5 })).toBe(0);
    expect(L.project({ x: 120, y: 90 })).toBe(150);
    expect(L.project({ x: 130, y: -30 })).toBeCloseTo(100);
  });

  it('pointAt: interpolates and clamps', () => {
    expect(L.pointAt(50)).toEqual({ x: 50, y: 0 });
    expect(L.pointAt(125)).toEqual({ x: 100, y: 25 });
    expect(L.pointAt(-5)).toEqual({ x: 0, y: 0 });
    expect(L.pointAt(999)).toEqual({ x: 100, y: 50 });
  });

  it('pointAt(project(p)) round-trips for points on the road', () => {
    for (const s of [0, 33, 100, 140]) expect(L.project(L.pointAt(s))).toBeCloseTo(s);
  });

  it('dirAt: x direction of travel, the segment ahead at a vertex', () => {
    expect(L.dirAt(50, 1)).toBe(1);
    expect(L.dirAt(50, -1)).toBe(-1);
    expect(L.dirAt(100, 1)).toBe(0); // going down the vertical leg
    expect(L.dirAt(100, -1)).toBe(-1); // coming back along the horizontal one
    expect(L.dirAt(120, 1)).toBe(0);
    expect(L.dirAt(50, 0)).toBe(0);
  });

  it('degenerate roads stay safe', () => {
    const empty = createRoad([]);
    expect(empty.length).toBe(0);
    expect(empty.pointAt(10)).toEqual({ x: 0, y: 0 });
    expect(empty.dirAt(0, 1)).toBe(0);
    const dot = createRoad([{ x: 5, y: 6 }, { x: 5, y: 6 }]);
    expect(dot.length).toBe(0);
    expect(dot.project({ x: 0, y: 0 })).toBe(0);
    expect(dot.pointAt(0)).toEqual({ x: 5, y: 6 });
  });

  it('the real map road: every stop and the start project within a few px of the road', () => {
    const layout = LAYOUTS.map;
    const road = createRoad(layout.paths.road ?? []);
    expect(road.length).toBeGreaterThan(1000);
    for (const [id, p] of Object.entries(layout.anchors)) {
      if (!id.endsWith('-stop') && id !== 'kart-start') continue;
      const q = road.pointAt(road.project(p));
      expect(Math.hypot(q.x - p.x, q.y - p.y), id).toBeLessThan(20);
    }
  });
});
