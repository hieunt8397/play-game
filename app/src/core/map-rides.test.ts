import { describe, expect, it } from 'vitest';
import { createLoop, distanceFlown, headingFrame, MapPlane, MapTrain, markedAt, planeConfig, rocketPuffFrame, scaleAt, trainConfig, type TrainConfig, type TrainEvent } from './map-rides';

// A 400 × 200 rectangle, counter-clockwise on screen as the rail is laid (y down): length 1200.
const RECT = [
  { x: 0, y: 0 },
  { x: 0, y: 200 },
  { x: 400, y: 200 },
  { x: 400, y: 0 },
];

const CFG: TrainConfig = {
  cruise: 100,
  accel: 100,
  stationS: 0,
  dwellMs: 2000,
  carGaps: [30, 60, 90],
  tunnel: { from: 700, to: 800 },
  crossing: { from: 300, to: 320 },
  signalS: 250,
  crossingMargin: 20,
};

function run(train: MapTrain, ms: number, kart = false, reduced = false): TrainEvent[] {
  const out: TrainEvent[] = [];
  for (let t = 0; t < ms; t += 20) out.push(...train.tick({ dtMs: 20, kartOnCrossing: kart, reduced }));
  return out;
}

describe('createLoop', () => {
  const loop = createLoop(RECT);
  it('measures a closed loop and wraps arc lengths', () => {
    expect(loop.length).toBe(1200);
    expect(loop.pointAt(100)).toEqual({ x: 0, y: 100 });
    expect(loop.pointAt(1300)).toEqual({ x: 0, y: 100 });
    expect(loop.pointAt(-100)).toEqual({ x: 100, y: 0 });
  });
  it('closes the last point to the first', () => {
    expect(loop.pointAt(900)).toEqual({ x: 300, y: 0 });
    expect(loop.dirAt(1100)).toEqual({ x: -1, y: 0 });
  });
  it('projects, measures forward distances and wrapped ranges', () => {
    expect(loop.project({ x: 410, y: 100 })).toBeCloseTo(700);
    expect(loop.ahead(1100, 100)).toBe(200);
    expect(loop.inRange(50, 1150, 100)).toBe(true);
    expect(loop.inRange(500, 1150, 100)).toBe(false);
  });
});

describe('scaleAt', () => {
  it('reads the lift of the 1 m twin against the reference', () => {
    const loop = createLoop(RECT);
    const up = RECT.map((p, i) => ({ x: p.x, y: p.y - (i < 2 ? 20 : 10) }));
    expect(scaleAt(loop, up, RECT, 0, 20)).toBeCloseTo(1);
    expect(scaleAt(loop, up, RECT, 600, 20)).toBeCloseTo(0.5);
  });
});

describe('scaleAt on unevenly spaced points (review 2026-11-13)', () => {
  it('reads the lift of the segment holding s, not of an evenly spaced index', () => {
    // one long near side (lift 20) and three short far points (lift 10); a duplicate point too
    const base = [
      { x: 0, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 90 },
      { x: 0, y: 90 },
    ];
    const up = base.map((p) => ({ x: p.x, y: p.y - (p.y === 100 ? 20 : 10) }));
    const loop = createLoop(base);
    expect(scaleAt(loop, up, base, 150, 20)).toBeCloseTo(1); // the middle of the near side
    expect(scaleAt(loop, up, base, 460, 20)).toBeCloseTo(0.5); // on the far side
  });
});

describe('markedAt (rail-back)', () => {
  it('flags the segments touching a marked point, nothing else', () => {
    const loop = createLoop(RECT);
    const back = markedAt(loop, RECT, [{ x: 400, y: 200.3 }]);
    expect(back(300)).toBe(true); // the segment (0,200)→(400,200) ends at the marked point
    expect(back(700)).toBe(true); // (400,200)→(400,0) starts there
    expect(back(100)).toBe(false);
    expect(markedAt(loop, RECT, [])(300)).toBe(false);
  });
});

