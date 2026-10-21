// Story 3.6: measured silhouettes of Hang tìm bóng (run by `validate:content`). Every pair of catalogue
// items of one shape group must cast shadows that really differ on the committed render: the alpha masks
// of their `item-<id>/shadow/00` frames (alpha ≥ MASK_ALPHA) are scaled to the same longest side,
// aligned by bottom-centre, and their intersection-over-union must stay ≤ ui.shadowMaxIoU. Every pair's
// IoU is reported as an info line. `silhouetteIoU` is the pure part (unit-tested); the atlas page is
// read with sharp.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { ATLASES } from '../../src/content/assets.ts';
import { SHAPE_ITEMS, itemFrames } from '../../src/content/games/shadow-match.ts';
import { Tokens } from '../../src/core/tokens.ts';

/** A pixel counts as shadow when its alpha is at least this. */
export const MASK_ALPHA = 128;
/** Both masks are resampled to this longest side (px) before they are compared. */
export const MASK_SIDE = 128;

/** A binary mask, row-major: `data[y * w + x]` is 1 inside the silhouette. */
export interface Mask {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;
}

/** `m` scaled (nearest neighbour) so its longest side is `side`, on a side × side canvas, bottom-centred. */
function normalise(m: Mask, side: number): Uint8Array {
  const out = new Uint8Array(side * side);
  if (m.w <= 0 || m.h <= 0) return out;
  const k = side / Math.max(m.w, m.h);
  const w = Math.max(1, Math.round(m.w * k));
  const h = Math.max(1, Math.round(m.h * k));
  const x0 = Math.floor((side - w) / 2);
  const y0 = side - h;
  for (let y = 0; y < h; y++) {
    const sy = Math.min(m.h - 1, Math.floor((y + 0.5) / k));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(m.w - 1, Math.floor((x + 0.5) / k));
      out[(y0 + y) * side + x0 + x] = m.data[sy * m.w + sx] ? 1 : 0;
    }
  }
  return out;
}

/**
 * The intersection-over-union of two silhouettes after scaling both to the same longest side and
 * aligning them by bottom-centre: 1 for identical shapes, 0 for disjoint ones (and for two empty masks).
 */
export function silhouetteIoU(a: Mask, b: Mask, side: number = MASK_SIDE): number {
  const na = normalise(a, side);
  const nb = normalise(b, side);
  let inter = 0;
  let union = 0;
  for (let i = 0; i < na.length; i++) {
    if (na[i] && nb[i]) inter++;
    if (na[i] || nb[i]) union++;
  }
  return union === 0 ? 0 : inter / union;
}

interface FrameJson {
  readonly frame: { x: number; y: number; w: number; h: number };
  readonly rotated?: boolean;
}

/** The pairs of one group whose IoU exceeds `max` (problems), and every pair's IoU (info). */
export function iouReport(masks: ReadonlyMap<string, Mask>, items: readonly { id: string; shapeGroup: string }[], max: number): { problems: string[]; info: string[] } {
  const problems: string[] = [];
  const info: string[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      if (a.shapeGroup !== b.shapeGroup) continue;
      const ma = masks.get(a.id);
      const mb = masks.get(b.id);
      if (!ma || !mb) continue;
      const iou = silhouetteIoU(ma, mb);
      info.push(`shadow-match silhouettes ${a.id} / ${b.id} (${a.shapeGroup}): IoU ${iou.toFixed(3)}`);
      if (iou > max) problems.push(`shadow-match items "${a.id}" and "${b.id}" (${a.shapeGroup}): their shadows overlap at IoU ${iou.toFixed(3)} (max ${max})`);
    }
  }
  return { problems, info };
}

/**
 * Reads every `item-<id>/shadow/00` from the committed `atlas.shadow-match` page under `publicDir` and
 * checks every same-group pair. A missing atlas, a missing or rotated frame is a problem naming it.
 */
export async function shadowDistinct(publicDir: string, items: readonly { id: string; shapeGroup: string }[] = SHAPE_ITEMS, max: number = Tokens.ui.shadowMaxIoU): Promise<{ problems: string[]; info: string[] }> {
  const ref = ATLASES['shadow-match'];
  const jsonFile = resolve(publicDir, ref.json);
  const pngFile = resolve(publicDir, ref.png);
  if (!existsSync(jsonFile) || !existsSync(pngFile)) return { problems: [`shadow-match silhouettes: atlas ${ref.json} or ${ref.png} is missing`], info: [] };
  const frames = (JSON.parse(readFileSync(jsonFile, 'utf8')) as { frames?: Record<string, FrameJson> }).frames ?? {};
  const { data, info } = await sharp(pngFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const problems: string[] = [];
  const masks = new Map<string, Mask>();
  for (const it of items) {
    const name = itemFrames(it.id as (typeof SHAPE_ITEMS)[number]['id']).shadow;
    const f = frames[name];
    if (!f) {
      problems.push(`shadow-match silhouettes: frame "${name}" is missing from ${ref.json}`);
      continue;
    }
    if (f.rotated) {
      problems.push(`shadow-match silhouettes: frame "${name}" is rotated in ${ref.json} (the rule reads unrotated rects)`);
      continue;
    }
    const { x, y, w, h } = f.frame;
    const m = new Uint8Array(w * h);
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const a = data[((y + yy) * info.width + (x + xx)) * info.channels + 3]!;
        m[yy * w + xx] = a >= MASK_ALPHA ? 1 : 0;
      }
    }
    masks.set(it.id, { w, h, data: m });
  }
  const report = iouReport(masks, items, max);
  return { problems: [...problems, ...report.problems], info: report.info };
}
