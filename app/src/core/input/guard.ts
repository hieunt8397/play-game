// InputGuard (Story 1.6, AD-4): one owner for every press across scenes.
// - Every TapRouter forwards its scene-level pointerdown/up here. A press is keyed by Phaser's
//   pointer slot (`id`) plus its `downTime`; the first forward decides it, later forwards of the
//   same press (from other scenes) get the same verdict and do nothing.
// - A press starting in the edge strip (plus safe-area inset) is `dead`: dropped before anything else.
// - No live primary: the press becomes the primary. It resolves to the topmost enabled target over the
//   active routers, layer overlay > hud > scene (later router / later target wins within a layer).
//   Every active router's `anyTap` runs, then the hit target's `onPress`.
// - A live primary: a press whose topmost hit is a `hud` target fires it (`extra-hud`) unless the
//   primary drags; anything else is `ignored`. The primary is never cancelled by another finger.
// - The primary ends on its pointerup/upoutside, or self-heals on the next query once its pointer
//   reports `!isDown` or a new `downTime` (pause, scene switch, lost up).
// - Story 1.8 (drag): routers forward `pointermove`; the primary's target gets `onMove` and, on its
//   release, `onEnd` wherever the finger is. A primary that self-heals, or whose router went
//   inactive (paused scene) before the release, gets `onCancel` instead. `setPickable`/`setSnapScale`
//   hold per-object drag state (WeakMap): the only way to change pickability or a snap radius.
import { locate, type Located } from './space';
import type { PointerPointLike, ScaleLike } from './pointer-adapter';
import type { Point } from './polygon';

export type Layer = 'scene' | 'hud' | 'overlay';
export type Verdict = 'dead' | 'primary' | 'extra-hud' | 'ignored';

/** Highest layer first. */
export const LAYER_ORDER: readonly Layer[] = ['overlay', 'hud', 'scene'];

/** The slice of `Phaser.Input.Pointer` the guard needs. */
export interface GuardPointer extends PointerPointLike {
  /** Phaser pointer slot. */
  readonly id: number;
  readonly downTime: number;
  readonly isDown: boolean;
}

export interface GuardTarget {
  contains(p: Point): boolean;
  isEnabled(): boolean;
  /** Fires on press (feedback starts here). `pointer` lets a drag mark the press (`setDragging`). */
  onPress(p: Point, pointer?: GuardPointer): void;
  /** Fires on the release of the primary press that hit this target, if released over it. */
  onRelease?(p: Point): void;
  /** Story 1.8: the primary that hit this target moved (design point). */
  onMove?(p: Point): void;
  /** Story 1.8: the primary that hit this target was released, wherever (design point). */
  onEnd?(p: Point): void;
  /** Story 1.8: the primary that hit this target ended without a release (self-heal, paused scene). */
  onCancel?(): void;
}

export interface GuardRouter {
  readonly layer: Layer;
  /** False while the router's scene is paused, sleeping or stopped. */
  isActive(): boolean;
  /** Topmost enabled target containing `p`. */
  hit(p: Point): GuardTarget | undefined;
  /** Runs on every primary press, hit or miss. */
  anyTap(p: Point): void;
}

export type Locator = (pointer: GuardPointer, scale?: ScaleLike) => Located;

interface Primary {
  readonly key: string;
  readonly pointer: GuardPointer;
  readonly downTime: number;
  readonly target: GuardTarget | undefined;
  readonly router: GuardRouter | undefined;
  dragging: boolean;
}

/** How many decided press keys are remembered (several pointers × several scenes per event). */
const SEEN_MAX = 32;

function keyOf(pointer: GuardPointer): string {
  return `${pointer.id}:${pointer.downTime}`;
}

export class InputGuard {
  private routers: GuardRouter[] = [];
  private readonly seen = new Map<string, Verdict>();
  private primary: Primary | undefined;
  private readonly locator: Locator;
  private readonly pickable = new WeakMap<object, boolean>();
  private readonly snapScales = new WeakMap<object, number>();

  constructor(locator: Locator = (pointer, scale) => locate(pointer, scale)) {
    this.locator = locator;
  }

  /** Registers a router; returns its removal function. */
  register(router: GuardRouter): () => void {
    this.routers.push(router);
    return () => {
      this.routers = this.routers.filter((r) => r !== router);
    };
  }

