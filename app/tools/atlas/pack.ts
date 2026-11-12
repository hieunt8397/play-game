// `npm run atlas -- <screen>` (Story 1.4): packs app/.generated/render/<screen>/frames/**.png into
// public/assets/atlases/<screen>.png|json (texture key `atlas.<screen>`, JSON hash) with
// free-tex-packer-core 0.3.9, and re-encodes the plate to public/assets/bg/<screen>.png (`bg.<screen>`).
// Story 3.3: a screen listed in SCREEN_MAX_PAGES (dino-puzzle: 4) may use up to that many pages, written
// as `<screen>-<n>.png` plus one Phaser multiatlas `<screen>.json`.
// Fails with no write when packing needs more than the screen's pages (default one), a page exceeds 2048 on either side, a
// file exceeds 8 MiB or a frame name breaks `<object>/<state>/<nn>`.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ATLASES, ATLAS_MAX_PAGES, FRAME_NAME, SCREEN_IDS, atlasPagePng, screenBackgrounds, type ScreenId } from '../../src/content/assets.ts';
import { BAY_ANCHORS, DROP_ORDER, PIECES, SPECIES, screen as dinoScreen } from '../../src/content/games/dino-puzzle.ts';
import { DECORATIONS } from '../../src/content/decorations.ts';
import { GAME_ICONS } from '../../src/content/game-icons.ts';
import { Tokens } from '../../src/core/tokens.ts';
import { screen as iceCreamScreen } from '../../src/content/games/ice-cream.ts';
import { screen as pizzaScreen } from '../../src/content/games/pizza.ts';
import { ITEM_IDS, SHADOW_COUNTS, screen as shadowScreen } from '../../src/content/games/shadow-match.ts';
import { GAME_STATIONS, HOME_STATION } from '../../src/content/stations.ts';
import { CORNER_IDS, HOME_SCREEN_REQUIREMENTS } from '../../src/content/home.ts';
import { ISLAND_GAME_IDS } from '../../src/content/types.ts';
import type { ScreenLayout } from '../../src/content/layout-types.ts';
import {
  MAX_FILE_BYTES,
  MAX_PAGE_SIDE,
  decorationLimits,
  iceCreamLimits,
  validateDecorations,
  validateIceCream,
  pizzaLimits,
  validatePizza,
  validatePlayAgainIcons,
  atlasFrames,
  dinoPuzzleLimits,
  validateDinoPuzzle,
  shadowMatchLimits,
  validateShadowMatch,
  raceLimits,
  racePaths,
  validateRace,
  fishingLimits,
  validateFishing,
  touchTalkLimits,
  validateTouchTalk,
  homeLimits,
  validateHome,
  animalPensLimits,
  validateAnimalPens,
  bandLimits,
  validateBand,
  bedtimeLimits,
  validateBedtime,
  petClinicLimits,
  validatePetClinic,
  dressUpLimits,
  validateDressUp,
  validateOutfitFrames,
  gardenLimits,
  validateGarden,
  carWashLimits,
  validateCarWash,
  planeLimits,
  validatePlane,
  trainLimits,
  validateTrain,
  rocketLimits,
  validateRocket,
  type AtlasJsonLike,
} from '../layout/rules.ts';
import { TOUCH_TALK_SCENES, TOUCH_TALK_SCREEN } from '../../src/content/games/touch-talk.ts';
import { ANIMAL_IDS, ANIMAL_PENS_SCREEN, DOOR_FRAMES, DOOR_IDS, peekFrame } from '../../src/content/games/animal-pens.ts';
import { BAND_SCREEN, INSTRUMENT_IDS } from '../../src/content/games/band.ts';
import { BEDTIME_SCREEN, TARGET_IDS as BEDTIME_TARGETS } from '../../src/content/games/bedtime.ts';
import { sceneBubbleKeepOutRect } from '../layout/hud-keep-out.ts';
import { ALL_FISH, FISHING_SCREEN, POND_HIT } from '../../src/content/games/fishing.ts';
import { CONE_ANCHORS, FLAG_ANCHORS, RACE_SCREEN, ladder as raceLadder } from '../../src/content/games/race.ts';
import type { PackFile, PackOptions, PackResult } from './free-tex-packer-core.d.ts';
import { fishLuma } from '../lint/fish-luma.ts';

