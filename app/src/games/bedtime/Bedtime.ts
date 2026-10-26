// Giờ đi ngủ (Story 7.4): a yard game (the yard's `bed` corner). A cosy bedroom; the Shiba friend sits on its bed.
// Xoài does three things by tapping, in any order: the toothbrush (it scrubs at Shiba's mouth with foam bubbles, Shiba
// giggles), the lamp (it clicks off and the room fades to a soft blue night: a MULTIPLY tint over the same plate,
// never dark) and the blanket (it covers Shiba, who yawns). A soft glow suggests the next step; the order is never
// enforced. With all three done the round completes WITHOUT a next round (MiniGameBase.finishRoundAndStay: the
// ending is the destination): Shiba sleeps with a soft "khò khò" and floating "z", stars fade in at the window and
// the self-made lullaby plays (the island loop made way when the room opened). A tap on the sleeping Shiba rolls it
// over. Home goes back to the yard (`round:leave`; before the end: `round:abandon` with `{ done }` to resume).
// The scene only wires Phaser: the plate, one image per frame (full-frame, crossfaded), the night tint, the glows,
// the particles, one tap target per hull, tweens, the music channel and the pure controller (round.ts).
import type { GameObjects } from 'phaser';
import { ATLASES, BACKGROUNDS } from '../../content/assets';
import {
  ANCHORS,
  FRAMES,
  GOODNIGHT_LINE,
  INVITE_LINE,
  LULLABY,
  SFX,
  SHIBA,
  SHIBA_POSES,
  STAR_ANCHORS,
  STEP_IDS,
  STEP_LINES,
  shibaFrame,
  type BedtimeStep,
  type ShibaPose,
} from '../../content/games/bedtime';
import type { Point, ScreenLayout } from '../../content/layout-types';
import { LAYOUTS } from '../../content/layouts';
import { audio } from '../../core/audio-director';
import { bus } from '../../core/bus';
import { pointInPolygon } from '../../core/input/polygon';
import { createTapRouter } from '../../core/input/tap-router';
import { createTapTarget } from '../../core/input/tap-target';
import { amplitude, prefersReducedMotion } from '../../core/reduced-motion';
import { mulberry32 } from '../../core/rng';
import { Tokens } from '../../core/tokens';
import { originFor, type TrimmedRect } from '../../core/ui/sprite-pivot';
import { MiniGameBase } from '../mini-game-base';
import { createBedtimeController, resumeBedtime, type BedtimeController, type BedtimeTarget } from './round';

interface FrameData {
  readonly spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

const SINE = 'Sine.easeInOut';
/** Draw order, back to front: the night window (sky and moon), the lamp's halo, the lamp, Shiba, the blanket, the brush and its foam, the night tint, then
 * what shines through the night (the suggestion glow, the stars, the "z"). */
const LAYERS = ['window', 'lampGlow', 'lamp', 'shiba', 'blanket', 'brush', 'bubble', 'night', 'glow', 'star', 'z'] as const;
const depth = (layer: (typeof LAYERS)[number]): number => LAYERS.indexOf(layer) + 1;

export class Bedtime extends MiniGameBase<'bedtime'> {
  private layout: ScreenLayout = LAYOUTS.bedtime;
  private ctl: BedtimeController | undefined;
  private warned = new Set<string>();
  private shiba = new Map<ShibaPose, GameObjects.Image>();
  private shown: ShibaPose | undefined;
  private blanketImgs: { off?: GameObjects.Image | undefined; on?: GameObjects.Image | undefined } = {};
  private lampImgs: { on?: GameObjects.Image | undefined; off?: GameObjects.Image | undefined } = {};
  private lampGlow: GameObjects.Graphics | undefined;
  private brushImg: GameObjects.Image | undefined;
  private night: GameObjects.Rectangle | undefined;
  /** Review: the night sky and moon in the window (hidden by day). */
  private nightWindow: GameObjects.Image | undefined;
  private glowGfx: GameObjects.Graphics | undefined;
  private glowTween: { stop(): unknown } | undefined;
  private rand: () => number = Math.random;
  /** The music loop playing before the bedroom (the island's), restored when it closes. */
  private outerMusic: string | undefined;
  /** The last line this game made the Speaker prompt (cleared on shutdown, and only it). */
  private prompt: string | undefined;

