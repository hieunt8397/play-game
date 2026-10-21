// Story 5.8: the reaction picker (I/O matrix row "Picker").
import { describe, expect, it } from 'vitest';
import { createReactionPicker, NO_REACTIONS, type ReactionKind } from './reactions';
import { mulberry32, reactionSeed } from './rng';

const SET = { correct: ['a', 'b', 'c'], choseOther: ['x', 'y'] } as const;

function draw(seed: number, kind: ReactionKind, count: number): (string | undefined)[] {
  const p = createReactionPicker(SET, mulberry32(reactionSeed(seed)));
  return Array.from({ length: count }, () => p.pick(kind));
}

describe('createReactionPicker', () => {
  it('every pick comes from the list and never repeats the previous pick of its kind', () => {
    for (const seed of [0, 1, 7, 12345]) {
      for (const kind of ['correct', 'choseOther'] as const) {
        const picks = draw(seed, kind, 50);
        picks.forEach((id, i) => {
          expect(SET[kind]).toContain(id);
          if (i > 0) expect(id).not.toBe(picks[i - 1]);
        });
      }
    }
  });

  it('the same seed gives the same sequence', () => {
    expect(draw(42, 'correct', 20)).toEqual(draw(42, 'correct', 20));
  });

  it('all entries of a list of 3 come up', () => {
    expect(new Set(draw(3, 'correct', 30))).toEqual(new Set(SET.correct));
  });

  it('kinds keep their own last pick', () => {
    // rand 0 → first pick index 0; with prev 0, j=0 → index 1.
    const p = createReactionPicker({ correct: ['a', 'b'], choseOther: ['a', 'b'] }, () => 0);
    expect(p.pick('correct')).toBe('a');
    expect(p.pick('choseOther')).toBe('a');
    expect(p.pick('correct')).toBe('b');
    expect(p.pick('correct')).toBe('a');
  });

  it('a list of 1 always gives that entry (no rng call); an empty list gives undefined', () => {
    let calls = 0;
    const rand = (): number => {
      calls++;
      return 0.5;
    };
    const p = createReactionPicker({ correct: ['only'], choseOther: [] }, rand);
    expect([p.pick('correct'), p.pick('correct'), p.pick('correct')]).toEqual(['only', 'only', 'only']);
    expect(p.pick('choseOther')).toBeUndefined();
    expect(calls).toBe(0);
    expect(createReactionPicker(NO_REACTIONS, rand).pick('correct')).toBeUndefined();
  });

  it('one rng call per pick of a list > 1', () => {
    let calls = 0;
    const base = mulberry32(9);
    const p = createReactionPicker(SET, () => {
      calls++;
      return base();
    });
    for (let i = 0; i < 5; i++) p.pick('correct');
    expect(calls).toBe(5);
  });
});
