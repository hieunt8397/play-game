// Chạm là nói batch 3 (2026-10-22): every prop sound is a real recording (not a placeholder recipe), so check the
// mastered files themselves: each exists and lasts ≤ 800 ms (≤ touchTalkNameDelayMs, so the name never starts over it).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AUDIO_CATALOG, AUDIO_IDS } from '../../src/content/audio-catalog.ts';
import { Tokens } from '../../src/core/tokens.ts';
import { m4aDurationMs } from './m4a-duration.ts';

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
/** The name line waits this long after the tap: a longer sound would be talked over. */
const MAX_MS = Tokens.Timing.touchTalkNameDelayMs;
const IDS = AUDIO_IDS.filter((id) => id.startsWith('sfx.touch-talk.'));

describe('Chạm là nói prop recordings', () => {
  it('there are some', () => {
    expect(IDS.length).toBeGreaterThan(0);
  });

  it.each(IDS)(`%s exists and lasts ≤ ${MAX_MS} ms`, (id) => {
    const file = resolve(PUBLIC, AUDIO_CATALOG[id].path);
    expect(existsSync(file), file).toBe(true);
    const ms = m4aDurationMs(readFileSync(file));
    expect(ms, file).toBeDefined();
    expect(ms!).toBeLessThanOrEqual(MAX_MS);
  });
});
