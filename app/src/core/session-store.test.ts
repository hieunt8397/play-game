import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { LAYOUTS } from '../content/layouts';
import type { Snapshot } from '../content/types';
import { ProgressStoreService, type StorageLike } from './progress-store';
import { resumeMarkPlan } from './resume-marks';
import { resumeStartData, SessionStore, takeStartData } from './session-store';

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('SessionStore', () => {
  it('cold start: no last station, no trips', () => {
    const s = new SessionStore();
    expect(s.lastStation).toBeUndefined();
    expect(s.kartTrips).toBe(0);
    expect(s.resume).toEqual({});
  });

  it('clearResume (Story 2.3) removes only that game', () => {
    const s = new SessionStore();
    const snap = { v: 1 as const, level: 1, seed: 3, questionIndex: 2, partial: { placed: [] } };
    s.resume['ice-cream'] = snap;
    s.resume.pizza = { ...snap, level: 0 };
    s.clearResume('ice-cream');
    expect(s.resume).toEqual({ pizza: { ...snap, level: 0 } });
    s.clearResume('race');
    expect(Object.keys(s.resume)).toEqual(['pizza']);
  });

  it('startData: level from the injected progress, seed floor(rng × 2^31)', () => {
    const s = new SessionStore();
    const calls: [string, number][] = [];
    const progress = {
      getDifficulty: (id: string, len: number) => {
        calls.push([id, len]);
        return 2;
      },
    };
    expect(s.startData('pizza', 5, () => 0.5, progress)).toEqual({ level: 2, seed: 2 ** 30 });
    expect(calls).toEqual([['pizza', 5]]);
    expect(s.startData('pizza', 5, () => 0, progress).seed).toBe(0);
    const top = s.startData('pizza', 5, () => 1, progress).seed;
    expect(top).toBeLessThan(2 ** 31);
    expect(Number.isInteger(top)).toBe(true);
  });

  it('startData (Story 2.1): a level set in ProgressStore survives a reload', async () => {
    const storage = memoryStorage();
    const before = new ProgressStoreService();
    await before.init({ storage, persist: async () => true });
    before.setDifficulty('ice-cream', 2);

    const after = new ProgressStoreService();
    await after.init({ storage, persist: async () => true });
    expect(new SessionStore().startData('ice-cream', 4, () => 0, after)).toEqual({ level: 2, seed: 0 });
    expect(new SessionStore().startData('ice-cream', 2, () => 0, after).level).toBe(1);
  });
});

