// Stories 3.3/3.4: validateDinoPuzzle (one failing case per rule against the real layout and atlas), the
// multiatlas reader and the multi-page asset rule.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAY_ANCHORS, DROP_ORDER, PIECES, SPECIES, screen } from '../../src/content/games/dino-puzzle.ts';
import type { Point, ScreenLayout } from '../../src/content/layout-types.ts';

type EditableLayout = Omit<ScreenLayout, 'anchors' | 'slots'> & { anchors: Record<string, Point>; slots: Record<string, Point> };
import { Tokens } from '../../src/core/tokens.ts';
import { displayedSize } from '../../src/games/dino-puzzle/starts.ts';
import { atlasFrames, centredRect, closeSlotPairs, dinoPuzzleLimits, rectGap, validateAssets, validateDinoPuzzle, type AtlasJsonLike } from './rules.ts';

const APP = join(import.meta.dirname, '..', '..');
const realLayout = (): EditableLayout => JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', 'dino-puzzle.layout.json'), 'utf8'));
const realJson = (): unknown => JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', 'dino-puzzle.json'), 'utf8'));
const realAtlas = (): AtlasJsonLike => atlasFrames(realJson());
const limits = () => dinoPuzzleLimits(screen, SPECIES, PIECES, BAY_ANCHORS, DROP_ORDER);

type Frames = Record<string, { spriteSourceSize: { x: number; y: number; w: number; h: number } }>;
const framesOf = (a: AtlasJsonLike): Frames => a.frames as Frames;

