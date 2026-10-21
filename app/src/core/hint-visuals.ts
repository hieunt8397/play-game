// Hint visuals (Story 1.5; Story 1.9 adds follow, item bob, hand demo and dim). The `hint-ring`
// (DESIGN components.hint-ring): three ellipse strokes — white halo outside, white core, purple line
// on the core — pulsing .95 ↔ 1.05 over pulse.durationMs. One live ring app-wide: creating a new
// ring destroys the previous one.
// Story 1.9 (HintDirector's visuals port, `createHintVisuals`):
//   - ring(item): a ring around the item's bounds + ui.hintRingPad that follows it every frame, and
//     the item bob 1 ↔ ui.hintItemBobScale (paused while lifted, while another tween runs on the item
//     or during a hand demo; the captured scale is restored on every pause);
//   - hand(step): the 72 px hint hand (Graphics: white fill, hint-line outline, shadow ellipse) presses
//     on the item and moves along the path (trace), lifts and fades; Story 5.1: a drag demo taps the
//     item, travels lifted and taps the target centre (tap-then-tap). Only
//     the hand moves; reduced motion leaves its path unchanged (it is the instruction);
//   - dim(item, on): alpha → ui.hintDimAlpha over Timing.hintDimFadeMs, or back to 1.
import type { GameObjects, Scene, Tweens } from 'phaser';
import { resolvePath, type HintItem, type HintStep, type HintVisualsPort } from './hint-machine';
import type { Box, Point } from './input/polygon';
import { amplitude } from './reduced-motion';
import { Tokens } from './tokens';

export interface HintRing {
  destroy(): void;
  /** Moves the ring's centre (design px). */
  setCentre(x: number, y: number): void;
}

export interface HintRingOptions {
  /** prefers-reduced-motion: pulse amplitude × Tokens.ui.reducedMotionAmplitude. */
  readonly reduced?: boolean;
  readonly depth?: number | undefined;
}

let live: HintRing | undefined;

/** Ellipse radii of the ring around `box` (inscribed in the box; hit polygons are already padded). */
export function ringRadii(box: Box): { cx: number; cy: number; rx: number; ry: number } {
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2, rx: box.width / 2, ry: box.height / 2 };
}

/** The ring box of a game item: its bounds grown by `pad` on every side (Story 1.9). */
export function itemRingBox(bounds: Box, pad: number = Tokens.ui.hintRingPad): Box {
  return { x: bounds.x - pad, y: bounds.y - pad, width: bounds.width + 2 * pad, height: bounds.height + 2 * pad };
}

/** Draws the hint ring around `box` (design px) and starts its pulse. */
export function createHintRing(scene: Scene, box: Box, opts: HintRingOptions = {}): HintRing {
  live?.destroy();
  const spec = Tokens.components.hintRing;
  const { cx, cy, rx, ry } = ringRadii(box);
  const g: GameObjects.Graphics = scene.add.graphics({ x: cx, y: cy });
  if (opts.depth !== undefined) g.setDepth(opts.depth);

  const haloOffset = spec.core.width / 2 + spec.halo.width / 2;
  g.lineStyle(spec.halo.width, spec.halo.color.value, spec.halo.color.alpha);
  g.strokeEllipse(0, 0, 2 * (rx + haloOffset), 2 * (ry + haloOffset));
  g.lineStyle(spec.core.width, spec.core.color.value, spec.core.color.alpha);
  g.strokeEllipse(0, 0, 2 * rx, 2 * ry);
  g.lineStyle(spec.line.width, spec.line.color.value, spec.line.color.alpha);
  g.strokeEllipse(0, 0, 2 * rx, 2 * ry);

  const reduced = opts.reduced ?? false;
  const from = amplitude(spec.pulse.from, reduced);
  const to = amplitude(spec.pulse.to, reduced);
  g.setScale(from);
  const tween: Tweens.Tween = scene.tweens.add({
    targets: g,
    scale: to,
    duration: spec.pulse.durationMs,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });

  let destroyed = false;
  const ring: HintRing = {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      tween.stop();
      g.destroy();
      if (live === ring) live = undefined;
    },
    setCentre(x, y) {
      if (!destroyed) g.setPosition(x, y);
    },
  };
  live = ring;
  scene.events.once('shutdown', () => ring.destroy());
  return ring;
}

// --- Story 1.9: pure geometry -------------------------------------------------------------------------

