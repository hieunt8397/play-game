import { describe, expect, it } from 'vitest';
import { GAME_CONTENT } from '../content/games/index';
import type { GameAssets } from '../content/games/types';
import { bootAudio, bootTextures } from './boot-load';
import { AssetTracker, audioUrl, loadPlan, releasePlan } from './game-assets';

const ASSETS: GameAssets = {
  atlases: [{ key: 'atlas.ice-cream', png: 'assets/atlases/ice-cream.png', json: 'assets/atlases/ice-cream.json' }],
  audio: ['vo.shell.greeting', 'sfx.shell.pop', 'vo.ice-cream.unknown'],
};

describe('loadPlan', () => {
  it('atlases and audio with resolved URLs; unknown audio ids skipped', () => {
    expect(loadPlan(ASSETS, () => false)).toEqual([
      { kind: 'atlas', key: 'atlas.ice-cream', png: 'assets/atlases/ice-cream.png', json: 'assets/atlases/ice-cream.json' },
      { kind: 'audio', key: 'vo.shell.greeting', url: 'assets/audio/vo/vo.shell.greeting.m4a' },
      { kind: 'audio', key: 'sfx.shell.pop', url: 'assets/audio/sfx/sfx.shell.pop.m4a' },
    ]);
  });

  it('skips cached keys by cache kind', () => {
    const cached = (kind: string, key: string) => (kind === 'texture' && key === 'atlas.ice-cream') || (kind === 'audio' && key === 'sfx.shell.pop');
    expect(loadPlan(ASSETS, cached).map((c) => c.key)).toEqual(['vo.shell.greeting']);
  });

  it('an empty asset list gives an empty plan', () => {
    expect(loadPlan({ atlases: [], audio: [] }, () => false)).toEqual([]);
  });

  it('audioUrl: undefined for unknown ids', () => {
    expect(audioUrl('nope')).toBeUndefined();
  });
});

describe('images (Story 1.8)', () => {
  const WITH_IMAGE: GameAssets = { ...ASSETS, images: [{ key: 'bg.ice-cream', path: 'assets/bg/ice-cream.png' }] };

  it('loadPlan emits load.image calls after the atlases, skipping cached textures', () => {
    expect(loadPlan(WITH_IMAGE, () => false).slice(0, 2)).toEqual([
      { kind: 'atlas', key: 'atlas.ice-cream', png: 'assets/atlases/ice-cream.png', json: 'assets/atlases/ice-cream.json' },
      { kind: 'image', key: 'bg.ice-cream', url: 'assets/bg/ice-cream.png' },
    ]);
    expect(loadPlan(WITH_IMAGE, (kind, key) => kind === 'texture' && key === 'bg.ice-cream').map((c) => c.key)).not.toContain('bg.ice-cream');
  });

  it('releasePlan releases the image texture', () => {
    expect(releasePlan(WITH_IMAGE)).toContainEqual({ kind: 'texture', key: 'bg.ice-cream' });
  });

  it('Tiệm kem loads its atlas, plate, 52 voice lines (Story 1.10; 5.7 parent lines) and 3 SFX (6.1 sneeze)', () => {
    const plan = loadPlan(GAME_CONTENT['ice-cream']!.assets, () => false);
    expect(plan.filter((c) => c.kind === 'atlas').map((c) => c.key)).toEqual(['atlas.ice-cream']);
    expect(plan.filter((c) => c.kind === 'image').map((c) => c.key)).toEqual(['bg.ice-cream']);
    const audio = plan.filter((c) => c.kind === 'audio').map((c) => c.key);
    expect(audio.filter((k) => k.startsWith('vo.ice-cream.'))).toHaveLength(52);
    expect(audio).toEqual(expect.arrayContaining(['sfx.ice-cream.snap', 'sfx.ice-cream.happy', 'sfx.ice-cream.sneeze']));
  });
});

