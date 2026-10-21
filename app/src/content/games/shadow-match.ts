// Hang tìm bóng content (Stories 3.5, 3.6): the catalogue of animals and vehicles the triceratops holds,
// their shape groups and outline features, the 2 → 3 → 4-shadow ladder, the slot rows the builder must emit, the screen's layout
// ids and frames, the voice and SFX ids, and the assets Map loads while the kart drives here. Data only.
// Never a balloon, ball or flower ("bóng" / "bông" would clash with "bóng" = shadow): FORBIDDEN_ITEM.
import { ATLASES, BACKGROUNDS } from '../assets.ts';
import { VOICE_LINES } from '../voice-lines.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

/**
 * Story 3.6: the outline cues that tell items apart in silhouette (never a colour). Every item has at
 * least one feature no other item of its shape group has (tools/lint/validate-content.ts › featureProblems).
 */
export type Feature =
  | 'pointy-ears'
  | 'curled-tail'
  | 'horns'
  | 'tail-tuft'
  | 'mane'
  | 'long-tail'
  | 'long-ears'
  | 'antlers'
  | 'low-roof'
  | 'cargo-box'
  | 'big-rear-wheel';

interface ShapeItemDef {
  readonly id: string;
  readonly shapeGroup: string;
  readonly askName: string;
  readonly name: string;
  readonly features: readonly Feature[];
}

/**
 * The play items. `shapeGroup`: items of one group share a silhouette family (a level with `groups:
 * 'distinct'` never shows two of one group). `features`: the item's outline cues (Story 3.6).
 * `askName` is spoken in the ask line ("Xoài ơi, bạn <askName> ở bóng nào?"), `name` is the name line
 * after the reveal. Every model exists in `assets/` (build_shadow_match.py › ITEM_MODELS); there is no
 * cat or bird model, so the dog stands in. No alpaca: it is an island decoration (spec-2-2).
 */
export const SHAPE_ITEMS = [
  { id: 'dog', shapeGroup: 'quadruped', askName: 'chó', name: 'Con chó!', features: ['pointy-ears', 'curled-tail'] },
  { id: 'cow', shapeGroup: 'quadruped', askName: 'bò', name: 'Con bò!', features: ['horns', 'tail-tuft'] },
  { id: 'horse', shapeGroup: 'quadruped', askName: 'ngựa', name: 'Con ngựa!', features: ['mane', 'long-tail'] },
  { id: 'donkey', shapeGroup: 'quadruped', askName: 'lừa', name: 'Con lừa!', features: ['long-ears'] },
  { id: 'stag', shapeGroup: 'quadruped', askName: 'nai', name: 'Con nai!', features: ['antlers'] },
  { id: 'car', shapeGroup: 'car', askName: 'ô tô', name: 'Ô tô!', features: ['low-roof'] },
  { id: 'truck', shapeGroup: 'truck', askName: 'xe tải', name: 'Xe tải!', features: ['cargo-box'] },
  { id: 'tractor', shapeGroup: 'truck', askName: 'máy cày', name: 'Máy cày!', features: ['big-rear-wheel'] },
] as const satisfies readonly ShapeItemDef[];

export type ShapeItem = (typeof SHAPE_ITEMS)[number];
export type ItemId = ShapeItem['id'];
export type ShapeGroup = ShapeItem['shapeGroup'];

/** Every item id, in catalogue order. */
export const ITEM_IDS: readonly ItemId[] = SHAPE_ITEMS.map((i) => i.id);

/**
 * An item or its spoken names must never match this (UX: no balloons, balls or flowers). Whole words
 * only (any non-letter, e.g. a kebab "-", is a boundary), so "khoai" or "football" do not match.
 */
export const FORBIDDEN_ITEM = /(?<![\p{L}\p{M}])(?:balloons?|balls?|flowers?|bóng|bông|hoa)(?![\p{L}\p{M}])/iu;

