// Story 5.6 I/O matrix: Cloud drift, Wave bob, Fountain loop, whale spout frames.
import { describe, expect, it } from 'vitest';
import { driftX, loopFrame, spoutFrame, waveBob } from './map-ambient';
import { Tokens } from './tokens';

const SPAN = { min: -100, max: 1124 };
const FRAMES = ['f/a/00', 'f/a/01', 'f/a/02'];
const SPOUT = ['w/s/00', 'w/s/01', 'w/s/02', 'w/s/03'];

describe('driftX', () => {
  it('moves right at the speed and wraps inside the span', () => {
    expect(driftX(200, 0, 0.01, SPAN)).toBe(200);
    expect(driftX(200, 1000, 0.01, SPAN)).toBeCloseTo(210);
    // 1124 − 200 = 924 px to the right edge: past it, it re-enters at the left.
    expect(driftX(200, 100_000, 0.01, SPAN)).toBeCloseTo(SPAN.min + (300 + 1000 - 1224));
    for (let t = 0; t < 1_000_000; t += 7919) {
      const x = driftX(200, t, 0.01, SPAN);
      expect(x).toBeGreaterThanOrEqual(SPAN.min);
      expect(x).toBeLessThan(SPAN.max);
    }
  });

  it('reduced motion multiplies the speed by ui.reducedMotionAmplitude', () => {
    const f = Tokens.ui.reducedMotionAmplitude;
    expect(driftX(200, 1000, 0.01, SPAN, true) - 200).toBeCloseTo(10 * f);
  });

  it('non-finite elapsed or an empty span keeps baseX', () => {
    expect(driftX(200, Number.NaN, 0.01, SPAN)).toBe(200);
    expect(driftX(200, Number.POSITIVE_INFINITY, 0.01, SPAN)).toBe(200);
    expect(driftX(200, 1000, 0.01, { min: 5, max: 5 })).toBe(200);
  });
});

describe('waveBob', () => {
  const amp = Tokens.ui.mapWaveBobPx;
  const period = Tokens.Timing.mapWaveBobMs;

  it('stays within ± ui.mapWaveBobPx and repeats every Timing.mapWaveBobMs (≥ 1000 ms)', () => {
    expect(period).toBeGreaterThanOrEqual(Tokens.Timing.flashMinPeriodMs);
    let max = 0;
    for (let t = 0; t < 3 * period; t += 37) {
      const dy = waveBob(t, 2, false);
      expect(Math.abs(dy)).toBeLessThanOrEqual(amp + 1e-9);
      max = Math.max(max, Math.abs(dy));
      expect(waveBob(t + period, 2, false)).toBeCloseTo(dy);
    }
    expect(max).toBeGreaterThan(amp * 0.9);
  });

  it('staggers the phases by index', () => {
    expect(waveBob(0, 0, false)).toBeCloseTo(0);
    expect(waveBob(0, 1, false)).not.toBeCloseTo(waveBob(0, 0, false));
    expect(waveBob(0, 2, false)).not.toBeCloseTo(waveBob(0, 1, false));
  });

  it('reduced motion multiplies the amplitude', () => {
    const f = Tokens.ui.reducedMotionAmplitude;
    for (let t = 0; t < period; t += 101) expect(waveBob(t, 3, true)).toBeCloseTo(waveBob(t, 3, false) * f);
  });
});

describe('loopFrame', () => {
  it('cycles through the frames', () => {
    expect(loopFrame(0, FRAMES, 400, false)).toBe(FRAMES[0]);
    expect(loopFrame(399, FRAMES, 400, false)).toBe(FRAMES[0]);
    expect(loopFrame(400, FRAMES, 400, false)).toBe(FRAMES[1]);
    expect(loopFrame(800, FRAMES, 400, false)).toBe(FRAMES[2]);
    expect(loopFrame(1200, FRAMES, 400, false)).toBe(FRAMES[0]);
  });

  it('reduced → frames[0]; empty → undefined', () => {
    expect(loopFrame(800, FRAMES, 400, true)).toBe(FRAMES[0]);
    expect(loopFrame(800, [], 400, false)).toBeUndefined();
  });

  it('the fountain loop: cycle period ≥ flashMinPeriodMs', () => {
    expect(3 * Tokens.Timing.fountainFrameMs).toBeGreaterThanOrEqual(Tokens.Timing.flashMinPeriodMs);
  });
});

describe('spoutFrame', () => {
  it('plays every frame once, then undefined', () => {
    expect(spoutFrame(0, SPOUT, 250)).toBe(SPOUT[0]);
    expect(spoutFrame(260, SPOUT, 250)).toBe(SPOUT[1]);
    expect(spoutFrame(999, SPOUT, 250)).toBe(SPOUT[3]);
    expect(spoutFrame(1000, SPOUT, 250)).toBeUndefined();
    expect(spoutFrame(-1, SPOUT, 250)).toBeUndefined();
    expect(spoutFrame(0, [], 250)).toBeUndefined();
  });
});
