// Story 8.2: the wardrobe round model (I/O matrix: wear, replace, take off, count, free play, resume).
import { describe, expect, it } from 'vitest';
import { OUTFIT_ITEMS, SLOTS, nameLine } from '../../content/games/dress-up';
import { createDressUpRound, resumeDressUp } from './round';

const resumeAt = (partial: unknown, questionIndex = 0) => ({ questionIndex, partial, tally: { questions: 0, firstTryCorrect: 0, maxHintLevel: 0 as const } });

describe('content', () => {
  it('≥ 4 hats, 3 glasses and 4 shirts; every id is a kebab frame name', () => {
    const count = (slot: string) => OUTFIT_ITEMS.filter((i) => i.slot === slot).length;
    expect([count('hat'), count('glasses'), count('shirt')]).toEqual([4, 3, 4]);
    expect(SLOTS).toEqual(['shirt', 'glasses', 'hat']);
    for (const i of OUTFIT_ITEMS) expect(i.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe('createDressUpRound', () => {
  it('wear: a hat goes on with its name line; the outfit has it', () => {
    const r = createDressUpRound({ outfit: {}, roundChanges: 5 });
    expect(r.tap('party-hat')).toEqual({ kind: 'wear', slot: 'hat', id: 'party-hat', replaced: undefined, line: nameLine('party-hat'), completes: false });
    expect(r.outfit).toEqual({ hat: 'party-hat' });
    expect(r.changes).toBe(1);
  });

  it('replace: another hat replaces the worn one (one change); other slots stay', () => {
    const r = createDressUpRound({ outfit: { hat: 'crown', glasses: 'star-glasses' }, roundChanges: 5 });
    expect(r.tap('beanie')).toMatchObject({ kind: 'wear', id: 'beanie', replaced: 'crown' });
    expect(r.outfit).toEqual({ hat: 'beanie', glasses: 'star-glasses' });
    expect(r.changes).toBe(1);
  });

  it('take off: a tap on the worn item takes it off', () => {
    const r = createDressUpRound({ outfit: { shirt: 'raincoat' }, roundChanges: 5 });
    expect(r.tap('raincoat')).toEqual({ kind: 'takeOff', slot: 'shirt', id: 'raincoat', completes: false });
    expect(r.outfit).toEqual({});
  });

  it('rapid taps: each tap changes the outfit at once (no queue)', () => {
    const r = createDressUpRound({ outfit: {}, roundChanges: 9 });
    r.tap('crown');
    r.tap('cowboy-hat');
    r.tap('cowboy-hat');
    r.tap('round-glasses');
    expect(r.outfit).toEqual({ glasses: 'round-glasses' });
    expect(r.changes).toBe(4);
  });

  it('the 5th change completes the round once; after it the names are silent', () => {
    const r = createDressUpRound({ outfit: {}, roundChanges: 5 });
    const results = ['crown', 'crown', 'beanie', 'heart-jumper', 'star-glasses', 'party-hat'].map((id) => r.tap(id)!);
    expect(results.map((c) => c.completes)).toEqual([false, false, false, false, true, false]);
    expect(results[4]).toMatchObject({ kind: 'wear', line: nameLine('star-glasses') });
    expect(results[5]).toMatchObject({ kind: 'wear', line: undefined });
    expect(r.complete).toBe(true);
  });

  it('an unknown id changes nothing', () => {
    const r = createDressUpRound({ outfit: { hat: 'crown' }, roundChanges: 5 });
    expect(r.tap('monocle')).toBeUndefined();
    expect(r.changes).toBe(0);
    expect(r.outfit).toEqual({ hat: 'crown' });
  });

  it('a resumed round goes on counting from its changes', () => {
    const r = createDressUpRound({ outfit: {}, roundChanges: 5, changes: 4 });
    expect(r.tap('crown')?.completes).toBe(true);
  });
});

describe('resumeDressUp', () => {
  it('restores { changes } at question 0 (1 ≤ changes < round)', () => {
    expect(resumeDressUp(resumeAt({ changes: 3 }), 5)).toEqual({ changes: 3 });
  });

  it.each([[null], [{ changes: 0 }], [{ changes: 5 }], [{ changes: 1.5 }], [{ changes: '2' }], [{}], [[]], ['x']])('bad partial %j → a fresh start', (partial) => {
    expect(resumeDressUp(resumeAt(partial), 5)).toBeNull();
  });

  it('no resume or another question → a fresh start', () => {
    expect(resumeDressUp(null, 5)).toBeNull();
    expect(resumeDressUp(resumeAt({ changes: 2 }, 1), 5)).toBeNull();
  });
});
