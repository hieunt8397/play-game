// Chạm là nói (Stories 4.5, 4.6; 2026-10-21 six scenes): scenes full of things (the beach, the street, the
// kitchen, the bathroom, the bakery, the picnic); the child taps anything, it bounces and makes its sound,
// then its Vietnamese name is said. No request, no right or wrong, no round end: Home is the only way out.
// Six scene bubbles on the right edge (two columns of three, core/scene-bubbles.ts) switch scenes (a
// slide, a crossfade under reduced motion). Touching never grants anything (parent decision 2026-10-21).
// The scene only wires Phaser: one Container per scene (plate + props on their trimmed centres), one tap
// target per prop (its hull from the layout, live only in the current scene), the bubbles, tweens, and the pure controller (talk.ts) that decides everything.
import type { GameObjects } from 'phaser';
import { ATLASES } from '../../content/assets';
import { TOUCH_TALK_SCENES, TOUCH_TALK_SCENE_SLOTS, propFrames, propHit, sceneThumbFrame, type TouchTalkScene } from '../../content/games/touch-talk';
import type { ScreenLayout } from '../../content/layout-types';
import { LAYOUTS } from '../../content/layouts';
import { audio } from '../../core/audio-director';
import { bus } from '../../core/bus';
import { hudLayout } from '../../core/hud';
import { pointInPolygon } from '../../core/input/polygon';
import { NO_INSETS, currentView, designInsets, visibleDesignRect } from '../../core/input/space';
import { createTapRouter, type TapRouter } from '../../core/input/tap-router';
import { createTapTarget, type TapTarget } from '../../core/input/tap-target';
import { amplitude, prefersReducedMotion } from '../../core/reduced-motion';
import { mulberry32 } from '../../core/rng';
import { sceneBubbleCentres } from '../../core/scene-bubbles';
import { Tokens } from '../../core/tokens';
import { originFor, trimmedCentre, type TrimmedRect } from '../../core/ui/sprite-pivot';
import { MiniGameBase } from '../mini-game-base';
import { createTalkController, resumeTalk, type TalkController, type TalkProgress } from './talk';

interface FrameData {
  readonly spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

/** The wiggle: 0 → +θ → −θ → +θ → 0 (fractions of θ per step). */
const WIGGLE_STEPS = [1, -1, 1, 0] as const;
const RESIZE = 'resize';
const POP_SFX = 'sfx.shell.pop';
const SINE_IN_OUT = 'Sine.easeInOut';
/** Draw order: the scenes (the incoming one above in a crossfade), the bubbles (the Hud scene is above all). */
const LAYERS = ['scene', 'sceneFront', 'bubbles'] as const;
const Depth = Object.fromEntries(LAYERS.map((name, i) => [name, i + 1])) as Readonly<Record<(typeof LAYERS)[number], number>>;

interface Bubble {
  readonly box: GameObjects.Container;
  readonly ring: GameObjects.Graphics;
  readonly target: TapTarget;
}

export class TouchTalk extends MiniGameBase<'touch-talk'> {
  private layout: ScreenLayout = LAYOUTS['touch-talk'];
  private router: TapRouter | undefined;
  private talk: TalkController | undefined;
  private containers: GameObjects.Container[] = [];
  private props = new Map<string, GameObjects.Image>();
  private bubbles: Bubble[] = [];
  private warned = new Set<string>();

  constructor() {
    super('touch-talk');
  }

  protected build(): void {
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS['touch-talk'];
    this.props = new Map();
    this.containers = [];
    this.bubbles = [];
    const scenes = TOUCH_TALK_SCENES;
    const resume = resumeTalk(this.resumeAt, scenes);
    if (this.resumeAt && !resume) console.warn('touch-talk: bad resume — a clean start at the first scene');
    if (resume) this.acceptResume();

    const router = createTapRouter(this);
    this.router = router;
    // Story 5.4: background only — a tap on no prop or bubble shows the light ripple (props keep their own reaction).
    this.attachReactions(router);
    const talk = createTalkController({
      scenes,
      rng: mulberry32(this.seed >>> 0),
      resume,
      audio: { sfx: (id) => audio.sfx(id), say: (id) => audio.say(id), setPrompt: (id) => audio.setPrompt(id) },
      view: { bounce: (id) => this.bounce(id), wiggle: (id) => this.wiggle(id), slide: (from, to) => this.slide(from, to) },
    });
    this.talk = talk;
    router.onAnyTap = () => talk.anyTap();
    scenes.forEach((s, i) => this.containers.push(this.drawScene(s, i === talk.current)));
    this.drawBubbles();

    const scoped = bus.scoped(this);
    // Story 5.7: touch-talk has no questions, so it is free play from the start. The parent invitation
    // (at most once; never on a resumed start) waits until the voice channel is quiet, so it never cuts
    // a line still playing as the scene opens.
    let invitePending = true;
    const inviteWhenQuiet = (): void => {
      if (!invitePending || audio.voiceBusy) return;
      invitePending = false;
      this.inviteParent();
    };
    scoped.on('speech:ended', ({ token }) => {
      talk.speechEnded(token);
      inviteWhenQuiet();
    });
    const relayout = (): void => this.placeBubbles();
    this.scale.on(RESIZE, relayout);
    this.events.once('shutdown', () => {
      this.scale.off(RESIZE, relayout);
      // The Map Speaker must never replay a prop's name.
      audio.clearPrompt();
    });
    talk.start();
    inviteWhenQuiet();
  }

