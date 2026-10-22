// tools/lint/validate-content.ts wiring (Story 1.2 deferred item, picked up in 1.3): run(publicDir)
// against temp public/ trees — real fs, real lineHash, real catalog and voice lines.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AUDIO_CATALOG } from '../../src/content/audio-catalog.ts';
import { VOICE_LINES, voiceHashPath, voicePath } from '../../src/content/voice-lines.ts';
import { lineHash } from '../tts/line-hash.ts';
import { ATLASES, BACKGROUNDS, TOUCH_TALK_PLATES } from '../../src/content/assets.ts';
import { REQUIRED_FRAMES, dinoLayoutInfo, featureProblems, run, shadowCatalogueProblems } from './validate-content.ts';

const dirs: string[] = [];

/** A PNG header (signature + IHDR) of the given size: the validator reads only the IHDR. */
function pngHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(b);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

function atlasJson(frames: readonly string[]): string {
  return JSON.stringify({ frames: Object.fromEntries(frames.map((f) => [f, {}])), meta: { size: { w: 1024, h: 1024 } } });
}

/** Story 5.3: a minimal .m4a — a moov box whose mvhd (version 0) says `ms` long. */
function m4a(ms: number): Buffer {
  const mvhd = Buffer.alloc(8 + 100);
  mvhd.writeUInt32BE(mvhd.length, 0);
  mvhd.write('mvhd', 4, 'latin1');
  mvhd.writeUInt32BE(1000, 8 + 12);
  mvhd.writeUInt32BE(ms, 8 + 16);
  const moov = Buffer.alloc(8);
  moov.writeUInt32BE(8 + mvhd.length, 0);
  moov.write('moov', 4, 'latin1');
  return Buffer.concat([moov, mvhd]);
}

