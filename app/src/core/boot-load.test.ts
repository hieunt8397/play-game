// I/O matrix (Story 1.2): "Load fails" and "Gate dev" rows. Story 1.11: the gate rows (Dev /
// Unsupported, First install, Already active, Install stuck) and "Loader error → online" (createBootLoader).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_CATALOG, AUDIO_IDS } from '../content/audio-catalog';
import {
  bootAudio,
  isBootAudioId,
  bootTextures,
  createBootLoader,
  createReadinessGate,
  type FailedFile,
  type BootLoaderAdapter,
  FONT_FAMILY,
  FONT_PROBE,
  FONT_URL,
  kartTimeScale,
  nextLoadState,
  waitForReady,
  type LoadEvent,
  type LoadState,
  type ReadyDeps,
} from './boot-load';
import { Timing } from './timing';

describe('nextLoadState', () => {
  const table: Array<[LoadState, LoadEvent, LoadState]> = [
    ['loading', 'complete', 'ready'],
    ['loading', 'error', 'waiting'],
    ['loading', 'online', 'loading'],
    ['loading', 'retryTick', 'loading'],
    ['waiting', 'online', 'loading'],
    ['waiting', 'retryTick', 'loading'],
    ['waiting', 'error', 'waiting'],
    ['waiting', 'complete', 'ready'],
    ['ready', 'error', 'ready'],
    ['ready', 'online', 'ready'],
    ['ready', 'retryTick', 'ready'],
    ['ready', 'complete', 'ready'],
  ];
  it.each(table)('%s + %s → %s', (state, event, expected) => {
    expect(nextLoadState(state, event)).toBe(expected);
  });

  it('a failed load slows the kart, retries, then reaches ready', () => {
    let s: LoadState = 'loading';
    expect(kartTimeScale(s)).toBe(1);
    s = nextLoadState(s, 'error');
    expect(kartTimeScale(s)).toBe(Timing.loadingKartWaitTimeScale);
    expect(Timing.loadingKartWaitTimeScale).toBeLessThan(1);
    s = nextLoadState(s, 'online');
    expect(kartTimeScale(s)).toBe(1);
    s = nextLoadState(s, 'complete');
    expect(s).toBe('ready');
  });
});

function fakes(opts: { fontOk?: boolean; probeFaces?: number; registration?: { active: unknown } } = {}) {
  const { fontOk = true, probeFaces = 1, registration = undefined } = opts;
  const faces: Array<{ family: string; source: string; descriptors: { weight: string }; load: () => Promise<unknown> }> = [];
  let resolveReady: (v: unknown) => void = () => undefined;
  let resolveSleep: () => void = () => undefined;
  const ready = new Promise((r) => {
    resolveReady = r;
  });
  const sleep = vi.fn(
    (_ms: number) =>
      new Promise<void>((r) => {
        resolveSleep = r;
      }),
  );
  const fonts = {
    add: vi.fn(),
    delete: vi.fn(),
    load: vi.fn(async (_font: string) => Array.from({ length: probeFaces }, () => ({}))),
  };
  const deps: ReadyDeps = {
    registration: Promise.resolve(registration),
    ready,
    sleep,
    fonts,
    fontFace: (family, source, descriptors) => {
      const face = { family, source, descriptors, load: () => (fontOk ? Promise.resolve(face) : Promise.reject(new Error('NetworkError'))) };
      faces.push(face);
      return face;
    },
  };
  return { deps, sleep, fonts, faces, resolveReady: (v: unknown) => resolveReady(v), resolveSleep: () => resolveSleep() };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('waitForReady', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers the vendored Baloo 2 with a relative URL and awaits the 600 18px probe', async () => {
    const f = fakes();
    await waitForReady(f.deps);
    expect(f.faces).toHaveLength(1);
    expect(f.faces[0]?.family).toBe(FONT_FAMILY);
    expect(f.faces[0]?.source).toBe(`url(${FONT_URL})`);
    expect(FONT_URL).not.toMatch(/^(\/|https?:)/);
    expect(f.fonts.add).toHaveBeenCalledWith(f.faces[0]);
    expect(f.fonts.load).toHaveBeenCalledWith(FONT_PROBE);
    expect(FONT_PROBE).toBe("600 18px 'Baloo 2'");
  });

  it('dev / unsupported / register rejected (registration undefined): the SW step is skipped', async () => {
    const f = fakes();
    await waitForReady(f.deps);
    expect(f.sleep).not.toHaveBeenCalled();
    expect(f.fonts.load).toHaveBeenCalledTimes(1);
  });

  it('a rejecting registration promise counts as no registration', async () => {
    const f = fakes();
    await waitForReady({ ...f.deps, registration: Promise.reject(new Error('SecurityError')) });
    expect(f.sleep).not.toHaveBeenCalled();
    expect(f.fonts.load).toHaveBeenCalledTimes(1);
  });

  it('already active (an update may be waiting): no wait for ready', async () => {
    const f = fakes({ registration: { active: {} } });
    await waitForReady(f.deps);
    expect(f.sleep).not.toHaveBeenCalled();
    expect(f.fonts.load).toHaveBeenCalledTimes(1);
  });

  it('first install: waits for serviceWorker.ready, then the font', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const f = fakes({ registration: { active: null } });
    let done = false;
    const p = waitForReady(f.deps).then(() => {
      done = true;
    });
    await flush();
    expect(done).toBe(false);
    expect(f.fonts.load).not.toHaveBeenCalled();
    expect(f.sleep).toHaveBeenCalledWith(Timing.swPrecacheTimeoutMs);
    f.resolveReady({});
    await p;
    expect(done).toBe(true);
    expect(f.fonts.load).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('install stuck: after swPrecacheTimeoutMs it warns once and continues to the font (never rejects)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const f = fakes({ registration: { active: null } });
    const p = waitForReady(f.deps);
    await flush();
    expect(f.fonts.load).not.toHaveBeenCalled();
    f.resolveSleep();
    await expect(p).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(f.fonts.load).toHaveBeenCalledTimes(1);
    expect(Timing.swPrecacheTimeoutMs).toBe(20000);
  });

  it('rejects when the font fails, removing the failed face so a retry starts fresh', async () => {
    const f = fakes({ fontOk: false });
    await expect(waitForReady(f.deps)).rejects.toThrow('NetworkError');
    expect(f.fonts.delete).toHaveBeenCalledWith(f.faces[0]);
  });

  it('rejects when the probe matches no face', async () => {
    const f = fakes({ probeFaces: 0 });
    await expect(waitForReady(f.deps)).rejects.toThrow(/did not load/);
  });
});

