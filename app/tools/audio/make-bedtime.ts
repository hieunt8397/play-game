// Giờ đi ngủ (Story 7.4): synthesises the bedtime game's soft sounds and its lullaby with ffmpeg (our own recipes,
// no recordings, no existing melody). `npm run audio:placeholders` writes them with every other synthesised file
// (make-placeholders › buildArgs asks `bedtimeArgs` first); `node tools/audio/make-bedtime.ts` writes only these.
// Output: mono AAC 44.1 kHz 64 kb/s `.m4a` at public/<AUDIO_CATALOG[id].path>.
//
// SFX (each ≤ 0.8 s, a ≥ 50 ms fade-in, two 150 Hz highpasses, quiet: peak ≈ −20…−24 dBFS, measured; Shiba's
// voice sounds are `creature: true` and measured by `npm run audio:check`):
//   - giggle: Shiba's "hi hi hi" — three short voiced chirps stepping up (E5, G5, A5 of the pentatonic scale);
//   - yawn: a voiced "a-ưm" gliding down from 520 to 330 Hz with a breath, swelling and fading;
//   - snore: a soft "khò khò" — two breathy syllables (noise band 300–900 Hz with a 26 Hz flutter);
//   - sigh: one breathy out-breath, its noise band falling;
//   - click: the lamp's soft click — a short 1.6 kHz tick on a little noise (50 ms fade-in: soft, never sharp);
//   - blanket: a soft rustle — band-passed noise swelling and fading over 0.7 s.
// Lullaby (`music.bedtime-lullaby`): an original 8-bar tune in 3/4 at 60 BPM (24 s loop) on C-major pentatonic
// (content/games/band.ts › BAND_SCALE), a music-box timbre (the note with its octave and 12th, every partial a whole
// multiple, a 12 ms attack and a slow decay) over one soft low note per bar (C4/A3/G3). Every note has died away
// before the loop wraps, so it loops seamlessly. Mastered with a fixed gain to LULLABY_LUFS (≤ −30 LUFS) on the music
// channel, which ducks under every voice line (core/audio-director).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_CATALOG, type AudioId } from '../../src/content/audio-catalog.ts';
import { BAND_SCALE, type BandNote } from '../../src/content/games/band.ts';
import { LULLABY, SFX } from '../../src/content/games/bedtime.ts';
import { FFMPEG, resolveBinary } from '../shared/binaries.ts';

const ENCODE = ['-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k'];
const RATE = 44100;
/** The SFX rule: ≥ 50 ms fade-in (cubic: the first 10 ms stay ≥ 20 dB under the peak). */
export const FADE_IN_S = 0.05;
export const SFX_MAX_S = 0.8;
/** Nothing below 150 Hz. */
export const HIGHPASS = 'highpass=f=150,highpass=f=150';

const r = (x: number): string => Number(x.toFixed(4)).toString();

export interface BedtimeSound {
  readonly seconds: number;
  readonly fadeOut: number;
  /** Gain after synthesis (dB). */
  readonly gainDb: number;
  /** The aevalsrc expression (t in seconds; `random(0)` is white noise). */
  readonly expr: string;
  /** Extra filters before the highpass (a band for the noise sounds). */
  readonly pre?: string;
}

/** A voiced chirp at `hz` from `start` for `len` s (a sin hump; harmonics 1–3). */
const chirp = (hz: number, start: number, len: number): string => {
  const u = `(t-${r(start)})`;
  return `between(t,${r(start)},${r(start + len)})*sin(PI*${u}/${r(len)})*(0.6*sin(2*PI*${r(hz)}*${u})+0.28*sin(4*PI*${r(hz)}*${u})+0.12*sin(6*PI*${r(hz)}*${u}))`;
};

export const SOUNDS: Readonly<Record<string, BedtimeSound>> = {
  [SFX.giggle]: {
    seconds: 0.5,
    fadeOut: 0.06,
    gainDb: -2,
    expr: `0.1*(${chirp(BAND_SCALE.e5, 0.0, 0.12)}+${chirp(BAND_SCALE.g5, 0.15, 0.12)}+${chirp(BAND_SCALE.a5, 0.3, 0.15)})`,
  },
  [SFX.yawn]: {
    seconds: 0.8,
    fadeOut: 0.2,
    gainDb: 0,
    // The pitch glides 520 → 330 Hz (phase = ∫f), a sin² swell; a little breath noise on top.
    expr: `0.1*pow(sin(PI*t/0.8),2)*(0.55*sin(2*PI*(330*t+238*(1-exp(-t/1.25))))+0.25*sin(4*PI*(330*t+238*(1-exp(-t/1.25))))+0.08*(2*random(0)-1))`,
  },
  [SFX.snore]: {
    seconds: 0.8,
    fadeOut: 0.08,
    gainDb: 10,
    expr: `0.1*(2*random(0)-1)*(0.7+0.3*sin(2*PI*26*t))*(between(t,0,0.34)*sin(PI*t/0.34)+between(t,0.4,0.74)*sin(PI*(t-0.4)/0.34))`,
    pre: 'bandpass=f=550:width_type=h:w=600,bandpass=f=550:width_type=h:w=600',
  },
  [SFX.sigh]: {
    seconds: 0.75,
    fadeOut: 0.25,
    gainDb: 6,
    expr: `0.1*(2*random(0)-1)*pow(sin(PI*t/0.75),2)`,
    pre: 'bandpass=f=900:width_type=h:w=900,lowpass=f=1400',
  },
  [SFX.click]: {
    seconds: 0.2,
    fadeOut: 0.08,
    gainDb: 6,
    expr: `0.1*exp(-12*t)*(0.7*sin(2*PI*1600*t)+0.3*(2*random(0)-1))`,
  },
  [SFX.blanket]: {
    seconds: 0.7,
    fadeOut: 0.2,
    gainDb: 1,
    expr: `0.1*(2*random(0)-1)*pow(sin(PI*t/0.7),2)`,
    pre: 'bandpass=f=1800:width_type=h:w=2400',
  },
};

