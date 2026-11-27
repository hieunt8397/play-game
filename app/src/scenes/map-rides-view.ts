// The island's rides drawn on the map (2026-11-13, spec-dao-moi-xe-ra-dao): the toy train on its rail loop, the plane
// on its airstrip and in flight, the rocket on its pad, the level crossing's barriers, and the still sprites that hide
// the train (the volcano, the scenery in front of the track). Map owns this view; every rule is in core/map-rides (the
// train's and the plane's clocks, the headings, the scale): this file only wires Phaser images and the tap targets.
//
// Placement: each ride frame is a full-frame render whose pivot is the ride's layout anchor (`anchors.train`,
// `anchors.plane`, …; spec 1-4's full-frame rule), so an image is drawn with its origin at that anchor's share of the
// frame, at the ride's current point, scaled by the local perspective scale. Depth: the ground point's y (like a
// station), so the train passes behind the cave and the volcano and in front of what stands behind the track; the
// plane in flight draws above everything but the labels.
// Taps: Ga tàu's hull, the parked plane's and the rocket's hulls (layout hits), and moving boxes round the train's
// pieces and the flying plane (hitPad padded; a tap also hits where they were a moment ago). Rides register with
// z 1: a tap on a ride and a station at once goes to the ride.
import type { GameObjects, Scene } from 'phaser';
import { headingFrameName, MAP_RIDES, stateFrameName } from '../content/assets';
import type { Point, ScreenLayout } from '../content/layout-types';
import { PLANE_LOOP_PATH, RAIL_PATH } from '../content/stations';
import type { RideGameId } from '../content/types';
import { pointInPolygon } from '../core/input/polygon';
import type { TapRouter } from '../core/input/tap-router';
import {
  createLoop,
  headingFrame,
  MapPlane,
  MapTrain,
  markedAt,
  MIN_LOOP_POINTS,
  planeConfig,
  trainConfig,
  rocketPuffFrame,
  scaleAt,
  type Loop,
  type TrainEvent,
} from '../core/map-rides';
import { amplitude } from '../core/reduced-motion';
import { cameraCentre } from '../games/train/camera';
import { Tokens } from '../core/tokens';
import { bounce } from '../core/ui/scale-motion';

/** How long ago a tap may still hit a moving ride (the finger lags the eye). */
const TAP_LAG_MS = Tokens.Timing.fishHistoryKeepMs;

export interface RidesContext {
  /** The kart is driving (the plane waits on the ground). */
  readonly kartDriving: boolean;
  /** The kart's trip crosses the level crossing (the train waits at the signal). */
  readonly kartOnCrossing: boolean;
  /** An idle invitation or another prominent motion is on (the plane waits on the ground). */
  readonly busy: boolean;
}