describe('releasePlan', () => {
  it('lists the texture and audio keys of the game', () => {
    expect(releasePlan(ASSETS)).toEqual([
      { kind: 'texture', key: 'atlas.ice-cream' },
      { kind: 'audio', key: 'vo.shell.greeting' },
      { kind: 'audio', key: 'sfx.shell.pop' },
    ]);
  });
});

describe('AssetTracker', () => {
  it('an empty plan is settled at once', () => {
    const t = new AssetTracker();
    t.track('ice-cream', []);
    expect(t.drainSettled()).toEqual(['ice-cream']);
    expect(t.drainSettled()).toEqual([]);
  });

  it('settles once every key is done (completed or failed), in any order', () => {
    const t = new AssetTracker();
    t.track('ice-cream', ['a', 'b']);
    t.fileDone('b');
    expect(t.drainSettled()).toEqual([]);
    t.fileDone('x');
    t.fileDone('a');
    expect(t.drainSettled()).toEqual(['ice-cream']);
    t.fileDone('a');
    expect(t.drainSettled()).toEqual([]);
  });

  it('loader complete with keys still pending: flushPending settles them and returns each key once', () => {
    const t = new AssetTracker();
    t.track('ice-cream', ['a', 'shared']);
    t.track('pizza', ['shared']);
    t.fileDone('a');
    expect(t.drainSettled()).toEqual([]);
    expect(t.flushPending()).toEqual(['shared']);
    expect(t.drainSettled()).toEqual(['ice-cream', 'pizza']);
    expect(t.flushPending()).toEqual([]);
    expect(t.drainSettled()).toEqual([]);
  });

  it('a shared key settles every game waiting for it', () => {
    const t = new AssetTracker();
    t.track('ice-cream', ['shared']);
    t.track('pizza', ['shared', 'p']);
    t.fileDone('shared');
    expect(t.drainSettled()).toEqual(['ice-cream']);
    t.fileDone('p');
    expect(t.drainSettled()).toEqual(['pizza']);
  });
});

describe('game assets vs Boot', () => {
  it('no game asset key overlaps a boot key (Map keeps the boot keys for the session)', () => {
    const boot = new Set([...bootAudio().map(([key]) => key), ...bootTextures().map((t) => t.key)]);
    for (const [id, content] of Object.entries(GAME_CONTENT)) {
      for (const call of releasePlan(content!.assets)) expect(boot.has(call.key), `${id}: ${call.key}`).toBe(false);
    }
  });
});

describe('multi-page atlases (Story 3.3)', () => {
  it('an atlas with pages > 1 loads as a multiatlas from its JSON folder; one page stays load.atlas', () => {
    const plan = loadPlan(GAME_CONTENT['dino-puzzle']!.assets, () => false);
    expect(plan[0]).toEqual({ kind: 'multiatlas', key: 'atlas.dino-puzzle', json: 'assets/atlases/dino-puzzle.json', path: 'assets/atlases/' });
    expect(plan.filter((c) => c.kind === 'image').map((c) => c.key)).toEqual(['bg.dino-puzzle']);
    expect(loadPlan(GAME_CONTENT.pizza!.assets, () => false)[0]!.kind).toBe('atlas');
  });

  it('Ghép khủng long loads its 6 voice lines and 5 SFX, and releases the multiatlas key', () => {
    const plan = loadPlan(GAME_CONTENT['dino-puzzle']!.assets, () => false);
    const audio = plan.filter((c) => c.kind === 'audio').map((c) => c.key);
    expect(audio.filter((k) => k.startsWith('vo.dino-puzzle.'))).toHaveLength(6);
    expect(audio.filter((k) => k.startsWith('sfx.dino-puzzle.'))).toHaveLength(5);
    expect(releasePlan(GAME_CONTENT['dino-puzzle']!.assets)).toContainEqual({ kind: 'texture', key: 'atlas.dino-puzzle' });
  });
});
