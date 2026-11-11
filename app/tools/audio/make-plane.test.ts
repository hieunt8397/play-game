// Phi công nhí (2026-11-11): the plane game's sound recipes (pure: no ffmpeg here; the files are checked by `npm run check`).
import { describe, expect, it } from 'vitest';
import { AUDIO_CATALOG } from '../../src/content/audio-catalog.ts';
import { FRIENDS, SFX } from '../../src/content/games/plane.ts';
import { soundFilter } from './make-bedtime.ts';
import { FADE_IN_S, SFX_MAX_S, SOUNDS, planeArgs, planeIds } from './make-plane.ts';
import { buildArgs } from './make-placeholders.ts';

const valueAfter = (args: string[], flag: string): string => args[args.indexOf(flag) + 1]!;
const entry = (id: string) => AUDIO_CATALOG[id as keyof typeof AUDIO_CATALOG];

describe('make-plane', () => {
  it('three synthesised SFX in the catalog (propeller, whoosh, boing), none a creature; every reused sound exists', () => {
    expect(planeIds()).toEqual([SFX.propeller, SFX.whoosh, SFX.boing]);
    for (const id of planeIds()) expect(entry(id), id).toMatchObject({ kind: 'sfx' });
    for (const id of planeIds()) expect(entry(id).creature, id).toBeUndefined();
    for (const id of Object.values(SFX)) expect(entry(id), id).toBeDefined();
    // Each friend has its own real call (the pen animals').
    const calls = Object.values(FRIENDS).map((f) => f.callSfx);
    expect(new Set(calls).size).toBe(calls.length);
    for (const id of calls) expect(entry(id), id).toMatchObject({ kind: 'sfx', creature: true });
  });

  it('each ≤ 0.8 s, a 50 ms cubic fade-in and two 150 Hz highpasses; make-placeholders uses the same recipe', () => {
    for (const [id, s] of Object.entries(SOUNDS)) {
      expect(s.seconds, id).toBeLessThanOrEqual(SFX_MAX_S);
      const af = soundFilter(s);
      expect(af).toContain(`afade=t=in:st=0:d=${FADE_IN_S}:curve=cub`);
      expect(af.match(/highpass=f=150/g)).toHaveLength(2);
      expect(valueAfter(planeArgs(id, 'o.m4a')!, '-af')).toBe(af);
      expect(buildArgs(id as never, 'o.m4a')).toEqual(planeArgs(id, 'o.m4a'));
    }
    expect(planeArgs('sfx.shell.pop', 'o.m4a')).toBeUndefined();
  });
});
