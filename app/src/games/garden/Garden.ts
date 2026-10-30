// Trồng cây (2026-10-30, spec-trong-cay): a yard game (the yard's `garden` corner, "Vườn"). Free play from the start
// (MiniGameBase.startFreePlay, like the band): no rounds, no score, no right or wrong, taps only. Xoài taps one of two
// seed packets; the seed drops into the soil and a sprout pops up. Each tap on the watering can grows the plant one
// stage (sprout → small → flowers → fruit). A tapped fruit hops to the chibi Shiba (wearing the Tủ đồ outfit), who eats it
// with that fruit's own reaction and a flourish. After the last fruit the plant fades back into the soil and two new
// packets appear. One small surprise per plant (a worm, a butterfly, a giant fruit, a rainbow). Home goes back to the
// yard (`round:leave`); a half-grown plant is kept (`leaveSnapshot`) and comes back on the next visit.
// The scene only wires Phaser: the plate, the plant (one image per stage frame, all rendered on the soil spot), the
// fruits / packets / particles (drawn by their trimmed centre at their anchors), the can (drawn where it rests), Shiba
// with its outfit layers (core/outfit-layers), the tap targets (circles from the frames; Shiba's hull), tweens, and the
// pure controller (cycle.ts) that decides everything.
import type { GameObjects } from 'phaser';
import { ATLASES, BACKGROUNDS } from '../../content/assets';
import {
  ANCHORS,
  CAN_FRAME,
  CHOOSE_LINE,
  FRUITS,
  FRUIT_IDS,
  FRUITS_PER_PLANT,
  GIANT_FRUIT,
  HITS,
  MOTION,
  PACKET_SLOTS,
  PARTICLES,
  PICK_LINE,
  PROMPT_LINE,
  RAINBOW_FRAME,
  REACTIONS,
  SFX,
  WATER_LINE,
  flowerAnchor,
  fruitAnchor,
  fruitFrame,
  hitRadius,
  packetAnchor,
  packetFrame,
  plantFrame,
  shibaFrame,
  type CorrectReaction,
  type EatReaction,
  type FruitId,
  type StageId,
  type SurpriseId,
} from '../../content/games/garden';
import type { Snapshot } from '../../content/types';
import type { Point, ScreenLayout } from '../../content/layout-types';
import { LAYOUTS } from '../../content/layouts';
import { audio } from '../../core/audio-director';
import { bus } from '../../core/bus';
import { pointInPolygon } from '../../core/input/polygon';
import { createTapRouter } from '../../core/input/tap-router';
import { createTapTarget } from '../../core/input/tap-target';
import { attachOutfit, type LayerImage, type OutfitLayers } from '../../core/outfit-layers';
import { ProgressStore } from '../../core/progress-store';
import type { ReactionSet } from '../../core/reactions';
import { prefersReducedMotion } from '../../core/reduced-motion';
import { mulberry32, questionSeed } from '../../core/rng';
import { Tokens } from '../../core/tokens';
import { originFor, type TrimmedRect } from '../../core/ui/sprite-pivot';
import { MiniGameBase } from '../mini-game-base';
import {
  ALL_FRUITS,
  ALL_SURPRISES,
  createGardenController,
  createPacketBag,
  createShuffleBag,
  resumeGarden,
  type GardenController,
  type GardenProgress,
  type HintTarget,
  type PacketBag,
  type PlantState,
  type ShuffleBag,
} from './cycle';

interface FrameData {
  readonly spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

const SINE = 'Sine.easeInOut';
const EASE_OUT = 'Quad.easeOut';
const BACK_OUT = 'Back.easeOut';
/** Draw order, back to front. */
const LAYERS = ['rainbow', 'plant', 'worm', 'fruit', 'packet', 'can', 'shiba', 'particle', 'butterfly', 'held'] as const;
const Depth = Object.fromEntries(LAYERS.map((l, i) => [l, i + 1])) as Record<(typeof LAYERS)[number], number>;
/** The wag flourish: steps in fractions of its angle, each an equal share of the time. */
const WAG_STEPS = [1, -1, 1, 0] as const;
/** The reaction sounds as a fruit's reaction starts (the sour shiver is silent). */
export const REACT_SFX: Readonly<Partial<Record<EatReaction, string>>> = { yum: SFX.giggle, spit: SFX.pop, squirt: SFX.pop };

interface Placed {
  readonly image: GameObjects.Image | undefined;
  readonly at: Point;
  readonly r: number;
}

export class Garden extends MiniGameBase<'garden'> {
  /** The session's bags (static: a visit restarts the scene; the packets and surprises go on across visits). */
  private static packets: PacketBag | undefined;
  private static surprises: ShuffleBag<SurpriseId> | undefined;
  /** Tests: a fresh session. */
  static resetSession(): void {
    Garden.packets = undefined;
    Garden.surprises = undefined;
  }

