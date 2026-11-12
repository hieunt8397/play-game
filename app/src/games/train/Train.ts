// Tàu hỏa chở bạn (2026-11-12, spec-tau-hoa): a yard game (the yard's `train` corner, "Tàu hỏa"). Free play from the
// start (MiniGameBase.startFreePlay, like the plane, the garden and the car wash): no rounds, no score, no right or
// wrong. A toy steam train driven by the capped Shiba waits at a little station; a tap and it toots and pulls away.
// The countryside scrolls by itself; at each station a friend waits and a tap on it boards it (the voice names it and
// counts); once a trip the train rides through a tunnel (the scene dims gently; "Ú òa!" as the engine comes out);
// after three friends the destination comes, a tap and the friends hop off and wave, and the train sets off again.
// Taps any time: the engine toots, a car wobbles and the voice names its colour, the cow and the bird react. Home goes
// back to the yard (`round:leave`); a trip with a friend aboard is kept (`leaveSnapshot`) and comes back next time.
// The scene only wires Phaser: the still sky plate, the looping scenery (hills, trees, fences, the ground strip with
// the track), the train (the engine and the cars in containers, the friends seated behind the cars' sides), the
// scrolling things (platforms, the destination, the tunnel's two layers, the cow, the crossing, the bridge), the dim,
// the tap areas, tweens, and the pure model (trip.ts) that owns every position: each frame it draws what the model says.
import type { GameObjects } from 'phaser';
import { ATLASES, BACKGROUNDS } from '../../content/assets';
import {
  ANCHORS,
  BAG_SEEDS,
  BIRD_FRAMES,
  CAR_COLOURS,
  CLOUD_COUNT,
  CLOUD_FRAMES,
  COW_FRAMES,
  DESTINATIONS,
  ENGINE_FRAMES,
  ENGINE_HIT,
  FENCE_FRAME,
  FRIENDS,
  FRIENDS_PER_TRIP,
  GROUND_FRAME,
  HILL_FRAMES,
  MOTION,
  PARTICLES,
  PLATFORM_FRAME,
  PLATFORM_HIT,
  PROMPT_LINE,
  REACTIONS,
  SFX,
  STATION_LINE,
  SURPRISE_FRAMES,
  TREE_FRAMES,
  TUNNEL_FRAMES,
  TUNNEL_LINE,
  WORLD,
  carAnchor,
  carFrame,
  carHit,
  carLine,
  countLine,
  destFrame,
  destHit,
  dropAnchor,
  friendFrame,
  friendHit,
  seatAnchor,
  seatFrame,
  type DestinationId,
  type FriendId,
  type SurpriseId,
} from '../../content/games/train';
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
  ALL_DESTINATIONS,
  ALL_FRIENDS,
  ALL_SURPRISES,
  createShuffleBag,
  createTripController,
  defaultTripSizes,
  resumeTrip,
  type HintTarget,
  type ShuffleBag,
  type Thing,
  type TripController,
  type TripProgress,
  type TripState,
} from './trip';

interface FrameData {
  readonly spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

/** What the engine shows besides running: a toot (a puff over the chimney), a happy driver. */
type EngineMode = 'run' | 'toot' | 'happy';

/** The images of one scrolling thing, each drawn at the thing's x plus its own offset. */
interface ThingImages {
  readonly thing: Thing;
  readonly parts: { img: GameObjects.Image; dx: number }[];
  /** A platform's waiting friend (hidden once it boards); a crossing's car (its wave frame); a bridge's fish. */
  friend?: GameObjects.Image | undefined;
  crossing?: GameObjects.Image | undefined;
  fish?: GameObjects.Image | undefined;
  /** The friends dropped off at a destination (they scroll away with it). */
  dropped: GameObjects.Image[];
}

const SINE = 'Sine.easeInOut';
const EASE_OUT = 'Quad.easeOut';
const EASE_IN = 'Quad.easeIn';
/** Draw order, back to front. */
const LAYERS = ['far', 'cloud', 'hill', 'ground', 'tree', 'fence', 'tunnelBack', 'place', 'friend', 'dropped', 'train', 'tunnelFront', 'near', 'hop', 'particle', 'bird', 'dim'] as const;
const Depth = Object.fromEntries(LAYERS.map((l, i) => [l, i + 1])) as Record<(typeof LAYERS)[number], number>;

export class Train extends MiniGameBase<'train'> {
  /** The session's bags (static: a visit restarts the scene; the friends, destinations and surprises go on across visits). */
  private static friends: ShuffleBag<FriendId> | undefined;
  private static destinations: ShuffleBag<DestinationId> | undefined;
  private static surprises: ShuffleBag<SurpriseId> | undefined;
  /** Tests: a fresh session. */
  static resetSession(): void {
    Train.friends = undefined;
    Train.destinations = undefined;
    Train.surprises = undefined;
  }

