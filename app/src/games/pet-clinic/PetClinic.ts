// Bác sĩ thú cưng (Story 8.1): a yard game (the yard's `clinic` corner). A patient (a real pen animal) walks in from
// the left with 1–2 visible problems (mud, a rumbling tummy, a scrape, yawning); Xoài drags a tool from the tray onto
// it, or taps the tool and then the patient (FR29). A fitting tool clears its problem with its own reaction (a giggle
// under the shower, a burp after the milk, a pat on the plaster, a short nap under the blanket) and one correct
// flourish; a tool that fits nothing makes the patient tilt its head (FR30) and the voice says what it needs again.
// Once well, the patient thanks her, hops and walks out; the next one walks in. After `petClinicPatientsPerRound`
// patients the round completes and the next round follows (continuous play, MiniGameBase). Home goes back to the yard.
// The scene only wires Phaser: the plate, the patient (a container on its ground pivot holding its base / tilt frame
// and its overlays, all rendered at the exam spot and shifted along the walk row: the plate's camera is orthographic),
// the tools (DragControllers with tap-then-tap; one released off the patient stays where it was released), the
// particles, tweens, and the pure controller (round.ts) that decides everything.
import type { GameObjects } from 'phaser';
import { ATLASES, BACKGROUNDS } from '../../content/assets';
import {
  CUE_SOUNDS,
  DOOR_ANCHOR,
  FIX_SOUNDS,
  INVITE_LINE,
  NEED_LINES,
  OVERLAYS,
  PARTICLES,
  PATIENT_ANCHOR,
  PATIENT_HIT,
  PATIENT_IDS,
  PATIENTS,
  REACTIONS,
  SFX,
  THANKS_LINE,
  TILT_FRAME_PATIENTS,
  TOOL_IDS,
  TOOL_SPOT,
  patientFrame,
  spotAnchor,
  toolFrame,
  toolHitRadius,
  type ChoseOtherReaction,
  type CorrectReaction,
  type OverlayId,
  type PatientId,
  type ProblemId,
  type ToolId,
} from '../../content/games/pet-clinic';
import type { Point, ScreenLayout } from '../../content/layout-types';
import { LAYOUTS } from '../../content/layouts';
import { audio } from '../../core/audio-director';
import { bus } from '../../core/bus';
import { createSelectionRing, type SelectionRing } from '../../core/hint-visuals';
import { createDraggable, type Draggable } from '../../core/input/drag-controller';
import { createDropTarget, type DropTarget } from '../../core/input/drop';
import { inputGuard } from '../../core/input/guard';
import { pointInPolygon } from '../../core/input/polygon';
import { createTapRouter } from '../../core/input/tap-router';
import { createTapTarget } from '../../core/input/tap-target';
import type { ReactionSet } from '../../core/reactions';
import { prefersReducedMotion } from '../../core/reduced-motion';
import { mulberry32, questionSeed } from '../../core/rng';
import { Tokens } from '../../core/tokens';
import { originFor, type TrimmedRect } from '../../core/ui/sprite-pivot';
import { MiniGameBase } from '../mini-game-base';
import { createClinicController, createPatientBag, resumeClinic, type ClinicController, type ClinicProgress, type PatientBag } from './round';

interface FrameData {
  readonly spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

const SINE = 'Sine.easeInOut';
const EASE_OUT = 'Quad.easeOut';
/** Draw order, back to front: the patient, the tools at rest, the particles, a lifted tool on top. */
const LAYERS = ['patient', 'tool', 'particle', 'lifted'] as const;
const Depth = Object.fromEntries(LAYERS.map((l, i) => [l, i + 1])) as Record<(typeof LAYERS)[number], number>;
/** The wiggle flourish, the head tilt and the double take: steps in fractions of their angle, each an equal share of the time. */
const WIGGLE_STEPS = [1, -1, 1, 0] as const;
const TILT_STEPS = [1, 1, 0] as const;
const DOUBLE_TAKE_STEPS = [1, -1, 0] as const;
/** The overlay that shows each waiting problem (the tummy shows as wavy lines, the yawn as a cue only). */
const PROBLEM_OVERLAY: Readonly<Partial<Record<ProblemId, OverlayId>>> = { mud: 'mud', scrape: 'scrape' };

interface ToolView {
  readonly id: ToolId;
  readonly image: GameObjects.Image | undefined;
  readonly home: Point;
  readonly radius: number;
  pos: Point;
  drag: Draggable | undefined;
  /** True while the tool is being used on the patient (it cannot be lifted). */
  busy: boolean;
  /** The running move (float back, return, tap fly) and its onDone: a lift stops it, a new move hands over first. */
  move: { stop(): unknown } | undefined;
  moveDone: (() => void) | undefined;
}

interface PatientView {
  readonly id: PatientId;
  readonly box: GameObjects.Container;
  readonly base: GameObjects.Image | undefined;
  readonly tilt: GameObjects.Image | undefined;
  readonly overlays: Map<OverlayId, GameObjects.Image>;
  wave: GameObjects.Image | undefined;
  /** The shift (design px) from the exam spot where the walk starts and ends. */
  readonly offX: number;
}

export class PetClinic extends MiniGameBase<'pet-clinic'> {
  /** The session's bag (static: the scene restarts for every round). */
  private static bag: PatientBag | undefined;
  /** Tests: a fresh session. */
  static resetSession(): void {
    PetClinic.bag = undefined;
  }

