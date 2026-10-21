// Story 1.5 I/O matrix: Enter Map (plan), Missing frame, Missing station, Label at edge, depth order,
// no slot items, kart prop rect.
import { describe, expect, it } from 'vitest';
import type { ScreenLayout } from '../content/layout-types';
import { MAP_AMBIENT, MAP_GUIDE } from '../content/assets';
import { LAYOUTS } from '../content/layouts';
import { KART_FRAME, STATIONS } from '../content/stations';
import { labelPosition, planAmbient, planMap } from './map-plan';
import { Tokens } from './tokens';

const layout = LAYOUTS.map;
const allFrames = (): boolean => true;
/** spriteSourceSize of the kart in render px (2×). */
const KART_SS = { x: 857, y: 888, width: 109, height: 135 };
const frameRect = (frame: string) => (frame === KART_FRAME ? KART_SS : undefined);
const fixedSize = () => ({ w: 100, h: 22 });

describe('planMap (real layout)', () => {
  const plan = planMap(layout, STATIONS, allFrames, frameRect, { measureLabel: fixedSize });

  it('plans all 7 stations with images, labels and their stored hit polygons; no warnings', () => {
    expect(plan.warnings).toEqual([]);
    expect(plan.stations).toHaveLength(7);
    for (const s of plan.stations) {
      expect(s.hit).toBe(layout.hits[s.id]);
      expect(s.label.length).toBeGreaterThan(0);
      const a = layout.anchors[s.id]!;
      expect(s.image).toEqual({
        frame: `${s.id}/idle/00`,
        x: a.x,
        y: a.y,
        originX: a.x / layout.design.width,
        originY: a.y / layout.design.height,
        scale: 1 / layout.renderScale,
      });
    }
    expect(plan.stations.filter((s) => s.awake).map((s) => s.id)).toEqual(['dino-puzzle', 'shadow-match', 'touch-talk', 'fishing', 'race', 'ice-cream', 'pizza']);
  });

  it('sorts by anchor y (back to front); bg lowest, labels above everything, ring below labels', () => {
    const depths = plan.stations.map((s) => s.depth);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
    expect(depths).toEqual(plan.stations.map((s) => layout.anchors[s.id]!.y));
    const top = Math.max(...depths, layout.anchors['kart-start']!.y);
    expect(plan.bg.depth).toBeLessThan(Math.min(...depths));
    expect(plan.ringDepth).toBeGreaterThan(top);
    expect(plan.labelDepth).toBeGreaterThan(plan.ringDepth);
    expect(plan.bg.scale).toBe(1 / layout.renderScale);
  });

  it('plans no slot items (UX-DR42)', () => {
    const ids = plan.stations.map((s) => s.id);
    for (const slot of Object.keys(layout.slots)) expect(ids).not.toContain(slot);
    expect(JSON.stringify(plan)).not.toMatch(/slot/);
  });

  it('kart (Story 1.7): pivot at the trimmed centre x and the kart-start ground y; hit r = 72 around the visible centre', () => {
    const k = plan.kart;
    const rs = layout.renderScale;
    const start = layout.anchors['kart-start']!;
    const centre = { x: (KART_SS.x + KART_SS.width / 2) / rs, y: (KART_SS.y + KART_SS.height / 2) / rs };
    expect(k.frame).toBe(KART_FRAME);
    expect(k.scale).toBe(1 / rs);
    expect(k.originX).toBeCloseTo(centre.x / layout.design.width);
    expect(k.originY).toBeCloseTo(start.y / layout.design.height);
    expect(k.centerOffset.x).toBeCloseTo(0);
    expect(k.centerOffset.y).toBeCloseTo(centre.y - start.y);
    expect(k.hitRadius).toBe(Tokens.components.kart.size / 2 + Tokens.components.kart.hitPad);
    expect(k.hitRadius).toBe(72);
    // Placed at its pivot, the frame covers the rendered kart exactly where it was rendered.
    expect(k.originX * layout.design.width - centre.x).toBeCloseTo(0);
  });

  it('labels: centred under the anchor (top = anchor.y + spacing 1) and inside safeRect', () => {
    const safe = Tokens.safeRect;
    for (const s of plan.stations) {
      expect(s.labelPos.x - 50).toBeGreaterThanOrEqual(safe.x);
      expect(s.labelPos.x + 50).toBeLessThanOrEqual(safe.x + safe.w);
      expect(s.labelPos.y).toBeGreaterThanOrEqual(safe.y);
      expect(s.labelPos.y + 22).toBeLessThanOrEqual(safe.y + safe.h);
    }
    const ice = plan.stations.find((s) => s.id === 'ice-cream')!;
    expect(ice.labelPos).toEqual({ x: ice.anchor.x, y: ice.anchor.y + Tokens.spacing['1'] });
  });
});

