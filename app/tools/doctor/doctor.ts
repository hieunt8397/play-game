// `npm run doctor` (Story 1.4): reports the build-time tools together — Blender 5.2 (images),
// ffmpeg (audio) — each resolved like the tools do (env var, then PATH) — and the ElevenLabs key of
// `npm run tts` (env or .env; never printed). Exits 1 if any is missing. Not needed for `npm run check` or to run the app.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ELEVENLABS_KEY_VAR, readApiKey } from '../tts/elevenlabs.ts';
import { FFMPEG, probeBinary, readVersion, resolveBinary, resolveBlender, type Env, type Probe, type VersionReader } from '../shared/binaries.ts';

export interface DoctorLine {
  tool: string;
  ok: boolean;
  detail: string;
}

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Checks the tools and the TTS key; never throws. */
export function doctor(env: Env, probe: Probe = probeBinary, read: VersionReader = readVersion, appRoot = APP_ROOT): DoctorLine[] {
  const check = (tool: string, fn: () => string): DoctorLine => {
    try {
      return { tool, ok: true, detail: fn() };
    } catch (e) {
      return { tool, ok: false, detail: (e as Error).message };
    }
  };
  return [
    check('Blender', () => {
      const bin = resolveBlender(env, probe, read);
      return `${read(bin).split(/\r?\n/)[0]?.trim() ?? ''} (${bin})`;
    }),
    check('ffmpeg', () => resolveBinary(FFMPEG, env, probe)),
    check('ElevenLabs', () => {
      if (!readApiKey(env, appRoot)) throw new Error(`${ELEVENLABS_KEY_VAR} not set (environment or .env)`);
      return `${ELEVENLABS_KEY_VAR} found`;
    }),
  ];
}

function main(): void {
  const lines = doctor(process.env);
  for (const l of lines) console.log(`doctor: ${l.ok ? 'OK     ' : 'MISSING'} ${l.tool}: ${l.detail}`);
  if (lines.some((l) => !l.ok)) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
