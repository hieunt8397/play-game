// Câu cá (Stories 4.3, 4.4): fish swim in a pond off the island's dock; the voice asks for one by colour
// (Story 4.4: or by size) and the child taps it. A wrong fish dives and comes back; open water only
// ripples. The right fish is reeled up to the rod, wriggles, its name is said and it jumps. The scene only
// wires Phaser: the plate `bg.fishing`, the fish sprites of `atlas.fishing` in Containers (the hint items),
// one scene-wide tap area whose press picks the moving fish (core/input/moving-pick: where it is or was
// 150 ms ago), the pure swim model and tweens. Every decision (questions, taps, the hand-over, the round
// end) is the pure round model (round.ts, questions.ts); prompts and retries go through `hint` only; the
// game speaks only each fish's name (`say`). Every position comes from LAYOUTS.fishing.
import type { GameObjects, Time } from 'phaser';
import { ATLASES, BACKGROUNDS } from '../../content/assets';
import { CATCH_ANCHOR, DIVE_BUBBLES, LINE_STEPS, POND_HIT, POND_MIN_POINTS, ROD_TIP_ANCHOR, SFX, fishFrames, type FishSpec } from '../../content/games/fishing';
import type { Point, ScreenLayout } from '../../content/layout-types';
import { LAYOUTS } from '../../content/layouts';
import { audio } from '../../core/audio-director';
import { bus } from '../../core/bus';
import type { HintItem, HintStep } from '../../core/hint-director';
import { inputGuard } from '../../core/input/guard';
import { pickMoving } from '../../core/input/moving-pick';
import { createTapRouter, type TapRouter } from '../../core/input/tap-router';
import { createTapTarget } from '../../core/input/tap-target';
import { amplitude, prefersReducedMotion } from '../../core/reduced-motion';
import { mulberry32 } from '../../core/rng';
import { Tokens } from '../../core/tokens';
import { originFor, trimmedCentre, trimmedSize, type TrimmedRect } from '../../core/ui/sprite-pivot';
import { MiniGameBase } from '../mini-game-base';
import { questionSeed, type FishQuestion } from './questions';
import { FishingRound, fishId, startCommands, type FishingCommand, type FishingProgress, type SpeechTag } from './round';
import { SwimModel } from './swim';

const SINE = 'Sine.easeInOut';
const EASE_OUT = 'Quad.easeOut';
/** The hint level from which only the correct fish swims (slowly). */
const CALM_LEVEL = 2;

/** Draw order: the fish, the fishing line, the ripples and bubbles. */
const LAYERS = ['fish', 'line', 'fx'] as const;
const Depth = Object.fromEntries(LAYERS.map((name, i) => [name, i + 1])) as Readonly<Record<(typeof LAYERS)[number], number>>;

interface FrameData {
  readonly spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

/** One fish on screen. */
interface FishView {
  readonly id: string;
  readonly spec: FishSpec;
  readonly box: GameObjects.Container;
  readonly sprite: GameObjects.Image | undefined;
  /** The hint's handle on the fish (ring, bob, dim, unpick). */
  readonly hint: HintItem;
  /** Extra y while it sinks on a dive (tweened). */
  sink: { y: number };
  frame: number;
  /** Reeled or jumping: the swim model no longer places it. */
  free: boolean;
}

export class Fishing extends MiniGameBase<'fishing'> {
  private round: FishingRound | undefined;
  private router: TapRouter | undefined;
  private layout: ScreenLayout = LAYOUTS.fishing;
  private swim: SwimModel | undefined;
  private views: FishView[] = [];
  private step: HintStep | undefined;
  private line: GameObjects.Graphics | undefined;
  private lineTo: FishView | undefined;
  private swimTimer: Time.TimerEvent | undefined;
  private wriggle: Time.TimerEvent | undefined;
  private tokens = new Map<number, SpeechTag>();
  private issuing: SpeechTag | undefined;
  private warned = new Set<string>();

  constructor() {
    super('fishing');
  }

  // --- build ----------------------------------------------------------------------------------------

