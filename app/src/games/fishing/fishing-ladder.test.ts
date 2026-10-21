// Story 4.4: the Câu cá ladder — size and mixed questions, 4–5 fish, the 5-fish swim log, resume, nextLevel.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FISH_COLORS, POND_HIT, SIZE_ASK_RUN_MAX, ladder, type FishSpec } from '../../content/games/fishing';
import type { Point } from '../../content/layout-types';
import { nextLevel } from '../../core/difficulty';
import { mulberry32 } from '../../core/rng';
import { isJsonOnly, makeSnapshot, readResume } from '../../core/snapshot';
import { Tokens } from '../../core/tokens';
import { nameLineId, promptLineId, retryLineId } from './lines';
import { isCorrect, questionSeed, roundQuestions, type FishQuestion } from './questions';
import { FishingRound, fishId, startCommands } from './round';
import { SwimModel } from './swim';

const APP = join(import.meta.dirname, '..', '..', '..');
const POND: Point[] = (JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', 'fishing.layout.json'), 'utf8')) as { hits: Record<string, Point[]> }).hits[POND_HIT]!;
const ATLAS = JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', 'fishing.json'), 'utf8')) as { frames: Record<string, { spriteSourceSize: { w: number; h: number } }> };
/** The rendered half body of a fish (design px). */
const half = (f: FishSpec) => {
  const ss = ATLAS.frames[`fish-${f.color}-${f.size}/swim/00`]!.spriteSourceSize;
  return { halfW: ss.w / 4, halfH: ss.h / 4 };
};
const T = { resurfaceMs: 3000, shortCelebrateMs: 600, finishDelayMs: 1500 };
const P = { x: 500, y: 400 };
const othersBalanced = (q: FishQuestion): boolean => {
  const counts = FISH_COLORS.map((c) => q.fish.filter((f) => !isCorrect(q, f) && f.color === c).length);
  const used = q.ask === 'color' ? counts.filter((_, i) => FISH_COLORS[i] !== q.color) : counts;
  return Math.max(...used) - Math.min(...used) <= 1;
};

describe('the 4-level ladder (Story 4.4)', () => {
  it('color-3 → size-3 → mixed-4 → mixed-5; fish non-decreasing in [3, 5]; questions in [3, 5]', () => {
    expect(ladder.map((l) => l.ask)).toEqual(['color', 'size', 'mixed', 'mixed']);
    expect(ladder.map((l) => l.fish)).toEqual([3, 3, 4, 5]);
    expect(ladder.map((l) => l.questions)).toEqual([3, 4, 4, 5]);
    for (let i = 1; i < ladder.length; i++) expect(ladder[i]!.fish).toBeGreaterThanOrEqual(ladder[i - 1]!.fish);
  });

  it('Size round {level 1, seed 7}: 4 size questions; 3 fish — 1 of the asked size and 2 of the other, one the correct fish’s twin', () => {
    const qs = roundQuestions(7, 1);
    expect(qs).toHaveLength(4);
    for (const q of qs) {
      expect(q.ask).toBe('size');
      if (q.ask !== 'size') continue;
      expect(q.fish).toHaveLength(3);
      const right = q.fish.filter((f) => isCorrect(q, f));
      expect(right).toHaveLength(1);
      const others = q.fish.filter((f) => !isCorrect(q, f));
      expect(others.every((f) => f.size !== q.size)).toBe(true);
      expect(others.some((f) => f.color === right[0]!.color)).toBe(true);
      expect(promptLineId(q)).toBe(`vo.fishing.prompt.size-${q.size}`);
      expect(retryLineId(q)).toBe(`vo.fishing.retry.size-${q.size}`);
    }
  });

  it('Size runs (level 1, seeds 1–500): no run longer than 2; both sizes asked in every round', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const sizes = roundQuestions(seed, 1).flatMap((q) => (q.ask === 'size' ? [q.size] : []));
      let run = 1;
      for (let i = 1; i < sizes.length; i++) {
        run = sizes[i] === sizes[i - 1] ? run + 1 : 1;
        expect(run).toBeLessThanOrEqual(SIZE_ASK_RUN_MAX);
      }
      expect(new Set(sizes).size).toBe(2);
    }
  });

  it('Mixed (levels 2/3, seeds 1–500): ≥ 1 of each kind; colour asks never repeat consecutively', () => {
    for (const level of [2, 3]) {
      for (let seed = 1; seed <= 500; seed++) {
        const qs = roundQuestions(seed, level);
        expect(qs.some((q) => q.ask === 'color')).toBe(true);
        expect(qs.some((q) => q.ask === 'size')).toBe(true);
        const colours = qs.flatMap((q) => (q.ask === 'color' ? [q.color] : []));
        for (let i = 1; i < colours.length; i++) expect(colours[i]).not.toBe(colours[i - 1]);
      }
    }
  });

  it('Fish count (every level, seeds 1–500): level.fish fish; exactly one correct; the others balanced over the colours', () => {
    ladder.forEach((lv, level) => {
      for (let seed = 1; seed <= 500; seed++) {
        for (const q of roundQuestions(seed, level)) {
          expect(q.fish).toHaveLength(lv.fish);
          expect(q.fish.filter((f) => isCorrect(q, f))).toHaveLength(1);
          expect(othersBalanced(q)).toBe(true);
        }
      }
    });
  });

  it('Determinism and Clamp: same (seed, level) → identical questions and place() positions; level 9 → level 3', () => {
    expect(roundQuestions(5, 3)).toEqual(roundQuestions(5, 3));
    expect(roundQuestions(5, 9)).toEqual(roundQuestions(5, 3));
    const q = roundQuestions(5, 3)[0]!;
    const place = () => {
      const m = new SwimModel(POND, q.fish.map((f, k) => ({ id: fishId(k), ...half(f) })), mulberry32(questionSeed(5, 0)));
      m.place();
      return m.bodies();
    };
    expect(place()).toEqual(place());
  });
});

