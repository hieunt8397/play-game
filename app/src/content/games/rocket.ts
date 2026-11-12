// Tên lửa lên Mặt Trăng content (2026-11-12, spec-ten-lua): a yard game (content/home.ts corner `rocket`, "Tên lửa").
// Free play: no rounds, no score, no right or wrong. One trip:
//   1. Build: a launch pad at sunrise; three parts come one at a time (body, nose, fins), each offered in 2 colours in
//      two bubbles. A tap on a bubble: the part flies onto the rocket with a clank and a sparkle; the voice names the
//      colour. Shiba (in a round fishbowl helmet) waits by the pad.
//   2. Countdown: Shiba climbs in and waves through the porthole; "Ba! Hai! Một! Phóng!". A tap on the rocket (or the
//      count's end) launches it: toon flames, a volumetric smoke bank, a small rumble, liftoff.
//   3. Ascent: the camera rides with the rocket; clouds, birds and the little plane (a fox pilot waves) rush down; the
//      sky moves from sunrise through day blue and violet into indigo space with stars. A tap on the sky: a boost.
//   4. Space: the round Earth below ("Trái Đất, nhà của Xoài!"), the faceless Moon ahead, and one surprise drifts past.
//   5. Moon: the rocket lands with soft retro puffs; free play — the ground (Shiba jumps high and floats down), the
//      craters (an alien peeks out: "Ú òa!"), the rocks (a slow bounce), the Earth (it spins and twinkles), a flag with a
//      mango once a trip. A tap on the rocket (or enough Moon taps) flies home: a parachute and a soft landing on the
//      pad; the parts pop off and a new trip begins.
// Frames (one camera; `<sprite>/<state>/<nn>`): every frame is rendered where it stands at its step (full frame) and the
// scene moves it by its own offset (the pad world slides down on the ascent, the Moon rises on the landing):
//   - `body-<colour>/idle/00`, `nose-<colour>/idle/00`, `fins-<colour>/idle/00`: the parts on the pad (pivot
//     `anchor.rocket`, the nozzle's bottom); `pilot/<empty|idle|wave|happy>/00`: the porthole's glass, Shiba behind it;
//   - `flame/<a|b|c>/00` (pivot `anchor.rocket`), `glow/idle/00` (a white soft disc, tinted at runtime),
//     `smoke/<a|b|c>/00` (the launch bank growing; pivot `anchor.rocket`), `puff/idle/00`, `spark/idle/00`,
//     `star/<a|b>/00`, `parachute/idle/00` (pivot `anchor.rocket`);
//   - `astro/<idle|wave|jump|happy>/00` (ground pivot `anchor.astro`);
//   - the pad world: `lawn/idle/00`, `hills/idle/00`, `sun/idle/00`, `launchpad/idle/00` (their rendered place kept);
//     `cloud/<a|b>/00`, `bird/<a|b>/00`, `plane/<a|b>/00`, `bubble/idle/00` (placed by their trimmed centre);
//   - space: `earth/idle/00` (where it floats below the rocket), `moonfar/idle/00`, the surprises
//     (`comet/idle/00`, `ringed/idle/00`, `ufo/<idle|wave>/00`, `satellite/<a|b>/00`; placed by their centre);
//   - the Moon: `moon/idle/00` (the ground, its ridges and craters), `earthsmall/idle/00` (the Earth from the Moon),
//     `alien-<id>/<peek|wave>/00` (in crater 0, the ground cuts its lower half), `rock/idle/00` (on `anchor.rock-0`),
//     `flag/idle/00` (on `anchor.flag`).
// Layout: anchors rocket, fly, moon-rocket, porthole, astro, astro-moon, choice-<n>, earth, earth-moon, moonfar,
// crater-<n>, rock-<n>, flag, sun; hits rocket, moon-rocket, choice-<n>, earth, earth-moon, crater-<n>.
// tools/layout/rules.ts › validateRocket checks the sizes and that every tap area stays inside the interactive rect,
// off the Hud and apart.
import { ATLASES, BACKGROUNDS } from '../assets.ts';
import type { ReactionSet } from '../../core/reactions.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

/** The parts, in build order (each offered in 2 colours). */
export const PART_IDS = ['body', 'nose', 'fins'] as const;
export type PartId = (typeof PART_IDS)[number];

