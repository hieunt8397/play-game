// Story 7.1: the yard's corner list and its lines.
import { describe, expect, it } from 'vitest';
// The registry (games/registry › isGameId) pairs GAME_CONTENT with scene classes; Phaser does not load in node.
import { GAME_CONTENT } from './games/index';
import {
  CORNER_IDS,
  cornerFrame,
  cornerNameLine,
  HOME_ASSETS,
  HOME_SCREEN_REQUIREMENTS,
  YARD_CORNERS,
  YARD_INVITE_LINE,
  yardCorners,
} from './home';
import { HOME_STATION, STATIONS } from './stations';
import { inviteLine, isVoiceLineId, stationNameLine, VOICE_LINES } from './voice-lines';

describe('content/home (Story 7.1)', () => {
  it('has the 10 corners of the specs (2026-10-30: the garden, the car wash; 2026-11-11: the plane; 2026-11-12: the train, the rocket), each with its game id and a parent label', () => {
    expect(YARD_CORNERS.map((c) => [c.id, c.gameId])).toEqual([
      ['pen', 'animal-pens'],
      ['stage', 'band'],
      ['bed', 'bedtime'],
      ['clinic', 'pet-clinic'],
      ['wardrobe', 'dress-up'],
      ['garden', 'garden'],
      ['car-wash', 'car-wash'],
      ['plane', 'plane'],
      ['train', 'train'],
      ['rocket', 'rocket'],
    ]);
    expect(YARD_CORNERS.map((c) => c.id)).toEqual([...CORNER_IDS]);
  });

  it('every label is the text of its name line; the yard lines exist', () => {
    for (const c of YARD_CORNERS) {
      expect(VOICE_LINES.find((l) => l.id === cornerNameLine(c.id))?.text).toBe(c.label);
    }
    expect(isVoiceLineId(YARD_INVITE_LINE)).toBe(true);
    expect(VOICE_LINES.find((l) => l.id === 'vo.shell.home.yard')?.text).toBe('Về nhà nào!');
    expect(VOICE_LINES.find((l) => l.id === stationNameLine(HOME_STATION))?.text).toBe('Nhà Xoài');
    expect(isVoiceLineId(inviteLine(HOME_STATION))).toBe(true);
  });

  it('awake is derived from the registry: a registered game wakes its corner (Story 7.2: the pen; Story 7.3: the stage; Story 7.4: the bed; Story 8.1: the clinic; Story 8.2: the wardrobe; 2026-10-30: the garden, the car wash; 2026-11-11: the plane; 2026-11-12: the train, the rocket), the others sleep', () => {
    const playable = (id: string): boolean => Object.prototype.hasOwnProperty.call(GAME_CONTENT, id);
    expect(yardCorners(playable).filter((c) => c.awake).map((c) => c.id)).toEqual(['pen', 'stage', 'bed', 'clinic', 'wardrobe', 'garden', 'car-wash', 'plane', 'train', 'rocket']);
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
