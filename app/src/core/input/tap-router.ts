// Tap routing (Story 1.5; Story 1.6 adds layers, InputGuard registration and up events).
// One router per scene: it listens to the scene-level pointerdown / pointerup / pointerupoutside and
// forwards each to the global InputGuard, which decides every press once across scenes (dead zones,
// first finger, layers overlay > hud > scene) and calls back into the routers. Within a router the
// enabled target containing the design point with the highest `z` (default 0) wins; at equal z the
// last one registered wins (Story 2.2: Map decorations use z −1, so a station polygon always wins).
// Story 2.3: an optional `toWorld(p)` maps the design point before hit-testing and before it reaches the
// target (Map passes the camera's world point, so taps hit what the child sees while zoomed).
// This folder is the only place that touches pointer events (ESLint enforces it).
import { inputGuard, type GuardPointer, type GuardRouter, type GuardTarget, type InputGuard, type Layer } from './guard';
import type { ScaleLike } from './pointer-adapter';
import type { Point } from './polygon';

export type { Layer };
export type PointerLike = GuardPointer;

/** Slice of `Phaser.Scene` the router needs (fakeable in node tests). */
export interface RouterSceneLike {
  readonly input: {
    on(event: string, fn: (pointer: PointerLike) => void): unknown;
    off(event: string, fn: (pointer: PointerLike) => void): unknown;
  };
  readonly events: {
    once(event: string, fn: () => void): unknown;
    /** Story 5.1: scene pause/sleep reach `onPause` listeners (optional: a fake may have none). */
    on?(event: string, fn: () => void): unknown;
    off?(event: string, fn: () => void): unknown;
  };
  readonly sys: { isActive(): boolean };
  readonly scale?: ScaleLike;
}

export type RouterTarget = GuardTarget & {
  /** Story 2.2: hit priority within the router (default 0); a higher z wins over registration order. */
  readonly z?: number;
};

export interface TapRouter {
  readonly layer: Layer;
  /** Registers a target on top of the earlier ones; returns its removal function. */
  add(target: RouterTarget): () => void;
  /** Called on every primary press, hit or miss, before the target's onPress (Map: reset idle). */
  onAnyTap: ((p: Point) => void) | undefined;
  /**
   * Story 5.1: `fn` runs when the router's scene pauses or sleeps (a selected item is cancelled then).
   * Returns the unsubscribe function.
   */
  onPause(fn: () => void): () => void;
  /** Removes the listeners, the guard registration and every target (also runs on shutdown/destroy). */
  destroy(): void;
}

export interface TapRouterOptions {
  readonly layer?: Layer;
  /** The guard to forward to (tests); default the app-wide `inputGuard`. */
  readonly guard?: InputGuard;
  /** Story 2.3: design point → the point targets are tested in (default: identity). */
  readonly toWorld?: (p: Point) => Point;
}

export const POINTER_DOWN = 'pointerdown';
export const POINTER_UP = 'pointerup';
export const POINTER_UP_OUTSIDE = 'pointerupoutside';
/** Story 1.8: forwarded to the guard for the primary's drag target. */
export const POINTER_MOVE = 'pointermove';
const SHUTDOWN = 'shutdown';
const PAUSE = 'pause';
const SLEEP = 'sleep';
const DESTROY = 'destroy';

export function createTapRouter(scene: RouterSceneLike, opts: TapRouterOptions = {}): TapRouter {
  const guard = opts.guard ?? inputGuard;
  const layer = opts.layer ?? 'scene';
  const toWorld = opts.toWorld ?? ((p: Point): Point => p);
  let targets: RouterTarget[] = [];
  let live = true;
  const pauseListeners = new Set<() => void>();
  const onScenePause = (): void => {
    for (const fn of [...pauseListeners]) fn();
  };

  const guardRouter: GuardRouter = {
    layer,
    isActive: () => live && scene.sys.isActive(),
    hit(p) {
      let best: RouterTarget | undefined;
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i]!;
        if ((best === undefined || (t.z ?? 0) > (best.z ?? 0)) && t.isEnabled() && t.contains(p)) best = t;
      }
      return best;
    },
    anyTap(p) {
      router.onAnyTap?.(toWorld(p));
    },
  };

  const onDown = (pointer: PointerLike): void => {
    guard.press(pointer, scene.scale);
  };
  const onUp = (pointer: PointerLike): void => {
    guard.release(pointer, scene.scale);
  };
  const onMove = (pointer: PointerLike): void => {
    guard.move(pointer, scene.scale);
  };

  const unregister = guard.register(guardRouter);

  const router: TapRouter = {
    layer,
    onAnyTap: undefined,
    add(target) {
      // The wrapper goes dead with the router, so a primary held across destroy never fires onRelease.
      const { onRelease, onMove, onEnd, onCancel } = target;
      const wrapped: RouterTarget = {
        ...(target.z !== undefined ? { z: target.z } : {}),
        contains: (p) => target.contains(toWorld(p)),
        isEnabled: () => live && target.isEnabled(),
        onPress: (p, pointer) => target.onPress(toWorld(p), pointer),
        ...(onRelease ? { onRelease: (p: Point) => onRelease.call(target, toWorld(p)) } : {}),
        // Drag callbacks also go dead with the router (a destroyed scene never hears its drop).
        ...(onMove ? { onMove: (p: Point) => live && onMove.call(target, toWorld(p)) } : {}),
        ...(onEnd ? { onEnd: (p: Point) => live && onEnd.call(target, toWorld(p)) } : {}),
        ...(onCancel ? { onCancel: () => live && onCancel.call(target) } : {}),
      };
      targets.push(wrapped);
      return () => {
        targets = targets.filter((t) => t !== wrapped);
      };
    },
    onPause(fn) {
      pauseListeners.add(fn);
      return () => {
        pauseListeners.delete(fn);
      };
    },
    destroy() {
      if (!live) return;
      live = false;
      scene.events.off?.(PAUSE, onScenePause);
      scene.events.off?.(SLEEP, onScenePause);
      pauseListeners.clear();
      scene.input.off(POINTER_DOWN, onDown);
      scene.input.off(POINTER_UP, onUp);
      scene.input.off(POINTER_UP_OUTSIDE, onUp);
      scene.input.off(POINTER_MOVE, onMove);
      unregister();
      targets = [];
      router.onAnyTap = undefined;
    },
  };

  scene.input.on(POINTER_DOWN, onDown);
  scene.input.on(POINTER_UP, onUp);
  scene.input.on(POINTER_UP_OUTSIDE, onUp);
  scene.input.on(POINTER_MOVE, onMove);
  scene.events.on?.(PAUSE, onScenePause);
  scene.events.on?.(SLEEP, onScenePause);
  scene.events.once(SHUTDOWN, () => router.destroy());
  scene.events.once(DESTROY, () => router.destroy());
  return router;
}
