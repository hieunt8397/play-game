// `npm run audio:placeholders` — synthesizes the placeholder SFX/music files with ffmpeg.
// Output: mono AAC 44.1 kHz 64 kb/s `.m4a` at public/<AUDIO_CATALOG[id].path>. Re-run any time;
// replace a file with real audio later by keeping the same id/path.
// ffmpeg comes from FFMPEG_BIN (full path to the binary) or, failing that, from PATH.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_CATALOG, type AudioId } from '../../src/content/audio-catalog.ts';
import { FFMPEG, probeBinary, resolveBinary, type Env, type Probe } from '../shared/binaries.ts';
import { bandArgs } from './make-band.ts';
import { bedtimeArgs } from './make-bedtime.ts';
import { petClinicArgs } from './make-pet-clinic.ts';
import { dressUpArgs } from './make-dress-up.ts';
import { gardenArgs } from './make-garden.ts';
import { carWashArgs } from './make-car-wash.ts';
import { planeArgs } from './make-plane.ts';
import { trainArgs } from './make-train.ts';

/** Encoder settings shared by every file (Technical Decisions › Asset pipeline). */
const ENCODE = ['-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k'];

// --- sfx.shell.pop -----------------------------------------------------------
// 140 ms sine chirp 700→1100 Hz; 50 ms fade-in (SFX rule: fade-in ≥ 50 ms), exponential tail;
// highpass at 150 Hz (nothing below 150 Hz); amplitude 0.1 = −20 dBFS peak (below −16 LUFS voice).
const POP_SECONDS = 0.14;
const POP_FADE_IN = 0.05;
const POP_EXPR = `0.1*sin(2*PI*(700*t+(1100-700)/(2*${POP_SECONDS})*t*t))`;
const POP_FILTER = [
  `afade=t=in:st=0:d=${POP_FADE_IN}`,
  `afade=t=out:st=${POP_FADE_IN}:d=${(POP_SECONDS - POP_FADE_IN).toFixed(2)}:curve=exp`,
  'highpass=f=150',
].join(',');

// --- sfx.shell.happy (Story 1.5: sleeping-station "tiếng vui") ------------------
// Rising two-note chime G5 784 Hz → C6 1047 Hz, 0.15 s + 0.2 s. Each note has a sin envelope that is
// 0 at its edges (no click at the switch); plus a 50 ms fade-in and highpass 150 Hz. Amplitude
// 0.1 = −20 dBFS peak (quieter than the voice).
const HAPPY_NOTE1 = 0.15;
const HAPPY_NOTE2 = 0.2;
const HAPPY_SECONDS = Number((HAPPY_NOTE1 + HAPPY_NOTE2).toFixed(2));
const HAPPY_EXPR =
  `0.1*(lt(t,${HAPPY_NOTE1})*sin(PI*t/${HAPPY_NOTE1})*sin(2*PI*784*t)` +
  `+gte(t,${HAPPY_NOTE1})*sin(PI*(t-${HAPPY_NOTE1})/${HAPPY_NOTE2})*sin(2*PI*1047*t))`;
const HAPPY_FILTER = ['afade=t=in:st=0:d=0.05', 'highpass=f=150'].join(',');

// --- sfx.shell.prop (Story 1.5: tappable-prop small sound) -----------------------
// ~100 ms soft tick: 1200 Hz sine with a 50 ms fade-in and an exponential 50 ms tail, highpass
// 150 Hz, peak −20 dBFS.
const PROP_SECONDS = 0.1;
const PROP_FADE_IN = 0.05;
const PROP_EXPR = '0.1*sin(2*PI*1200*t)';
const PROP_FILTER = [
  `afade=t=in:st=0:d=${PROP_FADE_IN}`,
  `afade=t=out:st=${PROP_FADE_IN}:d=${(PROP_SECONDS - PROP_FADE_IN).toFixed(2)}:curve=exp`,
  'highpass=f=150',
].join(',');

