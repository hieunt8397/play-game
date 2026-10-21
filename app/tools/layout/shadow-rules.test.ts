// Stories 3.5, 3.6: validateShadowMatch, a passing fixture and a failing case per rule (each names the id).
import { describe, expect, it } from 'vitest';
import type { ScreenLayout } from '../../src/content/layout-types.ts';
import { ITEM_IDS, SHADOW_COUNTS, screen } from '../../src/content/games/shadow-match.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { atlasFrames, shadowMatchLimits, shadowSizes, validateShadowMatch, type AtlasJsonLike } from './rules.ts';

const RS = 2;
const limits = () => shadowMatchLimits(screen, ITEM_IDS, SHADOW_COUNTS);

function layout(over: Partial<Pick<ScreenLayout, 'anchors' | 'slots' | 'hits'>> = {}): ScreenLayout {
  return {
    v: 1,
    screenId: 'shadow-match',
    design: { width: 1024, height: 768 },
    renderScale: RS,
    anchors: { triceratops: { x: 470, y: 492 }, 'triceratops-hand': { x: 508, y: 560 }, ...over.anchors },
    hits: {
      cave: [
        { x: 360, y: 223 },
        { x: 622, y: 223 },
        { x: 617, y: 455 },
        { x: 366, y: 455 },
      ],
      ...over.hits,
    },
    // Rows 3 and 4 (Story 3.6): two tiers per ledge, as the builder emits them.
    slots: {
      'shadow-2-1': { x: 150, y: 385 },
      'shadow-2-2': { x: 830, y: 385 },
      'shadow-3-1': { x: 141, y: 258 },
      'shadow-3-2': { x: 137, y: 447 },
      'shadow-3-3': { x: 815, y: 336 },
      'shadow-4-1': { x: 141, y: 258 },
      'shadow-4-2': { x: 137, y: 447 },
      'shadow-4-3': { x: 819, y: 258 },
      'shadow-4-4': { x: 826, y: 447 },
      ...over.slots,
    },
    paths: {},
  } as ScreenLayout;
}

/** An atlas whose items are `w`×`h` design px (both frames the same rect) and whose trike is 300 px. */
function atlas(w = 150, h = 110, extra: Record<string, { w: number; h: number; x?: number }> = {}): AtlasJsonLike {
  const frames: Record<string, { spriteSourceSize: { x: number; y: number; w: number; h: number } }> = {};
  for (const f of screen.frames) frames[f] = { spriteSourceSize: { x: 100, y: 100, w: w * RS, h: h * RS } };
  for (const f of screen.frames.filter((f) => f.startsWith('triceratops/'))) frames[f] = { spriteSourceSize: { x: 700, y: 400, w: 220 * RS, h: 300 * RS } };
  for (const [f, s] of Object.entries(extra)) frames[f] = { spriteSourceSize: { x: s.x ?? 100, y: 100, w: s.w * RS, h: s.h * RS } };
  return { frames };
}

