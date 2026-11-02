// Rửa xe (2026-10-30, spec-rua-xe): a yard game (the yard's `car-wash` corner, "Rửa xe"). Free play from the start
// (MiniGameBase.startFreePlay, like the garden): no rounds, no score, no right or wrong. A dirty special vehicle drives
// into the bay and honks; Xoài rubs (or taps) it and foam appears under her finger while the dirt under it goes away;
// once it is foamed she taps the hose: water rinses it, it twinkles, blinks its headlights, honks and drives out, and
// the next car drives in. One small surprise per car (a duck, a sneezed bubble, a rainbow). Home goes back to the yard
// (`round:leave`); a half-washed car is kept (`leaveSnapshot`) and comes back on the next visit.
// The scene only wires Phaser: the plate, the car in a container on its ground pivot (its shadow, the car frame, one
// dirt overlay per spot, the foam pool, the sparkles), the hose (drawn where it hangs), the rub target (press, move,
// lift on the car's hull), the hose's tap circle, tweens, and the pure controller (cycle.ts) that decides everything.
import type { GameObjects } from 'phaser';
import { ATLASES, BACKGROUNDS } from '../../content/assets';
import {
  ANCHORS,
  BAG_SEEDS,
  DIRT_SFX,
  DIRT_SPOTS,
  FOAM_FRAMES,
  HOSE_FRAME,
  MOTION,
  PARTICLES,
  PROMPT_LINE,
  RAINBOW_FRAME,
  REACTIONS,
  RINSE_LINE,
  RUB_LINE,
  SFX,
  VEHICLES,
  carFrame,
  carHit,
  dirtAnchor,
  dirtFrame,
  frontAnchor,
  hitRadius,
  topAnchor,
  type DirtId,
  type SurpriseId,
  type VehicleId,
} from '../../content/games/car-wash';
import type { Snapshot } from '../../content/types';
import type { Point, ScreenLayout } from '../../content/layout-types';
import { LAYOUTS } from '../../content/layouts';
import { audio } from '../../core/audio-director';
import { bus } from '../../core/bus';
import { pointInPolygon } from '../../core/input/polygon';
import { createTapRouter } from '../../core/input/tap-router';
import { createTapTarget } from '../../core/input/tap-target';
import type { ReactionSet } from '../../core/reactions';
import { prefersReducedMotion } from '../../core/reduced-motion';
import { mulberry32, questionSeed } from '../../core/rng';
import { Tokens } from '../../core/tokens';
import { originFor, type TrimmedRect } from '../../core/ui/sprite-pivot';
import { MiniGameBase } from '../mini-game-base';
import {
  ALL_DIRTS,
  ALL_SURPRISES,
  ALL_VEHICLES,
  createCarWashController,
  createShuffleBag,
  resumeCarWash,
  type CarState,
  type CarWashController,
  type CarWashProgress,
  type HintTarget,
  type ShuffleBag,
} from './cycle';

interface FrameData {
  readonly spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

const SINE = 'Sine.easeInOut';
const EASE_OUT = 'Quad.easeOut';
const EASE_IN = 'Quad.easeIn';
const BACK_OUT = 'Back.easeOut';
/** Draw order, back to front. */
const LAYERS = ['rainbow', 'car', 'hose', 'surprise', 'spray'] as const;
const Depth = Object.fromEntries(LAYERS.map((l, i) => [l, i + 1])) as Record<(typeof LAYERS)[number], number>;
/** A wiggle: steps in fractions of its angle, each an equal share of the time. */
const WIGGLE_STEPS = [1, -1, 1, 0] as const;

/** The distance from `p` to the polygon's edges (0 inside). */
function distanceToPolygon(p: Point, poly: readonly Point[]): number {
  if (pointInPolygon(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    const k = len > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + k * dx), p.y - (a.y + k * dy)));
  }
  return best;
}

export class CarWash extends MiniGameBase<'car-wash'> {
  /** The session's bags (static: a visit restarts the scene; the cars, dirt and surprises go on across visits). */
  private static vehicles: ShuffleBag<VehicleId> | undefined;
  private static dirts: ShuffleBag<DirtId> | undefined;
  private static surprises: ShuffleBag<SurpriseId> | undefined;
  /** Tests: a fresh session. */
  static resetSession(): void {
    CarWash.vehicles = undefined;
    CarWash.dirts = undefined;
    CarWash.surprises = undefined;
  }

