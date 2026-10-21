// Story 5.4: the pure tap-reaction model (classification, ripple gap) and its router target (real
// targets win by z; a non-pickable draggable falls through; games/registry.test covers the hint gating).
import { describe, expect, it, vi } from 'vitest';
import { createDraggable } from './input/drag-controller';
import { fakeScene } from './input/fakes';
import { InputGuard } from './input/guard';
import { createTapRouter } from './input/tap-router';
import { createTapTarget } from './input/tap-target';
import type { Point } from './input/polygon';
import { addTapReactTarget, classifyTap, createTapReactor, TAP_REACT_Z, type ReactEntry, type TapReaction } from './tap-react';
import { Tokens } from './tokens';

const box = (id: string, x: number, y: number, w: number, h: number, extra: Partial<ReactEntry> = {}): ReactEntry => ({
  id,
  contains: (p) => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h,
  ...extra,
});

describe('classifyTap', () => {
  const shiba = box('shiba', 100, 100, 200, 200);
  const cloud = box('cloud', 250, 250, 100, 100);

  it('a point inside a registered sprite → sprite; outside every one → background', () => {
    expect(classifyTap({ x: 150, y: 150 }, [shiba, cloud])).toEqual({ kind: 'sprite', id: 'shiba' });
    expect(classifyTap({ x: 600, y: 600 }, [shiba, cloud])).toEqual({ kind: 'background' });
    expect(classifyTap({ x: 0, y: 0 }, [])).toEqual({ kind: 'background' });
  });

  it('overlap: the last-added entry wins', () => {
    expect(classifyTap({ x: 280, y: 280 }, [shiba, cloud])).toEqual({ kind: 'sprite', id: 'cloud' });
    expect(classifyTap({ x: 280, y: 280 }, [cloud, shiba])).toEqual({ kind: 'sprite', id: 'shiba' });
  });

  it('enabled false: the entry is skipped (the one under it, or the background)', () => {
    const busy = box('cloud', 250, 250, 100, 100, { enabled: () => false });
    expect(classifyTap({ x: 280, y: 280 }, [shiba, busy])).toEqual({ kind: 'sprite', id: 'shiba' });
    expect(classifyTap({ x: 340, y: 340 }, [shiba, busy])).toEqual({ kind: 'background' });
  });

  it('isTarget: classified target (no bounce, no ripple)', () => {
    const zone = box('zone', 100, 100, 200, 200, { isTarget: () => true });
    expect(classifyTap({ x: 150, y: 150 }, [zone])).toEqual({ kind: 'target' });
  });
});

describe('createTapReactor', () => {
  const entries = [box('shiba', 100, 100, 200, 200), box('zone', 400, 400, 50, 50, { isTarget: () => true })];
  const gap = Tokens.Timing.tapRippleMinGapMs;

  it('the ripple gap is the 1 Hz floor', () => {
    expect(gap).toBe(1000);
    expect(gap).toBeGreaterThanOrEqual(Tokens.Timing.flashMinPeriodMs);
  });

  it('background taps closer than the gap: only the first ripples; after the gap again', () => {
    const r = createTapReactor({ rippleMinGapMs: gap });
    expect(r.press({ x: 700, y: 700 }, 0, entries)).toEqual({ kind: 'ripple' });
    expect(r.press({ x: 700, y: 700 }, gap - 1, entries)).toEqual({ kind: 'none' });
    expect(r.press({ x: 700, y: 700 }, gap, entries)).toEqual({ kind: 'ripple' });
  });

  it('the bounce is not throttled; a target entry gives none', () => {
    const r = createTapReactor({ rippleMinGapMs: gap });
    expect(r.press({ x: 150, y: 150 }, 0, entries)).toEqual({ kind: 'sprite', id: 'shiba' });
    expect(r.press({ x: 150, y: 150 }, 1, entries)).toEqual({ kind: 'sprite', id: 'shiba' });
    expect(r.press({ x: 420, y: 420 }, 2, entries)).toEqual({ kind: 'none' });
    // A bounce never used up the ripple.
    expect(r.press({ x: 700, y: 700 }, 3, entries)).toEqual({ kind: 'ripple' });
  });
});

