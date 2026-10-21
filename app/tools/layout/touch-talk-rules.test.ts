// Story 4.5: validateTouchTalk, the scene-bubble column, the multi-plate merge and blenderArgs' scene.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ScreenLayout } from '../../src/content/layout-types.ts';
import { TOUCH_TALK_SCENES, TOUCH_TALK_SCREEN } from '../../src/content/games/touch-talk.ts';
import { hudLayout } from '../../src/core/hud.ts';
import { sceneBubbleCentres } from '../../src/core/scene-bubbles.ts';
import { Tokens } from '../../src/core/tokens.ts';
import { blenderArgs } from '../render/blender.ts';
import { mergePlates, plateLayout } from '../render/render.ts';
import { hudKeepOutRects, sceneBubbleKeepOutRect } from './hud-keep-out.ts';
import { atlasFrames, touchTalkLimits, validateTouchTalk, type AtlasJsonLike } from './rules.ts';

const APP = join(import.meta.dirname, '..', '..');
const real = (): ScreenLayout => JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', 'touch-talk.layout.json'), 'utf8')) as ScreenLayout;
const realAtlas = (): AtlasJsonLike => atlasFrames(JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', 'touch-talk.json'), 'utf8')));
const scenes = TOUCH_TALK_SCENES.map((s) => ({ id: s.id, props: s.props.map((p) => p.id) }));
const limits = () => touchTalkLimits(TOUCH_TALK_SCREEN, scenes, sceneBubbleKeepOutRect());
const box = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

describe('validateTouchTalk (Story 4.5)', () => {
  it('the real layout and atlas pass', () => {
    expect(validateTouchTalk(real(), limits(), realAtlas())).toEqual([]);
  });

  it('Small hit, Too close, HUD / column and edge cases fail naming the ids', () => {
    const l = real();
    const thin = validateTouchTalk({ ...l, hits: { ...l.hits, 'prop-crab': box(300, 600, 200, 60) } }, limits());
    expect(thin.some((m) => m.startsWith('hit "prop-crab": 60 px wide'))).toBe(true);
    const near = validateTouchTalk({ ...l, hits: { ...l.hits, 'prop-crab': box(300, 400, 100, 100), 'prop-shell': box(420, 400, 100, 100) } }, limits());
    expect(near).toContain('hits "prop-crab" and "prop-shell" (sea): 20 px apart (min 24)');
    const speaker = validateTouchTalk({ ...l, hits: { ...l.hits, 'prop-boat': box(860, 120, 100, 100) } }, limits());
    expect(speaker.some((m) => m.startsWith('hit "prop-boat": reaches into the Home/Speaker keep-out zone'))).toBe(true);
    const column = validateTouchTalk({ ...l, hits: { ...l.hits, 'prop-boat': box(800, 400, 120, 100) } }, limits());
    expect(column.some((m) => m.startsWith('hit "prop-boat": reaches into the scene-bubble column'))).toBe(true);
    const edge = validateTouchTalk({ ...l, hits: { ...l.hits, 'prop-coconut': box(10, 500, 100, 100) } }, limits());
    expect(edge.some((m) => m.startsWith('hit "prop-coconut": (10, 500) leaves the interactive rect'))).toBe(true);
  });

  it('a missing hull or frame is named; a prop off the size band fails', () => {
    const l = real();
    const { 'prop-fish': _f, ...hits } = l.hits;
    expect(validateTouchTalk({ ...l, hits }, limits())).toContain('hit "prop-fish": missing or has fewer than 3 points');
    const frames: Record<string, { spriteSourceSize: { x: number; y: number; w: number; h: number } }> = {};
    for (const f of TOUCH_TALK_SCREEN.frames) frames[f] = { spriteSourceSize: { x: 0, y: 0, w: 300, h: 100 } };
    frames['crab/idle/00'] = { spriteSourceSize: { x: 0, y: 0, w: 600, h: 100 } };
    expect(validateTouchTalk(l, limits(), { frames })).toContain('frame "crab/idle/00": longest side 300 is not in [100, 220]');
    delete frames['crab/react/00'];
    expect(validateTouchTalk(l, limits(), { frames })).toContain('atlas "touch-talk": frame "crab/react/00" is missing');
  });
});

describe('scene bubbles (Story 4.5)', () => {
  it('two columns of 3: the first under the Speaker, a bubble and a gap apart; the second one bubble + gap to its left; the keep-out rect covers both grown by the gap at both aspects', () => {
    const hud = hudLayout({ x: 0, y: 0, w: 1024, h: 768 }, { top: 0, right: 0, bottom: 0, left: 0 });
    const c = sceneBubbleCentres(hud, 6);
    const size = Tokens.components.sceneBubble.base.size;
    const gap = Tokens.spacing.targetGap;
    expect(c[0]).toEqual({ x: hud.speaker.x, y: hud.speaker.y + Tokens.ui.hudKeepOutPx / 2 + gap + size / 2 });
    expect(c[1]).toEqual({ x: c[0]!.x, y: c[0]!.y + size + gap });
    expect(c[2]).toEqual({ x: c[0]!.x, y: c[0]!.y + 2 * (size + gap) });
    for (let i = 0; i < 3; i++) expect(c[i + 3]).toEqual({ x: c[i]!.x - (size + gap), y: c[i]!.y });
    const col = sceneBubbleKeepOutRect();
    expect(col.w).toBe(2 * size + 3 * gap);
    expect(sceneBubbleKeepOutRect(3).w).toBe(size + 2 * gap);
    for (const p of c) {
      expect(p.x - size / 2 - gap).toBeGreaterThanOrEqual(col.x - 1e-9);
      expect(p.x + size / 2 + gap).toBeLessThanOrEqual(col.x + col.w + 1e-9);
      expect(p.y + size / 2 + gap).toBeLessThanOrEqual(col.y + col.h + 1e-9);
    }
    // No two bubbles overlap, and their gaps are at least targetGap.
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) expect(Math.hypot(c[i]!.x - c[j]!.x, c[i]!.y - c[j]!.y)).toBeGreaterThanOrEqual(size + gap);
    // The column starts below the Speaker's keep-out zone.
    const speakerZones = hudKeepOutRects().filter((r) => r.x > 512);
    for (const z of speakerZones) expect(col.y).toBeGreaterThan(z.y);
  });
});

