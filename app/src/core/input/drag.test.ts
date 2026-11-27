// Story 1.8: DragController, drop maths and the guard's drag API (I/O matrix input rows).
import { describe, expect, it, vi } from 'vitest';
import { hudLayout } from '../hud';
import { createDraggable, type DragArea } from './drag-controller';
import { clampDrag, createDropTarget, dragBounds, hudExclusions, intersectRect, nudgeApart } from './drop';
import { fakeScene, press } from './fakes';
import { InputGuard } from './guard';
import { designToLocal, locate, NO_INSETS, visibleDesignRect } from './space';
import { createTapRouter } from './tap-router';
import { createTapTarget } from './tap-target';
import { Tokens } from '../tokens';

const VIEW = { w: 1024, h: 768, rotated: false, insets: NO_INSETS };
const WIDE = { w: 1180, h: 820, rotated: false, insets: NO_INSETS };

function world(area?: DragArea) {
  const guard = new InputGuard((p) => locate(p, undefined, VIEW));
  const scene = fakeScene();
  const router = createTapRouter(scene, { guard });
  const hudScene = fakeScene();
  const hud = createTapRouter(hudScene, { guard, layer: 'hud' });
  const cb = { onLift: vi.fn(), onMove: vi.fn(), onDrop: vi.fn(), onCancel: vi.fn() };
  const item = createDraggable(router, { circle: { x: 300, y: 500, r: 70 }, itemRadius: 45, guard, area: () => area, ...cb });
  return { guard, scene, router, hud, hudScene, cb, item };
}

describe('dragBounds / hudExclusions', () => {
  it('4:3: the design frame inset by the dead strips', () => {
    expect(dragBounds(VIEW)).toEqual({ x: 24, y: 32, w: 1024 - 48, h: 768 - 72 });
  });

  it('wider screens: the visible rect inset by (dead + inset) / s', () => {
    const b = dragBounds({ ...WIDE, insets: { top: 0, right: 0, bottom: 20, left: 0 } });
    const v = visibleDesignRect(WIDE);
    const s = 1180 / 1024;
    expect(b.x).toBeCloseTo(v.x + 24 / s);
    expect(b.y + b.h).toBeCloseTo(v.y + v.h - (40 + 20) / s);
  });

  describe('phone 844x390 (play box 569.4x390 between two 137.3 px bars)', () => {
    const phone = { w: 844, h: 390, rotated: false, insets: NO_INSETS };
    const BOX_W = 390 * Tokens.supportedAspect.max;
    const BAR = (844 - BOX_W) / 2;
    const S = BOX_W / 1024;
    // Hud offsets from the visible rect corners (design px): edgeInset + half, buttonTop/speakerTop + half.
    const HALF = Tokens.components.buttonRound.size / 2;
    const HOME_DX = Tokens.spacing.edgeInset + HALF;
    const HOME_DY = Tokens.spacing.buttonTop + HALF;
    const SPEAKER_DY = Tokens.spacing.speakerTop + HALF;
    const R = HALF + Tokens.spacing.hitPad;

    it('bounds are the play box (not the bars) inset by the strips; a notch inside the bar adds nothing', () => {
      const v = visibleDesignRect(phone);
      const b = dragBounds(phone);
      expect(b.x).toBe(v.x + 24 / S);
      expect(b.y).toBe(v.y + 32 / S);
      expect(b.w).toBeCloseTo(v.w - 48 / S, 9);
      expect(b.h).toBeCloseTo(v.h - 72 / S, 9);
      expect(dragBounds({ ...phone, insets: { top: 0, right: 0, bottom: 0, left: 47 } })).toEqual(b);
    });

    it('the Hud circles sit at the play box corners (exact, design and local px)', () => {
      const v = visibleDesignRect(phone);
      const [home, speaker] = hudExclusions(phone);
      expect(home).toEqual({ x: v.x + HOME_DX, y: v.y + HOME_DY, r: R });
      expect(speaker).toEqual({ x: v.x + v.w - HOME_DX, y: v.y + SPEAKER_DY, r: R });
      // On screen: Home is HOME_DX × s right of the left bar, at the top of the box.
      const local = designToLocal(home!, phone);
      expect(local.x).toBeCloseTo(BAR + HOME_DX * S, 9);
      expect(local.y).toBeCloseTo(HOME_DY * S, 9);
      const sl = designToLocal(speaker!, phone);
      expect(sl.x).toBeCloseTo(844 - BAR - HOME_DX * S, 9);
      expect(sl.y).toBeCloseTo(SPEAKER_DY * S, 9);
    });

    it('rotated (portrait iPhone, screen insets top 47 / bottom 34): insets lie in the bars, Hud unchanged', () => {
      const port = { ...phone, rotated: true, insets: { top: 47, right: 0, bottom: 34, left: 0 } };
      expect(hudExclusions(port)).toEqual(hudExclusions(phone));
      expect(dragBounds(port)).toEqual(dragBounds(phone));
    });

    it('an inset reaching past the bar shifts the Hud by the residue only (landscape and rotated)', () => {
      const v = visibleDesignRect(phone);
      const land = { ...phone, insets: { top: 0, right: 0, bottom: 0, left: 150 } };
      const [home] = hudExclusions(land);
      expect(home).toEqual({ x: v.x + Tokens.spacing.edgeInset + (150 - BAR) / S + HALF, y: v.y + HOME_DY, r: R });
      expect(dragBounds(land).x).toBe(v.x + (24 + 150 - BAR) / S);
      // Rotated: the screen top inset is the stage-local left inset.
      const port = { ...phone, rotated: true, insets: { top: 150, right: 0, bottom: 0, left: 0 } };
      expect(hudExclusions(port)).toEqual(hudExclusions(land));
    });
  });

  it('the Hud circles, r = size/2 + hitPad', () => {
    const ex = hudExclusions(VIEW);
    const hud = hudLayout(visibleDesignRect(VIEW), NO_INSETS);
    expect(ex).toEqual([hud.home, hud.speaker]);
    expect(ex[0]!.r).toBe(44 + 24);
  });
});

