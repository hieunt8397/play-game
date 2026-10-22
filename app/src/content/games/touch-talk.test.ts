import { describe, expect, it } from 'vitest';
import { ATLASES, TOUCH_TALK_PLATES } from '../assets';
import { AUDIO_CATALOG } from '../audio-catalog';
import { GAME_ICONS } from '../game-icons';
import { STATIONS } from '../stations';
import { VOICE_LINES } from '../voice-lines';
import { GAME_CONTENT } from './index';
import * as touchTalk from './touch-talk';
import { ALL_PROPS, TOUCH_TALK_SCENES, TOUCH_TALK_SCENE_SLOTS, assets } from './touch-talk';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('touch-talk content (Story 4.5)', () => {
  it('2026-10-21: six scenes in bubble order, each with 10 props and its own plate', () => {
    expect(TOUCH_TALK_SCENES.map((s) => s.id)).toEqual(['sea', 'street', 'kitchen', 'bathroom', 'bakery', 'picnic']);
    expect(TOUCH_TALK_SCENES.map((s) => s.bg.key)).toEqual(TOUCH_TALK_PLATES.map((p) => `bg.touch-talk.${p}`));
    for (const s of TOUCH_TALK_SCENES) {
      expect(s.props, s.id).toHaveLength(10);
      expect(s.nameLineId).toBe(`vo.touch-talk.scene.${s.id}`);
    }
    expect(ALL_PROPS).toHaveLength(60);
    const lines = new Map<string, string>(VOICE_LINES.map((l) => [l.id, l.text]));
    expect(lines.get('vo.touch-talk.scene.bathroom')).toBe('Xoài ơi, | phòng tắm!');
    expect(lines.get('vo.touch-talk.scene.bakery')).toBe('Xoài ơi, | tiệm bánh!');
    expect(lines.get('vo.touch-talk.scene.picnic')).toBe('Xoài ơi, | đi dã ngoại!');
  });

  it('8–12 props per scene; kebab ids unique across every scene; sounds and names exist', () => {
    const voice = new Set<string>(VOICE_LINES.map((l) => l.id));
    for (const s of TOUCH_TALK_SCENES) {
      expect(s.props.length).toBeGreaterThanOrEqual(8);
      expect(s.props.length).toBeLessThanOrEqual(12);
      expect(voice.has(s.nameLineId), s.nameLineId).toBe(true);
    }
    const ids = ALL_PROPS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of ALL_PROPS) {
      expect(p.id).toMatch(KEBAB);
      expect(p.sfxId in AUDIO_CATALOG, p.sfxId).toBe(true);
      expect(voice.has(p.nameLineId), p.nameLineId).toBe(true);
    }
  });

  it('the sea scene, the bubble slots, the assets; no ladder, no icon entry; awake', () => {
    expect(TOUCH_TALK_SCENES[0]).toMatchObject({ id: 'sea', nameLineId: 'vo.touch-talk.scene.sea' });
    expect(TOUCH_TALK_SCENES[0]!.bg.key).toBe('bg.touch-talk.sea');
    expect(TOUCH_TALK_SCENE_SLOTS).toBe(TOUCH_TALK_SCENES.length);
    expect(assets.atlases).toEqual([ATLASES['touch-talk']]);
    expect(assets.images).toEqual(TOUCH_TALK_SCENES.map((s) => s.bg));
    expect('ladder' in touchTalk).toBe(false);
    expect(GAME_CONTENT['touch-talk']?.ladder).toBeUndefined();
    expect(GAME_ICONS['touch-talk']).toBeUndefined();
    expect(STATIONS.find((s) => s.id === 'touch-talk')?.awake).toBe(true);
  });
});
