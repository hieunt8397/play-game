// The static parent-facing label under a station (Story 1.5, UX-DR42) — Story 7.1 also puts one under
// each yard corner. Tokens.components.stationLabel: typography, colour, ink outline and opacity.
import type { GameObjects, Scene } from 'phaser';
import { Tokens } from '../tokens';

/** A label text object, origin top centre (placed by the caller). */
export function addStationLabel(scene: Scene, text: string): GameObjects.Text {
  const spec = Tokens.components.stationLabel;
  const type = spec.typography;
  return scene.add
    .text(0, 0, text, {
      fontFamily: type.fontFamily,
      fontSize: `${type.fontSize}px`,
      fontStyle: String(type.fontWeight),
      color: spec.color.css,
      stroke: spec.outline.color.css,
      strokeThickness: spec.outline.width,
      align: 'center',
    })
    .setOrigin(0.5, 0)
    .setAlpha(spec.opacity);
}
