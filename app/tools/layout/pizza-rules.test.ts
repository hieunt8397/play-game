// Story 3.1: validatePizza and baseRadius against the real layout and atlas, with a failing case per rule.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { screen } from '../../src/content/games/pizza.ts';
import type { Point, ScreenLayout } from '../../src/content/layout-types.ts';
import { baseRadius } from '../../src/games/pizza/geometry.ts';
import { pizzaLimits, validatePizza, type AtlasJsonLike } from './rules.ts';

const APP = join(import.meta.dirname, '..', '..');
/** The layout with writable records (each test breaks one rule). */
type EditableLayout = Omit<ScreenLayout, 'anchors' | 'slots' | 'hits'> & { anchors: Record<string, Point>; slots: Record<string, Point>; hits: Record<string, Point[]> };
const realLayout = (): EditableLayout => JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', 'pizza.layout.json'), 'utf8')) as EditableLayout;
const realAtlas = (): AtlasJsonLike & { frames: Record<string, { spriteSourceSize: { x: number; y: number; w: number; h: number } }> } =>
  JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', 'pizza.json'), 'utf8'));
const limits = pizzaLimits(screen);

describe('validatePizza (Story 3.1)', () => {
  it('the real layout and atlas pass', () => {
    expect(validatePizza(realLayout(), limits, realAtlas())).toEqual([]);
  });

  it('baseRadius: the farthest spot from anchor.base plus half a placed slice; 0 without the anchor', () => {
    const l = realLayout();
    const c = l.anchors.base!;
    const far = Math.max(...screen.slots.filter((s) => s.startsWith('base-')).map((s) => Math.hypot(l.slots[s]!.x - c.x, l.slots[s]!.y - c.y)));
    expect(baseRadius(l)).toBeCloseTo(far + 30, 9);
    expect(baseRadius({ anchors: {}, slots: l.slots })).toBe(0);
  });

  it('required ids and frames are named', () => {
    const l = realLayout();
    delete l.slots['base-8'];
    delete l.anchors.oven;
    const atlas = realAtlas();
    delete atlas.frames['fox/eat/02'];
    const p = validatePizza(l, limits, atlas);
    expect(p).toContain('slot "base-8": missing');
    expect(p).toContain('anchor "oven": missing');
    expect(p).toContain('atlas "pizza": frame "fox/eat/02" is missing');
  });

  it('lower third: base, bowl slots and the fox plate', () => {
    const l = realLayout();
    l.anchors.base = { ...l.anchors.base!, y: 480 };
    l.slots['fox-plate'] = { x: 512, y: 660 };
    const p = validatePizza(l, limits);
    expect(p.some((m) => m.startsWith('anchor "base": y 480 is outside the lower third'))).toBe(true);
    expect(p.some((m) => m.startsWith('slot "fox-plate": y 660 is outside the lower third'))).toBe(true);
  });

  it('slots inside the inset rect and clear of the Hud keep-out zones', () => {
    const l = realLayout();
    l.slots['bowl-sausage'] = { x: 40, y: 560 };
    l.slots['base-1'] = { x: 950, y: 150 };
    const p = validatePizza(l, limits);
    expect(p.some((m) => m.startsWith('slot "bowl-sausage": (40, 560) is outside the interactive rect'))).toBe(true);
    expect(p).toContain('slot "base-1": its item circle reaches into a Home/Speaker keep-out zone');
  });

  it('base spots at least pizzaPlacedSlicePx apart', () => {
    const l = realLayout();
    l.slots['base-2'] = { x: l.slots['base-1']!.x + 20, y: l.slots['base-1']!.y };
    expect(validatePizza(l, limits).some((m) => m.startsWith('slots "base-1" and "base-2":'))).toBe(true);
  });

  it('gaps: bowl to base, bowl to bowl, oven to bowls and base', () => {
    const l = realLayout();
    l.slots['bowl-sausage'] = { x: l.slots['bowl-mushroom']!.x - 50, y: l.slots['bowl-mushroom']!.y };
    const p = validatePizza(l, limits);
    expect(p.some((m) => m.startsWith('slots "bowl-sausage" and "bowl-mushroom":'))).toBe(true);
    expect(p.some((m) => m.startsWith('slot "bowl-sausage":') && m.includes('from anchor "base"'))).toBe(true);
    const l2 = realLayout();
    const dx = 120;
    l2.hits.oven = l2.hits.oven!.map((q) => ({ x: q.x - dx * 2, y: q.y }));
    const p2 = validatePizza(l2, limits);
    expect(p2.some((m) => m.startsWith('hit "oven":') && m.includes('slot "bowl-mushroom"'))).toBe(true);
  });

  it('oven: hit min width, inside the rect, right of the row, frame width within the tolerance', () => {
    const l = realLayout();
    const o = l.hits.oven!;
    const cx = o.reduce((a, q) => a + q.x, 0) / o.length;
    l.hits.oven = o.map((q) => ({ x: cx + (q.x - cx) * 0.2, y: q.y }));
    l.anchors.oven = { x: 100, y: l.anchors.oven!.y };
    const atlas = realAtlas();
    atlas.frames['oven/rest/00']!.spriteSourceSize.w = 300;
    const p = validatePizza(l, limits, atlas);
    expect(p.some((m) => m.startsWith('hit "oven": minimum width'))).toBe(true);
    expect(p.some((m) => m.startsWith('anchor "oven": x 100 is not right of'))).toBe(true);
    expect(p).toContain('frame "oven/rest/00": trimmed width 150 is not 200 ± 30');
    const l2 = realLayout();
    l2.hits.oven = l2.hits.oven!.map((q) => ({ x: q.x + 100, y: q.y }));
    expect(validatePizza(l2, limits).some((m) => m.startsWith('hit "oven":') && m.includes('outside the interactive rect'))).toBe(true);
  });

  it('fox centre-back and tall enough; toppings wide enough', () => {
    const l = realLayout();
    l.anchors.fox = { x: 300, y: 600 };
    const atlas = realAtlas();
    atlas.frames['fox/idle/00']!.spriteSourceSize.h = 300;
    atlas.frames['topping-sausage/idle/00']!.spriteSourceSize.w = 100;
    const p = validatePizza(l, limits, atlas);
    expect(p.some((m) => m.startsWith('anchor "fox":') && m.includes('from the centre'))).toBe(true);
    expect(p.some((m) => m.startsWith('anchor "fox":') && m.includes('not behind the base'))).toBe(true);
    expect(p).toContain('frame "fox/idle/00": trimmed height 150 is under 220');
    expect(p).toContain('frame "topping-sausage/idle/00": trimmed width 50 is under 90');
  });
});

