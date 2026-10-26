// Bác sĩ thú cưng content (Story 8.1): a yard game (content/home.ts corner `clinic`). A cosy clinic room
// (`bg.pet-clinic`, tools/render/blender/build_pet_clinic.py) seen through an ORTHOGRAPHIC camera, so a shift along
// world x is the same shift on screen. A patient walks in from the left (`anchor.door`) to the exam spot
// (`anchor.patient`) with 1–2 visible problems; Xoài drags (or taps, then taps the patient) a tool from the tray at
// the bottom right onto it. A fitting tool clears that problem with its own reaction; a tool that fits nothing left
// makes the patient tilt its head (FR30) and the voice says what it needs again. Once well, the patient thanks her,
// hops and walks out; the next one walks in. Never a score, a timer, a fail sound or red feedback.
// Every patient is a real low-poly model from the pens (Quaternius CC0; the cat and rooster are Poly by Google
// CC-BY 3.0, credited in public/CREDITS.txt), posed and drawn at clinic size; the pig is "lợn", never "heo".
//   - frames, all rendered at the exam spot with one camera and one anchor, so Phaser stacks them:
//     `patient-<id>/base/00` (the patient standing), `patient-<id>/tilt/00` (rigged patients only: its head turned
//     ~20°; the static cat and rooster tilt their whole body on their feet in Phaser instead) and the overlays
//     `patient-<id>/<overlay>/00` (mud, scrape, plaster, blanket, bottle: rendered with the animal as a holdout, so
//     only their visible parts show; none but the bottle touches the head, so they fit the tilt frame too);
//   - `tool-<id>/idle/00`: each tool resting in its tray place (its trimmed centre is its home);
//   - particles placed anywhere by their trimmed centre: `drop` (shower water), `wave` (the rumbling tummy), `z`,
//     `sparkle` (a correct flourish), `heart` (the thank-you);
//   - layout: `hit.patient` (the exam area: the drop target and the patient's tap area), `anchor.patient` (the
//     ground pivot under the patient), `anchor.door` (the same row, at the room's left edge: the walk starts there),
//     and per patient `anchor.<spot>-<id>` for spot ∈ back (the shower and the blanket), mouth (the bottle), scrape
//     (the plaster), belly (the tummy's wavy lines), head (the yawn's "z").
// The tool tap areas are circles around each tool's trimmed centre (`toolHitRadius`); tools/layout/rules.ts ›
// validatePetClinic checks them and every frame (inside the interactive rect, clear of the Hud, sizes, gaps).
import { ATLASES, BACKGROUNDS } from '../assets.ts';
import type { ReactionSet } from '../../core/reactions.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

/** The problems a patient can show, and the tool that fixes each. */
export const PROBLEM_IDS = ['mud', 'tummy', 'scrape', 'yawn'] as const;
export type ProblemId = (typeof PROBLEM_IDS)[number];
export const TOOL_IDS = ['shower', 'bottle', 'plaster', 'blanket'] as const;
export type ToolId = (typeof TOOL_IDS)[number];
export const TOOL_FOR: Readonly<Record<ProblemId, ToolId>> = { mud: 'shower', tummy: 'bottle', scrape: 'plaster', yawn: 'blanket' };

export function isProblem(id: unknown): id is ProblemId {
  return typeof id === 'string' && (PROBLEM_IDS as readonly string[]).includes(id);
}

/** Every pen animal visits the clinic (the parent's choice, 2026-10-26). */
export const PATIENT_IDS = ['dog', 'cat', 'pig', 'sheep', 'rooster', 'cow', 'horse'] as const;
export type PatientId = (typeof PATIENT_IDS)[number];
export function isPatient(id: unknown): id is PatientId {
  return typeof id === 'string' && (PATIENT_IDS as readonly string[]).includes(id);
}
/** The rigged patients (their head bone turns for the `tilt` frame); the static cat and rooster tilt in Phaser. */
export const TILT_FRAME_PATIENTS: readonly PatientId[] = ['dog', 'pig', 'sheep', 'cow', 'horse'];

export interface Patient {
  readonly id: PatientId;
  /** `sfx.animal-pens.<id>.call`: its real call (on arrival and when it is tapped). */
  readonly callSfx: string;
  /** `vo.animal-pens.name.<id>` ("Con lợn!"), said as it arrives. */
  readonly nameLine: string;
}

export const PATIENTS: readonly Patient[] = PATIENT_IDS.map((id) => ({ id, callSfx: `sfx.animal-pens.${id}.call`, nameLine: `vo.animal-pens.name.${id}` }));

/** What each problem needs (the voice line, also the reminder and the Speaker prompt). */
export const NEED_LINES: Readonly<Record<ProblemId, string>> = {
  mud: 'vo.pet-clinic.need.mud',
  tummy: 'vo.pet-clinic.need.tummy',
  scrape: 'vo.pet-clinic.need.scrape',
  yawn: 'vo.pet-clinic.need.yawn',
};
/** The invitation as a fresh clinic opens (the child's name, Story 5.2), chained before the first patient's name. */
export const INVITE_LINE = 'vo.pet-clinic.prompt';
/** The well patient's thank-you (no praise, no name). */
export const THANKS_LINE = 'vo.pet-clinic.thanks';
export const PARENT_LINE = 'vo.pet-clinic.parent.1';

