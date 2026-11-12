// `npm run render -- <screen>` (Story 1.4): renders art/<screen>.blend with
// tools/render/blender/render_screen.py into app/.generated/render/<screen>/ (bg.png,
// frames/<object>/<state>/<nn>.png, raw.json, preview.png) and writes
// src/content/generated/<screen>.layout.json.
// Story 4.5: a multi-plate screen (content/assets.ts › SCREEN_PLATES) renders each plate's Blender scene
// (`-S <plate>`) into its own temp subdir, then merges: `bg-<plate>.png` per plate, one `frames/` tree and
// one raw projection (a frame or a `<kind>.<id>` in two plates fails naming it), one layout JSON, and
// `preview-<plate>.png` showing only that plate's objects.
// Order: resolve Blender + check 5.2 → render into a temp dir → toLayout → validateLayout → draw the
// preview → move everything into place. Any failure leaves every existing output untouched.
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import type { ScreenLayout } from '../../src/content/layout-types.ts';
import { MAP_GUIDE, SCREEN_PLATES, type ScreenId } from '../../src/content/assets.ts';
import { HOME_STATION, STATIONS } from '../../src/content/stations.ts';
import { CORNER_IDS, HOME_SCREEN_REQUIREMENTS } from '../../src/content/home.ts';
import { ISLAND_GAME_IDS } from '../../src/content/types.ts';
import { Tokens } from '../../src/core/tokens.ts';
import {
  dinoPuzzleLimits,
  iceCreamLimits,
  layoutLimits,
  pizzaLimits,
  shadowMatchLimits,
  validateDinoPuzzle,
  validateIceCream,
  validateLayout,
  validatePizza,
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
import { CAVE_HIT, ITEM_IDS, SHADOW_COUNTS, screen as shadowScreen } from '../../src/content/games/shadow-match.ts';
import { BAY_ANCHORS, DROP_ORDER, GRASS_HIT, PIECES, SPECIES, screen as dinoScreen } from '../../src/content/games/dino-puzzle.ts';
import { frameTrimRect } from '../atlas/pack.ts';
import { ghostFrame, silhouetteFrame } from './ghost.ts';
import { screen as pizzaScreen } from '../../src/content/games/pizza.ts';
import { HITS, screen as iceCreamScreen } from '../../src/content/games/ice-cream.ts';
import { HITS as DRESS_UP_HITS } from '../../src/content/games/dress-up.ts';
import { HITS as GARDEN_HITS } from '../../src/content/games/garden.ts';
import { VEHICLE_IDS as CAR_WASH_VEHICLES, carHit } from '../../src/content/games/car-wash.ts';
import { CAR_COLOURS as TRAIN_CARS, ENGINE_HIT as TRAIN_ENGINE_HIT, carHit as trainCarHit } from '../../src/content/games/train.ts';
import { CHOICES as ROCKET_CHOICES, CRATERS as ROCKET_CRATERS, EARTH_HIT as ROCKET_EARTH_HIT, EARTH_MOON_HIT as ROCKET_EARTH_MOON_HIT, MOON_ROCKET_HIT as ROCKET_MOON_HIT, choiceHit as rocketChoiceHit, craterHit as rocketCraterHit } from '../../src/content/games/rocket.ts';
import { LayoutError, formatLayout, toLayout, type RawProjection, type ToLayoutOptions } from '../layout/to-layout.ts';
import { resolveBlender, type Env } from '../shared/binaries.ts';
import { BLENDER_SCRIPTS, LAYOUT_DIR, RENDER_DIR, blendPath, blenderArgs, runBlender, runProcess, screenSpec, type Runner } from './blender.ts';

// sharp keeps input files open in its cache; Windows then refuses to move the render dir.
sharp.cache(false);

/**
 * Per-screen layout rules (the map: stations, touch rules, road). `frames` holds the rendered frames'
 * trim boxes in the atlas JSON shape for the screens listed in FRAME_RULE_SCREENS.
 */
export const SCREEN_RULES: Readonly<Record<string, (layout: ScreenLayout, frames?: AtlasJsonLike) => string[]>> = {
  map: (layout) => validateLayout(layout, { stations: STATIONS, gameIds: ISLAND_GAME_IDS, shellStations: [HOME_STATION], limits: layoutLimits(), guide: MAP_GUIDE.id }),
  // The atlas does not exist yet at render time: the frame rules run in `atlas` and `validate:content`.
  'ice-cream': (layout) => validateIceCream(layout, iceCreamLimits(iceCreamScreen)),
  pizza: (layout) => validatePizza(layout, pizzaLimits(pizzaScreen)),
  // Story 3.3: nearly every dino rule reads frame sizes, so render checks them on the rendered frames' trims.
  'dino-puzzle': (layout, frames) => validateDinoPuzzle(layout, dinoPuzzleLimits(dinoScreen, SPECIES, PIECES, BAY_ANCHORS, DROP_ORDER), frames),
  // Story 3.5: the shadow-match rules read item and triceratops sizes from the rendered frames' trims.
  'shadow-match': (layout, frames) => validateShadowMatch(layout, shadowMatchLimits(shadowScreen, ITEM_IDS, SHADOW_COUNTS), frames),
  // Story 4.1: the road bands, the cones and the kart/gate sizes (from the rendered frames' trims).
  // Story 4.3: the pond bounds and the fish sizes (from the rendered frames' trims).
  // Story 4.5: the prop hulls (width, edges, Hud zones, the two-column bubble area, gaps) and sizes.
  'touch-talk': (layout, frames) => validateTouchTalk(layout, touchTalkLimits(TOUCH_TALK_SCREEN, TOUCH_TALK_SCENES.map((s) => ({ id: s.id, props: s.props.map((p) => p.id) })), sceneBubbleKeepOutRect()), frames),
  fishing: (layout, frames) => validateFishing(layout, fishingLimits(FISHING_SCREEN, POND_HIT, ALL_FISH), frames),
  race: (layout, frames) => validateRace(layout, raceLimits(RACE_SCREEN, racePaths(raceLadder), CONE_ANCHORS, FLAG_ANCHORS), frames),
  // Story 7.1: the yard corners (hulls, Hud zones, gaps, sizes from the rendered frames' trims).
  home: (layout, frames) => validateHome(layout, homeLimits(HOME_SCREEN_REQUIREMENTS, CORNER_IDS), frames),
  // Story 7.2: the pen doors (hulls, one row, Hud zones, gaps) and every frame at every door (from the rendered frames' trims).
  'animal-pens': (layout, frames) => validateAnimalPens(layout, animalPensLimits(ANIMAL_PENS_SCREEN, DOOR_IDS, [DOOR_FRAMES.closed, DOOR_FRAMES.open], ANIMAL_IDS.map(peekFrame)), frames),
  // Story 7.3: the band's instruments (hulls, Hud zones, gaps; sizes and the bouncing frame from the rendered frames' trims).
  band: (layout, frames) => validateBand(layout, bandLimits(BAND_SCREEN, INSTRUMENT_IDS), frames),
  // Story 7.4: the bedroom's tap targets (≥ 150 px, rect, Hud zones, gaps), the anchors on screen, the frames.
  bedtime: (layout, frames) => validateBedtime(layout, bedtimeLimits(BEDTIME_SCREEN, BEDTIME_TARGETS), frames),
  // Story 8.1: the clinic's exam area, the walk row, every patient frame and the tool circles (from the rendered frames' trims).
  'pet-clinic': (layout, frames) => validatePetClinic(layout, petClinicLimits(), frames),
  // Story 8.2: the wardrobe (Shiba and mirror hulls, the item tap circles from the rendered frames' trims).
  'dress-up': (layout, frames) => validateDressUp(layout, dressUpLimits(), frames),
  // Trồng cây (2026-10-30): Shiba's hull, the can / packet / fruit tap circles and every placed frame (from the rendered frames' trims).
  garden: (layout, frames) => validateGarden(layout, gardenLimits(), frames),
  // Rửa xe (2026-10-30): the car hulls and their dirt spots, the hose's tap circle, every car and dirt frame.
  'car-wash': (layout, frames) => validateCarWash(layout, carWashLimits(), frames),
  // Phi công nhí (2026-11-11): the plane at every height of its flight, the balloons, the friends and their houses.
  plane: (layout, frames) => validatePlane(layout, planeLimits(), frames),
  // Tàu hỏa chở bạn (2026-11-12): the engine and cars apart, the platform, friends and destinations clear of them, the tunnel.
  train: (layout, frames) => validateTrain(layout, trainLimits(), frames),
  // Tên lửa lên Mặt Trăng (2026-11-12): the choices, the rocket, the Earth and the craters; space never black.
  rocket: (layout) => validateRocket(layout, rocketLimits()),
};

/** Story 3.3: screens whose render-time rules get the rendered frames' trims. */
export const FRAME_RULE_SCREENS: ReadonlySet<string> = new Set(['dino-puzzle', 'shadow-match', 'race', 'fishing', 'touch-talk', 'home', 'animal-pens', 'band', 'bedtime', 'pet-clinic', 'dress-up', 'garden', 'car-wash', 'plane', 'train', 'rocket']);

/** Per-screen toLayout options: hit ids kept `stationGap` apart (map), unpadded drop areas (ice-cream, the dino lawn). */
export const SCREEN_SEPARATE: Readonly<Record<string, Pick<ToLayoutOptions, 'separate' | 'unpadded'>>> = {
  map: { separate: { ids: STATIONS.map((s) => s.id), gap: Tokens.spacing.stationGap } },
  'ice-cream': { unpadded: [HITS.counterUpper, HITS.counterTop] },
  'dino-puzzle': { unpadded: [GRASS_HIT] },
  // Story 3.5: `hit.cave` is the bright wall area the luminance rule measures, not a tap area.
  'shadow-match': { unpadded: [CAVE_HIT] },
  // Story 4.3: `hit.pond-swim` is the swim region every fish body stays in, not a tap area.
  fishing: { unpadded: [POND_HIT] },
  // Story 8.2: the wardrobe's tap areas are the raw hulls (Shiba, the mirror; the glass is the reflection's mask): the item circles keep ≥ targetGap from them.
  'dress-up': { unpadded: [DRESS_UP_HITS.shiba, DRESS_UP_HITS.mirror, DRESS_UP_HITS.mirrorGlass] },
  // Trồng cây: Shiba's tap area is its raw hull (the tap circles keep ≥ targetGap from it).
  garden: { unpadded: [GARDEN_HITS.shiba] },
  // Rửa xe: each car's tap area is its raw hull (the hose circle keeps ≥ targetGap from it; the rub reaches a little further at runtime).
  'car-wash': { unpadded: CAR_WASH_VEHICLES.map(carHit) },
  // Tàu hỏa chở bạn: the engine's and each car's tap areas are their raw hulls (they stand close in a row, ≥ targetGap apart).
  train: { unpadded: [TRAIN_ENGINE_HIT, ...TRAIN_CARS.map((_, n) => trainCarHit(n))] },
  // Tên lửa: the two bubbles, the Moon rocket, the craters (they stand close; ≥ targetGap apart) and the two Earths (already cut to the interactive rect) are their raw shapes.
  rocket: { unpadded: [...Array.from({ length: ROCKET_CHOICES }, (_, n) => rocketChoiceHit(n)), ROCKET_MOON_HIT, ROCKET_EARTH_HIT, ROCKET_EARTH_MOON_HIT, ...Array.from({ length: ROCKET_CRATERS }, (_, n) => rocketCraterHit(n))] },
};

export const layoutPath = (screen: string): string => join(LAYOUT_DIR, `${screen}.layout.json`);

/**
 * Story 3.3: writes `frames/<object>/ghost/00.png` (tools/render/ghost.ts) for every `ghosts` object of
 * the raw projection into `dir` and adds the frame names to `raw.frames`.
 */
export async function addGhostFrames(dir: string, raw: RawProjection, renderScale: number): Promise<void> {
  for (const o of raw.ghosts ?? []) {
    const idle = join(dir, 'frames', o, 'idle', '00.png');
    if (!existsSync(idle)) throw new Error(`ghost of "${o}": frame ${o}/idle/00 was not rendered`);
    const out = join(dir, 'frames', o, 'ghost');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, '00.png'), await ghostFrame(readFileSync(idle), renderScale));
    raw.frames.push(`${o}/ghost/00`);
  }
}

