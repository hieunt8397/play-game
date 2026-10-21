// Stories 4.1, 4.2: the Đường đua road list and round model (every round row of the matrix).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ladder } from '../../content/games/race';
import { HintMachine } from '../../core/hint-machine';
import { RoundTally } from '../../core/round-tally';
import { Tokens } from '../../core/tokens';
import { nextLevel } from '../../core/difficulty';
import { isJsonOnly, makeSnapshot, readResume } from '../../core/snapshot';
import { levelIndex, roundRoads } from './questions';
import { RaceRound, resumeQuestion, startCommands, type RaceCommand } from './round';

/** A road of 400 samples: a resume may restore up to index 397. */
const T = { activityPx: 120, shortCelebrateMs: 1000, finishDelayMs: 1500, step: 4, maxTraceIndex: () => 397 };
const kinds = (cs: readonly RaceCommand[]): string[] => cs.map((c) => c.kind);

describe('roundRoads (Story 4.1)', () => {
  it('Determinism: same (seed, level) → the same road list; 3 straight roads, never two equal in a row', () => {
    expect(roundRoads(7, 0)).toEqual(roundRoads(7, 0));
    const seen = new Set<string>();
    for (let seed = 0; seed < 1000; seed++) {
      const r = roundRoads(seed, 0);
      expect(r).toHaveLength(3);
      r.forEach((id, i) => {
        expect(ladder[0]!.pathIds).toContain(id);
        if (i > 0) expect(id).not.toBe(r[i - 1]);
        seen.add(id);
      });
    }
    expect(seen).toEqual(new Set(ladder[0]!.pathIds));
  });

  it('clamps the level and handles a non-finite seed', () => {
    expect(levelIndex(5)).toBe(3);
    expect(levelIndex(-1)).toBe(0);
    expect(roundRoads(3, 5)).toEqual(roundRoads(3, 3));
    expect(roundRoads(Number.NaN, 0)).toEqual(roundRoads(0, 0));
  });
});

