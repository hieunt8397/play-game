// Tên lửa lên Mặt Trăng (2026-11-12): synthesises the rocket game's own sounds with ffmpeg (our own recipes, no
// recordings). `npm run audio:placeholders` writes them with every other synthesised file (make-placeholders ›
// buildArgs asks `rocketArgs` too); `node tools/audio/make-rocket.ts` writes only these.
// Output: mono AAC 44.1 kHz 64 kb/s `.m4a` at public/<AUDIO_CATALOG[id].path>.
//
// Each ≤ 0.8 s, a 50 ms cubic fade-in, two 150 Hz highpasses, quiet. The launch is a short chain of these (no deep
// rumble, no explosion); none is a creature (the aliens are toys):
//   - clank: a part clicks onto the rocket — a short bright ring of three inharmonic partials, 0.3 s;
//   - sparkle: three high twinkly notes going up, 0.6 s;
//   - ignite: the soft whoosh of the flame — a band of noise that swells and fades, 0.8 s;
//   - boost: "vút" — a rising chirp in a breath of noise, 0.4 s;
//   - retro: a soft puff from the nozzle as it lands, 0.4 s;
//   - dust: a soft landing in Moon dust — a low band of noise dying away, 0.35 s;
//   - twinkle: two bright notes (a star, the Earth, the surprise), 0.45 s;
//   - chute: the parachute opening — a short flap of noise and a soft hump, 0.3 s;
//   - boing / bloop / trill: the aliens — a wobbly spring, a falling water drop, a quick two-note trill.
// The pops (sfx.garden.pop) and the chime (sfx.car-wash.chime) are reused.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_CATALOG, type AudioId } from '../../src/content/audio-catalog.ts';
import { SFX } from '../../src/content/games/rocket.ts';
import { FFMPEG, resolveBinary } from '../shared/binaries.ts';
import { FADE_IN_S, HIGHPASS, SFX_MAX_S, soundFilter, type BedtimeSound } from './make-bedtime.ts';

export { FADE_IN_S, HIGHPASS, SFX_MAX_S };

const ENCODE = ['-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k'];
const RATE = 44100;

/** A soft hump from `a` to `b` seconds (0 outside). */
const hump = (a: number, b: number): string => `between(t,${a},${b})*sin(PI*(t-${a})/${b - a})`;
/** A note of `hz` in a hump from `a` to `b`. */
const note = (hz: number, a: number, b: number): string => `${hump(a, b)}*sin(2*PI*${hz}*t)`;
const NOISE = '(2*random(0)-1)';

export const SOUNDS: Readonly<Record<string, BedtimeSound>> = {
  [SFX.clank]: {
    seconds: 0.3,
    fadeOut: 0.08,
    gainDb: -2,
    expr: `0.12*exp(-16*t)*(sin(2*PI*1320*t)+0.6*sin(2*PI*2140*t)+0.35*sin(2*PI*3010*t))`,
    pre: 'lowpass=f=5000',
  },
  [SFX.sparkle]: {
    seconds: 0.6,
    fadeOut: 0.15,
    gainDb: 0,
    expr: `0.05*(${note(1568, 0, 0.22)}+${note(2093, 0.14, 0.38)}+${note(2637, 0.28, 0.58)})`,
  },
  [SFX.ignite]: {
    seconds: 0.8,
    fadeOut: 0.25,
    gainDb: -5,
    expr: `0.22*pow(sin(PI*t/0.8),1.5)*${NOISE}`,
    pre: 'bandpass=f=900:width_type=o:w=2',
  },
  [SFX.boost]: {
    seconds: 0.4,
    fadeOut: 0.12,
    gainDb: -3,
    expr: `sin(PI*t/0.4)*(0.04*sin(2*PI*(400*t+1200*t*t))+0.12*${NOISE})`,
    pre: 'bandpass=f=1300:width_type=o:w=2',
  },
  [SFX.retro]: {
    seconds: 0.4,
    fadeOut: 0.12,
    gainDb: 0,
    expr: `0.2*sin(PI*t/0.4)*${NOISE}`,
    pre: 'bandpass=f=700:width_type=o:w=1.2',
  },
  [SFX.dust]: {
    seconds: 0.35,
    fadeOut: 0.12,
    gainDb: 5,
    expr: `0.22*exp(-9*t)*${NOISE}`,
    pre: 'bandpass=f=420:width_type=o:w=1.2',
  },
  [SFX.twinkle]: {
    seconds: 0.45,
    fadeOut: 0.12,
    gainDb: 0,
    expr: `0.05*(${note(2093, 0, 0.24)}+${note(2637, 0.16, 0.44)})`,
  },
  [SFX.chute]: {
    seconds: 0.3,
    fadeOut: 0.1,
    gainDb: 0,
    expr: `0.16*exp(-14*t)*${NOISE}+0.05*${hump(0, 0.3)}*sin(2*PI*330*t)`,
    pre: 'bandpass=f=1400:width_type=o:w=2',
  },
  [SFX.boing]: {
    seconds: 0.6,
    fadeOut: 0.15,
    gainDb: -2,
    expr: `0.09*exp(-4*t)*sin(2*PI*330*t-15*cos(2*PI*8*t))`,
  },
  [SFX.bloop]: {
    seconds: 0.35,
    fadeOut: 0.1,
    gainDb: -2,
    expr: `0.1*exp(-6*t)*sin(2*PI*(760*t-520*t*t))`,
  },
  [SFX.trill]: {
    seconds: 0.6,
    fadeOut: 0.15,
    gainDb: -3,
    expr: `0.06*sin(PI*t/0.6)*(sin(2*PI*880*t)*(1+sin(2*PI*14*t))/2+sin(2*PI*1175*t)*(1-sin(2*PI*14*t))/2)`,
  },
};

/** Every synthesised rocket catalog id. */
export function rocketIds(): string[] {
  return Object.keys(SOUNDS);
}

/** ffmpeg arguments that write the rocket file `id` to `outFile`, or undefined when `id` is not one. */
export function rocketArgs(id: string, outFile: string): string[] | undefined {
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
    console.error(`make-rocket: ${(e as Error).message}`);
    process.exit(1);
  }
  for (const id of rocketIds()) {
    const entry = AUDIO_CATALOG[id as AudioId];
    if (!entry) {
      console.error(`make-rocket: "${id}" is not in the audio catalog`);
      process.exit(1);
    }
    const out = resolve(appRoot, 'public', entry.path);
    mkdirSync(dirname(out), { recursive: true });
    const res = spawnSync(ffmpeg, rocketArgs(id, out)!, { encoding: 'utf8' });
    if (res.status !== 0 || !existsSync(out)) {
      console.error(`make-rocket: ffmpeg failed for ${id}\n${res.stderr}`);
      process.exit(1);
    }
    console.log(`make-rocket: wrote public/${entry.path}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
