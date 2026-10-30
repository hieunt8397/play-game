// Rửa xe (2026-10-30): the car-wash scene with Phaser stubbed and a fake AudioDirector: it opens in free play with a
// car driving in, then its name and "rub"; Home with a clean bay leaves nothing, Home mid-wash hands the snapshot on
// round:leave and the next visit resumes the half-washed car; a bad resume starts a fresh car; a full cycle (rub, hose,
// rinse, shine, drive out) brings a different car; the rub target foams only on the car and keeps the foam on a lift.
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
const { inputGuard } = await import('../../core/input/guard');
const { LAYOUTS } = await import('../../content/layouts');
const { DIRT_SPOTS, PROMPT_LINE, RINSE_LINE, RUB_LINE, VEHICLES, dirtAnchor, neededSpots } = await import('../../content/games/car-wash');
const { Tokens } = await import('../../core/tokens');
const { CarWash } = await import('./CarWash');
const { defaultCarWashTimings } = await import('./cycle');

type Ctl = {
  press(p: { x: number; y: number }): boolean;
  rub(p: { x: number; y: number }): boolean;
  lift(): void;
  tapHose(): boolean;
  anyTap(): void;
  readonly phase: string;
  readonly vehicle: keyof typeof VEHICLES;
  readonly covered: readonly number[];
  readonly puffs: number;
  readonly busy: boolean;
};
type Stub = InstanceType<typeof CarWash> & { emit(ev: string): void; advance(ms: number): void; input: { on: ReturnType<typeof vi.fn> } };
const ctl = (scene: Stub): Ctl => (scene as unknown as { ctl: Ctl }).ctl;
const T = defaultCarWashTimings();
const layout = LAYOUTS['car-wash'];
const spot = (v: keyof typeof VEHICLES, n: number): { x: number; y: number } => layout.anchors[dirtAnchor(v, n)]!;
const need = neededSpots(DIRT_SPOTS, Tokens.ui.carWashFoamShare);

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
  const scene = new CarWash() as Stub;
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
/** Waits until nothing runs. */
const settle = (scene: Stub): void => {
  for (let k = 0; k < 400 && ctl(scene).busy; k++) run(scene, 50);
};
/** Foams the parked car's spots one by one (waiting out a surprise) until it is foamed. */
const foamAll = (scene: Stub): void => {
  for (let n = 0; n < DIRT_SPOTS && ctl(scene).phase === 'dirty'; n++) {
    ctl(scene).press(spot(ctl(scene).vehicle, n));
    settle(scene);
  }
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  CarWash.resetSession();
  inputGuard.reset();
});

