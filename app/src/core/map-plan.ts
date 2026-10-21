// Map planning (Story 1.5), pure. Turns the generated layout (spec-1-4 contract) + content stations
// into what the Map scene draws and registers:
//   - each station's full-frame image `<id>/idle/00`: positioned at anchors[id] with origin
//     anchor/design and scale 1/renderScale, so a bounce scales around the ground pivot;
//   - its hit polygon (hits[id], exactly as stored), its static label position, awake flag, depth;
//   - the kart (Story 1.7: it drives, so it is planned as a movable sprite, not a prop): frame
//     `MAP_KART.frame` at 1/renderScale with its pivot at the trimmed rect's centre x and the ground y
//     of `anchor.kart-start` (where the frame was rendered), so it sits on the road wherever it is
//     placed; a hit circle r = components.kart.size/2 + hitPad around the visible centre;
//   - warnings for missing frames (image skipped, hotspot/label kept) and missing stations (skipped).
//   - Story 5.2: the guide Shiba (MAP_GUIDE), planned like a station without a label: its idle frame at
//     anchors.shiba, hits.shiba, depth = anchor y, and the wave frames the atlas holds. A missing frame
//     skips the image (or that wave frame); a missing hit skips the guide; both warn.
//   - Story 5.6: the ambient dressing (MAP_AMBIENT, `planAmbient`): the whale and the fountain images at
//     their anchors (depth = anchor y, like a station), with their spout / spray frames; one cloud image per
//     `anchor.cloud-<n>` and one wave per `anchor.wave-<n>`, each with origin = the `-1` anchor (the render
//     pivot, the decorations' render-at-pivot rule) and position = its anchor, at ui.mapAmbientBackDepth
//     (above the plate, below every station). No hotspots. A missing frame or anchor skips that item with
//     one warning.
// Slots are never planned (UX-DR42). Depth sorts by the anchor y; labels sit above every sprite.
import { MAP_AMBIENT, MAP_GUIDE, MAP_KART } from '../content/assets';
import { KART_START_ANCHOR, stationFrame } from '../content/stations';
import type { Point, ScreenLayout } from '../content/layout-types';
import type { Box } from './input/polygon';
import type { Rect } from './safe-rect';
import { Tokens } from './tokens';

export interface PlanStationInput {
  readonly id: string;
  readonly label: string;
  readonly awake: boolean;
}

export interface Size {
  readonly w: number;
  readonly h: number;
}

/** A full-frame sprite placed on its ground pivot. */
export interface PlannedImage {
  readonly frame: string;
  readonly x: number;
  readonly y: number;
  readonly originX: number;
  readonly originY: number;
  readonly scale: number;
}

export interface PlannedStation {
  readonly id: string;
  readonly label: string;
  readonly awake: boolean;
  readonly anchor: Point;
  /** Undefined when the frame is missing from the atlas. */
  readonly image: PlannedImage | undefined;
  readonly hit: readonly Point[];
  /** Label: centre x, top y. */
  readonly labelPos: Point;
  readonly depth: number;
}

export interface PlannedProp {
  readonly id: string;
  readonly image: PlannedImage;
  /** Visible (trimmed) frame rect in design px. */
  readonly rect: Box;
  /** `rect` padded by Tokens.spacing.hitPad, as 4 points. */
  readonly hit: readonly Point[];
  readonly depth: number;
}

/** The moving kart (Story 1.7). Placed by setting its pivot on a road point. */
export interface PlannedKart {
  /** Undefined when the frame is missing (the kart keeps its hit target and behaviour, AR51). */
  readonly frame: string | undefined;
  /** Full-frame origin (0..1) of the pivot. */
  readonly originX: number;
  readonly originY: number;
  readonly scale: number;
  /** Visible centre minus pivot (design px): the hit circle's centre offset. */
  readonly centerOffset: Point;
  /** Hit circle radius: components.kart.size/2 + components.kart.hitPad. */
  readonly hitRadius: number;
}

