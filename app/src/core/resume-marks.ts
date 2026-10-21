// Resume marks (Story 2.5, UX-DR38), pure: where Map draws the small static ring on each station that
// holds an in-session resume point. One mark per id, centred on the top-right corner of the bbox of the
// station's hit polygon, moved inwards by ui.resumeMarkRadiusPx on both axes, then clamped so the whole
// mark (radius plus its ink outline) lies inside the interactive rect (safeRect minus the edge dead bands,
// spec-2-2's rule). An id with no hit polygon gets no mark.
import type { Point } from '../content/layout-types';
import { boundingBox } from './input/polygon';
import { Tokens } from './tokens';

/** x∈[x0,x1], y∈[y0,y1] (design px). */
export interface InteractiveRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** safeRect inset by the edge dead bands (side 24, top 32, bottom 40): the interactive rect (spec-2-2's rule). */
export function islandInteractiveRect(): InteractiveRect {
  const s = Tokens.safeRect;
  const sp = Tokens.spacing;
  return { x0: s.x + sp.edgeDeadSide, y0: s.y + sp.edgeDeadTop, x1: s.x + s.w - sp.edgeDeadSide, y1: s.y + s.h - sp.edgeDeadBottom };
}

/** Width (design px) of the ink outline drawn outside the annulus and inside its hole. */
export const RESUME_MARK_OUTLINE_PX = 2;

/** The drawn mark's outer radius: the annulus plus its outer ink outline. */
export const RESUME_MARK_EXTENT = Tokens.ui.resumeMarkRadiusPx + RESUME_MARK_OUTLINE_PX;

export interface ResumeMarkAt {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

const clamp = (v: number, lo: number, hi: number): number => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

/** The mark centres for `ids` (in the given order); ids without a hit polygon are skipped. */
export function resumeMarkPlan(
  ids: readonly string[],
  hits: Readonly<Record<string, readonly Point[]>>,
  interactive: InteractiveRect = islandInteractiveRect(),
): ResumeMarkAt[] {
  const r = Tokens.ui.resumeMarkRadiusPx;
  const e = RESUME_MARK_EXTENT;
  const out: ResumeMarkAt[] = [];
  for (const id of ids) {
    const hit = hits[id];
    if (!hit || hit.length === 0) continue;
    const box = boundingBox(hit);
    const x = clamp(box.x + box.width - r, interactive.x0 + e, interactive.x1 - e);
    const y = clamp(box.y + r, interactive.y0 + e, interactive.y1 - e);
    out.push({ id, x, y });
  }
  return out;
}
