// Game character icons (art only). Story 2.4 drew them on the play-again overlay's replay button; the
// overlay was removed by parent decision 2026-10-21 (seamless play), and nothing in the runtime draws them
// any more. The art pipeline still renders them (deferred art cleanup): tools/render/build.ts hands
// `GAME_ICONS` to build_map.py, each becomes `state.<gameId>` under the detached `sprite.icon` group of
// art/map.blend, rendered as frame `icon/<gameId>/00` of `atlas.map` (trimmed longest side ÷ renderScale ≥
// ui.playAgainIconPx, checked by tools/layout/rules.ts). `.ts` specifiers: tools/ import this under Node.
import type { GameId } from './types.ts';

export interface GameIcon {
  /** Relative to the project's `assets/` folder (Quaternius, Kenney; CC0). */
  readonly model: string;
  /**
   * Creature colour token (Tokens.colors) for spec-1-8's `recolor_creature` (`Main` material). Story 4.1:
   * optional; without it the icon keeps the model's source colours (the race kart).
   */
  readonly creature?: string;
}

export const GAME_ICONS: Readonly<Partial<Record<GameId, GameIcon>>> = {
  'ice-cream': { model: 'quaternius/animals/ShibaInu.fbx', creature: 'creatureOrange' },
  pizza: { model: 'quaternius/animals/Fox.fbx', creature: 'creatureOrange' },
  'dino-puzzle': { model: 'quaternius/dinosaurs/Apatosaurus.fbx', creature: 'creatureBlue' },
  'shadow-match': { model: 'quaternius/dinosaurs/Triceratops.fbx', creature: 'creatureGreen' },
  // Story 4.1: the kid kart in its source colours.
  race: { model: 'kenney/kenney_car-kit/Models/GLB format/kart-oobi.glb' },
  // Story 4.3: the koi of Câu cá.
  fishing: { model: 'quaternius/cutefish/Koi.fbx', creature: 'creatureOrange' },
};

/** The icon frame of a game in `atlas.map`. */
export const gameIconFrame = (gameId: string): string => `icon/${gameId}/00`;
