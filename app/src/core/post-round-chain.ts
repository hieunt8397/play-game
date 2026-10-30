// Map's post-round chain (Story 2.3, AD-1), pure: every effect is injected, so Vitest checks the order
// and the queued tap without Phaser. One awaited sequence per return to the island:
//   1. deps.setDifficulty(gameId, nextLevel(startedLevel, outcome, ladderLength));
//   2. deps.clearResume(gameId);
//   3. await deps.stopGameAndWake() (resolves on Map's `wake`; at once when no game runs);
//      — steps 1–3 start synchronously inside `start`, before its first await —
//   4. await deps.pullBack(gameId) (the camera; the kart stays parked at the station);
//   5. deps.end({ kind, gameId, queuedStation }).
// The island decorations' gift choice step (Story 5.5) and the `abandon` chain that replayed pending
// gifts were removed by parent decision 2026-10-21: every chain is a `complete` one.
// Story 5.8 (FR32): a finished round stays on screen in free play. Map calls `settle(req)` on
// `round:complete` — steps 1–2 at once, the game keeps running — and `start({kind:'complete', gameId})`
// on `round:leave` (Home), which skips steps 1–2 for that settled game (and forgets it). A `complete`
// start for a game that was not settled runs steps 1–2 itself (warning "difficulty unchanged" without
// an outcome).
// Seamless play (2026-10-21): after `round:complete` the game restarts itself in place (`round:next` →
// `routeRoundNext` → Map restarts the scene); the chain runs only on Home, and its end always returns Map
// to idle (the play-again overlay was removed).
// `active` is true from `start` until `end`; a second `start` meanwhile warns and is ignored. Station
// taps during the chain are queued (`queueTap`, the last one wins) and handed to `end`. Every animation
// runs on the scene clock and tweens (never setTimeout), so a paused scene freezes the chain mid-step.
// In a dev build `log` prints `post-round: <kind> <gameId> → onChainEnd <ms> ms`.
// Story 7.1 (the yard): a game opened from a yard corner runs with `origin: 'yard'`. Its `round:leave` and
// `round:abandon` take the fade return to the yard (no island chain: the round was settled on
// `round:complete`, and there is no camera pull-back on the island); `round:next` restarts it in place as
// for an island game. `routeYardOpen` decides whether the yard's `yard:open` starts a game.
import type { GameId, RoundOutcome, Snapshot } from '../content/types';
import { nextLevel } from './difficulty';
import { Tokens } from './tokens';

export type ChainKind = 'complete';

export interface ChainStart {
  readonly kind: ChainKind;
  readonly gameId: GameId;
  /** `complete` only: the outcome and the level the round started at. */
  readonly outcome?: RoundOutcome;
  readonly startedLevel?: number;
}

/** What Map's `onChainEnd` hook receives (Map goes back to idle). */
export interface ChainEnd {
  readonly kind: ChainKind;
  readonly gameId: GameId;
}

/** What the runner hands to deps.end: the hook payload plus the last station tapped mid-chain. */
export interface ChainFinish extends ChainEnd {
  readonly queuedStation: string | undefined;
}

export interface ChainDeps {
  setDifficulty(gameId: GameId, level: number): void;
  clearResume(gameId: GameId): void;
  /** The game's ladder length (undefined: unknown game, no difficulty write). */
  ladderLength(gameId: GameId): number | undefined;
  stopGameAndWake(): Promise<void>;
  pullBack(focus: GameId): Promise<void>;
  end(e: ChainFinish): void;
  now(): number;
  /** Dev builds: the timing log line (omit in production). */
  log?: ((line: string) => void) | undefined;
  /** Default console.warn. */
  warn?: (msg: string, ...rest: unknown[]) => void;
}

/**
 * Story 5.3: the expected length of the chain's skippable animation — the camera pull-back, or the
 * reduced-motion fade — what Map passes to its skip window.
 */
export function chainAnimMs(reduced: boolean): number {
  const t = Tokens.Timing;
  return reduced ? t.sceneFadeMs : t.cameraPullBackMs;
}

/** The game Map started from a station and that has not ended yet. */
export interface RunningGame {
  readonly id: GameId;
  readonly level: number;
  /** Story 7.1: where the game was opened from (default the island); its last event returns there. */
  readonly origin?: GameOrigin;
}

/** Story 7.1: where a game was opened from — an island station or a yard corner. */
export type GameOrigin = 'island' | 'yard';

