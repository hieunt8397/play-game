// Phi công nhí (2026-11-11): the plane scene with Phaser stubbed and a fake AudioDirector: it opens in free play with
// the plane parked and the invitation; a tap on the parked plane takes off; Home on the grass leaves nothing, Home in
// mid-flight hands the snapshot on round:leave and the next visit resumes the flight; a bad resume starts a fresh
// take-off; a full flight (three balloons, the house, the drop, the fly-off) goes on to another friend; the sky target
// steers by press and move and keeps the height on a lift.
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
const { inputGuard } = await import('../../core/input/guard');
const { LAYOUTS } = await import('../../content/layouts');
const { ANCHORS, BALLOONS_LINE, FRIENDS, GIFTS_PER_FLIGHT, PROMPT_LINE, friendHit } = await import('../../content/games/plane');
const { Tokens } = await import('../../core/tokens');
const { Plane } = await import('./Plane');
const { defaultFlightTimings } = await import('./flight');

type Ctl = {
  tapPlane(): boolean;
  tapFriend(): boolean;
  press(p: { x: number; y: number }): string;
  lift(): void;
  readonly phase: string;
  readonly friend: keyof typeof FRIENDS;
  readonly gifts: readonly string[];
  readonly planeY: number;
  readonly targetY: number;
  readonly balloon: { x: number; y: number } | null;
  readonly busy: boolean;
};
type Stub = InstanceType<typeof Plane> & { emit(ev: string): void; advance(ms: number): void; input: { on: ReturnType<typeof vi.fn> } };
const ctl = (scene: Stub): Ctl => (scene as unknown as { ctl: Ctl }).ctl;
const T = defaultFlightTimings();
const layout = LAYOUTS.plane;

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
  const scene = new Plane() as Stub;
  scene.init({ level: 0, seed: 11, ...(resume ? { resume } : {}) } as never);
  scene.create();
  return { scene, events, payloads, off: () => offs.forEach((o) => o()) };
}

/** Plays `ms` of scene time in 50 ms frames. */
const run = (scene: Stub, ms: number): void => {
  for (let t = 0; t < ms; t += 50) {
    scene.update(0, 50);
    scene.advance(50);
  }
};
const until = (scene: Stub, done: () => boolean, maxMs = 120000): boolean => {
  for (let t = 0; t < maxMs && !done(); t += 50) run(scene, 50);
  return done();
};
/** Takes off and waits until the plane flies. */
const takeOff = (scene: Stub): void => {
  expect(ctl(scene).tapPlane()).toBe(true);
  expect(until(scene, () => ctl(scene).phase === 'fly')).toBe(true);
};
/** Steers to each balloon until `n` gifts are on board. */
const catchGifts = (scene: Stub, n: number): void => {
  while (ctl(scene).gifts.length < n) {
    expect(until(scene, () => ctl(scene).balloon !== null)).toBe(true);
    ctl(scene).press({ x: 700, y: ctl(scene).balloon!.y });
    ctl(scene).lift();
    const had = ctl(scene).gifts.length;
    expect(until(scene, () => ctl(scene).gifts.length > had)).toBe(true);
  }
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  Plane.resetSession();
  inputGuard.reset();
});

