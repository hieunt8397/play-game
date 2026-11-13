// Map (Stories 1.5, 1.7): the island. Draws the plate `bg.map`, the 7 station sprites from `atlas.map`
// (full-frame on their ground pivots, spec-1-4 contract), a static parent-facing label under each
// station and the kart on the road. Taps go through core/input (one router per scene):
//   - awake station (in games/registry GAMES) → core/kart-trip: bounce + name, the game's assets
//     start loading, the kart drives along `paths.road` to the station's stop, the camera zooms in
//     (core/motion; a fade under reduced motion) and the shell starts the game; Map sleeps;
//   - sleeping station → bounce + happy sound; kart → bounce + beep (a boost while driving);
//   - every tap resets idle (core/map-idle), which is suspended while the kart travels.
// The running game's last event (`round:leave` after free play / `round:abandon`) stops it and wakes Map:
// the kart stays parked at `SessionStore.lastStation`. The game's own assets are removed when its scene
// shuts down (AR39). The next start reads the level back (SessionStore.startData → ProgressStore.getDifficulty).
// Island decorations (Stories 2.2 / 2.3 / 5.5: gifts offered, chosen, flown in and drawn) were removed at
// runtime by parent decision 2026-10-21; the map art still carries their atlas frames.
// Story 2.3: the post-round chain (core/post-round-chain) runs on a finished round: setDifficulty(nextLevel)
// and clearResume synchronously → stop the game and wake → camera pull-back on the station (core/motion)
// → `onChainEnd`. Meanwhile idle is suspended, station taps are queued (the last one applies at the end
// instead of onChainEnd) and kart taps are ignored. Taps are hit-tested in camera world space (router
// `toWorld`). `round:abandon` keeps the Story 1.7 fade return.
// Story 5.8 (FR32): a finished round stays on screen in free play. `round:complete` only settles it
// (chain.settle: setDifficulty + clearResume at once, so a reload keeps them; the game keeps running and
// Map stays asleep); Home in free play emits `round:leave`, which starts the `complete` chain (steps 1–2
// skipped) → stop and wake → pull-back → onChainEnd → Map idle ("Mời chơi").
// Seamless play (2026-10-21): the game emits `round:next` after its celebration and fade; Map
// (core/post-round-chain › routeRoundNext) restarts the same scene in place with fresh start data
// (takeStartData: the settled level, a new seed, never a resume) and keeps its assets loaded (the
// restart's SHUTDOWN does not release them). A late `round:next` (a chain running, another game) is
// ignored. The Story 2.4 overlay that asked to play again was removed; the chain end always returns Map
// to idle.
// Story 2.5: on `round:abandon` from the running game Map keeps its snapshot (SessionStore.setResume,
// synchronously, before the return path above). A station holding one shows a static resume mark
// (core/resume-marks + core/ui/resume-mark), synced on create, on every wake and at each start. The next
// entry starts with `{ level: snapshot.level, seed: snapshot.seed, resume }`, and
// every start clears that game's resume point (a resumed start consumes it).
// Story 5.2: the guide Shiba (core/map-guide) stands beside the ice-cream truck as its own sprite and
// hotspot (registered after the stations, before the kart, so it wins an overlap with the truck). On
// the first Map entry of a session it waves and greets "Xoài ơi, chơi gì nào?"; it waves with each idle
// invitation; a tap bounces it with a small "gâu" (ignored during the post-round chain).
// The wave swaps its frames on a scene `time` loop (core/map-guide › waveFrame), back to idle at the end.
// Story 5.4: a tap on empty island shows a light ripple (core/ui/tap-reactions, below every target; not
// during the chain or a skip tap).
// Story 5.6: the island's ambient life (core/map-plan › planAmbient, MAP_AMBIENT), drawn without hotspots
// (a tap on it is a background tap): the clouds drift and the foam waves bob (core/map-ambient, at
// ui.mapAmbientBackDepth: above the plate, below the stations) and the fountain loops its jets, all on a
// clamped ambient clock advanced in `update` (frozen while Map is paused or asleep; reduced motion: slower
// drift, smaller bob, a still fountain). The whale spouts on the idle scheduler's `periodic` channel
// (core/map-idle, with ambientBusyMs: never with a station bounce or an invitation), a frame loop on scene
// `time` like the guide's wave (core/map-ambient › spoutFrame), then idle; it still plays under reduced motion.
// Story 7.1: the home station "Nhà Xoài" (content/stations › HOME_STATION) is not a game: its trip loads the
// yard's assets (content/home › HOME_ASSETS), zooms in like a station and starts the HomeYard shell scene
// (Map sleeps). The yard asks for a corner's game with `yard:open`. The decisions are the pure reducer
// core/shell-nav (navYardOpen → routeYardOpen, navRestart, navReturn, navLeaveYard); Map applies its effects:
// it starts the game like an island game (takeStartData, release arming, resume marks) with `origin: 'yard'`
// and the Hud's Home target 'yard', and sleeps the yard; the game's `round:leave` / `round:abandon` fade
// back to the yard (never the island), `round:next` restarts it in place keeping that origin. `yard:leave` (Home in the yard)
// stops the yard and wakes Map, the kart parked at `home-stop`; the yard's assets are released when it
// shuts down.
// 2026-11-13 (spec-dao-moi-xe-ra-dao): the rides (content/stations › RIDES; scenes/map-rides-view, core/map-rides): the
// toy train going round the island's rail loop, the plane on its airstrip (it takes off for a loop now and then), the
// rocket on its pad. A tap on one (z 1: it wins over a station) bounces it and says its name, loads its game, zooms
// in on it and starts the game with origin 'island' — the kart does not move. Ignored while the kart drives, a chain
// runs or a game is opening. Every wake parks the train at Ga tàu and the plane on its strip.
// Timing, routing and geometry are pure core code; this
// scene only wires Phaser. The kart moves only in `update` (no timers or tweens), so a pause freezes it.
import { Scene, type GameObjects, type Time } from 'phaser';
import { ATLASES, BACKGROUNDS, MAP_AMBIENT, MAP_GUIDE, MAP_KART, MAP_RIDES } from '../content/assets';
import type { Point } from '../content/layout-types';
import { isIslandGameId, isRideGameId, type GameId, type GameStartData, type RideGameId } from '../content/types';
import { LAYOUTS } from '../content/layouts';
import { HOME_ASSETS, YARD_SCENE_KEY } from '../content/home';
import { HOME_STATION, isHomeStation, KART_START_ANCHOR, RIDES, ROAD_PATH, STATIONS, stopAnchor } from '../content/stations';
import type { GameAssets } from '../content/games/types';
import { inviteLine, islandPrompt, stationNameLine } from '../content/voice-lines';
import { audio } from '../core/audio-director';
import { bus } from '../core/bus';
import { AssetTracker, loadPlan, releasePlan } from '../core/game-assets';
import { createHintRing, type HintRing } from '../core/hint-visuals';
import { setHomeTarget, setHudMode } from '../core/hud-mode';
import { HotspotPolygon } from '../core/input/hotspot-polygon';
import { boundingBox, pointInPolygon } from '../core/input/polygon';
import { createTapRouter, type TapRouter } from '../core/input/tap-router';
import { createTapTarget, type TapTarget } from '../core/input/tap-target';
import { KART_TARGET, KartTrip, type TripCommand } from '../core/kart-trip';
import { createMapGuide, waveFrame, type GuideCommand, type MapGuide } from '../core/map-guide';
import { driftX, loopFrame, spoutFrame, waveBob } from '../core/map-ambient';
import { createMapIdle, MAX_TICK_MS, type MapIdle, type MapIdleEvent } from '../core/map-idle';
import {
  planMap,
  type MapPlan,
  type PlannedAmbient,
  type PlannedAmbientInstance,
  type PlannedGuide,
  type PlannedImage,
  type PlannedKart,
  type PlannedStation,
} from '../core/map-plan';
import { enterStation, pullBack, revealScene } from '../core/motion';
import {
  chainAnimMs,
  keepAbandonSnapshot,
  PostRoundChain,
  routeChainEnd,
  routeRoundAbandon,
  routeRoundComplete,
  onRoundLeave,
  routeRoundNext,
  type ChainEnd,
  type RunningGame,
  type ChainFinish,
  type TerminalRoute,
} from '../core/post-round-chain';
import { ProgressStore } from '../core/progress-store';
import { amplitude, prefersReducedMotion } from '../core/reduced-motion';
import { ReleaseArming } from '../core/release-arming';
import { navEnterYard, navLeaveYard, navRestart, navReturn, navYardClosed, navYardOpen, type NavStep, type ShellNav } from '../core/shell-nav';
import { resumeMarkPlan } from '../core/resume-marks';
import { createRoad } from '../core/road';
import { session, takeStartData } from '../core/session-store';
import type { Skip } from '../core/skip';
import { createSceneSkip } from '../core/skip-scene';
import { Tokens } from '../core/tokens';
import { attachOutfit, type LayerImage, type OutfitLayers } from '../core/outfit-layers';
import { drawResumeMark } from '../core/ui/resume-mark';
import { bob, bounce, isMoving, stopMotion } from '../core/ui/scale-motion';
import { addStationLabel } from '../core/ui/station-label';
import { attachTapReactions } from '../core/ui/tap-reactions';
import { GAMES, isGameId, ladderLength } from '../games/registry';
import { createMapRides, type MapRidesView } from './map-rides-view';

