// Phi công nhí (2026-11-11, spec-phi-cong-nhi): a yard game (the yard's `plane` corner, "Máy bay"). Free play from
// the start (MiniGameBase.startFreePlay, like the garden and the car wash): no rounds, no score, no right or wrong.
// A toy plane flown by the goggled Shiba waits on the grass; a tap and it takes off. The sky scrolls by itself; a
// press anywhere in the sky sets the plane's height (it glides there; the target follows a finger that stays down).
// Balloons float in one at a time; the plane pops them and takes their gifts while the voice names the colour and
// counts. After three gifts a friend's house scrolls in; a tap on the friend drops the gifts on parachutes, the friend
// reacts, and the plane flies on. Home goes back to the yard (`round:leave`); a flight in the air is kept
// (`leaveSnapshot`) and comes back on the next visit.
// The scene only wires Phaser: the still sky plate, the looping sprites (hills, the ground strip, clouds, the bird),
// the plane in a container (its frame, the gifts on board), the balloon, the friend and its house, the sky target
// (press, move, lift), the plane's and the friend's tap areas, tweens, and the pure model (flight.ts) that owns every
// position: each frame the scene draws what the model says.
import type { GameObjects } from 'phaser';
import { ATLASES, BACKGROUNDS } from '../../content/assets';
import {
  ANCHORS,
  BAG_SEEDS,
  BALLOONS_LINE,
  BIRD_FRAMES,
  CLOUD_COUNT,
  CLOUD_FRAMES,
  FRIENDS,
  GIFTS_PER_FLIGHT,
  GROUND_FRAME,
  HILL_FRAMES,
  MOTION,
  PARTICLES,
  PLANE_FRAMES,
  PROMPT_LINE,
  REACTIONS,
  SFX,
  SURPRISE_FRAMES,
  balloonFrame,
  cargoAnchor,
  colourLine,
  countLine,
  friendFrame,
  friendHit,
  giftFrame,
  houseFrame,
  houseHit,
  type ColourId,
  type FriendId,
  type SurpriseId,
} from '../../content/games/plane';
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
  ALL_COLOURS,
  ALL_FRIENDS,
  ALL_SURPRISES,
  createFlightController,
  createShuffleBag,
  defaultFlightSizes,
  resumeFlight,
  type FlightController,
  type FlightProgress,
  type FlightState,
  type HintTarget,
  type ShuffleBag,
} from './flight';

interface FrameData {
  readonly spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

type Sprite = GameObjects.Image | GameObjects.Container;
/** What the plane shows: parked, flying (the propeller blur), cheering after a catch, waggling its wings. */
type PlaneMode = 'prop' | 'happy' | 'waggle';

const SINE = 'Sine.easeInOut';
const EASE_OUT = 'Quad.easeOut';
const EASE_IN = 'Quad.easeIn';
const BACK_OUT = 'Back.easeOut';
/** Draw order, back to front. */
const LAYERS = ['far', 'hill', 'ground', 'house', 'friend', 'cloud', 'rainbow', 'balloon', 'plane', 'bird', 'drop', 'particle'] as const;
const Depth = Object.fromEntries(LAYERS.map((l, i) => [l, i + 1])) as Record<(typeof LAYERS)[number], number>;

export class Plane extends MiniGameBase<'plane'> {
  /** The session's bags (static: a visit restarts the scene; the friends, colours and surprises go on across visits). */
  private static friends: ShuffleBag<FriendId> | undefined;
  private static colours: ShuffleBag<ColourId> | undefined;
  private static surprises: ShuffleBag<SurpriseId> | undefined;
  /** Tests: a fresh session. */
  static resetSession(): void {
    Plane.friends = undefined;
    Plane.colours = undefined;
    Plane.surprises = undefined;
  }

