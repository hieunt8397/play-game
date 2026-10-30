// Trồng cây content (2026-10-30, spec-trong-cay): a yard game (content/home.ts corner `garden`, "Vườn"). Free play: no
// rounds, no right or wrong, taps only. A small vegetable bed in the yard (`bg.garden`, tools/render/blender/
// build_garden.py) seen through an ORTHOGRAPHIC camera; the chibi Shiba (cute.chibi('dog'), wearing the Tủ đồ outfit)
// sits on the right, the watering can rests on the left.
//   1. Two seed packets (two different fruits from a shuffle bag) stand over the soil: Xoài taps one, its seed drops
//      into the soil and a sprout pops up.
//   2. Each tap on the watering can waters the plant: it grows one stage (sprout → small plant → flowers → fruit),
//      3 waterings in all; the third brings 3 fruits.
//   3. A tapped fruit is picked and hops to Shiba, who eats it with that fruit's own reaction (the lemon is sour: a
//      scrunched face and a shiver; the watermelon spits its pips; the tomato squirts juice; the strawberry is a happy
//      lick), then one `correct` flourish.
//   4. After the last fruit the plant fades back into the soil and two new packets appear.
// Each plant brings one small surprise (a shuffle bag, never the same twice in a row): a butterfly lands on the
// flowers, a worm peeks out of the soil, a giant fruit (two bites, Shiba's cheeks puffed), or a little rainbow after
// the last watering.
// Frames (one camera; Phaser stacks what shares a pivot):
//   - `plant-<fruit>/<stage>/00`: the plant at each stage, rendered on the soil spot (full frame, pivot `anchor.plant`);
//     the `fruit` stage is the grown plant WITHOUT its fruits (their stems end at `anchor.fruit-<n>`);
//   - `fruit-<fruit>/idle/00`, `packet-<fruit>/idle/00`: drawn anywhere by their trimmed centre (at `anchor.fruit-<n>`,
//     `anchor.packet-<n>`);
//   - `can/idle/00`: the watering can where it rests (its trimmed centre is its home);
//   - `shiba/<state>/<nn>` (pivot `anchor.shiba`) and every outfit overlay `shiba-<item>/<state>/<nn>`;
//   - particles placed by their trimmed centre: drop, seed, pip, juice, heart, sparkle, the butterfly (idle, flap) and
//     the worm; `rainbow/idle/00` is drawn where it was rendered (over the bed).
// Layout: `hit.shiba` (Shiba's tap area), the anchors above plus `pour` (the can's centre while it pours), `spout`
// (where the water falls from), `mouth` (where a picked fruit goes), `worm` (its hole in the soil) and
// `flower-<fruit>` (where the butterfly lands on each flowering plant).
// Tap circles: the can, the packets and the fruits, each `hitRadius(longest / 2)` (≥ 80 px wide); tools/layout/rules.ts
// › validateGarden checks them (sizes ≥ 90 px, inside the interactive rect, clear of the Hud, ≥ 24 px apart).
import { ATLASES, BACKGROUNDS } from '../assets.ts';
import type { ReactionSet } from '../../core/reactions.ts';
import { overlayFrames } from './dress-up.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

/** The four fruits (parent decision 2026-10-30): dâu, dưa hấu, cà chua, chanh. */
export const FRUIT_IDS = ['strawberry', 'watermelon', 'tomato', 'lemon'] as const;
export type FruitId = (typeof FRUIT_IDS)[number];
export function isFruit(id: unknown): id is FruitId {
  return typeof id === 'string' && (FRUIT_IDS as readonly string[]).includes(id);
}

/** How Shiba eats each fruit (its own reaction): a happy lick, spat pips, a squirt of juice, a sour scrunch and shiver. */
export const EAT_REACTIONS = ['yum', 'spit', 'squirt', 'sour'] as const;
export type EatReaction = (typeof EAT_REACTIONS)[number];

export interface Fruit {
  readonly id: FruitId;
  /** The parent-facing name (same text as its name line). */
  readonly label: string;
  /** `vo.garden.name.<id>` ("Quả dâu!"): said as its seed is chosen and as its fruits appear. */
  readonly nameLine: string;
  readonly eat: EatReaction;
  /** The bite sound (a crunch or a slurp: Shiba's mouth). */
  readonly biteSfx: string;
}

/** Sounds: our own recipes (tools/audio/make-garden.ts) and reused ones (the bedtime giggle, the shell woof). */
export const SFX = {
  pour: 'sfx.garden.pour',
  pop: 'sfx.garden.pop',
  crunch: 'sfx.garden.crunch',
  slurp: 'sfx.garden.slurp',
  giggle: 'sfx.bedtime.giggle',
  woof: 'sfx.shell.woof',
} as const;

export const nameLine = (id: FruitId): string => `vo.garden.name.${id}`;

