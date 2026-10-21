// Đường đua (Stories 4.1, 4.2): the child puts a finger on the kart and traces the road; the kart (with its
// little driver) follows on the road to the checkered gate. Nothing is ever "wrong": a finger far off the
// road or a lift only makes the kart wait (it blinks gently); a touch next to it continues. The scene only
// wires Phaser: the plate `bg.race`, the road drawn from `LAYOUTS.race.paths[<id>]`, the full-frame kart
// and gate sprites of `atlas.race` on their layout anchors, a TracePath (core/input) and tweens. Every
// decision (roads, hint activity, the hand-over, the round end) is the pure round model (round.ts,
// questions.ts); prompts and retries go through `hint` only. Timers are scene-clock events and tweens.
// Story 4.2: a resumed road restores the kart where it was (waiting, the driven stretch lit); cones and
// flags sway as ambient motion (held at hint level ≥ 2 and during every celebration); the kart draws above
// the gate on the first half of the road and below it after (a loop's start lip is next to its gate).
import type { GameObjects, Time, Tweens } from 'phaser';
import { ATLASES, BACKGROUNDS } from '../../content/assets';
import { CONE_ANCHORS, FLAG_ANCHORS, GATE_ANCHOR, KART_ANCHOR, RACE_KART, SFX, coneFrame, flagFrame, gateFrames, kartFrames } from '../../content/games/race';
import type { Point, ScreenLayout } from '../../content/layout-types';
import { LAYOUTS } from '../../content/layouts';
import { audio } from '../../core/audio-director';
import { bus } from '../../core/bus';
import type { HintStep } from '../../core/hint-director';
import { createDropTarget, type DropTarget } from '../../core/input/drop';
import { createTapRouter, type TapRouter } from '../../core/input/tap-router';
import { createTracePath, type TracePath } from '../../core/input/trace-path';
import { TraceModel, type TraceEvent } from '../../core/input/trace-model';
import { amplitude, prefersReducedMotion } from '../../core/reduced-motion';
import { Tokens } from '../../core/tokens';
import { originFor } from '../../core/ui/sprite-pivot';
import { MiniGameBase } from '../mini-game-base';
import { RaceRound, startCommands, type RaceCommand, type RaceProgress } from './round';

const SINE = 'Sine.easeInOut';
/** The hint level from which the guide glow runs and the wait blink stops. */
const GLOW_LEVEL = 2;

/** Draw order: the swaying cones and flags, the road, the driven overlay and the guide glow, the shadows, the kart, the gate (the kart moves above it on the first half of a road). */
const LAYERS = ['ambient', 'road', 'driven', 'glow', 'shadow', 'kart', 'gate', 'kartFront'] as const;
/** Ambient hold reason: every celebration. */
const HOLD_CELEBRATE = 'celebrate';
const Depth = Object.fromEntries(LAYERS.map((name, i) => [name, i + 1])) as Readonly<Record<(typeof LAYERS)[number], number>>;

/** A polyline as segments (Graphics.strokePoints wants Vector2s). */
function stroke(g: GameObjects.Graphics, pts: readonly Point[], width: number, color: number, alpha: number): void {
  g.lineStyle(width, color, alpha);
  for (let i = 1; i < pts.length; i++) g.lineBetween(pts[i - 1]!.x, pts[i - 1]!.y, pts[i]!.x, pts[i]!.y);
}

/** A thick polyline: a stroke of `width` with round joins and ends (a circle at every vertex). */
function band(g: GameObjects.Graphics, pts: readonly Point[], width: number, color: number, alpha: number): void {
  if (pts.length < 2) return;
  stroke(g, pts, width, color, alpha);
  g.fillStyle(color, alpha);
  for (const p of pts) g.fillCircle(p.x, p.y, width / 2);
}

/** Dashes of `len` every `len + gap` px of arc along the trace's samples, from arc `from` to `to`. */
function dashes(g: GameObjects.Graphics, trace: TracePath, from: number, to: number, width: number, color: number, alpha: number): void {
  const ui = Tokens.ui;
  const period = ui.roadDashLen + ui.roadDashGap;
  for (let s = Math.floor(from / period) * period; s < to; s += period) {
    const a = Math.max(s, from);
    const b = Math.min(s + ui.roadDashLen, to);
    if (b <= a) continue;
    stroke(g, trace.model.stretch(a, b), width, color, alpha);
  }
}

