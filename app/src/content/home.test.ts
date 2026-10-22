// Story 7.1: the yard's corner list and its lines.
import { describe, expect, it } from 'vitest';
// The registry (games/registry › isGameId) pairs GAME_CONTENT with scene classes; Phaser does not load in node.
import { GAME_CONTENT } from './games/index';
import {
  CORNER_IDS,
  cornerFrame,
  cornerNameLine,
  cornerOfGame,
  HOME_ASSETS,
  HOME_SCREEN_REQUIREMENTS,
  HOME_TO_YARD_LINE,
  YARD_CORNERS,
  YARD_INVITE_LINE,
  yardCorners,
} from './home';
import { HOME_STATION, STATIONS } from './stations';
import { inviteLine, isVoiceLineId, stationNameLine, VOICE_LINES } from './voice-lines';

describe('content/home (Story 7.1)', () => {
  it('has the 5 corners of the spec, each with its game id and a parent label', () => {
    expect(YARD_CORNERS.map((c) => [c.id, c.gameId])).toEqual([
      ['pen', 'animal-pens'],
      ['stage', 'band'],
      ['bed', 'bedtime'],
      ['clinic', 'pet-clinic'],
      ['wardrobe', 'dress-up'],
    ]);
    expect(YARD_CORNERS.map((c) => c.id)).toEqual([...CORNER_IDS]);
    expect(cornerOfGame('band')?.id).toBe('stage');
    expect(cornerOfGame('pizza')).toBeUndefined();
  });

  it('every label is the text of its name line; the yard lines exist', () => {
    for (const c of YARD_CORNERS) {
      expect(VOICE_LINES.find((l) => l.id === cornerNameLine(c.id))?.text).toBe(c.label);
    }
    expect(isVoiceLineId(YARD_INVITE_LINE)).toBe(true);
    expect(VOICE_LINES.find((l) => l.id === HOME_TO_YARD_LINE)?.text).toBe('Về nhà nào!');
    expect(VOICE_LINES.find((l) => l.id === stationNameLine(HOME_STATION))?.text).toBe('Nhà Xoài');
    expect(isVoiceLineId(inviteLine(HOME_STATION))).toBe(true);
  });

  it('awake is derived from the registry: with 7.1 alone every corner sleeps; a registered game wakes its corner', () => {
    const playable = (id: string): boolean => Object.prototype.hasOwnProperty.call(GAME_CONTENT, id);
    expect(yardCorners(playable).every((c) => !c.awake)).toBe(true);
    expect(yardCorners((id) => id === 'bedtime').filter((c) => c.awake).map((c) => c.id)).toEqual(['bed']);
  });

  it('the home station is on the island, awake, without decoration slots; the yard screen needs every corner', () => {
    const home = STATIONS.find((s) => s.id === HOME_STATION);
    expect(home).toMatchObject({ label: 'Nhà Xoài', awake: true, slots: [] });
    expect(HOME_SCREEN_REQUIREMENTS).toEqual({ anchors: [...CORNER_IDS], hits: [...CORNER_IDS], slots: [], frames: CORNER_IDS.map(cornerFrame) });
    expect(HOME_ASSETS.atlases.map((a) => a.key)).toEqual(['atlas.home']);
    expect(HOME_ASSETS.images?.map((i) => i.key)).toEqual(['bg.home']);
  });
});
