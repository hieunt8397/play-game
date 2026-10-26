// Story 7.4: the bedtime scene's base flow with Phaser stubbed and a fake AudioDirector: the island loop makes way,
// the three steps in any order complete the round once and NO next round ever starts (finishRoundAndStay), the
// lullaby plays, Home leaves (round:leave) with the lullaby fading out, Home mid-steps abandons with `{ done }`, a
// resume shows the steps done, and the island loop fades back in on shutdown.
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
    readonly time = { removeAllEvents: vi.fn(), delayedCall: vi.fn(), timeScale: 1, now: 0 };
    readonly tweens = { timeScale: 1, add: vi.fn(() => obj()), chain: vi.fn(() => obj()), killTweensOf: vi.fn() };
    readonly textures = { exists: () => false };
    readonly add = { image: vi.fn(() => obj()), graphics: vi.fn(() => obj()), rectangle: vi.fn(() => obj()) };
    readonly scale = { on: vi.fn(), off: vi.fn() };
    readonly cameras = { main: { setBackgroundColor: vi.fn(), fadeIn: vi.fn(), fadeOut: vi.fn(), once: vi.fn() } };
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
  }
  return { Scene };
});

const fake = vi.hoisted(() => {
  const state = { musicId: 'music.island' as string | undefined };
  return {
    state,
    audio: {
      get musicId() {
        return state.musicId;
      },
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
      music: vi.fn((id: string) => {
        state.musicId = id;
      }),
      stopMusic: vi.fn(() => {
        state.musicId = undefined;
      }),
      fadeOutMusic: vi.fn(() => {
        state.musicId = undefined;
      }),
    },
  };
});

vi.mock('../../core/audio-director', async (orig) => ({ ...(await orig<object>()), audio: fake.audio }));

(globalThis as { window?: object }).window ??= {};

const { bus } = await import('../../core/bus');
const { Tokens } = await import('../../core/tokens');
const { INVITE_LINE, LULLABY, STEP_LINES } = await import('../../content/games/bedtime');
const { Bedtime } = await import('./Bedtime');

type Ctl = { tap(t: string): boolean; readonly done: readonly string[]; readonly asleep: boolean };
type Stub = InstanceType<typeof Bedtime> & { emit(ev: string): void; time: { delayedCall: ReturnType<typeof vi.fn> } };
/** The scene's (private) controller. */
const ctl = (scene: Stub): Ctl => (scene as unknown as { ctl: Ctl }).ctl;

function open(resume?: object): { scene: Stub; events: string[]; payloads: unknown[]; off: () => void } {
  const events: string[] = [];
  const payloads: unknown[] = [];
  const offs = [
    bus.on('round:complete', () => events.push('complete')),
    bus.on('round:next', () => events.push('next')),
    bus.on('round:leave', () => events.push('leave')),
    bus.on('round:abandon', (p) => {
      events.push('abandon');
      payloads.push(p);
    }),
  ];
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const scene = new Bedtime() as Stub;
  scene.init({ level: 0, seed: 7, ...(resume ? { resume } : {}) } as never);
  scene.create();
  return { scene, events, payloads, off: () => offs.forEach((o) => o()) };
}

/** Plays `ms` of scene time in 50 ms frames. */
const run = (scene: Stub, ms: number): void => {
  for (let t = 0; t < ms; t += 50) scene.update(0, 50);
};
/** Taps a step, then waits until its reaction (and the next suggestion) is over. */
const step = (scene: Stub, id: string): void => {
  expect(ctl(scene).tap(id)).toBe(true);
  run(scene, 8000);
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  fake.state.musicId = 'music.island';
});