  private layout: ScreenLayout = LAYOUTS['car-wash'];
  private ctl: CarWashController | undefined;
  private warned = new Set<string>();
  private carAt: Point = { x: 0, y: 0 };
  private box: GameObjects.Container | undefined;
  private car: GameObjects.Image | undefined;
  private dirtImgs: (GameObjects.Image | undefined)[] = [];
  private foamPool: (GameObjects.Image | undefined)[] = [];
  private hose: GameObjects.Image | undefined;
  /** The vehicle drawn in the container now (the controller may already have moved on to the next one). */
  private shown: VehicleId | undefined;
  /** The headlight blink token: a newer frame animation cancels an older one. */
  private lightSeq = 0;
  /** The last line this game made the Speaker prompt (cleared on shutdown, and only it). */
  private prompt: string | undefined;
  private rand: () => number = Math.random;

  constructor() {
    super('car-wash');
  }

  protected override reactionSet(): ReactionSet {
    return REACTIONS;
  }

  protected build(): void {
    // No round, no score: free play from the start (Home → round:leave, back to the yard).
    this.startFreePlay();
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS['car-wash'];
    this.box = undefined;
    this.car = undefined;
    this.dirtImgs = [];
    this.foamPool = [];
    this.hose = undefined;
    this.shown = undefined;
    this.rand = mulberry32(this.seed >>> 0);
    const resume = resumeCarWash(this.resumeAt, DIRT_SPOTS);
    if (this.resumeAt && !resume) console.warn('car-wash: bad resume — a fresh car');
    CarWash.vehicles ??= createShuffleBag(ALL_VEHICLES, mulberry32(questionSeed(this.seed, BAG_SEEDS.vehicles)));
    CarWash.dirts ??= createShuffleBag(ALL_DIRTS, mulberry32(questionSeed(this.seed, BAG_SEEDS.dirts)));
    CarWash.surprises ??= createShuffleBag(ALL_SURPRISES, mulberry32(questionSeed(this.seed, BAG_SEEDS.surprises)));

    const rs = this.layout.renderScale;
    const bg = BACKGROUNDS['car-wash'];
    if (this.textures.exists(bg.key)) this.add.image(0, 0, bg.key).setOrigin(0).setScale(1 / rs);
    else this.warnOnce(bg.key, `car-wash: texture "${bg.key}" is missing — plate skipped`);

    const router = createTapRouter(this);
    this.addCar();
    const hoseSpot = this.addHose();

    const ctl = createCarWashController({
      vehicles: CarWash.vehicles,
      dirts: CarWash.dirts,
      surprises: CarWash.surprises,
      spots: (v) => this.spots(v),
      resume,
      lines: { prompt: PROMPT_LINE, rub: RUB_LINE, rinse: RINSE_LINE, name: (v) => VEHICLES[v].nameLine },
      sounds: { scrub: SFX.scrub, rinse: SFX.rinse, chime: SFX.chime, bubble: SFX.bubble, dirt: DIRT_SFX, honk: (v) => VEHICLES[v].honk },
      audio: {
        sfx: (id) => audio.sfx(id),
        say: (id) => audio.say(id),
        sayChain: (ids) => audio.sayChain(ids),
        setPrompt: (id) => {
          this.prompt = id;
          audio.setPrompt(id);
        },
      },
      view: {
        driveIn: (v, dirt, ms) => this.driveIn(v, dirt, ms),
        skipDrive: () => this.skipDrive(),
        honk: () => this.hop(Tokens.Timing.carWashHonkMs),
        foam: (p, n) => this.foam(p, n),
        cover: (i) => this.fade(this.dirtImgs[i], 0, Tokens.Timing.carWashFoamPopMs * 2),
        wiggle: () => this.wiggle(this.box, Tokens.Timing.carWashWiggleMs),
        foamed: () => this.bounce(this.hose),
        surprise: (id, v, ms) => this.surprise(id, v, ms),
        rinse: (_v, ms) => this.rinse(ms),
        shine: (v, ms) => this.shine(v, ms),
        driveOut: (ms) => this.driveOut(ms),
        hint: (target) => this.hintAt(target),
        nudgeHose: () => this.wiggle(this.hose, Tokens.Timing.carWashTapMs),
        restore: (state) => this.restore(state),
      },
    });
    this.ctl = ctl;

    // Any press restarts the idle clock and skips a long drive.
    router.onAnyTap = () => ctl.anyTap();
    // The rub target: the car's hull (and a little around it, so a stroke that starts just off the car still counts
    // once it reaches it). Foam only where the finger is on the hull. Lifting keeps the foam.
    const rubbing = (): boolean => this.ctl?.phase === 'dirty' || this.ctl?.phase === 'foamed';
    router.add({
      contains: (p) => {
        const hull = this.hull();
        return rubbing() && hull !== undefined && distanceToPolygon(p, hull) <= Tokens.ui.carWashRubPadPx;
      },
      isEnabled: () => true,
      onPress: (p) => {
        if (this.onCar(p)) this.ctl?.press(p);
      },
      onMove: (p) => {
        if (this.onCar(p)) this.ctl?.rub(p);
        else this.ctl?.lift();
      },
      onEnd: () => this.ctl?.lift(),
      onCancel: () => this.ctl?.lift(),
    });
    if (hoseSpot) createTapTarget(router, { circle: hoseSpot, onPress: () => this.ctl?.tapHose() });
    this.attachReactions(router);

    // The parent invitation (at most once a visit; never on a resumed start) waits until the voice is quiet.
    let invitePending = !resume;
    bus.scoped(this).on('speech:ended', () => {
      if (!invitePending || audio.voiceBusy) return;
      invitePending = false;
      this.inviteParent();
    });
    this.events.once('shutdown', () => {
      this.ctl?.stop();
      if (this.prompt !== undefined) audio.clearPrompt(this.prompt);
    });
    ctl.start();
  }