describe('planMap (edge cases)', () => {
  it('missing frame: no image, label and hotspot stay, one warning names the frame', () => {
    const plan = planMap(layout, STATIONS, (f) => f !== 'pizza/idle/00', frameRect, { measureLabel: fixedSize, atlasKey: 'atlas.map' });
    const pizza = plan.stations.find((s) => s.id === 'pizza')!;
    expect(pizza.image).toBeUndefined();
    expect(pizza.hit).toBe(layout.hits.pizza);
    expect(pizza.label).toBe('Tiệm pizza');
    expect(plan.warnings).toEqual(['map: frame "pizza/idle/00" is missing from atlas.map — image skipped']);
  });

  it('missing station in the layout: skipped with a warning', () => {
    const { race: _race, ...hits } = layout.hits;
    const broken: ScreenLayout = { ...layout, hits };
    const plan = planMap(broken, STATIONS, allFrames, frameRect, { measureLabel: fixedSize });
    expect(plan.stations.map((s) => s.id)).not.toContain('race');
    expect(plan.stations).toHaveLength(6);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toMatch(/station "race" is missing from the layout/);
  });

  it('missing kart frame: no image but the hit circle stays, one warning', () => {
    const plan = planMap(layout, STATIONS, (f) => f !== KART_FRAME, frameRect, { measureLabel: fixedSize });
    expect(plan.kart.frame).toBeUndefined();
    expect(plan.kart.hitRadius).toBe(72);
    expect(plan.warnings).toEqual([expect.stringMatching(/kart\/idle\/00/)]);
  });
});