export const FRUITS: Readonly<Record<FruitId, Fruit>> = {
  strawberry: { id: 'strawberry', label: 'Quả dâu', nameLine: nameLine('strawberry'), eat: 'yum', biteSfx: SFX.crunch },
  watermelon: { id: 'watermelon', label: 'Quả dưa hấu', nameLine: nameLine('watermelon'), eat: 'spit', biteSfx: SFX.slurp },
  tomato: { id: 'tomato', label: 'Quả cà chua', nameLine: nameLine('tomato'), eat: 'squirt', biteSfx: SFX.slurp },
  lemon: { id: 'lemon', label: 'Quả chanh', nameLine: nameLine('lemon'), eat: 'sour', biteSfx: SFX.crunch },
};

/** The plant's stages: the seed planted shows the sprout; each watering moves one stage on. */
export const STAGES = ['sprout', 'small', 'flower', 'fruit'] as const;
export type StageId = (typeof STAGES)[number];
/** Waterings from the sprout to the fruit (one stage each). */
export const WATERINGS = STAGES.length - 1;

/** The small surprise each plant brings (one per plant, from a shuffle bag, never the same twice in a row). */
export const SURPRISE_IDS = ['butterfly', 'worm', 'giant', 'rainbow'] as const;
export type SurpriseId = (typeof SURPRISE_IDS)[number];
export function isSurprise(id: unknown): id is SurpriseId {
  return typeof id === 'string' && (SURPRISE_IDS as readonly string[]).includes(id);
}
/** The fruit that grows giant (the middle one) when the surprise is `giant`; it takes `GIANT_BITES` bites. */
export const GIANT_FRUIT = 1;
export const GIANT_BITES = 2;

/** FR30/FR31: the flourish after Shiba eats (core/reactions: never the same twice in a row). Nothing is ever "other". */
export const CORRECT_REACTIONS = ['hop', 'wag', 'hearts'] as const;
export type CorrectReaction = (typeof CORRECT_REACTIONS)[number];
export const REACTIONS: ReactionSet = { correct: CORRECT_REACTIONS, choseOther: [] };

/** Voice: the invitation (names Xoài), one short line per step (also the idle hint and the Speaker prompt), the parent line. */
export const PROMPT_LINE = 'vo.garden.prompt';
export const CHOOSE_LINE = 'vo.garden.choose';
export const WATER_LINE = 'vo.garden.water';
export const PICK_LINE = 'vo.garden.pick';
export const PARENT_LINE = 'vo.garden.parent.1';

// --- frames, anchors, hits ------------------------------------------------------------------------------------------

export const plantFrame = (fruit: FruitId, stage: StageId): string => `plant-${fruit}/${stage}/00`;
export const fruitFrame = (fruit: FruitId): string => `fruit-${fruit}/idle/00`;
export const packetFrame = (fruit: FruitId): string => `packet-${fruit}/idle/00`;
export const CAN_FRAME = 'can/idle/00';
export const PARTICLES = {
  drop: 'drop/idle/00',
  seed: 'seed/idle/00',
  pip: 'pip/idle/00',
  juice: 'juice/idle/00',
  heart: 'heart/idle/00',
  sparkle: 'sparkle/idle/00',
  butterfly: 'butterfly/idle/00',
  butterflyFlap: 'butterfly/flap/00',
  worm: 'worm/idle/00',
} as const;
/** Drawn where it was rendered (an arc over the bed). */
export const RAINBOW_FRAME = 'rainbow/idle/00';

/** Shiba's states: sitting, chewing (2), a happy lick with a wag (2), the sour scrunch (2), cheeks puffed (a giant bite). */
export const SHIBA_STATES = { idle: 1, chew: 2, happy: 2, sour: 2, puff: 1 } as const;
export type ShibaState = keyof typeof SHIBA_STATES;
export const shibaFrame = (state: ShibaState, n = 0): string => `shiba/${state}/${String(n).padStart(2, '0')}`;
export const SHIBA_FRAMES: readonly string[] = (Object.keys(SHIBA_STATES) as ShibaState[]).flatMap((s) =>
  Array.from({ length: SHIBA_STATES[s] }, (_, n) => shibaFrame(s, n)),
);

export const PACKET_SLOTS = 2;
export const packetAnchor = (n: number): string => `packet-${n}`;
export const fruitAnchor = (n: number): string => `fruit-${n}`;
export const flowerAnchor = (fruit: FruitId): string => `flower-${fruit}`;
export const ANCHORS = { plant: 'plant', pour: 'pour', spout: 'spout', shiba: 'shiba', mouth: 'mouth', worm: 'worm' } as const;
export const HITS = { shiba: 'shiba' } as const;