  private layout: ScreenLayout = LAYOUTS.train;
  private ctl: TripController | undefined;
  private warned = new Set<string>();
  private engineAt: Point = { x: 0, y: 0 };
  private platformAt: Point = { x: 0, y: 0 };
  private friendAt: Point = { x: 0, y: 0 };
  private destAt: Point = { x: 0, y: 0 };
  private tunnelAt: Point = { x: 0, y: 0 };
  private surpriseAt: Point = { x: 0, y: 0 };
  private cowAt: Point = { x: 0, y: 0 };
  private engineBox: GameObjects.Container | undefined;
  private engineImg: GameObjects.Image | undefined;
  private carBoxes: (GameObjects.Container | undefined)[] = [];
  private seats: (GameObjects.Image | undefined)[] = [];
  private hillImgs: (GameObjects.Image | undefined)[] = [];
  private treeImgs: (GameObjects.Image | undefined)[] = [];
  private fenceImgs: (GameObjects.Image | undefined)[] = [];
  private groundImgs: (GameObjects.Image | undefined)[] = [];
  private cloudImgs: (GameObjects.Image | undefined)[] = [];
  private birdImg: GameObjects.Image | undefined;
  private dimRect: GameObjects.Rectangle | undefined;
  private things = new Map<number, ThingImages>();
  private groundW = 0;
  /** What is drawn now (a frame is re-pointed only when it changes). */
  private engineFrame: string | undefined;
  private birdFrame: string | undefined;
  private mode: EngineMode = 'run';
  private modeLeft = 0;
  private wheelClock = 0;
  private flapClock = 0;
  /** Tweened offsets the scene adds to what the model says: the tapped bird's loop, the tapped cow's hop. */
  private birdLift = { dy: 0 };
  private cowLift = { dy: 0 };
  /** The last line this game made the Speaker prompt (cleared on shutdown, and only it). */
  private prompt: string | undefined;

  constructor() {
    super('train');
  }

  protected override reactionSet(): ReactionSet {
    return REACTIONS;
  }

  protected build(): void {
    // No round, no score: free play from the start (Home → round:leave, back to the yard).
    this.startFreePlay();
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS.train;
    this.engineBox = undefined;
    this.engineImg = undefined;
    this.carBoxes = [];
    this.seats = [];
    this.hillImgs = [];
    this.treeImgs = [];
    this.fenceImgs = [];
    this.groundImgs = [];
    this.cloudImgs = [];
    this.birdImg = undefined;
    this.dimRect = undefined;
    this.things = new Map();
    this.engineFrame = undefined;
    this.birdFrame = undefined;
    this.mode = 'run';
    this.modeLeft = 0;
    this.wheelClock = 0;
    this.flapClock = 0;
    this.birdLift = { dy: 0 };
    this.cowLift = { dy: 0 };
    const resume = resumeTrip(this.resumeAt);
    if (this.resumeAt && !resume) console.warn('train: bad resume — a fresh trip');
    Train.friends ??= createShuffleBag(ALL_FRIENDS, mulberry32(questionSeed(this.seed, BAG_SEEDS.friends)));
    Train.destinations ??= createShuffleBag(ALL_DESTINATIONS, mulberry32(questionSeed(this.seed, BAG_SEEDS.destinations)));
    Train.surprises ??= createShuffleBag(ALL_SURPRISES, mulberry32(questionSeed(this.seed, BAG_SEEDS.surprises)));

    const design = this.layout.design;
    const centre = { x: design.width / 2, y: design.height / 2 };
    this.engineAt = this.anchor(ANCHORS.engine) ?? centre;
    this.platformAt = this.anchor(ANCHORS.platform) ?? centre;
    this.friendAt = this.anchor(ANCHORS.friend) ?? centre;
    this.destAt = this.anchor(ANCHORS.dest) ?? centre;
    this.tunnelAt = this.anchor(ANCHORS.tunnel) ?? centre;
    this.surpriseAt = this.anchor(ANCHORS.surprise) ?? centre;
    this.cowAt = this.anchor(ANCHORS.cow) ?? centre;
    const nose = this.anchor(ANCHORS.nose) ?? centre;
    const tail = this.anchor(ANCHORS.tail) ?? centre;
    const tunnelEnd = this.anchor(ANCHORS.tunnelEnd) ?? this.tunnelAt;

    const rs = this.layout.renderScale;
    const bg = BACKGROUNDS.train;
    if (this.textures.exists(bg.key)) this.add.image(0, 0, bg.key).setOrigin(0).setScale(1 / rs);
    else this.warnOnce(bg.key, `train: texture "${bg.key}" is missing — plate skipped`);

    const router = createTapRouter(this);
    this.addScenery();
    this.addTrain();
    const bleed = MOTION.dimBleedPx;
    const dim = this.add.rectangle(-bleed, -bleed, design.width + 2 * bleed, design.height + 2 * bleed, Tokens.art.train.tunnelInside.value, 1);
    this.dimRect = dim.setOrigin(0).setDepth(Depth.dim).setAlpha(0);

    const cowRect = this.frameRect(COW_FRAMES.idle);
    const ctl = createTripController({
      friends: Train.friends,
      destinations: Train.destinations,
      surprises: Train.surprises,
      rng: mulberry32(questionSeed(this.seed, BAG_SEEDS.world)),
      geometry: {
        width: design.width,
        noseX: nose.x,
        tailX: tail.x,
        platformX: this.platformAt.x,
        destX: this.destAt.x,
        tunnelLen: tunnelEnd.x - this.tunnelAt.x,
        cowY: cowRect ? cowRect.y + cowRect.height / 2 : this.cowAt.y,
        surpriseY: this.surpriseAt.y,
      },
      resume,
      lines: {
        prompt: PROMPT_LINE,
        station: STATION_LINE,
        board: (f) => FRIENDS[f].boardLine,
        count: countLine,
        car: carLine,
        tunnel: TUNNEL_LINE,
        dest: (d) => DESTINATIONS[d].line,
      },
      sounds: {
        toot: SFX.toot,
        chug: SFX.chug,
        puff: SFX.puff,
        hiss: SFX.hiss,
        pop: SFX.pop,
        chime: SFX.chime,
        honk: SFX.honk,
        splash: SFX.splash,
        chirp: SFX.chirp,
        call: (f) => FRIENDS[f].callSfx,
      },
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
        park: () => undefined,
        depart: () => this.show('run', 0),
        skip: () => undefined,
        thingIn: (thing) => this.thingIn(thing),
        thingGone: (id) => this.thingGone(id),
        arrived: (at) => this.arrived(at),
        board: (f, car, ms) => this.board(f, car, ms),
        dropoff: (d, friends, ms, stagger) => this.dropoff(d, friends, ms, stagger),
        toot: () => this.toot(),
        wobble: (n) => this.wobble(n),
        tunnelIn: () => undefined,
        tunnelOut: () => this.show('happy', Tokens.Timing.trainPuffMs),
        passed: (kind) => this.passed(kind),
        sky: (id, ms) => this.sky(id, ms),
        cowTapped: () => this.cowHop(),
        birdTapped: () => this.birdLoop(),
        surpriseTapped: (kind) => this.passed(kind),
        hint: (target) => this.hintAt(target),
        restore: (state) => this.restore(state),
      },
      sizes: defaultTripSizes(this.reduced),
    });
    this.ctl = ctl;

