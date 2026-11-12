// Tên lửa lên Mặt Trăng (2026-11-12): the rocket scene with Phaser stubbed and a fake AudioDirector: it opens in free
// play with the body offered and the invitation; a bubble tap (through the router) fits a part; Home with nothing
// fitted leaves nothing, Home mid-climb hands the snapshot on round:leave and the next visit resumes at the countdown;
// a bad resume starts fresh; a full trip (build, countdown, launch, climb, space, landing, the Moon, home) starts the
// next build.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  const obj = (): unknown => {
    const o: Record<string | symbol, unknown> = {};
    return new Proxy(o, { get: (_t, k) => (k === 'alpha' || k === 'scaleX' || k === 'scaleY' || k === 'scale' ? 1 : k === 'then' ? undefined : () => obj()) });
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
      addEvent: vi.fn(() => obj()),
    };
    readonly tweens = { timeScale: 1, add: vi.fn(() => obj()), chain: vi.fn(() => obj()), addCounter: vi.fn(() => obj()), killTweensOf: vi.fn(), getTweensOf: vi.fn(() => []) };
    readonly textures = { exists: () => false, createCanvas: () => null, remove: vi.fn() };
    readonly add = { image: vi.fn(() => obj()), graphics: vi.fn(() => obj()), rectangle: vi.fn(() => obj()), container: vi.fn(() => obj()) };
    readonly scale = { on: vi.fn(), off: vi.fn() };
    readonly cameras = { main: { setBackgroundColor: vi.fn(), fadeIn: vi.fn(), fadeOut: vi.fn(), once: vi.fn(), shake: vi.fn() } };
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
const { ANCHORS, CHOICES, CRATERS, EARTH_HIT, EARTH_MOON_HIT, LAUNCH_LINE, MOON_LINE, MOON_ROCKET_HIT, PROMPT_LINE, ROCKET_HIT, choiceHit, craterHit, partLine } = await import('../../content/games/rocket');
const { Tokens } = await import('../../core/tokens');
const { Rocket } = await import('./Rocket');
const { defaultTripTimings } = await import('./trip');

type Ctl = {
  tapChoice(n: number): boolean;
  readonly phase: string;
  readonly colours: readonly string[];
  readonly busy: boolean;
  readonly sky: number;
};
type Stub = InstanceType<typeof Rocket> & { emit(ev: string): void; advance(ms: number): void; input: { on: ReturnType<typeof vi.fn> } };
const ctl = (scene: Stub): Ctl => (scene as unknown as { ctl: Ctl }).ctl;
const T = defaultTripTimings();
const layout = LAYOUTS.rocket;

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
  const scene = new Rocket() as Stub;
  scene.init({ level: 0, seed: 7, ...(resume ? { resume } : {}) } as never);
  scene.create();
  return { scene, events, payloads, off: () => offs.forEach((o) => o()) };
}

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
const centre = (id: string): { x: number; y: number } => {
  const hull = layout.hits[id]!;
  return { x: hull.reduce((s, p) => s + p.x, 0) / hull.length, y: hull.reduce((s, p) => s + p.y, 0) / hull.length };
};
const tapAt = (scene: Stub, p: { x: number; y: number }, downTime: number): void => {
  const on = scene.input.on.mock.calls as [string, (p: unknown) => void][];
  const handler = (ev: string) => on.find(([e]) => e === ev)?.[1];
  const ptr = { id: 1, downTime, isDown: true, x: p.x, y: p.y, worldX: p.x, worldY: p.y };
  handler('pointerdown')?.(ptr);
  handler('pointerup')?.({ ...ptr, isDown: false });
};
/** Builds the three parts through the bubbles' hulls. */
const build = (scene: Stub): void => {
  for (let i = 0; i < 3; i++) {
    expect(until(scene, () => ctl(scene).phase === 'build' && !ctl(scene).busy)).toBe(true);
    tapAt(scene, centre(choiceHit(i % 2)), 10 + i);
    expect(ctl(scene).colours).toHaveLength(i + 1);
  }
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  Rocket.resetSession();
  inputGuard.reset();
});

