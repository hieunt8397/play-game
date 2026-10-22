import { describe, expect, it } from 'vitest';
import type { Point, ScreenLayout } from '../../src/content/layout-types.ts';
// Story 7.1: the 7 game stations (the home station is checked as a shell station below).
import { GAME_STATIONS, HOME_STATION, slotIds } from '../../src/content/stations.ts';
// A fixture with two pizza slots (the real pizza station keeps one since Story 7.1): the two-slot rules stay covered.
const STATIONS = GAME_STATIONS.map((s) => (s.id === 'pizza' ? { ...s, slots: slotIds('pizza', 2) } : s));
import { GAME_IDS } from '../../src/content/types.ts';
import { DECORATIONS } from '../../src/content/decorations.ts';
import { DECO_STATION_DIST_OVERRIDE, decorationLimits, layoutLimits, pngSizeOf, validateAssets, validateDecorations, validateLayout, validatePlayAgainIcons, type AssetRuleInput, type AtlasJsonLike } from './rules.ts';

const sq = (x: number, y: number, s: number): Point[] => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

interface MutableLayout {
  v: 1;
  screenId: string;
  design: { width: number; height: number };
  renderScale: number;
  anchors: Record<string, Point>;
  hits: Record<string, Point[]>;
  slots: Record<string, Point>;
  paths: Record<string, Point[]>;
}

/** 7 stations of 100×100 in a row at y 400 (PITCH apart), the road at y 600, slots above them. */
function goodLayout(): MutableLayout {
  const anchors: Record<string, Point> = { 'kart-start': { x: 500, y: 600 } };
  const hits: Record<string, Point[]> = {};
  const slots: Record<string, Point> = {};
  STATIONS.forEach((s, i) => {
    const x = 30 + i * PITCH;
    hits[s.id] = sq(x, 400, 100);
    anchors[s.id] = { x: x + 50, y: 480 };
    anchors[`${s.id}-stop`] = { x: x + 50, y: 601 };
    // Story 2.2 (review loop 1): beside the station (<= 170 px from the anchor), slot 2 <= 110 px from slot 1.
    const at = [{ x: x + 40, y: 330 }, { x: x + 85, y: 380 }];
    s.slots.forEach((id, k) => (slots[id] = at[k]!));
  });
  return {
    v: 1,
    screenId: 'map',
    design: { width: 1024, height: 768 },
    renderScale: 2,
    anchors,
    hits,
    slots,
    paths: { road: [{ x: 24, y: 600 }, { x: 1000, y: 600 }] },
  };
}
/** Station pitch: 100 wide + 40 gap. 30 + 6 × 140 + 100 = 970 ≤ 1000. */
const PITCH = 140;

const edit = (f: (l: MutableLayout) => void): ScreenLayout => {
  const l = goodLayout();
  f(l);
  return l;
};
const check = (l: ScreenLayout, stations = STATIONS, gameIds: readonly string[] = GAME_IDS): string[] =>
  validateLayout(l, { stations, gameIds, limits: layoutLimits() });

