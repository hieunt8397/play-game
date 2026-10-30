// Rửa xe (2026-10-30): synthesises the car wash's own sounds with ffmpeg (our own recipes, no recordings).
// `npm run audio:placeholders` writes them with every other synthesised file (make-placeholders › buildArgs asks
// `carWashArgs` too); `node tools/audio/make-car-wash.ts` writes only these.
// Output: mono AAC 44.1 kHz 64 kb/s `.m4a` at public/<AUDIO_CATALOG[id].path>.
//
// Each ≤ 0.8 s, a 50 ms cubic fade-in, two 150 Hz highpasses, quiet. None is a creature (the cars are toys):
//   - squish: a mud spot under the foam — a soft wet 260 → 180 Hz blob over low-passed noise, 0.35 s;
//   - chime: the clean car's sparkle — two soft bell notes (E6 then G6, a few quiet overtones), 0.8 s;
//   - fire-siren: the fire truck's own siren — a slow wail (750 Hz ± 120, 2.5 Hz), 0.8 s;
//   - ambulance-siren: the ambulance's own siren — a quicker yelp (900 Hz ± 160, 5 Hz), 0.8 s;
//   - honk-low: the garbage truck's low two-tone honk (220 + 277 Hz with their octaves), 0.5 s.
// The scrub (sfx.touch-talk.toothbrush), the soap pop (sfx.touch-talk.soap), the rinse (sfx.pet-clinic.splash), the
// police siren (sfx.touch-talk.police-car), the taxi horn (sfx.touch-talk.car) and the tractor beep (sfx.race.horn)
// are reused.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_CATALOG, type AudioId } from '../../src/content/audio-catalog.ts';
import { SFX } from '../../src/content/games/car-wash.ts';
import { FFMPEG, resolveBinary } from '../shared/binaries.ts';
import { FADE_IN_S, HIGHPASS, SFX_MAX_S, soundFilter, type BedtimeSound } from './make-bedtime.ts';

export { FADE_IN_S, HIGHPASS, SFX_MAX_S };

const ENCODE = ['-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k'];
const RATE = 44100;

/** A siren: a sine at `hz` ± `dev` swung by an LFO at `lfo` Hz (phase = ∫f), with a soft 2nd harmonic. */
const siren = (amp: number, hz: number, dev: number, lfo: number): string => {
  const phase = `(${hz}*t-${(dev / (2 * Math.PI * lfo)).toFixed(4)}*cos(2*PI*${lfo}*t))`;
  return `${amp}*(0.75*sin(2*PI*${phase})+0.25*sin(4*PI*${phase}))`;
};

export const SOUNDS: Readonly<Record<string, BedtimeSound>> = {
  [SFX.squish]: {
    seconds: 0.35,
    fadeOut: 0.12,
    gainDb: 0,
    // The pitch falls 260 → 180 Hz (phase = ∫f); low-passed noise for the wet part.
    expr: `0.14*exp(-7*t)*(0.65*sin(2*PI*(260*t-115*t*t))+0.35*(2*random(0)-1))`,
    pre: 'lowpass=f=1600',
  },
  [SFX.chime]: {
    seconds: 0.8,
    fadeOut: 0.3,
    gainDb: 0,
    expr: `0.06*exp(-5*t)*(sin(2*PI*1318.5*t)+0.35*sin(2*PI*2637*t))+between(t,0.16,0.8)*0.055*exp(-5*(t-0.16))*(sin(2*PI*1568*(t-0.16))+0.3*sin(2*PI*3136*(t-0.16)))`,
  },
  [SFX.fireSiren]: {
    seconds: 0.8,
    fadeOut: 0.2,
    gainDb: 0,
    expr: siren(0.07, 750, 120, 2.5),
  },
  [SFX.ambulanceSiren]: {
    seconds: 0.8,
    fadeOut: 0.2,
    gainDb: 0,
    expr: siren(0.065, 900, 160, 5),
  },
  [SFX.honkLow]: {
    seconds: 0.5,
    fadeOut: 0.1,
    gainDb: 0,
    expr: `0.05*(sin(2*PI*220*t)+0.8*sin(2*PI*277*t)+0.35*sin(2*PI*440*t)+0.25*sin(2*PI*554*t))`,
    pre: 'lowpass=f=2500',
  },
};

/** Every synthesised car-wash catalog id. */
export function carWashIds(): string[] {
  return Object.keys(SOUNDS);
}

/** ffmpeg arguments that write the car-wash file `id` to `outFile`, or undefined when `id` is not one. */
export function carWashArgs(id: string, outFile: string): string[] | undefined {
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
    console.error(`make-car-wash: ${(e as Error).message}`);
    process.exit(1);
  }
  for (const id of carWashIds()) {
    const entry = AUDIO_CATALOG[id as AudioId];
    if (!entry) {
      console.error(`make-car-wash: "${id}" is not in the audio catalog`);
      process.exit(1);
    }
    const out = resolve(appRoot, 'public', entry.path);
    mkdirSync(dirname(out), { recursive: true });
    const res = spawnSync(ffmpeg, carWashArgs(id, out)!, { encoding: 'utf8' });
    if (res.status !== 0 || !existsSync(out)) {
      console.error(`make-car-wash: ffmpeg failed for ${id}\n${res.stderr}`);
      process.exit(1);
    }
    console.log(`make-car-wash: wrote public/${entry.path}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
