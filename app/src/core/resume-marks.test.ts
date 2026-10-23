// Story 2.5 I/O matrix (mark rows): placement on the station's top-right corner, the clamp into the
// interactive rect, and the real map layout for all 7 stations.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Point, ScreenLayout } from '../content/layout-types';
import { GAME_STATIONS } from '../content/stations';
// Story 7.2: the island stations are the island games (yard games are marked in the yard).
import { ISLAND_GAME_IDS as GAME_IDS } from '../content/types';
import { islandInteractiveRect, RESUME_MARK_EXTENT, RESUME_MARK_OUTLINE_PX, resumeMarkPlan } from './resume-marks';
import { Tokens } from './tokens';

const AREA = islandInteractiveRect();
const R = Tokens.ui.resumeMarkRadiusPx;
const square = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

describe('resumeMarkPlan', () => {
  it('one mark per id, on the bbox top-right corner moved inwards by the radius', () => {
    const hits = { 'ice-cream': square(300, 300, 500, 450), pizza: square(600, 200, 700, 300) };
    expect(resumeMarkPlan(['ice-cream', 'pizza'], hits, AREA)).toEqual([
      { id: 'ice-cream', x: 500 - R, y: 300 + R },
      { id: 'pizza', x: 700 - R, y: 200 + R },
    ]);
  });

  it('an id without a hit polygon gets no mark', () => {
    expect(resumeMarkPlan(['race'], { 'ice-cream': square(300, 300, 500, 450) }, AREA)).toEqual([]);
  });

  it('a station touching the edges is clamped so the whole mark lies inside the interactive rect', () => {
    const [m] = resumeMarkPlan(['ice-cream'], { 'ice-cream': square(900, 0, 1024, 100) }, AREA);
    expect(m).toEqual({ id: 'ice-cream', x: AREA.x1 - RESUME_MARK_EXTENT, y: AREA.y0 + RESUME_MARK_EXTENT });
  });

  it('an interactive rect narrower than the mark: centred in it on that axis', () => {
    const narrow = { x0: 100, y0: 100, x1: 130, y1: 500 };
    const [m] = resumeMarkPlan(['ice-cream'], { 'ice-cream': square(0, 200, 400, 300) }, narrow);
    expect(m).toEqual({ id: 'ice-cream', x: 115, y: 200 + R });
  });

  it('the extent covers the annulus plus its outline', () => {
    expect(RESUME_MARK_EXTENT).toBe(R + RESUME_MARK_OUTLINE_PX);
  });
});

describe('resumeMarkPlan on the real map layout', () => {
  const layout = JSON.parse(readFileSync(new URL('../content/generated/map.layout.json', import.meta.url), 'utf8')) as ScreenLayout;

  it('every one of the 7 stations gets a mark whose whole circle lies inside the interactive rect', () => {
    // Story 7.1: the home station opens the yard (its games' marks are drawn there).
    expect(GAME_STATIONS.map((s) => s.id).sort()).toEqual([...GAME_IDS].sort());
    const plan = resumeMarkPlan(GAME_IDS, layout.hits);
    expect(plan.map((m) => m.id)).toEqual([...GAME_IDS]);
    for (const m of plan) {
      expect(m.x - RESUME_MARK_EXTENT, m.id).toBeGreaterThanOrEqual(AREA.x0);
      expect(m.x + RESUME_MARK_EXTENT, m.id).toBeLessThanOrEqual(AREA.x1);
      expect(m.y - RESUME_MARK_EXTENT, m.id).toBeGreaterThanOrEqual(AREA.y0);
      expect(m.y + RESUME_MARK_EXTENT, m.id).toBeLessThanOrEqual(AREA.y1);
    }
  });
});
