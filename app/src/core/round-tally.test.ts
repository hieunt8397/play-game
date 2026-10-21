import { describe, expect, it } from 'vitest';
import { nextLevel } from './difficulty';
import { RoundTally } from './round-tally';

describe('RoundTally', () => {
  it('starts empty', () => {
    expect(new RoundTally().outcome('ice-cream')).toEqual({ gameId: 'ice-cream', questions: 0, firstTryCorrect: 0, maxHintLevel: 0 });
  });

  it('q1 clean; q2 one wrong; q3 idle to level 3 → 3 questions, 1 first try, max 3', () => {
    const t = new RoundTally();
    t.beginQuestion();
    t.questionDone();
    t.level(0); // the machine's reset after questionDone is ignored
    t.beginQuestion();
    t.level(1);
    t.questionDone();
    t.level(0);
    t.beginQuestion();
    t.level(2);
    t.level(3);
    t.questionDone();
    t.level(0);
    expect(t.outcome('ice-cream')).toEqual({ gameId: 'ice-cream', questions: 3, firstTryCorrect: 1, maxHintLevel: 3 });
  });

  it('levels with no open question are ignored', () => {
    const t = new RoundTally();
    t.level(4);
    t.beginQuestion();
    t.questionDone();
    t.level(4);
    expect(t.outcome('ice-cream')).toMatchObject({ questions: 1, firstTryCorrect: 1, maxHintLevel: 0 });
  });

  it('a second questionDone counts nothing; an open question is not counted', () => {
    const t = new RoundTally();
    t.beginQuestion();
    t.questionDone();
    t.questionDone();
    t.beginQuestion();
    t.level(2);
    expect(t.outcome('ice-cream')).toMatchObject({ questions: 1, firstTryCorrect: 1, maxHintLevel: 2 });
  });

  it('re-beginning an open question discards it (never counted as closed or first try)', () => {
    const t = new RoundTally();
    t.beginQuestion();
    t.beginQuestion();
    t.questionDone();
    expect(t.outcome('ice-cream')).toMatchObject({ questions: 1, firstTryCorrect: 1 });
  });

  it('a level drop inside a question keeps its max', () => {
    const t = new RoundTally();
    t.beginQuestion();
    t.level(4);
    t.level(0);
    t.questionDone();
    expect(t.outcome('ice-cream')).toMatchObject({ questions: 1, firstTryCorrect: 0, maxHintLevel: 4 });
  });
});

describe('RoundTally state / restore (Story 2.5)', () => {
  it('state covers closed questions only (the open question is left out)', () => {
    const t = new RoundTally();
    t.beginQuestion();
    t.level(2);
    t.questionDone();
    t.beginQuestion();
    t.level(4);
    expect(t.state()).toEqual({ questions: 1, firstTryCorrect: 0, maxHintLevel: 2 });
    expect(t.outcome('ice-cream').maxHintLevel).toBe(4);
  });

  it('restore sums the counts and takes the max', () => {
    const t = new RoundTally();
    t.restore({ questions: 2, firstTryCorrect: 1, maxHintLevel: 3 });
    t.beginQuestion();
    t.level(1);
    t.questionDone();
    expect(t.state()).toEqual({ questions: 3, firstTryCorrect: 1, maxHintLevel: 3 });
    expect(t.outcome('ice-cream')).toEqual({ gameId: 'ice-cream', questions: 3, firstTryCorrect: 1, maxHintLevel: 3 });
  });

  it('tally carry: q1 hint 4, Home, resume, q2–q3 clean → 3 questions, 2 first try, max 4 → nextLevel −1', () => {
    const before = new RoundTally();
    before.beginQuestion();
    before.level(4);
    before.questionDone();
    before.level(0);
    before.beginQuestion(); // q2 open when Home is tapped: not kept
    const carried = before.state();
    expect(carried).toEqual({ questions: 1, firstTryCorrect: 0, maxHintLevel: 4 });

    const after = new RoundTally();
    after.restore(carried);
    for (let q = 0; q < 2; q++) {
      after.beginQuestion();
      after.questionDone();
      after.level(0);
    }
    const outcome = after.outcome('ice-cream');
    expect(outcome).toEqual({ gameId: 'ice-cream', questions: 3, firstTryCorrect: 2, maxHintLevel: 4 });
    expect(nextLevel(1, outcome, 4)).toBe(0);
  });
});
