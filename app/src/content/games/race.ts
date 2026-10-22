// Đường đua content (Stories 4.1, 4.2): the difficulty ladder (road shapes, roads per round, the layout path ids
// of each level), the screen's layout ids and atlas frames, the kart's art facing, the voice and SFX ids
// and the assets Map loads while the kart drives here. Data only.
import { ATLASES, BACKGROUNDS } from '../assets.ts';
import { VOICE_LINES } from '../voice-lines.ts';
import type { GameAssets, ScreenRequirements } from './types.ts';

export type RoadShape = 'straight' | 'curve' | 'zigzag' | 'loop' | 'wave' | 'hairpin' | 'snake' | 'spiral';

export interface RaceLevel {
  readonly id: string;
  readonly shape: RoadShape;
  /** Roads per round (questions). */
  readonly roads: 3 | 4 | 5;
  /** The layout paths (`path.<id>`) a round draws its roads from. */
  readonly pathIds: readonly string[];
}

/**
 * Story 4.2: straight → gentle curve → zigzag → loop; three roads per shape, roads per round 3/4/4/3.
 * 2026-10-22 (harder roads): appended after the loop, never inserted, so a saved level keeps its shape:
 * wave (2–2½ sine periods) → hairpin (out, a U-turn, back) → snake (three rows) → spiral (1¼ turns inward);
 * roads per round 4/4/5/5. Longer and twistier only: the band width and the trace tolerance are unchanged.
 */
export const ladder: readonly RaceLevel[] = [
  { id: 'straight', shape: 'straight', roads: 3, pathIds: ['straight-1', 'straight-2', 'straight-3'] },
  { id: 'curve', shape: 'curve', roads: 4, pathIds: ['curve-1', 'curve-2', 'curve-3'] },
  { id: 'zigzag', shape: 'zigzag', roads: 4, pathIds: ['zigzag-1', 'zigzag-2', 'zigzag-3'] },
  { id: 'loop', shape: 'loop', roads: 3, pathIds: ['loop-1', 'loop-2', 'loop-3'] },
  { id: 'wave', shape: 'wave', roads: 4, pathIds: ['wave-1', 'wave-2', 'wave-3'] },
  { id: 'hairpin', shape: 'hairpin', roads: 4, pathIds: ['hairpin-1', 'hairpin-2', 'hairpin-3'] },
  { id: 'snake', shape: 'snake', roads: 5, pathIds: ['snake-1', 'snake-2', 'snake-3'] },
  { id: 'spiral', shape: 'spiral', roads: 5, pathIds: ['spiral-1', 'spiral-2', 'spiral-3'] },
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
/**
 * 2026-10-22 (the gate faces the road): the arch rendered at these yaws (degrees; 0 = facing the camera,
 * posts left/right; symmetric, so 0–150 covers every crossing), one frame `gate/<deg>/00` each, all with the
 * pivot `anchor.gate`. Per yaw the layout holds `anchor.gate-cross-<deg>` (the pivot plus the on-screen
 * direction a road crosses that frame) and `anchor.gate-post-<deg>` (one post foot).
 */
export const GATE_YAWS = [0, 30, 60, 90, 120, 150] as const;
/** The arch looks the same turned by this (degrees): yaws compare modulo it. */
export const GATE_SYMMETRY_DEG = 180;
export const gateFrame = (deg: number): string => `gate/${deg}/00`;
export const gateCrossAnchor = (deg: number): string => `gate-cross-${deg}`;
export const gatePostAnchor = (deg: number): string => `gate-post-${deg}`;
/** The camera-facing frame (0°): the size rule's frame. */
export const gateFrames = { front: gateFrame(0), all: GATE_YAWS.map(gateFrame) } as const;
export const GATE_YAW_ANCHORS: readonly string[] = GATE_YAWS.flatMap((d) => [gateCrossAnchor(d), gatePostAnchor(d)]);
/**
 * The gate's pivot sits ui.raceGateBackPx of arc before a road's end; these roads end so near the Speaker
 * that the arch would reach into its keep-out zone there, so their arch stands this much further back
 * (validateRace checks every road's arch rect and posts).
 */
export const GATE_BACK_PX: Readonly<Record<string, number>> = { 'curve-3': 20, 'wave-3': 20, 'zigzag-3': 46 };
export const gateBackPx = (pathId: string, fallback: number): number => GATE_BACK_PX[pathId] ?? fallback;
export const coneFrame = 'cone/idle/00';
export const flagFrame = 'flag/idle/00';

/** What `race.layout.json` and `atlas.race` must hold. */
export const RACE_SCREEN: ScreenRequirements = {
  anchors: [KART_ANCHOR, GATE_ANCHOR, ...GATE_YAW_ANCHORS, ...CONE_ANCHORS, ...FLAG_ANCHORS],
  hits: [],
  slots: [],
  frames: [kartFrames.idle, ...kartFrames.wave, ...gateFrames.all, coneFrame, flagFrame],
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
