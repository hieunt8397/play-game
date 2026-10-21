// Moving targets (Story 4.3), pure: a tap on something that swims hits it where it is now or where it
// was a moment ago (the finger lags the eye), and among several hits the nearest centre wins.
// - PositionHistory keeps a target's recent positions (Timing.fishHistoryKeepMs) and interpolates.
// - pickMoving tests the tap against each candidate's rect now and in the past (half size + pad).
import { Tokens } from '../tokens';
import type { Point } from './polygon';

interface Sample {
  readonly t: number;
  readonly p: Point;
}

export class PositionHistory {
  private samples: Sample[] = [];
  private readonly keepMs: number;

  constructor(keepMs: number = Tokens.Timing.fishHistoryKeepMs) {
    this.keepMs = keepMs;
  }

  /** Records `p` at time `tMs` (non-decreasing) and drops samples older than keepMs before it. */
  push(tMs: number, p: Point): void {
    this.samples.push({ t: tMs, p: { x: p.x, y: p.y } });
    const cut = tMs - this.keepMs;
    let i = 0;
    // Keep the newest sample at or before the cut, so `at(cut)` still interpolates.
    while (i + 1 < this.samples.length && this.samples[i + 1]!.t <= cut) i++;
    if (i > 0) this.samples = this.samples.slice(i);
  }

  /** Forgets every sample (a respawned target). */
  clear(): void {
    this.samples = [];
  }

  /** The position at `tMs`: interpolated; the oldest sample before the history, the newest after; undefined when empty. */
  at(tMs: number): Point | undefined {
    const s = this.samples;
    if (s.length === 0) return undefined;
    if (tMs <= s[0]!.t) return { ...s[0]!.p };
    const last = s[s.length - 1]!;
    if (tMs >= last.t) return { ...last.p };
    for (let i = 1; i < s.length; i++) {
      const b = s[i]!;
      if (b.t < tMs) continue;
      const a = s[i - 1]!;
      const u = b.t === a.t ? 1 : (tMs - a.t) / (b.t - a.t);
      return { x: a.p.x + (b.p.x - a.p.x) * u, y: a.p.y + (b.p.y - a.p.y) * u };
    }
    return { ...last.p };
  }
}

export interface MovingCandidate {
  readonly id: string;
  readonly now: Point;
  readonly past: Point;
  /** Half the body's width and height (design px). */
  readonly halfW: number;
  readonly halfH: number;
}

const inRect = (p: Point, c: Point, hw: number, hh: number): boolean => Math.abs(p.x - c.x) <= hw && Math.abs(p.y - c.y) <= hh;

/**
 * The candidate a tap at `p` hits: in the rect `now ± (half + pad)` or `past ± (half + pad)`; among hits
 * the lowest min(|p − now|, |p − past|) wins (a tie goes to the earlier candidate). Null when none.
 */
export function pickMoving(p: Point, candidates: readonly MovingCandidate[], pad: number): string | null {
  let best: string | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const hw = c.halfW + pad;
    const hh = c.halfH + pad;
    if (!inRect(p, c.now, hw, hh) && !inRect(p, c.past, hw, hh)) continue;
    const d = Math.min(Math.hypot(p.x - c.now.x, p.y - c.now.y), Math.hypot(p.x - c.past.x, p.y - c.past.y));
    if (d < bestD) {
      best = c.id;
      bestD = d;
    }
  }
  return best;
}
