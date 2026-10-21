import { describe, expect, it } from 'vitest';
import { SHAPE_ITEMS, ladder, type ItemId } from '../../content/games/shadow-match';
import { levelIndex, roundQuestions } from './questions';

const group = (id: ItemId): string => SHAPE_ITEMS.find((i) => i.id === id)!.shapeGroup;
const groupSize = (id: ItemId): number => SHAPE_ITEMS.filter((i) => i.shapeGroup === group(id)).length;
const QUADRUPEDS = new Set<ItemId>(['dog', 'cow', 'horse', 'donkey', 'stag']);

describe('roundQuestions (Stories 3.5, 3.6)', () => {
  it('same seed and level → the same round', () => {
    for (let level = 0; level < 3; level++) expect(roundQuestions(7, level)).toEqual(roundQuestions(7, level));
  });

  it.each([0, 1, 2])('sweep, level %i, seeds 0…999: 4 distinct held items; n distinct shadows; exactly one right one at correctSlot; the slot changes', (level) => {
    const n = ladder[level]!.shadows;
    const firstSlots = new Set<number>();
    for (let seed = 0; seed < 1000; seed++) {
      const qs = roundQuestions(seed, level);
      expect(qs).toHaveLength(4);
      expect(new Set(qs.map((q) => q.item)).size).toBe(4);
      qs.forEach((q, i) => {
        expect(q.shadows).toHaveLength(n);
        expect(new Set(q.shadows).size).toBe(n);
        expect(q.shadows[q.correctSlot]).toBe(q.item);
        expect(q.shadows.filter((s) => s === q.item)).toHaveLength(1);
        if (i > 0) expect(q.correctSlot).not.toBe(qs[i - 1]!.correctSlot);
      });
      firstSlots.add(qs[0]!.correctSlot);
    }
    expect(firstSlots).toEqual(new Set(Array.from({ length: n }, (_, k) => k)));
  });

  it('level 0: 2 shadows from 2 groups; every item is held somewhere', () => {
    const held = new Set<ItemId>();
    for (let seed = 0; seed < 1000; seed++) {
      for (const q of roundQuestions(seed, 0)) {
        expect(new Set(q.shadows.map(group)).size).toBe(2);
        held.add(q.item);
      }
    }
    expect(held.size).toBe(SHAPE_ITEMS.length);
  });

  it('level 1: 3 shadows of ≥ 2 groups; a held item with a group mate has exactly one same-group decoy; the car has none', () => {
    let car = 0;
    for (let seed = 0; seed < 1000; seed++) {
      for (const q of roundQuestions(seed, 1)) {
        expect(new Set(q.shadows.map(group)).size).toBeGreaterThanOrEqual(2);
        const mates = q.shadows.filter((s) => s !== q.item && group(s) === group(q.item));
        expect(mates, q.item).toHaveLength(groupSize(q.item) > 1 ? 1 : 0);
        if (q.item === 'car') {
          car++;
          expect(q.shadows.filter((s) => s !== 'car').every((s) => group(s) !== 'car')).toBe(true);
        }
      }
    }
    expect(car).toBeGreaterThan(0);
  });

  it('level 2: 4 distinct quadrupeds held; each question shows 4 distinct quadruped shadows', () => {
    const held = new Set<ItemId>();
    for (let seed = 0; seed < 1000; seed++) {
      for (const q of roundQuestions(seed, 2)) {
        expect(QUADRUPEDS.has(q.item)).toBe(true);
        for (const s of q.shadows) expect(QUADRUPEDS.has(s), s).toBe(true);
        held.add(q.item);
      }
    }
    expect(held).toEqual(QUADRUPEDS);
  });

  it('clamps the level (5 → 2, −1 / NaN → 0) and handles a non-finite seed', () => {
    expect(levelIndex(5)).toBe(2);
    expect(levelIndex(-1)).toBe(0);
    expect(levelIndex(Number.NaN)).toBe(0);
    expect(roundQuestions(3, 5)).toEqual(roundQuestions(3, 2));
    expect(roundQuestions(3, -1)).toEqual(roundQuestions(3, 0));
    expect(roundQuestions(Number.NaN, 0)).toEqual(roundQuestions(0, 0));
  });

  it('different seeds give different rounds', () => {
    for (let level = 0; level < 3; level++) {
      const rounds = new Set(Array.from({ length: 50 }, (_, s) => JSON.stringify(roundQuestions(s, level))));
      expect(rounds.size).toBeGreaterThan(10);
    }
  });
});
