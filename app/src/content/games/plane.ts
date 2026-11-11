// Phi công nhí content (2026-11-11, spec-phi-cong-nhi): a yard game (content/home.ts corner `plane`, "Máy bay"). Free
// play: no rounds, no score, no right or wrong. A still sky plate (`bg.plane`, tools/render/blender/build_plane.py) seen
// through an ORTHOGRAPHIC camera; everything that scrolls (clouds, hills, the ground strip, the balloons, the friend's
// house) is an atlas sprite the scene moves — the pure model (games/plane/flight.ts) owns every position.
//   1. A little toy plane (the chibi Shiba in pilot goggles) waits on the grass. A tap on it: the propeller spins and
//      it takes off (its x never changes; the sky starts to scroll).
//   2. A press anywhere in the sky sets the plane's target height; it eases there. While the finger stays down the
//      target follows it; lifting keeps the height. Taps alone play the whole game.
//   3. Balloons (four colours, one at a time) float in, each carrying a gift box. When the plane touches one it pops,
//      the gift hops into the plane, and the voice names the colour and counts ("Bóng đỏ!" "Một!"). A miss costs
//      nothing; after a few misses in a row (or a while without steering) the next balloon comes at the plane's height.
//   4. After GIFTS_PER_FLIGHT gifts an animal friend's house scrolls in and the sky stops. A tap on the friend (or its
//      house) drops the gifts on little parachutes; the friend reacts with its own happy move and its call.
//   5. The plane waggles its wings and flies on to the next friend (never the same twice in a row).
// Each flight brings one small surprise (a shuffle bag): a rainbow arch the plane flies through, a flock of little
// birds alongside, a hot-air balloon waving far away, or a heart-shaped cloud.
// Frames (one camera; `<sprite>/<state>/<nn>`):
//   - `plane/<idle|prop|waggle|happy>/<nn>`: rendered with the plane's centre on `anchor.plane` (idle: parked, the
//     propeller still; prop 00–01: flying, the propeller a blur; waggle 00–01: the wings tipped left and right;
//     happy 00: the pilot cheers);
//   - `balloon-<colour>/idle/00` (the balloon, its string and its gift box), `gift-<colour>/idle/00` (the box alone),
//     `parachute/idle/00`, `pop/idle/00` (the pop's little burst), `puff/idle/00` (a cloud puff), placed by their
//     trimmed centre;
//   - `cloud/<a|b|heart>/00`, `hill/<a|b>/00`, `bird/<a|b>/00` (two wing poses), `ground/idle/00` (a strip as wide as
//     the screen that tiles side by side), placed by their trimmed centre (the ground and hills keep their rendered y);
//   - `friend-<id>/<idle|happy>/00` on the ground pivot `anchor.friend`, `house-<id>/idle/00` on `anchor.house`;
//   - `rainbow/idle/00`, `hot-air/idle/00` (the surprises).
// Layout: `anchor.plane` (the flying plane's centre: its fixed x, the middle height), `anchor.plane-ground` (its centre
// while parked), `anchor.cargo-<n>` (where gift n rides, with the plane on `anchor.plane`), `anchor.friend`,
// `anchor.house`, `anchor.gifts` (where the dropped gifts land), `hit.friend-<id>` and `hit.house-<id>` (the hulls at
// rest). tools/layout/rules.ts › validatePlane checks the sizes and that the plane, at every height of its flight, the
// friends and the houses stay inside the interactive rect and off the Hud.
import { ATLASES, BACKGROUNDS } from '../assets.ts';
import type { ReactionSet } from '../../core/reactions.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

/** The friends: the chibi pen animals (cute.chibi), each in front of its own little house. */
export const FRIEND_IDS = ['cat', 'pig', 'sheep', 'cow', 'horse', 'rooster'] as const;
export type FriendId = (typeof FRIEND_IDS)[number];
export function isFriend(id: unknown): id is FriendId {
  return typeof id === 'string' && (FRIEND_IDS as readonly string[]).includes(id);
}

/** The balloon (and gift box) colours. No blue: the sky is blue. */
export const COLOUR_IDS = ['red', 'yellow', 'green', 'purple'] as const;
export type ColourId = (typeof COLOUR_IDS)[number];
export function isColour(id: unknown): id is ColourId {
  return typeof id === 'string' && (COLOUR_IDS as readonly string[]).includes(id);
}

