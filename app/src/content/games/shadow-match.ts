// Hang tìm bóng content (Stories 3.5, 3.6): the catalogue of animals, fish, vehicles, fruit and kitchen things that wait on the pedestal,
// their shape groups and outline features, the 2 → 3 → 4-shadow ladder, the slot rows the builder must emit, the screen's layout
// ids and frames, the voice and SFX ids, and the assets Map loads while the kart drives here. Data only.
// 2026-10-22: no dinosaur any more — the item stands on a pedestal at the bottom centre (`anchor.item-rest`).
// 2026-10-22 (spec-tim-bong-hinh-that-them-vat): back to the real models (Quaternius, Kenney); 17 more items.
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
  | 'big-rear-wheel'
  // 2026-10-22 (spec-tim-bong-hinh-that-them-vat): the 17 new items' cues (named from the models' outlines).
  | 'bushy-tail'
  | 'fan-tail'
  | 'round-spiky'
  | 'long-bill'
  | 'light-bar'
  | 'side-lockers'
  | 'bin-arm'
  | 'front-shovel'
  | 'round-stem'
  | 'curved'
  | 'leaf-crown'
  | 'pear-shape'
  | 'pointed-tip'
  | 'leafy-top'
  | 'handle-side'
  | 'long-handle'
  | 'cone';

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
 * `askName` is spoken in the ask line ("Xoài ơi, <askName> ở bóng nào?": "bạn chó", "xe cảnh sát", "quả táo"), `name`
 * is the name line after the reveal. Every item has a build_shadow_match.py › ITEM_MODELS row (Quaternius
 * animals and cutefish, Kenney car-kit vehicles and food-kit things, source colours kept). No alpaca: it is
 * an island decoration (spec-2-2). Groups of fewer than 4 (car, kitchen) are never held at the `same` level.
 */
