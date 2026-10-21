// Tiệm kem round model (Stories 1.8, 1.10), pure: the scoops on the counter, the cone, drop
// resolution, the round's questions and the outcome commands. The scene (IceCream.ts) only applies
// the commands with Phaser.
// Drop resolution of a scoop, first match wins:
//   1. inside the cone target (circle at slot.cone-1, r = snapRadius × snapScale) → serve
//   2. inside hit.shiba → serve
//   3. within snapRadius/2 of its own pre-lift position → home (settles back, no hint)
//   4. inside hit.counter-upper → serve
//   5. inside hit.counter → rest
//   6. anywhere else → off. Story 5.1: inside the play rect (the drag bounds) it rests too; only a
//      point outside it slides back after a delay (a new lift cancels the slide)
// A rest (2026-10-21 fix) always lands on the table row (`row()`: the home slots' y, x inside the white
// counter top): at the drop's x, moved sideways to the nearest x clear of every other scoop by minSize
// (`placeOnRow`); that spot is its new pre-lift position. A full row floats it back instead. No resting
// scoop ever lies below the row (on the pink front).
// A serve is correct when the flavour is wanted and not yet placed (and, on an ordered level, the next
// in order). It snaps onto the next cone slot and a fresh scoop of that flavour pops in at its home
// (a scoop resting on that home is nudged clear: `rest`).
// Not the last scoop: `stepDone` with the next stage. The last scoop: `questionDone`, every scoop
// unpickable, Shiba celebrates, and the question index advances at once; then the next question after
// `nextQuestionDelayMs`, or `finishRound` after `finishDelayMs` when it was the round's last.
// A wrong serve is a "chose-other" (Story 5.8, FR30): `choseOther` (the scene plays the picked comic
// reaction, never a wrong sound: Story 6.1 taste → grimace → float back) and `hintWrong` once. The cone
// and the question survive every outcome. After the last question every drop only floats back until
// the scene's free play starts.
// Story 6.1 free play (`beginFreePlay`, from the scene's onFreePlay): every counter scoop is pickable
// and any flavour served stacks on the cone (`stack`, no hint, no voice; Shiba's correct reaction still
// plays: `celebrate`). A stacked scoop respawns at its flavour's home only when no other scoop of that
// flavour is left on the counter (toppled ones included), so the counter stays bounded across topples.
// Tower slot n ≥ 3 continues the cone-1 → cone-2 step past cone-3. When the tower (the last question's
// cone scoops included) reaches `towerMax`, `topple` lists the tower scoops that fall, each with its rest spot on the
// table row (packRow: clear of the others; only as many as the row has room for, the top ones, while the
// lowest stay on the cone as the new tower); they are counter scoops at once. Until the
// scene reports `toppled()` (its wobble ran) a serve floats back. Rest / home / off drops behave as
// during play.
// Story 2.5: `progress()` is the resumable state; `resumeQuestion` validates a resume partial and
// `resume(index, placed)` lays that question out with the placed scoops already on the cone.
import type { FlavourId } from '../../content/games/ice-cream';
import type { Point } from '../../content/layout-types';
import { CLEAR_EPSILON, inRect } from '../../core/input/drop';
import type { Rect } from '../../core/safe-rect';
import { askLineId, retryLineId } from './lines';
import { levelIndex, levelOf, questionFor, type Question } from './questions';

export interface Area {
  contains(p: Point): boolean;
}

export interface RoundGeometry {
  /** Centre of a scoop resting at home slot `slot`. */
  homeCentre(slot: string): Point;
  /** Centre of the n-th scoop on the cone (0-based; clamped to the last slot). */
  coneCentre(n: number): Point;
  readonly cone: Area;
  readonly shiba: Area;
  readonly counterUpper: Area;
  readonly counter: Area;
  /** Where every resting scoop lies: the table row (the home slots' y, x within the white counter top). */
  row(): TableRow;
  /** Story 5.1: the play area (the drag bounds): an off drop inside it falls onto the table row. */
  playRect(): Rect;
  /** dropTarget.snapRadius (design px). */
  readonly snapRadius: number;
  /** draggableItem.minSize: resting scoops stay this far apart. */
  readonly minSize: number;
  readonly offCounterDelayMs: number;
  /** After a question's last scoop, the next question starts this much later. */
  readonly nextQuestionDelayMs: number;
  /** After the round's last scoop, the round finishes this much later (Timing.roundCelebrationMs). */
  readonly finishDelayMs: number;
  /** Story 6.1: free play: the tower topples at this many scoops (ui.iceCreamTowerMax). */
  readonly towerMax: number;
}

