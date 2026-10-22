// Hang tìm bóng (Stories 3.5, 3.6; 2026-10-22 no dinosaur, cute restyle): in a soft pastel cave an animal
// or a vehicle waits big on a small pedestal at the bottom centre; the child drags it onto its purple-grey
// shadow on the cave wall. The item is sucked into the shadow, the shadow turns real-coloured, the item
// hops with a sparkle and its name is said. The scene only wires Phaser: the plate `bg.shadow-match`, the
// sprites of `atlas.shadow-match` (shadows and items on their trimmed centres), a DragController for the
// held item, one drop target per shadow (`pad` = that shadow's shown radius, so the level-4 snap scale
// applies to the forgiving margin only) and tweens. Every decision (drop resolution, the hand-over to
// the next question, the round end) is the pure round model (round.ts, questions.ts); prompts and
// retries go through `hint` only; the game speaks only each item's name (`say`). Every position comes
// from LAYOUTS['shadow-match']; timers are scene-clock events and tweens (removed or frozen with the scene).
import type { GameObjects, Time, Tweens } from 'phaser';
import { ATLASES, BACKGROUNDS } from '../../content/assets';
import { PEDESTAL_ANCHOR, PEDESTAL_HIT, SFX, itemFrames, shadowSlot, type ItemId } from '../../content/games/shadow-match';
import type { Point, ScreenLayout } from '../../content/layout-types';
import { LAYOUTS } from '../../content/layouts';
import { audio } from '../../core/audio-director';
import { bus } from '../../core/bus';
import type { HintItem, HintStep } from '../../core/hint-director';
import { createSelectionRing, type SelectionRing } from '../../core/hint-visuals';
import { createDraggable, defaultPlayRect, type Draggable } from '../../core/input/drag-controller';
import { pointInPolygon } from '../../core/input/polygon';
import { createDropTarget, type DropTarget } from '../../core/input/drop';
import { createTapRouter, type TapRouter } from '../../core/input/tap-router';
import { amplitude, prefersReducedMotion } from '../../core/reduced-motion';
import { Tokens } from '../../core/tokens';
import { bounce, stopMotion } from '../../core/ui/scale-motion';
import { sparkle } from '../../core/ui/sparkle';
import { originFor, trimmedCentre, trimmedSize, type TrimmedRect } from '../../core/ui/sprite-pivot';
import { MiniGameBase } from '../mini-game-base';
import { heldHitRadius, shownRadius, type Size } from './geometry';
import { levelOf } from './questions';
import { ShadowRound, hintStepFor, startCommands, type ShadowCommand, type ShadowGeometry, type ShadowProgress, type SpeechTag } from './round';

const EASE_OUT = 'Quad.easeOut';

/** Draw order: shadows, the revealed item, its sparkle, the held item, the lifted item. */
const LAYERS = ['shadow', 'revealed', 'sparkle', 'item', 'lifted'] as const;
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

