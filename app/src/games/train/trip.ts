// Tàu hỏa quanh đảo trip model (2026-11-13, spec-tau-quanh-dao; the game since 2026-11-12, spec-tau-hoa), pure and
// Phaser-free: free play, no score, no timer, no right or wrong. Behind injected ports (audio, view) so every rule is
// node-testable; the scene clock drives `tick`.
// The train runs on the island's rail loop (`path.rail`, geometry.ts): the model owns the engine's arc length `s`
// (always forward, counter-clockwise) and its speed; the cars trail it (trainPieces). The scene draws the pieces, and
// the camera (camera.ts) follows `s`.
// A trip: FRIENDS_PER_TRIP friend stations in loop order (of the four, one is skipped), then a destination. It is planned
// where it starts (`planTrip`): the stations are the next ones ahead; the volcano's tunnel lies on the path at most once
// (the skipped station is chosen so). Phases:
//   start   → the train waits where the map's train stood (a fresh start); `tapTrain()` starts the departure;
//   depart  → it toots and speeds up to cruise over `departMs` (≤ 1.5 s: nothing to skip);
//   ride    → cruise (× the rail's local scale): the places of the island go by; the tunnel dims the scene by the share
//             of the train inside it (`dim`), and "Ú òa!" plays as the engine comes out; the crossing's barriers come
//             down while a piece is near it; the trip's surprise comes (the kart's driver waves as the engine passes the
//             crossing; the whale spouts as it passes the whale; the boat or the balloon drifts by after a departure);
//   arrive  → it brakes to a stop exactly at the next stop (the same rate it sped up at);
//   wait    → a friend waits on the platform (no timer: the train always waits); `tapFriend()` boards it;
//   board   → it hops into the next empty car (from the engine back; `boardMs` ≤ 1.5 s, taps on it ignored) with its
//             call; the voice says its boarding line and counts; then the train departs again;
//   dest    → the destination waits for a tap: `tapDest()` drops the friends off;
//   dropoff → they hop off one by one (`dropMs` each, ≤ 1.5 s, taps ignored) and wave; the next trip is planned from
//             here at once (Home during the drop-off keeps nothing) and the train sets off.
// Taps any time: the engine (a puff and a toot), a car (it wobbles, the voice names its colour), a place (its name),
// the whale (it spouts). Nothing ever fails; nothing is ever wrong.
// The partial is `{ friends, aboard, stops, dest, surprise }` (the stops and the destination as ids); `resumeTrip`
// validates it (an invalid or old-shape one → a fresh trip). A resumed trip shows at once: stopped at its next station
// with the friend waiting (or at the destination).
import {
  CAR_COLOURS,
  DRAW_TRIES,
  DESTINATION_IDS,
  FRIEND_IDS,
  FRIENDS_PER_TRIP,
  STATION_IDS,
  SURPRISE_IDS,
  isDestination,
  isFriend,
  isStation,
  isSurprise,
  type CarColour,
  type DestinationId,
  type FriendId,
  type PlaceId,
  type StationId,
  type SurpriseId,
} from '../../content/games/train.ts';
import { wrap } from '../../core/map-rides.ts';
import { Tokens } from '../../core/tokens.ts';
import { trainPieces, tunnelCover, type Piece, type Rail } from './geometry.ts';

export interface TripAudio {
  sfx(id: string): void;
  say(id: string): number;
  /** Several lines back to back under one token; returns it. */
  sayChain(ids: readonly string[]): number;
  setPrompt(id: string): void;
}

/** What the idle hint bounces: the waiting train, the friend on its platform, or the destination. */
export type HintTarget = 'train' | 'friend' | 'dest';

/** One trip: its friends (boarding order), stations (loop order), destination and surprise. */
export interface TripPlan {
  readonly friends: readonly FriendId[];
  readonly stops: readonly StationId[];
  readonly dest: DestinationId;
  readonly surprise: SurpriseId;
}

/** A trip shown at once (a resumed start): stopped at a station with its friend waiting, or at the destination. */
export interface TripState extends TripPlan {
  readonly aboard: number;
  readonly atDest: boolean;
}

