// Story 4.3: measured fish brightness of Câu cá (run by `atlas` and `validate:content`). For each colour,
// the mean relative luminance of the opaque pixels (alpha ≥ OPAQUE_ALPHA) of `fish-<c>-small/swim/00` in
// the committed `atlas.fishing`; every pair of colours must differ by at least ui.fishLumaGapMin, so a fish
// never relies on hue alone. `fishLumaProblems` is the pure part (unit-tested); the page is read with sharp.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { ATLASES } from '../../src/content/assets.ts';
import { FISH_COLORS, fishFrames } from '../../src/content/games/fishing.ts';
import { Tokens } from '../../src/core/tokens.ts';
import { relativeLuminance } from './hint-contrast.ts';

/** A pixel counts as fish when its alpha is at least this. */
export const OPAQUE_ALPHA = 128;

/** One problem per colour pair whose means differ by less than `min`, naming both colours. */
export function fishLumaProblems(means: Readonly<Record<string, number>>, min: number = Tokens.ui.fishLumaGapMin): string[] {
  const problems: string[] = [];
  const ids = Object.keys(means);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]!;
      const b = ids[j]!;
      const gap = Math.abs(means[a]! - means[b]!);
      if (gap < min) problems.push(`fishing colours "${a}" and "${b}": mean luminances ${means[a]!.toFixed(3)} and ${means[b]!.toFixed(3)} differ by ${gap.toFixed(3)} (min ${min})`);
    }
  }
  return problems;
}

interface FrameJson {
  readonly frame: { x: number; y: number; w: number; h: number };
  readonly rotated?: boolean;
}

/** Reads `atlas.fishing` under `publicDir` and checks the small swim frames. */
export async function fishLuma(publicDir: string): Promise<{ problems: string[]; info: string[] }> {
  const ref = ATLASES.fishing;
  const jsonFile = resolve(publicDir, ref.json);
  const pngFile = resolve(publicDir, ref.png);
  if (!existsSync(jsonFile) || !existsSync(pngFile)) return { problems: [`fishing luma: atlas ${ref.json} or ${ref.png} is missing`], info: [] };
  const frames = (JSON.parse(readFileSync(jsonFile, 'utf8')) as { frames?: Record<string, FrameJson> }).frames ?? {};
  const { data, info } = await sharp(pngFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const problems: string[] = [];
  const means: Record<string, number> = {};
  for (const color of FISH_COLORS) {
    const name = fishFrames({ color, size: 'small' }).swim[0]!;
    const f = frames[name];
    if (!f || f.rotated) {
      problems.push(`fishing luma: frame "${name}" is missing or rotated in ${ref.json}`);
      continue;
    }
    let sum = 0;
    let n = 0;
    for (let y = f.frame.y; y < f.frame.y + f.frame.h; y++) {
      for (let x = f.frame.x; x < f.frame.x + f.frame.w; x++) {
        const i = (y * info.width + x) * info.channels;
        if (data[i + 3]! < OPAQUE_ALPHA) continue;
        sum += relativeLuminance([data[i]!, data[i + 1]!, data[i + 2]!]);
        n++;
      }
    }
    if (n > 0) means[color] = sum / n;
  }
  return {
    problems: [...problems, ...fishLumaProblems(means)],
    info: Object.entries(means).map(([c, m]) => `fishing colour ${c}: mean luminance ${m.toFixed(3)}`),
  };
}
