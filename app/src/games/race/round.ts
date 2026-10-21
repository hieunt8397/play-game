// Đường đua round model (Stories 4.1, 4.2), pure: the round's roads, the hint activity of a tracing child, the
// hand-over to the next road and the end of the round. The scene (Race.ts) owns the TracePath and only
// applies the commands with Phaser. There is no wrong answer: the game never reports one to the hint system.
//   start / begin(i) → beginRoad (draw road i, kart at its start — or, Story 4.2, restored at
//                      `restoreIndex`, waiting — gate at its end) → beginQuestion
//   progressed(s)    → hintActivity each time s grew by ≥ activityPx (the scene re-issues the same step)
//   arrived()        → questionDone → lockTrace → celebrate{final} (+ markFinishing on the last road)
//                      → nextRoad{afterMs} (the scene fades the road out, then calls `nextRoadReady`)
//                        or finishRound{afterMs} on the last road.
import { RACE_LINES } from '../../content/games/race.ts';
import { roundRoads } from './questions.ts';

export type Stage = 'trace' | 'celebrate' | 'done';

export type RaceCommand =
  /**
   * Draws road `index` (`path.<pathId>`), the kart at its start and the gate at its end. Story 4.2: with
   * `restoreIndex` the kart waits at that sample with the driven stretch lit (a resume).
   */
  | { readonly kind: 'beginRoad'; readonly index: number; readonly pathId: string; readonly restoreIndex?: number }
  | { readonly kind: 'beginQuestion'; readonly promptLineId: string; readonly retryLineId: string }
  /** The child is tracing: the scene calls `hint.stepDone(sameStep)` (level kept, idle restarts). */
  | { readonly kind: 'hintActivity' }
  | { readonly kind: 'questionDone' }
  /** The trace stops taking input. */
  | { readonly kind: 'lockTrace' }
  /** The driver waves and the horn sounds; `final` adds the happy tune and the bounce. */
  | { readonly kind: 'celebrate'; readonly final: boolean }
  /** The last road arrived: from now on a Home tap completes the round. */
  | { readonly kind: 'markFinishing' }
  /** After `afterMs`, the road, gate and kart fade out; then the scene calls `nextRoadReady()`. */
  | { readonly kind: 'nextRoad'; readonly afterMs: number }
  | { readonly kind: 'finishRound'; readonly afterMs: number };

export interface RaceTimings {
  /** ui.traceSampleStepPx (a traceIndex is s / step). */
  readonly step: number;
  /**
   * Story 4.2: the largest traceIndex a resume may restore on road `pathId` (from the TracePath built for
   * it): floor((length − traceArriveSlackPx) / step) − 1, so a restored kart never arrives by itself.
   */
  maxTraceIndex(pathId: string): number;
  /** ui.traceHintProgressPx. */
  readonly activityPx: number;
  /** Timing.raceShortCelebrateMs. */
  readonly shortCelebrateMs: number;
  /** Timing.roundCelebrationMs. */
  readonly finishDelayMs: number;
}

export interface RaceProgress {
  readonly questionIndex: number;
  readonly partial: { readonly traceIndex: number };
}

export class RaceRound {
  private readonly t: RaceTimings;
  readonly roads: readonly string[];
  private index = 0;
  private st: Stage = 'trace';
  private lastActivityS = 0;

  constructor(t: RaceTimings, seed: number, level: number) {
    this.t = t;
    this.roads = roundRoads(seed, level);
  }

  get questionIndex(): number {
    return this.index;
  }

  get questionCount(): number {
    return this.roads.length;
  }

  get stage(): Stage {
    return this.st;
  }

  /** The open road's path id (the last one once the round is done). */
  get pathId(): string {
    return this.roads[Math.min(this.index, this.roads.length - 1)]!;
  }

  get isFinishing(): boolean {
    return this.index >= this.roads.length;
  }

  start(): RaceCommand[] {
    return this.begin(0);
  }

  /** The largest restorable traceIndex of road `index`. */
  maxTraceIndex(index: number): number {
    const id = this.roads[index];
    return id === undefined ? -1 : this.t.maxTraceIndex(id);
  }

