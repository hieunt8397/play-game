// Skippable celebrations (Story 5.3, NFR15), pure. A game (or the Map's post-round chain) opens a
// window with `begin(expectedMs)` for a sequence it is about to run; a sequence of at most
// Timing.skipThresholdMs opens nothing. Inside a window a `tap()` that arrives at least
// Timing.skipArmMs after `begin` (so the answering gesture itself never skips) fast-forwards:
//   - the scene clocks (tweens + time) run Timing.skipTimeScale× faster, so every remaining step and
//     callback still runs in order — persistence and `round:complete` behave exactly as unskipped;
//   - SFX are held (dropped), so the fast-forward makes no SFX burst;
//   - every voice token the window tracked (`voice(token)`) is stopped, and later ones at once.
// `end()` closes the window (next question, terminal event, chain end, scene shutdown): time scale 1,
// SFX released, tokens forgotten. It is idempotent and safe to call from inside `tap()`'s voice stops.
import { Tokens } from './tokens';

export interface SkipPorts {
  /** Sets the scene's tween + clock time scale (1 = normal). */
  setTimeScale(k: number): void;
  /** Holds (drops) SFX while `on`. */
  holdSfx(on: boolean): void;
  /** Cuts the voice utterance with this token. */
  stopVoice(token: number): void;
}

export interface SkipTimings {
  readonly thresholdMs: number;
  readonly armMs: number;
  readonly timeScale: number;
}

export function defaultSkipTimings(): SkipTimings {
  const t = Tokens.Timing;
  return { thresholdMs: t.skipThresholdMs, armMs: t.skipArmMs, timeScale: t.skipTimeScale };
}

export interface Skip {
  /** Opens a window for a sequence of about `expectedMs` (nothing when ≤ the threshold). */
  begin(expectedMs: number): void;
  /** A voice token said inside the window (stopped on skip; at once while skipping). */
  voice(token: number): void;
  /** A tap anywhere: skips when a window is open and armed; true when this tap started the skip. */
  tap(): boolean;
  /** Closes the window; restores time scale 1 and releases SFX. Idempotent. */
  end(): void;
  readonly skipping: boolean;
  /** A window is open (skipping or not). */
  readonly open: boolean;
}

const NORMAL_SCALE = 1;

export function createSkip(ports: SkipPorts, now: () => number, timings: SkipTimings = defaultSkipTimings()): Skip {
  let openedAt: number | undefined;
  let skipping = false;
  let tokens = new Set<number>();

  const end = (): void => {
    const wasActive = openedAt !== undefined || skipping;
    openedAt = undefined;
    tokens = new Set();
    if (!wasActive) return;
    const wasSkipping = skipping;
    skipping = false;
    if (wasSkipping) {
      ports.setTimeScale(NORMAL_SCALE);
      ports.holdSfx(false);
    }
  };

  return {
    begin(expectedMs) {
      // A new sequence always closes the older window, even when it is too short to open its own.
      end();
      if (expectedMs <= timings.thresholdMs) return;
      openedAt = now();
    },
    voice(token) {
      if (openedAt === undefined) return;
      if (skipping) {
        ports.stopVoice(token);
        return;
      }
      tokens.add(token);
    },
    tap() {
      if (openedAt === undefined || skipping) return false;
      if (now() - openedAt < timings.armMs) return false;
      // State first: a stopVoice handler may reenter (beginQuestion → end()).
      skipping = true;
      const snapshot = [...tokens];
      tokens = new Set();
      ports.setTimeScale(timings.timeScale);
      ports.holdSfx(true);
      for (const token of snapshot) ports.stopVoice(token);
      return true;
    },
    end,
    get skipping() {
      return skipping;
    },
    get open() {
      return openedAt !== undefined;
    },
  };
}
