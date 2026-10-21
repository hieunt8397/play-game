// Story 1.9: pure geometry of the hint visuals (ring rect, hand path, bob amplitude).
import { describe, expect, it } from 'vitest';
import { alongRoute, bobFactor, itemBounds, handDemo, handDuration, handPose, handRoute, handStyle, itemRingBox, ringRadii, type HandTiming } from './hint-visuals';
import { Tokens } from './tokens';

const TIMING: HandTiming = { pressMs: 250, liftMs: 200, moveMs: 1200, fadeMs: 300, pressScale: 0.9 };

describe('hint ring box', () => {
  it('is the item bounds grown by ui.hintRingPad on every side; the ring is inscribed', () => {
    const box = itemRingBox({ x: 100, y: 200, width: 90, height: 80 });
    const pad = Tokens.ui.hintRingPad;
    expect(box).toEqual({ x: 100 - pad, y: 200 - pad, width: 90 + 2 * pad, height: 80 + 2 * pad });
    expect(ringRadii(box)).toEqual({ cx: 145, cy: 240, rx: 45 + pad, ry: 40 + pad });
  });
});

describe('itemBounds', () => {
  const base = { x: 300, y: 500, scaleX: 0.5, scaleY: 0.5, alpha: 1, setScale: () => undefined, setAlpha: () => undefined };

  it('a trimmed full-frame sprite: the trim rect, not the whole frame', () => {
    const o = {
      ...base,
      width: 2048,
      height: 1536,
      originX: 0.3,
      originY: 0.6,
      frame: { data: { trim: true, spriteSourceSize: { x: 544, y: 908, w: 230, h: 168 } } },
      getBounds: () => ({ x: 0, y: 0, width: 1024, height: 768 }),
    };
    const left = 300 - 0.3 * 2048 * 0.5;
    const top = 500 - 0.6 * 1536 * 0.5;
    expect(itemBounds(o)).toEqual({ x: left + 272, y: top + 454, width: 115, height: 84 });
  });

  it('otherwise getBounds, else the point', () => {
    expect(itemBounds({ ...base, getBounds: () => ({ x: 1, y: 2, width: 3, height: 4 }) })).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(itemBounds(base)).toEqual({ x: 300, y: 500, width: 0, height: 0 });
  });
});