    // Any press restarts the idle clock and skips a long departure or arrival.
    router.onAnyTap = () => ctl.anyTap();
    // The world: the cow, the bird and a ground surprise react to a press (anywhere else nothing happens).
    createTapTarget(router, { area: { contains: () => true }, onPress: (p) => this.ctl?.press(p) });
    // The train, the waiting friend (or its platform) and the destination (their hulls): added after the world, so
    // they win where they overlap it.
    createTapTarget(router, { area: { contains: (p) => this.onHull(p, ENGINE_HIT) }, onPress: () => this.ctl?.tapTrain() });
    CAR_COLOURS.forEach((_, n) => {
      createTapTarget(router, { area: { contains: (p) => this.onHull(p, carHit(n)) }, onPress: () => this.ctl?.tapCar(n) });
    });
    createTapTarget(router, { area: { contains: (p) => this.onFriend(p) }, onPress: () => this.ctl?.tapFriend() });
    createTapTarget(router, { area: { contains: (p) => this.onDest(p) }, onPress: () => this.ctl?.tapDest() });
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
    this.sync(0);
  }

  protected progress(): TripProgress {
    return this.ctl?.progress() ?? { questionIndex: 0, partial: { friends: [], aboard: 0, dest: '', surprise: '', tunnelLeg: 0 } };
  }

  /** Home with a friend aboard: the trip is kept (Map stores the snapshot) and comes back next time; otherwise nothing. */
  protected override leaveSnapshot(): Snapshot<'train'> | undefined {
    return this.ctl?.hasProgress ? this.snapshot() : undefined;
  }

  protected override leave(): void {
    this.ctl?.stop();
    super.leave();
  }

  override update(_time: number, delta: number): void {
    // Free play from the start: the model's own `stop` (Home, shutdown) ends it.
    this.ctl?.tick(delta);
    this.sync(delta);
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
    if (!a) this.warnOnce(`anchor.${id}`, `train: anchor "${id}" is missing from the layout`);
    return a;
  }

  private hasFrame(frame: string): boolean {
    const key = ATLASES.train.key;
    return this.textures.exists(key) && this.textures.get(key).has(frame);
  }

  /** The trimmed rect of a frame in design px. */
  private frameRect(frame: string): TrimmedRect | undefined {
    if (!this.hasFrame(frame)) {
      this.warnOnce(frame, `train: frame "${frame}" is missing`);
      return undefined;
    }
    const ss = (this.textures.get(ATLASES.train.key).get(frame).customData as FrameData | undefined)?.spriteSourceSize;
    const rs = this.layout.renderScale;
    return ss ? { x: ss.x / rs, y: ss.y / rs, width: ss.w / rs, height: ss.h / rs } : undefined;
  }

