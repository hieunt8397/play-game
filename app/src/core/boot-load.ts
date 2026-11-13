// Boot loading logic (Story 1.2), pure so it is testable in node. Story 1.5 adds `bootTextures`.
// - `nextLoadState`: loading → (error) waiting → (online | retryTick) loading → (complete) ready.
// - `kartTimeScale`: loading-strip kart speed per state (slows while waiting).
// - `waitForReady`: readiness gate = first SW precache (skipped in DEV, with no registration or an
//   active worker; bounded by Timing.swPrecacheTimeoutMs, Story 1.11) + the self-hosted Baloo 2 font.
// - `createBootLoader`: the load loop (dispatch / attempt / gate) over a Phaser adapter (Story 1.11).
import { AUDIO_CATALOG, AUDIO_IDS } from "../content/audio-catalog";
import { ATLAS_DIR, ATLASES, BACKGROUNDS } from "../content/assets";
import { VOICE_LINES, voicePath } from "../content/voice-lines";
import type { SwRegistrationLike } from "./sw";
import { Timing } from "./timing";

/** Shell voice lines (greeting, …) load with the catalog; game lines load with their game. */
export const SHELL_VOICE_PREFIX = "vo.shell.";

/** Catalog ids Boot loads (Story 1.8): shell SFX and music; game-scoped SFX load with their game. */
export const SHELL_AUDIO_PREFIXES = ["sfx.shell.", "music."] as const;

