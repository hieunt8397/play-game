// I/O matrix (Story 1.2 init/persist rows; Story 2.1 schema v2→v3, actions, migrations, failure policy).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MIGRATIONS,
  NewerSchemaError,
  PROGRESS_KEY,
  PROGRESS_SCHEMA_VERSION,
  ProgressStoreService,
  defaultProgress,
  migrate,
  type StorageLike,
} from './progress-store';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      data.set(k, v);
    }),
  } satisfies StorageLike & { data: Map<string, string> };
}

type MemoryStorage = ReturnType<typeof memoryStorage>;

function stored(storage: MemoryStorage): unknown {
  const raw = storage.data.get(PROGRESS_KEY);
  return raw === undefined ? undefined : JSON.parse(raw);
}

async function storeWith(raw?: unknown): Promise<{ store: ProgressStoreService; storage: MemoryStorage }> {
  const storage = memoryStorage(raw === undefined ? {} : { [PROGRESS_KEY]: typeof raw === 'string' ? raw : JSON.stringify(raw) });
  const store = new ProgressStoreService();
  await store.init({ storage, persist: async () => true });
  return { store, storage };
}

const V1_FIXTURE = { schemaVersion: 1, seq: 4, difficulty: { 'ice-cream': 2 }, decorations: ['x'] };
const V2_FIXTURE = {
  schemaVersion: 2,
  seq: 3,
  difficulty: { 'ice-cream': 1, pizza: 2 },
  decorations: [
    { slotId: 'ice-cream-1', stationId: 'ice-cream', decorationId: 'parasol', seq: 1 },
    { slotId: 'touch-talk-1', stationId: 'touch-talk', decorationId: 'fire-truck', seq: 3 },
  ],
};

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('ProgressStore.init', () => {
  it('is idempotent: the second call returns the first promise, persist() runs once', async () => {
    const store = new ProgressStoreService();
    const persist = vi.fn(async () => true);
    const storage = memoryStorage();
    const a = store.init({ storage, persist });
    const b = store.init({ storage, persist });
    expect(b).toBe(a);
    await a;
    expect(persist).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('loads synchronously inside the first call (before persist settles)', () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ ...defaultProgress(), difficulty: { 'ice-cream': 2 } }) });
    const store = new ProgressStoreService();
    void store.init({ storage, persist: () => new Promise<boolean>(() => undefined) });
    expect(store.getDifficulty('ice-cream', 4)).toBe(2);
  });

  it('first run: defaults in memory and written; getDifficulty is 0', async () => {
    const { store, storage } = await storeWith();
    expect(stored(storage)).toEqual({ schemaVersion: 3, difficulty: {} });
    expect(store.state).toEqual(defaultProgress());
    expect(store.getDifficulty('ice-cream', 4)).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('an action before init() works in memory only; init() then loads over it', async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ ...defaultProgress(), difficulty: { 'ice-cream': 1 } }) });
    const store = new ProgressStoreService();
    store.setDifficulty('ice-cream', 3);
    expect(store.getDifficulty('ice-cream', 4)).toBe(3);
    await store.init({ storage, persist: async () => true });
    expect(store.getDifficulty('ice-cream', 4)).toBe(1);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe('ProgressStore.setDifficulty', () => {
  it('set + reload: setItem runs inside the action; a new store on the same storage reads it back', async () => {
    const { store, storage } = await storeWith();
    storage.setItem.mockClear();
    store.setDifficulty('ice-cream', 2);
    // Synchronous: the write has happened before the call returned.
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(stored(storage)).toEqual({ schemaVersion: 3, difficulty: { 'ice-cream': 2 } });

    const reloaded = new ProgressStoreService();
    await reloaded.init({ storage, persist: async () => true });
    expect(reloaded.getDifficulty('ice-cream', 4)).toBe(2);
  });

  it('writes even when the value is unchanged', async () => {
    const { store, storage } = await storeWith(defaultProgress());
    store.setDifficulty('ice-cream', 1);
    store.setDifficulty('ice-cream', 1);
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    expect(stored(storage)).toEqual({ schemaVersion: 3, difficulty: { 'ice-cream': 1 } });
  });

  it('touch-talk: silent no-op, no write, key absent', async () => {
    const { store, storage } = await storeWith();
    storage.setItem.mockClear();
    store.setDifficulty('touch-talk', 1);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect('touch-talk' in store.state.difficulty).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([[-1], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY]])('bad level %s: ignored with a warn, no write', async (level) => {
    const { store, storage } = await storeWith();
    storage.setItem.mockClear();
    store.setDifficulty('ice-cream', level);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect('ice-cream' in store.state.difficulty).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('ProgressStore.getDifficulty', () => {
  it.each([
    ['9', 9, 3],
    ['−2', -2, 0],
    ['1.5', 1.5, 0],
    ['"2"', '2', 0],
    ['null', null, 0],
    ['missing', undefined, 0],
    ['2', 2, 2],
  ])('stored %s, ladder 4 → %i', async (_name, value, expected) => {
    const difficulty = value === undefined ? {} : { 'ice-cream': value };
    const { store, storage } = await storeWith({ ...defaultProgress(), difficulty });
    storage.setItem.mockClear();
    expect(store.getDifficulty('ice-cream', 4)).toBe(expected);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('touch-talk and ladderLength < 1 → 0', async () => {
    const { store } = await storeWith({ ...defaultProgress(), difficulty: { pizza: 2 } });
    expect(store.getDifficulty('touch-talk', 4)).toBe(0);
    expect(store.getDifficulty('pizza', 0)).toBe(0);
    expect(store.getDifficulty('pizza', Number.NaN)).toBe(0);
    expect(store.getDifficulty('pizza', 1)).toBe(0);
    expect(store.getDifficulty('pizza', 3)).toBe(2);
  });
});

describe('ProgressStore — migrations', () => {
  it('migrate v1 → v2 fixture: seq and difficulty kept, decorations reset', () => {
    expect(MIGRATIONS[1]?.(V1_FIXTURE)).toEqual({ schemaVersion: 2, seq: 4, difficulty: { 'ice-cream': 2 }, decorations: [] });
  });

  it('migrate v2 → v3: decorations and seq deleted, difficulty kept', () => {
    expect(MIGRATIONS[2]?.(V2_FIXTURE)).toEqual({ schemaVersion: 3, difficulty: { 'ice-cream': 1, pizza: 2 } });
    expect(migrate(V2_FIXTURE)).toEqual({ schemaVersion: 3, difficulty: { 'ice-cream': 1, pizza: 2 } });
    expect(migrate(V1_FIXTURE)).toEqual({ schemaVersion: 3, difficulty: { 'ice-cream': 2 } });
  });

  it('a v2 document with decorations is migrated to v3 and written back during init()', async () => {
    const { store, storage } = await storeWith(V2_FIXTURE);
    expect(stored(storage)).toEqual({ schemaVersion: 3, difficulty: { 'ice-cream': 1, pizza: 2 } });
    expect(store.state).toEqual({ schemaVersion: 3, difficulty: { 'ice-cream': 1, pizza: 2 } });
    expect(store.getDifficulty('pizza', 4)).toBe(2);
    expect(warn).not.toHaveBeenCalled();
  });

  it('every step from the v1 fixture reaches the current version with the difficulty unchanged', () => {
    let doc: Record<string, unknown> = { ...V1_FIXTURE };
    for (let v = 1; v < PROGRESS_SCHEMA_VERSION; v += 1) {
      const step = MIGRATIONS[v];
      expect(step, `missing migration from v${v}`).toBeTypeOf('function');
      doc = step!(doc);
      expect(doc.schemaVersion).toBe(v + 1);
      expect(doc.difficulty).toEqual(V1_FIXTURE.difficulty);
    }
    expect(migrate(V1_FIXTURE).difficulty).toEqual(V1_FIXTURE.difficulty);
    expect(migrate(V1_FIXTURE).schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
  });

  it('migrate throws NewerSchemaError for a newer version and a plain Error for corrupt input', () => {
    expect(() => migrate({ ...defaultProgress(), schemaVersion: 4 })).toThrow(NewerSchemaError);
    for (const bad of [null, [], 'x', { schemaVersion: 0 }, { schemaVersion: 1.5 }, { schemaVersion: '2' }, {}, { schemaVersion: 3 }]) {
      expect(() => migrate(bad)).toThrow();
      try {
        migrate(bad);
      } catch (error) {
        expect(error).not.toBeInstanceOf(NewerSchemaError);
      }
    }
  });

  it('a v1 document is migrated and written back during init()', async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify(V1_FIXTURE) });
    const store = new ProgressStoreService();
    const pending = store.init({ storage, persist: async () => true });
    // Written synchronously inside init(), before persist settles.
    expect(stored(storage)).toEqual({ schemaVersion: 3, difficulty: { 'ice-cream': 2 } });
    await pending;
    expect(store.getDifficulty('ice-cream', 4)).toBe(2);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a current document is not written at init', async () => {
    const { storage } = await storeWith({ ...defaultProgress(), difficulty: { 'ice-cream': 1 } });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('newer schema: defaults, one warn, key never overwritten by later actions', async () => {
    const newer = { schemaVersion: 4, difficulty: { 'ice-cream': 3 }, extra: true };
    const { store, storage } = await storeWith(newer);
    expect(store.state).toEqual(defaultProgress());
    expect(warn).toHaveBeenCalledTimes(1);
    store.setDifficulty('ice-cream', 1);
    expect(store.getDifficulty('ice-cream', 4)).toBe(1);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(stored(storage)).toEqual(newer);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('ProgressStore — corrupt store', () => {
  it.each([
    ['"{bad"', '{bad'],
    ['null', 'null'],
    ['no difficulty', JSON.stringify({ schemaVersion: 3 })],
    ['difficulty is an array', JSON.stringify({ schemaVersion: 3, difficulty: [] })],
    ['missing schemaVersion', JSON.stringify({ difficulty: {} })],
    ['v2 with a bad difficulty', JSON.stringify({ schemaVersion: 2, seq: 0, difficulty: 'x', decorations: [] })],
    ['v1 with a bad shape', JSON.stringify({ schemaVersion: 1, seq: 0, difficulty: null })],
  ])('%s → defaults, one warn, no write at init; the next action writes defaults + change', async (_name, raw) => {
    const { store, storage } = await storeWith(raw);
    expect(store.state).toEqual(defaultProgress());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(storage.setItem).not.toHaveBeenCalled();
    store.setDifficulty('ice-cream', 1);
    expect(stored(storage)).toEqual({ schemaVersion: 3, difficulty: { 'ice-cream': 1 } });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('ProgressStore — sanitise', () => {
  it('stray entries: touch-talk difficulty dropped in memory, rest kept, one warn', async () => {
    const doc = { schemaVersion: 3, difficulty: { 'ice-cream': 2, 'touch-talk': 1, pizza: '1' } };
    const { store, storage } = await storeWith(doc);
    expect(store.state.difficulty).toEqual({ 'ice-cream': 2, pizza: '1' });
    expect(warn).toHaveBeenCalledTimes(1);
    // In memory only: the stored document is untouched until the next action.
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(stored(storage)).toEqual(doc);
    store.setDifficulty('ice-cream', 3);
    expect(stored(storage)).toEqual({ schemaVersion: 3, difficulty: { 'ice-cream': 3, pizza: '1' } });
  });
});

describe('ProgressStore — storage unusable', () => {
  it('getItem throws → memory only, levels still move, one warn total', async () => {
    const storage = memoryStorage();
    storage.getItem.mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const store = new ProgressStoreService();
    await store.init({ storage, persist: async () => true });
    expect(store.state).toEqual(defaultProgress());
    store.setDifficulty('ice-cream', 1);
    store.setDifficulty('ice-cream', 2);
    expect(store.getDifficulty('ice-cream', 4)).toBe(2);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('setItem throws (quota) → detached, levels still move, one warn total', async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify(defaultProgress()) });
    storage.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const store = new ProgressStoreService();
    await store.init({ storage, persist: async () => true });
    store.setDifficulty('ice-cream', 1);
    store.setDifficulty('ice-cream', 2);
    expect(store.getDifficulty('ice-cream', 4)).toBe(2);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('setItem throws on the first-run write → detached, one warn', async () => {
    const storage = memoryStorage();
    storage.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const store = new ProgressStoreService();
    await store.init({ storage, persist: async () => true });
    store.setDifficulty('ice-cream', 1);
    expect(store.getDifficulty('ice-cream', 4)).toBe(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('no storage at all → memory only, one warning', async () => {
    const store = new ProgressStoreService();
    await store.init({ storage: null, persist: async () => true });
    expect(store.state).toEqual(defaultProgress());
    store.setDifficulty('ice-cream', 1);
    expect(store.getDifficulty('ice-cream', 4)).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('ProgressStore — persist denied', () => {
  it.each([
    ['rejects', { persist: () => Promise.reject(new Error('nope')) }],
    ['throws synchronously', { persist: () => { throw new Error('nope'); } }],
    ['returns false', { persist: async () => false }],
    ['is missing', { persist: null }],
  ])('persist() %s → app continues, store usable, one warning', async (_name, deps) => {
    const store = new ProgressStoreService();
    const storage = memoryStorage();
    await expect(store.init({ storage, ...deps })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    store.setDifficulty('ice-cream', 1);
    expect(store.getDifficulty('ice-cream', 4)).toBe(1);
    expect((stored(storage) as { difficulty: unknown }).difficulty).toEqual({ 'ice-cream': 1 });
  });
});

describe('ProgressStore — production defaults', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('init() with no deps uses localStorage and navigator.storage.persist()', async () => {
    const storage = memoryStorage();
    const persist = vi.fn(async () => true);
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('navigator', { storage: { persist } });
    const store = new ProgressStoreService();
    await store.init();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(stored(storage)).toEqual(defaultProgress());
    expect(warn).not.toHaveBeenCalled();
  });
});

