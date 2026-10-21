// Map idle scheduler (Story 1.5, EXPERIENCE › Mời chơi). Pure: time comes in through `tick(deltaMs)`
// (the Map feeds `update` deltas, which stop while the scene is paused), randomness through `rng`.
//   - ambient: every rand(ambientMin..ambientMax) one station moves; never the same id twice in a row;
//   - invite: after `inviteFirstMs` of idle, for the next awake station (round-robin); later ones need
//     idle ≥ inviteFirstMs AND ≥ inviteGapMs since the previous invitation started; at most
//     `inviteMaxCount` per Map visit (taps do not reset the count);
//   - while an invitation shows (`inviteHoldMs` or until a tap) no ambient fires; it ends with `inviteEnd`;
//   - `tap()` resets the idle clock and the ambient timer and ends a showing invitation.
//   - `suspend()` (Story 1.7: the kart is travelling) stops everything and ends a showing invitation;
//     `resume()` resets the idle clock and the ambient timer; `reset()` starts a new Map visit
//     (invite count 0, clocks reset).
// Story 5.6 (NFR11: one prominent motion at a time), both optional (absent = the behaviour above):
//   - `periodic`: [{id, firstMs, everyMs, busyMs}] (the whale spout): `{kind: 'periodic', id}` after firstMs of
//     a visit, then every everyMs. Its timer runs while the Map is not suspended (it pauses with suspend) and
//     restarts at firstMs on `reset()` (suspend and reset also clear the busy window). A due periodic waits for a free tick (no invitation showing, no busy
//     window, no invitation due): it is never dropped and never runs with another prominent motion;
//   - `timing.ambientBusyMs`: an ambient move keeps the scheduler busy this long; a periodic event keeps it
//     busy for its `busyMs`. While busy nothing fires (an ambient or invitation due waits for the end).
// Deltas are clamped to MAX_TICK_MS so a resume never fires a burst.

export const MAX_TICK_MS = 250;

export type MapIdleEvent =
  | { readonly kind: 'ambient'; readonly id: string }
  | { readonly kind: 'invite'; readonly id: string }
  | { readonly kind: 'inviteEnd'; readonly id: string }
  | { readonly kind: 'periodic'; readonly id: string };

export interface MapIdleTiming {
  readonly ambientMinMs: number;
  readonly ambientMaxMs: number;
  readonly inviteFirstMs: number;
  readonly inviteGapMs: number;
  readonly inviteMaxCount: number;
  readonly inviteHoldMs: number;
  /** Story 5.6: an ambient move keeps the scheduler busy this long (default 0). */
  readonly ambientBusyMs?: number;
}

/** Story 5.6: a periodic prominent motion (the whale spout). */
export interface MapIdlePeriodic {
  readonly id: string;
  /** First event this long into a visit. */
  readonly firstMs: number;
  /** Then again this long after each event. */
  readonly everyMs: number;
  /** The motion lasts this long: nothing else fires meanwhile. */
  readonly busyMs: number;
}

export interface MapIdleOptions {
  /** Every station that may move (ambient). */
  readonly stations: readonly string[];
  /** Stations that may be invited, in round-robin order. */
  readonly awake: readonly string[];
  readonly timing: MapIdleTiming;
  /** Story 5.6: periodic prominent motions (default none). */
  readonly periodic?: readonly MapIdlePeriodic[];
  /** Uniform [0, 1) (default Math.random). */
  readonly rng?: () => number;
}

export interface MapIdle {
  tick(deltaMs: number): MapIdleEvent[];
  tap(): MapIdleEvent[];
  /** Stops ambient motion and invitations (kart travelling); ends a showing invitation. Idempotent. */
  suspend(): MapIdleEvent[];
  /** Restarts after `suspend`, with the idle clock and the ambient timer reset. No-op when not suspended. */
  resume(): void;
  /** A new Map visit: invite count 0, clocks reset, a showing invitation ends. Keeps the suspend state. */
  reset(): MapIdleEvent[];
  readonly suspended: boolean;
  /** The station whose invitation is showing, if any. */
  readonly showing: string | undefined;
  /** Invitations started this visit. */
  readonly invites: number;
}

