// Stories 3.5, 3.6: the Hang tìm bóng round model against fake geometry (every non-Phaser matrix row).
import { describe, expect, it } from 'vitest';
import type { ItemId } from '../../content/games/shadow-match';
import type { Point } from '../../content/layout-types';
import { HintMachine } from '../../core/hint-machine';
import { RoundTally } from '../../core/round-tally';
import { Tokens } from '../../core/tokens';
import { roundQuestions } from './questions';
import { createDropTarget } from '../../core/input/drop';
import { makeSnapshot, readResume } from '../../core/snapshot';
import { ShadowRound, hintStepFor, resumeQuestion, startCommands, type ShadowCommand, type ShadowGeometry } from './round';

const SNAP = 100;
const SLOTS: Point[] = [
  { x: 150, y: 385 },
  { x: 813, y: 385 },
];
const HAND: Point = { x: 508, y: 554 };
/** Shown radius per item (design px): the longest side / 2. */
const SHOWN: Partial<Record<ItemId, number>> = { car: 75, truck: 75, dog: 75, cow: 75, horse: 70, tractor: 72 };
const shownR = (i: ItemId): number => SHOWN[i] ?? 75;

function geometry(): ShadowGeometry {
  // Story 5.1: the play area; y < 80 lies outside it.
  return { slots: SLOTS, hand: HAND, shownR, playRect: () => ({ x: 24, y: 80, w: 976, h: 648 }), snapRadius: SNAP, offDelayMs: 1500, callMs: 500, finishDelayMs: 1500 };
}

/** The slot indices whose target (pad = shownR of its shadow, r = snapRadius × scale) holds `p`. */
function inside(r: ShadowRound, p: Point, scale: readonly number[] = [1, 1]): number[] {
  return r.current.shadows.flatMap((item, k) => (Math.hypot(p.x - SLOTS[k]!.x, p.y - SLOTS[k]!.y) <= shownR(item) + SNAP * (scale[k] ?? 1) ? [k] : []));
}

const kinds = (cs: readonly ShadowCommand[]): string[] => cs.map((c) => c.kind);
const find = <K extends ShadowCommand['kind']>(cs: readonly ShadowCommand[], kind: K): Extract<ShadowCommand, { kind: K }> | undefined =>
  cs.find((c): c is Extract<ShadowCommand, { kind: K }> => c.kind === kind);
/** Drops the held item at `p` with the targets of the current question. */
const dropAt = (r: ShadowRound, p: Point, scale?: readonly number[]): ShadowCommand[] => r.drop(p, inside(r, p, scale));
/** A point `d` px right of slot `k`'s shown edge. */
const nearSlot = (r: ShadowRound, k: number, d = 0): Point => ({ x: SLOTS[k]!.x + shownR(r.current.shadows[k]!) + d, y: SLOTS[k]!.y });
const correct = (r: ShadowRound): number => r.current.correctSlot;
const decoy = (r: ShadowRound): number => 1 - r.current.correctSlot;

/** Answers the open question and lets its reveal and name end. */
function answer(r: ShadowRound): ShadowCommand[] {
  dropAt(r, SLOTS[correct(r)]!);
  r.revealed();
  return r.speechEnded('name');
}

