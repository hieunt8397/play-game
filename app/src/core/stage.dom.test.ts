// @vitest-environment happy-dom
// Deferred from spec-1-1 (Story 1.6): the ScaleManager rotation patch on real HTMLElements whose
// layout sizes are stubbed under `transform: rotate(90deg)` (getBoundingClientRect = rotated box).
import { beforeAll, describe, expect, it, vi } from 'vitest';

const Center = { NO_CENTER: 0, CENTER_BOTH: 1, CENTER_HORIZONTALLY: 2, CENTER_VERTICALLY: 3 };
const originalParentBounds = vi.fn(() => false);
const originalUpdateCenter = vi.fn();

class FakeScaleManager {}
Object.assign(FakeScaleManager.prototype, { getParentBounds: originalParentBounds, updateCenter: originalUpdateCenter });

vi.mock('phaser', () => ({ Scale: { ScaleManager: FakeScaleManager, Center } }));

const { installRotationSafeScaleManager } = await import('./stage');

interface PatchedLike {
  getParentBounds(): boolean;
  updateCenter(): void;
}

function sized<T extends HTMLElement>(el: T, layout: { w: number; h: number }, rect: { x: number; y: number; w: number; h: number }): T {
  for (const [k, v] of Object.entries({ clientWidth: layout.w, clientHeight: layout.h, offsetWidth: layout.w, offsetHeight: layout.h })) {
    Object.defineProperty(el, k, { configurable: true, get: () => v });
  }
  el.getBoundingClientRect = () => ({ x: rect.x, y: rect.y, left: rect.x, top: rect.y, width: rect.w, height: rect.h, right: rect.x + rect.w, bottom: rect.y + rect.h, toJSON: () => ({}) }) as DOMRect;
  return el;
}

/** A ScaleManager-like instance on the patched prototype: parent = rotated #stage (portrait 820x1180 screen). */
function manager(opts: { canvasLayout: { w: number; h: number }; autoCenter?: number; parentIsWindow?: boolean }) {
  const stage = document.createElement('div');
  stage.style.transform = 'rotate(90deg)';
  sized(stage, { w: 1180, h: 820 }, { x: 0, y: 0, w: 820, h: 1180 });
  const canvas = sized(document.createElement('canvas'), opts.canvasLayout, { x: 0, y: 0, w: 1180, h: 1259 });
  stage.appendChild(canvas);
  const parentSize = {
    width: 0,
    height: 0,
    setSize(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
  };
  const sm = Object.assign(Object.create(FakeScaleManager.prototype) as PatchedLike, {
    parent: stage,
    parentIsWindow: opts.parentIsWindow ?? false,
    parentSize,
    canvas,
    canvasBounds: { x: 0, y: 0 },
    autoCenter: opts.autoCenter ?? Center.CENTER_BOTH,
  });
  return { sm, parentSize, canvas };
}

describe('installRotationSafeScaleManager (happy-dom)', () => {
  beforeAll(() => installRotationSafeScaleManager());

  it('getParentBounds measures the layout size (landscape 1180x820), not the rotated box', () => {
    const { sm, parentSize } = manager({ canvasLayout: { w: 1180, h: 885 } });
    expect(sm.getParentBounds()).toBe(true);
    expect([parentSize.width, parentSize.height]).toEqual([1180, 820]);
    // Same size and same canvas position: nothing changed.
    expect(sm.getParentBounds()).toBe(false);
    expect(originalParentBounds).not.toHaveBeenCalled();
  });

  it('getParentBounds reports a moved canvas', () => {
    const { sm, canvas } = manager({ canvasLayout: { w: 1180, h: 885 } });
    sm.getParentBounds();
    canvas.getBoundingClientRect = () => ({ x: 5, y: 0 }) as DOMRect;
    expect(sm.getParentBounds()).toBe(true);
  });

  it('a window parent falls back to Phaser', () => {
    const { sm } = manager({ canvasLayout: { w: 1180, h: 885 }, parentIsWindow: true });
    sm.getParentBounds();
    expect(originalParentBounds).toHaveBeenCalledTimes(1);
  });

  it('updateCenter centres the ENVELOP canvas with layout sizes (crop top/bottom)', () => {
    const { sm, canvas } = manager({ canvasLayout: { w: 1180, h: 885 } });
    sm.getParentBounds();
    sm.updateCenter();
    expect(canvas.style.marginLeft).toBe('0px');
    expect(canvas.style.marginTop).toBe(`${Math.floor((820 - 885) / 2)}px`);
    expect(originalUpdateCenter).not.toHaveBeenCalled();
  });

  it('updateCenter honours horizontal-only and no-centre modes', () => {
    const h = manager({ canvasLayout: { w: 1200, h: 885 }, autoCenter: Center.CENTER_HORIZONTALLY });
    h.sm.getParentBounds();
    h.sm.updateCenter();
    expect([h.canvas.style.marginLeft, h.canvas.style.marginTop]).toEqual(['-10px', '0px']);
    const none = manager({ canvasLayout: { w: 1200, h: 885 }, autoCenter: Center.NO_CENTER });
    none.sm.getParentBounds();
    none.sm.updateCenter();
    expect(none.canvas.style.marginLeft).toBe('');
  });
});
