// `npm run tts [-- --force]` — renders the voice lines exported by `npm run content:export`
// (app/.generated/voice-lines.json) into public/assets/audio/vo/<id>.m4a + <id>.hash.
//
// Recipe v2 (2026-10-21; Technical Decisions › Asset pipeline; build time only — the app never
// calls TTS):
//   1. ElevenLabs eleven_v3, VOICE_DEFAULTS.voice ("Thắm"), the whole sentence in one request with
//      the `|` keyword marks removed and VOICE_DEFAULTS.style (a v3 audio tag) in front, so the
//      prosody stays natural. Run through tools/tts/elevenlabs.ts as a child process; the key is
//      ELEVENLABS_API_KEY (env or .env) and is checked before any work;
//   2. ffmpeg trims the leading and trailing silence;
//   3. two-pass loudnorm I=−16 TP=−1.5 LRA=11 (pass 1 measures JSON, pass 2 `linear=true`),
//      encoded AAC mono 44.1 kHz 64 kb/s.
// Never overwrites an approved line (approved.textHash === hash and the file exists), even with
// --force; skips a line whose `.hash` is current unless --force. All work happens in a temp dir;
// the `.m4a` is renamed into place, then the `.hash` is written. ffmpeg is resolved (FFMPEG_BIN,
// else PATH) and the API key read before any work; a missing one exits 1 with no file written.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VOICE_DEFAULTS } from "../../src/content/voice-lines.ts";
import {
  EXPORT_FILE,
  type ExportedVoiceLine,
} from "../content/export-voice-lines.ts";
import { readApiKey, ELEVENLABS_KEY_VAR } from "./elevenlabs.ts";
import {
  FFMPEG,
  probeBinary,
  resolveBinary,
  type Env,
  type Probe,
} from "../shared/binaries.ts";

/** Encoder settings of every shipped audio file. */
export const ENCODE_M4A = [
  "-ac",
  "1",
  "-ar",
  "44100",
  "-c:a",
  "aac",
  "-b:a",
  "64k",
];
const ENCODE_WAV = ["-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le"];

export interface LoudnessTarget {
  I: number;
  TP: number;
  LRA: number;
}

/** Voice ≈ −16 LUFS (EXPERIENCE › Âm thanh). */
export const VOICE_LOUDNESS: LoudnessTarget = { I: -16, TP: -1.5, LRA: 11 };

/** Silence below this level counts as leading/trailing silence of a segment. */
const SILENCE_THRESHOLD = "-50dB";
const TRIM_SILENCE = [
  `silenceremove=start_periods=1:start_threshold=${SILENCE_THRESHOLD}`,
  "areverse",
  `silenceremove=start_periods=1:start_threshold=${SILENCE_THRESHOLD}`,
  "areverse",
].join(",");

// --- pure parts (unit-tested) -----------------------------------------------------------------

/** `|` splits the text at the keyword marks (trimmed, empty segments dropped). */
export function splitSegments(text: string): string[] {
  return text
    .normalize("NFC")
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface LineState {
  /** The `.m4a` exists. */
  audioExists: boolean;
  /** Trimmed content of the existing `.hash`, if any. */
  existingHash: string | undefined;
}

export type LinePlan =
  | { action: "skip"; reason: "approved" | "current" }
  | {
      action: "generate";
      text: string;
      rate: number;
      hash: string;
    };

/** The text sent to the TTS: the style tag, then the segments joined by one space. */
export function spokenText(segments: readonly string[]): string {
  return [VOICE_DEFAULTS.style, ...segments].join(" ");
}

/** Decides whether a line is rendered (pure). */
export function planLine(
  line: ExportedVoiceLine,
  state: LineState,
  force: boolean,
): LinePlan {
  const hash = line.textHash;
  if (line.approved?.textHash === hash && state.audioExists)
    return { action: "skip", reason: "approved" };
  if (!force && state.audioExists && state.existingHash === hash)
    return { action: "skip", reason: "current" };
  return {
    action: "generate",
    text: spokenText(splitSegments(line.text)),
    rate: line.rate ?? VOICE_DEFAULTS.rate,
    hash,
  };
}

/** Path of the ElevenLabs child script (run with this Node). */
export const SPEAK_SCRIPT = fileURLToPath(new URL("./elevenlabs.ts", import.meta.url));

export function speakArgs(
  text: string,
  rate: number,
  outFile: string,
): string[] {
  return [
    SPEAK_SCRIPT,
    "--voice",
    VOICE_DEFAULTS.voice,
    "--model",
    VOICE_DEFAULTS.model,
    "--speed",
    String(rate),
    "--text",
    text,
    "--out",
    outFile,
  ];
}

/** Decodes the TTS answer to mono 44.1 kHz WAV with leading/trailing silence removed. */
export function trimArgs(inFile: string, outFile: string): string[] {
  return [
    "-hide_banner",
    "-y",
    "-i",
    inFile,
    "-af",
    TRIM_SILENCE,
    ...ENCODE_WAV,
    outFile,
  ];
}

export interface LoudnormMeasured {
  input_i: number;
  input_tp: number;
  input_lra: number;
  input_thresh: number;
  target_offset: number;
}

const MEASURED_KEYS = [
  "input_i",
  "input_tp",
  "input_lra",
  "input_thresh",
  "target_offset",
] as const;

export function loudnormFilter(
  target: LoudnessTarget,
  measured?: LoudnormMeasured,
): string {
  const base = `loudnorm=I=${target.I}:TP=${target.TP}:LRA=${target.LRA}`;
  if (!measured) return `${base}:print_format=json`;
  return (
    `${base}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}` +
    `:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=summary`
  );
}

/** Pads a line shorter than loudnorm's gating window for the pass-1 measure only (Story 3.1). */
export const SHORT_LINE_MEASURE_PAD = "apad=whole_dur=1";

/** True when the pass-1 JSON has an `input_i` that is present but not finite (e.g. "-inf"). */
export function nonFiniteInputI(stderr: string): boolean {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start < 0 || end < start) return false;
  try {
    const raw = JSON.parse(stderr.slice(start, end + 1)) as Record<string, unknown>;
    const v = raw["input_i"];
    return typeof v === "string" && v.trim() !== "" && !Number.isFinite(Number(v));
  } catch {
    return false;
  }
}

