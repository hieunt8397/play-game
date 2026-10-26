// Story 7.3: the band's synth recipes (pure: no ffmpeg here; the files are measured by hand and by audio:check).
import { describe, expect, it } from 'vitest';
import { AUDIO_CATALOG } from '../../src/content/audio-catalog.ts';
import { BAND_INSTRUMENTS, BAND_SCALE, BEAT_MUSIC } from '../../src/content/games/band.ts';
import { BAND_HIGHPASS, BEAT_SECONDS, NOTE_FADE_IN_S, NOTE_MAX_S, TIMBRES, bandArgs, bandIds, noteFilter, parseNoteId } from './make-band.ts';
import { buildArgs } from './make-placeholders.ts';

const valueAfter = (args: string[], flag: string): string => args[args.indexOf(flag) + 1]!;

describe('make-band', () => {
  it('every band id is in the catalog: 25 notes (sfx) and the beat (a music loop)', () => {
    const ids = bandIds();
    expect(ids).toHaveLength(26);
    for (const id of ids) expect(AUDIO_CATALOG[id as keyof typeof AUDIO_CATALOG], id).toBeDefined();
    expect(AUDIO_CATALOG[BEAT_MUSIC as keyof typeof AUDIO_CATALOG]).toMatchObject({ kind: 'music', loop: true });
  });

  it('each instrument has a timbre: ≤ 0.8 s, whole-number harmonics only (no dissonance)', () => {
    for (const inst of BAND_INSTRUMENTS) {
      const t = TIMBRES[inst.id]!;
      expect(t.seconds).toBeLessThanOrEqual(NOTE_MAX_S);
      for (const k of t.harmonics) expect(Number.isInteger(k)).toBe(true);
    }
  });

  it('a note: its scale frequency, a 50 ms cubic fade-in, a fade-out, two 150 Hz highpasses', () => {
    const args = bandArgs('sfx.band.bell.c6', 'o.m4a')!;
    expect(valueAfter(args, '-i')).toContain(String(BAND_SCALE.c6));
    const af = valueAfter(args, '-af');
    expect(af).toBe(noteFilter(TIMBRES.bell!));
    expect(af.startsWith(`afade=t=in:st=0:d=${NOTE_FADE_IN_S}:curve=cub`)).toBe(true);
    expect(af).toContain('afade=t=out');
    expect(af).toContain(BAND_HIGHPASS);
  });

  it('parseNoteId accepts only known instruments and scale notes', () => {
    expect(parseNoteId('sfx.band.drum.c4')).toEqual({ instrument: 'drum', note: 'c4' });
    expect(parseNoteId('sfx.band.drum.f4')).toBeUndefined();
    expect(parseNoteId('sfx.band.tuba.c4')).toBeUndefined();
    expect(bandArgs('sfx.shell.pop', 'o.m4a')).toBeUndefined();
  });

  it('the beat: a loop of whole beats, highpassed, through the placeholder tool too', () => {
    expect(BEAT_SECONDS).toBe(3);
    const args = buildArgs(BEAT_MUSIC as never, 'o.m4a');
    expect(valueAfter(args, '-filter_complex')).toContain(BAND_HIGHPASS);
    expect(buildArgs('sfx.band.frog.g4' as never, 'o.m4a')).toEqual(bandArgs('sfx.band.frog.g4', 'o.m4a'));
  });
});
