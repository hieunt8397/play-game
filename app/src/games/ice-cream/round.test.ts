import { describe, expect, it } from 'vitest';
import { HOME_SLOTS, ladder, type FlavourId } from '../../content/games/ice-cream';
import type { Point } from '../../content/layout-types';
import { LAYOUTS } from '../../content/layouts';
import { pointInPolygon } from '../../core/input/polygon';
import { Tokens } from '../../core/tokens';
import { askLineId } from './lines';
import { questionFor } from './questions';
import { IceCreamRound, packRow, placeOnRow, startCommands, tableRowFrom, type RoundCommand, type RoundGeometry, type TableRow } from './round';

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const poly = (pts: Point[]) => ({ contains: (p: Point) => pointInPolygon(p, pts) });

const HOMES: Record<string, Point> = {
  'scoop-1': { x: 152, y: 560 },
  'scoop-2': { x: 332, y: 560 },
  'scoop-3': { x: 692, y: 560 },
  'scoop-4': { x: 872, y: 560 },
};
const CONE = { x: 512, y: 450, r: 100 };
const ON_CONE = { x: CONE.x, y: CONE.y };
const coneAt = (n: number) => ({ x: 512, y: 430 - 40 * Math.min(n, 2) });

const ROW_Y = 560;
const PLAY = { x: 24, y: 80, w: 976, h: 648 };
/** The table row: the homes' y, from the leftmost to the rightmost home (152–872). */
const ROW: TableRow = tableRowFrom(Object.values(HOMES), PLAY);

/** Every counter scoop rests on the row (within its bounds), >= minSize from every other. */
function expectOnRow(round: IceCreamRound, row: TableRow = ROW): void {
  const all = round.scoopStates();
  for (const a of all) {
    expect(a.at.y, a.id).toBe(row.y);
    expect(a.at.x, a.id).toBeGreaterThanOrEqual(row.x0);
    expect(a.at.x, a.id).toBeLessThanOrEqual(row.x1);
  }
  for (const a of all) for (const b of all) if (a.id < b.id) expect(Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y), `${a.id}/${b.id}`).toBeGreaterThanOrEqual(90 - 1e-6);
}

const GEO: RoundGeometry = {
  homeCentre: (slot) => HOMES[slot]!,
  coneCentre: coneAt,
  cone: { contains: (p) => Math.hypot(p.x - CONE.x, p.y - CONE.y) <= CONE.r },
  shiba: poly(rect(420, 150, 600, 340)),
  counterUpper: poly(rect(50, 500, 970, 620)),
  counter: poly(rect(50, 500, 970, 760)),
  row: () => ROW,
  // Story 5.1: the play area; (500, 60) lies above it (the "outside the play rect" case).
  playRect: () => PLAY,
  snapRadius: 100,
  minSize: 90,
  offCounterDelayMs: 1500,
  nextQuestionDelayMs: 2000,
  finishDelayMs: 1500,
  towerMax: 5,
};

function setup(seed = 7, level = 0) {
  const round = new IceCreamRound(GEO, seed, level);
  const cmds = round.start();
  const scoops = round.scoopStates();
  const target = scoops.find((s) => s.flavour === round.wanted[0])!;
  const other = scoops.find((s) => !round.wanted.includes(s.flavour))!;
  return { round, cmds, target, other };
}

/** The first seed whose question 0 at `level` asks exactly `wanted`. */
function seedFor(level: number, wanted: readonly FlavourId[]): number {
  for (let s = 0; s < 100000; s++) if (questionFor(s, 0, level).wanted.join() === wanted.join()) return s;
  throw new Error(`no seed for ${wanted.join()}`);
}

const kinds = (cmds: readonly RoundCommand[]) => cmds.map((c) => c.kind);
const scoopOf = (round: IceCreamRound, f: FlavourId) => round.scoopStates().find((s) => s.flavour === f)!;
const serve = (round: IceCreamRound, f: FlavourId) => round.drop(scoopOf(round, f).id, ON_CONE);
const idsOf = (round: IceCreamRound, fs: readonly FlavourId[]) => fs.map((f) => scoopOf(round, f).id);

/** Story 6.1: a round of `level` played to its end (free play not started). */
function finished(seed = 7, level = 0): IceCreamRound {
  const round = new IceCreamRound(GEO, seed, level);
  round.start();
  for (let q = 0; q < round.questionCount - 1; q++) {
    answer(round);
    round.next();
  }
  answer(round);
  return round;
}

/** Serves every wanted scoop of the current question in order; returns the last drop's commands. */
function answer(round: IceCreamRound): RoundCommand[] {
  let cmds: RoundCommand[] = [];
  for (const f of [...round.wanted]) cmds = serve(round, f);
  return cmds;
}