export class Race extends MiniGameBase<'race'> {
  private round: RaceRound | undefined;
  private router: TapRouter | undefined;
  private layout: ScreenLayout = LAYOUTS.race;
  private kart: GameObjects.Image | undefined;
  private gate: GameObjects.Image | undefined;
  private kartShadow: GameObjects.Ellipse | undefined;
  private gateShadow: GameObjects.Ellipse | undefined;
  private road: GameObjects.Graphics | undefined;
  private driven: GameObjects.Graphics | undefined;
  private glow: GameObjects.Graphics | undefined;
  private trace: TracePath | undefined;
  private gateTarget: DropTarget | undefined;
  private step: HintStep | undefined;
  private facing = 1;
  private hintLevel = 0;
  private blink: Tweens.Tween | undefined;
  private glowTween: Tweens.Tween | undefined;
  private pulse: Tweens.Tween | undefined;
  private wave: Time.TimerEvent | undefined;
  private warned = new Set<string>();
  /** Story 5.4: removes the tap reactions of this start's cones and flags. */
  private unreact: Array<() => void> = [];

  constructor() {
    super('race');
  }

  // --- build ----------------------------------------------------------------------------------------

  protected build(): void {
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS.race;
    this.trace = undefined;
    this.step = undefined;
    this.hintLevel = 0;
    this.facing = 1;
    this.blink = undefined;
    for (const off of this.unreact) off();
    this.unreact = [];
    this.glowTween = undefined;
    this.pulse = undefined;
    this.wave = undefined;
    const bg = BACKGROUNDS.race.key;
    if (this.textures.exists(bg)) this.add.image(0, 0, bg).setOrigin(0).setScale(1 / this.layout.renderScale);
    else console.warn(`race: texture "${bg}" is missing — plate skipped`);

    this.router = createTapRouter(this);
    this.attachReactions(this.router);
    this.road = this.add.graphics().setDepth(Depth.road);
    this.driven = this.add.graphics().setDepth(Depth.driven);
    this.glow = this.add.graphics().setDepth(Depth.glow);
    const lift = Tokens.components.draggableItem.liftShadow;
    const k = Tokens.components.kart.size;
    const h = Tokens.ui.raceShadowHeightPx;
    this.kartShadow = this.add.ellipse(0, 0, k, h, lift.color.value, lift.color.alpha).setDepth(Depth.shadow);
    this.gateShadow = this.add.ellipse(0, 0, Tokens.ui.raceGateMinPx, h, lift.color.value, lift.color.alpha).setDepth(Depth.shadow);
    this.kart = this.sprite(kartFrames.idle, KART_ANCHOR, Depth.kart);
    this.gate = this.sprite(gateFrames.idle, GATE_ANCHOR, Depth.gate);
    this.addSwaying(coneFrame, CONE_ANCHORS, Tokens.ui.raceConeSwayDeg, Tokens.Timing.raceConeSwayMs);
    this.addSwaying(flagFrame, FLAG_ANCHORS, Tokens.ui.raceFlagSwayDeg, Tokens.Timing.raceFlagSwayMs);

    bus.scoped(this).on('hint:level', ({ gameId, level }) => {
      if (gameId !== this.gameId) return;
      this.hintLevel = level;
      if (level >= GLOW_LEVEL) {
        this.stopBlink();
        this.startGlow();
      } else this.stopGlow();
    });

    const step = Tokens.ui.traceSampleStepPx;
    const round = new RaceRound(
      {
        activityPx: Tokens.ui.traceHintProgressPx,
        shortCelebrateMs: Tokens.Timing.raceShortCelebrateMs,
        finishDelayMs: Tokens.Timing.roundCelebrationMs,
        step,
        maxTraceIndex: (pathId) => {
          const pts = this.layout.paths[pathId];
          return pts ? Math.floor((new TraceModel(pts).length - Tokens.ui.traceArriveSlackPx) / step) - 1 : -1;
        },
      },
      this.seed,
      this.level,
    );
    this.round = round;
    const plan = startCommands(round, this.resumeAt);
    for (const w of plan.warnings) console.warn(w);
    if (plan.accepted) this.acceptResume();
    this.applyAll(plan.commands);
  }

  protected progress(): RaceProgress {
    return this.round?.progress(this.trace?.index ?? 0) ?? { questionIndex: 0, partial: { traceIndex: 0 } };
  }

  override update(_time: number, delta: number): void {
    if (this.inert) return;
    this.trace?.tick(delta);
  }

