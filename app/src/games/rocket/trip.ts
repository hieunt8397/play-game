// Tên lửa lên Mặt Trăng trip model (2026-11-12, spec-ten-lua), pure and Phaser-free: free play, no score, no timer, no
// right or wrong. Behind injected ports (audio, view) so every rule is node-testable; the scene clock drives `tick`.
// Phases of one trip:
//   build     → a part (body, nose, fins in order) is offered in 2 colours; `tapChoice(n)` picks one (never wrong);
//   fit       → the part flies onto the rocket (`fitMs`, taps on the bubbles ignored); the voice names the colour;
//               then the next part's bubbles come (`nextPartMs`) or, after the fins, Shiba boards;
//   board     → Shiba hops into the rocket and waves through the porthole (`boardMs`);
//   countdown → "Ba! Hai! Một!" (`countMs` each); a tap on the rocket launches at once, else the count's end does;
//   launch    → "Phóng!": flames, smoke, rumble, liftoff to the flight height (`launchMs`; longer than `skipOverMs`, so
//               any tap hurries it to its end);
//   ascent    → the climb: `alt` goes 0 → 1 over `ascentMs`; a tap on the sky (`boost`) adds `boostShare`; the sky
//               (`sky`, 0 sunrise … 1 space) follows `alt`; the passers-by (clouds, birds, the plane) are the scene's;
//   space     → the Earth below ("Trái Đất, nhà của Xoài!"), the trip's surprise crossing from right to left
//               (`spaceMs`); then
//   land      → the Moon rises and the rocket settles with retro puffs (`landMs`; hurried by a tap);
//   moon      → free play, no timer: the ground (Shiba jumps, from a bag: high, spin, wave), a crater (an alien peeks
//               out, from a bag), a rock (a slow bounce), the Earth (it spins); the flag once a trip after `flagAfter`
//               taps; after `moonTaps` taps (or a tap on the rocket) the trip goes home;
//   home      → liftoff, the Earth grows, the parachute, the soft landing on the pad (`returnMs`; hurried by a tap);
//   unpack    → the parts pop off (`unpackMs`), and a new trip begins at build.
// Nothing ever fails; nothing is ever wrong. Home keeps a snapshot only while a part is on the rocket and the trip
// is not on its way home (`hasProgress`). The partial is `{ step, colours, surprise, flag }`: step 'build' (1–2 parts
// fitted), 'pad' (the rocket built: it resumes at the countdown) or 'moon'; `resumeTrip` validates it.
import {
  ALIEN_IDS,
  COLOUR_IDS,
  CRATERS,
  JUMP_IDS,
  PART_IDS,
  ROCKS,
  SCENE,
  SURPRISE_IDS,
  WORLD,
  isColour,
  isSurprise,
  pairOf,
  type AlienId,
  type ColourId,
  type JumpId,
  type PartId,
  type SurpriseId,
} from '../../content/games/rocket.ts';
import type { Point } from '../../content/layout-types.ts';
import { Tokens } from '../../core/tokens.ts';

export interface TripAudio {
  sfx(id: string): void;
  say(id: string): number;
  sayChain(ids: readonly string[]): number;
  setPrompt(id: string): void;
}

/** What the idle hint bounces: the bubbles while building, Shiba on the Moon. */
export type HintTarget = 'choice' | 'moon';

/** What a press in the world touched (the bubbles, the rocket, the craters and the Earth are the scene's hulls). */
export type PressHit = 'none' | 'boost' | 'star' | 'surprise' | 'rock' | 'ground';

/** A trip shown at once (a resumed start). */
export interface TripState {
  readonly step: TripStep;
  readonly colours: readonly ColourId[];
  readonly flag: boolean;
}

