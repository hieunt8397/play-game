// Tiệm pizza questions (Stories 3.1–3.2), pure: which topping the fox asks for and how many slices.
// Derived from the round seed and level only, so a round is reproducible (resume, tests).
//
// Story 3.2 draws whole candidate rounds and keeps the first that has all three round properties:
//   1. no question equals its predecessor in both topping and count;
//   2. at least one question asks the level's maxSlices;
//   3. every topping of the level is asked at least once.
// After ROUND_ATTEMPTS failed candidates (practically never) the constructive `fallbackRound` is used.
import { ROUND_ATTEMPTS, TOPPINGS, ladder, type PizzaLevel, type ToppingId } from '../../content/games/pizza';
import { candidateSeed, mulberry32, randInt } from '../../core/rng';

export interface PizzaQuestion {
  readonly topping: ToppingId;
  readonly count: number;
}

export function levelIndex(level: number): number {
  const l = Math.floor(level);
  return Number.isFinite(l) ? Math.max(0, Math.min(ladder.length - 1, l)) : 0;
}

export function levelOf(level: number): PizzaLevel {
  return ladder[levelIndex(level)]!;
}

/** The toppings in play at a level: the first `toppings` of TOPPINGS. */
export function toppingsOf(lvl: PizzaLevel): readonly ToppingId[] {
  return TOPPINGS.slice(0, lvl.toppings);
}

/** Every (topping, count) a level can ask, in a fixed order. */
export function allQuestions(lvl: PizzaLevel): PizzaQuestion[] {
  const out: PizzaQuestion[] = [];
  for (const topping of toppingsOf(lvl)) for (let count = lvl.minSlices; count <= lvl.maxSlices; count++) out.push({ topping, count });
  return out;
}

const same = (a: PizzaQuestion, b: PizzaQuestion): boolean => a.topping === b.topping && a.count === b.count;

/** True when `qs` has the three round properties for `lvl` (see the file header). */
export function isGoodRound(qs: readonly PizzaQuestion[], lvl: PizzaLevel): boolean {
  if (qs.some((q, i) => i > 0 && same(q, qs[i - 1]!))) return false;
  if (!qs.some((q) => q.count === lvl.maxSlices)) return false;
  return toppingsOf(lvl).every((t) => qs.some((q) => q.topping === t));
}

/** One candidate round: a topping among the level's and a count in [minSlices, maxSlices] per question. */
function candidate(seed: number, attempt: number, lvl: PizzaLevel): PizzaQuestion[] {
  const pool = toppingsOf(lvl);
  const span = lvl.maxSlices - lvl.minSlices + 1;
  const rand = mulberry32(candidateSeed(seed, attempt));
  return Array.from({ length: lvl.questions }, () => ({ topping: pool[randInt(rand, pool.length)]!, count: lvl.minSlices + randInt(rand, span) }));
}

/**
 * The deterministic fallback: topping i = toppings[(i + seed) mod k], count i = maxSlices − (i mod span).
 * Consecutive toppings always differ (k ≥ 2), question 0 asks maxSlices, and questions ≥ k covers
 * every topping, so it has all three round properties by construction.
 */
export function fallbackRound(seed: number, level: number): PizzaQuestion[] {
  const lvl = levelOf(level);
  const pool = toppingsOf(lvl);
  const span = lvl.maxSlices - lvl.minSlices + 1;
  const s = (Number.isFinite(seed) ? Math.floor(seed) : 0) >>> 0;
  return Array.from({ length: lvl.questions }, (_, i) => ({ topping: pool[(i + s) % pool.length]!, count: lvl.maxSlices - (i % span) }));
}

/**
 * The round's questions: the first of ROUND_ATTEMPTS candidate rounds with all three round
 * properties, else `fallbackRound`. An out-of-range level is clamped. Deterministic for (seed, level).
 */
export function roundQuestions(seed: number, level: number): PizzaQuestion[] {
  const lvl = levelOf(level);
  for (let a = 0; a < ROUND_ATTEMPTS; a++) {
    const qs = candidate(seed, a, lvl);
    if (isGoodRound(qs, lvl)) return qs;
  }
  return fallbackRound(seed, level);
}
