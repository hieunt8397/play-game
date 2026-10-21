// Stories 3.3/3.4: the dino-puzzle hint-ring contrast sites (the start bays), and the no-meat-eater source scan.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScreenLayout } from '../../src/content/layout-types.ts';
import { Tokens } from '../../src/core/tokens.ts';
import { dinoRings } from './hint-contrast.ts';
import { SCARY_NAME_DIRS, SCARY_SCAN_DIRS, scaryAssetProblems } from './validate-content.ts';

const layout = {
  v: 1,
  screenId: 'dino-puzzle',
  design: { width: 1024, height: 768 },
  renderScale: 2,
  anchors: { 'dino-bay-1': { x: 870, y: 480 }, 'dino-bay-2': { x: 150, y: 480 } },
  paths: {},
  slots: {},
  hits: {},
} as unknown as ScreenLayout;

describe('dinoRings (Story 3.4)', () => {
  it('one ring per bay and species, sized to the species’ largest displayed piece + pad; the minSize circle without frames', () => {
    const atlas = {
      frames: {
        // 140×65 and 30×60 design px: the small one is drawn enlarged to 45×90.
        'apatosaurus-tail/idle/00': { spriteSourceSize: { x: 0, y: 0, w: 280, h: 130 } },
        'apatosaurus-head/idle/00': { spriteSourceSize: { x: 0, y: 0, w: 60, h: 120 } },
      },
    };
    const rings = dinoRings(layout, atlas);
    const pad = Tokens.ui.hintRingPad;
    expect(rings.map((r) => r.label)).toEqual([
      'anchor.dino-bay-1 (apatosaurus)',
      'anchor.dino-bay-2 (apatosaurus)',
      'anchor.dino-bay-1 (triceratops)',
      'anchor.dino-bay-2 (triceratops)',
      'anchor.dino-bay-1 (stegosaurus)',
      'anchor.dino-bay-2 (stegosaurus)',
    ]);
    expect(rings[0]!.ring).toEqual({ cx: 870, cy: 480, rx: 70 + pad, ry: 45 + pad });
    const r = Tokens.components.draggableItem.minSize / 2 + pad;
    expect(rings[3]!.ring).toEqual({ cx: 150, cy: 480, rx: r, ry: r });
  });
});

describe('scaryAssetProblems (Story 3.3, UX-DR75)', () => {
  it('the real content and builders name no meat-eater', () => {
    expect(SCARY_SCAN_DIRS).toEqual(['src/content', 'src/games', 'tools/render/blender']);
    expect(SCARY_NAME_DIRS).toEqual(['../art', 'public/assets']);
    expect(scaryAssetProblems()).toEqual([]);
  });

  it('contents of content, game and builder files, art and asset file names and atlas frame names each fail, naming them', () => {
    const root = mkdtempSync(join(tmpdir(), 'bhc-scary-'));
    const app = join(root, 'app');
    const put = (rel: string, text: string): void => {
      mkdirSync(join(app, rel, '..'), { recursive: true });
      writeFileSync(join(app, rel), text);
    };
    const msg = 'names a meat-eating dinosaur (UX-DR75: only gentle dinosaurs)';
    try {
      put('src/content/ok.ts', "export const x = 'pineapple';\n");
      put('src/content/deco.ts', "item('t_" + "rex')\n");
      put('src/games/x/Game.ts', "const m = 'Velocir" + "aptor';\n");
      put('tools/render/blender/bad.py', "MODEL = 'Tyranno" + "saurus.fbx'\n");
      put('../art/spino' + 'saurus.blend', 'x');
      put('public/assets/bg/allo' + 'saurus.png', 'x');
      put('public/assets/atlases/x.json', JSON.stringify({ textures: [{ frames: [{ filename: 't ' + 'rex/idle/00' }] }] }));
      expect(scaryAssetProblems(app)).toEqual([
        `file src/content/deco.ts: ${msg}`,
        `file src/games/x/Game.ts: ${msg}`,
        `file tools/render/blender/bad.py: ${msg}`,
        `file name ../art/spinosaurus.blend: ${msg}`,
        `file name public/assets/bg/allosaurus.png: ${msg}`,
        `atlas public/assets/atlases/x.json: frame "t rex/idle/00" ${msg}`,
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