const HUD_KEY = 'Hud';
const WAKE = 'wake';
const SHUTDOWN = 'shutdown';
const FILE_COMPLETE = 'filecomplete';
const LOAD_ERROR = 'loaderror';
const LOAD_COMPLETE = 'complete';

interface StationView {
  readonly plan: PlannedStation;
  readonly image: GameObjects.Image | undefined;
}

interface FrameData {
  readonly spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

/** Story 5.2: the drawn guide Shiba and its running wave (one timer). */
interface GuideView {
  readonly plan: PlannedGuide;
  readonly image: GameObjects.Image | undefined;
  wave: Time.TimerEvent | undefined;
  /** Story 8.2: the guide's outfit layers (ProgressStore outfit; they follow its frame, bounce and depth). */
  readonly outfit: OutfitLayers | undefined;
}

/** Story 5.6: the drawn ambient dressing, its clock and the running whale spout (one timer). */
interface AmbientView {
  readonly plan: PlannedAmbient;
  readonly whale: GameObjects.Image | undefined;
  readonly fountain: GameObjects.Image | undefined;
  readonly clouds: { readonly plan: PlannedAmbientInstance; readonly image: GameObjects.Image }[];
  readonly waves: { readonly plan: PlannedAmbientInstance; readonly image: GameObjects.Image }[];
  /** The ambient clock (ms): clamped update deltas. */
  clock: number;
  fountainFrame: string | undefined;
  spout: Time.TimerEvent | undefined;
}

interface KartView {
  readonly plan: PlannedKart;
  readonly body: GameObjects.Container;
  readonly image: GameObjects.Image | undefined;
  readonly target: TapTarget;
}

export class MapScene extends Scene {
  private idle: MapIdle | undefined;
  private views = new Map<string, StationView>();
  private ring: HintRing | undefined;
  private reduced = false;
  private plan: MapPlan | undefined;
  private stops: Record<string, number> = {};
  private trip: KartTrip | undefined;
  private kart: KartView | undefined;
  /** Sign of the last x travel (the kart's facing); starts as the art faces. */
  private travelSign: number = MAP_KART.artFacing;
  private tracker = new AssetTracker();
  /** The MiniGame started from here and not yet terminal, with the level it started at. */
  private running: RunningGame | undefined;
  /** Story 7.1: the HomeYard scene is open (started by a home-station trip, until `yard:leave`). */
  private yardOpen = false;
  /** Games whose assets this Map loaded and has not released yet (a re-targeted trip loads more than one). */
  private loadedGames = new Set<string>();
  /** Story 5.3: the post-round chain's skip (the pull-back fast-forwards on a tap). */
  private skip: Skip | undefined;
  /** Story 5.3: the current press started a skip (set by onAnyTap, before the target's onPress). */
  private skipTap = false;
  /** Story 2.3: the post-round chain (one per Map instance). */
  private chain: PostRoundChain | undefined;
  /** Seamless play: which game SHUTDOWN releases its assets (an in-place restart keeps them; core/release-arming). */
  private releases = new ReleaseArming();
  /** Story 2.5: the static resume marks drawn, by station id. */
  private resumeMarks = new Map<GameId, GameObjects.Graphics>();
  /** Story 5.2: the guide Shiba (undefined when the layout has no `hit.shiba`). */
  private guide: GuideView | undefined;
  private guideModel: MapGuide | undefined;
  /** Story 5.6: the ambient dressing (clouds, waves, fountain, whale). */
  private ambientView: AmbientView | undefined;
  /** 2026-11-13: the rides (train, plane, rocket); undefined on a layout without the rail. */
  private rides: MapRidesView | undefined;
  /** 2026-11-13: the ride whose game is loading / zooming in (one at a time). */
  private pendingRide: RideGameId | undefined;
  /** 2026-11-13: the ride played last (the Speaker names it on wake), until the next station tap. */
  private lastRide: RideGameId | undefined;