describe('validateLayout', () => {
  it('the limits come from Tokens: x∈[24,1000], y∈[66,694], 80, 40', () => {
    expect(layoutLimits()).toEqual({ rect: { x0: 24, y0: 66, x1: 1000, y1: 694 }, targetMin: 80, stationGap: 40, roadTolerance: 4 });
  });

  it('a good layout passes', () => {
    expect(check(goodLayout())).toEqual([]);
  });

  it('station ids must be exactly the GameIds, once each', () => {
    expect(check(goodLayout(), [...STATIONS, STATIONS[0]!])).toContain('station "ice-cream": listed more than once');
    expect(check(goodLayout(), STATIONS.slice(1))).toContain('station "ice-cream": GameId has no station');
    expect(check(goodLayout(), STATIONS, GAME_IDS.slice(1))).toContain('station "ice-cream": not a GameId');
  });

  it('Story 7.1: a shell station (home) is allowed only when listed, and follows every station rule', () => {
    const home = { id: HOME_STATION, label: 'Nhà Xoài', awake: true, slots: [] };
    const withHome = (f: (l: MutableLayout) => void = () => undefined): ScreenLayout =>
      edit((l) => {
        l.hits.home = sq(450, 180, 100);
        l.anchors.home = { x: 500, y: 260 };
        l.anchors['home-stop'] = { x: 500, y: 600 };
        f(l);
      });
    const run = (l: ScreenLayout, shell: readonly string[] = [HOME_STATION]): string[] =>
      validateLayout(l, { stations: [...STATIONS, home], gameIds: GAME_IDS, shellStations: shell, limits: layoutLimits() });
    expect(run(withHome())).toEqual([]);
    expect(run(withHome(), [])).toEqual(['station "home": not a GameId']);
    expect(validateLayout(goodLayout(), { stations: STATIONS, gameIds: GAME_IDS, shellStations: [HOME_STATION], limits: layoutLimits() })).toEqual([
      'station "home": shell station has no station',
    ]);
    expect(run(withHome((l) => delete l.anchors['home-stop']))).toEqual(['anchor "home-stop": missing']);
    expect(run(withHome((l) => (l.hits.home = sq(450, 340, 100))))[0]).toBe('hits "fishing" and "home": not separated (they overlap)');
  });

  it('Story 5.2 guide: anchor and hit present, inside the rect, at least targetMin wide; may overlap a station', () => {
    const guide = (f: (l: MutableLayout) => void = () => undefined): string[] =>
      validateLayout(
        edit((l) => {
          l.anchors.shiba = { x: 100, y: 480 };
          l.hits.shiba = sq(60, 390, 90); // overlaps hit.ice-cream: allowed
          f(l);
        }),
        { stations: STATIONS, gameIds: GAME_IDS, limits: layoutLimits(), guide: 'shiba' },
      );
    expect(guide()).toEqual([]);
    expect(guide((l) => delete l.anchors.shiba)).toEqual(['anchor "shiba": missing (the guide)']);
    expect(guide((l) => delete l.hits.shiba)).toEqual(['hit "shiba": missing or has fewer than 3 points (the guide)']);
    expect(guide((l) => (l.hits.shiba = sq(60, 390, 60)))).toEqual(['hit "shiba": minimum width 60.0 px is under 80']);
    expect(guide((l) => (l.hits.shiba = sq(10, 390, 90)))).toEqual(['hit "shiba": 2 vertex(es) outside the interactive rect, e.g. (10, 390)']);
    // Without `guide` nothing is checked.
    expect(check(goodLayout())).toEqual([]);
  });

  it('each station needs a hit, an anchor and a -stop anchor', () => {
    const p = check(
      edit((l) => {
        delete l.hits.pizza;
        delete l.anchors.race;
        delete l.anchors['fishing-stop'];
      }),
    );
    expect(p).toEqual(expect.arrayContaining(['hit "pizza": missing or has fewer than 3 points', 'anchor "race": missing', 'anchor "fishing-stop": missing']));
  });

  it('-stop anchors and kart-start lie within 4 px of the road; the road needs 2 points', () => {
    expect(check(edit((l) => (l.anchors['pizza-stop'] = { x: 200, y: 610 })))).toEqual(['anchor "pizza-stop": 10.0 px from path "road" (max 4)']);
    expect(check(edit((l) => (l.anchors['kart-start'] = { x: 200, y: 590 })))).toEqual(['anchor "kart-start": 10.0 px from path "road" (max 4)']);
    expect(check(edit((l) => (l.paths.road = [{ x: 1, y: 1 }])))).toContain('path "road": missing or has fewer than 2 points');
  });

  it('every content slot exists, inside the rect and outside every station polygon', () => {
    expect(check(edit((l) => delete l.slots['pizza-1']))).toEqual(['slot "pizza-1": missing']);
    expect(check(edit((l) => (l.slots['pizza-1'] = { x: 10, y: 200 })))).toEqual(['slot "pizza-1": (10, 200) is outside the interactive rect']);
    expect(check(edit((l) => (l.slots['pizza-1'] = { x: 80, y: 450 })))).toEqual(['slot "pizza-1": inside the hit polygon of "ice-cream"']);
  });

  it('hit vertices lie inside the interactive rect', () => {
    expect(check(edit((l) => (l.hits['ice-cream'] = sq(20, 400, 100))))).toEqual([
      'hit "ice-cream": 2 vertex(es) outside the interactive rect x∈[24,1000] y∈[66,694], e.g. (20, 400)',
    ]);
    expect(check(edit((l) => (l.hits['ice-cream'] = sq(30, 60, 100))))[0]).toMatch(/^hit "ice-cream": 2 vertex\(es\) outside/);
    expect(check(edit((l) => (l.hits['ice-cream'] = sq(30, 600, 100))))[0]).toMatch(/^hit "ice-cream": 2 vertex\(es\) outside/);
  });

  it('hit polygons are at least 80 wide', () => {
    const narrow = [{ x: 170, y: 400 }, { x: 270, y: 400 }, { x: 270, y: 470 }, { x: 170, y: 470 }];
    expect(check(edit((l) => (l.hits.pizza = narrow)))).toEqual(['hit "pizza": minimum width 70.0 px is under 80']);
  });

  it('station polygons are at least 40 apart; intersecting pairs are "not separated"', () => {
    const p = check(
      edit((l) => {
        l.hits.fishing = sq(30 + 5 * PITCH - 50, 400, 100); // over dino-puzzle, off its own neighbours
        l.hits['touch-talk'] = sq(30 + 3 * PITCH, 150, 100);
      }),
    );
    expect(p).toContain('hits "fishing" and "dino-puzzle": not separated (they overlap)');
  });

  it('touch-talk and shadow-match closer than 40 are named', () => {
    const p = check(edit((l) => (l.hits['shadow-match'] = sq(30 + 4 * PITCH + 120, 400, 100))));
    expect(p).toContain('hits "touch-talk" and "shadow-match": 20.0 px apart (min 40)');
  });
});

