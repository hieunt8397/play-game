// Story 2.5 I/O matrix: JSON-only check, the envelope, every readResume rejection, and the per-game
// partial types (compile-time: `npm run typecheck` fails if an @ts-expect-error below stops erroring).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot, SnapshotPartials } from '../content/types';
import { EMPTY_TALLY, isJsonOnly, makeSnapshot, readResume } from './snapshot';

afterEach(() => {
  vi.restoreAllMocks();
});

const HOME_SNAP: Snapshot<'ice-cream'> = {
  v: 1,
  level: 1,
  seed: 123,
  questionIndex: 1,
  partial: { placed: ['strawberry'] },
  tally: { questions: 1, firstTryCorrect: 1, maxHintLevel: 0 },
};

describe('isJsonOnly', () => {
  it.each([
    ['null', null],
    ['a string', 'a'],
    ['a boolean', false],
    ['a finite number', -1.5],
    ['an array', [1, 'a', null, [true]]],
    ['a plain object', { a: { b: [1] } }],
    ['a null-prototype object', Object.assign(Object.create(null) as object, { a: 1 })],
    ['a shared (non-cyclic) reference', (() => {
      const shared = { x: 1 };
      return { a: shared, b: shared };
    })()],
  ])('true for %s', (_name, v) => {
    expect(isJsonOnly(v)).toBe(true);
  });

  class Thing {
    x = 1;
  }
  const cyclic: Record<string, unknown> = { a: 1 };
  cyclic.self = cyclic;
  const cyclicArray: unknown[] = [];
  cyclicArray.push(cyclicArray);

  it.each([
    ['undefined', undefined],
    ['a function', () => 1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a class instance (e.g. a GameObject)', new Thing()],
    ['a Date', new Date(0)],
    ['a Map', new Map()],
    ['a nested function', { partial: { placed: [() => 1] } }],
    ['an undefined property', { a: undefined }],
    ['a sparse array', new Array<number>(3)],
    ['a cyclic object', cyclic],
    ['a cyclic array', cyclicArray],
    ['a symbol', Symbol('s')],
    ['a bigint', BigInt(1)],
  ])('false for %s', (_name, v) => {
    expect(isJsonOnly(v)).toBe(false);
  });
});

describe('makeSnapshot', () => {
  it('builds the v1 envelope from level, seed, tally and the game progress', () => {
    const s = makeSnapshot<'ice-cream'>({
      level: 1,
      seed: 123,
      tally: { questions: 1, firstTryCorrect: 1, maxHintLevel: 0 },
      progress: { questionIndex: 1, partial: { placed: ['strawberry'] } },
    });
    expect(s).toEqual(HOME_SNAP);
    expect(s).toMatchObject({ v: 1, level: 1, seed: 123, questionIndex: 1, partial: { placed: ['strawberry'] } });
  });

  it('JSON: a round trip deep-equals the snapshot; isJsonOnly is true', () => {
    expect(JSON.parse(JSON.stringify(HOME_SNAP))).toEqual(HOME_SNAP);
    expect(isJsonOnly(HOME_SNAP)).toBe(true);
  });

  it('not JSON (a function, a GameObject-like instance, NaN in the progress): console.error in dev', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    class GameObject {
      x = 0;
    }
    const bad = [() => 1, new GameObject(), Number.NaN];
    for (const v of bad) {
      makeSnapshot({ level: 0, seed: 0, tally: EMPTY_TALLY, progress: { questionIndex: 0, partial: { placed: [v] } as never } });
    }
    expect(error).toHaveBeenCalledTimes(bad.length);
  });
});

