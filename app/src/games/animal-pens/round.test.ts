// Story 7.2: the Ú òa chuồng thú controller (every I/O-matrix row) and resumePens.
import { describe, expect, it, vi } from 'vitest';
import { DOOR_COUNT, INVITE_LINE, PEN_ANIMALS, REVEALS_PER_ROUND } from '../../content/games/animal-pens';
import { mulberry32 } from '../../core/rng';
import { makeSnapshot, readResume } from '../../core/snapshot';
import { Tokens } from '../../core/tokens';
import { createPensController, drawDistinct, resumePens, type PensResume, type PensTimings } from './round';

const T = Tokens.Timing;
const NAME = T.animalPensNameDelayMs;
const IDLE = T.animalPensIdleWiggleMs;
const ASK_IDLE = T.animalPensAskIdleMs;
const LEAD = T.animalPensCelebrateLeadMs;
const EVERY = Tokens.ui.animalPensAskEvery;

function rig(resume: PensResume | null = null, seed = 7, timings: Partial<PensTimings> = {}) {
  const log: string[] = [];
  const said: { id: string; token: number }[] = [];
  let token = 0;
  let ended = 0;
  let lastReveal = 0;
  const pens = createPensController({
    animals: PEN_ANIMALS,
    doors: DOOR_COUNT,
    revealsPerRound: REVEALS_PER_ROUND,
    inviteLine: INVITE_LINE,
    rng: mulberry32(seed),
    resume,
    audio: {
      sfx: (id) => log.push(`sfx ${id}`),
      say: (id) => {
        token += 1;
        said.push({ id, token });
        log.push(`say ${id}`);
        return token;
      },
      setPrompt: (id) => log.push(`prompt ${id}`),
    },
    view: {
      open: (d, id) => log.push(`open ${d} ${id}`),
      close: (d) => log.push(`close ${d}`),
      wiggle: (d, hard) => log.push(`wiggle ${d}${hard ? ' hard' : ''}`),
      celebrate: (b) => log.push(`celebrate ${b.join(',')}`),
    },
    timings,
    onLastReveal: () => {
      lastReveal += 1;
    },
    onRoundEnd: () => {
      ended += 1;
    },
  });
  /** Ends every utterance at once (the voice is quiet). */
  const quiet = (): void => said.forEach((s) => pens.speechEnded(s.token));
  return { pens, log, said, quiet, ended: () => ended, lastReveal: () => lastReveal };
}

const tickFor = (pens: ReturnType<typeof rig>['pens'], ms: number, step = 50): void => {
  for (let t = 0; t < ms; t += step) pens.tick(step);
};

