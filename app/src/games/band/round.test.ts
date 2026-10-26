// Story 7.3: the band controller (I/O matrix rows: tap, rapid taps, idle beat, tap near the beat, Home, reduced motion).
import { describe, expect, it } from 'vitest';
import { BAND_INSTRUMENTS, BAND_SCALE, BEAT_LOOP_BEATS, INVITE_LINE, NOTE_PATTERN } from '../../content/games/band';
import { Tokens } from '../../core/tokens';
import { createBandController, defaultBandTimings, noteAt, type BandTimings } from './round';

const T: BandTimings = { idleBeatMs: 1000, beatMs: 500, beatWindowMs: 100, quietBeats: 6, bobEveryBeats: 2, bounceMs: 200, maxDtMs: 250, loopBeats: 4 };

function make(opts: { reduced?: boolean; timings?: Partial<BandTimings>; position?: () => number | undefined } = {}) {
  const log: string[] = [];
  const band = createBandController({
    instruments: BAND_INSTRUMENTS,
    pattern: NOTE_PATTERN,
    inviteLine: INVITE_LINE,
    reduced: opts.reduced ?? false,
    timings: { ...T, ...opts.timings },
    audio: {
      note: (id) => log.push(`note ${id}`),
      startBeat: () => log.push('beat:start'),
      stopBeat: () => log.push('beat:stop'),
      ...(opts.position ? { beatPositionMs: opts.position } : {}),
      say: (id) => (log.push(`say ${id}`), 1),
      setPrompt: (id) => log.push(`prompt ${id}`),
    },
    view: {
      bounce: (i) => log.push(`bounce ${i}`),
      bob: (i) => log.push(`bob ${i}`),
      sparkle: (i) => log.push(`sparkle ${i}`),
    },
  });
  const run = (ms: number, step = 50): void => {
    for (let t = 0; t < ms; t += step) band.tick(step);
  };
  const take = (): string[] => log.splice(0);
  return { band, log, run, take };
}

describe('band content', () => {
  it('five instruments, five notes each, all from the C-major pentatonic scale (C D E G A), C4…E6', () => {
    expect(BAND_INSTRUMENTS.map((i) => i.id)).toEqual(['drum', 'horn', 'frog', 'xylophone', 'bell']);
    for (const inst of BAND_INSTRUMENTS) {
      expect(inst.notes).toHaveLength(5);
      for (const n of inst.notes) expect(n).toMatch(/^[cdega][456]$/);
      // Low to high.
      const hz = inst.notes.map((n) => BAND_SCALE[n]);
      expect([...hz].sort((a, b) => a - b)).toEqual(hz);
      expect(inst.noteSfx).toEqual(inst.notes.map((n) => `sfx.band.${inst.id}.${n}`));
    }
    for (const hz of Object.values(BAND_SCALE)) expect(hz).toBeGreaterThan(150);
    // The drum holds the low notes, the bell the high ones.
    expect(BAND_INSTRUMENTS[0]!.notes[0]).toBe('c4');
    expect(BAND_INSTRUMENTS[4]!.notes[4]).toBe('e6');
  });

  it('the pattern goes up then down over the five notes', () => {
    expect(NOTE_PATTERN).toEqual([0, 1, 2, 3, 4, 3, 2, 1]);
    const drum = BAND_INSTRUMENTS[0]!;
    expect(Array.from({ length: 9 }, (_, s) => noteAt(drum, NOTE_PATTERN, s))).toEqual(
      ['c4', 'd4', 'e4', 'g4', 'a4', 'g4', 'e4', 'd4', 'c4'].map((n) => `sfx.band.drum.${n}`),
    );
  });

  it('the default timings come from Tokens', () => {
    expect(defaultBandTimings()).toEqual({
      idleBeatMs: Tokens.Timing.bandIdleBeatMs,
      beatMs: Tokens.Timing.bandBeatMs,
      beatWindowMs: Tokens.Timing.bandBeatWindowMs,
      quietBeats: Tokens.ui.bandQuietBeats,
      bobEveryBeats: Tokens.ui.bandBobEveryBeats,
      bounceMs: Tokens.Timing.bandBounceMs,
      maxDtMs: Tokens.Timing.bandMaxTickMs,
      loopBeats: BEAT_LOOP_BEATS,
    });
    // ≤ 1 visual pulse per second: a bob every bobEveryBeats beats.
    expect(Tokens.Timing.bandBeatMs * Tokens.ui.bandBobEveryBeats).toBeGreaterThanOrEqual(1000);
    expect(Tokens.ui.bandVoiceCap).toBe(5);
  });
});