// --- sfx.shell.kart-beep (Story 1.7: kart tap horn) -----------------------------
// Two-tone horn "bíp-bíp": a rising pair E5 659 Hz → A5 880 Hz, 0.1 s each.
// Each tone mixes the fundamental with a little 2nd harmonic (0.07 + 0.03 → peak 0.1 = −20 dBFS)
// under a sin envelope that is 0 at its edges; plus a 50 ms fade-in and highpass 150 Hz.
const BEEP_NOTE = 0.1;
const BEEP_SECONDS = 0.2;
const beepTone = (hz: number, start: number): string =>
  `sin(PI*(t-${start})/${BEEP_NOTE})*(0.07*sin(2*PI*${hz}*t)+0.03*sin(2*PI*${hz * 2}*t))`;
const BEEP_EXPR = `lt(t,${BEEP_NOTE})*${beepTone(659, 0)}+gte(t,${BEEP_NOTE})*${beepTone(880, BEEP_NOTE)}`;
const BEEP_FILTER = ['afade=t=in:st=0:d=0.05', 'highpass=f=150'].join(',');

// --- sfx.ice-cream.snap (Story 1.8: a scoop lands on the cone) -----------------
// Soft "plop" ~150 ms: a sine sweeping down 520 → 220 Hz with a 50 ms fade-in and an exponential
// tail, highpass 150 Hz, peak 0.1 = −20 dBFS.
const SNAP_SECONDS = 0.15;
const SNAP_FADE_IN = 0.05;
const SNAP_EXPR = `0.1*sin(2*PI*(520*t-(520-220)/(2*${SNAP_SECONDS})*t*t))`;
const SNAP_FILTER = [
  `afade=t=in:st=0:d=${SNAP_FADE_IN}`,
  `afade=t=out:st=${SNAP_FADE_IN}:d=${(SNAP_SECONDS - SNAP_FADE_IN).toFixed(2)}:curve=exp`,
  'highpass=f=150',
].join(',');

// --- sfx.ice-cream.happy (Story 1.8: Shiba's happy tune) ------------------------
// Major arpeggio C5 523 → E5 659 → G5 784 → C6 1047, the last note held: 0.3 s × 3 + 0.6 s = 1.5 s.
// Each note has a sin envelope that is 0 at its edges; plus a 50 ms fade-in and highpass 150 Hz.
// Amplitude 0.1 = −20 dBFS peak.
const TUNE_NOTE = 0.3;
const TUNE_LAST = 0.6;
const TUNE_NOTES = [523, 659, 784];
const TUNE_SECONDS = Number((TUNE_NOTE * TUNE_NOTES.length + TUNE_LAST).toFixed(2));
const tuneNote = (hz: number, start: number, len: number): string =>
  `between(t,${start},${start + len})*sin(PI*(t-${start})/${len})*sin(2*PI*${hz}*t)`;
const TUNE_EXPR = `0.1*(${[
  ...TUNE_NOTES.map((hz, i) => tuneNote(hz, Number((i * TUNE_NOTE).toFixed(2)), TUNE_NOTE)),
  tuneNote(1047, Number((TUNE_NOTE * TUNE_NOTES.length).toFixed(2)), TUNE_LAST),
].join('+')})`;
const TUNE_FILTER = ['afade=t=in:st=0:d=0.05', 'highpass=f=150'].join(',');

