// Story 1.6: the screen <-> design transform (I/O matrix space rows), dead zones and readView.
import { describe, expect, it } from 'vitest';
import { Tokens } from '../tokens';
import {
  boxInsets,
  designInsets,
  designToLocal,
  envelop,
  isDeadZone,
  localInsets,
  localToDesign,
  locate,
  NO_INSETS,
  playBox,
  readView,
  toClient,
  toLocal,
  visibleDesignRect,
  type View,
} from './space';

const view = (w: number, h: number, rotated = false, insets = NO_INSETS): View => ({ w, h, rotated, insets });
const toDesignAt = (client: { x: number; y: number }, v: View) => localToDesign(toLocal(client, v), v);

describe('space: client -> design', () => {
  it('landscape 4:3 is the identity', () => {
    expect(toDesignAt({ x: 512, y: 384 }, view(1024, 768))).toEqual({ x: 512, y: 384 });
  });

  it('1180x820: client (0,0) is design (0, 28.2)', () => {
    const d = toDesignAt({ x: 0, y: 0 }, view(1180, 820));
    expect(d.x).toBeCloseTo(0, 6);
    expect(Math.abs(d.y - 28.2)).toBeLessThan(1);
  });

  it('1366x1024: the centre maps to the design centre', () => {
    const d = toDesignAt({ x: 683, y: 512 }, view(1366, 1024));
    expect(Math.abs(d.x - 512)).toBeLessThan(1);
    expect(Math.abs(d.y - 384)).toBeLessThan(1);
  });

  it('portrait (rotated): screen 820x1180, client (820,0) is local (0,0) -> design (0, 28.2)', () => {
    const v = view(1180, 820, true);
    expect(toLocal({ x: 820, y: 0 }, v)).toEqual({ x: 0, y: 0 });
    const d = toDesignAt({ x: 820, y: 0 }, v);
    expect(d.x).toBeCloseTo(0, 6);
    expect(Math.abs(d.y - 28.2)).toBeLessThan(1);
    // Rotation: screen down = local right; screen left = local down.
    expect(toLocal({ x: 820, y: 100 }, v)).toEqual({ x: 100, y: 0 });
    expect(toLocal({ x: 720, y: 0 }, v)).toEqual({ x: 0, y: 100 });
  });

  it('portrait and landscape agree on the same stage point', () => {
    const land = view(1180, 820);
    const port = view(1180, 820, true);
    const local = { x: 300, y: 500 };
    expect(localToDesign(toLocal(toClient(local, port), port), port)).toEqual(localToDesign(local, land));
  });

  it('round-trips local <-> design and client <-> local', () => {
    for (const v of [view(1024, 768), view(1180, 820), view(1366, 1024), view(1180, 820, true)]) {
      const p = { x: 123.5, y: 456.25 };
      const back = designToLocal(localToDesign(p, v), v);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
      expect(toLocal(toClient(p, v), v)).toEqual(p);
    }
  });

  it.each([
    [1024, 768],
    [1180, 820],
    [1210, 834],
    [1366, 1024],
  ])('every Tokens.safeRect corner is on screen at %ix%i (landscape and portrait)', (w, h) => {
    const r = Tokens.safeRect;
    for (const rotated of [false, true]) {
      const v = view(w, h, rotated);
      for (const c of [
        { x: r.x, y: r.y },
        { x: r.x + r.w, y: r.y },
        { x: r.x, y: r.y + r.h },
        { x: r.x + r.w, y: r.y + r.h },
      ]) {
        const local = designToLocal(c, v);
        expect(local.x).toBeGreaterThanOrEqual(-1e-9);
        expect(local.y).toBeGreaterThanOrEqual(-1e-9);
        expect(local.x).toBeLessThanOrEqual(w + 1e-9);
        expect(local.y).toBeLessThanOrEqual(h + 1e-9);
      }
    }
  });

  it('visibleDesignRect covers the whole stage', () => {
    const r = visibleDesignRect(view(1180, 820));
    expect(r.x).toBeCloseTo(0, 9);
    expect(r.w).toBeCloseTo(1024, 9);
    expect(Math.abs(r.y - 28.2)).toBeLessThan(0.1);
    expect(r.y + r.h).toBeCloseTo(768 - r.y, 9);
  });
});

