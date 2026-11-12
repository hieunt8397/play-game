// Tàu hỏa chở bạn (2026-11-12): the pure trip model — the departure and the arrival (and their skip), boarding at
// each station (taps ignored while it runs), the count, the tunnel (once per trip, never during a boarding, the dim
// and "Ú òa!"), the destination after the third friend, the drop-off and the next trip, car and engine taps, the
// cow, the bird and the ground surprises, the three bags, the idle hints and the resume.
import { describe, expect, it } from 'vitest';
import { DESTINATION_IDS, FRIEND_IDS, FRIENDS_PER_TRIP, LEGS, SURPRISE_IDS, type DestinationId, type FriendId, type SurpriseId } from '../../content/games/train';
import { Tokens } from '../../core/tokens';
import {
  createShuffleBag,
  createTripController,
  defaultTripSizes,
  defaultTripTimings,
  drawFriends,
  resumeTrip,
  type ShuffleBag,
  type TripController,
  type TripResume,
  type TripSizes,
  type TripTimings,
  type TripView,
} from './trip';

const T = defaultTripTimings();
const Z = defaultTripSizes();
const GEO = { width: 1024, noseX: 730, tailX: 61, platformX: 878, destX: 878, tunnelLen: 709, cowY: 500, surpriseY: 670 };
const LINES = {
  prompt: 'prompt',
  station: 'station',
  board: (f: FriendId) => `board.${f}`,
  count: (n: number) => `count.${n}`,
  car: (c: string) => `car.${c}`,
  tunnel: 'tunnel',
  dest: (d: DestinationId) => `dest.${d}`,
};
const SOUNDS = { toot: 'toot', chug: 'chug', puff: 'puff', hiss: 'hiss', pop: 'pop', chime: 'chime', honk: 'honk', splash: 'splash', chirp: 'chirp', call: (f: FriendId) => `call.${f}` };

/** A bag that hands out `ids` in order (it still never repeats the last one). */
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
  /** Runs until `done()` (at most `maxMs`); true when it happened. */
  until(done: () => boolean, maxMs?: number): boolean;
}

interface RigOptions {
  friends?: FriendId[];
  destinations?: DestinationId[];
  surprises?: SurpriseId[];
  /** The world's draws (default 0: the tunnel on leg 1, the surprise on leg 0). */
  rng?: () => number;
  resume?: TripResume | null;
  timings?: Partial<TripTimings>;
  sizes?: Partial<TripSizes>;
}

function rig(opts: RigOptions = {}): Rig {
  const calls: string[] = [];
  const said: string[] = [];
  const sfx: string[] = [];
  const prompts: string[] = [];
  const view: TripView = {
    park: () => calls.push('park'),
    depart: () => calls.push('depart'),
    skip: () => calls.push('skip'),
    thingIn: (th) => calls.push(`in ${th.kind}${th.friend ? ` ${th.friend}` : ''}${th.dest ? ` ${th.dest}` : ''}`),
    thingGone: () => calls.push('gone'),
    arrived: (at) => calls.push(`arrived ${'friend' in at ? at.friend : at.dest}`),
    board: (f, car) => calls.push(`board ${f} ${car}`),
    dropoff: (d, friends) => calls.push(`dropoff ${d} [${friends.join(',')}]`),
    toot: () => calls.push('toot'),
    wobble: (n) => calls.push(`wobble ${n}`),
    tunnelIn: () => calls.push('tunnelIn'),
    tunnelOut: () => calls.push('tunnelOut'),
    passed: (k) => calls.push(`passed ${k}`),
    sky: (id) => calls.push(`sky ${id}`),
    cowTapped: () => calls.push('cowTapped'),
    birdTapped: () => calls.push('birdTapped'),
    surpriseTapped: (k) => calls.push(`surpriseTapped ${k}`),
    hint: (t) => calls.push(`hint ${t}`),
    restore: (s) => calls.push(`restore [${s.friends.join(',')}] ${s.aboard} ${s.dest} ${s.atDest ? 'dest' : 'station'}`),
  };
  const ctl = createTripController({
    friends: fixedBag(opts.friends ?? ['cat', 'pig', 'cow', 'sheep', 'horse', 'rooster']),
    destinations: fixedBag(opts.destinations ?? ['beach', 'fair', 'playground']),
    surprises: fixedBag(opts.surprises ?? ['crossing', 'rainbow', 'bridge']),
    rng: opts.rng ?? (() => 0),
    geometry: GEO,
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
    ...(opts.timings ? { timings: opts.timings } : {}),
    ...(opts.sizes ? { sizes: opts.sizes } : {}),
  });
  const run = (ms: number): void => {
    for (let t = 0; t < ms; t += 50) ctl.tick(50);
  };
  const until = (done: () => boolean, maxMs = 120000): boolean => {
    for (let t = 0; t < maxMs && !done(); t += 50) ctl.tick(50);
    return done();
  };
  return { ctl, calls, said, sfx, prompts, run, until };
}