/** The table row: resting scoop centres lie at y, x0 ≤ x ≤ x1. */
export interface TableRow {
  readonly y: number;
  readonly x0: number;
  readonly x1: number;
}

/**
 * The x on `row` nearest to `x` (clamped into the row) whose spot (x, row.y) is at least `minDist` from
 * every point of `others`; undefined when no such x exists (the row is full). Pure.
 */
export function placeOnRow(x: number, others: readonly Point[], minDist: number, row: TableRow): number | undefined {
  const lo = Math.min(row.x0, row.x1);
  const hi = Math.max(row.x0, row.x1);
  const clear = (c: number) => others.every((o) => Math.hypot(c - o.x, row.y - o.y) >= minDist - CLEAR_EPSILON);
  // The clear set is [lo, hi] minus an open interval around each neighbour: the nearest clear x is x
  // itself (clamped), a row end or an interval end.
  const candidates = [Math.min(hi, Math.max(lo, x)), lo, hi];
  for (const o of others) {
    const dy = Math.abs(row.y - o.y);
    if (dy >= minDist) continue;
    const dx = Math.sqrt(minDist * minDist - dy * dy);
    candidates.push(o.x - dx, o.x + dx);
  }
  let best: number | undefined;
  for (const c of candidates) {
    if (c < lo || c > hi || !clear(c)) continue;
    if (best === undefined || Math.abs(c - x) < Math.abs(best - x)) best = c;
  }
  return best;
}

/**
 * Every spot of `row` packed from its left end: the leftmost clear x, then the leftmost clear x at least
 * `minDist` right of it, and so on (each clear of `others` by `minDist`). Packing from one end fits the
 * most spots; any subset of them stays `minDist` apart. Pure.
 */
export function packRow(others: readonly Point[], minDist: number, row: TableRow): number[] {
  if (!(minDist > 0)) return [];
  const lo = Math.min(row.x0, row.x1);
  const hi = Math.max(row.x0, row.x1);
  const spots: number[] = [];
  let c = lo;
  while (c <= hi) {
    // Push c past every neighbour it is too close to, until it is clear.
    let moved = true;
    while (moved && c <= hi) {
      moved = false;
      for (const o of others) {
        const dy = Math.abs(row.y - o.y);
        if (dy >= minDist) continue;
        const end = o.x + Math.sqrt(minDist * minDist - dy * dy);
        if (Math.abs(c - o.x) < end - o.x - CLEAR_EPSILON && end > c) {
          c = end;
          moved = true;
        }
      }
    }
    if (c > hi) break;
    spots.push(c);
    c += minDist;
  }
  return spots;
}

/**
 * The table row from the home slot centres (scoop centres at home): their y (the first's), x from the
 * leftmost to the rightmost home (a scoop there stays on the counter top's face), clamped to `playRect`.
 * The homes are rowGap (2 × minSize) apart, so the row holds them plus the spots between. Pure.
 */
export function tableRowFrom(homes: readonly Point[], playRect: Rect): TableRow {
  const xs = homes.map((h) => h.x);
  const y = homes[0]?.y ?? playRect.y + playRect.h / 2;
  if (xs.length === 0) return { y, x0: playRect.x, x1: playRect.x + playRect.w };
  const x0 = Math.max(Math.min(...xs), playRect.x);
  const x1 = Math.min(Math.max(...xs), playRect.x + playRect.w);
  return x0 <= x1 ? { y, x0, x1 } : { y, x0: (x0 + x1) / 2, x1: (x0 + x1) / 2 };
}

