// Rửa xe controller (2026-10-30, spec-rua-xe), pure and Phaser-free: free play, no score, no timer, no right or wrong.
// Behind injected ports (audio, view) so every rule is node-testable; the scene clock drives `tick`. One car:
//   drive  → the dirty car drives in (`driveInMs`; longer than `skipOverMs`, so any tap skips to its end), honks, and
//            the voice says its name and "rub" (the first car of a fresh visit: the invitation that names Xoài first);
//   dirty  → `press(p)` (a tap) or `rub(p)` (a moving finger, one puff per `stepPx`) on the car puts a foam puff at p;
//            every dirt spot within `coverPx` of a puff is covered (its dirt goes away under the foam); the car
//            wiggles as if tickled (at most once per `wiggleMs`); `lift()` keeps the foam made so far;
//   foamed → once `share` of the spots is covered: the voice says "rinse", the hose bounces; rubbing still foams;
//   wash   → `tapHose()` rinses (`rinseMs` ≤ 1.5 s), the car shines (`shineMs`: twinkles, headlights, a happy honk and a
//            bounce) and drives out (`driveOutMs`); the next car (never the same twice in a row) drives in.
// While any of these animations runs (`busy`) the car and the hose ignore taps (one prominent motion at a time). The
// hose tapped before the car is foamed only nudges.
// Each car brings one surprise from a shuffle bag (never the same twice in a row): the car sneezes a bubble halfway to
// foamed, a rubber duck pops out of the foam once it is foamed, or a rainbow shows over the puddle after the rinse.
// The hose tap already moves the state to the next car (so Home during the wash never resumes a washed car); the scene
// keeps a snapshot on Home only while a car is half-washed (`hasProgress`). The partial is
// `{ vehicle, dirt, covered, surprise }`; `resumeCarWash` validates it (invalid → a fresh car).
import {
  DIRT_IDS,
  SURPRISE_IDS,
  VEHICLE_IDS,
  isDirt,
  isSurprise,
  isVehicle,
  neededSpots,
  type DirtId,
  type SurpriseId,
  type VehicleId,
} from '../../content/games/car-wash.ts';
import type { Point } from '../../content/layout-types.ts';
import { Tokens } from '../../core/tokens.ts';

export interface CarWashAudio {
  sfx(id: string): void;
  say(id: string): number;
  /** Several lines back to back under one token; returns it. */
  sayChain(ids: readonly string[]): number;
  setPrompt(id: string): void;
}

/** What the idle hint bounces: the dirty car, or the hose once the car is foamed. */
export type HintTarget = 'car' | 'hose';

/** A half-washed car shown at once (a resumed start). */
export interface CarState {
  readonly vehicle: VehicleId;
  readonly dirt: DirtId;
  /** The dirt spots already under foam. */
  readonly covered: readonly number[];
  readonly foamed: boolean;
}

export interface CarWashView {
  /** The dirty car drives in from the left to its rest spot (over `ms`). */
  driveIn(vehicle: VehicleId, dirt: DirtId, ms: number): void;
  /** A tap skipped the running drive: it jumps to its end. */
  skipDrive(): void;
  /** The car honks (a little hop). */
  honk(vehicle: VehicleId): void;
  /** A foam puff at `p` (design px; the n-th puff on this car). */
  foam(p: Point, n: number): void;
  /** Dirt spot `index` is under foam: its dirt goes away. */
  cover(index: number): void;
  /** The car is tickled: a small wiggle. */
  wiggle(): void;
  /** The car is foamed: the hose starts inviting a tap. */
  foamed(): void;
  /** The car's surprise (over `ms`). */
  surprise(id: SurpriseId, vehicle: VehicleId, ms: number): void;
  /** The hose sprays: the foam and the dirt wash away (over `ms`). */
  rinse(vehicle: VehicleId, ms: number): void;
  /** The clean car shines: soft twinkles, two headlight blinks, a bounce (over `ms`). */
  shine(vehicle: VehicleId, ms: number): void;
  /** The clean car drives out to the right (over `ms`). */
  driveOut(ms: number): void;
  /** The idle hint: the car or the hose bounces. */
  hint(target: HintTarget): void;
  /** The hose tapped before the car is foamed: a small nudge. */
  nudgeHose(): void;
  /** A resumed car shows at once at its rest spot, with foam on its covered spots. */
  restore(state: CarState): void;
}

export interface CarWashTimings {
  readonly driveInMs: number;
  readonly driveOutMs: number;
  readonly honkMs: number;
  readonly rinseMs: number;
  readonly shineMs: number;
  readonly surpriseMs: number;
  readonly wiggleMs: number;
  readonly scrubGapMs: number;
  readonly idleHintMs: number;
  readonly hintMax: number;
  readonly maxDtMs: number;
  /** A drive longer than this can be skipped with a tap. */
  readonly skipOverMs: number;
}

