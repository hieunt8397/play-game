// Ban nhạc (Story 7.3): synthesises the band's notes and its idle beat with ffmpeg (our own recipes, no
// recordings, no songs). `npm run audio:placeholders` writes them with every other synthesised file
// (make-placeholders › buildArgs asks `bandArgs` first); `node tools/audio/make-band.ts` writes only these.
// Output: mono AAC 44.1 kHz 64 kb/s `.m4a` at public/<AUDIO_CATALOG[id].path>.
//
// Notes (`sfx.band.<instrument>.<note>`): one shared C-major pentatonic scale (content/games/band.ts ›
// BAND_SCALE), each instrument in its own register with its own timbre. Every partial is a whole multiple of the
// note (no inharmonic partial, so any mix of notes stays consonant), the note is ≤ 0.8 s, starts with a 50 ms
// cubic fade-in and ends with a fade-out, passes two 150 Hz highpasses (the lowest note is C4 262 Hz) and peaks
// at −18.5…−19.3 dBFS (each instrument's `gainDb` brings its loudest note to −18.5 dBFS): max momentary −27…−33
// LUFS, far below the −16 LUFS voice (measured with ffmpeg ebur128 / volumedetect, 2026-10-23):
//   - drum: a soft pitched tom — the pitch drops 30 % into the note in 40 ms, an octave partial fades fast;
//   - horn: a toy brass tone — five harmonics, a slow swell, a gentle vibrato after 0.2 s;
//   - frog: the singer's croak "ộp ộp" — two buzzy syllables (four harmonics, a 28 Hz flutter) on the note;
//   - xylophone: a wooden bar — the note with its 3rd and 4th harmonics dying fast;
//   - bell: a small bell — the note, its octave and 12th, ringing out.
// Beat (`music.band.beat`, a loop of BEAT_LOOP_BEATS beats Timing.bandBeatMs apart): a soft tom on C4 (beat 1)
// and G4 (beat 3) and a high shaker tick (noise above 3 kHz) on beats 2 and 4, with a soft 30 ms (tom) / 20 ms (tick) attack, every
// event over before the loop wraps; mastered to BEAT_LUFS (music ≤ −30 LUFS) on the music channel (ducked
// under every voice line by core/audio-director).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_CATALOG, type AudioId } from '../../src/content/audio-catalog.ts';
import { BAND_INSTRUMENTS, BAND_SCALE, BEAT_LOOP_BEATS, BEAT_MUSIC, type BandNote } from '../../src/content/games/band.ts';
import { Tokens } from '../../src/core/tokens.ts';
import { FFMPEG, resolveBinary } from '../shared/binaries.ts';

const ENCODE = ['-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k'];
const RATE = 44100;
/** Every note starts with this fade-in (the SFX rule: ≥ 50 ms; cubic, so the first 10 ms stay ≥ 20 dB under the peak). */
export const NOTE_FADE_IN_S = 0.05;
export const NOTE_MAX_S = 0.8;
/** Nothing below 150 Hz: two 2-pole highpasses (the lowest partial is C4 262 Hz). */
export const BAND_HIGHPASS = 'highpass=f=150,highpass=f=150';
/** The beat loop's integrated loudness (music ≤ −30 LUFS): measured −36.1 LUFS (−35.5 looped), max momentary −33.1, below every note. */
export const BEAT_LUFS = -36;

export interface Timbre {
  /** Note length (s), ≤ NOTE_MAX_S. */
  readonly seconds: number;
  /** The fade-out at the end (s). */
  readonly fadeOut: number;
  /** Gain after synthesis (dB): evens the instruments' loudness (each note's raw peak is ≤ 0.1). */
  readonly gainDb: number;
  /** The harmonic numbers this timbre uses (each a whole multiple of the note: no dissonance). */
  readonly harmonics: readonly number[];
  /** The aevalsrc expression of the note at `hz` (t in seconds). */
  expr(hz: number): string;
}

const r = (x: number): string => Number(x.toFixed(4)).toString();

