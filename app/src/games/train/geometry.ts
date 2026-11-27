// Tàu hỏa quanh đảo: the train on the island's rail (2026-11-13, spec-tau-quanh-dao), pure. Shared by the trip model
// (trip.ts), the scene (Train.ts) and the layout rules (tools/layout/rules.ts › validateTrain).
// The rail is `path.rail` (core/map-rides › Loop, design px); `path.rail-up` gives the local perspective scale (1 at the
// reference point, Ga tàu's engine stop). The engine stands at arc length `s`; each car trails the piece in front by its
// pitch (ui.trainCarPitch) × the local scale, so the train keeps its real length on the far side of the island.
import type { Point } from '../../content/layout-types';
import { createLoop, scaleAt, wrap, type Loop } from '../../core/map-rides.ts';
import { Tokens } from '../../core/tokens.ts';

export interface Rail {
  readonly loop: Loop;
  /** The local scale at `s` (1 at the reference; the perspective makes far things smaller). */
  scale(s: number): number;
}

/** The rail of a layout: `path.rail` and its 1 m lifted twin, the scale relative to `ref` (a rail point). */
export function railOf(rail: readonly Point[], railUp: readonly Point[], ref: Point): Rail {
  const loop = createLoop(rail);
  const refS = loop.project(ref);
  const liftRef = scaleAt(loop, railUp, rail, refS, 1);
  return {
    loop,
    scale: (s) => {
      const k = scaleAt(loop, railUp, rail, s, liftRef);
      return Number.isFinite(k) && k > 0 ? k : 1;
    },
  };
}

/**
 * The train's cruise at the local scale 1 (design px per ms): ui.trainCruiseMapX × the map train's (one lap of the rail
 * in Timing.mapTrainLapMs), × ui.trainReducedScroll under reduced motion.
 */
export function cruisePerMs(railLength: number, reduced: boolean): number {
  const map = railLength / Tokens.Timing.mapTrainLapMs;
  return map * Tokens.ui.trainCruiseMapX * (reduced ? Tokens.ui.trainReducedScroll : 1);
}

export interface Piece {
  /** 0 = the engine, 1… the cars. */
  readonly index: number;
  readonly s: number;
  /** The local scale where it stands. */
  readonly k: number;
}

/** The engine at `s` and the cars behind it (each `pitch[i]` behind the one in front, scaled where it is). */
export function trainPieces(rail: Rail, s: number, pitch: readonly number[]): Piece[] {
  const L = rail.loop.length;
  const out: Piece[] = [{ index: 0, s: wrap(s, L), k: rail.scale(s) }];
  let at = s;
  pitch.forEach((p, i) => {
    at = wrap(at - p * rail.scale(at), L);
    out.push({ index: i + 1, s: at, k: rail.scale(at) });
  });
  return out;
}

/** The train's length along the rail (design px of arc): from the last car to the engine. */
export function trainSpan(pieces: readonly Piece[], L: number): number {
  const tail = pieces[pieces.length - 1];
  return tail ? wrap(pieces[0]!.s - tail.s, L) : 0;
}

export interface Disc {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

export interface DiscSizes {
  readonly engineR: number;
  readonly carR: number;
  /** The disc's centre over the piece's ground point (at the local scale 1). */
  readonly lift: number;
}

/** A piece's tap disc (design px): over its ground point, scaled where it stands. */
export function pieceDisc(rail: Rail, p: Piece, sizes: DiscSizes): Disc {
  const g = rail.loop.pointAt(p.s);
  return { x: g.x, y: g.y - sizes.lift * p.k, r: (p.index === 0 ? sizes.engineR : sizes.carR) * p.k };
}

/** The forward overlap (design px of arc) of [a0, a1] and [b0, b1] on a loop of length L (each taken forward). */
export function arcOverlap(a0: number, a1: number, b0: number, b1: number, L: number): number {
  const la = wrap(a1 - a0, L);
  const lb = wrap(b1 - b0, L);
  // b's start measured from a's start; the overlap of [0, la] with [d, d + lb] and with [d − L, d − L + lb].
  const d = wrap(b0 - a0, L);
  const part = (lo: number, hi: number): number => Math.max(0, Math.min(la, hi) - Math.max(0, lo));
  return Math.min(la, lb, part(d, d + lb) + part(d - L, d - L + lb));
}

/**
 * How dark the tunnel makes the scene (0 … 1): the share of the train inside the tunnel, relative to the most the
 * tunnel can cover (a tunnel shorter than the train still reaches 1 while it is full).
 */
export function tunnelCover(pieces: readonly Piece[], L: number, tunnel: { readonly from: number; readonly to: number } | undefined): number {
  if (!tunnel || pieces.length === 0) return 0;
  const span = Math.max(1, trainSpan(pieces, L));
  const tail = pieces[pieces.length - 1]!.s;
  const inside = arcOverlap(tail, pieces[0]!.s, tunnel.from, tunnel.to, L);
  const most = Math.min(span, wrap(tunnel.to - tunnel.from, L));
  return most > 0 ? Math.max(0, Math.min(1, inside / most)) : 0;
}
