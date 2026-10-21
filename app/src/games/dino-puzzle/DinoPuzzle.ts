// Ghép khủng long (Story 3.3): drag the three pieces of a gentle dinosaur onto its ghost until it
// comes alive, blinks, bounces, walks a few steps, calls softly and says its name. The scene only wires
// Phaser: the plate `bg.dino-puzzle`, the full-frame sprites of `atlas.dino-puzzle` (the ghost and the
// whole dino on the full frame, pieces on their trimmed centres; a placed piece sits exactly where its
// frame was rendered, so the come-alive swap shows no jump), DragControllers for the pieces, one slot
// drop target per piece and tweens. Every decision (drop resolution, the hint step, the hand-over to the
// next dino, the round end) is the pure round model (round.ts, questions.ts); prompts and retries go
// through `hint` only; the game speaks only each dino's name (`say`). Every position comes from
// LAYOUTS['dino-puzzle']; timers are scene-clock events and tweens (removed or frozen with the scene).
// Story 3.4: 3, 4 or 6 pieces per the level's cut (draggables and slot targets only for that cut); a
// loose piece is drawn enlarged to draggableItem.minSize (starts.ts › pieceScale) and eases to scale 1
// as it snaps; loose pieces start at the seeded bays (starts.ts › arrangeStarts); a resumed dino shows
// its placed pieces at once, in place and real-coloured (`restorePieces`, no tween, no sfx).
import type { GameObjects, Time, Tweens } from 'phaser';
import { ATLASES, BACKGROUNDS } from '../../content/assets';
import {
  BAY_ANCHORS,
  CLOUDS,
  GRASS_HIT,
  SFX,
  cloudFrame,
  dinoAnchor,
  dinoFrames,
  pieceFrames,
  pieceSlot,
  walkAnchor,
  type PieceId,
  type SpeciesId,
} from '../../content/games/dino-puzzle';
import type { Point, ScreenLayout } from '../../content/layout-types';
import { LAYOUTS } from '../../content/layouts';
import { audio } from '../../core/audio-director';
import { bus } from '../../core/bus';
import type { HintStep } from '../../core/hint-director';
import { createSelectionRing, type SelectionRing } from '../../core/hint-visuals';
import { createDraggable, defaultDragArea, defaultPlayRect, type Draggable } from '../../core/input/drag-controller';
import { createDropTarget, intersectRect, type DropTarget } from '../../core/input/drop';
import { inputGuard } from '../../core/input/guard';
import { boundingBox, pointInPolygon } from '../../core/input/polygon';
import { createTapRouter, type TapRouter } from '../../core/input/tap-router';
import { amplitude, prefersReducedMotion } from '../../core/reduced-motion';
import type { Rect } from '../../core/safe-rect';
import { Tokens } from '../../core/tokens';
import { originFor, trimmedCentre, trimmedSize, type TrimmedRect } from '../../core/ui/sprite-pivot';
import { MiniGameBase } from '../mini-game-base';
import { DinoRound, startCommands, type Area, type DinoCommand, type DinoGeometry, type DinoProgress, type PieceState, type SpeechTag } from './round';
import { displayedSize, hitRadius, pieceScale, type Size } from './starts';

const EASE_OUT = 'Quad.easeOut';
const SINE = 'Sine.easeInOut';
/** Ambient hold reason (MiniGameBase) while a dino is alive. */
const HOLD_ALIVE = 'alive';
/** The slot highlight shows from this hint level (with the director's ring). */
const HIGHLIGHT_LEVEL = 2;

/** Draw order: clouds, the ghost, the slot highlight, placed pieces, the living dino, loose pieces, the lifted one. */
const LAYERS = ['cloud', 'ghost', 'highlight', 'placed', 'dino', 'piece', 'lifted'] as const;
const Depth = Object.fromEntries(LAYERS.map((name, i) => [name, i + 1])) as Readonly<Record<(typeof LAYERS)[number], number>>;

