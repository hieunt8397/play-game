// `npm run validate:content` — runs the content validators (AD-12): GameIds, the audio catalog
// (id grammar, path convention, the file existing under public/) and the voice lines (rules of
// content/validate.ts with the real filesystem and `lineHash`, including stray files), the screen
// layouts (src/content/generated/<screen>.layout.json against stations and touch rules) and the image
// assets (atlases, backgrounds, 8 MiB cap on every file under public/assets) — Story 1.4 — and the
// station rules (label, name line, invite line of awake stations) — Story 1.5 — and the game content
// (awake ⇔ GAME_CONTENT, game audio ids exist) — Story 1.7 — and the hint ring contrast on the real
// plates (tools/lint/hint-contrast.ts) — Story 1.9 — and the decorations (catalogue shape, slot ids,
// `decoration/<id>/00` frames, footprint size, tap rects, station clearance) — Story 2.2 — and the
// game icon frames (`icon/<id>/00` ≥ ui.playAgainIconPx; Story 2.4 art, its play-again lines removed 2026-10-21) — and the dino
// puzzle rules, every page of a multi-page atlas and the no-meat-eater source scan — Story 3.3 — and the
// shadow-match rules and its catalogue (no balloon, ball or flower: FORBIDDEN_ITEM) — Story 3.5 — and the
// shadow-match outline features (featureProblems) and measured same-group silhouettes (shadow-distinct.ts) — Story 3.6 — and
// the parent invitation lines (validateParentInvite) — Story 5.7.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATLASES, MAP_AMBIENT_ANCHORS, MAP_AMBIENT_FRAMES, MAP_GUIDE, SCREEN_IDS, screenBackgrounds } from '../../src/content/assets.ts';
import { AUDIO_CATALOG } from '../../src/content/audio-catalog.ts';
import { DECORATIONS } from '../../src/content/decorations.ts';
import { GAME_ICONS } from '../../src/content/game-icons.ts';
import { PARENT_INVITE_LINES } from '../../src/content/parent-invite.ts';
import { GAME_CONTENT } from '../../src/content/games/index.ts';
import type { ScreenLayout } from '../../src/content/layout-types.ts';
import { GAME_STATIONS, HOME_STATION, KART_FRAME, STATIONS, stationFrame } from '../../src/content/stations.ts';
import { CORNER_IDS, HOME_SCREEN_REQUIREMENTS } from '../../src/content/home.ts';
import { Tokens } from '../../src/core/tokens.ts';
import { m4aDurationMs } from '../audio/m4a-duration.ts';
import {
  RENDER_SCALE,
  decorationLimits,
  iceCreamLimits,
  layoutLimits,
  pngSizeOf,
  validateAssets,
  validateDecorations,
  validateIceCream,
  pizzaLimits,
  validatePizza,
  validateLayout,
  validatePlayAgainIcons,
  atlasFrames,
  dinoPuzzleLimits,
  validateDinoPuzzle,
  shadowMatchLimits,
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
  validateShadowMatch,
  type AtlasJsonLike,
} from '../layout/rules.ts';
import { FORBIDDEN_ITEM, ITEM_IDS, SHADOW_COUNTS, SHAPE_ITEMS, screen as shadowScreen } from '../../src/content/games/shadow-match.ts';
import { screen as iceCreamScreen } from '../../src/content/games/ice-cream.ts';
import { screen as pizzaScreen } from '../../src/content/games/pizza.ts';
import { BAY_ANCHORS, DROP_ORDER, PIECES, SPECIES, screen as dinoScreen } from '../../src/content/games/dino-puzzle.ts';
import { GAME_IDS, ISLAND_GAME_IDS } from '../../src/content/types.ts';
import { reviewLines, validateContent } from '../../src/content/validate.ts';
import { VOICE_LINES } from '../../src/content/voice-lines.ts';
import { lineHash } from '../tts/line-hash.ts';
import { hintContrastProblems } from './hint-contrast.ts';
import { shadowDistinct } from './shadow-distinct.ts';
import { fishLuma } from './fish-luma.ts';
import { TOUCH_TALK_SCENES, TOUCH_TALK_SCREEN } from '../../src/content/games/touch-talk.ts';
import { ANIMAL_IDS, ANIMAL_PENS_SCREEN, DOOR_FRAMES, DOOR_IDS, peekFrame } from '../../src/content/games/animal-pens.ts';
import { BAND_SCREEN, INSTRUMENT_IDS } from '../../src/content/games/band.ts';
import { BEDTIME_SCREEN, TARGET_IDS as BEDTIME_TARGETS } from '../../src/content/games/bedtime.ts';
import { PET_CLINIC_SCREEN } from '../../src/content/games/pet-clinic.ts';
import { DRESS_UP_SCREEN } from '../../src/content/games/dress-up.ts';
import { GARDEN_SCREEN } from '../../src/content/games/garden.ts';
import { sceneBubbleKeepOutRect } from '../layout/hud-keep-out.ts';
import { ALL_FISH, FISHING_SCREEN, POND_HIT } from '../../src/content/games/fishing.ts';
import { CONE_ANCHORS, FLAG_ANCHORS, RACE_SCREEN, ladder as raceLadder } from '../../src/content/games/race.ts';

