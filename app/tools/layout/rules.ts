// Layout and asset rules (Story 1.4). Pure: used by `npm run render` (before publishing) and by
// `validate:content` (inside `npm run check`). Every message names the offending id or file.
import type { Rect } from '../../src/core/safe-rect.ts';
import { Tokens } from '../../src/core/tokens.ts';
import type { Point, ScreenLayout } from '../../src/content/layout-types.ts';
import type { Station } from '../../src/content/stations.ts';
import { FRAME_NAME } from '../../src/content/assets.ts';
import { decorationFootprint, decorationFrameName, padRect, rectPolygon, type Rect as DecoRect } from '../../src/core/geometry-pad.ts';
import { gameIconFrame } from '../../src/content/game-icons.ts';
import { distToPolyline, minWidth, pointInPolygon, polygonDistance } from './geometry.ts';
import { circleHitsRect, hudKeepOutRects } from './hud-keep-out.ts';
import { baseRadius } from '../../src/games/pizza/geometry.ts';
import type { PieceId, SpeciesId } from '../../src/content/games/dino-puzzle.ts';
import { assign, clearOfSlots, displayedRect, hitRadius, pairsClear, rectGap, type StartGeo } from '../../src/games/dino-puzzle/starts.ts';
import { heldRadius, shadowRadius } from '../../src/games/shadow-match/geometry.ts';

export interface LayoutLimits {
  /** Interactive rect: x∈[x0,x1], y∈[y0,y1] (design px). */
  rect: { x0: number; y0: number; x1: number; y1: number };
  /** Minimum hit polygon width (Tokens.spacing.targetMin). */
  targetMin: number;
  /** Minimum distance between station polygons (Tokens.spacing.stationGap). */
  stationGap: number;
  /** A `-stop` anchor or `kart-start` lies within this distance of the road (design px). */
  roadTolerance: number;
}

/** A `-stop` anchor / kart start may sit this far (design px) from the road centreline. */
export const ROAD_TOLERANCE = 4;

/** `safeRect` inset by the edge dead zones (side 24, top 32, bottom 40). */
export function interactiveRect(safe: Rect, dead: { side: number; top: number; bottom: number }): LayoutLimits['rect'] {
  return { x0: safe.x + dead.side, y0: safe.y + dead.top, x1: safe.x + safe.w - dead.side, y1: safe.y + safe.h - dead.bottom };
}

/** The limits from Tokens: x∈[24,1000], y∈[66,694], 80 wide, 40 apart. */
export function layoutLimits(): LayoutLimits {
  const s = Tokens.spacing;
  return {
    rect: interactiveRect(Tokens.safeRect, { side: s.edgeDeadSide, top: s.edgeDeadTop, bottom: s.edgeDeadBottom }),
    targetMin: s.targetMin,
    stationGap: s.stationGap,
    roadTolerance: ROAD_TOLERANCE,
  };
}

export interface LayoutRuleInput {
  stations: readonly Station[];
  gameIds: readonly string[];
  limits: LayoutLimits;
  /** Anchor ids that must lie on the road besides each station's `-stop` (e.g. `kart-start`). */
  roadAnchors?: readonly string[];
  /** Path id of the road. */
  road?: string;
  /**
   * Story 5.2: the map's guide sprite id (`shiba`). Its anchor and hit must exist; the hit lies
   * inside the interactive rect and is at least `targetMin` wide. It may overlap a station hull
   * (the Map router registers it after the stations, so it wins the overlap).
   */
  guide?: string;
}

const inRect = (p: Point, r: LayoutLimits['rect']): boolean => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
const fmt = (p: Point): string => `(${p.x}, ${p.y})`;
const MIN_HIT_POINTS = 3;

/** Validates the map layout against the stations and the touch rules; returns the problems. */
export function validateLayout(layout: ScreenLayout, input: LayoutRuleInput): string[] {
  const problems: string[] = [];
  const { stations, gameIds, limits } = input;
  const road = input.road ?? 'road';
  const roadAnchors = input.roadAnchors ?? ['kart-start'];

  // Station set === GAME_IDS, each once.
  const ids = stations.map((s) => s.id as string);
  for (const id of ids.filter((id, i) => ids.indexOf(id) !== i)) problems.push(`station "${id}": listed more than once`);
  for (const id of ids.filter((id) => !gameIds.includes(id))) problems.push(`station "${id}": not a GameId`);
  for (const id of gameIds.filter((id) => !ids.includes(id))) problems.push(`station "${id}": GameId has no station`);

  const roadLine = layout.paths[road];
  if (!roadLine || roadLine.length < 2) problems.push(`path "${road}": missing or has fewer than 2 points`);

  const onRoad = (anchorId: string): void => {
    const a = layout.anchors[anchorId];
    if (!a) {
      problems.push(`anchor "${anchorId}": missing`);
      return;
    }
    if (roadLine && roadLine.length >= 2) {
      const d = distToPolyline(a, roadLine);
      if (d > limits.roadTolerance) problems.push(`anchor "${anchorId}": ${d.toFixed(1)} px from path "${road}" (max ${limits.roadTolerance})`);
    }
  };

  const polys: [string, readonly Point[]][] = [];
  for (const s of stations) {
    const hit = layout.hits[s.id];
    if (!hit || hit.length < MIN_HIT_POINTS) problems.push(`hit "${s.id}": missing or has fewer than 3 points`);
    else {
      polys.push([s.id, hit]);
      const outside = hit.filter((p) => !inRect(p, limits.rect));
      if (outside.length > 0) {
        const r = limits.rect;
        problems.push(`hit "${s.id}": ${outside.length} vertex(es) outside the interactive rect x∈[${r.x0},${r.x1}] y∈[${r.y0},${r.y1}], e.g. ${fmt(outside[0]!)}`);
      }
      const w = minWidth(hit);
      if (w < limits.targetMin) problems.push(`hit "${s.id}": minimum width ${w.toFixed(1)} px is under ${limits.targetMin}`);
    }
    if (!layout.anchors[s.id]) problems.push(`anchor "${s.id}": missing`);
    onRoad(`${s.id}-stop`);
  }
  for (const id of roadAnchors) onRoad(id);

  if (input.guide !== undefined) {
    const g = input.guide;
    if (!layout.anchors[g]) problems.push(`anchor "${g}": missing (the guide)`);
    const hit = layout.hits[g];
    if (!hit || hit.length < MIN_HIT_POINTS) problems.push(`hit "${g}": missing or has fewer than 3 points (the guide)`);
    else {
      const outside = hit.filter((p) => !inRect(p, limits.rect));
      if (outside.length > 0) problems.push(`hit "${g}": ${outside.length} vertex(es) outside the interactive rect, e.g. ${fmt(outside[0]!)}`);
      const w = minWidth(hit);
      if (w < limits.targetMin) problems.push(`hit "${g}": minimum width ${w.toFixed(1)} px is under ${limits.targetMin}`);
    }
  }

  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      const [a, pa] = polys[i]!;
      const [b, pb] = polys[j]!;
      const d = polygonDistance(pa, pb);
      if (d === 0) problems.push(`hits "${a}" and "${b}": not separated (they overlap)`);
      else if (d < limits.stationGap) problems.push(`hits "${a}" and "${b}": ${d.toFixed(1)} px apart (min ${limits.stationGap})`);
    }
  }

  for (const s of stations) {
    for (const slot of s.slots) {
      const p = layout.slots[slot];
      if (!p) {
        problems.push(`slot "${slot}": missing`);
        continue;
      }
      if (!inRect(p, limits.rect)) problems.push(`slot "${slot}": ${fmt(p)} is outside the interactive rect`);
      for (const [id, poly] of polys) if (pointInPolygon(p, poly)) problems.push(`slot "${slot}": inside the hit polygon of "${id}"`);
    }
  }
  return problems;
}

/** Render px per design px of every screen (images are rendered at 2×). */
export const RENDER_SCALE = 2;

// --- assets ----------------------------------------------------------------------------------

/** Atlas pages and backgrounds are at most 2048 px on each side; every shipped file ≤ 8 MiB. */
export const MAX_PAGE_SIDE = 2048;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

export interface AtlasCheck {
  key: string;
  png: string;
  json: string;
  /** Frame names the atlas must hold. */
  frames: readonly string[];
  /** Story 3.3: more than 1 → a multiatlas JSON with up to this many pages (content AtlasRef.pages). */
  pages?: number;
}

export interface BackgroundCheck {
  key: string;
  path: string;
  width: number;
  height: number;
}

export interface AssetRuleInput {
  atlases: readonly AtlasCheck[];
  backgrounds: readonly BackgroundCheck[];
  /** Every file under public/assets with its size (path relative to public/). */
  files: readonly { path: string; bytes: number }[];
  /** PNG IHDR size, undefined when the file is missing or not a PNG. */
  pngSize: (path: string) => { width: number; height: number } | undefined;
  /** Parsed JSON, undefined when the file is missing or invalid. */
  readJson: (path: string) => unknown;
}

interface HashAtlasJson {
  frames?: Record<string, unknown>;
  meta?: { size?: { w?: number; h?: number } };
}

/** Validates the atlases, backgrounds and file size caps; returns the problems. */
export function validateAssets(input: AssetRuleInput): string[] {
  const problems: string[] = [];
  for (const a of input.atlases) {
    if (a.pages !== undefined && a.pages > 1) {
      problems.push(...multiAtlasProblems(a, input));
      continue;
    }
    const size = input.pngSize(a.png);
    if (!size) problems.push(`atlas "${a.key}": ${a.png} is missing or not a PNG`);
    else if (size.width > MAX_PAGE_SIDE || size.height > MAX_PAGE_SIDE) {
      problems.push(`atlas "${a.key}": ${a.png} is ${size.width}×${size.height} (max ${MAX_PAGE_SIDE}×${MAX_PAGE_SIDE})`);
    }
    const json = input.readJson(a.json) as HashAtlasJson | undefined;
    if (!json || typeof json !== 'object' || !json.frames) {
      problems.push(`atlas "${a.key}": ${a.json} is missing or not a JSON hash`);
      continue;
    }
    const w = json.meta?.size?.w ?? Infinity;
    const h = json.meta?.size?.h ?? Infinity;
    if (w > MAX_PAGE_SIDE || h > MAX_PAGE_SIDE) problems.push(`atlas "${a.key}": ${a.json} page size ${w}×${h} exceeds ${MAX_PAGE_SIDE}`);
    for (const name of Object.keys(json.frames)) {
      if (!FRAME_NAME.test(name)) problems.push(`atlas "${a.key}": frame "${name}" is not <object>/<state>/<nn>`);
    }
    for (const f of a.frames) if (!(f in json.frames)) problems.push(`atlas "${a.key}": frame "${f}" is missing`);
  }
  for (const b of input.backgrounds) {
    const size = input.pngSize(b.path);
    if (!size) problems.push(`background "${b.key}": ${b.path} is missing or not a PNG`);
    else if (size.width !== b.width || size.height !== b.height) {
      problems.push(`background "${b.key}": ${b.path} is ${size.width}×${size.height} (must be ${b.width}×${b.height})`);
    }
  }
  for (const f of input.files) {
    if (f.bytes > MAX_FILE_BYTES) problems.push(`file ${f.path}: ${f.bytes} bytes exceeds 8 MiB (${MAX_FILE_BYTES})`);
  }
  return problems;
}

