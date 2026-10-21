// Đường đua roads (Story 4.1), pure: which layout path each road of a round uses. Derived from the round
// seed and level only (resume, tests): the first road is uniform over the level's path ids, every next one
// uniform over the others, so two consecutive roads never match. No retry loops.
import { ladder, type RaceLevel } from '../../content/games/race.ts';
import { mulberry32, randInt } from '../../core/rng.ts';

/** The level index, clamped to the ladder (a non-finite level → 0). */
export function levelIndex(level: number): number {
  const l = Math.floor(level);
  return Number.isFinite(l) ? Math.max(0, Math.min(ladder.length - 1, l)) : 0;
}

export function levelOf(level: number): RaceLevel {
  return ladder[levelIndex(level)]!;
}

/** The round's path ids, `ladder[level].roads` of them. Deterministic. */
export function roundRoads(seed: number, level: number): string[] {
  const lv = levelOf(level);
  const ids = lv.pathIds;
  const rng = mulberry32((Number.isFinite(seed) ? Math.floor(seed) : 0) >>> 0);
  const out: string[] = [];
  let prev: number | undefined;
  for (let i = 0; i < lv.roads; i++) {
    let k: number;
    if (prev === undefined || ids.length < 2) k = randInt(rng, ids.length);
    else {
      const j = randInt(rng, ids.length - 1);
      k = j >= prev ? j + 1 : j;
    }
    out.push(ids[k]!);
    prev = k;
  }
  return out;
}
