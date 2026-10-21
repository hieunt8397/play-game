// Story 3.1: the Tiệm pizza round model against fake geometry (every non-Phaser matrix row).
import { describe, expect, it } from 'vitest';
import type { ToppingId } from '../../content/games/pizza';
import type { Point } from '../../content/layout-types';
import { HintMachine } from '../../core/hint-machine';
import { RoundTally } from '../../core/round-tally';
import { Tokens } from '../../core/tokens';
import { roundQuestions } from './questions';
import { PizzaRound, startCommands, type PizzaCommand, type PizzaGeometry } from './round';

// The real pizza.layout.json distances: anchor.base, baseRadius ≈ 140, the sausage and mushroom homes ≈ 210 px away
// (inside the base target's 240 px hit radius); the pepper home is ≈ 325 px away (outside it).
const BASE = { x: 448.8, y: 532.3 };
const BASE_R = 140;
const SNAP = 100;
const HOMES: Record<ToppingId, Point> = { sausage: { x: 241, y: 564 }, mushroom: { x: 661, y: 569 }, pepper: { x: 125, y: 564 } };
const SPOT = (n: number): Point => {
  const a = ((90 - (n - 1) * 45) * Math.PI) / 180;
  return { x: BASE.x + 100 * Math.cos(a), y: BASE.y - 90 * Math.sin(a) };
};

function geometry(): PizzaGeometry {
  return {
    bowlHome: (t) => HOMES[t],
    baseSpot: SPOT,
    spots: 8,
    base: { contains: (p) => Math.hypot(p.x - BASE.x, p.y - BASE.y) <= BASE_R + SNAP },
    baseCentre: BASE,
    counter: { contains: (p) => p.x >= 30 && p.x <= 990 && p.y >= 470 && p.y <= 700 },
    restRect: () => ({ x: 30, y: 470, w: 960, h: 230 }),
    // Story 5.1: the play area; y < 80 lies outside it.
    playRect: () => ({ x: 24, y: 80, w: 976, h: 648 }),
    snapRadius: SNAP,
    minSize: 90,
    offCounterDelayMs: 1500,
    finishDelayMs: 1500,
  };
}

/** A seed whose question `index` asks `count` slices of `topping` at `level` (default: question 0 of level 0). */
function seedFor(topping: ToppingId, count: number, level = 0, index = 0): number {
  for (let s = 0; s < 5000; s++) {
    const q = roundQuestions(s, level)[index]!;
    if (q.topping === topping && q.count === count) return s;
  }
  throw new Error('no seed');
}

const kinds = (cs: readonly PizzaCommand[]): string[] => cs.map((c) => c.kind);
const find = <K extends PizzaCommand['kind']>(cs: readonly PizzaCommand[], kind: K): Extract<PizzaCommand, { kind: K }> | undefined =>
  cs.find((c): c is Extract<PizzaCommand, { kind: K }> => c.kind === kind);

/** The slice resting on topping `t`'s bowl. */
function bowlSlice(r: PizzaRound, t: ToppingId): string {
  const s = r.sliceStates().find((x) => x.topping === t && x.at.x === HOMES[t].x && x.at.y === HOMES[t].y);
  if (!s) throw new Error(`no ${t} on its bowl`);
  return s.id;
}

/** Drops the asked topping's bowl slice 80 px outside the base edge (inside the snap zone). */
const NEAR_EDGE: Point = { x: BASE.x, y: BASE.y - BASE_R - 80 };

function readyOven(r: PizzaRound): PizzaCommand[] {
  const q = r.current;
  for (let i = 0; i < q.count; i++) r.drop(bowlSlice(r, q.topping), NEAR_EDGE);
  r.speechEnded('count');
  return r.speechEnded('recount');
}

