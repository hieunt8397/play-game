// Ban nhạc content (Story 7.3): a yard game (content/home.ts corner `stage`). Five instruments stand on a small
// stage (`bg.band`, tools/render/blender/build_band.py): trống (a pitched tom), kèn (a horn), ếch (the singer: a
// real Quaternius frog), đàn gõ (a xylophone) and chuông (a bell). Each tap plays the instrument's next note of
// one shared C-major pentatonic scale (C D E G A, C4…E6), so any mix of taps sounds nice. No songs, ever.
//   - `<id>/idle/00`: each instrument, rendered in place (its own sprite; the bounce is a scale motion on its
//     ground pivot);
//   - `hit.<id>`: its tap area (the convex hull of its meshes), `anchor.<id>`: its ground pivot.
// Every note is synthesised by our own tools (tools/audio/make-band.ts: ≤ 800 ms, a 50 ms fade-in, nothing below
// 150 Hz, peak ≤ −18 dBFS); the idle beat is a soft self-made drum loop (`music.band-beat`, ≤ −30 LUFS) on the
// music channel, so it ducks under every voice line.
import { ATLASES, BACKGROUNDS } from '../assets.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

/** C-major pentatonic over about two octaves (Hz, equal temperament, A4 = 440). Nothing else is ever played. */
export const BAND_SCALE = {
  c4: 261.63,
  d4: 293.66,
  e4: 329.63,
  g4: 392.0,
  a4: 440.0,
  c5: 523.25,
  d5: 587.33,
  e5: 659.25,
  g5: 783.99,
  a5: 880.0,
  c6: 1046.5,
  d6: 1174.66,
  e6: 1318.51,
} as const;
export type BandNote = keyof typeof BAND_SCALE;
export const BAND_NOTES: readonly BandNote[] = Object.keys(BAND_SCALE) as BandNote[];

/** Each tap moves one step along this pattern of note indices (up, then down: 8 taps per cycle). */
export const NOTE_PATTERN: readonly number[] = [0, 1, 2, 3, 4, 3, 2, 1];

export interface BandInstrument {
  readonly id: string;
  /** Its Vietnamese name (the parent label). */
  readonly label: string;
  /** Its five notes, low to high (its register in the shared scale). */
  readonly notes: readonly BandNote[];
  /** `sfx.band.<id>.<note>`, one per note (same order). */
  readonly noteSfx: readonly string[];
  /** `vo.band.name.<id>`: its short name, for the parent label only (never spoken on a tap: taps play music). */
  readonly nameLine: string;
}

export const noteSfx = (id: string, note: BandNote): string => `sfx.band.${id}.${note}`;

const instrument = (id: string, label: string, notes: readonly BandNote[]): BandInstrument => ({
  id,
  label,
  notes,
  noteSfx: notes.map((n) => noteSfx(id, n)),
  nameLine: `vo.band.name.${id}`,
});

/** The instruments, left to right on the stage (back row horn, frog, bell; front row drum, xylophone). */
export const BAND_INSTRUMENTS: readonly BandInstrument[] = [
  instrument('drum', 'Cái trống', ['c4', 'd4', 'e4', 'g4', 'a4']),
  instrument('horn', 'Cái kèn', ['e4', 'g4', 'a4', 'c5', 'd5']),
  instrument('frog', 'Con ếch', ['g4', 'a4', 'c5', 'd5', 'e5']),
  instrument('xylophone', 'Đàn gõ', ['c5', 'd5', 'e5', 'g5', 'a5']),
  instrument('bell', 'Cái chuông', ['g5', 'a5', 'c6', 'd6', 'e6']),
];

export const INSTRUMENT_IDS: readonly string[] = BAND_INSTRUMENTS.map((i) => i.id);

/** The singer: its notes are a creature's voice (catalog `creature: true`, measured by `npm run audio:check`). */
export const SINGER_ID = 'frog';

/** The idle beat: a soft drum loop of BEAT_LOOP_BEATS beats, Timing.bandBeatMs apart (the first at the loop start). */
export const BEAT_MUSIC = 'music.band-beat';
export const BEAT_LOOP_BEATS = 4;

/** The game's invitation as it opens (its Speaker prompt). */
export const INVITE_LINE = 'vo.band.prompt';
export const PARENT_LINE = 'vo.band.parent.1';

export const instrumentFrame = (id: string): string => `${id}/idle/00`;

/** What `band.layout.json` and `atlas.band` must hold. */
export const BAND_SCREEN: ScreenRequirements = {
  anchors: [...INSTRUMENT_IDS],
  hits: [...INSTRUMENT_IDS],
  slots: [],
  frames: INSTRUMENT_IDS.map(instrumentFrame),
};
export const screen = BAND_SCREEN;

export const assets: GameAssets = {
  atlases: [ATLASES.band],
  images: [BACKGROUNDS.band],
  // The beat (a music.* id) is loaded by Boot with the other music for the session (core/boot-load).
  audio: [INVITE_LINE, PARENT_LINE, ...BAND_INSTRUMENTS.flatMap((i) => i.noteSfx)],
};