describe('createPensController (Story 7.2)', () => {
  it('starts with four distinct animals behind closed doors and says the invitation (the Speaker prompt)', () => {
    const { pens, log } = rig();
    expect(pens.behind).toHaveLength(DOOR_COUNT);
    expect(new Set(pens.behind).size).toBe(DOOR_COUNT);
    for (let d = 0; d < DOOR_COUNT; d++) expect(pens.isOpen(d)).toBe(false);
    pens.start();
    expect(log).toEqual([`prompt ${INVITE_LINE}`, `say ${INVITE_LINE}`]);
  });

  it('Tap closed door: it opens, the animal peeks and calls at once; its name after animalPensNameDelayMs', () => {
    const { pens, log } = rig();
    const a = PEN_ANIMALS.find((x) => x.id === pens.behind[1])!;
    pens.tap(1);
    expect(log).toEqual([`open 1 ${a.id}`, `sfx ${a.callSfx}`]);
    expect(pens.isOpen(1)).toBe(true);
    expect(pens.reveals).toBe(1);
    tickFor(pens, NAME - 50);
    expect(log).toHaveLength(2);
    pens.tick(50);
    expect(log.slice(2)).toEqual([`prompt ${a.nameLine}`, `say ${a.nameLine}`]);
  });

  it('Tap open door: it closes; a different animal, never one behind another door, goes behind it (not a reveal)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { pens, log } = rig(null, seed);
      pens.tap(2);
      const before = pens.behind[2];
      pens.tap(2);
      expect(log.at(-1)).toBe('close 2');
      expect(pens.isOpen(2)).toBe(false);
      expect(pens.behind[2]).not.toBe(before);
      expect(new Set(pens.behind).size).toBe(DOOR_COUNT);
      expect(pens.reveals).toBe(1);
    }
  });

  it('two animals of one kind never show at once, over many random taps', () => {
    const { pens } = rig(null, 3);
    const rnd = mulberry32(99);
    for (let i = 0; i < 300 && !pens.celebrating; i++) {
      pens.tap(Math.floor(rnd() * DOOR_COUNT));
      const shown = pens.behind.filter((_, d) => pens.isOpen(d));
      expect(new Set(shown).size).toBe(shown.length);
      expect(new Set(pens.behind).size).toBe(DOOR_COUNT);
      pens.tick(20);
    }
  });

  it('Fast taps: the latest reveal replaces a waiting name (no stacked names)', () => {
    const { pens, log } = rig();
    pens.tap(0);
    tickFor(pens, 300);
    pens.tap(3);
    tickFor(pens, NAME + 100);
    const names = log.filter((l) => l.startsWith('say vo.animal-pens.name.'));
    expect(names).toEqual([`say vo.animal-pens.name.${pens.behind[3]}`]);
  });

  it('Idle: a closed door wiggles with its muffled call, one at a time, never the same door twice in a row', () => {
    const { pens, log, quiet } = rig();
    pens.start();
    quiet();
    const wiggles: string[] = [];
    for (let n = 0; n < 2; n++) {
      tickFor(pens, IDLE);
      const w = log.filter((l) => l.startsWith('wiggle')).at(-1)!;
      wiggles.push(w);
      const door = Number(w.split(' ')[1]);
      expect(log.at(-1)).toBe(`sfx ${PEN_ANIMALS.find((a) => a.id === pens.behind[door])!.muffledSfx}`);
    }
    expect(wiggles).toHaveLength(2);
    expect(wiggles[0]).not.toBe(wiggles[1]);
    expect(wiggles.every((w) => !w.endsWith('hard'))).toBe(true);
  });

  it('only closed doors wiggle', () => {
    const { pens, log } = rig();
    pens.tap(0);
    pens.tap(1);
    pens.tap(2);
    tickFor(pens, NAME);
    for (let n = 0; n < 4; n++) tickFor(pens, IDLE);
    const doors = log.filter((l) => l.startsWith('wiggle')).map((l) => Number(l.split(' ')[1]));
    expect(doors.length).toBeGreaterThan(0);
    expect(doors.every((d) => d === 3)).toBe(true);
  });

  it(`Ask after ${EVERY} reveals: once the name has ended, "Con gì kêu …?" for a closed door, which wiggles hard`, () => {
    const { pens, log, quiet } = rig();
    for (let d = 0; d < EVERY; d++) pens.tap(d);
    tickFor(pens, NAME);
    tickFor(pens, NAME * 2);
    expect(log.some((l) => l.startsWith('say vo.animal-pens.ask.'))).toBe(false);
    quiet();
    tickFor(pens, NAME + 100);
    const ask = log.find((l) => l.startsWith('say vo.animal-pens.ask.'))!;
    expect(ask).toBeDefined();
    const door = pens.askDoor!;
    expect(pens.isOpen(door)).toBe(false);
    expect(ask).toBe(`say vo.animal-pens.ask.${pens.behind[door]}`);
    expect(log).toContain(`prompt vo.animal-pens.ask.${pens.behind[door]}`);
    // Review: the hard wiggle (and its muffled call) waits for the ask line to end — never under it.
    tickFor(pens, IDLE * 2);
    expect(log.some((l) => l.startsWith('wiggle'))).toBe(false);
    quiet();
    pens.tick(50);
    const muffled = PEN_ANIMALS.find((a) => a.id === pens.behind[door])!.muffledSfx;
    expect(log.slice(-2)).toEqual([`wiggle ${door} hard`, `sfx ${muffled}`]);
  });

  it('Ask after animalPensAskIdleMs without a tap; the asked door keeps wiggling hard until a tap', () => {
    const { pens, log, quiet } = rig();
    pens.start();
    quiet();
    tickFor(pens, ASK_IDLE);
    const door = pens.askDoor;
    expect(door).not.toBeNull();
    expect(log.filter((l) => l.startsWith('say vo.animal-pens.ask.'))).toHaveLength(1);
    quiet();
    tickFor(pens, IDLE);
    expect(log.filter((l) => l.startsWith('wiggle')).at(-1)).toBe(`wiggle ${door} hard`);
  });

  it('Any door answers an ask: a normal reveal, no judging (nothing but the call and the name)', () => {
    const { pens, log, quiet } = rig();
    pens.start();
    quiet();
    tickFor(pens, ASK_IDLE);
    const asked = pens.askDoor!;
    const other = [0, 1, 2, 3].find((d) => d !== asked)!;
    const mark = log.length;
    pens.tap(other);
    tickFor(pens, NAME);
    const a = PEN_ANIMALS.find((x) => x.id === pens.behind[other])!;
    expect(log.slice(mark)).toEqual([`open ${other} ${a.id}`, `sfx ${a.callSfx}`, `prompt ${a.nameLine}`, `say ${a.nameLine}`]);
    expect(pens.askDoor).toBeNull();
  });

  it(`Round end: the ${REVEALS_PER_ROUND}th reveal's name, then the celebration (all doors open) and onRoundEnd once; taps then do nothing`, () => {
    const { pens, log, ended } = rig();
    for (let i = 0; i < REVEALS_PER_ROUND; i++) {
      pens.tap(0); // open (a reveal)
      tickFor(pens, NAME);
      if (i < REVEALS_PER_ROUND - 1) pens.tap(0); // close (swap)
    }
    expect(pens.reveals).toBe(REVEALS_PER_ROUND);
    expect(ended()).toBe(0);
    tickFor(pens, LEAD);
    expect(ended()).toBe(1);
    expect(pens.celebrating).toBe(true);
    expect(log.at(-1)).toBe(`celebrate ${pens.behind.join(',')}`);
    for (let d = 0; d < DOOR_COUNT; d++) expect(pens.isOpen(d)).toBe(true);
    const mark = log.length;
    pens.tap(1);
    tickFor(pens, IDLE * 3);
    expect(log.length).toBe(mark);
    expect(ended()).toBe(1);
  });

  it('Review: the last reveal calls onLastReveal at once (Home then completes) and ends the input', () => {
    const { pens, log, lastReveal } = rig({ behind: ['cow', 'cat', 'horse', 'dog'], reveals: REVEALS_PER_ROUND - 1 });
    pens.tap(2);
    expect(lastReveal()).toBe(1);
    const mark = log.length;
    pens.tap(2); // no close: the round is ending
    pens.tap(0);
    expect(log.length).toBe(mark);
    tickFor(pens, NAME);
    expect(log).toContain('say vo.animal-pens.name.horse');
    expect(lastReveal()).toBe(1);
  });

  it('Review: closing a door drops its waiting name', () => {
    const { pens, log } = rig();
    pens.tap(1);
    tickFor(pens, 200);
    pens.tap(1);
    tickFor(pens, NAME * 2);
    expect(log.some((l) => l.startsWith('say vo.animal-pens.name.'))).toBe(false);
  });

  it('Review: one wiggle at a time — the hard wiggle of an ask waits for a running gentle wiggle', () => {
    const timings = { idleWiggleMs: 1000, askIdleMs: 1400, wiggleMs: 900, askWiggleMs: 1400 };
    const { pens, log, quiet } = rig(null, 5, timings);
    pens.start();
    quiet();
    tickFor(pens, 1000); // t = 1000: a gentle wiggle (until 1900)
    expect(log.filter((l) => l.startsWith('wiggle'))).toHaveLength(1);
    tickFor(pens, 400); // t = 1400: the idle ask
    expect(log.some((l) => l.startsWith('say vo.animal-pens.ask.'))).toBe(true);
    quiet(); // the ask line ends at once
    tickFor(pens, 450); // t = 1850: the gentle wiggle still runs
    expect(log.some((l) => l.endsWith('hard'))).toBe(false);
    tickFor(pens, 100); // t = 1950: now the hard wiggle
    expect(log.filter((l) => l.startsWith('wiggle')).at(-1)).toBe(`wiggle ${pens.askDoor} hard`);
  });

  it('Review: wiggles never overlap (each starts only after the previous one ran its full length)', () => {
    const { pens, log, quiet } = rig(null, 11);
    pens.start();
    quiet();
    let now = 0;
    const starts: { at: number; hard: boolean }[] = [];
    for (let i = 0; i < 1200; i++) {
      const before = log.length;
      pens.tick(50);
      now += 50;
      for (const l of log.slice(before)) {
        if (l.startsWith('wiggle')) starts.push({ at: now, hard: l.endsWith('hard') });
        if (l.startsWith('say ')) quiet();
      }
      quiet();
    }
    expect(starts.some((w) => w.hard)).toBe(true);
    for (let i = 1; i < starts.length; i++) {
      const prev = starts[i - 1]!;
      const len = prev.hard ? T.animalPensAskWiggleMs : T.animalPensWiggleMs;
      expect(starts[i]!.at - prev.at).toBeGreaterThanOrEqual(len);
    }
  });

  it('Resume: the same animals behind closed doors and the same reveal count', () => {
    const { pens } = rig({ behind: ['cow', 'cat', 'horse', 'dog'], reveals: 5 });
    expect(pens.behind).toEqual(['cow', 'cat', 'horse', 'dog']);
    expect(pens.reveals).toBe(5);
    for (let d = 0; d < DOOR_COUNT; d++) expect(pens.isOpen(d)).toBe(false);
    // Review: questionIndex stays 0 (no question is closed), so the base's empty tally matches it on resume.
    expect(pens.progress()).toEqual({ questionIndex: 0, partial: { behind: ['cow', 'cat', 'horse', 'dog'], reveals: 5 } });
  });

  it('progress is plain JSON of the current animals and reveals', () => {
    const { pens } = rig();
    pens.tap(0);
    pens.tap(0);
    const p = pens.progress();
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
    expect(p.partial.reveals).toBe(1);
    expect(p.partial.behind).toEqual([...pens.behind]);
  });
});

