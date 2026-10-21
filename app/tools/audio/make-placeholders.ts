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
  'sfx.shadow-match.trike.happy': [659, 784],
} as const;
// snap: a soft "pụp" ~150 ms, a sine sweeping down 600 → 340 Hz with an exponential tail.
const SM_SNAP_SECONDS = 0.15;
const SM_SNAP_EXPR = `0.1*exp(-25*t)*sin(2*PI*(600*t-(600-340)/(2*${SM_SNAP_SECONDS})*t*t))`;
// happy: a C-major arpeggio C5 523 → E5 659 → G5 784 → C6 1047, the last note held (1.5 s).
const SM_TUNE_EXPR = `0.1*(${[
  ...[523, 659, 784].map((hz, i) => tuneNote(hz, Number((i * TUNE_NOTE).toFixed(2)), TUNE_NOTE)),
  tuneNote(1047, Number((TUNE_NOTE * 3).toFixed(2)), TUNE_LAST),
].join('+')})`;
// trike.happy (creature): the triceratops' two chirps E5 659 / G5 784 Hz, 400 ms (DN_TRI_EXPR).

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

// --- Chạm là nói (Stories 4.5, 4.6) -------------------------------------------------------
// One short sound per prop, ≤ 350 ms (the name follows after Timing.touchTalkNameDelayMs), 50 ms fade-in,
// peak ≤ 0.1 = −20 dBFS. A tonal sound lists its partials (tested ≥ 300 Hz) and is high-passed at 150 Hz;
// a noise sound (splash, whoosh, rustle…) has no partials and is high-passed at `highpass` (≥ 300 Hz).
// `creature` sounds (catalog `creature: true`) use the cubic fade-in of the creature calls.
export interface TouchTalkSound {
  readonly seconds: number;
  readonly expr: string;
  readonly partials: readonly number[];
  readonly highpass?: number;
  readonly creature?: boolean;
}
/** A decaying sine burst: `hz` (+ an overtone at `ratio`) with an exponential tail `k`. */
const ping = (hz: number, k: number, ratio = 0, start = 0): string =>
  `between(t,${start},1)*exp(-${k}*(t-${start}))*(sin(2*PI*${hz}*t)${ratio ? `+0.4*sin(2*PI*${Math.round(hz * ratio)}*t)` : ''})`;