describe('RaceRound (Story 4.1)', () => {
  it('Enter {level 0, seed 7}: beginRoad 0 with the first road, then beginQuestion(prompt, retry)', () => {
    const r = new RaceRound(T, 7, 0);
    expect(r.start()).toEqual([
      { kind: 'beginRoad', index: 0, pathId: roundRoads(7, 0)[0] },
      { kind: 'beginQuestion', promptLineId: 'vo.race.prompt', retryLineId: 'vo.race.retry' },
    ]);
  });

  it('Hint activity: one hintActivity per ≥ 120 px traced', () => {
    const r = new RaceRound(T, 7, 0);
    r.start();
    expect(r.progressed(60)).toEqual([]);
    expect(r.progressed(130)).toEqual([{ kind: 'hintActivity' }]);
    expect(r.progressed(200)).toEqual([]);
    expect(r.progressed(250)).toEqual([{ kind: 'hintActivity' }]);
  });

  it('Arrive (not the last road): questionDone → lockTrace → short celebration → nextRoad after 1000 ms; then the next road', () => {
    const r = new RaceRound(T, 7, 0);
    r.start();
    const a = r.arrived();
    expect(a).toEqual([{ kind: 'questionDone' }, { kind: 'lockTrace' }, { kind: 'celebrate', final: false }, { kind: 'nextRoad', afterMs: 1000 }]);
    expect(r.arrived()).toEqual([]);
    expect(r.progressed(500)).toEqual([]);
    expect(r.progress(37)).toEqual({ questionIndex: 1, partial: { traceIndex: 0 } });
    expect(kinds(r.nextRoadReady())).toEqual(['beginRoad', 'beginQuestion']);
    expect(r.questionIndex).toBe(1);
    expect(r.nextRoadReady()).toEqual([]);
  });

  it('Last road: final celebration, markFinishing, finishRound after 1500 ms; inert after', () => {
    const r = new RaceRound(T, 7, 0);
    r.start();
    r.arrived();
    r.nextRoadReady();
    r.arrived();
    r.nextRoadReady();
    expect(r.arrived()).toEqual([{ kind: 'questionDone' }, { kind: 'lockTrace' }, { kind: 'celebrate', final: true }, { kind: 'markFinishing' }, { kind: 'finishRound', afterMs: 1500 }]);
    expect(r.stage).toBe('done');
    expect(r.isFinishing).toBe(true);
    expect(r.nextRoadReady()).toEqual([]);
    expect(r.arrived()).toEqual([]);
  });

  it('Home mid-road at index 1 → progress {questionIndex 1, partial {traceIndex}}; JSON round-trips', () => {
    const r = new RaceRound(T, 7, 0);
    r.start();
    r.arrived();
    r.nextRoadReady();
    expect(r.progress(87)).toEqual({ questionIndex: 1, partial: { traceIndex: 87 } });
    expect(JSON.parse(JSON.stringify(r.progress(87)))).toEqual(r.progress(87));
  });

  it('Resume questionIndex 1 → road 1 from its start, accepted; bad index 7 → road 0 with one warning', () => {
    const r = new RaceRound(T, 7, 0);
    const plan = startCommands(r, { questionIndex: 1, partial: { traceIndex: 0 } });
    expect(plan).toMatchObject({ accepted: true, warnings: [] });
    expect(plan.commands[0]).toEqual({ kind: 'beginRoad', index: 1, pathId: roundRoads(7, 0)[1] });
    for (const bad of [7, -1, 1.5]) {
      const q = new RaceRound(T, 7, 0);
      const p = startCommands(q, { questionIndex: bad });
      expect(p.accepted).toBe(false);
      expect(p.warnings).toHaveLength(1);
      expect(p.commands[0]).toMatchObject({ kind: 'beginRoad', index: 0 });
    }
    expect(startCommands(new RaceRound(T, 7, 0), null)).toMatchObject({ accepted: false, warnings: [] });
  });

  it('Tally: road 1 clean, road 2 idles to level 2 (tracing never escalates), road 3 clean → firstTryCorrect 2, maxHintLevel 2; never wrong', () => {
    const tally = new RoundTally();
    let token = 0;
    const m = new HintMachine({
      audio: { say: () => ++token, setPrompt: () => undefined },
      guard: { setPickable: () => undefined, setSnapScale: () => undefined, isDragging: () => false },
      visuals: { ring: () => undefined, hand: () => undefined, clearHand: () => undefined, dim: () => undefined },
      emitLevel: (l) => tally.level(l),
    });
    const step = { correct: [], distractors: [], target: null, action: 'trace' as const };
    const apply = (cs: readonly RaceCommand[]): void => {
      for (const c of cs) {
        if (c.kind === 'beginQuestion') {
          tally.beginQuestion();
          m.beginQuestion({ promptLineId: c.promptLineId, retryLineId: c.retryLineId, step });
        } else if (c.kind === 'hintActivity') m.stepDone(step);
        else if (c.kind === 'questionDone') {
          tally.questionDone();
          m.questionDone();
        }
      }
    };
    const tickFor = (ms: number, s?: (t: number) => number): void => {
      if (m.awaitedToken !== undefined) m.speechEnded(m.awaitedToken);
      for (let t = 0; t < ms; t += Tokens.Timing.hintTickMs) {
        m.tick(Tokens.Timing.hintTickMs);
        if (m.awaitedToken !== undefined) m.speechEnded(m.awaitedToken);
        if (s) apply(r.progressed(s(t)));
      }
    };
    const r = new RaceRound(T, 7, 0);
    apply(r.start());
    // Road 1: a slow tracer (40 px/s) for 20 s never gets a ring.
    tickFor(20_000, (t) => (t / 1000) * 40);
    expect(m.level).toBe(0);
    apply(r.arrived());
    apply(r.nextRoadReady());
    // Road 2: idle until level 2.
    for (let i = 0; i < 1000 && m.level < 2; i++) tickFor(Tokens.Timing.hintTickMs);
    expect(m.level).toBe(2);
    apply(r.arrived());
    apply(r.nextRoadReady());
    apply(r.arrived());
    expect(tally.outcome('race')).toEqual({ gameId: 'race', questions: 3, firstTryCorrect: 2, maxHintLevel: 2 });
  });
});

