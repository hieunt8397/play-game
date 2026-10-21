// The one screen <-> design transform (Story 1.6, AD-4/AD-7). Pure core plus `readView`/`toDesign`
// glue. Frames:
// - client: CSS px of the viewport (what touch/mouse events report);
// - local: CSS px of the #stage box before its CSS transform (landscape = client; portrait rotates
//   #stage by 90deg around its top-left corner, placed at left: 100dvw);
// - design: the 1024x768 frame that Phaser's ENVELOP scales to cover the stage, centred.
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

/** ENVELOP scale and centred offsets of the design frame inside the stage. */
export function envelop(view: Pick<View, 'w' | 'h'>): { s: number; ox: number; oy: number } {
  const s = Math.max(view.w / DESIGN_W, view.h / DESIGN_H);
  return { s, ox: (view.w - DESIGN_W * s) / 2, oy: (view.h - DESIGN_H * s) / 2 };
}

export function localToDesign(local: Point, view: View): Point {
  const { s, ox, oy } = envelop(view);
  return { x: (local.x - ox) / s, y: (local.y - oy) / s };
}

export function designToLocal(design: Point, view: View): Point {
  const { s, ox, oy } = envelop(view);
  return { x: design.x * s + ox, y: design.y * s + oy };
}

/** The design rect covered by the whole stage. */
export function visibleDesignRect(view: View): Rect {
  const { s, ox, oy } = envelop(view);
  return { x: -ox / s, y: -oy / s, w: view.w / s, h: view.h / s };
}

/** Local insets converted to design px (÷ s). */
export function designInsets(view: View): Insets {
  const { s } = envelop(view);
  const li = localInsets(view);
  return { top: li.top / s, right: li.right / s, bottom: li.bottom / s, left: li.left / s };
}

/** True when a stage-local point lies in the edge strip (dead zone) plus the safe-area inset. */
export function isDeadZone(local: Point, view: View): boolean {
  const sp = Tokens.spacing;
  const li = localInsets(view);
  return (
    local.x < sp.edgeDeadSide + li.left ||
    local.x > view.w - sp.edgeDeadSide - li.right ||
    local.y < sp.edgeDeadTop + li.top ||
    local.y > view.h - sp.edgeDeadBottom - li.bottom
  );
}

/** Slices of `document` / `window` that `readView` needs (fakeable). */
export interface ViewDocLike {
  getElementById(id: string): { readonly clientWidth: number; readonly clientHeight: number } | null;
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
