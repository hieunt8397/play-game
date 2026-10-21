// External-binary resolution shared by the build tools (audio:placeholders, audio:normalize, tts).
// Each tool resolves every binary it needs BEFORE doing any work: env override (full path) first,
// then the bare name on PATH, each probed by running `<bin> <versionArg>`. A missing binary throws
// an error that names the tool, so the caller can exit 1 without writing any file.
import { spawnSync } from 'node:child_process';

/** True when `bin versionArg` runs and exits 0. */
export type Probe = (bin: string, versionArg: string) => boolean;

export const probeBinary: Probe = (bin, versionArg) => {
  const r = spawnSync(bin, [versionArg], { stdio: 'ignore' });
  return r.status === 0;
};

export interface BinarySpec {
  /** Env var holding the full path, e.g. `FFMPEG_BIN`. */
  envVar: string;
  /** Name on PATH and in messages, e.g. `ffmpeg`. */
  name: string;
  /** Name on PATH when it differs from `name` (Blender → `blender`). */
  pathName?: string;
  /** The flag that makes the tool print its version and exit (`-version` for ffmpeg). */
  versionArg: string;
  /** How to install it, e.g. "install ffmpeg (e.g. `winget install Gyan.FFmpeg`)". */
  installHint: string;
}

export const FFMPEG: BinarySpec = {
  envVar: 'FFMPEG_BIN',
  name: 'ffmpeg',
  versionArg: '-version',
  installHint: 'install ffmpeg (e.g. `winget install Gyan.FFmpeg`)',
};

export type Env = Readonly<Record<string, string | undefined>>;

/** Resolves a binary or throws `"<name> not found: …"`. */
export function resolveBinary(spec: BinarySpec, env: Env, probe: Probe = probeBinary): string {
  const fromEnv = env[spec.envVar]?.trim();
  if (fromEnv) {
    if (probe(fromEnv, spec.versionArg)) return fromEnv;
    throw new Error(`${spec.name} not found: ${spec.envVar}="${fromEnv}" does not run. Fix the path or unset it to use PATH.`);
  }
  const pathName = spec.pathName ?? spec.name;
  if (probe(pathName, spec.versionArg)) return pathName;
  throw new Error(`${spec.name} not found: ${spec.installHint} or set ${spec.envVar} to its full path.`);
}

export const BLENDER: BinarySpec = {
  envVar: 'BLENDER_BIN',
  name: 'Blender',
  pathName: 'blender',
  versionArg: '--version',
  installHint: 'install Blender 5.2.2 LTS (blender.org) and put `blender` on PATH,',
};


/** Parses `blender --version` output (`Blender 5.2.2 LTS` → `5.2.2`); undefined when absent. */
export function blenderVersion(output: string): string | undefined {
  return /^Blender (\d+\.\d+(?:\.\d+)?)/m.exec(output)?.[1];
}

/** The required Blender series: renders must not drift between versions. */
export const BLENDER_SERIES = '5.2';

/** Throws `needs Blender 5.2 (found X)` unless the version output reports 5.2.x. */
export function checkBlenderVersion(output: string): string {
  const found = blenderVersion(output);
  if (found === undefined || (found !== BLENDER_SERIES && !found.startsWith(`${BLENDER_SERIES}.`))) {
    throw new Error(`Blender: needs Blender ${BLENDER_SERIES} (found ${found ?? 'unknown version'}). Set BLENDER_BIN to a Blender ${BLENDER_SERIES} blender.exe.`);
  }
  return found;
}

/** Runs `blender --version` and returns its stdout ('' when it fails). */
export type VersionReader = (bin: string) => string;

export const readVersion: VersionReader = (bin) => {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout : '';
};

/** Resolves Blender (BLENDER_BIN, then `blender` on PATH) and checks it is 5.2.x; throws naming Blender. */
export function resolveBlender(env: Env, probe: Probe = probeBinary, read: VersionReader = readVersion): string {
  const bin = resolveBinary(BLENDER, env, probe);
  checkBlenderVersion(read(bin));
  return bin;
}