export function defaultCarWashTimings(): CarWashTimings {
  const t = Tokens.Timing;
  return {
    driveInMs: t.carWashDriveInMs,
    driveOutMs: t.carWashDriveOutMs,
    honkMs: t.carWashHonkMs,
    rinseMs: t.carWashRinseMs,
    shineMs: t.carWashShineMs,
    surpriseMs: t.carWashSurpriseMs,
    wiggleMs: t.carWashWiggleMs,
    scrubGapMs: t.carWashScrubGapMs,
    idleHintMs: t.carWashIdleHintMs,
    hintMax: Tokens.ui.carWashHintMax,
    maxDtMs: t.carWashMaxTickMs,
    skipOverMs: t.carWashSkipOverMs,
  };
}

export interface CarWashSizes {
  /** A puff covers a dirt spot this close (design px). */
  readonly coverPx: number;
  /** While rubbing, a new puff needs the finger this far from the last one (design px). */
  readonly stepPx: number;
  /** The share of the spots that makes the car foamed. */
  readonly share: number;
}

export function defaultCarWashSizes(): CarWashSizes {
  const u = Tokens.ui;
  return { coverPx: u.carWashFoamCoverPx, stepPx: u.carWashFoamStepPx, share: u.carWashFoamShare };
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
  /** `id` was shown without a draw (a resumed car): the next draw is not it. */
  note(id: T): void;
  readonly last: T | undefined;
}

