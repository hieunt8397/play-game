// Tàu hỏa chở bạn (2026-11-12): the train scene with Phaser stubbed and a fake AudioDirector: it opens in free play
// with the train at the start station and the invitation; a tap on the engine (through the router) pulls away; Home
// at the start leaves nothing, Home with a friend aboard hands the snapshot on round:leave and the next visit resumes
// at the next station; a bad resume starts a fresh trip; a full trip (three stations, the tunnel, the destination, the
// drop-off) goes on with new friends; a car tap names its colour.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  /** A chainable display-object stub: every method returns itself; `alpha` reads 1. */
  const obj = (): unknown => {
    const o: Record<string | symbol, unknown> = {};
    return new Proxy(o, { get: (_t, k) => (k === 'alpha' || k === 'scaleX' ? 1 : k === 'then' ? undefined : () => obj()) });
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
const { ANCHORS, CAR_COLOURS, DESTINATIONS, ENGINE_HIT, FRIENDS, FRIEND_IDS, PROMPT_LINE, STATION_LINE, carHit, carLine, destHit, friendHit } = await import('../../content/games/train');
const { Tokens } = await import('../../core/tokens');
const { Train } = await import('./Train');
const { defaultTripTimings } = await import('./trip');

type Ctl = {
  tapTrain(): boolean;
  tapFriend(): boolean;
  tapDest(): boolean;
  readonly phase: string;
  readonly friends: readonly (keyof typeof FRIENDS)[];
  readonly aboard: number;
  readonly dest: keyof typeof DESTINATIONS;
  readonly dim: number;
  readonly busy: boolean;
};
type Stub = InstanceType<typeof Train> & { emit(ev: string): void; advance(ms: number): void; input: { on: ReturnType<typeof vi.fn> } };
const ctl = (scene: Stub): Ctl => (scene as unknown as { ctl: Ctl }).ctl;
const T = defaultTripTimings();
const layout = LAYOUTS.train;

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
  const scene = new Train() as Stub;
  scene.init({ level: 0, seed: 7, ...(resume ? { resume } : {}) } as never);
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
const until = (scene: Stub, done: () => boolean, maxMs = 180000): boolean => {
  for (let t = 0; t < maxMs && !done(); t += 50) run(scene, 50);
  return done();
};
/** The centre of a hull. */
const centre = (id: string): { x: number; y: number } => {
  const hull = layout.hits[id]!;
  return { x: hull.reduce((s, p) => s + p.x, 0) / hull.length, y: hull.reduce((s, p) => s + p.y, 0) / hull.length };
};
/** A tap through the router at `p`. */
const tapAt = (scene: Stub, p: { x: number; y: number }, downTime: number): void => {
  const on = scene.input.on.mock.calls as [string, (p: unknown) => void][];
  const handler = (ev: string) => on.find(([e]) => e === ev)?.[1];
  const ptr = { id: 1, downTime, isDown: true, x: p.x, y: p.y, worldX: p.x, worldY: p.y };
  handler('pointerdown')?.(ptr);
  handler('pointerup')?.({ ...ptr, isDown: false });
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  Train.resetSession();
  inputGuard.reset();
});

