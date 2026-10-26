// Giờ đi ngủ controller (Story 7.4), pure and Phaser-free: three bedtime steps (brush, lamp, blanket) in any order,
// then Shiba sleeps. Never a judged request, never a fail sound, never a score. Behind injected ports (audio, view) so
// every rule is node-testable; the scene clock drives `tick`.
// - A fresh start says the invitation ("Xoài ơi, mình đi ngủ nào.") chained before the first suggestion.
// - A tap on a step not done does it (the step is done at once, so it is idempotent and resumable):
//   - brush: the brush travels to Shiba's mouth and scrubs (foam, the brush sound, a giggle pose: `brush` sitting or
//     `lie-brush` lying), then goes back;
//   - lamp: a soft click, the lamp turns off and the room fades to the soft blue night (`nightFadeMs`, never a flash);
//   - blanket: the blanket spreads over Shiba, who lies down under it and yawns, then stays awake lying (until the
//     other steps are done).
//   While a step's reaction runs (`busy`) every tap is ignored (calm pace). When it ends, after `stepGapMs`, the glow
//   moves to the next suggested step (brush → lamp → blanket, the first not done) and its soft line is said (and kept
//   as the Speaker prompt). The order is never enforced.
// - A tap on a step already done: a small reaction only (foam puff, lamp wiggle, blanket tuck); no state change.
// - A tap on Shiba awake: a small happy nudge with a giggle.
// - The third step calls `onAllDone` at once (the scene completes the round: no new round follows). After its reaction:
//   "Chúc bạn ngủ ngon!", Shiba falls asleep (a yawn first unless the blanket was the last step), stars fade in at the
//   window, the lullaby starts, and every `snoreEveryMs` a soft "khò khò" with a floating "z" (the first at once).
//   A tap on the sleeping Shiba rolls it over (and back on the next tap) with a soft sigh.
// The snapshot partial is `{ done }` (the steps done, in the order done); a resume shows them done at once.
import { STEP_IDS, type BedtimeStep, type ShibaPose } from '../../content/games/bedtime.ts';
import { Tokens } from '../../core/tokens.ts';

export interface BedtimeAudio {
  sfx(id: string): void;
  /** Returns the utterance token. */
  say(id: string): number;
  /** Several lines back to back under one token (the invitation, then the first suggestion). */
  sayChain(ids: readonly string[]): number;
  setPrompt(id: string): void;
  /** The lullaby loop starts (fading in on the music channel). */
  startLullaby(): void;
}

export interface BedtimeView {
  /** The soft glow sits on `step` (null: no glow). */
  glow(step: BedtimeStep | null): void;
  /** Shiba changes pose over `ms` (0: at once). */
  pose(pose: ShibaPose, ms: number): void;
  /** The brush travels to Shiba's mouth (sitting or lying), scrubs with foam and goes back (Timing: move, scrub, move). */
  brush(at: 'sit' | 'lie'): void;
  /** The lamp turns on/off over `ms`. */
  lamp(on: boolean, ms: number): void;
  /** The room fades to the soft night over `ms` (0: at once). */
  night(ms: number): void;
  /** The blanket spreads (on) or stays folded (off) over `ms`. */
  blanket(on: boolean, ms: number): void;
  /** A done step's small reaction. */
  repeat(step: BedtimeStep): void;
  /** Awake Shiba's small happy nudge. */
  nudge(): void;
  /** The stars fade in at the window. */
  stars(): void;
  /** One "z" floats up from the sleeping head. */
  z(): void;
}

export interface BedtimeSounds {
  readonly scrub: string;
  readonly giggle: string;
  readonly click: string;
  readonly blanket: string;
  readonly yawn: string;
  readonly snore: string;
  readonly sigh: string;
}

export interface BedtimeTimings {
  readonly brushMoveMs: number;
  readonly scrubMs: number;
  readonly poseFadeMs: number;
  readonly lampMs: number;
  readonly nightFadeMs: number;
  readonly blanketMs: number;
  readonly yawnMs: number;
  readonly stepGapMs: number;
  readonly repeatMs: number;
  readonly snoreEveryMs: number;
  readonly rollMs: number;
  readonly maxDtMs: number;
}