  /** Decides a press (idempotent per press key). */
  press(pointer: GuardPointer, scale?: ScaleLike): Verdict {
    const key = keyOf(pointer);
    const known = this.seen.get(key);
    if (known !== undefined) return known;
    const verdict = this.decide(key, pointer, scale);
    this.seen.set(key, verdict);
    if (this.seen.size > SEEN_MAX) {
      const oldest = this.seen.keys().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    return verdict;
  }

  /** A pointerup / pointerupoutside. Releases the primary (once) and fires its target's onRelease. */
  release(pointer: GuardPointer, scale?: ScaleLike): void {
    const primary = this.primary;
    if (!primary || primary.key !== keyOf(pointer)) return;
    this.primary = undefined;
    const target = primary.target;
    if (!target) return;
    const p = this.locator(pointer, scale).design;
    if (target.onEnd || target.onCancel) {
      // A drag whose scene was paused meanwhile (the unlock overlay) is cancelled, not dropped.
      if (primary.router && !primary.router.isActive()) target.onCancel?.();
      else target.onEnd?.(p);
    }
    if (!target.onRelease || !target.isEnabled()) return;
    if (target.contains(p)) target.onRelease(p);
  }

  /** Story 1.8: a pointermove; forwarded to the primary's target (any other pointer is ignored). */
  move(pointer: GuardPointer, scale?: ScaleLike): void {
    const primary = this.livePrimary();
    if (!primary || primary.key !== keyOf(pointer) || !primary.target?.onMove) return;
    primary.target.onMove(this.locator(pointer, scale).design);
  }

  /** Story 1.8: whether a press may lift `item` (default true). A running drag is not affected. */
  setPickable(item: object, on: boolean): void {
    this.pickable.set(item, on);
  }

  isPickable(item: object): boolean {
    return this.pickable.get(item) ?? true;
  }

  /** Story 1.8: snap-radius factor of a drop target (default 1). */
  setSnapScale(target: object, k: number): void {
    this.snapScales.set(target, k);
  }

  snapScale(target: object): number {
    return this.snapScales.get(target) ?? 1;
  }

  isPrimary(pointer: GuardPointer): boolean {
    const primary = this.livePrimary();
    return primary !== undefined && primary.key === keyOf(pointer);
  }

  /** Story 1.8 DragController: marks the primary as dragging (ignored for any other pointer). */
  setDragging(pointer: GuardPointer, on: boolean): void {
    const primary = this.livePrimary();
    if (primary && primary.key === keyOf(pointer)) primary.dragging = on;
  }

  isDragging(): boolean {
    return this.livePrimary()?.dragging ?? false;
  }

  /** Forgets every press and the primary (tests, hot reload). Routers stay registered. */
  reset(): void {
    this.seen.clear();
    this.primary = undefined;
  }

  private livePrimary(): Primary | undefined {
    const primary = this.primary;
    if (primary && (!primary.pointer.isDown || primary.pointer.downTime !== primary.downTime)) {
      this.primary = undefined;
      primary.target?.onCancel?.();
      return undefined;
    }
    return primary;
  }

  private activeRouters(): GuardRouter[] {
    const active = this.routers.filter((r) => r.isActive());
    const out: GuardRouter[] = [];
    for (const layer of LAYER_ORDER) {
      for (let i = active.length - 1; i >= 0; i--) {
        if (active[i]!.layer === layer) out.push(active[i]!);
      }
    }
    return out;
  }

  private resolve(routers: readonly GuardRouter[], p: Point): { router: GuardRouter; target: GuardTarget } | undefined {
    for (const router of routers) {
      const target = router.hit(p);
      if (target) return { router, target };
    }
    return undefined;
  }

  private decide(key: string, pointer: GuardPointer, scale: ScaleLike | undefined): Verdict {
    const where = this.locator(pointer, scale);
    if (where.dead) return 'dead';
    const p = where.design;
    const routers = this.activeRouters();
    const hit = this.resolve(routers, p);
    if (this.livePrimary()) {
      if (hit && hit.router.layer === 'hud' && !this.isDragging()) {
        hit.target.onPress(p);
        return 'extra-hud';
      }
      return 'ignored';
    }
    this.primary = { key, pointer, downTime: pointer.downTime, target: hit?.target, router: hit?.router, dragging: false };
    for (const router of routers) router.anyTap(p);
    hit?.target.onPress(p, pointer);
    return 'primary';
  }
}

/** The app-wide guard every TapRouter forwards to. */
export const inputGuard = new InputGuard();