describe('PizzaRound — enter and placing (Story 3.1)', () => {
  it('Enter {level 0, seed 7}: a raw base, a slice on each bowl, beginQuestion(ask, retry, toppingStep)', () => {
    const r = new PizzaRound(geometry(), 7, 0);
    const cs = r.start();
    expect(kinds(cs)).toEqual(['build', 'restoreSlices', 'pickable', 'beginQuestion']);
    const q = roundQuestions(7, 0)[0]!;
    const begin = find(cs, 'beginQuestion')!;
    expect(begin.promptLineId).toBe(`vo.pizza.ask.${q.topping}.${q.count}`);
    expect(begin.retryLineId).toBe(`vo.pizza.retry.${q.topping}`);
    expect(begin.correct).toEqual([bowlSlice(r, q.topping)]);
    const other: ToppingId = q.topping === 'sausage' ? 'mushroom' : 'sausage';
    expect(begin.distractors).toEqual([{ bowl: other }, { slice: bowlSlice(r, other) }]);
    expect(find(cs, 'build')!.slices).toHaveLength(2);
    expect(find(cs, 'build')!.toppings).toEqual(['sausage', 'mushroom']);
    expect(find(cs, 'restoreSlices')).toEqual({ kind: 'restoreSlices', topping: q.topping, slots: [] });
  });

  it('Place 1 of 3: snap to spot 1, respawn on the bowl, say count.1, stepDone(toppingStep)', () => {
    const r = new PizzaRound(geometry(), seedFor('sausage', 3), 0);
    r.start();
    const id = bowlSlice(r, 'sausage');
    const cs = r.drop(id, NEAR_EDGE);
    expect(kinds(cs)).toEqual(['snap', 'respawn', 'say', 'stepDone']);
    expect(find(cs, 'snap')).toEqual({ kind: 'snap', id, spot: 1, to: SPOT(1) });
    expect(find(cs, 'respawn')!.slice.at).toEqual(HOMES.sausage);
    expect(find(cs, 'say')).toEqual({ kind: 'say', tag: 'count', lineId: 'vo.pizza.count.1' });
    expect(find(cs, 'stepDone')!.correct).toEqual([find(cs, 'respawn')!.slice.id]);
    expect(r.placedSpots()).toEqual([1]);
    expect(r.stage).toBe('toppings');
  });

  it('Third slice: say count.3, slices locked; the count line’s end (completed or not) starts the recount chain', () => {
    const r = new PizzaRound(geometry(), seedFor('sausage', 3), 0);
    r.start();
    r.drop(bowlSlice(r, 'sausage'), NEAR_EDGE);
    r.drop(bowlSlice(r, 'sausage'), NEAR_EDGE);
    const cs = r.drop(bowlSlice(r, 'sausage'), NEAR_EDGE);
    expect(kinds(cs)).toEqual(['snap', 'respawn', 'pickable', 'pauseHint', 'say']);
    expect(find(cs, 'pickable')!.on).toBe(false);
    expect(find(cs, 'say')!.lineId).toBe('vo.pizza.count.3');
    expect(r.stage).toBe('counting');
    expect(r.speechEnded('recount')).toEqual([]);
    expect(r.speechEnded('count')).toEqual([{ kind: 'sayChain', tag: 'recount', lineIds: ['vo.pizza.count.1', 'vo.pizza.count.2', 'vo.pizza.count.3'] }]);
  });

  it('Recount bounce: each chain line bounces its spot in turn; a foreign tag is ignored', () => {
    const r = new PizzaRound(geometry(), seedFor('mushroom', 3), 0);
    r.start();
    for (let i = 0; i < 3; i++) r.drop(bowlSlice(r, 'mushroom'), NEAR_EDGE);
    r.speechEnded('count');
    expect([0, 1, 2].flatMap((i) => r.speechLine('recount', i))).toEqual([
      { kind: 'bounce', spot: 1 },
      { kind: 'bounce', spot: 2 },
      { kind: 'bounce', spot: 3 },
    ]);
    expect(r.speechLine('count', 0)).toEqual([]);
  });

  it('Oven ready: the chain’s end opens the oven, unlocks, rings and steps to bake / enough.<n>', () => {
    const r = new PizzaRound(geometry(), seedFor('sausage', 3), 0);
    r.start();
    const cs = readyOven(r);
    expect(cs).toEqual([
      { kind: 'ovenReady' },
      { kind: 'pickable', on: true },
      { kind: 'readyRing' },
      { kind: 'ovenStep', promptLineId: 'vo.pizza.bake', retryLineId: 'vo.pizza.enough.3' },
    ]);
    expect(r.stage).toBe('oven');
  });
});

