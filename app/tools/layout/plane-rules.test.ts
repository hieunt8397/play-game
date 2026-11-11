// Phi công nhí (2026-11-11): validatePlane on the real layout and atlas, and its failures.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScreenLayout } from '../../src/content/layout-types.ts';
import { ANCHORS, PLANE_FRAMES, balloonFrame, friendFrame, friendHit, houseHit } from '../../src/content/games/plane.ts';
import { atlasFrames, planeLimits, validatePlane, type AtlasJsonLike } from './rules.ts';

const APP = join(import.meta.dirname, '..', '..');
const real = (): ScreenLayout => JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', 'plane.layout.json'), 'utf8')) as ScreenLayout;
const realAtlas = (): AtlasJsonLike => atlasFrames(JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', 'plane.json'), 'utf8')));
const box = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
/** The atlas with `frame`'s trim replaced (render px). */
const withTrim = (atlas: AtlasJsonLike, frame: string, ss: { x: number; y: number; w: number; h: number }): AtlasJsonLike => ({
  frames: { ...atlas.frames, [frame]: { ...atlas.frames![frame], spriteSourceSize: ss } },
});

describe('validatePlane (Phi công nhí)', () => {
  it('the real layout and atlas pass; the catch is generous, friends and houses ≥ 150 px with ≥ 80 px tap areas', () => {
    expect(validatePlane(real(), planeLimits(), realAtlas())).toEqual([]);
    expect(planeLimits().catchRadius).toBeGreaterThanOrEqual(80);
    expect(planeLimits().balloonMinPx).toBe(90);
    expect(planeLimits().friendMinPx).toBe(150);
    expect(planeLimits().hitMinPx).toBe(80);
  });

  it('a narrow friend, a house under the Speaker zone, a moved plane x and gifts off the rect fail naming the ids', () => {
    const l = real();
    const cat = friendHit('cat');
    const pig = houseHit('pig');
    expect(validatePlane({ ...l, hits: { ...l.hits, [cat]: box(600, 500, 50, 150) } }, planeLimits()).some((m) => m.startsWith(`hit "${cat}": 50 px wide`))).toBe(true);
    expect(validatePlane({ ...l, hits: { ...l.hits, [pig]: box(850, 100, 150, 200) } }, planeLimits()).some((m) => m.startsWith(`hit "${pig}": reaches into the Home/Speaker`))).toBe(true);
    const g = l.anchors[ANCHORS.ground]!;
    expect(validatePlane({ ...l, anchors: { ...l.anchors, [ANCHORS.ground]: { x: g.x + 40, y: g.y } } }, planeLimits()).some((m) => m.includes("the plane's x never changes"))).toBe(true);
    expect(validatePlane({ ...l, anchors: { ...l.anchors, [ANCHORS.gifts]: { x: 500, y: 740 } } }, planeLimits()).some((m) => m.startsWith(`anchor "${ANCHORS.gifts}"`))).toBe(true);
    expect(validatePlane(l, { ...planeLimits(), catchRadius: 40 }).some((m) => m.startsWith('the catch radius'))).toBe(true);
  });

  it('a plane too tall for its band, a small balloon, a small friend and a missing frame are named', () => {
    const l = real();
    const atlas = realAtlas();
    const idle = PLANE_FRAMES.idle;
    const plane = l.anchors[ANCHORS.plane]!;
    // A plane frame 400 px tall around its centre leaves the rect at the top of its band.
    expect(validatePlane(l, planeLimits(), withTrim(atlas, idle, { x: (plane.x - 100) * 2, y: (plane.y - 200) * 2, w: 400, h: 800 })).some((m) => m.startsWith(`frame "${idle}" at the top of its band`))).toBe(true);
    const red = balloonFrame('red');
    expect(validatePlane(l, planeLimits(), withTrim(atlas, red, { x: 100, y: 100, w: 100, h: 120 })).some((m) => m.startsWith(`frame "${red}": longest side 60`))).toBe(true);
    const cow = friendFrame('cow');
    expect(validatePlane(l, planeLimits(), withTrim(atlas, cow, { x: 1200, y: 1100, w: 150, h: 200 })).some((m) => m.startsWith(`frame "${cow}": longest side 100`))).toBe(true);
    const without: AtlasJsonLike = { frames: Object.fromEntries(Object.entries(atlas.frames ?? {}).filter(([k]) => k !== red)) };
    expect(validatePlane(l, planeLimits(), without)).toContain(`atlas "plane": frame "${red}" is missing`);
  });
});