export function createShuffleBag<T extends string>(ids: readonly T[], rng: () => number): ShuffleBag<T> {
  if (ids.length === 0) throw new Error('car-wash: an empty shuffle bag');
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

export type CarWashPhase = 'drive' | 'dirty' | 'foamed' | 'wash';

export interface CarWashPartial {
  vehicle: string;
  dirt: string;
  covered: number[];
  surprise: string;
}

export interface CarWashResume {
  readonly vehicle: VehicleId;
  readonly dirt: DirtId;
  readonly covered: readonly number[];
  readonly surprise: SurpriseId;
}

export interface CarWashLines {
  readonly prompt: string;
  readonly rub: string;
  readonly rinse: string;
  /** The vehicle's name line. */
  readonly name: (v: VehicleId) => string;
}

export interface CarWashSounds {
  readonly scrub: string;
  readonly rinse: string;
  readonly chime: string;
  readonly bubble: string;
  /** A spot of that dirt goes under the foam. */
  readonly dirt: Readonly<Record<DirtId, string>>;
  /** The vehicle's own honk or siren. */
  readonly honk: (v: VehicleId) => string;
}

export interface CarWashOptions {
  readonly vehicles: ShuffleBag<VehicleId>;
  readonly dirts: ShuffleBag<DirtId>;
  readonly surprises: ShuffleBag<SurpriseId>;
  /** Each car's dirt spots at rest (design px), from the layout anchors. */
  readonly spots: (v: VehicleId) => readonly Point[];
  readonly resume?: CarWashResume | null | undefined;
  readonly lines: CarWashLines;
  readonly sounds: CarWashSounds;
  readonly audio: CarWashAudio;
  readonly view: CarWashView;
  readonly timings?: Partial<CarWashTimings>;
  readonly sizes?: Partial<CarWashSizes>;
}

export interface CarWashProgress {
  readonly questionIndex: number;
  readonly partial: CarWashPartial;
}

export interface CarWashController {
  start(): void;
  /** A press on the car: one puff there (true when it foamed). */
  press(p: Point): boolean;
  /** The pressed finger moved over the car: a puff when it is `stepPx` from the last one (true when it foamed). */
  rub(p: Point): boolean;
  /** The finger lifted: the foam stays; the next move starts a new stroke. */
  lift(): void;
  /** True when the tap started the rinse. */
  tapHose(): boolean;
  /** Any press: the idle hint clock restarts; a long drive skips to its end. */
  anyTap(): void;
  tick(dtMs: number): void;
  stop(): void;
  progress(): CarWashProgress;
  readonly phase: CarWashPhase;
  readonly vehicle: VehicleId;
  readonly dirt: DirtId;
  readonly covered: readonly number[];
  readonly surprise: SurpriseId;
  /** Puffs made on this car. */
  readonly puffs: number;
  /** A car is half-washed (foam on it, not yet rinsed): Home keeps it to resume. */
  readonly hasProgress: boolean;
  /** An animation runs: the car and the hose ignore taps. */
  readonly busy: boolean;
}

export function createCarWashController(opts: CarWashOptions): CarWashController {
  const t = { ...defaultCarWashTimings(), ...opts.timings };
  const z = { ...defaultCarWashSizes(), ...opts.sizes };
  const { audio, view } = opts;
  const r = opts.resume ?? null;
  let vehicle: VehicleId = r ? r.vehicle : opts.vehicles.draw();
  let dirt: DirtId = r ? r.dirt : opts.dirts.draw();
  let surprise: SurpriseId = r ? r.surprise : opts.surprises.draw();
  if (r) {
    opts.vehicles.note(r.vehicle);
    opts.dirts.note(r.dirt);
    opts.surprises.note(r.surprise);
  }
  let covered: number[] = r ? [...r.covered] : [];
  let phase: CarWashPhase = 'drive';
  // A resumed car already shows one puff per covered spot.
  let puffs = r ? r.covered.length : 0;
  let last: Point | undefined;
  let now = 0;
  let busyUntil = 0;
  let driveEnd = 0;
  let skippable = false;
  let lastWiggle = -Infinity;
  let lastScrub = -Infinity;
  let sneezed = false;
  let first = !r;
  let stopped = false;
  let idleMs = 0;
  let hints = 0;
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
  const needed = (): number => neededSpots(opts.spots(vehicle).length, z.share);
  const stepLine = (): string => (phase === 'foamed' ? opts.lines.rinse : opts.lines.rub);
  /** A new step begins: its line is the prompt, the idle hint starts over. */
  const step = (lines: readonly string[]): void => {
    hints = 0;
    idleMs = 0;
    audio.setPrompt(stepLine());
    if (lines.length === 1) audio.say(lines[0]!);
    else audio.sayChain(lines);
  };

  /** A drive of `ms` (skippable when long); `then` runs at its end. */
  const drive = (ms: number, then: () => void): void => {
    busyFor(ms);
    driveEnd = now + ms;
    skippable = ms > t.skipOverMs;
    after(ms, () => {
      skippable = false;
      then();
    });
  };

  /** The car `v` drives in dirty; at its spot it honks, and the voice says its name and "rub". */
  const arrive = (): void => {
    phase = 'drive';
    puffs = 0;
    last = undefined;
    sneezed = false;
    const v = vehicle;
    view.driveIn(v, dirt, t.driveInMs);
    drive(t.driveInMs, () => {
      phase = 'dirty';
      audio.sfx(opts.sounds.honk(v));
      view.honk(v);
      busyFor(t.honkMs);
      step(first ? [opts.lines.prompt, opts.lines.name(v), opts.lines.rub] : [opts.lines.name(v), opts.lines.rub]);
      first = false;
    });
  };

  /** A surprise shows (busy over its time). */
  const showSurprise = (id: SurpriseId, v: VehicleId): void => {
    view.surprise(id, v, t.surpriseMs);
    busyFor(t.surpriseMs);
  };

  const becomeFoamed = (): void => {
    phase = 'foamed';
    if (surprise === 'duck') showSurprise('duck', vehicle);
    step([opts.lines.rinse]);
    view.foamed();
  };

  /** One puff at `p`: the spots it covers, the sounds, the wiggle, the surprise and the foamed step. */
  const puff = (p: Point): boolean => {
    if (stopped || isBusy() || (phase !== 'dirty' && phase !== 'foamed')) return false;
    view.foam(p, puffs);
    puffs += 1;
    last = p;
    idleMs = 0;
    if (now - lastScrub >= t.scrubGapMs) {
      audio.sfx(opts.sounds.scrub);
      lastScrub = now;
    }
    if (now - lastWiggle >= t.wiggleMs) {
      view.wiggle();
      lastWiggle = now;
    }
    const spots = opts.spots(vehicle);
    let newly = false;
    spots.forEach((s, i) => {
      if (covered.includes(i) || Math.hypot(s.x - p.x, s.y - p.y) > z.coverPx) return;
      covered.push(i);
      view.cover(i);
      newly = true;
    });
    if (newly) audio.sfx(opts.sounds.dirt[dirt]);
    if (phase !== 'dirty') return true;
    if (covered.length >= needed()) becomeFoamed();
    else if (newly && surprise === 'bubble' && !sneezed && covered.length >= Math.ceil(needed() / 2)) {
      sneezed = true;
      showSurprise('bubble', vehicle);
      after(t.surpriseMs, () => audio.sfx(opts.sounds.bubble));
    }
    return true;
  };

  /** The hose was tapped on a foamed car: rinse, (rainbow), shine, drive out, then the next car. */
  const wash = (): void => {
    const v = vehicle;
    const rainbow = surprise === 'rainbow';
    // The state moves to the next car now: Home during the wash never resumes a washed car.
    vehicle = opts.vehicles.draw();
    dirt = opts.dirts.draw();
    surprise = opts.surprises.draw();
    covered = [];
    phase = 'wash';
    idleMs = 0;
    hints = 0;
    audio.sfx(opts.sounds.rinse);
    view.rinse(v, t.rinseMs);
    let at = t.rinseMs;
    if (rainbow) {
      after(at, () => view.surprise('rainbow', v, t.surpriseMs));
      at += t.surpriseMs;
    }
    after(at, () => {
      audio.sfx(opts.sounds.chime);
      view.shine(v, t.shineMs);
    });
    after(at + t.shineMs / 2, () => audio.sfx(opts.sounds.honk(v)));
    at += t.shineMs;
    busyFor(at + t.driveOutMs);
    after(at, () => {
      view.driveOut(t.driveOutMs);
      drive(t.driveOutMs, () => arrive());
    });
  };

  return {
    start() {
      if (stopped) return;
      if (!r) {
        arrive();
        return;
      }
      phase = covered.length >= needed() ? 'foamed' : 'dirty';
      sneezed = covered.length > 0;
      view.restore({ vehicle, dirt, covered: [...covered], foamed: phase === 'foamed' });
      step([stepLine()]);
      if (phase === 'foamed') view.foamed();
    },
    press(p) {
      return puff(p);
    },
    rub(p) {
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < z.stepPx) return false;
      return puff(p);
    },
    lift() {
      last = undefined;
    },
    tapHose() {
      if (stopped || isBusy()) return false;
      if (phase !== 'foamed') {
        view.nudgeHose();
        return false;
      }
      wash();
      return true;
    },
    anyTap() {
      idleMs = 0;
      if (stopped || !skippable || now >= driveEnd) return;
      // Skip: the clock jumps to the drive's end (everything queued moves up with it).
      const jump = driveEnd - now;
      for (const q of queue) q.at = Math.max(now, q.at - jump);
      busyUntil = Math.max(now, busyUntil - jump);
      driveEnd = now;
      view.skipDrive();
      runDue();
    },
    tick(dtMs) {
      if (stopped) return;
      const dt = Math.max(0, Math.min(t.maxDtMs, Number.isFinite(dtMs) ? dtMs : 0));
      now += dt;
      runDue();
      if (stopped || isBusy() || (phase !== 'dirty' && phase !== 'foamed')) return;
      idleMs += dt;
      if (idleMs < t.idleHintMs || hints >= t.hintMax) return;
      idleMs = 0;
      hints += 1;
      view.hint(phase === 'foamed' ? 'hose' : 'car');
      audio.say(stepLine());
    },
    stop() {
      stopped = true;
      queue = [];
    },
    progress() {
      // questionIndex stays 0: free play closes no question.
      return { questionIndex: 0, partial: { vehicle, dirt, covered: [...covered], surprise } };
    },
    get phase() {
      return phase;
    },
    get vehicle() {
      return vehicle;
    },
    get dirt() {
      return dirt;
    },
    get covered() {
      return covered;
    },
    get surprise() {
      return surprise;
    },
    get puffs() {
      return puffs;
    },
    get hasProgress() {
      return (phase === 'dirty' || phase === 'foamed') && covered.length > 0;
    },
    get busy() {
      return isBusy();
    },
  };
}

