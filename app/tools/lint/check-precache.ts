// `npm run precache:check` (Story 1.11, AR36) — runs after `vite build` in `npm run check`. Pure rules
// in `checkPrecache()`; `run(appDir)` wires the real public/ and dist/ trees. It fails, naming the
// path, when:
//   - a file under public/ with a runtime extension (the Workbox glob list) is missing from the
//     dist/sw.js precache manifest, and so is every dist/ file of those types (index.html, Vite's
//     assets/index-*.js and *.css …) except sw.js and workbox-*.js;
//   - a file under public/ has an extension that is neither a runtime type nor metadata (.hash, .txt);
//   - any file in dist/ is larger than 8 388 608 bytes;
//   - dist/index.html, dist/manifest.webmanifest, dist/sw.js or dist/workbox-*.js contains http:// or
//     https://, or calls importScripts() with a non-relative URL; sw.js calls skipWaiting();
//   - dist/sw.js (or index.html / manifest.webmanifest) is missing ("run vite build").
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** File types the app fetches at runtime — must match `RUNTIME_GLOB` in vite.config.ts. */
export const RUNTIME_EXTENSIONS = ['js', 'css', 'html', 'png', 'webp', 'json', 'm4a', 'woff2', 'svg', 'ico', 'webmanifest'] as const;
/** Metadata shipped next to assets but never fetched (voice `.hash`, licence `.txt`). */
export const METADATA_EXTENSIONS = ['hash', 'txt'] as const;
/** AR34: every shipped file ≤ 8 MiB (also the Workbox `maximumFileSizeToCacheInBytes`). */
export const MAX_FILE_BYTES = 8388608;

export const SW_FILE = 'sw.js';
/** dist/ files scanned for absolute URLs (besides `workbox-*.js`). */
export const REQUIRED_DIST_FILES = ['index.html', 'manifest.webmanifest', SW_FILE] as const;
const WORKBOX_RUNTIME = /^workbox-[\w-]+\.js$/;

export interface PrecacheInput {
  /** Paths under public/, relative, `/`-separated. */
  publicFiles: readonly string[];
  /** Every file under dist/ with its size. */
  distFiles: ReadonlyArray<{ path: string; bytes: number }>;
  /** URLs of the sw.js precache manifest; `undefined` when dist/sw.js is missing. */
  manifestUrls: readonly string[] | undefined;
  /** Contents of the dist/ files that must hold no absolute URL (index.html, manifest, sw.js, workbox-*.js). */
  textFiles: ReadonlyArray<{ path: string; text: string }>;
}

export interface PrecacheResult {
  problems: string[];
  /** public/ files with a runtime extension (all of them must be precached). */
  runtimeCount: number;
}

const extensionOf = (path: string): string => {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
};