  protected progress(): TalkProgress {
    return this.talk?.progress() ?? { questionIndex: 0, partial: { sceneId: TOUCH_TALK_SCENES[0]!.id, touchedIds: [] } };
  }

  override update(_time: number, delta: number): void {
    if (this.inert) return;
    this.talk?.tick(delta);
  }

  private warnOnce(what: string, msg: string): void {
    if (this.warned.has(what)) return;
    this.warned.add(what);
    console.warn(msg);
  }

  private frameRect(key: string, frame: string): TrimmedRect | undefined {
    if (!this.textures.exists(key) || !this.textures.get(key).has(frame)) return undefined;
    const ss = (this.textures.get(key).get(frame).customData as FrameData | undefined)?.spriteSourceSize;
    return ss ? { x: ss.x, y: ss.y, width: ss.w, height: ss.h } : undefined;
  }

  // --- scenes ---------------------------------------------------------------------------------------------

  /** One Container per scene: its plate and its props, each with a tap target on its hull (live only when current). */
  private drawScene(scene: TouchTalkScene, visible: boolean): GameObjects.Container {
    const rs = this.layout.renderScale;
    const box = this.add.container(0, 0).setDepth(Depth.scene).setVisible(visible);
    if (this.textures.exists(scene.bg.key)) box.add(this.add.image(0, 0, scene.bg.key).setOrigin(0).setScale(1 / rs));
    else this.warnOnce(scene.bg.key, `touch-talk: texture "${scene.bg.key}" is missing — plate skipped`);
    const key = ATLASES['touch-talk'].key;
    const imgs: GameObjects.Image[] = [];
    for (const prop of scene.props) {
      const frames = propFrames(prop.id);
      const rect = this.frameRect(key, frames.idle);
      if (rect) {
        const c = trimmedCentre(rect, rs);
        const o = originFor(c, this.layout.design);
        const img = this.add.image(c.x, c.y, key, frames.idle).setOrigin(o.x, o.y).setScale(1 / rs);
        img.setData('depth', c.y);
        imgs.push(img);
        this.props.set(prop.id, img);
      } else this.warnOnce(frames.idle, `touch-talk: frame "${frames.idle}" is missing`);
      const hull = this.layout.hits[propHit(prop.id)];
      if (!hull) {
        this.warnOnce(prop.id, `touch-talk: hit "${propHit(prop.id)}" is missing from the layout`);
        continue;
      }
      if (this.router) createTapTarget(this.router, { area: { contains: (p) => (this.talk?.isActive(prop.id) ?? false) && pointInPolygon(p, hull) }, onPress: () => this.talk?.tap(prop.id) });
    }
    // Within a container, the props draw back to front by their pivot y.
    imgs.sort((a, b) => (a.getData('depth') as number) - (b.getData('depth') as number));
    box.add(imgs);
    return box;
  }

  /** The outgoing scene slides out and the incoming one in (a crossfade under reduced motion). */
  private slide(from: number, to: number): void {
    const out = this.containers[from];
    const inc = this.containers[to];
    if (!out || !inc) return;
    const ms = Tokens.Timing.touchTalkSceneSlideMs;
    this.tweens.killTweensOf([out, inc]);
    this.drawRings(to);
    if (this.reduced) {
      inc.setPosition(0, 0).setAlpha(0).setVisible(true).setDepth(Depth.sceneFront);
      out.setDepth(Depth.scene);
      this.tweens.add({ targets: inc, alpha: 1, duration: ms, ease: SINE_IN_OUT, onComplete: () => out.setVisible(false).setAlpha(1) });
      return;
    }
    const w = this.cameras.main.worldView.width || this.layout.design.width;
    const dir = Math.sign(to - from);
    inc.setPosition(dir * w, 0).setAlpha(1).setVisible(true);
    this.tweens.add({ targets: out, x: -dir * w, duration: ms, ease: SINE_IN_OUT, onComplete: () => out.setVisible(false).setPosition(0, 0) });
    this.tweens.add({ targets: inc, x: 0, duration: ms, ease: SINE_IN_OUT });
  }

  // --- props ------------------------------------------------------------------------------------------------

