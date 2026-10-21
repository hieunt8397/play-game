// Every playable game's content (Story 1.7). A station is awake exactly when its id is listed here
// (content/validate.ts checks `stations[i].awake === id in GAME_CONTENT`).
import type { GameId } from '../types.ts';
import * as dinoPuzzle from './dino-puzzle.ts';
import * as fishing from './fishing.ts';
import * as iceCream from './ice-cream.ts';
import * as pizza from './pizza.ts';
import * as race from './race.ts';
import * as shadowMatch from './shadow-match.ts';
import * as touchTalk from './touch-talk.ts';
import type { GameContent } from './types.ts';

export const GAME_CONTENT: Readonly<Partial<Record<GameId, GameContent>>> = {
  'ice-cream': { ladder: iceCream.ladder, assets: iceCream.assets, screen: iceCream.screen },
  pizza: { ladder: pizza.ladder, assets: pizza.assets, screen: pizza.screen },
  race: { ladder: race.ladder, assets: race.assets, screen: race.screen },
  fishing: { ladder: fishing.ladder, assets: fishing.assets, screen: fishing.screen },
  // Story 4.5: no ladder (Map starts it at level 0).
  'touch-talk': { assets: touchTalk.assets, screen: touchTalk.screen },
  'dino-puzzle': { ladder: dinoPuzzle.ladder, assets: dinoPuzzle.assets, screen: dinoPuzzle.screen },
  'shadow-match': { ladder: shadowMatch.ladder, assets: shadowMatch.assets, screen: shadowMatch.screen },
};
