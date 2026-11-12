// Tàu hỏa chở bạn trip model (2026-11-12, spec-tau-hoa), pure and Phaser-free: free play, no score, no timer, no
// right or wrong. Behind injected ports (audio, view) so every rule is node-testable; the scene clock drives `tick`.
// The train's x never changes: the model owns how far the world has scrolled and where every scrolling thing is
// (the platforms, the destination, the tunnel, the cow, the trip's surprise, the clouds, the bird; design px, each
// thing's ground pivot x); the scene only draws what it reads here. One trip is four legs (to three stations, then
// to the destination). Phases:
//   start   → the train waits at the start station (first trip only); `tapTrain()` starts the departure;
//   depart  → the train toots and pulls away: the world speeds up to cruise (`departMs`; longer than `skipOverMs`, so
//             any tap skips to its end);
//   ride    → cruise for `rideMs` (and, on the tunnel leg, until the tunnel has passed the whole train). The tunnel
//             leg's hill scrolls over the train: `dim` (0…1) is how much of the train it covers; as the engine comes
//             out the voice says "Ú òa!". The trip's surprise comes on its leg (the crossing and the bridge scroll by;
//             the hot-air balloon and the rainbow show in the sky); the cow grazes by the track on some legs;
//   arrive  → the next platform (or the destination) scrolls in and the world eases to a stop with it at its anchor
//             (a cubic Hermite from cruise; skippable when long); the brakes hiss;
//   wait    → a friend waits on the platform (there is no timer: the train always waits); `tapFriend()` boards it;
//   board   → it hops into the next empty car (from the engine back; `boardMs` ≤ 1.5 s, taps on it ignored) with its
//             call; the voice says its boarding line and counts; then the train departs again;
//   dest    → the destination waits for a tap: `tapDest()` drops the friends off;
//   dropoff → they hop off one by one (`dropMs` each, ≤ 1.5 s, taps ignored) and wave; the train toots and sets off
//             on the next trip (new friends, a new destination and surprise, the tunnel on a new leg).
// Taps any time: the engine (a puff and a toot), a car (it wobbles, the voice names its colour), the cow and the bird
// (`press`), the crossing or the bridge (`press`). Nothing ever fails; nothing is ever wrong.
// `tapDest` already moves the state to the next trip, so Home during the drop-off never resumes delivered friends;
// the scene keeps a snapshot on Home only while a friend is aboard (`hasProgress`). The partial is
// `{ friends, aboard, dest, surprise, tunnelLeg }`; `resumeTrip` validates it (invalid → a fresh trip at the first
// station). A resumed trip shows at once: stopped at the next station with its friend waiting (or at the destination).
import {
  CAR_COLOURS,
  CLOUD_COUNT,
  DESTINATION_IDS,
  FRIEND_IDS,
  FRIENDS_PER_TRIP,
  LEGS,
  SURPRISE_IDS,
  TUNNEL_LEGS,
  WORLD,
  isDestination,
  isFriend,
  isSurprise,
  type CarColour,
  type DestinationId,
  type FriendId,
  type SurpriseId,
} from '../../content/games/train.ts';
import type { Point } from '../../content/layout-types.ts';
import { Tokens } from '../../core/tokens.ts';

export interface TripAudio {
  sfx(id: string): void;
  say(id: string): number;
  /** Several lines back to back under one token; returns it. */
  sayChain(ids: readonly string[]): number;
  setPrompt(id: string): void;
}

/** What the idle hint bounces: the waiting train, the friend on its platform, or the destination. */
export type HintTarget = 'train' | 'friend' | 'dest';

/** What a press in the world touched (the cars, the engine, the friend and the destination are the scene's hulls). */
export type PressHit = 'none' | 'bird' | 'cow' | 'surprise';

/** A scrolling thing on the ground. `x` is its ground pivot's x now. */
export type ThingKind = 'platform' | 'dest' | 'tunnel' | 'cow' | 'crossing' | 'bridge';
export interface Thing {
  readonly id: number;
  readonly kind: ThingKind;
  /** The friend waiting on a platform (null: nobody, the start station or after it boarded); the destination's id. */
  readonly friend: FriendId | null;
  readonly dest: DestinationId | null;
  readonly x: number;
}

