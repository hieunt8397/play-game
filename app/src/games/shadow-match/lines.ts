// Hang tìm bóng voice ids (Story 3.5), pure. Every id is a literal line of content/voice-lines.ts
// (lines.test.ts checks every reachable one). 2026-10-22: no creature sound any more (the triceratops is gone).
import type { ItemId } from '../../content/games/shadow-match.ts';

/** The prompt of a question (through hint): "Xoài ơi, bạn <item> ở … bóng nào?". Also its retry (the director re-asks). */
export const askLineId = (item: ItemId): string => `vo.shadow-match.ask.${item}`;
/** The item's name after its shadow turns real-coloured (game voice): "Con chó!", … */
export const nameLineId = (item: ItemId): string => `vo.shadow-match.name.${item}`;