  /**
   * Story 2.3: runs when a post-round chain ends without a queued station tap: Map returns to "Mời chơi"
   * (a new idle visit) for every game (seamless play, 2026-10-21: no overlay any more).
   */
  onChainEnd: (e: ChainEnd) => void = () => {
    if (this.idle) this.handle(this.idleReset(this.idle));
  };

  constructor() {
    super('Map');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.skip = createSceneSkip(this);
    this.views = new Map();
    this.ring = undefined;
    this.tracker = new AssetTracker();
    this.running = undefined;
    this.yardOpen = false;
    this.releases = new ReleaseArming();
    this.loadedGames = new Set();
    this.resumeMarks = new Map();

    const layout = LAYOUTS.map;
    const atlasKey = ATLASES.map.key;
    const hasAtlas = this.textures.exists(atlasKey);
    const labels = new Map<string, GameObjects.Text>();
    const label = (text: string): GameObjects.Text => {
      let t = labels.get(text);
      if (!t) {
        t = this.addLabel(text);
        labels.set(text, t);
      }
      return t;
    };

    const plan = planMap(
      layout,
      // A station is awake only when its game is registered (Story 7.1: the home station opens the yard).
      STATIONS.map((s) => ({ ...s, awake: s.awake && (isGameId(s.id) || isHomeStation(s.id)) })),
      (frame) => hasAtlas && this.textures.get(atlasKey).has(frame),
      (frame) => {
        const data = this.textures.get(atlasKey).get(frame).customData as FrameData | undefined;
        const ss = data?.spriteSourceSize;
        return ss ? { x: ss.x, y: ss.y, width: ss.w, height: ss.h } : undefined;
      },
      {
        atlasKey,
        measureLabel: (text) => {
          const t = label(text);
          return { w: t.width, h: t.height };
        },
      },
    );
    this.plan = plan;
    for (const w of plan.warnings) console.warn(w);

    const bgKey = BACKGROUNDS.map.key;
    if (this.textures.exists(bgKey)) {
      this.add.image(plan.bg.x, plan.bg.y, bgKey).setOrigin(0).setScale(plan.bg.scale).setDepth(plan.bg.depth);
    } else {
      console.warn(`map: texture "${bgKey}" is missing — plate skipped`);
    }

    // Story 2.3: hit-test in camera world space, so a tap during the zoomed pull-back hits what is seen.
    const router = createTapRouter(this, {
      toWorld: (p) => {
        const w = this.cameras.main.getWorldPoint(p.x, p.y);
        return { x: w.x, y: w.y };
      },
    });
    router.onAnyTap = () => {
      // Story 5.3: a tap during the post-round chain's animation fast-forwards it — and does nothing else
      // (its station onPress, which runs next, is swallowed, so the chain end never applies it again).
      this.skipTap = this.skip?.tap() ?? false;
      if (this.skipTap) return;
      this.handle(this.idle?.tap() ?? []);
    };
    // Story 5.4: the background ripple (below every station, guide and kart target).
    attachTapReactions(this, router, { reduced: this.reduced, blocked: () => (this.chain?.active ?? false) || this.skipTap });

    // Station hotspots register back to front (by depth), so the frontmost one wins an overlap.
    for (const s of plan.stations) {
      const image = s.image
        ? this.add.image(s.image.x, s.image.y, atlasKey, s.image.frame).setOrigin(s.image.originX, s.image.originY).setScale(s.image.scale).setDepth(s.depth)
        : undefined;
      this.views.set(s.id, { plan: s, image });
      new HotspotPolygon(router, s.hit, () => this.tapStation(s.id));
      label(s.label).setPosition(s.labelPos.x, s.labelPos.y).setDepth(plan.labelDepth);
    }

    // Story 5.2: the guide Shiba registers after the stations (it wins an overlap with the truck) and before the kart.
    this.guideModel = createMapGuide({
      greeted: () => session.guideGreeted,
      markGreeted: () => {
        session.guideGreeted = true;
      },
    });
    this.guide = plan.guide ? this.addGuide(plan.guide, router, atlasKey) : undefined;
    // Story 5.6: the ambient dressing (images only, no hotspots).
    this.ambientView = this.addAmbient(plan.ambient, atlasKey);
    // 2026-11-13: the rides and the railway's sprites (their taps win over a station's: z 1).
    this.pendingRide = undefined;
    this.rides = createMapRides(this, {
      layout,
      atlasKey,
      hasFrame: (frame) => hasAtlas && this.textures.get(atlasKey).has(frame),
      router,
      reduced: this.reduced,
      onTap: (id) => this.tapRide(id),
    });

    // The road and the kart (Story 1.7). The kart registers last: it is on top of the stations it passes.
    const roadPoints = layout.paths[ROAD_PATH] ?? [];
    if (roadPoints.length < 2) console.warn(`map: path "${ROAD_PATH}" is missing from the layout — the kart cannot drive`);
    const road = createRoad(roadPoints);
    this.stops = {};
    for (const s of plan.stations) {
      const stop = (isGameId(s.id) && isIslandGameId(s.id)) || isHomeStation(s.id) ? layout.anchors[stopAnchor(s.id)] : undefined;
      if (stop) this.stops[s.id] = road.project(stop);
    }
    const startAnchor: Point | undefined = layout.anchors[KART_START_ANCHOR];
    const last = session.lastStation;
    const startS = last !== undefined && this.stops[last] !== undefined ? this.stops[last] : startAnchor ? road.project(startAnchor) : 0;
    this.trip = new KartTrip({
      road,
      stops: this.stops,
      startS,
      capMs: () => (session.kartTrips > 0 ? Tokens.Timing.kartDriveRepeatMaxMs : Tokens.Timing.kartDriveMaxMs),
      isAwake: (id) => this.views.get(id)?.plan.awake ?? false,
      nameLine: stationNameLine,
      onArrive: () => {
        session.kartTrips += 1;
      },
    });
    this.kart = this.addKart(plan.kart, router, atlasKey, road.pointAt(startS));
    this.syncResumeMarks();

    this.idle = createMapIdle({
      stations: plan.stations.map((s) => s.id),
      // 2026-11-13: the rides are invited too (after the stations), never bounced as ambient.
      awake: [...plan.stations.filter((s) => s.awake).map((s) => s.id), ...(this.rides ? RIDES.filter((r) => isGameId(r.id)).map((r) => r.id) : [])],
      timing: {
        ambientMinMs: Tokens.Timing.mapAmbientMinMs,
        ambientMaxMs: Tokens.Timing.mapAmbientMaxMs,
        inviteFirstMs: Tokens.Timing.mapInviteFirstMs,
        inviteGapMs: Tokens.Timing.mapInviteGapMs,
        inviteMaxCount: Tokens.Timing.mapInviteMaxCount,
        inviteHoldMs: Tokens.Timing.mapInviteHoldMs,
        // Story 5.6: a station's ambient bounce is a prominent motion (the whale waits for its end).
        ambientBusyMs: Tokens.Timing.mapAmbientMoveMs,
      },
      // Story 5.6: the whale spouts periodically, alone (only when its spout frames exist).
      periodic:
        (plan.ambient.whale?.frames.length ?? 0) > 0
          ? [{ id: MAP_AMBIENT.whale.id, firstMs: Tokens.Timing.whaleFirstMs, everyMs: Tokens.Timing.whaleEveryMs, busyMs: Tokens.Timing.whaleSpoutMs }]
          : [],
    });

    // Game assets load on Map's own loader while the kart drives.
    const onFile = (key: string): void => this.tracker.fileDone(key);
    const onError = (file: { key: string; src?: string }): void => {
      console.warn(`map: failed to load "${file.key}" — the game starts without it`, file.src);
      this.tracker.fileDone(file.key);
    };
    this.load.on(FILE_COMPLETE, onFile);
    this.load.on(LOAD_ERROR, onError);
    // A file that downloads but fails processing (bad JSON, undecodable audio) reports neither of the
    // above; once the loader's queue is done, whatever is still pending is settled (AR51).
    const onComplete = (): void => {
      for (const key of this.tracker.flushPending()) console.warn(`map: "${key}" did not load — the game starts without it`);
    };
    this.load.on(LOAD_COMPLETE, onComplete);

    const chain = new PostRoundChain({
      setDifficulty: (id, level) => ProgressStore.setDifficulty(id, level),
      clearResume: (id) => session.clearResume(id),
      ladderLength: (id) => {
        const entry = GAMES[id];
        return entry ? ladderLength(entry) : undefined;
      },
      stopGameAndWake: () => this.stopRunningGameAndWake(),
      pullBack: (id) => {
        // Story 5.3: the pull-back is a skippable window (persistence already ran).
        this.skip?.begin(chainAnimMs(this.reduced));
        return pullBack(this, LAYOUTS.map.anchors[id] ?? { x: Tokens.design.width / 2, y: Tokens.design.height / 2 }, this.reduced);
      },
      // A chain of a Map instance that shut down never touches the next one.
      end: (e) => {
        if (this.chain === chain) this.endChain(e);
      },
      now: () => performance.now(),
      log: import.meta.env.DEV ? (line) => console.info(line) : undefined,
    });
    this.chain = chain;

    // Scoped subscriptions stay alive while Map sleeps (they end on shutdown/destroy only).
    const scoped = bus.scoped(this);
    // Routing is pure (core/post-round-chain routeRound*): settle, chain, Story 1.7 fade return, or ignore.
    const follow = (route: TerminalRoute): void => {
      if (route.action === 'settle') chain.settle(route.start);
      else if (route.action === 'chain') void chain.start(route.start);
      else if (route.action === 'fade') this.returnFrom(route.gameId);
      else if (route.action === 'restart') this.restartGame(route.gameId);
    };
    scoped.on('round:complete', (outcome) => follow(routeRoundComplete(this.running, outcome)));
    // Story 5.8: Home in free play — the post-round chain runs now.
    // 2026-10-30: a free-play game may hand a resume point (the garden's half-grown plant): kept first, as on abandon.
    scoped.on('round:leave', (e) => follow(onRoundLeave(this.running, e, chain.active, session)));
    // Seamless play: the finished round's game asks for its next round (a restart in place).
    scoped.on('round:next', ({ gameId }) => follow(routeRoundNext(this.running, gameId, chain.active)));
    scoped.on('round:abandon', ({ gameId, snapshot }) => {
      // Story 2.5: keep the running game's snapshot first (synchronously); the return path is unchanged.
      keepAbandonSnapshot(this.running, gameId, snapshot, session);
      follow(routeRoundAbandon(this.running, gameId));
    });
    // Story 7.1: the yard asks for a corner's game, or (Home) to go back to the island.
    scoped.on('yard:open', ({ gameId }) => {
      this.applyNav(navYardOpen(this.nav, gameId, { chainActive: chain.active, isGame: isGameId, startData: this.startDataOf }));
    });
    scoped.on('yard:leave', () => this.applyNav(navLeaveYard(this.nav)));
    this.events.on(WAKE, this.onWake, this);

    // Hud runs in parallel above Map and the games; launched once, never on Start.
    if (!this.scene.isActive(HUD_KEY) && !this.scene.isPaused(HUD_KEY) && !this.scene.isSleeping(HUD_KEY)) {
      this.scene.launch(HUD_KEY);
    }
    setHudMode('map');

    this.events.once(SHUTDOWN, () => {
      this.load.off(FILE_COMPLETE, onFile);
      this.load.off(LOAD_ERROR, onError);
      this.load.off(LOAD_COMPLETE, onComplete);
      this.events.off(WAKE, this.onWake, this);
      this.ring?.destroy();
      this.ring = undefined;
      this.idle = undefined;
      this.trip = undefined;
      this.kart = undefined;
      this.chain = undefined;
      this.resumeMarks = new Map();
      this.guide?.wave?.remove(false);
      this.guide = undefined;
      // Story 5.6: the dressing's images go with the scene's display list; its spout timer is removed.
      this.ambientView?.spout?.remove(false);
      this.ambientView = undefined;
      this.guideModel = undefined;
      this.rides?.destroy();
      this.rides = undefined;
      this.pendingRide = undefined;
    });

    // Story 5.2: the first Map entry of the session greets (the prompt only when the island has none).
    this.applyGuide(this.guideModel.enter({ hasPrompt: islandPrompt(session.lastStation) !== undefined }));
  }

