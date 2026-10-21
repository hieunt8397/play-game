import { describe, expect, it } from 'vitest';
import { SPECIES } from '../../content/games/dino-puzzle';
import { AUDIO_CATALOG } from '../../content/audio-catalog';
import { VOICE_LINES } from '../../content/voice-lines';
import { ASK_LINE, RETRY_LINE, callSfxId, nameLineId } from './lines';

const voice = new Set<string>(VOICE_LINES.map((l) => l.id));

describe('dino-puzzle line ids (Story 3.3)', () => {
  it('ask and retry are voice lines', () => {
    expect(ASK_LINE).toBe('vo.dino-puzzle.ask');
    expect(RETRY_LINE).toBe('vo.dino-puzzle.retry');
    expect(voice.has(ASK_LINE)).toBe(true);
    expect(voice.has(RETRY_LINE)).toBe(true);
  });

  it.each(SPECIES)('%s: its name is a voice line and its call a creature sound of the catalog', (s) => {
    expect(nameLineId(s)).toBe(`vo.dino-puzzle.name.${s}`);
    expect(voice.has(nameLineId(s))).toBe(true);
    const call = callSfxId(s);
    expect(call).toBe(`sfx.dino-puzzle.${s}.happy`);
    expect(AUDIO_CATALOG[call as keyof typeof AUDIO_CATALOG]?.creature).toBe(true);
  });
});
