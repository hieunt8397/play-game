// Tiệm pizza content (Stories 3.1–3.2): toppings, the 3-level difficulty ladder, the base spots, the
// screen's layout ids and frames, the voice and SFX ids, and the assets Map loads while the kart
// drives here. Data only.
import { ATLASES, BACKGROUNDS } from '../assets.ts';
import { VOICE_LINES } from '../voice-lines.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

/** A level's toppings are the first `toppings` entries (Story 3.2 adds the green bell pepper). */
export const TOPPINGS = ['sausage', 'mushroom', 'pepper'] as const;
export type ToppingId = (typeof TOPPINGS)[number];

export interface PizzaLevel {
  readonly id: string;
  /** Toppings in play: the first `toppings` of TOPPINGS. */
  readonly toppings: 2 | 3;
  /** Slices asked per question: a count in [minSlices, maxSlices]. */
  readonly minSlices: number;
  readonly maxSlices: number;
  /** Questions in one round. */
  readonly questions: 3 | 4 | 5;
}

/** Story 3.2: counts grow 1–3 → 2–4 → 3–5; the third topping joins at the top level. */
export const ladder: readonly PizzaLevel[] = [
  { id: 'count-1-3', toppings: 2, minSlices: 1, maxSlices: 3, questions: 3 },
  { id: 'count-2-4', toppings: 2, minSlices: 2, maxSlices: 4, questions: 4 },
  { id: 'count-3-5', toppings: 3, minSlices: 3, maxSlices: 5, questions: 5 },
];

/** Story 3.2: whole candidate rounds drawn before the constructive fallback (games/pizza/questions.ts). */
export const ROUND_ATTEMPTS = 32;

/** The faint spots on the base (`slot.base-1..8`), top first, clockwise. */
export const BASE_SLOTS = 8;

export const ANCHORS = { fox: 'fox', base: 'base', oven: 'oven' } as const;
export const HITS = { fox: 'fox', oven: 'oven', counter: 'counter' } as const;
export const FOX_PLATE_SLOT = 'fox-plate';

/** `slot.base-<n>` (n = 1..BASE_SLOTS). */
export const baseSlot = (n: number): string => `base-${n}`;
export const BASE_SLOT_IDS: readonly string[] = Array.from({ length: BASE_SLOTS }, (_, i) => baseSlot(i + 1));
/** The bowl's ground pivot of a topping. */
export const bowlAnchor = (t: ToppingId): string => `bowl-${t}`;
/** The slice home on a topping's bowl (each topping frame is rendered there). */
export const bowlSlot = (t: ToppingId): string => `bowl-${t}`;

export const FOX_FRAMES = {
  idle: 'fox/idle/00',
  eat: ['fox/eat/00', 'fox/eat/01', 'fox/eat/02', 'fox/eat/03'],
  happy: ['fox/happy/00', 'fox/happy/01', 'fox/happy/02', 'fox/happy/03'],
} as const;
export const OVEN_FRAMES = { rest: 'oven/rest/00', ready: 'oven/ready/00', baking: 'oven/baking/00' } as const;
export const BASE_FRAMES = { raw: 'base/raw/00', baked: 'base/baked/00' } as const;
export const toppingFrame = (t: ToppingId): string => `topping-${t}/idle/00`;
/** Story 3.2: each bowl (with its static pile) is its own sprite, drawn only for the level's toppings. */
export const bowlFrame = (t: ToppingId): string => `bowl-${t}/idle/00`;

/** What `pizza.layout.json` and `atlas.pizza` must hold. */
export const screen: ScreenRequirements = {
  anchors: [ANCHORS.fox, ANCHORS.base, ANCHORS.oven, ...TOPPINGS.map(bowlAnchor)],
  hits: [HITS.fox, HITS.oven, HITS.counter],
  slots: [...BASE_SLOT_IDS, ...TOPPINGS.map(bowlSlot), FOX_PLATE_SLOT],
  frames: [
    FOX_FRAMES.idle,
    ...FOX_FRAMES.eat,
    ...FOX_FRAMES.happy,
    OVEN_FRAMES.rest,
    OVEN_FRAMES.ready,
    OVEN_FRAMES.baking,
    BASE_FRAMES.raw,
    BASE_FRAMES.baked,
    ...TOPPINGS.map(toppingFrame),
    ...TOPPINGS.map(bowlFrame),
  ],
};

export const SFX = { snap: 'sfx.pizza.snap', ting: 'sfx.pizza.ting', munch: 'sfx.pizza.munch', happy: 'sfx.pizza.happy' } as const;

export const assets: GameAssets = {
  atlases: [ATLASES.pizza],
  images: [BACKGROUNDS.pizza],
  audio: [...VOICE_LINES.map((l) => l.id).filter((id) => id.startsWith('vo.pizza.')), ...Object.values(SFX)],
};
