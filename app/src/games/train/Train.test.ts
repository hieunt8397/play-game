// Tàu hỏa quanh đảo (2026-11-13, spec-tau-quanh-dao): the train scene on the island with Phaser stubbed and a fake
// AudioDirector. It opens in free play where the map's train stood (the handoff) with no fade, the camera zoomed on it;
// taps go through the router in world space: the engine sets off, the waiting friend's platform boards it, a car names
// its colour, a place its name, the destination drops the friends off; Home hands the camera's view back to Map and keeps
// a trip with a friend aboard, which the next visit resumes (fading in); an old-shape partial starts a fresh trip.
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
    readonly cameras = {
      main: {
        setBackgroundColor: vi.fn(),
        fadeIn: vi.fn(),
        fadeOut: vi.fn(),
        once: vi.fn(),
        setZoom: vi.fn(),
        centerOn: vi.fn(),
        getWorldPoint: (x: number, y: number) => ({ x, y }),
      },
    };
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
const { ANCHORS, DESTINATIONS, FRIENDS, PROMPT_LINE, STATIONS, carLine, destHit, placeLine, platformHit } = await import('../../content/games/train');
const { setTrainStart, takeTrainView } = await import('../../core/ride-handoff');
const { Tokens } = await import('../../core/tokens');
const { Train } = await import('./Train');
const { railOf, trainPieces, pieceDisc } = await import('./geometry');
const { cameraCentre } = await import('./camera');

type Ctl = {
  tapTrain(): boolean;
  readonly phase: string;
  readonly plan: { friends: (keyof typeof FRIENDS)[]; stops: (keyof typeof STATIONS)[]; dest: keyof typeof DESTINATIONS };
  readonly aboard: number;
  readonly station: keyof typeof STATIONS | undefined;
  readonly s: number;
  readonly busy: boolean;
};
type Stub = InstanceType<typeof Train> & {
  emit(ev: string): void;
  advance(ms: number): void;
  input: { on: ReturnType<typeof vi.fn> };
  cameras: { main: { fadeIn: ReturnType<typeof vi.fn>; setZoom: ReturnType<typeof vi.fn> } };
};
const ctl = (scene: Stub): Ctl => (scene as unknown as { ctl: Ctl }).ctl;
const layout = LAYOUTS.train;
const rail = railOf(layout.paths.rail!, layout.paths['rail-up']!, layout.anchors[ANCHORS.train]!);