/** Σ a_k·sin(k·phase) for the harmonics `ks` with amplitudes `as` (each optionally decaying at its own rate). */
const partials = (phase: string, ks: readonly number[], as: readonly number[], decays?: readonly number[]): string =>
  ks.map((k, i) => `${r(as[i]!)}*${decays && decays[i] ? `exp(-${r(decays[i]!)}*t)*` : ''}sin(${k}*(${phase}))`).join('+');

export const TIMBRES: Readonly<Record<string, Timbre>> = {
  // A soft pitched tom: the pitch glides down from 1.3× to the note in ~40 ms (phase of f·(1 + 0.3·e^(−t/0.04))).
  drum: {
    seconds: 0.6,
    fadeOut: 0.15,
    gainDb: 4.7,
    harmonics: [1, 2],
    expr: (hz) => {
      const phase = `2*PI*${r(hz)}*(t+0.012*(1-exp(-t/0.04)))`;
      return `0.1*exp(-6*t)*(${partials(phase, [1, 2], [0.85, 0.15], [0, 10])})`;
    },
  },
  // A toy horn: five harmonics, a swell to a held level, a vibrato (0.5 % at 5.5 Hz) fading in after 0.2 s.
  horn: {
    seconds: 0.7,
    fadeOut: 0.18,
    gainDb: 2.6,
    harmonics: [1, 2, 3, 4, 5],
    expr: (hz) => {
      const beta = (0.005 * hz) / 5.5;
      const phase = `2*PI*${r(hz)}*t+${r(beta)}*min(1,max(0,(t-0.2)/0.2))*sin(2*PI*5.5*t)`;
      return `0.1*(0.75+0.25*exp(-8*t))*(${partials(phase, [1, 2, 3, 4, 5], [0.48, 0.24, 0.14, 0.08, 0.06])})`;
    },
  },
  // The frog's "ộp ộp": two syllables (0.2 s each, 0.06 s apart), each a sin hump, buzzy (four harmonics) with a
  // 28 Hz flutter; the pitch settles onto the note from 6 % above within each syllable.
  frog: {
    seconds: 0.5,
    fadeOut: 0.04,
    gainDb: 1.8,
    harmonics: [1, 2, 3, 4],
    expr: (hz) => {
      const syl = (start: number): string => {
        const u = `(t-${start})`;
        const phase = `2*PI*${r(hz)}*(${u}+0.0024*(1-exp(-${u}/0.04)))`;
        return `between(t,${start},${start + 0.2})*sin(PI*${u}/0.2)*(0.7+0.3*cos(2*PI*28*${u}))*(${partials(phase, [1, 2, 3, 4], [0.5, 0.25, 0.15, 0.1])})`;
      };
      return `0.1*(${syl(0.0)}+${syl(0.26)})`;
    },
  },
  // A wooden bar: the note, its 3rd and 4th harmonics dying fast.
  xylophone: {
    seconds: 0.55,
    fadeOut: 0.12,
    gainDb: 5.9,
    harmonics: [1, 3, 4],
    expr: (hz) => `0.1*(${partials(`2*PI*${r(hz)}*t`, [1, 3, 4], [0.8, 0.15, 0.05], [7, 22, 35])})`,
  },
  // A small bell: the note, its octave and its 12th (3rd harmonic), ringing out.
  bell: {
    seconds: 0.8,
    fadeOut: 0.2,
    gainDb: 3.8,
    harmonics: [1, 2, 3],
    expr: (hz) => `0.1*(${partials(`2*PI*${r(hz)}*t`, [1, 2, 3], [0.7, 0.2, 0.1], [3.5, 5, 8])})`,
  },
};

const BAND_ID = /^sfx\.band\.([a-z]+)\.([a-z][0-9])$/;

/** `sfx.band.<instrument>.<note>` → its instrument and note, or undefined. */
export function parseNoteId(id: string): { instrument: string; note: BandNote } | undefined {
  const m = BAND_ID.exec(id);
  if (!m || !(m[2]! in BAND_SCALE) || !TIMBRES[m[1]!]) return undefined;
  return { instrument: m[1]!, note: m[2] as BandNote };
}

/** The `-af` chain of a note of `timbre`. */
export function noteFilter(t: Timbre): string {
  return [
    `afade=t=in:st=0:d=${NOTE_FADE_IN_S}:curve=cub`,
    `afade=t=out:st=${r(t.seconds - t.fadeOut)}:d=${r(t.fadeOut)}`,
    BAND_HIGHPASS,
    `volume=${t.gainDb}dB`,
  ].join(',');
}

