// Ghép khủng long content (Stories 3.3 and 3.4): the three gentle species, the 3-, 4- and 6-piece cuts,
// the 3-level ladder, the start bays, the drop order, the screen's layout ids and frames, the voice and
// SFX ids, and the assets Map loads while the kart drives here. Data only. Never a meat-eater: the
// species list is the whole cast.
import { ATLASES, BACKGROUNDS } from '../assets.ts';
import { VOICE_LINES } from '../voice-lines.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

/** The species (asset names; spoken "cổ dài", "ba sừng", "phiến lưng"). A round shows `dinos` of them in seed order. */
export const SPECIES = ['apatosaurus', 'triceratops', 'stegosaurus'] as const;
export type SpeciesId = (typeof SPECIES)[number];

/**
 * The piece cuts by piece count; each array is also the hint order (the first unplaced piece is
 * hinted). The builder cuts every species by bone groups per piece id (build_dino_puzzle.py ›
 * PIECE_BONES). A piece id in several cuts is the same frame and slot. 6 = đầu, cổ, thân, chân trước,
 * chân sau, đuôi; 4 keeps each piece one connected chunk (head-neck, front, back, tail).
 */
export const PIECES = {
  3: ['head-neck', 'body-legs', 'tail'],
  4: ['head-neck', 'front', 'back', 'tail'],
  6: ['head', 'neck', 'body', 'front-legs', 'back-legs', 'tail'],
} as const;
export type PieceCount = keyof typeof PIECES;
export type PieceId = (typeof PIECES)[PieceCount][number];

/** Every piece id of every cut, in cut order and once each (10 ids). */
export const PIECE_IDS: readonly PieceId[] = [...new Set<PieceId>(Object.values(PIECES).flat())];

export interface DinoLevel {
  readonly id: string;
  /** Pieces per dino (a key of PIECES). */
  readonly pieces: PieceCount;
  /** Dinos per round (≤ SPECIES.length). */
  readonly dinos: 3;
}

/** Story 3.4: 3 → 4 → 6 pieces, 3 dinos each. Only Map's nextLevel moves along it. */
export const ladder: readonly DinoLevel[] = [
  { id: 'pieces-3', pieces: 3, dinos: 3 },
  { id: 'pieces-4', pieces: 4, dinos: 3 },
  { id: 'pieces-6', pieces: 6, dinos: 3 },
];

/** Story 3.4: the lawn bays where loose pieces start (`anchor.dino-bay-1..8`); each dino's pieces are shuffled into them. */
export const DINO_BAYS = 8;
/** Story 3.4: start-arrangement shuffles tried before the identity fallback (games/dino-puzzle/starts.ts). */
export const START_ATTEMPTS = 64;
/**
 * Story 3.4: how a drop of a loose piece resolves, first match wins (round.ts follows this order).
 * `own` first is the "ô đúng thắng" rule: the validator allows slots closer than the snap radius only
 * while it holds.
 */
export const DROP_ORDER = ['own', 'home', 'other', 'rest', 'off'] as const;
export type DropOutcome = (typeof DROP_ORDER)[number];

/** The piece ids of a level's cut (empty for a count PIECES does not hold). */
export function piecesOf(pieces: number): readonly PieceId[] {
  return (PIECES as Readonly<Record<number, readonly PieceId[]>>)[pieces] ?? [];
}

/** `<s>-<p>`: a piece's object id (frames `<s>-<p>/…`, `slot.<s>-<p>`). */
export const pieceObject = (s: SpeciesId, p: PieceId): string => `${s}-${p}`;
/** The snap centre of a piece (`slot.<s>-<p>`). */
export const pieceSlot = (s: SpeciesId, p: PieceId): string => pieceObject(s, p);
/** Story 3.4: start bay `i` (1-based; `anchor.dino-bay-<i>`). */
export const bayAnchor = (i: number): string => `dino-bay-${i}`;
/** Every bay anchor id, bay 1 first. */
export const BAY_ANCHORS: readonly string[] = Array.from({ length: DINO_BAYS }, (_, i) => bayAnchor(i + 1));
/** The dino's ground pivot (`anchor.<s>`). */
export const dinoAnchor = (s: SpeciesId): string => s;
/** Where the come-alive walk ends (`anchor.<s>-walk`). */
export const walkAnchor = (s: SpeciesId): string => `${s}-walk`;
/** The lawn: a drop here rests (`hit.grass`); anywhere else is off. */
export const GRASS_HIT = 'grass';
export const CLOUDS = ['cloud-1', 'cloud-2'] as const;

/** Story 3.4: 2 walk frames (the atlas stays within 4 pages). */
export const DINO_WALK_FRAMES = 2;
export const DINO_HAPPY_FRAMES = 2;
const nn = (i: number): string => String(i).padStart(2, '0');
export const dinoFrames = (s: SpeciesId) =>
  ({
    idle: `${s}/idle/00`,
    blink: `${s}/blink/00`,
    happy: Array.from({ length: DINO_HAPPY_FRAMES }, (_, i) => `${s}/happy/${nn(i)}`),
    walk: Array.from({ length: DINO_WALK_FRAMES }, (_, i) => `${s}/walk/${nn(i)}`),
    ghost: `${s}/ghost/00`,
  }) as const;
export const pieceFrames = (s: SpeciesId, p: PieceId) => ({ idle: `${pieceObject(s, p)}/idle/00`, ghost: `${pieceObject(s, p)}/ghost/00` }) as const;
export const cloudFrame = (c: (typeof CLOUDS)[number]): string => `${c}/idle/00`;

/** What `dino-puzzle.layout.json` and `atlas.dino-puzzle` must hold (generated from SPECIES × PIECE_IDS, plus the bays). */
export const screen: ScreenRequirements = {
  anchors: [...SPECIES.flatMap((s) => [dinoAnchor(s), walkAnchor(s)]), ...BAY_ANCHORS, ...CLOUDS],
  hits: [GRASS_HIT],
  slots: SPECIES.flatMap((s) => PIECE_IDS.map((p) => pieceSlot(s, p))),
  frames: [
    ...SPECIES.flatMap((s) => {
      const f = dinoFrames(s);
      return [f.idle, f.blink, ...f.happy, ...f.walk, f.ghost, ...PIECE_IDS.flatMap((p) => Object.values(pieceFrames(s, p)))];
    }),
    ...CLOUDS.map(cloudFrame),
  ],
};

export const SFX = {
  snap: 'sfx.dino-puzzle.snap',
  happy: 'sfx.dino-puzzle.happy',
} as const;
/** Each species' soft happy call (catalog `creature: true`). */
export const callSfx = (s: SpeciesId): string => `sfx.dino-puzzle.${s}.happy`;

export const assets: GameAssets = {
  atlases: [ATLASES['dino-puzzle']],
  images: [BACKGROUNDS['dino-puzzle']],
  audio: [
    ...VOICE_LINES.map((l) => l.id).filter((id) => id.startsWith('vo.dino-puzzle.')),
    ...Object.values(SFX),
    ...SPECIES.map(callSfx),
  ],
};
