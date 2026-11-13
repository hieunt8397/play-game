// The island's rides on the map (2026-11-13, spec-dao-moi-xe-ra-dao), pure and Phaser-free: the toy train going
// round its rail loop, the plane's take-off / loop / landing, the rocket's steam puff. Map draws what these models say
// each frame and wires the taps; every rule is node-testable here.
//
// Geometry: the rail (`path.rail`) and the plane's loop (`path.plane-loop`) are closed polylines in design px. Each has
// an `-up` twin (the same world points lifted 1 m), whose screen distance to the base point is the local scale: a
// sprite rendered at the ride's anchor is drawn at `scaleAt(s)` (the perspective makes far things smaller). `compass`
// (`path.compass`: a world origin, +1 m east, +1 m north on the ground) maps a screen direction back to a world heading,
// which picks one of the 8 rendered heading frames (sprites are never rotated).
//
// The train (MapTrain): its engine runs on the loop's arc length `s` (counter-clockwise seen from above, as the rail
// was laid); the cars trail it at fixed arc gaps. Speed eases between 0 and cruise with a constant acceleration.
//   - It stops at Ga tàu (`stationS`) every lap and dwells `dwellMs`.
//   - Before the level crossing it stops at the signal (`signalS`) while the kart is driving over it (`kartOnCrossing`).
//   - Any piece inside the tunnel's arc range is hidden; the crossing's barriers are down while any piece is within
//     `crossingMargin` of the crossing's range.
//   - `hold()` brings it to a gentle stop where it is (a tap opened its game); `release()` lets it go on.
// The plane (MapPlane): parked at the start of its loop; it takes off when `ready` says so (Map: the train is not at
// the crossing, no idle invitation, no kart trip, ≥ minGapMs since the last landing, never under reduced motion), flies
// the loop once at a steady speed (easing up from and down to the airstrip) and parks again.
// The rocket (rocketPuffFrame): a steam puff every `everyMs` (none under reduced motion).
import type { Point } from '../content/layout-types';

// --- loops --------------------------------------------------------------------------------------------------------

export interface Loop {
  readonly length: number;
  readonly count: number;
  /** The point at arc length `s` (wrapped onto [0, length)). */
  pointAt(s: number): Point;
  /** Unit screen direction of travel at `s` (increasing s). */
  dirAt(s: number): Point;
  /** Arc length of the loop point nearest `p`. */
  project(p: Point): number;
  /**
   * The segment holding `s`: the indices (into the points given to createLoop, duplicates included) of its two ends
   * and the fraction `t` along it.
   */
  locate(s: number): { readonly i: number; readonly j: number; readonly t: number };
  /** Signed forward distance from `a` to `b` along the loop, in [0, length). */
  ahead(a: number, b: number): number;
  /** True when `s` lies in the arc range [from, to] taken forward (it may wrap past 0). */
  inRange(s: number, from: number, to: number): boolean;
}

export function wrap(s: number, length: number): number {
  if (length <= 0 || !Number.isFinite(s)) return 0;
  const r = s % length;
  return r < 0 ? r + length : r;
}

export function createLoop(points: readonly Point[]): Loop {
  const src: number[] = [];
  const pts = points.filter((p, i) => {
    const keep = i === 0 || p.x !== points[i - 1]!.x || p.y !== points[i - 1]!.y;
    if (keep) src.push(i);
    return keep;
  });
  const n = pts.length;
  const s0: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    s0.push(total);
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const length = n >= 2 ? total : 0;
  const seg = (s: number): number => {
    // binary search: the last i with s0[i] <= s
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (s0[mid]! <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const segLen = (i: number): number => {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  return {
    length,
    count: n,
    pointAt(s) {
      if (n === 0) return { x: 0, y: 0 };
      if (length === 0) return pts[0]!;
      const w = wrap(s, length);
      const i = seg(w);
      const a = pts[i]!;
      const b = pts[(i + 1) % n]!;
      const len = segLen(i);
      const t = len > 0 ? (w - s0[i]!) / len : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    },
    dirAt(s) {
      if (length === 0) return { x: 1, y: 0 };
      const i = seg(wrap(s, length));
      const a = pts[i]!;
      const b = pts[(i + 1) % n]!;
      const len = segLen(i) || 1;
      return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    },
    project(p) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % n]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l2 = dx * dx + dy * dy;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
        const d = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
        if (d < bestD) {
          bestD = d;
          best = s0[i]! + Math.sqrt(l2) * t;
        }
      }
      return wrap(best, length);
    },
    ahead(a, b) {
      return wrap(b - a, length);
    },
    locate(s) {
      if (n === 0) return { i: 0, j: 0, t: 0 };
      const k = seg(wrap(s, length));
      const len = segLen(k);
      return { i: src[k]!, j: src[(k + 1) % n]!, t: len > 0 ? (wrap(s, length) - s0[k]!) / len : 0 };
    },
    inRange(s, from, to) {
      return wrap(s - from, length) <= wrap(to - from, length);
    },
  };
}

