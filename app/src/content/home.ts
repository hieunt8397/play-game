// Story 7.1: the yard (sân nhà) behind the island's home station "Nhà Xoài". One 2048×1536 plate
// (`bg.home`, tools/render/blender/build_home.py) with 10 big play corners, each a full-frame sprite
// `<corner>/idle/00` on its ground pivot `anchors[<corner>]`, with its tap area `hits[<corner>]`.
// A corner is awake only when its game is registered (games/registry GAMES — the shell passes that
// check in: content imports no runtime layer). Until then a tap bounces it with a happy sound, like a
// sleeping island station. Story 7.2 (animal-pens), 7.3 (band) and 7.4 (bedtime) wake theirs just by
// registering their game; Epic 8 adds pet-clinic and dress-up; 2026-10-30 the garden corner (Trồng cây, `garden`)
// and the car-wash corner (Rửa xe, `car-wash`; the front row re-laid to four corners); 2026-11-11 the plane corner
// (Phi công nhí, `plane`; the back row re-laid to four corners: 4 + 4); 2026-11-12 the train corner (Tàu hỏa chở bạn,
// `train`; up by the fence at the top left, the back row stepping aside: 1 + 4 + 4); 2026-11-12 the rocket corner
// (Tên lửa lên Mặt Trăng, `rocket`; tall and narrow at the top right under the Speaker zone, the plane stepping down).
// 2026-11-13 (spec-dao-moi-xe-ra-dao): the plane, the train and the rocket left for the island (content/stations.ts ›
// RIDES); 7 corners stay (spec-nha-xoai-nha-bup-be re-lays them as a dollhouse and its yard).
import { ATLASES, BACKGROUNDS } from './assets.ts';
import type { GameAssets, ScreenRequirements } from './games/types.ts';

/** The yard's screen id (assets, layout, render) and its Phaser scene key. */
export const HOME_SCREEN = 'home' as const;
export const YARD_SCENE_KEY = 'HomeYard';

export const CORNER_IDS = ['pen', 'stage', 'bed', 'clinic', 'wardrobe', 'garden', 'car-wash'] as const;
export type CornerId = (typeof CORNER_IDS)[number];

export interface YardCorner {
  readonly id: CornerId;
  /** The scene key of the corner's game (a GameId once that game is registered). */
  readonly gameId: string;
  /** Parent-facing label under the corner (same text as its name line). */
  readonly label: string;
}

/** The 10 corners (2026-10-30: the garden, front row between the clinic and the bed; the car wash, front row far right; 2026-11-11: the plane, back row; 2026-11-12: the train, top left by the fence; the rocket, top right under the Speaker zone). */
export const YARD_CORNERS: readonly YardCorner[] = [
  { id: 'pen', gameId: 'animal-pens', label: 'Chuồng thú' },
  { id: 'stage', gameId: 'band', label: 'Sân khấu' },
  { id: 'bed', gameId: 'bedtime', label: 'Giường ngủ' },
  { id: 'clinic', gameId: 'pet-clinic', label: 'Phòng khám' },
  { id: 'wardrobe', gameId: 'dress-up', label: 'Tủ đồ' },
  { id: 'garden', gameId: 'garden', label: 'Vườn' },
  { id: 'car-wash', gameId: 'car-wash', label: 'Rửa xe' },
];

/** A corner with its awake flag. */
export interface YardCornerState extends YardCorner {
  readonly awake: boolean;
}

/** The corners with `awake` derived from the registry check (`isGameId` of games/registry). */
export function yardCorners(isPlayable: (gameId: string) => boolean, corners: readonly YardCorner[] = YARD_CORNERS): YardCornerState[] {
  return corners.map((c) => ({ ...c, awake: isPlayable(c.gameId) }));
}

/** A corner's frames: idle (the bounce is a scale motion on the same frame). */
export const cornerFrame = (id: CornerId): string => `${id}/idle/00`;

/** The name line of a corner (said on an awake tap; the yard's Speaker prompt after its game). */
export const cornerNameLine = (id: CornerId): string => `vo.shell.corner-name.${id}`;

/** The yard's invitation ("Xoài ơi, chơi gì ở nhà nào?"), said on entry and the Speaker prompt there. */
export const YARD_INVITE_LINE = 'vo.shell.invite.yard';

/** What the yard's screen must provide (`npm run check` › validateHome). */
export const HOME_SCREEN_REQUIREMENTS: ScreenRequirements = {
  anchors: [...CORNER_IDS],
  hits: [...CORNER_IDS],
  slots: [],
  frames: CORNER_IDS.map(cornerFrame),
};

/** What Map loads while the kart drives to the home station (released when the yard shuts down). */
export const HOME_ASSETS: GameAssets = {
  atlases: [ATLASES.home],
  images: [BACKGROUNDS.home],
  audio: [],
};