// --- Tiệm pizza (Story 3.1) -------------------------------------------------------
// Every partial is ≥ 300 Hz (nothing below 150 Hz, with margin), 50 ms fade-in, highpass 150 Hz, peak
// ≤ 0.1 = −20 dBFS. PIZZA_PARTIALS lists the frequencies each expression uses (tested ≥ 300 Hz).
export const PIZZA_PARTIALS = {
  'sfx.pizza.snap': [600, 340],
  'sfx.pizza.ting': [1568, 3136],
  'sfx.pizza.munch': [420, 840],
  'sfx.pizza.happy': [587, 740, 880, 1175],
} as const;
// snap: a soft "pụp" ~150 ms, a sine sweeping down 600 → 340 Hz with an exponential tail.
const PZ_SNAP_SECONDS = 0.15;
const PZ_SNAP_EXPR = `0.1*sin(2*PI*(600*t-(600-340)/(2*${PZ_SNAP_SECONDS})*t*t))`;
const PZ_SNAP_FILTER = ['afade=t=in:st=0:d=0.05', `afade=t=out:st=0.05:d=${(PZ_SNAP_SECONDS - 0.05).toFixed(2)}:curve=exp`, 'highpass=f=150'].join(',');
// ting: a small bell ~400 ms, G6 1568 Hz + its octave, decaying exponentially.
const PZ_TING_SECONDS = 0.4;
const PZ_TING_EXPR = '0.1*exp(-8*t)*(0.75*sin(2*PI*1568*t)+0.25*sin(2*PI*3136*t))';
const PZ_TING_FILTER = ['afade=t=in:st=0:d=0.05', 'highpass=f=150'].join(',');
// munch: two soft "măm" clicks, 0.12 s each at 0.05 s and 0.35 s (total 0.6 s ≤ 700 ms).
const PZ_MUNCH_SECONDS = 0.6;
const PZ_MUNCH_CLICK = 0.12;
const munchClick = (start: number): string =>
  `between(t,${start},${start + PZ_MUNCH_CLICK})*sin(PI*(t-${start})/${PZ_MUNCH_CLICK})*(0.07*sin(2*PI*420*t)+0.03*sin(2*PI*840*t))`;
const PZ_MUNCH_EXPR = `${munchClick(0.05)}+${munchClick(0.35)}`;
const PZ_MUNCH_FILTER = ['afade=t=in:st=0:d=0.05', 'highpass=f=150'].join(',');
// happy: a D-major arpeggio D5 587 → F#5 740 → A5 880 → D6 1175, the last note held (1.5 s).
const PZ_TUNE_EXPR = `0.1*(${[
  ...[587, 740, 880].map((hz, i) => tuneNote(hz, Number((i * TUNE_NOTE).toFixed(2)), TUNE_NOTE)),
  tuneNote(1175, Number((TUNE_NOTE * 3).toFixed(2)), TUNE_LAST),
].join('+')})`;

// --- Ghép khủng long (Story 3.3) ---------------------------------------------------
// Every partial ≥ 300 Hz, 50 ms fade-in, highpass 150 Hz, peak ≤ 0.1 = −20 dBFS. DINO_PARTIALS lists the
// frequencies each expression uses (tested ≥ 300 Hz). The creature calls (catalog `creature: true`) use
// a cubic fade-in, so their first 10 ms stay far below their peak (`npm run audio:check`).
export const DINO_PARTIALS = {
  'sfx.dino-puzzle.snap': [620, 360],
  'sfx.dino-puzzle.happy': [659, 831, 988, 1319],
  'sfx.dino-puzzle.apatosaurus.happy': [392, 330],
  'sfx.dino-puzzle.triceratops.happy': [659, 784],
  'sfx.dino-puzzle.stegosaurus.happy': [493, 553],
} as const;
// snap: a soft "pụp" ~150 ms, a sine sweeping down 620 → 360 Hz with an exponential tail.
const DN_SNAP_SECONDS = 0.15;
const DN_SNAP_EXPR = `0.1*sin(2*PI*(620*t-(620-360)/(2*${DN_SNAP_SECONDS})*t*t))`;
// happy: an E-major arpeggio E5 659 → G#5 831 → B5 988 → E6 1319, the last note held (1.5 s).
const DN_TUNE_EXPR = `0.1*(${[
  ...[659, 831, 988].map((hz, i) => tuneNote(hz, Number((i * TUNE_NOTE).toFixed(2)), TUNE_NOTE)),
  tuneNote(1319, Number((TUNE_NOTE * 3).toFixed(2)), TUNE_LAST),
].join('+')})`;
const CREATURE_FILTER = ['afade=t=in:st=0:d=0.05:curve=cub', 'highpass=f=150'].join(',');
// --- sfx.shell.woof (Story 5.2: guide Shiba tap, creature) ---------------------------
// Two soft "gâu" yips, each a sine sweeping down under a sin envelope: 700 → 520 Hz then 640 → 500 Hz,
// 0.15 s each with a 0.04 s gap (360 ms ≤ 400 ms). Peak 0.1 = −20 dBFS, cubic 50 ms fade-in, highpass 150 Hz.
export const WOOF_PARTIALS = [700, 520, 640, 500] as const;
export const WOOF_SECONDS = 0.36;
const WOOF_YIP = 0.15;
const yip = (from: number, to: number, start: number): string =>
  `between(t,${start},${start + WOOF_YIP})*sin(PI*(t-${start})/${WOOF_YIP})*sin(2*PI*(${from}*(t-${start})-${from - to}/(2*${WOOF_YIP})*(t-${start})*(t-${start})))`;