const VOICE_DIR = 'assets/audio/vo';

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Where `npm run render` writes `<screen>.layout.json`. */
export const LAYOUT_DIR = join(APP_DIR, 'src', 'content', 'generated');

/** Frames each screen's atlas must hold. */
export const REQUIRED_FRAMES: Readonly<Record<string, readonly string[]>> = {
  // Decoration frames are checked by validateDecorations (layoutProblems), naming the decoration id.
  // Story 5.2: the guide Shiba's idle and wave frames (MAP_GUIDE); Story 5.6: the whale, fountain, cloud and wave (MAP_AMBIENT).
  map: [...STATIONS.map((s) => stationFrame(s.id)), KART_FRAME, MAP_GUIDE.idle, ...MAP_GUIDE.wave, ...MAP_AMBIENT_FRAMES],
  'ice-cream': iceCreamScreen.frames,
  pizza: pizzaScreen.frames,
  'dino-puzzle': dinoScreen.frames,
  'shadow-match': shadowScreen.frames,
  race: RACE_SCREEN.frames,
  fishing: FISHING_SCREEN.frames,
  'touch-talk': TOUCH_TALK_SCREEN.frames,
  // Story 7.1: the yard's corners.
  home: HOME_SCREEN_REQUIREMENTS.frames,
  // Story 7.2: the pen doors and the animals.
  'animal-pens': ANIMAL_PENS_SCREEN.frames,
  // Story 7.3: the band's instruments.
  band: BAND_SCREEN.frames,
  // Story 7.4: the bedroom (Shiba's poses, the blanket, the lamp, the brush, the particles).
  bedtime: BEDTIME_SCREEN.frames,
  // Story 8.1: the clinic (patients, overlays, tools, particles).
  'pet-clinic': PET_CLINIC_SCREEN.frames,
  // Story 8.2: the wardrobe (Shiba's states, every outfit overlay, the icons).
  'dress-up': DRESS_UP_SCREEN.frames,
  // Trồng cây (2026-10-30): the plants, fruits, packets, the can, Shiba and its outfit overlays, the particles.
  garden: GARDEN_SCREEN.frames,
};

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]));
}

/** The id → geometry records of a layout. */
const LAYOUT_RECORDS = ['anchors', 'hits', 'slots', 'paths'] as const;

function readAtlas(publicDir: string | undefined, screen: (typeof SCREEN_IDS)[number]): AtlasJsonLike | undefined {
  if (!publicDir) return undefined;
  try {
    // Story 3.3: a multiatlas reads like a JSON hash (every page's frames by name).
    return atlasFrames(JSON.parse(readFileSync(resolve(publicDir, ATLASES[screen].json), 'utf8')));
  } catch {
    return undefined; // assetProblems reports a missing atlas
  }
}