/** The colours a part comes in. */
export const COLOUR_IDS = ['red', 'yellow', 'blue', 'green', 'white'] as const;
export type ColourId = (typeof COLOUR_IDS)[number];
export function isColour(id: unknown): id is ColourId {
  return typeof id === 'string' && (COLOUR_IDS as readonly string[]).includes(id);
}

/** Every pair of two different colours (the choice's two bubbles), as `a+b` ids for the shuffle bag. */
export const PAIR_IDS: readonly string[] = COLOUR_IDS.flatMap((a, i) => COLOUR_IDS.slice(i + 1).map((b) => `${a}+${b}`));
export function pairOf(id: string): [ColourId, ColourId] {
  const [a, b] = id.split('+');
  if (!isColour(a) || !isColour(b)) throw new Error(`rocket: bad colour pair "${id}"`);
  return [a, b];
}

/** The surprise that drifts past in space (one per trip, from a shuffle bag, never the same twice in a row). */
export const SURPRISE_IDS = ['comet', 'ringed', 'ufo', 'satellite'] as const;
export type SurpriseId = (typeof SURPRISE_IDS)[number];
export function isSurprise(id: unknown): id is SurpriseId {
  return typeof id === 'string' && (SURPRISE_IDS as readonly string[]).includes(id);
}

/** The aliens who peek out of the Moon's craters (a shuffle bag; never the same one twice in a row). */
export const ALIEN_IDS = ['mint', 'peach', 'lilac'] as const;
export type AlienId = (typeof ALIEN_IDS)[number];

/** How Shiba jumps on the Moon (a shuffle bag: a high float, a slow spin, a float with a wave). */
export const JUMP_IDS = ['high', 'spin', 'wave'] as const;
export type JumpId = (typeof JUMP_IDS)[number];

/** The Moon's craters and rocks (tap targets). */
export const CRATERS = 3;
export const ROCKS = 2;
/** The two bubbles of a choice. */
export const CHOICES = 2;

/** Sounds: our own recipes (tools/audio/make-rocket.ts) and reused ones. */
export const SFX = {
  clank: 'sfx.rocket.clank',
  sparkle: 'sfx.rocket.sparkle',
  ignite: 'sfx.rocket.ignite',
  boost: 'sfx.rocket.boost',
  retro: 'sfx.rocket.retro',
  dust: 'sfx.rocket.dust',
  twinkle: 'sfx.rocket.twinkle',
  chute: 'sfx.rocket.chute',
  boing: 'sfx.rocket.boing',
  bloop: 'sfx.rocket.bloop',
  trill: 'sfx.rocket.trill',
  pop: 'sfx.garden.pop',
  chime: 'sfx.car-wash.chime',
  tap: 'sfx.shell.pop',
  chirp: 'sfx.shell.chirp',
} as const;

export interface Alien {
  readonly id: AlienId;
  readonly label: string;
  /** Its own sound as it peeks out. */
  readonly sfx: string;
}
export const ALIENS: Readonly<Record<AlienId, Alien>> = {
  mint: { id: 'mint', label: 'Bạn xanh bạc hà', sfx: SFX.boing },
  peach: { id: 'peach', label: 'Bạn cam đào', sfx: SFX.bloop },
  lilac: { id: 'lilac', label: 'Bạn tím', sfx: SFX.trill },
};

/** The model's small world constants (games/rocket/trip.ts). */
export const WORLD = {
  /** The Moon waits for this many taps before Shiba plants the flag (once a trip) and, after moonTaps, heads home. */
  flagAfter: 2,
  moonTaps: 8,
  /** Stars across the sky: how many, and the band they fill (shares of the screen). */
  stars: 28,
  starTop: 0.04,
  /** The stars' band across (left edge, width: shares of the screen). */
  starLeft: 0.04,
  starWidth: 0.92,
  /** The surprise's line is said this far into space (share of the step). */
  surpriseLineAt: 0.25,
  starBottom: 0.62,
  /** The ascent's passers-by, at these shares of the climb: two clouds, the birds, the plane, two more clouds. */
  passers: [
    { kind: 'cloud', at: 0.04, x: 0.22 },
    { kind: 'cloud', at: 0.12, x: 0.8 },
    { kind: 'birds', at: 0.22, x: 0.7 },
    { kind: 'plane', at: 0.36, x: 0.24 },
    { kind: 'cloud', at: 0.48, x: 0.74 },
    { kind: 'cloud', at: 0.6, x: 0.18 },
  ],
  /** A passer-by crosses the screen top to bottom over this share of the climb. */
  passSpan: 0.22,
  /** The surprise crosses space from right to left over this share of the space step, at this height (share of the screen). */
  surpriseSpan: 0.9,
  surpriseY: 0.3,
  /** A boost adds this share of the whole climb (it never overshoots). */
  boostShare: 0.08,
  /** Speeds and the model's clock. */
  msPerS: 1000,
} as const;

