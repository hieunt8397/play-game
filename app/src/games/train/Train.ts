// Tàu hỏa quanh đảo (2026-11-13, spec-tau-quanh-dao; the game since 2026-11-12, spec-tau-hoa): a ride on the island
// (content/stations › RIDES). Free play from the start (MiniGameBase.startFreePlay): no rounds, no score, no right or
// wrong. Map zoomed in on its own train; this scene starts in the same view (the island plate at 2× the map, the same
// design coordinates; core/ride-handoff carries where the train stood), so it appears without a fade.
// The train runs round the island's track; the camera follows it (camera.ts). At each friend station a friend waits on
// a little platform, a tap boards it; the volcano is the tunnel (a gentle dim, "Ú òa!"); after three friends the
// destination, a tap and they hop off and wave; the next trip starts. Taps any time: the engine toots, a car names its
// colour, a place says its name, the whale spouts. Home → `round:leave` (a trip with a friend aboard is kept); Map
// pulls back from this view (the game hands its camera's centre back).
// The scene only wires Phaser: the plate tiles, the train pieces at their arc lengths (heading frame, local scale,
// depth by y or under every sprite where one hides the track: `path.rail-back`), the sprites drawn over the train (the
// volcano, the scenery, the stations in front of the track), the barriers, the whale, the kart, the friends, the
// seats, the dim, the tap areas and tweens. The pure model (trip.ts) owns every position.
import type { GameObjects } from 'phaser';
import { ATLASES, MAP_RIDES, SCREEN_TILES, TRAIN_TILES, stateFrameName } from '../../content/assets';
import {
  ANCHORS,
  BAG_SEEDS,
  CROSSING_FRAMES,
  DESTINATION_IDS,
  DESTINATIONS,
  FREE_FRAMES,
  FRIENDS,
  FRIENDS_PER_TRIP,
  FRONT_FRAMES,
  FRONT_SPRITES,
  KART_FRAME,
  MOTION,
  OCCLUDER_COUNT,
  PATHS,
  PIECE_SPRITES,
  PLACE_IDS,
  PROMPT_LINE,
  REACTIONS,
  SFX,
  STATIONS,
  STATION_IDS,
  TUNNEL_LINE,
  WAIT_LINE,
  WHALE_FRAMES,
  WHALE_HIT,
  carLine,
  countLine,
  destAnchor,
  destHit,
  dropAnchor,
  friendAnchor,
  friendFrame,
  occluderId,
  pieceFrame,
  placeLine,
  platformHit,
  seatFrame,
  stopAnchor,
  type DestinationId,
  type FriendId,
  type StationId,
  type SurpriseId,
} from '../../content/games/train';
import type { Snapshot } from '../../content/types';
import type { Point, ScreenLayout } from '../../content/layout-types';
import { LAYOUTS } from '../../content/layouts';
import { audio } from '../../core/audio-director';
import { bus } from '../../core/bus';
import { pointInPolygon } from '../../core/input/polygon';
import { createTapRouter } from '../../core/input/tap-router';
import { headingPose, markedAt, MIN_LOOP_POINTS, smoothDirAt, TANGENT_HALF } from '../../core/map-rides';
import { DEG_TO_RAD } from '../../core/motion';
import type { ReactionSet } from '../../core/reactions';
import { prefersReducedMotion } from '../../core/reduced-motion';
import { setTrainView, takeTrainStart } from '../../core/ride-handoff';
import { mulberry32, questionSeed } from '../../core/rng';
import { Tokens } from '../../core/tokens';
import { MiniGameBase } from '../mini-game-base';
import { CameraStepper, cameraCentre, type FollowConfig } from './camera';
import { cruisePerMs, pieceDisc, railOf, type Disc, type Piece, type Rail } from './geometry';
import {
  ALL_DESTINATIONS,
  ALL_FRIENDS,
  ALL_SURPRISES,
  createShuffleBag,
  createTripController,
  resumeTrip,
  type HintTarget,
  type ShuffleBag,
  type TripController,
  type TripPlan,
  type TripProgress,
  type TripState,
} from './trip';

const SINE = 'Sine.easeInOut';
const EASE_OUT = 'Quad.easeOut';
const EASE_IN = 'Quad.easeIn';
/** How long ago a tap may still hit a moving piece (the finger lags the eye). */
const TAP_LAG_MS = Tokens.Timing.trainTapLagMs;

