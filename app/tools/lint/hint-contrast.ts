// Hint ring contrast on the real render (Story 1.9, run inside `npm run validate:content`).
// For every place a hint ring can show on a plate, 32 pixels of the background just outside the ring
// (past the halo) must reach ≥ 3:1 against the ring core (white) or the ring line (purple):
//   - `ice-cream`: around every scoop home `slot.scoop-*`. The ring is the runtime one — the scoop's
//     trimmed bounds (vanilla frame of `atlas.ice-cream`, rendered at slot.scoop-2) + ui.hintRingPad;
//     without the atlas, a circle of diameter draggableItem.minSize + 2·hintRingPad at the slot;
//   - `map`: the ellipse inscribed in every station's `hits` bbox (the Map invitation ring);
//   - `pizza` (Story 3.1): around every slice home `slot.bowl-*` (the topping frame's trimmed bounds +
//     ui.hintRingPad; each topping is rendered at its own bowl slot) and the oven's ready ring (the
//     ellipse inscribed in the `hit.oven` bbox).
//   - `dino-puzzle` (Stories 3.3/3.4): around every start bay `anchor.dino-bay-<n>` for each species,
//     sized to the species' largest displayed loose piece (games/dino-puzzle/starts.ts) + ui.hintRingPad.
//   - `shadow-match` (Story 3.5): a circle of shadowR + ui.hintRingPad around every `slot.shadow-*` and
//     one of heldR + pad at `anchor.item-rest` (the item on its pedestal).
// Story 3.5 also measures `bg.shadow-match` itself: the cave wall under every shadow (the 5th-percentile
// luminance in its shadowR square) must give ≥ 5:1 against colors.shadowTarget, and every pixel of
// `hit.cave` must reach ui.caveMinLuminance (no dark cave).
// The plates are read with sharp; `ringContrastProblems` is the pure part (unit-tested).
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { ATLASES, BACKGROUNDS } from '../../src/content/assets.ts';
import { SCOOP_RENDER_SLOT, scoopFrame } from '../../src/content/games/ice-cream.ts';
import { HITS as PIZZA_HITS } from '../../src/content/games/pizza.ts';
import { BAY_ANCHORS, PIECE_IDS, SPECIES, pieceFrames } from '../../src/content/games/dino-puzzle.ts';
import { displayedSize } from '../../src/games/dino-puzzle/starts.ts';
import { CAVE_HIT, REST_ANCHOR, ITEM_IDS, itemFrames } from '../../src/content/games/shadow-match.ts';
import { heldRadius, shadowRadius } from '../../src/games/shadow-match/geometry.ts';
import { pointInPolygon } from '../layout/geometry.ts';
import { atlasFrames } from '../layout/rules.ts';
import type { Point, ScreenLayout } from '../../src/content/layout-types.ts';
import { Tokens } from '../../src/core/tokens.ts';
import { relativeLuminance, rgbOf } from '../shared/colour.ts';

export type { Rgb } from '../shared/colour.ts';
import type { Rgb } from '../shared/colour.ts';

/** Samples per ring. */
export const RING_SAMPLES = 32;
/** WCAG non-text contrast. */
export const MIN_RING_CONTRAST = 3;
/** Extra design px between the halo's outer edge and the sampled pixels. */
const OUTSIDE_GAP = 2;

// rgbOf and relativeLuminance live in tools/shared/colour.ts (shared with tools/layout/rules.ts).
export { relativeLuminance, rgbOf };

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface RingSample {
  /** e.g. `slot.scoop-1`, `station ice-cream`. */
  readonly label: string;
  readonly pixels: readonly Rgb[];
}

export interface RingLayers {
  readonly core: Rgb;
  readonly line: Rgb;
}

export function ringLayers(): RingLayers {
  const spec = Tokens.components.hintRing;
  return { core: rgbOf(spec.core.color.value), line: rgbOf(spec.line.color.value) };
}