  private layout: ScreenLayout = LAYOUTS.plane;
  private ctl: FlightController | undefined;
  private warned = new Set<string>();
  /** The flying plane's centre at the middle height, its centre while parked, the friend's and the house's ground pivots at rest. */
  private planeAt: Point = { x: 0, y: 0 };
  private groundAt: Point = { x: 0, y: 0 };
  private friendAt: Point = { x: 0, y: 0 };
  private houseAt: Point = { x: 0, y: 0 };
  private box: GameObjects.Container | undefined;
  private planeImg: GameObjects.Image | undefined;
  private cargo: (GameObjects.Image | undefined)[] = [];
  private balloonImg: GameObjects.Image | undefined;
  private houseImg: GameObjects.Image | undefined;
  private friendImg: GameObjects.Image | undefined;
  private cloudImgs: (GameObjects.Image | undefined)[] = [];
  private birdImg: GameObjects.Image | undefined;
  private hillImgs: (GameObjects.Image | undefined)[] = [];
  private groundImgs: (GameObjects.Image | undefined)[] = [];
  /** The ground strip's width (design px): two copies side by side loop. */
  private groundW = 0;
  /** What is drawn now (a frame is re-pointed only when it changes). */
  private planeFrame: string | undefined;
  private birdFrame: string | undefined;
  private shownHouse: FriendId | undefined;
  private houseShown = false;
  private balloonShown = false;
  /** The plane's show: `mode` for `modeLeft` more ms, then the propeller again; the frame clocks. */
  private mode: PlaneMode = 'prop';
  private modeLeft = 0;
  private frameClock = 0;
  private flapClock = 0;
  /** Tweened offsets the scene adds to what the model says: the cloud bounce, the take-off tilt, the tapped bird's loop. */
  private bump = { dy: 0 };
  private tilt = { deg: 0 };
  private birdLift = { dy: 0 };
  /** The last line this game made the Speaker prompt (cleared on shutdown, and only it). */
  private prompt: string | undefined;

  constructor() {
    super('plane');
  }

  protected override reactionSet(): ReactionSet {
    return REACTIONS;
  }

  protected build(): void {
    // No round, no score: free play from the start (Home → round:leave, back to the yard).
    this.startFreePlay();
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS.plane;
    this.box = undefined;
    this.planeImg = undefined;
    this.cargo = [];
    this.balloonImg = undefined;
    this.houseImg = undefined;
    this.friendImg = undefined;
    this.cloudImgs = [];
    this.birdImg = undefined;
    this.hillImgs = [];
    this.groundImgs = [];
    this.planeFrame = undefined;
    this.birdFrame = undefined;
    this.shownHouse = undefined;
    this.houseShown = false;
    this.balloonShown = false;
    this.mode = 'prop';
    this.modeLeft = 0;
    this.frameClock = 0;
    this.flapClock = 0;
    this.bump = { dy: 0 };
    this.tilt = { deg: 0 };
    this.birdLift = { dy: 0 };
    const resume = resumeFlight(this.resumeAt);
    if (this.resumeAt && !resume) console.warn('plane: bad resume — a fresh take-off');
    Plane.friends ??= createShuffleBag(ALL_FRIENDS, mulberry32(questionSeed(this.seed, BAG_SEEDS.friends)));
    Plane.colours ??= createShuffleBag(ALL_COLOURS, mulberry32(questionSeed(this.seed, BAG_SEEDS.colours)));
    Plane.surprises ??= createShuffleBag(ALL_SURPRISES, mulberry32(questionSeed(this.seed, BAG_SEEDS.surprises)));

    const design = this.layout.design;
    const centre = { x: design.width / 2, y: design.height / 2 };
    this.planeAt = this.anchor(ANCHORS.plane) ?? centre;
    this.groundAt = this.anchor(ANCHORS.ground) ?? centre;
    this.friendAt = this.anchor(ANCHORS.friend) ?? centre;
    this.houseAt = this.anchor(ANCHORS.house) ?? centre;

    const rs = this.layout.renderScale;
    const bg = BACKGROUNDS.plane;
    if (this.textures.exists(bg.key)) this.add.image(0, 0, bg.key).setOrigin(0).setScale(1 / rs);
    else this.warnOnce(bg.key, `plane: texture "${bg.key}" is missing — plate skipped`);

    const router = createTapRouter(this);
    this.addScenery();
    this.addHouse();
    this.addBalloon();
    this.addPlane();

    const u = Tokens.ui;
    const ctl = createFlightController({
      friends: Plane.friends,
      colours: Plane.colours,
      surprises: Plane.surprises,
      rng: mulberry32(questionSeed(this.seed, BAG_SEEDS.sky)),
      geometry: { width: design.width, planeX: this.planeAt.x, groundY: this.groundAt.y, topY: u.planeTopY, bottomY: u.planeBottomY, houseX: this.houseAt.x },
      resume,
      lines: { prompt: PROMPT_LINE, balloons: BALLOONS_LINE, colour: colourLine, count: countLine, drop: (f) => FRIENDS[f].dropLine },
      sounds: { propeller: SFX.propeller, whoosh: SFX.whoosh, boing: SFX.boing, pop: SFX.pop, chime: SFX.chime, puff: SFX.puff, chirp: SFX.chirp, call: (f) => FRIENDS[f].callSfx },
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
        takeOff: (ms) => this.takeOff(ms),
        skip: () => this.skipShow(),
        balloonIn: (colour) => this.balloonIn(colour),
        balloonGone: () => this.hideBalloon(),
        caught: (colour, n, at) => this.caught(colour, n, at),
        cloudBump: (i) => this.cloudBump(i),
        cloudTapped: (i) => this.puffUp(this.cloudImgs[i]),
        birdTapped: () => this.birdLoop(),
        surprise: (id, ms) => this.surprise(id, ms),
        houseIn: () => undefined,
        arrived: () => this.bounce(this.friendImg),
        drop: (_f, gifts, ms, stagger) => this.drop(gifts, ms, stagger),
        friendHappy: (f, ms) => this.friendHappy(f, ms),
        flyOff: (ms) => this.show('waggle', ms),
        houseGone: () => undefined,
        hint: (target) => this.hintAt(target),
        restore: (state) => this.restore(state),
      },
      sizes: defaultFlightSizes(this.reduced),
    });
    this.ctl = ctl;

