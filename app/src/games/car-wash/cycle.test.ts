// Rửa xe (2026-10-30): the pure car-wash controller — drives (and the skip), foam by tap and by rub (and a lift
// mid-rub), the hose before and after the car is foamed, the rinse and shine and the next car, the bags, the
// surprises, the idle hint and the resume.
import { describe, expect, it } from 'vitest';
import { DIRT_IDS, SURPRISE_IDS, VEHICLE_IDS, neededSpots, type DirtId, type SurpriseId, type VehicleId } from '../../content/games/car-wash';
import type { Point } from '../../content/layout-types';
import {
  createCarWashController,
  createShuffleBag,
  defaultCarWashTimings,
  resumeCarWash,
  type CarWashController,
  type CarWashResume,
  type CarWashView,
  type ShuffleBag,
} from './cycle';

const T = defaultCarWashTimings();
/** Six spots in a 3 × 2 grid, 100 px apart (the cover radius is 48 px). */
const SPOTS: Point[] = [
  { x: 100, y: 100 },
  { x: 200, y: 100 },
  { x: 300, y: 100 },
  { x: 100, y: 200 },
  { x: 200, y: 200 },
  { x: 300, y: 200 },
];
const LINES = { prompt: 'prompt', rub: 'rub', rinse: 'rinse', name: (v: VehicleId) => `name.${v}` };
const SOUNDS = {
  scrub: 'scrub',
  rinse: 'splash',
  chime: 'chime',
  bubble: 'bubble',
  dirt: { mud: 'squish', leaves: 'pop', cream: 'pop', dust: 'pop' } as Record<DirtId, string>,
  honk: (v: VehicleId) => `honk.${v}`,
};

/** A bag that hands out `ids` in order (it still never repeats the last one). */
function fixedBag<T extends string>(ids: readonly T[]): ShuffleBag<T> {
  let i = 0;
  let last: T | undefined;
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
  ctl: CarWashController;
  calls: string[];
  said: string[];
  sfx: string[];
  prompts: string[];
  run(ms: number): void;
}

function rig(opts: { vehicles?: VehicleId[]; dirts?: DirtId[]; surprises?: SurpriseId[]; resume?: CarWashResume | null } = {}): Rig {
  const calls: string[] = [];
  const said: string[] = [];
  const sfx: string[] = [];
  const prompts: string[] = [];
  const view: CarWashView = {
    driveIn: (v, d) => calls.push(`driveIn ${v} ${d}`),
    skipDrive: () => calls.push('skipDrive'),
    honk: (v) => calls.push(`honk ${v}`),
    foam: (p, n) => calls.push(`foam ${p.x},${p.y} #${n}`),
    cover: (i) => calls.push(`cover ${i}`),
    wiggle: () => calls.push('wiggle'),
    foamed: () => calls.push('foamed'),
    surprise: (id, v) => calls.push(`surprise ${id} ${v}`),
    rinse: (v) => calls.push(`rinse ${v}`),
    shine: (v) => calls.push(`shine ${v}`),
    driveOut: () => calls.push('driveOut'),
    hint: (t) => calls.push(`hint ${t}`),
    nudgeHose: () => calls.push('nudgeHose'),
    restore: (s) => calls.push(`restore ${s.vehicle} ${s.dirt} [${s.covered.join(',')}] ${s.foamed ? 'foamed' : 'dirty'}`),
  };
  const ctl = createCarWashController({
    vehicles: fixedBag(opts.vehicles ?? ['taxi', 'police', 'tractor']),
    dirts: fixedBag(opts.dirts ?? ['mud', 'dust']),
    surprises: fixedBag(opts.surprises ?? ['rainbow', 'duck', 'bubble']),
    spots: () => SPOTS,
    resume: opts.resume ?? null,
    lines: LINES,
    sounds: SOUNDS,
    audio: {
      sfx: (id) => sfx.push(id),
      say: (id) => {
        said.push(id);
        return 1;
      },
      sayChain: (ids) => {
        said.push(ids.join('+'));
        return 1;
      },
      setPrompt: (id) => prompts.push(id),
    },
    view,
  });
  const run = (ms: number): void => {
    for (let t = 0; t < ms; t += 50) ctl.tick(50);
  };
  return { ctl, calls, said, sfx, prompts, run };
}