  override update(_time: number, delta: number): void {
    // Story 8.2: the outfit may change in the wardrobe while the island waits behind the yard (set() only swaps what changed).
    this.guide?.outfit?.set(ProgressStore.outfit);
    if (this.idle) this.handle(this.idle.tick(delta));
    this.tickAmbient(delta);
    if (!this.trip) return;
    this.rides?.tick(Math.min(delta, MAX_TICK_MS), {
      kartDriving: this.trip.state !== 'parked',
      // The kart's stops all lie on the island side of the crossing (the road runs on past it to the beach only).
      kartOnCrossing: false,
      busy: this.ring !== undefined || (this.chain?.active ?? false) || this.pendingRide !== undefined,
    });
    this.applyAll(this.trip.tick(delta));
    for (const id of this.tracker.drainSettled()) {
      if (id === this.pendingRide && isRideGameId(id)) void this.enterRide(id);
      else this.applyAll(this.trip.assetsSettled(id));
    }
  }

  // --- resume marks (Story 2.5) ---------------------------------------------------------------------

  /** Destroys the marks of stations no longer holding a resume point and draws the missing ones (static). */
  private syncResumeMarks(): void {
    const held = new Set<GameId>(session.resumeIds());
    for (const [id, mark] of [...this.resumeMarks]) {
      if (held.has(id)) continue;
      mark.destroy();
      this.resumeMarks.delete(id);
    }
    const missing = [...held].filter((id) => !this.resumeMarks.has(id));
    if (missing.length === 0) return;
    // 2026-11-13: a ride's mark sits on its tap area (the train's on Ga tàu: it is never anywhere else for long).
    const hits = { ...LAYOUTS.map.hits, ...(LAYOUTS.map.hits[MAP_RIDES.gaTau] ? { train: LAYOUTS.map.hits[MAP_RIDES.gaTau] } : {}) };
    for (const at of resumeMarkPlan(missing, hits)) {
      this.resumeMarks.set(at.id as GameId, drawResumeMark(this, at));
    }
  }