/** The question-seed slots of the scene's shuffle bags and of the model's own rng (core/rng › questionSeed). */
export const BAG_SEEDS = { pairs: 1, surprises: 2, aliens: 3, jumps: 4, world: 5 } as const;

/** FR30/FR31: nothing is ever "other". */
export const REACTIONS: ReactionSet = { correct: ['bounce'], choseOther: [] };

/**
 * Voice: the invitation (names Xoài; the idle hint and the Speaker prompt while building), each part's line as it is
 * offered, each colour as it is picked, the countdown (the pizza's "Ba! Hai! Một!" read backwards, then "Phóng!"),
 * the Earth, the Moon's arrival, the light jump, "Ú òa!" for a peeking alien, each surprise, going home, and the parent
 * line. Naming only: never a question, no praise.
 */
export const PROMPT_LINE = 'vo.rocket.prompt';
export const LAUNCH_LINE = 'vo.rocket.launch';
export const EARTH_LINE = 'vo.rocket.earth';
export const MOON_LINE = 'vo.rocket.moon';
export const LIGHT_LINE = 'vo.rocket.light';
export const PEEK_LINE = 'vo.rocket.peek';
export const HOME_LINE = 'vo.rocket.home';
export const PARENT_LINE = 'vo.rocket.parent.1';
export const partLine = (p: PartId): string => `vo.rocket.part.${p}`;
export const colourLine = (c: ColourId): string => `vo.rocket.colour.${c}`;
export const surpriseLine = (s: SurpriseId): string => `vo.rocket.surprise.${s}`;
/** The countdown's numbers: 3, 2, 1 (the pizza's counts). */
export const countLine = (n: number): string => `vo.pizza.count.${n}`;
export const COUNTDOWN_LINES: readonly string[] = [countLine(3), countLine(2), countLine(1)];

// --- frames, anchors, hits ------------------------------------------------------------------------------------------

export const partFrame = (p: PartId, c: ColourId): string => `${p}-${c}/idle/00`;
export const PILOT_STATES = ['empty', 'idle', 'wave', 'happy'] as const;
export type PilotState = (typeof PILOT_STATES)[number];
export const pilotFrame = (s: PilotState): string => `pilot/${s}/00`;
export const ASTRO_STATES = ['idle', 'wave', 'jump', 'happy'] as const;
export type AstroState = (typeof ASTRO_STATES)[number];
export const astroFrame = (s: AstroState): string => `astro/${s}/00`;
export const FLAME_FRAMES = ['flame/a/00', 'flame/b/00', 'flame/c/00'] as const;
export const SMOKE_FRAMES = ['smoke/a/00', 'smoke/b/00', 'smoke/c/00'] as const;
export const PARTICLES = { glow: 'glow/idle/00', puff: 'puff/idle/00', spark: 'spark/idle/00' } as const;
export const STAR_FRAMES = ['star/a/00', 'star/b/00'] as const;
export const PARACHUTE_FRAME = 'parachute/idle/00';
export const PAD_FRAMES = { lawn: 'lawn/idle/00', hills: 'hills/idle/00', sun: 'sun/idle/00', launchpad: 'launchpad/idle/00' } as const;
export const CLOUD_FRAMES = ['cloud/a/00', 'cloud/b/00'] as const;
export const BIRD_FRAMES = ['bird/a/00', 'bird/b/00'] as const;
export const PLANE_FRAMES = ['plane/a/00', 'plane/b/00'] as const;
export const BUBBLE_FRAME = 'bubble/idle/00';
export const EARTH_FRAME = 'earth/idle/00';
export const MOONFAR_FRAME = 'moonfar/idle/00';
export const SURPRISE_FRAMES = {
  comet: 'comet/idle/00',
  ringed: 'ringed/idle/00',
  ufo: 'ufo/idle/00',
  ufoWave: 'ufo/wave/00',
  satellite: 'satellite/a/00',
  satelliteFlap: 'satellite/b/00',
} as const;
export const MOON_FRAME = 'moon/idle/00';
/** The Earth seen from the Moon (small, top right). */
export const EARTH_SMALL_FRAME = 'earthsmall/idle/00';
export const ALIEN_STATES = ['peek', 'wave'] as const;
export type AlienState = (typeof ALIEN_STATES)[number];
export const alienFrame = (a: AlienId, s: AlienState): string => `alien-${a}/${s}/00`;
export const ROCK_FRAME = 'rock/idle/00';
export const FLAG_FRAME = 'flag/idle/00';

