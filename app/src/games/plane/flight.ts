// Phi công nhí flight model (2026-11-11, spec-phi-cong-nhi), pure and Phaser-free: free play, no score, no timer, no
// right or wrong. Behind injected ports (audio, view) so every rule is node-testable; the scene clock drives `tick`.
// The model owns every position (design px): the plane's height, the scrolled distance, the balloon, the clouds, the
// bird and the friend's house; the scene only draws what it reads here. One flight:
//   ground  → the plane waits on the grass; `tapPlane()` starts the take-off;
//   takeoff → the plane climbs to the middle height while the sky starts to scroll (`takeOffMs`; longer than
//             `skipOverMs`, so any tap skips to its end);
//   fly     → `press(p)` sets the target height (the plane eases to it), `move(p)` follows the finger while it is
//             down, `lift()` keeps the height. One balloon at a time floats in; within `catchRadius` of the plane it
//             pops, its gift goes on board and the voice names the colour and the count. A miss costs nothing. After
//             `helpAfterMisses` misses in a row, or `helpIdleMs` without steering, the next balloon comes in at the
//             plane's own height. The first catch of a flight shows its surprise (no balloon comes meanwhile);
//   approach→ after the last gift the friend's house scrolls in and the sky eases to a stop;
//   house   → `tapFriend()` (the friend or its house) drops the gifts;
//   drop    → the gifts float down one after another (`dropMs` each, ≤ 1.5 s; taps ignored), the friend reacts with
//             its call and its happy move;
//   flyoff  → the wings waggle and the sky speeds up again (`flyOffMs`, skippable); the house scrolls away during the
//             next flight, which goes to another friend (never the same twice in a row).
// A cloud that meets the plane gives a soft bounce (once per pass; it never stops the plane); a press on a cloud or the
// bird makes it react (and still steers). The `tapFriend` already moves the state to the next flight, so Home during
// the drop never resumes delivered gifts; the scene keeps a snapshot on Home only while the plane is in the air with
// its gifts not yet dropped (`hasProgress`). The partial is `{ friend, gifts, surprise }`; `resumeFlight` validates it
// (invalid → a fresh take-off).
import {
  CLOUD_COUNT,
  COLOUR_IDS,
  FRIEND_IDS,
  GIFTS_PER_FLIGHT,
  SKY,
  SURPRISE_IDS,
  isColour,
  isFriend,
  isSurprise,
  laneYs,
  type ColourId,
  type FriendId,
  type SurpriseId,
} from '../../content/games/plane.ts';
import type { Point } from '../../content/layout-types.ts';
import { Tokens } from '../../core/tokens.ts';

export interface FlightAudio {
  sfx(id: string): void;
  say(id: string): number;
  /** Several lines back to back under one token; returns it. */
  sayChain(ids: readonly string[]): number;
  setPrompt(id: string): void;
}

/** What the idle hint bounces: the parked plane, the balloon on its way, or the friend at its house. */
export type HintTarget = 'plane' | 'balloon' | 'friend';

/** What a press in the sky did: it steered (always, in the air), and maybe a bird or a cloud was under it. */
export type PressHit = 'none' | 'steer' | 'bird' | 'cloud';

/** A flight shown at once (a resumed start): in the air with its gifts on board; at the house when it has them all. */
export interface FlightState {
  readonly friend: FriendId;
  readonly gifts: readonly ColourId[];
  readonly atHouse: boolean;
}

export interface FlightView {
  /** A fresh start: the plane waits on the grass. */
  park(): void;
  /** The propeller spins and the plane climbs (over `ms`). */
  takeOff(ms: number): void;
  /** A tap skipped the running take-off or fly-off: it jumps to its end. */
  skip(): void;
  /** A balloon of `colour` starts floating in. */
  balloonIn(colour: ColourId): void;
  /** The missed balloon has left the screen. */
  balloonGone(): void;
  /** The plane touched the balloon at `at`: it pops and its gift (the n-th on board, from 1) hops into the plane. */
  caught(colour: ColourId, n: number, at: Point): void;
  /** Cloud `index` met the plane: a puff and a soft bounce. */
  cloudBump(index: number): void;
  /** Cloud `index` or the bird was pressed: a small reaction. */
  cloudTapped(index: number): void;
  birdTapped(): void;
  /** This flight's surprise passes (over `ms`). */
  surprise(id: SurpriseId, ms: number): void;
  /** The friend and its house start scrolling in. */
  houseIn(friend: FriendId): void;
  /** They stand at their spot: the friend invites a tap. */
  arrived(friend: FriendId): void;
  /** The gifts float down on parachutes, one every `staggerMs`, `ms` each. */
  drop(friend: FriendId, gifts: readonly ColourId[], ms: number, staggerMs: number): void;
  /** The friend's happy move (over `ms`). */
  friendHappy(friend: FriendId, ms: number): void;
  /** The wings waggle and the plane flies on (over `ms`). */
  flyOff(ms: number): void;
  /** The house has scrolled away. */
  houseGone(): void;
  /** The idle hint: its target bounces. */
  hint(target: HintTarget): void;
  /** A resumed flight shows at once. */
  restore(state: FlightState): void;
}

