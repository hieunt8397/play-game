// TracePath (Story 4.1, AD-4): a TraceModel on a TapRouter, built on the InputGuard like the
// DragController. Its grab target is a circle of `raceGrabRadius` around the kart, moved after every
// tick. A primary press on it runs `model.press`; a grab marks the press as dragging
// (`guard.setDragging`) and emits `grab` in the same pointerdown handler (feedback within NFR5). The
// router forwards the primary's moves; its release and the guard's self-heal (pause, lost up) both
// release the model. Dead-zone and second-finger presses never reach it (the guard decides).
import { inputGuard, type InputGuard } from './guard';
import type { Point } from './polygon';
import type { TapRouter } from './tap-router';
import { TraceModel, type TraceEvent, type TraceOptions, type TraceState } from './trace-model';

export interface TracePathOptions {
  readonly points: readonly Point[];
  /** Every model event (grab, progress, wait, arrive), in order. */
  readonly onEvent: (e: TraceEvent) => void;
  readonly trace?: Partial<TraceOptions>;
  readonly guard?: InputGuard;
}

export interface TracePath {
  tick(dtMs: number): void;
  /** Story 4.2: the kart at sample `index`, waiting. */
  restore(index: number): void;
  setEnabled(on: boolean): void;
  destroy(): void;
  readonly model: TraceModel;
  readonly s: number;
  readonly index: number;
  readonly point: Point;
  readonly state: TraceState;
  /** True while a finger holds the kart. */
  isDragging(): boolean;
  /** The drawn kart, for hint visuals. */
  object?: unknown;
  /** Hint visuals: `true` on a grab, `false` when the kart is let go. Returns the unsubscribe. */
  onLiftChange(fn: (lifted: boolean) => void): () => void;
}

export function createTracePath(router: TapRouter, opts: TracePathOptions): TracePath {
  const guard = opts.guard ?? inputGuard;
  const model = new TraceModel(opts.points, opts.trace);
  let alive = true;
  let enabled = true;
  let holding = false;
  const liftListeners = new Set<(lifted: boolean) => void>();
  const setHolding = (on: boolean): void => {
    if (holding === on) return;
    holding = on;
    for (const fn of [...liftListeners]) fn(on);
  };
  const emit = (events: readonly TraceEvent[]): void => {
    for (const e of events) {
      if (e.kind === 'grab') setHolding(true);
      else if (e.kind === 'wait' || e.kind === 'arrive') setHolding(false);
      opts.onEvent(e);
    }
  };
  const letGo = (): void => {
    emit(model.release());
    setHolding(false);
  };

  const remove = router.add({
    contains: (p) => model.canGrab(p),
    isEnabled: () => alive && enabled,
    onPress(p, pointer) {
      if (!model.press(p)) return;
      if (pointer) guard.setDragging(pointer, true);
      emit([{ kind: 'grab' }]);
    },
    onMove(p) {
      if (alive) emit(model.move(p));
    },
    onEnd() {
      if (alive) letGo();
    },
    onCancel() {
      if (alive) letGo();
    },
  });

  const path: TracePath = {
    model,
    tick(dt) {
      if (alive && enabled) emit(model.tick(dt));
    },
    restore(index) {
      model.restore(index);
      setHolding(false);
    },
    setEnabled(on) {
      enabled = on;
      if (!on && holding) letGo();
    },
    destroy() {
      if (!alive) return;
      alive = false;
      liftListeners.clear();
      remove();
    },
    get s() {
      return model.s;
    },
    get index() {
      return model.index;
    },
    get point() {
      return model.point;
    },
    get state() {
      return model.state;
    },
    isDragging: () => holding,
    onLiftChange(fn) {
      liftListeners.add(fn);
      return () => {
        liftListeners.delete(fn);
      };
    },
  };
  return path;
}