const require = createRequire(import.meta.url);
sharp.cache(false);

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RENDER_DIR = join(APP_DIR, '.generated', 'render');
const PUBLIC_DIR = join(APP_DIR, 'public');
const LAYOUT_DIR = join(APP_DIR, 'src', 'content', 'generated');

/**
 * Screen rules that need the packed atlas (Story 1.8; Story 2.2 adds the map decorations: frames,
 * sizes, tap rects, station clearance; Story 2.4 the play-again icon frames); they read the published
 * layout. Any problem refuses the write.
 */
export const ATLAS_RULES: Readonly<Partial<Record<ScreenId, (layout: ScreenLayout, atlas: AtlasJsonLike) => string[]>>> = {
  map: (layout, atlas) => [
    ...validateDecorations(layout, decorationLimits(GAME_STATIONS, ISLAND_GAME_IDS, DECORATIONS, [HOME_STATION]), atlas),
    ...validatePlayAgainIcons(Object.keys(GAME_ICONS), atlas, layout.renderScale, Tokens.ui.playAgainIconPx),
    // Story 8.2: every guide frame has its overlay for every outfit item.
    ...validateOutfitFrames('map', atlas),
  ],
  'ice-cream': (layout, atlas) => [...validateIceCream(layout, iceCreamLimits(iceCreamScreen), atlas), ...validateOutfitFrames('ice-cream', atlas)],
  pizza: (layout, atlas) => validatePizza(layout, pizzaLimits(pizzaScreen), atlas),
  'dino-puzzle': (layout, atlas) => validateDinoPuzzle(layout, dinoPuzzleLimits(dinoScreen, SPECIES, PIECES, BAY_ANCHORS, DROP_ORDER), atlas),
  'shadow-match': (layout, atlas) => validateShadowMatch(layout, shadowMatchLimits(shadowScreen, ITEM_IDS, SHADOW_COUNTS), atlas),
  'touch-talk': (layout, atlas) => validateTouchTalk(layout, touchTalkLimits(TOUCH_TALK_SCREEN, TOUCH_TALK_SCENES.map((s) => ({ id: s.id, props: s.props.map((p) => p.id) })), sceneBubbleKeepOutRect()), atlas),
  fishing: (layout, atlas) => validateFishing(layout, fishingLimits(FISHING_SCREEN, POND_HIT, ALL_FISH), atlas),
  race: (layout, atlas) => validateRace(layout, raceLimits(RACE_SCREEN, racePaths(raceLadder), CONE_ANCHORS, FLAG_ANCHORS), atlas),
  // Story 7.1: the yard corners (frames, sizes, hulls).
  home: (layout, atlas) => validateHome(layout, homeLimits(HOME_SCREEN_REQUIREMENTS, CORNER_IDS), atlas),
  // Story 7.2: the pen doors and every frame at every door.
  'animal-pens': (layout, atlas) => validateAnimalPens(layout, animalPensLimits(ANIMAL_PENS_SCREEN, DOOR_IDS, [DOOR_FRAMES.closed, DOOR_FRAMES.open], ANIMAL_IDS.map(peekFrame)), atlas),
  // Story 7.3: the band's instruments (frames, sizes, the bouncing frame, hulls).
  band: (layout, atlas) => validateBand(layout, bandLimits(BAND_SCREEN, INSTRUMENT_IDS), atlas),
  // Story 7.4: the bedroom's tap targets, anchors and frames.
  bedtime: (layout, atlas) => validateBedtime(layout, bedtimeLimits(BEDTIME_SCREEN, BEDTIME_TARGETS), atlas),
  // Story 8.1: the clinic's exam area, patient frames and tool circles.
  'pet-clinic': (layout, atlas) => validatePetClinic(layout, petClinicLimits(), atlas),
  // Story 8.2: the wardrobe's tap circles and hulls, every frame, every overlay.
  'dress-up': (layout, atlas) => [...validateDressUp(layout, dressUpLimits(), atlas), ...validateOutfitFrames('dress-up', atlas)],
  // Trồng cây (2026-10-30): the tap circles, Shiba's hull, every frame, every outfit overlay.
  garden: (layout, atlas) => [...validateGarden(layout, gardenLimits(), atlas), ...validateOutfitFrames('garden', atlas)],
  // Rửa xe (2026-10-30): the car hulls, the dirt spots, the hose's tap circle, every frame.
  'car-wash': (layout, atlas) => validateCarWash(layout, carWashLimits(), atlas),
  // Phi công nhí (2026-11-11): the plane's flight band, the balloons, the friends and houses, every frame.
  plane: (layout, atlas) => validatePlane(layout, planeLimits(), atlas),
  // Tàu hỏa chở bạn (2026-11-12): the train's and the waiting targets' tap areas, the tunnel against the train, every frame.
  train: (layout, atlas) => validateTrain(layout, trainLimits(), atlas),
  // Tên lửa lên Mặt Trăng (2026-11-12): the tap areas, space never black, the bubble, the built rocket and Shiba's sizes, every frame.
  rocket: (layout, atlas) => validateRocket(layout, rocketLimits(), atlas),
};

