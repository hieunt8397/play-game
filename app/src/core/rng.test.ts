import { describe, expect, it } from 'vitest';
import { candidateSeed, mulberry32, questionSeed, randInt, shuffled, startSeed } from './rng';

describe('mulberry32', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const xs = Array.from({ length: 200 }, () => a());
    expect(Array.from({ length: 200 }, () => b())).toEqual(xs);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('different seeds give different sequences', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('treats the seed as uint32', () => {
    expect(mulberry32(-1)()).toBe(mulberry32(0xffffffff)());
  });
});

describe('shuffled / randInt', () => {
  it('shuffles a copy, keeping every item', () => {
    const src = [1, 2, 3, 4, 5];
    const out = shuffled(src, mulberry32(3));
    expect(src).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual(src);
  });

  it('randInt stays in range', () => {
    const r = mulberry32(9);
    for (let i = 0; i < 100; i++) expect(randInt(r, 4)).toBeLessThan(4);
  });
});

describe('questionSeed', () => {
  it('(seed + index × 0x9E3779B9) >>> 0', () => {
    expect(questionSeed(7, 0)).toBe(7);
    expect(questionSeed(7, 1)).toBe((7 + 0x9e3779b9) >>> 0);
    expect(questionSeed(0, 2)).toBe((2 * 0x9e3779b9) >>> 0);
  });
});

describe('candidateSeed (Story 3.2)', () => {
  it('attempt 0 returns the seed; consecutive attempts differ', () => {
    for (const seed of [0, 1, 7, 123456, 0xffffffff]) {
      expect(candidateSeed(seed, 0)).toBe(seed >>> 0);
      expect(candidateSeed(seed, 1)).not.toBe(candidateSeed(seed, 0));
    }
  });
});

describe('startSeed (Story 3.4)', () => {
  it('(seed, 0, 0) is the seed; every question index and attempt gives its own seed, as uint32', () => {
    for (const seed of [0, 1, 7, 123456, 0xffffffff]) {
      expect(startSeed(seed, 0, 0)).toBe(seed >>> 0);
      const all = new Set<number>();
      for (let q = 0; q < 3; q++) for (let a = 0; a < 64; a++) all.add(startSeed(seed, q, a));
      expect(all.size).toBe(3 * 64);
      for (const v of all) expect(Number.isInteger(v) && v >= 0 && v <= 0xffffffff).toBe(true);
    }
  });
});
