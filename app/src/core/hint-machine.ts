// HintMachine (Story 1.9, AD-5, NFR4): the pure escalation state machine behind HintDirector.
// Every decision (level, voice, rate limit, hand due, dim) lives here as state and port calls; the
// adapter (hint-director.ts) only feeds `tick(ms)` from the scene clock and `speechEnded(token)` from
// the Bus, and draws through the visuals port.
// - Two clocks: `activeMs` advances on every tick (retry gap, hand loop); the quiet clocks advance only
//   while no hint-owned utterance is awaited (escalation, voice repeat).
// - Levels 0–4 are cumulative: ring + bob at ≥ 2, hand demo at ≥ 3, dim + unpick + snap ×2 at 4.
//   `wrong()` lifts the level to min(wrongCount, 4); quiet time lifts 0/1 → 2 → 3; time never reaches 4.
//   The level never drops within a question; `questionDone` resets everything to 0.
import type { HintLevel } from '../content/types';
import type { DropTarget } from './input/drop';
import type { Point } from './input/polygon';
import { Tokens } from './tokens';

export type HintAction = 'drag' | 'tap' | 'trace';

/** An item a hint can point at (a Draggable satisfies it). */
export interface HintItem {
  /** The drawn object (ring, bob, hand start, dim). */
  readonly object?: unknown;
  /** Subscribes to lift changes (true before onLift, false after drop/cancel); returns the unsubscribe. */
  onLiftChange?(fn: (lifted: boolean) => void): () => void;
  /** True while the item is held. */
  isDragging?(): boolean;
}

/** What the hint system needs to demonstrate one step of a question. `correct[0]` is the hinted item. */
export interface HintStep {
  readonly correct: readonly HintItem[];
  readonly distractors: readonly HintItem[];
  readonly target: DropTarget | null;
  readonly action: HintAction;
  /** The trace route; Story 4.1: a getter is resolved when each hand demo starts (the stretch ahead of the kart). */
  readonly path?: readonly Point[] | (() => readonly Point[]);
  /**
   * Story 3.5 (optional): the level-2 ring and bob go on this item (e.g. the correct shadow) while the
   * hand still demonstrates `correct[0]` → `target`. Absent: the ring is on `correct[0]`.
   */
  readonly focus?: HintItem;
}

/** Story 4.1: the step's trace route now (a getter is called). */
export function resolvePath(step: Pick<HintStep, 'path'>): readonly Point[] | undefined {
  return typeof step.path === 'function' ? step.path() : step.path;
}

/** The item the level-2 ring and bob go on: `focus` when set, else `correct[0]` (Story 3.5). */
export function ringItem(step: HintStep | null | undefined): HintItem | undefined {
  return step ? (step.focus ?? step.correct[0]) : undefined;
}

export interface HintQuestion {
  readonly promptLineId: string;
  readonly retryLineId: string;
  readonly step: HintStep;
  /**
   * Story 5.7 (optional): a line chained before the first playing of the prompt under one token (the
   * parent invitation). Never part of a replay, a step prompt or the stored Speaker prompt.
   */
  readonly leadLineId?: string;
}

export interface StepLines {
  readonly promptLineId?: string;
  readonly retryLineId?: string;
}

/** What the machine draws (core/hint-visuals in the adapter). */
export interface HintVisualsPort {
  /** Ring + bob on `item` (replacing any previous one); `undefined` removes them. */
  ring(item: HintItem | undefined): void;
  /** One hand demonstration of `step`. */
  hand(step: HintStep): void;
  /** Removes a running hand demo. */
  clearHand(): void;
  /** Level 4 fade of a distractor (`on`) or its restore to alpha 1. */
  dim(item: HintItem, on: boolean): void;
}

export interface HintPorts {
  readonly audio: {
    say(id: string): number;
    setPrompt(id: string): void;
    /** Restarts the prompt from the start with a new token (the Speaker); falls back to `say`. */
    replayPrompt?(): number | undefined;
    /** Story 5.3: fades the awaited line out when the question is done (the child already answered). */
    fadeOut?(token: number): void;
    /** Story 5.7: several lines back to back under one token (the lead + the prompt); without it the lead is dropped. */
    sayChain?(ids: readonly string[]): number;
  };
  readonly guard: {
    setPickable(item: object, on: boolean): void;
    setSnapScale(target: object, k: number): void;
    isDragging(): boolean;
  };
  readonly visuals: HintVisualsPort;
  emitLevel(level: HintLevel): void;
}

