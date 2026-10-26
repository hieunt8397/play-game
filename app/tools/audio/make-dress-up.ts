// Thay đồ cho Shiba (Story 8.2): synthesises the wardrobe's own sound with ffmpeg (our own recipe, no recording).
// `npm run audio:placeholders` writes it with every other synthesised file (make-placeholders › buildArgs asks
// `dressUpArgs` too); `node tools/audio/make-dress-up.ts` writes only this one.
// Output: mono AAC 44.1 kHz 64 kb/s `.m4a` at public/<AUDIO_CATALOG[id].path>.
//   - pop: an item coming off Shiba — a soft cork-like "pốp": a quick 900 → 520 Hz drop with a breath of noise,
//     0.25 s, a 50 ms cubic fade-in, two 150 Hz highpasses, quiet.
// The wear rustle, the giggle and the hop chime are reused (sfx.bedtime.blanket, sfx.bedtime.giggle, sfx.shell.happy).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_CATALOG, type AudioId } from '../../src/content/audio-catalog.ts';
import { SFX } from '../../src/content/games/dress-up.ts';
import { FFMPEG, resolveBinary } from '../shared/binaries.ts';
import { FADE_IN_S, HIGHPASS, SFX_MAX_S, soundFilter, type BedtimeSound } from './make-bedtime.ts';

export { FADE_IN_S, HIGHPASS, SFX_MAX_S };

const ENCODE = ['-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k'];
const RATE = 44100;

export const SOUNDS: Readonly<Record<string, BedtimeSound>> = {
  [SFX.pop]: {
    seconds: 0.25,
    fadeOut: 0.12,
    gainDb: 0,
    // The pitch drops 900 → 520 Hz fast (phase = ∫f), a short decay, a little noise for the "breath".
    expr: `0.12*exp(-14*t)*(0.85*sin(2*PI*(520*t+380*(1-exp(-t/0.03))*0.03))+0.15*(2*random(0)-1))`,
  },
};

/** ffmpeg arguments that write the wardrobe file `id` to `outFile`, or undefined when `id` is not one. */
export function dressUpArgs(id: string, outFile: string): string[] | undefined {
  const s = SOUNDS[id];
  if (!s) return undefined;
  return ['-hide_banner', '-y', '-f', 'lavfi', '-i', `aevalsrc='${s.expr}':s=${RATE}:d=${s.seconds}`, '-af', soundFilter(s), ...ENCODE, outFile];
}

/** Every synthesised wardrobe catalog id. */
export function dressUpIds(): string[] {
  return Object.keys(SOUNDS);
}

function main(): void {
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  let ffmpeg: string;
  try {
    ffmpeg = resolveBinary(FFMPEG, process.env);
  } catch (e) {
    console.error(`make-dress-up: ${(e as Error).message}`);
    process.exit(1);
  }
  for (const id of dressUpIds()) {
    const entry = AUDIO_CATALOG[id as AudioId];
    if (!entry) {
      console.error(`make-dress-up: "${id}" is not in the audio catalog`);
      process.exit(1);
    }
    const out = resolve(appRoot, 'public', entry.path);
    mkdirSync(dirname(out), { recursive: true });
    const res = spawnSync(ffmpeg, dressUpArgs(id, out)!, { encoding: 'utf8' });
    if (res.status !== 0 || !existsSync(out)) {
      console.error(`make-dress-up: ffmpeg failed for ${id}\n${res.stderr}`);
      process.exit(1);
    }
    console.log(`make-dress-up: wrote public/${entry.path}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