/** Shiba's voice: the creature rule applies (measured by `npm run audio:check`). */
export const CREATURE_SOUNDS: readonly string[] = [SFX.giggle, SFX.yawn, SFX.snore, SFX.sigh];

export function soundFilter(s: BedtimeSound): string {
  return [
    ...(s.pre ? [s.pre] : []),
    `afade=t=in:st=0:d=${FADE_IN_S}:curve=cub`,
    `afade=t=out:st=${r(s.seconds - s.fadeOut)}:d=${r(s.fadeOut)}`,
    HIGHPASS,
    `volume=${s.gainDb}dB`,
  ].join(',');
}

// --- the lullaby ------------------------------------------------------------------------------------------------
/** One beat (s): 60 BPM, 3 beats a bar, 8 bars. */
export const LULLABY_BEAT_S = 1;
export const LULLABY_BEATS = 24;
export const LULLABY_SECONDS = LULLABY_BEAT_S * LULLABY_BEATS;
/** The tune: [note, beats] (C-major pentatonic, our own; 3 beats per bar). */
export const LULLABY_TUNE: readonly (readonly [BandNote, number])[] = [
  ['e5', 2], ['g5', 1],
  ['a5', 2], ['g5', 1],
  ['e5', 1], ['d5', 1], ['c5', 1],
  ['d5', 3],
  ['e5', 2], ['g5', 1],
  ['c6', 2], ['a5', 1],
  ['g5', 1], ['e5', 1], ['d5', 1],
  ['c5', 3],
];
/** One soft low note per bar (Hz; all ≥ 196 Hz, nothing below 150 Hz). */
export const LULLABY_BASS: readonly number[] = [BAND_SCALE.c4, 220.0, BAND_SCALE.c4, 196.0, BAND_SCALE.c4, 220.0, 196.0, BAND_SCALE.c4];
/** The loop's integrated loudness target (music ≤ −30 LUFS); the gain below was measured to reach it. */
export const LULLABY_LUFS = -33;
export const LULLABY_GAIN_DB = -1;

/** A music-box note: the note, its octave and its 12th, a 12 ms attack, a slow decay; it ends before the loop wraps. */
const boxNote = (hz: number, start: number, amp: number, decay: number): string => {
  const len = Math.min(3.2, LULLABY_SECONDS - start - 0.05);
  const u = `(t-${r(start)})`;
  return `between(t,${r(start)},${r(start + len)})*${amp}*pow(min(1,${u}/0.012),2)*exp(-${decay}*${u})*(1-${u}/${r(len)})*(0.72*sin(2*PI*${r(hz)}*${u})+0.2*sin(4*PI*${r(hz)}*${u})+0.08*exp(-4*${u})*sin(6*PI*${r(hz)}*${u}))`;
};

export function lullabyExpr(): string {
  const terms: string[] = [];
  let beat = 0;
  for (const [note, beats] of LULLABY_TUNE) {
    terms.push(boxNote(BAND_SCALE[note], beat * LULLABY_BEAT_S, 0.1, 1.8));
    beat += beats;
  }
  LULLABY_BASS.forEach((hz, bar) => terms.push(boxNote(hz, bar * 3 * LULLABY_BEAT_S, 0.05, 1.2)));
  return terms.join('+');
}

export function lullabyArgs(outFile: string): string[] {
  return ['-hide_banner', '-y', '-f', 'lavfi', '-i', `aevalsrc='${lullabyExpr()}':s=${RATE}:d=${LULLABY_SECONDS}`, '-af', `${HIGHPASS},volume=${LULLABY_GAIN_DB}dB`, ...ENCODE, outFile];
}

/** ffmpeg arguments that write the bedtime file `id` to `outFile`, or undefined when `id` is not one. */
export function bedtimeArgs(id: string, outFile: string): string[] | undefined {
  if (id === LULLABY) return lullabyArgs(outFile);
  const s = SOUNDS[id];
  if (!s) return undefined;
  return ['-hide_banner', '-y', '-f', 'lavfi', '-i', `aevalsrc='${s.expr}':s=${RATE}:d=${s.seconds}`, '-af', soundFilter(s), ...ENCODE, outFile];
}

/** Every synthesised bedtime catalog id (the brush sound is the touch-talk recording). */
export function bedtimeIds(): string[] {
  return [...Object.keys(SOUNDS), LULLABY];
}

function main(): void {
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  let ffmpeg: string;
  try {
    ffmpeg = resolveBinary(FFMPEG, process.env);
  } catch (e) {
    console.error(`make-bedtime: ${(e as Error).message}`);
    process.exit(1);
  }
  for (const id of bedtimeIds()) {
    const entry = AUDIO_CATALOG[id as AudioId];
    if (!entry) {
      console.error(`make-bedtime: "${id}" is not in the audio catalog`);
      process.exit(1);
    }
    const out = resolve(appRoot, 'public', entry.path);
    mkdirSync(dirname(out), { recursive: true });
    const res = spawnSync(ffmpeg, bedtimeArgs(id, out)!, { encoding: 'utf8' });
    if (res.status !== 0 || !existsSync(out)) {
      console.error(`make-bedtime: ffmpeg failed for ${id}\n${res.stderr}`);
      process.exit(1);
    }
    console.log(`make-bedtime: wrote public/${entry.path}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
