// Story 1.5 I/O matrix: Ambient, First invite, Invite ends, Later invites, Tap resets, No awake,
// Pause/resume.
import { describe, expect, it } from 'vitest';
import { createMapIdle, MAX_TICK_MS, type MapIdle, type MapIdleEvent, type MapIdleTiming } from './map-idle';
import { Timing } from './timing';

const TIMING: MapIdleTiming = {
  ambientMinMs: Timing.mapAmbientMinMs,
  ambientMaxMs: Timing.mapAmbientMaxMs,
  inviteFirstMs: Timing.mapInviteFirstMs,
  inviteGapMs: Timing.mapInviteGapMs,
  inviteMaxCount: Timing.mapInviteMaxCount,
  inviteHoldMs: Timing.mapInviteHoldMs,
};
const STATIONS = ['ice-cream', 'pizza', 'race', 'fishing', 'touch-talk', 'dino-puzzle', 'shadow-match'];
const STEP = 50;

/** Deterministic rng cycling through `values`. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

interface Timed {
  at: number;
  ev: MapIdleEvent;
}

/** Ticks `ms` in STEP slices starting at `start`; returns the timed events. */
function run(idle: MapIdle, ms: number, start = 0): Timed[] {
  const out: Timed[] = [];
  for (let t = STEP; t <= ms; t += STEP) for (const ev of idle.tick(STEP)) out.push({ at: start + t, ev });
  return out;
}

const make = (opts: { awake?: string[]; rng?: () => number } = {}) =>
  createMapIdle({ stations: STATIONS, awake: opts.awake ?? ['ice-cream'], timing: TIMING, rng: opts.rng ?? seq([0.5]) });

