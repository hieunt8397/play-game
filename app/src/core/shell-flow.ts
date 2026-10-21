// Shell flow logic of Start and AudioUnlockOverlay (Story 1.2), kept free of Phaser so the
// I/O-matrix rows "First tap", "Double tap" and "Overlay" run in node tests. The scenes only bind
// these to their button and their ScenePlugin.
import type { AudioDirector } from './audio-director';

export interface StartTapDeps {
  audio: Pick<AudioDirector, 'sfx' | 'music' | 'unlock'>;
  /** `ProgressStore.init()` (idempotent; never rejects). */
  initStore: () => Promise<void>;
  /** Leaves Start (the scene disables the button and schedules the Map transition). */
  leave: () => void;
}

/**
 * The button-play tap handler: pop, music loop, audio unlock (all inside the user gesture),
 * `ProgressStore.init()`, then leave — once. Later taps are ignored. Leaving does not wait for
 * the unlock, so a stalled Phaser unlock can never strand the child on Start.
 */
export function createStartTap(deps: StartTapDeps): () => void {
  let leaving = false;
  return () => {
    if (leaving) return;
    leaving = true;
    deps.audio.sfx('sfx.shell.pop');
    deps.audio.music('music.island');
    void deps.audio.unlock();
    // Story 5.2: the greeting moved to the island (core/map-guide), so Start says nothing.
    void deps.initStore();
    deps.leave();
  };
}

/** What the overlay controller needs from the overlay scene's ScenePlugin. */
export interface OverlayHost {
  /** Keys of the running scenes other than the overlay itself. */
  otherActiveKeys(): string[];
  pause(key: string): void;
  resume(key: string): void;
  /** Wake the overlay on top. */
  show(): void;
  /** Put the overlay back to sleep. */
  hide(): void;
}

export interface OverlayDeps {
  host: OverlayHost;
  /** `audio.unlock()`: true when the AudioContext runs again. */
  unlock: () => Promise<boolean>;
  /** Emits `audio:resumed` on the bus. */
  emitResumed: () => void;
}

/**
 * AudioUnlockOverlay bookkeeping (AR7): `cover()` pauses the running scenes and shows the overlay;
 * `tap()` unlocks audio and, only when the context runs again, resumes exactly the scenes it paused,
 * hides the overlay and emits `audio:resumed`. When audio is still suspended the overlay stays up.
 */
export class SuspendOverlayController {
  private readonly deps: OverlayDeps;
  private paused: string[] = [];
  private covering = false;
  private busy = false;

  constructor(deps: OverlayDeps) {
    this.deps = deps;
  }

  get isCovering(): boolean {
    return this.covering;
  }

  cover(): void {
    if (this.covering) return;
    this.covering = true;
    for (const key of this.deps.host.otherActiveKeys()) {
      this.deps.host.pause(key);
      this.paused.push(key);
    }
    this.deps.host.show();
  }

  async tap(): Promise<void> {
    if (!this.covering || this.busy) return;
    this.busy = true;
    try {
      if (!(await this.deps.unlock())) return;
      for (const key of this.paused.splice(0)) this.deps.host.resume(key);
      this.covering = false;
      this.deps.host.hide();
      this.deps.emitResumed();
    } finally {
      this.busy = false;
    }
  }
}