const normalizeUrl = (url: string): string => {
  let u = url;
  try {
    u = decodeURIComponent(u);
  } catch {
    // keep as is
  }
  return u.replace(/^\.\//, '').replace(/^\//, '');
};

/** Every `url:"…"` (or `"url":"…"`) of the Workbox precache manifest in sw.js. */
export function parseManifestUrls(swJs: string): string[] {
  const urls: string[] = [];
  for (const m of swJs.matchAll(/["']?url["']?\s*:\s*["']([^"']+)["']/g)) {
    if (m[1] !== undefined) urls.push(m[1]);
  }
  return urls;
}

const ABSOLUTE_URL = /https?:\/\//i;
const IMPORT_SCRIPTS_LITERAL = /importScripts\(\s*([^)]*)\)/g;
const STRING_LITERAL = /["'`]([^"'`]*)["'`]/g;
const isRelative = (url: string): boolean => !/^([a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(url);

/** The pure rules (see the header). */
export function checkPrecache(input: PrecacheInput): PrecacheResult {
  const problems: string[] = [];
  const runtime = new Set<string>(RUNTIME_EXTENSIONS);
  const metadata = new Set<string>(METADATA_EXTENSIONS);
  let runtimeCount = 0;

  if (input.manifestUrls === undefined) {
    problems.push(`dist/${SW_FILE} is missing (run vite build)`);
  }
  const precached = new Set((input.manifestUrls ?? []).map(normalizeUrl));

  for (const path of input.publicFiles) {
    const ext = extensionOf(path);
    if (runtime.has(ext)) {
      runtimeCount++;
      if (input.manifestUrls !== undefined && !precached.has(path)) {
        problems.push(`public/${path} is not precached by dist/${SW_FILE}`);
      }
    } else if (!metadata.has(ext)) {
      problems.push(`public/${path}: extension ".${ext}" is neither a runtime type (${RUNTIME_EXTENSIONS.join(', ')}) nor metadata (${METADATA_EXTENSIONS.join(', ')})`);
    }
  }
  for (const file of input.distFiles) {
    if (file.bytes > MAX_FILE_BYTES) problems.push(`dist/${file.path} is ${file.bytes} bytes (> ${MAX_FILE_BYTES})`);
    // Vite-emitted files (assets/index-*.js, *.css, …) must be precached too; the worker files are not.
    const workerFile = file.path === SW_FILE || WORKBOX_RUNTIME.test(file.path);
    if (input.manifestUrls !== undefined && !workerFile && runtime.has(extensionOf(file.path)) && !precached.has(file.path)) {
      problems.push(`dist/${file.path} is not precached by dist/${SW_FILE}`);
    }
  }

  for (const { path, text } of input.textFiles) {
    if (ABSOLUTE_URL.test(text)) problems.push(`dist/${path} contains an absolute http(s):// URL`);
    for (const call of text.matchAll(IMPORT_SCRIPTS_LITERAL)) {
      for (const lit of (call[1] ?? '').matchAll(STRING_LITERAL)) {
        const url = lit[1] ?? '';
        if (!isRelative(url)) problems.push(`dist/${path}: importScripts("${url}") is not a relative URL`);
      }
    }
    if (path === SW_FILE && text.includes('skipWaiting(')) {
      problems.push(`dist/${SW_FILE} calls skipWaiting() (updates must wait for the next cold open)`);
    }
  }
  return { problems, runtimeCount };
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]));
}

const rel = (root: string, file: string): string => relative(root, file).split(sep).join('/');

/** Runs the rules on `<appDir>/public` and `<appDir>/dist`. */
export function run(appDir: string): PrecacheResult & { manifestCount: number } {
  const publicDir = join(appDir, 'public');
  const distDir = join(appDir, 'dist');
  const swPath = join(distDir, SW_FILE);
  const manifestUrls = existsSync(swPath) ? parseManifestUrls(readFileSync(swPath, 'utf8')) : undefined;
  const distFiles = listFiles(distDir).map((f) => ({ path: rel(distDir, f), bytes: statSync(f).size }));
  const textNames = [
    ...REQUIRED_DIST_FILES,
    ...(existsSync(distDir) ? readdirSync(distDir).filter((n) => WORKBOX_RUNTIME.test(n)).sort() : []),
  ];
  const textFiles = textNames.filter((n) => existsSync(join(distDir, n))).map((n) => ({ path: n, text: readFileSync(join(distDir, n), 'utf8') }));
  const result = checkPrecache({
    publicFiles: listFiles(publicDir).map((f) => rel(publicDir, f)),
    distFiles,
    manifestUrls,
    textFiles,
  });
  if (manifestUrls !== undefined) {
    for (const name of REQUIRED_DIST_FILES) {
      if (!existsSync(join(distDir, name))) result.problems.push(`dist/${name} is missing (run vite build)`);
    }
  }
  return { ...result, manifestCount: manifestUrls?.length ?? 0 };
}

function main(): void {
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const result = run(appDir);
  if (result.problems.length > 0) {
    for (const p of result.problems) console.error(`precache: ${p}`);
    console.error(`precache: ${result.problems.length} problem(s)`);
    process.exit(1);
  }
  console.log(
    `precache: OK (${result.runtimeCount} runtime files under public/ all precached; ${result.manifestCount} precache entries; 0 problems)`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
