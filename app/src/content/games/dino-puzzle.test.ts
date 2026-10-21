import { describe, expect, it } from 'vitest';
import { ATLASES, BACKGROUNDS } from '../assets';
import { AUDIO_CATALOG } from '../audio-catalog';
import { VOICE_LINES } from '../voice-lines';
import { SCARY_PATTERN } from '../../../tools/lint/validate-content.ts';
import { BAY_ANCHORS, DINO_BAYS, DROP_ORDER, PIECES, PIECE_IDS, SFX, SPECIES, assets, callSfx, ladder, screen } from './dino-puzzle';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// The one pattern of the no-meat-eater rule (tools/lint/validate-content.ts).
const SCARY = SCARY_PATTERN;

describe('dino-puzzle content (Story 3.4)', () => {
  it('the ladder: 3 levels of 3 → 4 → 6 pieces, 3 dinos each', () => {
    expect(ladder.length).toBe(3);
    expect(ladder.map((l) => l.pieces)).toEqual([3, 4, 6]);
    for (const l of ladder) expect(l.dinos).toBe(3);
  });

  it('every cut PIECES[k] has k distinct kebab ids; the 6-piece cut is đầu, cổ, thân, chân trước, chân sau, đuôi', () => {
    for (const [k, ids] of Object.entries(PIECES)) {
      expect(ids).toHaveLength(Number(k));
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(KEBAB);
    }
    expect(PIECES[3]).toEqual(['head-neck', 'body-legs', 'tail']);
    expect(PIECES[4]).toEqual(['head-neck', 'front', 'back', 'tail']);
    expect(PIECES[6]).toEqual(['head', 'neck', 'body', 'front-legs', 'back-legs', 'tail']);
  });

  it('PIECE_IDS is the deduplicated union of the cuts (10 ids)', () => {
    expect(PIECE_IDS).toHaveLength(10);
    expect(new Set(PIECE_IDS)).toEqual(new Set(Object.values(PIECES).flat()));
  });

  it('8 bays; drops resolve own slot first ("ô đúng thắng")', () => {
    expect(DINO_BAYS).toBe(8);
    expect(BAY_ANCHORS).toEqual(['dino-bay-1', 'dino-bay-2', 'dino-bay-3', 'dino-bay-4', 'dino-bay-5', 'dino-bay-6', 'dino-bay-7', 'dino-bay-8']);
    expect(DROP_ORDER[0]).toBe('own');
    expect(DROP_ORDER).toEqual(['own', 'home', 'other', 'rest', 'off']);
  });
});

describe('dino-puzzle content (Story 3.3)', () => {
  it('three gentle species', () => {
    expect(SPECIES).toEqual(['apatosaurus', 'triceratops', 'stegosaurus']);
  });

  it.each(ladder.map((l, i) => [i, l] as const))('level %i: its piece count is a PIECES key and dinos ≤ SPECIES', (_i, l) => {
    expect(Object.keys(PIECES)).toContain(String(l.pieces));
    expect(l.dinos).toBeLessThanOrEqual(SPECIES.length);
  });

  it('no species, piece, frame or asset path names a meat-eater', () => {
    const names = [...SPECIES, ...Object.values(PIECES).flat(), ...screen.frames, ...screen.anchors, ...screen.slots, ...assets.audio, ...assets.atlases.map((a) => a.png), ...(assets.images ?? []).map((i) => i.path)];
    expect(names.filter((n) => SCARY.test(n))).toEqual([]);
  });

  it('loads its multi-page atlas, plate, every dino line and SFX (the calls are creature sounds)', () => {
    expect(assets.atlases).toEqual([ATLASES['dino-puzzle']]);
    expect(ATLASES['dino-puzzle'].pages).toBe(4);
    expect(assets.images).toEqual([BACKGROUNDS['dino-puzzle']]);
    const vo = VOICE_LINES.map((l) => l.id).filter((id) => id.startsWith('vo.dino-puzzle.'));
    expect(vo).toHaveLength(6);
    expect(assets.audio).toEqual([...vo, ...Object.values(SFX), ...SPECIES.map(callSfx)]);
    for (const s of SPECIES) expect(AUDIO_CATALOG[callSfx(s) as keyof typeof AUDIO_CATALOG].creature).toBe(true);
  });

  it('the screen: ids and frames generated from SPECIES × PIECE_IDS, plus the 8 bays (Story 3.4)', () => {
    expect(screen.hits).toEqual(['grass']);
    expect(screen.slots).toHaveLength(30);
    expect(screen.slots).toEqual(expect.arrayContaining(['triceratops-body-legs', 'apatosaurus-front-legs', 'stegosaurus-neck']));
    expect(screen.anchors).toEqual(expect.arrayContaining(['apatosaurus', 'apatosaurus-walk', 'dino-bay-1', 'dino-bay-8', 'cloud-1', 'cloud-2']));
    expect(screen.anchors.filter((a) => a.endsWith('-start'))).toEqual([]);
    expect(screen.anchors).toHaveLength(3 * 2 + 8 + 2);
    expect(screen.frames).toEqual(expect.arrayContaining(['stegosaurus/ghost/00', 'apatosaurus/walk/01', 'triceratops/happy/01', 'triceratops-neck/ghost/00', 'stegosaurus-back-legs/idle/00', 'cloud-2/idle/00']));
    expect(screen.frames).not.toContain('apatosaurus/walk/02');
    // idle, blink, 2 happy, 2 walk, ghost + 10 pieces × (idle, ghost), per species.
    expect(screen.frames).toHaveLength(3 * (7 + 20) + 2);
  });
});

describe('the no-meat-eater pattern (UX-DR75)', () => {
  it('catches every spelling of the scary dinosaurs and none of the gentle ones', () => {
    // Split so this file itself never trips the scan (it covers src/content).
    const bad = [['T', 'rex.fbx'], ['t-', 'rex'], ['t_', 'rex'], ['T ', 'rex'], ['Tyran', 'nosaurus'], ['Velocir', 'aptor.fbx'], ['rap', 'tor'], ['Spino', 'saurus'], ['Allo', 'saurus']].map((p) => p.join(''));
    for (const n of bad) expect(SCARY.test(n)).toBe(true);
    for (const n of [...SPECIES, 'Parasaurolophus.fbx', 'pineapple', 'dino-egg']) expect(SCARY.test(n)).toBe(false);
  });
});