// --- the beat --------------------------------------------------------------------------------------------------
const BEAT_S = Tokens.Timing.bandBeatMs / 1000;
export const BEAT_SECONDS = Number((BEAT_S * BEAT_LOOP_BEATS).toFixed(3));
/** Beat 1: tom on C4, beat 3: tom on G4 (in the scale), each 0.45 s with a 30 ms cubic attack. */
const tom = (hz: number, start: number, amp: number): string => {
  const u = `(t-${r(start)})`;
  return `between(t,${r(start)},${r(start + 0.45)})*${amp}*pow(min(1,${u}/0.03),3)*exp(-7*${u})*(0.85*sin(2*PI*${r(hz)}*(${u}+0.012*(1-exp(-${u}/0.04))))+0.15*exp(-10*${u})*sin(4*PI*${r(hz)}*${u}))`;
};
const TOMS = `${tom(BAND_SCALE.c4, 0, 0.5)}+${tom(BAND_SCALE.g4, 2 * BEAT_S, 0.4)}`;
/** Beats 2 and 4: a 90 ms shaker tick (noise, highpassed at 3 kHz in the graph), 20 ms cubic attack. */
const tick = (start: number): string => {
  const u = `(t-${r(start)})`;
  return `between(t,${r(start)},${r(start + 0.09)})*pow(min(1,${u}/0.02),3)*exp(-30*${u})`;
};
const TICKS = `0.12*(2*random(0)-1)*(${tick(BEAT_S)}+${tick(3 * BEAT_S)})`;
/** Gain that brings the mixed loop to BEAT_LUFS (measured; README provenance). */
export const BEAT_GAIN_DB = -12;

export function beatArgs(outFile: string): string[] {
  const src = (expr: string): string[] => ['-f', 'lavfi', '-i', `aevalsrc='${expr}':s=${RATE}:d=${BEAT_SECONDS}`];
  return [
    '-hide_banner',
    '-y',
    ...src(TOMS),
    ...src(TICKS),
    '-filter_complex',
    `[1]highpass=f=3000,highpass=f=3000[k];[0][k]amix=inputs=2:normalize=0,${BAND_HIGHPASS},volume=${BEAT_GAIN_DB}dB`,
    ...ENCODE,
    outFile,
  ];
}

/** ffmpeg arguments that write the band file `id` to `outFile`, or undefined when `id` is not a band file. */
export function bandArgs(id: string, outFile: string): string[] | undefined {
  if (id === BEAT_MUSIC) return beatArgs(outFile);
  const n = parseNoteId(id);
  if (!n) return undefined;
  const t = TIMBRES[n.instrument]!;
  const expr = t.expr(BAND_SCALE[n.note]);
  return ['-hide_banner', '-y', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=${RATE}:d=${t.seconds}`, '-af', noteFilter(t), ...ENCODE, outFile];
}

/** Every band catalog id (the notes of every instrument and the beat). */
export function bandIds(): string[] {
  return [...BAND_INSTRUMENTS.flatMap((i) => i.noteSfx), BEAT_MUSIC];
}

function main(): void {
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  let ffmpeg: string;
  try {
    ffmpeg = resolveBinary(FFMPEG, process.env);
  } catch (e) {
    console.error(`make-band: ${(e as Error).message}`);
    process.exit(1);
  }
  for (const id of bandIds()) {
    const entry = AUDIO_CATALOG[id as AudioId];
    if (!entry) {
      console.error(`make-band: "${id}" is not in the audio catalog`);
      process.exit(1);
    }
    const out = resolve(appRoot, 'public', entry.path);
    mkdirSync(dirname(out), { recursive: true });
    const res = spawnSync(ffmpeg, bandArgs(id, out)!, { encoding: 'utf8' });
    if (res.status !== 0 || !existsSync(out)) {
      console.error(`make-band: ffmpeg failed for ${id}\n${res.stderr}`);
      process.exit(1);
    }
    console.log(`make-band: wrote public/${entry.path}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
