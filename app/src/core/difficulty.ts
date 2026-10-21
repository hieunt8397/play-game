// Difficulty policy (Story 1.10, FR5, AR8), pure. Only the shell calls it: Map's post-round chain
// (core/post-round-chain, Story 2.3) on `round:complete`; games never decide their own level.
import type { RoundOutcome } from '../content/types';

/** The highest hint level: a question that reached it counts as "needed full help". */
const FULL_HELP_LEVEL = 4;

function clamp(level: number, ladderLength: number): number {
  const max = Math.max(0, Math.floor(ladderLength) - 1);
  const l = Math.floor(level);
  return Number.isFinite(l) ? Math.min(max, Math.max(0, l)) : 0;
}

/**
 * The level of the next round: `current` clamped to the ladder, then +1 when every question was
 * solved on the first try, else −1 when a question needed full help (hint level 4), else unchanged;
 * the result is clamped to `[0, ladderLength − 1]` (0 for an empty ladder).
 */
export function nextLevel(
  current: number,
  outcome: Pick<RoundOutcome, 'questions' | 'firstTryCorrect' | 'maxHintLevel'>,
  ladderLength: number,
): number {
  if (!(ladderLength >= 1)) return 0;
  const base = clamp(current, ladderLength);
  let step = 0;
  if (outcome.questions > 0 && outcome.firstTryCorrect === outcome.questions) step = 1;
  else if (outcome.maxHintLevel === FULL_HELP_LEVEL) step = -1;
  return clamp(base + step, ladderLength);
}
