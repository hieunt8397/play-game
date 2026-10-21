import { describe, expect, it } from 'vitest';
import type { HintLevel } from '../content/types';
import { nextLevel } from './difficulty';

const o = (questions: number, firstTryCorrect: number, maxHintLevel: HintLevel) => ({ questions, firstTryCorrect, maxHintLevel });

describe('nextLevel', () => {
  it('+1 when every question was first try', () => {
    expect(nextLevel(1, o(4, 4, 0), 4)).toBe(2);
  });

  it('−1 when a question reached hint level 4', () => {
    expect(nextLevel(2, o(5, 2, 4), 4)).toBe(1);
  });

  it('unchanged otherwise', () => {
    expect(nextLevel(2, o(4, 3, 3), 4)).toBe(2);
    expect(nextLevel(2, o(4, 0, 2), 4)).toBe(2);
  });

  it('clamps low and high', () => {
    expect(nextLevel(0, o(3, 0, 4), 4)).toBe(0);
    expect(nextLevel(3, o(5, 5, 0), 4)).toBe(3);
  });

  it('a round with no question never raises the level', () => {
    expect(nextLevel(1, o(0, 0, 0), 4)).toBe(1);
  });

  it('clamps a bad current first, then applies the rule', () => {
    expect(nextLevel(9, o(4, 3, 3), 4)).toBe(3);
    expect(nextLevel(9, o(4, 0, 4), 4)).toBe(2);
    expect(nextLevel(-2, o(4, 4, 0), 4)).toBe(1);
    expect(nextLevel(-2, o(4, 0, 4), 4)).toBe(0);
    expect(nextLevel(Number.NaN, o(4, 4, 0), 4)).toBe(1);
  });

  it('a ladder shorter than 1 gives 0', () => {
    expect(nextLevel(2, o(4, 4, 0), 0)).toBe(0);
    expect(nextLevel(0, o(4, 4, 0), 1)).toBe(0);
  });
});
