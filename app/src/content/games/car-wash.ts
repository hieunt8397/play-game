// Rửa xe content (2026-10-30, spec-rua-xe): a yard game (content/home.ts corner `car-wash`, "Rửa xe"). Free play: no
// rounds, no score, no right or wrong. A car-wash bay (`bg.car-wash`, tools/render/blender/build_car_wash.py) seen
// through an ORTHOGRAPHIC camera; the hose hangs on the bay wall at the left.
//   1. A dirty special vehicle (Kenney Car Kit, CC0) drives in from the left, honks (its own honk or siren) and the
//      voice says its name. Its dirt is one kind (mud, leaves, ice-cream drips or dust) on DIRT_SPOTS fixed spots.
//   2. Xoài rubs (or taps) the car: a foam puff appears at the finger; the dirt spots under the foam go away; the car
//      wiggles as if tickled. Once a `Tokens.ui.carWashFoamShare` of its spots is foamed, the hose bounces.
//   3. A tap on the hose rinses the car (≤ 1.5 s): water sprays, the foam and the dirt wash away.
//   4. The clean car twinkles (soft sparkles, never a flash), blinks its headlights, honks happily, bounces and drives
//      out to the right; the next car (never the same twice in a row) drives in.
// Each car brings one small surprise (a shuffle bag, never the same twice in a row): a rubber duck pops out of the
// foam, the car sneezes a soap bubble, or a little rainbow shows over the puddle after the rinse.
// Frames (one camera; every car and dirt frame is rendered with the car at its rest spot, pivot `anchor.car`):
//   - `car-<vehicle>/clean/00` (the car), `car-<vehicle>/lights/00` (its headlights on);
//   - `dirt-<vehicle>/<dirt>-<n>/00`: one dirt spot n of each kind on that car (an overlay over the car frame);
//   - `hose/idle/00`: the hose where it hangs (its trimmed centre is its home; the spray starts at `anchor.nozzle`);
//   - `foam/<a|b|c>/00`, and the particles (drop, sparkle, bubble, duck) placed by their trimmed centre;
//   - `rainbow/idle/00` drawn where it was rendered (over the puddle at the right).
// Layout: `hit.car-<vehicle>` (each car's hull at rest), `anchor.car`, `anchor.nozzle`, and per car
// `anchor.dirt-<vehicle>-<n>` (the dirt spots), `anchor.top-<vehicle>` (where the duck pops up) and
// `anchor.front-<vehicle>` (where the sneezed bubble starts).
// tools/layout/rules.ts › validateCarWash checks the sizes (hull ≥ 300 px wide, hose drawn ≥ 90 px with a ≥ 80 px tap
// circle), that everything lies inside the interactive rect and off the Hud, and that each dirt spot is on its car.
import { ATLASES, BACKGROUNDS } from '../assets.ts';
import type { ReactionSet } from '../../core/reactions.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

/** The special vehicles (parent decision 2026-10-30), Kenney Car Kit models. */
export const VEHICLE_IDS = ['firetruck', 'police', 'ambulance', 'taxi', 'garbage-truck', 'tractor'] as const;
export type VehicleId = (typeof VEHICLE_IDS)[number];
export function isVehicle(id: unknown): id is VehicleId {
  return typeof id === 'string' && (VEHICLE_IDS as readonly string[]).includes(id);
}

/** The dirt kinds: mud, leaves, ice-cream drips, dust. */
export const DIRT_IDS = ['mud', 'leaves', 'cream', 'dust'] as const;
export type DirtId = (typeof DIRT_IDS)[number];
export function isDirt(id: unknown): id is DirtId {
  return typeof id === 'string' && (DIRT_IDS as readonly string[]).includes(id);
}

/** Dirt spots per car, at fixed anchors (≥ 6). */
export const DIRT_SPOTS = 6;

/** Sounds: our own recipes (tools/audio/make-car-wash.ts) and reused ones. */
export const SFX = {
  scrub: 'sfx.touch-talk.toothbrush',
  bubble: 'sfx.touch-talk.soap',
  rinse: 'sfx.pet-clinic.splash',
  squish: 'sfx.car-wash.squish',
  chime: 'sfx.car-wash.chime',
  fireSiren: 'sfx.car-wash.fire-siren',
  ambulanceSiren: 'sfx.car-wash.ambulance-siren',
  honkLow: 'sfx.car-wash.honk-low',
  policeSiren: 'sfx.touch-talk.police-car',
  carHorn: 'sfx.touch-talk.car',
  beep: 'sfx.race.horn',
} as const;

