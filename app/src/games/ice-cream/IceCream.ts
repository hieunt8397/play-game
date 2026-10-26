// Tiệm kem (Stories 1.8, 1.10): drag the scoops Shiba asks for onto the cone (1–3, in order at the
// top level; a round of 3–5 questions ends with round:complete). The scene only wires Phaser:
// the plate `bg.ice-cream`, the full-frame sprites of `atlas.ice-cream` (Shiba on its ground pivot,
// scoops on their trimmed centres), DragControllers for the scoops and tweens. Every decision (drop
// resolution, outcomes, questions) is the pure round model (round.ts, questions.ts); prompts and
// retries go through `hint` only; audio here is SFX only. Every position comes from
// LAYOUTS['ice-cream']; timers are scene-clock events (removed on Home by MiniGameBase).
// Story 2.5: a resumed start (MiniGameBase `resumeAt`) begins the question it was left on; its served
// scoops stand on the cone at once (restoreCone: no tween, no sfx, locked) with fresh copies at home.
// Story 5.8: the sample game of the reaction picker — `celebrate` and `choseOther` play the reaction
// MiniGameBase `pickReaction` draws from content REACTIONS.
// Story 6.1: a correct serve plays lick (the happy frames), shiver or sneeze ("Hắt… xì!"); a sneeze may
// leave ice cream on Shiba's nose (games/ice-cream/reactions › noseCreamAfter, the reaction rng): the
// idle frame is then `shiba/nose/00` and a tap inside hit.shiba-nose wipes it (happy frames + SFX).
// A different flavour: Shiba tastes it (a lick frame), grimaces, then the scoop floats back and only then
// `hint.wrong()` (the retry line). Never a wrong sound. Free play (onFreePlay → round.beginFreePlay):
// round commands pass the `inert` gate while `freePlay`; any scoop stacks on the cone, and the full tower
// wobbles (Timing.iceCreamTowerWobbleMs) and falls onto the table row (reduced motion: no wobble, a fade).
// 2026-10-21: every resting scoop lies on the table row (round.ts `row()`, from hit.counter-top and the
// home slots' y, from the leftmost to the rightmost home); a rest dropped above it falls onto it with a
// small bounce, one dropped below it (the pink front) slides up onto it (restOnRow).
// Story 8.2: Shiba wears the outfit chosen in the wardrobe (core/outfit-layers: the overlay frames of atlas.ice-cream follow
// every Shiba frame, its breath, bounce and shiver shake); every Shiba frame change goes through setShibaFrame.
// Missing frames or the nose hit warn once and fall back to the happy / idle frames with no nose cream.
import type { GameObjects, Time, Tweens } from 'phaser';
import { ATLASES, BACKGROUNDS } from '../../content/assets';
import {
  CONE_ANCHOR,
  CONE_SLOTS,
  FLAVOURS,
  HITS,
  HOME_SLOTS,
  SCOOP_RENDER_SLOT,
  SFX,
  SHIBA_ANCHOR,
  SHIBA_FRAMES,
  REACTIONS,
  scoopFrame,
  type FlavourId,
} from '../../content/games/ice-cream';
import type { Point, ScreenLayout } from '../../content/layout-types';
import { LAYOUTS } from '../../content/layouts';
import { audio } from '../../core/audio-director';
import type { HintStep } from '../../core/hint-director';
import { createSelectionRing, type SelectionRing } from '../../core/hint-visuals';
import { createDraggable, defaultPlayRect, type Draggable } from '../../core/input/drag-controller';
import { createDropTarget, type DropTarget } from '../../core/input/drop';
import { inputGuard } from '../../core/input/guard';
import { pointInPolygon } from '../../core/input/polygon';
import { createTapTarget } from '../../core/input/tap-target';
import { createTapRouter, type TapRouter } from '../../core/input/tap-router';
import { DEG_TO_RAD } from '../../core/motion';
import { amplitude, prefersReducedMotion } from '../../core/reduced-motion';
import type { ReactionSet } from '../../core/reactions';
import { Tokens } from '../../core/tokens';
import { originFor, trimmedCentre, trimmedSize, type TrimmedRect } from '../../core/ui/sprite-pivot';
import { attachOutfit, type LayerImage, type OutfitLayers } from '../../core/outfit-layers';
import { ProgressStore } from '../../core/progress-store';
import { MiniGameBase } from '../mini-game-base';
import { deferredHintWrong, isChoseOtherReaction, isCorrectReaction, noseCreamAfter, pairHintWrong, stepKey, type Taste } from './reactions';
import {
  IceCreamRound,
  startCommands,
  tableRowFrom,
  type Area,
  type IceCreamProgress,
  type RoundCommand,
  type RoundGeometry,
  type ScoopState,
  type ToppledScoop,
} from './round';

