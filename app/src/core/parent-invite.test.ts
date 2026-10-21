// Story 5.7: the parent-invitation model (every I/O matrix row of the model).
import { describe, expect, it } from 'vitest';
import { createParentInvite, type ParentInviteOptions } from './parent-invite';
import { mulberry32 } from './rng';

const LINES = ['vo.ice-cream.parent.1', 'vo.ice-cream.parent.2'] as const;

/** A rand that returns `values` in order, then 0. */
function fixed(...values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0;
}

function make(over: Partial<ParentInviteOptions> = {}) {
  return createParentInvite({ enabled: true, lines: LINES, rand: fixed(0, 0.9), chance: 0.3, resumed: false, ...over });
}

describe('createParentInvite', () => {
  it('rolled: roundStartLine gives the picked line once, then nothing', () => {
    const p = make();
    expect(p.used).toBe(false);
    expect(p.roundStartLine()).toBe('vo.ice-cream.parent.2');
    expect(p.used).toBe(true);
    expect(p.roundStartLine()).toBeUndefined();
    expect(p.freePlayLine()).toBeUndefined();
  });

  it('deterministic with a fixed rand (roll, then the line index)', () => {
    expect(make({ rand: fixed(0.1, 0.2) }).roundStartLine()).toBe('vo.ice-cream.parent.1');
    expect(make({ rand: fixed(0.29, 0.5) }).roundStartLine()).toBe('vo.ice-cream.parent.2');
    const a = make({ rand: mulberry32(42), chance: 1 }).roundStartLine();
    const b = make({ rand: mulberry32(42), chance: 1 }).roundStartLine();
    expect(a).toBe(b);
  });

  it('not rolled (rand ≥ chance): nothing at any moment', () => {
    const p = make({ rand: fixed(0.3) });
    expect(p.roundStartLine()).toBeUndefined();
    expect(p.freePlayLine()).toBeUndefined();
    expect(p.used).toBe(false);
  });

  it('chance 0 never invites; chance 1 always does', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(make({ rand: mulberry32(seed), chance: 0 }).roundStartLine()).toBeUndefined();
      expect(LINES).toContain(make({ rand: mulberry32(seed), chance: 1 }).roundStartLine());
    }
  });

  it('disabled, resumed or without lines: nothing', () => {
    for (const over of [{ enabled: false }, { resumed: true }, { lines: [] }] as const) {
      const p = make({ ...over, chance: 1 });
      expect(p.roundStartLine()).toBeUndefined();
      expect(p.freePlayLine()).toBeUndefined();
    }
  });

  it('round start only before the first question', () => {
    const p = make();
    p.questionBegan();
    expect(p.roundStartLine()).toBeUndefined();
    p.questionClosed();
    expect(p.roundStartLine()).toBeUndefined();
    expect(p.used).toBe(false);
  });

  it('nothing while a question is open; free play afterwards (still unused)', () => {
    const p = make();
    p.questionBegan();
    expect(p.freePlayLine()).toBeUndefined();
    expect(p.used).toBe(false);
    p.questionClosed();
    expect(p.freePlayLine()).toBe('vo.ice-cream.parent.2');
    expect(p.freePlayLine()).toBeUndefined();
  });

  it('free play before any question (touch-talk) gives the line once', () => {
    const p = make();
    expect(p.freePlayLine()).toBe('vo.ice-cream.parent.2');
    expect(p.roundStartLine()).toBeUndefined();
  });

  it('nothing after close()', () => {
    const p = make();
    p.close();
    expect(p.roundStartLine()).toBeUndefined();
    expect(p.freePlayLine()).toBeUndefined();
  });

  it('at most one line over any call sequence', () => {
    const ops = ['start', 'free', 'began', 'closed'] as const;
    const rand = mulberry32(7);
    for (let trial = 0; trial < 200; trial++) {
      const p = make({ rand: mulberry32(trial), chance: 1 });
      let handed = 0;
      for (let k = 0; k < 12; k++) {
        const op = ops[Math.floor(rand() * ops.length)];
        if (op === 'start' && p.roundStartLine() !== undefined) handed++;
        else if (op === 'free' && p.freePlayLine() !== undefined) handed++;
        else if (op === 'began') p.questionBegan();
        else if (op === 'closed') p.questionClosed();
      }
      expect(handed).toBeLessThanOrEqual(1);
    }
  });
});
