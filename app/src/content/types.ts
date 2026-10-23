// Shared content types (AD-1, AD-6). `content/` imports only types from other layers.
import type { FlavourId } from './games/ice-cream.ts';

/** The island mini-games: each has its own Map station. Scene key === GameId === stationId (AD-1). */
export const ISLAND_GAME_IDS = [
  'ice-cream',
  'pizza',
  'race',
  'fishing',
  'touch-talk',
  'dino-puzzle',
  'shadow-match',
] as const;
export type IslandGameId = (typeof ISLAND_GAME_IDS)[number];

/**
 * Story 7.2: the yard games (content/home.ts corners). They have no island station: the yard opens them
 * (scene key === GameId still holds).
 */
export const YARD_GAME_IDS = ['animal-pens', 'band'] as const;
export type YardGameId = (typeof YARD_GAME_IDS)[number];

/** Every mini-game id: the island games, then the yard games. */
export const GAME_IDS = [...ISLAND_GAME_IDS, ...YARD_GAME_IDS] as const;

export type GameId = (typeof GAME_IDS)[number];

/** Story 7.2: true for an island game (one with a Map station). */
export function isIslandGameId(id: string): id is IslandGameId {
  return (ISLAND_GAME_IDS as readonly string[]).includes(id);
}

/** Hint level 0 (none) … 4 (distractors dimmed, snap ×2) — AD-5. */
export type HintLevel = 0 | 1 | 2 | 3 | 4;

/** JSON-only data (no object references) — used for resume snapshots (AD-2). */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * The per-game `partial` of a resume snapshot (Story 2.5, AD-2): what a game needs to rebuild its open
 * question. Every game is declared now (shapes from the Story 3.2/3.4/3.6/4.2/4.4/4.5/4.6 ACs), so
 * Epics 3/4 implement them without editing the contract. Type aliases (not interfaces) stay assignable
 * to JsonValue.
 */
export type SnapshotPartials = {
  'ice-cream': { placed: FlavourId[] };
  pizza: { placed: number[]; baked: boolean };
  'dino-puzzle': { placed: string[] };
  'shadow-match': Record<string, never>;
  race: { traceIndex: number };
  fishing: Record<string, never>;
  'touch-talk': { sceneId: string; touchedIds: string[] };
  /** Story 7.2: the animal behind each door (left to right) and the reveals so far this round. */
  'animal-pens': { behind: string[]; reveals: number };
  /** Story 7.3: the band has no round, no score and nothing to resume (it starts in free play). */
  band: Record<string, never>;
};

/** The closed questions of a round so far (Story 2.5): a resumed round judges `nextLevel` on all of them. */
export type TallyState = { questions: number; firstTryCorrect: number; maxHintLevel: HintLevel };

/**
 * Resume snapshot written by Map on `round:abandon` (AD-2, Story 2.5), plain JSON. MiniGameBase composes
 * `v`, `level`, `seed` and `tally`; the game supplies `questionIndex` and its `partial`.
 */
export type Snapshot<G extends GameId = GameId> = {
  v: 1;
  level: number;
  seed: number;
  questionIndex: number;
  partial: SnapshotPartials[G];
  tally?: TallyState;
};

/** Terminal outcome of one MiniGame start (AD-1). */
export interface RoundOutcome {
  gameId: GameId;
  questions: number;
  firstTryCorrect: number;
  maxHintLevel: HintLevel;
}

/** What the shell passes to a MiniGame scene on start (Story 1.7, AD-1). */
export interface GameStartData {
  /** Ladder index, already clamped to the game's ladder. */
  level: number;
  /** Round seed (integer, 0 ≤ seed < 2^31). */
  seed: number;
  /** Resume snapshot (Epic 2); absent in Epic 1. */
  resume?: Snapshot;
}
