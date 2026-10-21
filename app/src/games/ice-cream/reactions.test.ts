import { describe, expect, it } from 'vitest';
import { REACTIONS } from '../../content/games/ice-cream';
import { createReactionPicker } from '../../core/reactions';
import { mulberry32, reactionSeed } from '../../core/rng';
import { Tokens } from '../../core/tokens';
import { deferredHintWrong, isChoseOtherReaction, isCorrectReaction, noseCreamAfter, pairHintWrong, stepKey, type Taste } from './reactions';

const rolls = (...values: number[]) => {
  let i = 0;
  const calls: number[] = [];
  return {
    calls,
    roll: () => {
      const v = values[i++ % values.length]!;
      calls.push(v);
      return v;
    },
  };
};

describe('ice-cream reactions (Story 6.1)', () => {
  it('lists lick / shiver / sneeze for a correct serve and taste-grimace for a different flavour', () => {
    expect(REACTIONS.correct).toEqual(['lick', 'shiver', 'sneeze']);
    expect(REACTIONS.choseOther).toEqual(['taste-grimace']);
    for (const id of REACTIONS.correct) expect(isCorrectReaction(id)).toBe(true);
    for (const id of REACTIONS.choseOther) expect(isChoseOtherReaction(id)).toBe(true);
    expect(isCorrectReaction('taste-grimace')).toBe(false);
    expect(isCorrectReaction(undefined)).toBe(false);
  });

  it('a sneeze leaves cream when the roll is under the chance; lick and shiver wipe it and never roll', () => {
    const hit = rolls(0.1);
    expect(noseCreamAfter('sneeze', { hasNose: true, chance: 0.5, roll: hit.roll })).toBe(true);
    const miss = rolls(0.9);
    expect(noseCreamAfter('sneeze', { hasNose: true, chance: 0.5, roll: miss.roll })).toBe(false);
    for (const r of ['lick', 'shiver'] as const) {
      const none = rolls(0);
      expect(noseCreamAfter(r, { hasNose: true, chance: 1, roll: none.roll })).toBe(false);
      expect(none.calls).toEqual([]);
    }
  });

  it('no hit.shiba-nose: never cream, no roll', () => {
    const r = rolls(0);
    expect(noseCreamAfter('sneeze', { hasNose: false, chance: 1, roll: r.roll })).toBe(false);
    expect(r.calls).toEqual([]);
  });

  it('hintWrong deferral: one call per wrong serve, none when the step moved on, none when inert', () => {
    const key = { questionIndex: 1, placed: 1 };
    const tastes: Taste[] = [];
    // No taste waiting: the hintWrong runs now.
    expect(pairHintWrong(tastes)).toBe(false);
    const a: Taste = { wrong: false, key };
    tastes.push(a);
    expect(pairHintWrong(tastes)).toBe(true);
    // A second hintWrong for the same taste is not paired again (runs now: one per wrong serve).
    expect(pairHintWrong(tastes)).toBe(false);
    expect(deferredHintWrong(a, key, false)).toBe(true);
    expect(deferredHintWrong(a, { questionIndex: 1, placed: 2 }, false)).toBe(false);
    expect(deferredHintWrong(a, { questionIndex: 2, placed: 0 }, false)).toBe(false);
    expect(deferredHintWrong(a, key, true)).toBe(false);
    expect(deferredHintWrong({ wrong: false, key }, key, false)).toBe(false);
    expect(stepKey({ questionIndex: 3, partial: { placed: ['mint', 'vanilla'] } })).toEqual({ questionIndex: 3, placed: 2 });
  });

  it('deterministic per seed: the same seed gives the same reactions and creams; every correct reaction shows up', () => {
    const run = (seed: number) => {
      const rand = mulberry32(reactionSeed(seed));
      const picker = createReactionPicker(REACTIONS, rand);
      const out: string[] = [];
      let prev: string | undefined;
      for (let i = 0; i < 30; i++) {
        const id = picker.pick('correct');
        expect(id).not.toBe(prev);
        prev = id;
        if (!isCorrectReaction(id)) throw new Error(`not a correct reaction: ${id}`);
        out.push(`${id}${noseCreamAfter(id, { hasNose: true, chance: Tokens.ui.iceCreamNoseCreamChance, roll: rand }) ? '+cream' : ''}`);
      }
      return out;
    };
    const a = run(7);
    expect(run(7)).toEqual(a);
    for (const id of REACTIONS.correct) expect(a.some((x) => x.startsWith(id))).toBe(true);
    expect(a).toContain('sneeze+cream');
  });
});