const WOOF_EXPR = `0.1*(${yip(700, 520, 0.01)}+${yip(640, 500, 0.2)})`;
// --- sfx.shell.chirp (Story 5.4: creature decoration tap) --------------------------------
// Two soft high chirps, each a sine sweeping up under a sin envelope: 1200 → 1600 Hz then 1400 → 1800 Hz,
// 0.12 s each with a 0.05 s gap (300 ms ≤ 400 ms). Peak 0.1 = −20 dBFS, cubic 50 ms fade-in, highpass 150 Hz.
export const CHIRP_PARTIALS = [1200, 1600, 1400, 1800] as const;
export const CHIRP_SECONDS = 0.3;
const CHIRP_NOTE = 0.12;
const chirpNote = (from: number, to: number, start: number): string =>
  `between(t,${start},${start + CHIRP_NOTE})*sin(PI*(t-${start})/${CHIRP_NOTE})*sin(2*PI*(${from}*(t-${start})+${to - from}/(2*${CHIRP_NOTE})*(t-${start})*(t-${start})))`;
const CHIRP_EXPR = `0.1*(${chirpNote(1200, 1600, 0.01)}+${chirpNote(1400, 1800, 0.18)})`;
// apatosaurus: a soft two-note hoot G4 392 → E4 330 Hz, 0.3 s each (600 ms).
const DN_APATO_SECONDS = 0.6;
const DN_APATO_EXPR = `0.1*(${tuneNote(392, 0, 0.3)}+${tuneNote(330, 0.3, 0.3)})`;
// triceratops: two chirps E5 659 / G5 784 Hz, 0.18 s each with a 0.02 s gap (400 ms).
const DN_TRI_SECONDS = 0.4;
const DN_TRI_EXPR = `0.1*(${tuneNote(659, 0.01, 0.18)}+${tuneNote(784, 0.21, 0.18)})`;
// stegosaurus: a trill around C5 523 Hz (± 30 Hz at 12 Hz) under one sin envelope (500 ms).
const DN_STEG_SECONDS = 0.5;
const DN_STEG_EXPR = `0.1*sin(PI*t/${DN_STEG_SECONDS})*sin(2*PI*523*t-2.5*cos(2*PI*12*t))`;

// --- Hang tìm bóng (Story 3.5) ------------------------------------------------------
// The dino recipes: every partial ≥ 300 Hz, 50 ms fade-in, highpass 150 Hz, peak ≤ 0.1 = −20 dBFS.
export const SHADOW_PARTIALS = {
  'sfx.shadow-match.snap': [600, 340],
  'sfx.shadow-match.happy': [523, 659, 784, 1047],
} as const;
// snap: a soft "pụp" ~150 ms, a sine sweeping down 600 → 340 Hz with an exponential tail.
const SM_SNAP_SECONDS = 0.15;
const SM_SNAP_EXPR = `0.1*exp(-25*t)*sin(2*PI*(600*t-(600-340)/(2*${SM_SNAP_SECONDS})*t*t))`;
// happy: a C-major arpeggio C5 523 → E5 659 → G5 784 → C6 1047, the last note held (1.5 s).
const SM_TUNE_EXPR = `0.1*(${[
  ...[523, 659, 784].map((hz, i) => tuneNote(hz, Number((i * TUNE_NOTE).toFixed(2)), TUNE_NOTE)),
  tuneNote(1047, Number((TUNE_NOTE * 3).toFixed(2)), TUNE_LAST),
].join('+')})`;
// 2026-10-22: the triceratops' chirp (sfx.shadow-match.trike.happy) is gone with the dinosaur.

