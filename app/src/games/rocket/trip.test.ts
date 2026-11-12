// Tên lửa lên Mặt Trăng (2026-11-12): the pure trip model — the build (three parts, two colours each, never wrong,
// taps ignored while a part flies), the countdown (tapped or not), the launch and its hurry, the climb and its boosts,
// space (the Earth, the surprise), the landing, the Moon's free play (jumps, aliens, rocks, the Earth, the flag once,
// home after enough taps or a tap on the rocket), the trip home and the next trip, the bags, the idle hints, resume.
import { describe, expect, it } from 'vitest';
import { PAIR_IDS, PART_IDS, WORLD, pairOf, type AlienId, type ColourId, type JumpId, type SurpriseId } from '../../content/games/rocket';
import {
  createShuffleBag,
  createTripController,
  defaultTripTimings,
  resumeTrip,
  type ShuffleBag,
  type TripController,
  type TripResume,
  type TripTimings,
  type TripView,
} from './trip';

const T = defaultTripTimings();
const GEO = { width: 1024, height: 768, rocks: [{ x: 590, y: 560 }, { x: 958, y: 636 }], horizonY: 480, tapRadiusPx: 80 };
const LINES = {
  prompt: 'prompt',
  part: (p: string) => `part.${p}`,
  colour: (c: string) => `colour.${c}`,
  count: (n: number) => `count.${n}`,
  launch: 'launch',
  earth: 'earth',
  surprise: (s: string) => `surprise.${s}`,
  moon: 'moon',
  light: 'light',
  peek: 'peek',
  home: 'home',
};
const SOUNDS = { clank: 'clank', sparkle: 'sparkle', ignite: 'ignite', boost: 'boost', retro: 'retro', dust: 'dust', twinkle: 'twinkle', chute: 'chute', pop: 'pop', alien: (a: AlienId) => `alien.${a}` };

function fixedBag<I extends string>(ids: readonly I[]): ShuffleBag<I> {
  let i = 0;
  let last: I | undefined;
  return {
    draw() {
      let id = ids[i++ % ids.length]!;
      if (id === last) id = ids[i++ % ids.length]!;
      last = id;
      return id;
    },
    note(id) {
      last = id;
    },
    get last() {
      return last;
    },
  };
}

interface Rig {
  ctl: TripController;
  calls: string[];
  said: string[];
  sfx: string[];
  prompts: string[];
  run(ms: number): void;
  until(done: () => boolean, maxMs?: number): boolean;
}

function rig(opts: { resume?: TripResume | null; timings?: Partial<TripTimings>; pairs?: string[]; surprises?: SurpriseId[] } = {}): Rig {
  const calls: string[] = [];
  const said: string[] = [];
  const sfx: string[] = [];
  const prompts: string[] = [];
  const view: TripView = {
    offer: (p, pair) => calls.push(`offer ${p} ${pair.join('+')}`),
    fit: (p, c, n) => calls.push(`fit ${p} ${c} ${n}`),
    board: () => calls.push('board'),
    count: (n) => calls.push(`count ${n}`),
    launch: () => calls.push('launch'),
    skip: () => calls.push('skip'),
    ascent: () => calls.push('ascent'),
    boost: () => calls.push('boost'),
    space: (s) => calls.push(`space ${s}`),
    land: () => calls.push('land'),
    moon: () => calls.push('moon'),
    jump: (k: JumpId) => calls.push(`jump ${k}`),
    peek: (n, a) => calls.push(`peek ${n} ${a}`),
    rock: (n) => calls.push(`rock ${n}`),
    earth: () => calls.push('earth'),
    star: (n) => calls.push(`star ${n}`),
    surpriseTapped: (s) => calls.push(`tapped ${s}`),
    flag: () => calls.push('flag'),
    home: () => calls.push('home'),
    unpack: () => calls.push('unpack'),
    hint: (h) => calls.push(`hint ${h}`),
    restore: (s) => calls.push(`restore ${s.step} ${s.colours.join(',')}`),
  };
  const ctl = createTripController({
    bags: {
      pairs: fixedBag(opts.pairs ?? ['red+blue', 'yellow+green', 'white+red', 'blue+green']),
      surprises: fixedBag(opts.surprises ?? ['comet', 'ufo', 'ringed', 'satellite']),
      aliens: fixedBag<AlienId>(['mint', 'peach', 'lilac']),
      jumps: fixedBag<JumpId>(['high', 'spin', 'wave']),
    },
    rng: () => 0.5,
    geometry: GEO,
    resume: opts.resume,
    lines: LINES,
    sounds: SOUNDS,
    audio: {
      sfx: (id) => sfx.push(id),
      say: (id) => said.push(id),
      sayChain: (ids) => said.push(...ids),
      setPrompt: (id) => prompts.push(id),
    },
    view,
    timings: opts.timings,
  });
  const run = (ms: number): void => {
    for (let left = ms; left > 0; left -= 50) ctl.tick(Math.min(50, left));
  };
  const until = (done: () => boolean, maxMs = 60000): boolean => {
    for (let t = 0; t < maxMs; t += 50) {
      if (done()) return true;
      ctl.tick(50);
    }
    return done();
  };
  return { ctl, calls, said, sfx, prompts, run, until };
}