describe('createMapIdle', () => {
  it('ambient: one event every 4–6 s; the id never repeats back to back', () => {
    const idle = make({ awake: [], rng: seq([0, 0.99, 0.3, 0.7, 0.1, 0.5]) });
    const evs = run(idle, 120_000);
    expect(evs.length).toBeGreaterThan(15);
    expect(evs.every((e) => e.ev.kind === 'ambient')).toBe(true);
    let prev = 0;
    for (const e of evs) {
      const gap = e.at - prev;
      expect(gap).toBeGreaterThanOrEqual(TIMING.ambientMinMs);
      expect(gap).toBeLessThanOrEqual(TIMING.ambientMaxMs + STEP);
      prev = e.at;
    }
    for (let i = 1; i < evs.length; i++) expect(evs[i]!.ev.id).not.toBe(evs[i - 1]!.ev.id);
  });

  it('ambient: every station is eligible', () => {
    let x = 0;
    const idle = make({ awake: [], rng: () => ((x = (x + 0.137) % 1), x) });
    const ids = new Set(run(idle, 300_000).map((e) => e.ev.id));
    expect([...ids].sort()).toEqual([...STATIONS].sort());
  });

  it('first invite after 8 s idle for the awake station; no ambient while it shows; it ends after the hold', () => {
    const idle = make();
    const evs = run(idle, TIMING.inviteFirstMs + TIMING.inviteHoldMs + 1000);
    const invite = evs.find((e) => e.ev.kind === 'invite')!;
    expect(invite.ev.id).toBe('ice-cream');
    expect(invite.at).toBe(TIMING.inviteFirstMs);
    const end = evs.find((e) => e.ev.kind === 'inviteEnd')!;
    expect(end.ev.id).toBe('ice-cream');
    expect(end.at).toBe(TIMING.inviteFirstMs + TIMING.inviteHoldMs);
    expect(evs.filter((e) => e.at > invite.at && e.at < end.at)).toEqual([]);
  });

  it('a tap ends a showing invitation with inviteEnd and resets idle', () => {
    const idle = make();
    run(idle, TIMING.inviteFirstMs);
    expect(idle.showing).toBe('ice-cream');
    expect(idle.tap()).toEqual([{ kind: 'inviteEnd', id: 'ice-cream' }]);
    expect(idle.showing).toBeUndefined();
    expect(idle.tap()).toEqual([]);
  });

  it('later invites: ≥ 20 s after the previous start, at most 3 per visit', () => {
    const idle = make();
    const invites = run(idle, 70_000).filter((e) => e.ev.kind === 'invite');
    expect(invites.map((e) => e.at)).toEqual([8000, 28000, 48000]);
    expect(run(idle, 120_000, 70_000).filter((e) => e.ev.kind === 'invite')).toEqual([]);
  });

  it('taps do not reset the invitation count', () => {
    const idle = make();
    let count = 0;
    for (let i = 0; i < 5; i++) {
      count += run(idle, 30_000).filter((e) => e.ev.kind === 'invite').length;
      idle.tap();
    }
    expect(count).toBe(TIMING.inviteMaxCount);
    expect(idle.invites).toBe(TIMING.inviteMaxCount);
  });

  it('tap at idle 7 s: no invitation until 8 s after the tap', () => {
    const idle = make();
    run(idle, 7000);
    idle.tap();
    const evs = run(idle, 9000, 7000);
    const invite = evs.find((e) => e.ev.kind === 'invite')!;
    expect(invite.at).toBe(15_000);
  });

  it('round-robin over several awake stations', () => {
    const idle = make({ awake: ['ice-cream', 'pizza'] });
    const ids = run(idle, 70_000)
      .filter((e) => e.ev.kind === 'invite')
      .map((e) => e.ev.id);
    expect(ids).toEqual(['ice-cream', 'pizza', 'ice-cream']);
  });

  it('no awake station: ambient only, never invite', () => {
    const idle = make({ awake: [] });
    const evs = run(idle, 70_000);
    expect(evs.length).toBeGreaterThan(0);
    expect(evs.some((e) => e.ev.kind !== 'ambient')).toBe(false);
  });

  it('a 30 s delta after a pause counts as 250 ms (no burst)', () => {
    const idle = make();
    expect(MAX_TICK_MS).toBe(250);
    expect(idle.tick(30_000)).toEqual([]);
    // 250 ms counted: the first invite still needs 8000 − 250 ms more.
    const evs = run(idle, TIMING.inviteFirstMs - 250, 250);
    expect(evs.filter((e) => e.ev.kind === 'invite').map((e) => e.at)).toEqual([TIMING.inviteFirstMs]);
  });

  it('ignores negative and non-finite deltas', () => {
    const idle = make();
    expect(idle.tick(-1000)).toEqual([]);
    expect(idle.tick(Number.NaN)).toEqual([]);
    const evs = run(idle, TIMING.inviteFirstMs);
    expect(evs.find((e) => e.ev.kind === 'invite')?.at).toBe(TIMING.inviteFirstMs);
  });
});

describe('createMapIdle › suspend / resume / reset (Story 1.7)', () => {
  it('suspend ends a showing invitation and stops everything until resume', () => {
    const idle = make();
    const shown = run(idle, TIMING.inviteFirstMs);
    expect(shown.at(-1)?.ev).toEqual({ kind: 'invite', id: 'ice-cream' });
    expect(idle.suspend()).toEqual([{ kind: 'inviteEnd', id: 'ice-cream' }]);
    expect(idle.suspend()).toEqual([]);
    expect(idle.suspended).toBe(true);
    expect(run(idle, 60_000)).toEqual([]);
  });

  it('resume resets the idle clock and the ambient timer', () => {
    const idle = make();
    run(idle, 3000);
    idle.suspend();
    run(idle, 10_000);
    idle.resume();
    expect(idle.suspended).toBe(false);
    // rng 0.5 → ambient after 5000 ms counted from the resume; invite after 8000 ms.
    const evs = run(idle, TIMING.inviteFirstMs);
    expect(evs.map((e) => [e.at, e.ev.kind])).toEqual([
      [5000, 'ambient'],
      [TIMING.inviteFirstMs, 'invite'],
    ]);
  });

  it('reset: a new visit gets its invitations back', () => {
    const idle = make();
    run(idle, 120_000);
    expect(idle.invites).toBe(TIMING.inviteMaxCount);
    idle.reset();
    expect(idle.invites).toBe(0);
    const evs = run(idle, TIMING.inviteFirstMs);
    expect(evs.filter((e) => e.ev.kind === 'invite').map((e) => e.at)).toEqual([TIMING.inviteFirstMs]);
  });
});

