// HomeYard (Story 7.1): the yard (sân nhà) behind the island's home station "Nhà Xoài". A shell scene,
// started and stopped by Map (AD-1: Map owns navigation). Draws the plate `bg.home` and the 5 corner
// sprites from `atlas.home` (full-frame on their ground pivots, like the island stations), a static
// parent label under each, and a resume mark on a corner whose game holds a snapshot. Taps go through
// core/input (one router) into core/home-yard › YardController:
//   - awake corner (its game is in games/registry GAMES): bounce + its name; the game's assets load on
//     this scene's loader (scenes/game-loader) while it bounces; then the camera zooms on the corner and
//     the yard emits `yard:open` — Map starts the game (takeStartData) and sleeps the yard; the game's
//     last event (`round:leave` / `round:abandon`) brings the yard back (`wake`), never the island;
//   - sleeping corner: bounce + happy sound, nothing opens (until 7.2–7.4 / Epic 8 register their games);
//   - Home (Hud 'yard' mode, "Về đảo nào!"): `yard:leave` — Map stops the yard and wakes on the island
//     with the kart parked at `home-stop`.
// The yard's own assets are loaded by Map during the kart trip and released by Map when it shuts down.
import { Scene, type GameObjects, type Time } from 'phaser';
import { ATLASES, BACKGROUNDS } from '../content/assets';
import { cornerNameLine, YARD_INVITE_LINE, YARD_SCENE_KEY, yardCorners, type CornerId } from '../content/home';
import type { Point } from '../content/layout-types';
import { LAYOUTS } from '../content/layouts';
import { audio } from '../core/audio-director';
import { bus } from '../core/bus';
import { AssetTracker } from '../core/game-assets';
import { planYard, YardController, type PlannedCorner, type YardCommand } from '../core/home-yard';
import { getHudMode, setHudMode } from '../core/hud-mode';
import { HotspotPolygon } from '../core/input/hotspot-polygon';
import { createTapRouter } from '../core/input/tap-router';
import { enterStation, revealScene } from '../core/motion';
import { amplitude, prefersReducedMotion } from '../core/reduced-motion';
import { resumeMarkPlan } from '../core/resume-marks';
import { session } from '../core/session-store';
import { Tokens } from '../core/tokens';
import { drawResumeMark } from '../core/ui/resume-mark';
import { bounce } from '../core/ui/scale-motion';
import { addStationLabel } from '../core/ui/station-label';
import { attachTapReactions } from '../core/ui/tap-reactions';
import { GAMES, isGameId } from '../games/registry';
import { queueLoad, releaseAssets, wireLoader } from './game-loader';

const WAKE = 'wake';
const SLEEP = 'sleep';
const SHUTDOWN = 'shutdown';

interface CornerView {
  readonly plan: PlannedCorner;
  readonly image: GameObjects.Image | undefined;
}

export class HomeYard extends Scene {
  private reduced = false;
  private views = new Map<CornerId, CornerView>();
  private controller: YardController | undefined;
  private tracker = new AssetTracker();
  /** The corner whose game opened last (its name is the Speaker prompt when the yard comes back). */
  private lastCorner: CornerId | undefined;
  private resumeMarks: GameObjects.Graphics[] = [];
  /** A `yard:open` that Map did not take (the yard is still awake after it): back to idle. */
  private openGuard: Time.TimerEvent | undefined;

  constructor() {
    super(YARD_SCENE_KEY);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.views = new Map();
    this.tracker = new AssetTracker();
    this.lastCorner = undefined;
    this.resumeMarks = [];

    const layout = LAYOUTS.home;
    const atlasKey = ATLASES.home.key;
    const hasAtlas = this.textures.exists(atlasKey);
    const corners = yardCorners(isGameId);
    const plan = planYard(layout, corners, (frame) => hasAtlas && this.textures.get(atlasKey).has(frame), {
      atlasKey,
      measureLabel: (text) => {
        const t = addStationLabel(this, text);
        const size = { w: t.width, h: t.height };
        t.destroy();
        return size;
      },
    });
    for (const w of plan.warnings) console.warn(w);

    const bgKey = BACKGROUNDS.home.key;
    if (this.textures.exists(bgKey)) this.add.image(plan.bg.x, plan.bg.y, bgKey).setOrigin(0).setScale(plan.bg.scale).setDepth(plan.bg.depth);
    else console.warn(`yard: texture "${bgKey}" is missing — plate skipped`);

    this.controller = new YardController({ corners: plan.corners, nameLine: cornerNameLine });
    const router = createTapRouter(this);
    // Story 5.4's light ripple on an empty-lawn tap (below every corner target).
    attachTapReactions(this, router, { reduced: this.reduced, blocked: () => this.controller?.state === 'entering' });
    // Back to front (depth): the frontmost corner wins an overlap.
    for (const c of plan.corners) {
      const image = c.image
        ? this.add.image(c.image.x, c.image.y, atlasKey, c.image.frame).setOrigin(c.image.originX, c.image.originY).setScale(c.image.scale).setDepth(c.depth)
        : undefined;
      this.views.set(c.id, { plan: c, image });
      new HotspotPolygon(router, c.hit, () => this.applyAll(this.controller?.tapCorner(c.id) ?? []));
      addStationLabel(this, c.label).setPosition(c.labelPos.x, c.labelPos.y).setDepth(plan.labelDepth);
    }
    this.syncResumeMarks();

    const unwire = wireLoader(this, this.tracker, 'yard');
    // Scoped: alive while the yard sleeps under its game; ends on shutdown.
    const scoped = bus.scoped(this);
    scoped.on('hud:home', () => {
      // Only the yard's own Home ('yard' mode): a game opened from here handles its Home itself.
      if (getHudMode() !== 'yard' || !this.scene.isActive()) return;
      this.applyAll(this.controller?.home() ?? []);
    });
    this.events.on(WAKE, this.onWake, this);
    this.events.on(SLEEP, this.onSleep, this);
    this.events.once(SHUTDOWN, () => {
      unwire();
      this.events.off(WAKE, this.onWake, this);
      this.events.off(SLEEP, this.onSleep, this);
      this.openGuard?.remove(false);
      this.openGuard = undefined;
      // Whatever the yard loaded and Map did not take is released with the yard.
      this.applyAll(this.controller?.shutdown() ?? []);
      this.controller = undefined;
    });

    setHudMode('yard');
    void revealScene(this);
    audio.say(YARD_INVITE_LINE);
    audio.setPrompt(YARD_INVITE_LINE);
  }