export interface FlightTimings {
  readonly takeOffMs: number;
  readonly flyOffMs: number;
  /** A take-off or fly-off longer than this can be skipped with a tap. */
  readonly skipOverMs: number;
  readonly glideMs: number;
  readonly balloonGapMs: number;
  readonly firstBalloonMs: number;
  readonly helpIdleMs: number;
  readonly approachMaxMs: number;
  readonly dropMs: number;
  readonly dropStaggerMs: number;
  readonly happyMs: number;
  readonly surpriseMs: number;
  readonly idleHintMs: number;
  readonly hintMax: number;
  readonly maxDtMs: number;
}

export function defaultFlightTimings(): FlightTimings {
  const t = Tokens.Timing;
  return {
    takeOffMs: t.planeTakeOffMs,
    flyOffMs: t.planeFlyOffMs,
    skipOverMs: t.planeSkipOverMs,
    glideMs: t.planeGlideMs,
    balloonGapMs: t.planeBalloonGapMs,
    firstBalloonMs: SKY.firstBalloonMs,
    helpIdleMs: t.planeHelpIdleMs,
    approachMaxMs: t.planeApproachMaxMs,
    dropMs: t.planeDropMs,
    dropStaggerMs: t.planeDropStaggerMs,
    happyMs: t.planeHappyMs,
    surpriseMs: t.planeSurpriseMs,
    idleHintMs: t.planeIdleHintMs,
    hintMax: Tokens.ui.planeHintMax,
    maxDtMs: t.planeMaxTickMs,
  };
}

/** Where things are (design px). */
export interface FlightGeometry {
  /** The screen's width. */
  readonly width: number;
  /** The plane's fixed x; its centre's height while parked. */
  readonly planeX: number;
  readonly groundY: number;
  /** The plane's centre flies between these heights. */
  readonly topY: number;
  readonly bottomY: number;
  /** The house's ground pivot x at rest. */
  readonly houseX: number;
}

export interface FlightSizes {
  readonly catchRadius: number;
  /** Speeds in design px per second. */
  readonly scrollPxPerS: number;
  readonly balloonPxPerS: number;
  readonly cloudPxPerS: number;
  readonly birdPxPerS: number;
  /** Every speed is × this (reduced motion: a slower sky). */
  readonly speedScale: number;
  readonly helpAfterMisses: number;
  readonly edgePadPx: number;
  readonly cloudBumpPx: number;
  readonly tapRadiusPx: number;
  readonly birdGapPx: number;
  readonly housePadPx: number;
}

