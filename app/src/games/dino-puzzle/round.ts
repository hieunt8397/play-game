// Ghép khủng long round model (Story 3.3), pure: the round's dinos, the loose and placed pieces, the
// drop resolution, the come-alive hand-over and the end of the round. The scene (DinoPuzzle.ts) only
// applies the commands with Phaser.
//
// Drop resolution of a loose piece, first match wins:
//   1. own   — inside its own slot target (even when another slot's zone also holds the point): it
//              snaps (sfx in the handler), tweens to its frame-aligned position and is locked;
//   2. home  — within snapRadius/2 of its pre-lift position: settles back, no hint;
//   3. other — inside any other slot target of the current dino (filled or not): floats back to its
//              pre-lift position, then `hint.wrong()`;
//   4. rest  — inside `hit.grass`: stays, nudged clear of the other loose pieces (its new pre-lift spot);
//   5. off   — anywhere else. Story 5.1: inside the play rect (the drag bounds: the sky, the cave wall)
//              the piece rests there, nudged clear of the other loose pieces; only a point outside it
//              slides back after a delay (a new lift cancels the slide).
// A snap that is not the dino's last piece: `stepDone` on the first unplaced piece (PIECES order), level
// kept. The last piece: `questionDone`, the question index advances, every piece is locked, the ambient
// is held ('alive') and the dino comes alive (scene chain). The name's `speech:ended` (completed or not)
// then begins the next dino, or celebrates and finishes the round after the last one.
// Story 3.4: the cut is `ladder[level].pieces` (3, 4 or 6 pieces); the drop order is content DROP_ORDER;
// each dino's loose pieces start at `arrangeStarts` (seeded bays, starts.ts); `resumeQuestion` validates
// a resume partial and `begin(index, fade, placed)` restores those pieces locked in place.
import { DROP_ORDER, type DropOutcome, type PieceId, type SpeciesId } from '../../content/games/dino-puzzle';
import type { Point } from '../../content/layout-types';
import { inRect, nudgeApart } from '../../core/input/drop';
import type { Rect } from '../../core/safe-rect';
import { ASK_LINE, RETRY_LINE, callSfxId, nameLineId } from './lines';
import { levelIndex, levelPieces, roundSpecies } from './questions';
import { arrangeStarts, type StartGeo } from './starts';

export interface Area {
  contains(p: Point): boolean;
}

/** The bays, slots and trimmed sizes (StartGeo, for the start arrangement) plus the drop geometry. */
export interface DinoGeometry extends StartGeo {
  /** The drawn centre of a placed piece: its frame's trimmed centre (the frame lines up with the whole dino). */
  placed(s: SpeciesId, p: PieceId): Point;
  /** The loose piece's r: its displayed longest side / 2 (design px). */
  radius(s: SpeciesId, p: PieceId): number;
  /** True when `pt` is inside the current dino's slot target of piece `p` (snap scale applies). */
  inSlot(p: PieceId, pt: Point): boolean;
  /** `hit.grass`. */
  readonly grass: Area;
  /** Where a resting piece may lie: the grass box ∩ the drag bounds. */
  restRect(): Rect;
  /** Story 5.1: the play area (the drag bounds): an off drop inside it rests where it landed. */
  playRect(): Rect;
  /** dropTarget.snapRadius (design px). */
  readonly snapRadius: number;
  readonly offDelayMs: number;
  /** After the last dino is named, the round finishes this much later (Timing.roundCelebrationMs). */
  readonly finishDelayMs: number;
}

export type Stage = 'pieces' | 'alive' | 'done';
/** The tag the scene maps its voice token to (the dino's name). */
export type SpeechTag = 'name';
export type { DropOutcome };

export interface PieceState {
  readonly id: PieceId;
  readonly at: Point;
}

