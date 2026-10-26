// Story 8.2: Shiba's outfit layers. Every outfit item is an overlay sprite rendered alone, for every Shiba frame of a
// screen, with the same camera and full frame (tools/render/blender/outfit.py): `shiba-<item>/<state>/<nn>` mirrors
// `shiba/<state>/<nn>`. Phaser keeps the full-frame origin for trimmed frames, so the overlay drawn on the Shiba's own
// position and origin lines up with it pixel for pixel.
// `attachOutfit` adds one image per worn slot just above the Shiba (depth shirt < glasses < hat) and keeps each one
// on the Shiba every frame (the scene's POST_UPDATE, after tweens and timers, before render): frame, position, scale
// (breath, bounce, the shiver shake, a negative scaleX for a mirror), angle, alpha and visibility. A missing overlay
// frame hides that layer with one console.warn per frame; the bare Shiba still works.
// `setFrame` is the one way a scene changes the Shiba's frame: it sets the frame, puts the origin back (setFrame
// applies the atlas pivot) and syncs the layers at once.
import type { GameObjects, Scene } from 'phaser';
import { SLOTS, overlayFrame, type Outfit, type OutfitSlot } from '../content/games/dress-up';

/** Pure: the overlay frame of `itemId` over the base frame `baseFrame` (`shiba/idle/00` → `shiba-crown/idle/00`). */
export function outfitFrame(baseFrame: string, itemId: string): string {
  return overlayFrame(baseFrame, itemId);
}

/** The draw order step between the Shiba and its layers (shirt +1, glasses +2, hat +3 steps). */
export const LAYER_DEPTH_STEP = 0.001;

/** What the layers need from a Phaser image (the Shiba or its overlays). */
export type LayerImage = Pick<
  GameObjects.Image,
  'x' | 'y' | 'scaleX' | 'scaleY' | 'angle' | 'alpha' | 'visible' | 'depth' | 'originX' | 'originY' | 'frame' | 'setFrame' | 'setOrigin' | 'setPosition' | 'setScale' | 'setAngle' | 'setAlpha' | 'setVisible' | 'setDepth' | 'destroy'
>;

/** What the layers need from a Phaser scene. */
export interface LayerScene {
  readonly add: { image(x: number, y: number, key: string, frame?: string): LayerImage };
  readonly textures: { exists(key: string): boolean; get(key: string): { has(frame: string): boolean } };
  readonly events: {
    on(event: string, fn: () => void, ctx?: unknown): unknown;
    off(event: string, fn: () => void, ctx?: unknown): unknown;
    once(event: string, fn: () => void, ctx?: unknown): unknown;
  };
}

export interface OutfitLayers {
  /** Sets the Shiba's frame (origin kept) and syncs every layer now. */
  setFrame(frame: string): void;
  /** Changes what Shiba wears (layers are added, swapped or removed) and syncs. */
  set(outfit: Outfit): void;
  /** Copies the Shiba's frame, position, scale, angle, alpha and visibility onto every layer (done every POST_UPDATE). */
  sync(): void;
  /** The current layer images, back to front. */
  readonly images: readonly LayerImage[];
  destroy(): void;
}

const POST_UPDATE = 'postupdate';
const SHUTDOWN = 'shutdown';

export function attachOutfit(scene: Scene | LayerScene, base: LayerImage, atlasKey: string, outfit: Outfit, warn: (msg: string) => void = (m) => console.warn(m)): OutfitLayers {
  const s = scene as LayerScene;
  const layers = new Map<OutfitSlot, { id: string; image: LayerImage }>();
  const warned = new Set<string>();
  let alive = true;

  const hasFrame = (frame: string): boolean => s.textures.exists(atlasKey) && s.textures.get(atlasKey).has(frame);

  const syncOne = (slot: OutfitSlot, layer: { id: string; image: LayerImage }): void => {
    const img = layer.image;
    const frame = outfitFrame(base.frame.name, layer.id);
    if (!hasFrame(frame)) {
      img.setVisible(false);
      if (!warned.has(frame)) {
        warned.add(frame);
        warn(`outfit: frame "${frame}" is missing from "${atlasKey}" — that layer is hidden`);
      }
      return;
    }
    if (img.frame.name !== frame) img.setFrame(frame);
    img.setOrigin(base.originX, base.originY);
    img.setPosition(base.x, base.y);
    img.setScale(base.scaleX, base.scaleY);
    img.setAngle(base.angle);
    img.setAlpha(base.alpha);
    img.setVisible(base.visible);
    img.setDepth(base.depth + LAYER_DEPTH_STEP * (SLOTS.indexOf(slot) + 1));
  };

  const sync = (): void => {
    if (!alive) return;
    for (const [slot, layer] of layers) syncOne(slot, layer);
  };

  const set = (next: Outfit): void => {
    if (!alive) return;
    for (const slot of SLOTS) {
      const id = next[slot];
      const have = layers.get(slot);
      if (have && have.id === id) continue;
      have?.image.destroy();
      layers.delete(slot);
      if (id === undefined) continue;
      const frame = outfitFrame(base.frame.name, id);
      const image = s.add.image(base.x, base.y, atlasKey, hasFrame(frame) ? frame : undefined);
      layers.set(slot, { id, image });
    }
    sync();
  };

  const destroy = (): void => {
    if (!alive) return;
    for (const { image } of layers.values()) image.destroy();
    layers.clear();
    alive = false;
    s.events.off(POST_UPDATE, sync);
  };

  s.events.on(POST_UPDATE, sync);
  s.events.once(SHUTDOWN, destroy);
  set(outfit);

  return {
    setFrame(frame) {
      const { originX, originY } = base;
      base.setFrame(frame);
      base.setOrigin(originX, originY);
      sync();
    },
    set,
    sync,
    get images() {
      return SLOTS.flatMap((slot) => {
        const l = layers.get(slot);
        return l ? [l.image] : [];
      });
    },
    destroy,
  };
}
