// Bác sĩ thú cưng (Story 8.1): synthesises the clinic's own sounds with ffmpeg (our own recipes, no recordings).
// `npm run audio:placeholders` writes them with every other synthesised file (make-placeholders › buildArgs asks
// `petClinicArgs` too); `node tools/audio/make-pet-clinic.ts` writes only these.
// Output: mono AAC 44.1 kHz 64 kb/s `.m4a` at public/<AUDIO_CATALOG[id].path>.
//
// Each ≤ 0.8 s, a ≥ 50 ms fade-in, two 150 Hz highpasses, quiet (peak ≈ −20…−24 dBFS, measured). The patient's own
// sounds (burp, gurgle) are `creature: true` and measured by `npm run audio:check`:
//   - splash: the shower's soft splash — band-passed noise swelling and fading, with a light 3 kHz sparkle;
//   - burp: a small voiced "ợ" — a 330 → 230 Hz glide with a rough 30 Hz flutter, 0.4 s;
//   - gurgle: the hungry tummy — three soft bubbling blips (band 250–700 Hz) with a 18 Hz flutter, 0.7 s;
//   - pat: two soft pats on the plaster — short low-mid thumps (380 Hz) on a little noise.
// The giggle, yawn, snore and rustle are the bedtime game's (tools/audio/make-bedtime.ts).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_CATALOG, type AudioId } from '../../src/content/audio-catalog.ts';
import { SFX } from '../../src/content/games/pet-clinic.ts';
import { FFMPEG, resolveBinary } from '../shared/binaries.ts';
import { FADE_IN_S, HIGHPASS, SFX_MAX_S, soundFilter, type BedtimeSound } from './make-bedtime.ts';

export { FADE_IN_S, HIGHPASS, SFX_MAX_S };

const ENCODE = ['-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k'];
const RATE = 44100;

export const SOUNDS: Readonly<Record<string, BedtimeSound>> = {
  [SFX.splash]: {
    seconds: 0.7,
    fadeOut: 0.3,
    gainDb: -1,
    expr: `0.1*(2*random(0)-1)*pow(sin(PI*t/0.7),2)*(0.8+0.2*sin(2*PI*9*t))`,
    pre: 'bandpass=f=2200:width_type=h:w=3000,equalizer=f=3200:t=h:w=1200:g=4',
  },
  [SFX.burp]: {
    seconds: 0.4,
    fadeOut: 0.12,
    gainDb: 0,
    // The pitch glides 330 → 230 Hz (phase = ∫f); a 30 Hz roughness; a sin swell.
    expr: `0.1*sin(PI*t/0.4)*(0.75+0.25*sin(2*PI*30*t))*(0.6*sin(2*PI*(230*t+40*(1-exp(-t/0.4))))+0.3*sin(4*PI*(230*t+40*(1-exp(-t/0.4))))+0.1*sin(6*PI*(230*t+40*(1-exp(-t/0.4)))))`,
  },
  [SFX.gurgle]: {
    seconds: 0.7,
    fadeOut: 0.15,
    gainDb: 14,
    expr: `0.1*(2*random(0)-1)*(0.6+0.4*sin(2*PI*18*t))*(between(t,0.02,0.2)*sin(PI*(t-0.02)/0.18)+between(t,0.24,0.42)*sin(PI*(t-0.24)/0.18)+between(t,0.46,0.66)*sin(PI*(t-0.46)/0.2))`,
    pre: 'bandpass=f=450:width_type=h:w=450,bandpass=f=450:width_type=h:w=450',
  },
  [SFX.pat]: {
    seconds: 0.35,
    fadeOut: 0.06,
    gainDb: 0,
    expr: `0.1*(between(t,0.0,0.12)*exp(-30*t)+between(t,0.16,0.3)*exp(-30*(t-0.16)))*(0.7*sin(2*PI*380*t)+0.3*(2*random(0)-1))`,
  },
};

/** The patient's own sounds: the creature rule applies (measured by `npm run audio:check`). */
export const CREATURE_SOUNDS: readonly string[] = [SFX.burp, SFX.gurgle];

/** ffmpeg arguments that write the clinic file `id` to `outFile`, or undefined when `id` is not one. */
export function petClinicArgs(id: string, outFile: string): string[] | undefined {
  const s = SOUNDS[id];
  if (!s) return undefined;
  return ['-hide_banner', '-y', '-f', 'lavfi', '-i', `aevalsrc='${s.expr}':s=${RATE}:d=${s.seconds}`, '-af', soundFilter(s), ...ENCODE, outFile];
}

/** Every synthesised clinic catalog id (the giggle, yawn, snore and rustle are the bedtime game's). */
export function petClinicIds(): string[] {
  return Object.keys(SOUNDS);
}

function main(): void {
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  let ffmpeg: string;
  try {
    ffmpeg = resolveBinary(FFMPEG, process.env);
  } catch (e) {
    console.error(`make-pet-clinic: ${(e as Error).message}`);
    process.exit(1);
  }
  for (const id of petClinicIds()) {
    const entry = AUDIO_CATALOG[id as AudioId];
    if (!entry) {
      console.error(`make-pet-clinic: "${id}" is not in the audio catalog`);
      process.exit(1);
    }
    const out = resolve(appRoot, 'public', entry.path);
    mkdirSync(dirname(out), { recursive: true });
    const res = spawnSync(ffmpeg, petClinicArgs(id, out)!, { encoding: 'utf8' });
    if (res.status !== 0 || !existsSync(out)) {
      console.error(`make-pet-clinic: ffmpeg failed for ${id}\n${res.stderr}`);
      process.exit(1);
    }
    console.log(`make-pet-clinic: wrote public/${entry.path}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