// --- assets ----------------------------------------------------------------------------------

function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b;
}

const goodJson = { frames: { 'pizza/idle/00': {}, 'kart/idle/00': {} }, meta: { size: { w: 1024, h: 900 } } };

function assets(over: Partial<AssetRuleInput> = {}, sizes: Record<string, [number, number]> = {}, json: unknown = goodJson): AssetRuleInput {
  const pngs: Record<string, [number, number]> = { 'a/map.png': [1024, 900], 'bg/map.png': [2048, 1536], ...sizes };
  return {
    atlases: [{ key: 'atlas.map', png: 'a/map.png', json: 'a/map.json', frames: ['pizza/idle/00', 'kart/idle/00'] }],
    backgrounds: [{ key: 'bg.map', path: 'bg/map.png', width: 2048, height: 1536 }],
    files: [{ path: 'assets/x.png', bytes: 100 }],
    pngSize: (p) => {
      const s = pngs[p];
      return s ? pngSizeOf(png(s[0], s[1])) : undefined;
    },
    readJson: () => json,
    ...over,
  };
}

describe('validateAssets', () => {
  it('good assets pass', () => {
    expect(validateAssets(assets())).toEqual([]);
  });

  it('a page over 2048 fails (PNG and JSON)', () => {
    expect(validateAssets(assets({}, { 'a/map.png': [4096, 100] }))).toEqual(['atlas "atlas.map": a/map.png is 4096×100 (max 2048×2048)']);
    const j = { frames: goodJson.frames, meta: { size: { w: 2049, h: 10 } } };
    expect(validateAssets(assets({}, {}, j))).toEqual(['atlas "atlas.map": a/map.json page size 2049×10 exceeds 2048']);
  });

  it('a missing atlas file, a missing frame and a bad frame name fail', () => {
    expect(validateAssets(assets({ pngSize: (p) => (p === 'bg/map.png' ? { width: 2048, height: 1536 } : undefined) }))).toEqual([
      'atlas "atlas.map": a/map.png is missing or not a PNG',
    ]);
    const j = { frames: { 'pizza/idle/00': {}, Kart: {} }, meta: { size: { w: 10, h: 10 } } };
    expect(validateAssets(assets({}, {}, j))).toEqual([
      'atlas "atlas.map": frame "Kart" is not <object>/<state>/<nn>',
      'atlas "atlas.map": frame "kart/idle/00" is missing',
    ]);
    expect(validateAssets(assets({ readJson: () => undefined }))).toEqual(['atlas "atlas.map": a/map.json is missing or not a JSON hash']);
  });

  it('the background must be exactly 2048×1536', () => {
    expect(validateAssets(assets({}, { 'bg/map.png': [1024, 768] }))).toEqual(['background "bg.map": bg/map.png is 1024×768 (must be 2048×1536)']);
  });

  it('a file over 8 MiB fails', () => {
    const files = [
      { path: 'assets/big.png', bytes: 8388609 },
      { path: 'assets/ok.png', bytes: 8388608 },
    ];
    expect(validateAssets(assets({ files }))).toEqual(['file assets/big.png: 8388609 bytes exceeds 8 MiB (8388608)']);
  });

  it('pngSizeOf reads the IHDR and rejects non-PNGs', () => {
    expect(pngSizeOf(png(7, 9))).toEqual({ width: 7, height: 9 });
    expect(pngSizeOf(new Uint8Array(40))).toBeUndefined();
  });
});