function put(root: string, rel: string, content: string | Buffer): void {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** A public/ tree with every catalog file and every voice line's .m4a + current .hash. */
function goodTree(): string {
  const root = mkdtempSync(join(tmpdir(), 'bhc-public-'));
  dirs.push(root);
  for (const entry of Object.values(AUDIO_CATALOG)) put(root, entry.path, 'audio');
  for (const line of VOICE_LINES) {
    put(root, voicePath(line.id), m4a(2000));
    put(root, voiceHashPath(line.id), `${lineHash(line)}\n`);
  }
  put(root, ATLASES.map.png, pngHeader(1024, 1024));
  // Story 2.2: the map atlas JSON is the real one (decoration frame sizes are checked).
  put(root, ATLASES.map.json, readFileSync(join(APP, 'public', ATLASES.map.json)));
  put(root, BACKGROUNDS.map.path, pngHeader(2048, 1536));
  // Story 1.8: the ice-cream atlas JSON is the real one (its frame sizes are checked).
  put(root, ATLASES['ice-cream'].png, pngHeader(1024, 1024));
  put(root, ATLASES['ice-cream'].json, readFileSync(join(APP, 'public', ATLASES['ice-cream'].json)));
  put(root, BACKGROUNDS['ice-cream'].path, pngHeader(2048, 1536));
  // Story 3.1: the pizza atlas JSON is the real one (its frame sizes are checked).
  put(root, ATLASES.pizza.png, pngHeader(1024, 1024));
  put(root, ATLASES.pizza.json, readFileSync(join(APP, 'public', ATLASES.pizza.json)));
  put(root, BACKGROUNDS.pizza.path, pngHeader(2048, 1536));
  // Story 3.3: the dino-puzzle multiatlas JSON is the real one; each page a PNG header.
  const dino = JSON.parse(readFileSync(join(APP, 'public', ATLASES['dino-puzzle'].json), 'utf8')) as { textures: { image: string }[] };
  for (const t of dino.textures) put(root, `assets/atlases/${t.image}`, pngHeader(2048, 2048));
  put(root, ATLASES['dino-puzzle'].json, JSON.stringify(dino));
  put(root, BACKGROUNDS['dino-puzzle'].path, pngHeader(2048, 1536));
  // Story 3.5: the shadow-match atlas JSON is the real one (its frame sizes are checked); 2026-10-22: a
  // multiatlas, each page a PNG header.
  const sm = JSON.parse(readFileSync(join(APP, 'public', ATLASES['shadow-match'].json), 'utf8')) as { textures: { image: string }[] };
  for (const t of sm.textures) put(root, `assets/atlases/${t.image}`, pngHeader(2048, 2048));
  put(root, ATLASES['shadow-match'].json, JSON.stringify(sm));
  put(root, BACKGROUNDS['shadow-match'].path, pngHeader(2048, 1536));
  // Story 4.1: the race atlas JSON is the real one (the kart and gate sizes are checked).
  put(root, ATLASES.race.png, pngHeader(2048, 2048));
  put(root, ATLASES.race.json, readFileSync(join(APP, 'public', ATLASES.race.json)));
  put(root, BACKGROUNDS.race.path, pngHeader(2048, 1536));
  // Story 4.3: the fishing atlas JSON is the real one (the fish sizes are checked).
  put(root, ATLASES.fishing.png, pngHeader(2048, 2048));
  put(root, ATLASES.fishing.json, readFileSync(join(APP, 'public', ATLASES.fishing.json)));
  put(root, BACKGROUNDS.fishing.path, pngHeader(2048, 1536));
  // Stories 4.5, 4.6: the touch-talk multiatlas JSON is the real one (each page a PNG header); one background per plate.
  const tt = JSON.parse(readFileSync(join(APP, 'public', ATLASES['touch-talk'].json), 'utf8')) as { textures: { image: string }[] };
  for (const t of tt.textures) put(root, `assets/atlases/${t.image}`, pngHeader(2048, 2048));
  put(root, ATLASES['touch-talk'].json, JSON.stringify(tt));
  for (const plate of TOUCH_TALK_PLATES) put(root, BACKGROUNDS[`touch-talk-${plate}`].path, pngHeader(2048, 1536));
  // Story 7.1: the yard atlas JSON is the real one (the corner sizes are checked).
  put(root, ATLASES.home.png, pngHeader(2048, 2048));
  put(root, ATLASES.home.json, readFileSync(join(APP, 'public', ATLASES.home.json)));
  put(root, BACKGROUNDS.home.path, pngHeader(2048, 1536));
  return root;
}

const APP = join(import.meta.dirname, '..', '..');
const realLayout = (screen: string) => JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', `${screen}.layout.json`), 'utf8'));

/** A temp layout dir holding the real ice-cream and pizza layouts (map is up to each test). */
function layoutDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bhc-layout-'));
  dirs.push(dir);
  put(dir, 'ice-cream.layout.json', JSON.stringify(realLayout('ice-cream')));
  put(dir, 'pizza.layout.json', JSON.stringify(realLayout('pizza')));
  put(dir, 'dino-puzzle.layout.json', JSON.stringify(realLayout('dino-puzzle')));
  put(dir, 'shadow-match.layout.json', JSON.stringify(realLayout('shadow-match')));
  put(dir, 'race.layout.json', JSON.stringify(realLayout('race')));
  put(dir, 'fishing.layout.json', JSON.stringify(realLayout('fishing')));
  put(dir, 'touch-talk.layout.json', JSON.stringify(realLayout('touch-talk')));
  put(dir, 'home.layout.json', JSON.stringify(realLayout('home')));
  return dir;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('validate-content run(publicDir)', () => {
  it('a good tree passes', () => {
    expect(run(goodTree())).toEqual([]);
  });

  it('the real public/ passes (committed voice files are current)', () => {
    expect(run(join(import.meta.dirname, '..', '..', 'public'))).toEqual([]);
  });

  it('a missing voice file fails and names the id', () => {
    const root = goodTree();
    unlinkSync(join(root, voicePath('vo.shell.greeting')));
    const problems = run(root);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/voice "vo\.shell\.greeting": file .*\.m4a is missing/);
  });

  it('Story 5.3: a prompt .m4a over 4 s, or one without a readable length, fails naming the id', () => {
    const root = goodTree();
    put(root, voicePath('vo.ice-cream.ask.mint'), m4a(4210));
    put(root, voicePath('vo.ice-cream.retry.mint'), 'audio');
    // A non-prompt line is not measured.
    put(root, voicePath('vo.shell.greeting'), m4a(6000));
    expect(run(root)).toEqual([
      'voice "vo.ice-cream.ask.mint": prompt lasts 4.21 s (at most 4 s, NFR15)',
      'voice "vo.ice-cream.retry.mint": cannot read the audio length',
    ]);
  });

  it('an edited .hash fails and names the id', () => {
    const root = goodTree();
    put(root, voiceHashPath('vo.shell.greeting'), 'deadbeef\n');
    const problems = run(root);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/voice "vo\.shell\.greeting": .* does not match the line/);
  });

  it('a stray voice file fails and names its id', () => {
    const root = goodTree();
    put(root, 'assets/audio/vo/vo.shell.old-hello.m4a', 'audio');
    const problems = run(root);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/voice "vo\.shell\.old-hello": stray file/);
  });

  it('a missing catalog file fails (fileExists is wired to public/)', () => {
    const root = goodTree();
    unlinkSync(join(root, AUDIO_CATALOG['sfx.shell.pop'].path));
    const problems = run(root);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/"sfx\.shell\.pop": file .* is missing/);
  });

  it('a missing atlas frame fails and names it', () => {
    const root = goodTree();
    put(root, ATLASES.map.json, atlasJson(REQUIRED_FRAMES.map!.filter((f) => f !== 'kart/idle/00')));
    expect(run(root)).toContain('atlas "atlas.map": frame "kart/idle/00" is missing');
  });

  it('Story 5.2: a missing guide wave frame fails and names it', () => {
    const root = goodTree();
    put(root, ATLASES.map.json, atlasJson(REQUIRED_FRAMES.map!.filter((f) => f !== 'shiba/wave/02')));
    expect(run(root)).toContain('atlas "atlas.map": frame "shiba/wave/02" is missing');
  });

  it('Story 5.6: the map needs every ambient frame (whale, fountain, cloud, wave); a missing one fails naming it', () => {
    for (const f of ['whale/idle/00', 'whale/spout/03', 'fountain/spray/02', 'ambient/cloud/00', 'ambient/wave/00']) expect(REQUIRED_FRAMES.map).toContain(f);
    const root = goodTree();
    put(root, ATLASES.map.json, atlasJson(REQUIRED_FRAMES.map!.filter((f) => f !== 'whale/spout/01')));
    expect(run(root)).toContain('atlas "atlas.map": frame "whale/spout/01" is missing');
  });

  it('Story 5.6: a map layout without an ambient anchor fails naming it', () => {
    const root = goodTree();
    const layouts = layoutDir();
    const real = realLayout('map');
    delete real.anchors.whale;
    delete real.anchors['wave-4'];
    put(layouts, 'map.layout.json', JSON.stringify(real));
    const problems = run(root, layouts);
    expect(problems).toContain('layout "map": anchor "whale": missing (the ambient dressing)');
    expect(problems).toContain('layout "map": anchor "wave-4": missing (the ambient dressing)');
  });

  it('Story 5.2: a map layout without hits.shiba fails naming the guide', () => {
    const root = goodTree();
    const layouts = layoutDir();
    const real = realLayout('map');
    delete real.hits.shiba;
    put(layouts, 'map.layout.json', JSON.stringify(real));
    expect(run(root, layouts)).toContain('layout "map": hit "shiba": missing or has fewer than 3 points (the guide)');
  });

  it('Story 2.2: a missing or undersized decoration frame fails naming the id', () => {
    const root = goodTree();
    const json = JSON.parse(readFileSync(join(APP, 'public', ATLASES.map.json), 'utf8'));
    delete json.frames['decoration/koi/00'];
    json.frames['decoration/parasol/00'].spriteSourceSize.w = 40;
    json.frames['decoration/parasol/00'].spriteSourceSize.h = 40;
    put(root, ATLASES.map.json, JSON.stringify(json));
    const problems = run(root);
    expect(problems).toContain('layout "map": decoration "koi": atlas "map" has no frame "decoration/koi/00"');
    expect(problems.some((p) => p.startsWith('layout "map": decoration "parasol" at slot "ice-cream-1": footprint 20×20 is under 80'))).toBe(true);
  });

  it('Story 2.2: a slot moved onto a station fails naming the decoration and the station', () => {
    const root = goodTree();
    const layouts = layoutDir();
    const real = realLayout('map');
    real.slots['race-2'] = real.anchors.race; // Story 7.1: the pizza station keeps one slot (its pivot), so race's second slot is moved
    put(layouts, 'map.layout.json', JSON.stringify(real));
    const problems = run(root, layouts);
    expect(problems.some((p) => /^layout "map": decoration "[a-z-]+" at slot "race-2": footprint intersects the hit polygon of "race"$/.test(p))).toBe(true);
  });

  it('a file over 8 MiB fails and names it', () => {
    const root = goodTree();
    put(root, 'assets/bg/huge.png', Buffer.alloc(8 * 1024 * 1024 + 1));
    expect(run(root)).toEqual(['file assets/bg/huge.png: 8388609 bytes exceeds 8 MiB (8388608)']);
  });

  it('a wrong background size fails', () => {
    const root = goodTree();
    put(root, BACKGROUNDS.map.path, pngHeader(1024, 768));
    expect(run(root)).toEqual(['background "bg.map": assets/bg/map.png is 1024×768 (must be 2048×1536)']);
  });

  it('a missing or broken layout fails naming the screen and the ids', () => {
    const root = goodTree();
    const layouts = layoutDir();
    expect(run(root, layouts)).toEqual(['layout "map": map.layout.json is missing or invalid (run npm run render -- map)']);
    const real = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'src', 'content', 'generated', 'map.layout.json'), 'utf8'));
    delete real.hits.pizza;
    real.slots['race-1'] = real.anchors.race;
    put(layouts, 'map.layout.json', JSON.stringify(real));
    const problems = run(root, layouts);
    expect(problems).toContain('layout "map": hit "pizza": missing or has fewer than 3 points');
    expect(problems).toContain('layout "map": slot "race-1": inside the hit polygon of "race"');
  });

  it('Tiệm kem (Story 1.8): slot.cone-1 removed fails naming cone-1; a broken row rule is named', () => {
    const root = goodTree();
    const layouts = layoutDir();
    put(layouts, 'map.layout.json', JSON.stringify(realLayout('map')));
    expect(run(root, layouts)).toEqual([]);
    const ice = realLayout('ice-cream');
    delete ice.slots['cone-1'];
    ice.slots['scoop-4'] = { x: ice.slots['scoop-4'].x + 60, y: ice.slots['scoop-4'].y };
    put(layouts, 'ice-cream.layout.json', JSON.stringify(ice));
    const problems = run(root, layouts);
    expect(problems).toContain('layout "ice-cream": slot "cone-1": missing');
    expect(problems.some((p) => p.includes('row "scoop-3" → "scoop-4": x gap'))).toBe(true);
  });

  it('Tiệm kem: a missing or undersized frame fails naming it', () => {
    const root = goodTree();
    const json = JSON.parse(readFileSync(join(APP, 'public', ATLASES['ice-cream'].json), 'utf8'));
    delete json.frames['scoop-mint/idle/00'];
    json.frames['shiba/idle/00'].spriteSourceSize.h = 100;
    put(root, ATLASES['ice-cream'].json, JSON.stringify(json));
    const problems = run(root);
    expect(problems).toContain('atlas "atlas.ice-cream": frame "scoop-mint/idle/00" is missing');
    expect(problems).toContain('layout "ice-cream": frame "shiba/idle/00": trimmed height 50 is under 220');
  });

  it('Tiệm pizza (Story 3.1): slot.base-8 removed or a broken rule fails naming it', () => {
    const root = goodTree();
    const layouts = layoutDir();
    put(layouts, 'map.layout.json', JSON.stringify(realLayout('map')));
    expect(run(root, layouts)).toEqual([]);
    const pz = realLayout('pizza');
    delete pz.slots['base-8'];
    pz.slots['bowl-mushroom'] = { x: pz.anchors.base.x + 100, y: pz.anchors.base.y };
    put(layouts, 'pizza.layout.json', JSON.stringify(pz));
    const problems = run(root, layouts);
    expect(problems).toContain('layout "pizza": slot "base-8": missing');
    expect(problems.some((p) => p.startsWith('layout "pizza": slot "bowl-mushroom":') && p.includes('from anchor "base"'))).toBe(true);
  });

  it('Ghép khủng long (Story 3.3): a removed slot or a frame missing from the multiatlas fails naming it', () => {
    const root = goodTree();
    const layouts = layoutDir();
    put(layouts, 'map.layout.json', JSON.stringify(realLayout('map')));
    expect(run(root, layouts)).toEqual([]);
    const dl = realLayout('dino-puzzle');
    delete dl.slots['triceratops-tail'];
    put(layouts, 'dino-puzzle.layout.json', JSON.stringify(dl));
    const json = JSON.parse(readFileSync(join(APP, 'public', ATLASES['dino-puzzle'].json), 'utf8')) as { textures: { frames: { filename: string }[] }[] };
    for (const t of json.textures) t.frames = t.frames.filter((f) => f.filename !== 'stegosaurus/blink/00');
    put(root, ATLASES['dino-puzzle'].json, JSON.stringify(json));
    const problems = run(root, layouts);
    expect(problems).toContain('layout "dino-puzzle": slot "triceratops-tail": missing');
    expect(problems).toContain('layout "dino-puzzle": atlas "dino-puzzle": frame "stegosaurus/blink/00" is missing');
  });

  it('Hang tìm bóng (Story 3.5): a slot under the Speaker, a shadow under 120 px and the pedestal inside a level-4 snap zone fail naming the id', () => {
    const root = goodTree();
    const layouts = layoutDir();
    put(layouts, 'map.layout.json', JSON.stringify(realLayout('map')));
    expect(run(root, layouts)).toEqual([]);
    const sl = realLayout('shadow-match');
    sl.slots['shadow-2-2'] = { x: 930, y: 150 };
    sl.anchors['item-rest'] = { x: sl.slots['shadow-2-1'].x + 250, y: 560 };
    put(layouts, 'shadow-match.layout.json', JSON.stringify(sl));
    // 2026-10-22: a multiatlas (the frames sit on its pages).
    const json = JSON.parse(readFileSync(join(APP, 'public', ATLASES['shadow-match'].json), 'utf8')) as { textures: { frames: { filename: string; spriteSourceSize: { w: number; h: number } }[] }[] };
    for (const f of json.textures.flatMap((t) => t.frames).filter((f) => ['item-cow/color/00', 'item-cow/shadow/00'].includes(f.filename))) {
      f.spriteSourceSize.w = 200;
      f.spriteSourceSize.h = 160;
    }
    put(root, ATLASES['shadow-match'].json, JSON.stringify(json));
    const problems = run(root, layouts);
    expect(problems).toContain('layout "shadow-match": slot "shadow-2-2": the shadow circle reaches into a Home/Speaker keep-out zone');
    expect(problems).toContain('layout "shadow-match": frame "item-cow/color/00": longest side 100 is under the shadow minimum 120');
    expect(problems.some((p) => p.startsWith('layout "shadow-match": slot "shadow-2-1":') && p.includes('level-4 snap zone'))).toBe(true);
  });

  it('Tiệm pizza: a missing frame or a too-narrow oven fails naming it', () => {
    const root = goodTree();
    const json = JSON.parse(readFileSync(join(APP, 'public', ATLASES.pizza.json), 'utf8'));
    delete json.frames['oven/baking/00'];
    json.frames['oven/rest/00'].spriteSourceSize.w = 200;
    put(root, ATLASES.pizza.json, JSON.stringify(json));
    const problems = run(root);
    expect(problems).toContain('atlas "atlas.pizza": frame "oven/baking/00" is missing');
    expect(problems).toContain('layout "pizza": frame "oven/rest/00": trimmed width 100 is not 200 ± 30');
  });

  it('a layout without its records names them instead of throwing', () => {
    const root = goodTree();
    const layouts = layoutDir();
    put(layouts, 'map.layout.json', JSON.stringify({ v: 1, screenId: 'map', design: { width: 1024, height: 768 }, renderScale: 2, anchors: {}, hits: [] }));
    expect(run(root, layouts)).toEqual(['layout "map": missing "hits"', 'layout "map": missing "slots"', 'layout "map": missing "paths"']);
    put(layouts, 'map.layout.json', 'null');
    expect(run(root, layouts)).toEqual(['layout "map": not a JSON object']);
  });
});