describe('Train scene (Tàu hỏa chở bạn)', () => {
  it('the real layout: every tap area and anchor is there', () => {
    expect(layout.hits[ENGINE_HIT]).toBeDefined();
    CAR_COLOURS.forEach((_, n) => expect(layout.hits[carHit(n)], `car ${n}`).toBeDefined());
    for (const f of FRIEND_IDS) expect(layout.hits[friendHit(f)], f).toBeDefined();
    for (const d of Object.keys(DESTINATIONS) as (keyof typeof DESTINATIONS)[]) expect(layout.hits[destHit(d)], d).toBeDefined();
    for (const a of Object.values(ANCHORS)) expect(layout.anchors[a], a).toBeDefined();
  });

  it('opens in free play: round:complete once, the train at the start station, the invitation; a tap on the engine pulls away', () => {
    const { scene, events, off } = open();
    expect(events).toEqual(['complete']);
    expect(ctl(scene).phase).toBe('start');
    expect(fake.audio.say).toHaveBeenCalledWith(PROMPT_LINE);
    expect(fake.audio.setPrompt).toHaveBeenLastCalledWith(PROMPT_LINE);
    tapAt(scene, centre(ENGINE_HIT), 1);
    expect(ctl(scene).phase).toBe('depart');
    expect(fake.audio.sfx).toHaveBeenCalledWith('sfx.train.toot');
    expect(until(scene, () => ctl(scene).phase === 'wait')).toBe(true);
    expect(fake.audio.say).toHaveBeenLastCalledWith(STATION_LINE);
    expect(events).toEqual(['complete']);
    scene.emit('shutdown');
    off();
  });

  it('Home at the start station: round:leave with no snapshot', () => {
    const { scene, events, payloads, off } = open();
    bus.emit('hud:home');
    expect(events).toEqual(['complete', 'leave']);
    expect(payloads[0]).toEqual({ gameId: 'train' });
    scene.emit('shutdown');
    off();
  });

  it('Home with a friend aboard: round:leave keeps the trip; nothing plays after; the next visit resumes at the next station', () => {
    const { scene, events, payloads, off } = open();
    ctl(scene).tapTrain();
    expect(until(scene, () => ctl(scene).phase === 'wait')).toBe(true);
    const friends = [...ctl(scene).friends];
    tapAt(scene, centre(friendHit(friends[0]!)), 2);
    expect(ctl(scene).aboard).toBe(1);
    expect(fake.audio.sayChain).toHaveBeenCalledWith([FRIENDS[friends[0]!].boardLine, 'vo.pizza.count.1']);
    bus.emit('hud:home');
    expect(events).toEqual(['complete', 'leave']);
    const snapshot = (payloads[0] as { snapshot: { partial: { friends: string[]; aboard: number } } }).snapshot;
    expect(snapshot.partial).toMatchObject({ friends, aboard: 1 });
    fake.audio.say.mockClear();
    fake.audio.sayChain.mockClear();
    run(scene, 30000);
    expect(fake.audio.say).not.toHaveBeenCalled();
    expect(fake.audio.sayChain).not.toHaveBeenCalled();
    scene.emit('shutdown');
    off();

    const again = open(snapshot);
    expect(ctl(again.scene).phase).toBe('wait');
    expect(ctl(again.scene).friends).toEqual(friends);
    expect(ctl(again.scene).aboard).toBe(1);
    expect(ctl(again.scene).busy).toBe(false);
    expect(fake.audio.say).toHaveBeenCalledWith(STATION_LINE);
    again.scene.emit('shutdown');
    again.off();
  });

  it('a bad resume warns and starts a fresh trip at the start station', () => {
    const { scene, off } = open({ v: 1, level: 0, seed: 7, questionIndex: 0, partial: { friends: ['cat', 'cat', 'pig'], aboard: 1, dest: 'beach', surprise: 'bridge', tunnelLeg: 1 } });
    expect(ctl(scene).phase).toBe('start');
    expect(console.warn).toHaveBeenCalledWith('train: bad resume — a fresh trip');
    scene.emit('shutdown');
    off();
  });

  it('a full trip: three friends board by tapping them (or the platform), the tunnel dims, the destination, the drop-off, then new friends', () => {
    const { scene, events, off } = open();
    ctl(scene).tapTrain();
    const first = [...ctl(scene).friends];
    let dimmed = false;
    for (let n = 0; n < 3; n++) {
      expect(until(scene, () => {
        if (ctl(scene).dim > 0) dimmed = true;
        return ctl(scene).phase === 'wait';
      })).toBe(true);
      // The first through the friend's hull, the others through the platform's.
      tapAt(scene, n === 0 ? centre(friendHit(ctl(scene).friends[n]!)) : centre('platform'), 10 + n);
      expect(ctl(scene).aboard).toBe(n + 1);
    }
    expect(until(scene, () => {
      if (ctl(scene).dim > 0) dimmed = true;
      return ctl(scene).phase === 'dest';
    })).toBe(true);
    expect(dimmed).toBe(true);
    expect(fake.audio.say).toHaveBeenCalledWith('vo.train.tunnel');
    const d = ctl(scene).dest;
    expect(fake.audio.say).toHaveBeenLastCalledWith(DESTINATIONS[d].line);
    tapAt(scene, centre(destHit(d)), 20);
    expect(ctl(scene).phase).toBe('dropoff');
    for (const f of first) expect(fake.audio.sfx).toHaveBeenCalledWith(FRIENDS[f].callSfx);
    expect(ctl(scene).friends).not.toEqual(first);
    expect(until(scene, () => ctl(scene).phase === 'wait')).toBe(true);
    expect(events).toEqual(['complete']);
    scene.emit('shutdown');
    off();
  });

  it('a car tap names its colour; a tap far from everything does nothing', () => {
    const { scene, off } = open();
    ctl(scene).tapTrain();
    expect(until(scene, () => ctl(scene).phase === 'wait')).toBe(true);
    tapAt(scene, centre(carHit(1)), 3);
    expect(fake.audio.say).toHaveBeenCalledWith(carLine('yellow'));
    const n = fake.audio.say.mock.calls.length;
    tapAt(scene, { x: 512, y: 30 }, 4);
    expect(fake.audio.say.mock.calls.length).toBe(n);
    expect(ctl(scene).phase).toBe('wait');
    scene.emit('shutdown');
    off();
  });

  it('shutdown clears its own Speaker prompt', () => {
    const { scene, off } = open();
    scene.emit('shutdown');
    expect(fake.audio.clearPrompt).toHaveBeenCalledWith(PROMPT_LINE);
    off();
  });

  it('timings: the departure and a long arrival are skippable; a boarding and a drop stay within 1.5 s', () => {
    expect(T.departMs).toBeGreaterThan(T.skipOverMs);
    expect(T.boardMs).toBeLessThanOrEqual(1500);
    expect(T.dropMs).toBeLessThanOrEqual(1500);
    expect(Tokens.ui.trainDimMax).toBeLessThanOrEqual(0.5);
  });
});