/**
 * Story 3.5: writes `frames/<object>/shadow/00.png` (tools/render/ghost.ts › silhouetteFrame: the colour
 * frame's alpha in colors.shadowTarget) for every `silhouettes` object of the raw projection into `dir`
 * and adds the frame names to `raw.frames`.
 */
export async function addSilhouetteFrames(dir: string, raw: RawProjection): Promise<void> {
  for (const o of raw.silhouettes ?? []) {
    const color = join(dir, 'frames', o, 'color', '00.png');
    if (!existsSync(color)) throw new Error(`silhouette of "${o}": frame ${o}/color/00 was not rendered`);
    const out = join(dir, 'frames', o, 'shadow');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, '00.png'), await silhouetteFrame(readFileSync(color)));
    raw.frames.push(`${o}/shadow/00`);
  }
}

/** The rendered frames' trim boxes (as `atlas` would write them), keyed by frame name. */
export async function renderedTrims(dir: string, frames: readonly string[]): Promise<AtlasJsonLike> {
  const out: Record<string, { spriteSourceSize: { x: number; y: number; w: number; h: number } }> = {};
  for (const f of frames) out[f] = { spriteSourceSize: await frameTrimRect(readFileSync(join(dir, 'frames', `${f}.png`))) };
  return { frames: out };
}

