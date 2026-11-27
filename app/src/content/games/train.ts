// Tàu hỏa chở bạn content (2026-11-12, spec-tau-hoa): a yard game (content/home.ts corner `train`, "Tàu hỏa"). Free
// play: no rounds, no score, no right or wrong. A still sky plate (`bg.train`, tools/render/blender/build_train.py)
// seen through an ORTHOGRAPHIC camera; everything that scrolls (hills, trees, fences, the ground strip with the
// track, the platforms, the tunnel, the destination, the surprises) is an atlas sprite the scene moves — the pure
// model (games/train/trip.ts) owns every position. The train's x never changes: the world scrolls past it.
//   1. A toy steam train (a green engine driven by the chibi Shiba in a conductor's cap, three cars: red, yellow,
//      blue) waits at a little station. A tap on it: it toots, puffs and pulls away.
//   2. The countryside scrolls by itself; there is nothing to steer.
//   3. The train slows into a station where an animal friend waits. A tap on the friend (or its platform): it hops
//      into the next empty car (from the engine back) with its own call; the voice says "Bạn mèo lên tàu!" and counts.
//   4. Once a trip the train rides through a tunnel: the scene dims gently as the hill covers the train, and the
//      voice says "Ú òa!" as the engine comes out.
//   5. After FRIENDS_PER_TRIP friends the train arrives at a destination (the beach, a playground, a fair). A tap on
//      it: the friends hop off one by one and wave; the train toots and sets off with new friends.
// Taps any time: the engine (a puff and a toot), a car (it wobbles; the voice names its colour), the cow or the
// bird by the track, the trip's surprise (a level crossing, a bridge with a jumping fish, a hot-air balloon, a
// rainbow).
// Frames (one camera; `<sprite>/<state>/<nn>`):
//   - `engine/<idle|run|toot|happy>/<nn>` (run 00–01: the wheels and rods turning; toot: a puff from the chimney),
//     `car-<colour>/<idle|front>/00` (the open wagon; its front wall alone): rendered where they stand (full frame;
//     the train never moves sideways);
//   - `seat-<friend>/idle/00`: the friend sitting in car 0, drawn between the car and its front wall (moved by the car
//     anchors);
//   - `friend-<friend>/<idle|wave|happy>/00` on its platform (ground pivot `anchor.friend`);
//   - `platform/idle/00` (ground pivot `anchor.platform`), `dest-<id>/idle/00` (`anchor.dest`),
//     `tunnel/<back|front>/00` (`anchor.tunnel`: where the train goes out of sight, on the track), and
//     `tunnel-portal/<back|front>/00` (one stone portal on the track, ground pivot `anchor.portal`; drawn at both ends,
//     its opening's edge (`anchor.portal-edge`) on `anchor.tunnel` and, mirrored, on `anchor.tunnel-end`): drawn where
//     they stop, scrolled;
//   - `hill/<a|b>/00`, `tree/<a|b>/00`, `fence/idle/00`, `ground/idle/00` (the strip with the track; it tiles):
//     their rendered y kept;
//   - `cloud/<a|b>/00`, `bird/<a|b>/00`, `cow/<idle|happy>/00` (grazing on the near grass, in front of the track), `puff/idle/00`, `pop/idle/00`, the surprises
//     (`crossing/<idle|wave>/00`, `bridge/idle/00`, `fish/idle/00`, `hot-air/idle/00`, `rainbow/idle/00`): placed by
//     their trimmed centre (the crossing and the bridge by `anchor.surprise`, their ground pivot).
// Layout: anchors engine, car-<n>, seat-<n>, chimney, nose, tail, platform, friend, dest, drop-<n>, tunnel,
// tunnel-end, portal, portal-edge, surprise; hits engine, car-<n>, platform, friend-<id>, dest-<id>. tools/layout/rules.ts › validateTrain
// checks the sizes and that every tap area stays inside the interactive rect, off the Hud and apart.
import { ATLASES, BACKGROUNDS } from '../assets.ts';
import type { ReactionSet } from '../../core/reactions.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