/** The slice of a Phaser game object the hint visuals use. */
export interface ItemObject {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  /** Falsy once the object is destroyed. */
  readonly scene?: unknown;
  setScale(x: number, y?: number): unknown;
  setAlpha(a: number): unknown;
  getBounds?(): Box;
  /** Phaser size, origin and frame: a trimmed full-frame sprite's drawn part is its trim rect. */
  readonly width?: number;
  readonly height?: number;
  readonly originX?: number;
  readonly originY?: number;
  readonly frame?: { readonly data?: { readonly trim?: boolean; readonly spriteSourceSize?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number } } };
}

function isItemObject(o: unknown): o is ItemObject {
  return typeof o === 'object' && o !== null && typeof (o as ItemObject).setScale === 'function' && typeof (o as ItemObject).x === 'number';
}

function alive(o: ItemObject): boolean {
  return Boolean(o.scene);
}

/**
 * The drawn bounds of an item: the trim rect of a trimmed (full-frame) sprite, else `getBounds`, else
 * its position as a point. Rotation is ignored (game items are upright).
 */
export function itemBounds(o: ItemObject): Box {
  const ss = o.frame?.data?.trim ? o.frame.data.spriteSourceSize : undefined;
  if (ss && o.width !== undefined && o.height !== undefined && o.originX !== undefined && o.originY !== undefined) {
    const left = o.x - o.originX * o.width * o.scaleX;
    const top = o.y - o.originY * o.height * o.scaleY;
    return { x: left + ss.x * o.scaleX, y: top + ss.y * o.scaleY, width: ss.w * o.scaleX, height: ss.h * o.scaleY };
  }
  const b = o.getBounds?.();
  return b ? { x: b.x, y: b.y, width: b.width, height: b.height } : { x: o.x, y: o.y, width: 0, height: 0 };
}

