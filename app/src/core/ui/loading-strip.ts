// `loading-strip` (DESIGN components.loading-strip, EXPERIENCE State "Đang tải"): a 96 px kart
// driving back and forth on a short road. No text, no progress bar. Drawn with Phaser Graphics
// until the atlas art lands (Story 1.4). Speed is set through the tween's `setTimeScale`.
import type { Scene } from 'phaser';
import type { Rect } from '../safe-rect';
import { Tokens } from '../tokens';

export interface LoadingStrip {
  /** 1 = normal lap speed; < 1 slows the kart (failed load waiting). */
  setTimeScale(scale: number): void;
}

// Geometry relative to the kart size (visual only).
const ROAD = { lengthKarts: 5, heightKarts: 0.42, dashKarts: 0.3, dashGapKarts: 0.25, dashHeight: 0.06 } as const;
const KART = { bodyH: 0.42, bodyY: -0.62, cabinW: 0.42, cabinH: 0.28, cabinX: -0.2, cabinY: -0.9, wheelR: 0.16, wheelX: 0.3, wheelY: -0.18, corner: 0.12 } as const;

export function createLoadingStrip(scene: Scene, area: Rect): LoadingStrip {
  const size = Tokens.components.loadingStrip.kart.size;
  const roadW = size * ROAD.lengthKarts;
  const roadH = size * ROAD.heightKarts;
  const cx = area.x + area.w / 2;
  const cy = area.y + area.h / 2;
  const left = cx - roadW / 2;

  const road = scene.add.graphics();
  road.fillStyle(Tokens.components.loadingStrip.surface.value, Tokens.components.loadingStrip.surface.alpha);
  road.fillRoundedRect(left, cy, roadW, roadH, roadH / 2);
  road.fillStyle(Tokens.colors.roadDash.value, Tokens.colors.roadDash.alpha);
  const dashW = size * ROAD.dashKarts;
  const dashStep = dashW + size * ROAD.dashGapKarts;
  const dashH = size * ROAD.dashHeight;
  for (let x = left + roadH / 2; x + dashW <= left + roadW - roadH / 2; x += dashStep) {
    road.fillRect(x, cy + roadH / 2 - dashH / 2, dashW, dashH);
  }

  // Kart drawn around its own origin = centre bottom of the wheels, sitting on the road's top edge.
  const kart = scene.add.graphics();
  const ink = Tokens.components.buttonRound.icon;
  const body = Tokens.colors.tintPink;
  kart.fillStyle(body.value, body.alpha);
  kart.fillRoundedRect(-size / 2, size * KART.bodyY, size, size * KART.bodyH, size * KART.corner);
  kart.fillStyle(Tokens.colors.tintSky.value, Tokens.colors.tintSky.alpha);
  kart.fillRoundedRect(size * KART.cabinX, size * KART.cabinY, size * KART.cabinW, size * KART.cabinH, size * KART.corner);
  kart.fillStyle(ink.value, ink.alpha);
  kart.fillCircle(-size * KART.wheelX, size * KART.wheelY, size * KART.wheelR);
  kart.fillCircle(size * KART.wheelX, size * KART.wheelY, size * KART.wheelR);
  kart.setPosition(left + size / 2, cy);

  const tween = scene.tweens.add({
    targets: kart,
    x: left + roadW - size / 2,
    duration: Tokens.Timing.loadingKartLapMs,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
    // Face the driving direction.
    onYoyo: () => kart.setScale(-1, 1),
    onRepeat: () => kart.setScale(1, 1),
  });

  return {
    setTimeScale: (scale) => {
      tween.setTimeScale(scale);
    },
  };
}
