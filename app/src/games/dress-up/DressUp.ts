// Thay đồ cho Shiba (Story 8.2): a yard game (the yard's `wardrobe` corner). A wardrobe room: the chibi Shiba stands
// beside a standing mirror and an open wardrobe holds 4 hats, 3 glasses and 4 shirts. A tap on an item puts it on
// (one per slot; a new hat replaces the old one), Shiba reacts (turns to the mirror and smiles, hops with a tail wag,
// or giggles and wiggles: never the same twice in a row) and the item's name is said; a tap on a worn item takes it
// off (a small shake and a soft pop). Every change is saved at once (ProgressStore.setOutfit), so the map guide and
// the ice-cream Shiba wear it too. No judging. After Tokens.ui.dressUpRoundChanges changes the round completes
// (finishRoundAndStay: no next round) and free play goes on with the voice silent. Home goes back to the yard.
// The scene only wires Phaser: the plate, Shiba with its outfit layers (core/outfit-layers), the reflection (a clone
// of Shiba and its layers with a negative scaleX, masked by the glass hull), the icons and their tap circles, the
// worn halos, tweens and sounds; the decisions are the pure round model (round.ts).
import type { GameObjects, Tweens } from 'phaser';
import { ATLASES, BACKGROUNDS } from '../../content/assets';
import {
  ANCHORS,
  HITS,
  OUTFIT_ITEMS,
  PROMPT_LINE,
  REACTIONS,
  SFX,
  iconFrame,
  isWearReaction,
  itemHitRadius,
  shibaFrame,
  type Outfit,
  type OutfitItemId,
  type WearReaction,
} from '../../content/games/dress-up';
import type { Point, ScreenLayout } from '../../content/layout-types';
import { LAYOUTS } from '../../content/layouts';
import { audio } from '../../core/audio-director';
import { bus } from '../../core/bus';
import { pointInPolygon } from '../../core/input/polygon';
import { createTapRouter } from '../../core/input/tap-router';
import { createTapTarget } from '../../core/input/tap-target';
import { attachOutfit, type LayerImage, type OutfitLayers } from '../../core/outfit-layers';
import { ProgressStore } from '../../core/progress-store';
import type { ReactionSet } from '../../core/reactions';
import { amplitude, prefersReducedMotion } from '../../core/reduced-motion';
import { Tokens } from '../../core/tokens';
import { originFor, type TrimmedRect } from '../../core/ui/sprite-pivot';
import { MiniGameBase } from '../mini-game-base';
import { createDressUpRound, resumeDressUp, type DressUpRound } from './round';

interface FrameData {
  readonly spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

const SINE = 'Sine.easeInOut';
/** Ambient hold reason while Shiba reacts. */
const HOLD_REACT = 'dress-up-react';
/** Draw order, back to front: the halos, the icons, the reflection (and its layers), Shiba (and its layers). */
const LAYERS = ['glow', 'icon', 'mirror', 'shiba'] as const;
const depth = (layer: (typeof LAYERS)[number]): number => LAYERS.indexOf(layer) + 1;

export class DressUp extends MiniGameBase<'dress-up'> {
  private layout: ScreenLayout = LAYOUTS['dress-up'];
  private round: DressUpRound | undefined;
  private warned = new Set<string>();
  private shiba: GameObjects.Image | undefined;
  private shibaLayers: OutfitLayers | undefined;
  private mirror: GameObjects.Image | undefined;
  private mirrorLayers: OutfitLayers | undefined;
  private icons = new Map<OutfitItemId, { image: GameObjects.Image | undefined; at: Point; r: number; glow: GameObjects.Graphics | undefined }>();
  private anim: Tweens.Tween | undefined;
  private shibaAt: Point = { x: 0, y: 0 };
  /** The last line this game made the Speaker prompt (cleared on shutdown, and only it). */
  private prompt: string | undefined;

  constructor() {
    super('dress-up');
  }

  protected override reactionSet(): ReactionSet {
    return REACTIONS;
  }

  /** What Shiba wears now. */
  get outfit(): Outfit {
    return this.round?.outfit ?? {};
  }

