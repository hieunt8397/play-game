// Câu cá voice and sound ids (Stories 4.3, 4.4), pure. Every id is a literal line of
// content/voice-lines.ts or a content/audio-catalog.ts id (lines.test.ts checks every reachable one).
import type { FishSpec } from '../../content/games/fishing.ts';
import type { FishQuestion } from './questions.ts';

const request = (q: FishQuestion): string => (q.ask === 'color' ? `color-${q.color}` : `size-${q.size}`);

/** The question's prompt (through hint): "Xoài ơi, câu cá … vàng sọc nào!", "Câu con cá … to nào!". */
export const promptLineId = (q: FishQuestion): string => `vo.fishing.prompt.${request(q)}`;
/** Its retry (through hint): "Con cá … vàng sọc nhé!". */
export const retryLineId = (q: FishQuestion): string => `vo.fishing.retry.${request(q)}`;
/** The caught fish's name (game voice), always with its size: "Cá vàng nhỏ!". */
export const nameLineId = (f: FishSpec): string => `vo.fishing.name.${f.color}-${f.size}`;
