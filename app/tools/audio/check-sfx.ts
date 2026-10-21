// `npm run audio:check` (Story 3.3) — measures every catalog entry with `creature: true` (a creature's
// voice) with ffmpeg and fails, naming the id, unless it is gentle:
//   - duration ≤ Timing.characterSoundMaxMs (800 ms);
//   - nothing below 150 Hz: the file through a 150 Hz lowpass peaks at ≤ −40 dBFS. One 2-pole
//     `lowpass=f=150` still passes a 330 Hz hoot at −14 dB, so the check cascades LOWPASS_STAGES of them
//     (48 dB/octave); a 100 Hz hum passes them almost untouched and fails;
//   - max_volume ≤ −18 dBFS (below the −16 LUFS voice);
//   - the first 10 ms RMS (mean_volume) ≥ 20 dB below the file's peak (a fade-in of ≥ 50 ms, no click).
// Not part of `npm run check` (it needs ffmpeg); the parsers and the verdict are pure and unit-tested.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_CATALOG, type AudioEntry } from '../../src/content/audio-catalog.ts';
import { Tokens } from '../../src/core/tokens.ts';
import { FFMPEG, resolveBinary } from '../shared/binaries.ts';

export const CREATURE_LIMITS = {
  maxMs: Tokens.Timing.characterSoundMaxMs,
  lowpassHz: 150,
  lowMaxDb: -40,
  peakMaxDb: -18,
  headMs: 10,
  headBelowPeakDb: 20,
} as const;

/** One 2-pole lowpass falls 12 dB/octave; four make the "below 150 Hz" measure meaningful. */
export const LOWPASS_STAGES = 4;

export interface CreatureMeasure {
  readonly durationMs: number;
  /** max_volume of the whole file (dBFS). */
  readonly peakDb: number;
  /** max_volume after the lowpass cascade (dBFS). */
  readonly lowDb: number;
  /** mean_volume (RMS) of the first headMs (dBFS). */
  readonly headDb: number;
}

/** The `Duration: hh:mm:ss.cc` of ffmpeg's input report, in ms; undefined when absent. */
export function parseDurationMs(stderr: string): number | undefined {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!m) return undefined;
  return Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000);
}

/** volumedetect's mean and max volume (dBFS; `-inf` → -Infinity); undefined when absent. */
export function parseVolume(stderr: string): { meanDb: number; maxDb: number } | undefined {
  const num = (s: string): number => (/^-?inf$/.test(s) ? -Infinity : Number(s));
  const mean = /mean_volume:\s*(-?inf|-?\d+(?:\.\d+)?) dB/.exec(stderr);
  const max = /max_volume:\s*(-?inf|-?\d+(?:\.\d+)?) dB/.exec(stderr);
  return mean && max ? { meanDb: num(mean[1]!), maxDb: num(max[1]!) } : undefined;
}

/** The ffmpeg arguments of the three measures of `file`. */
export function measureArgs(file: string): { whole: string[]; low: string[]; head: string[] } {
  const L = CREATURE_LIMITS;
  const lowpass = Array.from({ length: LOWPASS_STAGES }, () => `lowpass=f=${L.lowpassHz}`).join(',');
  const run = (af: string): string[] => ['-hide_banner', '-nostats', '-i', file, '-af', af, '-f', 'null', '-'];
  return { whole: run('volumedetect'), low: run(`${lowpass},volumedetect`), head: run(`atrim=0:${L.headMs / 1000},volumedetect`) };
}

/** The problems of one creature sound (empty = gentle), each naming `id`. */
export function creatureProblems(id: string, m: CreatureMeasure): string[] {
  const L = CREATURE_LIMITS;
  const out: string[] = [];
  if (!Number.isFinite(m.peakDb)) out.push(`${id}: silent or unreadable (peak ${m.peakDb} dBFS)`);
  if (m.durationMs > L.maxMs) out.push(`${id}: ${m.durationMs} ms long (max ${L.maxMs})`);
  if (m.lowDb > L.lowMaxDb) out.push(`${id}: ${m.lowDb} dBFS below ${L.lowpassHz} Hz (max ${L.lowMaxDb})`);
  if (m.peakDb > L.peakMaxDb) out.push(`${id}: peak ${m.peakDb} dBFS (max ${L.peakMaxDb}, below the voice)`);
  if (m.headDb > m.peakDb - L.headBelowPeakDb) out.push(`${id}: the first ${L.headMs} ms are ${m.headDb} dBFS, less than ${L.headBelowPeakDb} dB below the peak ${m.peakDb} (fade-in ≥ 50 ms)`);
  return out;
}

/** The catalog ids marked `creature: true`. */
export function creatureIds(catalog: Readonly<Record<string, AudioEntry>> = AUDIO_CATALOG): string[] {
  return Object.entries(catalog)
    .filter(([, e]) => e.creature === true)
    .map(([id]) => id);
}

export type FfmpegRun = (args: string[]) => string;

/** Measures one file through `run` (ffmpeg's stderr); throws when ffmpeg reports nothing usable. */
export function measure(file: string, run: FfmpegRun): CreatureMeasure {
  const a = measureArgs(file);
  const whole = run(a.whole);
  const durationMs = parseDurationMs(whole);
  const peak = parseVolume(whole);
  const low = parseVolume(run(a.low));
  const head = parseVolume(run(a.head));
  if (durationMs === undefined || !peak || !low || !head) throw new Error(`cannot measure ${file}`);
  return { durationMs, peakDb: peak.maxDb, lowDb: low.maxDb, headDb: head.meanDb };
}

function main(): void {
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  let ffmpeg: string;
  try {
    ffmpeg = resolveBinary(FFMPEG, process.env);
  } catch (e) {
    console.error(`audio:check: ${(e as Error).message}`);
    process.exit(1);
  }
  const run: FfmpegRun = (args) => spawnSync(ffmpeg, args, { encoding: 'utf8' }).stderr ?? '';
  const problems: string[] = [];
  const ids = creatureIds();
  for (const id of ids) {
    const file = resolve(appRoot, 'public', AUDIO_CATALOG[id as keyof typeof AUDIO_CATALOG].path);
    try {
      const m = measure(file, run);
      console.log(`audio:check: ${id} ${m.durationMs} ms, peak ${m.peakDb} dBFS, < ${CREATURE_LIMITS.lowpassHz} Hz ${m.lowDb} dBFS, first ${CREATURE_LIMITS.headMs} ms ${m.headDb} dBFS`);
      problems.push(...creatureProblems(id, m));
    } catch (e) {
      problems.push(`${id}: ${(e as Error).message}`);
    }
  }
  if (problems.length > 0) {
    for (const p of problems) console.error(`audio:check: ${p}`);
    process.exit(1);
  }
  console.log(`audio:check: OK (${ids.length} creature sound(s))`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
