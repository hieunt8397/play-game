import { describe, expect, it } from 'vitest';
import { FLAVOURS, ladder, type FlavourId } from '../../content/games/ice-cream';
import { isVoiceLineId } from '../../content/voice-lines';
import { askLineId, retryLineId } from './lines';
import { questionFor } from './questions';

/** Every request a level can make over all 4 flavours: k-subsets in FLAVOURS order, or k-permutations. */
function requests(scoops: number, ordered: boolean): FlavourId[][] {
  const out: FlavourId[][] = [];
  const walk = (acc: FlavourId[]): void => {
    if (acc.length === scoops) {
      if (ordered || acc.every((f, i) => i === 0 || FLAVOURS.indexOf(acc[i - 1]!) < FLAVOURS.indexOf(f))) out.push(acc);
      return;
    }
    for (const f of FLAVOURS) if (!acc.includes(f)) walk([...acc, f]);
  };
  walk([]);
  return out;
}

describe('ice-cream lines', () => {
  it('reachable request counts: 4 singles, 6 pairs, 4 triples, 24 ordered triples', () => {
    expect(requests(1, false)).toHaveLength(4);
    expect(requests(2, false)).toHaveLength(6);
    expect(requests(3, false)).toHaveLength(4);
    expect(requests(3, true)).toHaveLength(24);
  });

  it('every ask and retry id of every level is a voice line', () => {
    const missing: string[] = [];
    for (const lvl of ladder) {
      for (const wanted of requests(lvl.scoops, lvl.ordered)) {
        const q = { wanted, ordered: lvl.ordered };
        const ids = [askLineId(q)];
        // Every placed prefix (ordered) / every placed subset in placement order (unordered).
        for (let n = 0; n < wanted.length; n++) ids.push(retryLineId(q, wanted.slice(0, n)), retryLineId(q, wanted.slice(wanted.length - n)));
        for (const id of ids) if (!isVoiceLineId(id)) missing.push(id);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every line a seeded round can ask is a voice line (seeds 0..49, every level)', () => {
    for (let level = 0; level < ladder.length; level++) {
      for (let seed = 0; seed < 50; seed++) {
        for (let i = 0; i < ladder[level]!.questions; i++) expect(isVoiceLineId(askLineId(questionFor(seed, i, level)))).toBe(true);
      }
    }
  });

  it('ids by shape', () => {
    expect(askLineId({ wanted: ['vanilla'], ordered: false })).toBe('vo.ice-cream.ask.vanilla');
    expect(askLineId({ wanted: ['strawberry', 'chocolate'], ordered: false })).toBe('vo.ice-cream.ask.strawberry-chocolate');
    expect(askLineId({ wanted: ['mint', 'vanilla', 'strawberry'], ordered: true })).toBe('vo.ice-cream.ask-order.mint-vanilla-strawberry');
    const two = { wanted: ['strawberry', 'chocolate'] as FlavourId[], ordered: false };
    expect(retryLineId(two, [])).toBe('vo.ice-cream.retry.strawberry');
    expect(retryLineId(two, ['chocolate'])).toBe('vo.ice-cream.retry.strawberry');
    expect(retryLineId(two, ['strawberry'])).toBe('vo.ice-cream.retry.chocolate');
    const ord = { wanted: ['mint', 'vanilla', 'strawberry'] as FlavourId[], ordered: true };
    expect(retryLineId(ord, [])).toBe('vo.ice-cream.order-first.mint');
    expect(retryLineId(ord, ['mint'])).toBe('vo.ice-cream.order-next.vanilla');
    expect(retryLineId(ord, ['mint', 'vanilla'])).toBe('vo.ice-cream.order-next.strawberry');
  });
});