/** The timings the machine uses (defaults from Tokens.Timing / Tokens.ui). */
export interface HintTimings {
  readonly level2IdleMs: number;
  readonly level3ExtraIdleMs: number;
  readonly handLoopMs: number;
  readonly voiceRepeatMs: number;
  readonly voiceGapMs: number;
  readonly snapScale: number;
}

export function defaultHintTimings(): HintTimings {
  const t = Tokens.Timing;
  return {
    level2IdleMs: t.hintLevel2IdleMs,
    level3ExtraIdleMs: t.hintLevel3ExtraIdleMs,
    handLoopMs: t.hintHandLoopMs,
    voiceRepeatMs: t.hintVoiceRepeatMs,
    voiceGapMs: t.voiceRetryMinGapMs,
    snapScale: Tokens.ui.hintSnapScale,
  };
}

const MAX_LEVEL = 4;
const RING_LEVEL = 2;
const HAND_LEVEL = 3;

export class HintMachine {
  private readonly ports: HintPorts;
  private readonly t: HintTimings;
  private question: HintQuestion | undefined;
  private step: HintStep | null = null;
  private prompt = '';
  private retry = '';
  private lvl: HintLevel = 0;
  private wrongs = 0;
  /** Every tick. */
  private activeMs = 0;
  /** Quiet time since the later of the last idle restart and the last level change (escalation). */
  private levelIdleMs = 0;
  /** Quiet time since the last idle restart or hint-voice request (voice repeat at level ≥ 3). */
  private voiceIdleMs = 0;
  /** Active time since the last hand demo. */
  private handMs = 0;
  private handPending = false;
  private lastVoiceAt = Number.NEGATIVE_INFINITY;
  private awaited: number | undefined;
  private dimmed: HintItem[] = [];
  private snapped: object | undefined;

  constructor(ports: HintPorts, timings: HintTimings = defaultHintTimings()) {
    this.ports = ports;
    this.t = timings;
  }

  get level(): HintLevel {
    return this.lvl;
  }

  get isActive(): boolean {
    return this.question !== undefined;
  }

  /** The awaited hint-owned token (tests, adapter). */
  get awaitedToken(): number | undefined {
    return this.awaited;
  }

  beginQuestion(q: HintQuestion): void {
    if (this.question) this.questionDone();
    this.question = q;
    this.step = q.step;
    this.prompt = q.promptLineId;
    this.retry = q.retryLineId;
    this.playPrompt(false, q.leadLineId);
  }

  wrong(): void {
    if (!this.question) return;
    this.wrongs += 1;
    const spoke = this.hintVoice();
    const next = Math.max(this.lvl, Math.min(this.wrongs, MAX_LEVEL)) as HintLevel;
    if (next > this.lvl) this.setLevel(next);
    if (!spoke && this.awaited === undefined) this.restartIdle();
  }

  stepDone(next: HintStep | null, lines?: StepLines): void {
    if (!this.question) return;
    this.restoreDim();
    this.ports.visuals.clearHand();
    this.step = next;
    if (lines?.retryLineId !== undefined) this.retry = lines.retryLineId;
    if (this.lvl >= RING_LEVEL) this.ports.visuals.ring(ringItem(next));
    if (this.lvl >= MAX_LEVEL) this.applyDim();
    if (lines?.promptLineId !== undefined) {
      this.prompt = lines.promptLineId;
      this.playPrompt(false);
    } else if (this.awaited === undefined) {
      this.restartIdle();
    }
  }

  questionDone(): void {
    if (!this.question) return;
    // Story 5.3: the line still playing fades out — after the reset, so its synchronous speech:ended
    // finds no question to re-enter.
    const playing = this.awaited;
    this.restoreDim();
    this.ports.visuals.ring(undefined);
    this.ports.visuals.clearHand();
    const was = this.lvl;
    this.question = undefined;
    this.step = null;
    this.prompt = '';
    this.retry = '';
    this.lvl = 0;
    this.wrongs = 0;
    this.activeMs = 0;
    this.levelIdleMs = 0;
    this.voiceIdleMs = 0;
    this.handMs = 0;
    this.handPending = false;
    this.lastVoiceAt = Number.NEGATIVE_INFINITY;
    this.awaited = undefined;
    if (was > 0) this.ports.emitLevel(0);
    if (playing !== undefined) this.ports.audio.fadeOut?.(playing);
  }

