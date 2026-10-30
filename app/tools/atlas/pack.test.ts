import { describe, expect, it } from 'vitest';
import { SCREEN_MAX_PAGES, maxPages, multiAtlas, ALPHA_NOISE_FLOOR, NEAR_IDENTICAL_DIFF, alphaBounds, checkAtlas, clearAlphaNoise, nearlyIdentical, packOptions, packScreen, restoreTrim } from './pack.ts';

const json = (frames: string[], w = 1024, h = 1024): Buffer =>
  Buffer.from(JSON.stringify({ frames: Object.fromEntries(frames.map((f) => [f, {}])), meta: { size: { w, h } } }));

describe('atlas packing', () => {
  it('uses the pinned packer settings', () => {
    expect(packOptions('map')).toEqual({
      textureName: 'map',
      width: 2048,
      height: 2048,
      fixedSize: false,
      powerOfTwo: false,
      padding: 2,
      allowRotation: false,
      allowTrim: true,
      detectIdentical: true,
      removeFileExtension: true,
      prependFolderName: true,
      exporter: 'JsonHash',
    });
  });

  it('accepts one page with good frame names', () => {
    expect(checkAtlas('map', [{ name: 'map.png', buffer: Buffer.alloc(10) }, { name: 'map.json', buffer: json(['pizza/idle/00', 'kart/idle/00']) }])).toEqual([]);
  });

  it('fails on more than one page', () => {
    const files = [
      { name: 'map-0.png', buffer: Buffer.alloc(1) },
      { name: 'map-0.json', buffer: json([]) },
      { name: 'map-1.png', buffer: Buffer.alloc(1) },
      { name: 'map-1.json', buffer: json([]) },
    ];
    expect(checkAtlas('map', files)).toEqual(['atlas "map": packing needs 2 pages (max 1)']);
  });

  it('fails on a page over 2048, a bad frame name or a file over 8 MiB', () => {
    expect(checkAtlas('map', [{ name: 'map.png', buffer: Buffer.alloc(1) }, { name: 'map.json', buffer: json(['pizza/idle/00'], 4096, 10) }])).toEqual([
      'atlas "map": page 4096×10 exceeds 2048',
    ]);
    expect(checkAtlas('map', [{ name: 'map.png', buffer: Buffer.alloc(1) }, { name: 'map.json', buffer: json(['pizza.png']) }])).toEqual([
      'atlas "map": frame "pizza.png" is not <object>/<state>/<nn>',
    ]);
    expect(checkAtlas('map', [{ name: 'map.png', buffer: Buffer.alloc(8388609) }, { name: 'map.json', buffer: json([]) }])).toEqual([
      'atlas "map": map.png is 8388609 bytes (max 8388608)',
    ]);
  });

  it('rejects an unknown screen', async () => {
    await expect(packScreen('foo')).rejects.toThrow('unknown screen "foo": known screens are map');
  });

  it('alphaBounds finds the opaque box (whole frame when empty)', () => {
    const data = new Uint8Array(4 * 4 * 3);
    data[(1 * 4 + 2) * 4 + 3] = 255;
    data[(2 * 4 + 1) * 4 + 3] = 1;
    expect(alphaBounds(data, 4, 3)).toEqual({ left: 1, top: 1, right: 2, bottom: 2 });
    expect(alphaBounds(new Uint8Array(4 * 4 * 3), 4, 3)).toEqual({ left: 0, top: 0, right: 3, bottom: 2 });
  });

  it('restoreTrim puts a pre-trimmed frame back into its full frame', () => {
    const json = { frames: { 'pizza/idle/00': { trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 250, h: 293 }, sourceSize: { w: 250, h: 293 } } } };
    restoreTrim(json, new Map([['pizza/idle/00', { left: 1091, top: 702, width: 2048, height: 1536 }]]));
    expect(json.frames['pizza/idle/00']).toEqual({ trimmed: true, spriteSourceSize: { x: 1091, y: 702, w: 250, h: 293 }, sourceSize: { w: 2048, h: 1536 } });
  });
});