/** Problems: every pixel must reach `min` against the core or against the line. */
export function ringContrastProblems(screen: string, samples: readonly RingSample[], layers: RingLayers = ringLayers(), min = MIN_RING_CONTRAST): string[] {
  const problems: string[] = [];
  for (const s of samples) {
    let failing = 0;
    let worst = Number.POSITIVE_INFINITY;
    for (const px of s.pixels) {
      const best = Math.max(contrastRatio(px, layers.core), contrastRatio(px, layers.line));
      if (best < min) failing += 1;
      worst = Math.min(worst, best);
    }
    if (failing > 0) {
      problems.push(`hint contrast "${screen}" ${s.label}: ${failing}/${s.pixels.length} background samples next to the ring are below ${min}:1 against both the ring core and line (worst ${worst.toFixed(2)}:1)`);
    }
  }
  return problems;
}

/** A ring ellipse in design px (centre and radii of the core stroke). */
export interface RingEllipse {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

/** How far past the core radius the ring draws (half the core, the halo) plus a small gap. */
export function ringReach(): number {
  const spec = Tokens.components.hintRing;
  return spec.core.width / 2 + spec.halo.width + OUTSIDE_GAP;
}

/** `n` design points just outside the ring (pulse at its largest, 1.05×). */
export function outsidePoints(e: RingEllipse, n = RING_SAMPLES): Point[] {
  const k = Tokens.components.hintRing.pulse.to;
  const out = ringReach();
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    pts.push({ x: e.cx + Math.cos(a) * (e.rx * k + out), y: e.cy + Math.sin(a) * (e.ry * k + out) });
  }
  return pts;
}

interface Plate {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
  readonly channels: number;
}

function pixelAt(plate: Plate, p: Point, renderScale: number): Rgb {
  const x = Math.min(plate.width - 1, Math.max(0, Math.round(p.x * renderScale)));
  const y = Math.min(plate.height - 1, Math.max(0, Math.round(p.y * renderScale)));
  const i = (y * plate.width + x) * plate.channels;
  return [plate.data[i]!, plate.data[i + 1]!, plate.data[i + 2]!];
}

async function readPlate(file: string): Promise<Plate | undefined> {
  try {
    const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, channels: info.channels };
  } catch {
    return undefined;
  }
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