  private warnOnce(what: string, msg: string): void {
    if (this.warned.has(what)) return;
    this.warned.add(what);
    console.warn(msg);
  }

  /**
   * Story 4.2: one image of `frame` (rendered at the pose of the first anchor, whose point is its origin)
   * at every anchor, swaying ± deg (yoyo, period ms, staggered by index; reduced amplitude) as ambient.
   */
  private addSwaying(frame: string, anchors: readonly string[], deg: number, ms: number): void {
    const first = anchors[0];
    const amp = amplitude(deg, this.reduced);
    anchors.forEach((id, i) => {
      const at = this.layout.anchors[id];
      const img = first === undefined ? undefined : this.sprite(frame, first, Depth.ambient);
      if (!img || !at) {
        img?.destroy();
        if (!at) this.warnOnce(`anchor.${id}`, `race: anchor "${id}" is missing from the layout`);
        return;
      }
      img.setPosition(at.x, at.y).setAngle(i % 2 === 0 ? -amp : amp);
      // Story 5.4: a tapped cone or flag bounces with "pụp" (its sway pauses meanwhile).
      this.unreact.push(this.react({ image: img }));
      this.addAmbient(this.tweens.add({ targets: img, angle: i % 2 === 0 ? amp : -amp, duration: ms / 2, delay: (ms / 2 / anchors.length) * i, ease: SINE, yoyo: true, repeat: -1 }));
    });
  }

  /** A full-frame sprite whose origin is its layout anchor (it moves and scales around it). */
  private sprite(frame: string, anchor: string, depth: number): GameObjects.Image | undefined {
    const key = ATLASES.race.key;
    const at = this.layout.anchors[anchor];
    if (!at) {
      this.warnOnce(`anchor.${anchor}`, `race: anchor "${anchor}" is missing from the layout`);
      return undefined;
    }
    if (!this.textures.exists(key) || !this.textures.get(key).has(frame)) {
      this.warnOnce(frame, `race: frame "${frame}" is missing`);
      return undefined;
    }
    const o = originFor(at, this.layout.design);
    return this.add.image(at.x, at.y, key, frame).setOrigin(o.x, o.y).setScale(1 / this.layout.renderScale).setDepth(depth);
  }

  private scaleOf(k = 1): number {
    return k / this.layout.renderScale;
  }

  // --- one road ---------------------------------------------------------------------------------------

  private beginRoad(pathId: string, index: number, restoreIndex = 0): void {
    this.holdAmbient(HOLD_CELEBRATE, false);
    this.trace?.destroy();
    this.trace = undefined;
    this.stopBlink();
    this.stopGlow();
    this.wave?.remove();
    this.wave = undefined;
    const pts = this.layout.paths[pathId];
    if (!pts || pts.length < 2 || !this.router) {
      this.warnOnce(`path.${pathId}`, `race: path "${pathId}" is missing from the layout`);
      return;
    }
    const trace = createTracePath(this.router, { points: pts, onEvent: (e) => this.onTrace(e) });
    trace.object = this.kart;
    this.trace = trace;
    this.drawRoad(trace);
    const end = trace.model.pointAt(trace.model.length);
    this.gateTarget = createDropTarget({ id: 'gate', circle: { x: end.x, y: end.y, r: Tokens.components.dropTarget.snapRadius } });
    this.step = {
      action: 'trace',
      correct: [trace],
      distractors: [],
      target: this.gateTarget,
      path: () => trace.model.stretch(trace.s, trace.s + Tokens.ui.raceHintStretchPx),
    };
    this.gate?.setPosition(end.x, end.y).setAlpha(1);
    this.gateShadow?.setPosition(end.x, end.y).setAlpha(1);
    this.facing = 1;
    // (false, false): keep the anchor origin — a plain setFrame resets it to 0.5 and the full-frame kart leaves the screen.
    this.kart?.setFrame(kartFrames.idle, false, false).setAlpha(1).setScale(this.scaleOf());
    // Story 4.2: a resume restores the kart where it was: waiting, facing the road there, the driven stretch lit.
    if (restoreIndex > 0) trace.restore(restoreIndex);
    this.placeKart();
    this.drawDriven();
    if (restoreIndex > 0) this.startBlink();
    // Every road after the first fades in.
    if (index > 0) {
      const objs = [this.road, this.driven, this.kart, this.gate, this.kartShadow, this.gateShadow].filter((o) => o !== undefined);
      for (const o of objs) o.setAlpha(0);
      this.tweens.add({ targets: objs, alpha: 1, duration: Tokens.Timing.sceneFadeMs });
    }
  }