export function boxCentre(b: Box): Point {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Bob scale factor at phase `v` (0..1 of a half cycle); its amplitude goes through `amplitude`. */
export function bobFactor(v: number, reduced: boolean, peak: number = Tokens.ui.hintItemBobScale): number {
  return 1 + (amplitude(peak, reduced) - 1) * v;
}

export interface HandTiming {
  readonly pressMs: number;
  /** Story 5.1 tap-then-tap demo: the finger lifts off the item over this before it travels. */
  readonly liftMs: number;
  readonly moveMs: number;
  readonly fadeMs: number;
  readonly pressScale: number;
}

export function defaultHandTiming(): HandTiming {
  const t = Tokens.Timing;
  return { pressMs: t.hintHandPressMs, liftMs: t.hintHandTapLiftMs, moveMs: t.hintHandMoveMs, fadeMs: t.hintHandFadeMs, pressScale: Tokens.ui.pressScale };
}

/**
 * The fingertip's route of a demo: drag → item, target centre; trace → the path (from the item when
 * it has none of its own start); tap, or a drag/trace without target/path → the item only.
 */
export function handRoute(step: Pick<HintStep, 'action' | 'path'>, from: Point, to: Point | undefined): Point[] {
  if (step.action === 'drag' && to) return [from, to];
  const path = step.action === 'trace' ? resolvePath(step) : undefined;
  if (path && path.length > 1) return path.map((p) => ({ x: p.x, y: p.y }));
  return [from];
}

/**
 * Story 5.1: how the hand demonstrates. `tap-tap` (a drag with a target): tap the item, travel lifted,
 * tap the target. `press-move`: press, move pressed along the route (trace), lift and fade.
 */
export type HandStyle = 'press-move' | 'tap-tap';

export function handStyle(step: Pick<HintStep, 'action'>, route: readonly Point[]): HandStyle {
  return step.action === 'drag' && route.length > 1 ? 'tap-tap' : 'press-move';
}

export function handDuration(route: readonly Point[], t: HandTiming = defaultHandTiming(), style: HandStyle = 'press-move'): number {
  if (style === 'tap-tap' && route.length > 1) return t.pressMs + t.liftMs + t.moveMs + t.pressMs + t.fadeMs;
  return t.pressMs + (route.length > 1 ? t.moveMs : 0) + t.fadeMs;
}

const easeInOut = (u: number): number => 0.5 - Math.cos(Math.PI * u) / 2;
const clamp01 = (u: number): number => Math.min(1, Math.max(0, u));

/** The point at fraction `u` of the polyline's length. */
export function alongRoute(route: readonly Point[], u: number): Point {
  if (route.length === 1) return route[0]!;
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    const d = Math.hypot(route[i]!.x - route[i - 1]!.x, route[i]!.y - route[i - 1]!.y);
    seg.push(d);
    total += d;
  }
  if (total === 0) return route[0]!;
  let left = clamp01(u) * total;
  for (let i = 0; i < seg.length; i++) {
    const d = seg[i]!;
    if (left <= d || i === seg.length - 1) {
      const k = d === 0 ? 0 : Math.min(1, left / d);
      const a = route[i]!;
      const b = route[i + 1]!;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    left -= d;
  }
  return route[route.length - 1]!;
}

export interface HandPose {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly alpha: number;
}

/** Story 5.1: a hand demo's fingertip route, its style and its total duration (what `hand()` plays). */
export function handDemo(
  step: Pick<HintStep, 'action' | 'path'>,
  from: Point,
  to: Point | undefined,
  t: HandTiming = defaultHandTiming(),
): { route: Point[]; style: HandStyle; total: number } {
  const route = handRoute(step, from, to);
  const style = handStyle(step, route);
  return { route, style, total: handDuration(route, t, style) };
}

/** Story 5.1 tap-then-tap pose: press + lift on the item, travel lifted, press on the target, lift and fade. */
function tapTapPose(route: readonly Point[], tMs: number, t: HandTiming): HandPose {
  const start = route[0]!;
  const end = route[route.length - 1]!;
  const pressed = (u: number): number => 1 + (t.pressScale - 1) * u;
  let at = tMs;
  if (at < t.pressMs) return { ...start, scale: pressed(clamp01(at / t.pressMs)), alpha: 1 };
  at -= t.pressMs;
  if (at < t.liftMs) return { ...start, scale: pressed(1 - clamp01(at / t.liftMs)), alpha: 1 };
  at -= t.liftMs;
  if (at < t.moveMs) return { ...alongRoute(route, easeInOut(clamp01(at / t.moveMs))), scale: 1, alpha: 1 };
  at -= t.moveMs;
  if (at < t.pressMs) return { ...end, scale: pressed(clamp01(at / t.pressMs)), alpha: 1 };
  at -= t.pressMs;
  const u = clamp01(at / t.fadeMs);
  return { ...end, scale: pressed(1 - u), alpha: 1 - u };
}

/** Pose of the hand `tMs` into a demo: press on the start, move (ease in-out), lift and fade at the end. */
export function handPose(route: readonly Point[], tMs: number, t: HandTiming = defaultHandTiming(), style: HandStyle = 'press-move'): HandPose {
  if (style === 'tap-tap' && route.length > 1) return tapTapPose(route, tMs, t);
  const start = route[0]!;
  const end = route[route.length - 1]!;
  const moveMs = route.length > 1 ? t.moveMs : 0;
  if (tMs < t.pressMs) {
    const u = clamp01(tMs / t.pressMs);
    return { ...start, scale: 1 + (t.pressScale - 1) * u, alpha: 1 };
  }
  if (tMs < t.pressMs + moveMs) {
    const u = easeInOut(clamp01((tMs - t.pressMs) / moveMs));
    return { ...alongRoute(route, u), scale: t.pressScale, alpha: 1 };
  }
  const u = clamp01((tMs - t.pressMs - moveMs) / t.fadeMs);
  return { ...end, scale: t.pressScale + (1 - t.pressScale) * u, alpha: 1 - u };
}

// --- Story 5.1: the selection ring --------------------------------------------------------------------

export interface SelectionRing {
  destroy(): void;
}

/**
 * Story 5.1: the ring around a tap-selected item — the hint-ring strokes at
 * ui.selectionRingWidthScale of their width, around the item's bounds + ui.selectionRingPad, steady (no
 * pulse, so it never reads as the hint). It follows the object every frame until destroyed (or the
 * object is); it is independent of the one live hint ring. `depth`: the lifted item's depth, if any.
 */
export function createSelectionRing(scene: Scene, obj: unknown, depth?: number): SelectionRing {
  if (!isItemObject(obj) || !alive(obj)) return { destroy: () => undefined };
  const spec = Tokens.components.hintRing;
  const k = Tokens.ui.selectionRingWidthScale;
  const box = itemRingBox(itemBounds(obj), Tokens.ui.selectionRingPad);
  const { cx, cy, rx, ry } = ringRadii(box);
  const g: GameObjects.Graphics = scene.add.graphics({ x: cx, y: cy });
  if (depth !== undefined) g.setDepth(depth);
  const haloOffset = (spec.core.width * k) / 2 + (spec.halo.width * k) / 2;
  g.lineStyle(spec.halo.width * k, spec.halo.color.value, spec.halo.color.alpha);
  g.strokeEllipse(0, 0, 2 * (rx + haloOffset), 2 * (ry + haloOffset));
  g.lineStyle(spec.core.width * k, spec.core.color.value, spec.core.color.alpha);
  g.strokeEllipse(0, 0, 2 * rx, 2 * ry);
  g.lineStyle(spec.line.width * k, spec.line.color.value, spec.line.color.alpha);
  g.strokeEllipse(0, 0, 2 * rx, 2 * ry);
  let destroyed = false;
  const follow = (): void => {
    if (!alive(obj)) {
      ring.destroy();
      return;
    }
    const c = boxCentre(itemBounds(obj));
    g.setPosition(c.x, c.y);
  };
  scene.events.on('postupdate', follow);
  const ring: SelectionRing = {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      scene.events.off('postupdate', follow);
      scene.events.off('shutdown', onShutdown);
      g.destroy();
    },
  };
  const onShutdown = (): void => ring.destroy();
  scene.events.once('shutdown', onShutdown);
  return ring;
}