interface FrameData {
  readonly spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

interface PieceView {
  readonly id: PieceId;
  readonly image: GameObjects.Image | undefined;
  readonly shadow: GameObjects.Ellipse;
  /** Undefined once the piece is placed. */
  drag: Draggable | undefined;
  /** Hit radius (displayed longest side / 2 + draggableItem.hitPad). */
  readonly hitR: number;
  /** The loose scale (pieceScale; 1 = true size) × 1/renderScale is the image scale while loose. */
  readonly looseScale: number;
  /** The piece is drawn here (its trimmed centre). */
  pos: Point;
  tween: Tweens.Tween | undefined;
  /** Story 5.1: the running move's onDone, run when another move replaces it. */
  tweenDone?: (() => void) | undefined;
  /** The snap scale tween (loose scale → true size → 1.05× → 1). */
  scaleTween: Tweens.Tween | undefined;
  returnTimer: Time.TimerEvent | undefined;
}

/** What one dino puts on screen. */
interface DinoView {
  readonly species: SpeciesId;
  readonly ghost: GameObjects.Image | undefined;
  readonly pieces: Map<PieceId, PieceView>;
  readonly targets: Map<PieceId, DropTarget>;
  /** The living dino (created when it comes alive). */
  alive: GameObjects.Image | undefined;
  /** Story 5.4: true while the living dino runs its come-alive or celebration (no tap bounce then). */
  busy: boolean;
  /** Story 5.4: removes the living dino's tap reaction. */
  unreact: (() => void) | undefined;
}

const NO_AREA: Area = { contains: () => false };

export class DinoPuzzle extends MiniGameBase<'dino-puzzle'> {
  private round: DinoRound | undefined;
  private router: TapRouter | undefined;
  /** Story 5.1: the ring around the tap-selected piece. */
  private selection: SelectionRing | undefined;
  private layout: ScreenLayout = LAYOUTS['dino-puzzle'];
  private dino: DinoView | undefined;
  private highlight: GameObjects.Image | undefined;
  private hintLevel = 0;
  /** The piece the hint step points at (the first unplaced one). */
  private hinted: PieceId | undefined;
  /** Voice tokens of the game's own utterances, by tag (only the latest per tag). */
  private tokens = new Map<number, SpeechTag>();
  private issuing: SpeechTag | undefined;
  private warned = new Set<string>();
  /** Snap tweens still running, and what waits for them to end (the come-alive). */
  private snapping = 0;
  private afterSnap: (() => void)[] = [];

  constructor() {
    super('dino-puzzle');
  }

  // --- build ----------------------------------------------------------------------------------------

  protected build(): void {
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS['dino-puzzle'];
    this.dino = undefined;
    this.highlight = undefined;
    this.hintLevel = 0;
    this.hinted = undefined;
    this.tokens = new Map();
    this.issuing = undefined;
    this.snapping = 0;
    this.afterSnap = [];
    const bg = BACKGROUNDS['dino-puzzle'].key;
    if (this.textures.exists(bg)) this.add.image(0, 0, bg).setOrigin(0).setScale(1 / this.layout.renderScale);
    else console.warn(`dino-puzzle: texture "${bg}" is missing — plate skipped`);

    this.router = createTapRouter(this);
    this.attachSkip(this.router);
    this.attachReactions(this.router);
    this.addClouds();

    const scoped = bus.scoped(this);
    scoped.on('speech:ended', ({ token }) => {
      const tag = this.tokens.get(token);
      if (tag === undefined) return;
      this.tokens.delete(token);
      // The name ended, completed or cut: the next dino (or the end of the round).
      this.applyAll(this.round?.speechEnded(tag) ?? []);
    });
    scoped.on('speech:line', ({ token, index }) => {
      // The first line of the game's own request arrives before `say` returns its token.
      if (!this.tokens.has(token) && this.issuing !== undefined && index === 0) this.tokens.set(token, this.issuing);
    });
    scoped.on('hint:level', ({ gameId, level }) => {
      if (gameId !== this.gameId) return;
      this.hintLevel = level;
      this.showHighlight();
    });

    const round = new DinoRound(this.geometry(), this.seed, this.level);
    this.round = round;
    const plan = startCommands(round, this.resumeAt);
    for (const w of plan.warnings) console.warn(w);
    if (plan.accepted) this.acceptResume();
    this.applyAll(plan.commands);
  }

