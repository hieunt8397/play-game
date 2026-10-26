// `npm run art:build -- <screen>` (Story 1.4): builds art/<screen>.blend from its vendored source
// scene with tools/render/blender/<builder>.py in Blender 5.2 (background mode).
// Blender is resolved and its version checked before any work (BLENDER_BIN, then `blender` on PATH).
// The builder writes into a temp dir; art/<screen>.blend is replaced only after Blender exits 0.
// Story 2.2: the map builder also gets the decoration catalogue (content/decorations.ts) as JSON,
// `[{id, stationId, model}]` with absolute model paths (`--decorations <file>`); a missing model file
// fails the build before Blender runs, naming it.
// Story 2.4: it also gets the play-again icon list (content/game-icons.ts › GAME_ICONS) as
// `[{id, model, creature}]` (`--icons <file>`), checked the same way.
// Story 3.4: the dino-puzzle builder also gets the content cuts (`--cuts 3:head-neck,body-legs,tail;4:…;6:…`).
// Story 3.5: the shadow-match builder gets the content catalogue ids (`--items dog,cow,…`).
import { existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECORATIONS } from '../../src/content/decorations.ts';
import { PIECES, SPECIES } from '../../src/content/games/dino-puzzle.ts';
import { ITEM_IDS, SHADOW_COUNTS } from '../../src/content/games/shadow-match.ts';
import { GAME_ICONS } from '../../src/content/game-icons.ts';
import { OUTFIT_ITEMS } from '../../src/content/games/dress-up.ts';
import { GAME_IDS, ISLAND_GAME_IDS } from '../../src/content/types.ts';
import { Tokens } from '../../src/core/tokens.ts';
import { RENDER_SCALE, layoutLimits } from '../layout/rules.ts';
import { resolveBlender, type Env } from '../shared/binaries.ts';
import { ART_DIR, BLENDER_SCRIPTS, PROJECT_DIR, blendPath, blenderArgs, runBlender, runProcess, screenSpec, type Runner } from './blender.ts';

/** Values the builder needs from Tokens (it never hard-codes design values). */
export interface BuildParams {
  colours: Record<string, string>;
  /** Story 1.8: Tokens.art as hex (scoop flavours, flavour details, creature light). */
  art: {
    flavour: Record<string, string>;
    /** 2026-10-21: Tokens.art.flavourDetail (chips, strawberry, mint leaves, the cone and its waffle lines). */
    flavourDetail: Record<string, string>;
    creatureLight: string;
    pizza: Record<string, string>;
    dino: Record<string, string>;
    /** Story 3.5: art.shadowMatch (the cave's inner wall). */
    shadowMatch: Record<string, string>;
    /** Story 4.3: art.fishing (fish bodies, patterns, line). */
    fishing: Record<string, string>;
    /** Story 4.5: art.touchTalk. */
    touchTalk: Record<string, string>;
    /** Story 7.1: art.home (the yard's props). */
    home: Record<string, string>;
    /** Story 7.2: art.animalPens (the barn, the doors, the straw). */
    animalPens: Record<string, string>;
    /** Story 7.3: art.band (the stage and the instruments). */
    band: Record<string, string>;
    /** Story 7.4: art.bedtime (the bedroom, the quilt, the particles). */
    bedtime: Record<string, string>;
    /** Story 8.1: art.petClinic (the clinic room, the cart, the tools, the overlays, the particles). */
    petClinic: Record<string, string>;
    /** Story 8.2: art.dressUp (the wardrobe room, the mirror, the eleven outfit items; also the map and ice-cream outfit overlays). */
    dressUp: Record<string, string>;
    /** Story 5.6: art.map (the map road, water, foam, cone and chimney). */
    map: Record<string, string>;
  };
  /**
   * Story 3.3: the dino-puzzle builder's content: the species and the piece ids of every cut (an id
   * the builder has no bone group for fails the build), the whole-dino size (design px) and the walk cap.
   */
  dino: { species: string[]; pieces: Record<string, string[]>; sizePx: number; sizeTolerance: number; walkMaxPx: number };
  /**
   * Story 3.5: the shadow-match builder's sizes: each item's longest side (design px), and the slot rows
   * to emit (content SHADOW_COUNTS). 2026-10-22: no triceratops any more.
   */
  shadowMatch: { itemPx: number; counts: number[] };
  /** Story 4.3: the small fish's target size (fish.minSize + slack) and the big/small ratio. */
  fishing: { minSize: number; slackPx: number; sizeRatio: number };
  /** Story 3.1: components.counterTray.top (the pizza counter top). */
  counterTrayTop: string;
  /** Story 3.1: components.oven.size (the oven's projected width, design px). */
  ovenSize: number;
  /** Story 1.8: draggableItem.minSize (scoop width) and ui.iceCreamRowGap (design px). */
  draggableMinSize: number;
  rowGap: number;
  hitPad: number;
  /** Story 2.2: decorationItem.minSize (the builder's footprint report). */
  decorationMin: number;
  /** Story 2.4: ui.playAgainIconPx (the icon's trimmed longest side, design px; the builder's report). */
  iconMin: number;
  /** Story 5.6: ui.mapLandmarkMinPx (a new station landmark's projected height, design px; the builder fails under it). */
  landmarkMin: number;
  /** Story 8.2: the outfit items (content/games/dress-up.ts › OUTFIT_ITEMS) every Shiba screen dresses (map, ice-cream, dress-up); an id the builder has no mesh for fails the build. */
  outfit: { id: string; slot: string }[];
  /** Story 8.2: the wardrobe's sizes (design px): an icon's longest side, an item's tap circle, the gap between tap targets, the reflection's scale. */
  dressUp: { iconPx: number; itemHitPx: number; gapPx: number; mirrorScale: number };
  renderScale: number;
  design: { width: number; height: number };
  rect: { x0: number; y0: number; x1: number; y1: number };
}