/** Every file under `dir`, relative (forward slashes). */
function filesUnder(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesUnder(p, base) : [p.slice(base.length + 1).split('\\').join('/')];
  });
}

/**
 * Story 4.5: merges the plates' raw projections (rendered into `<dir>/plate-<plate>`) into `dir`: the frames
 * into one tree, each plate's bg as `bg-<plate>.png`, the objects and frame lists concatenated. A frame
 * path or an object name in two plates throws naming it. Returns the merged raw and each plate's object names.
 */
export function mergePlates(dir: string, screen: string, plates: readonly string[]): { raw: RawProjection; objectsOf: Map<string, Set<string>> } {
  const merged: RawProjection = { screenId: screen, render: { width: 0, height: 0 }, objects: [], frames: [], ghosts: [], silhouettes: [] };
  const owner = new Map<string, string>();
  const frameOwner = new Map<string, string>();
  const objectsOf = new Map<string, Set<string>>();
  const problems: string[] = [];
  for (const plate of plates) {
    const sub = join(dir, `plate-${plate}`);
    const raw = JSON.parse(readFileSync(join(sub, 'raw.json'), 'utf8')) as RawProjection;
    if (merged.render.width === 0) merged.render = raw.render;
    const names = new Set<string>();
    for (const o of raw.objects) {
      const other = owner.get(o.name);
      if (other) problems.push(`layout object "${o.name}" is in plates "${other}" and "${plate}"`);
      owner.set(o.name, plate);
      names.add(o.name);
      merged.objects.push(o);
    }
    objectsOf.set(plate, names);
    for (const f of filesUnder(join(sub, 'frames'))) {
      const other = frameOwner.get(f);
      if (other) problems.push(`frame "${f}" is in plates "${other}" and "${plate}"`);
      frameOwner.set(f, plate);
      mkdirSync(join(dir, 'frames', f, '..'), { recursive: true });
      copyFileSync(join(sub, 'frames', f), join(dir, 'frames', f));
    }
    merged.frames.push(...raw.frames);
    merged.ghosts!.push(...(raw.ghosts ?? []));
    merged.silhouettes!.push(...(raw.silhouettes ?? []));
    if (existsSync(join(sub, 'bg.png'))) copyFileSync(join(sub, 'bg.png'), join(dir, `bg-${plate}.png`));
  }
  if (problems.length > 0) throw new LayoutError(problems);
  return { raw: merged, objectsOf };
}

