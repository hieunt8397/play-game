// Story 1.5/1.6: point-in-polygon, topmost-wins tap routing, hotspot enable/destroy, TapTarget.
import { describe, expect, it, vi } from 'vitest';
import { HotspotPolygon } from './hotspot-polygon';
import { boundingBox, boxPolygon, padBox, pointInPolygon } from './polygon';
import { fakeScene, press } from './fakes';
import { InputGuard } from './guard';
import { createTapRouter } from './tap-router';
import { createTapTarget, inCircle } from './tap-target';
import { LAYOUTS } from '../../content/layouts';
import { Tokens } from '../tokens';

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];
// Concave "U": the notch (4..6, 0..6) is outside.
const u = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 6 },
  { x: 6, y: 6 },
  { x: 6, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe('pointInPolygon', () => {
  it('inside and outside a square', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 11, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: -0.01, y: 5 }, square)).toBe(false);
  });

  it('edges and vertices count as inside', () => {
    expect(pointInPolygon({ x: 0, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 10, y: 10 }, square)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 0 }, square)).toBe(true);
  });

  it('concave: the notch is outside, the arms are inside', () => {
    expect(pointInPolygon({ x: 5, y: 3 }, u)).toBe(false);
    expect(pointInPolygon({ x: 2, y: 3 }, u)).toBe(true);
    expect(pointInPolygon({ x: 8, y: 3 }, u)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 8 }, u)).toBe(true);
    // A ray through the notch's vertex row.
    expect(pointInPolygon({ x: 2, y: 6 }, u)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 6 }, u)).toBe(true);
  });

  it('degenerate polygons contain nothing', () => {
    expect(pointInPolygon({ x: 0, y: 0 }, square.slice(0, 2))).toBe(false);
  });

  it('box helpers', () => {
    expect(boundingBox(u)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(boxPolygon(padBox({ x: 10, y: 20, width: 30, height: 40 }, 24))).toEqual([
      { x: -14, y: -4 },
      { x: 64, y: -4 },
      { x: 64, y: 84 },
      { x: -14, y: 84 },
    ]);
  });
});

