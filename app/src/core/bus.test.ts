import { describe, expect, it, vi } from 'vitest';
import { Bus, SCENE_DESTROY, SCENE_SHUTDOWN, type SceneLike } from './bus';

/** Minimal stand-in for Phaser's scene EventEmitter (once/off/emit). */
function fakeScene(): SceneLike & { fire(event: string): void; count(): number } {
  const listeners = new Map<string, Set<() => void>>();
  return {
    events: {
      once(event, fn) {
        const set = listeners.get(event) ?? new Set();
        const wrapped = (): void => {
          set.delete(wrapped);
          fn();
        };
        (wrapped as { original?: () => void }).original = fn;
        set.add(wrapped);
        listeners.set(event, set);
      },
      off(event, fn) {
        const set = listeners.get(event);
        if (!set) return;
        for (const w of set) if ((w as { original?: () => void }).original === fn) set.delete(w);
      },
    },
    fire(event) {
      for (const fn of [...(listeners.get(event) ?? [])]) fn();
    },
    count() {
      let n = 0;
      for (const set of listeners.values()) n += set.size;
      return n;
    },
  };
}

const outcome = { gameId: 'ice-cream', questions: 3, firstTryCorrect: 3, maxHintLevel: 0 } as const;

describe('Bus', () => {
  it('delivers typed payloads to global subscribers and unsubscribes', () => {
    const bus = new Bus();
    const handler = vi.fn();
    const off = bus.on('round:complete', handler);
    bus.emit('round:complete', outcome);
    expect(handler).toHaveBeenCalledWith(outcome);
    off();
    bus.emit('round:complete', outcome);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount('round:complete')).toBe(0);
  });

  it('carries speech:ended { token, completed } (AudioDirector voice channel)', () => {
    const bus = new Bus();
    const handler = vi.fn();
    bus.on('speech:ended', handler);
    bus.emit('speech:ended', { token: 3, completed: false });
    expect(handler).toHaveBeenCalledWith({ token: 3, completed: false });
  });

  it('supports payload-less events', () => {
    const bus = new Bus();
    const handler = vi.fn();
    bus.on('hud:home', handler);
    bus.emit('hud:home');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('keeps delivering when one listener throws', () => {
    const bus = new Bus();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ok = vi.fn();
    bus.on('audio:suspended', () => {
      throw new Error('boom');
    });
    bus.on('audio:suspended', ok);
    bus.emit('audio:suspended');
    expect(ok).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it.each([SCENE_SHUTDOWN, SCENE_DESTROY])('removes scoped listeners on scene %s', (lifecycle) => {
    const bus = new Bus();
    const scene = fakeScene();
    const handler = vi.fn();
    const scoped = bus.scoped(scene);
    scoped.on('hint:level', handler);
    scoped.on('round:complete', handler);
    expect(bus.listenerCount('hint:level')).toBe(1);

    scene.fire(lifecycle);

    expect(bus.listenerCount('hint:level')).toBe(0);
    expect(bus.listenerCount('round:complete')).toBe(0);
    bus.emit('hint:level', { gameId: 'pizza', level: 2 });
    expect(handler).not.toHaveBeenCalled();
    // Both lifecycle hooks are detached so nothing leaks on the scene either.
    expect(scene.count()).toBe(0);
  });

  it('a restarted scene re-subscribes without duplicate delivery', () => {
    const bus = new Bus();
    const scene = fakeScene();
    const first = vi.fn();
    const second = vi.fn();
    bus.scoped(scene).on('round:leave', first);
    scene.fire(SCENE_SHUTDOWN);
    bus.scoped(scene).on('round:leave', second);
    bus.emit('round:leave', { gameId: 'touch-talk' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount('round:leave')).toBe(1);
  });

  it('round:next carries the game id (seamless play 2026-10-21)', () => {
    const bus = new Bus();
    const handler = vi.fn();
    bus.on('round:next', handler);
    bus.emit('round:next', { gameId: 'ice-cream' });
    expect(handler).toHaveBeenCalledWith({ gameId: 'ice-cream' });
    // @ts-expect-error — unknown GameId
    bus.emit('round:next', { gameId: 'tetris' });
  });

  it('gives every subscription of the same function its own entry and its own off', () => {
    const bus = new Bus();
    const shared = vi.fn();
    const offA = bus.on('audio:suspended', shared);
    bus.on('audio:suspended', shared);
    expect(bus.listenerCount('audio:suspended')).toBe(2);
    offA();
    expect(bus.listenerCount('audio:suspended')).toBe(1);
    bus.emit('audio:suspended');
    expect(shared).toHaveBeenCalledTimes(1);
  });

  it('a scene scope ending does not remove another owner subscribing the same function', () => {
    const bus = new Bus();
    const scene = fakeScene();
    const shared = vi.fn();
    bus.on('hud:home', shared);
    bus.scoped(scene).on('hud:home', shared);
    scene.fire(SCENE_SHUTDOWN);
    bus.emit('hud:home');
    expect(shared).toHaveBeenCalledTimes(1);
  });

  it('skips a handler unsubscribed by an earlier listener during the same emit', () => {
    const bus = new Bus();
    const later = vi.fn();
    let offLater = (): void => undefined;
    bus.on('hud:home', () => offLater());
    offLater = bus.on('hud:home', later);
    bus.emit('hud:home');
    expect(later).not.toHaveBeenCalled();
  });

  it('ScopedBus.on returns its unsubscribe function', () => {
    const bus = new Bus();
    const scene = fakeScene();
    const handler = vi.fn();
    const off = bus.scoped(scene).on('audio:suspended', handler);
    off();
    bus.emit('audio:suspended');
    expect(handler).not.toHaveBeenCalled();
    expect(bus.listenerCount('audio:suspended')).toBe(0);
  });

  it('ScopedBus.on after the scope ended is a no-op with a single warning', () => {
    const bus = new Bus();
    const scene = fakeScene();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const scoped = bus.scoped(scene);
    scene.fire(SCENE_DESTROY);
    const handler = vi.fn();
    const off = scoped.on('audio:suspended', handler);
    scoped.on('hud:home', handler);
    expect(bus.listenerCount('audio:suspended')).toBe(0);
    expect(bus.listenerCount('hud:home')).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(() => off()).not.toThrow();
    bus.emit('audio:suspended');
    expect(handler).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('rejects unknown events and wrong payloads at compile time', () => {
    const bus = new Bus();
    // @ts-expect-error — not in EventMap
    bus.emit('foo:bar', {});
    // @ts-expect-error — wrong payload shape
    bus.emit('hint:level', { gameId: 'pizza', level: 9 });
    // @ts-expect-error — unknown GameId
    bus.emit('round:leave', { gameId: 'tetris' });
    // @ts-expect-error — payload-less event takes no payload
    bus.emit('hud:home', {});
    expect(true).toBe(true);
  });
});

describe('Bus › audio events (Story 1.2)', () => {
  it('carries audio:suspended and audio:resumed without a payload', () => {
    const b = new Bus();
    const suspended = vi.fn();
    const resumed = vi.fn();
    b.on('audio:suspended', suspended);
    b.on('audio:resumed', resumed);
    b.emit('audio:suspended');
    b.emit('audio:resumed');
    expect(suspended).toHaveBeenCalledTimes(1);
    expect(suspended).toHaveBeenCalledWith(undefined);
    expect(resumed).toHaveBeenCalledTimes(1);
  });
});
