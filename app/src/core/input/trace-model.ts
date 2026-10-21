// TraceModel (Story 4.1), pure and Phaser-free: a kart on a road that only a finger can move. The road
// is resampled every `step` px of arc length; the kart lives on `s` (its arc length, never decreasing).
// - press(p) grabs when idle/waiting and p is within `grabRadius` of the kart → `tracing`;
// - move(p) stores the finger (tracing), or re-grabs when the same finger comes back near a waiting kart;
// - release() → `waiting`, `s` kept;
// - tick(dt) projects the finger onto the road from `s` to `s + lookahead` only (a projection behind the
//   kart clamps to it, so a finger near a later part of the road never teleports the kart): within
//   `tolerance` the kart catches up at full speed, within `stopPx` at `midScale` × that, farther it waits.
//   Within `arriveSlack` of the end it snaps there and arrives (terminal).
// Events: `grab`, `progress {s, index}` (only when s changed), `wait`, `arrive`.
import { Tokens } from '../tokens';
import type { Point } from './polygon';

export type TraceState = 'idle' | 'tracing' | 'waiting' | 'arrived';

export type TraceEvent =
  | { readonly kind: 'grab' }
  | { readonly kind: 'progress'; readonly s: number; readonly index: number }
  | { readonly kind: 'wait' }
  | { readonly kind: 'arrive' };

export interface TraceOptions {
  readonly step: number;
  readonly grabRadius: number;
  readonly tolerance: number;
  readonly stopPx: number;
  readonly midScale: number;
  readonly pxPerMs: number;
  readonly lookahead: number;
  readonly arriveSlack: number;
  /** tick's dt is clamped to this (ms). */
  readonly maxDtMs: number;
}

export const MAX_TICK_MS = 250;

export function defaultTraceOptions(): TraceOptions {
  const ui = Tokens.ui;
  return {
    step: ui.traceSampleStepPx,
    grabRadius: ui.raceGrabRadius,
    tolerance: Tokens.components.tracePath.tolerance,
    stopPx: ui.traceStopPx,
    midScale: ui.traceMidSpeedScale,
    pxPerMs: ui.traceKartPxPerMs,
    lookahead: ui.traceLookaheadPx,
    arriveSlack: ui.traceArriveSlackPx,
    maxDtMs: MAX_TICK_MS,
  };
}