/** Layout problems of every screen (missing or invalid JSON included); `publicDir` adds the atlas-based rules. */
export function layoutProblems(layoutDir: string, publicDir?: string): string[] {
  const problems: string[] = [];
  for (const screen of SCREEN_IDS) {
    const file = join(layoutDir, `${screen}.layout.json`);
    let layout: ScreenLayout;
    try {
      layout = JSON.parse(readFileSync(file, 'utf8')) as ScreenLayout;
    } catch {
      problems.push(`layout "${screen}": ${screen}.layout.json is missing or invalid (run npm run render -- ${screen})`);
      continue;
    }
    if (layout === null || typeof layout !== 'object') {
      problems.push(`layout "${screen}": not a JSON object`);
      continue;
    }
    if (layout.v !== 1 || layout.screenId !== screen) problems.push(`layout "${screen}": not a v1 layout of screen "${screen}"`);
    const missing = LAYOUT_RECORDS.filter((k) => layout[k] === null || typeof layout[k] !== 'object' || Array.isArray(layout[k]));
    for (const k of missing) problems.push(`layout "${screen}": missing "${k}"`);
    if (missing.length > 0) continue;
    if (screen === 'map') {
      for (const p of validateLayout(layout, { stations: STATIONS, gameIds: ISLAND_GAME_IDS, shellStations: [HOME_STATION], limits: layoutLimits(), guide: MAP_GUIDE.id })) problems.push(`layout "${screen}": ${p}`);
      // Story 5.6: the ambient dressing's anchors (whale, fountain, cloud-1..3, wave-1..5), like its frames.
      for (const id of MAP_AMBIENT_ANCHORS) if (!layout.anchors[id]) problems.push(`layout "${screen}": anchor "${id}": missing (the ambient dressing)`);
      const decorations = validateDecorations(layout, decorationLimits(GAME_STATIONS, ISLAND_GAME_IDS, DECORATIONS, [HOME_STATION]), readAtlas(publicDir, screen));
      for (const p of decorations) problems.push(`layout "${screen}": ${p}`);
      const atlas = readAtlas(publicDir, screen);
      // Story 2.4: the play-again icon frames (icon/<id>/00, ≥ ui.playAgainIconPx).
      if (atlas) for (const p of validatePlayAgainIcons(Object.keys(GAME_ICONS), atlas, layout.renderScale, Tokens.ui.playAgainIconPx)) problems.push(`layout "${screen}": ${p}`);
      // Story 8.2: the guide wears any outfit in every frame.
      if (atlas) for (const p of validateOutfitFrames(screen, atlas)) problems.push(`layout "${screen}": ${p}`);
    } else if (screen === 'ice-cream') {
      for (const p of validateIceCream(layout, iceCreamLimits(iceCreamScreen), readAtlas(publicDir, screen))) problems.push(`layout "${screen}": ${p}`);
      // Story 8.2: the ice-cream Shiba wears any outfit in every reaction frame.
      const atlas = readAtlas(publicDir, screen);
      if (atlas) for (const p of validateOutfitFrames(screen, atlas)) problems.push(`layout "${screen}": ${p}`);
    } else if (screen === 'pizza') {
      for (const p of validatePizza(layout, pizzaLimits(pizzaScreen), readAtlas(publicDir, screen))) problems.push(`layout "${screen}": ${p}`);
    } else if (screen === 'dino-puzzle') {
      for (const p of validateDinoPuzzle(layout, dinoPuzzleLimits(dinoScreen, SPECIES, PIECES, BAY_ANCHORS, DROP_ORDER), readAtlas(publicDir, screen))) problems.push(`layout "${screen}": ${p}`);
    } else if (screen === 'shadow-match') {
      for (const p of validateShadowMatch(layout, shadowMatchLimits(shadowScreen, ITEM_IDS, SHADOW_COUNTS), readAtlas(publicDir, screen))) problems.push(`layout "${screen}": ${p}`);
    } else if (screen === 'touch-talk') {
      for (const p of validateTouchTalk(layout, touchTalkLimits(TOUCH_TALK_SCREEN, TOUCH_TALK_SCENES.map((s) => ({ id: s.id, props: s.props.map((p) => p.id) })), sceneBubbleKeepOutRect()), readAtlas(publicDir, screen))) problems.push(`layout "${screen}": ${p}`);
    } else if (screen === 'fishing') {
      for (const p of validateFishing(layout, fishingLimits(FISHING_SCREEN, POND_HIT, ALL_FISH), readAtlas(publicDir, screen))) problems.push(`layout "${screen}": ${p}`);
    } else if (screen === 'animal-pens') {
      for (const p of validateAnimalPens(layout, animalPensLimits(ANIMAL_PENS_SCREEN, DOOR_IDS, [DOOR_FRAMES.closed, DOOR_FRAMES.open], ANIMAL_IDS.map(peekFrame)), readAtlas(publicDir, screen))) problems.push(`layout "${screen}": ${p}`);
    } else if (screen === 'band') {
      for (const p of validateBand(layout, bandLimits(BAND_SCREEN, INSTRUMENT_IDS), readAtlas(publicDir, screen))) problems.push(`layout "${screen}": ${p}`);
    } else if (screen === 'bedtime') {
      for (const p of validateBedtime(layout, bedtimeLimits(BEDTIME_SCREEN, BEDTIME_TARGETS), readAtlas(publicDir, screen))) problems.push(`layout "${screen}": ${p}`);
    } else if (screen === 'dress-up') {
      for (const p of validateDressUp(layout, dressUpLimits(), readAtlas(publicDir, screen))) problems.push(`layout "${screen}": ${p}`);
    } else if (screen === 'garden') {
      for (const p of validateGarden(layout, gardenLimits(), readAtlas(publicDir, screen))) problems.push(`layout "${screen}": ${p}`);
    } else if (screen === 'pet-clinic') {
      for (const p of validatePetClinic(layout, petClinicLimits(), readAtlas(publicDir, screen))) problems.push(`layout "${screen}": ${p}`);
    } else if (screen === 'home') {
      for (const p of validateHome(layout, homeLimits(HOME_SCREEN_REQUIREMENTS, CORNER_IDS), readAtlas(publicDir, screen))) problems.push(`layout "${screen}": ${p}`);
    } else if (screen === 'race') {
      for (const p of validateRace(layout, raceLimits(RACE_SCREEN, racePaths(raceLadder), CONE_ANCHORS, FLAG_ANCHORS), readAtlas(publicDir, screen))) problems.push(`layout "${screen}": ${p}`);
    }
  }
  return problems;
}