describe('hand route and pose', () => {
  const from = { x: 100, y: 500 };
  const to = { x: 512, y: 400 };

  it('drag: item → target centre; tap or no target: the item only; trace: the path', () => {
    expect(handRoute({ action: 'drag' }, from, to)).toEqual([from, to]);
    expect(handRoute({ action: 'drag' }, from, undefined)).toEqual([from]);
    expect(handRoute({ action: 'tap' }, from, to)).toEqual([from]);
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(handRoute({ action: 'trace', path }, from, to)).toEqual(path);
    expect(handRoute({ action: 'trace' }, from, to)).toEqual([from]);
    // Story 4.1: a getter is resolved each time a demo starts (the stretch ahead of the kart).
    let calls = 0;
    const getter = () => {
      calls++;
      return path.slice(calls - 1);
    };
    expect(handRoute({ action: 'trace', path: getter }, from, to)).toEqual(path);
    expect(handRoute({ action: 'trace', path: getter }, from, to)).toEqual(path.slice(1));
    expect(calls).toBe(2);
  });

  it('press on the item, move to the target (ease in-out), lift and fade there', () => {
    const route = [from, to];
    expect(handDuration(route, TIMING)).toBe(1750);
    expect(handPose(route, 0, TIMING)).toEqual({ ...from, scale: 1, alpha: 1 });
    const pressed = handPose(route, 249.999, TIMING);
    expect(pressed.scale).toBeCloseTo(0.9);
    expect(pressed).toMatchObject(from);
    const mid = handPose(route, 250 + 600, TIMING);
    expect(mid.x).toBeCloseTo((from.x + to.x) / 2);
    expect(mid.y).toBeCloseTo((from.y + to.y) / 2);
    // Ease in-out: a quarter of the time covers less than a quarter of the way.
    const q = handPose(route, 250 + 300, TIMING);
    expect((q.x - from.x) / (to.x - from.x)).toBeLessThan(0.25);
    const end = handPose(route, 1750, TIMING);
    expect(end).toEqual({ ...to, scale: 1, alpha: 0 });
  });

  it('Story 5.1: a drag demo is tap-then-tap — tap the item, travel lifted, tap the target, fade there', () => {
    const route = handRoute({ action: 'drag' }, from, to);
    expect(handStyle({ action: 'drag' }, route)).toBe('tap-tap');
    expect(handStyle({ action: 'drag' }, [from])).toBe('press-move');
    expect(handStyle({ action: 'trace' }, [from, to])).toBe('press-move');
    expect(handDuration(route, TIMING, 'tap-tap')).toBe(250 + 200 + 1200 + 250 + 300);
    // Press on the item…
    expect(handPose(route, 0, TIMING, 'tap-tap')).toEqual({ ...from, scale: 1, alpha: 1 });
    expect(handPose(route, 249.999, TIMING, 'tap-tap').scale).toBeCloseTo(0.9);
    // …lift off it (still on the item): half way through the lift, half way back to scale 1…
    const midLift = handPose(route, 250 + 100, TIMING, 'tap-tap');
    expect(midLift).toMatchObject({ ...from, alpha: 1 });
    expect(midLift.scale).toBeCloseTo(0.95);
    const lifted = handPose(route, 450, TIMING, 'tap-tap');
    expect(lifted).toMatchObject(from);
    expect(lifted.scale).toBeCloseTo(1);
    // …travel lifted (scale 1)…
    const mid = handPose(route, 450 + 600, TIMING, 'tap-tap');
    expect(mid.scale).toBe(1);
    expect(mid.x).toBeCloseTo((from.x + to.x) / 2);
    // …press on the target…
    const tap2 = handPose(route, 1650 + 249.999, TIMING, 'tap-tap');
    expect(tap2).toMatchObject(to);
    expect(tap2.scale).toBeCloseTo(0.9);
    // …lift and fade there.
    // Half way through the fade at the target.
    const midFade = handPose(route, 1900 + 150, TIMING, 'tap-tap');
    expect(midFade).toMatchObject(to);
    expect(midFade.scale).toBeCloseTo(0.95);
    expect(midFade.alpha).toBeCloseTo(0.5);
    expect(handPose(route, 2200, TIMING, 'tap-tap')).toEqual({ ...to, scale: 1, alpha: 0 });
  });

  it('Story 5.1 handDemo: a drag step with a target → tap-tap and its full duration; a trace step → press-move', () => {
    const drag = handDemo({ action: 'drag' }, from, to, TIMING);
    expect(drag.route).toEqual([from, to]);
    expect(drag.style).toBe('tap-tap');
    expect(drag.total).toBe(handDuration(drag.route, TIMING, 'tap-tap'));
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const trace = handDemo({ action: 'trace', path }, from, to, TIMING);
    expect(trace.style).toBe('press-move');
    expect(trace.route).toEqual(path);
    expect(trace.total).toBe(handDuration(path, TIMING, 'press-move'));
  });

  it('tap: press and fade on the item, no move', () => {
    const route = [from];
    expect(handDuration(route, TIMING)).toBe(550);
    expect(handPose(route, 400, TIMING)).toMatchObject(from);
    expect(handPose(route, 550, TIMING).alpha).toBe(0);
  });

  it('alongRoute walks the polyline by length', () => {
    const route = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 30 },
    ];
    expect(alongRoute(route, 0.25)).toEqual({ x: 10, y: 0 });
    expect(alongRoute(route, 1)).toEqual({ x: 10, y: 30 });
    expect(alongRoute(route, 0.5)).toEqual({ x: 10, y: 10 });
  });
});

describe('item bob', () => {
  it('1 ↔ ui.hintItemBobScale; reduced motion halves the amplitude', () => {
    expect(bobFactor(0, false)).toBe(1);
    expect(bobFactor(1, false)).toBeCloseTo(Tokens.ui.hintItemBobScale);
    expect(bobFactor(1, true) - 1).toBeCloseTo((Tokens.ui.hintItemBobScale - 1) * Tokens.ui.reducedMotionAmplitude);
  });
});
