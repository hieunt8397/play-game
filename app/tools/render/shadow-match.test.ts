// Story 3.5: the shadow-match screen in the image pipeline — the builder's parameters and `--items`, the
// derived shadow frames (silhouetteFrame / addSilhouetteFrames), and the real layout against its rules.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ITEM_IDS } from '../../src/content/games/shadow-match.ts';
import { Tokens } from '../../src/core/tokens.ts';
import { frameTrimRect } from '../atlas/pack.ts';
import { atlasFrames } from '../layout/rules.ts';
import type { RawProjection } from '../layout/to-layout.ts';
import { screenSpec } from './blender.ts';
import { buildParams } from './build.ts';
import { silhouetteFrame, silhouetteRgb } from './ghost.ts';
import { FRAME_RULE_SCREENS, SCREEN_RULES, SCREEN_SEPARATE, addSilhouetteFrames, layoutPath } from './render.ts';

/** A 32×24 RGBA frame: an opaque orange block with a soft (alpha 100) fringe. */
async function colourFrame(): Promise<Buffer> {
  const w = 32;
  const h = 24;
  const raw = Buffer.alloc(w * h * 4);
  for (let y = 5; y < 19; y++) {
    for (let x = 6; x < 26; x++) {
      const i = (y * w + x) * 4;
      const edge = y === 5 || y === 18 || x === 6 || x === 25;
      raw[i] = 255;
      raw[i + 1] = 140;
      raw[i + 2] = 40;
      raw[i + 3] = edge ? 100 : 255;
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

describe('shadow-match screen (Story 3.5)', () => {
  it('a known screen built from the island by its own builder; the builder gets the sizes and the slot rows', () => {
    expect(screenSpec('shadow-match')).toEqual({ id: 'shadow-match', source: 'art/src/map-v3.blend', builder: 'build_shadow_match.py' });
    const p = buildParams();
    expect(p.shadowMatch).toEqual({ trikeSizePx: 300, itemPx: 150, counts: [2, 3, 4] });
    expect(p.art.shadowMatch).toEqual({ caveInner: '#F6EEDC' });
    expect(p.colours).toMatchObject({ caveMouth: '#E9D8B4', shadowTarget: '#5B4E96', creatureGreen: '#5CC46A' });
  });

});

describe('silhouetteFrame (Story 3.5)', () => {
  it('every pixel takes colors.shadowTarget; the alpha is kept, so the outline and the trimmed rect are the same', async () => {
    const colour = await colourFrame();
    const shadow = await silhouetteFrame(colour);
    const a = await sharp(colour).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(shadow).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(b.info).toMatchObject({ width: a.info.width, height: a.info.height, channels: 4 });
    const [r, g, bl] = silhouetteRgb();
    expect([r, g, bl]).toEqual([0x5b, 0x4e, 0x96]);
    expect(silhouetteRgb(Tokens.colors.shadowTarget.css)).toEqual([r, g, bl]);
    for (let i = 0; i < a.info.width * a.info.height; i++) {
      expect(b.data[i * 4 + 3]).toBe(a.data[i * 4 + 3]);
      if (b.data[i * 4 + 3]! > 0) expect([b.data[i * 4], b.data[i * 4 + 1], b.data[i * 4 + 2]]).toEqual([r, g, bl]);
    }
    expect(await frameTrimRect(shadow)).toEqual(await frameTrimRect(colour));
  });

  it('is deterministic: the same colour frame gives the same bytes', async () => {
    const colour = await colourFrame();
    expect((await silhouetteFrame(colour)).equals(await silhouetteFrame(colour))).toBe(true);
  });

  it('addSilhouetteFrames writes <object>/shadow/00 from <object>/color/00 for every silhouette object and lists it; a re-run is byte-identical', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bhc-silhouette-'));
    try {
      mkdirSync(join(dir, 'frames', 'item-dog', 'color'), { recursive: true });
      await sharp(await colourFrame()).toFile(join(dir, 'frames', 'item-dog', 'color', '00.png'));
      const raw: RawProjection = { screenId: 'x', render: { width: 32, height: 24 }, objects: [], frames: ['item-dog/color/00'], silhouettes: ['item-dog'] };
      await addSilhouetteFrames(dir, raw);
      expect(raw.frames).toEqual(['item-dog/color/00', 'item-dog/shadow/00']);
      const first = readFileSync(join(dir, 'frames', 'item-dog', 'shadow', '00.png'));
      await addSilhouetteFrames(dir, { ...raw, frames: [] });
      expect(readFileSync(join(dir, 'frames', 'item-dog', 'shadow', '00.png')).equals(first)).toBe(true);
      await expect(addSilhouetteFrames(dir, { ...raw, silhouettes: ['nope'] })).rejects.toThrow(/nope\/color\/00/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the real shadow-match layout (Story 3.5)', () => {
  it('passes its render rules with the published atlas trims; hit.cave is unpadded; render reads the frames', () => {
    const layout = JSON.parse(readFileSync(layoutPath('shadow-match'), 'utf8'));
    const atlas = atlasFrames(JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'public', 'assets', 'atlases', 'shadow-match.json'), 'utf8')));
    expect(SCREEN_RULES['shadow-match']!(layout, atlas)).toEqual([]);
    expect(SCREEN_SEPARATE['shadow-match']).toEqual({ unpadded: ['cave'] });
    expect(FRAME_RULE_SCREENS.has('shadow-match')).toBe(true);
    for (const id of ITEM_IDS) {
      const c = atlas.frames?.[`item-${id}/color/00`]?.spriteSourceSize;
      const s = atlas.frames?.[`item-${id}/shadow/00`]?.spriteSourceSize;
      expect(s, id).toEqual(c);
    }
  });
});
