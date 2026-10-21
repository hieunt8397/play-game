import { describe, expect, it } from 'vitest';
import { LayoutError, formatLayout, round1, toLayout, type RawObject, type RawProjection } from './to-layout.ts';
import { minWidth, polygonDistance } from './geometry.ts';

const design = { width: 1024, height: 768 };
const opts = { design, hitPad: 24 };

const raw = (objects: RawObject[]): RawProjection => ({ screenId: 'map', render: { width: 2048, height: 1536 }, objects, frames: [] });
const pt = (x: number, y: number): number[] => [x, y, 10];
const box = (name: string, x: number, y: number, s: number): RawObject => ({
  name,
  type: 'MESH',
  points: [pt(x, y), pt(x + s, y), pt(x + s, y + s), pt(x, y + s), pt(x + s / 2, y + s / 2)],
});

function problems(r: RawProjection): string[] {
  try {
    toLayout(r, opts);
    return [];
  } catch (e) {
    return (e as LayoutError).problems;
  }
}

describe('toLayout', () => {
  it('divides by the render scale, hulls + pads hits and sorts keys', () => {
    const layout = toLayout(
      raw([
        { name: 'slot.b-1', type: 'EMPTY', points: [pt(201, 401)] },
        { name: 'anchor.pizza', type: 'EMPTY', points: [pt(100.04, 200.16)] },
        box('hit.pizza', 400, 400, 200),
        { name: 'path.road', type: 'CURVE', points: [pt(0, 1000), pt(2000, 1000)] },
      ]),
      opts,
    );
    expect(layout.renderScale).toBe(2);
    expect(layout.anchors).toEqual({ pizza: { x: 50, y: 100.1 } });
    expect(layout.slots['b-1']).toEqual({ x: 100.5, y: 200.5 });
    expect(layout.paths.road).toEqual([{ x: 0, y: 500 }, { x: 1000, y: 500 }]);
    const w = minWidth(layout.hits.pizza!);
    expect(w).toBeGreaterThanOrEqual(100 + 48 - 0.2);
    expect(Object.keys(layout)).toEqual(['v', 'screenId', 'design', 'renderScale', 'anchors', 'hits', 'slots', 'paths']);
  });

  it('Story 1.8: `unpadded` hits are hulled but not padded', () => {
    const layout = toLayout(raw([box('hit.counter-upper', 400, 400, 200), box('hit.counter', 400, 400, 200)]), { ...opts, unpadded: ['counter-upper'] });
    expect(minWidth(layout.hits['counter-upper']!)).toBeCloseTo(100);
    expect(minWidth(layout.hits.counter!)).toBeGreaterThan(140);
  });

  it('separates the listed hits by the gap', () => {
    const r = raw([box('hit.a', 400, 400, 200), box('hit.b', 640, 400, 200)]);
    const layout = toLayout(r, { ...opts, separate: { ids: ['a', 'b'], gap: 40 } });
    expect(polygonDistance(layout.hits.a!, layout.hits.b!)).toBeGreaterThanOrEqual(40);
    expect(polygonDistance(toLayout(r, opts).hits.a!, toLayout(r, opts).hits.b!)).toBe(0);
  });

  it.each([
    ['hit.pizza.001', /"hit\.pizza\.001": name must be/],
    ['Hit.X', /"Hit\.X": name must be/],
    ['thing.pizza', /"thing\.pizza": name must be/],
    ['anchor.Pizza', /"anchor\.Pizza": name must be/],
  ])('rejects the name %s', (name, msg) => {
    expect(problems(raw([{ name, type: 'EMPTY', points: [pt(1, 1)] }]))[0]).toMatch(msg);
  });

  it('rejects a duplicate id', () => {
    const p = problems(raw([box('hit.pizza', 0, 0, 100), box('hit.pizza', 0, 0, 100)]));
    expect(p).toEqual([expect.stringMatching(/"hit\.pizza": duplicate id/)]);
  });

  it('rejects points behind the camera or outside the render', () => {
    expect(problems(raw([{ name: 'anchor.a', type: 'EMPTY', points: [[10, 10, -1]] }]))[0]).toMatch(/"anchor\.a": 1 point\(s\) behind the camera/);
    expect(problems(raw([{ name: 'slot.a', type: 'EMPTY', points: [pt(2100, 10)] }]))[0]).toMatch(/"slot\.a": .*outside the 2048×1536/);
  });

  it('rejects too few points', () => {
    expect(problems(raw([{ name: 'path.road', type: 'CURVE', points: [pt(1, 1)] }]))[0]).toMatch(/"path\.road": a path needs at least 2/);
    expect(problems(raw([{ name: 'hit.a', type: 'MESH', points: [pt(1, 1), pt(2, 2), pt(3, 3)] }]))[0]).toMatch(/"hit\.a": a hit needs at least 3 non-collinear/);
  });

  it('rejects a render size that is not a multiple of the design', () => {
    expect(() => toLayout({ ...raw([]), render: { width: 2048, height: 1500 } }, opts)).toThrow(/not a multiple/);
  });

  it('formats deterministically: sorted keys, one point per line, no -0', () => {
    const layout = toLayout(raw([{ name: 'anchor.b', type: 'EMPTY', points: [pt(0.01, 4)] }, { name: 'anchor.a', type: 'EMPTY', points: [pt(2, 4)] }]), opts);
    const text = formatLayout(layout);
    expect(text).toContain('"a": { "x": 1, "y": 2 }');
    expect(text.indexOf('"a"')).toBeLessThan(text.indexOf('"b"'));
    expect(text).toBe(formatLayout(JSON.parse(text)));
    expect(Object.is(round1(-0.01), -0)).toBe(false);
  });
});