/** Story 5.2: the island guide Shiba. */
export interface PlannedGuide {
  readonly id: string;
  /** Idle frame on its ground pivot; undefined when the frame or the anchor is missing. */
  readonly image: PlannedImage | undefined;
  /** The wave frames present in the atlas, in play order (empty: no wave, the guide still greets). */
  readonly wave: readonly string[];
  readonly hit: readonly Point[];
  readonly depth: number;
}

/** Story 5.6: a full-frame ambient sprite on its pivot with its animation frames (no hotspot). */
export interface PlannedAmbientSprite {
  readonly id: string;
  readonly image: PlannedImage;
  /** Spout (whale, played once) or spray (fountain, looped) frames present in the atlas, in play order. */
  readonly frames: readonly string[];
  readonly depth: number;
}

/** Story 5.6: one cloud or wave drawn at an anchor (frame rendered at the `-1` pivot). */
export interface PlannedAmbientInstance {
  readonly anchorId: string;
  readonly index: number;
  readonly image: PlannedImage;
  /** Trimmed frame width (design px; 0 when unknown): a cloud wraps once it is this far off screen. */
  readonly width: number;
  readonly depth: number;
}

export interface PlannedAmbient {
  readonly whale: PlannedAmbientSprite | undefined;
  readonly fountain: PlannedAmbientSprite | undefined;
  readonly clouds: readonly PlannedAmbientInstance[];
  readonly waves: readonly PlannedAmbientInstance[];
}

export interface MapPlan {
  readonly bg: { readonly x: number; readonly y: number; readonly scale: number; readonly depth: number };
  /** In depth order (back to front) — also the hotspot registration order (front wins). */
  readonly stations: readonly PlannedStation[];
  readonly kart: PlannedKart;
  /** Story 5.2: undefined when the layout has no `hit.shiba`. */
  readonly guide?: PlannedGuide;
  /** Story 5.6: the ambient dressing. */
  readonly ambient: PlannedAmbient;
  readonly labelDepth: number;
  /** Above the sprites, below the labels. */
  readonly ringDepth: number;
  readonly warnings: readonly string[];
}

export interface PlanOptions {
  /** Measured label size (Phaser Text); default: an estimate from the label typography. */
  readonly measureLabel?: (label: string) => Size;
  readonly safeRect?: Rect;
  /** Gap between the anchor and the label top. */
  readonly labelGap?: number;
  /** Texture key named in warnings. */
  readonly atlasKey?: string;
}

/** Rough glyph width / font size of Baloo 2 (estimate used only without a real measure). */
const GLYPH_WIDTH_EM = 0.55;

export function estimateLabelSize(label: string): Size {
  const t = Tokens.components.stationLabel.typography;
  return { w: label.length * t.fontSize * GLYPH_WIDTH_EM, h: t.fontSize * t.lineHeight };
}

