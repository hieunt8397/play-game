// The one screen <-> design transform (Story 1.6, AD-4/AD-7). Pure core plus `readView`/`toDesign`
// glue. Frames:
// - client: CSS px of the viewport (what touch/mouse events report);
// - local: CSS px of the #stage box before its CSS transform (landscape = client; portrait rotates
//   #stage by 90deg around its top-left corner, placed at left: 100dvw);
// - play box: the largest centred box in the stage whose aspect is clamped to
//   Tokens.supportedAspect (#game-container, stage.css). On every iPad it is the whole stage; on a
//   phone (wider) or a squarish window it leaves sky-coloured bars outside it. `readView` measures
//   the laid-out box (what Phaser renders into); `playBox` computes it only without a DOM;
// - design: the 1024x768 frame that Phaser's ENVELOP scales to cover the play box, centred.
// Safe-area insets come from the `--sai-*` CSS custom properties (stage.css) in screen terms.
import type { Rect } from '../safe-rect';
import { Tokens } from '../tokens';
import { clientPoint, type PointerPointLike, type ScaleLike } from './pointer-adapter';
import type { Point } from './polygon';

export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface View {
  /** Stage layout width (CSS px, ignores transforms). */
  readonly w: number;
  /** Stage layout height (CSS px, ignores transforms). */
  readonly h: number;
  /** Portrait: the stage is rotated 90deg (same media query as stage.css). */
  readonly rotated: boolean;
  /** Safe-area insets of the screen (CSS px). */
  readonly insets: Insets;
  /**
   * The laid-out play box (#game-container) in stage-local CSS px, as measured by `readView` (the
   * same rounded layout sizes Phaser's ENVELOP reads). Absent: `playBox` computes it.
   */
  readonly box?: Rect;
}

export const PORTRAIT_QUERY = '(orientation: portrait)';
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

const DESIGN_W = Tokens.design.width;
const DESIGN_H = Tokens.design.height;

/** Client CSS px -> stage-local CSS px. */
export function toLocal(client: Point, view: View): Point {
  if (!view.rotated) return { x: client.x, y: client.y };
  return { x: client.y, y: view.h - client.x };
}

/** Stage-local CSS px -> client CSS px (inverse of `toLocal`). */
export function toClient(local: Point, view: View): Point {
  if (!view.rotated) return { x: local.x, y: local.y };
  return { x: view.h - local.y, y: local.x };
}

/** Screen insets expressed in the stage-local frame. */
export function localInsets(view: View): Insets {
  const i = view.insets;
  if (!view.rotated) return { ...i };
  return { top: i.right, right: i.bottom, bottom: i.left, left: i.top };
}

const nonEmpty = (r: Rect | undefined): r is Rect => !!r && r.w > 0 && r.h > 0;

/**
 * The play box (#game-container) in stage-local CSS px. The measured `view.box` when there is one
 * (what Phaser really renders into, e.g. the whole stage without container-query support);
 * otherwise computed: centred, aspect clamped to Tokens.supportedAspect, an in-range stage returned
 * whole (exact, so iPads are unchanged). A degenerate stage (w or h <= 0) keeps the whole stage.
 */
export function playBox(view: Pick<View, 'w' | 'h' | 'box'>): Rect {
  if (nonEmpty(view.box)) return { ...view.box };
  const { min, max } = Tokens.supportedAspect;
  let w = view.w;
  let h = view.h;
  if (w > 0 && h > 0) {
    const a = w / h;
    if (a > max) w = h * max;
    else if (a < min) h = w / min;
  }
  return { x: (view.w - w) / 2, y: (view.h - h) / 2, w, h };
}

/**
 * ENVELOP scale (covering the play box) and the offsets of the design frame inside the stage
 * (centred in the box). A degenerate stage keeps its whole-stage box, so s > 0 whenever the stage
 * has any size (as before the play box).
 */
export function envelop(view: Pick<View, 'w' | 'h' | 'box'>): { s: number; ox: number; oy: number } {
  const box = playBox(view);
  const s = Math.max(box.w / DESIGN_W, box.h / DESIGN_H);
  return { s, ox: box.x + (box.w - DESIGN_W * s) / 2, oy: box.y + (box.h - DESIGN_H * s) / 2 };
}

export function localToDesign(local: Point, view: View): Point {
  const { s, ox, oy } = envelop(view);
  return { x: (local.x - ox) / s, y: (local.y - oy) / s };
}

export function designToLocal(design: Point, view: View): Point {
  const { s, ox, oy } = envelop(view);
  return { x: design.x * s + ox, y: design.y * s + oy };
}

/** The design rect covered by the play box (the whole stage on an iPad). */
export function visibleDesignRect(view: View): Rect {
  const { s, ox, oy } = envelop(view);
  const box = playBox(view);
  return { x: (box.x - ox) / s, y: (box.y - oy) / s, w: box.w / s, h: box.h / s };
}