describe('planMap guide (Story 5.2)', () => {
  it('the real layout: the Shiba at anchors.shiba with hits.shiba, depth = anchor y, all 4 wave frames', () => {
    const plan = planMap(layout, STATIONS, allFrames, frameRect, { measureLabel: fixedSize });
    const g = plan.guide!;
    const a = layout.anchors.shiba!;
    expect(g.id).toBe('shiba');
    expect(g.hit).toBe(layout.hits.shiba);
    expect(g.depth).toBe(a.y);
    expect(g.image).toEqual({ frame: MAP_GUIDE.idle, x: a.x, y: a.y, originX: a.x / layout.design.width, originY: a.y / layout.design.height, scale: 1 / layout.renderScale });
    expect(g.wave).toEqual(MAP_GUIDE.wave);
    expect(plan.ringDepth).toBeGreaterThan(g.depth);
    // The ice-cream station keeps its own hull (without the dog) and its anchor.
    expect(plan.stations.find((s) => s.id === 'ice-cream')!.hit).toBe(layout.hits['ice-cream']);
  });

  it('missing art: no idle frame → no image (hotspot kept), one warning; missing wave frames are listed', () => {
    const noIdle = planMap(layout, STATIONS, (f) => !f.startsWith('shiba/'), frameRect, { measureLabel: fixedSize, atlasKey: 'atlas.map' });
    expect(noIdle.guide?.image).toBeUndefined();
    expect(noIdle.guide?.hit).toBe(layout.hits.shiba);
    expect(noIdle.guide?.wave).toEqual([]);
    expect(noIdle.warnings).toEqual(['map: frame "shiba/idle/00" is missing from atlas.map — image skipped']);
    const noWave = planMap(layout, STATIONS, (f) => f !== 'shiba/wave/02', frameRect, { measureLabel: fixedSize, atlasKey: 'atlas.map' });
    expect(noWave.guide?.wave).toEqual(['shiba/wave/00', 'shiba/wave/01', 'shiba/wave/03']);
    expect(noWave.warnings).toEqual(['map: guide wave frames missing from atlas.map: shiba/wave/02']);
  });

  it('missing layout entries: no hit → no guide; no anchor → hotspot only', () => {
    const { shiba: _hit, ...hits } = layout.hits;
    const noHit = planMap({ ...layout, hits }, STATIONS, allFrames, frameRect, { measureLabel: fixedSize });
    expect(noHit.guide).toBeUndefined();
    expect(noHit.warnings).toEqual([expect.stringMatching(/guide "shiba" is missing from the layout/)]);
    const twoPoints = planMap({ ...layout, hits: { ...layout.hits, shiba: layout.hits.shiba!.slice(0, 2) } }, STATIONS, allFrames, frameRect, { measureLabel: fixedSize });
    expect(twoPoints.guide).toBeUndefined();
    expect(twoPoints.warnings).toEqual(['map: guide "shiba" is missing from the layout (hits, at least 3 points) — skipped']);
    const { shiba: _anchor, ...anchors } = layout.anchors;
    const noAnchor = planMap({ ...layout, anchors }, STATIONS, allFrames, frameRect, { measureLabel: fixedSize });
    expect(noAnchor.guide?.image).toBeUndefined();
    expect(noAnchor.guide?.hit).toBe(layout.hits.shiba);
    expect(noAnchor.warnings).toEqual([expect.stringMatching(/guide "shiba" has no anchor/)]);
  });
});

describe('labelPosition (Label at edge)', () => {
  const safe = { x: 100, y: 50, w: 800, h: 600 };
  it('centred, top at anchor.y + gap when it fits', () => {
    expect(labelPosition({ x: 400, y: 300 }, { w: 100, h: 20 }, safe, 8)).toEqual({ x: 400, y: 308 });
  });
  it('clamped at the bottom, left and right of safeRect', () => {
    expect(labelPosition({ x: 400, y: 640 }, { w: 100, h: 20 }, safe, 8)).toEqual({ x: 400, y: 630 });
    expect(labelPosition({ x: 110, y: 300 }, { w: 100, h: 20 }, safe, 8)).toEqual({ x: 150, y: 308 });
    expect(labelPosition({ x: 899, y: 300 }, { w: 100, h: 20 }, safe, 8)).toEqual({ x: 850, y: 308 });
  });
  it('clamped at the top', () => {
    expect(labelPosition({ x: 400, y: 10 }, { w: 100, h: 20 }, safe, 8)).toEqual({ x: 400, y: 50 });
  });
});

