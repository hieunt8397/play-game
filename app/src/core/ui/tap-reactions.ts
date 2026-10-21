// Tap reactions in Phaser (Story 5.4, FR33 / FR53): core/tap-react's catch-all target on a scene's
// router, plus the visuals. A registered sprite that is not a router target bounces (core/ui/scale-motion
// `bounce`, tappableProp.react, reduced under reduced motion) with "pụp" (sfx.shell.pop); a press on
// empty background draws a small light ring at the finger that grows and fades (silent, ≤ 1 Hz:
// Timing.tapRippleMinGapMs). Real targets (draggables, the 5.1 catcher, the oven, stations, Map
// decorations) win by z first, so they never reach this. The press point arrives in the router's world
// space (Map: through its camera `toWorld`), so the ring is drawn where the child sees the finger.
import type { GameObjects, Scene } from 'phaser';
import { audio } from '../audio-director';
import { itemBounds, type ItemObject } from '../hint-visuals';
import type { Point } from '../input/polygon';
import type { TapArea } from '../input/tap-target';
import type { TapRouter } from '../input/tap-router';
import { amplitude } from '../reduced-motion';
import { addTapReactTarget, type ReactEntry } from '../tap-react';
import { Tokens } from '../tokens';
import { bounce } from './scale-motion';

/** The "pụp" of a bounced sprite (boot-loaded shell SFX). */
export const TAP_REACT_SFX = 'sfx.shell.pop';

export interface TapReactionsOptions {
  readonly reduced: boolean;
  /** True: every press is ignored (inert scene, skip tap, Map chain). */
  readonly blocked?: () => boolean;
  /** A registered sprite just bounced for `durationMs` (MiniGameBase pauses the ambient tweens). */
  readonly onBounce?: (durationMs: number) => void;
}

export interface ReactSprite {
  readonly image: GameObjects.Image;
  /** The hit area (router world space); default the live trimmed bounds padded by tappableProp.hitPad. */
  readonly area?: TapArea;
  /** The bounce's rest scale; default the image's scaleX when it is added. */
  readonly base?: number;
  /** False: no reaction (its own animation runs); the press falls through to the next entry or background. */
  readonly enabled?: () => boolean;
  /** True: a target the game wants silent (no bounce, no ripple). */
  readonly isTarget?: () => boolean;
}

export interface TapReactions {
  /** Registers a sprite on top of the earlier ones; returns its removal function. */
  add(sprite: ReactSprite): () => void;
  /** Removes the reaction target and every sprite. */
  destroy(): void;
}

/** The live trimmed bounds of `image` padded by `pad` on every side. */
export function paddedBoundsContain(image: GameObjects.Image, p: Point, pad: number = Tokens.components.tappableProp.hitPad): boolean {
  const b = itemBounds(image as unknown as ItemObject);
  return p.x >= b.x - pad && p.x <= b.x + b.width + pad && p.y >= b.y - pad && p.y <= b.y + b.height + pad;
}

function drawRipple(scene: Scene, p: Point, reduced: boolean): void {
  const ring = Tokens.components.hintRing.core;
  const g = scene.add.graphics({ x: p.x, y: p.y }).setDepth(Tokens.ui.tapRippleDepth);
  g.lineStyle(ring.width * Tokens.ui.selectionRingWidthScale, ring.color.value, ring.color.alpha);
  g.strokeCircle(0, 0, Tokens.ui.tapRippleRadiusPx);
  scene.tweens.add({
    targets: g,
    scale: amplitude(Tokens.ui.tapRippleGrowScale, reduced),
    alpha: 0,
    duration: Tokens.Timing.tapRippleMs,
    ease: 'Sine.easeOut',
    onComplete: () => g.destroy(),
  });
}

export function attachTapReactions(scene: Scene, router: TapRouter, opts: TapReactionsOptions): TapReactions {
  let entries: Array<ReactEntry & { readonly sprite: ReactSprite; readonly base: number }> = [];
  let next = 0;
  const react = Tokens.components.tappableProp.react;
  const peak = amplitude(react.scale, opts.reduced);
  const removeTarget = addTapReactTarget(router, {
    rippleMinGapMs: Tokens.Timing.tapRippleMinGapMs,
    now: () => scene.time.now,
    entries: () => entries,
    ...(opts.blocked ? { blocked: opts.blocked } : {}),
    onReaction: (r, p) => {
      if (r.kind === 'ripple') {
        drawRipple(scene, p, opts.reduced);
        return;
      }
      if (r.kind !== 'sprite') return;
      const e = entries.find((x) => x.id === r.id);
      if (!e) return;
      bounce(scene, e.sprite.image, e.base, peak, react.durationMs);
      audio.sfx(TAP_REACT_SFX);
      opts.onBounce?.(react.durationMs);
    },
  });
  return {
    add(sprite) {
      const image = sprite.image;
      const id = `react-${next++}`;
      const entry = {
        id,
        sprite,
        base: sprite.base ?? image.scaleX,
        contains: (p: Point) => (sprite.area ? sprite.area.contains(p) : paddedBoundsContain(image, p)),
        // A destroyed or hidden sprite never reacts.
        enabled: () => Boolean(image.scene) && image.visible && image.alpha > 0 && (sprite.enabled?.() ?? true),
        ...(sprite.isTarget ? { isTarget: sprite.isTarget } : {}),
      };
      entries.push(entry);
      return () => {
        entries = entries.filter((x) => x !== entry);
      };
    },
    destroy() {
      removeTarget();
      entries = [];
    },
  };
}
