// Hang tìm bóng (Stories 3.5, 3.6): a friendly triceratops at a bright cave mouth holds an animal or a vehicle;
// the child drags it onto its purple-grey shadow on the rock ledges. The item is sucked into the shadow,
// the shadow turns real-coloured, the triceratops nods and chirps and the item's name is said. The scene
// only wires Phaser: the plate `bg.shadow-match`, the full-frame sprites of `atlas.shadow-match` (the
// triceratops on its ground pivot; shadows and items on their trimmed centres), a DragController for the
// held item, one drop target per shadow (`pad` = that shadow's shown radius, so the level-4 snap scale
// applies to the forgiving margin only) and tweens. Every decision (drop resolution, the hand-over to
// the next question, the round end) is the pure round model (round.ts, questions.ts); prompts and
// retries go through `hint` only; the game speaks only each item's name (`say`). Every position comes
// from LAYOUTS['shadow-match']; timers are scene-clock events and tweens (removed or frozen with the scene).
import type { GameObjects, Time, Tweens } from 'phaser';
import { ATLASES, BACKGROUNDS } from '../../content/assets';
import { HAND_ANCHOR, SFX, TRIKE_ANCHOR, itemFrames, shadowSlot, trikeFrames, type ItemId } from '../../content/games/shadow-match';
import type { Point, ScreenLayout } from '../../content/layout-types';
import { LAYOUTS } from '../../content/layouts';
import { audio } from '../../core/audio-director';
import { bus } from '../../core/bus';
import type { HintItem, HintStep } from '../../core/hint-director';
import { createSelectionRing, type SelectionRing } from '../../core/hint-visuals';
import { createDraggable, defaultPlayRect, type Draggable } from '../../core/input/drag-controller';
import { createDropTarget, type DropTarget } from '../../core/input/drop';
import { createTapRouter, type TapRouter } from '../../core/input/tap-router';
import { amplitude, prefersReducedMotion } from '../../core/reduced-motion';
import { Tokens } from '../../core/tokens';
import { originFor, trimmedCentre, trimmedSize, type TrimmedRect } from '../../core/ui/sprite-pivot';
import { MiniGameBase } from '../mini-game-base';
import { heldHitRadius, shownRadius, type Size } from './geometry';
import { levelOf } from './questions';
import { ShadowRound, hintStepFor, startCommands, type ShadowCommand, type ShadowGeometry, type ShadowProgress, type SpeechTag } from './round';

const EASE_OUT = 'Quad.easeOut';
const SINE = 'Sine.easeInOut';
/** Ambient hold reasons (MiniGameBase): the reveal and the celebration. */
const HOLD_REVEAL = 'reveal';
const HOLD_CELEBRATE = 'celebrate';

/** Draw order: shadows, the revealed item, the triceratops, the held item, the lifted item. */
const LAYERS = ['shadow', 'revealed', 'trike', 'item', 'lifted'] as const;
const Depth = Object.fromEntries(LAYERS.map((name, i) => [name, i + 1])) as Readonly<Record<(typeof LAYERS)[number], number>>;

interface FrameData {
  readonly spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

/** One shadow on its slot. */
interface ShadowView {
  readonly item: ItemId;
  readonly image: GameObjects.Image | undefined;
  readonly target: DropTarget;
  /** The hint's handle on the shadow (ring, bob, dim). */
  readonly hint: HintItem;
}

/** The item the triceratops holds. */
interface HeldView {
  readonly item: ItemId;
  readonly image: GameObjects.Image | undefined;
  readonly shadow: GameObjects.Ellipse;
  drag: Draggable | undefined;
  readonly hitR: number;
  pos: Point;
  tween: Tweens.Tween | undefined;
  /** Story 5.1: the running move's onDone, run when another move replaces it. */
  tweenDone?: (() => void) | undefined;
  returnTimer: Time.TimerEvent | undefined;
}

/** What one question puts on screen. */
interface QuestionView {
  readonly shadows: ShadowView[];
  readonly correctSlot: number;
  held: HeldView | undefined;
  /** The item's colour frame on its slot (the reveal). */
  revealed: GameObjects.Image | undefined;
}

export class ShadowMatch extends MiniGameBase<'shadow-match'> {
  private round: ShadowRound | undefined;
  private router: TapRouter | undefined;
  /** Story 5.1: the ring around the tap-selected held item. */
  private selection: SelectionRing | undefined;
  private layout: ScreenLayout = LAYOUTS['shadow-match'];
  private trike: GameObjects.Image | undefined;
  /** Story 5.4: removes the triceratops' tap reaction. */
  private unreactTrike: (() => void) | undefined;
  private question: QuestionView | undefined;
  /** The reveal waits for the suck-in tween. */
  private sucking = false;
  private afterSuck: (() => void)[] = [];
  /** Voice tokens of the game's own utterances, by tag (only the latest per tag). */
  private tokens = new Map<number, SpeechTag>();
  private issuing: SpeechTag | undefined;
  private warned = new Set<string>();
  /** The running nod (its bounce and the timer back to idle), stopped by the celebration and the next question. */
  private nodBounce: Tweens.Tween | undefined;
  private nodTimer: Time.TimerEvent | undefined;

