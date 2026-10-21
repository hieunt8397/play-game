// render/art:build CLIs with injected resolver and runner: tests never spawn Blender.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { STATIONS } from '../../src/content/stations.ts';
import { resolveBlender } from '../shared/binaries.ts';
import { ART_DIR, RENDER_DIR, blenderArgs, runBlender, screenSpec, tail } from './blender.ts';
import { ASSETS_DIR, build, buildParams, cutsArg, decorationModels, iconModels, itemsArg } from './build.ts';
import { FRAME_RULE_SCREENS, SCREEN_RULES, SCREEN_SEPARATE, addGhostFrames, layoutFromRaw, layoutPath, previewSvg, render, replaceDir } from './render.ts';
import { atlasFrames } from '../layout/rules.ts';
import type { RawProjection } from '../layout/to-layout.ts';

const noBlender = (): string => resolveBlender({ BLENDER_BIN: 'C:/nope' }, () => false, () => '');
const deps = (resolve: () => string, run = vi.fn()) => ({ env: {}, run, resolve, log: () => {} });

function snapshot(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((f) => `${f}:${statSync(join(dir, f)).mtimeMs}`);
}

describe('Blender arguments and runner', () => {
  it('always passes -b --factory-startup <blend> --python-exit-code 1 --python <script> -- <args>', () => {
    expect(blenderArgs('a.blend', 's.py', ['--out', 'o'])).toEqual(['-b', '--factory-startup', 'a.blend', '--python-exit-code', '1', '--python', 's.py', '--', '--out', 'o']);
  });

  it('a non-zero exit throws with the output tail', () => {
    const run = () => ({ status: 1, stdout: 'line\n'.repeat(40), stderr: 'Traceback\nRuntimeError: boom' });
    expect(() => runBlender(run, 'blender', [])).toThrow(/Blender exited with 1:[\s\S]*RuntimeError: boom/);
    expect(tail('a\nb\nc', 2)).toBe('b\nc');
  });

  it('lists the known screens for a bad one', () => {
    expect(() => screenSpec('foo')).toThrow('unknown screen "foo": known screens are map');
    expect(screenSpec('map').builder).toBe('build_map.py');
  });
});

