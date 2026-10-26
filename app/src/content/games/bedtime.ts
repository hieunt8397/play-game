// Giờ đi ngủ content (Story 7.4): a yard game (content/home.ts corner `bed`). A cosy bedroom (`bg.bedtime`,
// tools/render/blender/build_bedtime.py) with the Shiba friend (the real Quaternius ShibaInu, posed from its rig) on
// its bed. Xoài does three things, in any order: the toothbrush (foam, Shiba giggles), the lamp (it clicks off and
// the room fades to a soft blue night, never dark) and the blanket (it covers Shiba, who yawns). A soft glow suggests
// the next step (brush → lamp → blanket) but never enforces it. With all three done Shiba sleeps ("khò khò", floating
// "z"), stars fade in at the window and a self-made lullaby plays; a tap on the sleeping Shiba rolls it over. No new
// round follows (MiniGameBase.finishRoundAndStay); Home goes back to the yard.
//   - frames: `shiba/<pose>/00` (sit, brush, lie, lie-brush, yawn, sleep, roll), `window/night/00` (the night sky
//     and moon over the plate's day window), `blanket/{off,on}/00`,
//     `lamp/{on,off}/00`, `brush/idle/00` and the particles `bubble`, `star`, `z` (`<id>/idle/00`, placed anywhere);
//   - hits: `brush`, `lamp`, `blanket`, `shiba` (each ≥ ui.bedtimeTargetMinPx wide: tools/layout/rules.ts ›
//     validateBedtime);
//   - anchors: `mouth-sit`, `mouth-lie` (the brush scrubs there), `brush-head` (the bristles at rest), `head-sleep`
//     (the "z" rise from it), `lamp` (the lamp's glow) and `star-1`…`star-5` (the window).
// Every sound is synthesised by our own tools (tools/audio/make-bedtime.ts); the brush is the touch-talk
// toothbrush recording.
import { ATLASES, BACKGROUNDS } from '../assets.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

/** The three steps, in the suggested order (the glow goes to the first one not done). */
export const STEP_IDS = ['brush', 'lamp', 'blanket'] as const;
export type BedtimeStep = (typeof STEP_IDS)[number];

export function isStep(id: string): id is BedtimeStep {
  return (STEP_IDS as readonly string[]).includes(id);
}

/** Every tap target: the three steps and the friend. */
export const SHIBA = 'shiba';
export const TARGET_IDS: readonly string[] = [...STEP_IDS, SHIBA];

export const SHIBA_POSES = ['sit', 'brush', 'lie', 'lie-brush', 'yawn', 'sleep', 'roll'] as const;
export type ShibaPose = (typeof SHIBA_POSES)[number];

/** The soft line that suggests each step (said when the glow moves to it; the Speaker replays it). */
export const STEP_LINES: Readonly<Record<BedtimeStep, string>> = {
  brush: 'vo.bedtime.prompt.brush',
  lamp: 'vo.bedtime.prompt.lamp',
  blanket: 'vo.bedtime.prompt.blanket',
};
/** The invitation as a fresh bedtime opens (the child's name, Story 5.2), chained before the first suggestion. */
export const INVITE_LINE = 'vo.bedtime.prompt';
export const GOODNIGHT_LINE = 'vo.bedtime.goodnight';
export const PARENT_LINE = 'vo.bedtime.parent.1';

/** Sounds: the brush (a real toothbrush recording, Chạm là nói), then our own soft synth sounds. */
export const SFX = {
  scrub: 'sfx.touch-talk.toothbrush',
  giggle: 'sfx.bedtime.giggle',
  click: 'sfx.bedtime.click',
  blanket: 'sfx.bedtime.blanket',
  yawn: 'sfx.bedtime.yawn',
  snore: 'sfx.bedtime.snore',
  sigh: 'sfx.bedtime.sigh',
} as const;

/** The lullaby (a music loop, ≤ −30 LUFS, ducked under every voice line). Boot loads it with the other music. */
export const LULLABY = 'music.bedtime-lullaby';

export const STAR_COUNT = 5;
export const STAR_ANCHORS: readonly string[] = Array.from({ length: STAR_COUNT }, (_, i) => `star-${i + 1}`);
export const ANCHORS = { mouthSit: 'mouth-sit', mouthLie: 'mouth-lie', brushHead: 'brush-head', headSleep: 'head-sleep', lamp: 'lamp' } as const;

export const shibaFrame = (pose: ShibaPose): string => `shiba/${pose}/00`;
export const FRAMES = {
  /** Review: the night sky and moon in the window (its frame and the curtains cut it), faded in with the night. */
  windowNight: 'window/night/00',
  blanketOff: 'blanket/off/00',
  blanketOn: 'blanket/on/00',
  lampOn: 'lamp/on/00',
  lampOff: 'lamp/off/00',
  brush: 'brush/idle/00',
  bubble: 'bubble/idle/00',
  star: 'star/idle/00',
  z: 'z/idle/00',
} as const;

/** What `bedtime.layout.json` and `atlas.bedtime` must hold. */
export const BEDTIME_SCREEN: ScreenRequirements = {
  anchors: [...Object.values(ANCHORS), ...STAR_ANCHORS],
  hits: [...TARGET_IDS],
  slots: [],
  frames: [...SHIBA_POSES.map(shibaFrame), ...Object.values(FRAMES)],
};
export const screen = BEDTIME_SCREEN;

export const assets: GameAssets = {
  atlases: [ATLASES.bedtime],
  images: [BACKGROUNDS.bedtime],
  // The lullaby (a music.* id) is loaded by Boot with the other music for the session (core/boot-load).
  audio: [INVITE_LINE, ...Object.values(STEP_LINES), GOODNIGHT_LINE, PARENT_LINE, ...Object.values(SFX)],
};