export const ANCHORS = {
  rocket: 'rocket',
  fly: 'fly',
  moonRocket: 'moon-rocket',
  porthole: 'porthole',
  astro: 'astro',
  astroMoon: 'astro-moon',
  earth: 'earth',
  earthMoon: 'earth-moon',
  moonfar: 'moonfar',
  flag: 'flag',
  sun: 'sun',
} as const;
export const choiceAnchor = (n: number): string => `choice-${n}`;
export const craterAnchor = (n: number): string => `crater-${n}`;
export const rockAnchor = (n: number): string => `rock-${n}`;
export const ROCKET_HIT = 'rocket';
export const MOON_ROCKET_HIT = 'moon-rocket';
export const EARTH_HIT = 'earth';
export const EARTH_MOON_HIT = 'earth-moon';
export const choiceHit = (n: number): string => `choice-${n}`;
export const craterHit = (n: number): string => `crater-${n}`;

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** What `rocket.layout.json` and `atlas.rocket` must hold. */
export function rocketScreen(): ScreenRequirements {
  return {
    anchors: [...Object.values(ANCHORS), ...range(CHOICES).map(choiceAnchor), ...range(CRATERS).map(craterAnchor), ...range(ROCKS).map(rockAnchor)],
    hits: [ROCKET_HIT, MOON_ROCKET_HIT, EARTH_HIT, EARTH_MOON_HIT, ...range(CHOICES).map(choiceHit), ...range(CRATERS).map(craterHit)],
    slots: [],
    frames: [
      ...PART_IDS.flatMap((p) => COLOUR_IDS.map((c) => partFrame(p, c))),
      ...PILOT_STATES.map(pilotFrame),
      ...ASTRO_STATES.map(astroFrame),
      ...FLAME_FRAMES,
      ...SMOKE_FRAMES,
      ...Object.values(PARTICLES),
      ...STAR_FRAMES,
      PARACHUTE_FRAME,
      ...Object.values(PAD_FRAMES),
      ...CLOUD_FRAMES,
      ...BIRD_FRAMES,
      ...PLANE_FRAMES,
      BUBBLE_FRAME,
      EARTH_FRAME,
      EARTH_SMALL_FRAME,
      MOONFAR_FRAME,
      ...Object.values(SURPRISE_FRAMES),
      MOON_FRAME,
      ...ALIEN_IDS.flatMap((a) => ALIEN_STATES.map((s) => alienFrame(a, s))),
      ROCK_FRAME,
      FLAG_FRAME,
    ],
  };
}

export const ROCKET_SCREEN: ScreenRequirements = rocketScreen();
export const screen = ROCKET_SCREEN;

export const assets: GameAssets = {
  atlases: [ATLASES.rocket],
  images: [BACKGROUNDS.rocket],
  audio: [
    PROMPT_LINE,
    LAUNCH_LINE,
    EARTH_LINE,
    MOON_LINE,
    LIGHT_LINE,
    PEEK_LINE,
    HOME_LINE,
    PARENT_LINE,
    ...PART_IDS.map(partLine),
    ...COLOUR_IDS.map(colourLine),
    ...SURPRISE_IDS.map(surpriseLine),
    ...COUNTDOWN_LINES,
    // The shell's pop and chirp are loaded by Boot for the whole session (never released with the game).
    ...new Set(Object.values(SFX).filter((id) => !id.startsWith('sfx.shell.'))),
  ],
};

/**
 * The scene's choreography (games/rocket/Rocket.ts): shares of each animation's time and small motion constants. The
 * durations themselves are Tokens.Timing.rocket*; these only split them.
 */
