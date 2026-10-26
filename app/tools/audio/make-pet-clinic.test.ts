// Story 8.1: the clinic synth recipes (pure: no ffmpeg here; the files are measured by hand and by audio:check).
import { describe, expect, it } from 'vitest';
import { AUDIO_CATALOG } from '../../src/content/audio-catalog.ts';
import { SFX } from '../../src/content/games/pet-clinic.ts';
import { soundFilter } from './make-bedtime.ts';
import { CREATURE_SOUNDS, FADE_IN_S, HIGHPASS, SFX_MAX_S, SOUNDS, petClinicArgs, petClinicIds } from './make-pet-clinic.ts';
import { buildArgs } from './make-placeholders.ts';

const valueAfter = (args: string[], flag: string): string => args[args.indexOf(flag) + 1]!;

describe('make-pet-clinic', () => {
  it('four synthesised SFX in the catalog; the burp and gurgle (the patient’s own) are creatures, the splash and pat are not', () => {
    expect(petClinicIds().sort()).toEqual([SFX.burp, SFX.gurgle, SFX.pat, SFX.splash].sort());
    for (const id of petClinicIds()) expect(AUDIO_CATALOG[id as keyof typeof AUDIO_CATALOG], id).toBeDefined();
    for (const id of CREATURE_SOUNDS) expect(AUDIO_CATALOG[id as keyof typeof AUDIO_CATALOG]).toMatchObject({ creature: true });
    expect(AUDIO_CATALOG[SFX.splash as keyof typeof AUDIO_CATALOG].creature).toBeUndefined();
    // The giggle, yawn, snore and rustle are the bedtime game's.
    expect(petClinicIds()).not.toContain(SFX.giggle);
  });

  it('each: ≤ 0.8 s, a 50 ms cubic fade-in, a fade-out and two 150 Hz highpasses; make-placeholders uses the same recipe', () => {
    for (const [id, s] of Object.entries(SOUNDS)) {
      expect(s.seconds, id).toBeLessThanOrEqual(SFX_MAX_S);
      const af = soundFilter(s);
      expect(af).toContain(`afade=t=in:st=0:d=${FADE_IN_S}:curve=cub`);
      expect(af.split(HIGHPASS)).toHaveLength(2);
      expect(af.match(/highpass=f=150/g)).toHaveLength(2);
      expect(valueAfter(petClinicArgs(id, 'o.m4a')!, '-af')).toBe(af);
      expect(buildArgs(id as never, 'o.m4a')).toEqual(petClinicArgs(id, 'o.m4a'));
    }
    expect(petClinicArgs('sfx.shell.pop', 'o.m4a')).toBeUndefined();
  });
});