  private layout: ScreenLayout = LAYOUTS.garden;
  private ctl: GardenController | undefined;
  private warned = new Set<string>();
  private plantImg: GameObjects.Image | undefined;
  private fruits: (GameObjects.Image | undefined)[] = [];
  private packetImgs: (GameObjects.Image | undefined)[] = [];
  private can: Placed | undefined;
  private shiba: GameObjects.Image | undefined;
  private shibaLayers: OutfitLayers | undefined;
  private shibaAt: Point = { x: 0, y: 0 };
  private butterfly: GameObjects.Image | undefined;
  /** Shiba's frame animation token: a newer animation cancels the pending frames of an older one. */
  private shibaSeq = 0;
  /** The last line this game made the Speaker prompt (cleared on shutdown, and only it). */
  private prompt: string | undefined;
  private rand: () => number = Math.random;
  /** Half the longest fruit frame (design px): the fruit tap circles. */
  private fruitHalf = 0;

  constructor() {
    super('garden');
  }

  protected override reactionSet(): ReactionSet {
    return REACTIONS;
  }

  protected build(): void {
    // No round, no score: free play from the start (Home → round:leave, back to the yard).
    this.startFreePlay();
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS.garden;
    this.plantImg = undefined;
    this.fruits = [];
    this.packetImgs = [];
    this.can = undefined;
    this.shiba = undefined;
    this.shibaLayers = undefined;
    this.butterfly = undefined;
    this.rand = mulberry32(this.seed >>> 0);
    const resume = resumeGarden(this.resumeAt, FRUITS_PER_PLANT);
    if (this.resumeAt && !resume) console.warn('garden: bad resume — fresh soil');
    Garden.packets ??= createPacketBag(ALL_FRUITS, mulberry32(questionSeed(this.seed, 1)));
    Garden.surprises ??= createShuffleBag(ALL_SURPRISES, mulberry32(questionSeed(this.seed, 2)));

    const rs = this.layout.renderScale;
    const bg = BACKGROUNDS.garden;
    if (this.textures.exists(bg.key)) this.add.image(0, 0, bg.key).setOrigin(0).setScale(1 / rs);
    else this.warnOnce(bg.key, `garden: texture "${bg.key}" is missing — plate skipped`);

    const router = createTapRouter(this);
    this.addShiba();
    this.addCan();
    this.addPackets();
    this.addFruits();

    const ctl = createGardenController({
      fruits: FRUITS,
      fruitsPerPlant: FRUITS_PER_PLANT,
      packets: Garden.packets,
      surprises: Garden.surprises,
      resume,
      lines: { prompt: PROMPT_LINE, choose: CHOOSE_LINE, water: WATER_LINE, pick: PICK_LINE },
      sounds: { pour: SFX.pour, pop: SFX.pop, woof: SFX.woof, react: REACT_SFX },
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
        showPackets: (offer, ms) => this.showPackets(offer, ms),
        plant: (fruit, i, ms) => this.plant(fruit, i, ms),
        water: (fruit, stage, giant, ms) => this.water(fruit, stage, giant, ms),
        surprise: (id, fruit, ms) => this.surprise(id, fruit, ms),
        eat: (fruit, i, reaction, bites, ms) => this.eat(fruit, i, reaction, bites, ms),
        flourish: (id) => this.flourish(id),
        clear: (ms) => this.clearPlant(ms),
        hint: (target) => this.hintAt(target),
        nudgeCan: () => this.nudge(this.can?.image),
        tapShiba: () => this.squash(),
        restore: (state) => this.restore(state),
      },
      pick: (kind) => this.pickReaction(kind),
    });
    this.ctl = ctl;

    // Taps: each target is live only in its turn (the packets while choosing, a fruit while it hangs on the plant).
    router.onAnyTap = () => ctl.anyTap();
    const circle = (p: Point, c: Placed): boolean => Math.hypot(p.x - c.at.x, p.y - c.at.y) <= c.r;
    const can = this.can;
    if (can) createTapTarget(router, { area: { contains: (p) => circle(p, can) }, onPress: () => this.ctl?.tapCan() });
    this.packetSpots().forEach((spot, i) => {
      if (!spot) return;
      createTapTarget(router, { area: { contains: (p) => this.ctl?.phase === 'choose' && circle(p, spot) }, onPress: () => this.ctl?.tapPacket(i) });
    });
    this.fruitSpots().forEach((spot, n) => {
      if (!spot) return;
      createTapTarget(router, { area: { contains: (p) => this.ctl?.phase === 'fruit' && (this.ctl?.left.includes(n) ?? false) && circle(p, { ...spot, r: this.fruitRadius(n) }) }, onPress: () => this.ctl?.tapFruit(n) });
    });
    const hull = this.layout.hits[HITS.shiba];
    if (hull) createTapTarget(router, { area: { contains: (p) => pointInPolygon(p, hull) }, onPress: () => this.ctl?.tapShiba() });
    else this.warnOnce('hit.shiba', `garden: hit "${HITS.shiba}" is missing from the layout`);
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