describe('5-fish swim log (Story 4.4)', () => {
  it.each([false, true])('level 3, 600 ticks × 16 ms, seeds 1–20 (reduced %s): speed, pond, gaps; calm moves only the correct fish', (reduced) => {
    const scale = reduced ? Tokens.ui.fishReducedSpeedScale : 1;
    for (let seed = 1; seed <= 20; seed++) {
      const q = roundQuestions(seed, 3)[0]!;
      const specs = q.fish.map((f, k) => ({ id: fishId(k), ...half(f) }));
      const m = new SwimModel(POND, specs, mulberry32(questionSeed(seed, 0)), { reduced });
      m.place();
      let prev = m.bodies();
      for (let t = 0; t < 600; t++) {
        m.tick(16);
        const now = m.bodies();
        now.forEach((b, i) => {
          expect(Math.hypot(b.pos.x - prev[i]!.pos.x, b.pos.y - prev[i]!.pos.y)).toBeLessThanOrEqual(Tokens.components.fish.speedMax * scale * 0.016 + 1e-9);
          expect(m.inPond(specs[i]!, b.pos)).toBe(true);
          for (let j = i + 1; j < now.length; j++) {
            const o = now[j]!;
            expect(Math.hypot(Math.max(0, Math.abs(b.pos.x - o.pos.x) - b.halfW - o.halfW), Math.max(0, Math.abs(b.pos.y - o.pos.y) - b.halfH - o.halfH))).toBeGreaterThanOrEqual(Tokens.spacing.targetGap - 1e-9);
          }
        });
        prev = now;
      }
      const right = q.fish.findIndex((f) => isCorrect(q, f));
      m.setCalm([fishId(right)]);
      const before = m.bodies();
      m.tick(200);
      m.bodies().forEach((b, i) => {
        if (i !== right) expect(b.pos).toEqual(before[i]!.pos);
        else expect(Math.hypot(b.pos.x - before[i]!.pos.x, b.pos.y - before[i]!.pos.y)).toBeLessThanOrEqual(Tokens.components.fish.speedMax * scale * Tokens.ui.fishHintSpeedScale * 0.2 + 1e-9);
      });
    }
  });
});

