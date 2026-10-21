// I/O matrix (Story 1.2): "First tap", "Double tap" and "Overlay" rows; Story 1.3: "Start greeting"; with fakes for the audio
// director and the overlay scene's ScenePlugin.
import { describe, expect, it, vi } from 'vitest';
import { createStartTap, SuspendOverlayController, type OverlayHost } from './shell-flow';

/** Lets pending promise callbacks run. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function fakeAudio(unlock: () => Promise<boolean> = async () => true) {
  const calls: string[] = [];
  return {
    calls,
    sfx: vi.fn((id: string) => void calls.push(`sfx:${id}`)),
    music: vi.fn((id: string) => void calls.push(`music:${id}`)),
    unlock: vi.fn(() => {
      calls.push('unlock');
      return unlock();
    }),
    say: vi.fn((id: string) => (calls.push(`say:${id}`), 1)),
  };
}

describe('Start tap', () => {
  it('first tap: pop, music, unlock inside the gesture, init once, then leave', () => {
    const audio = fakeAudio();
    const initStore = vi.fn(async () => undefined);
    const leave = vi.fn(() => void audio.calls.push('leave'));
    createStartTap({ audio, initStore, leave })();
    // Story 5.2: the greeting is said on the island (map-guide), not on Start.
    expect(audio.calls).toEqual(['sfx:sfx.shell.pop', 'music:music.island', 'unlock', 'leave']);
    expect(audio.say).not.toHaveBeenCalled();
    expect(initStore).toHaveBeenCalledTimes(1);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('double tap: the second tap is ignored (init, music and leave happen once)', () => {
    const audio = fakeAudio();
    const initStore = vi.fn(async () => undefined);
    const leave = vi.fn();
    const tap = createStartTap({ audio, initStore, leave });
    tap();
    tap();
    expect(audio.music).toHaveBeenCalledTimes(1);
    expect(audio.sfx).toHaveBeenCalledTimes(1);
    expect(initStore).toHaveBeenCalledTimes(1);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('leaves even when the unlock never resolves', () => {
    const audio = fakeAudio(() => new Promise<boolean>(() => undefined));
    const leave = vi.fn();
    createStartTap({ audio, initStore: async () => undefined, leave })();
    expect(leave).toHaveBeenCalledTimes(1);
  });
});

function fakeHost(active: string[]) {
  const log: string[] = [];
  const host = {
    log,
    otherActiveKeys: vi.fn(() => [...active]),
    pause: vi.fn((key: string) => void log.push(`pause:${key}`)),
    resume: vi.fn((key: string) => void log.push(`resume:${key}`)),
    show: vi.fn(() => void log.push('show')),
    hide: vi.fn(() => void log.push('hide')),
  };
  return host satisfies OverlayHost & { log: string[] };
}

describe('AudioUnlockOverlay controller', () => {
  it('cover pauses the running scenes and shows the overlay; a second cover is a no-op', () => {
    const host = fakeHost(['Map']);
    const overlay = new SuspendOverlayController({ host, unlock: async () => true, emitResumed: vi.fn() });
    overlay.cover();
    overlay.cover();
    expect(host.log).toEqual(['pause:Map', 'show']);
    expect(overlay.isCovering).toBe(true);
  });

  it('tap → unlock → resumes exactly the paused scene, hides, emits audio:resumed once', async () => {
    const host = fakeHost(['Map']);
    const emitResumed = vi.fn();
    const unlock = vi.fn(async () => true);
    const overlay = new SuspendOverlayController({ host, unlock, emitResumed });
    overlay.cover();
    const first = overlay.tap();
    const second = overlay.tap(); // double tap while the unlock is pending
    await Promise.all([first, second]);
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(host.log).toEqual(['pause:Map', 'show', 'resume:Map', 'hide']);
    expect(emitResumed).toHaveBeenCalledTimes(1);
    expect(overlay.isCovering).toBe(false);
    expect(host.otherActiveKeys).toHaveBeenCalledTimes(1);
  });

  it('stays up when audio is still suspended after the tap, and a later tap resumes', async () => {
    const host = fakeHost(['Map']);
    const emitResumed = vi.fn();
    const unlock = vi.fn(async () => false);
    const overlay = new SuspendOverlayController({ host, unlock, emitResumed });
    overlay.cover();
    await overlay.tap();
    expect(host.resume).not.toHaveBeenCalled();
    expect(host.hide).not.toHaveBeenCalled();
    expect(emitResumed).not.toHaveBeenCalled();
    expect(overlay.isCovering).toBe(true);

    unlock.mockResolvedValueOnce(true);
    await overlay.tap();
    await flush();
    expect(host.log).toEqual(['pause:Map', 'show', 'resume:Map', 'hide']);
    expect(emitResumed).toHaveBeenCalledTimes(1);
  });

  it('a tap while not covering does nothing', async () => {
    const host = fakeHost(['Map']);
    const unlock = vi.fn(async () => true);
    const overlay = new SuspendOverlayController({ host, unlock, emitResumed: vi.fn() });
    await overlay.tap();
    expect(unlock).not.toHaveBeenCalled();
    expect(host.log).toEqual([]);
  });

  it('covers again after a resume (next stuck return)', async () => {
    const host = fakeHost(['Map']);
    const overlay = new SuspendOverlayController({ host, unlock: async () => true, emitResumed: vi.fn() });
    overlay.cover();
    await overlay.tap();
    overlay.cover();
    expect(host.log).toEqual(['pause:Map', 'show', 'resume:Map', 'hide', 'pause:Map', 'show']);
  });
});