describe('PizzaRound — wrong, extra, home, rest, off (Story 3.1)', () => {
  it('Wrong topping: floats back to its pre-lift spot, hintWrong; placed unchanged', () => {
    const r = new PizzaRound(geometry(), seedFor('sausage', 2), 0);
    r.start();
    const m = bowlSlice(r, 'mushroom');
    expect(r.drop(m, BASE)).toEqual([{ kind: 'floatBack', id: m, to: HOMES.mushroom }, { kind: 'hintWrong' }]);
    expect(r.placedSpots()).toEqual([]);
  });

  it('Extra slice in the oven stage: floats back, hintWrong; placed stays at the count', () => {
    const r = new PizzaRound(geometry(), seedFor('sausage', 3), 0);
    r.start();
    readyOven(r);
    const extra = bowlSlice(r, 'sausage');
    expect(r.drop(extra, BASE)).toEqual([{ kind: 'floatBack', id: extra, to: HOMES.sausage }, { kind: 'hintWrong' }]);
    expect(r.placedSpots()).toEqual([1, 2, 3]);
    expect(r.progress().partial.placed).toEqual([1, 2, 3]);
  });

  it('Back to bowl: dropped within snapRadius/2 of its pre-lift spot settles with no hint (before the base check)', () => {
    const r = new PizzaRound(geometry(), seedFor('mushroom', 1), 0);
    r.start();
    const m = bowlSlice(r, 'mushroom');
    // The mushroom bowl lies inside the base target; the own-home check wins.
    expect(r.drop(m, { x: HOMES.mushroom.x + 30, y: HOMES.mushroom.y + 30 })).toEqual([{ kind: 'floatBack', id: m, to: HOMES.mushroom }]);
  });

  it('Rest: dropped on the counter clear of the base stays, nudged ≥ minSize from other slices; new pre-lift spot', () => {
    const r = new PizzaRound(geometry(), seedFor('sausage', 1), 0);
    r.start();
    const m = bowlSlice(r, 'mushroom');
    const near = { x: 800, y: 600 };
    const cs = r.drop(m, near);
    expect(kinds(cs)).toEqual(['rest']);
    const s = bowlSlice(r, 'sausage');
    const cs2 = r.drop(s, { x: 820, y: 600 });
    const at = find(cs2, 'rest')!.at;
    expect(Math.hypot(at.x - near.x, at.y - near.y)).toBeGreaterThanOrEqual(90 - 1e-9);
    expect(r.cancel(s)).toEqual([{ kind: 'floatBack', id: s, to: at }]);
  });

  it('Story 5.1 mid-drag lift: off the counter inside the play rect → rests there (nudged), no returnLater', () => {
    const r = new PizzaRound(geometry(), seedFor('sausage', 1), 0);
    r.start();
    const s = bowlSlice(r, 'sausage');
    const wall = { x: 900, y: 200 };
    expect(r.resolve(s, wall)).toBe('off');
    expect(r.drop(s, wall)).toEqual([{ kind: 'rest', id: s, at: wall }]);
    expect(r.lift(s)).toEqual([]);
    const m = bowlSlice(r, 'mushroom');
    const at = find(r.drop(m, { x: 905, y: 200 }), 'rest')!.at;
    expect(Math.hypot(at.x - wall.x, at.y - wall.y)).toBeGreaterThanOrEqual(90 - 1e-9);
    expect(r.cancel(s)).toEqual([{ kind: 'floatBack', id: s, to: wall }]);
  });

  it('Off the play rect: slides back after 1500 ms; a re-lift cancels the slide', () => {
    const r = new PizzaRound(geometry(), seedFor('sausage', 1), 0);
    r.start();
    const s = bowlSlice(r, 'sausage');
    expect(r.drop(s, { x: 900, y: 40 })).toEqual([{ kind: 'returnLater', id: s, to: HOMES.sausage, ms: 1500 }]);
    expect(r.lift(s)).toEqual([{ kind: 'cancelReturn', id: s }]);
    expect(r.lift(s)).toEqual([]);
  });

  it('Counting: a drag already running floats back with no hint', () => {
    const r = new PizzaRound(geometry(), seedFor('sausage', 1), 0);
    r.start();
    r.drop(bowlSlice(r, 'sausage'), BASE);
    expect(r.stage).toBe('counting');
    const m = bowlSlice(r, 'mushroom');
    expect(r.drop(m, BASE)).toEqual([{ kind: 'floatBack', id: m, to: HOMES.mushroom }]);
  });
});

