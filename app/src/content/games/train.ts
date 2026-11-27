// Tàu hỏa quanh đảo content (2026-11-13, spec-tau-quanh-dao; the game itself since 2026-11-12, spec-tau-hoa): the
// train game happens on Xoài's island. A ride on the map (content/stations › RIDES): a tap on the map's train zooms in
// on it and this game starts in the same view, closer. Free play: no rounds, no score, no right or wrong.
//   1. The toy train (the map's own engine and three cars: red, yellow, blue; the capped Shiba drives) waits where the
//      map's train stood (at Ga tàu when it was there). A tap on it: it toots and sets off round the island's track.
//   2. The camera follows it (games/train/camera.ts), so the real places of the island go by.
//   3. Little stations are named after the place beside them (Ga Xe kem, Ga Khủng long, Ga Hang, Ga Đường đua). At each
//      one a friend waits; a tap and it hops into the next empty car, the voice names it and counts.
//   4. The tunnel is the volcano: the scene dims gently and the train comes out with "Ú òa!".
//   5. After FRIENDS_PER_TRIP friends the train stops at a destination (the beach, the whale's bay, the fountain park);
//      a tap and the friends hop off and wave; the train sets off on the next trip.
// Taps any time: the engine (a puff and a toot), a car (it wobbles; the voice names its colour), a place the camera
// passes (its name: `vo.shell.station-name.<id>`, nothing else), the whale (it spouts).
// Art (tools/render/blender/build_train.py, from the built map; the same camera at 2× the map's resolution, so the
// layout's design coordinates are the map's): a plate in TILES, and frames `<sprite>/<state>/<nn>`:
//   - `train-engine/h<k>/00`, `train-car-<n>/h<k>/00` (the map's 8 heading frames, rendered at `anchor.train`);
//   - the FRONT_SPRITES (`<id>/idle/00` at `anchor.<id>`): drawn over the train by depth (core/map-rides' rail-back);
//     the crossing's barriers `crossing-near|far/up|down/00`;
//   - `friend-<f>/<idle|wave|happy>/00` (at `anchor.friend`), `seat-<f>/idle/00` (at `anchor.seat`), `whale/idle/00`,
//     `whale/spout/00…03` (at `anchor.whale`), `kart/idle/00` (at `anchor.kart`), and the free sprites `puff`, `pop`,
//     `boat`, `hot-air` (drawn by their trimmed centre).
// Layout: anchors stop-<station|dest>, friend-<station>, dest-<d>, drop-<d>-<n>, friend, seat, kart, whale, train, the
// tunnel and crossing anchors; hits platform-<station>, dest-<d>, whale and the PLACES; paths rail, rail-up, rail-back,
// compass. tools/layout/rules.ts › validateTrain checks the sizes on screen (the camera at every stop).
import { ATLASES, MAP_AMBIENT, MAP_RIDES, TRAIN_TILES, headingFrameName, stateFrameName } from '../assets.ts';
import type { ReactionSet } from '../../core/reactions.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

/** The friends: the chibi pen animals (cute.chibi). */
export const FRIEND_IDS = ['cat', 'pig', 'sheep', 'cow', 'horse', 'rooster'] as const;
export type FriendId = (typeof FRIEND_IDS)[number];
export function isFriend(id: unknown): id is FriendId {
  return typeof id === 'string' && (FRIEND_IDS as readonly string[]).includes(id);
}

/** The cars, from the engine back, each in its fixed colour (the map train's `train-car-1…3`). */
export const CAR_COLOURS = ['red', 'yellow', 'blue'] as const;
export type CarColour = (typeof CAR_COLOURS)[number];

/** The friend stations, in loop order (the train runs counter-clockwise seen from above): each is named after a map place. */
export const STATION_IDS = ['race', 'shadow-match', 'dino-puzzle', 'ice-cream'] as const;
export type StationId = (typeof STATION_IDS)[number];
export function isStation(id: unknown): id is StationId {
  return typeof id === 'string' && (STATION_IDS as readonly string[]).includes(id);
}

/** Where a trip ends. */
export const DESTINATION_IDS = ['beach', 'whale', 'fountain'] as const;
export type DestinationId = (typeof DESTINATION_IDS)[number];
export function isDestination(id: unknown): id is DestinationId {
  return typeof id === 'string' && (DESTINATION_IDS as readonly string[]).includes(id);
}