/**
 * Story 3.3: a multi-page atlas — a Phaser multiatlas JSON whose `textures` list 1…pages pages, each
 * a PNG next to the JSON of at most MAX_PAGE_SIDE² (IHDR and JSON size), with `<object>/<state>/<nn>`
 * frame names; every required frame on some page.
 */
function multiAtlasProblems(a: AtlasCheck, input: AssetRuleInput): string[] {
  const problems: string[] = [];
  const json = input.readJson(a.json) as MultiAtlasJsonLike & { textures?: ReadonlyArray<{ image?: string; size?: { w?: number; h?: number } }> } | undefined;
  if (!json || typeof json !== 'object' || !Array.isArray(json.textures) || json.textures.length === 0) {
    problems.push(`atlas "${a.key}": ${a.json} is missing or not a multiatlas`);
    return problems;
  }
  const pages = a.pages ?? 1;
  if (json.textures.length > pages) problems.push(`atlas "${a.key}": ${json.textures.length} pages (max ${pages})`);
  const dir = a.json.slice(0, a.json.lastIndexOf('/') + 1);
  for (const page of json.textures) {
    const png = `${dir}${page.image ?? ''}`;
    const size = input.pngSize(png);
    if (!page.image || !size) problems.push(`atlas "${a.key}": page ${png} is missing or not a PNG`);
    else if (size.width > MAX_PAGE_SIDE || size.height > MAX_PAGE_SIDE) problems.push(`atlas "${a.key}": ${png} is ${size.width}×${size.height} (max ${MAX_PAGE_SIDE}×${MAX_PAGE_SIDE})`);
    const w = page.size?.w ?? Infinity;
    const h = page.size?.h ?? Infinity;
    if (w > MAX_PAGE_SIDE || h > MAX_PAGE_SIDE) problems.push(`atlas "${a.key}": ${a.json} page ${png} size ${w}×${h} exceeds ${MAX_PAGE_SIDE}`);
  }
  const frames = atlasFrames(json).frames ?? {};
  for (const name of Object.keys(frames)) if (!FRAME_NAME.test(name)) problems.push(`atlas "${a.key}": frame "${name}" is not <object>/<state>/<nn>`);
  for (const f of a.frames) if (!(f in frames)) problems.push(`atlas "${a.key}": frame "${f}" is missing`);
  return problems;
}

/** Width/height from a PNG's IHDR chunk; undefined when `buf` is not a PNG. */
export function pngSizeOf(buf: Uint8Array): { width: number; height: number } | undefined {
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const IHDR_END = 24;
  if (buf.length < IHDR_END || SIG.some((b, i) => buf[i] !== b)) return undefined;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const WIDTH_AT = 16;
  const HEIGHT_AT = 20;
  return { width: view.getUint32(WIDTH_AT), height: view.getUint32(HEIGHT_AT) };
}

// --- game screens (Story 1.8) -----------------------------------------------------------------

/** Layout ids a game screen must hold (`content/games/<id>.ts › screen`). */
export interface ScreenIds {
  readonly anchors: readonly string[];
  readonly hits: readonly string[];
  readonly slots: readonly string[];
  readonly frames: readonly string[];
}

/** One problem per required layout id that is missing, naming it (`slot "cone-1": missing`). */
export function requiredIdProblems(layout: ScreenLayout, ids: ScreenIds): string[] {
  const problems: string[] = [];
  for (const id of ids.anchors) if (!layout.anchors[id]) problems.push(`anchor "${id}": missing`);
  for (const id of ids.hits) {
    const hit = layout.hits[id];
    if (!hit || hit.length < MIN_HIT_POINTS) problems.push(`hit "${id}": missing or has fewer than 3 points`);
  }
  for (const id of ids.slots) if (!layout.slots[id]) problems.push(`slot "${id}": missing`);
  return problems;
}

interface AtlasFrameJson {
  spriteSourceSize?: { x?: number; y?: number; w?: number; h?: number };
  frame?: { w?: number; h?: number };
}

/** The slice of a JSON-hash atlas the screen rules read. */
export interface AtlasJsonLike {
  frames?: Record<string, AtlasFrameJson>;
}

/** Trimmed size (render px) of an atlas frame, undefined when it is missing. */
export function trimmedSize(atlas: AtlasJsonLike, frame: string): { w: number; h: number } | undefined {
  const f = atlas.frames?.[frame];
  const ss = f?.spriteSourceSize ?? f?.frame;
  return ss && typeof ss.w === 'number' && typeof ss.h === 'number' ? { w: ss.w, h: ss.h } : undefined;
}

export interface IceCreamRuleInput {
  ids: ScreenIds;
  limits: LayoutLimits;
  /** draggableItem.minSize: scoop centres stay minSize/2 inside the rect; scoop frames are at least ~this wide. */
  itemMin: number;
  /** Trimmed scoop width floor (design px). */
  scoopMinWidth: number;
  /** character.minSize: Shiba's trimmed height floor (design px). */
  characterMin: number;
  rowGap: number;
  rowTolerance: number;
  /** Max |dy| between row neighbours (spacing['2']). */
  rowDy: number;
  design: { width: number; height: number };
  renderScale: number;
}

/** The Tiệm kem rules from Tokens. */
export function iceCreamLimits(ids: ScreenIds): IceCreamRuleInput {
  return {
    ids,
    limits: layoutLimits(),
    itemMin: Tokens.components.draggableItem.minSize,
    scoopMinWidth: Tokens.components.draggableItem.minSize,
    characterMin: Tokens.components.character.minSize,
    rowGap: Tokens.ui.iceCreamRowGap,
    rowTolerance: Tokens.ui.iceCreamRowTolerance,
    rowDy: Tokens.spacing['2'],
    design: { width: Tokens.design.width, height: Tokens.design.height },
    renderScale: RENDER_SCALE,
  };
}

/** The row left to right: [kind, id]. */
const ICE_CREAM_ROW: readonly (readonly ['slot' | 'anchor', string])[] = [
  ['slot', 'scoop-1'],
  ['slot', 'scoop-2'],
  ['anchor', 'cone'],
  ['slot', 'scoop-3'],
  ['slot', 'scoop-4'],
];
const LOWER_THIRD = 2 / 3;
const SHIBA_CENTRE_SPAN = 1 / 6;
const SHIBA_FRAME = 'shiba/idle/00';
const SCOOP_FRAME = /^scoop-[a-z0-9-]+\/idle\/00$/;

/**
 * Tiệm kem screen rules: required ids, the row in the lower third with even gaps, every slot inside
 * the interactive rect (inset by itemMin/2), Shiba centre-back and, with `atlas`, the frames and
 * their sizes. Run by `render` (no atlas yet), `atlas` and `validate:content`.
 */