/** A fresh car parked and honked (its drive-in played out). */
function parked(opts?: Parameters<typeof rig>[0]): Rig {
  const r = rig(opts);
  r.ctl.start();
  r.run(T.driveInMs + T.honkMs + 50);
  return r;
}

/** Taps every spot of `idx` (waiting out any surprise after each). */
function foamSpots(r: Rig, idx: readonly number[]): void {
  for (const i of idx) {
    r.ctl.press(SPOTS[i]!);
    if (r.ctl.busy) r.run(T.surpriseMs + 50);
  }
}

describe('car-wash cycle (Rửa xe)', () => {
  it('a fresh start: the first car drives in dirty; at its spot it honks and the voice says the invitation, its name and "rub"', () => {
    const r = rig();
    r.ctl.start();
    expect(r.calls).toEqual(['driveIn taxi mud']);
    expect(r.ctl.phase).toBe('drive');
    expect(r.ctl.busy).toBe(true);
    expect(r.ctl.press(SPOTS[0]!)).toBe(false);
    r.run(T.driveInMs);
    expect(r.calls).toContain('honk taxi');
    expect(r.sfx).toContain('honk.taxi');
    expect(r.said).toEqual(['prompt+name.taxi+rub']);
    expect(r.prompts.at(-1)).toBe('rub');
    expect(r.ctl.phase).toBe('dirty');
  });

  it('a tap skips the long drive-in to its end (the drive is longer than 1.5 s); a tap after it skips nothing', () => {
    expect(T.driveInMs).toBeGreaterThan(T.skipOverMs);
    const r = rig();
    r.ctl.start();
    r.run(200);
    r.ctl.anyTap();
    expect(r.calls).toEqual(['driveIn taxi mud', 'skipDrive', 'honk taxi']);
    expect(r.ctl.phase).toBe('dirty');
    r.run(T.honkMs + 50);
    expect(r.ctl.busy).toBe(false);
    r.ctl.anyTap();
    expect(r.calls.filter((c) => c === 'skipDrive')).toHaveLength(1);
  });

  it('a tap on a dirt spot puts one puff there and covers that spot (its dirt sound once), the car wiggles', () => {
    const r = parked();
    r.calls.length = 0;
    expect(r.ctl.press({ x: 110, y: 95 })).toBe(true);
    expect(r.calls).toEqual(['foam 110,95 #0', 'wiggle', 'cover 0']);
    expect(r.sfx).toContain('squish');
    expect(r.sfx).toContain('scrub');
    expect(r.ctl.covered).toEqual([0]);
    // A puff between spots covers nothing.
    expect(r.ctl.press({ x: 150, y: 150 })).toBe(true);
    expect(r.ctl.covered).toEqual([0]);
    expect(r.ctl.puffs).toBe(2);
  });

  it('rubbing: a puff every stepPx along the stroke; lifting keeps the foam and the next stroke starts fresh', () => {
    const r = parked();
    r.calls.length = 0;
    r.ctl.press({ x: 100, y: 100 });
    expect(r.ctl.rub({ x: 110, y: 100 })).toBe(false);
    expect(r.ctl.rub({ x: 130, y: 100 })).toBe(true);
    expect(r.ctl.rub({ x: 160, y: 100 })).toBe(true);
    expect(r.ctl.rub({ x: 200, y: 100 })).toBe(true);
    expect(r.ctl.covered).toEqual([0, 1]);
    // The finger lifts mid-rub: nothing is lost.
    r.ctl.lift();
    expect(r.ctl.covered).toEqual([0, 1]);
    expect(r.ctl.puffs).toBe(4);
    // A new stroke right where the last one ended still puts a puff (no step needed after a lift).
    expect(r.ctl.rub({ x: 200, y: 100 })).toBe(true);
    expect(r.calls.filter((c) => c === 'wiggle').length).toBeLessThan(r.ctl.puffs);
  });

  it('the hose before the car is foamed only nudges; once `share` of the spots is foamed the voice says "rinse" and the hose invites', () => {
    const r = parked({ surprises: ['rainbow', 'duck'] });
    expect(r.ctl.tapHose()).toBe(false);
    expect(r.calls).toContain('nudgeHose');
    const need = neededSpots(SPOTS.length, 0.66);
    expect(need).toBe(4);
    foamSpots(r, [0, 1, 2]);
    expect(r.ctl.phase).toBe('dirty');
    expect(r.ctl.tapHose()).toBe(false);
    foamSpots(r, [3]);
    expect(r.ctl.phase).toBe('foamed');
    expect(r.calls).toContain('foamed');
    expect(r.said.at(-1)).toBe('rinse');
    expect(r.prompts.at(-1)).toBe('rinse');
    // Rubbing on a foamed car still foams.
    expect(r.ctl.press(SPOTS[5]!)).toBe(true);
  });

  it('the rinse (≤ 1.5 s), the shine with a happy honk, the drive-out, then a different car drives in; taps are ignored meanwhile', () => {
    expect(T.rinseMs).toBeLessThanOrEqual(1500);
    const r = parked({ surprises: ['duck', 'bubble'] });
    foamSpots(r, [0, 1, 2, 3]);
    r.run(T.surpriseMs + 50);
    r.calls.length = 0;
    r.sfx.length = 0;
    expect(r.ctl.tapHose()).toBe(true);
    expect(r.calls).toEqual(['rinse taxi']);
    expect(r.sfx).toEqual(['splash']);
    expect(r.ctl.phase).toBe('wash');
    expect(r.ctl.vehicle).toBe('police');
    expect(r.ctl.hasProgress).toBe(false);
    expect(r.ctl.tapHose()).toBe(false);
    expect(r.ctl.press(SPOTS[0]!)).toBe(false);
    r.run(T.rinseMs + 50);
    expect(r.calls).toContain('shine taxi');
    expect(r.sfx).toContain('chime');
    r.run(T.shineMs);
    expect(r.sfx).toContain('honk.taxi');
    expect(r.calls).toContain('driveOut');
    r.run(T.driveOutMs + 50);
    expect(r.calls.at(-1)).toBe('driveIn police dust');
    r.run(T.driveInMs + 50);
    // Not the first car: no invitation, just its name and "rub".
    expect(r.said.at(-1)).toBe('name.police+rub');
    expect(r.ctl.phase).toBe('dirty');
    expect(r.ctl.covered).toEqual([]);
  });

  it('surprises: the bubble sneeze halfway to foamed, the duck once foamed, the rainbow after the rinse', () => {
    const bubble = parked({ surprises: ['bubble'] });
    foamSpots(bubble, [0, 1]);
    expect(bubble.calls).toContain('surprise bubble taxi');
    foamSpots(bubble, [2, 3]);
    expect(bubble.calls.filter((c) => c.startsWith('surprise'))).toEqual(['surprise bubble taxi']);

    const duck = parked({ surprises: ['duck'] });
    foamSpots(duck, [0, 1, 2]);
    expect(duck.calls.some((c) => c.startsWith('surprise'))).toBe(false);
    duck.ctl.press(SPOTS[3]!);
    expect(duck.calls).toContain('surprise duck taxi');
    expect(duck.ctl.busy).toBe(true);

    const rainbow = parked({ surprises: ['rainbow', 'duck'] });
    foamSpots(rainbow, [0, 1, 2, 3]);
    rainbow.ctl.tapHose();
    rainbow.run(T.rinseMs + 50);
    expect(rainbow.calls).toContain('surprise rainbow taxi');
    expect(rainbow.calls).not.toContain('shine taxi');
    rainbow.run(T.surpriseMs);
    expect(rainbow.calls).toContain('shine taxi');
  });

  it('the shuffle bags never hand the same id twice in a row and cover every id', () => {
    let seed = 7;
    const rng = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (const ids of [VEHICLE_IDS, DIRT_IDS, SURPRISE_IDS] as const) {
      const bag = createShuffleBag<string>(ids, rng);
      const drawn = Array.from({ length: ids.length * 6 }, () => bag.draw());
      for (let i = 1; i < drawn.length; i++) expect(drawn[i]).not.toBe(drawn[i - 1]);
      expect(new Set(drawn)).toEqual(new Set(ids));
    }
    const bag = createShuffleBag(['a', 'b'] as const, rng);
    bag.note('a');
    expect(bag.draw()).toBe('b');
  });

  it('the idle hint: the car bounces with "rub", then the hose with "rinse" once foamed, at most hintMax per step', () => {
    const r = parked({ surprises: ['rainbow'] });
    r.said.length = 0;
    r.run(T.idleHintMs + 50);
    expect(r.calls.at(-1)).toBe('hint car');
    expect(r.said).toEqual(['rub']);
    r.run(T.idleHintMs * (T.hintMax + 2));
    expect(r.calls.filter((c) => c === 'hint car')).toHaveLength(T.hintMax);
    foamSpots(r, [0, 1, 2, 3]);
    r.run(T.idleHintMs + 50);
    expect(r.calls.at(-1)).toBe('hint hose');
  });

  it('progress and resume: a half-washed car resumes parked with its foam (no drive, no invitation); a bad partial is refused', () => {
    const r = parked({ surprises: ['rainbow'] });
    foamSpots(r, [2, 4]);
    expect(r.ctl.hasProgress).toBe(true);
    const progress = r.ctl.progress();
    expect(progress).toEqual({ questionIndex: 0, partial: { vehicle: 'taxi', dirt: 'mud', covered: [2, 4], surprise: 'rainbow' } });
    const resume = resumeCarWash(progress, SPOTS.length);
    expect(resume).toEqual({ vehicle: 'taxi', dirt: 'mud', covered: [2, 4], surprise: 'rainbow' });

    const again = rig({ resume, vehicles: ['taxi', 'police'] });
    again.ctl.start();
    expect(again.calls).toEqual(['restore taxi mud [2,4] dirty']);
    expect(again.said).toEqual(['rub']);
    expect(again.ctl.busy).toBe(false);
    foamSpots(again, [0, 1]);
    expect(again.ctl.phase).toBe('foamed');
    // The resumed car is noted: the next one is a different vehicle.
    again.ctl.tapHose();
    expect(again.ctl.vehicle).not.toBe('taxi');

    // A foamed resume shows the hose's invitation at once.
    const foamed = rig({ resume: { vehicle: 'police', dirt: 'dust', covered: [0, 1, 2, 3], surprise: 'duck' } });
    foamed.ctl.start();
    expect(foamed.calls).toEqual(['restore police dust [0,1,2,3] foamed', 'foamed']);
    expect(foamed.said).toEqual(['rinse']);

    const bad = (partial: unknown): unknown => resumeCarWash({ questionIndex: 0, partial }, SPOTS.length);
    expect(bad({ vehicle: 'bus', dirt: 'mud', covered: [0], surprise: 'duck' })).toBeNull();
    expect(bad({ vehicle: 'taxi', dirt: 'paint', covered: [0], surprise: 'duck' })).toBeNull();
    expect(bad({ vehicle: 'taxi', dirt: 'mud', covered: [0], surprise: 'ufo' })).toBeNull();
    expect(bad({ vehicle: 'taxi', dirt: 'mud', covered: [], surprise: 'duck' })).toBeNull();
    expect(bad({ vehicle: 'taxi', dirt: 'mud', covered: [0, 0], surprise: 'duck' })).toBeNull();
    expect(bad({ vehicle: 'taxi', dirt: 'mud', covered: [6], surprise: 'duck' })).toBeNull();
    expect(bad([1])).toBeNull();
    expect(resumeCarWash({ questionIndex: 1, partial: progress.partial }, SPOTS.length)).toBeNull();
    expect(resumeCarWash(null, SPOTS.length)).toBeNull();
  });

  it('stop: nothing queued runs any more', () => {
    const r = rig();
    r.ctl.start();
    r.ctl.stop();
    r.run(T.driveInMs * 2);
    expect(r.calls).toEqual(['driveIn taxi mud']);
    expect(r.said).toEqual([]);
  });
});
