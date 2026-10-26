// Story 7.3: validateBand on the real layout and atlas, and its failures.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScreenLayout } from '../../src/content/layout-types.ts';
import { BAND_SCREEN, INSTRUMENT_IDS, instrumentFrame } from '../../src/content/games/band.ts';
import { atlasFrames, bandLimits, validateBand, type AtlasJsonLike } from './rules.ts';

const APP = join(import.meta.dirname, '..', '..');
const real = (): ScreenLayout => JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', 'band.layout.json'), 'utf8')) as ScreenLayout;
const realAtlas = (): AtlasJsonLike => atlasFrames(JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', 'band.json'), 'utf8')));
const limits = () => bandLimits(BAND_SCREEN, INSTRUMENT_IDS);
const box = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

describe('validateBand (Story 7.3)', () => {
  it('the real layout and atlas pass', () => {
    expect(validateBand(real(), limits(), realAtlas())).toEqual([]);
  });

  it('a thin hull, two hulls too close, a hull off the rect or in a Hud zone fail naming the id', () => {
    const l = real();
    expect(validateBand({ ...l, hits: { ...l.hits, drum: box(200, 450, 40, 200) } }, limits())[0]).toMatch(/^hit "drum": .* wide/);
    expect(validateBand({ ...l, hits: { ...l.hits, drum: box(500, 450, 150, 150), xylophone: box(660, 450, 150, 150) } }, limits()).some((m) => m.startsWith('hits "drum" and "xylophone"'))).toBe(true);
    expect(validateBand({ ...l, hits: { ...l.hits, drum: box(10, 450, 150, 150) } }, limits()).some((m) => m.includes('leaves the interactive rect'))).toBe(true);
    expect(validateBand({ ...l, hits: { ...l.hits, bell: box(880, 120, 110, 150) } }, limits()).some((m) => m.startsWith('hit "bell": reaches into the Home/Speaker'))).toBe(true);
  });

  it('a missing frame, a small instrument, or a bouncing frame leaving the rect fail naming the frame', () => {
    const l = real();
    const atlas = realAtlas() as Required<AtlasJsonLike>;
    const without = { frames: Object.fromEntries(Object.entries(atlas.frames).filter(([k]) => k !== instrumentFrame('frog'))) } as AtlasJsonLike;
    expect(validateBand(l, limits(), without)).toContain(`atlas "band": frame "${instrumentFrame('frog')}" is missing`);
    const f = instrumentFrame('bell');
    const small = { frames: { ...atlas.frames, [f]: { ...atlas.frames[f]!, spriteSourceSize: { x: 1400, y: 500, w: 200, h: 200 } } } } as AtlasJsonLike;
    expect(validateBand(l, limits(), small).some((m) => m.startsWith(`frame "${f}": longest side 100`))).toBe(true);
    const edge = { frames: { ...atlas.frames, [f]: { ...atlas.frames[f]!, spriteSourceSize: { x: 1700, y: 1000, w: 300, h: 360 } } } } as AtlasJsonLike;
    expect(validateBand(l, limits(), edge).some((m) => m.startsWith(`frame "${f}" bouncing`))).toBe(true);
  });
});
