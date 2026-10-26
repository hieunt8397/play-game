// Story 8.2: the wardrobe's pop recipe (pure: no ffmpeg here; the file is measured by hand).
import { describe, expect, it } from 'vitest';
import { AUDIO_CATALOG } from '../../src/content/audio-catalog.ts';
import { SFX } from '../../src/content/games/dress-up.ts';
import { soundFilter } from './make-bedtime.ts';
import { FADE_IN_S, SFX_MAX_S, SOUNDS, dressUpArgs, dressUpIds } from './make-dress-up.ts';
import { buildArgs } from './make-placeholders.ts';

const valueAfter = (args: string[], flag: string): string => args[args.indexOf(flag) + 1]!;

describe('make-dress-up', () => {
  it('one synthesised SFX, the pop, in the catalog (not a creature); the rest of the wardrobe sounds are reused', () => {
    expect(dressUpIds()).toEqual([SFX.pop]);
    expect(AUDIO_CATALOG[SFX.pop as keyof typeof AUDIO_CATALOG]).toMatchObject({ kind: 'sfx' });
    expect(AUDIO_CATALOG[SFX.pop as keyof typeof AUDIO_CATALOG].creature).toBeUndefined();
    for (const id of [SFX.wear, SFX.giggle, SFX.hop]) expect(AUDIO_CATALOG[id as keyof typeof AUDIO_CATALOG], id).toBeDefined();
  });

  it('≤ 0.8 s, a 50 ms cubic fade-in and two 150 Hz highpasses; make-placeholders uses the same recipe', () => {
    for (const [id, s] of Object.entries(SOUNDS)) {
      expect(s.seconds, id).toBeLessThanOrEqual(SFX_MAX_S);
      const af = soundFilter(s);
      expect(af).toContain(`afade=t=in:st=0:d=${FADE_IN_S}:curve=cub`);
      expect(af.match(/highpass=f=150/g)).toHaveLength(2);
      expect(valueAfter(dressUpArgs(id, 'o.m4a')!, '-af')).toBe(af);
      expect(buildArgs(id as never, 'o.m4a')).toEqual(dressUpArgs(id, 'o.m4a'));
    }
    expect(dressUpArgs('sfx.shell.pop', 'o.m4a')).toBeUndefined();
  });
});