describe('Review: the snapshot round trip', () => {
  it('abandon mid-round → readResume → resumePens: the same round, without any warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { pens } = rig();
      pens.tap(0);
      pens.tap(3);
      const snap = makeSnapshot<'animal-pens'>({ level: 0, seed: 7, tally: { questions: 0, firstTryCorrect: 0, maxHintLevel: 0 }, progress: pens.progress() });
      const at = readResume(JSON.parse(JSON.stringify(snap)), { level: 0, seed: 7 });
      expect(resumePens(at, PEN_ANIMALS, DOOR_COUNT, REVEALS_PER_ROUND)).toEqual({ behind: [...pens.behind], reveals: 2 });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('resumePens', () => {
  const ok = { questionIndex: 0, partial: { behind: ['dog', 'cat', 'cow', 'pig'], reveals: 2 } };
  it('accepts a valid snapshot', () => {
    expect(resumePens(ok, PEN_ANIMALS, DOOR_COUNT, REVEALS_PER_ROUND)).toEqual({ behind: ['dog', 'cat', 'cow', 'pig'], reveals: 2 });
    expect(resumePens(null, PEN_ANIMALS, DOOR_COUNT, REVEALS_PER_ROUND)).toBeNull();
  });
  it.each([
    ['too few doors', { questionIndex: 0, partial: { behind: ['dog', 'cat', 'cow'], reveals: 0 } }],
    ['an unknown animal', { questionIndex: 0, partial: { behind: ['dog', 'cat', 'cow', 'duck'], reveals: 0 } }],
    ['a duplicate', { questionIndex: 0, partial: { behind: ['dog', 'cat', 'cow', 'dog'], reveals: 0 } }],
    ['reveals out of range', { questionIndex: 0, partial: { behind: ['dog', 'cat', 'cow', 'pig'], reveals: REVEALS_PER_ROUND } }],
    ['questionIndex ≠ 0', { questionIndex: 2, partial: { behind: ['dog', 'cat', 'cow', 'pig'], reveals: 2 } }],
    ['no partial', { questionIndex: 0 }],
  ])('rejects %s', (_what, at) => {
    expect(resumePens(at, PEN_ANIMALS, DOOR_COUNT, REVEALS_PER_ROUND)).toBeNull();
  });
});

describe('drawDistinct', () => {
  it('draws distinct ids', () => {
    const ids = drawDistinct(['a', 'b', 'c', 'd', 'e'], 4, mulberry32(1));
    expect(new Set(ids).size).toBe(4);
  });
});