describe('clampDrag', () => {
  const bounds = { x: 24, y: 32, w: 976, h: 696 };
  it('Clamp: (5, 400) is held inside the bounds shrunk by the item radius', () => {
    expect(clampDrag({ x: 5, y: 400 }, bounds, [], 45)).toEqual({ x: 69, y: 400 });
  });

  it('Clamp: over the Speaker it is pushed out of the Hud circle grown by the item radius', () => {
    const speaker = hudExclusions(VIEW)[1]!;
    const q = clampDrag({ x: speaker.x - 10, y: speaker.y }, bounds, [speaker], 45);
    expect(Math.hypot(q.x - speaker.x, q.y - speaker.y)).toBeGreaterThanOrEqual(speaker.r + 45 - 1e-9);
  });
});

describe('createDropTarget / snap scale', () => {
  it('Snap scale: setSnapScale(cone, 2) → radius 200', () => {
    const guard = new InputGuard();
    const cone = createDropTarget({ id: 'cone', circle: { x: 500, y: 500, r: 100 } }, guard);
    expect(cone.contains({ x: 650, y: 500 })).toBe(false);
    guard.setSnapScale(cone, 2);
    expect(guard.snapScale(cone)).toBe(2);
    expect(cone.circle()).toEqual({ x: 500, y: 500, r: 200 });
    expect(cone.contains({ x: 650, y: 500 })).toBe(true);
  });

  it('Story 3.1: a circle pad is added unscaled (hit r = pad + r × snapScale)', () => {
    const guard = new InputGuard();
    const base = createDropTarget({ id: 'base', circle: { x: 300, y: 500, r: 100 }, pad: 140 }, guard);
    expect(base.circle()).toEqual({ x: 300, y: 500, r: 240 });
    expect(base.contains({ x: 539, y: 500 })).toBe(true);
    expect(base.contains({ x: 541, y: 500 })).toBe(false);
    guard.setSnapScale(base, 2);
    expect(base.circle()?.r).toBe(340);
  });

  it('polygon targets do not scale', () => {
    const guard = new InputGuard();
    const t = createDropTarget({ id: 'p', polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }, guard);
    guard.setSnapScale(t, 3);
    expect(t.contains({ x: 5, y: 5 })).toBe(true);
    expect(t.contains({ x: 15, y: 5 })).toBe(false);
    expect(t.circle()).toBeUndefined();
  });
});