/** Story 7.1: where the running game's return (fade) lands. */
export function returnTarget(running: RunningGame | undefined): GameOrigin {
  return running?.origin ?? 'island';
}

/** What Map does with a terminal event of a game. */
export type TerminalRoute =
  | { readonly action: 'ignore' }
  | { readonly action: 'chain'; readonly start: ChainStart }
  /** Story 5.8: save the round now (chain steps 1–2, `PostRoundChain.settle`); the game stays in free play. */
  | { readonly action: 'settle'; readonly start: ChainStart }
  | { readonly action: 'fade'; readonly gameId: GameId }
  /** Seamless play (2026-10-21): restart the running game in place with its next start data. */
  | { readonly action: 'restart'; readonly gameId: GameId };

/**
 * `round:complete`: only the running game's event settles its round (difficulty and resume, Story 5.8),
 * with its outcome and started level; the chain itself waits for `round:leave`.
 */
export function routeRoundComplete(running: RunningGame | undefined, outcome: RoundOutcome): TerminalRoute {
  if (!running || outcome.gameId !== running.id) return { action: 'ignore' };
  return { action: 'settle', start: { kind: 'complete', gameId: running.id, outcome, startedLevel: running.level } };
}

/**
 * Story 5.8: `round:leave` (Home in free play) of the running game starts the `complete` chain (steps 1–2
 * already ran on `round:complete`); a chain already running → the fade return. Another game's event (or
 * none running) is ignored.
 */
export function routeRoundLeave(running: RunningGame | undefined, gameId: GameId, chainActive: boolean): TerminalRoute {
  if (!running || gameId !== running.id) return { action: 'ignore' };
  // Story 7.1: a yard game goes back to the yard with the fade (settled already on round:complete).
  if (chainActive || running.origin === 'yard') return { action: 'fade', gameId };
  return { action: 'chain', start: { kind: 'complete', gameId } };
}

/**
 * Seamless play (2026-10-21): `round:next` of the running game (its round settled, its celebration and
 * fade over) restarts it in place. While a chain runs (Home won the race) or for a game that is not
 * running, it is ignored.
 */
export function routeRoundNext(running: RunningGame | undefined, gameId: GameId, chainActive: boolean): TerminalRoute {
  if (!running || gameId !== running.id || chainActive) return { action: 'ignore' };
  return { action: 'restart', gameId };
}

/** Story 7.1: what Map does with the yard's `yard:open`. */
export type YardOpenRoute = { readonly action: 'ignore' } | { readonly action: 'open'; readonly gameId: GameId };

/**
 * Story 7.1: `yard:open` starts the corner's game only while the yard is open, no game runs, no chain
 * runs and the id is a registered game (`isGame`, games/registry › isGameId); otherwise it is ignored.
 */
export function routeYardOpen(
  running: RunningGame | undefined,
  gameId: string,
  state: { readonly yardOpen: boolean; readonly chainActive: boolean },
  isGame: (id: string) => id is GameId,
): YardOpenRoute {
  if (running || !state.yardOpen || state.chainActive || !isGame(gameId)) return { action: 'ignore' };
  return { action: 'open', gameId };
}

/**
 * `round:abandon` of the running game: the Story 1.7 fade return. Another game's event (or none
 * running) is ignored.
 */
export function routeRoundAbandon(running: RunningGame | undefined, gameId: GameId): TerminalRoute {
  if (!running || gameId !== running.id) return { action: 'ignore' };
  return { action: 'fade', gameId };
}

/**
 * Story 2.5: on `round:abandon`, keeps the snapshot of the running game only (`store.setResume`), before
 * the return path. Never throws: a store failure (a cycle or BigInt in the snapshot) warns once and the
 * child still goes home. Returns true when the snapshot was stored.
 */
export function keepAbandonSnapshot(
  running: RunningGame | undefined,
  gameId: GameId,
  snapshot: Snapshot,
  store: { setResume(id: GameId, s: Snapshot): void },
): boolean {
  if (!running || running.id !== gameId) return false;
  try {
    store.setResume(gameId, snapshot);
    return true;
  } catch (error) {
    console.warn(`post-round: the "${gameId}" snapshot could not be kept — no resume point`, error);
    return false;
  }
}

