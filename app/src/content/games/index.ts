// Every playable game's content (Story 1.7). A station is awake exactly when its id is listed here
// (content/validate.ts checks `stations[i].awake === id in GAME_CONTENT`).
import type { GameId } from '../types.ts';
import * as animalPens from './animal-pens.ts';
import * as band from './band.ts';
import * as bedtime from './bedtime.ts';
import * as dinoPuzzle from './dino-puzzle.ts';
import * as dressUp from './dress-up.ts';
import * as fishing from './fishing.ts';
import * as garden from './garden.ts';
import * as iceCream from './ice-cream.ts';
import * as petClinic from './pet-clinic.ts';
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
  // Story 7.2: a yard game (no station, no ladder); registering it wakes the yard's pen corner.
  'animal-pens': { assets: animalPens.assets, screen: animalPens.screen },
  // Story 7.3: a yard game (no station, no ladder); registering it wakes the yard's stage corner.
  band: { assets: band.assets, screen: band.screen },
  // Story 7.4: a yard game (no station, no ladder); registering it wakes the yard's bed corner.
  bedtime: { assets: bedtime.assets, screen: bedtime.screen },
  // Story 8.1: a yard game (no station, no ladder); registering it wakes the yard's clinic corner.
  'pet-clinic': { assets: petClinic.assets, screen: petClinic.screen },
  // Story 8.2: a yard game (no station, no ladder); registering it wakes the yard's wardrobe corner.
  'dress-up': { assets: dressUp.assets, screen: dressUp.screen },
  // Trồng cây (2026-10-30): a yard game (no station, no ladder); registering it wakes the yard's garden corner.
  garden: { assets: garden.assets, screen: garden.screen },
};
