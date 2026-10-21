// Hang tìm bóng round model (Stories 3.5, 3.6), pure: the round's questions, the held item, the drop
// resolution, the reveal hand-over and the end of the round. The scene (ShadowMatch.ts) only applies the
// commands with Phaser.
//
// Drop resolution of the held item, first match wins (Story 5.1: target before home, since the item
// may rest right next to a shadow):
//   1. target — inside one or more shadow targets (`inside`, from the scene's DropTarget.contains, so
//               the level-4 snap scale applies): the shadow whose edge is nearest wins
//               (|p − slot| − shownR, a tie goes to the correct one). The correct shadow → `correct`;
//               a decoy → it floats back to its pre-lift spot, then `hint.wrong()`;
//   2. home   — within snapRadius/2 of its pre-lift spot (the hand, or where it rests): it settles back,
//               no hint;
//   3. off    — anywhere else; not wrong. Story 5.1: inside the play rect (the drag bounds: the cave
//               wall) it rests where it landed (`rest`, its new pre-lift spot); only a point outside it
//               slides back after a delay (a new lift cancels the slide).
// `correct`: the snap sfx (in the drop handler), `questionDone`, the question index advances, the item is
// locked, the ambient is held ('reveal'), the item is sucked into the shadow and the shadow cross-fades to
// its colour frame (scene tweens) → `revealed()` → the triceratops nods and chirps → (after
// trikeCallMs) the item's name. The name's `speech:ended` (completed or not) then begins the next
// question, or celebrates and finishes the round after the last one.
import type { ItemId } from '../../content/games/shadow-match.ts';
import type { Point } from '../../content/layout-types.ts';
import type { HintItem, HintStep } from '../../core/hint-machine.ts';
import { inRect, type DropTarget } from '../../core/input/drop.ts';
import type { Rect } from '../../core/safe-rect.ts';
import { TRIKE_CALL, askLineId, nameLineId } from './lines.ts';
import { roundQuestions, type ShadowQuestion } from './questions.ts';

export interface ShadowGeometry {
  /** The slot centres of the level's row (`slot.shadow-<n>-1..n`), slot 0 first. */
  readonly slots: readonly Point[];
  /** Where the held item sits (`anchor.triceratops-hand`). */
  readonly hand: Point;
  /** An item's shown radius at its shadow: its longest side / 2 (design px). */
  shownR(item: ItemId): number;
  /** Story 5.1: the play area (the drag bounds): an off drop inside it rests where it landed. */
  playRect(): Rect;
  /** dropTarget.snapRadius (design px). */
  readonly snapRadius: number;
  readonly offDelayMs: number;
  /** The name is said this long after the chirp (Timing.trikeCallMs). */
  readonly callMs: number;
  /** After the last name, the round finishes this much later (Timing.roundCelebrationMs). */
  readonly finishDelayMs: number;
}

export type Stage = 'ask' | 'reveal' | 'done';
/** The tag the scene maps its voice token to (the item's name). */
export type SpeechTag = 'name';
export type DropOutcome = 'home' | 'correct' | 'decoy' | 'off';

export type ShadowCommand =
  /** The question's shadows on the row's slots, a target per shadow, and the held item at the hand (`fade`: they fade in). */
  | { readonly kind: 'showQuestion'; readonly index: number; readonly item: ItemId; readonly shadows: readonly ItemId[]; readonly correctSlot: number; readonly fade: boolean }
  /** The question's hint question (prompt = retry = the ask line). */
  | { readonly kind: 'beginQuestion'; readonly promptLineId: string; readonly retryLineId: string }
  /** The snap "pụp" (played in the drop handler). */
  | { readonly kind: 'snapSfx' }
  | { readonly kind: 'floatBack'; readonly to: Point }
  /** Story 5.1: the item stays at `at` (a drop off the shadows inside the play rect). */
  | { readonly kind: 'rest'; readonly at: Point }
  | { readonly kind: 'returnLater'; readonly to: Point; readonly ms: number }
  | { readonly kind: 'cancelReturn' }
  | { readonly kind: 'hintWrong' }
  | { readonly kind: 'questionDone' }
  /** The held item becomes unpickable. */
  | { readonly kind: 'lockItem' }
  /** Holds (or releases) the ambient sway during the reveal and the celebration. */
  | { readonly kind: 'holdReveal'; readonly on: boolean }
  /** The last question's correct drop: from now on a Home tap completes the round (MiniGameBase.markFinishing). */
  | { readonly kind: 'markFinishing' }
  /** The item tweens into shadow `slot` (centre to the slot, scale → 1, alpha → 0). */
  | { readonly kind: 'suckIn'; readonly slot: number; readonly to: Point }
  /** Shadow `slot` cross-fades to the item's colour frame; then the scene calls `revealed()`. */
  | { readonly kind: 'reveal'; readonly slot: number; readonly item: ItemId }
  /** The nod frame with a bounce. */
  | { readonly kind: 'trikeNod' }
  | { readonly kind: 'sfx'; readonly id: string }
  /** `say(id)` with tag `tag`, `afterMs` from now (scene clock). */
  | { readonly kind: 'say'; readonly tag: SpeechTag; readonly id: string; readonly afterMs: number }
  /** The revealed item and the decoys fade out (the next question's `showQuestion` follows). */
  | { readonly kind: 'clearQuestion' }
  /** The last question: happy frames, bounce and the happy tune. */
  | { readonly kind: 'celebrate' }
  | { readonly kind: 'finishRound'; readonly afterMs: number };