export const MOTION = {
  /** A picked part flies from its bubble onto the rocket: it rises this high (design px) on the way, then clanks down. */
  fitArcPx: 90,
  /** The bubbles bob ± this (design px); a picked bubble pops to this scale. */
  bubbleBobPx: 6,
  bubblePop: 1.25,
  /** A part shown in its bubble is drawn at this share of its size on the rocket. */
  choiceScale: 0.7,
  /** The sparkles of a fitted part: how many, how far they fly (design px). */
  sparkles: 5,
  sparkleFlyPx: 70,
  /** The flame flickers through its frames this often (ms per frame; under 3 Hz per frame swap is not needed: it is small). */
  flameFrameMs: 90,
  /** The flame's glow pulses between these alphas at ≤ 2 Hz (rocketGlowPulseMs per half cycle). */
  glowLow: 0.55,
  glowHigh: 0.85,
  /** The flame's glow is this many times the rocket's width; its tint. */
  glowScale: 2.2,
  /** The launch's smoke bank: it grows to this scale and drifts this far sideways (design px) before it fades. */
  smokeEndScale: 1.25,
  smokeDriftPx: 60,
  /** The launch rumble (design px; off under reduced motion). */
  rumblePx: 5,
  /** On the pad the rocket lifts this far (design px) before the world starts to slide (the rocket's flight height). */
  embers: 10,
  emberFlyPx: 120,
  /** The ascent: the pad world slides down by this many screens over the climb's first share (then it is gone). */
  padSlideShare: 0.35,
  /** The rocket sways ± this many degrees while it climbs (off under reduced motion). */
  swayDeg: 3,
  /** A boost: the rocket jumps up this far (design px) and the flame grows to this scale for a moment. */
  boostLiftPx: 18,
  boostFlame: 1.5,
  /** The Earth slides up from below this far (design px) as space opens; the far Moon grows to this scale. */
  earthRisePx: 260,
  moonfarGrow: 1.35,
  /** The landing: the Moon's ground rises from this far below (design px); the retro puffs, how many. */
  moonRisePx: 420,
  retroPuffs: 4,
  /** The stars twinkle between these alphas. */
  starLow: 0.45,
  starHigh: 1,
  /** A tapped star (or the Earth) spins this much (degrees) and grows to this scale. */
  earthSpinDeg: 25,
  tapGrow: 1.3,
  /** Shiba's Moon jump: this high (design px); the spin jump turns this many degrees. */
  jumpPx: 200,
  spinDeg: 360,
  /** A peeking alien rises this far (design px) out of its crater, then sinks back. */
  peekPx: 90,
  /** A tapped rock bounces this high (design px), slowly. */
  rockHopPx: 60,
  /** The parachute opens from this scale; the return's fall drifts this far sideways (design px). */
  chuteFrom: 0.2,
  driftPx: 40,
  /** The dust ring under a landing: this many puffs, this wide (design px). */
  dustPuffs: 6,
  dustSpreadPx: 90,
  /** A puff starts at this scale and alpha, grows to puffEnd and fades. */
  puffStart: 0.6,
  puffAlpha: 0.9,
  puffEnd: 1.6,
  /** A part pops off at the trip's end: it hops this high (design px) and fades. */
  unpackHopPx: 70,
  /** The plane cameo, the birds: how far they wave (degrees). */
  waveDeg: 8,
} as const;

/**
 * The scene's own small numbers (games/rocket/Rocket.ts), named: the sky's runtime gradient, when the plate and the
 * stars fade in, the passers-by, the stars' pulse, and the shares and offsets of each motion. Shares split a
 * Tokens.Timing.rocket* duration; px are design px.
 */
