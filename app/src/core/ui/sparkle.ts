// A small burst of star sparkles (2026-10-22, first used by Hang tìm bóng's correct reveal): `count`
// stars in colors.sparkle fly out from a point to `radius`, grow and fade. Under reduced motion they
// appear at their final spots and only fade. Scene-clock tweens; every star destroys itself.
// `sparklePoints` is the pure part (tested).
import type { Scene } from 'phaser';
import type { Point } from '../../content/layout-types';
import { Tokens } from '../tokens';

export interface SparkleOptions {
  /** Distance (design px) from `at` the stars end at. */
  readonly radius: number;
  readonly durationMs: number;
  readonly depth: number;
  readonly reduced: boolean;
  /** Number of stars (default 6). */
  readonly count?: number;
  /** Each star's outer radius (design px, default 14). */
  readonly size?: number;
}

/** `count` points evenly around `at` at `radius`, the first straight up, then clockwise (screen y down). */
export function sparklePoints(at: Point, radius: number, count: number): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / count;
    return { x: at.x + Math.cos(a) * radius, y: at.y + Math.sin(a) * radius };
  });
}

/** Plays one burst at `at` (design px). */
export function sparkle(scene: Scene, at: Point, opts: SparkleOptions): void {
  const count = opts.count ?? 6;
  const size = opts.size ?? 14;
  const fill = Tokens.colors.sparkle.value;
  // An orange rim: the yellow alone is faint on the pale cave wall.
  const line = Tokens.colors.creatureOrange.value;
  for (const [i, end] of sparklePoints(at, opts.radius, count).entries()) {
    const start = opts.reduced ? end : { x: at.x + (end.x - at.x) * 0.35, y: at.y + (end.y - at.y) * 0.35 };
    const star = scene.add
      .star(start.x, start.y, 5, size * 0.45, size, fill)
      .setStrokeStyle(2, line)
      .setDepth(opts.depth)
      .setScale(opts.reduced ? 1 : 0.4)
      .setAngle(i * 17);
    scene.tweens.add({
      targets: star,
      x: end.x,
      y: end.y,
      scale: 1,
      alpha: { from: 1, to: 0 },
      duration: opts.durationMs,
      ease: 'Quad.easeOut',
      onComplete: () => star.destroy(),
    });
  }
}
