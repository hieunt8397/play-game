// Scene bubbles (Story 4.5 reserves them, Story 4.6 draws them), pure: the round scene buttons under the
// Speaker on the right edge of Chạm là nói. 2026-10-21 (six scenes): two columns of SCENE_BUBBLE_ROWS. The
// first column sits under the Speaker: its first centre below the Speaker's keep-out zone plus a gap, each
// next one a bubble and a gap lower. The second column is one bubble and a gap to the left of the first.
import type { HudLayout } from './hud.ts';
import { Tokens } from './tokens.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Bubbles per column. */
export const SCENE_BUBBLE_ROWS = 3;

/** The centres of `count` scene bubbles under the Speaker (design px): column by column, each top to bottom. */
export function sceneBubbleCentres(hud: Pick<HudLayout, 'speaker'>, count: number): Point[] {
  const size = Tokens.components.sceneBubble.base.size;
  const gap = Tokens.spacing.targetGap;
  const first = hud.speaker.y + Tokens.ui.hudKeepOutPx / 2 + gap + size / 2;
  return Array.from({ length: Math.max(0, count) }, (_, i) => ({
    x: hud.speaker.x - Math.floor(i / SCENE_BUBBLE_ROWS) * (size + gap),
    y: first + (i % SCENE_BUBBLE_ROWS) * (size + gap),
  }));
}