/** PNG zlib level of the shipped background. */
const BG_COMPRESSION = 9;

/** The packer settings of every atlas (spec 1.4 › Atlas). */
export function packOptions(screen: string): PackOptions {
  return {
    textureName: screen,
    width: MAX_PAGE_SIDE,
    height: MAX_PAGE_SIDE,
    fixedSize: false,
    powerOfTwo: false,
    padding: 2,
    allowRotation: false,
    allowTrim: true,
    detectIdentical: true,
    removeFileExtension: true,
    prependFolderName: true,
    exporter: 'JsonHash',
  };
}

interface FrameJson {
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

interface AtlasJson {
  frames: Record<string, FrameJson>;
  meta: { size: { w: number; h: number }; image?: string };
}

/** Checks the packer output; returns the problems (empty = OK). */
export function checkAtlas(screen: string, files: readonly PackResult[], maxPages = 1): string[] {
  const problems: string[] = [];
  const pngs = files.filter((f) => f.name.endsWith('.png'));
  const jsons = files.filter((f) => f.name.endsWith('.json'));
  if (jsons.length !== pngs.length) {
    problems.push(`atlas "${screen}": the packer wrote ${pngs.length} page image(s) but ${jsons.length} page JSON(s)`);
    return problems;
  }
  if (pngs.length < 1 || pngs.length > maxPages) {
    problems.push(`atlas "${screen}": packing needs ${pngs.length} pages (max ${maxPages})`);
    return problems;
  }
  for (const file of jsons) {
    const json = JSON.parse(file.buffer.toString('utf8')) as AtlasJson;
    const { w, h } = json.meta.size;
    if (w > MAX_PAGE_SIDE || h > MAX_PAGE_SIDE) problems.push(`atlas "${screen}": page ${w}×${h} exceeds ${MAX_PAGE_SIDE}`);
    for (const name of Object.keys(json.frames)) {
      if (!FRAME_NAME.test(name)) problems.push(`atlas "${screen}": frame "${name}" is not <object>/<state>/<nn>`);
    }
  }
  for (const f of files) {
    if (f.buffer.length > MAX_FILE_BYTES) problems.push(`atlas "${screen}": ${f.name} is ${f.buffer.length} bytes (max ${MAX_FILE_BYTES})`);
  }
  return problems;
}

/**
 * Story 3.3: the most atlas pages per screen (default 1). Only these screens may spill over one 2048²
 * page; they ship `<screen>-<n>.png` pages and one Phaser multiatlas JSON (content/assets.ts › ATLAS_MAX_PAGES).
 */
export const SCREEN_MAX_PAGES: Readonly<Partial<Record<ScreenId, number>>> = ATLAS_MAX_PAGES;

export const maxPages = (screen: string): number => SCREEN_MAX_PAGES[screen as ScreenId] ?? 1;

/** One frame of a Phaser multiatlas page (JSON array format). */
export interface MultiAtlasFrame extends FrameJson {
  filename: string;
  frame: { x: number; y: number; w: number; h: number };
  rotated: boolean;
}

export interface MultiAtlasJson {
  textures: { image: string; format: string; size: { w: number; h: number }; scale: number; frames: MultiAtlasFrame[] }[];
  meta: { app: string; version: string };
}

/** The page number of a packer file (`<screen>-<n>.png|json`; a lone page has no suffix → 0). */
function pageOf(screen: string, name: string): number {
  const m = new RegExp(`^${screen}-(\\d+)\\.(png|json)$`).exec(name);
  return m ? Number(m[1]) : 0;
}

/**
 * Story 3.3: the packer's JSON-hash pages as one Phaser multiatlas (frames with their full-frame trim
 * restored, sorted by name; pages in packer order) and the page PNGs in the same order. Throws, naming
 * it, when a frame name is on more than one page.
 */
export function multiAtlas(screen: string, files: readonly PackResult[], trims: ReadonlyMap<string, Trim>): { json: MultiAtlasJson; pngs: Buffer[] } {
  const byPage = (ext: string) => files.filter((f) => f.name.endsWith(ext)).sort((a, b) => pageOf(screen, a.name) - pageOf(screen, b.name));
  const pngs = byPage('.png').map((f) => f.buffer);
  const seen = new Set<string>();
  const textures = byPage('.json').map((f, n) => {
    const page = JSON.parse(f.buffer.toString('utf8')) as AtlasJson & { frames: Record<string, FrameJson & { frame: MultiAtlasFrame['frame']; rotated?: boolean }> };
    restoreTrim(page, trims);
    const names = Object.keys(page.frames).sort();
    for (const name of names) {
      // Phaser keeps one frame per name: a frame on two pages would silently lose one of them.
      if (seen.has(name)) throw new Error(`atlas "${screen}": frame "${name}" is on more than one page`);
      seen.add(name);
    }
    const frames = names.map((name): MultiAtlasFrame => ({ filename: name, ...page.frames[name]!, rotated: page.frames[name]!.rotated ?? false }));
    return { image: atlasPagePng(screen, n).split('/').pop()!, format: 'RGBA8888', size: page.meta.size, scale: 1, frames };
  });
  return { json: { textures, meta: { app: 'be-hoc-choi tools/atlas', version: '1' } }, pngs };
}

/** Where a trimmed frame sat in its full frame. */
export interface Trim {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Bounding box of the pixels with alpha ≥ `minAlpha` (default > 0) in raw RGBA data; the whole frame when empty. */
export function alphaBounds(data: Uint8Array, width: number, height: number, minAlpha = 1): { left: number; top: number; right: number; bottom: number } {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  const RGBA = 4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * RGBA + RGBA - 1]! >= minAlpha) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return right < 0 ? { left: 0, top: 0, right: width - 1, bottom: height - 1 } : { left, top, right, bottom };
}