/** A started trip, departed and arrived at the first station. */
function atStation(opts?: RigOptions): Rig {
  const r = rig(opts);
  r.ctl.start();
  r.ctl.tapTrain();
  expect(r.until(() => r.ctl.phase === 'wait')).toBe(true);
  return r;
}

/** Boards the waiting friend and rides on to the next stop. */
function boardAndRide(r: Rig): void {
  expect(r.ctl.tapFriend()).toBe(true);
  expect(r.until(() => r.ctl.phase === 'wait' || r.ctl.phase === 'dest')).toBe(true);
}

describe('trip: the start, the departure and the arrival', () => {
  it('starts parked at a station of its own with the invitation; a tap on the train toots and pulls away', () => {
    const r = rig();
    r.ctl.start();
    expect(r.ctl.phase).toBe('start');
    expect(r.calls).toEqual(['in platform', 'park']);
    expect(r.said).toEqual(['prompt']);
    expect(r.prompts).toEqual(['prompt']);
    expect(r.ctl.hasProgress).toBe(false);
    expect(r.ctl.tapTrain()).toBe(true);
    expect(r.ctl.phase).toBe('depart');
    expect(r.sfx).toEqual(['toot', 'chug']);
    expect(r.calls).toContain('depart');
    r.run(T.departMs + 50);
    expect(r.ctl.phase).toBe('ride');
    expect(r.ctl.speed).toBeCloseTo(Z.scrollPxPerS / 1000, 5);
  });

  it('the train always waits: nothing happens at the start station without a tap, but the idle hint bounces the train', () => {
    const r = rig();
    r.ctl.start();
    r.run(T.idleHintMs * (T.hintMax + 2));
    expect(r.ctl.phase).toBe('start');
    expect(r.calls.filter((c) => c === 'hint train')).toHaveLength(T.hintMax);
    expect(r.said.filter((s) => s === 'prompt')).toHaveLength(1 + T.hintMax);
  });

  it('the departure (longer than 1.5 s) skips with a tap; so does the arrival', () => {
    expect(T.departMs).toBeGreaterThan(T.skipOverMs);
    const r = rig();
    r.ctl.start();
    r.ctl.tapTrain();
    r.run(100);
    r.ctl.anyTap();
    expect(r.calls).toContain('skip');
    r.run(50);
    expect(r.ctl.phase).toBe('ride');
    expect(r.until(() => r.ctl.phase === 'arrive')).toBe(true);
    r.run(100);
    r.ctl.anyTap();
    r.run(50);
    expect(r.ctl.phase).toBe('wait');
  });

  it("arrives easing to a stop with the friend's platform at its anchor; the brakes hiss and the station line plays", () => {
    const r = atStation();
    const platform = r.ctl.things.find((t) => t.kind === 'platform' && t.friend === 'cat');
    expect(platform?.x).toBe(GEO.platformX);
    expect(r.ctl.speed).toBe(0);
    expect(r.sfx).toContain('hiss');
    expect(r.calls).toContain('arrived cat');
    expect(r.said).toContain('station');
    expect(r.prompts.at(-1)).toBe('station');
  });

  it('the arrival never speeds up past cruise (a Hermite from the cruise speed)', () => {
    const r = rig();
    r.ctl.start();
    r.ctl.tapTrain();
    expect(r.until(() => r.ctl.phase === 'arrive')).toBe(true);
    let max = 0;
    while (r.ctl.phase === 'arrive') {
      r.ctl.tick(50);
      max = Math.max(max, r.ctl.speed);
    }
    expect(max).toBeLessThanOrEqual(Z.scrollPxPerS / 1000 + 1e-6);
  });
});

