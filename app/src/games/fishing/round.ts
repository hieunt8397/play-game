// Câu cá round model (Stories 4.3, 4.4), pure: the round's questions, the taps, the catch hand-over and the
// end of the round. The scene (Fishing.ts) owns the swim model, the moving pick and the sprites, and only
// applies the commands with Phaser. Correctness goes through `isCorrect` only.
//   start / begin(i) → beginQuestion (spawn the fish of question i, fade in, hint question)
//   tap(null, p)     → ripple at p ("tõm"); never wrong
//   tap(wrong id)    → dive → wrong → resurface after resurfaceMs
//   tap(right id)    → questionDone → lock → catch (reel the fish up); the index advances at once
//   reeled(id)       → its name (game voice) + jump + the happy tune
//   name ended       → nextQuestion{afterMs} (the scene fades the fish out, then `nextQuestionReady`)
//                      or finishRound{afterMs} after the last question.
import type { FishSpec } from '../../content/games/fishing.ts';
import type { Point } from '../../content/layout-types.ts';
import { nameLineId, promptLineId, retryLineId } from './lines.ts';
import { isCorrect, roundQuestions, type FishQuestion } from './questions.ts';

export type Stage = 'ask' | 'catch' | 'done';
/** The tag the scene maps its voice token to (the caught fish's name). */
export type SpeechTag = 'name';

/** The id of the k-th fish of a question (its position in `q.fish`). */
export const fishId = (k: number): string => `fish-${k}`;

export type FishingCommand =
  /** Spawns the fish of question `index` (`q.fish`, ids fishId(k)) and fades them in; then the hint question. */
  | { readonly kind: 'beginQuestion'; readonly index: number; readonly q: FishQuestion; readonly promptLineId: string; readonly retryLineId: string }
  /** A water tap: a ripple at `at` and the "tõm". */
  | { readonly kind: 'ripple'; readonly at: Point }
  /** A wrong fish sinks and fades with bubbles (and the bubble sfx). */
  | { readonly kind: 'dive'; readonly id: string }
  | { readonly kind: 'wrong' }
  | { readonly kind: 'resurface'; readonly id: string; readonly afterMs: number }
  | { readonly kind: 'questionDone' }
  /** Taps do nothing until the next question. */
  | { readonly kind: 'lock' }
  /** The last question's catch: from now on a Home tap completes the round. */
  | { readonly kind: 'markFinishing' }
  /** Reel fish `id` up to the rod (line, wriggle); then the scene calls `reeled(id)`. */
  | { readonly kind: 'catch'; readonly id: string }
  | { readonly kind: 'say'; readonly tag: SpeechTag; readonly id: string }
  | { readonly kind: 'jump'; readonly id: string }
  | { readonly kind: 'happy' }
  | { readonly kind: 'nextQuestion'; readonly afterMs: number }
  | { readonly kind: 'finishRound'; readonly afterMs: number };

export interface FishingTimings {
  /** Timing.fishResurfaceMs. */
  readonly resurfaceMs: number;
  /** Timing.fishShortCelebrateMs. */
  readonly shortCelebrateMs: number;
  /** Timing.roundCelebrationMs. */
  readonly finishDelayMs: number;
}

export interface FishingProgress {
  readonly questionIndex: number;
  readonly partial: Record<string, never>;
}

export class FishingRound {
  private readonly t: FishingTimings;
  readonly questions: readonly FishQuestion[];
  private index = 0;
  private st: Stage = 'ask';
  /** The question being celebrated (between the correct tap and its name's end). */
  private catching: FishQuestion | undefined;

  constructor(t: FishingTimings, seed: number, level: number) {
    this.t = t;
    this.questions = roundQuestions(seed, level);
  }

  get questionIndex(): number {
    return this.index;
  }

  get questionCount(): number {
    return this.questions.length;
  }

  get stage(): Stage {
    return this.st;
  }

  /** The open question (the last one once the round is done). */
  get current(): FishQuestion {
    return this.questions[Math.min(this.index, this.questions.length - 1)]!;
  }

  get isFinishing(): boolean {
    return this.index >= this.questions.length;
  }

  /** The ids of the open question's correct fish (one) and of the others. */
  correctIds(q: FishQuestion = this.current): string[] {
    return q.fish.flatMap((f, k) => (isCorrect(q, f) ? [fishId(k)] : []));
  }