/** True for a catalog id Boot loads. */
export function isBootAudioId(id: string): boolean {
  return SHELL_AUDIO_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/** Audio cache key → URL of everything Boot loads (shell SFX, music + shell voice lines by id). */
export function bootAudio(): ReadonlyArray<readonly [string, string]> {
  return [
    ...AUDIO_IDS.filter(isBootAudioId).map((id) => [id, AUDIO_CATALOG[id].path] as const),
    ...VOICE_LINES.filter((line) => line.id.startsWith(SHELL_VOICE_PREFIX)).map(
      (line) => [line.id, voicePath(line.id)] as const,
    ),
  ];
}

/** One texture Boot loads (Story 1.5: the Map atlas and plate). */
export type TextureLoad =
  | { readonly kind: "atlas"; readonly key: string; readonly png: string; readonly json: string }
  /** 2026-11-13: the map atlas spans pages (the rides' heading frames): one multiatlas JSON, pages under `path`. */
  | { readonly kind: "multiatlas"; readonly key: string; readonly json: string; readonly path: string }
  | { readonly kind: "image"; readonly key: string; readonly path: string };

/** Textures Boot loads: `atlas.map` (`load.atlas`) and `bg.map` (`load.image`). Map keeps them for the session. */
export function bootTextures(): readonly TextureLoad[] {
  const atlas = ATLASES.map;
  const bg = BACKGROUNDS.map;
  return [
    atlas.pages !== undefined && atlas.pages > 1
      ? { kind: "multiatlas", key: atlas.key, json: atlas.json, path: ATLAS_DIR }
      : { kind: "atlas", key: atlas.key, png: atlas.png, json: atlas.json },
    { kind: "image", key: bg.key, path: bg.path },
  ];
}

export type LoadState = "loading" | "waiting" | "ready";
export type LoadEvent = "error" | "online" | "retryTick" | "complete";

export function nextLoadState(state: LoadState, event: LoadEvent): LoadState {
  if (state === "ready") return "ready";
  if (event === "complete") return "ready";
  if (event === "error") return "waiting";
  // online / retryTick: a waiting load retries; a running load keeps going.
  return "loading";
}

/** Kart tween time-scale for a load state (EXPERIENCE: failed load → kart slows and waits). */
export function kartTimeScale(state: LoadState): number {
  return state === "waiting" ? Timing.loadingKartWaitTimeScale : 1;
}

export const FONT_FAMILY = "Baloo 2";
/** Relative URL: works with Vite `base: './'` (resolved against the document). */
export const FONT_URL = "assets/fonts/Baloo2-wght.woff2";
/** Weight axis range of the vendored variable font. */
export const FONT_WEIGHT_RANGE = "400 800";
/** What the gate waits for: the station-label weight/size (DESIGN typography). */
export const FONT_PROBE = "600 18px 'Baloo 2'";

export interface FontFaceLike {
  load(): Promise<unknown>;
}

export interface FontSetLike {
  add(face: FontFaceLike): unknown;
  delete(face: FontFaceLike): unknown;
  load(font: string): Promise<readonly unknown[]>;
}

export interface ReadyDeps {
  /** `swRegistration()` from core/sw.ts: `undefined` in DEV, unsupported or when registration failed. */
  registration: Promise<SwRegistrationLike | undefined>;
  /** `navigator.serviceWorker.ready`: resolves once a worker is active (its precache finished). */
  ready: Promise<unknown>;
  /** Resolves after `ms` (Boot: scene clock `time.delayedCall`). */
  sleep: (ms: number) => Promise<void>;
  /** `document.fonts`. */
  fonts: FontSetLike;
  /** `(family, source, descriptors) => new FontFace(...)`. */
  fontFace: (
    family: string,
    source: string,
    descriptors: { weight: string },
  ) => FontFaceLike;
}

/**
 * Resolves when the app may show `button-play`; rejects (caller retries) when the font fails.
 * SW step (Story 1.11): with no registration, or an already active worker (precache done, possibly
 * an update installing in the background), it is skipped. Otherwise it waits for the first precache
 * (`ready`) at most `Timing.swPrecacheTimeoutMs`, then warns once and continues online. It never
 * rejects for the service worker. `skipSw` skips the SW step (see `createReadinessGate`).
 */
export async function waitForReady(
  deps: ReadyDeps,
  options: { skipSw?: boolean } = {},
): Promise<void> {
  const reg = options.skipSw ? undefined : await deps.registration.catch(() => undefined);
  if (reg && !reg.active) {
    const result = await Promise.race([
      deps.ready.then(
        () => "ok" as const,
        () => "ok" as const,
      ),
      deps.sleep(Timing.swPrecacheTimeoutMs).then(() => "timeout" as const),
    ]);
    if (result === "timeout") {
      console.warn("boot: precache not finished — continuing online");
    }
  }
  // A failed FontFace stays failed, so every attempt registers a fresh one.
  const face = deps.fontFace(FONT_FAMILY, `url(${FONT_URL})`, {
    weight: FONT_WEIGHT_RANGE,
  });
  deps.fonts.add(face);
  try {
    await face.load();
    const faces = await deps.fonts.load(FONT_PROBE);
    if (faces.length === 0) throw new Error(`font ${FONT_PROBE} did not load`);
  } catch (error) {
    deps.fonts.delete(face);
    throw error;
  }
}

/**
 * Boot's gate: `waitForReady` whose SW step runs at most once per Boot. A retry (e.g. after a font
 * failure) goes straight to the font, so a stuck first install costs one timeout and one warn.
 */
export function createReadinessGate(deps: ReadyDeps): () => Promise<void> {
  let swStepDone = false;
  return () => {
    const skipSw = swStepDone;
    swStepDone = true;
    return waitForReady(deps, { skipSw });
  };
}

/** A file the loader could not load: its cache key and URL. */
export interface FailedFile {
  readonly key: string;
  readonly src?: string;
}

/** Phaser side of the Boot load loop (Story 1.11: spec-1-2's Boot.dispatch/attempt/gate moved to core). */
export interface BootLoaderAdapter<T> {
  /** Items of the load list not yet in the caches. */
  missing(): readonly T[];
  /** Queues and starts the loads; `done` gets the files that failed (empty = all loaded). */
  loadAll(list: readonly T[], done: (failed: readonly FailedFile[]) => void): void;
  /** The readiness gate (`waitForReady`). */
  gate(): Promise<void>;
  /** Loading-strip kart speed (`kartTimeScale`). */
  setTimeScale(scale: number): void;
  /** Called once, when the state reaches `ready` (Boot: launch AudioUnlockOverlay, then start Start). */
  onReady(): void;
}

export interface BootLoader {
  readonly state: LoadState;
  dispatch(event: LoadEvent): void;
  /** The first attempt (Boot `create`). */
  start(): void;
}

/**
 * The Boot load loop: `nextLoadState` drives it; every entry into `loading` runs one attempt (load the
 * missing items, then the gate). A failed file or gate → `waiting` (kart slows); `online`/`retryTick`
 * → a new attempt; the gate resolving → `ready` → `onReady()` once. Errors go only to console.warn.
 */
export function createBootLoader<T>(adapter: BootLoaderAdapter<T>): BootLoader {
  let state: LoadState = "loading";

  const gate = (): void => {
    adapter.gate().then(
      () => dispatch("complete"),
      (error: unknown) => {
        console.warn("boot: readiness gate failed — retrying", error);
        dispatch("error");
      },
    );
  };

  const attempt = (): void => {
    const missing = adapter.missing();
    if (missing.length === 0) {
      gate();
      return;
    }
    adapter.loadAll(missing, (failed) => {
      for (const file of failed) console.warn(`boot: failed to load "${file.key}"`, file.src);
      if (failed.length > 0) dispatch("error");
      else gate();
    });
  };

  const dispatch = (event: LoadEvent): void => {
    const prev = state;
    const next = nextLoadState(prev, event);
    if (next === prev) return;
    state = next;
    adapter.setTimeScale(kartTimeScale(next));
    if (next === "ready") adapter.onReady();
    else if (next === "loading") attempt();
  };

  return {
    get state() {
      return state;
    },
    dispatch,
    start: attempt,
  };
}