  protected progress(): GardenProgress {
    return this.ctl?.progress() ?? { questionIndex: 0, partial: { offer: [], kind: null, waterings: 0, left: [], surprise: null } };
  }

  /** Home with a plant growing: it is kept (Map stores the snapshot) and comes back next time; bare soil keeps nothing. */
  protected override leaveSnapshot(): Snapshot<'garden'> | undefined {
    return this.ctl?.hasPlant ? this.snapshot() : undefined;
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
    if (!a) this.warnOnce(`anchor.${id}`, `garden: anchor "${id}" is missing from the layout`);
    return a;
  }

  private hasFrame(frame: string): boolean {
    const key = ATLASES.garden.key;
    return this.textures.exists(key) && this.textures.get(key).has(frame);
  }

  /** The trimmed rect of a frame in design px. */
  private frameRect(frame: string): TrimmedRect | undefined {
    if (!this.hasFrame(frame)) {
      this.warnOnce(frame, `garden: frame "${frame}" is missing`);
      return undefined;
    }
    const ss = (this.textures.get(ATLASES.garden.key).get(frame).customData as FrameData | undefined)?.spriteSourceSize;
    const rs = this.layout.renderScale;
    return ss ? { x: ss.x / rs, y: ss.y / rs, width: ss.w / rs, height: ss.h / rs } : undefined;
  }

  /** A full-frame image of `frame` whose design point `pivot` is its origin, drawn at `at`. */
  private pivoted(frame: string, pivot: Point, at: Point): GameObjects.Image | undefined {
    if (!this.frameRect(frame)) return undefined;
    const o = originFor(pivot, this.layout.design);
    return this.add.image(at.x, at.y, ATLASES.garden.key, frame).setScale(1 / this.layout.renderScale).setOrigin(o.x, o.y);
  }

  /** `frame` drawn with its trimmed centre on `at` (a fruit, a packet, a particle), at `scale` of its rendered size. */
  private centred(frame: string, at: Point, scale = 1): GameObjects.Image | undefined {
    const rect = this.frameRect(frame);
    if (!rect) return undefined;
    return this.pivoted(frame, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, at)?.setScale(scale / this.layout.renderScale);
  }