interface FrameJson {
  readonly spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

/** The ice-cream scoop rings: the runtime ring of the vanilla frame moved to each home slot. */
export function iceCreamRings(layout: ScreenLayout, atlas: { frames?: Record<string, FrameJson> } | undefined): { label: string; ring: RingEllipse }[] {
  const pad = Tokens.ui.hintRingPad;
  const rs = layout.renderScale;
  const ss = atlas?.frames?.[scoopFrame('vanilla')]?.spriteSourceSize;
  const ref = layout.slots[SCOOP_RENDER_SLOT];
  const rings: { label: string; ring: RingEllipse }[] = [];
  for (const [id, slot] of Object.entries(layout.slots)) {
    if (!id.startsWith('scoop-')) continue;
    if (ss && ref) {
      const cx = (ss.x + ss.w / 2) / rs - ref.x + slot.x;
      const cy = (ss.y + ss.h / 2) / rs - ref.y + slot.y;
      rings.push({ label: `slot.${id}`, ring: { cx, cy, rx: ss.w / rs / 2 + pad, ry: ss.h / rs / 2 + pad } });
    } else {
      const r = Tokens.components.draggableItem.minSize / 2 + pad;
      rings.push({ label: `slot.${id}`, ring: { cx: slot.x, cy: slot.y, rx: r, ry: r } });
    }
  }
  return rings;
}

/** Story 3.1: the pizza rings — every slice home on its bowl, and the oven's ready ring. */
export function pizzaRings(layout: ScreenLayout, atlas: { frames?: Record<string, FrameJson> } | undefined): { label: string; ring: RingEllipse }[] {
  const pad = Tokens.ui.hintRingPad;
  const rs = layout.renderScale;
  const rings: { label: string; ring: RingEllipse }[] = [];
  for (const [id, slot] of Object.entries(layout.slots)) {
    if (!id.startsWith('bowl-')) continue;
    const ss = atlas?.frames?.[`topping-${id.slice('bowl-'.length)}/idle/00`]?.spriteSourceSize;
    if (ss) {
      rings.push({ label: `slot.${id}`, ring: { cx: (ss.x + ss.w / 2) / rs, cy: (ss.y + ss.h / 2) / rs, rx: ss.w / rs / 2 + pad, ry: ss.h / rs / 2 + pad } });
    } else {
      const r = Tokens.components.draggableItem.minSize / 2 + pad;
      rings.push({ label: `slot.${id}`, ring: { cx: slot.x, cy: slot.y, rx: r, ry: r } });
    }
  }
  const oven = layout.hits[PIZZA_HITS.oven];
  if (oven) {
    const xs = oven.map((p) => p.x);
    const ys = oven.map((p) => p.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    rings.push({ label: 'hit.oven', ring: { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx: (x1 - x0) / 2, ry: (y1 - y0) / 2 } });
  }
  return rings;
}

/**
 * Story 3.4: the dino-puzzle rings — every start bay for each species, the ring sized to the species'
 * largest displayed loose piece (the widest and the tallest of its trimmed sizes × pieceScale) +
 * ui.hintRingPad, centred on `anchor.dino-bay-<n>`; without the atlas, a circle of draggableItem.minSize + 2·pad.
 */
export function dinoRings(layout: ScreenLayout, atlas: { frames?: Record<string, FrameJson> } | undefined): { label: string; ring: RingEllipse }[] {
  const pad = Tokens.ui.hintRingPad;
  const rs = layout.renderScale;
  const half = Tokens.components.draggableItem.minSize / 2;
  const rings: { label: string; ring: RingEllipse }[] = [];
  for (const s of SPECIES) {
    let w = 0;
    let h = 0;
    for (const p of PIECE_IDS) {
      const ss = atlas?.frames?.[pieceFrames(s, p).idle]?.spriteSourceSize;
      if (!ss) continue;
      const d = displayedSize({ w: ss.w / rs, h: ss.h / rs });
      w = Math.max(w, d.w);
      h = Math.max(h, d.h);
    }
    for (const id of BAY_ANCHORS) {
      const at = layout.anchors[id];
      if (!at) continue;
      rings.push({ label: `anchor.${id} (${s})`, ring: { cx: at.x, cy: at.y, rx: (w > 0 ? w / 2 : half) + pad, ry: (h > 0 ? h / 2 : half) + pad } });
    }
  }
  return rings;
}

/** The Map invitation rings: inscribed in each station's hit bbox. */
export function mapRings(layout: ScreenLayout): { label: string; ring: RingEllipse }[] {
  return Object.entries(layout.hits).map(([id, poly]) => {
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    return { label: `station ${id}`, ring: { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx: (x1 - x0) / 2, ry: (y1 - y0) / 2 } };
  });
}

/**
 * Story 4.1: the Đường đua kart ring at the start of every road (the kart waits there): a circle of
 * kart.size + 2·ui.hintRingPad around each path's first point.
 */
export function raceRings(layout: ScreenLayout): { label: string; ring: RingEllipse }[] {
  const r = Tokens.components.kart.size / 2 + Tokens.ui.hintRingPad;
  return Object.entries(layout.paths).flatMap(([id, pts]) => (pts[0] ? [{ label: `path ${id} start`, ring: { cx: pts[0].x, cy: pts[0].y, rx: r, ry: r } }] : []));
}

/**
 * Story 4.3: the Câu cá fish rings on `bg.fishing`: at the `pond-swim` centroid and at the midpoints from
 * it to each vertex, a circle of the big fish's longest side + 2·hintRingPad (without the atlas,
 * fish.minSize × ui.fishSizeRatio).
 */
export function fishingRings(layout: ScreenLayout, atlas: { frames?: Record<string, FrameJson> } | undefined): { label: string; ring: RingEllipse }[] {
  const pond = layout.hits['pond-swim'];
  if (!pond || pond.length < 3) return [];
  let longest = 0;
  for (const [name, f] of Object.entries(atlas?.frames ?? {})) {
    const ss = f.spriteSourceSize;
    if (/^fish-[a-z]+-big\/swim\/00$/.test(name) && ss) longest = Math.max(longest, Math.max(ss.w, ss.h) / layout.renderScale);
  }
  if (longest === 0) longest = Tokens.components.fish.minSize * Tokens.ui.fishSizeRatio;
  const r = longest / 2 + Tokens.ui.hintRingPad;
  const c = { x: pond.reduce((s, p) => s + p.x, 0) / pond.length, y: pond.reduce((s, p) => s + p.y, 0) / pond.length };
  const sites = [{ label: 'pond centre', at: c }, ...pond.map((p, i) => ({ label: `pond midpoint ${i + 1}`, at: { x: (c.x + p.x) / 2, y: (c.y + p.y) / 2 } }))];
  return sites.map((s) => ({ label: s.label, ring: { cx: s.at.x, cy: s.at.y, rx: r, ry: r } }));
}

export interface HintContrastReport {
  readonly problems: string[];
  /** Rings sampled per screen. */
  readonly rings: Readonly<Record<string, number>>;
}

/** Reads the plates under `publicDir` and the layouts in `layoutDir`. Missing files are reported elsewhere. */
export async function hintContrastProblems(publicDir: string, layoutDir: string): Promise<HintContrastReport> {
  const problems: string[] = [];
  const rings: Record<string, number> = {};
  const screens: { id: 'ice-cream' | 'map' | 'pizza' | 'dino-puzzle' | 'shadow-match' | 'race' | 'fishing'; rings: (l: ScreenLayout) => { label: string; ring: RingEllipse }[] }[] = [
    { id: 'ice-cream', rings: (l) => iceCreamRings(l, readJson(resolve(publicDir, ATLASES['ice-cream'].json))) },
    { id: 'map', rings: mapRings },
    { id: 'pizza', rings: (l) => pizzaRings(l, readJson(resolve(publicDir, ATLASES.pizza.json))) },
    { id: 'dino-puzzle', rings: (l) => dinoRings(l, atlasFrames(readJson(resolve(publicDir, ATLASES['dino-puzzle'].json))) as { frames?: Record<string, FrameJson> }) },
    { id: 'shadow-match', rings: (l) => shadowMatchRings(l, atlasFrames(readJson(resolve(publicDir, ATLASES['shadow-match'].json))) as { frames?: Record<string, FrameJson> }) },
    { id: 'race', rings: raceRings },
    { id: 'fishing', rings: (l) => fishingRings(l, readJson(resolve(publicDir, ATLASES.fishing.json))) },
  ];
  for (const s of screens) {
    const layout = readJson<ScreenLayout>(join(layoutDir, `${s.id}.layout.json`));
    const plate = await readPlate(resolve(publicDir, BACKGROUNDS[s.id].path));
    if (!layout || !plate) {
      problems.push(`hint contrast "${s.id}": the plate or the layout cannot be read`);
      continue;
    }
    const list = s.rings(layout);
    rings[s.id] = list.length;
    const samples = list.map(({ label, ring }) => ({ label, pixels: outsidePoints(ring).map((p) => pixelAt(plate, p, layout.renderScale)) }));
    problems.push(...ringContrastProblems(s.id, samples));
  }
  problems.push(...(await shadowMatchPlateProblems(publicDir, layoutDir)));
  return { problems, rings };
}

// --- Story 3.5: Hang tìm bóng ------------------------------------------------------------------------------

/** The shadows (colors.shadowTarget) need this contrast against the cave wall they are drawn on. */
export const SHADOW_MIN_CONTRAST = 5;
/** The wall's luminance is measured at this low percentile of the pixels under a shadow. */
export const SHADOW_LUMINANCE_PERCENTILE = 0.05;

/** A raw RGB(A) plate: `channels` bytes per pixel, row-major. */
export interface RawImage {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly channels: number;
}

/** A shadow site in plate px: the square under one slot (`label` names the slot). */
export interface ShadowSite {
  readonly label: string;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

function pixelRgb(img: RawImage, x: number, y: number): Rgb {
  const i = (y * img.width + x) * img.channels;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
}

/** The `p`-quantile (0..1) of the relative luminances of the pixels in [x0, x1) × [y0, y1) (clipped to the image). */
export function percentileLuminance(img: RawImage, site: Omit<ShadowSite, 'label'>, p: number = SHADOW_LUMINANCE_PERCENTILE): number {
  const ls: number[] = [];
  for (let y = Math.max(0, Math.floor(site.y0)); y < Math.min(img.height, Math.ceil(site.y1)); y++) {
    for (let x = Math.max(0, Math.floor(site.x0)); x < Math.min(img.width, Math.ceil(site.x1)); x++) ls.push(relativeLuminance(pixelRgb(img, x, y)));
  }
  if (ls.length === 0) return Number.NaN;
  ls.sort((a, b) => a - b);
  return ls[Math.floor(p * (ls.length - 1))]!;
}

const contrastOfLuminance = (la: number, lb: number): number => (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);

/**
 * Story 3.5 (pure): for every site, the low-percentile luminance of the plate under it must give at least
 * `min` against `color` (the shadows' flat fill). A site outside the image fails too.
 */
export function shadowContrastProblems(bg: RawImage, sites: readonly ShadowSite[], color: Rgb, min: number = SHADOW_MIN_CONTRAST, p: number = SHADOW_LUMINANCE_PERCENTILE): string[] {
  const lc = relativeLuminance(color);
  const problems: string[] = [];
  for (const s of sites) {
    const l = percentileLuminance(bg, s, p);
    if (Number.isNaN(l)) {
      problems.push(`shadow contrast "shadow-match" ${s.label}: the site is outside the plate`);
      continue;
    }
    const c = contrastOfLuminance(l, lc);
    if (c < min) problems.push(`shadow contrast "shadow-match" ${s.label}: the wall under the shadow gives ${c.toFixed(2)}:1 against the shadow colour (min ${min}:1; ${Math.round(p * 100)}th-percentile luminance ${l.toFixed(3)})`);
  }
  return problems;
}

/**
 * Story 3.5 (pure): every plate pixel whose centre lies in `polygon` (design px; the plate is `renderScale`
 * × design) must have a relative luminance of at least `min` (no dark cave).
 */
export function caveLuminanceProblems(bg: RawImage, polygon: readonly Point[], renderScale: number, min: number = Tokens.ui.caveMinLuminance, label = 'hit.cave'): string[] {
  if (polygon.length < 3) return [`cave luminance "shadow-match" ${label}: missing`];
  const xs = polygon.map((p) => p.x * renderScale);
  const ys = polygon.map((p) => p.y * renderScale);
  let dark = 0;
  let worst = Number.POSITIVE_INFINITY;
  let count = 0;
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y < Math.min(bg.height, Math.ceil(Math.max(...ys))); y++) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs))); x < Math.min(bg.width, Math.ceil(Math.max(...xs))); x++) {
      if (!pointInPolygon({ x: (x + 0.5) / renderScale, y: (y + 0.5) / renderScale }, polygon)) continue;
      count += 1;
      const l = relativeLuminance(pixelRgb(bg, x, y));
      worst = Math.min(worst, l);
      if (l < min) dark += 1;
    }
  }
  if (count === 0) return [`cave luminance "shadow-match" ${label}: no plate pixel inside`];
  return dark > 0 ? [`cave luminance "shadow-match" ${label}: ${dark}/${count} pixels are darker than ${min} (darkest ${worst.toFixed(3)}): the cave must read bright`] : [];
}

