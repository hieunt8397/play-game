import { describe, expect, it, vi } from 'vitest';
import type { RoundOutcome, Snapshot } from '../content/types';
import { Bus } from './bus';
import { RoundGuard } from './round-guard';

const SNAP: Snapshot = { v: 1, level: 0, seed: 7, questionIndex: 0, partial: { placed: [] } };
const OUTCOME: RoundOutcome = { gameId: 'ice-cream', questions: 3, firstTryCorrect: 3, maxHintLevel: 0 };

function setup() {
  const bus = new Bus();
  const complete = vi.fn();
  const abandon = vi.fn();
  const leave = vi.fn();
  bus.on('round:complete', complete);
  bus.on('round:abandon', abandon);
  bus.on('round:leave', leave);
  const inert = vi.fn();
  const guard = new RoundGuard('ice-cream', bus, inert);
  return { guard, complete, abandon, leave, inert };
}

describe('RoundGuard', () => {
  it('home twice: one round:abandon, then inert', () => {
    const { guard, abandon, inert } = setup();
    expect(guard.inert).toBe(false);
    expect(guard.abandon(SNAP)).toBe(true);
    expect(guard.abandon(SNAP)).toBe(false);
    expect(abandon).toHaveBeenCalledTimes(1);
    expect(abandon).toHaveBeenCalledWith({ gameId: 'ice-cream', snapshot: SNAP });
    expect(guard.inert).toBe(true);
    expect(inert).toHaveBeenCalledTimes(1);
  });

  it('complete then abandon: one event only', () => {
    const { guard, complete, abandon } = setup();
    expect(guard.complete(OUTCOME)).toBe(true);
    expect(guard.abandon(SNAP)).toBe(false);
    expect(guard.complete(OUTCOME)).toBe(false);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith(OUTCOME);
    expect(abandon).not.toHaveBeenCalled();
  });

  it('the outcome always carries the guard game id', () => {
    const { guard, complete } = setup();
    guard.complete({ ...OUTCOME, gameId: 'pizza' });
    expect(complete).toHaveBeenCalledWith({ ...OUTCOME, gameId: 'ice-cream' });
  });

  it('complete enters free play: inert, not terminal, onInert not yet run', () => {
    const { guard, complete, inert } = setup();
    guard.complete(OUTCOME);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(guard.inert).toBe(true);
    expect(guard.freePlay).toBe(true);
    expect(guard.terminal).toBe(false);
    expect(inert).not.toHaveBeenCalled();
  });

  it('leave from free play: one round:leave, then done and onInert once', () => {
    const { guard, leave, abandon, inert } = setup();
    guard.complete(OUTCOME);
    expect(guard.leave()).toBe(true);
    expect(guard.leave()).toBe(false);
    expect(guard.abandon(SNAP)).toBe(false);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(leave).toHaveBeenCalledWith({ gameId: 'ice-cream' });
    expect(abandon).not.toHaveBeenCalled();
    expect(guard.freePlay).toBe(false);
    expect(guard.terminal).toBe(true);
    expect(inert).toHaveBeenCalledTimes(1);
  });

  it('leave while playing or after abandon emits nothing', () => {
    const { guard, leave } = setup();
    expect(guard.leave()).toBe(false);
    expect(guard.inert).toBe(false);
    guard.abandon(SNAP);
    expect(guard.terminal).toBe(true);
    expect(guard.freePlay).toBe(false);
    expect(guard.leave()).toBe(false);
    expect(leave).not.toHaveBeenCalled();
  });
});