  /** Re-points a centred image at another frame (the packets show other fruits each cycle), keeping it centred on `at`. */
  private recentre(img: GameObjects.Image | undefined, frame: string, at: Point): void {
    const rect = this.frameRect(frame);
    if (!img || !rect) return;
    const o = originFor({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, this.layout.design);
    img.setFrame(frame).setOrigin(o.x, o.y).setPosition(at.x, at.y);
  }

  private longest(frames: readonly string[]): number {
    let most = 0;
    for (const f of frames) {
      const r = this.frameRect(f);
      if (r) most = Math.max(most, r.width, r.height);
    }
    return most;
  }

  /** Each packet slot's tap circle (undefined: its anchor is missing). */
  private packetSpots(): (Placed | undefined)[] {
    const r = hitRadius(this.longest(FRUIT_IDS.map(packetFrame)) / 2, Tokens.ui.gardenHitMinPx);
    return Array.from({ length: PACKET_SLOTS }, (_, i) => {
      const at = this.layout.anchors[packetAnchor(i)];
      return at ? { image: this.packetImgs[i], at, r } : undefined;
    });
  }

  /** Each fruit spot's tap circle (undefined: its anchor is missing). */
  private fruitSpots(): (Placed | undefined)[] {
    this.fruitHalf = this.longest(FRUIT_IDS.map(fruitFrame)) / 2;
    return Array.from({ length: FRUITS_PER_PLANT }, (_, n) => {
      const at = this.layout.anchors[fruitAnchor(n)];
      return at ? { image: this.fruits[n], at, r: this.fruitRadius(n) } : undefined;
    });
  }

  /** The fruit index drawn giant on the current plant (its surprise is `giant`), if any. */
  private giantIndex(): number | undefined {
    return this.ctl?.surprise === 'giant' ? GIANT_FRUIT : undefined;
  }

  /** Fruit n's tap circle radius now: the giant fruit's is scaled like its drawing (as validateGarden checks it). */
  private fruitRadius(n: number): number {
    const k = n === this.giantIndex() ? Tokens.ui.gardenGiantScale : 1;
    return hitRadius(this.fruitHalf * k, Tokens.ui.gardenHitMinPx);
  }

  /** A fruit image's rest scale (the giant one bigger). */
  private fruitScale(n: number): number {
    return (n === this.giantIndex() ? Tokens.ui.gardenGiantScale : 1) / this.layout.renderScale;
  }

  private fade(img: GameObjects.Image | undefined, alpha: number, ms: number, delay = 0): void {
    if (!img) return;
    this.tweens.add({ targets: img, alpha, duration: Math.max(1, ms), delay, ease: SINE });
  }

  /** A quick squash-and-stretch on the image's own origin (a growth step, a pop in). */
  private pop(img: GameObjects.Image | undefined, base: number, delay = 0): void {
    if (!img) return;
    const k = 1 + this.amp(Tokens.ui.gardenPopScale - 1);
    this.tweens.add({ targets: img, scaleX: base * k, scaleY: base / k, duration: Tokens.Timing.gardenFadeMs, delay, ease: SINE, yoyo: true, onComplete: () => img.setScale(base) });
  }

  // --- the props ---------------------------------------------------------------------------------------------

  private addShiba(): void {
    const at = this.anchor(ANCHORS.shiba);
    if (!at || !this.frameRect(shibaFrame('idle'))) return;
    const o = originFor(at, this.layout.design);
    this.shibaAt = at;
    this.shiba = this.add.image(at.x, at.y, ATLASES.garden.key, shibaFrame('idle')).setOrigin(o.x, o.y).setScale(1 / this.layout.renderScale).setDepth(Depth.shiba);
    this.shibaLayers = attachOutfit(this, this.shiba as unknown as LayerImage, ATLASES.garden.key, ProgressStore.outfit);
  }

  private setShibaFrame(frame: string): void {
    if (!this.hasFrame(frame)) return;
    if (this.shibaLayers) this.shibaLayers.setFrame(frame);
    else this.shiba?.setFrame(frame);
  }

  /** Shiba plays `frames` in turn every gardenFrameMs for `ms`, then sits idle again (a newer animation cancels this one). */
  private animateShiba(frames: readonly string[], ms: number): void {
    const seq = ++this.shibaSeq;
    const step = Tokens.Timing.gardenFrameMs;
    const n = Math.max(1, Math.floor(ms / step));
    for (let k = 0; k < n; k++) {
      this.time.delayedCall(k * step, () => {
        if (seq === this.shibaSeq) this.setShibaFrame(frames[k % frames.length]!);
      });
    }
    this.time.delayedCall(ms, () => {
      if (seq === this.shibaSeq) this.setShibaFrame(shibaFrame('idle'));
    });
  }

  private addCan(): void {
    const rect = this.frameRect(CAN_FRAME);
    if (!rect) return;
    const at = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const image = this.pivoted(CAN_FRAME, at, at)?.setDepth(Depth.can);
    this.can = { image, at, r: hitRadius(Math.max(rect.width, rect.height) / 2, Tokens.ui.gardenHitMinPx) };
  }

  private addPackets(): void {
    for (let i = 0; i < PACKET_SLOTS; i++) {
      const at = this.anchor(packetAnchor(i));
      this.packetImgs.push(at ? this.centred(packetFrame(FRUIT_IDS[i]!), at)?.setDepth(Depth.packet).setAlpha(0) : undefined);
    }
  }

  private addFruits(): void {
    for (let n = 0; n < FRUITS_PER_PLANT; n++) {
      const at = this.anchor(fruitAnchor(n));
      this.fruits.push(at ? this.centred(fruitFrame(FRUIT_IDS[0]), at)?.setDepth(Depth.fruit).setAlpha(0) : undefined);
    }
  }

  /** The plant image at `stage` (one image re-pointed: every stage frame is rendered on the same soil spot). */
  private showPlant(fruit: FruitId, stage: StageId): GameObjects.Image | undefined {
    const frame = plantFrame(fruit, stage);
    const spot = this.anchor(ANCHORS.plant);
    if (!spot || !this.frameRect(frame)) return undefined;
    if (!this.plantImg) this.plantImg = this.pivoted(frame, spot, spot)?.setDepth(Depth.plant);
    else {
      this.tweens.killTweensOf(this.plantImg);
      this.plantImg.setFrame(frame).setScale(1 / this.layout.renderScale).setAlpha(1);
      const o = originFor(spot, this.layout.design);
      this.plantImg.setOrigin(o.x, o.y).setPosition(spot.x, spot.y);
    }
    return this.plantImg;
  }

  /** The fruits of `fruit` shown at `left` (the giant one bigger). */
  private showFruits(fruit: FruitId, left: readonly number[], giant: number | undefined, popMs = 0): void {
    this.fruits.forEach((img, n) => {
      const at = this.layout.anchors[fruitAnchor(n)];
      if (!img || !at) return;
      this.tweens.killTweensOf(img);
      this.recentre(img, fruitFrame(fruit), at);
      const scale = (n === giant ? Tokens.ui.gardenGiantScale : 1) / this.layout.renderScale;
      const on = left.includes(n);
      if (!on || popMs <= 0) {
        img.setScale(scale).setAlpha(on ? 1 : 0);
        return;
      }
      img.setScale(this.reduced ? scale : 0).setAlpha(0);
      this.tweens.add({ targets: img, scale, alpha: 1, duration: popMs, delay: n * popMs * MOTION.stagger, ease: BACK_OUT });
    });
  }

  // --- the controller's view ---------------------------------------------------------------------------------

  /** Two packets pop in over the soil (they fade in only under reduced motion). */
  private showPackets(offer: readonly FruitId[], ms: number): void {
    this.packetImgs.forEach((img, i) => {
      const at = this.layout.anchors[packetAnchor(i)];
      const fruit = offer[i];
      if (!img || !at || !fruit) return;
      this.tweens.killTweensOf(img);
      this.recentre(img, packetFrame(fruit), at);
      const s = 1 / this.layout.renderScale;
      img.setAngle(0).setAlpha(0).setScale(this.reduced ? s : s * MOTION.packetFromScale);
      this.tweens.add({ targets: img, alpha: 1, scale: s, duration: ms, delay: i * ms * MOTION.stagger, ease: BACK_OUT });
    });
  }

  /** The chosen packet shakes its seed out: the other fades; the seed drops into the soil; the sprout pops up. */
  private plant(fruit: FruitId, index: number, ms: number): void {
    const chosen = this.packetImgs[index];
    const spot = this.anchor(ANCHORS.plant);
    this.packetImgs.forEach((img, i) => {
      if (img && i !== index) this.fade(img, 0, ms * MOTION.plant.otherFade);
    });
    if (chosen) {
      this.tweens.killTweensOf(chosen);
      this.tweens.add({ targets: chosen, angle: this.amp(MOTION.plant.tiltDeg), duration: ms * MOTION.plant.tilt, ease: SINE });
      this.fade(chosen, 0, ms * MOTION.plant.chosenFade, ms * MOTION.plant.chosenFadeAt);
    }
    const from = chosen ? { x: chosen.x, y: chosen.y } : spot;
    if (from && spot) {
      const seed = this.centred(PARTICLES.seed, from)?.setDepth(Depth.particle).setAlpha(0);
      if (seed) {
        this.tweens.chain({
          targets: seed,
          tweens: [
            { alpha: 1, duration: ms * MOTION.plant.seedIn, delay: ms * MOTION.plant.seedInAt, ease: SINE },
            { y: spot.y, x: spot.x, duration: ms * MOTION.plant.seedFall, ease: 'Quad.easeIn' },
            { alpha: 0, duration: ms * MOTION.plant.seedOut, ease: SINE, onComplete: () => seed.destroy() },
          ],
        });
      }
    }
    const img = this.showPlant(fruit, 'sprout');
    if (img) {
      const s = 1 / this.layout.renderScale;
      img.setAlpha(0);
      this.time.delayedCall(ms * MOTION.growPopAt, () => {
        img.setAlpha(1).setScale(s, this.reduced ? s : s * MOTION.sproutFromScale);
        this.tweens.add({ targets: img, scaleY: s, duration: ms * (1 - MOTION.growPopAt), ease: BACK_OUT });
      });
    }
  }

  /** One watering: the can flies over the soil, tilts and pours; the plant crossfades to `stage` with a pop; the can goes back. */
  private water(fruit: FruitId, stage: StageId, giant: number | undefined, ms: number): void {
    const T = Tokens.Timing;
    const can = this.can;
    const pour = this.anchor(ANCHORS.pour);
    const fly = Math.min(T.gardenCanFlyMs, ms * MOTION.canFlyShare);
    if (can?.image && pour) {
      const img = can.image;
      this.tweens.killTweensOf(img);
      img.setPosition(can.at.x, can.at.y).setAngle(0).setScale(1 / this.layout.renderScale);
      const tilt = this.amp(Tokens.ui.gardenPourDeg);
      this.tweens.chain({
        targets: img,
        tweens: [
          { x: pour.x, y: pour.y, duration: fly, ease: EASE_OUT },
          { angle: tilt, duration: fly, ease: SINE },
          { angle: tilt, duration: Math.max(1, ms - MOTION.canFlights * fly) },
          { angle: 0, duration: fly / 2, ease: SINE },
          { x: can.at.x, y: can.at.y, duration: fly * MOTION.canBackFlights, ease: EASE_OUT },
        ],
      });
      this.drops(ms - MOTION.dropsSpanFlights * fly, MOTION.dropsAfterFlights * fly);
    }
    // The butterfly that sat on the flowers flies off as the plant grows on.
    this.flyAwayButterfly(fly);
    const at = ms * MOTION.growPopAt;
    this.time.delayedCall(at, () => {
      const img = this.showPlant(fruit, stage);
      this.pop(img, 1 / this.layout.renderScale);
      // The staggered pop-in ends with the watering (a fruit tapped right after it is full size).
      const popMs = (ms - at) / (1 + (FRUITS_PER_PLANT - 1) * MOTION.stagger);
      if (stage === 'fruit') this.showFruits(fruit, Array.from({ length: FRUITS_PER_PLANT }, (_, n) => n), giant, popMs);
    });
  }

  /** Water drops fall from the spout over `spanMs` from `delay` (they only fade when reduced). */
  private drops(spanMs: number, delay: number): void {
    const spout = this.anchor(ANCHORS.spout);
    const plant = this.layout.anchors[ANCHORS.plant];
    if (!spout) return;
    const u = Tokens.ui;
    const fall = this.reduced ? 0 : plant ? Math.max(0, plant.y - spout.y) : u.gardenDropFallPx;
    for (let i = 0; i < u.gardenDrops; i++) {
      const p = { x: spout.x + (this.rand() * 2 - 1) * u.gardenDropSpreadPx, y: spout.y };
      const d = this.centred(PARTICLES.drop, p, u.gardenDropScale)?.setDepth(Depth.particle).setAlpha(0);
      if (!d) return;
      const dropMs = Math.max(1, spanMs / 2);
      this.tweens.chain({
        targets: d,
        tweens: [
          { alpha: 1, duration: dropMs * MOTION.dropIn, delay: delay + (i * spanMs) / (2 * u.gardenDrops), ease: SINE },
          { alpha: 0, y: p.y + fall, duration: dropMs, ease: 'Quad.easeIn', onComplete: () => d.destroy() },
        ],
      });
    }
  }

  private surprise(id: Exclude<SurpriseId, 'giant'>, fruit: FruitId, ms: number): void {
    if (id === 'worm') this.worm(ms);
    else if (id === 'butterfly') this.butterflyLands(fruit, ms);
    else this.rainbow(ms);
  }

  /** The worm peeks out of the soil, looks around and ducks back. */
  private worm(ms: number): void {
    const at = this.anchor(ANCHORS.worm);
    if (!at) return;
    const rise = this.amp(Tokens.ui.gardenWormRisePx);
    const w = this.centred(PARTICLES.worm, { x: at.x, y: at.y + rise }, 1)?.setDepth(Depth.worm).setAlpha(0);
    if (!w) return;
    const s = 1 / this.layout.renderScale;
    this.tweens.chain({
      targets: w,
      tweens: [
        { alpha: 1, y: at.y - rise / 2, duration: ms * MOTION.worm.rise, ease: BACK_OUT },
        { angle: this.amp(MOTION.worm.deg), duration: ms * MOTION.worm.look, ease: SINE },
        { angle: -this.amp(MOTION.worm.deg), duration: ms * MOTION.worm.lookBack, ease: SINE },
        { angle: 0, scaleY: s, duration: ms * MOTION.worm.settle, ease: SINE },
        { alpha: 0, y: at.y + rise, duration: ms * MOTION.worm.duck, ease: 'Quad.easeIn', onComplete: () => w.destroy() },
      ],
    });
  }

  /** A butterfly flutters in and lands on the flowers; it stays (wings slowly opening and closing) until the plant grows on. */
  private butterflyLands(fruit: FruitId, ms: number): void {
    const at = this.anchor(flowerAnchor(fruit));
    if (!at) return;
    this.flyAwayButterfly(0);
    const off = Tokens.ui.gardenButterflyFromPx;
    const scale = Tokens.ui.gardenButterflyScale;
    const from = this.reduced ? at : { x: at.x - off, y: at.y - off / 2 };
    const b = this.centred(PARTICLES.butterfly, from, scale)?.setDepth(Depth.butterfly).setAlpha(0);
    if (!b) return;
    this.butterfly = b;
    this.tweens.add({ targets: b, x: at.x, y: at.y, alpha: 1, duration: ms * MOTION.butterflyIn, ease: SINE });
    // Flapping: the wing frames swap (a slow flap once landed; none under reduced motion).
    const frames = [PARTICLES.butterflyFlap, PARTICLES.butterfly];
    const step = Tokens.Timing.gardenFrameMs;
    if (this.reduced) return;
    let k = 0;
    const flap = (): void => {
      if (this.butterfly !== b || !b.active) return;
      this.recentre(b, frames[k++ % 2]!, { x: b.x, y: b.y });
      this.time.delayedCall(k * step < ms ? step : step * MOTION.butterflyRestSteps, flap);
    };
    flap();
  }

  private flyAwayButterfly(ms: number): void {
    const b = this.butterfly;
    if (!b) return;
    this.butterfly = undefined;
    this.tweens.killTweensOf(b);
    const off = Tokens.ui.gardenButterflyFromPx;
    if (ms <= 0) {
      b.destroy();
      return;
    }
    this.tweens.add({ targets: b, x: b.x + off, y: b.y - off, alpha: 0, duration: ms * MOTION.butterflyAwayFades, ease: SINE, onComplete: () => b.destroy() });
  }

  /** A little rainbow fades in over the bed and out again. */
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

  /** The fruit hops to Shiba's mouth; Shiba chews it (its cheeks puffed on a giant bite); then the fruit's own reaction. */
  private eat(_fruit: FruitId, index: number, reaction: EatReaction, bites: number, ms: number): void {
    const T = Tokens.Timing;
    const img = this.fruits[index];
    const mouth = this.anchor(ANCHORS.mouth);
    if (img && mouth) {
      this.tweens.killTweensOf(img);
      img.setDepth(Depth.held);
      const from = { x: img.x, y: img.y };
      const lift = this.amp(Tokens.ui.gardenHopPx * 2);
      const s0 = img.scaleX;
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: T.gardenPickMs,
        ease: SINE,
        onUpdate: (tw) => {
          const v = tw.getValue() ?? 0;
          img.setPosition(from.x + (mouth.x - from.x) * v, from.y + (mouth.y - from.y) * v - Math.sin(Math.PI * v) * lift);
        },
      });
      // Each bite takes a piece: the fruit shrinks, then it is gone.
      for (let b = 0; b < bites; b++) {
        const k = 1 - ((b + 1) / bites) * (1 - Tokens.ui.gardenBiteScale);
        this.time.delayedCall(T.gardenPickMs + b * T.gardenBiteMs + T.gardenBiteMs / 2, () => img.setScale(s0 * k));
      }
      this.time.delayedCall(T.gardenPickMs + bites * T.gardenBiteMs, () => {
        img.setAlpha(0).setDepth(Depth.fruit);
      });
    }
    // Shiba: the bites (a giant bite puffs its cheeks), then the reaction.
    const chew = [shibaFrame('chew', 0), shibaFrame('chew', 1)];
    const giant = bites > 1;
    this.time.delayedCall(T.gardenPickMs, () => this.animateShiba(giant ? [shibaFrame('puff'), ...chew] : chew, bites * T.gardenBiteMs));
    const reactAt = T.gardenPickMs + bites * T.gardenBiteMs;
    const reactMs = ms - reactAt;
    this.time.delayedCall(reactAt, () => this.fruitReaction(reaction, reactMs));
  }

