// Tàu hỏa quanh đảo trip model (2026-11-13, spec-tau-quanh-dao): a whole trip round a test loop (a circle), the
// boarding and the count, the tunnel (once), the barriers, the destination and the drop-off, the bags, the surprises,
// the taps any time, and the resume (an old-shape partial falls back to a fresh trip). Then the real island layout:
// from Ga tàu and every destination, every trip passes the volcano at most once.
import { describe, expect, it, vi } from 'vitest';
import { DESTINATION_IDS, STATION_IDS, carLine, countLine, destLine, stationLine, type DestinationId, type FriendId, type StationId, type SurpriseId } from '../../content/games/train';
import { LAYOUTS } from '../../content/layouts';
import { railOf, type Rail } from './geometry';
import {
  createShuffleBag,
  createTripController,
  defaultTripTimings,
  drawFriends,
  planStops,
  reachableSurprise,
  resumeTrip,
  tunnelPasses,
  type TripOptions,
  type TripView,
  type TripWorld,
} from './trip';

const R = 300;
const N = 360;
const ring = (lift: number): { x: number; y: number }[] =>
  Array.from({ length: N }, (_, i) => {
    const a = (2 * Math.PI * i) / N;
    return { x: 512 + R * Math.cos(a), y: 384 + R * Math.sin(a) - lift };
  });
const RAIL: Rail = railOf(ring(0), ring(20), { x: 512 + R, y: 384 });
const L = RAIL.loop.length;
const STATIONS: Record<StationId, number> = { race: 100, 'shadow-match': 600, 'dino-puzzle': 1000, 'ice-cream': 1400 };
const DESTS: Record<DestinationId, number> = { beach: 1800, whale: 1830, fountain: 1860 };
const WORLD: TripWorld = {
  rail: RAIL,
  pitch: [62, 56, 56],
  stations: STATIONS,
  dests: DESTS,
  tunnel: { from: 1100, to: 1200 },
  crossing: { from: 1500, to: 1540 },
  crossingMargin: 30,
  kartS: 1500,
  whaleS: 1750,
  cruise: 0.15,
};
const T = defaultTripTimings();

const fixedBag = <T extends string>(ids: readonly T[]): ReturnType<typeof createShuffleBag<T>> => createShuffleBag(ids, () => 0.3);

function setup(over: Partial<TripOptions> = {}, surprise: SurpriseId = 'boat') {
  const said: string[] = [];
  const sfx: string[] = [];
  const view = {
    planned: vi.fn(),
    depart: vi.fn(),
    arrived: vi.fn(),
    board: vi.fn(),
    dropoff: vi.fn(),
    toot: vi.fn(),
    wobble: vi.fn(),
    tunnelIn: vi.fn(),
    tunnelOut: vi.fn(),
    barriers: vi.fn(),
    surprise: vi.fn(),
    whaleTapped: vi.fn(),
    hint: vi.fn(),
    restore: vi.fn(),
  } satisfies TripView;
  const ctl = createTripController({
    friends: createShuffleBag<FriendId>(['cat', 'pig', 'sheep', 'cow', 'horse', 'rooster'], () => 0.5),
    destinations: fixedBag<DestinationId>(['beach', 'whale', 'fountain']),
    surprises: createShuffleBag<SurpriseId>([surprise], () => 0.5),
    rng: () => 0.5,
    world: WORLD,
    startS: 0,
    lines: {
      prompt: 'prompt',
      wait: 'wait',
      station: stationLine,
      board: (f) => `board.${f}`,
      count: countLine,
      car: carLine,
      tunnel: 'tunnel',
      dest: destLine,
      place: (p) => `place.${p}`,
    },
    sounds: { toot: 'toot', chug: 'chug', puff: 'puff', hiss: 'hiss', pop: 'pop', chime: 'chime', honk: 'honk', splash: 'splash', call: (f) => `call.${f}` },
    audio: {
      sfx: (id) => void sfx.push(id),
      say: (id) => (said.push(id), 1),
      sayChain: (ids) => (said.push(...ids), 1),
      setPrompt: vi.fn(),
    },
    view,
    ...over,
  });
  return { ctl, view, said, sfx };
}