  /** The tap feedback: the react frame and a 1 → react.scale → 1 bounce (reduced amplitude), then idle. */
  private bounce(id: string): void {
    const img = this.props.get(id);
    if (!img) return;
    const rs = this.layout.renderScale;
    const react = Tokens.components.tappableProp.react;
    const frames = propFrames(id);
    const key = ATLASES['touch-talk'].key;
    this.tweens.killTweensOf(img);
    img.setScale(1 / rs).setAngle(0);
    if (this.frameRect(key, frames.react)) img.setFrame(frames.react, false, false);
    const peak = amplitude(react.scale, this.reduced);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: react.durationMs,
      onUpdate: (t) => img.setScale((1 + (peak - 1) * Math.sin(Math.PI * (t.getValue() ?? 0))) / rs),
      onComplete: () => {
        img.setScale(1 / rs);
        if (this.frameRect(key, frames.idle)) img.setFrame(frames.idle, false, false);
      },
    });
  }

  /** A silent idle wiggle: 0 → +θ → −θ → +θ → 0 over touchTalkWiggleMs (θ reduced under reduced motion). */
  private wiggle(id: string): void {
    const img = this.props.get(id);
    if (!img) return;
    this.tweens.killTweensOf(img);
    const deg = this.reduced ? Tokens.ui.touchTalkWiggleDeg * Tokens.ui.reducedMotionAmplitude : Tokens.ui.touchTalkWiggleDeg;
    this.tweens.chain({
      targets: img,
      tweens: WIGGLE_STEPS.map((k) => ({ angle: k * deg, duration: Tokens.Timing.touchTalkWiggleMs / WIGGLE_STEPS.length, ease: SINE_IN_OUT })),
    });
  }

  // --- scene bubbles ------------------------------------------------------------------------------------------

  private bubbleCentres(): { x: number; y: number }[] {
    const view = currentView();
    const { width, height } = Tokens.design;
    const hud = view ? hudLayout(visibleDesignRect(view), designInsets(view)) : hudLayout({ x: 0, y: 0, w: width, h: height }, NO_INSETS);
    return sceneBubbleCentres(hud, TOUCH_TALK_SCENE_SLOTS);
  }

  /** One bubble per scene: a white disc with its shadow, the scene thumbnail, a tap target; the ring on the current one. */
  private drawBubbles(): void {
    const spec = Tokens.components.sceneBubble;
    const size = spec.base.size;
    const shadow = spec.base.shadow[0]!;
    const key = ATLASES['touch-talk'].key;
    const rs = this.layout.renderScale;
    TOUCH_TALK_SCENES.forEach((scene, i) => {
      const box = this.add.container(0, 0).setDepth(Depth.bubbles);
      box.add(this.add.circle(shadow.x, shadow.y, size / 2, shadow.color.value, shadow.color.alpha));
      box.add(this.add.circle(0, 0, size / 2, spec.background.value, spec.background.alpha));
      const thumb = sceneThumbFrame(scene.id);
      if (this.frameRect(key, thumb)) box.add(this.add.image(0, 0, key, thumb).setScale(1 / rs));
      else this.warnOnce(thumb, `touch-talk: frame "${thumb}" is missing`);
      const ring = this.add.graphics();
      box.add(ring);
      const target = this.router
        ? createTapTarget(this.router, { circle: { x: 0, y: 0, r: size / 2 }, onPress: () => this.bubbleTap(i) })
        : undefined;
      if (target) this.bubbles.push({ box, ring, target });
    });
    this.placeBubbles();
    this.drawRings(this.talk?.current ?? 0);
  }

  private placeBubbles(): void {
    const size = Tokens.components.sceneBubble.base.size;
    this.bubbleCentres().forEach((c, i) => {
      const b = this.bubbles[i];
      if (!b) return;
      b.box.setPosition(c.x, c.y);
      b.target.setCircle({ x: c.x, y: c.y, r: size / 2 });
    });
  }

  /** The static active ring (halo, line, core) on bubble `current` only. */
  private drawRings(current: number): void {
    const ring = Tokens.components.sceneBubble.activeRing;
    const r0 = Tokens.components.sceneBubble.base.size / 2;
    this.bubbles.forEach((b, i) => {
      b.ring.clear();
      if (i !== current) return;
      b.ring.lineStyle(ring.halo.width, ring.halo.color.value, ring.halo.color.alpha).strokeCircle(0, 0, r0 + ring.core.width + ring.line.width + ring.halo.width / 2);
      b.ring.lineStyle(ring.line.width, ring.line.color.value, ring.line.color.alpha).strokeCircle(0, 0, r0 + ring.core.width + ring.line.width / 2);
      b.ring.lineStyle(ring.core.width, ring.core.color.value, ring.core.color.alpha).strokeCircle(0, 0, r0 + ring.core.width / 2);
    });
  }

  /** A bubble press: a bounce and the pop at once, then the controller (a switch, or the scene's name again). */
  private bubbleTap(i: number): void {
    const b = this.bubbles[i];
    const talk = this.talk;
    if (!b || !talk) return;
    const react = Tokens.components.tappableProp.react;
    const peak = amplitude(react.scale, this.reduced);
    this.tweens.killTweensOf(b.box);
    b.box.setScale(1);
    this.tweens.addCounter({ from: 0, to: 1, duration: react.durationMs, onUpdate: (t) => b.box.setScale(1 + (peak - 1) * Math.sin(Math.PI * (t.getValue() ?? 0))), onComplete: () => b.box.setScale(1) });
    audio.sfx(POP_SFX);
    talk.sceneTap(i);
    this.drawRings(talk.current);
  }
}