    // Any press restarts the idle clock and skips a long take-off or fly-off.
    router.onAnyTap = () => ctl.anyTap();
    // The sky target: once the plane is in the air a press anywhere sets its height; the target follows the finger
    // while it stays down; a lift keeps the height. (Before take-off and during the drop the sky is not a target.)
    router.add({
      contains: () => this.steerable(),
      isEnabled: () => true,
      onPress: (p) => this.ctl?.press(p),
      onMove: (p) => this.ctl?.move(p),
      onEnd: () => this.ctl?.lift(),
      onCancel: () => this.ctl?.lift(),
    });
    // The parked plane (its drawn rect) and, at the house, the friend or its house (their hulls): added after the sky,
    // so they win where they overlap it.
    createTapTarget(router, { area: { contains: (p) => this.onParkedPlane(p) }, onPress: () => this.ctl?.tapPlane() });
    createTapTarget(router, { area: { contains: (p) => this.onFriend(p) }, onPress: () => this.ctl?.tapFriend() });
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

  protected progress(): FlightProgress {
    return this.ctl?.progress() ?? { questionIndex: 0, partial: { friend: '', gifts: [], surprise: '' } };
  }

  /** Home in mid-flight: the flight is kept (Map stores the snapshot) and comes back next time; otherwise nothing. */
  protected override leaveSnapshot(): Snapshot<'plane'> | undefined {
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
    if (!a) this.warnOnce(`anchor.${id}`, `plane: anchor "${id}" is missing from the layout`);
    return a;
  }

  private hasFrame(frame: string): boolean {
    const key = ATLASES.plane.key;
    return this.textures.exists(key) && this.textures.get(key).has(frame);
  }

  /** The trimmed rect of a frame in design px. */
  private frameRect(frame: string): TrimmedRect | undefined {
    if (!this.hasFrame(frame)) {
      this.warnOnce(frame, `plane: frame "${frame}" is missing`);
      return undefined;
    }
    const ss = (this.textures.get(ATLASES.plane.key).get(frame).customData as FrameData | undefined)?.spriteSourceSize;
    const rs = this.layout.renderScale;
    return ss ? { x: ss.x / rs, y: ss.y / rs, width: ss.w / rs, height: ss.h / rs } : undefined;
  }