/** The local scale at `s`: the screen distance between the loop and its 1 m lifted twin, relative to `ref`. */
export function scaleAt(loop: Loop, up: readonly Point[], base: readonly Point[], s: number, ref: number): number {
  if (up.length !== base.length || base.length === 0 || ref <= 0) return 1;
  // The twin's points match the base's one for one: interpolate the lift along the segment holding s.
  const { i, j, t } = loop.locate(s);
  const lift = (k: number): number => Math.hypot(up[k]!.x - base[k]!.x, up[k]!.y - base[k]!.y);
  return (lift(i) * (1 - t) + lift(j) * t) / ref;
}

/**
 * Flags per loop point: true where `marked` (a subset of the loop's own points, e.g. `path.rail-back`) holds a point
 * within `tolerance` px of it. `isMarked(s)` is true when either end of the segment holding s is flagged.
 */
export function markedAt(loop: Loop, points: readonly Point[], marked: readonly Point[], tolerance = 0.5): (s: number) => boolean {
  const flags = points.map((p) => marked.some((m) => Math.abs(m.x - p.x) <= tolerance && Math.abs(m.y - p.y) <= tolerance));
  if (!flags.some(Boolean)) return () => false;
  return (s) => {
    const { i, j } = loop.locate(s);
    return (flags[i] ?? false) || (flags[j] ?? false);
  };
}

// --- headings -----------------------------------------------------------------------------------------------------

/** The 8 heading frames: 0 = world east (+x), counter-clockwise seen from above in 45° steps (1 = north-east …). */
export const HEADINGS = 8;

/**
 * The heading frame of a screen direction `d`, given `compass` = [origin, origin + 1 m east, origin + 1 m north]
 * on screen: `d` is written in the screen images of the world axes (a 2 × 2 inverse), then rounded to 45°.
 */
export function headingFrame(d: Point, compass: readonly Point[]): number {
  const [o, e, nn] = compass;
  let ex = 1;
  let ey = 0;
  let nx = 0;
  let ny = -1;
  if (o && e && nn) {
    ex = e.x - o.x;
    ey = e.y - o.y;
    nx = nn.x - o.x;
    ny = nn.y - o.y;
  }
  const det = ex * ny - ey * nx;
  if (det === 0) return 0;
  // d = a·E + b·N  →  (a, b) world east / north components
  const a = (d.x * ny - d.y * nx) / det;
  const b = (ex * d.y - ey * d.x) / det;
  const k = Math.round(Math.atan2(b, a) / (Math.PI / 4));
  return ((k % HEADINGS) + HEADINGS) % HEADINGS;
}

// --- the train ----------------------------------------------------------------------------------------------------

export interface TrainConfig {
  /** Cruise speed along the loop (design px per second). */
  readonly cruise: number;
  /** Acceleration and braking (design px per second²). */
  readonly accel: number;
  /** Ga tàu's stop: the engine's arc length there. */
  readonly stationS: number;
  readonly dwellMs: number;
  /** Arc gaps back from the engine to each car (design px, increasing). */
  readonly carGaps: readonly number[];
  /** The tunnel's arc range (forward from `from` to `to`); none on a map without one. */
  readonly tunnel: { readonly from: number; readonly to: number } | undefined;
  /** The level crossing's arc range, and the signal's stop (the engine's arc length) before it. */
  readonly crossing: { readonly from: number; readonly to: number };
  readonly signalS: number;
  /** The barriers go down this far (design px) before a piece reaches the crossing and come up this far after. */
  readonly crossingMargin: number;
  /**
   * The perspective at `s` relative to Ga tàu (1 there; smaller far from the camera). The cruise speed, the
   * acceleration and the cars' gaps are given at Ga tàu and shrink with it, so the train keeps its world speed and
   * stays coupled on the far side. Absent: 1 everywhere.
   */
  readonly scale?: (s: number) => number;
}

