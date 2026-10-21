// Story 5.4: attachTapReactions — a visible sprite bounces at its base with "pụp"; a hidden, alpha-0 or
// destroyed sprite is skipped (the tap falls through); a background tap draws one ripple.
import { describe, expect, it, vi } from 'vitest';
import type { GameObjects, Scene } from 'phaser';

vi.mock('../audio-director', () => ({ audio: { sfx: vi.fn() } }));

const { audio } = await import('../audio-director');
const { fakeScene } = await import('../input/fakes');
const { InputGuard } = await import('../input/guard');
const { createTapRouter } = await import('../input/tap-router');
const { Tokens } = await import('../tokens');
const { attachTapReactions, TAP_REACT_SFX } = await import('./tap-reactions');

function fakePhaser() {
  const tweens: Array<Record<string, unknown>> = [];
  const graphics: Array<Record<string, unknown>> = [];
  const scene = {
    time: { now: 0 },
    add: {
      graphics: vi.fn((cfg: { x: number; y: number }) => {
        const g: Record<string, unknown> = { ...cfg };
        g.setDepth = (d: number) => ((g.depth = d), g);
        g.lineStyle = () => g;
        g.strokeCircle = (_x: number, _y: number, r: number) => ((g.r = r), g);
        g.destroy = () => void (g.destroyed = true);
        graphics.push(g);
        return g;
      }),
    },
    tweens: {
      add: vi.fn((cfg: Record<string, unknown>) => {
        tweens.push(cfg);
        return { stop: vi.fn(), isPlaying: () => true };
      }),
    },
  };
  return { scene: scene as unknown as Scene, tweens, graphics, time: scene.time };
}

/** An image at (x, y) with a w×h bounds box and scale `s`. */
function image(x: number, y: number, w: number, h: number, s = 0.5) {
  const img: Record<string, unknown> = { x, y, scaleX: s, scaleY: s, scale: s, alpha: 1, visible: true, scene: {} };
  img.setScale = (k: number) => ((img.scale = k), (img.scaleX = k), (img.scaleY = k), img);
  img.getBounds = () => ({ x: x - w / 2, y: y - h / 2, width: w, height: h });
  return img;
}

function world() {
  const phaser = fakePhaser();
  const input = fakeScene();
  const router = createTapRouter(input, { guard: new InputGuard() });
  const reactions = attachTapReactions(phaser.scene, router, { reduced: false });
  vi.mocked(audio.sfx).mockClear();
  return { ...phaser, input, router, reactions };
}

const asImage = (o: Record<string, unknown>): GameObjects.Image => o as unknown as GameObjects.Image;

describe('attachTapReactions', () => {
  it('a visible sprite bounces at its base and plays sfx.shell.pop; no ripple', () => {
    const w = world();
    const img = image(300, 300, 100, 100, 0.5);
    w.reactions.add({ image: asImage(img) });
    w.input.tap(300, 300);
    expect(w.tweens).toHaveLength(1);
    expect(w.tweens[0]).toMatchObject({ targets: img, scale: 0.5 * Tokens.components.tappableProp.react.scale });
    expect(audio.sfx).toHaveBeenCalledExactlyOnceWith(TAP_REACT_SFX);
    expect(TAP_REACT_SFX).toBe('sfx.shell.pop');
    expect(w.graphics).toHaveLength(0);
  });

  it('the default area is the bounds padded by tappableProp.hitPad', () => {
    const w = world();
    w.reactions.add({ image: asImage(image(300, 300, 100, 100)) });
    w.input.tap(300 + 50 + Tokens.components.tappableProp.hitPad - 1, 300);
    expect(audio.sfx).toHaveBeenCalledOnce();
  });

  it.each([
    ['hidden', (o: Record<string, unknown>): void => {
      o.visible = false;
    }],
    ['alpha 0', (o: Record<string, unknown>): void => {
      o.alpha = 0;
    }],
    ['destroyed', (o: Record<string, unknown>): void => {
      o.scene = undefined;
    }],
  ] as const)('a %s sprite is skipped: the sprite under it bounces, else a ripple', (_name, hide) => {
    const w = world();
    const under = image(300, 300, 100, 100);
    const top = image(300, 300, 100, 100);
    w.reactions.add({ image: asImage(under) });
    w.reactions.add({ image: asImage(top) });
    hide(top);
    w.input.tap(300, 300);
    expect(w.tweens).toHaveLength(1);
    expect(w.tweens[0]!.targets).toBe(under);
    hide(under);
    w.input.tap(300, 300);
    expect(w.tweens).toHaveLength(2);
    expect(w.graphics).toHaveLength(1);
    expect(audio.sfx).toHaveBeenCalledOnce();
  });

  it('a background tap draws one silent ripple at the press point that grows and fades', () => {
    const w = world();
    w.input.tap(600, 500);
    expect(w.graphics).toHaveLength(1);
    expect(w.graphics[0]).toMatchObject({ x: 600, y: 500, r: Tokens.ui.tapRippleRadiusPx, depth: Tokens.ui.tapRippleDepth });
    expect(w.tweens[0]).toMatchObject({ alpha: 0, scale: Tokens.ui.tapRippleGrowScale, duration: Tokens.Timing.tapRippleMs });
    expect(audio.sfx).not.toHaveBeenCalled();
    w.input.tap(600, 500);
    expect(w.graphics).toHaveLength(1);
  });
});
