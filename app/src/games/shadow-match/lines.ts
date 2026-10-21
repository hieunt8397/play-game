// Hang tìm bóng voice and sound ids (Story 3.5), pure. Every id is a literal line of
// content/voice-lines.ts or a content/audio-catalog.ts id (lines.test.ts checks every reachable one).
import { SFX, type ItemId } from '../../content/games/shadow-match.ts';

/** The prompt of a question (through hint): "Xoài ơi, bạn <item> ở … bóng nào?". Also its retry (the director re-asks). */
export const askLineId = (item: ItemId): string => `vo.shadow-match.ask.${item}`;
/** The item's name after its shadow turns real-coloured (game voice): "Con chó!", … */
export const nameLineId = (item: ItemId): string => `vo.shadow-match.name.${item}`;
/** The triceratops' soft chirp after each reveal (a creature sound). */
export const TRIKE_CALL = SFX.trikeHappy;
