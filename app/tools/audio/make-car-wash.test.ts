// Rửa xe (2026-10-30): the car wash's sound recipes (pure: no ffmpeg here; the files are measured by `npm run audio:check`).
import { describe, expect, it } from 'vitest';
import { AUDIO_CATALOG } from '../../src/content/audio-catalog.ts';
import { SFX, VEHICLES } from '../../src/content/games/car-wash.ts';
import { soundFilter } from './make-bedtime.ts';
import { FADE_IN_S, SFX_MAX_S, SOUNDS, carWashArgs, carWashIds } from './make-car-wash.ts';
import { buildArgs } from './make-placeholders.ts';

const valueAfter = (args: string[], flag: string): string => args[args.indexOf(flag) + 1]!;
const entry = (id: string) => AUDIO_CATALOG[id as keyof typeof AUDIO_CATALOG];

describe('make-car-wash', () => {
  it('five synthesised SFX in the catalog (squish, chime, two sirens, the low honk), none a creature; every reused sound exists', () => {
    expect(carWashIds()).toEqual([SFX.squish, SFX.chime, SFX.fireSiren, SFX.ambulanceSiren, SFX.honkLow]);
    for (const id of carWashIds()) expect(entry(id), id).toMatchObject({ kind: 'sfx' });
    for (const id of carWashIds()) expect(entry(id).creature, id).toBeUndefined();
    for (const id of Object.values(SFX)) expect(entry(id), id).toBeDefined();
    // Each vehicle has its own honk or siren.
    const honks = Object.values(VEHICLES).map((v) => v.honk);
    expect(new Set(honks).size).toBe(honks.length);
  });

  it('each ≤ 0.8 s, a 50 ms cubic fade-in and two 150 Hz highpasses; make-placeholders uses the same recipe', () => {
    for (const [id, s] of Object.entries(SOUNDS)) {
      expect(s.seconds, id).toBeLessThanOrEqual(SFX_MAX_S);
      const af = soundFilter(s);
      expect(af).toContain(`afade=t=in:st=0:d=${FADE_IN_S}:curve=cub`);
      expect(af.match(/highpass=f=150/g)).toHaveLength(2);
      expect(valueAfter(carWashArgs(id, 'o.m4a')!, '-af')).toBe(af);
      expect(buildArgs(id as never, 'o.m4a')).toEqual(carWashArgs(id, 'o.m4a'));
    }
    expect(carWashArgs('sfx.shell.pop', 'o.m4a')).toBeUndefined();
  });
});
