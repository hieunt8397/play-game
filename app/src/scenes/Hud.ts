// Hud (Story 1.6): a parallel scene above Map and the games. Speaker (top-right, every mode) replays
// the current prompt with a two-ring wave until that line ends; Home (top-left, 'game' mode only)
// says "Về đảo nào!" and emits `hud:home`. Launched once by Map, never on Start. Wiring only: the
// layout, wave maths and tap logic live in core/hud.ts; taps go through InputGuard on the `hud` layer.
import { Scene, type GameObjects, type Tweens } from 'phaser';
import { audio } from '../core/audio-director';
import { bus } from '../core/bus';
import { speakerReplay } from '../core/hint-director';
import { HudController, hudLayout, waveFrame, wavePeriodMs, type HudLayout } from '../core/hud';
import { getHudMode } from '../core/hud-mode';
import { createTapRouter } from '../core/input/tap-router';
import { createTapTarget } from '../core/input/tap-target';
import { currentView, designInsets, NO_INSETS, visibleDesignRect } from '../core/input/space';
import { prefersReducedMotion } from '../core/reduced-motion';
import { Tokens } from '../core/tokens';
import { createRoundButton, pressButton } from '../core/ui/round-button';

const RESIZE = 'resize';

function currentLayout(): HudLayout {
  const view = currentView();
  const { width, height } = Tokens.design;
  if (!view) return hudLayout({ x: 0, y: 0, w: width, h: height }, NO_INSETS);
  return hudLayout(visibleDesignRect(view), designInsets(view));
}

export class Hud extends Scene {
  private waveTween: Tweens.Tween | undefined;

  constructor() {
    super('Hud');
  }

  create(): void {
    const reduced = prefersReducedMotion(window);
    const layout = currentLayout();
    const speakerSpec = Tokens.components.buttonSpeaker;
    const wave = speakerSpec.wave;

    const rings: GameObjects.Arc[] = [];
    for (let i = 0; i < wave.rings; i++) {
      rings.push(this.add.circle(layout.speaker.x, layout.speaker.y, layout.size / 2, wave.color.value, 1).setVisible(false));
    }
    const speaker = createRoundButton(this, {
      x: layout.speaker.x,
      y: layout.speaker.y,
      size: layout.size,
      fill: speakerSpec.background,
      icon: 'speaker',
    });
    const home = createRoundButton(this, {
      x: layout.home.x,
      y: layout.home.y,
      size: layout.size,
      fill: Tokens.components.buttonHome.background,
      icon: 'home',
    });

    const applyWave = (tMs: number): void => {
      const frame = waveFrame(tMs, reduced);
      rings.forEach((ring, i) => {
        const f = frame[i];
        if (f) ring.setScale(f.scale).setAlpha(f.alpha);
      });
    };
    const stopWave = (): void => {
      this.waveTween?.stop();
      this.waveTween = undefined;
      for (const ring of rings) ring.setVisible(false);
    };
    const startWave = (): void => {
      stopWave();
      const period = wavePeriodMs();
      applyWave(0);
      for (const ring of rings) ring.setVisible(true);
      this.waveTween = this.tweens.addCounter({
        from: 0,
        to: period,
        duration: period,
        repeat: -1,
        onUpdate: (t) => applyWave(t.getValue() ?? 0),
      });
    };

    const router = createTapRouter(this, { layer: 'hud' });
    const controller = new HudController({
      // Story 1.9: the active hint question replays its prompt (keeping its level); else the stored prompt.
      replay: () => speakerReplay(audio),
      say: (id) => audio.say(id),
      sfx: (id) => audio.sfx(id),
      emitHome: () => bus.emit('hud:home'),
      view: {
        pressSpeaker: () => pressButton(this, speaker),
        pressHome: () => pressButton(this, home),
        showWave: (on) => (on ? startWave() : stopWave()),
        showHome: (on) => {
          home.setVisible(on);
          // Only called from setMode below, after homeTarget exists.
          homeTarget.setEnabled(on);
        },
      },
    });
    const speakerTarget = createTapTarget(router, { circle: layout.speaker, onPress: () => controller.speaker() });
    const homeTarget = createTapTarget(router, { circle: layout.home, onPress: () => controller.home() });
    controller.setMode(getHudMode());

    const relayout = (): void => {
      const next = currentLayout();
      speaker.setPosition(next.speaker.x, next.speaker.y);
      for (const ring of rings) ring.setPosition(next.speaker.x, next.speaker.y);
      home.setPosition(next.home.x, next.home.y);
      speakerTarget.setCircle(next.speaker);
      homeTarget.setCircle(next.home);
    };
    this.scale.on(RESIZE, relayout);

    const scoped = bus.scoped(this);
    scoped.on('hud:mode', ({ mode }) => controller.setMode(mode));
    scoped.on('speech:ended', ({ token }) => controller.speechEnded(token));
    this.events.once('shutdown', () => {
      this.scale.off(RESIZE, relayout);
      stopWave();
    });
  }
}
