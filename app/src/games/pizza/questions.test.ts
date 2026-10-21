import { describe, expect, it } from 'vitest';
import { TOPPINGS, ladder } from '../../content/games/pizza';
import { fallbackRound, isGoodRound, levelIndex, roundQuestions, toppingsOf, type PizzaQuestion } from './questions';

const SEEDS = Array.from({ length: 1000 }, (_, i) => i);

/** The three round properties, asserted one by one (clear failure messages). */
function expectRoundProperties(qs: readonly PizzaQuestion[], level: number, what: string): void {
  const l = ladder[level]!;
  expect(qs, what).toHaveLength(l.questions);
  for (const q of qs) {
    expect(toppingsOf(l), what).toContain(q.topping);
    expect(q.count, what).toBeGreaterThanOrEqual(l.minSlices);
    expect(q.count, what).toBeLessThanOrEqual(l.maxSlices);
  }
  for (let i = 1; i < qs.length; i++) expect(qs[i], `${what} q${i}`).not.toEqual(qs[i - 1]);
  expect(qs.some((q) => q.count === l.maxSlices), `${what}: a ${l.maxSlices}`).toBe(true);
  for (const t of toppingsOf(l)) expect(qs.some((q) => q.topping === t), `${what}: ${t} asked`).toBe(true);
}

describe('roundQuestions (Stories 3.1–3.2)', () => {
  it.each(ladder.map((_l, i) => i))('level %i, seeds 0…999: deterministic, and every round property holds', (level) => {
    for (const seed of SEEDS) {
      const qs = roundQuestions(seed, level);
      expect(roundQuestions(seed, level)).toEqual(qs);
      expectRoundProperties(qs, level, `seed ${seed} level ${level}`);
    }
  });

  it('seeds 0…999 at every level: the drawn round almost never matches the fallback pattern (candidate seeds vary)', () => {
    // A short level-0 round can equal the fallback by chance (5 of 1000 seeds); a collapsed candidateSeed
    // would make about 58% of rounds the fallback.
    for (const level of ladder.keys()) {
      const same = SEEDS.filter((seed) => JSON.stringify(roundQuestions(seed, level)) === JSON.stringify(fallbackRound(seed, level))).length;
      expect(same, `level ${level}`).toBeLessThanOrEqual(SEEDS.length * 0.02);
    }
  });

  it('Level 0: 3 questions, counts 1–3, sausage and mushroom only, a 3 present, both asked', () => {
    const qs = roundQuestions(7, 0);
    expect(qs).toHaveLength(3);
    expect(new Set(qs.map((q) => q.topping))).toEqual(new Set(['sausage', 'mushroom']));
    expect(qs.some((q) => q.count === 3)).toBe(true);
  });

  it('Level 1: 4 questions, counts 2–4, a 4 present', () => {
    const qs = roundQuestions(7, 1);
    expect(qs).toHaveLength(4);
    expect(qs.every((q) => q.count >= 2 && q.count <= 4 && q.topping !== 'pepper')).toBe(true);
    expect(qs.some((q) => q.count === 4)).toBe(true);
  });

  it('Level 2: 5 questions, counts 3–5, a 5 present, pepper asked at least once', () => {
    const qs = roundQuestions(7, 2);
    expect(qs).toHaveLength(5);
    expect(qs.every((q) => q.count >= 3 && q.count <= 5)).toBe(true);
    expect(qs.some((q) => q.count === 5)).toBe(true);
    expect(qs.some((q) => q.topping === 'pepper')).toBe(true);
  });

  it('every reachable (topping, count) occurs over many seeds', () => {
    for (const [level, l] of ladder.entries()) {
      const seen = new Set(SEEDS.flatMap((s) => roundQuestions(s, level).map((q) => `${q.topping}.${q.count}`)));
      expect(seen.size, `level ${level}`).toBe(l.toppings * (l.maxSlices - l.minSlices + 1));
    }
  });

  it('Clamp: level 7 → 2, −1 → 0', () => {
    expect(levelIndex(7)).toBe(2);
    expect(levelIndex(-1)).toBe(0);
    expect(levelIndex(Number.NaN)).toBe(0);
    expect(roundQuestions(5, 7)).toEqual(roundQuestions(5, 2));
    expect(roundQuestions(5, -1)).toEqual(roundQuestions(5, 0));
  });

  it('Fallback: every level and seeds 0…99 have all three properties', () => {
    for (const level of ladder.keys()) {
      for (let seed = 0; seed < 100; seed++) {
        const qs = fallbackRound(seed, level);
        expectRoundProperties(qs, level, `fallback seed ${seed} level ${level}`);
        expect(isGoodRound(qs, ladder[level]!)).toBe(true);
      }
    }
    expect(fallbackRound(0, 2)).toEqual([
      { topping: 'sausage', count: 5 },
      { topping: 'mushroom', count: 4 },
      { topping: 'pepper', count: 3 },
      { topping: 'sausage', count: 5 },
      { topping: 'mushroom', count: 4 },
    ]);
  });

  it('isGoodRound rejects each broken property', () => {
    const l2 = ladder[2]!;
    const good = fallbackRound(0, 2);
    expect(isGoodRound(good, l2)).toBe(true);
    expect(isGoodRound([good[0]!, good[0]!, ...good.slice(2)], l2)).toBe(false);
    expect(isGoodRound(good.map((q) => ({ ...q, count: 3 })), l2)).toBe(false);
    expect(isGoodRound(good.map((q, i) => ({ topping: TOPPINGS[i % 2]!, count: q.count })), l2)).toBe(false);
  });
});
