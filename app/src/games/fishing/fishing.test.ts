// Story 4.3: the Câu cá questions, lines, swim model and round model (every non-visual matrix row).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FISH_CAPACITY, FISH_COLORS, POND_HIT, ladder } from '../../content/games/fishing';
import type { Point } from '../../content/layout-types';
import { VOICE_LINES } from '../../content/voice-lines';
import { HintMachine } from '../../core/hint-machine';
import { mulberry32 } from '../../core/rng';
import { RoundTally } from '../../core/round-tally';
import { Tokens } from '../../core/tokens';
import { nameLineId, promptLineId, retryLineId } from './lines';
import { isCorrect, levelIndex, questionSeed, roundQuestions } from './questions';
import { FishingRound, fishId, resumeQuestion, startCommands, type FishingCommand } from './round';
import { SwimModel } from './swim';

const APP = join(import.meta.dirname, '..', '..', '..');
const POND: Point[] = (JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', 'fishing.layout.json'), 'utf8')) as { hits: Record<string, Point[]> }).hits[POND_HIT]!;
const T = { resurfaceMs: 3000, shortCelebrateMs: 600, finishDelayMs: 1500 };
const kinds = (cs: readonly FishingCommand[]): string[] => cs.map((c) => c.kind);
const ATLAS = JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', 'fishing.json'), 'utf8')) as { frames: Record<string, { spriteSourceSize: { w: number; h: number } }> };
/** The largest rendered body of a size (half extents, design px). */
const half = (size: string) => {
  const ss = Object.entries(ATLAS.frames).filter(([n]) => n.endsWith(`-${size}/swim/00`)).map(([, f]) => f.spriteSourceSize);
  return { halfW: Math.max(...ss.map((s) => s.w)) / 4, halfH: Math.max(...ss.map((s) => s.h)) / 4 };
};
const SMALL = half('small');
const BIG = half('big');

describe('roundQuestions (Story 4.3)', () => {
  it('Enter / Determinism: level 0 → 3 colour questions; 3 fish of the 3 colours; exactly one matches; consecutive colours differ', () => {
    expect(roundQuestions(7, 0)).toEqual(roundQuestions(7, 0));
    for (let seed = 0; seed < 500; seed++) {
      const qs = roundQuestions(seed, 0);
      expect(qs).toHaveLength(3);
      qs.forEach((q, i) => {
        expect(q.ask).toBe('color');
        expect(q.fish).toHaveLength(3);
        expect(new Set(q.fish.map((f) => f.color))).toEqual(new Set(FISH_COLORS));
        expect(q.fish.filter((f) => isCorrect(q, f))).toHaveLength(1);
        if (i > 0 && q.ask === 'color' && qs[i - 1]!.ask === 'color') expect(q.color).not.toBe((qs[i - 1] as { color: string }).color);
      });
    }
  });

  it('clamps the level; questionSeed is deterministic and differs per question', () => {
    expect(levelIndex(9)).toBe(ladder.length - 1);
    expect(levelIndex(-3)).toBe(0);
    expect(roundQuestions(3, -1)).toEqual(roundQuestions(3, 0));
    expect(questionSeed(7, 0)).toBe(questionSeed(7, 0));
    expect(questionSeed(7, 0)).not.toBe(questionSeed(7, 1));
  });
});

describe('fishing lines (Story 4.3)', () => {
  it('every reachable prompt, retry and name of every level (seeds 0…199) is a voice line', () => {
    const voice = new Set<string>(VOICE_LINES.map((l) => l.id));
    ladder.forEach((_l, level) => {
      for (let seed = 0; seed < 200; seed++) {
        for (const q of roundQuestions(seed, level)) {
          expect(voice.has(promptLineId(q)), promptLineId(q)).toBe(true);
          expect(voice.has(retryLineId(q)), retryLineId(q)).toBe(true);
          for (const f of q.fish) expect(voice.has(nameLineId(f)), nameLineId(f)).toBe(true);
        }
      }
    });
    expect(promptLineId({ ask: 'color', color: 'blue', fish: [] })).toBe('vo.fishing.prompt.color-blue');
    expect(nameLineId({ color: 'orange', size: 'big' })).toBe('vo.fishing.name.orange-big');
  });
});

describe('SwimModel (Story 4.3)', () => {
  const rectInPond = (m: SwimModel, b: { pos: Point; halfW: number; halfH: number }) =>
    m.inPond({ id: 'x', halfW: b.halfW, halfH: b.halfH }, b.pos);
  const gap = (a: { pos: Point; halfW: number; halfH: number }, b: { pos: Point; halfW: number; halfH: number }) =>
    Math.hypot(Math.max(0, Math.abs(a.pos.x - b.pos.x) - a.halfW - b.halfW), Math.max(0, Math.abs(a.pos.y - b.pos.y) - a.halfH - b.halfH));

  it('Swim: 600 ticks of 16 ms → every step ≤ 60 px/s × dt; every body inside the pond; gaps ≥ 24', () => {
    const m = new SwimModel(POND, [{ id: 'a', ...SMALL }, { id: 'b', ...BIG }, { id: 'c', ...SMALL }], mulberry32(questionSeed(7, 0)));
    m.place();
    let prev = m.bodies();
    for (let t = 0; t < 600; t++) {
      m.tick(16);
      const now = m.bodies();
      now.forEach((b, i) => {
        expect(Math.hypot(b.pos.x - prev[i]!.pos.x, b.pos.y - prev[i]!.pos.y)).toBeLessThanOrEqual(Tokens.components.fish.speedMax * 0.016 + 1e-9);
        expect(rectInPond(m, b)).toBe(true);
        for (let j = i + 1; j < now.length; j++) expect(gap(b, now[j]!)).toBeGreaterThanOrEqual(Tokens.spacing.targetGap - 1e-9);
      });
      prev = now;
    }
  });

  it('Capacity: 5 big fish fit for seeds 1–50; the same seed gives the same start', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const m = new SwimModel(POND, Array.from({ length: FISH_CAPACITY }, (_, k) => ({ id: fishId(k), ...BIG })), mulberry32(seed));
      expect(() => m.place()).not.toThrow();
    }
    const a = new SwimModel(POND, [{ id: 'a', ...SMALL }], mulberry32(5));
    const b = new SwimModel(POND, [{ id: 'a', ...SMALL }], mulberry32(5));
    a.place();
    b.place();
    expect(a.bodies()).toEqual(b.bodies());
  });

  it('setCalm: only the listed fish move (at half speed); [] stops all; dive stops a fish and hides it from candidates', () => {
    const m = new SwimModel(POND, [{ id: 'a', ...SMALL }, { id: 'b', ...SMALL }], mulberry32(3));
    m.place();
    m.setCalm(['a']);
    const b0 = m.position('b')!;
    m.tick(100);
    expect(m.position('b')).toEqual(b0);
    m.setCalm([]);
    const a0 = m.position('a')!;
    m.tick(100);
    expect(m.position('a')).toEqual(a0);
    m.setCalm(null);
    m.dive('a');
    m.tick(100);
    expect(m.position('a')).toEqual(a0);
    m.record(0);
    expect(m.candidates(0, 0).map((c) => c.id)).toEqual(['b']);
    m.resurface('a');
    expect(m.candidates(0, 0).map((c) => c.id)).toEqual(['a', 'b']);
  });
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
  const step = { correct: [], distractors: [], target: null, action: 'tap' as const };
  const apply = (cs: readonly FishingCommand[]): void => {
    for (const c of cs) {
      if (c.kind === 'beginQuestion') {
        tally.beginQuestion();
        m.beginQuestion({ promptLineId: c.promptLineId, retryLineId: c.retryLineId, step });
      } else if (c.kind === 'wrong') m.wrong();
      else if (c.kind === 'questionDone') {
        tally.questionDone();
        m.questionDone();
      }
    }
  };
  return { tally, m, apply };
}

