// Story 3.1: the `review` and banned-phrase voice rules of content/validate.ts.
import { describe, expect, it } from 'vitest';
import { BANNED_PHRASES, NAME_WORD, PROMPT_INTENTS, REVIEW_WORDS, hasPhrase, reviewLines, validateContent, voiceWords } from './validate';
import { GAME_IDS } from './types';
import { VOICE_LINES, type VoiceLine } from './voice-lines';

function check(lines: readonly VoiceLine[]): string[] {
  return validateContent({
    gameIds: ['ice-cream', 'pizza'],
    voice: { lines, hashLine: () => 'h', fileExists: () => true, listVoiceFiles: () => [], readHash: () => 'h' },
  });
}

describe('voice rules (Story 3.1)', () => {
  it('hasPhrase matches whole word sequences, case- and punctuation-insensitive', () => {
    expect(hasPhrase('Bé ơi, | ba lát xúc xích nào!', 'xúc xích')).toBe(true);
    expect(hasPhrase('Xúc, xích!', 'xúc xích')).toBe(true);
    expect(hasPhrase('xúc nấm xích', 'xúc xích')).toBe(false);
    expect(hasPhrase('Sai rồi', 'sai')).toBe(true);
    expect(hasPhrase('Sài Gòn', 'sai')).toBe(false);
    expect(hasPhrase('Giỏi quá!', 'giỏi quá')).toBe(true);
  });

  it('an unapproved line containing a review word must carry review, naming the id', () => {
    expect(REVIEW_WORDS).toEqual(['pizza', 'xúc xích', 'năm lát nấm']);
    expect(check([{ id: 'vo.pizza.x', text: 'Một lát xúc xích!' }])).toEqual(['voice "vo.pizza.x": contains "xúc xích" but has no review (a reason for a parent to listen)']);
    expect(check([{ id: 'vo.pizza.x', text: 'Một lát xúc xích!', review: 'hard word' }])).toEqual([]);
    expect(check([{ id: 'vo.pizza.x', text: 'Một lát xúc xích!', review: '  ' }])).toHaveLength(1);
    expect(reviewLines([{ id: 'vo.pizza.x', text: 'Một lát xúc xích!', review: '' }])).toEqual([]);
    expect(check([{ id: 'vo.pizza.x', text: 'Một lát xúc xích!', approved: { textHash: 'h' } }])).toEqual([]);
  });

  it('Story 3.2: "năm lát nấm" needs review; "năm lát" or "lát nấm" alone does not', () => {
    expect(check([{ id: 'vo.pizza.z', text: 'Bé ơi, | năm lát nấm nào!', keywordPauseMs: 300 }])).toEqual(['voice "vo.pizza.z": contains "năm lát nấm" but has no review (a reason for a parent to listen)']);
    expect(check([{ id: 'vo.pizza.z', text: 'Bé ơi, | năm lát nấm nào!', keywordPauseMs: 300, review: 'năm/nấm' }])).toEqual([]);
    expect(check([{ id: 'vo.pizza.z', text: 'Bé ơi, | bốn lát nấm nào!', keywordPauseMs: 300 }])).toEqual([]);
    expect(check([{ id: 'vo.pizza.z', text: 'Đủ năm lát rồi!' }])).toEqual([]);
  });

  it('a banned phrase fails naming the id', () => {
    expect(BANNED_PHRASES).toContain('giỏi');
    expect(check([{ id: 'vo.pizza.y', text: 'Bé giỏi lắm!' }])).toEqual(['voice "vo.pizza.y": banned phrase "giỏi" (no "wrong" and no praise)']);
    expect(check([{ id: 'vo.pizza.y', text: 'Không đúng.' }])).toEqual(['voice "vo.pizza.y": banned phrase "không đúng" (no "wrong" and no praise)']);
  });

  it('the real lines: no banned phrase; the review list holds the pizza and sausage lines', () => {
    for (const l of VOICE_LINES) for (const p of BANNED_PHRASES) expect(hasPhrase(l.text, p), `${l.id} / ${p}`).toBe(false);
    const ids = reviewLines(VOICE_LINES).map((l) => l.id);
    expect(ids).toContain('vo.shell.station-name.pizza');
    expect(ids).toContain('vo.shell.invite.pizza');
    expect(ids).toContain('vo.pizza.ask.sausage.3');
    expect(ids).toContain('vo.pizza.retry.sausage');
    expect(ids).toContain('vo.pizza.ask.sausage.5');
    expect(ids).toContain('vo.pizza.ask.mushroom.5');
    expect(ids).not.toContain('vo.pizza.ask.mushroom.3');
    expect(ids).not.toContain('vo.pizza.ask.pepper.5');
  });
});

