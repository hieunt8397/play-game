// Story 8.2: the wardrobe scene's flow with Phaser stubbed and a fake AudioDirector: the invitation on a fresh start,
// wear / replace / take off saved at once in ProgressStore, the item names said only before the round completes, one
// round:complete after Tokens.ui.dressUpRoundChanges changes and never a next round, Home mid-round abandons with
// `{ changes }`, and a resume restores the count.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  const obj = (): unknown => {
    const o: Record<string | symbol, unknown> = {};
    return new Proxy(o, { get: (_t, k) => (k === 'alpha' ? 1 : k === 'then' ? undefined : () => obj()) });
  };
  class Scene {
    readonly sys: { settings: { key: string }; isActive: () => boolean };
    readonly input = { enabled: true, on: vi.fn(), off: vi.fn(), manager: { pointersTotal: 3 }, addPointer: vi.fn() };
    readonly time = { removeAllEvents: vi.fn(), delayedCall: vi.fn(), timeScale: 1, now: 0 };
    readonly tweens = { timeScale: 1, add: vi.fn(() => obj()), addCounter: vi.fn(() => obj()), chain: vi.fn(() => obj()), killTweensOf: vi.fn() };
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
const { ProgressStore } = await import('../../core/progress-store');
const { PROMPT_LINE, SFX, nameLine } = await import('../../content/games/dress-up');
const { DressUp } = await import('./DressUp');

type Stub = InstanceType<typeof DressUp> & { emit(ev: string): void; time: { delayedCall: ReturnType<typeof vi.fn> } };

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
  const scene = new DressUp() as Stub;
  scene.init({ level: 0, seed: 3, ...(resume ? { resume } : {}) } as never);
  scene.create();
  return { scene, events, payloads, off: () => offs.forEach((o) => o()) };
}

beforeEach(() => {
  for (const slot of ['hat', 'glasses', 'shirt'] as const) ProgressStore.setOutfit(slot, null);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('DressUp scene (Story 8.2)', () => {
  it('a fresh wardrobe says the invitation (the Speaker prompt) and starts bare from the store', () => {
    const { scene, events, off } = open();
    expect(fake.audio.say).toHaveBeenCalledWith(PROMPT_LINE);
    expect(fake.audio.setPrompt).toHaveBeenCalledWith(PROMPT_LINE);
    expect(scene.outfit).toEqual({});
    expect(events).toEqual([]);
    scene.emit('shutdown');
    off();
  });

  it('wear, replace and take off are saved at once; a wear says the item name, a take-off pops', () => {
    const { scene, off } = open();
    scene.tapItem('crown');
    expect(ProgressStore.outfit).toEqual({ hat: 'crown' });
    expect(fake.audio.say).toHaveBeenLastCalledWith(nameLine('crown'));
    expect(fake.audio.sfx).toHaveBeenCalledWith(SFX.wear);
    scene.tapItem('beanie');
    expect(ProgressStore.outfit).toEqual({ hat: 'beanie' });
    scene.tapItem('beanie');
    expect(ProgressStore.outfit).toEqual({});
    expect(fake.audio.sfx).toHaveBeenLastCalledWith(SFX.pop);
    scene.emit('shutdown');
    off();
  });

  it('the round completes once after dressUpRoundChanges changes; free play goes on silent and never restarts', () => {
    const { scene, events, off } = open();
    const n = Tokens.ui.dressUpRoundChanges;
    const ids = ['party-hat', 'round-glasses', 'raincoat', 'party-hat', 'star-glasses', 'crown', 'heart-jumper'] as const;
    for (let i = 0; i < n; i++) scene.tapItem(ids[i]!);
    expect(events).toEqual(['complete']);
    // finishRoundAndStay: no next-round timer at all.
    expect(scene.time.delayedCall).not.toHaveBeenCalledWith(Tokens.Timing.nextRoundDelayMs, expect.anything());
    fake.audio.say.mockClear();
    scene.tapItem(ids[n]!);
    expect(fake.audio.say).not.toHaveBeenCalled();
    expect(ProgressStore.outfit.hat).toBe('crown');
    bus.emit('hud:home', undefined as never);
    expect(events).toEqual(['complete', 'leave']);
    scene.emit('shutdown');
    off();
  });

  it('Home mid-round abandons with { changes }; a resume restores the count (the outfit comes from the store)', () => {
    const first = open();
    first.scene.tapItem('striped-tee');
    first.scene.tapItem('heart-glasses');
    bus.emit('hud:home', undefined as never);
    expect(first.events).toEqual(['abandon']);
    const snap = (first.payloads[0] as { snapshot: { partial: unknown } }).snapshot;
    expect(snap.partial).toEqual({ changes: 2 });
    first.scene.emit('shutdown');
    first.off();
    fake.audio.say.mockClear();
    const again = open(snap);
    expect(fake.audio.say).not.toHaveBeenCalledWith(PROMPT_LINE);
    expect(again.scene.outfit).toEqual({ shirt: 'striped-tee', glasses: 'heart-glasses' });
    for (let i = 2; i < Tokens.ui.dressUpRoundChanges; i++) again.scene.tapItem(i % 2 === 0 ? 'crown' : 'beanie');
    expect(again.events).toEqual(['complete']);
    again.scene.emit('shutdown');
    again.off();
  });
});
