// Tàu hỏa chở bạn (2026-11-12): synthesises the train game's own sounds with ffmpeg (our own recipes, no recordings).
// `npm run audio:placeholders` writes them with every other synthesised file (make-placeholders › buildArgs asks
// `trainArgs` too); `node tools/audio/make-train.ts` writes only these.
// Output: mono AAC 44.1 kHz 64 kb/s `.m4a` at public/<AUDIO_CATALOG[id].path>.
//
// Each ≤ 0.8 s, a 50 ms cubic fade-in, two 150 Hz highpasses, quiet. None is a creature (the train is a toy):
//   - toot: the toy whistle's "tu tu" — two soft humps of a gentle three-note chord (587, 740, 880 Hz), 0.75 s;
//   - chug: the train pulling away — three soft band-passed noise "chuffs" that come a little faster, 0.8 s;
//   - puff: a soft breath of smoke from the chimney — a low band of noise that swells and fades, 0.4 s;
//   - hiss: the brakes as it stops — a quiet high band of noise that dies away, 0.6 s.
// The pops (sfx.garden.pop), the chime (sfx.car-wash.chime), the crossing's horn (sfx.touch-talk.car), the fish's
// splash (sfx.pet-clinic.splash), the bird (sfx.shell.chirp) and the friends' calls (sfx.animal-pens.<animal>.call)
// are reused.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_CATALOG, type AudioId } from '../../src/content/audio-catalog.ts';
import { SFX } from '../../src/content/games/train.ts';
import { FFMPEG, resolveBinary } from '../shared/binaries.ts';
import { FADE_IN_S, HIGHPASS, SFX_MAX_S, soundFilter, type BedtimeSound } from './make-bedtime.ts';

export { FADE_IN_S, HIGHPASS, SFX_MAX_S };

const ENCODE = ['-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k'];
const RATE = 44100;

/** A soft hump from `a` to `b` seconds (0 outside). */
const hump = (a: number, b: number): string => `between(t,${a},${b})*sin(PI*(t-${a})/${b - a})`;
/** The whistle's chord with a little breath. */
const CHORD = `(sin(2*PI*587*t)+0.7*sin(2*PI*740*t)+0.5*sin(2*PI*880*t)+0.15*(2*random(0)-1))`;

export const SOUNDS: Readonly<Record<string, BedtimeSound>> = {
  [SFX.toot]: {
    seconds: 0.75,
    fadeOut: 0.08,
    gainDb: -1.5,
    expr: `0.05*(${hump(0, 0.3)}+${hump(0.36, 0.75)})*${CHORD}`,
    pre: 'lowpass=f=3000',
  },
  [SFX.chug]: {
    seconds: 0.8,
    fadeOut: 0.2,
    gainDb: 0,
    // Three chuffs at 0.05, 0.33 and 0.58 s (a little closer each time).
    expr: `0.2*(${hump(0.02, 0.22)}+${hump(0.3, 0.48)}+0.8*${hump(0.55, 0.72)})*(2*random(0)-1)`,
    pre: 'bandpass=f=650:width_type=o:w=1.4',
  },
  [SFX.puff]: {
    seconds: 0.4,
    fadeOut: 0.12,
    gainDb: 0,
    expr: `0.2*sin(PI*t/0.4)*(2*random(0)-1)`,
    pre: 'bandpass=f=500:width_type=o:w=1.2',
  },
  [SFX.hiss]: {
    seconds: 0.6,
    fadeOut: 0.2,
    gainDb: 0,
    expr: `0.07*exp(-3*t)*(2*random(0)-1)`,
    pre: 'bandpass=f=2600:width_type=o:w=1.2',
  },
};

/** Every synthesised train catalog id. */
export function trainIds(): string[] {
  return Object.keys(SOUNDS);
}

/** ffmpeg arguments that write the train file `id` to `outFile`, or undefined when `id` is not one. */
export function trainArgs(id: string, outFile: string): string[] | undefined {
  const s = SOUNDS[id];
  if (!s) return undefined;
  return ['-hide_banner', '-y', '-f', 'lavfi', '-i', `aevalsrc='${s.expr}':s=${RATE}:d=${s.seconds}`, '-af', soundFilter(s), ...ENCODE, outFile];
}

function main(): void {
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  let ffmpeg: string;
  try {
    ffmpeg = resolveBinary(FFMPEG, process.env);
  } catch (e) {
    console.error(`make-train: ${(e as Error).message}`);
    process.exit(1);
  }
  for (const id of trainIds()) {
    const entry = AUDIO_CATALOG[id as AudioId];
    if (!entry) {
      console.error(`make-train: "${id}" is not in the audio catalog`);
      process.exit(1);
    }
    const out = resolve(appRoot, 'public', entry.path);
    mkdirSync(dirname(out), { recursive: true });
    const res = spawnSync(ffmpeg, trainArgs(id, out)!, { encoding: 'utf8' });
    if (res.status !== 0 || !existsSync(out)) {
      console.error(`make-train: ffmpeg failed for ${id}\n${res.stderr}`);
      process.exit(1);
    }
    console.log(`make-train: wrote public/${entry.path}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
