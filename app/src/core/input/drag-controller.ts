// DragController (Story 1.8, AD-4): one draggable item on a TapRouter, built on the InputGuard.
// - Lift: a primary press that hits the item's circle while `guard.isPickable(item)` marks the press
//   as dragging (`guard.setDragging`), stores the grab offset and runs `onLift` in the same
//   pointerdown handler (feedback within NFR5).
// - Move: the router forwards the primary's pointermove; the item centre is
//   `clampDrag(point − offset, bounds, exclusions, itemRadius)` (the visible rect minus the dead strips,
//   outside the Hud buttons).
// - Release: the primary's release anywhere → the hit circle moves to the drop point, then
//   `onDrop(last centre)`. A primary that self-heals
//   (pause, lost up, scene switch) → `onCancel()` instead.
// A second finger never lifts anything while a drag runs (the guard ignores it).
// Story 5.1 (tap-then-tap, FR29) — only for a caller that passes `onSelect`:
// - A press whose finger never got `Tokens.ui.tapMoveMaxPx` or farther from where it went down is a
//   tap: the item stays lifted and is *selected* (`onSelect(centre)`, no `onDrop`). One item per router
//   is selected; pressing another item first settles the selected one (deselect + `onDrop` at its centre).
// - While selected, a catcher target (z −2, below every real target) covers the drag bounds: a tap that
//   no other target of the router wants flies the item there (`fly(to, done)`, or a jump through
//   `onMove`) and then resolves it with `onDrop(to)`, exactly like a drop there.
// - A tap on the selected item deselects it (`onDrop` at its current centre); a drag from it is a
//   normal drag. `onDeselect` runs whenever a selection ends (before the drop/cancel that follows).
// - The scene pausing or sleeping while selected → `onDeselect`, `onCancel`.
import type { Rect } from '../safe-rect';
import { Tokens } from '../tokens';
import { clampDrag, dragBounds, hudExclusions, inRect, type Circle } from './drop';
import { inputGuard, type InputGuard } from './guard';
import type { Point } from './polygon';
import { currentView } from './space';
import { inCircle } from './tap-target';
import type { TapRouter } from './tap-router';

/** Where a dragged centre may go. */
export interface DragArea {
  readonly bounds: Rect;
  readonly exclusions: readonly Circle[];
}

export interface DraggableOptions {
  /** Hit circle in design px (its centre is the item centre). */
  readonly circle: Circle;
  readonly onLift: (p: Point) => void;
  readonly onMove: (p: Point) => void;
  readonly onDrop: (p: Point) => void;
  readonly onCancel: () => void;
  /** Radius kept inside the bounds and outside the exclusions (default: the circle radius). */
  readonly itemRadius?: number;
  /** The drag area; default from the live view (`dragBounds`, `hudExclusions`), none without a DOM. */
  readonly area?: () => DragArea | undefined;
  /** The guard (tests); default the app-wide `inputGuard`. */
  readonly guard?: InputGuard;
  /** Story 5.1: a tap selects the item (it stays lifted; show the selection ring). Absent: a tap is a drop. */
  readonly onSelect?: (p: Point) => void;
  /** Story 5.1: the selection ended (remove the ring); a drop, fly or cancel follows. */
  readonly onDeselect?: () => void;
  /** Story 5.1: moves the selected item to `to` (a tween), then calls `done` (→ `onDrop(to)`). Absent: a jump. */
  readonly fly?: (to: Point, done: () => void) => void;
}

export interface Draggable {
  /** Moves the hit circle (the scene calls it when the item settles somewhere). */
  setCircle(circle: Circle): Draggable;
  circle(): Circle;
  /** True between lift and drop/cancel. */
  isDragging(): boolean;
  /** Story 5.1: true while the item is tap-selected (waiting for the tap on its destination). */
  isSelected(): boolean;
  /** Unregisters the item; it never fires again. */
  destroy(): void;
  /** The drawn object, for hint visuals (Story 1.9). */
  object?: unknown;
  /**
   * Story 1.9: subscribes to lift changes — `true` right before `onLift`, `false` right after
   * `onDrop`/`onCancel` (Story 5.1: a selected item stays lifted until its selection resolves).
   * Returns the unsubscribe function.
   */
  onLiftChange(fn: (lifted: boolean) => void): () => void;
}

/** Story 5.1: the catcher's hit priority, below Map decorations (−1) and every default (0) target. */
const CATCHER_Z = -2;

/** The selected item of each router (one at a time); `settle` deselects it and drops it where it is. */
const selectedOn = new WeakMap<TapRouter, { settle(): void }>();

export function defaultDragArea(): DragArea | undefined {
  const view = currentView();
  return view ? { bounds: dragBounds(view), exclusions: hudExclusions(view) } : undefined;
}

/** Story 5.1: the play area a drop may rest in — the live drag bounds, or the design frame without a DOM. */
export function defaultPlayRect(): Rect {
  return defaultDragArea()?.bounds ?? { x: 0, y: 0, w: Tokens.design.width, h: Tokens.design.height };
}

