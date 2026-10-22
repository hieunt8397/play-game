// Đường đua finish gate (2026-10-22, the gate faces the road), pure: which rendered yaw of the arch to show
// at a road's end and where. The arch is rendered at several yaws (content `GATE_YAWS`); for each the layout
// holds the on-screen crossing direction (`anchor.gate-cross-<deg>` − `anchor.gate`) and one post foot
// (`anchor.gate-post-<deg>` − `anchor.gate`). The road's arrival direction (its last `tangentPx` of arc)
// picks the yaw whose crossing direction is the most parallel to it (the arch is symmetric: the sign does
// not matter); the arch's pivot (its post-feet midpoint) sits on the road `backPx` of arc before the end, so
// the road runs between the posts and the kart finishes just past the arch line. A yaw whose frame is missing
// falls back to the nearest available yaw (degrees mod 180).
import { GATE_SYMMETRY_DEG as HALF_TURN_DEG, gateBackPx } from '../../content/games/race.ts';
import { Tokens } from '../../core/tokens.ts';
import type { Point } from '../../content/layout-types.ts';

/** One rendered yaw: its crossing direction and one post foot, both relative to the pivot (design px). */
export interface GateView {
  readonly deg: number;
  readonly cross: Point;
  readonly post: Point;
}

export interface GatePlacement {
  /** The yaw shown. */
  readonly deg: number;
  /** The best-matching yaw (≠ deg when its frame is missing). */
  readonly ideal: number;
  readonly fallback: boolean;
  /** Where the pivot goes (design px). */
  readonly at: Point;
  /** The road's arrival direction (unit). */
  readonly dir: Point;
  /** This yaw's post foot relative to the pivot (the other foot is at −post). */
  readonly post: Point;
}

export interface GatePlaceOptions {
  /** The arrival direction is measured over this much arc at the road's end. */
  readonly tangentPx: number;
  /** The pivot sits this much arc before the road's end. */
  readonly backPx: number;
}

/** The views whose pivot, cross and post anchors all exist, in `yaws` order. */
export function gateViews(
  anchors: Readonly<Record<string, Point>>,
  yaws: readonly number[],
  ids: { readonly pivot: string; readonly cross: (deg: number) => string; readonly post: (deg: number) => string },
): GateView[] {
  const p = anchors[ids.pivot];
  if (!p) return [];
  const out: GateView[] = [];
  for (const deg of yaws) {
    const c = anchors[ids.cross(deg)];
    const q = anchors[ids.post(deg)];
    if (c && q) out.push({ deg, cross: { x: c.x - p.x, y: c.y - p.y }, post: { x: q.x - p.x, y: q.y - p.y } });
  }
  return out;
}

/** The point `d` px of arc back from the polyline's end (its start when shorter). */
export function pointBack(points: readonly Point[], d: number): Point | undefined {
  const last = points[points.length - 1];
  if (!last) return undefined;
  let left = Math.max(0, d);
  for (let i = points.length - 1; i > 0; i--) {
    const b = points[i]!;
    const a = points[i - 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= len && len > 0) {
      const t = left / len;
      return { x: b.x + (a.x - b.x) * t, y: b.y + (a.y - b.y) * t };
    }
    left -= len;
  }
  return { ...points[0]! };
}

/** The unit direction the road arrives in over its last `span` px of arc; undefined for a degenerate road. */
export function arrivalDirection(points: readonly Point[], span: number): Point | undefined {
  const end = points[points.length - 1];
  const from = pointBack(points, span);
  if (!end || !from) return undefined;
  const dx = end.x - from.x;
  const dy = end.y - from.y;
  const n = Math.hypot(dx, dy);
  return n > 0 ? { x: dx / n, y: dy / n } : undefined;
}

/** The view whose crossing direction is the most parallel (either sign) to `dir`. */
export function bestView(views: readonly GateView[], dir: Point): GateView | undefined {
  let best: GateView | undefined;
  let score = -1;
  for (const v of views) {
    const n = Math.hypot(v.cross.x, v.cross.y);
    if (n === 0) continue;
    const s = Math.abs((v.cross.x * dir.x + v.cross.y * dir.y) / n);
    if (s > score) {
      score = s;
      best = v;
    }
  }
  return best;
}

/** Yaw distance on the symmetric arch (degrees mod GATE_SYMMETRY_DEG). */
export const yawDistance = (a: number, b: number): number => {
  const d = (((a - b) % HALF_TURN_DEG) + HALF_TURN_DEG) % HALF_TURN_DEG;
  return Math.min(d, HALF_TURN_DEG - d);
};

/**
 * The gate for a road: the best view, or (its frame missing: `has(deg)` false) the nearest available one,
 * at `backPx` of arc before the road's end. Undefined when no view has a frame or the road is degenerate.
 */
export function placeGate(points: readonly Point[], views: readonly GateView[], has: (deg: number) => boolean, opts: GatePlaceOptions): GatePlacement | undefined {
  const dir = arrivalDirection(points, opts.tangentPx);
  const at = pointBack(points, opts.backPx);
  if (!dir || !at) return undefined;
  const ideal = bestView(views, dir);
  if (!ideal) return undefined;
  let shown: GateView | undefined = has(ideal.deg) ? ideal : undefined;
  if (!shown) {
    for (const v of views) {
      if (!has(v.deg)) continue;
      if (!shown || yawDistance(v.deg, ideal.deg) < yawDistance(shown.deg, ideal.deg)) shown = v;
    }
  }
  if (!shown) return undefined;
  return { deg: shown.deg, ideal: ideal.deg, fallback: shown.deg !== ideal.deg, at, dir, post: shown.post };
}

/**
 * The gate the scene shows on road `pathId` (and validateRace checks): placeGate with the arrival measured
 * over ui.raceGateTangentPx and the pivot gateBackPx(pathId) before the end (ui.raceGateBackPx unless
 * content overrides it for that road).
 */
export function roadGate(pathId: string, points: readonly Point[], views: readonly GateView[], has: (deg: number) => boolean): GatePlacement | undefined {
  const ui = Tokens.ui;
  return placeGate(points, views, has, { tangentPx: ui.raceGateTangentPx, backPx: gateBackPx(pathId, ui.raceGateBackPx) });
}