export interface TripView {
  /** A trip is planned: its friends wait on their stations' platforms (the kart waits at the crossing for its surprise). */
  planned(plan: TripPlan, aboard: number): void;
  /** The train pulls away. */
  depart(): void;
  /** The train stops: at a station with `friend` waiting, or at the destination. */
  arrived(at: { station: StationId; friend: FriendId } | { dest: DestinationId }): void;
  /** `friend` hops from `station`'s platform into car `car` (from 0, the one behind the engine) over `ms`. */
  board(friend: FriendId, station: StationId, car: number, ms: number): void;
  /** The friends hop off one by one (car 0 first), `ms` each, one every `staggerMs`, then wave. */
  dropoff(dest: DestinationId, friends: readonly FriendId[], ms: number, staggerMs: number): void;
  /** The engine's toot: a puff from the chimney. */
  toot(): void;
  /** Car `n` wobbles. */
  wobble(car: number): void;
  /** The engine goes into the volcano; it comes out. */
  tunnelIn(): void;
  tunnelOut(): void;
  /** The crossing's barriers go down / up. */
  barriers(down: boolean): void;
  /** The trip's surprise shows (the kart's wave, the whale's spout, the boat or the balloon over `ms`). */
  surprise(kind: SurpriseId, ms: number): void;
  /** A tap on the whale: it spouts. */
  whaleTapped(): void;
  /** The idle hint: its target bounces. */
  hint(target: HintTarget): void;
  /** A resumed trip shows at once. */
  restore(state: TripState): void;
}

export interface TripTimings {
  /** From a stop to cruise (and from cruise to a stop) takes this long. */
  readonly departMs: number;
  readonly boardMs: number;
  /** After a boarding, the train waits this long before it pulls away. */
  readonly boardPauseMs: number;
  readonly dropMs: number;
  readonly dropStaggerMs: number;
  /** After the last friend is off, they wave this long before the train sets off. */
  readonly waveMs: number;
  /** The boat or the balloon shows this long, this long after a departure. */
  readonly skyMs: number;
  readonly skyDelayMs: number;
  /** The engine's toot, a car's colour and a place's name can be asked again after this long. */
  readonly tootGapMs: number;
  readonly carGapMs: number;
  readonly placeGapMs: number;
  readonly whaleGapMs: number;
  readonly idleHintMs: number;
  readonly hintMax: number;
  readonly maxDtMs: number;
}

export function defaultTripTimings(): TripTimings {
  const t = Tokens.Timing;
  return {
    departMs: t.trainDepartMs,
    boardMs: t.trainBoardMs,
    boardPauseMs: t.trainBoardPauseMs,
    dropMs: t.trainDropMs,
    dropStaggerMs: t.trainDropStaggerMs,
    waveMs: t.trainWaveMs,
    skyMs: t.trainSkyMs,
    skyDelayMs: t.trainSkyDelayMs,
    tootGapMs: t.trainTootGapMs,
    carGapMs: t.trainCarGapMs,
    placeGapMs: t.trainPlaceGapMs,
    whaleGapMs: t.trainWhaleGapMs,
    idleHintMs: t.trainIdleHintMs,
    hintMax: Tokens.ui.trainHintMax,
    maxDtMs: t.trainMaxTickMs,
  };
}

/** The island the train runs on (design px of arc on `rail`). */
export interface TripWorld {
  readonly rail: Rail;
  /** The cars' pitch (ui.trainCarPitch). */
  readonly pitch: readonly number[];
  /** Each friend station's and destination's engine stop. */
  readonly stations: Readonly<Record<StationId, number>>;
  readonly dests: Readonly<Record<DestinationId, number>>;
  /** The volcano's tunnel, the level crossing (arc ranges) and the barriers' margin. */
  readonly tunnel: { readonly from: number; readonly to: number } | undefined;
  readonly crossing: { readonly from: number; readonly to: number };
  readonly crossingMargin: number;
  /** The engine passing these makes the kart's driver wave and the whale spout. */
  readonly kartS: number;
  readonly whaleS: number;
  /** Cruise (design px per ms at the scale 1; × reducedScroll under reduced motion). */
  readonly cruise: number;
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
  for (let tries = 0; out.length < n && tries < n * DRAW_TRIES; tries++) {
    const f = bag.draw();
    if (!out.includes(f)) out.push(f);
  }
  // A bag that keeps repeating (a test's fixed bag): fill from the list, still all different.
  for (const f of FRIEND_IDS) if (out.length < n && !out.includes(f)) out.push(f);
  return out;
}

// --- the route ------------------------------------------------------------------------------------------------

/** The forward arc from `a` to `b` (a stop right here is a whole lap away: a leg always moves on). */
function leg(L: number, a: number, b: number): number {
  const d = wrap(b - a, L);
  return d < 1 ? d + L : d;
}

