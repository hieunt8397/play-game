// Home / Speaker keep-out zones for game screens (Story 3.1; reused by 3.3, 3.5 and 4.x). Pure.
// The Hud buttons (spec-1-6 `core/hud.ts › hudLayout`) sit at fixed offsets from the visible design
// rect, which moves with the iPad aspect. Over both supported aspects (Tokens.supportedAspect min and
// max, no safe-area insets) each button centre gets a HUD_KEEP_OUT_PX square; nothing interactive of a
// game screen may reach into one. `.ts` specifiers: run by Node type stripping (render, atlas, check).
import type { Rect } from '../../src/core/safe-rect.ts';
import { Tokens } from '../../src/core/tokens.ts';
import { sceneBubbleCentres } from '../../src/core/scene-bubbles.ts';
import { TOUCH_TALK_SCENE_SLOTS } from '../../src/content/games/touch-talk.ts';

/** Side of the square kept clear around each Hud button centre (design px; EXPERIENCE "~120×120"; ui.hudKeepOutPx). */
export const HUD_KEEP_OUT_PX = Tokens.ui.hudKeepOutPx;

/** The design rect an ENVELOP (cover) stage of aspect `w/h` shows. */
export function visibleRectAt(aspect: number, design: { width: number; height: number } = Tokens.design): Rect {
  const designAspect = design.width / design.height;
  if (aspect >= designAspect) {
    const h = design.width / aspect;
    return { x: 0, y: (design.height - h) / 2, w: design.width, h };
  }
  const w = design.height * aspect;
  return { x: (design.width - w) / 2, y: 0, w, h: design.height };
}

/** Home and Speaker centres for one visible rect (the same offsets as core/hud.ts › hudLayout, no insets). */
export function hudCentres(visible: Rect): { home: { x: number; y: number }; speaker: { x: number; y: number } } {
  const sp = Tokens.spacing;
  const half = Tokens.components.buttonRound.size / 2;
  return {
    home: { x: visible.x + sp.edgeInset + half, y: visible.y + sp.buttonTop + half },
    speaker: { x: visible.x + visible.w - sp.edgeInset - half, y: visible.y + sp.speakerTop + half },
  };
}

/** The keep-out squares (design px) of Home and Speaker over both supported aspects (duplicates dropped). */
export function hudKeepOutRects(aspects: readonly number[] = [Tokens.supportedAspect.min, Tokens.supportedAspect.max]): Rect[] {
  const half = HUD_KEEP_OUT_PX / 2;
  const out: Rect[] = [];
  for (const a of aspects) {
    const c = hudCentres(visibleRectAt(a));
    for (const p of [c.home, c.speaker]) {
      const r = { x: p.x - half, y: p.y - half, w: HUD_KEEP_OUT_PX, h: HUD_KEEP_OUT_PX };
      if (!out.some((o) => o.x === r.x && o.y === r.y)) out.push(r);
    }
  }
  return out;
}

/**
 * Story 4.5: the right-edge area the Chạm là nói scene bubbles use (2026-10-21: both columns of six): over
 * both supported aspects, the bounding rect of the `slots` bubble circles (core/scene-bubbles.ts) grown by
 * spacing.targetGap; the union.
 */
export function sceneBubbleKeepOutRect(slots: number = TOUCH_TALK_SCENE_SLOTS, aspects: readonly number[] = [Tokens.supportedAspect.min, Tokens.supportedAspect.max]): Rect {
  const r = Tokens.components.sceneBubble.base.size / 2 + Tokens.spacing.targetGap;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const a of aspects) {
    const speaker = hudCentres(visibleRectAt(a)).speaker;
    for (const c of sceneBubbleCentres({ speaker: { ...speaker, r: 0 } }, slots)) {
      x0 = Math.min(x0, c.x - r);
      y0 = Math.min(y0, c.y - r);
      x1 = Math.max(x1, c.x + r);
      y1 = Math.max(y1, c.y + r);
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** True when a circle (centre `p`, radius `r`) reaches into `rect`. */
export function circleHitsRect(p: { x: number; y: number }, r: number, rect: Rect): boolean {
  const dx = Math.max(rect.x - p.x, 0, p.x - (rect.x + rect.w));
  const dy = Math.max(rect.y - p.y, 0, p.y - (rect.y + rect.h));
  return Math.hypot(dx, dy) < r;
}
