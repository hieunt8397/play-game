// MiniGame contract (Story 1.7, AD-1). Every game scene extends MiniGameBase:
//   - the scene key is its GameId; `init(data)` stores the shell's `{ level, seed, resume? }`;
//   - `create()` sets the Hud to 'game' mode (Home shows), fades the scene in, turns `hud:home` into
//     `round:abandon` (or `round:leave` in free play) and then calls the subclass `build()`;
//   - `complete(outcome)` / `abandon()` go through RoundGuard: exactly one `round:complete` or
//     `round:abandon` per start. After `abandon` (or `round:leave`) the game is terminal (input
//     disabled, a second Home tap ignored).
// Story 1.8: `hint` (core/hint-director) is the only way a game reports questions and attempts; on
// Home the base ends the hint question and removes the scene's timed events before `round:abandon`,
// so no pending slide, next question or voice fires afterwards.
// Story 1.9 (AD-5, UX-DR72): ambient motion (`addAmbient`) plays only while no reason is held
// (`holdAmbient`); the base holds 'hint' while this game's hint level is ≥ 2, so the ring/bob/hand
// are the only prominent motion.
// Story 1.10: `hint` is a thin wrapper that also feeds a RoundTally (questions, first-try answers,
// the max hint level). A game ends its round with `scheduleFinish(ms)` (after its celebration) or
// `finishRound()`: `round:complete` with the tallied outcome, after the same cleanup as Home. A Home
// tap while the round is finishing completes it at once instead of abandoning it.
// Story 2.5: the base owns the snapshot envelope (core/snapshot): `snapshot()` = makeSnapshot of the
// level, seed, the tally of closed questions and the subclass `progress()`. `init` validates an incoming
// `resume` against its own level and seed (`resumeAt`, null = fresh). `build()` begins question
// `resumeAt.questionIndex` with the progress from its own `partial` and then calls `acceptResume()`, which
// adds the snapshot's closed questions to the tally. A game that rejects the resume (e.g. an out-of-range
// index) starts from question 1 without calling it, so the tally stays empty (nothing is counted twice).
// Story 5.3: the base hosts the celebration skip (core/skip-scene). A game opens a window with
// `skippable(expectedMs)` where a celebration longer than Timing.skipThresholdMs starts, reports the
// celebration's voice tokens with `skipVoice(token)` and wires its router with `attachSkip(router)`.
// A tap then fast-forwards the scene clocks (never skipping a callback, so persistence and
// `round:complete` stay as without a skip). The window closes at the next `hint.beginQuestion` and in
// `cleanup` (the terminal event), so no hint question ever runs on a scaled clock.
// Story 5.4: `attachReactions(router)` adds the catch-all tap reaction (core/ui/tap-reactions) and
// `react(sprite)` registers a non-target sprite: a tap bounces it with "pụp" (ambient held meanwhile),
// empty background shows a light ripple. Both do nothing once inert or for a press that skipped.
// Story 5.7 (FR35): each start builds a ParentInvite (core/parent-invite) from content/parent-invite
// and its own rng (parentInviteSeed of the round seed). The round's first `hint.beginQuestion` takes
// `roundStartLine()` as the prompt's lead (chained before it under one token); `inviteParent()` is the
// free-play hook (touch-talk calls it at its start). A resumed start never invites; `cleanup` closes it.
// Story 5.8 (FR32): free play. `finishRound`/`complete` no longer end the scene: they close the hint
// question, end the skip window, forget the Speaker prompt, emit `round:complete` (RoundGuard
// `playing → free`) and call `onFreePlay()` once. In free play `inert` is true (every
// game's question handlers stop) and `freePlay` is true, but input stays enabled and the 5.4 tap
// reactions keep working; timed events are kept (pending game timers end in their own `inert` gates).
// Home in free play runs `cleanup` and emits `round:leave` (`free → done`, input off); Home while the
// round is finishing completes it and leaves in the same tick (no invite, no `onFreePlay`). FR30/FR31:
// `reactionSet()` lists the game's "correct" / "chose-other" reaction ids (default none) and
// `pickReaction(kind)` draws one (core/reactions, rng › reactionSeed of the round seed, never the same
// twice in a row).
// Seamless play (2026-10-21): free play no longer waits for Home. `Timing.nextRoundDelayMs` (scene clock)
// after `round:complete` the camera fades out (`Timing.sceneFadeMs`) and the base emits `round:next`
// (only while still in free play); Map restarts this scene in place with the next start data, and
// `create()` fades it back in. Home before that leaves as above (`cleanup` removes the pending timer;
// a fade already running ends without the emit). No free-play parent invitation any more (it would be
// cut); the round-start lead invitation is unchanged.
// Story 7.3: `startFreePlay()` is for a game with no round at all (the band): `round:complete` once with the empty
// tally, then free play WITHOUT `onFreePlay` or the next-round timer (no `round:next`); Home then leaves with
// `round:leave` (no resume snapshot; 2026-10-30: unless the game's `leaveSnapshot()` hands one, as the garden does for
// a half-grown plant).
// Story 7.4: `finishRoundAndStay()` is the per-game opt-out of seamless play (the bedtime game: its ending is the
// destination): `round:complete` once with the tallied outcome, then free play WITHOUT `onFreePlay` or the
// next-round timer (no `round:next`, ever); Home then leaves with `round:leave`. It reuses the same path as Home
// while finishing and `startFreePlay` (`enterFreePlay(…, stay = false)`); every other game is unchanged.
// Games never navigate (`scene.start/stop/…`) or load (`this.load`): Map owns both (ESLint enforces it).
import { Scene, type Tweens } from 'phaser';
import { PARENT_INVITE_ENABLED, PARENT_INVITE_LINES } from '../content/parent-invite';
import type { GameId, GameStartData, RoundOutcome, Snapshot, SnapshotPartials } from '../content/types';
import { audio } from '../core/audio-director';
import { bus } from '../core/bus';
import { createHint, type Hint } from '../core/hint-director';
import { setHudMode } from '../core/hud-mode';
import { fadeOutScene, revealScene } from '../core/motion';
import { RoundGuard } from '../core/round-guard';
import { RoundTally } from '../core/round-tally';
import type { TapRouter } from '../core/input/tap-router';
import type { Skip } from '../core/skip';
import { createSceneSkip } from '../core/skip-scene';
import { createParentInvite, type ParentInvite } from '../core/parent-invite';
import { createReactionPicker, NO_REACTIONS, type ReactionKind, type ReactionPicker, type ReactionSet } from '../core/reactions';
import { mulberry32, parentInviteSeed, reactionSeed } from '../core/rng';
import { makeSnapshot, readResume, type ResumeAt } from '../core/snapshot';
import { Tokens } from '../core/tokens';
import { attachTapReactions, type ReactSprite, type TapReactions } from '../core/ui/tap-reactions';

