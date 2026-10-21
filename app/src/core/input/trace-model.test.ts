// Story 4.1: TraceModel on a horizontal road and on an S-shaped fixture (window, no jump).
import { describe, expect, it } from 'vitest';
import { TraceModel, resample } from './trace-model';
import type { Point } from './polygon';

const line = (a: [number, number], b: [number, number]): Point[] => [
  { x: a[0], y: a[1] },
  { x: b[0], y: b[1] },
];
const H = (): TraceModel => new TraceModel(line([0, 300], [600, 300]));

describe('resample (Story 4.1)', () => {
  it('every 4 px of arc, both ends kept', () => {
    const r = resample(line([0, 0], [10, 0]), 4);
    expect(r).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 8, y: 0 },
      { x: 10, y: 0 },
    ]);
    expect(resample(line([0, 0], [600, 0]), 4)).toHaveLength(151);
  });
});

describe('TraceModel (Story 4.1)', () => {
  it('Grab: a press 90 px from the kart grabs; 130 px does not', () => {
    const far = H();
    expect(far.press({ x: 130, y: 300 })).toBe(false);
    expect(far.state).toBe('idle');
    const m = H();
    expect(m.press({ x: 0, y: 390 })).toBe(true);
    expect(m.state).toBe('tracing');
  });

  it('Close band: finger 100 px ahead, 60 px off → s += 50 in 50 ms; Mid band (110 px off) → s += 25; Stop band (160 px) → wait, no advance', () => {
    const m = H();
    m.press({ x: 5, y: 300 });
    m.move({ x: 100, y: 360 });
    expect(m.tick(50)).toEqual([{ kind: 'progress', s: 50, index: 12 }]);
    m.move({ x: 150, y: 410 });
    m.tick(50);
    expect(m.s).toBe(75);
    m.move({ x: 150, y: 460 });
    expect(m.tick(50)).toEqual([{ kind: 'wait' }]);
    expect(m.s).toBe(75);
    expect(m.state).toBe('waiting');
    expect(m.tick(50)).toEqual([]);
  });

  it('Back in, still down: after the stop the same finger 70 px from the kart re-grabs and advances again', () => {
    const m = H();
    m.press({ x: 0, y: 300 });
    m.move({ x: 0, y: 460 });
    m.tick(50);
    expect(m.state).toBe('waiting');
    expect(m.move({ x: 70, y: 300 })).toEqual([{ kind: 'grab' }]);
    expect(m.state).toBe('tracing');
    m.tick(50);
    expect(m.s).toBe(50);
  });

  it('Backward: a finger behind the kart never moves it back', () => {
    const m = H();
    m.press({ x: 0, y: 300 });
    m.move({ x: 200, y: 300 });
    m.tick(100);
    expect(m.s).toBe(100);
    m.move({ x: 20, y: 300 });
    expect(m.tick(100)).toEqual([]);
    expect(m.s).toBe(100);
  });

  it('dt is clamped to 250 ms; s never passes the finger', () => {
    const m = H();
    m.press({ x: 0, y: 300 });
    m.move({ x: 230, y: 300 });
    m.tick(10_000);
    expect(m.s).toBe(230);
    m.tick(10_000);
    expect(m.s).toBe(230);
    const n = H();
    n.press({ x: 0, y: 300 });
    n.move({ x: 239, y: 300 });
    n.tick(10_000);
    expect(n.s).toBe(239);
  });

  it('Near other part (S road): a finger beside a part 400 px of arc ahead projects only within [s, s+240] — no jump', () => {
    // Right 300, down 120, left 300: the third leg runs back under the first.
    const s: Point[] = [
      { x: 100, y: 200 },
      { x: 400, y: 200 },
      { x: 400, y: 320 },
      { x: 100, y: 320 },
    ];
    const m = new TraceModel(s);
    m.press({ x: 100, y: 200 });
    // Finger on the third leg at x 100 (arc ≈ 720): within 140 px of the first leg's start too.
    m.move({ x: 100, y: 320 });
    const ev = m.tick(250);
    expect(m.s).toBeLessThanOrEqual(240);
    // The nearest point in the window is the kart itself (120 px straight down) → mid band, no advance.
    expect(ev).toEqual([]);
    expect(m.state).toBe('tracing');
  });

  it('Lift: release mid-road → waiting, s kept; a press 150 px away does nothing; next to the kart continues', () => {
    const m = H();
    m.press({ x: 0, y: 300 });
    m.move({ x: 200, y: 300 });
    m.tick(200);
    expect(m.release()).toEqual([{ kind: 'wait' }]);
    expect(m.state).toBe('waiting');
    expect(m.s).toBe(200);
    expect(m.press({ x: 350, y: 300 })).toBe(false);
    // A move without a pressed finger does nothing.
    expect(m.move({ x: 200, y: 300 })).toEqual([]);
    expect(m.press({ x: 210, y: 320 })).toBe(true);
    expect(m.s).toBe(200);
  });

  it('Arrive: within 8 px of the end → s = length, arrive (terminal)', () => {
    const m = H();
    m.press({ x: 0, y: 300 });
    for (let i = 0; i < 10 && m.state !== 'arrived'; i++) {
      m.move({ x: Math.min(600, m.s + 200), y: 300 });
      m.tick(250);
    }
    expect(m.state).toBe('arrived');
    expect(m.s).toBe(600);
    expect(m.press(m.point)).toBe(false);
    expect(m.tick(50)).toEqual([]);
    // Stopping 7 px short of the end still arrives (the slack); far ahead of the window waits instead.
    const n = H();
    n.restore(100);
    n.press(n.point);
    n.move({ x: 593, y: 300 });
    n.tick(250);
    expect(n.state).toBe('arrived');
    expect(n.s).toBe(600);
    const f = H();
    f.press({ x: 0, y: 300 });
    f.move({ x: 593, y: 300 });
    expect(f.tick(250)).toEqual([{ kind: 'wait' }]);
  });

  it('restore(index) puts the kart at index × step, waiting; geometry helpers', () => {
    const m = H();
    m.restore(25);
    expect(m.s).toBe(100);
    expect(m.state).toBe('waiting');
    expect(m.index).toBe(25);
    expect(m.point).toEqual({ x: 100, y: 300 });
    m.restore(1e6);
    expect(m.s).toBe(600);
    expect(m.tangentAt(0)).toEqual({ x: 1, y: 0 });
    const st = m.stretch(100, 120);
    expect(st[0]).toEqual({ x: 100, y: 300 });
    expect(st[st.length - 1]).toEqual({ x: 120, y: 300 });
  });
});