describe('ShadowRound — enter and drops (Story 3.5)', () => {
  it('Enter {level 0, seed 7}: the item of roundQuestions(7,0)[0] at the hand, 2 shadows, beginQuestion(ask, ask)', () => {
    const r = new ShadowRound(geometry(), 7, 0);
    const q = roundQuestions(7, 0)[0]!;
    const cs = r.start();
    expect(cs).toEqual([
      { kind: 'showQuestion', index: 0, item: q.item, shadows: q.shadows, correctSlot: q.correctSlot, fade: true },
      { kind: 'beginQuestion', promptLineId: `vo.shadow-match.ask.${q.item}`, retryLineId: `vo.shadow-match.ask.${q.item}` },
    ]);
    expect(r.questionCount).toBe(4);
  });

  it('Decoy: dropped on the decoy shadow → floats back to the hand, then wrong(); nothing revealed', () => {
    const r = new ShadowRound(geometry(), 7, 0);
    r.start();
    expect(dropAt(r, SLOTS[decoy(r)]!)).toEqual([{ kind: 'floatBack', to: HAND }, { kind: 'hintWrong' }]);
    expect(r.stage).toBe('ask');
    expect(r.questionIndex).toBe(0);
    expect(r.revealed()).toEqual([]);
  });

  it('Correct: dropped 90 px from the right shadow’s edge → pụp, questionDone, lock, hold, suck in, reveal; revealed → nod, chirp, the name 500 ms later', () => {
    const r = new ShadowRound(geometry(), 7, 0);
    r.start();
    const q = r.current;
    const k = correct(r);
    const cs = dropAt(r, nearSlot(r, k, 90));
    expect(cs).toEqual([
      { kind: 'snapSfx' },
      { kind: 'questionDone' },
      { kind: 'lockItem' },
      { kind: 'holdReveal', on: true },
      { kind: 'suckIn', slot: k, to: SLOTS[k] },
      { kind: 'reveal', slot: k, item: q.item },
    ]);
    expect(r.questionIndex).toBe(1);
    expect(r.stage).toBe('reveal');
    expect(r.revealed()).toEqual([
      { kind: 'trikeNod' },
      { kind: 'sfx', id: 'sfx.shadow-match.trike.happy' },
      { kind: 'say', tag: 'name', id: `vo.shadow-match.name.${q.item}`, afterMs: 500 },
    ]);
    expect(r.revealed()).toEqual([]);
  });

  it('a drop beyond the snap radius of every shadow is off, not wrong', () => {
    const r = new ShadowRound(geometry(), 7, 0);
    r.start();
    expect(r.resolve(nearSlot(r, correct(r), 110), inside(r, nearSlot(r, correct(r), 110)))).toBe('off');
  });

  it('Overlap: a point in both zones nearer the decoy’s edge is the decoy; a tie goes to the right shadow', () => {
    const r = new ShadowRound(geometry(), 7, 0);
    r.start();
    const c = correct(r);
    const d = decoy(r);
    // Level 4: the right shadow accepts from twice as far, so the zones overlap.
    const p = { x: SLOTS[d]!.x + (SLOTS[c]!.x - SLOTS[d]!.x) * 0.2, y: SLOTS[d]!.y };
    const scale = c === 0 ? [20, 1] : [1, 20];
    expect(inside(r, p, scale)).toHaveLength(2);
    expect(r.resolve(p, inside(r, p, scale))).toBe('decoy');
    expect(r.pick(p, [c, d])).toBe(d);
    // Equal distance to both edges → the right one.
    const tieGeo: ShadowGeometry = { ...geometry(), shownR: () => 75 };
    const t = new ShadowRound(tieGeo, 7, 0);
    t.start();
    const mid = { x: (SLOTS[0]!.x + SLOTS[1]!.x) / 2, y: SLOTS[0]!.y };
    expect(t.pick(mid, [0, 1])).toBe(t.current.correctSlot);
  });

  it('Level 4: a drop on the dimmed decoy still floats back with wrong(); the right one accepts from twice as far', () => {
    const r = new ShadowRound(geometry(), 7, 0);
    r.start();
    const c = correct(r);
    const scale = c === 0 ? [2, 1] : [1, 2];
    expect(kinds(dropAt(r, SLOTS[decoy(r)]!, scale))).toEqual(['floatBack', 'hintWrong']);
    expect(find(dropAt(r, nearSlot(r, c, 180), scale), 'reveal')?.slot).toBe(c);
  });

  it('Home: lifted and dropped within 50 px of the hand → settles, no hint', () => {
    const r = new ShadowRound(geometry(), 7, 0);
    r.start();
    expect(dropAt(r, { x: HAND.x + 30, y: HAND.y + 30 })).toEqual([{ kind: 'floatBack', to: HAND }]);
  });

  it('Story 5.1 mid-drag lift: dropped on the cave wall (inside the play rect) → rests there; not wrong; its new pre-lift spot', () => {
    const r = new ShadowRound(geometry(), 7, 0);
    r.start();
    const wall = { x: 500, y: 300 };
    expect(inside(r, wall)).toEqual([]);
    expect(dropAt(r, wall)).toEqual([{ kind: 'rest', at: wall }]);
    expect(r.lift()).toEqual([]);
    // Tapped again where it rests → home (settles, no hint); a decoy or a cancel float back there.
    expect(dropAt(r, { x: 510, y: 300 })).toEqual([{ kind: 'floatBack', to: wall }]);
    expect(dropAt(r, SLOTS[decoy(r)]!)).toEqual([{ kind: 'floatBack', to: wall }, { kind: 'hintWrong' }]);
    expect(r.cancel()).toEqual([{ kind: 'floatBack', to: wall }]);
    // The next question starts at the hand again.
    answer(r);
    expect(r.cancel()).toEqual([{ kind: 'floatBack', to: HAND }]);
  });

  it('Story 5.1: resting next to the right shadow, a drop on that shadow within snapRadius/2 of the rest spot is correct, not home', () => {
    const r = new ShadowRound(geometry(), 7, 0);
    r.start();
    const k = correct(r);
    // Below the right shadow: just beyond its target, then just inside it (30 px apart).
    const below = (d: number) => ({ x: SLOTS[k]!.x, y: SLOTS[k]!.y + shownR(r.current.shadows[k]!) + d });
    const by = below(SNAP + 20);
    expect(inside(r, by)).toEqual([]);
    expect(dropAt(r, by)).toEqual([{ kind: 'rest', at: by }]);
    const onShadow = below(SNAP - 10);
    expect(Math.hypot(onShadow.x - by.x, onShadow.y - by.y)).toBeLessThanOrEqual(SNAP / 2);
    expect(r.resolve(onShadow, inside(r, onShadow))).toBe('correct');
    expect(find(dropAt(r, onShadow), 'reveal')?.slot).toBe(k);
  });

  it('Off the play rect → slides back after 1500 ms; not wrong; a re-lift cancels', () => {
    const r = new ShadowRound(geometry(), 7, 0);
    r.start();
    const wall = { x: 500, y: 40 };
    expect(inside(r, wall)).toEqual([]);
    expect(dropAt(r, wall)).toEqual([{ kind: 'returnLater', to: HAND, ms: 1500 }]);
    expect(r.lift()).toEqual([{ kind: 'cancelReturn' }]);
    expect(r.lift()).toEqual([]);
    dropAt(r, wall);
    r.returned();
    expect(r.lift()).toEqual([]);
  });

  it('Cancel (pause mid-drag): back to the hand; once the answer is accepted a late drop or cancel does nothing (the reveal owns the item)', () => {
    const r = new ShadowRound(geometry(), 7, 0);
    r.start();
    expect(r.cancel()).toEqual([{ kind: 'floatBack', to: HAND }]);
    dropAt(r, SLOTS[correct(r)]!);
    expect(dropAt(r, SLOTS[0]!)).toEqual([]);
    expect(r.cancel()).toEqual([]);
  });
});

