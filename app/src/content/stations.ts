// The Map's stations (Story 1.4). Layout ids on the map (spec 1.4 › Reserved ids):
//   anchors[id] ground pivot, anchors[`${id}-stop`] kart parking point, hits[id] hit polygon,
//   slots[...] decoration slots listed here. `npm run check` validates them against map.layout.json.
// Story 1.5 adds the parent-facing `label` (also the text of `vo.shell.station-name.<id>`) and
// `awake`: only awake stations open a game and get invitations; sleeping ones bounce with a happy
// sound. Story 1.7 may derive `awake` from games/registry.ts instead.
import type { GameId } from './types.ts';

export interface Station {
  readonly id: GameId;
  /** Station label under the station (parent-facing, UX-DR42); same text as its name line. */
  readonly label: string;
  /** True when the station's game is playable (ice-cream; Story 3.1 wakes pizza, Story 3.3 dino-puzzle, Story 3.5 shadow-match, Story 4.1 race, Story 4.3 fishing, Story 4.5 touch-talk). */
  readonly awake: boolean;
  /**
   * Decoration slot ids on the map (`slot.<id>-<n>` objects in art/map.blend), n = 1..k with no gaps.
   * The order is the art pipeline's slot order (build_map.py, the layout checks); the runtime no longer
   * uses slots (island decorations were removed, 2026-10-21).
   */
  readonly slots: readonly string[];
}

/**
 * Decoration slots per station (Story 2.2, review loop 1b): up to 2 points beside each station, placed
 * by build_map.py (SLOT_OFFSETS). A second slot exists only where it fits the decoration rules beside
 * the station (tools/layout/rules.ts › validateDecorations); the rule is >= 1.
 */
const SLOT_COUNT: Readonly<Record<GameId, number>> = {
  'ice-cream': 2,
  pizza: 2,
  race: 2,
  fishing: 1,
  'touch-talk': 1,
  'dino-puzzle': 1,
  'shadow-match': 1,
};

/** The decoration slot ids of a station: `<id>-1..count`. */
export const slotIds = (id: GameId, count: number = SLOT_COUNT[id]): string[] =>
  Array.from({ length: count }, (_, i) => `${id}-${i + 1}`);

const station = (id: GameId, label: string, awake = false): Station => ({
  id,
  label,
  awake,
  slots: slotIds(id),
});

export const STATIONS: readonly Station[] = [
  station('ice-cream', 'Xe kem', true),
  station('pizza', 'Tiệm pizza', true),
  station('race', 'Đường đua', true),
  station('fishing', 'Hồ cá', true),
  station('touch-talk', 'Chạm là nói', true),
  station('dino-puzzle', 'Công viên khủng long', true),
  station('shadow-match', 'Hang tìm bóng', true),
];

/** Where the kart starts on the map (`anchor.kart-start`). */
export const KART_START_ANCHOR = 'kart-start';
/** The kart frame on the map atlas (the Map's tappable prop in Epic 1). */
export const KART_FRAME = 'kart/idle/00';
/** The drivable road centreline (`path.road`). */
export const ROAD_PATH = 'road';
/** The kart parking anchor of a station. */
export const stopAnchor = (id: GameId): string => `${id}-stop`;
/** The idle frame of a station on the map atlas. */
export const stationFrame = (id: string): string => `${id}/idle/00`;