describe('headingFrame', () => {
  // The world east is screen +x; north is up and squashed (perspective from the south).
  const compass = [
    { x: 100, y: 100 },
    { x: 130, y: 100 },
    { x: 100, y: 80 },
  ];
  it('maps screen directions to the 8 world headings', () => {
    expect(headingFrame({ x: 1, y: 0 }, compass)).toBe(0);
    expect(headingFrame({ x: 0, y: -1 }, compass)).toBe(2);
    expect(headingFrame({ x: -1, y: 0 }, compass)).toBe(4);
    expect(headingFrame({ x: 0, y: 1 }, compass)).toBe(6);
    // 1.5 px right per 1 px up on screen is a world 45° (east 30 : north 20)
    expect(headingFrame({ x: 1.5, y: -1 }, compass)).toBe(1);
  });
});

describe('MapTrain', () => {
  it('dwells at Ga tàu, then departs and runs a lap back to it', () => {
    const train = new MapTrain(createLoop(RECT), CFG);
    expect(train.state).toBe('dwell');
    const ev = run(train, 2100);
    expect(ev).toContainEqual({ kind: 'depart' });
    expect(train.state).toBe('run');
    const lap = run(train, 14000);
    expect(lap).toContainEqual({ kind: 'arrive' });
    expect(train.state).toBe('dwell');
    expect(train.engineS).toBeCloseTo(0, 3);
    expect(train.speed).toBe(0);
  });

  it('never moves faster than cruise and eases its speed', () => {
    const train = new MapTrain(createLoop(RECT), { ...CFG, dwellMs: 0 }, 600);
    let last = 0;
    for (let i = 0; i < 100; i++) {
      train.tick({ dtMs: 20, kartOnCrossing: false, reduced: false });
      expect(train.speed).toBeLessThanOrEqual(100);
      expect(Math.abs(train.speed - last)).toBeLessThanOrEqual(100 * 0.02 + 1e-9);
      last = train.speed;
    }
  });

  it('halves its cruise under reduced motion', () => {
    const train = new MapTrain(createLoop(RECT), CFG, 600);
    run(train, 3000, false, true);
    expect(train.speed).toBeCloseTo(50);
  });

  it('hides the pieces inside the tunnel and reports it', () => {
    const train = new MapTrain(createLoop(RECT), CFG, 650);
    const ev = run(train, 1500);
    expect(ev).toContainEqual({ kind: 'tunnel', inside: true });
    expect(train.pieces().some((p) => p.hidden)).toBe(true);
    const out = run(train, 4000);
    expect(out).toContainEqual({ kind: 'tunnel', inside: false });
    expect(train.pieces().every((p) => !p.hidden)).toBe(true);
  });

  it('lowers the barriers while it passes the crossing, then raises them', () => {
    const train = new MapTrain(createLoop(RECT), CFG, 200);
    const ev = run(train, 4000);
    const bar = ev.filter((e) => e.kind === 'barriers');
    expect(bar).toEqual([
      { kind: 'barriers', down: true },
      { kind: 'barriers', down: false },
    ]);
  });

  it('waits at the signal while the kart drives over the crossing', () => {
    const train = new MapTrain(createLoop(RECT), CFG, 150);
    run(train, 5000, true);
    expect(train.state).toBe('signal');
    expect(train.engineS).toBeCloseTo(250, 3);
    expect(train.barriers).toBe(false);
    const ev = run(train, 200, false);
    expect(ev).toContainEqual({ kind: 'depart' });
    expect(train.state).toBe('run');
  });

  it('does not stop for the kart once past the signal', () => {
    const train = new MapTrain(createLoop(RECT), CFG, 260);
    run(train, 300, true);
    expect(train.state).toBe('run');
    expect(train.engineS).toBeGreaterThan(260);
  });

  it('brakes gently on hold and goes on after release', () => {
    const train = new MapTrain(createLoop(RECT), CFG, 600);
    run(train, 2000);
    expect(train.speed).toBeCloseTo(100);
    train.hold();
    const at = train.engineS;
    run(train, 300);
    expect(train.speed).toBeGreaterThan(0);
    run(train, 1500);
    expect(train.speed).toBe(0);
    expect(train.engineS - at).toBeGreaterThan(40); // braked over a distance, not on the spot
    train.release();
    run(train, 500);
    expect(train.speed).toBeGreaterThan(0);
  });

  it('parks at Ga tàu on demand', () => {
    const train = new MapTrain(createLoop(RECT), CFG, 600);
    run(train, 1000);
    train.parkAtStation();
    expect(train.state).toBe('dwell');
    expect(train.engineS).toBe(0);
    expect(train.atStation).toBe(true);
  });

  it('scales its speed and its gaps with the perspective (review 2026-11-13)', () => {
    const half = new MapTrain(createLoop(RECT), { ...CFG, scale: (s) => (s > 400 && s < 1000 ? 0.5 : 1) }, 600);
    run(half, 3000);
    expect(half.speed).toBeCloseTo(50);
    const [e, c1, c2] = half.pieces();
    expect(e!.s - c1!.s).toBeCloseTo(15);
    expect(c1!.s - c2!.s).toBeCloseTo(15);
  });

  it('trails the cars at their gaps', () => {
    const train = new MapTrain(createLoop(RECT), CFG, 600);
    expect(train.pieces().map((p) => p.s)).toEqual([600, 570, 540, 510]);
  });
});