/** The small surprise each trip brings (one per trip, from a shuffle bag, never the same twice in a row). */
export const SURPRISE_IDS = ['kart', 'whale', 'boat', 'hot-air'] as const;
export type SurpriseId = (typeof SURPRISE_IDS)[number];
export function isSurprise(id: unknown): id is SurpriseId {
  return typeof id === 'string' && (SURPRISE_IDS as readonly string[]).includes(id);
}

/** Friends per trip: one per car; the destination comes after the last. */
export const FRIENDS_PER_TRIP = CAR_COLOURS.length;
/** A trip's friends are drawn from the bag in at most this many tries per friend (then filled from the list). */
export const DRAW_TRIES = 8;

/**
 * The map sprites drawn over the train (a camera ray to the track hits them first); build_train.py fails when the
 * island's geometry says otherwise. Every other place is baked into the plate.
 */
export const FRONT_SPRITES = ['dino-puzzle', 'rocket', 'shadow-match'] as const;
/** The scenery drawn over the train besides the FRONT_SPRITES: the volcano and the occluders (`occ-<n>`). */
export const OCCLUDER_COUNT = 4;
export const occluderId = (n: number): string => `occ-${n}`;

/** The places that say their name when tapped (their map hulls; `vo.shell.station-name.<id>`). */
export const PLACE_IDS = ['ice-cream', 'pizza', 'race', 'fishing', 'touch-talk', 'dino-puzzle', 'shadow-match', 'home', 'plane', 'rocket'] as const;
export type PlaceId = (typeof PLACE_IDS)[number];

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
  cat: { id: 'cat', label: 'Bạn mèo', boardLine: boardLine('cat'), callSfx: callSfx('cat'), move: { hops: 2, hopPx: 11, deg: 0, squash: 0.94 } },
  pig: { id: 'pig', label: 'Bạn lợn', boardLine: boardLine('pig'), callSfx: callSfx('pig'), move: { hops: 4, hopPx: 2, deg: 7, squash: 1 } },
  sheep: { id: 'sheep', label: 'Bạn cừu', boardLine: boardLine('sheep'), callSfx: callSfx('sheep'), move: { hops: 1, hopPx: 20, deg: 0, squash: 0.86 } },
  cow: { id: 'cow', label: 'Bạn bò', boardLine: boardLine('cow'), callSfx: callSfx('cow'), move: { hops: 2, hopPx: 3, deg: 5, squash: 0.97 } },
  horse: { id: 'horse', label: 'Bạn ngựa', boardLine: boardLine('horse'), callSfx: callSfx('horse'), move: { hops: 1, hopPx: 13, deg: -10, squash: 0.95 } },
  rooster: { id: 'rooster', label: 'Bạn gà', boardLine: boardLine('rooster'), callSfx: callSfx('rooster'), move: { hops: 3, hopPx: 7, deg: 4, squash: 0.92 } },
};

export interface Station {
  readonly id: StationId;
  /** The parent-facing name ("Ga Xe kem"). */
  readonly label: string;
  /** `vo.train.station.<id>` ("Ga Xe kem!"): said as the train stops there. */
  readonly line: string;
}

export const stationLine = (id: StationId): string => `vo.train.station.${id}`;
export const STATIONS: Readonly<Record<StationId, Station>> = {
  race: { id: 'race', label: 'Ga Đường đua', line: stationLine('race') },
  'shadow-match': { id: 'shadow-match', label: 'Ga Hang', line: stationLine('shadow-match') },
  'dino-puzzle': { id: 'dino-puzzle', label: 'Ga Khủng long', line: stationLine('dino-puzzle') },
  'ice-cream': { id: 'ice-cream', label: 'Ga Xe kem', line: stationLine('ice-cream') },
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
  whale: { id: 'whale', label: 'Vịnh cá voi', line: destLine('whale') },
  fountain: { id: 'fountain', label: 'Công viên đài phun nước', line: destLine('fountain') },
};

/** The question-seed slots of the scene's shuffle bags and of the model's own rng (core/rng › questionSeed). */
export const BAG_SEEDS = { friends: 1, destinations: 2, surprises: 3, world: 4, stations: 5 } as const;

/** FR30/FR31: nothing is ever "other"; the friend's happy move is its own. */
export const REACTIONS: ReactionSet = { correct: ['bounce'], choseOther: [] };

/**
 * Voice: the invitation (names Xoài; the idle hint and the Speaker prompt at the start), the waiting line (a friend is
 * waiting: the idle hint and the Speaker prompt at a station), each station's name, each friend's boarding line, the
 * counts (the pizza's "Một! Hai! Ba!"), the car colours, "Ú òa!" for the tunnel, each destination's line and the
 * parent line.
 */