interface Piece {
  readonly sprite: string;
  readonly image: GameObjects.Image;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface MapRidesView {
  /** One frame: move the rides (Map's clamped delta). */
  tick(deltaMs: number, ctx: RidesContext): void;
  /**
   * Where the camera zooms to open a ride's game: the ride where it is now. The train's focus is Ga tàu instead when the
   * tap was on the platform or the train is (partly) in the tunnel.
   */
  focus(id: RideGameId): Point | undefined;
  /** 2026-11-13: where the train game's train starts (arc length on `path.rail`): the map train's place, or Ga tàu. */
  trainStart(): number;
  /** The idle invitation's ring area of a ride (Ga tàu for the train, the airstrip spot, the pad), and its pulse. */
  inviteHit(id: RideGameId): readonly Point[] | undefined;
  pulse(id: RideGameId): void;
  /** A tap opened the ride's game: it bounces; the train brakes to a stop, the plane lands at once. */
  open(id: RideGameId): void;
  /** Map woke after a ride's game (or any game): the train at Ga tàu, the plane parked. */
  parkAll(): void;
  /** The train goes on after a cancelled open. */
  release(): void;
  destroy(): void;
}

export interface MapRidesOptions {
  readonly layout: ScreenLayout;
  readonly atlasKey: string;
  readonly hasFrame: (frame: string) => boolean;
  readonly router: TapRouter;
  readonly reduced: boolean;
  readonly onTap: (id: RideGameId) => void;
}

/** A bounce drawn by the view itself (the train and the plane are re-placed every frame, so a tween would be lost). */
interface Pulse {
  readonly id: RideGameId;
  readonly t0: number;
}

/** Builds the view, or undefined when the layout has no rail (an old map). */
export function createMapRides(scene: Scene, opts: MapRidesOptions): MapRidesView | undefined {
  const { layout, atlasKey, hasFrame, router, reduced } = opts;
  const A = layout.anchors;
  const rail = layout.paths[RAIL_PATH];
  const railUp = layout.paths[MAP_RIDES.railUp];
  const compass = layout.paths[MAP_RIDES.compass] ?? [];
  const trainAt = A.train;
  if (!rail || rail.length < MIN_LOOP_POINTS || !railUp || !trainAt) return undefined;
  const W = layout.design.width;
  const H = layout.design.height;
  const rs = layout.renderScale;
  const pad = Tokens.spacing.hitPad;
  const loop = createLoop(rail);
  const sOf = (id: string, fallback: number): number => (A[id] ? loop.project(A[id]) : fallback);
  const stationS = loop.project(trainAt);
  const liftRef = scaleAt(loop, railUp, rail, stationS, 1);
  const railScale = (s: number): number => scaleAt(loop, railUp, rail, s, liftRef);
  // Where a sprite in front hides the track, the train draws under every sprite (see Tokens.ui.mapTrainBackDepth).
  const behind = markedAt(loop, rail, layout.paths[MAP_RIDES.railBack] ?? []);
  const react = Tokens.components.tappableProp.react;
  let clock = 0;
  let pulse: Pulse | undefined;
  /** The pulse factor of a ride now (1 when it is not pulsing). */
  const pulseOf = (id: RideGameId): number => {
    if (!pulse || pulse.id !== id) return 1;
    const t = (clock - pulse.t0) / react.durationMs;
    if (t >= 1) return 1;
    return 1 + (amplitude(react.scale, reduced) - 1) * Math.sin(Math.PI * t);
  };
  /** The train's game opens at Ga tàu (the tap was on the platform). */
  let focusStation = false;

  // --- still sprites drawn by depth (the volcano, the occluders, the crossing's barriers, the rocket) ---------
  const images: GameObjects.Image[] = [];
  const still = (frame: string, anchor: Point | undefined): GameObjects.Image | undefined => {
    if (!anchor || !hasFrame(frame)) return undefined;
    const img = scene.add.image(anchor.x, anchor.y, atlasKey, frame).setOrigin(anchor.x / W, anchor.y / H).setScale(1 / rs).setDepth(anchor.y);
    images.push(img);
    return img;
  };
  still(stateFrameName(MAP_RIDES.volcano), A[MAP_RIDES.volcano]);
  for (let n = 1; A[`occ-${n}`]; n++) still(stateFrameName(`occ-${n}`), A[`occ-${n}`]);
  const barriers = MAP_RIDES.crossings.map((c) => ({ id: c, image: still(stateFrameName(c, 'up'), A[c]) }));
  const setBarriers = (down: boolean): void => {
    for (const b of barriers) {
      const a = A[b.id];
      if (b.image && a) b.image.setFrame(stateFrameName(b.id, down ? 'down' : 'up')).setOrigin(a.x / W, a.y / H);
    }
  };
  const rocket = still(MAP_RIDES.rocket.idle, A.rocket);

  // --- the train ---------------------------------------------------------------------------------------------
  const tIn = A[MAP_RIDES.anchors.tunnelIn];
  const tOut = A[MAP_RIDES.anchors.tunnelOut];
  const train = new MapTrain(loop, {
    ...trainConfig(
      loop,
      {
        stationS,
        // 2026-11-13 (spec-tau-quanh-dao): the cars stand at the train game's pitch (ui.trainCarPitch), so the zoom
        // into the game shows the same train.
        carS: Tokens.ui.trainCarPitch.map((_p, i) => loop.ahead(Tokens.ui.trainCarPitch.slice(0, i + 1).reduce((a, b) => a + b, 0), stationS)),
        tunnel: tIn && tOut ? { from: loop.project(tIn), to: loop.project(tOut) } : undefined,
        crossing: { from: sOf(MAP_RIDES.anchors.crossingFrom, 0), to: sOf(MAP_RIDES.anchors.crossingTo, 0) },
        signalS: sOf(MAP_RIDES.anchors.signal, 0),
      },
      Tokens.Timing.mapTrainLapMs,
      Tokens.Timing.mapTrainEaseMs,
      Tokens.Timing.mapTrainDwellMs,
    ),
    scale: railScale,
  });
  const pieceSprites = [MAP_RIDES.engine, ...MAP_RIDES.cars];
  const pieces: Piece[] = [];
  for (const sprite of pieceSprites) {
    const frame = headingFrameName(sprite, 0);
    if (!hasFrame(frame)) continue;
    const img = scene.add.image(trainAt.x, trainAt.y, atlasKey, frame).setOrigin(trainAt.x / W, trainAt.y / H).setScale(1 / rs);
    images.push(img);
    pieces.push({ sprite, image: img });
  }
  const trainBoxes: Box[] = [];
  const trainHistory: { t: number; boxes: Box[] }[] = [];
  const box = (p: Point, k: number, b: { w: number; h: number; lift: number }): Box => ({
    x: p.x - (b.w * k) / 2 - pad,
    y: p.y - b.lift * k - (b.h * k) / 2 - pad,
    w: b.w * k + 2 * pad,
    h: b.h * k + 2 * pad,
  });
  const inBox = (p: Point, b: Box): boolean => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

  const drawTrain = (): void => {
    trainBoxes.length = 0;
    const bump = pulseOf('train');
    train.pieces().forEach((piece, i) => {
      const view = pieces[i];
      if (!view) return;
      const p = loop.pointAt(piece.s);
      const k = railScale(piece.s);
      const h = headingFrame(loop.dirAt(piece.s), compass);
      view.image
        .setFrame(headingFrameName(view.sprite, h))
        .setOrigin(trainAt.x / W, trainAt.y / H)
        .setPosition(p.x, p.y)
        .setScale((k * bump) / rs)
        .setDepth(behind(piece.s) ? Tokens.ui.mapTrainBackDepth : p.y)
        .setVisible(!piece.hidden);
      if (!piece.hidden) trainBoxes.push(box(p, k, Tokens.ui.mapTrainPieceBox));
    });
  };

  // --- the plane ---------------------------------------------------------------------------------------------
  const planeAt = A.plane;
  const planePath = layout.paths[PLANE_LOOP_PATH];
  const planeUp = layout.paths[MAP_RIDES.planeLoopUp];
  const planeLoop: Loop | undefined = planePath && planePath.length >= MIN_LOOP_POINTS ? createLoop(planePath) : undefined;
  const planeLiftRef = planeLoop && planePath && planeUp ? scaleAt(planeLoop, planeUp, planePath, 0, 1) : 1;
  const plane = planeLoop
    ? new MapPlane(planeLoop, planeConfig(planeLoop, Tokens.Timing.mapPlaneFlightMs, Tokens.Timing.mapPlaneEaseMs, Tokens.Timing.mapPlaneGapMs))
    : undefined;
  const parkedHeading = planeLoop ? headingFrame(planeLoop.dirAt(0), compass) : 0;
  const planeImage =
    planeAt && hasFrame(headingFrameName(MAP_RIDES.plane, parkedHeading))
      ? scene.add
          .image(planeAt.x, planeAt.y, atlasKey, headingFrameName(MAP_RIDES.plane, parkedHeading))
          .setOrigin(planeAt.x / W, planeAt.y / H)
          .setScale(1 / rs)
          .setDepth(planeAt.y)
      : undefined;
  if (planeImage) images.push(planeImage);
  let planeBox: Box | undefined;
  const planeHistory: { t: number; box: Box }[] = [];
  const drawPlane = (): void => {
    if (!plane || !planeLoop || !planeImage || !planeAt || !planePath || !planeUp) return;
    const bump = pulseOf('plane');
    if (plane.state === 'parked') {
      planeImage
        .setFrame(headingFrameName(MAP_RIDES.plane, parkedHeading))
        .setOrigin(planeAt.x / W, planeAt.y / H)
        .setPosition(planeAt.x, planeAt.y)
        .setScale(bump / rs)
        .setDepth(planeAt.y);
      planeBox = undefined;
      return;
    }
    const s = plane.position;
    const p = planeLoop.pointAt(s);
    const k = scaleAt(planeLoop, planeUp, planePath, s, planeLiftRef);
    planeImage
      .setFrame(headingFrameName(MAP_RIDES.plane, headingFrame(planeLoop.dirAt(s), compass)))
      .setOrigin(planeAt.x / W, planeAt.y / H)
      .setPosition(p.x, p.y)
      .setScale((k * bump) / rs)
      .setDepth(Tokens.ui.mapPlaneFlightDepth);
    planeBox = box(p, k, Tokens.ui.mapPlaneBox);
  };

  // --- taps --------------------------------------------------------------------------------------------------
  const removers: (() => void)[] = [];
  const gaHit = layout.hits[MAP_RIDES.gaTau];
  const onGa = (p: Point): boolean => gaHit !== undefined && pointInPolygon(p, gaHit);
  const onTrain = (p: Point): boolean => trainBoxes.some((b) => inBox(p, b)) || trainHistory.some((e) => e.boxes.some((b) => inBox(p, b)));
  removers.push(
    router.add({
      z: 1,
      contains: (p) => onGa(p) || onTrain(p),
      isEnabled: () => true,
      onPress: (p) => {
        focusStation = !onTrain(p);
        opts.onTap('train');
      },
    }),
  );
  const planeHit = layout.hits.plane;
  removers.push(
    router.add({
      z: 1,
      contains: (p) =>
        plane?.state === 'flying'
          ? (planeBox !== undefined && inBox(p, planeBox)) || planeHistory.some((e) => inBox(p, e.box))
          : planeHit !== undefined && pointInPolygon(p, planeHit),
      isEnabled: () => planeImage !== undefined,
      onPress: () => opts.onTap('plane'),
    }),
  );
  const rocketHit = layout.hits.rocket;
  if (rocketHit) {
    removers.push(
      router.add({ z: 1, contains: (p) => pointInPolygon(p, rocketHit), isEnabled: () => rocket !== undefined, onPress: () => opts.onTap('rocket') }),
    );
  }


  const handleTrain = (events: readonly TrainEvent[]): void => {
    for (const e of events) if (e.kind === 'barriers') setBarriers(e.down);
  };

  drawTrain();
  drawPlane();

  return {
    tick(deltaMs, ctx) {
      clock += deltaMs;
      handleTrain(train.tick({ dtMs: deltaMs, kartOnCrossing: ctx.kartOnCrossing, reduced }));
      drawTrain();
      trainHistory.push({ t: clock, boxes: [...trainBoxes] });
      while (trainHistory.length > 0 && clock - trainHistory[0]!.t > TAP_LAG_MS) trainHistory.shift();
      if (plane) {
        const ready = !reduced && !ctx.kartDriving && !ctx.busy && !train.barriers;
        plane.tick(deltaMs, ready);
        drawPlane();
        if (planeBox) planeHistory.push({ t: clock, box: planeBox });
        while (planeHistory.length > 0 && clock - planeHistory[0]!.t > TAP_LAG_MS) planeHistory.shift();
      }
      if (rocket && A.rocket) {
        const k = rocketPuffFrame(clock, Tokens.Timing.mapRocketPuffEveryMs, MAP_RIDES.rocket.puff.length, Tokens.Timing.mapRocketPuffFrameMs, reduced);
        const frame = k === undefined ? MAP_RIDES.rocket.idle : MAP_RIDES.rocket.puff[k]!;
        if (rocket.frame.name !== frame && hasFrame(frame)) rocket.setFrame(frame).setOrigin(A.rocket.x / W, A.rocket.y / H);
      }
    },
    trainStart() {
      return focusStation || train.tunnel ? stationS : train.engineS;
    },
    focus(id) {
      if (id === 'train') {
        // The train game's opening view (games/train/camera.ts): the zoom lands exactly where the game starts.
        const z = Tokens.ui.trainZoom;
        const middle = Tokens.ui.trainCarPitch.reduce((a, b) => a + b, 0) / 2;
        return cameraCentre(loop, this.trainStart(), { viewW: W / z, viewH: H / z, boundsW: W, boundsH: H, middle, lead: Tokens.ui.trainCameraLead });
      }
      if (id === 'plane') return planeImage ? { x: planeImage.x, y: planeImage.y } : planeAt;
      return A.rocket;
    },
    open(id) {
      if (id === 'train') train.hold();
      else if (id === 'plane') {
        plane?.park();
        drawPlane();
      }
      this.pulse(id);
    },
    inviteHit(id) {
      return id === 'train' ? gaHit : layout.hits[id];
    },
    pulse(id) {
      if (id === 'rocket') {
        if (rocket) bounce(scene, rocket, 1 / rs, amplitude(react.scale, reduced), react.durationMs);
        return;
      }
      pulse = { id, t0: clock };
    },
    parkAll() {
      focusStation = false;
      handleTrain(train.parkAtStation());
      drawTrain();
      plane?.park();
      drawPlane();
    },
    release() {
      train.release();
    },
    destroy() {
      for (const r of removers) r();
      for (const img of images) img.destroy();
    },
  };
}
