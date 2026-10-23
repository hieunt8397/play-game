// Map's game / yard navigation decisions (Story 7.1), pure: a reducer over what Map tracks — the running
// game (with its origin) and whether the yard is open — that returns the next state and the effects Map
// applies to Phaser (scene start / stop / sleep / wake, the Hud's Home target, the chain's settled mark).
// Map keeps every Phaser call; Vitest drives these functions directly (core/yard-flow.test.ts).
//   - navEnterYard: the home station's trip ended — the yard is open (Map starts it and sleeps).
//   - navYardOpen: the yard's `yard:open` (routeYardOpen) — start the corner's game with origin 'yard'.
//   - navRestart: seamless play — restart the running game in place, keeping its origin.
//   - navReturn: a fade return (`round:leave` of a yard game, `round:abandon`, a leave during a chain) — stop
//     the game, forget its settled mark, wake the yard (yard game) or Map (island game).
//   - navLeaveYard: Home in the yard — stop the yard and wake Map with the kart at the home station.
//   - navYardClosed: the yard scene shut down.
import { HOME_STATION, type StationId } from '../content/stations';
import type { GameId, GameStartData } from '../content/types';
import type { HomeTarget } from './hud-mode';
import { returnTarget, routeYardOpen, type RunningGame } from './post-round-chain';

export interface ShellNav {
  readonly running: RunningGame | undefined;
  readonly yardOpen: boolean;
}

export type ShellEffect =
  | { readonly kind: 'setHomeTarget'; readonly target: HomeTarget }
  | { readonly kind: 'startGame'; readonly gameId: GameId; readonly data: GameStartData }
  | { readonly kind: 'restartGame'; readonly gameId: GameId; readonly data: GameStartData }
  | { readonly kind: 'stopGame'; readonly gameId: GameId }
  | { readonly kind: 'forget'; readonly gameId: GameId }
  | { readonly kind: 'sleepYard' }
  | { readonly kind: 'wakeYard' }
  | { readonly kind: 'stopYard' }
  /** Wake Map; `parkAt`: the station whose stop the kart parks at (SessionStore.lastStation). */
  | { readonly kind: 'wakeMap'; readonly parkAt?: StationId };

export interface NavStep {
  readonly state: ShellNav;
  readonly effects: readonly ShellEffect[];
}

const same = (state: ShellNav): NavStep => ({ state, effects: [] });

export const INITIAL_NAV: ShellNav = { running: undefined, yardOpen: false };

export function navEnterYard(state: ShellNav): NavStep {
  return { state: { ...state, yardOpen: true }, effects: [] };
}

export function navYardClosed(state: ShellNav): NavStep {
  return { state: { ...state, yardOpen: false }, effects: [] };
}

/**
 * `yard:open`: only with the yard open, no game and no chain running and a registered id
 * (core/post-round-chain › routeYardOpen). `startData` is takeStartData (it consumes a held resume point).
 */
export function navYardOpen(
  state: ShellNav,
  gameId: string,
  ctx: { readonly chainActive: boolean; readonly isGame: (id: string) => id is GameId; readonly startData: (id: GameId) => GameStartData },
): NavStep {
  const route = routeYardOpen(state.running, gameId, { yardOpen: state.yardOpen, chainActive: ctx.chainActive }, ctx.isGame);
  if (route.action !== 'open') return same(state);
  const data = ctx.startData(route.gameId);
  return {
    state: { ...state, running: { id: route.gameId, level: data.level, origin: 'yard' } },
    effects: [{ kind: 'setHomeTarget', target: 'yard' }, { kind: 'startGame', gameId: route.gameId, data }, { kind: 'sleepYard' }],
  };
}

/** Seamless play: the running game restarts in place with its next start data; its origin is kept. */
export function navRestart(state: ShellNav, gameId: GameId, startData: (id: GameId) => GameStartData): NavStep {
  const run = state.running;
  if (!run || run.id !== gameId) return same(state);
  const data = startData(gameId);
  return { state: { ...state, running: { ...run, level: data.level } }, effects: [{ kind: 'restartGame', gameId, data }] };
}

/** The fade return of the running game: to the yard for a yard game, else to the island. */
export function navReturn(state: ShellNav, gameId: string): NavStep {
  const run = state.running;
  if (!run || run.id !== gameId) return same(state);
  const toYard = returnTarget(run) === 'yard';
  return {
    state: { ...state, running: undefined },
    effects: [{ kind: 'forget', gameId: run.id }, { kind: 'stopGame', gameId: run.id }, toYard ? { kind: 'wakeYard' } : { kind: 'wakeMap' }],
  };
}

/** Home in the yard (`yard:leave`): only while the yard is open and no game runs. */
export function navLeaveYard(state: ShellNav): NavStep {
  if (!state.yardOpen || state.running) return same(state);
  return { state: { ...state, yardOpen: false }, effects: [{ kind: 'stopYard' }, { kind: 'wakeMap', parkAt: HOME_STATION }] };
}
