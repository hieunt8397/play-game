// Câu cá swim model (Story 4.3), pure and Phaser-free: where each fish is and where it goes. A fish is
// its body rect (centre ± halfW, halfH). A position is valid when the rect's 4 corners lie inside the pond
// (convex, so a straight move between valid points stays inside) and the rect keeps `gap` from every
// other fish's rect (diving fish included).
// - place(): seeded rejection sampling (`placeAttempts` per fish), then a deterministic grid scan; if a
//   fish still does not fit, every fish is re-placed on the grid (packed from the top-left); it throws only
//   if that fails too (the capacity test prevents it).
// - tick(dt): each swimming fish moves toward its waypoint at its cruise speed (≤ speedMax); a step that
//   would break validity is not taken and a new waypoint is drawn; reaching a waypoint draws the next.
// - setCalm(ids): the listed fish move at hintScale × their speed, every other fish stops (null: off).
// - dive / resurface switch a fish out of / back into the pick; diving fish do not move.
// - record(t) feeds each fish's PositionHistory; candidates(now, past) gives pickMoving its input.
import type { Point } from '../../content/layout-types.ts';
import { PositionHistory, type MovingCandidate } from '../../core/input/moving-pick.ts';
import { MS_PER_SECOND, Tokens } from '../../core/tokens.ts';

export interface SwimFishSpec {
  readonly id: string;
  readonly halfW: number;
  readonly halfH: number;
}

export interface SwimOptions {
  /** fish.speedMax (design px per second). */
  readonly speedMax: number;
  readonly minSpeedScale: number;
  /** Applied to every speed when reduced motion is on. */
  readonly reducedScale: number;
  readonly reduced: boolean;
  readonly hintScale: number;
  readonly waypointMinPx: number;
  readonly placeAttempts: number;
  /** spacing.targetGap: the least gap between two fish rects. */
  readonly gap: number;
  /** Grid step of the placement fallback scan (design px). */
  readonly gridStep: number;
  readonly maxDtMs: number;
  /** A fish keeps its facing while |vx| is below this (px per second). */
  readonly facingMinSpeed: number;
}

export function defaultSwimOptions(reduced = false): SwimOptions {
  const ui = Tokens.ui;
  return {
    speedMax: Tokens.components.fish.speedMax,
    minSpeedScale: ui.fishMinSpeedScale,
    reducedScale: ui.fishReducedSpeedScale,
    reduced,
    hintScale: ui.fishHintSpeedScale,
    waypointMinPx: ui.fishWaypointMinPx,
    placeAttempts: ui.fishPlaceAttempts,
    gap: Tokens.spacing.targetGap,
    gridStep: ui.fishGridStepPx,
    maxDtMs: Tokens.Timing.fishMaxTickMs,
    facingMinSpeed: 1,
  };
}

interface FishState {
  readonly spec: SwimFishSpec;
  pos: Point;
  waypoint: Point;
  /** Cruise speed (px per second). */
  speed: number;
  facing: 1 | -1;
  diving: boolean;
  readonly history: PositionHistory;
}

/** True when `p` lies inside the convex polygon (either winding; on the edge counts). */
function inConvex(p: Point, poly: readonly Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross === 0) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** The gap between two axis-aligned rects (0 when they touch or overlap). */
function rectGap(a: Point, ah: { halfW: number; halfH: number }, b: Point, bh: { halfW: number; halfH: number }): number {
  const dx = Math.max(0, Math.abs(a.x - b.x) - ah.halfW - bh.halfW);
  const dy = Math.max(0, Math.abs(a.y - b.y) - ah.halfH - bh.halfH);
  return Math.hypot(dx, dy);
}

export class SwimModel {
  private readonly pond: readonly Point[];
  private readonly fish: FishState[];
  private readonly rng: () => number;
  readonly opts: SwimOptions;
  private calm: ReadonlySet<string> | null = null;
  private readonly bbox: { x0: number; y0: number; x1: number; y1: number };

  constructor(pond: readonly Point[], specs: readonly SwimFishSpec[], rng: () => number, opts: Partial<SwimOptions> = {}) {
    this.pond = pond;
    this.rng = rng;
    this.opts = { ...defaultSwimOptions(), ...opts };
    const xs = pond.map((p) => p.x);
    const ys = pond.map((p) => p.y);
    this.bbox = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    this.fish = specs.map((spec) => ({ spec, pos: { x: 0, y: 0 }, waypoint: { x: 0, y: 0 }, speed: 0, facing: 1, diving: false, history: new PositionHistory() }));
  }

  /** True when `spec`'s body rect at `p` lies inside the pond. */
  inPond(spec: SwimFishSpec, p: Point): boolean {
    const { halfW: w, halfH: h } = spec;
    return [
      { x: p.x - w, y: p.y - h },
      { x: p.x + w, y: p.y - h },
      { x: p.x + w, y: p.y + h },
      { x: p.x - w, y: p.y + h },
    ].every((c) => inConvex(c, this.pond));
  }

  /** True when fish `i` at `p` is inside the pond and ≥ gap from every fish in `others`. */
  private valid(i: number, p: Point, others: readonly number[]): boolean {
    const me = this.fish[i]!;
    if (!this.inPond(me.spec, p)) return false;
    return others.every((j) => j === i || rectGap(p, me.spec, this.fish[j]!.pos, this.fish[j]!.spec) >= this.opts.gap);
  }

