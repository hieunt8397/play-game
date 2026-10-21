// Story 4.3: PositionHistory, pickMoving and the TapTarget `area` option.
import { describe, expect, it, vi } from 'vitest';
import { fakeScene, press } from './fakes';
import { InputGuard } from './guard';
import { PositionHistory, pickMoving } from './moving-pick';
import { locate, NO_INSETS } from './space';
import { createTapRouter } from './tap-router';
import { createTapTarget } from './tap-target';

describe('PositionHistory (Story 4.3)', () => {
  it('interpolates; the oldest before, the newest after; undefined when empty; keeps ~300 ms', () => {
    const h = new PositionHistory(300);
    expect(h.at(0)).toBeUndefined();
    h.push(0, { x: 0, y: 0 });
    h.push(100, { x: 10, y: 0 });
    expect(h.at(50)).toEqual({ x: 5, y: 0 });
    expect(h.at(-10)).toEqual({ x: 0, y: 0 });
    expect(h.at(200)).toEqual({ x: 10, y: 0 });
    for (let t = 200; t <= 1000; t += 100) h.push(t, { x: t / 10, y: 0 });
    // Old samples are dropped: 300 ms before the newest is still answered exactly.
    expect(h.at(700)).toEqual({ x: 70, y: 0 });
    expect(h.at(0)).toEqual({ x: 70, y: 0 });
    h.clear();
    expect(h.at(500)).toBeUndefined();
  });
});

describe('pickMoving (Story 4.3)', () => {
  const fish = (id: string, nowX: number, pastX: number) => ({ id, now: { x: nowX, y: 300 }, past: { x: pastX, y: 300 }, halfW: 55, halfH: 35 });

  it('Lookback hit: a fish at 60 px/s, tap at its centre 150 ms ago, 9 px outside its current hit rect → hit', () => {
    // 60 px/s × 150 ms = 9 px … plus the 85 px half-width+pad: tap where the fish was, 94 px behind its centre now.
    const now = 400;
    const past = now - 94;
    const tap = { x: past, y: 300 };
    expect(Math.abs(tap.x - now)).toBeGreaterThan(55 + 30);
    expect(pickMoving(tap, [fish('a', now, past)], 30)).toBe('a');
    expect(pickMoving(tap, [fish('a', now, now)], 30)).toBeNull();
  });

  it('Overlap: the nearer centre (now or past) wins; a tie goes to the earlier candidate; none → null', () => {
    expect(pickMoving({ x: 330, y: 300 }, [fish('a', 300, 300), fish('b', 380, 380)], 30)).toBe('a');
    expect(pickMoving({ x: 365, y: 300 }, [fish('a', 300, 300), fish('b', 380, 380)], 30)).toBe('b');
    expect(pickMoving({ x: 340, y: 300 }, [fish('a', 300, 300), fish('b', 380, 380)], 30)).toBe('a');
    expect(pickMoving({ x: 340, y: 300 }, [fish('a', 300, 300), fish('b', 500, 345)], 30)).toBe('b');
    expect(pickMoving({ x: 900, y: 300 }, [fish('a', 300, 300)], 30)).toBeNull();
    expect(pickMoving({ x: 300, y: 300 }, [], 30)).toBeNull();
  });
});

describe('createTapTarget area (Story 4.3)', () => {
  it('an area target gets every press inside it with its design point; dead-zone presses never reach it', () => {
    const guard = new InputGuard((p) => locate(p, undefined, { w: 1024, h: 768, rotated: false, insets: NO_INSETS }));
    const scene = fakeScene();
    const router = createTapRouter(scene, { guard });
    const onPress = vi.fn();
    createTapTarget(router, { area: { contains: (p) => p.x > 100 }, onPress });
    scene.tap(500, 400);
    expect(onPress).toHaveBeenCalledWith({ x: 500, y: 400 });
    scene.tap(50, 400);
    scene.down(press(10, 400, 3));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
