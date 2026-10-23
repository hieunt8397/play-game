// The yard (Story 7.1), pure: the plan of what scenes/HomeYard draws and the corner-tap controller.
// Nothing here touches Phaser, timers or tweens (the controller moves only on `tick`), so Vitest covers it.
//
// planYard: like core/map-plan for the island stations — each corner's full-frame image
// `<corner>/idle/00` at anchors[<corner>] (origin anchor/design, scale 1/renderScale, so a bounce scales
// around the ground pivot), its hit polygon exactly as stored, its static parent label under the anchor
// (clamped inside the safe rect) and depth = anchor y. A missing frame skips the image (the hotspot and the
// label stay); a missing anchor or hit skips the corner; both warn.
//
// YardController (mirrors core/kart-trip without the drive):
//   idle → (awake tap) opening [Timing.stationTapMs, and the game's assets settled] → entering → (woke) idle
//   - awake tap while idle: bounce, say + setPrompt the corner name, `load` its game (once per visit);
//     while opening: another awake corner re-targets (its own load), the same one only bounces + says;
//   - sleeping tap (idle or opening): bounce + the happy sound, nothing opens;
//   - `enter` is emitted once, when the bounce time has passed and `assetsSettled(gameId)` was seen
//     (either order); the scene then zooms on the corner and asks Map to open the game (`yard:open`);
//   - entering ignores every tap; `handedOff()` (Map slept the yard to start the game) hands that game's
//     assets to Map; `woke()` (the yard is back, or its open was not taken) returns to idle and `shutdown()`
//     ends: both `release` every game the yard loaded and did not hand off (a re-targeted corner, an ignored open);
//   - Home (`home()`, the Hud in 'yard' mode): `leave` once, only while idle (not while a corner opens or enters).
import type { CornerId, YardCornerState } from '../content/home';
import type { Point, ScreenLayout } from '../content/layout-types';
import { estimateLabelSize, labelPosition, type PlannedImage, type Size } from './map-plan';
import { MAX_TICK_MS } from './map-idle';
import type { Rect } from './safe-rect';
import { Tokens } from './tokens';

export const SFX_HAPPY = 'sfx.shell.happy';

export interface PlannedCorner {
  readonly id: CornerId;
  readonly gameId: string;
  readonly label: string;
  readonly awake: boolean;
  readonly anchor: Point;
  /** Undefined when the frame is missing from the atlas. */
  readonly image: PlannedImage | undefined;
  readonly hit: readonly Point[];
  /** Label: centre x, top y. */
  readonly labelPos: Point;
  readonly depth: number;
}

export interface YardPlan {
  readonly bg: { readonly x: number; readonly y: number; readonly scale: number; readonly depth: number };
  /** Back to front (depth order) — also the hotspot registration order (front wins). */
  readonly corners: readonly PlannedCorner[];
  readonly labelDepth: number;
  readonly warnings: readonly string[];
}

export interface YardPlanOptions {
  readonly measureLabel?: (label: string) => Size;
  readonly safeRect?: Rect;
  readonly labelGap?: number;
  readonly atlasKey?: string;
}

export function planYard(
  layout: ScreenLayout,
  corners: readonly YardCornerState[],
  hasFrame: (frame: string) => boolean,
  opts: YardPlanOptions = {},
): YardPlan {
  const measure = opts.measureLabel ?? estimateLabelSize;
  const safe = opts.safeRect ?? Tokens.safeRect;
  const gap = opts.labelGap ?? Tokens.spacing['1'];
  const atlas = opts.atlasKey ?? 'atlas';
  const warnings: string[] = [];
  const planned: PlannedCorner[] = [];
  for (const c of corners) {
    const anchor = layout.anchors[c.id];
    const hit = layout.hits[c.id];
    if (!anchor || !hit) {
      warnings.push(`yard: corner "${c.id}" is missing from the layout (${!anchor ? 'anchors' : 'hits'}) — skipped`);
      continue;
    }
    const frame = `${c.id}/idle/00`;
    const image: PlannedImage | undefined = hasFrame(frame)
      ? { frame, x: anchor.x, y: anchor.y, originX: anchor.x / layout.design.width, originY: anchor.y / layout.design.height, scale: 1 / layout.renderScale }
      : undefined;
    if (!image) warnings.push(`yard: frame "${frame}" is missing from ${atlas} — image skipped`);
    planned.push({
      id: c.id,
      gameId: c.gameId,
      label: c.label,
      awake: c.awake,
      anchor,
      image,
      hit,
      labelPos: labelPosition(anchor, measure(c.label), safe, gap),
      depth: anchor.y,
    });
  }
  planned.sort((a, b) => a.depth - b.depth);
  const maxDepth = Math.max(layout.design.height, ...planned.map((c) => c.depth));
  return {
    bg: { x: 0, y: 0, scale: 1 / layout.renderScale, depth: -1 },
    corners: planned,
    labelDepth: maxDepth + 1,
    warnings,
  };
}