describe('PizzaRound — oven, bake and the round end (Story 3.1)', () => {
  it('Early oven tap (toppings or counting): only a nudge', () => {
    const r = new PizzaRound(geometry(), seedFor('sausage', 1), 0);
    r.start();
    expect(r.ovenTap()).toEqual([{ kind: 'nudgeOven' }]);
    r.drop(bowlSlice(r, 'sausage'), BASE);
    expect(r.ovenTap()).toEqual([{ kind: 'nudgeOven' }]);
    expect(r.questionIndex).toBe(0);
  });

  it('Bake: clear the ready ring, questionDone, lock, bake; the index advances at the tap; baking ignores taps', () => {
    const r = new PizzaRound(geometry(), seedFor('sausage', 2), 0);
    r.start();
    readyOven(r);
    expect(r.ovenTap()).toEqual([{ kind: 'clearReadyRing' }, { kind: 'questionDone' }, { kind: 'pickable', on: false }, { kind: 'bake' }]);
    expect(r.questionIndex).toBe(1);
    expect(r.progress()).toEqual({ questionIndex: 1, partial: { placed: [], baked: false } });
    expect(r.ovenTap()).toEqual([]);
    const next = r.eaten();
    expect(kinds(next)).toEqual(['clearBase', 'build', 'restoreSlices', 'pickable', 'beginQuestion']);
    expect(r.stage).toBe('toppings');
    expect(r.eaten()).toEqual([]);
  });

  it('Last question: celebrate, then finishRound after 1500 ms; Home from the last oven tap finishes', () => {
    const seed = 11;
    const r = new PizzaRound(geometry(), seed, 0);
    r.start();
    for (let i = 0; i < 3; i++) {
      readyOven(r);
      r.ovenTap();
      if (i < 2) {
        expect(r.isFinishing).toBe(false);
        r.eaten();
      }
    }
    expect(r.isFinishing).toBe(true);
    expect(r.eaten()).toEqual([{ kind: 'celebrate' }, { kind: 'finishRound', afterMs: 1500 }]);
    expect(r.stage).toBe('done');
    expect(r.ovenTap()).toEqual([]);
  });

  it('Tally: q1 clean; q2 one extra slice; q3 oven idle to level 2 → firstTryCorrect 1, maxHintLevel 2', () => {
    // The real HintMachine and RoundTally, wired the way MiniGameBase wires them.
    const tally = new RoundTally();
    let token = 0;
    const m = new HintMachine({
      audio: { say: () => ++token, setPrompt: () => undefined },
      guard: { setPickable: () => undefined, setSnapScale: () => undefined, isDragging: () => false },
      visuals: { ring: () => undefined, hand: () => undefined, clearHand: () => undefined, dim: () => undefined },
      emitLevel: (l) => tally.level(l),
    });
    const step = { correct: [], distractors: [], target: null, action: 'drag' as const };
    const apply = (cs: PizzaCommand[]): void => {
      for (const c of cs) {
        if (c.kind === 'beginQuestion') {
          tally.beginQuestion();
          m.beginQuestion({ promptLineId: c.promptLineId, retryLineId: c.retryLineId, step });
        } else if (c.kind === 'ovenStep') m.stepDone({ ...step, action: 'tap' }, { promptLineId: c.promptLineId, retryLineId: c.retryLineId });
        else if (c.kind === 'hintWrong') m.wrong();
        else if (c.kind === 'questionDone') {
          tally.questionDone();
          m.questionDone();
        }
      }
    };
    const quiet = (): void => {
      if (m.awaitedToken !== undefined) m.speechEnded(m.awaitedToken);
    };
    const r = new PizzaRound(geometry(), 3, 0);
    apply(r.start());
    // q1 clean
    apply(readyOven(r));
    apply(r.ovenTap());
    apply(r.eaten());
    // q2: one extra slice in the oven stage
    apply(readyOven(r));
    apply(r.drop(bowlSlice(r, r.current.topping), BASE));
    apply(r.ovenTap());
    apply(r.eaten());
    // q3: the oven stays untapped until the level-2 ring
    apply(readyOven(r));
    quiet();
    for (let ms = 0; ms < Tokens.Timing.pizzaOvenIdleHintMs; ms += Tokens.Timing.hintTickMs) m.tick(Tokens.Timing.hintTickMs);
    expect(m.level).toBe(2);
    apply(r.ovenTap());
    expect(tally.outcome('pizza')).toMatchObject({ questions: 3, firstTryCorrect: 1, maxHintLevel: 2 });
  });

  it('Home mid-question (2 of 3 placed): progress = {questionIndex, partial: {placed: [1, 2], baked: false}}', () => {
    const r = new PizzaRound(geometry(), seedFor('sausage', 3), 0);
    r.start();
    r.drop(bowlSlice(r, 'sausage'), NEAR_EDGE);
    r.drop(bowlSlice(r, 'sausage'), NEAR_EDGE);
    expect(r.progress()).toEqual({ questionIndex: 0, partial: { placed: [1, 2], baked: false } });
    expect(JSON.parse(JSON.stringify(r.progress()))).toEqual(r.progress());
  });
});

