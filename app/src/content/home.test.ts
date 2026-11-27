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
  type CornerId,
} from './home';
import type { Point } from './layout-types';
import { LAYOUTS } from './layouts';
import { HOME_STATION, RIDES, STATIONS } from './stations';
import { RIDE_GAME_IDS } from './types';
import { inviteLine, isVoiceLineId, stationNameLine, VOICE_LINES } from './voice-lines';

describe('content/home (Story 7.1)', () => {
  it('has the 7 corners of the specs (2026-10-30: the garden, the car wash; 2026-11-13: the plane, the train and the rocket left for the island), each with its game id and a parent label', () => {
    expect(YARD_CORNERS.map((c) => [c.id, c.gameId])).toEqual([
      ['pen', 'animal-pens'],
      ['stage', 'band'],
      ['bed', 'bedtime'],
      ['clinic', 'pet-clinic'],
      ['wardrobe', 'dress-up'],
      ['garden', 'garden'],
      ['car-wash', 'car-wash'],
    ]);
    expect(YARD_CORNERS.map((c) => c.id)).toEqual([...CORNER_IDS]);
  });

  it('2026-11-13 (nhà búp bê): the labels name the thing, not the game', () => {
    expect(Object.fromEntries(YARD_CORNERS.map((c) => [c.id, c.label]))).toEqual({
      pen: 'Chuồng thú',
      stage: 'Ban nhạc',
      bed: 'Giường ngủ',
      clinic: 'Nhà Shiba',
      wardrobe: 'Tủ đồ',
      garden: 'Vườn rau',
      'car-wash': 'Rửa xe',
    });
  });

  it('2026-11-13 (nhà búp bê): the rendered layout puts the bedroom above the living room, both left of the yard', () => {
    const hull = (id: CornerId): readonly Point[] => LAYOUTS.home.hits[id]!;
    const upstairs: CornerId[] = ['bed', 'wardrobe'];
    const inside: CornerId[] = [...upstairs, 'stage'];
    const outside = CORNER_IDS.filter((id) => !inside.includes(id));
    const bandTop = Math.min(...hull('stage').map((p) => p.y));
    for (const id of upstairs) expect(Math.max(...hull(id).map((p) => p.y))).toBeLessThan(bandTop);
    const rightmostInside = Math.max(...inside.map((id) => Math.max(...hull(id).map((p) => p.x))));
    for (const id of outside) expect(Math.min(...hull(id).map((p) => p.x))).toBeGreaterThan(rightmostInside);
  });

  it('2026-11-13 (nhà búp bê): a tap on the roof, a wall, the slab between the rooms or the open lawn hits no corner', () => {
    const inside = (p: Point, poly: readonly Point[]): boolean => {
      let hit = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]!;
        const b = poly[j]!;
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
      }
      return hit;
    };
    const empty: Point[] = [
      { x: 300, y: 60 }, // the roof
      { x: 40, y: 450 }, // the house's left wall
      { x: 260, y: 395 }, // the slab between the bedroom and the living room
      { x: 480, y: 740 }, // the lawn in front of the house
      { x: 760, y: 320 }, // the lawn between the pen and the car
      { x: 520, y: 520 }, // the lawn between the house and the dog house
    ];
    for (const p of empty) expect(CORNER_IDS.filter((id) => inside(p, LAYOUTS.home.hits[id]!))).toEqual([]);
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

  it('awake is derived from the registry: a registered game wakes its corner (Story 7.2: the pen; Story 7.3: the stage; Story 7.4: the bed; Story 8.1: the clinic; Story 8.2: the wardrobe; 2026-10-30: the garden, the car wash), the others sleep', () => {
    const playable = (id: string): boolean => Object.prototype.hasOwnProperty.call(GAME_CONTENT, id);
    expect(yardCorners(playable).filter((c) => c.awake).map((c) => c.id)).toEqual(['pen', 'stage', 'bed', 'clinic', 'wardrobe', 'garden', 'car-wash']);
    expect(yardCorners((id) => id === 'bedtime').filter((c) => c.awake).map((c) => c.id)).toEqual(['bed']);
  });

  it('2026-11-13: the plane, the train and the rocket are rides on the island, each with its name and invitation lines', () => {
    expect(RIDES.map((r) => r.id).sort()).toEqual([...RIDE_GAME_IDS].sort());
    for (const r of RIDES) {
      expect(Object.prototype.hasOwnProperty.call(GAME_CONTENT, r.id)).toBe(true);
      expect(VOICE_LINES.find((l) => l.id === stationNameLine(r.id))?.text).toBe(r.label);
      expect(isVoiceLineId(inviteLine(r.id))).toBe(true);
      expect(YARD_CORNERS.some((c) => c.gameId === r.id)).toBe(false);
    }
  });

  it('the home station is on the island, awake, without decoration slots; the yard screen needs every corner', () => {
    const home = STATIONS.find((s) => s.id === HOME_STATION);
    expect(home).toMatchObject({ label: 'Nhà Xoài', awake: true, slots: [] });
    expect(HOME_SCREEN_REQUIREMENTS).toEqual({ anchors: [...CORNER_IDS], hits: [...CORNER_IDS], slots: [], frames: CORNER_IDS.map(cornerFrame) });
    expect(HOME_ASSETS.atlases.map((a) => a.key)).toEqual(['atlas.home']);
    expect(HOME_ASSETS.images?.map((i) => i.key)).toEqual(['bg.home']);
  });
});