export function defaultBedtimeTimings(): BedtimeTimings {
  const t = Tokens.Timing;
  return {
    brushMoveMs: t.bedtimeBrushMoveMs,
    scrubMs: t.bedtimeScrubMs,
    poseFadeMs: t.bedtimePoseFadeMs,
    lampMs: t.bedtimeLampMs,
    nightFadeMs: t.bedtimeNightFadeMs,
    blanketMs: t.bedtimeBlanketMs,
    yawnMs: t.bedtimeYawnMs,
    stepGapMs: t.bedtimeStepGapMs,
    repeatMs: t.bedtimeRepeatMs,
    snoreEveryMs: t.bedtimeSnoreEveryMs,
    rollMs: t.bedtimeRollMs,
    maxDtMs: t.bedtimeMaxTickMs,
  };
}

export interface BedtimeOptions {
  readonly stepLines: Readonly<Record<BedtimeStep, string>>;
  readonly goodnightLine: string;
  /** Said before the first suggestion of a start with no step done yet (review: an empty resume counts as fresh). */
  readonly inviteLine: string;
  readonly sounds: BedtimeSounds;
  /** The steps already done (a resume), in the order done. */
  readonly resume?: readonly BedtimeStep[] | null;
  readonly audio: BedtimeAudio;
  readonly view: BedtimeView;
  /** The third step was tapped: the round is complete (the scene ends it without a next round). */
  readonly onAllDone: () => void;
  readonly timings?: BedtimeTimings;
}

export type BedtimeTarget = BedtimeStep | 'shiba';

export interface BedtimeController {
  start(): void;
  /** A tap on a target; returns true when it did something (false: ignored while busy or stopped). */
  tap(target: BedtimeTarget): boolean;
  tick(dtMs: number): void;
  /** Home / shutdown: nothing more happens. */
  stop(): void;
  /** The steps done, in the order done. */
  readonly done: readonly BedtimeStep[];
  /** The step the glow suggests (undefined: none while busy or when all are done). */
  readonly suggested: BedtimeStep | undefined;
  readonly asleep: boolean;
  readonly busy: boolean;
}

/** The first step not done, in the suggested order (brush → lamp → blanket). */
export function nextSuggested(done: readonly BedtimeStep[]): BedtimeStep | undefined {
  return STEP_IDS.find((s) => !done.includes(s));
}

/** Shiba's resting pose for these steps done (lying once covered; asleep when all are done). */
export function restPose(done: readonly BedtimeStep[]): ShibaPose {
  if (done.length === STEP_IDS.length) return 'sleep';
  return done.includes('blanket') ? 'lie' : 'sit';
}