/**
 * Alpha below this is render noise (Story 1.8: EEVEE leaves scattered alpha 1–20 pixels around a
 * sprite rendered against holdouts); it is cleared before trimming so it neither shows nor widens the frame.
 */
export const ALPHA_NOISE_FLOOR = 24;

/**
 * The trim box is the bounds of alpha ≥ this, grown by TRIM_MARGIN px: holdout edges leave 1 px
 * slivers up to alpha ~60 at the frame border, which would otherwise stretch the trim across the frame.
 */
export const TRIM_ALPHA = 64;
export const TRIM_MARGIN = 2;

/** Clears pixels whose alpha is under `floor` (RGBA, in place); returns how many were cleared. */
export function clearAlphaNoise(data: Uint8Array, floor = ALPHA_NOISE_FLOOR): number {
  const RGBA = 4;
  let n = 0;
  for (let i = RGBA - 1; i < data.length; i += RGBA) {
    if (data[i]! > 0 && data[i]! < floor) {
      data[i - 3] = 0;
      data[i - 2] = 0;
      data[i - 1] = 0;
      data[i] = 0;
      n++;
    }
  }
  return n;
}

/**
 * Story 3.1: two frames of the same pose (the pizza fox's alternating tail wag repeats poses) are
 * rendered at different timeline frames, so EEVEE's sampling noise makes them differ by a few levels.
 * Frames whose trimmed boxes match and whose RGBA channels all differ by at most this are packed
 * once (the packer's detectIdentical then aliases them), keeping the atlas on one page.
 */
export const NEAR_IDENTICAL_DIFF = 16;

