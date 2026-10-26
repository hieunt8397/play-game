// ProgressStore (AD-2, Story 2.1): the durable store and the ONLY module that touches persistent
// storage (lint bans localStorage / sessionStorage / indexedDB / navigator.storage elsewhere).
// - One localStorage key, `bhc.progress`, schema v4:
//   `{ schemaVersion, difficulty: Partial<Record<GameId, number>>, outfit: { hat?, glasses?, shirt? } }`.
// - Only named actions mutate the document (`setDifficulty`, Story 8.2 `setOutfit`). Each action writes the whole document
//   synchronously with `setItem` inside the call — no debounce, timer or promise — even when the
//   value is unchanged.
// - `getDifficulty` is a pure clamped read (missing / bad / negative / touch-talk → 0).
// - Story 8.2: Shiba's outfit (content/games/dress-up.ts): the v3 → v4 step adds `outfit: {}`; sanitise drops
//   unknown item ids and ids in the wrong slot (memory only, like the difficulty strays).
// - Island decorations were removed at runtime (parent decision 2026-10-21): the v2 → v3 step
//   deletes the stored `decorations` and `seq`; difficulty is kept.
// - `init()` runs on the first Start tap: idempotent, never rejects, the only caller of
//   `navigator.storage.persist()`. Loading and migrating happen synchronously inside the first call;
//   only persist() is awaited.
// - Load: read → JSON.parse → integer schemaVersion ≥ 1 → newer than the app? reject → step-by-step
//   MIGRATIONS (v → v+1) → shape check → sanitise (memory only) → write back if a migration ran.
// - Failure policy (one console.warn per case, never a visible or audible error):
//   * corrupt (bad JSON, bad shape, bad/missing schemaVersion, a throwing migration) → defaults in
//     memory, storage stays attached, nothing written at init; the next action overwrites the key;
//   * unusable (getItem/setItem throws, no localStorage) or a NEWER schemaVersion → memory only for
//     the session: storage is detached and never written again (a newer document is real progress).
// - An action before `init()` works in memory only; `init()` then loads over it.
import type { GameId } from '../content/types';
import { SLOTS, itemSlot, type Outfit, type OutfitItemId, type OutfitSlot } from '../content/games/dress-up';

export const PROGRESS_KEY = 'bhc.progress';
export const PROGRESS_SCHEMA_VERSION = 4;

export interface ProgressState {
  schemaVersion: typeof PROGRESS_SCHEMA_VERSION;
  /** Ladder level per game (`touch-talk` has none). Raw values are clamped on read. */
  difficulty: Partial<Record<GameId, number>>;
  /** Story 8.2: what Shiba wears (one item per slot; an absent slot is bare). Sanitised on load. */
  outfit: Outfit;
}

export function defaultProgress(): ProgressState {
  return { schemaVersion: PROGRESS_SCHEMA_VERSION, difficulty: {}, outfit: {} };
}

type RawDoc = Record<string, unknown>;

/**
 * Step migrations: `MIGRATIONS[v]` turns a v document into a v+1 document.
 * v1 → v2: v1 `decorations` was `string[]` with no slot (Epic 1 never wrote any), so it is reset;
 * `seq` and `difficulty` are kept.
 * v2 → v3: island decorations were removed (parent decision 2026-10-21), so `decorations` and `seq`
 * are deleted from storage for good; `difficulty` is kept.
 * v3 → v4 (Story 8.2): Shiba's outfit, `outfit: {}` (bare).
 */
export const MIGRATIONS: Readonly<Record<number, (d: RawDoc) => RawDoc>> = {
  1: (d) => ({ ...d, schemaVersion: 2, decorations: [] }),
  2: (d) => {
    const next: RawDoc = { ...d, schemaVersion: 3 };
    delete next.decorations;
    delete next.seq;
    return next;
  },
  3: (d) => ({ ...d, schemaVersion: 4, outfit: {} }),
};

/** The stored document belongs to a newer app build: never overwrite it. */
export class NewerSchemaError extends Error {
  readonly schemaVersion: number;

  constructor(schemaVersion: number) {
    super(`progress: schemaVersion ${schemaVersion} is newer than ${PROGRESS_SCHEMA_VERSION}`);
    this.name = 'NewerSchemaError';
    this.schemaVersion = schemaVersion;
  }
}