export function buildParams(): BuildParams {
  const colours: Record<string, string> = {};
  for (const [name, c] of Object.entries(Tokens.colors)) colours[name] = c.css;
  const art = Tokens.art;
  return {
    colours,
    art: {
      flavour: Object.fromEntries(Object.entries(art.flavour).map(([id, c]) => [id, c.css])),
      flavourDetail: Object.fromEntries(Object.entries(art.flavourDetail).map(([id, c]) => [id, c.css])),
      creatureLight: art.creatureLight.css,
      pizza: Object.fromEntries(Object.entries(art.pizza).map(([id, c]) => [id, c.css])),
      dino: Object.fromEntries(Object.entries(art.dino).map(([id, c]) => [id, c.css])),
      shadowMatch: Object.fromEntries(Object.entries(art.shadowMatch).map(([id, c]) => [id, c.css])),
      fishing: Object.fromEntries(Object.entries(art.fishing).map(([id, c]) => [id, c.css])),
      touchTalk: Object.fromEntries(Object.entries(art.touchTalk).map(([id, c]) => [id, c.css])),
      home: Object.fromEntries(Object.entries(art.home).map(([id, c]) => [id, c.css])),
      animalPens: Object.fromEntries(Object.entries(art.animalPens).map(([id, c]) => [id, c.css])),
      band: Object.fromEntries(Object.entries(art.band).map(([id, c]) => [id, c.css])),
      bedtime: Object.fromEntries(Object.entries(art.bedtime).map(([id, c]) => [id, c.css])),
      petClinic: Object.fromEntries(Object.entries(art.petClinic).map(([id, c]) => [id, c.css])),
      dressUp: Object.fromEntries(Object.entries(art.dressUp).map(([id, c]) => [id, c.css])),
      map: Object.fromEntries(Object.entries(art.map).map(([id, c]) => [id, c.css])),
    },
    dino: {
      species: [...SPECIES],
      pieces: Object.fromEntries(Object.entries(PIECES).map(([n, ids]) => [n, [...ids]])),
      sizePx: Tokens.ui.dinoSizePx,
      sizeTolerance: Tokens.ui.dinoSizeTolerance,
      walkMaxPx: Tokens.ui.dinoWalkMaxPx,
    },
    shadowMatch: { itemPx: Tokens.ui.shadowItemPx, counts: [...SHADOW_COUNTS] },
    fishing: { minSize: Tokens.components.fish.minSize, slackPx: Tokens.ui.fishSizeSlackPx, sizeRatio: Tokens.ui.fishSizeRatio },
    counterTrayTop: Tokens.components.counterTray.top.css,
    ovenSize: Tokens.components.oven.size,
    draggableMinSize: Tokens.components.draggableItem.minSize,
    rowGap: Tokens.ui.iceCreamRowGap,
    hitPad: Tokens.spacing.hitPad,
    decorationMin: Tokens.components.decorationItem.minSize,
    iconMin: Tokens.ui.playAgainIconPx,
    landmarkMin: Tokens.ui.mapLandmarkMinPx,
    outfit: OUTFIT_ITEMS.map((i) => ({ id: i.id, slot: i.slot })),
    dressUp: { iconPx: Tokens.ui.dressUpIconPx, itemHitPx: Tokens.ui.dressUpItemHitPx, gapPx: Tokens.spacing.targetGap, mirrorScale: Tokens.ui.dressUpMirrorScale },
    renderScale: RENDER_SCALE,
    design: { width: Tokens.design.width, height: Tokens.design.height },
    rect: layoutLimits().rect,
  };
}

/** The project's `assets/` folder (CC0 model packs; not shipped). */
export const ASSETS_DIR = join(PROJECT_DIR, 'assets');

/** One decoration as build_map.py imports it. */
export interface DecorationModel {
  id: string;
  stationId: string;
  /** Absolute path of the .glb/.fbx. */
  model: string;
}

/** The catalogue in GAME_IDS order, model paths resolved under `assetsDir`. */
export function decorationModels(assetsDir: string = ASSETS_DIR): DecorationModel[] {
  return ISLAND_GAME_IDS.flatMap((stationId) => DECORATIONS[stationId].map((d) => ({ id: d.id, stationId, model: join(assetsDir, ...d.model.split('/')) })));
}