describe('createReadinessGate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the SW wait at most once: a retry after a font failure does not sleep or warn again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const f = fakes({ fontOk: false, registration: { active: null } });
    const gate = createReadinessGate(f.deps);
    const first = gate();
    await flush();
    f.resolveSleep();
    await expect(first).rejects.toThrow('NetworkError');
    expect(f.sleep).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    await expect(gate()).rejects.toThrow('NetworkError');
    expect(f.sleep).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(f.faces).toHaveLength(2);
  });
});

/** A fake Phaser adapter: a cache of loaded keys, scripted file failures and a scripted gate. */
function fakeAdapter(items: readonly string[]) {
  const cache = new Set<string>();
  const failNext = new Set<string>();
  const gateResults: Array<'ok' | 'fail'> = [];
  const calls: string[] = [];
  let lastDone: ((failed: readonly FailedFile[]) => void) | undefined;
  let lastList: readonly string[] = [];
  const adapter: BootLoaderAdapter<string> = {
    missing: () => items.filter((k) => !cache.has(k)),
    loadAll: (list, done) => {
      calls.push(`load:${list.join(',')}`);
      lastList = list;
      lastDone = done;
    },
    gate: () => {
      calls.push('gate');
      return gateResults.shift() === 'fail' ? Promise.reject(new Error('font')) : Promise.resolve();
    },
    setTimeScale: (s) => calls.push(`scale:${s}`),
    onReady: () => {
      calls.push('overlay');
      calls.push('Start');
    },
  };
  /** Finishes the pending loadAll: keys in failNext fail once, the rest enter the cache. */
  const finishLoad = (): void => {
    const failed = lastList.filter((k) => failNext.has(k));
    for (const k of lastList) if (!failNext.has(k)) cache.add(k);
    failNext.clear();
    lastDone?.(failed.map((key) => ({ key, src: `assets/${key}.m4a` })));
  };
  return { adapter, calls, failNext, gateResults, finishLoad };
}

