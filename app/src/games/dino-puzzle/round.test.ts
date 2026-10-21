// Stories 3.3 and 3.4: the Ghép khủng long round model against fake geometry (every non-Phaser matrix
// row), plus the close-slot sweep over the real generated layout.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAY_ANCHORS, PIECES, PIECE_IDS, SPECIES, type PieceId, type SpeciesId } from '../../content/games/dino-puzzle';
import type { Point, ScreenLayout } from '../../content/layout-types';
import { HintMachine } from '../../core/hint-machine';
import { RoundTally } from '../../core/round-tally';
import { Tokens } from '../../core/tokens';
import { closeSlotPairs } from '../../../tools/layout/rules.ts';
import { roundSpecies } from './questions';
import { DinoRound, startCommands, type DinoCommand, type DinoGeometry } from './round';

const SNAP = 100;
// Slot centres like the real layout: the body's zone overlaps both others'. The 4/6-piece slots sit
// along the same ghost.
const SLOTS: Record<PieceId, Point> = {
  'head-neck': { x: 640, y: 250 },
  'body-legs': { x: 530, y: 280 },
  tail: { x: 430, y: 240 },
  front: { x: 580, y: 290 },
  back: { x: 490, y: 270 },
  head: { x: 690, y: 240 },
  neck: { x: 630, y: 250 },
  body: { x: 540, y: 250 },
  'front-legs': { x: 580, y: 330 },
  'back-legs': { x: 490, y: 320 },
};
// Trimmed sizes (design px); every one ≥ 90, so loose pieces are drawn at scale 1.
const SIZES: Partial<Record<PieceId, { w: number; h: number }>> = { 'head-neck': { w: 160, h: 90 }, 'body-legs': { w: 240, h: 120 }, tail: { w: 180, h: 90 } };
const size = (p: PieceId) => SIZES[p] ?? { w: 100, h: 90 };
const BAYS: Point[] = [
  { x: 130, y: 400 }, { x: 400, y: 400 }, { x: 650, y: 400 }, { x: 900, y: 400 },
  { x: 130, y: 620 }, { x: 400, y: 620 }, { x: 650, y: 620 }, { x: 900, y: 620 },
];

function geometry(snapScale: Partial<Record<PieceId, number>> = {}, slots: (s: SpeciesId, p: PieceId) => Point = (_s, p) => SLOTS[p]): DinoGeometry {
  return {
    bays: BAYS,
    slot: slots,
    size: (_s, p) => size(p),
    placed: (s, p) => ({ x: slots(s, p).x + 1, y: slots(s, p).y - 1 }),
    radius: (_s, p) => Math.max(size(p).w, size(p).h) / 2,
    // The scene keeps one target per cut piece of the current dino; the fake answers for the cut.
    inSlot: (p, pt) => Math.hypot(pt.x - SLOTS[p].x, pt.y - SLOTS[p].y) <= SNAP * (snapScale[p] ?? 1),
    grass: { contains: (p) => p.y >= 330 && p.y <= 760 && p.x >= 0 && p.x <= 1024 },
    restRect: () => ({ x: 24, y: 330, w: 976, h: 364 }),
    // Story 5.1: the play area; y < 80 lies outside it.
    playRect: () => ({ x: 24, y: 80, w: 976, h: 614 }),
    snapRadius: SNAP,
    offDelayMs: 1500,
    finishDelayMs: 1500,
  };
}

const kinds = (cs: readonly DinoCommand[]): string[] => cs.map((c) => c.kind);
const find = <K extends DinoCommand['kind']>(cs: readonly DinoCommand[], kind: K): Extract<DinoCommand, { kind: K }> | undefined =>
  cs.find((c): c is Extract<DinoCommand, { kind: K }> => c.kind === kind);
const near = (p: Point, dx: number, dy = 0): Point => ({ x: p.x + dx, y: p.y + dy });
/** Where piece `p` starts on dino `index` of round `r`. */
const startOf = (r: DinoRound, p: PieceId, index = 0): Point => r.starts(index)[p]!;