/** Story 6.1: a scoop of the toppled tower: its counter scoop id, flavour and rest spot. */
export interface ToppledScoop {
  readonly id: string;
  readonly flavour: FlavourId;
  readonly to: Point;
}

export interface ScoopState {
  readonly id: string;
  readonly flavour: FlavourId;
  /** Pre-lift position (centre). */
  readonly at: Point;
}

export type RoundCommand =
  | { readonly kind: 'build'; readonly scoops: readonly ScoopState[] }
  | {
      readonly kind: 'beginQuestion';
      readonly promptLineId: string;
      readonly retryLineId: string;
      readonly correct: readonly string[];
      readonly distractors: readonly string[];
    }
  | { readonly kind: 'stepDone'; readonly retryLineId: string; readonly correct: readonly string[]; readonly distractors: readonly string[] }
  | { readonly kind: 'snap'; readonly id: string; readonly to: Point }
  /** Story 2.5: scoops already served before Home, drawn straight on their cone slots (no tween, no sfx). */
  | { readonly kind: 'restoreCone'; readonly scoops: readonly { readonly flavour: FlavourId; readonly to: Point }[] }
  | { readonly kind: 'floatBack'; readonly id: string; readonly to: Point }
  /** Story 5.8: a wrong serve — the scene plays a picked "chose-other" reaction, ending with the scoop at `to`. */
  | { readonly kind: 'choseOther'; readonly id: string; readonly to: Point }
  | { readonly kind: 'rest'; readonly id: string; readonly at: Point }
  | { readonly kind: 'returnLater'; readonly id: string; readonly to: Point; readonly ms: number }
  | { readonly kind: 'cancelReturn'; readonly id: string }
  | { readonly kind: 'respawn'; readonly scoop: ScoopState }
  | { readonly kind: 'pickable'; readonly on: boolean }
  | { readonly kind: 'celebrate' }
  | { readonly kind: 'hintWrong' }
  | { readonly kind: 'questionDone' }
  | { readonly kind: 'nextLater'; readonly ms: number }
  | { readonly kind: 'finishRound'; readonly afterMs: number }
  /** Story 6.1 free play: scoop `id` stacks onto tower slot `to` (any flavour; no hint, no voice). */
  | { readonly kind: 'stack'; readonly id: string; readonly to: Point }
  /** Story 6.1 free play: the full tower wobbles, then its scoops (in cone order) fall to their rest spots. */
  | { readonly kind: 'topple'; readonly scoops: readonly ToppledScoop[] }
  | { readonly kind: 'clear' };

/** Story 6.1: the index of the last cone slot (cone-3); tower slots above it are extrapolated. */
const CONE_TOP_SLOT = 2;

export type DropOutcome = 'serve' | 'home' | 'rest' | 'off';

export interface IceCreamProgress {
  readonly questionIndex: number;
  readonly partial: { readonly placed: FlavourId[] };
}

export class IceCreamRound {
  private readonly geo: RoundGeometry;
  private readonly seed: number;
  private readonly level: number;
  private index: number;
  private question: Question;
  private scoops = new Map<string, ScoopState>();
  private placed: FlavourId[] = [];
  private pendingReturn = new Set<string>();
  private celebrating = false;
  private finished = false;
  private nextId = 1;
  /** Story 6.1: the ids of the scoops snapped onto the cone this question (undefined: restored on resume). */
  private coneIds: (string | undefined)[] = [];
  /** Story 6.1: free play started (`beginFreePlay`). */
  private free = false;
  /** Story 6.1: the free-play tower, in cone order (id undefined: a scoop restored on resume). */
  private tower: { readonly id: string | undefined; readonly flavour: FlavourId }[] = [];
  /** Story 6.1: the tower toppled and the scene has not reported `toppled()` yet. */
  private toppling = false;

  constructor(geo: RoundGeometry, seed: number, level: number, startIndex = 0) {
    this.geo = geo;
    this.seed = seed;
    this.level = levelIndex(level);
    this.index = startIndex;
    this.question = questionFor(seed, startIndex, this.level);
  }

