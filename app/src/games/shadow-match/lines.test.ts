import { describe, expect, it } from 'vitest';
import { ITEM_IDS, ladder } from '../../content/games/shadow-match';
import { VOICE_LINES } from '../../content/voice-lines';
import { askLineId, nameLineId } from './lines';
import { roundQuestions } from './questions';

const voice = new Set<string>(VOICE_LINES.map((l) => l.id));

describe('shadow-match line ids (Story 3.5)', () => {
  it('the ids of an item', () => {
    expect(askLineId('dog')).toBe('vo.shadow-match.ask.dog');
    expect(nameLineId('tractor')).toBe('vo.shadow-match.name.tractor');
  });

  it.each(ITEM_IDS)('%s: its ask and name are voice lines', (id) => {
    expect(voice.has(askLineId(id))).toBe(true);
    expect(voice.has(nameLineId(id))).toBe(true);
  });

  it('every reachable held item of every level (seeds 0…199) has its lines', () => {
    ladder.forEach((_l, level) => {
      for (let seed = 0; seed < 200; seed++) {
        for (const q of roundQuestions(seed, level)) {
          expect(voice.has(askLineId(q.item))).toBe(true);
          expect(voice.has(nameLineId(q.item))).toBe(true);
        }
      }
    });
  });
});
