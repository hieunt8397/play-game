// Story 7.3: the band's scene-scoped multi-touch (InputGuard `extra-multi`, createTapRouter `multiTouch`), and proof
// that every other router keeps first-finger-wins.
import { describe, expect, it, vi } from 'vitest';
import { fakeScene, press } from './fakes';
import { InputGuard, type Layer } from './guard';
import { locate, NO_INSETS } from './space';
import { createTapRouter, ensurePointers } from './tap-router';
import { createTapTarget } from './tap-target';

const VIEW = { w: 1024, h: 768, rotated: false, insets: NO_INSETS };
const DRUM = { x: 200, y: 500, r: 70 };
const BELL = { x: 500, y: 300, r: 70 };
const FROG = { x: 800, y: 500, r: 70 };
const SPEAKER = { x: 960, y: 192, r: 68 };

function world() {
  const guard = new InputGuard((p) => locate(p, undefined, VIEW));
  const make = (layer: Layer, multi = false) => {
    const scene = fakeScene();
    const router = createTapRouter(scene, { guard, layer, ...(multi ? { multiTouch: { pointers: 5 } } : {}) });
    const any = vi.fn();
    router.onAnyTap = any;
    return { scene, router, any };
  };
  const targets = (router: ReturnType<typeof make>['router']) => {
    const drum = { onPress: vi.fn(), onRelease: vi.fn() };
    const bell = { onPress: vi.fn(), onRelease: vi.fn() };
    const frog = { onPress: vi.fn(), onRelease: vi.fn() };
    createTapTarget(router, { circle: DRUM, ...drum });
    createTapTarget(router, { circle: BELL, ...bell });
    createTapTarget(router, { circle: FROG, ...frog });
    return { drum, bell, frog };
  };
  return { guard, make, targets };
}

describe('multi-touch scene router (Story 7.3)', () => {
  it('two fingers on two instruments both play; a third finger works too', () => {
    const { guard, make, targets } = world();
    const band = make('scene', true);
    const t = targets(band.router);
    const a = press(DRUM.x, DRUM.y, 1);
    const b = press(BELL.x, BELL.y, 2);
    const c = press(FROG.x, FROG.y, 3);
    expect(guard.press(a)).toBe('primary');
    expect(guard.press(b)).toBe('extra-multi');
    expect(guard.press(c)).toBe('extra-multi');
    expect(t.drum.onPress).toHaveBeenCalledTimes(1);
    expect(t.bell.onPress).toHaveBeenCalledTimes(1);
    expect(t.frog.onPress).toHaveBeenCalledTimes(1);
    // Only the primary runs anyTap; an extra finger's release does nothing; the primary's release still fires.
    expect(band.any).toHaveBeenCalledTimes(1);
    b.isDown = false;
    guard.release(b);
    expect(t.bell.onRelease).not.toHaveBeenCalled();
    expect(guard.isPrimary(a)).toBe(true);
    a.isDown = false;
    guard.release(a);
    expect(t.drum.onRelease).toHaveBeenCalledTimes(1);
  });

  it('the same press forwarded twice is decided once (idempotent per press key)', () => {
    const { guard, make, targets } = world();
    const band = make('scene', true);
    const t = targets(band.router);
    band.scene.down(press(DRUM.x, DRUM.y, 1));
    const b = press(BELL.x, BELL.y, 2);
    band.scene.down(b);
    band.scene.down(b);
    expect(t.bell.onPress).toHaveBeenCalledTimes(1);
    expect(guard.press(b)).toBe('extra-multi');
  });

  it('a primary on the background of the band scene still lets other fingers play', () => {
    const { guard, make, targets } = world();
    const band = make('scene', true);
    const t = targets(band.router);
    expect(guard.press(press(500, 650, 1))).toBe('primary');
    expect(guard.press(press(FROG.x, FROG.y, 2))).toBe('extra-multi');
    expect(t.frog.onPress).toHaveBeenCalledTimes(1);
  });

  it('an extra finger on the background of the band scene is ignored', () => {
    const { guard, make, targets } = world();
    const band = make('scene', true);
    targets(band.router);
    guard.press(press(DRUM.x, DRUM.y, 1));
    expect(guard.press(press(500, 650, 2))).toBe('ignored');
    expect(band.any).toHaveBeenCalledTimes(1);
  });

  it('the Hud keeps its extra-finger rule in the band; a Hud primary blocks extra fingers on instruments', () => {
    const { guard, make, targets } = world();
    const band = make('scene', true);
    const hud = make('hud');
    const speaker = vi.fn();
    createTapTarget(hud.router, { circle: SPEAKER, onPress: speaker });
    const t = targets(band.router);
    const a = press(DRUM.x, DRUM.y, 1);
    guard.press(a);
    expect(guard.press(press(SPEAKER.x, SPEAKER.y, 2))).toBe('extra-hud');
    expect(speaker).toHaveBeenCalledTimes(1);
    a.isDown = false;
    guard.release(a);
    const h = press(SPEAKER.x, SPEAKER.y, 3);
    expect(guard.press(h)).toBe('primary');
    expect(guard.press(press(BELL.x, BELL.y, 4))).toBe('ignored');
    expect(t.bell.onPress).not.toHaveBeenCalled();
  });

  it('a dragging primary blocks extra fingers even in the band', () => {
    const { guard, make, targets } = world();
    const band = make('scene', true);
    const t = targets(band.router);
    const a = press(DRUM.x, DRUM.y, 1);
    guard.press(a);
    guard.setDragging(a, true);
    expect(guard.press(press(BELL.x, BELL.y, 2))).toBe('ignored');
    expect(t.bell.onPress).not.toHaveBeenCalled();
  });

  it('a press owned by another scene router blocks the band (no leak across scenes)', () => {
    const { guard, make, targets } = world();
    const band = make('scene', true);
    const t = targets(band.router);
    const other = make('scene');
    const onOther = vi.fn();
    createTapTarget(other.router, { circle: { x: 500, y: 650, r: 60 }, onPress: onOther });
    // The other scene's target is pressed first: it is the primary; the band's targets ignore extra fingers.
    expect(guard.press(press(500, 650, 1))).toBe('primary');
    expect(onOther).toHaveBeenCalledTimes(1);
    expect(guard.press(press(DRUM.x, DRUM.y, 2))).toBe('ignored');
    expect(t.drum.onPress).not.toHaveBeenCalled();
  });

  it('multiTouch on a hud-layer router changes nothing', () => {
    const { guard, make } = world();
    const scene = make('scene');
    const hud = make('hud', true);
    const onScene = vi.fn();
    const onHudA = vi.fn();
    createTapTarget(scene.router, { circle: DRUM, onPress: onScene });
    createTapTarget(hud.router, { circle: BELL, onPress: onHudA });
    guard.press(press(DRUM.x, DRUM.y, 1));
    // Still the plain Hud rule (extra-hud), never extra-multi.
    expect(guard.press(press(BELL.x, BELL.y, 2))).toBe('extra-hud');
  });
});