  protected progress(): DinoProgress {
    return this.round?.progress() ?? { questionIndex: 0, partial: { placed: [] } };
  }

  private centre(): Point {
    return { x: this.layout.design.width / 2, y: this.layout.design.height / 2 };
  }

  private anchor(id: string): Point {
    const p = this.layout.anchors[id];
    if (!p) this.warnOnce(`anchor.${id}`, `dino-puzzle: anchor "${id}" is missing from the layout`);
    return p ?? this.centre();
  }

  private slot(id: string): Point {
    const p = this.layout.slots[id];
    if (!p) this.warnOnce(`slot.${id}`, `dino-puzzle: slot "${id}" is missing from the layout`);
    return p ?? this.centre();
  }

  private grass(): Area {
    const poly = this.layout.hits[GRASS_HIT];
    if (!poly) {
      this.warnOnce(GRASS_HIT, `dino-puzzle: hit "${GRASS_HIT}" is missing from the layout`);
      return NO_AREA;
    }
    return { contains: (p) => pointInPolygon(p, poly) };
  }

  /** Trimmed rect of an atlas frame (render px); undefined when the frame is missing. */
  private frameRect(frame: string): TrimmedRect | undefined {
    const key = ATLASES['dino-puzzle'].key;
    if (!this.textures.exists(key) || !this.textures.get(key).has(frame)) return undefined;
    const ss = (this.textures.get(key).get(frame).customData as FrameData | undefined)?.spriteSourceSize;
    return ss ? { x: ss.x, y: ss.y, width: ss.w, height: ss.h } : undefined;
  }

  private hasFrame(frame: string): boolean {
    if (this.frameRect(frame)) return true;
    this.warnOnce(frame, `dino-puzzle: frame "${frame}" is missing`);
    return false;
  }

  private warnOnce(what: string, msg: string): void {
    if (this.warned.has(what)) return;
    this.warned.add(what);
    console.warn(msg);
  }

  /** A full-frame sprite placed on `pivot` (the frame is rendered there), or undefined with one warning. */
  private sprite(frame: string, pivot: Point): GameObjects.Image | undefined {
    if (!this.hasFrame(frame)) return undefined;
    const o = originFor(pivot, this.layout.design);
    return this.add.image(pivot.x, pivot.y, ATLASES['dino-puzzle'].key, frame).setOrigin(o.x, o.y).setScale(1 / this.layout.renderScale);
  }

  /** Where a piece sits when placed: its frame's trimmed centre (else its slot). */
  private placedAt(s: SpeciesId, p: PieceId): Point {
    const rect = this.frameRect(pieceFrames(s, p).idle);
    return rect ? trimmedCentre(rect, this.layout.renderScale) : this.slot(pieceSlot(s, p));
  }

  /** A piece's trimmed size (design px; else the item minimum square). */
  private pieceSize(s: SpeciesId, p: PieceId): Size {
    const rect = this.frameRect(pieceFrames(s, p).idle);
    const min = Tokens.components.draggableItem.minSize;
    return rect ? trimmedSize(rect, this.layout.renderScale) : { w: min, h: min };
  }

  /** A loose piece's r: its displayed longest side / 2. */
  private pieceR(s: SpeciesId, p: PieceId): number {
    const d = displayedSize(this.pieceSize(s, p));
    return Math.max(d.w, d.h) / 2;
  }

  private geometry(): DinoGeometry {
    const box = boundingBox(this.layout.hits[GRASS_HIT] ?? []);
    const grassRect: Rect = { x: box.x, y: box.y, w: box.width, h: box.height };
    return {
      bays: BAY_ANCHORS.map((id) => this.anchor(id)),
      slot: (s, p) => this.slot(pieceSlot(s, p)),
      size: (s, p) => this.pieceSize(s, p),
      placed: (s, p) => this.placedAt(s, p),
      radius: (s, p) => this.pieceR(s, p),
      inSlot: (p, pt) => this.dino?.targets.get(p)?.contains(pt) ?? false,
      grass: this.grass(),
      restRect: () => {
        const a = defaultDragArea();
        return a ? intersectRect(grassRect, a.bounds) : grassRect;
      },
      playRect: defaultPlayRect,
      snapRadius: Tokens.components.dropTarget.snapRadius,
      offDelayMs: Tokens.Timing.dragOffCounterReturnDelayMs,
      finishDelayMs: Tokens.Timing.roundCelebrationMs,
    };
  }

