// Shared by `art:build` and `render` (Story 1.4): paths, the screen registry, Blender arguments and
// the Blender runner (injected in tests: they never spawn Blender).
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PROJECT_DIR = resolve(APP_DIR, '..');
export const ART_DIR = join(PROJECT_DIR, 'art');
export const BLENDER_SCRIPTS = join(APP_DIR, 'tools', 'render', 'blender');
export const RENDER_DIR = join(APP_DIR, '.generated', 'render');
export const LAYOUT_DIR = join(APP_DIR, 'src', 'content', 'generated');

export interface ScreenSpec {
  /** Vendored source scene (relative to the project root), opened by the builder. */
  source: string;
  /** Builder script in tools/render/blender/. */
  builder: string;
}

/** Screens with a Blender scene. art/<screen>.blend is built from `source` by `builder`. */
export const SCREENS: Readonly<Record<string, ScreenSpec>> = {
  map: { source: 'art/src/map-v3.blend', builder: 'build_map.py' },
  'ice-cream': { source: 'art/src/map-v3.blend', builder: 'build_ice_cream.py' },
  pizza: { source: 'art/src/map-v3.blend', builder: 'build_pizza.py' },
  'dino-puzzle': { source: 'art/src/map-v3.blend', builder: 'build_dino_puzzle.py' },
  'shadow-match': { source: 'art/src/map-v3.blend', builder: 'build_shadow_match.py' },
  race: { source: 'art/src/map-v3.blend', builder: 'build_race.py' },
  fishing: { source: 'art/src/map-v3.blend', builder: 'build_fishing.py' },
  'touch-talk': { source: 'art/src/map-v3.blend', builder: 'build_touch_talk.py' },
  // Story 7.1: the yard behind the island's home station.
  home: { source: 'art/src/map-v3.blend', builder: 'build_home.py' },
  // Story 7.2: the yard's pen game (Ú òa chuồng thú).
  'animal-pens': { source: 'art/src/map-v3.blend', builder: 'build_animal_pens.py' },
  // Story 7.3: the yard's stage game (Ban nhạc).
  band: { source: 'art/src/map-v3.blend', builder: 'build_band.py' },
};

/** Throws listing the known screens when `screen` is not one. */
export function screenSpec(screen: string | undefined): ScreenSpec & { id: string } {
  const spec = screen === undefined ? undefined : SCREENS[screen];
  if (screen === undefined || !spec) {
    throw new Error(`unknown screen "${screen ?? ''}": known screens are ${Object.keys(SCREENS).join(', ')}`);
  }
  return { id: screen, ...spec };
}

export const blendPath = (screen: string): string => join(ART_DIR, `${screen}.blend`);

/**
 * `-b --factory-startup <blend> [-S <scene>] --python-exit-code 1 --python <script> -- <args>`. Story 4.5:
 * `scene` makes that Blender scene of the file the active one (a plate of a multi-plate screen).
 */
export function blenderArgs(blend: string, script: string, args: readonly string[], scene?: string): string[] {
  return ['-b', '--factory-startup', blend, ...(scene ? ['-S', scene] : []), '--python-exit-code', '1', '--python', script, '--', ...args];
}

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export type Runner = (bin: string, args: readonly string[]) => RunResult;

export const runProcess: Runner = (bin, args) => {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? (r.error ? String(r.error) : '') };
};

const TAIL_LINES = 25;

/** Last lines of a process' output, for error messages. */
export function tail(text: string, lines = TAIL_LINES): string {
  return text.trimEnd().split(/\r?\n/).slice(-lines).join('\n');
}

/** Runs Blender; throws with the output tail unless it exits 0. */
export function runBlender(run: Runner, bin: string, args: readonly string[]): RunResult {
  const r = run(bin, args);
  if (r.status !== 0) {
    throw new Error(`Blender exited with ${r.status ?? 'no status'}:\n${tail(`${r.stdout}\n${r.stderr}`)}`);
  }
  return r;
}