/** How many times the path from `from` through `stops` (arc lengths) passes the point `x`. */
export function passes(L: number, from: number, stops: readonly number[], x: number): number {
  let n = 0;
  let at = from;
  for (const s of stops) {
    const len = leg(L, at, s);
    const toX = wrap(x - at, L);
    if (toX < len) n += 1 + Math.floor((len - toX) / L);
    at = s;
  }
  return n;
}

/** How many times the path from `from` through `stops` (arc lengths) passes the tunnel's mouth. */
export function tunnelPasses(world: TripWorld, from: number, stops: readonly number[]): number {
  return world.tunnel ? passes(world.rail.loop.length, from, stops, world.tunnel.from) : 0;
}

/**
 * The trip's surprise as drawn, unless it cannot happen on this trip: the kart waves and the whale spouts only as the
 * engine passes them (and the whale's bay already shows the whale). Then the sailing boat drifts by instead.
 */
export function reachableSurprise(world: TripWorld, from: number, stops: readonly StationId[], dest: DestinationId, drawn: SurpriseId): SurpriseId {
  const path = [...stops.map((id) => world.stations[id]), world.dests[dest]];
  const L = world.rail.loop.length;
  if (drawn === 'kart' && passes(L, from, path, world.kartS) === 0) return 'boat';
  if (drawn === 'whale' && (dest === 'whale' || passes(L, from, path, world.whaleS) === 0)) return 'boat';
  return drawn;
}

/**
 * The trip's stations from `from`: FRIENDS_PER_TRIP of the four, in the order the train meets them going forward, then
 * `dest`. The skipped station is drawn (rng); when that path would pass the tunnel more than once, the first skip (in
 * the drawn order) that passes it the fewest times is taken. From Ga tàu and every destination some choice passes it at
 * most once (trip.test checks the island); only a start the map's train handed over just before the volcano may pass
 * it twice on its first trip.
 */
export function planStops(world: TripWorld, from: number, dest: DestinationId, rng: () => number): StationId[] {
  const L = world.rail.loop.length;
  const ahead = (id: StationId): number => leg(L, from, world.stations[id]);
  let best: { stops: StationId[]; passes: number } | undefined;
  for (const skip of shuffle(STATION_IDS, rng)) {
    const stops = STATION_IDS.filter((id) => id !== skip).sort((a, b) => ahead(a) - ahead(b));
    const passes = tunnelPasses(world, from, [...stops.map((id) => world.stations[id]), world.dests[dest]]);
    if (passes <= 1) return stops;
    if (!best || passes < best.passes) best = { stops, passes };
  }
  return best!.stops;
}

// --- the controller -------------------------------------------------------------------------------------------

export type TripPhase = 'start' | 'depart' | 'ride' | 'arrive' | 'wait' | 'board' | 'dest' | 'dropoff';

export interface TripPartial {
  friends: string[];
  aboard: number;
  stops: string[];
  dest: string;
  surprise: string;
}

export interface TripResume extends TripPlan {
  readonly aboard: number;
}

export interface TripLines {
  /** The invitation (names Xoài): at the start. */
  readonly prompt: string;
  /** A friend waits at the station (the hint and the Speaker prompt there). */
  readonly wait: string;
  /** The station's name, as the train stops there. */
  readonly station: (s: StationId) => string;
  readonly board: (f: FriendId) => string;
  /** The n-th friend's count (from 1). */
  readonly count: (n: number) => string;
  readonly car: (c: CarColour) => string;
  readonly tunnel: string;
  readonly dest: (d: DestinationId) => string;
  readonly place: (p: PlaceId) => string;
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
  /** A friend's own call. */
  readonly call: (f: FriendId) => string;
}

export interface TripOptions {
  readonly friends: ShuffleBag<FriendId>;
  readonly destinations: ShuffleBag<DestinationId>;
  readonly surprises: ShuffleBag<SurpriseId>;
  /** The world's own draws in [0, 1): the skipped station. */
  readonly rng: () => number;
  readonly world: TripWorld;
  /** Where the engine stands at a fresh start (the map train's place). */
  readonly startS: number;
  readonly resume?: TripResume | null | undefined;
  readonly lines: TripLines;
  readonly sounds: TripSounds;
  readonly audio: TripAudio;
  readonly view: TripView;
  readonly timings?: Partial<TripTimings>;
}