export type DinoCommand =
  /**
   * The ghost of `species`, a slot target for every piece of `cut`, and the unplaced pieces loose at
   * their arranged starts (`fade`: the next dino fades in).
   */
  | { readonly kind: 'showDino'; readonly species: SpeciesId; readonly cut: readonly PieceId[]; readonly pieces: readonly PieceState[]; readonly fade: boolean }
  /** Story 3.4 resume: these pieces sit locked in place, real-coloured, at scale 1 (no tween, no sfx). */
  | { readonly kind: 'restorePieces'; readonly ids: readonly PieceId[] }
  /** The dino's hint question; the hinted piece is the first unplaced one. */
  | { readonly kind: 'beginQuestion'; readonly promptLineId: string; readonly retryLineId: string; readonly piece: PieceId }
  | { readonly kind: 'stepDone'; readonly piece: PieceId }
  /** `piece` snaps into place (sfx in the handler), tweens to `to` (frame-aligned) and is locked. */
  | { readonly kind: 'snap'; readonly piece: PieceId; readonly to: Point }
  | { readonly kind: 'floatBack'; readonly piece: PieceId; readonly to: Point }
  | { readonly kind: 'rest'; readonly piece: PieceId; readonly at: Point }
  | { readonly kind: 'returnLater'; readonly piece: PieceId; readonly to: Point; readonly ms: number }
  | { readonly kind: 'cancelReturn'; readonly piece: PieceId }
  | { readonly kind: 'hintWrong' }
  | { readonly kind: 'questionDone' }
  /** Every piece unpickable. */
  | { readonly kind: 'lockAll' }
  /** Holds (or releases) the ambient motion while a dino is alive. */
  | { readonly kind: 'holdAlive'; readonly on: boolean }
  /** The last dino's last piece: from now on a Home tap completes the round (MiniGameBase.markFinishing). */
  | { readonly kind: 'markFinishing' }
  /** Blink → bounce → walk → happy call → (after dinoCallMs) `say` the name with tag 'name'. */
  | { readonly kind: 'comeAlive'; readonly species: SpeciesId; readonly callSfxId: string; readonly nameLineId: string; readonly last: boolean }
  /** The named dino fades out (the next dino's `build` follows). */
  | { readonly kind: 'clearDino' }
  /** The last dino: bounce again and the happy tune. */
  | { readonly kind: 'celebrate' }
  | { readonly kind: 'finishRound'; readonly afterMs: number };

export interface DinoProgress {
  readonly questionIndex: number;
  readonly partial: { readonly placed: string[] };
}

export class DinoRound {
  private readonly geo: DinoGeometry;
  private readonly seed: number;
  private readonly level: number;
  private readonly dinos: readonly SpeciesId[];
  private readonly cut: readonly PieceId[];
  private index = 0;
  private st: Stage = 'pieces';
  private placedIds: PieceId[] = [];
  private loose = new Map<PieceId, Point>();
  private pendingReturn = new Set<PieceId>();

  constructor(geo: DinoGeometry, seed: number, level: number) {
    this.geo = geo;
    this.seed = seed;
    this.level = levelIndex(level);
    this.dinos = roundSpecies(seed, this.level);
    this.cut = levelPieces(this.level);
  }

  get questionIndex(): number {
    return this.index;
  }

  get questionCount(): number {
    return this.dinos.length;
  }

  get stage(): Stage {
    return this.st;
  }

  /** The round's dinos in order. */
  get species(): readonly SpeciesId[] {
    return this.dinos;
  }

  /** The current dino (the last one once the round is done). */
  get current(): SpeciesId {
    return this.dinos[Math.min(this.index, this.dinos.length - 1)]!;
  }

  /** The piece ids of the cut, in hint order. */
  get pieces(): readonly PieceId[] {
    return this.cut;
  }

  /** True from the last dino's last piece on (a Home tap then completes the round). */
  get isFinishing(): boolean {
    return this.index >= this.questionCount;
  }

  /** Pieces placed on the current dino, in placement order. */
  placed(): readonly PieceId[] {
    return this.placedIds;
  }

  /** The first unplaced piece in PIECES order (the hinted one); undefined when all are placed. */
  firstUnplaced(): PieceId | undefined {
    return this.cut.find((p) => !this.placedIds.includes(p));
  }

  /** The loose pieces and their pre-lift positions. */
  loosePieces(): PieceState[] {
    return [...this.loose].map(([id, at]) => ({ id, at }));
  }

