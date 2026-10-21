// ElevenLabs text-to-speech for `npm run tts` (recipe v2, 2026-10-21). Run as a child process by
// generate.ts (`node elevenlabs.ts --voice … --model … --speed … --text … --out <file.mp3>`) so the
// renderer stays synchronous and its exec stays injectable in tests.
//
// The API key is ELEVENLABS_API_KEY from the environment, else from the first `.env` found in the
// app root or the project root (both gitignored). It is never printed: errors redact it as `***`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Env } from "../shared/binaries.ts";

export const ELEVENLABS_KEY_VAR = "ELEVENLABS_API_KEY";
const ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";
const OUTPUT_FORMAT = "mp3_44100_128";

/** `KEY=value` lines of a dotenv file (no quoting rules beyond trimming). */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const eq = line.indexOf("=");
    if (line.startsWith("#") || eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line
      .slice(eq + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

/** The key from the environment, else `<appRoot>/.env`, else `<appRoot>/../.env`. */
export function readApiKey(env: Env, appRoot: string): string | undefined {
  const fromEnv = env[ELEVENLABS_KEY_VAR]?.trim();
  if (fromEnv) return fromEnv;
  for (const file of [resolve(appRoot, ".env"), resolve(appRoot, "..", ".env")]) {
    if (!existsSync(file)) continue;
    const key = parseDotenv(readFileSync(file, "utf8"))[ELEVENLABS_KEY_VAR];
    if (key) return key;
  }
  return undefined;
}

export interface SpeakRequest {
  voice: string;
  model: string;
  speed: number;
  text: string;
}

/** The JSON body (speed only when it differs from the voice's natural 1.0). */
export function requestBody(req: SpeakRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    text: req.text,
    model_id: req.model,
    language_code: "vi",
  };
  if (req.speed !== 1) body["voice_settings"] = { speed: req.speed };
  return body;
}

function arg(argv: readonly string[], name: string): string {
  const i = argv.indexOf(name);
  const v = i >= 0 ? argv[i + 1] : undefined;
  if (v === undefined) throw new Error(`elevenlabs: missing ${name}`);
  return v;
}

async function main(argv: readonly string[]): Promise<number> {
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const key = readApiKey(process.env, appRoot);
  if (!key) {
    console.error(`elevenlabs: ${ELEVENLABS_KEY_VAR} not set (env or .env)`);
    return 1;
  }
  const req: SpeakRequest = {
    voice: arg(argv, "--voice"),
    model: arg(argv, "--model"),
    speed: Number(arg(argv, "--speed")),
    text: arg(argv, "--text"),
  };
  const out = arg(argv, "--out");
  try {
    const r = await fetch(`${ENDPOINT}/${req.voice}?output_format=${OUTPUT_FORMAT}`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify(requestBody(req)),
    });
    if (!r.ok) {
      const detail = (await r.text()).replaceAll(key, "***").slice(0, 500);
      console.error(`elevenlabs: HTTP ${r.status} ${detail}`);
      return 1;
    }
    const audio = Buffer.from(await r.arrayBuffer());
    if (audio.length === 0) {
      console.error("elevenlabs: empty audio");
      return 1;
    }
    writeFileSync(out, audio);
    return 0;
  } catch (e) {
    console.error(`elevenlabs: ${String(e).replaceAll(key, "***")}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