describe('dinoLayoutInfo (Story 3.4)', () => {
  it('the real layout: 30 slots, 8 bays, then the close-slot info lines of validateDinoPuzzle', () => {
    const lines = dinoLayoutInfo();
    expect(lines[0]).toBe('dino-puzzle layout: 30 slots, 8 bays');
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines.slice(1)) expect(l).toMatch(/^dino-puzzle: slots "[a-z-]+" and "[a-z-]+" are [\d.]+ px apart \(< 100\); allowed: the own slot wins \(DROP_ORDER\)$/);
  });

  it('an unreadable layout or one without its records gives one line, never a throw', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bhc-dino-info-'));
    try {
      expect(dinoLayoutInfo(dir)[0]).toMatch(/^dino-puzzle layout: cannot be read \(/);
      writeFileSync(join(dir, 'dino-puzzle.layout.json'), JSON.stringify({ v: 1, screenId: 'dino-puzzle', anchors: {} }));
      expect(dinoLayoutInfo(dir)).toEqual(['dino-puzzle layout: not a v1 layout with anchors, hits, slots and paths']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('shadowCatalogueProblems (Story 3.5)', () => {
  it('the real catalogue passes', () => {
    expect(shadowCatalogueProblems()).toEqual([]);
  });

  it('an item "ball", a name "bóng bay", a flower, a bad or repeated id fail naming the item', () => {
    const p = shadowCatalogueProblems([
      { id: 'ball', askName: 'quả', name: 'Quả!' },
      { id: 'kite', askName: 'diều', name: 'Bóng bay!' },
      { id: 'rose', askName: 'hoa hồng', name: 'Hoa!' },
      { id: 'Dog_1', askName: 'chó', name: 'Con chó!' },
      { id: 'cow', askName: 'bò', name: 'Con bò!' },
      { id: 'cow', askName: 'bò', name: 'Con bò!' },
    ]);
    expect(p).toEqual([
      'shadow-match item "ball": id "ball" is a balloon, ball or flower (it would clash with "bóng")',
      'shadow-match item "kite": name "Bóng bay!" is a balloon, ball or flower (it would clash with "bóng")',
      'shadow-match item "rose": askName "hoa hồng" is a balloon, ball or flower (it would clash with "bóng")',
      'shadow-match item "rose": name "Hoa!" is a balloon, ball or flower (it would clash with "bóng")',
      'shadow-match item "Dog_1": the id is not kebab-case',
      'shadow-match item "cow": listed twice',
    ]);
  });
});

describe('featureProblems (Story 3.6)', () => {
  it('the real catalogue passes', () => {
    expect(featureProblems()).toEqual([]);
  });

  it('cow and horse both ["mane"] fail naming each item and its group; another group may share a feature', () => {
    const p = featureProblems([
      { id: 'cow', shapeGroup: 'quadruped', features: ['mane'] },
      { id: 'horse', shapeGroup: 'quadruped', features: ['mane'] },
      { id: 'dog', shapeGroup: 'quadruped', features: ['mane', 'curled-tail'] },
      { id: 'truck', shapeGroup: 'truck', features: ['mane'] },
    ]);
    expect(p).toEqual([
      'shadow-match item "cow": no outline feature of its own in group "quadruped" (features: mane)',
      'shadow-match item "horse": no outline feature of its own in group "quadruped" (features: mane)',
    ]);
  });
});