// --- Đường đua (Story 4.1) --------------------------------------------------------
// Every partial ≥ 300 Hz, 50 ms fade-in, highpass 150 Hz, peak ≤ 0.1 = −20 dBFS. RACE_PARTIALS lists the
// frequencies each expression uses (tested ≥ 300 Hz).
export const RACE_PARTIALS = {
  'sfx.race.engine': [330, 660, 520, 1040],
  'sfx.race.horn': [784, 988],
  'sfx.race.happy': [587, 740, 880, 1175],
} as const;
// engine: a soft rising "vroom" ~400 ms — a fundamental sweeping 330 → 520 Hz with its octave, swelling then fading.
const RC_ENGINE_SECONDS = 0.4;
const RC_ENGINE_EXPR = `0.1*sin(PI*t/${RC_ENGINE_SECONDS})*(0.7*sin(2*PI*(330*t+(520-330)/(2*${RC_ENGINE_SECONDS})*t*t))+0.3*sin(2*PI*(660*t+(1040-660)/(2*${RC_ENGINE_SECONDS})*t*t)))`;
// horn: a happy two-tone beep G5 784 then B5 988, 0.15 s each (0.3 s).
const RC_HORN_SECONDS = 0.3;
const RC_HORN_EXPR = `0.1*(${tuneNote(784, 0, 0.15)}+${tuneNote(988, 0.15, 0.15)})`;
// happy: a D-major arpeggio D5 587 → F#5 740 → A5 880 → D6 1175, the last note held (1.5 s).
const RC_TUNE_EXPR = PZ_TUNE_EXPR;

// --- Câu cá (Story 4.3) ------------------------------------------------------------
// Every partial ≥ 300 Hz, 50 ms fade-in, highpass 150 Hz, peak ≤ 0.1 = −20 dBFS. FISHING_PARTIALS lists the
// frequencies each expression uses (tested ≥ 300 Hz).
export const FISHING_PARTIALS = {
  'sfx.fishing.plop': [520, 320],
  'sfx.fishing.bubble': [700, 900, 1100],
  'sfx.fishing.reel': [1200, 2400],
  'sfx.fishing.happy': [523, 659, 784, 1047],
} as const;
// plop: a soft "tõm" ~200 ms — a sine sweeping down 520 → 320 Hz, decaying exponentially.
const FS_PLOP_SECONDS = 0.2;
const FS_PLOP_EXPR = `0.1*exp(-18*t)*sin(2*PI*(520*t-(520-320)/(2*${FS_PLOP_SECONDS})*t*t))`;
// bubble: three rising blips 700 / 900 / 1100 Hz, 0.1 s each, 0.15 s apart (0.4 s).
const FS_BUBBLE_SECONDS = 0.4;
const FS_BUBBLE_EXPR = `0.1*(${tuneNote(700, 0, 0.1)}+${tuneNote(900, 0.15, 0.1)}+${tuneNote(1100, 0.3, 0.1)})`;
// reel: a soft ratchet ~600 ms — 12 short clicks (1200 Hz + its octave), one every 50 ms.
const FS_REEL_SECONDS = 0.6;
const FS_REEL_EXPR = `0.1*(0.5+0.5*cos(2*PI*20*t))^8*(0.7*sin(2*PI*1200*t)+0.3*sin(2*PI*2400*t))`;
// happy: a C-major arpeggio C5 523 → E5 659 → G5 784 → C6 1047, the last note held (1.5 s).
const FS_TUNE_EXPR = SM_TUNE_EXPR;

