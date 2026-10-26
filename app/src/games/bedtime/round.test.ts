// Story 7.4: the bedtime controller (pure): any order, idempotent steps, the suggestion, the ending, the roll, resume.
import { describe, expect, it } from 'vitest';
import { GOODNIGHT_LINE, INVITE_LINE, SFX, STEP_LINES, type BedtimeStep } from '../../content/games/bedtime';
import { Tokens } from '../../core/tokens';
import { createBedtimeController, defaultBedtimeTimings, nextSuggested, restPose, resumeBedtime, type BedtimeController } from './round';

const T = defaultBedtimeTimings();

function make(resume: BedtimeStep[] | null = null) {
  const log: string[] = [];
  const poses: string[] = [];
  let allDone = 0;
  const c = createBedtimeController({
    stepLines: STEP_LINES,
    goodnightLine: GOODNIGHT_LINE,
    inviteLine: INVITE_LINE,
    sounds: SFX,
    resume,
    audio: {
      sfx: (id) => void log.push(`sfx:${id}`),
      say: (id) => {
        log.push(`say:${id}`);
        return 1;
      },
      sayChain: (ids) => {
        log.push(`chain:${ids.join('+')}`);
        return 1;
      },
      setPrompt: (id) => void log.push(`prompt:${id}`),
      startLullaby: () => void log.push('lullaby'),
    },
    view: {
      glow: (s) => void log.push(`glow:${s}`),
      pose: (p, ms) => {
        poses.push(p);
        log.push(`pose:${p}:${ms}`);
      },
      brush: (at) => void log.push(`brush:${at}`),
      lamp: (on, ms) => void log.push(`lamp:${on}:${ms}`),
      night: (ms) => void log.push(`night:${ms}`),
      blanket: (on, ms) => void log.push(`blanket:${on}:${ms}`),
      repeat: (s) => void log.push(`repeat:${s}`),
      nudge: () => void log.push('nudge'),
      stars: () => void log.push('stars'),
      z: () => void log.push('z'),
    },
    onAllDone: () => void allDone++,
  });
  return { c, log, poses, allDone: () => allDone };
}

/** Advances the scene clock by `ms` in 50 ms frames. */
function run(c: BedtimeController, ms: number): void {
  for (let t = 0; t < ms; t += 50) c.tick(50);
}

/** Ticks until the controller is free (and the next suggestion is out). */
function settle(c: BedtimeController, extra = T.stepGapMs + 50): void {
  for (let i = 0; i < 400 && c.busy; i++) c.tick(100);
  for (let ms = 0; ms < extra; ms += 50) c.tick(50);
}

