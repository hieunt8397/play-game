// Hud mode (Story 1.6): 'map' shows only the Speaker; 'game' adds Home. Map sets 'map' on create,
// Story 1.7's MiniGameBase sets 'game'. The Hud scene reads the stored mode on create and then
// follows the `hud:mode` Bus event.
import { bus as appBus, type Bus } from './bus';

export type HudMode = 'map' | 'game';

let mode: HudMode = 'map';

export function getHudMode(): HudMode {
  return mode;
}

/** Stores `next` and emits `hud:mode` (also when unchanged, so a late Hud catches up). */
export function setHudMode(next: HudMode, bus: Bus = appBus): void {
  mode = next;
  bus.emit('hud:mode', { mode: next });
}