/** Pass 1: measure only (JSON on stderr), no output file. `preFilter` runs before loudnorm. */
export function loudnormPass1Args(
  inFile: string,
  target: LoudnessTarget = VOICE_LOUDNESS,
  preFilter?: string,
): string[] {
  const af = preFilter
    ? `${preFilter},${loudnormFilter(target)}`
    : loudnormFilter(target);
  return [
    "-hide_banner",
    "-nostats",
    "-i",
    inFile,
    "-af",
    af,
    "-f",
    "null",
    "-",
  ];
}

/** Reads the pass-1 JSON block from ffmpeg's stderr; throws on missing or bad JSON. */
export function parseLoudnorm(stderr: string): LoudnormMeasured {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start < 0 || end < start)
    throw new Error("loudnorm: no JSON block in ffmpeg output");
  const raw = JSON.parse(stderr.slice(start, end + 1)) as Record<
    string,
    unknown
  >;
  const out = {} as LoudnormMeasured;
  for (const key of MEASURED_KEYS) {
    const value = Number(raw[key]);
    if (
      raw[key] === undefined ||
      raw[key] === null ||
      !Number.isFinite(value)
    ) {
      throw new Error(
        `loudnorm: "${key}" missing or not a number in ${JSON.stringify(raw)}`,
      );
    }
    out[key] = value;
  }
  return out;
}

/** Pass 2: linear normalisation with the measured values, encoded to the shipped `.m4a` format. */
export function loudnormPass2Args(
  inFile: string,
  measured: LoudnormMeasured,
  outFile: string,
  target: LoudnessTarget = VOICE_LOUDNESS,
  preFilter?: string,
): string[] {
  const ln = loudnormFilter(target, measured);
  return [
    "-hide_banner",
    "-nostats",
    "-y",
    "-i",
    inFile,
    "-af",
    preFilter ? `${preFilter},${ln}` : ln,
    ...ENCODE_M4A,
    outFile,
  ];
}

// --- runner (injectable for tests) ------------------------------------------------------------

export interface ExecResult {
  status: number | null;
  stderr: string;
}
export type Exec = (bin: string, args: readonly string[]) => ExecResult;

export const spawnExec: Exec = (bin, args) => {
  const r = spawnSync(bin, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: r.status,
    stderr: r.error ? String(r.error) : (r.stderr ?? ""),
  };
};

export interface TtsDeps {
  appRoot: string;
  argv: readonly string[];
  env: Env;
  probe?: Probe;
  exec?: Exec;
  log?: (msg: string) => void;
  error?: (msg: string) => void;
  /** Blocking wait between TTS retries (default: a real sleep). */
  sleep?: (ms: number) => void;
}

/** TTS attempts per line: the online service may answer 429 or 5xx; a later attempt succeeds. */
export const SPEAK_ATTEMPTS = 5;
const SPEAK_RETRY_MS = 2000;

const realSleep = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

function runOk(
  exec: Exec,
  bin: string,
  args: readonly string[],
  what: string,
): ExecResult {
  const r = exec(bin, args);
  if (r.status !== 0)
    throw new Error(
      `${what} failed (exit ${r.status})\n${r.stderr.slice(-2000)}`,
    );
  return r;
}

function runSpeak(
  exec: Exec,
  sleep: (ms: number) => void,
  bin: string,
  args: readonly string[],
  what: string,
): void {
  for (let attempt = 1; ; attempt++) {
    const r = exec(bin, args);
    if (r.status === 0) return;
    if (attempt >= SPEAK_ATTEMPTS) {
      throw new Error(`${what} failed ${attempt} times (exit ${r.status})
${r.stderr.slice(-2000)}`);
    }
    sleep(SPEAK_RETRY_MS * attempt);
  }
}

