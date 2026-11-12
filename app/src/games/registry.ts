// Game registry (Story 1.7, AD-1): pairs each game's content (content/games › GAME_CONTENT) with its
// scene class. Only the shell (Map, main.ts) imports it; games never do. A station is awake only
// when its id is in GAMES.
import { GAME_CONTENT } from '../content/games/index';
import type { GameAssets, GameContent } from '../content/games/types';
import type { GameId } from '../content/types';
import { AnimalPens } from './animal-pens/AnimalPens';
import { Band } from './band/Band';
import { Bedtime } from './bedtime/Bedtime';
import { CarWash } from './car-wash/CarWash';
import { DinoPuzzle } from './dino-puzzle/DinoPuzzle';
import { DressUp } from './dress-up/DressUp';
import { Fishing } from './fishing/Fishing';
import { Garden } from './garden/Garden';
import { IceCream } from './ice-cream/IceCream';
import { PetClinic } from './pet-clinic/PetClinic';
import { Pizza } from './pizza/Pizza';
import { Plane } from './plane/Plane';
import { Race } from './race/Race';
import { Train } from './train/Train';
import { Rocket } from './rocket/Rocket';
import { ShadowMatch } from './shadow-match/ShadowMatch';
import { TouchTalk } from './touch-talk/TouchTalk';
import type { MiniGameBase } from './mini-game-base';

export type GameSceneClass = new () => MiniGameBase;

export interface GameEntry {
  readonly scene: GameSceneClass;
  readonly ladder?: readonly unknown[];
  readonly assets: GameAssets;
}

/** Scene class per game id (only games with a scene; content without a scene is not playable). */
export const SCENE_CLASSES: Readonly<Partial<Record<GameId, GameSceneClass>>> = {
  'ice-cream': IceCream,
  pizza: Pizza,
  'dino-puzzle': DinoPuzzle,
  'shadow-match': ShadowMatch,
  race: Race,
  fishing: Fishing,
  'touch-talk': TouchTalk,
  // Story 7.2: a yard game; registering it wakes the yard's pen corner (content/home.ts › yardCorners).
  'animal-pens': AnimalPens,
  // Story 7.3: a yard game; registering it wakes the yard's stage corner.
  band: Band,
  // Story 7.4: a yard game; registering it wakes the yard's bed corner.
  bedtime: Bedtime,
  // Story 8.1: a yard game; registering it wakes the yard's clinic corner.
  'pet-clinic': PetClinic,
  // Story 8.2: a yard game; registering it wakes the yard's wardrobe corner.
  'dress-up': DressUp,
  // Trồng cây (2026-10-30): a yard game; registering it wakes the yard's garden corner.
  garden: Garden,
  // Rửa xe (2026-10-30): a yard game; registering it wakes the yard's car-wash corner.
  'car-wash': CarWash,
  // Phi công nhí (2026-11-11): a yard game; registering it wakes the yard's plane corner.
  plane: Plane,
  // Tàu hỏa chở bạn (2026-11-12): a yard game; registering it wakes the yard's train corner.
  train: Train,
  // Tên lửa lên Mặt Trăng (2026-11-12): a yard game; registering it wakes the yard's rocket corner.
  rocket: Rocket,
};

function buildGames(): Partial<Record<GameId, GameEntry>> {
  const games: Partial<Record<GameId, GameEntry>> = {};
  for (const [id, content] of Object.entries(GAME_CONTENT) as Array<[GameId, GameContent | undefined]>) {
    const scene = SCENE_CLASSES[id];
    if (!content || !scene) continue;
    games[id] = { scene, ...(content.ladder ? { ladder: content.ladder } : {}), assets: content.assets };
  }
  return games;
}

export const GAMES: Readonly<Partial<Record<GameId, GameEntry>>> = buildGames();

/** The scene classes main.ts registers (after Map, before Hud). */
export const GAME_SCENES: readonly GameSceneClass[] = Object.values(GAMES).map((g) => g.scene);

/** True when `id` opens a game. */
export function isGameId(id: string): id is GameId {
  return Object.prototype.hasOwnProperty.call(GAMES, id);
}

/** Ladder length used to clamp a game's level (spec-cross-notes 4.5: a game without a ladder has one level). */
export function ladderLength(entry: { readonly ladder?: readonly unknown[] }): number {
  return entry.ladder?.length ?? 1;
}