  private layout: ScreenLayout = LAYOUTS['pet-clinic'];
  private ctl: ClinicController | undefined;
  private warned = new Set<string>();
  private tools = new Map<ToolId, ToolView>();
  private patient: PatientView | undefined;
  private target: DropTarget | undefined;
  private selection: SelectionRing | undefined;
  /** The last line this game made the Speaker prompt (cleared on shutdown, and only it). */
  private prompt: string | undefined;
  private rand: () => number = Math.random;

  constructor() {
    super('pet-clinic');
  }

  protected override reactionSet(): ReactionSet {
    return REACTIONS;
  }

  protected build(): void {
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS['pet-clinic'];
    this.tools = new Map();
    this.patient = undefined;
    this.selection = undefined;
    this.rand = mulberry32(this.seed >>> 0);
    const ui = Tokens.ui;
    const resume = resumeClinic(this.resumeAt, ui.petClinicPatientsPerRound, ui.petClinicMaxProblems);
    if (this.resumeAt && !resume) console.warn('pet-clinic: bad resume — a fresh round');
    if (resume) this.acceptResume();
    PetClinic.bag ??= createPatientBag(PATIENT_IDS, mulberry32(questionSeed(this.seed, 1)));

    const rs = this.layout.renderScale;
    const bg = BACKGROUNDS['pet-clinic'];
    if (this.textures.exists(bg.key)) this.add.image(0, 0, bg.key).setOrigin(0).setScale(1 / rs);
    else this.warnOnce(bg.key, `pet-clinic: texture "${bg.key}" is missing — plate skipped`);

    const router = createTapRouter(this);
    const hull = this.layout.hits[PATIENT_HIT];
    if (!hull) this.warnOnce('hit', `pet-clinic: hit "${PATIENT_HIT}" is missing from the layout`);
    this.target = hull ? createDropTarget({ id: PATIENT_HIT, polygon: hull }) : undefined;

    const info = Object.fromEntries(PATIENTS.map((p) => [p.id, { callSfx: p.callSfx, nameLine: p.nameLine }])) as Record<PatientId, { callSfx: string; nameLine: string }>;
    const ctl = createClinicController({
      patients: info,
      perRound: ui.petClinicPatientsPerRound,
      maxProblems: ui.petClinicMaxProblems,
      bag: PetClinic.bag,
      rng: this.rand,
      resume,
      inviteLine: INVITE_LINE,
      needLines: NEED_LINES,
      thanksLine: THANKS_LINE,
      fixSounds: FIX_SOUNDS,
      cueSounds: CUE_SOUNDS,
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
        arrive: (id, problems, ms) => this.arrive(id, problems, ms),
        arrived: () => this.skippable(0),
        fix: (problem, tool, ms) => this.fix(problem, tool, ms),
        flourish: (id) => this.flourish(id),
        choseOther: (id, tool) => this.choseOther(id, tool),
        returnTool: (tool) => this.floatHome(tool),
        tapReact: () => this.tapReact(),
        thanks: () => this.thanks(),
        depart: (ms) => this.depart(ms),
        cue: (problem) => this.cue(problem),
      },
      pick: (kind) => this.pickReaction(kind),
      // From the last patient's last fix on, Home completes the round (never abandons a finished round).
      onLastPatient: () => this.markFinishing(),
      onRoundEnd: () => this.scheduleFinish(Tokens.Timing.petClinicFinishMs),
    });
    this.ctl = ctl;