export interface Vehicle {
  readonly id: VehicleId;
  /** The parent-facing name (same text as its name line). */
  readonly label: string;
  /** `vo.car-wash.name.<id>` ("Xe cứu hỏa!"): said as it arrives. */
  readonly nameLine: string;
  /** Its own honk or siren (as it arrives, and happily once clean). */
  readonly honk: string;
}

export const nameLine = (id: VehicleId): string => `vo.car-wash.name.${id}`;

export const VEHICLES: Readonly<Record<VehicleId, Vehicle>> = {
  firetruck: { id: 'firetruck', label: 'Xe cứu hỏa', nameLine: nameLine('firetruck'), honk: SFX.fireSiren },
  police: { id: 'police', label: 'Xe cảnh sát', nameLine: nameLine('police'), honk: SFX.policeSiren },
  ambulance: { id: 'ambulance', label: 'Xe cứu thương', nameLine: nameLine('ambulance'), honk: SFX.ambulanceSiren },
  taxi: { id: 'taxi', label: 'Xe taxi', nameLine: nameLine('taxi'), honk: SFX.carHorn },
  'garbage-truck': { id: 'garbage-truck', label: 'Xe rác', nameLine: nameLine('garbage-truck'), honk: SFX.honkLow },
  tractor: { id: 'tractor', label: 'Máy cày', nameLine: nameLine('tractor'), honk: SFX.beep },
};

/** The sound as a spot of that dirt is foamed (the mud squishes; the rest is a soft soap pop). */
export const DIRT_SFX: Readonly<Record<DirtId, string>> = { mud: SFX.squish, leaves: SFX.bubble, cream: SFX.bubble, dust: SFX.bubble };

/** The small surprise each car brings (one per car, from a shuffle bag, never the same twice in a row). */
export const SURPRISE_IDS = ['duck', 'bubble', 'rainbow'] as const;
export type SurpriseId = (typeof SURPRISE_IDS)[number];
export function isSurprise(id: unknown): id is SurpriseId {
  return typeof id === 'string' && (SURPRISE_IDS as readonly string[]).includes(id);
}

/** The question-seed slots of the scene's three shuffle bags (core/rng › questionSeed). */
export const BAG_SEEDS = { vehicles: 1, dirts: 2, surprises: 3 } as const;

/** How many of `spots` dirt spots must be under foam for the car to count as foamed (at least one). */
export function neededSpots(spots: number, share: number): number {
  return Math.max(1, Math.min(spots, Math.ceil(share * spots - 1e-9)));
}

/** FR30/FR31: nothing is ever "other"; the clean car's flourish is its own (honk, blink, bounce). */
export const REACTIONS: ReactionSet = { correct: ['bounce'], choseOther: [] };

/** Voice: the invitation (names Xoài), "rub", "rinse" (each also the idle hint and the Speaker prompt), the parent line. */
export const PROMPT_LINE = 'vo.car-wash.prompt';
export const RUB_LINE = 'vo.car-wash.rub';
export const RINSE_LINE = 'vo.car-wash.rinse';
export const PARENT_LINE = 'vo.car-wash.parent.1';

// --- frames, anchors, hits ------------------------------------------------------------------------------------------

export const CAR_STATES = ['clean', 'lights'] as const;
export type CarState = (typeof CAR_STATES)[number];
export const carFrame = (v: VehicleId, state: CarState = 'clean'): string => `car-${v}/${state}/00`;
export const dirtFrame = (v: VehicleId, dirt: DirtId, n: number): string => `dirt-${v}/${dirt}-${n}/00`;
export const HOSE_FRAME = 'hose/idle/00';
export const FOAM_FRAMES = ['foam/a/00', 'foam/b/00', 'foam/c/00'] as const;
export const PARTICLES = {
  drop: 'drop/idle/00',
  sparkle: 'sparkle/idle/00',
  bubble: 'bubble/idle/00',
  duck: 'duck/idle/00',
  /** A soft disc under the car (drawn at low alpha, it moves with the car). */
  shadow: 'shadow/idle/00',
} as const;
/** Drawn where it was rendered (a little arc over the puddle). */
export const RAINBOW_FRAME = 'rainbow/idle/00';