/** A trip shown at once (a resumed start): stopped at a station with its friend waiting, or at the destination. */
export interface TripState {
  readonly friends: readonly FriendId[];
  readonly aboard: number;
  readonly dest: DestinationId;
  readonly atDest: boolean;
}

export interface TripView {
  /** A fresh start: the train waits at the start station. */
  park(): void;
  /** The train pulls away (over `ms`). */
  depart(ms: number): void;
  /** A tap skipped the running departure or arrival: it jumps to its end. */
  skip(): void;
  /** A new thing scrolls in from the right. */
  thingIn(thing: Thing): void;
  /** The thing has scrolled away (or is gone). */
  thingGone(id: number): void;
  /** The train stops: at a platform with `friend` waiting, or at the destination. */
  arrived(at: { friend: FriendId } | { dest: DestinationId }): void;
  /** `friend` hops into car `car` (from 0, the one behind the engine) over `ms`. */
  board(friend: FriendId, car: number, ms: number): void;
  /** The friends hop off one by one (car 0 first), `ms` each, one every `staggerMs`, then wave. */
  dropoff(dest: DestinationId, friends: readonly FriendId[], ms: number, staggerMs: number): void;
  /** The engine's toot: a puff from the chimney. */
  toot(): void;
  /** Car `n` wobbles. */
  wobble(car: number): void;
  /** The tunnel: the hill starts to cover the engine; the engine comes out of it. */
  tunnelIn(): void;
  tunnelOut(): void;
  /** A ground surprise (the crossing, the bridge) passes the engine: the driver waves, the fish jumps. */
  passed(kind: 'crossing' | 'bridge'): void;
  /** The sky surprise (the hot-air balloon, the rainbow) shows (over `ms`). */
  sky(id: 'hot-air' | 'rainbow', ms: number): void;
  /** The cow, the bird or the ground surprise was pressed: a small reaction. */
  cowTapped(): void;
  birdTapped(): void;
  surpriseTapped(kind: 'crossing' | 'bridge'): void;
  /** The idle hint: its target bounces. */
  hint(target: HintTarget): void;
  /** A resumed trip shows at once. */
  restore(state: TripState): void;
}

export interface TripTimings {
  readonly departMs: number;
  /** A departure or arrival longer than this can be skipped with a tap. */
  readonly skipOverMs: number;
  readonly rideMs: number;
  readonly arriveMaxMs: number;
  readonly boardMs: number;
  /** After a boarding, the train waits this long before it pulls away. */
  readonly boardPauseMs: number;
  readonly dropMs: number;
  readonly dropStaggerMs: number;
  /** After the last friend is off, they wave this long before the train sets off. */
  readonly waveMs: number;
  readonly skyMs: number;
  /** The engine's toot and a car's colour can be asked again after this long. */
  readonly tootGapMs: number;
  readonly carGapMs: number;
  readonly idleHintMs: number;
  readonly hintMax: number;
  readonly maxDtMs: number;
}

export function defaultTripTimings(): TripTimings {
  const t = Tokens.Timing;
  return {
    departMs: t.trainDepartMs,
    skipOverMs: t.trainSkipOverMs,
    rideMs: t.trainRideMs,
    arriveMaxMs: t.trainArriveMaxMs,
    boardMs: t.trainBoardMs,
    boardPauseMs: t.trainBoardPauseMs,
    dropMs: t.trainDropMs,
    dropStaggerMs: t.trainDropStaggerMs,
    waveMs: t.trainWaveMs,
    skyMs: t.trainSkyMs,
    tootGapMs: t.trainTootGapMs,
    carGapMs: t.trainCarGapMs,
    idleHintMs: t.trainIdleHintMs,
    hintMax: Tokens.ui.trainHintMax,
    maxDtMs: t.trainMaxTickMs,
  };
}

/** Where things are (design px). */
export interface TripGeometry {
  /** The screen's width. */
  readonly width: number;
  /** The train's front (the engine's nose) and back (the last car's tail). */
  readonly noseX: number;
  readonly tailX: number;
  /** The platform's and the destination's ground pivot x at rest. */
  readonly platformX: number;
  readonly destX: number;
  /** The tunnel: from its left portal (its pivot) to its right portal. */
  readonly tunnelLen: number;
  /** Where a press on the cow, the bird or a ground surprise is checked (their tap centres' heights). */
  readonly cowY: number;
  readonly surpriseY: number;
}

