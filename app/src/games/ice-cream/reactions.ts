// Tiệm kem reactions (Story 6.1), pure: which picked reaction ids the scene can play, and the nose-cream
// rule. A correct reaction always wipes any cream left on Shiba's nose; a sneeze then leaves cream with
// `chance`, rolled once from the scene's reaction rng (deterministic per seed), and only when the layout
// has `hit.shiba-nose` (no nose to tap: no cream state). Other reactions never roll.
import { CHOSE_OTHER_REACTIONS, CORRECT_REACTIONS, type ChoseOtherReaction, type CorrectReaction } from '../../content/games/ice-cream';

export function isCorrectReaction(id: string | undefined): id is CorrectReaction {
  return (CORRECT_REACTIONS as readonly (string | undefined)[]).includes(id);
}

export function isChoseOtherReaction(id: string | undefined): id is ChoseOtherReaction {
  return (CHOSE_OTHER_REACTIONS as readonly (string | undefined)[]).includes(id);
}

/** The question step a chose-other happened in: the question index and the scoops placed on it. */
export interface StepKey {
  readonly questionIndex: number;
  readonly placed: number;
}

export function stepKey(progress: { readonly questionIndex: number; readonly partial: { readonly placed: readonly unknown[] } }): StepKey {
  return { questionIndex: progress.questionIndex, placed: progress.partial.placed.length };
}

/** A chose-other reaction waiting to float its scoop back; `wrong`: the paired hintWrong follows it. */
export interface Taste {
  wrong: boolean;
  readonly key: StepKey;
}

/**
 * A `hintWrong` command: pairs it with the newest unpaired taste (deferred: true) or, with none waiting,
 * it runs now (false). One hintWrong per wrong serve.
 */
export function pairHintWrong(tastes: readonly Taste[]): boolean {
  const taste = tastes.at(-1);
  if (!taste || taste.wrong) return false;
  taste.wrong = true;
  return true;
}

/**
 * When the taste ends (the scoop floats back): its deferred hint.wrong() runs only when it was paired,
 * the step is unchanged (no correct serve meanwhile) and the scene still plays questions.
 */
export function deferredHintWrong(taste: Taste, now: StepKey, inert: boolean): boolean {
  return taste.wrong && !inert && taste.key.questionIndex === now.questionIndex && taste.key.placed === now.placed;
}

export interface NoseCreamRule {
  /** The layout has `hit.shiba-nose`. */
  readonly hasNose: boolean;
  /** Tokens.ui.iceCreamNoseCreamChance. */
  readonly chance: number;
  /** One draw in [0, 1) (MiniGameBase.reactionRoll). */
  readonly roll: () => number;
}

/** Whether cream is on Shiba's nose after correct reaction `reaction` played (any earlier cream is wiped first). */
export function noseCreamAfter(reaction: CorrectReaction, rule: NoseCreamRule): boolean {
  if (reaction !== 'sneeze' || !rule.hasNose) return false;
  return rule.roll() < rule.chance;
}
