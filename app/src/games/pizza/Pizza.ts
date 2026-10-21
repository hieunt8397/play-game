// Tiệm pizza (Story 3.1): drag the asked number of topping slices onto the base while the voice
// counts, then tap the oven so the fox can eat. The scene only wires Phaser: the plate `bg.pizza`, the
// full-frame sprites of `atlas.pizza` (fox and base on their ground pivots, slices on their trimmed
// centres), DragControllers for the slices, a HotspotPolygon on the oven and tweens. Every decision
// (drop resolution, the count, the oven step, the round end) is the pure round model (round.ts,
// questions.ts); prompts and retries go through `hint` only; the game speaks only the counts
// (`say`) and the recount (`sayChain`). Every position comes from LAYOUTS.pizza; timers are scene-clock
// events and tweens (removed or frozen with the scene).
// Story 3.2: only the level's bowls are drawn (each bowl is its own sprite at `anchor.bowl-<t>`), the
// toppings step dims the other bowls with their slices at hint level 4, and a resumed start
// (MiniGameBase `resumeAt`, validated by the round's `resumeQuestion`) puts the placed slices straight
// back on their old spots with no count.
import type { GameObjects, Time, Tweens } from 'phaser';
import { ATLASES, BACKGROUNDS } from '../../content/assets';
import {
  ANCHORS,
  BASE_FRAMES,
  BASE_SLOTS,
  FOX_FRAMES,
  FOX_PLATE_SLOT,
  HITS,
  OVEN_FRAMES,
  SFX,
  baseSlot,
  bowlAnchor,
  bowlFrame,
  bowlSlot,
  toppingFrame,
  type ToppingId,
} from '../../content/games/pizza';
import type { Point, ScreenLayout } from '../../content/layout-types';
import { LAYOUTS } from '../../content/layouts';
import { audio } from '../../core/audio-director';
import { bus } from '../../core/bus';
import type { HintItem, HintStep } from '../../core/hint-director';
import { createHintRing, createSelectionRing, type HintRing, type SelectionRing } from '../../core/hint-visuals';
import { createDraggable, defaultDragArea, defaultPlayRect, type Draggable } from '../../core/input/drag-controller';
import { createDropTarget, intersectRect, type DropTarget } from '../../core/input/drop';
import { inputGuard } from '../../core/input/guard';
import { HotspotPolygon } from '../../core/input/hotspot-polygon';
import { boundingBox, pointInPolygon } from '../../core/input/polygon';
import { createTapRouter, type TapRouter } from '../../core/input/tap-router';
import { amplitude, prefersReducedMotion } from '../../core/reduced-motion';
import type { Rect } from '../../core/safe-rect';
import { Tokens } from '../../core/tokens';
import { bounce } from '../../core/ui/scale-motion';
import { originFor, trimmedCentre, trimmedSize, type TrimmedRect } from '../../core/ui/sprite-pivot';
import { MiniGameBase } from '../mini-game-base';
import { baseRadius } from './geometry';
import { PizzaRound, startCommands, type Area, type HintRef, type PizzaCommand, type PizzaGeometry, type PizzaProgress, type SliceState, type SpeechTag } from './round';

const EASE_OUT = 'Quad.easeOut';
const SINE = 'Sine.easeInOut';
/** Ambient hold reasons (MiniGameBase). */
const HOLD_BAKE = 'bake';
const HOLD_CELEBRATE = 'celebrate';
/** The director's ring appears from this hint level; the game's ready ring only shows below it. */
const RING_LEVEL = 2;

/** Draw order: the fox behind the base, slices above it, the oven and its glow above both. */
const LAYERS = ['fox', 'base', 'bowl', 'slice', 'oven', 'glow', 'lifted', 'puff'] as const;
const Depth = Object.fromEntries(LAYERS.map((name, i) => [name, i + 1])) as Readonly<Record<(typeof LAYERS)[number], number>>;

