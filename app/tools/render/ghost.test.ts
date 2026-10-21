import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ghostFrame, ghostStyle, ghostSvg, signedArea, simplify, traceOuterContours, type Pt } from './ghost.ts';

function mask(rows: string[]): { alpha: Uint8Array; w: number; h: number } {
  const h = rows.length;
  const w = rows[0]!.length;
  const alpha = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => (alpha[y * w + x] = c === '#' ? 255 : c === '+' ? 128 : c === '-' ? 127 : 0)));
  return { alpha, w, h };
}

describe('traceOuterContours (marching squares)', () => {
  it('one pixel: a diamond around its centre, positive area', () => {
    const { alpha, w, h } = mask(['...', '.#.', '...']);
    const c = traceOuterContours(alpha, w, h);
    expect(c).toHaveLength(1);
    expect(signedArea(c[0]!)).toBe(0.5);
    expect(c[0]!).toEqual(expect.arrayContaining([{ x: 0.5, y: 1 }, { x: 1, y: 0.5 }, { x: 1.5, y: 1 }, { x: 1, y: 1.5 }]));
  });

  it('threshold 128: alpha 128 is solid, 127 is not', () => {
    expect(traceOuterContours(mask(['+']).alpha, 1, 1)).toHaveLength(1);
    expect(traceOuterContours(mask(['-']).alpha, 1, 1)).toHaveLength(0);
  });

  it('a pixel on the frame edge still closes its contour', () => {
    const { alpha, w, h } = mask(['#..', '...']);
    const c = traceOuterContours(alpha, w, h);
    expect(c).toHaveLength(1);
    expect(c[0]!.some((p) => p.x < 0 || p.y < 0)).toBe(true);
  });

  it('every outer component; a hole is dropped', () => {
    const { alpha, w, h } = mask(['.......', '.###...', '.#.#.#.', '.###...', '.......']);
    const c = traceOuterContours(alpha, w, h);
    expect(c).toHaveLength(2);
    expect(c.every((loop) => signedArea(loop) > 0)).toBe(true);
  });

  it('diagonal pixels are separate components (4-connected)', () => {
    const { alpha, w, h } = mask(['....', '.#..', '..#.', '....']);
    expect(traceOuterContours(alpha, w, h)).toHaveLength(2);
  });

  it('deterministic', () => {
    const { alpha, w, h } = mask(['.###.', '#####', '.#.#.']);
    expect(traceOuterContours(alpha, w, h)).toEqual(traceOuterContours(alpha, w, h));
  });
});

describe('simplify', () => {
  it('drops points within ε of the line and keeps corners', () => {
    const square: Pt[] = [];
    for (let i = 0; i < 10; i++) square.push({ x: i, y: 0 });
    for (let i = 0; i < 10; i++) square.push({ x: 10, y: i });
    for (let i = 10; i > 0; i--) square.push({ x: i, y: 10 });
    for (let i = 10; i > 0; i--) square.push({ x: 0, y: i });
    const s = simplify(square, 1);
    expect(s).toHaveLength(4);
    expect(s).toEqual(expect.arrayContaining([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]));
  });

  it('a staircase within 1 px becomes a straight edge', () => {
    const { alpha, w, h } = mask(['##########', '##########', '##########']);
    const s = simplify(traceOuterContours(alpha, w, h)[0]!, 1);
    expect(s.length).toBeLessThanOrEqual(8);
  });
});

describe('ghostSvg / ghostFrame', () => {
  it('ghost-slot fill 35 %, white 4 px line and [12, 8] dashes × renderScale', () => {
    const st = ghostStyle(2);
    expect(st).toEqual({ fill: '#5B4E96', fillOpacity: 0.35, line: '#FFFFFF', lineWidth: 8, dash: [24, 16] });
    const svg = ghostSvg([[{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }]], 10, 8, st);
    expect(svg).toContain('width="10" height="8"');
    expect(svg).toContain('d="M0.5 0.5L4.5 0.5L4.5 4.5Z"');
    expect(svg).toContain('fill-opacity="0.35"');
    expect(svg).toContain('stroke-width="8"');
    expect(svg).toContain('stroke-dasharray="24 16"');
  });

  it('a frame keeps its size, is byte-identical on a re-run, and is see-through outside the outline', async () => {
    const w = 64;
    const h = 48;
    const raw = Buffer.alloc(w * h * 4);
    for (let y = 12; y < 36; y++) for (let x = 16; x < 48; x++) raw.fill(255, (y * w + x) * 4, (y * w + x) * 4 + 4);
    const png = await sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
    const a = await ghostFrame(png, 2);
    const b = await ghostFrame(png, 2);
    expect(a.equals(b)).toBe(true);
    const { data, info } = await sharp(a).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([w, h, 4]);
    expect(data[3]).toBe(0); // corner: transparent
    const centre = ((24 * w + 32) * 4);
    expect(data[centre + 3]).toBeGreaterThan(80); // fill ≈ 0.35 × 255
    expect(data[centre + 3]).toBeLessThan(100);
  });
});
