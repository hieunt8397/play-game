// Shell-owned scene transitions (Story 1.7). Normal: the Map camera pans to the station and zooms in
// (`Tokens.ui.cameraZoomScale` over `Timing.cameraZoomInMs`). Reduced motion: a fade out over
// `Timing.sceneFadeMs`, no zoom. `revealScene` fades a scene in (every game start, the return to the
// island). The plan is pure and tested; the Phaser calls stay thin. Fades go to the sky colour.
// Story 2.3 adds `pullBack` (the post-round chain's camera step) and its pure `pullBackPlan`.
import type { Point } from '../content/layout-types';
import { Tokens } from './tokens';

/** Story 6.1: degrees → radians (design values are in degrees; Math.sin/cos take radians). */
export const DEG_TO_RAD = Math.PI / 180;

export type EnterPlan =
  | { readonly kind: 'zoom'; readonly zoom: number; readonly ms: number }
  | { readonly kind: 'fade'; readonly ms: number };

/** Normal: zoom over `Timing.cameraZoomInMs`. Under reduced motion: the `sceneFadeMs` fade. */
export function enterPlan(reduced: boolean): EnterPlan {
  return reduced
    ? { kind: 'fade', ms: Tokens.Timing.sceneFadeMs }
    : { kind: 'zoom', zoom: Tokens.ui.cameraZoomScale, ms: Tokens.Timing.cameraZoomInMs };
}

/** The slice of a Phaser camera these transitions use. */
export interface CameraLike {
  pan(x: number, y: number, duration: number, ease?: string, force?: boolean): unknown;
  zoomTo(zoom: number, duration: number, ease?: string, force?: boolean): unknown;
  fadeOut(duration: number, red?: number, green?: number, blue?: number): unknown;
  fadeIn(duration: number, red?: number, green?: number, blue?: number): unknown;
  once(event: string, fn: () => void): unknown;
}

export interface SceneWithCamera {
  readonly cameras: { readonly main: CameraLike };
}

export const ZOOM_COMPLETE = 'camerazoomcomplete';
export const FADE_OUT_COMPLETE = 'camerafadeoutcomplete';
export const FADE_IN_COMPLETE = 'camerafadeincomplete';
const EASE = 'Sine.easeInOut';
const CHANNEL = 256;

function skyRgb(): [number, number, number] {
  const v = Tokens.colors.sky.value;
  return [Math.floor(v / CHANNEL / CHANNEL) % CHANNEL, Math.floor(v / CHANNEL) % CHANNEL, v % CHANNEL];
}

/** Pans + zooms onto `focus` (or fades out under reduced motion); resolves when the camera is done. */
export function enterStation(
  scene: SceneWithCamera,
  focus: Point,
  reduced: boolean,
): Promise<void> {
  const cam = scene.cameras.main;
  const plan = enterPlan(reduced);
  return new Promise((resolve) => {
    if (plan.kind === 'fade') {
      cam.once(FADE_OUT_COMPLETE, () => resolve());
      cam.fadeOut(plan.ms, ...skyRgb());
      return;
    }
    cam.once(ZOOM_COMPLETE, () => resolve());
    cam.pan(focus.x, focus.y, plan.ms, EASE, true);
    cam.zoomTo(plan.zoom, plan.ms, EASE, true);
  });
}

// --- Story 2.3: the post-round camera pull-back --------------------------------------------------

export type PullBackPlan =
  | { readonly kind: 'zoom'; readonly fromZoom: number; readonly toZoom: number; readonly ms: number; readonly ease: string }
  | { readonly kind: 'fade'; readonly ms: number };

const PULL_BACK_EASE = 'Cubic.easeOut';

/**
 * Normal: start at zoom `ui.cameraZoomScale` on the station, then zoom to 1 and pan back to the island
 * centre (scroll 0) over `Timing.cameraPullBackMs`, ease-out. Reduced: zoom 1, scroll 0, a fade-in
 * over `Timing.sceneFadeMs`.
 */
export function pullBackPlan(reduced: boolean): PullBackPlan {
  return reduced
    ? { kind: 'fade', ms: Tokens.Timing.sceneFadeMs }
    : { kind: 'zoom', fromZoom: Tokens.ui.cameraZoomScale, toZoom: 1, ms: Tokens.Timing.cameraPullBackMs, ease: PULL_BACK_EASE };
}

/** The camera slice the pull-back also needs (it sets the start state at once). */
export interface PullBackCameraLike extends CameraLike {
  resetFX(): unknown;
  setZoom(zoom: number): unknown;
  centerOn(x: number, y: number): unknown;
  setScroll(x: number, y: number): unknown;
}

export interface SceneWithPullBackCamera {
  readonly cameras: { readonly main: PullBackCameraLike };
}

/**
 * Story 2.3: the island appears zoomed on `focus` and pulls back to the whole island (or fades in
 * under reduced motion). Resolves when the camera is done; the camera ends at zoom 1, scroll 0.
 */
export function pullBack(scene: SceneWithPullBackCamera, focus: Point, reduced: boolean): Promise<void> {
  const cam = scene.cameras.main;
  const plan = pullBackPlan(reduced);
  cam.resetFX();
  if (plan.kind === 'fade') {
    cam.setZoom(1);
    cam.setScroll(0, 0);
    return revealScene(scene);
  }
  cam.setZoom(plan.fromZoom);
  cam.centerOn(focus.x, focus.y);
  return new Promise((resolve) => {
    cam.once(ZOOM_COMPLETE, () => {
      cam.setZoom(plan.toZoom);
      cam.setScroll(0, 0);
      resolve();
    });
    // Scroll 0 at zoom 1 puts the design centre in the middle of the camera.
    cam.pan(Tokens.design.width / 2, Tokens.design.height / 2, plan.ms, plan.ease, true);
    cam.zoomTo(plan.toZoom, plan.ms, plan.ease, true);
  });
}

/**
 * Seamless play (2026-10-21): fades a scene out to the sky colour over `Timing.sceneFadeMs` (the short
 * fade before a game restarts itself for its next round; the restarted scene fades in with `revealScene`).
 */
export function fadeOutScene(scene: SceneWithCamera): Promise<void> {
  const cam = scene.cameras.main;
  return new Promise((resolve) => {
    cam.once(FADE_OUT_COMPLETE, () => resolve());
    cam.fadeOut(Tokens.Timing.sceneFadeMs, ...skyRgb());
  });
}

/** Fades the scene in from the sky colour over `Timing.sceneFadeMs`. */
export function revealScene(scene: SceneWithCamera): Promise<void> {
  const cam = scene.cameras.main;
  return new Promise((resolve) => {
    cam.once(FADE_IN_COMPLETE, () => resolve());
    cam.fadeIn(Tokens.Timing.sceneFadeMs, ...skyRgb());
  });
}