  protected build(): void {
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS.fishing;
    this.swim = undefined;
    this.views = [];
    this.step = undefined;
    this.lineTo = undefined;
    this.swimTimer = undefined;
    this.wriggle = undefined;
    this.tokens = new Map();
    this.issuing = undefined;
    const bg = BACKGROUNDS.fishing.key;
    if (this.textures.exists(bg)) this.add.image(0, 0, bg).setOrigin(0).setScale(1 / this.layout.renderScale);
    else console.warn(`fishing: texture "${bg}" is missing — plate skipped`);
    this.line = this.add.graphics().setDepth(Depth.line);

    this.router = createTapRouter(this);
    this.attachSkip(this.router);
    // The whole scene is the pond: a press picks the moving fish itself (Hud wins its own buttons).
    createTapTarget(this.router, { area: { contains: () => true }, onPress: (p) => this.onPress(p) });

    const scoped = bus.scoped(this);
    scoped.on('speech:ended', ({ token }) => {
      const tag = this.tokens.get(token);
      if (tag === undefined) return;
      this.tokens.delete(token);
      this.applyAll(this.round?.speechEnded(tag) ?? []);
    });
    scoped.on('speech:line', ({ token, index }) => {
      if (!this.tokens.has(token) && this.issuing !== undefined && index === 0) this.tokens.set(token, this.issuing);
    });
    scoped.on('hint:level', ({ gameId, level }) => {
      if (gameId !== this.gameId || !this.round || this.round.stage !== 'ask') return;
      // Level ≥ 2: only the correct fish swims, slowly; level 0 (a new question): everyone swims again.
      if (level >= CALM_LEVEL) this.swim?.setCalm(this.round.correctIds());
      else if (level === 0) this.swim?.setCalm(null);
    });

    const round = new FishingRound(
      { resurfaceMs: Tokens.Timing.fishResurfaceMs, shortCelebrateMs: Tokens.Timing.fishShortCelebrateMs, finishDelayMs: Tokens.Timing.roundCelebrationMs },
      this.seed,
      this.level,
    );
    this.round = round;
    const plan = startCommands(round, this.resumeAt);
    for (const w of plan.warnings) console.warn(w);
    if (plan.accepted) this.acceptResume();
    this.applyAll(plan.commands);
  }

  protected progress(): FishingProgress {
    return this.round?.progress() ?? { questionIndex: 0, partial: {} };
  }

  override update(_time: number, delta: number): void {
    if (this.inert || !this.swim || this.round?.stage === 'done') return;
    if (this.round?.stage === 'ask') this.swim.tick(delta);
    this.swim.record(this.time.now);
    for (const v of this.views) this.placeView(v);
    this.drawLine();
  }

  private warnOnce(what: string, msg: string): void {
    if (this.warned.has(what)) return;
    this.warned.add(what);
    console.warn(msg);
  }

  private anchor(id: string): Point {
    const p = this.layout.anchors[id];
    if (!p) this.warnOnce(`anchor.${id}`, `fishing: anchor "${id}" is missing from the layout`);
    return p ?? { x: this.layout.design.width / 2, y: this.layout.design.height / 2 };
  }

  private frameRect(frame: string): TrimmedRect | undefined {
    const key = ATLASES.fishing.key;
    if (!this.textures.exists(key) || !this.textures.get(key).has(frame)) return undefined;
    const ss = (this.textures.get(key).get(frame).customData as FrameData | undefined)?.spriteSourceSize;
    return ss ? { x: ss.x, y: ss.y, width: ss.w, height: ss.h } : undefined;
  }

  /** Shows `frame` on the fish's sprite with its trimmed centre on the container origin. */
  private setFrame(v: FishView, frame: string): void {
    const rect = this.frameRect(frame);
    if (!v.sprite || !rect) {
      if (!rect) this.warnOnce(frame, `fishing: frame "${frame}" is missing`);
      return;
    }
    const o = originFor(trimmedCentre(rect, this.layout.renderScale), this.layout.design);
    v.sprite.setFrame(frame, false, false).setOrigin(o.x, o.y);
  }

  /** The fish's half body size (design px) from its `swim/00` trim (else the fish minimum). */
  private halfSize(spec: FishSpec): { halfW: number; halfH: number } {
    const rect = this.frameRect(fishFrames(spec).swim[0]!);
    const s = rect ? trimmedSize(rect, this.layout.renderScale) : { w: Tokens.components.fish.minSize, h: Tokens.components.fish.minSize };
    return { halfW: s.w / 2, halfH: s.h / 2 };
  }

  private placeView(v: FishView): void {
    if (v.free || !this.swim) return;
    const p = this.swim.position(v.id);
    if (!p) return;
    v.box.setPosition(p.x, p.y + v.sink.y);
    v.sprite?.setScale(this.swim.facing(v.id) / this.layout.renderScale, 1 / this.layout.renderScale);
  }

