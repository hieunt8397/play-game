// Game asset loading (Story 1.7), pure. Map loads a game's registry `assets` while the kart drives
// (its own loader: `load.atlas` / `load.image` (Story 1.8) / `load.audio`, then `load.start()`), feeds the loader's
// `filecomplete` / `loaderror` keys to an AssetTracker, and enters once the game is settled. When the
// game scene shuts down Map removes the game's keys again (AR39). Boot keys (atlas.map, bg.map, the
// catalog and the shell voice lines) are never part of a game's assets.
import type { GameAssets } from '../content/games/types';
import { AUDIO_CATALOG, isAudioId } from '../content/audio-catalog';
import { isVoiceLineId, voicePath } from '../content/voice-lines';

export type CacheKind = 'texture' | 'audio';

export type LoadCall =
  | { readonly kind: 'atlas'; readonly key: string; readonly png: string; readonly json: string }
  /** Story 3.3: a multi-page atlas (Phaser multiatlas JSON; its pages load from `path`). */
  | { readonly kind: 'multiatlas'; readonly key: string; readonly json: string; readonly path: string }
  | { readonly kind: 'image'; readonly key: string; readonly url: string }
  | { readonly kind: 'audio'; readonly key: string; readonly url: string };

export interface ReleaseCall {
  readonly kind: CacheKind;
  readonly key: string;
}

/** URL of an audio id: a voice line's file or the catalog path; undefined for an unknown id. */
export function audioUrl(id: string): string | undefined {
  if (isVoiceLineId(id)) return voicePath(id);
  if (isAudioId(id)) return AUDIO_CATALOG[id].path;
  return undefined;
}

/** The loader calls for `assets`, skipping keys already cached (and unknown audio ids, which validate:content reports). */
export function loadPlan(assets: GameAssets, isCached: (kind: CacheKind, key: string) => boolean): LoadCall[] {
  const calls: LoadCall[] = [];
  const seen = new Set<string>();
  for (const a of assets.atlases) {
    if (seen.has(a.key) || isCached('texture', a.key)) continue;
    seen.add(a.key);
    if (a.pages !== undefined && a.pages > 1) calls.push({ kind: 'multiatlas', key: a.key, json: a.json, path: a.json.slice(0, a.json.lastIndexOf('/') + 1) });
    else calls.push({ kind: 'atlas', key: a.key, png: a.png, json: a.json });
  }
  for (const img of assets.images ?? []) {
    if (seen.has(img.key) || isCached('texture', img.key)) continue;
    seen.add(img.key);
    calls.push({ kind: 'image', key: img.key, url: img.path });
  }
  for (const id of assets.audio) {
    const url = audioUrl(id);
    if (!url || seen.has(id) || isCached('audio', id)) continue;
    seen.add(id);
    calls.push({ kind: 'audio', key: id, url });
  }
  return calls;
}

/** The cache entries Map removes when the game shuts down. */
export function releasePlan(assets: GameAssets): ReleaseCall[] {
  return [
    ...assets.atlases.map((a) => ({ kind: 'texture' as const, key: a.key })),
    ...(assets.images ?? []).map((img) => ({ kind: 'texture' as const, key: img.key })),
    ...assets.audio.filter((id) => audioUrl(id) !== undefined).map((id) => ({ kind: 'audio' as const, key: id })),
  ];
}

/**
 * Tracks which games' files are done. A game is settled once every key it waits for was reported
 * complete or failed (`fileDone`); a game tracked with no keys is settled at once.
 */
export class AssetTracker {
  private readonly pending = new Map<string, Set<string>>();
  private settled: string[] = [];

  /** Starts (or restarts) tracking `id` waiting for `keys`. */
  track(id: string, keys: readonly string[]): void {
    const set = new Set(keys);
    if (set.size === 0) {
      this.pending.delete(id);
      this.settle(id);
      return;
    }
    this.pending.set(id, set);
  }

  /** A file finished (completed or failed); every game waiting for it is updated. */
  fileDone(key: string): void {
    for (const [id, keys] of [...this.pending]) {
      if (!keys.delete(key) || keys.size > 0) continue;
      this.pending.delete(id);
      this.settle(id);
    }
  }

  /**
   * The loader finished its queue (`complete`): every key still pending will never report (a file
   * that downloaded but failed processing emits neither filecomplete nor loaderror). Settles every
   * waiting game and returns the flushed keys (for one warning each).
   */
  flushPending(): string[] {
    const keys = new Set<string>();
    for (const [id, pending] of [...this.pending]) {
      for (const k of pending) keys.add(k);
      this.pending.delete(id);
      this.settle(id);
    }
    return [...keys];
  }

  /** Games settled since the last drain, in order. */
  drainSettled(): string[] {
    const out = this.settled;
    this.settled = [];
    return out;
  }

  private settle(id: string): void {
    if (!this.settled.includes(id)) this.settled.push(id);
  }
}