describe('IceCreamRound', () => {
  it('Enter {level 0, seed 7}: two scoops at scoop-2/3 and a beginQuestion with the ask/retry lines', () => {
    const { round, cmds, target, other } = setup(7);
    expect(kinds(cmds)).toEqual(['build', 'pickable', 'beginQuestion']);
    const build = cmds[0] as Extract<RoundCommand, { kind: 'build' }>;
    expect(build.scoops.map((s) => s.at)).toEqual([HOMES['scoop-2'], HOMES['scoop-3']]);
    const f = round.wanted[0]!;
    expect(cmds[2]).toEqual({
      kind: 'beginQuestion',
      promptLineId: `vo.ice-cream.ask.${f}`,
      retryLineId: `vo.ice-cream.retry.${f}`,
      correct: [target.id],
      distractors: [other.id],
    });
    expect(round.progress()).toEqual({ questionIndex: 0, partial: { placed: [] } });
    expect(round.questionCount).toBe(3);
  });

  it('correct single scoop: questionDone first (Story 1.9), snap, respawn, unpickable, celebrate, next in 2 s; index advances at once', () => {
    const { round, target } = setup();
    const cmds = round.drop(target.id, { x: CONE.x + 80, y: CONE.y });
    expect(cmds).toEqual([
      { kind: 'questionDone' },
      { kind: 'snap', id: target.id, to: coneAt(0) },
      { kind: 'respawn', scoop: { id: expect.any(String), flavour: target.flavour, at: target.at } },
      { kind: 'pickable', on: false },
      { kind: 'celebrate' },
      { kind: 'nextLater', ms: 2000 },
    ]);
    expect(round.isCelebrating).toBe(true);
    // Home mid-celebration (not last): the snapshot points at the next question with nothing placed.
    expect(round.progress()).toEqual({ questionIndex: 1, partial: { placed: [] } });
    expect(round.scoopStates()).toHaveLength(2);
  });

  it.each([
    ['Shiba', { x: 500, y: 250 }],
    ['the upper counter', { x: 900, y: 600 }],
  ])('correct scoop dropped on %s is served the same way', (_name, p) => {
    const { round, target } = setup();
    expect(round.resolve(target.id, p)).toBe('serve');
    expect(kinds(round.drop(target.id, p))).toEqual(['questionDone', 'snap', 'respawn', 'pickable', 'celebrate', 'nextLater']);
  });

  it('wrong scoop on the cone is a chose-other back to its pre-lift spot and reports hintWrong once', () => {
    const { round, other } = setup();
    expect(round.drop(other.id, ON_CONE)).toEqual([{ kind: 'choseOther', id: other.id, to: other.at }, { kind: 'hintWrong' }]);
    expect(round.progress().partial.placed).toEqual([]);
    expect(round.isCelebrating).toBe(false);
  });

  it('own home: dropped within snapRadius/2 of its pre-lift spot settles with no hint', () => {
    const { round, other } = setup();
    const p = { x: other.at.x + 30, y: other.at.y + 30 };
    expect(round.drop(other.id, p)).toEqual([{ kind: 'floatBack', id: other.id, to: other.at }]);
  });

  it('rest on the pink front: falls onto the table row at the drop x, moved ≥ minSize clear; the new spot is its home for floats', () => {
    const { round, other, target } = setup();
    const onTop = { x: target.at.x + 10, y: 690 };
    const lowNeighbour = { ...target.at, y: 690 };
    expect(round.resolve(target.id, lowNeighbour)).toBe('rest');
    expect(round.drop(target.id, lowNeighbour)).toEqual([{ kind: 'rest', id: target.id, at: { x: target.at.x, y: ROW_Y } }]);
    const cmds = round.drop(other.id, onTop);
    expect(cmds).toHaveLength(1);
    const rest = cmds[0] as Extract<RoundCommand, { kind: 'rest' }>;
    expect(rest.kind).toBe('rest');
    expect(rest.at.y).toBe(ROW_Y);
    // The nearest clear x: one minSize right of the scoop it landed on.
    expect(rest.at.x).toBeCloseTo(target.at.x + 90, 9);
    expectOnRow(round);
    expect(round.drop(other.id, ON_CONE)[0]).toEqual({ kind: 'choseOther', id: other.id, to: rest.at });
  });

  it('rest with the row full: floats back to the pre-lift spot (never below the row)', () => {
    // A row only around the left home: no clear x for a second scoop.
    const narrow: RoundGeometry = { ...GEO, row: () => ({ y: ROW_Y, x0: 320, x1: 345 }) };
    const round = new IceCreamRound(narrow, 7, 0);
    round.start();
    const [left, right] = round.scoopStates();
    expect(left!.at.x).toBe(332);
    expect(round.drop(right!.id, { x: 330, y: 700 })).toEqual([{ kind: 'floatBack', id: right!.id, to: right!.at }]);
    expect(round.drop(right!.id, { x: 330, y: 300 })).toEqual([{ kind: 'floatBack', id: right!.id, to: right!.at }]);
    expect(round.scoopStates().find((s) => s.id === right!.id)!.at).toEqual(right!.at);
  });

  it('a respawn at a home another scoop rests on nudges that scoop clear (rest), so they never overlap', () => {
    const { round, other, target } = setup();
    const home = target.at;
    round.drop(target.id, { x: home.x + 300, y: 700 });
    // The pink front right under the (now empty) home: the scoop falls onto the row at the home's x.
    const underHome = { x: home.x, y: home.y + 65 };
    expect(round.drop(other.id, underHome)).toEqual([{ kind: 'rest', id: other.id, at: { x: home.x, y: ROW_Y } }]);
    const cmds = serve(round, round.wanted[0]!);
    const respawn = cmds.find((c) => c.kind === 'respawn') as Extract<RoundCommand, { kind: 'respawn' }>;
    expect(respawn.scoop.at).toEqual(home);
    const moved = cmds.find((c) => c.kind === 'rest' && c.id === other.id) as Extract<RoundCommand, { kind: 'rest' }>;
    expect(moved).toBeDefined();
    expect(kinds(cmds).indexOf('rest')).toBeGreaterThan(kinds(cmds).indexOf('respawn'));
    // Nudged along the row, not off it.
    expect(moved.at.y).toBe(ROW_Y);
    expect(Math.abs(moved.at.x - home.x)).toBeCloseTo(90, 9);
    expectOnRow(round);
  });

  it('Story 5.1 mid-drag lift: in the air above the table (off, inside the play rect) → falls onto the row, no returnLater', () => {
    const { round, other, target } = setup();
    const sky = { x: 200, y: 300 };
    expect(round.resolve(other.id, sky)).toBe('off');
    expect(round.drop(other.id, sky)).toEqual([{ kind: 'rest', id: other.id, at: { x: 200, y: ROW_Y } }]);
    expect(round.lift(other.id)).toEqual([]);
    // Its new pre-lift spot: a drop next to it is "home" now.
    expect(round.resolve(other.id, { x: 210, y: ROW_Y })).toBe('home');
    // A second scoop dropped on the same spot lands on the row beside it.
    const [nudged] = round.drop(target.id, sky);
    expect(nudged?.kind).toBe('rest');
    const at = (nudged as Extract<RoundCommand, { kind: 'rest' }>).at;
    expect(at.y).toBe(ROW_Y);
    expect(Math.abs(at.x - sky.x)).toBeCloseTo(90, 9);
    expectOnRow(round);
  });

  it('no scoop ever rests below the row: random rest / off / home drops over several seeds and levels', () => {
    let rng = 12345;
    const rand = () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (const level of [0, 1, 2, 3]) {
      for (const seed of [1, 7, 42]) {
        const round = new IceCreamRound(GEO, seed, level);
        round.start();
        for (let k = 0; k < 40; k++) {
          const scoops = round.scoopStates();
          const s = scoops[Math.floor(rand() * scoops.length)]!;
          // The pink front / the bottom, or the air left and right of Shiba (never a serve zone).
          const p = { x: 30 + rand() * 960, y: 630 + rand() * 120 };
          const q = rand() < 0.5 ? p : { x: rand() < 0.5 ? 30 + rand() * 350 : 650 + rand() * 340, y: 120 + rand() * 300 };
          if (round.resolve(s.id, q) === 'serve') continue;
          round.drop(s.id, q);
          round.lift(s.id);
          for (const t of round.scoopStates()) expect(t.at.y).toBeLessThanOrEqual(ROW_Y);
        }
        expectOnRow(round);
      }
    }
  });

  it('off the play rect: slides back after 1500 ms; lifting again cancels the slide', () => {
    const { round, other } = setup();
    expect(round.drop(other.id, { x: 500, y: 60 })).toEqual([{ kind: 'returnLater', id: other.id, to: other.at, ms: 1500 }]);
    expect(round.lift(other.id)).toEqual([{ kind: 'cancelReturn', id: other.id }]);
    expect(round.lift(other.id)).toEqual([]);
  });

  it('pause mid-drag (cancel): back to the pre-lift spot', () => {
    const { round, other } = setup();
    expect(round.cancel(other.id)).toEqual([{ kind: 'floatBack', id: other.id, to: other.at }]);
  });

  it('celebrating: a drag still running just floats back (no second serve, no hint)', () => {
    const { round, target, other } = setup();
    round.drop(target.id, ON_CONE);
    expect(round.drop(other.id, ON_CONE)).toEqual([{ kind: 'floatBack', id: other.id, to: other.at }]);
  });

  it('next(): clears the cone, lays out question 1 with a different request', () => {
    const { round, target } = setup();
    const first = round.wanted.join();
    round.drop(target.id, ON_CONE);
    const cmds = round.next();
    expect(kinds(cmds)).toEqual(['clear', 'build', 'pickable', 'beginQuestion']);
    expect(round.questionIndex).toBe(1);
    expect(round.wanted.join()).not.toBe(first);
    expect(round.isCelebrating).toBe(false);
    expect(round.progress()).toMatchObject({ questionIndex: 1, partial: { placed: [] } });
  });

  it('the cone and the question survive wrong, home, rest and off outcomes', () => {
    const { round, target, other } = setup(7, 1);
    const outcomes: Array<[string, Point]> = [
      ['wrong', ON_CONE],
      ['home', { x: other.at.x + 20, y: other.at.y }],
      ['rest', { x: 600, y: 700 }],
      ['off', { x: 500, y: 60 }],
    ];
    const wanted = round.wanted.join();
    const expectSurvives = (placed: string[]) => {
      expect(round.wanted.join()).toBe(wanted);
      expect(round.questionIndex).toBe(0);
      expect(round.progress().partial.placed).toEqual(placed);
    };
    for (const [kind, p] of outcomes) {
      expect(round.resolve(other.id, p), kind).toBe(kind === 'wrong' ? 'serve' : kind);
      round.drop(other.id, p);
      round.lift(other.id);
      expectSurvives([]);
    }
    round.drop(target.id, ON_CONE);
    for (const [, p] of outcomes) {
      round.drop(other.id, p);
      round.lift(other.id);
      expectSurvives([target.flavour]);
    }
  });

  it('unknown scoop ids are ignored', () => {
    const { round } = setup();
    expect(round.drop('nope', { x: 0, y: 0 })).toEqual([]);
    expect(round.cancel('nope')).toEqual([]);
  });
});

