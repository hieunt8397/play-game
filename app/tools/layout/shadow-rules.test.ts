// Stories 3.5, 3.6: validateShadowMatch, a passing fixture and a failing case per rule (each names the id).
// 2026-10-22: no triceratops; the item waits on a pedestal (`anchor.item-rest`); items and shadows 210 px.
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
    anchors: { 'item-rest': { x: 512, y: 606 }, 'pedestal-top': { x: 512, y: 666 }, ...over.anchors },
    hits: {
      cave: [
        { x: 360, y: 223 },
        { x: 622, y: 223 },
        { x: 617, y: 455 },
        { x: 366, y: 455 },
      ],
      pedestal: [
        { x: 430, y: 646 },
        { x: 594, y: 646 },
        { x: 594, y: 752 },
        { x: 430, y: 752 },
      ],
      ...over.hits,
    },
    // The rows arc over the pedestal on the cave wall, as the builder emits them (2026-10-22).
    slots: {
      'shadow-2-1': { x: 225, y: 330 },
      'shadow-2-2': { x: 799, y: 330 },
      'shadow-3-1': { x: 160, y: 410 },
      'shadow-3-2': { x: 512, y: 190 },
      'shadow-3-3': { x: 864, y: 410 },
      'shadow-4-1': { x: 140, y: 445 },
      'shadow-4-2': { x: 372, y: 205 },
      'shadow-4-3': { x: 652, y: 205 },
      'shadow-4-4': { x: 884, y: 445 },
      ...over.slots,
    },
    paths: {},
  } as ScreenLayout;
}

/** An atlas whose items are `w`×`h` design px (both frames the same rect). */
function atlas(w = 210, h = 154, extra: Record<string, { w: number; h: number; x?: number }> = {}): AtlasJsonLike {
  const frames: Record<string, { spriteSourceSize: { x: number; y: number; w: number; h: number } }> = {};
  for (const f of screen.frames) frames[f] = { spriteSourceSize: { x: 100, y: 100, w: w * RS, h: h * RS } };
  for (const [f, s] of Object.entries(extra)) frames[f] = { spriteSourceSize: { x: s.x ?? 100, y: 100, w: s.w * RS, h: s.h * RS } };
  return { frames };
}