export function validateIceCream(layout: ScreenLayout, input: IceCreamRuleInput, atlas?: AtlasJsonLike): string[] {
  const problems = requiredIdProblems(layout, input.ids);
  const r = input.limits.rect;
  const half = input.itemMin / 2;
  const yMin = input.design.height * LOWER_THIRD;
  const yMax = r.y1 - half;
  const row = ICE_CREAM_ROW.map(([kind, id]) => ({ kind, id, p: (kind === 'slot' ? layout.slots : layout.anchors)[id] }));
  for (const { kind, id, p } of row) {
    if (p && (p.y < yMin || p.y > yMax)) problems.push(`${kind} "${id}": y ${p.y} is outside the lower third [${round2(yMin)}, ${yMax}]`);
  }
  for (let i = 0; i + 1 < row.length; i++) {
    const a = row[i]!;
    const b = row[i + 1]!;
    if (!a.p || !b.p) continue;
    const dx = b.p.x - a.p.x;
    if (Math.abs(dx - input.rowGap) > input.rowTolerance) {
      problems.push(`row "${a.id}" → "${b.id}": x gap ${round2(dx)} is not ${input.rowGap} ± ${input.rowTolerance}`);
    }
    const dy = Math.abs(b.p.y - a.p.y);
    if (dy > input.rowDy) problems.push(`row "${a.id}" → "${b.id}": y differs by ${round2(dy)} (max ${input.rowDy})`);
  }
  const inner = { x0: r.x0 + half, y0: r.y0 + half, x1: r.x1 - half, y1: r.y1 - half };
  for (const id of input.ids.slots) {
    const p = layout.slots[id];
    if (p && !inRect(p, inner)) problems.push(`slot "${id}": ${fmt(p)} is outside the interactive rect inset by ${half}`);
  }
  const shiba = layout.anchors.shiba;
  const cone = layout.anchors.cone;
  if (shiba) {
    const span = input.design.width * SHIBA_CENTRE_SPAN;
    const dx = Math.abs(shiba.x - input.design.width / 2);
    if (dx > span) problems.push(`anchor "shiba": ${round2(dx)} px from the centre (max ${round2(span)})`);
    if (cone && !(shiba.y < cone.y)) problems.push(`anchor "shiba": y ${shiba.y} is not behind the cone (y ${cone.y})`);
  }
  if (atlas) {
    for (const f of input.ids.frames) if (!trimmedSize(atlas, f)) problems.push(`atlas "ice-cream": frame "${f}" is missing`);
    const s = input.renderScale;
    const sh = trimmedSize(atlas, SHIBA_FRAME);
    if (sh && sh.h / s < input.characterMin) problems.push(`frame "${SHIBA_FRAME}": trimmed height ${round2(sh.h / s)} is under ${input.characterMin}`);
    for (const f of input.ids.frames.filter((name) => SCOOP_FRAME.test(name))) {
      const sz = trimmedSize(atlas, f);
      if (sz && sz.w / s < input.scoopMinWidth) problems.push(`frame "${f}": trimmed width ${round2(sz.w / s)} is under ${input.scoopMinWidth}`);
    }
  }
  return problems;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

// --- decorations (Story 2.2) --------------------------------------------------------------------

export interface DecorationRuleInput {
  stations: ReadonlyArray<{ readonly id: string; readonly slots: readonly string[] }>;
  gameIds: readonly string[];
  catalogue: Readonly<Record<string, ReadonlyArray<{ readonly id: string }>>>;
  limits: LayoutLimits;
  /** Tokens.components.decorationItem.minSize: the footprint's longest side (design px). */
  minSize: number;
  /** Tokens.components.tappableProp.hitPad: footprint → tap rect. */
  hitPad: number;
  /** Review loop 1: a slot lies at most this far (design px) from its station's anchor. */
  maxStationDist: number;
  /** Review loop 1b: per-station exceptions to maxStationDist (design px). */
  stationDistOverride: Readonly<Record<string, number>>;
  /** Review loop 1: a slot lies at most this far (design px) from its station's slot 1 (the render pivot). */
  maxPivotDist: number;
}

/** Spec 2.2 (review loop 1): a decoration slot sits beside its own station. */
export const DECO_MAX_STATION_DIST = 170;
/**
 * Spec 2.2 (review loop 1b): stations whose slots may sit further than DECO_MAX_STATION_DIST (at most
 * 240 px). dino-puzzle: the only clear ground within 170 px of its anchor is the strip above the fence,
 * which is also the only spot for touch-talk, and shadow-match's only spot is the infield pocket that
 * touch-talk could also take; with no footprint overlap allowed, one of the three had no slot. Its
 * slot stands by the volcano instead (about 200 px from the anchor), which fits the dinosaur theme.
 */
export const DECO_STATION_DIST_OVERRIDE: Readonly<Record<string, number>> = {
  'dino-puzzle': 240,
};

/** Spec 2.2 (review loop 1): the perspective drift from the render pivot stays small. */
export const DECO_MAX_PIVOT_DIST = 110;

/** The decoration rules from Tokens. */
export function decorationLimits(stations: DecorationRuleInput['stations'], gameIds: readonly string[], catalogue: DecorationRuleInput['catalogue']): DecorationRuleInput {
  return {
    stations,
    gameIds,
    catalogue,
    limits: layoutLimits(),
    minSize: Tokens.components.decorationItem.minSize,
    hitPad: Tokens.components.tappableProp.hitPad,
    maxStationDist: DECO_MAX_STATION_DIST,
    stationDistOverride: DECO_STATION_DIST_OVERRIDE,
    maxPivotDist: DECO_MAX_PIVOT_DIST,
  };
}

const DECO_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Trimmed rect (render px, full-frame offsets) of an atlas frame, undefined when missing. */
export function trimmedRect(atlas: AtlasJsonLike, frame: string): DecoRect | undefined {
  const ss = atlas.frames?.[frame]?.spriteSourceSize;
  if (!ss || typeof ss.x !== 'number' || typeof ss.y !== 'number' || typeof ss.w !== 'number' || typeof ss.h !== 'number') return undefined;
  return { x: ss.x, y: ss.y, width: ss.w, height: ss.h };
}

const rectsOverlap = (a: DecoRect, b: DecoRect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const unionRect = (a: DecoRect, b: DecoRect): DecoRect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
};

/**
 * Decoration rules (Story 2.2; run by `atlas` before writing and by `validate:content`). Each message
 * names the id:
 *   - every station has ≥ 1 slot with ids `<ownId>-1..k`; every layout slot is listed in content;
 *   - every GameId has a non-empty catalogue of kebab-case, globally unique ids;
 *   - with `atlas`: `decoration/<id>/00` exists for every id, and for every (slot, item of that
 *     slot's station), rendered at slot 1 and placed at the slot: the footprint's longest side is
 *     ≥ minSize, each tap-rect side ≥ targetMin, the tap rect lies inside the interactive rect, the
 *     footprint touches no station hit polygon as stored (UX-DR9, no extra padding); the union
 *     footprints of any two slots, from any stations, do not overlap;
 *   - next to its station: every slot is ≤ maxStationDist (or its stationDistOverride) from its station's anchor and ≤ maxPivotDist
 *     from its station's slot 1 (checked without the atlas too).
 * Slots of content without an anchor are spec-1-4's validateLayout rule (not repeated here).
 */
export function validateDecorations(layout: ScreenLayout, input: DecorationRuleInput, atlas?: AtlasJsonLike): string[] {
  const problems: string[] = [];
  const { stations, limits } = input;
  const listed = new Set<string>();
  for (const s of stations) {
    if (s.slots.length === 0) problems.push(`station "${s.id}": has no decoration slot`);
    s.slots.forEach((slot, i) => {
      listed.add(slot);
      if (slot !== `${s.id}-${i + 1}`) problems.push(`slot "${slot}": station "${s.id}" slots must be "${s.id}-1..${s.slots.length}" in order`);
    });
  }
  for (const id of Object.keys(layout.slots)) if (!listed.has(id)) problems.push(`slot "${id}": in the layout but not listed in content/stations.ts`);

  const owner = new Map<string, string>();
  for (const gameId of input.gameIds) {
    const items = input.catalogue[gameId] ?? [];
    if (items.length === 0) problems.push(`decorations "${gameId}": the catalogue is empty`);
    for (const it of items) {
      if (!DECO_ID.test(it.id)) problems.push(`decoration "${it.id}": id is not kebab-case`);
      const first = owner.get(it.id);
      if (first !== undefined) problems.push(`decoration "${it.id}": used by both "${first}" and "${gameId}"`);
      else owner.set(it.id, gameId);
    }
  }
  for (const s of stations) {
    const anchor = layout.anchors[s.id];
    const pivot = s.slots[0] === undefined ? undefined : layout.slots[s.slots[0]];
    for (const slot of s.slots) {
      const at = layout.slots[slot];
      if (!at) continue;
      const da = anchor ? Math.hypot(at.x - anchor.x, at.y - anchor.y) : 0;
      const maxDist = input.stationDistOverride[s.id] ?? input.maxStationDist;
      if (da > maxDist) problems.push(`slot "${slot}": ${round2(da)} px from the anchor of "${s.id}" (max ${maxDist})`);
      const dp = pivot ? Math.hypot(at.x - pivot.x, at.y - pivot.y) : 0;
      if (dp > input.maxPivotDist) problems.push(`slot "${slot}": ${round2(dp)} px from slot "${s.slots[0]}" (max ${input.maxPivotDist})`);
    }
  }
  if (!atlas) return problems;

  const hits = Object.entries(layout.hits).filter(([id]) => input.gameIds.includes(id));
  const r = limits.rect;
  const rs = layout.renderScale;
  const unions = new Map<string, DecoRect>();
  for (const s of stations) {
    const items = input.catalogue[s.id] ?? [];
    for (const it of items) {
      const frame = decorationFrameName(it.id);
      if (!trimmedRect(atlas, frame)) problems.push(`decoration "${it.id}": atlas "map" has no frame "${frame}"`);
    }
    const pivot = s.slots[0] === undefined ? undefined : layout.slots[s.slots[0]];
    if (!pivot) continue;
    for (const slot of s.slots) {
      const at = layout.slots[slot];
      if (!at) continue;
      for (const it of items) {
        const ss = trimmedRect(atlas, decorationFrameName(it.id));
        if (!ss) continue;
        const fp = decorationFootprint(ss, pivot, at, rs);
        const tap = padRect(fp, input.hitPad);
        const where = `decoration "${it.id}" at slot "${slot}"`;
        const longest = Math.max(fp.width, fp.height);
        if (longest < input.minSize) problems.push(`${where}: footprint ${round2(fp.width)}×${round2(fp.height)} is under ${input.minSize} px on its longest side`);
        if (tap.width < limits.targetMin || tap.height < limits.targetMin) {
          problems.push(`${where}: tap rect ${round2(tap.width)}×${round2(tap.height)} has a side under ${limits.targetMin}`);
        }
        if (tap.x < r.x0 || tap.y < r.y0 || tap.x + tap.width > r.x1 || tap.y + tap.height > r.y1) {
          problems.push(`${where}: tap rect (${round2(tap.x)}, ${round2(tap.y)}, ${round2(tap.width)}×${round2(tap.height)}) is outside the interactive rect x∈[${r.x0},${r.x1}] y∈[${r.y0},${r.y1}]`);
        }
        const poly = rectPolygon(fp);
        for (const [id, hit] of hits) if (polygonDistance(poly, hit) === 0) problems.push(`${where}: footprint intersects the hit polygon of "${id}"`);
        const u = unions.get(slot);
        unions.set(slot, u ? unionRect(u, fp) : fp);
      }
    }
  }
  const slots = [...unions.keys()];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (rectsOverlap(unions.get(slots[i]!)!, unions.get(slots[j]!)!)) problems.push(`slots "${slots[i]}" and "${slots[j]}": decoration footprints overlap`);
    }
  }
  return problems;
}

// --- play-again icons (Story 2.4) ---------------------------------------------------------------

/**
 * Play-again icon rule (run by `atlas` before writing and by `validate:content`): `icon/<id>/00`
 * exists in atlas "map" for every `GAME_ICONS` id, with its trimmed longest side ÷ renderScale
 * ≥ `minPx` (ui.playAgainIconPx). Each message names the id.
 */
export function validatePlayAgainIcons(ids: readonly string[], atlas: AtlasJsonLike, renderScale: number, minPx: number): string[] {
  const problems: string[] = [];
  for (const id of ids) {
    const frame = gameIconFrame(id);
    const ss = trimmedRect(atlas, frame);
    if (!ss) {
      problems.push(`play-again icon "${id}": atlas "map" has no frame "${frame}"`);
      continue;
    }
    const longest = Math.max(ss.width, ss.height) / renderScale;
    if (longest < minPx) problems.push(`play-again icon "${id}": frame "${frame}" is ${round2(longest)} px on its longest side (min ${minPx})`);
  }
  return problems;
}

// --- Tiệm pizza (Story 3.1) ----------------------------------------------------------------------

export interface PizzaRuleInput {
  ids: ScreenIds;
  limits: LayoutLimits;
  /** draggableItem.minSize: item circles (r = minSize/2) and the slot inset. */
  itemMin: number;
  /** Trimmed topping width floor (design px). */
  toppingMinWidth: number;
  /** character.minSize: the fox's trimmed height floor (design px). */
  characterMin: number;
  /** ui.pizzaPlacedSlicePx: base spots stay this far apart; baseRadius adds half of it. */
  placedSlicePx: number;
  /** spacing.targetGap. */
  gap: number;
  /** components.oven.size ± ui.ovenSizeTolerance (the oven frame's trimmed width). */
  ovenSize: number;
  ovenTolerance: number;
  /** The Home / Speaker keep-out squares (hud-keep-out.ts). */
  keepOut: readonly Rect[];
  design: { width: number; height: number };
  renderScale: number;
}

/** The Tiệm pizza rules from Tokens. */
export function pizzaLimits(ids: ScreenIds): PizzaRuleInput {
  return {
    ids,
    limits: layoutLimits(),
    itemMin: Tokens.components.draggableItem.minSize,
    toppingMinWidth: Tokens.components.draggableItem.minSize,
    characterMin: Tokens.components.character.minSize,
    placedSlicePx: Tokens.ui.pizzaPlacedSlicePx,
    gap: Tokens.spacing.targetGap,
    ovenSize: Tokens.components.oven.size,
    ovenTolerance: Tokens.ui.ovenSizeTolerance,
    keepOut: hudKeepOutRects(),
    design: { width: Tokens.design.width, height: Tokens.design.height },
    renderScale: RENDER_SCALE,
  };
}