export interface TripProgress {
  readonly questionIndex: number;
  readonly partial: TripPartial;
}

export interface TripController {
  start(): void;
  /** A tap on the engine (or a car) at the start: true when it started the departure; elsewhere a toot. */
  tapTrain(): boolean;
  /** A tap on car `n`: it wobbles and the voice names its colour (true when it reacted). */
  tapCar(n: number): boolean;
  /** A tap on the waiting friend or its platform: true when it started the boarding. */
  tapFriend(): boolean;
  /** A tap on the destination: true when it started the drop-off. */
  tapDest(): boolean;
  /** A tap on a place: its name (true when it spoke). */
  tapPlace(id: PlaceId): boolean;
  /** A tap on the whale: it spouts. */
  tapWhale(): boolean;
  /** Any press: the idle hint clock restarts. */
  anyTap(): void;
  tick(dtMs: number): void;
  stop(): void;
  progress(): TripProgress;
  readonly phase: TripPhase;
  readonly plan: TripPlan;
  readonly aboard: number;
  /** The station the train stands at or runs to next (undefined: the destination is next). */
  readonly station: StationId | undefined;
  /** The engine's arc length and speed (design px per ms). */
  readonly s: number;
  readonly speed: number;
  readonly pieces: readonly Piece[];
  /** How much the tunnel darkens the scene (0 … 1). */
  readonly dim: number;
  /** Any piece in the tunnel is hidden. */
  hidden(piece: Piece): boolean;
  /** A friend is aboard: Home keeps the trip to resume. */
  readonly hasProgress: boolean;
  /** An animation runs (boarding, drop-off): the friend and the destination ignore taps. */
  readonly busy: boolean;
}


