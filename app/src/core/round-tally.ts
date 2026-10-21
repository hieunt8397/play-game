// Round tally (Story 1.10), pure and game-agnostic: MiniGameBase feeds it from the hint protocol
// (`beginQuestion`, `questionDone`, `hint:level`) so every game reports a correct RoundOutcome.
// Story 2.5: `state()` (closed questions only) travels in a resume snapshot, and `restore(s)` adds a
// snapshot's closed questions back before a resumed round begins its first question.
import type { GameId, HintLevel, RoundOutcome, TallyState } from '../content/types';

export class RoundTally {
  private closed = 0;
  private firstTry = 0;
  private roundMax: HintLevel = 0;
  /** The max level over closed questions only (what a snapshot keeps). */
  private closedMax: HintLevel = 0;
  /** The open question's own max level; undefined while no question is open. */
  private open: HintLevel | undefined = undefined;

  /** A question starts; a question still open is discarded (an unanswered question is never counted). */
  beginQuestion(): void {
    this.open = 0;
  }

  /** The hint level changed; ignored while no question is open (the reset after questionDone). */
  level(l: HintLevel): void {
    if (this.open === undefined) return;
    if (l > this.open) this.open = l;
    if (l > this.roundMax) this.roundMax = l;
  }

  /** The open question is answered; ignored when none is open. */
  questionDone(): void {
    if (this.open === undefined) return;
    this.closed += 1;
    if (this.open === 0) this.firstTry += 1;
    if (this.open > this.closedMax) this.closedMax = this.open;
    this.open = undefined;
  }

  get questions(): number {
    return this.closed;
  }

  /** The closed questions so far (an open question is not included). */
  state(): TallyState {
    return { questions: this.closed, firstTryCorrect: this.firstTry, maxHintLevel: this.closedMax };
  }

  /** Adds the closed questions of `s` (counts summed, max taken); called before any question begins. */
  restore(s: TallyState): void {
    this.closed += s.questions;
    this.firstTry += s.firstTryCorrect;
    if (s.maxHintLevel > this.closedMax) this.closedMax = s.maxHintLevel;
    if (s.maxHintLevel > this.roundMax) this.roundMax = s.maxHintLevel;
  }

  outcome(gameId: GameId): RoundOutcome {
    return { gameId, questions: this.closed, firstTryCorrect: this.firstTry, maxHintLevel: this.roundMax };
  }
}