const FOX_FRAME = 'fox/idle/00';
const OVEN_FRAME = 'oven/rest/00';
const TOPPING_FRAME = /^topping-[a-z0-9-]+\/idle\/00$/;
const BOWL_SLOT = /^bowl-[a-z0-9-]+$/;
const BASE_SPOT = /^base-\d+$/;

const rectPoly = (r: Rect): Point[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.w, y: r.y },
  { x: r.x + r.w, y: r.y + r.h },
  { x: r.x, y: r.y + r.h },
];

function distToSegmentPoint(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distance from a circle's edge to a polygon (0 when they touch or overlap). */
export function circleToPolygon(c: Point, r: number, poly: readonly Point[]): number {
  if (pointInPolygon(c, poly)) return 0;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distToSegmentPoint(c, poly[i]!, poly[(i + 1) % poly.length]!));
  return Math.max(0, d - r);
}

/**
 * Tiệm pizza screen rules (run by `render` without the atlas, `atlas` and `validate:content`). Each
 * message names the id: required ids and frames; base, bowl slots and the fox plate in the lower third;
 * every slot inside the interactive rect (inset minSize/2) with its item circle clear of the Hud
 * keep-out squares; every `hit.oven` vertex inside the rect and the hull clear of the squares; base
 * spots ≥ placedSlicePx apart; bowls ≥ baseRadius + minSize/2 + gap from the base and ≥ minSize + gap
 * apart; the oven hull ≥ gap from every bowl circle and the base circle, at least targetMin wide and
 * right of the row; the fox centre-back; with the atlas, the oven, fox and topping frame sizes.
 */
export function validatePizza(layout: ScreenLayout, input: PizzaRuleInput, atlas?: AtlasJsonLike): string[] {
  const problems = requiredIdProblems(layout, input.ids);
  const r = input.limits.rect;
  const half = input.itemMin / 2;
  const yMin = input.design.height * LOWER_THIRD;
  const yMax = r.y1 - half;
  const base = layout.anchors.base;
  const bowls = input.ids.slots.filter((id) => BOWL_SLOT.test(id));
  const lower: [string, Point | undefined][] = [
    ['anchor "base"', base],
    ...bowls.map((id): [string, Point | undefined] => [`slot "${id}"`, layout.slots[id]]),
    ['slot "fox-plate"', layout.slots['fox-plate']],
  ];
  for (const [what, p] of lower) {
    if (p && (p.y < yMin || p.y > yMax)) problems.push(`${what}: y ${p.y} is outside the lower third [${round2(yMin)}, ${yMax}]`);
  }
  const inner = { x0: r.x0 + half, y0: r.y0 + half, x1: r.x1 - half, y1: r.y1 - half };
  for (const id of input.ids.slots) {
    const p = layout.slots[id];
    if (!p) continue;
    if (!inRect(p, inner)) problems.push(`slot "${id}": ${fmt(p)} is outside the interactive rect inset by ${half}`);
    if (input.keepOut.some((k) => circleHitsRect(p, half, k))) problems.push(`slot "${id}": its item circle reaches into a Home/Speaker keep-out zone`);
  }
  const oven = layout.hits.oven;
  const hasOven = oven !== undefined && oven.length >= MIN_HIT_POINTS;
  if (hasOven) {
    const out = oven.filter((p) => !inRect(p, r));
    if (out.length > 0) problems.push(`hit "oven": ${out.length} vertex(es) outside the interactive rect, e.g. ${fmt(out[0]!)}`);
    if (input.keepOut.some((k) => polygonDistance(oven, rectPoly(k)) === 0)) problems.push('hit "oven": reaches into a Home/Speaker keep-out zone');
    const w = minWidth(oven);
    if (w < input.limits.targetMin) problems.push(`hit "oven": minimum width ${round2(w)} px is under ${input.limits.targetMin}`);
  }
  const spots = input.ids.slots.filter((id) => BASE_SPOT.test(id));
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const a = layout.slots[spots[i]!];
      const b = layout.slots[spots[j]!];
      if (!a || !b) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < input.placedSlicePx) problems.push(`slots "${spots[i]}" and "${spots[j]}": ${round2(d)} px apart (min ${input.placedSlicePx})`);
    }
  }
  const br = baseRadius(layout, input.placedSlicePx);
  for (let i = 0; i < bowls.length; i++) {
    const p = layout.slots[bowls[i]!];
    if (!p) continue;
    if (base) {
      const need = br + half + input.gap;
      const d = Math.hypot(p.x - base.x, p.y - base.y);
      if (d < need) problems.push(`slot "${bowls[i]}": ${round2(d)} px from anchor "base" (min ${round2(need)} = baseRadius ${round2(br)} + ${half} + ${input.gap})`);
    }
    for (let j = i + 1; j < bowls.length; j++) {
      const q = layout.slots[bowls[j]!];
      if (!q) continue;
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < input.itemMin + input.gap) problems.push(`slots "${bowls[i]}" and "${bowls[j]}": ${round2(d)} px apart (min ${input.itemMin + input.gap})`);
    }
    if (hasOven) {
      const d = circleToPolygon(p, half, oven);
      if (d < input.gap) problems.push(`hit "oven": ${round2(d)} px from the item circle of slot "${bowls[i]}" (min ${input.gap})`);
    }
  }
  if (hasOven && base) {
    const d = circleToPolygon(base, br, oven);
    if (d < input.gap) problems.push(`hit "oven": ${round2(d)} px from the base circle (min ${input.gap})`);
  }
  const ovenAt = layout.anchors.oven;
  if (ovenAt) {
    for (const id of bowls) {
      const p = layout.slots[id];
      if (p && !(ovenAt.x > p.x)) problems.push(`anchor "oven": x ${ovenAt.x} is not right of slot "${id}" (x ${p.x})`);
    }
    if (base && !(ovenAt.x > base.x)) problems.push(`anchor "oven": x ${ovenAt.x} is not right of anchor "base" (x ${base.x})`);
  }
  const fox = layout.anchors.fox;
  if (fox) {
    const span = input.design.width * SHIBA_CENTRE_SPAN;
    const dx = Math.abs(fox.x - input.design.width / 2);
    if (dx > span) problems.push(`anchor "fox": ${round2(dx)} px from the centre (max ${round2(span)})`);
    if (base && !(fox.y < base.y)) problems.push(`anchor "fox": y ${fox.y} is not behind the base (y ${base.y})`);
  }
  if (atlas) {
    for (const f of input.ids.frames) if (!trimmedSize(atlas, f)) problems.push(`atlas "pizza": frame "${f}" is missing`);
    const s = input.renderScale;
    const fx = trimmedSize(atlas, FOX_FRAME);
    if (fx && fx.h / s < input.characterMin) problems.push(`frame "${FOX_FRAME}": trimmed height ${round2(fx.h / s)} is under ${input.characterMin}`);
    const ov = trimmedSize(atlas, OVEN_FRAME);
    if (ov && Math.abs(ov.w / s - input.ovenSize) > input.ovenTolerance) {
      problems.push(`frame "${OVEN_FRAME}": trimmed width ${round2(ov.w / s)} is not ${input.ovenSize} ± ${input.ovenTolerance}`);
    }
    for (const f of input.ids.frames.filter((name) => TOPPING_FRAME.test(name))) {
      const sz = trimmedSize(atlas, f);
      if (sz && sz.w / s < input.toppingMinWidth) problems.push(`frame "${f}": trimmed width ${round2(sz.w / s)} is under ${input.toppingMinWidth}`);
    }
  }
  return problems;
}

// --- Ghép khủng long (Story 3.3) ----------------------------------------------------------------

/** A Phaser multiatlas JSON (Story 3.3): one entry per page, each with a frame array. */
interface MultiAtlasJsonLike {
  textures?: ReadonlyArray<{ frames?: ReadonlyArray<AtlasFrameJson & { filename?: string }> }>;
}

/**
 * The frames of a JSON-hash atlas or of a Phaser multiatlas (every page's frames by name), so the
 * screen rules read either the same way.
 */
export function atlasFrames(json: unknown): AtlasJsonLike {
  if (json === null || typeof json !== 'object') return {};
  const multi = json as MultiAtlasJsonLike;
  if (Array.isArray(multi.textures)) {
    const frames: Record<string, AtlasFrameJson> = {};
    for (const page of multi.textures) for (const f of page.frames ?? []) if (typeof f.filename === 'string') frames[f.filename] = f;
    return { frames };
  }
  return json as AtlasJsonLike;
}

export interface DinoRuleInput {
  ids: ScreenIds;
  species: readonly string[];
  /** Story 3.4: the content cuts (PIECES) by piece count; a piece id in several cuts is the same frame and slot. */
  cuts: Readonly<Record<number, readonly string[]>>;
  /** Story 3.4: the bay anchor ids (`dino-bay-1..8`), bay 1 first (the identity fallback's order). */
  bays: readonly string[];
  /** Story 3.4: content DROP_ORDER; slots closer than snapRadius are allowed only while its first entry is `own`. */
  dropOrder: readonly string[];
  limits: LayoutLimits;
  /** ui.dinoSizePx ± ui.dinoSizeTolerance: the idle frame's trimmed longest side. */
  sizePx: number;
  sizeTolerance: number;
  /** character.minSize. */
  characterMin: number;
  /** draggableItem.minSize: each loose piece's displayed longest side. */
  itemMin: number;
  /** Story 3.4: ui.dinoPieceMinRawPx: each piece's trimmed longest side ÷ renderScale. */
  pieceMinRaw: number;
  /** Story 3.4: spacing.targetMin: each loose piece's hit diameter. */
  targetMin: number;
  /** Story 3.4: draggableItem.hitPad. */
  hitPad: number;
  /** ui.dinoSlotTolerancePx. */
  slotTolerance: number;
  /** spacing.targetGap. */
  gap: number;
  /** dropTarget.snapRadius. */
  snapRadius: number;
  /** ui.dinoWalkMaxPx. */
  walkMax: number;
  /** Tokens.safeRect. */
  safe: Rect;
  keepOut: readonly Rect[];
  renderScale: number;
  /** Story 3.4: receives one info line per close slot pair (allowed by the drop order). */
  info?: (line: string) => void;
}

/** The Ghép khủng long rules from Tokens and content. */
export function dinoPuzzleLimits(
  ids: ScreenIds,
  species: readonly string[],
  cuts: Readonly<Record<number, readonly string[]>>,
  bays: readonly string[],
  dropOrder: readonly string[],
): DinoRuleInput {
  return {
    ids,
    species,
    cuts,
    bays,
    dropOrder,
    limits: layoutLimits(),
    sizePx: Tokens.ui.dinoSizePx,
    sizeTolerance: Tokens.ui.dinoSizeTolerance,
    characterMin: Tokens.components.character.minSize,
    itemMin: Tokens.components.draggableItem.minSize,
    pieceMinRaw: Tokens.ui.dinoPieceMinRawPx,
    targetMin: Tokens.spacing.targetMin,
    hitPad: Tokens.components.draggableItem.hitPad,
    slotTolerance: Tokens.ui.dinoSlotTolerancePx,
    gap: Tokens.spacing.targetGap,
    snapRadius: Tokens.components.dropTarget.snapRadius,
    walkMax: Tokens.ui.dinoWalkMaxPx,
    safe: Tokens.safeRect,
    keepOut: hudKeepOutRects(),
    renderScale: RENDER_SCALE,
  };
}