  get questionIndex(): number {
    return this.index;
  }

  /** Questions in this round (the level's count). */
  get questionCount(): number {
    return levelOf(this.level).questions;
  }

  /** The current question's asked scoops. */
  get wanted(): readonly FlavourId[] {
    return this.question.wanted;
  }

  get current(): Question {
    return this.question;
  }

  get isCelebrating(): boolean {
    return this.celebrating;
  }

  /** True once the round's last question is answered. */
  get isFinished(): boolean {
    return this.finished;
  }

  /** Story 6.1: true once free play started. */
  get isFreePlay(): boolean {
    return this.free;
  }

  /** Story 6.1: the free-play tower's height (the last question's cone scoops included). */
  get towerCount(): number {
    return this.tower.length;
  }

  /** Current scoops on the counter (not the ones on the cone). */
  scoopStates(): ScoopState[] {
    return [...this.scoops.values()];
  }

  conePlaced(): readonly FlavourId[] {
    return this.placed;
  }

  /** Lays out the current question: its scoops and the hint question. */
  start(): RoundCommand[] {
    this.scoops = new Map();
    this.pendingReturn = new Set();
    this.celebrating = false;
    for (const s of this.question.scoops) this.add(s.flavour, this.geo.homeCentre(s.home));
    const stage = this.stage();
    return [
      { kind: 'build', scoops: this.scoopStates() },
      { kind: 'pickable', on: true },
      { kind: 'beginQuestion', promptLineId: askLineId(this.question), retryLineId: retryLineId(this.question, this.placed), ...stage },
    ];
  }

  /** A finger lifted scoop `id`: a pending slide back is cancelled. */
  lift(id: string): RoundCommand[] {
    if (!this.pendingReturn.delete(id)) return [];
    return [{ kind: 'cancelReturn', id }];
  }

  /** Where a drop at `p` of scoop `id` resolves (no state change). */
  resolve(id: string, p: Point): DropOutcome {
    const item = this.scoops.get(id);
    const g = this.geo;
    if (g.cone.contains(p) || g.shiba.contains(p)) return 'serve';
    if (item && Math.hypot(p.x - item.at.x, p.y - item.at.y) <= g.snapRadius / 2) return 'home';
    if (g.counterUpper.contains(p)) return 'serve';
    if (g.counter.contains(p)) return 'rest';
    return 'off';
  }

  /** Whether serving `f` now is correct. */
  isCorrect(f: FlavourId): boolean {
    const q = this.question;
    if (!q.wanted.includes(f) || this.placed.includes(f)) return false;
    return !q.ordered || q.wanted[this.placed.length] === f;
  }

  /** Scoop `id` released at `p` (its centre). */
  drop(id: string, p: Point): RoundCommand[] {
    const item = this.scoops.get(id);
    if (!item) return [];
    // While Shiba celebrates every scoop is unpickable; a drag already running just goes back.
    // Story 6.1: after the round, until free play starts, likewise.
    if (this.celebrating || (this.finished && !this.free)) return [{ kind: 'floatBack', id, to: item.at }];
    switch (this.resolve(id, p)) {
      case 'serve':
        if (this.free) return this.toppling ? [{ kind: 'floatBack', id, to: item.at }] : this.stack(item);
        return this.isCorrect(item.flavour) ? this.serveCorrect(item) : [{ kind: 'choseOther', id, to: item.at }, { kind: 'hintWrong' }];
      case 'home':
        return [{ kind: 'floatBack', id, to: item.at }];
      case 'rest':
        return this.rest(item, p);
      case 'off':
        if (inRect(p, this.geo.playRect())) return this.rest(item, p);
        this.pendingReturn.add(id);
        return [{ kind: 'returnLater', id, to: item.at, ms: this.geo.offCounterDelayMs }];
    }
  }

  /** The drag of `id` ended without a release (pause, lost up): back to its pre-lift spot. */
  cancel(id: string): RoundCommand[] {
    const item = this.scoops.get(id);
    return item ? [{ kind: 'floatBack', id, to: item.at }] : [];
  }