describe('trip: boarding and the count', () => {
  it('a tap on the friend boards it into the next empty car with its call, its line and the count; then the train departs', () => {
    const r = atStation();
    expect(r.ctl.tapFriend()).toBe(true);
    expect(r.ctl.phase).toBe('board');
    expect(r.ctl.aboard).toBe(1);
    expect(r.calls).toContain('board cat 0');
    expect(r.sfx).toContain('call.cat');
    expect(r.said).toContain('board.cat+count.1');
    expect(r.ctl.hasProgress).toBe(true);
    r.run(T.boardMs + T.boardPauseMs + 50);
    expect(r.ctl.phase).toBe('depart');
    expect(r.ctl.leg).toBe(1);
  });

  it('taps on the friend are ignored while it boards (≤ 1.5 s)', () => {
    expect(T.boardMs).toBeLessThanOrEqual(1500);
    const r = atStation();
    r.ctl.tapFriend();
    expect(r.ctl.tapFriend()).toBe(false);
    r.run(T.boardMs / 2);
    expect(r.ctl.tapFriend()).toBe(false);
    expect(r.ctl.aboard).toBe(1);
  });

  it('three stations fill the cars in order, counting one, two, three; never the same friend twice in a trip', () => {
    const r = atStation();
    boardAndRide(r);
    boardAndRide(r);
    boardAndRide(r);
    expect(r.ctl.phase).toBe('dest');
    expect(r.calls.filter((c) => c.startsWith('board '))).toEqual(['board cat 0', 'board pig 1', 'board cow 2']);
    expect(r.said.filter((s) => s.startsWith('board.'))).toEqual(['board.cat+count.1', 'board.pig+count.2', 'board.cow+count.3']);
    expect(new Set(r.ctl.friends).size).toBe(FRIENDS_PER_TRIP);
  });

  it("drawFriends keeps a trip's friends different even from a bag that repeats", () => {
    const same = fixedBag<FriendId>(['cat']);
    expect(new Set(drawFriends(same, 3)).size).toBe(3);
  });
});

describe('trip: the tunnel', () => {
  it('once per trip, on its leg: the hill covers the train (the dim rises), then "Ú òa!" as the engine comes out', () => {
    const r = atStation();
    expect(r.ctl.tunnelLeg).toBe(1);
    expect(r.calls).not.toContain('in tunnel');
    r.ctl.tapFriend();
    let maxDim = 0;
    let darkMs = 0;
    let fadeMs = 0;
    let boarding = false;
    while (r.ctl.phase !== 'wait' || r.ctl.aboard < 1 || r.ctl.friends[r.ctl.aboard] !== 'pig') {
      r.ctl.tick(50);
      if (r.ctl.phase === 'board' && r.ctl.dim > 0) boarding = true;
      if (r.ctl.dim >= 1) darkMs += 50;
      else if (r.ctl.dim > 0 && maxDim < 1) fadeMs += 50;
      maxDim = Math.max(maxDim, r.ctl.dim);
      if (r.ctl.phase === 'wait') break;
    }
    expect(boarding).toBe(false);
    expect(maxDim).toBe(1);
    expect(fadeMs).toBeGreaterThanOrEqual(Tokens.ui.trainDimInMinMs);
    expect(darkMs).toBeLessThanOrEqual(Tokens.ui.trainDarkMaxMs);
    expect(r.calls.filter((c) => c === 'in tunnel')).toHaveLength(1);
    expect(r.calls).toContain('tunnelIn');
    expect(r.calls).toContain('tunnelOut');
    expect(r.said).toContain('tunnel');
    // It never stops in the dark: the dim is gone before the next station.
    expect(r.ctl.dim).toBe(0);
    boardAndRide(r);
    boardAndRide(r);
    expect(r.calls.filter((c) => c === 'in tunnel')).toHaveLength(1);
  });

  it('car and engine taps do nothing while the tunnel covers the train', () => {
    const r = atStation();
    r.ctl.tapFriend();
    expect(r.until(() => r.ctl.dim >= 1)).toBe(true);
    const before = r.calls.length;
    expect(r.ctl.tapCar(0)).toBe(false);
    r.ctl.tapTrain();
    expect(r.calls.length).toBe(before);
  });
});

