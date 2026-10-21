// Tap reactions (Story 5.4, FR33 / FR53), pure: "anything the child taps reacts".
// A press first goes to the router's real targets (draggables, the 5.1 catcher, the oven, stations,
// Map decorations): they win by z. Whatever is left reaches one catch-all target at TAP_REACT_Z, which
// classifies the press against the scene's registered non-target sprites:
//   - the last-added enabled entry containing the point → `sprite` (it bounces with "pụp"), unless the
//     entry says `isTarget()` → `target` (silent: no bounce, no ripple);
//   - no entry → `background`: a small light ripple, at most once per `rippleMinGapMs` (≤ 1 Hz).
// A reaction is never a wrong choice: it never calls hint.wrong(), never feeds the RoundTally and never
// emits on the Bus. It runs inside the press handler (NFR5).
import type { Point } from './input/polygon';
import type { TapRouter } from './input/tap-router';

/** Hit priority of the reaction target: below the 5.1 catcher (−2) and Map decorations (−1). */
export const TAP_REACT_Z = -3;

export interface ReactEntry {
  readonly id: string;
  contains(p: Point): boolean;
  /** False: the entry is skipped (its own animation runs). Default true. */
  enabled?(): boolean;
  /** True: the entry is a target the game wants silent (no bounce, no ripple). Default false. */
  isTarget?(): boolean;
}

export type TapClass = { readonly kind: 'target' } | { readonly kind: 'sprite'; readonly id: string } | { readonly kind: 'background' };

export type TapReaction = { readonly kind: 'sprite'; readonly id: string } | { readonly kind: 'ripple' } | { readonly kind: 'none' };

/** The last-added enabled entry containing `p` wins. */
export function classifyTap(p: Point, entries: readonly ReactEntry[]): TapClass {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]!;
    if ((e.enabled?.() ?? true) && e.contains(p)) return e.isTarget?.() ? { kind: 'target' } : { kind: 'sprite', id: e.id };
  }
  return { kind: 'background' };
}

export interface TapReactor {
  /** The reaction to a press at `p` at `nowMs` (scene clock). Only the ripple is throttled. */
  press(p: Point, nowMs: number, entries: readonly ReactEntry[]): TapReaction;
}

export function createTapReactor(opts: { readonly rippleMinGapMs: number }): TapReactor {
  let lastRipple: number | undefined;
  return {
    press(p, nowMs, entries) {
      const c = classifyTap(p, entries);
      if (c.kind === 'target') return { kind: 'none' };
      if (c.kind === 'sprite') return { kind: 'sprite', id: c.id };
      if (lastRipple !== undefined && nowMs - lastRipple < opts.rippleMinGapMs) return { kind: 'none' };
      lastRipple = nowMs;
      return { kind: 'ripple' };
    },
  };
}

export interface TapReactTargetOptions {
  readonly rippleMinGapMs: number;
  /** The scene clock (ms). */
  readonly now: () => number;
  /** The registered entries, in registration order. */
  readonly entries: () => readonly ReactEntry[];
  /** True: a press does nothing at all (inert scene, a skip tap, Map's chain). Checked on press. */
  readonly blocked?: () => boolean;
  /** Runs for a `sprite` or `ripple` reaction, with the press point (in the router's world space). */
  readonly onReaction: (r: TapReaction, p: Point) => void;
}

/**
 * Registers the catch-all reaction target on `router` (it contains every point, at TAP_REACT_Z, so it
 * only hears presses no other target accepted). Returns its removal function.
 */
export function addTapReactTarget(router: TapRouter, opts: TapReactTargetOptions): () => void {
  const reactor = createTapReactor({ rippleMinGapMs: opts.rippleMinGapMs });
  return router.add({
    z: TAP_REACT_Z,
    contains: () => true,
    isEnabled: () => true,
    onPress: (p) => {
      if (opts.blocked?.() ?? false) return;
      const r = reactor.press(p, opts.now(), opts.entries());
      if (r.kind !== 'none') opts.onReaction(r, p);
    },
  });
}
