// Trồng cây (2026-10-30): validateGarden on the real layout and atlas, and its failures.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScreenLayout } from '../../src/content/layout-types.ts';
import { CAN_FRAME, PARTICLES, fruitFrame, packetFrame, plantFrame } from '../../src/content/games/garden.ts';
import { atlasFrames, gardenLimits, validateGarden, type AtlasJsonLike } from './rules.ts';

const APP = join(import.meta.dirname, '..', '..');
const real = (): ScreenLayout => JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', 'garden.layout.json'), 'utf8')) as ScreenLayout;
const realAtlas = (): AtlasJsonLike => atlasFrames(JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', 'garden.json'), 'utf8')));
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

describe('validateGarden (Trồng cây)', () => {
  it('the real layout and atlas pass; things drawn ≥ 90 px, tap circles ≥ 80 px', () => {
    expect(validateGarden(real(), gardenLimits(), realAtlas())).toEqual([]);
    expect(gardenLimits().drawnMin).toBe(90);
    expect(2 * gardenLimits().hitRadius(10)).toBe(80);
  });

  it('a narrow Shiba hull, one under the Speaker zone, and an anchor off the screen fail naming the ids', () => {
    const l = real();
    expect(validateGarden({ ...l, hits: { ...l.hits, shiba: box(800, 400, 40, 200) } }, gardenLimits())[0]).toMatch(/^hit "shiba": .* wide \(min 80\)/);
    expect(validateGarden({ ...l, hits: { ...l.hits, shiba: box(850, 120, 150, 300) } }, gardenLimits()).some((m) => m.startsWith('hit "shiba": reaches into the Home/Speaker'))).toBe(true);
    expect(validateGarden({ ...l, anchors: { ...l.anchors, worm: { x: 1200, y: 500 } } }, gardenLimits())).toContain('anchor "worm": (1200, 500) is off the screen');
  });

  it('two packets too close, a fruit on Shiba, a small can, a plant frame off the rect and a missing frame are named', () => {
    const l = real();
    const atlas = realAtlas();
    const p0 = l.anchors['packet-0']!;
    expect(validateGarden({ ...l, anchors: { ...l.anchors, 'packet-1': { x: p0.x + 60, y: p0.y } } }, gardenLimits(), atlas).some((m) => m.startsWith('"anchor.packet-0" and "anchor.packet-1"'))).toBe(true);
    const mouth = l.anchors.mouth!;
    expect(validateGarden({ ...l, anchors: { ...l.anchors, 'fruit-2': mouth } }, gardenLimits(), atlas).some((m) => m.startsWith('"anchor.fruit-2" and hit "shiba"'))).toBe(true);
    const can = atlas.frames![CAN_FRAME]!.spriteSourceSize!;
    expect(validateGarden(l, gardenLimits(), withTrim(atlas, CAN_FRAME, { x: can.x!, y: can.y!, w: 120, h: 80 })).some((m) => m.startsWith(`frame "${CAN_FRAME}": longest side 60`))).toBe(true);
    const lemon = plantFrame('lemon', 'fruit');
    expect(validateGarden(l, gardenLimits(), withTrim(atlas, lemon, { x: 10, y: 10, w: 600, h: 600 })).some((m) => m.startsWith(`frame "${lemon}"`) && m.includes('leaves the interactive rect'))).toBe(true);
    const without: AtlasJsonLike = { frames: Object.fromEntries(Object.entries(atlas.frames ?? {}).filter(([k]) => k !== PARTICLES.worm)) };
    expect(validateGarden(l, gardenLimits(), without)).toContain(`atlas "garden": frame "${PARTICLES.worm}" is missing`);
    // Every fruit and packet frame counts toward its slot's circle (the largest one stands there).
    expect(validateGarden(l, gardenLimits(), withTrim(atlas, fruitFrame('tomato'), { x: 0, y: 0, w: 120, h: 60 })).some((m) => m.startsWith(`frame "${fruitFrame('tomato')}": longest side 60`))).toBe(true);
    expect(validateGarden(l, gardenLimits(), withTrim(atlas, packetFrame('lemon'), { x: 0, y: 0, w: 60, h: 100 })).some((m) => m.startsWith(`frame "${packetFrame('lemon')}": longest side 50`))).toBe(true);
  });
});