  // --- post-round chain (Story 2.3) ---------------------------------------------------------------

  /** No ambient, invitation or bob while the chain runs (UX-DR72); a new idle visit afterwards. */
  private enterChainIdle(): void {
    if (!this.idle) return;
    this.handle(this.idleReset(this.idle));
    this.handle(this.idleSuspend(this.idle));
  }

  /** A station tap: queued while the chain runs (no reaction), else the kart trip. */
  private tapStation(id: string): void {
    if (this.skipTap) return;
    // 2026-11-13: a ride's game is opening (its zoom is on): no kart trip meanwhile.
    if (this.pendingRide) return;
    this.lastRide = undefined;
    if (this.chain?.active) {
      this.chain.queueTap(id);
      return;
    }
    this.applyAll(this.trip?.tapStation(id) ?? []);
  }

  /** Stops the running game and wakes Map; resolves on `wake` (at once when no game runs). */
  private stopRunningGameAndWake(): Promise<void> {
    const run = this.running;
    if (!run) return Promise.resolve();
    this.running = undefined;
    return new Promise((resolve) => {
      // Registered after onWake (create), so onWake has run when this resolves.
      this.events.once(WAKE, () => resolve());
      this.scene.stop(run.id);
      this.scene.wake();
    });
  }

  /** The chain ended: idle back, then the queued tap or the onChainEnd hook. */
  private endChain(e: ChainFinish): void {
    this.skip?.end();
    this.syncIdle();
    // A queued tap applies instead of the hook.
    const route = routeChainEnd(e);
    if (route.action === 'tap') {
      this.applyAll(this.trip?.tapStation(route.stationId) ?? []);
      return;
    }
    this.onChainEnd(route.end);
  }

  // --- kart -------------------------------------------------------------------------------------

  private addKart(plan: PlannedKart, router: ReturnType<typeof createTapRouter>, atlasKey: string, at: Point): KartView {
    // The body (a container) takes the tap bounce; the image inside carries the facing mirror (scaleX),
    // so a bounce never resets it. No flipX: it would shift the full-frame sprite.
    const body = this.add.container(at.x, at.y).setDepth(at.y);
    const image = plan.frame ? this.add.image(0, 0, atlasKey, plan.frame).setOrigin(plan.originX, plan.originY) : undefined;
    if (image) body.add(image);
    const target = createTapTarget(router, {
      circle: { x: at.x + plan.centerOffset.x, y: at.y + plan.centerOffset.y, r: plan.hitRadius },
      // Kart taps are ignored while the post-round chain runs (Story 2.3).
      onPress: () => {
        if (!this.chain?.active) this.applyAll(this.trip?.tapKart() ?? []);
      },
      // A station drawn in front of the kart (deeper y) keeps its taps.
      excludes: (p) => this.stationInFrontAt(p, body.depth),
    });
    const view: KartView = { plan, body, image, target };
    this.faceKart(view);
    return view;
  }

  private stationInFrontAt(p: Point, kartDepth: number): boolean {
    for (const view of this.views.values()) {
      if (view.plan.depth > kartDepth && pointInPolygon(p, view.plan.hit)) return true;
    }
    // Story 5.2: so does the guide Shiba when it stands in front of the kart.
    const g = this.guide?.plan;
    return g !== undefined && g.depth > kartDepth && pointInPolygon(p, g.hit);
  }

  // --- guide Shiba (Story 5.2) -------------------------------------------------------------------

  private addGuide(plan: PlannedGuide, router: TapRouter, atlasKey: string): GuideView {
    const image = plan.image
      ? this.add.image(plan.image.x, plan.image.y, atlasKey, plan.image.frame).setOrigin(plan.image.originX, plan.image.originY).setScale(plan.image.scale).setDepth(plan.depth)
      : undefined;
    // Taps are ignored while the post-round chain runs or the kart is not parked (driving, or the
    // station-enter zoom).
    new HotspotPolygon(router, plan.hit, () => {
      const blocked = (this.chain?.active ?? false) || this.trip?.state !== 'parked';
      this.applyGuide(this.guideModel?.tap({ blocked }) ?? []);
    });
    // Story 8.2: Shiba wears the outfit chosen in the wardrobe (overlay frames of atlas.map, drawn just above it).
    const outfit = image ? attachOutfit(this, image as unknown as LayerImage, atlasKey, ProgressStore.outfit) : undefined;
    return { plan, image, wave: undefined, outfit };
  }

  private applyGuide(cmds: readonly GuideCommand[]): void {
    for (const c of cmds) {
      switch (c.kind) {
        case 'wave':
          this.waveGuide();
          break;
        case 'say':
          audio.say(c.lineId);
          break;
        case 'setPrompt':
          audio.setPrompt(c.lineId);
          break;
        case 'bounce':
          this.bounceGuide();
          break;
        case 'sfx':
          audio.sfx(c.id);
          break;
      }
    }
  }

  /** One wave from frame 00 (a running one restarts): frames by waveFrame on a scene-time loop, then idle. */
  private waveGuide(): void {
    const view = this.guide;
    const image = view?.image;
    if (!view || !image || view.plan.wave.length === 0) return;
    view.wave?.remove(false);
    const start = this.time.now;
    const { originX, originY } = view.plan.image ?? { originX: 0.5, originY: 0.5 };
    // setFrame applies the atlas frame's pivot as the origin: the ground-pivot origin is put back. Story 8.2: through
    // the outfit layers, so every worn item shows the same frame at once.
    const setFrame = (frame: string): void => {
      if (view.outfit) view.outfit.setFrame(frame);
      else image.setFrame(frame).setOrigin(originX, originY);
    };
    const show = (): void => {
      const frame = waveFrame(this.time.now - start, this.reduced, view.plan.wave);
      if (frame !== undefined) {
        setFrame(frame);
        return;
      }
      setFrame(MAP_GUIDE.idle);
      view.wave?.remove(false);
      view.wave = undefined;
    };
    show();
    view.wave = this.time.addEvent({ delay: Tokens.Timing.guideWaveFrameMs, loop: true, callback: show });
  }

