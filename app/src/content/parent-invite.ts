// Parent invitation content (Story 5.7, FR35). Each game has 1–2 `vo.<game>.parent.<n>` lines that
// invite the parent beside the child to join ("Hỏi mẹ xem…", "Chỉ cho bố xem…"). core/parent-invite
// decides per round whether one is said (Tokens.ui.parentInviteChance) and when (only as the lead of
// the round's first prompt, or in free play). `PARENT_INVITE_ENABLED` turns the feature on (default)
// or off. validate:content checks the lists (validateParentInvite). `.ts` specifiers: tools/ import
// this under Node.
import type { GameId } from './types.ts';
import type { VoiceLineId } from './voice-lines.ts';

/** On by default (FR35); `false` silences every parent invitation. */
export const PARENT_INVITE_ENABLED: boolean = true;

export const PARENT_INVITE_LINES: Readonly<Record<GameId, readonly VoiceLineId[]>> = {
  'ice-cream': ['vo.ice-cream.parent.1', 'vo.ice-cream.parent.2'],
  pizza: ['vo.pizza.parent.1'],
  'dino-puzzle': ['vo.dino-puzzle.parent.1'],
  'shadow-match': ['vo.shadow-match.parent.1'],
  race: ['vo.race.parent.1'],
  fishing: ['vo.fishing.parent.1'],
  'touch-talk': ['vo.touch-talk.parent.1'],
  'animal-pens': ['vo.animal-pens.parent.1'],
  band: ['vo.band.parent.1'],
};