  protected progress(): CarWashProgress {
    return this.ctl?.progress() ?? { questionIndex: 0, partial: { vehicle: '', dirt: '', covered: [], surprise: '' } };
  }

  /** Home with a half-washed car: it is kept (Map stores the snapshot) and comes back next time; otherwise nothing. */
  protected override leaveSnapshot(): Snapshot<'car-wash'> | undefined {
    return this.ctl?.hasProgress ? this.snapshot() : undefined;
  }

  protected override leave(): void {
    this.ctl?.stop();
    super.leave();
  }

  override update(_time: number, delta: number): void {
    // Free play from the start: the controller's own `stop` (Home, shutdown) ends it.
    this.ctl?.tick(delta);
  }

  // --- helpers ---------------------------------------------------------------------------------------------

  private warnOnce(what: string, msg: string): void {
    if (this.warned.has(what)) return;
    this.warned.add(what);
    console.warn(msg);
  }

  private amp(v: number): number {
    return this.reduced ? v * Tokens.ui.reducedMotionAmplitude : v;
  }

  private anchor(id: string): Point | undefined {
    const a = this.layout.anchors[id];
    if (!a) this.warnOnce(`anchor.${id}`, `car-wash: anchor "${id}" is missing from the layout`);
    return a;
  }

  /** Each dirt spot of car `v` at rest (design px; a missing anchor is left out). */
  private spots(v: VehicleId): Point[] {
    const out: Point[] = [];
    for (let n = 0; n < DIRT_SPOTS; n++) {
      const a = this.anchor(dirtAnchor(v, n));
      if (a) out.push(a);
    }
    return out;
  }

  /** The hull of the car at rest now (the rub area). */
  private hull(): readonly Point[] | undefined {
    const v = this.shown;
    return v ? this.layout.hits[carHit(v)] : undefined;
  }

  private onCar(p: Point): boolean {
    const hull = this.hull();
    return hull !== undefined && pointInPolygon(p, hull);
  }

  private hasFrame(frame: string): boolean {
    const key = ATLASES['car-wash'].key;
    return this.textures.exists(key) && this.textures.get(key).has(frame);
  }

  /** The trimmed rect of a frame in design px. */
  private frameRect(frame: string): TrimmedRect | undefined {
    if (!this.hasFrame(frame)) {
      this.warnOnce(frame, `car-wash: frame "${frame}" is missing`);
      return undefined;
    }
    const ss = (this.textures.get(ATLASES['car-wash'].key).get(frame).customData as FrameData | undefined)?.spriteSourceSize;
    const rs = this.layout.renderScale;
    return ss ? { x: ss.x / rs, y: ss.y / rs, width: ss.w / rs, height: ss.h / rs } : undefined;
  }

