// Terminal-once guard of a MiniGame start (Story 1.7, AD-1). Exactly one `round:complete` or
// `round:abandon` per start; every later complete/abandon (a second Home tap, a late callback) is ignored.
// Story 5.8 (FR32): `playing → free → done`. `complete()` emits `round:complete` and enters free play
// (`playing → free`): the game stays on screen, `inert` (no question handlers) but not `terminal`.
// `leave()` (Home in free play) emits `round:leave` once (`free → done`). `abandon()` works while playing
// only (`playing → done`). `onInert` runs on `done` only (MiniGameBase: `input.enabled = false`), so tap
// reactions keep working in free play.
import type { GameId, RoundOutcome, Snapshot } from '../content/types';
import type { Bus } from './bus';

type GuardState = 'playing' | 'free' | 'done';

export class RoundGuard {
  private state: GuardState = 'playing';
  private readonly gameId: GameId;
  private readonly bus: Pick<Bus, 'emit'>;
  private readonly onInert: () => void;

  /** `onInert` runs once, when the start reaches `done` (MiniGameBase: `input.enabled = false`). */
  constructor(gameId: GameId, bus: Pick<Bus, 'emit'>, onInert: () => void = () => undefined) {
    this.gameId = gameId;
    this.bus = bus;
    this.onInert = onInert;
  }

  /** True once the round is no longer playing (free play or done): question handlers stop. */
  get inert(): boolean {
    return this.state !== 'playing';
  }

  /** True between `round:complete` and `round:leave`. */
  get freePlay(): boolean {
    return this.state === 'free';
  }

  /** True after the start's last event (`round:abandon` or `round:leave`). */
  get terminal(): boolean {
    return this.state === 'done';
  }

  /** Emits `round:complete` and enters free play; false (nothing emitted) unless playing. */
  complete(outcome: RoundOutcome): boolean {
    if (this.state !== 'playing') return false;
    this.state = 'free';
    this.bus.emit('round:complete', { ...outcome, gameId: this.gameId });
    return true;
  }

  /** Emits `round:leave {gameId}` from free play, then `onInert`; false (nothing emitted) otherwise. */
  leave(): boolean {
    if (this.state !== 'free') return false;
    this.state = 'done';
    this.bus.emit('round:leave', { gameId: this.gameId });
    this.onInert();
    return true;
  }

  /** Emits `round:abandon {gameId, snapshot}` while playing; false (nothing emitted) otherwise. */
  abandon(snapshot: Snapshot): boolean {
    if (this.state !== 'playing') return false;
    this.state = 'done';
    this.onInert();
    this.bus.emit('round:abandon', { gameId: this.gameId, snapshot });
    return true;
  }
}