/** Story 3.5: the shadow sites — the shadowR square around every `slot.shadow-*`, in plate px. */
export function shadowSites(layout: ScreenLayout, shadowR: number): ShadowSite[] {
  const rs = layout.renderScale;
  return Object.entries(layout.slots)
    .filter(([id]) => id.startsWith('shadow-'))
    .map(([id, s]) => ({ label: `slot.${id}`, x0: (s.x - shadowR) * rs, y0: (s.y - shadowR) * rs, x1: (s.x + shadowR) * rs, y1: (s.y + shadowR) * rs }));
}

/**
 * Story 3.5: the shadow-match ring sites — a circle of shadowR + ui.hintRingPad around every
 * `slot.shadow-*` (the ring on the correct shadow at level 2) and one of heldR + pad at the hand (where
 * the held item sits). Without the atlas, the item size is ui.shadowItemPx.
 */
export function shadowMatchRings(layout: ScreenLayout, atlas: { frames?: Record<string, FrameJson> } | undefined): { label: string; ring: RingEllipse }[] {
  const pad = Tokens.ui.hintRingPad;
  const { shadowR, heldR } = shadowRadii(atlas, layout.renderScale);
  const rings: { label: string; ring: RingEllipse }[] = [];
  for (const [id, s] of Object.entries(layout.slots)) {
    if (!id.startsWith('shadow-')) continue;
    rings.push({ label: `slot.${id}`, ring: { cx: s.x, cy: s.y, rx: shadowR + pad, ry: shadowR + pad } });
  }
  const hand = layout.anchors[REST_ANCHOR];
  if (hand) rings.push({ label: `anchor.${REST_ANCHOR}`, ring: { cx: hand.x, cy: hand.y, rx: heldR + pad, ry: heldR + pad } });
  return rings;
}