/** A tap circle's radius: the drawn half size, but at least half of `minPx` (ui.gardenHitMinPx: an ≥ 80 px target). */
export function hitRadius(half: number, minPx: number): number {
  return Math.max(half, minPx / 2);
}

/** Every plant frame. */
export const PLANT_FRAMES: readonly string[] = FRUIT_IDS.flatMap((f) => STAGES.map((s) => plantFrame(f, s)));

/** What `garden.layout.json` and `atlas.garden` must hold (with `fruitsPerPlant` fruit anchors). */
export function gardenScreen(fruitsPerPlant: number): ScreenRequirements {
  return {
    anchors: [
      ...Object.values(ANCHORS),
      ...Array.from({ length: PACKET_SLOTS }, (_, n) => packetAnchor(n)),
      ...Array.from({ length: fruitsPerPlant }, (_, n) => fruitAnchor(n)),
      ...FRUIT_IDS.map(flowerAnchor),
    ],
    hits: [HITS.shiba],
    slots: [],
    frames: [
      ...PLANT_FRAMES,
      ...FRUIT_IDS.map(fruitFrame),
      ...FRUIT_IDS.map(packetFrame),
      CAN_FRAME,
      ...Object.values(PARTICLES),
      RAINBOW_FRAME,
      ...SHIBA_FRAMES,
      ...overlayFrames(SHIBA_FRAMES),
    ],
  };
}

/** Three fruits per plant, picked in any order. */
export const FRUITS_PER_PLANT = 3;
export const GARDEN_SCREEN: ScreenRequirements = gardenScreen(FRUITS_PER_PLANT);
export const screen = GARDEN_SCREEN;

export const assets: GameAssets = {
  atlases: [ATLASES.garden],
  images: [BACKGROUNDS.garden],
  // sfx.shell.* are Boot sounds (kept for the session): never loaded or released with the game.
  audio: [
    PROMPT_LINE,
    CHOOSE_LINE,
    WATER_LINE,
    PICK_LINE,
    PARENT_LINE,
    ...FRUIT_IDS.map(nameLine),
    ...new Set(Object.values(SFX).filter((id) => !id.startsWith('sfx.shell.'))),
  ],
};

/**
 * The scene's choreography (games/garden/Garden.ts): shares of each animation's time and small motion constants. The
 * durations themselves are Tokens.Timing.garden*; these only split them.
 */
export const MOTION = {
  /** The plant pops (the sprout, each growth step) at this share of the planting / watering. */
  growPopAt: 0.6,
  /** The fruits (and the packets, the burst particles) start one after another, this share of the motion apart. */
  stagger: 0.25,
  /** A packet pops in from this scale; the sprout grows up from this scaleY. */
  packetFromScale: 0.3,
  sproutFromScale: 0.2,
  /** Planting: the other packet fades; the chosen one tilts (degrees) and fades; the seed shows, falls, fades (shares). */
  plant: { otherFade: 0.25, tilt: 0.3, tiltDeg: -25, chosenFade: 0.25, chosenFadeAt: 0.45, seedIn: 0.15, seedInAt: 0.2, seedFall: 0.3, seedOut: 0.1 },
  /** Watering: the can's flight is at most this share of it; the pour holds the rest of 4 flights (in, tilt, untilt 1/2, back 3/2). */
  canFlyShare: 0.25,
  canFlights: 4,
  canBackFlights: 1.5,
  /** The drops start after 2 flights and fall over the watering minus 3 flights; each fades in over this share of its fall. */
  dropsAfterFlights: 2,
  dropsSpanFlights: 3,
  dropIn: 0.25,
  /** The worm: rises, looks one way (degrees), the other, settles, ducks (shares). */
  worm: { rise: 0.25, look: 0.15, lookBack: 0.2, settle: 0.1, duck: 0.3, deg: 10 },
  /** The butterfly flies in over this share of the surprise; once landed it flaps this many frame steps apart; it flies off over this many fades. */
  butterflyIn: 0.7,
  butterflyRestSteps: 6,
  butterflyAwayFades: 3,
  /** The rainbow: in, hold, out (shares). */
  rainbow: { in: 0.3, hold: 0.4, out: 0.3 },
  /** The sour shiver starts after this share of the reaction; each half shake is 1 / (this x shakes) of it. */
  shiverAt: 0.25,
  shiverSplit: 4,
  /** Spat pips fly left in a fan (from angle pi x spitFrom, spread pi x spitSpread); juice flies all round, reaching this share. */
  spitFrom: 0.85,
  spitSpread: 0.3,
  juiceReach: 0.4,
  /** The hearts float from above the mouth (design px): this far apart, this far up. */
  heartsApartPx: 30,
  heartsAbovePx: 40,
  /** The plant fades into the soil shrinking to this scaleY; the butterfly leaves over this share of it. */
  clearToScale: 0.6,
  clearButterfly: 0.33,
} as const;
