import { describe, expect, it } from 'vitest';
import { amplitude, prefersReducedMotion, REDUCED_MOTION_QUERY } from './reduced-motion';
import { Tokens } from './tokens';

describe('prefersReducedMotion', () => {
  it('reads the media query', () => {
    const seen: string[] = [];
    const win = (matches: boolean) => ({
      matchMedia: (q: string) => {
        seen.push(q);
        return { matches };
      },
    });
    expect(prefersReducedMotion(win(true))).toBe(true);
    expect(prefersReducedMotion(win(false))).toBe(false);
    expect(seen).toEqual([REDUCED_MOTION_QUERY, REDUCED_MOTION_QUERY]);
  });

  it('is false without matchMedia, without a window, or when it throws', () => {
    expect(prefersReducedMotion({})).toBe(false);
    expect(prefersReducedMotion(undefined)).toBe(false);
    expect(
      prefersReducedMotion({
        matchMedia: () => {
          throw new Error('nope');
        },
      }),
    ).toBe(false);
  });
});

describe('amplitude (I/O matrix: Reduced motion)', () => {
  it('halves every scale amplitude when reduced', () => {
    expect(Tokens.ui.reducedMotionAmplitude).toBe(0.5);
    expect(amplitude(1.1, true)).toBeCloseTo(1.05);
    expect(amplitude(0.92, true)).toBeCloseTo(0.96);
    expect(amplitude(1.08, true)).toBeCloseTo(1.04);
    expect(amplitude(0.95, true)).toBeCloseTo(0.975);
  });

  it('keeps the scale when not reduced', () => {
    expect(amplitude(1.1, false)).toBe(1.1);
    expect(amplitude(Tokens.ui.stationTapScale, false)).toBe(1.1);
  });
});