  /** A full-frame image of `frame` whose design point `pivot` is its origin, drawn at `at`. */
  private pivoted(frame: string, pivot: Point, at: Point): GameObjects.Image | undefined {
    if (!this.frameRect(frame)) return undefined;
    const o = originFor(pivot, this.layout.design);
    return this.add.image(at.x, at.y, ATLASES.train.key, frame).setScale(1 / this.layout.renderScale).setOrigin(o.x, o.y);
  }

  /** `frame` drawn with its trimmed centre on `at`, at `scale` of its rendered size. */
  private centred(frame: string, at: Point, scale = 1): GameObjects.Image | undefined {
    const rect = this.frameRect(frame);
    if (!rect) return undefined;
    return this.pivoted(frame, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, at)?.setScale(scale / this.layout.renderScale);
  }

  /** Re-points a full-frame image at another frame of the same pivot (size and origin kept). */
  private repoint(img: GameObjects.Image | undefined, frame: string): void {
    if (img && this.hasFrame(frame)) img.setFrame(frame, false, false);
  }

  /** Re-points an image drawn by its trimmed centre at another frame (its origin moves to that frame's centre). */
  private recentre(img: GameObjects.Image | undefined, frame: string): void {
    const rect = this.frameRect(frame);
    if (!img || !rect) return;
    const d = this.layout.design;
    img.setFrame(frame, false, false).setOrigin((rect.x + rect.width / 2) / d.width, (rect.y + rect.height / 2) / d.height);
  }

  private onHull(p: Point, id: string): boolean {
    const hull = this.layout.hits[id];
    return hull !== undefined && pointInPolygon(p, hull);
  }

  /** At a station: the waiting friend's hull or its platform's. */
  private onFriend(p: Point): boolean {
    const c = this.ctl;
    if (!c || c.phase !== 'wait') return false;
    const f = c.friends[c.aboard];
    return (f !== undefined && this.onHull(p, friendHit(f))) || this.onHull(p, PLATFORM_HIT);
  }

  /** At the destination: its hull. */
  private onDest(p: Point): boolean {
    const c = this.ctl;
    return c !== undefined && c.phase === 'dest' && this.onHull(p, destHit(c.dest));
  }

  // --- the props ---------------------------------------------------------------------------------------------

  /** The looping scenery (hills, trees, fences: slower than the ground), the ground strip, the clouds and the bird. */
  private addScenery(): void {
    const loopers = (frames: readonly string[], n: number, depth: number, out: (GameObjects.Image | undefined)[]): void => {
      for (let i = 0; i < n; i++) {
        const frame = frames[i % frames.length]!;
        const rect = this.frameRect(frame);
        const pivot = rect ? { x: rect.x + rect.width / 2, y: rect.y } : undefined;
        out.push(pivot ? this.pivoted(frame, pivot, pivot)?.setDepth(depth) : undefined);
      }
    };
    loopers(HILL_FRAMES, MOTION.hills, Depth.hill, this.hillImgs);
    loopers(TREE_FRAMES, MOTION.trees, Depth.tree, this.treeImgs);
    loopers([FENCE_FRAME], MOTION.fences, Depth.fence, this.fenceImgs);
    const ground = this.frameRect(GROUND_FRAME);
    this.groundW = ground?.width ?? 0;
    for (let i = 0; i < MOTION.groundCopies; i++) {
      const pivot = ground ? { x: ground.x, y: ground.y } : undefined;
      this.groundImgs.push(pivot ? this.pivoted(GROUND_FRAME, pivot, pivot)?.setDepth(Depth.ground) : undefined);
    }
    const off = { x: -this.layout.design.width, y: 0 };
    for (let i = 0; i < CLOUD_COUNT; i++) this.cloudImgs.push(this.centred(CLOUD_FRAMES[i % CLOUD_FRAMES.length]!, off)?.setDepth(Depth.cloud));
    this.birdImg = this.centred(BIRD_FRAMES[0], off)?.setDepth(Depth.bird);
    this.birdFrame = BIRD_FRAMES[0];
  }

  /** The train: the engine and each car in a container on its ground pivot; a car's friend sits behind its side. */
  private addTrain(): void {
    const zero = { x: 0, y: 0 };
    const box = this.add.container(this.engineAt.x, this.engineAt.y).setDepth(Depth.train);
    this.engineBox = box;
    this.engineImg = this.pivoted(ENGINE_FRAMES.idle, this.engineAt, zero);
    this.engineFrame = ENGINE_FRAMES.idle;
    if (this.engineImg) box.add(this.engineImg);
    const seat0 = this.anchor(seatAnchor(0)) ?? this.engineAt;
    CAR_COLOURS.forEach((colour, n) => {
      const at = this.anchor(carAnchor(n)) ?? this.engineAt;
      const seat = this.anchor(seatAnchor(n)) ?? at;
      const car = this.add.container(at.x, at.y).setDepth(Depth.train);
      const rider = this.pivoted(seatFrame(ALL_FRIENDS[0]!), seat0, { x: seat.x - at.x, y: seat.y - at.y })?.setVisible(false);
      if (rider) car.add(rider);
      const img = this.pivoted(carFrame(colour), at, zero);
      if (img) car.add(img);
      this.carBoxes.push(car);
      this.seats.push(rider);
    });
  }