describe('createMapIdle › periodic + busy (Story 5.6)', () => {
  const WHALE = { id: 'whale', firstMs: Timing.whaleFirstMs, everyMs: Timing.whaleEveryMs, busyMs: Timing.whaleSpoutMs };
  const BUSY: MapIdleTiming = { ...TIMING, ambientBusyMs: Timing.mapAmbientMoveMs };
  const makeP = (opts: { awake?: string[]; rng?: () => number } = {}) =>
    createMapIdle({ stations: STATIONS, awake: opts.awake ?? [], timing: BUSY, periodic: [WHALE], rng: opts.rng ?? seq([0.5]) });

  /** Each prominent motion's [start, end) window: ambient (ambientBusyMs), periodic (busyMs), invite (until inviteEnd). */
  function windows(evs: Timed[]): [number, number, string][] {
    const out: [number, number, string][] = [];
    for (const e of evs) {
      if (e.ev.kind === 'ambient') out.push([e.at, e.at + Timing.mapAmbientMoveMs, 'ambient']);
      else if (e.ev.kind === 'periodic') out.push([e.at, e.at + WHALE.busyMs, 'periodic']);
      else if (e.ev.kind === 'invite') {
        const end = evs.find((x) => x.ev.kind === 'inviteEnd' && x.at > e.at);
        out.push([e.at, end ? end.at : Number.POSITIVE_INFINITY, 'invite']);
      }
    }
    return out;
  }

  it('whale due: at firstMs, then every everyMs (nothing else busy)', () => {
    // rng 0.99 → ambient every ~6 s; the whale's slots never meet an ambient window here.
    const idle = createMapIdle({ stations: STATIONS, awake: [], timing: BUSY, periodic: [WHALE], rng: seq([0.99]) });
    const evs = run(idle, 40_000).filter((e) => e.ev.kind === 'periodic');
    expect(evs[0]).toEqual({ at: WHALE.firstMs, ev: { kind: 'periodic', id: 'whale' } });
    expect(evs[1]!.at - evs[0]!.at).toBe(WHALE.everyMs);
  });

  it('the spout waits while an ambient bounce runs and fires on the first free tick (never dropped)', () => {
    // rng 0 → ambient at 4000 (busy until 4800); whale first at 4400 → waits, fires at 4800.
    const idle = createMapIdle({
      stations: STATIONS,
      awake: [],
      timing: BUSY,
      periodic: [{ ...WHALE, firstMs: 4400 }],
      rng: seq([0]),
    });
    const evs = run(idle, 6000);
    expect(evs.map((e) => [e.at, e.ev.kind])).toEqual([
      [4000, 'ambient'],
      [4800, 'periodic'],
    ]);
  });

  it('ambient and invite due during a spout wait until busyMs ends; the invite at most busyMs late', () => {
    const idle = createMapIdle({
      stations: STATIONS,
      awake: ['ice-cream'],
      timing: BUSY,
      periodic: [{ ...WHALE, firstMs: TIMING.inviteFirstMs - 200 }],
      rng: seq([0.99]),
    });
    const evs = run(idle, TIMING.inviteFirstMs + 2000);
    const spout = evs.find((e) => e.ev.kind === 'periodic')!;
    const invite = evs.find((e) => e.ev.kind === 'invite')!;
    expect(invite.at).toBeGreaterThanOrEqual(spout.at + WHALE.busyMs);
    expect(invite.at - TIMING.inviteFirstMs).toBeLessThanOrEqual(WHALE.busyMs);
  });

  it('a spout due while an invitation shows waits until it ends', () => {
    const idle = createMapIdle({
      stations: STATIONS,
      awake: ['ice-cream'],
      timing: BUSY,
      periodic: [{ ...WHALE, firstMs: TIMING.inviteFirstMs + 1000 }],
      rng: seq([0.99]),
    });
    const evs = run(idle, TIMING.inviteFirstMs + TIMING.inviteHoldMs + 1000);
    const end = evs.find((e) => e.ev.kind === 'inviteEnd')!;
    const spout = evs.find((e) => e.ev.kind === 'periodic')!;
    expect(spout.at).toBeGreaterThan(end.at);
  });

  it('over a long idle visit no two prominent motions overlap', () => {
    let x = 0;
    const idle = makeP({ awake: ['ice-cream', 'pizza'], rng: () => ((x = (x + 0.371) % 1), x) });
    const w = windows(run(idle, 300_000)).sort((a, b) => a[0] - b[0]);
    expect(w.filter((v) => v[2] === 'periodic').length).toBeGreaterThan(10);
    for (let i = 1; i < w.length; i++) expect(w[i]![0]).toBeGreaterThanOrEqual(w[i - 1]![1]);
  });

  it('suspended: nothing fires and the periodic timer pauses', () => {
    const idle = makeP();
    run(idle, 1000);
    idle.suspend();
    expect(run(idle, 60_000)).toEqual([]);
    idle.resume();
    const first = run(idle, 10_000).find((e) => e.ev.kind === 'periodic')!;
    expect(first.at).toBe(WHALE.firstMs - 1000);
  });

  it('reset restarts the periodic timers at firstMs', () => {
    const idle = makeP({ rng: seq([0.99]) });
    run(idle, WHALE.firstMs - 500);
    idle.reset();
    const first = run(idle, 10_000).find((e) => e.ev.kind === 'periodic')!;
    expect(first.at).toBe(WHALE.firstMs);
  });

  it('suspend and reset clear a running busy window (the next visit or resume is not blocked)', () => {
    const fireAt = (idle: MapIdle) => run(idle, 10_000).find((e) => e.ev.kind === 'periodic')!.at;
    const LONG = { ...WHALE, busyMs: 60_000 };
    // A spout starts a long busy window; reset at once: the next spout comes at firstMs, not after the old window.
    const a = createMapIdle({ stations: STATIONS, awake: [], timing: BUSY, periodic: [LONG], rng: seq([0.99]) });
    run(a, WHALE.firstMs);
    a.reset();
    expect(fireAt(a)).toBe(WHALE.firstMs);
    // Suspend mid-spout, resume: an ambient due right after the resume is not held back by the old window.
    const b = createMapIdle({ stations: STATIONS, awake: [], timing: BUSY, periodic: [{ ...LONG, firstMs: 100, everyMs: 120_000 }], rng: seq([0]) });
    run(b, 100);
    b.suspend();
    b.resume();
    const evs = run(b, TIMING.ambientMinMs);
    expect(evs.map((e) => [e.at, e.ev.kind])).toEqual([[TIMING.ambientMinMs, 'ambient']]);
  });

  it('no periodic config: the same events as before', () => {
    const a = make({ awake: ['ice-cream'], rng: seq([0.2, 0.8, 0.5]) });
    const b = createMapIdle({ stations: STATIONS, awake: ['ice-cream'], timing: TIMING, rng: seq([0.2, 0.8, 0.5]) });
    expect(run(a, 100_000)).toEqual(run(b, 100_000));
    expect(run(a, 100_000).some((e) => e.ev.kind === 'periodic')).toBe(false);
  });
});