/** Places every piece of the open dino; returns the last drop's commands. */
function completeDino(r: DinoRound): DinoCommand[] {
  let last: DinoCommand[] = [];
  for (const p of r.pieces) if (!r.placed().includes(p)) last = r.drop(p, SLOTS[p]);
  return last;
}

describe('DinoRound — enter and drops (Story 3.3)', () => {
  it('Enter {level 0, seed 7}: the ghost of roundSpecies(7,0)[0], 3 pieces at their arranged bays, beginQuestion(ask, retry, head-neck)', () => {
    const r = new DinoRound(geometry(), 7, 0);
    const cs = r.start();
    expect(kinds(cs)).toEqual(['showDino', 'restorePieces', 'beginQuestion']);
    const b = find(cs, 'showDino')!;
    expect(b.species).toBe(roundSpecies(7, 0)[0]);
    expect(b.fade).toBe(false);
    expect(b.cut).toEqual(PIECES[3]);
    expect(b.pieces.map((p) => p.id)).toEqual(['head-neck', 'body-legs', 'tail']);
    for (const p of b.pieces) expect(BAYS).toContainEqual(p.at);
    expect(b.pieces).toEqual(PIECES[3].map((id) => ({ id, at: startOf(r, id) })));
    expect(find(cs, 'restorePieces')).toEqual({ kind: 'restorePieces', ids: [] });
    expect(find(cs, 'beginQuestion')).toEqual({ kind: 'beginQuestion', promptLineId: 'vo.dino-puzzle.ask', retryLineId: 'vo.dino-puzzle.retry', piece: 'head-neck' });
  });

  it('Own slot: body-legs dropped 80 px from its slot → snap to its frame-aligned spot, locked; stepDone(head-neck)', () => {
    const r = new DinoRound(geometry(), 7, 0);
    r.start();
    const cs = r.drop('body-legs', near(SLOTS['body-legs'], 0, 80));
    expect(cs).toEqual([
      { kind: 'snap', piece: 'body-legs', to: { x: 531, y: 279 } },
      { kind: 'stepDone', piece: 'head-neck' },
    ]);
    expect(r.placed()).toEqual(['body-legs']);
    expect(r.loosePieces().map((p) => p.id)).toEqual(['head-neck', 'tail']);
    expect(r.drop('body-legs', SLOTS['body-legs'])).toEqual([]);
  });

  it('Other slot: body-legs on the head-neck slot floats back, then wrong(); nothing placed', () => {
    const r = new DinoRound(geometry(), 7, 0);
    r.start();
    expect(r.drop('body-legs', near(SLOTS['head-neck'], 60, 0))).toEqual([
      { kind: 'floatBack', piece: 'body-legs', to: startOf(r, 'body-legs') },
      { kind: 'hintWrong' },
    ]);
    expect(r.placed()).toEqual([]);
  });

  it('Other slot includes a filled slot', () => {
    const r = new DinoRound(geometry(), 7, 0);
    r.start();
    r.drop('head-neck', SLOTS['head-neck']);
    expect(kinds(r.drop('tail', near(SLOTS['head-neck'], 60, 0)))).toEqual(['floatBack', 'hintWrong']);
  });

  it('Overlap: a point inside both its own and another slot zone snaps to its own', () => {
    const r = new DinoRound(geometry(), 7, 0);
    r.start();
    const both = { x: 585, y: 265 };
    expect(Math.hypot(both.x - SLOTS['head-neck'].x, both.y - SLOTS['head-neck'].y)).toBeLessThan(SNAP);
    expect(r.resolve('body-legs', both)).toBe('own');
    expect(find(r.drop('body-legs', both), 'snap')?.piece).toBe('body-legs');
  });

  it('An enlarged other-slot zone never turns a re-drop near home into a mistake: own and home come first', () => {
    const r = new DinoRound(geometry({ 'head-neck': 20 }), 7, 0);
    r.start();
    // The head's ×20 zone reaches the body's start; the body lifted and put back is just home.
    expect(r.resolve('body-legs', near(startOf(r, 'body-legs'), 20))).toBe('home');
  });

  it('Hinted vs other: the ring is on head-neck, the child places tail → counted; the next step stays head-neck', () => {
    const r = new DinoRound(geometry(), 7, 0);
    r.start();
    expect(find(r.drop('tail', SLOTS.tail), 'stepDone')).toEqual({ kind: 'stepDone', piece: 'head-neck' });
    expect(find(r.drop('head-neck', SLOTS['head-neck']), 'stepDone')).toEqual({ kind: 'stepDone', piece: 'body-legs' });
  });

  it('Home: lifted and dropped within 50 px → settles, no hint', () => {
    const r = new DinoRound(geometry(), 7, 0);
    r.start();
    const at = startOf(r, 'tail');
    expect(r.drop('tail', near(at, 30, 30))).toEqual([{ kind: 'floatBack', piece: 'tail', to: at }]);
  });

  it('Rest: dropped on grass away from slots → stays, nudged clear of the other loose pieces', () => {
    const r = new DinoRound(geometry(), 7, 0);
    r.start();
    const body = startOf(r, 'body-legs');
    const cs = r.drop('tail', near(body, 80));
    const rest = find(cs, 'rest')!;
    expect(kinds(cs)).toEqual(['rest']);
    // r(tail) + max r(others) = 90 + 120.
    expect(Math.hypot(rest.at.x - body.x, rest.at.y - body.y)).toBeGreaterThanOrEqual(210 - 1e-9);
    expect(r.loosePieces().find((p) => p.id === 'tail')!.at).toEqual(rest.at);
    // The new rest spot is its pre-lift position: a later wrong drop floats back there.
    expect(find(r.drop('tail', SLOTS['head-neck']), 'floatBack')!.to).toEqual(rest.at);
  });

  it('Story 5.1 mid-drag lift: dropped on the sky (inside the play rect) → rests there, no returnLater', () => {
    const r = new DinoRound(geometry(), 7, 0);
    r.start();
    const sky = { x: 900, y: 120 };
    expect(r.resolve('tail', sky)).toBe('off');
    expect(r.drop('tail', sky)).toEqual([{ kind: 'rest', piece: 'tail', at: sky }]);
    expect(r.lift('tail')).toEqual([]);
    expect(r.loosePieces().find((p) => p.id === 'tail')!.at).toEqual(sky);
    // A second piece dropped on it is pushed clear by the radius sum.
    const rest = find(r.drop('head-neck', { x: 890, y: 130 }), 'rest')!;
    expect(Math.hypot(rest.at.x - sky.x, rest.at.y - sky.y)).toBeGreaterThanOrEqual(90 - 1e-9);
  });

  it('Off the play rect → slides back after 1500 ms; a re-lift cancels', () => {
    const r = new DinoRound(geometry(), 7, 0);
    r.start();
    expect(r.drop('tail', { x: 900, y: 40 })).toEqual([{ kind: 'returnLater', piece: 'tail', to: startOf(r, 'tail'), ms: 1500 }]);
    expect(r.lift('tail')).toEqual([{ kind: 'cancelReturn', piece: 'tail' }]);
    expect(r.lift('tail')).toEqual([]);
    r.drop('tail', { x: 900, y: 40 });
    r.returned('tail');
    expect(r.lift('tail')).toEqual([]);
  });

  it('Cancel (pause mid-drag): back to the pre-lift spot', () => {
    const r = new DinoRound(geometry(), 7, 0);
    r.start();
    expect(r.cancel('head-neck')).toEqual([{ kind: 'floatBack', piece: 'head-neck', to: startOf(r, 'head-neck') }]);
  });
});

