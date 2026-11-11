// Phi công nhí (2026-11-11): synthesises the plane game's own sounds with ffmpeg (our own recipes, no recordings).
// `npm run audio:placeholders` writes them with every other synthesised file (make-placeholders › buildArgs asks
// `planeArgs` too); `node tools/audio/make-plane.ts` writes only these.
// Output: mono AAC 44.1 kHz 64 kb/s `.m4a` at public/<AUDIO_CATALOG[id].path>.
//
// Each ≤ 0.8 s, a 50 ms cubic fade-in, two 150 Hz highpasses, quiet. None is a creature (the plane is a toy):
//   - propeller: the toy propeller starting up — a soft purr (220 → 330 Hz with its octave) whose flutter speeds up
//     (18 → 34 Hz), 0.8 s;
//   - whoosh: the plane flies on — band-passed noise that swells and fades, 0.7 s;
//   - boing: a cloud the plane bumps — a soft springy tone (320 Hz, a wobble that dies away), 0.4 s.
// The balloon pop (sfx.garden.pop), the delivery chime (sfx.car-wash.chime), the cloud puff and gift landing
// (sfx.shell.pop), the bird (sfx.shell.chirp) and the friends' calls (sfx.animal-pens.<animal>.call) are reused.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_CATALOG, type AudioId } from '../../src/content/audio-catalog.ts';
import { SFX } from '../../src/content/games/plane.ts';
import { FFMPEG, resolveBinary } from '../shared/binaries.ts';
import { FADE_IN_S, HIGHPASS, SFX_MAX_S, soundFilter, type BedtimeSound } from './make-bedtime.ts';

export { FADE_IN_S, HIGHPASS, SFX_MAX_S };

const ENCODE = ['-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k'];
const RATE = 44100;

export const SOUNDS: Readonly<Record<string, BedtimeSound>> = {
  [SFX.propeller]: {
    seconds: 0.8,
    fadeOut: 0.2,
    gainDb: 0,
    // The pitch rises 220 → 330 Hz and the flutter 18 → 34 Hz (phase = ∫f).
    expr: `0.075*(0.55+0.45*sin(2*PI*(18*t+10*t*t)))*(sin(2*PI*(220*t+69*t*t))+0.4*sin(2*PI*(440*t+138*t*t)))`,
    pre: 'lowpass=f=1800',
  },
  [SFX.whoosh]: {
    seconds: 0.7,
    fadeOut: 0.25,
    gainDb: 0,
    expr: `0.17*sin(PI*t/0.7)*(2*random(0)-1)`,
    pre: 'bandpass=f=900:width_type=o:w=1.6',
  },
  [SFX.boing]: {
    seconds: 0.4,
    fadeOut: 0.12,
    gainDb: 0,
    // A spring: the tone wobbles ± a few semitones at 11 Hz, and the wobble dies with it.
    expr: `0.1*exp(-5*t)*sin(2*PI*320*t+5*exp(-3*t)*sin(2*PI*11*t))`,
  },
};

/** Every synthesised plane catalog id. */
export function planeIds(): string[] {
  return Object.keys(SOUNDS);
}

/** ffmpeg arguments that write the plane file `id` to `outFile`, or undefined when `id` is not one. */
export function planeArgs(id: string, outFile: string): string[] | undefined {
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
    console.error(`make-plane: ${(e as Error).message}`);
    process.exit(1);
  }
  for (const id of planeIds()) {
    const entry = AUDIO_CATALOG[id as AudioId];
    if (!entry) {
      console.error(`make-plane: "${id}" is not in the audio catalog`);
      process.exit(1);
    }
    const out = resolve(appRoot, 'public', entry.path);
    mkdirSync(dirname(out), { recursive: true });
    const res = spawnSync(ffmpeg, planeArgs(id, out)!, { encoding: 'utf8' });
    if (res.status !== 0 || !existsSync(out)) {
      console.error(`make-plane: ffmpeg failed for ${id}\n${res.stderr}`);
      process.exit(1);
    }
    console.log(`make-plane: wrote public/${entry.path}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