/** Ambient motion stops from this hint level (the ring and bob appear). */
const AMBIENT_HINT_LEVEL = 2;
/** Story 5.4: the ambient hold reason while a tap bounce runs. */
const HOLD_REACT = 'react';

export abstract class MiniGameBase<G extends GameId = GameId> extends Scene {
  readonly gameId: GameId;
  protected level = 0;
  protected seed = 0;
  /** The validated resume point of this start (Story 2.5); null = a fresh round. */
  protected resumeAt: ResumeAt | null = null;
  /** True once `acceptResume()` restored the snapshot's tally for this start. */
  private resumeAccepted = false;
  private guard: RoundGuard | undefined;
  /** The raw hint system of this start (created in `create`, before `build`). */
  private inner: Hint = createHint(undefined);
  private tally = new RoundTally();
  /** True between `scheduleFinish` (or `markFinishing`) and the terminal event: Home then completes the round. */
  private finishing = false;
  /** True once `scheduleFinish` set its timer. */
  private finishScheduled = false;
  /** The hint system of this start, tallied (Story 1.10). */
  protected readonly hint: Hint = this.talliedHint();
  private ambient = new Set<Tweens.Tween>();
  private holds = new Set<string>();
  /** Story 5.3: the celebration skip of this start (created in `create`). */
  private skip: Skip | undefined;
  /** Story 5.4: the current press started a skip (set by the router's onAnyTap, before any onPress). */
  private pressSkipped = false;
  /** Story 5.4: the tap reactions of this start (`attachReactions`). */
  private reactions: TapReactions | undefined;
  /** Story 5.4: the latest bounce; only its timer releases the 'react' hold. */
  private reactSeq = 0;
  /** Story 5.7: the parent invitation of this start (created in `create`, before `build`). */
  private parentInvite: ParentInvite | undefined;
  /** Story 5.8: the reaction picker of this start (created in `create`, before `build`). */
  private reactionPicker: ReactionPicker | undefined;
  /** Story 6.1: the reaction rng of this start (shared by the picker and `reactionRoll`). */
  private reactionRand: () => number = mulberry32(reactionSeed(0));
  /** prefers-reduced-motion of this start (a game reads it in `build`, before `attachReactions`). */
  protected reduced = false;