  // --- one question ------------------------------------------------------------------------------------

  /** Spawns the question's fish (seeded placement from questionSeed), fades them in, starts the swim frames. */
  private spawn(index: number, q: FishQuestion): void {
    this.clearFish(false);
    const pond = this.layout.hits[POND_HIT];
    if (!pond || pond.length < POND_MIN_POINTS) {
      this.warnOnce(`hit.${POND_HIT}`, `fishing: hit "${POND_HIT}" is missing from the layout`);
      return;
    }
    const specs = q.fish.map((f, k) => ({ id: fishId(k), ...this.halfSize(f) }));
    const swim = new SwimModel(pond, specs, mulberry32(questionSeed(this.seed, index)), { reduced: this.reduced });
    swim.place();
    swim.record(this.time.now);
    this.swim = swim;
    const key = ATLASES.fishing.key;
    this.views = q.fish.map((spec, k) => {
      const box = this.add.container(0, 0).setDepth(Depth.fish).setAlpha(0);
      const first = fishFrames(spec).swim[0]!;
      const sprite = this.textures.exists(key) && this.textures.get(key).has(first) ? this.add.image(0, 0, key, first) : undefined;
      if (sprite) box.add(sprite);
      const v: FishView = { id: fishId(k), spec, box, sprite, hint: { object: box }, sink: { y: 0 }, frame: 0, free: false };
      this.setFrame(v, first);
      this.placeView(v);
      return v;
    });
    this.tweens.add({ targets: this.views.map((v) => v.box), alpha: 1, duration: Tokens.Timing.sceneFadeMs });
    this.swimTimer = this.time.addEvent({
      delay: Tokens.Timing.fishSwimFrameMs,
      loop: true,
      callback: () => {
        for (const v of this.views) {
          if (v.free || this.swim?.isDiving(v.id)) continue;
          const frames = fishFrames(v.spec).swim;
          v.frame = (v.frame + 1) % frames.length;
          this.setFrame(v, frames[v.frame]!);
        }
      },
    });
    const correct = this.round?.correctIds(q) ?? [];
    this.step = {
      action: 'tap',
      correct: this.views.filter((v) => correct.includes(v.id)).map((v) => v.hint),
      distractors: this.views.filter((v) => !correct.includes(v.id)).map((v) => v.hint),
      target: null,
    };
  }

  /** Removes the fish (and the line), fading them out first when `fade`. */
  private clearFish(fade: boolean, done?: () => void): void {
    this.swimTimer?.remove();
    this.swimTimer = undefined;
    this.wriggle?.remove();
    this.wriggle = undefined;
    this.lineTo = undefined;
    this.line?.clear();
    const boxes = this.views.map((v) => v.box);
    this.views = [];
    this.swim = undefined;
    if (!fade || boxes.length === 0) {
      for (const b of boxes) b.destroy();
      done?.();
      return;
    }
    this.tweens.add({
      targets: boxes,
      alpha: 0,
      duration: Tokens.Timing.sceneFadeMs,
      onComplete: () => {
        for (const b of boxes) b.destroy();
        done?.();
      },
    });
  }

  private view(id: string): FishView | undefined {
    return this.views.find((v) => v.id === id);
  }

  /** A press: the fish there now or 150 ms ago (pickable, not diving), else water. All feedback starts here. */
  private onPress(p: Point): void {
    if (this.inert || !this.round || !this.swim) return;
    const now = this.time.now;
    const pickable = new Set(this.views.filter((v) => inputGuard.isPickable(v.hint)).map((v) => v.id));
    const candidates = this.swim.candidates(now, now - Tokens.Timing.fishHitLookbackMs).filter((c) => pickable.has(c.id));
    const id = pickMoving(p, candidates, Tokens.components.fish.hitPad);
    this.applyAll(this.round.tap(id, p));
  }

  // --- effects -----------------------------------------------------------------------------------------

