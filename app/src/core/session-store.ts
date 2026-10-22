// Session state (Story 1.7), memory only: a page reload starts fresh, so the kart is back at
// `kart-start`. Story 2.1 moved the ladder level to the durable ProgressStore: `startData` reads it
// through `getDifficulty`, and Map writes it with `setDifficulty` on `round:complete`.
// Story 2.3 adds the `resume` points (Map writes them on round:abandon, Story 2.5) and
// `clearResume`, which the post-round chain calls on `round:complete`.
// Story 2.5: `setResume` (Map, on round:abandon; a deep copy), `getResume`, `resumeIds`,
// `resumeStartData` and `takeStartData` (the start choice: resume when held, then clear). Memory
// only: a reload starts with no resume point.
import type { StationId } from '../content/stations';
import { GAME_IDS, type GameId, type GameStartData, type Snapshot } from '../content/types';
import { ProgressStore, type ProgressStoreService } from './progress-store';
import { readResume } from './snapshot';

/** 2^31: seeds are non-negative 31-bit integers. */
const SEED_RANGE = 2 ** 31;

/** The slice of ProgressStore that start data needs (injectable for tests). */
export type DifficultySource = Pick<ProgressStoreService, 'getDifficulty'>;

export class SessionStore {
  /** The station of the last game started (Story 7.1: or the home station); Map parks the kart at its stop. */
  lastStation: StationId | undefined = undefined;
  /** Kart arrivals this session (the first trip is capped at kartDriveMaxMs, later ones at kartDriveRepeatMaxMs). */
  kartTrips = 0;
  /** Story 5.2: the guide Shiba greeted on the first Map entry of this session (core/map-guide). */
  guideGreeted = false;
  /** In-session resume points by game (Story 2.5 writes them on round:abandon). */
  resume: Partial<Record<GameId, Snapshot>> = {};

  /** Drops the resume point of `id` only (Story 2.3: on that game's round:complete). */
  clearResume(id: GameId): void {
    delete this.resume[id];
  }

  /** Story 2.5: keeps a deep JSON copy of `s` (it never aliases game state). Only Map calls it, on round:abandon. */
  setResume(id: GameId, s: Snapshot): void {
    this.resume[id] = JSON.parse(JSON.stringify(s)) as Snapshot;
  }

  /** Story 2.5: the resume point of `id`, if any. */
  getResume(id: GameId): Snapshot | undefined {
    return this.resume[id];
  }

  /** Story 2.5: the games holding a resume point, in GAME_IDS order. */
  resumeIds(): GameId[] {
    return GAME_IDS.filter((id) => this.resume[id] !== undefined);
  }

  /** Start data for a game: its persisted level (clamped to the ladder) and a fresh seed `floor(rng() × 2^31)`. */
  startData(
    id: GameId,
    ladderLength: number,
    rng: () => number = Math.random,
    progress: DifficultySource = ProgressStore,
  ): GameStartData {
    const r = Math.min(Math.max(rng(), 0), 1 - Number.EPSILON);
    return { level: progress.getDifficulty(id, ladderLength), seed: Math.floor(r * SEED_RANGE) };
  }
}

/** The app-wide session. */
export const session = new SessionStore();

/**
 * Story 2.5: start data that resumes `id`'s held snapshot: `{ level: s.level, seed: s.seed, resume: s }`.
 * Null when nothing is held, or (with a warn) when the held level is outside `[0, ladderLength − 1]`, its
 * seed is not a non-negative 31-bit integer, or `readResume` would reject it against its own level/seed;
 * Map then starts normally with `startData`. The snapshot's level wins over ProgressStore's.
 */
export function resumeStartData(id: GameId, ladderLength: number, store: SessionStore = session): GameStartData | null {
  const s = store.getResume(id);
  if (!s) return null;
  if (!Number.isInteger(s.level) || s.level < 0 || s.level > ladderLength - 1) {
    console.warn(`session: held resume of "${id}" has level ${s.level} outside the ladder (${ladderLength}) — a normal start`);
    return null;
  }
  if (!Number.isInteger(s.seed) || s.seed < 0 || s.seed >= SEED_RANGE) {
    console.warn(`session: held resume of "${id}" has an invalid seed — a normal start`);
    return null;
  }
  // The same check the game runs on its start data: a snapshot it would reject is never resumed.
  if (!readResume(s, { level: s.level, seed: s.seed })) return null;
  return { level: s.level, seed: s.seed, resume: s };
}

/**
 * Story 2.5: the start data of `id`, and the resume point consumed. An entry resumes the held snapshot
 * when `resumeStartData` accepts it; otherwise a fresh start (`startData`: ProgressStore's level, a new
 * seed). Every start clears `id`'s resume point. Seamless play (2026-10-21): the in-place next round
 * also starts here; its settle already cleared the resume point, so it is always fresh.
 */
export function takeStartData(
  id: GameId,
  ladderLength: number,
  store: SessionStore = session,
  rng: () => number = Math.random,
  progress: DifficultySource = ProgressStore,
): GameStartData {
  const data = resumeStartData(id, ladderLength, store) ?? store.startData(id, ladderLength, rng, progress);
  store.clearResume(id);
  return data;
}