// --- Story 1.8: Tiệm kem screen rules ---------------------------------------------------------
import { screen as iceCreamScreen } from '../../src/content/games/ice-cream.ts';
import { iceCreamLimits, requiredIdProblems, validateIceCream } from './rules.ts';

function iceLayout(): MutableLayout {
  const row = 560;
  return {
    v: 1,
    screenId: 'ice-cream',
    design: { width: 1024, height: 768 },
    renderScale: 2,
    anchors: { shiba: { x: 520, y: 520 }, cone: { x: 512, y: row } },
    hits: { shiba: sq(400, 200, 200), 'shiba-nose': sq(470, 260, 80), counter: sq(60, 500, 900), 'counter-upper': sq(60, 500, 900), 'counter-top': sq(60, 500, 900) },
    slots: {
      'scoop-1': { x: 152, y: row },
      'scoop-2': { x: 332, y: row },
      'scoop-3': { x: 692, y: row },
      'scoop-4': { x: 872, y: row },
      'cone-1': { x: 512, y: 450 },
      'cone-2': { x: 512, y: 420 },
      'cone-3': { x: 512, y: 390 },
    },
    paths: {},
  };
}

function iceAtlas(over: Record<string, { w: number; h: number }> = {}) {
  const frames: Record<string, { spriteSourceSize: { x: number; y: number; w: number; h: number } }> = {};
  for (const f of iceCreamScreen.frames) {
    const size = over[f] ?? (f.startsWith('shiba') ? { w: 400, h: 500 } : { w: 232, h: 180 });
    frames[f] = { spriteSourceSize: { x: 0, y: 0, ...size } };
  }
  return { frames };
}

const checkIce = (l: MutableLayout, atlas?: ReturnType<typeof iceAtlas>) => validateIceCream(l as ScreenLayout, iceCreamLimits(iceCreamScreen), atlas);

describe('validateIceCream', () => {
  it('a good layout and atlas pass', () => {
    expect(checkIce(iceLayout(), iceAtlas())).toEqual([]);
  });

  it('names every missing id', () => {
    const l = iceLayout();
    delete l.slots['cone-1'];
    delete l.anchors.shiba;
    delete l.hits['counter-upper'];
    expect(requiredIdProblems(l as ScreenLayout, iceCreamScreen)).toEqual([
      'anchor "shiba": missing',
      'hit "counter-upper": missing or has fewer than 3 points',
      'slot "cone-1": missing',
    ]);
    expect(checkIce(l)).toContain('slot "cone-1": missing');
  });

  it('the row must sit in the lower third, above the bottom dead strip', () => {
    const l = iceLayout();
    l.slots['scoop-1'] = { x: 152, y: 500 };
    l.anchors.cone = { x: 512, y: 660 };
    const p = checkIce(l);
    expect(p.some((m) => m.startsWith('slot "scoop-1": y 500 is outside the lower third'))).toBe(true);
    expect(p.some((m) => m.startsWith('anchor "cone": y 660 is outside the lower third'))).toBe(true);
  });

  it('row gaps: 180 ± 20 in x and within spacing 2 in y', () => {
    const l = iceLayout();
    l.slots['scoop-4'] = { x: 910, y: 580 };
    const p = checkIce(l);
    expect(p).toContain('row "scoop-3" → "scoop-4": x gap 218 is not 180 ± 20');
    expect(p).toContain('row "scoop-3" → "scoop-4": y differs by 20 (max 16)');
  });

  it('slots stay inside the interactive rect inset by minSize/2', () => {
    const l = iceLayout();
    l.slots['cone-3'] = { x: 512, y: 100 };
    expect(checkIce(l)).toContain('slot "cone-3": (512, 100) is outside the interactive rect inset by 45');
  });

  it('Shiba sits centre-back', () => {
    const l = iceLayout();
    l.anchors.shiba = { x: 720, y: 600 };
    const p = checkIce(l);
    expect(p).toContain('anchor "shiba": 208 px from the centre (max 170.67)');
    expect(p).toContain('anchor "shiba": y 600 is not behind the cone (y 560)');
  });

  it('atlas: frames present, Shiba tall and scoops wide enough', () => {
    const atlas = iceAtlas({ 'shiba/idle/00': { w: 400, h: 400 }, 'scoop-mint/idle/00': { w: 170, h: 180 } });
    delete (atlas.frames as Record<string, unknown>)['shiba/happy/03'];
    const p = checkIce(iceLayout(), atlas);
    expect(p).toContain('atlas "ice-cream": frame "shiba/happy/03" is missing');
    expect(p).toContain('frame "shiba/idle/00": trimmed height 200 is under 220');
    expect(p).toContain('frame "scoop-mint/idle/00": trimmed width 85 is under 90');
  });

  it('the real layout and atlas pass', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const app = join(import.meta.dirname, '..', '..');
    const layout = JSON.parse(readFileSync(join(app, 'src/content/generated/ice-cream.layout.json'), 'utf8'));
    const atlas = JSON.parse(readFileSync(join(app, 'public/assets/atlases/ice-cream.json'), 'utf8'));
    expect(validateIceCream(layout, iceCreamLimits(iceCreamScreen), atlas)).toEqual([]);
  });
});