describe('startCommands (Story 3.1)', () => {
  it('Resume questionIndex 1 with nothing placed: question 1 begins clean, accepted', () => {
    const r = new PizzaRound(geometry(), 7, 0);
    const plan = startCommands(r, { questionIndex: 1, partial: { placed: [], baked: false } });
    expect(plan.accepted).toBe(true);
    expect(plan.warnings).toEqual([]);
    expect(r.questionIndex).toBe(1);
    const q = roundQuestions(7, 0)[1]!;
    expect(find(plan.commands, 'beginQuestion')!.promptLineId).toBe(`vo.pizza.ask.${q.topping}.${q.count}`);
    expect(r.placedSpots()).toEqual([]);
  });

  it('Resume out of range (7): question 0, not accepted, one warning', () => {
    const r = new PizzaRound(geometry(), 7, 0);
    const plan = startCommands(r, { questionIndex: 7 });
    expect(plan.accepted).toBe(false);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toMatch(/^pizza: resume index out of range/);
    expect(r.questionIndex).toBe(0);
  });

  it('No resume: question 0', () => {
    const r = new PizzaRound(geometry(), 7, 0);
    expect(startCommands(r, null).accepted).toBe(false);
    expect(r.questionIndex).toBe(0);
  });
});

describe('PizzaRound — review fixes (Story 3.1)', () => {
  it('the last oven tap marks the round as finishing; earlier taps do not', () => {
    const r = new PizzaRound(geometry(), 11, 0);
    r.start();
    for (let i = 0; i < 3; i++) {
      readyOven(r);
      const cs = r.ovenTap();
      if (i < 2) {
        expect(kinds(cs)).not.toContain('markFinishing');
        r.eaten();
      } else {
        expect(kinds(cs)).toEqual(['clearReadyRing', 'questionDone', 'pickable', 'markFinishing', 'bake']);
      }
    }
  });

  it('a cut count line is said again once, then the recount follows; a second cut moves on', () => {
    const r = new PizzaRound(geometry(), seedFor('sausage', 2), 0);
    r.start();
    r.drop(bowlSlice(r, 'sausage'), NEAR_EDGE);
    r.drop(bowlSlice(r, 'sausage'), NEAR_EDGE);
    expect(r.speechEnded('count', false)).toEqual([{ kind: 'say', tag: 'count', lineId: 'vo.pizza.count.2' }]);
    expect(r.speechEnded('count', false)).toEqual([{ kind: 'sayChain', tag: 'recount', lineIds: ['vo.pizza.count.1', 'vo.pizza.count.2'] }]);
  });

  it('a cut recount is said again once instead of opening the oven; a second cut opens it', () => {
    const r = new PizzaRound(geometry(), seedFor('sausage', 2), 0);
    r.start();
    r.drop(bowlSlice(r, 'sausage'), NEAR_EDGE);
    r.drop(bowlSlice(r, 'sausage'), NEAR_EDGE);
    r.speechEnded('count');
    expect(r.speechEnded('recount', false)).toEqual([{ kind: 'sayChain', tag: 'recount', lineIds: ['vo.pizza.count.1', 'vo.pizza.count.2'] }]);
    expect(r.stage).toBe('counting');
    expect(r.speechLine('recount', 1)).toEqual([{ kind: 'bounce', spot: 2 }]);
    expect(kinds(r.speechEnded('recount', false))).toContain('ovenReady');
    expect(r.stage).toBe('oven');
  });

  it('real-layout distances: the sausage and mushroom bowls lie inside the base target, yet a drop by a bowl is never a serve', () => {
    const g = geometry();
    expect(g.base.contains(HOMES.sausage)).toBe(true);
    expect(g.base.contains(HOMES.mushroom)).toBe(true);
    const r = new PizzaRound(g, seedFor('sausage', 2), 0);
    r.start();
    // A wrong mushroom put back 60 px from its bowl (beyond snapRadius/2): rest, not wrong.
    const m = bowlSlice(r, 'mushroom');
    const near = { x: HOMES.mushroom.x - 60, y: HOMES.mushroom.y };
    expect(r.resolve(m, near)).toBe('rest');
    expect(kinds(r.drop(m, near))).toEqual(['rest']);
    // A sausage dropped by the sausage bowl rests too; on the base side of the midline it serves.
    const s = bowlSlice(r, 'sausage');
    expect(r.resolve(s, { x: HOMES.sausage.x + 70, y: HOMES.sausage.y })).toBe('rest');
    expect(r.resolve(s, { x: BASE.x - 90, y: BASE.y })).toBe('serve');
  });
});

