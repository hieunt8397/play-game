// Ban nhạc controller (Story 7.3), pure and Phaser-free: five instruments, no round, no score, no wrong note.
// Behind injected ports (audio, view) so every rule is node-testable; the scene clock drives `tick`.
// - tap(i): instrument i plays the next note of its pattern (content NOTE_PATTERN over its five notes of the shared
//   pentatonic scale) at once and bounces; nothing queues (a fast tap retriggers: the next note, now). Several
//   instruments may be tapped at once (multi-touch); the audio port caps the voices. While the beat runs, a tap
//   within `beatWindowMs` of a beat also sparkles (never counted).
// - tick(dt): after `idleBeatMs` without a tap, the soft beat starts (its loop's first beat at that moment) and
//   one instrument bobs every `bobEveryBeats` beats, round robin (never under reduced motion, never while a tap
//   bounce still runs: one prominent motion at a time). Taps keep the beat going (play along); after `quietBeats`
//   beats without a tap it stops, and starts again only after a new tap and another idle time (it never nags).
// - stop(): Home — the beat stops; no more notes, bobs or sparkles.
// - Review: the beat's phase follows the loop itself. While the loop plays, every tick and tap re-anchors the beat
//   clock to its playback position (`beatPositionMs`, modulo the loop), so a dropped or capped frame never leaves
//   the sparkle window drifting; the scene clock only fills in while no position is known (locked audio).
// The band never ends a round: the scene starts it in free play (MiniGameBase.startFreePlay); nothing is resumed.
import { BEAT_LOOP_BEATS, type BandInstrument } from '../../content/games/band.ts';
import { Tokens } from '../../core/tokens.ts';

export interface BandAudio {
  /** Plays a note at once (a capped voice pool: the oldest note is cut past the cap). */
  note(id: string): void;
  /** The beat loop starts (its first beat now). */
  startBeat(): void;
  stopBeat(): void;
  /** The beat loop's playback position (ms into the loop) while it plays, else undefined. */
  beatPositionMs?(): number | undefined;
  /** Returns the utterance token. */
  say(id: string): number;
  setPrompt(id: string): void;
}

export interface BandView {
  /** Instrument `i` bounces (it was tapped). */
  bounce(i: number): void;
  /** Instrument `i` bobs gently to the beat. */
  bob(i: number): void;
  /** A small sparkle over instrument `i` (a tap near the beat). */
  sparkle(i: number): void;
}

export interface BandTimings {
  readonly idleBeatMs: number;
  readonly beatMs: number;
  readonly beatWindowMs: number;
  readonly quietBeats: number;
  readonly bobEveryBeats: number;
  /** A bob waits while a tap bounce still runs (one prominent motion). */
  readonly bounceMs: number;
  readonly maxDtMs: number;
  /** Beats per loop of the beat music (its position wraps every loopBeats · beatMs). */
  readonly loopBeats: number;
}

export function defaultBandTimings(): BandTimings {
  const t = Tokens.Timing;
  return {
    idleBeatMs: t.bandIdleBeatMs,
    beatMs: t.bandBeatMs,
    beatWindowMs: t.bandBeatWindowMs,
    quietBeats: Tokens.ui.bandQuietBeats,
    bobEveryBeats: Tokens.ui.bandBobEveryBeats,
    bounceMs: t.bandBounceMs,
    maxDtMs: t.bandMaxTickMs,
    loopBeats: BEAT_LOOP_BEATS,
  };
}

export interface BandOptions {
  readonly instruments: readonly BandInstrument[];
  /** Note indices each tap steps through (cycling). */
  readonly pattern: readonly number[];
  /** The invitation said as the game opens (and kept as the Speaker prompt). */
  readonly inviteLine: string;
  /** prefers-reduced-motion: no bob (the beat sound only). */
  readonly reduced: boolean;
  readonly audio: BandAudio;
  readonly view: BandView;
  readonly timings?: Partial<BandTimings>;
}

