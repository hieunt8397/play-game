// Seeded randomness (Story 1.8). Every game derives its questions from the round seed through this,
// so the same seed always gives the same round (AD-2 resume, tests).

const UINT32 = 0x100000000;

/** mulberry32: a fast 32-bit PRNG; returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };
}

/** An integer in [0, n). */
export function randInt(rand: () => number, n: number): number {
  return Math.floor(rand() * n);
}

/** A shuffled copy (Fisher–Yates). */
export function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Golden-ratio step that decorrelates consecutive question seeds. */
const QUESTION_STEP = 0x9e3779b9;

/** The seed of question `index` of a round: `(seed + index × 0x9E3779B9) >>> 0`. */
export function questionSeed(seed: number, index: number): number {
  return (seed + Math.imul(index, QUESTION_STEP)) >>> 0;
}

/** Salt of a bounded re-draw (Story 1.10): an rng decorrelated from the question's own. */
const REDRAW_SALT = 0x5bd1e995;

/** The seed of a question's one re-draw: `(questionSeed ^ 0x5BD1E995) >>> 0`. */
export function redrawSeed(qSeed: number): number {
  return (qSeed ^ REDRAW_SALT) >>> 0;
}

/** Salt of whole-round candidate draws (Story 3.2): candidate `attempt` of a round seed. */
const CANDIDATE_SALT = 0x85ebca6b;

/** The seed of candidate round `attempt`: `(seed + attempt × 0x85EBCA6B) >>> 0` (attempt 0 → the seed itself). */
export function candidateSeed(seed: number, attempt: number): number {
  return (seed + Math.imul(attempt, CANDIDATE_SALT)) >>> 0;
}

/** Story 3.4: salts of a dino's start arrangement (games/dino-puzzle/starts.ts). */
const START_Q_SALT = 0x27d4eb2f;
const START_A_SALT = 0x165667b1;

/**
 * The seed of start-arrangement `attempt` of dino `questionIndex`:
 * `(seed + questionIndex × 0x27D4EB2F + attempt × 0x165667B1) >>> 0`.
 */
export function startSeed(seed: number, questionIndex: number, attempt: number): number {
  return (seed + Math.imul(questionIndex, START_Q_SALT) + Math.imul(attempt, START_A_SALT)) >>> 0;
}

/** Story 5.7: salt of a start's parent-invitation rng (core/parent-invite), separate from the questions'. */
const PARENT_INVITE_SALT = 0xc2b2ae35;

/** The seed of a round's parent-invitation roll: `(seed ^ 0xC2B2AE35) >>> 0`. */
export function parentInviteSeed(seed: number): number {
  return (seed ^ PARENT_INVITE_SALT) >>> 0;
}

/** Story 5.8: salt of a start's reaction picker rng (core/reactions), separate from the questions'. */
const REACTION_SALT = 0x1b873593;

/** The seed of a round's reaction picker: `(seed ^ 0x1B873593) >>> 0`. */
export function reactionSeed(seed: number): number {
  return (seed ^ REACTION_SALT) >>> 0;
}
