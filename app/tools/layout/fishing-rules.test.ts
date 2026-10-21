// Story 4.3: validateFishing (the real layout and atlas pass; a failing case per rule) and fishLumaProblems.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScreenLayout } from '../../src/content/layout-types.ts';
import { ALL_FISH, FISHING_SCREEN, POND_HIT } from '../../src/content/games/fishing.ts';
import { fishLumaProblems } from '../lint/fish-luma.ts';
import { fishingRings } from '../lint/hint-contrast.ts';
import { atlasFrames, fishingLimits, validateFishing, type AtlasJsonLike } from './rules.ts';

const APP = join(import.meta.dirname, '..', '..');
const real = (): ScreenLayout => JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', 'fishing.layout.json'), 'utf8')) as ScreenLayout;
const realAtlas = (): AtlasJsonLike => atlasFrames(JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', 'fishing.json'), 'utf8')));
const limits = () => fishingLimits(FISHING_SCREEN, POND_HIT, ALL_FISH);

describe('validateFishing (Story 4.3)', () => {
  it('the real layout and atlas pass', () => {
    expect(validateFishing(real(), limits(), realAtlas())).toEqual([]);
  });

  it('Pond in HUD zone: a pond-swim vertex moved into the Speaker keep-out fails naming pond-swim; off the rect too', () => {
    const l = real();
    const pond = [...l.hits[POND_HIT]!];
    pond[1] = { x: 930, y: 150 };
    expect(validateFishing({ ...l, hits: { ...l.hits, [POND_HIT]: pond } }, limits()).some((m) => m.startsWith('hit "pond-swim": the pond grown by 30 reaches into a Home/Speaker keep-out zone'))).toBe(true);
    const low = [...l.hits[POND_HIT]!];
    low[4] = { x: 560, y: 690 };
    expect(validateFishing({ ...l, hits: { ...l.hits, [POND_HIT]: low } }, limits()).some((m) => m.startsWith('hit "pond-swim": the pond grown by 30 leaves the interactive rect'))).toBe(true);
  });

  it('missing ids and frames are named; sizes off the band or the ratio fail', () => {
    const l = real();
    const { catch: _c, ...anchors } = l.anchors;
    expect(validateFishing({ ...l, anchors }, limits())).toContain('anchor "catch": missing');
    const frames: Record<string, { spriteSourceSize: { x: number; y: number; w: number; h: number } }> = {};
    for (const f of FISHING_SCREEN.frames) frames[f] = { spriteSourceSize: { x: 0, y: 0, w: f.includes('-big/') ? 400 : 160, h: 100 } };
    const p = validateFishing(l, limits(), { frames });
    expect(p).toContain('frame "fish-yellow-small/swim/00": longest side 80 is not in [100, 120]');
    expect(p).toContain('frame "fish-yellow-big/swim/00": big / small 2.5 is not 1.6 ± 0.1');
    delete frames['fish-blue-big/dive/00'];
    expect(validateFishing(l, limits(), { frames })).toContain('atlas "fishing": frame "fish-blue-big/dive/00" is missing');
  });
});

describe('fishLumaProblems (Story 4.3)', () => {
  it('Luma too close: two colour means differing by < 0.12 fail naming both; well-spread means pass', () => {
    expect(fishLumaProblems({ yellow: 0.7, orange: 0.5, blue: 0.2 }, 0.12)).toEqual([]);
    const p = fishLumaProblems({ yellow: 0.7, orange: 0.62, blue: 0.2 }, 0.12);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^fishing colours "yellow" and "orange": mean luminances 0\.700 and 0\.620 differ by 0\.080 \(min 0\.12\)$/);
  });
});

describe('fishingRings (Story 4.3)', () => {
  it('a ring at the pond centroid and one per vertex midpoint, sized from the big fish', () => {
    const rings = fishingRings(real(), JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', 'fishing.json'), 'utf8')) as { frames?: Record<string, never> });
    expect(rings).toHaveLength(1 + real().hits[POND_HIT]!.length);
    expect(rings[0]!.label).toBe('pond centre');
    expect(rings[0]!.ring.rx).toBeGreaterThan(80);
  });
});