  // --- ambient dressing (Story 5.6) --------------------------------------------------------------

  private addAmbient(plan: PlannedAmbient, atlasKey: string): AmbientView {
    const image = (p: PlannedImage, depth: number): GameObjects.Image =>
      this.add.image(p.x, p.y, atlasKey, p.frame).setOrigin(p.originX, p.originY).setScale(p.scale).setDepth(depth);
    const view: AmbientView = {
      plan,
      whale: plan.whale ? image(plan.whale.image, plan.whale.depth) : undefined,
      fountain: plan.fountain ? image(plan.fountain.image, plan.fountain.depth) : undefined,
      clouds: plan.clouds.map((c) => ({ plan: c, image: image(c.image, c.depth) })),
      waves: plan.waves.map((w) => ({ plan: w, image: image(w.image, w.depth) })),
      clock: 0,
      fountainFrame: plan.fountain?.image.frame,
      spout: undefined,
    };
    this.placeAmbient(view);
    return view;
  }

  /** Advances the ambient clock (clamped like the idle scheduler: a resume never jumps). */
  private tickAmbient(delta: number): void {
    const view = this.ambientView;
    if (!view) return;
    view.clock += Math.min(MAX_TICK_MS, Math.max(0, Number.isFinite(delta) ? delta : 0));
    this.placeAmbient(view);
  }

  private placeAmbient(view: AmbientView): void {
    const t = view.clock;
    const width = LAYOUTS.map.design.width;
    for (const c of view.clouds) {
      const span = { min: -c.plan.width, max: width + c.plan.width };
      c.image.setX(driftX(c.plan.image.x, t, Tokens.ui.mapCloudDriftPxPerMs, span, this.reduced));
    }
    for (const w of view.waves) w.image.setY(w.plan.image.y + waveBob(t, w.plan.index, this.reduced));
    const fountain = view.plan.fountain;
    if (view.fountain && fountain) {
      const frame = loopFrame(t, fountain.frames, Tokens.Timing.fountainFrameMs, this.reduced);
      if (frame !== undefined && frame !== view.fountainFrame) {
        view.fountainFrame = frame;
        // setFrame applies the atlas frame's pivot as the origin: the ground-pivot origin is put back.
        view.fountain.setFrame(frame).setOrigin(fountain.image.originX, fountain.image.originY);
      }
    }
  }

  /** Story 5.6: `idle.reset()`, and a running whale spout stops (back to idle): a new visit starts still. */
  private idleReset(idle: MapIdle): MapIdleEvent[] {
    this.stopSpout();
    return idle.reset();
  }

  /** Story 5.6: `idle.suspend()`, and a running whale spout stops (back to idle): one prominent motion. */
  private idleSuspend(idle: MapIdle): MapIdleEvent[] {
    this.stopSpout();
    return idle.suspend();
  }

  private stopSpout(): void {
    const view = this.ambientView;
    if (!view?.spout) return;
    view.spout.remove(false);
    view.spout = undefined;
    const whale = view.plan.whale;
    if (whale && view.whale) view.whale.setFrame(whale.image.frame).setOrigin(whale.image.originX, whale.image.originY);
  }

  private periodic(id: string): void {
    if (id === MAP_AMBIENT.whale.id) this.spoutWhale();
  }

  /** One spout from frame 00 (spoutFrame on a scene-time loop), then the idle frame. A frame swap: also under reduced motion. */
  private spoutWhale(): void {
    const view = this.ambientView;
    const whale = view?.plan.whale;
    const image = view?.whale;
    if (!view || !whale || !image || whale.frames.length === 0) return;
    view.spout?.remove(false);
    const start = this.time.now;
    const setFrame = (frame: string): void => void image.setFrame(frame).setOrigin(whale.image.originX, whale.image.originY);
    const show = (): void => {
      const frame = spoutFrame(this.time.now - start, whale.frames, Tokens.Timing.whaleSpoutFrameMs);
      if (frame !== undefined) {
        setFrame(frame);
        return;
      }
      setFrame(whale.image.frame);
      view.spout?.remove(false);
      view.spout = undefined;
    };
    show();
    view.spout = this.time.addEvent({ delay: Tokens.Timing.whaleSpoutFrameMs, loop: true, callback: show });
  }

  private bounceGuide(): void {
    const view = this.guide;
    if (!view?.image) return;
    const react = Tokens.components.tappableProp.react;
    bounce(this, view.image, view.plan.image?.scale ?? 1, amplitude(react.scale, this.reduced), react.durationMs);
  }

  private faceKart(view: KartView): void {
    view.image?.setScale(view.plan.scale * MAP_KART.artFacing * this.travelSign, view.plan.scale);
  }

  private placeKart(x: number, y: number, dx: number): void {
    const view = this.kart;
    if (!view) return;
    if (dx !== 0) this.travelSign = Math.sign(dx);
    view.body.setPosition(x, y).setDepth(y);
    this.faceKart(view);
    view.target.setCircle({ x: x + view.plan.centerOffset.x, y: y + view.plan.centerOffset.y, r: view.plan.hitRadius });
  }

  // --- trip commands -----------------------------------------------------------------------------

  /** Feedback commands run inside the pointerdown handler (≤ Timing.feedbackMaxMs). */
  private applyAll(cmds: readonly TripCommand[]): void {
    for (const c of cmds) this.apply(c);
    this.syncIdle();
  }

  private apply(c: TripCommand): void {
    switch (c.kind) {
      case 'bounce':
        if (c.target === KART_TARGET) this.bounceKart();
        else this.bounceStation(c.target);
        return;
      case 'say':
        audio.say(c.lineId);
        return;
      case 'setPrompt':
        audio.setPrompt(c.lineId);
        return;
      case 'sfx':
        audio.sfx(c.id);
        return;
      case 'load':
        this.loadGame(c.gameId);
        return;
      case 'move':
        this.placeKart(c.x, c.y, c.dx);
        return;
      case 'enter':
        if (isHomeStation(c.gameId)) void this.enterYard();
        else void this.enterGame(c.gameId);
        return;
    }
  }

  /**
   * Idle (ambient moves, invitations) pauses while the kart travels and while the post-round chain runs:
   * one prominent motion (UX-DR72).
   */
  private syncIdle(): void {
    if (!this.idle || !this.trip) return;
    if (this.trip.state === 'parked' && !this.chain?.active && this.pendingRide === undefined) this.idle.resume();
    else this.handle(this.idleSuspend(this.idle));
  }