describe('validatePizza (Story 3.2)', () => {
  it('the third bowl: slot and anchor "bowl-pepper" and every bowl frame are required, named', () => {
    const l = realLayout();
    delete l.slots['bowl-pepper'];
    delete l.anchors['bowl-pepper'];
    const atlas = realAtlas();
    delete atlas.frames['bowl-pepper/idle/00'];
    delete atlas.frames['topping-pepper/idle/00'];
    const p = validatePizza(l, limits, atlas);
    expect(p).toContain('slot "bowl-pepper": missing');
    expect(p).toContain('anchor "bowl-pepper": missing');
    expect(p).toContain('atlas "pizza": frame "bowl-pepper/idle/00" is missing');
    expect(p).toContain('atlas "pizza": frame "topping-pepper/idle/00" is missing');
  });

  it('the row: pepper bowl, sausage bowl, base, mushroom bowl, oven (left to right)', () => {
    const l = realLayout();
    const xs = [l.slots['bowl-pepper']!.x, l.slots['bowl-sausage']!.x, l.anchors.base!.x, l.slots['bowl-mushroom']!.x, l.anchors.oven!.x];
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it('the pepper bowl obeys the bowl gaps like the others', () => {
    const l = realLayout();
    l.slots['bowl-pepper'] = { x: l.slots['bowl-sausage']!.x - 60, y: l.slots['bowl-sausage']!.y };
    expect(validatePizza(l, limits).some((m) => m.startsWith('slots "bowl-sausage" and "bowl-pepper":'))).toBe(true);
  });
});
