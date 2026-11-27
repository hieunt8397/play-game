// Tàu hỏa quanh đảo: the camera (2026-11-13, spec-tau-quanh-dao): it follows the train with a lead, never shows past
// the plate, never moves faster than the train, and under reduced motion moves in short eased steps.
import { describe, expect, it } from 'vitest';
import { createLoop } from '../../core/map-rides';
import { CameraStepper, cameraCentre, clampCentre, easeInOut, toScreen, viewOrigin } from './camera';

const FRAME = { viewW: 512, viewH: 384, boundsW: 1024, boundsH: 768 };
// A long straight "loop" along y = 400 (there and back), for leads and clamps.
const line = createLoop([
  { x: 0, y: 400 },
  { x: 1024, y: 400 },
  { x: 1024, y: 401 },
  { x: 0, y: 401 },
]);
const FOLLOW = { ...FRAME, middle: 87, lead: 110 };

describe('camera', () => {
  it('clamps the centre half a view inside the plate', () => {
    expect(clampCentre({ x: 0, y: 0 }, FRAME)).toEqual({ x: 256, y: 192 });
    expect(clampCentre({ x: 2000, y: 2000 }, FRAME)).toEqual({ x: 768, y: 576 });
    expect(clampCentre({ x: 500, y: 300 }, FRAME)).toEqual({ x: 500, y: 300 });
    expect(clampCentre({ x: 9, y: 9 }, { viewW: 512, viewH: 384, boundsW: 400, boundsH: 300 })).toEqual({ x: 200, y: 150 });
  });

  it('looks `lead` past the train`s middle, along the rail (ahead of the engine by lead − middle)', () => {
    const c = cameraCentre(line, 500, FOLLOW);
    expect(c).toEqual({ x: 500 - 87 + 110, y: 400 });
    const o = viewOrigin(c, FRAME);
    expect(o).toEqual({ x: c.x - 256, y: 400 - 192 });
    // the engine on screen (zoom 2): left of the middle, so the friend ahead is framed
    expect(toScreen({ x: 500, y: 400 }, c, FRAME, 2)).toEqual({ x: 512 - 2 * 23, y: 384 });
  });

  it('never moves faster than the train (the centre moves by at most the arc the engine moved), and never jumps', () => {
    let prev = cameraCentre(line, 0, FOLLOW);
    for (let s = 1; s < line.length; s += 1) {
      const c = cameraCentre(line, s, FOLLOW);
      expect(Math.hypot(c.x - prev.x, c.y - prev.y)).toBeLessThanOrEqual(1 + 1e-9);
      prev = c;
    }
  });

  it('reduced motion: it holds until the target is past the threshold, then steps with an ease whose peak is the train`s speed', () => {
    const cam = new CameraStepper({ x: 300, y: 300 });
    const cfg = { threshold: 100, minMs: 600, maxSpeed: 0.1 };
    cam.tick({ x: 380, y: 300 }, 16, cfg);
    expect(cam.moving).toBe(false);
    expect(cam.centre).toEqual({ x: 300, y: 300 });
    cam.tick({ x: 500, y: 300 }, 16, cfg);
    expect(cam.moving).toBe(true);
    let prev = cam.centre.x;
    let peak = 0;
    for (let t = 0; t < 10000 && cam.moving; t += 16) {
      const x = cam.tick({ x: 500, y: 300 }, 16, cfg).x;
      peak = Math.max(peak, (x - prev) / 16);
      prev = x;
    }
    expect(cam.centre.x).toBeCloseTo(500, 6);
    expect(peak).toBeLessThanOrEqual(cfg.maxSpeed + 1e-6);
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    // Following a train at cruise (the scene's pace: a step's peak is π/2 × the cruise, so a step averages it), the gap
    // stays bounded: it never grows step after step.
    const v = 0.15;
    const run = new CameraStepper({ x: 0, y: 0 });
    let worst = 0;
    for (let t = 0; t < 60000; t += 16) {
      const target = { x: v * t, y: 0 };
      const c = run.tick(target, 16, { threshold: 100, minMs: 600, maxSpeed: (v * Math.PI) / 2 });
      worst = Math.max(worst, target.x - c.x);
    }
    expect(worst).toBeLessThan(2 * 100 + v * 600);
    cam.reset({ x: 10, y: 20 });
    expect(cam.centre).toEqual({ x: 10, y: 20 });
  });
});