export interface TripView {
  /** A part is offered: its two colours in the two bubbles. */
  offer(part: PartId, pair: readonly [ColourId, ColourId]): void;
  /** The picked part flies from bubble `choice` onto the rocket over `ms`. */
  fit(part: PartId, colour: ColourId, choice: number, ms: number): void;
  /** Shiba hops into the rocket (over `ms`). */
  board(ms: number): void;
  /** The countdown shows `n` (3, 2, 1). */
  count(n: number): void;
  /** Ignition and liftoff (over `ms`). */
  launch(ms: number): void;
  /** A tap hurried the running launch, landing or return: it jumps to its end. */
  skip(): void;
  /** The climb begins (the scene reads `alt` and `sky` each frame). */
  ascent(): void;
  boost(): void;
  /** Space: the Earth below, the trip's surprise crossing over `ms`. */
  space(surprise: SurpriseId, ms: number): void;
  /** The Moon rises and the rocket lands (over `ms`). */
  land(ms: number): void;
  /** The rocket stands on the Moon; Shiba hops out. */
  moon(): void;
  jump(kind: JumpId): void;
  peek(crater: number, alien: AlienId): void;
  rock(n: number): void;
  earth(): void;
  star(n: number): void;
  surpriseTapped(surprise: SurpriseId): void;
  flag(): void;
  /** The trip home (over `ms`). */
  home(ms: number): void;
  /** The parts pop off the rocket (over `ms`). */
  unpack(ms: number): void;
  hint(target: HintTarget): void;
  /** A resumed trip shows at once. */
  restore(state: TripState): void;
}

export interface TripTimings {
  readonly fitMs: number;
  readonly nextPartMs: number;
  readonly boardMs: number;
  readonly countMs: number;
  readonly launchMs: number;
  readonly skipOverMs: number;
  readonly ascentMs: number;
  readonly spaceMs: number;
  readonly landMs: number;
  readonly returnMs: number;
  readonly unpackMs: number;
  readonly boostMs: number;
  readonly jumpMs: number;
  readonly peekMs: number;
  readonly rockMs: number;
  readonly earthSpinMs: number;
  readonly flagMs: number;
  readonly tapGapMs: number;
  readonly idleHintMs: number;
  readonly hintMax: number;
  readonly maxDtMs: number;
}

export function defaultTripTimings(): TripTimings {
  const t = Tokens.Timing;
  return {
    fitMs: t.rocketFitMs,
    nextPartMs: t.rocketNextPartMs,
    boardMs: t.rocketBoardMs,
    countMs: t.rocketCountMs,
    launchMs: t.rocketLaunchMs,
    skipOverMs: t.rocketSkipOverMs,
    ascentMs: t.rocketAscentMs,
    spaceMs: t.rocketSpaceMs,
    landMs: t.rocketLandMs,
    returnMs: t.rocketReturnMs,
    unpackMs: t.rocketUnpackMs,
    boostMs: t.rocketBoostMs,
    jumpMs: t.rocketJumpMs,
    peekMs: t.rocketPeekMs,
    rockMs: t.rocketRockMs,
    earthSpinMs: t.rocketEarthSpinMs,
    flagMs: t.rocketFlagMs,
    tapGapMs: t.rocketTapGapMs,
    idleHintMs: t.rocketIdleHintMs,
    hintMax: Tokens.ui.rocketHintMax,
    maxDtMs: t.rocketMaxTickMs,
  };
}

/** Where things are (design px). */
export interface TripGeometry {
  readonly width: number;
  readonly height: number;
  /** The rocks on the Moon (their tap centres). */
  readonly rocks: readonly Point[];
  /** Below this the Moon is ground (a press there makes Shiba jump). */
  readonly horizonY: number;
  readonly tapRadiusPx: number;
}

// --- the shuffle bags -----------------------------------------------------------------------------------------