describe('MapPlane', () => {
  const loop = createLoop(RECT);
  const cfg = { cruise: 200, easeMs: 1000, minGapMs: 5000 };

  it('waits parked for the gap and a ready frame, then flies once and lands', () => {
    const plane = new MapPlane(loop, cfg);
    for (let t = 0; t < 4000; t += 20) expect(plane.tick(20, true)).toBeUndefined();
    for (let t = 0; t < 2000; t += 20) expect(plane.tick(20, false)).toBeUndefined();
    let got: string | undefined;
    for (let t = 0; t < 1000 && !got; t += 20) got = plane.tick(20, true);
    expect(got).toBe('takeoff');
    expect(plane.state).toBe('flying');
    let land: string | undefined;
    let ms = 0;
    while (!land && ms < 20000) {
      land = plane.tick(20, false);
      ms += 20;
    }
    expect(land).toBe('land');
    expect(ms).toBeCloseTo(plane.flightMs, -2);
    expect(plane.state).toBe('parked');
  });

  it('flies the whole loop with eased ends', () => {
    const total = 7000;
    expect(distanceFlown(0, total, 1000, 1200)).toBe(0);
    expect(distanceFlown(total, total, 1000, 1200)).toBeCloseTo(1200);
    expect(distanceFlown(total / 2, total, 1000, 1200)).toBeCloseTo(600);
    const early = distanceFlown(100, total, 1000, 1200);
    expect(early).toBeLessThan((1200 / 6000) * 100);
  });
});

describe('configs from the layout', () => {
  const loop = createLoop(RECT);
  it('derives the train cruise from the lap time and the car gaps from their station spots', () => {
    const cfg = trainConfig(loop, { stationS: 100, carS: [70, undefined, 10], tunnel: undefined, crossing: { from: 300, to: 320 }, signalS: 250 }, 12000, 1000, 3000);
    expect(cfg.cruise).toBeCloseTo(100);
    expect(cfg.accel).toBeCloseTo(100);
    expect(cfg.carGaps).toEqual([30, 80, 90]);
    expect(cfg.tunnel).toBeUndefined();
    const train = new MapTrain(loop, { ...cfg, dwellMs: 0 }, 500);
    run(train, 3000);
    expect(train.pieces().every((p) => !p.hidden)).toBe(true);
  });
  it('derives the plane cruise so one flight lasts flightMs', () => {
    const plane = new MapPlane(loop, planeConfig(loop, 8000, 2000, 1000));
    expect(plane.flightMs).toBeCloseTo(8000);
  });
});

describe('rocketPuffFrame', () => {
  it('puffs a few frames every period, never under reduced motion', () => {
    expect(rocketPuffFrame(0, 6000, 3, 150, false)).toBe(0);
    expect(rocketPuffFrame(310, 6000, 3, 150, false)).toBe(2);
    expect(rocketPuffFrame(500, 6000, 3, 150, false)).toBeUndefined();
    expect(rocketPuffFrame(6000, 6000, 3, 150, false)).toBe(0);
    expect(rocketPuffFrame(0, 6000, 3, 150, true)).toBeUndefined();
  });
});