describe('art:build', () => {
  it('passes Token values to the builder', () => {
    const p = buildParams();
    expect(p.colours.creatureOrange).toBe('#FF9A3C');
    expect(p).toMatchObject({ hitPad: 24, renderScale: 2, design: { width: 1024, height: 768 }, rect: { x0: 24, y0: 66, x1: 1000, y1: 694 } });
  });

  it('Story 1.8: counter colours, flavour art, scoop min size and row gap for the ice-cream builder', () => {
    const p = buildParams();
    expect(p.colours).toMatchObject({ counterPink: '#FFC6E4', counterTop: '#FFFFFF', creatureGreen: '#5CC46A' });
    expect(p.art).toEqual({
      flavour: { strawberry: '#FF8CC6', chocolate: '#6B3E26', vanilla: '#FFF3D6', mint: '#3FA86A' },
      flavourDetail: {
        chip: '#3A2318',
        berry: '#E8364F',
        berrySeed: '#FFE08A',
        berryLeaf: '#4FB84F',
        mintLeaf: '#A6EB8C',
        cone: '#EBBF7A',
        coneLine: '#C98F4E',
      },
      creatureLight: '#FFF8EE',
      pizza: {
        dough: '#F2D49B',
        crust: '#D9A35B',
        sauce: '#E0703A',
        cheese: '#FFE08A',
        sausage: '#B8442A',
        sausageDot: '#F2B48C',
        mushroom: '#F3E6CC',
        pepper: '#84C94F',
        ovenBody: '#C98A5B',
      },
      dino: { apatosaurusBelly: '#CFEFFF', triceratopsBelly: '#D7F2C9', stegosaurusBelly: '#FFE2C2', horn: '#FFF3D6' },
      shadowMatch: { caveInner: '#F6EEDC' },
      fishing: { yellow: '#FFD23F', orange: '#FF9A3C', blue: '#2F6FDB', stripe: '#FFFFFF', dot: '#FFFFFF', line: '#F5F5F5' },
      touchTalk: { white: '#FFFFFF', beak: '#FFC93C', pavement: '#C9CED6', bus: '#FFD23F', skyTop: '#9ED6F7', skyHorizon: '#E6F6FF', seaNear: '#A6E6F6', seaFar: '#6CC8EE', sandLight: '#F5D9A3', sandWet: '#E8C489', verge: '#B4E09A', pavementLine: '#C0C6D0', haze: '#EEF6FC', fin: '#FFD45C', gullTip: '#B8C4D6', shell: '#FFB3C1', coconut: '#7CC46B', boatHull: '#FF7B72', tire: '#3B4252', hub: '#EEF1F5', glass: '#BDE6FF', banana: '#FFD84A', bananaTip: '#8A5A33', egg: '#FFF1DC', melonRind: '#3E9E52', melonStripe: '#2C7A3D', melonLight: '#D9F5C2', melonFlesh: '#FF5D73' },
      map: {
        road: '#EE9F68',
        roadEdge: '#FFFFFF',
        roadDash: '#FFFFFF',
        water: '#BFEFFF',
        foam: '#FFFFFF',
        coneWaffle: '#E9B872',
        coneScoop: '#FF8CC6',
        coneScoopTop: '#FFF3D6',
        coneCherry: '#FF5C8A',
        chimneyBrick: '#E8825E',
        chimneyCap: '#F3E6CC',
        chimneySoot: '#8A5A48',
      },
    });
    expect(p).toMatchObject({ draggableMinSize: 90, rowGap: 180 });
  });

  it('Story 5.6: the map builder gets art.map (the race road keeps colors.road) and the landmark minimum', () => {
    const p = buildParams();
    expect(p.art.map.road).not.toBe(p.colours.road);
    expect(p.colours).toMatchObject({ road: '#5B6270', roadEdge: '#FFF6E0', roadDash: '#FFE15A' });
    expect(p.landmarkMin).toBe(60);
  });

  it('Story 3.1: pizza is a known screen; the builder gets the butter/tray colours and the oven size', () => {
    expect(screenSpec('pizza')).toEqual({ id: 'pizza', source: 'art/src/map-v3.blend', builder: 'build_pizza.py' });
    const p = buildParams();
    expect(p.colours).toMatchObject({ tintButter: '#FFE08A', ovenGlow: '#FF9A3C', creatureOrange: '#FF9A3C' });
    expect(p).toMatchObject({ counterTrayTop: '#FFFFFF', ovenSize: 200 });
  });

  it('ice-cream is a known screen built from the island by its own builder', () => {
    expect(screenSpec('ice-cream')).toEqual({ id: 'ice-cream', source: 'art/src/map-v3.blend', builder: 'build_ice_cream.py' });
  });

  it('fails naming Blender before any work when it is missing', () => {
    const before = snapshot(ART_DIR);
    const run = vi.fn();
    expect(() => build('map', deps(noBlender, run))).toThrow(/^Blender not found: BLENDER_BIN="C:\/nope"/);
    expect(run).not.toHaveBeenCalled();
    expect(snapshot(ART_DIR)).toEqual(before);
  });

  it('Story 2.2: the map catalogue is 28 models with absolute paths, all present in assets/', () => {
    const models = decorationModels();
    expect(models).toHaveLength(28);
    expect(models[0]).toEqual({ id: 'parasol', stationId: 'ice-cream', model: join(ASSETS_DIR, 'kenney', 'kenney_city-kit-commercial_2.1', 'Models', 'GLB format', 'detail-parasol-a.glb') });
    expect(models.filter((m) => !existsSync(m.model))).toEqual([]);
  });

  it('Story 2.2: a missing model fails before Blender runs, naming it; art/ untouched', () => {
    const before = snapshot(ART_DIR);
    const run = vi.fn();
    const exists = (p: string): boolean => !p.endsWith('Puffer.fbx');
    expect(() => build('map', { ...deps(() => 'blender', run), exists })).toThrow(/decoration model\(s\) missing: "puffer" → .*Puffer\.fbx/);
    expect(run).not.toHaveBeenCalled();
    expect(snapshot(ART_DIR)).toEqual(before);
  });

  it('Story 2.2: build_map.py gets --decorations with the catalogue JSON; ice-cream does not', () => {
    let seen: unknown;
    let args: readonly string[] = [];
    const run = vi.fn((_bin: string, a: readonly string[]) => {
      args = a;
      const i = a.indexOf('--decorations');
      if (i >= 0) seen = JSON.parse(readFileSync(a[i + 1]!, 'utf8'));
      return { status: 1, stdout: '', stderr: 'stop here' };
    });
    expect(() => build('map', deps(() => 'blender', run))).toThrow(/stop here/);
    expect(seen).toEqual(decorationModels());
    expect(() => build('ice-cream', deps(() => 'blender', run))).toThrow(/stop here/);
    expect(args).not.toContain('--decorations');
  });

  it('Story 2.4: the play-again icons are ice-cream → ShibaInu.fbx (creatureOrange), present in assets/', () => {
    const icons = iconModels();
    expect(icons).toEqual([
      { id: 'ice-cream', model: join(ASSETS_DIR, 'quaternius', 'animals', 'ShibaInu.fbx'), creature: 'creatureOrange' },
      // Story 3.1: the fox of Tiệm pizza.
      { id: 'pizza', model: join(ASSETS_DIR, 'quaternius', 'animals', 'Fox.fbx'), creature: 'creatureOrange' },
      // Story 4.1: the kid kart of Đường đua, in its source colours (no creature).
      { id: 'race', model: join(ASSETS_DIR, 'kenney', 'kenney_car-kit', 'Models', 'GLB format', 'kart-oobi.glb'), creature: null },
      // Story 4.3: the koi of Câu cá.
      { id: 'fishing', model: join(ASSETS_DIR, 'quaternius', 'cutefish', 'Koi.fbx'), creature: 'creatureOrange' },
      // Story 3.3: the long-neck of Ghép khủng long.
      { id: 'dino-puzzle', model: join(ASSETS_DIR, 'quaternius', 'dinosaurs', 'Apatosaurus.fbx'), creature: 'creatureBlue' },
      // Story 3.5: the triceratops of Hang tìm bóng.
      { id: 'shadow-match', model: join(ASSETS_DIR, 'quaternius', 'dinosaurs', 'Triceratops.fbx'), creature: 'creatureGreen' },
    ]);
    expect(icons.filter((m) => !existsSync(m.model))).toEqual([]);
    expect(buildParams().iconMin).toBe(112);
  });

  it('Story 2.4: build_map.py gets --icons with the icon JSON; a missing icon model fails first', () => {
    let seen: unknown;
    const run = vi.fn((_bin: string, a: readonly string[]) => {
      const i = a.indexOf('--icons');
      if (i >= 0) seen = JSON.parse(readFileSync(a[i + 1]!, 'utf8'));
      return { status: 1, stdout: '', stderr: 'stop here' };
    });
    expect(() => build('map', deps(() => 'blender', run))).toThrow(/stop here/);
    expect(seen).toEqual(iconModels());
    const never = vi.fn();
    const exists = (p: string): boolean => !p.endsWith('ShibaInu.fbx');
    expect(() => build('map', { ...deps(() => 'blender', never), exists })).toThrow(/play-again icon model\(s\) missing: "ice-cream" → .*ShibaInu\.fbx/);
    expect(never).not.toHaveBeenCalled();
  });

  it('a failing builder leaves art/ untouched', () => {
    const before = snapshot(ART_DIR);
    const run = vi.fn(() => ({ status: 1, stdout: '', stderr: 'RuntimeError: build_map: object "X" has a subdivision modifier' }));
    expect(() => build('map', deps(() => 'blender', run))).toThrow(/subdivision modifier/);
    expect(run).toHaveBeenCalledOnce();
    expect(snapshot(ART_DIR)).toEqual(before);
  });
});

