// Reaction picker (Story 5.8, FR30/FR31): pure. Each game lists its "correct" and "chose-other"
// reactions (ids the scene switches on); one picker per start, on its own seeded rng
// (rng › reactionSeed of the round seed), hands out one id per call and never the same id twice in a
// row for a kind. One rng call per pick (none for a list of 1): the same seed gives the same sequence.
import { randInt } from './rng';

export type ReactionKind = 'correct' | 'choseOther';

export interface ReactionSet {
  readonly correct: readonly string[];
  readonly choseOther: readonly string[];
}

export interface ReactionPicker {
  /** The next reaction id of `kind`; `undefined` when the game lists none. */
  pick(kind: ReactionKind): string | undefined;
}

/** A set with no reactions (MiniGameBase's default: a game without its own reactions). */
export const NO_REACTIONS: ReactionSet = { correct: [], choseOther: [] };

export function createReactionPicker(set: ReactionSet, rand: () => number): ReactionPicker {
  const last: Partial<Record<ReactionKind, number>> = {};
  return {
    pick(kind) {
      const list = set[kind];
      const n = list.length;
      if (n === 0) return undefined;
      const prev = last[kind];
      let index: number;
      if (n === 1) index = 0;
      else if (prev === undefined) index = randInt(rand, n);
      else {
        // Draw over the list without the previous pick: indices ≥ prev shift up by one.
        const j = randInt(rand, n - 1);
        index = j >= prev ? j + 1 : j;
      }
      last[kind] = index;
      return list[index];
    },
  };
}