export const PROMPT_LINE = 'vo.train.prompt';
export const WAIT_LINE = 'vo.train.station';
export const TUNNEL_LINE = 'vo.train.tunnel';
export const PARENT_LINE = 'vo.train.parent.1';
export const carLine = (c: CarColour): string => `vo.train.car.${c}`;
/** The n-th friend's count line (n = 1 … FRIENDS_PER_TRIP). */
export const countLine = (n: number): string => `vo.pizza.count.${n}`;
export const COUNT_LINES: readonly string[] = Array.from({ length: FRIENDS_PER_TRIP }, (_, i) => countLine(i + 1));
/** A place's name (the shell's station-name lines). */
export const placeLine = (id: PlaceId): string => `vo.shell.station-name.${id}`;

// --- frames, anchors, hits ------------------------------------------------------------------------------------------

/** The train pieces: the engine, then the cars (the map's sprites). */
export const PIECE_SPRITES: readonly string[] = [MAP_RIDES.engine, ...MAP_RIDES.cars];
export const HEADINGS = MAP_RIDES.headings;
export const pieceFrame = (piece: number, heading: number): string => headingFrameName(PIECE_SPRITES[piece] ?? MAP_RIDES.engine, heading);
export const FRIEND_STATES = ['idle', 'wave', 'happy'] as const;
export type FriendState = (typeof FRIEND_STATES)[number];
export const friendFrame = (f: FriendId, state: FriendState = 'idle'): string => `friend-${f}/${state}/00`;
export const seatFrame = (f: FriendId): string => `seat-${f}/idle/00`;
export const CROSSING_FRAMES = MAP_RIDES.crossings.flatMap((c) => [stateFrameName(c, 'up'), stateFrameName(c, 'down')]);
export const FRONT_FRAMES: readonly string[] = [
  stateFrameName(MAP_RIDES.volcano),
  ...Array.from({ length: OCCLUDER_COUNT }, (_, i) => stateFrameName(occluderId(i + 1))),
  ...FRONT_SPRITES.map((s) => stateFrameName(s)),
];
export const WHALE_FRAMES = { idle: MAP_AMBIENT.whale.idle, spout: MAP_AMBIENT.whale.spout } as const;
export const KART_FRAME = 'kart/idle/00';
export const FREE_FRAMES = { puff: 'puff/idle/00', pop: 'pop/idle/00', boat: 'boat/idle/00', hotAir: 'hot-air/idle/00' } as const;

export const ANCHORS = {
  train: 'train',
  friend: 'friend',
  seat: 'seat',
  kart: 'kart',
  whale: MAP_AMBIENT.whale.id,
  volcano: MAP_RIDES.volcano,
  tunnelIn: MAP_RIDES.anchors.tunnelIn,
  tunnelOut: MAP_RIDES.anchors.tunnelOut,
  crossingFrom: MAP_RIDES.anchors.crossingFrom,
  crossingTo: MAP_RIDES.anchors.crossingTo,
} as const;
export const stopAnchor = (id: StationId | DestinationId): string => `stop-${id}`;
export const friendAnchor = (s: StationId): string => `friend-${s}`;
export const destAnchor = (d: DestinationId): string => `dest-${d}`;
export const dropAnchor = (d: DestinationId, n: number): string => `drop-${d}-${n}`;
export const platformHit = (s: StationId): string => `platform-${s}`;
export const destHit = (d: DestinationId): string => `dest-${d}`;
export const WHALE_HIT = 'whale';
export const PATHS = { rail: 'rail', railUp: MAP_RIDES.railUp, railBack: MAP_RIDES.railBack, compass: MAP_RIDES.compass } as const;

/** What `train.layout.json` and `atlas.train` must hold. */
export function trainScreen(): ScreenRequirements {
  const n = Array.from({ length: FRIENDS_PER_TRIP }, (_, i) => i);
  return {
    anchors: [
      ...Object.values(ANCHORS),
      ...MAP_RIDES.crossings,
      ...Array.from({ length: OCCLUDER_COUNT }, (_, i) => occluderId(i + 1)),
      ...FRONT_SPRITES,
      ...STATION_IDS.flatMap((s) => [stopAnchor(s), friendAnchor(s)]),
      ...DESTINATION_IDS.flatMap((d) => [stopAnchor(d), destAnchor(d), ...n.map((k) => dropAnchor(d, k))]),
    ],
    hits: [...STATION_IDS.map(platformHit), ...DESTINATION_IDS.map(destHit), WHALE_HIT, ...PLACE_IDS],
    slots: [],
    frames: [
      ...PIECE_SPRITES.flatMap((_s, p) => Array.from({ length: HEADINGS }, (_v, h) => pieceFrame(p, h))),
      ...FRIEND_IDS.flatMap((f) => [seatFrame(f), ...FRIEND_STATES.map((s) => friendFrame(f, s))]),
      ...CROSSING_FRAMES,
      ...FRONT_FRAMES,
      WHALE_FRAMES.idle,
      ...WHALE_FRAMES.spout,
      KART_FRAME,
      ...Object.values(FREE_FRAMES),
    ],
  };
}