  /**
   * Lays out road `index` and begins its hint question (the prompt is re-read for each road). Story 4.2:
   * `restoreIndex > 0` restores the kart there; the restored arc is the hint-activity baseline.
   */
  begin(index: number, restoreIndex = 0): RaceCommand[] {
    this.index = index;
    this.st = 'trace';
    this.lastActivityS = restoreIndex * this.t.step;
    return [
      restoreIndex > 0 ? { kind: 'beginRoad', index, pathId: this.pathId, restoreIndex } : { kind: 'beginRoad', index, pathId: this.pathId },
      { kind: 'beginQuestion', promptLineId: RACE_LINES.prompt, retryLineId: RACE_LINES.retry },
    ];
  }

  /** The kart reached arc length `s` on the open road. */
  progressed(s: number): RaceCommand[] {
    if (this.st !== 'trace' || s - this.lastActivityS < this.t.activityPx) return [];
    this.lastActivityS = s;
    return [{ kind: 'hintActivity' }];
  }

  /** The kart reached the gate. */
  arrived(): RaceCommand[] {
    if (this.st !== 'trace') return [];
    this.st = 'celebrate';
    this.index += 1;
    const final = this.isFinishing;
    const out: RaceCommand[] = [{ kind: 'questionDone' }, { kind: 'lockTrace' }, { kind: 'celebrate', final }];
    if (final) {
      this.st = 'done';
      out.push({ kind: 'markFinishing' }, { kind: 'finishRound', afterMs: this.t.finishDelayMs });
    } else out.push({ kind: 'nextRoad', afterMs: this.t.shortCelebrateMs });
    return out;
  }

  /** The old road faded out: the next road begins. */
  nextRoadReady(): RaceCommand[] {
    if (this.st !== 'celebrate') return [];
    return this.begin(this.index);
  }

  /** The resumable state: the open road and the kart's sample index on it (0 once the road is done). */
  progress(traceIndex: number): RaceProgress {
    const tracing = this.st === 'trace';
    const i = tracing && Number.isFinite(traceIndex) ? Math.max(0, Math.floor(traceIndex)) : 0;
    return { questionIndex: Math.min(this.index, this.roads.length), partial: { traceIndex: i } };
  }
}

/** What a start lays out: its commands, whether the resume was taken, and the warnings to log. */
export interface StartPlan {
  readonly commands: RaceCommand[];
  readonly accepted: boolean;
  readonly warnings: string[];
}

/**
 * Story 4.2, pure: `{ traceIndex }` when `partial` is `{ traceIndex }` with an integer
 * 0 ≤ traceIndex ≤ maxTraceIndex, else null.
 */
export function resumeQuestion(partial: unknown, maxTraceIndex: number): { traceIndex: number } | null {
  if (typeof partial !== 'object' || partial === null || Array.isArray(partial)) return null;
  const t = (partial as { traceIndex?: unknown }).traceIndex;
  if (typeof t !== 'number' || !Number.isInteger(t) || t < 0 || t > maxTraceIndex) return null;
  return { traceIndex: t };
}

/**
 * The first commands of a start. No resume → road 0. A resume → road `resumeAt.questionIndex`; Story 4.2:
 * a valid `partial.traceIndex > 0` restores the kart there, `0` starts the road clean, a bad partial warns
 * once and starts that road clean. An out-of-range index → road 0, not accepted, one warning.
 */
export function startCommands(round: RaceRound, resumeAt: { readonly questionIndex: number; readonly partial?: unknown } | null): StartPlan {
  if (!resumeAt) return { commands: round.start(), accepted: false, warnings: [] };
  const i = resumeAt.questionIndex;
  if (!Number.isInteger(i) || i < 0 || i >= round.questionCount) {
    return { commands: round.start(), accepted: false, warnings: [`race: resume index out of range (${i}) — the round starts at road 1`] };
  }
  const ok = resumeQuestion(resumeAt.partial, round.maxTraceIndex(i));
  return { commands: round.begin(i, ok?.traceIndex ?? 0), accepted: true, warnings: ok ? [] : ['race: bad resume partial'] };
}