describe('addTapReactTarget (router level)', () => {
  function world() {
    const guard = new InputGuard();
    const scene = fakeScene();
    const router = createTapRouter(scene, { guard });
    let now = 0;
    const blocked = { on: false };
    const reactions: Array<{ r: TapReaction; p: Point }> = [];
    const shiba = box('shiba', 100, 100, 200, 200);
    addTapReactTarget(router, {
      rippleMinGapMs: Tokens.Timing.tapRippleMinGapMs,
      now: () => now,
      entries: () => [shiba],
      blocked: () => blocked.on,
      onReaction: (r, p) => reactions.push({ r, p }),
    });
    const tick = (ms: number): void => {
      now += ms;
    };
    return { guard, scene, router, reactions, blocked, tick };
  }

  it('TAP_REACT_Z sits below the 5.1 catcher (−2) and Map decorations (−1)', () => {
    expect(TAP_REACT_Z).toBeLessThan(-2);
  });

  it('sprite tap bounces, background tap ripples at the press point', () => {
    const w = world();
    w.scene.tap(150, 150);
    w.scene.tap(600, 600);
    expect(w.reactions).toEqual([
      { r: { kind: 'sprite', id: 'shiba' }, p: { x: 150, y: 150 } },
      { r: { kind: 'ripple' }, p: { x: 600, y: 600 } },
    ]);
  });

  it('two quick background taps: one ripple', () => {
    const w = world();
    w.scene.tap(600, 600);
    w.tick(Tokens.Timing.tapRippleMinGapMs - 1);
    w.scene.tap(610, 600);
    expect(w.reactions).toHaveLength(1);
  });

  it('a z 0 target over the sprite wins; the reaction never runs', () => {
    const w = world();
    const oven = vi.fn();
    createTapTarget(w.router, { circle: { x: 150, y: 150, r: 40 }, onPress: oven });
    w.scene.tap(150, 150);
    expect(oven).toHaveBeenCalledTimes(1);
    expect(w.reactions).toEqual([]);
  });

  it('a pickable draggable wins; once non-pickable the press falls through to the sprite under it', () => {
    const w = world();
    const cb = { onLift: vi.fn(), onMove: vi.fn(), onDrop: vi.fn(), onCancel: vi.fn() };
    const item = createDraggable(w.router, { circle: { x: 150, y: 150, r: 40 }, guard: w.guard, area: () => undefined, ...cb });
    w.scene.tap(150, 150);
    expect(cb.onLift).toHaveBeenCalledTimes(1);
    expect(w.reactions).toEqual([]);
    w.guard.setPickable(item, false);
    w.scene.tap(150, 150);
    expect(cb.onLift).toHaveBeenCalledTimes(1);
    expect(w.reactions).toEqual([{ r: { kind: 'sprite', id: 'shiba' }, p: { x: 150, y: 150 } }]);
  });

  it('a selected item: the catcher (−2) flies it to the tap on the sprite or background; no reaction', () => {
    const w = world();
    const cb = { onLift: vi.fn(), onMove: vi.fn(), onDrop: vi.fn(), onCancel: vi.fn(), onSelect: vi.fn(), onDeselect: vi.fn() };
    const item = createDraggable(w.router, { circle: { x: 500, y: 500, r: 40 }, guard: w.guard, area: () => undefined, ...cb });
    w.scene.tap(500, 500);
    expect(item.isSelected()).toBe(true);
    w.scene.tap(150, 150);
    expect(cb.onDrop).toHaveBeenLastCalledWith({ x: 150, y: 150 });
    expect(w.reactions).toEqual([]);
  });

  it('blocked: nothing happens and no ripple is used up', () => {
    const w = world();
    w.blocked.on = true;
    w.scene.tap(150, 150);
    w.scene.tap(600, 600);
    expect(w.reactions).toEqual([]);
    w.blocked.on = false;
    w.scene.tap(600, 600);
    expect(w.reactions).toEqual([{ r: { kind: 'ripple' }, p: { x: 600, y: 600 } }]);
  });
});
