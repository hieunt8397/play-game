// Runtime access to the generated screen layouts (Vite JSON import). Tools read the JSON with fs.
import dinoPuzzleLayout from './generated/dino-puzzle.layout.json';
import fishingLayout from './generated/fishing.layout.json';
import iceCreamLayout from './generated/ice-cream.layout.json';
import mapLayout from './generated/map.layout.json';
import pizzaLayout from './generated/pizza.layout.json';
import raceLayout from './generated/race.layout.json';
import shadowMatchLayout from './generated/shadow-match.layout.json';
import touchTalkLayout from './generated/touch-talk.layout.json';
import homeLayout from './generated/home.layout.json';
import animalPensLayout from './generated/animal-pens.layout.json';
import bandLayout from './generated/band.layout.json';
import bedtimeLayout from './generated/bedtime.layout.json';
import petClinicLayout from './generated/pet-clinic.layout.json';
import dressUpLayout from './generated/dress-up.layout.json';
import gardenLayout from './generated/garden.layout.json';
import carWashLayout from './generated/car-wash.layout.json';
import planeLayout from './generated/plane.layout.json';
import trainLayout from './generated/train.layout.json';
import rocketLayout from './generated/rocket.layout.json';
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
  home: homeLayout as ScreenLayout,
  'animal-pens': animalPensLayout as ScreenLayout,
  band: bandLayout as ScreenLayout,
  bedtime: bedtimeLayout as ScreenLayout,
  'pet-clinic': petClinicLayout as ScreenLayout,
  'dress-up': dressUpLayout as ScreenLayout,
  garden: gardenLayout as ScreenLayout,
  'car-wash': carWashLayout as ScreenLayout,
  plane: planeLayout as ScreenLayout,
  train: trainLayout as ScreenLayout,
  rocket: rocketLayout as ScreenLayout,
};
