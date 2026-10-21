// Test fakes for core/input (Story 1.6): a scene with a fake input plugin and Phaser-like pointers.
// Imported only by *.test.ts files.
import { vi } from 'vitest';
import type { GuardPointer } from './guard';

export interface FakePointer extends GuardPointer {
  isDown: boolean;
  downTime: number;
  x: number;
  y: number;
  event?: unknown;
}

let clock = 0;

/** A fresh pressed pointer in slot `id` at (x, y) (no DOM event: the point is used as is). */
export function press(x: number, y: number, id = 1): FakePointer {
  clock += 1;
  return { id, x, y, downTime: clock, isDown: true };
}

export function fakeScene() {
  const listeners = new Map<string, Set<(p: GuardPointer) => void>>();
  const once = new Map<string, () => void>();
  const sceneEvents = new Map<string, Set<() => void>>();
  const state = { active: true };
  const emit = (ev: string, p: GuardPointer): void => {
    for (const fn of [...(listeners.get(ev) ?? [])]) fn(p);
  };
  return {
    state,
    sys: { isActive: () => state.active },
    input: {
      on: vi.fn((ev: string, fn: (p: GuardPointer) => void) => {
        let set = listeners.get(ev);
        if (!set) listeners.set(ev, (set = new Set()));
        set.add(fn);
      }),
      off: vi.fn((ev: string, fn: (p: GuardPointer) => void) => {
        listeners.get(ev)?.delete(fn);
      }),
    },
    events: {
      once: (ev: string, fn: () => void) => once.set(ev, fn),
      on: (ev: string, fn: () => void) => {
        let set = sceneEvents.get(ev);
        if (!set) sceneEvents.set(ev, (set = new Set()));
        set.add(fn);
      },
      off: (ev: string, fn: () => void) => {
        sceneEvents.get(ev)?.delete(fn);
      },
    },
    /** Story 5.1: the scene pauses (inactive, then the 'pause' scene event). */
    pause: () => {
      state.active = false;
      for (const fn of [...(sceneEvents.get('pause') ?? [])]) fn();
    },
    down: (p: GuardPointer) => emit('pointerdown', p),
    /** Story 1.8: moves `p` to (x, y) and emits pointermove. */
    move: (p: FakePointer, x: number, y: number) => {
      p.x = x;
      p.y = y;
      emit('pointermove', p);
    },
    up: (p: FakePointer) => {
      p.isDown = false;
      emit('pointerup', p);
    },
    /** Press and release at (x, y); returns the pointer. */
    tap(x: number, y: number, id = 1): FakePointer {
      const p = press(x, y, id);
      emit('pointerdown', p);
      p.isDown = false;
      emit('pointerup', p);
      return p;
    },
    listenerCount: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
    shutdown: () => once.get('shutdown')?.(),
  };
}

export type FakeScene = ReturnType<typeof fakeScene>;
