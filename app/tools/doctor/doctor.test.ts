import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { doctor } from './doctor.ts';

/** An app root whose folder and parent have no .env (the key comes only from the env passed in). */
const NO_DOTENV = join(tmpdir(), 'bhc-doctor-none', 'app');

describe('doctor', () => {
  it('reports Blender, ffmpeg and the ElevenLabs key together', () => {
    const lines = doctor({ ELEVENLABS_API_KEY: 'k' }, () => true, () => 'Blender 5.2.2 LTS\n', NO_DOTENV);
    expect(lines.map((l) => [l.tool, l.ok])).toEqual([
      ['Blender', true],
      ['ffmpeg', true],
      ['ElevenLabs', true],
    ]);
    expect(lines[0]!.detail).toBe('Blender 5.2.2 LTS (blender)');
  });

  it('reports every missing tool and a wrong Blender version', () => {
    const lines = doctor({}, (bin) => bin === 'blender', () => 'Blender 4.2.0\n', NO_DOTENV);
    expect(lines.every((l) => !l.ok)).toBe(true);
    expect(lines[0]!.detail).toMatch(/needs Blender 5\.2 \(found 4\.2\.0\)/);
    expect(lines[1]!.detail).toMatch(/^ffmpeg not found/);
    expect(lines[2]!.detail).toMatch(/^ELEVENLABS_API_KEY not set/);
  });
});