/**
 * The resume a snapshot allows, or null (a fresh car): `questionIndex` 0; a known vehicle, dirt and surprise; 1 …
 * `spots` distinct covered spot indices below `spots` (an untouched car is not kept).
 */
export function resumeCarWash(resumeAt: { readonly questionIndex: number; readonly partial?: unknown } | null, spots: number): CarWashResume | null {
  if (!resumeAt || resumeAt.questionIndex !== 0) return null;
  const p = resumeAt.partial;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return null;
  const { vehicle, dirt, covered, surprise } = p as Partial<Record<keyof CarWashPartial, unknown>>;
  if (!isVehicle(vehicle) || !isDirt(dirt) || !isSurprise(surprise)) return null;
  if (!Array.isArray(covered) || covered.length === 0 || covered.length > spots) return null;
  if (!covered.every((n) => Number.isInteger(n) && n >= 0 && n < spots) || new Set(covered).size !== covered.length) return null;
  return { vehicle, dirt, covered: [...(covered as number[])], surprise };
}

/** Every vehicle, dirt and surprise id (the scene's bags). */
export const ALL_VEHICLES: readonly VehicleId[] = VEHICLE_IDS;
export const ALL_DIRTS: readonly DirtId[] = DIRT_IDS;
export const ALL_SURPRISES: readonly SurpriseId[] = SURPRISE_IDS;
