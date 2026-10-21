// Resume snapshots (Story 2.5, AD-2), pure. MiniGameBase builds the envelope from the game's progress
// (`makeSnapshot`) and validates an incoming `resume` against its own start data (`readResume`). A game
// receives only `{ questionIndex, partial: unknown, tally }` and validates its own `partial`.
// Snapshots are plain JSON (`isJsonOnly`): Map keeps a deep copy in SessionStore, never game state.
import type { GameId, HintLevel, Snapshot, SnapshotPartials, TallyState } from '../content/types';

/** The empty tally: no closed question. */
export const EMPTY_TALLY: TallyState = { questions: 0, firstTryCorrect: 0, maxHintLevel: 0 };

/** What a game reports for its snapshot: the open question and its own partial progress. */
export interface GameProgress<G extends GameId = GameId> {
  readonly questionIndex: number;
  readonly partial: SnapshotPartials[G];
}

/** A validated resume point, handed to the game through `MiniGameBase.resumeAt`. */
export interface ResumeAt {
  readonly questionIndex: number;
  /** Unvalidated: the game checks it (an invalid partial begins the question clean). */
  readonly partial: unknown;
  readonly tally: TallyState;
}

/**
 * True only for JSON data: `null`, strings, booleans, finite numbers, arrays and plain objects (prototype
 * `Object.prototype` or `null`), deeply. A function, class instance, `undefined`, `NaN`, `Infinity` or a
 * cycle makes it false. Shared (non-cyclic) references are allowed: they serialise as copies.
 */
export function isJsonOnly(v: unknown): boolean {
  const ancestors = new Set<object>();
  const walk = (x: unknown): boolean => {
    if (x === null) return true;
    switch (typeof x) {
      case 'string':
      case 'boolean':
        return true;
      case 'number':
        return Number.isFinite(x);
      case 'object':
        break;
      default:
        return false;
    }
    const o = x as object;
    if (ancestors.has(o)) return false;
    if (Array.isArray(o)) {
      ancestors.add(o);
      // A sparse hole is `undefined`: not JSON.
      for (let i = 0; i < o.length; i++) if (!(i in o) || !walk(o[i])) return false;
      ancestors.delete(o);
      return true;
    }
    const proto: unknown = Object.getPrototypeOf(o);
    if (proto !== Object.prototype && proto !== null) return false;
    ancestors.add(o);
    for (const key of Object.keys(o)) if (!walk((o as Record<string, unknown>)[key])) return false;
    ancestors.delete(o);
    return true;
  };
  return walk(v);
}

/** The snapshot envelope (`v: 1`) of a game's progress; a dev build reports non-JSON content. */
export function makeSnapshot<G extends GameId>(args: {
  readonly level: number;
  readonly seed: number;
  readonly tally: TallyState;
  readonly progress: GameProgress<G>;
}): Snapshot<G> {
  const s: Snapshot<G> = {
    v: 1,
    level: args.level,
    seed: args.seed,
    questionIndex: args.progress.questionIndex,
    partial: args.progress.partial,
    tally: { ...args.tally },
  };
  if (import.meta.env.DEV && !isJsonOnly(s)) console.error('snapshot: the snapshot is not plain JSON', s);
  return s;
}

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
const isHintLevel = (n: unknown): n is HintLevel => isInt(n) && n >= 0 && n <= 4;

/** True for a well-formed tally: non-negative integer counts, firstTry ≤ questions, a hint level 0–4. */
export function isTallyState(t: unknown): t is TallyState {
  if (typeof t !== 'object' || t === null) return false;
  const r = t as Record<string, unknown>;
  return (
    isInt(r.questions) &&
    r.questions >= 0 &&
    isInt(r.firstTryCorrect) &&
    r.firstTryCorrect >= 0 &&
    r.firstTryCorrect <= r.questions &&
    isHintLevel(r.maxHintLevel)
  );
}

/**
 * Validates `resume` against the start data it came with. Null (one console.warn) unless `v === 1`,
 * `level`, `seed` and `questionIndex` are integers with `questionIndex ≥ 0`, `level`/`seed` equal the
 * start's, and the whole snapshot is plain JSON. A missing tally is the empty tally; an invalid one
 * (or one whose `questions` differs from `questionIndex`)
 * becomes the empty tally with a warn.
 */
export function readResume(resume: unknown, start: { readonly level: number; readonly seed: number }): ResumeAt | null {
  const reject = (why: string): null => {
    console.warn(`snapshot: resume ignored (${why}) — a fresh round starts`);
    return null;
  };
  if (typeof resume !== 'object' || resume === null) return reject('not an object');
  const r = resume as Record<string, unknown>;
  if (r.v !== 1) return reject(`version ${String(r.v)}`);
  if (!isInt(r.level) || !isInt(r.seed) || !isInt(r.questionIndex) || r.questionIndex < 0) return reject('bad level, seed or question index');
  if (r.level !== start.level || r.seed !== start.seed) return reject('level or seed differs from the start data');
  if (!isJsonOnly(resume)) return reject('not plain JSON');
  let tally = EMPTY_TALLY;
  if (r.tally !== undefined) {
    // The tally covers the closed questions, i.e. exactly the ones before the open question.
    if (isTallyState(r.tally) && r.tally.questions === r.questionIndex) {
      tally = { questions: r.tally.questions, firstTryCorrect: r.tally.firstTryCorrect, maxHintLevel: r.tally.maxHintLevel };
    } else console.warn('snapshot: invalid tally in resume — counted as empty');
  }
  return { questionIndex: r.questionIndex, partial: r.partial, tally };
}
