// Story 8.2: validateDressUp and validateOutfitFrames on the real layouts and atlases, and their failures.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScreenLayout } from '../../src/content/layout-types.ts';
import { OUTFIT_ITEM_IDS, iconFrame, overlayFrame } from '../../src/content/games/dress-up.ts';
import { atlasFrames, dressUpLimits, validateDressUp, validateOutfitFrames, type AtlasJsonLike } from './rules.ts';

const APP = join(import.meta.dirname, '..', '..');
const layoutOf = (screen: string): ScreenLayout => JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', `${screen}.layout.json`), 'utf8')) as ScreenLayout;
const atlasOf = (screen: string): AtlasJsonLike => atlasFrames(JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', `${screen}.json`), 'utf8')));
const box = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const withTrim = (atlas: AtlasJsonLike, frame: string, ss: { x: number; y: number; w: number; h: number }): AtlasJsonLike => ({
  frames: { ...atlas.frames, [frame]: { ...atlas.frames![frame], spriteSourceSize: ss } },
});

describe('validateDressUp (Story 8.2)', () => {
  it('the real layout and atlas pass; item tap circles are ≥ 110 px with ≥ 24 px gaps', () => {
    expect(validateDressUp(layoutOf('dress-up'), dressUpLimits(), atlasOf('dress-up'))).toEqual([]);
    expect(dressUpLimits().itemHitPx).toBeGreaterThanOrEqual(110);
    expect(dressUpLimits().gap).toBeGreaterThanOrEqual(24);
  });

  it('a narrow Shiba hull, a mirror under the Home zone and an off-screen anchor fail naming the ids', () => {
    const l = layoutOf('dress-up');
    expect(validateDressUp({ ...l, hits: { ...l.hits, shiba: box(300, 400, 40, 200) } }, dressUpLimits()).some((m) => m.startsWith('hit "shiba":') && m.includes('wide'))).toBe(true);
    expect(validateDressUp({ ...l, hits: { ...l.hits, mirror: box(10, 10, 200, 300) } }, dressUpLimits()).some((m) => m.startsWith('hit "mirror": reaches into the Home/Speaker'))).toBe(true);
    expect(validateDressUp({ ...l, anchors: { ...l.anchors, mirror: { x: -5, y: 300 } } }, dressUpLimits()).some((m) => m.startsWith('anchor "mirror"') && m.includes('off the screen'))).toBe(true);
  });

  it('two icons too close, an icon on Shiba and a missing overlay frame are named', () => {
    const l = layoutOf('dress-up');
    const atlas = atlasOf('dress-up');
    const [a, b] = [iconFrame(OUTFIT_ITEM_IDS[0]!), iconFrame(OUTFIT_ITEM_IDS[1]!)];
    const tb = atlas.frames![b]!.spriteSourceSize!;
    expect(validateDressUp(l, dressUpLimits(), withTrim(atlas, a, { x: tb.x! + 40, y: tb.y!, w: tb.w!, h: tb.h! })).some((m) => m.startsWith(`icons "${a}" and "${b}"`) || m.startsWith(`icons "${b}" and "${a}"`))).toBe(true);
    const shiba = l.hits.shiba!;
    const cx = shiba.reduce((s, p) => s + p.x, 0) / shiba.length;
    const cy = shiba.reduce((s, p) => s + p.y, 0) / shiba.length;
    const rs = l.renderScale;
    expect(validateDressUp(l, dressUpLimits(), withTrim(atlas, a, { x: (cx - 40) * rs, y: (cy - 40) * rs, w: 80 * rs, h: 80 * rs })).some((m) => m.startsWith(`icon "${a}" and hit "shiba"`))).toBe(true);
    const gone = overlayFrame('shiba/idle/00', 'crown');
    const without: AtlasJsonLike = { frames: Object.fromEntries(Object.entries(atlas.frames ?? {}).filter(([k]) => k !== gone)) };
    expect(validateDressUp(l, dressUpLimits(), without)).toContain(`atlas "dress-up": frame "${gone}" is missing`);
  });
});

describe('validateOutfitFrames (Story 8.2)', () => {
  it.each(['map', 'ice-cream', 'dress-up'])('every Shiba frame of %s has its overlay for all 11 items', (screen) => {
    const atlas = atlasOf(screen);
    expect(validateOutfitFrames(screen, atlas)).toEqual([]);
    const shiba = Object.keys(atlas.frames ?? {}).filter((f) => f.startsWith('shiba/'));
    expect(shiba.length).toBeGreaterThan(0);
    for (const f of shiba) for (const id of OUTFIT_ITEM_IDS) expect(atlas.frames![overlayFrame(f, id)], overlayFrame(f, id)).toBeDefined();
  });

  it('a missing overlay or no Shiba frame at all is named', () => {
    const atlas = atlasOf('map');
    const gone = overlayFrame('shiba/wave/02', 'beanie');
    const without: AtlasJsonLike = { frames: Object.fromEntries(Object.entries(atlas.frames ?? {}).filter(([k]) => k !== gone)) };
    expect(validateOutfitFrames('map', without)).toEqual([`atlas "map": overlay "${gone}" is missing`]);
    expect(validateOutfitFrames('map', { frames: {} })).toEqual(['atlas "map": no "shiba/<state>/<nn>" frame']);
  });
});