describe('nudgeApart / intersectRect', () => {
  const rect = { x: 50, y: 500, w: 900, h: 200 };
  it('moves a point at least minDist from every other, inside the rect', () => {
    const q = nudgeApart({ x: 305, y: 600 }, [{ x: 300, y: 600 }], 90, rect);
    expect(Math.hypot(q.x - 300, q.y - 600)).toBeGreaterThanOrEqual(90 - 1e-9);
    const c = nudgeApart({ x: 300, y: 600 }, [{ x: 300, y: 600 }], 90, rect);
    expect(c).toEqual({ x: 390, y: 600 });
  });

  it('a clear point stays put', () => {
    expect(nudgeApart({ x: 500, y: 600 }, [{ x: 300, y: 600 }], 90, rect)).toEqual({ x: 500, y: 600 });
  });

  const clear = (q: { x: number; y: number }, others: readonly { x: number; y: number }[], min: number) =>
    others.every((o) => Math.hypot(q.x - o.x, q.y - o.y) >= min - 1e-6);
  const inside = (q: { x: number; y: number }, r: typeof rect) => q.x >= r.x && q.x <= r.x + r.w && q.y >= r.y && q.y <= r.y + r.h;

  it('wedged between two items (where the push bounces back) → the nearest clear spot, not an overlap', () => {
    const row = { x: 50, y: 500, w: 900, h: 90 };
    const others = [
      { x: 300, y: 545 },
      { x: 400, y: 545 },
    ];
    const q = nudgeApart({ x: 350, y: 545 }, others, 90, row);
    expect(clear(q, others, 90)).toBe(true);
    expect(inside(q, row)).toBe(true);
  });

  it('against the rect edge with a neighbour → a clear spot inside the rect', () => {
    const others = [{ x: 90, y: 520 }];
    const q = nudgeApart({ x: 50, y: 500 }, others, 90, rect);
    expect(clear(q, others, 90)).toBe(true);
    expect(inside(q, rect)).toBe(true);
  });

  it('a crowded counter with room left: every point placed in turn stays clear (no overlap)', () => {
    const placed: { x: number; y: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const q = nudgeApart({ x: 300 + (i % 3) * 7, y: 600 }, placed, 90, rect);
      expect(clear(q, placed, 90)).toBe(true);
      expect(inside(q, rect)).toBe(true);
      placed.push(q);
    }
  });

  it('a full rect keeps the best-effort push (no throw)', () => {
    const tiny = { x: 0, y: 0, w: 50, h: 50 };
    const q = nudgeApart({ x: 25, y: 25 }, [{ x: 25, y: 25 }], 90, tiny);
    expect(inside(q, tiny)).toBe(true);
  });

  it('intersectRect', () => {
    expect(intersectRect({ x: 0, y: 0, w: 100, h: 100 }, { x: 50, y: 20, w: 100, h: 20 })).toEqual({ x: 50, y: 20, w: 50, h: 20 });
  });
});