export function createDraggable(router: TapRouter, opts: DraggableOptions): Draggable {
  const guard = opts.guard ?? inputGuard;
  const areaOf = opts.area ?? defaultDragArea;
  const selectable = opts.onSelect !== undefined;
  let circle: Circle = { ...opts.circle };
  let alive = true;
  let dragging = false;
  let selected = false;
  let flying = false;
  /** The live press began on the already selected item. */
  let fromSelected = false;
  let pressAt: Point = { x: 0, y: 0 };
  let maxMove = 0;
  let offset: Point = { x: 0, y: 0 };
  let last: Point = { x: circle.x, y: circle.y };
  let area: DragArea | undefined;
  let removeCatcher: (() => void) | undefined;
  const liftListeners = new Set<(lifted: boolean) => void>();
  const notifyLift = (lifted: boolean): void => {
    for (const fn of [...liftListeners]) fn(lifted);
  };
  const radius = (): number => opts.itemRadius ?? circle.r;
  const centre = (): Point => ({ x: circle.x, y: circle.y });

  /** Ends a selection (no-op when none); `notify` runs onDeselect. */
  const endSelection = (notify = true): void => {
    if (!selected) return;
    selected = false;
    if (selectedOn.get(router) === entry) selectedOn.delete(router);
    removeCatcher?.();
    removeCatcher = undefined;
    if (notify) opts.onDeselect?.();
  };

  const entry = {
    settle(): void {
      if (!selected) return;
      endSelection();
      last = centre();
      opts.onDrop(last);
      notifyLift(false);
    },
  };

  /** The tap at `p` on the play area: the selected item goes there and is resolved like a drop. */
  const flyTo = (p: Point): void => {
    if (!selected) return;
    const to = area ? clampDrag(p, area.bounds, area.exclusions, radius()) : { x: p.x, y: p.y };
    endSelection();
    flying = true;
    circle = { ...circle, x: to.x, y: to.y };
    const done = (): void => {
      if (!flying) return;
      flying = false;
      if (!alive) return;
      last = to;
      circle = { ...circle, x: to.x, y: to.y };
      opts.onDrop(to);
      notifyLift(false);
    };
    if (opts.fly) opts.fly(to, done);
    else {
      opts.onMove(to);
      done();
    }
  };

  const select = (): void => {
    selected = true;
    selectedOn.set(router, entry);
    removeCatcher = router.add({
      z: CATCHER_Z,
      contains: (p) => selected && !flying && (area ? inRect(p, area.bounds) : true),
      isEnabled: () => alive && selected,
      onPress: (p) => flyTo(p),
    });
    opts.onSelect?.(last);
  };

  const centreFor = (p: Point): Point => {
    const raw = { x: p.x - offset.x, y: p.y - offset.y };
    return area ? clampDrag(raw, area.bounds, area.exclusions, radius()) : raw;
  };

  const track = (p: Point): void => {
    maxMove = Math.max(maxMove, Math.hypot(p.x - pressAt.x, p.y - pressAt.y));
  };

  const remove = router.add({
    contains: (p) => !flying && inCircle(p, circle) && guard.isPickable(draggable),
    isEnabled: () => alive,
    onPress(p, pointer) {
      // Another item of this router is selected: it settles where it is before this one lifts.
      const prev = selectedOn.get(router);
      if (prev && prev !== entry) prev.settle();
      if (pointer) guard.setDragging(pointer, true);
      fromSelected = selected;
      dragging = true;
      pressAt = { x: p.x, y: p.y };
      maxMove = 0;
      offset = { x: p.x - circle.x, y: p.y - circle.y };
      last = centre();
      area = areaOf();
      if (fromSelected) return; // already lifted
      notifyLift(true);
      opts.onLift(last);
    },
    onMove(p) {
      if (!dragging) return;
      track(p);
      // A real drag from the selected item: it is no longer selected, just dragged.
      if (selected && maxMove >= Tokens.ui.tapMoveMaxPx) endSelection();
      last = centreFor(p);
      opts.onMove(last);
    },
    onEnd(p) {
      if (!dragging) return;
      dragging = false;
      track(p);
      const tap = selectable && maxMove < Tokens.ui.tapMoveMaxPx;
      last = centreFor(p);
      // The item now lies where it was released: it can be lifted there (the scene moves it on later).
      circle = { ...circle, x: last.x, y: last.y };
      if (tap && !fromSelected) {
        // Tap-select: the item stays lifted where it is (no drop).
        select();
        return;
      }
      // A tap on the selected item resolves where it is (deselect); a drag where it was dropped.
      endSelection();
      opts.onDrop(last);
      notifyLift(false);
    },
    onCancel() {
      if (!dragging) return;
      dragging = false;
      endSelection();
      opts.onCancel();
      notifyLift(false);
    },
  });

  // The scene pauses (the unlock overlay) or sleeps while the item is selected: the selection is cancelled.
  const unPause = router.onPause(() => {
    if (!selected || dragging) return;
    endSelection();
    opts.onCancel();
    notifyLift(false);
  });

  const draggable: Draggable = {
    setCircle(c) {
      circle = { ...c };
      return draggable;
    },
    circle: () => circle,
    isDragging: () => dragging,
    isSelected: () => selected,
    destroy() {
      if (!alive) return;
      alive = false;
      dragging = false;
      flying = false;
      endSelection(false);
      liftListeners.clear();
      unPause();
      remove();
    },
    onLiftChange(fn) {
      liftListeners.add(fn);
      return () => {
        liftListeners.delete(fn);
      };
    },
  };
  return draggable;
}