  constructor() {
    super('shadow-match');
  }

  // --- build ----------------------------------------------------------------------------------------

  protected build(): void {
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS['shadow-match'];
    this.unreactTrike?.();
    this.unreactTrike = undefined;
    this.trike = undefined;
    this.question = undefined;
    this.sucking = false;
    this.afterSuck = [];
    this.tokens = new Map();
    this.issuing = undefined;
    this.nodBounce = undefined;
    this.nodTimer = undefined;
    const bg = BACKGROUNDS['shadow-match'].key;
    if (this.textures.exists(bg)) this.add.image(0, 0, bg).setOrigin(0).setScale(1 / this.layout.renderScale);
    else console.warn(`shadow-match: texture "${bg}" is missing — plate skipped`);

    this.router = createTapRouter(this);
    this.attachSkip(this.router);
    this.attachReactions(this.router);
    const scoped = bus.scoped(this);
    scoped.on('speech:ended', ({ token }) => {
      const tag = this.tokens.get(token);
      if (tag === undefined) return;
      this.tokens.delete(token);
      // The name ended, completed or cut: the next question (or the end of the round).
      this.applyAll(this.round?.speechEnded(tag) ?? []);
    });
    scoped.on('speech:line', ({ token, index }) => {
      // The first line of the game's own request arrives before `say` returns its token.
      if (!this.tokens.has(token) && this.issuing !== undefined && index === 0) this.tokens.set(token, this.issuing);
    });

    const round = new ShadowRound(this.geometry(), this.seed, this.level);
    this.round = round;
    const plan = startCommands(round, this.resumeAt);
    for (const w of plan.warnings) console.warn(w);
    if (plan.accepted) this.acceptResume();
    // The triceratops comes in first; then the first item and its shadows fade in and the question begins.
    this.enterTrike(() => this.applyAll(plan.commands));
  }

  protected progress(): ShadowProgress {
    return this.round?.progress() ?? { questionIndex: 0, partial: {} };
  }

  private centre(): Point {
    return { x: this.layout.design.width / 2, y: this.layout.design.height / 2 };
  }

  private anchor(id: string): Point {
    const p = this.layout.anchors[id];
    if (!p) this.warnOnce(`anchor.${id}`, `shadow-match: anchor "${id}" is missing from the layout`);
    return p ?? this.centre();
  }

  private slot(id: string): Point {
    const p = this.layout.slots[id];
    if (!p) this.warnOnce(`slot.${id}`, `shadow-match: slot "${id}" is missing from the layout`);
    return p ?? this.centre();
  }

  /** The slot centres of the level's row (`slot.shadow-<n>-1..n`). */
  private rowSlots(): Point[] {
    const n = levelOf(this.level).shadows;
    return Array.from({ length: n }, (_, k) => this.slot(shadowSlot(n, k + 1)));
  }

  /** Trimmed rect of an atlas frame (render px); undefined when the frame is missing. */
  private frameRect(frame: string): TrimmedRect | undefined {
    const key = ATLASES['shadow-match'].key;
    if (!this.textures.exists(key) || !this.textures.get(key).has(frame)) return undefined;
    const ss = (this.textures.get(key).get(frame).customData as FrameData | undefined)?.spriteSourceSize;
    return ss ? { x: ss.x, y: ss.y, width: ss.w, height: ss.h } : undefined;
  }