  protected build(): void {
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS['dress-up'];
    this.warned = new Set();
    this.icons = new Map();
    this.anim = undefined;
    this.mirrorMask = undefined;
    this.masked = new WeakSet();
    const target = Tokens.ui.dressUpRoundChanges;
    const resume = resumeDressUp(this.resumeAt, target);
    if (this.resumeAt && !resume) console.warn('dress-up: bad resume — a fresh wardrobe');
    if (resume) this.acceptResume();
    this.round = createDressUpRound({ outfit: ProgressStore.outfit, roundChanges: target, changes: resume?.changes ?? 0 });

    const rs = this.layout.renderScale;
    const bg = BACKGROUNDS['dress-up'];
    if (this.textures.exists(bg.key)) this.add.image(0, 0, bg.key).setOrigin(0).setScale(1 / rs);
    else this.warnOnce(bg.key, `dress-up: texture "${bg.key}" is missing — plate skipped`);

    const router = createTapRouter(this);
    this.attachReactions(router);
    this.addIcons(router);
    this.addShiba();
    this.addMirror();
    for (const [hit, react] of [
      [HITS.shiba, (): void => this.react3('giggle-wiggle')],
      [HITS.mirror, (): void => this.react3('mirror-smile')],
    ] as const) {
      const hull = this.layout.hits[hit];
      if (!hull) {
        this.warnOnce(`hit.${hit}`, `dress-up: hit "${hit}" is missing from the layout`);
        continue;
      }
      createTapTarget(router, { area: { contains: (p) => pointInPolygon(p, hull) }, onPress: react });
    }

    // The invitation (a fresh start only; the Speaker replays it), then the parent invitation once the voice is quiet.
    this.prompt = PROMPT_LINE;
    audio.setPrompt(PROMPT_LINE);
    if (!resume) audio.say(PROMPT_LINE);
    let invitePending = true;
    bus.scoped(this).on('speech:ended', () => {
      if (!invitePending || audio.voiceBusy || this.inert) return;
      invitePending = false;
      this.inviteParent();
    });
    this.events.once('shutdown', () => {
      if (this.prompt !== undefined) audio.clearPrompt(this.prompt);
      this.prompt = undefined;
    });
  }

  protected progress(): { questionIndex: number; partial: { changes: number } } {
    return { questionIndex: 0, partial: { changes: this.round?.changes ?? 0 } };
  }

  /** A tap on an item's icon (its tap circle): wear it, swap it in, or take it off. Public for the scene tests. */
  tapItem(id: OutfitItemId): void {
    const round = this.round;
    if (!round) return;
    const change = round.tap(id);
    if (!change) return;
    ProgressStore.setOutfit(change.slot, change.kind === 'wear' ? change.id : null);
    this.shibaLayers?.set(round.outfit);
    this.mirrorLayers?.set(round.outfit);
    this.applyMask();
    this.updateGlows();
    this.bounceIcon(id);
    if (change.kind === 'wear') {
      audio.sfx(SFX.wear);
      if (change.line !== undefined && !this.freePlay) audio.say(change.line);
      this.react3(this.pickReaction('correct'));
    } else {
      audio.sfx(SFX.pop);
      this.shake();
    }
    if (change.completes) this.finishRoundAndStay();
  }

  // --- drawing ---------------------------------------------------------------------------------------------------

  private warnOnce(what: string, msg: string): void {
    if (this.warned.has(what)) return;
    this.warned.add(what);
    console.warn(msg);
  }

  private frameRect(frame: string): TrimmedRect | undefined {
    const key = ATLASES['dress-up'].key;
    if (!this.textures.exists(key) || !this.textures.get(key).has(frame)) {
      this.warnOnce(frame, `dress-up: frame "${frame}" is missing`);
      return undefined;
    }
    const ss = (this.textures.get(key).get(frame).customData as FrameData | undefined)?.spriteSourceSize;
    const rs = this.layout.renderScale;
    return ss ? { x: ss.x / rs, y: ss.y / rs, width: ss.w / rs, height: ss.h / rs } : undefined;
  }

  /** Each icon where it was rendered (pivot: its trimmed centre), its tap circle and its worn halo. */
  private addIcons(router: ReturnType<typeof createTapRouter>): void {
    const rs = this.layout.renderScale;
    const minR = Tokens.ui.dressUpItemHitPx / 2;
    for (const item of OUTFIT_ITEMS) {
      const frame = iconFrame(item.id);
      const rect = this.frameRect(frame);
      if (!rect) continue;
      const at = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      const r = itemHitRadius(Math.max(rect.width, rect.height) / 2, minR);
      const o = originFor(at, this.layout.design);
      const image = this.add.image(at.x, at.y, ATLASES['dress-up'].key, frame).setOrigin(o.x, o.y).setScale(1 / rs).setDepth(depth('icon'));
      const glow = this.add.graphics().setDepth(depth('glow')).setBlendMode('ADD');
      this.icons.set(item.id, { image, at, r, glow });
      createTapTarget(router, { area: { contains: (p) => Math.hypot(p.x - at.x, p.y - at.y) <= r }, onPress: () => this.tapItem(item.id) });
    }
    this.updateGlows(true);
  }