describe('readResume', () => {
  const START = { level: 1, seed: 123 };

  it('a valid snapshot: questionIndex, partial (unvalidated) and tally', () => {
    expect(readResume(HOME_SNAP, START)).toEqual({ questionIndex: 1, partial: { placed: ['strawberry'] }, tally: HOME_SNAP.tally });
  });

  it('a missing tally is the empty tally, with no warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { tally: _t, ...noTally } = HOME_SNAP;
    expect(readResume(noTally, START)?.tally).toEqual(EMPTY_TALLY);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['a negative count', { questions: -1, firstTryCorrect: 0, maxHintLevel: 0 }],
    ['firstTry > questions', { questions: 1, firstTryCorrect: 2, maxHintLevel: 0 }],
    ['hint level 5', { questions: 1, firstTryCorrect: 0, maxHintLevel: 5 }],
    ['not an object', 'x'],
    ['questions ≠ questionIndex', { questions: 2, firstTryCorrect: 2, maxHintLevel: 0 }],
  ])('an invalid tally (%s) becomes the empty tally with a warn', (_name, tally) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = readResume({ ...HOME_SNAP, tally }, START);
    expect(r).toMatchObject({ questionIndex: 1, tally: EMPTY_TALLY });
    expect(warn).toHaveBeenCalledOnce();
  });

  it.each([
    ['not an object', null],
    ['v 2', { ...HOME_SNAP, v: 2 }],
    ['a missing v', { ...HOME_SNAP, v: undefined }],
    ['a non-integer level', { ...HOME_SNAP, level: 1.5 }],
    ['a non-integer seed', { ...HOME_SNAP, seed: '123' }],
    ['a non-integer question index', { ...HOME_SNAP, questionIndex: 0.5 }],
    ['a negative question index', { ...HOME_SNAP, questionIndex: -1 }],
    ['a level mismatch', { ...HOME_SNAP, level: 2 }],
    ['a seed mismatch', { ...HOME_SNAP, seed: 124 }],
    ['non-JSON content', { ...HOME_SNAP, partial: { placed: [() => 1] } }],
  ])('rejects %s: null with one console.warn', (_name, resume) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(readResume(resume, START)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('SnapshotPartials (compile-time)', () => {
  it('every game is declared; a touch-talk partial type-checks, an ice-cream one does not', () => {
    const touch: Snapshot<'touch-talk'> = { v: 1, level: 0, seed: 1, questionIndex: 0, partial: { sceneId: 'sea', touchedIds: ['a'] } };
    // @ts-expect-error -- `{ placed: [] }` is not a touch-talk partial
    const wrong: Snapshot<'touch-talk'> = { v: 1, level: 0, seed: 1, questionIndex: 0, partial: { placed: [] } };
    // @ts-expect-error -- an unknown flavour is not an ice-cream partial
    const flavour: SnapshotPartials['ice-cream'] = { placed: ['banana'] };
    const all: { [G in keyof SnapshotPartials]: SnapshotPartials[G] } = {
      'ice-cream': { placed: ['mint'] },
      pizza: { placed: [0, 2], baked: false },
      'dino-puzzle': { placed: ['head'] },
      'shadow-match': {},
      race: { traceIndex: 3 },
      fishing: {},
      'touch-talk': { sceneId: 'sea', touchedIds: [] },
      'animal-pens': { behind: ['dog', 'cat', 'cow', 'pig'], reveals: 3 },
      band: {},
      bedtime: { done: ['brush', 'lamp'] },
      'pet-clinic': { patient: 'pig', left: ['mud'], seen: ['dog'] },
      'dress-up': { changes: 3 },
      garden: { offer: ['lemon', 'tomato'], kind: 'lemon', waterings: 2, left: [], surprise: 'worm' },
      'car-wash': { vehicle: 'taxi', dirt: 'mud', covered: [0, 3], surprise: 'duck' },
      plane: { friend: 'cat', gifts: ['red', 'purple'], surprise: 'rainbow' },
      train: { friends: ['cat', 'pig', 'cow'], aboard: 2, dest: 'beach', surprise: 'bridge', tunnelLeg: 1 },
      rocket: { step: 'moon', colours: ['red', 'blue', 'white'], surprise: 'ufo', flag: true },
    };
    expect(isJsonOnly(touch)).toBe(true);
    expect(isJsonOnly(all)).toBe(true);
    expect(Object.keys(all)).toHaveLength(17);
    expect(wrong.partial).toEqual({ placed: [] });
    expect(flavour.placed).toEqual(['banana']);
  });
});