describe('Plane scene (Phi công nhí)', () => {
  it('the real layout: the plane anchors share one x; every friend has a hull', () => {
    expect(layout.anchors[ANCHORS.plane]!.x).toBeCloseTo(layout.anchors[ANCHORS.ground]!.x, 0);
    for (const f of Object.keys(FRIENDS) as (keyof typeof FRIENDS)[]) expect(layout.hits[friendHit(f)], f).toBeDefined();
  });

  it('opens in free play: round:complete once (no next round), the plane parked, the invitation; a tap on it takes off and "touch the balloons"', () => {
    const { scene, events, off } = open();
    expect(events).toEqual(['complete']);
    expect(ctl(scene).phase).toBe('ground');
    expect(fake.audio.say).toHaveBeenCalledWith(PROMPT_LINE);
    expect(fake.audio.setPrompt).toHaveBeenLastCalledWith(PROMPT_LINE);
    takeOff(scene);
    expect(fake.audio.sfx).toHaveBeenCalledWith('sfx.plane.propeller');
    expect(fake.audio.say).toHaveBeenLastCalledWith(BALLOONS_LINE);
    run(scene, Tokens.Timing.nextRoundDelayMs + 2000);
    expect(events).toEqual(['complete']);
    scene.emit('shutdown');
    off();
  });

  it('Home on the grass: round:leave with no snapshot', () => {
    const { scene, events, payloads, off } = open();
    bus.emit('hud:home');
    expect(events).toEqual(['complete', 'leave']);
    expect(payloads[0]).toEqual({ gameId: 'plane' });
    scene.emit('shutdown');
    off();
  });

  it('Home in mid-flight: round:leave keeps the flight; nothing plays after; the next visit resumes it in the air with its gifts', () => {
    const { scene, events, payloads, off } = open();
    takeOff(scene);
    catchGifts(scene, 1);
    const f = ctl(scene).friend;
    const gifts = [...ctl(scene).gifts];
    bus.emit('hud:home');
    expect(events).toEqual(['complete', 'leave']);
    const snapshot = (payloads[0] as { snapshot: { partial: { friend: string; gifts: string[] } } }).snapshot;
    expect(snapshot.partial).toMatchObject({ friend: f, gifts });
    fake.audio.say.mockClear();
    fake.audio.sayChain.mockClear();
    run(scene, 30000);
    expect(fake.audio.say).not.toHaveBeenCalled();
    expect(fake.audio.sayChain).not.toHaveBeenCalled();
    scene.emit('shutdown');
    off();

    const again = open(snapshot);
    expect(ctl(again.scene).phase).toBe('fly');
    expect(ctl(again.scene).friend).toBe(f);
    expect(ctl(again.scene).gifts).toEqual(gifts);
    expect(ctl(again.scene).busy).toBe(false);
    expect(fake.audio.say).toHaveBeenCalledWith(BALLOONS_LINE);
    again.scene.emit('shutdown');
    again.off();
  });

  it('a bad resume warns and starts a fresh take-off', () => {
    const { scene, off } = open({ v: 1, level: 0, seed: 11, questionIndex: 0, partial: { friend: 'dragon', gifts: [], surprise: 'rainbow' } });
    expect(ctl(scene).phase).toBe('ground');
    expect(console.warn).toHaveBeenCalledWith('plane: bad resume — a fresh take-off');
    scene.emit('shutdown');
    off();
  });

  it('a full flight: three gifts, the house, a tap on the friend drops them, its call, the fly-off, then another friend', () => {
    const { scene, events, off } = open();
    takeOff(scene);
    const f = ctl(scene).friend;
    catchGifts(scene, GIFTS_PER_FLIGHT);
    expect(until(scene, () => ctl(scene).phase === 'house')).toBe(true);
    expect(fake.audio.setPrompt).toHaveBeenLastCalledWith(FRIENDS[f].dropLine);
    // A tap on the friend's hull through the router.
    const on = scene.input.on.mock.calls as [string, (p: unknown) => void][];
    const handler = (ev: string) => on.find(([e]) => e === ev)?.[1];
    const hull = layout.hits[friendHit(f)]!;
    const c = { x: hull.reduce((s, p) => s + p.x, 0) / hull.length, y: hull.reduce((s, p) => s + p.y, 0) / hull.length };
    const pointer = { id: 1, downTime: 5, isDown: true, x: c.x, y: c.y, worldX: c.x, worldY: c.y };
    handler('pointerdown')?.(pointer);
    handler('pointerup')?.({ ...pointer, isDown: false });
    expect(ctl(scene).phase).toBe('drop');
    expect(ctl(scene).friend).not.toBe(f);
    expect(until(scene, () => ctl(scene).phase === 'fly')).toBe(true);
    expect(fake.audio.sfx).toHaveBeenCalledWith(FRIENDS[f].callSfx);
    expect(fake.audio.sfx).toHaveBeenCalledWith('sfx.plane.whoosh');
    expect(events).toEqual(['complete']);
    scene.emit('shutdown');
    off();
  });

  it('the sky target: a press sets the height, a move follows the finger, a lift keeps it', () => {
    const { scene, off } = open();
    takeOff(scene);
    const on = scene.input.on.mock.calls as [string, (p: unknown) => void][];
    const handler = (ev: string) => on.find(([e]) => e === ev)?.[1];
    const p = (y: number, down = true) => ({ id: 1, downTime: 3, isDown: down, x: 600, y, worldX: 600, worldY: y });
    handler('pointerdown')?.(p(250));
    expect(ctl(scene).targetY).toBe(250);
    handler('pointermove')?.(p(400));
    expect(ctl(scene).targetY).toBe(400);
    handler('pointerup')?.(p(400, false));
    run(scene, 3000);
    expect(ctl(scene).planeY).toBeCloseTo(400, 0);
    scene.emit('shutdown');
    off();
  });

  it('the parked plane: a press on it through the router takes off; a press far from it leaves it parked', () => {
    const { scene, off } = open();
    const on = scene.input.on.mock.calls as [string, (p: unknown) => void][];
    const handler = (ev: string) => on.find(([e]) => e === ev)?.[1];
    const tap = (x: number, y: number, downTime: number): void => {
      const p = { id: 1, downTime, isDown: true, x, y, worldX: x, worldY: y };
      handler('pointerdown')?.(p);
      handler('pointerup')?.({ ...p, isDown: false });
    };
    tap(700, 200, 1);
    expect(ctl(scene).phase).toBe('ground');
    const at = layout.anchors[ANCHORS.ground]!;
    tap(at.x, at.y, 2);
    expect(ctl(scene).phase).toBe('takeoff');
    scene.emit('shutdown');
    off();
  });

  it('shutdown clears its own Speaker prompt', () => {
    const { scene, off } = open();
    scene.emit('shutdown');
    expect(fake.audio.clearPrompt).toHaveBeenCalledWith(PROMPT_LINE);
    off();
  });

  it('timings: the take-off and fly-off are skippable, a drop stays within 1.5 s', () => {
    expect(T.takeOffMs).toBeGreaterThan(T.skipOverMs);
    expect(T.flyOffMs).toBeGreaterThan(T.skipOverMs);
    expect(T.dropMs).toBeLessThanOrEqual(1500);
  });
});