describe('DinoRound — the ladder (Story 3.4)', () => {
  it.each([
    [0, PIECES[3]],
    [1, PIECES[4]],
    [2, PIECES[6]],
    [7, PIECES[6]],
    [-1, PIECES[3]],
  ] as const)('level %i → the %j cut; 3 dinos in roundSpecies order', (level, cut) => {
    const r = new DinoRound(geometry(), 11, level);
    expect(r.pieces).toEqual(cut);
    expect(r.questionCount).toBe(3);
    expect(r.species).toEqual(roundSpecies(11, level));
    const show = find(r.start(), 'showDino')!;
    expect(show.cut).toEqual(cut);
    expect(show.pieces.map((p) => p.id)).toEqual(cut);
  });

  it('L2 head-first hint; L2 tail dropped on the head slot (> 100 px from its own) floats back with wrong()', () => {
    const r = new DinoRound(geometry(), 11, 2);
    expect(find(r.start(), 'beginQuestion')!.piece).toBe('head');
    expect(Math.hypot(SLOTS.head.x - SLOTS.tail.x, SLOTS.head.y - SLOTS.tail.y)).toBeGreaterThan(SNAP);
    expect(kinds(r.drop('tail', SLOTS.head))).toEqual(['floatBack', 'hintWrong']);
  });

  it('Close slots: L2 head dropped at the neck slot centre (60 px from its own) snaps into head', () => {
    const r = new DinoRound(geometry(), 11, 2);
    r.start();
    expect(Math.hypot(SLOTS.head.x - SLOTS.neck.x, SLOTS.head.y - SLOTS.neck.y)).toBeLessThan(SNAP);
    expect(r.resolve('head', SLOTS.neck)).toBe('own');
    expect(find(r.drop('head', SLOTS.neck), 'snap')!.piece).toBe('head');
  });
});

