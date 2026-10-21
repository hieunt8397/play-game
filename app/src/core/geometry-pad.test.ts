import { describe, expect, it } from 'vitest';
import { decorationFootprint, decorationFrameName, padRect, rectPolygon } from './geometry-pad';

describe('geometry-pad', () => {
  it('decorationFootprint: trimmed rect ÷ renderScale, shifted by at − pivot', () => {
    expect(decorationFootprint({ x: 100, y: 200, width: 50, height: 80 }, { x: 10, y: 20 }, { x: 15, y: 10 }, 2)).toEqual({
      x: 55,
      y: 90,
      width: 25,
      height: 40,
    });
  });

  it('decorationFrameName: the map atlas frame grammar', () => {
    expect(decorationFrameName('parasol')).toBe('decoration/parasol/00');
  });

  it('padRect grows every side; rectPolygon lists the corners clockwise from top-left', () => {
    expect(padRect({ x: 10, y: 20, width: 30, height: 40 }, 5)).toEqual({ x: 5, y: 15, width: 40, height: 50 });
    expect(rectPolygon({ x: 0, y: 0, width: 2, height: 3 })).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 3 },
      { x: 0, y: 3 },
    ]);
  });
});
