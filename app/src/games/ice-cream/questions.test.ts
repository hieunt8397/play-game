import { describe, expect, it } from 'vitest';
import { FLAVOURS, HOME_SLOTS, ladder } from '../../content/games/ice-cream';
import { questionFor } from './questions';

const spoken = (fs: readonly string[]) => [...fs].sort((a, b) => FLAVOURS.indexOf(a as never) - FLAVOURS.indexOf(b as never));

describe('questionFor', () => {
  it('is deterministic for the same seed, index and level', () => {
    for (let level = 0; level < ladder.length; level++) {
      for (let i = 0; i < 10; i++) expect(questionFor(7, i, level)).toEqual(questionFor(7, i, level));
    }
  });

  it('level 0: two distinct flavours at scoop-2 and scoop-3, one wanted among them', () => {
    for (let i = 0; i < 20; i++) {
      const q = questionFor(7, i, 0);
      expect(q.index).toBe(i);
      expect(q.scoops.map((s) => s.home)).toEqual(['scoop-2', 'scoop-3']);
      expect(q.counter).toEqual(q.scoops.map((s) => s.flavour));
      expect(new Set(q.counter).size).toBe(2);
      expect(q.wanted).toHaveLength(1);
      expect(q.counter).toContain(q.wanted[0]);
    }
  });

  it('every level, seeds 0..99: counter on its home slots, distinct wanted from the counter, spoken order unless ordered, consecutive requests differ', () => {
    for (let level = 0; level < ladder.length; level++) {
      const lvl = ladder[level]!;
      for (let seed = 0; seed < 100; seed++) {
        let prev: string | undefined;
        for (let i = 0; i < 8; i++) {
          const q = questionFor(seed, i, level);
          expect(q.counter).toHaveLength(lvl.flavours);
          expect(new Set(q.counter).size).toBe(lvl.flavours);
          expect(q.scoops.map((s) => s.home)).toEqual(HOME_SLOTS[lvl.flavours]);
          expect(q.wanted).toHaveLength(lvl.scoops);
          expect(new Set(q.wanted).size).toBe(lvl.scoops);
          for (const f of q.wanted) expect(q.counter).toContain(f);
          expect(q.ordered).toBe(lvl.ordered);
          if (!lvl.ordered) expect(q.wanted).toEqual(spoken(q.wanted));
          const key = lvl.ordered ? q.wanted.join() : spoken(q.wanted).join();
          if (prev !== undefined) expect(key, `seed ${seed} level ${level} index ${i}`).not.toBe(prev);
          prev = key;
        }
      }
    }
  });

  it('the ordered level asks sequences outside the spoken order', () => {
    const seqs = Array.from({ length: 100 }, (_, s) => questionFor(s, 0, 3).wanted);
    expect(seqs.some((w) => w.join() !== spoken(w).join())).toBe(true);
  });

  it('level 0 asks all 4 flavours in indexes 0..19', () => {
    for (const seed of [0, 7, 42, 123456, 2 ** 31 - 1]) {
      const targets = Array.from({ length: 20 }, (_, i) => questionFor(seed, i, 0).wanted[0]);
      expect(new Set(targets)).toEqual(new Set(FLAVOURS));
    }
  });

  it('different seeds give different rounds', () => {
    const a = Array.from({ length: 6 }, (_, i) => questionFor(1, i, 1).wanted.join()).join('|');
    const b = Array.from({ length: 6 }, (_, i) => questionFor(2, i, 1).wanted.join()).join('|');
    expect(a).not.toBe(b);
  });

  it('clamps an out-of-range level', () => {
    expect(questionFor(7, 3, 99)).toEqual(questionFor(7, 3, ladder.length - 1));
    expect(questionFor(7, 3, -2)).toEqual(questionFor(7, 3, 0));
    expect(questionFor(7, 3, Number.NaN)).toEqual(questionFor(7, 3, 0));
  });
});
