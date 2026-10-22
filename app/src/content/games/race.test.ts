import { describe, expect, it } from 'vitest';
import { ATLASES, BACKGROUNDS } from '../assets';
import { AUDIO_CATALOG } from '../audio-catalog';
import { GAME_ICONS } from '../game-icons';
import { STATIONS } from '../stations';
import { VOICE_LINES } from '../voice-lines';
import { GAME_CONTENT } from './index';
import { RACE_KART, RACE_PATH_IDS, RACE_SCREEN, SFX, assets, ladder } from './race';

describe('race content (Stories 4.1, 4.2)', () => {
  it('8 levels straight → curve → zigzag → loop → wave → hairpin → snake → spiral; roads 3/4/4/3/4/4/5/5 ∈ [3, 5]; ≥ 2 distinct path ids, each `<shape>-`', () => {
    expect(ladder.map((l) => l.shape)).toEqual(['straight', 'curve', 'zigzag', 'loop', 'wave', 'hairpin', 'snake', 'spiral']);
    expect(ladder.map((l) => l.roads)).toEqual([3, 4, 4, 3, 4, 4, 5, 5]);
    expect(ladder[0]).toEqual({ id: 'straight', shape: 'straight', roads: 3, pathIds: ['straight-1', 'straight-2', 'straight-3'] });
    for (const l of ladder) {
      expect(l.roads).toBeGreaterThanOrEqual(3);
      expect(l.roads).toBeLessThanOrEqual(5);
      expect(new Set(l.pathIds).size).toBeGreaterThanOrEqual(2);
      for (const id of l.pathIds) expect(id.startsWith(`${l.shape}-`), id).toBe(true);
    }
    expect(RACE_PATH_IDS).toHaveLength(24);
  });

  it('2026-10-22 harder roads: the first four levels are unchanged (a saved level keeps its shape); the new ones are appended, 3 path ids each, ids unique across the ladder', () => {
    expect(ladder.slice(0, 4).map((l) => l.id)).toEqual(['straight', 'curve', 'zigzag', 'loop']);
    expect(ladder[3]).toEqual({ id: 'loop', shape: 'loop', roads: 3, pathIds: ['loop-1', 'loop-2', 'loop-3'] });
    for (const l of ladder.slice(4)) {
      expect(l.id).toBe(l.shape);
      expect(l.pathIds).toEqual([1, 2, 3].map((n) => `${l.shape}-${n}`));
    }
    const all = ladder.flatMap((l) => l.pathIds);
    expect(new Set(all).size).toBe(all.length);
    expect(Math.max(...ladder.map((l) => l.roads))).toBe(5);
    expect(ladder[ladder.length - 1]).toMatchObject({ shape: 'spiral', roads: 5 });
  });

  it('the screen, the kart facing, the assets and every race line and SFX', () => {
    const yaws = ['0', '30', '60', '90', '120', '150'];
    expect(RACE_SCREEN.anchors).toEqual(['kart', 'gate', ...yaws.flatMap((d) => [`gate-cross-${d}`, `gate-post-${d}`]), 'cone-1', 'cone-2', 'cone-3', 'cone-4', 'flag-1', 'flag-2']);
    expect(RACE_SCREEN.frames).toEqual(['kart/idle/00', 'kart/wave/00', 'kart/wave/01', 'kart/wave/02', 'kart/wave/03', ...yaws.map((d) => `gate/${d}/00`), 'cone/idle/00', 'flag/idle/00']);
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