    router.onAnyTap = () => ctl.anyTap();
    this.attachSkip(router);
    this.attachReactions(router);
    for (const id of TOOL_IDS) this.addTool(id, router);
    if (hull) {
      // While a tool is tap-selected the patient lets the tap through: the tool's catcher flies it there.
      createTapTarget(router, {
        area: { contains: (p) => ![...this.tools.values()].some((t) => t.drag?.isSelected()) && pointInPolygon(p, hull) },
        onPress: () => this.ctl?.tapPatient(),
      });
    }

    // The parent invitation (at most once; never on a resumed start) waits until the voice is quiet.
    let invitePending = true;
    bus.scoped(this).on('speech:ended', () => {
      if (!invitePending || audio.voiceBusy || this.inert) return;
      invitePending = false;
      this.inviteParent();
    });
    this.events.once('shutdown', () => {
      this.ctl?.stop();
      if (this.prompt !== undefined) audio.clearPrompt(this.prompt);
    });
    ctl.start();
  }

  protected progress(): ClinicProgress {
    return this.ctl?.progress() ?? { questionIndex: 0, partial: { patient: PATIENT_IDS[0], left: [], seen: [] } };
  }

  /** Home mid-round: the controller stops, then the base abandons (the snapshot keeps the patient). */
  protected override abandon(): void {
    this.ctl?.stop();
    super.abandon();
  }

  protected override leave(): void {
    this.ctl?.stop();
    super.leave();
  }

  override update(_time: number, delta: number): void {
    if (this.inert) return;
    // A skipped walk fast-forwards the scene clocks; the controller follows them.
    this.ctl?.tick(delta * (this.time.timeScale || 1));
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
    if (!a) this.warnOnce(`anchor.${id}`, `pet-clinic: anchor "${id}" is missing from the layout`);
    return a;
  }

  private hasFrame(frame: string): boolean {
    const key = ATLASES['pet-clinic'].key;
    return this.textures.exists(key) && this.textures.get(key).has(frame);
  }

  /** The trimmed rect of a frame in design px. */
  private frameRect(frame: string): TrimmedRect | undefined {
    if (!this.hasFrame(frame)) {
      this.warnOnce(frame, `pet-clinic: frame "${frame}" is missing`);
      return undefined;
    }
    const ss = (this.textures.get(ATLASES['pet-clinic'].key).get(frame).customData as FrameData | undefined)?.spriteSourceSize;
    const rs = this.layout.renderScale;
    return ss ? { x: ss.x / rs, y: ss.y / rs, width: ss.w / rs, height: ss.h / rs } : undefined;
  }

  /** A full-frame image of `frame` whose design point `pivot` is its origin, drawn at `at`. */
  private pivoted(frame: string, pivot: Point, at: Point): GameObjects.Image | undefined {
    if (!this.frameRect(frame)) return undefined;
    const o = originFor(pivot, this.layout.design);
    return this.add.image(at.x, at.y, ATLASES['pet-clinic'].key, frame).setScale(1 / this.layout.renderScale).setOrigin(o.x, o.y);
  }

  /** A particle frame centred on `at` at `scale` of its rendered size. */
  private particle(frame: string, at: Point, scale: number): GameObjects.Image | undefined {
    const rect = this.frameRect(frame);
    if (!rect) return undefined;
    const img = this.pivoted(frame, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, at);
    return img?.setScale(scale / this.layout.renderScale).setDepth(Depth.particle);
  }

  /** A spot on the patient at the exam spot. */
  private spot(id: PatientId, spot: 'back' | 'mouth' | 'scrape' | 'belly' | 'head'): Point | undefined {
    return this.anchor(spotAnchor(spot, id));
  }

  private fade(img: GameObjects.Image | undefined, alpha: number, ms: number): void {
    if (!img) return;
    this.tweens.killTweensOf(img);
    if (ms <= 0) img.setAlpha(alpha);
    else this.tweens.add({ targets: img, alpha, duration: ms, ease: SINE });
  }

  // --- the tools -------------------------------------------------------------------------------------------

