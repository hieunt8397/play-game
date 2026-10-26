// Story 7.4: validateBedtime on the real layout and atlas, and its failures.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScreenLayout } from '../../src/content/layout-types.ts';
import { BEDTIME_SCREEN, FRAMES, TARGET_IDS } from '../../src/content/games/bedtime.ts';
import { atlasFrames, bedtimeLimits, validateBedtime, type AtlasJsonLike } from './rules.ts';

const APP = join(import.meta.dirname, '..', '..');
const real = (): ScreenLayout => JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', 'bedtime.layout.json'), 'utf8')) as ScreenLayout;
const realAtlas = (): AtlasJsonLike => atlasFrames(JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', 'bedtime.json'), 'utf8')));
const limits = () => bedtimeLimits(BEDTIME_SCREEN, TARGET_IDS);
const box = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

describe('validateBedtime (Story 7.4)', () => {
  it('the real layout and atlas pass: four targets, each ≥ 150 px wide', () => {
    expect(validateBedtime(real(), limits(), realAtlas())).toEqual([]);
    expect(limits().targetMin).toBe(150);
  });

  it('a narrow target, one off the rect, one under the Speaker and two too close fail naming the ids', () => {
    const l = real();
    expect(validateBedtime({ ...l, hits: { ...l.hits, brush: box(60, 400, 100, 200) } }, limits())[0]).toMatch(/^hit "brush": .* wide \(min 150\)/);
    expect(validateBedtime({ ...l, hits: { ...l.hits, brush: box(5, 400, 160, 200) } }, limits()).some((m) => m.includes('leaves the interactive rect'))).toBe(true);
    expect(validateBedtime({ ...l, hits: { ...l.hits, lamp: box(840, 90, 155, 200) } }, limits()).some((m) => m.startsWith('hit "lamp": reaches into the Home/Speaker'))).toBe(true);
    expect(validateBedtime({ ...l, hits: { ...l.hits, blanket: box(300, 400, 160, 160), shiba: box(470, 400, 160, 160) } }, limits()).some((m) => m.startsWith('hits "blanket" and "shiba"'))).toBe(true);
  });

  it('a missing hit, anchor or frame, and an anchor off the screen, are named', () => {
    const l = real();
    const { shiba: _s, ...hits } = l.hits;
    expect(validateBedtime({ ...l, hits }, limits()).some((m) => m.includes('shiba'))).toBe(true);
    expect(validateBedtime({ ...l, anchors: { ...l.anchors, 'star-1': { x: 1200, y: 100 } } }, limits())).toContain('anchor "star-1": (1200, 100) is off the screen');
    const atlas = realAtlas();
    const without: AtlasJsonLike = { frames: Object.fromEntries(Object.entries(atlas.frames ?? {}).filter(([k]) => k !== FRAMES.z)) };
    expect(validateBedtime(l, limits(), without)).toContain(`atlas "bedtime": frame "${FRAMES.z}" is missing`);
  });
});
