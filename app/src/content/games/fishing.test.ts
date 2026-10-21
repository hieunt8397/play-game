import { describe, expect, it } from 'vitest';
import { relativeLuminance } from '../../../tools/lint/hint-contrast';
import { Tokens } from '../../core/tokens';
import { ATLASES, BACKGROUNDS } from '../assets';
import { AUDIO_CATALOG } from '../audio-catalog';
import { GAME_ICONS } from '../game-icons';
import { STATIONS } from '../stations';
import { VOICE_LINES } from '../voice-lines';
import { ALL_FISH, FISHING_SCREEN, FISH_CAPACITY, FISH_COLORS, FISH_PATTERN, FISH_SIZES, SFX, assets, ladder } from './fishing';
import { GAME_CONTENT } from './index';

describe('fishing content (Story 4.3)', () => {
  it('the ladder starts with 3 fish and colour questions; every level fits the pond; distinct patterns', () => {
    expect(ladder[0]).toEqual({ id: 'color-3', ask: 'color', fish: 3, questions: 3 });
    expect(ladder[ladder.length - 1]!.fish).toBe(5);
    for (const l of ladder) expect(l.fish).toBeLessThanOrEqual(FISH_CAPACITY);
    expect(new Set(Object.values(FISH_PATTERN)).size).toBe(FISH_COLORS.length);
    expect(FISH_SIZES).toEqual(['small', 'big']);
  });

  it('the screen: anchors, the pond hit and every colour × size frame', () => {
    expect(FISHING_SCREEN.anchors).toEqual(['dock', 'rod-tip', 'catch']);
    expect(FISHING_SCREEN.hits).toEqual(['pond-swim']);
    expect(ALL_FISH).toHaveLength(6);
    expect(FISHING_SCREEN.frames).toHaveLength(6 * 7);
    expect(FISHING_SCREEN.frames).toContain('fish-blue-big/caught/01');
    expect(FISHING_SCREEN.frames).toContain('fish-yellow-small/dive/00');
  });

  it('assets, lines, SFX, the awake station and the koi icon', () => {
    expect(assets.atlases).toEqual([ATLASES.fishing]);
    expect(assets.images).toEqual([BACKGROUNDS.fishing]);
    for (const id of Object.values(SFX)) expect(AUDIO_CATALOG[id]).toBeDefined();
    const ids = VOICE_LINES.map((l) => l.id);
    for (const c of FISH_COLORS) {
      expect(ids).toEqual(expect.arrayContaining([`vo.fishing.prompt.color-${c}`, `vo.fishing.retry.color-${c}`, `vo.fishing.name.${c}-small`, `vo.fishing.name.${c}-big`]));
    }
    expect(ids).toEqual(expect.arrayContaining(['vo.shell.invite.fishing']));
    expect(STATIONS.find((s) => s.id === 'fishing')?.awake).toBe(true);
    expect(GAME_CONTENT.fishing?.ladder).toBe(ladder);
    expect(GAME_ICONS.fishing).toEqual({ model: 'quaternius/cutefish/Koi.fbx', creature: 'creatureOrange' });
  });

  it('art.fishing: the body colours differ pairwise in luminance by ≥ 0.2', () => {
    const f = Tokens.art.fishing;
    const lum = (c: { value: number }) => relativeLuminance([(c.value >> 16) & 255, (c.value >> 8) & 255, c.value & 255]);
    const ls = FISH_COLORS.map((c) => lum(f[c]));
    for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) expect(Math.abs(ls[i]! - ls[j]!)).toBeGreaterThanOrEqual(0.2);
  });
});