/** True when two raw RGBA buffers of the same size differ by at most `tol` in every channel. */
export function nearlyIdentical(a: Uint8Array, b: Uint8Array, tol = NEAR_IDENTICAL_DIFF): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > tol) return false;
  return true;
}

/**
 * Story 3.3: the trim box (render px, full-frame offsets) `atlas` would give a rendered frame, in the
 * JSON-hash `spriteSourceSize` shape. `render` checks the dino rules with it before any atlas exists.
 */
export async function frameTrimRect(png: Buffer): Promise<{ x: number; y: number; w: number; h: number }> {
  const t = await trimFrame(png);
  return { x: t.trim.left, y: t.trim.top, w: t.box.width, h: t.box.height };
}

async function trimFrame(png: Buffer): Promise<{ png: Buffer; trim: Trim; raw: Uint8Array; box: { width: number; height: number } }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  clearAlphaNoise(data);
  const core = alphaBounds(data, info.width, info.height, TRIM_ALPHA);
  const b = {
    left: Math.max(0, core.left - TRIM_MARGIN),
    top: Math.max(0, core.top - TRIM_MARGIN),
    right: Math.min(info.width - 1, core.right + TRIM_MARGIN),
    bottom: Math.min(info.height - 1, core.bottom + TRIM_MARGIN),
  };
  const box = { left: b.left, top: b.top, width: b.right - b.left + 1, height: b.bottom - b.top + 1 };
  const raw = { raw: { width: info.width, height: info.height, channels: 4 as const } };
  const cut = await sharp(data, raw).extract(box).raw().toBuffer();
  const out = await sharp(cut, { raw: { width: box.width, height: box.height, channels: 4 } }).png().toBuffer();
  return { png: out, trim: { ...box, width: info.width, height: info.height }, raw: cut, box: { width: box.width, height: box.height } };
}

/** Puts each frame back into its full source frame (Phaser places it with spriteSourceSize). */
export function restoreTrim(json: { frames: Record<string, FrameJson> }, trims: ReadonlyMap<string, Trim>): void {
  for (const [name, f] of Object.entries(json.frames)) {
    const t = trims.get(name);
    if (!t) continue;
    f.spriteSourceSize = { ...f.spriteSourceSize, x: f.spriteSourceSize.x + t.left, y: f.spriteSourceSize.y + t.top };
    f.sourceSize = { w: t.width, h: t.height };
    f.trimmed = true;
  }
}

function listPngs(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listPngs(p));
    else if (e.name.endsWith('.png')) out.push(p);
  }
  return out.sort();
}

/** Atomically writes several files: all go to temp names first, then are renamed into place. */
function writeAll(files: readonly { path: string; data: Buffer }[]): void {
  for (const f of files) {
    mkdirSync(dirname(f.path), { recursive: true });
    writeFileSync(`${f.path}.tmp`, f.data);
  }
  for (const f of files) renameSync(`${f.path}.tmp`, f.path);
}