export function defaultFlightSizes(reduced = false): FlightSizes {
  const u = Tokens.ui;
  return {
    catchRadius: u.planeCatchRadiusPx,
    scrollPxPerS: u.planeScrollPxPerS,
    balloonPxPerS: u.planeBalloonPxPerS,
    cloudPxPerS: u.planeCloudPxPerS,
    birdPxPerS: u.planeBirdPxPerS,
    speedScale: reduced ? u.planeReducedScroll : 1,
    helpAfterMisses: u.planeHelpAfterMisses,
    edgePadPx: u.planeEdgePadPx,
    cloudBumpPx: u.planeCloudBumpPx,
    tapRadiusPx: u.planeTapRadiusPx,
    birdGapPx: u.planeBirdGapPx,
    housePadPx: u.planeHousePadPx,
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
  /** `id` was shown without a draw (a resumed flight): the next draw is not it. */
  note(id: T): void;
  readonly last: T | undefined;
}

export function createShuffleBag<T extends string>(ids: readonly T[], rng: () => number): ShuffleBag<T> {
  if (ids.length === 0) throw new Error('plane: an empty shuffle bag');
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

// --- the controller -------------------------------------------------------------------------------------------

export type FlightPhase = 'ground' | 'takeoff' | 'fly' | 'approach' | 'house' | 'drop' | 'flyoff';

export interface FlightPartial {
  friend: string;
  gifts: string[];
  surprise: string;
}

export interface FlightResume {
  readonly friend: FriendId;
  readonly gifts: readonly ColourId[];
  readonly surprise: SurpriseId;
}

export interface FlightLines {
  /** The invitation (names Xoài): before take-off. */
  readonly prompt: string;
  /** "Touch the balloons": in the air. */
  readonly balloons: string;
  readonly colour: (c: ColourId) => string;
  /** The n-th gift's count (from 1). */
  readonly count: (n: number) => string;
  /** "Drop the gifts for <friend>". */
  readonly drop: (f: FriendId) => string;
}

export interface FlightSounds {
  readonly propeller: string;
  readonly whoosh: string;
  readonly boing: string;
  readonly pop: string;
  readonly chime: string;
  readonly puff: string;
  readonly chirp: string;
  /** The friend's own call. */
  readonly call: (f: FriendId) => string;
}

export interface FlightOptions {
  readonly friends: ShuffleBag<FriendId>;
  readonly colours: ShuffleBag<ColourId>;
  readonly surprises: ShuffleBag<SurpriseId>;
  /** The sky's own draws in [0, 1): the balloon lanes and the clouds' heights. */
  readonly rng: () => number;
  readonly geometry: FlightGeometry;
  readonly resume?: FlightResume | null | undefined;
  readonly lines: FlightLines;
  readonly sounds: FlightSounds;
  readonly audio: FlightAudio;
  readonly view: FlightView;
  readonly timings?: Partial<FlightTimings>;
  readonly sizes?: Partial<FlightSizes>;
}

export interface FlightProgress {
  readonly questionIndex: number;
  readonly partial: FlightPartial;
}

export interface Balloon {
  readonly colour: ColourId;
  readonly x: number;
  readonly y: number;
}

export interface House {
  readonly friend: FriendId;
  /** Its ground pivot's x now. */
  readonly x: number;
}

export interface FlightController {
  start(): void;
  /** A tap on the parked plane: true when it started the take-off. */
  tapPlane(): boolean;
  /** A tap on the friend or its house: true when it started the drop. */
  tapFriend(): boolean;
  /** A press in the sky: in the air it sets the target height (and a bird or cloud under it reacts). */
  press(p: Point): PressHit;
  /** The pressed finger moved: the target follows it. */
  move(p: Point): void;
  /** The finger lifted: the plane keeps its height. */
  lift(): void;
  /** Any press: the idle hint clock restarts; a long take-off or fly-off skips to its end. */
  anyTap(): void;
  tick(dtMs: number): void;
  stop(): void;
  progress(): FlightProgress;
  readonly phase: FlightPhase;
  /** The friend this flight flies to, its gifts on board (colours, in order) and its surprise. */
  readonly friend: FriendId;
  readonly gifts: readonly ColourId[];
  readonly surprise: SurpriseId;
  /** The plane's centre height now, and where it is heading. */
  readonly planeY: number;
  readonly targetY: number;
  /** How far the ground has scrolled (design px; it only grows). */
  readonly scroll: number;
  readonly balloon: Balloon | null;
  readonly clouds: readonly Point[];
  readonly bird: Point;
  readonly house: House | null;
  /** Balloons missed in a row. */
  readonly misses: number;
  /** The plane is in the air with its gifts not yet dropped: Home keeps the flight to resume. */
  readonly hasProgress: boolean;
  /** An animation runs (take-off, drop, fly-off): the plane and the friend ignore taps. */
  readonly busy: boolean;
}

const clamp01 = (k: number): number => Math.max(0, Math.min(1, k));
const easeInOut = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));

