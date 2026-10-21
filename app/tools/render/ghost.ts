// Ghost frames (Story 3.3), generic: for a sprite collection with the `ghost: true` prop, `npm run render`
// derives `frames/<object>/ghost/00.png` from `<object>/idle/00.png` after the Blender pass:
//   1. traceOuterContours: marching squares over the alpha channel (threshold 128), every outer
//      contour (one per solid component; holes dropped);
//   2. simplify: Douglas–Peucker with ε = 1 px;
//   3. ghostSvg: the contours filled with `ghostSlot.fill` at `ghostSlot.fillOpacity` and stroked with
//      `ghostSlot.line.color`, width `line.width × renderScale`, dashes `ui.ghostDash × renderScale`;
//      rasterised full-canvas with sharp, so the ghost lines up pixel-for-pixel with the idle frame.
// Blender cannot draw a 2D dashed outline, hence this step. Pure and deterministic: the same idle frame
// always gives the same bytes.
// Story 3.5 (generic): for a sprite collection with the `silhouette: true` prop, `npm run render` derives
// `frames/<object>/shadow/00.png` from `<object>/color/00.png` (silhouetteFrame): the same canvas with
// every pixel's RGB set to `colors.shadowTarget` and its alpha unchanged, so both frames have the same
// outline and the same trimmed rect. Deterministic too.
import sharp from 'sharp';
import { Tokens } from '../../src/core/tokens.ts';

export interface Pt {
  readonly x: number;
  readonly y: number;
}

export const GHOST_ALPHA_THRESHOLD = 128;
export const GHOST_SIMPLIFY_PX = 1;

// Marching-squares corner bits (TL 8, TR 4, BR 2, BL 1) → segments between edge midpoints.
type Edge = 'T' | 'R' | 'B' | 'L';
const CASES: Readonly<Record<number, readonly (readonly [Edge, Edge])[]>> = {
  1: [['L', 'B']],
  2: [['B', 'R']],
  3: [['L', 'R']],
  4: [['T', 'R']],
  // Saddles: each inside corner is cut off on its own (4-connected solids).
  5: [['T', 'R'], ['L', 'B']],
  6: [['T', 'B']],
  7: [['T', 'L']],
  8: [['T', 'L']],
  9: [['T', 'B']],
  10: [['T', 'L'], ['B', 'R']],
  11: [['T', 'R']],
  12: [['L', 'R']],
  13: [['B', 'R']],
  14: [['L', 'B']],
};
const CORNERS: readonly (readonly [number, number, number])[] = [
  [8, 0, 0],
  [4, 2, 0],
  [2, 2, 2],
  [1, 0, 2],
];

/** Edge midpoints of cell (cx, cy) in doubled integer coordinates (pixel centres at even numbers). */
function mid(e: Edge, cx: number, cy: number): [number, number] {
  switch (e) {
    case 'T':
      return [2 * cx + 1, 2 * cy];
    case 'R':
      return [2 * cx + 2, 2 * cy + 1];
    case 'B':
      return [2 * cx + 1, 2 * cy + 2];
    case 'L':
      return [2 * cx, 2 * cy + 1];
  }
}