  /** A full-frame image of `frame` whose design point `pivot` is its origin, drawn at `at`. */
  private pivoted(frame: string, pivot: Point, at: Point): GameObjects.Image | undefined {
    if (!this.frameRect(frame)) return undefined;
    const o = originFor(pivot, this.layout.design);
    return this.add.image(at.x, at.y, ATLASES['car-wash'].key, frame).setScale(1 / this.layout.renderScale).setOrigin(o.x, o.y);
  }

  /** `frame` drawn with its trimmed centre on `at`, at `scale` of its rendered size. */
  private centred(frame: string, at: Point, scale = 1): GameObjects.Image | undefined {
    const rect = this.frameRect(frame);
    if (!rect) return undefined;
    return this.pivoted(frame, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, at)?.setScale(scale / this.layout.renderScale);
  }

  /** Re-points a full-frame image at another frame (same pivot: keep size and origin — the atlas's 0.5/0.5 `pivot`
   *  would otherwise re-centre the full frame on the ground pivot and drop the car below its shadow). */
  private repoint(img: GameObjects.Image | undefined, frame: string): void {
    if (img && this.hasFrame(frame)) img.setFrame(frame, false, false);
  }

  /** A design point at rest → the car container's local point. */
  private local(p: Point): Point {
    return { x: p.x - this.carAt.x, y: p.y - this.carAt.y };
  }

  private fade(img: GameObjects.Image | undefined, alpha: number, ms: number, delay = 0): void {
    if (!img) return;
    this.tweens.add({ targets: img, alpha, duration: Math.max(1, ms), delay, ease: SINE });
  }

  // --- the props ---------------------------------------------------------------------------------------------

  /** The car container on its ground pivot: the shadow, the car, one dirt overlay per spot, the foam pool. */
  private addCar(): void {
    const at = this.anchor(ANCHORS.car);
    if (!at) return;
    this.carAt = at;
    const box = this.add.container(at.x, at.y).setDepth(Depth.car).setAlpha(0);
    this.box = box;
    const zero = { x: 0, y: 0 };
    const shadow = this.centred(PARTICLES.shadow, zero)?.setAlpha(MOTION.shadowAlpha);
    if (shadow) {
      const rect = this.frameRect(PARTICLES.shadow);
      if (rect) shadow.setPosition(rect.x + rect.width / 2 - at.x, rect.y + rect.height / 2 - at.y);
      box.add(shadow);
    }
    const first = ALL_VEHICLES[0]!;
    this.car = this.pivoted(carFrame(first), at, zero);
    if (this.car) box.add(this.car);
    for (let n = 0; n < DIRT_SPOTS; n++) {
      const img = this.pivoted(dirtFrame(first, ALL_DIRTS[0]!, n), at, zero);
      if (img) box.add(img);
      this.dirtImgs.push(img);
    }
    for (let k = 0; k < Tokens.ui.carWashFoamMax; k++) {
      const img = this.centred(FOAM_FRAMES[k % FOAM_FRAMES.length]!, zero)?.setAlpha(0);
      if (img) box.add(img);
      this.foamPool.push(img);
    }
  }

  /** The hose where it hangs; returns its tap circle. */
  private addHose(): { x: number; y: number; r: number } | undefined {
    const rect = this.frameRect(HOSE_FRAME);
    if (!rect) return undefined;
    const at = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    this.hose = this.pivoted(HOSE_FRAME, at, at)?.setDepth(Depth.hose);
    return { ...at, r: hitRadius(Math.max(rect.width, rect.height) / 2, Tokens.ui.carWashHitMinPx) };
  }

  /** The car `v` with its `dirt` on every spot and no foam, its headlights off. */
  private dress(v: VehicleId, dirt: DirtId, covered: readonly number[] = []): void {
    this.shown = v;
    this.lightSeq += 1;
    this.repoint(this.car, carFrame(v));
    this.dirtImgs.forEach((img, n) => {
      if (!img) return;
      this.tweens.killTweensOf(img);
      this.repoint(img, dirtFrame(v, dirt, n));
      img.setAlpha(covered.includes(n) ? 0 : 1);
    });
    for (const f of this.foamPool) {
      if (!f) continue;
      this.tweens.killTweensOf(f);
      f.setAlpha(0);
    }
  }

  // --- the controller's view ---------------------------------------------------------------------------------

