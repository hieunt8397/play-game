// Resume mark (Story 2.5, UX-DR38): the small static ring Map draws on a station holding an in-session
// resume point. One Graphics: a Home-yellow annulus (ui.resumeMarkRadiusPx, ui.resumeMarkStrokePx) with
// a 2 px ink outline on both edges and a white centre dot (ui.resumeMarkDotPx), at ui.resumeMarkDepth.
// It never moves: no tween, pulse or alpha change (so reduced motion changes nothing), and it is not
// interactive, so a tap on it reaches the station polygon underneath. Not the `hint-ring` (purple,
// pulsing, around the whole station): a different shape, colour and place.
import type { GameObjects, Scene } from 'phaser';
import type { Point } from '../../content/layout-types';
import { RESUME_MARK_OUTLINE_PX } from '../resume-marks';
import { Tokens } from '../tokens';

/** Draws one resume mark centred at `at` (design px). The caller destroys it. */
export function drawResumeMark(scene: Scene, at: Point): GameObjects.Graphics {
  const ui = Tokens.ui;
  const c = Tokens.colors;
  const outer = ui.resumeMarkRadiusPx;
  const inner = outer - ui.resumeMarkStrokePx;
  const ink = RESUME_MARK_OUTLINE_PX;
  const g = scene.add.graphics({ x: at.x, y: at.y });
  // Ink outlines: just outside the annulus and just inside its hole.
  g.lineStyle(ink, c.iconInk.value, c.iconInk.alpha);
  g.strokeCircle(0, 0, outer + ink / 2);
  g.strokeCircle(0, 0, inner - ink / 2);
  // The annulus: a stroke centred between its inner and outer radius.
  g.lineStyle(ui.resumeMarkStrokePx, c.buttonHome.value, c.buttonHome.alpha);
  g.strokeCircle(0, 0, (outer + inner) / 2);
  // The centre dot.
  g.fillStyle(c.counterTop.value, c.counterTop.alpha);
  g.fillCircle(0, 0, ui.resumeMarkDotPx);
  g.setDepth(ui.resumeMarkDepth);
  return g;
}
