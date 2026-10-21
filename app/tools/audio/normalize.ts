// `npm run audio:normalize -- <src> <audioId>` — masters a real SFX/music source file into the
// catalog path of `audioId` (public/<AUDIO_CATALOG[id].path>) with two-pass ffmpeg loudnorm:
//   music: I=−30 TP=−3 (EXPERIENCE › Âm thanh: music ≤ −30 LUFS);
//   sfx:   I=−20 TP=−3 with a 50 ms `afade` in (SFX fade in ≥ 50 ms; −20 keeps them under the
//          −16 LUFS voice — loudnorm's integrated measure on very short files is approximate).
// Output: AAC mono 44.1 kHz 64 kb/s. Written to a temp file next to the target, then renamed.
// ffmpeg comes from FFMPEG_BIN or PATH and is resolved before any work.
// Record every new file's source and licence in the README provenance table.
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_CATALOG, isAudioId, type AudioKind } from '../../src/content/audio-catalog.ts';
import { FFMPEG, resolveBinary } from '../shared/binaries.ts';
import { loudnormPass1Args, loudnormPass2Args, parseLoudnorm, spawnExec, type LoudnessTarget } from '../tts/generate.ts';

export interface NormalizeTarget {
  loudness: LoudnessTarget;
  /** Filter applied before loudnorm (SFX fade-in), if any. */
  preFilter?: string;
}

const SFX_FADE_IN_S = 0.05;

export function normalizeTarget(kind: AudioKind): NormalizeTarget {
  if (kind === 'music') return { loudness: { I: -30, TP: -3, LRA: 11 } };
  return { loudness: { I: -20, TP: -3, LRA: 11 }, preFilter: `afade=t=in:st=0:d=${SFX_FADE_IN_S}` };
}

export function normalizePass1Args(src: string, kind: AudioKind): string[] {
  const t = normalizeTarget(kind);
  return loudnormPass1Args(src, t.loudness, t.preFilter);
}

export function normalizePass2Args(src: string, kind: AudioKind, measured: Parameters<typeof loudnormPass2Args>[1], outFile: string): string[] {
  const t = normalizeTarget(kind);
  return loudnormPass2Args(src, measured, outFile, t.loudness, t.preFilter);
}

function main(argv: readonly string[]): number {
  const [src, id] = argv;
  if (!src || !id) {
    console.error('audio:normalize: usage: npm run audio:normalize -- <src> <audioId>');
    return 1;
  }
  let ffmpeg: string;
  try {
    ffmpeg = resolveBinary(FFMPEG, process.env);
  } catch (error) {
    console.error(`audio:normalize: ${(error as Error).message}`);
    return 1;
  }
  if (!isAudioId(id)) {
    console.error(`audio:normalize: "${id}" is not in content/audio-catalog.ts — add it there first`);
    return 1;
  }
  const source = resolve(src);
  if (!existsSync(source)) {
    console.error(`audio:normalize: source file ${source} not found`);
    return 1;
  }
  const entry = AUDIO_CATALOG[id];
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const out = resolve(appRoot, 'public', entry.path);
  const tmp = out.replace(/\.m4a$/, '.tmp.m4a');
  mkdirSync(dirname(out), { recursive: true });
  try {
    const pass1 = spawnExec(ffmpeg, normalizePass1Args(source, entry.kind));
    if (pass1.status !== 0) throw new Error(`loudnorm pass 1 failed\n${pass1.stderr.slice(-2000)}`);
    const pass2 = spawnExec(ffmpeg, normalizePass2Args(source, entry.kind, parseLoudnorm(pass1.stderr), tmp));
    if (pass2.status !== 0 || !existsSync(tmp)) throw new Error(`loudnorm pass 2 failed\n${pass2.stderr.slice(-2000)}`);
    renameSync(tmp, out);
  } catch (error) {
    rmSync(tmp, { force: true });
    console.error(`audio:normalize: ${id}: ${(error as Error).message}`);
    return 1;
  }
  console.log(`audio:normalize: wrote public/${entry.path} — add its source and licence to the README provenance table`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