  private addShiba(): void {
    const anchor = this.layout.anchors[ANCHORS.shiba];
    if (!anchor || !this.frameRect(shibaFrame('idle'))) {
      this.warnOnce('shiba', `dress-up: Shiba (frame "${shibaFrame('idle')}" or anchor "${ANCHORS.shiba}") is missing`);
      return;
    }
    const o = originFor(anchor, this.layout.design);
    this.shibaAt = anchor;
    this.shiba = this.add.image(anchor.x, anchor.y, ATLASES['dress-up'].key, shibaFrame('idle')).setOrigin(o.x, o.y).setScale(1 / this.layout.renderScale).setDepth(depth('shiba'));
    this.shibaLayers = attachOutfit(this, this.shiba as unknown as LayerImage, ATLASES['dress-up'].key, this.outfit);
    this.breathe();
  }

  /**
   * The reflection: Shiba's own frame (and its outfit layers) drawn at anchor.mirror with a negative scaleX (never
   * flipX: the full-frame origin mirrors about the ground pivot), smaller, masked by the glass hull where the renderer
   * supports a mask filter (WebGL). It follows Shiba's frame, bounce and angle every POST_UPDATE.
   */
  private addMirror(): void {
    const shiba = this.shiba;
    const at = this.layout.anchors[ANCHORS.mirror];
    if (!shiba || !at) {
      if (!at) this.warnOnce('anchor.mirror', `dress-up: anchor "${ANCHORS.mirror}" is missing from the layout`);
      return;
    }
    const k = Tokens.ui.dressUpMirrorScale;
    const img = this.add.image(at.x, at.y, ATLASES['dress-up'].key, shiba.frame.name).setOrigin(shiba.originX, shiba.originY).setDepth(depth('mirror'));
    this.mirror = img;
    this.mirrorLayers = attachOutfit(this, img as unknown as LayerImage, ATLASES['dress-up'].key, this.outfit);
    const follow = (): void => {
      if (img.frame.name !== shiba.frame.name) this.mirrorLayers?.setFrame(shiba.frame.name);
      img.setPosition(at.x + (this.shibaAt.x - shiba.x) * k, at.y + (shiba.y - this.shibaAt.y) * k);
      img.setScale(-k * shiba.scaleX, k * shiba.scaleY);
      img.setAngle(-shiba.angle).setAlpha(Tokens.ui.dressUpMirrorAlpha);
      this.mirrorLayers?.sync();
    };
    follow();
    this.events.on('postupdate', follow);
    this.events.once('shutdown', () => this.events.off('postupdate', follow));
    this.maskToGlass();
  }

  /** The glass hull as a WebGL mask filter on the reflection's images (skipped where filters are unavailable). */
  private maskToGlass(): void {
    const glass = this.layout.hits[HITS.mirrorGlass];
    if (!glass) {
      this.warnOnce('hit.mirror-glass', `dress-up: hit "${HITS.mirrorGlass}" is missing — the reflection is not masked`);
      return;
    }
    const make = (this as unknown as { make?: { graphics?: (o: object, add: boolean) => GameObjects.Graphics } }).make;
    const g = make?.graphics?.({}, false);
    if (!g) return;
    // The mask reads only alpha: any opaque colour.
    g.fillStyle(Tokens.art.dressUp.mirrorGlass.value, 1);
    g.beginPath();
    g.moveTo(glass[0]!.x, glass[0]!.y);
    for (const p of glass.slice(1)) g.lineTo(p.x, p.y);
    g.closePath();
    g.fillPath();
    this.mirrorMask = g;
    this.applyMask();
  }

  private mirrorMask: GameObjects.Graphics | undefined;
  private masked = new WeakSet<object>();

  /** Every reflection image (Shiba's clone and its layers, a new layer too) gets the glass mask once. */
  private applyMask(): void {
    const g = this.mirrorMask;
    if (!g || !this.mirror) return;
    for (const img of [this.mirror, ...(this.mirrorLayers?.images ?? [])] as object[]) {
      if (this.masked.has(img)) continue;
      this.masked.add(img);
      const f = img as { enableFilters?: () => { filters?: { external: { addMask(m: unknown): unknown } } | null } };
      try {
        f.enableFilters?.().filters?.external.addMask(g);
      } catch (error) {
        // The mask is an enhancement: the reflection is scaled to fit the glass anyway.
        this.warnOnce('mask', `dress-up: the mirror mask is unavailable (${String(error)})`);
      }
    }
  }

  /** The soft halo behind each worn item's icon (fades in and out). */
  private updateGlows(now = false): void {
    const worn = new Set(Object.values(this.outfit));
    for (const [id, icon] of this.icons) {
      const g = icon.glow;
      if (!g) continue;
      this.tweens.killTweensOf(g);
      if (worn.has(id)) {
        g.clear();
        const rings = Tokens.ui.dressUpGlowRings;
        const r = icon.r + Tokens.ui.dressUpGlowPadPx;
        for (let k = rings; k >= 1; k--) {
          g.fillStyle(Tokens.art.dressUp.glow.value, Tokens.ui.dressUpGlowAlpha / rings);
          g.fillCircle(icon.at.x, icon.at.y, (r * k) / rings);
        }
      }
      const alpha = worn.has(id) ? 1 : 0;
      if (now) g.setAlpha(alpha);
      else this.tweens.add({ targets: g, alpha, duration: Tokens.Timing.dressUpFadeMs, ease: SINE });
    }
  }

