// Stories 4.1, 4.2: validateRace, a passing fixture (the real layout) and a failing case per rule (each names the id).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Point, ScreenLayout } from '../../src/content/layout-types.ts';
import { CONE_ANCHORS, FLAG_ANCHORS, RACE_SCREEN, ladder } from '../../src/content/games/race.ts';
import { arcSamples, atlasFrames, circumradius, raceLimits, racePaths, resamplePolyline, validateRace, type AtlasJsonLike } from './rules.ts';

const APP = join(import.meta.dirname, '..', '..');
const real = (): ScreenLayout => JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', 'race.layout.json'), 'utf8')) as ScreenLayout;
const realAtlas = (): AtlasJsonLike => atlasFrames(JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', 'race.json'), 'utf8')));
const limits = () => raceLimits(RACE_SCREEN, racePaths(ladder), CONE_ANCHORS, FLAG_ANCHORS);
const withPath = (l: ScreenLayout, id: string, pts: Point[]): ScreenLayout => ({ ...l, paths: { ...l.paths, [id]: pts } });
/** Points every `step` px along a polyline through `corners`. */
const dense = (corners: Point[], step = 10): Point[] => {
  const out: Point[] = [];
  for (let i = 0; i + 1 < corners.length; i++) {
    const a = corners[i]!;
    const b = corners[i + 1]!;
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step);
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  out.push(corners[corners.length - 1]!);
  return out;
};
/** An open circle (centre, radius) from angle a0 to a1 (degrees, screen y down), every ~10 px. */
const arc = (cx: number, cy: number, r: number, a0: number, a1: number): Point[] => {
  const n = Math.ceil((Math.abs(a1 - a0) * Math.PI * r) / 180 / 10);
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
};

describe('validateRace (Stories 4.1, 4.2)', () => {
  it('the real layout and atlas pass (12 roads, cones and flags); helpers', () => {
    expect(validateRace(real(), limits(), realAtlas())).toEqual([]);
    expect(racePaths(ladder).map((p) => p.id)).toHaveLength(12);
    expect(racePaths(ladder).find((p) => p.id === 'loop-2')?.shape).toBe('loop');
    const r = resamplePolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 4);
    expect(r[0]).toEqual({ x: 0, y: 0 });
    expect(r[r.length - 1]).toEqual({ x: 10, y: 0 });
    expect(arcSamples([{ x: 0, y: 0 }, { x: 10, y: 0 }], 4).arc).toEqual([0, 4, 8, 10]);
    expect(circumradius({ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 })).toBeCloseTo(1);
    expect(circumradius({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toBe(Infinity);
  });

  it('a passing filleted zigzag and a passing loop fixture', () => {
    const zig = [...dense([{ x: 150, y: 300 }, { x: 330, y: 470 }]), ...arc(400, 400, 100, 135, 45).slice(1), ...dense([{ x: 471, y: 471 }, { x: 650, y: 300 }]).slice(1)];
    const loop = arc(512, 400, 160, 115, 115 + 310);
    const l = withPath(withPath(real(), 'zigzag-1', zig), 'loop-1', loop);
    const p = validateRace(l, limits()).filter((m) => m.includes('"zigzag-1"') || m.includes('"loop-1"'));
    expect(p).toEqual([]);
  });

  it('Road in HUD zone: a straight-1 point at Home’s keep-out fails naming straight-1', () => {
    const l = real();
    const pts = [...l.paths['straight-1']!];
    pts[0] = { x: 120, y: 150 };
    expect(validateRace(withPath(l, 'straight-1', pts), limits()).some((m) => m.startsWith('path "straight-1": the road band reaches into a Home/Speaker keep-out zone'))).toBe(true);
  });

  it('a road band off the interactive rect fails naming it', () => {
    const l = real();
    const pts = [...l.paths['straight-2']!];
    pts[pts.length - 1] = { x: 990, y: 600 };
    expect(validateRace(withPath(l, 'straight-2', pts), limits()).some((m) => m.startsWith('path "straight-2": the road band leaves the interactive rect'))).toBe(true);
  });

  it('Fold: a sharp unfilleted 90° zigzag corner fails naming the path (turn radius)', () => {
    const sharp = dense([{ x: 200, y: 300 }, { x: 400, y: 500 }, { x: 600, y: 300 }]);
    expect(validateRace(withPath(real(), 'zigzag-2', sharp), limits()).some((m) => m.startsWith('path "zigzag-2": turn radius'))).toBe(true);
  });

  it('Touch self: a U-turn whose legs are 80 px apart fails naming the path (self-clearance)', () => {
    const u = [...dense([{ x: 200, y: 300 }, { x: 600, y: 300 }]), ...arc(600, 340, 40, -90, 90).slice(1), ...dense([{ x: 600, y: 380 }, { x: 200, y: 380 }]).slice(1)];
    expect(validateRace(withPath(real(), 'curve-2', u), limits()).some((m) => m.startsWith('path "curve-2": two parts'))).toBe(true);
  });

  it('Wide mouth: a loop with a 200 px mouth fails naming it; sparse points on a curve fail', () => {
    const wide = arc(512, 400, 170, 126, 126 + 288);
    const mouth = Math.hypot(wide[0]!.x - wide[wide.length - 1]!.x, wide[0]!.y - wide[wide.length - 1]!.y);
    expect(mouth).toBeGreaterThan(190);
    expect(validateRace(withPath(real(), 'loop-3', wide), limits()).some((m) => m.startsWith('path "loop-3": the loop mouth is'))).toBe(true);
    const sparse = [{ x: 150, y: 400 }, { x: 500, y: 380 }, { x: 850, y: 400 }];
    expect(validateRace(withPath(real(), 'curve-1', sparse), limits()).some((m) => m.startsWith('path "curve-1": layout points 0 and 1'))).toBe(true);
  });

  it('Missing path: loop-2 absent fails naming it; a missing anchor too', () => {
    const l = real();
    const { 'loop-2': _gone, ...paths } = l.paths;
    const { gate: _g, ...anchors } = l.anchors;
    const p = validateRace({ ...l, paths, anchors }, limits());
    expect(p).toContain('path "loop-2": missing or has fewer than 2 points');
    expect(p).toContain('anchor "gate": missing');
  });

  it('Cone on road: anchor.cone-2 40 px from curve-1 fails naming both; flags are counted', () => {
    const l = real();
    const c = l.paths['curve-1']![10]!;
    const p = validateRace({ ...l, anchors: { ...l.anchors, 'cone-2': { x: c.x, y: c.y + 40 } } }, limits());
    expect(p.some((m) => /^anchor "cone-2": [\d.]+ px from path "curve-1"/.test(m))).toBe(true);
    const { 'flag-2': _f, ...anchors } = l.anchors;
    expect(validateRace({ ...l, anchors }, limits())).toContain('anchor "flag-*": 1 flags (exactly 2)');
  });

  it('kart and gate sizes are checked on the atlas; a missing frame is named', () => {
    const l = real();
    const tiny: AtlasJsonLike = { frames: Object.fromEntries(RACE_SCREEN.frames.map((f) => [f, { spriteSourceSize: { x: 0, y: 0, w: 100, h: 100 } }])) };
    const q = validateRace(l, limits(), tiny);
    expect(q).toContain('frame "kart/idle/00": longest side 50 is not in [96, 153.6]');
    expect(q).toContain('frame "gate/idle/00": width 50 is under 150');
    const { 'flag/idle/00': _x, ...frames } = tiny.frames!;
    expect(validateRace(l, limits(), { frames })).toContain('atlas "race": frame "flag/idle/00" is missing');
  });
});