  // --- clouds -----------------------------------------------------------------------------------------

  /** The two clouds drift ± dinoCloudDriftPx in x (ambient, yoyo); still under reduced motion. */
  private addClouds(): void {
    for (const c of CLOUDS) {
      const img = this.sprite(cloudFrame(c), this.anchor(c))?.setDepth(Depth.cloud);
      // Story 5.4: a tapped cloud bounces with "pụp".
      if (img) this.react({ image: img });
      if (!img || this.reduced) continue;
      const x = img.x;
      img.setX(x - Tokens.ui.dinoCloudDriftPx);
      this.addAmbient(
        this.tweens.add({ targets: img, x: x + Tokens.ui.dinoCloudDriftPx, duration: Tokens.Timing.dinoCloudDriftMs, ease: SINE, yoyo: true, repeat: -1 }),
      );
    }
  }

  // --- one dino ----------------------------------------------------------------------------------------

  /** The ghost (full frame), one slot target per piece of the cut and the loose pieces at their starts. */
  private buildDino(s: SpeciesId, cut: readonly PieceId[], pieces: readonly PieceState[], fade: boolean): void {
    const ghost = this.hasFrame(dinoFrames(s).ghost) ? this.fullFrame(dinoFrames(s).ghost).setDepth(Depth.ghost) : undefined;
    const targets = new Map<PieceId, DropTarget>();
    const view: DinoView = { species: s, ghost, pieces: new Map(), targets, alive: undefined, busy: false, unreact: undefined };
    this.dino = view;
    const snapR = Tokens.components.dropTarget.snapRadius;
    for (const p of cut) {
      const at = this.slot(pieceSlot(s, p));
      targets.set(p, createDropTarget({ id: `slot-${p}`, circle: { x: at.x, y: at.y, r: snapR } }));
    }
    for (const p of pieces) view.pieces.set(p.id, this.addPiece(s, p));
    if (fade) {
      const objs = [ghost, ...[...view.pieces.values()].map((v) => v.image)].filter((o): o is GameObjects.Image => o !== undefined);
      for (const o of objs) o.setAlpha(0);
      this.tweens.add({ targets: objs, alpha: 1, duration: Tokens.Timing.dinoNextFadeMs });
    }
  }

  /** A full-frame image at the design origin (the frame lines up with the plate). */
  private fullFrame(frame: string): GameObjects.Image {
    return this.add.image(0, 0, ATLASES['dino-puzzle'].key, frame).setOrigin(0).setScale(1 / this.layout.renderScale);
  }

  /** The piece image with its origin on its trimmed centre (it scales around it), or undefined with one warning. */
  private pieceImage(s: SpeciesId, p: PieceId, at: Point, scale: number): GameObjects.Image | undefined {
    const frame = pieceFrames(s, p).idle;
    const rect = this.frameRect(frame);
    if (!rect) {
      this.warnOnce(frame, `dino-puzzle: frame "${frame}" is missing — piece drawn without an image`);
      return undefined;
    }
    const o = originFor(trimmedCentre(rect, this.layout.renderScale), this.layout.design);
    return this.add.image(at.x, at.y, ATLASES['dino-puzzle'].key, frame).setOrigin(o.x, o.y).setScale(scale / this.layout.renderScale);
  }