describe('SessionStore resume points (Story 2.5)', () => {
  const SNAP: Snapshot = {
    v: 1,
    level: 1,
    seed: 77,
    questionIndex: 1,
    partial: { placed: ['strawberry'] },
    tally: { questions: 1, firstTryCorrect: 1, maxHintLevel: 0 },
  };

  it('setResume keeps a deep copy (never the same object); getResume returns it', () => {
    const s = new SessionStore();
    const live = JSON.parse(JSON.stringify(SNAP)) as Snapshot<'ice-cream'>;
    s.setResume('ice-cream', live);
    const held = s.getResume('ice-cream');
    expect(held).toEqual(SNAP);
    expect(held).not.toBe(live);
    live.partial.placed.push('mint');
    expect(s.getResume('ice-cream')).toEqual(SNAP);
    expect(s.getResume('pizza')).toBeUndefined();
  });

  it('two games: set ice-cream then pizza, clear ice-cream → pizza kept; resumeIds in GAME_IDS order; one mark', () => {
    const s = new SessionStore();
    s.setResume('pizza', { ...SNAP, partial: { placed: [1], baked: false } });
    s.setResume('ice-cream', SNAP);
    expect(s.resumeIds()).toEqual(['ice-cream', 'pizza']);
    s.clearResume('ice-cream');
    expect(s.getResume('pizza')).toMatchObject({ partial: { placed: [1], baked: false } });
    expect(s.resumeIds()).toEqual(['pizza']);
    expect(resumeMarkPlan(s.resumeIds(), LAYOUTS.map.hits)).toHaveLength(1);
  });

  it('reload: a fresh store holds nothing; resumeStartData null, so the start uses getDifficulty', () => {
    const s = new SessionStore();
    expect(s.resume).toEqual({});
    expect(s.resumeIds()).toEqual([]);
    expect(resumeMarkPlan(s.resumeIds(), LAYOUTS.map.hits)).toEqual([]);
    expect(resumeStartData('ice-cream', 4, s)).toBeNull();
    const progress = { getDifficulty: () => 2 };
    expect(s.startData('ice-cream', 4, () => 0, progress)).toEqual({ level: 2, seed: 0 });
  });

  it('resumeStartData: the held level and seed (even when ProgressStore says otherwise), with the snapshot', () => {
    const s = new SessionStore();
    s.setResume('ice-cream', SNAP);
    expect(resumeStartData('ice-cream', 4, s)).toEqual({ level: 1, seed: 77, resume: SNAP });
    expect(resumeStartData('pizza', 4, s)).toBeNull();
  });

  it('resumeStartData: a held level outside the ladder warns and returns null', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = new SessionStore();
    s.setResume('ice-cream', { ...SNAP, level: 7 });
    expect(resumeStartData('ice-cream', 4, s)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe('setResume callers (source scan, Story 2.5)', () => {
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  // Map stores through core/post-round-chain › keepAbandonSnapshot (the pure abandon helper).
  const ALLOWED = ['core/post-round-chain.ts', 'core/session-store.ts'];

  function listTs(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return listTs(p);
      return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [p] : [];
    });
  }

  it('`setResume(` appears only in session-store.ts and post-round-chain.ts; keepAbandonSnapshot is called only by Map', () => {
    const callers = listTs(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes('setResume('))
      .map((f) => relative(SRC, f).split(sep).join('/'))
      .sort();
    expect(callers).toEqual(ALLOWED);
    const keepers = listTs(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes('keepAbandonSnapshot('))
      .map((f) => relative(SRC, f).split(sep).join('/'))
      .sort();
    expect(keepers).toEqual(['core/post-round-chain.ts', 'scenes/Map.ts']);
  });
});

describe('takeStartData (Story 2.5: the start choice)', () => {
  const SNAP: Snapshot = { v: 1, level: 1, seed: 77, questionIndex: 1, partial: { placed: ['strawberry'] }, tally: { questions: 1, firstTryCorrect: 1, maxHintLevel: 0 } };
  const progress = { getDifficulty: () => 2 };

  it('an entry with a held snapshot: resumes at its level and seed (ProgressStore says 2); cleared after', () => {
    const s = new SessionStore();
    s.setResume('ice-cream', SNAP);
    expect(takeStartData('ice-cream', 4, s, () => 0.5, progress)).toEqual({ level: 1, seed: 77, resume: SNAP });
    expect(s.getResume('ice-cream')).toBeUndefined();
    expect(s.resumeIds()).toEqual([]);
  });

  it('a start after clearResume is fresh (stored level, new seed), never a resume', () => {
    const s = new SessionStore();
    s.setResume('ice-cream', SNAP);
    s.clearResume('ice-cream');
    expect(takeStartData('ice-cream', 4, s, () => 0.5, progress)).toEqual({ level: 2, seed: 2 ** 30 });
  });

  it('nothing held: a fresh start', () => {
    const s = new SessionStore();
    expect(takeStartData('ice-cream', 4, s, () => 0, progress)).toEqual({ level: 2, seed: 0 });
  });

  it('only that game is cleared', () => {
    const s = new SessionStore();
    s.setResume('ice-cream', SNAP);
    s.setResume('pizza', { ...SNAP, partial: { placed: [], baked: false } });
    takeStartData('ice-cream', 4, s, () => 0, progress);
    expect(s.resumeIds()).toEqual(['pizza']);
  });

  it.each([
    ['level outside the ladder', { level: 7 }],
    ['a negative seed', { seed: -1 }],
    ['a seed ≥ 2^31', { seed: 2 ** 31 }],
    ['a fractional seed', { seed: 1.5 }],
    ['version 2', { v: 2 }],
    ['a negative question index', { questionIndex: -1 }],
  ])('an invalid held snapshot (%s): a fresh start with a warn, and it is cleared', (_name, patch) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = new SessionStore();
    s.resume['ice-cream'] = { ...SNAP, ...patch } as Snapshot;
    expect(takeStartData('ice-cream', 4, s, () => 0, progress)).toEqual({ level: 2, seed: 0 });
    expect(warn).toHaveBeenCalled();
    expect(s.getResume('ice-cream')).toBeUndefined();
    warn.mockRestore();
  });
});