describe('ShadowRound — the round (Story 3.5)', () => {
  it('Next question: the name ends → fade out, release the hold, the next item and shadows fade in; its right slot differs', () => {
    const r = new ShadowRound(geometry(), 7, 0);
    r.start();
    const first = r.current.correctSlot;
    dropAt(r, SLOTS[first]!);
    // The name is said only after the reveal; an early end is ignored.
    expect(r.speechEnded('name')).toEqual([]);
    r.revealed();
    const next = r.speechEnded('name');
    expect(kinds(next)).toEqual(['clearQuestion', 'holdReveal', 'showQuestion', 'beginQuestion']);
    expect(find(next, 'holdReveal')).toEqual({ kind: 'holdReveal', on: false });
    const show = find(next, 'showQuestion')!;
    expect(show).toMatchObject({ index: 1, item: roundQuestions(7, 0)[1]!.item, fade: true });
    expect(show.correctSlot).not.toBe(first);
    expect(r.stage).toBe('ask');
    expect(r.speechEnded('name')).toEqual([]);
  });

  it('Round end: the 4th name ends → celebrate, finishRound after 1500 ms; the last correct drop marks finishing; inert after', () => {
    const r = new ShadowRound(geometry(), 7, 0);
    r.start();
    for (let i = 0; i < 3; i++) answer(r);
    const last = dropAt(r, SLOTS[correct(r)]!);
    expect(kinds(last)).toEqual(['snapSfx', 'questionDone', 'lockItem', 'holdReveal', 'markFinishing', 'suckIn', 'reveal']);
    expect(r.isFinishing).toBe(true);
    r.revealed();
    expect(r.speechEnded('name')).toEqual([{ kind: 'celebrate' }, { kind: 'finishRound', afterMs: 1500 }]);
    expect(r.stage).toBe('done');
    expect(r.speechEnded('name')).toEqual([]);
    expect(r.progress()).toEqual({ questionIndex: 4, partial: {} });
  });

  /** Drives a round through a HintMachine and RoundTally the way MiniGameBase does. */
  function harness() {
    const tally = new RoundTally();
    let token = 0;
    const m = new HintMachine({
      audio: { say: () => ++token, setPrompt: () => undefined },
      guard: { setPickable: () => undefined, setSnapScale: () => undefined, isDragging: () => false },
      visuals: { ring: () => undefined, hand: () => undefined, clearHand: () => undefined, dim: () => undefined },
      emitLevel: (l) => tally.level(l),
    });
    const step = { correct: [], distractors: [], target: null, action: 'drag' as const };
    const apply = (cs: readonly ShadowCommand[]): void => {
      for (const c of cs) {
        if (c.kind === 'beginQuestion') {
          tally.beginQuestion();
          m.beginQuestion({ promptLineId: c.promptLineId, retryLineId: c.retryLineId, step });
        } else if (c.kind === 'hintWrong') m.wrong();
        else if (c.kind === 'questionDone') {
          tally.questionDone();
          m.questionDone();
        }
      }
    };
    const idleTo = (level: number): void => {
      if (m.awaitedToken !== undefined) m.speechEnded(m.awaitedToken);
      for (let i = 0; i < 1000 && m.level < level; i++) {
        m.tick(Tokens.Timing.hintTickMs);
        if (m.awaitedToken !== undefined) m.speechEnded(m.awaitedToken);
      }
    };
    return { tally, m, apply, idleTo };
  }

  // The spec matrix reads "firstTryCorrect 3", but core RoundTally (spec-1-10, unchanged since) counts a
  // question first-try only while its hint level stayed 0, so q3's idle ring also costs its first try.
  it('Tally: q1 clean, q2 one decoy, q3 reaches level 2, q4 clean → firstTryCorrect 2 (core RoundTally), maxHintLevel 2', () => {
    const { tally, m, apply, idleTo } = harness();
    const r = new ShadowRound(geometry(), 7, 0);
    const next = (): void => {
      apply(dropAt(r, SLOTS[correct(r)]!));
      apply(r.revealed());
      apply(r.speechEnded('name'));
    };
    apply(r.start());
    next();
    apply(dropAt(r, SLOTS[decoy(r)]!));
    next();
    idleTo(2);
    expect(m.level).toBe(2);
    next();
    next();
    expect(tally.outcome('shadow-match')).toEqual({ gameId: 'shadow-match', questions: 4, firstTryCorrect: 2, maxHintLevel: 2 });
  });

  it('Home mid-question (question 3) → progress {questionIndex 2, partial {}}; JSON round-trips', () => {
    const r = new ShadowRound(geometry(), 7, 0);
    r.start();
    answer(r);
    answer(r);
    expect(r.progress()).toEqual({ questionIndex: 2, partial: {} });
    expect(JSON.parse(JSON.stringify(r.progress()))).toEqual(r.progress());
  });

  it('Home during the last reveal: the round is finishing (Home completes, never abandons)', () => {
    const r = new ShadowRound(geometry(), 7, 0);
    r.start();
    for (let i = 0; i < 3; i++) answer(r);
    dropAt(r, SLOTS[correct(r)]!);
    expect(r.isFinishing).toBe(true);
  });
});

