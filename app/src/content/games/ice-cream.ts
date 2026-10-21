// Tiệm kem content (Story 1.8): flavours, the difficulty ladder, home slots, the screen's layout ids
// and frames, the voice and SFX ids, and the assets Map loads while the kart drives here.
import { ATLASES, BACKGROUNDS } from '../assets.ts';
import { VOICE_LINES } from '../voice-lines.ts';
import type { ReactionSet } from '../../core/reactions.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

export const FLAVOURS = ['strawberry', 'chocolate', 'vanilla', 'mint'] as const;
export type FlavourId = (typeof FLAVOURS)[number];

export interface IceCreamLevel {
  readonly id: string;
  /** Flavours on the counter. */
  readonly flavours: 2 | 3 | 4;
  /** Distinct scoops asked per question (at most the three `slot.cone-*`). */
  readonly scoops: 1 | 2 | 3;
  /** Whether the scoops must go on in the asked order (top level only). */
  readonly ordered: boolean;
  /** Questions in one round. */
  readonly questions: 3 | 4 | 5;
}

/** Story 1.10 (FR5): 1-of-2 → more flavours and 2–3 scoops → order only at the top. */
export const ladder: readonly IceCreamLevel[] = [
  { id: 'one-of-2', flavours: 2, scoops: 1, ordered: false, questions: 3 },
  { id: 'two-of-3', flavours: 3, scoops: 2, ordered: false, questions: 4 },
  { id: 'three-of-4', flavours: 4, scoops: 3, ordered: false, questions: 5 },
  { id: 'three-in-order', flavours: 4, scoops: 3, ordered: true, questions: 5 },
];

/** Home slots (layout `slot.*` ids) by the number of flavours on the counter, left to right. */
export const HOME_SLOTS: Readonly<Record<number, readonly string[]>> = {
  2: ['scoop-2', 'scoop-3'],
  3: ['scoop-1', 'scoop-2', 'scoop-3'],
  4: ['scoop-1', 'scoop-2', 'scoop-3', 'scoop-4'],
};

/** Every scoop frame is rendered at this slot (the builder poses all four there). */
export const SCOOP_RENDER_SLOT = 'scoop-2';
export const CONE_ANCHOR = 'cone';
export const SHIBA_ANCHOR = 'shiba';
export const CONE_SLOTS = ['cone-1', 'cone-2', 'cone-3'] as const;
/** `counterTop` (2026-10-21): the white top face; resting scoops lie on its row (x range), at the home slots' y. */
export const HITS = { shiba: 'shiba', shibaNose: 'shiba-nose', counter: 'counter', counterUpper: 'counter-upper', counterTop: 'counter-top' } as const;

export const SHIBA_FRAMES = {
  idle: 'shiba/idle/00',
  happy: ['shiba/happy/00', 'shiba/happy/01', 'shiba/happy/02', 'shiba/happy/03'],
  // Story 6.1: the comic reactions.
  shiver: ['shiba/shiver/00', 'shiba/shiver/01'],
  /** Wind-up (head back), eyes shut, the burst forward. */
  sneeze: ['shiba/sneeze/00', 'shiba/sneeze/01', 'shiba/sneeze/02'],
  /** One shared grimace for every flavour (the flavour shows in the retry line). */
  grimace: 'shiba/grimace/00',
  /** Idle with ice cream on the nose. */
  nose: 'shiba/nose/00',
} as const;

export const scoopFrame = (f: FlavourId): string => `scoop-${f}/idle/00`;

/** What `ice-cream.layout.json` and `atlas.ice-cream` must hold. */
export const screen: ScreenRequirements = {
  anchors: [SHIBA_ANCHOR, CONE_ANCHOR],
  hits: [HITS.shiba, HITS.shibaNose, HITS.counter, HITS.counterUpper, HITS.counterTop],
  slots: [...HOME_SLOTS[4]!, ...CONE_SLOTS],
  frames: [
    SHIBA_FRAMES.idle,
    ...SHIBA_FRAMES.happy,
    ...SHIBA_FRAMES.shiver,
    ...SHIBA_FRAMES.sneeze,
    SHIBA_FRAMES.grimace,
    SHIBA_FRAMES.nose,
    ...FLAVOURS.map(scoopFrame),
  ],
};

/** Shiba asks for one flavour (multi-scoop and ordered ids: games/ice-cream/lines.ts). */
export const askLine = (f: FlavourId): string => `vo.ice-cream.ask.${f}`;
/** Played after a wrong scoop. */
export const retryLine = (f: FlavourId): string => `vo.ice-cream.retry.${f}`;

/** Story 6.1: `sneeze` is Shiba's real dog sneeze (a creature SFX; it also plays in free play). */
export const SFX = { snap: 'sfx.ice-cream.snap', happy: 'sfx.ice-cream.happy', sneeze: 'sfx.ice-cream.sneeze' } as const;


/** Story 5.8 / 6.1 (FR30/FR31): the reaction ids (games/ice-cream/IceCream.ts switches on them exhaustively). */
export const CORRECT_REACTIONS = ['lick', 'shiver', 'sneeze'] as const;
export const CHOSE_OTHER_REACTIONS = ['taste-grimace'] as const;
export type CorrectReaction = (typeof CORRECT_REACTIONS)[number];
export type ChoseOtherReaction = (typeof CHOSE_OTHER_REACTIONS)[number];

/** Picked by core/reactions (no immediate repeat, seeded). */
export const REACTIONS: ReactionSet = { correct: CORRECT_REACTIONS, choseOther: CHOSE_OTHER_REACTIONS };

export const assets: GameAssets = {
  atlases: [ATLASES['ice-cream']],
  images: [BACKGROUNDS['ice-cream']],
  // Every vo.ice-cream.* line (Story 1.10: the multi-scoop and order lines load with the game).
  audio: [...VOICE_LINES.map((l) => l.id).filter((id) => id.startsWith('vo.ice-cream.')), SFX.snap, SFX.happy, SFX.sneeze],
};