type Ctl = ReturnType<typeof setup>['ctl'];
/** Ticks 50 ms frames until `done` (false when it never came). */
const until = (ctl: Ctl, done: () => boolean, maxMs = 120000): boolean => {
  for (let t = 0; t < maxMs && !done(); t += 50) ctl.tick(50);
  return done();
};
/** Plays `ms` in 50 ms frames (one tick covers at most maxDtMs). */
const play = (ctl: Ctl, ms: number): void => {
  for (let t = 0; t < ms; t += 50) ctl.tick(50);
};

describe('the trip on the loop', () => {
  it('a fresh start waits for a tap; it sets off and stops exactly at the first station ahead, which names itself', () => {
    const { ctl, said, sfx, view } = setup();
    ctl.start();
    expect(ctl.phase).toBe('start');
    expect(said).toEqual(['prompt']);
    expect(view.planned).toHaveBeenCalledTimes(1);
    play(ctl, 1000);
    expect(ctl.s).toBe(0);
    expect(ctl.tapTrain()).toBe(true);
    expect(sfx).toContain('toot');
    expect(ctl.phase).toBe('depart');
    expect(until(ctl, () => ctl.phase === 'wait')).toBe(true);
    const first = ctl.plan.stops[0]!;
    expect(ctl.s).toBeCloseTo(STATIONS[first], 6);
    expect(ctl.speed).toBe(0);
    expect(said.at(-1)).toBe(stationLine(first));
    expect(view.arrived).toHaveBeenLastCalledWith({ station: first, friend: ctl.plan.friends[0] });
  });

  it('it never goes faster than the cruise × the local scale and stops without a jump', () => {
    const { ctl } = setup();
    ctl.start();
    ctl.tapTrain();
    let last = ctl.s;
    let maxStep = 0;
    until(ctl, () => {
      const step = (ctl.s - last + L) % L;
      maxStep = Math.max(maxStep, step);
      last = ctl.s;
      return ctl.phase === 'wait';
    });
    expect(maxStep).toBeLessThanOrEqual(WORLD.cruise * 50 * 1.01);
  });

  it('the stations come in loop order from the start, three of the four, then the destination', () => {
    const { ctl } = setup();
    ctl.start();
    const ahead = ctl.plan.stops.map((s) => STATIONS[s]);
    expect(ctl.plan.stops).toHaveLength(3);
    expect(new Set(ctl.plan.stops).size).toBe(3);
    expect([...ahead].sort((a, b) => a - b)).toEqual(ahead);
  });

  it('boarding: the friend hops into the next car with its call, its line and the count; taps are ignored meanwhile; then it departs', () => {
    const { ctl, said, sfx, view } = setup();
    ctl.start();
    ctl.tapTrain();
    until(ctl, () => ctl.phase === 'wait');
    const f = ctl.plan.friends[0]!;
    expect(ctl.tapFriend()).toBe(true);
    expect(view.board).toHaveBeenCalledWith(f, ctl.plan.stops[0], 0, T.boardMs);
    expect(sfx).toContain(`call.${f}`);
    expect(said.slice(-2)).toEqual([`board.${f}`, countLine(1)]);
    expect(ctl.aboard).toBe(1);
    expect(ctl.busy).toBe(true);
    expect(ctl.tapFriend()).toBe(false);
    expect(T.boardMs).toBeLessThanOrEqual(1500);
    play(ctl, T.boardMs + T.boardPauseMs);
    expect(['depart', 'ride']).toContain(ctl.phase);
  });

  it('a whole trip: three friends, the tunnel once (dim, "Ú òa!"), the barriers, the destination, the drop-off, then new friends', () => {
    const { ctl, said, view } = setup();
    ctl.start();
    ctl.tapTrain();
    let dimmed = 0;
    for (let n = 0; n < 3; n++) {
      expect(until(ctl, () => ((dimmed = Math.max(dimmed, ctl.dim)), ctl.phase === 'wait'))).toBe(true);
      expect(ctl.tapFriend()).toBe(true);
    }
    expect(until(ctl, () => ((dimmed = Math.max(dimmed, ctl.dim)), ctl.phase === 'dest'))).toBe(true);
    expect(dimmed).toBeGreaterThan(0);
    expect(dimmed).toBeLessThanOrEqual(1);
    expect(view.tunnelIn).toHaveBeenCalledTimes(1);
    expect(view.tunnelOut).toHaveBeenCalledTimes(1);
    expect(said.filter((l) => l === 'tunnel')).toHaveLength(1);
    expect(view.barriers).toHaveBeenCalledWith(true);
    expect(view.barriers).toHaveBeenLastCalledWith(false);
    const dest = ctl.plan.dest;
    expect(ctl.s).toBeCloseTo(DESTS[dest], 6);
    expect(said.at(-1)).toBe(destLine(dest));
    const first = [...ctl.plan.friends];
    expect(ctl.tapDest()).toBe(true);
    expect(view.dropoff).toHaveBeenCalledWith(dest, first, T.dropMs, T.dropStaggerMs);
    expect(ctl.phase).toBe('dropoff');
    expect(ctl.hasProgress).toBe(false);
    expect(ctl.plan.dest).not.toBe(dest);
    expect(until(ctl, () => ctl.phase === 'wait')).toBe(true);
    expect(view.planned).toHaveBeenCalledTimes(2);
  });

  it('a tap on the train toots (not in the tunnel); a car names its colour (with a gap); a place its name; the whale spouts', () => {
    const { ctl, said, view } = setup();
    ctl.start();
    ctl.tapTrain();
    play(ctl, T.tootGapMs + 1);
    ctl.tapTrain();
    expect(view.toot).toHaveBeenCalledTimes(2);
    expect(ctl.tapCar(1)).toBe(true);
    expect(said.at(-1)).toBe(carLine('yellow'));
    expect(view.wobble).toHaveBeenCalledWith(1);
    expect(ctl.tapCar(1)).toBe(false);
    expect(ctl.tapPlace('pizza')).toBe(true);
    expect(said.at(-1)).toBe('place.pizza');
    expect(ctl.tapPlace('home')).toBe(false);
    play(ctl, T.placeGapMs);
    expect(ctl.tapPlace('home')).toBe(true);
    expect(ctl.tapWhale()).toBe(true);
    expect(view.whaleTapped).toHaveBeenCalledTimes(1);
    expect(until(ctl, () => (ctl.phase === 'wait' && ctl.tapFriend(), ctl.dim > 0.5))).toBe(true);
    const n = view.toot.mock.calls.length;
    ctl.tapTrain();
    expect(view.toot.mock.calls.length).toBe(n);
    expect(ctl.tapCar(0)).toBe(false);
  });

  it('the idle hint: the waiting train, then the friend, with their lines, at most hintMax times a step', () => {
    const { ctl, view, said } = setup();
    ctl.start();
    for (let t = 0; t < T.idleHintMs * (T.hintMax + 2); t += 100) ctl.tick(100);
    expect(view.hint).toHaveBeenCalledTimes(T.hintMax);
    expect(view.hint).toHaveBeenCalledWith('train');
    expect(said.filter((l) => l === 'prompt')).toHaveLength(1 + T.hintMax);
    ctl.tapTrain();
    until(ctl, () => ctl.phase === 'wait');
    view.hint.mockClear();
    for (let t = 0; t < T.idleHintMs + 100; t += 100) ctl.tick(100);
    expect(view.hint).toHaveBeenCalledWith('friend');
  });

  it('the surprises: the kart waves as the engine passes the crossing, the whale spouts as it passes the whale, the boat drifts by after the first boarding', () => {
    for (const kind of ['kart', 'whale', 'boat', 'hot-air'] as const) {
      const { ctl, view } = setup({}, kind);
      ctl.start();
      const planned = ctl.plan.surprise;
      ctl.tapTrain();
      for (let n = 0; n < 3; n++) {
        until(ctl, () => ctl.phase === 'wait');
        ctl.tapFriend();
      }
      until(ctl, () => ctl.phase === 'dest');
      play(ctl, T.skyDelayMs);
      // The drawn surprise, or the boat when it could not happen on this trip (reachableSurprise): it always shows.
      expect(view.surprise, kind).toHaveBeenCalledWith(planned, T.skyMs);
      expect(view.surprise.mock.calls.length).toBeLessThanOrEqual(1);
    }
  });

  it('Home during the drop-off keeps nothing; with a friend aboard the partial has the stops and the destination as ids', () => {
    const { ctl } = setup();
    ctl.start();
    expect(ctl.hasProgress).toBe(false);
    ctl.tapTrain();
    until(ctl, () => ctl.phase === 'wait');
    ctl.tapFriend();
    expect(ctl.hasProgress).toBe(true);
    const p = ctl.progress();
    expect(p).toEqual({ questionIndex: 0, partial: { friends: [...ctl.plan.friends], aboard: 1, stops: [...ctl.plan.stops], dest: ctl.plan.dest, surprise: ctl.plan.surprise } });
    expect(resumeTrip(p)).toEqual({ ...p.partial });
  });
});

