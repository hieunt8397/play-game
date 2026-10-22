// Story 7.1: the yard's plan and corner-tap controller (I/O matrix rows "Tap awake corner", "Tap sleeping
// corner", "Home in yard", "7.1 alone").
import { describe, expect, it } from 'vitest';
import { cornerNameLine, YARD_CORNERS, yardCorners, type CornerId } from '../content/home';
import type { Point, ScreenLayout } from '../content/layout-types';
import { planYard, SFX_HAPPY, YardController, type YardCommand } from './home-yard';
/** Under MAX_TICK_MS (250): one tick covers it. The scene uses Timing.stationTapMs. */
const DEPART = 200;

const sq = (x: number, y: number, s: number): Point[] => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

function layout(): ScreenLayout {
  const anchors: Record<string, Point> = {};
  const hits: Record<string, Point[]> = {};
  YARD_CORNERS.forEach((c, i) => {
    anchors[c.id] = { x: 100 + i * 180, y: 600 - i * 50 };
    hits[c.id] = sq(40 + i * 180, 400 - i * 50, 160);
  });
  return { v: 1, screenId: 'home', design: { width: 1024, height: 768 }, renderScale: 2, anchors, hits, slots: {}, paths: {} };
}

const kinds = (cmds: readonly YardCommand[]): string[] => cmds.map((c) => c.kind);

/** pen and stage awake (their games registered), the rest asleep. */
function make(awake: readonly string[] = ['animal-pens', 'band']) {
  const corners = yardCorners((id) => awake.includes(id));
  return new YardController({ corners, nameLine: cornerNameLine, departMs: DEPART });
}

describe('planYard (Story 7.1)', () => {
  it('places every corner on its ground pivot at 1/renderScale, back to front, with its hit and label', () => {
    const plan = planYard(layout(), yardCorners(() => false), () => true);
    expect(plan.warnings).toEqual([]);
    expect(plan.corners.map((c) => c.id)).toEqual(['wardrobe', 'clinic', 'bed', 'stage', 'pen']);
    const pen = plan.corners.find((c) => c.id === 'pen')!;
    expect(pen.image).toEqual({ frame: 'pen/idle/00', x: 100, y: 600, originX: 100 / 1024, originY: 600 / 768, scale: 0.5 });
    expect(pen.hit).toEqual(sq(40, 400, 160));
    expect(pen.depth).toBe(600);
    expect(pen.labelPos.y).toBeGreaterThan(600);
    expect(plan.labelDepth).toBeGreaterThan(plan.ringDepth);
    expect(plan.bg).toEqual({ x: 0, y: 0, scale: 0.5, depth: -1 });
  });

  it('a missing frame skips the image (hotspot kept); a missing hit skips the corner; both warn', () => {
    const l = layout();
    const hits = { ...l.hits };
    delete hits.bed;
    const plan = planYard({ ...l, hits }, yardCorners(() => false), (f) => f !== 'pen/idle/00', { atlasKey: 'atlas.home' });
    expect(plan.corners.map((c) => c.id)).not.toContain('bed');
    expect(plan.corners.find((c) => c.id === 'pen')?.image).toBeUndefined();
    expect(plan.warnings).toEqual([
      'yard: frame "pen/idle/00" is missing from atlas.home — image skipped',
      'yard: corner "bed" is missing from the layout (hits) — skipped',
    ]);
  });
});

describe('YardController (Story 7.1)', () => {
  it('sleeping corner: bounce + happy sound, nothing loads or opens', () => {
    const y = make();
    expect(y.tapCorner('clinic')).toEqual([
      { kind: 'bounce', target: 'clinic' },
      { kind: 'sfx', id: SFX_HAPPY },
    ]);
    expect(y.state).toBe('idle');
    expect(y.tick(5000)).toEqual([]);
  });

  it('7.1 alone: with no yard game registered every corner sleeps', () => {
    const y = make([]);
    for (const c of YARD_CORNERS) expect(kinds(y.tapCorner(c.id))).toEqual(['bounce', 'sfx']);
    expect(y.state).toBe('idle');
  });

  it('awake corner: bounce, name, prompt, load; opens once the bounce time passed and the assets settled', () => {
    const y = make();
    expect(y.tapCorner('pen')).toEqual([
      { kind: 'bounce', target: 'pen' },
      { kind: 'say', lineId: 'vo.shell.corner-name.pen' },
      { kind: 'setPrompt', lineId: 'vo.shell.corner-name.pen' },
      { kind: 'load', gameId: 'animal-pens' },
    ]);
    expect(y.state).toBe('opening');
    expect(y.assetsSettled('animal-pens')).toEqual([]);
    expect(y.tick(DEPART - 1)).toEqual([]);
    expect(y.tick(1)).toEqual([{ kind: 'enter', corner: 'pen', gameId: 'animal-pens' }]);
    expect(y.state).toBe('entering');
  });

  it('assets after the bounce: opens on settle', () => {
    const y = make();
    y.tapCorner('stage');
    expect(y.tick(DEPART + 100)).toEqual([]);
    expect(y.assetsSettled('band')).toEqual([{ kind: 'enter', corner: 'stage', gameId: 'band' }]);
  });

  it('a failed load still settles (the game starts without the file): opens', () => {
    const y = make();
    y.tapCorner('pen');
    y.tick(DEPART);
    expect(kinds(y.assetsSettled('animal-pens'))).toEqual(['enter']);
  });

  it('re-tap of the target only bounces + says; another awake corner re-targets with its own load', () => {
    const y = make();
    y.tapCorner('pen');
    expect(kinds(y.tapCorner('pen'))).toEqual(['bounce', 'say']);
    expect(kinds(y.tapCorner('stage'))).toEqual(['bounce', 'say', 'setPrompt', 'load']);
    expect(y.target).toBe('stage');
    y.assetsSettled('animal-pens');
    expect(y.tick(DEPART)).toEqual([]);
    expect(kinds(y.assetsSettled('band'))).toEqual(['enter']);
  });

  it('entering ignores taps and Home; woke() returns to idle and reloads next time', () => {
    const y = make();
    y.tapCorner('pen');
    y.assetsSettled('animal-pens');
    y.tick(DEPART);
    expect(y.tapCorner('stage')).toEqual([]);
    expect(y.home()).toEqual([]);
    y.woke();
    expect(y.state).toBe('idle');
    expect(kinds(y.tapCorner('pen'))).toContain('load');
  });

  it('Home in the yard: leave once (also while a corner is opening)', () => {
    const y = make();
    y.tapCorner('pen');
    expect(y.home()).toEqual([{ kind: 'leave' }]);
    expect(y.home()).toEqual([]);
    expect(y.tapCorner('pen')).toEqual([]);
    expect(y.assetsSettled('animal-pens')).toEqual([]);
  });

  it('an unknown corner id does nothing', () => {
    expect(make().tapCorner('attic' as CornerId)).toEqual([]);
  });
});