describe('startCommands (Story 3.5)', () => {
  it('no resume → question 0, not accepted', () => {
    const r = new ShadowRound(geometry(), 7, 0);
    const plan = startCommands(r, null);
    expect(plan).toMatchObject({ accepted: false, warnings: [] });
    expect(find(plan.commands, 'showQuestion')).toMatchObject({ index: 0, item: roundQuestions(7, 0)[0]!.item });
  });

  it('Resume questionIndex 2 → question 2’s item and shadows, clean; accepted', () => {
    const r = new ShadowRound(geometry(), 7, 0);
    const plan = startCommands(r, { questionIndex: 2, partial: {} });
    const q = roundQuestions(7, 0)[2]!;
    expect(plan).toMatchObject({ accepted: true, warnings: [] });
    expect(find(plan.commands, 'showQuestion')).toEqual({ kind: 'showQuestion', index: 2, item: q.item, shadows: q.shadows, correctSlot: q.correctSlot, fade: true });
    expect(find(plan.commands, 'beginQuestion')?.promptLineId).toBe(`vo.shadow-match.ask.${q.item}`);
    expect(r.questionIndex).toBe(2);
  });

  it.each([9, 4, -1, 1.5])('Resume out of range (questionIndex %s) → question 0, not accepted, one warning', (qi) => {
    const r = new ShadowRound(geometry(), 7, 0);
    const plan = startCommands(r, { questionIndex: qi });
    expect(plan.accepted).toBe(false);
    expect(plan.warnings).toHaveLength(1);
    expect(r.questionIndex).toBe(0);
  });
});