describe('CarWash scene (Rửa xe)', () => {
  it('the real layout: every car has DIRT_SPOTS dirt anchors on its hull; foamed needs most of them', () => {
    for (const v of Object.keys(VEHICLES) as (keyof typeof VEHICLES)[]) {
      for (let n = 0; n < DIRT_SPOTS; n++) expect(layout.anchors[dirtAnchor(v, n)], `${v} ${n}`).toBeDefined();
    }
    expect(DIRT_SPOTS).toBeGreaterThanOrEqual(6);
    expect(need).toBeGreaterThan(DIRT_SPOTS / 2);
  });

  it('opens in free play: round:complete once (no next round), a car drives in, then the invitation, its name and "rub"', () => {
    const { scene, events, off } = open();
    expect(events).toEqual(['complete']);
    expect(ctl(scene).phase).toBe('drive');
    run(scene, T.driveInMs + 100);
    const v = ctl(scene).vehicle;
    expect(fake.audio.sfx).toHaveBeenCalledWith(VEHICLES[v].honk);
    expect(fake.audio.sayChain).toHaveBeenCalledWith([PROMPT_LINE, VEHICLES[v].nameLine, RUB_LINE]);
    expect(fake.audio.setPrompt).toHaveBeenLastCalledWith(RUB_LINE);
    expect(ctl(scene).phase).toBe('dirty');
    run(scene, Tokens.Timing.nextRoundDelayMs + 2000);
    expect(events).toEqual(['complete']);
    scene.emit('shutdown');
    off();
  });

  it('Home with a clean (untouched) car: round:leave with no snapshot', () => {
    const { scene, events, payloads, off } = open();
    settle(scene);
    bus.emit('hud:home');
    expect(events).toEqual(['complete', 'leave']);
    expect(payloads[0]).toEqual({ gameId: 'car-wash' });
    scene.emit('shutdown');
    off();
  });

  it('Home mid-wash: round:leave keeps the half-washed car; nothing plays after; the next visit resumes it parked with its foam', () => {
    const { scene, events, payloads, off } = open();
    settle(scene);
    const v = ctl(scene).vehicle;
    expect(ctl(scene).press(spot(v, 0))).toBe(true);
    settle(scene);
    bus.emit('hud:home');
    expect(events).toEqual(['complete', 'leave']);
    const snapshot = (payloads[0] as { snapshot: { partial: { vehicle: string; covered: number[] } } }).snapshot;
    expect(snapshot.partial).toMatchObject({ vehicle: v, covered: [0] });
    fake.audio.say.mockClear();
    fake.audio.sayChain.mockClear();
    run(scene, 30000);
    expect(fake.audio.say).not.toHaveBeenCalled();
    expect(fake.audio.sayChain).not.toHaveBeenCalled();
    scene.emit('shutdown');
    off();

    const again = open(snapshot);
    expect(ctl(again.scene).vehicle).toBe(v);
    expect(ctl(again.scene).phase).toBe('dirty');
    expect(ctl(again.scene).covered).toEqual([0]);
    expect(ctl(again.scene).busy).toBe(false);
    expect(fake.audio.say).toHaveBeenCalledWith(RUB_LINE);
    expect(fake.audio.sayChain).not.toHaveBeenCalled();
    again.scene.emit('shutdown');
    again.off();
  });

  it('a bad resume warns and starts a fresh car', () => {
    const { scene, off } = open({ v: 1, level: 0, seed: 11, questionIndex: 0, partial: { vehicle: 'bus', dirt: 'mud', covered: [0], surprise: 'duck' } });
    expect(ctl(scene).phase).toBe('drive');
    expect(console.warn).toHaveBeenCalledWith('car-wash: bad resume — a fresh car');
    scene.emit('shutdown');
    off();
  });

  it('a full cycle: foam, the hose, the rinse and shine, the drive-out, then a different car; no round event beyond the first', () => {
    const { scene, events, off } = open();
    settle(scene);
    const v = ctl(scene).vehicle;
    expect(ctl(scene).tapHose()).toBe(false);
    foamAll(scene);
    expect(ctl(scene).phase).toBe('foamed');
    expect(ctl(scene).covered.length).toBeGreaterThanOrEqual(need);
    expect(fake.audio.say).toHaveBeenCalledWith(RINSE_LINE);
    expect(ctl(scene).tapHose()).toBe(true);
    expect(fake.audio.sfx).toHaveBeenCalledWith('sfx.pet-clinic.splash');
    settle(scene);
    expect(fake.audio.sfx).toHaveBeenCalledWith('sfx.car-wash.chime');
    expect(ctl(scene).vehicle).not.toBe(v);
    expect(ctl(scene).phase).toBe('dirty');
    expect(fake.audio.sayChain).toHaveBeenLastCalledWith([VEHICLES[ctl(scene).vehicle].nameLine, RUB_LINE]);
    expect(events).toEqual(['complete']);
    scene.emit('shutdown');
    off();
  });

  it('the rub target: a press-and-move over the car foams along the stroke; off the car nothing; a lift keeps the foam', () => {
    const { scene, off } = open();
    settle(scene);
    const v = ctl(scene).vehicle;
    const a = spot(v, 0);
    const pointer = (x: number, y: number, down = true) => ({ id: 1, downTime: 1, isDown: down, x, y, worldX: x, worldY: y });
    // The scene's router listens to the input events; feed them a stroke from spot 0 to spot 1.
    const on = scene.input.on.mock.calls as [string, (p: unknown) => void][];
    const handler = (ev: string) => on.find(([e]) => e === ev)?.[1];
    const b = spot(v, 1);
    // In node the guard's locator passes the pointer's x/y through as the design point.
    handler('pointerdown')?.(pointer(a.x, a.y));
    for (let k = 1; k <= 8; k++) handler('pointermove')?.(pointer(a.x + ((b.x - a.x) * k) / 8, a.y + ((b.y - a.y) * k) / 8));
    // The finger lifts mid-rub: the foam and the covered spots stay.
    handler('pointerup')?.(pointer(b.x, b.y, false));
    const puffs = ctl(scene).puffs;
    expect(puffs).toBeGreaterThan(2);
    expect(ctl(scene).covered).toEqual(expect.arrayContaining([0, 1]));
    run(scene, 200);
    expect(ctl(scene).puffs).toBe(puffs);
    // A press far off the car (the bay floor at the bottom left) never foams.
    const p2 = { id: 1, downTime: 2, isDown: true, x: 40, y: 680, worldX: 40, worldY: 680 };
    handler('pointerdown')?.(p2);
    handler('pointerup')?.({ ...p2, isDown: false });
    expect(ctl(scene).puffs).toBe(puffs);
    scene.emit('shutdown');
    off();
  });

  it('shutdown clears its own Speaker prompt', () => {
    const { scene, off } = open();
    settle(scene);
    scene.emit('shutdown');
    expect(fake.audio.clearPrompt).toHaveBeenCalledWith(RUB_LINE);
    off();
  });
});