  constructor() {
    super('bedtime');
  }

  protected build(): void {
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS.bedtime;
    this.shiba = new Map();
    this.shown = undefined;
    this.blanketImgs = {};
    this.lampImgs = {};
    this.rand = mulberry32(this.seed >>> 0);
    const resume = resumeBedtime(this.resumeAt);
    if (this.resumeAt && !resume) console.warn('bedtime: bad resume — a fresh bedtime');
    if (resume) this.acceptResume();
    // The bedroom is quiet: the island loop fades out (the lullaby takes the music channel at the end).
    this.outerMusic = audio.musicId;
    audio.fadeOutMusic(Tokens.Timing.bedtimeMusicFadeMs);

    const rs = this.layout.renderScale;
    const bg = BACKGROUNDS.bedtime;
    if (this.textures.exists(bg.key)) this.add.image(0, 0, bg.key).setOrigin(0).setScale(1 / rs);
    else this.warnOnce(bg.key, `bedtime: texture "${bg.key}" is missing — plate skipped`);

    this.nightWindow = this.full(FRAMES.windowNight, depth('window'))?.setAlpha(0);
    this.lampGlow = this.add.graphics().setDepth(depth('lampGlow')).setBlendMode('ADD');
    this.drawGlow(this.lampGlow, this.anchor(ANCHORS.lamp), Tokens.ui.bedtimeLampGlowRxPx, Tokens.ui.bedtimeLampGlowRyPx, Tokens.ui.bedtimeLampGlowAlpha);
    this.lampImgs = { on: this.full(FRAMES.lampOn, depth('lamp')), off: this.full(FRAMES.lampOff, depth('lamp'))?.setAlpha(0) };
    for (const pose of SHIBA_POSES) {
      const img = this.full(shibaFrame(pose), depth('shiba'));
      if (img) this.shiba.set(pose, img.setAlpha(0));
    }
    this.blanketImgs = { off: this.full(FRAMES.blanketOff, depth('blanket')), on: this.full(FRAMES.blanketOn, depth('blanket'))?.setAlpha(0) };
    this.brushImg = this.pivoted(FRAMES.brush, this.anchor(ANCHORS.brushHead), depth('brush'));
    const d = Tokens.design;
    this.night = this.add
      .rectangle(-Tokens.ui.bedtimeNightBleedPx, -Tokens.ui.bedtimeNightBleedPx, d.width + 2 * Tokens.ui.bedtimeNightBleedPx, d.height + 2 * Tokens.ui.bedtimeNightBleedPx, Tokens.art.bedtime.nightTint.value, 1)
      .setOrigin(0)
      .setBlendMode('MULTIPLY')
      .setAlpha(0)
      .setDepth(depth('night'));
    this.glowGfx = this.add.graphics().setDepth(depth('glow')).setBlendMode('ADD');

    const router = createTapRouter(this);
    this.attachReactions(router);
    const ctl = createBedtimeController({
      stepLines: STEP_LINES,
      goodnightLine: GOODNIGHT_LINE,
      inviteLine: INVITE_LINE,
      sounds: SFX,
      resume,
      audio: {
        sfx: (id) => audio.sfx(id),
        say: (id) => audio.say(id),
        sayChain: (ids) => audio.sayChain(ids),
        setPrompt: (id) => {
          this.prompt = id;
          audio.setPrompt(id);
        },
        startLullaby: () => audio.music(LULLABY, Tokens.Timing.bedtimeLullabyFadeMs),
      },
      view: {
        glow: (step) => this.glowOn(step),
        pose: (pose, ms) => this.showPose(pose, ms),
        brush: (at) => this.brushTo(at),
        lamp: (on, ms) => this.setLamp(on, ms),
        night: (ms) => this.fadeNight(ms),
        blanket: (on, ms) => this.setBlanket(on, ms),
        repeat: (step) => this.repeat(step),
        nudge: () => this.nudge(),
        stars: () => this.stars(),
        z: () => this.floatZ(),
      },
      // The ending is the destination: the round completes now and no next round ever follows.
      onAllDone: () => this.finishRoundAndStay(),
    });
    this.ctl = ctl;

    for (const id of [...STEP_IDS, SHIBA] as BedtimeTarget[]) {
      const hull = this.layout.hits[id];
      if (!hull) {
        this.warnOnce(`hit.${id}`, `bedtime: hit "${id}" is missing from the layout`);
        continue;
      }
      createTapTarget(router, { area: { contains: (p) => pointInPolygon(p, hull) }, onPress: () => this.ctl?.tap(id) });
    }

    // The parent invitation (at most once; never on a resumed start) waits until the voice is quiet.
    let invitePending = true;
    bus.scoped(this).on('speech:ended', () => {
      if (!invitePending || audio.voiceBusy) return;
      invitePending = false;
      this.inviteParent();
    });
    this.events.once('shutdown', () => this.silence(true));
    ctl.start();
  }