describe('IceCreamRound multi-scoop (Story 1.10)', () => {
  it('Two any order (L1, [strawberry, chocolate]): chocolate → cone-1 + stepDone(retry.strawberry); strawberry → cone-2, questionDone, celebrate', () => {
    const round = new IceCreamRound(GEO, seedFor(1, ['strawberry', 'chocolate']), 1);
    const start = round.start();
    expect(start[2]).toMatchObject({
      kind: 'beginQuestion',
      promptLineId: 'vo.ice-cream.ask.strawberry-chocolate',
      retryLineId: 'vo.ice-cream.retry.strawberry',
      correct: idsOf(round, ['strawberry', 'chocolate']),
    });
    expect(round.scoopStates()).toHaveLength(3);
    const choc = scoopOf(round, 'chocolate');
    const first = serve(round, 'chocolate');
    expect(kinds(first)).toEqual(['snap', 'respawn', 'stepDone']);
    expect(first[0]).toEqual({ kind: 'snap', id: choc.id, to: coneAt(0) });
    const third = round.scoopStates().find((s) => s.flavour !== 'strawberry' && s.flavour !== 'chocolate')!;
    expect(first[2]).toEqual({
      kind: 'stepDone',
      retryLineId: 'vo.ice-cream.retry.strawberry',
      correct: idsOf(round, ['strawberry']),
      distractors: expect.arrayContaining([third.id, scoopOf(round, 'chocolate').id]),
    });
    expect((first[2] as Extract<RoundCommand, { kind: 'stepDone' }>).distractors).toHaveLength(2);
    expect(round.isCelebrating).toBe(false);
    expect(round.progress()).toEqual({ questionIndex: 0, partial: { placed: ['chocolate'] } });
    const last = serve(round, 'strawberry');
    expect(kinds(last)).toEqual(['questionDone', 'snap', 'respawn', 'pickable', 'celebrate', 'nextLater']);
    expect(last[1]).toMatchObject({ kind: 'snap', to: coneAt(1) });
  });

  it('Duplicate: the respawned copy of a placed flavour floats back with hintWrong; placed unchanged', () => {
    const round = new IceCreamRound(GEO, seedFor(1, ['strawberry', 'chocolate']), 1);
    round.start();
    serve(round, 'strawberry');
    const copy = scoopOf(round, 'strawberry');
    expect(round.drop(copy.id, ON_CONE)).toEqual([{ kind: 'choseOther', id: copy.id, to: copy.at }, { kind: 'hintWrong' }]);
    expect(round.progress().partial.placed).toEqual(['strawberry']);
  });

  it('Ordered ok (L3, [mint, vanilla, strawberry]): cone-1..3; retries order-first.mint → order-next.vanilla → order-next.strawberry', () => {
    const round = new IceCreamRound(GEO, seedFor(3, ['mint', 'vanilla', 'strawberry']), 3);
    const start = round.start();
    const others = round.scoopStates().filter((s) => s.flavour !== 'mint').map((s) => s.id);
    expect(start[2]).toEqual({
      kind: 'beginQuestion',
      promptLineId: 'vo.ice-cream.ask-order.mint-vanilla-strawberry',
      retryLineId: 'vo.ice-cream.order-first.mint',
      correct: idsOf(round, ['mint']),
      distractors: others,
    });
    const a = serve(round, 'mint');
    expect(a[0]).toMatchObject({ kind: 'snap', to: coneAt(0) });
    expect(a[2]).toMatchObject({ kind: 'stepDone', retryLineId: 'vo.ice-cream.order-next.vanilla', correct: idsOf(round, ['vanilla']) });
    expect((a[2] as Extract<RoundCommand, { kind: 'stepDone' }>).distractors).toHaveLength(3);
    const b = serve(round, 'vanilla');
    expect(b[0]).toMatchObject({ kind: 'snap', to: coneAt(1) });
    expect(b[2]).toMatchObject({ kind: 'stepDone', retryLineId: 'vo.ice-cream.order-next.strawberry', correct: idsOf(round, ['strawberry']) });
    const c = serve(round, 'strawberry');
    expect(c[1]).toMatchObject({ kind: 'snap', to: coneAt(2) });
    expect(kinds(c)).toEqual(['questionDone', 'snap', 'respawn', 'pickable', 'celebrate', 'nextLater']);
  });

  it('Wrong order (L3): a wanted flavour out of order floats back with hintWrong', () => {
    const round = new IceCreamRound(GEO, seedFor(3, ['mint', 'vanilla', 'strawberry']), 3);
    round.start();
    const v = scoopOf(round, 'vanilla');
    expect(round.drop(v.id, ON_CONE)).toEqual([{ kind: 'choseOther', id: v.id, to: v.at }, { kind: 'hintWrong' }]);
    serve(round, 'mint');
    const s = scoopOf(round, 'strawberry');
    expect(round.drop(s.id, ON_CONE)).toEqual([{ kind: 'choseOther', id: s.id, to: s.at }, { kind: 'hintWrong' }]);
    expect(round.progress().partial.placed).toEqual(['mint']);
  });

  it('Level-4 dim stage, unordered (L2, 1 of 3 placed): the two remaining wanted are correct; placed and non-wanted are distractors', () => {
    const round = new IceCreamRound(GEO, 11, 2);
    round.start();
    const [w0, w1, w2] = round.wanted as [FlavourId, FlavourId, FlavourId];
    const step = serve(round, w1)[2] as Extract<RoundCommand, { kind: 'stepDone' }>;
    expect(step.correct).toEqual(idsOf(round, [w0, w2]));
    const rest = round.scoopStates().filter((s) => s.flavour !== w0 && s.flavour !== w2);
    expect([...step.distractors].sort()).toEqual(rest.map((s) => s.id).sort());
    expect(step.retryLineId).toBe(`vo.ice-cream.retry.${w0}`);
  });

  it('Home mid-question (1 of 2 placed): the snapshot keeps the placed flavour', () => {
    const round = new IceCreamRound(GEO, 7, 1);
    round.start();
    const f = round.wanted[1]!;
    serve(round, f);
    expect(round.progress()).toMatchObject({ questionIndex: 0, partial: { placed: [f] } });
  });

  it.each(ladder.map((l, i) => [l.id, i, l.questions] as const))('Last question (%s): %i → finishRound after 1500 ms after its %i questions; then inert', (_id, level, questions) => {
    const round = new IceCreamRound(GEO, 7, level);
    round.start();
    for (let q = 0; q < questions - 1; q++) {
      expect(answer(round).at(-1)).toEqual({ kind: 'nextLater', ms: 2000 });
      round.next();
    }
    const last = answer(round);
    expect(kinds(last)).toEqual(['questionDone', 'snap', 'respawn', 'pickable', 'celebrate', 'finishRound']);
    expect(last.at(-1)).toEqual({ kind: 'finishRound', afterMs: 1500 });
    expect(round.isFinished).toBe(true);
    expect(round.next()).toEqual([]);
    const s = round.scoopStates()[0]!;
    expect(round.drop(s.id, ON_CONE)).toEqual([{ kind: 'floatBack', id: s.id, to: s.at }]);
  });

  it('Story 6.1: after the round is finished and before free play starts every drop only floats back', () => {
    const round = finished();
    const placed = round.progress().partial.placed;
    for (const s of round.scoopStates()) {
      for (const p of [ON_CONE, { x: 900, y: 600 }, { x: 300, y: 690 }, { x: 200, y: 300 }, { x: 500, y: 60 }]) {
        expect(round.drop(s.id, p)).toEqual([{ kind: 'floatBack', id: s.id, to: s.at }]);
      }
    }
    expect(round.progress().partial.placed).toEqual(placed);
    expect(round.towerCount).toBe(round.current.wanted.length);
  });

  it('an out-of-range level is clamped (question count too)', () => {
    const round = new IceCreamRound(GEO, 7, 9);
    round.start();
    expect(round.wanted).toHaveLength(3);
    expect(round.questionCount).toBe(ladder[3]!.questions);
  });
});