function isPlainObject(v: unknown): v is RawDoc {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonNegativeInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/**
 * Pure: brings a parsed document to the current schema and checks its shape. Throws
 * `NewerSchemaError` for a newer schemaVersion and a plain `Error` for anything corrupt (bad
 * schemaVersion, a missing or throwing migration step, a bad shape). It does not sanitise.
 */
export function migrate(raw: unknown): ProgressState {
  if (!isPlainObject(raw)) throw new Error('progress: document is not an object');
  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('progress: missing or invalid schemaVersion');
  }
  if (version > PROGRESS_SCHEMA_VERSION) throw new NewerSchemaError(version);
  let doc: RawDoc = raw;
  for (let v = version; v < PROGRESS_SCHEMA_VERSION; v += 1) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`progress: no migration from schemaVersion ${v}`);
    doc = step(doc);
    if (!isPlainObject(doc)) throw new Error(`progress: migration from ${v} returned a non-object`);
  }
  if (
    doc.schemaVersion !== PROGRESS_SCHEMA_VERSION ||
    !isPlainObject(doc.difficulty) ||
    !isPlainObject(doc.outfit)
  ) {
    throw new Error('progress: document has a bad shape');
  }
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    difficulty: { ...doc.difficulty } as ProgressState['difficulty'],
    outfit: { ...doc.outfit } as Outfit,
  };
}

/** Story 8.2, pure: the outfit with only known item ids in their own slot (anything else is dropped). */
export function sanitiseOutfit(raw: unknown): { outfit: Outfit; dropped: boolean } {
  const outfit: { [S in OutfitSlot]?: OutfitItemId } = {};
  if (!isPlainObject(raw)) return { outfit, dropped: raw !== undefined };
  let dropped = false;
  for (const [key, value] of Object.entries(raw)) {
    const slot = (SLOTS as readonly string[]).includes(key) ? (key as OutfitSlot) : undefined;
    if (slot && typeof value === 'string' && itemSlot(value) === slot) outfit[slot] = value as OutfitItemId;
    else dropped = true;
  }
  return { outfit, dropped };
}

