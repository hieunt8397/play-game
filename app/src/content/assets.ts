// Image assets per screen (Story 1.4). Paths are relative to the app base (public/). Produced by
// `npm run render -- <screen>` + `npm run atlas -- <screen>`; checked by `npm run check`.

// Story 7.1: 'home' is the yard behind the island's home station (content/home.ts). Story 7.2: 'animal-pens', the yard's pen game. Story 7.3: 'band', the yard's stage game. Story 7.4: 'bedtime', the yard's bed game. Story 8.1: 'pet-clinic', the yard's clinic game. Story 8.2: 'dress-up', the yard's wardrobe game.
export const SCREEN_IDS = ['map', 'ice-cream', 'pizza', 'dino-puzzle', 'shadow-match', 'race', 'fishing', 'touch-talk', 'home', 'animal-pens', 'band', 'bedtime', 'pet-clinic', 'dress-up'] as const;
export type ScreenId = (typeof SCREEN_IDS)[number];

export interface AtlasRef {
  /** Phaser texture key, `atlas.<screen>`. */
  readonly key: string;
  readonly png: string;
  /** JSON hash (free-tex-packer `JsonHash`); for a multi-page atlas, one Phaser multiatlas JSON. */
  readonly json: string;
  /**
   * Story 3.3: the most pages this atlas may use (absent = one page: `png` + a JSON hash). With more,
   * `npm run atlas` writes `<screen>-<n>.png` (n from 0) and one Phaser multiatlas `<screen>.json`
   * listing them; Map loads it with `load.multiatlas`. `png` is then page 0.
   */
  readonly pages?: number;
}

export interface BackgroundRef {
  /** Phaser texture key, `bg.<screen>`. */
  readonly key: string;
  readonly path: string;
}

/**
 * Story 3.3: screens whose atlas may span several pages (the dino frames cannot fit one 2048² page). Story 8.2: the
 * outfit overlays (11 items over every Shiba frame) push ice-cream and dress-up over one page.
 */
export const ATLAS_MAX_PAGES: Readonly<Partial<Record<ScreenId, number>>> = { 'dino-puzzle': 4, 'shadow-match': 3, 'touch-talk': 3, 'pet-clinic': 3, 'ice-cream': 3, 'dress-up': 2 };

/** The folder of every atlas (a multiatlas loads its pages from here). */
export const ATLAS_DIR = 'assets/atlases/';

/** Page `n` (from 0) of a multi-page atlas. */
export const atlasPagePng = (id: string, n: number): string => `${ATLAS_DIR}${id}-${n}.png`;

const atlas = (id: ScreenId): AtlasRef => {
  const pages = ATLAS_MAX_PAGES[id];
  const json = `${ATLAS_DIR}${id}.json`;
  return pages !== undefined && pages > 1
    ? { key: `atlas.${id}`, png: atlasPagePng(id, 0), json, pages }
    : { key: `atlas.${id}`, png: `${ATLAS_DIR}${id}.png`, json };
};

const background = (id: ScreenId): BackgroundRef => ({ key: `bg.${id}`, path: `assets/bg/${id}.png` });

/**
 * Story 4.5: screens made of several plates (one Blender scene each in one .blend, one merged layout and
 * one atlas, one background per plate). Unlisted screens have a single plate. Story 4.6: sea, street,
 * kitchen; 2026-10-21: bathroom, bakery, picnic.
 */
export const TOUCH_TALK_PLATES = ['sea', 'street', 'kitchen', 'bathroom', 'bakery', 'picnic'] as const;
export type TouchTalkPlate = (typeof TOUCH_TALK_PLATES)[number];
export const SCREEN_PLATES: Readonly<Partial<Record<ScreenId, readonly string[]>>> = { 'touch-talk': TOUCH_TALK_PLATES };
type PlatedScreen = 'touch-talk';
/** A background id: a single-plate screen, or `<screen>-<plate>`. */
export type BackgroundId = Exclude<ScreenId, PlatedScreen> | `touch-talk-${TouchTalkPlate}`;
const plateBackground = (id: ScreenId, plate: string): BackgroundRef => ({ key: `bg.${id}.${plate}`, path: `assets/bg/${id}-${plate}.png` });

export const ATLASES: Readonly<Record<ScreenId, AtlasRef>> = {
  map: atlas('map'),
  'ice-cream': atlas('ice-cream'),
  pizza: atlas('pizza'),
  'dino-puzzle': atlas('dino-puzzle'),
  'shadow-match': atlas('shadow-match'),
  race: atlas('race'),
  fishing: atlas('fishing'),
  'touch-talk': atlas('touch-talk'),
  home: atlas('home'),
  'animal-pens': atlas('animal-pens'),
  band: atlas('band'),
  bedtime: atlas('bedtime'),
  'pet-clinic': atlas('pet-clinic'),
  'dress-up': atlas('dress-up'),
};