describe('space: insets and dead zones', () => {
  it('rotated: screen top inset is the local left inset (and so on)', () => {
    const v = view(1180, 820, true, { top: 24, right: 1, bottom: 2, left: 3 });
    expect(localInsets(v)).toEqual({ top: 1, right: 2, bottom: 3, left: 24 });
    expect(localInsets({ ...v, rotated: false })).toEqual(v.insets);
  });

  it('design insets are local insets / s', () => {
    const v = view(2048, 1536, false, { top: 20, right: 0, bottom: 0, left: 10 });
    expect(designInsets(v)).toEqual({ top: 10, right: 0, bottom: 0, left: 5 });
  });

  it('edge strips: 24 side, 32 top, 40 bottom (local CSS px)', () => {
    const v = view(1024, 768);
    expect(isDeadZone({ x: 10, y: 400 }, v)).toBe(true);
    expect(isDeadZone({ x: 23.9, y: 400 }, v)).toBe(true);
    expect(isDeadZone({ x: 24, y: 400 }, v)).toBe(false);
    expect(isDeadZone({ x: 1010, y: 400 }, v)).toBe(true);
    expect(isDeadZone({ x: 500, y: 31 }, v)).toBe(true);
    expect(isDeadZone({ x: 500, y: 32 }, v)).toBe(false);
    expect(isDeadZone({ x: 500, y: 730 }, v)).toBe(true);
    expect(isDeadZone({ x: 500, y: 727 }, v)).toBe(false);
  });

  it('insets widen the strips', () => {
    const v = view(1024, 768, false, { top: 0, right: 0, bottom: 0, left: 20 });
    expect(isDeadZone({ x: 40, y: 400 }, v)).toBe(true);
    expect(isDeadZone({ x: 44, y: 400 }, v)).toBe(false);
  });

  it('locate: client point -> local, design and dead flag', () => {
    const v = view(1024, 768);
    expect(locate({ x: 10, y: 400 }, undefined, v)).toEqual({ local: { x: 10, y: 400 }, design: { x: 10, y: 400 }, dead: true });
    expect(locate({ x: 500, y: 400 }, undefined, v).dead).toBe(false);
  });
});

describe('readView', () => {
  const doc = (w: number, h: number) => ({
    documentElement: {},
    getElementById: (id: string) => (id === 'stage' ? { clientWidth: w, clientHeight: h } : null),
  });
  const win = (portrait: boolean, vars: Record<string, string> = {}) => ({
    innerWidth: portrait ? 820 : 1180,
    innerHeight: portrait ? 1180 : 820,
    matchMedia: (q: string) => ({ matches: q === '(orientation: portrait)' && portrait }),
    getComputedStyle: () => ({ getPropertyValue: (name: string) => vars[name] ?? '' }),
  });

  it('reads the stage layout size, the portrait query and the --sai-* insets', () => {
    expect(readView(doc(1180, 820), win(true, { '--sai-top': ' 24px', '--sai-left': '0px' }))).toEqual({
      w: 1180,
      h: 820,
      rotated: true,
      insets: { top: 24, right: 0, bottom: 0, left: 0 },
    });
  });

  it('falls back to the window size without a stage and to no insets', () => {
    const d = { documentElement: {}, getElementById: () => null };
    expect(readView(d, { innerWidth: 1024, innerHeight: 768 })).toEqual({ w: 1024, h: 768, rotated: false, insets: NO_INSETS });
    expect(readView(d, win(true)).w).toBe(1180);
  });
});