/** Pure: drops `difficulty['touch-talk']` and (Story 8.2) unknown or wrong-slot outfit ids; other values are kept. */
export function sanitise(state: ProgressState): { state: ProgressState; dropped: boolean } {
  const difficulty = { ...state.difficulty };
  let dropped = false;
  if ('touch-talk' in difficulty) {
    delete difficulty['touch-talk'];
    dropped = true;
  }
  const clean = sanitiseOutfit(state.outfit);
  return { state: { ...state, difficulty, outfit: clean.outfit }, dropped: dropped || clean.dropped };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ProgressDeps {
  /** Defaults to `localStorage`; `null` = no storage (memory only). */
  storage?: StorageLike | null;
  /** Defaults to `navigator.storage.persist`; `null` = API missing. */
  persist?: (() => Promise<boolean>) | null;
}

function defaultStorage(): StorageLike | null {
  // Accessing `localStorage` itself can throw (blocked storage) — the caller catches.
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function defaultPersist(): (() => Promise<boolean>) | null {
  try {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
    return typeof storage?.persist === 'function' ? () => storage.persist() : null;
  } catch {
    return null;
  }
}

export class ProgressStoreService {
  private initPromise: Promise<void> | undefined;
  /** Attached storage; `null` = memory only (before init, or detached for the session). */
  private storage: StorageLike | null = null;
  private current: ProgressState = defaultProgress();

  /**
   * Idempotent: a second call returns the first call's promise (deps of later calls are ignored).
   * The document is loaded (and migrated) synchronously inside the first call; only persist() is
   * awaited. Never rejects.
   */
  init(deps: ProgressDeps = {}): Promise<void> {
    if (!this.initPromise) {
      this.load(deps);
      this.initPromise = this.requestPersist('persist' in deps ? (deps.persist ?? null) : defaultPersist());
    }
    return this.initPromise;
  }

  get state(): Readonly<ProgressState> {
    return this.current;
  }

  /**
   * The stored level of `gameId`, clamped to `[0, ladderLength − 1]`. Pure: no write, no warn.
   * 0 when missing, not an integer, negative, for `touch-talk`, or when `ladderLength < 1`.
   */
  getDifficulty(gameId: GameId, ladderLength: number): number {
    if (gameId === 'touch-talk' || !(ladderLength >= 1)) return 0;
    const value = this.current.difficulty[gameId];
    if (!isNonNegativeInteger(value)) return 0;
    return Math.min(value, Math.floor(ladderLength) - 1);
  }

  /**
   * Sets the level of `gameId` and writes the document synchronously. `touch-talk` is a silent
   * no-op; a level that is not a non-negative integer warns and is ignored.
   */
  setDifficulty(gameId: GameId, level: number): void {
    if (gameId === 'touch-talk') return;
    if (!isNonNegativeInteger(level)) {
      console.warn(`progress: setDifficulty("${gameId}", ${String(level)}) ignored — not a non-negative integer`);
      return;
    }
    this.current.difficulty[gameId] = level;
    this.commit();
  }

  /** Story 8.2: Shiba's outfit (a copy; every id known and in its slot). */
  get outfit(): Outfit {
    return { ...this.current.outfit };
  }

  /**
   * Story 8.2: puts `id` on in `slot` (replacing what was there) or, with `null`, takes the slot off; writes the
   * document synchronously (like `setDifficulty`). An unknown id or one of another slot warns and is ignored.
   */
  setOutfit(slot: OutfitSlot, id: OutfitItemId | null): void {
    if (!(SLOTS as readonly string[]).includes(slot)) {
      console.warn(`progress: setOutfit("${String(slot)}", …) ignored — not a slot`);
      return;
    }
    if (id !== null && itemSlot(id) !== slot) {
      console.warn(`progress: setOutfit("${slot}", "${String(id)}") ignored — not an item of that slot`);
      return;
    }
    const outfit: { [S in OutfitSlot]?: OutfitItemId } = { ...this.current.outfit };
    if (id === null) delete outfit[slot];
    else outfit[slot] = id;
    this.current.outfit = outfit;
    this.commit();
  }

  /** Writes the whole document synchronously (nothing while detached). A throw detaches storage. */
  private commit(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(PROGRESS_KEY, JSON.stringify(this.current));
    } catch (error) {
      this.storage = null;
      console.warn('progress: localStorage write failed — progress kept in memory only', error);
    }
  }

  private load(deps: ProgressDeps): void {
    let storage: StorageLike | null;
    let raw: string | null;
    try {
      storage = 'storage' in deps ? (deps.storage ?? null) : defaultStorage();
      raw = storage ? storage.getItem(PROGRESS_KEY) : null;
    } catch (error) {
      console.warn('progress: localStorage unavailable — progress kept in memory only', error);
      return;
    }
    if (!storage) {
      console.warn('progress: no localStorage — progress kept in memory only');
      return;
    }
    if (raw === null) {
      this.current = defaultProgress();
      this.storage = storage;
      this.commit();
      return;
    }
    let loaded: ProgressState;
    let migrated: boolean;
    try {
      const parsed: unknown = JSON.parse(raw);
      loaded = migrate(parsed);
      migrated = (parsed as RawDoc).schemaVersion !== PROGRESS_SCHEMA_VERSION;
    } catch (error) {
      this.current = defaultProgress();
      if (error instanceof NewerSchemaError) {
        console.warn(`progress: "${PROGRESS_KEY}" has schemaVersion ${error.schemaVersion}, newer than this app — progress kept in memory only`);
        return;
      }
      // Corrupt: keep storage attached so the next action replaces the key (UX-DR55).
      console.warn(`progress: "${PROGRESS_KEY}" is corrupt — using defaults; the next change overwrites it`, error);
      this.storage = storage;
      return;
    }
    const { state, dropped } = sanitise(loaded);
    if (dropped) console.warn(`progress: "${PROGRESS_KEY}" had stray entries — dropped in memory`);
    this.current = state;
    this.storage = storage;
    if (migrated) this.commit();
  }

  private async requestPersist(persist: (() => Promise<boolean>) | null): Promise<void> {
    if (!persist) {
      console.warn('progress: navigator.storage.persist() unavailable — storage may be evicted');
      return;
    }
    try {
      if (!(await persist())) console.warn('progress: persistent storage denied — storage may be evicted');
    } catch (error) {
      console.warn('progress: navigator.storage.persist() rejected', error);
    }
  }
}

/** The app-wide store; `ProgressStore.init()` is called by the Start tap. */
export const ProgressStore = new ProgressStoreService();