export interface ShadowProgress {
  readonly questionIndex: number;
  readonly partial: Record<string, never>;
}

export class ShadowRound {
  private readonly geo: ShadowGeometry;
  private readonly qs: readonly ShadowQuestion[];
  private index = 0;
  private st: Stage = 'ask';
  private pendingReturn = false;
  /** Story 5.1: the held item's pre-lift spot (the hand until it rests elsewhere). */
  private at: Point;
  /** The question being revealed (between the correct drop and its name). */
  private revealing: ShadowQuestion | undefined;

  constructor(geo: ShadowGeometry, seed: number, level: number) {
    this.geo = geo;
    this.qs = roundQuestions(seed, level);
    this.at = geo.hand;
  }

  get questionIndex(): number {
    return this.index;
  }

  get questionCount(): number {
    return this.qs.length;
  }

  get stage(): Stage {
    return this.st;
  }

  get questions(): readonly ShadowQuestion[] {
    return this.qs;
  }

  /** The open question (the last one once the round is done). */
  get current(): ShadowQuestion {
    return this.qs[Math.min(this.index, this.qs.length - 1)]!;
  }

  /** True from the last question's correct drop on (a Home tap then completes the round). */
  get isFinishing(): boolean {
    return this.index >= this.questionCount;
  }

  /** Lays out question 0 (its item and shadows fade in after the triceratops' entrance). */
  start(): ShadowCommand[] {
    return this.begin(0, true);
  }

  /** Lays out question `index`: its shadows and the held item, then its hint question. */
  begin(index: number, fade: boolean): ShadowCommand[] {
    this.index = index;
    this.st = 'ask';
    this.pendingReturn = false;
    this.revealing = undefined;
    this.at = this.geo.hand;
    const q = this.current;
    return [
      { kind: 'showQuestion', index, item: q.item, shadows: q.shadows, correctSlot: q.correctSlot, fade },
      { kind: 'beginQuestion', promptLineId: askLineId(q.item), retryLineId: askLineId(q.item) },
    ];
  }

  /** A finger lifted the item: a pending slide back is cancelled. */
  lift(): ShadowCommand[] {
    if (!this.pendingReturn) return [];
    this.pendingReturn = false;
    return [{ kind: 'cancelReturn' }];
  }

  /**
   * The shadow a drop at `p` lands on: among `inside` (the slot indices whose target holds `p`), the one
   * whose edge is nearest (|p − slot| − shownR); a tie goes to the correct slot. Undefined when empty.
   */
  pick(p: Point, inside: readonly number[]): number | undefined {
    const q = this.current;
    let best: number | undefined;
    let bestD = Number.POSITIVE_INFINITY;
    for (const k of inside) {
      const s = this.geo.slots[k];
      const item = q.shadows[k];
      if (!s || item === undefined) continue;
      const d = Math.hypot(p.x - s.x, p.y - s.y) - this.geo.shownR(item);
      if (d < bestD || (d === bestD && k === q.correctSlot)) {
        best = k;
        bestD = d;
      }
    }
    return best;
  }

  /** Where a drop at `p` resolves (no state change). */
  resolve(p: Point, inside: readonly number[]): DropOutcome {
    // Story 5.1: the shadows first — the rest spot can lie next to a shadow, and a drop on it must count.
    const k = this.pick(p, inside);
    if (k !== undefined) return k === this.current.correctSlot ? 'correct' : 'decoy';
    const h = this.at;
    if (Math.hypot(p.x - h.x, p.y - h.y) <= this.geo.snapRadius / 2) return 'home';
    return 'off';
  }

  /** The held item released at `p` (its centre); `inside` = the slot indices whose target holds `p`. */
  drop(p: Point, inside: readonly number[]): ShadowCommand[] {
    const hand = this.at;
    // Once the answer is accepted the item belongs to the reveal: nothing may move it again.
    if (this.st !== 'ask') return [];
    switch (this.resolve(p, inside)) {
      case 'home':
        return [{ kind: 'floatBack', to: hand }];
      case 'decoy':
        return [{ kind: 'floatBack', to: hand }, { kind: 'hintWrong' }];
      case 'off': {
        const r = this.geo.playRect();
        if (inRect(p, r)) {
          this.at = { x: p.x, y: p.y };
          return [{ kind: 'rest', at: this.at }];
        }
        this.pendingReturn = true;
        return [{ kind: 'returnLater', to: hand, ms: this.geo.offDelayMs }];
      }
      case 'correct':
        return this.correct();
    }
  }

  /** The drag ended without a release (pause, lost up): back to its pre-lift spot. */
  cancel(): ShadowCommand[] {
    if (this.st !== 'ask') return [];
    return [{ kind: 'floatBack', to: this.at }];
  }