export interface BandController {
  /** True while the soft beat plays. */
  readonly beating: boolean;
  /** The pattern position of instrument `i` (its next note is `pattern[step]`). */
  step(i: number): number;
  start(): void;
  tap(i: number): void;
  tick(dtMs: number): void;
  /** Home: the beat stops and nothing plays any more. */
  stop(): void;
}

/** The note id instrument `inst` plays at pattern position `step`. */
export function noteAt(inst: BandInstrument, pattern: readonly number[], step: number): string {
  const idx = pattern[step % pattern.length]!;
  return inst.noteSfx[Math.max(0, Math.min(inst.noteSfx.length - 1, idx))]!;
}

export function createBandController(opts: BandOptions): BandController {
  const t = { ...defaultBandTimings(), ...opts.timings };
  const { audio, view, instruments, pattern } = opts;
  if (instruments.length === 0 || pattern.length === 0) throw new Error('band: no instruments or no pattern');
  const steps = instruments.map(() => 0);
  let beating = false;
  /** The idle beat may start (false after it stopped by itself, until the next tap). */
  let armed = true;
  let idleMs = 0;
  /** Time since the beat started; beat k sounds at k·beatMs. */
  let beatClock = 0;
  let beatIndex = 0;
  /** Beats since the last tap (or since the beat started). */
  let quiet = 0;
  let sinceTap = Infinity;
  let bobTurn = 0;
  let stopped = false;

  const onBeat = (k: number): void => {
    if (opts.reduced || k % Math.max(1, t.bobEveryBeats) !== 0 || sinceTap < t.bounceMs) return;
    view.bob(bobTurn);
    bobTurn = (bobTurn + 1) % instruments.length;
  };

  /** Re-anchors the beat clock to the loop's playback position (the nearest loop to the scene clock's estimate). */
  const sync = (): void => {
    if (!beating) return;
    const pos = audio.beatPositionMs?.();
    if (pos === undefined || !Number.isFinite(pos)) return;
    const loop = t.beatMs * Math.max(1, t.loopBeats);
    const p = ((pos % loop) + loop) % loop;
    beatClock = Math.max(0, Math.round((beatClock - p) / loop) * loop + p);
  };

  const stopBeat = (): void => {
    if (!beating) return;
    beating = false;
    audio.stopBeat();
  };

  return {
    get beating() {
      return beating;
    },
    step(i) {
      return steps[i] ?? 0;
    },
    start() {
      audio.setPrompt(opts.inviteLine);
      audio.say(opts.inviteLine);
    },
    tap(i) {
      if (stopped || i < 0 || i >= instruments.length) return;
      audio.note(noteAt(instruments[i]!, pattern, steps[i]!));
      steps[i] = (steps[i]! + 1) % pattern.length;
      view.bounce(i);
      sinceTap = 0;
      idleMs = 0;
      armed = true;
      if (!beating) return;
      quiet = 0;
      sync();
      const phase = beatClock % t.beatMs;
      if (Math.min(phase, t.beatMs - phase) <= t.beatWindowMs) view.sparkle(i);
    },
    tick(dtMs) {
      if (stopped) return;
      const dt = Math.max(0, Math.min(t.maxDtMs, Number.isFinite(dtMs) ? dtMs : 0));
      sinceTap += dt;
      if (!beating) {
        if (!armed) return;
        idleMs += dt;
        if (idleMs < t.idleBeatMs) return;
        beating = true;
        beatClock = 0;
        beatIndex = 0;
        quiet = 0;
        audio.startBeat();
        onBeat(0);
        return;
      }
      beatClock += dt;
      sync();
      // Every beat crossed counts; only the last one may bob (a jump never starts two motions at once).
      let crossed = false;
      while (beatClock >= (beatIndex + 1) * t.beatMs) {
        beatIndex += 1;
        quiet += 1;
        crossed = true;
        if (quiet >= t.quietBeats) {
          stopBeat();
          armed = false;
          idleMs = 0;
          return;
        }
      }
      if (crossed) onBeat(beatIndex);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      stopBeat();
    },
  };
}
