import { describe, expect, it } from 'vitest';
import { ATLASES, BACKGROUNDS } from '../assets';
import { AUDIO_CATALOG } from '../audio-catalog';
import { GAME_ICONS } from '../game-icons';
import { STATIONS } from '../stations';
import { VOICE_LINES } from '../voice-lines';
import { GAME_CONTENT } from './index';
import { RACE_KART, RACE_PATH_IDS, RACE_SCREEN, SFX, assets, ladder } from './race';

describe('race content (Stories 4.1, 4.2)', () => {
  it('4 levels straight → curve → zigzag → loop; roads 3/4/4/3 ∈ [3, 5]; ≥ 2 distinct path ids, each `<shape>-`', () => {
    expect(ladder.map((l) => l.shape)).toEqual(['straight', 'curve', 'zigzag', 'loop']);
    expect(ladder.map((l) => l.roads)).toEqual([3, 4, 4, 3]);
    expect(ladder[0]).toEqual({ id: 'straight', shape: 'straight', roads: 3, pathIds: ['straight-1', 'straight-2', 'straight-3'] });
    for (const l of ladder) {
      expect(l.roads).toBeGreaterThanOrEqual(3);
      expect(l.roads).toBeLessThanOrEqual(5);
      expect(new Set(l.pathIds).size).toBeGreaterThanOrEqual(2);
      for (const id of l.pathIds) expect(id.startsWith(`${l.shape}-`), id).toBe(true);
    }
    expect(RACE_PATH_IDS).toHaveLength(12);
  });

  it('the screen, the kart facing, the assets and every race line and SFX', () => {
    expect(RACE_SCREEN.anchors).toEqual(['kart', 'gate', 'cone-1', 'cone-2', 'cone-3', 'cone-4', 'flag-1', 'flag-2']);
    expect(RACE_SCREEN.frames).toEqual(['kart/idle/00', 'kart/wave/00', 'kart/wave/01', 'kart/wave/02', 'kart/wave/03', 'gate/idle/00', 'cone/idle/00', 'flag/idle/00']);
    expect(RACE_KART.artFacing).toBe(1);
    expect(assets.atlases).toEqual([ATLASES.race]);
    expect(assets.images).toEqual([BACKGROUNDS.race]);
    expect(assets.audio).toEqual(['vo.race.prompt', 'vo.race.retry', 'vo.race.parent.1', SFX.engine, SFX.horn, SFX.happy]);
    for (const id of Object.values(SFX)) expect(AUDIO_CATALOG[id]).toBeDefined();
  });

  it('the station is awake and registered; invite line; the kart icon keeps its source colours', () => {
    expect(STATIONS.find((s) => s.id === 'race')?.awake).toBe(true);
    expect(GAME_CONTENT.race?.ladder).toBe(ladder);
    const ids = VOICE_LINES.map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining(['vo.shell.invite.race']));
    expect(GAME_ICONS.race).toEqual({ model: 'kenney/kenney_car-kit/Models/GLB format/kart-oobi.glb' });
  });
});