  protected progress(): { questionIndex: number; partial: { done: string[] } } {
    return { questionIndex: 0, partial: { done: [...(this.ctl?.done ?? [])] } };
  }

  /** Home before the end: the controller stops, then the base abandons (the snapshot keeps the steps done). */
  protected override abandon(): void {
    this.ctl?.stop();
    super.abandon();
  }

  /** Home after the end: the lullaby fades out, then the base leaves (`round:leave`). */
  protected override leave(): void {
    this.silence(false);
    super.leave();
  }

  override update(_time: number, delta: number): void {
    // The bedroom keeps living after the round completed (free play): the controller's own `stop` ends it.
    this.ctl?.tick(delta);
  }

  private silence(closing: boolean): void {
    this.ctl?.stop();
    if (audio.musicId === LULLABY) audio.fadeOutMusic(Tokens.Timing.bedtimeLullabyFadeMs);
    if (!closing) return;
    if (this.prompt !== undefined) audio.clearPrompt(this.prompt);
    if (this.outerMusic !== undefined && this.outerMusic !== LULLABY) audio.music(this.outerMusic, Tokens.Timing.bedtimeMusicFadeMs);
    this.outerMusic = undefined;
  }

  private warnOnce(what: string, msg: string): void {
    if (this.warned.has(what)) return;
    this.warned.add(what);
    console.warn(msg);
  }

  private anchor(id: string): Point | undefined {
    const a = this.layout.anchors[id];
    if (!a) this.warnOnce(`anchor.${id}`, `bedtime: anchor "${id}" is missing from the layout`);
    return a;
  }

  private frameRect(frame: string): TrimmedRect | undefined {
    const key = ATLASES.bedtime.key;
    if (!this.textures.exists(key) || !this.textures.get(key).has(frame)) {
      this.warnOnce(frame, `bedtime: frame "${frame}" is missing`);
      return undefined;
    }
    const ss = (this.textures.get(key).get(frame).customData as FrameData | undefined)?.spriteSourceSize;
    const rs = this.layout.renderScale;
    return ss ? { x: ss.x / rs, y: ss.y / rs, width: ss.w / rs, height: ss.h / rs } : undefined;
  }

  /** A full-frame image of `frame` where it was rendered, on its visible bottom centre (the nudge pivot). */
  private full(frame: string, depth: number): GameObjects.Image | undefined {
    const rect = this.frameRect(frame);
    if (!rect) return undefined;
    return this.pivoted(frame, { x: rect.x + rect.width / 2, y: rect.y + rect.height }, depth);
  }

  /** A full-frame image of `frame` whose design point `pivot` is its origin (it stays where it was rendered). */
  private pivoted(frame: string, pivot: Point | undefined, depth: number): GameObjects.Image | undefined {
    if (!pivot || !this.frameRect(frame)) return undefined;
    const o = originFor(pivot, this.layout.design);
    return this.add.image(pivot.x, pivot.y, ATLASES.bedtime.key, frame).setScale(1 / this.layout.renderScale).setOrigin(o.x, o.y).setDepth(depth);
  }