  /** A delayed slide back ran. */
  returned(): void {
    this.pendingReturn = false;
  }

  /** The shadow finished turning real-coloured: the triceratops nods and chirps, then names the item. */
  revealed(): ShadowCommand[] {
    const q = this.revealing;
    if (this.st !== 'reveal' || !q) return [];
    this.revealing = undefined;
    return [
      { kind: 'trikeNod' },
      { kind: 'sfx', id: TRIKE_CALL },
      { kind: 'say', tag: 'name', id: nameLineId(q.item), afterMs: this.geo.callMs },
    ];
  }

  /** The name ended (completed or cut): the next question, or the end of the round. */
  speechEnded(tag: SpeechTag): ShadowCommand[] {
    if (this.st !== 'reveal' || tag !== 'name' || this.revealing) return [];
    if (this.isFinishing) {
      this.st = 'done';
      return [{ kind: 'celebrate' }, { kind: 'finishRound', afterMs: this.geo.finishDelayMs }];
    }
    return [{ kind: 'clearQuestion' }, { kind: 'holdReveal', on: false }, ...this.begin(this.index, true)];
  }

  /** The resumable state (AD-2): the open question; shadow-match keeps no partial progress. */
  progress(): ShadowProgress {
    return { questionIndex: Math.min(this.index, this.questionCount), partial: {} };
  }

  /**
   * Story 3.6: the progress a resume of question `index` restores, or null when `partial` is not the
   * empty plain object shadow-match saves (`null`, an array, a string, `{ placed: [1] }` …). The caller
   * range-checks `index`. Shadow-match keeps no in-question progress, so either way the question begins
   * clean: its item and shadows come back from seed + level.
   */
  resumeQuestion(_index: number, partial: unknown): Record<string, never> | null {
    return resumeQuestion(partial);
  }

  private correct(): ShadowCommand[] {
    const q = this.current;
    this.st = 'reveal';
    this.pendingReturn = false;
    this.revealing = q;
    this.index += 1;
    const slot = q.correctSlot;
    const out: ShadowCommand[] = [{ kind: 'snapSfx' }, { kind: 'questionDone' }, { kind: 'lockItem' }, { kind: 'holdReveal', on: true }];
    if (this.isFinishing) out.push({ kind: 'markFinishing' });
    out.push({ kind: 'suckIn', slot, to: this.geo.slots[slot] ?? this.geo.hand }, { kind: 'reveal', slot, item: q.item });
    return out;
  }
}

/** One shadow on screen as the hint step needs it: its hint handle and its drop target. */
export interface ShadowStepView {
  readonly hint: HintItem;
  readonly target: DropTarget;
}

/**
 * The hint step of a question: drag the held item (`correct[0]`) onto the correct slot's target; the
 * level-2 ring and bob go on the correct shadow (`focus`); the other shadows are the distractors
 * (dimmed at level 4). Without a held draggable, `correct` is empty.
 */
export function hintStepFor(correctSlot: number, held: HintItem | undefined, shadows: readonly ShadowStepView[]): HintStep {
  const right = shadows[correctSlot];
  return {
    correct: held ? [held] : [],
    distractors: shadows.filter((_, k) => k !== correctSlot).map((s) => s.hint),
    target: right?.target ?? null,
    action: 'drag',
    ...(right ? { focus: right.hint } : {}),
  };
}

/** What a start lays out: its commands, whether the resume was taken, and the warnings to log. */
export interface StartPlan {
  readonly commands: ShadowCommand[];
  readonly accepted: boolean;
  readonly warnings: string[];
}

/** Story 3.6, pure: `{}` when `partial` is a plain object with no own keys, else null. */
export function resumeQuestion(partial: unknown): Record<string, never> | null {
  if (typeof partial !== 'object' || partial === null || Array.isArray(partial)) return null;
  const proto: unknown = Object.getPrototypeOf(partial);
  if (proto !== Object.prototype && proto !== null) return null;
  return Reflect.ownKeys(partial).length === 0 ? {} : null;
}

/**
 * The first commands of a start. No resume → question 0. A resume → question `resumeAt.questionIndex`,
 * clean (the same item and shadows, from seed + level); a bad `partial` → the same question, accepted,
 * one warning. An out-of-range index → question 0, not accepted, one warning.
 */
export function startCommands(round: ShadowRound, resumeAt: { readonly questionIndex: number; readonly partial?: unknown } | null): StartPlan {
  if (!resumeAt) return { commands: round.start(), accepted: false, warnings: [] };
  const i = resumeAt.questionIndex;
  if (!Number.isInteger(i) || i < 0 || i >= round.questionCount) {
    return { commands: round.start(), accepted: false, warnings: [`shadow-match: resume index out of range (${i}) — the round starts at question 1`] };
  }
  const ok = round.resumeQuestion(i, resumeAt.partial);
  return { commands: round.begin(i, true), accepted: true, warnings: ok ? [] : ['shadow-match: bad resume partial'] };
}
