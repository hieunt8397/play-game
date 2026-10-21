// The only file that reads raw client coordinates (Story 1.6). Under the portrait CSS rotation
// Phaser's canvasBounds is the rotated box, so pointer.x/y mix the axes; the raw client point plus
// core/input/space.ts maps correctly. Phaser reads pageX/Y; the page never scrolls (stage.css), so
// client == page.
import type { Point } from './polygon';

interface TouchLike {
  readonly identifier: number;
  readonly clientX: number;
  readonly clientY: number;
}

interface TouchListLike {
  readonly length: number;
  [index: number]: TouchLike | undefined;
}

/** The slice of `Phaser.Input.Pointer` the adapter needs. */
export interface PointerPointLike {
  readonly x: number;
  readonly y: number;
  /** Touch identifier of the finger this pointer tracks (Phaser `pointer.identifier`). */
  readonly identifier?: number;
  /** The DOM event that last updated the pointer. */
  readonly event?: unknown;
}

/** The slice of `Phaser.Scale.ScaleManager` used for the inverse fallback. */
export interface ScaleLike {
  readonly displayScale: { readonly x: number; readonly y: number };
  readonly canvasBounds: { readonly left: number; readonly top: number };
}

function findTouch(list: TouchListLike | undefined, id: number | undefined): TouchLike | undefined {
  if (!list) return undefined;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t && t.identifier === id) return t;
  }
  return undefined;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** The pointer's client point (CSS px of the viewport). */
export function clientPoint(pointer: PointerPointLike, scale?: ScaleLike): Point {
  const ev = pointer.event as
    | { changedTouches?: TouchListLike; touches?: TouchListLike; clientX?: unknown; clientY?: unknown }
    | null
    | undefined;
  if (ev && typeof ev === 'object') {
    if (ev.changedTouches || ev.touches) {
      const t = findTouch(ev.changedTouches, pointer.identifier) ?? findTouch(ev.touches, pointer.identifier);
      if (t) return { x: t.clientX, y: t.clientY };
    } else if (isFiniteNumber(ev.clientX) && isFiniteNumber(ev.clientY)) {
      return { x: ev.clientX, y: ev.clientY };
    }
  }
  if (!scale || !scale.displayScale.x || !scale.displayScale.y) return { x: pointer.x, y: pointer.y };
  // Inverse of Phaser's transformX/Y: x = (page - canvasBounds.left) * displayScale.x.
  return {
    x: pointer.x / scale.displayScale.x + scale.canvasBounds.left,
    y: pointer.y / scale.displayScale.y + scale.canvasBounds.top,
  };
}