  private driveIn(v: VehicleId, dirt: DirtId, ms: number): void {
    const box = this.box;
    this.dress(v, dirt);
    if (!box) return;
    this.tweens.killTweensOf(box);
    const from = this.carAt.x - this.amp(Tokens.ui.carWashDrivePx);
    box.setPosition(from, this.carAt.y).setAngle(0).setScale(1).setAlpha(this.reduced ? 0 : 1);
    this.tweens.add({ targets: box, x: this.carAt.x, alpha: 1, duration: ms, ease: EASE_OUT });
    // It rocks back a little as it brakes.
    const rock = this.amp(MOTION.driveRockDeg);
    this.tweens.chain({
      targets: box,
      tweens: [
        { angle: -rock, duration: ms * (1 - 1 / MOTION.driveBobs), ease: SINE },
        { angle: 0, duration: ms / MOTION.driveBobs, ease: SINE },
      ],
    });
  }

  private skipDrive(): void {
    const box = this.box;
    if (!box) return;
    this.tweens.killTweensOf(box);
    box.setAngle(0).setScale(1);
    // Out of the bay (a drive-out) or at the spot (a drive-in): whichever the car was heading for.
    if (box.x > this.carAt.x) box.setAlpha(0);
    else box.setPosition(this.carAt.x, this.carAt.y).setAlpha(1);
  }

  private driveOut(ms: number): void {
    const box = this.box;
    if (!box) return;
    this.tweens.killTweensOf(box);
    box.setAngle(0).setScale(1);
    this.tweens.add({ targets: box, x: this.carAt.x + this.amp(Tokens.ui.carWashDrivePx), alpha: this.reduced ? 0 : 1, duration: ms, ease: EASE_IN });
  }

  /** A little hop on the spot (the honk, the clean bounce). */
  private hop(ms: number, delay = 0): void {
    const box = this.box;
    if (!box) return;
    const y = this.carAt.y;
    this.tweens.add({ targets: box, y: y - this.amp(Tokens.ui.carWashHopPx), duration: ms / 2, delay, ease: EASE_OUT, yoyo: true, onComplete: () => box.setY(y) });
  }

  /** A foam puff at `p` (one of the pool, reused oldest first), popping in. */
  private foam(p: Point, n: number): void {
    const img = this.foamPool[n % this.foamPool.length];
    if (!img) return;
    const u = Tokens.ui;
    const k = (u.carWashFoamScale + (this.rand() * 2 - 1) * u.carWashFoamJitter) / this.layout.renderScale;
    const q = this.local(p);
    this.tweens.killTweensOf(img);
    const frame = FOAM_FRAMES[n % FOAM_FRAMES.length]!;
    const rect = this.frameRect(frame);
    if (rect) img.setFrame(frame).setOrigin((rect.x + rect.width / 2) / this.layout.design.width, (rect.y + rect.height / 2) / this.layout.design.height);
    img.setPosition(q.x, q.y).setAngle((this.rand() * 2 - 1) * this.amp(Tokens.ui.carWashFoamTiltDeg)).setAlpha(1);
    // Newer puffs sit on top of older ones.
    this.box?.bringToTop(img);
    img.setScale(this.reduced ? k : k * MOTION.foamFromScale);
    this.tweens.add({ targets: img, scale: k, duration: Tokens.Timing.carWashFoamPopMs, ease: BACK_OUT });
  }

  /** A small wiggle (the tickled car, the hose tapped out of its turn). */
  private wiggle(target: GameObjects.Image | GameObjects.Container | undefined, ms: number): void {
    if (!target) return;
    const deg = this.amp(Tokens.ui.carWashWiggleDeg);
    this.tweens.chain({ targets: target, tweens: WIGGLE_STEPS.map((k) => ({ angle: k * deg, duration: ms / WIGGLE_STEPS.length, ease: SINE })) });
  }

  /** A bounce from the rest scale (the hose's invitation and hint, the car's hint). */
  private bounce(target: GameObjects.Image | GameObjects.Container | undefined): void {
    if (!target) return;
    const base = target === this.box ? 1 : 1 / this.layout.renderScale;
    this.tweens.add({
      targets: target,
      scale: base * (1 + this.amp(Tokens.ui.carWashHintBounce - 1)),
      duration: Tokens.Timing.carWashTapMs / 2,
      ease: SINE,
      yoyo: true,
      repeat: 1,
      onComplete: () => target.setScale(base),
    });
  }

  private surprise(id: SurpriseId, v: VehicleId, ms: number): void {
    if (id === 'duck') this.duck(v, ms);
    else if (id === 'bubble') this.sneeze(v, ms);
    else this.rainbow(ms);
  }