/** The friends: the chibi pen animals (cute.chibi), each waiting on its own station platform. */
export const FRIEND_IDS = ['cat', 'pig', 'sheep', 'cow', 'horse', 'rooster'] as const;
export type FriendId = (typeof FRIEND_IDS)[number];
export function isFriend(id: unknown): id is FriendId {
  return typeof id === 'string' && (FRIEND_IDS as readonly string[]).includes(id);
}

/** The cars, from the engine back, each in its fixed colour (the background is grass: blue reads well). */
export const CAR_COLOURS = ['red', 'yellow', 'blue'] as const;
export type CarColour = (typeof CAR_COLOURS)[number];

/** Where a trip ends. */
export const DESTINATION_IDS = ['beach', 'playground', 'fair'] as const;
export type DestinationId = (typeof DESTINATION_IDS)[number];
export function isDestination(id: unknown): id is DestinationId {
  return typeof id === 'string' && (DESTINATION_IDS as readonly string[]).includes(id);
}

/** The small surprise each trip brings (one per trip, from a shuffle bag, never the same twice in a row). */
export const SURPRISE_IDS = ['crossing', 'bridge', 'hot-air', 'rainbow'] as const;
export type SurpriseId = (typeof SURPRISE_IDS)[number];
export function isSurprise(id: unknown): id is SurpriseId {
  return typeof id === 'string' && (SURPRISE_IDS as readonly string[]).includes(id);
}

/** Friends per trip: one per car; the destination comes after the last. */
export const FRIENDS_PER_TRIP = CAR_COLOURS.length;
/** The legs of a trip: to each station, then to the destination. The tunnel falls on one of TUNNEL_LEGS. */
export const LEGS = FRIENDS_PER_TRIP + 1;
export const TUNNEL_LEGS = [1, 2] as const;
/** Clouds that drift across the sky (the model owns them). */
export const CLOUD_COUNT = 2;

/** Sounds: our own recipes (tools/audio/make-train.ts) and reused ones. */
export const SFX = {
  toot: 'sfx.train.toot',
  chug: 'sfx.train.chug',
  puff: 'sfx.train.puff',
  hiss: 'sfx.train.hiss',
  pop: 'sfx.garden.pop',
  chime: 'sfx.car-wash.chime',
  honk: 'sfx.touch-talk.car',
  splash: 'sfx.pet-clinic.splash',
  tap: 'sfx.shell.pop',
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
  /** `vo.train.board.<id>` ("Bạn mèo lên tàu!"): said as it hops into its car. */
  readonly boardLine: string;
  /** `sfx.animal-pens.<id>.call`: its real call, as it boards. */
  readonly callSfx: string;
  readonly move: HappyMove;
}

export const boardLine = (id: FriendId): string => `vo.train.board.${id}`;
const callSfx = (id: FriendId): string => `sfx.animal-pens.${id}.call`;

export const FRIENDS: Readonly<Record<FriendId, Friend>> = {
  // The cat: two light hops. The pig: a wiggle on the spot. The sheep: one big springy bounce. The cow: a slow sway.
  // The horse: it rears. The rooster: three quick flappy hops (as in Phi công nhí).
  cat: { id: 'cat', label: 'Bạn mèo', boardLine: boardLine('cat'), callSfx: callSfx('cat'), move: { hops: 2, hopPx: 22, deg: 0, squash: 0.94 } },
  pig: { id: 'pig', label: 'Bạn lợn', boardLine: boardLine('pig'), callSfx: callSfx('pig'), move: { hops: 4, hopPx: 4, deg: 7, squash: 1 } },
  sheep: { id: 'sheep', label: 'Bạn cừu', boardLine: boardLine('sheep'), callSfx: callSfx('sheep'), move: { hops: 1, hopPx: 40, deg: 0, squash: 0.86 } },
  cow: { id: 'cow', label: 'Bạn bò', boardLine: boardLine('cow'), callSfx: callSfx('cow'), move: { hops: 2, hopPx: 6, deg: 5, squash: 0.97 } },
  horse: { id: 'horse', label: 'Bạn ngựa', boardLine: boardLine('horse'), callSfx: callSfx('horse'), move: { hops: 1, hopPx: 26, deg: -10, squash: 0.95 } },
  rooster: { id: 'rooster', label: 'Bạn gà', boardLine: boardLine('rooster'), callSfx: callSfx('rooster'), move: { hops: 3, hopPx: 14, deg: 4, squash: 0.92 } },
};