  /** A delayed slide back ran. */
  returned(id: string): void {
    this.pendingReturn.delete(id);
  }

  /** Lays out the (already advanced) next question; the scene calls it `nextLater.ms` after the last scoop. */
  next(): RoundCommand[] {
    if (this.finished) return [];
    return [{ kind: 'clear' }, ...this.start()];
  }

  /**
   * Story 6.1: free play starts (the scene's onFreePlay, after the round finished): the last question's
   * cone scoops start the tower and every counter scoop becomes pickable. Once only; [] otherwise.
   */
  beginFreePlay(): RoundCommand[] {
    if (!this.finished || this.free) return [];
    this.free = true;
    this.celebrating = false;
    return [{ kind: 'pickable', on: true }];
  }

  /** Story 6.1: the scene's tower wobble ran (the fall starts): serves stack again, from cone-1. */
  toppled(): void {
    this.toppling = false;
  }

  /** Story 6.1: tower slot `n` (0-based): the cone slots, then cone-3 plus the cone-1 → cone-2 step per slot. */
  towerCentre(n: number): Point {
    const top = CONE_TOP_SLOT;
    if (n <= top) return this.geo.coneCentre(n);
    const a = this.geo.coneCentre(0);
    const b = this.geo.coneCentre(1);
    const c = this.geo.coneCentre(top);
    const k = n - top;
    return { x: c.x + (b.x - a.x) * k, y: c.y + (b.y - a.y) * k };
  }

  /** The resumable state (AD-2): the open question and the scoops on the cone, in cone order. */
  progress(): IceCreamProgress {
    return { questionIndex: this.index, partial: { placed: [...this.placed] } };
  }

