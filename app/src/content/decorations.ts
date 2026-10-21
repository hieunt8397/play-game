// Island decorations (Story 2.2, AD-2). Data only: per station, the CC0 low-poly models rendered for that
// station's slots. Since 2026-10-21 (parent decision) the app never offers, places or draws them; this
// catalogue only feeds the art pipeline (build_map.py, the atlas frames and their layout checks).
// - `id`: kebab-case and unique across all stations; the map atlas frame is `decoration/<id>/00`.
// - `model`: path relative to the project's `assets/` folder (Kenney / Quaternius, CC0). build_map.py
//   imports it, normalises its size and renders it as `state.<id>` under `sprite.decoration`.
// Every station has more items than slots, so a replacement always brings in a different item.
// No meat-eating dinosaur anywhere (UX-DR75; validate:content scans for it); Shiba, the fox and the station dinos are already game characters.
// Story 5.4: `sound` is the decoration's type (DECORATION_SOUNDS[sound]; unused at runtime since 2026-10-21).
import type { AudioId } from './audio-catalog.ts';
import type { GameId } from './types.ts';

/** Story 5.4: what a decoration sounds like when tapped (food: today's happy chime). */
export type DecorationSound = 'food' | 'vehicle' | 'creature' | 'thing';

export interface DecorationItem {
  readonly id: string;
  /** Relative to `assets/` (e.g. `kenney/kenney_food-kit/Models/GLB format/pizza.glb`). */
  readonly model: string;
  /** Story 5.4: its tap sound type. */
  readonly sound: DecorationSound;
}

const COMMERCIAL = 'kenney/kenney_city-kit-commercial_2.1/Models/GLB format';
const FOOD = 'kenney/kenney_food-kit/Models/GLB format';
const CARS = 'kenney/kenney_car-kit/Models/GLB format';
const ROADS = 'kenney/kenney_city-kit-roads/Models/GLB format';
const CUTEFISH = 'quaternius/cutefish';
const DINOSAURS = 'quaternius/dinosaurs';
const ANIMALS = 'quaternius/animals';

const item = (id: string, folder: string, file: string, sound: DecorationSound): DecorationItem => ({ id, model: `${folder}/${file}`, sound });

export const DECORATIONS: Readonly<Record<GameId, readonly DecorationItem[]>> = {
  'ice-cream': [
    item('parasol', COMMERCIAL, 'detail-parasol-a.glb', 'thing'),
    item('giant-cone', FOOD, 'ice-cream.glb', 'food'),
    item('popsicle', FOOD, 'popsicle.glb', 'food'),
    item('sundae', FOOD, 'sundae.glb', 'food'),
  ],
  pizza: [
    item('pizza-pie', FOOD, 'pizza.glb', 'food'),
    item('tomato', FOOD, 'tomato.glb', 'food'),
    item('cheese', FOOD, 'cheese.glb', 'food'),
    item('pizza-box', FOOD, 'pizza-box.glb', 'thing'),
  ],
  race: [
    item('cone', CARS, 'cone.glb', 'thing'),
    item('traffic-light', ROADS, 'traffic-light.glb', 'thing'),
    item('race-car', CARS, 'race-future.glb', 'vehicle'),
    item('barrier', ROADS, 'construction-barrier.glb', 'thing'),
  ],
  fishing: [
    item('boat', CUTEFISH, 'Boat.fbx', 'vehicle'),
    item('puffer', CUTEFISH, 'Puffer.fbx', 'creature'),
    item('koi', CUTEFISH, 'Koi.fbx', 'creature'),
    item('butterfly-fish', CUTEFISH, 'ButterflyFish.fbx', 'creature'),
  ],
  'touch-talk': [
    item('fire-truck', CARS, 'firetruck.glb', 'vehicle'),
    item('ambulance', CARS, 'ambulance.glb', 'vehicle'),
    item('taxi', CARS, 'taxi.glb', 'vehicle'),
    item('street-lamp', ROADS, 'light-curved.glb', 'thing'),
  ],
  'dino-puzzle': [
    item('parasaurolophus', DINOSAURS, 'Parasaurolophus.fbx', 'creature'),
    // Swapped in for the scary meat-eater of the first catalogue (UX-DR75, 2026-10-08; see spec-cross-notes).
    item('pineapple', FOOD, 'pineapple.glb', 'food'),
    item('dino-egg', FOOD, 'egg.glb', 'food'),
    item('coconut', FOOD, 'coconut.glb', 'food'),
  ],
  'shadow-match': [
    item('mushroom', FOOD, 'mushroom.glb', 'food'),
    item('pumpkin', FOOD, 'pumpkin.glb', 'food'),
    item('lamp-post', ROADS, 'light-square.glb', 'thing'),
    item('alpaca', ANIMALS, 'Alpaca.fbx', 'creature'),
  ],
};

/** The map atlas frame of a decoration (one state, one frame). */
export const decorationFrame = (id: string): string => `decoration/${id}/00`;

/** Story 5.4: the shell SFX of each decoration type (all boot-loaded `sfx.shell.*` ids). */
export const DECORATION_SOUNDS: Readonly<Record<DecorationSound, AudioId>> = {
  food: 'sfx.shell.happy',
  vehicle: 'sfx.shell.kart-beep',
  creature: 'sfx.shell.chirp',
  thing: 'sfx.shell.prop',
};

/** Story 5.4: the tap sound of decoration `id` (an unknown id: the happy chime). */
export function decorationSfx(id: string): AudioId {
  for (const items of Object.values(DECORATIONS)) {
    const d = items.find((i) => i.id === id);
    if (d) return DECORATION_SOUNDS[d.sound];
  }
  return DECORATION_SOUNDS.food;
}