  private randomPoint(): Point {
    const b = this.bbox;
    return { x: b.x0 + (b.x1 - b.x0) * this.rng(), y: b.y0 + (b.y1 - b.y0) * this.rng() };
  }

  /** The first valid grid point for fish `i` given the `placed` fish (top-left first). */
  private gridPoint(i: number, placed: readonly number[]): Point | undefined {
    const b = this.bbox;
    for (let y = b.y0; y <= b.y1; y += this.opts.gridStep) {
      for (let x = b.x0; x <= b.x1; x += this.opts.gridStep) if (this.valid(i, { x, y }, placed)) return { x, y };
    }
    return undefined;
  }

  /** Places every fish (seeded, then a grid scan, then all packed); draws waypoints and speeds. Throws when they cannot fit. */
  place(): void {
    const placed: number[] = [];
    let packed = false;
    for (let i = 0; i < this.fish.length; i++) {
      let at: Point | undefined;
      for (let k = 0; k < this.opts.placeAttempts && !at && !packed; k++) {
        const p = this.randomPoint();
        if (this.valid(i, p, placed)) at = p;
      }
      at ??= this.gridPoint(i, placed);
      if (!at && !packed) {
        // The seeded spots left no room: pack every fish on the grid from the start.
        packed = true;
        placed.length = 0;
        i = -1;
        continue;
      }
      if (!at) throw new Error(`swim: fish "${this.fish[i]!.spec.id}" does not fit in the pond`);
      this.fish[i]!.pos = at;
      placed.push(i);
    }
    for (const f of this.fish) {
      f.diving = false;
      f.speed = this.opts.speedMax * (this.opts.minSpeedScale + (1 - this.opts.minSpeedScale) * this.rng()) * (this.opts.reduced ? this.opts.reducedScale : 1);
      f.history.clear();
    }
    this.fish.forEach((f) => {
      f.waypoint = this.newWaypoint(f);
      f.facing = f.waypoint.x >= f.pos.x ? 1 : -1;
    });
  }

  /** A pond position for `f` at least waypointMinPx away (bounded tries; else where it is). */
  private newWaypoint(f: FishState): Point {
    for (let k = 0; k < this.opts.placeAttempts; k++) {
      const p = this.randomPoint();
      if (Math.hypot(p.x - f.pos.x, p.y - f.pos.y) >= this.opts.waypointMinPx && this.inPond(f.spec, p)) return p;
    }
    return { ...f.pos };
  }

  tick(dtMs: number): void {
    const dt = Math.max(0, Math.min(this.opts.maxDtMs, Number.isFinite(dtMs) ? dtMs : 0)) / MS_PER_SECOND;
    const all = this.fish.map((_, i) => i);
    this.fish.forEach((f, i) => {
      if (f.diving) return;
      const scale = this.calm ? (this.calm.has(f.spec.id) ? this.opts.hintScale : 0) : 1;
      const v = f.speed * scale;
      if (v <= 0) return;
      const dx = f.waypoint.x - f.pos.x;
      const dy = f.waypoint.y - f.pos.y;
      const d = Math.hypot(dx, dy);
      if (d === 0) {
        f.waypoint = this.newWaypoint(f);
        return;
      }
      const step = Math.min(d, v * dt);
      const next = { x: f.pos.x + (dx / d) * step, y: f.pos.y + (dy / d) * step };
      if (!this.valid(i, next, all)) {
        f.waypoint = this.newWaypoint(f);
        return;
      }
      const vx = (next.x - f.pos.x) / (dt || 1);
      if (Math.abs(vx) >= this.opts.facingMinSpeed) f.facing = vx > 0 ? 1 : -1;
      f.pos = next;
      if (step >= d) f.waypoint = this.newWaypoint(f);
    });
  }

  /** At hint level ≥ 2: only `ids` move (at hintScale); null restores normal swimming. */
  setCalm(ids: readonly string[] | null): void {
    this.calm = ids ? new Set(ids) : null;
  }

  dive(id: string): void {
    const f = this.find(id);
    if (f) f.diving = true;
  }

  resurface(id: string): void {
    const f = this.find(id);
    if (f) f.diving = false;
  }

  isDiving(id: string): boolean {
    return this.find(id)?.diving ?? false;
  }

  position(id: string): Point | undefined {
    const f = this.find(id);
    return f ? { ...f.pos } : undefined;
  }

  facing(id: string): 1 | -1 {
    return this.find(id)?.facing ?? 1;
  }

  /** Records every fish's position at `tMs` (the lookback hit test). */
  record(tMs: number): void {
    for (const f of this.fish) f.history.push(tMs, f.pos);
  }

  /** The pickMoving input of the fish not diving: now and at `pastMs` (where the finger aimed). */
  candidates(nowMs: number, pastMs: number): MovingCandidate[] {
    return this.fish
      .filter((f) => !f.diving)
      .map((f) => ({ id: f.spec.id, now: f.history.at(nowMs) ?? f.pos, past: f.history.at(pastMs) ?? f.pos, halfW: f.spec.halfW, halfH: f.spec.halfH }));
  }

  /** Every fish's body rect, for tests and the scene. */
  bodies(): { id: string; pos: Point; halfW: number; halfH: number; diving: boolean }[] {
    return this.fish.map((f) => ({ id: f.spec.id, pos: { ...f.pos }, halfW: f.spec.halfW, halfH: f.spec.halfH, diving: f.diving }));
  }

  private find(id: string): FishState | undefined {
    return this.fish.find((f) => f.spec.id === id);
  }
}
