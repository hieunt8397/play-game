// Tên lửa lên Mặt Trăng (2026-11-12, spec-ten-lua): a yard game (the yard's `rocket` corner, "Tên lửa"). Free play from
// the start (MiniGameBase.startFreePlay, like the train and the plane): no rounds, no score, no right or wrong. Xoài
// builds a toy rocket on a launch pad at sunrise (three parts, two colours each), Shiba climbs in, "Ba! Hai! Một!
// Phóng!", flames and a volumetric smoke bank, the climb through the clouds into indigo space (taps boost), the Earth
// below and a surprise drifting past, a soft landing on the faceless Moon, free play there (Shiba's floaty jumps, aliens
// peeking out of craters, slow rocks, the spinning Earth, a mango flag), then home under a parachute.
// Home goes back to the yard (`round:leave`); a trip with a part on the rocket is kept (`leaveSnapshot`).
// The scene only wires Phaser: the runtime sunrise → space gradient under the space plate, the pad world and the Moon
// world (containers that slide), the rocket (a container of its parts, the pilot, the flame and its soft glow),
// the passers-by of the climb, the stars, the tap areas, tweens, and the pure model (trip.ts) that owns the steps.
import type { GameObjects, Textures, Time } from 'phaser';
import { ATLASES, BACKGROUNDS } from '../../content/assets';
import {
  ALIENS,
  ANCHORS,
  BAG_SEEDS,
  BIRD_FRAMES,
  BUBBLE_FRAME,
  CHOICES,
  CLOUD_FRAMES,
  COUNTDOWN_LINES,
  CRATERS,
  EARTH_FRAME,
  EARTH_HIT,
  EARTH_LINE,
  EARTH_MOON_HIT,
  EARTH_SMALL_FRAME,
  FLAG_FRAME,
  FLAME_FRAMES,
  HOME_LINE,
  LAUNCH_LINE,
  LIGHT_LINE,
  MOON_FRAME,
  MOON_LINE,
  MOON_ROCKET_HIT,
  MOONFAR_FRAME,
  MOTION,
  PAD_FRAMES,
  PAIR_IDS,
  PARACHUTE_FRAME,
  PART_IDS,
  PARTICLES,
  PEEK_LINE,
  PLANE_FRAMES,
  PROMPT_LINE,
  REACTIONS,
  ROCK_FRAME,
  ROCKET_HIT,
  ROCKS,
  SFX,
  SMOKE_FRAMES,
  STAR_FRAMES,
  SCENE,
  SURPRISE_FRAMES,
  WORLD,
  alienFrame,
  astroFrame,
  choiceAnchor,
  choiceHit,
  colourLine,
  craterAnchor,
  craterHit,
  partFrame,
  partLine,
  pilotFrame,
  mixAlpha,
  rockAnchor,
  skyAt,
  smoothstep,
  surpriseLine,
  type AlienId,
  type ColourId,
  type JumpId,
  type PartId,
  type PilotState,
  type SurpriseId,
} from '../../content/games/rocket';
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
  ALL_ALIENS,
  ALL_JUMPS,
  ALL_SURPRISES,
  createShuffleBag,
  createTripController,
  resumeTrip,
  type HintTarget,
  type ShuffleBag,
  type TripController,
  type TripProgress,
  type TripState,
} from './trip';

interface FrameData {
  readonly spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

const SINE = 'Sine.easeInOut';
const EASE_OUT = 'Quad.easeOut';
const EASE_IN = 'Quad.easeIn';
const BACK_OUT = 'Back.easeOut';
/** Draw order, back to front. */
const LAYERS = ['sky', 'plate', 'star', 'far', 'sun', 'hills', 'cloudBack', 'earth', 'surprise', 'world', 'moon', 'alien', 'astro', 'smokeBack', 'rocket', 'smoke', 'bubble', 'fly', 'particle', 'passer', 'glow'] as const;
const Depth = Object.fromEntries(LAYERS.map((l, i) => [l, i + 1])) as Record<(typeof LAYERS)[number], number>;
/** The sky's runtime gradient texture (repainted as the sky phase moves). */
const SKY_KEY = 'rocket.sky';
/** The runtime soft glow (a radial gradient that fades fully to clear). */
const GLOW_KEY = 'rocket.glow';

export class Rocket extends MiniGameBase<'rocket'> {
  /** The session's bags (static: a visit restarts the scene; the pairs, surprises, aliens and jumps go on across visits). */
  private static pairs: ShuffleBag<string> | undefined;
  private static surprises: ShuffleBag<SurpriseId> | undefined;
  private static aliens: ShuffleBag<AlienId> | undefined;
  private static jumps: ShuffleBag<JumpId> | undefined;
  /** Tests: a fresh session. */
  static resetSession(): void {
    Rocket.pairs = undefined;
    Rocket.surprises = undefined;
    Rocket.aliens = undefined;
    Rocket.jumps = undefined;
  }

  private layout: ScreenLayout = LAYOUTS.rocket;
  private ctl: TripController | undefined;
  private warned = new Set<string>();
  private padAt: Point = { x: 0, y: 0 };
  private flyAt: Point = { x: 0, y: 0 };
  private moonRocketAt: Point = { x: 0, y: 0 };
  private astroAt: Point = { x: 0, y: 0 };
  private astroMoonAt: Point = { x: 0, y: 0 };
  private plateImg: GameObjects.Image | undefined;
  private skyDrawn = -1;
  private padWorld: GameObjects.Container | undefined;
  private moonWorld: GameObjects.Container | undefined;
  private rocketBox: GameObjects.Container | undefined;
  private parts = new Map<PartId, GameObjects.Image>();
  private pilot: GameObjects.Image | undefined;
  private flame: GameObjects.Image | undefined;
  private glow: GameObjects.Image | undefined;
  private chute: GameObjects.Image | undefined;
  private astro: GameObjects.Image | undefined;
  private astroMoon: GameObjects.Image | undefined;
  private earthBig: GameObjects.Image | undefined;
  private earthSmall: GameObjects.Image | undefined;
  private moonFar: GameObjects.Image | undefined;
  /** Where the big Earth, the small Earth and the far Moon rest (their centres: they scale in place). */
  private earthAt: Point = { x: 0, y: 0 };
  private earthSmallAt: Point = { x: 0, y: 0 };
  private moonFarAt: Point = { x: 0, y: 0 };
  private surpriseImg: GameObjects.Image | undefined;
  private flagImg: GameObjects.Image | undefined;
  private rocks: (GameObjects.Image | undefined)[] = [];
  private stars: (GameObjects.Image | undefined)[] = [];
  private bubbles: (GameObjects.Image | undefined)[] = [];
  private choiceImgs: (GameObjects.Image | undefined)[] = [];
  private passers: { img: GameObjects.Image | undefined; at: number; x: number; kind: string; extra: (GameObjects.Image | undefined)[] }[] = [];
  /** Tweened values the scene reads each frame. */
  private flight = { padY: 0, moonY: 0, earthY: 0, flame: 0, sway: 0 };
  /** The tapped big Earth's little hop (added to its place). */
  private earthHop = { dy: 0 };
  private flameClock = 0;
  private flapClock = 0;
  private glowClock = 0;
  private prompt: string | undefined;
  /** The return's parachute moment (cancelled when the return is hurried to its end). */
  private homeTimer: Time.TimerEvent | undefined;

  constructor() {
    super('rocket');
  }

  protected override reactionSet(): ReactionSet {
    return REACTIONS;
  }