const EASE_OUT = 'Quad.easeOut';
const SINE = 'Sine.easeInOut';
/** Story 5.1: everything here is drawn at depth 0 (a lift brings the scoop to the top); the selection ring sits just above. */
const LIFTED_DEPTH = 1;
/** Ambient hold reason (MiniGameBase) while Shiba celebrates. */
const HOLD_CELEBRATE = 'celebrate';

interface FrameData {
  readonly spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

interface ScoopView {
  readonly id: string;
  readonly flavour: FlavourId;
  readonly image: GameObjects.Image | undefined;
  readonly shadow: GameObjects.Ellipse;
  /** Undefined once the scoop sits on the cone. */
  drag: Draggable | undefined;
  /** Hit radius and the drawn half size. */
  readonly radius: number;
  readonly half: number;
  /** The scoop is drawn here (its trimmed centre). */
  pos: Point;
  tween: Tweens.Tween | undefined;
  /** Story 5.1: the running move's onDone, run when another move replaces it. */
  tweenDone?: (() => void) | undefined;
  returnTimer: Time.TimerEvent | undefined;
  /** Story 6.1: lifts so far (a tasted scoop the child grabbed again does not float back). */
  lifts: number;
}

const NO_AREA: Area = { contains: () => false };

export class IceCream extends MiniGameBase<'ice-cream'> {
  private round: IceCreamRound | undefined;
  private router: TapRouter | undefined;
  private scoops = new Map<string, ScoopView>();
  private coneScoops: ScoopView[] = [];
  private shiba: GameObjects.Image | undefined;
  /** Story 8.2: Shiba's outfit layers (ProgressStore outfit). */
  private outfit: OutfitLayers | undefined;
  private breath: Tweens.Tween | undefined;
  private cone: DropTarget | undefined;
  /** Story 5.1: the ring around the tap-selected scoop. */
  private selection: SelectionRing | undefined;
  private layout: ScreenLayout = LAYOUTS['ice-cream'];
  /** Missing frames already reported (one warning each). */
  private warned = new Set<string>();
  /** Story 6.1: Shiba's ground x (the shiver shakes around it). */
  private shibaX = 0;
  /** Story 6.1: the running Shiba reaction (a new one stops it). */
  private shibaAnim: Tweens.Tween | undefined;
  /** Story 6.1: ice cream is on Shiba's nose (idle frame shiba/nose/00; a nose tap wipes it). */
  private noseCream = false;
  /** Story 6.1: the layout has hit.shiba-nose and the atlas shiba/nose/00 (else no nose-cream state). */
  private hasNose = false;
  /** Story 6.1: chose-other reactions waiting to float their scoop back (newest last). */
  private tastes: Taste[] = [];

  constructor() {
    super('ice-cream');
  }

  // --- build ----------------------------------------------------------------------------------------

  protected build(): void {
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS['ice-cream'];
    this.scoops = new Map();
    this.coneScoops = [];
    const scale = 1 / this.layout.renderScale;

    const bg = BACKGROUNDS['ice-cream'].key;
    if (this.textures.exists(bg)) this.add.image(0, 0, bg).setOrigin(0).setScale(scale);
    else console.warn(`ice-cream: texture "${bg}" is missing — plate skipped`);

    this.addShiba();
    this.router = createTapRouter(this);
    this.attachSkip(this.router);
    // Story 5.4: a tap on Shiba (not a target: scoops go to the cone) bounces it, except while it celebrates.
    this.attachReactions(this.router);
    if (this.shiba) this.react({ image: this.shiba, area: this.area(HITS.shiba), base: 1 / this.layout.renderScale, enabled: () => !this.holding(HOLD_CELEBRATE) });
    // Story 6.1: a real target over the nose, live only while cream is on it (else the tap bounces Shiba).
    this.noseCream = false;
    this.tastes = [];
    this.shibaAnim = undefined;
    const nose = this.area(HITS.shibaNose);
    this.hasNose = this.shiba !== undefined && nose !== NO_AREA && this.framesOk([SHIBA_FRAMES.nose]);
    if (this.hasNose) createTapTarget(this.router, { area: { contains: (p) => this.noseCream && nose.contains(p) }, onPress: () => this.wipeNose() });
    const coneAt = this.slot(CONE_SLOTS[0]);
    this.cone = createDropTarget({ id: CONE_ANCHOR, circle: { x: coneAt.x, y: coneAt.y, r: Tokens.components.dropTarget.snapRadius } });

    const round = new IceCreamRound(this.geometry(), this.seed, this.level);
    this.round = round;
    // Story 2.5: a resumed start begins the question it was left on, with its served scoops on the cone.
    const plan = startCommands(round, this.resumeAt);
    for (const w of plan.warnings) console.warn(w);
    if (plan.accepted) this.acceptResume();
    this.applyAll(plan.commands);
  }

