// Colour maths shared by the tools (moved from tools/lint/hint-contrast.ts on 2026-11-12, so tools/layout/rules.ts can
// use it too without importing the contrast check).

export type Rgb = readonly [number, number, number];

/** The 0–255 channels of a 0xRRGGBB colour value. */
export function rgbOf(value: number): Rgb {
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** WCAG relative luminance of an sRGB colour (0–255 channels). */
export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