/**
 * Story 3.4: information lines about the dino layout (not failures): its slot and bay counts and the
 * `info` lines of validateDinoPuzzle (every slot pair closer than the snap radius, allowed while
 * DROP_ORDER resolves the own slot first). Its problems are reported by `run` (layoutProblems); a
 * layout that cannot be read or lacks its records yields one line saying so.
 */
export function dinoLayoutInfo(layoutDir: string = LAYOUT_DIR, publicDir: string = join(APP_DIR, 'public')): string[] {
  const file = join(layoutDir, 'dino-puzzle.layout.json');
  let layout: ScreenLayout;
  try {
    layout = JSON.parse(readFileSync(file, 'utf8')) as ScreenLayout;
  } catch (e) {
    return [`dino-puzzle layout: cannot be read (${(e as Error).message})`];
  }
  if (layout === null || typeof layout !== 'object' || LAYOUT_RECORDS.some((k) => layout[k] === null || typeof layout[k] !== 'object')) {
    return ['dino-puzzle layout: not a v1 layout with anchors, hits, slots and paths'];
  }
  const lines = [`dino-puzzle layout: ${Object.keys(layout.slots).length} slots, ${BAY_ANCHORS.filter((b) => layout.anchors[b]).length} bays`];
  validateDinoPuzzle(layout, { ...dinoPuzzleLimits(dinoScreen, SPECIES, PIECES, BAY_ANCHORS, DROP_ORDER), info: (l) => lines.push(l) }, readAtlas(publicDir, 'dino-puzzle'));
  return lines;
}

/** Asset problems under `publicDir` (atlases, backgrounds, size caps). */
export function assetProblems(publicDir: string): string[] {
  const scale = RENDER_SCALE;
  return validateAssets({
    atlases: SCREEN_IDS.map((id) => ({ ...ATLASES[id], frames: REQUIRED_FRAMES[id] ?? [] })),
    backgrounds: SCREEN_IDS.flatMap((id) => screenBackgrounds(id).map((b) => ({ ...b.ref, width: Tokens.design.width * scale, height: Tokens.design.height * scale }))),
    files: listFiles(join(publicDir, 'assets')).map((f) => ({ path: relative(publicDir, f).split(sep).join('/'), bytes: statSync(f).size })),
    pngSize: (path) => {
      try {
        return pngSizeOf(readFileSync(resolve(publicDir, path)));
      } catch {
        return undefined;
      }
    },
    readJson: (path) => {
      try {
        return JSON.parse(readFileSync(resolve(publicDir, path), 'utf8')) as unknown;
      } catch {
        return undefined;
      }
    },
  });
}

/**
 * Story 3.3 (UX-DR75): no meat-eating dinosaur anywhere. No file under these app folders may name one
 * (its model file, a decoration id, …); this file holds the pattern itself and is not scanned.
 */