  /**
   * Story 2.5: validates a resume `partial` for question `index` of this round. Null (invalid) unless it is
   * `{ placed: string[] }` whose entries are distinct wanted flavours of that question, fewer than the
   * wanted count, and on an ordered level exactly the first ones in order. No state change.
   */
  resumeQuestion(index: number, partial: unknown): { placed: FlavourId[] } | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.questionCount) return null;
    if (typeof partial !== 'object' || partial === null || Array.isArray(partial)) return null;
    const placed: unknown = (partial as { placed?: unknown }).placed;
    if (!Array.isArray(placed) || !placed.every((f): f is string => typeof f === 'string')) return null;
    const q = questionFor(this.seed, index, this.level);
    const wanted: readonly string[] = q.wanted;
    if (!placed.every((f) => wanted.includes(f))) return null;
    if (new Set(placed).size !== placed.length) return null;
    if (placed.length >= wanted.length) return null;
    if (q.ordered && !placed.every((f, i) => wanted[i] === f)) return null;
    return { placed: placed as FlavourId[] };
  }

  /**
   * Story 2.5: lays out question `index` with `placed` already on the cone (a resumed start). `placed`
   * must come from `resumeQuestion`. The counter is built as usual (every flavour at home), the cone
   * scoops are restored statically, and the hint question begins at the stage for `placed`.
   */
  resume(index: number, placed: readonly FlavourId[]): RoundCommand[] {
    this.index = index;
    this.question = questionFor(this.seed, index, this.level);
    this.placed = [...placed];
    this.coneIds = this.placed.map(() => undefined);
    const [build, ...rest] = this.start();
    const cone = this.placed.map((flavour, n) => ({ flavour, to: this.geo.coneCentre(n) }));
    return cone.length > 0 ? [build!, { kind: 'restoreCone', scoops: cone }, ...rest] : [build!, ...rest];
  }

  /**
   * The scoop falls onto the table row at `p.x`, moved to the nearest clear x (its new pre-lift
   * position); a full row floats it back to its pre-lift spot.
   */
  private rest(item: ScoopState, p: Point): RoundCommand[] {
    const row = this.geo.row();
    const x = placeOnRow(p.x, this.othersThan(item.id), this.geo.minSize, row);
    if (x === undefined) return [{ kind: 'floatBack', id: item.id, to: item.at }];
    const at = { x, y: row.y };
    this.scoops.set(item.id, { ...item, at });
    return [{ kind: 'rest', id: item.id, at }];
  }

  /** The pre-lift spots of every counter scoop but `id`. */
  private othersThan(id: string): Point[] {
    return this.scoopStates()
      .filter((s) => s.id !== id)
      .map((s) => s.at);
  }

  /** The spot on the row nearest `x` clear of `others`; a full row: (x clamped into the row, row y). */
  private rowSpot(x: number, others: readonly Point[]): Point {
    const row = this.geo.row();
    const lo = Math.min(row.x0, row.x1);
    const hi = Math.max(row.x0, row.x1);
    return { x: placeOnRow(x, others, this.geo.minSize, row) ?? Math.min(hi, Math.max(lo, x)), y: row.y };
  }

  private serveCorrect(item: ScoopState): RoundCommand[] {
    const to = this.geo.coneCentre(this.placed.length);
    this.placed.push(item.flavour);
    this.coneIds.push(item.id);
    this.scoops.delete(item.id);
    this.pendingReturn.delete(item.id);
    const snapped: RoundCommand[] = [{ kind: 'snap', id: item.id, to }, ...this.respawnHome(item)];
    if (this.placed.length < this.question.wanted.length) {
      return [...snapped, { kind: 'stepDone', retryLineId: retryLineId(this.question, this.placed), ...this.stage() }];
    }
    this.celebrating = true;
    // The answered question is never "in progress": the index advances at once (a Home tap during the
    // celebration snapshots the next question with nothing placed).
    const last = this.index + 1 >= this.questionCount;
    this.index += 1;
    // Story 6.1: the last question's cone scoops stay on the cone: they start the free-play tower.
    if (last) this.tower = this.placed.map((flavour, n) => ({ id: this.coneIds[n], flavour }));
    this.placed = [];
    this.coneIds = [];
    if (last) this.finished = true;
    else this.question = questionFor(this.seed, this.index, this.level);
    // Story 1.9: the hint question ends first (the ring, hand and fade vanish on the correct answer),
    // so its restore (pickable true) cannot unlock the scoops during the celebration.
    return [
      { kind: 'questionDone' },
      ...snapped,
      { kind: 'pickable', on: false },
      { kind: 'celebrate' },
      last ? { kind: 'finishRound', afterMs: this.geo.finishDelayMs } : { kind: 'nextLater', ms: this.geo.nextQuestionDelayMs },
    ];
  }

  /**
   * A fresh scoop of `item`'s flavour at its home (or where `item` was, when the flavour has no home in
   * this question): `respawn`, then a `rest` for each scoop resting on that spot, moved along the table
   * row to the nearest x clear of the others. The home stays put; a pending slide back of a nudged scoop
   * is cancelled first.
   */
  private respawnHome(item: ScoopState): RoundCommand[] {
    const home = this.question.scoops.find((s) => s.flavour === item.flavour)?.home;
    const fresh = this.add(item.flavour, home ? this.geo.homeCentre(home) : item.at);
    const out: RoundCommand[] = [{ kind: 'respawn', scoop: fresh }];
    const min = this.geo.minSize;
    for (const s of this.scoopStates()) {
      if (s.id === fresh.id || Math.hypot(s.at.x - fresh.at.x, s.at.y - fresh.at.y) >= min) continue;
      const at = this.rowSpot(s.at.x, this.othersThan(s.id));
      this.scoops.set(s.id, { ...s, at });
      if (this.pendingReturn.delete(s.id)) out.push({ kind: 'cancelReturn', id: s.id });
      out.push({ kind: 'rest', id: s.id, at });
    }
    return out;
  }

  /**
   * Story 6.1 free play: any flavour stacks on the tower; it respawns at its home only when no other scoop
   * of that flavour is left on the counter (toppled ones included); a full tower topples.
   */
  private stack(item: ScoopState): RoundCommand[] {
    const to = this.towerCentre(this.tower.length);
    this.tower.push({ id: item.id, flavour: item.flavour });
    this.scoops.delete(item.id);
    this.pendingReturn.delete(item.id);
    const out: RoundCommand[] = [{ kind: 'stack', id: item.id, to }];
    if (!this.scoopStates().some((s) => s.flavour === item.flavour)) out.push(...this.respawnHome(item));
    out.push({ kind: 'celebrate' });
    const topple = this.tower.length >= this.geo.towerMax ? this.topple() : undefined;
    if (topple) out.push(topple);
    return out;
  }

  /**
   * Story 6.1: the tower falls. The table row's free spots are packed from its left end (`packRow`: the
   * most that fit, each minSize clear of every counter scoop and of each other). Only as many scoops as
   * there are spots fall, the top ones (cone order), onto the spots nearest the cone's x; the lowest stay
   * on the cone as the new tower. They are counter scoops at once; a scoop restored on resume (no id)
   * gets a fresh one. No spot at all: no topple (undefined), the tower stays.
   */
  private topple(): RoundCommand | undefined {
    const coneX = this.geo.coneCentre(0).x;
    const row = this.geo.row();
    const spots = packRow(
      this.scoopStates().map((s) => s.at),
      this.geo.minSize,
      row,
    ).sort((a, b) => Math.abs(a - coneX) - Math.abs(b - coneX) || a - b);
    const keep = Math.max(0, this.tower.length - spots.length);
    const falling = this.tower.slice(keep);
    if (falling.length === 0) return undefined;
    const scoops: ToppledScoop[] = falling.map((t, i) => {
      const to = { x: spots[i]!, y: row.y };
      const id = t.id ?? `scoop-${this.nextId++}`;
      this.scoops.set(id, { id, flavour: t.flavour, at: to });
      return { id, flavour: t.flavour, to };
    });
    this.tower = this.tower.slice(0, keep);
    this.toppling = true;
    return { kind: 'topple', scoops };
  }

  /**
   * The hint stage: unordered, the remaining wanted scoops in spoken order; ordered, the next one.
   * Every other counter scoop (already placed flavours included) is a distractor.
   */
  private stage(): { correct: string[]; distractors: string[] } {
    const q = this.question;
    const remaining = q.wanted.filter((f) => !this.placed.includes(f));
    const wantedNow = q.ordered ? remaining.slice(0, 1) : remaining;
    const all = this.scoopStates();
    const correct = wantedNow.flatMap((f) => all.filter((s) => s.flavour === f).map((s) => s.id));
    return { correct, distractors: all.filter((s) => !correct.includes(s.id)).map((s) => s.id) };
  }

  private add(flavour: FlavourId, at: Point): ScoopState {
    const s: ScoopState = { id: `scoop-${this.nextId++}`, flavour, at };
    this.scoops.set(s.id, s);
    return s;
  }
}