  private bounceKart(): void {
    if (!this.kart) return;
    const react = Tokens.components.tappableProp.react;
    bounce(this, this.kart.body, 1, amplitude(react.scale, this.reduced), react.durationMs);
  }

  private bounceStation(id: string): void {
    const view = this.views.get(id);
    if (!view?.image) return;
    bounce(this, view.image, view.plan.image?.scale ?? 1, amplitude(Tokens.ui.stationTapScale, this.reduced), Tokens.Timing.stationTapMs);
  }

  // --- game assets, enter and return -------------------------------------------------------------

  /** The assets a station trip loads: its game's, or (Story 7.1) the yard's for the home station. */
  private stationAssets(id: string): GameAssets | undefined {
    if (isHomeStation(id)) return HOME_ASSETS;
    return isGameId(id) ? GAMES[id]?.assets : undefined;
  }

  private loadGame(id: string): void {
    const assets = this.stationAssets(id);
    if (!assets) {
      this.tracker.track(id, []);
      return;
    }
    const calls = loadPlan(assets, (kind, key) => (kind === 'texture' ? this.textures.exists(key) : this.cache.audio.exists(key)));
    this.tracker.track(id, calls.map((c) => c.key));
    this.loadedGames.add(id);
    if (calls.length === 0) return;
    for (const c of calls) {
      if (c.kind === 'atlas') this.load.atlas(c.key, c.png, c.json);
      else if (c.kind === 'multiatlas') this.load.multiatlas(c.key, c.json, c.path);
      else if (c.kind === 'image') this.load.image(c.key, c.url);
      else this.load.audio(c.key, c.url);
    }
    this.load.start();
  }

  private async enterGame(id: string): Promise<void> {
    // Story 7.2: only island games have a station (yard games open from the yard).
    if (!isGameId(id) || !isIslandGameId(id)) return;
    const entry = GAMES[id];
    if (!entry) return;
    session.lastStation = id;
    setHomeTarget('island');
    const focus = LAYOUTS.map.anchors[id] ?? { x: this.kart?.body.x ?? 0, y: this.kart?.body.y ?? 0 };
    await enterStation(this, focus, this.reduced);
    if (!this.trip) return; // Map shut down meanwhile
    this.startIslandGame(id, entry);
    this.trip.entered();
    this.syncIdle();
  }

  /** Starts a game opened from the island (a station or a ride) and sleeps Map. */
  private startIslandGame(id: GameId, entry: NonNullable<(typeof GAMES)[GameId]>): void {
    // Story 2.5: a held snapshot resumes the game (its own level and seed). Every start clears the
    // resume point: a start without resume drops it, a resumed start consumes it.
    const data = takeStartData(id, ladderLength(entry));
    this.syncResumeMarks();
    // At most one MiniGame: stop any other one still around.
    for (const other of Object.keys(GAMES)) {
      if (this.scene.isActive(other) || this.scene.isPaused(other) || this.scene.isSleeping(other)) this.scene.stop(other);
    }
    this.running = { id, level: data.level, origin: 'island' };
    this.releases.arm(id);
    this.listenShutdown(id);
    this.scene.manager.start(id, data);
    this.scene.sleep();
  }

  // --- the rides (2026-11-13) ---------------------------------------------------------------------

  /** A ride tap: bounce, its name, load its game (enterRide runs once the assets settle). */
  private tapRide(id: RideGameId): void {
    if (this.skipTap || this.chain?.active || this.running || this.pendingRide || this.yardOpen) return;
    if (!this.trip || this.trip.state !== 'parked') return;
    if (!isGameId(id) || !GAMES[id]) return;
    this.pendingRide = id;
    this.rides?.open(id);
    audio.say(stationNameLine(id));
    this.syncIdle();
    this.loadGame(id);
  }

  /** The ride's assets are in: zoom in on it and start its game. */
  private async enterRide(id: RideGameId): Promise<void> {
    const entry = isGameId(id) ? GAMES[id] : undefined;
    if (!entry) {
      this.pendingRide = undefined;
      this.rides?.release();
      this.syncIdle();
      return;
    }
    setHomeTarget('island');
    const focus = this.rides?.focus(id) ?? LAYOUTS.map.anchors[id] ?? { x: Tokens.design.width / 2, y: Tokens.design.height / 2 };
    await enterStation(this, focus, this.reduced);
    if (!this.trip) return; // Map shut down meanwhile
    this.pendingRide = undefined;
    this.lastRide = id;
    this.startIslandGame(id, entry);
    this.syncIdle();
  }

  // --- the yard (Story 7.1) -----------------------------------------------------------------------

  /** The navigation state the pure reducer (core/shell-nav) reads. */
  private get nav(): ShellNav {
    return { running: this.running, yardOpen: this.yardOpen };
  }

  /** Applies a core/shell-nav step: its state, then its effects (every Phaser call stays here). */
  private applyNav(step: NavStep): void {
    this.running = step.state.running;
    this.yardOpen = step.state.yardOpen;
    for (const e of step.effects) {
      switch (e.kind) {
        case 'setHomeTarget':
          setHomeTarget(e.target);
          break;
        case 'startGame':
          this.syncResumeMarks();
          for (const other of Object.keys(GAMES)) {
            if (this.scene.isActive(other) || this.scene.isPaused(other) || this.scene.isSleeping(other)) this.scene.stop(other);
          }
          this.loadedGames.add(e.gameId);
          this.releases.arm(e.gameId);
          this.listenShutdown(e.gameId);
          this.scene.manager.start(e.gameId, e.data);
          break;
        case 'restartGame':
          this.syncResumeMarks();
          this.releases.markRestart(e.gameId);
          this.scene.get(e.gameId).scene.restart(e.data);
          break;
        case 'stopGame':
          this.scene.stop(e.gameId);
          break;
        case 'forget':
          this.chain?.forget(e.gameId);
          break;
        case 'sleepYard':
          this.scene.sleep(YARD_SCENE_KEY);
          break;
        case 'wakeYard':
          this.scene.wake(YARD_SCENE_KEY);
          break;
        case 'stopYard':
          this.scene.stop(YARD_SCENE_KEY);
          break;
        case 'wakeMap':
          if (e.parkAt !== undefined) session.lastStation = e.parkAt;
          this.scene.wake();
          break;
      }
    }
  }

  /** Start data of a registered game: takeStartData (a held resume point resumes, then is cleared). */
  private startDataOf = (id: GameId): GameStartData => takeStartData(id, ladderLength(GAMES[id] ?? {}));