/** Sounds: our own recipes (tools/audio/make-pet-clinic.ts) and the bedtime game's soft creature sounds. */
export const SFX = {
  splash: 'sfx.pet-clinic.splash',
  giggle: 'sfx.bedtime.giggle',
  burp: 'sfx.pet-clinic.burp',
  gurgle: 'sfx.pet-clinic.gurgle',
  pat: 'sfx.pet-clinic.pat',
  rustle: 'sfx.bedtime.blanket',
  yawn: 'sfx.bedtime.yawn',
  snore: 'sfx.bedtime.snore',
  happy: 'sfx.shell.happy',
} as const;

/** Each fix: a sound as the tool reaches the patient and one as the reaction ends (the problem's own reaction). */
export const FIX_SOUNDS: Readonly<Record<ProblemId, { readonly start?: string; readonly end?: string }>> = {
  mud: { start: SFX.splash, end: SFX.giggle },
  tummy: { end: SFX.burp },
  scrape: { start: SFX.pat, end: SFX.giggle },
  yawn: { start: SFX.rustle, end: SFX.snore },
};
/** The waiting problems' periodic cue sound (the tummy rumbles, the patient yawns); the others show still. */
export const CUE_SOUNDS: Readonly<Partial<Record<ProblemId, string>>> = { tummy: SFX.gurgle, yawn: SFX.yawn };

/** FR30/FR31: the reaction ids (games/pet-clinic/PetClinic.ts switches on them exhaustively). */
export const CORRECT_REACTIONS = ['hop', 'wiggle', 'sparkle'] as const;
/** The head tilt, and its comic variant: a double take (tilt one way, then the other). */
export const CHOSE_OTHER_REACTIONS = ['tilt', 'double-take'] as const;
export type CorrectReaction = (typeof CORRECT_REACTIONS)[number];
export type ChoseOtherReaction = (typeof CHOSE_OTHER_REACTIONS)[number];
export const REACTIONS: ReactionSet = { correct: CORRECT_REACTIONS, choseOther: CHOSE_OTHER_REACTIONS };

/** The overlay frames drawn over a patient (and the problem each shows, if any). */
export const OVERLAYS = ['mud', 'scrape', 'plaster', 'blanket', 'bottle'] as const;
export type OverlayId = (typeof OVERLAYS)[number];
export const PATIENT_POSES = ['base', 'tilt'] as const;
export const patientFrame = (id: PatientId, layer: 'base' | 'tilt' | OverlayId): string => `patient-${id}/${layer}/00`;
export const toolFrame = (id: ToolId): string => `tool-${id}/idle/00`;
export const PARTICLES = { drop: 'drop/idle/00', wave: 'wave/idle/00', z: 'z/idle/00', sparkle: 'sparkle/idle/00', heart: 'heart/idle/00' } as const;

/** Where on a patient each tool works (and where the tummy and yawn cues show). */
export const SPOTS = ['back', 'mouth', 'scrape', 'belly', 'head'] as const;
export type SpotId = (typeof SPOTS)[number];
export const spotAnchor = (spot: SpotId, id: PatientId): string => `${spot}-${id}`;
export const TOOL_SPOT: Readonly<Record<ToolId, SpotId>> = { shower: 'back', bottle: 'mouth', plaster: 'scrape', blanket: 'back' };

export const PATIENT_ANCHOR = 'patient';
export const DOOR_ANCHOR = 'door';
export const PATIENT_HIT = 'patient';

/** A tool's tap circle: its drawn half size, but at least half of `minPx` (ui.petClinicToolHitMinPx: a ≥ 80 px target). */
export function toolHitRadius(half: number, minPx: number): number {
  return Math.max(half, minPx / 2);
}

/** Every frame of a patient. */
export function patientFrames(id: PatientId): string[] {
  return [patientFrame(id, 'base'), ...(TILT_FRAME_PATIENTS.includes(id) ? [patientFrame(id, 'tilt')] : []), ...OVERLAYS.map((o) => patientFrame(id, o))];
}

/** What `pet-clinic.layout.json` and `atlas.pet-clinic` must hold. */
export const PET_CLINIC_SCREEN: ScreenRequirements = {
  anchors: [PATIENT_ANCHOR, DOOR_ANCHOR, ...PATIENT_IDS.flatMap((id) => SPOTS.map((s) => spotAnchor(s, id)))],
  hits: [PATIENT_HIT],
  slots: [],
  frames: [...PATIENT_IDS.flatMap(patientFrames), ...TOOL_IDS.map(toolFrame), ...Object.values(PARTICLES)],
};
export const screen = PET_CLINIC_SCREEN;

export const assets: GameAssets = {
  atlases: [ATLASES['pet-clinic']],
  images: [BACKGROUNDS['pet-clinic']],
  audio: [
    INVITE_LINE,
    ...Object.values(NEED_LINES),
    THANKS_LINE,
    PARENT_LINE,
    ...PATIENTS.flatMap((p) => [p.nameLine, p.callSfx]),
    // Boot keeps the shell sounds (sfx.shell.happy) for the session.
    ...new Set(Object.values(SFX).filter((id) => !id.startsWith('sfx.shell.'))),
  ],
};