export function createBedtimeController(opts: BedtimeOptions): BedtimeController {
  const t = opts.timings ?? defaultBedtimeTimings();
  const { audio, view, sounds } = opts;
  const done: BedtimeStep[] = [...(opts.resume ?? [])];
  let now = 0;
  let busyUntil = 0;
  let stopped = false;
  let asleep = false;
  let rolled = false;
  let suggested: BedtimeStep | undefined;
  let nextSnore = Infinity;
  let queue: { at: number; fn: () => void }[] = [];

  const after = (ms: number, fn: () => void): void => {
    queue.push({ at: now + ms, fn });
    queue.sort((a, b) => a.at - b.at);
  };
  const isBusy = (): boolean => now < busyUntil;

  const suggest = (lead?: string): void => {
    suggested = nextSuggested(done);
    view.glow(suggested ?? null);
    if (suggested === undefined) return;
    const line = opts.stepLines[suggested];
    if (lead === undefined) audio.say(line);
    else audio.sayChain([lead, line]);
    audio.setPrompt(line);
  };

  const fallAsleep = (yawnFirst: boolean): void => {
    audio.say(opts.goodnightLine);
    view.stars();
    audio.startLullaby();
    const sleep = (): void => {
      view.pose('sleep', t.poseFadeMs);
      asleep = true;
      nextSnore = now + t.poseFadeMs;
      busyUntil = Math.max(busyUntil, now + t.poseFadeMs);
    };
    if (!yawnFirst) return sleep();
    view.pose('yawn', t.poseFadeMs);
    audio.sfx(sounds.yawn);
    busyUntil = Math.max(busyUntil, now + t.poseFadeMs + t.yawnMs + t.poseFadeMs);
    after(t.poseFadeMs + t.yawnMs, sleep);
  };

  /** After a step's reaction: the next suggestion, or the ending. */
  const settle = (ms: number, last: BedtimeStep): void => {
    busyUntil = now + ms;
    after(ms, () => {
      if (done.length === STEP_IDS.length) fallAsleep(last !== 'blanket');
      else after(t.stepGapMs, suggest);
    });
  };

  const doStep = (step: BedtimeStep): void => {
    done.push(step);
    suggested = undefined;
    view.glow(null);
    if (done.length === STEP_IDS.length) opts.onAllDone();
    const lying = done.includes('blanket');
    if (step === 'brush') {
      view.brush(lying ? 'lie' : 'sit');
      after(t.brushMoveMs, () => {
        audio.sfx(sounds.scrub);
        audio.sfx(sounds.giggle);
        view.pose(lying ? 'lie-brush' : 'brush', t.poseFadeMs);
      });
      after(t.brushMoveMs + t.scrubMs, () => view.pose(lying ? 'lie' : 'sit', t.poseFadeMs));
      settle(2 * t.brushMoveMs + t.scrubMs, step);
    } else if (step === 'lamp') {
      audio.sfx(sounds.click);
      view.lamp(false, t.lampMs);
      view.night(t.nightFadeMs);
      settle(t.nightFadeMs, step);
    } else {
      audio.sfx(sounds.blanket);
      view.blanket(true, t.blanketMs);
      view.pose('lie', t.blanketMs);
      after(t.blanketMs, () => {
        view.pose('yawn', t.poseFadeMs);
        audio.sfx(sounds.yawn);
      });
      const all = done.length === STEP_IDS.length;
      // The yawn ends in the ending's sleep (all done) or back in the awake lying pose.
      if (!all) after(t.blanketMs + t.poseFadeMs + t.yawnMs, () => view.pose('lie', t.poseFadeMs));
      settle(t.blanketMs + t.poseFadeMs + t.yawnMs + (all ? 0 : t.poseFadeMs), step);
    }
  };

  return {
    start() {
      if (stopped) return;
      view.pose(restPose(done), 0);
      view.blanket(done.includes('blanket'), 0);
      view.lamp(!done.includes('lamp'), 0);
      if (done.includes('lamp')) view.night(0);
      suggest(opts.resume?.length ? undefined : opts.inviteLine);
    },
    tap(target) {
      if (stopped || isBusy()) return false;
      if (target === 'shiba') {
        if (asleep) {
          rolled = !rolled;
          view.pose(rolled ? 'roll' : 'sleep', t.rollMs);
          audio.sfx(sounds.sigh);
          busyUntil = now + t.rollMs;
        } else {
          view.nudge();
          audio.sfx(sounds.giggle);
          busyUntil = now + t.repeatMs;
        }
        return true;
      }
      if (done.includes(target)) {
        view.repeat(target);
        if (target === 'blanket') audio.sfx(sounds.blanket);
        busyUntil = now + t.repeatMs;
        return true;
      }
      doStep(target);
      return true;
    },
    tick(dtMs) {
      if (stopped) return;
      now += Math.min(Math.max(dtMs, 0), t.maxDtMs);
      while (queue.length > 0 && queue[0]!.at <= now && !stopped) {
        const e = queue.shift()!;
        e.fn();
      }
      if (asleep && now >= nextSnore && !stopped) {
        audio.sfx(sounds.snore);
        view.z();
        nextSnore = now + t.snoreEveryMs;
      }
    },
    stop() {
      stopped = true;
      queue = [];
      nextSnore = Infinity;
    },
    get done() {
      return done;
    },
    get suggested() {
      return suggested;
    },
    get asleep() {
      return asleep;
    },
    get busy() {
      return isBusy();
    },
  };
}

/** Validates a resume point: `{ done }` of distinct known steps, not all of them (a finished bedtime never resumes). */
export function resumeBedtime(resumeAt: { readonly questionIndex: number; readonly partial?: unknown } | null): BedtimeStep[] | null {
  if (!resumeAt || resumeAt.questionIndex !== 0) return null;
  const p = resumeAt.partial;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return null;
  const { done } = p as { done?: unknown };
  if (!Array.isArray(done) || done.length >= STEP_IDS.length) return null;
  if (!done.every((s): s is BedtimeStep => typeof s === 'string' && (STEP_IDS as readonly string[]).includes(s))) return null;
  if (new Set(done).size !== done.length) return null;
  return [...done];
}
