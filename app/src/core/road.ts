// Road geometry (Story 1.7), pure. An open polyline in design px (`LAYOUTS.map.paths.road`) measured
// by arc length `s` from its first point. The kart lives on `s`: a station's stop is
// `project(anchors['<id>-stop'])`, the start is `project(anchors['kart-start'])`.
// Works on any polyline (Story 4.1 may reuse it for the race track).
import type { Point } from '../content/layout-types';

export interface Road {
  /** Total arc length (0 for fewer than two points). */
  readonly length: number;
  /** Arc length of the nearest point of the road to `p` (the first one on ties). */
  project(p: Point): number;
  /** The point at arc length `s` (clamped to [0, length]). */
  pointAt(s: number): Point;
  /**
   * x component (−1…1) of the unit direction of travel at `s` when moving with `sign` (> 0 forward,
   * < 0 backward). At a vertex the segment ahead in that direction is used. 0 on a vertical segment.
   */
  dirAt(s: number, sign: number): number;
}

interface Segment {
  readonly a: Point;
  readonly b: Point;
  /** Arc length at `a`. */
  readonly s0: number;
  readonly len: number;
}

export function createRoad(points: readonly Point[]): Road {
  const segs: Segment[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    segs.push({ a, b, s0: total, len });
    total += len;
  }
  const first: Point = points[0] ?? { x: 0, y: 0 };
  const clampS = (s: number): number => (Number.isFinite(s) ? Math.min(total, Math.max(0, s)) : 0);

  /** Index of the segment holding `s`; at a vertex, the later one when `ahead`, else the earlier one. */
  const segIndex = (s: number, ahead: boolean): number => {
    for (let i = 0; i < segs.length; i++) {
      const g = segs[i]!;
      const end = g.s0 + g.len;
      if (ahead ? s < end : s <= end) return i;
    }
    return segs.length - 1;
  };

  return {
    length: total,
    project(p) {
      let best = 0;
      let bestD = Infinity;
      for (const g of segs) {
        const dx = g.b.x - g.a.x;
        const dy = g.b.y - g.a.y;
        const t = Math.min(1, Math.max(0, ((p.x - g.a.x) * dx + (p.y - g.a.y) * dy) / (g.len * g.len)));
        const d = Math.hypot(g.a.x + dx * t - p.x, g.a.y + dy * t - p.y);
        if (d < bestD) {
          bestD = d;
          best = g.s0 + g.len * t;
        }
      }
      return best;
    },
    pointAt(s) {
      if (segs.length === 0) return { x: first.x, y: first.y };
      const c = clampS(s);
      const g = segs[segIndex(c, true)]!;
      const t = (c - g.s0) / g.len;
      return { x: g.a.x + (g.b.x - g.a.x) * t, y: g.a.y + (g.b.y - g.a.y) * t };
    },
    dirAt(s, sign) {
      if (segs.length === 0 || sign === 0) return 0;
      const g = segs[segIndex(clampS(s), sign > 0)]!;
      return ((g.b.x - g.a.x) / g.len) * Math.sign(sign);
    },
  };
}