interface FrameData {
  readonly spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

interface SliceView {
  readonly id: string;
  readonly topping: ToppingId;
  readonly image: GameObjects.Image | undefined;
  readonly shadow: GameObjects.Ellipse;
  /** Undefined once the slice sits on the base. */
  drag: Draggable | undefined;
  readonly radius: number;
  /** The slice is drawn here (its trimmed centre). */
  pos: Point;
  tween: Tweens.Tween | undefined;
  /** Story 5.1: the running move's onDone, run when another move replaces it. */
  tweenDone?: (() => void) | undefined;
  returnTimer: Time.TimerEvent | undefined;
}

interface PlacedSlice {
  readonly image: GameObjects.Image;
  /** Its resting scale (pizzaPlacedSlicePx wide). */
  readonly scale: number;
}

interface BaseView {
  /** The base image and its faint spots, placed on `anchor.base`. */
  readonly group: GameObjects.Container;
  readonly image: GameObjects.Image | undefined;
  /** Placed slices by spot number; they stay scene children (hint visuals read their position). */
  readonly placed: Map<number, PlacedSlice>;
}

const NO_AREA: Area = { contains: () => false };

export class Pizza extends MiniGameBase<'pizza'> {
  private round: PizzaRound | undefined;
  private router: TapRouter | undefined;
  private layout: ScreenLayout = LAYOUTS.pizza;
  private slices = new Map<string, SliceView>();
  private base: BaseView | undefined;
  /** The level's bowl sprites (created on the first build; the level never changes within a round). */
  private bowls = new Map<ToppingId, HintItem>();
  /** Story 5.4: removes the tap reactions of this start's fox and bowls. */
  private unreact: Array<() => void> = [];
  /** Story 5.4: true while the fox eats (no tap bounce over its chew). */
  private eating = false;
  private baseTarget: DropTarget | undefined;
  private fox: GameObjects.Image | undefined;
  private breath: Tweens.Tween | undefined;
  private oven: GameObjects.Image | undefined;
  private glow: GameObjects.Image | undefined;
  private ovenItem: HintItem = {};
  private readyRing: HintRing | undefined;
  /** Story 5.1: the ring around the tap-selected slice. */
  private selection: SelectionRing | undefined;
  /** Voice tokens of the game's own utterances, by tag (only the latest per tag). */
  private tokens = new Map<number, SpeechTag>();
  /** The tag of the utterance being requested (its first `speech:line` arrives before the token). */
  private issuing: SpeechTag | undefined;
  private warned = new Set<string>();

  constructor() {
    super('pizza');
  }

  // --- build ----------------------------------------------------------------------------------------

  protected build(): void {
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS.pizza;
    this.slices = new Map();
    for (const off of this.unreact) off();
    this.unreact = [];
    this.eating = false;
    this.bowls = new Map();
    this.tokens = new Map();
    this.issuing = undefined;
    this.readyRing = undefined;
    this.base = undefined;
    const scale = 1 / this.layout.renderScale;

    const bg = BACKGROUNDS.pizza.key;
    if (this.textures.exists(bg)) this.add.image(0, 0, bg).setOrigin(0).setScale(scale);
    else console.warn(`pizza: texture "${bg}" is missing — plate skipped`);

    this.router = createTapRouter(this);
    this.attachSkip(this.router);
    this.attachReactions(this.router);
    this.addFox();
    this.addOven();
    const at = this.anchor(ANCHORS.base);
    this.baseTarget = createDropTarget({ id: ANCHORS.base, circle: { x: at.x, y: at.y, r: Tokens.components.dropTarget.snapRadius }, pad: baseRadius(this.layout) });

    const scoped = bus.scoped(this);
    scoped.on('speech:ended', ({ token, completed }) => {
      const tag = this.tokens.get(token);
      if (tag === undefined) return;
      this.tokens.delete(token);
      this.applyAll(this.round?.speechEnded(tag, completed) ?? []);
    });
    scoped.on('speech:line', ({ token, index }) => {
      if (!this.tokens.has(token) && this.issuing !== undefined && index === 0) this.tokens.set(token, this.issuing);
      const tag = this.tokens.get(token);
      if (tag !== undefined) this.applyAll(this.round?.speechLine(tag, index) ?? []);
    });
    scoped.on('hint:level', ({ gameId, level }) => {
      // The director's level-2 ring replaces the game's ready ring (one ring at a time).
      if (gameId === this.gameId && level >= RING_LEVEL) this.clearReadyRing();
    });

    const round = new PizzaRound(this.geometry(), this.seed, this.level);
    this.round = round;
    const plan = startCommands(round, this.resumeAt);
    for (const w of plan.warnings) console.warn(w);
    if (plan.accepted) this.acceptResume();
    this.applyAll(plan.commands);
  }

  protected progress(): PizzaProgress {
    return this.round?.progress() ?? { questionIndex: 0, partial: { placed: [], baked: false } };
  }

  private anchor(id: string): Point {
    const p = this.layout.anchors[id];
    if (!p) console.warn(`pizza: anchor "${id}" is missing from the layout`);
    return p ?? { x: this.layout.design.width / 2, y: this.layout.design.height / 2 };
  }

  private slot(id: string): Point {
    const p = this.layout.slots[id];
    if (!p) console.warn(`pizza: slot "${id}" is missing from the layout`);
    return p ?? { x: this.layout.design.width / 2, y: this.layout.design.height / 2 };
  }

  private area(id: string): Area {
    const poly = this.layout.hits[id];
    if (!poly) {
      console.warn(`pizza: hit "${id}" is missing from the layout`);
      return NO_AREA;
    }
    return { contains: (p) => pointInPolygon(p, poly) };
  }

  /** Trimmed rect of an atlas frame (render px); undefined when the frame is missing. */
  private frameRect(frame: string): TrimmedRect | undefined {
    const key = ATLASES.pizza.key;
    if (!this.textures.exists(key) || !this.textures.get(key).has(frame)) return undefined;
    const ss = (this.textures.get(key).get(frame).customData as FrameData | undefined)?.spriteSourceSize;
    return ss ? { x: ss.x, y: ss.y, width: ss.w, height: ss.h } : undefined;
  }