  /** A fruit's own reaction: a happy lick, spat pips, a squirt of juice, or the sour scrunch with a shiver. */
  private fruitReaction(reaction: EatReaction, ms: number): void {
    const mouth = this.layout.anchors[ANCHORS.mouth];
    const happy = [shibaFrame('happy', 0), shibaFrame('happy', 1)];
    switch (reaction) {
      case 'yum':
        this.animateShiba(happy, ms);
        return;
      case 'spit':
        this.animateShiba([shibaFrame('chew', 1), ...happy], ms);
        if (mouth) this.burst(PARTICLES.pip, mouth, Tokens.ui.gardenPips, ms / 2, -1);
        return;
      case 'squirt':
        this.animateShiba(happy, ms);
        if (mouth) this.burst(PARTICLES.juice, mouth, Tokens.ui.gardenJuiceDrops, ms / 2, 0);
        return;
      case 'sour': {
        this.animateShiba([shibaFrame('sour', 0), shibaFrame('sour', 1)], ms);
        const img = this.shiba;
        if (!img || this.reduced) return;
        const x = this.shibaAt.x;
        const n = Tokens.ui.gardenShivers;
        this.tweens.add({ targets: img, x: x + Tokens.ui.gardenShiverPx, duration: ms / (MOTION.shiverSplit * n), ease: SINE, yoyo: true, repeat: 2 * n - 1, delay: ms * MOTION.shiverAt, onComplete: () => img.setX(x) });
        return;
      }
      default: {
        const unknown: never = reaction;
        console.warn(`garden: no routine for reaction "${String(unknown)}"`);
      }
    }
  }