  /** A loose piece: drawn at pieceScale, its hit circle sized to the displayed piece. */
  private addPiece(s: SpeciesId, p: PieceState): PieceView {
    const item = Tokens.components.draggableItem;
    const size = this.pieceSize(s, p.id);
    const looseScale = pieceScale(Math.max(size.w, size.h));
    const shown = displayedSize(size);
    const shadowSpec = item.liftShadow;
    const shadow = this.add
      .ellipse(p.at.x + shadowSpec.x, p.at.y + shadowSpec.y, shown.w, shown.h / 2, shadowSpec.color.value, shadowSpec.color.alpha)
      .setDepth(Depth.piece)
      .setVisible(false);
    const image = this.pieceImage(s, p.id, p.at, looseScale)?.setDepth(Depth.piece);
    const view: PieceView = { id: p.id, image, shadow, drag: undefined, hitR: hitRadius(size), looseScale, pos: { ...p.at }, tween: undefined, scaleTween: undefined, returnTimer: undefined };
    if (this.router) {
      view.drag = createDraggable(this.router, {
        circle: { x: p.at.x, y: p.at.y, r: view.hitR },
        itemRadius: item.minSize / 2,
        onLift: () => this.lift(view),
        onMove: (pt) => this.place(view, pt),
        onDrop: (pt) => this.settle(view, () => this.round?.drop(view.id, pt) ?? []),
        onCancel: () => this.settle(view, () => this.round?.cancel(view.id) ?? []),
        // Story 5.1 tap-then-tap: the tapped piece stays lifted with a ring, then flies to the next tap.
        onSelect: () => this.select(view),
        onDeselect: () => this.deselect(),
        fly: (to, done) => this.moveTo(view, to, Tokens.Timing.tapFlyMs, done),
      });
      view.drag.object = image;
    }
    return view;
  }

  /** Story 3.4 resume: the placed pieces sit locked in place at true size, real-coloured; no tween, no sfx. */
  private restorePieces(ids: readonly PieceId[]): void {
    const d = this.dino;
    if (!d) return;
    for (const id of ids) {
      const at = this.placedAt(d.species, id);
      const image = this.pieceImage(d.species, id, at, 1)?.setDepth(Depth.placed);
      const shadow = this.add.ellipse(at.x, at.y, 1, 1).setVisible(false);
      d.pieces.set(id, { id, image, shadow, drag: undefined, hitR: 0, looseScale: 1, pos: at, tween: undefined, scaleTween: undefined, returnTimer: undefined });
    }
  }

  private place(view: PieceView, p: Point): void {
    view.pos = { ...p };
    view.image?.setPosition(p.x, p.y);
    view.drag?.setCircle({ x: p.x, y: p.y, r: view.hitR });
    const spec = Tokens.components.draggableItem.liftShadow;
    view.shadow.setPosition(p.x + spec.x, p.y + spec.y);
  }

  private lift(view: PieceView): void {
    this.applyAll(this.round?.lift(view.id) ?? []);
    view.tween?.stop();
    view.tween = undefined;
    // Lift is liftScale x the loose scale.
    view.image?.setScale((Tokens.components.draggableItem.liftScale * view.looseScale) / this.layout.renderScale).setDepth(Depth.lifted);
    view.shadow.setVisible(true).setDepth(Depth.lifted);
  }

  /** Story 5.1: a tapped piece stays lifted (lift ran on its press) and gets the selection ring. */
  private select(view: PieceView): void {
    this.selection?.destroy();
    this.selection = createSelectionRing(this, view.image, Depth.lifted);
  }

  private deselect(): void {
    this.selection?.destroy();
    this.selection = undefined;
  }

  private settle(view: PieceView, outcome: () => DinoCommand[]): void {
    view.image?.setScale(view.looseScale / this.layout.renderScale).setDepth(Depth.piece);
    view.shadow.setVisible(false).setDepth(Depth.piece);
    this.applyAll(outcome());
  }