  private addTool(id: ToolId, router: ReturnType<typeof createTapRouter>): void {
    const frame = toolFrame(id);
    const rect = this.frameRect(frame);
    if (!rect) return;
    const home = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const image = this.pivoted(frame, home, home)?.setDepth(Depth.tool);
    const view: ToolView = { id, image, home, radius: toolHitRadius(Math.max(rect.width, rect.height) / 2, Tokens.ui.petClinicToolHitMinPx), pos: { ...home }, drag: undefined, busy: false, move: undefined, moveDone: undefined };
    view.drag = createDraggable(router, {
      circle: { x: home.x, y: home.y, r: view.radius },
      onLift: () => this.lift(view),
      onMove: (p) => this.place(view, p),
      onDrop: (p) => this.drop(view, p),
      onCancel: () => this.settle(view),
      onSelect: () => {
        this.selection?.destroy();
        this.selection = createSelectionRing(this, view.image, Depth.lifted);
      },
      onDeselect: () => {
        this.selection?.destroy();
        this.selection = undefined;
      },
      fly: (to, done) => this.moveTool(view, to, Tokens.Timing.tapFlyMs, done),
    });
    view.drag.object = image;
    this.tools.set(id, view);
  }

  private place(view: ToolView, p: Point): void {
    view.pos = { ...p };
    view.image?.setPosition(p.x, p.y);
    view.drag?.setCircle({ x: p.x, y: p.y, r: view.radius });
  }

  private lift(view: ToolView): void {
    // A float back still running must not pull the tool out of the finger.
    this.stopMove(view);
    if (view.image) {
      this.tweens.killTweensOf(view.image);
      view.image.setDepth(Depth.lifted).setScale(Tokens.components.draggableItem.liftScale / this.layout.renderScale);
    }
  }

  private settle(view: ToolView): void {
    view.image?.setDepth(Depth.tool).setScale(1 / this.layout.renderScale);
  }

  /** Released on the patient: the controller decides; anywhere else the tool stays where it was released. */
  private drop(view: ToolView, p: Point): void {
    this.settle(view);
    this.place(view, p);
    if (!this.target?.contains(p)) return;
    this.ctl?.useTool(view.id);
  }

  /** Stops the tool's running move; its onDone is dropped (a lift) or run (`handOver`: a new move replaces it). */
  private stopMove(view: ToolView, handOver = false): void {
    const done = view.moveDone;
    view.move?.stop();
    view.move = undefined;
    view.moveDone = undefined;
    if (handOver) done?.();
  }