  fishOf(id: string, q: FishQuestion = this.catching ?? this.current): FishSpec | undefined {
    const k = Number(id.slice('fish-'.length));
    return Number.isInteger(k) ? q.fish[k] : undefined;
  }

  start(): FishingCommand[] {
    return this.begin(0);
  }

  begin(index: number): FishingCommand[] {
    this.index = index;
    this.st = 'ask';
    this.catching = undefined;
    const q = this.current;
    return [{ kind: 'beginQuestion', index, q, promptLineId: promptLineId(q), retryLineId: retryLineId(q) }];
  }

  /** A tap that hit fish `id` (null: water) at `p`. */
  tap(id: string | null, p: Point): FishingCommand[] {
    if (this.st !== 'ask') return [];
    if (id === null) return [{ kind: 'ripple', at: { x: p.x, y: p.y } }];
    const q = this.current;
    const f = this.fishOf(id, q);
    if (!f) return [{ kind: 'ripple', at: { x: p.x, y: p.y } }];
    if (!isCorrect(q, f)) return [{ kind: 'dive', id }, { kind: 'wrong' }, { kind: 'resurface', id, afterMs: this.t.resurfaceMs }];
    this.st = 'catch';
    this.catching = q;
    this.index += 1;
    const out: FishingCommand[] = [{ kind: 'questionDone' }, { kind: 'lock' }];
    if (this.isFinishing) out.push({ kind: 'markFinishing' });
    out.push({ kind: 'catch', id });
    return out;
  }

  /** The caught fish reached the rod: its name, a jump and the happy tune. */
  reeled(id: string): FishingCommand[] {
    if (this.st !== 'catch' || !this.catching) return [];
    const f = this.fishOf(id, this.catching);
    if (!f) return [];
    return [{ kind: 'say', tag: 'name', id: nameLineId(f) }, { kind: 'jump', id }, { kind: 'happy' }];
  }

  /** The name ended (completed or cut): the next question, or the end of the round. */
  speechEnded(tag: SpeechTag): FishingCommand[] {
    if (this.st !== 'catch' || tag !== 'name') return [];
    if (this.isFinishing) {
      this.st = 'done';
      return [{ kind: 'finishRound', afterMs: this.t.finishDelayMs }];
    }
    return [{ kind: 'nextQuestion', afterMs: this.t.shortCelebrateMs }];
  }

  /** The old fish faded out: the next question begins. */
  nextQuestionReady(): FishingCommand[] {
    if (this.st !== 'catch' || this.isFinishing) return [];
    return this.begin(this.index);
  }

  /** The resumable state (AD-2): the open question; fishing keeps no partial progress. */
  progress(): FishingProgress {
    return { questionIndex: Math.min(this.index, this.questions.length), partial: {} };
  }
}

/** Story 4.4, pure: `{}` when `partial` is a plain object with no own keys, else null. */
export function resumeQuestion(partial: unknown): Record<string, never> | null {
  if (typeof partial !== 'object' || partial === null || Array.isArray(partial)) return null;
  const proto: unknown = Object.getPrototypeOf(partial);
  if (proto !== Object.prototype && proto !== null) return null;
  return Reflect.ownKeys(partial).length === 0 ? {} : null;
}

/** What a start lays out: its commands, whether the resume was taken, and the warnings to log. */
export interface StartPlan {
  readonly commands: FishingCommand[];
  readonly accepted: boolean;
  readonly warnings: string[];
}

/**
 * The first commands of a start. No resume → question 0. A resume → question `resumeAt.questionIndex`
 * (the same fish at the same start: they come from seed + level); a bad `partial` warns once and begins
 * that question the same way. An out-of-range index → question 0, not accepted, one warning.
 */
export function startCommands(round: FishingRound, resumeAt: { readonly questionIndex: number; readonly partial?: unknown } | null): StartPlan {
  if (!resumeAt) return { commands: round.start(), accepted: false, warnings: [] };
  const i = resumeAt.questionIndex;
  if (!Number.isInteger(i) || i < 0 || i >= round.questionCount) {
    return { commands: round.start(), accepted: false, warnings: [`fishing: resume index out of range (${i}) — the round starts at question 1`] };
  }
  const ok = resumeQuestion(resumeAt.partial);
  return { commands: round.begin(i), accepted: true, warnings: ok ? [] : ['fishing: bad resume partial'] };
}