export function createTripController(opts: TripOptions): TripController {
  const t = { ...defaultTripTimings(), ...opts.timings };
  const w = opts.world;
  const { audio, view, rng } = opts;
  const loop = w.rail.loop;
  const L = loop.length;

  const r = opts.resume ?? null;
  const fresh = (from: number): TripPlan => {
    const dest = opts.destinations.draw();
    const stops = planStops(w, from, dest, rng);
    return { friends: drawFriends(opts.friends, FRIENDS_PER_TRIP), stops, dest, surprise: reachableSurprise(w, from, stops, dest, opts.surprises.draw()) };
  };
  let aboard = r ? r.aboard : 0;
  let s = r ? (aboard >= FRIENDS_PER_TRIP ? w.dests[r.dest] : w.stations[r.stops[aboard]!]) : wrap(opts.startS, L);
  let plan: TripPlan = r ? { friends: [...r.friends], stops: [...r.stops], dest: r.dest, surprise: r.surprise } : fresh(s);
  if (r) {
    for (const f of r.friends) opts.friends.note(f);
    opts.destinations.note(r.dest);
    opts.surprises.note(r.surprise);
  }
  let phase: TripPhase = 'start';
  let v = 0;
  /** The arc left to the next stop (design px). */
  let left = 0;
  let pieces = trainPieces(w.rail, s, w.pitch);
  let dim = 0;
  let engineIn = false;
  let barriersDown = false;
  let surpriseDone = false;
  let skyQueued = false;
  let now = 0;
  let busyUntil = 0;
  let tootAt = -Infinity;
  let whaleAt = -Infinity;
  let placeAt = -Infinity;
  const carAt: number[] = CAR_COLOURS.map(() => -Infinity);
  let idleMs = 0;
  let hints = 0;
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
  const nextStation = (): StationId | undefined => (aboard < FRIENDS_PER_TRIP ? plan.stops[aboard] : undefined);
  const nextStopS = (): number => {
    const st = nextStation();
    return st ? w.stations[st] : w.dests[plan.dest];
  };
  const stepLine = (): string => (phase === 'start' ? opts.lines.prompt : phase === 'dest' || phase === 'dropoff' ? opts.lines.dest(plan.dest) : opts.lines.wait);
  /** A new step begins: its line is the Speaker prompt, the idle hint starts over. */
  const step = (): void => {
    hints = 0;
    idleMs = 0;
    audio.setPrompt(stepLine());
  };
  const inTunnel = (x: number): boolean => w.tunnel !== undefined && loop.inRange(x, w.tunnel.from, w.tunnel.to);

  /** The train pulls away toward its next stop. */
  const depart = (): void => {
    phase = 'depart';
    left = leg(L, s, nextStopS());
    audio.sfx(opts.sounds.toot);
    audio.sfx(opts.sounds.chug);
    view.toot();
    view.depart();
    step();
    // The boat or the balloon: after the trip's first departure with a friend aboard (a resumed trip too).
    if ((plan.surprise === 'boat' || plan.surprise === 'hot-air') && !surpriseDone && !skyQueued && aboard >= 1) {
      skyQueued = true;
      after(t.skyDelayMs, () => {
        if (surpriseDone) return;
        surpriseDone = true;
        audio.sfx(opts.sounds.chime);
        view.surprise(plan.surprise, t.skyMs);
      });
    }
  };

  /** The train stands at its stop. */
  const stopAt = (): void => {
    v = 0;
    audio.sfx(opts.sounds.hiss);
    const st = nextStation();
    if (!st) {
      phase = 'dest';
      step();
      view.arrived({ dest: plan.dest });
      audio.say(opts.lines.dest(plan.dest));
      return;
    }
    phase = 'wait';
    step();
    view.arrived({ station: st, friend: plan.friends[aboard]! });
    audio.say(opts.lines.station(st));
  };

  /** The pieces, the tunnel, the barriers and the passing surprises after the engine moved from `from` to `s`. */
  const sense = (from: number, moved: number): void => {
    pieces = trainPieces(w.rail, s, w.pitch);
    dim = tunnelCover(pieces, L, w.tunnel);
    const inside = inTunnel(s);
    if (inside && !engineIn) view.tunnelIn();
    if (!inside && engineIn) {
      // The engine comes out into the light.
      audio.sfx(opts.sounds.toot);
      audio.say(opts.lines.tunnel);
      view.tunnelOut();
    }
    engineIn = inside;
    const m = w.crossingMargin;
    const near = pieces.some((p) => loop.inRange(p.s, w.crossing.from - m, w.crossing.to + m));
    if (near !== barriersDown) {
      barriersDown = near;
      view.barriers(near);
    }
    const passed = (x: number): boolean => moved > 0 && wrap(x - from, L) > 0 && wrap(x - from, L) <= moved;
    if (!surpriseDone && plan.surprise === 'kart' && passed(w.kartS)) {
      surpriseDone = true;
      audio.sfx(opts.sounds.honk);
      view.surprise('kart', t.skyMs);
    }
    if (!surpriseDone && plan.surprise === 'whale' && passed(w.whaleS)) {
      surpriseDone = true;
      audio.sfx(opts.sounds.splash);
      view.surprise('whale', t.skyMs);
    }
  };

  /** The train moves over `dt` ms: it speeds up (or cruises) and brakes to stop exactly at its stop. */
  const motion = (dt: number): void => {
    if (phase !== 'depart' && phase !== 'ride' && phase !== 'arrive') return;
    const k = w.rail.scale(s);
    const vMax = w.cruise * k;
    const a = vMax / Math.max(1, t.departMs);
    const brake = Math.sqrt(2 * a * Math.max(0, left));
    const target = Math.min(vMax, brake);
    v = v < target ? Math.min(target, v + a * dt) : Math.max(target, v - a * dt);
    let stepPx = v * dt;
    if (stepPx >= left) stepPx = left;
    const from = s;
    s = wrap(s + stepPx, L);
    left -= stepPx;
    phase = brake < vMax && v >= brake ? 'arrive' : v < vMax ? 'depart' : 'ride';
    sense(from, stepPx);
    if (left <= 0) stopAt();
  };

  const hintTarget = (): HintTarget | undefined => {
    if (phase === 'start') return 'train';
    if (phase === 'wait') return 'friend';
    return phase === 'dest' ? 'dest' : undefined;
  };

  const toot = (): boolean => {
    if (dim > 0 || now - tootAt < t.tootGapMs) return false;
    tootAt = now;
    audio.sfx(opts.sounds.toot);
    audio.sfx(opts.sounds.puff);
    view.toot();
    return true;
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

  return {
    start() {
      if (stopped) return;
      sense(s, 0);
      view.planned(plan, aboard);
      if (!r) {
        step();
        audio.say(opts.lines.prompt);
        return;
      }
      // A resumed trip: stopped at its next station with the friend waiting, or at the destination.
      const atDest = aboard >= FRIENDS_PER_TRIP;
      phase = atDest ? 'dest' : 'wait';
      step();
      view.restore({ ...plan, aboard, atDest });
      audio.say(atDest ? opts.lines.dest(plan.dest) : opts.lines.station(nextStation()!));
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
      const st = nextStation();
      if (stopped || isBusy() || phase !== 'wait' || !st) return false;
      const f = plan.friends[aboard]!;
      const car = aboard;
      aboard += 1;
      phase = 'board';
      idleMs = 0;
      hints = 0;
      busyFor(t.boardMs);
      view.board(f, st, car, t.boardMs);
      audio.sfx(opts.sounds.call(f));
      audio.sayChain([opts.lines.board(f), opts.lines.count(aboard)]);
      after(t.boardMs, () => audio.sfx(opts.sounds.pop));
      after(t.boardMs + t.boardPauseMs, depart);
      return true;
    },
    tapDest() {
      if (stopped || isBusy() || phase !== 'dest') return false;
      const dropped = [...plan.friends];
      const at = plan.dest;
      // The next trip is planned now: Home during the drop-off never resumes delivered friends.
      plan = fresh(s);
      aboard = 0;
      surpriseDone = false;
      skyQueued = false;
      phase = 'dropoff';
      idleMs = 0;
      hints = 0;
      view.dropoff(at, dropped, t.dropMs, t.dropStaggerMs);
      dropped.forEach((f, i) => after(i * t.dropStaggerMs, () => audio.sfx(opts.sounds.call(f))));
      const landed = t.dropMs + t.dropStaggerMs * Math.max(0, dropped.length - 1);
      after(landed, () => audio.sfx(opts.sounds.chime));
      busyFor(landed + t.waveMs);
      after(landed + t.waveMs, () => {
        view.planned(plan, aboard);
        depart();
      });
      return true;
    },
    tapPlace(id) {
      if (stopped || now - placeAt < t.placeGapMs) return false;
      placeAt = now;
      audio.say(opts.lines.place(id));
      return true;
    },
    tapWhale() {
      if (stopped || now - whaleAt < t.whaleGapMs) return false;
      whaleAt = now;
      audio.sfx(opts.sounds.splash);
      view.whaleTapped();
      return true;
    },
    anyTap() {
      idleMs = 0;
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
      return { questionIndex: 0, partial: { friends: [...plan.friends], aboard, stops: [...plan.stops], dest: plan.dest, surprise: plan.surprise } };
    },
    get phase() {
      return phase;
    },
    get plan() {
      return plan;
    },
    get aboard() {
      return aboard;
    },
    get station() {
      return nextStation();
    },
    get s() {
      return s;
    },
    get speed() {
      return v;
    },
    get pieces() {
      return pieces;
    },
    get dim() {
      return dim;
    },
    hidden(piece) {
      return inTunnel(piece.s);
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
 * 1 … FRIENDS_PER_TRIP aboard; FRIENDS_PER_TRIP different known stations; a known destination and surprise. An old
 * partial (the countryside's `{ friends, aboard, dest, surprise, tunnelLeg }`) has no stops: null.
 */
export function resumeTrip(resumeAt: { readonly questionIndex: number; readonly partial?: unknown } | null): TripResume | null {
  if (!resumeAt || resumeAt.questionIndex !== 0) return null;
  const p = resumeAt.partial;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return null;
  const { friends, aboard, stops, dest, surprise } = p as Partial<Record<keyof TripPartial, unknown>>;
  const distinct = (xs: unknown[]): boolean => new Set(xs).size === xs.length;
  if (!Array.isArray(friends) || friends.length !== FRIENDS_PER_TRIP || !friends.every(isFriend) || !distinct(friends)) return null;
  if (!Array.isArray(stops) || stops.length !== FRIENDS_PER_TRIP || !stops.every(isStation) || !distinct(stops)) return null;
  if (typeof aboard !== 'number' || !Number.isInteger(aboard) || aboard < 1 || aboard > FRIENDS_PER_TRIP) return null;
  if (!isDestination(dest) || !isSurprise(surprise)) return null;
  return { friends: [...(friends as FriendId[])], aboard, stops: [...(stops as StationId[])], dest, surprise };
}

/** Every friend, destination and surprise id (the scene's bags). */
export const ALL_FRIENDS: readonly FriendId[] = FRIEND_IDS;
export const ALL_DESTINATIONS: readonly DestinationId[] = DESTINATION_IDS;
export const ALL_SURPRISES: readonly SurpriseId[] = SURPRISE_IDS;