// --- Real recordings ------------------------------------------------------------------
// These ids are CC0 recordings mastered with `npm run audio:normalize` (README provenance), not synthesized:
// this tool has no recipe for them and never overwrites them. Chạm là nói (2026-10-22, batch 3): all 60 prop
// sounds; Tiệm kem (Story 6.1): Shiba's sneeze; Ú òa chuồng thú (Story 7.2): the animals' calls and their muffled copies.
export function isRecording(id: string): boolean {
  return id === 'sfx.ice-cream.sneeze' || id.startsWith('sfx.touch-talk.') || id.startsWith('sfx.animal-pens.');
}

// --- music.island ------------------------------------------------------------
// 12 s loop. Every frequency is an integer Hz (pad C4 262 / E4 330 / G4 392, arpeggio C5 523 /
// E5 659 / G5 784) so every sine completes whole cycles in 12 s; tremolo is 0.25 Hz (3 cycles);
// the arpeggio steps every 0.5 s (24 steps = 8×C-E-G) with a sin² envelope that is 0 at each
// step edge — so the file loops seamlessly. Mastered with loudnorm I=-30 (music ≤ −30 LUFS).
const MUSIC_SECONDS = 12;
const ARP_NOTE = 'if(eq(mod(floor(t*2),3),0),523,if(eq(mod(floor(t*2),3),1),659,784))';
const PAD = '0.15*(sin(2*PI*262*t)+sin(2*PI*330*t)+sin(2*PI*392*t))/3*(0.85+0.15*sin(2*PI*0.25*t))';
const ARP = `0.12*pow(sin(PI*mod(t,0.5)/0.5),2)*sin(2*PI*${ARP_NOTE}*t)`;
const MUSIC_EXPR = `${PAD}+${ARP}`;
export const MUSIC_LOUDNORM = 'loudnorm=I=-30:TP=-3';

/** Single-quoted filtergraph value so commas inside the expression are not filter separators. */
function source(expr: string, seconds: number): string[] {
  return ['-f', 'lavfi', '-i', `aevalsrc='${expr}':s=44100:d=${seconds}`];
}

