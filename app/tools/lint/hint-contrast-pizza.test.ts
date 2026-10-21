// Story 3.1: the pizza hint-ring contrast sites.
import { describe, expect, it } from 'vitest';
import type { ScreenLayout } from '../../src/content/layout-types.ts';
import { Tokens } from '../../src/core/tokens.ts';
import { pizzaRings } from './hint-contrast.ts';

const layout = {
  v: 1,
  screenId: 'pizza',
  design: { width: 1024, height: 768 },
  renderScale: 2,
  anchors: {},
  paths: {},
  slots: { 'bowl-sausage': { x: 100, y: 560 }, 'bowl-mushroom': { x: 560, y: 565 }, 'base-1': { x: 340, y: 430 } },
  hits: { oven: [{ x: 700, y: 400 }, { x: 940, y: 400 }, { x: 940, y: 580 }, { x: 700, y: 580 }] },
} as unknown as ScreenLayout;

describe('pizzaRings (Story 3.1)', () => {
  it('one ring per slot.bowl-* from the topping frame + pad, and the oven ready ring in its hit bbox', () => {
    const atlas = { frames: { 'topping-sausage/idle/00': { spriteSourceSize: { x: 100, y: 1000, w: 200, h: 180 } } } };
    const rings = pizzaRings(layout, atlas);
    const pad = Tokens.ui.hintRingPad;
    expect(rings.map((r) => r.label)).toEqual(['slot.bowl-sausage', 'slot.bowl-mushroom', 'hit.oven']);
    expect(rings[0]!.ring).toEqual({ cx: 100, cy: 545, rx: 50 + pad, ry: 45 + pad });
    // No frame: the minSize circle at the slot.
    const r = Tokens.components.draggableItem.minSize / 2 + pad;
    expect(rings[1]!.ring).toEqual({ cx: 560, cy: 565, rx: r, ry: r });
    expect(rings[2]!.ring).toEqual({ cx: 820, cy: 490, rx: 120, ry: 90 });
  });
});