/** Story 4.6: a scene thumbnail is a centred square of this share of the plate's height. */
export const THUMB_CROP = 0.6;

/**
 * Story 4.6: writes `frames/scene-thumb-<plate>/idle/00.png` for each plate from its `bg-<plate>.png`: a
 * centred square of side height × THUMB_CROP, resized to the scene bubble's inner diameter
 * ((sceneBubble.base.size − 2·ui.sceneBubbleInsetPx) × renderScale) and masked to a circle. Deterministic.
 */
export async function addSceneThumbs(dir: string, raw: RawProjection, plates: readonly string[], renderScale: number): Promise<void> {
  const side = Math.round((Tokens.components.sceneBubble.base.size - 2 * Tokens.ui.sceneBubbleInsetPx) * renderScale);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}"><circle cx="${side / 2}" cy="${side / 2}" r="${side / 2}" fill="#fff"/></svg>`);
  for (const plate of plates) {
    const bg = sharp(join(dir, `bg-${plate}.png`));
    const { width = 0, height = 0 } = await bg.metadata();
    const crop = Math.round(height * THUMB_CROP);
    const out = join(dir, 'frames', `scene-thumb-${plate}`, 'idle');
    mkdirSync(out, { recursive: true });
    const square = await bg.extract({ left: Math.round((width - crop) / 2), top: Math.round((height - crop) / 2), width: crop, height: crop }).resize(side, side).ensureAlpha().png().toBuffer();
    await sharp(square).composite([{ input: mask, blend: 'dest-in' }]).png().toFile(join(out, '00.png'));
    raw.frames.push(`scene-thumb-${plate}/idle/00`);
  }
}

