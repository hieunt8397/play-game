// Pure polygon geometry for tap hit tests (Story 1.5). Design-space px, y down.
import type { Point } from '../../content/layout-types';

export type { Point };

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Tolerance for "on the edge" (design px). */
const EDGE_EPS = 1e-9;

function onSegment(p: Point, a: Point, b: Point): boolean {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > EDGE_EPS * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))) return false;
  return (
    p.x >= Math.min(a.x, b.x) - EDGE_EPS &&
    p.x <= Math.max(a.x, b.x) + EDGE_EPS &&
    p.y >= Math.min(a.y, b.y) - EDGE_EPS &&
    p.y <= Math.max(a.y, b.y) + EDGE_EPS
  );
}

/**
 * True when `p` lies inside `poly` or on its boundary (edges and vertices count as inside).
 * Works for concave polygons (even-odd crossing rule). Fewer than 3 points → false.
 */
export function pointInPolygon(p: Point, poly: readonly Point[]): boolean {
  const n = poly.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (onSegment(p, a, b)) return true;
    if (a.y > p.y !== b.y > p.y) {
      const xCross = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (p.x < xCross) inside = !inside;
    }
  }
  return inside;
}

/** Axis-aligned bounding box of a point list (empty list → zero box at the origin). */
export function boundingBox(points: readonly Point[]): Box {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** `box` grown by `pad` on each side. */
export function padBox(box: Box, pad: number): Box {
  return { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad };
}

/** The 4 corners of `box`, clockwise from top-left. */
export function boxPolygon(box: Box): Point[] {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ];
}