  private hasFrame(frame: string): boolean {
    if (this.frameRect(frame)) return true;
    this.warnOnce(frame, `shadow-match: frame "${frame}" is missing`);
    return false;
  }

  private warnOnce(what: string, msg: string): void {
    if (this.warned.has(what)) return;
    this.warned.add(what);
    console.warn(msg);
  }

  /** An item's trimmed size (design px; else the shadow-item size square). */
  private itemSize(item: ItemId): Size {
    const rect = this.frameRect(itemFrames(item).color);
    const px = Tokens.ui.shadowItemPx;
    return rect ? trimmedSize(rect, this.layout.renderScale) : { w: px, h: px };
  }

  private geometry(): ShadowGeometry {
    return {
      slots: this.rowSlots(),
      hand: this.anchor(HAND_ANCHOR),
      shownR: (item) => shownRadius(this.itemSize(item)),
      playRect: defaultPlayRect,
      snapRadius: Tokens.components.dropTarget.snapRadius,
      offDelayMs: Tokens.Timing.dragOffCounterReturnDelayMs,
      callMs: Tokens.Timing.trikeCallMs,
      finishDelayMs: Tokens.Timing.roundCelebrationMs,
    };
  }

  /** A frame drawn with its origin on its trimmed centre at `at` (it scales around it), or undefined with one warning. */
  private centredImage(frame: string, at: Point, scale: number): GameObjects.Image | undefined {
    const rect = this.frameRect(frame);
    if (!rect) {
      this.warnOnce(frame, `shadow-match: frame "${frame}" is missing`);
      return undefined;
    }
    const o = originFor(trimmedCentre(rect, this.layout.renderScale), this.layout.design);
    return this.add.image(at.x, at.y, ATLASES['shadow-match'].key, frame).setOrigin(o.x, o.y).setScale(scale / this.layout.renderScale);
  }

  // --- the triceratops ------------------------------------------------------------------------------------

  /** Fades in (and rises, unless reduced motion) over trikeEnterMs, then starts its sway and calls `done`. */
  private enterTrike(done: () => void): void {
    const pivot = this.anchor(TRIKE_ANCHOR);
    if (!this.hasFrame(trikeFrames.idle)) {
      this.time.delayedCall(Tokens.Timing.trikeEnterMs, done);
      return;
    }
    const o = originFor(pivot, this.layout.design);
    const rise = this.reduced ? 0 : Tokens.ui.trikeRisePx;
    const img = this.add
      .image(pivot.x, pivot.y + rise, ATLASES['shadow-match'].key, trikeFrames.idle)
      .setOrigin(o.x, o.y)
      .setScale(1 / this.layout.renderScale)
      .setDepth(Depth.trike)
      .setAlpha(0);
    this.trike = img;
    this.tweens.add({
      targets: img,
      alpha: 1,
      y: pivot.y,
      duration: Tokens.Timing.trikeEnterMs,
      ease: EASE_OUT,
      onComplete: () => {
        this.addSway(img);
        // Story 5.4: a tap on the triceratops bounces it, except while it nods or celebrates.
        this.unreactTrike?.();
        this.unreactTrike = this.react({ image: img, base: 1 / this.layout.renderScale, enabled: () => !(this.nodBounce?.isPlaying() ?? false) && !this.holding(HOLD_CELEBRATE) });
        done();
      },
    });
  }

  /** The ambient sway ± ui.trikeSwayDeg around the ground pivot (none under reduced motion). */
  private addSway(img: GameObjects.Image): void {
    if (this.reduced) return;
    const deg = Tokens.ui.trikeSwayDeg;
    img.setAngle(-deg);
    this.addAmbient(this.tweens.add({ targets: img, angle: deg, duration: Tokens.Timing.trikeSwayMs, ease: SINE, yoyo: true, repeat: -1 }));
  }

  private setTrikeFrame(frame: string): void {
    if (this.trike && this.hasFrame(frame)) this.trike.setFrame(frame, false, false);
  }