/** The item on the pedestal. */
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
  /** True between a lift and its settle. */
  lifted: boolean;
  /** Story 5.4: removes the pedestal's tap reaction for this item. */
  unreact: () => void;
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
  private question: QuestionView | undefined;
  /** The reveal waits for the suck-in tween. */
  private sucking = false;
  private afterSuck: (() => void)[] = [];
  /** Voice tokens of the game's own utterances, by tag (only the latest per tag). */
  private tokens = new Map<number, SpeechTag>();
  private issuing: SpeechTag | undefined;
  private warned = new Set<string>();
  /** The revealed item's running hop, stopped by the celebration and the next question. */
  private hop: Tweens.Tween | undefined;

  constructor() {
    super('shadow-match');
  }

  // --- build ----------------------------------------------------------------------------------------

  protected build(): void {
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS['shadow-match'];
    this.question = undefined;
    this.sucking = false;
    this.afterSuck = [];
    this.tokens = new Map();
    this.issuing = undefined;
    this.hop = undefined;
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
    // The first item and its shadows fade in and the question begins.
    this.applyAll(plan.commands);
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

  /** Where `item` waits: centred over `anchor.pedestal-top`, its bottom on the pedestal top (it scales with ui.shadowHeldScale). */
  private restFor(item: ItemId): Point {
    const top = this.anchor(PEDESTAL_ANCHOR);
    return { x: top.x, y: top.y - (this.itemSize(item).h * Tokens.ui.shadowHeldScale) / 2 };
  }

  private geometry(): ShadowGeometry {
    return {
      slots: this.rowSlots(),
      rest: (item) => this.restFor(item),
      shownR: (item) => shownRadius(this.itemSize(item)),
      playRect: defaultPlayRect,
      snapRadius: Tokens.components.dropTarget.snapRadius,
      offDelayMs: Tokens.Timing.dragOffCounterReturnDelayMs,
      nameDelayMs: Tokens.Timing.shadowNameDelayMs,
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

  // --- the revealed item's joy (2026-10-22: replaces the triceratops' nod and chirp) -------------------------

  /** A bounce of `img` (around `base` scale) through `scales` (amplitudes reduced under reduced motion), `repeat` times over `durationMs`. */
  private bounceImage(img: GameObjects.Image, base: number, scales: readonly number[], repeat: number, durationMs: number): Tweens.Tween {
    const s = scales.map((k) => amplitude(k, this.reduced));
    const steps = s.length - 1;
    return this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: durationMs,
      onUpdate: (t) => {
        const local = ((t.getValue() ?? 0) * repeat) % 1;
        const k = Math.min(steps - 1, Math.floor(local * steps));
        const f = local * steps - k;
        img.setScale(base * (s[k]! + (s[k + 1]! - s[k]!) * Math.sin((f * Math.PI) / 2)));
      },
      onComplete: () => img.setScale(base),
    });
  }

  /** A sparkle burst around the revealed item on slot `slot`. */
  private sparkleAt(slot: number, item: ItemId): void {
    const at = this.rowSlots()[slot] ?? this.centre();
    sparkle(this, at, { radius: shownRadius(this.itemSize(item)) + Tokens.ui.shadowSparkleReachPx, durationMs: Tokens.Timing.shadowHappyMs, depth: Depth.sparkle, reduced: this.reduced });
  }

  /**
   * The revealed item on slot `slot` hops up ui.shadowHappyHopPx and back (no hop under reduced motion)
   * while it bounces 1 → ui.shadowHappyBounceScale → 1, with a sparkle burst.
   */
  private happy(slot: number): void {
    const q = this.question;
    const item = q?.shadows[slot]?.item;
    this.stopHop();
    if (item !== undefined) this.sparkleAt(slot, item);
    const img = q?.revealed;
    if (!img) return;
    const at = this.rowSlots()[slot] ?? this.centre();
    bounce(this, img, 1 / this.layout.renderScale, amplitude(Tokens.ui.shadowHappyBounceScale, this.reduced), Tokens.Timing.shadowHappyMs);
    if (this.reduced) return;
    this.hop = this.tweens.add({
      targets: img,
      y: at.y - Tokens.ui.shadowHappyHopPx,
      duration: Tokens.Timing.shadowHappyMs / 2,
      ease: 'Sine.easeOut',
      yoyo: true,
      onComplete: () => img.setY(at.y),
    });
  }

  /** Stops a running hop: the revealed item back on its slot at its true size. */
  private stopHop(): void {
    this.hop?.stop();
    this.hop = undefined;
    const q = this.question;
    const img = q?.revealed;
    if (!q || !img) return;
    stopMotion(img, 1 / this.layout.renderScale);
    img.setY((this.rowSlots()[q.correctSlot] ?? this.centre()).y);
  }

  /** The last question: the revealed item's celebrate bounce with a sparkle, and the happy tune. */
  private celebrate(): void {
    this.stopHop();
    audio.sfx(SFX.happy);
    const q = this.question;
    if (!q) return;
    const item = q.shadows[q.correctSlot]?.item;
    if (item !== undefined) this.sparkleAt(q.correctSlot, item);
    if (!q.revealed) return;
    const spec = Tokens.components.character.celebrate;
    this.bounceImage(q.revealed, 1 / this.layout.renderScale, spec.scales, spec.repeat, spec.durationMs);
  }

  // --- one question ------------------------------------------------------------------------------------------

  /** The shadows on the row's slots (a target each, `pad` = its shown radius) and the held item on the pedestal. */
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

  /** The held item on the pedestal: drawn at ui.shadowHeldScale × its shadow size, draggable. */
  private addHeld(item: ItemId): HeldView {
    const spec = Tokens.components.draggableItem;
    const hand = this.restFor(item);
    const size = this.itemSize(item);
    const k = Tokens.ui.shadowHeldScale;
    const lift = spec.liftShadow;
    const shadow = this.add
      .ellipse(hand.x + lift.x, hand.y + lift.y, size.w * k, (size.h * k) / 2, lift.color.value, lift.color.alpha)
      .setDepth(Depth.item)
      .setVisible(false);
    const image = this.centredImage(itemFrames(item).color, hand, k)?.setDepth(Depth.item);
    const view: HeldView = { item, image, shadow, drag: undefined, hitR: heldHitRadius(size), pos: { ...hand }, tween: undefined, returnTimer: undefined, lifted: false, unreact: () => undefined };
    // Story 5.4: a tap on the pedestal bounces the item waiting on it (with the reaction's "pụp").
    const pedestal = this.layout.hits[PEDESTAL_HIT];
    if (image && pedestal) {
      view.unreact = this.react({
        image,
        area: { contains: (p) => pointInPolygon(p, pedestal) },
        base: k / this.layout.renderScale,
        enabled: () => view.drag !== undefined && !view.lifted && view.tween === undefined && view.pos.x === hand.x && view.pos.y === hand.y,
      });
    }
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
    view.lifted = true;
    // A running pedestal-tap bounce (Story 5.4) stops first, so it never overrides the lift scale.
    if (view.image) stopMotion(view.image, this.heldScale(false));
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
    view.lifted = false;
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
    this.stopHop();
    const q = this.question;
    this.question = undefined;
    if (!q) return;
    const objs = [q.revealed, ...q.shadows.map((s) => s.image)].filter((o): o is GameObjects.Image => o !== undefined);
    if (q.held) {
      q.held.tween?.stop();
      q.held.returnTimer?.remove();
      q.held.drag?.destroy();
      q.held.unreact();
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
      case 'markFinishing':
        this.markFinishing();
        return;
      case 'suckIn': {
        // Story 5.3: reveal, hop, name and the next item's fade — a tap after the arm delay fast-forwards it.
        const T = Tokens.Timing;
        this.skippable(T.shadowRevealMs + T.shadowNameDelayMs + T.celebrationLineMs + T.shadowItemFadeMs);
        this.suckIn(c.to);
        return;
      }
      case 'reveal':
        // The cross-fade starts once the item is inside the shadow.
        if (this.sucking) this.afterSuck.push(() => this.reveal(c.slot, c.item));
        else this.reveal(c.slot, c.item);
        return;
      case 'itemHappy':
        this.happy(c.slot);
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