function open(resume?: object): { scene: Stub; events: string[]; payloads: unknown[]; off: () => void } {
  const events: string[] = [];
  const payloads: unknown[] = [];
  const offs = [
    bus.on('round:complete', () => events.push('complete')),
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
const until = (scene: Stub, done: () => boolean, maxMs = 240000): boolean => {
  for (let t = 0; t < maxMs && !done(); t += 50) run(scene, 50);
  return done();
};
const centre = (id: string): { x: number; y: number } => {
  const hull = layout.hits[id]!;
  return { x: hull.reduce((s, p) => s + p.x, 0) / hull.length, y: hull.reduce((s, p) => s + p.y, 0) / hull.length };
};
/** The centre of piece `n`'s tap disc now (0: the engine). */
const piece = (scene: Stub, n: number): { x: number; y: number } => {
  const p = trainPieces(rail, ctl(scene).s, Tokens.ui.trainCarPitch)[n]!;
  const d = pieceDisc(rail, p, { engineR: Tokens.ui.trainEngineHitR, carR: Tokens.ui.trainCarHitR, lift: Tokens.ui.trainPieceLift });
  return { x: d.x, y: d.y };
};
/** A tap through the router at `p` (the camera stub maps screen = world). */
let downTime = 1;
const tapAt = (scene: Stub, p: { x: number; y: number }): void => {
  const on = scene.input.on.mock.calls as [string, (p: unknown) => void][];
  const handler = (ev: string) => on.find(([e]) => e === ev)?.[1];
  const ptr = { id: 1, downTime: (downTime += 1000), isDown: true, x: p.x, y: p.y, worldX: p.x, worldY: p.y };
  handler('pointerdown')?.(ptr);
  handler('pointerup')?.({ ...ptr, isDown: false });
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  Train.resetSession();
  inputGuard.reset();
  takeTrainView();
});

describe('Train scene (Tàu hỏa quanh đảo)', () => {
  it('opens in free play at Ga tàu, zoomed in; the invitation; a tap on the engine sets it off to a station', () => {
    const { scene, events, off } = open();
    expect(events).toEqual(['complete']);
    expect(ctl(scene).phase).toBe('start');
    expect(ctl(scene).s).toBeCloseTo(rail.loop.project(layout.anchors[ANCHORS.train]!), 6);
    expect(scene.cameras.main.setZoom).toHaveBeenCalledWith(Tokens.ui.trainZoom);
    expect(fake.audio.say).toHaveBeenCalledWith(PROMPT_LINE);
    tapAt(scene, piece(scene, 0));
    expect(ctl(scene).phase).toBe('depart');
    expect(fake.audio.sfx).toHaveBeenCalledWith('sfx.train.toot');
    expect(until(scene, () => ctl(scene).phase === 'wait')).toBe(true);
    const st = ctl(scene).station!;
    expect(fake.audio.say).toHaveBeenLastCalledWith(STATIONS[st].line);
    scene.emit('shutdown');
    off();
  });

  it('starts where the map`s train stood (the handoff), with no fade; without a handoff it fades in', () => {
    const s = rail.loop.length / 3;
    setTrainStart(s);
    const { scene, off } = open();
    expect(ctl(scene).s).toBeCloseTo(s, 6);
    expect(scene.cameras.main.fadeIn).not.toHaveBeenCalled();
    scene.emit('shutdown');
    off();
    const plain = open();
    expect(plain.scene.cameras.main.fadeIn).toHaveBeenCalled();
    plain.scene.emit('shutdown');
    plain.off();
  });

  it('Home at the start: round:leave with no snapshot; nothing plays after', () => {
    setTrainStart(rail.loop.project(layout.anchors[ANCHORS.train]!));
    const { scene, events, payloads, off } = open();
    bus.emit('hud:home');
    expect(events).toEqual(['complete', 'leave']);
    expect(payloads[0]).toEqual({ gameId: 'train' });
    fake.audio.say.mockClear();
    run(scene, 20000);
    expect(fake.audio.say).not.toHaveBeenCalled();
    scene.emit('shutdown');
    off();
  });

  it('Home with a friend aboard: round:leave keeps the trip and hands the view back; the next visit resumes at the next station (fading in)', () => {
    const { scene, events, payloads, off } = open();
    ctl(scene).tapTrain();
    expect(until(scene, () => ctl(scene).phase === 'wait')).toBe(true);
    const plan = ctl(scene).plan;
    tapAt(scene, centre(platformHit(ctl(scene).station!)));
    expect(ctl(scene).aboard).toBe(1);
    expect(fake.audio.sayChain).toHaveBeenCalledWith([FRIENDS[plan.friends[0]!].boardLine, 'vo.pizza.count.1']);
    bus.emit('hud:home');
    expect(events).toEqual(['complete', 'leave']);
    // Map pulls back from the game's very view: the camera's centre with the engine where it stands.
    const view = takeTrainView();
    const follow = { viewW: 512, viewH: 384, boundsW: 1024, boundsH: 768, middle: Tokens.ui.trainCarPitch.reduce((a, b) => a + b, 0) / 2, lead: Tokens.ui.trainCameraLead };
    expect(view).toEqual(cameraCentre(rail.loop, ctl(scene).s, follow));
    const snapshot = (payloads[0] as { snapshot: { partial: object } }).snapshot;
    expect(snapshot.partial).toMatchObject({ friends: plan.friends, aboard: 1, stops: plan.stops, dest: plan.dest });
    scene.emit('shutdown');
    off();

    const again = open(snapshot);
    expect(ctl(again.scene).phase).toBe('wait');
    expect(ctl(again.scene).aboard).toBe(1);
    expect(ctl(again.scene).station).toBe(plan.stops[1]);
    expect(again.scene.cameras.main.fadeIn).toHaveBeenCalled();
    again.scene.emit('shutdown');
    again.off();
  });

  it('an old-shape partial (the countryside game) warns and starts a fresh trip', () => {
    const { scene, off } = open({ v: 1, level: 0, seed: 7, questionIndex: 0, partial: { friends: ['cat', 'pig', 'cow'], aboard: 1, dest: 'beach', surprise: 'bridge', tunnelLeg: 1 } });
    expect(ctl(scene).phase).toBe('start');
    expect(console.warn).toHaveBeenCalledWith('train: bad resume — a fresh trip');
    scene.emit('shutdown');
    off();
  });

  it('a full trip round the island: three friends, the volcano, the destination, the drop-off, then the next trip', () => {
    const { scene, events, off } = open();
    ctl(scene).tapTrain();
    const first = [...ctl(scene).plan.friends];
    for (let n = 0; n < 3; n++) {
      expect(until(scene, () => ctl(scene).phase === 'wait')).toBe(true);
      tapAt(scene, centre(platformHit(ctl(scene).station!)));
      expect(ctl(scene).aboard).toBe(n + 1);
    }
    expect(until(scene, () => ctl(scene).phase === 'dest')).toBe(true);
    expect(fake.audio.say).toHaveBeenCalledWith('vo.train.tunnel');
    const d = ctl(scene).plan.dest;
    expect(fake.audio.say).toHaveBeenLastCalledWith(DESTINATIONS[d].line);
    tapAt(scene, centre(destHit(d)));
    expect(ctl(scene).phase).toBe('dropoff');
    for (const f of first) expect(fake.audio.sfx).toHaveBeenCalledWith(FRIENDS[f].callSfx);
    expect(until(scene, () => ctl(scene).phase === 'wait')).toBe(true);
    expect(events).toEqual(['complete']);
    scene.emit('shutdown');
    off();
  });

  it('a car tap names its colour; a place tap says the place`s name and nothing else', () => {
    const { scene, off } = open();
    ctl(scene).tapTrain();
    expect(until(scene, () => ctl(scene).phase === 'wait')).toBe(true);
    tapAt(scene, piece(scene, 2));
    expect(fake.audio.say).toHaveBeenLastCalledWith(carLine('yellow'));
    run(scene, 2000);
    tapAt(scene, centre('pizza'));
    expect(fake.audio.say).toHaveBeenLastCalledWith(placeLine('pizza'));
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
});