export const SCENE = {
  /** The sky gradient's canvas (a thin strip, stretched) and how much the phase moves before it is repainted. */
  skyTexW: 4,
  skyTexH: 256,
  skyRedraw: 0.004,
  /** The sky's middle stop (share of its height); the phases of the four palettes (sunrise, day, violet, space). */
  skyMid: 0.55,
  skyStops: [0, 0.35, 0.7, 1],
  /** The space plate fades in from this sky phase; the stars between these. */
  plateFrom: 0.72,
  starsFrom: 0.55,
  starsTo: 0.92,
  /** A rock's tap centre sits this far above its ground pivot; below this share of the height the Moon is ground. */
  rockTapLiftPx: 20,
  horizonShare: 0.62,
  /** The flame's glow centre below the nozzle and its radius; the sun's glow radius and alpha (runtime soft glows: the atlas trims baked ones). */
  glowBelowPx: 70,
  flameGlowPx: 150,
  sunGlowPx: 230,
  sunGlowAlpha: 0.75,
  /** The runtime soft glow texture: its size and its gradient (alpha at the middle stop). */
  glowTexPx: 256,
  glowMidStop: 0.45,
  glowMidAlpha: 0.35,
  /** Where a sprite waits off screen. */
  offscreenPx: -1000,
  /** The near and far clouds' scales; each bird of the flock this much smaller, this far behind (x) and up or down (y). */
  cloudNear: 1.2,
  cloudFar: 0.9,
  birdShrink: 0.12,
  birdSpreadX: 70,
  birdSpreadY: 40,
  /** Every this-many-th star is a big sparkle; the small ones' scales; the pulse (scale, beats of the glow, stagger). */
  bigStarEvery: 3,
  smallStar: 0.7,
  smallStarStep: 0.1,
  starPulse: 0.8,
  starPulseBeats: 4,
  starStaggerMs: 120,
  starStaggers: 5,
  /** The pad world is gone below the screen at this many screen heights (and hidden past padHidden). */
  padGone: 1.2,
  padHidden: 1.15,
  /** A passer-by starts and ends this far outside the screen (top and bottom). */
  passMarginPx: 160,
  /** The surprise's path across space: x from this share of the width, over this many widths; parked off screen; its rock. */
  surpriseFrom: 1.15,
  surpriseSpan: 1.3,
  surpriseHidePx: -500,
  surpriseRockDeg: 6,
  surpriseRockMs: 900,
  /** Below this the flame is out; the bird and plane frames swap this often; the climb's sway period. */
  flameOff: 0.01,
  flapMs: 380,
  swayMs: 600,
  /** The bubbles: they pop in from this scale, one this much after the other; their bob (ms, stagger, delay). */
  popFrom: 0.2,
  popStaggerMs: 120,
  bobMs: 900,
  bobStaggerMs: 150,
  bobDelayMs: 600,
  /** A pick: the other bubble shrinks to this; the bubbles fade over this share; the rocket's click (scale, ms). */
  otherBubble: 0.6,
  bubbleFade: 0.4,
  clickSquash: 0.97,
  clickMs: 90,
  /** An arc (a flying part, Shiba boarding): the rise takes this share. */
  arcUp: 0.45,
  /** Sparkles: their first angle, their scale and end scale. */
  sparkAngle: 0.4,
  sparkScale: 0.6,
  sparkEnd: 0.4,
  /** Boarding: the sparkles at the porthole; Shiba shrinks to this, fades to this, hops this high, lands this far below the porthole. */
  boardSparks: 4,
  boardShrink: 0.35,
  boardFade: 0.2,
  boardHopPx: 160,
  boardDropPx: 60,
  /** A countdown beat: the rocket stretches to this for this long. */
  beatStretch: 1.03,
  beatMs: 120,
  /** The launch: the flame comes in over this share; the rumble's cap; the smoke frames' stagger; the last one lingers this much longer, fades in over this share and out from this share; how often a smoke frame follows the sliding pad (ms). */
  flameIn: 0.2,
  rumbleMaxMs: 800,
  smokeStagger: 0.12,
  smokeLinger: 1.6,
  smokeFadeIn: 0.2,
  smokeFadeAt: 0.55,
  followMs: 16,
  /** Embers: from this far under the nozzle, at this scale, over this arc (from, span: shares of a half turn), this much wider than high, starting after this share, living this many sparks. */
  emberDropPx: 20,
  emberScale: 0.35,
  emberArcFrom: 0.15,
  emberArcSpan: 0.7,
  emberWide: 1.4,
  emberDelay: 0.1,
  emberLife: 1.4,
  /** The liftoff starts after this share of the launch. */
  liftDelay: 0.3,
  /** A boost's sparkles: this far under the rocket, this many. */
  boostSparkPx: 40,
  boostSparks: 3,
  /** Space: the Earth rises over this share; the far Moon glows in over this share. */
  earthRise: 0.35,
  moonFarIn: 0.4,
  /** The landing: the Earth goes over this share, the Moon rises over this, the small Earth shows from this share over this; the flame drops to this over this share; the rocket straightens over this; the retro puffs start at this share, one every this share, this far apart (x) and below. */
  landEarthOut: 0.6,
  landMoonIn: 0.85,
  landSmallAt: 0.4,
  landSmallIn: 0.6,
  landFlame: 0.45,
  landFlameIn: 0.4,
  landTurn: 0.3,
  retroAt: 0.35,
  retroStep: 0.15,
  retroSpreadPx: 30,
  retroDropPx: 10,
  /** Shiba hops out of the rocket from this far right and up, over this share of a jump. */
  hopOutX: 60,
  hopOutY: 120,
  hopOutShare: 0.6,
  /** A puff rises this far; a dust ring's puffs rise this little and are this much smaller. */
  puffRisePx: 20,
  dustRisePx: 12,
  dustScale: 0.8,
  /** Shiba's jump: the rise takes this share; the spin this share. */
  jumpUp: 0.3,
  spinShare: 0.9,
  /** An alien's peek: it grows out over this share, waves over this, waits this, sinks over this; sparkles this far above, this many. A flat scale. */
  peekGrow: 0.25,
  peekWave: 0.12,
  peekHold: 0.2,
  peekSparkPx: 80,
  peekSparks: 3,
  flat: 0.01,
  /** The Earth's tap: it grows by this share of tapGrow; sparkles (this many; from space, at this height). */
  earthGrow: 0.3,
  earthSparks: 5,
  earthSparkY: 600,
  /** A star's twinkle turns this much; the ufo waves and the satellite flaps this long; the surprise's sparkles. */
  twinkleDeg: 45,
  ufoWaveMs: 900,
  satFlapMs: 600,
  surpriseSparks: 4,
  /** The flag's sparkles (this far right and up, this many); Shiba waves this many flag times. */
  flagSparkX: 30,
  flagSparkY: 120,
  flagSparks: 5,
  flagWave: 1.5,
  /** Home: Shiba hops in over this share (this far above the rocket, shrinking to this); the flame comes in over this; the liftoff (this share, this high); the descent (this share, after this); the Moon falls over this; the small Earth grows to this and drops this many screens over this share; the parachute at this share opens over this; the pad rises over this. */
  homeHop: 0.15,
  homeHopUpPx: 150,
  homeShrink: 0.4,
  homeFlameIn: 0.1,
  homeLift: 0.3,
  homeLiftPx: 60,
  homeDescend: 0.55,
  homeDescendDelay: 0.15,
  homeMoonOut: 0.3,
  homeEarthGrow: 2.4,
  homeEarthDrop: 0.8,
  homeEarthShare: 0.45,
  homeChuteAt: 0.45,
  chuteOpen: 0.15,
  padRise: 0.55,
  /** The unpack: a part every this share, popping off over this; this many sparkles; Shiba fades in over this. */
  unpackStep: 0.25,
  unpackHop: 0.3,
  unpackSparks: 3,
  astroIn: 0.4,
  /** The countdown's first number. */
  countFrom: 3,
} as const;