export const TRAIN_SCREEN: ScreenRequirements = trainScreen();
export const screen = TRAIN_SCREEN;

export const assets: GameAssets = {
  atlases: [ATLASES.train],
  images: [...TRAIN_TILES],
  audio: [
    PROMPT_LINE,
    WAIT_LINE,
    TUNNEL_LINE,
    PARENT_LINE,
    ...STATION_IDS.map(stationLine),
    ...CAR_COLOURS.map(carLine),
    ...COUNT_LINES,
    ...FRIEND_IDS.map(boardLine),
    ...DESTINATION_IDS.map(destLine),
    // The places' names (vo.shell.station-name.*) are Boot's: loaded for the whole session.
    ...FRIEND_IDS.map(callSfx),
    // The shell's pop and chirp are loaded by Boot for the whole session (never released with the game).
    ...new Set(Object.values(SFX).filter((id) => !id.startsWith('sfx.shell.'))),
  ],
};

/**
 * The scene's choreography (games/train/Train.ts): shares of each animation's time and small motion constants (design
 * px are world px: the camera zooms them `ui.trainZoom` ×). The durations are Tokens.Timing.train*; these only split
 * them.
 */
export const MOTION = {
  /** The running train bobs this much (design px) every bob step; each car is this many steps behind the one in front. */
  bobPx: 1,
  carLag: 1,
  /** A tapped car wobbles ± this many degrees (twice), over this many swings. */
  wobbleDeg: 6,
  wobbleSwings: 4,
  /** A boarding friend hops this high (design px) over its seat; a friend getting off, this high. */
  boardHopPx: 46,
  dropHopPx: 40,
  /** A hop rises over this share of its time (then falls); a hopping friend is drawn at this share of its size. */
  hopUp: 0.45,
  hopScale: 0.85,
  /** A puff from the chimney: it rises this far (design px) as it grows from puffStart to puffScale × and fades. */
  puffRisePx: 26,
  puffScale: 1.8,
  puffStart: 0.6,
  puffAlpha: 0.95,
  puffReducedScale: 0.8,
  /** The chimney is this high (design px at the local scale 1) over the engine's ground point. */
  chimneyPx: 30,
  /** A friend lands in its car: a little pop this far above its seat, at this scale, growing to popEnd; the car squashes. */
  popRisePx: 18,
  popScale: 0.6,
  popEnd: 0.9,
  carSquash: 0.94,
  carSquashShare: 0.2,
  /** A friend's happy move: this share of its time is kept after the hops. */
  friendFade: 0.15,
  /** The dropped friends wave this many times, tilting this much (they stay Timing.trainDropLingerMs, then fade). */
  waves: 2,
  waveDeg: 7,
  /** The tunnel's dim reaches this far past the design rect (screen px; a wider iPad shows more). */
  dimBleedPx: 240,
  /** The whale's spout frames, each this long (ms); the kart's driver bounces this high (design px). */
  spoutFrameMs: 160,
  kartHopPx: 6,
  /** The boat and the balloon drift this far (design px) across the view as they show. */
  driftPx: 90,
  driftFade: 0.2,
  /** The boat shows this far (design px) off the track's outer side, by the train; the balloon at this share of the view (x, y). */
  boatOutPx: 110,
  hotAirAt: { x: 0.72, y: 0.22 },
  /** Draw depths: the plate under everything; a seated friend just over its car; the particles, the hops and the balloon over every sprite; the dim over all. */
  depthPlate: -1000,
  /** A waiting friend is drawn over every sprite (a station's platform may stand behind the cave or the dinosaurs). */
  depthWaiting: 5000,
  seatOver: 0.01,
  depthParticle: 6000,
  depthDim: 9000,
  /** Tap priorities (the higher wins where tap areas overlap): a place, the whale, a train piece, the waiting friend or the destination. */
  tapZ: { place: 0, whale: 1, piece: 2, waiting: 3 },
} as const;