export interface Destination {
  readonly id: DestinationId;
  readonly label: string;
  /** `vo.train.dest.<id>` ("Đến biển rồi!"): said as the train stops there; the idle hint and the Speaker prompt. */
  readonly line: string;
}

export const destLine = (id: DestinationId): string => `vo.train.dest.${id}`;
export const DESTINATIONS: Readonly<Record<DestinationId, Destination>> = {
  beach: { id: 'beach', label: 'Biển', line: destLine('beach') },
  playground: { id: 'playground', label: 'Sân chơi', line: destLine('playground') },
  fair: { id: 'fair', label: 'Hội chợ', line: destLine('fair') },
};

/** The model's small world constants (games/train/trip.ts). */
export const WORLD = {
  /** The clouds keep drifting at this share of their speed while the train stands still. */
  cloudIdle: 0.3,
  /** Where the clouds start (shares of the screen width) and their heights (design px from the top). */
  cloudStart: [0.3, 0.95],
  cloudY: [96, 168],
  /** The bird flies at this height (design px), starting this far along (share of the width). */
  birdY: 210,
  birdStart: 1.4,
  /** The cow grazes by the track: it comes by once every this many legs, starting this far into its leg's cruise (share). */
  cowEvery: 2,
  /** A leg's surprise passes this far into its cruise (share of the cruise). */
  surpriseAt: 0.15,
  /** The speeds are Tokens in design px per second; the model's clock runs in ms. */
  msPerS: 1000,
  /** A trip's friends are drawn from the bag in at most this many tries per friend (then filled from the list). */
  drawTries: 8,
} as const;

/** The question-seed slots of the scene's shuffle bags and of the model's own rng (core/rng › questionSeed). */
export const BAG_SEEDS = { friends: 1, destinations: 2, surprises: 3, world: 4 } as const;

/** FR30/FR31: nothing is ever "other"; the friend's happy move is its own. */
export const REACTIONS: ReactionSet = { correct: ['bounce'], choseOther: [] };

/**
 * Voice: the invitation (names Xoài; the idle hint and the Speaker prompt at the start station), the station line
 * (a friend is waiting: the idle hint and the Speaker prompt there), each friend's boarding line, the counts (the
 * pizza's "Một! Hai! Ba!"), the car colours, "Ú òa!" for the tunnel, each destination's line and the parent line.
 */
export const PROMPT_LINE = 'vo.train.prompt';
export const STATION_LINE = 'vo.train.station';
export const TUNNEL_LINE = 'vo.train.tunnel';
export const PARENT_LINE = 'vo.train.parent.1';
export const carLine = (c: CarColour): string => `vo.train.car.${c}`;
/** The n-th friend's count line (n = 1 … FRIENDS_PER_TRIP). */
export const countLine = (n: number): string => `vo.pizza.count.${n}`;
export const COUNT_LINES: readonly string[] = Array.from({ length: FRIENDS_PER_TRIP }, (_, i) => countLine(i + 1));

// --- frames, anchors, hits ------------------------------------------------------------------------------------------