describe('validateShadowMatch (Story 3.5)', () => {
  it('a good layout and atlas pass; without the atlas only the layout ids and the trike centre are checked', () => {
    expect(validateShadowMatch(layout(), limits(), atlas())).toEqual([]);
    expect(validateShadowMatch(layout(), limits())).toEqual([]);
  });

  it('required: a missing slot, anchor or hit and a missing frame are named', () => {
    const l = layout();
    delete (l.slots as Record<string, unknown>)['shadow-2-2'];
    delete (l.anchors as Record<string, unknown>)['triceratops-hand'];
    delete (l.hits as Record<string, unknown>).cave;
    const a = atlas();
    delete a.frames!['triceratops/nod/00'];
    const p = validateShadowMatch(l, limits(), a);
    expect(p).toEqual(expect.arrayContaining(['slot "shadow-2-2": missing', 'anchor "triceratops-hand": missing', 'hit "cave": missing or has fewer than 3 points', 'atlas "shadow-match": frame "triceratops/nod/00" is missing']));
  });

  it('sizes: the trike off size or off centre, an item off size, under the shadow minimum, a shadow rect that differs', () => {
    const big = atlas(150, 110, { 'triceratops/idle/00': { w: 340, h: 200 } });
    expect(validateShadowMatch(layout(), limits(), big)).toEqual(['frame "triceratops/idle/00": longest side 340 is not 300 ± 30']);
    expect(validateShadowMatch(layout({ anchors: { triceratops: { x: 700, y: 492 } } }), limits(), atlas())).toEqual([
      'anchor "triceratops": x 700 is more than 170.67 from the centre 512',
    ]);
    const small = atlas(150, 110, { 'item-dog/color/00': { w: 115, h: 80 }, 'item-dog/shadow/00': { w: 115, h: 80 } });
    expect(validateShadowMatch(layout(), limits(), small)).toEqual([
      'frame "item-dog/color/00": longest side 115 is not 150 ± 10',
      'frame "item-dog/color/00": longest side 115 is under the shadow minimum 120',
      'item "dog": held longest side 80.5 is under 90',
    ]);
    const moved = atlas(150, 110, { 'item-cow/shadow/00': { w: 150, h: 110, x: 104 } });
    expect(validateShadowMatch(layout(), limits(), moved)).toEqual(['frame "item-cow/shadow/00": its trimmed rect differs from "item-cow/color/00" (the outline must be the same)']);
  });

  it('slots: under the Speaker, outside the interactive rect, too close together, or too close to the hand (a level-4 snap zone)', () => {
    const speaker = validateShadowMatch(layout({ slots: { 'shadow-2-2': { x: 930, y: 150 } } }), limits(), atlas());
    expect(speaker).toEqual(expect.arrayContaining(['slot "shadow-2-2": the shadow circle reaches into a Home/Speaker keep-out zone']));
    const edge = validateShadowMatch(layout({ slots: { 'shadow-2-1': { x: 60, y: 385 } } }), limits(), atlas());
    expect(edge.some((p) => p.startsWith('slot "shadow-2-1": the shadow circle (r 75) at (60, 385) leaves the interactive rect'))).toBe(true);
    const close = validateShadowMatch(layout({ slots: { 'shadow-2-1': { x: 200, y: 300 }, 'shadow-2-2': { x: 340, y: 300 } } }), limits(), atlas());
    expect(close).toContain('slots "shadow-2-1" and "shadow-2-2": 140 px apart (min 174)');
    // shadowR 75 + 100 × 2 + heldR 52.5 = 327.5: a slot 300 px from the hand is inside a level-4 zone.
    const hand = validateShadowMatch(layout({ slots: { 'shadow-2-2': { x: 808, y: 560 } } }), limits(), atlas());
    expect(hand).toEqual(['slot "shadow-2-2": 300 px from anchor "triceratops-hand" (min 327.5: the held item would start inside a level-4 snap zone)']);
  });

  it('hand: above the lower third, under Home, or with the held circle off the interactive rect', () => {
    const high = validateShadowMatch(layout({ anchors: { 'triceratops-hand': { x: 508, y: 500 } } }), limits(), atlas());
    expect(high).toContain('anchor "triceratops-hand": y 500 is above the lower third (512)');
    const low = validateShadowMatch(layout({ anchors: { 'triceratops-hand': { x: 508, y: 680 } } }), limits(), atlas());
    expect(low.some((p) => p.startsWith('anchor "triceratops-hand": the held circle (r 52.5) at (508, 680) leaves the interactive rect'))).toBe(true);
    const home = shadowMatchLimits(screen, ITEM_IDS, SHADOW_COUNTS);
    const p = validateShadowMatch(layout({ anchors: { 'triceratops-hand': { x: 508, y: 560 } } }), { ...home, keepOut: [{ x: 480, y: 540, w: 60, h: 60 }] }, atlas());
    expect(p).toContain('anchor "triceratops-hand": the held circle reaches into a Home/Speaker keep-out zone');
  });

  it('reveal: a shadow larger than a quarter of the screen fails; a held hit under targetMin fails', () => {
    const huge = { ...limits(), itemPx: 450, itemTolerance: 10 };
    const p = validateShadowMatch(layout({ slots: { 'shadow-2-1': { x: 300, y: 300 }, 'shadow-2-2': { x: 800, y: 300 } } }), huge, atlas(450, 300));
    expect(p).toContain('shadow-match: a revealed shadow (450 px square) covers more than 25% of the screen');
    const tiny = { ...limits(), targetMin: 400 };
    expect(validateShadowMatch(layout(), tiny, atlas())).toEqual(['anchor "triceratops-hand": the held hit diameter 153 is under 400']);
  });

  it('shadowSizes: the largest half longest side and the held radius', () => {
    const s = shadowSizes(atlas(150, 110, { 'item-horse/color/00': { w: 160, h: 120 } }), ITEM_IDS, RS);
    expect(s.shadowR).toBe(80);
    expect(s.heldR).toBeCloseTo(56);
    expect(s.sizes.get('horse')).toEqual({ w: 160, h: 120 });
  });

  it('the real generated layout and the published atlas pass', () => {
    const app = join(import.meta.dirname, '..', '..');
    const real = JSON.parse(readFileSync(join(app, 'src', 'content', 'generated', 'shadow-match.layout.json'), 'utf8')) as ScreenLayout;
    const a = atlasFrames(JSON.parse(readFileSync(join(app, 'public', 'assets', 'atlases', 'shadow-match.json'), 'utf8')));
    expect(validateShadowMatch(real, limits(), a)).toEqual([]);
  });
});