/** The part of `layout` whose objects are in `names` (`<kind>.<id>`), for a plate's preview. */
export function plateLayout(layout: ScreenLayout, names: ReadonlySet<string>): ScreenLayout {
  const pick = <T>(kind: string, rec: Readonly<Record<string, T>>): Record<string, T> => Object.fromEntries(Object.entries(rec).filter(([id]) => names.has(`${kind}.${id}`)));
  return { ...layout, anchors: pick('anchor', layout.anchors), hits: pick('hit', layout.hits), slots: pick('slot', layout.slots), paths: pick('path', layout.paths) };
}

/** Converts and validates a raw projection; throws a LayoutError listing every problem. */
export function layoutFromRaw(screen: string, raw: RawProjection, frames?: AtlasJsonLike): ScreenLayout {
  const layout = toLayout(raw, { design: { width: Tokens.design.width, height: Tokens.design.height }, hitPad: Tokens.spacing.hitPad, ...SCREEN_SEPARATE[screen] });
  const problems = SCREEN_RULES[screen]?.(layout, frames) ?? [];
  if (problems.length > 0) throw new LayoutError(problems);
  return layout;
}

const PREVIEW = { hit: '#ff00aa', anchor: '#ffffff', stop: '#ffe000', slot: '#00e0ff', path: '#ff6a00', ink: '#1f2433' };