describe('trip: the destination, the drop-off and the next trip', () => {
  it('after the third friend the destination arrives with its line; a tap drops the friends off, they wave, then a new trip departs', () => {
    const r = atStation();
    boardAndRide(r);
    boardAndRide(r);
    boardAndRide(r);
    expect(r.calls).toContain('arrived beach');
    expect(r.said).toContain('dest.beach');
    expect(r.prompts.at(-1)).toBe('dest.beach');
    expect(r.ctl.tapDest()).toBe(true);
    expect(r.calls).toContain('dropoff beach [cat,pig,cow]');
    // The state already belongs to the next trip: Home now keeps nothing.
    expect(r.ctl.aboard).toBe(0);
    expect(r.ctl.hasProgress).toBe(false);
    expect(r.ctl.friends).toEqual(['sheep', 'horse', 'rooster']);
    expect(r.ctl.dest).toBe('fair');
    expect(r.ctl.tapDest()).toBe(false);
    expect(r.sfx).toContain('call.cat');
    expect(T.dropMs).toBeLessThanOrEqual(1500);
    r.run(T.dropMs + T.dropStaggerMs * 2 + T.waveMs + 50);
    expect(r.sfx).toContain('chime');
    expect(r.ctl.phase).toBe('depart');
    expect(r.ctl.leg).toBe(0);
    expect(r.until(() => r.ctl.phase === 'wait')).toBe(true);
    expect(r.calls).toContain('arrived sheep');
  });

  it('nothing fails without taps: the train waits at the station and the destination; the hint bounces them', () => {
    const r = atStation();
    r.run(T.idleHintMs + 100);
    expect(r.calls).toContain('hint friend');
    expect(r.ctl.phase).toBe('wait');
    boardAndRide(r);
    boardAndRide(r);
    boardAndRide(r);
    r.run(T.idleHintMs * 2 + 100);
    expect(r.calls).toContain('hint dest');
    expect(r.ctl.phase).toBe('dest');
  });
});

describe('trip: taps any time', () => {
  it('a car wobbles and its colour is named (not again within carGapMs); the engine toots with a puff', () => {
    const r = atStation();
    expect(r.ctl.tapCar(2)).toBe(true);
    expect(r.calls).toContain('wobble 2');
    expect(r.said).toContain('car.blue');
    expect(r.ctl.tapCar(2)).toBe(false);
    r.run(T.carGapMs + 50);
    expect(r.ctl.tapCar(2)).toBe(true);
    expect(r.ctl.tapTrain()).toBe(false);
    expect(r.calls).toContain('toot');
    expect(r.sfx).toContain('puff');
  });

  it('at the start station a car tap starts the train like the engine', () => {
    const r = rig();
    r.ctl.start();
    expect(r.ctl.tapCar(1)).toBe(true);
    expect(r.ctl.phase).toBe('depart');
  });

  it('the bird and the cow react to a press near them; a ground surprise passes the engine and reacts to a press', () => {
    const r = rig({ surprises: ['crossing'] });
    r.ctl.start();
    expect(r.ctl.press({ x: r.ctl.bird.x, y: r.ctl.bird.y })).toBe('bird');
    expect(r.calls).toContain('birdTapped');
    r.ctl.tapTrain();
    expect(r.until(() => r.ctl.things.some((t) => t.kind === 'crossing'))).toBe(true);
    expect(r.until(() => r.calls.includes('passed crossing'))).toBe(true);
    expect(r.sfx).toContain('honk');
    const crossing = r.ctl.things.find((t) => t.kind === 'crossing')!;
    expect(r.ctl.press({ x: crossing.x, y: GEO.surpriseY })).toBe('surprise');
    expect(r.calls).toContain('surpriseTapped crossing');
    expect(r.until(() => r.ctl.things.some((t) => t.kind === 'cow'))).toBe(true);
    const cow = r.ctl.things.find((t) => t.kind === 'cow')!;
    expect(r.ctl.press({ x: cow.x, y: GEO.cowY })).toBe('cow');
    expect(r.sfx).toContain('call.cow');
    expect(r.ctl.press({ x: -500, y: -500 })).toBe('none');
  });

  it('a sky surprise shows on its leg (the hot-air balloon or the rainbow)', () => {
    const r = rig({ surprises: ['rainbow'] });
    r.ctl.start();
    r.ctl.tapTrain();
    expect(r.until(() => r.calls.includes('sky rainbow'))).toBe(true);
  });
});

