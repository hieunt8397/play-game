// Story 7.2: validateAnimalPens on the real layout and atlas, and its failures.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScreenLayout } from '../../src/content/layout-types.ts';
import { ANIMAL_IDS, ANIMAL_PENS_SCREEN, DOOR_FRAMES, DOOR_IDS, peekFrame } from '../../src/content/games/animal-pens.ts';
import { animalPensLimits, atlasFrames, validateAnimalPens, type AtlasJsonLike } from './rules.ts';

const APP = join(import.meta.dirname, '..', '..');
const real = (): ScreenLayout => JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', 'animal-pens.layout.json'), 'utf8')) as ScreenLayout;
const realAtlas = (): AtlasJsonLike => atlasFrames(JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', 'animal-pens.json'), 'utf8')));
const limits = () => animalPensLimits(ANIMAL_PENS_SCREEN, DOOR_IDS, [DOOR_FRAMES.closed, DOOR_FRAMES.open], ANIMAL_IDS.map(peekFrame));
const box = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

describe('validateAnimalPens (Story 7.2)', () => {
  it('the real layout and atlas pass', () => {
    expect(validateAnimalPens(real(), limits(), realAtlas())).toEqual([]);
  });

  it('a thin, close, off-screen or Hud-covering door hull fails naming the id', () => {
    const l = real();
    const thin = validateAnimalPens({ ...l, hits: { ...l.hits, 'door-1': box(100, 400, 40, 200) } }, limits());
    expect(thin.some((m) => m.startsWith('hit "door-1": 40 px wide'))).toBe(true);
    const near = validateAnimalPens({ ...l, hits: { ...l.hits, 'door-1': box(100, 400, 150, 200), 'door-2': box(260, 400, 150, 200) } }, limits());
    expect(near).toContain('hits "door-1" and "door-2": 10 px apart (min 24)');
    const edge = validateAnimalPens({ ...l, hits: { ...l.hits, 'door-1': box(10, 400, 150, 200) } }, limits());
    expect(edge.some((m) => m.startsWith('hit "door-1": (10, 400) leaves the interactive rect'))).toBe(true);
    const hud = validateAnimalPens({ ...l, hits: { ...l.hits, 'door-4': box(860, 100, 120, 200) } }, limits());
    expect(hud.some((m) => m.startsWith('hit "door-4": reaches into the Home/Speaker keep-out zone'))).toBe(true);
  });

  it('doors off one row, or out of order, fail (the frames are shifted from door 1)', () => {
    const l = real();
    const a2 = l.anchors['door-2']!;
    const off = validateAnimalPens({ ...l, anchors: { ...l.anchors, 'door-2': { x: a2.x, y: a2.y + 5 } } }, limits());
    expect(off.some((m) => m.startsWith('anchor "door-2": y'))).toBe(true);
    const order = validateAnimalPens({ ...l, anchors: { ...l.anchors, 'door-2': { x: 0, y: a2.y } } }, limits());
    expect(order).toContain('anchor "door-2": not right of the previous door');
  });

  it('a missing frame, a short door or a frame shifted off screen fails', () => {
    const l = real();
    const atlas = realAtlas();
    const { [peekFrame('cow')]: _cow, ...frames } = atlas.frames!;
    expect(validateAnimalPens(l, limits(), { frames })).toContain(`atlas "animal-pens": frame "${peekFrame('cow')}" is missing`);
    const short = { frames: { ...atlas.frames, [DOOR_FRAMES.closed]: { spriteSourceSize: { x: 200, y: 800, w: 300, h: 200 } } } };
    expect(validateAnimalPens(l, limits(), short)).toContain(`frame "${DOOR_FRAMES.closed}": 100 px tall (min 150)`);
    const wide = { frames: { ...atlas.frames, [peekFrame('horse')]: { spriteSourceSize: { x: 200, y: 800, w: 1500, h: 300 } } } };
    expect(validateAnimalPens(l, limits(), wide).some((m) => m.startsWith(`frame "${peekFrame('horse')}" at door-4`))).toBe(true);
  });

  it('a missing door hull or anchor is named', () => {
    const l = real();
    const { 'door-3': _h, ...hits } = l.hits;
    const { 'door-3': _a, ...anchors } = l.anchors;
    const p = validateAnimalPens({ ...l, hits, anchors }, limits());
    expect(p).toContain('hit "door-3": missing or has fewer than 3 points');
    expect(p).toContain('anchor "door-3": missing');
  });
});
