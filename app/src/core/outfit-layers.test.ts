// Story 8.2: the outfit layers follow the Shiba (frame, position, scale, angle, alpha, visibility, depth order) and a
// missing overlay frame hides its layer with one warning.
import { describe, expect, it, vi } from 'vitest';
import { LAYER_DEPTH_STEP, attachOutfit, outfitFrame, type LayerImage, type LayerScene } from './outfit-layers';

class FakeImage {
  x: number;
  y: number;
  scaleX = 1;
  scaleY = 1;
  angle = 0;
  alpha = 1;
  visible = true;
  depth = 0;
  originX = 0.5;
  originY = 0.5;
  frame: { name: string };
  destroyed = false;
  constructor(x: number, y: number, frame: string) {
    this.x = x;
    this.y = y;
    this.frame = { name: frame };
  }
  setFrame(f: string) {
    this.frame = { name: f };
    // Phaser applies the frame's pivot as the origin.
    this.originX = 0.5;
    this.originY = 0.5;
    return this;
  }
  setOrigin(x: number, y: number) {
    this.originX = x;
    this.originY = y;
    return this;
  }
  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
    return this;
  }
  setScale(x: number, y: number) {
    this.scaleX = x;
    this.scaleY = y;
    return this;
  }
  setAngle(a: number) {
    this.angle = a;
    return this;
  }
  setAlpha(a: number) {
    this.alpha = a;
    return this;
  }
  setVisible(v: boolean) {
    this.visible = v;
    return this;
  }
  setDepth(d: number) {
    this.depth = d;
    return this;
  }
  destroy() {
    this.destroyed = true;
  }
}

function fakeScene(frames: string[]) {
  const handlers = new Map<string, Set<() => void>>();
  const created: FakeImage[] = [];
  const scene: LayerScene = {
    add: {
      image: (x, y, _key, frame) => {
        const img = new FakeImage(x, y, frame ?? '__BASE');
        created.push(img);
        return img as unknown as LayerImage;
      },
    },
    textures: { exists: () => true, get: () => ({ has: (f: string) => frames.includes(f) }) },
    events: {
      on: (e, fn) => handlers.set(e, (handlers.get(e) ?? new Set()).add(fn)),
      off: (e, fn) => handlers.get(e)?.delete(fn),
      once: (e, fn) => handlers.set(e, (handlers.get(e) ?? new Set()).add(fn)),
    },
  };
  const emit = (e: string): void => {
    for (const fn of [...(handlers.get(e) ?? [])]) fn();
  };
  return { scene, created, emit, handlers };
}

const ALL = ['shiba/idle/00', 'shiba/wave/00', ...['crown', 'round-glasses', 'raincoat', 'beanie'].flatMap((id) => [`shiba-${id}/idle/00`, `shiba-${id}/wave/00`])];

describe('outfitFrame', () => {
  it('puts the item after the object name and keeps the state and frame number', () => {
    expect(outfitFrame('shiba/idle/00', 'crown')).toBe('shiba-crown/idle/00');
    expect(outfitFrame('shiba/sneeze/02', 'heart-glasses')).toBe('shiba-heart-glasses/sneeze/02');
  });
});

