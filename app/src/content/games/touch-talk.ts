// Chạm là nói content (Stories 4.5, 4.6): the scenes (one plate each, in bubble order), their props with their sound and name
// lines, the scene-bubble slots reserved on the right edge, and the assets Map loads while the kart drives
// here. There is no ladder: Map always starts touch-talk at level 0 (games/registry.ts › ladderLength).
// Prop ids are kebab, unique across every scene and carry no scene prefix (Story 4.6 counts across scenes).
import { ATLASES, BACKGROUNDS, type BackgroundRef } from '../assets.ts';
import { VOICE_LINES } from '../voice-lines.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

export interface TouchTalkProp {
  readonly id: string;
  /** `sfx.touch-talk.<id>`: its sound on every tap. */
  readonly sfxId: string;
  /** `vo.touch-talk.name.<id>`: its name, said after its sound. */
  readonly nameLineId: string;
}

export interface TouchTalkScene {
  readonly id: string;
  readonly bg: BackgroundRef;
  /** The scene's name (the Speaker before any tap). */
  readonly nameLineId: string;
  readonly props: readonly TouchTalkProp[];
}

const prop = (id: string): TouchTalkProp => ({ id, sfxId: `sfx.touch-talk.${id}`, nameLineId: `vo.touch-talk.name.${id}` });

/** The sea props (Story 4.5). */
export const SEA_PROP_IDS = ['boat', 'fish', 'crab', 'starfish', 'parasol', 'bucket', 'seagull', 'coconut', 'shell', 'beach-ball'] as const;

/** Story 4.6: the street and kitchen props. */
export const STREET_PROP_IDS = ['car', 'bus', 'traffic-light', 'tree', 'house', 'police-car', 'truck', 'tractor', 'dumpster', 'cone'] as const;
export const KITCHEN_PROP_IDS = ['pot', 'frying-pan', 'apple', 'bread', 'banana', 'carrot', 'mug', 'spoon', 'egg', 'watermelon'] as const;

/** 2026-10-21 (batch 2 of 3): the bathroom, bakery and picnic props. */
export const BATHROOM_PROP_IDS = ['bathtub', 'rubber-duck', 'toothbrush', 'toothbrush-cup', 'towel', 'slippers', 'mirror', 'shampoo', 'soap', 'potty'] as const;
export const BAKERY_PROP_IDS = ['birthday-cake', 'cupcake', 'donut', 'cookie', 'croissant', 'muffin', 'waffle', 'apple-pie', 'cinnamon-roll', 'chocolate-cake'] as const;
export const PICNIC_PROP_IDS = ['picnic-basket', 'sandwich', 'grapes', 'cheese', 'teapot', 'frisbee', 'radio', 'cooler', 'pillow', 'butterfly'] as const;

/** The scenes in bubble order (core/scene-bubbles.ts: the column under the Speaker top to bottom, then the column to its left). */
export const TOUCH_TALK_SCENES: readonly TouchTalkScene[] = [
  { id: 'sea', bg: BACKGROUNDS['touch-talk-sea'], nameLineId: 'vo.touch-talk.scene.sea', props: SEA_PROP_IDS.map(prop) },
  { id: 'street', bg: BACKGROUNDS['touch-talk-street'], nameLineId: 'vo.touch-talk.scene.street', props: STREET_PROP_IDS.map(prop) },
  { id: 'kitchen', bg: BACKGROUNDS['touch-talk-kitchen'], nameLineId: 'vo.touch-talk.scene.kitchen', props: KITCHEN_PROP_IDS.map(prop) },
  { id: 'bathroom', bg: BACKGROUNDS['touch-talk-bathroom'], nameLineId: 'vo.touch-talk.scene.bathroom', props: BATHROOM_PROP_IDS.map(prop) },
  { id: 'bakery', bg: BACKGROUNDS['touch-talk-bakery'], nameLineId: 'vo.touch-talk.scene.bakery', props: BAKERY_PROP_IDS.map(prop) },
  { id: 'picnic', bg: BACKGROUNDS['touch-talk-picnic'], nameLineId: 'vo.touch-talk.scene.picnic', props: PICNIC_PROP_IDS.map(prop) },
];

/** Story 4.6: the round thumbnail of a scene (`scene-thumb-<id>/idle/00`, made by render from its plate). */
export const sceneThumbFrame = (id: string): string => `scene-thumb-${id}/idle/00`;

/** The scene bubbles the right edge keeps clear for (Story 4.6 draws them; 2026-10-21: six, two columns of 3). */
export const TOUCH_TALK_SCENE_SLOTS = 6;

/** A prop's hit polygon id (`hit.prop-<id>`). */
export const propHit = (id: string): string => `prop-${id}`;
const nn = (i: number): string => String(i).padStart(2, '0');
export const propFrames = (id: string) => ({ idle: `${id}/idle/${nn(0)}`, react: `${id}/react/${nn(0)}` }) as const;

/** Every prop of every scene. */
export const ALL_PROPS: readonly TouchTalkProp[] = TOUCH_TALK_SCENES.flatMap((s) => s.props);

/** What `touch-talk.layout.json` and `atlas.touch-talk` must hold. */
export const TOUCH_TALK_SCREEN: ScreenRequirements = {
  anchors: [],
  hits: ALL_PROPS.map((p) => propHit(p.id)),
  slots: [],
  frames: [...ALL_PROPS.flatMap((p) => Object.values(propFrames(p.id))), ...TOUCH_TALK_SCENES.map((s) => sceneThumbFrame(s.id))],
};
export const screen = TOUCH_TALK_SCREEN;

export const assets: GameAssets = {
  atlases: [ATLASES['touch-talk']],
  images: TOUCH_TALK_SCENES.map((s) => s.bg),
  audio: [...VOICE_LINES.map((l) => l.id).filter((id) => id.startsWith('vo.touch-talk.')), ...ALL_PROPS.map((p) => p.sfxId)],
};