describe('IceCreamRound resume (Story 2.5)', () => {
  it('Home mid-question: L1, question 2 (index 1), one wanted placed → progress is plain JSON', () => {
    const round = new IceCreamRound(GEO, 7, 1);
    round.start();
    answer(round);
    round.next();
    const f = round.wanted[0]!;
    serve(round, f);
    const p = round.progress();
    expect(p).toEqual({ questionIndex: 1, partial: { placed: [f] } });
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });

  it('resumed build: the same question, the placed scoop on cone-1, beginQuestion with the retry for 1 placed', () => {
    const before = new IceCreamRound(GEO, 7, 1);
    before.start();
    answer(before);
    before.next();
    const question = before.current;
    const f = before.wanted[1]!;
    serve(before, f);
    const { questionIndex, partial } = before.progress();

    const after = new IceCreamRound(GEO, 7, 1);
    const placed = after.resumeQuestion(questionIndex, JSON.parse(JSON.stringify(partial)));
    expect(placed).toEqual({ placed: [f] });
    const cmds = after.resume(questionIndex, placed!.placed);
    expect(kinds(cmds)).toEqual(['build', 'restoreCone', 'pickable', 'beginQuestion']);
    expect(after.current).toEqual(question);
    expect(cmds[1]).toEqual({ kind: 'restoreCone', scoops: [{ flavour: f, to: coneAt(0) }] });
    // Every counter flavour stands at home (a fresh copy of the placed one included).
    const build = cmds[0] as Extract<RoundCommand, { kind: 'build' }>;
    expect(build.scoops.map((s) => s.flavour)).toEqual(question.counter);
    const remaining = question.wanted.find((x) => x !== f)!;
    const begin = cmds[3] as Extract<RoundCommand, { kind: 'beginQuestion' }>;
    expect(begin.promptLineId).toBe(askLineId(question));
    expect(begin.retryLineId).toBe(`vo.ice-cream.retry.${remaining}`);
    expect(begin.correct).toEqual(idsOf(after, [remaining]));
    expect(after.progress()).toEqual({ questionIndex, partial: { placed: [f] } });
    // The next serve completes the question on cone-2.
    const done = serve(after, remaining);
    expect(done[0]).toEqual({ kind: 'questionDone' });
    expect(done[1]).toMatchObject({ kind: 'snap', to: coneAt(1) });
    expect(after.progress()).toEqual({ questionIndex: questionIndex + 1, partial: { placed: [] } });
  });

  it('ordered restore: L3, placed [wanted[0]] → cone-1 = wanted[0]; next step = wanted[1]', () => {
    const round = new IceCreamRound(GEO, 7, 3);
    const q = questionFor(7, 0, 3);
    const placed = round.resumeQuestion(0, { placed: [q.wanted[0]] });
    expect(placed).toEqual({ placed: [q.wanted[0]] });
    const cmds = round.resume(0, placed!.placed);
    expect(cmds[1]).toEqual({ kind: 'restoreCone', scoops: [{ flavour: q.wanted[0], to: coneAt(0) }] });
    const begin = cmds[3] as Extract<RoundCommand, { kind: 'beginQuestion' }>;
    expect(begin.correct).toEqual(idsOf(round, [q.wanted[1]!]));
    expect(begin.retryLineId).toBe(`vo.ice-cream.order-next.${q.wanted[1]}`);
    expect(begin.promptLineId).toBe(askLineId(q));
  });

  it('nothing placed: no restoreCone; the question begins as a fresh start would', () => {
    const fresh = new IceCreamRound(GEO, 7, 1).start();
    const resumed = new IceCreamRound(GEO, 7, 1).resume(0, []);
    expect(resumed).toEqual(fresh);
  });

  describe('bad partials → null (the question begins clean)', () => {
    const L1 = questionFor(7, 1, 1);
    const L3 = questionFor(7, 0, 3);
    const notWanted = L1.counter.find((f) => !L1.wanted.includes(f))!;
    it.each([
      ['not an object', 1, 1, null],
      ['an array', 1, 1, ['strawberry']],
      ['placed missing', 1, 1, {}],
      ['placed not an array', 1, 1, { placed: 'strawberry' }],
      ['a non-string entry', 1, 1, { placed: [1] }],
      ['a non-wanted flavour', 1, 1, { placed: [notWanted] }],
      ['an unknown flavour', 1, 1, { placed: ['banana'] }],
      ['a duplicate', 1, 1, { placed: [L1.wanted[0], L1.wanted[0]] }],
      ['full length', 1, 1, { placed: [...L1.wanted] }],
      ['out of order (ordered level)', 3, 0, { placed: [L3.wanted[1]] }],
    ])('%s', (_name, level, index, partial) => {
      const round = new IceCreamRound(GEO, 7, level);
      expect(round.resumeQuestion(index, partial)).toBeNull();
    });
  });

  it.each([
    ['index 9 at L0', 9],
    ['index 3 at L0 (= question count)', 3],
    ['a negative index', -1],
    ['a fractional index', 0.5],
  ])('bad index (%s) → null', (_name, index) => {
    expect(new IceCreamRound(GEO, 7, 0).resumeQuestion(index, { placed: [] })).toBeNull();
  });
});