export interface ShadowLevel {
  readonly id: string;
  /** Shadows shown per question (a SHADOW_COUNTS row). */
  readonly shadows: 2 | 3 | 4;
  /** Questions per round. */
  readonly questions: 4;
  /**
   * How the decoys relate to the held item (games/shadow-match/questions.ts): `distinct` = every decoy
   * from another shape group; `mixed` = one look-alike from the held item's group when it has one, the
   * rest from other groups; `same` = every decoy from the held item's group (the held items come from
   * groups with ≥ `shadows` members).
   */
  readonly groups: 'distinct' | 'mixed' | 'same';
}

/** Story 3.6: 2 shadows of different groups → 3 shadows of ≥ 2 groups → 4 shadows of one group. */
export const ladder: readonly ShadowLevel[] = [
  { id: 'shadows-2', shadows: 2, questions: 4, groups: 'distinct' },
  { id: 'shadows-3', shadows: 3, questions: 4, groups: 'mixed' },
  { id: 'shadows-4', shadows: 4, questions: 4, groups: 'same' },
];

/** The slot rows the builder emits (`slot.shadow-<n>-<k>`, one row per shadow count). */
export const SHADOW_COUNTS = [2, 3, 4] as const;
export type ShadowCount = (typeof SHADOW_COUNTS)[number];

/** The triceratops' ground pivot (`anchor.triceratops`). */
export const TRIKE_ANCHOR = 'triceratops';
/** Where the held item sits, in front of the triceratops' feet (`anchor.triceratops-hand`). */
export const HAND_ANCHOR = 'triceratops-hand';
/** The cave's inner wall (`hit.cave`): bright, never dark (validated on the render). */
export const CAVE_HIT = 'cave';
/** Shadow `k` (1-based) of the `n`-shadow row (`slot.shadow-<n>-<k>`). */
export const shadowSlot = (n: number, k: number): string => `shadow-${n}-${k}`;
/** Every slot id of the `n`-shadow row, k = 1 first. */
export const shadowSlots = (n: number): string[] => Array.from({ length: n }, (_, k) => shadowSlot(n, k + 1));

/** The item's sprite object (`sprite.item-<id>`; frames `item-<id>/{color,shadow}/00`). */
export const itemObject = (id: ItemId): string => `item-${id}`;
export const itemFrames = (id: ItemId) => ({ color: `${itemObject(id)}/color/00`, shadow: `${itemObject(id)}/shadow/00` }) as const;

export const TRIKE_HAPPY_FRAMES = 2;
const nn = (i: number): string => String(i).padStart(2, '0');
export const trikeFrames = {
  idle: 'triceratops/idle/00',
  nod: 'triceratops/nod/00',
  happy: Array.from({ length: TRIKE_HAPPY_FRAMES }, (_, i) => `triceratops/happy/${nn(i)}`),
} as const;

/** What `shadow-match.layout.json` and `atlas.shadow-match` must hold (generated from SHAPE_ITEMS × SHADOW_COUNTS). */
export const screen: ScreenRequirements = {
  anchors: [TRIKE_ANCHOR, HAND_ANCHOR],
  hits: [CAVE_HIT],
  slots: SHADOW_COUNTS.flatMap((n) => shadowSlots(n)),
  frames: [trikeFrames.idle, trikeFrames.nod, ...trikeFrames.happy, ...ITEM_IDS.flatMap((id) => Object.values(itemFrames(id)))],
};

export const SFX = {
  snap: 'sfx.shadow-match.snap',
  happy: 'sfx.shadow-match.happy',
  /** The triceratops' soft chirp after each reveal (catalog `creature: true`). */
  trikeHappy: 'sfx.shadow-match.trike.happy',
} as const;

export const assets: GameAssets = {
  atlases: [ATLASES['shadow-match']],
  images: [BACKGROUNDS['shadow-match']],
  audio: [...VOICE_LINES.map((l) => l.id).filter((id) => id.startsWith('vo.shadow-match.')), ...Object.values(SFX)],
};