  /** A scrolling thing scrolls in: its images, each with its offset from the thing's pivot. */
  private thingIn(thing: Thing): void {
    const T = (frame: string, pivot: Point, depth: number): GameObjects.Image | undefined => this.pivoted(frame, pivot, pivot)?.setDepth(depth);
    const set: ThingImages = { thing, parts: [], dropped: [] };
    const part = (img: GameObjects.Image | undefined, pivot: Point, base: Point): void => {
      if (img) set.parts.push({ img, dx: pivot.x - base.x });
    };
    if (thing.kind === 'platform') {
      part(T(PLATFORM_FRAME, this.platformAt, Depth.place), this.platformAt, this.platformAt);
      if (thing.friend) {
        set.friend = T(friendFrame(thing.friend), this.friendAt, Depth.friend);
        part(set.friend, this.friendAt, this.platformAt);
      }
    } else if (thing.kind === 'dest' && thing.dest) {
      part(T(destFrame(thing.dest), this.destAt, Depth.place), this.destAt, this.destAt);
    } else if (thing.kind === 'tunnel') {
      part(T(TUNNEL_FRAMES.back, this.tunnelAt, Depth.tunnelBack), this.tunnelAt, this.tunnelAt);
      part(T(TUNNEL_FRAMES.front, this.tunnelAt, Depth.tunnelFront), this.tunnelAt, this.tunnelAt);
    } else if (thing.kind === 'cow') {
      part(T(COW_FRAMES.idle, this.cowAt, Depth.near), this.cowAt, this.cowAt);
    } else if (thing.kind === 'crossing') {
      set.crossing = T(SURPRISE_FRAMES.crossing, this.surpriseAt, Depth.near);
      part(set.crossing, this.surpriseAt, this.surpriseAt);
    } else if (thing.kind === 'bridge') {
      part(T(SURPRISE_FRAMES.bridge, this.surpriseAt, Depth.place), this.surpriseAt, this.surpriseAt);
      set.fish = T(SURPRISE_FRAMES.fish, this.surpriseAt, Depth.near)?.setVisible(false);
      part(set.fish, this.surpriseAt, this.surpriseAt);
    }
    this.things.set(thing.id, set);
    this.placeThing(set, thing.x);
  }

  private thingGone(id: number): void {
    const set = this.things.get(id);
    if (!set) return;
    for (const p of set.parts) {
      this.tweens.killTweensOf(p.img);
      p.img.destroy();
    }
    for (const img of set.dropped) {
      this.tweens.killTweensOf(img);
      img.destroy();
    }
    this.things.delete(id);
  }

  private placeThing(set: ThingImages, x: number): void {
    for (const p of set.parts) p.img.setX(x + p.dx);
    for (const img of set.dropped) img.setX(x + (img.getData('dx') as number));
  }

  // --- every frame: draw what the model says -------------------------------------------------------------------

