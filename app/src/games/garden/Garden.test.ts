// Trồng cây (2026-10-30): the garden scene with Phaser stubbed and a fake AudioDirector: it opens in free play with two
// packets and the invitation; Home with bare soil leaves nothing, Home mid-plant hands the snapshot on round:leave and
// the next visit resumes it; a bad resume starts on fresh soil; a full cycle ends in new packets.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  /** A chainable display-object stub: every method returns itself; `alpha` reads 1. */
  const obj = (): unknown => {
    const o: Record<string | symbol, unknown> = {};
    return new Proxy(o, { get: (_t, k) => (k === 'alpha' ? 1 : k === 'then' ? undefined : () => obj()) });
  };
  class Scene {
    readonly sys: { settings: { key: string }; isActive: () => boolean };
    readonly input = { enabled: true, on: vi.fn(), off: vi.fn(), manager: { pointersTotal: 3 }, addPointer: vi.fn() };
    /** A tiny scene clock: delayed calls run when `advance` passes them. */
    private timers: { at: number; fn: () => void }[] = [];
    readonly time = {
      now: 0,
      timeScale: 1,
      removeAllEvents: () => {
        this.timers = [];
      },
      delayedCall: vi.fn((ms: number, fn: () => void) => {
        this.timers.push({ at: this.time.now + ms, fn });
        return obj();
      }),
    };
    readonly tweens = { timeScale: 1, add: vi.fn(() => obj()), chain: vi.fn(() => obj()), addCounter: vi.fn(() => obj()), killTweensOf: vi.fn() };
    readonly textures = { exists: () => false };
    readonly add = { image: vi.fn(() => obj()), graphics: vi.fn(() => obj()), rectangle: vi.fn(() => obj()), container: vi.fn(() => obj()) };
    readonly scale = { on: vi.fn(), off: vi.fn() };
    readonly cameras = { main: { setBackgroundColor: vi.fn(), fadeIn: vi.fn(), fadeOut: vi.fn(), once: vi.fn() } };
    readonly children = { bringToTop: vi.fn() };
    private readonly fns = new Map<string, Array<() => void>>();
    readonly events = {
      once: (ev: string, fn: () => void) => this.fns.set(ev, [...(this.fns.get(ev) ?? []), fn]),
      on: (ev: string, fn: () => void) => this.fns.set(ev, [...(this.fns.get(ev) ?? []), fn]),
      off: (ev: string, fn?: () => void) => {
        if (fn === undefined) this.fns.delete(ev);
        else this.fns.set(ev, (this.fns.get(ev) ?? []).filter((g) => g !== fn));
      },
    };
    constructor(key: string) {
      this.sys = { settings: { key }, isActive: () => true };
    }
    emit(ev: string): void {
      const fns = this.fns.get(ev) ?? [];
      this.fns.delete(ev);
      for (const fn of fns) fn();
    }
    advance(ms: number): void {
      this.time.now += ms;
      const due = this.timers.filter((t) => t.at <= this.time.now);
      this.timers = this.timers.filter((t) => t.at > this.time.now);
      for (const t of due) t.fn();
    }
  }
  return { Scene };
});

const fake = vi.hoisted(() => ({
  audio: {
    musicId: 'music.island',
    voiceBusy: false,
    sfx: vi.fn(),
    say: vi.fn(() => 1),
    sayChain: vi.fn(() => 1),
    setPrompt: vi.fn(),
    clearPrompt: vi.fn(),
    replayPrompt: vi.fn(),
    stop: vi.fn(),
    fadeOut: vi.fn(),
    holdSfx: vi.fn(),
    music: vi.fn(),
    stopMusic: vi.fn(),
    fadeOutMusic: vi.fn(),
  },
}));

vi.mock('../../core/audio-director', async (orig) => ({ ...(await orig<object>()), audio: fake.audio }));

(globalThis as { window?: object }).window ??= {};

const { bus } = await import('../../core/bus');
const { Tokens } = await import('../../core/tokens');
const { CHOOSE_LINE, FRUITS, PICK_LINE, PROMPT_LINE, WATER_LINE, WATERINGS } = await import('../../content/games/garden');
const { Garden } = await import('./Garden');
const { eatMs, defaultGardenTimings } = await import('./cycle');

type Ctl = {
  tapPacket(i: number): boolean;
  tapCan(): boolean;
  tapFruit(n: number): boolean;
  readonly phase: string;
  readonly kind: string | null;
  readonly offer: readonly string[];
  readonly left: readonly number[];
  readonly surprise: string | null;
  readonly busy: boolean;
};
type Stub = InstanceType<typeof Garden> & { emit(ev: string): void; advance(ms: number): void };
const ctl = (scene: Stub): Ctl => (scene as unknown as { ctl: Ctl }).ctl;
const T = defaultGardenTimings();

function open(resume?: object): { scene: Stub; events: string[]; payloads: unknown[]; off: () => void } {
  const events: string[] = [];
  const payloads: unknown[] = [];
  const offs = [
    bus.on('round:complete', () => events.push('complete')),
    bus.on('round:next', () => events.push('next')),
    bus.on('round:leave', (p) => {
      events.push('leave');
      payloads.push(p);
    }),
    bus.on('round:abandon', () => events.push('abandon')),
  ];
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const scene = new Garden() as Stub;
  scene.init({ level: 0, seed: 11, ...(resume ? { resume } : {}) } as never);
  scene.create();
  return { scene, events, payloads, off: () => offs.forEach((o) => o()) };
}

