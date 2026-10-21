// Small pure rect helpers kept after the island decorations were removed at runtime (parent decision
// 2026-10-21). The art pipeline still checks decoration slots and footprints (tools/layout/rules.ts),
// and `Rect` is shared with it. The `.ts` specifiers let tools/layout/rules.ts import
// this under Node type stripping (one definition for the runtime and the check gate).
import type { Point } from '../content/layout-types.ts';

/** A rect in px (x, y = top-left). */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The map atlas frame of a decoration (same grammar as content/decorations › decorationFrame). */
export const decorationFrameName = (id: string): string => `decoration/${id}/00`;

/**
 * The trimmed frame rect `ss` (render px, in the full frame rendered at `pivot`) placed at slot `at`,
 * design px: every frame of a station's decorations was rendered at `pivot` (slot 1), so at a slot S it
 * is shifted by S − pivot and scaled by 1/renderScale.
 */
export function decorationFootprint(ss: Rect, pivot: Point, at: Point, renderScale: number): Rect {
  return {
    x: ss.x / renderScale + at.x - pivot.x,
    y: ss.y / renderScale + at.y - pivot.y,
    width: ss.width / renderScale,
    height: ss.height / renderScale,
  };
}

/** `r` grown by `pad` on every side. */
export function padRect(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, width: r.width + 2 * pad, height: r.height + 2 * pad };
}

/** The 4 corners of `r`, clockwise from top-left. */
export function rectPolygon(r: Rect): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
}
