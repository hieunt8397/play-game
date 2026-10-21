// Ghép khủng long voice and sound ids (Story 3.3), pure. Every id is a literal line of
// content/voice-lines.ts or a content/audio-catalog.ts id (lines.test.ts checks them all).
import type { SpeciesId } from '../../content/games/dino-puzzle';
import { callSfx } from '../../content/games/dino-puzzle';

/** The prompt of every dino (through hint): "Xoài ơi, ghép bạn khủng long nào!". */
export const ASK_LINE = 'vo.dino-puzzle.ask';
/** The retry after a piece dropped on another part of the ghost: "Mình thử chỗ khác nhé!". */
export const RETRY_LINE = 'vo.dino-puzzle.retry';
/** The name a dino says when it comes alive (game voice): "Khủng long cổ dài!", … */
export const nameLineId = (s: SpeciesId): string => `vo.dino-puzzle.name.${s}`;
/** The dino's soft happy call before its name. */
export const callSfxId = (s: SpeciesId): string => callSfx(s);
