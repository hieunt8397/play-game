// 2026-10-22 (the gate faces the road): which rendered yaw of the arch a road's end shows, and where.
import { describe, expect, it } from 'vitest';
import type { Point } from '../../content/layout-types.ts';
import { GATE_ANCHOR, GATE_BACK_PX, GATE_YAWS, gateCrossAnchor, gatePostAnchor } from '../../content/games/race.ts';
import { LAYOUTS } from '../../content/layouts.ts';
import { Tokens } from '../../core/tokens.ts';
import { arrivalDirection, bestView, gateViews, placeGate, pointBack, roadGate, yawDistance, type GateView } from './gate.ts';

/** On-screen crossing directions and post feet like the rendered ones (relative to the pivot, design px). */
const VIEWS: GateView[] = [
  { deg: 0, cross: { x: -1, y: 58 }, post: { x: -66, y: 0 } },
  { deg: 30, cross: { x: 34, y: 50 }, post: { x: -58, y: 28 } },
  { deg: 60, cross: { x: 58, y: 29 }, post: { x: -35, y: 50 } },
  { deg: 90, cross: { x: 66, y: 1 }, post: { x: -1, y: 58 } },
  { deg: 120, cross: { x: 56, y: -27 }, post: { x: 34, y: 50 } },
  { deg: 150, cross: { x: 32, y: -46 }, post: { x: 58, y: 29 } },
];
const all = (): boolean => true;
const OPTS = { tangentPx: 40, backPx: 16 };
const line = (a: Point, b: Point, n = 20): Point[] => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

describe('race gate (the arch faces the road)', () => {
  it('Horizontal arrival (straight, wave, snake): the side-on arch (90°), posts above and below the road', () => {
    for (const road of [line({ x: 100, y: 400 }, { x: 800, y: 400 }), line({ x: 800, y: 400 }, { x: 100, y: 400 })]) {
      const g = placeGate(road, VIEWS, all, OPTS)!;
      expect(g.deg).toBe(90);
      expect(g.fallback).toBe(false);
      expect(dist(g.at, road[road.length - 1]!)).toBeCloseTo(16, 6);
      // One post foot above the road, one below: the road runs between them.
      expect(Math.sign(g.at.y + g.post.y - 400)).toBe(-Math.sign(g.at.y - g.post.y - 400));
    }
  });

  it('Diagonal arrival (zigzag, curve): the arch at the matching diagonal', () => {
    expect(placeGate(line({ x: 100, y: 100 }, { x: 500, y: 300 }), VIEWS, all, OPTS)!.deg).toBe(60);
    expect(placeGate(line({ x: 100, y: 500 }, { x: 500, y: 300 }), VIEWS, all, OPTS)!.deg).toBe(120);
    expect(placeGate(line({ x: 300, y: 600 }, { x: 500, y: 300 }), VIEWS, all, OPTS)!.deg).toBe(150);
    // The arch is symmetric: arriving up-left uses the same axis as down-right.
    expect(placeGate(line({ x: 500, y: 600 }, { x: 300, y: 300 }), VIEWS, all, OPTS)!.deg).toBe(30);
  });

  it('Vertical arrival (spiral end heading up, loop lips): the camera-facing arch (0°)', () => {
    const g = placeGate(line({ x: 500, y: 600 }, { x: 500, y: 300 }), VIEWS, all, OPTS)!;
    expect(g.deg).toBe(0);
    expect(g.at).toEqual({ x: 500, y: 316 });
    expect(placeGate(line({ x: 500, y: 300 }, { x: 500, y: 600 }), VIEWS, all, OPTS)!.deg).toBe(0);
  });

  it('Only the last tangentPx of arc counts: a road that turns just before the end follows its last heading', () => {
    const road = [...line({ x: 100, y: 600 }, { x: 500, y: 600 }), ...line({ x: 500, y: 600 }, { x: 500, y: 450 }).slice(1)];
    expect(placeGate(road, VIEWS, all, OPTS)!.deg).toBe(0);
    expect(placeGate(road, VIEWS, all, { tangentPx: 600, backPx: 16 })!.deg).not.toBe(0);
  });

  it('Missing frame: falls back to the nearest available yaw (mod 180) and says which was meant', () => {
    const road = line({ x: 100, y: 400 }, { x: 800, y: 400 });
    const g = placeGate(road, VIEWS, (deg) => deg !== 90 && deg !== 120, OPTS)!;
    expect(g).toMatchObject({ deg: 60, ideal: 90, fallback: true });
    // 0° missing on a vertical road: 30° and 150° are both 30° away; the first listed wins.
    expect(placeGate(line({ x: 500, y: 600 }, { x: 500, y: 300 }), VIEWS, (deg) => deg !== 0, OPTS)).toMatchObject({ deg: 30, ideal: 0, fallback: true });
    expect(placeGate(road, VIEWS, () => false, OPTS)).toBeUndefined();
    expect(placeGate(road, [], all, OPTS)).toBeUndefined();
  });

  it('helpers: arc walking, arrival direction, yaw distance, best view, views from the layout', () => {
    const road = line({ x: 0, y: 0 }, { x: 100, y: 0 }, 4);
    expect(pointBack(road, 30)).toEqual({ x: 70, y: 0 });
    expect(pointBack(road, 500)).toEqual({ x: 0, y: 0 });
    expect(pointBack([], 5)).toBeUndefined();
    expect(arrivalDirection(road, 40)).toEqual({ x: 1, y: 0 });
    expect(arrivalDirection([{ x: 1, y: 1 }], 40)).toBeUndefined();
    expect(yawDistance(150, 0)).toBe(30);
    expect(yawDistance(0, 150)).toBe(30);
    expect(yawDistance(90, 90)).toBe(0);
    expect(bestView(VIEWS, { x: 0, y: -1 })?.deg).toBe(0);
    const anchors: Record<string, Point> = { gate: { x: 500, y: 400 }, [gateCrossAnchor(0)]: { x: 500, y: 458 }, [gatePostAnchor(0)]: { x: 434, y: 400 }, [gateCrossAnchor(90)]: { x: 566, y: 400 } };
    const ids = { pivot: 'gate', cross: gateCrossAnchor, post: gatePostAnchor };
    // 90° lacks its post anchor: only 0° is a view.
    expect(gateViews(anchors, GATE_YAWS, ids)).toEqual([{ deg: 0, cross: { x: 0, y: 58 }, post: { x: -66, y: 0 } }]);
    expect(gateViews({}, GATE_YAWS, ids)).toEqual([]);
  });

  it('roadGate on the real layout: the tokens, and the per-road back distance (zigzag-3 stands 46 px back)', () => {
    const l = LAYOUTS.race;
    const views = gateViews(l.anchors, GATE_YAWS, { pivot: GATE_ANCHOR, cross: gateCrossAnchor, post: gatePostAnchor });
    expect(views.map((v) => v.deg)).toEqual([...GATE_YAWS]);
    expect(GATE_BACK_PX['zigzag-3']).toBe(46);
    const ui = Tokens.ui;
    const zig = l.paths['zigzag-3']!;
    expect(roadGate('zigzag-3', zig, views, all)).toEqual(placeGate(zig, views, all, { tangentPx: ui.raceGateTangentPx, backPx: 46 }));
    expect(dist(roadGate('zigzag-3', zig, views, all)!.at, zig[zig.length - 1]!)).toBeCloseTo(46, 0);
    const curve = l.paths['curve-1']!;
    expect(roadGate('curve-1', curve, views, all)).toEqual(placeGate(curve, views, all, { tangentPx: ui.raceGateTangentPx, backPx: ui.raceGateBackPx }));
  });
});