/**
 * Local insets measured from the play box edges: the part of each inset that reaches past the bar
 * on that side, max(0, inset - bar). No bars (iPad) = `localInsets`.
 */
export function boxInsets(view: View): Insets {
  const li = localInsets(view);
  const box = playBox(view);
  const barRight = view.w - box.x - box.w;
  const barBottom = view.h - box.y - box.h;
  return {
    top: Math.max(0, li.top - box.y),
    right: Math.max(0, li.right - barRight),
    bottom: Math.max(0, li.bottom - barBottom),
    left: Math.max(0, li.left - box.x),
  };
}

/** Box insets converted to design px (÷ s). */
export function designInsets(view: View): Insets {
  const { s } = envelop(view);
  const bi = boxInsets(view);
  return { top: bi.top / s, right: bi.right / s, bottom: bi.bottom / s, left: bi.left / s };
}

/**
 * True when a stage-local point lies outside the play box (in a bar) or in the box's edge strip
 * (dead zone) plus the box inset.
 */
export function isDeadZone(local: Point, view: View): boolean {
  const sp = Tokens.spacing;
  const box = playBox(view);
  const bi = boxInsets(view);
  return (
    local.x < box.x + sp.edgeDeadSide + bi.left ||
    local.x > box.x + box.w - sp.edgeDeadSide - bi.right ||
    local.y < box.y + sp.edgeDeadTop + bi.top ||
    local.y > box.y + box.h - sp.edgeDeadBottom - bi.bottom
  );
}

/** Slices of `document` / `window` that `readView` needs (fakeable). */
export interface ViewElLike {
  readonly clientWidth: number;
  readonly clientHeight: number;
  readonly offsetLeft?: number;
  readonly offsetTop?: number;
}
export interface ViewDocLike {
  getElementById(id: string): ViewElLike | null;
  readonly documentElement: unknown;
}
export interface ViewWinLike {
  readonly innerWidth: number;
  readonly innerHeight: number;
  matchMedia?(query: string): { readonly matches: boolean };
  getComputedStyle?(el: never): { getPropertyValue(name: string): string };
}

function px(value: string | undefined): number {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) ? n : 0;
}

/** Reads the current stage view from the DOM. Falls back to the window size and no insets. */
export function readView(doc: ViewDocLike, win: ViewWinLike): View {
  let rotated: boolean;
  try {
    rotated = typeof win.matchMedia === 'function' && win.matchMedia(PORTRAIT_QUERY).matches;
  } catch {
    rotated = false;
  }
  const stage = doc.getElementById('stage');
  const w = stage && stage.clientWidth > 0 ? stage.clientWidth : rotated ? win.innerHeight : win.innerWidth;
  const h = stage && stage.clientHeight > 0 ? stage.clientHeight : rotated ? win.innerWidth : win.innerHeight;
  let insets: Insets = NO_INSETS;
  try {
    const style = win.getComputedStyle?.(doc.documentElement as never);
    if (style) {
      insets = {
        top: px(style.getPropertyValue('--sai-top')),
        right: px(style.getPropertyValue('--sai-right')),
        bottom: px(style.getPropertyValue('--sai-bottom')),
        left: px(style.getPropertyValue('--sai-left')),
      };
    }
  } catch {
    insets = NO_INSETS;
  }
  // The play box as laid out (offsetLeft/Top relative to #stage, its offset parent; layout px, so
  // transform-independent like clientWidth/Height, which Phaser's patched getParentBounds reads).
  const c = doc.getElementById('game-container');
  if (c && c.clientWidth > 0 && c.clientHeight > 0) {
    const box = { x: c.offsetLeft ?? 0, y: c.offsetTop ?? 0, w: c.clientWidth, h: c.clientHeight };
    return { w, h, rotated, insets, box };
  }
  return { w, h, rotated, insets };
}

/** The view of the running page (browser), or undefined under node. */
export function currentView(): View | undefined {
  if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;
  return readView(document, window as unknown as ViewWinLike);
}

/** Where a pointer is: its stage-local point, design point and whether it starts in a dead zone. */
export interface Located {
  readonly local: Point;
  readonly design: Point;
  readonly dead: boolean;
}

/**
 * Locates a pointer. Without a DOM (node tests) the pointer's own x/y are taken as design px and
 * nothing is dead.
 */
export function locate(pointer: PointerPointLike, scale?: ScaleLike, view: View | undefined = currentView()): Located {
  if (!view) {
    const p = { x: pointer.x, y: pointer.y };
    return { local: p, design: p, dead: false };
  }
  const local = toLocal(clientPoint(pointer, scale), view);
  return { local, design: localToDesign(local, view), dead: isDeadZone(local, view) };
}

/** Design point of a pointer (the only pointer -> design mapping in the app). */
export function toDesign(pointer: PointerPointLike, scale?: ScaleLike): Point {
  return locate(pointer, scale).design;
}
