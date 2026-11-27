// Tàu hỏa quanh đảo: the train on the rail (2026-11-13, spec-tau-quanh-dao): the cars at their pitch × the local scale,
// the tap discs, the tunnel's cover and the cruise.
import { describe, expect, it } from 'vitest';
import { Tokens } from '../../core/tokens';
import { arcOverlap, cruisePerMs, pieceDisc, railOf, trainPieces, trainSpan, tunnelCover } from './geometry';

const flat = Array.from({ length: 100 }, (_, i) => ({ x: 10 * i, y: 500 }));
const back = [...flat].reverse().map((p) => ({ x: p.x, y: 501 }));
const pts = [...flat, ...back];
const rail = railOf(pts, pts.map((p) => ({ x: p.x, y: p.y - 20 })), { x: 500, y: 500 });

describe('the train on the rail', () => {
  it('the cars trail the engine at their pitch (the scale is 1 everywhere here)', () => {
    const p = trainPieces(rail, 600, [62, 56, 56]);
    expect(p.map((x) => x.s)).toEqual([600, 538, 482, 426]);
    expect(trainSpan(p, rail.loop.length)).toBe(174);
    expect(p.every((x) => x.k === 1)).toBe(true);
  });

  it('a piece`s tap disc stands over its ground point, the engine`s bigger', () => {
    const [e, c] = trainPieces(rail, 600, [62]);
    expect(pieceDisc(rail, e!, { engineR: 26, carR: 21, lift: 20 })).toEqual({ x: 600, y: 480, r: 26 });
    expect(pieceDisc(rail, c!, { engineR: 26, carR: 21, lift: 20 }).r).toBe(21);
  });

  it('arcOverlap measures forward ranges, across the loop`s end too', () => {
    expect(arcOverlap(0, 100, 50, 150, 1000)).toBe(50);
    expect(arcOverlap(950, 50, 0, 100, 1000)).toBe(50);
    expect(arcOverlap(0, 100, 200, 300, 1000)).toBe(0);
  });

  it('the tunnel covers the train`s share inside it, relative to the most it can (1 when full)', () => {
    const t = { from: 1000, to: 1100 };
    const L = rail.loop.length;
    expect(tunnelCover(trainPieces(rail, 990, [62, 56, 56]), L, t)).toBe(0);
    expect(tunnelCover(trainPieces(rail, 1050, [62, 56, 56]), L, t)).toBeCloseTo(0.5, 6);
    expect(tunnelCover(trainPieces(rail, 1150, [62, 56, 56]), L, t)).toBe(1);
    expect(tunnelCover(trainPieces(rail, 1150, [62, 56, 56]), L, undefined)).toBe(0);
  });

  it('the cruise is ui.trainCruiseMapX × the map train`s lap, slower under reduced motion', () => {
    const L = 2207;
    expect(cruisePerMs(L, false)).toBeCloseTo((L / Tokens.Timing.mapTrainLapMs) * Tokens.ui.trainCruiseMapX, 9);
    expect(cruisePerMs(L, true)).toBeCloseTo(cruisePerMs(L, false) * Tokens.ui.trainReducedScroll, 9);
  });
});