export function createFlightController(opts: FlightOptions): FlightController {
  const t = { ...defaultFlightTimings(), ...opts.timings };
  const z = { ...defaultFlightSizes(), ...opts.sizes };
  const g = opts.geometry;
  const { audio, view, rng } = opts;
  const lanes = laneYs(g.topY, g.bottomY);
  const midY = lanes[1];
  const clampY = (y: number): number => Math.max(g.topY, Math.min(g.bottomY, y));
  /** Speeds in design px per ms. */
  const cruise = (z.scrollPxPerS * z.speedScale) / SKY.msPerS;
  const balloonV = (z.balloonPxPerS * z.speedScale) / SKY.msPerS;
  const cloudV = (z.cloudPxPerS * z.speedScale) / SKY.msPerS;
  const birdV = (z.birdPxPerS * z.speedScale) / SKY.msPerS;
  const houseStartX = g.width + z.housePadPx;
  const approachMs = cruise > 0 ? Math.min(t.approachMaxMs, (2 * (houseStartX - g.houseX)) / cruise) : t.approachMaxMs;

  const r = opts.resume ?? null;
  let friend: FriendId = r ? r.friend : opts.friends.draw();
  let surprise: SurpriseId = r ? r.surprise : opts.surprises.draw();
  if (r) {
    opts.friends.note(r.friend);
    opts.surprises.note(r.surprise);
  }
  let gifts: ColourId[] = r ? [...r.gifts] : [];
  let phase: FlightPhase = 'ground';
  let planeY = g.groundY;
  let targetY = midY;
  let scroll = 0;
  let balloon: { colour: ColourId; x: number; y: number } | null = null;
  let house: { friend: FriendId; x: number } | null = null;
  const cloudY = (): number => g.topY - SKY.cloudAbovePx + rng() * (g.bottomY - g.topY + SKY.cloudAbovePx);
  const clouds: { x: number; y: number; bumped: boolean }[] = Array.from({ length: CLOUD_COUNT }, (_, i) => ({
    x: g.width * (SKY.cloudStart[i % SKY.cloudStart.length] ?? 1),
    y: cloudY(),
    bumped: false,
  }));
  const bird = { x: g.width * SKY.birdStart, y: g.topY - SKY.birdAbovePx };
  let now = 0;
  /** Time in the running take-off, approach or fly-off. */
  let phaseT = 0;
  let busyUntil = 0;
  let skipEnd = 0;
  let skippable = false;
  let spawnAt = 0;
  let misses = 0;
  let steerIdleMs = 0;
  let idleMs = 0;
  let hints = 0;
  let held = false;
  let surpriseShown = false;
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
  const inAir = (): boolean => phase === 'fly' || phase === 'approach' || phase === 'house' || phase === 'flyoff';
  const stepLine = (): string => (phase === 'ground' ? opts.lines.prompt : phase === 'house' || phase === 'approach' ? opts.lines.drop(friend) : opts.lines.balloons);
  /** A new step begins: its line is the Speaker prompt, the idle hint starts over. */
  const step = (): void => {
    hints = 0;
    idleMs = 0;
    audio.setPrompt(stepLine());
  };

  /** An animation of `ms` (skippable when long); `then` runs at its end. */
  const run = (ms: number, then: () => void): void => {
    phaseT = 0;
    busyFor(ms);
    skipEnd = now + ms;
    skippable = ms > t.skipOverMs;
    after(ms, () => {
      skippable = false;
      then();
    });
  };

  /** The flight begins (after a take-off or a fly-off): balloons start coming. */
  const fly = (): void => {
    phase = 'fly';
    spawnAt = now + t.firstBalloonMs;
    steerIdleMs = 0;
    step();
  };

  const spawn = (): void => {
    const help = misses >= z.helpAfterMisses || steerIdleMs >= t.helpIdleMs;
    const lane = lanes[Math.min(lanes.length - 1, Math.floor(rng() * lanes.length))]!;
    const colour = opts.colours.draw();
    balloon = { colour, x: g.width + z.edgePadPx, y: help ? clampY(planeY) : lane };
    view.balloonIn(colour);
  };

  /** The last gift is on board: the friend's house scrolls in and the sky eases to a stop. */
  const approach = (): void => {
    phase = 'approach';
    phaseT = 0;
    house = { friend, x: houseStartX };
    view.houseIn(friend);
    step();
    const f = friend;
    after(approachMs, () => {
      phase = 'house';
      if (house) house.x = g.houseX;
      idleMs = 0;
      view.arrived(f);
      // Only now can the friend be tapped: the voice asks for the drop as it stands still.
      audio.say(opts.lines.drop(f));
    });
  };

  const caught = (): void => {
    if (!balloon) return;
    const { colour, x, y } = balloon;
    balloon = null;
    gifts.push(colour);
    misses = 0;
    const n = gifts.length;
    audio.sfx(opts.sounds.pop);
    view.caught(colour, n, { x, y });
    audio.sayChain([opts.lines.colour(colour), opts.lines.count(n)]);
    if (n >= GIFTS_PER_FLIGHT) {
      approach();
      return;
    }
    spawnAt = now + t.balloonGapMs;
    if (surpriseShown) return;
    surpriseShown = true;
    view.surprise(surprise, t.surpriseMs);
    spawnAt = now + Math.max(t.balloonGapMs, t.surpriseMs);
  };

  /** The wings waggle and the sky speeds up again; then the next flight's balloons come. */
  const flyOff = (): void => {
    phase = 'flyoff';
    audio.sfx(opts.sounds.whoosh);
    view.flyOff(t.flyOffMs);
    run(t.flyOffMs, fly);
  };

  /** Everything that moves, over `dt` ms. */
  const motion = (dt: number): void => {
    const k0 = clamp01(phaseT / (phase === 'approach' ? approachMs : phase === 'takeoff' ? t.takeOffMs : t.flyOffMs));
    phaseT += dt;
    const k1 = clamp01(phaseT / (phase === 'approach' ? approachMs : phase === 'takeoff' ? t.takeOffMs : t.flyOffMs));
    let dx = 0;
    if (phase === 'takeoff') {
      planeY = g.groundY + (midY - g.groundY) * easeInOut(k1);
      dx = (cruise * t.takeOffMs * (k1 * k1 - k0 * k0)) / 2;
    } else if (phase === 'flyoff') {
      dx = (cruise * t.flyOffMs * (k1 * k1 - k0 * k0)) / 2;
    } else if (phase === 'fly') {
      dx = cruise * dt;
    } else if (phase === 'approach' && house) {
      // A cubic Hermite from the cruise speed to 0 over the distance D: no speed jump even when approachMs is capped.
      const d = houseStartX - g.houseX;
      const k2 = k1 * k1;
      const k3 = k2 * k1;
      const x = houseStartX - (approachMs * cruise * (k3 - 2 * k2 + k1) + d * (k2 + 2 * (k2 - k3)));
      dx = house.x - x;
      house.x = x;
    }
    scroll += dx;
    if (house && (phase === 'fly' || phase === 'flyoff')) {
      house.x -= dx;
      if (house.x < -z.housePadPx) {
        house = null;
        view.houseGone();
      }
    }
    if (inAir() || phase === 'drop') planeY += (targetY - planeY) * (1 - Math.exp(-dt / t.glideMs));
    // The clouds drift with the sky (a little even while it stands still); the bird always flies.
    const share = dt > 0 && cruise > 0 ? Math.min(1, dx / (cruise * dt)) : 0;
    const cv = cloudV * (SKY.cloudIdle + (1 - SKY.cloudIdle) * share);
    clouds.forEach((c, i) => {
      c.x -= cv * dt;
      if (c.x < -z.edgePadPx) {
        c.x = g.width + z.edgePadPx + rng() * g.width * SKY.cloudSpread;
        c.y = cloudY();
        c.bumped = false;
      }
      if (c.bumped || (phase !== 'fly' && phase !== 'approach')) return;
      if (Math.hypot(c.x - g.planeX, c.y - planeY) > z.cloudBumpPx) return;
      c.bumped = true;
      audio.sfx(opts.sounds.boing);
      view.cloudBump(i);
    });
    bird.x -= birdV * dt;
    if (bird.x < -z.edgePadPx) bird.x = g.width + z.edgePadPx + z.birdGapPx;
    if (phase !== 'fly') return;
    steerIdleMs += dt;
    if (!balloon) {
      if (gifts.length < GIFTS_PER_FLIGHT && now >= spawnAt) spawn();
      return;
    }
    balloon.x -= balloonV * dt;
    if (Math.hypot(balloon.x - g.planeX, balloon.y - planeY) <= z.catchRadius) {
      caught();
    } else if (balloon.x < -z.edgePadPx) {
      // A miss costs nothing: the next balloon comes soon.
      balloon = null;
      misses += 1;
      spawnAt = now + t.balloonGapMs;
      view.balloonGone();
    }
  };

  const hintTarget = (): HintTarget | undefined => {
    if (phase === 'ground') return 'plane';
    if (phase === 'house') return 'friend';
    return phase === 'fly' && balloon ? 'balloon' : undefined;
  };

  return {
    start() {
      if (stopped) return;
      if (!r) {
        view.park();
        step();
        audio.say(opts.lines.prompt);
        return;
      }
      // A resumed flight: in the air at the middle height, its gifts on board; at the house when it has them all.
      planeY = midY;
      surpriseShown = gifts.length > 0;
      const atHouse = gifts.length >= GIFTS_PER_FLIGHT;
      if (atHouse) {
        phase = 'house';
        house = { friend, x: g.houseX };
        step();
      } else {
        fly();
      }
      view.restore({ friend, gifts: [...gifts], atHouse });
      audio.say(stepLine());
    },
    tapPlane() {
      if (stopped || isBusy() || phase !== 'ground') return false;
      phase = 'takeoff';
      targetY = midY;
      audio.sfx(opts.sounds.propeller);
      view.takeOff(t.takeOffMs);
      run(t.takeOffMs, () => {
        planeY = midY;
        fly();
        audio.say(opts.lines.balloons);
      });
      return true;
    },
    tapFriend() {
      if (stopped || isBusy() || phase !== 'house') return false;
      const f = friend;
      const dropped = gifts;
      // The state moves to the next flight now: Home during the drop never resumes delivered gifts.
      friend = opts.friends.draw();
      surprise = opts.surprises.draw();
      gifts = [];
      surpriseShown = false;
      misses = 0;
      phase = 'drop';
      idleMs = 0;
      hints = 0;
      view.drop(f, dropped, t.dropMs, t.dropStaggerMs);
      dropped.forEach((_, i) => after(i * t.dropStaggerMs + t.dropMs, () => audio.sfx(opts.sounds.puff)));
      const landed = t.dropMs + t.dropStaggerMs * Math.max(0, dropped.length - 1);
      after(landed, () => {
        audio.sfx(opts.sounds.call(f));
        audio.sfx(opts.sounds.chime);
        view.friendHappy(f, t.happyMs);
      });
      busyFor(landed + t.happyMs + t.flyOffMs);
      after(landed + t.happyMs, flyOff);
      return true;
    },
    press(p) {
      if (stopped || !inAir()) return 'none';
      let hit: PressHit = 'steer';
      const cloud = clouds.findIndex((c) => Math.hypot(c.x - p.x, c.y - p.y) <= z.tapRadiusPx);
      if (Math.hypot(bird.x - p.x, bird.y - p.y) <= z.tapRadiusPx) {
        hit = 'bird';
        audio.sfx(opts.sounds.chirp);
        view.birdTapped();
      } else if (cloud >= 0) {
        hit = 'cloud';
        audio.sfx(opts.sounds.puff);
        view.cloudTapped(cloud);
      }
      held = true;
      steerIdleMs = 0;
      targetY = clampY(p.y);
      return hit;
    },
    move(p) {
      if (stopped || !held || !inAir()) return;
      steerIdleMs = 0;
      targetY = clampY(p.y);
    },
    lift() {
      held = false;
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
      if (!target || held) {
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
      return { questionIndex: 0, partial: { friend, gifts: [...gifts], surprise } };
    },
    get phase() {
      return phase;
    },
    get friend() {
      return friend;
    },
    get gifts() {
      return gifts;
    },
    get surprise() {
      return surprise;
    },
    get planeY() {
      return planeY;
    },
    get targetY() {
      return targetY;
    },
    get scroll() {
      return scroll;
    },
    get balloon() {
      return balloon;
    },
    get clouds() {
      return clouds;
    },
    get bird() {
      return bird;
    },
    get house() {
      return house;
    },
    get misses() {
      return misses;
    },
    get hasProgress() {
      return phase === 'fly' || phase === 'approach' || phase === 'house';
    },
    get busy() {
      return isBusy();
    },
  };
}

/**
 * The resume a snapshot allows, or null (a fresh take-off): `questionIndex` 0; a known friend and surprise; at most
 * GIFTS_PER_FLIGHT gifts, each a known colour.
 */
export function resumeFlight(resumeAt: { readonly questionIndex: number; readonly partial?: unknown } | null): FlightResume | null {
  if (!resumeAt || resumeAt.questionIndex !== 0) return null;
  const p = resumeAt.partial;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return null;
  const { friend, gifts, surprise } = p as Partial<Record<keyof FlightPartial, unknown>>;
  if (!isFriend(friend) || !isSurprise(surprise)) return null;
  if (!Array.isArray(gifts) || gifts.length > GIFTS_PER_FLIGHT || !gifts.every(isColour)) return null;
  return { friend, gifts: [...(gifts as ColourId[])], surprise };
}

/** Every friend, colour and surprise id (the scene's bags). */
export const ALL_FRIENDS: readonly FriendId[] = FRIEND_IDS;
export const ALL_COLOURS: readonly ColourId[] = COLOUR_IDS;
export const ALL_SURPRISES: readonly SurpriseId[] = SURPRISE_IDS;
