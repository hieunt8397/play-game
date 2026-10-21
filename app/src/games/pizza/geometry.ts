// Tiệm pizza base geometry (Story 3.1), pure and shared by the game and tools/layout/rules.ts
// (`.ts` specifiers: the tools import it under Node type stripping; no Phaser).
import { ANCHORS, BASE_SLOT_IDS } from '../../content/games/pizza.ts';
import type { ScreenLayout } from '../../content/layout-types.ts';
import { Tokens } from '../../core/tokens.ts';

/**
 * The base's radius (design px): the largest distance from `anchor.base` to a `slot.base-*`, plus half
 * a placed slice. 0 when the anchor or every spot is missing.
 */
export function baseRadius(layout: Pick<ScreenLayout, 'anchors' | 'slots'>, slicePx: number = Tokens.ui.pizzaPlacedSlicePx): number {
  const c = layout.anchors[ANCHORS.base];
  if (!c) return 0;
  let far = -1;
  for (const id of BASE_SLOT_IDS) {
    const p = layout.slots[id];
    if (p) far = Math.max(far, Math.hypot(p.x - c.x, p.y - c.y));
  }
  return far < 0 ? 0 : far + slicePx / 2;
}