  /** The Speaker: the current prompt from the start; keeps the level and the wrong count. */
  replayPrompt(): number | undefined {
    if (!this.question) return undefined;
    this.playPrompt(true);
    return this.awaited;
  }

  /** The awaited line ended — `completed` (played out) or cut (`false`); both start the quiet clocks. */
  speechEnded(token: number, completed = true): void {
    void completed; // Story 5.3: a cut prompt counts as ended, exactly like a completed one.
    if (!this.question || token !== this.awaited) return;
    this.awaited = undefined;
    this.restartIdle();
  }

  tick(ms: number): void {
    if (!this.question) return;
    this.activeMs += ms;
    this.handMs += ms;
    const quiet = this.awaited === undefined;
    if (quiet) {
      this.levelIdleMs += ms;
      this.voiceIdleMs += ms;
      if (this.lvl < RING_LEVEL && this.levelIdleMs >= this.t.level2IdleMs) this.setLevel(RING_LEVEL);
      else if (this.lvl === RING_LEVEL && this.levelIdleMs >= this.t.level3ExtraIdleMs) this.setLevel(HAND_LEVEL);
    }
    if (this.lvl < HAND_LEVEL) return;
    if (this.handPending || this.handMs >= this.t.handLoopMs) this.tryHand();
    if (this.awaited === undefined && this.voiceIdleMs >= this.t.voiceRepeatMs) this.hintVoice();
  }

  // --- internals ------------------------------------------------------------------------------------

  /** Plays the prompt (Story 5.7: after `lead` in one chain when given and `sayChain` exists). */
  private playPrompt(replay: boolean, lead?: string): void {
    const a = this.ports.audio;
    a.setPrompt(this.prompt);
    let token: number;
    if (replay && a.replayPrompt) token = a.replayPrompt() ?? a.say(this.prompt);
    else if (!replay && lead !== undefined && a.sayChain) token = a.sayChain([lead, this.prompt]);
    else token = a.say(this.prompt);
    this.awaited = token;
  }

  /** Requests the retry voice; returns whether it played (the rate limit drops it otherwise). */
  private hintVoice(): boolean {
    this.voiceIdleMs = 0;
    if (this.activeMs - this.lastVoiceAt < this.t.voiceGapMs) return false;
    this.lastVoiceAt = this.activeMs;
    this.awaited = this.ports.audio.say(this.retry);
    return true;
  }

  private restartIdle(): void {
    this.levelIdleMs = 0;
    this.voiceIdleMs = 0;
  }

  private setLevel(next: HintLevel): void {
    const prev = this.lvl;
    this.lvl = next;
    this.levelIdleMs = 0;
    this.ports.emitLevel(next);
    if (prev < RING_LEVEL && next >= RING_LEVEL) this.ports.visuals.ring(ringItem(this.step));
    if (prev < HAND_LEVEL && next >= HAND_LEVEL) {
      this.tryHand();
      this.hintVoice();
    }
    if (prev < MAX_LEVEL && next >= MAX_LEVEL) this.applyDim();
  }

  private tryHand(): void {
    if (this.ports.guard.isDragging()) {
      this.handPending = true;
      return;
    }
    this.handPending = false;
    this.handMs = 0;
    if (this.step) this.ports.visuals.hand(this.step);
  }

  private applyDim(): void {
    const step = this.step;
    if (!step) return;
    for (const d of step.distractors) {
      this.ports.guard.setPickable(d, false);
      this.ports.visuals.dim(d, true);
      this.dimmed.push(d);
    }
    if (step.target) {
      this.ports.guard.setSnapScale(step.target, this.t.snapScale);
      this.snapped = step.target;
    }
  }

  private restoreDim(): void {
    for (const d of this.dimmed) {
      this.ports.guard.setPickable(d, true);
      this.ports.visuals.dim(d, false);
    }
    this.dimmed = [];
    if (this.snapped) this.ports.guard.setSnapScale(this.snapped, 1);
    this.snapped = undefined;
  }
}