  constructor(gameId: GameId) {
    super(gameId);
    this.gameId = gameId;
  }

  init(data: Partial<GameStartData> = {}): void {
    this.level = data.level ?? 0;
    this.seed = data.seed ?? 0;
    // Story 2.5: only a resume that matches this start's level and seed is kept (readResume warns otherwise).
    this.resumeAt = data.resume ? readResume(data.resume, { level: this.level, seed: this.seed }) : null;
  }

  create(): void {
    this.guard = new RoundGuard(this.gameId, bus, () => {
      this.input.enabled = false;
    });
    this.input.enabled = true;
    this.ambient = new Set();
    this.holds = new Set();
    this.tally = new RoundTally();
    this.resumeAccepted = false;
    this.finishing = false;
    this.finishScheduled = false;
    this.inner = this.createHintSystem();
    this.skip = createSceneSkip(this);
    this.pressSkipped = false;
    this.reactions = undefined;
    this.parentInvite = createParentInvite({
      enabled: PARENT_INVITE_ENABLED,
      lines: PARENT_INVITE_LINES[this.gameId] ?? [],
      rand: mulberry32(parentInviteSeed(this.seed)),
      chance: Tokens.ui.parentInviteChance,
      resumed: this.resumeAt !== null,
    });
    this.reactionRand = mulberry32(reactionSeed(this.seed));
    this.reactionPicker = createReactionPicker(this.reactionSet(), this.reactionRand);
    setHudMode('game');
    const scoped = bus.scoped(this);
    scoped.on('hud:home', () => {
      if (this.freePlay) this.leave();
      else if (this.finishing) {
        // Story 5.8: complete and leave in the same tick (straight back to the island).
        this.enterFreePlay(this.tally.outcome(this.gameId), false);
        this.leave();
      } else this.abandon();
    });
    scoped.on('hint:level', ({ gameId, level }) => {
      if (gameId !== this.gameId) return;
      this.tally.level(level);
      this.holdAmbient('hint', level >= AMBIENT_HINT_LEVEL);
    });
    this.build();
    void revealScene(this);
  }

  /** True once the round no longer plays questions: free play (Story 5.8) or after the start's last event. */
  protected get inert(): boolean {
    return this.guard?.inert ?? false;
  }

  /** Story 5.8: true between `round:complete` and `round:leave` (the finished game stays on screen). */
  protected get freePlay(): boolean {
    return this.guard?.freePlay ?? false;
  }

  /** True after the start's last event (`round:abandon` or `round:leave`). */
  private get terminal(): boolean {
    return this.guard?.terminal ?? false;
  }

  /** Story 5.8: the game's free-play rules start (called once, on entering free play). Default: none. */
  protected onFreePlay(): void {}

  /** Story 5.8 (FR30/FR31): the game's reaction ids; read once per start in `create`. Default: none. */
  protected reactionSet(): ReactionSet {
    return NO_REACTIONS;
  }

  /** Story 5.8: the next reaction id of `kind` (never the previous one of that kind); `undefined` if none listed. */
  protected pickReaction(kind: ReactionKind): string | undefined {
    return this.reactionPicker?.pick(kind);
  }

  /** Story 6.1: one draw in [0, 1) from the reaction rng (a reaction's own chance; deterministic per seed). */
  protected reactionRoll(): number {
    return this.reactionRand();
  }

  /** Registers an ambient (idle) tween: it plays only while no hold reason is set. */
  protected addAmbient(tween: Tweens.Tween): Tweens.Tween {
    this.pruneAmbient();
    this.ambient.add(tween);
    if (this.holds.size > 0) tween.pause();
    return tween;
  }

  /** Holds (`on`) or releases one reason to stop the ambient tweens ('hint', 'celebrate', …). */
  protected holdAmbient(reason: string, on: boolean): void {
    const was = this.holds.size > 0;
    if (on) this.holds.add(reason);
    else this.holds.delete(reason);
    const now = this.holds.size > 0;
    if (was === now) return;
    this.pruneAmbient();
    for (const t of this.ambient) {
      if (now) t.pause();
      else t.resume();
    }
  }

  private pruneAmbient(): void {
    for (const t of this.ambient) if (t.isDestroyed()) this.ambient.delete(t);
  }

  /** Story 5.3: a celebration of about `expectedMs` starts; a tap after Timing.skipArmMs fast-forwards it (≤ threshold: not skippable). */
  protected skippable(expectedMs: number): void {
    this.skip?.begin(expectedMs);
  }

