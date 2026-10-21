import { describe, expect, it } from 'vitest';
import { ATLASES, BACKGROUNDS } from '../assets';
import { VOICE_LINES } from '../voice-lines';
import { BASE_SLOTS, SFX, TOPPINGS, assets, ladder, screen } from './pizza';

describe('pizza content (Stories 3.1–3.2)', () => {
  it('the ladder: 1–3 → 2–4 → 3–5 slices, the third topping at the top level', () => {
    expect(ladder).toEqual([
      { id: 'count-1-3', toppings: 2, minSlices: 1, maxSlices: 3, questions: 3 },
      { id: 'count-2-4', toppings: 2, minSlices: 2, maxSlices: 4, questions: 4 },
      { id: 'count-3-5', toppings: 3, minSlices: 3, maxSlices: 5, questions: 5 },
    ]);
    expect(TOPPINGS).toEqual(['sausage', 'mushroom', 'pepper']);
  });

  it('ladder rules: 3 levels; slice bounds never decrease; every level raises maxSlices; 3/4/5 questions', () => {
    expect(ladder).toHaveLength(3);
    expect(ladder.map((l) => l.questions)).toEqual([3, 4, 5]);
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i]!.minSlices).toBeGreaterThanOrEqual(ladder[i - 1]!.minSlices);
      expect(ladder[i]!.maxSlices).toBeGreaterThan(ladder[i - 1]!.maxSlices);
    }
  });

  it.each(ladder.map((l, i) => [i, l] as const))('level %i keeps the slice and topping limits', (_i, l) => {
    expect(l.minSlices).toBeGreaterThanOrEqual(1);
    expect(l.maxSlices).toBeLessThanOrEqual(Math.min(5, BASE_SLOTS));
    expect(l.minSlices).toBeLessThanOrEqual(l.maxSlices);
    expect(l.toppings).toBeLessThanOrEqual(TOPPINGS.length);
    // fallbackRound and the candidate draw need a non-empty pool of ≥ 2 toppings and room to ask each.
    expect(l.toppings).toBeGreaterThanOrEqual(2);
    expect(l.questions).toBeGreaterThanOrEqual(l.toppings);
  });

  it('loads its own atlas, plate and every pizza line and sfx', () => {
    expect(assets.atlases).toEqual([ATLASES.pizza]);
    expect(assets.images).toEqual([BACKGROUNDS.pizza]);
    const vo = VOICE_LINES.map((l) => l.id).filter((id) => id.startsWith('vo.pizza.'));
    expect(vo).toHaveLength(30);
    expect(assets.audio).toEqual([...vo, ...Object.values(SFX)]);
  });

  it('requires the 8 base spots, a bowl per topping, the fox plate and every frame', () => {
    expect(screen.slots).toEqual([
      'base-1', 'base-2', 'base-3', 'base-4', 'base-5', 'base-6', 'base-7', 'base-8',
      'bowl-sausage', 'bowl-mushroom', 'bowl-pepper', 'fox-plate',
    ]);
    expect(screen.anchors).toEqual(['fox', 'base', 'oven', 'bowl-sausage', 'bowl-mushroom', 'bowl-pepper']);
    expect(screen.hits).toEqual(['fox', 'oven', 'counter']);
    expect(screen.frames).toContain('oven/baking/00');
    expect(screen.frames).toContain('topping-pepper/idle/00');
    for (const t of TOPPINGS) expect(screen.frames).toContain(`bowl-${t}/idle/00`);
    expect(screen.frames).toHaveLength(9 + 3 + 2 + 3 + 3);
  });
});
