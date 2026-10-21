// Story 1.7 I/O matrix (trip rows): first trip, long road, short hop, same stop, later trip,
// re-target, re-tap target, sleeping tap, kart boost, kart parked, wait for assets, assets first,
// entering, pause.
import { describe, expect, it } from 'vitest';
import { KartTrip, KART_TARGET, SFX_HAPPY, SFX_KART_BEEP, type TripCommand } from './kart-trip';
import { createRoad } from './road';
import { Timing } from './timing';

// Straight road 0 → 3000 px along x; start at s = 100.
const road = createRoad([
  { x: 0, y: 0 },
  { x: 3000, y: 0 },
]);
const STOPS: Record<string, number> = { 'ice-cream': 1300, race: 130, fishing: 2800 };
const AWAKE = new Set(['ice-cream', 'race', 'fishing']);
const name = (id: string): string => `vo.shell.station-name.${id}`;

function make(opts: { cap?: () => number; start?: number } = {}) {
  const arrivals: string[] = [];
  let trips = 0;
  const cap = opts.cap ?? (() => (trips > 0 ? Timing.kartDriveRepeatMaxMs : Timing.kartDriveMaxMs));
  const trip = new KartTrip({
    road,
    stops: STOPS,
    startS: opts.start ?? 100,
    capMs: cap,
    isAwake: (id) => AWAKE.has(id),
    nameLine: name,
    onArrive: (id) => {
      arrivals.push(id);
      trips++;
    },
  });
  return { trip, arrivals };
}

const kinds = (cmds: readonly TripCommand[]): string[] => cmds.map((c) => c.kind);

/** Ticks in 10 ms steps until `stop(state)` or `max` ms; returns elapsed ms and every command. */
function runUntil(trip: KartTrip, done: () => boolean, max = 10_000, step = 10) {
  const cmds: TripCommand[] = [];
  let t = 0;
  while (!done() && t < max) {
    cmds.push(...trip.tick(step));
    t += step;
  }
  return { t, cmds };
}