  /** A seaShallow ring grows to fishRippleRadiusPx and fades; the "tõm". */
  private ripple(at: Point): void {
    audio.sfx(SFX.plop);
    const ring = this.add.circle(at.x, at.y, 1).setStrokeStyle(Tokens.ui.fishLineWidth, Tokens.colors.seaShallow.value).setDepth(Depth.fx);
    ring.isFilled = false;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: Tokens.Timing.fishRippleMs,
      ease: EASE_OUT,
      onUpdate: (t) => {
        const u = t.getValue() ?? 0;
        ring.setRadius(Math.max(1, u * Tokens.ui.fishRippleRadiusPx)).setAlpha(1 - u);
      },
      onComplete: () => ring.destroy(),
    });
  }

  /** A wrong fish sinks and fades with its dive frame and 3 rising bubbles (none under reduced motion). */
  private dive(id: string): void {
    const v = this.view(id);
    if (!v) return;
    audio.sfx(SFX.bubble);
    this.splash({ x: v.box.x, y: v.box.y });
    this.swim?.dive(id);
    this.setFrame(v, fishFrames(v.spec).dive);
    this.tweens.add({ targets: v.sink, y: amplitude(Tokens.ui.fishDiveDropPx, this.reduced), duration: Tokens.Timing.fishDiveMs, ease: EASE_OUT });
    this.tweens.add({ targets: v.box, alpha: Tokens.ui.fishDiveAlpha, duration: Tokens.Timing.fishDiveMs });
    if (this.reduced) return;
    const core = Tokens.colors.hintCore;
    const r = Tokens.ui.fishBubblePx;
    for (let i = 0; i < DIVE_BUBBLES; i++) {
      const b = this.add.circle(v.box.x + (i - 1) * r * 2, v.box.y, r, core.value, core.alpha).setDepth(Depth.fx);
      this.tweens.add({ targets: b, y: b.y - Tokens.ui.fishRippleRadiusPx, alpha: 0, duration: Tokens.Timing.fishDiveMs, delay: (i * Tokens.Timing.fishDiveMs) / DIVE_BUBBLES, onComplete: () => b.destroy() });
    }
  }

  /** The fish rises back; its alpha returns to 1, or stays dimmed if the hint unpicked it (level 4). */
  private resurface(id: string, afterMs: number): void {
    this.time.delayedCall(afterMs, () => {
      const v = this.view(id);
      if (!v || v.free) return;
      this.swim?.resurface(id);
      this.setFrame(v, fishFrames(v.spec).swim[v.frame]!);
      this.tweens.add({ targets: v.sink, y: 0, duration: Tokens.Timing.fishDiveMs, ease: EASE_OUT });
      this.tweens.add({ targets: v.box, alpha: inputGuard.isPickable(v.hint) ? 1 : Tokens.ui.hintDimAlpha, duration: Tokens.Timing.fishDiveMs });
    });
  }

  /** The line from the rod tip to the reeled fish. */
  private drawLine(): void {
    const g = this.line;
    if (!g) return;
    g.clear();
    const v = this.lineTo;
    if (!v) return;
    const tip = this.anchor(ROD_TIP_ANCHOR);
    const c = Tokens.art.fishing.line;
    g.lineStyle(Tokens.ui.fishLineWidth, c.value, c.alpha);
    // A gentle sag below the straight line (a quadratic curve through a lowered midpoint).
    const mid = { x: (tip.x + v.box.x) / 2, y: (tip.y + v.box.y) / 2 + Tokens.ui.fishLineSagPx };
    g.beginPath();
    g.moveTo(tip.x, tip.y);
    for (let i = 1; i <= LINE_STEPS; i++) {
      const t = i / LINE_STEPS;
      const u = 1 - t;
      g.lineTo(u * u * tip.x + 2 * u * t * mid.x + t * t * v.box.x, u * u * tip.y + 2 * u * t * mid.y + t * t * v.box.y);
    }
    g.strokePath();
  }

  /** Water drops thrown up from `at` that arc out and fall back (none under reduced motion). */
  private splash(at: Point): void {
    if (this.reduced) return;
    const n = Tokens.ui.fishSplashDrops;
    const r = Tokens.ui.fishSplashDropPx;
    const core = Tokens.colors.hintCore;
    for (let i = 0; i < n; i++) {
      const dir = (i / (n - 1)) * 2 - 1; // −1 … 1 across the fan
      const drop = this.add.circle(at.x, at.y, r * (1 - Math.abs(dir) / 2), core.value, core.alpha).setDepth(Depth.fx);
      const rise = Tokens.ui.fishSplashRisePx * (1 - Math.abs(dir) / 2);
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: Tokens.Timing.fishSplashMs,
        onUpdate: (t) => {
          const u = t.getValue() ?? 0;
          drop.setPosition(at.x + dir * Tokens.ui.fishSplashSpreadPx * u, at.y - rise * Math.sin(Math.PI * u)).setAlpha(1 - u * u);
        },
        onComplete: () => drop.destroy(),
      });
    }
  }

  /** The reel: the others hold still; the fish tweens to anchor.catch wriggling; then `reeled`. */
  private catchFish(id: string): void {
    const v = this.view(id);
    if (!v) return;
    audio.sfx(SFX.reel);
    this.splash({ x: v.box.x, y: v.box.y });
    this.swim?.setCalm([]);
    v.free = true;
    this.lineTo = v;
    this.drawLine();
    const caught = fishFrames(v.spec).caught;
    let n = 0;
    this.wriggle = this.time.addEvent({ delay: Tokens.Timing.fishWriggleFrameMs, loop: true, callback: () => this.setFrame(v, caught[n++ % caught.length]!) });
    const to = this.anchor(CATCH_ANCHOR);
    this.tweens.add({
      targets: v.box,
      x: to.x,
      y: to.y,
      alpha: 1,
      duration: Tokens.Timing.fishReelMs,
      ease: SINE,
      onUpdate: () => this.drawLine(),
      onComplete: () => this.applyAll(this.round?.reeled(id) ?? []),
    });
  }

  /** The caught fish jumps once, then bounces through character.celebrate (reduced amplitudes). */
  private jump(id: string): void {
    const v = this.view(id);
    if (!v) return;
    this.wriggle?.remove();
    this.wriggle = undefined;
    this.lineTo = undefined;
    this.line?.clear();
    const y0 = v.box.y;
    this.tweens.add({
      targets: v.box,
      y: y0 - amplitude(Tokens.ui.fishJumpPx, this.reduced),
      duration: Tokens.Timing.fishJumpMs / 2,
      ease: SINE,
      yoyo: true,
      onComplete: () => {
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
            v.box.setScale(s[i]! + (s[i + 1]! - s[i]!) * Math.sin((f * Math.PI) / 2));
          },
          onComplete: () => v.box.setScale(1),
        });
      },
    });
  }

  // --- round commands ------------------------------------------------------------------------------------

  private applyAll(cmds: readonly FishingCommand[]): void {
    if (this.inert) return;
    for (const c of cmds) this.apply(c);
  }

  private say(tag: SpeechTag, speak: () => number): void {
    if (this.inert) return;
    for (const [t, g] of this.tokens) if (g === tag) this.tokens.delete(t);
    this.issuing = tag;
    const token = speak();
    this.issuing = undefined;
    this.tokens.set(token, tag);
    // Story 5.3: after the token is stored, so a synchronous speech:ended from a skip is not lost.
    this.skipVoice(token);
  }

  private apply(c: FishingCommand): void {
    switch (c.kind) {
      case 'beginQuestion':
        this.spawn(c.index, c.q);
        if (this.step) this.hint.beginQuestion({ promptLineId: c.promptLineId, retryLineId: c.retryLineId, step: this.step });
        else this.questionBegunWithoutHint();
        return;
      case 'ripple':
        this.ripple(c.at);
        return;
      case 'dive':
        this.dive(c.id);
        return;
      case 'wrong':
        this.hint.wrong();
        return;
      case 'resurface':
        this.resurface(c.id, c.afterMs);
        return;
      case 'questionDone':
        this.hint.questionDone();
        return;
      case 'lock':
        return;
      case 'markFinishing':
        this.markFinishing();
        return;
      case 'catch': {
        // Story 5.3: reel, jump, name and the short celebration — a tap after the arm delay fast-forwards it.
        const T = Tokens.Timing;
        this.skippable(T.fishReelMs + T.fishJumpMs + T.celebrationLineMs + T.fishShortCelebrateMs);
        this.catchFish(c.id);
        return;
      }
      case 'say':
        this.say(c.tag, () => audio.say(c.id));
        return;
      case 'jump':
        this.jump(c.id);
        return;
      case 'happy':
        audio.sfx(SFX.happy);
        return;
      case 'nextQuestion':
        this.time.delayedCall(c.afterMs, () => this.clearFish(true, () => this.applyAll(this.round?.nextQuestionReady() ?? [])));
        return;
      case 'finishRound':
        this.scheduleFinish(c.afterMs);
        return;
    }
  }
}