export const SHAPE_ITEMS = [
  { id: 'dog', shapeGroup: 'quadruped', askName: 'bạn chó', name: 'Con chó!', features: ['pointy-ears', 'curled-tail'] },
  { id: 'cow', shapeGroup: 'quadruped', askName: 'bạn bò', name: 'Con bò!', features: ['horns', 'tail-tuft'] },
  { id: 'horse', shapeGroup: 'quadruped', askName: 'bạn ngựa', name: 'Con ngựa!', features: ['mane', 'long-tail'] },
  { id: 'donkey', shapeGroup: 'quadruped', askName: 'bạn lừa', name: 'Con lừa!', features: ['long-ears'] },
  { id: 'stag', shapeGroup: 'quadruped', askName: 'bạn nai', name: 'Con nai!', features: ['antlers'] },
  { id: 'car', shapeGroup: 'car', askName: 'bạn ô tô', name: 'Ô tô!', features: ['low-roof'] },
  { id: 'truck', shapeGroup: 'truck', askName: 'bạn xe tải', name: 'Xe tải!', features: ['cargo-box'] },
  { id: 'tractor', shapeGroup: 'truck', askName: 'bạn máy cày', name: 'Máy cày!', features: ['big-rear-wheel'] },
  // 2026-10-22 (spec-tim-bong-hinh-that-them-vat): 17 more, from the vendored CC0 packs.
  // Dropped under the spec's Fallback (their shadows overlap a group mate's above ui.shadowMaxIoU): bull (cow), taxi (car), ambulance (firetruck). Parent 2026-10-22: shark dropped (the model reads as a generic grey fish).
  { id: 'fox', shapeGroup: 'quadruped', askName: 'bạn cáo', name: 'Con cáo!', features: ['bushy-tail'] },
  { id: 'goldfish', shapeGroup: 'fish', askName: 'bạn cá vàng', name: 'Cá vàng!', features: ['fan-tail'] },
  { id: 'puffer', shapeGroup: 'fish', askName: 'bạn cá nóc', name: 'Cá nóc!', features: ['round-spiky'] },
  { id: 'swordfish', shapeGroup: 'fish', askName: 'bạn cá kiếm', name: 'Cá kiếm!', features: ['long-bill'] },
  { id: 'police', shapeGroup: 'car', askName: 'xe cảnh sát', name: 'Xe cảnh sát!', features: ['light-bar'] },
  { id: 'firetruck', shapeGroup: 'truck', askName: 'xe cứu hỏa', name: 'Xe cứu hỏa!', features: ['side-lockers'] },
  { id: 'garbage-truck', shapeGroup: 'truck', askName: 'xe chở rác', name: 'Xe chở rác!', features: ['bin-arm'] },
  { id: 'excavator', shapeGroup: 'truck', askName: 'máy xúc', name: 'Máy xúc!', features: ['front-shovel'] },
  { id: 'apple', shapeGroup: 'fruit', askName: 'quả táo', name: 'Quả táo!', features: ['round-stem'] },
  { id: 'banana', shapeGroup: 'fruit', askName: 'quả chuối', name: 'Quả chuối!', features: ['curved'] },
  { id: 'pineapple', shapeGroup: 'fruit', askName: 'quả dứa', name: 'Quả dứa!', features: ['leaf-crown'] },
  { id: 'pear', shapeGroup: 'fruit', askName: 'quả lê', name: 'Quả lê!', features: ['pear-shape'] },
  { id: 'strawberry', shapeGroup: 'fruit', askName: 'quả dâu tây', name: 'Quả dâu tây!', features: ['pointed-tip'] },
  { id: 'carrot', shapeGroup: 'fruit', askName: 'củ cà rốt', name: 'Củ cà rốt!', features: ['leafy-top'] },
  { id: 'mug', shapeGroup: 'kitchen', askName: 'cái cốc', name: 'Cái cốc!', features: ['handle-side'] },
  { id: 'pan', shapeGroup: 'kitchen', askName: 'cái chảo', name: 'Cái chảo!', features: ['long-handle'] },
  { id: 'ice-cream', shapeGroup: 'kitchen', askName: 'cây kem', name: 'Cây kem!', features: ['cone'] },
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

/**
 * The pedestal's reference spot for the screen rules (`anchor.item-rest`): the centre of a full-height held
 * item standing on it. Every held item is drawn with its bottom on PEDESTAL_ANCHOR.
 */
export const REST_ANCHOR = 'item-rest';
/** The centre of the pedestal's top surface (`anchor.pedestal-top`): the held item stands on it. */
export const PEDESTAL_ANCHOR = 'pedestal-top';
/** The pedestal (`hit.pedestal`): a tap on it bounces the waiting item (Story 5.4 reaction). */
export const PEDESTAL_HIT = 'pedestal';
/** The cave's inner wall (`hit.cave`): bright, never dark (validated on the render). */
export const CAVE_HIT = 'cave';
/** Shadow `k` (1-based) of the `n`-shadow row (`slot.shadow-<n>-<k>`). */
export const shadowSlot = (n: number, k: number): string => `shadow-${n}-${k}`;
/** Every slot id of the `n`-shadow row, k = 1 first. */
export const shadowSlots = (n: number): string[] => Array.from({ length: n }, (_, k) => shadowSlot(n, k + 1));

/** The item's sprite object (`sprite.item-<id>`; frames `item-<id>/{color,shadow}/00`). */
export const itemObject = (id: ItemId): string => `item-${id}`;
export const itemFrames = (id: ItemId) => ({ color: `${itemObject(id)}/color/00`, shadow: `${itemObject(id)}/shadow/00` }) as const;

/** What `shadow-match.layout.json` and `atlas.shadow-match` must hold (generated from SHAPE_ITEMS × SHADOW_COUNTS). */
export const screen: ScreenRequirements = {
  anchors: [REST_ANCHOR, PEDESTAL_ANCHOR],
  hits: [CAVE_HIT, PEDESTAL_HIT],
  slots: SHADOW_COUNTS.flatMap((n) => shadowSlots(n)),
  frames: ITEM_IDS.flatMap((id) => Object.values(itemFrames(id))),
};

export const SFX = {
  snap: 'sfx.shadow-match.snap',
  happy: 'sfx.shadow-match.happy',
} as const;

export const assets: GameAssets = {
  atlases: [ATLASES['shadow-match']],
  images: [BACKGROUNDS['shadow-match']],
  audio: [...VOICE_LINES.map((l) => l.id).filter((id) => id.startsWith('vo.shadow-match.')), ...Object.values(SFX)],
};