describe('render', () => {
  it('fails naming Blender and BLENDER_BIN, writing nothing', async () => {
    const before = [snapshot(RENDER_DIR), existsSync(layoutPath('map')) ? statSync(layoutPath('map')).mtimeMs : 0];
    const run = vi.fn();
    await expect(render('map', deps(noBlender, run))).rejects.toThrow(/Blender not found: BLENDER_BIN/);
    expect(run).not.toHaveBeenCalled();
    expect([snapshot(RENDER_DIR), existsSync(layoutPath('map')) ? statSync(layoutPath('map')).mtimeMs : 0]).toEqual(before);
  });

  it('a Blender failure leaves every output untouched', async () => {
    const before = [snapshot(RENDER_DIR), existsSync(layoutPath('map')) ? statSync(layoutPath('map')).mtimeMs : 0];
    const run = vi.fn(() => ({ status: 1, stdout: '', stderr: 'Python: Traceback' }));
    await expect(render('map', deps(() => 'blender', run))).rejects.toThrow(/Blender exited with 1/);
    expect([snapshot(RENDER_DIR), existsSync(layoutPath('map')) ? statSync(layoutPath('map')).mtimeMs : 0]).toEqual(before);
  });

  it('rejects an unknown screen', async () => {
    await expect(render('foo', deps(() => 'blender'))).rejects.toThrow(/known screens are map/);
  });

  it('refuses a layout that breaks the rules, naming the ids', () => {
    const raw: RawProjection = {
      screenId: 'map',
      render: { width: 2048, height: 1536 },
      frames: [],
      objects: [{ name: 'hit.pizza', type: 'MESH', points: [[100, 100, 5], [150, 100, 5], [100, 150, 5]] }],
    };
    let problems: string[] = [];
    try {
      layoutFromRaw('map', raw);
    } catch (e) {
      problems = (e as { problems: string[] }).problems;
    }
    expect(problems).toContain('hit "ice-cream": missing or has fewer than 3 points');
    expect(problems).toContain('path "road": missing or has fewer than 2 points');
  });

  it('draws every hit, anchor, slot and path on the preview', () => {
    const svg = previewSvg({
      v: 1,
      screenId: 'map',
      design: { width: 1024, height: 768 },
      renderScale: 2,
      anchors: { pizza: { x: 1, y: 2 } },
      hits: { pizza: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }] },
      slots: { 'pizza-1': { x: 5, y: 5 } },
      paths: { road: [{ x: 0, y: 0 }, { x: 5, y: 5 }] },
    });
    expect(svg).toMatch(/^<svg [^>]*width="2048" height="1536"/);
    expect(svg).toContain('<polygon points="0.0,0.0 20.0,0.0 0.0,20.0"');
    expect(svg).toContain('<circle cx="2.0" cy="4.0"');
    expect(svg).toContain('<polyline');
    expect(svg).toContain('<rect');
    expect(STATIONS).toHaveLength(7);
  });

  it('replaceDir swaps a directory and restores the old one when the move fails', () => {
    const root = mkdtempSync(join(tmpdir(), 'bhc-replace-'));
    try {
      const dest = join(root, 'map');
      const src = join(root, 'new');
      mkdirSync(dest);
      writeFileSync(join(dest, 'a.txt'), 'old');
      mkdirSync(src);
      writeFileSync(join(src, 'a.txt'), 'new');
      replaceDir(src, dest);
      expect(readFileSync(join(dest, 'a.txt'), 'utf8')).toBe('new');
      expect(existsSync(`${dest}.old`)).toBe(false);
      expect(() => replaceDir(join(root, 'missing'), dest)).toThrow();
      expect(readFileSync(join(dest, 'a.txt'), 'utf8')).toBe('new');
      expect(existsSync(`${dest}.old`)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('Story 3.3: dino-puzzle screen', () => {
  it('a known screen; the builder gets the species, the piece ids of each cut, the size and the walk cap', () => {
    expect(screenSpec('dino-puzzle')).toEqual({ id: 'dino-puzzle', source: 'art/src/map-v3.blend', builder: 'build_dino_puzzle.py' });
    expect(buildParams().dino).toEqual({
      species: ['apatosaurus', 'triceratops', 'stegosaurus'],
      pieces: {
        3: ['head-neck', 'body-legs', 'tail'],
        4: ['head-neck', 'front', 'back', 'tail'],
        6: ['head', 'neck', 'body', 'front-legs', 'back-legs', 'tail'],
      },
      sizePx: 360,
      sizeTolerance: 40,
      walkMaxPx: 120,
    });
  });

  it('Story 3.4: build_dino_puzzle.py gets --cuts with the content cuts; other screens do not', () => {
    expect(cutsArg()).toBe('3:head-neck,body-legs,tail;4:head-neck,front,back,tail;6:head,neck,body,front-legs,back-legs,tail');
    expect(cutsArg({ 6: ['a'], 3: ['b', 'c'] })).toBe('3:b,c;6:a');
    let args: readonly string[] = [];
    const run = vi.fn((_bin: string, a: readonly string[]) => {
      args = a;
      return { status: 1, stdout: '', stderr: 'stop here' };
    });
    expect(() => build('dino-puzzle', deps(() => 'blender', run))).toThrow(/stop here/);
    expect(args[args.indexOf('--cuts') + 1]).toBe(cutsArg());
    expect(() => build('pizza', deps(() => 'blender', run))).toThrow(/stop here/);
    expect(args).not.toContain('--cuts');
  });

  it('addGhostFrames writes <object>/ghost/00 from <object>/idle/00 for every ghost object and lists it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bhc-ghost-'));
    try {
      const sharp = (await import('sharp')).default;
      const w = 32;
      const h = 24;
      const raw = Buffer.alloc(w * h * 4);
      for (let y = 6; y < 18; y++) for (let x = 8; x < 24; x++) raw.fill(255, (y * w + x) * 4, (y * w + x) * 4 + 4);
      mkdirSync(join(dir, 'frames', 'egg', 'idle'), { recursive: true });
      await sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png().toFile(join(dir, 'frames', 'egg', 'idle', '00.png'));
      const projection: RawProjection = { screenId: 'x', render: { width: w, height: h }, objects: [], frames: ['egg/idle/00'], ghosts: ['egg'] };
      await addGhostFrames(dir, projection, 2);
      expect(projection.frames).toEqual(['egg/idle/00', 'egg/ghost/00']);
      const first = readFileSync(join(dir, 'frames', 'egg', 'ghost', '00.png'));
      await addGhostFrames(dir, { ...projection, frames: [] }, 2);
      expect(readFileSync(join(dir, 'frames', 'egg', 'ghost', '00.png')).equals(first)).toBe(true);
      await expect(addGhostFrames(dir, { ...projection, ghosts: ['nope'] }, 2)).rejects.toThrow(/nope\/idle\/00/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the real dino layout passes its render rules with the published atlas trims; the lawn is unpadded', () => {
    const layout = JSON.parse(readFileSync(layoutPath('dino-puzzle'), 'utf8'));
    const atlas = atlasFrames(JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'public', 'assets', 'atlases', 'dino-puzzle.json'), 'utf8')));
    expect(SCREEN_RULES['dino-puzzle']!(layout, atlas)).toEqual([]);
    expect(SCREEN_SEPARATE['dino-puzzle']).toEqual({ unpadded: ['grass'] });
    expect(FRAME_RULE_SCREENS.has('dino-puzzle')).toBe(true);
  });
});

// Story 3.5: here rather than in shadow-match.test.ts, so build()'s temp dirs under art/ never race the
// "nothing written" snapshots above (test files run in parallel).
describe('Story 3.5: shadow-match builder arguments', () => {
  it('build_shadow_match.py gets --items with the content catalogue ids; other screens do not', () => {
    expect(itemsArg()).toBe('dog,cow,horse,donkey,stag,car,truck,tractor');
    expect(itemsArg(['a', 'b'])).toBe('a,b');
    let args: readonly string[] = [];
    const run = vi.fn((_bin: string, a: readonly string[]) => {
      args = a;
      return { status: 1, stdout: '', stderr: 'stop here' };
    });
    expect(() => build('shadow-match', deps(() => 'blender', run))).toThrow(/stop here/);
    expect(args[args.indexOf('--items') + 1]).toBe(itemsArg());
    expect(args[args.indexOf('--python') + 1]).toMatch(/build_shadow_match\.py$/);
    expect(() => build('dino-puzzle', deps(() => 'blender', run))).toThrow(/stop here/);
    expect(args).not.toContain('--items');
  });
});