/** A design-px rect of `size` centred at `c`. */
export const centredRect = (c: Point, size: { w: number; h: number }): Rect => ({ x: c.x - size.w / 2, y: c.y - size.h / 2, w: size.w, h: size.h });

const growRect = (r: Rect, d: number): Rect => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Distance between two rects (0 when they touch or overlap); games/dino-puzzle/starts.ts. */
export { rectGap };

/** The trimmed rect of an atlas frame in design px (its full-frame position). */
export function designRect(atlas: AtlasJsonLike, frame: string, rs: number): Rect | undefined {
  const t = trimmedRect(atlas, frame);
  return t ? { x: t.x / rs, y: t.y / rs, w: t.width / rs, h: t.height / rs } : undefined;
}

const fmtRect = (r: Rect): string => `(${round2(r.x)}, ${round2(r.y)}, ${round2(r.w)}×${round2(r.h)})`;

/** Every piece id of the cuts, in cut order, once each. */
const cutPieceIds = (cuts: DinoRuleInput['cuts']): string[] => [...new Set(Object.values(cuts).flat())];

/**
 * Story 3.4: the slot pairs of one species closer than `snapRadius`, over the pieces that share a cut
 * (each pair once, as `[slot id, slot id, distance]`).
 */
export function closeSlotPairs(layout: ScreenLayout, s: string, cuts: DinoRuleInput['cuts'], snapRadius: number): [string, string, number][] {
  const seen = new Set<string>();
  const out: [string, string, number][] = [];
  for (const cut of Object.values(cuts)) {
    for (let i = 0; i < cut.length; i++) {
      for (let j = i + 1; j < cut.length; j++) {
        const [a, b] = [cut[i]!, cut[j]!].sort() as [string, string];
        const key = `${a}|${b}`;
        const pa = layout.slots[`${s}-${a}`];
        const pb = layout.slots[`${s}-${b}`];
        if (seen.has(key) || !pa || !pb) continue;
        seen.add(key);
        const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (d < snapRadius) out.push([`${s}-${a}`, `${s}-${b}`, round2(d)]);
      }
    }
  }
  return out;
}

/**
 * Ghép khủng long screen rules (run by `render` with the rendered frames' trims, `atlas` and
 * `validate:content`). Each message names the id. A loose piece is drawn at `pieceScale`
 * (games/dino-puzzle/starts.ts): its displayed rect is its trimmed size × pieceScale centred at a point.
 *   - required: every layout id and, with the atlas, every frame;
 *   - sizes: `<s>/idle/00` longest side within sizePx ± sizeTolerance and ≥ characterMin; each piece's
 *     trimmed longest side ÷ renderScale ≥ pieceMinRaw (its displayed longest side is ≥ itemMin by
 *     construction) and its hit diameter ≥ targetMin;
 *   - slots: `slot.<s>-<p>` within slotTolerance of its piece frame's trimmed centre;
 *   - bay × piece (every bay, every piece id, every species): the displayed rect inside the interactive
 *     rect and outside every Hud keep-out rect, the bay inside `hit.grass`, the rect clear of the
 *     `<s>/ghost/00` rect grown by gap — so any assignment of pieces to bays fits;
 *   - fallback: per species × cut, the identity assignment (piece i → bay i) passes `pairsClear` and
 *     `clearOfSlots` (every start ≥ snapRadius from every slot of the cut); fewer bays than a cut
 *     is reported once, and a fallback that cannot be checked (missing bay, slot or frame) is reported;
 *   - close slots: two slots of one species (pieces sharing a cut) closer than snapRadius fail unless
 *     the drop order resolves the own slot first (each close pair is reported through `info`);
 *   - walk: |anchor.<s>-walk − anchor.<s>| ≤ walkMax and the idle rect moved by it stays inside safeRect.
 */
export function validateDinoPuzzle(layout: ScreenLayout, input: DinoRuleInput, atlas?: AtlasJsonLike): string[] {
  const problems = requiredIdProblems(layout, input.ids);
  const rs = input.renderScale;
  const r = input.limits.rect;
  const grass = layout.hits.grass;
  const pieceIds = cutPieceIds(input.cuts);
  const startLim = { gap: input.gap, snapRadius: input.snapRadius, minSize: input.itemMin };
  const bays = input.bays.map((id) => ({ id, at: layout.anchors[id] })).filter((b): b is { id: string; at: Point } => b.at !== undefined);
  if (atlas) for (const f of input.ids.frames) if (!trimmedSize(atlas, f)) problems.push(`atlas "dino-puzzle": frame "${f}" is missing`);
  for (const b of bays) if (grass && grass.length >= MIN_HIT_POINTS && !pointInPolygon(b.at, grass)) problems.push(`anchor "${b.id}": ${fmt(b.at)} is not on hit "grass"`);
  for (const [n, cut] of Object.entries(input.cuts)) if (cut.length > input.bays.length) problems.push(`cut ${n}: ${cut.length} pieces but only ${input.bays.length} bays`);
  for (const s of input.species) {
    const anchor = layout.anchors[s];
    const walk = layout.anchors[`${s}-walk`];
    const idle = atlas ? designRect(atlas, `${s}/idle/00`, rs) : undefined;
    if (idle) {
      const longest = Math.max(idle.w, idle.h);
      if (Math.abs(longest - input.sizePx) > input.sizeTolerance) problems.push(`frame "${s}/idle/00": longest side ${round2(longest)} is not ${input.sizePx} ± ${input.sizeTolerance}`);
      if (longest < input.characterMin) problems.push(`frame "${s}/idle/00": longest side ${round2(longest)} is under ${input.characterMin}`);
    }
    if (anchor && walk) {
      const d = Math.hypot(walk.x - anchor.x, walk.y - anchor.y);
      if (d > input.walkMax) problems.push(`anchor "${s}-walk": ${round2(d)} px from anchor "${s}" (max ${input.walkMax})`);
      if (idle) {
        const moved = { ...idle, x: idle.x + walk.x - anchor.x, y: idle.y + walk.y - anchor.y };
        const sf = input.safe;
        if (moved.x < sf.x || moved.y < sf.y || moved.x + moved.w > sf.x + sf.w || moved.y + moved.h > sf.y + sf.h) {
          problems.push(`anchor "${s}-walk": the walked idle rect ${fmtRect(moved)} leaves the safe rect`);
        }
      }
    }
    const ghost = atlas ? designRect(atlas, `${s}/ghost/00`, rs) : undefined;
    // Piece sizes and slots.
    const sizes = new Map<string, { w: number; h: number }>();
    for (const p of pieceIds) {
      const id = `${s}-${p}`;
      const slot = layout.slots[id];
      const piece = atlas ? designRect(atlas, `${id}/idle/00`, rs) : undefined;
      if (!piece) continue;
      sizes.set(p, { w: piece.w, h: piece.h });
      const raw = Math.max(piece.w, piece.h);
      if (raw < input.pieceMinRaw) problems.push(`frame "${id}/idle/00": raw longest side ${round2(raw)} is under ${input.pieceMinRaw}`);
      // The displayed longest side is max(raw, itemMin) by construction (pieceScale), so only the raw
      // minimum (which caps the enlargement) and the hit diameter can fail.
      const hitD = 2 * hitRadius(piece, input.itemMin, input.hitPad);
      if (hitD < input.targetMin) problems.push(`frame "${id}/idle/00": hit diameter ${round2(hitD)} is under ${input.targetMin}`);
      if (slot) {
        const d = Math.hypot(slot.x - (piece.x + piece.w / 2), slot.y - (piece.y + piece.h / 2));
        if (d > input.slotTolerance) problems.push(`slot "${id}": ${round2(d)} px from the trimmed centre of "${id}/idle/00" (max ${input.slotTolerance})`);
      }
    }
    // Every bay fits every piece.
    for (const b of bays) {
      for (const [p, size] of sizes) {
        const rect = displayedRect(b.at, size, input.itemMin);
        const what = `anchor "${b.id}" with "${s}-${p}"`;
        if (rect.x < r.x0 || rect.y < r.y0 || rect.x + rect.w > r.x1 || rect.y + rect.h > r.y1) {
          problems.push(`${what}: the piece rect ${fmtRect(rect)} leaves the interactive rect x∈[${r.x0},${r.x1}] y∈[${r.y0},${r.y1}]`);
        }
        if (input.keepOut.some((k) => overlaps(rect, k))) problems.push(`${what}: the piece rect reaches into a Home/Speaker keep-out zone`);
        if (ghost && overlaps(rect, growRect(ghost, input.gap))) problems.push(`${what}: the piece rect overlaps the ghost of "${s}" grown by ${input.gap}`);
      }
    }
    // The identity fallback of every cut (piece i → bay i).
    const geo: StartGeo = {
      bays: input.bays.map((id) => layout.anchors[id]!),
      slot: (_s, p) => layout.slots[`${s}-${p}`]!,
      size: (_s, p) => sizes.get(p)!,
    };
    const sp = s as SpeciesId;
    for (const [n, cut] of Object.entries(input.cuts)) {
      if (cut.length > input.bays.length) continue; // reported once, above the species loop
      const used = input.bays.slice(0, cut.length);
      const missing = [
        ...used.filter((id) => !layout.anchors[id]).map((id) => `anchor "${id}"`),
        ...cut.filter((p) => !layout.slots[`${s}-${p}`]).map((p) => `slot "${s}-${p}"`),
        ...cut.filter((p) => !sizes.has(p)).map((p) => `frame "${s}-${p}/idle/00"`),
      ];
      if (!atlas) {
        input.info?.(`dino-puzzle: species "${s}" cut ${n}: the identity fallback check needs the frames (skipped without an atlas)`);
        continue;
      }
      if (missing.length > 0) {
        problems.push(`species "${s}" cut ${n}: the identity fallback cannot be checked (missing ${missing.join(', ')})`);
        continue;
      }
      const at = assign(cut as readonly PieceId[], geo.bays);
      if (!pairsClear(at, sp, geo, startLim)) problems.push(`species "${s}" cut ${n}: the identity fallback (piece i → bay i) has piece rects closer than ${input.gap}`);
      if (!clearOfSlots(at, sp, geo, startLim)) problems.push(`species "${s}" cut ${n}: the identity fallback starts a piece within ${input.snapRadius} of a slot of the cut`);
    }
    // Close slots are allowed only while the own slot wins.
    for (const [a, b, d] of closeSlotPairs(layout, s, input.cuts, input.snapRadius)) {
      input.info?.(`dino-puzzle: slots "${a}" and "${b}" are ${d} px apart (< ${input.snapRadius}); allowed: the own slot wins (DROP_ORDER)`);
      if (input.dropOrder[0] !== 'own') problems.push(`slots "${a}" and "${b}": ${d} px apart (< ${input.snapRadius}) but DROP_ORDER does not resolve "own" first`);
    }
  }
  return problems;
}

