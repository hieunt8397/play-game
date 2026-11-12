// Tên lửa lên Mặt Trăng (2026-11-12): the rocket game's sound recipes (pure: no ffmpeg here; the files are checked by `npm run check`).
import { describe, expect, it } from 'vitest';
import { AUDIO_CATALOG } from '../../src/content/audio-catalog.ts';
import { ALIENS, SFX } from '../../src/content/games/rocket.ts';
import { soundFilter } from './make-bedtime.ts';
import { FADE_IN_S, SFX_MAX_S, SOUNDS, rocketArgs, rocketIds } from './make-rocket.ts';
import { buildArgs } from './make-placeholders.ts';

const valueAfter = (args: string[], flag: string): string => args[args.indexOf(flag) + 1]!;
const entry = (id: string) => AUDIO_CATALOG[id as keyof typeof AUDIO_CATALOG];

describe('make-rocket', () => {
  it('eleven synthesised SFX in the catalog, none a creature; every reused sound exists; each alien has its own', () => {
    expect(rocketIds()).toEqual([SFX.clank, SFX.sparkle, SFX.ignite, SFX.boost, SFX.retro, SFX.dust, SFX.twinkle, SFX.chute, SFX.boing, SFX.bloop, SFX.trill]);
    for (const id of rocketIds()) expect(entry(id), id).toMatchObject({ kind: 'sfx' });
    for (const id of rocketIds()) expect(entry(id).creature, id).toBeUndefined();
    for (const id of Object.values(SFX)) expect(entry(id), id).toBeDefined();
    const own = Object.values(ALIENS).map((a) => a.sfx);
    expect(new Set(own).size).toBe(own.length);
  });

  it('each ≤ 0.8 s, a 50 ms cubic fade-in and two 150 Hz highpasses; make-placeholders uses the same recipe', () => {
    for (const [id, s] of Object.entries(SOUNDS)) {
      expect(s.seconds, id).toBeLessThanOrEqual(SFX_MAX_S);
      const af = soundFilter(s);
      expect(af).toContain(`afade=t=in:st=0:d=${FADE_IN_S}:curve=cub`);
      expect(af.match(/highpass=f=150/g)).toHaveLength(2);
      expect(valueAfter(rocketArgs(id, 'o.m4a')!, '-af')).toBe(af);
      expect(buildArgs(id as never, 'o.m4a')).toEqual(rocketArgs(id, 'o.m4a'));
    }
    expect(rocketArgs('sfx.shell.pop', 'o.m4a')).toBeUndefined();
  });
});