/** SVG overlay (render px) of hit polygons, anchors, slots and paths, for the human alignment check. */
export function previewSvg(layout: ScreenLayout): string {
  const s = layout.renderScale;
  const w = layout.design.width * s;
  const h = layout.design.height * s;
  const pt = (p: { x: number; y: number }): string => `${(p.x * s).toFixed(1)},${(p.y * s).toFixed(1)}`;
  const parts: string[] = [];
  for (const line of Object.values(layout.paths)) {
    parts.push(`<polyline points="${line.map(pt).join(' ')}" fill="none" stroke="${PREVIEW.path}" stroke-width="4" stroke-dasharray="16 10"/>`);
  }
  for (const [id, poly] of Object.entries(layout.hits)) {
    parts.push(`<polygon points="${poly.map(pt).join(' ')}" fill="${PREVIEW.hit}" fill-opacity="0.12" stroke="${PREVIEW.hit}" stroke-width="5"/>`);
    const c = poly.reduce((a, p) => ({ x: a.x + p.x / poly.length, y: a.y + p.y / poly.length }), { x: 0, y: 0 });
    parts.push(`<text x="${(c.x * s).toFixed(1)}" y="${(c.y * s).toFixed(1)}" font-size="34" font-family="sans-serif" fill="#fff" stroke="${PREVIEW.ink}" stroke-width="2" text-anchor="middle">${id}</text>`);
  }
  for (const [id, a] of Object.entries(layout.anchors)) {
    const colour = id.endsWith('-stop') || id === 'kart-start' ? PREVIEW.stop : PREVIEW.anchor;
    parts.push(`<circle cx="${(a.x * s).toFixed(1)}" cy="${(a.y * s).toFixed(1)}" r="10" fill="${colour}" stroke="${PREVIEW.ink}" stroke-width="3"/>`);
  }
  for (const p of Object.values(layout.slots)) {
    parts.push(`<rect x="${(p.x * s - 12).toFixed(1)}" y="${(p.y * s - 12).toFixed(1)}" width="24" height="24" fill="${PREVIEW.slot}" stroke="${PREVIEW.ink}" stroke-width="3"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join('')}</svg>`;
}

/**
 * Moves `src` to `dest`, replacing it. Windows may refuse a directory rename while a scanner holds
 * a fresh file (EPERM/EBUSY); then the files are copied instead.
 */
export function replaceDir(src: string, dest: string): void {
  // The current dir moves to a backup first and comes back if the move-in fails.
  const backup = `${dest}.old`;
  rmSync(backup, { recursive: true, force: true });
  const hadDest = existsSync(dest);
  if (hadDest) {
    try {
      renameSync(dest, backup);
    } catch (e) {
      // Story 1.8: Windows also refuses to rename the *current* render dir while a scanner holds
      // one of its files; copying it aside and deleting it works.
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw e;
      cpSync(dest, backup, { recursive: true });
      rmSync(dest, { recursive: true, force: true, maxRetries: 5 });
    }
  }
  try {
    try {
      renameSync(src, dest);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw e;
      cpSync(src, dest, { recursive: true });
    }
  } catch (e) {
    rmSync(dest, { recursive: true, force: true });
    if (hadDest) renameSync(backup, dest);
    throw e;
  }
  rmSync(backup, { recursive: true, force: true });
}

export interface RenderDeps {
  env: Env;
  run: Runner;
  resolve: (env: Env) => string;
  log: (msg: string) => void;
}

/** Renders a screen and publishes its outputs; throws on any failure (nothing replaced). */
export async function render(screenArg: string | undefined, deps: RenderDeps): Promise<ScreenLayout> {
  const bin = deps.resolve(deps.env);
  const screen = screenSpec(screenArg).id;
  const blend = blendPath(screen);
  if (!existsSync(blend)) throw new Error(`art/${screen}.blend is missing: run npm run art:build -- ${screen}`);
  mkdirSync(RENDER_DIR, { recursive: true });
  const tmp = mkdtempSync(join(RENDER_DIR, `.tmp-${screen}-`));
  const jsonTmp = `${layoutPath(screen)}.tmp`;
  try {
    deps.log(`render: rendering art/${screen}.blend with Blender (${bin})…`);
    const plates = SCREEN_PLATES[screen as ScreenId];
    let raw: RawProjection;
    let objectsOf: Map<string, Set<string>> | undefined;
    if (plates) {
      for (const plate of plates) {
        const sub = join(tmp, `plate-${plate}`);
        mkdirSync(sub, { recursive: true });
        deps.log(`render: plate "${plate}"…`);
        runBlender(deps.run, bin, blenderArgs(blend, join(BLENDER_SCRIPTS, 'render_screen.py'), ['--out', sub, '--screen', screen, '--scene', plate], plate));
      }
      ({ raw, objectsOf } = mergePlates(tmp, screen, plates));
      await addSceneThumbs(tmp, raw, plates, raw.render.width / Tokens.design.width);
      for (const plate of plates) rmSync(join(tmp, `plate-${plate}`), { recursive: true, force: true });
      writeFileSync(join(tmp, 'raw.json'), `${JSON.stringify(raw, null, 1)}\n`);
    } else {
      runBlender(deps.run, bin, blenderArgs(blend, join(BLENDER_SCRIPTS, 'render_screen.py'), ['--out', tmp, '--screen', screen]));
      raw = JSON.parse(readFileSync(join(tmp, 'raw.json'), 'utf8')) as RawProjection;
    }
    await addGhostFrames(tmp, raw, raw.render.width / Tokens.design.width);
    await addSilhouetteFrames(tmp, raw);
    const frames = FRAME_RULE_SCREENS.has(screen) ? await renderedTrims(tmp, raw.frames) : undefined;
    let layout: ScreenLayout;
    try {
      layout = layoutFromRaw(screen, raw, frames);
    } catch (e) {
      // Kept for diagnosis (gitignored); the published outputs stay untouched.
      copyFileSync(join(tmp, 'raw.json'), join(RENDER_DIR, `${screen}.failed-raw.json`));
      throw e;
    }
    for (const f of raw.frames) if (!existsSync(join(tmp, 'frames', `${f}.png`))) throw new Error(`frame ${f} was not rendered`);
    if (plates && objectsOf) {
      for (const plate of plates) {
        await sharp(join(tmp, `bg-${plate}.png`))
          .composite([{ input: Buffer.from(previewSvg(plateLayout(layout, objectsOf.get(plate) ?? new Set()))) }])
          .png()
          .toFile(join(tmp, `preview-${plate}.png`));
      }
    } else {
      await sharp(join(tmp, 'bg.png'))
        .composite([{ input: Buffer.from(previewSvg(layout)) }])
        .png()
        .toFile(join(tmp, 'preview.png'));
    }

    // Publish only now that every check passed: the render dir, then the layout JSON (temp + rename).
    mkdirSync(LAYOUT_DIR, { recursive: true });
    writeFileSync(jsonTmp, formatLayout(layout));
    replaceDir(tmp, join(RENDER_DIR, screen));
    renameSync(jsonTmp, layoutPath(screen));
    return layout;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(jsonTmp, { force: true });
  }
}

async function main(): Promise<void> {
  try {
    const layout = await render(process.argv[2], {
      env: process.env,
      run: runProcess,
      resolve: (env) => resolveBlender(env),
      log: (m) => console.log(m),
    });
    console.log(
      `render: OK ${layout.screenId}: ${Object.keys(layout.hits).length} hits, ${Object.keys(layout.anchors).length} anchors, ${Object.keys(layout.slots).length} slots, ${Object.keys(layout.paths).length} paths`,
    );
  } catch (e) {
    const err = e as Error;
    if (err instanceof LayoutError) for (const p of err.problems) console.error(`render: ${p}`);
    else console.error(`render: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
