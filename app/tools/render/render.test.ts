// render/art:build CLIs with injected resolver and runner: tests never spawn Blender.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { STATIONS } from '../../src/content/stations.ts';
import { ITEM_IDS } from '../../src/content/games/shadow-match.ts';
import { resolveBlender } from '../shared/binaries.ts';
import { ART_DIR, RENDER_DIR, blenderArgs, runBlender, screenSpec, tail } from './blender.ts';
import { ASSETS_DIR, build, buildParams, cutsArg, decorationModels, iconModels, itemsArg } from './build.ts';
import { FRAME_RULE_SCREENS, SCREEN_RULES, SCREEN_SEPARATE, addGhostFrames, layoutFromRaw, layoutPath, previewSvg, render, replaceDir } from './render.ts';
import { atlasFrames } from '../layout/rules.ts';
import type { RawProjection } from '../layout/to-layout.ts';
import { Tokens } from '../../src/core/tokens.ts';

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
      shadowMatch: { caveInner: '#F6EEDC', pedestal: '#FF8FB8', pedestalTop: '#FFF1E0' },
      fishing: { yellow: '#FFD23F', orange: '#FF9A3C', blue: '#2F6FDB', stripe: '#FFFFFF', dot: '#FFFFFF', line: '#F5F5F5' },
      touchTalk: { white: '#FFFFFF', beak: '#FFC93C', pavement: '#C9CED6', bus: '#FFD23F', skyTop: '#9ED6F7', skyHorizon: '#E6F6FF', seaNear: '#A6E6F6', seaFar: '#6CC8EE', sandLight: '#F5D9A3', sandWet: '#E8C489', verge: '#B4E09A', pavementLine: '#C0C6D0', haze: '#EEF6FC', fin: '#FFD45C', gullTip: '#B8C4D6', shell: '#FFB3C1', coconut: '#7CC46B', boatHull: '#FF7B72', tire: '#3B4252', hub: '#EEF1F5', glass: '#BDE6FF', banana: '#FFD84A', bananaTip: '#8A5A33', egg: '#FFF1DC', melonRind: '#3E9E52', melonStripe: '#2C7A3D', melonLight: '#D9F5C2', melonFlesh: '#FF5D73', grassNear: '#A2DA84' },
      home: { wood: '#E8B27A', woodDark: '#C98B55', curtain: '#FF7FAE', drum: '#FF6B6B', drumRim: '#FFFFFF', drumHead: '#FFF4E0', stick: '#F3D9B1', kit: '#FFFFFF', cross: '#F0525B', wardrobe: '#C9A8FF', wardrobeDoor: '#E2D3FF', knob: '#FFE08A', shirt: '#FF9A3C', houseWall: '#FFF1DC', houseTrim: '#FFFFFF', wallBedroom: '#FFD6E4', wallLiving: '#D4F0E2', floorBedroom: '#F2C894', floorLiving: '#E8B27A', roof: '#FF9AA8', roofDark: '#E87D8E', glass: '#BFE6FF', piano: '#FF9FC6', pianoDark: '#E879A8', keyWhite: '#FFFFFF', keyBlack: '#4A3B52', cymbal: '#FFD45E', tom: '#6FC3FF', dogHouse: '#8FD3FF', dogHouseRoof: '#FF8A7A', dogHouseDoor: '#5B4636', bowl: '#FF6B6B', garage: '#FFE7B8', garageDoor: '#FFFFFF', garageStripe: '#9ED8FF', driveway: '#DCD3C6' },
      animalPens: { barn: '#E8735F', barnDark: '#C4574B', trim: '#FFF4E2', roof: '#8E5B43', door: '#F4B870', doorDark: '#D9914E', inside: '#5E3B2F', straw: '#F7D46B', hinge: '#6B4A3A', catFur: '#B8B2CC', catStripe: '#8D86A6', catNose: '#FF9DB0', roosterFur: '#F59A4F', roosterBreast: '#FFD08A', roosterWing: '#D9733A', roosterComb: '#FF4F5E', roosterBeak: '#FFC83D', roosterTail: '#2F8F83', roosterTail2: '#3D6FB8', cowFur: '#FFF8EE', cowPatch: '#5A4741', cowMuzzle: '#FFC4C4', cowHorn: '#FFEBB8', pigFur: '#FFB8C8', pigLight: '#FFD6E0', pigSnout: '#FF94AC', pigHoof: '#D97A92', sheepWool: '#FFFDF7', sheepFace: '#F2DCC0', sheepLeg: '#6B5650', horseFur: '#C07D4E', horseLight: '#F6DDBA', horseMane: '#5E3B2F', hoof: '#5A4741' },
      band: { wood: '#E8B27A', woodDark: '#C98B55', curtain: '#8C7BFF', curtainDark: '#6F5CE0', valance: '#FFD23F', flagRed: '#FF6B6B', flagYellow: '#FFD23F', flagBlue: '#4D96FF', flagGreen: '#6BCB77', drum: '#FF6B6B', drumRim: '#FFFFFF', drumHead: '#FFF4E0', lug: '#FFD166', stick: '#F3D9B1', barRed: '#FF6B6B', barOrange: '#FF9A3C', barYellow: '#FFD23F', barGreen: '#6BCB77', barBlue: '#4D96FF', xyloFrame: '#B8794A', mallet: '#FF7FAE', brass: '#FFC94A', brassDark: '#E0A526', bell: '#FFD23F', bellDark: '#E8B21E', stand: '#4D96FF', stool: '#FF9A3C' },
      bedtime: { wall: '#FFE3D3', wallDot: '#FFC9B5', floor: '#D9A273', floorDark: '#BF8558', skirting: '#FFF6EC', windowFrame: '#FFFFFF', daySkyTop: '#8FD3FF', daySkyLow: '#E6F7FF', cloud: '#FFFFFF', skyTop: '#2E3F8F', skyLow: '#7D7FD1', moon: '#FFF1B3', curtain: '#9FC7FF', curtainDark: '#7EAEF2', paintSun: '#FFD23F', paintSky: '#BDE6FF', paintHill: '#9EDC8A', paintHeart: '#FF8FB1', quilt: '#FFD86B', quiltPatch: '#FFFFFF', quiltTrim: '#FF9EC4', stool: '#B9E3C6', mouth: '#7A3B3B', tongue: '#FF8FA3', eyeLine: '#3A2A22', foam: '#FFFFFF', star: '#FFE066', z: '#C9B8FF', nightTint: '#6F7FD0', glow: '#FFE7A3' },
      petClinic: { wall: '#C6EBE2', wallDot: '#A8DCCF', floor: '#F2D3A8', floorDark: '#E0B987', skirting: '#FFFFFF', windowFrame: '#FFFFFF', sky: '#BFE6FF', mat: '#9FD8F7', matTrim: '#FFFFFF', cart: '#FFB7CE', cartDark: '#F294B3', cross: '#5CC8B4', shower: '#7FC8F8', showerDark: '#4FA8E0', chrome: '#E8EEF2', bottle: '#F4FBFF', milk: '#FFFFFF', teat: '#FFC26B', cap: '#8FD6A8', plaster: '#F7C9A0', plasterPad: '#FFF4EA', blanket: '#B9A6FF', blanketPatch: '#FFFFFF', mud: '#8B5E3C', mudDark: '#553823', scrape: '#F59A9A', scrapeDark: '#E98394', drop: '#8FD3FF', wave: '#7A6BB0', z: '#C9B8FF', sparkle: '#FFE066', heart: '#FF9EC4' },
      // Story 8.2: checked on its own below.
      dressUp: expect.any(Object),
      // Trồng cây (2026-10-30): checked on its own below.
      garden: expect.any(Object),
      // Rửa xe (2026-10-30): checked on its own below.
      carWash: expect.any(Object),
      // Phi công nhí (2026-11-11): checked on its own below.
      plane: expect.any(Object),
      // Tàu hỏa chở bạn (2026-11-12): checked on its own below.
      train: expect.any(Object),
      // Tên lửa lên Mặt Trăng (2026-11-12): checked on its own below.
      rocket: expect.any(Object),
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
        rail: '#9AA7BD',
        sleeper: '#B9875A',
        ballast: '#E2CDA6',
        portal: '#C9B6A0',
        portalDark: '#4A3A3A',
        crossingBoard: '#C98B55',
        signalPost: '#5E6B82',
        signalLight: '#7BE07B',
        barrierPost: '#FFFFFF',
        barrierStripe: '#FF6B6B',
        barrierArm: '#FFFFFF',
        platform: '#E8B27A',
        platformEdge: '#FFE17A',
        platformPost: '#FFFFFF',
        platformRoof: '#5BB8F0',
        sign: '#FFF4E0',
        airstrip: '#C7CFDB',
        airstripLine: '#FFFFFF',
        windsock: '#FF8A3D',
        puff: '#FFFFFF',
      },
    });
    expect(p).toMatchObject({ draggableMinSize: 90, rowGap: 180 });
  });

  it('Story 8.2: the wardrobe, map and ice-cream builders get art.dressUp, the eleven outfit items and the wardrobe sizes', () => {
    const p = buildParams();
    expect(Object.keys(p.art.dressUp)).toEqual(Object.keys(Tokens.art.dressUp));
    expect(p.art.dressUp.crown).toBe(Tokens.art.dressUp.crown.css);
    expect(p.outfit.map((i) => i.id)).toEqual(['party-hat', 'cowboy-hat', 'crown', 'beanie', 'round-glasses', 'heart-glasses', 'star-glasses', 'striped-tee', 'raincoat', 'heart-jumper', 'flower-shirt']);
    expect(p.outfit.filter((i) => i.slot === 'hat')).toHaveLength(4);
    expect(p.dressUp).toEqual({ iconPx: 100, itemHitPx: 110, gapPx: Tokens.spacing.targetGap, mirrorScale: Tokens.ui.dressUpMirrorScale });
  });

  it('Trồng cây (2026-10-30): the garden builder gets art.garden, the fruits, stages, slots and the tap sizes', () => {
    const p = buildParams();
    expect(Object.keys(p.art.garden)).toEqual(Object.keys(Tokens.art.garden));
    expect(p.art.garden.lemon).toBe(Tokens.art.garden.lemon.css);
    expect(p.garden).toEqual({
      fruits: ['strawberry', 'watermelon', 'tomato', 'lemon'],
      stages: ['sprout', 'small', 'flower', 'fruit'],
      packets: 2,
      fruitsPerPlant: 3,
      giantFruit: 1,
      giantScale: Tokens.ui.gardenGiantScale,
      targetPx: 90,
      hitMinPx: 80,
      gapPx: Tokens.spacing.targetGap,
    });
  });

  it('Rửa xe (2026-10-30): the car-wash builder gets art.carWash, the vehicles, dirt kinds, spots and the sizes', () => {
    const p = buildParams();
    expect(Object.keys(p.art.carWash)).toEqual(Object.keys(Tokens.art.carWash));
    expect(p.art.carWash.foam).toBe(Tokens.art.carWash.foam.css);
    expect(p.carWash).toEqual({
      vehicles: ['firetruck', 'police', 'ambulance', 'taxi', 'garbage-truck', 'tractor'],
      dirts: ['mud', 'leaves', 'cream', 'dust'],
      spots: 6,
      carMinPx: 300,
      hoseMinPx: 90,
      hitMinPx: 80,
      gapPx: Tokens.spacing.targetGap,
    });
  });

  it('Tên lửa lên Mặt Trăng (2026-11-12): the rocket builder gets art.rocket, the parts, colours, surprises, aliens and the sizes', () => {
    const p = buildParams();
    expect(Object.keys(p.art.rocket)).toEqual(Object.keys(Tokens.art.rocket));
    expect(p.art.rocket.spaceDeep).toBe(Tokens.art.rocket.spaceDeep.css);
    expect(p.rocket).toEqual({
      parts: ['body', 'nose', 'fins'],
      colours: ['red', 'yellow', 'blue', 'green', 'white'],
      surprises: ['comet', 'ringed', 'ufo', 'satellite'],
      aliens: ['mint', 'peach', 'lilac'],
      craters: 3,
      rocks: 2,
      choiceMinPx: 130,
      choiceHitMinPx: 100,
      choiceGapPx: 48,
      rocketMinPx: 160,
      astroMinPx: 120,
      hitMinPx: 80,
      gapPx: Tokens.spacing.targetGap,
      spaceDeepMinLum: 0.12,
    });
  });

  it('Tàu hỏa quanh đảo (2026-11-13): the train builder gets art.train, the friends, cars, stations, destinations and the sprites over the train', () => {
    const p = buildParams();
    expect(Object.keys(p.art.train)).toEqual(Object.keys(Tokens.art.train));
    expect(p.art.train.engine).toBe(Tokens.art.train.engine.css);
    expect(p.train).toEqual({
      friends: ['cat', 'pig', 'sheep', 'cow', 'horse', 'rooster'],
      cars: ['red', 'yellow', 'blue'],
      stations: ['race', 'shadow-match', 'dino-puzzle', 'ice-cream'],
      destinations: ['beach', 'whale', 'fountain'],
      fronts: ['dino-puzzle', 'rocket', 'shadow-match'],
    });
  });

  it('Tàu hỏa quanh đảo (2026-11-13): the train is built from the built map (the same island and camera)', () => {
    expect(screenSpec('train')).toEqual({ id: 'train', source: 'art/map.blend', builder: 'build_train.py' });
  });

  it('Phi công nhí (2026-11-11): the plane builder gets art.plane, the friends, colours, surprises and the sizes', () => {
    const p = buildParams();
    expect(Object.keys(p.art.plane)).toEqual(Object.keys(Tokens.art.plane));
    expect(p.art.plane.body).toBe(Tokens.art.plane.body.css);
    expect(p.plane).toEqual({
      friends: ['cat', 'pig', 'sheep', 'cow', 'horse', 'rooster'],
      colours: ['red', 'yellow', 'green', 'purple'],
      surprises: ['rainbow', 'flock', 'hot-air', 'heart'],
      gifts: 3,
      balloonMinPx: 90,
      friendMinPx: 150,
      hitMinPx: 80,
      topY: Tokens.ui.planeTopY,
      bottomY: Tokens.ui.planeBottomY,
    });
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
    expect(STATIONS).toHaveLength(8); // Story 7.1: + the home station
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
    expect(itemsArg()).toBe(ITEM_IDS.join(','));
    expect(itemsArg().split(',').slice(0, 8)).toEqual(['dog', 'cow', 'horse', 'donkey', 'stag', 'car', 'truck', 'tractor']);
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