  /** Story 5.3: a voice token said inside the skip window (cut when the child skips). Call after storing the token. */
  protected skipVoice(token: number): void {
    this.skip?.voice(token);
  }

  /** Story 5.3: every tap on `router` may skip; a previous `onAnyTap` handler still runs after it. */
  protected attachSkip(router: TapRouter): void {
    const previous = router.onAnyTap;
    router.onAnyTap = (p) => {
      this.pressSkipped = this.skip?.tap() ?? false;
      previous?.(p);
    };
  }

  /**
   * Story 5.4: a tap no router target wants reacts: a registered sprite (`react`) bounces with "pụp",
   * empty background shows a light ripple (≤ 1 Hz, silent). Call once, after `attachSkip`.
   */
  protected attachReactions(router: TapRouter): void {
    this.reactions?.destroy();
    this.reactions = attachTapReactions(this, router, {
      reduced: this.reduced,
      // A press that started a skip, or any press while a fast-forward runs, does not react.
      // Story 5.8: free play keeps reacting; only the start's last event stops it.
      blocked: () => this.terminal || this.pressSkipped || (this.skip?.skipping ?? false),
      onBounce: (ms) => {
        const seq = ++this.reactSeq;
        this.holdAmbient(HOLD_REACT, true);
        this.time.delayedCall(ms, () => {
          if (seq === this.reactSeq) this.holdAmbient(HOLD_REACT, false);
        });
      },
    });
  }

  /** Story 5.4: registers a non-target sprite that bounces when tapped; returns its removal function. */
  protected react(sprite: ReactSprite): () => void {
    return this.reactions?.add(sprite) ?? (() => undefined);
  }

  /** Story 5.4: true while `reason` holds the ambient tweens (a game's own celebration, …). */
  protected holding(reason: string): boolean {
    return this.holds.has(reason);
  }

  /** Draws the game. */
  protected abstract build(): void;

  /**
   * The game's resumable state (Story 2.5): the open question's index and the game's own partial
   * progress on it. The base wraps it in the snapshot envelope.
   */
  protected abstract progress(): { questionIndex: number; partial: SnapshotPartials[G] };

  /**
   * Story 2.5: the game resumed at `resumeAt.questionIndex`, so the questions closed before Home count
   * towards this round's outcome. Called by `build()` only when it accepts the resume; at most once per start.
   */
  protected acceptResume(): void {
    if (!this.resumeAt || this.resumeAccepted) return;
    this.resumeAccepted = true;
    this.tally.restore(this.resumeAt.tally);
  }

  /** The resume snapshot of the current state (Map keeps it on `round:abandon`, Story 2.5). */
  snapshot(): Snapshot<G> {
    return makeSnapshot<G>({ level: this.level, seed: this.seed, tally: this.tally.state(), progress: this.progress() });
  }

  /** The hint system this start uses (tests replace it). */
  protected createHintSystem(): Hint {
    return createHint(this);
  }

  /** `inner`, with every question and level also counted by the round tally. */
  private talliedHint(): Hint {
    const base = (): Hint => this.inner;
    return {
      beginQuestion: (q) => {
        this.skip?.end();
        this.tally.beginQuestion();
        // Story 5.7: only the round's first question may carry the parent invitation as its lead.
        const leadLineId = this.parentInvite?.roundStartLine();
        this.parentInvite?.questionBegan();
        base().beginQuestion(leadLineId === undefined ? q : { ...q, leadLineId });
      },
      stepDone: (next, lines) => base().stepDone(next, lines),
      wrong: () => base().wrong(),
      questionDone: () => {
        this.tally.questionDone();
        this.parentInvite?.questionClosed();
        base().questionDone();
      },
      replayPrompt: () => base().replayPrompt(),
      get level() {
        return base().level;
      },
    };
  }

  /**
   * Story 5.7: the free-play parent invitation — the Story 5.8 hook (touch-talk calls it at start). Says
   * the round's line once through the AudioDirector when the roll succeeded, no question is open and the
   * invite is unused (not taken as a round-start lead); returns its token, else `undefined`.
   */
  protected inviteParent(): number | undefined {
    if (this.terminal) return undefined;
    const line = this.parentInvite?.freePlayLine();
    return line === undefined ? undefined : audio.say(line);
  }