// --- Story 3.2 -------------------------------------------------------------------------------------

/** The real HintMachine and RoundTally, wired the way MiniGameBase wires them. */
function harness(): { apply(cs: readonly PizzaCommand[]): void; tally: RoundTally; machine: HintMachine } {
  const tally = new RoundTally();
  let token = 0;
  const machine = new HintMachine({
    audio: { say: () => ++token, setPrompt: () => undefined },
    guard: { setPickable: () => undefined, setSnapScale: () => undefined, isDragging: () => false },
    visuals: { ring: () => undefined, hand: () => undefined, clearHand: () => undefined, dim: () => undefined },
    emitLevel: (l) => tally.level(l),
  });
  const step = { correct: [], distractors: [], target: null, action: 'drag' as const };
  const apply = (cs: readonly PizzaCommand[]): void => {
    for (const c of cs) {
      if (c.kind === 'beginQuestion' || c.kind === 'beginOvenQuestion') {
        tally.beginQuestion();
        machine.beginQuestion({ promptLineId: c.promptLineId, retryLineId: c.retryLineId, step });
      } else if (c.kind === 'ovenStep') machine.stepDone({ ...step, action: 'tap' }, { promptLineId: c.promptLineId, retryLineId: c.retryLineId });
      else if (c.kind === 'hintWrong') machine.wrong();
      else if (c.kind === 'questionDone') {
        tally.questionDone();
        machine.questionDone();
      }
    }
  };
  return { apply, tally, machine };
}

/** Bakes the open question: fills the base, recount, oven tap, eaten (returns the eaten commands). */
function playQuestion(r: PizzaRound): PizzaCommand[] {
  readyOven(r);
  r.ovenTap();
  return r.eaten();
}