  private sync(delta: number): void {
    const c = this.ctl;
    if (!c) return;
    const T = Tokens.Timing;
    const moving = c.speed > 0;
    // The engine: its wheels turn while it moves (faster with the speed), a toot or a happy driver for a moment.
    this.modeLeft = Math.max(0, this.modeLeft - delta);
    const cruise = (Tokens.ui.trainScrollPxPerS * (this.reduced ? Tokens.ui.trainReducedScroll : 1)) / WORLD.msPerS;
    this.wheelClock += moving && cruise > 0 ? delta * Math.min(1, c.speed / cruise) : 0;
    const flip = this.reduced ? 0 : 1;
    const wheel = Math.floor(this.wheelClock / T.trainWheelFrameMs) % 2;
    let frame: string = moving ? ENGINE_FRAMES.run[wheel * flip]! : ENGINE_FRAMES.idle;
    if (this.modeLeft > 0 && this.mode === 'toot') frame = ENGINE_FRAMES.toot;
    else if (this.modeLeft > 0 && this.mode === 'happy') frame = ENGINE_FRAMES.happy;
    if (frame !== this.engineFrame) {
      this.engineFrame = frame;
      this.repoint(this.engineImg, frame);
    }
    // A gentle bob while running: the engine and each car a little out of step.
    const bob = (k: number): number => (moving && !this.reduced ? (Math.floor(this.wheelClock / T.trainWheelFrameMs + k) % 2) * MOTION.bobPx : 0);
    this.engineBox?.setY(this.engineAt.y - bob(0));
    this.carBoxes.forEach((box, n) => {
      const at = this.layout.anchors[carAnchor(n)];
      if (box && at) box.setY(at.y - bob((n + 1) * MOTION.carLag));
    });
    // The ground strip (copies overlapping by 1 px) and the slower looping layers.
    if (this.groundW > 0) {
      const off = -(c.scroll % (this.groundW - MOTION.groundOverlapPx));
      this.groundImgs.forEach((img, i) => img?.setX(Math.round(off + i * (this.groundW - MOTION.groundOverlapPx))));
    }
    const loop = (imgs: (GameObjects.Image | undefined)[], gap: number, speed: number): void => {
      const total = imgs.length * gap;
      imgs.forEach((img, i) => {
        const x = (((i * gap - c.scroll * speed) % total) + total) % total;
        img?.setX(x - MOTION.wrapPadPx);
      });
    };
    loop(this.hillImgs, MOTION.hillGapPx, MOTION.hillSpeed);
    loop(this.treeImgs, MOTION.treeGapPx, MOTION.treeSpeed);
    loop(this.fenceImgs, MOTION.fenceGapPx, MOTION.fenceSpeed);
    c.clouds.forEach((cloud, i) => this.cloudImgs[i]?.setPosition(cloud.x, cloud.y));
    // The bird flaps (two frames, slowly).
    this.flapClock += delta;
    const flap = BIRD_FRAMES[this.reduced ? 0 : Math.floor(this.flapClock / T.trainFlapMs) % BIRD_FRAMES.length]!;
    if (flap !== this.birdFrame) {
      this.birdFrame = flap;
      this.recentre(this.birdImg, flap);
    }
    this.birdImg?.setPosition(c.bird.x, c.bird.y + this.birdLift.dy);
    // The scrolling things.
    for (const thing of c.things) {
      const set = this.things.get(thing.id);
      if (!set) continue;
      this.placeThing(set, thing.x);
      if (thing.kind === 'cow') for (const p of set.parts) p.img.setY(this.cowAt.y + this.cowLift.dy);
    }
    // The tunnel's dim follows how much of the train the hill covers (never black: at most trainDimMax).
    const max = this.reduced ? Tokens.ui.trainDimReduced : Tokens.ui.trainDimMax;
    this.dimRect?.setAlpha(max * c.dim);
  }

  // --- the model's view ----------------------------------------------------------------------------------------

  /** The engine shows `mode` for `ms`. */
  private show(mode: EngineMode, ms: number): void {
    this.mode = mode;
    this.modeLeft = ms;
  }

  /** The toot: the toot frame and a soft puff that rises from the chimney, grows and fades. */
  private toot(): void {
    const T = Tokens.Timing;
    this.show('toot', T.trainPuffMs / 2);
    const at = this.anchor(ANCHORS.chimney);
    if (!at) return;
    const puff = this.centred(PARTICLES.puff, at, MOTION.puffStart)?.setDepth(Depth.particle).setAlpha(MOTION.puffAlpha);
    if (!puff) return;
    const s = 1 / this.layout.renderScale;
    this.tweens.add({
      targets: puff,
      y: at.y - this.amp(MOTION.puffRisePx),
      x: at.x - this.amp(MOTION.puffRisePx / 2),
      scale: s * (this.reduced ? MOTION.puffReducedScale : MOTION.puffScale * MOTION.puffStart),
      alpha: 0,
      duration: T.trainPuffMs,
      ease: EASE_OUT,
      onComplete: () => puff.destroy(),
    });
  }

  /** A tapped car wobbles twice around its ground pivot. */
  private wobble(n: number): void {
    const box = this.carBoxes[n];
    if (!box) return;
    this.tweens.killTweensOf(box);
    box.setAngle(0);
    this.tweens.add({ targets: box, angle: this.amp(MOTION.wobbleDeg), duration: Tokens.Timing.trainWobbleMs / MOTION.wobbleSwings, ease: SINE, yoyo: true, repeat: 1, onComplete: () => box.setAngle(0) });
  }

  /** The train stops: the waiting friend bounces (or the destination). */
  private arrived(at: { friend: FriendId } | { dest: DestinationId }): void {
    const set = this.currentStop();
    if (!set) return;
    if ('friend' in at) this.bounce(set.friend);
    else this.bounce(set.parts[0]?.img);
  }

  /** The platform or the destination the train stands at (the newest one). */
  private currentStop(): ThingImages | undefined {
    let best: ThingImages | undefined;
    for (const set of this.things.values()) if ((set.thing.kind === 'platform' || set.thing.kind === 'dest') && (!best || set.thing.id > best.thing.id)) best = set;
    return best;
  }

