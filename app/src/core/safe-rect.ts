// Design-space rect that stays visible under Phaser Scale.ENVELOP (cover) for every
// supported viewport aspect ratio (AD-7). Pure so it can be unit-tested.

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Visible part of a `width`×`height` design frame when ENVELOP-scaled into a viewport of `aspect` (w/h). */
export function visibleRect(width: number, height: number, aspect: number): Rect {
  const designAspect = width / height;
  if (aspect >= designAspect) {
    // Wider viewport: full width, top/bottom cropped.
    const h = width / aspect;
    return { x: 0, y: (height - h) / 2, w: width, h };
  }
  // Taller viewport: full height, left/right cropped.
  const w = height * aspect;
  return { x: (width - w) / 2, y: 0, w, h: height };
}

/**
 * Intersection of the visible rects at the narrowest and widest supported aspect ratios,
 * rounded inward to whole pixels so it never exceeds what is actually visible.
 */
export function computeSafeRect(width: number, height: number, minAspect: number, maxAspect: number): Rect {
  const a = visibleRect(width, height, minAspect);
  const b = visibleRect(width, height, maxAspect);
  const left = Math.ceil(Math.max(a.x, b.x));
  const top = Math.ceil(Math.max(a.y, b.y));
  const right = Math.floor(Math.min(a.x + a.w, b.x + b.w));
  const bottom = Math.floor(Math.min(a.y + a.h, b.y + b.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}
