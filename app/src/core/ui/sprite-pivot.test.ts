import { describe, expect, it } from 'vitest';
import { originFor, trimmedCentre, trimmedSize } from './sprite-pivot';

describe('sprite-pivot', () => {
  it('trimmedCentre: centre of the trimmed rect in design px', () => {
    expect(trimmedCentre({ x: 100, y: 200, width: 40, height: 60 }, 2)).toEqual({ x: 60, y: 115 });
  });

  it('trimmedSize divides by the render scale', () => {
    expect(trimmedSize({ x: 0, y: 0, width: 232, height: 180 }, 2)).toEqual({ w: 116, h: 90 });
  });

  it('originFor: pivot / design size', () => {
    expect(originFor({ x: 512, y: 384 }, { width: 1024, height: 768 })).toEqual({ x: 0.5, y: 0.5 });
  });
});