  protected build(): void {
    this.startFreePlay();
    this.cameras.main.setBackgroundColor(Tokens.art.rocket.dawnTop.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS.rocket;
    this.parts = new Map();
    this.rocks = [];
    this.stars = [];
    this.bubbles = [];
    this.choiceImgs = [];
    this.passers = [];
    this.flight = { padY: 0, moonY: this.layout.design.height, earthY: MOTION.earthRisePx, flame: 0, sway: 0 };
    this.earthHop = { dy: 0 };
    this.homeTimer = undefined;
    this.skyDrawn = -1;
    this.flameClock = 0;
    this.flapClock = 0;
    this.glowClock = 0;
    const resume = resumeTrip(this.resumeAt);
    if (this.resumeAt && !resume) console.warn('rocket: bad resume — a fresh trip');
    Rocket.pairs ??= createShuffleBag(PAIR_IDS, mulberry32(questionSeed(this.seed, BAG_SEEDS.pairs)));
    Rocket.surprises ??= createShuffleBag(ALL_SURPRISES, mulberry32(questionSeed(this.seed, BAG_SEEDS.surprises)));
    Rocket.aliens ??= createShuffleBag(ALL_ALIENS, mulberry32(questionSeed(this.seed, BAG_SEEDS.aliens)));
    Rocket.jumps ??= createShuffleBag(ALL_JUMPS, mulberry32(questionSeed(this.seed, BAG_SEEDS.jumps)));

    const design = this.layout.design;
    const centre = { x: design.width / 2, y: design.height / 2 };
    this.padAt = this.anchor(ANCHORS.rocket) ?? centre;
    this.flyAt = this.anchor(ANCHORS.fly) ?? centre;
    this.moonRocketAt = this.anchor(ANCHORS.moonRocket) ?? centre;
    this.astroAt = this.anchor(ANCHORS.astro) ?? centre;
    this.astroMoonAt = this.anchor(ANCHORS.astroMoon) ?? centre;

    this.addSky();
    this.addPadWorld();
    this.addSpace();
    this.addMoonWorld();
    this.addRocket();
    this.addPassers();

    const router = createTapRouter(this);
    const rocks = Array.from({ length: ROCKS }, (_, n) => this.anchor(rockAnchor(n)) ?? centre);
    const ctl = createTripController({
      bags: { pairs: Rocket.pairs, surprises: Rocket.surprises, aliens: Rocket.aliens, jumps: Rocket.jumps },
      rng: mulberry32(questionSeed(this.seed, BAG_SEEDS.world)),
      geometry: { width: design.width, height: design.height, rocks: rocks.map((p) => ({ x: p.x, y: p.y - SCENE.rockTapLiftPx })), horizonY: design.height * SCENE.horizonShare, tapRadiusPx: Tokens.ui.rocketTapRadiusPx },
      resume,
      lines: {
        prompt: PROMPT_LINE,
        part: partLine,
        colour: colourLine,
        count: (n) => COUNTDOWN_LINES[SCENE.countFrom - n] ?? COUNTDOWN_LINES[0]!,
        launch: LAUNCH_LINE,
        earth: EARTH_LINE,
        surprise: surpriseLine,
        moon: MOON_LINE,
        light: LIGHT_LINE,
        peek: PEEK_LINE,
        home: HOME_LINE,
      },
      sounds: {
        clank: SFX.clank,
        sparkle: SFX.sparkle,
        ignite: SFX.ignite,
        boost: SFX.boost,
        retro: SFX.retro,
        dust: SFX.dust,
        twinkle: SFX.twinkle,
        chute: SFX.chute,
        pop: SFX.pop,
        alien: (a) => ALIENS[a].sfx,
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
        offer: (p, pair) => this.offer(p, pair),
        fit: (p, c, n, ms) => this.fit(p, c, n, ms),
        board: (ms) => this.board(ms),
        count: () => this.countBeat(),
        launch: (ms) => this.launch(ms),
        skip: () => this.skipTweens(),
        ascent: () => this.ascent(),
        boost: () => this.boost(),
        space: (s, ms) => this.space(s, ms),
        land: (ms) => this.land(ms),
        moon: () => this.onMoon(),
        jump: (k) => this.jump(k),
        peek: (n, a) => this.peek(n, a),
        rock: (n) => this.rockHop(n),
        earth: () => this.earthSpin(),
        star: (n) => this.twinkle(this.stars[n]),
        surpriseTapped: (s) => this.surpriseTap(s),
        flag: () => this.plantFlag(),
        home: (ms) => this.home(ms),
        unpack: (ms) => this.unpack(ms),
        hint: (h) => this.hintAt(h),
        restore: (s) => this.restore(s),
      },
    });
    this.ctl = ctl;
    this.addStars();

    router.onAnyTap = () => ctl.anyTap();
    createTapTarget(router, { area: { contains: () => true }, onPress: (p) => this.ctl?.press(p) });
    for (let n = 0; n < CHOICES; n++) {
      createTapTarget(router, { area: { contains: (p) => this.ctl?.phase === 'build' && this.onHull(p, choiceHit(n)) }, onPress: () => this.ctl?.tapChoice(n) });
    }
    createTapTarget(router, {
      area: { contains: (p) => (this.ctl?.phase === 'countdown' && this.onHull(p, ROCKET_HIT)) || (this.ctl?.phase === 'moon' && this.onHull(p, MOON_ROCKET_HIT)) },
      onPress: () => this.ctl?.tapRocket(),
    });
    for (let n = 0; n < CRATERS; n++) {
      createTapTarget(router, { area: { contains: (p) => this.ctl?.phase === 'moon' && this.onHull(p, craterHit(n)) }, onPress: () => this.ctl?.tapCrater(n) });
    }
    createTapTarget(router, {
      area: { contains: (p) => (this.ctl?.phase === 'space' && this.onHull(p, EARTH_HIT)) || (this.ctl?.phase === 'moon' && this.onHull(p, EARTH_MOON_HIT)) },
      onPress: () => this.ctl?.tapEarth(),
    });
    this.attachReactions(router);

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
    return this.ctl?.progress() ?? { questionIndex: 0, partial: { step: 'build', colours: [], surprise: '', flag: false } };
  }

  /** Home with a part on the rocket: the trip is kept and comes back next time; otherwise nothing. */
  protected override leaveSnapshot(): Snapshot<'rocket'> | undefined {
    return this.ctl?.hasProgress ? this.snapshot() : undefined;
  }

  protected override leave(): void {
    this.ctl?.stop();
    super.leave();
  }

  override update(_time: number, delta: number): void {
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

  /** A motion's length (shorter under reduced motion). */
  private dur(ms: number): number {
    return this.reduced ? ms * Tokens.ui.rocketReducedTime : ms;
  }

  /** How many particles (fewer under reduced motion). */
  private many(n: number): number {
    return this.reduced ? Math.ceil(n * Tokens.ui.rocketReducedParticles) : n;
  }

  private anchor(id: string): Point | undefined {
    const a = this.layout.anchors[id];
    if (!a) this.warnOnce(`anchor.${id}`, `rocket: anchor "${id}" is missing from the layout`);
    return a;
  }

  private hasFrame(frame: string): boolean {
    const key = ATLASES.rocket.key;
    return this.textures.exists(key) && this.textures.get(key).has(frame);
  }

  private frameRect(frame: string): TrimmedRect | undefined {
    if (!this.hasFrame(frame)) {
      this.warnOnce(frame, `rocket: frame "${frame}" is missing`);
      return undefined;
    }
    const ss = (this.textures.get(ATLASES.rocket.key).get(frame).customData as FrameData | undefined)?.spriteSourceSize;
    const rs = this.layout.renderScale;
    return ss ? { x: ss.x / rs, y: ss.y / rs, width: ss.w / rs, height: ss.h / rs } : undefined;
  }

  /** A full-frame image of `frame` whose design point `pivot` is its origin, drawn at `at`. */
  private pivoted(frame: string, pivot: Point, at: Point): GameObjects.Image | undefined {
    if (!this.frameRect(frame)) return undefined;
    const o = originFor(pivot, this.layout.design);
    return this.add.image(at.x, at.y, ATLASES.rocket.key, frame).setScale(1 / this.layout.renderScale).setOrigin(o.x, o.y);
  }

  /** A full-frame image drawn where it was rendered. */
  private inPlace(frame: string): GameObjects.Image | undefined {
    return this.pivoted(frame, { x: 0, y: 0 }, { x: 0, y: 0 });
  }

  /** A full-width frame (cut a little at both edges so it fits an atlas page), stretched back over the screen's width. */
  private wide(frame: string): GameObjects.Image | undefined {
    const rect = this.frameRect(frame);
    if (!rect) return undefined;
    const d = this.layout.design;
    const img = this.pivoted(frame, { x: rect.x + rect.width / 2, y: 0 }, { x: d.width / 2, y: 0 });
    return img?.setScale((this.s() * d.width) / Math.max(1, rect.width), this.s());
  }

  /** A frame drawn where it was rendered, but with its origin at its trimmed centre (so it scales and turns in place). */
  private centredInPlace(frame: string): { img: GameObjects.Image | undefined; at: Point } {
    const c = this.centreOf(frame) ?? { x: 0, y: 0 };
    return { img: this.pivoted(frame, c, c), at: c };
  }

  /** `frame` drawn with its trimmed centre on `at`, at `scale` of its rendered size. */
  private centred(frame: string, at: Point, scale = 1): GameObjects.Image | undefined {
    const rect = this.frameRect(frame);
    if (!rect) return undefined;
    return this.pivoted(frame, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, at)?.setScale(scale / this.layout.renderScale);
  }

  /** The trimmed centre of a frame drawn where it was rendered. */
  private centreOf(frame: string): Point | undefined {
    const r = this.frameRect(frame);
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : undefined;
  }

  private repoint(img: GameObjects.Image | undefined, frame: string): void {
    if (img && this.hasFrame(frame)) img.setFrame(frame, false, false);
  }

  private onHull(p: Point, id: string): boolean {
    const hull = this.layout.hits[id];
    return hull !== undefined && pointInPolygon(p, hull);
  }

  private s(): number {
    return 1 / this.layout.renderScale;
  }

  // --- the props ---------------------------------------------------------------------------------------------

  /** A soft round glow of radius `r` at `at`, tinted (the texture is made once: white fading fully to clear). */
  private softGlow(at: Point, r: number, tint: number): GameObjects.Image | undefined {
    if (!this.textures.exists(GLOW_KEY)) {
      const n = SCENE.glowTexPx;
      const tex = this.textures.createCanvas(GLOW_KEY, n, n);
      const ctx = tex?.getContext();
      if (!tex || !ctx) return undefined;
      const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      g.addColorStop(0, Tokens.colors.hintCore.css);
      g.addColorStop(SCENE.glowMidStop, mixAlpha(Tokens.colors.hintCore.css, SCENE.glowMidAlpha));
      g.addColorStop(1, mixAlpha(Tokens.colors.hintCore.css, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, n, n);
      tex.refresh();
    }
    return this.add.image(at.x, at.y, GLOW_KEY).setScale((2 * r) / SCENE.glowTexPx).setTint(tint);
  }

  /** The runtime gradient (sunrise → day → violet → space) and the space plate over it. */
  private addSky(): void {
    const d = this.layout.design;
    if (this.textures.exists(SKY_KEY)) this.textures.remove(SKY_KEY);
    const tex = this.textures.createCanvas(SKY_KEY, SCENE.skyTexW, SCENE.skyTexH);
    if (tex) this.add.image(-MOTION.driftPx, -MOTION.driftPx, SKY_KEY).setOrigin(0).setDisplaySize(d.width + 2 * MOTION.driftPx, d.height + 2 * MOTION.driftPx).setDepth(Depth.sky);
    const bg = BACKGROUNDS.rocket;
    if (this.textures.exists(bg.key)) this.plateImg = this.add.image(0, 0, bg.key).setOrigin(0).setScale(1 / this.layout.renderScale).setDepth(Depth.plate).setAlpha(0);
    else this.warnOnce(bg.key, `rocket: texture "${bg.key}" is missing — plate skipped`);
  }

  private paintSky(phase: number): void {
    const tex = this.textures.exists(SKY_KEY) ? (this.textures.get(SKY_KEY) as unknown as Textures.CanvasTexture) : undefined;
    const ctx = tex?.getContext();
    if (!tex || !ctx) return;
    const c = skyAt(phase, Tokens.art.rocket);
    const g = ctx.createLinearGradient(0, 0, 0, SCENE.skyTexH);
    g.addColorStop(0, c.top);
    g.addColorStop(SCENE.skyMid, c.mid);
    g.addColorStop(1, c.low);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SCENE.skyTexW, SCENE.skyTexH);
    tex.refresh();
  }

  /** The pad world: the sun, the hills, the lawn, the launch pad, Shiba by the pad. */
  private addPadWorld(): void {
    const box = this.add.container(0, 0).setDepth(Depth.world);
    this.padWorld = box;
    const sunAt = this.anchor(ANCHORS.sun);
    const sunGlow = sunAt ? this.softGlow(sunAt, SCENE.sunGlowPx, Tokens.art.rocket.sunHalo.value)?.setAlpha(SCENE.sunGlowAlpha) : undefined;
    if (sunGlow) box.add(sunGlow);
    const sun = this.inPlace(PAD_FRAMES.sun);
    const hills = this.wide(PAD_FRAMES.hills);
    const lawn = this.wide(PAD_FRAMES.lawn);
    const pad = this.inPlace(PAD_FRAMES.launchpad);
    for (const img of [sun, hills, lawn, pad]) if (img) box.add(img);
    this.astro = this.pivoted(astroFrame('idle'), this.astroAt, this.astroAt)?.setDepth(Depth.astro);
  }

  /** Space: the big Earth below, the far Moon, the surprise (made when it comes). */
  private addSpace(): void {
    const earth = this.centredInPlace(EARTH_FRAME);
    this.earthBig = earth.img?.setDepth(Depth.earth).setVisible(false);
    this.earthAt = earth.at;
    const moon = this.centredInPlace(MOONFAR_FRAME);
    this.moonFar = moon.img?.setDepth(Depth.far).setAlpha(0);
    this.moonFarAt = moon.at;
  }

  /** The Moon world: the ground, the rocks, the flag (hidden until planted), the small Earth, Shiba on the Moon. */
  private addMoonWorld(): void {
    const box = this.add.container(0, this.layout.design.height).setDepth(Depth.moon).setVisible(false);
    this.moonWorld = box;
    const ground = this.wide(MOON_FRAME);
    if (ground) box.add(ground);
    const rock0 = this.anchor(rockAnchor(0));
    for (let n = 0; n < ROCKS; n++) {
      const at = this.anchor(rockAnchor(n));
      const img = rock0 && at ? this.pivoted(ROCK_FRAME, rock0, at) : undefined;
      if (img) box.add(img);
      this.rocks.push(img);
    }
    const flagAt = this.anchor(ANCHORS.flag);
    this.flagImg = flagAt ? this.pivoted(FLAG_FRAME, flagAt, flagAt)?.setVisible(false) : undefined;
    if (this.flagImg) box.add(this.flagImg);
    this.astroMoon = this.pivoted(astroFrame('idle'), this.astroAt, this.astroMoonAt)?.setVisible(false);
    if (this.astroMoon) box.add(this.astroMoon);
    const small = this.centredInPlace(EARTH_SMALL_FRAME);
    this.earthSmall = small.img?.setDepth(Depth.far).setAlpha(0);
    this.earthSmallAt = small.at;
  }

  /** The rocket: its parts, the pilot, the flame (under the parts) and its soft glow, the parachute. */
  private addRocket(): void {
    const box = this.add.container(this.padAt.x, this.padAt.y).setDepth(Depth.rocket);
    this.rocketBox = box;
    const zero = { x: 0, y: 0 };
    this.glow = this.softGlow({ x: 0, y: SCENE.glowBelowPx }, SCENE.flameGlowPx, Tokens.art.rocket.flameMid.value)?.setAlpha(0);
    if (this.glow) box.add(this.glow);
    this.flame = this.pivoted(FLAME_FRAMES[0], this.padAt, zero)?.setVisible(false);
    if (this.flame) box.add(this.flame);
    for (const p of PART_IDS) {
      const img = this.pivoted(partFrame(p, 'red'), this.padAt, zero)?.setVisible(false);
      if (img) box.add(img);
      if (img) this.parts.set(p, img);
    }
    this.pilot = this.pivoted(pilotFrame('empty'), this.padAt, zero)?.setVisible(false);
    if (this.pilot) box.add(this.pilot);
    // The parachute opens from its lines' knot at the nose's tip (the bottom centre of its frame).
    const chute = this.frameRect(PARACHUTE_FRAME);
    const knot = chute ? { x: chute.x + chute.width / 2, y: chute.y + chute.height } : this.padAt;
    this.chute = this.pivoted(PARACHUTE_FRAME, knot, { x: knot.x - this.padAt.x, y: knot.y - this.padAt.y })?.setVisible(false);
    if (this.chute) box.add(this.chute);
  }

  /** The climb's passers-by: clouds, a flock of birds, the cameo plane. */
  private addPassers(): void {
    const off = { x: SCENE.offscreenPx, y: SCENE.offscreenPx };
    let cloud = 0;
    for (const p of WORLD.passers) {
      if (p.kind === 'cloud') {
        const img = this.centred(CLOUD_FRAMES[cloud++ % CLOUD_FRAMES.length]!, off, cloud % 2 ? SCENE.cloudNear : SCENE.cloudFar)?.setDepth(cloud % 2 ? Depth.passer : Depth.cloudBack);
        this.passers.push({ img, at: p.at, x: p.x, kind: p.kind, extra: [] });
      } else if (p.kind === 'birds') {
        const birds = [0, 1, 2].map((i) => this.centred(BIRD_FRAMES[i % 2]!, off, 1 - SCENE.birdShrink * i)?.setDepth(Depth.passer));
        this.passers.push({ img: birds[0], at: p.at, x: p.x, kind: p.kind, extra: birds.slice(1) });
      } else {
        const img = this.centred(PLANE_FRAMES[0], off)?.setDepth(Depth.passer);
        this.passers.push({ img, at: p.at, x: p.x, kind: p.kind, extra: [] });
      }
    }
  }

  private addStars(): void {
    const c = this.ctl;
    if (!c) return;
    c.stars.forEach((p, i) => {
      const img = this.centred(STAR_FRAMES[i % SCENE.bigStarEvery === 0 ? 0 : 1]!, p, i % SCENE.bigStarEvery === 0 ? 1 : SCENE.smallStar + SCENE.smallStarStep * (i % SCENE.bigStarEvery))?.setDepth(Depth.star).setAlpha(0);
      this.stars.push(img);
      if (img && !this.reduced) {
        this.tweens.add({ targets: img, scale: img.scale * SCENE.starPulse, duration: Tokens.Timing.rocketGlowPulseMs * SCENE.starPulseBeats + SCENE.starStaggerMs * (i % SCENE.starStaggers), ease: SINE, yoyo: true, repeat: -1 });
      }
    });
  }

  // --- every frame -----------------------------------------------------------------------------------------

  private sync(delta: number): void {
    const c = this.ctl;
    if (!c) return;
    const T = Tokens.Timing;
    const d = this.layout.design;
    // The sky: the runtime gradient follows the phase; the space plate and the stars fade in near space.
    const sky = c.sky;
    if (Math.abs(sky - this.skyDrawn) > SCENE.skyRedraw || this.skyDrawn < 0) {
      this.skyDrawn = sky;
      this.paintSky(sky);
    }
    this.plateImg?.setAlpha(smoothstep(SCENE.plateFrom, 1, sky));
    const starAlpha = smoothstep(SCENE.starsFrom, SCENE.starsTo, sky);
    for (const s of this.stars) s?.setAlpha(starAlpha);
    // The pad world slides down as the rocket climbs (and back up on the way home); the Moon world rises on the landing.
    const climb = c.phase === 'ascent' ? Math.min(1, c.alt / MOTION.padSlideShare) : 0;
    const padY = c.phase === 'ascent' ? climb * d.height * SCENE.padGone : this.flight.padY;
    this.padWorld?.setY(padY).setVisible(padY < d.height * SCENE.padHidden);
    this.astro?.setY(this.astroAt.y + padY);
    this.moonWorld?.setY(this.flight.moonY).setVisible(this.flight.moonY < d.height);
    this.earthBig?.setY(this.earthAt.y + this.flight.earthY + this.earthHop.dy);
    // The passers-by cross top to bottom over their share of the climb.
    for (const p of this.passers) {
      const k = c.phase === 'ascent' ? (c.alt - p.at) / WORLD.passSpan : -1;
      const show = k > 0 && k < 1;
      const y = -SCENE.passMarginPx + k * (d.height + 2 * SCENE.passMarginPx);
      const x = d.width * p.x;
      p.img?.setVisible(show).setPosition(x, y);
      p.extra.forEach((img, i) => img?.setVisible(show).setPosition(x + SCENE.birdSpreadX * (i + 1), y + SCENE.birdSpreadY * (i % 2 ? -1 : 1)));
    }
    // The surprise drifts across space.
    const sk = c.surpriseK;
    if (this.surpriseImg) {
      this.surpriseImg.setVisible(sk >= 0 && sk < 1);
      if (sk >= 0) this.surpriseImg.setPosition(d.width * (SCENE.surpriseFrom - SCENE.surpriseSpan * sk), d.height * WORLD.surpriseY);
    }
    // The flame flickers; the bird and plane frames swap; the glow pulses (≤ 2 Hz).
    this.flameClock += delta;
    this.flapClock += delta;
    this.glowClock += delta;
    const on = this.flight.flame > SCENE.flameOff;
    if (this.flame) {
      this.flame.setVisible(on).setScale(this.s() * Math.max(SCENE.flameOff, this.flight.flame));
      if (on) this.repoint(this.flame, FLAME_FRAMES[this.reduced ? 0 : Math.floor(this.flameClock / T.rocketFlameFrameMs) % FLAME_FRAMES.length]!);
    }
    if (this.glow) {
      const pulse = 0.5 + 0.5 * Math.sin((this.glowClock / T.rocketGlowPulseMs) * Math.PI);
      this.glow.setAlpha(on ? this.flight.flame * (MOTION.glowLow + (MOTION.glowHigh - MOTION.glowLow) * (this.reduced ? 0.5 : pulse)) : 0);
    }
    const flap = this.reduced ? 0 : Math.floor(this.flapClock / SCENE.flapMs) % 2;
    for (const p of this.passers) {
      if (p.kind === 'birds') [p.img, ...p.extra].forEach((img, i) => this.repoint(img, BIRD_FRAMES[(flap + i) % 2]!));
      if (p.kind === 'plane') this.repoint(p.img, PLANE_FRAMES[flap]!);
    }
    // The rocket sways gently while it climbs.
    if (this.rocketBox && c.phase === 'ascent' && !this.reduced) this.rocketBox.setAngle(Math.sin(this.flameClock / SCENE.swayMs) * MOTION.swayDeg);
  }

  // --- the model's view ----------------------------------------------------------------------------------------

  /** A part is offered: two bubbles pop in, each with the part in its colour. */
  private offer(part: PartId, pair: readonly [ColourId, ColourId]): void {
    this.clearChoices();
    for (let n = 0; n < CHOICES; n++) {
      const at = this.anchor(choiceAnchor(n));
      if (!at) continue;
      const bubble = this.centred(BUBBLE_FRAME, at)?.setDepth(Depth.bubble);
      const img = this.centred(partFrame(part, pair[n]!), at, MOTION.choiceScale)?.setDepth(Depth.bubble);
      for (const o of [bubble, img]) {
        if (!o) continue;
        const end = o.scale;
        o.setScale(end * SCENE.popFrom);
        this.tweens.add({ targets: o, scale: end, duration: this.dur(Tokens.Timing.rocketTapMs), ease: BACK_OUT, delay: n * SCENE.popStaggerMs });
        if (!this.reduced) this.tweens.add({ targets: o, y: at.y - MOTION.bubbleBobPx, duration: SCENE.bobMs + n * SCENE.bobStaggerMs, ease: SINE, yoyo: true, repeat: -1, delay: SCENE.bobDelayMs });
      }
      this.bubbles[n] = bubble;
      this.choiceImgs[n] = img;
    }
  }

  private clearChoices(): void {
    for (const o of [...this.bubbles, ...this.choiceImgs]) {
      if (!o) continue;
      this.tweens.killTweensOf(o);
      o.destroy();
    }
    this.bubbles = [];
    this.choiceImgs = [];
  }

  /** The picked part flies from its bubble onto the rocket; the other bubble fades; sparkles where it lands. */
  private fit(part: PartId, colour: ColourId, choice: number, ms: number): void {
    const frame = partFrame(part, colour);
    const flyer = this.choiceImgs[choice];
    this.choiceImgs[choice] = undefined;
    this.bubbles.forEach((b, n) => {
      if (!b) return;
      this.tweens.killTweensOf(b);
      this.tweens.add({ targets: b, scale: b.scale * (n === choice ? MOTION.bubblePop : SCENE.otherBubble), alpha: 0, duration: ms * SCENE.bubbleFade, ease: EASE_OUT });
    });
    this.choiceImgs.forEach((o) => o && this.tweens.add({ targets: o, alpha: 0, duration: ms * SCENE.bubbleFade }));
    const target = this.centreOf(frame);
    const land = (): void => {
      flyer?.destroy();
      const img = this.parts.get(part);
      if (img) {
        this.repoint(img, frame);
        img.setVisible(true);
      }
      if (this.rocketBox && !this.reduced) this.tweens.add({ targets: this.rocketBox, scaleY: SCENE.clickSquash, duration: SCENE.clickMs, yoyo: true, ease: SINE, onComplete: () => this.rocketBox?.setScale(1) });
      if (target) this.sparkles(target, MOTION.sparkles);
    };
    if (!flyer || !target) {
      this.time.delayedCall(ms, land);
      return;
    }
    this.tweens.killTweensOf(flyer);
    this.tweens.add({ targets: flyer, x: target.x, scale: this.s(), duration: ms, ease: SINE });
    this.tweens.chain({
      targets: flyer,
      tweens: [
        { y: Math.min(flyer.y, target.y) - this.amp(MOTION.fitArcPx), duration: ms * SCENE.arcUp, ease: EASE_OUT },
        { y: target.y, duration: ms * (1 - SCENE.arcUp), ease: EASE_IN, onComplete: land },
      ],
    });
  }

  /** Sparkles burst from `at` and fade. */
  private sparkles(at: Point, n: number): void {
    for (let i = 0; i < this.many(n); i++) {
      const a = (2 * Math.PI * i) / n + SCENE.sparkAngle;
      const sp = this.centred(PARTICLES.spark, at, SCENE.sparkScale)?.setDepth(Depth.particle);
      if (!sp) continue;
      this.tweens.add({
        targets: sp,
        x: at.x + Math.cos(a) * this.amp(MOTION.sparkleFlyPx),
        y: at.y + Math.sin(a) * this.amp(MOTION.sparkleFlyPx),
        alpha: 0,
        scale: sp.scale * SCENE.sparkEnd,
        duration: Tokens.Timing.rocketSparkMs,
        ease: EASE_OUT,
        onComplete: () => sp.destroy(),
      });
    }
  }

  /** Shiba hops from the pad into the rocket, then waves through the porthole. */
  private board(ms: number): void {
    this.clearChoices();
    const port = this.anchor(ANCHORS.porthole);
    const a = this.astro;
    const done = (): void => {
      a?.setVisible(false);
      this.setPilot('wave');
      this.pilot?.setVisible(true);
      if (port) this.sparkles(port, SCENE.boardSparks);
    };
    this.setPilot('empty');
    this.pilot?.setVisible(true);
    if (!a || !port || this.reduced) {
      if (a) this.tweens.add({ targets: a, alpha: 0, duration: ms });
      this.time.delayedCall(ms, done);
      return;
    }
    this.repoint(a, astroFrame('jump'));
    this.tweens.add({ targets: a, x: port.x, scale: a.scale * SCENE.boardShrink, alpha: SCENE.boardFade, duration: ms, ease: SINE });
    this.tweens.chain({ targets: a, tweens: [{ y: a.y - SCENE.boardHopPx, duration: ms * SCENE.arcUp, ease: EASE_OUT }, { y: port.y + SCENE.boardDropPx, duration: ms * (1 - SCENE.arcUp), ease: EASE_IN, onComplete: done }] });
  }

  private setPilot(s: PilotState): void {
    this.repoint(this.pilot, pilotFrame(s));
  }

  /** A countdown beat: the rocket gives a little bounce; Shiba waves. */
  private countBeat(): void {
    const box = this.rocketBox;
    this.setPilot('wave');
    if (!box || this.reduced) return;
    this.tweens.add({ targets: box, scaleY: SCENE.beatStretch, duration: SCENE.beatMs, yoyo: true, ease: SINE, onComplete: () => box.setScale(1) });
  }

  /** Ignition: the flame and its glow, the smoke bank rolling out, a small rumble, embers, liftoff to the flight height. */
  private launch(ms: number): void {
    const T = Tokens.Timing;
    this.setPilot('happy');
    this.tweens.add({ targets: this.flight, flame: 1, duration: ms * SCENE.flameIn, ease: EASE_OUT });
    if (!this.reduced) this.cameras.main.shake(Math.min(SCENE.rumbleMaxMs, T.rocketRumbleMs), Tokens.ui.rocketRumblePx / this.layout.design.width);
    // The smoke: its three frames, one after another, each growing, drifting and fading (the last one lingers).
    SMOKE_FRAMES.forEach((f, i) => {
      this.time.delayedCall((ms * SCENE.smokeStagger * i) / (this.reduced ? 2 : 1), () => {
        const img = this.pivoted(f, this.padAt, { x: this.padAt.x, y: this.padAt.y + this.flight.padY })?.setDepth(Depth.smokeBack).setAlpha(0);
        if (!img) return;
        const life = this.dur(T.rocketSmokeMs) * (i === 2 ? SCENE.smokeLinger : 1);
        this.tweens.add({ targets: img, alpha: 1, duration: life * SCENE.smokeFadeIn, ease: SINE });
        this.tweens.add({ targets: img, scaleX: img.scaleX * MOTION.smokeEndScale, scaleY: img.scaleY * (1 + (MOTION.smokeEndScale - 1) * 0.5), x: img.x + (i % 2 ? -1 : 1) * this.amp(MOTION.smokeDriftPx), duration: life, ease: EASE_OUT });
        this.tweens.add({ targets: img, alpha: 0, delay: life * SCENE.smokeFadeAt, duration: life * (1 - SCENE.smokeFadeAt), ease: SINE, onComplete: () => img.destroy() });
        // The smoke rides down with the pad world as the rocket climbs.
        const follow = this.time.addEvent({ delay: SCENE.followMs, loop: true, callback: () => (img.active ? img.setY(this.padAt.y + (this.padWorld?.y ?? 0)) : follow.remove()) });
      });
    });
    for (let i = 0; i < this.many(MOTION.embers); i++) {
      const e = this.centred(PARTICLES.spark, { x: this.padAt.x, y: this.padAt.y + SCENE.emberDropPx }, SCENE.emberScale)?.setDepth(Depth.particle).setTint(Tokens.art.rocket.flameOut.value);
      if (!e) continue;
      const a = Math.PI * (SCENE.emberArcFrom + SCENE.emberArcSpan * (i / MOTION.embers));
      this.tweens.add({ targets: e, x: e.x + Math.cos(a) * MOTION.emberFlyPx * SCENE.emberWide, y: e.y + Math.sin(a) * MOTION.emberFlyPx * 0.5, alpha: 0, duration: T.rocketSparkMs * SCENE.emberLife, delay: ms * SCENE.emberDelay, ease: EASE_OUT, onComplete: () => e.destroy() });
    }
    if (this.rocketBox) this.tweens.add({ targets: this.rocketBox, x: this.flyAt.x, y: this.flyAt.y, delay: ms * SCENE.liftDelay, duration: ms * (1 - SCENE.liftDelay), ease: EASE_IN });
  }

  private ascent(): void {
    this.rocketBox?.setPosition(this.flyAt.x, this.flyAt.y);
    this.flight.flame = 1;
    this.flight.padY = this.layout.design.height * SCENE.padGone;
  }

  /** A boost: the rocket jumps a little, the flame flares, sparkles fly out of the nozzle. */
  private boost(): void {
    const box = this.rocketBox;
    if (!box) return;
    this.tweens.add({ targets: this.flight, flame: MOTION.boostFlame, duration: Tokens.Timing.rocketBoostMs / 2, yoyo: true, ease: SINE, onComplete: () => (this.flight.flame = 1) });
    this.tweens.add({ targets: box, y: this.flyAt.y - this.amp(MOTION.boostLiftPx), duration: Tokens.Timing.rocketBoostMs / 2, yoyo: true, ease: SINE });
    this.sparkles({ x: box.x, y: box.y + SCENE.boostSparkPx }, SCENE.boostSparks);
  }

  /** Space: the Earth rises from below, the far Moon glows in; the surprise starts across. */
  private space(surprise: SurpriseId, ms: number): void {
    this.earthBig?.setVisible(true);
    this.flight.earthY = MOTION.earthRisePx;
    this.tweens.add({ targets: this.flight, earthY: 0, duration: this.dur(ms * SCENE.earthRise), ease: EASE_OUT });
    this.earthBig?.setScale(this.s()).setAngle(0);
    if (this.moonFar) {
      this.tweens.killTweensOf(this.moonFar);
      this.moonFar.setScale(this.s()).setPosition(this.moonFarAt.x, this.moonFarAt.y).setAlpha(0);
      this.tweens.add({ targets: this.moonFar, alpha: 1, duration: ms * SCENE.moonFarIn, ease: SINE });
    }
    this.surpriseImg?.destroy();
    this.surpriseImg = this.centred(SURPRISE_FRAMES[surprise], { x: SCENE.surpriseHidePx, y: SCENE.surpriseHidePx })?.setDepth(Depth.surprise);
    if (this.surpriseImg && !this.reduced) this.tweens.add({ targets: this.surpriseImg, angle: surprise === 'ringed' ? SCENE.surpriseRockDeg : -SCENE.surpriseRockDeg, duration: SCENE.surpriseRockMs, yoyo: true, repeat: -1, ease: SINE });
  }

  /** The landing: the Earth goes below, the Moon rises, the rocket settles on it with retro puffs. */
  private land(ms: number): void {
    const d = this.layout.design;
    this.surpriseImg?.destroy();
    this.surpriseImg = undefined;
    this.moonWorld?.setVisible(true);
    this.flight.moonY = MOTION.moonRisePx;
    this.tweens.add({ targets: this.flight, earthY: d.height, duration: ms * SCENE.landEarthOut, ease: EASE_IN });
    this.tweens.add({ targets: this.flight, moonY: 0, duration: ms * SCENE.landMoonIn, ease: EASE_OUT });
    if (this.moonFar) this.tweens.add({ targets: this.moonFar, alpha: 0, scale: this.moonFar.scale * MOTION.moonfarGrow, duration: ms * 0.5 });
    if (this.earthSmall) {
      this.tweens.killTweensOf(this.earthSmall);
      this.earthSmall.setScale(this.s()).setPosition(this.earthSmallAt.x, this.earthSmallAt.y).setAngle(0).setAlpha(0);
      this.tweens.add({ targets: this.earthSmall, alpha: 1, delay: ms * SCENE.landSmallAt, duration: ms * SCENE.landSmallIn });
    }
    this.tweens.add({ targets: this.flight, flame: SCENE.landFlame, duration: ms * SCENE.landFlameIn });
    if (this.rocketBox) {
      this.tweens.add({ targets: this.rocketBox, angle: 0, duration: ms * SCENE.landTurn });
      this.tweens.add({ targets: this.rocketBox, x: this.moonRocketAt.x, y: this.moonRocketAt.y, duration: ms, ease: SINE });
    }
    for (let i = 0; i < this.many(MOTION.retroPuffs); i++) {
      this.time.delayedCall(ms * (SCENE.retroAt + SCENE.retroStep * i), () => this.puffAt({ x: (this.rocketBox?.x ?? 0) + (i % 2 ? -SCENE.retroSpreadPx : SCENE.retroSpreadPx), y: (this.rocketBox?.y ?? 0) + SCENE.retroDropPx }));
    }
  }

  /** On the Moon: the flame goes out, a ring of dust, Shiba hops out. */
  private onMoon(): void {
    this.tweens.killTweensOf(this.flight);
    this.flight.flame = 0;
    this.flight.moonY = 0;
    this.flight.earthY = this.layout.design.height;
    this.earthBig?.setVisible(false);
    this.moonWorld?.setVisible(true);
    if (this.earthSmall) {
      this.tweens.killTweensOf(this.earthSmall);
      this.earthSmall.setScale(this.s()).setPosition(this.earthSmallAt.x, this.earthSmallAt.y).setAngle(0).setAlpha(1);
    }
    if (this.moonFar) {
      this.tweens.killTweensOf(this.moonFar);
      this.moonFar.setAlpha(0);
    }
    this.rocketBox?.setPosition(this.moonRocketAt.x, this.moonRocketAt.y).setAngle(0);
    this.dustRing({ x: this.moonRocketAt.x, y: this.moonRocketAt.y });
    this.setPilot('empty');
    const a = this.astroMoon;
    if (!a) return;
    this.repoint(a, astroFrame('happy'));
    this.tweens.killTweensOf(a);
    a.setVisible(true).setAlpha(1).setScale(this.s()).setAngle(0).setPosition(this.astroMoonAt.x, this.astroMoonAt.y);
    if (!this.reduced) {
      const toY = this.astroMoonAt.y;
      a.setPosition(this.moonRocketAt.x + SCENE.hopOutX, toY - SCENE.hopOutY);
      this.tweens.add({ targets: a, x: this.astroMoonAt.x, duration: Tokens.Timing.rocketJumpMs * SCENE.hopOutShare, ease: SINE });
      this.tweens.add({ targets: a, y: toY, duration: Tokens.Timing.rocketJumpMs * SCENE.hopOutShare, ease: 'Bounce.easeOut', onComplete: () => this.repoint(a, astroFrame('idle')) });
    } else this.repoint(a, astroFrame('idle'));
  }

  private puffAt(at: Point, scale: number = MOTION.puffStart): void {
    const p = this.centred(PARTICLES.puff, at, scale)?.setDepth(Depth.particle).setAlpha(MOTION.puffAlpha);
    if (!p) return;
    this.tweens.add({ targets: p, scale: p.scale * MOTION.puffEnd, alpha: 0, y: at.y - SCENE.puffRisePx, duration: this.dur(Tokens.Timing.rocketPuffMs), ease: EASE_OUT, onComplete: () => p.destroy() });
  }

  private dustRing(at: Point): void {
    const n = this.many(MOTION.dustPuffs);
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (i / Math.max(1, n - 1));
      this.puffAt({ x: at.x + Math.cos(a) * this.amp(MOTION.dustSpreadPx), y: at.y - Math.sin(a) * SCENE.dustRisePx }, MOTION.puffStart * SCENE.dustScale);
    }
  }

  /** Shiba's Moon jump: up fast, a slow float down (high, a slow spin, or a wave), a puff of dust on landing. */
  private jump(kind: JumpId): void {
    const a = this.astroMoon;
    if (!a) return;
    const T = Tokens.Timing;
    const ms = T.rocketJumpMs;
    const y0 = this.astroMoonAt.y;
    this.tweens.killTweensOf(a);
    a.setPosition(this.astroMoonAt.x, y0).setAngle(0).setScale(this.s());
    this.repoint(a, astroFrame(kind === 'wave' ? 'wave' : 'jump'));
    const land = (): void => {
      a.setAngle(0);
      this.repoint(a, astroFrame('idle'));
      this.dustRing({ x: this.astroMoonAt.x, y: y0 });
    };
    this.tweens.chain({
      targets: a,
      tweens: [
        { y: y0 - this.amp(MOTION.jumpPx), duration: ms * SCENE.jumpUp, ease: EASE_OUT },
        { y: y0, duration: ms * (1 - SCENE.jumpUp), ease: 'Sine.easeIn', onComplete: land },
      ],
    });
    // The 'spin' jump rocks Shiba side to side in the air (its pivot is its feet: a full turn would swing it round).
    if (kind === 'spin' && !this.reduced) {
      const q = (ms * SCENE.spinShare) / SCENE.spinSwings;
      this.tweens.chain({
        targets: a,
        tweens: [
          { angle: MOTION.spinDeg, duration: q, ease: SINE },
          { angle: -MOTION.spinDeg, duration: 2 * q, ease: SINE },
          { angle: 0, duration: q, ease: SINE },
        ],
      });
    }
  }

  /** An alien rises out of crater `n` (it grows up from the crater), waves, and sinks back. */
  private peek(n: number, alien: AlienId): void {
    const c0 = this.anchor(craterAnchor(0));
    const at = this.anchor(craterAnchor(n));
    if (!c0 || !at || !this.moonWorld) return;
    const img = this.pivoted(alienFrame(alien, 'peek'), c0, at);
    if (!img) return;
    this.moonWorld.add(img);
    const s = img.scaleY;
    const ms = Tokens.Timing.rocketPeekMs;
    img.setScale(s, SCENE.flat);
    this.tweens.chain({
      targets: img,
      tweens: [
        { scaleY: s, duration: ms * SCENE.peekGrow, ease: BACK_OUT, onComplete: () => this.repoint(img, alienFrame(alien, 'wave')) },
        { angle: this.amp(MOTION.waveDeg), duration: ms * SCENE.peekWave, yoyo: true, repeat: 1, ease: SINE },
        { scaleY: SCENE.flat, duration: ms * SCENE.peekGrow, delay: ms * SCENE.peekHold, ease: EASE_IN, onComplete: () => img.destroy() },
      ],
    });
    this.sparkles({ x: at.x, y: at.y - SCENE.peekSparkPx }, SCENE.peekSparks);
  }

  private rockHop(n: number): void {
    const img = this.rocks[n];
    const at = this.anchor(rockAnchor(n));
    if (!img || !at) return;
    this.tweens.killTweensOf(img);
    img.setY(at.y);
    this.tweens.add({ targets: img, y: at.y - this.amp(MOTION.rockHopPx), duration: Tokens.Timing.rocketRockMs / 2, yoyo: true, ease: 'Sine.easeOut', onComplete: () => this.puffAt({ x: at.x, y: at.y }, MOTION.puffStart * SCENE.sparkScale) });
  }

  private earthSpin(): void {
    if (this.ctl?.phase !== 'moon') {
      // The big Earth is only its top cap (its centre is below the screen): it hops up a little instead of turning.
      this.tweens.killTweensOf(this.earthHop);
      this.earthHop.dy = 0;
      this.tweens.add({ targets: this.earthHop, dy: -this.amp(MOTION.earthHopPx), duration: Tokens.Timing.rocketEarthSpinMs / 2, yoyo: true, ease: SINE, onComplete: () => (this.earthHop.dy = 0) });
      this.sparkles({ x: this.earthAt.x, y: SCENE.earthSparkY }, SCENE.earthSparks);
      return;
    }
    const img = this.earthSmall;
    if (!img) return;
    const c = this.earthSmallAt;
    // From its rest scale every time (a tap during the bounce never grows it further).
    this.tweens.killTweensOf(img);
    img.setScale(this.s()).setAngle(0);
    this.tweens.add({ targets: img, scale: this.s() * (1 + this.amp(MOTION.tapGrow - 1) * SCENE.earthGrow), angle: this.amp(MOTION.earthSpinDeg), duration: Tokens.Timing.rocketEarthSpinMs / 2, yoyo: true, ease: SINE, onComplete: () => img.setScale(this.s()).setAngle(0) });
    this.sparkles(c, SCENE.earthSparks);
  }

  /** A star twinkles: a quarter turn and back (its scale is the pulse's: a tap never touches it). */
  private twinkle(img: GameObjects.Image | undefined): void {
    if (!img) return;
    if (img.angle !== 0) return;
    this.tweens.add({ targets: img, angle: SCENE.twinkleDeg, duration: Tokens.Timing.rocketTwinkleMs / 2, yoyo: true, ease: SINE, onComplete: () => img.setAngle(0) });
    this.sparkles({ x: img.x, y: img.y }, SCENE.boostSparks);
  }

  private surpriseTap(s: SurpriseId): void {
    const img = this.surpriseImg;
    if (!img) return;
    if (s === 'ufo') {
      this.repoint(img, SURPRISE_FRAMES.ufoWave);
      this.time.delayedCall(SCENE.ufoWaveMs, () => img.active && this.repoint(img, SURPRISE_FRAMES.ufo));
    } else if (s === 'satellite') {
      this.repoint(img, SURPRISE_FRAMES.satelliteFlap);
      this.time.delayedCall(SCENE.satFlapMs, () => img.active && this.repoint(img, SURPRISE_FRAMES.satellite));
    }
    // A bounce from its rest scale (its rocking angle tween keeps going).
    if (img.scale === this.s()) this.tweens.add({ targets: img, scale: this.s() * MOTION.tapGrow, duration: Tokens.Timing.rocketTwinkleMs / 2, yoyo: true, ease: SINE, onComplete: () => img.setScale(this.s()) });
    this.sparkles({ x: img.x, y: img.y }, SCENE.surpriseSparks);
  }

  private plantFlag(): void {
    const f = this.flagImg;
    if (!f) return;
    const s = f.scaleY;
    f.setVisible(true).setScale(f.scaleX, SCENE.flat);
    this.tweens.add({ targets: f, scaleY: s, duration: Tokens.Timing.rocketFlagMs, ease: BACK_OUT });
    const at = this.anchor(ANCHORS.flag);
    if (at) this.sparkles({ x: at.x + SCENE.flagSparkX, y: at.y - SCENE.flagSparkY }, SCENE.flagSparks);
    if (this.astroMoon) {
      this.repoint(this.astroMoon, astroFrame('wave'));
      this.time.delayedCall(Tokens.Timing.rocketFlagMs * SCENE.flagWave, () => this.astroMoon && this.repoint(this.astroMoon, astroFrame('idle')));
    }
  }

  /** Home: Shiba hops in, liftoff, the Moon falls away, the Earth grows, the parachute, the pad rises, touchdown. */
  private home(ms: number): void {
    const d = this.layout.design;
    const a = this.astroMoon;
    if (a) this.tweens.add({ targets: a, x: this.moonRocketAt.x, y: this.moonRocketAt.y - SCENE.homeHopUpPx, alpha: 0, scale: a.scale * SCENE.homeShrink, duration: ms * SCENE.homeHop, ease: SINE });
    this.time.delayedCall(ms * SCENE.homeHop, () => this.setPilot('happy'));
    this.tweens.add({ targets: this.flight, flame: 1, duration: ms * SCENE.homeFlameIn });
    if (this.rocketBox) {
      this.tweens.chain({
        targets: this.rocketBox,
        tweens: [
          { x: this.flyAt.x, y: this.flyAt.y - SCENE.homeLiftPx, duration: ms * SCENE.homeLift, ease: EASE_IN },
          { x: this.padAt.x, y: this.padAt.y, duration: ms * SCENE.homeDescend, delay: ms * SCENE.homeDescendDelay, ease: SINE },
        ],
      });
    }
    this.tweens.add({ targets: this.flight, moonY: d.height, duration: ms * SCENE.homeMoonOut, ease: EASE_IN });
    if (this.earthSmall) this.tweens.add({ targets: this.earthSmall, scale: this.earthSmall.scale * SCENE.homeEarthGrow, y: this.earthSmallAt.y + d.height * SCENE.homeEarthDrop, alpha: 0, duration: ms * SCENE.homeEarthShare, ease: EASE_IN });
    // The parachute opens and the flame goes out; the pad world rises from below to meet the rocket.
    this.homeTimer?.remove(false);
    this.homeTimer = this.time.delayedCall(ms * SCENE.homeChuteAt, () => {
      this.homeTimer = undefined;
      this.tweens.add({ targets: this.flight, flame: 0, duration: ms * SCENE.homeFlameIn });
      const c = this.chute;
      if (c) {
        const s = this.s();
        c.setVisible(true).setScale(s * MOTION.chuteFrom);
        this.tweens.add({ targets: c, scale: s, duration: ms * SCENE.chuteOpen, ease: BACK_OUT });
      }
      this.flight.padY = d.height;
      this.padWorld?.setVisible(true);
      this.tweens.add({ targets: this.flight, padY: 0, duration: ms * SCENE.padRise, ease: EASE_OUT });
    });
  }

  /** Back on the pad: the parachute folds, the parts pop off one by one; Shiba hops out to stand by the pad. */
  private unpack(ms: number): void {
    this.homeTimer?.remove(false);
    this.homeTimer = undefined;
    this.tweens.killTweensOf(this.flight);
    this.flight.padY = 0;
    this.flight.moonY = this.layout.design.height;
    this.flight.flame = 0;
    this.moonWorld?.setVisible(false);
    this.flagImg?.setVisible(false);
    if (this.astroMoon) this.tweens.killTweensOf(this.astroMoon);
    this.astroMoon?.setVisible(false).setAlpha(1).setAngle(0).setScale(this.s());
    this.earthSmall?.setAlpha(0);
    this.rocketBox?.setPosition(this.padAt.x, this.padAt.y).setAngle(0);
    this.chute?.setVisible(false);
    this.pilot?.setVisible(false);
    this.dustRing(this.padAt);
    const order: PartId[] = ['nose', 'fins', 'body'];
    order.forEach((p, i) => {
      const img = this.parts.get(p);
      if (!img) return;
      this.time.delayedCall((ms * SCENE.unpackStep * i) / (this.reduced ? 2 : 1), () => {
        this.tweens.add({ targets: img, y: img.y - this.amp(MOTION.unpackHopPx), alpha: 0, duration: ms * SCENE.unpackHop, ease: EASE_OUT, onComplete: () => img.setVisible(false).setAlpha(1).setY(0) });
        const c = this.centreOf(partFrame(p, 'red'));
        if (c) this.sparkles(c, SCENE.unpackSparks);
      });
    });
    const a = this.astro;
    if (a) {
      this.tweens.killTweensOf(a);
      this.repoint(a, astroFrame('happy'));
      a.setVisible(true).setAlpha(0).setPosition(this.astroAt.x, this.astroAt.y).setScale(this.s());
      this.tweens.add({ targets: a, alpha: 1, duration: ms * SCENE.astroIn, onComplete: () => this.repoint(a, astroFrame('idle')) });
    }
  }

  private skipTweens(): void {
    // The model has jumped to the motion's end; the scene finishes its running tweens of the flight.
    for (const t of this.tweens.getTweensOf(this.flight)) t.complete();
    if (this.rocketBox) for (const t of this.tweens.getTweensOf(this.rocketBox)) t.complete();
  }

  /** A bounce from the rest scale (the hint). */
  private bounce(target: GameObjects.Image | undefined): void {
    if (!target) return;
    const base = target.scaleX;
    this.tweens.add({ targets: target, scale: base * (1 + this.amp(Tokens.ui.rocketHintBounce - 1)), duration: Tokens.Timing.rocketTapMs / 2, ease: SINE, yoyo: true, repeat: 1, onComplete: () => target.setScale(base) });
  }

  private hintAt(target: HintTarget): void {
    if (target === 'choice') {
      for (const b of this.bubbles) this.bounce(b);
      return;
    }
    this.bounce(this.astroMoon);
  }

  /** A resumed trip shows at once: the fitted parts; on the pad Shiba in the rocket; on the Moon the whole Moon scene. */
  private restore(state: TripState): void {
    state.colours.forEach((c, i) => {
      const p = PART_IDS[i];
      const img = p ? this.parts.get(p) : undefined;
      if (!p || !img) return;
      this.repoint(img, partFrame(p, c));
      img.setVisible(true);
    });
    if (state.step === 'build') return;
    this.astro?.setVisible(false);
    this.setPilot('idle');
    this.pilot?.setVisible(true);
    if (state.step !== 'moon') return;
    this.flight.padY = this.layout.design.height * SCENE.padGone;
    this.onMoon();
    this.astroMoon?.setPosition(this.astroMoonAt.x, this.astroMoonAt.y);
    if (state.flag) this.flagImg?.setVisible(true);
  }
}