/** A scale pulse drawn by the scene itself (the pieces are re-placed every frame, so a tween would be lost). */
interface Pulse {
  readonly t0: number;
  readonly ms: number;
  readonly peak: number;
}

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
  private rail: Rail | undefined;
  private warned = new Set<string>();
  private resumed = false;
  /** The game appears in Map's zoomed view (no fade). */
  private seamless = false;
  private follow: FollowConfig | undefined;
  private stepper: CameraStepper | undefined;
  private centre: Point = { x: 0, y: 0 };
  private behind: (s: number) => boolean = () => false;
  private compass: readonly Point[] = [];
  private trainAt: Point = { x: 0, y: 0 };
  private seatOffset: Point = { x: 0, y: 0 };
  private friendRefK = 1;
  private pieces: (GameObjects.Image | undefined)[] = [];
  /** Per piece: the heading frame shown last (headingPose's hysteresis). */
  private headings: (number | undefined)[] = [];
  /** Per piece: a tap's wobble (degrees) on top of its rail rotation (sync sets the rotation every frame). */
  private tilts: { deg: number }[] = [];
  /** Per piece: the rotation sync drew it at last (radians; the seat offset turns with it). */
  private rotations: number[] = [];
  private seats: (GameObjects.Image | undefined)[] = [];
  private waiting = new Map<StationId, GameObjects.Image>();
  private barrierImgs: { id: string; img: GameObjects.Image | undefined }[] = [];
  private whaleImg: GameObjects.Image | undefined;
  private kartImg: GameObjects.Image | undefined;
  private dimRect: GameObjects.Rectangle | undefined;
  private discs: Disc[] = [];
  private discHistory: { t: number; discs: Disc[] }[] = [];
  private clock = 0;
  private bobClock = 0;
  private pulses = new Map<number, Pulse>();
  private seatShown = 0;
  /** The last line this game made the Speaker prompt (cleared on shutdown, and only it). */
  private prompt: string | undefined;

  constructor() {
    super('train');
  }

  protected override reactionSet(): ReactionSet {
    return REACTIONS;
  }

  /**
   * Map's zoom already shows this view (a handoff, motion on): no fade, so there is no visible cut. Any other start (a
   * resumed trip elsewhere, reduced motion after Map's fade-out, no handoff) fades in like every game.
   */
  protected override revealOnStart(): void {
    if (!this.seamless) super.revealOnStart();
  }

  protected build(): void {
    // No round, no score: free play from the start (Home → round:leave, back to the island).
    this.startFreePlay();
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS.train;
    this.pieces = [];
    this.headings = [];
    this.tilts = [];
    this.rotations = [];
    this.seats = [];
    this.waiting = new Map();
    this.barrierImgs = [];
    this.whaleImg = undefined;
    this.kartImg = undefined;
    this.dimRect = undefined;
    this.discs = [];
    this.discHistory = [];
    this.clock = 0;
    this.bobClock = 0;
    this.pulses = new Map();
    this.seatShown = 0;
    const resume = resumeTrip(this.resumeAt);
    if (this.resumeAt && !resume) console.warn('train: bad resume — a fresh trip');
    this.resumed = resume !== null;
    Train.friends ??= createShuffleBag(ALL_FRIENDS, mulberry32(questionSeed(this.seed, BAG_SEEDS.friends)));
    Train.destinations ??= createShuffleBag(ALL_DESTINATIONS, mulberry32(questionSeed(this.seed, BAG_SEEDS.destinations)));
    Train.surprises ??= createShuffleBag(ALL_SURPRISES, mulberry32(questionSeed(this.seed, BAG_SEEDS.surprises)));

    const L = this.layout;
    const design = L.design;
    const centre = { x: design.width / 2, y: design.height / 2 };
    this.addPlate();
    const railPts = L.paths[PATHS.rail];
    const upPts = L.paths[PATHS.railUp];
    this.trainAt = this.anchor(ANCHORS.train) ?? centre;
    const startS = takeTrainStart();
    this.seamless = startS !== undefined && !this.resumed && !this.reduced;
    if (!railPts || !upPts || railPts.length < MIN_LOOP_POINTS) {
      console.warn('train: the layout has no rail — nothing to play');
      return;
    }
    const rail = railOf(railPts, upPts, this.trainAt);
    this.rail = rail;
    const loop = rail.loop;
    this.behind = markedAt(loop, railPts, L.paths[PATHS.railBack] ?? []);
    this.compass = L.paths[PATHS.compass] ?? [];
    const seat = this.anchor(ANCHORS.seat) ?? this.trainAt;
    this.seatOffset = { x: seat.x - this.trainAt.x, y: seat.y - this.trainAt.y };
    const friendRef = this.anchor(ANCHORS.friend) ?? centre;
    this.friendRefK = rail.scale(loop.project(friendRef));
    const sOf = (id: string, fallback: number): number => {
      const a = this.anchor(id);
      return a ? loop.project(a) : fallback;
    };
    const stationS = loop.project(this.trainAt);
    const z = Tokens.ui.trainZoom;
    this.follow = { viewW: design.width / z, viewH: design.height / z, boundsW: design.width, boundsH: design.height, middle: Tokens.ui.trainCarPitch.reduce((a, b) => a + b, 0) / 2, lead: Tokens.ui.trainCameraLead };
    this.cameras.main.setZoom(z);

    const router = createTapRouter(this, {
      toWorld: (p) => {
        const w = this.cameras.main.getWorldPoint(p.x, p.y);
        return { x: w.x, y: w.y };
      },
    });
    this.addFronts();
    this.addTrain();
    this.addWaiting();
    const bleed = MOTION.dimBleedPx;
    this.dimRect = this.add
      .rectangle(-bleed, -bleed, design.width + 2 * bleed, design.height + 2 * bleed, Tokens.art.train.tunnelInside.value, 1)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(MOTION.depthDim)
      .setAlpha(0);

    const tIn = this.anchor(ANCHORS.tunnelIn);
    const tOut = this.anchor(ANCHORS.tunnelOut);
    const cruise = cruisePerMs(loop.length, this.reduced);
    const ctl = createTripController({
      friends: Train.friends,
      destinations: Train.destinations,
      surprises: Train.surprises,
      rng: mulberry32(questionSeed(this.seed, BAG_SEEDS.stations)),
      world: {
        rail,
        pitch: Tokens.ui.trainCarPitch,
        stations: Object.fromEntries(STATION_IDS.map((s) => [s, sOf(stopAnchor(s), stationS)])) as Record<StationId, number>,
        dests: Object.fromEntries(DESTINATION_IDS.map((d) => [d, sOf(stopAnchor(d), stationS)])) as Record<DestinationId, number>,
        tunnel: tIn && tOut ? { from: loop.project(tIn), to: loop.project(tOut) } : undefined,
        crossing: { from: sOf(ANCHORS.crossingFrom, 0), to: sOf(ANCHORS.crossingTo, 0) },
        crossingMargin: Tokens.ui.trainCrossingMargin,
        kartS: sOf(ANCHORS.crossingFrom, 0),
        whaleS: sOf(ANCHORS.whale, 0),
        cruise,
      },
      startS: startS ?? stationS,
      resume,
      lines: {
        prompt: PROMPT_LINE,
        wait: WAIT_LINE,
        station: (s) => STATIONS[s].line,
        board: (f) => FRIENDS[f].boardLine,
        count: countLine,
        car: carLine,
        tunnel: TUNNEL_LINE,
        dest: (d) => DESTINATIONS[d].line,
        place: placeLine,
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
        planned: (plan, aboard) => this.planned(plan, aboard),
        depart: () => undefined,
        arrived: (at) => this.arrived(at),
        board: (f, st, car, ms) => this.board(f, st, car, ms),
        dropoff: (d, friends, ms, stagger) => this.dropoff(d, friends, ms, stagger),
        toot: () => this.toot(),
        wobble: (n) => this.wobble(n),
        tunnelIn: () => undefined,
        tunnelOut: () => this.pulse(0, Tokens.ui.trainHintBounce),
        barriers: (down) => this.setBarriers(down),
        surprise: (kind, ms) => this.surprise(kind, ms),
        whaleTapped: () => this.spout(),
        hint: (target) => this.hintAt(target),
        restore: (state) => this.restore(state),
      },
    });
    this.ctl = ctl;

    // Any press restarts the idle clock.
    router.onAnyTap = () => ctl.anyTap();
    // The places say their name (z 0); the whale spouts (z 1); the train's pieces (z 2); the waiting friend and the
    // destination (z 3): the higher wins where they overlap.
    for (const id of PLACE_IDS) {
      const hull = L.hits[id];
      if (hull) router.add({ z: MOTION.tapZ.place, contains: (p) => pointInPolygon(p, hull), isEnabled: () => true, onPress: () => void ctl.tapPlace(id) });
    }
    const whale = L.hits[WHALE_HIT];
    if (whale) router.add({ z: MOTION.tapZ.whale, contains: (p) => pointInPolygon(p, whale), isEnabled: () => true, onPress: () => void ctl.tapWhale() });
    for (let n = 0; n < PIECE_SPRITES.length; n++) {
      router.add({
        z: MOTION.tapZ.piece,
        contains: (p) => this.onPiece(p, n),
        isEnabled: () => true,
        onPress: () => void (n === 0 ? ctl.tapTrain() : ctl.tapCar(n - 1)),
      });
    }
    router.add({ z: MOTION.tapZ.waiting, contains: (p) => this.onFriend(p), isEnabled: () => true, onPress: () => void ctl.tapFriend() });
    router.add({ z: MOTION.tapZ.waiting, contains: (p) => this.onDest(p), isEnabled: () => true, onPress: () => void ctl.tapDest() });
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
    this.centre = cameraCentre(loop, ctl.s, this.follow);
    this.stepper = this.reduced ? new CameraStepper(this.centre) : undefined;
    this.cameras.main.centerOn(this.centre.x, this.centre.y);
    this.sync(0);
  }

  protected progress(): TripProgress {
    return this.ctl?.progress() ?? { questionIndex: 0, partial: { friends: [], aboard: 0, stops: [], dest: '', surprise: '' } };
  }

  /** Home with a friend aboard: the trip is kept (Map stores the snapshot) and comes back next time; otherwise nothing. */
  protected override leaveSnapshot(): Snapshot<'train'> | undefined {
    return this.ctl?.hasProgress ? this.snapshot() : undefined;
  }

  protected override leave(): void {
    this.ctl?.stop();
    // Map pulls back from this very view.
    if (this.rail) setTrainView(this.centre);
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
    const ok = this.textures.exists(key) && this.textures.get(key).has(frame);
    if (!ok) this.warnOnce(frame, `train: frame "${frame}" is missing`);
    return ok;
  }

  /** A full-frame image of `frame` whose design point `pivot` is its origin, drawn at `at`, at `scale` of its size. */
  private pivoted(frame: string, pivot: Point, at: Point, scale = 1): GameObjects.Image | undefined {
    if (!this.hasFrame(frame)) return undefined;
    const d = this.layout.design;
    return this.add
      .image(at.x, at.y, ATLASES.train.key, frame)
      .setOrigin(pivot.x / d.width, pivot.y / d.height)
      .setScale(scale / this.layout.renderScale);
  }

  /** `frame` drawn with its trimmed centre on `at`. */
  private centred(frame: string, at: Point, scale = 1): GameObjects.Image | undefined {
    if (!this.hasFrame(frame)) return undefined;
    const f = this.textures.get(ATLASES.train.key).get(frame);
    const rs = this.layout.renderScale;
    const ss = (f.customData as { spriteSourceSize?: { x: number; y: number; w: number; h: number } } | undefined)?.spriteSourceSize;
    const c = ss ? { x: (ss.x + ss.w / 2) / rs, y: (ss.y + ss.h / 2) / rs } : at;
    return this.pivoted(frame, c, at, scale);
  }

  /** The local scale where a friend stands, relative to where its frames were rendered. */
  private friendScale(at: Point): number {
    const rail = this.rail;
    return rail ? rail.scale(rail.loop.project(at)) / this.friendRefK : 1;
  }

  private onPiece(p: Point, n: number): boolean {
    const inDisc = (d: Disc | undefined): boolean => d !== undefined && Math.hypot(p.x - d.x, p.y - d.y) <= d.r;
    return inDisc(this.discs[n]) || this.discHistory.some((e) => inDisc(e.discs[n]));
  }

  /** At a station: the platform's tap area (the friend and its platform). */
  private onFriend(p: Point): boolean {
    const c = this.ctl;
    const st = c?.station;
    if (!c || c.phase !== 'wait' || !st) return false;
    const hull = this.layout.hits[platformHit(st)];
    return hull !== undefined && pointInPolygon(p, hull);
  }

  /** At the destination: its tap area. */
  private onDest(p: Point): boolean {
    const c = this.ctl;
    if (!c || c.phase !== 'dest') return false;
    const hull = this.layout.hits[destHit(c.plan.dest)];
    return hull !== undefined && pointInPolygon(p, hull);
  }

  // --- the props ---------------------------------------------------------------------------------------------

  /** The island plate, in tiles side by side. */
  private addPlate(): void {
    const grid = SCREEN_TILES.train;
    const d = this.layout.design;
    if (!grid) return;
    TRAIN_TILES.forEach((t, n) => {
      if (!this.textures.exists(t.key)) {
        this.warnOnce(t.key, `train: texture "${t.key}" is missing — tile skipped`);
        return;
      }
      const col = n % grid.cols;
      const row = Math.floor(n / grid.cols);
      this.add
        .image((col * d.width) / grid.cols, (row * d.height) / grid.rows, t.key)
        .setOrigin(0)
        .setScale(1 / this.layout.renderScale)
        .setDepth(MOTION.depthPlate);
    });
  }

  /** The sprites drawn by depth (y): the volcano, the scenery and stations in front of the track, the barriers, the whale, the kart. */
  private addFronts(): void {
    const still = (frame: string, id: string): GameObjects.Image | undefined => {
      const a = this.anchor(id);
      return a ? this.pivoted(frame, a, a)?.setDepth(a.y) : undefined;
    };
    const ids = [MAP_RIDES.volcano, ...Array.from({ length: OCCLUDER_COUNT }, (_, i) => occluderId(i + 1)), ...FRONT_SPRITES];
    ids.forEach((id, i) => still(FRONT_FRAMES[i] ?? stateFrameName(id), id));
    this.barrierImgs = MAP_RIDES.crossings.map((id, i) => ({ id, img: still(CROSSING_FRAMES[2 * i]!, id) }));
    this.whaleImg = still(WHALE_FRAMES.idle, ANCHORS.whale);
    this.kartImg = still(KART_FRAME, ANCHORS.kart)?.setVisible(false);
  }

  /** The train's pieces and the seats (a friend sitting in a car). */
  private addTrain(): void {
    PIECE_SPRITES.forEach((_s, p) => this.pieces.push(this.pivoted(pieceFrame(p, 0), this.trainAt, this.trainAt)));
    const seatAt = this.anchor(ANCHORS.seat) ?? this.trainAt;
    for (let n = 0; n < FRIENDS_PER_TRIP; n++) this.seats.push(this.pivoted(seatFrame(ALL_FRIENDS[0]!), seatAt, seatAt)?.setVisible(false));
  }

  /** A friend image on each station's platform (shown when a trip waits there). */
  private addWaiting(): void {
    const ref = this.anchor(ANCHORS.friend) ?? this.trainAt;
    for (const st of STATION_IDS) {
      const at = this.anchor(friendAnchor(st));
      if (!at) continue;
      const img = this.pivoted(friendFrame(ALL_FRIENDS[0]!), ref, at, this.friendScale(at))?.setDepth(MOTION.depthWaiting).setVisible(false);
      if (img) this.waiting.set(st, img);
    }
  }

  // --- every frame: draw what the model says -------------------------------------------------------------------

  private pulseOf(n: number): number {
    const p = this.pulses.get(n);
    if (!p) return 1;
    const k = (this.clock - p.t0) / p.ms;
    if (k >= 1) {
      this.pulses.delete(n);
      return 1;
    }
    return 1 + this.amp(p.peak - 1) * Math.sin(Math.PI * Math.max(0, k));
  }

  /** Piece `n` pulses (0: the engine). */
  private pulse(n: number, peak: number): void {
    this.pulses.set(n, { t0: this.clock, ms: Tokens.Timing.trainTapMs, peak });
  }

  private sync(delta: number): void {
    const c = this.ctl;
    const rail = this.rail;
    if (!c || !rail || !this.follow) return;
    this.clock += delta;
    const loop = rail.loop;
    const moving = c.speed > 0;
    if (moving && !this.reduced) this.bobClock += delta;
    const T = Tokens.Timing;
    const rs = this.layout.renderScale;
    const d = this.layout.design;
    const discs: Disc[] = [];
    c.pieces.forEach((piece: Piece, n) => {
      const img = this.pieces[n];
      const p = loop.pointAt(piece.s);
      const hidden = c.hidden(piece);
      const bob = moving && !this.reduced ? (Math.floor(this.bobClock / T.trainWheelFrameMs + n * MOTION.carLag) % 2) * MOTION.bobPx : 0;
      const depth = this.behind(piece.s) ? Tokens.ui.mapTrainBackDepth : p.y;
      // 2026-11-27 (spec-sua-tau-va-ten-lua-tren-dao): the frame from the rail's smoothed tangent (with hysteresis),
      // turned by the residual (plus a tap's wobble) so the piece lines up with the rail; its seated friend turns with it.
      const pose = headingPose(smoothDirAt(loop, piece.s, TANGENT_HALF * piece.k), this.compass, this.headings[n]);
      this.headings[n] = pose.frame;
      const frame = pieceFrame(n, pose.frame);
      const rotation = pose.rotation + (this.tilts[n]?.deg ?? 0) * DEG_TO_RAD;
      this.rotations[n] = rotation;
      const off = this.seatAt(n);
      if (img) {
        if (img.frame.name !== frame && this.hasFrame(frame)) img.setFrame(frame, false, false).setOrigin(this.trainAt.x / d.width, this.trainAt.y / d.height);
        img
          .setRotation(rotation)
          .setPosition(p.x, p.y - bob * piece.k)
          .setScale((piece.k * this.pulseOf(n)) / rs)
          .setDepth(depth)
          .setVisible(!hidden);
      }
      if (!hidden) discs.push(pieceDisc(rail, piece, { engineR: Tokens.ui.trainEngineHitR, carR: Tokens.ui.trainCarHitR, lift: Tokens.ui.trainPieceLift }));
      else discs.push({ x: -1, y: -1, r: 0 });
      const seat = n > 0 ? this.seats[n - 1] : undefined;
      if (seat && n - 1 < this.seatShown) {
        seat
          .setPosition(p.x + off.x * piece.k, p.y + off.y * piece.k - bob * piece.k)
          .setRotation(rotation)
          .setScale((piece.k * this.pulseOf(n)) / rs)
          .setDepth(depth + MOTION.seatOver)
          .setVisible(!hidden);
      }
    });
    this.discs = discs;
    this.discHistory.push({ t: this.clock, discs });
    while (this.discHistory.length > 0 && this.clock - this.discHistory[0]!.t > TAP_LAG_MS) this.discHistory.shift();
    // The camera: it follows (or, under reduced motion, steps).
    const target = cameraCentre(loop, c.s, this.follow);
    if (this.stepper) {
      const k = rail.scale(c.s);
      // A step averages the train's cruise (its eased peak is π/2 × it): a slower step falls further behind each time
      // (review 2026-11-13). Once the train stands, the camera steps right onto its stop's view, so the waiting tap area
      // is framed as validateTrain checks it.
      const maxSpeed = (cruisePerMs(loop.length, true) * k * Math.PI) / 2;
      const threshold = c.speed > 0 ? this.follow.viewW * Tokens.ui.trainCameraStepShare : 0;
      this.centre = this.stepper.tick(target, delta, { threshold, minMs: T.trainCameraStepMinMs, maxSpeed });
    } else this.centre = target;
    this.cameras.main.centerOn(this.centre.x, this.centre.y);
    // The tunnel's dim (never black: at most trainDimMax).
    const max = this.reduced ? Tokens.ui.trainDimReduced : Tokens.ui.trainDimMax;
    this.dimRect?.setAlpha(max * c.dim);
  }

  // --- the model's view ----------------------------------------------------------------------------------------

  /** A trip is planned: its friends wait on their platforms; the kart waits at the crossing for its surprise. */
  private planned(plan: TripPlan, aboard: number): void {
    for (const img of this.waiting.values()) img.setVisible(false);
    plan.stops.forEach((st, i) => {
      const img = this.waiting.get(st);
      const f = plan.friends[i];
      if (!img || !f || i < aboard) return;
      if (this.hasFrame(friendFrame(f))) img.setFrame(friendFrame(f), false, false);
      img.setVisible(true).setAlpha(1);
    });
    this.kartImg?.setVisible(plan.surprise === 'kart');
    if (aboard === 0) {
      this.seatShown = 0;
      for (const s of this.seats) s?.setVisible(false);
    }
  }

  /** The train stops: the waiting friend bounces (at the whale's bay, the whale spouts). */
  private arrived(at: { station: StationId; friend: FriendId } | { dest: DestinationId }): void {
    if ('station' in at) this.bounce(this.waiting.get(at.station));
    else if (at.dest === 'whale') this.spout();
  }

  /** The waiting friend hops from its platform into car `car` (an arc), then sits there. */
  private board(f: FriendId, st: StationId, car: number, ms: number): void {
    const from = this.waiting.get(st);
    const piece = this.ctl?.pieces[car + 1];
    const loop = this.rail?.loop;
    const done = (): void => {
      const seat = this.seats[car];
      if (seat && this.hasFrame(seatFrame(f))) seat.setFrame(seatFrame(f), false, false);
      this.seatShown = Math.max(this.seatShown, car + 1);
      this.pulse(car + 1, MOTION.carSquash);
      if (piece && loop) this.popAt({ x: loop.pointAt(piece.s).x, y: loop.pointAt(piece.s).y - MOTION.popRisePx * piece.k });
    };
    if (!from || !piece || !loop) {
      from?.setVisible(false);
      this.time.delayedCall(ms, done);
      return;
    }
    const g = loop.pointAt(piece.s);
    const off = this.seatAt(car + 1);
    const seat = { x: g.x + off.x * piece.k, y: g.y + off.y * piece.k };
    from.setVisible(false);
    const ref = this.anchor(ANCHORS.friend) ?? this.trainAt;
    const hopper = this.pivoted(friendFrame(f), ref, { x: from.x, y: from.y }, from.scaleX * this.layout.renderScale)?.setDepth(MOTION.depthParticle);
    if (!hopper) {
      this.time.delayedCall(ms, done);
      return;
    }
    if (this.reduced) {
      this.tweens.add({ targets: hopper, alpha: 0, duration: ms, ease: SINE, onComplete: () => hopper.destroy() });
      this.time.delayedCall(ms, done);
      return;
    }
    const end = (piece.k * MOTION.hopScale) / this.layout.renderScale;
    this.tweens.add({ targets: hopper, x: seat.x, scale: end, duration: ms, ease: SINE });
    this.tweens.chain({
      targets: hopper,
      tweens: [
        { y: Math.min(from.y, seat.y) - MOTION.boardHopPx * piece.k, duration: ms * MOTION.hopUp, ease: EASE_OUT },
        { y: seat.y, duration: ms * (1 - MOTION.hopUp), ease: EASE_IN },
      ],
    });
    this.time.delayedCall(ms, () => {
      hopper.destroy();
      done();
    });
  }

  /** At the destination the friends hop off one by one (car 0 first) to their spots, wave, stay a while and fade. */
  private dropoff(d: DestinationId, friends: readonly FriendId[], ms: number, stagger: number): void {
    const loop = this.rail?.loop;
    const ref = this.anchor(ANCHORS.friend) ?? this.trainAt;
    friends.forEach((f, i) => {
      const spot = this.anchor(dropAnchor(d, i));
      const piece = this.ctl?.pieces[i + 1];
      if (!spot || !piece || !loop) return;
      this.time.delayedCall(i * stagger, () => {
        this.seats[i]?.setVisible(false);
        this.seatShown = Math.min(this.seatShown, i);
        const g = loop.pointAt(piece.s);
        const off = this.seatAt(i + 1);
        const from = { x: g.x + off.x * piece.k, y: g.y + off.y * piece.k };
        const k = this.friendScale(spot);
        const img = this.pivoted(friendFrame(f, 'happy'), ref, from, k * MOTION.hopScale)?.setDepth(MOTION.depthParticle);
        if (!img) return;
        const land = (): void => {
          img.setDepth(spot.y).setPosition(spot.x, spot.y).setScale(k / this.layout.renderScale);
          this.wave(img, f);
          this.tweens.add({ targets: img, alpha: 0, delay: Tokens.Timing.trainDropLingerMs, duration: Tokens.Timing.trainPuffMs, onComplete: () => img.destroy() });
        };
        if (this.reduced) {
          land();
          return;
        }
        this.tweens.add({ targets: img, x: spot.x, scale: k / this.layout.renderScale, duration: ms, ease: SINE });
        this.tweens.chain({
          targets: img,
          tweens: [
            { y: Math.min(from.y, spot.y) - MOTION.dropHopPx * piece.k, duration: ms * MOTION.hopUp, ease: EASE_OUT },
            { y: spot.y, duration: ms * (1 - MOTION.hopUp), ease: EASE_IN, onComplete: land },
          ],
        });
      });
    });
  }

  /** A dropped friend waves (its wave frame, tilting a little), then stays happy. */
  private wave(img: GameObjects.Image, f: FriendId): void {
    if (this.hasFrame(friendFrame(f, 'wave'))) img.setFrame(friendFrame(f, 'wave'), false, false);
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
        if (img.active && this.hasFrame(friendFrame(f, 'happy'))) img.setFrame(friendFrame(f, 'happy'), false, false);
      },
    });
  }

  /** The toot: a soft puff that rises from the chimney, grows and fades; the engine pulses. */
  private toot(): void {
    this.pulse(0, Tokens.ui.trainHintBounce);
    const c = this.ctl;
    const loop = this.rail?.loop;
    const engine = c?.pieces[0];
    if (!c || !loop || !engine || c.hidden(engine)) return;
    const g = loop.pointAt(engine.s);
    const at = { x: g.x, y: g.y - MOTION.chimneyPx * engine.k };
    const puff = this.centred(FREE_FRAMES.puff, at, MOTION.puffStart * engine.k)?.setDepth(MOTION.depthParticle).setAlpha(MOTION.puffAlpha);
    if (!puff) return;
    const s = engine.k / this.layout.renderScale;
    this.tweens.add({
      targets: puff,
      y: at.y - this.amp(MOTION.puffRisePx) * engine.k,
      scale: s * (this.reduced ? MOTION.puffReducedScale : MOTION.puffScale * MOTION.puffStart),
      alpha: 0,
      duration: Tokens.Timing.trainPuffMs,
      ease: EASE_OUT,
      onComplete: () => puff.destroy(),
    });
  }

  /** A little pop over a seat as a friend lands. */
  private popAt(at: Point): void {
    const pop = this.centred(FREE_FRAMES.pop, at, MOTION.popScale)?.setDepth(MOTION.depthParticle);
    if (pop) this.tweens.add({ targets: pop, alpha: 0, scale: MOTION.popEnd / this.layout.renderScale, duration: Tokens.Timing.trainBumpMs, ease: EASE_OUT, onComplete: () => pop.destroy() });
  }

  /** The seat's offset from piece `n`'s rail point (unscaled), turned by the rotation the piece was last drawn at. */
  private seatAt(n: number): Point {
    const rotation = this.rotations[n] ?? 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return { x: this.seatOffset.x * cos - this.seatOffset.y * sin, y: this.seatOffset.x * sin + this.seatOffset.y * cos };
  }

  /** A tapped car wobbles twice. */
  private wobble(n: number): void {
    if (!this.pieces[n + 1]) return;
    // sync turns the car (and the friend sitting in it) by its tilt on top of the rail's rotation
    const tilt = (this.tilts[n + 1] ??= { deg: 0 });
    this.tweens.killTweensOf(tilt);
    tilt.deg = 0;
    this.tweens.add({ targets: tilt, deg: this.amp(MOTION.wobbleDeg), duration: Tokens.Timing.trainWobbleMs / MOTION.wobbleSwings, ease: SINE, yoyo: true, repeat: 1, onComplete: () => (tilt.deg = 0) });
  }

  private setBarriers(down: boolean): void {
    for (const b of this.barrierImgs) {
      const a = this.layout.anchors[b.id];
      const frame = stateFrameName(b.id, down ? 'down' : 'up');
      if (b.img && a && this.hasFrame(frame)) b.img.setFrame(frame, false, false);
    }
  }

  /** The whale spouts (its spout frames, then idle). */
  private spout(): void {
    const img = this.whaleImg;
    if (!img) return;
    const frames = this.reduced ? [WHALE_FRAMES.spout[0]!] : [...WHALE_FRAMES.spout];
    frames.forEach((f, i) => this.time.delayedCall(i * MOTION.spoutFrameMs, () => img.active && this.hasFrame(f) && img.setFrame(f, false, false)));
    this.time.delayedCall(frames.length * MOTION.spoutFrameMs, () => img.active && img.setFrame(WHALE_FRAMES.idle, false, false));
  }

  /** The trip's surprise: the kart's driver waves, the whale spouts, the boat or the balloon drifts by. */
  private surprise(kind: SurpriseId, ms: number): void {
    if (kind === 'whale') {
      this.spout();
      return;
    }
    if (kind === 'kart') {
      const k = this.kartImg;
      if (!k) return;
      this.tweens.killTweensOf(k);
      const y = this.layout.anchors[ANCHORS.kart]?.y ?? k.y;
      k.setY(y);
      this.tweens.add({ targets: k, y: y - this.amp(MOTION.kartHopPx), duration: Tokens.Timing.trainBumpMs / 2, ease: SINE, yoyo: true, repeat: MOTION.waves - 1, onComplete: () => k.setY(y) });
      return;
    }
    const f = this.follow;
    const loop = this.rail?.loop;
    const c = this.ctl;
    if (!f || !loop || !c) return;
    let at: Point;
    if (kind === 'boat') {
      // On the sea, just off the track's outer side (the loop runs counter-clockwise: outside is the left of travel on screen).
      const p = loop.pointAt(c.s);
      const dir = loop.dirAt(c.s);
      const d = this.layout.design;
      at = { x: Math.max(0, Math.min(d.width, p.x - dir.y * MOTION.boatOutPx)), y: Math.max(0, Math.min(d.height, p.y + dir.x * MOTION.boatOutPx)) };
    } else {
      at = { x: this.centre.x + (MOTION.hotAirAt.x - 0.5) * f.viewW, y: this.centre.y + (MOTION.hotAirAt.y - 0.5) * f.viewH };
    }
    const img = this.centred(kind === 'boat' ? FREE_FRAMES.boat : FREE_FRAMES.hotAir, at)?.setAlpha(0).setDepth(kind === 'boat' ? at.y : MOTION.depthParticle);
    if (!img) return;
    this.tweens.add({ targets: img, x: at.x - this.amp(MOTION.driftPx), duration: ms, ease: SINE, onComplete: () => img.destroy() });
    this.tweens.chain({
      targets: img,
      tweens: [
        { alpha: 1, duration: ms * MOTION.driftFade, ease: SINE },
        { alpha: 1, duration: ms * (1 - 2 * MOTION.driftFade) },
        { alpha: 0, duration: ms * MOTION.driftFade, ease: SINE },
      ],
    });
  }

  /** A bounce from the rest scale (the hint; the friend as the train stops). */
  private bounce(target: GameObjects.Image | undefined): void {
    if (!target) return;
    const base = (target.getData('restScale') as number | undefined) ?? target.scaleX;
    target.setData('restScale', base);
    this.tweens.killTweensOf(target);
    target.setScale(base);
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

  /** The idle hint: the waiting train toots, the friend on its platform bounces, the destination pops. */
  private hintAt(target: HintTarget): void {
    const c = this.ctl;
    if (!c) return;
    if (target === 'train') {
      this.toot();
      return;
    }
    if (target === 'friend') {
      const st = c.station;
      this.bounce(st ? this.waiting.get(st) : undefined);
      return;
    }
    const at = this.layout.anchors[destAnchor(c.plan.dest)];
    if (at) this.popAt(at);
  }

  /** A resumed trip shows at once: its friends aboard in their cars. */
  private restore(state: TripState): void {
    for (let n = 0; n < Math.min(state.aboard, FRIENDS_PER_TRIP); n++) {
      const f = state.friends[n];
      const seat = this.seats[n];
      if (f && seat && this.hasFrame(seatFrame(f))) seat.setFrame(seatFrame(f), false, false);
    }
    this.seatShown = Math.min(state.aboard, FRIENDS_PER_TRIP);
  }
}