/** shadowR and heldR from the published atlas (games/shadow-match/geometry.ts); ui.shadowItemPx without it. */
export function shadowRadii(atlas: { frames?: Record<string, FrameJson> } | undefined, rs: number): { shadowR: number; heldR: number } {
  const sizes = ITEM_IDS.map((id) => atlas?.frames?.[itemFrames(id).color]?.spriteSourceSize).filter((ss): ss is { x: number; y: number; w: number; h: number } => ss !== undefined).map((ss) => ({ w: ss.w / rs, h: ss.h / rs }));
  const shadowR = sizes.length > 0 ? shadowRadius(sizes) : Tokens.ui.shadowItemPx / 2;
  return { shadowR, heldR: heldRadius(shadowR) };
}

/** Story 3.5: the measured shadow contrast and the cave luminance on `bg.shadow-match`. */
export async function shadowMatchPlateProblems(publicDir: string, layoutDir: string): Promise<string[]> {
  const layout = readJson<ScreenLayout>(join(layoutDir, 'shadow-match.layout.json'));
  let bg: RawImage | undefined;
  try {
    const { data, info } = await sharp(resolve(publicDir, BACKGROUNDS['shadow-match'].path)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    bg = { data, width: info.width, height: info.height, channels: info.channels };
  } catch {
    bg = undefined;
  }
  if (!layout || !bg) return ['shadow contrast "shadow-match": the plate or the layout cannot be read'];
  // 2026-10-22: a multiatlas (every page's frames by name).
  const atlas = atlasFrames(readJson(resolve(publicDir, ATLASES['shadow-match'].json))) as { frames?: Record<string, FrameJson> };
  const { shadowR } = shadowRadii(atlas, layout.renderScale);
  return [
    ...shadowContrastProblems(bg, shadowSites(layout, shadowR), rgbOf(Tokens.colors.shadowTarget.value)),
    ...caveLuminanceProblems(bg, layout.hits[CAVE_HIT] ?? [], layout.renderScale),
  ];
}