describe('trip: the bags and the resume', () => {
  it('the real bags: never the same destination or surprise twice in a row; friends are all different in a trip', () => {
    let seed = 1;
    const rng = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const dests = createShuffleBag(DESTINATION_IDS, rng);
    let last = '';
    for (let i = 0; i < 30; i++) {
      const d = dests.draw();
      expect(d).not.toBe(last);
      last = d;
    }
    const surprises = createShuffleBag(SURPRISE_IDS, rng);
    surprises.note('bridge');
    expect(surprises.draw()).not.toBe('bridge');
    const friends = createShuffleBag(FRIEND_IDS, rng);
    for (let i = 0; i < 10; i++) expect(new Set(drawFriends(friends, FRIENDS_PER_TRIP)).size).toBe(FRIENDS_PER_TRIP);
  });

  it('progress is the partial; resumeTrip accepts it and refuses bad ones (a fresh trip)', () => {
    const r = atStation();
    r.ctl.tapFriend();
    const p = r.ctl.progress();
    expect(p).toEqual({ questionIndex: 0, partial: { friends: ['cat', 'pig', 'cow'], aboard: 1, dest: 'beach', surprise: 'crossing', tunnelLeg: 1 } });
    expect(resumeTrip(p)).toEqual({ friends: ['cat', 'pig', 'cow'], aboard: 1, dest: 'beach', surprise: 'crossing', tunnelLeg: 1 });
    const bad = (partial: object, questionIndex = 0) => resumeTrip({ questionIndex, partial: { ...p.partial, ...partial } });
    expect(bad({ friends: ['cat', 'cat', 'cow'] })).toBeNull();
    expect(bad({ friends: ['cat', 'pig'] })).toBeNull();
    expect(bad({ friends: ['cat', 'pig', 'dragon'] })).toBeNull();
    expect(bad({ aboard: 0 })).toBeNull();
    expect(bad({ aboard: 4 })).toBeNull();
    expect(bad({ aboard: 1.5 })).toBeNull();
    expect(bad({ dest: 'moon' })).toBeNull();
    expect(bad({ surprise: 'storm' })).toBeNull();
    expect(bad({ tunnelLeg: 3 })).toBeNull();
    expect(bad({}, 1)).toBeNull();
    expect(resumeTrip(null)).toBeNull();
    expect(resumeTrip({ questionIndex: 0, partial: [] })).toBeNull();
  });

  it('a resumed trip shows at once at the next station (its friends aboard) or at the destination', () => {
    const resume: TripResume = { friends: ['cat', 'pig', 'cow'], aboard: 2, dest: 'fair', surprise: 'bridge', tunnelLeg: 2 };
    const r = rig({ resume });
    r.ctl.start();
    expect(r.ctl.phase).toBe('wait');
    expect(r.ctl.leg).toBe(2);
    expect(r.calls).toContain('restore [cat,pig,cow] 2 fair station');
    expect(r.said).toEqual(['station']);
    expect(r.ctl.hasProgress).toBe(true);
    boardAndRide(r);
    expect(r.ctl.phase).toBe('dest');
    expect(r.ctl.dest).toBe('fair');
    const atDest = rig({ resume: { ...resume, aboard: 3 } });
    atDest.ctl.start();
    expect(atDest.ctl.phase).toBe('dest');
    expect(atDest.calls).toContain('restore [cat,pig,cow] 3 fair dest');
    expect(atDest.said).toEqual(['dest.fair']);
  });

  it('a trip is LEGS legs long and stop() ends everything', () => {
    expect(LEGS).toBe(FRIENDS_PER_TRIP + 1);
    const r = atStation();
    r.ctl.stop();
    const n = r.calls.length;
    r.run(20000);
    expect(r.ctl.tapFriend()).toBe(false);
    expect(r.calls.length).toBe(n);
  });
});