export function createMapIdle(opts: MapIdleOptions): MapIdle {
  const { stations, awake, timing } = opts;
  const rng = opts.rng ?? Math.random;
  const nextAmbientDelay = (): number => timing.ambientMinMs + rng() * (timing.ambientMaxMs - timing.ambientMinMs);

  let elapsed = 0;
  let idle = 0;
  let ambientLeft = nextAmbientDelay();
  let lastAmbient: string | undefined;
  let invites = 0;
  let lastInviteAt: number | undefined;
  let awakeIndex = 0;
  let showing: { id: string; left: number } | undefined;
  let suspended = false;
  const periodic = (opts.periodic ?? []).map((p) => ({ spec: p, left: p.firstMs }));
  let busyLeft = 0;

  const pickAmbient = (): string | undefined => {
    if (stations.length === 0) return undefined;
    const pool = stations.length > 1 ? stations.filter((id) => id !== lastAmbient) : stations;
    const id = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    lastAmbient = id;
    return id;
  };

  const inviteDue = (): boolean =>
    awake.length > 0 &&
    invites < timing.inviteMaxCount &&
    idle >= timing.inviteFirstMs &&
    (lastInviteAt === undefined || elapsed - lastInviteAt >= timing.inviteGapMs);

  const endShowing = (): MapIdleEvent[] => {
    if (!showing) return [];
    const id = showing.id;
    showing = undefined;
    ambientLeft = nextAmbientDelay();
    return [{ kind: 'inviteEnd', id }];
  };

  return {
    tick(deltaMs) {
      if (suspended) return [];
      const d = Math.min(MAX_TICK_MS, Math.max(0, Number.isFinite(deltaMs) ? deltaMs : 0));
      elapsed += d;
      idle += d;
      for (const p of periodic) p.left -= d;
      busyLeft = Math.max(0, busyLeft - d);
      if (showing) {
        showing.left -= d;
        return showing.left <= 0 ? endShowing() : [];
      }
      if (busyLeft > 0) {
        ambientLeft = Math.max(0, ambientLeft - d);
        return [];
      }
      if (inviteDue()) {
        const id = awake[awakeIndex % awake.length]!;
        awakeIndex++;
        invites++;
        lastInviteAt = elapsed;
        showing = { id, left: timing.inviteHoldMs };
        return [{ kind: 'invite', id }];
      }
      const due = periodic.find((p) => p.left <= 0);
      if (due) {
        due.left = due.spec.everyMs;
        busyLeft = due.spec.busyMs;
        return [{ kind: 'periodic', id: due.spec.id }];
      }
      ambientLeft -= d;
      if (ambientLeft > 0) return [];
      ambientLeft = nextAmbientDelay();
      const id = pickAmbient();
      if (id === undefined) return [];
      busyLeft = timing.ambientBusyMs ?? 0;
      return [{ kind: 'ambient', id }];
    },
    tap() {
      idle = 0;
      ambientLeft = nextAmbientDelay();
      return endShowing();
    },
    suspend() {
      suspended = true;
      busyLeft = 0; // Story 5.6: the scene stops a running spout on suspend; a resume starts free
      return endShowing();
    },
    resume() {
      if (!suspended) return;
      suspended = false;
      idle = 0;
      ambientLeft = nextAmbientDelay();
    },
    reset() {
      const ended = endShowing();
      busyLeft = 0;
      invites = 0;
      lastInviteAt = undefined;
      idle = 0;
      ambientLeft = nextAmbientDelay();
      for (const p of periodic) p.left = p.spec.firstMs;
      return ended;
    },
    get suspended() {
      return suspended;
    },
    get showing() {
      return showing?.id;
    },
    get invites() {
      return invites;
    },
  };
}
