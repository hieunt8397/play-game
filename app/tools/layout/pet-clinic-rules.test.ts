// Story 8.1: validatePetClinic on the real layout and atlas, and its failures.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScreenLayout } from '../../src/content/layout-types.ts';
import { PARTICLES, patientFrame, toolFrame } from '../../src/content/games/pet-clinic.ts';
import { atlasFrames, petClinicLimits, validatePetClinic, type AtlasJsonLike } from './rules.ts';

const APP = join(import.meta.dirname, '..', '..');
const real = (): ScreenLayout => JSON.parse(readFileSync(join(APP, 'src', 'content', 'generated', 'pet-clinic.layout.json'), 'utf8')) as ScreenLayout;
const realAtlas = (): AtlasJsonLike => atlasFrames(JSON.parse(readFileSync(join(APP, 'public', 'assets', 'atlases', 'pet-clinic.json'), 'utf8')));
const box = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
/** The atlas with `frame`'s trim replaced (render px). */
const withTrim = (atlas: AtlasJsonLike, frame: string, ss: { x: number; y: number; w: number; h: number }): AtlasJsonLike => ({
  frames: { ...atlas.frames, [frame]: { ...atlas.frames![frame], spriteSourceSize: ss } },
});

describe('validatePetClinic (Story 8.1)', () => {
  it('the real layout and atlas pass; tools ≥ 90 px, tap circles ≥ 80 px', () => {
    expect(validatePetClinic(real(), petClinicLimits(), realAtlas())).toEqual([]);
    expect(petClinicLimits().toolMin).toBe(90);
    expect(2 * petClinicLimits().toolHitRadius(10)).toBe(80);
  });

  it('a narrow patient hull, one under the Home zone, and a door off the row fail naming the ids', () => {
    const l = real();
    expect(validatePetClinic({ ...l, hits: { ...l.hits, patient: box(300, 400, 60, 200) } }, petClinicLimits())[0]).toMatch(/^hit "patient": .* wide \(min 80\)/);
    expect(validatePetClinic({ ...l, hits: { ...l.hits, patient: box(30, 60, 300, 300) } }, petClinicLimits()).some((m) => m.startsWith('hit "patient": reaches into the Home/Speaker'))).toBe(true);
    expect(validatePetClinic({ ...l, anchors: { ...l.anchors, door: { x: 30, y: 500 } } }, petClinicLimits()).some((m) => m.startsWith('anchor "door": y 500 is off'))).toBe(true);
    expect(validatePetClinic({ ...l, anchors: { ...l.anchors, door: { x: 900, y: l.anchors.patient!.y } } }, petClinicLimits())).toContain('anchor "door": not left of anchor "patient"');
  });

  it('a small tool, two tools too close, a tool on the patient, a patient frame off the rect, and a missing frame are named', () => {
    const l = real();
    const atlas = realAtlas();
    const shower = toolFrame('shower');
    const bottle = toolFrame('bottle');
    const b = atlas.frames![bottle]!.spriteSourceSize!;
    expect(validatePetClinic(l, petClinicLimits(), withTrim(atlas, shower, { x: 1500, y: 860, w: 150, h: 150 })).some((m) => m.startsWith(`frame "${shower}": longest side 75`))).toBe(true);
    expect(validatePetClinic(l, petClinicLimits(), withTrim(atlas, shower, { x: b.x! - 120, y: b.y!, w: b.w!, h: b.h! })).some((m) => m.startsWith(`tools "${shower}" and "${bottle}"`))).toBe(true);
    expect(validatePetClinic(l, petClinicLimits(), withTrim(atlas, shower, { x: 700, y: 900, w: 220, h: 220 })).some((m) => m.startsWith(`tool "${shower}" and hit "patient"`))).toBe(true);
    const dog = patientFrame('dog', 'base');
    expect(validatePetClinic(l, petClinicLimits(), withTrim(atlas, dog, { x: 10, y: 600, w: 400, h: 500 })).some((m) => m.startsWith(`frame "${dog}"`) && m.includes('leaves the interactive rect'))).toBe(true);
    const without: AtlasJsonLike = { frames: Object.fromEntries(Object.entries(atlas.frames ?? {}).filter(([k]) => k !== PARTICLES.z)) };
    expect(validatePetClinic(l, petClinicLimits(), without)).toContain(`atlas "pet-clinic": frame "${PARTICLES.z}" is missing`);
  });
});
