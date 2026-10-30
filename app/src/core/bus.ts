// Typed Bus with scene-scoped subscriptions (AD-11).
// Emitting or subscribing to an event outside `EventMap`, or with the wrong payload, is a type error.
// Scenes subscribe ONLY via `bus.scoped(this)`; global `bus.on` is for core services subscribed at boot.
import type { GameId, HintLevel, RoundOutcome, Snapshot } from '../content/types';
import type { HudMode } from './hud-mode';

/** Event names follow `noun:verb`. `undefined` payload = event carries no data. */
export interface EventMap {
  'round:complete': RoundOutcome;
  'round:abandon': { gameId: GameId; snapshot: Snapshot };
  /**
   * Story 5.8: Home in free play (after `round:complete`) — Map runs the post-round chain. Trồng cây (2026-10-30): a
   * free-play game with something to come back to (a half-grown plant) hands its resume `snapshot` too; Map keeps it
   * as for `round:abandon`.
   */
  'round:leave': { gameId: GameId; snapshot?: Snapshot };
  /**
   * Seamless play (2026-10-21): the finished round's celebration and fade are over — Map restarts the
   * same game in place with its next start data (MiniGameBase emits it from free play).
   */
  'round:next': { gameId: GameId };
  /**
   * Story 7.1: the yard (scenes/HomeYard) asks Map to open the game of an awake corner (its assets are
   * already loaded). Map starts it with its usual start data and routes its last event back to the yard.
   * `gameId` is a string: a yard game that is not registered (yet) is ignored by Map.
   */
  'yard:open': { gameId: string };
  /** Story 7.1: Home in the yard — Map closes the yard and wakes on the island (kart at `home-stop`). */
  'yard:leave': undefined;
  'hint:level': { gameId: GameId; level: HintLevel };
  'hud:home': undefined;
  /** core/hud-mode: the Hud shows Home only in 'game' mode (Story 1.6; MiniGameBase sets 'game' in 1.7). */
  'hud:mode': { mode: HudMode };
  /** AudioDirector: page visible again but the AudioContext stayed suspended (after the first unlock). */
  'audio:suspended': undefined;
  /** AudioUnlockOverlay: the child tapped, audio is unlocked and the paused scenes resumed. */
  'audio:resumed': undefined;
  /**
   * AudioDirector: a voice token ended — exactly once per token (AR16 speechEnded, renamed for noun:verb).
   * completed is false when the line was stopped, interrupted, dropped or unknown.
   */
  'speech:ended': { token: number; completed: boolean };
  /**
   * AudioDirector (Story 3.1): line `index` (0-based) of utterance `token` started playing — once per
   * line, in order; a single `say` gives index 0. A cut utterance emits no further lines.
   */
  'speech:line': { token: number; index: number; id: string };
}

export type EventName = keyof EventMap;
export type Handler<K extends EventName> = (payload: EventMap[K]) => void;
type EmitArgs<K extends EventName> = EventMap[K] extends undefined ? [] : [payload: EventMap[K]];

/** Phaser scene lifecycle event names (`Phaser.Scenes.Events.SHUTDOWN` / `.DESTROY`). */
export const SCENE_SHUTDOWN = 'shutdown';
export const SCENE_DESTROY = 'destroy';

/** The slice of `Phaser.Scene` the Bus needs; keeps this module testable without Phaser. */
export interface SceneLike {
  events: {
    once(event: string, fn: () => void): unknown;
    off(event: string, fn: () => void): unknown;
  };
}

export interface ScopedBus {
  /** Subscribe; returns this subscription's unsubscribe function. A no-op after the scope ended. */
  on<K extends EventName>(event: K, handler: Handler<K>): () => void;
  emit<K extends EventName>(event: K, ...args: EmitArgs<K>): void;
}

type Listener = (payload: unknown) => void;

export class Bus {
  private readonly handlers = new Map<EventName, Set<Listener>>();

  /**
   * Global subscription (core services only). Returns an unsubscribe function that removes
   * exactly this subscription — subscribing the same function twice gives two independent entries.
   */
  on<K extends EventName>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    const entry: Listener = (payload) => (handler as Listener)(payload);
    set.add(entry);
    return () => {
      this.handlers.get(event)?.delete(entry);
    };
  }

  emit<K extends EventName>(event: K, ...args: EmitArgs<K>): void {
    const set = this.handlers.get(event);
    if (!set) return;
    const payload = args[0];
    for (const fn of [...set]) {
      // Unsubscribed by an earlier listener during this same emit → skip.
      if (!set.has(fn)) continue;
      try {
        fn(payload);
      } catch (error) {
        // Never surface errors to the child; keep other listeners running.
        console.warn(`bus: listener for "${event}" threw`, error);
      }
    }
  }

  listenerCount(event: EventName): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /** Subscriptions tied to a scene: all removed on the scene's SHUTDOWN or DESTROY. */
  scoped(scene: SceneLike): ScopedBus {
    const offs: Array<() => void> = [];
    let ended = false;
    let warned = false;
    const cleanup = (): void => {
      ended = true;
      for (const off of offs.splice(0)) off();
      scene.events.off(SCENE_SHUTDOWN, cleanup);
      scene.events.off(SCENE_DESTROY, cleanup);
    };
    scene.events.once(SCENE_SHUTDOWN, cleanup);
    scene.events.once(SCENE_DESTROY, cleanup);
    return {
      on: (event, handler) => {
        if (ended) {
          if (!warned) {
            warned = true;
            console.warn(`bus: scoped.on("${event}") after the scene shut down — ignored; call bus.scoped(this) again`);
          }
          return () => undefined;
        }
        const off = this.on(event, handler);
        offs.push(off);
        return off;
      },
      emit: (event, ...args) => this.emit(event, ...args),
    };
  }
}

/** The app-wide Bus instance. */
export const bus = new Bus();