/** A smoothstep from a to b. */
export function smoothstep(a: number, b: number, x: number): number {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}

/** `#RRGGBB` between two `#RRGGBB` colours (t = 0: a, 1: b). */
export function mixHex(a: string, b: string, t: number): string {
  const ch = (s: string, i: number): number => parseInt(s.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** A `#RRGGBB` colour with an alpha, as a CSS colour (a canvas gradient stop). */
export function mixAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}

/** The sky's top, middle and bottom colours at a phase (0 sunrise … 1 space), from art.rocket. */
export function skyAt(phase: number, art: Readonly<Record<string, { readonly css: string }>>): { top: string; mid: string; low: string } {
  const c = (k: string): string => art[k]!.css;
  const pal = [
    { top: c('dawnTop'), mid: c('dawnMid'), low: c('dawnLow') },
    { top: c('dayTop'), mid: mixHex(c('dayTop'), c('dayLow'), 0.5), low: c('dayLow') },
    { top: c('violetTop'), mid: mixHex(c('violetTop'), c('violetLow'), 0.5), low: c('violetLow') },
    { top: c('spaceDeep'), mid: c('spaceMid'), low: c('spaceLow') },
  ];
  const at = SCENE.skyStops;
  let i = 0;
  while (i < at.length - 2 && phase > at[i + 1]!) i++;
  const k = smoothstep(at[i]!, at[i + 1]!, phase);
  const a = pal[i]!;
  const b = pal[i + 1]!;
  return { top: mixHex(a.top, b.top, k), mid: mixHex(a.mid, b.mid, k), low: mixHex(a.low, b.low, k) };
}