/** The small surprise each flight brings (one per flight, from a shuffle bag, never the same twice in a row). */
export const SURPRISE_IDS = ['rainbow', 'flock', 'hot-air', 'heart'] as const;
export type SurpriseId = (typeof SURPRISE_IDS)[number];
export function isSurprise(id: unknown): id is SurpriseId {
  return typeof id === 'string' && (SURPRISE_IDS as readonly string[]).includes(id);
}

/** Gifts per flight: the house arrives after this many. */
export const GIFTS_PER_FLIGHT = 3;
/** Clouds that drift through the plane's band (the model owns them). */
export const CLOUD_COUNT = 2;

/** Sounds: our own recipes (tools/audio/make-plane.ts) and reused ones. */
export const SFX = {
  propeller: 'sfx.plane.propeller',
  whoosh: 'sfx.plane.whoosh',
  boing: 'sfx.plane.boing',
  pop: 'sfx.garden.pop',
  chime: 'sfx.car-wash.chime',
  puff: 'sfx.shell.pop',
  chirp: 'sfx.shell.chirp',
} as const;

/** A friend's own happy move: `hops` hops of `hopPx`, tilting ± `deg`, squashing to `squash` (scaleY) on each landing. */
export interface HappyMove {
  readonly hops: number;
  readonly hopPx: number;
  readonly deg: number;
  readonly squash: number;
}

export interface Friend {
  readonly id: FriendId;
  /** The parent-facing name. */
  readonly label: string;
  /** `vo.plane.drop.<id>` ("Thả quà cho bạn mèo nhé!"): said as its house arrives; the idle hint and the Speaker prompt there. */
  readonly dropLine: string;
  /** `sfx.animal-pens.<id>.call`: its real call, as it gets its gifts. */
  readonly callSfx: string;
  readonly move: HappyMove;
}

export const dropLine = (id: FriendId): string => `vo.plane.drop.${id}`;
const callSfx = (id: FriendId): string => `sfx.animal-pens.${id}.call`;

export const FRIENDS: Readonly<Record<FriendId, Friend>> = {
  // The cat: two light hops. The pig: a wiggle on the spot. The sheep: one big springy bounce. The cow: a slow sway.
  // The horse: it rears. The rooster: three quick flappy hops.
  cat: { id: 'cat', label: 'Bạn mèo', dropLine: dropLine('cat'), callSfx: callSfx('cat'), move: { hops: 2, hopPx: 22, deg: 0, squash: 0.94 } },
  pig: { id: 'pig', label: 'Bạn lợn', dropLine: dropLine('pig'), callSfx: callSfx('pig'), move: { hops: 4, hopPx: 4, deg: 7, squash: 1 } },
  sheep: { id: 'sheep', label: 'Bạn cừu', dropLine: dropLine('sheep'), callSfx: callSfx('sheep'), move: { hops: 1, hopPx: 40, deg: 0, squash: 0.86 } },
  cow: { id: 'cow', label: 'Bạn bò', dropLine: dropLine('cow'), callSfx: callSfx('cow'), move: { hops: 2, hopPx: 6, deg: 5, squash: 0.97 } },
  horse: { id: 'horse', label: 'Bạn ngựa', dropLine: dropLine('horse'), callSfx: callSfx('horse'), move: { hops: 1, hopPx: 26, deg: -10, squash: 0.95 } },
  rooster: { id: 'rooster', label: 'Bạn gà', dropLine: dropLine('rooster'), callSfx: callSfx('rooster'), move: { hops: 3, hopPx: 14, deg: 4, squash: 0.92 } },
};

/** The model's small sky constants (games/plane/flight.ts). */
export const SKY = {
  /** The clouds keep drifting at this share of their speed while the sky stands still. */
  cloudIdle: 0.25,
  /** Where the clouds start (shares of the screen width, one per cloud). */
  cloudStart: [0.72, 1.3],
  /** A cloud passes anywhere from this far above the top of the plane's band down to its bottom (design px). */
  cloudAbovePx: 50,
  /** The bird flies this far above the top of the plane's band (design px) and starts this far along (share of the width). */
  birdAbovePx: 75,
  birdStart: 1.5,
  /** The first balloon of a flight starts this soon (ms). */
  firstBalloonMs: 400,
  /** A cloud that left comes back this far past the right edge at most (share of the screen width). */
  cloudSpread: 0.5,
  /** The speeds are Tokens in design px per second; the model's clock runs in ms. */
  msPerS: 1000,
} as const;