  /** A rubber duck pops out of the foam on the roof, wobbles and sinks back. */
  private duck(v: VehicleId, ms: number): void {
    const at = this.anchor(topAnchor(v));
    if (!at) return;
    const rise = this.amp(Tokens.ui.carWashDuckRisePx);
    const d = this.centred(PARTICLES.duck, { x: at.x, y: at.y + rise / 2 })?.setDepth(Depth.surprise).setAlpha(0);
    if (!d) return;
    const deg = this.amp(MOTION.duck.deg);
    const wob = ms * MOTION.duck.wobble;
    this.tweens.chain({
      targets: d,
      tweens: [
        { alpha: 1, y: at.y - rise / 2, duration: ms * MOTION.duck.rise, ease: BACK_OUT },
        ...WIGGLE_STEPS.map((k) => ({ angle: k * deg, duration: wob / WIGGLE_STEPS.length, ease: SINE })),
        { alpha: 0, y: at.y + rise / 2, duration: ms * MOTION.duck.sink, ease: EASE_IN, onComplete: () => d.destroy() },
      ],
    });
    audio.sfx(SFX.bubble);
  }

  /** The car sneezes: a little squash, then a soap bubble floats up from its front and fades (never a pop flash). */
  private sneeze(v: VehicleId, ms: number): void {
    const box = this.box;
    const k = 1 - this.amp(1 - Tokens.ui.carWashSneezeSquash);
    if (box) this.tweens.add({ targets: box, scaleY: k, scaleX: 1 / k, duration: (ms * MOTION.sneezeAt) / 2, ease: SINE, yoyo: true, onComplete: () => box.setScale(1) });
    const at = this.anchor(frontAnchor(v));
    if (!at) return;
    const b = this.centred(PARTICLES.bubble, at, 1)?.setDepth(Depth.surprise).setAlpha(0);
    if (!b) return;
    const s = 1 / this.layout.renderScale;
    b.setScale(this.reduced ? s : s * MOTION.foamFromScale);
    const rise = this.amp(Tokens.ui.carWashBubbleRisePx);
    const up = ms * (1 - MOTION.sneezeAt);
    this.tweens.chain({
      targets: b,
      tweens: [
        { alpha: 1, scale: s, duration: up / 2, delay: ms * MOTION.sneezeAt, ease: EASE_OUT },
        { alpha: 0, y: at.y - rise, duration: up / 2, ease: SINE, onComplete: () => b.destroy() },
      ],
    });
    this.tweens.add({ targets: b, y: at.y - rise / 2, duration: up / 2, delay: ms * MOTION.sneezeAt, ease: SINE });
  }