describe('multi-plate render (Story 4.5)', () => {
  const plateDir = (dir: string, plate: string, objects: string[], frames: string[]) => {
    const sub = join(dir, `plate-${plate}`);
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, 'raw.json'), JSON.stringify({ screenId: 'touch-talk', render: { width: 2048, height: 1536 }, objects: objects.map((name) => ({ name, type: 'MESH', points: [] })), frames }));
    for (const f of frames) {
      mkdirSync(join(sub, 'frames', f, '..'), { recursive: true });
      writeFileSync(join(sub, 'frames', `${f}.png`), 'x');
    }
    writeFileSync(join(sub, 'bg.png'), plate);
  };

  it('merges the plates: frames, bg-<plate>.png, objects; the same object or frame in two plates fails naming it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bhc-plates-'));
    plateDir(dir, 'sea', ['hit.prop-crab'], ['crab/idle/00']);
    plateDir(dir, 'street', ['hit.prop-car'], ['car/idle/00']);
    const { raw, objectsOf } = mergePlates(dir, 'touch-talk', ['sea', 'street']);
    expect(raw.objects.map((o) => o.name)).toEqual(['hit.prop-crab', 'hit.prop-car']);
    expect(raw.frames).toEqual(['crab/idle/00', 'car/idle/00']);
    expect(readFileSync(join(dir, 'bg-street.png'), 'utf8')).toBe('street');
    expect(readFileSync(join(dir, 'frames', 'car', 'idle', '00.png'), 'utf8')).toBe('x');
    const l = { anchors: {}, hits: { 'prop-crab': [], 'prop-car': [] }, slots: {}, paths: {} } as unknown as ScreenLayout;
    expect(Object.keys(plateLayout(l, objectsOf.get('sea')!).hits)).toEqual(['prop-crab']);
    const clash = mkdtempSync(join(tmpdir(), 'bhc-plates-'));
    plateDir(clash, 'sea', ['hit.prop-x'], ['x/idle/00']);
    plateDir(clash, 'street', ['hit.prop-x'], ['x/idle/00']);
    expect(() => mergePlates(clash, 'touch-talk', ['sea', 'street'])).toThrow();
    try {
      mergePlates(clash, 'touch-talk', ['sea', 'street']);
    } catch (e) {
      expect((e as { problems: string[] }).problems).toEqual(['layout object "hit.prop-x" is in plates "sea" and "street"', 'frame "x/idle/00.png" is in plates "sea" and "street"']);
    }
  });

  it('blenderArgs: -S <scene> after the file only for a plate', () => {
    expect(blenderArgs('a.blend', 's.py', ['--out', 'o'])).toEqual(['-b', '--factory-startup', 'a.blend', '--python-exit-code', '1', '--python', 's.py', '--', '--out', 'o']);
    expect(blenderArgs('a.blend', 's.py', [], 'sea').slice(0, 5)).toEqual(['-b', '--factory-startup', 'a.blend', '-S', 'sea']);
  });
});

describe('Story 4.6: thumbnails and the scene-thumb id rule', () => {
  it('addSceneThumbs: a circle-masked square of the bubble inner size per plate; deterministic', async () => {
    const sharp = (await import('sharp')).default;
    const { addSceneThumbs } = await import('../render/render.ts');
    const run = async (): Promise<Buffer> => {
      const dir = mkdtempSync(join(tmpdir(), 'bhc-thumbs-'));
      await sharp({ create: { width: 2048, height: 1536, channels: 3, background: '#3399ff' } }).png().toFile(join(dir, 'bg-sea.png'));
      const raw = { screenId: 'touch-talk', render: { width: 2048, height: 1536 }, objects: [], frames: [] as string[] };
      await addSceneThumbs(dir, raw, ['sea'], 2);
      expect(raw.frames).toEqual(['scene-thumb-sea/idle/00']);
      return readFileSync(join(dir, 'frames', 'scene-thumb-sea', 'idle', '00.png'));
    };
    const a = await run();
    expect(a.equals(await run())).toBe(true);
    const { data, info } = await sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const side = (Tokens.components.sceneBubble.base.size - 2 * Tokens.ui.sceneBubbleInsetPx) * 2;
    expect(info.width).toBe(side);
    expect(data[3]).toBe(0);
    expect(data[((side / 2) * side + side / 2) * 4 + 3]).toBe(255);
  });

  it('every scene thumbnail frame is required; a prop id starting with scene-thumb fails', () => {
    expect(TOUCH_TALK_SCREEN.frames).toEqual(expect.arrayContaining(TOUCH_TALK_SCENES.map((s) => `scene-thumb-${s.id}/idle/00`)));
    expect(TOUCH_TALK_SCENES).toHaveLength(6);
    const bad = touchTalkLimits(TOUCH_TALK_SCREEN, [{ id: 'sea', props: ['scene-thumb-x'] }], sceneBubbleKeepOutRect());
    expect(validateTouchTalk(real(), bad)).toContain('prop "scene-thumb-x" (sea): an id may not start with "scene-thumb"');
  });
});
