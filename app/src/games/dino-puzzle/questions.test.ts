import { describe, expect, it } from 'vitest';
import { SPECIES } from '../../content/games/dino-puzzle';
import { levelIndex, levelPieces, roundSpecies } from './questions';

describe('roundSpecies (Story 3.3)', () => {
  it('same seed and level → the same dinos', () => {
    expect(roundSpecies(7, 0)).toEqual(roundSpecies(7, 0));
  });

  it('seeds 0…99: three distinct species each time, and all six orders occur', () => {
    const orders = new Set<string>();
    for (let s = 0; s < 100; s++) {
      const r = roundSpecies(s, 0);
      expect(r).toHaveLength(3);
      expect(new Set(r).size).toBe(3);
      for (const x of r) expect(SPECIES).toContain(x);
      orders.add(r.join(','));
    }
    expect(orders.size).toBe(6);
  });

  it('clamps the level (−1, NaN → 0; 9 → 2) and the seed (NaN → 0)', () => {
    expect(levelIndex(-1)).toBe(0);
    expect(levelIndex(9)).toBe(2);
    expect(levelIndex(Number.NaN)).toBe(0);
    expect(roundSpecies(3, 9)).toEqual(roundSpecies(3, 2));
    expect(roundSpecies(Number.NaN, 0)).toEqual(roundSpecies(0, 0));
  });

  it('the cut of each level in hint order (Story 3.4): 3 → 4 → 6 pieces', () => {
    expect(levelPieces(0)).toEqual(['head-neck', 'body-legs', 'tail']);
    expect(levelPieces(1)).toEqual(['head-neck', 'front', 'back', 'tail']);
    expect(levelPieces(2)).toEqual(['head', 'neck', 'body', 'front-legs', 'back-legs', 'tail']);
    expect(levelPieces(7)).toEqual(levelPieces(2));
  });

  it('every level shows 3 dinos (Story 3.4)', () => {
    for (const l of [0, 1, 2]) expect(roundSpecies(5, l)).toHaveLength(3);
  });
});