  /** The waiting friend hops from its platform into car `car` (an arc), then sits there. */
  private board(f: FriendId, car: number, ms: number): void {
    const set = this.currentStop();
    const from = set?.friend;
    const seat = this.anchor(seatAnchor(car));
    const rider = this.seats[car];
    const done = (): void => {
      if (rider) {
        this.repoint(rider, seatFrame(f));
        rider.setVisible(true);
      }
      const pop = seat ? this.centred(PARTICLES.pop, { x: seat.x, y: seat.y - MOTION.popRisePx }, MOTION.popScale)?.setDepth(Depth.particle) : undefined;
      if (pop) this.tweens.add({ targets: pop, alpha: 0, scale: MOTION.popEnd / this.layout.renderScale, duration: Tokens.Timing.trainBumpMs, ease: EASE_OUT, onComplete: () => pop.destroy() });
      this.carBounce(car);
    };
    if (!from || !seat) {
      from?.setVisible(false);
      this.time.delayedCall(ms, done);
      return;
    }
    // A copy of the friend hops over the train's top into its seat (the platform's own image hides at once).
    from.setVisible(false);
    const hopper = this.pivoted(friendFrame(f), this.friendAt, { x: from.x, y: from.y })?.setDepth(Depth.hop);
    if (!hopper) {
      this.time.delayedCall(ms, done);
      return;
    }
    if (this.reduced) {
      this.tweens.add({ targets: hopper, alpha: 0, duration: ms, ease: SINE, onComplete: () => hopper.destroy() });
      this.time.delayedCall(ms, done);
      return;
    }
    const s = 1 / this.layout.renderScale;
    const peak = Math.min(from.y, seat.y) - MOTION.boardHopPx;
    this.tweens.add({ targets: hopper, x: seat.x, duration: ms, ease: SINE });
    this.tweens.chain({
      targets: hopper,
      tweens: [
        { y: peak, duration: ms * MOTION.hopUp, ease: EASE_OUT },
        { y: seat.y, scale: s * MOTION.hopScale, duration: ms * (1 - MOTION.hopUp), ease: EASE_IN },
      ],
    });
    this.time.delayedCall(ms, () => {
      hopper.destroy();
      done();
    });
  }

  /** A car bumps down a little as its friend lands. */
  private carBounce(n: number): void {
    const box = this.carBoxes[n];
    if (!box || this.reduced) return;
    this.tweens.add({ targets: box, scaleY: MOTION.carSquash, duration: Tokens.Timing.trainTapMs * MOTION.carSquashShare, ease: SINE, yoyo: true, onComplete: () => box.setScale(1) });
  }

  /** At the destination the friends hop off one by one (car 0 first) to their spots, then wave while the train leaves. */
  private dropoff(_d: DestinationId, friends: readonly FriendId[], ms: number, stagger: number): void {
    const set = this.currentStop();
    friends.forEach((f, i) => {
      const spot = this.anchor(dropAnchor(i));
      const seat = this.anchor(seatAnchor(i));
      if (!spot || !seat) return;
      this.time.delayedCall(i * stagger, () => {
        this.seats[i]?.setVisible(false);
        const s = MOTION.dropScale / this.layout.renderScale;
        const img = this.pivoted(friendFrame(f, 'happy'), this.friendAt, seat)?.setDepth(Depth.hop).setScale(s * MOTION.hopScale);
        if (!img) return;
        const land = (): void => {
          img.setDepth(Depth.dropped).setPosition(spot.x, spot.y).setScale(s);
          if (set) {
            img.setData('dx', spot.x - this.destAt.x);
            set.dropped.push(img);
            this.placeThing(set, set.thing.x);
          }
          this.wave(img, f);
        };
        if (this.reduced) {
          land();
          return;
        }
        this.tweens.add({ targets: img, x: spot.x, scale: s, duration: ms, ease: SINE });
        this.tweens.chain({
          targets: img,
          tweens: [
            { y: Math.min(seat.y, spot.y) - MOTION.dropHopPx, duration: ms * MOTION.hopUp, ease: EASE_OUT },
            { y: spot.y, duration: ms * (1 - MOTION.hopUp), ease: EASE_IN, onComplete: land },
          ],
        });
      });
    });
  }

  /** A dropped friend waves (its wave frame, tilting a little), then stays happy. */
  private wave(img: GameObjects.Image, f: FriendId): void {
    this.repoint(img, friendFrame(f, 'wave'));
    const deg = this.amp(MOTION.waveDeg);
    if (deg === 0) return;
    this.tweens.add({
      targets: img,
      angle: deg,
      duration: Tokens.Timing.trainWaveMs / (2 * MOTION.waves),
      ease: SINE,
      yoyo: true,
      repeat: MOTION.waves - 1,
      onComplete: () => {
        img.setAngle(0);
        this.repoint(img, friendFrame(f, 'happy'));
      },
    });
  }