describe('hintStepFor (Story 3.5)', () => {
  const targets = [0, 1, 2].map((k) => createDropTarget({ id: `shadow-${k}`, circle: { x: 100 + 300 * k, y: 385, r: SNAP }, pad: 75 }));
  const views = targets.map((target, k) => ({ hint: { object: { shadow: k } }, target }));
  const held = { object: { held: true } };

  it.each([0, 1, 2])('correct slot %i: correct = [held item], target = that slot, focus = its shadow, distractors = exactly the other shadows, drag', (c) => {
    const step = hintStepFor(c, held, views);
    expect(step.correct).toEqual([held]);
    expect(step.correct[0]).toBe(held);
    expect(step.target).toBe(targets[c]);
    expect(step.focus).toBe(views[c]!.hint);
    expect(step.distractors).toEqual(views.filter((_, k) => k !== c).map((v) => v.hint));
    expect(step.distractors).not.toContain(views[c]!.hint);
    expect(step.action).toBe('drag');
  });

  it('two shadows (level 0): one distractor; no held draggable → no correct item', () => {
    const two = views.slice(0, 2);
    const step = hintStepFor(1, undefined, two);
    expect(step.correct).toEqual([]);
    expect(step.distractors).toEqual([two[0]!.hint]);
    expect(step.focus).toBe(two[1]!.hint);
  });

  it('a correct slot without a shadow: no target and no focus', () => {
    const step = hintStepFor(5, held, views.slice(0, 2));
    expect(step.target).toBeNull();
    expect(step.focus).toBeUndefined();
  });
});

