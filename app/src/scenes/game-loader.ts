// Story 7.1: a shell scene's game-asset loading, shared by HomeYard (a yard corner's game loads on the
// yard's own loader while the corner bounces — the sleeping Map's loader would not advance its queue).
// Same contract as Map's (Story 1.7, AR51): core/game-assets plans the calls and tracks the keys; a file
// that fails (or downloads but fails processing) is settled with a warning and the game starts without it.
// The cache entries are global: Map releases them when the game's scene shuts down; the yard releases a game it
// loaded and Map did not take (`releaseAssets`).
import type { Scene } from 'phaser';
import type { GameAssets } from '../content/games/types';
import { loadPlan, releasePlan, type AssetTracker } from '../core/game-assets';

const FILE_COMPLETE = 'filecomplete';
const LOAD_ERROR = 'loaderror';
const LOAD_COMPLETE = 'complete';

/** Feeds the scene loader's events into `tracker`; returns the unsubscribe function. */
export function wireLoader(scene: Scene, tracker: AssetTracker, tag: string): () => void {
  const onFile = (key: string): void => tracker.fileDone(key);
  const onError = (file: { key: string; src?: string }): void => {
    console.warn(`${tag}: failed to load "${file.key}" — the game starts without it`, file.src);
    tracker.fileDone(file.key);
  };
  const onComplete = (): void => {
    for (const key of tracker.flushPending()) console.warn(`${tag}: "${key}" did not load — the game starts without it`);
  };
  scene.load.on(FILE_COMPLETE, onFile);
  scene.load.on(LOAD_ERROR, onError);
  scene.load.on(LOAD_COMPLETE, onComplete);
  return () => {
    scene.load.off(FILE_COMPLETE, onFile);
    scene.load.off(LOAD_ERROR, onError);
    scene.load.off(LOAD_COMPLETE, onComplete);
  };
}

/** Drops the cache entries of `assets` (core/game-assets › releasePlan), as Map does on a game's shutdown. */
export function releaseAssets(scene: Scene, assets: GameAssets | undefined): void {
  if (!assets) return;
  for (const r of releasePlan(assets)) {
    if (r.kind === 'texture') {
      if (scene.textures.exists(r.key)) scene.textures.remove(r.key);
    } else {
      scene.cache.audio.remove(r.key);
    }
  }
}

/** Queues `assets` (skipping cached keys) under `id` in `tracker` and starts the loader; no assets → settled at once. */
export function queueLoad(scene: Scene, tracker: AssetTracker, id: string, assets: GameAssets | undefined): void {
  if (!assets) {
    tracker.track(id, []);
    return;
  }
  const calls = loadPlan(assets, (kind, key) => (kind === 'texture' ? scene.textures.exists(key) : scene.cache.audio.exists(key)));
  tracker.track(id, calls.map((c) => c.key));
  if (calls.length === 0) return;
  for (const c of calls) {
    if (c.kind === 'atlas') scene.load.atlas(c.key, c.png, c.json);
    else if (c.kind === 'multiatlas') scene.load.multiatlas(c.key, c.json, c.path);
    else if (c.kind === 'image') scene.load.image(c.key, c.url);
    else scene.load.audio(c.key, c.url);
  }
  scene.load.start();
}