describe('startCommands (Story 2.5: the build decision)', () => {
  it('no resume: the fresh start, not accepted, no warning', () => {
    const plan = startCommands(new IceCreamRound(GEO, 7, 1), null);
    expect(plan).toEqual({ commands: new IceCreamRound(GEO, 7, 1).start(), accepted: false, warnings: [] });
  });

  it('valid resume: the resumed commands (restoreCone), accepted, no warning', () => {
    const q = questionFor(7, 1, 1);
    const plan = startCommands(new IceCreamRound(GEO, 7, 1), { questionIndex: 1, partial: { placed: [q.wanted[0]] } });
    expect(plan.accepted).toBe(true);
    expect(plan.warnings).toEqual([]);
    expect(plan.commands).toEqual(new IceCreamRound(GEO, 7, 1).resume(1, [q.wanted[0]!]));
    expect(kinds(plan.commands)).toEqual(['build', 'restoreCone', 'pickable', 'beginQuestion']);
  });

  it('out-of-range index: the start() commands (question 1), not accepted, one warning', () => {
    const round = new IceCreamRound(GEO, 7, 0);
    const plan = startCommands(round, { questionIndex: 9, partial: { placed: [] } });
    expect(plan.commands).toEqual(new IceCreamRound(GEO, 7, 0).start());
    expect(plan.accepted).toBe(false);
    expect(plan.warnings).toHaveLength(1);
    expect(round.progress()).toEqual({ questionIndex: 0, partial: { placed: [] } });
  });

  it('bad partial: that question begins clean (spec: "begins that question clean"), accepted, one warning', () => {
    const round = new IceCreamRound(GEO, 7, 1);
    const plan = startCommands(round, { questionIndex: 1, partial: { placed: ['banana'] } });
    expect(plan.commands).toEqual(new IceCreamRound(GEO, 7, 1).resume(1, []));
    expect(kinds(plan.commands)).toEqual(['build', 'pickable', 'beginQuestion']);
    expect(plan.accepted).toBe(true);
    expect(plan.warnings).toHaveLength(1);
    expect(round.progress()).toEqual({ questionIndex: 1, partial: { placed: [] } });
  });
});