  /** A full-frame image of `frame` whose design point `pivot` is its origin, drawn at `at`. */
  private pivoted(frame: string, pivot: Point, at: Point): GameObjects.Image | undefined {
    if (!this.frameRect(frame)) return undefined;
    const o = originFor(pivot, this.layout.design);
    return this.add.image(at.x, at.y, ATLASES.plane.key, frame).setScale(1 / this.layout.renderScale).setOrigin(o.x, o.y);
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

  /** The plane is in the air and listening: a press in the sky steers. */
  private steerable(): boolean {
    const phase = this.ctl?.phase;
    return phase === 'fly' || phase === 'approach' || phase === 'house' || phase === 'flyoff';
  }

  /** The parked plane's tap area: its drawn rect on the grass (at least ui.planeHitMinPx each way). */
  private onParkedPlane(p: Point): boolean {
    if (this.ctl?.phase !== 'ground') return false;
    const rect = this.frameRect(PLANE_FRAMES.idle);
    const min = Tokens.ui.planeHitMinPx;
    const w = Math.max(min, rect?.width ?? 0);
    const h = Math.max(min, rect?.height ?? 0);
    // The frame was rendered with the plane's centre on anchor.plane; parked, that centre is on anchor.plane-ground.
    const cx = rect ? rect.x + rect.width / 2 - this.planeAt.x + this.groundAt.x : this.groundAt.x;
    const cy = rect ? rect.y + rect.height / 2 - this.planeAt.y + this.groundAt.y : this.groundAt.y;
    return Math.abs(p.x - cx) <= w / 2 && Math.abs(p.y - cy) <= h / 2;
  }

  /** At the house: the friend's hull or its house's. */
  private onFriend(p: Point): boolean {
    const c = this.ctl;
    if (!c || c.phase !== 'house' || !c.house) return false;
    const f = c.house.friend;
    return [friendHit(f), houseHit(f)].some((id) => {
      const hull = this.layout.hits[id];
      return hull !== undefined && pointInPolygon(p, hull);
    });
  }

  // --- the props ---------------------------------------------------------------------------------------------

  /** The looping scenery: the hills (far, slow), the ground strip (two copies side by side), the clouds and the bird. */
  private addScenery(): void {
    for (let i = 0; i < MOTION.hills; i++) {
      const frame = HILL_FRAMES[i % HILL_FRAMES.length]!;
      const rect = this.frameRect(frame);
      const pivot = rect ? { x: rect.x + rect.width / 2, y: rect.y } : undefined;
      this.hillImgs.push(pivot ? this.pivoted(frame, pivot, pivot)?.setDepth(Depth.hill) : undefined);
    }
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

  /** The friend and its house (hidden until a house scrolls in; re-pointed per friend). */
  private addHouse(): void {
    const first = ALL_FRIENDS[0]!;
    this.houseImg = this.pivoted(houseFrame(first), this.houseAt, this.houseAt)?.setDepth(Depth.house).setVisible(false);
    this.friendImg = this.pivoted(friendFrame(first), this.friendAt, this.friendAt)?.setDepth(Depth.friend).setVisible(false);
  }

  private addBalloon(): void {
    this.balloonImg = this.centred(balloonFrame(ALL_COLOURS[0]!), { x: -this.layout.design.width, y: 0 })?.setDepth(Depth.balloon).setVisible(false);
  }

  /** The plane container on its centre: the plane frame and the gifts that ride on it. */
  private addPlane(): void {
    const box = this.add.container(this.planeAt.x, this.groundAt.y).setDepth(Depth.plane);
    this.box = box;
    const zero = { x: 0, y: 0 };
    this.planeImg = this.pivoted(PLANE_FRAMES.idle, this.planeAt, zero);
    this.planeFrame = PLANE_FRAMES.idle;
    if (this.planeImg) box.add(this.planeImg);
    for (let n = 0; n < GIFTS_PER_FLIGHT; n++) {
      const img = this.centred(giftFrame(ALL_COLOURS[0]!), this.cargoSpot(n), MOTION.cargoScale)?.setVisible(false);
      if (img) box.add(img);
      this.cargo.push(img);
    }
  }

  /** Where gift `n` rides, in the plane container. */
  private cargoSpot(n: number): Point {
    const a = this.anchor(cargoAnchor(n)) ?? this.planeAt;
    return { x: a.x - this.planeAt.x, y: a.y - this.planeAt.y };
  }

  // --- every frame: draw what the model says -------------------------------------------------------------------

  private sync(delta: number): void {
    const c = this.ctl;
    if (!c) return;
    const T = Tokens.Timing;
    const parked = c.phase === 'ground';
    // The plane: its x never changes; it noses up or down a little toward its target.
    const lean = parked || c.phase === 'takeoff' ? 0 : Math.max(-MOTION.pitchMaxDeg, Math.min(MOTION.pitchMaxDeg, (c.targetY - c.planeY) * MOTION.pitchPerPx));
    this.box?.setPosition(this.planeAt.x, c.planeY + this.bump.dy).setAngle(this.amp(lean) + this.tilt.deg);
    this.modeLeft = Math.max(0, this.modeLeft - delta);
    this.frameClock += delta;
    const mode: PlaneMode = this.modeLeft > 0 ? this.mode : 'prop';
    let frame: string = PLANE_FRAMES.idle;
    if (!parked) {
      const flip = this.reduced ? 0 : 1;
      const waggleMs = T.planeFlyOffMs / (2 * MOTION.waggles);
      if (mode === 'happy') frame = PLANE_FRAMES.happy;
      else if (mode === 'waggle') frame = PLANE_FRAMES.waggle[(Math.floor(this.frameClock / waggleMs) % 2) * flip]!;
      else frame = PLANE_FRAMES.prop[(Math.floor(this.frameClock / T.planePropFrameMs) % 2) * flip]!;
    }
    if (frame !== this.planeFrame) {
      this.planeFrame = frame;
      this.repoint(this.planeImg, frame);
    }
    // The ground strip (copies overlapping by 1 px) and the hills (slower, looping).
    if (this.groundW > 0) {
      const off = -(c.scroll % (this.groundW - MOTION.groundOverlapPx));
      this.groundImgs.forEach((img, i) => img?.setX(Math.round(off + i * (this.groundW - MOTION.groundOverlapPx))));
    }
    const loop = MOTION.hills * MOTION.hillGapPx;
    this.hillImgs.forEach((img, i) => {
      const x = (((i * MOTION.hillGapPx - c.scroll * MOTION.hillSpeed) % loop) + loop) % loop;
      img?.setX(x - MOTION.hillPadPx);
    });
    c.clouds.forEach((cloud, i) => this.cloudImgs[i]?.setPosition(cloud.x, cloud.y));
    // The bird flaps (two frames, slowly).
    this.flapClock += delta;
    const flap = BIRD_FRAMES[this.reduced ? 0 : Math.floor(this.flapClock / T.planeFlapMs) % BIRD_FRAMES.length]!;
    if (flap !== this.birdFrame) {
      this.birdFrame = flap;
      this.recentre(this.birdImg, flap);
    }
    this.birdImg?.setPosition(c.bird.x, c.bird.y + this.birdLift.dy);
    // The balloon on its way.
    if (c.balloon) this.balloonImg?.setPosition(c.balloon.x, c.balloon.y);
    else if (this.balloonShown) this.hideBalloon();
    // The friend and its house scroll with the ground.
    const h = c.house;
    if (!h) {
      if (this.houseShown) {
        this.houseShown = false;
        this.houseImg?.setVisible(false);
        this.friendImg?.setVisible(false);
      }
      return;
    }
    if (this.shownHouse !== h.friend || !this.houseShown) {
      this.shownHouse = h.friend;
      this.houseShown = true;
      this.repoint(this.houseImg, houseFrame(h.friend));
      this.repoint(this.friendImg, friendFrame(h.friend));
      this.houseImg?.setVisible(true);
      this.friendImg?.setVisible(true);
    }
    this.houseImg?.setX(h.x);
    this.friendImg?.setX(h.x + this.friendAt.x - this.houseAt.x);
  }

  // --- the model's view ----------------------------------------------------------------------------------------

  /** The plane shows `mode` for `ms` (then the propeller again). */
  private show(mode: PlaneMode, ms: number): void {
    this.mode = mode;
    this.modeLeft = ms;
    this.frameClock = 0;
  }

  /** The take-off: the nose lifts, then levels out. */
  private takeOff(ms: number): void {
    const deg = this.amp(MOTION.takeOffDeg);
    this.tweens.killTweensOf(this.tilt);
    this.tweens.chain({
      targets: this.tilt,
      tweens: [
        { deg, duration: ms / 2, ease: SINE },
        { deg: 0, duration: ms / 2, ease: SINE },
      ],
    });
  }

  /** A skipped take-off or fly-off: its show ends at once. */
  private skipShow(): void {
    this.tweens.killTweensOf(this.tilt);
    this.tilt.deg = 0;
    this.modeLeft = 0;
  }

  private balloonIn(colour: ColourId): void {
    const img = this.balloonImg;
    this.balloonShown = true;
    if (!img) return;
    this.tweens.killTweensOf(img);
    this.recentre(img, balloonFrame(colour));
    img.setScale(1 / this.layout.renderScale).setAlpha(1).setVisible(true);
  }

  private hideBalloon(): void {
    this.balloonShown = false;
    this.balloonImg?.setVisible(false);
  }

  /** The balloon pops (a soft burst that grows and fades) and its gift hops into the plane; the pilot cheers. */
  private caught(colour: ColourId, n: number, at: Point): void {
    const T = Tokens.Timing;
    this.hideBalloon();
    const burst = this.centred(PARTICLES.pop, at)?.setDepth(Depth.particle);
    if (burst) {
      const s = 1 / this.layout.renderScale;
      this.tweens.add({ targets: burst, alpha: 0, scale: this.reduced ? s : s * MOTION.popScale, duration: T.planeCatchMs, ease: EASE_OUT, onComplete: () => burst.destroy() });
    }
    this.show('happy', T.planeCatchMs);
    const gift = this.cargo[n - 1];
    const c = this.ctl;
    if (!gift || !c) return;
    const to = this.cargoSpot(n - 1);
    const k = MOTION.cargoScale / this.layout.renderScale;
    this.tweens.killTweensOf(gift);
    this.recentre(gift, giftFrame(colour));
    gift.setVisible(true).setAlpha(1);
    if (this.reduced) {
      gift.setPosition(to.x, to.y).setScale(k);
      return;
    }
    // It starts where the balloon was (in the plane's own frame) and hops over to its spot on board.
    const from = { x: at.x - this.planeAt.x, y: at.y - c.planeY };
    gift.setPosition(from.x, from.y).setScale(1 / this.layout.renderScale);
    this.tweens.add({ targets: gift, x: to.x, scale: k, duration: T.planeCatchMs, ease: SINE });
    this.tweens.chain({
      targets: gift,
      tweens: [
        { y: Math.min(from.y, to.y) - MOTION.giftHopPx, duration: T.planeCatchMs / 2, ease: EASE_OUT },
        { y: to.y, duration: T.planeCatchMs / 2, ease: EASE_IN },
      ],
    });
  }

  /** A cloud met the plane: the cloud puffs, a little puff flies off, the plane dips softly and comes back. */
  private cloudBump(index: number): void {
    const T = Tokens.Timing;
    this.puffUp(this.cloudImgs[index]);
    const c = this.ctl;
    const puff = c ? this.centred(PARTICLES.puff, { x: this.planeAt.x, y: c.planeY })?.setDepth(Depth.particle) : undefined;
    if (puff) this.tweens.add({ targets: puff, alpha: 0, y: puff.y - this.amp(Tokens.ui.planeBouncePx), duration: T.planeBumpMs, ease: EASE_OUT, onComplete: () => puff.destroy() });
    this.tweens.killTweensOf(this.bump);
    this.bump.dy = 0;
    this.tweens.add({ targets: this.bump, dy: this.amp(Tokens.ui.planeBouncePx), duration: T.planeBumpMs / 2, ease: SINE, yoyo: true, onComplete: () => (this.bump.dy = 0) });
  }

  /** A cloud puffs up and settles (bumped or tapped). */
  private puffUp(img: GameObjects.Image | undefined): void {
    if (!img) return;
    const base = 1 / this.layout.renderScale;
    this.tweens.killTweensOf(img);
    img.setScale(base);
    this.tweens.add({ targets: img, scale: base * (1 + this.amp(MOTION.cloudPuffScale - 1)), duration: Tokens.Timing.planeBumpMs / 2, ease: SINE, yoyo: true, onComplete: () => img.setScale(base) });
  }

  /** The tapped bird does a little loop up and back. */
  private birdLoop(): void {
    this.tweens.killTweensOf(this.birdLift);
    this.birdLift.dy = 0;
    this.tweens.add({ targets: this.birdLift, dy: -this.amp(MOTION.birdLoopPx), duration: Tokens.Timing.planeBumpMs / 2, ease: SINE, yoyo: true, onComplete: () => (this.birdLift.dy = 0) });
  }

  private surprise(id: SurpriseId, ms: number): void {
    const d = this.layout.design;
    if (id === 'rainbow') this.rainbow(ms);
    else if (id === 'flock') this.flock(ms);
    else if (id === 'hot-air') this.drift(SURPRISE_FRAMES.hotAir, d.height * MOTION.hotAirY, MOTION.hotAirScale, MOTION.hotAirWaveDeg, Depth.far, ms);
    else this.drift(SURPRISE_FRAMES.heart, d.height * MOTION.heartY, 1, 0, Depth.cloud, ms);
  }

  /** A rainbow arch comes by and the plane flies through it (it only fades in and out when reduced). */
  private rainbow(ms: number): void {
    const d = this.layout.design;
    const y = d.height * MOTION.rainbowY;
    const from = this.reduced ? d.width / 2 : d.width + MOTION.crossPadPx;
    const img = this.centred(SURPRISE_FRAMES.rainbow, { x: from, y })?.setDepth(Depth.rainbow).setAlpha(0);
    if (!img) return;
    this.tweens.add({ targets: img, x: this.reduced ? from : -MOTION.crossPadPx, duration: ms, onComplete: () => img.destroy() });
    this.tweens.chain({
      targets: img,
      tweens: [
        { alpha: 1, duration: ms * MOTION.driftFade, ease: SINE },
        { alpha: 1, duration: ms * (1 - 2 * MOTION.driftFade) },
        { alpha: 0, duration: ms * MOTION.driftFade, ease: SINE },
      ],
    });
  }

  /** A flock of little birds flies in from behind, keeps the plane company for a moment and flies on ahead. */
  private flock(ms: number): void {
    const c = this.ctl;
    if (!c) return;
    const d = this.layout.design;
    for (let i = 0; i < MOTION.flock; i++) {
      const at = { x: this.planeAt.x + MOTION.flockAheadPx + i * MOTION.flockGapPx, y: c.planeY - MOTION.flockRisePx + (i % 2) * MOTION.flockStepPx };
      const from = this.reduced ? at.x : -MOTION.crossPadPx + i * MOTION.flockGapPx;
      const b = this.centred(BIRD_FRAMES[i % BIRD_FRAMES.length]!, { x: from, y: at.y }, MOTION.flockScale)?.setDepth(Depth.bird).setAlpha(this.reduced ? 0 : 1);
      if (!b) continue;
      // The bird frames fly left; the flock flies with the plane.
      b.setFlipX(true);
      this.tweens.chain({
        targets: b,
        tweens: [
          { x: at.x, alpha: 1, duration: ms * MOTION.cross.in, ease: EASE_OUT },
          { y: at.y - this.amp(MOTION.flockStepPx / 2), duration: (ms * MOTION.cross.hold) / 2, ease: SINE, yoyo: true },
          { x: this.reduced ? at.x : d.width + MOTION.crossPadPx, alpha: this.reduced ? 0 : 1, duration: ms * MOTION.cross.out, ease: EASE_IN, onComplete: () => b.destroy() },
        ],
      });
    }
  }

  /** Something far away (the hot-air balloon, the heart cloud) fades in, drifts left a little (waving) and fades out. */
  private drift(frame: string, y: number, scale: number, waveDeg: number, depth: number, ms: number): void {
    const d = this.layout.design;
    const x = d.width * MOTION.driftStart;
    const img = this.centred(frame, { x, y }, scale)?.setDepth(depth).setAlpha(0);
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
    const deg = this.amp(waveDeg);
    if (deg !== 0) this.tweens.add({ targets: img, angle: deg, duration: ms / (2 * 2), ease: SINE, yoyo: true, repeat: 1 });
  }

  /** The gifts leave the plane one after another and float down on little parachutes to the grass by the friend. */
  private drop(gifts: readonly ColourId[], ms: number, stagger: number): void {
    const c = this.ctl;
    const to = this.anchor(ANCHORS.gifts);
    if (!c || !to) return;
    const T = Tokens.Timing;
    const stay = T.planeHappyMs * MOTION.giftStay;
    const landedAll = ms + stagger * Math.max(0, gifts.length - 1);
    gifts.forEach((colour, i) => {
      const riding = this.cargo[i];
      const start = this.cargoSpot(i);
      const from = { x: this.planeAt.x + start.x, y: c.planeY + start.y };
      const at = { x: to.x + (i - (gifts.length - 1) / 2) * MOTION.giftSpreadPx, y: to.y };
      const pack = this.add.container(from.x, from.y).setDepth(Depth.drop).setAlpha(0);
      const zero = { x: 0, y: 0 };
      const chute = this.centred(PARTICLES.parachute, { x: 0, y: -MOTION.chuteLiftPx });
      const gift = this.centred(giftFrame(colour), zero, MOTION.dropScale);
      if (chute) pack.add(chute);
      if (gift) pack.add(gift);
      const delay = i * stagger;
      // The gift on board goes as its parachute opens.
      this.time.delayedCall(delay, () => riding?.setVisible(false));
      if (chute && !this.reduced) {
        const s = 1 / this.layout.renderScale;
        chute.setScale(0, s);
        this.tweens.add({ targets: chute, scaleX: s, duration: ms * MOTION.chuteOpen, delay, ease: BACK_OUT });
      }
      const sway = this.amp(MOTION.chuteSwayDeg);
      this.tweens.add({ targets: pack, alpha: 1, duration: ms * MOTION.chuteOpen, delay, ease: SINE });
      this.tweens.add({ targets: pack, x: at.x, y: at.y, duration: ms, delay, ease: SINE });
      this.tweens.chain({
        targets: pack,
        tweens: [
          { angle: sway, duration: ms / 2, delay, ease: SINE },
          { angle: 0, duration: ms / 2, ease: SINE },
        ],
      });
      // Landed: the parachute folds away; the gift stays by the friend while it is happy, then fades.
      if (chute) this.tweens.add({ targets: chute, alpha: 0, duration: stagger, delay: delay + ms, ease: SINE });
      this.tweens.add({ targets: pack, alpha: 0, duration: stagger, delay: landedAll + stay, ease: SINE, onComplete: () => pack.destroy() });
    });
  }

  /** The friend's own happy move: its happy frame, its hops (tilting and squashing its own way), then its idle frame. */
  private friendHappy(f: FriendId, ms: number): void {
    const img = this.friendImg;
    if (!img) return;
    const move = FRIENDS[f].move;
    const y = this.friendAt.y;
    const base = 1 / this.layout.renderScale;
    this.repoint(img, friendFrame(f, 'happy'));
    this.tweens.killTweensOf(img);
    img.setScale(base).setAngle(0).setY(y);
    const each = (ms * (1 - MOTION.friendFade)) / Math.max(1, move.hops);
    const hop = this.amp(move.hopPx);
    const deg = this.amp(move.deg);
    const squash = 1 - this.amp(1 - move.squash);
    this.tweens.add({ targets: img, y: y - hop, duration: each / 2, ease: EASE_OUT, yoyo: true, repeat: move.hops - 1, onComplete: () => img.setY(y) });
    if (deg !== 0) this.tweens.add({ targets: img, angle: deg, duration: each / 2, ease: SINE, yoyo: true, repeat: move.hops - 1, onComplete: () => img.setAngle(0) });
    if (squash !== 1) this.tweens.add({ targets: img, scaleY: base * squash, duration: each / (2 * 2), delay: each / 2, ease: SINE, yoyo: true, repeat: move.hops - 1, repeatDelay: each / 2, onComplete: () => img.setScale(base) });
    this.time.delayedCall(ms, () => {
      // (The same house may still be on screen as the plane flies on.)
      if (this.shownHouse === f) this.repoint(img, friendFrame(f));
      img.setScale(base).setAngle(0).setY(y);
    });
  }

  /** A bounce from the rest scale (the hint; the friend as it arrives). */
  private bounce(target: Sprite | undefined): void {
    if (!target) return;
    const base = target === this.box ? 1 : 1 / this.layout.renderScale;
    this.tweens.add({
      targets: target,
      scale: base * (1 + this.amp(Tokens.ui.planeHintBounce - 1)),
      duration: Tokens.Timing.planeTapMs / 2,
      ease: SINE,
      yoyo: true,
      repeat: 1,
      onComplete: () => target.setScale(base),
    });
  }

  /** The idle hint: the parked plane, the balloon on its way or the friend bounces. */
  private hintAt(target: HintTarget): void {
    this.bounce(target === 'plane' ? this.box : target === 'friend' ? this.friendImg : this.balloonImg);
  }

  /** A resumed flight shows at once: the plane in the air with its gifts on board. */
  private restore(state: FlightState): void {
    const k = MOTION.cargoScale / this.layout.renderScale;
    state.gifts.forEach((colour, i) => {
      const gift = this.cargo[i];
      if (!gift) return;
      const at = this.cargoSpot(i);
      this.recentre(gift, giftFrame(colour));
      gift.setPosition(at.x, at.y).setScale(k).setAlpha(1).setVisible(true);
    });
  }
}