export const ANCHORS = { car: 'car', nozzle: 'nozzle' } as const;
export const dirtAnchor = (v: VehicleId, n: number): string => `dirt-${v}-${n}`;
export const topAnchor = (v: VehicleId): string => `top-${v}`;
export const frontAnchor = (v: VehicleId): string => `front-${v}`;
export const carHit = (v: VehicleId): string => `car-${v}`;

/** The hose's tap circle radius: its drawn half size, but at least half of `minPx` (ui.carWashHitMinPx). */
export function hitRadius(half: number, minPx: number): number {
  return Math.max(half, minPx / 2);
}

export const CAR_FRAMES: readonly string[] = VEHICLE_IDS.flatMap((v) => CAR_STATES.map((s) => carFrame(v, s)));
export const DIRT_FRAMES: readonly string[] = VEHICLE_IDS.flatMap((v) => DIRT_IDS.flatMap((d) => Array.from({ length: DIRT_SPOTS }, (_, n) => dirtFrame(v, d, n))));

/** What `car-wash.layout.json` and `atlas.car-wash` must hold. */
export function carWashScreen(spots: number = DIRT_SPOTS): ScreenRequirements {
  return {
    anchors: [
      ...Object.values(ANCHORS),
      ...VEHICLE_IDS.flatMap((v) => [...Array.from({ length: spots }, (_, n) => dirtAnchor(v, n)), topAnchor(v), frontAnchor(v)]),
    ],
    hits: VEHICLE_IDS.map(carHit),
    slots: [],
    frames: [...CAR_FRAMES, ...DIRT_FRAMES, HOSE_FRAME, ...FOAM_FRAMES, ...Object.values(PARTICLES), RAINBOW_FRAME],
  };
}

export const CAR_WASH_SCREEN: ScreenRequirements = carWashScreen();
export const screen = CAR_WASH_SCREEN;

export const assets: GameAssets = {
  atlases: [ATLASES['car-wash']],
  images: [BACKGROUNDS['car-wash']],
  audio: [PROMPT_LINE, RUB_LINE, RINSE_LINE, PARENT_LINE, ...VEHICLE_IDS.map(nameLine), ...new Set(Object.values(SFX))],
};

/**
 * The scene's choreography (games/car-wash/CarWash.ts): shares of each animation's time and small motion constants.
 * The durations themselves are Tokens.Timing.carWash*; these only split them.
 */
export const MOTION = {
  /** A drive: the wheels' bob (shares of the drive per bob), the settle squash at the end (scaleY). */
  driveBobs: 6,
  settleScale: 0.96,
  /** The rinse: the hose tilts over this share; the spray sweeps the car left → right over the rest; the foam and the dirt fade from this share. */
  rinseTilt: 0.15,
  rinseFadeAt: 0.3,
  /** The spray drops: this many waves, each a share of the rinse. */
  sprayWaves: 4,
  /** The shine: the sparkles start one after another, this share of it apart; the headlights blink this many times. */
  sparkleStagger: 0.12,
  blinks: 2,
  /** The clean car bounces at this share of the shine. */
  bounceAt: 0.6,
  /** The duck: rises, wobbles (degrees), sinks (shares). */
  duck: { rise: 0.25, wobble: 0.45, sink: 0.3, deg: 12 },
  /** The sneeze: the car squashes over this share, the bubble floats up over the rest. */
  sneezeAt: 0.25,
  /** The rainbow: in, hold, out (shares). */
  rainbow: { in: 0.3, hold: 0.4, out: 0.3 },
  /** A foam puff pops in from this scale; the rinsed foam slides down this far (design px) as it fades. */
  foamFromScale: 0.3,
  foamSlidePx: 14,
  /** The soft shadow under the car (its alpha). */
  shadowAlpha: 0.22,
  /** The drive: the car rocks this many degrees on its wheels as it starts and stops. */
  driveRockDeg: 2,
  /** A sparkle twinkles up to this scale (of its rest scale) and back. */
  twinkleScale: 1.3,
  /** The sparkles twinkle over the top share of the car's hull. */
  sparkleTop: 0.7,
  /** The spray drops land in this band of the car's height (from, span: shares from its top). */
  sprayBand: { from: 0.25, span: 0.5 },
} as const;
