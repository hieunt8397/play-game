// Story 7.2: the Ú òa chuồng thú content — animals, their audio and voice ids, the screen and the assets.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AUDIO_CATALOG, isAudioId } from '../audio-catalog';
import { yardCorners } from '../home';
import { m4aDurationMs } from '../../../tools/audio/m4a-duration';
import { isVoiceLineId, VOICE_LINES } from '../voice-lines';
import { ANIMAL_IDS, ANIMAL_PENS_SCREEN, assets, DOOR_COUNT, DOOR_IDS, INVITE_LINE, PEN_ANIMALS, peekFrame, REVEALS_PER_ROUND } from './animal-pens';
import { GAME_CONTENT } from './index';

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public');
const CALL_MAX_MS = 800;

describe('animal-pens content (Story 7.2)', () => {
  it('at least 6 distinct animals, enough to swap behind 4 doors', () => {
    expect(PEN_ANIMALS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ANIMAL_IDS).size).toBe(ANIMAL_IDS.length);
    expect(ANIMAL_IDS.length).toBeGreaterThan(DOOR_COUNT);
    expect(DOOR_IDS).toEqual(['door-1', 'door-2', 'door-3', 'door-4']);
    expect(REVEALS_PER_ROUND).toBeGreaterThan(0);
  });

  it('every animal has its call and muffled call (creature sounds), its name and its ask line', () => {
    for (const a of PEN_ANIMALS) {
      expect(isAudioId(a.callSfx), a.callSfx).toBe(true);
      expect(isAudioId(a.muffledSfx), a.muffledSfx).toBe(true);
      expect(AUDIO_CATALOG[a.callSfx as keyof typeof AUDIO_CATALOG].creature).toBe(true);
      expect(AUDIO_CATALOG[a.muffledSfx as keyof typeof AUDIO_CATALOG].creature).toBe(true);
      expect(isVoiceLineId(a.nameLine), a.nameLine).toBe(true);
      expect(isVoiceLineId(a.askLine), a.askLine).toBe(true);
      const ask = VOICE_LINES.find((l) => l.id === a.askLine)!;
      expect(ask.text.replace('|', '').replace(/\s+/g, ' ')).toContain(a.call);
    }
    expect(isVoiceLineId(INVITE_LINE)).toBe(true);
  });

  it.each(PEN_ANIMALS.flatMap((a) => [a.callSfx, a.muffledSfx]))(`%s is a real recording ≤ ${CALL_MAX_MS} ms`, (id) => {
    const file = resolve(PUBLIC, AUDIO_CATALOG[id as keyof typeof AUDIO_CATALOG].path);
    expect(existsSync(file), file).toBe(true);
    expect(m4aDurationMs(readFileSync(file))!).toBeLessThanOrEqual(CALL_MAX_MS);
  });

  it('the screen needs the doors and every peek frame; the assets list every line and sound', () => {
    expect(ANIMAL_PENS_SCREEN.hits).toEqual(DOOR_IDS);
    expect(ANIMAL_PENS_SCREEN.anchors).toEqual(DOOR_IDS);
    for (const id of ANIMAL_IDS) expect(ANIMAL_PENS_SCREEN.frames).toContain(peekFrame(id));
    for (const a of PEN_ANIMALS) for (const id of [a.callSfx, a.muffledSfx, a.nameLine, a.askLine]) expect(assets.audio).toContain(id);
    for (const l of VOICE_LINES.filter((v) => v.id.startsWith('vo.animal-pens.'))) expect(assets.audio).toContain(l.id);
  });

  it('has game content, which (with its scene in games/registry) wakes the yard pen corner', () => {
    expect(GAME_CONTENT['animal-pens']).toBeDefined();
    const playable = (id: string): boolean => id in GAME_CONTENT;
    expect(yardCorners(playable).find((c) => c.id === 'pen')?.awake).toBe(true);
  });
});
