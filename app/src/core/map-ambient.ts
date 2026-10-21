// Map ambient loops (Story 5.6, FR37 / NFR11), pure. The island's quiet background life, as functions of
// an elapsed clock (the Map's own clamped `update` clock, so a paused or sleeping Map freezes them):
//   - driftX: a cloud drifts right and wraps inside [span.min, span.max] (the scene passes
//     [−frameW, width + frameW], so a cloud leaves the screen whole before it comes back on the left);
//     reduced motion multiplies the speed by ui.reducedMotionAmplitude;
//   - waveBob: a foam wave bobs ± ui.mapWaveBobPx over Timing.mapWaveBobMs, neighbours staggered by
//     ui.mapWaveBobPhaseStep of a cycle; reduced motion multiplies the amplitude;
//   - loopFrame: the fountain's jet frames on a loop; reduced motion holds the first frame;
//   - spoutFrame: the whale's spout frames, once (undefined when done: back to idle). A frame swap only,
//     so it still plays under reduced motion.
import { Tokens } from './tokens';

/** A closed x range (design px). */
export interface Span {
  readonly min: number;
  readonly max: number;
}

const TAU = 2 * Math.PI;

/** The cloud's x after `elapsedMs` at `speed` px/ms, wrapped into `span`. Non-finite elapsed → baseX. */
export function driftX(baseX: number, elapsedMs: number, speed: number, span: Span, reduced = false): number {
  if (!Number.isFinite(elapsedMs)) return baseX;
  const width = span.max - span.min;
  if (!(width > 0)) return baseX;
  const v = reduced ? speed * Tokens.ui.reducedMotionAmplitude : speed;
  const t = baseX - span.min + elapsedMs * v;
  return span.min + (((t % width) + width) % width);
}

/** The y offset (design px) of wave `index` after `elapsedMs`. */
export function waveBob(elapsedMs: number, index: number, reduced: boolean): number {
  if (!Number.isFinite(elapsedMs)) return 0;
  const amp = Tokens.ui.mapWaveBobPx * (reduced ? Tokens.ui.reducedMotionAmplitude : 1);
  const phase = elapsedMs / Tokens.Timing.mapWaveBobMs + index * Tokens.ui.mapWaveBobPhaseStep;
  return amp * Math.sin(TAU * phase);
}

/** The looping frame after `elapsedMs` (reduced → frames[0]; empty → undefined). */
export function loopFrame(elapsedMs: number, frames: readonly string[], frameMs: number, reduced: boolean): string | undefined {
  if (frames.length === 0) return undefined;
  if (reduced || !Number.isFinite(elapsedMs) || elapsedMs < 0 || !(frameMs > 0)) return frames[0];
  return frames[Math.floor(elapsedMs / frameMs) % frames.length];
}

/** The one-shot frame after `elapsedMs`; undefined before the start, once every frame showed, or with no frames. */
export function spoutFrame(elapsedMs: number, frames: readonly string[], frameMs: number): string | undefined {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || !(frameMs > 0)) return undefined;
  return frames[Math.floor(elapsedMs / frameMs)];
}
