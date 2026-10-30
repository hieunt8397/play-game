// Rửa xe (2026-10-30): validateCarWash on the real layout and atlas, and its failures.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScreenLayout } from '../../src/content/layout-types.ts';
import { HOSE_FRAME, PARTICLES, carFrame, carHit, dirtAnchor, dirtFrame } from '../../src/content/games/car-wash.ts';
import { atlasFrames, carWashLimits, validateCarWash, type AtlasJsonLike } from './rules.ts';

const APP = join(import.meta.dirname, '..', '..');
const real = (): ScreenLayout => JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', 'car-wash.layout.json'), 'utf8')) as ScreenLayout;
const realAtlas = (): AtlasJsonLike => atlasFrames(JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', 'car-wash.json'), 'utf8')));
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

describe('validateCarWash (Rửa xe)', () => {
  it('the real layout and atlas pass; cars ≥ 300 px wide, the hose drawn ≥ 90 px with a ≥ 80 px tap circle', () => {
    expect(validateCarWash(real(), carWashLimits(), realAtlas())).toEqual([]);
    expect(carWashLimits().carMinPx).toBe(300);
    expect(carWashLimits().hoseMinPx).toBe(90);
    expect(2 * carWashLimits().hitRadius(10)).toBe(80);
  });

  it('a narrow car, a car under the Speaker zone, a dirt spot off its car and an anchor off the screen fail naming the ids', () => {
    const l = real();
    const taxi = carHit('taxi');
    expect(validateCarWash({ ...l, hits: { ...l.hits, [taxi]: box(400, 450, 250, 150) } }, carWashLimits()).some((m) => m.startsWith(`hit "${taxi}": 250 px wide (min 300)`))).toBe(true);
    expect(validateCarWash({ ...l, hits: { ...l.hits, [taxi]: box(650, 20, 360, 200) } }, carWashLimits()).some((m) => m.startsWith(`hit "${taxi}": reaches into the Home/Speaker`))).toBe(true);
    expect(validateCarWash({ ...l, anchors: { ...l.anchors, [dirtAnchor('taxi', 2)]: { x: 900, y: 650 } } }, carWashLimits())).toContain(`anchor "${dirtAnchor('taxi', 2)}": (900, 650) is not on hit "${taxi}"`);
    expect(validateCarWash({ ...l, anchors: { ...l.anchors, nozzle: { x: 1200, y: 500 } } }, carWashLimits())).toContain('anchor "nozzle": (1200, 500) is off the screen');
  });

  it('a small hose, a hose on the car, a car frame off the rect, a dirt frame in the Hud and a missing frame are named', () => {
    const l = real();
    const atlas = realAtlas();
    const hose = atlas.frames![HOSE_FRAME]!.spriteSourceSize!;
    expect(validateCarWash(l, carWashLimits(), withTrim(atlas, HOSE_FRAME, { x: hose.x!, y: hose.y!, w: 120, h: 100 })).some((m) => m.startsWith(`frame "${HOSE_FRAME}": longest side 60`))).toBe(true);
    expect(validateCarWash(l, carWashLimits(), withTrim(atlas, HOSE_FRAME, { x: 700, y: 900, w: 200, h: 200 })).some((m) => m.startsWith(`"${HOSE_FRAME}" and hit "car-`))).toBe(true);
    const car = carFrame('firetruck');
    expect(validateCarWash(l, carWashLimits(), withTrim(atlas, car, { x: 10, y: 1000, w: 900, h: 500 })).some((m) => m.startsWith(`frame "${car}"`) && m.includes('leaves the interactive rect'))).toBe(true);
    const dirt = dirtFrame('police', 'mud', 0);
    expect(validateCarWash(l, carWashLimits(), withTrim(atlas, dirt, { x: 1840, y: 300, w: 100, h: 100 })).some((m) => m.startsWith(`frame "${dirt}"`) && m.includes('Home/Speaker'))).toBe(true);
    const without: AtlasJsonLike = { frames: Object.fromEntries(Object.entries(atlas.frames ?? {}).filter(([k]) => k !== PARTICLES.duck)) };
    expect(validateCarWash(l, carWashLimits(), without)).toContain(`atlas "car-wash": frame "${PARTICLES.duck}" is missing`);
  });
});