describe('validateDinoPuzzle (Stories 3.3/3.4)', () => {
  it('the real layout and atlas pass (30 slots, 8 bays); layout-only (render without frames) passes too', () => {
    const l = realLayout();
    expect(Object.keys(l.slots)).toHaveLength(30);
    expect(BAY_ANCHORS.filter((b) => l.anchors[b])).toHaveLength(8);
    expect(validateDinoPuzzle(l, limits(), realAtlas())).toEqual([]);
    expect(validateDinoPuzzle(realLayout(), limits())).toEqual([]);
  });

  it('required: a missing slot, bay or frame is named', () => {
    const l = realLayout();
    delete l.slots['triceratops-front-legs'];
    delete l.anchors['dino-bay-6'];
    const a = realAtlas();
    delete framesOf(a)['apatosaurus/walk/01'];
    delete framesOf(a)['stegosaurus-neck/ghost/00'];
    const p = validateDinoPuzzle(l, limits(), a);
    expect(p).toContain('slot "triceratops-front-legs": missing');
    expect(p).toContain('anchor "dino-bay-6": missing');
    expect(p).toContain('atlas "dino-puzzle": frame "apatosaurus/walk/01" is missing');
    expect(p).toContain('atlas "dino-puzzle": frame "stegosaurus-neck/ghost/00" is missing');
  });

  it('sizes: a dino off 360 ± 40 and a piece with a raw longest side of 30 px are named', () => {
    const a = realAtlas();
    framesOf(a)['triceratops/idle/00']!.spriteSourceSize.w = 900;
    framesOf(a)['stegosaurus-head/idle/00']!.spriteSourceSize = { ...framesOf(a)['stegosaurus-head/idle/00']!.spriteSourceSize, w: 60, h: 40 };
    const p = validateDinoPuzzle(realLayout(), limits(), a);
    expect(p.some((m) => m.startsWith('frame "triceratops/idle/00": longest side 450 is not 360 ± 40'))).toBe(true);
    expect(p).toContain('frame "stegosaurus-head/idle/00": raw longest side 30 is under 40');
  });

  it('sizes: a hit diameter under the hit target is named', () => {
    const tight = { ...limits(), targetMin: 400 };
    const p = validateDinoPuzzle(realLayout(), tight, realAtlas());
    expect(p.some((m) => /^frame "apatosaurus-head\/idle\/00": hit diameter [\d.]+ is under 400$/.test(m))).toBe(true);
  });

  it('slots: a slot more than 3 px from its piece frame’s trimmed centre is named', () => {
    const l = realLayout();
    l.slots['apatosaurus-neck'] = { x: l.slots['apatosaurus-neck']!.x + 5, y: l.slots['apatosaurus-neck']!.y };
    expect(validateDinoPuzzle(l, limits(), realAtlas()).some((m) => m.startsWith('slot "apatosaurus-neck":'))).toBe(true);
  });

  it('bay × piece: a bay under Home with the body piece, off the interactive rect, off the grass, over the ghost', () => {
    const l = realLayout();
    l.anchors['dino-bay-1'] = { x: 70, y: 110 };
    l.anchors['dino-bay-7'] = { x: 30, y: 600 };
    l.anchors['dino-bay-3'] = { ...l.anchors.stegosaurus!, y: l.anchors.stegosaurus!.y - 40 };
    const p = validateDinoPuzzle(l, limits(), realAtlas());
    expect(p).toContain('anchor "dino-bay-1" with "stegosaurus-body": the piece rect reaches into a Home/Speaker keep-out zone');
    expect(p.some((m) => m.startsWith('anchor "dino-bay-1": (70, 110) is not on hit "grass"'))).toBe(true);
    expect(p.some((m) => m.startsWith('anchor "dino-bay-7" with "triceratops-body-legs": the piece rect') && m.includes('leaves the interactive rect'))).toBe(true);
    expect(p).toContain('anchor "dino-bay-3" with "stegosaurus-tail": the piece rect overlaps the ghost of "stegosaurus" grown by 24');
  });

  it('fallback: an identity assignment with 2 pieces 10 px apart is named per species and cut', () => {
    const l = realLayout();
    const atlas = realAtlas();
    // Bay 2 right next to bay 1, so the displayed rects of piece 1 and piece 2 of the 3-piece cut are 10 px apart.
    const b1 = l.anchors['dino-bay-1']!;
    const half = (s: string, p: string) => {
      const ss = framesOf(atlas)[`${s}-${p}/idle/00`]!.spriteSourceSize;
      return displayedSize({ w: ss.w / 2, h: ss.h / 2 }, Tokens.components.draggableItem.minSize).w / 2;
    };
    const s = 'apatosaurus';
    l.anchors['dino-bay-2'] = { x: b1.x + half(s, 'head-neck') + half(s, 'body-legs') + 10, y: b1.y };
    const p = validateDinoPuzzle(l, limits(), atlas);
    expect(p).toContain('species "apatosaurus" cut 3: the identity fallback (piece i → bay i) has piece rects closer than 24');
  });

  it('fallback: a bay inside a slot of the cut is named (piece 1 starts 30 px from its own slot)', () => {
    const l = realLayout();
    const slot = l.slots['apatosaurus-head-neck']!;
    l.anchors['dino-bay-1'] = { x: slot.x + 30, y: slot.y };
    const p = validateDinoPuzzle(l, limits(), realAtlas());
    expect(p).toContain('species "apatosaurus" cut 3: the identity fallback starts a piece within 100 of a slot of the cut');
    expect(p).toContain('species "apatosaurus" cut 4: the identity fallback starts a piece within 100 of a slot of the cut');
  });

  it('fallback: fewer bays than a cut is named once; a fallback that cannot be checked is named', () => {
    const five = validateDinoPuzzle(realLayout(), { ...limits(), bays: BAY_ANCHORS.slice(0, 5) }, realAtlas());
    expect(five.filter((m) => m === 'cut 6: 6 pieces but only 5 bays')).toHaveLength(1);
    const a = realAtlas();
    delete framesOf(a)['triceratops-neck/idle/00'];
    expect(validateDinoPuzzle(realLayout(), limits(), a)).toContain('species "triceratops" cut 6: the identity fallback cannot be checked (missing frame "triceratops-neck/idle/00")');
    const info: string[] = [];
    validateDinoPuzzle(realLayout(), { ...limits(), info: (m) => info.push(m) });
    expect(info).toContain('dino-puzzle: species "stegosaurus" cut 4: the identity fallback check needs the frames (skipped without an atlas)');
  });

  it('close slots: allowed (one info line each) while DROP_ORDER resolves own first; otherwise each pair fails', () => {
    const info: string[] = [];
    expect(validateDinoPuzzle(realLayout(), { ...limits(), info: (m) => info.push(m) }, realAtlas())).toEqual([]);
    expect(info.length).toBeGreaterThan(0);
    for (const s of SPECIES) expect(info.length).toBeGreaterThanOrEqual(closeSlotPairs(realLayout(), s, PIECES, 100).length);
    const p = validateDinoPuzzle(realLayout(), { ...limits(), dropOrder: ['home', 'own', 'other', 'rest', 'off'] }, realAtlas());
    expect(p.some((m) => /^slots "apatosaurus-head" and "apatosaurus-neck": [\d.]+ px apart \(< 100\) but DROP_ORDER does not resolve "own" first$/.test(m))).toBe(true);
    expect(DROP_ORDER[0]).toBe('own');
  });

  it('walk: 140 px is over the 120 px cap; a walk that leaves the safe rect is named', () => {
    const l = realLayout();
    const a = l.anchors.apatosaurus!;
    l.anchors['apatosaurus-walk'] = { x: a.x + 140, y: a.y };
    l.anchors['triceratops-walk'] = { x: l.anchors.triceratops!.x, y: l.anchors.triceratops!.y - 200 };
    const p = validateDinoPuzzle(l, limits(), realAtlas());
    expect(p).toContain('anchor "apatosaurus-walk": 140 px from anchor "apatosaurus" (max 120)');
    expect(p.some((m) => m.startsWith('anchor "triceratops-walk": 200 px'))).toBe(true);
    expect(p.some((m) => m.startsWith('anchor "triceratops-walk": the walked idle rect') && m.endsWith('leaves the safe rect'))).toBe(true);
  });

  it('rect helpers', () => {
    expect(centredRect({ x: 10, y: 10 }, { w: 4, h: 2 })).toEqual({ x: 8, y: 9, w: 4, h: 2 });
    expect(rectGap({ x: 0, y: 0, w: 10, h: 10 }, { x: 13, y: 14, w: 5, h: 5 })).toBe(5);
    expect(rectGap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 5, h: 5 })).toBe(0);
  });
});