  private moveTo(view: PieceView, to: Point, durationMs: number, onDone?: () => void): void {
    // A move already running hands over first: its onDone (a tap-then-tap fly's drop) must still run,
    // and so must the onDone of any move that one starts.
    for (let pending = view.tweenDone; pending; pending = view.tweenDone) {
      view.tweenDone = undefined;
      view.tween?.stop();
      view.tween = undefined;
      pending();
    }
    view.tween?.stop();
    const from = { ...view.pos };
    view.tweenDone = onDone;
    view.tween = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: durationMs,
      ease: EASE_OUT,
      onUpdate: (t) => {
        const v = t.getValue() ?? 0;
        this.place(view, { x: from.x + (to.x - from.x) * v, y: from.y + (to.y - from.y) * v });
      },
      onComplete: () => {
        view.tween = undefined;
        view.tweenDone = undefined;
        this.place(view, to);
        onDone?.();
      },
    });
  }

  /** The piece snaps (ease-out, 1.05× bounce) to its frame-aligned spot and is locked there; its scale eases to 1 (true size). */
  private snap(piece: PieceId, to: Point): void {
    audio.sfx(SFX.snap);
    const v = this.dino?.pieces.get(piece);
    if (!v) return;
    v.drag?.destroy();
    v.drag = undefined;
    v.returnTimer?.remove();
    v.returnTimer = undefined;
    v.shadow.setVisible(false);
    v.image?.setDepth(Depth.placed);
    const spec = Tokens.components.dropTarget.snap;
    const base = 1 / this.layout.renderScale;
    this.snapping += 1;
    this.moveTo(v, to, spec.durationMs, () => {
      this.snapping -= 1;
      if (this.snapping === 0) for (const fn of this.afterSnap.splice(0)) fn();
    });
    const img = v.image;
    if (!img) return;
    // First half: shrink from the loose scale to true size; second half: the 1.05× bounce and back, so
    // the overshoot shows for enlarged pieces too.
    const from = img.scale;
    const peak = base * amplitude(spec.scale, this.reduced);
    v.scaleTween?.stop();
    v.scaleTween = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: spec.durationMs,
      onUpdate: (t) => {
        if (!img.active) return;
        const k = t.getValue() ?? 0;
        if (k < 0.5) img.setScale(from + (base - from) * Math.sin(k * Math.PI));
        else img.setScale(base + (peak - base) * Math.sin((k - 0.5) * 2 * Math.PI));
      },
      onComplete: () => {
        v.scaleTween = undefined;
        if (img.active) img.setScale(base);
      },
    });
  }

  private destroyPiece(v: PieceView): void {
    v.tween?.stop();
    v.scaleTween?.stop();
    v.returnTimer?.remove();
    v.drag?.destroy();
    v.image?.destroy();
    v.shadow.destroy();
  }

  // --- the hint step and the slot highlight -------------------------------------------------------------

  private step(piece: PieceId): HintStep {
    this.hinted = piece;
    this.showHighlight();
    const v = this.dino?.pieces.get(piece);
    return { correct: v?.drag ? [v.drag] : [], distractors: [], target: this.dino?.targets.get(piece) ?? null, action: 'drag' };
  }

  /** At hint level ≥ 2 the hinted piece's slot shows its dashed outline (static, frame-aligned). */
  private showHighlight(): void {
    this.highlight?.destroy();
    this.highlight = undefined;
    const d = this.dino;
    if (!d || this.hinted === undefined || this.hintLevel < HIGHLIGHT_LEVEL || d.alive) return;
    const frame = pieceFrames(d.species, this.hinted).ghost;
    if (this.hasFrame(frame)) this.highlight = this.fullFrame(frame).setDepth(Depth.highlight);
  }

  private clearHighlight(): void {
    this.hinted = undefined;
    this.showHighlight();
  }

  // --- come alive ---------------------------------------------------------------------------------------

  /** Whole-dino frame `frame` on the living dino, when it exists (else the step is skipped, one warning). */
  private setDinoFrame(frame: string): void {
    const img = this.dino?.alive;
    if (img && this.hasFrame(frame)) img.setFrame(frame, false, false);
  }

  /** The celebrate bounce (character.celebrate) of the living dino around its ground pivot. */
  private bounceDino(done: () => void): void {
    const img = this.dino?.alive;
    const spec = Tokens.components.character.celebrate;
    if (!img) {
      this.time.delayedCall(spec.durationMs, done);
      return;
    }
    const scales = spec.scales.map((s) => amplitude(s, this.reduced));
    const base = 1 / this.layout.renderScale;
    const steps = scales.length - 1;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: spec.durationMs,
      onUpdate: (t) => {
        const cycle = ((t.getValue() ?? 0) * spec.repeat) % 1;
        const k = Math.min(steps - 1, Math.floor(cycle * steps));
        const local = cycle * steps - k;
        img.setScale(base * (scales[k]! + (scales[k + 1]! - scales[k]!) * Math.sin((local * Math.PI) / 2)));
      },
      onComplete: () => {
        img.setScale(base);
        done();
      },
    });
  }

  /** Walk to `anchor.<s>-walk` with the walk frames; reduced motion: an on-the-spot hop on the idle frame. */
  private walk(s: SpeciesId, done: () => void): void {
    const img = this.dino?.alive;
    const T = Tokens.Timing;
    if (!img) {
      this.time.delayedCall(T.dinoWalkMs, done);
      return;
    }
    const base = 1 / this.layout.renderScale;
    if (this.reduced) {
      this.tweens.add({ targets: img, scale: base * Tokens.ui.dinoReducedHopScale, duration: T.dinoWalkMs / 2, ease: SINE, yoyo: true, onComplete: () => {
        img.setScale(base);
        done();
      } });
      return;
    }
    const frames = dinoFrames(s).walk.filter((f) => this.hasFrame(f));
    const from = this.anchor(dinoAnchor(s));
    const to = this.anchor(walkAnchor(s));
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: T.dinoWalkMs,
      ease: SINE,
      onUpdate: (t) => {
        const v = t.getValue() ?? 0;
        img.setPosition(from.x + (to.x - from.x) * v, from.y + (to.y - from.y) * v);
        // The legs follow linear time (not the eased position): one frame every dinoWalkFrameMs.
        if (frames.length > 0) img.setFrame(frames[Math.floor((t.progress * T.dinoWalkMs) / T.dinoWalkFrameMs) % frames.length]!, false, false);
      },
      onComplete: () => {
        img.setPosition(to.x, to.y);
        done();
      },
    });
  }

  /** Happy frames with the soft call, then (after dinoCallMs) the name. */
  private call(callSfxId: string, nameLineId: string): void {
    const d = this.dino;
    if (!d) return;
    const frames = dinoFrames(d.species).happy.filter((f) => this.hasFrame(f));
    audio.sfx(callSfxId);
    const T = Tokens.Timing;
    this.tweens.addCounter({
      from: 0,
      to: T.dinoCallMs,
      duration: T.dinoCallMs,
      onUpdate: (t) => {
        if (frames.length > 0 && d.alive) d.alive.setFrame(frames[Math.floor((t.getValue() ?? 0) / T.dinoWalkFrameMs) % frames.length]!, false, false);
      },
      onComplete: () => {
        d.busy = false;
        this.say('name', () => audio.say(nameLineId));
      },
    });
  }

  /** Runs `fn` once no snap tween is running (at once when none is). */
  private afterSnaps(fn: () => void): void {
    if (this.snapping === 0) fn();
    else this.afterSnap.push(fn);
  }

  /** Swap → blink → bounce → walk → happy call → name (scene clock). */
  private comeAlive(s: SpeciesId, callSfxId: string, nameLineId: string): void {
    const d = this.dino;
    if (!d) return;
    this.clearHighlight();
    // The assembled pieces and the ghost give way to the whole dino (the same pixels).
    d.ghost?.setVisible(false);
    for (const v of d.pieces.values()) {
      v.tween?.stop();
      v.scaleTween?.stop();
      v.image?.setVisible(false);
    }
    const f = dinoFrames(s);
    d.alive = this.sprite(f.idle, this.anchor(dinoAnchor(s)))?.setDepth(Depth.dino);
    d.busy = true;
    // Story 5.4: once it has called, a tap on the finished dino bounces it (not during its own motion).
    const alive = d.alive;
    if (alive) d.unreact = this.react({ image: alive, base: 1 / this.layout.renderScale, enabled: () => !d.busy });
    this.setDinoFrame(f.blink);
    this.time.delayedCall(Tokens.Timing.dinoBlinkMs, () => {
      this.setDinoFrame(f.idle);
      // Story 5.4: the scale motions end with the walk on every branch (normal, reduced-motion hop, no sprite):
      // the dino is tappable from then on (the call only swaps frames).
      this.bounceDino(() =>
        this.walk(s, () => {
          d.busy = false;
          this.call(callSfxId, nameLineId);
        }),
      );
    });
  }

  /** The named dino fades out; its pieces and ghost go. */
  private clearDino(): void {
    const d = this.dino;
    this.dino = undefined;
    this.clearHighlight();
    if (!d) return;
    d.unreact?.();
    d.unreact = undefined;
    for (const v of d.pieces.values()) this.destroyPiece(v);
    d.ghost?.destroy();
    const img = d.alive;
    if (img) this.tweens.add({ targets: img, alpha: 0, duration: Tokens.Timing.sceneFadeMs, onComplete: () => img.destroy() });
  }

  /** The last dino: bounce again with the happy tune. */
  private celebrate(): void {
    audio.sfx(SFX.happy);
    const d = this.dino;
    if (d) d.busy = true;
    this.bounceDino(() => {
      if (d) d.busy = false;
    });
  }

  // --- round commands ------------------------------------------------------------------------------------

  private applyAll(cmds: readonly DinoCommand[]): void {
    if (this.inert) return;
    for (const c of cmds) this.apply(c);
  }

  private say(tag: SpeechTag, speak: () => number): void {
    if (this.inert) return;
    for (const [t, g] of this.tokens) if (g === tag) this.tokens.delete(t);
    this.issuing = tag;
    const token = speak();
    this.issuing = undefined;
    this.tokens.set(token, tag);
    // Story 5.3: after the token is stored, so a synchronous speech:ended from a skip is not lost.
    this.skipVoice(token);
  }

  private apply(c: DinoCommand): void {
    const pieces = this.dino?.pieces;
    switch (c.kind) {
      case 'showDino':
        this.buildDino(c.species, c.cut, c.pieces, c.fade);
        return;
      case 'restorePieces':
        this.restorePieces(c.ids);
        return;
      case 'beginQuestion':
        this.hint.beginQuestion({ promptLineId: c.promptLineId, retryLineId: c.retryLineId, step: this.step(c.piece) });
        return;
      case 'stepDone':
        this.hint.stepDone(this.step(c.piece));
        return;
      case 'snap':
        this.snap(c.piece, c.to);
        return;
      case 'floatBack': {
        const v = pieces?.get(c.piece);
        if (v) this.moveTo(v, c.to, Tokens.components.draggableItem.return.durationMs);
        return;
      }
      case 'rest': {
        const v = pieces?.get(c.piece);
        if (v) this.moveTo(v, c.at, Tokens.components.dropTarget.snap.durationMs);
        return;
      }
      case 'returnLater': {
        const v = pieces?.get(c.piece);
        if (!v) return;
        v.returnTimer?.remove();
        v.returnTimer = this.time.delayedCall(c.ms, () => {
          v.returnTimer = undefined;
          this.round?.returned(c.piece);
          this.moveTo(v, c.to, Tokens.components.draggableItem.return.durationMs);
        });
        return;
      }
      case 'cancelReturn': {
        const v = pieces?.get(c.piece);
        v?.returnTimer?.remove();
        if (v) v.returnTimer = undefined;
        return;
      }
      case 'hintWrong':
        this.hint.wrong();
        return;
      case 'questionDone':
        this.hint.questionDone();
        this.clearHighlight();
        return;
      case 'lockAll':
        for (const v of pieces?.values() ?? []) if (v.drag) inputGuard.setPickable(v.drag, false);
        return;
      case 'holdAlive':
        this.holdAmbient(HOLD_ALIVE, c.on);
        return;
      case 'markFinishing':
        this.markFinishing();
        return;
      case 'comeAlive':
        // The last piece first finishes its snap, so the swap to the whole dino shows no jump.
        this.afterSnaps(() => {
          if (this.inert) return;
          // Story 5.3: blink, walk, call and name — a tap after the arm delay fast-forwards it.
          const T = Tokens.Timing;
          this.skippable(T.dinoBlinkMs + T.dinoWalkMs + T.dinoCallMs + T.celebrationLineMs);
          this.comeAlive(c.species, c.callSfxId, c.nameLineId);
        });
        return;
      case 'clearDino':
        this.clearDino();
        return;
      case 'celebrate':
        this.celebrate();
        return;
      case 'finishRound':
        this.scheduleFinish(c.afterMs);
        return;
    }
  }
}
