// The island guide Shiba (Story 5.2, FR34), pure. Map turns its commands into Phaser calls:
//   - `enter()` on Map `create`: the first call of a session greets — a wave, "Xoài ơi, chơi gì nào?"
//     once, and the greeting as the Speaker prompt when the island has none — and marks the session;
//     every later entry (create again, a wake from a game) returns nothing;
//   - `invite()` with each idle invitation (core/map-idle `invite`): a wave beside the ring and bob;
//   - `tap({ blocked })`: a bounce and a small "gâu", or nothing while the post-round chain runs or
//     the kart is not parked.
// `waveFrame` picks the frame of a running wave from its elapsed time (scene `time`).
import { MAP_GUIDE } from '../content/assets';
import { Tokens } from './tokens';

export const GUIDE_GREETING = 'vo.shell.greeting';
export const GUIDE_WOOF = 'sfx.shell.woof';

export type GuideCommand =
  | { readonly kind: 'wave' }
  | { readonly kind: 'say'; readonly lineId: string }
  | { readonly kind: 'setPrompt'; readonly lineId: string }
  | { readonly kind: 'bounce' }
  | { readonly kind: 'sfx'; readonly id: string };

export interface MapGuideDeps {
  /** Whether this session already greeted (SessionStore.guideGreeted). */
  greeted(): boolean;
  markGreeted(): void;
}

export interface MapGuide {
  /** Map entry; `hasPrompt` = the island already has a Speaker prompt (islandPrompt). */
  enter(opts?: { readonly hasPrompt?: boolean }): GuideCommand[];
  invite(): GuideCommand[];
  tap(opts: { readonly blocked: boolean }): GuideCommand[];
}

export function createMapGuide(deps: MapGuideDeps): MapGuide {
  return {
    enter(opts = {}) {
      if (deps.greeted()) return [];
      deps.markGreeted();
      const cmds: GuideCommand[] = [{ kind: 'wave' }, { kind: 'say', lineId: GUIDE_GREETING }];
      if (!opts.hasPrompt) cmds.push({ kind: 'setPrompt', lineId: GUIDE_GREETING });
      return cmds;
    },
    invite() {
      return [{ kind: 'wave' }];
    },
    tap({ blocked }) {
      if (blocked) return [];
      return [{ kind: 'bounce' }, { kind: 'sfx', id: GUIDE_WOOF }];
    },
  };
}

/**
 * The frame of a wave `elapsedMs` after it started, or undefined once Timing.guideWaveMs has passed
 * (back to idle). Each frame shows Timing.guideWaveFrameMs, cycling over `frames`. Under reduced motion
 * the wave holds its first frame. A new wave restarts from frame 00 (the caller resets the clock).
 */
export function waveFrame(
  elapsedMs: number,
  reduced: boolean,
  frames: readonly string[] = MAP_GUIDE.wave,
): string | undefined {
  const t = Tokens.Timing;
  if (frames.length === 0 || elapsedMs < 0 || elapsedMs >= t.guideWaveMs) return undefined;
  if (reduced) return frames[0];
  return frames[Math.floor(elapsedMs / t.guideWaveFrameMs) % frames.length];
}