describe('the name rule (Story 5.2, FR36/NFR3)', () => {
  const hasName = (text: string): boolean => voiceWords(text).includes(NAME_WORD);

  it('the name in praise-like intents fails naming the id; in a prompt intent it passes', () => {
    expect(check([{ id: 'vo.pizza.happy', text: 'Xoài ơi, vui quá!' }])).toEqual([
      'voice "vo.pizza.happy": the name "Xoài" is only for greetings, invitations and prompts (never praise)',
    ]);
    expect(check([{ id: 'vo.pizza.ask.x', text: 'Xoài ơi, | một lát nấm nào!', keywordPauseMs: 300 }])).toEqual([]);
    expect(check([{ id: 'vo.pizza.count.1', text: 'Xoài, một!' }])).toHaveLength(1);
  });

  it('the real lines: every game has a named ask/prompt/scene line; the greeting and every invite name Xoài', () => {
    for (const game of GAME_IDS) {
      const named = VOICE_LINES.filter((l) => {
        const [, scope, intent] = l.id.split('.');
        return scope === game && /^(ask|prompt|scene)$/.test(intent ?? '') && hasName(l.text);
      });
      expect(named.length, game).toBeGreaterThan(0);
    }
    const greeting = VOICE_LINES.find((l) => l.id === 'vo.shell.greeting');
    expect(greeting?.text).toBe('Xoài ơi, chơi gì nào?');
    const invites = VOICE_LINES.filter((l) => l.id.startsWith('vo.shell.invite.'));
    expect(invites.length).toBeGreaterThan(0);
    for (const l of invites) expect(hasName(l.text), l.id).toBe(true);
  });
});

describe('prompt length (Story 5.3, NFR15)', () => {
  const lengthCheck = (lines: readonly VoiceLine[], ms: (path: string) => number | undefined, exists: (path: string) => boolean = () => true): string[] =>
    validateContent({
      gameIds: ['ice-cream', 'pizza'],
      voice: { lines, hashLine: () => 'h', fileExists: exists, listVoiceFiles: () => [], readHash: () => 'h', durationMs: ms, promptMaxMs: 4000 },
    });

  it('the prompt intents are the hint prompt and retry families', () => {
    expect(PROMPT_INTENTS).toEqual(['ask', 'ask-order', 'order-first', 'order-next', 'prompt', 'retry', 'bake', 'enough', 'parent']);
  });

  it('a prompt over promptMaxMs fails naming the id; at the limit it passes', () => {
    const line = { id: 'vo.pizza.ask.x', text: 'Một lát nấm nào!' };
    expect(lengthCheck([line], () => 4210)).toEqual(['voice "vo.pizza.ask.x": prompt lasts 4.21 s (at most 4 s, NFR15)']);
    expect(lengthCheck([line], () => 4000)).toEqual([]);
    expect(lengthCheck([{ id: 'vo.pizza.retry.x', text: 'Mình tìm nấm nhé!' }], () => 4500)).toHaveLength(1);
  });

  it('an unreadable length fails; a non-prompt intent is not measured; a missing file only reports missing', () => {
    expect(lengthCheck([{ id: 'vo.pizza.ask.x', text: 'Nấm nào!' }], () => undefined)).toEqual(['voice "vo.pizza.ask.x": cannot read the audio length']);
    expect(lengthCheck([{ id: 'vo.pizza.name.x', text: 'Nấm!' }], () => 9000)).toEqual([]);
    const missing = lengthCheck([{ id: 'vo.pizza.ask.x', text: 'Nấm nào!' }], () => 9000, (p) => !p.endsWith('.m4a'));
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain('is missing');
  });

  it('without durationMs (unit tests of other rules) nothing is measured', () => {
    expect(check([{ id: 'vo.pizza.ask.x', text: 'Nấm nào!' }])).toEqual([]);
  });
});