export interface ShadowRuleInput {
  ids: ScreenIds;
  /** Content ITEM_IDS (frames `item-<id>/{color,shadow}/00`). */
  items: readonly string[];
  /** Content SHADOW_COUNTS: the slot rows (`slot.shadow-<n>-1..n`). */
  counts: readonly number[];
  limits: LayoutLimits;
  /** ui.trikeSizePx ± ui.trikeSizeTolerance: `triceratops/idle/00` trimmed longest side. */
  trikeSizePx: number;
  trikeSizeTolerance: number;
  /** character.minSize. */
  characterMin: number;
  /** ui.shadowItemPx ± ui.shadowItemTolerance: each item's trimmed longest side. */
  itemPx: number;
  itemTolerance: number;
  /** shadowTarget.minSize: each shadow's longest side. */
  shadowMin: number;
  /** ui.shadowHeldScale: the held item is drawn at this × its shadow size. */
  heldScale: number;
  /** draggableItem.minSize (the held item's longest side) and its hitPad. */
  itemMin: number;
  hitPad: number;
  /** spacing.targetMin (the held hit diameter) and spacing.targetGap (between shadows). */
  targetMin: number;
  gap: number;
  /** dropTarget.snapRadius and ui.hintSnapScale (its level-4 factor). */
  snapRadius: number;
  hintSnapScale: number;
  keepOut: readonly Rect[];
  renderScale: number;
  design: { width: number; height: number };
}

/** The Hang tìm bóng rules from Tokens and content. */
export function shadowMatchLimits(ids: ScreenIds, items: readonly string[], counts: readonly number[]): ShadowRuleInput {
  return {
    ids,
    items,
    counts,
    limits: layoutLimits(),
    trikeSizePx: Tokens.ui.trikeSizePx,
    trikeSizeTolerance: Tokens.ui.trikeSizeTolerance,
    characterMin: Tokens.components.character.minSize,
    itemPx: Tokens.ui.shadowItemPx,
    itemTolerance: Tokens.ui.shadowItemTolerance,
    shadowMin: Tokens.components.shadowTarget.minSize,
    heldScale: Tokens.ui.shadowHeldScale,
    itemMin: Tokens.components.draggableItem.minSize,
    hitPad: Tokens.components.draggableItem.hitPad,
    targetMin: Tokens.spacing.targetMin,
    gap: Tokens.spacing.targetGap,
    snapRadius: Tokens.components.dropTarget.snapRadius,
    hintSnapScale: Tokens.ui.hintSnapScale,
    keepOut: hudKeepOutRects(),
    renderScale: RENDER_SCALE,
    design: { width: Tokens.design.width, height: Tokens.design.height },
  };
}

/** The share of the screen one revealed shadow may cover ((2·shadowR)² ≤ this × the design area). */
export const SHADOW_REVEAL_MAX_SHARE = 0.25;
const TRIKE_IDLE_FRAME = 'triceratops/idle/00';
const TRIKE_CENTRE_SPAN = 1 / 6;
const TRIKE_ANCHOR_ID = 'triceratops';
const HAND_ANCHOR_ID = 'triceratops-hand';

/**
 * Story 3.5: the item sizes (design px, trimmed `item-<id>/color/00` ÷ renderScale) and the radii a
 * shadow-match screen is sized for: shadowR (the largest half longest side) and heldR.
 */
export function shadowSizes(atlas: AtlasJsonLike, items: readonly string[], rs: number, heldScale: number = Tokens.ui.shadowHeldScale): { sizes: Map<string, { w: number; h: number }>; shadowR: number; heldR: number } {
  const sizes = new Map<string, { w: number; h: number }>();
  for (const id of items) {
    const t = trimmedSize(atlas, `item-${id}/color/00`);
    if (t) sizes.set(id, { w: t.w / rs, h: t.h / rs });
  }
  const shadowR = shadowRadius(sizes.values());
  return { sizes, shadowR, heldR: heldRadius(shadowR, heldScale) };
}

const circleInRect = (c: Point, r: number, rect: LayoutLimits['rect']): boolean => c.x - r >= rect.x0 && c.x + r <= rect.x1 && c.y - r >= rect.y0 && c.y + r <= rect.y1;

/**
 * Hang tìm bóng screen rules (Story 3.5; run by `render` with the rendered frames' trims, `atlas` and
 * `validate:content`). Each message names the id. An item's rect is its trimmed `color` size ÷
 * renderScale; shadowR = the largest item's longest side / 2; heldR = shadowR × heldScale.
 *   - required: every layout id and, with the atlas, every frame;
 *   - sizes: `triceratops/idle/00` longest side within trikeSizePx ± tolerance and ≥ characterMin;
 *     |anchor.triceratops.x − width/2| ≤ width/6; each item's longest side within itemPx ± tolerance
 *     and ≥ shadowMin, and × heldScale ≥ itemMin; the held hit diameter (2·heldR + 2·hitPad) ≥
 *     targetMin; the `color` and `shadow` trimmed rects are equal;
 *   - slots (per row n): each circle (shadowR) inside the interactive rect and outside every Hud
 *     keep-out rect; pairwise centres ≥ 2·shadowR + gap; centre to hand ≥ shadowR + snapRadius ×
 *     hintSnapScale + heldR (no held item starts inside a snap zone, even at level 4);
 *   - hand: the held circle inside the interactive rect, outside the keep-out rects, in the lower third;
 *   - reveal: (2·shadowR)² ≤ SHADOW_REVEAL_MAX_SHARE × the design area.
 */
export function validateShadowMatch(layout: ScreenLayout, input: ShadowRuleInput, atlas?: AtlasJsonLike): string[] {
  const problems = requiredIdProblems(layout, input.ids);
  const rs = input.renderScale;
  const r = input.limits.rect;
  const W = input.design.width;
  const H = input.design.height;
  const trike = layout.anchors[TRIKE_ANCHOR_ID];
  if (trike && Math.abs(trike.x - W / 2) > W * TRIKE_CENTRE_SPAN) problems.push(`anchor "${TRIKE_ANCHOR_ID}": x ${trike.x} is more than ${round2(W * TRIKE_CENTRE_SPAN)} from the centre ${W / 2}`);
  if (!atlas) return problems;
  for (const f of input.ids.frames) if (!trimmedSize(atlas, f)) problems.push(`atlas "shadow-match": frame "${f}" is missing`);
  const idle = trimmedSize(atlas, TRIKE_IDLE_FRAME);
  if (idle) {
    const longest = Math.max(idle.w, idle.h) / rs;
    if (Math.abs(longest - input.trikeSizePx) > input.trikeSizeTolerance) problems.push(`frame "${TRIKE_IDLE_FRAME}": longest side ${round2(longest)} is not ${input.trikeSizePx} ± ${input.trikeSizeTolerance}`);
    if (longest < input.characterMin) problems.push(`frame "${TRIKE_IDLE_FRAME}": longest side ${round2(longest)} is under ${input.characterMin}`);
  }
  for (const id of input.items) {
    const colorFrame = `item-${id}/color/00`;
    const shadowFrame = `item-${id}/shadow/00`;
    const color = trimmedRect(atlas, colorFrame);
    const shadow = trimmedRect(atlas, shadowFrame);
    if (!color) continue;
    const longest = Math.max(color.width, color.height) / rs;
    if (Math.abs(longest - input.itemPx) > input.itemTolerance) problems.push(`frame "${colorFrame}": longest side ${round2(longest)} is not ${input.itemPx} ± ${input.itemTolerance}`);
    if (longest < input.shadowMin) problems.push(`frame "${colorFrame}": longest side ${round2(longest)} is under the shadow minimum ${input.shadowMin}`);
    if (longest * input.heldScale < input.itemMin) problems.push(`item "${id}": held longest side ${round2(longest * input.heldScale)} is under ${input.itemMin}`);
    if (shadow && (shadow.x !== color.x || shadow.y !== color.y || shadow.width !== color.width || shadow.height !== color.height)) {
      problems.push(`frame "${shadowFrame}": its trimmed rect differs from "${colorFrame}" (the outline must be the same)`);
    }
  }
  const { sizes, shadowR, heldR } = shadowSizes(atlas, input.items, rs, input.heldScale);
  if (sizes.size === 0) return problems;
  const heldHitD = 2 * heldR + 2 * input.hitPad;
  if (heldHitD < input.targetMin) problems.push(`anchor "${HAND_ANCHOR_ID}": the held hit diameter ${round2(heldHitD)} is under ${input.targetMin}`);
  if ((2 * shadowR) ** 2 > SHADOW_REVEAL_MAX_SHARE * W * H) problems.push(`shadow-match: a revealed shadow (${round2(2 * shadowR)} px square) covers more than ${SHADOW_REVEAL_MAX_SHARE * 100}% of the screen`);
  const hand = layout.anchors[HAND_ANCHOR_ID];
  if (hand) {
    if (!circleInRect(hand, heldR, r)) problems.push(`anchor "${HAND_ANCHOR_ID}": the held circle (r ${round2(heldR)}) at ${fmt(hand)} leaves the interactive rect x∈[${r.x0},${r.x1}] y∈[${r.y0},${r.y1}]`);
    if (input.keepOut.some((k) => circleHitsRect(hand, heldR, k))) problems.push(`anchor "${HAND_ANCHOR_ID}": the held circle reaches into a Home/Speaker keep-out zone`);
    if (hand.y < H * LOWER_THIRD) problems.push(`anchor "${HAND_ANCHOR_ID}": y ${hand.y} is above the lower third (${round2(H * LOWER_THIRD)})`);
  }
  const minHand = shadowR + input.snapRadius * input.hintSnapScale + heldR;
  for (const n of input.counts) {
    const row = Array.from({ length: n }, (_, k) => `shadow-${n}-${k + 1}`)
      .map((id) => ({ id, at: layout.slots[id] }))
      .filter((s): s is { id: string; at: Point } => s.at !== undefined);
    for (const s of row) {
      if (!circleInRect(s.at, shadowR, r)) problems.push(`slot "${s.id}": the shadow circle (r ${round2(shadowR)}) at ${fmt(s.at)} leaves the interactive rect x∈[${r.x0},${r.x1}] y∈[${r.y0},${r.y1}]`);
      if (input.keepOut.some((k) => circleHitsRect(s.at, shadowR, k))) problems.push(`slot "${s.id}": the shadow circle reaches into a Home/Speaker keep-out zone`);
      if (hand) {
        const d = Math.hypot(s.at.x - hand.x, s.at.y - hand.y);
        if (d < minHand) problems.push(`slot "${s.id}": ${round2(d)} px from anchor "${HAND_ANCHOR_ID}" (min ${round2(minHand)}: the held item would start inside a level-4 snap zone)`);
      }
    }
    for (let i = 0; i < row.length; i++) {
      for (let j = i + 1; j < row.length; j++) {
        const a = row[i]!;
        const b = row[j]!;
        const d = Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y);
        if (d < 2 * shadowR + input.gap) problems.push(`slots "${a.id}" and "${b.id}": ${round2(d)} px apart (min ${round2(2 * shadowR + input.gap)})`);
      }
    }
  }
  return problems;
}

