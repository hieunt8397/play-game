// Hang tìm bóng geometry (Story 3.5), pure and Phaser-free: shared by the game (ShadowMatch.ts,
// round.ts) and the screen rules (tools/layout/rules.ts › validateShadowMatch), so both read the shadow
// and held-item sizes the same way. Sizes are design px (an atlas frame's trimmed size ÷ renderScale).
import { Tokens } from '../../core/tokens.ts';

export interface Size {
  readonly w: number;
  readonly h: number;
}

/** Half the longest side: the radius a shadow (or an item) shows at true size. */
export const shownRadius = (s: Size): number => Math.max(s.w, s.h) / 2;

/** `shadowR`: the largest item's half longest side (every slot is sized for it). */
export function shadowRadius(sizes: Iterable<Size>): number {
  let r = 0;
  for (const s of sizes) r = Math.max(r, shownRadius(s));
  return r;
}

/** `heldR`: the held item is drawn at `shadowHeldScale` × its shadow size. */
export const heldRadius = (shadowR: number, heldScale: number = Tokens.ui.shadowHeldScale): number => shadowR * heldScale;

/** The held item's hit circle radius: its displayed half longest side + draggableItem.hitPad. */
export const heldHitRadius = (s: Size, heldScale: number = Tokens.ui.shadowHeldScale, hitPad: number = Tokens.components.draggableItem.hitPad): number =>
  shownRadius(s) * heldScale + hitPad;

/**
 * The least distance (design px) from a slot centre to the hand so that no held item ever starts inside
 * a shadow's snap zone, even at hint level 4: shadowR + snapRadius × hintSnapScale + heldR.
 */
export const minHandDistance = (
  shadowR: number,
  snapRadius: number = Tokens.components.dropTarget.snapRadius,
  hintSnapScale: number = Tokens.ui.hintSnapScale,
  heldScale: number = Tokens.ui.shadowHeldScale,
): number => shadowR + snapRadius * hintSnapScale + heldRadius(shadowR, heldScale);
