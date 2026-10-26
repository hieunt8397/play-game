// Story 7.3 review: the band scene's base flow with Phaser stubbed and a fake AudioDirector: it starts in free play
// (one round:complete, never round:next), Home leaves (round:leave) and silences the beat and every note, and the
// island loop comes back (faded in) on shutdown.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class Scene {
    readonly sys: { settings: { key: string }; isActive: () => boolean };
    readonly input = { enabled: true, on: vi.fn(), off: vi.fn(), manager: { pointersTotal: 3 }, addPointer: vi.fn() };
    readonly time = { removeAllEvents: vi.fn(), delayedCall: vi.fn(), timeScale: 1, now: 0 };
    readonly tweens = { timeScale: 1, add: vi.fn(), killTweensOf: vi.fn() };
    readonly textures = { exists: () => false };
    readonly add = { image: vi.fn(), graphics: vi.fn() };
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
      musicPositionMs: undefined as number | undefined,
      voiceBusy: false,
      sfx: vi.fn(),
      say: vi.fn(() => 1),
      setPrompt: vi.fn(),
      clearPrompt: vi.fn(),
      replayPrompt: vi.fn(),
      stop: vi.fn(),
      fadeOut: vi.fn(),
      holdSfx: vi.fn(),
      note: vi.fn(),
      stopNotes: vi.fn(),
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
const { BEAT_MUSIC } = await import('../../content/games/band');
const { Band } = await import('./Band');

type Stub = InstanceType<typeof Band> & { emit(ev: string): void; time: { delayedCall: ReturnType<typeof vi.fn> } };

function open(): { band: Stub; events: string[]; off: () => void } {
  const events: string[] = [];
  const offs = [
    bus.on('round:complete', () => events.push('complete')),
    bus.on('round:next', () => events.push('next')),
    bus.on('round:leave', () => events.push('leave')),
    bus.on('round:abandon', () => events.push('abandon')),
  ];
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const band = new Band() as Stub;
  band.init({ level: 0, seed: 7 });
  band.create();
  return { band, events, off: () => offs.forEach((o) => o()) };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  fake.state.musicId = 'music.island';
});

describe('Band scene (Story 7.3 review)', () => {
  it('starts in free play: one round:complete, no next-round timer, the invitation said, the island loop faded out', () => {
    const { band, events, off } = open();
    expect(events).toEqual(['complete']);
    expect(band.time.delayedCall).not.toHaveBeenCalled();
    expect(fake.audio.fadeOutMusic).toHaveBeenCalledWith(Tokens.Timing.bandMusicFadeMs);
    expect(fake.audio.say).toHaveBeenCalledWith('vo.band.prompt');
    // The controller keeps running although the base is inert (free play): the beat starts after the idle time.
    for (let t = 0; t < Tokens.Timing.bandIdleBeatMs + 100; t += 100) band.update(0, 100);
    expect(fake.audio.music).toHaveBeenLastCalledWith(BEAT_MUSIC);
    expect(events).toEqual(['complete']);
    band.emit('shutdown');
    off();
  });

  it('Home: the beat and every note stop at once, then one round:leave (never abandon or next)', () => {
    const { band, events, off } = open();
    for (let t = 0; t < Tokens.Timing.bandIdleBeatMs + 100; t += 100) band.update(0, 100);
    expect(fake.state.musicId).toBe(BEAT_MUSIC);
    bus.emit('hud:home');
    expect(fake.audio.stopNotes).toHaveBeenCalled();
    expect(fake.audio.fadeOutMusic).toHaveBeenLastCalledWith(Tokens.Timing.bandBeatFadeMs);
    expect(events).toEqual(['complete', 'leave']);
    // Nothing plays after Home.
    fake.audio.music.mockClear();
    for (let t = 0; t < 20000; t += 100) band.update(0, 100);
    expect(fake.audio.music).not.toHaveBeenCalled();
    bus.emit('hud:home');
    expect(events).toEqual(['complete', 'leave']);
    band.emit('shutdown');
    off();
  });

  it('shutdown: the notes stop, the prompt is forgotten and the island loop fades back in', () => {
    const { band, off } = open();
    band.emit('shutdown');
    expect(fake.audio.stopNotes).toHaveBeenCalled();
    expect(fake.audio.clearPrompt).toHaveBeenCalledWith('vo.band.prompt');
    expect(fake.audio.music).toHaveBeenLastCalledWith('music.island', Tokens.Timing.bandMusicFadeMs);
    off();
  });

  it('asks Phaser for the band voice cap of touch pointers (multi-touch router)', () => {
    const { band, off } = open();
    expect((band as unknown as { input: { addPointer: ReturnType<typeof vi.fn> } }).input.addPointer).toHaveBeenCalledWith(Tokens.ui.bandVoiceCap - 3);
    band.emit('shutdown');
    off();
  });
});
