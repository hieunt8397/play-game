// Trồng cây (2026-10-30): synthesises the garden's own sounds with ffmpeg (our own recipes, no recordings).
// `npm run audio:placeholders` writes them with every other synthesised file (make-placeholders › buildArgs asks
// `gardenArgs` too); `node tools/audio/make-garden.ts` writes only these.
// Output: mono AAC 44.1 kHz 64 kb/s `.m4a` at public/<AUDIO_CATALOG[id].path>.
//
// Each ≤ 0.8 s, a 50 ms cubic fade-in, two 150 Hz highpasses, quiet. Shiba's own sounds (crunch, slurp) are
// `creature: true` and measured by `npm run audio:check`:
//   - pour: water pouring from the can — band-passed noise with a soft trickle flutter, swelling and fading, 0.8 s;
//   - pop: a soft growth "bóc" — a quick 700 → 420 Hz drop, 0.22 s (a step grows, a fruit is picked, packets pop in);
//   - crunch: one bite — three short bright noise crackles, 0.35 s;
//   - slurp: a juicy bite — a 300 → 600 Hz rising wet glide with a 25 Hz flutter over noise, 0.45 s.
// The giggle is the bedtime game's (sfx.bedtime.giggle); the woof is the shell's (sfx.shell.woof).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_CATALOG, type AudioId } from '../../src/content/audio-catalog.ts';
import { SFX } from '../../src/content/games/garden.ts';
import { FFMPEG, resolveBinary } from '../shared/binaries.ts';
import { FADE_IN_S, HIGHPASS, SFX_MAX_S, soundFilter, type BedtimeSound } from './make-bedtime.ts';

export { FADE_IN_S, HIGHPASS, SFX_MAX_S };

const ENCODE = ['-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k'];
const RATE = 44100;

export const SOUNDS: Readonly<Record<string, BedtimeSound>> = {
  [SFX.pour]: {
    seconds: 0.8,
    fadeOut: 0.3,
    gainDb: 0,
    expr: `0.1*(2*random(0)-1)*pow(sin(PI*t/0.8),2)*(0.7+0.3*sin(2*PI*13*t))`,
    pre: 'bandpass=f=1500:width_type=h:w=1800,equalizer=f=900:t=h:w=600:g=3',
  },
  [SFX.pop]: {
    seconds: 0.22,
    fadeOut: 0.1,
    gainDb: 0,
    // The pitch drops 700 → 420 Hz fast (phase = ∫f), a short decay.
    expr: `0.12*exp(-16*t)*(0.9*sin(2*PI*(420*t+280*(1-exp(-t/0.025))*0.025))+0.1*(2*random(0)-1))`,
  },
  [SFX.crunch]: {
    seconds: 0.35,
    fadeOut: 0.06,
    gainDb: 0,
    expr: `0.1*(2*random(0)-1)*(between(t,0.0,0.07)*exp(-45*t)+between(t,0.1,0.18)*exp(-45*(t-0.1))+between(t,0.22,0.3)*exp(-45*(t-0.22)))`,
    pre: 'bandpass=f=3000:width_type=h:w=3500',
  },
  [SFX.slurp]: {
    seconds: 0.45,
    fadeOut: 0.12,
    gainDb: 0,
    // The pitch rises 300 → 600 Hz (phase = ∫f); a 25 Hz wet flutter; a sin swell; a little noise.
    expr: `0.1*sin(PI*t/0.45)*(0.7+0.3*sin(2*PI*25*t))*(0.7*sin(2*PI*(300*t+333*t*t))+0.3*(2*random(0)-1))`,
  },
};

/** Shiba's own sounds: the creature rule applies (measured by `npm run audio:check`). */
export const CREATURE_SOUNDS: readonly string[] = [SFX.crunch, SFX.slurp];

/** ffmpeg arguments that write the garden file `id` to `outFile`, or undefined when `id` is not one. */
export function gardenArgs(id: string, outFile: string): string[] | undefined {
  const s = SOUNDS[id];
  if (!s) return undefined;
  return ['-hide_banner', '-y', '-f', 'lavfi', '-i', `aevalsrc='${s.expr}':s=${RATE}:d=${s.seconds}`, '-af', soundFilter(s), ...ENCODE, outFile];
}

/** Every synthesised garden catalog id. */
export function gardenIds(): string[] {
  return Object.keys(SOUNDS);
}

function main(): void {
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  let ffmpeg: string;
  try {
    ffmpeg = resolveBinary(FFMPEG, process.env);
  } catch (e) {
    console.error(`make-garden: ${(e as Error).message}`);
    process.exit(1);
  }
  for (const id of gardenIds()) {
    const entry = AUDIO_CATALOG[id as AudioId];
    if (!entry) {
      console.error(`make-garden: "${id}" is not in the audio catalog`);
      process.exit(1);
    }
    const out = resolve(appRoot, 'public', entry.path);
    mkdirSync(dirname(out), { recursive: true });
    const res = spawnSync(ffmpeg, gardenArgs(id, out)!, { encoding: 'utf8' });
    if (res.status !== 0 || !existsSync(out)) {
      console.error(`make-garden: ffmpeg failed for ${id}\n${res.stderr}`);
      process.exit(1);
    }
    console.log(`make-garden: wrote public/${entry.path}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
