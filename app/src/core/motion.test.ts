import { describe, expect, it, vi } from 'vitest';
import {
  enterPlan,
  enterStation,
  fadeOutScene,
  FADE_IN_COMPLETE,
  FADE_OUT_COMPLETE,
  pullBack,
  pullBackPlan,
  revealScene,
  ZOOM_COMPLETE,
  type CameraLike,
  type PullBackCameraLike,
} from './motion';
import { Timing } from './timing';
import { Tokens } from './tokens';

function fakeCamera() {
  const handlers = new Map<string, () => void>();
  const cam = {
    pan: vi.fn(),
    zoomTo: vi.fn(),
    fadeOut: vi.fn(),
    fadeIn: vi.fn(),
    once: vi.fn((ev: string, fn: () => void) => handlers.set(ev, fn)),
  } satisfies CameraLike;
  return { cam, fire: (ev: string) => handlers.get(ev)?.() };
}

describe('enterPlan', () => {
  it('normal: zoom to cameraZoomScale over cameraZoomInMs', () => {
    expect(enterPlan(false)).toEqual({ kind: 'zoom', zoom: Tokens.ui.cameraZoomScale, ms: Timing.cameraZoomInMs });
  });

  it('reduced motion: a 300 ms fade, no zoom', () => {
    expect(enterPlan(true)).toEqual({ kind: 'fade', ms: Timing.sceneFadeMs });
    expect(Timing.sceneFadeMs).toBe(300);
  });
});

describe('enterStation / revealScene', () => {
  it('normal: pans to the focus and zooms; resolves on zoom complete', async () => {
    const { cam, fire } = fakeCamera();
    const done = vi.fn();
    const p = enterStation({ cameras: { main: cam } }, { x: 200, y: 300 }, false).then(done);
    expect(cam.pan).toHaveBeenCalledWith(200, 300, Timing.cameraZoomInMs, expect.any(String), true);
    expect(cam.zoomTo).toHaveBeenCalledWith(Tokens.ui.cameraZoomScale, Timing.cameraZoomInMs, expect.any(String), true);
    expect(cam.fadeOut).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    fire(ZOOM_COMPLETE);
    await p;
    expect(done).toHaveBeenCalled();
  });

  it('reduced: fades out to the sky colour, no pan or zoom', async () => {
    const { cam, fire } = fakeCamera();
    const p = enterStation({ cameras: { main: cam } }, { x: 0, y: 0 }, true);
    expect(cam.zoomTo).not.toHaveBeenCalled();
    expect(cam.pan).not.toHaveBeenCalled();
    const v = Tokens.colors.sky.value;
    expect(cam.fadeOut).toHaveBeenCalledWith(Timing.sceneFadeMs, Math.floor(v / 65536), Math.floor(v / 256) % 256, v % 256);
    fire(FADE_OUT_COMPLETE);
    await expect(p).resolves.toBeUndefined();
  });

  it('revealScene fades in over sceneFadeMs', async () => {
    const { cam, fire } = fakeCamera();
    const p = revealScene({ cameras: { main: cam } });
    expect(cam.fadeIn).toHaveBeenCalledWith(Timing.sceneFadeMs, expect.any(Number), expect.any(Number), expect.any(Number));
    fire(FADE_IN_COMPLETE);
    await expect(p).resolves.toBeUndefined();
  });

  it('fadeOutScene (seamless play) fades out to the sky over sceneFadeMs', async () => {
    const { cam, fire } = fakeCamera();
    const p = fadeOutScene({ cameras: { main: cam } });
    expect(cam.fadeOut).toHaveBeenCalledWith(Timing.sceneFadeMs, expect.any(Number), expect.any(Number), expect.any(Number));
    fire(FADE_OUT_COMPLETE);
    await expect(p).resolves.toBeUndefined();
  });
});

describe('pullBackPlan / pullBack (Story 2.3)', () => {
  function fakePullBackCamera() {
    const { cam, fire } = fakeCamera();
    const calls: string[] = [];
    const full = {
      ...cam,
      pan: vi.fn((...a: unknown[]) => calls.push(`pan ${a.slice(0, 3).join(',')}`)),
      zoomTo: vi.fn((...a: unknown[]) => calls.push(`zoomTo ${a.slice(0, 2).join(',')}`)),
      fadeIn: vi.fn((ms: number) => calls.push(`fadeIn ${ms}`)),
      resetFX: vi.fn(() => calls.push('resetFX')),
      setZoom: vi.fn((z: number) => calls.push(`setZoom ${z}`)),
      centerOn: vi.fn((x: number, y: number) => calls.push(`centerOn ${x},${y}`)),
      setScroll: vi.fn((x: number, y: number) => calls.push(`setScroll ${x},${y}`)),
    } satisfies PullBackCameraLike;
    return { cam: full, fire, calls };
  }

  it('normal: zoom cameraZoomScale → 1 over cameraPullBackMs, ease-out', () => {
    expect(pullBackPlan(false)).toEqual({ kind: 'zoom', fromZoom: Tokens.ui.cameraZoomScale, toZoom: 1, ms: 1200, ease: expect.stringMatching(/Out$/) });
    expect(Timing.cameraPullBackMs).toBe(1200);
  });

  it('reduced: a sceneFadeMs (300 ms) fade', () => {
    expect(pullBackPlan(true)).toEqual({ kind: 'fade', ms: 300 });
  });

  it('normal: jumps to the zoomed station view, then pans to the island centre while zooming out', async () => {
    const { cam, fire, calls } = fakePullBackCamera();
    const done = vi.fn();
    const p = pullBack({ cameras: { main: cam } }, { x: 200, y: 300 }, false).then(done);
    const W = Tokens.design.width / 2;
    const H = Tokens.design.height / 2;
    expect(calls).toEqual([
      'resetFX',
      `setZoom ${Tokens.ui.cameraZoomScale}`,
      'centerOn 200,300',
      `pan ${W},${H},${Timing.cameraPullBackMs}`,
      `zoomTo 1,${Timing.cameraPullBackMs}`,
    ]);
    expect(cam.fadeIn).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    fire(ZOOM_COMPLETE);
    await p;
    expect(done).toHaveBeenCalled();
    expect(calls.slice(-2)).toEqual(['setZoom 1', 'setScroll 0,0']);
  });

  it('reduced: zoom 1, scroll 0, then a fade-in; no pan or zoom', async () => {
    const { cam, fire, calls } = fakePullBackCamera();
    const p = pullBack({ cameras: { main: cam } }, { x: 200, y: 300 }, true);
    expect(calls).toEqual(['resetFX', 'setZoom 1', 'setScroll 0,0', `fadeIn ${Timing.sceneFadeMs}`]);
    fire(FADE_IN_COMPLETE);
    await expect(p).resolves.toBeUndefined();
  });
});
