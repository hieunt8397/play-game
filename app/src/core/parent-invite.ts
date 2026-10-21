// Parent invitation model (Story 5.7, FR35): pure. One instance per game start decides, once, whether
// this round invites the parent ("Hỏi mẹ xem…") and with which line, then hands that line out at most
// once and only at an allowed moment:
//   - `roundStartLine()`: before the round's first question begins (MiniGameBase chains it before the
//     first prompt, so it never falls between a prompt and its hints);
//   - `freePlayLine()`: while no question is open (touch-talk; Story 5.8's free play).
// Nothing is handed out when disabled, on a resumed start (the snapshot does not record whether one
// was said), without lines, after `close()` (the terminal event) or once used.
import { randInt } from './rng';

export interface ParentInviteOptions {
  /** PARENT_INVITE_ENABLED. */
  readonly enabled: boolean;
  /** The game's parent lines (PARENT_INVITE_LINES[gameId]). */
  readonly lines: readonly string[];
  /** The start's own rng (seeded from the round seed). */
  readonly rand: () => number;
  /** Tokens.ui.parentInviteChance. */
  readonly chance: number;
  /** True on a resumed start: never an invite. */
  readonly resumed: boolean;
}

export interface ParentInvite {
  /** The line, only before any question began; consumes the invite. */
  roundStartLine(): string | undefined;
  /** The line, only while no question is open; consumes the invite. */
  freePlayLine(): string | undefined;
  /** A question began (it is open until `questionClosed`). */
  questionBegan(): void;
  questionClosed(): void;
  /** The start's terminal event: nothing is handed out afterwards. */
  close(): void;
  /** True once the line was handed out. */
  readonly used: boolean;
}

export function createParentInvite(opts: ParentInviteOptions): ParentInvite {
  let line: string | undefined;
  if (opts.enabled && !opts.resumed && opts.lines.length > 0 && opts.rand() < opts.chance) {
    line = opts.lines[randInt(opts.rand, opts.lines.length)];
  }
  let used = false;
  let began = false;
  let open = false;
  let closed = false;

  const take = (): string | undefined => {
    if (closed || used || line === undefined) return undefined;
    used = true;
    return line;
  };

  return {
    roundStartLine: () => (began ? undefined : take()),
    freePlayLine: () => (open ? undefined : take()),
    questionBegan() {
      began = true;
      open = true;
    },
    questionClosed() {
      open = false;
    },
    close() {
      closed = true;
    },
    get used() {
      return used;
    },
  };
}