  /** A ground surprise passes the engine or is tapped: the crossing's driver waves; the bridge's fish jumps. */
  private passed(kind: 'crossing' | 'bridge'): void {
    const set = [...this.things.values()].find((s) => s.thing.kind === kind);
    if (!set) return;
    const T = Tokens.Timing;
    if (kind === 'crossing' && set.crossing) {
      const img = set.crossing;
      this.repoint(img, SURPRISE_FRAMES.crossingWave);
      this.time.delayedCall(T.trainWaveMs, () => this.repoint(img, SURPRISE_FRAMES.crossing));
      return;
    }
    const fish = set.fish;
    if (!fish || fish.visible) return;
    const y = this.surpriseAt.y;
    fish.setVisible(true).setY(y + MOTION.fishJumpPx * MOTION.fishDip).setAngle(0).setAlpha(1);
    this.tweens.chain({
      targets: fish,
      tweens: [
        { y: y - this.amp(MOTION.fishJumpPx) * MOTION.fishRise, angle: this.amp(MOTION.fishUpDeg), duration: T.trainWobbleMs, ease: EASE_OUT },
        { y: y + MOTION.fishJumpPx * MOTION.fishDip, angle: this.amp(MOTION.fishDownDeg), duration: T.trainWobbleMs, ease: EASE_IN, onComplete: () => fish.setVisible(false).setY(y).setAngle(0) },
      ],
    });
  }

  /** The hot-air balloon or the rainbow fades in, drifts left a little and fades out. */
  private sky(id: 'hot-air' | 'rainbow', ms: number): void {
    const d = this.layout.design;
    const hot = id === 'hot-air';
    const x = d.width * (hot ? MOTION.hotAirX : MOTION.rainbowX);
    const y = d.height * (hot ? MOTION.hotAirY : MOTION.rainbowY);
    const img = this.centred(hot ? SURPRISE_FRAMES.hotAir : SURPRISE_FRAMES.rainbow, { x, y }, hot ? MOTION.hotAirScale : 1)?.setDepth(Depth.far).setAlpha(0);
    if (!img) return;
    this.tweens.add({ targets: img, x: x - this.amp(MOTION.driftPx), duration: ms, ease: SINE, onComplete: () => img.destroy() });
    this.tweens.chain({
      targets: img,
      tweens: [
        { alpha: 1, duration: ms * MOTION.driftFade, ease: SINE },
        { alpha: 1, duration: ms * (1 - 2 * MOTION.driftFade) },
        { alpha: 0, duration: ms * MOTION.driftFade, ease: SINE },
      ],
    });
  }

  /** The tapped cow hops (its happy frame for a moment). */
  private cowHop(): void {
    const set = [...this.things.values()].find((s) => s.thing.kind === 'cow');
    const img = set?.parts[0]?.img;
    if (img) {
      this.repoint(img, COW_FRAMES.happy);
      this.time.delayedCall(Tokens.Timing.trainBumpMs * 2, () => this.repoint(img, COW_FRAMES.idle));
    }
    this.tweens.killTweensOf(this.cowLift);
    this.cowLift.dy = 0;
    this.tweens.add({ targets: this.cowLift, dy: -this.amp(MOTION.cowHopPx), duration: Tokens.Timing.trainBumpMs / 2, ease: EASE_OUT, yoyo: true, onComplete: () => (this.cowLift.dy = 0) });
  }

  /** The tapped bird does a little loop up and back. */
  private birdLoop(): void {
    this.tweens.killTweensOf(this.birdLift);
    this.birdLift.dy = 0;
    this.tweens.add({ targets: this.birdLift, dy: -this.amp(MOTION.birdLoopPx), duration: Tokens.Timing.trainBumpMs / 2, ease: SINE, yoyo: true, onComplete: () => (this.birdLift.dy = 0) });
  }

  /** A bounce from the rest scale (the hint; the friend as the train stops). */
  private bounce(target: GameObjects.Image | GameObjects.Container | undefined): void {
    if (!target) return;
    const base = target.scaleX;
    this.tweens.add({
      targets: target,
      scale: base * (1 + this.amp(Tokens.ui.trainHintBounce - 1)),
      duration: Tokens.Timing.trainTapMs / 2,
      ease: SINE,
      yoyo: true,
      repeat: 1,
      onComplete: () => target.setScale(base),
    });
  }

  /** The idle hint: the waiting train, the friend on its platform or the destination bounces. */
  private hintAt(target: HintTarget): void {
    if (target === 'train') {
      this.bounce(this.engineBox);
      this.toot();
      return;
    }
    const set = this.currentStop();
    this.bounce(target === 'friend' ? set?.friend : set?.parts[0]?.img);
  }

  /** A resumed trip shows at once: its friends aboard in their cars. */
  private restore(state: TripState): void {
    for (let n = 0; n < Math.min(state.aboard, FRIENDS_PER_TRIP); n++) {
      const f = state.friends[n];
      const rider = this.seats[n];
      if (!f || !rider) continue;
      this.repoint(rider, seatFrame(f));
      rider.setVisible(true);
    }
  }
}