  protected progress(): IceCreamProgress {
    return this.round?.progress() ?? { questionIndex: 0, partial: { placed: [] } };
  }

  private slot(id: string): Point {
    const p = this.layout.slots[id];
    if (!p) console.warn(`ice-cream: slot "${id}" is missing from the layout`);
    return p ?? { x: this.layout.design.width / 2, y: this.layout.design.height / 2 };
  }

  private area(id: string): Area {
    const poly = this.layout.hits[id];
    if (!poly) {
      console.warn(`ice-cream: hit "${id}" is missing from the layout`);
      return NO_AREA;
    }
    return { contains: (p) => pointInPolygon(p, poly) };
  }

  /** Trimmed rect of an atlas frame (render px); undefined when the frame is missing. */
  private frameRect(frame: string): TrimmedRect | undefined {
    const key = ATLASES['ice-cream'].key;
    if (!this.textures.exists(key) || !this.textures.get(key).has(frame)) return undefined;
    const ss = (this.textures.get(key).get(frame).customData as FrameData | undefined)?.spriteSourceSize;
    return ss ? { x: ss.x, y: ss.y, width: ss.w, height: ss.h } : undefined;
  }

  /** Scoop frames are rendered at slot.scoop-2: a scoop at home slot `id` is drawn this far from it. */
  private scoopOffset(flavour: FlavourId): Point {
    const rect = this.frameRect(scoopFrame(flavour));
    const ref = this.slot(SCOOP_RENDER_SLOT);
    if (!rect) return { x: 0, y: 0 };
    const c = trimmedCentre(rect, this.layout.renderScale);
    return { x: c.x - ref.x, y: c.y - ref.y };
  }

  private geometry(): RoundGeometry {
    // The offset is the same for every flavour up to a few px; the average keeps homes on one line.
    const ref = this.scoopOffset('vanilla');
    const homeCentre = (slot: string): Point => {
      const p = this.slot(slot);
      return { x: p.x + ref.x, y: p.y + ref.y };
    };
    // 2026-10-21: the table row spans the four homes (a scoop past them would hang over the counter
    // top's slanted ends), kept inside the live play rect.
    const homes = HOME_SLOTS[FLAVOURS.length]!.map(homeCentre);
    return {
      homeCentre,
      coneCentre: (n) => this.slot(CONE_SLOTS[Math.min(n, CONE_SLOTS.length - 1)]!),
      cone: { contains: (p) => this.cone?.contains(p) ?? false },
      shiba: this.area(HITS.shiba),
      counterUpper: this.area(HITS.counterUpper),
      counter: this.area(HITS.counter),
      row: () => tableRowFrom(homes, defaultPlayRect()),
      playRect: defaultPlayRect,
      snapRadius: Tokens.components.dropTarget.snapRadius,
      minSize: Tokens.components.draggableItem.minSize,
      offCounterDelayMs: Tokens.Timing.dragOffCounterReturnDelayMs,
      nextQuestionDelayMs: Tokens.Timing.correctMusicMaxMs,
      finishDelayMs: Tokens.Timing.roundCelebrationMs,
      towerMax: Tokens.ui.iceCreamTowerMax,
    };
  }

  // --- Shiba ----------------------------------------------------------------------------------------

  private addShiba(): void {
    this.outfit = undefined;
    const key = ATLASES['ice-cream'].key;
    const anchor = this.layout.anchors[SHIBA_ANCHOR];
    if (!anchor || !this.frameRect(SHIBA_FRAMES.idle)) {
      console.warn(`ice-cream: Shiba (frame "${SHIBA_FRAMES.idle}" or anchor "${SHIBA_ANCHOR}") is missing`);
      return;
    }
    const o = originFor(anchor, this.layout.design);
    this.shibaX = anchor.x;
    this.shiba = this.add.image(anchor.x, anchor.y, key, SHIBA_FRAMES.idle).setOrigin(o.x, o.y).setScale(1 / this.layout.renderScale);
    this.outfit = attachOutfit(this, this.shiba as unknown as LayerImage, key, ProgressStore.outfit);
    this.breathe();
  }

  /** Story 8.2: Shiba's frame (its origin kept) and, at once, every worn item's overlay frame. */
  private setShibaFrame(frame: string): void {
    if (this.outfit) this.outfit.setFrame(frame);
    else this.shiba?.setFrame(frame, false, false);
  }

