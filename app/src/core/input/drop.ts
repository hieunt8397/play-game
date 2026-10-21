// Drop maths (Story 1.8, AD-4), pure: where a dragged item may go, the Hud keep-out circles, drop
// targets and nudging a resting item clear of its neighbours. Coordinates are design px.
import { hudLayout } from '../hud';
import type { Rect } from '../safe-rect';
import { Tokens } from '../tokens';
import { inputGuard, type InputGuard } from './guard';
import { pointInPolygon, type Point } from './polygon';
import { designInsets, envelop, localInsets, visibleDesignRect, type View } from './space';
import { inCircle, type Circle } from './tap-target';

export type { Circle, Rect };

/** The visible design rect inset by the edge dead strips plus the safe-area insets (÷ s). */
export function dragBounds(view: View): Rect {
  const sp = Tokens.spacing;
  const { s } = envelop(view);
  const li = localInsets(view);
  const v = visibleDesignRect(view);
  const left = (sp.edgeDeadSide + li.left) / s;
  const right = (sp.edgeDeadSide + li.right) / s;
  const top = (sp.edgeDeadTop + li.top) / s;
  const bottom = (sp.edgeDeadBottom + li.bottom) / s;
  return { x: v.x + left, y: v.y + top, w: v.w - left - right, h: v.h - top - bottom };
}

/** The Hud buttons as keep-out circles (r = size/2 + hitPad). */
export function hudExclusions(view: View): Circle[] {
  const hud = hudLayout(visibleDesignRect(view), designInsets(view));
  return [hud.home, hud.speaker];
}

const clamp = (v: number, lo: number, hi: number): number => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

function clampToRect(p: Point, r: Rect, inset: number): Point {
  return { x: clamp(p.x, r.x + inset, r.x + r.w - inset), y: clamp(p.y, r.y + inset, r.y + r.h - inset) };
}

/**
 * Clamps an item centre into `bounds` shrunk by `itemRadius`, then pushes it radially out of every
 * exclusion circle grown by `itemRadius` (and back into the bounds).
 */
export function clampDrag(p: Point, bounds: Rect, exclusions: readonly Circle[], itemRadius: number): Point {
  let q = clampToRect(p, bounds, itemRadius);
  for (const c of exclusions) {
    const r = c.r + itemRadius;
    const dx = q.x - c.x;
    const dy = q.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d >= r) continue;
    // Exactly on the centre: push straight down (towards the play area).
    const ux = d > 0 ? dx / d : 0;
    const uy = d > 0 ? dy / d : 1;
    q = clampToRect({ x: c.x + ux * r, y: c.y + uy * r }, bounds, itemRadius);
  }
  return q;
}

/**
 * A circle target, optionally with `pad` (Story 3.1): hit radius = pad + r × snapScale, so only the
 * forgiving margin `r` scales (the pizza base: pad = its radius, r = snapRadius beyond its edge).
 */
export type DropTargetSpec =
  | { readonly id: string; readonly circle: Circle; readonly pad?: number }
  | { readonly id: string; readonly polygon: readonly Point[] };

export interface DropTarget {
  readonly id: string;
  contains(p: Point): boolean;
  /** The current circle (pad + radius × snapScale), undefined for a polygon target. */
  circle(): Circle | undefined;
}

/** A drop area. A circle's radius is multiplied by `guard.snapScale(target)` (plus its `pad`); polygons do not scale. */
export function createDropTarget(spec: DropTargetSpec, guard: InputGuard = inputGuard): DropTarget {
  if ('circle' in spec) {
    const base = spec.circle;
    const pad = spec.pad ?? 0;
    const target: DropTarget = {
      id: spec.id,
      circle: () => ({ x: base.x, y: base.y, r: pad + base.r * guard.snapScale(target) }),
      contains: (p) => inCircle(p, target.circle()!),
    };
    return target;
  }
  const polygon = spec.polygon;
  return { id: spec.id, circle: () => undefined, contains: (p) => pointInPolygon(p, polygon) };
}

const NUDGE_ITERATIONS = 12;
/** The ring search steps out by minDist / this. */
const RING_STEP_DIVISOR = 2;
/** Candidate points on ring k: k × this (the first ring has this many). */
const RING_POINTS_PER_STEP = 8;
/** A point this close (design px) to minDist still counts as clear (float noise). */
export const CLEAR_EPSILON = 1e-6;

const clearOf = (q: Point, others: readonly Point[], minDist: number): boolean =>
  others.every((o) => Math.hypot(q.x - o.x, q.y - o.y) >= minDist - CLEAR_EPSILON);

/**
 * Moves `p` until it is at least `minDist` from every point of `others`, staying inside `rect`. First
 * the local push (each neighbour in turn); if that ends in an overlap (near an edge, or wedged between
 * two items), a clear point on the nearest ring around `p` inside `rect` (see `ringSearch`). Only a
 * full rect keeps the push's last position (best effort: it may still overlap).
 */
export function nudgeApart(p: Point, others: readonly Point[], minDist: number, rect: Rect): Point {
  let q = clampToRect(p, rect, 0);
  for (let i = 0; i < NUDGE_ITERATIONS; i++) {
    let moved = false;
    for (const o of others) {
      const dx = q.x - o.x;
      const dy = q.y - o.y;
      const d = Math.hypot(dx, dy);
      if (d >= minDist) continue;
      // Coincident: step sideways (the counter is a row).
      const ux = d > 0 ? dx / d : 1;
      const uy = d > 0 ? dy / d : 0;
      q = clampToRect({ x: o.x + ux * minDist, y: o.y + uy * minDist }, rect, 0);
      moved = true;
    }
    if (!moved) break;
  }
  if (clearOf(q, others, minDist)) return q;
  return ringSearch(clampToRect(p, rect, 0), others, minDist, rect) ?? q;
}

/**
 * The first clear point inside `rect` on rings of radius k × minDist/2 around `c` (the innermost ring
 * first; on a ring, scanning from +x round the circle); undefined when the rect is full.
 */
function ringSearch(c: Point, others: readonly Point[], minDist: number, rect: Rect): Point | undefined {
  const step = minDist / RING_STEP_DIVISOR;
  if (!(step > 0)) return undefined;
  const rings = Math.ceil(Math.hypot(rect.w, rect.h) / step);
  for (let k = 1; k <= rings; k++) {
    const n = RING_POINTS_PER_STEP * k;
    for (let j = 0; j < n; j++) {
      const a = (2 * Math.PI * j) / n;
      const q = { x: c.x + Math.cos(a) * step * k, y: c.y + Math.sin(a) * step * k };
      if (inRect(q, rect) && clearOf(q, others, minDist)) return q;
    }
  }
  return undefined;
}

/** Story 5.1: `p` lies inside `r` (edges included). */
export function inRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** Intersection of two rects (empty → a zero-size rect at the first's centre). */
export function intersectRect(a: Rect, b: Rect): Rect {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 < x0 || y1 < y0) return { x: a.x + a.w / 2, y: a.y + a.h / 2, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