describe('the close-slot sweep over the real layout (Story 3.4)', () => {
  const layout = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'content', 'generated', 'dino-puzzle.layout.json'), 'utf8')) as ScreenLayout;
  const slot = (s: SpeciesId, p: PieceId): Point => layout.slots[`${s}-${p}`]!;

  it('every close pair: each piece dropped on the other slot\'s centre (inside its own zone too) snaps into its own slot', () => {
    let pairs = 0;
    for (const s of SPECIES) {
      for (const [a, b] of closeSlotPairs(layout, s, PIECES, SNAP)) {
        const pa = a.slice(s.length + 1) as PieceId;
        const pb = b.slice(s.length + 1) as PieceId;
        const level = ([0, 1, 2] as const).find((l) => {
          const cut: readonly PieceId[] = [PIECES[3], PIECES[4], PIECES[6]][l]!;
          return cut.includes(pa) && cut.includes(pb);
        })!;
        const geo: DinoGeometry = {
          ...geometry({}, slot),
          bays: BAY_ANCHORS.map((id) => layout.anchors[id]!),
          inSlot: (p, pt) => Math.hypot(pt.x - slot(s, p).x, pt.y - slot(s, p).y) <= SNAP,
        };
        for (const [piece, other] of [[pa, pb], [pb, pa]] as const) {
          const seed = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].find((k) => roundSpecies(k, level)[0] === s);
          if (seed === undefined) throw new Error(`no seed in 0…9 starts level ${level} with ${s}`);
          const r = new DinoRound(geo, seed, level);
          r.start();
          expect(r.resolve(piece, slot(s, other))).toBe('own');
          expect(find(r.drop(piece, slot(s, other)), 'snap')!.piece).toBe(piece);
          pairs += 1;
        }
      }
    }
    // The real 4/6-piece slots do sit closer than the snap radius (the rule is exercised).
    expect(pairs).toBeGreaterThan(0);
  });
});