  /** The static layers once per road: the light edge band, the grey surface and the yellow centre dash. */
  private drawRoad(trace: TracePath): void {
    const tp = Tokens.components.tracePath;
    const g = this.road;
    if (!g) return;
    g.clear();
    const pts = trace.model.samples;
    band(g, pts, tp.width, tp.edge.color.value, tp.edge.color.alpha);
    band(g, pts, tp.width - 2 * tp.edge.width, tp.surface.value, tp.surface.alpha);
    dashes(g, trace, 0, trace.model.length, Tokens.ui.roadDashWidth, tp.guide.value, tp.guide.alpha);
    this.drawDriven();
  }

  /** The driven part (samples ≤ s) overlaid in hintCore, redrawn when s changes. */
  private drawDriven(): void {
    const g = this.driven;
    const trace = this.trace;
    if (!g || !trace) return;
    g.clear();
    if (trace.s <= 0) return;
    const tp = Tokens.components.tracePath;
    const core = Tokens.colors.hintCore;
    band(g, trace.model.stretch(0, trace.s), tp.width - 2 * tp.edge.width, core.value, Tokens.ui.raceDrivenAlpha);
  }

  /** The kart's pivot on the trace point, facing its travel direction (the last facing when vertical). */
  private placeKart(): void {
    const trace = this.trace;
    if (!trace) return;
    const p = trace.point;
    const dx = trace.model.tangentAt(trace.s).x;
    if (Math.abs(dx) > Tokens.ui.raceFacingMinDx) this.facing = RACE_KART.artFacing * Math.sign(dx);
    if (this.kart) {
      // The kart draws above the gate on the first half of the road and below it after.
      this.kart.setPosition(p.x, p.y).setDepth(trace.s < trace.model.length / 2 ? Depth.kartFront : Depth.kart);
      if (!this.pulse) this.kart.setScale(this.facing * this.scaleOf(), this.scaleOf());
    }
    this.kartShadow?.setPosition(p.x, p.y);
  }

  private onTrace(e: TraceEvent): void {
    if (this.inert) return;
    switch (e.kind) {
      case 'grab':
        this.stopBlink();
        this.grabPulse();
        audio.sfx(SFX.engine);
        return;
      case 'progress':
        this.placeKart();
        this.drawDriven();
        this.applyAll(this.round?.progressed(e.s) ?? []);
        return;
      case 'wait':
        this.startBlink();
        return;
      case 'arrive':
        this.stopBlink();
        this.applyAll(this.round?.arrived() ?? []);
        return;
    }
  }

