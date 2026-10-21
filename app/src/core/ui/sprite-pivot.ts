// Pivots of full-frame atlas sprites (Story 1.8). Every frame is a full 2048×1536 render trimmed by
// the packer; its `spriteSourceSize` says where the visible pixels sat. Pure (no Phaser).
import type { Point } from '../../content/layout-types';

/** The trimmed rect of a frame in render px (from the atlas JSON `spriteSourceSize`). */
export interface TrimmedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Centre of the visible (trimmed) pixels, in design px. */
export function trimmedCentre(frame: TrimmedRect, renderScale: number): Point {
  return { x: (frame.x + frame.width / 2) / renderScale, y: (frame.y + frame.height / 2) / renderScale };
}

/** Size of the visible pixels, in design px. */
export function trimmedSize(frame: TrimmedRect, renderScale: number): { w: number; h: number } {
  return { w: frame.width / renderScale, h: frame.height / renderScale };
}

/** Full-frame origin (0..1) that puts `pivot` (design px) at the image position. */
export function originFor(pivot: Point, design: { readonly width: number; readonly height: number }): { x: number; y: number } {
  return { x: pivot.x / design.width, y: pivot.y / design.height };
}
