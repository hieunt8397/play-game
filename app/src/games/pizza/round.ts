// Tiệm pizza round model (Story 3.1), pure: the slices, the base, the oven step, the round's questions
// and the outcome commands. The scene (Pizza.ts) only applies the commands with Phaser.
//
// Stages per question: toppings → counting → oven → baking.
// Drop resolution of a slice, first match wins:
//   1. home  — within snapRadius/2 of its own pre-lift position: settles back, no hint;
//   2. serve — inside the base target (hit r = baseRadius + snapRadius × snapScale) and nearer the base
//      centre than every bowl home (a drop by a bowl is never a serve);
//   3. rest  — inside hit.counter: stays, nudged clear of the other loose slices (its new pre-lift spot);
//   4. off   — anywhere else. Story 5.1: inside the play rect (the drag bounds) the slice rests there,
//      nudged clear of the other loose slices; only a point outside it slides back after a delay (a new
//      lift cancels the slide).
// Serve of the asked topping in the toppings stage: the slice snaps to the lowest free `slot.base-<n>`
// and is locked; a fresh slice pops in on its bowl when the bowl has none; the game says
// `count.<placed>`. Below the count: `stepDone(toppingStep)`. At the count: stage counting, every slice
// unpickable; the count line's end starts the recount chain; each chain line bounces its slice; the
// chain's end opens the oven (stage oven, slices pickable, the ready ring, the oven tap step).
// A wrong topping (any stage) or the asked topping in the oven stage floats back and reports `wrong`;
// the placed count never changes. An oven tap before the oven stage only nudges it; in the oven stage
// it ends the hint question, locks the slices, advances the question index and bakes; `eaten()` then
// starts the next question, or celebrates and finishes the round after the last one.
// Story 3.2: `resumeQuestion` validates a resume partial; `begin(index, placed)` restores the placed
// slices on their old spots (no count) and opens the toppings step, or, with a full base, the oven
// step (no recount). The toppings step dims every other topping's bowl and slices at hint level 4.
import { BASE_SLOTS, type ToppingId } from '../../content/games/pizza';
import type { Point } from '../../content/layout-types';
import { inRect, nudgeApart } from '../../core/input/drop';
import type { Rect } from '../../core/safe-rect';
import { BAKE_LINE, askLineId, countLineId, countLineIds, enoughLineId, retryLineId } from './lines';
import { levelIndex, levelOf, roundQuestions, toppingsOf, type PizzaQuestion } from './questions';

export interface Area {
  contains(p: Point): boolean;
}

export interface PizzaGeometry {
  /** Drawn centre of the slice resting on topping `t`'s bowl. */
  bowlHome(t: ToppingId): Point;
  /** Centre of base spot `n` (1-based, `slot.base-<n>`). */
  baseSpot(n: number): Point;
  /** How many spots the base has. */
  readonly spots: number;
  /** The base drop target (createDropTarget with pad = baseRadius). */
  readonly base: Area;
  /** `anchor.base`: a drop serves only when it is nearer the base than every bowl home. */
  readonly baseCentre: Point;
  readonly counter: Area;
  /** Where a resting slice may lie: the counter's box ∩ the drag bounds. */
  restRect(): Rect;
  /** Story 5.1: the play area (the drag bounds): an off drop inside it rests where it landed. */
  playRect(): Rect;
  /** dropTarget.snapRadius (design px). */
  readonly snapRadius: number;
  /** draggableItem.minSize: resting slices stay this far apart. */
  readonly minSize: number;
  readonly offCounterDelayMs: number;
  /** After the last question is eaten, the round finishes this much later (Timing.roundCelebrationMs). */
  readonly finishDelayMs: number;
}

export interface SliceState {
  readonly id: string;
  readonly topping: ToppingId;
  /** Pre-lift position (drawn centre). */
  readonly at: Point;
}

export type Stage = 'toppings' | 'counting' | 'oven' | 'baking' | 'done';

/** The tags the scene maps its voice tokens to. */
export type SpeechTag = 'count' | 'recount';

/** A hint item of the toppings step: a slice (by id) or a topping's bowl sprite. */
export type HintRef = { readonly slice: string } | { readonly bowl: ToppingId };