describe('FishingRound (Story 4.3)', () => {
  const P = { x: 500, y: 400 };
  const right = (r: FishingRound): string => r.correctIds()[0]!;
  const wrongId = (r: FishingRound): string => r.current.fish.map((_, k) => fishId(k)).find((id) => id !== right(r))!;

  it('Enter {level 0, seed 7}: beginQuestion with question 0 and its prompt/retry; one correct id', () => {
    const r = new FishingRound(T, 7, 0);
    const [c] = r.start();
    const q = roundQuestions(7, 0)[0]!;
    expect(c).toEqual({ kind: 'beginQuestion', index: 0, q, promptLineId: promptLineId(q), retryLineId: retryLineId(q) });
    expect(r.correctIds()).toHaveLength(1);
  });

  it('Water: a ripple at the tap, never wrong; Wrong fish: dive → wrong → resurface after 3000 ms', () => {
    const r = new FishingRound(T, 7, 0);
    r.start();
    expect(r.tap(null, P)).toEqual([{ kind: 'ripple', at: P }]);
    const w = wrongId(r);
    expect(r.tap(w, P)).toEqual([{ kind: 'dive', id: w }, { kind: 'wrong' }, { kind: 'resurface', id: w, afterMs: 3000 }]);
  });

  it('Correct: questionDone → lock → catch; Locked taps do nothing; reeled → name + jump + happy; next after 600 ms', () => {
    const r = new FishingRound(T, 7, 0);
    r.start();
    const id = right(r);
    const f = r.current.fish[Number(id.slice(5))]!;
    expect(r.tap(id, P)).toEqual([{ kind: 'questionDone' }, { kind: 'lock' }, { kind: 'catch', id }]);
    expect(r.tap(null, P)).toEqual([]);
    expect(r.tap(id, P)).toEqual([]);
    expect(r.questionIndex).toBe(1);
    expect(r.reeled(id)).toEqual([{ kind: 'say', tag: 'name', id: nameLineId(f) }, { kind: 'jump', id }, { kind: 'happy' }]);
    expect(r.speechEnded('name')).toEqual([{ kind: 'nextQuestion', afterMs: 600 }]);
    expect(kinds(r.nextQuestionReady())).toEqual(['beginQuestion']);
    expect(r.questionIndex).toBe(1);
  });

  it('Last question: the 3rd catch marks finishing; its name ends → finishRound after 1500 ms; inert after', () => {
    const r = new FishingRound(T, 7, 0);
    r.start();
    for (let i = 0; i < 2; i++) {
      const id = right(r);
      r.tap(id, P);
      r.reeled(id);
      r.speechEnded('name');
      r.nextQuestionReady();
    }
    const id = right(r);
    expect(kinds(r.tap(id, P))).toEqual(['questionDone', 'lock', 'markFinishing', 'catch']);
    r.reeled(id);
    expect(r.speechEnded('name')).toEqual([{ kind: 'finishRound', afterMs: 1500 }]);
    expect(r.stage).toBe('done');
    expect(r.nextQuestionReady()).toEqual([]);
    expect(r.progress()).toEqual({ questionIndex: 3, partial: {} });
  });

  it('Tally: q1 clean; q2 one wrong fish; q3 water taps only → firstTryCorrect 2, maxHintLevel 1', () => {
    const { tally, apply } = harness();
    const r = new FishingRound(T, 7, 0);
    const catchIt = (): void => {
      const id = right(r);
      apply(r.tap(id, P));
      apply(r.reeled(id));
      apply(r.speechEnded('name'));
      apply(r.nextQuestionReady());
    };
    apply(r.start());
    catchIt();
    apply(r.tap(wrongId(r), P));
    catchIt();
    apply(r.tap(null, P));
    apply(r.tap(null, P));
    catchIt();
    expect(tally.outcome('fishing')).toEqual({ gameId: 'fishing', questions: 3, firstTryCorrect: 2, maxHintLevel: 1 });
  });

  it('Home mid-question → {questionIndex 1, partial {}}; Resume index 1 → the same question; bad index 7 → question 0 with one warning', () => {
    const r = new FishingRound(T, 7, 0);
    r.start();
    const id = right(r);
    r.tap(id, P);
    r.reeled(id);
    r.speechEnded('name');
    r.nextQuestionReady();
    expect(r.progress()).toEqual({ questionIndex: 1, partial: {} });
    const again = new FishingRound(T, 7, 0);
    const plan = startCommands(again, { questionIndex: 1, partial: {} });
    expect(plan).toMatchObject({ accepted: true, warnings: [] });
    expect(plan.commands[0]).toMatchObject({ kind: 'beginQuestion', index: 1, q: roundQuestions(7, 0)[1] });
    const bad = startCommands(new FishingRound(T, 7, 0), { questionIndex: 7, partial: {} });
    expect(bad.accepted).toBe(false);
    expect(bad.warnings).toHaveLength(1);
    expect(bad.commands[0]).toMatchObject({ kind: 'beginQuestion', index: 0 });
    expect(resumeQuestion({})).toEqual({});
    expect(resumeQuestion({ caught: 1 })).toBeNull();
  });
});