  /**
   * Story 5.7: a question began without a hint question (no step to hint, e.g. Race/Fishing): the
   * parent invitation can no longer lead a later prompt. Its `hint.questionDone` closes it as usual.
   */
  protected questionBegunWithoutHint(): void {
    this.parentInvite?.questionBegan();
  }

  /** The round's last question is answered: the round finishes after `ms` (scene clock); Home finishes it now. */
  protected scheduleFinish(ms: number): void {
    if (this.inert || this.finishScheduled) return;
    this.finishing = true;
    this.finishScheduled = true;
    this.time.delayedCall(ms, () => this.finishRound());
  }

  /**
   * Story 3.1: the round's last question is answered but its celebration runs longer (the pizza still
   * bakes and is eaten): from now on a Home tap completes the round instead of abandoning it. The game
   * still calls `scheduleFinish` after the celebration.
   */
  protected markFinishing(): void {
    if (this.inert) return;
    this.finishing = true;
  }

  /** Ends the round with the tallied outcome (`round:complete`, once) and enters free play (Story 5.8). */
  protected finishRound(): void {
    this.complete(this.tally.outcome(this.gameId));
  }

  /**
   * Story 7.3: a game with no round (the band) starts in free play: `round:complete` once with the empty tally,
   * no `onFreePlay`, no next round. Call it first in `build()` (it clears the Speaker prompt).
   */
  protected startFreePlay(): void {
    this.finishRoundAndStay();
  }

  /**
   * Story 7.4: the per-game opt-out of seamless play: ends the round (`round:complete`, once, the tallied outcome) and
   * stays on screen in free play with no `onFreePlay` and no next-round timer (never `round:next`). Home then leaves
   * (`round:leave`). For a game whose ending is the destination (the bedtime game).
   */
  protected finishRoundAndStay(): void {
    this.enterFreePlay(this.tally.outcome(this.gameId), false);
  }

  /** `round:complete` (once) and free play: the scene stays, the voice goes quiet, taps still react. */
  protected complete(outcome: Omit<RoundOutcome, 'gameId'>): void {
    this.enterFreePlay(outcome, true);
  }

  /**
   * Story 5.8: no hint question, no skip window, no Speaker replay; `round:complete`; then (unless Home is
   * leaving at once) the game's `onFreePlay` and the next round's timer (seamless play). Timed events are kept.
   */
  private enterFreePlay(outcome: Omit<RoundOutcome, 'gameId'>, stay: boolean): void {
    if (!this.guard || this.guard.inert) return;
    this.skip?.end();
    this.inner.questionDone();
    this.parentInvite?.questionClosed();
    audio.clearPrompt();
    this.finishing = false;
    this.finishScheduled = false;
    this.guard.complete({ ...outcome, gameId: this.gameId });
    if (!stay) return;
    this.onFreePlay();
    this.scheduleNextRound();
  }

  /**
   * Seamless play (2026-10-21): after `Timing.nextRoundDelayMs` on the scene clock, fade out and emit
   * `round:next` — only while this start is still in free play (Home cancels the timer in `cleanup`; a
   * fade already running ends without the emit). Map owns the restart.
   */
  private scheduleNextRound(): void {
    const guard = this.guard;
    if (!guard) return;
    const live = (): boolean => this.guard === guard && guard.freePlay;
    this.time.delayedCall(Tokens.Timing.nextRoundDelayMs, () => {
      if (!live()) return;
      void fadeOutScene(this).then(() => {
        if (live()) bus.emit('round:next', { gameId: this.gameId });
      });
    });
  }

  /** Story 5.8: Home in free play — cleanup, then `round:leave` (once; input off) with `leaveSnapshot()` when it has one. */
  protected leave(): void {
    if (!this.guard?.freePlay) return;
    const snapshot = this.leaveSnapshot();
    this.cleanup();
    this.guard.leave(snapshot);
  }

  /**
   * Trồng cây (2026-10-30): a free-play game's resume point on Home (Map keeps it as for `round:abandon`, and the next
   * start resumes it). Default: none (every other free-play game leaves nothing to resume).
   */
  protected leaveSnapshot(): Snapshot<G> | undefined {
    return undefined;
  }

  protected abandon(): void {
    if (!this.guard || this.guard.inert) return;
    this.cleanup();
    this.guard.abandon(this.snapshot());
  }

  /** Before the start's last event: no hint question, no pending timed event. */
  private cleanup(): void {
    this.skip?.end();
    this.parentInvite?.close();
    this.inner.questionDone();
    this.time.removeAllEvents();
    this.finishing = false;
    this.finishScheduled = false;
  }
}
