// Trồng cây (2026-10-30): the garden's sound recipes (pure: no ffmpeg here; the files are measured by `npm run audio:check`).
import { describe, expect, it } from 'vitest';
import { AUDIO_CATALOG } from '../../src/content/audio-catalog.ts';
import { SFX } from '../../src/content/games/garden.ts';
import { soundFilter } from './make-bedtime.ts';
import { CREATURE_SOUNDS, FADE_IN_S, SFX_MAX_S, SOUNDS, gardenArgs, gardenIds } from './make-garden.ts';
import { buildArgs } from './make-placeholders.ts';

const valueAfter = (args: string[], flag: string): string => args[args.indexOf(flag) + 1]!;
const entry = (id: string) => AUDIO_CATALOG[id as keyof typeof AUDIO_CATALOG];

describe('make-garden', () => {
  it('four synthesised SFX in the catalog (pour, pop, crunch, slurp); Shiba’s crunch and slurp are creatures; the giggle and woof are reused', () => {
    expect(gardenIds()).toEqual([SFX.pour, SFX.pop, SFX.crunch, SFX.slurp]);
    for (const id of gardenIds()) expect(entry(id), id).toMatchObject({ kind: 'sfx' });
    expect(CREATURE_SOUNDS).toEqual([SFX.crunch, SFX.slurp]);
    for (const id of gardenIds()) expect(entry(id).creature === true, id).toBe(CREATURE_SOUNDS.includes(id));
    for (const id of [SFX.giggle, SFX.woof]) expect(entry(id), id).toBeDefined();
  });

  it('each ≤ 0.8 s, a 50 ms cubic fade-in and two 150 Hz highpasses; make-placeholders uses the same recipe', () => {
    for (const [id, s] of Object.entries(SOUNDS)) {
      expect(s.seconds, id).toBeLessThanOrEqual(SFX_MAX_S);
      const af = soundFilter(s);
      expect(af).toContain(`afade=t=in:st=0:d=${FADE_IN_S}:curve=cub`);
      expect(af.match(/highpass=f=150/g)).toHaveLength(2);
      expect(valueAfter(gardenArgs(id, 'o.m4a')!, '-af')).toBe(af);
      expect(buildArgs(id as never, 'o.m4a')).toEqual(gardenArgs(id, 'o.m4a'));
    }
    expect(gardenArgs('sfx.shell.pop', 'o.m4a')).toBeUndefined();
  });
});