describe('KartTrip', () => {
  it('first trip: bounce, say + setPrompt, load; drive after 500 ms; capped at 2000 ms', () => {
    const { trip, arrivals } = make();
    const cmds = trip.tapStation('ice-cream');
    expect(cmds).toEqual([
      { kind: 'bounce', target: 'ice-cream' },
      { kind: 'say', lineId: name('ice-cream') },
      { kind: 'setPrompt', lineId: name('ice-cream') },
      { kind: 'load', gameId: 'ice-cream' },
    ]);
    expect(trip.state).toBe('departing');
    expect(trip.tick(490)).toEqual([]); // clamped to 250 twice
    expect(trip.tick(Timing.stationTapMs - 250 - 10)).toEqual([]);
    expect(trip.state).toBe('departing');
    trip.tick(10);
    expect(trip.state).toBe('driving');
    // Δs = 1200 → 2000 ms at 0.6 px/ms, cap 2000.
    expect(trip.driveMs).toBe(2000);
    const { t, cmds: moves } = runUntil(trip, () => trip.state !== 'driving');
    expect(t).toBe(2000);
    expect(trip.state).toBe('arrived');
    expect(arrivals).toEqual(['ice-cream']);
    expect(trip.s).toBe(1300);
    // Moves follow the road, facing right (+x).
    expect(moves.every((c) => c.kind === 'move' && c.y === 0 && c.dx === 1)).toBe(true);
    const xs = moves.map((c) => (c.kind === 'move' ? c.x : NaN));
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs.at(-1)).toBe(1300);
  });

  it('long road: duration = cap', () => {
    const { trip } = make({ start: 0 });
    expect(trip.durationFor(road.length)).toBe(Timing.kartDriveMaxMs);
    trip.tapStation('fishing');
    trip.tick(250);
    trip.tick(250);
    expect(trip.driveMs).toBe(Timing.kartDriveMaxMs);
  });

  it('short hop: 30 px → kartDriveMinMs', () => {
    const { trip } = make();
    trip.tapStation('race');
    trip.tick(250);
    trip.tick(250);
    expect(trip.driveMs).toBe(Timing.kartDriveMinMs);
  });

  it('same stop: departing, then a 0 ms drive, arrived', () => {
    const { trip } = make({ start: 1300 });
    trip.tapStation('ice-cream');
    expect(trip.state).toBe('departing');
    trip.tick(250);
    const cmds = trip.tick(250);
    expect(trip.state).toBe('arrived');
    expect(kinds(cmds)).toEqual(['move']);
    expect(cmds[0]).toMatchObject({ x: 1300, dx: 0 });
  });

  it('later trip: cap 1500 after the first arrival', () => {
    const { trip } = make();
    trip.tapStation('ice-cream');
    trip.assetsSettled('ice-cream');
    runUntil(trip, () => trip.state === 'entering');
    trip.entered();
    expect(trip.state).toBe('parked');
    expect(trip.s).toBe(1300);
    trip.tapStation('race'); // Δs = 1170 → 1950 ms uncapped
    runUntil(trip, () => trip.state === 'driving');
    expect(trip.driveMs).toBe(Timing.kartDriveRepeatMaxMs);
  });

  it('re-target while driving: new drive from the current s, ≤ cap from the tap; says the new name', () => {
    const { trip } = make();
    trip.tapStation('ice-cream');
    runUntil(trip, () => trip.state === 'driving');
    runUntil(trip, () => trip.s >= 700);
    const at = trip.s;
    const cmds = trip.tapStation('fishing');
    expect(cmds).toEqual([
      { kind: 'bounce', target: 'fishing' },
      { kind: 'say', lineId: name('fishing') },
      { kind: 'setPrompt', lineId: name('fishing') },
      { kind: 'load', gameId: 'fishing' },
    ]);
    expect(trip.target).toBe('fishing');
    expect(trip.s).toBe(at);
    expect(trip.driveMs).toBe(Timing.kartDriveMaxMs); // 2100 px → capped
    const { t } = runUntil(trip, () => trip.state === 'arrived');
    expect(t).toBe(Timing.kartDriveMaxMs);
    expect(trip.s).toBe(2800);
  });

  it('re-target backwards faces left', () => {
    const { trip } = make();
    trip.tapStation('ice-cream');
    runUntil(trip, () => trip.s >= 700);
    trip.tapStation('race');
    const cmds = trip.tick(10);
    expect(cmds[0]).toMatchObject({ kind: 'move', dx: -1 });
  });

  it('re-tap the target: bounce + say only', () => {
    const { trip } = make();
    trip.tapStation('ice-cream');
    expect(trip.tapStation('ice-cream')).toEqual([
      { kind: 'bounce', target: 'ice-cream' },
      { kind: 'say', lineId: name('ice-cream') },
    ]);
    runUntil(trip, () => trip.state === 'driving');
    const before = trip.driveMs;
    expect(kinds(trip.tapStation('ice-cream'))).toEqual(['bounce', 'say']);
    expect(trip.driveMs).toBe(before);
  });

  it('load only the first time a trip targets an id', () => {
    const { trip } = make();
    trip.tapStation('ice-cream');
    trip.tapStation('race');
    expect(kinds(trip.tapStation('ice-cream'))).toEqual(['bounce', 'say', 'setPrompt']);
  });

  it('departing re-target keeps the timer', () => {
    const { trip } = make();
    trip.tapStation('ice-cream');
    trip.tick(250);
    trip.tapStation('race');
    expect(trip.state).toBe('departing');
    trip.tick(250);
    expect(trip.state).toBe('driving');
    expect(trip.target).toBe('race');
  });

  it('sleeping tap while driving: bounce + happy sfx; kart unchanged', () => {
    const { trip } = make();
    trip.tapStation('ice-cream');
    runUntil(trip, () => trip.s >= 500);
    const s = trip.s;
    const left = trip.remainingMs;
    expect(trip.tapStation('pizza')).toEqual([
      { kind: 'bounce', target: 'pizza' },
      { kind: 'sfx', id: SFX_HAPPY },
    ]);
    expect(trip.s).toBe(s);
    expect(trip.remainingMs).toBe(left);
    expect(trip.target).toBe('ice-cream');
  });

  it('kart boost: 1000 ms left → 600 ms left', () => {
    const { trip } = make();
    trip.tapStation('ice-cream');
    runUntil(trip, () => trip.state === 'driving');
    runUntil(trip, () => trip.remainingMs <= 1000);
    expect(trip.remainingMs).toBe(1000);
    expect(trip.tapKart()).toEqual([
      { kind: 'bounce', target: KART_TARGET },
      { kind: 'sfx', id: SFX_KART_BEEP },
    ]);
    expect(trip.remainingMs).toBeCloseTo(600);
    const s = trip.s;
    trip.tick(150);
    expect(trip.s).toBeCloseTo(s + (1300 - s) / 4); // still continuous and linear
    const { t } = runUntil(trip, () => trip.state === 'arrived');
    expect(t).toBe(450);
  });

  it('kart parked: bounce + beep; stays parked', () => {
    const { trip } = make();
    expect(kinds(trip.tapKart())).toEqual(['bounce', 'sfx']);
    expect(trip.state).toBe('parked');
    expect(trip.tick(250)).toEqual([]);
  });

  it('wait for assets: no enter until assetsSettled', () => {
    const { trip } = make();
    trip.tapStation('ice-cream');
    const { cmds } = runUntil(trip, () => trip.state === 'arrived');
    expect(kinds(cmds)).not.toContain('enter');
    expect(trip.tick(250)).toEqual([]);
    expect(trip.assetsSettled('race')).toEqual([]);
    expect(trip.assetsSettled('ice-cream')).toEqual([{ kind: 'enter', gameId: 'ice-cream' }]);
    expect(trip.state).toBe('entering');
    expect(trip.assetsSettled('ice-cream')).toEqual([]);
  });

  it('assets first: enter on the arrival tick, once', () => {
    const { trip } = make();
    trip.tapStation('ice-cream');
    expect(trip.assetsSettled('ice-cream')).toEqual([]);
    const { cmds } = runUntil(trip, () => trip.state === 'entering');
    expect(cmds.filter((c) => c.kind === 'enter')).toEqual([{ kind: 'enter', gameId: 'ice-cream' }]);
    expect(kinds(cmds).slice(-2)).toEqual(['move', 'enter']);
    expect(trip.tick(250)).toEqual([]);
  });

  it('entering: every tap is ignored; entered() parks at that stop', () => {
    const { trip } = make();
    trip.tapStation('ice-cream');
    trip.assetsSettled('ice-cream');
    runUntil(trip, () => trip.state === 'entering');
    expect(trip.tapStation('ice-cream')).toEqual([]);
    expect(trip.tapStation('pizza')).toEqual([]);
    expect(trip.tapKart()).toEqual([]);
    trip.entered();
    expect(trip.state).toBe('parked');
    expect(trip.s).toBe(1300);
    // A new trip loads again (the game released its assets on shutdown).
    expect(kinds(trip.tapStation('ice-cream'))).toContain('load');
  });

  it('arrived: an awake tap only bounces and says', () => {
    const { trip } = make();
    trip.tapStation('ice-cream');
    runUntil(trip, () => trip.state === 'arrived');
    expect(kinds(trip.tapStation('race'))).toEqual(['bounce', 'say']);
    expect(trip.state).toBe('arrived');
  });

  it('pause: a 30 000 ms delta counts as 250', () => {
    const { trip } = make();
    trip.tapStation('ice-cream');
    trip.tick(250);
    trip.tick(250);
    trip.tick(30_000);
    expect(trip.remainingMs).toBe(2000 - 250);
    trip.tick(Number.NaN);
    expect(trip.remainingMs).toBe(2000 - 250);
  });

  it('parkAt: parked at s, one move that keeps the facing', () => {
    const { trip } = make();
    trip.tapStation('ice-cream');
    expect(trip.parkAt(1300)).toEqual([{ kind: 'move', x: 1300, y: 0, dx: 0 }]);
    expect(trip.state).toBe('parked');
    expect(trip.target).toBeUndefined();
  });
});