describe('multiatlas (Story 3.3)', () => {
  it('atlasFrames reads a multiatlas by frame name and passes a JSON hash through', () => {
    const multi = { textures: [{ frames: [{ filename: 'a/idle/00', spriteSourceSize: { x: 1, y: 2, w: 3, h: 4 } }] }, { frames: [{ filename: 'b/idle/00' }] }] };
    expect(Object.keys(atlasFrames(multi).frames!)).toEqual(['a/idle/00', 'b/idle/00']);
    const hash = { frames: { 'c/idle/00': {} } };
    expect(atlasFrames(hash)).toBe(hash);
    expect(atlasFrames(null)).toEqual({});
  });

  const input = (json: unknown, sizes: Record<string, { width: number; height: number }>, frames: string[] = []) =>
    validateAssets({
      atlases: [{ key: 'atlas.dino-puzzle', png: 'assets/atlases/dino-puzzle-0.png', json: 'assets/atlases/dino-puzzle.json', frames, pages: 4 }],
      backgrounds: [],
      files: [],
      pngSize: (p) => sizes[p],
      readJson: () => json,
    });

  it('every page PNG next to the JSON is checked; more pages than allowed, an oversized page and a missing frame are named', () => {
    const page = (n: number, w = 2048) => ({ image: `dino-puzzle-${n}.png`, size: { w, h: 2048 }, frames: [{ filename: `x-${n}/idle/00` }] });
    const ok = { textures: [page(0), page(1)] };
    const sizes = { 'assets/atlases/dino-puzzle-0.png': { width: 2048, height: 2048 }, 'assets/atlases/dino-puzzle-1.png': { width: 2048, height: 2048 } };
    expect(input(ok, sizes, ['x-1/idle/00'])).toEqual([]);
    expect(input(ok, sizes, ['y/idle/00'])).toEqual(['atlas "atlas.dino-puzzle": frame "y/idle/00" is missing']);
    const five = { textures: [0, 1, 2, 3, 4].map((n) => page(n)) };
    expect(input(five, {})[0]).toBe('atlas "atlas.dino-puzzle": 5 pages (max 4)');
    expect(input({ textures: [page(0, 4096)] }, { 'assets/atlases/dino-puzzle-0.png': { width: 4096, height: 2048 } })).toEqual([
      'atlas "atlas.dino-puzzle": assets/atlases/dino-puzzle-0.png is 4096×2048 (max 2048×2048)',
      'atlas "atlas.dino-puzzle": assets/atlases/dino-puzzle.json page assets/atlases/dino-puzzle-0.png size 4096×2048 exceeds 2048',
    ]);
    expect(input(undefined, {})).toEqual(['atlas "atlas.dino-puzzle": assets/atlases/dino-puzzle.json is missing or not a multiatlas']);
  });

  it('the real multiatlas JSON: ≤ 4 pages, each ≤ 2048², every screen frame present', () => {
    const json = realJson() as { textures: { size: { w: number; h: number } }[] };
    expect(json.textures.length).toBeLessThanOrEqual(4);
    for (const t of json.textures) expect(Math.max(t.size.w, t.size.h)).toBeLessThanOrEqual(2048);
    const frames = realAtlas().frames!;
    for (const f of screen.frames) expect(frames[f]).toBeDefined();
  });
});