export const BACKGROUNDS: Readonly<Record<BackgroundId, BackgroundRef>> = {
  map: background('map'),
  'ice-cream': background('ice-cream'),
  pizza: background('pizza'),
  'dino-puzzle': background('dino-puzzle'),
  'shadow-match': background('shadow-match'),
  race: background('race'),
  fishing: background('fishing'),
  'touch-talk-sea': plateBackground('touch-talk', 'sea'),
  'touch-talk-street': plateBackground('touch-talk', 'street'),
  'touch-talk-kitchen': plateBackground('touch-talk', 'kitchen'),
  'touch-talk-bathroom': plateBackground('touch-talk', 'bathroom'),
  'touch-talk-bakery': plateBackground('touch-talk', 'bakery'),
  'touch-talk-picnic': plateBackground('touch-talk', 'picnic'),
  home: background('home'),
  'animal-pens': background('animal-pens'),
  band: background('band'),
  bedtime: background('bedtime'),
  'pet-clinic': background('pet-clinic'),
  'dress-up': background('dress-up'),
};

/** Every background of a screen with its plate (undefined for a single-plate screen). */
export function screenBackgrounds(id: ScreenId): { plate: string | undefined; ref: BackgroundRef }[] {
  const plates = SCREEN_PLATES[id];
  const all = BACKGROUNDS as Readonly<Record<string, BackgroundRef>>;
  return plates ? plates.map((plate) => ({ plate, ref: all[`${id}-${plate}`]! })) : [{ plate: undefined, ref: all[id]! }];
}

/** Frames every atlas must hold: `<object>/<state>/<nn>`. */
export const FRAME_NAME = /^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*\/\d{2}$/;

/**
 * The Map kart (Story 1.7). `artFacing` is the x direction the rendered frame faces: the kart in
 * `kart/idle/00` faces down-left (towards the camera), so −1; travel to the right mirrors it.
 */
export const MAP_KART = { frame: 'kart/idle/00', artFacing: -1 } as const;

/**
 * The island guide Shiba (Story 5.2): its own map sprite (`sprite.shiba` in build_map.py) beside
 * the ice-cream truck, with `anchor.shiba` / `hit.shiba` in the map layout. The one source of its
 * frame names: idle, and the 4 wave frames played in order (core/map-guide › waveFrame).
 */
export const MAP_GUIDE = {
  id: 'shiba',
  idle: 'shiba/idle/00',
  wave: ['shiba/wave/00', 'shiba/wave/01', 'shiba/wave/02', 'shiba/wave/03'],
} as const;

/**
 * Story 5.6: the island's ambient dressing (build_map.py). The whale (`sprite.whale`, `anchor.whale`, its
 * water pivot) and the fountain (`sprite.fountain`, `anchor.fountain`, its ground pivot) are full-frame
 * sprites with frame states and no tap target. The cloud and the foam wave are detached frames rendered at
 * their first anchor (the `-1` pivot) and drawn at every anchor of their list.
 */
export const MAP_AMBIENT = {
  whale: {
    id: 'whale',
    idle: 'whale/idle/00',
    spout: ['whale/spout/00', 'whale/spout/01', 'whale/spout/02', 'whale/spout/03'],
  },
  fountain: {
    id: 'fountain',
    spray: ['fountain/spray/00', 'fountain/spray/01', 'fountain/spray/02'],
  },
  cloud: { frame: 'ambient/cloud/00', anchors: ['cloud-1', 'cloud-2', 'cloud-3'] },
  wave: { frame: 'ambient/wave/00', anchors: ['wave-1', 'wave-2', 'wave-3', 'wave-4', 'wave-5'] },
} as const;

/** Story 5.6: every map atlas frame of MAP_AMBIENT. */
export const MAP_AMBIENT_FRAMES: readonly string[] = [
  MAP_AMBIENT.whale.idle,
  ...MAP_AMBIENT.whale.spout,
  ...MAP_AMBIENT.fountain.spray,
  MAP_AMBIENT.cloud.frame,
  MAP_AMBIENT.wave.frame,
];

/** Story 5.6: every map layout anchor of MAP_AMBIENT (build_map.py writes them; validate:content requires them). */
export const MAP_AMBIENT_ANCHORS: readonly string[] = [
  MAP_AMBIENT.whale.id,
  MAP_AMBIENT.fountain.id,
  ...MAP_AMBIENT.cloud.anchors,
  ...MAP_AMBIENT.wave.anchors,
];