describe('PizzaRound — ladder levels (Story 3.2)', () => {
  it('Level 2: three bowls and slices; the toppings step dims both other bowls with their slices', () => {
    const seed = seedFor('mushroom', 5, 2);
    const r = new PizzaRound(geometry(), seed, 2);
    const cs = r.start();
    expect(find(cs, 'build')!.toppings).toEqual(['sausage', 'mushroom', 'pepper']);
    expect(find(cs, 'build')!.slices).toHaveLength(3);
    const begin = find(cs, 'beginQuestion')!;
    expect(begin.promptLineId).toBe('vo.pizza.ask.mushroom.5');
    expect(begin.correct).toEqual([bowlSlice(r, 'mushroom')]);
    expect(begin.distractors).toEqual([
      { bowl: 'sausage' },
      { slice: bowlSlice(r, 'sausage') },
      { bowl: 'pepper' },
      { slice: bowlSlice(r, 'pepper') },
    ]);
  });

  it('Level-4 hint items: a loose wrong slice joins its bowl’s distractors; the asked bowl’s slice stays correct', () => {
    const r = new PizzaRound(geometry(), seedFor('mushroom', 5, 2), 2);
    r.start();
    const p = bowlSlice(r, 'pepper');
    r.drop(p, { x: 800, y: 600 });
    const cs = r.drop(bowlSlice(r, 'mushroom'), NEAR_EDGE);
    const step = find(cs, 'stepDone')!;
    expect(step.correct).toEqual([bowlSlice(r, 'mushroom')]);
    expect(step.distractors).toEqual([{ bowl: 'sausage' }, { slice: bowlSlice(r, 'sausage') }, { bowl: 'pepper' }, { slice: p }]);
  });

  it('Five mushrooms: count.1…count.5 in turn, then the 5-line recount with 5 bounces, then the oven', () => {
    const r = new PizzaRound(geometry(), seedFor('mushroom', 5, 2), 2);
    r.start();
    const said: string[] = [];
    for (let i = 0; i < 5; i++) {
      const cs = r.drop(bowlSlice(r, 'mushroom'), NEAR_EDGE);
      said.push(find(cs, 'say')!.lineId);
    }
    expect(said).toEqual(['vo.pizza.count.1', 'vo.pizza.count.2', 'vo.pizza.count.3', 'vo.pizza.count.4', 'vo.pizza.count.5']);
    expect(r.placedSpots()).toEqual([1, 2, 3, 4, 5]);
    const chain = r.speechEnded('count');
    expect(chain).toEqual([{ kind: 'sayChain', tag: 'recount', lineIds: said }]);
    expect([0, 1, 2, 3, 4].flatMap((i) => r.speechLine('recount', i))).toEqual([1, 2, 3, 4, 5].map((spot) => ({ kind: 'bounce', spot })));
    expect(r.stage).toBe('counting');
    expect(r.speechEnded('recount')).toContainEqual({ kind: 'ovenStep', promptLineId: 'vo.pizza.bake', retryLineId: 'vo.pizza.enough.5' });
    expect(r.stage).toBe('oven');
  });

  it('Outcome: a level-2 round with one extra slice in q4’s oven stage → questions 5, firstTryCorrect 4', () => {
    const h = harness();
    const r = new PizzaRound(geometry(), 21, 2);
    h.apply(r.start());
    for (let i = 0; i < 5; i++) {
      h.apply(readyOven(r));
      if (i === 3) h.apply(r.drop(bowlSlice(r, r.current.topping), BASE));
      h.apply(r.ovenTap());
      const eaten = r.eaten();
      h.apply(eaten);
      if (i === 4) expect(kinds(eaten)).toEqual(['celebrate', 'finishRound']);
    }
    expect(h.tally.outcome('pizza')).toMatchObject({ questions: 5, firstTryCorrect: 4 });
  });
});

