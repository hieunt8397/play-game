import { describe, expect, it } from 'vitest';
import { normalizePass1Args, normalizePass2Args, normalizeTarget } from './normalize.ts';

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const measured = { input_i: -24, input_tp: -6, input_lra: 4, input_thresh: -34, target_offset: 0.1 };

describe('audio:normalize args', () => {
  it('music: two-pass loudnorm to I=-30 TP=-3, no fade', () => {
    expect(normalizeTarget('music').preFilter).toBeUndefined();
    expect(valueAfter(normalizePass1Args('src.wav', 'music'), '-af')).toBe('loudnorm=I=-30:TP=-3:LRA=11:print_format=json');
    const pass2 = normalizePass2Args('src.wav', 'music', measured, 'out.m4a');
    expect(valueAfter(pass2, '-af')).toMatch(/^loudnorm=I=-30:TP=-3:LRA=11:measured_I=-24:.*linear=true/);
  });

  it('sfx: 50 ms fade-in before loudnorm to I=-20 TP=-3 (under the −16 voice)', () => {
    expect(valueAfter(normalizePass1Args('pop.wav', 'sfx'), '-af')).toBe('afade=t=in:st=0:d=0.05,loudnorm=I=-20:TP=-3:LRA=11:print_format=json');
    const pass2 = normalizePass2Args('pop.wav', 'sfx', measured, 'out.m4a');
    expect(valueAfter(pass2, '-af')).toMatch(/^afade=t=in:st=0:d=0\.05,loudnorm=I=-20:TP=-3:/);
  });

  it('encodes AAC mono 44.1 kHz 64k to the given file', () => {
    const pass2 = normalizePass2Args('src.wav', 'music', measured, 'out.m4a');
    expect(valueAfter(pass2, '-ac')).toBe('1');
    expect(valueAfter(pass2, '-ar')).toBe('44100');
    expect(valueAfter(pass2, '-c:a')).toBe('aac');
    expect(valueAfter(pass2, '-b:a')).toBe('64k');
    expect(pass2.at(-1)).toBe('out.m4a');
  });
});