export type PizzaCommand =
  /** A fresh raw base with its spots, the oven at rest, the level's bowls and their slices. */
  | { readonly kind: 'build'; readonly toppings: readonly ToppingId[]; readonly slices: readonly SliceState[] }
  /** Story 3.2 (resume): locked slices of `topping` straight on these spots — no tween, sfx or count. */
  | { readonly kind: 'restoreSlices'; readonly topping: ToppingId; readonly slots: readonly number[] }
  | {
      readonly kind: 'beginQuestion';
      readonly promptLineId: string;
      readonly retryLineId: string;
      readonly correct: readonly string[];
      readonly distractors: readonly HintRef[];
    }
  /** Story 3.2 (resume with a full base): the question begins at the oven step (bake prompt, "enough" retry). */
  | { readonly kind: 'beginOvenQuestion'; readonly promptLineId: string; readonly retryLineId: string }
  /** The toppings step again (same level; idle restarts). */
  | { readonly kind: 'stepDone'; readonly correct: readonly string[]; readonly distractors: readonly HintRef[] }
  /** The oven step: ring and hand on the oven, the bake prompt, the "enough" retry. */
  | { readonly kind: 'ovenStep'; readonly promptLineId: string; readonly retryLineId: string }
  /** Slice `id` snaps to spot `spot` (sfx in the handler), shrinks and is locked on the base. */
  | { readonly kind: 'snap'; readonly id: string; readonly spot: number; readonly to: Point }
  | { readonly kind: 'respawn'; readonly slice: SliceState }
  | { readonly kind: 'say'; readonly tag: SpeechTag; readonly lineId: string }
  | { readonly kind: 'sayChain'; readonly tag: SpeechTag; readonly lineIds: readonly string[] }
  /** Recount: the slice on spot `spot` bounces once. */
  | { readonly kind: 'bounce'; readonly spot: number }
  | { readonly kind: 'pickable'; readonly on: boolean }
  | { readonly kind: 'ovenReady' }
  /** The game's ready ring around the oven (shown only while the hint level is below 2). */
  | { readonly kind: 'readyRing' }
  | { readonly kind: 'clearReadyRing' }
  | { readonly kind: 'nudgeOven' }
  | { readonly kind: 'floatBack'; readonly id: string; readonly to: Point }
  | { readonly kind: 'rest'; readonly id: string; readonly at: Point }
  | { readonly kind: 'returnLater'; readonly id: string; readonly to: Point; readonly ms: number }
  | { readonly kind: 'cancelReturn'; readonly id: string }
  | { readonly kind: 'hintWrong' }
  | { readonly kind: 'questionDone' }
  /** Slide in, glow, ting, baked base to the fox's plate with steam, eat + munch; then `eaten()`. */
  | { readonly kind: 'bake' }
  /** The last oven tap: from now on a Home tap completes the round (MiniGameBase.markFinishing). */
  | { readonly kind: 'markFinishing' }
  /** The base is full: the hint step is cleared (no ring, hand or retry over the count) until the oven step. */
  | { readonly kind: 'pauseHint' }
  /** The eaten pizza fades, the fox returns to idle, the bake hold is released. */
  | { readonly kind: 'clearBase' }
  /** The last pizza is eaten: the fox's happy frames, bounce and tune. */
  | { readonly kind: 'celebrate' }
  | { readonly kind: 'finishRound'; readonly afterMs: number };

export type DropOutcome = 'home' | 'serve' | 'rest' | 'off';

export interface PizzaProgress {
  readonly questionIndex: number;
  readonly partial: { readonly placed: number[]; readonly baked: boolean };
}

const NEAR = 0.5;

export class PizzaRound {
  private readonly geo: PizzaGeometry;
  private readonly level: number;
  private readonly questions: readonly PizzaQuestion[];
  private index = 0;
  private st: Stage = 'toppings';
  private placed: number[] = [];
  /** Counting stage: the recount chain is playing (else the last count line still is). */
  private recounting = false;
  /** Counting stage: the tags already re-issued once after being cut. */
  private retried = new Set<SpeechTag>();
  private slices = new Map<string, SliceState>();
  private pendingReturn = new Set<string>();
  private nextId = 1;

  constructor(geo: PizzaGeometry, seed: number, level: number) {
    this.geo = geo;
    this.level = levelIndex(level);
    this.questions = roundQuestions(seed, this.level);
  }

  get questionIndex(): number {
    return this.index;
  }

