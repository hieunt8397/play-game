// Voice-line hash (Story 1.3). One function for the `.hash` files written by `npm run tts`, the
// content validator and the human approval (`approved.textHash`), so all three always agree.
import { createHash } from 'node:crypto';
import { VOICE_DEFAULTS, type VoiceLine } from '../../src/content/voice-lines.ts';

/** Everything that changes the rendered audio: bump `v` when the render recipe changes. */
export function lineHash(line: Pick<VoiceLine, 'text' | 'keywordPauseMs' | 'rate'>): string {
  const payload = JSON.stringify({
    v: 2,
    model: VOICE_DEFAULTS.model,
    style: VOICE_DEFAULTS.style,
    voice: VOICE_DEFAULTS.voice,
    text: line.text.normalize('NFC'),
    keywordPauseMs: line.keywordPauseMs ?? null,
    rate: line.rate ?? VOICE_DEFAULTS.rate,
  });
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}