/** Label position: centred on the anchor x, top at anchor.y + gap, clamped inside `safe`. */
export function labelPosition(anchor: Point, size: Size, safe: Rect, gap: number): Point {
  const clamp = (v: number, lo: number, hi: number): number => (hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  return {
    x: clamp(anchor.x, safe.x + size.w / 2, safe.x + safe.w - size.w / 2),
    y: clamp(anchor.y + gap, safe.y, safe.y + safe.h - size.h),
  };
}

function placeImage(frame: string, at: Point, layout: ScreenLayout): PlannedImage {
  return {
    frame,
    x: at.x,
    y: at.y,
    originX: at.x / layout.design.width,
    originY: at.y / layout.design.height,
    scale: 1 / layout.renderScale,
  };
}

export function planMap(
  layout: ScreenLayout,
  stations: readonly PlanStationInput[],
  hasFrame: (frame: string) => boolean,
  frameRect: (frame: string) => Box | undefined,
  opts: PlanOptions = {},
): MapPlan {
  const measure = opts.measureLabel ?? estimateLabelSize;
  const safe = opts.safeRect ?? Tokens.safeRect;
  const gap = opts.labelGap ?? Tokens.spacing['1'];
  const atlas = opts.atlasKey ?? 'atlas';
  const warnings: string[] = [];

  const planned: PlannedStation[] = [];
  for (const s of stations) {
    const anchor = layout.anchors[s.id];
    const hit = layout.hits[s.id];
    if (!anchor || !hit) {
      warnings.push(`map: station "${s.id}" is missing from the layout (${!anchor ? 'anchors' : 'hits'}) — skipped`);
      continue;
    }
    const frame = stationFrame(s.id);
    const image = hasFrame(frame) ? placeImage(frame, anchor, layout) : undefined;
    if (!image) warnings.push(`map: frame "${frame}" is missing from ${atlas} — image skipped`);
    planned.push({
      id: s.id,
      label: s.label,
      awake: s.awake,
      anchor,
      image,
      hit,
      labelPos: labelPosition(anchor, measure(s.label), safe, gap),
      depth: anchor.y,
    });
  }
  planned.sort((a, b) => a.depth - b.depth);

  const kart = planKart(layout, hasFrame, frameRect);
  if (!kart.frame) warnings.push(`map: frame "${MAP_KART.frame}" is missing from ${atlas} — kart drawn without an image`);

  const guide = planGuide(layout, hasFrame, atlas, warnings);
  const ambient = planAmbient(layout, hasFrame, frameRect, atlas, warnings);

  // The kart's depth follows its y on the road, which stays inside the design height.
  const maxDepth = Math.max(layout.design.height, ...planned.map((s) => s.depth), guide?.depth ?? 0, ambient.whale?.depth ?? 0, ambient.fountain?.depth ?? 0);
  return {
    bg: { x: 0, y: 0, scale: 1 / layout.renderScale, depth: -1 },
    stations: planned,
    kart,
    ...(guide ? { guide } : {}),
    ambient,
    ringDepth: maxDepth + 1,
    labelDepth: maxDepth + 2,
    warnings,
  };
}

/** A hit polygon needs at least 3 points (fewer would register a degenerate hotspot). */
const MIN_GUIDE_HIT_POINTS = 3;

/** Story 5.2: the guide Shiba's plan (see the file header); pushes its warnings. */
export function planGuide(
  layout: ScreenLayout,
  hasFrame: (frame: string) => boolean,
  atlas: string,
  warnings: string[],
): PlannedGuide | undefined {
  const id = MAP_GUIDE.id;
  const anchor = layout.anchors[id];
  const hit = layout.hits[id];
  if (!hit || hit.length < MIN_GUIDE_HIT_POINTS) {
    warnings.push(`map: guide "${id}" is missing from the layout (hits, at least ${MIN_GUIDE_HIT_POINTS} points) — skipped`);
    return undefined;
  }
  if (!anchor) warnings.push(`map: guide "${id}" has no anchor in the layout — image skipped`);
  const idle = anchor && hasFrame(MAP_GUIDE.idle) ? placeImage(MAP_GUIDE.idle, anchor, layout) : undefined;
  if (anchor && !idle) warnings.push(`map: frame "${MAP_GUIDE.idle}" is missing from ${atlas} — image skipped`);
  const wave = idle ? MAP_GUIDE.wave.filter((f) => hasFrame(f)) : [];
  if (idle && wave.length < MAP_GUIDE.wave.length) warnings.push(`map: guide wave frames missing from ${atlas}: ${MAP_GUIDE.wave.filter((f) => !wave.includes(f)).join(', ')}`);
  const depth = anchor ? anchor.y : Math.max(...hit.map((p) => p.y));
  return { id, image: idle, wave, hit, depth };
}

/** Story 5.6: the ambient dressing's plan (see the file header); pushes its warnings. */
export function planAmbient(
  layout: ScreenLayout,
  hasFrame: (frame: string) => boolean,
  frameRect: (frame: string) => Box | undefined,
  atlas: string,
  warnings: string[],
): PlannedAmbient {
  const sprite = (id: string, base: string, frames: readonly string[]): PlannedAmbientSprite | undefined => {
    const anchor = layout.anchors[id];
    if (!anchor) {
      warnings.push(`map: ambient "${id}" has no anchor in the layout — skipped`);
      return undefined;
    }
    const missing = [base, ...frames].filter((f) => !hasFrame(f));
    if (!hasFrame(base)) {
      warnings.push(`map: frame "${base}" is missing from ${atlas} — ambient "${id}" skipped`);
      return undefined;
    }
    if (missing.length > 0) warnings.push(`map: ambient "${id}" frames missing from ${atlas}: ${missing.join(', ')}`);
    return { id, image: placeImage(base, anchor, layout), frames: frames.filter((f) => hasFrame(f)), depth: anchor.y };
  };
  const whale = sprite(MAP_AMBIENT.whale.id, MAP_AMBIENT.whale.idle, MAP_AMBIENT.whale.spout);
  const fountain = sprite(MAP_AMBIENT.fountain.id, MAP_AMBIENT.fountain.spray[0], MAP_AMBIENT.fountain.spray);

  const instances = (name: string, frame: string, anchorIds: readonly string[]): PlannedAmbientInstance[] => {
    if (!hasFrame(frame)) {
      warnings.push(`map: frame "${frame}" is missing from ${atlas} — the ${name}s are skipped`);
      return [];
    }
    const pivotId = anchorIds[0];
    const pivot = pivotId === undefined ? undefined : layout.anchors[pivotId];
    if (!pivot) {
      warnings.push(`map: the ${name} pivot anchor "${pivotId ?? ''}" is missing from the layout — the ${name}s are skipped`);
      return [];
    }
    const ss = frameRect(frame);
    const width = ss ? ss.width / layout.renderScale : 0;
    const out: PlannedAmbientInstance[] = [];
    anchorIds.forEach((anchorId, index) => {
      const at = layout.anchors[anchorId];
      if (!at) {
        warnings.push(`map: ${name} anchor "${anchorId}" is missing from the layout — skipped`);
        return;
      }
      out.push({
        anchorId,
        index,
        image: {
          frame,
          x: at.x,
          y: at.y,
          originX: pivot.x / layout.design.width,
          originY: pivot.y / layout.design.height,
          scale: 1 / layout.renderScale,
        },
        width,
        depth: Tokens.ui.mapAmbientBackDepth,
      });
    });
    return out;
  };
  return {
    whale,
    fountain,
    clouds: instances('cloud', MAP_AMBIENT.cloud.frame, MAP_AMBIENT.cloud.anchors),
    waves: instances('wave', MAP_AMBIENT.wave.frame, MAP_AMBIENT.wave.anchors),
  };
}

/** Kart placement from the trimmed frame rect (see the file header). */
export function planKart(
  layout: ScreenLayout,
  hasFrame: (frame: string) => boolean,
  frameRect: (frame: string) => Box | undefined,
): PlannedKart {
  const spec = Tokens.components.kart;
  const hitRadius = spec.size / 2 + spec.hitPad;
  const rs = layout.renderScale;
  const scale = 1 / rs;
  const ss = hasFrame(MAP_KART.frame) ? frameRect(MAP_KART.frame) : undefined;
  if (!ss) return { frame: undefined, originX: 0.5, originY: 0.5, scale, centerOffset: { x: 0, y: 0 }, hitRadius };
  const centre = { x: (ss.x + ss.width / 2) / rs, y: (ss.y + ss.height / 2) / rs };
  const ground = layout.anchors[KART_START_ANCHOR];
  const pivot = { x: centre.x, y: ground?.y ?? centre.y };
  return {
    frame: MAP_KART.frame,
    originX: pivot.x / layout.design.width,
    originY: pivot.y / layout.design.height,
    scale,
    centerOffset: { x: centre.x - pivot.x, y: centre.y - pivot.y },
    hitRadius,
  };
}