describe('validateShadowMatch (Story 3.5)', () => {
  it('a good layout and atlas pass; without the atlas only the layout ids and the pedestal centre are checked; no triceratops is required', () => {
    expect(validateShadowMatch(layout(), limits(), atlas())).toEqual([]);
    expect(validateShadowMatch(layout(), limits())).toEqual([]);
    expect(screen.anchors).toEqual(['item-rest', 'pedestal-top']);
    expect(screen.frames.some((f) => f.startsWith('triceratops'))).toBe(false);
  });

  it('required: a missing slot, anchor or hit and a missing frame are named', () => {
    const l = layout();
    delete (l.slots as Record<string, unknown>)['shadow-2-2'];
    delete (l.anchors as Record<string, unknown>)['item-rest'];
    delete (l.hits as Record<string, unknown>).cave;
    const a = atlas();
    delete a.frames!['item-cow/shadow/00'];
    const p = validateShadowMatch(l, limits(), a);
    expect(p).toEqual(expect.arrayContaining(['slot "shadow-2-2": missing', 'anchor "item-rest": missing', 'hit "cave": missing or has fewer than 3 points', 'atlas "shadow-match": frame "item-cow/shadow/00" is missing']));
  });

  it('sizes: the pedestal off centre, an item off size, under the shadow minimum, a shadow rect that differs', () => {
    expect(validateShadowMatch(layout({ anchors: { 'item-rest': { x: 700, y: 606 } } }), limits())).toEqual(['anchor "item-rest": x 700 is more than 170.67 from the centre 512']);
    const small = atlas(210, 154, { 'item-dog/color/00': { w: 115, h: 80 }, 'item-dog/shadow/00': { w: 115, h: 80 } });
    expect(validateShadowMatch(layout(), limits(), small)).toEqual([
      'frame "item-dog/color/00": longest side 115 is not 210 ± 14',
      'frame "item-dog/color/00": longest side 115 is under the shadow minimum 120',
      'item "dog": held longest side 80.5 is under 90',
    ]);
    const moved = atlas(210, 154, { 'item-cow/shadow/00': { w: 210, h: 154, x: 104 } });
    expect(validateShadowMatch(layout(), limits(), moved)).toEqual(['frame "item-cow/shadow/00": its trimmed rect differs from "item-cow/color/00" (the outline must be the same)']);
  });

  it('slots: under the Speaker, outside the interactive rect, too close together, or too close to the hand (a level-4 snap zone)', () => {
    const speaker = validateShadowMatch(layout({ slots: { 'shadow-2-2': { x: 930, y: 150 } } }), limits(), atlas());
    expect(speaker).toEqual(expect.arrayContaining(['slot "shadow-2-2": the shadow circle reaches into a Home/Speaker keep-out zone']));
    const edge = validateShadowMatch(layout({ slots: { 'shadow-2-1': { x: 60, y: 330 } } }), limits(), atlas());
    expect(edge.some((p) => p.startsWith('slot "shadow-2-1": the shadow circle (r 105) at (60, 330) leaves the interactive rect'))).toBe(true);
    const close = validateShadowMatch(layout({ slots: { 'shadow-2-1': { x: 200, y: 300 }, 'shadow-2-2': { x: 340, y: 300 } } }), limits(), atlas());
    expect(close).toContain('slots "shadow-2-1" and "shadow-2-2": 140 px apart (min 234)');
    // shadowR 105 + 100 × 2 + heldR 73.5 = 378.5: a slot 300 px from the pedestal is inside a level-4 zone.
    const hand = validateShadowMatch(layout({ slots: { 'shadow-2-2': { x: 752, y: 426 } } }), limits(), atlas());
    expect(hand).toEqual(['slot "shadow-2-2": 300 px from anchor "item-rest" (min 378.5: the held item would start inside a level-4 snap zone)']);
  });

  it('pedestal: above the lower third, under Home, or with the held circle off the interactive rect', () => {
    const high = validateShadowMatch(layout({ anchors: { 'item-rest': { x: 512, y: 500 } } }), limits(), atlas());
    expect(high).toContain('anchor "item-rest": y 500 is above the lower third (512)');
    const low = validateShadowMatch(layout({ anchors: { 'item-rest': { x: 512, y: 680 } } }), limits(), atlas());
    expect(low.some((p) => p.startsWith('anchor "item-rest": the held circle (r 73.5) at (512, 680) leaves the interactive rect'))).toBe(true);
    const home = shadowMatchLimits(screen, ITEM_IDS, SHADOW_COUNTS);
    const p = validateShadowMatch(layout(), { ...home, keepOut: [{ x: 480, y: 580, w: 60, h: 60 }] }, atlas());
    expect(p).toContain('anchor "item-rest": the held circle reaches into a Home/Speaker keep-out zone');
  });

  it('reveal: a shadow larger than a quarter of the screen fails; a held hit under targetMin fails', () => {
    const huge = { ...limits(), itemPx: 450, itemTolerance: 14 };
    const p = validateShadowMatch(layout({ slots: { 'shadow-2-1': { x: 300, y: 300 }, 'shadow-2-2': { x: 800, y: 300 } } }), huge, atlas(450, 300));
    expect(p).toContain('shadow-match: a revealed shadow (450 px square) covers more than 25% of the screen');
    const tiny = { ...limits(), targetMin: 400 };
    expect(validateShadowMatch(layout(), tiny, atlas())).toEqual(['anchor "item-rest": the held hit diameter 195 is under 400']);
  });

  it('shadowSizes: the largest half longest side and the held radius', () => {
    const s = shadowSizes(atlas(210, 154, { 'item-horse/color/00': { w: 220, h: 160 } }), ITEM_IDS, RS);
    expect(s.shadowR).toBe(110);
    expect(s.heldR).toBeCloseTo(77);
    expect(s.sizes.get('horse')).toEqual({ w: 220, h: 160 });
  });

  it('the real generated layout and the published atlas pass', () => {
    const app = join(import.meta.dirname, '..', '..');
    const real = JSON.parse(readFileSync(join(app, 'src', 'content', 'generated', 'shadow-match.layout.json'), 'utf8')) as ScreenLayout;
    const a = atlasFrames(JSON.parse(readFileSync(join(app, 'public', 'assets', 'atlases', 'shadow-match.json'), 'utf8')));
    expect(validateShadowMatch(real, limits(), a)).toEqual([]);
  });
});
