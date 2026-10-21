import { describe, expect, it, vi } from 'vitest';
import { BLENDER, FFMPEG, blenderVersion, checkBlenderVersion, resolveBinary, resolveBlender } from './binaries.ts';

describe('resolveBinary', () => {
  it('prefers the env override and probes it with the version arg', () => {
    const probe = vi.fn(() => true);
    expect(resolveBinary(FFMPEG, { FFMPEG_BIN: ' C:/x/ffmpeg.exe ' }, probe)).toBe('C:/x/ffmpeg.exe');
    expect(probe).toHaveBeenCalledWith('C:/x/ffmpeg.exe', '-version');
  });

  it('falls back to the name on PATH', () => {
    const probe = vi.fn((bin: string) => bin === 'ffmpeg');
    expect(resolveBinary(FFMPEG, {}, probe)).toBe('ffmpeg');
    expect(probe).toHaveBeenCalledWith('ffmpeg', '-version');
  });

  it('names the tool when it is missing', () => {
    expect(() => resolveBinary(FFMPEG, {}, () => false)).toThrow(/^ffmpeg not found: install ffmpeg .* FFMPEG_BIN/);
    expect(() => resolveBinary(FFMPEG, { FFMPEG_BIN: 'bad' }, () => false)).toThrow(/^ffmpeg not found: FFMPEG_BIN="bad" does not run/);
  });
});

describe('Blender resolution', () => {
  it('parses the version line', () => {
    expect(blenderVersion('Blender 5.2.2 LTS\n\tbuild date: 2026-09-15\n')).toBe('5.2.2');
    expect(blenderVersion('Blender 4.2.0\n')).toBe('4.2.0');
    expect(blenderVersion('nothing here')).toBeUndefined();
  });

  it('accepts only 5.2.x', () => {
    expect(checkBlenderVersion('Blender 5.2.2 LTS')).toBe('5.2.2');
    expect(() => checkBlenderVersion('Blender 4.5.1 LTS')).toThrow(/needs Blender 5\.2 \(found 4\.5\.1\)/);
    expect(() => checkBlenderVersion('Blender 5.20.0')).toThrow(/needs Blender 5\.2 \(found 5\.20\.0\)/);
    expect(() => checkBlenderVersion('')).toThrow(/needs Blender 5\.2 \(found unknown version\)/);
  });

  it('prefers BLENDER_BIN, then `blender` on PATH', () => {
    const probe = vi.fn((bin: string) => bin === 'blender');
    expect(resolveBlender({}, probe, () => 'Blender 5.2.2 LTS')).toBe('blender');
    expect(probe).toHaveBeenCalledWith('blender', '--version');
    expect(resolveBlender({ BLENDER_BIN: 'C:/b/blender.exe' }, () => true, () => 'Blender 5.2.0')).toBe('C:/b/blender.exe');
  });

  it('names Blender and BLENDER_BIN when missing', () => {
    expect(() => resolveBlender({}, () => false, () => '')).toThrow(/^Blender not found: .*BLENDER_BIN/);
    expect(() => resolveBlender({ BLENDER_BIN: 'C:/nope' }, () => false, () => '')).toThrow(/^Blender not found: BLENDER_BIN="C:\/nope"/);
    expect(resolveBinary(BLENDER, { BLENDER_BIN: 'x' }, () => true)).toBe('x');
  });
});