/** ffmpeg arguments that write `id` to `outFile` (pure; unit-tested). */
export function buildArgs(id: AudioId, outFile: string): string[] {
  // Ban nhạc (Story 7.3): the band's notes and its beat have their own recipes (tools/audio/make-band.ts).
  const band = bandArgs(id, outFile);
  if (band) return band;
  // Giờ đi ngủ (Story 7.4): its soft sounds and its lullaby have their own recipes (tools/audio/make-bedtime.ts).
  const bedtime = bedtimeArgs(id, outFile);
  if (bedtime) return bedtime;
  // Bác sĩ thú cưng (Story 8.1): the splash, burp, gurgle and pat have their own recipes (tools/audio/make-pet-clinic.ts).
  const clinic = petClinicArgs(id, outFile);
  if (clinic) return clinic;
  // Thay đồ cho Shiba (Story 8.2): the pop has its own recipe (tools/audio/make-dress-up.ts).
  const dressUp = dressUpArgs(id, outFile);
  if (dressUp) return dressUp;
  // Trồng cây (2026-10-30): the pour, pop, crunch and slurp have their own recipes (tools/audio/make-garden.ts).
  const garden = gardenArgs(id, outFile);
  if (garden) return garden;
  // Rửa xe (2026-10-30): the squish, chime, sirens and low honk have their own recipes (tools/audio/make-car-wash.ts).
  const carWash = carWashArgs(id, outFile);
  if (carWash) return carWash;
  // Phi công nhí (2026-11-11): the propeller, whoosh and boing have their own recipes (tools/audio/make-plane.ts).
  const plane = planeArgs(id, outFile);
  if (plane) return plane;
  // Tàu hỏa chở bạn (2026-11-12): the toot, chug, puff and hiss have their own recipes (tools/audio/make-train.ts).
  const train = trainArgs(id, outFile);
  if (train) return train;
  switch (id) {
    case 'sfx.shell.pop':
      return ['-hide_banner', '-y', ...source(POP_EXPR, POP_SECONDS), '-af', POP_FILTER, ...ENCODE, outFile];
    case 'sfx.shell.happy':
      return ['-hide_banner', '-y', ...source(HAPPY_EXPR, HAPPY_SECONDS), '-af', HAPPY_FILTER, ...ENCODE, outFile];
    case 'sfx.shell.prop':
      return ['-hide_banner', '-y', ...source(PROP_EXPR, PROP_SECONDS), '-af', PROP_FILTER, ...ENCODE, outFile];
    case 'sfx.shell.kart-beep':
      return ['-hide_banner', '-y', ...source(BEEP_EXPR, BEEP_SECONDS), '-af', BEEP_FILTER, ...ENCODE, outFile];
    case 'sfx.shell.woof':
      return ['-hide_banner', '-y', ...source(WOOF_EXPR, WOOF_SECONDS), '-af', CREATURE_FILTER, ...ENCODE, outFile];
    case 'sfx.shell.chirp':
      return ['-hide_banner', '-y', ...source(CHIRP_EXPR, CHIRP_SECONDS), '-af', CREATURE_FILTER, ...ENCODE, outFile];
    case 'sfx.ice-cream.snap':
      return ['-hide_banner', '-y', ...source(SNAP_EXPR, SNAP_SECONDS), '-af', SNAP_FILTER, ...ENCODE, outFile];
    case 'sfx.ice-cream.happy':
      return ['-hide_banner', '-y', ...source(TUNE_EXPR, TUNE_SECONDS), '-af', TUNE_FILTER, ...ENCODE, outFile];
    case 'sfx.pizza.snap':
      return ['-hide_banner', '-y', ...source(PZ_SNAP_EXPR, PZ_SNAP_SECONDS), '-af', PZ_SNAP_FILTER, ...ENCODE, outFile];
    case 'sfx.pizza.ting':
      return ['-hide_banner', '-y', ...source(PZ_TING_EXPR, PZ_TING_SECONDS), '-af', PZ_TING_FILTER, ...ENCODE, outFile];
    case 'sfx.pizza.munch':
      return ['-hide_banner', '-y', ...source(PZ_MUNCH_EXPR, PZ_MUNCH_SECONDS), '-af', PZ_MUNCH_FILTER, ...ENCODE, outFile];
    case 'sfx.pizza.happy':
      return ['-hide_banner', '-y', ...source(PZ_TUNE_EXPR, TUNE_SECONDS), '-af', TUNE_FILTER, ...ENCODE, outFile];
    case 'sfx.dino-puzzle.snap':
      return ['-hide_banner', '-y', ...source(DN_SNAP_EXPR, DN_SNAP_SECONDS), '-af', PZ_SNAP_FILTER, ...ENCODE, outFile];
    case 'sfx.dino-puzzle.happy':
      return ['-hide_banner', '-y', ...source(DN_TUNE_EXPR, TUNE_SECONDS), '-af', TUNE_FILTER, ...ENCODE, outFile];
    case 'sfx.dino-puzzle.apatosaurus.happy':
      return ['-hide_banner', '-y', ...source(DN_APATO_EXPR, DN_APATO_SECONDS), '-af', CREATURE_FILTER, ...ENCODE, outFile];
    case 'sfx.dino-puzzle.triceratops.happy':
      return ['-hide_banner', '-y', ...source(DN_TRI_EXPR, DN_TRI_SECONDS), '-af', CREATURE_FILTER, ...ENCODE, outFile];
    case 'sfx.dino-puzzle.stegosaurus.happy':
      return ['-hide_banner', '-y', ...source(DN_STEG_EXPR, DN_STEG_SECONDS), '-af', CREATURE_FILTER, ...ENCODE, outFile];
    case 'sfx.shadow-match.snap':
      return ['-hide_banner', '-y', ...source(SM_SNAP_EXPR, SM_SNAP_SECONDS), '-af', PZ_SNAP_FILTER, ...ENCODE, outFile];
    case 'sfx.shadow-match.happy':
      return ['-hide_banner', '-y', ...source(SM_TUNE_EXPR, TUNE_SECONDS), '-af', TUNE_FILTER, ...ENCODE, outFile];
    case 'sfx.race.engine':
      return ['-hide_banner', '-y', ...source(RC_ENGINE_EXPR, RC_ENGINE_SECONDS), '-af', TUNE_FILTER, ...ENCODE, outFile];
    case 'sfx.race.horn':
      return ['-hide_banner', '-y', ...source(RC_HORN_EXPR, RC_HORN_SECONDS), '-af', TUNE_FILTER, ...ENCODE, outFile];
    case 'sfx.race.happy':
      return ['-hide_banner', '-y', ...source(RC_TUNE_EXPR, TUNE_SECONDS), '-af', TUNE_FILTER, ...ENCODE, outFile];
    case 'sfx.fishing.plop':
      return ['-hide_banner', '-y', ...source(FS_PLOP_EXPR, FS_PLOP_SECONDS), '-af', TUNE_FILTER, ...ENCODE, outFile];
    case 'sfx.fishing.bubble':
      return ['-hide_banner', '-y', ...source(FS_BUBBLE_EXPR, FS_BUBBLE_SECONDS), '-af', TUNE_FILTER, ...ENCODE, outFile];
    case 'sfx.fishing.reel':
      return ['-hide_banner', '-y', ...source(FS_REEL_EXPR, FS_REEL_SECONDS), '-af', TUNE_FILTER, ...ENCODE, outFile];
    case 'sfx.fishing.happy':
      return ['-hide_banner', '-y', ...source(FS_TUNE_EXPR, TUNE_SECONDS), '-af', TUNE_FILTER, ...ENCODE, outFile];
    case 'music.island':
      return ['-hide_banner', '-y', ...source(MUSIC_EXPR, MUSIC_SECONDS), '-af', MUSIC_LOUDNORM, ...ENCODE, outFile];
    default:
      throw new Error(`audio:placeholders: no recipe for "${id}"`);
  }
}