describe('planAmbient (Story 5.6)', () => {
  const CLOUD_SS = { x: 500, y: 20, width: 210, height: 100 };
  const rects = (f: string) => (f === MAP_AMBIENT.cloud.frame ? CLOUD_SS : frameRect(f));
  const at = (id: string) => layout.anchors[id]!;

  it('the real layout: whale and fountain at their anchors (depth = anchor y), every cloud and wave at its anchor with the -1 pivot as origin', () => {
    const plan = planMap(layout, STATIONS, allFrames, rects, { measureLabel: fixedSize });
    expect(plan.warnings).toEqual([]);
    const a = plan.ambient;
    for (const [s, id, base, frames] of [
      [a.whale, 'whale', MAP_AMBIENT.whale.idle, MAP_AMBIENT.whale.spout],
      [a.fountain, 'fountain', MAP_AMBIENT.fountain.spray[0], MAP_AMBIENT.fountain.spray],
    ] as const) {
      const p = at(id);
      expect(s!.image).toEqual({ frame: base, x: p.x, y: p.y, originX: p.x / layout.design.width, originY: p.y / layout.design.height, scale: 1 / layout.renderScale });
      expect(s!.depth).toBe(p.y);
      expect(s!.frames).toEqual(frames);
    }
    expect(a.clouds.map((c) => c.anchorId)).toEqual(MAP_AMBIENT.cloud.anchors);
    expect(a.waves.map((w) => w.anchorId)).toEqual(MAP_AMBIENT.wave.anchors);
    const pivot = at('cloud-1');
    for (const c of a.clouds) {
      expect(c.image.x).toBe(at(c.anchorId).x);
      expect(c.image.y).toBe(at(c.anchorId).y);
      expect(c.image.originX).toBe(pivot.x / layout.design.width);
      expect(c.image.originY).toBe(pivot.y / layout.design.height);
      expect(c.width).toBe(CLOUD_SS.width / layout.renderScale);
    }
    const wavePivot = at('wave-1');
    for (const w of a.waves) expect([w.image.originX, w.image.originY]).toEqual([wavePivot.x / layout.design.width, wavePivot.y / layout.design.height]);
    // Between the plate and every station; no hotspot is planned for the dressing.
    for (const i of [...a.clouds, ...a.waves]) {
      expect(i.depth).toBe(Tokens.ui.mapAmbientBackDepth);
      expect(i.depth).toBeGreaterThan(plan.bg.depth);
      expect(i.depth).toBeLessThan(Math.min(...plan.stations.map((s) => s.depth)));
    }
    expect(plan.ringDepth).toBeGreaterThan(a.whale!.depth);
  });

  it('an old atlas (no ambient frames): every item skipped, one warning each', () => {
    const warnings: string[] = [];
    const a = planAmbient(layout, (f) => !f.startsWith('whale/') && !f.startsWith('fountain/') && !f.startsWith('ambient/'), rects, 'atlas.map', warnings);
    expect(a).toEqual({ whale: undefined, fountain: undefined, clouds: [], waves: [] });
    expect(warnings).toHaveLength(4);
    expect(warnings[0]).toMatch(/"whale\/idle\/00" is missing from atlas\.map/);
  });

  it('MAP_AMBIENT anchor lists match the anchors of the real map layout (no TS / build_map.py drift)', () => {
    const inLayout = (re: RegExp) => Object.keys(layout.anchors).filter((id) => re.test(id)).sort();
    expect(inLayout(/^cloud-\d+$/)).toEqual([...MAP_AMBIENT.cloud.anchors].sort());
    expect(inLayout(/^wave-\d+$/)).toEqual([...MAP_AMBIENT.wave.anchors].sort());
    expect(layout.anchors[MAP_AMBIENT.whale.id]).toBeDefined();
    expect(layout.anchors[MAP_AMBIENT.fountain.id]).toBeDefined();
  });

  it('a missing spout frame keeps the whale with the frames it has, listed in one warning', () => {
    const warnings: string[] = [];
    const a = planAmbient(layout, (f) => f !== 'whale/spout/01', rects, 'atlas.map', warnings);
    expect(a.whale?.image.frame).toBe(MAP_AMBIENT.whale.idle);
    expect(a.whale?.frames).toEqual(['whale/spout/00', 'whale/spout/02', 'whale/spout/03']);
    expect(warnings).toEqual(['map: ambient "whale" frames missing from atlas.map: whale/spout/01']);
  });

  it('a missing fountain frame keeps the fountain; a missing anchor skips that item (the whale, cloud pivot, one wave)', () => {
    const warnings: string[] = [];
    const { whale: _w, 'wave-3': _w3, 'cloud-1': _c1, ...anchors } = layout.anchors;
    const a = planAmbient({ ...layout, anchors }, (f) => f !== 'fountain/spray/01', rects, 'atlas.map', warnings);
    expect(a.whale).toBeUndefined();
    expect(a.fountain?.frames).toEqual(['fountain/spray/00', 'fountain/spray/02']);
    expect(a.clouds).toEqual([]);
    expect(a.waves.map((w) => w.anchorId)).toEqual(['wave-1', 'wave-2', 'wave-4', 'wave-5']);
    expect(warnings).toHaveLength(4);
  });
});