/** Builds the three parts (picking bubble `n` each time) and waits for the countdown. */
function build(r: Rig, n = 0): void {
  for (let i = 0; i < PART_IDS.length; i++) {
    expect(r.until(() => r.ctl.phase === 'build' && !r.ctl.busy)).toBe(true);
    expect(r.ctl.tapChoice(n)).toBe(true);
  }
}

/** From a fresh start to the Moon, untapped. */
function toMoon(r: Rig): void {
  build(r);
  expect(r.until(() => r.ctl.phase === 'moon')).toBe(true);
}

describe('rocket trip: build', () => {
  it('starts with the invitation and the body offered in two colours; the Speaker prompt is the part', () => {
    const r = rig();
    r.ctl.start();
    expect(r.ctl.phase).toBe('build');
    expect(r.calls).toEqual(['offer body red+blue']);
    expect(r.said).toEqual(['prompt', 'part.body']);
    expect(r.prompts.at(-1)).toBe('part.body');
  });

  it('a pick fits the part in that colour, names it, ignores taps while it flies, then offers the next part', () => {
    const r = rig();
    r.ctl.start();
    expect(r.ctl.tapChoice(1)).toBe(true);
    expect(r.calls).toContain('fit body blue 1');
    expect(r.said.at(-1)).toBe('colour.blue');
    expect(r.ctl.tapChoice(0)).toBe(false);
    r.run(T.fitMs);
    expect(r.sfx).toEqual(expect.arrayContaining(['clank', 'sparkle']));
    r.run(T.nextPartMs + 50);
    expect(r.ctl.phase).toBe('build');
    expect(r.calls.at(-1)).toBe('offer nose yellow+green');
    expect(r.ctl.colours).toEqual(['blue']);
  });

  it('either bubble is fine (nothing is wrong); after the fins Shiba boards and the countdown says 3, 2, 1 then launches', () => {
    const r = rig();
    r.ctl.start();
    build(r, 1);
    expect(r.ctl.colours).toEqual(['blue', 'green', 'red']);
    expect(r.until(() => r.ctl.phase === 'countdown')).toBe(true);
    expect(r.calls).toContain('board');
    expect(r.until(() => r.ctl.phase === 'launch')).toBe(true);
    expect(r.said).toEqual(expect.arrayContaining(['count.3', 'count.2', 'count.1', 'launch']));
    expect(r.said.indexOf('count.3')).toBeLessThan(r.said.indexOf('count.1'));
    expect(r.sfx).toContain('ignite');
  });

  it('a tap on the rocket during the countdown launches at once; elsewhere the rocket does nothing', () => {
    const r = rig();
    r.ctl.start();
    expect(r.ctl.tapRocket()).toBe(false);
    build(r);
    expect(r.until(() => r.ctl.phase === 'countdown')).toBe(true);
    expect(r.ctl.tapRocket()).toBe(true);
    expect(r.ctl.phase).toBe('launch');
  });
});