describe('createBootLoader (Story 1.11: Boot dispatch/attempt/gate moved to core)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path: load, gate, ready → overlay launched then Start, once', async () => {
    const f = fakeAdapter(['a', 'b']);
    const loader = createBootLoader(f.adapter);
    loader.start();
    expect(f.calls).toEqual(['load:a,b']);
    f.finishLoad();
    await flush();
    expect(loader.state).toBe('ready');
    expect(f.calls).toEqual(['load:a,b', 'gate', 'scale:1', 'overlay', 'Start']);
    loader.dispatch('online');
    loader.dispatch('retryTick');
    loader.dispatch('complete');
    expect(f.calls.filter((c) => c === 'Start')).toHaveLength(1);
  });

  it('nothing missing goes straight to the gate', async () => {
    const f = fakeAdapter([]);
    const loader = createBootLoader(f.adapter);
    loader.start();
    await flush();
    expect(f.calls).toEqual(['gate', 'scale:1', 'overlay', 'Start']);
    expect(loader.state).toBe('ready');
  });

  it('loader error → waiting, kart slows, warn per file; online → retries only the missing files; complete → Start once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const f = fakeAdapter(['a', 'b', 'c']);
    const loader = createBootLoader(f.adapter);
    f.failNext.add('b');
    f.failNext.add('c');
    loader.start();
    f.finishLoad();
    expect(loader.state).toBe('waiting');
    expect(f.calls).toContain(`scale:${Timing.loadingKartWaitTimeScale}`);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]?.[0])).toContain('"b"');
    expect(String(warn.mock.calls[1]?.[0])).toContain('"c"');
    expect(warn.mock.calls[0]?.[1]).toBe('assets/b.m4a');
    expect(warn.mock.calls[1]?.[1]).toBe('assets/c.m4a');
    loader.dispatch('error');
    expect(loader.state).toBe('waiting');
    loader.dispatch('online');
    expect(loader.state).toBe('loading');
    expect(f.calls.at(-2)).toBe('scale:1');
    expect(f.calls.at(-1)).toBe('load:b,c');
    f.finishLoad();
    await flush();
    expect(loader.state).toBe('ready');
    expect(f.calls.slice(-2)).toEqual(['overlay', 'Start']);
    expect(f.calls.filter((c) => c === 'Start')).toHaveLength(1);
  });

  it('gate rejection → waiting with one warn; retryTick → a new gate attempt → ready', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const f = fakeAdapter([]);
    f.gateResults.push('fail');
    const loader = createBootLoader(f.adapter);
    loader.start();
    await flush();
    expect(loader.state).toBe('waiting');
    expect(warn).toHaveBeenCalledTimes(1);
    loader.dispatch('retryTick');
    await flush();
    expect(loader.state).toBe('ready');
    expect(f.calls.filter((c) => c === 'gate')).toHaveLength(2);
    expect(f.calls.filter((c) => c === 'Start')).toHaveLength(1);
  });

  it('online or retryTick while still loading does not start a second attempt', () => {
    const f = fakeAdapter(['a']);
    const loader = createBootLoader(f.adapter);
    loader.start();
    loader.dispatch('online');
    loader.dispatch('retryTick');
    expect(f.calls).toEqual(['load:a']);
  });
});

describe('bootAudio', () => {
  it('loads the shell SFX, the music and the shell voice lines keyed by id', () => {
    const list = bootAudio();
    expect(list).toContainEqual(['vo.shell.greeting', 'assets/audio/vo/vo.shell.greeting.m4a']);
    for (const id of AUDIO_IDS) {
      if (id.startsWith('sfx.shell.') || id.startsWith('music.')) expect(list).toContainEqual([id, AUDIO_CATALOG[id].path]);
    }
    expect(list.filter(([key]) => key.startsWith('vo.') && !key.startsWith('vo.shell.'))).toEqual([]);
  });

  it('leaves game-scoped catalog ids to their game (Story 1.8)', () => {
    const keys = bootAudio().map(([key]) => key);
    expect(keys).not.toContain('sfx.ice-cream.snap');
    expect(keys).not.toContain('sfx.ice-cream.happy');
    expect(isBootAudioId('sfx.shell.pop')).toBe(true);
    expect(isBootAudioId('music.island')).toBe(true);
    expect(isBootAudioId('sfx.ice-cream.snap')).toBe(false);
  });
});

describe('bootTextures (Story 1.5)', () => {
  it('loads the map atlas and the map plate', () => {
    expect(bootTextures()).toEqual([
      { kind: 'atlas', key: 'atlas.map', png: 'assets/atlases/map.png', json: 'assets/atlases/map.json' },
      { kind: 'image', key: 'bg.map', path: 'assets/bg/map.png' },
    ]);
  });
});
