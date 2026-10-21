import { describe, expect, it } from 'vitest';
import { TOPPINGS, ladder } from '../../content/games/pizza';
import { VOICE_LINES } from '../../content/voice-lines';
import { BAKE_LINE, askLineId, countLineIds, enoughLineId, retryLineId } from './lines';
import { allQuestions } from './questions';

const ids = new Set<string>(VOICE_LINES.map((l) => l.id));

describe('pizza line ids (Stories 3.1–3.2)', () => {
  it('every reachable (topping, count) of all 3 levels has its ask, retry, enough and count lines', () => {
    expect(ladder).toHaveLength(3);
    for (const l of ladder) {
      for (const q of allQuestions(l)) {
        expect(ids.has(askLineId(q)), askLineId(q)).toBe(true);
        expect(ids.has(retryLineId(q)), retryLineId(q)).toBe(true);
        expect(ids.has(enoughLineId(q.count)), enoughLineId(q.count)).toBe(true);
        for (const c of countLineIds(q.count)) expect(ids.has(c), c).toBe(true);
      }
    }
    expect(ids.has(BAKE_LINE)).toBe(true);
  });

  it('every combination: topping × 1–5 ask, every retry, enough.1–5 and count.1–5', () => {
    for (const topping of TOPPINGS) {
      for (let count = 1; count <= 5; count++) expect(ids.has(askLineId({ topping, count })), `${topping}.${count}`).toBe(true);
      expect(ids.has(retryLineId({ topping })), topping).toBe(true);
    }
    for (let n = 1; n <= 5; n++) expect(ids.has(enoughLineId(n)), `enough.${n}`).toBe(true);
    for (const c of countLineIds(5)) expect(ids.has(c), c).toBe(true);
    expect(VOICE_LINES.filter((l) => l.id.startsWith('vo.pizza.'))).toHaveLength(3 * 5 + 3 + 5 + 5 + 1 + 1);
  });

  it('id shapes', () => {
    expect(askLineId({ topping: 'sausage', count: 3 })).toBe('vo.pizza.ask.sausage.3');
    expect(askLineId({ topping: 'pepper', count: 5 })).toBe('vo.pizza.ask.pepper.5');
    expect(retryLineId({ topping: 'mushroom' })).toBe('vo.pizza.retry.mushroom');
    expect(enoughLineId(2)).toBe('vo.pizza.enough.2');
    expect(countLineIds(3)).toEqual(['vo.pizza.count.1', 'vo.pizza.count.2', 'vo.pizza.count.3']);
  });
});
