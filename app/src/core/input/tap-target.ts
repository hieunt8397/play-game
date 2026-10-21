// A circular tap area on a TapRouter (Story 1.6): Hud buttons, Start's ▶, the unlock overlay's ▶.
// Story 4.3: or any `area` (e.g. the whole pond, where the game picks the moving fish itself).
import type { Point } from './polygon';
import type { TapRouter } from './tap-router';

export interface Circle {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** Story 4.3: a hit area of any shape (design px). */
export interface TapArea {
  contains(p: Point): boolean;
}

export type TapTargetOptions = TapTargetCommon & ({ readonly circle: Circle; readonly area?: undefined } | { readonly area: TapArea; readonly circle?: undefined });

interface TapTargetCommon {
  /** Fires on the press, with its design point. */
  readonly onPress: (p: Point) => void;
  /** Release of the primary press that hit this target, over the target. */
  readonly onRelease?: (p: Point) => void;
  /**
   * Story 1.7: points inside the circle for which the target does not count as hit (the Map kart
   * yields to a station drawn in front of it). Default: none.
   */
  readonly excludes?: (p: Point) => boolean;
}

export interface TapTarget {
  setCircle(circle: Circle): TapTarget;
  setEnabled(enabled: boolean): TapTarget;
  isEnabled(): boolean;
  /** Unregisters the target; it never fires again. */
  destroy(): void;
}

export function inCircle(p: Point, c: Circle): boolean {
  return (p.x - c.x) ** 2 + (p.y - c.y) ** 2 <= c.r * c.r;
}

export function createTapTarget(router: TapRouter, opts: TapTargetOptions): TapTarget {
  let circle: Circle | undefined = opts.circle ? { ...opts.circle } : undefined;
  const area = opts.area;
  let enabled = true;
  let alive = true;
  const onRelease = opts.onRelease;
  const remove = router.add({
    contains: (p) => (area ? area.contains(p) : circle !== undefined && inCircle(p, circle)) && !(opts.excludes?.(p) ?? false),
    isEnabled: () => alive && enabled,
    onPress: (p) => opts.onPress(p),
    ...(onRelease ? { onRelease: (p: Point) => onRelease(p) } : {}),
  });
  const target: TapTarget = {
    setCircle(c) {
      circle = { ...c };
      return target;
    },
    setEnabled(on) {
      enabled = on;
      return target;
    },
    isEnabled: () => alive && enabled,
    destroy() {
      if (!alive) return;
      alive = false;
      remove();
    },
  };
  return target;
}
