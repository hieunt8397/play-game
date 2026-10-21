// Câu cá content (Stories 4.3, 4.4): the fish colours, sizes and patterns, the difficulty ladder, the pond's
// layout ids and atlas frames, the voice and SFX ids and the assets Map loads while the kart drives
// here. Data only.
import { ATLASES, BACKGROUNDS } from '../assets.ts';
import { VOICE_LINES } from '../voice-lines.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

export const FISH_COLORS = ['yellow', 'orange', 'blue'] as const;
export type FishColor = (typeof FISH_COLORS)[number];
export const FISH_SIZES = ['small', 'big'] as const;
export type FishSize = (typeof FISH_SIZES)[number];

/** Each colour also differs in shape, so a fish never relies on hue alone. */
export const FISH_PATTERN: Readonly<Record<FishColor, 'stripes' | 'dots' | 'long-fins'>> = {
  yellow: 'stripes',
  orange: 'dots',
  blue: 'long-fins',
};

export interface FishSpec {
  readonly color: FishColor;
  readonly size: FishSize;
}

export interface FishingLevel {
  readonly id: string;
  /** What the questions ask for (Story 4.4 adds 'size' and 'mixed'). */
  readonly ask: 'color' | 'size' | 'mixed';
  /** Fish in the pond per question. */
  readonly fish: 3 | 4 | 5;
  /** Questions per round. */
  readonly questions: 3 | 4 | 5;
}

/** Story 4.4: 3 fish by colour → 3 fish by size → 4 fish mixed → 5 fish mixed. */
export const ladder: readonly FishingLevel[] = [
  { id: 'color-3', ask: 'color', fish: 3, questions: 3 },
  { id: 'size-3', ask: 'size', fish: 3, questions: 4 },
  { id: 'mixed-4', ask: 'mixed', fish: 4, questions: 4 },
  { id: 'mixed-5', ask: 'mixed', fish: 5, questions: 5 },
];

/** Story 4.4: a size request never repeats more than this many times in a row. */
export const SIZE_ASK_RUN_MAX = 2;

/** The pond fits this many big fish (the capacity test), so Story 4.4 needs no art change. */
export const FISH_CAPACITY = 5;

/** The swim region (`hit.pond-swim`): every fish body stays inside it (a polygon of at least POND_MIN_POINTS). */
export const POND_HIT = 'pond-swim';
export const POND_MIN_POINTS = 3;
/** Bubbles that rise from a diving fish. */
export const DIVE_BUBBLES = 3;
/** 2026-10-16: the sagging fishing line is drawn as this many straight steps. */
export const LINE_STEPS = 16;
/** The odd constant (2^32 / φ) that spreads question indices into the swim placement seeds. */
export const QUESTION_SEED_MIX = 0x9e3779b1;
export const DOCK_ANCHOR = 'dock';
export const ROD_TIP_ANCHOR = 'rod-tip';
/** Where a caught fish hangs, below the rod tip (`anchor.catch`). */
export const CATCH_ANCHOR = 'catch';

/** The fish sprite object (`sprite.fish-<color>-<size>`). */
export const fishObject = (f: FishSpec): string => `fish-${f.color}-${f.size}`;
export const FISH_SWIM_FRAMES = 4;
export const FISH_CAUGHT_FRAMES = 2;
const nn = (i: number): string => String(i).padStart(2, '0');
export const fishFrames = (f: FishSpec) =>
  ({
    swim: Array.from({ length: FISH_SWIM_FRAMES }, (_, i) => `${fishObject(f)}/swim/${nn(i)}`),
    dive: `${fishObject(f)}/dive/00`,
    caught: Array.from({ length: FISH_CAUGHT_FRAMES }, (_, i) => `${fishObject(f)}/caught/${nn(i)}`),
  }) as const;

/** Every colour × size. */
export const ALL_FISH: readonly FishSpec[] = FISH_COLORS.flatMap((color) => FISH_SIZES.map((size) => ({ color, size })));

/** What `fishing.layout.json` and `atlas.fishing` must hold. */
export const FISHING_SCREEN: ScreenRequirements = {
  anchors: [DOCK_ANCHOR, ROD_TIP_ANCHOR, CATCH_ANCHOR],
  hits: [POND_HIT],
  slots: [],
  frames: ALL_FISH.flatMap((f) => {
    const fr = fishFrames(f);
    return [...fr.swim, fr.dive, ...fr.caught];
  }),
};
export const screen = FISHING_SCREEN;

export const SFX = {
  plop: 'sfx.fishing.plop',
  bubble: 'sfx.fishing.bubble',
  reel: 'sfx.fishing.reel',
  happy: 'sfx.fishing.happy',
} as const;

export const assets: GameAssets = {
  atlases: [ATLASES.fishing],
  images: [BACKGROUNDS.fishing],
  audio: [...VOICE_LINES.map((l) => l.id).filter((id) => id.startsWith('vo.fishing.')), ...Object.values(SFX)],
};