  private moveTool(view: ToolView, to: Point, ms: number, done?: () => void): void {
    // A tap-then-tap fly replaced by another move still resolves its drop.
    this.stopMove(view, true);
    const from = { ...view.pos };
    view.moveDone = done;
    view.move = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: ms,
      ease: EASE_OUT,
      onUpdate: (tw) => {
        const v = tw.getValue() ?? 0;
        this.place(view, { x: from.x + (to.x - from.x) * v, y: from.y + (to.y - from.y) * v });
      },
      onComplete: () => {
        view.move = undefined;
        view.moveDone = undefined;
        this.place(view, to);
        done?.();
      },
    });
  }

  /** The tool floats back to its tray place (the ice-cream precedent). */
  private floatHome(id: ToolId): void {
    const v = this.tools.get(id);
    if (v) this.moveTool(v, v.home, Tokens.components.draggableItem.return.durationMs);
  }

  private setToolBusy(v: ToolView, on: boolean): void {
    v.busy = on;
    if (v.drag) inputGuard.setPickable(v.drag, !on);
  }

  // --- the patient -----------------------------------------------------------------------------------------

  private clearPatient(): void {
    const p = this.patient;
    if (!p) return;
    this.tweens.killTweensOf(p.box);
    p.box.destroy();
    if (p.wave) {
      this.tweens.killTweensOf(p.wave);
      p.wave.destroy();
    }
    this.patient = undefined;
  }

  /** The patient walks in from the door to the exam spot (a tap skips it); its problems show. */
  private arrive(id: PatientId, problems: readonly ProblemId[], ms: number): void {
    this.clearPatient();
    const spot = this.anchor(PATIENT_ANCHOR);
    if (!spot) return;
    const door = this.layout.anchors[DOOR_ANCHOR] ?? { x: 0, y: spot.y };
    const baseRect = this.frameRect(patientFrame(id, 'base'));
    const offX = door.x - spot.x - (baseRect ? baseRect.width / 2 : 0);
    const box = this.add.container(spot.x + offX, spot.y).setDepth(Depth.patient);
    const layer = (name: 'base' | 'tilt' | OverlayId): GameObjects.Image | undefined => {
      const img = this.pivoted(patientFrame(id, name), spot, { x: 0, y: 0 });
      if (img) box.add(img);
      return img;
    };
    const base = layer('base');
    const tilt = TILT_FRAME_PATIENTS.includes(id) ? layer('tilt')?.setAlpha(0) : undefined;
    const overlays = new Map<OverlayId, GameObjects.Image>();
    for (const o of OVERLAYS) {
      const img = layer(o);
      if (!img) continue;
      const shown = problems.some((p) => PROBLEM_OVERLAY[p] === o);
      overlays.set(o, img.setAlpha(shown ? 1 : 0));
    }
    const view: PatientView = { id, box, base, tilt, overlays, wave: undefined, offX };
    this.patient = view;
    this.tweens.add({ targets: box, x: spot.x, duration: ms, ease: SINE });
    this.skippable(ms);
    if (problems.includes('tummy')) {
      const belly = this.spot(id, 'belly');
      if (belly) view.wave = this.particle(PARTICLES.wave, { x: belly.x + offX, y: belly.y }, Tokens.ui.petClinicWaveScale)?.setAlpha(0);
      // The tummy lines walk in with the patient and fade in (one tween: a fade would kill a separate walk tween).
      if (view.wave) this.tweens.add({ targets: view.wave, x: belly!.x, alpha: 1, duration: ms, ease: SINE });
    }
  }

  /** A fix: the tool flies to its spot, the problem's own reaction plays, the tool goes back to the tray. */
  private fix(problem: ProblemId, toolId: ToolId, ms: number): void {
    const p = this.patient;
    const tool = this.tools.get(toolId);
    if (!p || !tool) return;
    const T = Tokens.Timing;
    const at = this.spot(p.id, TOOL_SPOT[toolId]) ?? tool.pos;
    const act = ms - T.petClinicToolFlyMs - T.petClinicToolReturnMs;
    const fadeMs = T.petClinicFadeMs;
    this.setToolBusy(tool, true);
    this.moveTool(tool, at, T.petClinicToolFlyMs);
    const later = (delay: number, fn: () => void): void => {
      this.time.delayedCall(delay, fn);
    };
    const fly = T.petClinicToolFlyMs;
    const ov = (o: OverlayId): GameObjects.Image | undefined => p.overlays.get(o);
    // The tool hands over to its overlay (the bottle at the mouth, the plaster, the blanket); the shower stays and sprays.
    const handOver = toolId !== 'shower';
    if (handOver) later(fly, () => this.fade(tool.image, 0, fadeMs));
    if (problem === 'mud') {
      later(fly, () => {
        this.drops(at, act);
        if (tool.image && !this.reduced) {
          const shakes = Tokens.ui.petClinicShowerShakes;
          this.tweens.add({ targets: tool.image, angle: Tokens.ui.petClinicShowerShakeDeg, duration: act / shakes / 2, ease: SINE, yoyo: true, repeat: shakes - 1, onComplete: () => tool.image?.setAngle(0) });
        }
        this.fade(ov('mud'), 0, act);
      });
    } else if (problem === 'tummy') {
      later(fly, () => {
        this.fade(ov('bottle'), 1, fadeMs);
        this.fade(p.wave, 0, act);
      });
      later(fly + act - fadeMs, () => this.fade(ov('bottle'), 0, fadeMs));
    } else if (problem === 'scrape') {
      later(fly, () => {
        this.fade(ov('scrape'), 0, fadeMs);
        this.fade(ov('plaster'), 1, fadeMs);
      });
    } else {
      later(fly, () => this.fade(ov('blanket'), 1, fadeMs));
      later(fly + fadeMs, () => this.floatUp(PARTICLES.z, this.spot(p.id, 'head'), Tokens.ui.petClinicZScale));
      later(fly + act - fadeMs, () => this.fade(ov('blanket'), 0, fadeMs));
    }
    // Back to the tray: a hand-over tool pops back in its place; the shower flies back.
    later(fly + act, () => {
      if (handOver) {
        this.place(tool, tool.home);
        this.fade(tool.image, 1, T.petClinicToolReturnMs);
      } else this.moveTool(tool, tool.home, T.petClinicToolReturnMs);
    });
    later(ms, () => this.setToolBusy(tool, false));
  }

  /** Water drops fall from the shower over `spanMs` (they only fade when reduced). */
  private drops(at: Point, spanMs: number): void {
    const u = Tokens.ui;
    for (let i = 0; i < u.petClinicDrops; i++) {
      const p = { x: at.x + (this.rand() * 2 - 1) * u.petClinicDropSpreadPx, y: at.y };
      const d = this.particle(PARTICLES.drop, p, u.petClinicDropScale)?.setAlpha(0);
      if (!d) return;
      const fall = this.reduced ? 0 : u.petClinicDropFallPx;
      this.tweens.chain({
        targets: d,
        tweens: [
          { alpha: 1, duration: Tokens.Timing.petClinicDropInMs, delay: (i * spanMs) / (2 * u.petClinicDrops), ease: SINE },
          { alpha: 0, y: p.y + fall, duration: Tokens.Timing.petClinicDropMs, ease: 'Quad.easeIn', onComplete: () => d.destroy() },
        ],
      });
    }
  }

  /** A "z" or a heart floats up from `at` and fades (it only fades when reduced). */
  private floatUp(frame: string, at: Point | undefined, scale: number): void {
    if (!at) return;
    const img = this.particle(frame, at, scale)?.setAlpha(0);
    if (!img) return;
    const rise = this.reduced ? 0 : Tokens.ui.petClinicFloatRisePx;
    const half = Tokens.Timing.petClinicFloatMs / 2;
    this.tweens.chain({
      targets: img,
      tweens: [
        { alpha: 1, y: at.y - rise / 2, duration: half, ease: SINE },
        { alpha: 0, y: at.y - rise, duration: half, ease: SINE, onComplete: () => img.destroy() },
      ],
    });
  }

  private hop(): void {
    const p = this.patient;
    const spot = this.anchor(PATIENT_ANCHOR);
    if (!p || !spot) return;
    this.tweens.killTweensOf(p.box);
    p.box.setY(spot.y).setAngle(0);
    this.tweens.add({ targets: p.box, y: spot.y - this.amp(Tokens.ui.petClinicHopPx), duration: Tokens.Timing.petClinicFlourishMs / 2, ease: EASE_OUT, yoyo: true });
  }

  /** The correct flourish: a hop, a wiggle on its feet, or sparkles around its back. */
  private flourish(id: string | undefined): void {
    const p = this.patient;
    if (!p) return;
    const kind = id as CorrectReaction | undefined;
    const ms = Tokens.Timing.petClinicFlourishMs;
    switch (kind) {
      case 'wiggle': {
        const deg = this.amp(Tokens.ui.petClinicWiggleDeg);
        this.tweens.killTweensOf(p.box);
        this.tweens.chain({ targets: p.box, tweens: WIGGLE_STEPS.map((k) => ({ angle: k * deg, duration: ms / WIGGLE_STEPS.length, ease: SINE })) });
        return;
      }
      case 'sparkle': {
        const back = this.spot(p.id, 'back');
        if (!back) return;
        const u = Tokens.ui;
        for (let i = 0; i < u.petClinicSparkles; i++) {
          const a = (2 * Math.PI * i) / u.petClinicSparkles;
          const s = this.particle(PARTICLES.sparkle, { x: back.x + Math.cos(a) * u.petClinicSparkleSpreadPx, y: back.y + Math.sin(a) * u.petClinicSparkleSpreadPx * u.petClinicSparkleSquash }, u.petClinicSparkleScale)?.setAlpha(0);
          if (!s) return;
          this.tweens.add({ targets: s, alpha: 1, duration: Tokens.Timing.petClinicSparkleMs / 2, delay: (i * ms) / (2 * u.petClinicSparkles), ease: SINE, yoyo: true, onComplete: () => s.destroy() });
        }
        return;
      }
      case 'hop':
      case undefined:
        this.hop();
        return;
      default: {
        const unknown: never = kind;
        console.warn(`pet-clinic: no routine for reaction "${String(unknown)}"`);
      }
    }
  }

  /** FR30: the head tilt (a frame for the rigged patients, the whole body on its feet for the cat and rooster) or its double take; the tool floats back. */
  private choseOther(id: string | undefined, tool: ToolId): void {
    this.floatHome(tool);
    const p = this.patient;
    if (!p) return;
    const kind = (id ?? 'tilt') as ChoseOtherReaction;
    const ms = Tokens.Timing.petClinicTiltMs;
    const deg = this.amp(Tokens.ui.petClinicTiltDeg);
    const fadeMs = Tokens.Timing.petClinicFadeMs / 2;
    this.tweens.killTweensOf(p.box);
    p.box.setAngle(0);
    const showTilt = (on: boolean): void => {
      this.fade(p.tilt, on ? 1 : 0, fadeMs);
      this.fade(p.base, on ? 0 : 1, fadeMs);
    };
    switch (kind) {
      case 'tilt':
        if (p.tilt) {
          showTilt(true);
          this.time.delayedCall(ms - fadeMs, () => showTilt(false));
        } else this.tweens.chain({ targets: p.box, tweens: TILT_STEPS.map((k) => ({ angle: k * deg, duration: ms / TILT_STEPS.length, ease: SINE })) });
        return;
      case 'double-take': {
        if (p.tilt) {
          showTilt(true);
          const step = ms / DOUBLE_TAKE_STEPS.length;
          this.time.delayedCall(step, () => showTilt(false));
          this.time.delayedCall(2 * step - fadeMs, () => showTilt(true));
          this.time.delayedCall(ms - fadeMs, () => showTilt(false));
        }
        // A rigged patient turns its head (the frames); its body only sways a little with it.
        const share = p.tilt ? Tokens.ui.petClinicDoubleTakeBodyShare : 1;
        this.tweens.chain({ targets: p.box, tweens: DOUBLE_TAKE_STEPS.map((k) => ({ angle: share * k * deg, duration: ms / DOUBLE_TAKE_STEPS.length, ease: SINE })) });
        return;
      }
      default: {
        const unknown: never = kind;
        console.warn(`pet-clinic: no routine for reaction "${String(unknown)}"`);
      }
    }
  }

  private tapReact(): void {
    const p = this.patient;
    if (!p) return;
    const k = 1 + this.amp(Tokens.ui.petClinicTapSquash - 1);
    this.tweens.killTweensOf(p.box);
    p.box.setScale(1, 1).setAngle(0);
    this.tweens.add({ targets: p.box, scaleX: k, scaleY: 1 / k, duration: Tokens.Timing.petClinicTapMs / 2, ease: SINE, yoyo: true, onComplete: () => p.box.setScale(1, 1) });
  }

  private thanks(): void {
    const p = this.patient;
    if (!p) return;
    audio.sfx(SFX.happy);
    this.hop();
    this.floatUp(PARTICLES.heart, this.spot(p.id, 'head'), Tokens.ui.petClinicHeartScale);
  }

  /** The well patient turns round and walks out through the door (a tap skips it). */
  private depart(ms: number): void {
    const p = this.patient;
    const spot = this.anchor(PATIENT_ANCHOR);
    if (!p || !spot) return;
    this.tweens.killTweensOf(p.box);
    p.box.setY(spot.y).setAngle(0).setScale(-1, 1);
    this.tweens.add({ targets: p.box, x: spot.x + p.offX, duration: ms, ease: SINE, onComplete: () => this.clearPatient() });
    this.skippable(ms);
  }

  /** A waiting problem's cue: the tummy's wavy lines bob, or the sleepy patient sways and a "z" floats up. */
  private cue(problem: ProblemId): void {
    const p = this.patient;
    if (!p) return;
    const ms = Tokens.Timing.petClinicWaveMs;
    if (problem === 'tummy' && p.wave) {
      const y = p.wave.y;
      this.tweens.add({ targets: p.wave, y: y - this.amp(Tokens.ui.petClinicWaveBobPx), duration: ms / 2 / 2, ease: SINE, yoyo: true, repeat: 1, onComplete: () => p.wave?.setY(y) });
    } else if (problem === 'yawn') {
      if (!this.reduced) {
        const deg = Tokens.ui.petClinicSwayDeg;
        this.tweens.chain({ targets: p.box, tweens: [{ angle: deg, duration: ms / 2, ease: SINE }, { angle: 0, duration: ms / 2, ease: SINE }] });
      }
      this.floatUp(PARTICLES.z, this.spot(p.id, 'head'), Tokens.ui.petClinicZScale);
    }
  }
}