export const SCARY_PATTERN = /t[-_ ]?rex|tyranno|raptor|spinosaur|allosaur/i;
/** Folders (under the app) whose file contents are scanned. */
export const SCARY_SCAN_DIRS = ['src/content', 'src/games', 'tools/render/blender'] as const;
/** Folders whose file names are scanned: the Blender scenes (`../art`, beside the app) and the shipped assets. */
export const SCARY_NAME_DIRS = ['../art', 'public/assets'] as const;

const SCARY_MSG = 'names a meat-eating dinosaur (UX-DR75: only gentle dinosaurs)';

/**
 * One problem per match of SCARY_PATTERN, naming the file or frame: the contents of every file under
 * SCARY_SCAN_DIRS, the names of every file under SCARY_NAME_DIRS, and every frame name of the atlas
 * JSONs under `public/assets/atlases` (JSON hash or multiatlas).
 */
export function scaryAssetProblems(appDir: string = APP_DIR, dirs: readonly string[] = SCARY_SCAN_DIRS, nameDirs: readonly string[] = SCARY_NAME_DIRS): string[] {
  const problems: string[] = [];
  const rel = (f: string): string => relative(appDir, f).split(sep).join('/');
  for (const d of dirs) {
    for (const f of listFiles(join(appDir, d)).sort()) {
      if (SCARY_PATTERN.test(readFileSync(f, 'utf8'))) problems.push(`file ${rel(f)}: ${SCARY_MSG}`);
    }
  }
  for (const d of nameDirs) {
    for (const f of listFiles(join(appDir, d)).sort()) {
      if (SCARY_PATTERN.test(rel(f))) problems.push(`file name ${rel(f)}: ${SCARY_MSG}`);
    }
  }
  for (const f of listFiles(join(appDir, 'public', 'assets', 'atlases')).filter((p) => p.endsWith('.json')).sort()) {
    let frames: Record<string, unknown>;
    try {
      frames = atlasFrames(JSON.parse(readFileSync(f, 'utf8'))).frames ?? {};
    } catch {
      continue; // assetProblems reports an unreadable atlas
    }
    for (const name of Object.keys(frames)) if (SCARY_PATTERN.test(name)) problems.push(`atlas ${rel(f)}: frame "${name}" ${SCARY_MSG}`);
  }
  return problems;
}

/** One shadow-match catalogue item as the rule reads it. */
export interface CatalogueItem {
  readonly id: string;
  readonly askName: string;
  readonly name: string;
}

/**
 * Story 3.5: the shadow-match catalogue. An item whose id, ask name or name matches `forbidden`
 * (balloons, balls and flowers would clash with "bóng" = shadow) or names a meat-eating dinosaur fails,
 * naming the item; so does an id that is not kebab-case or appears twice.
 */
export function shadowCatalogueProblems(items: readonly CatalogueItem[] = SHAPE_ITEMS, forbidden: RegExp = FORBIDDEN_ITEM): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(it.id)) problems.push(`shadow-match item "${it.id}": the id is not kebab-case`);
    if (seen.has(it.id)) problems.push(`shadow-match item "${it.id}": listed twice`);
    seen.add(it.id);
    for (const [field, text] of [['id', it.id], ['askName', it.askName], ['name', it.name]] as const) {
      if (forbidden.test(text)) problems.push(`shadow-match item "${it.id}": ${field} "${text}" is a balloon, ball or flower (it would clash with "bóng")`);
      if (SCARY_PATTERN.test(text)) problems.push(`shadow-match item "${it.id}": ${field} "${text}" ${SCARY_MSG}`);
    }
  }
  return problems;
}

/** One shadow-match catalogue item as the feature rule reads it. */
export interface FeatureItem {
  readonly id: string;
  readonly shapeGroup: string;
  readonly features: readonly string[];
}

/**
 * Story 3.6: every item has at least one outline feature that no other item of its shape group has, so
 * a same-group level never shows two shadows the child could only tell apart by colour.
 */
export function featureProblems(items: readonly FeatureItem[] = SHAPE_ITEMS): string[] {
  const problems: string[] = [];
  for (const it of items) {
    const mates = items.filter((o) => o !== it && o.shapeGroup === it.shapeGroup);
    const own = it.features.filter((f) => !mates.some((o) => o.features.includes(f)));
    if (own.length === 0) problems.push(`shadow-match item "${it.id}": no outline feature of its own in group "${it.shapeGroup}" (features: ${it.features.join(', ') || 'none'})`);
  }
  return problems;
}