describe('first-finger-wins is unchanged for every other scene (Story 7.3)', () => {
  it('a default scene router: the second finger on another target is ignored', () => {
    const { guard, make, targets } = world();
    const game = make('scene');
    const t = targets(game.router);
    expect(guard.press(press(DRUM.x, DRUM.y, 1))).toBe('primary');
    expect(guard.press(press(BELL.x, BELL.y, 2))).toBe('ignored');
    expect(guard.press(press(FROG.x, FROG.y, 3))).toBe('ignored');
    expect(t.bell.onPress).not.toHaveBeenCalled();
    expect(t.frog.onPress).not.toHaveBeenCalled();
  });

  it('after the band scene is gone, the next game is back to first-finger-wins', () => {
    const { guard, make, targets } = world();
    const band = make('scene', true);
    targets(band.router);
    band.router.destroy();
    const game = make('scene');
    const t = targets(game.router);
    guard.press(press(DRUM.x, DRUM.y, 1));
    expect(guard.press(press(BELL.x, BELL.y, 2))).toBe('ignored');
    expect(t.bell.onPress).not.toHaveBeenCalled();
  });

  it('a paused band scene (inactive) takes no extra fingers', () => {
    const { guard, make, targets } = world();
    const band = make('scene', true);
    const t = targets(band.router);
    const game = make('scene');
    const onGame = vi.fn();
    createTapTarget(game.router, { circle: { x: 500, y: 650, r: 60 }, onPress: onGame });
    band.scene.state.active = false;
    guard.press(press(500, 650, 1));
    expect(guard.press(press(DRUM.x, DRUM.y, 2))).toBe('ignored');
    expect(t.drum.onPress).not.toHaveBeenCalled();
  });
});

describe('ensurePointers (Story 7.3: Phaser input.addPointer)', () => {
  const input = (total: number) => {
    const manager = { pointersTotal: total };
    return {
      on: vi.fn(),
      off: vi.fn(),
      manager,
      addPointer: vi.fn((n: number) => {
        manager.pointersTotal += n;
      }),
    };
  };

  it('adds the missing touch pointers once; no-op when enough or without the API', () => {
    const i = input(3);
    ensurePointers(i, 5);
    expect(i.addPointer).toHaveBeenCalledWith(2);
    ensurePointers(i, 5);
    expect(i.addPointer).toHaveBeenCalledTimes(1);
    const many = input(6);
    ensurePointers(many, 5);
    expect(many.addPointer).not.toHaveBeenCalled();
    expect(() => ensurePointers({ on: vi.fn(), off: vi.fn() }, 5)).not.toThrow();
  });

  it('only a multiTouch router asks Phaser for more pointers', () => {
    const plain = fakeScene();
    const pi = input(3);
    createTapRouter({ ...plain, input: pi }, { guard: new InputGuard() });
    expect(pi.addPointer).not.toHaveBeenCalled();
    const multi = fakeScene();
    const mi = input(3);
    createTapRouter({ ...multi, input: mi }, { guard: new InputGuard(), multiTouch: { pointers: 5 } });
    expect(mi.addPointer).toHaveBeenCalledWith(2);
  });
});