describe('clearAlphaNoise (Story 1.8)', () => {
  it('clears pixels under the floor so they neither show nor widen the trim', () => {
    // 3×1 RGBA: noise, solid, faint-but-kept.
    const data = new Uint8Array([9, 9, 9, 5, 1, 2, 3, 255, 4, 4, 4, ALPHA_NOISE_FLOOR]);
    expect(clearAlphaNoise(data)).toBe(1);
    expect([...data.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    expect(alphaBounds(data, 3, 1)).toEqual({ left: 1, top: 0, right: 2, bottom: 0 });
  });
});

describe('alphaBounds minAlpha (Story 1.8)', () => {
  it('ignores pixels under minAlpha', () => {
    const data = new Uint8Array([0, 0, 0, 40, 0, 0, 0, 255, 0, 0, 0, 0]);
    expect(alphaBounds(data, 3, 1)).toEqual({ left: 0, top: 0, right: 1, bottom: 0 });
    expect(alphaBounds(data, 3, 1, 64)).toEqual({ left: 1, top: 0, right: 1, bottom: 0 });
  });
});

describe('nearlyIdentical (Story 3.1)', () => {
  it('same size and every channel within the tolerance → one packed frame', () => {
    const a = new Uint8Array([10, 20, 30, 255, 0, 0, 0, 0]);
    const b = new Uint8Array([10 + NEAR_IDENTICAL_DIFF, 20, 30 - NEAR_IDENTICAL_DIFF, 255, 0, 0, 0, 0]);
    expect(nearlyIdentical(a, b)).toBe(true);
    expect(nearlyIdentical(a, new Uint8Array([10 + NEAR_IDENTICAL_DIFF + 1, 20, 30, 255, 0, 0, 0, 0]))).toBe(false);
    expect(nearlyIdentical(a, a.slice(0, 4))).toBe(false);
  });
});

describe('multi-page atlases (Story 3.3)', () => {
  const frame = (x: number) => ({ frame: { x, y: 0, w: 10, h: 10 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 10, h: 10 }, sourceSize: { w: 10, h: 10 } });
  const page = (frames: Record<string, unknown>, w = 2048, h = 2048): Buffer => Buffer.from(JSON.stringify({ frames, meta: { size: { w, h } } }));
  const pages = (n: number) =>
    Array.from({ length: n }, (_, i) => [
      { name: `dino-puzzle-${i}.png`, buffer: Buffer.from([i]) },
      { name: `dino-puzzle-${i}.json`, buffer: page({ [`p${i}/idle/00`]: frame(i) }) },
    ]).flat();

  it('only dino-puzzle (4), touch-talk (3, Story 4.6) and shadow-match (3, 2026-10-22) and pet-clinic (3, Story 8.1), ice-cream (3) and dress-up (2) (Story 8.2: the outfit overlays) and garden (3, 2026-10-30: the outfit overlays) may use several pages; every other screen stays at 1', () => {
    expect(SCREEN_MAX_PAGES).toEqual({ 'dino-puzzle': 4, 'shadow-match': 3, 'touch-talk': 3, 'pet-clinic': 3, 'ice-cream': 3, 'dress-up': 2, garden: 3 });
    expect(maxPages('ice-cream')).toBe(3);
    expect(maxPages('dress-up')).toBe(2);
    expect(maxPages('shadow-match')).toBe(3);
    expect(maxPages('touch-talk')).toBe(3);
    expect(maxPages('pet-clinic')).toBe(3);
    expect(maxPages('dino-puzzle')).toBe(4);
    expect(maxPages('map')).toBe(1);
    expect(maxPages('pizza')).toBe(1);
  });

  it('4 pages pass; 5 pages fail with no write; a page over 2048 is named', () => {
    expect(checkAtlas('dino-puzzle', pages(4), 4)).toEqual([]);
    expect(checkAtlas('dino-puzzle', pages(5), 4)).toEqual(['atlas "dino-puzzle": packing needs 5 pages (max 4)']);
    const big = [{ name: 'dino-puzzle-0.png', buffer: Buffer.alloc(1) }, { name: 'dino-puzzle-0.json', buffer: page({}, 4096, 10) }];
    expect(checkAtlas('dino-puzzle', big, 4)).toEqual(['atlas "dino-puzzle": page 4096×10 exceeds 2048']);
  });

  it('multiAtlas: one Phaser multiatlas JSON, pages in order with their frame arrays and the full-frame trim restored', () => {
    const files = pages(3).reverse();
    const trims = new Map([['p1/idle/00', { left: 100, top: 50, width: 2048, height: 1536 }]]);
    const { json, pngs } = multiAtlas('dino-puzzle', files, trims);
    expect(pngs.map((b) => b[0])).toEqual([0, 1, 2]);
    expect(json.textures.map((t) => t.image)).toEqual(['dino-puzzle-0.png', 'dino-puzzle-1.png', 'dino-puzzle-2.png']);
    const f = json.textures[1]!.frames[0]!;
    expect(f).toMatchObject({ filename: 'p1/idle/00', trimmed: true, spriteSourceSize: { x: 100, y: 50, w: 10, h: 10 }, sourceSize: { w: 2048, h: 1536 } });
    // A lone page (no suffix from the packer) is page 0.
    expect(multiAtlas('dino-puzzle', [{ name: 'dino-puzzle.png', buffer: Buffer.from([7]) }, { name: 'dino-puzzle.json', buffer: page({ 'a/idle/00': frame(0) }) }], new Map()).json.textures[0]!.image).toBe('dino-puzzle-0.png');
  });
});

describe('multi-page atlas failures (Story 3.3)', () => {
  const page = (frames: string[]): Buffer =>
    Buffer.from(JSON.stringify({ frames: Object.fromEntries(frames.map((f) => [f, { frame: { x: 0, y: 0, w: 1, h: 1 }, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 1, h: 1 }, sourceSize: { w: 1, h: 1 } }])), meta: { size: { w: 8, h: 8 } } }));

  it('a frame name on two pages fails, naming it', () => {
    const files = [
      { name: 'dino-puzzle-0.png', buffer: Buffer.from([0]) },
      { name: 'dino-puzzle-0.json', buffer: page(['a/idle/00', 'b/idle/00']) },
      { name: 'dino-puzzle-1.png', buffer: Buffer.from([1]) },
      { name: 'dino-puzzle-1.json', buffer: page(['b/idle/00']) },
    ];
    expect(() => multiAtlas('dino-puzzle', files, new Map())).toThrow('atlas "dino-puzzle": frame "b/idle/00" is on more than one page');
  });

  it('a page image without its JSON (or the reverse) has its own message', () => {
    const files = [
      { name: 'dino-puzzle-0.png', buffer: Buffer.from([0]) },
      { name: 'dino-puzzle-0.json', buffer: page(['a/idle/00']) },
      { name: 'dino-puzzle-1.png', buffer: Buffer.from([1]) },
    ];
    expect(checkAtlas('dino-puzzle', files, 4)).toEqual(['atlas "dino-puzzle": the packer wrote 2 page image(s) but 1 page JSON(s)']);
  });
});