describe('Story 3.6 — rows 3 and 4, resume, level-2 outcome', () => {
  /** Rows 3 and 4 (the generated layout's shape: two tiers per ledge). */
  const ROWS: Record<number, Point[]> = {
    3: [
      { x: 150, y: 330 },
      { x: 150, y: 520 },
      { x: 862, y: 430 },
    ],
    4: [
      { x: 150, y: 330 },
      { x: 150, y: 520 },
      { x: 862, y: 340 },
      { x: 862, y: 530 },
    ],
  };
  const geoFor = (n: number): ShadowGeometry => ({ ...geometry(), slots: n === 2 ? SLOTS : ROWS[n]! });
  const insideRow = (r: ShadowRound, slots: readonly Point[], p: Point, scale: readonly number[] = []): number[] =>
    r.current.shadows.flatMap((item, k) => (Math.hypot(p.x - slots[k]!.x, p.y - slots[k]!.y) <= shownR(item) + SNAP * (scale[k] ?? 1) ? [k] : []));
  const dropRow = (r: ShadowRound, slots: readonly Point[], p: Point, scale?: readonly number[]): ShadowCommand[] => r.drop(p, insideRow(r, slots, p, scale));
  const answerRow = (r: ShadowRound, slots: readonly Point[]): void => {
    dropRow(r, slots, slots[r.current.correctSlot]!);
    r.revealed();
    r.speechEnded('name');
  };

  /** A HintMachine and RoundTally driven the way MiniGameBase drives them. */
  function hintHarness() {
    const tally = new RoundTally();
    let token = 0;
    const m = new HintMachine({
      audio: { say: () => ++token, setPrompt: () => undefined },
      guard: { setPickable: () => undefined, setSnapScale: () => undefined, isDragging: () => false },
      visuals: { ring: () => undefined, hand: () => undefined, clearHand: () => undefined, dim: () => undefined },
      emitLevel: (l) => tally.level(l),
    });
    const step = { correct: [], distractors: [], target: null, action: 'drag' as const };
    const apply = (cs: readonly ShadowCommand[]): void => {
      for (const c of cs) {
        if (c.kind === 'beginQuestion') {
          tally.beginQuestion();
          m.beginQuestion({ promptLineId: c.promptLineId, retryLineId: c.retryLineId, step });
        } else if (c.kind === 'hintWrong') m.wrong();
        else if (c.kind === 'questionDone') {
          tally.questionDone();
          m.questionDone();
        }
      }
    };
    return { tally, m, apply };
  }

  it.each([
    [0, 2],
    [1, 3],
    [2, 4],
  ])('level %i: showQuestion lays out %i shadows', (level, n) => {
    const r = new ShadowRound(geoFor(n), 7, level);
    const show = find(r.start(), 'showQuestion')!;
    const q = roundQuestions(7, level)[0]!;
    expect(show.shadows).toHaveLength(n);
    expect(show).toMatchObject({ item: q.item, shadows: q.shadows, correctSlot: q.correctSlot });
  });

  it('Level 4 hint at L2: all 3 decoys are distractors; a drop nearer a decoy’s edge (correct zone ×2) still floats back with wrong()', () => {
    const slots = ROWS[4]!;
    const r = new ShadowRound(geoFor(4), 11, 2);
    r.start();
    const c = r.current.correctSlot;
    const views = slots.map((s, k) => ({ hint: { object: { k } }, target: createDropTarget({ id: `shadow-${k}`, circle: { x: s.x, y: s.y, r: SNAP }, pad: 75 }) }));
    const step = hintStepFor(c, { object: 'held' }, views);
    expect(step.distractors).toHaveLength(3);
    expect(step.distractors).not.toContain(views[c]!.hint);
    // The decoy on the correct shadow's ledge: a point just outside that decoy's edge, toward the correct one.
    const d = slots.findIndex((s, k) => k !== c && s.x === slots[c]!.x);
    const dir = Math.sign(slots[c]!.y - slots[d]!.y);
    const p = { x: slots[d]!.x, y: slots[d]!.y + dir * (shownR(r.current.shadows[d]!) + 10) };
    const scale = slots.map((_, k) => (k === c ? 2 : 1));
    expect(insideRow(r, slots, p, scale)).toEqual(expect.arrayContaining([c, d]));
    expect(kinds(dropRow(r, slots, p, scale))).toEqual(['floatBack', 'hintWrong']);
  });

  it('Home at q3 (L1, two decoy drops): progress {questionIndex 2, partial {}}; the snapshot round-trips and resumes the same question clean', () => {
    const slots = ROWS[3]!;
    const r = new ShadowRound(geoFor(3), 21, 1);
    r.start();
    answerRow(r, slots);
    answerRow(r, slots);
    const decoys = r.current.shadows.map((_, k) => k).filter((k) => k !== r.current.correctSlot);
    for (const k of decoys) expect(kinds(dropRow(r, slots, slots[k]!))).toEqual(['floatBack', 'hintWrong']);
    expect(r.progress()).toEqual({ questionIndex: 2, partial: {} });
    const snap = makeSnapshot<'shadow-match'>({ level: 1, seed: 21, tally: { questions: 2, firstTryCorrect: 2, maxHintLevel: 0 }, progress: r.progress() });
    expect(snap).toMatchObject({ v: 1, level: 1, seed: 21, questionIndex: 2, partial: {} });
    const json = JSON.parse(JSON.stringify(snap)) as unknown;
    expect(json).toEqual(snap);

    const resumeAt = readResume(json, { level: 1, seed: 21 });
    expect(resumeAt).not.toBeNull();
    const again = new ShadowRound(geoFor(3), 21, 1);
    const plan = startCommands(again, resumeAt);
    const q = roundQuestions(21, 1)[2]!;
    expect(plan).toMatchObject({ accepted: true, warnings: [] });
    expect(find(plan.commands, 'showQuestion')).toEqual({ kind: 'showQuestion', index: 2, item: q.item, shadows: q.shadows, correctSlot: q.correctSlot, fade: true });
    expect(find(plan.commands, 'beginQuestion')).toEqual({ kind: 'beginQuestion', promptLineId: `vo.shadow-match.ask.${q.item}`, retryLineId: `vo.shadow-match.ask.${q.item}` });
  });

  it.each([[null], [[]], ['x'], [{ placed: [1] }], [undefined], [42]])('Bad partial %j → the same question begins clean, accepted, one warning', (partial) => {
    const r = new ShadowRound(geoFor(3), 21, 1);
    const plan = startCommands(r, { questionIndex: 2, partial });
    expect(plan.accepted).toBe(true);
    expect(plan.warnings).toEqual(['shadow-match: bad resume partial']);
    const q = roundQuestions(21, 1)[2]!;
    expect(find(plan.commands, 'showQuestion')).toMatchObject({ index: 2, item: q.item, shadows: q.shadows, correctSlot: q.correctSlot });
  });

  it('resumeQuestion: {} (plain or null-prototype) → {}; anything else → null', () => {
    expect(resumeQuestion({})).toEqual({});
    expect(resumeQuestion(Object.create(null))).toEqual({});
    for (const bad of [null, [], 'x', 0, { placed: [1] }, { a: undefined }, new Date(0), undefined]) expect(resumeQuestion(bad), String(bad)).toBeNull();
    expect(new ShadowRound(geoFor(3), 1, 1).resumeQuestion(0, {})).toEqual({});
  });

  it('Resume out of range (questionIndex 4) → question 0, one warning', () => {
    const r = new ShadowRound(geoFor(4), 3, 2);
    const plan = startCommands(r, { questionIndex: 4, partial: {} });
    expect(plan.accepted).toBe(false);
    expect(plan.warnings).toHaveLength(1);
    expect(find(plan.commands, 'showQuestion')?.index).toBe(0);
  });

  // Idle escalation stops at level 3 (spec-1-9); level 4 comes from wrong drops (as in the dino-puzzle test).
  it('Outcome: a level-2 round whose question 2 reaches hint 4 (idle to 3, then decoy drops) → one outcome { questions 4, maxHintLevel 4 }', () => {
    const slots = ROWS[4]!;
    const { tally, m, apply } = hintHarness();
    const r = new ShadowRound(geoFor(4), 5, 2);
    const next = (): void => {
      apply(dropRow(r, slots, slots[r.current.correctSlot]!));
      apply(r.revealed());
      apply(r.speechEnded('name'));
    };
    apply(r.start());
    next();
    if (m.awaitedToken !== undefined) m.speechEnded(m.awaitedToken);
    for (let i = 0; i < 2000 && m.level < 3; i++) {
      m.tick(Tokens.Timing.hintTickMs);
      if (m.awaitedToken !== undefined) m.speechEnded(m.awaitedToken);
    }
    expect(m.level).toBe(3);
    const decoy4 = r.current.shadows.findIndex((_, k) => k !== r.current.correctSlot);
    for (let i = 0; i < 4 && m.level < 4; i++) apply(dropRow(r, slots, slots[decoy4]!));
    expect(m.level).toBe(4);
    next();
    next();
    next();
    expect(r.stage).toBe('done');
    expect(tally.outcome('shadow-match')).toMatchObject({ gameId: 'shadow-match', questions: 4, maxHintLevel: 4 });
  });
});