/** What a start lays out (Story 2.5): its commands, whether the resume was taken, and the warnings to log. */
export interface StartPlan {
  readonly commands: RoundCommand[];
  /** True when the round resumed at the snapshot's question (its closed questions then count). */
  readonly accepted: boolean;
  readonly warnings: string[];
}

/**
 * Story 2.5: the first commands of a start. No resume → `start()`. A resume whose question index is out
 * of range → `start()` (question 1), not accepted, one warning. Otherwise that question begins, with its
 * placed scoops restored when the partial is valid, or clean with one warning when it is not (accepted
 * either way: the questions before it were closed).
 */
export function startCommands(round: IceCreamRound, resumeAt: { readonly questionIndex: number; readonly partial: unknown } | null): StartPlan {
  if (!resumeAt) return { commands: round.start(), accepted: false, warnings: [] };
  if (resumeAt.questionIndex >= round.questionCount) {
    return {
      commands: round.start(),
      accepted: false,
      warnings: [`ice-cream: resume question ${resumeAt.questionIndex} is out of range — the round starts at question 1`],
    };
  }
  const placed = round.resumeQuestion(resumeAt.questionIndex, resumeAt.partial);
  return {
    commands: round.resume(resumeAt.questionIndex, placed?.placed ?? []),
    accepted: true,
    warnings: placed ? [] : ['ice-cream: invalid resume progress — the question begins clean'],
  };
}