  /** `count` particles fly out of `from` (toward `dir`: −1 left, 0 all round) and fall (they only fade when reduced). */
  private burst(frame: string, from: Point, count: number, ms: number, dir: number): void {
    const u = Tokens.ui;
    for (let i = 0; i < count; i++) {
      const a = dir < 0 ? Math.PI * (MOTION.spitFrom + (MOTION.spitSpread * i) / Math.max(1, count - 1)) : (2 * Math.PI * i) / count - Math.PI / 2;
      const reach = this.reduced ? 0 : u.gardenSpitPx * (dir < 0 ? 1 : MOTION.juiceReach);
      const p = this.centred(frame, from, u.gardenParticleScale)?.setDepth(Depth.particle);
      if (!p) return;
      this.tweens.add({
        targets: p,
        x: from.x + Math.cos(a) * reach,
        y: from.y + Math.sin(a) * reach + (this.reduced ? 0 : u.gardenDropFallPx / 2),
        alpha: 0,
        duration: ms,
        delay: (i * ms * MOTION.stagger) / count,
        ease: EASE_OUT,
        onComplete: () => p.destroy(),
      });
    }
  }

  /** The correct flourish after a fruit: a hop, a wag on its seat, or hearts floating up. */
  private flourish(id: string | undefined): void {
    const img = this.shiba;
    const kind = id as CorrectReaction | undefined;
    const ms = Tokens.Timing.gardenFlourishMs;
    switch (kind) {
      case 'wag': {
        this.animateShiba([shibaFrame('happy', 0), shibaFrame('happy', 1)], ms);
        if (!img) return;
        const deg = this.amp(Tokens.ui.gardenWagDeg);
        this.tweens.chain({ targets: img, tweens: WAG_STEPS.map((k) => ({ angle: k * deg, duration: ms / WAG_STEPS.length, ease: SINE })) });
        return;
      }
      case 'hearts': {
        const mouth = this.layout.anchors[ANCHORS.mouth];
        if (!mouth) return;
        const u = Tokens.ui;
        for (let i = 0; i < u.gardenHearts; i++) this.floatUp(PARTICLES.heart, { x: mouth.x + (i - (u.gardenHearts - 1) / 2) * MOTION.heartsApartPx, y: mouth.y - MOTION.heartsAbovePx }, u.gardenHeartScale, (i * ms) / (2 * u.gardenHearts));
        return;
      }
      case 'hop':
      case undefined: {
        if (!img) return;
        const y = this.shibaAt.y;
        this.tweens.add({ targets: img, y: y - this.amp(Tokens.ui.gardenHopPx), duration: ms / 2, ease: EASE_OUT, yoyo: true, onComplete: () => img.setY(y) });
        return;
      }
      default: {
        const unknown: never = kind;
        console.warn(`garden: no routine for reaction "${String(unknown)}"`);
      }
    }
  }

