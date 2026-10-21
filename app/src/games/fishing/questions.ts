// Câu cá questions (Stories 4.3, 4.4), pure: what each question asks for and which fish swim. Derived
// from the round seed and level only (resume, tests). One rng draws, in order: per question its ask kind,
// its request and its fish set. Exactly one fish matches the request; every caller decides correctness
// through `isCorrect` (never an inline colour or size compare). No retry loops.
import { FISH_COLORS, FISH_SIZES, QUESTION_SEED_MIX, SIZE_ASK_RUN_MAX, ladder, type FishColor, type FishSize, type FishSpec, type FishingLevel } from '../../content/games/fishing.ts';
import { mulberry32, randInt, shuffled } from '../../core/rng.ts';

export type FishQuestion =
  | { readonly ask: 'color'; readonly color: FishColor; readonly fish: readonly FishSpec[] }
  | { readonly ask: 'size'; readonly size: FishSize; readonly fish: readonly FishSpec[] };

/** True when `f` is what `q` asks for (only the asked attribute counts). */
export function isCorrect(q: FishQuestion, f: FishSpec): boolean {
  return q.ask === 'color' ? f.color === q.color : f.size === q.size;
}

/** The level index, clamped to the ladder (a non-finite level → 0). */
export function levelIndex(level: number): number {
  const l = Math.floor(level);
  return Number.isFinite(l) ? Math.max(0, Math.min(ladder.length - 1, l)) : 0;
}

export function levelOf(level: number): FishingLevel {
  return ladder[levelIndex(level)]!;
}

/** The seed of question `i`'s swim placement (a resumed question gets the same start). */
export const questionSeed = (seed: number, i: number): number => (seed ^ Math.imul(i + 1, QUESTION_SEED_MIX)) >>> 0;

const other = (s: FishSize): FishSize => (s === 'small' ? 'big' : 'small');
const pick = <T>(items: readonly T[], rng: () => number): T => items[randInt(rng, items.length)]!;

/** `n` colours cycling through `order` (counts differ by ≤ 1). */
const cycle = (order: readonly FishColor[], n: number): FishColor[] => Array.from({ length: n }, (_, i) => order[i % order.length]!);

/** The pond of a question: exactly one fish matches; the others balanced; a seeded order. */
function fishSet(q: { ask: 'color'; color: FishColor } | { ask: 'size'; size: FishSize }, n: number, rng: () => number): FishSpec[] {
  let set: FishSpec[];
  if (q.ask === 'color') {
    const others = shuffled(
      FISH_COLORS.filter((c) => c !== q.color),
      rng,
    );
    set = [{ color: q.color, size: pick(FISH_SIZES, rng) }, ...cycle(others, n - 1).map((color) => ({ color, size: pick(FISH_SIZES, rng) }))];
  } else {
    // The correct fish (c, s); every other fish has the other size, and their colours include c (the twin).
    const c = pick(FISH_COLORS, rng);
    const order = [c, ...shuffled(FISH_COLORS.filter((x) => x !== c), rng)];
    set = [{ color: c, size: q.size }, ...cycle(order, n - 1).map((color) => ({ color, size: other(q.size) }))];
  }
  return shuffled(set, rng);
}

/**
 * The round's questions (`ladder[level].questions` of them; `level` clamped). Ask kinds: the level's own,
 * or on a `mixed` level drawn per question with at least one of each (the last flips when all match).
 * Requests: a colour differs from the previous colour question's; a size never runs longer than
 * SIZE_ASK_RUN_MAX; a round with ≥ 2 size questions asks both sizes. Deterministic.
 */
export function roundQuestions(seed: number, level: number): FishQuestion[] {
  const lv = levelOf(level);
  const rng = mulberry32((Number.isFinite(seed) ? Math.floor(seed) : 0) >>> 0);
  const kinds: ('color' | 'size')[] = Array.from({ length: lv.questions }, () => (lv.ask === 'mixed' ? (rng() < 0.5 ? 'color' : 'size') : lv.ask));
  if (lv.ask === 'mixed' && kinds.length > 1 && kinds.every((k) => k === kinds[0])) kinds[kinds.length - 1] = kinds[0] === 'color' ? 'size' : 'color';

  const requests: ({ ask: 'color'; color: FishColor } | { ask: 'size'; size: FishSize })[] = [];
  let prevColor: FishColor | undefined;
  const sizes: FishSize[] = [];
  for (const kind of kinds) {
    if (kind === 'color') {
      const color = pick(
        FISH_COLORS.filter((c) => c !== prevColor),
        rng,
      );
      prevColor = color;
      requests.push({ ask: 'color', color });
    } else {
      let size = pick(FISH_SIZES, rng);
      const run = sizes.slice(-SIZE_ASK_RUN_MAX);
      if (run.length === SIZE_ASK_RUN_MAX && run.every((s) => s === size)) size = other(size);
      sizes.push(size);
      requests.push({ ask: 'size', size });
    }
  }
  // A round with ≥ 2 size questions asks both sizes: the last size question flips (it differs from the
  // one before it, so no run grows).
  if (sizes.length >= 2 && sizes.every((s) => s === sizes[0])) {
    for (let i = requests.length - 1; i >= 0; i--) {
      const r = requests[i]!;
      if (r.ask === 'size') {
        requests[i] = { ask: 'size', size: other(r.size) };
        break;
      }
    }
  }
  return requests.map((r) => ({ ...r, fish: fishSet(r, lv.fish, rng) }));
}