describe('DragController', () => {
  it('Lift: the first finger lifts in the same pointerdown, then follows the finger (grab offset kept)', () => {
    const { scene, cb, item, guard } = world();
    const p = press(310, 520);
    scene.down(p);
    expect(cb.onLift).toHaveBeenCalledExactlyOnceWith({ x: 300, y: 500 });
    expect(guard.isDragging()).toBe(true);
    expect(item.isDragging()).toBe(true);
    scene.move(p, 410, 420);
    expect(cb.onMove).toHaveBeenLastCalledWith({ x: 400, y: 400 });
    scene.up(p);
    expect(cb.onDrop).toHaveBeenCalledExactlyOnceWith({ x: 400, y: 400 });
    expect(item.isDragging()).toBe(false);
  });

  it('after a drop the item is lifted where it was dropped, not at its old spot (Story 1.8 review)', () => {
    const { scene, cb, item } = world();
    const p = press(300, 500);
    scene.down(p);
    scene.move(p, 600, 200);
    scene.up(p);
    expect(item.circle()).toMatchObject({ x: 600, y: 200 });
    scene.tap(300, 500);
    expect(cb.onLift).toHaveBeenCalledTimes(1);
    scene.tap(600, 200);
    expect(cb.onLift).toHaveBeenCalledTimes(2);
    expect(cb.onLift).toHaveBeenLastCalledWith({ x: 600, y: 200 });
  });

  it('the move is clamped by the drag area', () => {
    const { scene, cb } = world({ bounds: { x: 24, y: 32, w: 976, h: 696 }, exclusions: [] });
    const p = press(300, 500);
    scene.down(p);
    scene.move(p, 5, 400);
    expect(cb.onMove).toHaveBeenLastCalledWith({ x: 69, y: 400 });
  });

  it('Second finger (incl. Home) during a drag is ignored; the drag continues', () => {
    const { scene, hud, cb, guard } = world();
    const home = vi.fn();
    createTapTarget(hud, { circle: { x: 64, y: 84, r: 68 }, onPress: home });
    const p = press(300, 500, 1);
    scene.down(p);
    expect(guard.press(press(64, 84, 2))).toBe('ignored');
    expect(home).not.toHaveBeenCalled();
    scene.move(p, 350, 500);
    scene.up(p);
    expect(cb.onDrop).toHaveBeenCalledOnce();
  });

  it('a second finger moving is not forwarded', () => {
    const { scene, cb } = world();
    const p = press(300, 500, 1);
    scene.down(p);
    const other = press(600, 600, 2);
    scene.down(other);
    scene.move(other, 700, 700);
    expect(cb.onMove).not.toHaveBeenCalled();
  });

  it('Pause mid-drag: the release reaches the guard while the scene is paused → onCancel, no drop', () => {
    const { scene, hudScene, cb } = world();
    const p = press(300, 500);
    scene.down(p);
    scene.state.active = false;
    hudScene.up(p);
    expect(cb.onCancel).toHaveBeenCalledOnce();
    expect(cb.onDrop).not.toHaveBeenCalled();
  });

  it('lost pointerup: the guard self-heals on the next press and cancels the drag', () => {
    const { scene, cb, guard } = world();
    const p = press(300, 500);
    scene.down(p);
    p.isDown = false; // the up never arrives
    expect(guard.press(press(800, 600, 2))).toBe('primary');
    expect(cb.onCancel).toHaveBeenCalledOnce();
    expect(cb.onDrop).not.toHaveBeenCalled();
  });

  it('Not pickable: a press hits nothing; a running drag continues', () => {
    const { scene, cb, item, guard } = world();
    guard.setPickable(item, false);
    expect(guard.isPickable(item)).toBe(false);
    scene.tap(300, 500);
    expect(cb.onLift).not.toHaveBeenCalled();
    guard.setPickable(item, true);
    const p = press(300, 500, 3);
    scene.down(p);
    guard.setPickable(item, false);
    scene.move(p, 320, 500);
    scene.up(p);
    expect(cb.onDrop).toHaveBeenCalledOnce();
  });

  it('setCircle moves the hit area; destroy unregisters', () => {
    const { scene, cb, item } = world();
    item.setCircle({ x: 700, y: 500, r: 70 });
    scene.tap(300, 500);
    expect(cb.onLift).not.toHaveBeenCalled();
    scene.tap(700, 500);
    expect(cb.onLift).toHaveBeenCalledOnce();
    item.destroy();
    scene.tap(700, 500);
    expect(cb.onLift).toHaveBeenCalledOnce();
  });

  it('onLiftChange (Story 1.9): true before onLift, false after onDrop / onCancel; unsubscribe works', () => {
    const { scene, cb, item } = world();
    const order: string[] = [];
    cb.onLift.mockImplementation(() => order.push('lift'));
    cb.onDrop.mockImplementation(() => order.push('drop'));
    cb.onCancel.mockImplementation(() => order.push('cancel'));
    const off = item.onLiftChange((on) => order.push(on ? 'lifted' : 'settled'));
    const p = press(300, 500);
    scene.down(p);
    scene.up(p);
    expect(order).toEqual(['lifted', 'lift', 'drop', 'settled']);
    order.length = 0;
    const q = press(300, 500, 2);
    scene.down(q);
    q.isDown = false;
    scene.tap(800, 600, 3); // self-heal → cancel
    expect(order).toEqual(['lifted', 'lift', 'cancel', 'settled']);
    off();
    order.length = 0;
    scene.tap(300, 500);
    expect(order).toEqual(['lift', 'drop']);
  });

  it('a router destroyed mid-drag never delivers the drop', () => {
    const { scene, router, cb } = world();
    const p = press(300, 500);
    scene.down(p);
    router.destroy();
    p.isDown = false;
    scene.up(p);
    expect(cb.onDrop).not.toHaveBeenCalled();
  });
});

