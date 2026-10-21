// Ghép khủng long loose-piece size and start arrangement (Story 3.4), pure and shared by the game and
// tools/layout/rules.ts (`.ts` specifiers: the tools import it under Node type stripping; no Phaser).
//
// A loose piece is drawn enlarged to at least draggableItem.minSize (`pieceScale`), centred on its
// trimmed centre; it eases to scale 1 when it snaps (its true, frame-aligned size). Each dino's pieces
// start in the lawn bays `anchor.dino-bay-1..8`: a seeded shuffle of the bays, piece `i` (PIECES order)
// → bay `i`, accepted when every pair of displayed rects keeps spacing.targetGap and every start stays
// dropTarget.snapRadius from every slot of the cut; after START_ATTEMPTS failures, the identity (piece `i` → bay
// `i`), which validateDinoPuzzle proves valid. The validator also proves every bay fits every piece, so
// these two checks are all a shuffle needs.
import { START_ATTEMPTS, type PieceId, type SpeciesId } from '../../content/games/dino-puzzle.ts';
import type { Point } from '../../content/layout-types.ts';
import { mulberry32, shuffled, startSeed } from '../../core/rng.ts';
import type { Rect } from '../../core/safe-rect.ts';
import { Tokens } from '../../core/tokens.ts';

export interface Size {
  readonly w: number;
  readonly h: number;
}

/** A loose piece's scale: `max(1, minSize / rawLongest)` (rawLongest = trimmed longest side ÷ renderScale). */
export function pieceScale(rawLongest: number, minSize: number = Tokens.components.draggableItem.minSize): number {
  return rawLongest > 0 ? Math.max(1, minSize / rawLongest) : 1;
}

/** The loose piece's displayed size: its trimmed size (design px) × pieceScale. */
export function displayedSize(trimmed: Size, minSize: number = Tokens.components.draggableItem.minSize): Size {
  const k = pieceScale(Math.max(trimmed.w, trimmed.h), minSize);
  return { w: trimmed.w * k, h: trimmed.h * k };
}

/** The displayed rect of a loose piece whose trimmed centre is at `c`. */
export function displayedRect(c: Point, trimmed: Size, minSize: number = Tokens.components.draggableItem.minSize): Rect {
  const d = displayedSize(trimmed, minSize);
  return { x: c.x - d.w / 2, y: c.y - d.h / 2, w: d.w, h: d.h };
}

/** A loose piece's hit radius: its displayed longest side / 2 + draggableItem.hitPad. */
export function hitRadius(trimmed: Size, minSize: number = Tokens.components.draggableItem.minSize, hitPad: number = Tokens.components.draggableItem.hitPad): number {
  const d = displayedSize(trimmed, minSize);
  return Math.max(d.w, d.h) / 2 + hitPad;
}

/** Distance between two rects (0 when they touch or overlap). */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
  return Math.hypot(dx, dy);
}

/** What an arrangement reads from the layout and the atlas (design px). */
export interface StartGeo {
  /** The bay points `anchor.dino-bay-1..8`, bay 1 first. */
  readonly bays: readonly Point[];
  /** `slot.<s>-<p>`. */
  slot(s: SpeciesId, p: PieceId): Point;
  /** The piece frame's trimmed size ÷ renderScale. */
  size(s: SpeciesId, p: PieceId): Size;
}

export type Starts = Readonly<Partial<Record<PieceId, Point>>>;

export interface StartLimits {
  /** spacing.targetGap. */
  readonly gap: number;
  /** dropTarget.snapRadius. */
  readonly snapRadius: number;
  /** draggableItem.minSize. */
  readonly minSize: number;
}

export const startLimits = (): StartLimits => ({
  gap: Tokens.spacing.targetGap,
  snapRadius: Tokens.components.dropTarget.snapRadius,
  minSize: Tokens.components.draggableItem.minSize,
});

/** Every pair of the pieces' displayed rects at `at` is at least `gap` apart. */
export function pairsClear(at: Starts, s: SpeciesId, geo: StartGeo, limits: StartLimits = startLimits()): boolean {
  const rects = (Object.entries(at) as [PieceId, Point][]).map(([p, c]) => displayedRect(c, geo.size(s, p), limits.minSize));
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (rectGap(rects[i]!, rects[j]!) < limits.gap) return false;
  return true;
}

/**
 * Every start is at least `snapRadius` from every slot of the arranged pieces (the cut): a piece never
 * starts inside its own snap zone nor inside another piece's, so a small drag off its bay is never
 * resolved as a wrong slot.
 */
export function clearOfSlots(at: Starts, s: SpeciesId, geo: StartGeo, limits: StartLimits = startLimits()): boolean {
  const slots = (Object.keys(at) as PieceId[]).map((p) => geo.slot(s, p));
  return (Object.values(at) as Point[]).every((c) => slots.every((q) => Math.hypot(c.x - q.x, c.y - q.y) >= limits.snapRadius));
}

/** Piece `i` of `cut` → `bays[i]`. */
export function assign(cut: readonly PieceId[], bays: readonly Point[]): Partial<Record<PieceId, Point>> {
  const out: Partial<Record<PieceId, Point>> = {};
  cut.forEach((p, i) => {
    const b = bays[i];
    if (b) out[p] = { x: b.x, y: b.y };
  });
  return out;
}

/**
 * The start spots of a dino's pieces: for attempt 0…START_ATTEMPTS−1, a Fisher–Yates shuffle of the
 * bays with `mulberry32(startSeed(seed, questionIndex, attempt))`, piece `i` → shuffled bay `i`; the
 * first that passes `pairsClear` and `clearOfSlots` wins, else the identity. Deterministic for
 * `(seed, questionIndex, species, cut)` (a resume gets the same spots).
 */
export function arrangeStarts(
  seed: number,
  questionIndex: number,
  species: SpeciesId,
  cut: readonly PieceId[],
  geo: StartGeo,
  limits: StartLimits = startLimits(),
): Partial<Record<PieceId, Point>> {
  const s = (Number.isFinite(seed) ? Math.floor(seed) : 0) >>> 0;
  for (let attempt = 0; attempt < START_ATTEMPTS; attempt++) {
    const at = assign(cut, shuffled(geo.bays, mulberry32(startSeed(s, questionIndex, attempt))));
    if (pairsClear(at, species, geo, limits) && clearOfSlots(at, species, geo, limits)) return at;
  }
  return assign(cut, geo.bays);
}
