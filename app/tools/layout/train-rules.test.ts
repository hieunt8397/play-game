// Tàu hỏa chở bạn (2026-11-12): validateTrain on the real layout and atlas, and its failures.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScreenLayout } from '../../src/content/layout-types.ts';
import { ANCHORS, ENGINE_FRAMES, ENGINE_HIT, PLATFORM_HIT, carFrame, carHit, destFrame, destHit, friendFrame, friendHit } from '../../src/content/games/train.ts';
import { atlasFrames, trainLimits, validateTrain, type AtlasJsonLike } from './rules.ts';

const APP = join(import.meta.dirname, '..', '..');
const real = (): ScreenLayout => JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', 'train.layout.json'), 'utf8')) as ScreenLayout;
const realAtlas = (): AtlasJsonLike => atlasFrames(JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', 'train.json'), 'utf8')));
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

describe('validateTrain (Tàu hỏa chở bạn)', () => {
  it('the real layout and atlas pass; cars ≥ 110 px, friends ≥ 120, destinations ≥ 150, every tap area ≥ 80', () => {
    expect(validateTrain(real(), trainLimits(), realAtlas())).toEqual([]);
    expect(trainLimits().carMinPx).toBe(110);
    expect(trainLimits().friendMinPx).toBe(120);
    expect(trainLimits().destMinPx).toBe(150);
    expect(trainLimits().hitMinPx).toBe(80);
  });

  it('cars too close, a narrow friend, a destination under the Speaker zone and a platform off the rect fail naming the ids', () => {
    const l = real();
    const car0 = l.hits[carHit(0)]!;
    const xs = car0.map((p) => p.x);
    // Car 1 moved right up against car 0.
    const near = car0.map((p) => ({ x: p.x - (Math.max(...xs) - Math.min(...xs)) - 10, y: p.y }));
    expect(validateTrain({ ...l, hits: { ...l.hits, [carHit(1)]: near } }, trainLimits()).some((m) => m.startsWith(`hits "${carHit(0)}" and "${carHit(1)}"`) || m.startsWith(`hits "${carHit(1)}" and "${carHit(0)}"`))).toBe(true);
    const cat = friendHit('cat');
    expect(validateTrain({ ...l, hits: { ...l.hits, [cat]: box(850, 450, 50, 150) } }, trainLimits()).some((m) => m.startsWith(`hit "${cat}": 50 px wide`))).toBe(true);
    const fair = destHit('fair');
    expect(validateTrain({ ...l, hits: { ...l.hits, [fair]: box(850, 100, 150, 200) } }, trainLimits()).some((m) => m.startsWith(`hit "${fair}": reaches into the Home/Speaker`))).toBe(true);
    expect(validateTrain({ ...l, hits: { ...l.hits, [PLATFORM_HIT]: box(800, 520, 220, 90) } }, trainLimits()).some((m) => m.startsWith(`hit "${PLATFORM_HIT}"`) && m.includes('leaves the interactive rect'))).toBe(true);
    // A friend's tap area that reaches the engine.
    const engine = l.hits[ENGINE_HIT]!;
    const right = Math.max(...engine.map((p) => p.x));
    expect(validateTrain({ ...l, hits: { ...l.hits, [cat]: box(right + 4, 450, 120, 120) } }, trainLimits()).some((m) => m.includes(`"${cat}"`) && m.includes(`"${ENGINE_HIT}"`))).toBe(true);
  });

  it('a tunnel shorter than the train, or one that keeps it in the dark too long, is named', () => {
    const l = real();
    const t0 = l.anchors[ANCHORS.tunnel]!;
    const short = { ...l, anchors: { ...l.anchors, [ANCHORS.tunnelEnd]: { x: t0.x + 100, y: t0.y } } };
    expect(validateTrain(short, trainLimits()).some((m) => m.startsWith('the tunnel is 100 px long'))).toBe(true);
    const long = { ...l, anchors: { ...l.anchors, [ANCHORS.tunnelEnd]: { x: t0.x + 1000, y: t0.y } } };
    expect(validateTrain(long, trainLimits()).some((m) => m.startsWith('the whole train stays in the dark'))).toBe(true);
    expect(validateTrain(l, { ...trainLimits(), scrollPxPerS: 5000 }).some((m) => m.startsWith('the dim fades in over'))).toBe(true);
  });

  it('a narrow car, a small friend or destination and a missing frame are named', () => {
    const l = real();
    const atlas = realAtlas();
    const red = carFrame('red');
    expect(validateTrain(l, trainLimits(), withTrim(atlas, red, { x: 700, y: 980, w: 160, h: 200 })).some((m) => m.startsWith(`frame "${red}": 80 px wide`))).toBe(true);
    const cow = friendFrame('cow');
    expect(validateTrain(l, trainLimits(), withTrim(atlas, cow, { x: 1650, y: 900, w: 150, h: 200 })).some((m) => m.startsWith(`frame "${cow}": longest side 100`))).toBe(true);
    const beach = destFrame('beach');
    expect(validateTrain(l, trainLimits(), withTrim(atlas, beach, { x: 1600, y: 900, w: 200, h: 200 })).some((m) => m.startsWith(`frame "${beach}": longest side 100`))).toBe(true);
    const without: AtlasJsonLike = { frames: Object.fromEntries(Object.entries(atlas.frames ?? {}).filter(([k]) => k !== ENGINE_FRAMES.idle)) };
    expect(validateTrain(l, trainLimits(), without)).toContain(`atlas "train": frame "${ENGINE_FRAMES.idle}" is missing`);
  });
});