  /** A heart or a sparkle floats up from `at` and fades (it only fades when reduced). */
  private floatUp(frame: string, at: Point, scale: number, delay = 0): void {
    const img = this.centred(frame, at, scale)?.setDepth(Depth.particle).setAlpha(0);
    if (!img) return;
    const rise = this.reduced ? 0 : Tokens.ui.gardenFloatRisePx;
    const half = Tokens.Timing.gardenFloatMs / 2;
    this.tweens.chain({
      targets: img,
      tweens: [
        { alpha: 1, y: at.y - rise / 2, duration: half, delay, ease: SINE },
        { alpha: 0, y: at.y - rise, duration: half, ease: SINE, onComplete: () => img.destroy() },
      ],
    });
  }

  /** The eaten plant fades back into the soil (a little shrink on its roots). */
  private clearPlant(ms: number): void {
    const img = this.plantImg;
    this.flyAwayButterfly(ms * MOTION.clearButterfly);
    for (const f of this.fruits) if (f) f.setAlpha(0);
    if (!img) return;
    this.tweens.killTweensOf(img);
    const s = 1 / this.layout.renderScale;
    this.tweens.add({ targets: img, alpha: 0, scaleY: this.reduced ? s : s * MOTION.clearToScale, duration: ms, ease: SINE });
  }

