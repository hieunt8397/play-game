// raw.json (render_screen.py, render px) → ScreenLayout v1 (design px). Pure (Story 1.4).
// Checks the naming contract `<kind>.<id>`, duplicates and out-of-frame points; divides by the
// render scale; hulls and pads hit polygons; rounds to 0.1; serialises with sorted keys.
import type { Point, ScreenLayout } from '../../src/content/layout-types.ts';
import { convexHull, padHull, separatePair } from './geometry.ts';

export interface RawObject {
  name: string;
  type: string;
  /** [x, y, depth] in render px (top-left origin, y down); depth <= 0 is behind the camera. */
  points: number[][];
}

export interface RawProjection {
  screenId: string;
  render: { width: number; height: number };
  objects: RawObject[];
  frames: string[];
  /** Story 3.3: sprite objects whose ghost frame render.ts derives (collection prop `ghost`). */
  ghosts?: string[];
  /** Story 3.5: sprite objects whose shadow frame render.ts derives (collection prop `silhouette`). */
  silhouettes?: string[];
}

export interface ToLayoutOptions {
  design: { width: number; height: number };
  /** Tokens.spacing.hitPad: hit polygons are padded outward by this (design px). */
  hitPad: number;
  /**
   * Hit ids kept at least `gap` apart (the map's stations, `Tokens.spacing.stationGap`). Padded
   * hulls closer than that are clipped by parallel lines either side of their best separating axis
   * (perspective makes tall props reach into the station behind them; see spec 1.4 Spec Change Log).
   */
  separate?: { ids: readonly string[]; gap: number };
  /**
   * Story 1.8: hit ids kept exactly as projected (hulled, not padded) — drop areas whose edge is a
   * rule (Tiệm kem `counter-upper`: serve above, rest below), not a finger target.
   */
  unpadded?: readonly string[];
}

/** Extra separation so rounding to 0.1 never brings two hits under the gap. */
const SEPARATION_MARGIN = 0.5;

export const LAYOUT_KINDS = ['anchor', 'hit', 'slot', 'path'] as const;
export type LayoutKind = (typeof LAYOUT_KINDS)[number];

/** `<kind>.<id>`, id kebab-case: `hit.pizza`, `anchor.pizza-stop`. */
export const LAYOUT_NAME = /^(anchor|hit|slot|path)\.([a-z0-9]+(-[a-z0-9]+)*)$/;

export class LayoutError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(problems.join('\n'));
    this.problems = problems;
  }
}

/** Rounds to 0.1 (no -0). */
export const round1 = (v: number): number => Math.round(v * 10) / 10 + 0;

const roundPoint = (p: Point): Point => ({ x: round1(p.x), y: round1(p.y) });

function sortRecord<T>(rec: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.keys(rec).sort().map((k) => [k, rec[k]!]));
}

/** Converts a raw projection to a layout, or throws a LayoutError listing every problem. */
export function toLayout(raw: RawProjection, opts: ToLayoutOptions): ScreenLayout {
  const problems: string[] = [];
  const { width: rw, height: rh } = raw.render;
  const scale = rw / opts.design.width;
  if (!(scale > 0) || Math.abs(rh / opts.design.height - scale) > 1e-9) {
    throw new LayoutError([`render size ${rw}×${rh} is not a multiple of the ${opts.design.width}×${opts.design.height} design`]);
  }
  const anchors: Record<string, Point> = {};
  const hits: Record<string, Point[]> = {};
  const slots: Record<string, Point> = {};
  const paths: Record<string, Point[]> = {};
  const seen = new Set<string>();

  for (const obj of raw.objects) {
    const m = LAYOUT_NAME.exec(obj.name);
    if (!m) {
      problems.push(`layout object "${obj.name}": name must be <anchor|hit|slot|path>.<kebab-id> (no Blender .001 suffix, lower case)`);
      continue;
    }
    if (seen.has(obj.name)) {
      problems.push(`layout object "${obj.name}": duplicate id`);
      continue;
    }
    seen.add(obj.name);
    const kind = m[1] as LayoutKind;
    const id = m[2]!;
    const out = obj.points.filter((p) => !(p[2]! > 0 && p[0]! >= 0 && p[0]! <= rw && p[1]! >= 0 && p[1]! <= rh));
    if (out.length > 0) {
      problems.push(`layout object "${obj.name}": ${out.length} point(s) behind the camera or outside the ${rw}×${rh} render`);
      continue;
    }
    const pts: Point[] = obj.points.map((p) => ({ x: p[0]! / scale, y: p[1]! / scale }));
    if (kind === 'anchor' || kind === 'slot') {
      if (pts.length !== 1) {
        problems.push(`layout object "${obj.name}": an ${kind} needs exactly one point (got ${pts.length})`);
        continue;
      }
      (kind === 'anchor' ? anchors : slots)[id] = roundPoint(pts[0]!);
    } else if (kind === 'path') {
      if (pts.length < 2) {
        problems.push(`layout object "${obj.name}": a path needs at least 2 points (got ${pts.length})`);
        continue;
      }
      paths[id] = pts.map(roundPoint);
    } else {
      const hull = convexHull(pts);
      if (hull.length < 3) {
        problems.push(`layout object "${obj.name}": a hit needs at least 3 non-collinear points`);
        continue;
      }
      hits[id] = opts.unpadded?.includes(id) ? hull : padHull(hull, opts.hitPad);
    }
  }
  if (problems.length > 0) throw new LayoutError(problems);
  if (opts.separate) {
    const ids = [...opts.separate.ids].filter((id) => hits[id]).sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = separatePair(hits[ids[i]!]!, hits[ids[j]!]!, opts.separate.gap + SEPARATION_MARGIN);
        hits[ids[i]!] = a;
        hits[ids[j]!] = b;
      }
    }
  }
  for (const id of Object.keys(hits)) hits[id] = hits[id]!.map(roundPoint);
  return {
    v: 1,
    screenId: raw.screenId,
    design: { width: opts.design.width, height: opts.design.height },
    renderScale: scale,
    anchors: sortRecord(anchors),
    hits: sortRecord(hits),
    slots: sortRecord(slots),
    paths: sortRecord(paths),
  };
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(rec).sort().map((k) => [k, sortDeep(rec[k])]));
  }
  return value;
}

/** Deterministic JSON: sorted keys, 2-space indent, one `{ "x": …, "y": … }` point per line. */
export function formatLayout(layout: ScreenLayout): string {
  const text = JSON.stringify(sortDeep(layout), null, 2);
  return `${text.replace(/\{\n\s+"x": (-?[\d.e+-]+),\n\s+"y": (-?[\d.e+-]+)\n\s+\}/g, '{ "x": $1, "y": $2 }')}\n`;
}