export interface RaceRuleInput {
  ids: ScreenIds;
  /** Every path of every ladder level (`path.<id>`) with its level's shape. */
  paths: readonly { readonly id: string; readonly shape: string }[];
  /** Anchor ids of the swaying cones (≥ minCones, each clear of every road band). */
  cones: readonly string[];
  /** Anchor ids of the swaying flags (exactly flagCount, each clear of every road band). */
  flags: readonly string[];
  minCones: number;
  flagCount: number;
  limits: LayoutLimits;
  /** tracePath.width: the road band (half of it must stay clear of the edges and the Hud zones). */
  roadWidth: number;
  /** spacing.targetGap: a cone or flag keeps this much beyond the band. */
  gap: number;
  /** Roads are resampled every this many px (≤ 4). */
  sampleStep: number;
  /** Story 4.2: the circumradius through s ± turnSpan is ≥ minTurnRadius. */
  turnSpan: number;
  minTurnRadius: number;
  /** Story 4.2: samples ≥ selfClearArc apart in arc are ≥ roadWidth apart. */
  selfClearArc: number;
  /** Story 4.2: consecutive layout points of a curve/zigzag/loop road are ≤ pointGap apart. */
  pointGap: number;
  /** Story 4.2: a loop's first and last points are ≤ loopMouthMax apart. */
  loopMouthMax: number;
  /** kart.size: `kart/idle/00` trimmed longest side ÷ renderScale ∈ [kartSize, kartMaxScale × kartSize]. */
  kartSize: number;
  kartMaxScale: number;
  /** ui.raceGateMinPx: `gate/idle/00` trimmed width ÷ renderScale ≥ this. */
  gateMin: number;
  keepOut: readonly Rect[];
  renderScale: number;
}

/** Story 4.2: the ladder's paths (first use) with their level's shape. */
export function racePaths(levels: readonly { readonly shape: string; readonly pathIds: readonly string[] }[]): { id: string; shape: string }[] {
  const seen = new Set<string>();
  const out: { id: string; shape: string }[] = [];
  for (const l of levels) {
    for (const id of l.pathIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, shape: l.shape });
    }
  }
  return out;
}

/** The Đường đua rules from Tokens and content (Stories 4.1, 4.2). */
export function raceLimits(
  ids: ScreenIds,
  paths: readonly { readonly id: string; readonly shape: string }[],
  cones: readonly string[],
  flags: readonly string[] = [],
): RaceRuleInput {
  const ui = Tokens.ui;
  return {
    ids,
    paths,
    cones,
    flags,
    minCones: RACE_MIN_CONES,
    flagCount: flags.length,
    limits: layoutLimits(),
    roadWidth: Tokens.components.tracePath.width,
    gap: Tokens.spacing.targetGap,
    sampleStep: ui.traceSampleStepPx,
    turnSpan: ui.raceTurnSpanPx,
    minTurnRadius: ui.raceMinTurnRadiusPx,
    selfClearArc: ui.raceSelfClearArcPx,
    pointGap: ui.racePathPointGapPx,
    loopMouthMax: ui.raceLoopMouthMaxPx,
    kartSize: Tokens.components.kart.size,
    kartMaxScale: RACE_KART_MAX_SCALE,
    gateMin: ui.raceGateMinPx,
    keepOut: hudKeepOutRects(),
    renderScale: RENDER_SCALE,
  };
}

/** The kart sprite may be at most this × kart.size (its trimmed longest side). */
export const RACE_KART_MAX_SCALE = 1.6;
/** Story 4.2: at least this many swaying cones. */
export const RACE_MIN_CONES = 2;
const RACE_KART_FRAME = 'kart/idle/00';
const RACE_GATE_FRAME = 'gate/idle/00';
const DENSE_SHAPES: ReadonlySet<string> = new Set(['curve', 'zigzag', 'loop']);
const CONE_ID = /^cone-\d+$/;
const FLAG_ID = /^flag-\d+$/;

/** The polyline resampled at most every `step` px (both ends kept). */
export function resamplePolyline(points: readonly Point[], step: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  if (points.length > 0) out.push({ ...points[points.length - 1]! });
  return out;
}

/** The polyline resampled at exactly `step` px of arc (both ends kept), with the arc of each sample. */
export function arcSamples(points: readonly Point[], step: number): { pts: Point[]; arc: number[] } {
  const pts: Point[] = [];
  const arc: number[] = [];
  if (points.length === 0) return { pts, arc };
  pts.push({ ...points[0]! });
  arc.push(0);
  let total = 0;
  let next = step;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    while (len > 0 && next <= total + len) {
      const t = (next - total) / len;
      pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      arc.push(next);
      next += step;
    }
    total += len;
  }
  if (total > arc[arc.length - 1]!) {
    pts.push({ ...points[points.length - 1]! });
    arc.push(total);
  }
  return { pts, arc };
}

/** The radius of the circle through three points (Infinity when collinear). */
export function circumradius(a: Point, b: Point, c: Point): number {
  const ab = Math.hypot(b.x - a.x, b.y - a.y);
  const bc = Math.hypot(c.x - b.x, c.y - b.y);
  const ca = Math.hypot(a.x - c.x, a.y - c.y);
  const cross = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  return cross === 0 ? Infinity : (ab * bc * ca) / (2 * cross);
}

/** Distance from `p` to the rect (0 inside). */
const rectDistance = (p: Point, r: Rect): number => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), Math.max(r.y - p.y, 0, p.y - (r.y + r.h)));

/** Story 4.2: the geometry of one road's band (turn radius, self-clearance, density, loop mouth). */
function roadShapeProblems(id: string, shape: string, pts: readonly Point[], input: RaceRuleInput): string[] {
  const problems: string[] = [];
  const { pts: s, arc } = arcSamples(pts, input.sampleStep);
  const span = Math.max(1, Math.round(input.turnSpan / input.sampleStep));
  for (let i = span; i + span < s.length; i++) {
    const r = circumradius(s[i - span]!, s[i]!, s[i + span]!);
    if (r < input.minTurnRadius) {
      problems.push(`path "${id}": turn radius ${round2(r)} at ${fmt({ x: round2(s[i]!.x), y: round2(s[i]!.y) })} is under ${input.minTurnRadius} (the band folds)`);
      break;
    }
  }
  let touching: string | undefined;
  for (let i = 0; i < s.length && !touching; i++) {
    for (let j = i + 1; j < s.length; j++) {
      if (arc[j]! - arc[i]! < input.selfClearArc) continue;
      const d = Math.hypot(s[i]!.x - s[j]!.x, s[i]!.y - s[j]!.y);
      if (d < input.roadWidth) {
        touching = `path "${id}": two parts ${round2(arc[j]! - arc[i]!)} px of road apart are only ${round2(d)} px apart near ${fmt({ x: round2(s[i]!.x), y: round2(s[i]!.y) })} (min ${input.roadWidth}: the band touches itself)`;
        break;
      }
    }
  }
  if (touching) problems.push(touching);
  if (DENSE_SHAPES.has(shape)) {
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
      if (d > input.pointGap) {
        problems.push(`path "${id}": layout points ${i - 1} and ${i} are ${round2(d)} px apart (max ${input.pointGap})`);
        break;
      }
    }
  }
  if (shape === 'loop') {
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    const mouth = Math.hypot(a.x - b.x, a.y - b.y);
    if (mouth > input.loopMouthMax) problems.push(`path "${id}": the loop mouth is ${round2(mouth)} px wide (max ${input.loopMouthMax})`);
  }
  return problems;
}

/**
 * Đường đua screen rules (Stories 4.1, 4.2; run by `render`, `atlas` and `validate:content`). Each
 * message names the id.
 *   - required: every layout anchor, every ladder path (≥ 2 points) and, with the atlas, every frame;
 *   - road band: each path resampled every ≤ sampleStep px; every sample inside the interactive rect
 *     inset by roadWidth/2 and ≥ roadWidth/2 from every Hud keep-out rect;
 *   - band geometry (4.2): turn radius, self-clearance, point density (curve/zigzag/loop), loop mouth;
 *   - ambient anchors: each listed `anchor.cone-*` / `anchor.flag-*` ≥ roadWidth/2 + gap from every
 *     path; ≥ minCones cones and exactly flagCount flags;
 *   - sizes (atlas): the kart's trimmed longest side ÷ renderScale ∈ [kartSize, kartMaxScale × kartSize];
 *     the gate's trimmed width ÷ renderScale ≥ gateMin.
 */
export function validateRace(layout: ScreenLayout, input: RaceRuleInput, atlas?: AtlasJsonLike): string[] {
  const problems = requiredIdProblems(layout, input.ids);
  const half = input.roadWidth / 2;
  const r = input.limits.rect;
  const inner = { x0: r.x0 + half, y0: r.y0 + half, x1: r.x1 - half, y1: r.y1 - half };
  const roads: { id: string; pts: readonly Point[] }[] = [];
  for (const { id, shape } of input.paths) {
    const pts = layout.paths[id];
    if (!pts || pts.length < 2) {
      problems.push(`path "${id}": missing or has fewer than 2 points`);
      continue;
    }
    roads.push({ id, pts });
    const samples = resamplePolyline(pts, input.sampleStep);
    const out = samples.find((p) => !inRect(p, inner));
    if (out) problems.push(`path "${id}": the road band leaves the interactive rect at ${fmt({ x: round2(out.x), y: round2(out.y) })} (centre must lie in x∈[${inner.x0},${inner.x1}] y∈[${inner.y0},${inner.y1}])`);
    const hud = samples.find((p) => input.keepOut.some((k) => rectDistance(p, k) < half));
    if (hud) problems.push(`path "${id}": the road band reaches into a Home/Speaker keep-out zone at ${fmt({ x: round2(hud.x), y: round2(hud.y) })}`);
    problems.push(...roadShapeProblems(id, shape, pts, input));
  }
  const ids = Object.keys(layout.anchors);
  const cones = ids.filter((id) => CONE_ID.test(id)).length;
  if (cones < input.minCones) problems.push(`anchor "cone-*": ${cones} cones (min ${input.minCones})`);
  const flags = ids.filter((id) => FLAG_ID.test(id)).length;
  if (input.flagCount > 0 && flags !== input.flagCount) problems.push(`anchor "flag-*": ${flags} flags (exactly ${input.flagCount})`);
  for (const id of [...input.cones, ...input.flags]) {
    const c = layout.anchors[id];
    if (!c) continue;
    for (const road of roads) {
      const d = distToPolyline(c, road.pts);
      if (d < half + input.gap) problems.push(`anchor "${id}": ${round2(d)} px from path "${road.id}" (min ${half + input.gap})`);
    }
  }
  if (!atlas) return problems;
  for (const f of input.ids.frames) if (!trimmedSize(atlas, f)) problems.push(`atlas "race": frame "${f}" is missing`);
  const rs = input.renderScale;
  const kart = trimmedSize(atlas, RACE_KART_FRAME);
  if (kart) {
    const longest = Math.max(kart.w, kart.h) / rs;
    if (longest < input.kartSize || longest > input.kartMaxScale * input.kartSize) {
      problems.push(`frame "${RACE_KART_FRAME}": longest side ${round2(longest)} is not in [${input.kartSize}, ${round2(input.kartMaxScale * input.kartSize)}]`);
    }
  }
  const gate = trimmedSize(atlas, RACE_GATE_FRAME);
  if (gate && gate.w / rs < input.gateMin) problems.push(`frame "${RACE_GATE_FRAME}": width ${round2(gate.w / rs)} is under ${input.gateMin}`);
  return problems;
}