  /** Breathing: scaleY 1 ↔ shibaBreathScale around the ground pivot, yoyo. */
  private breathe(): void {
    const img = this.shiba;
    if (!img) return;
    const base = 1 / this.layout.renderScale;
    img.setScale(base);
    this.breath?.stop();
    // Ambient (Story 1.9): the base pauses it while the hint ring shows or Shiba celebrates.
    this.breath = this.addAmbient(
      this.tweens.add({
        targets: img,
        scaleY: base * amplitude(Tokens.ui.shibaBreathScale, this.reduced),
        duration: Tokens.Timing.shibaBreathMs / 2,
        ease: SINE,
        yoyo: true,
        repeat: -1,
      }),
    );
  }

  /** Story 5.8 (FR30/FR31): the reaction ids the picker draws from (content/games/ice-cream › REACTIONS). */
  protected override reactionSet(): ReactionSet {
    return REACTIONS;
  }

  /** Story 6.1: a scoop served right (or stacked in free play) — the picked "correct" reaction; any nose cream is wiped. */
  private playCorrect(): void {
    const id = this.pickReaction('correct');
    this.noseCream = false;
    if (!isCorrectReaction(id)) {
      this.celebrate();
      return;
    }
    switch (id) {
      case 'lick':
        this.celebrate();
        return;
      case 'shiver':
        this.shiver();
        return;
      case 'sneeze':
        this.sneeze(noseCreamAfter(id, { hasNose: this.hasNose, chance: Tokens.ui.iceCreamNoseCreamChance, roll: () => this.reactionRoll() }));
        return;
      default: {
        const unknown: never = id;
        console.warn(`ice-cream: no routine for reaction "${String(unknown)}"`);
      }
    }
  }

  /**
   * Story 6.1: a different flavour — the picked "chose-other" reaction (never a wrong sound): Shiba tastes
   * and grimaces, then the scoop floats back to `to` and only then the paired `hintWrong` runs.
   */
  private playChoseOther(id: string, to: Point): void {
    const v = this.scoops.get(id);
    const pick = this.pickReaction('choseOther');
    let waitMs = 0;
    if (isChoseOtherReaction(pick)) {
      switch (pick) {
        case 'taste-grimace':
          waitMs = this.tasteGrimace();
          break;
        default: {
          const unknown: never = pick;
          console.warn(`ice-cream: no routine for reaction "${String(unknown)}"`);
        }
      }
    }
    const taste: Taste = { wrong: false, key: stepKey(this.progress()) };
    this.tastes.push(taste);
    const lifts = v?.lifts ?? 0;
    this.time.delayedCall(waitMs, () => {
      this.tastes = this.tastes.filter((t) => t !== taste);
      // A scoop the child grabbed again meanwhile stays with the finger.
      if (v && this.scoops.get(id) === v && v.lifts === lifts) this.moveTo(v, to, Tokens.components.draggableItem.return.durationMs);
      // The reminder only for the step it belongs to (a correct serve meanwhile makes it stale).
      if (deferredHintWrong(taste, stepKey(this.progress()), this.inert)) this.hint.wrong();
    });
  }

  /** Story 6.1: true when every frame is in the atlas; a missing one is reported once. */
  private framesOk(frames: readonly string[]): boolean {
    let ok = true;
    for (const f of frames) {
      if (this.frameRect(f) !== undefined) continue;
      ok = false;
      if (this.warned.has(f)) continue;
      this.warned.add(f);
      console.warn(`ice-cream: frame "${f}" is missing — Shiba plays the happy / idle frames instead`);
    }
    return ok;
  }

  /** Story 6.1: Shiba's resting frame: the nose-cream one while cream is on the nose. */
  private idleFrame(): string {
    return this.noseCream && this.hasNose ? SHIBA_FRAMES.nose : SHIBA_FRAMES.idle;
  }