  private warnOnce(what: string, msg: string): void {
    if (this.warned.has(what)) return;
    this.warned.add(what);
    console.warn(msg);
  }

  /** A full-frame sprite placed on `pivot` (the frame is rendered there), or undefined with one warning. */
  private sprite(frame: string, pivot: Point): GameObjects.Image | undefined {
    if (!this.frameRect(frame)) {
      this.warnOnce(frame, `pizza: frame "${frame}" is missing`);
      return undefined;
    }
    const o = originFor(pivot, this.layout.design);
    return this.add.image(pivot.x, pivot.y, ATLASES.pizza.key, frame).setOrigin(o.x, o.y).setScale(1 / this.layout.renderScale);
  }

  /** Where a topping's slice is drawn on its bowl: its frame's trimmed centre (else the slot). */
  private bowlHome(t: ToppingId): Point {
    const rect = this.frameRect(toppingFrame(t));
    return rect ? trimmedCentre(rect, this.layout.renderScale) : this.slot(bowlSlot(t));
  }

  private geometry(): PizzaGeometry {
    const counterBox = boundingBox(this.layout.hits[HITS.counter] ?? []);
    const counterRect: Rect = { x: counterBox.x, y: counterBox.y, w: counterBox.width, h: counterBox.height };
    return {
      bowlHome: (t) => this.bowlHome(t),
      baseSpot: (n) => this.slot(baseSlot(n)),
      spots: BASE_SLOTS,
      base: { contains: (p) => this.baseTarget?.contains(p) ?? false },
      baseCentre: this.anchor(ANCHORS.base),
      counter: this.area(HITS.counter),
      restRect: () => {
        const a = defaultDragArea();
        return a ? intersectRect(counterRect, a.bounds) : counterRect;
      },
      playRect: defaultPlayRect,
      snapRadius: Tokens.components.dropTarget.snapRadius,
      minSize: Tokens.components.draggableItem.minSize,
      offCounterDelayMs: Tokens.Timing.dragOffCounterReturnDelayMs,
      finishDelayMs: Tokens.Timing.roundCelebrationMs,
    };
  }

  // --- fox --------------------------------------------------------------------------------------------

  private addFox(): void {
    this.fox = this.sprite(FOX_FRAMES.idle, this.anchor(ANCHORS.fox))?.setDepth(Depth.fox);
    this.breathe();
    // Story 5.4: a tap on the fox bounces it, except while it bakes, eats or celebrates (its own tweens).
    if (this.fox) this.unreact.push(this.react({ image: this.fox, area: this.area(HITS.fox), base: 1 / this.layout.renderScale, enabled: () => !this.eating && !this.holding(HOLD_BAKE) && !this.holding(HOLD_CELEBRATE) }));
  }

  /** Breathing: scaleY 1 ↔ foxBreathScale around the ground pivot, yoyo (ambient). */
  private breathe(): void {
    const img = this.fox;
    if (!img) return;
    const base = 1 / this.layout.renderScale;
    img.setScale(base);
    this.breath?.stop();
    this.breath = this.addAmbient(
      this.tweens.add({
        targets: img,
        scaleY: base * amplitude(Tokens.ui.foxBreathScale, this.reduced),
        duration: Tokens.Timing.foxBreathMs / 2,
        ease: SINE,
        yoyo: true,
        repeat: -1,
      }),
    );
  }

