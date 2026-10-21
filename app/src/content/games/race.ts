// Đường đua content (Stories 4.1, 4.2): the difficulty ladder (road shapes, roads per round, the layout path ids
// of each level), the screen's layout ids and atlas frames, the kart's art facing, the voice and SFX ids
// and the assets Map loads while the kart drives here. Data only.
import { ATLASES, BACKGROUNDS } from '../assets.ts';
import { VOICE_LINES } from '../voice-lines.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

export type RoadShape = 'straight' | 'curve' | 'zigzag' | 'loop';

export interface RaceLevel {
  readonly id: string;
  readonly shape: RoadShape;
  /** Roads per round (questions). */
  readonly roads: 3 | 4 | 5;
  /** The layout paths (`path.<id>`) a round draws its roads from. */
  readonly pathIds: readonly string[];
}

/** Story 4.2: straight → gentle curve → zigzag → loop; three roads per shape, roads per round 3/4/4/3. */
export const ladder: readonly RaceLevel[] = [
  { id: 'straight', shape: 'straight', roads: 3, pathIds: ['straight-1', 'straight-2', 'straight-3'] },
  { id: 'curve', shape: 'curve', roads: 4, pathIds: ['curve-1', 'curve-2', 'curve-3'] },
  { id: 'zigzag', shape: 'zigzag', roads: 4, pathIds: ['zigzag-1', 'zigzag-2', 'zigzag-3'] },
  { id: 'loop', shape: 'loop', roads: 3, pathIds: ['loop-1', 'loop-2', 'loop-3'] },
];

/** Every path id any level uses (the layout must hold each). */
export const RACE_PATH_IDS: readonly string[] = [...new Set(ladder.flatMap((l) => l.pathIds))];

/** The kart's ground centre between its wheels (`anchor.kart`), the gate's post-feet midpoint (`anchor.gate`). */
export const KART_ANCHOR = 'kart';
export const GATE_ANCHOR = 'gate';
/** The swaying border cones (`anchor.cone-1..n`, Story 4.2: one `sprite.cone` drawn at each). */
export const CONE_COUNT = 4;
export const coneAnchor = (n: number): string => `cone-${n}`;
/** Story 4.2: the swaying flags on the back grass (`anchor.flag-1..2`, one `sprite.flag` drawn at each). */
export const FLAG_COUNT = 2;
export const flagAnchor = (n: number): string => `flag-${n}`;
export const CONE_ANCHORS: readonly string[] = Array.from({ length: CONE_COUNT }, (_, i) => coneAnchor(i + 1));
export const FLAG_ANCHORS: readonly string[] = Array.from({ length: FLAG_COUNT }, (_, i) => flagAnchor(i + 1));

export const KART_WAVE_FRAMES = 4;
const nn = (i: number): string => String(i).padStart(2, '0');
export const kartFrames = {
  idle: 'kart/idle/00',
  wave: Array.from({ length: KART_WAVE_FRAMES }, (_, i) => `kart/wave/${nn(i)}`),
} as const;
export const gateFrames = { idle: 'gate/idle/00' } as const;
export const coneFrame = 'cone/idle/00';
export const flagFrame = 'flag/idle/00';

/** What `race.layout.json` and `atlas.race` must hold. */
export const RACE_SCREEN: ScreenRequirements = {
  anchors: [KART_ANCHOR, GATE_ANCHOR, ...CONE_ANCHORS, ...FLAG_ANCHORS],
  hits: [],
  slots: [],
  frames: [kartFrames.idle, ...kartFrames.wave, gateFrames.idle, coneFrame, flagFrame],
};
export const screen = RACE_SCREEN;

/** The rendered kart drives toward screen-right (+1) at scale 1. */
export const RACE_KART = { artFacing: 1 } as const;

export const RACE_LINES = {
  prompt: 'vo.race.prompt',
  retry: 'vo.race.retry',
} as const;

export const SFX = {
  engine: 'sfx.race.engine',
  horn: 'sfx.race.horn',
  happy: 'sfx.race.happy',
} as const;

export const assets: GameAssets = {
  atlases: [ATLASES.race],
  images: [BACKGROUNDS.race],
  audio: [...VOICE_LINES.map((l) => l.id).filter((id) => id.startsWith('vo.race.')), ...Object.values(SFX)],
};