  /** A bounce of the triceratops through `scales` (amplitudes reduced under reduced motion), `repeat` times over `durationMs`. */
  private bounceTrike(scales: readonly number[], repeat: number, durationMs: number, onStep?: (step: number) => void): Tweens.Tween | undefined {
    const img = this.trike;
    if (!img) return undefined;
    const s = scales.map((k) => amplitude(k, this.reduced));
    const base = 1 / this.layout.renderScale;
    const steps = s.length - 1;
    return this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: durationMs,
      onUpdate: (t) => {
        const cycle = (t.getValue() ?? 0) * repeat;
        const local = cycle % 1;
        const k = Math.min(steps - 1, Math.floor(local * steps));
        const f = local * steps - k;
        onStep?.(Math.floor(cycle));
        img.setScale(base * (s[k]! + (s[k + 1]! - s[k]!) * Math.sin((f * Math.PI) / 2)));
      },
      onComplete: () => img.setScale(base),
    });
  }

  /** The nod frame with a bounce 1 → ui.trikeNodBounceScale → 1, back to idle after trikeNodMs. */
  private nod(): void {
    this.stopNod();
    this.setTrikeFrame(trikeFrames.nod);
    this.nodBounce = this.bounceTrike([1, Tokens.ui.trikeNodBounceScale, 1], 1, Tokens.Timing.trikeNodMs);
    this.nodTimer = this.time.delayedCall(Tokens.Timing.trikeNodMs, () => {
      this.nodTimer = undefined;
      this.setTrikeFrame(trikeFrames.idle);
    });
  }

  /** Stops a running nod: its bounce (scale back to 1) and its pending return to the idle frame. */
  private stopNod(): void {
    this.nodBounce?.stop();
    this.nodBounce = undefined;
    this.nodTimer?.remove(false);
    this.nodTimer = undefined;
    this.trike?.setScale(1 / this.layout.renderScale);
  }

  /** The last question: happy frames, the celebrate bounce and the happy tune. */
  private celebrate(): void {
    this.stopNod();
    this.holdAmbient(HOLD_CELEBRATE, true);
    audio.sfx(SFX.happy);
    const spec = Tokens.components.character.celebrate;
    const frames = trikeFrames.happy.filter((f) => this.hasFrame(f));
    this.bounceTrike(spec.scales, spec.repeat, spec.durationMs, (step) => {
      if (frames.length > 0 && this.trike) this.trike.setFrame(frames[step % frames.length]!, false, false);
    });
  }

  // --- one question ------------------------------------------------------------------------------------------

  /** The shadows on the row's slots (a target each, `pad` = its shown radius) and the held item at the hand. */
  private showQuestion(item: ItemId, shadows: readonly ItemId[], correctSlot: number, fade: boolean): void {
    const slots = this.rowSlots();
    const snapR = Tokens.components.dropTarget.snapRadius;
    const views: ShadowView[] = shadows.map((s, k) => {
      const at = slots[k] ?? this.centre();
      const image = this.centredImage(itemFrames(s).shadow, at, 1)?.setDepth(Depth.shadow);
      const target = createDropTarget({ id: `shadow-${k}`, circle: { x: at.x, y: at.y, r: snapR }, pad: shownRadius(this.itemSize(s)) });
      return { item: s, image, target, hint: { object: image } };
    });
    const q: QuestionView = { shadows: views, correctSlot, held: undefined, revealed: undefined };
    this.question = q;
    q.held = this.addHeld(item);
    if (fade) {
      const objs = [...views.map((v) => v.image), q.held.image].filter((o): o is GameObjects.Image => o !== undefined);
      for (const o of objs) o.setAlpha(0);
      this.tweens.add({ targets: objs, alpha: 1, duration: Tokens.Timing.shadowItemFadeMs });
    }
  }

  /** The held item at the hand: drawn at ui.shadowHeldScale × its shadow size, draggable. */
  private addHeld(item: ItemId): HeldView {
    const spec = Tokens.components.draggableItem;
    const hand = this.anchor(HAND_ANCHOR);
    const size = this.itemSize(item);
    const k = Tokens.ui.shadowHeldScale;
    const lift = spec.liftShadow;
    const shadow = this.add
      .ellipse(hand.x + lift.x, hand.y + lift.y, size.w * k, (size.h * k) / 2, lift.color.value, lift.color.alpha)
      .setDepth(Depth.item)
      .setVisible(false);
    const image = this.centredImage(itemFrames(item).color, hand, k)?.setDepth(Depth.item);
    const view: HeldView = { item, image, shadow, drag: undefined, hitR: heldHitRadius(size), pos: { ...hand }, tween: undefined, returnTimer: undefined };
    if (this.router) {
      view.drag = createDraggable(this.router, {
        circle: { x: hand.x, y: hand.y, r: view.hitR },
        itemRadius: spec.minSize / 2,
        onLift: () => this.lift(view),
        onMove: (p) => this.place(view, p),
        onDrop: (p) => this.settle(view, () => this.round?.drop(p, this.inside(p)) ?? []),
        onCancel: () => this.settle(view, () => this.round?.cancel() ?? []),
        // Story 5.1 tap-then-tap: the tapped item stays lifted with a ring, then flies to the next tap.
        onSelect: () => this.select(view),
        onDeselect: () => this.deselect(),
        fly: (to, done) => this.moveTo(view, to, Tokens.Timing.tapFlyMs, done),
      });
      view.drag.object = image;
    }
    return view;
  }

  /** The slot indices whose target holds `p` (the level-4 snap scale applies). */
  private inside(p: Point): number[] {
    return (this.question?.shadows ?? []).flatMap((s, k) => (s.target.contains(p) ? [k] : []));
  }

  private place(view: HeldView, p: Point): void {
    view.pos = { ...p };
    view.image?.setPosition(p.x, p.y);
    view.drag?.setCircle({ x: p.x, y: p.y, r: view.hitR });
    const spec = Tokens.components.draggableItem.liftShadow;
    view.shadow.setPosition(p.x + spec.x, p.y + spec.y);
  }

  private heldScale(lifted: boolean): number {
    const k = Tokens.ui.shadowHeldScale * (lifted ? Tokens.components.draggableItem.liftScale : 1);
    return k / this.layout.renderScale;
  }

  private lift(view: HeldView): void {
    this.applyAll(this.round?.lift() ?? []);
    view.tween?.stop();
    view.tween = undefined;
    view.image?.setScale(this.heldScale(true)).setDepth(Depth.lifted);
    view.shadow.setVisible(true).setDepth(Depth.lifted);
  }

  /** Story 5.1: a tapped item stays lifted (lift ran on its press) and gets the selection ring. */
  private select(view: HeldView): void {
    this.selection?.destroy();
    this.selection = createSelectionRing(this, view.image, Depth.lifted);
  }

  private deselect(): void {
    this.selection?.destroy();
    this.selection = undefined;
  }

  private settle(view: HeldView, outcome: () => ShadowCommand[]): void {
    view.image?.setScale(this.heldScale(false)).setDepth(Depth.item);
    view.shadow.setVisible(false).setDepth(Depth.item);
    this.applyAll(outcome());
  }

  private moveTo(view: HeldView, to: Point, durationMs: number, onDone?: () => void): void {
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

  /** The hint step: drag the held item onto the correct shadow; the ring and bob go on that shadow. */
  private step(): HintStep {
    const q = this.question;
    return hintStepFor(q?.correctSlot ?? 0, q?.held?.drag, q?.shadows ?? []);
  }

  /** The held item tweens into shadow `slot`: its centre to the slot, scale → true size, alpha → 0. */
  private suckIn(to: Point): void {
    const view = this.question?.held;
    const img = view?.image;
    if (!view || !img) return;
    view.tween?.stop();
    view.returnTimer?.remove();
    view.shadow.setVisible(false);
    img.setDepth(Depth.revealed);
    this.sucking = true;
    const from = { ...view.pos };
    const s0 = img.scale;
    const s1 = 1 / this.layout.renderScale;
    view.tween = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: Tokens.components.dropTarget.snap.durationMs,
      ease: EASE_OUT,
      onUpdate: (t) => {
        const v = t.getValue() ?? 0;
        img.setPosition(from.x + (to.x - from.x) * v, from.y + (to.y - from.y) * v).setScale(s0 + (s1 - s0) * v).setAlpha(1 - v);
      },
      onComplete: () => {
        view.tween = undefined;
        img.setVisible(false);
        this.sucking = false;
        for (const fn of this.afterSuck.splice(0)) fn();
      },
    });
  }

  /** Shadow `slot` cross-fades to the item's colour frame (monotonic alphas, no flash), then `revealed()`. */
  private reveal(slot: number, item: ItemId): void {
    const q = this.question;
    const s = q?.shadows[slot];
    if (!q || !s) return;
    const at = this.rowSlots()[slot] ?? this.centre();
    const colour = this.centredImage(itemFrames(item).color, at, 1)?.setDepth(Depth.revealed).setAlpha(0);
    q.revealed = colour;
    const ms = Tokens.Timing.shadowRevealMs;
    if (colour) this.tweens.add({ targets: colour, alpha: 1, duration: ms });
    if (s.image) this.tweens.add({ targets: s.image, alpha: 0, duration: ms });
    this.time.delayedCall(ms, () => this.applyAll(this.round?.revealed() ?? []));
  }

  /** The revealed item and the decoys fade out and go. */
  private clearQuestion(): void {
    if (this.nodTimer) this.setTrikeFrame(trikeFrames.idle);
    this.stopNod();
    const q = this.question;
    this.question = undefined;
    if (!q) return;
    const objs = [q.revealed, ...q.shadows.map((s) => s.image)].filter((o): o is GameObjects.Image => o !== undefined);
    if (q.held) {
      q.held.tween?.stop();
      q.held.returnTimer?.remove();
      q.held.drag?.destroy();
      q.held.image?.destroy();
      q.held.shadow.destroy();
    }
    this.tweens.add({
      targets: objs,
      alpha: 0,
      duration: Tokens.Timing.sceneFadeMs,
      onComplete: () => {
        for (const o of objs) o.destroy();
      },
    });
  }

  // --- round commands ------------------------------------------------------------------------------------

  private applyAll(cmds: readonly ShadowCommand[]): void {
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

  private apply(c: ShadowCommand): void {
    const held = this.question?.held;
    switch (c.kind) {
      case 'showQuestion':
        this.showQuestion(c.item, c.shadows, c.correctSlot, c.fade);
        return;
      case 'beginQuestion':
        this.hint.beginQuestion({ promptLineId: c.promptLineId, retryLineId: c.retryLineId, step: this.step() });
        return;
      case 'snapSfx':
        audio.sfx(SFX.snap);
        return;
      case 'floatBack':
        if (held) this.moveTo(held, c.to, Tokens.components.draggableItem.return.durationMs);
        return;
      case 'rest':
        // Story 5.1: it stays where it was dropped (the cave wall); settle onto the exact spot.
        if (held) this.moveTo(held, c.at, Tokens.components.dropTarget.snap.durationMs);
        return;
      case 'returnLater':
        if (!held) return;
        held.returnTimer?.remove();
        held.returnTimer = this.time.delayedCall(c.ms, () => {
          held.returnTimer = undefined;
          this.round?.returned();
          this.moveTo(held, c.to, Tokens.components.draggableItem.return.durationMs);
        });
        return;
      case 'cancelReturn':
        held?.returnTimer?.remove();
        if (held) held.returnTimer = undefined;
        return;
      case 'hintWrong':
        this.hint.wrong();
        return;
      case 'questionDone':
        this.hint.questionDone();
        return;
      case 'lockItem':
        held?.drag?.destroy();
        if (held) held.drag = undefined;
        return;
      case 'holdReveal':
        this.holdAmbient(HOLD_REVEAL, c.on);
        return;
      case 'markFinishing':
        this.markFinishing();
        return;
      case 'suckIn': {
        // Story 5.3: reveal, chirp, name and the next item's fade — a tap after the arm delay fast-forwards it.
        const T = Tokens.Timing;
        this.skippable(T.shadowRevealMs + T.trikeCallMs + T.celebrationLineMs + T.shadowItemFadeMs);
        this.suckIn(c.to);
        return;
      }
      case 'reveal':
        // The cross-fade starts once the item is inside the shadow.
        if (this.sucking) this.afterSuck.push(() => this.reveal(c.slot, c.item));
        else this.reveal(c.slot, c.item);
        return;
      case 'trikeNod':
        this.nod();
        return;
      case 'sfx':
        audio.sfx(c.id);
        return;
      case 'say':
        this.time.delayedCall(c.afterMs, () => this.say(c.tag, () => audio.say(c.id)));
        return;
      case 'clearQuestion':
        this.clearQuestion();
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