export type TrainPhase = 'run' | 'dwell' | 'signal' | 'hold';

export type TrainEvent =
  | { readonly kind: 'arrive' }
  | { readonly kind: 'depart' }
  | { readonly kind: 'barriers'; readonly down: boolean }
  | { readonly kind: 'tunnel'; readonly inside: boolean };

export interface TrainPiece {
  /** 0 = the engine, 1… the cars. */
  readonly index: number;
  readonly s: number;
  readonly hidden: boolean;
}

export interface TrainTickInput {
  readonly dtMs: number;
  /** The kart is driving and its path crosses the crossing (it never waits: the train does). */
  readonly kartOnCrossing: boolean;
  /** Reduced motion: half the cruise speed. */
  readonly reduced: boolean;
}

export class MapTrain {
  private s: number;
  private v = 0;
  private phase: TrainPhase;
  private dwellLeft: number;
  private barriersDown = false;
  private inTunnel = false;
  /** The station's stop was passed this lap (it re-arms once the engine is clear of it). */
  private stationDone = false;

  private readonly loop: Loop;
  private readonly cfg: TrainConfig;

  constructor(loop: Loop, cfg: TrainConfig, startS: number = cfg.stationS) {
    this.loop = loop;
    this.cfg = cfg;
    this.s = wrap(startS, loop.length);
    const atStation = loop.length > 0 && Math.min(loop.ahead(this.s, cfg.stationS), loop.ahead(cfg.stationS, this.s)) < 1;
    this.phase = atStation ? 'dwell' : 'run';
    this.dwellLeft = atStation ? cfg.dwellMs : 0;
    this.stationDone = atStation;
  }

  get state(): TrainPhase {
    return this.phase;
  }

  get engineS(): number {
    return this.s;
  }

  get speed(): number {
    return this.v;
  }

  /** True while the engine stands at Ga tàu. */
  get atStation(): boolean {
    return this.phase === 'dwell' || (this.phase === 'hold' && this.v === 0 && this.loop.ahead(this.s, this.cfg.stationS) < 1);
  }

  pieces(): TrainPiece[] {
    const out: TrainPiece[] = [{ index: 0, s: this.s, hidden: this.hiddenAt(this.s) }];
    let s = this.s;
    let prevGap = 0;
    this.cfg.carGaps.forEach((g, i) => {
      // each car trails the one before it by its gap at Ga tàu, scaled where it is
      s = wrap(s - (g - prevGap) * this.scaleAt(s), this.loop.length);
      prevGap = g;
      out.push({ index: i + 1, s, hidden: this.hiddenAt(s) });
    });
    return out;
  }

  private scaleAt(s: number): number {
    const k = this.cfg.scale?.(s) ?? 1;
    return Number.isFinite(k) && k > 0 ? k : 1;
  }

  /** True when the train is (even partly) in the tunnel. */
  get tunnel(): boolean {
    return this.inTunnel;
  }

  /** Stops gently where it is (a tap opened its game); `release()` lets it go on. */
  hold(): void {
    this.phase = 'hold';
  }

  release(): void {
    if (this.phase !== 'hold') return;
    this.phase = 'run';
  }

  /** Puts the train at Ga tàu, dwelling (Map wakes after its game). */
  parkAtStation(): TrainEvent[] {
    this.s = wrap(this.cfg.stationS, this.loop.length);
    this.v = 0;
    this.phase = 'dwell';
    this.dwellLeft = this.cfg.dwellMs;
    this.stationDone = true;
    return this.syncFlags();
  }