/** The polyline resampled every `step` px of arc length (both ends kept). */
export function resample(points: readonly Point[], step: number): Point[] {
  const out: Point[] = [];
  if (points.length === 0) return out;
  out.push({ x: points[0]!.x, y: points[0]!.y });
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    let d = step - carry;
    while (d <= len) {
      const t = d / len;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      d += step;
    }
    carry = len - (d - step);
  }
  const last = points[points.length - 1]!;
  const tail = out[out.length - 1]!;
  if (tail.x !== last.x || tail.y !== last.y) out.push({ x: last.x, y: last.y });
  return out;
}

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export class TraceModel {
  readonly opts: TraceOptions;
  /** The resampled road. */
  readonly samples: readonly Point[];
  /** Arc length of each sample. */
  private readonly arc: readonly number[];
  readonly length: number;
  private st: TraceState = 'idle';
  private pos = 0;
  private finger: Point | undefined;
  /** True while the finger that grabbed is still down (a waiting kart may be re-grabbed by moving). */
  private down = false;

  constructor(points: readonly Point[], opts: Partial<TraceOptions> = {}) {
    this.opts = { ...defaultTraceOptions(), ...opts };
    this.samples = resample(points, this.opts.step);
    const arc: number[] = [];
    let total = 0;
    this.samples.forEach((p, i) => {
      if (i > 0) total += dist(this.samples[i - 1]!, p);
      arc.push(total);
    });
    this.arc = arc;
    this.length = total;
  }

  get state(): TraceState {
    return this.st;
  }

  get s(): number {
    return this.pos;
  }

  get index(): number {
    return Math.floor(this.pos / this.opts.step);
  }

  get point(): Point {
    return this.pointAt(this.pos);
  }

  /** The point at arc length `s` (clamped to the road). */
  pointAt(s: number): Point {
    const n = this.samples.length;
    if (n === 0) return { x: 0, y: 0 };
    const c = Math.max(0, Math.min(this.length, s));
    let i = Math.min(n - 1, Math.floor(c / this.opts.step));
    while (i > 0 && this.arc[i]! > c) i--;
    while (i < n - 1 && this.arc[i + 1]! < c) i++;
    if (i >= n - 1) return { ...this.samples[n - 1]! };
    const a = this.samples[i]!;
    const b = this.samples[i + 1]!;
    const seg = this.arc[i + 1]! - this.arc[i]!;
    const t = seg > 0 ? (c - this.arc[i]!) / seg : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  /** The unit direction of travel at `s` (the segment ahead; the last one at the end). */
  tangentAt(s: number): Point {
    const a = this.pointAt(Math.min(s, this.length - this.opts.step));
    const b = this.pointAt(Math.min(this.length, Math.max(s, 0) + this.opts.step));
    const d = dist(a, b);
    return d > 0 ? { x: (b.x - a.x) / d, y: (b.y - a.y) / d } : { x: 1, y: 0 };
  }

  /** The samples from `from` to `to` (arc length), both ends included. */
  stretch(from: number, to: number): Point[] {
    const a = Math.max(0, Math.min(this.length, from));
    const b = Math.max(a, Math.min(this.length, to));
    const out: Point[] = [this.pointAt(a)];
    for (let i = 0; i < this.samples.length; i++) if (this.arc[i]! > a && this.arc[i]! < b) out.push({ ...this.samples[i]! });
    out.push(this.pointAt(b));
    return out;
  }

  /** True when `p` would grab the kart now. */
  canGrab(p: Point): boolean {
    return (this.st === 'idle' || this.st === 'waiting') && dist(p, this.point) <= this.opts.grabRadius;
  }

  press(p: Point): boolean {
    if (!this.canGrab(p)) return false;
    this.st = 'tracing';
    this.finger = { ...p };
    this.down = true;
    return true;
  }

  /** The grabbing finger moved; returns `grab` when it re-grabbed a waiting kart. */
  move(p: Point): TraceEvent[] {
    if (!this.down) return [];
    this.finger = { ...p };
    if (this.st === 'waiting' && dist(p, this.point) <= this.opts.grabRadius) {
      this.st = 'tracing';
      return [{ kind: 'grab' }];
    }
    return [];
  }

  release(): TraceEvent[] {
    this.down = false;
    this.finger = undefined;
    if (this.st !== 'tracing') return [];
    this.st = 'waiting';
    return [{ kind: 'wait' }];
  }

  /** Projects `p` onto the road within [s, s + lookahead]: the arc length and the distance. */
  project(p: Point): { s: number; d: number } {
    const lo = this.pos;
    const hi = Math.min(this.length, this.pos + this.opts.lookahead);
    let best = lo;
    let bestD = dist(p, this.pointAt(lo));
    let i = 0;
    while (i < this.samples.length - 1 && this.arc[i + 1]! <= lo) i++;
    for (; i < this.samples.length - 1 && this.arc[i]! < hi; i++) {
      const s0 = Math.max(lo, this.arc[i]!);
      const s1 = Math.min(hi, this.arc[i + 1]!);
      if (s1 <= s0) continue;
      const a = this.pointAt(s0);
      const b = this.pointAt(s1);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
      const q = { x: a.x + dx * t, y: a.y + dy * t };
      const d = dist(p, q);
      if (d < bestD) {
        bestD = d;
        best = s0 + (s1 - s0) * t;
      }
    }
    return { s: best, d: bestD };
  }

  tick(dtMs: number): TraceEvent[] {
    if (this.st !== 'tracing' || !this.finger) return [];
    const dt = Math.max(0, Math.min(this.opts.maxDtMs, Number.isFinite(dtMs) ? dtMs : 0));
    const { s: target, d } = this.project(this.finger);
    if (d > this.opts.stopPx) {
      this.st = 'waiting';
      return [{ kind: 'wait' }];
    }
    const speed = d <= this.opts.tolerance ? this.opts.pxPerMs : this.opts.pxPerMs * this.opts.midScale;
    const gap = Math.max(0, target - this.pos);
    const next = this.pos + Math.min(gap, speed * dt);
    if (next <= this.pos) return [];
    const out: TraceEvent[] = [];
    if (next >= this.length - this.opts.arriveSlack) {
      this.pos = this.length;
      this.st = 'arrived';
      this.down = false;
      this.finger = undefined;
      out.push({ kind: 'progress', s: this.pos, index: this.index }, { kind: 'arrive' });
      return out;
    }
    this.pos = next;
    out.push({ kind: 'progress', s: this.pos, index: this.index });
    return out;
  }

  /** Story 4.2: puts the kart at sample `index` (clamped), waiting for a grab. */
  restore(index: number): void {
    const i = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
    this.pos = Math.min(this.length, i * this.opts.step);
    this.st = 'waiting';
    this.down = false;
    this.finger = undefined;
  }
}