describe('the round on the ladder (Story 4.4)', () => {
  const id = (q: FishQuestion, pred: (f: FishSpec) => boolean): string => fishId(q.fish.findIndex(pred));

  it('Small on big ask: tapping the twin dives with wrong(); Catch name: the correct (colour, size) is said', () => {
    for (let seed = 1; seed < 50; seed++) {
      const r = new FishingRound(T, seed, 1);
      r.start();
      const q = r.current;
      if (q.ask !== 'size') continue;
      const right = q.fish.find((f) => isCorrect(q, f))!;
      const twin = id(q, (f) => f.color === right.color && f.size !== right.size);
      expect(r.tap(twin, P)).toEqual([{ kind: 'dive', id: twin }, { kind: 'wrong' }, { kind: 'resurface', id: twin, afterMs: 3000 }]);
      const rid = id(q, (f) => isCorrect(q, f));
      r.tap(rid, P);
      expect(r.reeled(rid)[0]).toEqual({ kind: 'say', tag: 'name', id: nameLineId(right) });
      return;
    }
    throw new Error('no size question found');
  });

  it('Home at q3 (level 2) → snapshot ⊇ {v 1, level 2, seed, questionIndex 2, partial {}}; Resume → the same question; Bad partial / Bad index', () => {
    const r = new FishingRound(T, 11, 2);
    r.start();
    for (let i = 0; i < 2; i++) {
      const rid = r.correctIds()[0]!;
      r.tap(rid, P);
      r.reeled(rid);
      r.speechEnded('name');
      r.nextQuestionReady();
    }
    r.tap(r.current.fish.map((_, k) => fishId(k)).find((x) => !r.correctIds().includes(x))!, P);
    const snap = makeSnapshot<'fishing'>({ level: 2, seed: 11, tally: { questions: 2, firstTryCorrect: 2, maxHintLevel: 0 }, progress: r.progress() });
    expect(snap).toMatchObject({ v: 1, level: 2, seed: 11, questionIndex: 2, partial: {} });
    expect(isJsonOnly(snap)).toBe(true);
    const plan = startCommands(new FishingRound(T, 11, 2), readResume(JSON.parse(JSON.stringify(snap)), { level: 2, seed: 11 }));
    expect(plan).toMatchObject({ accepted: true, warnings: [] });
    expect(plan.commands[0]).toMatchObject({ kind: 'beginQuestion', index: 2, q: roundQuestions(11, 2)[2] });
    for (const partial of [{ x: 1 }, [], null]) {
      const bad = startCommands(new FishingRound(T, 11, 2), { questionIndex: 2, partial });
      expect(bad.warnings).toEqual(['fishing: bad resume partial']);
      expect(bad.commands[0]).toMatchObject({ kind: 'beginQuestion', index: 2 });
    }
    const far = startCommands(new FishingRound(T, 11, 2), { questionIndex: 9, partial: {} });
    expect(far.warnings).toHaveLength(1);
    expect(far.commands[0]).toMatchObject({ kind: 'beginQuestion', index: 0 });
  });

  it('nextLevel with the fishing ladder (4): L0 perfect → 1; L1 maxHint 4 → 0; L0 maxHint 4 → 0; L3 perfect → 3', () => {
    const n = ladder.length;
    expect(nextLevel(0, { questions: 3, firstTryCorrect: 3, maxHintLevel: 0 }, n)).toBe(1);
    expect(nextLevel(1, { questions: 4, firstTryCorrect: 3, maxHintLevel: 4 }, n)).toBe(0);
    expect(nextLevel(0, { questions: 3, firstTryCorrect: 2, maxHintLevel: 4 }, n)).toBe(0);
    expect(nextLevel(3, { questions: 5, firstTryCorrect: 5, maxHintLevel: 0 }, n)).toBe(3);
  });
});