describe('Story 4.2 — the shape ladder, resume, difficulty', () => {
  it('Ladder: every level over 200 seeds → `roads` ids of its shape, no two consecutive equal, deterministic', () => {
    ladder.forEach((lv, level) => {
      for (let seed = 0; seed < 200; seed++) {
        const r = roundRoads(seed, level);
        expect(r).toHaveLength(lv.roads);
        expect(r).toEqual(roundRoads(seed, level));
        r.forEach((id, i) => {
          expect(lv.pathIds).toContain(id);
          if (i > 0) expect(id).not.toBe(r[i - 1]);
        });
      }
    });
    const z = roundRoads(7, 2);
    expect(z).toHaveLength(4);
    for (const id of z) expect(id).toMatch(/^zigzag-[123]$/);
    expect(roundRoads(7, 9)).toEqual(roundRoads(7, 3));
    expect(levelIndex(9)).toBe(3);
  });

  it('Home at 60 % of road 2 → snapshot ⊇ {v 1, level, seed, questionIndex 1, partial {traceIndex}}; plain JSON', () => {
    const r = new RaceRound(T, 7, 2);
    r.start();
    r.arrived();
    r.nextRoadReady();
    const s = 0.6 * 1600;
    const snap = makeSnapshot<'race'>({ level: 2, seed: 7, tally: { questions: 1, firstTryCorrect: 1, maxHintLevel: 0 }, progress: r.progress(Math.floor(s / 4)) });
    expect(snap).toMatchObject({ v: 1, level: 2, seed: 7, questionIndex: 1, partial: { traceIndex: 240 } });
    expect(isJsonOnly(snap)).toBe(true);
  });

  it('Resume: road 2 restored at traceIndex 240 (kart waiting), no hintActivity from the restore; Home at once keeps the same traceIndex', () => {
    const resumeAt = readResume({ v: 1, level: 2, seed: 7, questionIndex: 1, partial: { traceIndex: 240 }, tally: { questions: 1, firstTryCorrect: 1, maxHintLevel: 0 } }, { level: 2, seed: 7 });
    const r = new RaceRound(T, 7, 2);
    const plan = startCommands(r, resumeAt);
    expect(plan).toMatchObject({ accepted: true, warnings: [] });
    expect(plan.commands).toEqual([
      { kind: 'beginRoad', index: 1, pathId: roundRoads(7, 2)[1], restoreIndex: 240 },
      { kind: 'beginQuestion', promptLineId: 'vo.race.prompt', retryLineId: 'vo.race.retry' },
    ]);
    // The restored arc (960) is the activity baseline: the first tick after the restore is no activity.
    expect(r.progressed(964)).toEqual([]);
    expect(r.progressed(1080)).toEqual([{ kind: 'hintActivity' }]);
    expect(new RaceRound(T, 7, 2).progress(240)).toEqual({ questionIndex: 0, partial: { traceIndex: 240 } });
    expect(r.progress(240)).toEqual({ questionIndex: 1, partial: { traceIndex: 240 } });
  });

  it('Resume at 0 → that road clean (no restoreIndex), no warning', () => {
    const plan = startCommands(new RaceRound(T, 7, 2), { questionIndex: 1, partial: { traceIndex: 0 } });
    expect(plan).toMatchObject({ accepted: true, warnings: [] });
    expect(plan.commands[0]).toEqual({ kind: 'beginRoad', index: 1, pathId: roundRoads(7, 2)[1] });
  });

  it.each([[{ traceIndex: -1 }], [{ traceIndex: 2.5 }], [{ traceIndex: '9' }], [{ traceIndex: 398 }], [{}], [null], [[]]])('Bad partial %j → that road clean, one warning', (partial) => {
    const plan = startCommands(new RaceRound(T, 7, 2), { questionIndex: 1, partial });
    expect(plan.accepted).toBe(true);
    expect(plan.warnings).toEqual(['race: bad resume partial']);
    expect(plan.commands[0]).toEqual({ kind: 'beginRoad', index: 1, pathId: roundRoads(7, 2)[1] });
  });

  it('resumeQuestion: an integer within [0, max] only', () => {
    expect(resumeQuestion({ traceIndex: 397 }, 397)).toEqual({ traceIndex: 397 });
    expect(resumeQuestion({ traceIndex: 398 }, 397)).toBeNull();
    expect(resumeQuestion({ traceIndex: 0 }, 397)).toEqual({ traceIndex: 0 });
    expect(resumeQuestion(undefined, 397)).toBeNull();
  });

  it('nextLevel with the race ladder (4): L2 perfect → 3; L2 maxHint 3 → 2; L3 perfect → 3', () => {
    expect(ladder).toHaveLength(4);
    expect(nextLevel(2, { questions: 4, firstTryCorrect: 4, maxHintLevel: 0 }, ladder.length)).toBe(3);
    expect(nextLevel(2, { questions: 4, firstTryCorrect: 3, maxHintLevel: 3 }, ladder.length)).toBe(2);
    expect(nextLevel(3, { questions: 3, firstTryCorrect: 3, maxHintLevel: 0 }, ladder.length)).toBe(3);
  });

  it('source scan: no file under src/games/race calls .wrong( (the race is never wrong; maxHintLevel ≤ 3)', () => {
    const dir = join(import.meta.dirname);
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
      expect(readFileSync(join(dir, f), 'utf8').includes('.wrong('), f).toBe(false);
    }
  });
});