describe('rocket trip: flight', () => {
  it('the launch is hurried by a tap; the climb raises alt and the sky together; a boost shortens it', () => {
    const r = rig();
    r.ctl.start();
    build(r);
    expect(r.until(() => r.ctl.phase === 'launch')).toBe(true);
    r.ctl.anyTap();
    expect(r.calls).toContain('skip');
    r.run(50);
    expect(r.ctl.phase).toBe('ascent');
    r.run(1000);
    const a = r.ctl.alt;
    expect(a).toBeGreaterThan(0);
    expect(r.ctl.sky).toBeCloseTo(a);
    expect(r.ctl.press({ x: 500, y: 300 })).toBe('boost');
    expect(r.ctl.alt).toBeCloseTo(a + WORLD.boostShare);
    expect(r.ctl.press({ x: 500, y: 300 })).toBe('none');
    expect(r.sfx).toContain('boost');
  });

  it('space names the Earth and the surprise once, the surprise crosses and can be tapped; then the landing and the Moon', () => {
    const r = rig();
    r.ctl.start();
    build(r);
    expect(r.until(() => r.ctl.phase === 'space')).toBe(true);
    expect(r.ctl.sky).toBe(1);
    expect(r.calls).toContain('space comet');
    expect(r.said.at(-1)).toBe('earth');
    expect(r.until(() => r.said.includes('surprise.comet'))).toBe(true);
    const k = r.ctl.surpriseK;
    expect(k).toBeGreaterThan(0);
    expect(r.ctl.press({ x: 1024 * (1.15 - 1.3 * k), y: 768 * WORLD.surpriseY })).toBe('surprise');
    expect(r.ctl.tapEarth()).toBe(true);
    expect(r.until(() => r.ctl.phase === 'moon')).toBe(true);
    expect(r.calls).toContain('land');
    expect(r.said.at(-1)).toBe('moon');
    expect(r.said.filter((s) => s === 'surprise.comet')).toHaveLength(1);
  });
});

describe('rocket trip: the Moon', () => {
  it('ground, craters, rocks and the Earth react; the light line once; the flag once after flagAfter taps', () => {
    const r = rig();
    r.ctl.start();
    toMoon(r);
    expect(r.ctl.press({ x: 100, y: 150 })).toBe('none');
    expect(r.ctl.press({ x: 512, y: 253 })).toBe('star');
    expect(r.ctl.press({ x: 400, y: 600 })).toBe('ground');
    expect(r.calls.at(-1)).toBe('jump high');
    expect(r.ctl.press({ x: 400, y: 600 })).toBe('none');
    expect(r.ctl.tapCrater(1)).toBe(true);
    expect(r.calls).toContain('peek 1 mint');
    expect(r.ctl.tapCrater(1)).toBe(false);
    expect(r.ctl.press({ x: 590, y: 560 })).toBe('rock');
    r.run(T.jumpMs + 50);
    expect(r.ctl.press({ x: 400, y: 600 })).toBe('ground');
    expect(r.calls).toContain('jump spin');
    expect(r.said.filter((s) => s === 'light')).toHaveLength(1);
    expect(r.calls.filter((c) => c === 'flag')).toHaveLength(1);
    expect(r.ctl.flagged).toBe(true);
  });

  it('a tap on the rocket goes home: the trip moves on at once, then unpacks and offers a new build with a new surprise', () => {
    const r = rig();
    r.ctl.start();
    toMoon(r);
    expect(r.ctl.hasProgress).toBe(true);
    expect(r.ctl.tapRocket()).toBe(true);
    expect(r.ctl.phase).toBe('home');
    expect(r.ctl.hasProgress).toBe(false);
    expect(r.ctl.colours).toEqual([]);
    expect(r.said.at(-1)).toBe('home');
    r.run(T.returnMs / 2);
    expect(r.ctl.sky).toBeGreaterThan(0);
    expect(r.ctl.sky).toBeLessThan(1);
    expect(r.until(() => r.ctl.phase === 'build')).toBe(true);
    expect(r.calls).toEqual(expect.arrayContaining(['home', 'unpack']));
    expect(r.sfx).toContain('chute');
    expect(r.ctl.sky).toBe(0);
    expect(r.ctl.surprise).toBe('ufo');
    expect(r.ctl.flagged).toBe(false);
  });

  it('enough Moon taps go home by themselves', () => {
    const r = rig();
    r.ctl.start();
    toMoon(r);
    for (let i = 0; i < WORLD.moonTaps; i++) {
      expect(r.until(() => !r.ctl.busy)).toBe(true);
      r.ctl.press({ x: 400, y: 600 });
    }
    expect(r.until(() => r.ctl.phase === 'home', T.jumpMs + 200)).toBe(true);
  });
});

