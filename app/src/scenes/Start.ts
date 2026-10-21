// Start (Story 1.2): sky + one bobbing yellow ▶ `button-play`, centred in Tokens.safeRect. No text.
// Tap (core/input TapTarget, layer scene): press visual on press; on release over the button → "pụp", music loop, AudioDirector unlock (wraps
// Phaser's unlock), ProgressStore.init() once (Story 5.2: the greeting is said on the island), then the (placeholder) Map. A second tap during the
// transition is ignored. The tap logic lives in core/shell-flow.ts (tested in node).
import { Scene } from 'phaser';
import { audio } from '../core/audio-director';
import { ProgressStore } from '../core/progress-store';
import { createTapRouter } from '../core/input/tap-router';
import { createTapTarget } from '../core/input/tap-target';
import { createStartTap } from '../core/shell-flow';
import { Tokens } from '../core/tokens';
import { createRoundButton, pressButton, startBob } from '../core/ui/round-button';

export class Start extends Scene {
  constructor() {
    super('Start');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    const area = Tokens.safeRect;
    const play = Tokens.components.buttonPlay;
    const button = createRoundButton(this, {
      x: area.x + area.w / 2,
      y: area.y + area.h / 2,
      size: play.size,
      fill: play.background,
    });
    startBob(this, button);
    const router = createTapRouter(this);
    const tap = createStartTap({
      audio,
      initStore: () => ProgressStore.init(),
      leave: () => {
        target.setEnabled(false); // runs on release, after target exists
        // Let the press spring finish before leaving.
        this.time.delayedCall(Tokens.Timing.buttonPressMs, () => this.scene.start('Map'));
      },
    });
    const target = createTapTarget(router, {
      circle: { x: button.x, y: button.y, r: play.size / 2 + Tokens.spacing.hitPad },
      onPress: () => pressButton(this, button),
      // Release keeps the audio unlock inside a user-gesture touchend (spec-1-2).
      onRelease: tap,
    });
  }
}
