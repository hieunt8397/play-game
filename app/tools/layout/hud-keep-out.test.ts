import { describe, expect, it } from 'vitest';
import { hudLayout } from '../../src/core/hud';
import { Tokens } from '../../src/core/tokens';
import { HUD_KEEP_OUT_PX, circleHitsRect, hudKeepOutRects, visibleRectAt } from './hud-keep-out';

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

describe('hudKeepOutRects (Story 3.1)', () => {
  it('visible rect: the whole design at 4:3, a centred band at the widest aspect', () => {
    expect(visibleRectAt(4 / 3)).toEqual({ x: 0, y: 0, w: 1024, h: 768 });
    const wide = visibleRectAt(Tokens.supportedAspect.max);
    expect(wide.w).toBe(1024);
    expect(wide.y).toBeCloseTo((768 - 1024 / 1.46) / 2, 6);
  });

  it('centres the 120×120 squares on hudLayout’s Home and Speaker for both supported aspects', () => {
    const rects = hudKeepOutRects();
    expect(rects).toHaveLength(4);
    for (const a of [Tokens.supportedAspect.min, Tokens.supportedAspect.max]) {
      const hud = hudLayout(visibleRectAt(a), NO_INSETS);
      for (const c of [hud.home, hud.speaker]) {
        expect(rects.some((r) => r.x + HUD_KEEP_OUT_PX / 2 === c.x && Math.abs(r.y + HUD_KEEP_OUT_PX / 2 - c.y) < 1e-9)).toBe(true);
      }
    }
    for (const r of rects) expect([r.w, r.h]).toEqual([120, 120]);
  });

  it('circleHitsRect: grown by the radius', () => {
    const r = { x: 0, y: 0, w: 10, h: 10 };
    expect(circleHitsRect({ x: 15, y: 5 }, 6, r)).toBe(true);
    expect(circleHitsRect({ x: 15, y: 5 }, 5, r)).toBe(false);
    expect(circleHitsRect({ x: 5, y: 5 }, 1, r)).toBe(true);
  });
});