/**
 * `round:leave` as Map handles it (2026-10-30): a free-play game may hand a resume point with it (the garden's
 * half-grown plant), kept first as on `round:abandon` (`keepAbandonSnapshot`); then the route (`routeRoundLeave`).
 */
export function onRoundLeave(
  running: RunningGame | undefined,
  e: { readonly gameId: GameId; readonly snapshot?: Snapshot | undefined },
  chainActive: boolean,
  store: { setResume(id: GameId, s: Snapshot): void },
): TerminalRoute {
  if (e.snapshot) keepAbandonSnapshot(running, e.gameId, e.snapshot, store);
  return routeRoundLeave(running, e.gameId, chainActive);
}

/** What Map does when the chain ends (Story 2.4 regression guard: a queued tap never reaches the hook). */
export type ChainEndRoute =
  | { readonly action: 'tap'; readonly stationId: string }
  | { readonly action: 'hook'; readonly end: ChainEnd };

/** A queued station tap applies instead of the `onChainEnd` hook; otherwise the hook runs. */
export function routeChainEnd(e: ChainFinish): ChainEndRoute {
  if (e.queuedStation !== undefined) return { action: 'tap', stationId: e.queuedStation };
  return { action: 'hook', end: { kind: e.kind, gameId: e.gameId } };
}

export class PostRoundChain {
  private activeFlag = false;
  private queued: string | undefined;
  /** Story 5.8: the game whose round `settle` saved; its next `complete` start skips steps 1–2. */
  private settled: GameId | undefined;
  private readonly deps: ChainDeps;

  constructor(deps: ChainDeps) {
    this.deps = deps;
  }

  get active(): boolean {
    return this.activeFlag;
  }

  /** The station tapped last while the chain runs (applied at its end). */
  get queuedStation(): string | undefined {
    return this.queued;
  }

  /** A station tap during the chain: remembered, any earlier queued tap is dropped. */
  queueTap(id: string): void {
    if (this.activeFlag) this.queued = id;
  }

  /** Story 7.1: a game that left without the chain (a yard game) is no longer settled. */
  forget(gameId: GameId): void {
    if (this.settled === gameId) this.settled = undefined;
  }

  /** Story 5.8: steps 1–2 of a `complete` round now (on `round:complete`); the chain starts later at Home. */
  settle(req: ChainStart): void {
    this.save(req, this.warnFn());
    this.settled = req.gameId;
  }

  start(req: ChainStart): Promise<void> {
    const warn = this.warnFn();
    if (this.activeFlag) {
      warn(`post-round: a ${req.kind} chain for "${req.gameId}" was ignored — a chain is already running`);
      return Promise.resolve();
    }
    this.activeFlag = true;
    this.queued = undefined;
    const t0 = this.deps.now();
    if (this.settled === req.gameId) this.settled = undefined;
    else this.save(req, warn);
    return this.run(req, t0, warn);
  }

  private warnFn(): (msg: string, ...rest: unknown[]) => void {
    return this.deps.warn ?? ((msg: string, ...rest: unknown[]) => console.warn(msg, ...rest));
  }

  /** Steps 1–2: the next difficulty and the cleared resume mark of a `complete` round. */
  private save(req: ChainStart, warn: (msg: string, ...rest: unknown[]) => void): void {
    const len = this.deps.ladderLength(req.gameId);
    if (req.outcome && req.startedLevel !== undefined && len !== undefined) {
      this.deps.setDifficulty(req.gameId, nextLevel(req.startedLevel, req.outcome, len));
    } else {
      warn(
        `post-round: complete "${req.gameId}" without ${!req.outcome ? 'an outcome' : req.startedLevel === undefined ? 'a started level' : 'a known ladder'} — difficulty unchanged`,
      );
    }
    this.deps.clearResume(req.gameId);
  }

  private async run(req: ChainStart, t0: number, warn: (msg: string, ...rest: unknown[]) => void): Promise<void> {
    const deps = this.deps;
    try {
      // Called synchronously (before the first await) by `start`.
      await deps.stopGameAndWake();
      await deps.pullBack(req.gameId);
    } catch (err) {
      warn('post-round: the chain failed', err);
    } finally {
      const queuedStation = this.queued;
      this.activeFlag = false;
      this.queued = undefined;
      deps.log?.(`post-round: ${req.kind} ${req.gameId} → onChainEnd ${Math.round(deps.now() - t0)} ms`);
      deps.end({ kind: req.kind, gameId: req.gameId, queuedStation });
    }
  }
}
