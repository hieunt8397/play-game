// Story 5.3: the thin Phaser adapter of core/skip for one scene. A skip scales the scene's tween
// manager and clock (`timeScale`), so every remaining tween, delayed call and its callback still run
// in order, only faster. Phaser does not scale camera effects (pan / zoom / fade), so while skipping
// each running main-camera effect is driven to its end state (its own final `update`, which sets the
// end value and fires its complete event) — at once and on every scene update until the skip ends.
// SFX are held through AudioDirector and the window's voice tokens are cut with `audio.stop`.
// The window closes (`end()`) on the scene's SHUTDOWN.
import { audio as audioDirector } from './audio-director';
import { createSkip, type Skip } from './skip';

/** Slice of a Phaser camera effect (Pan / Zoom / Fade). */
export interface CameraEffectLike {
  readonly isRunning: boolean;
  readonly duration: number;
  update(time: number, delta: number): void;
  effectComplete(): void;
}

/** Slice of `Phaser.Scene` the adapter uses. */
export interface SkipSceneLike {
  readonly tweens: { timeScale: number };
  readonly time: { timeScale: number; readonly now: number };
  readonly events: {
    on(event: string, fn: () => void): unknown;
    off(event: string, fn: () => void): unknown;
    once(event: string, fn: () => void): unknown;
  };
  readonly cameras?: {
    readonly main?: {
      readonly panEffect?: CameraEffectLike;
      readonly zoomEffect?: CameraEffectLike;
      readonly fadeEffect?: CameraEffectLike;
    };
  };
}

export interface SkipAudio {
  holdSfx(on: boolean): void;
  stop(token: number): void;
}

/** `Phaser.Scenes.Events.SHUTDOWN` / `UPDATE`. */
const SHUTDOWN = 'shutdown';
const UPDATE = 'update';
const NORMAL_SCALE = 1;

/** Drives every running main-camera effect of `scene` to its end state. */
export function finishCameraEffects(scene: SkipSceneLike): void {
  const cam = scene.cameras?.main;
  if (!cam) return;
  for (const effect of [cam.panEffect, cam.zoomEffect, cam.fadeEffect]) {
    if (!effect?.isRunning) continue;
    // A full-duration step lands on the end value and completes the effect (fires its event).
    effect.update(scene.time.now, effect.duration);
    if (effect.isRunning) effect.effectComplete();
  }
}

export function createSceneSkip(scene: SkipSceneLike, audio: SkipAudio = audioDirector): Skip {
  const finish = (): void => finishCameraEffects(scene);
  let following = false;
  const skip = createSkip(
    {
      setTimeScale: (k) => {
        scene.tweens.timeScale = k;
        scene.time.timeScale = k;
        if (k > NORMAL_SCALE) {
          finish();
          if (!following) scene.events.on(UPDATE, finish);
          following = true;
        } else if (following) {
          scene.events.off(UPDATE, finish);
          following = false;
        }
      },
      holdSfx: (on) => audio.holdSfx(on),
      stopVoice: (token) => audio.stop(token),
    },
    () => scene.time.now,
  );
  scene.events.once(SHUTDOWN, () => skip.end());
  return skip;
}