describe('DinoRound — come alive and the round (Story 3.3)', () => {
  it('Last piece: questionDone, lock, hold, comeAlive; the name ends → the next dino fades in', () => {
    const r = new DinoRound(geometry(), 7, 0);
    r.start();
    const [s0, s1] = roundSpecies(7, 0);
    r.drop('head-neck', SLOTS['head-neck']);
    r.drop('body-legs', SLOTS['body-legs']);
    const cs = r.drop('tail', SLOTS.tail);
    expect(kinds(cs)).toEqual(['snap', 'questionDone', 'lockAll', 'holdAlive', 'comeAlive']);
    expect(find(cs, 'comeAlive')).toEqual({ kind: 'comeAlive', species: s0, callSfxId: `sfx.dino-puzzle.${s0}.happy`, nameLineId: `vo.dino-puzzle.name.${s0}`, last: false });
    expect(r.questionIndex).toBe(1);
    expect(r.stage).toBe('alive');
    // A drag still running while the dino is alive just goes back.
    expect(r.drop('tail', SLOTS.tail)).toEqual([]);
    const next = r.speechEnded('name');
    expect(kinds(next)).toEqual(['clearDino', 'holdAlive', 'showDino', 'restorePieces', 'beginQuestion']);
    expect(find(next, 'holdAlive')).toEqual({ kind: 'holdAlive', on: false });
    expect(find(next, 'showDino')).toMatchObject({ species: s1, fade: true });
    expect(find(next, 'showDino')!.pieces).toEqual(PIECES[3].map((id) => ({ id, at: startOf(r, id, 1) })));
    expect(r.speechEnded('name')).toEqual([]);
  });

  it('Round end: the third dino named → celebrate, finishRound after 1500 ms; inert after', () => {
    const r = new DinoRound(geometry(), 7, 0);
    r.start();
    completeDino(r);
    r.speechEnded('name');
    completeDino(r);
    r.speechEnded('name');
    const last = completeDino(r);
    expect(kinds(last)).toEqual(['snap', 'questionDone', 'lockAll', 'holdAlive', 'markFinishing', 'comeAlive']);
    expect(find(last, 'comeAlive')!.last).toBe(true);
    expect(r.isFinishing).toBe(true);
    expect(r.speechEnded('name')).toEqual([{ kind: 'celebrate' }, { kind: 'finishRound', afterMs: 1500 }]);
    expect(r.stage).toBe('done');
    expect(r.speechEnded('name')).toEqual([]);
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
    const apply = (cs: readonly DinoCommand[]): void => {
      for (const c of cs) {
        if (c.kind === 'beginQuestion') {
          tally.beginQuestion();
          m.beginQuestion({ promptLineId: c.promptLineId, retryLineId: c.retryLineId, step });
        } else if (c.kind === 'stepDone') m.stepDone(step);
        else if (c.kind === 'hintWrong') m.wrong();
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

  it('Tally: dino 1 clean, dino 2 one wrong, dino 3 reaches level 2 → firstTryCorrect 1, maxHintLevel 2', () => {
    const { tally, m, apply, idleTo } = harness();
    const r = new DinoRound(geometry(), 7, 0);
    apply(r.start());
    for (const p of r.pieces) apply(r.drop(p, SLOTS[p]));
    apply(r.speechEnded('name'));
    apply(r.drop('tail', SLOTS['head-neck']));
    for (const p of r.pieces) apply(r.drop(p, SLOTS[p]));
    apply(r.speechEnded('name'));
    idleTo(2);
    expect(m.level).toBe(2);
    for (const p of r.pieces) apply(r.drop(p, SLOTS[p]));
    expect(tally.outcome('dino-puzzle')).toMatchObject({ questions: 3, firstTryCorrect: 1, maxHintLevel: 2 });
  });

  it('Clean L1 round (no wrong drop) → questions 3, firstTryCorrect 3, maxHintLevel 0', () => {
    const { tally, apply } = harness();
    const r = new DinoRound(geometry(), 5, 1);
    apply(r.start());
    for (let i = 0; i < 3; i++) {
      completeDinoApplied(r, apply);
      apply(r.speechEnded('name'));
    }
    expect(tally.outcome('dino-puzzle')).toEqual({ gameId: 'dino-puzzle', questions: 3, firstTryCorrect: 3, maxHintLevel: 0 });
  });

  it('One piece at level 4: L1, one piece idles to hint 3, then wrong drops lift it to 4 → maxHintLevel 4; that dino is not first-try', () => {
    const { tally, m, apply, idleTo } = harness();
    const r = new DinoRound(geometry(), 5, 1);
    apply(r.start());
    // Idle escalation stops at level 3 (spec-1-9); level 4 comes from wrong drops.
    idleTo(3);
    expect(m.level).toBe(3);
    for (let i = 0; i < 4; i++) apply(r.drop('tail', SLOTS['head-neck']));
    expect(m.level).toBe(4);
    for (let i = 0; i < 3; i++) {
      completeDinoApplied(r, apply);
      apply(r.speechEnded('name'));
    }
    expect(tally.outcome('dino-puzzle')).toMatchObject({ questions: 3, maxHintLevel: 4, firstTryCorrect: 2 });
  });

  function completeDinoApplied(r: DinoRound, apply: (cs: readonly DinoCommand[]) => void): void {
    for (const p of r.pieces) if (!r.placed().includes(p)) apply(r.drop(p, SLOTS[p]));
  }

  it('Home mid-dino: 2 of 3 placed on dino 2 → progress {questionIndex 1, partial {placed: [2 ids]}}', () => {
    const r = new DinoRound(geometry(), 7, 0);
    r.start();
    completeDino(r);
    r.speechEnded('name');
    r.drop('tail', SLOTS.tail);
    r.drop('head-neck', SLOTS['head-neck']);
    expect(r.progress()).toEqual({ questionIndex: 1, partial: { placed: ['tail', 'head-neck'] } });
    expect(JSON.parse(JSON.stringify(r.progress()))).toEqual(r.progress());
  });

  it('During the last come-alive the round is finishing (Home completes, never abandons): progress points past the end', () => {
    const r = new DinoRound(geometry(), 7, 0);
    r.start();
    for (let i = 0; i < 3; i++) {
      completeDino(r);
      if (i < 2) r.speechEnded('name');
    }
    expect(r.isFinishing).toBe(true);
    expect(r.progress()).toEqual({ questionIndex: 3, partial: { placed: [] } });
  });
});

describe('resume (Story 3.4)', () => {
  const placed4: PieceId[] = ['body', 'tail', 'head', 'back-legs'];

  it('Home mid-dino at L2: dino 2, 4 of 6 placed → progress {questionIndex 1, placed: 4 ids}; JSON round-trips', () => {
    const r = new DinoRound(geometry(), 9, 2);
    r.start();
    completeDino(r);
    r.speechEnded('name');
    for (const p of placed4) r.drop(p, SLOTS[p]);
    const progress = r.progress();
    expect(progress).toEqual({ questionIndex: 1, partial: { placed: placed4 } });
    expect(JSON.parse(JSON.stringify(progress))).toEqual(progress);
  });

  it('Resume that snapshot: restorePieces(4 ids), the other 2 at the same arranged starts, ask replayed, ring on the first unplaced', () => {
    const before = new DinoRound(geometry(), 9, 2);
    const starts = before.starts(1);
    const r = new DinoRound(geometry(), 9, 2);
    const plan = startCommands(r, { questionIndex: 1, partial: { placed: placed4 } });
    expect(plan).toMatchObject({ accepted: true, warnings: [] });
    expect(kinds(plan.commands)).toEqual(['showDino', 'restorePieces', 'beginQuestion']);
    const show = find(plan.commands, 'showDino')!;
    expect(show).toMatchObject({ species: roundSpecies(9, 2)[1], fade: false, cut: PIECES[6] });
    expect(show.pieces).toEqual([
      { id: 'neck', at: starts.neck },
      { id: 'front-legs', at: starts['front-legs'] },
    ]);
    expect(find(plan.commands, 'restorePieces')).toEqual({ kind: 'restorePieces', ids: placed4 });
    expect(find(plan.commands, 'beginQuestion')).toEqual({ kind: 'beginQuestion', promptLineId: 'vo.dino-puzzle.ask', retryLineId: 'vo.dino-puzzle.retry', piece: 'neck' });
    // Placed order continues after the restored ones; the last piece completes the dino.
    r.drop('front-legs', SLOTS['front-legs']);
    expect(r.progress().partial.placed).toEqual([...placed4, 'front-legs']);
    expect(kinds(r.drop('neck', SLOTS.neck))).toContain('questionDone');
  });

  it.each([
    ['{}', {}],
    ["placed: 'x'", { placed: 'x' }],
    ['placed: [1]', { placed: [1] }],
    ["['wing']", { placed: ['wing'] }],
    ["['head-neck'] at L2", { placed: ['head-neck'] }],
    ['duplicates', { placed: ['head', 'head'] }],
    ['all 6 ids', { placed: [...PIECES[6]] }],
    ['null', null],
    ['an array', [['head']]],
  ])('Bad partial %s → that dino starts clean, one warning, still accepted', (_label, partial) => {
    const r = new DinoRound(geometry(), 9, 2);
    expect(r.resumeQuestion(1, partial)).toBeNull();
    const plan = startCommands(r, { questionIndex: 1, partial });
    expect(plan.accepted).toBe(true);
    expect(plan.warnings).toEqual(['dino-puzzle: bad resume partial']);
    expect(find(plan.commands, 'restorePieces')).toEqual({ kind: 'restorePieces', ids: [] });
    expect(find(plan.commands, 'showDino')!.pieces).toHaveLength(6);
    expect(r.questionIndex).toBe(1);
  });

  it('a class instance is not a plain object; extra keys are ignored', () => {
    class P {
      placed = ['head'];
    }
    const r = new DinoRound(geometry(), 9, 2);
    expect(r.resumeQuestion(0, new P())).toBeNull();
    expect(r.resumeQuestion(0, { placed: ['head'], extra: 1 })).toEqual({ placed: ['head'] });
    expect(r.resumeQuestion(0, Object.assign(Object.create(null), { placed: [] }))).toEqual({ placed: [] });
  });

  it.each([
    [0, PIECES[3]],
    [1, PIECES[4]],
    [2, PIECES[6]],
  ] as const)('level %i: each of the 10 piece ids is a valid partial exactly when the level’s cut holds it', (level, cut) => {
    const r = new DinoRound(geometry(), 9, level);
    for (const p of PIECE_IDS) expect(r.resumeQuestion(0, { placed: [p] }) !== null, p).toBe((cut as readonly PieceId[]).includes(p));
  });
});

describe('startCommands (Stories 3.3/3.4)', () => {
  it('no resume → dino 0, not accepted', () => {
    const plan = startCommands(new DinoRound(geometry(), 7, 0), null);
    expect(plan.accepted).toBe(false);
    expect(find(plan.commands, 'showDino')!.species).toBe(roundSpecies(7, 0)[0]);
  });

  it('Resume questionIndex 2 with nothing placed → dino 2 begins clean, accepted', () => {
    const r = new DinoRound(geometry(), 7, 0);
    const plan = startCommands(r, { questionIndex: 2, partial: { placed: [] } });
    expect(plan).toMatchObject({ accepted: true, warnings: [] });
    expect(find(plan.commands, 'showDino')).toMatchObject({ species: roundSpecies(7, 0)[2], fade: false });
    expect(r.placed()).toEqual([]);
    expect(r.questionIndex).toBe(2);
  });

  it.each([3, 5])('Resume out of range (questionIndex %i) → dino 0, not accepted, one warning', (qi) => {
    const r = new DinoRound(geometry(), 7, 0);
    const plan = startCommands(r, { questionIndex: qi, partial: { placed: [] } });
    expect(plan.accepted).toBe(false);
    expect(plan.warnings).toHaveLength(1);
    expect(r.questionIndex).toBe(0);
  });
});
