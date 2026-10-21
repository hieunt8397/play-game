// Per-game content contract (Story 1.7). Data only: games/registry.ts pairs each entry with its scene.
import type { AtlasRef, BackgroundRef } from '../assets.ts';

export type { AtlasRef };

/** A single image a game loads (Story 1.8: its plate, `bg.<screen>`). */
export type ImageRef = BackgroundRef;

/** What Map loads while the kart drives to a station (and releases when the game shuts down). */
export interface GameAssets {
  /** The game's own atlases (never `ATLASES.map`, which Map keeps for the session). */
  readonly atlases: readonly AtlasRef[];
  /** The game's own single images (never `BACKGROUNDS.map`). */
  readonly images?: readonly ImageRef[];
  /** Voice-line ids (`vo.<gameId>.…`) or audio-catalog ids the game plays. */
  readonly audio: readonly string[];
}

/** The layout ids and atlas frames a game's screen must provide (Story 1.8; checked by `npm run check`). */
export interface ScreenRequirements {
  readonly anchors: readonly string[];
  readonly hits: readonly string[];
  readonly slots: readonly string[];
  readonly frames: readonly string[];
}

export interface GameContent {
  /** Difficulty ladder; the level index passed to the game is clamped to it. Story 4.5: none for touch-talk (one level). */
  readonly ladder?: readonly unknown[];
  readonly assets: GameAssets;
  /** The game screen's requirements, when it has its own Blender screen. */
  readonly screen?: ScreenRequirements;
}