  /** A little rainbow fades in over the puddle and out again. */
  private rainbow(ms: number): void {
    const rect = this.frameRect(RAINBOW_FRAME);
    if (!rect) return;
    const pivot = { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    const img = this.pivoted(RAINBOW_FRAME, pivot, pivot)?.setDepth(Depth.rainbow).setAlpha(0);
    if (!img) return;
    this.tweens.chain({
      targets: img,
      tweens: [
        { alpha: 1, duration: ms * MOTION.rainbow.in, ease: SINE },
        { alpha: 1, duration: ms * MOTION.rainbow.hold },
        { alpha: 0, duration: ms * MOTION.rainbow.out, ease: SINE, onComplete: () => img.destroy() },
      ],
    });
  }

  /** The rinse: the hose tilts, water sprays across the car left → right, the foam and the dirt wash away. */
  private rinse(ms: number): void {
    const hose = this.hose;
    if (hose) {
      this.tweens.killTweensOf(hose);
      hose.setScale(1 / this.layout.renderScale);
      const tilt = this.amp(Tokens.ui.carWashHoseTiltDeg);
      this.tweens.chain({
        targets: hose,
        tweens: [
          { angle: tilt, duration: ms * MOTION.rinseTilt, ease: SINE },
          { angle: tilt, duration: ms * (1 - 2 * MOTION.rinseTilt) },
          { angle: 0, duration: ms * MOTION.rinseTilt, ease: SINE },
        ],
      });
    }
    this.spray(ms);
    const fadeAt = ms * MOTION.rinseFadeAt;
    const fadeMs = ms - fadeAt;
    for (const f of this.foamPool) {
      if (!f || f.alpha === 0) continue;
      this.tweens.killTweensOf(f);
      this.tweens.add({ targets: f, alpha: 0, y: f.y + this.amp(MOTION.foamSlidePx), duration: fadeMs, delay: fadeAt + this.rand() * fadeMs * MOTION.sparkleStagger, ease: EASE_IN });
    }
    for (const d of this.dirtImgs) this.fade(d, 0, fadeMs, fadeAt);
  }

  /** Water drops fly from the nozzle to points across the car (a sweep, in waves; they only fade when reduced). */
  private spray(ms: number): void {
    const nozzle = this.anchor(ANCHORS.nozzle);
    const hull = this.hull();
    if (!nozzle || !hull) return;
    const xs = hull.map((p) => p.x);
    const ys = hull.map((p) => p.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const u = Tokens.ui;
    const waves = MOTION.sprayWaves;
    const span = ms * (1 - 2 * MOTION.rinseTilt);
    const flight = span / waves;
    for (let w = 0; w < waves; w++) {
      for (let i = 0; i < u.carWashSprayDrops; i++) {
        const share = (w + (i + this.rand()) / u.carWashSprayDrops) / waves;
        const to = { x: x0 + (x1 - x0) * share, y: y0 + (y1 - y0) * (MOTION.sprayBand.from + MOTION.sprayBand.span * this.rand()) };
        const d = this.centred(PARTICLES.drop, nozzle, u.carWashDropScale)?.setDepth(Depth.spray).setAlpha(0);
        if (!d) return;
        // The drop's point leads (it was rendered point up).
        d.setRotation(Math.atan2(to.y - nozzle.y, to.x - nozzle.x) + Math.PI / 2);
        const delay = ms * MOTION.rinseTilt + w * flight + (i * flight) / u.carWashSprayDrops;
        this.tweens.chain({
          targets: d,
          tweens: [
            { alpha: 1, duration: flight * MOTION.rinseTilt, delay, ease: SINE },
            { x: this.reduced ? nozzle.x : to.x, y: this.reduced ? nozzle.y : to.y, alpha: 0, duration: flight, ease: EASE_IN, onComplete: () => d.destroy() },
          ],
        });
      }
    }
  }

  /** The clean car shines: soft twinkles over it (staggered, never together), two headlight blinks, a bounce. */
  private shine(v: VehicleId, ms: number): void {
    const box = this.box;
    const hull = this.layout.hits[carHit(v)];
    const T = Tokens.Timing;
    const u = Tokens.ui;
    if (box && hull) {
      const xs = hull.map((p) => p.x);
      const ys = hull.map((p) => p.y);
      for (let i = 0; i < u.carWashSparkles; i++) {
        const p = { x: Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * this.rand(), y: Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * this.rand() * MOTION.sparkleTop };
        const s = this.centred(PARTICLES.sparkle, this.local(p), u.carWashSparkleScale)?.setAlpha(0);
        if (!s) continue;
        box.add(s);
        const base = u.carWashSparkleScale / this.layout.renderScale;
        s.setScale(base / MOTION.twinkleScale);
        this.tweens.add({
          targets: s,
          alpha: 1,
          scale: this.reduced ? base : base * MOTION.twinkleScale,
          duration: T.carWashTwinkleMs / 2,
          delay: i * ms * MOTION.sparkleStagger,
          ease: SINE,
          yoyo: true,
          onComplete: () => s.destroy(),
        });
      }
    }
    // The headlights blink (each on and off well under 3 Hz).
    const seq = ++this.lightSeq;
    const step = ms / (2 * MOTION.blinks + 1);
    for (let k = 1; k <= 2 * MOTION.blinks; k++) {
      this.time.delayedCall(k * step, () => {
        if (seq === this.lightSeq) this.repoint(this.car, carFrame(v, k % 2 === 1 ? 'lights' : 'clean'));
      });
    }
    this.hop(ms * (1 - MOTION.bounceAt), ms * MOTION.bounceAt);
  }

  /** The idle hint: the car or the hose bounces. */
  private hintAt(target: HintTarget): void {
    this.bounce(target === 'hose' ? this.hose : this.box);
  }

  /** A resumed car shows at once at its rest spot, with a foam puff on each covered spot. */
  private restore(state: CarState): void {
    this.dress(state.vehicle, state.dirt, state.covered);
    this.box?.setPosition(this.carAt.x, this.carAt.y).setAlpha(1);
    const spots = this.spots(state.vehicle);
    state.covered.forEach((i, n) => {
      const p = spots[i];
      if (p) this.foam(p, n);
    });
  }
}
