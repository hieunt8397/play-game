// AudioUnlockOverlay (Story 1.2, AR7): launched once by Boot, then asleep. On `audio:suspended`
// it pauses every other active scene (scene.pause() is the only pause mechanism, so scene time —
// and later the hint clocks — stop too), wakes on top with a light dim + `button-play`. The full-
// screen backdrop is visual only: the paused scenes' routers are inactive, so nothing else gets taps. Button tap → audio.unlock() → when audio runs
// again, resumes exactly the scenes it paused, sleeps again and emits `audio:resumed` (otherwise it
// stays up for another tap). No text. The bookkeeping lives in core/shell-flow.ts (tested in node).
import { Scene } from 'phaser';
import { audio } from '../core/audio-director';
import { bus } from '../core/bus';
import { createTapRouter } from '../core/input/tap-router';
import { createTapTarget } from '../core/input/tap-target';
import { SuspendOverlayController } from '../core/shell-flow';
import { Tokens } from '../core/tokens';
import { createRoundButton, pressButton, startBob } from '../core/ui/round-button';

export class AudioUnlockOverlay extends Scene {
  constructor() {
    super('AudioUnlockOverlay');
  }

  create(): void {
    const { width, height } = Tokens.design;
    // The 15% dim token (named for the removed Story 2.4 overlay; tokens.generated.ts is generated).
    const dim = Tokens.components.playAgainOverlay.backdrop;
    // Backdrop: dims the paused scenes (visual only; their routers are inactive while paused).
    this.add.rectangle(0, 0, width, height, dim.value, dim.alpha).setOrigin(0);

    const area = Tokens.safeRect;
    const play = Tokens.components.buttonPlay;
    const button = createRoundButton(this, {
      x: area.x + area.w / 2,
      y: area.y + area.h / 2,
      size: play.size,
      fill: play.background,
    });
    startBob(this, button);

    const own = this.scene.key;
    const overlay = new SuspendOverlayController({
      host: {
        otherActiveKeys: () => this.scene.manager.getScenes(true).map((s) => s.scene.key).filter((k) => k !== own),
        pause: (key) => this.scene.pause(key),
        resume: (key) => this.scene.resume(key),
        show: () => {
          this.scene.wake();
          this.scene.bringToTop();
        },
        hide: () => this.scene.sleep(),
      },
      unlock: () => audio.unlock(),
      emitResumed: () => bus.emit('audio:resumed'),
    });
    createTapTarget(createTapRouter(this, { layer: 'overlay' }), {
      circle: { x: button.x, y: button.y, r: play.size / 2 + Tokens.spacing.hitPad },
      onPress: () => pressButton(this, button),
      // Release keeps audio.unlock() inside a user-gesture touchend (spec-1-2).
      onRelease: () => void overlay.tap(),
    });

    bus.scoped(this).on('audio:suspended', () => overlay.cover());
    this.scene.sleep();
  }
}