describe('createTapRouter + HotspotPolygon', () => {
  const setup = () => {
    const guard = new InputGuard();
    const scene = fakeScene();
    const router = createTapRouter(scene, { guard });
    return { guard, scene, router };
  };

  it('registers down/up/upoutside/move listeners and the guard; removes all on shutdown', () => {
    const { scene, router } = setup();
    expect(scene.listenerCount()).toBe(4);
    expect(router.layer).toBe('scene');
    const hit = vi.fn();
    new HotspotPolygon(router, square, hit);
    scene.shutdown();
    expect(scene.listenerCount()).toBe(0);
    scene.tap(5, 5);
    expect(hit).not.toHaveBeenCalled();
  });

  it('the topmost (last registered) target wins an overlap', () => {
    const { scene, router } = setup();
    const a = vi.fn();
    const b = vi.fn();
    new HotspotPolygon(router, square, a);
    new HotspotPolygon(router, square.map((p) => ({ x: p.x + 5, y: p.y })), b);
    scene.tap(7, 5);
    expect(b).toHaveBeenCalledWith({ x: 7, y: 5 });
    expect(a).not.toHaveBeenCalled();
    scene.tap(2, 5);
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('onAnyTap runs first on every tap, hit or miss; a miss does nothing else', () => {
    const { scene, router } = setup();
    const order: string[] = [];
    router.onAnyTap = () => order.push('any');
    new HotspotPolygon(router, square, () => order.push('hit'));
    scene.tap(5, 5);
    scene.tap(50, 50);
    expect(order).toEqual(['any', 'hit', 'any']);
  });

  it('a disabled hotspot is skipped (the one below gets the tap); destroy removes it', () => {
    const { scene, router } = setup();
    const below = vi.fn();
    const top = vi.fn();
    new HotspotPolygon(router, square, below);
    const h = new HotspotPolygon(router, square, top);
    h.setEnabled(false);
    scene.tap(5, 5);
    expect(below).toHaveBeenCalledTimes(1);
    h.setEnabled(true);
    scene.tap(5, 5);
    expect(top).toHaveBeenCalledTimes(1);
    h.destroy();
    h.setEnabled(true);
    scene.tap(5, 5);
    expect(top).toHaveBeenCalledTimes(1);
    expect(below).toHaveBeenCalledTimes(2);
  });

  it('a hotspot copies its points (later edits of the source do not move it)', () => {
    const { scene, router } = setup();
    const pts = square.map((p) => ({ ...p }));
    const hit = vi.fn();
    new HotspotPolygon(router, pts, hit);
    pts[1]!.x = 100;
    pts[2]!.x = 100;
    scene.tap(50, 5);
    expect(hit).not.toHaveBeenCalled();
  });

  it('an inactive (paused/sleeping) scene gets nothing', () => {
    const { scene, router } = setup();
    const hit = vi.fn();
    const any = vi.fn();
    router.onAnyTap = any;
    new HotspotPolygon(router, square, hit);
    scene.state.active = false;
    scene.tap(5, 5);
    expect(hit).not.toHaveBeenCalled();
    expect(any).not.toHaveBeenCalled();
  });
});

describe('createTapTarget', () => {
  it('circle hit (edge inclusive), onPress on down, onRelease on up over the target', () => {
    const guard = new InputGuard();
    const scene = fakeScene();
    const router = createTapRouter(scene, { guard });
    const onPress = vi.fn();
    const onRelease = vi.fn();
    const t = createTapTarget(router, { circle: { x: 100, y: 100, r: 10 }, onPress, onRelease });
    expect(inCircle({ x: 110, y: 100 }, { x: 100, y: 100, r: 10 })).toBe(true);
    const p = press(105, 100);
    scene.down(p);
    expect(onPress).toHaveBeenCalledWith({ x: 105, y: 100 });
    expect(onRelease).not.toHaveBeenCalled();
    scene.up(p);
    expect(onRelease).toHaveBeenCalledTimes(1);
    // Release away from the target: no onRelease.
    const q = press(100, 100);
    scene.down(q);
    q.x = 300;
    scene.up(q);
    expect(onPress).toHaveBeenCalledTimes(2);
    expect(onRelease).toHaveBeenCalledTimes(1);
    // setCircle moves it, setEnabled(false) and destroy silence it.
    t.setCircle({ x: 300, y: 300, r: 10 });
    scene.tap(100, 100);
    expect(onPress).toHaveBeenCalledTimes(2);
    scene.tap(300, 300);
    expect(onPress).toHaveBeenCalledTimes(3);
    t.setEnabled(false);
    scene.tap(300, 300);
    expect(onPress).toHaveBeenCalledTimes(3);
    t.setEnabled(true);
    t.destroy();
    t.setEnabled(true);
    scene.tap(300, 300);
    expect(onPress).toHaveBeenCalledTimes(3);
    expect(t.isEnabled()).toBe(false);
  });
});

describe('createTapTarget › excludes (Story 1.7)', () => {
  it('an excluded point falls through to the target below', () => {
    const guard = new InputGuard();
    const scene = fakeScene();
    const router = createTapRouter(scene, { guard });
    const below = vi.fn();
    new HotspotPolygon(router, [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }], below);
    const kart = vi.fn();
    createTapTarget(router, { circle: { x: 100, y: 100, r: 50 }, onPress: kart, excludes: (p) => p.y > 120 });
    scene.tap(100, 100);
    expect(kart).toHaveBeenCalledTimes(1);
    expect(below).not.toHaveBeenCalled();
    scene.tap(100, 140);
    expect(kart).toHaveBeenCalledTimes(1);
    expect(below).toHaveBeenCalledTimes(1);
  });
});

describe('tap router › z tiebreak (Story 2.2)', () => {
  const setup = () => {
    const guard = new InputGuard();
    const scene = fakeScene();
    return { scene, router: createTapRouter(scene, { guard }) };
  };

  it('a higher z wins over a later-registered target', () => {
    const { scene, router } = setup();
    const station = vi.fn();
    const decoration = vi.fn();
    new HotspotPolygon(router, square, station);
    new HotspotPolygon(router, square, decoration, { z: -1 });
    scene.tap(5, 5);
    expect(station).toHaveBeenCalledTimes(1);
    expect(decoration).not.toHaveBeenCalled();
  });

  it('a lower-z target still gets taps outside the higher one', () => {
    const { scene, router } = setup();
    const station = vi.fn();
    const decoration = vi.fn();
    new HotspotPolygon(router, square, station);
    new HotspotPolygon(router, square.map((p) => ({ x: p.x + 8, y: p.y })), decoration, { z: -1 });
    scene.tap(15, 5);
    expect(decoration).toHaveBeenCalledTimes(1);
    expect(station).not.toHaveBeenCalled();
  });

  it('at equal z the last registered wins; z 0 is the default', () => {
    const { scene, router } = setup();
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    new HotspotPolygon(router, square, a, { z: -1 });
    new HotspotPolygon(router, square, b, { z: -1 });
    scene.tap(5, 5);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    new HotspotPolygon(router, square, c, { z: 0 });
    scene.tap(5, 5);
    expect(c).toHaveBeenCalledTimes(1);
  });

  it('a disabled higher-z target is skipped', () => {
    const { scene, router } = setup();
    const low = vi.fn();
    new HotspotPolygon(router, square, low, { z: -1 });
    new HotspotPolygon(router, square, vi.fn(), { z: 3 }).setEnabled(false);
    scene.tap(5, 5);
    expect(low).toHaveBeenCalledTimes(1);
  });
});

describe('createTapRouter › toWorld (Story 2.3)', () => {
  /** Phaser's getWorldPoint for a camera centred on `c` at `zoom` (viewport = the design frame). */
  const zoomedOn = (c: { x: number; y: number }, zoom: number) => (p: { x: number; y: number }) => ({
    x: c.x + (p.x - Tokens.design.width / 2) / zoom,
    y: c.y + (p.y - Tokens.design.height / 2) / zoom,
  });

  it('default: the design point is hit-tested as is', () => {
    const scene = fakeScene();
    const router = createTapRouter(scene, { guard: new InputGuard() });
    const hit = vi.fn();
    new HotspotPolygon(router, square, hit);
    scene.tap(5, 5);
    expect(hit).toHaveBeenCalledWith({ x: 5, y: 5 });
  });

  it('a point is hit-tested (and delivered) after the transform', () => {
    const scene = fakeScene();
    const router = createTapRouter(scene, { guard: new InputGuard(), toWorld: (p) => ({ x: p.x - 100, y: p.y - 100 }) });
    const hit = vi.fn();
    const any = vi.fn();
    router.onAnyTap = any;
    new HotspotPolygon(router, square, hit);
    scene.tap(5, 5);
    expect(hit).not.toHaveBeenCalled();
    scene.tap(105, 105);
    expect(hit).toHaveBeenCalledWith({ x: 5, y: 5 });
    expect(any).toHaveBeenLastCalledWith({ x: 5, y: 5 });
  });

  it('zoom 1.8 on the ice-cream anchor: the screen centre hits the ice-cream station seen there', () => {
    const map = LAYOUTS.map;
    const anchor = map.anchors['ice-cream']!;
    const poly = map.hits['ice-cream']!;
    expect(pointInPolygon(anchor, poly)).toBe(true);
    const centre = { x: Tokens.design.width / 2, y: Tokens.design.height / 2 };
    // Without the transform the screen centre is not on the truck.
    expect(pointInPolygon(centre, poly)).toBe(false);
    const scene = fakeScene();
    const router = createTapRouter(scene, { guard: new InputGuard(), toWorld: zoomedOn(anchor, Tokens.ui.cameraZoomScale) });
    const hit = vi.fn();
    new HotspotPolygon(router, poly, hit);
    scene.tap(centre.x, centre.y);
    expect(hit).toHaveBeenCalledWith(anchor);
  });
});