  get questionCount(): number {
    return levelOf(this.level).questions;
  }

  get stage(): Stage {
    return this.st;
  }

  /** The open question (the last one once the round is done). */
  get current(): PizzaQuestion {
    return this.questions[Math.min(this.index, this.questions.length - 1)]!;
  }

  /** True from the last oven tap on (a Home tap then completes the round). */
  get isFinishing(): boolean {
    return this.index >= this.questionCount;
  }

  /** Spot numbers in placement order. */
  placedSpots(): readonly number[] {
    return this.placed;
  }

  sliceStates(): SliceState[] {
    return [...this.slices.values()];
  }

  /** Lays out question 0. */
  start(): PizzaCommand[] {
    return this.begin(0);
  }

  /**
   * Story 3.2: validates a resume `partial` for question `index`: a plain object whose `placed` is an
   * array of distinct integers in 1…BASE_SLOTS, no longer than the question's count, and whose
   * `baked` is false (the oven tap advances the question, so `true` is corrupt). Extra keys are
   * ignored. Null when invalid.
   */
  resumeQuestion(index: number, partial: unknown): { placed: number[] } | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.questionCount) return null;
    if (typeof partial !== 'object' || partial === null || Array.isArray(partial)) return null;
    const proto: unknown = Object.getPrototypeOf(partial);
    if (proto !== Object.prototype && proto !== null) return null;
    const { placed, baked } = partial as { placed?: unknown; baked?: unknown };
    if (baked !== false || !Array.isArray(placed)) return null;
    if (!placed.every((n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= BASE_SLOTS)) return null;
    if (new Set(placed).size !== placed.length) return null;
    if (placed.length > this.questions[index]!.count) return null;
    return { placed: [...placed] };
  }

  /**
   * Lays out question `index` with a raw base holding `placed` (Story 3.2 resume; empty by default):
   * the restored slices first, then the toppings step, or — with a full base — the oven step at once
   * (no recount). `placed` must come from `resumeQuestion`.
   */
  begin(index: number, placed: readonly number[] = []): PizzaCommand[] {
    this.index = index;
    this.st = 'toppings';
    this.recounting = false;
    this.retried = new Set();
    this.placed = [...placed];
    this.slices = new Map();
    this.pendingReturn = new Set();
    const toppings = toppingsOf(levelOf(this.level));
    for (const t of toppings) this.add(t, this.geo.bowlHome(t));
    const q = this.current;
    const out: PizzaCommand[] = [
      { kind: 'build', toppings, slices: this.sliceStates() },
      { kind: 'restoreSlices', topping: q.topping, slots: [...this.placed] },
      { kind: 'pickable', on: true },
    ];
    if (this.placed.length < q.count) {
      return [...out, { kind: 'beginQuestion', promptLineId: askLineId(q), retryLineId: retryLineId(q), ...this.toppingStep() }];
    }
    // Home was tapped during the recount or the oven stage: straight back to the ready oven, no recount.
    this.st = 'oven';
    return [...out, { kind: 'ovenReady' }, { kind: 'readyRing' }, { kind: 'beginOvenQuestion', promptLineId: BAKE_LINE, retryLineId: enoughLineId(q.count) }];
  }

  /** A finger lifted slice `id`: a pending slide back is cancelled. */
  lift(id: string): PizzaCommand[] {
    if (!this.pendingReturn.delete(id)) return [];
    return [{ kind: 'cancelReturn', id }];
  }

  /** Where a drop of slice `id` at `p` resolves (no state change). */
  resolve(id: string, p: Point): DropOutcome {
    const s = this.slices.get(id);
    const g = this.geo;
    if (s && Math.hypot(p.x - s.at.x, p.y - s.at.y) <= g.snapRadius / 2) return 'home';
    if (g.base.contains(p) && this.nearerBaseThanBowls(p)) return 'serve';
    if (g.counter.contains(p)) return 'rest';
    return 'off';
  }

  /** Slice `id` released at `p` (its centre). */
  drop(id: string, p: Point): PizzaCommand[] {
    const s = this.slices.get(id);
    if (!s) return [];
    // Counting and baking lock every slice; a drag that was already running just goes back.
    if (this.st === 'counting' || this.st === 'baking' || this.st === 'done') return [{ kind: 'floatBack', id, to: s.at }];
    switch (this.resolve(id, p)) {
      case 'home':
        return [{ kind: 'floatBack', id, to: s.at }];
      case 'serve':
        if (this.st === 'toppings' && s.topping === this.current.topping && this.placed.length < this.current.count) return this.serve(s);
        return [{ kind: 'floatBack', id, to: s.at }, { kind: 'hintWrong' }];
      case 'rest':
        return this.rest(s, p, this.geo.restRect());
      case 'off':
        if (inRect(p, this.geo.playRect())) return this.rest(s, p, this.geo.playRect());
        this.pendingReturn.add(id);
        return [{ kind: 'returnLater', id, to: s.at, ms: this.geo.offCounterDelayMs }];
    }
  }

  /** The slice stays at `p`, nudged clear of the other loose slices inside `rect` (its new pre-lift spot). */
  private rest(s: SliceState, p: Point, rect: Rect): PizzaCommand[] {
    const others = this.sliceStates()
      .filter((o) => o.id !== s.id)
      .map((o) => o.at);
    const at = nudgeApart(p, others, this.geo.minSize, rect);
    this.slices.set(s.id, { ...s, at });
    return [{ kind: 'rest', id: s.id, at }];
  }

  /** The drag of `id` ended without a release (pause, lost up): back to its pre-lift spot. */
  cancel(id: string): PizzaCommand[] {
    const s = this.slices.get(id);
    return s ? [{ kind: 'floatBack', id, to: s.at }] : [];
  }

  /** A delayed slide back ran. */
  returned(id: string): void {
    this.pendingReturn.delete(id);
  }

  /**
   * A tagged utterance ended. Cut (`completed` false) the first time in this counting stage, the count
   * line or the recount chain is said again, so the child always hears the full count; a second cut
   * moves on (no endless retry when the voice cannot play).
   */
  speechEnded(tag: SpeechTag, completed = true): PizzaCommand[] {
    if (this.st !== 'counting') return [];
    if (tag !== (this.recounting ? 'recount' : 'count')) return [];
    if (!completed && !this.retried.has(tag)) {
      this.retried.add(tag);
      return tag === 'count'
        ? [{ kind: 'say', tag, lineId: countLineId(this.placed.length) }]
        : [{ kind: 'sayChain', tag, lineIds: countLineIds(this.placed.length) }];
    }
    if (!this.recounting) {
      this.recounting = true;
      return [{ kind: 'sayChain', tag: 'recount', lineIds: countLineIds(this.placed.length) }];
    }
    // The recount ended: the oven opens.
    this.st = 'oven';
    this.recounting = false;
    return [
      { kind: 'ovenReady' },
      { kind: 'pickable', on: true },
      { kind: 'readyRing' },
      { kind: 'ovenStep', promptLineId: BAKE_LINE, retryLineId: enoughLineId(this.current.count) },
    ];
  }

  /** Line `index` of a tagged utterance started: during the recount, its slice bounces. */
  speechLine(tag: SpeechTag, index: number): PizzaCommand[] {
    if (this.st !== 'counting' || !this.recounting || tag !== 'recount') return [];
    const spot = this.placed[index];
    return spot === undefined ? [] : [{ kind: 'bounce', spot }];
  }

  /** The oven was tapped. */
  ovenTap(): PizzaCommand[] {
    if (this.st === 'toppings' || this.st === 'counting') return [{ kind: 'nudgeOven' }];
    if (this.st !== 'oven') return [];
    this.st = 'baking';
    // The answered question is never "in progress": the index advances at the answer (spec-1-10).
    this.index += 1;
    this.placed = [];
    this.pendingReturn = new Set();
    const out: PizzaCommand[] = [{ kind: 'clearReadyRing' }, { kind: 'questionDone' }, { kind: 'pickable', on: false }];
    if (this.isFinishing) out.push({ kind: 'markFinishing' });
    return [...out, { kind: 'bake' }];
  }

  /** The fox finished eating. */
  eaten(): PizzaCommand[] {
    if (this.st !== 'baking') return [];
    if (this.isFinishing) {
      this.st = 'done';
      return [{ kind: 'celebrate' }, { kind: 'finishRound', afterMs: this.geo.finishDelayMs }];
    }
    return [{ kind: 'clearBase' }, ...this.begin(this.index)];
  }

  /** The resumable state (AD-2): the open question and the spots placed on it. */
  progress(): PizzaProgress {
    return { questionIndex: Math.min(this.index, this.questionCount), partial: { placed: [...this.placed], baked: false } };
  }

  private serve(s: SliceState): PizzaCommand[] {
    const spot = this.lowestFreeSpot();
    this.placed.push(spot);
    this.slices.delete(s.id);
    this.pendingReturn.delete(s.id);
    const out: PizzaCommand[] = [{ kind: 'snap', id: s.id, spot, to: this.geo.baseSpot(spot) }];
    if (!this.bowlHasSlice(s.topping)) out.push({ kind: 'respawn', slice: this.add(s.topping, this.geo.bowlHome(s.topping)) });
    const say: PizzaCommand = { kind: 'say', tag: 'count', lineId: countLineId(this.placed.length) };
    if (this.placed.length < this.current.count) return [...out, say, { kind: 'stepDone', ...this.toppingStep() }];
    this.st = 'counting';
    return [...out, { kind: 'pickable', on: false }, { kind: 'pauseHint' }, say];
  }

  /** A drop near a bowl is that bowl's business (rest or home), even inside the base's forgiving margin. */
  private nearerBaseThanBowls(p: Point): boolean {
    const c = this.geo.baseCentre;
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    return toppingsOf(levelOf(this.level)).every((t) => {
      const h = this.geo.bowlHome(t);
      return d < Math.hypot(p.x - h.x, p.y - h.y);
    });
  }

  private lowestFreeSpot(): number {
    for (let n = 1; n <= this.geo.spots; n++) if (!this.placed.includes(n)) return n;
    return this.geo.spots;
  }

  private bowlHasSlice(t: ToppingId): boolean {
    const home = this.geo.bowlHome(t);
    return this.sliceStates().some((s) => s.topping === t && Math.hypot(s.at.x - home.x, s.at.y - home.y) < NEAR);
  }

  /** `t`'s slices: the one on its bowl first, then the loose ones. */
  private slicesOf(t: ToppingId): string[] {
    const home = this.geo.bowlHome(t);
    const own = this.sliceStates().filter((s) => s.topping === t);
    const onBowl = (s: SliceState): number => (Math.hypot(s.at.x - home.x, s.at.y - home.y) < NEAR ? 0 : 1);
    own.sort((a, b) => onBowl(a) - onBowl(b));
    return own.map((s) => s.id);
  }

  /**
   * The toppings step: correct = the asked topping's bowl slice, then its loose slices; distractors =
   * for each other topping of the level, its bowl sprite, then its bowl slice and its loose slices.
   */
  private toppingStep(): { correct: string[]; distractors: HintRef[] } {
    const t = this.current.topping;
    const others = toppingsOf(levelOf(this.level)).filter((o) => o !== t);
    return {
      correct: this.slicesOf(t),
      distractors: others.flatMap((o): HintRef[] => [{ bowl: o }, ...this.slicesOf(o).map((slice) => ({ slice }))]),
    };
  }

  private add(topping: ToppingId, at: Point): SliceState {
    const s: SliceState = { id: `slice-${this.nextId++}`, topping, at };
    this.slices.set(s.id, s);
    return s;
  }
}

/** What a start lays out: its commands, whether the resume was taken, and the warnings to log. */
export interface StartPlan {
  readonly commands: PizzaCommand[];
  readonly accepted: boolean;
  readonly warnings: string[];
}

/**
 * The first commands of a start. No resume → question 0. A resume → question `resumeAt.questionIndex`
 * with its validated placed slices restored (Story 3.2); an invalid partial → that question begins
 * clean, still accepted, one warning. An out-of-range index → question 0, not accepted, one warning.
 */
export function startCommands(round: PizzaRound, resumeAt: { readonly questionIndex: number; readonly partial?: unknown } | null): StartPlan {
  if (!resumeAt) return { commands: round.start(), accepted: false, warnings: [] };
  const i = resumeAt.questionIndex;
  if (!Number.isInteger(i) || i < 0 || i >= round.questionCount) {
    return { commands: round.start(), accepted: false, warnings: [`pizza: resume index out of range (${i}) — the round starts at question 1`] };
  }
  const ok = round.resumeQuestion(i, resumeAt.partial);
  return { commands: round.begin(i, ok?.placed ?? []), accepted: true, warnings: ok ? [] : ['pizza: bad resume partial'] };
}