describe('rocket trip: hints, bags, progress and resume', () => {
  it('idle hints bounce the bubbles while building (at most hintMax), and Shiba on the Moon', () => {
    const r = rig();
    r.ctl.start();
    r.run(T.idleHintMs * (T.hintMax + 2));
    expect(r.calls.filter((c) => c === 'hint choice')).toHaveLength(T.hintMax);
    const m = rig();
    m.ctl.start();
    toMoon(m);
    m.run(T.idleHintMs + 100);
    expect(m.calls).toContain('hint moon');
  });

  it('the shuffle bag never repeats the last id and covers every pair', () => {
    let seed = 1;
    const rng = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const bag = createShuffleBag(PAIR_IDS, rng);
    const seen = new Set<string>();
    let last = '';
    for (let i = 0; i < 60; i++) {
      const id = bag.draw();
      expect(id).not.toBe(last);
      expect(pairOf(id)[0]).not.toBe(pairOf(id)[1]);
      seen.add(id);
      last = id;
    }
    expect(seen.size).toBe(PAIR_IDS.length);
  });

  it('progress: build with its colours, pad once built, moon on the Moon', () => {
    const r = rig();
    r.ctl.start();
    expect(r.ctl.hasProgress).toBe(false);
    r.ctl.tapChoice(0);
    expect(r.ctl.progress()).toEqual({ questionIndex: 0, partial: { step: 'build', colours: ['red'], surprise: 'comet', flag: false } });
    build2(r);
    expect(r.until(() => r.ctl.phase === 'ascent')).toBe(true);
    expect(r.ctl.progress().partial.step).toBe('pad');
    expect(r.until(() => r.ctl.phase === 'moon')).toBe(true);
    expect(r.ctl.progress().partial.step).toBe('moon');
  });

  it('review: a snapshot right after the third pick (the fins still flying on) is a built rocket: step pad, and it resumes', () => {
    const r = rig();
    r.ctl.start();
    build(r);
    expect(r.ctl.phase).toBe('fit');
    const p = r.ctl.progress();
    expect(p.partial).toMatchObject({ step: 'pad', colours: ['red', 'yellow', 'white'] });
    expect(resumeTrip(p)).not.toBeNull();
  });

  it('review: the tap that hurries the launch or the landing does nothing more (no boost, no jump)', () => {
    const r = rig();
    r.ctl.start();
    build(r);
    expect(r.until(() => r.ctl.phase === 'launch')).toBe(true);
    r.ctl.anyTap();
    expect(r.ctl.phase).toBe('ascent');
    expect(r.ctl.press({ x: 500, y: 300 })).toBe('none');
    expect(r.ctl.alt).toBe(0);
    expect(r.until(() => r.ctl.phase === 'land')).toBe(true);
    r.ctl.anyTap();
    expect(r.ctl.phase).toBe('moon');
    expect(r.ctl.press({ x: 400, y: 600 })).toBe('none');
    expect(r.ctl.moonTaps).toBe(0);
    // The next tap (a new frame) works.
    r.run(50);
    expect(r.ctl.press({ x: 400, y: 600 })).toBe('ground');
  });

  it('review: the flag counts as planted only once it stands (a snapshot in between keeps no flag)', () => {
    const r = rig();
    r.ctl.start();
    toMoon(r);
    for (let i = 0; i < WORLD.flagAfter; i++) {
      expect(r.until(() => !r.ctl.busy)).toBe(true);
      r.ctl.press({ x: 400, y: 600 });
    }
    expect(r.ctl.flagged).toBe(false);
    expect(r.ctl.progress().partial.flag).toBe(false);
    r.run(T.flagMs + 50);
    expect(r.ctl.flagged).toBe(true);
    expect(r.calls.filter((c) => c === 'flag')).toHaveLength(1);
  });

  it('resumeTrip validates the partial', () => {
    const ok = { questionIndex: 0, partial: { step: 'moon', colours: ['red', 'blue', 'white'], surprise: 'ufo', flag: true } };
    expect(resumeTrip(ok)).toEqual({ step: 'moon', colours: ['red', 'blue', 'white'], surprise: 'ufo', flag: true });
    expect(resumeTrip({ questionIndex: 0, partial: { step: 'build', colours: ['red'], surprise: 'ufo', flag: true } })?.flag).toBe(false);
    expect(resumeTrip(null)).toBeNull();
    expect(resumeTrip({ questionIndex: 1, partial: ok.partial })).toBeNull();
    expect(resumeTrip({ questionIndex: 0, partial: { ...ok.partial, step: 'sky' } })).toBeNull();
    expect(resumeTrip({ questionIndex: 0, partial: { ...ok.partial, colours: ['red', 'blue'] } })).toBeNull();
    expect(resumeTrip({ questionIndex: 0, partial: { ...ok.partial, step: 'build', colours: [] } })).toBeNull();
    expect(resumeTrip({ questionIndex: 0, partial: { ...ok.partial, colours: ['red', 'pink', 'blue'] } })).toBeNull();
    expect(resumeTrip({ questionIndex: 0, partial: { ...ok.partial, surprise: 'moon' } })).toBeNull();
    expect(resumeTrip({ questionIndex: 0, partial: { ...ok.partial, flag: 'yes' } })).toBeNull();
  });

  it('a resumed build offers the next part; a resumed pad counts down; a resumed Moon waits there', () => {
    const b = rig({ resume: { step: 'build', colours: ['red' as ColourId], surprise: 'ringed', flag: false } });
    b.ctl.start();
    expect(b.calls).toEqual(['restore build red', 'offer nose red+blue']);
    expect(b.said).toEqual(['part.nose']);
    expect(b.ctl.surprise).toBe('ringed');
    const p = rig({ resume: { step: 'pad', colours: ['red', 'blue', 'white'], surprise: 'comet', flag: false } });
    p.ctl.start();
    expect(p.ctl.phase).toBe('countdown');
    expect(p.calls).toContain('count 3');
    const m = rig({ resume: { step: 'moon', colours: ['red', 'blue', 'white'], surprise: 'comet', flag: true } });
    m.ctl.start();
    expect(m.ctl.phase).toBe('moon');
    expect(m.ctl.flagged).toBe(true);
    expect(m.ctl.sky).toBe(1);
    expect(m.said).toEqual(['moon']);
  });
});

/** The second and third parts after one pick. */
function build2(r: Rig): void {
  for (let i = 1; i < PART_IDS.length; i++) {
    expect(r.until(() => r.ctl.phase === 'build' && !r.ctl.busy)).toBe(true);
    r.ctl.tapChoice(0);
  }
}