export interface FishingRuleInput {
  ids: ScreenIds;
  /** The swim region's hit id (`hit.pond-swim`). */
  pondId: string;
  /** Every colour × size sprite object (`fish-<c>-<s>`; its frames are in `ids.frames`). */
  fish: readonly { readonly color: string; readonly size: string }[];
  limits: LayoutLimits;
  /** fish.hitPad: the pond grown by this stays inside the interactive rect and this far from the Hud zones. */
  hitPad: number;
  /** fish.minSize and ui.fishSizeSlackPx: the small `swim/00` longest side ÷ renderScale ∈ [minSize, minSize + slack]. */
  minSize: number;
  sizeSlack: number;
  /** ui.fishSizeRatio ± ui.fishSizeRatioTol: big / small longest sides. */
  sizeRatio: number;
  sizeRatioTol: number;
  keepOut: readonly Rect[];
  renderScale: number;
}

/** The Câu cá rules from Tokens and content (Story 4.3). */
export function fishingLimits(ids: ScreenIds, pondId: string, fish: readonly { readonly color: string; readonly size: string }[]): FishingRuleInput {
  return {
    ids,
    pondId,
    fish,
    limits: layoutLimits(),
    hitPad: Tokens.components.fish.hitPad,
    minSize: Tokens.components.fish.minSize,
    sizeSlack: Tokens.ui.fishSizeSlackPx,
    sizeRatio: Tokens.ui.fishSizeRatio,
    sizeRatioTol: Tokens.ui.fishSizeRatioTol,
    keepOut: hudKeepOutRects(),
    renderScale: RENDER_SCALE,
  };
}

/**
 * Câu cá screen rules (Story 4.3; run by `render`, `atlas` and `validate:content`). Each message names the id.
 *   - required: `hit.pond-swim` (≥ 3 points), `anchor.dock`, `anchor.rod-tip`, `anchor.catch` and, with the
 *     atlas, every fish frame;
 *   - bounds: the pond grown by hitPad lies inside the interactive rect; the pond is ≥ 2 × hitPad from every
 *     Hud keep-out rect (the grown pond keeps hitPad from them);
 *   - sizes (atlas): each small `swim/00` longest trimmed side ÷ renderScale ∈ [minSize, minSize + slack];
 *     big / small within sizeRatio ± sizeRatioTol.
 */
export function validateFishing(layout: ScreenLayout, input: FishingRuleInput, atlas?: AtlasJsonLike): string[] {
  const problems = requiredIdProblems(layout, input.ids);
  const pond = layout.hits[input.pondId];
  if (pond && pond.length >= 3) {
    const r = input.limits.rect;
    const pad = input.hitPad;
    const out = pond.find((p) => p.x - pad < r.x0 || p.x + pad > r.x1 || p.y - pad < r.y0 || p.y + pad > r.y1);
    if (out) problems.push(`hit "${input.pondId}": the pond grown by ${pad} leaves the interactive rect at ${fmt(out)}`);
    const rectPoly = (k: Rect): Point[] => [{ x: k.x, y: k.y }, { x: k.x + k.w, y: k.y }, { x: k.x + k.w, y: k.y + k.h }, { x: k.x, y: k.y + k.h }];
    const hud = input.keepOut.find((k) => polygonDistance(pond, rectPoly(k)) < 2 * pad);
    if (hud) problems.push(`hit "${input.pondId}": the pond grown by ${pad} reaches into a Home/Speaker keep-out zone (${fmtRect(hud)})`);
  }
  if (!atlas) return problems;
  for (const f of input.ids.frames) if (!trimmedSize(atlas, f)) problems.push(`atlas "fishing": frame "${f}" is missing`);
  const rs = input.renderScale;
  const longest = (color: string, size: string): number | undefined => {
    const t = trimmedSize(atlas, `fish-${color}-${size}/swim/00`);
    return t ? Math.max(t.w, t.h) / rs : undefined;
  };
  for (const color of [...new Set(input.fish.map((f) => f.color))]) {
    const small = longest(color, 'small');
    const big = longest(color, 'big');
    if (small !== undefined && (small < input.minSize || small > input.minSize + input.sizeSlack)) {
      problems.push(`frame "fish-${color}-small/swim/00": longest side ${round2(small)} is not in [${input.minSize}, ${input.minSize + input.sizeSlack}]`);
    }
    if (small !== undefined && big !== undefined && Math.abs(big / small - input.sizeRatio) > input.sizeRatioTol) {
      problems.push(`frame "fish-${color}-big/swim/00": big / small ${round2(big / small)} is not ${input.sizeRatio} ± ${input.sizeRatioTol}`);
    }
  }
  return problems;
}

export interface TouchTalkRuleInput {
  ids: ScreenIds;
  /** Every scene with its prop ids (hits `prop-<id>`, frames `<id>/idle/00` and `<id>/react/00`). */
  scenes: readonly { readonly id: string; readonly props: readonly string[] }[];
  limits: LayoutLimits;
  /** spacing.targetMin: each padded hull is at least this wide. */
  targetMin: number;
  /** spacing.targetGap: two hulls of one scene are at least this far apart. */
  gap: number;
  /** ui.touchTalkPropMinPx..MaxPx: each `idle/00` trimmed longest side ÷ renderScale. */
  propMin: number;
  propMax: number;
  /** The Home/Speaker zones and the scene-bubble column. */
  keepOut: readonly { readonly id: string; readonly rect: Rect }[];
  renderScale: number;
}

/** The Chạm là nói rules from Tokens and content (Story 4.5). */
export function touchTalkLimits(ids: ScreenIds, scenes: readonly { readonly id: string; readonly props: readonly string[] }[], bubbleColumn: Rect): TouchTalkRuleInput {
  return {
    ids,
    scenes,
    limits: layoutLimits(),
    targetMin: Tokens.spacing.targetMin,
    gap: Tokens.spacing.targetGap,
    propMin: Tokens.ui.touchTalkPropMinPx,
    propMax: Tokens.ui.touchTalkPropMaxPx,
    keepOut: [...hudKeepOutRects().map((rect) => ({ id: 'Home/Speaker keep-out zone', rect })), { id: 'scene-bubble column', rect: bubbleColumn }],
    renderScale: RENDER_SCALE,
  };
}

const rectPolygon4 = (k: Rect): Point[] => [
  { x: k.x, y: k.y },
  { x: k.x + k.w, y: k.y },
  { x: k.x + k.w, y: k.y + k.h },
  { x: k.x, y: k.y + k.h },
];

/**
 * Chạm là nói screen rules (Story 4.5; run by `render`, `atlas` and `validate:content`). Each message names
 * the id.
 *   - required: every prop's `hit.prop-<id>` (≥ 3 points) and, with the atlas, `<id>/idle/00` and `<id>/react/00`;
 *   - each hull is at least targetMin wide, has every vertex inside the interactive rect, and touches no
 *     Home/Speaker zone and not the scene-bubble column;
 *   - within one scene, every pair of hulls is at least `gap` apart;
 *   - sizes (atlas): each `idle/00` trimmed longest side ÷ renderScale ∈ [propMin, propMax];
 *   - Story 4.6: every scene's `scene-thumb-<id>/idle/00` (in `ids.frames`); no prop id starts with `scene-thumb`.
 */
export function validateTouchTalk(layout: ScreenLayout, input: TouchTalkRuleInput, atlas?: AtlasJsonLike): string[] {
  const problems = requiredIdProblems(layout, input.ids);
  const r = input.limits.rect;
  for (const scene of input.scenes) {
    const hulls: { id: string; poly: readonly Point[] }[] = [];
    for (const prop of scene.props) {
      // Story 4.6: the scene thumbnails own the `scene-thumb-*` frame names.
      if (prop.startsWith('scene-thumb')) problems.push(`prop "${prop}" (${scene.id}): an id may not start with "scene-thumb"`);
      const id = `prop-${prop}`;
      const poly = layout.hits[id];
      if (!poly || poly.length < MIN_HIT_POINTS) continue;
      hulls.push({ id, poly });
      const w = minWidth(poly);
      if (w < input.targetMin) problems.push(`hit "${id}": ${round2(w)} px wide (min ${input.targetMin})`);
      const out = poly.find((p) => !inRect(p, r));
      if (out) problems.push(`hit "${id}": ${fmt(out)} leaves the interactive rect x∈[${r.x0},${r.x1}] y∈[${r.y0},${r.y1}]`);
      for (const k of input.keepOut) if (polygonDistance(poly, rectPolygon4(k.rect)) === 0) problems.push(`hit "${id}": reaches into the ${k.id} ${fmtRect(k.rect)}`);
    }
    for (let i = 0; i < hulls.length; i++) {
      for (let j = i + 1; j < hulls.length; j++) {
        const d = polygonDistance(hulls[i]!.poly, hulls[j]!.poly);
        if (d < input.gap) problems.push(`hits "${hulls[i]!.id}" and "${hulls[j]!.id}" (${scene.id}): ${round2(d)} px apart (min ${input.gap})`);
      }
    }
  }
  if (!atlas) return problems;
  for (const f of input.ids.frames) if (!trimmedSize(atlas, f)) problems.push(`atlas "touch-talk": frame "${f}" is missing`);
  for (const scene of input.scenes) {
    for (const prop of scene.props) {
      const t = trimmedSize(atlas, `${prop}/idle/00`);
      if (!t) continue;
      const longest = Math.max(t.w, t.h) / input.renderScale;
      if (longest < input.propMin || longest > input.propMax) problems.push(`frame "${prop}/idle/00": longest side ${round2(longest)} is not in [${input.propMin}, ${input.propMax}]`);
    }
  }
  return problems;
}