/** Validates the real content against the files under `publicDir` and the layouts in `layoutDir`; returns the problems. */
export function run(publicDir: string, layoutDir: string = LAYOUT_DIR): string[] {
  const fileExists = (path: string): boolean => existsSync(resolve(publicDir, path));
  const content = validateContent({
    gameIds: GAME_IDS,
    audio: AUDIO_CATALOG,
    fileExists,
    stations: { stations: STATIONS, voiceIds: VOICE_LINES.map((l) => l.id), playable: Object.keys(GAME_CONTENT) },
    games: {
      games: Object.entries(GAME_CONTENT).map(([id, c]) => ({ id, audio: c?.assets.audio ?? [] })),
      voiceIds: VOICE_LINES.map((l) => l.id),
      audioIds: Object.keys(AUDIO_CATALOG),
    },
    decorations: { gameIds: ISLAND_GAME_IDS, catalogue: DECORATIONS, stations: GAME_STATIONS },
    // Story 5.7: 1–2 parent invitation lines per game, all listed (their ≤ 4 s check is in voice).
    parentInvite: { gameIds: GAME_IDS, voiceIds: VOICE_LINES.map((l) => l.id), lines: PARENT_INVITE_LINES },
    voice: {
      lines: VOICE_LINES,
      hashLine: lineHash,
      fileExists,
      listVoiceFiles: () => {
        const dir = resolve(publicDir, VOICE_DIR);
        return existsSync(dir) ? readdirSync(dir) : [];
      },
      readHash: (path) => {
        try {
          return readFileSync(resolve(publicDir, path), 'utf8');
        } catch {
          return undefined;
        }
      },
      // Story 5.3 (NFR15): prompt lengths from the files' mvhd box (offline, no ffprobe).
      durationMs: (path) => {
        try {
          return m4aDurationMs(readFileSync(resolve(publicDir, path)));
        } catch {
          return undefined;
        }
      },
      promptMaxMs: Tokens.Timing.promptMaxMs,
    },
  });
  return [...content, ...layoutProblems(layoutDir, publicDir), ...assetProblems(publicDir), ...scaryAssetProblems(), ...shadowCatalogueProblems(), ...featureProblems()];
}

async function main(): Promise<void> {
  const publicDir = join(APP_DIR, 'public');
  const contrast = await hintContrastProblems(publicDir, LAYOUT_DIR);
  // Story 3.6: same-group silhouettes measured on the committed atlas (every pair's IoU is an info line).
  const distinct = await shadowDistinct(publicDir);
  // Story 4.3: the fish colours' rendered brightness gaps (every pair's mean is an info line).
  const luma = await fishLuma(publicDir);
  const problems = [...run(publicDir), ...contrast.problems, ...distinct.problems, ...luma.problems];
  // Story 3.1: unapproved lines a parent should listen to (information, not a failure).
  const review = reviewLines(VOICE_LINES);
  if (review.length > 0) {
    console.log(`content: ${review.length} voice line(s) to review by ear before approval:`);
    for (const l of review) console.log(`content:   ${l.id} "${l.text}" — ${l.review}`);
  }
  // Story 3.4: the dino layout's counts and close slot pairs (information, not a failure).
  for (const line of dinoLayoutInfo()) console.log(`content: info ${line}`);
  for (const line of distinct.info) console.log(`content: info ${line}`);
  for (const line of luma.info) console.log(`content: info ${line}`);
  if (problems.length > 0) {
    for (const p of problems) console.error(`content: ${p}`);
    process.exit(1);
  }
  console.log(
    `content: OK (${GAME_IDS.length} game ids, ${Object.keys(AUDIO_CATALOG).length} audio ids, ${VOICE_LINES.length} voice lines, ${SCREEN_IDS.length} layout(s) with ${STATIONS.length} stations, ${STATIONS.reduce((n, s) => n + s.slots.length, 0)} slots, ${Object.values(DECORATIONS).flat().length} decorations, play-again icon frames ${Object.keys(GAME_ICONS).map((id) => `icon/${id}/00`).join(", ")}, ${SCREEN_IDS.length} atlas(es), ${listFiles(join(publicDir, 'assets')).length} asset files; hint contrast ${Object.entries(contrast.rings)
      .map(([s, n]) => `${s} ${n} rings`)
      .join(', ')})`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