describe('resume', () => {
  const ok = { friends: ['cat', 'pig', 'cow'], aboard: 2, stops: ['race', 'dino-puzzle', 'ice-cream'], dest: 'whale', surprise: 'kart' };
  it('a valid partial resumes; anything else (an old-shape partial included) is a fresh trip', () => {
    expect(resumeTrip({ questionIndex: 0, partial: ok })).toEqual(ok);
    expect(resumeTrip(null)).toBeNull();
    expect(resumeTrip({ questionIndex: 1, partial: ok })).toBeNull();
    // the countryside's partial (2026-11-12)
    expect(resumeTrip({ questionIndex: 0, partial: { friends: ['cat', 'pig', 'cow'], aboard: 1, dest: 'beach', surprise: 'bridge', tunnelLeg: 1 } })).toBeNull();
    expect(resumeTrip({ questionIndex: 0, partial: { ...ok, stops: ['race', 'race', 'ice-cream'] } })).toBeNull();
    expect(resumeTrip({ questionIndex: 0, partial: { ...ok, stops: ['race', 'cave', 'ice-cream'] } })).toBeNull();
    expect(resumeTrip({ questionIndex: 0, partial: { ...ok, aboard: 0 } })).toBeNull();
    expect(resumeTrip({ questionIndex: 0, partial: { ...ok, dest: 'fair' } })).toBeNull();
    expect(resumeTrip({ questionIndex: 0, partial: { ...ok, friends: ['cat', 'cat', 'cow'] } })).toBeNull();
  });

  it('a resumed trip shows at once, stopped at its next station with the friend waiting (or at the destination)', () => {
    const r = resumeTrip({ questionIndex: 0, partial: ok })!;
    const { ctl, view, said } = setup({ resume: r });
    ctl.start();
    expect(ctl.phase).toBe('wait');
    expect(ctl.s).toBeCloseTo(STATIONS['ice-cream'], 6);
    expect(view.restore).toHaveBeenCalledWith({ ...r, atDest: false });
    expect(said).toEqual([stationLine('ice-cream')]);
    expect(ctl.tapFriend()).toBe(true);
    const atDest = setup({ resume: { ...r, aboard: 3 } });
    atDest.ctl.start();
    expect(atDest.ctl.phase).toBe('dest');
    expect(atDest.ctl.s).toBeCloseTo(DESTS.whale, 6);
  });
});

