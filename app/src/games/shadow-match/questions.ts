// Hang tìm bóng questions (Stories 3.5, 3.6), pure: which item the triceratops holds in each question,
// which shadows show and where the right one is. Derived from the round seed and level only, so a round
// is reproducible (resume, tests). One rng draws, in order: the held items, then per question its decoys
// and its correct slot. No retry loops.
import { SHAPE_ITEMS, ladder, type ItemId, type ShadowLevel, type ShapeItem } from '../../content/games/shadow-match.ts';
import { mulberry32, randInt, shuffled } from '../../core/rng.ts';

export interface ShadowQuestion {
  /** The item the triceratops holds (the child drags it). */
  readonly item: ItemId;
  /** The shadows left to right (slot k + 1 = `slot.shadow-<n>-<k+1>`); `shadows[correctSlot] === item`. */
  readonly shadows: readonly ItemId[];
  readonly correctSlot: number;
}

/** The level index, clamped to the ladder (a non-finite level → 0). */
export function levelIndex(level: number): number {
  const l = Math.floor(level);
  return Number.isFinite(l) ? Math.max(0, Math.min(ladder.length - 1, l)) : 0;
}

export function levelOf(level: number): ShadowLevel {
  return ladder[levelIndex(level)]!;
}

const groupSize = (item: ShapeItem): number => SHAPE_ITEMS.filter((o) => o.shapeGroup === item.shapeGroup).length;

/** The items a level may hold: for `same`, those whose group fills a whole row; otherwise every item. */
function heldPool(lv: ShadowLevel): ShapeItem[] {
  return lv.groups === 'same' ? SHAPE_ITEMS.filter((i) => groupSize(i) >= lv.shadows) : [...SHAPE_ITEMS];
}

/**
 * The `n − 1` decoys of `held` (never the held item, all distinct), one shuffle per need:
 *   - `distinct`: the first of a shuffle of the items of other groups;
 *   - `mixed`: the first of a shuffle of the held item's group mates (when it has one), then the first
 *     of a shuffle of the other-group items (so ≥ 2 groups, and one look-alike when one exists);
 *   - `same`: the first of a shuffle of the held item's group mates.
 */
function decoysFor(held: ShapeItem, lv: ShadowLevel, rng: () => number): ItemId[] {
  const n = lv.shadows;
  const others = () => shuffled(SHAPE_ITEMS.filter((o) => o.shapeGroup !== held.shapeGroup), rng);
  const mates = () => shuffled(SHAPE_ITEMS.filter((o) => o.shapeGroup === held.shapeGroup && o.id !== held.id), rng);
  let picked: ShapeItem[];
  if (lv.groups === 'same') picked = mates().slice(0, n - 1);
  else if (lv.groups === 'distinct') picked = others().slice(0, n - 1);
  else picked = [...mates().slice(0, 1), ...others()].slice(0, n - 1);
  return picked.map((o) => o.id);
}

/**
 * The round's questions: `rng = mulberry32(seed)`; the held items are the first `questions` of a
 * Fisher–Yates over the level's pool (distinct in a round). Per question: its decoys (decoysFor); the
 * correct slot is uniform over [0, n) without the previous question's slot; the decoys fill the other
 * slots in their shuffled order. Deterministic.
 */
export function roundQuestions(seed: number, level: number): ShadowQuestion[] {
  const lv = levelOf(level);
  const n = lv.shadows;
  const rng = mulberry32((Number.isFinite(seed) ? Math.floor(seed) : 0) >>> 0);
  const held = shuffled(heldPool(lv), rng).slice(0, lv.questions);
  const out: ShadowQuestion[] = [];
  let prev: number | undefined;
  for (const item of held) {
    const decoys = decoysFor(item, lv, rng);
    let correctSlot: number;
    if (prev === undefined) correctSlot = randInt(rng, n);
    else {
      const k = randInt(rng, n - 1);
      correctSlot = k >= prev ? k + 1 : k;
    }
    const shadows: ItemId[] = [];
    let d = 0;
    for (let k = 0; k < n; k++) shadows.push(k === correctSlot ? item.id : decoys[d++]!);
    out.push({ item: item.id, shadows, correctSlot });
    prev = correctSlot;
  }
  return out;
}