function shuffle<T>(xs: readonly T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** A shuffled bag: each draw takes the next id that is not the last one (never the same twice in a row); it refills. */
export interface ShuffleBag<T extends string> {
  draw(): T;
  /** `id` was shown without a draw (a resumed trip): the next draw is not it. */
  note(id: T): void;
  readonly last: T | undefined;
}

export function createShuffleBag<T extends string>(ids: readonly T[], rng: () => number): ShuffleBag<T> {
  if (ids.length === 0) throw new Error('rocket: an empty shuffle bag');
  let bag: T[] = [];
  let last: T | undefined;
  return {
    draw() {
      let i = bag.findIndex((id) => id !== last);
      if (i < 0) {
        bag = [...bag, ...shuffle(ids, rng)];
        i = bag.findIndex((id) => id !== last);
      }
      const id = bag.splice(Math.max(0, i), 1)[0]!;
      last = id;
      return id;
    },
    note(id) {
      last = id;
    },
    get last() {
      return last;
    },
  };
}

// --- the controller -------------------------------------------------------------------------------------------

export type TripPhase = 'build' | 'fit' | 'board' | 'countdown' | 'launch' | 'ascent' | 'space' | 'land' | 'moon' | 'home' | 'unpack';
export type TripStep = 'build' | 'pad' | 'moon';

export interface TripPartial {
  step: string;
  colours: string[];
  surprise: string;
  flag: boolean;
}

export interface TripResume {
  readonly step: TripStep;
  readonly colours: readonly ColourId[];
  readonly surprise: SurpriseId;
  readonly flag: boolean;
}

export interface TripLines {
  readonly prompt: string;
  readonly part: (p: PartId) => string;
  readonly colour: (c: ColourId) => string;
  /** The countdown's number (3, 2, 1). */
  readonly count: (n: number) => string;
  readonly launch: string;
  readonly earth: string;
  readonly surprise: (s: SurpriseId) => string;
  readonly moon: string;
  readonly light: string;
  readonly peek: string;
  readonly home: string;
}

export interface TripSounds {
  readonly clank: string;
  readonly sparkle: string;
  readonly ignite: string;
  readonly boost: string;
  readonly retro: string;
  readonly dust: string;
  readonly twinkle: string;
  readonly chute: string;
  readonly pop: string;
  readonly chime: string;
  readonly alien: (a: AlienId) => string;
}

export interface TripBags {
  readonly pairs: ShuffleBag<string>;
  readonly surprises: ShuffleBag<SurpriseId>;
  readonly aliens: ShuffleBag<AlienId>;
  readonly jumps: ShuffleBag<JumpId>;
}

export interface TripOptions {
  readonly bags: TripBags;
  /** The world's own draws in [0, 1): the stars. */
  readonly rng: () => number;
  readonly geometry: TripGeometry;
  readonly resume?: TripResume | null | undefined;
  readonly lines: TripLines;
  readonly sounds: TripSounds;
  readonly audio: TripAudio;
  readonly view: TripView;
  readonly timings?: Partial<TripTimings> | undefined;
}

export interface TripProgress {
  readonly questionIndex: number;
  readonly partial: TripPartial;
}

export interface TripController {
  start(): void;
  /** A tap on bubble `n` while a part is offered: true when it picked. */
  tapChoice(n: number): boolean;
  /** A tap on the rocket: launches during the countdown, goes home on the Moon (true when it did). */
  tapRocket(): boolean;
  /** A tap on crater `n` on the Moon: an alien peeks out (true when it reacted). */
  tapCrater(n: number): boolean;
  /** A tap on the Earth (from space or the Moon): it spins. */
  tapEarth(): boolean;
  /** A press anywhere else: a boost in the climb, a star or the surprise in space, a rock or the ground on the Moon. */
  press(p: Point): PressHit;
  /** Any press: the idle clock restarts; a long launch, landing or return hurries to its end. */
  anyTap(): void;
  tick(dtMs: number): void;
  stop(): void;
  progress(): TripProgress;
  readonly phase: TripPhase;
  /** The part being offered (0 … 2) and its pair; the colours fitted so far. */
  readonly part: number;
  readonly pair: readonly [ColourId, ColourId];
  readonly colours: readonly ColourId[];
  readonly surprise: SurpriseId;
  /** The climb (0 … 1) and the sky (0 sunrise … 1 space). */
  readonly alt: number;
  readonly sky: number;
  /** How far the surprise has crossed space (0 … 1; −1 when it is not there). */
  readonly surpriseK: number;
  /** The stars (design px; they fill the sky's upper band). */
  readonly stars: readonly Point[];
  readonly flagged: boolean;
  readonly moonTaps: number;
  /** A part is on the rocket and the trip is not on its way home: Home keeps it to resume. */
  readonly hasProgress: boolean;
  /** An animation runs that ignores the taps it would answer. */
  readonly busy: boolean;
}

const clamp01 = (k: number): number => Math.max(0, Math.min(1, k));

export function createTripController(opts: TripOptions): TripController {
  const t = { ...defaultTripTimings(), ...opts.timings };
  const g = opts.geometry;
  const { audio, view, rng, bags } = opts;
  const r = opts.resume ?? null;

  let colours: ColourId[] = r ? [...r.colours] : [];
  let surprise: SurpriseId = r ? r.surprise : bags.surprises.draw();
  if (r) bags.surprises.note(r.surprise);
  let flagged = r ? r.flag : false;
  let pair: [ColourId, ColourId] = pairOf(bags.pairs.draw());
  let phase: TripPhase = 'build';
  let alt = 0;
  let sky = 0;
  let surpriseT = -1;
  let moonTaps = 0;
  let said = { light: false };
  let now = 0;
  let busyUntil = 0;
  let skipEnd = 0;
  let skippable = false;
  let homeT = -1;
  let countN = 0;
  let boostAt = -Infinity;
  const craterAt: number[] = Array.from({ length: CRATERS }, () => -Infinity);
  const rockAt: number[] = Array.from({ length: ROCKS }, () => -Infinity);
  let earthAt = -Infinity;
  let surpriseAt = -Infinity;
  const starAt: number[] = [];
  let idleMs = 0;
  let hints = 0;
  let stopped = false;
  let queue: { at: number; fn: () => void }[] = [];
  /** The surprise's line is said once a trip, as it comes in. */
  let surpriseSaid = false;
  const stars: Point[] = Array.from({ length: WORLD.stars }, () => ({
    x: g.width * (WORLD.starLeft + WORLD.starWidth * rng()),
    y: g.height * (WORLD.starTop + (WORLD.starBottom - WORLD.starTop) * rng()),
  }));
  for (let i = 0; i < stars.length; i++) starAt.push(-Infinity);

  const after = (ms: number, fn: () => void): void => {
    queue.push({ at: now + ms, fn });
    queue.sort((a, b) => a.at - b.at);
  };
  const runDue = (): void => {
    while (queue.length > 0 && queue[0]!.at <= now && !stopped) queue.shift()!.fn();
  };
  const isBusy = (): boolean => now < busyUntil;
  const busyFor = (ms: number): void => {
    busyUntil = Math.max(busyUntil, now + ms);
  };
  const part = (): PartId => PART_IDS[Math.min(PART_IDS.length - 1, colours.length)]!;
  const stepLine = (): string => (phase === 'moon' ? opts.lines.moon : opts.lines.part(part()));
  const step = (): void => {
    hints = 0;
    idleMs = 0;
    audio.setPrompt(stepLine());
  };
  /** A motion longer than skipOverMs can be hurried: `ms` from now. */
  const hurryable = (ms: number): void => {
    skippable = ms > t.skipOverMs;
    skipEnd = now + ms;
  };

  const offer = (first: boolean): void => {
    phase = 'build';
    if (!first) pair = pairOf(bags.pairs.draw());
    step();
    view.offer(part(), pair);
  };

  const board = (): void => {
    phase = 'board';
    view.board(t.boardMs);
    audio.sfx(opts.sounds.pop);
    after(t.boardMs, countdown);
  };

  function countdown(): void {
    phase = 'countdown';
    countN = SCENE.countFrom;
    const tickCount = (): void => {
      if (phase !== 'countdown') return;
      if (countN <= 0) {
        launch();
        return;
      }
      view.count(countN);
      audio.say(opts.lines.count(countN));
      countN -= 1;
      after(t.countMs, tickCount);
    };
    tickCount();
  }

  function launch(): void {
    phase = 'launch';
    audio.say(opts.lines.launch);
    audio.sfx(opts.sounds.ignite);
    view.launch(t.launchMs);
    hurryable(t.launchMs);
    after(t.launchMs, ascent);
  }

  function ascent(): void {
    phase = 'ascent';
    skippable = false;
    alt = 0;
    view.ascent();
  }

  const space = (): void => {
    phase = 'space';
    alt = 1;
    sky = 1;
    surpriseT = 0;
    surpriseSaid = false;
    audio.say(opts.lines.earth);
    view.space(surprise, t.spaceMs);
    after(t.spaceMs, land);
  };

  function land(): void {
    phase = 'land';
    surpriseT = -1;
    audio.sfx(opts.sounds.retro);
    view.land(t.landMs);
    hurryable(t.landMs);
    after(t.landMs, () => {
      skippable = false;
      phase = 'moon';
      moonTaps = 0;
      audio.sfx(opts.sounds.dust);
      audio.say(opts.lines.moon);
      view.moon();
      step();
    });
  }

  /** Home: the trip state moves on now (Home during the return never resumes the Moon). */
  const goHome = (): void => {
    if (phase !== 'moon') return;
    phase = 'home';
    homeT = 0;
    colours = [];
    flagged = false;
    surprise = bags.surprises.draw();
    said = { light: false };
    audio.say(opts.lines.home);
    audio.sfx(opts.sounds.ignite);
    view.home(t.returnMs);
    hurryable(t.returnMs);
    after(t.returnMs * SCENE.homeChuteAt, () => audio.sfx(opts.sounds.chute));
    after(t.returnMs, () => {
      skippable = false;
      homeT = -1;
      sky = 0;
      phase = 'unpack';
      audio.sfx(opts.sounds.pop);
      view.unpack(t.unpackMs);
      after(t.unpackMs, () => offer(false));
    });
  };

  /** A Moon tap counted: the flag once a trip, and home after enough. */
  const moonTap = (): void => {
    moonTaps += 1;
    if (!flagged && moonTaps >= WORLD.flagAfter) {
      flagged = true;
      after(t.flagMs, () => {
        if (phase !== 'moon') return;
        audio.sfx(opts.sounds.sparkle);
        view.flag();
      });
    }
    if (moonTaps >= WORLD.moonTaps) after(t.jumpMs, goHome);
  };

  /** Everything that moves, over `dt` ms. */
  const motion = (dt: number): void => {
    if (phase === 'ascent') {
      alt = clamp01(alt + dt / t.ascentMs);
      sky = alt;
      if (alt >= 1) space();
    } else if (phase === 'space' && surpriseT >= 0) {
      surpriseT += dt;
      if (!surpriseSaid && surpriseT >= t.spaceMs * WORLD.surpriseLineAt) {
        surpriseSaid = true;
        audio.say(opts.lines.surprise(surprise));
      }
    } else if (phase === 'home' && homeT >= 0) {
      homeT += dt;
      sky = 1 - clamp01(homeT / t.returnMs);
    }
  };

  const surpriseK = (): number => (phase === 'space' && surpriseT >= 0 ? clamp01(surpriseT / (t.spaceMs * WORLD.surpriseSpan)) : -1);
  const surpriseX = (k: number): number => g.width * (SCENE.surpriseFrom - SCENE.surpriseSpan * k);
  const near = (a: Point, p: Point): boolean => Math.hypot(a.x - p.x, a.y - p.y) <= g.tapRadiusPx;

  return {
    start() {
      if (stopped) return;
      if (!r) {
        offer(true);
        audio.sayChain([opts.lines.prompt, opts.lines.part(part())]);
        return;
      }
      view.restore({ step: r.step, colours: [...colours], flag: flagged });
      if (r.step === 'build') {
        offer(true);
        audio.say(opts.lines.part(part()));
      } else if (r.step === 'pad') {
        countdown();
      } else {
        phase = 'moon';
        alt = 1;
        sky = 1;
        moonTaps = 0;
        step();
        audio.say(opts.lines.moon);
      }
    },
    tapChoice(n) {
      if (stopped || phase !== 'build' || isBusy() || n < 0 || n > 1) return false;
      const c = pair[n]!;
      const p = part();
      colours.push(c);
      phase = 'fit';
      idleMs = 0;
      hints = 0;
      busyFor(t.fitMs);
      view.fit(p, c, n, t.fitMs);
      audio.say(opts.lines.colour(c));
      after(t.fitMs, () => {
        audio.sfx(opts.sounds.clank);
        audio.sfx(opts.sounds.sparkle);
      });
      after(t.fitMs + t.nextPartMs, () => (colours.length >= PART_IDS.length ? board() : offer(false)));
      return true;
    },
    tapRocket() {
      if (stopped) return false;
      if (phase === 'countdown') {
        launch();
        return true;
      }
      if (phase === 'moon' && !isBusy()) {
        goHome();
        return true;
      }
      return false;
    },
    tapCrater(n) {
      if (stopped || phase !== 'moon' || n < 0 || n >= CRATERS || now - craterAt[n]! < t.peekMs) return false;
      craterAt[n] = now;
      idleMs = 0;
      const a = bags.aliens.draw();
      audio.sfx(opts.sounds.alien(a));
      audio.say(opts.lines.peek);
      view.peek(n, a);
      moonTap();
      return true;
    },
    tapEarth() {
      if (stopped || (phase !== 'moon' && phase !== 'space') || now - earthAt < t.earthSpinMs) return false;
      earthAt = now;
      audio.sfx(opts.sounds.twinkle);
      audio.say(opts.lines.earth);
      view.earth();
      if (phase === 'moon') moonTap();
      return true;
    },
    press(p) {
      if (stopped) return 'none';
      if (phase === 'ascent') {
        if (now - boostAt < t.boostMs) return 'none';
        boostAt = now;
        alt = clamp01(alt + WORLD.boostShare);
        sky = alt;
        audio.sfx(opts.sounds.boost);
        view.boost();
        if (alt >= 1) space();
        return 'boost';
      }
      if (phase === 'space') {
        const k = surpriseK();
        if (k >= 0 && k < 1 && near({ x: surpriseX(k), y: g.height * WORLD.surpriseY }, p) && now - surpriseAt >= t.tapGapMs) {
          surpriseAt = now;
          audio.sfx(opts.sounds.twinkle);
          view.surpriseTapped(surprise);
          return 'surprise';
        }
      }
      if (phase === 'space' || phase === 'moon') {
        const i = stars.findIndex((s) => near(s, p));
        if (i >= 0 && now - starAt[i]! >= t.tapGapMs) {
          starAt[i] = now;
          audio.sfx(opts.sounds.twinkle);
          view.star(i);
          return 'star';
        }
      }
      if (phase !== 'moon') return 'none';
      const k = g.rocks.findIndex((rk) => near(rk, p));
      if (k >= 0) {
        if (now - rockAt[k]! < t.rockMs) return 'none';
        rockAt[k] = now;
        audio.sfx(opts.sounds.dust);
        view.rock(k);
        moonTap();
        return 'rock';
      }
      if (p.y < g.horizonY || isBusy()) return 'none';
      busyFor(t.jumpMs);
      idleMs = 0;
      const kind = bags.jumps.draw();
      audio.sfx(opts.sounds.boost);
      after(t.jumpMs, () => audio.sfx(opts.sounds.dust));
      if (!said.light) {
        said.light = true;
        audio.say(opts.lines.light);
      }
      view.jump(kind);
      moonTap();
      return 'ground';
    },
    anyTap() {
      idleMs = 0;
      if (stopped || !skippable || now >= skipEnd) return;
      const jump = skipEnd - now;
      for (const q of queue) q.at = Math.max(now, q.at - jump);
      busyUntil = Math.max(now, busyUntil - jump);
      skipEnd = now;
      if (phase === 'home') homeT = t.returnMs;
      motion(0);
      view.skip();
      runDue();
    },
    tick(dtMs) {
      if (stopped) return;
      const dt = Math.max(0, Math.min(t.maxDtMs, Number.isFinite(dtMs) ? dtMs : 0));
      now += dt;
      motion(dt);
      runDue();
      if (stopped || isBusy()) return;
      const target: HintTarget | undefined = phase === 'build' ? 'choice' : phase === 'moon' ? 'moon' : undefined;
      if (!target) {
        idleMs = 0;
        return;
      }
      idleMs += dt;
      if (idleMs < t.idleHintMs || hints >= t.hintMax) return;
      idleMs = 0;
      hints += 1;
      view.hint(target);
      audio.say(stepLine());
    },
    stop() {
      stopped = true;
      queue = [];
    },
    progress() {
      const stepNow: TripStep = phase === 'build' || phase === 'fit' ? 'build' : phase === 'moon' ? 'moon' : 'pad';
      return { questionIndex: 0, partial: { step: stepNow, colours: [...colours], surprise, flag: flagged } };
    },
    get phase() {
      return phase;
    },
    get part() {
      return Math.min(PART_IDS.length - 1, colours.length);
    },
    get pair() {
      return pair;
    },
    get colours() {
      return colours;
    },
    get surprise() {
      return surprise;
    },
    get alt() {
      return alt;
    },
    get sky() {
      return sky;
    },
    get surpriseK() {
      return surpriseK();
    },
    get stars() {
      return stars;
    },
    get flagged() {
      return flagged;
    },
    get moonTaps() {
      return moonTaps;
    },
    get hasProgress() {
      return colours.length > 0 && phase !== 'home' && phase !== 'unpack';
    },
    get busy() {
      return isBusy();
    },
  };
}

/**
 * The resume a snapshot allows, or null (a fresh trip): `questionIndex` 0; step 'build' with 1 … 2 known colours, or
 * 'pad' / 'moon' with all 3; a known surprise; a boolean flag (only on the Moon).
 */
export function resumeTrip(resumeAt: { readonly questionIndex: number; readonly partial?: unknown } | null): TripResume | null {
  if (!resumeAt || resumeAt.questionIndex !== 0) return null;
  const p = resumeAt.partial;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return null;
  const { step, colours, surprise, flag } = p as Partial<Record<keyof TripPartial, unknown>>;
  if (step !== 'build' && step !== 'pad' && step !== 'moon') return null;
  if (!Array.isArray(colours) || !colours.every(isColour)) return null;
  const n = colours.length;
  if (step === 'build' ? n < 1 || n >= PART_IDS.length : n !== PART_IDS.length) return null;
  if (!isSurprise(surprise) || typeof flag !== 'boolean') return null;
  return { step, colours: [...(colours as ColourId[])], surprise, flag: step === 'moon' && flag };
}

/** Every id of the scene's bags. */
export const ALL_SURPRISES: readonly SurpriseId[] = SURPRISE_IDS;
export const ALL_ALIENS: readonly AlienId[] = ALIEN_IDS;
export const ALL_JUMPS: readonly JumpId[] = JUMP_IDS;
export const ALL_COLOURS: readonly ColourId[] = COLOUR_IDS;