  /** The home station's trip ended: zoom in, start the yard (its assets are loaded) and sleep. */
  private async enterYard(): Promise<void> {
    session.lastStation = HOME_STATION;
    const focus = LAYOUTS.map.anchors[HOME_STATION] ?? { x: this.kart?.body.x ?? 0, y: this.kart?.body.y ?? 0 };
    await enterStation(this, focus, this.reduced);
    if (!this.trip) return; // Map shut down meanwhile
    // The yard owns its assets now: a game's shutdown must not release them (releaseGame).
    this.loadedGames.delete(HOME_STATION);
    this.applyNav(navEnterYard(this.nav));
    this.scene.get(YARD_SCENE_KEY).events.once(SHUTDOWN, () => {
      this.applyNav(navYardClosed(this.nav));
      this.releaseAssets(HOME_STATION);
    });
    this.scene.manager.start(YARD_SCENE_KEY);
    this.scene.sleep();
    this.trip.entered();
    this.syncIdle();
  }

  /**
   * The game scene's next SHUTDOWN: core/release-arming decides — an in-place restart (seamless play)
   * listens again for the restarted round, any other shutdown of the armed game releases its assets.
   */
  private listenShutdown(id: GameId): void {
    const releases = this.releases;
    this.scene.get(id).events.once(SHUTDOWN, () => {
      const action = releases.onShutdown(id);
      if (action === 'rearm') this.listenShutdown(id);
      else if (action === 'release') this.releaseGame(id);
    });
  }

  /**
   * Seamless play (2026-10-21): restarts the running game in place for its next round (core/shell-nav ›
   * navRestart keeps its origin: a yard game still returns to the yard). Its round was settled on
   * `round:complete`, so takeStartData gives the saved level and a fresh seed. Map stays asleep; the game
   * keeps its assets.
   */
  private restartGame(id: GameId): void {
    this.applyNav(navRestart(this.nav, id, this.startDataOf));
  }

  /** The fade return (core/shell-nav › navReturn): a yard game wakes the yard, an island game wakes Map. */
  private returnFrom(gameId: string): void {
    this.applyNav(navReturn(this.nav, gameId));
  }

  /**
   * The game scene shut down: drop its own textures and sounds (never the boot keys), plus those of
   * every other game this visit loaded (a re-targeted trip) that is neither running nor the current target.
   */
  private releaseGame(id: string): void {
    const ids = new Set([id, ...this.loadedGames]);
    for (const gameId of ids) {
      if (gameId === this.running?.id || gameId === this.trip?.target) continue;
      this.loadedGames.delete(gameId);
      this.releaseAssets(gameId);
    }
  }

  private releaseAssets(id: string): void {
    const assets = this.stationAssets(id);
    if (!assets) return;
    for (const r of releasePlan(assets)) {
      if (r.kind === 'texture') {
        if (this.textures.exists(r.key)) this.textures.remove(r.key);
      } else {
        this.cache.audio.remove(r.key);
      }
    }
  }

  private onWake(): void {
    const chaining = this.chain?.active ?? false;
    if (!chaining) {
      // Story 1.7 fade return. During the post-round chain, pullBack owns the camera instead.
      const cam = this.cameras.main;
      cam.resetFX();
      cam.setZoom(1);
      cam.setScroll(0, 0);
      void revealScene(this);
    }
    setHudMode('map');
    // The game's request must not stay on the Speaker (its line may already be released).
    const prompt = this.lastRide ? stationNameLine(this.lastRide) : islandPrompt(session.lastStation);
    if (prompt) audio.setPrompt(prompt);
    else audio.clearPrompt();
    // 2026-11-13: the rides are back in their places (the train at Ga tàu, the plane on its strip).
    this.rides?.parkAll();
    if (chaining) this.enterChainIdle();
    else if (this.idle) this.handle(this.idleReset(this.idle));
    this.syncResumeMarks();
    const last = session.lastStation;
    const s = last !== undefined ? this.stops[last] : undefined;
    if (this.trip && s !== undefined) this.applyAll(this.trip.parkAt(s));
    else this.syncIdle();
  }

  // --- idle ---------------------------------------------------------------------------------------

  private handle(events: readonly MapIdleEvent[]): void {
    for (const ev of events) {
      if (ev.kind === 'ambient') this.ambient(ev.id);
      else if (ev.kind === 'invite') this.invite(ev.id);
      else if (ev.kind === 'periodic') this.periodic(ev.id);
      else this.endInvite(ev.id);
    }
  }

  private addLabel(text: string): GameObjects.Text {
    return addStationLabel(this, text);
  }

  private ambient(id: string): void {
    const view = this.views.get(id);
    if (!view?.image || isMoving(view.image)) return;
    bounce(this, view.image, view.plan.image?.scale ?? 1, amplitude(Tokens.ui.ambientScale, this.reduced), Tokens.Timing.mapAmbientMoveMs);
  }

  private invite(id: string): void {
    if (isRideGameId(id)) {
      this.inviteRide(id);
      return;
    }
    const view = this.views.get(id);
    if (!view) return;
    // One prominent motion at a time: settle any ambient bounce still running on another station.
    for (const other of this.views.values()) {
      if (other.image) stopMotion(other.image, other.plan.image?.scale ?? 1);
    }
    this.ring = createHintRing(this, boundingBox(view.plan.hit), { reduced: this.reduced, depth: this.plan?.ringDepth });
    if (view.image) {
      const pulse = Tokens.components.stationHotspot.pulse;
      bob(
        this,
        view.image,
        view.plan.image?.scale ?? 1,
        amplitude(pulse.from, this.reduced),
        amplitude(pulse.to, this.reduced),
        pulse.durationMs,
      );
    }
    const line = inviteLine(id);
    audio.sayChain([line, stationNameLine(id)]);
    audio.setPrompt(line);
    // Story 5.2: the guide Shiba waves with the invitation (one combined call to action).
    this.applyGuide(this.guideModel?.invite() ?? []);
  }

  /** 2026-11-13: a ride's invitation: the ring round its tap area, its pulse, the lines, the guide's wave. */
  private inviteRide(id: RideGameId): void {
    const hit = this.rides?.inviteHit(id);
    if (!hit || hit.length === 0) return;
    for (const other of this.views.values()) {
      if (other.image) stopMotion(other.image, other.plan.image?.scale ?? 1);
    }
    this.ring = createHintRing(this, boundingBox(hit), { reduced: this.reduced, depth: this.plan?.ringDepth });
    this.rides?.pulse(id);
    const line = inviteLine(id);
    audio.sayChain([line, stationNameLine(id)]);
    audio.setPrompt(line);
    this.applyGuide(this.guideModel?.invite() ?? []);
  }

  private endInvite(id: string): void {
    this.ring?.destroy();
    this.ring = undefined;
    const view = this.views.get(id);
    if (view?.image) stopMotion(view.image, view.plan.image?.scale ?? 1);
  }
}
