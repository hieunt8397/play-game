// Ghép khủng long questions (Story 3.3), pure: which dinosaurs a round shows, in order. Derived from
// the round seed and level only, so a round is reproducible (resume, tests).
import { SPECIES, ladder, piecesOf, type DinoLevel, type PieceId, type SpeciesId } from '../../content/games/dino-puzzle';
import { mulberry32, shuffled } from '../../core/rng';

/** The level index, clamped to the ladder (a non-finite level → 0). */
export function levelIndex(level: number): number {
  const l = Math.floor(level);
  return Number.isFinite(l) ? Math.max(0, Math.min(ladder.length - 1, l)) : 0;
}

export function levelOf(level: number): DinoLevel {
  return ladder[levelIndex(level)]!;
}

/** The piece ids of a level's cut, in hint order. */
export function levelPieces(level: number): readonly PieceId[] {
  return piecesOf(levelOf(level).pieces);
}

/**
 * The round's dinos: a Fisher–Yates shuffle of SPECIES with `mulberry32(seed)`, the first
 * `ladder[level].dinos`. Deterministic; distinct.
 */
export function roundSpecies(seed: number, level: number): SpeciesId[] {
  const s = (Number.isFinite(seed) ? Math.floor(seed) : 0) >>> 0;
  return shuffled(SPECIES, mulberry32(s)).slice(0, levelOf(level).dinos);
}