function renderLine(
  plan: Extract<LinePlan, { action: "generate" }>,
  tmp: string,
  bins: { node: string; ffmpeg: string },
  exec: Exec,
  sleep: (ms: number) => void,
): string {
  const mp3 = join(tmp, "speech.mp3");
  const joined = join(tmp, "speech.wav");
  runSpeak(exec, sleep, bins.node, speakArgs(plan.text, plan.rate, mp3), "TTS");
  runOk(exec, bins.ffmpeg, trimArgs(mp3, joined), "ffmpeg trim");
  const pass1 = (pre?: string): string =>
    runOk(
      exec,
      bins.ffmpeg,
      loudnormPass1Args(joined, VOICE_LOUDNESS, pre),
      "ffmpeg loudnorm pass 1",
    ).stderr;
  let stderr = pass1();
  // Story 3.1: a one-word line ("Một!") is shorter than loudnorm's 400 ms gating block, so its
  // integrated loudness reads -inf. Measure it padded with silence instead (the gain is the same).
  if (nonFiniteInputI(stderr)) stderr = pass1(SHORT_LINE_MEASURE_PAD);
  const measured = parseLoudnorm(stderr);
  const out = join(tmp, "out.m4a");
  runOk(
    exec,
    bins.ffmpeg,
    loudnormPass2Args(joined, measured, out),
    "ffmpeg loudnorm pass 2",
  );
  if (!existsSync(out)) throw new Error("ffmpeg loudnorm pass 2 wrote no file");
  return out;
}

/** Runs the tool; returns the process exit code. */
export function runTts(deps: TtsDeps): number {
  const log = deps.log ?? ((m: string) => console.log(m));
  const error = deps.error ?? ((m: string) => console.error(m));
  const exec = deps.exec ?? spawnExec;
  const force = deps.argv.includes("--force");

  // 1. Tools first — nothing is read or written before ffmpeg resolves and the key is found.
  let bins: { node: string; ffmpeg: string };
  try {
    bins = {
      node: process.execPath,
      ffmpeg: resolveBinary(FFMPEG, deps.env, deps.probe ?? probeBinary),
    };
  } catch (e) {
    error(`tts: ${(e as Error).message}`);
    return 1;
  }
  if (!readApiKey(deps.env, deps.appRoot)) {
    error(`tts: ${ELEVENLABS_KEY_VAR} not set — add it to the environment or to .env`);
    return 1;
  }

  // 2. The exported lines.
  const exportPath = resolve(deps.appRoot, EXPORT_FILE);
  if (!existsSync(exportPath)) {
    error(`tts: ${EXPORT_FILE} not found — run npm run content:export first`);
    return 1;
  }
  let lines: ExportedVoiceLine[];
  try {
    lines = JSON.parse(readFileSync(exportPath, "utf8")) as ExportedVoiceLine[];
  } catch (e) {
    error(
      `tts: cannot read ${EXPORT_FILE} (${(e as Error).message}) — run npm run content:export`,
    );
    return 1;
  }

  let written = 0;
  let skipped = 0;
  for (const line of lines) {
    if (!line.textHash) {
      error(`tts: "${line.id}" has no textHash — run npm run content:export`);
      return 1;
    }
    const audioFile = resolve(deps.appRoot, "public", line.path);
    const hashFile = audioFile.replace(/\.m4a$/, ".hash");
    const existingHash = existsSync(hashFile)
      ? readFileSync(hashFile, "utf8").trim()
      : undefined;
    const plan = planLine(
      line,
      { audioExists: existsSync(audioFile), existingHash },
      force,
    );
    if (plan.action === "skip") {
      // An approved line keeps its audio, but a missing or stale .hash is rewritten so check can pass.
      if (plan.reason === "approved" && existingHash !== line.textHash) {
        writeFileSync(
          hashFile,
          `${line.textHash}
`,
          "utf8",
        );
        log(`tts: repaired public/${line.path.replace(/.m4a$/, ".hash")}`);
      }
      skipped++;
      log(
        `tts: skip ${line.id} (${plan.reason === "approved" ? "approved" : "up to date"})`,
      );
      continue;
    }
    const tmpRoot = resolve(deps.appRoot, ".generated");
    mkdirSync(tmpRoot, { recursive: true });
    const tmp = mkdtempSync(join(tmpRoot, "tts-"));
    try {
      const out = renderLine(plan, tmp, bins, exec, deps.sleep ?? realSleep);
      mkdirSync(dirname(audioFile), { recursive: true });
      renameSync(out, audioFile);
      const tmpHash = join(tmp, "out.hash");
      writeFileSync(tmpHash, `${plan.hash}\n`, "utf8");
      renameSync(tmpHash, hashFile);
      written++;
      log(`tts: wrote public/${line.path}`);
    } catch (e) {
      error(`tts: "${line.id}": ${(e as Error).message}`);
      return 1;
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  log(`tts: done (${written} written, ${skipped} skipped)`);
  return 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exit(
    runTts({
      appRoot: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."),
      argv: process.argv.slice(2),
      env: process.env,
    }),
  );
}