  /** A particle frame (bubble, star, z) centred on `at` at `scale` of its rendered size. */
  private particle(frame: string, at: Point, scale: number, depth: number): GameObjects.Image | undefined {
    const rect = this.frameRect(frame);
    if (!rect) return undefined;
    const o = originFor({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, this.layout.design);
    return this.add.image(at.x, at.y, ATLASES.bedtime.key, frame).setScale(scale / this.layout.renderScale).setOrigin(o.x, o.y).setDepth(depth);
  }

  /** A soft halo: Tokens.ui.bedtimeGlowRings concentric ellipses, faint at the rim and strongest in the middle (ADD blend). */
  private drawGlow(g: GameObjects.Graphics, at: Point | undefined, rx: number, ry: number, alpha: number): void {
    g.clear();
    if (!at) return;
    const colour = Tokens.art.bedtime.glow.value;
    for (let k = Tokens.ui.bedtimeGlowRings; k >= 1; k--) {
      const f = k / Tokens.ui.bedtimeGlowRings;
      g.fillStyle(colour, alpha / Tokens.ui.bedtimeGlowRings);
      g.fillEllipse(at.x, at.y, 2 * rx * f, 2 * ry * f);
    }
  }

  // --- the controller's view ---------------------------------------------------------------------------------

  /** The suggestion glow behind the step's tap area; it breathes softly (it stays still under reduced motion). */
  private glowOn(step: BedtimeStep | null): void {
    const g = this.glowGfx;
    if (!g) return;
    this.tweens.killTweensOf(g);
    this.glowTween?.stop();
    this.glowTween = undefined;
    if (step === null) {
      this.tweens.add({ targets: g, alpha: 0, duration: Tokens.Timing.bedtimePoseFadeMs, ease: SINE });
      return;
    }
    const hull = this.layout.hits[step];
    if (!hull) return;
    const xs = hull.map((p) => p.x);
    const ys = hull.map((p) => p.y);
    const pad = Tokens.ui.bedtimeGlowPadPx;
    const at = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    this.drawGlow(g, at, (Math.max(...xs) - Math.min(...xs)) / 2 + pad, (Math.max(...ys) - Math.min(...ys)) / 2 + pad, Tokens.ui.bedtimeGlowAlpha);
    g.setAlpha(0);
    this.tweens.add({ targets: g, alpha: 1, duration: Tokens.Timing.bedtimePoseFadeMs, ease: SINE });
    if (!this.reduced) {
      this.glowTween = this.tweens.add({ targets: g, alpha: Tokens.ui.bedtimeBreatheAlpha, duration: Tokens.Timing.bedtimeGlowPulseMs / 2, delay: Tokens.Timing.bedtimePoseFadeMs, ease: SINE, yoyo: true, repeat: -1 });
    }
  }

  private fade(img: GameObjects.Image | undefined, alpha: number, ms: number): void {
    if (!img) return;
    this.tweens.killTweensOf(img);
    if (ms <= 0) img.setAlpha(alpha);
    else this.tweens.add({ targets: img, alpha, duration: ms, ease: SINE });
  }

  /** Shiba's pose: the shown frame crossfades into the new one. */
  private showPose(pose: ShibaPose, ms: number): void {
    if (this.shown === pose) return;
    const before = this.shown;
    this.shown = pose;
    for (const [p, img] of this.shiba) {
      img.setScale(1 / this.layout.renderScale);
      if (p === pose) this.fade(img, 1, ms);
      else if (p === before) this.fade(img, 0, ms);
      else if (ms <= 0) img.setAlpha(0);
    }
  }

  private setLamp(on: boolean, ms: number): void {
    this.fade(this.lampImgs.on, on ? 1 : 0, ms);
    this.fade(this.lampImgs.off, on ? 0 : 1, ms);
    if (!this.lampGlow) return;
    this.tweens.killTweensOf(this.lampGlow);
    if (ms <= 0) this.lampGlow.setAlpha(on ? 1 : 0);
    else this.tweens.add({ targets: this.lampGlow, alpha: on ? 1 : 0, duration: ms, ease: SINE });
  }

  /** The soft blue night: the MULTIPLY tint and the window's night sky fade in (a slow crossfade, the same under reduced motion). */
  private fadeNight(ms: number): void {
    // Review: the window's night sky and moon crossfade in with the tint (by day the plate shows a day sky).
    this.fade(this.nightWindow, 1, ms);
    const n = this.night;
    if (!n) return;
    this.tweens.killTweensOf(n);
    if (ms <= 0) n.setAlpha(Tokens.ui.bedtimeNightAlpha);
    else this.tweens.add({ targets: n, alpha: Tokens.ui.bedtimeNightAlpha, duration: ms, ease: SINE });
  }

  private setBlanket(on: boolean, ms: number): void {
    this.fade(this.blanketImgs.off, on ? 0 : 1, ms);
    this.fade(this.blanketImgs.on, on ? 1 : 0, ms);
  }

  /** The brush travels from its cup to Shiba's mouth, scrubs gently (foam bubbles) and goes back. */
  private brushTo(at: 'sit' | 'lie'): void {
    const img = this.brushImg;
    const home = this.anchor(ANCHORS.brushHead);
    const mouth = this.anchor(at === 'sit' ? ANCHORS.mouthSit : ANCHORS.mouthLie);
    if (!img || !home || !mouth) return;
    const t = Tokens.Timing;
    const s = 1 / this.layout.renderScale;
    this.tweens.killTweensOf(img);
    img.setPosition(home.x, home.y).setScale(s).setAngle(0);
    const u = Tokens.ui;
    const scrub = u.bedtimeScrubPx * (this.reduced ? u.reducedMotionAmplitude : 1);
    const x0 = mouth.x - u.bedtimeBrushOffsetPx;
    this.tweens.chain({
      targets: img,
      tweens: [
        { x: x0, y: mouth.y, scale: s * u.bedtimeBrushTravelScale, angle: at === 'sit' ? u.bedtimeBrushTiltSitDeg : u.bedtimeBrushTiltLieDeg, duration: t.bedtimeBrushMoveMs, ease: SINE },
        { x: x0 + scrub, duration: t.bedtimeScrubMs / 2, ease: SINE, yoyo: true },
        { x: home.x, y: home.y, scale: s, angle: 0, duration: t.bedtimeBrushMoveMs, ease: SINE },
      ],
    });
    this.time.delayedCall(t.bedtimeBrushMoveMs, () => this.bubbles(mouth, Tokens.ui.bedtimeBubbles, t.bedtimeScrubMs));
  }

  /** White foam bubbles pop up around `at` over `spanMs` and float up as they fade (only fade when reduced). */
  private bubbles(at: Point, n: number, spanMs: number): void {
    const spread = Tokens.ui.bedtimeBubbleSpreadPx;
    for (let i = 0; i < n; i++) {
      const p = { x: at.x + (this.rand() * 2 - 1) * spread, y: at.y + (this.rand() * 2 - 1) * spread * 0.5 };
      const b = this.particle(FRAMES.bubble, p, Tokens.ui.bedtimeBubbleScale + this.rand() * Tokens.ui.bedtimeBubbleScaleJitter, depth('bubble'))?.setAlpha(0);
      if (!b) return;
      const rise = this.reduced ? 0 : Tokens.ui.bedtimeBubbleRisePx;
      this.tweens.chain({
        targets: b,
        tweens: [
          { alpha: 1, duration: Tokens.Timing.bedtimeBubbleInMs, delay: (i * spanMs) / n, ease: SINE },
          { alpha: 0, y: p.y - rise, duration: Tokens.Timing.bedtimeBubbleOutMs, ease: SINE, onComplete: () => b.destroy() },
        ],
      });
    }
  }

  /** A done step's small reaction: a foam puff, a lamp wiggle, a blanket tuck. */
  private repeat(step: BedtimeStep): void {
    if (step === 'brush') {
      const mouth = this.anchor(this.ctl?.done.includes('blanket') ? ANCHORS.mouthLie : ANCHORS.mouthSit);
      if (mouth) this.bubbles(mouth, Tokens.ui.bedtimeRepeatBubbles, Tokens.Timing.bedtimeRepeatMs / 2);
      this.squash(this.brushImg);
    } else if (step === 'lamp') {
      for (const img of [this.lampImgs.on, this.lampImgs.off]) {
        if (!img || img.alpha === 0) continue;
        const deg = Tokens.ui.bedtimeWiggleDeg * (this.reduced ? Tokens.ui.reducedMotionAmplitude : 1);
        this.tweens.chain({
          targets: img,
          tweens: [
            { angle: deg, duration: Tokens.Timing.bedtimeRepeatMs / 2, ease: SINE },
            { angle: 0, duration: Tokens.Timing.bedtimeRepeatMs / 2, ease: SINE },
          ],
        });
      }
    } else {
      this.squash(this.blanketImgs.on && this.blanketImgs.on.alpha > 0 ? this.blanketImgs.on : this.blanketImgs.off);
    }
  }

  /** A gentle squash and back on the sprite's own pivot (smaller under reduced motion). */
  private squash(img: GameObjects.Image | undefined): void {
    if (!img) return;
    const s = 1 / this.layout.renderScale;
    const k = amplitude(Tokens.ui.bedtimeNudgeScale, this.reduced);
    this.tweens.add({ targets: img, scaleX: s * k, scaleY: s / k, duration: Tokens.Timing.bedtimeRepeatMs / 2, ease: SINE, yoyo: true, onComplete: () => img.setScale(s) });
  }

  private nudge(): void {
    this.squash(this.shown ? this.shiba.get(this.shown) : undefined);
  }

  /** Little stars fade in at the window and then twinkle softly (they stay lit under reduced motion). */
  private stars(): void {
    STAR_ANCHORS.forEach((id, i) => {
      const at = this.anchor(id);
      if (!at) return;
      const scales = Tokens.ui.bedtimeStarScales;
      const st = this.particle(FRAMES.star, at, scales[i % scales.length]!, depth('star'))?.setAlpha(0);
      if (!st) return;
      this.tweens.add({ targets: st, alpha: 1, duration: Tokens.Timing.bedtimeStarsMs, delay: i * Tokens.Timing.bedtimeStarStaggerMs, ease: SINE });
      if (!this.reduced) {
        this.addAmbient(this.tweens.add({ targets: st, alpha: Tokens.ui.bedtimeBreatheAlpha, duration: Tokens.Timing.bedtimeTwinkleMs / 2, delay: Tokens.Timing.bedtimeStarsMs + i * Tokens.Timing.bedtimeTwinkleStaggerMs, ease: SINE, yoyo: true, repeat: -1 }));
      }
    });
  }

  /** One "z" rises from the sleeping head, drifting right, and fades (it only fades in and out under reduced motion). */
  private floatZ(): void {
    const head = this.anchor(ANCHORS.headSleep);
    if (!head) return;
    const u = Tokens.ui;
    const at = { x: head.x + u.bedtimeZOffsetPx, y: head.y - u.bedtimeZOffsetPx };
    const z = this.particle(FRAMES.z, at, u.bedtimeZScale, depth('z'))?.setAlpha(0);
    if (!z) return;
    const rise = this.reduced ? 0 : u.bedtimeZRisePx;
    const half = Tokens.Timing.bedtimeZMs / 2;
    this.tweens.chain({
      targets: z,
      tweens: [
        { alpha: 1, x: at.x + rise / 2 / 2, y: at.y - rise / 2, scale: u.bedtimeZScaleEnd / this.layout.renderScale, duration: half, ease: SINE },
        { alpha: 0, x: at.x + rise / 2, y: at.y - rise, duration: half, ease: SINE, onComplete: () => z.destroy() },
      ],
    });
  }
}