  /** The grab feedback: 1 → react.scale → 1 over react.durationMs (reduced amplitude). */
  private grabPulse(): void {
    const kart = this.kart;
    if (!kart) return;
    const react = Tokens.components.tappableProp.react;
    const peak = amplitude(react.scale, this.reduced);
    this.pulse?.stop();
    this.pulse = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: react.durationMs,
      onUpdate: (t) => {
        const k = 1 + (peak - 1) * Math.sin(Math.PI * (t.getValue() ?? 0));
        kart.setScale(this.facing * this.scaleOf(k), this.scaleOf(k));
      },
      onComplete: () => {
        this.pulse = undefined;
        kart.setScale(this.facing * this.scaleOf(), this.scaleOf());
      },
    });
  }

  /** The waiting kart blinks 1 ↔ raceWaitAlpha (≤ 1 Hz), only below the glow level. */
  private startBlink(): void {
    const kart = this.kart;
    if (!kart || this.blink || this.hintLevel >= GLOW_LEVEL || this.trace?.state !== 'waiting') return;
    kart.setAlpha(1);
    this.blink = this.tweens.add({ targets: kart, alpha: Tokens.ui.raceWaitAlpha, duration: Tokens.Timing.raceWaitBlinkMs / 2, ease: SINE, yoyo: true, repeat: -1 });
  }

  private stopBlink(): void {
    this.blink?.stop();
    this.blink = undefined;
    this.kart?.setAlpha(1);
  }

  /** Hint level ≥ 2: the dash ahead of the kart lights up progressively (a static fade under reduced motion). */
  private startGlow(): void {
    if (this.glowTween || !this.trace || this.trace.state === 'arrived') return;
    const g = this.glow;
    if (!g) return;
    const draw = (u: number): void => {
      const trace = this.trace;
      g.clear();
      if (!trace) return;
      const core = Tokens.colors.hintCore;
      dashes(g, trace, trace.s, trace.s + u * Tokens.ui.raceGuideGlowPx, Tokens.ui.roadDashWidth * 2, core.value, core.alpha);
    };
    if (this.reduced) {
      draw(1);
      g.setAlpha(0);
      this.glowTween = this.tweens.add({ targets: g, alpha: 1, duration: Tokens.Timing.raceGuideSweepMs });
      return;
    }
    g.setAlpha(1);
    this.glowTween = this.tweens.addCounter({ from: 0, to: 1, duration: Tokens.Timing.raceGuideSweepMs, repeat: -1, onUpdate: (t) => draw(t.getValue() ?? 0) });
  }

  private stopGlow(): void {
    this.glowTween?.stop();
    this.glowTween = undefined;
    this.glow?.clear();
  }

  // --- celebrations -------------------------------------------------------------------------------------

  /** The driver waves (kart/wave frames every raceWaveFrameMs) and the horn sounds; the final one adds the tune and a bounce. */
  private celebrate(final: boolean): void {
    this.stopGlow();
    this.holdAmbient(HOLD_CELEBRATE, true);
    const kart = this.kart;
    audio.sfx(SFX.horn);
    // Reduced motion: the arm stays raised (frame 00 held).
    if (kart && this.reduced && this.textures.get(ATLASES.race.key).has(kartFrames.wave[0]!)) kart.setFrame(kartFrames.wave[0]!, false, false);
    else if (kart) {
      let n = 0;
      this.wave?.remove();
      this.wave = this.time.addEvent({
        delay: Tokens.Timing.raceWaveFrameMs,
        loop: true,
        callback: () => {
          const f = kartFrames.wave[n++ % kartFrames.wave.length]!;
          if (this.textures.get(ATLASES.race.key).has(f)) kart.setFrame(f, false, false);
        },
      });
    }
    if (!final) return;
    audio.sfx(SFX.happy);
    if (!kart) return;
    const spec = Tokens.components.character.celebrate;
    const s = spec.scales.map((k) => amplitude(k, this.reduced));
    const steps = s.length - 1;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: spec.durationMs,
      onUpdate: (t) => {
        const local = ((t.getValue() ?? 0) * spec.repeat) % 1;
        const i = Math.min(steps - 1, Math.floor(local * steps));
        const f = local * steps - i;
        const k = s[i]! + (s[i + 1]! - s[i]!) * Math.sin((f * Math.PI) / 2);
        kart.setScale(this.facing * this.scaleOf(k), this.scaleOf(k));
      },
      onComplete: () => kart.setScale(this.facing * this.scaleOf(), this.scaleOf()),
    });
  }

  /** After the short celebration the road, gate and kart fade out; then the next road begins. */
  private nextRoad(afterMs: number): void {
    this.time.delayedCall(afterMs, () => {
      this.wave?.remove();
      this.wave = undefined;
      const objs = [this.road, this.driven, this.kart, this.gate, this.kartShadow, this.gateShadow].filter((o) => o !== undefined);
      this.tweens.add({ targets: objs, alpha: 0, duration: Tokens.Timing.sceneFadeMs, onComplete: () => this.applyAll(this.round?.nextRoadReady() ?? []) });
    });
  }

  // --- round commands -----------------------------------------------------------------------------------

  private applyAll(cmds: readonly RaceCommand[]): void {
    if (this.inert) return;
    for (const c of cmds) this.apply(c);
  }

  private apply(c: RaceCommand): void {
    switch (c.kind) {
      case 'beginRoad':
        this.beginRoad(c.pathId, c.index, c.restoreIndex ?? 0);
        return;
      case 'beginQuestion':
        if (this.step) this.hint.beginQuestion({ promptLineId: c.promptLineId, retryLineId: c.retryLineId, step: this.step });
        else this.questionBegunWithoutHint();
        return;
      case 'hintActivity':
        if (this.step) this.hint.stepDone(this.step);
        return;
      case 'questionDone':
        this.hint.questionDone();
        return;
      case 'lockTrace':
        this.trace?.setEnabled(false);
        return;
      case 'celebrate':
        this.celebrate(c.final);
        return;
      case 'markFinishing':
        this.markFinishing();
        return;
      case 'nextRoad':
        this.nextRoad(c.afterMs);
        return;
      case 'finishRound':
        this.scheduleFinish(c.afterMs);
        return;
    }
  }
}
