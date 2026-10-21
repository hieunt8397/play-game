// `button-round` visual (DESIGN components.button-round) drawn with Phaser Graphics until the
// atlas art lands (Story 1.4): circle, top-left white highlight, solid 6 px base shadow
// (first shadow layer), icon (▶ play, home, speaker) in `icon` ink. Press = 0.9× then spring back;
// optional slow bob. The button is visual only: input goes through core/input's TapTarget (Story 1.6).
import type { GameObjects, Scene, Tweens } from 'phaser';
import { Tokens } from '../tokens';

export interface ColorLike {
  readonly value: number;
  readonly alpha: number;
}

export interface RoundButtonOptions {
  x: number;
  y: number;
  /** Diameter in design px (e.g. Tokens.components.buttonPlay.size). */
  size: number;
  fill: ColorLike;
  /** Drawn icon (default 'play'). */
  icon?: RoundButtonIcon;
}

export type RoundButtonIcon = 'play' | 'home' | 'speaker';

// Proportions of the drawn highlight and ▶ icon, relative to the radius (visual only).
const HIGHLIGHT = { x: -0.38, y: -0.45, w: 0.55, h: 0.3, alpha: 0.55 } as const;
const ICON = { half: 0.36, back: -0.26, tip: 0.42 } as const;
// Home: roof triangle + body. Speaker: box + cone + two sound arcs.
const HOME = { roofTop: -0.44, roofBase: -0.04, roofHalf: 0.46, bodyHalf: 0.3, bodyBottom: 0.4 } as const;
const SPEAKER = {
  boxLeft: -0.42, boxHalf: 0.14, boxW: 0.2, coneTip: 0.1, coneHalf: 0.34,
  arcX: 0.08, arcs: [0.22, 0.38], arcSpan: 0.8, arcWidth: 0.08,
} as const;

function drawIcon(g: GameObjects.Graphics, icon: RoundButtonIcon, r: number): void {
  if (icon === 'home') {
    g.fillTriangle(0, r * HOME.roofTop, -r * HOME.roofHalf, r * HOME.roofBase, r * HOME.roofHalf, r * HOME.roofBase);
    g.fillRect(-r * HOME.bodyHalf, r * HOME.roofBase, 2 * r * HOME.bodyHalf, r * (HOME.bodyBottom - HOME.roofBase));
    return;
  }
  if (icon === 'speaker') {
    const left = r * SPEAKER.boxLeft;
    const boxRight = left + r * SPEAKER.boxW;
    g.fillRect(left, -r * SPEAKER.boxHalf, r * SPEAKER.boxW, 2 * r * SPEAKER.boxHalf);
    g.fillTriangle(boxRight, -r * SPEAKER.boxHalf, r * SPEAKER.coneTip, -r * SPEAKER.coneHalf, r * SPEAKER.coneTip, r * SPEAKER.coneHalf);
    g.fillTriangle(boxRight, r * SPEAKER.boxHalf, boxRight, -r * SPEAKER.boxHalf, r * SPEAKER.coneTip, r * SPEAKER.coneHalf);
    for (const a of SPEAKER.arcs) {
      g.beginPath();
      g.arc(r * SPEAKER.arcX, 0, r * a, -SPEAKER.arcSpan, SPEAKER.arcSpan);
      g.strokePath();
    }
    return;
  }
  g.fillTriangle(r * ICON.back, -r * ICON.half, r * ICON.back, r * ICON.half, r * ICON.tip, 0);
}

/** Builds a round button as a (non-interactive) Container centred on (x, y). */
export function createRoundButton(scene: Scene, opts: RoundButtonOptions): GameObjects.Container {
  const r = opts.size / 2;
  const base = Tokens.components.buttonRound;
  const solidShadow = base.shadow[0];
  const g = scene.add.graphics();

  g.fillStyle(solidShadow.color.value, solidShadow.color.alpha);
  g.fillCircle(solidShadow.x, solidShadow.y, r);

  g.fillStyle(opts.fill.value, opts.fill.alpha);
  g.fillCircle(0, 0, r);

  g.fillStyle(base.highlight.value, base.highlight.alpha * HIGHLIGHT.alpha);
  g.fillEllipse(r * HIGHLIGHT.x, r * HIGHLIGHT.y, r * HIGHLIGHT.w, r * HIGHLIGHT.h);

  g.fillStyle(base.icon.value, base.icon.alpha);
  g.lineStyle(r * SPEAKER.arcWidth, base.icon.value, base.icon.alpha);
  drawIcon(g, opts.icon ?? 'play', r);

  const button = scene.add.container(opts.x, opts.y, [g]);
  button.setSize(opts.size, opts.size);
  return button;
}

const pressTweens = new WeakMap<GameObjects.Container, Tweens.Tween>();

/** Press feedback: snaps to 0.9× immediately (well inside the 100 ms budget) and springs back. */
export function pressButton(scene: Scene, button: GameObjects.Container): void {
  pressTweens.get(button)?.stop();
  button.setScale(Tokens.ui.pressScale);
  pressTweens.set(
    button,
    scene.tweens.add({ targets: button, scale: 1, duration: Tokens.Timing.buttonPressMs, ease: 'Back.easeOut' }),
  );
}

/** Slow endless bob (button-play "Nhún chậm"); Story 2.4: `px` sets the height (reduced motion). */
export function startBob(scene: Scene, target: GameObjects.Container, px: number = Tokens.ui.playBobPx): Tweens.Tween {
  return scene.tweens.add({
    targets: target,
    y: target.y - px,
    duration: Tokens.Timing.playBobMs,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });
}