  /** Lays out dino 0. */
  start(): DinoCommand[] {
    return this.begin(0, false);
  }

  /** The arranged start spots of dino `index` (the same on a resume). */
  starts(index: number): Partial<Record<PieceId, Point>> {
    const i = Math.min(Math.max(0, index), this.dinos.length - 1);
    return arrangeStarts(this.seed, i, this.dinos[i]!, this.cut, this.geo);
  }

  /**
   * Validates a resume partial for dino `index`: a plain object whose `placed` is an array of distinct
   * piece ids of the cut, fewer than the cut (the last snap advances the dino). Extra keys are ignored.
   */
  resumeQuestion(index: number, partial: unknown): { placed: PieceId[] } | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.questionCount) return null;
    if (typeof partial !== 'object' || partial === null || Array.isArray(partial)) return null;
    const proto: unknown = Object.getPrototypeOf(partial);
    if (proto !== Object.prototype && proto !== null) return null;
    const { placed } = partial as { placed?: unknown };
    if (!Array.isArray(placed)) return null;
    const cut: readonly string[] = this.cut;
    if (!placed.every((id): id is PieceId => typeof id === 'string' && cut.includes(id))) return null;
    if (new Set(placed).size !== placed.length || placed.length >= cut.length) return null;
    return { placed: [...placed] };
  }

  /**
   * Lays out dino `index`: its ghost and the unplaced pieces at their arranged starts, the `placed`
   * pieces (from `resumeQuestion`) restored in place, then the hint question on the first unplaced piece.
   */
  begin(index: number, fade: boolean, placed: readonly PieceId[] = []): DinoCommand[] {
    this.index = index;
    this.st = 'pieces';
    this.placedIds = [...placed];
    this.pendingReturn = new Set();
    const s = this.current;
    const starts = this.starts(index);
    this.loose = new Map(this.cut.filter((p) => !placed.includes(p)).map((p) => [p, starts[p]!]));
    return [
      { kind: 'showDino', species: s, cut: this.cut, pieces: this.loosePieces(), fade },
      { kind: 'restorePieces', ids: [...placed] },
      { kind: 'beginQuestion', promptLineId: ASK_LINE, retryLineId: RETRY_LINE, piece: this.firstUnplaced()! },
    ];
  }

  /** A finger lifted `piece`: a pending slide back is cancelled. */
  lift(piece: PieceId): DinoCommand[] {
    if (!this.pendingReturn.delete(piece)) return [];
    return [{ kind: 'cancelReturn', piece }];
  }

  /** Where a drop of `piece` at `p` resolves (no state change). */
  resolve(piece: PieceId, p: Point): DropOutcome {
    const at = this.loose.get(piece);
    const g = this.geo;
    // Story 3.4: the first DROP_ORDER outcome that matches (`own` first: "ô đúng thắng").
    const matches: Record<DropOutcome, () => boolean> = {
      own: () => g.inSlot(piece, p),
      home: () => at !== undefined && Math.hypot(p.x - at.x, p.y - at.y) <= g.snapRadius / 2,
      other: () => this.cut.some((q) => q !== piece && g.inSlot(q, p)),
      rest: () => g.grass.contains(p),
      off: () => true,
    };
    return DROP_ORDER.find((o) => matches[o]()) ?? 'off';
  }

  /** `piece` released at `p` (its centre). */
  drop(piece: PieceId, p: Point): DinoCommand[] {
    const at = this.loose.get(piece);
    if (!at) return [];
    // A drag that was still running when the dino came alive just goes back.
    if (this.st !== 'pieces') return [{ kind: 'floatBack', piece, to: at }];
    switch (this.resolve(piece, p)) {
      case 'own':
        return this.snap(piece);
      case 'home':
        return [{ kind: 'floatBack', piece, to: at }];
      case 'other':
        return [{ kind: 'floatBack', piece, to: at }, { kind: 'hintWrong' }];
      case 'rest':
        return this.rest(piece, p, this.geo.restRect());
      case 'off':
        if (inRect(p, this.geo.playRect())) return this.rest(piece, p, this.geo.playRect());
        this.pendingReturn.add(piece);
        return [{ kind: 'returnLater', piece, to: at, ms: this.geo.offDelayMs }];
    }
  }

  /** `piece` stays at `p`, nudged clear of the other loose pieces (radius sum) inside `rect`: its new pre-lift spot. */
  private rest(piece: PieceId, p: Point, rect: Rect): DinoCommand[] {
    const s = this.current;
    const others = [...this.loose].filter(([id]) => id !== piece);
    const minDist = this.geo.radius(s, piece) + Math.max(0, ...others.map(([id]) => this.geo.radius(s, id)));
    const next = nudgeApart(p, others.map(([, q]) => q), minDist, rect);
    this.loose.set(piece, next);
    return [{ kind: 'rest', piece, at: next }];
  }

  /** The drag of `piece` ended without a release (pause, lost up): back to its pre-lift spot. */
  cancel(piece: PieceId): DinoCommand[] {
    const at = this.loose.get(piece);
    return at ? [{ kind: 'floatBack', piece, to: at }] : [];
  }

  /** A delayed slide back ran. */
  returned(piece: PieceId): void {
    this.pendingReturn.delete(piece);
  }

  /** The dino's name ended (completed or cut): the next dino, or the end of the round. */
  speechEnded(tag: SpeechTag): DinoCommand[] {
    if (this.st !== 'alive' || tag !== 'name') return [];
    if (this.isFinishing) {
      this.st = 'done';
      return [{ kind: 'celebrate' }, { kind: 'finishRound', afterMs: this.geo.finishDelayMs }];
    }
    return [{ kind: 'clearDino' }, { kind: 'holdAlive', on: false }, ...this.begin(this.index, true)];
  }

  /** The resumable state (AD-2): the open dino and the pieces placed on it, in placement order. */
  progress(): DinoProgress {
    return { questionIndex: Math.min(this.index, this.questionCount), partial: { placed: [...this.placedIds] } };
  }

  private snap(piece: PieceId): DinoCommand[] {
    const s = this.current;
    this.loose.delete(piece);
    this.pendingReturn.delete(piece);
    this.placedIds.push(piece);
    const out: DinoCommand[] = [{ kind: 'snap', piece, to: this.geo.placed(s, piece) }];
    const next = this.firstUnplaced();
    if (next !== undefined) return [...out, { kind: 'stepDone', piece: next }];
    // The last piece: the answered dino is never "in progress" (spec-1-10 order).
    this.st = 'alive';
    this.index += 1;
    this.placedIds = [];
    out.push({ kind: 'questionDone' }, { kind: 'lockAll' }, { kind: 'holdAlive', on: true });
    if (this.isFinishing) out.push({ kind: 'markFinishing' });
    out.push({ kind: 'comeAlive', species: s, callSfxId: callSfxId(s), nameLineId: nameLineId(s), last: this.isFinishing });
    return out;
  }
}

/** What a start lays out: its commands, whether the resume was taken, and the warnings to log. */
export interface StartPlan {
  readonly commands: DinoCommand[];
  readonly accepted: boolean;
  readonly warnings: string[];
}

/**
 * The first commands of a start. No resume → dino 0. A resume → dino `resumeAt.questionIndex` with its
 * validated `placed` restored; a bad partial → that dino clean with one warning (still accepted, so the
 * closed dinos' tally stays, as in pizza). An out-of-range index → dino 0, not accepted, one warning.
 */
export function startCommands(round: DinoRound, resumeAt: { readonly questionIndex: number; readonly partial?: unknown } | null): StartPlan {
  if (!resumeAt) return { commands: round.start(), accepted: false, warnings: [] };
  const i = resumeAt.questionIndex;
  if (!Number.isInteger(i) || i < 0 || i >= round.questionCount) {
    return { commands: round.start(), accepted: false, warnings: [`dino-puzzle: resume index out of range (${i}) — the round starts at dino 1`] };
  }
  const ok = round.resumeQuestion(i, resumeAt.partial);
  return { commands: round.begin(i, false, ok?.placed ?? []), accepted: true, warnings: ok ? [] : ['dino-puzzle: bad resume partial'] };
}