  override update(_time: number, delta: number): void {
    const c = this.controller;
    if (!c) return;
    this.applyAll(c.tick(delta));
    for (const id of this.tracker.drainSettled()) this.applyAll(c.assetsSettled(id));
  }

  private applyAll(cmds: readonly YardCommand[]): void {
    for (const c of cmds) this.apply(c);
  }

  private apply(c: YardCommand): void {
    switch (c.kind) {
      case 'bounce':
        this.bounceCorner(c.target);
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
        queueLoad(this, this.tracker, c.gameId, isGameId(c.gameId) ? GAMES[c.gameId]?.assets : undefined);
        return;
      case 'enter':
        void this.enterCorner(c.corner, c.gameId);
        return;
      case 'leave':
        bus.emit('yard:leave');
        return;
      case 'release':
        if (isGameId(c.gameId)) releaseAssets(this, GAMES[c.gameId]?.assets);
        return;
    }
  }

  private bounceCorner(id: CornerId): void {
    const view = this.views.get(id);
    if (!view?.image) return;
    bounce(this, view.image, view.plan.image?.scale ?? 1, amplitude(Tokens.ui.stationTapScale, this.reduced), Tokens.Timing.stationTapMs);
  }

  /** Zoom on the corner (a fade under reduced motion), then ask Map to open its game. */
  private async enterCorner(id: CornerId, gameId: string): Promise<void> {
    const view = this.views.get(id);
    const focus: Point = view?.plan.anchor ?? { x: Tokens.design.width / 2, y: Tokens.design.height / 2 };
    await enterStation(this, focus, this.reduced);
    if (!this.controller) return; // shut down meanwhile
    this.lastCorner = id;
    bus.emit('yard:open', { gameId });
    // Map sleeps the yard when it starts the game; if it did not (an unregistered id), come back.
    this.openGuard?.remove(false);
    this.openGuard = this.time.delayedCall(Tokens.Timing.sceneFadeMs, () => {
      this.openGuard = undefined;
      if (this.controller?.state === 'entering') this.onWake();
    });
  }

  /** Map slept the yard to start the entering corner's game: Map owns its assets now. */
  private onSleep(): void {
    this.controller?.handedOff();
  }

  /** The yard is back after its game (Map woke it), or a `yard:open` was not taken. */
  private onWake(): void {
    this.openGuard?.remove(false);
    this.openGuard = undefined;
    const cam = this.cameras.main;
    cam.resetFX();
    cam.setZoom(1);
    cam.setScroll(0, 0);
    void revealScene(this);
    setHudMode('yard');
    audio.setPrompt(this.lastCorner ? cornerNameLine(this.lastCorner) : YARD_INVITE_LINE);
    this.applyAll(this.controller?.woke() ?? []);
    this.syncResumeMarks();
  }

  /** A static resume mark on every corner whose game holds a snapshot (Story 2.5, as on the island). */
  private syncResumeMarks(): void {
    for (const m of this.resumeMarks) m.destroy();
    this.resumeMarks = [];
    const held = new Set<string>(session.resumeIds());
    const hits: Record<string, readonly Point[]> = {};
    for (const v of this.views.values()) if (held.has(v.plan.gameId)) hits[v.plan.gameId] = v.plan.hit;
    for (const at of resumeMarkPlan(Object.keys(hits), hits)) this.resumeMarks.push(drawResumeMark(this, at));
  }
}