// --- Story 1.9: drawing -------------------------------------------------------------------------------

const HAND_DEPTH = 10000;

/** Draws the 72 px hint hand with its fingertip at (0, 0), pointing up. */
function drawHand(g: GameObjects.Graphics): void {
  const spec = Tokens.components.hintHand;
  const ring = Tokens.components.hintRing;
  const s = spec.size;
  const finger = { w: s * 0.25, h: s * 0.5 };
  const palm = { w: s * 0.62, h: s * 0.5 };
  const palmX = -finger.w / 2 - s * 0.06;
  const palmY = s * 0.42;
  const r = finger.w / 2;
  // Shadow ellipse under the palm.
  g.fillStyle(spec.shadow.color.value, spec.shadow.color.alpha);
  g.fillEllipse(palmX + palm.w / 2 + spec.shadow.x, palmY + palm.h / 2 + spec.shadow.y, palm.w + spec.shadow.blur, palm.h * 0.8);
  const shape = (fill: boolean): void => {
    if (fill) {
      g.fillRoundedRect(-finger.w / 2, 0, finger.w, finger.h + r, r);
      g.fillRoundedRect(palmX, palmY, palm.w, palm.h, r);
      g.fillRoundedRect(palmX - s * 0.1, palmY + palm.h * 0.15, s * 0.22, palm.h * 0.45, r * 0.8);
    } else {
      g.strokeRoundedRect(-finger.w / 2, 0, finger.w, finger.h + r, r);
      g.strokeRoundedRect(palmX, palmY, palm.w, palm.h, r);
      g.strokeRoundedRect(palmX - s * 0.1, palmY + palm.h * 0.15, s * 0.22, palm.h * 0.45, r * 0.8);
    }
  };
  g.lineStyle(ring.line.width, ring.line.color.value, ring.line.color.alpha);
  shape(false);
  g.fillStyle(ring.core.color.value, ring.core.color.alpha);
  shape(true);
}

export interface HintVisuals extends HintVisualsPort {
  /** Removes everything and restores alpha 1 directly (scene shutdown). */
  destroy(): void;
}

export interface HintVisualsOptions {
  readonly reduced?: boolean;
}

