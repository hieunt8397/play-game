// Thay đồ cho Shiba content (Story 8.2): a yard game (content/home.ts corner `wardrobe`). A wardrobe room
// (`bg.dress-up`, tools/render/blender/build_dress_up.py): the chibi Shiba (the island's own dog, cute.chibi) stands
// beside a standing mirror, and an open wardrobe holds 4 hats, 3 glasses and 4 shirts. A tap on an item puts it on
// Shiba (one per slot: a new hat replaces the old one), who turns to the mirror and reacts; a tap on a worn item
// takes it off. The outfit is saved (core/progress-store › setOutfit) and worn by the map guide and the ice-cream
// Shiba too (core/outfit-layers). No judging: there is no right outfit.
//   - every item is an overlay sprite, never a pre-composited Shiba: `shiba-<item>/<state>/<nn>` is rendered alone
//     (tools/render/blender/outfit.py) for each `shiba/<state>/<nn>` frame of a screen (map, ice-cream, dress-up),
//     same camera, same full frame, Shiba's own meshes as holdouts; the runtime draws it on Shiba's anchor and origin;
//   - the wardrobe icons are `item-<id>/idle/00`, drawn where they were rendered (their tap circles come from the
//     trimmed frame: tools/layout/rules.ts › validateDressUp);
//   - hits: `shiba`, `mirror` (both tappable: they react) and `mirror-glass` (unpadded: the reflection's mask);
//   - anchors: `shiba` (Shiba's ground pivot) and `mirror` (where the reflection's ground pivot goes in the glass).
import { ATLASES, BACKGROUNDS } from '../assets.ts';
import type { ReactionSet } from '../../core/reactions.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

/** The outfit slots, in draw order (back to front over Shiba): a shirt, then glasses, then a hat. */
export const SLOTS = ['shirt', 'glasses', 'hat'] as const;
export type OutfitSlot = (typeof SLOTS)[number];

/** The eleven items (parent decision 2026-10-26), each in one slot, in wardrobe order (shelf by shelf). */
export const OUTFIT_ITEMS = [
  { id: 'party-hat', slot: 'hat' },
  { id: 'cowboy-hat', slot: 'hat' },
  { id: 'crown', slot: 'hat' },
  { id: 'beanie', slot: 'hat' },
  { id: 'round-glasses', slot: 'glasses' },
  { id: 'heart-glasses', slot: 'glasses' },
  { id: 'star-glasses', slot: 'glasses' },
  { id: 'striped-tee', slot: 'shirt' },
  { id: 'raincoat', slot: 'shirt' },
  { id: 'heart-jumper', slot: 'shirt' },
  { id: 'flower-shirt', slot: 'shirt' },
] as const satisfies readonly { id: string; slot: OutfitSlot }[];
export type OutfitItemId = (typeof OUTFIT_ITEMS)[number]['id'];
export const OUTFIT_ITEM_IDS: readonly OutfitItemId[] = OUTFIT_ITEMS.map((i) => i.id);

/** What Shiba wears: at most one item per slot (an absent slot is bare). */
export type Outfit = { readonly [S in OutfitSlot]?: OutfitItemId };

/** The slot of an item id; undefined for an unknown id. */
export function itemSlot(id: string): OutfitSlot | undefined {
  return OUTFIT_ITEMS.find((i) => i.id === id)?.slot;
}

export function isOutfitItem(id: string): id is OutfitItemId {
  return itemSlot(id) !== undefined;
}

/** Shiba's states on the wardrobe screen: standing, a happy hop/wag (2 frames) and the turn to the mirror (2 frames). */
export const SHIBA_STATES = { idle: 1, happy: 2, turn: 2 } as const;
export type ShibaState = keyof typeof SHIBA_STATES;
export const shibaFrame = (state: ShibaState, n = 0): string => `shiba/${state}/${String(n).padStart(2, '0')}`;
export const SHIBA_FRAMES: readonly string[] = (Object.keys(SHIBA_STATES) as ShibaState[]).flatMap((s) =>
  Array.from({ length: SHIBA_STATES[s] }, (_, n) => shibaFrame(s, n)),
);

/** The item's overlay frame over a Shiba frame of any screen: `shiba/<state>/<nn>` → `shiba-<item>/<state>/<nn>`. */
export function overlayFrame(baseFrame: string, itemId: string): string {
  const cut = baseFrame.indexOf('/');
  return cut < 0 ? `${baseFrame}-${itemId}` : `${baseFrame.slice(0, cut)}-${itemId}${baseFrame.slice(cut)}`;
}

/** An item's tap circle radius from its icon's drawn half size (never under `min`, the half of ui.dressUpItemHitPx). */
export function itemHitRadius(half: number, min: number): number {
  return Math.max(half, min);
}

/** The wardrobe icon of an item (drawn where it was rendered, on its shelf). */
export const iconFrame = (id: string): string => `item-${id}/idle/00`;

export const SHIBA = 'shiba';
export const HITS = { shiba: 'shiba', mirror: 'mirror', mirrorGlass: 'mirror-glass' } as const;
export const ANCHORS = { shiba: 'shiba', mirror: 'mirror' } as const;

/**
 * Reactions on wear (core/reactions: random, never the same twice in a row): turn to the mirror and smile, a happy
 * hop with a tail wag, a giggle and a wiggle. A take-off is always the small shake and the soft pop.
 */
export const WEAR_REACTIONS = ['mirror-smile', 'hop-wag', 'giggle-wiggle'] as const;
export type WearReaction = (typeof WEAR_REACTIONS)[number];
export const REACTIONS: ReactionSet = { correct: WEAR_REACTIONS, choseOther: [] };

export function isWearReaction(id: string | undefined): id is WearReaction {
  return id !== undefined && (WEAR_REACTIONS as readonly string[]).includes(id);
}

/** The invitation as a fresh wardrobe opens (the child's name, Story 5.2). */
export const PROMPT_LINE = 'vo.dress-up.prompt';
export const PARENT_LINE = 'vo.dress-up.parent.1';
/** One short name line per item, said on wear before the round completes (no praise). */
export const nameLine = (id: string): string => `vo.dress-up.name.${id}`;

/** Sounds: the soft pop of a take-off (our own recipe) and reused ones (the bedtime giggle and rustle, the happy chime). */
export const SFX = {
  pop: 'sfx.dress-up.pop',
  wear: 'sfx.bedtime.blanket',
  giggle: 'sfx.bedtime.giggle',
  hop: 'sfx.shell.happy',
} as const;

/** Every overlay frame Shiba's frames need on a screen (every item over every base frame). */
export function overlayFrames(baseFrames: readonly string[]): string[] {
  return baseFrames.flatMap((f) => OUTFIT_ITEM_IDS.map((id) => overlayFrame(f, id)));
}

/** What `dress-up.layout.json` and `atlas.dress-up` must hold. */
export const DRESS_UP_SCREEN: ScreenRequirements = {
  anchors: [ANCHORS.shiba, ANCHORS.mirror],
  hits: [HITS.shiba, HITS.mirror, HITS.mirrorGlass],
  slots: [],
  frames: [...SHIBA_FRAMES, ...overlayFrames(SHIBA_FRAMES), ...OUTFIT_ITEM_IDS.map(iconFrame)],
};
export const screen = DRESS_UP_SCREEN;

export const assets: GameAssets = {
  atlases: [ATLASES['dress-up']],
  images: [BACKGROUNDS['dress-up']],
  audio: [PROMPT_LINE, PARENT_LINE, ...OUTFIT_ITEM_IDS.map(nameLine), ...Object.values(SFX)],
};
