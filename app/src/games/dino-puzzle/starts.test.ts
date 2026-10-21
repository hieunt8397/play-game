// Story 3.4: loose-piece scale and the seeded start arrangement, swept over the real generated layout
// and the published atlas.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAY_ANCHORS, PIECES, SPECIES, START_ATTEMPTS, type PieceId, type SpeciesId } from '../../content/games/dino-puzzle';
import type { Point, ScreenLayout } from '../../content/layout-types';
import { Tokens } from '../../core/tokens';
import { arrangeStarts, assign, clearOfSlots, displayedRect, displayedSize, hitRadius, pairsClear, pieceScale, rectGap, type StartGeo } from './starts';

const APP = join(import.meta.dirname, '..', '..', '..');
const layout = JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', 'dino-puzzle.layout.json'), 'utf8')) as ScreenLayout;
const atlasJson = JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', 'dino-puzzle.json'), 'utf8')) as {
  textures: { frames: { filename: string; spriteSourceSize: { w: number; h: number } }[] }[];
};
const trims = new Map(atlasJson.textures.flatMap((t) => t.frames.map((f) => [f.filename, f.spriteSourceSize] as const)));
const rs = layout.renderScale;

const realGeo: StartGeo = {
  bays: BAY_ANCHORS.map((id) => layout.anchors[id]!),
  slot: (s, p) => layout.slots[`${s}-${p}`]!,
  size: (s, p) => {
    const t = trims.get(`${s}-${p}/idle/00`)!;
    return { w: t.w / rs, h: t.h / rs };
  },
};
const CUTS = Object.entries(PIECES) as [string, readonly PieceId[]][];
const key = (at: Partial<Record<PieceId, Point>>): string => JSON.stringify(at);

describe('pieceScale and the displayed piece (Story 3.4)', () => {
  const min = Tokens.components.draggableItem.minSize;

  it('max(1, minSize / rawLongest): a 50 px neck is drawn at 1.8× (90 px); a big piece stays at 1', () => {
    expect(pieceScale(50)).toBeCloseTo(1.8);
    expect(pieceScale(200)).toBe(1);
    expect(pieceScale(min)).toBe(1);
    expect(pieceScale(0)).toBe(1);
  });

  it('the displayed rect is the trimmed size × pieceScale centred on the point; the hit r adds hitPad', () => {
    expect(displayedSize({ w: 50, h: 25 })).toEqual({ w: 90, h: 45 });
    expect(displayedRect({ x: 100, y: 100 }, { w: 50, h: 25 })).toEqual({ x: 55, y: 77.5, w: 90, h: 45 });
    expect(hitRadius({ w: 50, h: 25 })).toBe(45 + Tokens.components.draggableItem.hitPad);
    expect(hitRadius({ w: 200, h: 100 })).toBe(100 + Tokens.components.draggableItem.hitPad);
  });

  it('rectGap', () => {
    expect(rectGap({ x: 0, y: 0, w: 10, h: 10 }, { x: 13, y: 14, w: 5, h: 5 })).toBe(5);
    expect(rectGap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 5, h: 5 })).toBe(0);
  });
});

describe('pairsClear / clearOfSlots (Story 3.4)', () => {
  const geo: StartGeo = { bays: [], slot: () => ({ x: 0, y: 0 }), size: () => ({ w: 100, h: 100 }) };

  it('two pieces 10 px apart are not clear; 24 px apart are', () => {
    expect(pairsClear({ head: { x: 200, y: 200 }, neck: { x: 310, y: 200 } }, 'apatosaurus', geo)).toBe(false);
    expect(pairsClear({ head: { x: 200, y: 200 }, neck: { x: 324, y: 200 } }, 'apatosaurus', geo)).toBe(true);
  });

  it('a start within snapRadius of its own slot fails', () => {
    expect(clearOfSlots({ head: { x: 60, y: 60 } }, 'apatosaurus', geo)).toBe(false);
    expect(clearOfSlots({ head: { x: 100, y: 0 } }, 'apatosaurus', geo)).toBe(true);
  });

  it('a start within snapRadius of another arranged piece’s slot fails too (a small drag off the bay is never a wrong slot)', () => {
    const slots: Record<string, Point> = { head: { x: 0, y: 0 }, neck: { x: 500, y: 0 } };
    const two: StartGeo = { bays: [], slot: (_s, p) => slots[p]!, size: () => ({ w: 100, h: 100 }) };
    // head starts 300 px from its own slot but 50 px from the neck slot.
    expect(clearOfSlots({ head: { x: 450, y: 0 }, neck: { x: 500, y: 400 } }, 'apatosaurus', two)).toBe(false);
    expect(clearOfSlots({ head: { x: 250, y: 0 }, neck: { x: 500, y: 400 } }, 'apatosaurus', two)).toBe(true);
    // A slot of a piece outside the arrangement (another cut) does not count.
    expect(clearOfSlots({ head: { x: 450, y: 0 } }, 'apatosaurus', two)).toBe(true);
  });

  it('a tight bay set falls back to the identity (piece i → bay i)', () => {
    const tight: StartGeo = { bays: [{ x: 500, y: 500 }, { x: 510, y: 500 }, { x: 520, y: 500 }], slot: () => ({ x: 0, y: 0 }), size: () => ({ w: 100, h: 100 }) };
    expect(arrangeStarts(3, 0, 'triceratops', PIECES[3], tight)).toEqual(assign(PIECES[3], tight.bays));
    expect(START_ATTEMPTS).toBe(64);
  });
});

describe('arrangeStarts over the real layout (Story 3.4)', () => {
  it('seeds 0…999 × each dino index × species × cut: deterministic, every pair clear, every start ≥ snapRadius from every slot of the cut, one bay each', () => {
    const snap = Tokens.components.dropTarget.snapRadius;
    for (const s of SPECIES as readonly SpeciesId[]) {
      for (const [n, cut] of CUTS) {
        const seen = new Set<string>();
        for (let seed = 0; seed < 1000; seed++) {
          for (let qi = 0; qi < 3; qi++) {
            const at = arrangeStarts(seed, qi, s, cut, realGeo);
            expect(key(arrangeStarts(seed, qi, s, cut, realGeo))).toBe(key(at));
            expect(Object.keys(at).sort()).toEqual([...cut].sort());
            const pts = Object.values(at).map((p) => `${p!.x},${p!.y}`);
            expect(new Set(pts).size).toBe(cut.length);
            if (!pairsClear(at, s, realGeo) || !clearOfSlots(at, s, realGeo)) throw new Error(`${s} cut ${n} seed ${seed} dino ${qi}`);
            for (const p of cut) {
              for (const q of cut.map((o) => realGeo.slot(s, o))) expect(Math.hypot(at[p]!.x - q.x, at[p]!.y - q.y)).toBeGreaterThanOrEqual(snap);
            }
            seen.add(key(at));
          }
        }
        // The shuffle varies the starts (not only the fallback).
        expect(seen.size, `${s} cut ${n}`).toBeGreaterThan(1);
      }
    }
  });

  it('the dino index changes the arrangement for the same seed', () => {
    const differ = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].some((seed) => key(arrangeStarts(seed, 0, 'stegosaurus', PIECES[6], realGeo)) !== key(arrangeStarts(seed, 1, 'stegosaurus', PIECES[6], realGeo)));
    expect(differ).toBe(true);
  });
});