export const ENGINE_FRAMES = {
  idle: 'engine/idle/00',
  run: ['engine/run/00', 'engine/run/01'],
  toot: 'engine/toot/00',
  happy: 'engine/happy/00',
} as const;
export const ALL_ENGINE_FRAMES: readonly string[] = [ENGINE_FRAMES.idle, ...ENGINE_FRAMES.run, ENGINE_FRAMES.toot, ENGINE_FRAMES.happy];
export const carFrame = (c: CarColour): string => `car-${c}/idle/00`;
/** The car's front wall alone: drawn over the friend sitting inside (the whole car is drawn under it). */
export const carFrontFrame = (c: CarColour): string => `car-${c}/front/00`;
export const seatFrame = (f: FriendId): string => `seat-${f}/idle/00`;
export const FRIEND_STATES = ['idle', 'wave', 'happy'] as const;
export type FriendState = (typeof FRIEND_STATES)[number];
export const friendFrame = (f: FriendId, state: FriendState = 'idle'): string => `friend-${f}/${state}/00`;
export const destFrame = (d: DestinationId): string => `dest-${d}/idle/00`;
export const PLATFORM_FRAME = 'platform/idle/00';
export const TUNNEL_FRAMES = { back: 'tunnel/back/00', front: 'tunnel/front/00', portalBack: 'tunnel-portal/back/00', portalFront: 'tunnel-portal/front/00' } as const;
export const HILL_FRAMES = ['hill/a/00', 'hill/b/00'] as const;
export const TREE_FRAMES = ['tree/a/00', 'tree/b/00'] as const;
export const FENCE_FRAME = 'fence/idle/00';
export const GROUND_FRAME = 'ground/idle/00';
export const CLOUD_FRAMES = ['cloud/a/00', 'cloud/b/00'] as const;
export const BIRD_FRAMES = ['bird/a/00', 'bird/b/00'] as const;
export const COW_FRAMES = { idle: 'cow/idle/00', happy: 'cow/happy/00' } as const;
export const PARTICLES = { puff: 'puff/idle/00', pop: 'pop/idle/00' } as const;
export const SURPRISE_FRAMES = {
  crossing: 'crossing/idle/00',
  /** The crossing's road (on the ground, under the train). */
  crossingRoad: 'crossing-road/idle/00',
  crossingWave: 'crossing/wave/00',
  bridge: 'bridge/idle/00',
  fish: 'fish/idle/00',
  hotAir: 'hot-air/idle/00',
  rainbow: 'rainbow/idle/00',
} as const;

export const ANCHORS = {
  engine: 'engine',
  chimney: 'chimney',
  nose: 'nose',
  tail: 'tail',
  platform: 'platform',
  friend: 'friend',
  dest: 'dest',
  tunnel: 'tunnel',
  tunnelEnd: 'tunnel-end',
  portal: 'portal',
  portalEdge: 'portal-edge',
  surprise: 'surprise',
  cow: 'cow',
} as const;
export const carAnchor = (n: number): string => `car-${n}`;
export const seatAnchor = (n: number): string => `seat-${n}`;
export const dropAnchor = (n: number): string => `drop-${n}`;
export const ENGINE_HIT = 'engine';
export const PLATFORM_HIT = 'platform';
export const carHit = (n: number): string => `car-${n}`;
export const friendHit = (f: FriendId): string => `friend-${f}`;
export const destHit = (d: DestinationId): string => `dest-${d}`;

/** What `train.layout.json` and `atlas.train` must hold. */
export function trainScreen(): ScreenRequirements {
  const n = Array.from({ length: FRIENDS_PER_TRIP }, (_, i) => i);
  return {
    anchors: [...Object.values(ANCHORS), ...n.flatMap((i) => [carAnchor(i), seatAnchor(i), dropAnchor(i)])],
    hits: [ENGINE_HIT, PLATFORM_HIT, ...n.map(carHit), ...FRIEND_IDS.map(friendHit), ...DESTINATION_IDS.map(destHit)],
    slots: [],
    frames: [
      ...ALL_ENGINE_FRAMES,
      ...CAR_COLOURS.flatMap((c) => [carFrame(c), carFrontFrame(c)]),
      ...FRIEND_IDS.flatMap((f) => [seatFrame(f), ...FRIEND_STATES.map((s) => friendFrame(f, s))]),
      ...DESTINATION_IDS.map(destFrame),
      PLATFORM_FRAME,
      ...Object.values(TUNNEL_FRAMES),
      ...HILL_FRAMES,
      ...TREE_FRAMES,
      FENCE_FRAME,
      GROUND_FRAME,
      ...CLOUD_FRAMES,
      ...BIRD_FRAMES,
      ...Object.values(COW_FRAMES),
      ...Object.values(PARTICLES),
      ...Object.values(SURPRISE_FRAMES),
    ],
  };
}

export const TRAIN_SCREEN: ScreenRequirements = trainScreen();
export const screen = TRAIN_SCREEN;