describe('Rocket scene (Tên lửa lên Mặt Trăng)', () => {
  it('the real layout: every tap area and anchor is there', () => {
    for (const id of [ROCKET_HIT, MOON_ROCKET_HIT, EARTH_HIT, EARTH_MOON_HIT]) expect(layout.hits[id], id).toBeDefined();
    for (let n = 0; n < CHOICES; n++) expect(layout.hits[choiceHit(n)], `choice ${n}`).toBeDefined();
    for (let n = 0; n < CRATERS; n++) expect(layout.hits[craterHit(n)], `crater ${n}`).toBeDefined();
    for (const a of Object.values(ANCHORS)) expect(layout.anchors[a], a).toBeDefined();
  });

  it('opens in free play: round:complete once, the body offered with the invitation; a bubble tap fits it', () => {
    const { scene, events, off } = open();
    expect(events).toEqual(['complete']);
    expect(ctl(scene).phase).toBe('build');
    expect(fake.audio.sayChain).toHaveBeenCalledWith([PROMPT_LINE, partLine('body')]);
    expect(fake.audio.setPrompt).toHaveBeenLastCalledWith(partLine('body'));
    tapAt(scene, centre(choiceHit(0)), 1);
    expect(ctl(scene).phase).toBe('fit');
    expect(ctl(scene).colours).toHaveLength(1);
    scene.emit('shutdown');
    off();
  });

  it('Home with nothing fitted: round:leave with no snapshot', () => {
    const { scene, events, payloads, off } = open();
    bus.emit('hud:home');
    expect(events).toEqual(['complete', 'leave']);
    expect(payloads[0]).toEqual({ gameId: 'rocket' });
    scene.emit('shutdown');
    off();
  });

  it('Home mid-climb keeps the trip; nothing plays after; the next visit resumes at the countdown with the same colours', () => {
    const { scene, events, payloads, off } = open();
    build(scene);
    expect(until(scene, () => ctl(scene).phase === 'ascent')).toBe(true);
    const colours = [...ctl(scene).colours];
    bus.emit('hud:home');
    expect(events).toEqual(['complete', 'leave']);
    const snapshot = (payloads[0] as { snapshot: { partial: { step: string; colours: string[] } } }).snapshot;
    expect(snapshot.partial).toMatchObject({ step: 'pad', colours });
    fake.audio.say.mockClear();
    run(scene, 20000);
    expect(fake.audio.say).not.toHaveBeenCalled();
    scene.emit('shutdown');
    off();

    const again = open(snapshot);
    expect(ctl(again.scene).phase).toBe('countdown');
    expect(ctl(again.scene).colours).toEqual(colours);
    again.scene.emit('shutdown');
    again.off();
  });

  it('a bad resume warns and starts a fresh build', () => {
    const { scene, off } = open({ v: 1, level: 0, seed: 7, questionIndex: 0, partial: { step: 'moon', colours: ['red'], surprise: 'ufo', flag: false } });
    expect(ctl(scene).phase).toBe('build');
    expect(console.warn).toHaveBeenCalledWith('rocket: bad resume — a fresh trip');
    scene.emit('shutdown');
    off();
  });

  it('a full trip: build, countdown, launch, climb (a tap boosts), space, the Moon (a crater tap, the rocket), home, a new build', () => {
    const { scene, events, off } = open();
    build(scene);
    expect(until(scene, () => ctl(scene).phase === 'launch')).toBe(true);
    expect(fake.audio.say).toHaveBeenCalledWith(LAUNCH_LINE);
    expect(until(scene, () => ctl(scene).phase === 'ascent')).toBe(true);
    tapAt(scene, { x: 200, y: 200 }, 30);
    expect(fake.audio.sfx).toHaveBeenCalledWith('sfx.rocket.boost');
    expect(until(scene, () => ctl(scene).phase === 'moon')).toBe(true);
    expect(ctl(scene).sky).toBe(1);
    expect(fake.audio.say).toHaveBeenLastCalledWith(MOON_LINE);
    tapAt(scene, centre(craterHit(0)), 31);
    expect(fake.audio.say).toHaveBeenCalledWith('vo.rocket.peek');
    tapAt(scene, centre(MOON_ROCKET_HIT), 32);
    expect(ctl(scene).phase).toBe('home');
    expect(until(scene, () => ctl(scene).phase === 'build')).toBe(true);
    expect(ctl(scene).colours).toEqual([]);
    expect(events).toEqual(['complete']);
    scene.emit('shutdown');
    off();
  });

  it('shutdown clears its own Speaker prompt', () => {
    const { scene, off } = open();
    scene.emit('shutdown');
    expect(fake.audio.clearPrompt).toHaveBeenCalledWith(partLine('body'));
    off();
  });

  it('timings and sizes: the launch, landing and return are hurried by a tap; the landing ≤ 2.5 s, the return ≤ 4 s; the rumble small and short', () => {
    expect(T.launchMs).toBeGreaterThan(T.skipOverMs);
    expect(T.landMs).toBeLessThanOrEqual(2500);
    expect(T.returnMs).toBeLessThanOrEqual(4000);
    expect(Tokens.ui.rocketRumblePx).toBeLessThanOrEqual(6);
    expect(Tokens.Timing.rocketRumbleMs).toBeLessThanOrEqual(800);
    expect(Tokens.Timing.rocketGlowPulseMs * 2).toBeGreaterThanOrEqual(500);
  });
});