/** One play-again icon (Story 2.4) as build_map.py imports it: `state.<id>` under `sprite.icon`. */
export interface IconModel {
  /** The GameId (frame `icon/<id>/00`). */
  id: string;
  /** Absolute path of the .fbx/.glb. */
  model: string;
  /** Tokens.colors key for recolor_creature; null keeps the source colours (Story 4.1). */
  creature: string | null;
}

/** GAME_ICONS in GAME_IDS order, model paths resolved under `assetsDir`. */
export function iconModels(assetsDir: string = ASSETS_DIR): IconModel[] {
  return GAME_IDS.flatMap((id) => {
    const icon = GAME_ICONS[id];
    return icon ? [{ id, model: join(assetsDir, ...icon.model.split('/')), creature: icon.creature ?? null }] : [];
  });
}

/** Story 3.4: content PIECES as the dino builder's `--cuts` value: `<n>:<id>,<id>…` joined by `;`, in key order. */
export function cutsArg(pieces: Readonly<Record<number, readonly string[]>> = PIECES): string {
  return Object.entries(pieces)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([n, ids]) => `${n}:${ids.join(',')}`)
    .join(';');
}

/** Story 3.5: content ITEM_IDS as the shadow-match builder's `--items` value (an id it has no model for fails the build). */
export function itemsArg(ids: readonly string[] = ITEM_IDS): string {
  return ids.join(',');
}

/** Screens whose builder imports the decoration models. */
const DECORATED_SCREENS = new Set(['map']);

export interface BuildDeps {
  env: Env;
  run: Runner;
  resolve: (env: Env) => string;
  log: (msg: string) => void;
  /** Whether a model file exists (default: fs). */
  exists?: (path: string) => boolean;
  /** Where the model packs live (default: <project>/assets). */
  assetsDir?: string;
}

/** Builds art/<screen>.blend; throws on any failure (nothing replaced). */
export function build(screenArg: string | undefined, deps: BuildDeps): string {
  const bin = deps.resolve(deps.env);
  const screen = screenSpec(screenArg);
  const source = join(PROJECT_DIR, screen.source);
  if (!existsSync(source)) throw new Error(`source scene ${screen.source} is missing`);
  const decorations = DECORATED_SCREENS.has(screen.id) ? decorationModels(deps.assetsDir) : undefined;
  const icons = DECORATED_SCREENS.has(screen.id) ? iconModels(deps.assetsDir) : undefined;
  if (decorations) {
    const exists = deps.exists ?? existsSync;
    const missing = decorations.filter((d) => !exists(d.model));
    if (missing.length > 0) {
      throw new Error(`decoration model(s) missing: ${missing.map((d) => `"${d.id}" → ${d.model}`).join(', ')}`);
    }
  }
  if (icons) {
    const exists = deps.exists ?? existsSync;
    const missing = icons.filter((d) => !exists(d.model));
    if (missing.length > 0) {
      throw new Error(`play-again icon model(s) missing: ${missing.map((d) => `"${d.id}" → ${d.model}`).join(', ')}`);
    }
  }
  const tmp = mkdtempSync(join(ART_DIR, `.tmp-${screen.id}-`));
  try {
    const params = join(tmp, 'params.json');
    writeFileSync(params, `${JSON.stringify(buildParams(), null, 2)}\n`);
    const out = join(tmp, `${screen.id}.blend`);
    const extra: string[] = [];
    if (decorations) {
      const file = join(tmp, 'decorations.json');
      writeFileSync(file, `${JSON.stringify(decorations, null, 2)}\n`);
      extra.push('--decorations', file);
    }
    if (icons) {
      const file = join(tmp, 'icons.json');
      writeFileSync(file, `${JSON.stringify(icons, null, 2)}\n`);
      extra.push('--icons', file);
    }
    if (screen.id === 'dino-puzzle') extra.push('--cuts', cutsArg());
    if (screen.id === 'shadow-match') extra.push('--items', itemsArg());
    deps.log(`art:build: building art/${screen.id}.blend with Blender (${bin})…`);
    const result = runBlender(deps.run, bin, blenderArgs(source, join(BLENDER_SCRIPTS, screen.builder), ['--out', out, '--params', params, ...extra]));
    // The builder's own report (Story 2.2: decoration sizes, slot warnings, estimated rule breaches).
    for (const line of result.stdout.split(/\r?\n/)) if (/^build_[a-z_]+: /.test(line)) deps.log(line);
    if (!existsSync(out)) throw new Error(`the builder did not write ${screen.id}.blend`);
    renameSync(out, blendPath(screen.id));
    return blendPath(screen.id);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function main(): void {
  try {
    const path = build(process.argv[2], {
      env: process.env,
      run: runProcess,
      resolve: (env) => resolveBlender(env),
      log: (m) => console.log(m),
    });
    console.log(`art:build: wrote ${path}`);
  } catch (e) {
    console.error(`art:build: ${(e as Error).message}`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