describe('attachOutfit', () => {
  it('a bare outfit adds no layer; a full one adds shirt < glasses < hat just above the Shiba', () => {
    const { scene, created } = fakeScene(ALL);
    const base = new FakeImage(100, 200, 'shiba/idle/00').setDepth(5).setOrigin(0.3, 0.7);
    expect(attachOutfit(scene, base as unknown as LayerImage, 'atlas.map', {}).images).toHaveLength(0);
    const layers = attachOutfit(scene, base as unknown as LayerImage, 'atlas.map', { hat: 'crown', glasses: 'round-glasses', shirt: 'raincoat' });
    expect(created).toHaveLength(3);
    const [shirt, glasses, hat] = layers.images as unknown as FakeImage[];
    expect([shirt!.frame.name, glasses!.frame.name, hat!.frame.name]).toEqual(['shiba-raincoat/idle/00', 'shiba-round-glasses/idle/00', 'shiba-crown/idle/00']);
    expect(shirt!.depth).toBeCloseTo(5 + LAYER_DEPTH_STEP);
    expect(glasses!.depth).toBeGreaterThan(shirt!.depth);
    expect(hat!.depth).toBeGreaterThan(glasses!.depth);
    for (const l of [shirt!, glasses!, hat!]) expect([l.x, l.y, l.originX, l.originY]).toEqual([100, 200, 0.3, 0.7]);
  });

  it('follows the frame (setFrame keeps the Shiba origin) and, every POST_UPDATE, the position, scale, angle, alpha and visibility', () => {
    const { scene, emit } = fakeScene(ALL);
    const base = new FakeImage(100, 200, 'shiba/idle/00').setOrigin(0.3, 0.7);
    const layers = attachOutfit(scene, base as unknown as LayerImage, 'atlas.map', { hat: 'crown' });
    const hat = layers.images[0] as unknown as FakeImage;
    layers.setFrame('shiba/wave/00');
    expect(base.frame.name).toBe('shiba/wave/00');
    expect([base.originX, base.originY]).toEqual([0.3, 0.7]);
    expect(hat.frame.name).toBe('shiba-crown/wave/00');
    expect([hat.originX, hat.originY]).toEqual([0.3, 0.7]);
    // A tween moves the Shiba (breath, bounce, shake, a mirror's negative scaleX): the layer follows on POST_UPDATE.
    base.setPosition(110, 190).setScale(-0.5, 0.52).setAngle(4).setAlpha(0.8);
    base.frame = { name: 'shiba/idle/00' };
    emit('postupdate');
    expect([hat.x, hat.y, hat.scaleX, hat.scaleY, hat.angle, hat.alpha]).toEqual([110, 190, -0.5, 0.52, 4, 0.8]);
    expect(hat.frame.name).toBe('shiba-crown/idle/00');
    base.setVisible(false);
    emit('postupdate');
    expect(hat.visible).toBe(false);
  });

  it('a missing overlay frame hides that layer with one warning; the others still show', () => {
    const { scene, emit } = fakeScene(ALL);
    const warn = vi.fn();
    const base = new FakeImage(0, 0, 'shiba/grimace/00');
    const layers = attachOutfit(scene, base as unknown as LayerImage, 'atlas.ice-cream', { hat: 'crown' }, warn);
    const hat = layers.images[0] as unknown as FakeImage;
    expect(hat.visible).toBe(false);
    emit('postupdate');
    emit('postupdate');
    expect(warn).toHaveBeenCalledTimes(1);
    layers.setFrame('shiba/idle/00');
    expect(hat.visible).toBe(true);
  });

  it('set swaps, adds and removes layers; destroy (or the scene shutdown) removes them and stops syncing', () => {
    const { scene, emit, handlers } = fakeScene(ALL);
    const base = new FakeImage(0, 0, 'shiba/idle/00');
    const layers = attachOutfit(scene, base as unknown as LayerImage, 'atlas.map', { hat: 'crown' });
    const crown = layers.images[0] as unknown as FakeImage;
    layers.set({ hat: 'beanie', shirt: 'raincoat' });
    expect(crown.destroyed).toBe(true);
    expect((layers.images as unknown as FakeImage[]).map((i) => i.frame.name)).toEqual(['shiba-raincoat/idle/00', 'shiba-beanie/idle/00']);
    layers.set({ shirt: 'raincoat' });
    expect(layers.images).toHaveLength(1);
    const shirt = layers.images[0] as unknown as FakeImage;
    emit('shutdown');
    expect(shirt.destroyed).toBe(true);
    expect(handlers.get('postupdate')?.size ?? 0).toBe(0);
  });
});