describe('bedtime round (Story 7.4)', () => {
  it('suggests brush → lamp → blanket (the first not done); the sleeping pose once all are done', () => {
    expect(nextSuggested([])).toBe('brush');
    expect(nextSuggested(['brush'])).toBe('lamp');
    expect(nextSuggested(['lamp'])).toBe('brush');
    expect(nextSuggested(['brush', 'lamp', 'blanket'])).toBeUndefined();
    expect(restPose([])).toBe('sit');
    expect(restPose(['blanket'])).toBe('lie');
    expect(restPose(['lamp', 'blanket', 'brush'])).toBe('sleep');
  });

  it('start: Shiba sits, the lamp is on, the glow on the brush, the invitation chained before its soft line (the Speaker prompt)', () => {
    const { c, log } = make();
    c.start();
    expect(log).toEqual(['pose:sit:0', 'blanket:false:0', 'lamp:true:0', 'glow:brush', `chain:${INVITE_LINE}+${STEP_LINES.brush}`, `prompt:${STEP_LINES.brush}`]);
    expect(c.suggested).toBe('brush');
  });

  it('brush first: it travels, scrubs with foam and a giggle, then the glow moves to the lamp', () => {
    const { c, log, poses } = make();
    c.start();
    log.length = 0;
    expect(c.tap('brush')).toBe(true);
    expect(log).toEqual(['glow:null', 'brush:sit']);
    run(c, T.brushMoveMs);
    expect(log).toContain(`sfx:${SFX.scrub}`);
    expect(log).toContain(`sfx:${SFX.giggle}`);
    expect(poses.at(-1)).toBe('brush');
    settle(c);
    expect(poses.at(-1)).toBe('sit');
    expect(c.suggested).toBe('lamp');
    expect(log.slice(-3)).toEqual(['glow:lamp', `say:${STEP_LINES.lamp}`, `prompt:${STEP_LINES.lamp}`]);
    expect(log.some((l) => l.includes('fail') || l.includes('wrong'))).toBe(false);
  });

  it('the lamp clicks off and the night fades slowly (≥ 1.5 s, never at once)', () => {
    const { c, log } = make();
    c.start();
    c.tap('lamp');
    expect(log).toContain(`sfx:${SFX.click}`);
    expect(log).toContain(`lamp:false:${T.lampMs}`);
    expect(log).toContain(`night:${T.nightFadeMs}`);
    expect(T.nightFadeMs).toBeGreaterThanOrEqual(1500);
  });

  it('blanket first: Shiba lies covered and yawns, then stays awake lying; the glow suggests the brush', () => {
    const { c, poses } = make();
    c.start();
    c.tap('blanket');
    run(c, T.blanketMs);
    expect(poses.at(-1)).toBe('yawn');
    settle(c);
    expect(poses.at(-1)).toBe('lie');
    expect(c.asleep).toBe(false);
    expect(c.suggested).toBe('brush');
  });

  it('brushing a lying Shiba scrubs at its lying mouth with the lying giggle', () => {
    const { c, log, poses } = make(['blanket']);
    c.start();
    c.tap('brush');
    expect(log).toContain('brush:lie');
    run(c, T.brushMoveMs);
    expect(poses.at(-1)).toBe('lie-brush');
    settle(c);
    expect(poses.at(-1)).toBe('lie');
  });

  it('a repeat tap on a done step is a small reaction only (no state change, no second step)', () => {
    const { c, log } = make();
    c.start();
    c.tap('lamp');
    settle(c);
    log.length = 0;
    expect(c.tap('lamp')).toBe(true);
    expect(log).toEqual(['repeat:lamp']);
    expect(c.done).toEqual(['lamp']);
    settle(c, 0);
    c.tap('blanket');
    settle(c);
    log.length = 0;
    c.tap('blanket');
    expect(log).toEqual(['repeat:blanket', `sfx:${SFX.blanket}`]);
    expect(c.done).toEqual(['lamp', 'blanket']);
  });

  it('taps are ignored while a step reacts (calm pace)', () => {
    const { c } = make();
    c.start();
    c.tap('brush');
    expect(c.tap('lamp')).toBe(false);
    expect(c.tap('shiba')).toBe(false);
    expect(c.done).toEqual(['brush']);
  });

  it('awake Shiba tapped: a happy nudge with a giggle', () => {
    const { c, log } = make();
    c.start();
    log.length = 0;
    c.tap('shiba');
    expect(log).toEqual(['nudge', `sfx:${SFX.giggle}`]);
  });

  for (const order of [
    ['brush', 'lamp', 'blanket'],
    ['blanket', 'lamp', 'brush'],
    ['lamp', 'blanket', 'brush'],
    ['lamp', 'brush', 'blanket'],
  ] as BedtimeStep[][]) {
    it(`any order completes (${order.join(' → ')}): onAllDone once at the third tap, then goodnight, stars, lullaby, sleep, snores`, () => {
      const { c, log, poses, allDone } = make();
      c.start();
      for (const s of order.slice(0, 2)) {
        c.tap(s);
        settle(c);
      }
      expect(allDone()).toBe(0);
      c.tap(order[2]!);
      expect(allDone()).toBe(1);
      settle(c, 200);
      expect(c.asleep).toBe(true);
      expect(poses.at(-1)).toBe('sleep');
      expect(log).toContain(`say:${GOODNIGHT_LINE}`);
      expect(log).toContain('stars');
      expect(log.filter((l) => l === 'lullaby')).toHaveLength(1);
      // Shiba yawns before it sleeps, whichever step came last.
      expect(poses.lastIndexOf('yawn')).toBeGreaterThan(-1);
      expect(poses.lastIndexOf('yawn')).toBeLessThan(poses.lastIndexOf('sleep'));
      // Snores with a floating z, one every snoreEveryMs.
      const zs = (): number => log.filter((l) => l === 'z').length;
      const before = zs();
      expect(before).toBeGreaterThanOrEqual(1);
      for (let ms = 0; ms < 2 * T.snoreEveryMs; ms += 100) c.tick(100);
      expect(zs() - before).toBe(2);
      expect(log.filter((l) => l === `sfx:${SFX.snore}`)).toHaveLength(zs());
      expect(allDone()).toBe(1);
      // No new suggestion after the ending.
      expect(c.suggested).toBeUndefined();
    });
  }

  it('the sleeping Shiba rolls over and back on each tap, with a soft sigh', () => {
    const { c, log, poses } = make(['brush', 'lamp']);
    c.start();
    c.tap('blanket');
    settle(c, 200);
    expect(c.asleep).toBe(true);
    log.length = 0;
    c.tap('shiba');
    expect(poses.at(-1)).toBe('roll');
    expect(log).toContain(`sfx:${SFX.sigh}`);
    settle(c, 0);
    c.tap('shiba');
    expect(poses.at(-1)).toBe('sleep');
  });

  it('stop (Home): nothing more happens', () => {
    const { c, log } = make(['brush', 'lamp']);
    c.start();
    c.tap('blanket');
    c.stop();
    log.length = 0;
    for (let ms = 0; ms < 20000; ms += 100) c.tick(100);
    expect(c.tap('shiba')).toBe(false);
    expect(log).toEqual([]);
  });

  it('resume: the same steps done at once (lamp off, night, blanket on, lying), the next step suggested', () => {
    const { c, log } = make(['lamp', 'blanket']);
    c.start();
    expect(log).toEqual(['pose:lie:0', 'blanket:true:0', 'lamp:false:0', 'night:0', 'glow:brush', `say:${STEP_LINES.brush}`, `prompt:${STEP_LINES.brush}`]);
    expect(c.done).toEqual(['lamp', 'blanket']);
  });

  it('resumeBedtime accepts only distinct known steps, fewer than all, at question 0', () => {
    expect(resumeBedtime(null)).toBeNull();
    expect(resumeBedtime({ questionIndex: 0, partial: { done: ['lamp'] } })).toEqual(['lamp']);
    expect(resumeBedtime({ questionIndex: 0, partial: { done: [] } })).toEqual([]);
    expect(resumeBedtime({ questionIndex: 1, partial: { done: ['lamp'] } })).toBeNull();
    expect(resumeBedtime({ questionIndex: 0, partial: { done: ['lamp', 'lamp'] } })).toBeNull();
    expect(resumeBedtime({ questionIndex: 0, partial: { done: ['bath'] } })).toBeNull();
    expect(resumeBedtime({ questionIndex: 0, partial: { done: ['brush', 'lamp', 'blanket'] } })).toBeNull();
    expect(resumeBedtime({ questionIndex: 0, partial: [] })).toBeNull();
  });

  it('every tween is calm (≥ 600 ms), the controller timings and the scene motions alike', () => {
    for (const k of ['brushMoveMs', 'scrubMs', 'poseFadeMs', 'lampMs', 'nightFadeMs', 'blanketMs', 'repeatMs', 'rollMs'] as const) expect(T[k], k).toBeGreaterThanOrEqual(600);
    // Review: the scene's own motions too — every single tween (each half of a yoyo or chained motion) is ≥ 600 ms.
    const t = Tokens.Timing;
    const scene = {
      bubbleIn: t.bedtimeBubbleInMs,
      bubbleOut: t.bedtimeBubbleOutMs,
      repeatHalf: t.bedtimeRepeatMs / 2,
      scrubHalf: t.bedtimeScrubMs / 2,
      glowBreatheHalf: t.bedtimeGlowPulseMs / 2,
      twinkleHalf: t.bedtimeTwinkleMs / 2,
      starsIn: t.bedtimeStarsMs,
      zHalf: t.bedtimeZMs / 2,
      musicFade: t.bedtimeMusicFadeMs,
      lullabyFade: t.bedtimeLullabyFadeMs,
    };
    for (const [k, ms] of Object.entries(scene)) expect(ms, k).toBeGreaterThanOrEqual(600);
    expect(T.nightFadeMs).toBeGreaterThanOrEqual(1500);
  });

  it('a resume with no step done (`{ done: [] }`) is still a fresh start: the invitation is said (review)', () => {
    const { c, log } = make([]);
    c.start();
    expect(log).toContain(`chain:${INVITE_LINE}+${STEP_LINES.brush}`);
    const resumed = make(['lamp']);
    resumed.c.start();
    expect(resumed.log.some((l) => l.startsWith('chain:'))).toBe(false);
  });
});