  /**
   * Story 6.1: runs one Shiba reaction over `durationMs` (a running one stops first): breathing pauses,
   * `onUpdate(v, img)` draws progress v ∈ [0, 1]; then `onDone`, the resting frame, its ground x and scale.
   */
  private animateShiba(durationMs: number, onUpdate: (v: number, img: GameObjects.Image) => void, onDone?: () => void): void {
    const img = this.shiba;
    if (!img) {
      onDone?.();
      return;
    }
    const base = 1 / this.layout.renderScale;
    this.shibaAnim?.stop();
    img.setPosition(this.shibaX, img.y).setScale(base);
    this.holdAmbient(HOLD_CELEBRATE, true);
    const anim = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: durationMs,
      onUpdate: (t) => onUpdate(t.getValue() ?? 0, img),
      onComplete: () => {
        if (this.shibaAnim === anim) this.shibaAnim = undefined;
        onDone?.();
        this.setShibaFrame(this.idleFrame());
        img.setPosition(this.shibaX, img.y).setScale(base);
        this.holdAmbient(HOLD_CELEBRATE, false);
        this.breathe();
      },
    });
    this.shibaAnim = anim;
  }

  /** Happy frames (wag + lick) and bounces through character.celebrate.scales; breathing pauses. */
  private celebrate(): void {
    audio.sfx(SFX.happy);
    const spec = Tokens.components.character.celebrate;
    const scales = spec.scales.map((s) => amplitude(s, this.reduced));
    const frames = SHIBA_FRAMES.happy.filter((f) => this.frameRect(f) !== undefined);
    const base = 1 / this.layout.renderScale;
    const steps = scales.length - 1;
    this.animateShiba(spec.durationMs, (v, img) => {
      // `repeat` bounces through the scale keys over the whole duration.
      const cycle = (v * spec.repeat) % 1;
      const k = Math.min(steps - 1, Math.floor(cycle * steps));
      const local = cycle * steps - k;
      const s = scales[k]! + (scales[k + 1]! - scales[k]!) * Math.sin((local * Math.PI) / 2);
      img.setScale(base * s);
      if (frames.length > 0) this.setShibaFrame(frames[Math.floor(v * frames.length * spec.repeat) % frames.length]!);
    });
  }

  /** Story 6.1: brr — the two shiver frames alternate while Shiba shakes sideways (no shake under reduced motion). */
  private shiver(): void {
    const frames = SHIBA_FRAMES.shiver;
    if (!this.framesOk(frames)) {
      this.celebrate();
      return;
    }
    audio.sfx(SFX.happy);
    const ms = Tokens.Timing.iceCreamShiverMs;
    const frameMs = Tokens.Timing.iceCreamShiverFrameMs;
    const dx = this.reduced ? 0 : Tokens.ui.iceCreamShiverPx;
    this.animateShiba(ms, (v, img) => {
      const k = Math.floor((v * ms) / frameMs);
      this.setShibaFrame(frames[k % frames.length]!);
      img.setPosition(this.shibaX + (k % 2 === 0 ? dx : -dx), img.y);
    });
  }

  /**
   * Story 6.1: the sneeze — wind-up, eyes shut, then the burst (held for two frame times) with
   * "Hắt… xì!"; `cream`: ice cream stays on the nose afterwards.
   */
  private sneeze(cream: boolean): void {
    const frames = SHIBA_FRAMES.sneeze;
    if (!this.framesOk(frames)) {
      this.celebrate();
      return;
    }
    const slots = frames.length + 1;
    let said = false;
    this.animateShiba(
      Tokens.Timing.iceCreamSneezeFrameMs * slots,
      (v) => {
        const k = Math.min(frames.length - 1, Math.floor(v * slots));
        this.setShibaFrame(frames[k]!);
        if (k === frames.length - 1 && !said) {
          said = true;
          // A creature SFX (its own channel): it never cuts a prompt or retry line.
          audio.sfx(SFX.sneeze);
        }
      },
      () => {
        this.noseCream = cream && this.hasNose;
      },
    );
  }

  /** Story 6.1: a taste of the other flavour (a lick frame), then the grimace; returns how long it runs (0: frames missing). */
  private tasteGrimace(): number {
    const lick = SHIBA_FRAMES.happy[1];
    if (!this.shiba || !this.framesOk([lick, SHIBA_FRAMES.grimace])) return 0;
    const tasteMs = Tokens.Timing.iceCreamTasteMs;
    const ms = tasteMs + Tokens.Timing.iceCreamGrimaceMs;
    this.animateShiba(ms, (v) => this.setShibaFrame(v * ms < tasteMs ? lick : SHIBA_FRAMES.grimace));
    return ms;
  }

  /** Story 6.1: a tap on the creamy nose wipes it: happy frames + SFX, then the plain idle frame. */
  private wipeNose(): void {
    if (!this.noseCream) return;
    this.noseCream = false;
    this.celebrate();
  }

  // --- scoops ---------------------------------------------------------------------------------------

  private addScoop(s: ScoopState, popIn: boolean): ScoopView {
    const key = ATLASES['ice-cream'].key;
    const frame = scoopFrame(s.flavour);
    const rect = this.frameRect(frame);
    const rs = this.layout.renderScale;
    const item = Tokens.components.draggableItem;
    const size = rect ? trimmedSize(rect, rs) : { w: item.minSize, h: item.minSize };
    const half = Math.max(size.w, size.h) / 2;
    const shadowSpec = item.liftShadow;
    const shadow = this.add
      .ellipse(s.at.x + shadowSpec.x, s.at.y + shadowSpec.y, size.w, size.h / 2, shadowSpec.color.value, shadowSpec.color.alpha)
      .setVisible(false);
    let image: GameObjects.Image | undefined;
    if (rect) {
      const o = originFor(trimmedCentre(rect, rs), this.layout.design);
      image = this.add.image(s.at.x, s.at.y, key, frame).setOrigin(o.x, o.y).setScale(1 / rs);
    } else if (!this.warned.has(frame)) {
      this.warned.add(frame);
      console.warn(`ice-cream: frame "${frame}" is missing — scoop drawn without an image`);
    }
    const view: ScoopView = {
      id: s.id,
      flavour: s.flavour,
      image,
      shadow,
      drag: undefined,
      radius: half + item.hitPad,
      half,
      pos: { ...s.at },
      tween: undefined,
      returnTimer: undefined,
      lifts: 0,
    };
    if (this.router) {
      view.drag = createDraggable(this.router, {
        circle: { x: s.at.x, y: s.at.y, r: view.radius },
        // The finger keeps the scoop's core (minSize/2) inside the play area, so the lower counter stays reachable.
        itemRadius: item.minSize / 2,
        onLift: () => this.lift(view),
        onMove: (p) => this.place(view, p),
        onDrop: (p) => this.settle(view, () => this.round?.drop(view.id, p) ?? []),
        onCancel: () => this.settle(view, () => this.round?.cancel(view.id) ?? []),
        // Story 5.1 tap-then-tap: the tapped scoop stays lifted with a ring, then flies to the next tap.
        onSelect: () => this.select(view),
        onDeselect: () => this.deselect(),
        fly: (to, done) => this.moveTo(view, to, Tokens.Timing.tapFlyMs, done),
      });
      view.drag.object = image;
    }
    if (popIn && image) {
      image.setScale(0);
      this.tweens.add({ targets: image, scale: 1 / rs, duration: item.return.durationMs, ease: 'Back.easeOut' });
    }
    this.scoops.set(s.id, view);
    return view;
  }

  /** Draws the scoop at `p`; its hit circle follows (a scoop is lifted where it is seen). */
  private place(view: ScoopView, p: Point): void {
    view.pos = { ...p };
    view.image?.setPosition(p.x, p.y);
    view.drag?.setCircle({ x: p.x, y: p.y, r: view.radius });
    const spec = Tokens.components.draggableItem.liftShadow;
    view.shadow.setPosition(p.x + spec.x, p.y + spec.y);
  }

  /** Lift: 1.1× and a shadow in the same pointerdown handler; any running motion stops. */
  private lift(view: ScoopView): void {
    view.lifts += 1;
    this.applyAll(this.round?.lift(view.id) ?? []);
    view.tween?.stop();
    view.tween = undefined;
    // A falling scoop picked up: its pending bounce must not run on the next move.
    view.tweenDone = undefined;
    const rs = this.layout.renderScale;
    view.image?.setScale(Tokens.components.draggableItem.liftScale / rs);
    view.shadow.setVisible(true);
    this.children.bringToTop(view.shadow);
    if (view.image) this.children.bringToTop(view.image);
  }

  /** Story 5.1: a tapped scoop stays lifted (lift ran on its press) and gets the selection ring. */
  private select(view: ScoopView): void {
    this.selection?.destroy();
    this.selection = createSelectionRing(this, view.image, LIFTED_DEPTH);
  }

  private deselect(): void {
    this.selection?.destroy();
    this.selection = undefined;
  }

  private settle(view: ScoopView, outcome: () => RoundCommand[]): void {
    view.image?.setScale(1 / this.layout.renderScale);
    view.shadow.setVisible(false);
    this.applyAll(outcome());
  }

  /** Tweens a scoop to `to`; its hit circle follows every frame (place). */
  private moveTo(view: ScoopView, to: Point, durationMs: number, onDone?: () => void, ease: string = EASE_OUT): void {
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
      ease,
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

  /**
   * 2026-10-21: a scoop comes to rest on the table row. Dropped above or below it, it falls (or rises)
   * onto the row with a small landing bounce (none under reduced motion); a nudge along the row slides.
   */
  private restOnRow(view: ScoopView, at: Point): void {
    const dy = at.y - view.pos.y;
    // Along the row (a nudge) or dropped below it (the pink front): a plain slide.
    if (Math.abs(dy) < Tokens.ui.iceCreamRestSlideTolerancePx) {
      this.moveTo(view, at, Tokens.components.dropTarget.snap.durationMs);
      return;
    }
    const ms = Tokens.Timing.iceCreamRestFallMs;
    const bounce = this.reduced ? 0 : Tokens.ui.iceCreamRestBouncePx;
    if (dy < 0 || bounce === 0) {
      this.moveTo(view, at, ms);
      return;
    }
    const hop = ms * Tokens.ui.iceCreamRestHopShare;
    const up = { x: at.x, y: at.y - bounce };
    this.moveTo(view, at, ms, () => this.moveTo(view, up, hop, () => this.moveTo(view, at, hop)), 'Quad.easeIn');
  }

  private destroyScoop(view: ScoopView): void {
    view.tween?.stop();
    view.returnTimer?.remove();
    view.drag?.destroy();
    // A running snap / pop-in / fade tween must not touch the destroyed image.
    if (view.image) this.tweens.killTweensOf(view.image);
    view.image?.destroy();
    view.shadow.destroy();
  }

  // --- round commands -------------------------------------------------------------------------------

  /** Round commands apply while the round plays and, Story 6.1, in free play (a drag running at the switch lands there too). */
  private applyAll(cmds: readonly RoundCommand[]): void {
    if (this.inert && !this.freePlay) return;
    for (const c of cmds) this.apply(c);
  }

  /** Story 6.1: free play — every counter scoop pickable; serves stack on the cone (round.beginFreePlay). */
  protected override onFreePlay(): void {
    this.applyAll(this.round?.beginFreePlay() ?? []);
  }

  private apply(c: RoundCommand): void {
    switch (c.kind) {
      case 'build':
        for (const v of this.scoops.values()) this.destroyScoop(v);
        this.scoops = new Map();
        for (const s of c.scoops) this.addScoop(s, false);
        return;
      case 'beginQuestion':
        this.hint.beginQuestion({ promptLineId: c.promptLineId, retryLineId: c.retryLineId, step: this.step(c.correct, c.distractors) });
        return;
      case 'stepDone':
        this.hint.stepDone(this.step(c.correct, c.distractors), { retryLineId: c.retryLineId });
        return;
      case 'finishRound':
        this.scheduleFinish(c.afterMs);
        return;
      case 'snap':
        this.snap(c.id, c.to);
        return;
      case 'restoreCone':
        for (const s of c.scoops) this.restoreConeScoop(s.flavour, s.to);
        return;
      case 'floatBack': {
        const v = this.scoops.get(c.id);
        if (v) this.moveTo(v, c.to, Tokens.components.draggableItem.return.durationMs);
        return;
      }
      case 'rest': {
        const v = this.scoops.get(c.id);
        if (v) this.restOnRow(v, c.at);
        return;
      }
      case 'returnLater': {
        const v = this.scoops.get(c.id);
        if (!v) return;
        v.returnTimer?.remove();
        v.returnTimer = this.time.delayedCall(c.ms, () => {
          v.returnTimer = undefined;
          this.round?.returned(c.id);
          this.moveTo(v, c.to, Tokens.components.draggableItem.return.durationMs);
        });
        return;
      }
      case 'cancelReturn': {
        const v = this.scoops.get(c.id);
        v?.returnTimer?.remove();
        if (v) v.returnTimer = undefined;
        return;
      }
      case 'respawn':
        this.addScoop(c.scoop, true);
        return;
      case 'pickable':
        for (const v of this.scoops.values()) if (v.drag) inputGuard.setPickable(v.drag, c.on);
        return;
      case 'celebrate':
        this.playCorrect();
        return;
      case 'choseOther':
        this.playChoseOther(c.id, c.to);
        return;
      case 'hintWrong': {
        // Story 6.1: the reminder waits for the chose-other reaction it follows (after the float back).
        if (!pairHintWrong(this.tastes)) this.hint.wrong();
        return;
      }
      case 'stack':
        this.snap(c.id, c.to);
        return;
      case 'topple':
        this.topple(c.scoops);
        return;
      case 'questionDone':
        this.hint.questionDone();
        return;
      case 'nextLater':
        // Story 5.3: the wait before the next question can be skipped (the last one, 1.5 s, cannot).
        this.skippable(c.ms);
        this.time.delayedCall(c.ms, () => this.applyAll(this.round?.next() ?? []));
        return;
      case 'clear':
        this.clearCone();
        return;
    }
  }

  /** The hint step of a stage: draggables by scoop id, the cone as the target. */
  private step(correct: readonly string[], distractors: readonly string[]): HintStep {
    const drags = (ids: readonly string[]): Draggable[] => ids.flatMap((id) => this.scoops.get(id)?.drag ?? []);
    return { correct: drags(correct), distractors: drags(distractors), target: this.cone ?? null, action: 'drag' };
  }

  /** The correct scoop leaves the counter and snaps onto the cone with a small bounce. */
  private snap(id: string, to: Point): void {
    const v = this.scoops.get(id);
    if (!v) return;
    this.scoops.delete(id);
    v.drag?.destroy();
    v.drag = undefined;
    v.returnTimer?.remove();
    this.coneScoops.push(v);
    audio.sfx(SFX.snap);
    const snap = Tokens.components.dropTarget.snap;
    this.moveTo(v, to, snap.durationMs);
    if (v.image) {
      const base = 1 / this.layout.renderScale;
      this.tweens.add({ targets: v.image, scale: base * snap.scale, duration: snap.durationMs / 2, ease: EASE_OUT, yoyo: true, onComplete: () => v.image?.setScale(base) });
    }
  }

  /**
   * Story 2.5: a scoop served before Home stands on its cone slot at once: no tween, no sfx, no
   * celebration, never draggable (locked like a served scoop). It is eaten with the cone as usual.
   */
  private restoreConeScoop(flavour: FlavourId, to: Point): void {
    const view = this.addScoop({ id: `cone-${this.coneScoops.length + 1}`, flavour, at: to }, false);
    this.scoops.delete(view.id);
    view.drag?.destroy();
    view.drag = undefined;
    this.coneScoops.push(view);
  }

  /** Shiba "ate" the cone scoops: they fade out. */
  private clearCone(): void {
    const eaten = this.coneScoops;
    this.coneScoops = [];
    for (const v of eaten) {
      if (!v.image) {
        this.destroyScoop(v);
        continue;
      }
      this.tweens.add({ targets: v.image, alpha: 0, duration: Tokens.Timing.sceneFadeMs, onComplete: () => this.destroyScoop(v) });
    }
  }

  // --- Story 6.1: the free-play tower -----------------------------------------------------------------

  /**
   * The full tower wobbles (none under reduced motion), then its top `scoops.length` scoops fall to their
   * counter spots; the lowest ones (no room on the row) stay on the cone as the new tower.
   */
  private topple(scoops: readonly ToppledScoop[]): void {
    const tower = this.coneScoops;
    if (tower.length < scoops.length) console.warn(`ice-cream: the tower has ${tower.length} scoops but ${scoops.length} topple`);
    const keep = Math.max(0, tower.length - scoops.length);
    this.coneScoops = tower.slice(0, keep);
    const wobbleMs = this.reduced ? 0 : Tokens.Timing.iceCreamTowerWobbleMs;
    if (wobbleMs > 0) this.wobble(tower, wobbleMs);
    this.time.delayedCall(wobbleMs, () => this.fall(tower.slice(keep), scoops));
  }

  /** The tower sways around the cone's foot: ± ui.iceCreamTowerWobbleDeg, damped over `ms`. */
  private wobble(tower: readonly ScoopView[], ms: number): void {
    const pivot = this.layout.anchors[CONE_ANCHOR] ?? this.slot(CONE_SLOTS[0]);
    // The last scoop may still be snapping on: every scoop starts from its tower slot.
    const from = tower.map((v, i) => {
      v.tween?.stop();
      v.tween = undefined;
      v.tweenDone = undefined;
      const at = this.round?.towerCentre(i) ?? v.pos;
      this.place(v, at);
      return { ...at };
    });
    const peak = Tokens.ui.iceCreamTowerWobbleDeg * DEG_TO_RAD;
    const swings = Tokens.ui.iceCreamTowerWobbleSwings;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: ms,
      onUpdate: (t) => {
        const v = t.getValue() ?? 0;
        const a = peak * Math.sin(v * swings * 2 * Math.PI) * (1 - v);
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        tower.forEach((view, i) => {
          const p = from[i]!;
          const dx = p.x - pivot.x;
          const dy = p.y - pivot.y;
          this.place(view, { x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos });
          view.image?.setRotation(a);
        });
      },
      onComplete: () => tower.forEach((view) => view.image?.setRotation(0)),
    });
  }

  /**
   * The tower scoops become counter scoops (draggable, ids from the round) and fall to their spots:
   * Back.easeIn plus a small bounce; under reduced motion they fade in at the spot.
   */
  private fall(tower: readonly ScoopView[], scoops: readonly ToppledScoop[]): void {
    this.round?.toppled();
    const ms = Tokens.Timing.iceCreamToppleMs;
    const rs = this.layout.renderScale;
    scoops.forEach((s, i) => {
      const old = tower[i];
      const from = old ? { ...old.pos } : this.slot(CONE_SLOTS[0]);
      const view = this.addScoop({ id: s.id, flavour: s.flavour, at: from }, false);
      if (this.reduced) {
        this.place(view, s.to);
        view.image?.setAlpha(0);
        if (view.image) this.tweens.add({ targets: view.image, alpha: 1, duration: ms });
        return;
      }
      view.image?.setScale(1 / rs);
      const hop = ms / 2 / 2;
      const up = { x: s.to.x, y: s.to.y - Tokens.ui.iceCreamToppleBouncePx };
      this.moveTo(view, s.to, ms, () => this.moveTo(view, up, hop, () => this.moveTo(view, s.to, hop)), 'Back.easeIn');
    });
    for (const v of tower) this.destroyScoop(v);
    audio.sfx(SFX.snap);
  }
}
