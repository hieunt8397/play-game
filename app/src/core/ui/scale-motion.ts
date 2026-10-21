// Scale motions of Map objects (Story 1.5): tap bounce, ambient move and invitation bob. One motion
// per object at a time: a new bounce or bob stops the old tween and resets the scale to its base
// first, so a tap on a moving object restarts its bounce from 1×base. Amplitudes are passed already
// reduced (core/reduced-motion › amplitude).
import type { Scene, Tweens } from 'phaser';

export interface ScalableLike {
  scale: number;
  setScale(x: number, y?: number): unknown;
}

const motions = new WeakMap<ScalableLike, Tweens.Tween>();

/** True while a motion tween runs on `target`. */
export function isMoving(target: ScalableLike): boolean {
  const t = motions.get(target);
  return t !== undefined && t.isPlaying();
}

/** Stops any motion on `target` and resets it to `base` scale. */
export function stopMotion(target: ScalableLike, base: number): void {
  motions.get(target)?.stop();
  motions.delete(target);
  target.setScale(base);
}

/** base → base×peak → base over `durationMs` (yoyo, once). Restarts a running motion. */
export function bounce(scene: Scene, target: ScalableLike, base: number, peak: number, durationMs: number): void {
  stopMotion(target, base);
  const tween = scene.tweens.add({
    targets: target,
    scale: base * peak,
    duration: durationMs / 2,
    ease: 'Sine.easeOut',
    yoyo: true,
    onComplete: () => {
      if (motions.get(target) === tween) motions.delete(target);
      target.setScale(base);
    },
  });
  motions.set(target, tween);
}

/**
 * Endless bob between base×from and base×to; one half cycle (from → to) takes `halfCycleMs`.
 * Starts at base (sine around the mid scale), so it never jumps.
 */
export function bob(scene: Scene, target: ScalableLike, base: number, from: number, to: number, halfCycleMs: number): void {
  stopMotion(target, base);
  const mid = (from + to) / 2;
  const amp = (to - from) / 2;
  const tween = scene.tweens.addCounter({
    from: 0,
    to: 2 * Math.PI,
    duration: 2 * halfCycleMs,
    repeat: -1,
    onUpdate: (t) => target.setScale(base * (mid + amp * Math.sin(t.getValue() ?? 0))),
  });
  motions.set(target, tween);
}
