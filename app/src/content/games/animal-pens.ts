// Ú òa chuồng thú content (Story 7.2): a yard game (content/home.ts corner `pen`). Four pen doors stand in a
// row on one plate (`bg.animal-pens`, tools/render/blender/build_animal_pens.py). The plate is seen through an
// orthographic camera with the doors in one row, so one door sprite and one peek sprite per animal fit every
// door: they are rendered at door 1 and drawn at door n shifted by `anchor.door-<n>` − `anchor.door-1`
// (validateAnimalPens checks the doors share one row).
//   - `door/closed/00`, `door/open/00`: the door leaf shut / swung open (full-frame, at door 1);
//   - `animal-<id>/peek/00`: the animal in door 1's opening (cut by the pen wall in front of it);
//   - `hit.door-<n>`: the tap area of door n (its frame and opening), `anchor.door-<n>`: its ground pivot.
// Every animal is a real model (Quaternius; the cat and rooster are Poly by Google, CC-BY 3.0: credited in
// public/CREDITS.txt; README provenance) with a real CC0 call (Freesound; ≤ 800 ms,
// creature sounds measured by `npm run audio:check`) and a muffled copy for the wiggle behind the door.
import { ATLASES, BACKGROUNDS } from '../assets.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

export interface PenAnimal {
  readonly id: string;
  /** The Vietnamese call (the ask's onomatopoeia), for the parent and the tests. */
  readonly call: string;
  /** `sfx.animal-pens.<id>.call`: its real call, played as its door opens. */
  readonly callSfx: string;
  /** `sfx.animal-pens.<id>.muffled`: the same call muffled (lowpassed, quieter) while its door wiggles. */
  readonly muffledSfx: string;
  /** `vo.animal-pens.name.<id>` ("Con chó!"), said after the call. */
  readonly nameLine: string;
  /** `vo.animal-pens.ask.<id>` ("Con gì kêu gâu gâu nhỉ?"). */
  readonly askLine: string;
}

const animal = (id: string, call: string): PenAnimal => ({
  id,
  call,
  callSfx: `sfx.animal-pens.${id}.call`,
  muffledSfx: `sfx.animal-pens.${id}.muffled`,
  nameLine: `vo.animal-pens.name.${id}`,
  askLine: `vo.animal-pens.ask.${id}`,
});

/**
 * The animals (spec: ≥ 6 a toddler knows by their call). The duck is left out: no CC0 duck model in the
 * real (non-chibi) style was found (Story 7.2 notes).
 */
export const PEN_ANIMALS: readonly PenAnimal[] = [
  animal('dog', 'gâu gâu'),
  animal('cat', 'meo meo'),
  animal('rooster', 'ò ó o'),
  animal('cow', 'ò ò'),
  animal('pig', 'ụt ịt'),
  animal('sheep', 'be be'),
  animal('horse', 'hí hí'),
];

export const ANIMAL_IDS: readonly string[] = PEN_ANIMALS.map((a) => a.id);

/** The doors, left to right (`door-1` … `door-4`). */
export const DOOR_COUNT = 4;
export const DOOR_IDS: readonly string[] = Array.from({ length: DOOR_COUNT }, (_, i) => `door-${i + 1}`);

/** A round completes after this many reveals (then the celebration and the next round). */
export const REVEALS_PER_ROUND = 8;

/** The game's invitation as it opens (its Speaker prompt). */
export const INVITE_LINE = 'vo.animal-pens.prompt';

export const DOOR_FRAMES = { closed: 'door/closed/00', open: 'door/open/00' } as const;
export const peekFrame = (id: string): string => `animal-${id}/peek/00`;

/** What `animal-pens.layout.json` and `atlas.animal-pens` must hold. */
export const ANIMAL_PENS_SCREEN: ScreenRequirements = {
  anchors: [...DOOR_IDS],
  hits: [...DOOR_IDS],
  slots: [],
  frames: [DOOR_FRAMES.closed, DOOR_FRAMES.open, ...ANIMAL_IDS.map(peekFrame)],
};
export const screen = ANIMAL_PENS_SCREEN;

export const assets: GameAssets = {
  atlases: [ATLASES['animal-pens']],
  images: [BACKGROUNDS['animal-pens']],
  audio: [
    INVITE_LINE,
    'vo.animal-pens.parent.1',
    ...PEN_ANIMALS.flatMap((a) => [a.nameLine, a.askLine, a.callSfx, a.muffledSfx]),
  ],
};