describe('validateDecorations (Story 2.2)', () => {
  // Each item renders as a 32×90 (design px) footprint standing on its station's slot 1 (the pivot).
  const FP = { w: 32, h: 90 };
  type Frames = Record<string, { spriteSourceSize: { x: number; y: number; w: number; h: number } }>;
  const atlasFor = (l: ScreenLayout, size = FP): Frames => {
    const frames: Frames = {};
    for (const s of STATIONS) {
      const p = l.slots[s.slots[0]!]!;
      for (const d of DECORATIONS[s.id]) {
        frames[`decoration/${d.id}/00`] = { spriteSourceSize: { x: (p.x - size.w / 2) * 2, y: (p.y - size.h) * 2, w: size.w * 2, h: size.h * 2 } };
      }
    }
    return frames;
  };
  const rules = (catalogue = DECORATIONS as Record<string, ReadonlyArray<{ id: string }>>, stations = STATIONS) =>
    decorationLimits(stations, GAME_IDS, catalogue);
  const run = (l: ScreenLayout, atlas: AtlasJsonLike | undefined = { frames: atlasFor(l) }, input = rules()): string[] =>
    validateDecorations(l, input, atlas);

  it('the fixture has 2 slots for ice-cream, pizza and race and 1 elsewhere', () => {
    expect(STATIONS.map((s) => s.slots.length)).toEqual([2, 2, 2, 1, 1, 1, 1]);
  });

  it('passes the fixture (and validateLayout too)', () => {
    const l = goodLayout();
    expect(run(l)).toEqual([]);
    expect(check(l)).toEqual([]);
  });

  it('a station with no slot, or slot ids not <id>-1..k', () => {
    const stations = STATIONS.map((s) => (s.id === 'race' ? { ...s, slots: [] } : s.id === 'pizza' ? { ...s, slots: ['pizza-2', 'pizza-1'] } : s));
    const p = run(goodLayout(), undefined, rules(undefined, stations));
    expect(p).toContain('station "race": has no decoration slot');
    expect(p).toContain('slot "pizza-2": station "pizza" slots must be "pizza-1..2" in order');
    expect(p).toContain('slot "race-1": in the layout but not listed in content/stations.ts');
  });

  it('a layout slot not listed in content', () => {
    expect(run(edit((l) => (l.slots['pizza-4'] = { x: 300, y: 300 })), undefined)).toEqual(['slot "pizza-4": in the layout but not listed in content/stations.ts']);
  });

  it('an empty catalogue, a non-kebab id and an id used by two stations', () => {
    const catalogue = { ...DECORATIONS, race: [], pizza: [{ id: 'Pizza_Pie' }, { id: 'parasol' }] };
    expect(validateDecorations(goodLayout(), rules(catalogue))).toEqual([
      'decoration "Pizza_Pie": id is not kebab-case',
      'decoration "parasol": used by both "ice-cream" and "pizza"',
      'decorations "race": the catalogue is empty',
    ]);
  });

  it('a missing frame names the id', () => {
    const l = goodLayout();
    const frames = atlasFor(l);
    delete frames['decoration/koi/00'];
    expect(run(l, { frames })).toEqual(['decoration "koi": atlas "map" has no frame "decoration/koi/00"']);
  });

  it('a footprint under 80 px on its longest side', () => {
    const l = goodLayout();
    const p = run(l, { frames: atlasFor(l, { w: 40, h: 70 }) });
    expect(p).toContain('decoration "parasol" at slot "ice-cream-1": footprint 40×70 is under 80 px on its longest side');
  });

  it('a tap rect side under targetMin', () => {
    const l = goodLayout();
    const p = run(l, { frames: atlasFor(l, { w: 20, h: 90 }) });
    expect(p).toContain('decoration "sundae" at slot "ice-cream-2": tap rect 68×138 has a side under 80');
  });

  it('a tap rect outside the interactive rect', () => {
    const p = run(edit((l) => (l.slots['race-2'] = { x: 995, y: 380 })));
    expect(p.some((m) => m.startsWith('decoration "cone" at slot "race-2": tap rect') && m.includes('outside the interactive rect'))).toBe(true);
  });

  it('a footprint inside a station polygon as stored (UX-DR9)', () => {
    const p = run(edit((l) => (l.slots['pizza-2'] = { x: l.slots['pizza-2']!.x, y: 430 })));
    expect(p).toContain('decoration "tomato" at slot "pizza-2": footprint intersects the hit polygon of "pizza"');
  });

  it('two slots of one station whose union footprints overlap', () => {
    const p = run(edit((l) => (l.slots['race-2'] = { x: l.slots['race-1']!.x + 10, y: 350 })));
    expect(p).toContain('slots "race-1" and "race-2": decoration footprints overlap');
  });

  it('review loop 1: slots of different stations whose footprints overlap', () => {
    const p = run(edit((l) => (l.slots['pizza-2'] = { x: l.slots['ice-cream-2']!.x + 10, y: 380 })));
    expect(p).toContain('slots "ice-cream-2" and "pizza-2": decoration footprints overlap');
  });

  it('review loop 1: a slot more than 170 px from its station anchor (checked without the atlas too)', () => {
    const l = edit((m) => (m.slots['fishing-1'] = { x: m.anchors.fishing!.x - 60, y: 300 }));
    expect(validateDecorations(l, rules())).toContain('slot "fishing-1": 189.74 px from the anchor of "fishing" (max 170)');
  });

  it('review loop 1b: dino-puzzle may sit up to 240 px away (DECO_STATION_DIST_OVERRIDE), not further', () => {
    expect(DECO_STATION_DIST_OVERRIDE).toEqual({ 'dino-puzzle': 240 });
    const at = (dy: number) => edit((m) => (m.slots['dino-puzzle-1'] = { x: m.anchors['dino-puzzle']!.x, y: m.anchors['dino-puzzle']!.y - dy }));
    expect(validateDecorations(at(200), rules())).toEqual([]);
    expect(validateDecorations(at(250), rules())).toContain('slot "dino-puzzle-1": 250 px from the anchor of "dino-puzzle" (max 240)');
  });

  it('review loop 1: a slot more than 110 px from its station slot 1 (the render pivot)', () => {
    const l = edit((m) => (m.slots['pizza-2'] = { x: m.slots['pizza-1']!.x + 70, y: 450 }));
    expect(validateDecorations(l, rules())).toContain('slot "pizza-2": 138.92 px from slot "pizza-1" (max 110)');
  });
});

describe('validatePlayAgainIcons (Story 2.4)', () => {
  const frame = (w: number, h: number) => ({ frame: { x: 0, y: 0, w, h }, spriteSourceSize: { x: 10, y: 20, w, h }, trimmed: true });

  it('passes when icon/<id>/00 exists at ≥ 112 px (trimmed longest side ÷ renderScale)', () => {
    expect(validatePlayAgainIcons(['ice-cream'], { frames: { 'icon/ice-cream/00': frame(224, 150) } }, 2, 112)).toEqual([]);
  });

  it('names the id when the frame is missing or too small', () => {
    expect(validatePlayAgainIcons(['ice-cream'], { frames: {} }, 2, 112)).toEqual(['play-again icon "ice-cream": atlas "map" has no frame "icon/ice-cream/00"']);
    expect(validatePlayAgainIcons(['ice-cream'], { frames: { 'icon/ice-cream/00': frame(200, 150) } }, 2, 112)).toEqual([
      'play-again icon "ice-cream": frame "icon/ice-cream/00" is 100 px on its longest side (min 112)',
    ]);
  });
});
