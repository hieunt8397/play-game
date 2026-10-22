// Hud mode (Story 1.6): 'map' shows only the Speaker; 'game' adds Home. Map sets 'map' on create,
// Story 1.7's MiniGameBase sets 'game'. The Hud scene reads the stored mode on create and then
// follows the `hud:mode` Bus event.
// Story 7.1: 'yard' (the HomeYard shell scene) also shows Home, which goes back to the island. The
// shell sets where a game's Home leads (`setHomeTarget`: the island, or the yard for a game opened
// from a yard corner) before it starts the game; the Hud picks the Home line from it (core/hud › homeLine).
import { bus as appBus, type Bus } from './bus';

export type HudMode = 'map' | 'game' | 'yard';

/** Where Home in a running game leads (Story 7.1). */
export type HomeTarget = 'island' | 'yard';

let mode: HudMode = 'map';
let homeTarget: HomeTarget = 'island';

export function getHudMode(): HudMode {
  return mode;
}

/** Stores `next` and emits `hud:mode` (also when unchanged, so a late Hud catches up). */
export function setHudMode(next: HudMode, bus: Bus = appBus): void {
  mode = next;
  bus.emit('hud:mode', { mode: next });
}

/** Story 7.1: where Home in the game about to start leads (Map sets it at every game start). */
export function setHomeTarget(next: HomeTarget): void {
  homeTarget = next;
}

export function getHomeTarget(): HomeTarget {
  return homeTarget;
}