describe('Bedtime scene (Story 7.4)', () => {
  it('opens quietly: the island loop fades out, the invitation then the brush suggestion (its soft line), no round event yet', () => {
    const { scene, events, off } = open();
    expect(fake.audio.fadeOutMusic).toHaveBeenCalledWith(Tokens.Timing.bedtimeMusicFadeMs);
    expect(fake.audio.sayChain).toHaveBeenCalledWith([INVITE_LINE, STEP_LINES.brush]);
    expect(fake.audio.setPrompt).toHaveBeenCalledWith(STEP_LINES.brush);
    expect(events).toEqual([]);
    scene.emit('shutdown');
    off();
  });

  it('all three steps in any order: one round:complete, the lullaby, Shiba asleep, and never a next round', () => {
    const { scene, events, off } = open();
    step(scene, 'blanket');
    step(scene, 'brush');
    expect(events).toEqual([]);
    step(scene, 'lamp');
    expect(events).toEqual(['complete']);
    expect(fake.audio.music).toHaveBeenCalledWith(LULLABY, Tokens.Timing.bedtimeLullabyFadeMs);
    expect(ctl(scene).asleep).toBe(true);
    // No next-round timer was ever scheduled and nothing restarts, however long the scene stays.
    expect(scene.time.delayedCall.mock.calls.some(([ms]) => ms === Tokens.Timing.nextRoundDelayMs)).toBe(false);
    run(scene, 60000);
    expect(events).toEqual(['complete']);
    // The sleeping Shiba rolls over.
    expect(ctl(scene).tap('shiba')).toBe(true);
    // Home: the lullaby fades out, one round:leave (never abandon or next).
    bus.emit('hud:home');
    expect(fake.audio.fadeOutMusic).toHaveBeenLastCalledWith(Tokens.Timing.bedtimeLullabyFadeMs);
    expect(events).toEqual(['complete', 'leave']);
    bus.emit('hud:home');
    expect(events).toEqual(['complete', 'leave']);
    scene.emit('shutdown');
    off();
  });

  it('Home mid-steps: round:abandon with the steps done (resumable); nothing plays after it', () => {
    const { scene, events, payloads, off } = open();
    step(scene, 'lamp');
    bus.emit('hud:home');
    expect(events).toEqual(['abandon']);
    expect((payloads[0] as { snapshot: { partial: unknown } }).snapshot.partial).toEqual({ done: ['lamp'] });
    fake.audio.say.mockClear();
    run(scene, 20000);
    expect(ctl(scene).tap('brush')).toBe(false);
    expect(fake.audio.say).not.toHaveBeenCalled();
    scene.emit('shutdown');
    off();
  });

  it('a resume shows the same steps done and suggests the next one', () => {
    const resume = { v: 1, level: 0, seed: 7, questionIndex: 0, partial: { done: ['lamp'] }, tally: { questions: 0, firstTryCorrect: 0, maxHintLevel: 0 } };
    const { scene, off } = open(resume);
    expect(ctl(scene).done).toEqual(['lamp']);
    expect(fake.audio.say).toHaveBeenCalledWith(STEP_LINES.brush);
    scene.emit('shutdown');
    off();
  });

  it('review: Home during the night fade abandons with the lamp done; nothing plays after', () => {
    const { scene, events, payloads, off } = open();
    expect(ctl(scene).tap('lamp')).toBe(true);
    run(scene, Tokens.Timing.bedtimeNightFadeMs / 2);
    bus.emit('hud:home');
    expect(events).toEqual(['abandon']);
    expect((payloads[0] as { snapshot: { partial: unknown } }).snapshot.partial).toEqual({ done: ['lamp'] });
    fake.audio.say.mockClear();
    fake.audio.music.mockClear();
    run(scene, 20000);
    expect(fake.audio.say).not.toHaveBeenCalled();
    expect(fake.audio.music).not.toHaveBeenCalled();
    scene.emit('shutdown');
    off();
  });

  it('review: Home between the third tap and the lullaby: complete then leave, and the lullaby never starts', () => {
    const { scene, events, off } = open();
    step(scene, 'brush');
    step(scene, 'lamp');
    expect(ctl(scene).tap('blanket')).toBe(true);
    expect(events).toEqual(['complete']);
    run(scene, 500);
    expect(fake.audio.music).not.toHaveBeenCalledWith(LULLABY, expect.anything());
    bus.emit('hud:home');
    expect(events).toEqual(['complete', 'leave']);
    run(scene, 20000);
    expect(fake.audio.music).not.toHaveBeenCalledWith(LULLABY, expect.anything());
    expect(ctl(scene).asleep).toBe(false);
    scene.emit('shutdown');
    off();
  });

  it('review: blanket first — Shiba is covered, no round event, and the glow moves on to the brush', () => {
    const { scene, events, off } = open();
    fake.audio.say.mockClear();
    step(scene, 'blanket');
    expect(ctl(scene).done).toEqual(['blanket']);
    expect(events).toEqual([]);
    expect(fake.audio.sfx).toHaveBeenCalledWith('sfx.bedtime.blanket');
    expect(fake.audio.sfx).toHaveBeenCalledWith('sfx.bedtime.yawn');
    expect(fake.audio.say).toHaveBeenLastCalledWith(STEP_LINES.brush);
    scene.emit('shutdown');
    off();
  });

  it('review: reduced motion — the night is the same slow crossfade, and nothing breathes or twinkles', () => {
    const win = globalThis as { window?: { matchMedia?: unknown } };
    const before = win.window!.matchMedia;
    win.window!.matchMedia = () => ({ matches: true });
    try {
      const { scene, events, off } = open();
      const tweens = (scene as unknown as { tweens: { add: ReturnType<typeof vi.fn> } }).tweens.add;
      step(scene, 'lamp');
      step(scene, 'brush');
      step(scene, 'blanket');
      expect(events).toEqual(['complete']);
      const configs = tweens.mock.calls.map(([c]) => c as { duration?: number; repeat?: number });
      expect(configs.some((c) => c.duration === Tokens.Timing.bedtimeNightFadeMs)).toBe(true);
      expect(configs.some((c) => c.repeat === -1)).toBe(false);
      scene.emit('shutdown');
      off();
    } finally {
      win.window!.matchMedia = before;
    }
    // Without reduced motion the glow breathes (a repeating tween).
    const { scene, off } = open();
    const tweens = (scene as unknown as { tweens: { add: ReturnType<typeof vi.fn> } }).tweens.add;
    expect(tweens.mock.calls.some(([c]) => (c as { repeat?: number }).repeat === -1)).toBe(true);
    scene.emit('shutdown');
    off();
  });

  it('shutdown: the prompt is forgotten and the island loop fades back in', () => {
    const { scene, off } = open();
    scene.emit('shutdown');
    expect(fake.audio.clearPrompt).toHaveBeenCalledWith(STEP_LINES.brush);
    expect(fake.audio.music).toHaveBeenLastCalledWith('music.island', Tokens.Timing.bedtimeMusicFadeMs);
    off();
  });
});
