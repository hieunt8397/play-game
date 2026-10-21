// Pure 2D geometry for screen layouts (Story 1.4): hulls, padding, widths and distances in design px.
// Shared by `npm run render` (it refuses to publish a bad layout) and `validate:content`.
import type { Point } from '../../src/content/layout-types.ts';

const cross = (o: Point, a: Point, b: Point): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Convex hull (Andrew's monotone chain), no collinear points. Counter-clockwise in y-up terms. */
export function convexHull(points: readonly Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const unique = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1]!.x || p.y !== pts[i - 1]!.y);
  if (unique.length < 3) return unique;
  const lower: Point[] = [];
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Corner arc resolution of `padHull`: a 16-gon per vertex. */
const PAD_SEGMENTS = 16;

/**
 * Pads a convex polygon outward by `pad`: the hull of a circumscribed 16-gon of radius `pad` around
 * every vertex, so every point within `pad` of the polygon is inside the result.
 */
export function padHull(hull: readonly Point[], pad: number): Point[] {
  if (pad <= 0) return convexHull(hull);
  const r = pad / Math.cos(Math.PI / PAD_SEGMENTS);
  const pts: Point[] = [];
  for (const v of hull) {
    for (let k = 0; k < PAD_SEGMENTS; k++) {
      const a = (2 * Math.PI * k) / PAD_SEGMENTS;
      pts.push({ x: v.x + r * Math.cos(a), y: v.y + r * Math.sin(a) });
    }
  }
  return convexHull(pts);
}

/** Distance from `p` to the line through `a` and `b`. */
function lineDistance(p: Point, a: Point, b: Point): number {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return len === 0 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs(cross(a, b, p)) / len;
}

/** Minimum width of a polygon (rotating calipers on its hull: min over edges of the farthest vertex). */
export function minWidth(polygon: readonly Point[]): number {
  const hull = convexHull(polygon);
  if (hull.length < 3) return 0;
  let best = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    let far = 0;
    for (const p of hull) far = Math.max(far, lineDistance(p, a, b));
    best = Math.min(best, far);
  }
  return best;
}

/** Ray-casting point-in-polygon (boundary counts as either). */
export function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Distance from `p` to the segment `a`–`b`. */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distance from `p` to an open polyline (Infinity when it has no points). */
export function distToPolyline(p: Point, line: readonly Point[]): number {
  if (line.length === 1) return Math.hypot(p.x - line[0]!.x, p.y - line[0]!.y);
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, distToSegment(p, line[i]!, line[i + 1]!));
  return best;
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

const edges = (poly: readonly Point[]): [Point, Point][] => poly.map((p, i) => [p, poly[(i + 1) % poly.length]!]);

/** Distance between two polygons; 0 when they touch, intersect or one contains the other. */
export function polygonDistance(a: readonly Point[], b: readonly Point[]): number {
  if (a.length === 0 || b.length === 0) return Infinity;
  if (pointInPolygon(a[0]!, b) || pointInPolygon(b[0]!, a)) return 0;
  const ea = edges(a);
  const eb = edges(b);
  let best = Infinity;
  for (const [p, q] of ea) {
    for (const [r, s] of eb) {
      if (segmentsIntersect(p, q, r, s)) return 0;
      best = Math.min(best, distToSegment(p, r, s), distToSegment(q, r, s), distToSegment(r, p, q), distToSegment(s, p, q));
    }
  }
  return best;
}

/** Keeps the part of a convex polygon where `n·p <= c` (Sutherland–Hodgman against one line). */
export function clipHalfPlane(poly: readonly Point[], n: Point, c: number): Point[] {
  const side = (p: Point): number => n.x * p.x + n.y * p.y - c;
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  return out;
}

/**
 * Separates two convex polygons by at least `gap`: picks the edge normal (of either polygon) along
 * which they are best separated, and clips both with parallel lines `gap / 2` either side of the
 * middle of their projections. Returns them unchanged when they are already `gap` apart.
 */
export function separatePair(a: readonly Point[], b: readonly Point[], gap: number): [Point[], Point[]] {
  if (polygonDistance(a, b) >= gap) return [[...a], [...b]];
  let best: { n: Point; mid: number; sep: number } | undefined;
  for (const poly of [a, b]) {
    for (const [p, q] of edges(poly)) {
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      if (len === 0) continue;
      for (const sign of [1, -1]) {
        const n = { x: (sign * (q.y - p.y)) / len, y: (sign * -(q.x - p.x)) / len };
        const pa = a.map((v) => n.x * v.x + n.y * v.y);
        const pb = b.map((v) => n.x * v.x + n.y * v.y);
        const maxA = Math.max(...pa);
        const minB = Math.min(...pb);
        const sep = minB - maxA;
        if (!best || sep > best.sep) best = { n, mid: (maxA + minB) / 2, sep };
      }
    }
  }
  if (!best) return [[...a], [...b]];
  const { n, mid } = best;
  const clippedA = clipHalfPlane(a, n, mid - gap / 2);
  const clippedB = clipHalfPlane(b, { x: -n.x, y: -n.y }, -(mid + gap / 2));
  return [clippedA, clippedB];
}