export type YardCommand =
  | { readonly kind: 'bounce'; readonly target: CornerId }
  | { readonly kind: 'say'; readonly lineId: string }
  | { readonly kind: 'setPrompt'; readonly lineId: string }
  | { readonly kind: 'sfx'; readonly id: string }
  | { readonly kind: 'load'; readonly gameId: string }
  | { readonly kind: 'enter'; readonly corner: CornerId; readonly gameId: string }
  | { readonly kind: 'leave' }
  /** Drop the cache entries of a game the yard loaded but Map did not take. */
  | { readonly kind: 'release'; readonly gameId: string };

export type YardState = 'idle' | 'opening' | 'entering' | 'left';

export interface YardControllerOptions {
  readonly corners: readonly { readonly id: CornerId; readonly gameId: string; readonly awake: boolean }[];
  /** The name line of a corner (content/home › cornerNameLine). */
  readonly nameLine: (id: CornerId) => string;
  /** The bounce time before the game may open (default Timing.stationTapMs, like a station tap). */
  readonly departMs?: number;
}

export class YardController {
  private _state: YardState = 'idle';
  private _target: CornerId | undefined;
  private departLeft = 0;
  private readonly loaded = new Set<string>();
  private readonly settled = new Set<string>();
  private readonly opts: YardControllerOptions;

  constructor(opts: YardControllerOptions) {
    this.opts = opts;
  }

  get state(): YardState {
    return this._state;
  }

  get target(): CornerId | undefined {
    return this._target;
  }

  private corner(id: CornerId): YardControllerOptions['corners'][number] | undefined {
    return this.opts.corners.find((c) => c.id === id);
  }

  tapCorner(id: CornerId): YardCommand[] {
    if (this._state === 'entering' || this._state === 'left') return [];
    const c = this.corner(id);
    if (!c) return [];
    if (!c.awake) return [{ kind: 'bounce', target: id }, { kind: 'sfx', id: SFX_HAPPY }];
    const line = this.opts.nameLine(id);
    const out: YardCommand[] = [{ kind: 'bounce', target: id }, { kind: 'say', lineId: line }];
    if (this._state === 'opening' && id === this._target) return out;
    out.push({ kind: 'setPrompt', lineId: line });
    if (!this.loaded.has(c.gameId)) {
      this.loaded.add(c.gameId);
      out.push({ kind: 'load', gameId: c.gameId });
    }
    this._target = id;
    if (this._state === 'idle') {
      this._state = 'opening';
      this.departLeft = this.opts.departMs ?? Tokens.Timing.stationTapMs;
    }
    out.push(...this.maybeEnter());
    return out;
  }

  tick(deltaMs: number): YardCommand[] {
    if (this._state !== 'opening') return [];
    const d = Math.min(MAX_TICK_MS, Math.max(0, Number.isFinite(deltaMs) ? deltaMs : 0));
    this.departLeft -= d;
    return this.maybeEnter();
  }

  /** The game's assets are cached (or failed: the existing load-error path, the game starts without them). */
  assetsSettled(gameId: string): YardCommand[] {
    this.settled.add(gameId);
    return this.maybeEnter();
  }

  /** Home in the yard: back to the island (once; not while a corner's game is opening or entering). */
  home(): YardCommand[] {
    if (this._state !== 'idle') return [];
    this._state = 'left';
    this._target = undefined;
    return [{ kind: 'leave' }];
  }

  /**
   * Map took the entering corner's game (it slept the yard to start it): Map owns those assets now and
   * releases them when the game shuts down, so the yard no longer does.
   */
  handedOff(): void {
    if (this._state !== 'entering' || this._target === undefined) return;
    const c = this.corner(this._target);
    if (c) this.loaded.delete(c.gameId);
  }

  /**
   * The yard is back after its game, or its `yard:open` was not taken (the open guard): idle. Every game the
   * yard loaded and did not hand to Map (a re-targeted corner, an ignored open) is released; every asset
   * reloads next time.
   */
  woke(): YardCommand[] {
    this._state = 'idle';
    this._target = undefined;
    this.departLeft = 0;
    return this.releaseAll();
  }

  /** The yard shuts down: release whatever it loaded and did not hand to Map. */
  shutdown(): YardCommand[] {
    this._state = 'left';
    this._target = undefined;
    return this.releaseAll();
  }

  private releaseAll(): YardCommand[] {
    const out: YardCommand[] = [...this.loaded].map((gameId) => ({ kind: 'release', gameId }));
    this.loaded.clear();
    this.settled.clear();
    return out;
  }

  private maybeEnter(): YardCommand[] {
    if (this._state !== 'opening' || this.departLeft > 0 || this._target === undefined) return [];
    const c = this.corner(this._target);
    if (!c || !this.settled.has(c.gameId)) return [];
    this._state = 'entering';
    return [{ kind: 'enter', corner: c.id, gameId: c.gameId }];
  }
}