describe('the bags and the route', () => {
  it('a bag never draws the same id twice in a row; a trip never has the same friend twice', () => {
    const bag = createShuffleBag(['a', 'b', 'c'], Math.random);
    let last = '';
    for (let i = 0; i < 60; i++) {
      const id = bag.draw();
      expect(id).not.toBe(last);
      last = id;
    }
    const friends = drawFriends(createShuffleBag<FriendId>(['cat'], () => 0), 3);
    expect(new Set(friends).size).toBe(3);
  });

  it('a surprise that cannot happen on the trip (the kart or the whale off its path, the whale at its own bay) becomes the boat', () => {
    const all = ['race', 'shadow-match', 'dino-puzzle'] as StationId[];
    expect(reachableSurprise(WORLD, 0, all, 'beach', 'kart')).toBe('kart'); // 1000 → 1800 passes the crossing (1500)
    const early = { ...WORLD, kartS: 50 };
    expect(reachableSurprise(early, 120, ['shadow-match', 'dino-puzzle', 'ice-cream'], 'beach', 'kart')).toBe('boat'); // 120 → 1800 never passes 50
    expect(reachableSurprise(WORLD, 0, all, 'whale', 'whale')).toBe('boat');
    expect(reachableSurprise(WORLD, 0, all, 'fountain', 'whale')).toBe('whale');
    expect(reachableSurprise(WORLD, 0, all, 'beach', 'hot-air')).toBe('hot-air');
  });

  it('a resumed trip still shows its boat after its next departure', () => {
    const r = resumeTrip({ questionIndex: 0, partial: { friends: ['cat', 'pig', 'cow'], aboard: 2, stops: ['race', 'shadow-match', 'dino-puzzle'], dest: 'beach', surprise: 'boat' } })!;
    const { ctl, view } = setup({ resume: r });
    ctl.start();
    ctl.tapFriend();
    play(ctl, T.boardMs + T.boardPauseMs + T.skyDelayMs + 100);
    expect(view.surprise).toHaveBeenCalledWith('boat', T.skyMs);
  });

  it('tunnelPasses counts each pass of the tunnel mouth', () => {
    expect(tunnelPasses(WORLD, 0, [500, 1000])).toBe(0);
    expect(tunnelPasses(WORLD, 0, [1300])).toBe(1);
    expect(tunnelPasses(WORLD, 1300, [1000])).toBe(0);
    expect(tunnelPasses(WORLD, 1300, [1000, 1300])).toBe(1);
    expect(tunnelPasses(WORLD, 1050, [1400, 1000])).toBe(1);
    expect(tunnelPasses(WORLD, 1050, [1400, 1800])).toBe(1);
    expect(tunnelPasses(WORLD, 1050, [1400, 600, 1800])).toBe(2);
  });

  it('on the real island, from Ga tàu and every destination, every trip passes the volcano at most once', () => {
    const layout = LAYOUTS.train;
    const rail = railOf(layout.paths.rail!, layout.paths['rail-up']!, layout.anchors.train!);
    const sOf = (id: string): number => rail.loop.project(layout.anchors[id]!);
    const world: TripWorld = {
      ...WORLD,
      rail,
      stations: Object.fromEntries(STATION_IDS.map((s) => [s, sOf(`stop-${s}`)])) as Record<StationId, number>,
      dests: Object.fromEntries(DESTINATION_IDS.map((d) => [d, sOf(`stop-${d}`)])) as Record<DestinationId, number>,
      tunnel: { from: sOf('rail-tunnel-in'), to: sOf('rail-tunnel-out') },
    };
    const starts = [sOf('train'), ...DESTINATION_IDS.map((d) => world.dests[d])];
    for (const from of starts) {
      for (const dest of DESTINATION_IDS) {
        for (const seed of [0.1, 0.4, 0.7, 0.95]) {
          const stops = planStops(world, from, dest, () => seed);
          expect(tunnelPasses(world, from, [...stops.map((s) => world.stations[s]), world.dests[dest]]), `${from} → ${dest}`).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(L).toBeGreaterThan(0);
  });
});