/** Signed shoelace area (image coordinates, y down); outer contours are positive here. */
export function signedArea(poly: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Every outer contour of the pixels whose alpha is ≥ `threshold` (pixel-centre coordinates: pixel
 * (x, y) is the point (x, y)). Segments are oriented with the solid side consistent, so outer loops
 * have a positive signed area and holes a negative one; holes are dropped. Deterministic order (by
 * the first segment found in a row-major scan).
 */
export function traceOuterContours(alpha: Uint8Array, w: number, h: number, threshold = GHOST_ALPHA_THRESHOLD): Pt[][] {
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && alpha[y * w + x]! >= threshold;
  const W2 = 2 * (w + 1) + 3;
  const key = (p: readonly [number, number]): number => (p[1] + 2) * W2 + (p[0] + 2);
  const next = new Map<number, number>();
  const pos = new Map<number, [number, number]>();
  const starts: number[] = [];
  for (let cy = -1; cy < h; cy++) {
    for (let cx = -1; cx < w; cx++) {
      const bits = (solid(cx, cy) ? 8 : 0) | (solid(cx + 1, cy) ? 4 : 0) | (solid(cx + 1, cy + 1) ? 2 : 0) | (solid(cx, cy + 1) ? 1 : 0);
      const segs = CASES[bits];
      if (!segs) continue;
      for (const [ea, eb] of segs) {
        let a = mid(ea, cx, cy);
        let b = mid(eb, cx, cy);
        // The solid corner nearest the segment's middle decides its direction (solid on one fixed side).
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        let best: [number, number] | undefined;
        let bestD = Infinity;
        for (const [bit, dx, dy] of CORNERS) {
          if (!(bits & bit)) continue;
          const c: [number, number] = [2 * cx + dx, 2 * cy + dy];
          const d = (c[0] - mx) ** 2 + (c[1] - my) ** 2;
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        const c = best!;
        const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (cross < 0) [a, b] = [b, a];
        const ka = key(a);
        next.set(ka, key(b));
        pos.set(ka, a);
        pos.set(key(b), b);
        starts.push(ka);
      }
    }
  }
  const used = new Set<number>();
  const out: Pt[][] = [];
  for (const s of starts) {
    if (used.has(s)) continue;
    const loop: Pt[] = [];
    let k: number | undefined = s;
    while (k !== undefined && !used.has(k)) {
      used.add(k);
      const p = pos.get(k)!;
      loop.push({ x: p[0] / 2, y: p[1] / 2 });
      k = next.get(k);
    }
    if (loop.length >= 3 && signedArea(loop) > 0) out.push(loop);
  }
  return out;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function dpOpen(pts: readonly Pt[], eps: number): Pt[] {
  if (pts.length <= 2) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [i, j] = stack.pop()!;
    let far = -1;
    let farD = eps;
    for (let k = i + 1; k < j; k++) {
      const d = segDist(pts[k]!, pts[i]!, pts[j]!);
      if (d > farD) {
        farD = d;
        far = k;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([i, far], [far, j]);
    }
  }
  return pts.filter((_, k) => keep[k] === 1);
}

/** Douglas–Peucker for a closed polyline: split at point 0 and the point farthest from it. */
export function simplify(poly: readonly Pt[], eps = GHOST_SIMPLIFY_PX): Pt[] {
  if (poly.length <= 3) return [...poly];
  const p0 = poly[0]!;
  let far = 1;
  let farD = -1;
  for (let k = 1; k < poly.length; k++) {
    const d = Math.hypot(poly[k]!.x - p0.x, poly[k]!.y - p0.y);
    if (d > farD) {
      farD = d;
      far = k;
    }
  }
  const first = dpOpen(poly.slice(0, far + 1), eps);
  const second = dpOpen([...poly.slice(far), p0], eps);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

export interface GhostStyle {
  readonly fill: string;
  readonly fillOpacity: number;
  readonly line: string;
  /** Render px. */
  readonly lineWidth: number;
  /** Render px: dash, gap. */
  readonly dash: readonly [number, number];
}

/** The ghost-slot look from Tokens at `renderScale` (line width and dashes are design px × renderScale). */
export function ghostStyle(renderScale: number): GhostStyle {
  const g = Tokens.components.ghostSlot;
  const [dash, gap] = Tokens.ui.ghostDash;
  return { fill: g.fill.css, fillOpacity: g.fillOpacity, line: g.line.color.css, lineWidth: g.line.width * renderScale, dash: [dash * renderScale, gap * renderScale] };
}

const num = (v: number): string => String(Math.round(v * 100) / 100);

/**
 * An SVG of the full `w`×`h` canvas: every contour (pixel-centre coordinates, shifted by half a pixel
 * into SVG space) as one path, filled and stroked with a dashed line.
 */
export function ghostSvg(contours: readonly (readonly Pt[])[], w: number, h: number, style: GhostStyle): string {
  const d = contours
    .filter((c) => c.length >= 3)
    .map((c) => `M${c.map((p) => `${num(p.x + 0.5)} ${num(p.y + 0.5)}`).join('L')}Z`)
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    (d
      ? `<path d="${d}" fill="${style.fill}" fill-opacity="${style.fillOpacity}" fill-rule="nonzero" stroke="${style.line}" stroke-width="${num(style.lineWidth)}" stroke-dasharray="${num(style.dash[0])} ${num(style.dash[1])}" stroke-linejoin="round" stroke-linecap="butt"/>`
      : '') +
    '</svg>'
  );
}

/** The ghost frame (PNG, same size as `idlePng`) of an idle frame. */
export async function ghostFrame(idlePng: Buffer, renderScale: number): Promise<Buffer> {
  const { data, info } = await sharp(idlePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = data[i * channels + channels - 1]!;
  const contours = traceOuterContours(alpha, w, h).map((c) => simplify(c));
  const svg = ghostSvg(contours, w, h, ghostStyle(renderScale));
  return sharp(Buffer.from(svg)).ensureAlpha().png().toBuffer();
}

/** Story 3.5: the RGB every silhouette pixel takes (colors.shadowTarget). */
export function silhouetteRgb(hex: string = Tokens.colors.shadowTarget.css): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Story 3.5: the shadow frame (PNG, same size as `colorPng`): RGB := `rgb`, alpha unchanged. */
export async function silhouetteFrame(colorPng: Buffer, rgb: readonly [number, number, number] = silhouetteRgb()): Promise<Buffer> {
  const { data, info } = await sharp(colorPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = rgb[0];
    out[i * 4 + 1] = rgb[1];
    out[i * 4 + 2] = rgb[2];
    out[i * 4 + 3] = data[i * channels + channels - 1]!;
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}