  private bounceIcon(id: OutfitItemId): void {
    const img = this.icons.get(id)?.image;
    if (!img) return;
    const s = 1 / this.layout.renderScale;
    this.tweens.killTweensOf(img);
    img.setScale(s);
    this.tweens.add({ targets: img, scale: s * amplitude(Tokens.ui.dressUpIconBounce, this.reduced), duration: Tokens.Timing.dressUpIconBounceMs / 2, ease: SINE, yoyo: true, onComplete: () => img.setScale(s) });
  }

  /** Breathing: scaleY 1 ↔ shibaBreathScale around the ground pivot (paused while Shiba reacts). */
  private breathe(): void {
    const img = this.shiba;
    if (!img) return;
    const base = 1 / this.layout.renderScale;
    this.addAmbient(
      this.tweens.add({ targets: img, scaleY: base * amplitude(Tokens.ui.shibaBreathScale, this.reduced), duration: Tokens.Timing.shibaBreathMs / 2, ease: SINE, yoyo: true, repeat: -1 }),
    );
  }

  // --- reactions (a new one restarts: never queued) ---------------------------------------------------------------

  /** Runs one Shiba reaction over `ms`: `onUpdate(v)` draws progress v ∈ [0, 1]; then the idle frame and the rest pose. */
  private animate(ms: number, onUpdate: (v: number, img: GameObjects.Image) => void): void {
    const img = this.shiba;
    if (!img) return;
    const base = 1 / this.layout.renderScale;
    this.anim?.stop();
    this.holdAmbient(HOLD_REACT, true);
    const rest = (): void => {
      this.shibaLayers?.setFrame(shibaFrame('idle'));
      img.setPosition(this.shibaAt.x, this.shibaAt.y).setScale(base).setAngle(0);
    };
    rest();
    const anim = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: ms,
      onUpdate: (t) => onUpdate(t.getValue() ?? 0, img),
      onComplete: () => {
        if (this.anim !== anim) return;
        this.anim = undefined;
        rest();
        this.holdAmbient(HOLD_REACT, false);
      },
    });
    this.anim = anim;
  }

  /** The frame of a 2-frame state that alternates every Timing.dressUpFrameMs. */
  private alternate(state: 'happy' | 'turn', elapsedMs: number): string {
    return shibaFrame(state, Math.floor(elapsedMs / Tokens.Timing.dressUpFrameMs) % 2);
  }

  private react3(id: string | undefined): void {
    const pick: WearReaction = isWearReaction(id) ? id : 'mirror-smile';
    const t = Tokens.Timing;
    const u = Tokens.ui;
    const set = (frame: string): void => {
      if (this.shiba?.frame.name !== frame) this.shibaLayers?.setFrame(frame);
    };
    switch (pick) {
      case 'mirror-smile': {
        // Turn to the mirror (turn/00), then smile at it (turn/01), held; back to idle.
        const ms = t.dressUpTurnMs;
        this.animate(ms, (v) => set(shibaFrame('turn', v * ms < 2 * t.dressUpFrameMs ? 0 : 1)));
        return;
      }
      case 'hop-wag': {
        const ms = t.dressUpHopMs;
        const hop = u.dressUpHopPx * (this.reduced ? u.reducedMotionAmplitude : 1);
        audio.sfx(SFX.hop);
        this.animate(ms, (v, img) => {
          set(this.alternate('happy', v * ms));
          img.setY(this.shibaAt.y - hop * Math.sin(Math.PI * v));
        });
        return;
      }
      case 'giggle-wiggle': {
        const ms = t.dressUpGiggleMs;
        const deg = u.dressUpWiggleDeg * (this.reduced ? u.reducedMotionAmplitude : 1);
        audio.sfx(SFX.giggle);
        this.animate(ms, (v, img) => {
          set(this.alternate('happy', v * ms));
          img.setAngle(deg * Math.sin(2 * Math.PI * u.dressUpShakes * v) * (1 - v));
        });
        return;
      }
      default: {
        const unknown: never = pick;
        console.warn(`dress-up: no routine for reaction "${String(unknown)}"`);
      }
    }
  }

  /** The take-off: a small side-to-side shake (smaller under reduced motion). */
  private shake(): void {
    const u = Tokens.ui;
    const dx = u.dressUpShakePx * (this.reduced ? u.reducedMotionAmplitude : 1);
    this.animate(Tokens.Timing.dressUpShakeMs, (v, img) => img.setX(this.shibaAt.x + dx * Math.sin(2 * Math.PI * u.dressUpShakes * v) * (1 - v)));
  }
}
