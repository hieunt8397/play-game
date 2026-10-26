// Story 7.4: the bedtime synth recipes (pure: no ffmpeg here; the files are measured by hand and by audio:check).
import { describe, expect, it } from 'vitest';
import { AUDIO_CATALOG } from '../../src/content/audio-catalog.ts';
import { BAND_SCALE } from '../../src/content/games/band.ts';
import { LULLABY, SFX } from '../../src/content/games/bedtime.ts';
import { CREATURE_SOUNDS, FADE_IN_S, HIGHPASS, LULLABY_BASS, LULLABY_BEATS, LULLABY_SECONDS, LULLABY_TUNE, SFX_MAX_S, SOUNDS, bedtimeArgs, bedtimeIds, lullabyExpr, soundFilter } from './make-bedtime.ts';
import { buildArgs } from './make-placeholders.ts';

const valueAfter = (args: string[], flag: string): string => args[args.indexOf(flag) + 1]!;

describe('make-bedtime', () => {
  it('every synthesised id is in the catalog: six SFX and the lullaby (a music loop); Shiba’s voice sounds are creatures', () => {
    const ids = bedtimeIds();
    expect(ids).toHaveLength(7);
    for (const id of ids) expect(AUDIO_CATALOG[id as keyof typeof AUDIO_CATALOG], id).toBeDefined();
    expect(AUDIO_CATALOG[LULLABY as keyof typeof AUDIO_CATALOG]).toMatchObject({ kind: 'music', loop: true });
    for (const id of CREATURE_SOUNDS) expect(AUDIO_CATALOG[id as keyof typeof AUDIO_CATALOG]).toMatchObject({ creature: true });
    // The brush is the touch-talk recording, not synthesised here.
    expect(ids).not.toContain(SFX.scrub);
  });

  it('each SFX: ≤ 0.8 s, a 50 ms cubic fade-in, a fade-out and two 150 Hz highpasses', () => {
    for (const [id, s] of Object.entries(SOUNDS)) {
      expect(s.seconds, id).toBeLessThanOrEqual(SFX_MAX_S);
      const af = soundFilter(s);
      expect(af).toContain(`afade=t=in:st=0:d=${FADE_IN_S}:curve=cub`);
      expect(af).toContain('afade=t=out');
      expect(af).toContain(HIGHPASS);
      expect(valueAfter(bedtimeArgs(id, 'o.m4a')!, '-af')).toBe(af);
    }
    expect(bedtimeArgs('sfx.shell.pop', 'o.m4a')).toBeUndefined();
  });

  it('the lullaby: our own 8-bar 3/4 tune of 24 beats on the pentatonic scale, a soft low note per bar (≥ 150 Hz), every note over before the loop wraps', () => {
    expect(LULLABY_TUNE.reduce((n, [, b]) => n + b, 0)).toBe(LULLABY_BEATS);
    expect(LULLABY_BASS).toHaveLength(LULLABY_BEATS / 3);
    for (const hz of LULLABY_BASS) expect(hz).toBeGreaterThan(150);
    for (const [note] of LULLABY_TUNE) expect(BAND_SCALE[note]).toBeDefined();
    expect(LULLABY_SECONDS).toBeGreaterThanOrEqual(20);
    expect(LULLABY_SECONDS).toBeLessThanOrEqual(30);
    // Each note's window `between(t,s,e)` ends before the loop end.
    for (const m of lullabyExpr().matchAll(/between\(t,([0-9.]+),([0-9.]+)\)/g)) expect(Number(m[2])).toBeLessThan(LULLABY_SECONDS);
    const args = buildArgs(LULLABY as never, 'o.m4a');
    expect(valueAfter(args, '-af')).toContain(HIGHPASS);
    expect(buildArgs(SFX.giggle as never, 'o.m4a')).toEqual(bedtimeArgs(SFX.giggle, 'o.m4a'));
  });
});
