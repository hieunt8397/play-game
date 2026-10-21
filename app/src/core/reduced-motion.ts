// prefers-reduced-motion (Story 1.5). Read once per scene create; when set, every scale motion keeps
// its timing but its amplitude (the `scale − 1` part) is multiplied by Tokens.ui.reducedMotionAmplitude.
import { Tokens } from './tokens';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Slice of `window` (fakeable). */
export interface MotionWindowLike {
  matchMedia?: (query: string) => { readonly matches: boolean };
}

/** True when the user asks for reduced motion; false when `matchMedia` is unavailable or throws. */
export function prefersReducedMotion(win: MotionWindowLike | undefined): boolean {
  try {
    return typeof win?.matchMedia === 'function' && win.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

/** `scale` with its amplitude reduced when `reduced` (1.1 → 1.05, 0.92 → 0.96 at factor 0.5). */
export function amplitude(scale: number, reduced: boolean, factor: number = Tokens.ui.reducedMotionAmplitude): number {
  return reduced ? 1 + (scale - 1) * factor : scale;
}