/** The question-seed slots of the scene's shuffle bags and of the model's own rng (core/rng › questionSeed). */
export const BAG_SEEDS = { friends: 1, colours: 2, surprises: 3, sky: 4 } as const;

/** FR30/FR31: nothing is ever "other"; the friend's happy move is its own. */
export const REACTIONS: ReactionSet = { correct: ['bounce'], choseOther: [] };

/**
 * Voice: the invitation (names Xoài; also the idle hint and the Speaker prompt before take-off), "touch the balloons",
 * each friend's "drop the gifts" line, the colour names, the counts (the pizza's "Một! Hai! Ba!") and the parent line.
 */
export const PROMPT_LINE = 'vo.plane.prompt';
export const BALLOONS_LINE = 'vo.plane.balloons';
export const PARENT_LINE = 'vo.plane.parent.1';
export const colourLine = (c: ColourId): string => `vo.plane.colour.${c}`;
/** The n-th gift's count line (n = 1 … GIFTS_PER_FLIGHT). */
export const countLine = (n: number): string => `vo.pizza.count.${n}`;
export const COUNT_LINES: readonly string[] = Array.from({ length: GIFTS_PER_FLIGHT }, (_, i) => countLine(i + 1));

// --- frames, anchors, hits ------------------------------------------------------------------------------------------

export const PLANE_FRAMES = {
  idle: 'plane/idle/00',
  prop: ['plane/prop/00', 'plane/prop/01'],
  waggle: ['plane/waggle/00', 'plane/waggle/01'],
  happy: 'plane/happy/00',
} as const;
export const ALL_PLANE_FRAMES: readonly string[] = [PLANE_FRAMES.idle, ...PLANE_FRAMES.prop, ...PLANE_FRAMES.waggle, PLANE_FRAMES.happy];
export const balloonFrame = (c: ColourId): string => `balloon-${c}/idle/00`;
export const giftFrame = (c: ColourId): string => `gift-${c}/idle/00`;
export const FRIEND_STATES = ['idle', 'happy'] as const;
export type FriendState = (typeof FRIEND_STATES)[number];
export const friendFrame = (f: FriendId, state: FriendState = 'idle'): string => `friend-${f}/${state}/00`;
export const houseFrame = (f: FriendId): string => `house-${f}/idle/00`;
export const CLOUD_FRAMES = ['cloud/a/00', 'cloud/b/00'] as const;
export const HILL_FRAMES = ['hill/a/00', 'hill/b/00'] as const;
export const BIRD_FRAMES = ['bird/a/00', 'bird/b/00'] as const;
export const GROUND_FRAME = 'ground/idle/00';
export const PARTICLES = {
  parachute: 'parachute/idle/00',
  pop: 'pop/idle/00',
  puff: 'puff/idle/00',
} as const;
export const SURPRISE_FRAMES = {
  rainbow: 'rainbow/idle/00',
  hotAir: 'hot-air/idle/00',
  heart: 'cloud/heart/00',
} as const;

export const ANCHORS = { plane: 'plane', ground: 'plane-ground', friend: 'friend', house: 'house', gifts: 'gifts' } as const;
export const cargoAnchor = (n: number): string => `cargo-${n}`;
export const friendHit = (f: FriendId): string => `friend-${f}`;
export const houseHit = (f: FriendId): string => `house-${f}`;

/** The three heights balloons come in at (high, middle, low): the top and bottom of the plane's band and their middle. */
export function laneYs(topY: number, bottomY: number): readonly [number, number, number] {
  return [topY, (topY + bottomY) / 2, bottomY];
}

/** What `plane.layout.json` and `atlas.plane` must hold. */
export function planeScreen(): ScreenRequirements {
  return {
    anchors: [...Object.values(ANCHORS), ...Array.from({ length: GIFTS_PER_FLIGHT }, (_, n) => cargoAnchor(n))],
    hits: FRIEND_IDS.flatMap((f) => [friendHit(f), houseHit(f)]),
    slots: [],
    frames: [
      ...ALL_PLANE_FRAMES,
      ...COLOUR_IDS.flatMap((c) => [balloonFrame(c), giftFrame(c)]),
      ...FRIEND_IDS.flatMap((f) => [...FRIEND_STATES.map((s) => friendFrame(f, s)), houseFrame(f)]),
      ...CLOUD_FRAMES,
      ...HILL_FRAMES,
      ...BIRD_FRAMES,
      GROUND_FRAME,
      ...Object.values(PARTICLES),
      ...Object.values(SURPRISE_FRAMES),
    ],
  };
}