  /** The idle hint: the packets, the can or one fruit bounce. */
  private hintAt(target: HintTarget): void {
    if (target.kind === 'packets') this.packetImgs.forEach((img) => this.bounce(img));
    else if (target.kind === 'can') this.bounce(this.can?.image);
    else this.bounce(this.fruits[target.index], this.fruitScale(target.index));
  }

  /** A bounce from the image's rest scale `base` (never its current, maybe mid-bounce, scale). */
  private bounce(img: GameObjects.Image | undefined, base = 1 / this.layout.renderScale): void {
    if (!img) return;
    this.tweens.killTweensOf(img);
    img.setScale(base);
    this.tweens.add({ targets: img, scale: base * (1 + this.amp(Tokens.ui.gardenHintBounce - 1)), duration: Tokens.Timing.gardenTapMs / 2, ease: SINE, yoyo: true, repeat: 1, onComplete: () => img.setScale(base) });
  }

  /** A thing tapped out of its turn: a small wiggle. */
  private nudge(img: GameObjects.Image | undefined): void {
    if (!img) return;
    const deg = this.amp(Tokens.ui.gardenWagDeg);
    this.tweens.chain({ targets: img, tweens: WAG_STEPS.map((k) => ({ angle: k * deg, duration: Tokens.Timing.gardenTapMs / WAG_STEPS.length, ease: SINE })) });
  }

  /** Shiba tapped: a small squash on its seat. */
  private squash(): void {
    const img = this.shiba;
    if (!img) return;
    const s = 1 / this.layout.renderScale;
    const k = 1 + this.amp(Tokens.ui.gardenTapSquash - 1);
    this.tweens.add({ targets: img, scaleX: s * k, scaleY: s / k, duration: Tokens.Timing.gardenTapMs / 2, ease: SINE, yoyo: true, onComplete: () => img.setScale(s) });
  }

  /** A resumed plant shows at once (its stage, the fruits still on it). */
  private restore(state: PlantState): void {
    this.packetImgs.forEach((img) => img?.setAlpha(0));
    this.showPlant(state.fruit, state.stage);
    if (state.stage === 'fruit') this.showFruits(state.fruit, state.left, state.giant);
  }
}