/** Plays `ms` of scene time in 50 ms frames (the controller and the scene's delayed calls). */
const run = (scene: Stub, ms: number): void => {
  for (let t = 0; t < ms; t += 50) {
    scene.update(0, 50);
    scene.advance(50);
  }
};
/** Waits until nothing runs (each animation, a surprise). */
const settle = (scene: Stub): void => {
  for (let k = 0; k < 200 && ctl(scene).busy; k++) run(scene, 50);
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  Garden.resetSession();
});

describe('Garden scene (Trồng cây)', () => {
  it('opens in free play: round:complete once (no next round), two packets, the invitation then "choose a seed"', () => {
    const { scene, events, off } = open();
    expect(events).toEqual(['complete']);
    expect(ctl(scene).phase).toBe('choose');
    expect(new Set(ctl(scene).offer).size).toBe(2);
    expect(fake.audio.sayChain).toHaveBeenCalledWith([PROMPT_LINE, CHOOSE_LINE]);
    expect(fake.audio.setPrompt).toHaveBeenLastCalledWith(CHOOSE_LINE);
    run(scene, Tokens.Timing.nextRoundDelayMs + 2000);
    expect(events).toEqual(['complete']);
    scene.emit('shutdown');
    off();
  });

  it('Home with bare soil: round:leave with no snapshot', () => {
    const { scene, events, payloads, off } = open();
    run(scene, 1000);
    bus.emit('hud:home');
    expect(events).toEqual(['complete', 'leave']);
    expect(payloads[0]).toEqual({ gameId: 'garden' });
    scene.emit('shutdown');
    off();
  });

  it('Home mid-plant: round:leave keeps the half-grown plant; nothing plays after; the next visit resumes it', () => {
    const { scene, events, payloads, off } = open();
    settle(scene);
    expect(ctl(scene).tapPacket(1)).toBe(true);
    const kind = ctl(scene).kind;
    settle(scene);
    expect(ctl(scene).tapCan()).toBe(true);
    settle(scene);
    bus.emit('hud:home');
    expect(events).toEqual(['complete', 'leave']);
    const snapshot = (payloads[0] as { snapshot: { partial: { kind: string; waterings: number; left: number[] } } }).snapshot;
    expect(snapshot.partial).toMatchObject({ kind, waterings: 1, left: [] });
    fake.audio.say.mockClear();
    fake.audio.sayChain.mockClear();
    run(scene, 30000);
    expect(fake.audio.say).not.toHaveBeenCalled();
    expect(fake.audio.sayChain).not.toHaveBeenCalled();
    scene.emit('shutdown');
    off();

    const again = open(snapshot);
    expect(ctl(again.scene).kind).toBe(kind);
    expect(ctl(again.scene).phase).toBe('grow');
    expect(fake.audio.say).toHaveBeenCalledWith(WATER_LINE);
    expect(fake.audio.sayChain).not.toHaveBeenCalledWith([PROMPT_LINE, CHOOSE_LINE]);
    again.scene.emit('shutdown');
    again.off();
  });

  it('a bad resume warns and starts on fresh soil', () => {
    const { scene, off } = open({ v: 1, level: 0, seed: 11, questionIndex: 0, partial: { offer: ['lemon', 'lemon'], kind: 'lemon', waterings: 1, left: [], surprise: 'worm' } });
    expect(ctl(scene).phase).toBe('choose');
    expect(console.warn).toHaveBeenCalledWith('garden: bad resume — fresh soil');
    scene.emit('shutdown');
    off();
  });

  it('a full cycle: plant, three waterings, three fruits eaten, then new packets; no round event beyond the first', () => {
    const { scene, events, off } = open();
    settle(scene);
    expect(ctl(scene).tapPacket(0)).toBe(true);
    const kind = ctl(scene).kind as keyof typeof FRUITS;
    settle(scene);
    for (let w = 0; w < WATERINGS; w++) {
      expect(ctl(scene).tapCan()).toBe(true);
      expect(ctl(scene).tapCan()).toBe(false);
      settle(scene);
    }
    expect(ctl(scene).phase).toBe('fruit');
    expect(fake.audio.sayChain).toHaveBeenLastCalledWith([FRUITS[kind].nameLine, PICK_LINE]);
    for (const n of [2, 0, 1]) {
      expect(ctl(scene).tapFruit(n)).toBe(true);
      run(scene, eatMs(1, T));
      settle(scene);
    }
    expect(ctl(scene).phase).toBe('choose');
    expect(ctl(scene).kind).toBeNull();
    expect(fake.audio.say).toHaveBeenLastCalledWith(CHOOSE_LINE);
    expect(fake.audio.sfx).toHaveBeenCalledWith('sfx.garden.pour');
    expect(fake.audio.sfx).toHaveBeenCalledWith(FRUITS[kind].biteSfx);
    expect(events).toEqual(['complete']);
    scene.emit('shutdown');
    off();
  });

  it('shutdown clears its own Speaker prompt', () => {
    const { scene, off } = open();
    scene.emit('shutdown');
    expect(fake.audio.clearPrompt).toHaveBeenCalledWith(CHOOSE_LINE);
    off();
  });
});
