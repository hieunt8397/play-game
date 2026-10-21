// A polygon tap area registered on a TapRouter (Story 1.5; fires on press through InputGuard, 1.6). The polygon is used exactly as given
// (layout hit polygons are already padded; no extra padding here). Story 2.2: an optional `z` (hit
// priority within the router, default 0; Map decorations use −1 so stations win an overlap).
import { pointInPolygon, type Point } from './polygon';
import type { TapRouter } from './tap-router';

export interface HotspotOptions {
  /** Hit priority within the router (default 0): a higher z wins, then the last registered. */
  readonly z?: number;
}

export class HotspotPolygon {
  private enabledFlag = true;
  private readonly remove: () => void;
  private readonly points: readonly Point[];

  constructor(router: TapRouter, points: readonly Point[], onTap: (p: Point) => void, opts: HotspotOptions = {}) {
    this.points = points.map((p) => ({ x: p.x, y: p.y }));
    this.remove = router.add({
      ...(opts.z !== undefined ? { z: opts.z } : {}),
      contains: (p) => pointInPolygon(p, this.points),
      isEnabled: () => this.enabledFlag,
      onPress: (p) => onTap(p),
    });
  }

  get enabled(): boolean {
    return this.enabledFlag;
  }

  setEnabled(enabled: boolean): this {
    this.enabledFlag = enabled;
    return this;
  }

  /** Unregisters the hotspot; it never fires again. */
  destroy(): void {
    this.enabledFlag = false;
    this.remove();
  }
}