describe('PizzaRound — resume (Story 3.2)', () => {
  /** Level 1, question index 2 asks 4 sausage slices. */
  const L1_SEED = seedFor('sausage', 4, 1, 2);

  it('Home mid-question: L1, question index 2, 2 of 4 sausage placed → progress {2, {placed [1, 2], baked false}}', () => {
    const r = new PizzaRound(geometry(), L1_SEED, 1);
    r.start();
    playQuestion(r);
    playQuestion(r);
    expect(r.current).toEqual({ topping: 'sausage', count: 4 });
    r.drop(bowlSlice(r, 'sausage'), NEAR_EDGE);
    r.drop(bowlSlice(r, 'sausage'), NEAR_EDGE);
    const p = r.progress();
    expect(p).toEqual({ questionIndex: 2, partial: { placed: [1, 2], baked: false } });
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });

  it('Resume partial [1, 2]: slices at once (no snap, sfx or count), the ask replayed; next drop → spot 3, "Ba!"', () => {
    const r = new PizzaRound(geometry(), L1_SEED, 1);
    const plan = startCommands(r, { questionIndex: 2, partial: { placed: [1, 2], baked: false } });
    expect(plan).toMatchObject({ accepted: true, warnings: [] });
    expect(kinds(plan.commands)).toEqual(['build', 'restoreSlices', 'pickable', 'beginQuestion']);
    expect(find(plan.commands, 'restoreSlices')).toEqual({ kind: 'restoreSlices', topping: 'sausage', slots: [1, 2] });
    expect(find(plan.commands, 'beginQuestion')!.promptLineId).toBe('vo.pizza.ask.sausage.4');
    const cs = r.drop(bowlSlice(r, 'sausage'), NEAR_EDGE);
    expect(find(cs, 'snap')!.spot).toBe(3);
    expect(find(cs, 'say')!.lineId).toBe('vo.pizza.count.3');
    expect(r.progress().partial.placed).toEqual([1, 2, 3]);
  });

  it('Resume gap [1, 3], count 4: next drop → spot 2, "Ba!"; then spot 4 and the count completes', () => {
    const r = new PizzaRound(geometry(), L1_SEED, 1);
    startCommands(r, { questionIndex: 2, partial: { placed: [1, 3], baked: false } });
    const cs = r.drop(bowlSlice(r, 'sausage'), NEAR_EDGE);
    expect(find(cs, 'snap')!.spot).toBe(2);
    expect(find(cs, 'say')!.lineId).toBe('vo.pizza.count.3');
    const last = r.drop(bowlSlice(r, 'sausage'), NEAR_EDGE);
    expect(find(last, 'snap')!.spot).toBe(4);
    expect(r.stage).toBe('counting');
    expect(r.placedSpots()).toEqual([1, 3, 2, 4]);
  });

  it('Resume full [1, 2, 3], count 3: oven ready + ring, the bake prompt, no recount; the tap bakes', () => {
    const seed = seedFor('mushroom', 3);
    const r = new PizzaRound(geometry(), seed, 0);
    const plan = startCommands(r, { questionIndex: 0, partial: { placed: [1, 2, 3], baked: false } });
    expect(plan.commands).toEqual([
      { kind: 'build', toppings: ['sausage', 'mushroom'], slices: r.sliceStates() },
      { kind: 'restoreSlices', topping: 'mushroom', slots: [1, 2, 3] },
      { kind: 'pickable', on: true },
      { kind: 'ovenReady' },
      { kind: 'readyRing' },
      { kind: 'beginOvenQuestion', promptLineId: 'vo.pizza.bake', retryLineId: 'vo.pizza.enough.3' },
    ]);
    expect(kinds(plan.commands)).not.toContain('sayChain');
    expect(r.stage).toBe('oven');
    // An extra slice is still "enough"; the tap bakes.
    expect(kinds(r.drop(bowlSlice(r, 'mushroom'), BASE))).toEqual(['floatBack', 'hintWrong']);
    expect(kinds(r.ovenTap())).toContain('bake');
  });

  it.each([
    ['{}', {}],
    ['placed "x"', { placed: 'x', baked: false }],
    ['[0]', { placed: [0], baked: false }],
    ['[9]', { placed: [9], baked: false }],
    ['[1, 1]', { placed: [1, 1], baked: false }],
    ['[1.5]', { placed: [1.5], baked: false }],
    ['length > count', { placed: [1, 2, 3, 4, 5], baked: false }],
    ['baked missing', { placed: [1] }],
    ['baked true', { placed: [1], baked: true }],
    ['an array', [1, 2]],
    ['null', null],
    ['a class instance', new (class Partial {
      placed = [1];
      baked = false;
    })()],
  ])('Bad partial (%s): an empty base, the ask replayed, one warning', (_what, partial) => {
    const r = new PizzaRound(geometry(), L1_SEED, 1);
    expect(r.resumeQuestion(2, partial)).toBeNull();
    const plan = startCommands(r, { questionIndex: 2, partial });
    expect(plan.warnings).toEqual(['pizza: bad resume partial']);
    expect(plan.accepted).toBe(true);
    expect(find(plan.commands, 'restoreSlices')!.slots).toEqual([]);
    expect(find(plan.commands, 'beginQuestion')!.promptLineId).toBe('vo.pizza.ask.sausage.4');
    expect(r.placedSpots()).toEqual([]);
  });

  it('resumeQuestion ignores extra keys and keeps the stored (any distinct) spots', () => {
    const r = new PizzaRound(geometry(), L1_SEED, 1);
    expect(r.resumeQuestion(2, { placed: [8, 5], baked: false, extra: 1 })).toEqual({ placed: [8, 5] });
    expect(r.resumeQuestion(2, { placed: [], baked: false })).toEqual({ placed: [] });
    expect(r.resumeQuestion(9, { placed: [], baked: false })).toBeNull();
  });
});