/** Seeded noise (aevalsrc random(0) is deterministic) under an envelope. */
const noise = (env: string): string => `${env}*(2*random(0)-1)`;
export const TOUCH_TALK_SOUNDS: Readonly<Record<string, TouchTalkSound>> = {
  // Sea (Story 4.5).
  'sfx.touch-talk.boat': { seconds: 0.35, expr: `0.1*(${tuneNote(392, 0, 0.15)}+${tuneNote(330, 0.18, 0.15)})`, partials: [392, 330] },
  'sfx.touch-talk.fish': { seconds: 0.25, expr: `0.1*${noise('exp(-14*t)')}`, partials: [], highpass: 1000 },
  'sfx.touch-talk.crab': { seconds: 0.25, expr: `0.1*(${tuneNote(1800, 0.02, 0.04)}+${tuneNote(1800, 0.14, 0.04)})`, partials: [1800] },
  'sfx.touch-talk.starfish': { seconds: 0.3, expr: `0.1*(${tuneNote(1568, 0, 0.12)}+${tuneNote(2093, 0.12, 0.16)})`, partials: [1568, 2093] },
  'sfx.touch-talk.parasol': { seconds: 0.3, expr: `0.1*${noise('sin(PI*t/0.3)')}`, partials: [], highpass: 600 },
  'sfx.touch-talk.bucket': { seconds: 0.3, expr: `0.07*${ping(1400, 12, 2.1)}`, partials: [1400, 2940] },
  'sfx.touch-talk.seagull': { seconds: 0.32, expr: `0.1*(${tuneNote(1200, 0.01, 0.12)}+${tuneNote(1500, 0.17, 0.12)})`, partials: [1200, 1500], creature: true },
  'sfx.touch-talk.coconut': { seconds: 0.2, expr: `0.1*${ping(800, 30)}`, partials: [800] },
  'sfx.touch-talk.shell': { seconds: 0.35, expr: `0.07*${ping(2093, 6, 1.5)}`, partials: [2093, 3140] },
  'sfx.touch-talk.beach-ball': { seconds: 0.3, expr: '0.1*sin(PI*t/0.3)*sin(2*PI*(600*t-(600-350)/(2*0.3)*t*t))', partials: [600, 350] },
  // Street (Story 4.6).
  'sfx.touch-talk.car': { seconds: 0.3, expr: `0.1*(${tuneNote(880, 0, 0.11)}+${tuneNote(880, 0.16, 0.11)})`, partials: [880] },
  'sfx.touch-talk.bus': { seconds: 0.35, expr: `0.1*(${tuneNote(440, 0, 0.15)}+${tuneNote(349, 0.18, 0.15)})`, partials: [440, 349] },
  'sfx.touch-talk.traffic-light': { seconds: 0.3, expr: `0.07*${ping(1319, 10, 2)}`, partials: [1319, 2638] },
  'sfx.touch-talk.tree': { seconds: 0.3, expr: `0.07*${noise('sin(PI*t/0.3)')}`, partials: [], highpass: 2000 },
  'sfx.touch-talk.house': { seconds: 0.3, expr: `0.1*(${ping(500, 40)}+${ping(500, 40, 0, 0.15)})`, partials: [500] },
  'sfx.touch-talk.police-car': { seconds: 0.35, expr: `0.1*(${tuneNote(988, 0, 0.16)}+${tuneNote(784, 0.17, 0.16)})`, partials: [988, 784] },
  'sfx.touch-talk.truck': { seconds: 0.35, expr: `0.1*${tuneNote(311, 0, 0.33)}`, partials: [311] },
  'sfx.touch-talk.tractor': { seconds: 0.35, expr: `0.1*(${ping(420, 30)}+${ping(420, 30, 0, 0.12)}+${ping(420, 30, 0, 0.24)})`, partials: [420] },
  'sfx.touch-talk.dumpster': { seconds: 0.3, expr: `0.07*${ping(600, 14, 2.7)}`, partials: [600, 1620] },
  'sfx.touch-talk.cone': { seconds: 0.2, expr: `0.1*${ping(700, 35)}`, partials: [700] },
  // Kitchen (Story 4.6).
  'sfx.touch-talk.pot': { seconds: 0.35, expr: `0.07*${ping(980, 8, 2.4)}`, partials: [980, 2352] },
  'sfx.touch-talk.frying-pan': { seconds: 0.35, expr: `0.07*${noise('(0.6+0.4*sin(2*PI*30*t))')}`, partials: [], highpass: 3000 },
  'sfx.touch-talk.apple': { seconds: 0.2, expr: `0.1*${noise('exp(-25*t)')}`, partials: [], highpass: 1500 },
  'sfx.touch-talk.bread': { seconds: 0.25, expr: `0.07*${noise('exp(-12*t)*(0.5+0.5*sin(2*PI*40*t))')}`, partials: [], highpass: 2500 },
  'sfx.touch-talk.banana': { seconds: 0.25, expr: `0.07*${noise('sin(PI*t/0.25)')}`, partials: [], highpass: 1200 },
  'sfx.touch-talk.carrot': { seconds: 0.15, expr: `0.1*${noise('exp(-40*t)')}`, partials: [], highpass: 2000 },
  'sfx.touch-talk.mug': { seconds: 0.3, expr: `0.07*${ping(1760, 12, 2.2)}`, partials: [1760, 3872] },
  'sfx.touch-talk.spoon': { seconds: 0.25, expr: `0.07*${ping(2637, 16)}`, partials: [2637] },
  'sfx.touch-talk.egg': { seconds: 0.2, expr: `0.1*${noise('exp(-30*t)')}`, partials: [], highpass: 2500 },
  'sfx.touch-talk.watermelon': { seconds: 0.25, expr: `0.1*${ping(330, 20)}`, partials: [330] },
  // Bathroom (2026-10-21, batch 2; temporary until the CC0 sounds of batch 3).
  'sfx.touch-talk.bathtub': { seconds: 0.3, expr: `0.1*${noise('exp(-10*t)')}`, partials: [], highpass: 800 },
  'sfx.touch-talk.rubber-duck': { seconds: 0.3, expr: `0.1*(${tuneNote(1400, 0, 0.1)}+${tuneNote(1700, 0.14, 0.12)})`, partials: [1400, 1700] },
  'sfx.touch-talk.toothbrush': { seconds: 0.3, expr: `0.07*${noise('sin(PI*t/0.3)*(0.6+0.4*sin(2*PI*20*t))')}`, partials: [], highpass: 3000 },
  'sfx.touch-talk.toothbrush-cup': { seconds: 0.3, expr: `0.07*${ping(2200, 14, 1.8)}`, partials: [2200, 3960] },
  'sfx.touch-talk.towel': { seconds: 0.3, expr: `0.07*${noise('sin(PI*t/0.3)')}`, partials: [], highpass: 800 },
  'sfx.touch-talk.slippers': { seconds: 0.3, expr: `0.1*${noise('(exp(-30*t)+between(t,0.15,1)*exp(-30*(t-0.15)))')}`, partials: [], highpass: 1500 },
  'sfx.touch-talk.mirror': { seconds: 0.3, expr: `0.1*(${tuneNote(2637, 0, 0.12)}+${tuneNote(3136, 0.14, 0.14)})`, partials: [2637, 3136] },
  'sfx.touch-talk.shampoo': { seconds: 0.25, expr: '0.1*sin(PI*t/0.25)*sin(2*PI*(500*t+(900-500)/(2*0.25)*t*t))', partials: [500, 900] },
  'sfx.touch-talk.soap': { seconds: 0.25, expr: `0.1*(${tuneNote(900, 0, 0.08)}+${tuneNote(1200, 0.12, 0.08)})`, partials: [900, 1200] },
  'sfx.touch-talk.potty': { seconds: 0.25, expr: `0.07*(${ping(520, 35)}+${ping(620, 35, 0, 0.12)})`, partials: [520, 620] },
  // Bakery (2026-10-21, batch 2).
  'sfx.touch-talk.birthday-cake': { seconds: 0.35, expr: `0.1*(${tuneNote(1047, 0, 0.09)}+${tuneNote(1319, 0.11, 0.09)}+${tuneNote(1568, 0.22, 0.11)})`, partials: [1047, 1319, 1568] },
  'sfx.touch-talk.cupcake': { seconds: 0.2, expr: `0.1*${ping(900, 25)}`, partials: [900] },
  'sfx.touch-talk.donut': { seconds: 0.3, expr: '0.1*sin(PI*t/0.3)*sin(2*PI*(400*t+(700-400)/(2*0.3)*t*t))', partials: [400, 700] },
  'sfx.touch-talk.cookie': { seconds: 0.25, expr: `0.07*${noise('exp(-20*t)*(0.5+0.5*sin(2*PI*35*t))')}`, partials: [], highpass: 2000 },
  'sfx.touch-talk.croissant': { seconds: 0.25, expr: `0.07*${noise('exp(-14*t)')}`, partials: [], highpass: 3000 },
  'sfx.touch-talk.muffin': { seconds: 0.2, expr: `0.1*${ping(440, 28)}`, partials: [440] },
  'sfx.touch-talk.waffle': { seconds: 0.3, expr: `0.07*(${ping(1600, 40)}+${ping(1600, 40, 0, 0.1)}+${ping(1600, 40, 0, 0.2)})`, partials: [1600] },
  'sfx.touch-talk.apple-pie': { seconds: 0.35, expr: `0.07*${noise('sin(PI*t/0.35)')}`, partials: [], highpass: 1200 },
  'sfx.touch-talk.cinnamon-roll': { seconds: 0.3, expr: '0.1*sin(PI*t/0.3)*sin(2*PI*(900*t-(900-600)/(2*0.3)*t*t))', partials: [900, 600] },
  'sfx.touch-talk.chocolate-cake': { seconds: 0.35, expr: `0.07*${ping(1175, 8, 1.5)}`, partials: [1175, 1763] },
  // Picnic (2026-10-21, batch 2).
  'sfx.touch-talk.picnic-basket': { seconds: 0.3, expr: `0.07*${noise('sin(PI*t/0.3)*(0.5+0.5*sin(2*PI*15*t))')}`, partials: [], highpass: 1500 },
  'sfx.touch-talk.sandwich': { seconds: 0.3, expr: `0.1*${noise('(exp(-18*t)+between(t,0.15,1)*exp(-18*(t-0.15)))')}`, partials: [], highpass: 1800 },
  'sfx.touch-talk.grapes': { seconds: 0.3, expr: `0.07*(${ping(1000, 40)}+${ping(1250, 40, 0, 0.1)}+${ping(1500, 40, 0, 0.2)})`, partials: [1000, 1250, 1500] },
  'sfx.touch-talk.cheese': { seconds: 0.2, expr: `0.1*${ping(750, 22)}`, partials: [750] },
  'sfx.touch-talk.teapot': { seconds: 0.33, expr: `0.1*${tuneNote(1760, 0, 0.32)}`, partials: [1760] },
  'sfx.touch-talk.frisbee': { seconds: 0.3, expr: `0.1*${noise('sin(PI*t/0.3)')}`, partials: [], highpass: 1000 },
  'sfx.touch-talk.radio': { seconds: 0.32, expr: `0.1*(${tuneNote(784, 0, 0.12)}+${tuneNote(988, 0.15, 0.15)})`, partials: [784, 988] },
  'sfx.touch-talk.cooler': { seconds: 0.3, expr: `0.07*${ping(2500, 14, 1.4)}`, partials: [2500, 3500] },
  'sfx.touch-talk.pillow': { seconds: 0.25, expr: `0.1*${noise('exp(-12*t)')}`, partials: [], highpass: 400 },
  'sfx.touch-talk.butterfly': { seconds: 0.28, expr: `0.1*(${tuneNote(2349, 0, 0.1)}+${tuneNote(2794, 0.12, 0.12)})`, partials: [2349, 2794] },
};

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
  const tt = TOUCH_TALK_SOUNDS[id];
  if (tt) {
    const filter = tt.creature ? CREATURE_FILTER : ['afade=t=in:st=0:d=0.05', `highpass=f=${tt.highpass ?? 150}`].join(',');
    return ['-hide_banner', '-y', ...source(tt.expr, tt.seconds), '-af', filter, ...ENCODE, outFile];
  }
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
    case 'sfx.shadow-match.trike.happy':
      return ['-hide_banner', '-y', ...source(DN_TRI_EXPR, DN_TRI_SECONDS), '-af', CREATURE_FILTER, ...ENCODE, outFile];
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
  for (const [id, entry] of Object.entries(AUDIO_CATALOG) as Array<[AudioId, (typeof AUDIO_CATALOG)[AudioId]]>) {
    const out = resolve(appRoot, 'public', entry.path);
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
