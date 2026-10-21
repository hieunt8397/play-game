// Story 1.6: InputGuard (I/O matrix guard rows) with fake scenes and pointers through real routers.
import { describe, expect, it, vi } from 'vitest';
import { fakeScene, press } from './fakes';
import { InputGuard, type Layer } from './guard';
import { locate, NO_INSETS } from './space';
import { createTapRouter } from './tap-router';
import { createTapTarget } from './tap-target';

const VIEW = { w: 1024, h: 768, rotated: false, insets: NO_INSETS };

function world() {
  const guard = new InputGuard((p) => locate(p, undefined, VIEW));
  const make = (layer: Layer) => {
    const scene = fakeScene();
    const router = createTapRouter(scene, { guard, layer });
    const any = vi.fn();
    router.onAnyTap = any;
    return { scene, router, any };
  };
  return { guard, make };
}

const STATION = { x: 400, y: 400, r: 60 };
const SPEAKER = { x: 960, y: 192, r: 68 };

describe('InputGuard', () => {
  it('dead press: no target, no onAnyTap, and the next finger can be primary', () => {
    const { guard, make } = world();
    const map = make('scene');
    const onPress = vi.fn();
    createTapTarget(map.router, { circle: { x: 30, y: 400, r: 60 }, onPress });
    const thumb = press(10, 400, 1);
    expect(guard.press(thumb)).toBe('dead');
    expect(onPress).not.toHaveBeenCalled();
    expect(map.any).not.toHaveBeenCalled();
    // The thumb stays down; a tap a moment later still works.
    expect(guard.press(press(60, 400, 2))).toBe('primary');
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(map.any).toHaveBeenCalledTimes(1);
  });

  it('first finger: primary, onAnyTap then onPress', () => {
    const { guard, make } = world();
    const map = make('scene');
    const order: string[] = [];
    map.any.mockImplementation(() => order.push('any'));
    createTapTarget(map.router, { circle: STATION, onPress: () => order.push('press') });
    expect(guard.press(press(400, 400))).toBe('primary');
    expect(order).toEqual(['any', 'press']);
  });

  it('extra finger on the scene is ignored; the primary keeps working and its release fires', () => {
    const { guard, make } = world();
    const map = make('scene');
    const onPress = vi.fn();
    const onRelease = vi.fn();
    const other = vi.fn();
    createTapTarget(map.router, { circle: STATION, onPress, onRelease });
    createTapTarget(map.router, { circle: { x: 700, y: 400, r: 60 }, onPress: other });
    const first = press(400, 400, 1);
    map.scene.down(first);
    const second = press(700, 400, 2);
    expect(guard.press(second)).toBe('ignored');
    expect(other).not.toHaveBeenCalled();
    expect(map.any).toHaveBeenCalledTimes(1);
    map.scene.up(second);
    expect(guard.isPrimary(first)).toBe(true);
    map.scene.up(first);
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(guard.isPrimary(first)).toBe(false);
  });

  it('extra finger on a hud target fires it without touching the primary', () => {
    const { guard, make } = world();
    const map = make('scene');
    const hud = make('hud');
    const speaker = vi.fn();
    createTapTarget(hud.router, { circle: SPEAKER, onPress: speaker });
    const first = press(400, 400, 1);
    map.scene.down(first);
    expect(guard.press(press(960, 192, 2))).toBe('extra-hud');
    expect(speaker).toHaveBeenCalledTimes(1);
    expect(map.any).toHaveBeenCalledTimes(1);
    expect(guard.isPrimary(first)).toBe(true);
  });

  it('extra finger on the hud while the primary drags is ignored', () => {
    const { guard, make } = world();
    make('scene');
    const hud = make('hud');
    const speaker = vi.fn();
    createTapTarget(hud.router, { circle: SPEAKER, onPress: speaker });
    const first = press(400, 400, 1);
    guard.press(first);
    const second = press(960, 192, 2);
    guard.setDragging(second, true); // not the primary: ignored
    expect(guard.isDragging()).toBe(false);
    guard.setDragging(first, true);
    expect(guard.isDragging()).toBe(true);
    expect(guard.press(second)).toBe('ignored');
    expect(speaker).not.toHaveBeenCalled();
    guard.release(first);
    expect(guard.isDragging()).toBe(false);
  });

  it('the same press forwarded by several scenes is decided once', () => {
    const { guard, make } = world();
    const map = make('scene');
    const hud = make('hud');
    const onPress = vi.fn();
    createTapTarget(map.router, { circle: STATION, onPress });
    const p = press(400, 400);
    hud.scene.down(p);
    map.scene.down(p);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(map.any).toHaveBeenCalledTimes(1);
    expect(hud.any).toHaveBeenCalledTimes(1);
    expect(guard.press(p)).toBe('primary');
  });

  it('a lost up self-heals: the primary is released once its pointer is no longer down', () => {
    const { guard, make } = world();
    const map = make('scene');
    const onPress = vi.fn();
    createTapTarget(map.router, { circle: STATION, onPress });
    const first = press(400, 400, 1);
    guard.press(first);
    first.isDown = false; // the up never reached us
    expect(guard.press(press(400, 400, 2))).toBe('primary');
    expect(onPress).toHaveBeenCalledTimes(2);
    // The same slot reused with a new downTime also ends the old primary.
    const again = press(400, 400, 3);
    guard.press(again);
    again.downTime += 1000;
    expect(guard.isPrimary(again)).toBe(false);
  });

  it('overlapping layers: only the highest layer target fires', () => {
    const { guard, make } = world();
    const map = make('scene');
    const hud = make('hud');
    const mapHit = vi.fn();
    const hudHit = vi.fn();
    createTapTarget(map.router, { circle: SPEAKER, onPress: mapHit });
    createTapTarget(hud.router, { circle: SPEAKER, onPress: hudHit });
    map.scene.down(press(960, 192));
    expect(hudHit).toHaveBeenCalledTimes(1);
    expect(mapHit).not.toHaveBeenCalled();
    void guard;
  });

  it('overlay beats hud and scene; inactive routers are skipped', () => {
    const { make } = world();
    const map = make('scene');
    const overlay = make('overlay');
    const mapHit = vi.fn();
    const overlayHit = vi.fn();
    createTapTarget(map.router, { circle: STATION, onPress: mapHit });
    createTapTarget(overlay.router, { circle: STATION, onPress: overlayHit });
    map.scene.tap(400, 400);
    expect(overlayHit).toHaveBeenCalledTimes(1);
    expect(mapHit).not.toHaveBeenCalled();
    overlay.scene.state.active = false; // asleep
    map.scene.tap(400, 400);
    expect(mapHit).toHaveBeenCalledTimes(1);
    expect(overlay.any).toHaveBeenCalledTimes(1);
  });

  it('a held target whose router is destroyed gets no onRelease', () => {
    const { guard, make } = world();
    const map = make('scene');
    const onPress = vi.fn();
    const onRelease = vi.fn();
    createTapTarget(map.router, { circle: STATION, onPress, onRelease });
    const p = press(400, 400);
    map.scene.down(p);
    expect(onPress).toHaveBeenCalledTimes(1);
    map.router.destroy();
    p.isDown = false;
    guard.release(p);
    expect(onRelease).not.toHaveBeenCalled();
  });

  it('a primary that misses every target still blocks other fingers until released', () => {
    const { guard, make } = world();
    const map = make('scene');
    const onPress = vi.fn();
    createTapTarget(map.router, { circle: STATION, onPress });
    const first = press(800, 600, 1);
    map.scene.down(first);
    expect(guard.press(press(400, 400, 2))).toBe('ignored');
    map.scene.up(first);
    expect(guard.press(press(400, 400, 2))).toBe('primary');
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
