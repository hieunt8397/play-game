// Story 1.6: the screen <-> design transform (I/O matrix space rows), dead zones and readView.
import { describe, expect, it } from 'vitest';
import { Tokens } from '../tokens';
import {
  designInsets,
  designToLocal,
  isDeadZone,
  localInsets,
  localToDesign,
  locate,
  NO_INSETS,
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