describe('createBandController', () => {
  it('start: the invitation is said and kept as the Speaker prompt', () => {
    const { band, take } = make();
    band.start();
    expect(take()).toEqual([`prompt ${INVITE_LINE}`, `say ${INVITE_LINE}`]);
  });

  it('tap: the next note of that instrument at once, and it bounces', () => {
    const { band, take } = make();
    band.tap(0);
    band.tap(0);
    band.tap(4);
    expect(take()).toEqual(['note sfx.band.drum.c4', 'bounce 0', 'note sfx.band.drum.d4', 'bounce 0', 'note sfx.band.bell.g5', 'bounce 4']);
    expect(band.step(0)).toBe(2);
    expect(band.step(4)).toBe(1);
  });

  it('rapid taps: every tap plays its next note now (no queue), cycling up and down', () => {
    const { band, take } = make();
    for (let k = 0; k < 10; k++) band.tap(2);
    const notes = take().filter((l) => l.startsWith('note'));
    expect(notes).toEqual(['g4', 'a4', 'c5', 'd5', 'e5', 'd5', 'c5', 'a4', 'g4', 'a4'].map((n) => `note sfx.band.frog.${n}`));
  });

  it('two (or three) fingers on different instruments: each plays and bounces', () => {
    const { band, take } = make();
    band.tap(0);
    band.tap(3);
    band.tap(4);
    expect(take().filter((l) => l.startsWith('note'))).toEqual(['note sfx.band.drum.c4', 'note sfx.band.xylophone.c5', 'note sfx.band.bell.g5']);
  });

  it('an unknown instrument index does nothing', () => {
    const { band, take } = make();
    band.tap(-1);
    band.tap(5);
    expect(take()).toEqual([]);
  });

  it('idle: the beat starts after idleBeatMs without a tap; a tap restarts the idle clock', () => {
    const { band, run, take } = make();
    run(950);
    band.tap(1);
    take();
    run(950);
    expect(band.beating).toBe(false);
    run(50);
    expect(band.beating).toBe(true);
    expect(take()).toEqual(['beat:start', 'bob 0']);
  });

  it('bob: one instrument every bobEveryBeats beats, round robin, never two at once', () => {
    const { band, run, take } = make({ timings: { quietBeats: 100 } });
    run(1000);
    expect(band.beating).toBe(true);
    take();
    run(500 * 8);
    expect(take()).toEqual(['bob 1', 'bob 2', 'bob 3', 'bob 4']);
  });

  it('a bob waits while a tap bounce still runs (one prominent motion)', () => {
    const { band, run, take } = make({ timings: { quietBeats: 100 } });
    run(1000);
    take();
    run(900); // just before beat 2
    band.tap(0);
    take();
    run(100); // beat 2 is 100 ms after the tap: the bounce (200 ms) still runs → no bob
    expect(take()).toEqual([]);
    run(1000); // beat 4: a bob again
    expect(take()).toEqual(['bob 1']);
  });

  it('tap near the beat (within ± beatWindowMs) sparkles; between beats it does not; nothing is counted', () => {
    const { band, run, take } = make({ timings: { quietBeats: 100 } });
    run(1000); // the beat starts: beat 0 at its clock 0
    take();
    run(450); // 50 ms before beat 1
    band.tap(3);
    expect(take()).toContain('sparkle 3');
    run(250); // 200 ms after beat 1 → off the beat
    band.tap(3);
    expect(take().some((l) => l.startsWith('sparkle'))).toBe(false);
    run(100); // 300 ms after beat 1 = 200 ms before beat 2 → off the beat
    band.tap(1);
    expect(take().some((l) => l.startsWith('sparkle'))).toBe(false);
    run(150); // 50 ms before beat 2
    band.tap(1);
    expect(take()).toContain('sparkle 1');
  });

  it('no beat → no sparkle, however the tap is timed', () => {
    const { band, run, take } = make();
    run(500);
    band.tap(0);
    expect(take().some((l) => l.startsWith('sparkle'))).toBe(false);
  });

  it('taps keep the beat going; after quietBeats beats without a tap it stops and waits for a tap', () => {
    const { band, run, take } = make();
    run(1000);
    expect(band.beating).toBe(true);
    run(500 * 4);
    band.tap(0); // play along
    run(500 * 5);
    expect(band.beating).toBe(true);
    take();
    run(500);
    expect(band.beating).toBe(false);
    expect(take()).toContain('beat:stop');
    run(10000); // no nagging: it stays quiet until a tap
    expect(band.beating).toBe(false);
    expect(take()).toEqual([]);
    band.tap(2);
    run(1000);
    expect(band.beating).toBe(true);
  });

  it('reduced motion: the beat sound only (no bob); taps still bounce and sparkle', () => {
    const { band, run, take } = make({ reduced: true, timings: { quietBeats: 100 } });
    run(1000);
    run(2000);
    expect(take()).toEqual(['beat:start']);
    run(500); // on beat 6
    band.tap(4);
    expect(take()).toEqual(['note sfx.band.bell.g5', 'bounce 4', 'sparkle 4']);
  });

  it('Home (stop): the beat stops; no more notes, bobs or beats', () => {
    const { band, run, take } = make({ timings: { quietBeats: 100 } });
    run(1000);
    take();
    band.stop();
    expect(take()).toEqual(['beat:stop']);
    band.tap(0);
    run(5000);
    expect(take()).toEqual([]);
    expect(band.beating).toBe(false);
  });

  it('a stalled frame is clamped (maxDtMs): no burst of beats', () => {
    const { band, take } = make({ timings: { quietBeats: 100 } });
    band.tick(100000);
    expect(band.beating).toBe(false);
    for (let k = 0; k < 4; k++) band.tick(250);
    expect(band.beating).toBe(true);
    take();
    band.tick(100000); // one 250 ms step at most: never more than one beat
    expect(take().length).toBeLessThanOrEqual(1);
  });

  it('review: hitches (capped or dropped frames) never drift the sparkle window: the beat follows the loop position', () => {
    // The loop's own clock: real time since the beat started, wrapping every loopBeats · beatMs (2000 ms here).
    const loop: { started?: number } = {};
    const now = { t: 0 };
    const { band, take } = make({ timings: { quietBeats: 1000 }, position: () => (loop.started === undefined ? undefined : (now.t - loop.started) % 2000) });
    const step = (ms: number, frame = ms): void => {
      now.t += ms;
      band.tick(frame);
    };
    for (let k = 0; k < 20; k++) step(50);
    expect(band.beating).toBe(true);
    loop.started = now.t; // the loop began at the tick that started the beat
    take();
    // Hitches: 700 ms pass each time but the scene clock delivers 250 (capped), and a dropped frame (0 ms).
    for (let k = 0; k < 3; k++) step(700, 250);
    step(400, 0);
    const real = now.t - loop.started;
    expect(real % 500).toBe(0); // 2500 ms of loop, on a real beat; the scene clock alone says 750 (a quarter beat off)
    // Tap on the next real beat after two normal frames: sparkle; half a beat later: none.
    step(250);
    step(250);
    band.tap(1);
    expect(take()).toContain('sparkle 1');
    step(250);
    band.tap(1);
    expect(take().some((l) => l.startsWith('sparkle'))).toBe(false);
  });

  it('review: without a loop position (audio locked) the scene clock still drives the beat', () => {
    const { band, run } = make({ timings: { quietBeats: 1000 }, position: () => undefined });
    run(1000);
    expect(band.beating).toBe(true);
  });
});