describe('TraceModel on shaped roads (Story 4.2, unchanged model)', () => {
  /** An open circle (centre 512,400, r 180, screen y down) with a 140 px mouth at the bottom, start on the right lip. */
  const R = 180;
  const half = Math.asin(70 / R);
  const loop: Point[] = Array.from({ length: 121 }, (_, i) => {
    // From the right lip (bottom right) up the right side, over the top, down to the left lip.
    const a = Math.PI / 2 - half - (i / 120) * (2 * Math.PI - 2 * half);
    return { x: 512 + R * Math.cos(a), y: 400 + R * Math.sin(a) };
  });

  it('Loop, gate press: a press on the end point (140 px from the kart) does not grab', () => {
    const m = new TraceModel(loop);
    const end = loop[loop.length - 1]!;
    expect(Math.hypot(end.x - m.point.x, end.y - m.point.y)).toBeCloseTo(140, 0);
    expect(m.press(end)).toBe(false);
    expect(m.s).toBe(0);
  });

  it('Loop, drag to gate: the window [0, 240] runs away from the gate — no advance; arrival only after the whole loop', () => {
    const m = new TraceModel(loop);
    m.press(m.point);
    m.move(loop[loop.length - 1]!);
    for (let i = 0; i < 20; i++) m.tick(100);
    expect(m.s).toBe(0);
    let arrived = false;
    for (let k = 1; k < loop.length && !arrived; k++) {
      m.move(loop[k]!);
      for (let i = 0; i < 4 && !arrived; i++) arrived = m.tick(100).some((e) => e.kind === 'arrive');
      if (!arrived) expect(m.s).toBeLessThan(m.length - m.opts.arriveSlack);
    }
    expect(arrived).toBe(true);
    expect(m.s).toBe(m.length);
  });

  it('Zigzag corner cut: a finger 60 px inside a filleted corner moves the kart along the arc; the point stays on the road', () => {
    // Down-right leg, a fillet of r 80 around (400, 420), up-right leg.
    const fillet = Array.from({ length: 13 }, (_, i) => {
      const a = ((135 - (90 * i) / 12) * Math.PI) / 180;
      return { x: 400 + 80 * Math.cos(a), y: 420 + 80 * Math.sin(a) };
    });
    const zig: Point[] = [{ x: 200, y: 280 }, ...fillet, { x: 600, y: 280 }];
    const m = new TraceModel(zig);
    m.press(m.point);
    let last = 0;
    // A finger cutting straight across the corner, 60 px inside the apex of the arc.
    for (let x = 220; x <= 580; x += 20) {
      m.move({ x, y: 440 });
      m.tick(60);
      expect(m.s).toBeGreaterThanOrEqual(last);
      last = m.s;
      const p = m.point;
      const onRoad = Math.min(...m.samples.slice(1).map((b, i) => {
        const a = m.samples[i]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
      }));
      expect(onRoad).toBeLessThan(0.5);
    }
    expect(m.s).toBeGreaterThan(200);
  });
});
