// Story 5.3: the scene adapter of core/skip — clocks scaled, camera effects driven to their end, SFX held, SHUTDOWN ends.
import { describe, expect, it, vi } from 'vitest';
import { createSceneSkip, type CameraEffectLike, type SkipSceneLike } from './skip-scene';
import { Tokens } from './tokens';

function effect(running: boolean) {
  const e = {
    isRunning: running,
    duration: 1200,
    update: vi.fn((_t: number, delta: number) => {
      if (delta >= e.duration) e.isRunning = false;
    }),
    effectComplete: vi.fn(() => {
      e.isRunning = false;
    }),
  };
  return e satisfies CameraEffectLike;
}

function fakeScene() {
  const handlers = new Map<string, Set<() => void>>();
  const once = new Map<string, () => void>();
  const pan = effect(true);
  const zoom = effect(true);
  const fade = effect(false);
  const scene = {
    tweens: { timeScale: 1 },
    time: { timeScale: 1, now: 0 },
    events: {
      on: (ev: string, fn: () => void) => void (handlers.get(ev) ?? handlers.set(ev, new Set()).get(ev)!).add(fn),
      off: (ev: string, fn: () => void) => void handlers.get(ev)?.delete(fn),
      once: (ev: string, fn: () => void) => void once.set(ev, fn),
    },
    cameras: { main: { panEffect: pan, zoomEffect: zoom, fadeEffect: fade } },
  } satisfies SkipSceneLike;
  return {
    scene,
    pan,
    zoom,
    fade,
    emit: (ev: string) => {
      for (const fn of handlers.get(ev) ?? []) fn();
      once.get(ev)?.();
      once.delete(ev);
    },
    listeners: (ev: string) => handlers.get(ev)?.size ?? 0,
  };
}

describe('createSceneSkip', () => {
  it('a skip scales tweens and clock, finishes running camera effects, holds SFX and cuts voice; end restores', () => {
    const f = fakeScene();
    const audio = { holdSfx: vi.fn(), stop: vi.fn() };
    const skip = createSceneSkip(f.scene, audio);
    skip.begin(2200);
    skip.voice(5);
    f.scene.time.now = Tokens.Timing.skipArmMs;
    skip.tap();
    expect(f.scene.tweens.timeScale).toBe(Tokens.Timing.skipTimeScale);
    expect(f.scene.time.timeScale).toBe(Tokens.Timing.skipTimeScale);
    expect(f.pan.update).toHaveBeenCalledWith(Tokens.Timing.skipArmMs, f.pan.duration);
    expect(f.zoom.isRunning).toBe(false);
    expect(f.fade.update).not.toHaveBeenCalled();
    expect(audio.holdSfx).toHaveBeenLastCalledWith(true);
    expect(audio.stop).toHaveBeenCalledWith(5);
    // An effect started later during the skip is finished on the next scene update.
    f.fade.isRunning = true;
    f.emit('update');
    expect(f.fade.isRunning).toBe(false);
    skip.end();
    expect(f.scene.tweens.timeScale).toBe(1);
    expect(f.scene.time.timeScale).toBe(1);
    expect(audio.holdSfx).toHaveBeenLastCalledWith(false);
    expect(f.listeners('update')).toBe(0);
  });

  it('SHUTDOWN ends a running skip', () => {
    const f = fakeScene();
    const audio = { holdSfx: vi.fn(), stop: vi.fn() };
    const skip = createSceneSkip(f.scene, audio);
    skip.begin(3000);
    f.scene.time.now = 1000;
    skip.tap();
    f.emit('shutdown');
    expect(skip.skipping).toBe(false);
    expect(f.scene.time.timeScale).toBe(1);
    expect(audio.holdSfx).toHaveBeenLastCalledWith(false);
  });
});