export type { Probe } from '../shared/binaries.ts';

/** Resolves the ffmpeg binary: FFMPEG_BIN, else `ffmpeg` on PATH; throws a clear error otherwise. */
export function resolveFfmpeg(env: Env, probe: Probe = probeBinary): string {
  return resolveBinary(FFMPEG, env, probe);
}

function main(): void {
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  let ffmpeg: string;
  try {
    ffmpeg = resolveFfmpeg(process.env);
  } catch (error) {
    console.error(`audio:placeholders: ${(error as Error).message}`);
    process.exit(1);
  }
  const entries = Object.entries(AUDIO_CATALOG) as Array<[AudioId, (typeof AUDIO_CATALOG)[AudioId]]>;
  // Every recording must exist before anything is regenerated, so a failed run never leaves a half-updated public/.
  const missing = entries.filter(([id, e]) => isRecording(id) && !existsSync(resolve(appRoot, 'public', e.path)));
  if (missing.length > 0) {
    for (const [, e] of missing) console.error(`audio:placeholders: the recording public/${e.path} is missing — master it with npm run audio:normalize (README provenance)`);
    process.exit(1);
  }
  for (const [id, entry] of entries) {
    const out = resolve(appRoot, 'public', entry.path);
    if (isRecording(id)) {
      console.log(`audio:placeholders: kept the recording public/${entry.path}`);
      continue;
    }
    mkdirSync(dirname(out), { recursive: true });
    const r = spawnSync(ffmpeg, buildArgs(id, out), { encoding: 'utf8' });
    if (r.status !== 0 || !existsSync(out)) {
      console.error(`audio:placeholders: ffmpeg failed for ${id}\n${r.stderr}`);
      process.exit(1);
    }
    console.log(`audio:placeholders: wrote public/${entry.path}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