export const PLANE_SCREEN: ScreenRequirements = planeScreen();
export const screen = PLANE_SCREEN;

export const assets: GameAssets = {
  atlases: [ATLASES.plane],
  images: [BACKGROUNDS.plane],
  audio: [
    PROMPT_LINE,
    BALLOONS_LINE,
    PARENT_LINE,
    ...COLOUR_IDS.map(colourLine),
    ...COUNT_LINES,
    ...FRIEND_IDS.map(dropLine),
    ...FRIEND_IDS.map(callSfx),
    // The shell's pop and chirp are loaded by Boot for the whole session (never released with the game).
    ...new Set(Object.values(SFX).filter((id) => !id.startsWith('sfx.shell.'))),
  ],
};

/**
 * The scene's choreography (games/plane/Plane.ts): shares of each animation's time and small motion constants. The
 * durations themselves are Tokens.Timing.plane*; these only split them.
 */
export const MOTION = {
  /** The ground strip is a little narrower than the screen (atlas padding): this many copies, overlapping by groundOverlapPx, so no seam or gap shows. */
  groundCopies: 3,
  groundOverlapPx: 1,
  /** How fast each layer scrolls, as a share of the ground's speed (far things are slower). */
  hillSpeed: 0.35,
  /** The hills' spacing along the scroll (design px), how many pass in one loop, and how far outside the screen one wraps. */
  hillGapPx: 620,
  hills: 3,
  hillPadPx: 300,
  /** The plane noses up this many degrees as it climbs and down as it sinks (per design px of distance left, capped). */
  pitchPerPx: 0.12,
  pitchMaxDeg: 10,
  /** Take-off: the plane tilts up this much; the wing waggle swaps its two frames this many times over the fly-off. */
  takeOffDeg: -12,
  waggles: 4,
  /** A caught gift hops this high on its way into the plane; it rides at this scale. */
  giftHopPx: 46,
  cargoScale: 0.5,
  /** A dropped gift is drawn at this scale; its parachute rides this far above it (design px). */
  dropScale: 0.8,
  chuteLiftPx: 44,
  /** The pop burst grows to this scale as it fades. */
  popScale: 1.5,
  /** A dropped gift: the parachute opens over this share of the drop; the gift sways ± this (degrees) on the way down. */
  chuteOpen: 0.2,
  chuteSwayDeg: 8,
  /** The gifts land this far apart (design px) around `anchor.gifts`; they stay this share of the friend's happy time, then fade. */
  giftSpreadPx: 38,
  giftStay: 0.7,
  /** A cloud puffs up to this scale when bumped or tapped; the bumped plane dips with it. */
  cloudPuffScale: 1.15,
  /** A tapped bird loops up this high (design px). */
  birdLoopPx: 30,
  /** The rainbow, the hot-air balloon and the heart cloud: where they pass (shares of the screen height from the top) and their scale. */
  rainbowY: 0.5,
  hotAirY: 0.3,
  hotAirScale: 0.7,
  hotAirWaveDeg: 6,
  heartY: 0.24,
  /** The flock: this many little birds, this far apart (design px), at this scale, hovering beside the plane. */
  flock: 4,
  flockGapPx: 46,
  flockScale: 0.6,
  flockAheadPx: 150,
  /** The flock hovers this far above the plane, every other bird this much lower (design px); it flies in, hovers and flies out over these shares. */
  flockRisePx: 70,
  flockStepPx: 26,
  cross: { in: 0.3, hold: 0.4, out: 0.3 },
  /** The hot-air balloon and the heart cloud show at this share of the width, drift this far left (design px) and fade in and out over this share each. */
  driftStart: 0.78,
  driftPx: 150,
  driftFade: 0.2,
  /** A surprise that crosses the screen starts and ends this far outside it (design px). */
  crossPadPx: 220,
  /** A friend's happy move: this share of its time is kept after the hops (the hops share the rest). */
  friendFade: 0.15,
} as const;