export const assets: GameAssets = {
  atlases: [ATLASES.train],
  images: [BACKGROUNDS.train],
  audio: [
    PROMPT_LINE,
    STATION_LINE,
    TUNNEL_LINE,
    PARENT_LINE,
    ...CAR_COLOURS.map(carLine),
    ...COUNT_LINES,
    ...FRIEND_IDS.map(boardLine),
    ...DESTINATION_IDS.map(destLine),
    ...FRIEND_IDS.map(callSfx),
    // The shell's pop and chirp are loaded by Boot for the whole session (never released with the game).
    ...new Set(Object.values(SFX).filter((id) => !id.startsWith('sfx.shell.'))),
  ],
};

/**
 * The scene's choreography (games/train/Train.ts): shares of each animation's time and small motion constants. The
 * durations themselves are Tokens.Timing.train*; these only split them.
 */
export const MOTION = {
  /** The ground strip is a little narrower than the screen (atlas padding): this many copies, overlapping by groundOverlapPx. */
  groundCopies: 3,
  groundOverlapPx: 1,
  /** How fast each layer scrolls, as a share of the ground's speed (far things are slower). */
  hillSpeed: 0.25,
  treeSpeed: 0.6,
  fenceSpeed: 1,
  /** The layers' spacing along the scroll (design px), how many of each pass in one loop, and how far outside the screen one wraps. */
  hillGapPx: 640,
  hills: 3,
  treeGapPx: 420,
  trees: 4,
  fenceGapPx: 560,
  fences: 3,
  wrapPadPx: 320,
  /** The running train bobs this much (design px) every wheel frame; each car is this many wheel frames behind the one in front. */
  bobPx: 2,
  carLag: 1,
  /** A tapped car wobbles ± this many degrees (twice). */
  wobbleDeg: 6,
  /** A boarding friend hops this high (design px) over its seat on its way into its car (its feet clear the cab's roof,
   * ~384: a lower hop went through the cab and Shiba); a friend getting off (it crosses the engine too: to the drop spots right of it), this high. */
  boardHopPx: 190,
  dropHopPx: 190,
  /** A puff from the chimney rises this far (design px) as it grows to this scale and fades. */
  puffRisePx: 80,
  puffScale: 1.8,
  /** The dim of the tunnel: its colour is colors.ink; its alpha follows how much of the train the hill covers. */
  /** The fish jumps this high (design px) out of the river as the bridge passes the engine; the surprise waves this much. */
  fishJumpPx: 90,
  waveDeg: 7,
  /** The hot-air balloon and the rainbow: where they show (shares of the screen), their scale, drift and fades. */
  hotAirX: 0.72,
  hotAirY: 0.24,
  hotAirScale: 0.75,
  rainbowX: 0.5,
  rainbowY: 0.36,
  driftPx: 140,
  driftFade: 0.2,
  /** A tapped cow hops this high; a tapped bird loops up this high (design px). */
  cowHopPx: 18,
  birdLoopPx: 30,
  /** A friend's happy move: this share of its time is kept after the hops (the hops share the rest). */
  friendFade: 0.15,
  /** The dropped friends wave this many times while the train leaves. */
  waves: 2,
  /** The tunnel's dim reaches this far past the design rect (a wider iPad shows more; design px). */
  dimBleedPx: 240,
  /** A dropped friend stands this much smaller than on its platform (in front of the destination); a hopping one at this share of it. */
  dropScale: 0.82,
  hopScale: 0.9,
  /** A boarding or dropping hop rises over this share of its time (then falls). */
  hopUp: 0.45,
  /** A puff from the chimney starts at this scale and alpha (reduced motion: it ends at puffReducedScale). */
  puffStart: 0.6,
  puffAlpha: 0.95,
  puffReducedScale: 0.8,
  /** A tapped car's wobble: this many swings share its time. */
  wobbleSwings: 4,
  /** A friend lands in its car: a little pop this far above its seat, at this scale, growing to popEnd; the car squashes to carSquash over this share of a tap. */
  popRisePx: 60,
  popScale: 0.6,
  popEnd: 0.9,
  carSquash: 0.94,
  carSquashShare: 0.2,
  /** The fish starts this share of its jump under the water, rises this share above it and tilts this many degrees up, then down. */
  fishDip: 0.4,
  fishRise: 0.6,
  fishUpDeg: -20,
  fishDownDeg: 25,
} as const;
