// Tàu hỏa quanh đảo (2026-11-13, spec-tau-quanh-dao): validateTrain on the real layout and atlas (every size on
// screen, the camera at every stop), and its failures.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScreenLayout } from '../../src/content/layout-types.ts';
import { destHit, platformHit } from '../../src/content/games/train.ts';
import { atlasFrames, trainLimits, validateTrain, type AtlasJsonLike } from './rules.ts';

const APP = join(import.meta.dirname, '..', '..');
const real = (): ScreenLayout => JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', 'train.layout.json'), 'utf8')) as ScreenLayout;
const realAtlas = (): AtlasJsonLike => atlasFrames(JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', 'train.json'), 'utf8')));

describe('validateTrain (Tàu hỏa quanh đảo)', () => {
  it('the real layout and atlas pass', () => {
    expect(validateTrain(real(), trainLimits(), realAtlas())).toEqual([]);
  });

  it('a car disc too small or too close to the next one fails', () => {
    const l = real();
    expect(validateTrain(l, { ...trainLimits(), discs: { engineR: 26, carR: 15, lift: 20 } }).some((m) => m.includes('tap disc is') && m.includes('(min 80)'))).toBe(true);
    expect(validateTrain(l, { ...trainLimits(), pitch: [62, 40, 40] }).some((m) => m.includes('tap discs come'))).toBe(true);
  });

  it('a waiting tap area out of the frame, too small or on the train fails', () => {
    const l = real();
    const hit = platformHit('race');
    const far = l.hits[hit]!.map((p) => ({ x: p.x + 400, y: p.y }));
    expect(validateTrain({ ...l, hits: { ...l.hits, [hit]: far } }, trainLimits()).some((m) => m.startsWith(`hit "${hit}"`) && m.includes('leaves the interactive rect'))).toBe(true);
    const c = l.hits[hit]![0]!;
    const tiny = [c, { x: c.x + 5, y: c.y }, { x: c.x, y: c.y + 5 }];
    expect(validateTrain({ ...l, hits: { ...l.hits, [hit]: tiny } }, trainLimits()).some((m) => m.startsWith(`hit "${hit}"`) && m.includes('wide on screen'))).toBe(true);
    const stop = l.anchors['stop-beach']!;
    const onTrain = [{ x: stop.x - 30, y: stop.y - 60 }, { x: stop.x + 30, y: stop.y - 60 }, { x: stop.x, y: stop.y + 10 }];
    expect(validateTrain({ ...l, hits: { ...l.hits, [destHit('beach')]: onTrain } }, trainLimits()).some((m) => m.startsWith(`hit "${destHit('beach')}"`) && m.includes("tap disc at the stop"))).toBe(true);
  });

  it('the tunnel: a too fast fade or a too long time inside fails', () => {
    const l = real();
    expect(validateTrain(l, { ...trainLimits(), cruisePxPerS: 100000 }).some((m) => m.startsWith('the dim fades in'))).toBe(true);
    expect(validateTrain(l, { ...trainLimits(), cruisePxPerS: 1 }).some((m) => m.startsWith('the engine is inside the tunnel'))).toBe(true);
  });

  it('a missing station stop or rail is reported', () => {
    const l = real();
    const { ['stop-race']: _gone, ...anchors } = l.anchors;
    expect(validateTrain({ ...l, anchors }, trainLimits()).some((m) => m.includes('stop-race'))).toBe(true);
    expect(validateTrain({ ...l, paths: {} }, trainLimits()).some((m) => m.includes('path "rail"'))).toBe(true);
  });
});
