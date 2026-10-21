// Runtime access to the generated screen layouts (Vite JSON import). Tools read the JSON with fs.
import dinoPuzzleLayout from './generated/dino-puzzle.layout.json';
import fishingLayout from './generated/fishing.layout.json';
import iceCreamLayout from './generated/ice-cream.layout.json';
import mapLayout from './generated/map.layout.json';
import pizzaLayout from './generated/pizza.layout.json';
import raceLayout from './generated/race.layout.json';
import shadowMatchLayout from './generated/shadow-match.layout.json';
import touchTalkLayout from './generated/touch-talk.layout.json';
import type { ScreenId } from './assets.ts';
import type { ScreenLayout } from './layout-types.ts';

export const LAYOUTS: Readonly<Record<ScreenId, ScreenLayout>> = {
  map: mapLayout as ScreenLayout,
  'ice-cream': iceCreamLayout as ScreenLayout,
  pizza: pizzaLayout as ScreenLayout,
  'dino-puzzle': dinoPuzzleLayout as ScreenLayout,
  'shadow-match': shadowMatchLayout as ScreenLayout,
  race: raceLayout as ScreenLayout,
  fishing: fishingLayout as ScreenLayout,
  'touch-talk': touchTalkLayout as ScreenLayout,
};