/** The HintDirector's visuals for one game scene. */
export function createHintVisuals(scene: Scene, opts: HintVisualsOptions = {}): HintVisuals {
  const reduced = opts.reduced ?? false;
  let ring: HintRing | undefined;
  let follow: (() => void) | undefined;
  let bob: { tween: Tweens.Tween; pause(reason: string, on: boolean): void; stop(): void } | undefined;
  let hand: { g: GameObjects.Graphics; tween: Tweens.Tween } | undefined;
  const dims = new Map<ItemObject, Tweens.Tween | undefined>();
  let closed = false;

  const stopFollow = (): void => {
    if (follow) scene.events.off('postupdate', follow);
    follow = undefined;
  };

  const startBob = (item: HintItem, obj: ItemObject): void => {
    const held = new Set<string>();
    let base = { x: obj.scaleX, y: obj.scaleY };
    let running = true;
    /** The last pause put the item back at `base`, so its scale on resume is a real rest scale. */
    let restored = true;
    const otherTween = (): boolean => scene.tweens.getTweensOf(obj).length > 0;
    const setRunning = (on: boolean): void => {
      if (on === running) return;
      running = on;
      if (!alive(obj)) return;
      // Entering a pause: restore the captured scale (unless another tween owns it). Leaving: recapture
      // only after a restored pause, so a mid-bob scale never becomes the new base.
      if (!on) {
        restored = !otherTween();
        if (restored) obj.setScale(base.x, base.y);
      } else if (restored) {
        base = { x: obj.scaleX, y: obj.scaleY };
      }
    };
    if (item.isDragging?.()) {
      held.add('lift');
      running = false;
    }
    const unsubscribe = item.onLiftChange?.((lifted) => pause('lift', lifted));
    function pause(reason: string, on: boolean): void {
      if (on) held.add(reason);
      else held.delete(reason);
      setRunning(held.size === 0 && !otherTween());
    }
    const tween = scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: Tokens.components.hintRing.pulse.durationMs,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
      onUpdate: (t) => {
        if (!alive(obj)) return;
        setRunning(held.size === 0 && !otherTween());
        if (!running) return;
        const k = bobFactor(t.getValue() ?? 0, reduced);
        obj.setScale(base.x * k, base.y * k);
      },
    });
    bob = {
      tween,
      pause,
      stop() {
        unsubscribe?.();
        tween.stop();
        if (running && alive(obj) && !otherTween()) obj.setScale(base.x, base.y);
      },
    };
  };

  const clearRing = (): void => {
    stopFollow();
    bob?.stop();
    bob = undefined;
    ring?.destroy();
    ring = undefined;
  };

  const clearHand = (): void => {
    if (!hand) return;
    hand.tween.stop();
    hand.g.destroy();
    hand = undefined;
    bob?.pause('hand', false);
  };

  const visuals: HintVisuals = {
    ring(item) {
      clearRing();
      if (closed || !item || !isItemObject(item.object)) return;
      const obj = item.object;
      if (!alive(obj)) return;
      const start = itemBounds(obj);
      const r = createHintRing(scene, itemRingBox(start), { reduced });
      ring = r;
      follow = () => {
        if (!alive(obj)) return;
        const c = boxCentre(itemBounds(obj));
        r.setCentre(c.x, c.y);
      };
      scene.events.on('postupdate', follow);
      startBob(item, obj);
    },
    hand(step) {
      clearHand();
      if (closed) return;
      const obj = step.correct[0]?.object;
      if (!isItemObject(obj) || !alive(obj)) return;
      const c = step.target?.circle();
      const timing = defaultHandTiming();
      const { route, style, total } = handDemo(step, boxCentre(itemBounds(obj)), c ? { x: c.x, y: c.y } : undefined, timing);
      const g = scene.add.graphics().setDepth(HAND_DEPTH);
      drawHand(g);
      const apply = (ms: number): void => {
        const pose = handPose(route, ms, timing, style);
        g.setPosition(pose.x, pose.y).setScale(pose.scale).setAlpha(pose.alpha);
      };
      apply(0);
      bob?.pause('hand', true);
      const tween = scene.tweens.addCounter({
        from: 0,
        to: total,
        duration: total,
        onUpdate: (t) => apply(t.getValue() ?? 0),
        onComplete: () => clearHand(),
      });
      hand = { g, tween };
    },
    clearHand,
    dim(item, on) {
      const obj = item.object;
      if (!isItemObject(obj)) return;
      dims.get(obj)?.stop();
      dims.delete(obj);
      if (!alive(obj)) return;
      const to = on ? Tokens.ui.hintDimAlpha : 1;
      if (closed) {
        obj.setAlpha(to);
        return;
      }
      const tween = scene.tweens.add({ targets: obj, alpha: to, duration: Tokens.Timing.hintDimFadeMs, ease: 'Quad.easeOut' });
      if (on) dims.set(obj, tween);
    },
    destroy() {
      clearRing();
      clearHand();
      for (const [obj, tween] of dims) {
        tween?.stop();
        if (alive(obj)) obj.setAlpha(1);
      }
      dims.clear();
      closed = true;
    },
  };
  return visuals;
}