describe('space: play box (phones and squarish windows)', () => {
  const PHONE = view(844, 390);
  const BOX_W = 390 * Tokens.supportedAspect.max; // 569.4
  const BAR = (844 - BOX_W) / 2; // 137.3
  const S = BOX_W / 1024; // ENVELOP inside the 1.46 box: the width wins
  const OY = (390 - 768 * S) / 2;

  it('every iPad: the box is the whole stage, the mapping is the pre-play-box one', () => {
    for (const [w, h] of [
      [1024, 768],
      [1180, 820],
      [1210, 834],
      [1366, 1024],
    ] as const) {
      expect(playBox(view(w, h))).toEqual({ x: 0, y: 0, w, h });
      const s = Math.max(w / 1024, h / 768);
      expect(envelop(view(w, h))).toEqual({ s, ox: (w - 1024 * s) / 2, oy: (h - 768 * s) / 2 });
    }
  });

  it('phone landscape 844x390: centred 1.46 box with side bars', () => {
    expect(playBox(PHONE)).toEqual({ x: BAR, y: 0, w: BOX_W, h: 390 });
    expect(BOX_W).toBeCloseTo(569.4, 9);
    expect(BAR).toBeCloseTo(137.3, 9);
    const e = envelop(PHONE);
    expect(e.s).toBe(S);
    expect(e.ox).toBeCloseTo(BAR, 9);
    expect(e.oy).toBeCloseTo(OY, 9);
  });

  it('phone landscape: the visible design rect is the iPad 1.46 one (safeRect fully visible)', () => {
    const r = visibleDesignRect(PHONE);
    expect(r.x).toBeCloseTo(0, 9);
    expect(r.w).toBeCloseTo(1024, 9);
    expect(r.y).toBeCloseTo(-OY / S, 9);
    expect(r.h).toBeCloseTo(390 / S, 9);
    const sr = Tokens.safeRect;
    expect(sr.x).toBeGreaterThanOrEqual(r.x - 1e-9);
    expect(sr.y).toBeGreaterThanOrEqual(r.y - 1e-9);
    expect(sr.x + sr.w).toBeLessThanOrEqual(r.x + r.w + 1e-9);
    expect(sr.y + sr.h).toBeLessThanOrEqual(r.y + r.h + 1e-9);
  });

  it('phone landscape: the box centre maps to the design centre; round trip holds', () => {
    const d = localToDesign({ x: 422, y: 195 }, PHONE);
    expect(d.x).toBeCloseTo(512, 9);
    expect(d.y).toBeCloseTo(384, 9);
    const p = { x: 300.5, y: 100.25 };
    const back = designToLocal(localToDesign(p, PHONE), PHONE);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it('phone portrait (screen 390x844, stage rotated, layout 844x390): same box; taps map through the rotation', () => {
    const port = view(844, 390, true);
    expect(playBox(port)).toEqual(playBox(PHONE));
    // Client (195, 422) is the stage centre.
    expect(toLocal({ x: 195, y: 422 }, port)).toEqual({ x: 422, y: 195 });
    const d = localToDesign(toLocal({ x: 195, y: 422 }, port), port);
    expect(d.x).toBeCloseTo(512, 9);
    expect(d.y).toBeCloseTo(384, 9);
    expect(locate({ x: 195, y: 422 }, undefined, port).dead).toBe(false);
    // Screen top (client y small) = local left = a bar.
    expect(locate({ x: 195, y: 50 }, undefined, port).dead).toBe(true);
  });

  it('squarish 1000x900 (landscape): 4:3 box with top/bottom bars', () => {
    const v = view(1000, 900);
    expect(playBox(v)).toEqual({ x: 0, y: 75, w: 1000, h: 750 });
    expect(envelop(v)).toEqual({ s: 1000 / 1024, ox: 0, oy: 75 });
    expect(visibleDesignRect(v)).toEqual({ x: 0, y: 0, w: 1024, h: 768 });
    expect(isDeadZone({ x: 500, y: 50 }, v)).toBe(true);
    expect(isDeadZone({ x: 500, y: 75 + 31 }, v)).toBe(true);
    expect(isDeadZone({ x: 500, y: 75 + 32 }, v)).toBe(false);
    expect(isDeadZone({ x: 500, y: 825 - 40 }, v)).toBe(false);
    expect(isDeadZone({ x: 500, y: 850 }, v)).toBe(true);
    // A 20 px top inset lies inside the 75 px bar: no residue.
    expect(boxInsets(view(1000, 900, false, { top: 20, right: 0, bottom: 0, left: 0 }))).toEqual(NO_INSETS);
  });

  it('a tap in a bar is dead; the box edge strips are dead; inside the box is live', () => {
    expect(isDeadZone({ x: 50, y: 200 }, PHONE)).toBe(true);
    expect(isDeadZone({ x: 800, y: 200 }, PHONE)).toBe(true);
    expect(isDeadZone({ x: BAR + 10, y: 200 }, PHONE)).toBe(true);
    expect(isDeadZone({ x: BAR + 24, y: 200 }, PHONE)).toBe(false);
    expect(isDeadZone({ x: 844 - BAR - 24, y: 200 }, PHONE)).toBe(false);
    expect(isDeadZone({ x: 844 - BAR - 10, y: 200 }, PHONE)).toBe(true);
    expect(locate({ x: 50, y: 200 }, undefined, PHONE).dead).toBe(true);
  });

  it('notch 47 px left on 844x390: inset < bar, so the residual inset is 0 (Hud not shifted)', () => {
    const v = view(844, 390, false, { top: 0, right: 0, bottom: 21, left: 47 });
    expect(boxInsets(v)).toEqual({ top: 0, right: 0, bottom: 21, left: 0 });
    expect(designInsets(v)).toEqual({ top: 0, right: 0, bottom: 21 / S, left: 0 });
    expect(isDeadZone({ x: BAR + 24, y: 200 }, v)).toBe(false);
  });

  it('an inset wider than the bar leaves the residue', () => {
    const v = view(844, 390, false, { top: 0, right: 0, bottom: 0, left: 150 });
    expect(boxInsets(v).left).toBe(150 - BAR);
  });

  it('iPad: box insets equal local insets', () => {
    const v = view(1180, 820, true, { top: 24, right: 1, bottom: 2, left: 3 });
    expect(boxInsets(v)).toEqual(localInsets(v));
  });

  it('a measured box wins over the computed one (no container queries: the whole stage)', () => {
    const v: View = { ...PHONE, box: { x: 0, y: 0, w: 844, h: 390 } };
    expect(playBox(v)).toEqual({ x: 0, y: 0, w: 844, h: 390 });
    const s = 844 / 1024;
    const oy = (390 - 768 * s) / 2;
    expect(envelop(v)).toEqual({ s, ox: 0, oy });
    // What would be a bar for the computed box is live game here.
    const at = locate({ x: 50, y: 200 }, undefined, v);
    expect(at.dead).toBe(false);
    expect(at.design).toEqual({ x: 50 / s, y: (200 - oy) / s });
  });

  it('a measured, rounded box (569x390 at x 137) drives the mapping', () => {
    const v: View = { ...PHONE, box: { x: 137, y: 0, w: 569, h: 390 } };
    const s = 569 / 1024;
    const oy = (390 - 768 * s) / 2;
    expect(envelop(v)).toEqual({ s, ox: 137, oy });
    expect(localToDesign({ x: 137 + 569 / 2, y: 195 }, v)).toEqual({ x: 512, y: (195 - oy) / s });
    expect(visibleDesignRect(v)).toEqual({ x: 0, y: -oy / s, w: 1024, h: 390 / s });
    expect(isDeadZone({ x: 137 + 23.9, y: 200 }, v)).toBe(true);
    expect(isDeadZone({ x: 137 + 24, y: 200 }, v)).toBe(false);
    expect(isDeadZone({ x: 137 + 569 - 24, y: 200 }, v)).toBe(false);
    expect(isDeadZone({ x: 137 + 569 - 23.9, y: 200 }, v)).toBe(true);
  });

  it('an empty measured box is ignored (computed box)', () => {
    expect(playBox({ ...PHONE, box: { x: 0, y: 0, w: 0, h: 390 } })).toEqual(playBox(PHONE));
  });

  it('degenerate stage w = 0: whole-stage box, s > 0, no NaN', () => {
    const v = view(0, 768);
    expect(playBox(v)).toEqual({ x: 0, y: 0, w: 0, h: 768 });
    expect(envelop(v)).toEqual({ s: 1, ox: -512, oy: 0 });
    expect(localToDesign({ x: 0, y: 384 }, v)).toEqual({ x: 512, y: 384 });
  });
});

describe('readView: play box', () => {
  type Box = { x: number; y: number; w: number; h: number };
  const doc = (stage: { w: number; h: number }, box?: Box) => ({
    documentElement: {},
    getElementById: (id: string) => {
      if (id === 'stage') return { clientWidth: stage.w, clientHeight: stage.h };
      if (id === 'game-container' && box) return { offsetLeft: box.x, offsetTop: box.y, clientWidth: box.w, clientHeight: box.h };
      return null;
    },
  });
  const win = (portrait: boolean) => ({
    innerWidth: portrait ? 390 : 844,
    innerHeight: portrait ? 844 : 390,
    matchMedia: (q: string) => ({ matches: q === '(orientation: portrait)' && portrait }),
  });

  it('measures #game-container in stage-local layout px (landscape and rotated)', () => {
    const box = { x: 137, y: 0, w: 569, h: 390 };
    expect(readView(doc({ w: 844, h: 390 }, box), win(false))).toEqual({ w: 844, h: 390, rotated: false, insets: NO_INSETS, box });
    expect(readView(doc({ w: 844, h: 390 }, box), win(true))).toEqual({ w: 844, h: 390, rotated: true, insets: NO_INSETS, box });
  });

  it('an empty container leaves the box out (computed instead)', () => {
    expect(readView(doc({ w: 844, h: 390 }, { x: 0, y: 0, w: 0, h: 0 }), win(false)).box).toBeUndefined();
    expect(readView(doc({ w: 844, h: 390 }), win(false)).box).toBeUndefined();
  });
});
