// Seamless play (2026-10-21), pure: whether a game scene's SHUTDOWN releases its assets. Map arms a game
// when it starts it (`arm`), marks an in-place restart before restarting it (`markRestart`), and asks on
// every SHUTDOWN it hears (`onShutdown`): a restart's SHUTDOWN keeps the assets and the release is
// re-armed for the restarted round ('rearm'); any other SHUTDOWN of an armed game releases once
// ('release'); a SHUTDOWN of a game that is not armed does nothing ('ignore').
import type { GameId } from '../content/types';

export type ShutdownAction = 'rearm' | 'release' | 'ignore';

export class ReleaseArming {
  private readonly armed = new Set<GameId>();
  private restarting: GameId | undefined;

  /** A fresh start of `id`: its next real SHUTDOWN releases its assets (a pending restart mark is dropped). */
  arm(id: GameId): void {
    this.armed.add(id);
    if (this.restarting === id) this.restarting = undefined;
  }

  /** `id` is about to restart in place: its next SHUTDOWN keeps the assets. */
  markRestart(id: GameId): void {
    this.restarting = id;
  }

  /** `id`'s scene shut down: what Map does with its assets. */
  onShutdown(id: GameId): ShutdownAction {
    if (!this.armed.has(id)) return 'ignore';
    if (this.restarting === id) {
      this.restarting = undefined;
      return 'rearm';
    }
    this.armed.delete(id);
    return 'release';
  }
}