export async function packScreen(screenArg: string | undefined): Promise<string[]> {
  if (!SCREEN_IDS.includes(screenArg as ScreenId)) {
    throw new Error(`unknown screen "${screenArg ?? ''}": known screens are ${SCREEN_IDS.join(', ')}`);
  }
  const screen = screenArg as ScreenId;
  const src = join(RENDER_DIR, screen);
  const framesDir = join(src, 'frames');
  // Story 4.5: a plated screen has one rendered background per plate (`bg-<plate>.png`).
  const bgs = screenBackgrounds(screen).map((b) => ({ ...b, src: join(src, b.plate ? `bg-${b.plate}.png` : 'bg.png') }));
  if (!existsSync(framesDir) || bgs.some((b) => !existsSync(b.src))) throw new Error(`no render for "${screen}": run npm run render -- ${screen}`);

  // free-tex-packer-core checks the untrimmed size against the page size before it trims, so a
  // full-frame 2048×1536 sprite can never fit a 2048 page. Frames are trimmed here and the JSON
  // gets the full-frame offsets back (restoreTrim), exactly as the packer's own trim would write.
  const trims = new Map<string, Trim>();
  const inputs: PackFile[] = [];
  const seen: { trim: Trim; raw: Uint8Array; png: Buffer; box: { width: number; height: number } }[] = [];
  for (const p of listPngs(framesDir)) {
    const path = relative(framesDir, p).split(sep).join('/');
    const t = await trimFrame(readFileSync(p));
    trims.set(path.replace(/\.png$/, ''), t.trim);
    const twin = seen.find((o) => o.trim.left === t.trim.left && o.trim.top === t.trim.top && o.box.width === t.box.width && o.box.height === t.box.height && nearlyIdentical(o.raw, t.raw));
    if (!twin) seen.push(t);
    inputs.push({ path, contents: twin ? twin.png : t.png });
  }
  const { packAsync } = require('free-tex-packer-core') as { packAsync: (f: PackFile[], o: PackOptions) => Promise<PackResult[]> };
  const result = await packAsync(inputs, packOptions(screen));
  const pages = maxPages(screen);
  const problems = checkAtlas(screen, result, pages);
  const bgData = await Promise.all(bgs.map(async (b) => ({ path: b.ref.path, data: await sharp(b.src).png({ compressionLevel: BG_COMPRESSION }).toBuffer() })));
  for (const b of bgData) if (b.data.length > MAX_FILE_BYTES) problems.push(`background "${b.path}": ${b.data.length} bytes (max ${MAX_FILE_BYTES})`);
  if (problems.length > 0) throw new Error(problems.join('\n'));

  const atlas = ATLASES[screen];
  const out: { path: string; data: Buffer }[] = [];
  let ruleJson: AtlasJsonLike;
  let stale: string[] = [];
  if (pages > 1) {
    // Story 3.3: every page (even a single one) as `<screen>-<n>.png` plus one Phaser multiatlas JSON.
    const multi = multiAtlas(screen, result, trims);
    multi.pngs.forEach((data, n) => out.push({ path: join(PUBLIC_DIR, atlasPagePng(screen, n)), data }));
    out.push({ path: join(PUBLIC_DIR, atlas.json), data: Buffer.from(`${JSON.stringify(multi.json, null, 2)}\n`) });
    ruleJson = atlasFrames(multi.json);
    stale = Array.from({ length: pages - multi.pngs.length }, (_, k) => join(PUBLIC_DIR, atlasPagePng(screen, multi.pngs.length + k)));
  } else {
    const png = result.find((f) => f.name.endsWith('.png'))!;
    const jsonFile = result.find((f) => f.name.endsWith('.json'))!;
    const json = JSON.parse(jsonFile.buffer.toString('utf8')) as AtlasJson;
    restoreTrim(json, trims);
    json.meta.image = atlas.png.split('/').pop()!;
    out.push({ path: join(PUBLIC_DIR, atlas.png), data: png.buffer }, { path: join(PUBLIC_DIR, atlas.json), data: Buffer.from(`${JSON.stringify(json, null, 2)}\n`) });
    ruleJson = json;
  }
  const rule = ATLAS_RULES[screen];
  if (rule) {
    const layout = JSON.parse(readFileSync(join(LAYOUT_DIR, `${screen}.layout.json`), 'utf8')) as ScreenLayout;
    const atlasProblems = rule(layout, ruleJson);
    if (atlasProblems.length > 0) throw new Error(atlasProblems.join('\n'));
  }
  for (const b of bgData) out.push({ path: join(PUBLIC_DIR, b.path), data: b.data });
  writeAll(out);
  // Pages a bigger earlier pack left behind would only be precached for nothing.
  for (const p of stale) rmSync(p, { force: true });
  return out.map((f) => `${relative(APP_DIR, f.path).split('\\').join('/')} (${f.data.length} bytes)`);
}

async function main(): Promise<void> {
  try {
    const written = await packScreen(process.argv[2]);
    for (const w of written) console.log(`atlas: wrote ${w}`);
    // Story 4.3: the fish colours' brightness gaps, measured on the atlas just written.
    if (process.argv[2] === 'fishing') {
      const luma = await fishLuma(PUBLIC_DIR);
      for (const line of luma.info) console.log(`atlas: ${line}`);
      if (luma.problems.length > 0) throw new Error(luma.problems.join('\n'));
    }
  } catch (e) {
    console.error(`atlas: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
