// Story 5.3 I/O matrix skip rows: Short window, Early tap, Skip, Voice during skip, Reentrant end, End.
import { describe, expect, it, vi } from 'vitest';
import { createSkip, defaultSkipTimings, type SkipPorts } from './skip';
import { Tokens } from './tokens';

const T = Tokens.Timing;

function setup() {
  let t = 1000;
  const calls: string[] = [];
  const ports = {
    setTimeScale: vi.fn((k: number) => void calls.push(`scale ${k}`)),
    holdSfx: vi.fn((on: boolean) => void calls.push(`hold ${on}`)),
    stopVoice: vi.fn((token: number) => void calls.push(`stop ${token}`)),
  } satisfies SkipPorts;
  const skip = createSkip(ports, () => t);
  return { skip, ports, calls, advance: (ms: number) => (t += ms) };
}

describe('core/skip', () => {
  it('default timings come from Tokens.Timing', () => {
    expect(defaultSkipTimings()).toEqual({ thresholdMs: T.skipThresholdMs, armMs: T.skipArmMs, timeScale: T.skipTimeScale });
    expect(T.skipThresholdMs).toBe(1500);
    expect(T.skipArmMs).toBe(250);
  });

  it('Short window: begin(≤ threshold) + tap → nothing', () => {
    const s = setup();
    s.skip.begin(T.skipThresholdMs);
    s.advance(1000);
    s.skip.tap();
    expect(s.skip.open).toBe(false);
    expect(s.skip.skipping).toBe(false);
    expect(s.calls).toEqual([]);
  });

  it('Early tap: a tap before skipArmMs does nothing; a later one still skips', () => {
    const s = setup();
    s.skip.begin(2000);
    s.advance(T.skipArmMs - 1);
    s.skip.tap();
    expect(s.skip.skipping).toBe(false);
    expect(s.calls).toEqual([]);
    s.advance(1);
    s.skip.tap();
    expect(s.skip.skipping).toBe(true);
  });

  it('Skip: time scale, SFX hold, every tracked token stopped; a second tap is a no-op', () => {
    const s = setup();
    s.skip.begin(2000);
    s.skip.voice(7);
    s.skip.voice(8);
    s.advance(T.skipArmMs);
    s.skip.tap();
    expect(s.calls).toEqual([`scale ${T.skipTimeScale}`, 'hold true', 'stop 7', 'stop 8']);
    s.skip.tap();
    expect(s.calls).toHaveLength(4);
  });

  it('Voice during skip: stopped at once', () => {
    const s = setup();
    s.skip.begin(2000);
    s.advance(T.skipArmMs);
    s.skip.tap();
    s.skip.voice(9);
    expect(s.ports.stopVoice).toHaveBeenLastCalledWith(9);
  });

  it('voice outside a window is not tracked', () => {
    const s = setup();
    s.skip.voice(3);
    s.skip.begin(2000);
    s.advance(T.skipArmMs);
    s.skip.tap();
    expect(s.ports.stopVoice).not.toHaveBeenCalled();
  });

  it('Reentrant end: a stopVoice handler ending the window leaves scale 1 and SFX released', () => {
    const s = setup();
    s.ports.stopVoice.mockImplementation(() => {
      s.skip.end();
    });
    s.skip.begin(2000);
    s.skip.voice(1);
    s.advance(T.skipArmMs);
    s.skip.tap();
    expect(s.skip.skipping).toBe(false);
    expect(s.skip.open).toBe(false);
    expect(s.ports.setTimeScale).toHaveBeenLastCalledWith(1);
    expect(s.ports.holdSfx).toHaveBeenLastCalledWith(false);
  });

  it('End: scale 1, SFX released, tokens forgotten; idempotent; nothing without a window', () => {
    const s = setup();
    s.skip.end();
    expect(s.calls).toEqual([]);
    s.skip.begin(2000);
    s.skip.voice(4);
    s.advance(T.skipArmMs);
    s.skip.tap();
    s.skip.end();
    s.skip.end();
    expect(s.calls).toEqual([`scale ${T.skipTimeScale}`, 'hold true', 'stop 4', 'scale 1', 'hold false']);
    // A later window does not remember token 4.
    s.skip.begin(2000);
    s.advance(T.skipArmMs);
    s.skip.tap();
    expect(s.ports.stopVoice).toHaveBeenCalledTimes(1);
  });

  it('a short begin closes an older long window: a tap then skips nothing', () => {
    const s = setup();
    s.skip.begin(2000);
    s.advance(T.skipArmMs);
    s.skip.begin(T.skipThresholdMs);
    expect(s.skip.open).toBe(false);
    expect(s.skip.tap()).toBe(false);
    expect(s.calls).toEqual([]);
  });

  it('tap() reports whether it started the skip', () => {
    const s = setup();
    expect(s.skip.tap()).toBe(false);
    s.skip.begin(2000);
    expect(s.skip.tap()).toBe(false);
    s.advance(T.skipArmMs);
    expect(s.skip.tap()).toBe(true);
    expect(s.skip.tap()).toBe(false);
  });

  it('a tap after end() is ignored', () => {
    const s = setup();
    s.skip.begin(2000);
    s.skip.end();
    s.advance(T.skipArmMs);
    s.skip.tap();
    expect(s.calls).toEqual([]);
  });

  it('begin while skipping restores normal speed, then opens a fresh (unarmed) window', () => {
    const s = setup();
    s.skip.begin(2000);
    s.advance(T.skipArmMs);
    s.skip.tap();
    s.skip.begin(3000);
    expect(s.skip.skipping).toBe(false);
    expect(s.skip.open).toBe(true);
    expect(s.ports.setTimeScale).toHaveBeenLastCalledWith(1);
    s.skip.tap();
    expect(s.skip.skipping).toBe(false);
  });
});
