import { describe, expect, it } from 'vitest';
import { ATLASES, BACKGROUNDS } from '../assets';
import { AUDIO_CATALOG } from '../audio-catalog';
import { VOICE_LINES } from '../voice-lines';
import { FORBIDDEN_ITEM, ITEM_IDS, SFX, SHADOW_COUNTS, SHAPE_ITEMS, assets, ladder, screen, shadowSlots } from './shadow-match';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Split so this file itself never trips the no-meat-eater source scan (it covers src/content).
const MEAT_EATER = new RegExp(['t-', '?rex'].join(''), 'i');

const groupSize = (g: string): number => SHAPE_ITEMS.filter((i) => i.shapeGroup === g).length;

describe('shadow-match content (Stories 3.5, 3.6)', () => {
  it('the catalogue: dog, cow, horse, donkey, stag (quadruped), car (car), truck, tractor (truck)', () => {
    expect(SHAPE_ITEMS.map((i) => [i.id, i.shapeGroup])).toEqual([
      ['dog', 'quadruped'],
      ['cow', 'quadruped'],
      ['horse', 'quadruped'],
      ['donkey', 'quadruped'],
      ['stag', 'quadruped'],
      ['car', 'car'],
      ['truck', 'truck'],
      ['tractor', 'truck'],
    ]);
    expect(ITEM_IDS).toEqual(['dog', 'cow', 'horse', 'donkey', 'stag', 'car', 'truck', 'tractor']);
  });

  it('the ladder: 2 / 3 / 4 shadows, 4 questions each, groups distinct → mixed → same', () => {
    expect(ladder).toEqual([
      { id: 'shadows-2', shadows: 2, questions: 4, groups: 'distinct' },
      { id: 'shadows-3', shadows: 3, questions: 4, groups: 'mixed' },
      { id: 'shadows-4', shadows: 4, questions: 4, groups: 'same' },
    ]);
    expect(ladder).toHaveLength(3);
    expect(ladder.map((l) => l.shadows)).toEqual([2, 3, 4]);
    expect(SHADOW_COUNTS).toEqual([2, 3, 4]);
  });

  it.each(ladder.map((l, i) => [i, l] as const))('level %i: its row is emitted, enough held items and decoys', (_i, l) => {
    expect(l.questions).toBe(4);
    expect(SHADOW_COUNTS as readonly number[]).toContain(l.shadows);
    if (l.groups === 'same') {
      // Enough held items whose group can fill a whole row.
      expect(SHAPE_ITEMS.filter((i) => groupSize(i.shapeGroup) >= l.shadows).length).toBeGreaterThanOrEqual(l.questions);
    } else {
      expect(SHAPE_ITEMS.length).toBeGreaterThanOrEqual(l.questions);
      for (const item of SHAPE_ITEMS) {
        expect(SHAPE_ITEMS.filter((o) => o.shapeGroup !== item.shapeGroup).length, item.id).toBeGreaterThanOrEqual(l.shadows - 1);
      }
    }
  });

  it('every item has non-empty, distinct outline features', () => {
    for (const item of SHAPE_ITEMS) {
      expect(item.features.length, item.id).toBeGreaterThan(0);
      expect(new Set(item.features).size, item.id).toBe(item.features.length);
      for (const f of item.features) expect(f).toMatch(KEBAB);
    }
  });

  it('ids are distinct kebab; no item is a balloon, ball or flower, or a meat-eater', () => {
    expect(new Set(ITEM_IDS).size).toBe(ITEM_IDS.length);
    for (const item of SHAPE_ITEMS) {
      expect(item.id).toMatch(KEBAB);
      for (const text of [item.id, item.askName, item.name]) {
        expect(FORBIDDEN_ITEM.test(text), text).toBe(false);
        expect(MEAT_EATER.test(text), text).toBe(false);
      }
    }
    for (const bad of ['ball', 'balloon', 'flower', 'bóng bay', 'bông', 'hoa', 'Hoa hồng', 'beach-ball', 'Quả bóng!']) expect(FORBIDDEN_ITEM.test(bad), bad).toBe(true);
    // Whole words only: lookalikes pass.
    for (const ok of ['khoai', 'football', 'hoàng', 'baller', 'sunflowerseed', 'Con chó!']) expect(FORBIDDEN_ITEM.test(ok), ok).toBe(false);
  });

  it('the screen: ids and frames generated from SHAPE_ITEMS × SHADOW_COUNTS (8 items, 9 slots)', () => {
    expect(screen.anchors).toEqual(['triceratops', 'triceratops-hand']);
    expect(screen.hits).toEqual(['cave']);
    expect(screen.slots).toEqual(['shadow-2-1', 'shadow-2-2', 'shadow-3-1', 'shadow-3-2', 'shadow-3-3', 'shadow-4-1', 'shadow-4-2', 'shadow-4-3', 'shadow-4-4']);
    expect(shadowSlots(3)).toEqual(['shadow-3-1', 'shadow-3-2', 'shadow-3-3']);
    expect(screen.frames).toEqual([
      'triceratops/idle/00',
      'triceratops/nod/00',
      'triceratops/happy/00',
      'triceratops/happy/01',
      ...ITEM_IDS.flatMap((id) => [`item-${id}/color/00`, `item-${id}/shadow/00`]),
    ]);
  });

  it('loads its one-page atlas, plate, every shadow-match line and SFX (the chirp is a creature sound)', () => {
    expect(assets.atlases).toEqual([ATLASES['shadow-match']]);
    expect(ATLASES['shadow-match'].pages).toBeUndefined();
    expect(assets.images).toEqual([BACKGROUNDS['shadow-match']]);
    const vo = VOICE_LINES.map((l) => l.id).filter((id) => id.startsWith('vo.shadow-match.'));
    expect(vo).toHaveLength(17);
    expect(assets.audio).toEqual([...vo, SFX.snap, SFX.happy, SFX.trikeHappy]);
    expect(AUDIO_CATALOG[SFX.trikeHappy].creature).toBe(true);
    expect(VOICE_LINES.map((l) => l.id)).toEqual(expect.arrayContaining(['vo.shell.invite.shadow-match']));
  });

  it('voice: every catalogue item has exactly one ask and one name line, and no line names an item outside it', () => {
    const ids = VOICE_LINES.map((l) => l.id);
    for (const item of ITEM_IDS) {
      expect(ids.filter((id) => id === `vo.shadow-match.ask.${item}`), item).toHaveLength(1);
      expect(ids.filter((id) => id === `vo.shadow-match.name.${item}`), item).toHaveLength(1);
    }
    const known = new Set<string>(ITEM_IDS);
    for (const id of ids) {
      const m = /^vo\.shadow-match\.(ask|name)\.(.+)$/.exec(id);
      if (m) expect(known.has(m[2]!), id).toBe(true);
    }
  });
});