describe('DragController — Story 5.1 tap-then-tap', () => {
  const BOUNDS = { x: 24, y: 32, w: 976, h: 696 };
  function tapWorld(withFly = false) {
    const guard = new InputGuard((p) => locate(p, undefined, VIEW));
    const scene = fakeScene();
    const router = createTapRouter(scene, { guard });
    const hudScene = fakeScene();
    const hud = createTapRouter(hudScene, { guard, layer: 'hud' });
    const area: DragArea = { bounds: BOUNDS, exclusions: [] };
    const make = (x: number, y: number) => {
      const cb = { onLift: vi.fn(), onMove: vi.fn(), onDrop: vi.fn(), onCancel: vi.fn(), onSelect: vi.fn(), onDeselect: vi.fn() };
      const flights: { to: { x: number; y: number }; done: () => void }[] = [];
      const fly = vi.fn((to: { x: number; y: number }, done: () => void) => {
        flights.push({ to, done });
      });
      const item = createDraggable(router, { circle: { x, y, r: 70 }, itemRadius: 45, guard, area: () => area, ...cb, ...(withFly ? { fly } : {}) });
      return { cb, item, fly, flights };
    };
    return { guard, scene, router, hud, hudScene, make };
  }

  it('Tap-select: press+release below the threshold → onSelect(centre); lifted, no onDrop', () => {
    const w = tapWorld();
    const a = w.make(300, 500);
    const lifts: boolean[] = [];
    a.item.onLiftChange((l) => lifts.push(l));
    const p = press(305, 505);
    w.scene.down(p);
    w.scene.move(p, 305 + Tokens.ui.tapMoveMaxPx - 1, 505);
    w.scene.up(p);
    expect(a.cb.onLift).toHaveBeenCalledOnce();
    expect(a.cb.onSelect).toHaveBeenCalledExactlyOnceWith({ x: 300 + Tokens.ui.tapMoveMaxPx - 1, y: 500 });
    expect(a.cb.onDrop).not.toHaveBeenCalled();
    expect(a.item.isSelected()).toBe(true);
    expect(a.item.isDragging()).toBe(false);
    expect(lifts).toEqual([true]);
  });

  it('a press that moved the threshold or more is a drag (drop, no select), even if it ends back at the start', () => {
    const w = tapWorld();
    const a = w.make(300, 500);
    const p = press(300, 500);
    w.scene.down(p);
    w.scene.move(p, 300 + Tokens.ui.tapMoveMaxPx, 500);
    w.scene.move(p, 300, 500);
    w.scene.up(p);
    expect(a.cb.onSelect).not.toHaveBeenCalled();
    expect(a.cb.onDrop).toHaveBeenCalledExactlyOnceWith({ x: 300, y: 500 });
  });

  it('Tap-target: selected, a tap elsewhere → fly(to) then onDrop(to); the selection ends', () => {
    const w = tapWorld(true);
    const a = w.make(300, 500);
    w.scene.tap(300, 500);
    const lifts: boolean[] = [];
    a.item.onLiftChange((l) => lifts.push(l));
    w.scene.tap(700, 300);
    expect(a.cb.onDeselect).toHaveBeenCalledOnce();
    expect(a.fly).toHaveBeenCalledOnce();
    expect(a.flights[0]!.to).toEqual({ x: 700, y: 300 });
    expect(a.cb.onDrop).not.toHaveBeenCalled();
    // While flying the item cannot be pressed and the catcher is gone.
    w.scene.tap(700, 300);
    expect(a.cb.onLift).toHaveBeenCalledOnce();
    a.flights[0]!.done();
    expect(a.cb.onDrop).toHaveBeenCalledExactlyOnceWith({ x: 700, y: 300 });
    expect(a.item.isSelected()).toBe(false);
    expect(a.item.circle()).toMatchObject({ x: 700, y: 300 });
    expect(lifts).toEqual([false]);
    // No catcher any more: a further tap on empty ground does nothing.
    w.scene.tap(200, 200);
    expect(a.fly).toHaveBeenCalledOnce();
  });

  it('without fly: the item jumps (onMove) and drops; the target is clamped into the drag area', () => {
    const w = tapWorld();
    const a = w.make(300, 500);
    w.scene.tap(300, 500);
    w.scene.tap(30, 400);
    expect(a.cb.onMove).toHaveBeenLastCalledWith({ x: 24 + 45, y: 400 });
    expect(a.cb.onDrop).toHaveBeenCalledExactlyOnceWith({ x: 24 + 45, y: 400 });
  });

  it('a tap outside the drag bounds does not reach the catcher', () => {
    const guard = new InputGuard((p) => locate(p, undefined, VIEW));
    const scene = fakeScene();
    const router = createTapRouter(scene, { guard });
    const cb = { onLift: vi.fn(), onMove: vi.fn(), onDrop: vi.fn(), onCancel: vi.fn(), onSelect: vi.fn() };
    const area = { bounds: { x: 200, y: 400, w: 400, h: 200 }, exclusions: [] };
    createDraggable(router, { circle: { x: 300, y: 500, r: 70 }, guard, area: () => area, ...cb });
    scene.tap(300, 500);
    scene.tap(800, 200);
    expect(cb.onDrop).not.toHaveBeenCalled();
  });

  it('Tap item again: deselect, resolved like a drop at its current centre', () => {
    const w = tapWorld();
    const a = w.make(300, 500);
    w.scene.tap(300, 500);
    w.scene.tap(320, 510);
    expect(a.cb.onLift).toHaveBeenCalledOnce();
    expect(a.cb.onDeselect).toHaveBeenCalledOnce();
    expect(a.cb.onDrop).toHaveBeenCalledExactlyOnceWith({ x: 300, y: 500 });
    expect(a.item.isSelected()).toBe(false);
  });

  it('a drag from the selected item is a normal drag (deselected, dropped where released)', () => {
    const w = tapWorld();
    const a = w.make(300, 500);
    w.scene.tap(300, 500);
    const p = press(300, 500);
    w.scene.down(p);
    w.scene.move(p, 500, 400);
    expect(a.cb.onDeselect).toHaveBeenCalledOnce();
    w.scene.up(p);
    expect(a.cb.onDrop).toHaveBeenCalledExactlyOnceWith({ x: 500, y: 400 });
    expect(a.cb.onSelect).toHaveBeenCalledOnce();
  });

  it('Switch: A selected, tap B → A deselects and settles first, then B is selected', () => {
    const w = tapWorld();
    const a = w.make(300, 500);
    const b = w.make(600, 500);
    const order: string[] = [];
    a.cb.onDeselect.mockImplementation(() => order.push('a-deselect'));
    a.cb.onDrop.mockImplementation(() => order.push('a-drop'));
    b.cb.onLift.mockImplementation(() => order.push('b-lift'));
    b.cb.onSelect.mockImplementation(() => order.push('b-select'));
    w.scene.tap(300, 500);
    w.scene.tap(600, 500);
    expect(order).toEqual(['a-deselect', 'a-drop', 'b-lift', 'b-select']);
    expect(a.cb.onDrop).toHaveBeenCalledWith({ x: 300, y: 500 });
    expect(a.item.isSelected()).toBe(false);
    expect(b.item.isSelected()).toBe(true);
    // Only B's catcher is live: a tap on the ground flies B, not A.
    w.scene.tap(500, 250);
    expect(b.cb.onDrop).toHaveBeenCalledExactlyOnceWith({ x: 500, y: 250 });
    expect(a.cb.onDrop).toHaveBeenCalledOnce();
  });

  it('real targets keep priority over the catcher; Hud taps are unaffected', () => {
    const w = tapWorld();
    const a = w.make(300, 500);
    const other = vi.fn();
    const home = vi.fn();
    createTapTarget(w.router, { circle: { x: 800, y: 500, r: 60 }, onPress: other });
    createTapTarget(w.hud, { circle: { x: 64, y: 84, r: 68 }, onPress: home });
    w.scene.tap(300, 500);
    w.scene.tap(800, 500);
    expect(other).toHaveBeenCalledOnce();
    w.hudScene.tap(64, 84);
    expect(home).toHaveBeenCalledOnce();
    expect(a.cb.onDrop).not.toHaveBeenCalled();
    expect(a.item.isSelected()).toBe(true);
  });

  it('a second finger never selects while the first is down', () => {
    const w = tapWorld();
    const a = w.make(300, 500);
    const b = w.make(600, 500);
    const p = press(300, 500, 1);
    w.scene.down(p);
    const q = press(600, 500, 2);
    w.scene.down(q);
    w.scene.up(q);
    w.scene.up(p);
    expect(b.cb.onLift).not.toHaveBeenCalled();
    expect(b.cb.onSelect).not.toHaveBeenCalled();
    expect(a.cb.onSelect).toHaveBeenCalledOnce();
  });

  it('Mid-drag lift: a drag released anywhere is a drop there (the round decides; never a select)', () => {
    const w = tapWorld();
    const a = w.make(300, 500);
    const p = press(300, 500);
    w.scene.down(p);
    w.scene.move(p, 450, 200);
    w.scene.up(p);
    expect(a.cb.onDrop).toHaveBeenCalledExactlyOnceWith({ x: 450, y: 200 });
    expect(a.cb.onSelect).not.toHaveBeenCalled();
  });

  it('Cancel: the scene pauses while selected → onDeselect, onCancel; the selection is cleared', () => {
    const w = tapWorld();
    const a = w.make(300, 500);
    const lifts: boolean[] = [];
    a.item.onLiftChange((l) => lifts.push(l));
    w.scene.tap(300, 500);
    w.scene.pause();
    expect(a.cb.onDeselect).toHaveBeenCalledOnce();
    expect(a.cb.onCancel).toHaveBeenCalledOnce();
    expect(a.item.isSelected()).toBe(false);
    expect(lifts).toEqual([true, false]);
    w.scene.state.active = true;
    w.scene.tap(700, 300);
    expect(a.cb.onDrop).not.toHaveBeenCalled();
  });

  it('Cancel: a lost pointer while pressing the selected item → onCancel, selection cleared', () => {
    const w = tapWorld();
    const a = w.make(300, 500);
    w.scene.tap(300, 500);
    const p = press(300, 500);
    w.scene.down(p);
    p.isDown = false;
    w.guard.press(press(800, 600, 2));
    expect(a.cb.onCancel).toHaveBeenCalledOnce();
    expect(a.item.isSelected()).toBe(false);
  });

  it('destroy while selected removes the catcher; no callback fires', () => {
    const w = tapWorld();
    const a = w.make(300, 500);
    w.scene.tap(300, 500);
    a.item.destroy();
    w.scene.tap(700, 300);
    expect(a.cb.onDrop).not.toHaveBeenCalled();
    expect(a.cb.onDeselect).not.toHaveBeenCalled();
  });

  it('a caller without onSelect keeps the old behaviour: a tap is a drop', () => {
    const { scene, cb } = world();
    scene.tap(300, 500);
    expect(cb.onDrop).toHaveBeenCalledExactlyOnceWith({ x: 300, y: 500 });
  });
});
