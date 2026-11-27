// Tàu hỏa quanh đảo: the camera (2026-11-13, spec-tau-quanh-dao), pure and Phaser-free.
// The game's world is the map's design space (the island plate at 2× the map's resolution); the Phaser camera shows a
// `view` (design size / ui.trainZoom) of it and follows the train:
//   - its centre is the rail point `lead` design px (of arc) past the train's middle: it leads slightly in the direction
//     of travel, and the waiting friend ahead of the engine and the last car both stay in view;
//   - it never shows past the plate's edge (the centre is clamped half a view inside the bounds);
//   - it moves with the train's arc length, so it never moves faster than the train, and it never jumps;
//   - under reduced motion (`CameraStepper`) it holds still and moves in short eased steps when the train's focus
//     leaves the middle of the view, at a pace whose peak is the train's cruise.
import type { Point } from '../../content/layout-types';
import type { Loop } from '../../core/map-rides';

export interface CameraFrame {
  /** The world area the camera shows (design px / zoom). */
  readonly viewW: number;
  readonly viewH: number;
  /** The plate's size (design px): the camera never shows past it. */
  readonly boundsW: number;
  readonly boundsH: number;
}

export interface FollowConfig extends CameraFrame {
  /** The arc length (design px) from the engine back to the train's middle. */
  readonly middle: number;
  /** How far past the train's middle the camera looks (design px of arc). */
  readonly lead: number;
}

/** A centre clamped so the view stays on the plate (a plate narrower than the view: its middle). */
export function clampCentre(p: Point, f: CameraFrame): Point {
  const clamp = (v: number, view: number, bound: number): number => (view >= bound ? bound / 2 : Math.max(view / 2, Math.min(bound - view / 2, v)));
  return { x: clamp(p.x, f.viewW, f.boundsW), y: clamp(p.y, f.viewH, f.boundsH) };
}

/** The camera's centre for the engine at arc length `s`. */
export function cameraCentre(loop: Loop, s: number, cfg: FollowConfig): Point {
  return clampCentre(loop.pointAt(s - cfg.middle + cfg.lead), cfg);
}

/** The top-left of the view centred on `c` (Phaser's camera scroll at the camera's zoom origin). */
export function viewOrigin(c: Point, f: CameraFrame): Point {
  return { x: c.x - f.viewW / 2, y: c.y - f.viewH / 2 };
}

/** A world point on screen (design px from the screen's top-left) with the camera centred on `c` at `zoom`. */
export function toScreen(p: Point, c: Point, f: CameraFrame, zoom: number): Point {
  const o = viewOrigin(c, f);
  return { x: (p.x - o.x) * zoom, y: (p.y - o.y) * zoom };
}

// --- reduced motion: short eased steps ------------------------------------------------------------------------------

export interface StepConfig {
  /** A step starts when the target is farther than this from the camera's centre (design px). */
  readonly threshold: number;
  /** The shortest step (ms). */
  readonly minMs: number;
  /** The most the camera's speed may reach (design px per ms): the train's cruise. */
  readonly maxSpeed: number;
}

const HALF_PI = Math.PI / 2;

/** The sine ease in-out over [0, 1] (its peak slope is π/2). */
export function easeInOut(k: number): number {
  const t = Math.max(0, Math.min(1, k));
  return (1 - Math.cos(Math.PI * t)) / 2;
}

export class CameraStepper {
  private at: Point;
  private from: Point;
  private to: Point;
  private t = 0;
  private ms = 0;

  constructor(start: Point) {
    this.at = { ...start };
    this.from = { ...start };
    this.to = { ...start };
  }

  get centre(): Point {
    return this.at;
  }

  /** True while a step runs. */
  get moving(): boolean {
    return this.t < this.ms;
  }

  /** Puts the camera at `p` at once (a fresh start or a resume; never during play). */
  reset(p: Point): void {
    this.at = { ...p };
    this.from = { ...p };
    this.to = { ...p };
    this.t = 0;
    this.ms = 0;
  }

  /**
   * One frame toward `target` (the follow centre). A step runs to the end once started; a new one starts when the
   * target is beyond the threshold. Its time is long enough that the eased speed's peak is `maxSpeed`.
   */
  tick(target: Point, dtMs: number, cfg: StepConfig): Point {
    if (this.moving) {
      this.t = Math.min(this.ms, this.t + Math.max(0, dtMs));
      const k = easeInOut(this.t / this.ms);
      this.at = { x: this.from.x + (this.to.x - this.from.x) * k, y: this.from.y + (this.to.y - this.from.y) * k };
      return this.at;
    }
    const d = Math.hypot(target.x - this.at.x, target.y - this.at.y);
    if (d > cfg.threshold && cfg.maxSpeed > 0) {
      this.from = { ...this.at };
      this.to = { ...target };
      this.t = 0;
      this.ms = Math.max(cfg.minMs, (HALF_PI * d) / cfg.maxSpeed);
    }
    return this.at;
  }
}