describe('IceCreamRound free play (Story 6.1)', () => {
  const started = (seed = 7, level = 0) => {
    const round = finished(seed, level);
    return { round, begin: round.beginFreePlay() };
  };
  /** The counter scoop resting at `at`. */
  const scoopAt = (round: IceCreamRound, at: Point) => round.scoopStates().find((s) => s.at.x === at.x && s.at.y === at.y)!;

  it('beginFreePlay: only once the round is finished; makes every counter scoop pickable once', () => {
    const fresh = new IceCreamRound(GEO, 7, 0);
    fresh.start();
    expect(fresh.beginFreePlay()).toEqual([]);
    expect(fresh.isFreePlay).toBe(false);
    const { round, begin } = started();
    expect(begin).toEqual([{ kind: 'pickable', on: true }]);
    expect(round.isFreePlay).toBe(true);
    expect(round.beginFreePlay()).toEqual([]);
  });

  it('any flavour served onto the cone or Shiba stacks: stack, respawn at home, celebrate; no hint, no question', () => {
    const { round } = started();
    const start = round.towerCount;
    expect(start).toBe(1);
    const [a, b] = round.scoopStates();
    const cmds = round.drop(a!.id, ON_CONE);
    expect(kinds(cmds)).toEqual(['stack', 'respawn', 'celebrate']);
    expect(cmds[0]).toEqual({ kind: 'stack', id: a!.id, to: round.towerCentre(start) });
    const respawn = cmds[1] as Extract<RoundCommand, { kind: 'respawn' }>;
    expect(respawn.scoop).toMatchObject({ flavour: a!.flavour, at: a!.at });
    const viaShiba = round.drop(b!.id, { x: 500, y: 200 });
    expect(kinds(viaShiba)).toEqual(['stack', 'respawn', 'celebrate']);
    expect(round.towerCount).toBe(start + 2);
    const all = [...cmds, ...viaShiba].map((c) => c.kind);
    for (const k of ['hintWrong', 'choseOther', 'beginQuestion', 'stepDone', 'questionDone', 'nextLater', 'finishRound'] as const) expect(all).not.toContain(k);
  });

  it('tower slots: cone-1..3, then cone-3 plus the cone-1 → cone-2 step per slot', () => {
    const { round } = started();
    expect(round.towerCentre(0)).toEqual(coneAt(0));
    expect(round.towerCentre(2)).toEqual(coneAt(2));
    expect(round.towerCentre(3)).toEqual({ x: 512, y: 430 - 80 - 40 });
    expect(round.towerCentre(7)).toEqual({ x: 512, y: 430 - 80 - 5 * 40 });
  });

  it('the tower topples at towerMax: every tower scoop (the last cone scoops included) falls to a nudged rest spot and is a counter scoop', () => {
    const { round } = started();
    const coneFirst = round.towerCount;

    const stacked: string[] = [];
    while (round.towerCount < GEO.towerMax - 1) {
      const s = round.scoopStates()[0]!;
      stacked.push(s.id);
      expect(kinds(round.drop(s.id, ON_CONE))).toEqual(['stack', 'respawn', 'celebrate']);
    }
    const s = round.scoopStates()[0]!;
    stacked.push(s.id);
    const last = round.drop(s.id, ON_CONE);
    expect(kinds(last)).toEqual(['stack', 'respawn', 'celebrate', 'topple']);
    const topple = last[3] as Extract<RoundCommand, { kind: 'topple' }>;
    expect(topple.scoops).toHaveLength(GEO.towerMax);
    expect(topple.scoops.slice(coneFirst).map((t) => t.id)).toEqual(stacked);
    expect(round.towerCount).toBe(0);
    const counter = round.scoopStates();
    for (const t of topple.scoops) {
      expect(t.to.y).toBe(ROW_Y);
      expect(t.to.x).toBeGreaterThanOrEqual(ROW.x0);
      expect(t.to.x).toBeLessThanOrEqual(ROW.x1);
      expect(counter.find((c) => c.id === t.id)).toEqual({ id: t.id, flavour: t.flavour, at: t.to });
    }
    // All on the row, >= minSize from each other and from the scoops at home.
    expectOnRow(round);
    // Pinned (deterministic): the same seed gives the same spots.
    const again = started().round;
    while (again.towerCount < GEO.towerMax - 1) again.drop(again.scoopStates()[0]!.id, ON_CONE);
    const t2 = again.drop(again.scoopStates()[0]!.id, ON_CONE).at(-1) as Extract<RoundCommand, { kind: 'topple' }>;
    expect(t2.scoops.map((t) => t.to)).toEqual(topple.scoops.map((t) => t.to));
  });

  it('while toppling a serve floats back; after toppled() a fallen scoop stacks from cone-1 without a respawn', () => {
    const { round } = started();
    while (round.towerCount < GEO.towerMax - 1) round.drop(round.scoopStates()[0]!.id, ON_CONE);
    const topple = round.drop(round.scoopStates()[0]!.id, ON_CONE).at(-1) as Extract<RoundCommand, { kind: 'topple' }>;
    const fallen = topple.scoops[0]!;
    expect(round.drop(fallen.id, ON_CONE)).toEqual([{ kind: 'floatBack', id: fallen.id, to: fallen.to }]);
    round.toppled();
    expect(round.drop(fallen.id, ON_CONE)).toEqual([
      { kind: 'stack', id: fallen.id, to: round.towerCentre(0) },
      { kind: 'celebrate' },
    ]);
    expect(round.towerCount).toBe(1);
  });

  it('rest, home and off drops behave as during play', () => {
    const { round } = started();
    const s = round.scoopStates()[0]!;
    expect(round.drop(s.id, { x: s.at.x + 5, y: s.at.y })).toEqual([{ kind: 'floatBack', id: s.id, to: s.at }]);
    const rest = round.drop(s.id, { x: 300, y: 690 });
    expect(kinds(rest)).toEqual(['rest']);
    const moved = scoopAt(round, (rest[0] as Extract<RoundCommand, { kind: 'rest' }>).at);
    expect(moved.id).toBe(s.id);
    // The last counter scoop of its flavour, moved away, still respawns at its home when stacked.
    const stacked = round.drop(s.id, ON_CONE);
    expect(kinds(stacked)).toEqual(['stack', 'respawn', 'celebrate']);
    const t = round.scoopStates()[0]!;
    expect(round.drop(t.id, { x: 500, y: 60 })).toEqual([{ kind: 'returnLater', id: t.id, to: t.at, ms: 1500 }]);
  });

  it('a last question resumed with a placed scoop: the restored cone scoop topples with a fresh id', () => {
    const level = 1;
    const probe = new IceCreamRound(GEO, 7, level);
    const lastIndex = probe.questionCount - 1;
    const q = questionFor(7, lastIndex, level);
    const round = new IceCreamRound(GEO, 7, level);
    round.resume(lastIndex, [q.wanted[0]!]);
    serve(round, q.wanted[1]!);
    expect(round.isFinished).toBe(true);
    expect(round.towerCount).toBe(2);
    round.beginFreePlay();
    while (round.towerCount < GEO.towerMax - 1) round.drop(round.scoopStates()[0]!.id, ON_CONE);
    const topple = round.drop(round.scoopStates()[0]!.id, ON_CONE).at(-1) as Extract<RoundCommand, { kind: 'topple' }>;
    const ids = topple.scoops.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(topple.scoops[0]!.flavour).toBe(q.wanted[0]);
    expect(round.scoopStates().some((s) => s.id === ids[0])).toBe(true);
  });

  /** Stacks the first counter scoop until the tower topples; returns the topple and the counter's peak size. */
  const toppleOnce = (round: IceCreamRound) => {
    let peak = round.scoopStates().length;
    for (let guard = 0; ; guard++) {
      if (guard > 50) throw new Error('the tower never toppled');
      const cmds = round.drop(round.scoopStates()[0]!.id, ON_CONE);
      peak = Math.max(peak, round.scoopStates().length);
      const t = cmds.find((c) => c.kind === 'topple');
      if (t) {
        round.toppled();
        return { topple: t as Extract<RoundCommand, { kind: 'topple' }>, peak };
      }
    }
  };

  it('a stacked scoop respawns only when no other scoop of its flavour is left on the counter (toppled ones included)', () => {
    const { round } = started();
    const { topple } = toppleOnce(round);
    const f = topple.scoops[0]!.flavour;
    const same = () => round.scoopStates().filter((s) => s.flavour === f);
    while (same().length > 1) expect(kinds(round.drop(same()[0]!.id, ON_CONE))).not.toContain('respawn');
    const last = same()[0]!;
    const cmds = round.drop(last.id, ON_CONE);
    expect(kinds(cmds).slice(0, 3)).toEqual(['stack', 'respawn', 'celebrate']);
    expect((cmds[1] as Extract<RoundCommand, { kind: 'respawn' }>).scoop.flavour).toBe(f);
  });

  /** A level-`level` round with `geo` played to its end, free play started. */
  const freeWith = (geo: RoundGeometry, level: number) => {
    const round = new IceCreamRound(geo, 7, level);
    round.start();
    for (let q = 0; q < round.questionCount - 1; q++) {
      answer(round);
      round.next();
    }
    answer(round);
    round.beginFreePlay();
    return round;
  };

  it('a topple at level 3 (four homes): all five fall onto the row, >= minSize apart and from the homes', () => {
    const round = freeWith(GEO, 3);
    expect(round.scoopStates()).toHaveLength(4);
    const { topple } = toppleOnce(round);
    expect(topple.scoops).toHaveLength(GEO.towerMax);
    for (const t of topple.scoops) expect(t.to.y).toBe(ROW_Y);
    expectOnRow(round);
  });

  it('a topple with the homes a few px off the 180 px grid still fits all five on the row', () => {
    const home = (slot: string) => ({ x: HOMES[slot]!.x + 3, y: ROW_Y });
    const row = tableRowFrom(Object.keys(HOMES).map(home), PLAY);
    const shifted: RoundGeometry = { ...GEO, homeCentre: home, row: () => row };
    const round = freeWith(shifted, 3);
    const { topple } = toppleOnce(round);
    expect(topple.scoops).toHaveLength(5);
    for (const t of topple.scoops) expect(t.to.y).toBe(ROW_Y);
    expectOnRow(round, row);
  });

  it('a scattered counter with fewer spots than the tower: only the top scoops fall (no overlaps), the lowest stay on the cone', () => {
    // Two homes 270 px apart on a short row; one scoop scattered between them leaves room for fewer than five.
    const homes: Record<string, Point> = { 'scoop-2': { x: 152, y: ROW_Y }, 'scoop-3': { x: 422, y: ROW_Y } };
    const row = tableRowFrom(Object.values(homes), PLAY);
    const short: RoundGeometry = { ...GEO, homeCentre: (slot) => homes[slot]!, row: () => row };
    const round = freeWith(short, 0);
    const towerAtStart = round.towerCount;
    const left = round.scoopStates().find((s) => s.at.x === 152)!;
    expect(round.drop(left.id, { x: 280, y: 700 })).toEqual([{ kind: 'rest', id: left.id, at: { x: 280, y: ROW_Y } }]);
    const stacked: string[] = [];
    let topple: Extract<RoundCommand, { kind: 'topple' }> | undefined;
    while (!topple) {
      const s = round.scoopStates()[0]!;
      stacked.push(s.id);
      topple = round.drop(s.id, ON_CONE).find((c) => c.kind === 'topple') as Extract<RoundCommand, { kind: 'topple' }> | undefined;
    }
    const fell = topple.scoops.length;
    expect(fell).toBeGreaterThan(0);
    expect(fell).toBeLessThan(GEO.towerMax);
    // The top ones fall (the last stacked, in cone order); the rest stay as the tower.
    expect(topple.scoops.map((t) => t.id)).toEqual(stacked.slice(stacked.length - fell));
    expect(round.towerCount).toBe(GEO.towerMax - fell);
    expect(towerAtStart + stacked.length).toBe(GEO.towerMax);
    expectOnRow(round, row);
  });

  it('the real layout: the row over the four home slots holds at least towerMax spots between the homes', () => {
    const layout = LAYOUTS['ice-cream'];
    const homes = HOME_SLOTS[4]!.map((id) => layout.slots[id]!);
    const row = tableRowFrom(homes, { x: 0, y: 0, w: layout.design.width, h: layout.design.height });
    expect(row.x0).toBe(Math.min(...homes.map((h) => h.x)));
    expect(row.x1).toBe(Math.max(...homes.map((h) => h.x)));
    expect(packRow(homes, Tokens.components.draggableItem.minSize, row).length).toBeGreaterThanOrEqual(Tokens.ui.iceCreamTowerMax);
  });

  it('the counter stays bounded across two topples (flavours + towerMax at most)', () => {
    const { round } = started();
    const all = new Set(round.scoopStates().map((s) => s.flavour));
    const bound = all.size + GEO.towerMax;
    const first = toppleOnce(round);
    const second = toppleOnce(round);
    expect(first.peak).toBeLessThanOrEqual(bound);
    expect(second.peak).toBeLessThanOrEqual(bound);
    expect(round.scoopStates().length).toBeLessThanOrEqual(bound);
    // Every flavour is still on the counter.
    for (const f of all) expect(round.scoopStates().some((s) => s.flavour === f)).toBe(true);
  });
});