  tick(input: TrainTickInput): TrainEvent[] {
    const dt = Math.max(0, Math.min(input.dtMs, 100)) / 1000;
    const events: TrainEvent[] = [];
    const L = this.loop.length;
    if (L <= 0 || dt === 0) return events;
    const k = this.scaleAt(this.s);
    const cruise = this.cfg.cruise * k * (input.reduced ? 0.5 : 1);
    const a = this.cfg.accel * k;

    if (this.phase === 'dwell') {
      this.dwellLeft -= dt * 1000;
      if (this.dwellLeft > 0) return events;
      this.phase = 'run';
      events.push({ kind: 'depart' });
    }
    if (this.phase === 'signal' && !input.kartOnCrossing) {
      this.phase = 'run';
      events.push({ kind: 'depart' });
    }

    // Where must the train stop next (if anywhere)? On hold it just brakes to a stop where it can.
    let stopAt: number | undefined;
    if (this.phase === 'signal') stopAt = 0;
    else if (this.phase === 'run') {
      const toStation = this.loop.ahead(this.s, this.cfg.stationS);
      if (this.stationDone && toStation > L / 2) this.stationDone = false;
      if (!this.stationDone) stopAt = toStation;
      const toSignal = this.loop.ahead(this.s, this.cfg.signalS);
      const pastSignalInCrossing = this.loop.inRange(this.s, this.cfg.signalS, this.cfg.crossing.to);
      if (input.kartOnCrossing && !pastSignalInCrossing && (stopAt === undefined || toSignal < stopAt)) stopAt = toSignal;
    }

    // Speed: brake to reach 0 at stopAt, else ease up to cruise (both scaled here: v is in screen px per second).
    let target = this.phase === 'hold' ? 0 : cruise;
    if (stopAt !== undefined) {
      const brakeV = Math.sqrt(Math.max(0, 2 * a * stopAt));
      target = Math.min(cruise, brakeV);
    }
    if (this.v < target) this.v = Math.min(target, this.v + a * dt);
    else this.v = Math.max(target, this.v - a * dt);
    let step = this.v * dt;
    if (stopAt !== undefined && step >= stopAt) {
      step = stopAt;
      this.v = 0;
    }
    this.s = wrap(this.s + step, L);

    if (stopAt !== undefined && this.v === 0 && this.phase === 'run') {
      const atStation = this.loop.ahead(this.s, this.cfg.stationS) < 1e-6 || this.loop.ahead(this.cfg.stationS, this.s) < 1e-6;
      if (atStation && !this.stationDone) {
        this.phase = 'dwell';
        this.dwellLeft = this.cfg.dwellMs;
        this.stationDone = true;
        events.push({ kind: 'arrive' });
      } else if (input.kartOnCrossing) {
        this.phase = 'signal';
      }
    }
    events.push(...this.syncFlags());
    return events;
  }

  private hiddenAt(s: number): boolean {
    const t = this.cfg.tunnel;
    return t !== undefined && this.loop.inRange(s, t.from, t.to);
  }

  private syncFlags(): TrainEvent[] {
    const events: TrainEvent[] = [];
    const ps = this.pieces();
    const m = this.cfg.crossingMargin;
    const near = ps.some((p) => this.loop.inRange(p.s, this.cfg.crossing.from - m, this.cfg.crossing.to + m));
    if (near !== this.barriersDown) {
      this.barriersDown = near;
      events.push({ kind: 'barriers', down: near });
    }
    const inside = ps.some((p) => p.hidden);
    if (inside !== this.inTunnel) {
      this.inTunnel = inside;
      events.push({ kind: 'tunnel', inside });
    }
    return events;
  }

  /** True while any piece is within the crossing's margin (the barriers are down). */
  get barriers(): boolean {
    return this.barriersDown;
  }
}

// --- the plane ----------------------------------------------------------------------------------------------------

export interface PlaneConfig {
  /** Flight speed along the loop (design px per second). */
  readonly cruise: number;
  /** The time to ease from 0 to cruise at the start and back to 0 at the end (ms). */
  readonly easeMs: number;
  /** The least time parked between two flights (ms). */
  readonly minGapMs: number;
}

export type PlanePhase = 'parked' | 'flying';

export class MapPlane {
  private phase: PlanePhase = 'parked';
  private s = 0;
  private sinceLanding = 0;
  private flownMs = 0;

  private readonly loop: Loop;
  private readonly cfg: PlaneConfig;

  constructor(loop: Loop, cfg: PlaneConfig) {
    this.loop = loop;
    this.cfg = cfg;
  }

  get state(): PlanePhase {
    return this.phase;
  }

  get position(): number {
    return this.s;
  }

  /** The duration of one flight: the loop at cruise plus the two half-speed ease ramps. */
  get flightMs(): number {
    const cruiseMs = (this.loop.length / Math.max(1e-6, this.cfg.cruise)) * 1000;
    return cruiseMs + this.cfg.easeMs;
  }

