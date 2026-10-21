// Game registry (Story 1.7, AD-1): pairs each game's content (content/games › GAME_CONTENT) with its
// scene class. Only the shell (Map, main.ts) imports it; games never do. A station is awake only
// when its id is in GAMES.
import { GAME_CONTENT } from '../content/games/index';
import type { GameAssets, GameContent } from '../content/games/types';
import type { GameId } from '../content/types';
import { DinoPuzzle } from './dino-puzzle/DinoPuzzle';
import { Fishing } from './fishing/Fishing';
import { IceCream } from './ice-cream/IceCream';
import { Pizza } from './pizza/Pizza';
import { Race } from './race/Race';
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