  /** Plays `frames` in a loop for `ms` (the eat frames), then calls `done`. */
  private playFrames(frames: readonly string[], ms: number, done: () => void): void {
    const img = this.fox;
    const have = frames.filter((f) => this.frameRect(f) !== undefined);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: ms,
      onUpdate: (t) => {
        if (img && have.length > 0) img.setFrame(have[Math.floor((t.getValue() ?? 0) * have.length * 2) % have.length]!, false, false);
      },
      onComplete: done,
    });
  }

  /** The last pizza is eaten: happy frames and the celebrate bounce, with the happy tune. */
  private celebrate(): void {
    audio.sfx(SFX.happy);
    const img = this.fox;
    if (!img) return;
    this.holdAmbient(HOLD_CELEBRATE, true);
    const spec = Tokens.components.character.celebrate;
    const scales = spec.scales.map((s) => amplitude(s, this.reduced));
    const frames = FOX_FRAMES.happy.filter((f) => this.frameRect(f) !== undefined);
    const base = 1 / this.layout.renderScale;
    const steps = scales.length - 1;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: spec.durationMs,
      onUpdate: (t) => {
        const v = t.getValue() ?? 0;
        const cycle = (v * spec.repeat) % 1;
        const k = Math.min(steps - 1, Math.floor(cycle * steps));
        const local = cycle * steps - k;
        img.setScale(base * (scales[k]! + (scales[k + 1]! - scales[k]!) * Math.sin((local * Math.PI) / 2)));
        if (frames.length > 0) img.setFrame(frames[Math.floor(v * frames.length * spec.repeat) % frames.length]!, false, false);
      },
      onComplete: () => {
        img.setScale(base);
        img.setFrame(FOX_FRAMES.idle, false, false);
        // The last pizza's bake hold and the celebration end together (the round finishes next).
        this.holdAmbient(HOLD_BAKE, false);
        this.holdAmbient(HOLD_CELEBRATE, false);
      },
    });
  }

  // --- oven -------------------------------------------------------------------------------------------

  private addOven(): void {
    const at = this.anchor(ANCHORS.oven);
    this.oven = this.sprite(OVEN_FRAMES.rest, at)?.setDepth(Depth.oven);
    // A missing glow frame warns once (sprite) and the bake keeps its timing without the glow.
    this.glow = this.sprite(OVEN_FRAMES.baking, at)?.setDepth(Depth.glow).setAlpha(0);
    this.ovenItem = { object: this.oven };
    const poly = this.layout.hits[HITS.oven];
    if (!poly || !this.router) {
      console.warn(`pizza: hit "${HITS.oven}" is missing — the oven cannot be tapped`);
      return;
    }
    new HotspotPolygon(this.router, poly, () => this.applyAll(this.round?.ovenTap() ?? []));
  }

  private setOvenFrame(frame: string): void {
    if (this.oven && this.frameRect(frame)) this.oven.setFrame(frame, false, false);
  }

  private showReadyRing(): void {
    this.clearReadyRing();
    const poly = this.layout.hits[HITS.oven];
    if (!poly || this.hint.level >= RING_LEVEL) return;
    this.readyRing = createHintRing(this, boundingBox(poly), { reduced: this.reduced, depth: Depth.puff });
  }

  private clearReadyRing(): void {
    this.readyRing?.destroy();
    this.readyRing = undefined;
  }

  /**
   * Soft white puffs over `at` (pizzaPuffCount, staggered), each growing 1 → pizzaPuffGrow as it rises
   * over `ms` and fading (static under reduced motion).
   */
  private puffs(at: Point, ms: number): void {
    const px = Tokens.ui.pizzaPuffPx;
    const n = Tokens.ui.pizzaPuffCount;
    const colour = Tokens.colors.counterTop;
    for (let i = 0; i < n; i++) {
      const k = i - (n - 1) / 2;
      const puff = this.add
        .ellipse(at.x + k * px * Tokens.ui.pizzaPuffSpread, at.y - Math.abs(k) * px * Tokens.ui.pizzaPuffArc, px, px, colour.value, colour.alpha)
        .setDepth(Depth.puff);
      this.tweens.add({
        targets: puff,
        y: this.reduced ? puff.y : puff.y - Tokens.components.oven.size / 2 - (i % 2) * px,
        x: this.reduced ? puff.x : puff.x + k * px * Tokens.ui.pizzaPuffSpread,
        scale: this.reduced ? 1 : Tokens.ui.pizzaPuffGrow,
        alpha: 0,
        delay: this.reduced ? 0 : (i * ms) / (n * Tokens.ui.pizzaPuffStagger),
        duration: ms,
        ease: EASE_OUT,
        onComplete: () => puff.destroy(),
      });
    }
  }

  /** The base group and its placed slices (as `snapshot` saw them) scaled by `k` around `centre`. */
  private scaleBaseAround(snapshot: ReadonlyMap<GameObjects.Container | GameObjects.Image, Point & { readonly s: number }>, centre: Point, k: number): void {
    for (const [o, p] of snapshot) o.setPosition(centre.x + (p.x - centre.x) * k, centre.y + (p.y - centre.y) * k).setScale(p.s * k);
  }

  private baseSnapshot(base: BaseView): Map<GameObjects.Container | GameObjects.Image, Point & { readonly s: number }> {
    const m = new Map<GameObjects.Container | GameObjects.Image, Point & { readonly s: number }>();
    m.set(base.group, { x: base.group.x, y: base.group.y, s: base.group.scaleX });
    for (const { image } of base.placed.values()) m.set(image, { x: image.x, y: image.y, s: image.scaleX });
    return m;
  }

  /** The top centre of the oven's hit area (smoke). */
  private ovenTop(): Point {
    const b = boundingBox(this.layout.hits[HITS.oven] ?? []);
    return { x: b.x + b.width / 2, y: b.y };
  }

  /**
   * Moves the base group and its placed slices so the base pivot goes to `to` over `ms`, fading
   * their alpha to `alpha`; then `done`.
   */
  private moveBase(base: BaseView, to: Point, alpha: number, ms: number, done: () => void): void {
    const items: Array<{ readonly o: GameObjects.Container | GameObjects.Image; readonly x: number; readonly y: number; readonly a: number }> = [
      { o: base.group, x: base.group.x, y: base.group.y, a: base.group.alpha },
      ...[...base.placed.values()].map(({ image }) => ({ o: image, x: image.x, y: image.y, a: image.alpha })),
    ];
    const dx = to.x - base.group.x;
    const dy = to.y - base.group.y;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: ms,
      ease: EASE_OUT,
      onUpdate: (t) => {
        const v = t.getValue() ?? 0;
        for (const it of items) it.o.setPosition(it.x + dx * v, it.y + dy * v).setAlpha(it.a + (alpha - it.a) * v);
      },
      onComplete: done,
    });
  }

  /** Slide in → glow up, hold with smoke, down → ting → out to the fox's plate with steam → eat → eaten(). */
  private bake(): void {
    this.holdAmbient(HOLD_BAKE, true);
    const T = Tokens.Timing;
    const base = this.base;
    const ovenAt = this.anchor(ANCHORS.oven);
    if (!base) {
      this.time.delayedCall(T.pizzaSlideMs, () => this.glowAndServe());
      return;
    }
    // Story 5.3: slide in, glow, bake, slide out and eat — a tap after the arm delay fast-forwards it.
    this.skippable(2 * T.pizzaSlideMs + 2 * T.ovenGlowRiseMs + T.pizzaBakeMs + T.pizzaEatMs);
    this.moveBase(base, ovenAt, 0, T.pizzaSlideMs, () => this.glowAndServe());
  }

  private glowAndServe(): void {
    const T = Tokens.Timing;
    const rise = T.ovenGlowRiseMs;
    const total = 2 * rise + T.pizzaBakeMs;
    this.setOvenFrame(OVEN_FRAMES.rest);
    const glow = this.glow;
    this.time.delayedCall(rise, () => this.puffs(this.ovenTop(), T.pizzaBakeMs));
    // The oven breathes while it bakes (around its ground pivot; none under reduced motion).
    const oven = this.oven;
    const ovenScale = 1 / this.layout.renderScale;
    const wobble = oven && !this.reduced
      ? this.tweens.add({ targets: [oven, glow].filter((o) => o !== undefined), scaleY: ovenScale * Tokens.ui.ovenBakeWobbleScale, duration: T.ovenBakeWobbleMs / 2, ease: SINE, yoyo: true, repeat: -1 })
      : undefined;
    // One rise and one fall, no blinking.
    this.tweens.addCounter({
      from: 0,
      to: total,
      duration: total,
      onUpdate: (t) => {
        const ms = t.getValue() ?? 0;
        const a = ms < rise ? ms / rise : ms < rise + T.pizzaBakeMs ? 1 : Math.max(0, 1 - (ms - rise - T.pizzaBakeMs) / rise);
        glow?.setAlpha(a);
      },
      onComplete: () => {
        wobble?.remove();
        oven?.setScale(ovenScale);
        glow?.setScale(ovenScale);
        glow?.setAlpha(0);
        audio.sfx(SFX.ting);
        this.serveToFox();
      },
    });
  }

  private serveToFox(): void {
    const T = Tokens.Timing;
    const base = this.base;
    const plate = this.slot(FOX_PLATE_SLOT);
    const eat = (): void => {
      audio.sfx(SFX.munch);
      this.chew(T.pizzaEatMs);
      this.biteAway(plate, T.pizzaEatMs);
      this.eating = true;
      this.playFrames(FOX_FRAMES.eat, T.pizzaEatMs, () => {
        this.eating = false;
        this.applyAll(this.round?.eaten() ?? []);
      });
    };
    const done = (): void => {
      this.puffs(plate, T.pizzaSteamMs);
      // The baked pizza pops as it lands, then the fox eats it.
      const b = this.base;
      if (!b || this.reduced) {
        eat();
        return;
      }
      const snap = this.baseSnapshot(b);
      const pop = Tokens.ui.pizzaServePopScale;
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: T.pizzaServePopMs,
        onUpdate: (t) => this.scaleBaseAround(snap, plate, 1 + (pop - 1) * Math.sin((t.getValue() ?? 0) * Math.PI)),
        onComplete: () => {
          this.scaleBaseAround(snap, plate, 1);
          eat();
        },
      });
    };
    if (!base) {
      done();
      return;
    }
    if (base.image && this.frameRect(BASE_FRAMES.baked)) base.image.setFrame(BASE_FRAMES.baked, false, false);
    this.moveBase(base, plate, 1, T.pizzaSlideMs, done);
  }

  /** The fox chews: scaleY 1 ↔ foxChewScale around its ground pivot for `ms` (still under reduced motion). */
  private chew(ms: number): void {
    const img = this.fox;
    if (!img || this.reduced) return;
    const base = 1 / this.layout.renderScale;
    const bites = Tokens.ui.pizzaBites;
    this.tweens.add({
      targets: img,
      scaleY: base * Tokens.ui.foxChewScale,
      duration: ms / (bites * 2),
      ease: SINE,
      yoyo: true,
      repeat: bites - 1,
      onComplete: () => img.setScale(base),
    });
  }

  /** The pizza on the plate shrinks away in pizzaBites steps over `ms` (one fade under reduced motion). */
  private biteAway(plate: Point, ms: number): void {
    const b = this.base;
    if (!b) return;
    const snap = this.baseSnapshot(b);
    const bites = Tokens.ui.pizzaBites;
    if (this.reduced) {
      this.tweens.add({ targets: [...snap.keys()], alpha: 0, duration: ms });
      return;
    }
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: ms,
      onUpdate: (t) => {
        const v = t.getValue() ?? 0;
        // Each bite: a quick nibble down to the next size step, then a pause.
        const step = Math.min(bites, Math.floor(v * bites));
        const local = Math.min(1, (v * bites - step) * Tokens.ui.pizzaBiteNibble);
        const k = 1 - (step + local) / bites;
        this.scaleBaseAround(snap, plate, Math.max(0, k));
      },
    });
  }

  // --- base -------------------------------------------------------------------------------------------

  /** A raw base with its 8 faint spots, in a group placed on `anchor.base`. */
  private buildBase(): void {
    const at = this.anchor(ANCHORS.base);
    const group = this.add.container(at.x, at.y).setDepth(Depth.base);
    const rect = this.frameRect(BASE_FRAMES.raw);
    let image: GameObjects.Image | undefined;
    let squash = 1;
    if (rect) {
      const o = originFor(at, this.layout.design);
      image = this.add.image(0, 0, ATLASES.pizza.key, BASE_FRAMES.raw).setOrigin(o.x, o.y).setScale(1 / this.layout.renderScale);
      group.add(image);
      squash = rect.height / rect.width;
    } else {
      this.warnOnce(BASE_FRAMES.raw, `pizza: frame "${BASE_FRAMES.raw}" is missing — the base is drawn without an image`);
    }
    // Faint spots, foreshortened like the base.
    const spec = Tokens.components.ghostSlot;
    const w = Tokens.ui.pizzaPlacedSlicePx;
    const g = this.add.graphics();
    g.fillStyle(spec.line.color.value, spec.fillOpacity);
    for (let n = 1; n <= BASE_SLOTS; n++) {
      const p = this.slot(baseSlot(n));
      g.fillEllipse(p.x - at.x, p.y - at.y, w, w * squash);
    }
    group.add(g);
    this.base = { group, image, placed: new Map() };
  }

  /** The eaten pizza fades; the fox returns to idle; the bake hold ends. */
  private clearBase(): void {
    const old = this.base;
    this.base = undefined;
    if (old) {
      const targets = [old.group, ...[...old.placed.values()].map((p) => p.image)];
      this.tweens.add({ targets, alpha: 0, duration: Tokens.Timing.sceneFadeMs, onComplete: () => targets.forEach((t) => t.destroy()) });
    }
    this.fox?.setFrame(FOX_FRAMES.idle, false, false);
    this.holdAmbient(HOLD_BAKE, false);
  }

  // --- bowls -----------------------------------------------------------------------------------------

  /** The level's bowl sprites on their ground pivots (once per start); the other bowls are never created. */
  private addBowls(toppings: readonly ToppingId[]): void {
    for (const t of toppings) {
      if (this.bowls.has(t)) continue;
      const img = this.sprite(bowlFrame(t), this.anchor(bowlAnchor(t)))?.setDepth(Depth.bowl);
      // A HintItem with no onLiftChange: the level-4 dim fades it (it is never draggable).
      this.bowls.set(t, { object: img });
      // Story 5.4: a bowl is not a target (its slice, a draggable on top, wins the press): a tap bounces it.
      if (img) this.unreact.push(this.react({ image: img }));
    }
  }

  /** Story 3.2 (resume): a locked slice of `topping` straight on spot `n` — no tween, no sfx, no count. */
  private restoreSlice(topping: ToppingId, n: number): void {
    const base = this.base;
    const frame = toppingFrame(topping);
    const rect = this.frameRect(frame);
    if (!base || !rect) {
      if (!rect) this.warnOnce(frame, `pizza: frame "${frame}" is missing — restored slice skipped`);
      return;
    }
    const rs = this.layout.renderScale;
    const at = this.slot(baseSlot(n));
    const small = Tokens.ui.pizzaPlacedSlicePx / trimmedSize(rect, rs).w / rs;
    const o = originFor(trimmedCentre(rect, rs), this.layout.design);
    const image = this.add.image(at.x, at.y, ATLASES.pizza.key, frame).setOrigin(o.x, o.y).setScale(small).setDepth(Depth.slice);
    base.placed.set(n, { image, scale: small });
  }

  // --- slices -----------------------------------------------------------------------------------------

  private addSlice(s: SliceState, popIn: boolean): SliceView {
    const frame = toppingFrame(s.topping);
    const rect = this.frameRect(frame);
    const rs = this.layout.renderScale;
    const item = Tokens.components.draggableItem;
    const size = rect ? trimmedSize(rect, rs) : { w: item.minSize, h: item.minSize };
    const half = Math.max(size.w, size.h) / 2;
    const shadowSpec = item.liftShadow;
    const shadow = this.add
      .ellipse(s.at.x + shadowSpec.x, s.at.y + shadowSpec.y, size.w, size.h / 2, shadowSpec.color.value, shadowSpec.color.alpha)
      .setDepth(Depth.slice)
      .setVisible(false);
    let image: GameObjects.Image | undefined;
    if (rect) {
      const o = originFor(trimmedCentre(rect, rs), this.layout.design);
      image = this.add.image(s.at.x, s.at.y, ATLASES.pizza.key, frame).setOrigin(o.x, o.y).setScale(1 / rs).setDepth(Depth.slice);
    } else {
      this.warnOnce(frame, `pizza: frame "${frame}" is missing — slice drawn without an image`);
    }
    const view: SliceView = { id: s.id, topping: s.topping, image, shadow, drag: undefined, radius: half + item.hitPad, pos: { ...s.at }, tween: undefined, returnTimer: undefined };
    if (this.router) {
      view.drag = createDraggable(this.router, {
        circle: { x: s.at.x, y: s.at.y, r: view.radius },
        itemRadius: item.minSize / 2,
        onLift: () => this.lift(view),
        onMove: (p) => this.place(view, p),
        onDrop: (p) => this.settle(view, () => this.round?.drop(view.id, p) ?? []),
        onCancel: () => this.settle(view, () => this.round?.cancel(view.id) ?? []),
        // Story 5.1 tap-then-tap: the tapped slice stays lifted with a ring, then flies to the next tap.
        onSelect: () => this.select(view),
        onDeselect: () => this.deselect(),
        fly: (to, done) => this.moveTo(view, to, Tokens.Timing.tapFlyMs, done),
      });
      view.drag.object = image;
    }
    if (popIn && image) {
      image.setScale(0);
      // Stored as the slice's motion: a lift stops it and sets the lift scale.
      view.tween = this.tweens.add({
        targets: image,
        scale: 1 / rs,
        duration: item.return.durationMs,
        ease: 'Back.easeOut',
        onComplete: () => {
          view.tween = undefined;
        },
      });
    }
    this.slices.set(s.id, view);
    return view;
  }

  private place(view: SliceView, p: Point): void {
    view.pos = { ...p };
    view.image?.setPosition(p.x, p.y);
    view.drag?.setCircle({ x: p.x, y: p.y, r: view.radius });
    const spec = Tokens.components.draggableItem.liftShadow;
    view.shadow.setPosition(p.x + spec.x, p.y + spec.y);
  }

  private lift(view: SliceView): void {
    this.applyAll(this.round?.lift(view.id) ?? []);
    view.tween?.stop();
    view.tween = undefined;
    view.image?.setScale(Tokens.components.draggableItem.liftScale / this.layout.renderScale).setDepth(Depth.lifted);
    view.shadow.setVisible(true).setDepth(Depth.lifted);
  }

  /** Story 5.1: a tapped slice stays lifted (lift ran on its press) and gets the selection ring. */
  private select(view: SliceView): void {
    this.selection?.destroy();
    this.selection = createSelectionRing(this, view.image, Depth.lifted);
  }

  private deselect(): void {
    this.selection?.destroy();
    this.selection = undefined;
  }

  private settle(view: SliceView, outcome: () => PizzaCommand[]): void {
    view.image?.setScale(1 / this.layout.renderScale).setDepth(Depth.slice);
    view.shadow.setVisible(false).setDepth(Depth.slice);
    this.applyAll(outcome());
  }

  private moveTo(view: SliceView, to: Point, durationMs: number, onDone?: () => void): void {
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

  private destroySlice(view: SliceView): void {
    view.tween?.stop();
    view.returnTimer?.remove();
    view.drag?.destroy();
    view.image?.destroy();
    view.shadow.destroy();
  }

  /** The slice leaves its draggable life: snap to the spot (ease-out, 1.05× bounce), shrink, join the base. */
  private snap(id: string, spot: number, to: Point): void {
    audio.sfx(SFX.snap);
    const v = this.slices.get(id);
    if (!v) return;
    this.slices.delete(id);
    v.drag?.destroy();
    v.drag = undefined;
    v.returnTimer?.remove();
    const img = v.image;
    const base = this.base;
    const snapSpec = Tokens.components.dropTarget.snap;
    const rs = this.layout.renderScale;
    const rect = this.frameRect(toppingFrame(v.topping));
    const small = rect ? Tokens.ui.pizzaPlacedSlicePx / trimmedSize(rect, rs).w / rs : 1 / rs;
    // The shadow follows the move (place) and goes when it ends; without a base the image goes too.
    this.moveTo(v, to, snapSpec.durationMs, () => {
      v.shadow.destroy();
      if (!base) img?.destroy();
    });
    if (img && base) {
      // It now belongs to the base (it slides into the oven and out to the fox with it).
      base.placed.set(spot, { image: img, scale: small });
      img.setDepth(Depth.slice);
      this.tweens.add({ targets: img, scale: small * snapSpec.scale, duration: snapSpec.durationMs / 2, ease: EASE_OUT, yoyo: true, onComplete: () => img.setScale(small) });
    }
  }

  /** Recount: the slice on `spot` bounces once (1 → pizzaCountBounceScale → 1). */
  private bounceSpot(spot: number): void {
    const placed = this.base?.placed.get(spot);
    if (!placed) return;
    bounce(this, placed.image, placed.scale, amplitude(Tokens.ui.pizzaCountBounceScale, this.reduced), Tokens.Timing.pizzaCountBounceMs);
  }

  // --- round commands ---------------------------------------------------------------------------------

  private applyAll(cmds: readonly PizzaCommand[]): void {
    if (this.inert) return;
    for (const c of cmds) this.apply(c);
  }

  private say(tag: SpeechTag, speak: () => number): void {
    for (const [t, g] of this.tokens) if (g === tag) this.tokens.delete(t);
    this.issuing = tag;
    const token = speak();
    this.issuing = undefined;
    this.tokens.set(token, tag);
  }

  private apply(c: PizzaCommand): void {
    switch (c.kind) {
      case 'build':
        for (const v of this.slices.values()) this.destroySlice(v);
        this.slices = new Map();
        this.addBowls(c.toppings);
        this.buildBase();
        this.setOvenFrame(OVEN_FRAMES.rest);
        for (const s of c.slices) this.addSlice(s, false);
        return;
      case 'restoreSlices':
        for (const n of c.slots) this.restoreSlice(c.topping, n);
        return;
      case 'beginQuestion':
        this.hint.beginQuestion({ promptLineId: c.promptLineId, retryLineId: c.retryLineId, step: this.toppingStep(c.correct, c.distractors) });
        return;
      case 'beginOvenQuestion':
        this.hint.beginQuestion({ promptLineId: c.promptLineId, retryLineId: c.retryLineId, step: this.ovenStep() });
        return;
      case 'stepDone':
        this.hint.stepDone(this.toppingStep(c.correct, c.distractors));
        return;
      case 'ovenStep':
        this.hint.stepDone(this.ovenStep(), { promptLineId: c.promptLineId, retryLineId: c.retryLineId });
        return;
      case 'snap':
        this.snap(c.id, c.spot, c.to);
        return;
      case 'respawn':
        this.addSlice(c.slice, true);
        return;
      case 'say':
        this.say(c.tag, () => audio.say(c.lineId));
        return;
      case 'sayChain':
        this.say(c.tag, () => audio.sayChain(c.lineIds));
        return;
      case 'bounce':
        this.bounceSpot(c.spot);
        return;
      case 'pickable':
        for (const v of this.slices.values()) if (v.drag) inputGuard.setPickable(v.drag, c.on);
        return;
      case 'ovenReady':
        this.setOvenFrame(OVEN_FRAMES.ready);
        return;
      case 'readyRing':
        this.showReadyRing();
        return;
      case 'clearReadyRing':
        this.clearReadyRing();
        return;
      case 'nudgeOven':
        if (this.oven) bounce(this, this.oven, 1 / this.layout.renderScale, amplitude(Tokens.ui.ovenNudgeScale, this.reduced), Tokens.Timing.buttonPressMs);
        return;
      case 'floatBack': {
        const v = this.slices.get(c.id);
        if (v) this.moveTo(v, c.to, Tokens.components.draggableItem.return.durationMs);
        return;
      }
      case 'rest': {
        const v = this.slices.get(c.id);
        if (v) this.moveTo(v, c.at, Tokens.components.dropTarget.snap.durationMs);
        return;
      }
      case 'returnLater': {
        const v = this.slices.get(c.id);
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
        const v = this.slices.get(c.id);
        v?.returnTimer?.remove();
        if (v) v.returnTimer = undefined;
        return;
      }
      case 'hintWrong':
        this.hint.wrong();
        return;
      case 'questionDone':
        this.hint.questionDone();
        return;
      case 'bake':
        this.bake();
        return;
      case 'markFinishing':
        this.markFinishing();
        return;
      case 'pauseHint':
        this.hint.stepDone(null);
        return;
      case 'clearBase':
        this.clearBase();
        return;
      case 'celebrate':
        this.celebrate();
        return;
      case 'finishRound':
        this.scheduleFinish(c.afterMs);
        return;
    }
  }

  /** The toppings step: draggables by slice id, bowl sprites by topping, the base as the target. */
  private toppingStep(correct: readonly string[], distractors: readonly HintRef[]): HintStep {
    const drag = (id: string): Draggable[] => {
      const d = this.slices.get(id)?.drag;
      return d ? [d] : [];
    };
    const item = (r: HintRef): HintItem[] => {
      if ('slice' in r) return drag(r.slice);
      const bowl = this.bowls.get(r.bowl);
      return bowl ? [bowl] : [];
    };
    return { correct: correct.flatMap(drag), distractors: distractors.flatMap(item), target: this.baseTarget ?? null, action: 'drag' };
  }

  /** The oven step: ring and hand on the oven, nothing dimmed. */
  private ovenStep(): HintStep {
    return { correct: [this.ovenItem], distractors: [], target: null, action: 'tap' };
  }
}