  /** Lands it at once (Map opens the plane's game, or wakes). */
  park(): void {
    this.phase = 'parked';
    this.s = 0;
    this.flownMs = 0;
    this.sinceLanding = 0;
  }

  /**
   * One frame. `ready`: Map allows a take-off now (no other mover, no invitation, no kart trip, not reduced motion).
   * Returns 'takeoff' / 'land' on those frames.
   */
  tick(dtMs: number, ready: boolean): 'takeoff' | 'land' | undefined {
    const dt = Math.max(0, Math.min(dtMs, 100));
    if (this.phase === 'parked') {
      this.sinceLanding += dt;
      if (ready && this.sinceLanding >= this.cfg.minGapMs && this.loop.length > 0) {
        this.phase = 'flying';
        this.flownMs = 0;
        return 'takeoff';
      }
      return undefined;
    }
    this.flownMs += dt;
    const total = this.flightMs;
    if (this.flownMs >= total) {
      this.park();
      return 'land';
    }
    this.s = distanceFlown(this.flownMs, total, this.cfg.easeMs, this.loop.length);
    return undefined;
  }
}

/**
 * The distance along the loop after `t` ms of a flight of `total` ms over `length`: a linear ramp of speed over
 * `ease` ms at each end (trapezoidal speed), cruise between.
 */
export function distanceFlown(t: number, total: number, ease: number, length: number): number {
  const e = Math.min(ease, total / 2);
  const cruiseMs = total - e; // the area of the trapezoid = cruise × (total − e)
  const v = length / Math.max(1e-6, cruiseMs);
  const tt = Math.max(0, Math.min(total, t));
  if (tt <= e) return (v * tt * tt) / (2 * e || 1);
  if (tt >= total - e) {
    const r = total - tt;
    return length - (v * r * r) / (2 * e || 1);
  }
  return (v * e) / 2 + v * (tt - e);
}

// --- configs from the layout and Timing ---------------------------------------------------------------------------

const MS_PER_S = 1000;
/** A loop needs at least this many points. */
export const MIN_LOOP_POINTS = 3;
/** A car's gap behind the one before it when the layout has no car anchor (design px). */
const FALLBACK_CAR_GAP = 40;
/** The barriers go down this far (design px of track) before the train reaches the crossing and up this far after. */
const CROSSING_MARGIN = 30;

export interface TrainLayout {
  readonly stationS: number;
  /** Each car's arc length at the station (undefined: the fallback gap). */
  readonly carS: readonly (number | undefined)[];
  readonly tunnel: { readonly from: number; readonly to: number } | undefined;
  readonly crossing: { readonly from: number; readonly to: number };
  readonly signalS: number;
}

/** The map train's config: one lap in `lapMs`, easing over `easeMs`, dwelling `dwellMs` at Ga tàu. */
export function trainConfig(loop: Loop, l: TrainLayout, lapMs: number, easeMs: number, dwellMs: number): TrainConfig {
  const cruise = loop.length / (lapMs / MS_PER_S);
  return {
    cruise,
    accel: cruise / (easeMs / MS_PER_S),
    stationS: l.stationS,
    dwellMs,
    carGaps: l.carS.map((s, i) => (s === undefined ? (i + 1) * FALLBACK_CAR_GAP : loop.ahead(s, l.stationS))),
    tunnel: l.tunnel,
    crossing: l.crossing,
    signalS: l.signalS,
    crossingMargin: CROSSING_MARGIN,
  };
}

/** The plane's config: one flight in `flightMs` (its two ease ramps of `easeMs` included), parked ≥ `gapMs`. */
export function planeConfig(loop: Loop, flightMs: number, easeMs: number, gapMs: number): PlaneConfig {
  return { cruise: loop.length / ((flightMs - easeMs) / MS_PER_S), easeMs, minGapMs: gapMs };
}

// --- the rocket ---------------------------------------------------------------------------------------------------

/** The rocket's frame at `clockMs`: 'idle', or puff frame k (0-based) during a puff every `everyMs` of `frameMs` frames. */
export function rocketPuffFrame(clockMs: number, everyMs: number, frames: number, frameMs: number, reduced: boolean): number | undefined {
  if (reduced || frames <= 0 || everyMs <= 0) return undefined;
  const t = clockMs % everyMs;
  const k = Math.floor(t / frameMs);
  return k < frames ? k : undefined;
}