describe('placeOnRow / packRow (the table row)', () => {
  const row: TableRow = { y: 500, x0: 100, x1: 900 };
  it('a clear x stays; an x outside the row is clamped into it', () => {
    expect(placeOnRow(300, [], 90, row)).toBe(300);
    expect(placeOnRow(20, [], 90, row)).toBe(100);
    expect(placeOnRow(990, [{ x: 500, y: 500 }], 90, row)).toBe(900);
  });
  it('a blocked x moves to the nearest clear x (either side)', () => {
    expect(placeOnRow(510, [{ x: 500, y: 500 }], 90, row)).toBe(590);
    expect(placeOnRow(490, [{ x: 500, y: 500 }], 90, row)).toBe(410);
    expect(placeOnRow(500, [{ x: 400, y: 500 }, { x: 560, y: 500 }], 90, row)).toBe(650);
  });
  it('a neighbour off the row (above it) blocks a narrower interval', () => {
    const x = placeOnRow(500, [{ x: 500, y: 446 }], 90, row)!;
    expect(Math.hypot(x - 500, 54)).toBeCloseTo(90, 9);
  });
  it('a full row → undefined', () => {
    expect(placeOnRow(150, [{ x: 150, y: 500 }], 90, { y: 500, x0: 100, x1: 200 })).toBeUndefined();
  });
  it('packRow: the most spots from the left end, each clear of the others and of each other', () => {
    const homes = [155, 335, 695, 875].map((x) => ({ x, y: 500 }));
    expect(packRow(homes, 90, { y: 500, x0: 105, x1: 920 })).toEqual([245, 425, 515, 605, 785]);
    expect(packRow([], 90, { y: 500, x0: 0, x1: 180 })).toEqual([0, 90, 180]);
  });
});

describe('tableRowFrom', () => {
  it('spans the leftmost to the rightmost home at the first home y, clamped to the play rect', () => {
    expect(tableRowFrom([{ x: 332, y: 480 }, { x: 152, y: 480 }, { x: 872, y: 480 }], PLAY)).toEqual({ y: 480, x0: 152, x1: 872 });
    expect(tableRowFrom([{ x: 10, y: 480 }, { x: 1010, y: 480 }], PLAY)).toEqual({ y: 480, x0: 24, x1: 1000 });
  });
  it('packRow with minDist <= 0 or NaN returns no spot (never loops)', () => {
    expect(packRow([], 0, ROW)).toEqual([]);
    expect(packRow([], Number.NaN, ROW)).toEqual([]);
  });
});