export interface TripSizes {
  /** Speeds in design px per second. */
  readonly scrollPxPerS: number;
  readonly cloudPxPerS: number;
  readonly birdPxPerS: number;
  /** Every speed is × this (reduced motion: a slower world). */
  readonly speedScale: number;
  /** A thing enters this far past the right edge (its pivot) and leaves this far past the left edge (its right side). */
  readonly enterPadPx: number;
  readonly leavePadPx: number;
  readonly tapRadiusPx: number;
  readonly birdGapPx: number;
}

export function defaultTripSizes(reduced = false): TripSizes {
  const u = Tokens.ui;
  return {
    scrollPxPerS: u.trainScrollPxPerS,
    cloudPxPerS: u.trainCloudPxPerS,
    birdPxPerS: u.trainBirdPxPerS,
    speedScale: reduced ? u.trainReducedScroll : 1,
    enterPadPx: u.trainEnterPadPx,
    leavePadPx: u.trainLeavePadPx,
    tapRadiusPx: u.trainTapRadiusPx,
    birdGapPx: u.trainBirdGapPx,
  };
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
  if (ids.length === 0) throw new Error('train: an empty shuffle bag');
  let bag: T[] = [];
  let last: T | undefined;
  return {
    draw() {
      let i = bag.findIndex((id) => id !== last);
      if (i < 0) {
        bag = [...bag, ...shuffle(ids, rng)];
        i = bag.findIndex((id) => id !== last);
      }
      // A one-id bag can only repeat.
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

/** `n` different friends from the bag (never the same friend twice in one trip). */
export function drawFriends(bag: ShuffleBag<FriendId>, n: number): FriendId[] {
  const out: FriendId[] = [];
  for (let tries = 0; out.length < n && tries < n * WORLD.drawTries; tries++) {
    const f = bag.draw();
    if (!out.includes(f)) out.push(f);
  }
  // A bag that keeps repeating (a test's fixed bag): fill from the list, still all different.
  for (const f of FRIEND_IDS) if (out.length < n && !out.includes(f)) out.push(f);
  return out;
}

// --- the controller -------------------------------------------------------------------------------------------

export type TripPhase = 'start' | 'depart' | 'ride' | 'arrive' | 'wait' | 'board' | 'dest' | 'dropoff';

export interface TripPartial {
  friends: string[];
  aboard: number;
  dest: string;
  surprise: string;
  tunnelLeg: number;
}

export interface TripResume {
  readonly friends: readonly FriendId[];
  readonly aboard: number;
  readonly dest: DestinationId;
  readonly surprise: SurpriseId;
  readonly tunnelLeg: number;
}

export interface TripLines {
  /** The invitation (names Xoài): at the start station. */
  readonly prompt: string;
  /** A friend waits at the station. */
  readonly station: string;
  readonly board: (f: FriendId) => string;
  /** The n-th friend's count (from 1). */
  readonly count: (n: number) => string;
  readonly car: (c: CarColour) => string;
  readonly tunnel: string;
  readonly dest: (d: DestinationId) => string;
}

export interface TripSounds {
  readonly toot: string;
  readonly chug: string;
  readonly puff: string;
  readonly hiss: string;
  readonly pop: string;
  readonly chime: string;
  readonly honk: string;
  readonly splash: string;
  readonly chirp: string;
  /** A friend's own call (the cow by the track calls too). */
  readonly call: (f: FriendId) => string;
}

export interface TripOptions {
  readonly friends: ShuffleBag<FriendId>;
  readonly destinations: ShuffleBag<DestinationId>;
  readonly surprises: ShuffleBag<SurpriseId>;
  /** The world's own draws in [0, 1): the tunnel's leg, the surprise's leg, the clouds' comebacks. */
  readonly rng: () => number;
  readonly geometry: TripGeometry;
  readonly resume?: TripResume | null | undefined;
  readonly lines: TripLines;
  readonly sounds: TripSounds;
  readonly audio: TripAudio;
  readonly view: TripView;
  readonly timings?: Partial<TripTimings>;
  readonly sizes?: Partial<TripSizes>;
}

export interface TripProgress {
  readonly questionIndex: number;
  readonly partial: TripPartial;
}

export interface TripController {
  start(): void;
  /** A tap on the engine (or a car) at the start station: true when it started the departure; elsewhere a toot. */
  tapTrain(): boolean;
  /** A tap on car `n`: it wobbles and the voice names its colour (true when it reacted). */
  tapCar(n: number): boolean;
  /** A tap on the waiting friend or its platform: true when it started the boarding. */
  tapFriend(): boolean;
  /** A tap on the destination: true when it started the drop-off. */
  tapDest(): boolean;
  /** A press in the world: the cow, the bird or a ground surprise under it reacts. */
  press(p: Point): PressHit;
  /** Any press: the idle hint clock restarts; a long departure or arrival skips to its end. */
  anyTap(): void;
  tick(dtMs: number): void;
  stop(): void;
  progress(): TripProgress;
  readonly phase: TripPhase;
  /** This trip's friends (in boarding order), how many are aboard, its destination, surprise and tunnel leg. */
  readonly friends: readonly FriendId[];
  readonly aboard: number;
  readonly dest: DestinationId;
  readonly surprise: SurpriseId;
  readonly tunnelLeg: number;
  /** The leg the train is on (0 … LEGS − 1: to station 1, 2, 3, then to the destination). */
  readonly leg: number;
  /** How far the ground has scrolled (design px; it only grows) and how fast it scrolls now (design px per ms). */
  readonly scroll: number;
  readonly speed: number;
  /** How much of the train the tunnel covers now (0 … 1). */
  readonly dim: number;
  readonly things: readonly Thing[];
  readonly clouds: readonly Point[];
  readonly bird: Point;
  /** A friend is aboard: Home keeps the trip to resume. */
  readonly hasProgress: boolean;
  /** An animation runs (boarding, drop-off): the friend and the destination ignore taps. */
  readonly busy: boolean;
}

const clamp01 = (k: number): number => Math.max(0, Math.min(1, k));

export function createTripController(opts: TripOptions): TripController {
  const t = { ...defaultTripTimings(), ...opts.timings };
  const z = { ...defaultTripSizes(), ...opts.sizes };
  const g = opts.geometry;
  const { audio, view, rng } = opts;
  /** Speeds in design px per ms. */
  const cruise = (z.scrollPxPerS * z.speedScale) / WORLD.msPerS;
  const cloudV = (z.cloudPxPerS * z.speedScale) / WORLD.msPerS;
  const birdV = (z.birdPxPerS * z.speedScale) / WORLD.msPerS;
  const enterX = g.width + z.enterPadPx;
  const trainLen = Math.max(1, g.noseX - g.tailX);

  const r = opts.resume ?? null;
  let friends: FriendId[] = r ? [...r.friends] : drawFriends(opts.friends, FRIENDS_PER_TRIP);
  let dest: DestinationId = r ? r.dest : opts.destinations.draw();
  let surprise: SurpriseId = r ? r.surprise : opts.surprises.draw();
  const pickTunnelLeg = (): number => TUNNEL_LEGS[Math.min(TUNNEL_LEGS.length - 1, Math.floor(rng() * TUNNEL_LEGS.length))]!;
  /** The surprise's leg: the first or the last (the tunnel takes a middle one). */
  const pickSurpriseLeg = (): number => (rng() < 0.5 ? 0 : LEGS - 1);
  let tunnelLeg = r ? r.tunnelLeg : pickTunnelLeg();
  let surpriseLeg = pickSurpriseLeg();
  if (r) {
    for (const f of r.friends) opts.friends.note(f);
    opts.destinations.note(r.dest);
    opts.surprises.note(r.surprise);
  }
  let aboard = r ? r.aboard : 0;
  let leg = r ? Math.min(LEGS - 1, r.aboard) : 0;
  let phase: TripPhase = 'start';
  let scroll = 0;
  let speed = 0;
  let nextId = 1;
  let things: { id: number; kind: ThingKind; friend: FriendId | null; dest: DestinationId | null; x: number; passed: boolean }[] = [];
  /** The thing the train is arriving at (a platform or the destination). */
  let target: (typeof things)[number] | null = null;
  const clouds = Array.from({ length: CLOUD_COUNT }, (_, i) => ({
    x: g.width * (WORLD.cloudStart[i % WORLD.cloudStart.length] ?? 1),
    y: WORLD.cloudY[i % WORLD.cloudY.length] ?? WORLD.cloudY[0],
  }));
  const bird = { x: g.width * WORLD.birdStart, y: WORLD.birdY };
  let now = 0;
  /** Time in the running departure or arrival, and its length. */
  let phaseT = 0;
  let phaseMs = 0;
  let arriveFrom = 0;
  let rideLeft = 0;
  let legT = 0;
  let surpriseDone = false;
  let cowDone = false;
  let tunnelState: 'none' | 'in' | 'covered' | 'out' = 'none';
  let busyUntil = 0;
  let skipEnd = 0;
  let skippable = false;
  let tootAt = -Infinity;
  const carAt: number[] = CAR_COLOURS.map(() => -Infinity);
  let idleMs = 0;
  let hints = 0;
  let dim = 0;
  let stopped = false;
  let queue: { at: number; fn: () => void }[] = [];

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
  const stepLine = (): string => (phase === 'start' ? opts.lines.prompt : phase === 'dest' || phase === 'dropoff' ? opts.lines.dest(dest) : opts.lines.station);
  /** A new step begins: its line is the Speaker prompt, the idle hint starts over. */
  const step = (): void => {
    hints = 0;
    idleMs = 0;
    audio.setPrompt(stepLine());
  };

  const add = (kind: ThingKind, x: number, extra: { friend?: FriendId | null; dest?: DestinationId | null } = {}): (typeof things)[number] => {
    const thing = { id: nextId++, kind, friend: extra.friend ?? null, dest: extra.dest ?? null, x, passed: false };
    things.push(thing);
    view.thingIn({ ...thing });
    return thing;
  };
  /** How far right of its pivot a thing reaches (so it leaves only once it is wholly off screen). */
  const reach = (kind: ThingKind): number => (kind === 'tunnel' ? g.tunnelLen + z.leavePadPx : z.leavePadPx);

  /** The train pulls away (from a station, the destination or the start). */
  const depart = (): void => {
    phase = 'depart';
    phaseT = 0;
    phaseMs = t.departMs;
    skippable = t.departMs > t.skipOverMs;
    skipEnd = now + t.departMs;
    // A platform's friend has boarded: the platform scrolls away empty.
    audio.sfx(opts.sounds.toot);
    audio.sfx(opts.sounds.chug);
    view.toot();
    view.depart(t.departMs);
    step();
    after(t.departMs, ride);
  };

  /** Cruise: the leg's events come; the arrival starts once the ride is over and the tunnel has passed. */
  function ride(): void {
    phase = 'ride';
    skippable = false;
    rideLeft = t.rideMs;
    legT = 0;
    surpriseDone = false;
    cowDone = false;
    tunnelState = 'none';
    if (leg === tunnelLeg) {
      add('tunnel', enterX);
      tunnelState = 'in';
    }
  }

  /** The leg is over: the next platform (or the destination) scrolls in and the world eases to a stop. */
  const arrive = (): void => {
    phase = 'arrive';
    phaseT = 0;
    const toDest = aboard >= FRIENDS_PER_TRIP;
    const stopX = toDest ? g.destX : g.platformX;
    target = toDest ? add('dest', enterX, { dest }) : add('platform', enterX, { friend: friends[aboard] ?? null });
    arriveFrom = target.x;
    const d = arriveFrom - stopX;
    phaseMs = cruise > 0 ? Math.min(t.arriveMaxMs, (2 * d) / cruise) : t.arriveMaxMs;
    skippable = phaseMs > t.skipOverMs;
    skipEnd = now + phaseMs;
    after(phaseMs, stopAt);
  };

  /** The train stands still at its target. */
  const stopAt = (): void => {
    skippable = false;
    speed = 0;
    const tg = target;
    if (tg) tg.x = tg.kind === 'dest' ? g.destX : g.platformX;
    audio.sfx(opts.sounds.hiss);
    if (aboard >= FRIENDS_PER_TRIP) {
      phase = 'dest';
      step();
      view.arrived({ dest });
      audio.say(opts.lines.dest(dest));
    } else {
      phase = 'wait';
      step();
      const f = friends[aboard]!;
      view.arrived({ friend: f });
      audio.say(opts.lines.station);
    }
  };

  /** A new trip: new friends, destination, surprise and tunnel leg. */
  const nextTrip = (): void => {
    friends = drawFriends(opts.friends, FRIENDS_PER_TRIP);
    dest = opts.destinations.draw();
    surprise = opts.surprises.draw();
    tunnelLeg = pickTunnelLeg();
    surpriseLeg = pickSurpriseLeg();
    aboard = 0;
    leg = 0;
  };

  const coverOf = (x: number): number => {
    const lo = Math.max(g.tailX, x);
    const hi = Math.min(g.noseX, x + g.tunnelLen);
    return clamp01((hi - lo) / trainLen);
  };

  /** The leg's own events while cruising: the surprise, the cow; the tunnel's cover. */
  const legEvents = (dt: number): void => {
    legT += dt;
    if (leg === surpriseLeg && !surpriseDone && legT >= t.rideMs * WORLD.surpriseAt) {
      surpriseDone = true;
      if (surprise === 'crossing' || surprise === 'bridge') add(surprise, enterX);
      else {
        view.sky(surprise, t.skyMs);
        audio.sfx(opts.sounds.chime);
      }
    }
    if (!cowDone && leg !== tunnelLeg && leg % WORLD.cowEvery === 0 && legT >= t.rideMs / 2) {
      cowDone = true;
      add('cow', enterX);
    }
  };

  /** Everything that moves, over `dt` ms. */
  const motion = (dt: number): void => {
    const k0 = phaseMs > 0 ? clamp01(phaseT / phaseMs) : 1;
    if (phase === 'depart' || phase === 'arrive') phaseT += dt;
    const k1 = phaseMs > 0 ? clamp01(phaseT / phaseMs) : 1;
    let dx = 0;
    if (phase === 'depart') {
      dx = (cruise * phaseMs * (k1 * k1 - k0 * k0)) / 2;
      speed = cruise * k1;
    } else if (phase === 'ride') {
      dx = cruise * dt;
      speed = cruise;
    } else if (phase === 'arrive' && target) {
      // A cubic Hermite from the cruise speed to 0 over the distance D: no speed jump even when the arrival is capped.
      const d = arriveFrom - (target.kind === 'dest' ? g.destX : g.platformX);
      const pos = (k: number): number => {
        const k2 = k * k;
        const k3 = k2 * k;
        return arriveFrom - (phaseMs * cruise * (k3 - 2 * k2 + k) + d * (k2 + 2 * (k2 - k3)));
      };
      dx = pos(k0) - pos(k1);
      speed = dt > 0 ? dx / dt : speed;
    } else {
      speed = 0;
    }
    scroll += dx;
    for (const th of things) th.x -= dx;
    // Ground surprises: the driver waves, the fish jumps as they pass the engine.
    for (const th of things) {
      if (th.passed || (th.kind !== 'crossing' && th.kind !== 'bridge') || th.x > g.noseX) continue;
      th.passed = true;
      if (th.kind === 'crossing') audio.sfx(opts.sounds.honk);
      else audio.sfx(opts.sounds.splash);
      view.passed(th.kind);
    }
    const gone = things.filter((th) => th.x + reach(th.kind) < 0 && th !== target);
    if (gone.length > 0) {
      things = things.filter((th) => !gone.includes(th));
      for (const th of gone) view.thingGone(th.id);
    }
    // The tunnel: how much of the train it covers.
    const tunnel = things.find((th) => th.kind === 'tunnel');
    const was = dim;
    dim = tunnel ? coverOf(tunnel.x) : 0;
    if (tunnel && was === 0 && dim > 0 && tunnelState === 'in') {
      view.tunnelIn();
    }
    if (tunnel && dim >= 1 && tunnelState === 'in') tunnelState = 'covered';
    if (tunnel && tunnelState === 'covered' && tunnel.x + g.tunnelLen <= g.noseX) {
      // The engine comes out into the light.
      tunnelState = 'out';
      audio.sfx(opts.sounds.toot);
      audio.say(opts.lines.tunnel);
      view.tunnelOut();
    }
    // The clouds drift (a little even while the train stands still); the bird always flies.
    const share = dt > 0 && cruise > 0 ? Math.min(1, dx / (cruise * dt)) : 0;
    const cv = cloudV * (WORLD.cloudIdle + (1 - WORLD.cloudIdle) * share);
    for (const c of clouds) {
      c.x -= cv * dt;
      if (c.x < -z.leavePadPx) c.x = g.width + z.leavePadPx + rng() * g.width * 0.5;
    }
    bird.x -= birdV * dt;
    if (bird.x < -z.leavePadPx) bird.x = g.width + z.leavePadPx + z.birdGapPx;
    if (phase !== 'ride') return;
    legEvents(dt);
    rideLeft -= dt;
    const tunnelBusy = tunnelState === 'in' || tunnelState === 'covered' || (tunnel !== undefined && coverOf(tunnel.x) > 0);
    if (rideLeft <= 0 && !tunnelBusy) arrive();
  };

  const hintTarget = (): HintTarget | undefined => {
    if (phase === 'start') return 'train';
    if (phase === 'wait') return 'friend';
    return phase === 'dest' ? 'dest' : undefined;
  };

  const tapTrain = (): boolean => {
    if (stopped) return false;
    if (phase === 'start' && !isBusy()) {
      depart();
      return true;
    }
    toot();
    return false;
  };

  const toot = (): boolean => {
    if (dim > 0 || now - tootAt < t.tootGapMs) return false;
    tootAt = now;
    audio.sfx(opts.sounds.toot);
    audio.sfx(opts.sounds.puff);
    view.toot();
    return true;
  };

  return {
    start() {
      if (stopped) return;
      if (!r) {
        // The first trip starts at a station of its own (nobody waits there).
        target = add('platform', g.platformX);
        view.park();
        step();
        audio.say(opts.lines.prompt);
        return;
      }
      // A resumed trip: stopped at the next station with its friend waiting, or at the destination.
      const atDest = aboard >= FRIENDS_PER_TRIP;
      surpriseLeg = -1;
      if (atDest) {
        phase = 'dest';
        target = add('dest', g.destX, { dest });
      } else {
        phase = 'wait';
        target = add('platform', g.platformX, { friend: friends[aboard] ?? null });
      }
      step();
      view.restore({ friends: [...friends], aboard, dest, atDest });
      audio.say(stepLine());
    },
    tapTrain,
    tapCar(n) {
      if (stopped || dim > 0 || n < 0 || n >= CAR_COLOURS.length) return false;
      if (phase === 'start') return tapTrain();
      if (now - carAt[n]! < t.carGapMs) return false;
      carAt[n] = now;
      audio.sfx(opts.sounds.pop);
      audio.say(opts.lines.car(CAR_COLOURS[n]!));
      view.wobble(n);
      return true;
    },
    tapFriend() {
      if (stopped || isBusy() || phase !== 'wait') return false;
      const f = friends[aboard]!;
      const car = aboard;
      aboard += 1;
      phase = 'board';
      idleMs = 0;
      hints = 0;
      if (target) target.friend = null;
      busyFor(t.boardMs);
      view.board(f, car, t.boardMs);
      audio.sfx(opts.sounds.call(f));
      audio.sayChain([opts.lines.board(f), opts.lines.count(aboard)]);
      after(t.boardMs, () => audio.sfx(opts.sounds.pop));
      after(t.boardMs + t.boardPauseMs, () => {
        leg = Math.min(LEGS - 1, leg + 1);
        target = null;
        depart();
      });
      return true;
    },
    tapDest() {
      if (stopped || isBusy() || phase !== 'dest') return false;
      const dropped = [...friends];
      const at = dest;
      // The state moves to the next trip now: Home during the drop-off never resumes delivered friends.
      nextTrip();
      phase = 'dropoff';
      idleMs = 0;
      hints = 0;
      view.dropoff(at, dropped, t.dropMs, t.dropStaggerMs);
      dropped.forEach((f, i) => after(i * t.dropStaggerMs, () => audio.sfx(opts.sounds.call(f))));
      const landed = t.dropMs + t.dropStaggerMs * Math.max(0, dropped.length - 1);
      after(landed, () => audio.sfx(opts.sounds.chime));
      busyFor(landed + t.waveMs);
      after(landed + t.waveMs, () => {
        target = null;
        depart();
      });
      return true;
    },
    press(p) {
      if (stopped) return 'none';
      const near = (x: number, y: number): boolean => Math.hypot(x - p.x, y - p.y) <= z.tapRadiusPx;
      if (near(bird.x, bird.y)) {
        audio.sfx(opts.sounds.chirp);
        view.birdTapped();
        return 'bird';
      }
      const cow = things.find((th) => th.kind === 'cow' && near(th.x, g.cowY));
      if (cow) {
        audio.sfx(opts.sounds.call('cow'));
        view.cowTapped();
        return 'cow';
      }
      const s = things.find((th) => (th.kind === 'crossing' || th.kind === 'bridge') && near(th.x, g.surpriseY));
      if (s && (s.kind === 'crossing' || s.kind === 'bridge')) {
        audio.sfx(s.kind === 'crossing' ? opts.sounds.honk : opts.sounds.splash);
        view.surpriseTapped(s.kind);
        return 'surprise';
      }
      return 'none';
    },
    anyTap() {
      idleMs = 0;
      if (stopped || !skippable || now >= skipEnd) return;
      // Skip: the clock jumps to the animation's end (everything queued moves up with it).
      const jump = skipEnd - now;
      for (const q of queue) q.at = Math.max(now, q.at - jump);
      busyUntil = Math.max(now, busyUntil - jump);
      skipEnd = now;
      motion(jump);
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
      const target = hintTarget();
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
      // questionIndex stays 0: free play closes no question.
      return { questionIndex: 0, partial: { friends: [...friends], aboard, dest, surprise, tunnelLeg } };
    },
    get phase() {
      return phase;
    },
    get friends() {
      return friends;
    },
    get aboard() {
      return aboard;
    },
    get dest() {
      return dest;
    },
    get surprise() {
      return surprise;
    },
    get tunnelLeg() {
      return tunnelLeg;
    },
    get leg() {
      return leg;
    },
    get scroll() {
      return scroll;
    },
    get speed() {
      return speed;
    },
    get dim() {
      return dim;
    },
    get things() {
      return things;
    },
    get clouds() {
      return clouds;
    },
    get bird() {
      return bird;
    },
    get hasProgress() {
      return aboard > 0 && phase !== 'dropoff' && phase !== 'start';
    },
    get busy() {
      return isBusy();
    },
  };
}

/**
 * The resume a snapshot allows, or null (a fresh trip): `questionIndex` 0; FRIENDS_PER_TRIP different known friends;
 * 1 … FRIENDS_PER_TRIP aboard; a known destination and surprise; the tunnel on one of TUNNEL_LEGS.
 */
export function resumeTrip(resumeAt: { readonly questionIndex: number; readonly partial?: unknown } | null): TripResume | null {
  if (!resumeAt || resumeAt.questionIndex !== 0) return null;
  const p = resumeAt.partial;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return null;
  const { friends, aboard, dest, surprise, tunnelLeg } = p as Partial<Record<keyof TripPartial, unknown>>;
  if (!Array.isArray(friends) || friends.length !== FRIENDS_PER_TRIP || !friends.every(isFriend) || new Set(friends).size !== friends.length) return null;
  if (typeof aboard !== 'number' || !Number.isInteger(aboard) || aboard < 1 || aboard > FRIENDS_PER_TRIP) return null;
  if (!isDestination(dest) || !isSurprise(surprise)) return null;
  if (typeof tunnelLeg !== 'number' || !(TUNNEL_LEGS as readonly number[]).includes(tunnelLeg)) return null;
  return { friends: [...(friends as FriendId[])], aboard, dest, surprise, tunnelLeg };
}

/** Every friend, destination and surprise id (the scene's bags). */
export const ALL_FRIENDS: readonly FriendId[] = FRIEND_IDS;
export const ALL_DESTINATIONS: readonly DestinationId[] = DESTINATION_IDS;
export const ALL_SURPRISES: readonly SurpriseId[] = SURPRISE_IDS;
