// Tiệm kem questions (Stories 1.8, 1.10), pure: which flavours sit on the counter (and where) and which
// scoops Shiba asks for. Derived from the round seed only, so a question is reproducible (resume, tests).
import { FLAVOURS, HOME_SLOTS, ladder, type FlavourId, type IceCreamLevel } from '../../content/games/ice-cream';
import { mulberry32, questionSeed, redrawSeed, shuffled } from '../../core/rng';

export interface Scoop {
  readonly flavour: FlavourId;
  /** Home slot id (`slot.<id>` in the layout). */
  readonly home: string;
}

export interface Question {
  readonly index: number;
  /** The flavours on the counter, left to right. */
  readonly counter: readonly FlavourId[];
  /** The asked scoops (distinct): in FLAVOURS order (the spoken order), or the asked order when `ordered`. */
  readonly wanted: readonly FlavourId[];
  readonly ordered: boolean;
  /** `counter` on its home slots, left to right. */
  readonly scoops: readonly Scoop[];
}

export function levelIndex(level: number): number {
  const l = Math.floor(level);
  return Number.isFinite(l) ? Math.max(0, Math.min(ladder.length - 1, l)) : 0;
}

export function levelOf(level: number): IceCreamLevel {
  return ladder[levelIndex(level)]!;
}

const spokenOrder = (fs: readonly FlavourId[]): FlavourId[] => [...fs].sort((a, b) => FLAVOURS.indexOf(a) - FLAVOURS.indexOf(b));

/** The identity of a request: the set (unordered) or the sequence (ordered). */
function key(wanted: readonly FlavourId[], ordered: boolean): string {
  return (ordered ? wanted : spokenOrder(wanted)).join('-');
}

function pick(from: readonly FlavourId[], lvl: IceCreamLevel, rand: () => number): FlavourId[] {
  const drawn = shuffled(from, rand).slice(0, lvl.scoops);
  return lvl.ordered ? drawn : spokenOrder(drawn);
}

/** Every distinct request from `counter` for `lvl`, in a fixed order. */
function allRequests(counter: readonly FlavourId[], lvl: IceCreamLevel): FlavourId[][] {
  const out: FlavourId[][] = [];
  const walk = (acc: FlavourId[]): void => {
    if (acc.length === lvl.scoops) {
      if (lvl.ordered || acc.every((f, i) => i === 0 || FLAVOURS.indexOf(acc[i - 1]!) < FLAVOURS.indexOf(f))) out.push([...acc]);
      return;
    }
    for (const f of counter) if (!acc.includes(f)) walk([...acc, f]);
  };
  walk([]);
  return out;
}

function draw(seed: number, index: number, lvl: IceCreamLevel, avoid: string | undefined): Question {
  const qSeed = questionSeed(seed, index);
  const rand = mulberry32(qSeed);
  const counter = shuffled(FLAVOURS, rand).slice(0, lvl.flavours);
  let wanted = pick(counter, lvl, rand);
  if (avoid !== undefined && key(wanted, lvl.ordered) === avoid) {
    // One salted re-draw among the requests that differ (bounded; one always exists since flavours > scoops or the counter changed).
    const salted = mulberry32(redrawSeed(qSeed));
    const others = allRequests(counter, lvl).filter((w) => key(w, lvl.ordered) !== avoid);
    if (others.length > 0) wanted = others[Math.floor(salted() * others.length)]!;
  }
  const homes = HOME_SLOTS[lvl.flavours] ?? HOME_SLOTS[FLAVOURS.length]!;
  return { index, counter, wanted, ordered: lvl.ordered, scoops: counter.map((flavour, i) => ({ flavour, home: homes[i]! })) };
}

/**
 * Question `index` of the round: `mulberry32((seed + index × 0x9E3779B9) >>> 0)` shuffles the
 * flavours, the level's count is laid out on its home slots, and `scoops` distinct flavours are drawn
 * from them. From index 1 on the request differs from the previous question's (its set, or its
 * sequence on an ordered level). An out-of-range level is clamped.
 */
export function questionFor(seed: number, index: number, level: number): Question {
  const lvl = levelOf(level);
  let q = draw(seed, 0, lvl, undefined);
  for (let i = 1; i <= index; i++) q = draw(seed, i, lvl, key(q.wanted, lvl.ordered));
  return q;
}
