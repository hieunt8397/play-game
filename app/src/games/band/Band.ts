// Ban nhạc (Story 7.3): a yard game (the yard's `stage` corner). Five instruments stand on a small stage: trống,
// kèn, the singer frog, đàn gõ and chuông. Each tap plays the instrument's next note of one shared pentatonic scale
// and the instrument bounces; several fingers play several instruments at once (the only multi-touch scene:
// createTapRouter `multiTouch`). After a quiet while a soft beat starts and one instrument at a time bobs to it;
// a tap near the beat shows a small sparkle. No songs, no score, no round end: the band starts in free play
// (MiniGameBase.startFreePlay) and Home goes back to the yard (`round:leave`).
// The scene only wires Phaser: the plate, one image per instrument (full-frame, on its bottom-centre pivot), one
// multi-touch tap target per instrument (its hull from the layout), tweens, the music channel (the island loop
// makes way for the beat while the band plays) and the pure controller (round.ts) that decides everything.
import type { GameObjects } from 'phaser';
import { ATLASES, BACKGROUNDS } from '../../content/assets';
import { BAND_INSTRUMENTS, BEAT_MUSIC, INVITE_LINE, NOTE_PATTERN, instrumentFrame } from '../../content/games/band';
import type { Point, ScreenLayout } from '../../content/layout-types';
import { LAYOUTS } from '../../content/layouts';
import { audio } from '../../core/audio-director';
import { bus } from '../../core/bus';
import { pointInPolygon } from '../../core/input/polygon';
import { createTapRouter } from '../../core/input/tap-router';
import { createTapTarget } from '../../core/input/tap-target';
import { amplitude, prefersReducedMotion } from '../../core/reduced-motion';
import { Tokens } from '../../core/tokens';
import { sparkle } from '../../core/ui/sparkle';
import { originFor, type TrimmedRect } from '../../core/ui/sprite-pivot';
import { MiniGameBase } from '../mini-game-base';
import { createBandController, type BandController } from './round';

interface FrameData {
  readonly spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

const SINE_IN_OUT = 'Sine.easeInOut';
/** Draw order: the instruments, then the sparkles. */
const Depth = { instrument: 1, sparkle: 2 } as const;

interface InstrumentView {
  readonly img: GameObjects.Image | undefined;
  /** Its frame's visible rect (design px). */
  readonly rect: TrimmedRect | undefined;
  /** Its resting position (the bottom-centre pivot). */
  readonly home: Point | undefined;
}

export class Band extends MiniGameBase<'band'> {
  private layout: ScreenLayout = LAYOUTS.band;
  private band: BandController | undefined;
  private views: InstrumentView[] = [];
  private warned = new Set<string>();
  /** The music loop playing before the band (the island's), restored when the band closes. */
  private outerMusic: string | undefined;

  constructor() {
    super('band');
  }

  protected build(): void {
    // No round, no score: free play from the start (Home → round:leave, back to the yard).
    this.startFreePlay();
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS.band;
    this.views = [];
    // The stage is quiet but for the band: the island loop fades out (the beat uses the music channel, ducked
    // under every voice line) and fades back in when the band closes.
    this.outerMusic = audio.musicId;
    audio.fadeOutMusic(Tokens.Timing.bandMusicFadeMs);

    const rs = this.layout.renderScale;
    const bg = BACKGROUNDS.band;
    if (this.textures.exists(bg.key)) this.add.image(0, 0, bg.key).setOrigin(0).setScale(1 / rs);
    else this.warnOnce(bg.key, `band: texture "${bg.key}" is missing — plate skipped`);

    const router = createTapRouter(this, { multiTouch: { pointers: Tokens.ui.bandVoiceCap } });
    this.attachReactions(router);
    const band = createBandController({
      instruments: BAND_INSTRUMENTS,
      pattern: NOTE_PATTERN,
      inviteLine: INVITE_LINE,
      reduced: this.reduced,
      audio: {
        note: (id) => audio.note(id, Tokens.ui.bandVoiceCap),
        startBeat: () => audio.music(BEAT_MUSIC),
        stopBeat: () => {
          if (audio.musicId === BEAT_MUSIC) audio.fadeOutMusic(Tokens.Timing.bandBeatFadeMs);
        },
        // The sparkle window follows the loop itself (review: never the scene clock alone).
        beatPositionMs: () => (audio.musicId === BEAT_MUSIC ? audio.musicPositionMs : undefined),
        say: (id) => audio.say(id),
        setPrompt: (id) => audio.setPrompt(id),
      },
      view: {
        bounce: (i) => this.bounce(i),
        bob: (i) => this.bob(i),
        sparkle: (i) => this.sparkleAt(i),
      },
    });
    this.band = band;

    BAND_INSTRUMENTS.forEach((inst, i) => {
      this.views.push(this.placeInstrument(instrumentFrame(inst.id)));
      const hull = this.layout.hits[inst.id];
      if (!hull) {
        this.warnOnce(`hit.${inst.id}`, `band: hit "${inst.id}" is missing from the layout`);
        return;
      }
      createTapTarget(router, { area: { contains: (p) => pointInPolygon(p, hull) }, onPress: () => this.band?.tap(i) });
    });

    // The parent invitation (at most once; never on a resumed start) waits until the voice is quiet.
    let invitePending = true;
    const inviteWhenQuiet = (): void => {
      if (!invitePending || audio.voiceBusy) return;
      invitePending = false;
      this.inviteParent();
    };
    bus.scoped(this).on('speech:ended', () => inviteWhenQuiet());
    this.events.once('shutdown', () => this.silence(true));
    band.start();
  }

  protected progress(): { questionIndex: number; partial: Record<string, never> } {
    return { questionIndex: 0, partial: {} };
  }

  /** Home: the beat and every note stop at once, then the base leaves (`round:leave`). */
  protected override leave(): void {
    this.silence(false);
    super.leave();
  }

  override update(_time: number, delta: number): void {
    // The band plays in free play (inert from the start): the controller's own `stop` ends it.
    this.band?.tick(delta);
  }

  /** The band stops: no beat, no note; on shutdown the island loop comes back and the prompt is forgotten. */
  private silence(closing: boolean): void {
    this.band?.stop();
    audio.stopNotes();
    if (audio.musicId === BEAT_MUSIC) audio.fadeOutMusic(Tokens.Timing.bandBeatFadeMs);
    if (!closing) return;
    audio.clearPrompt(INVITE_LINE);
    if (this.outerMusic !== undefined) audio.music(this.outerMusic, Tokens.Timing.bandMusicFadeMs);
    this.outerMusic = undefined;
  }

  private warnOnce(what: string, msg: string): void {
    if (this.warned.has(what)) return;
    this.warned.add(what);
    console.warn(msg);
  }

  private frameRect(frame: string): TrimmedRect | undefined {
    const key = ATLASES.band.key;
    if (!this.textures.exists(key) || !this.textures.get(key).has(frame)) return undefined;
    const ss = (this.textures.get(key).get(frame).customData as FrameData | undefined)?.spriteSourceSize;
    const rs = this.layout.renderScale;
    return ss ? { x: ss.x / rs, y: ss.y / rs, width: ss.w / rs, height: ss.h / rs } : undefined;
  }

  /** A full-frame image of `frame` on its visible bottom centre (the bounce and bob pivot). */
  private placeInstrument(frame: string): InstrumentView {
    const rect = this.frameRect(frame);
    if (!rect) {
      this.warnOnce(frame, `band: frame "${frame}" is missing`);
      return { img: undefined, rect: undefined, home: undefined };
    }
    const rs = this.layout.renderScale;
    const pivot = { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    const o = originFor(pivot, this.layout.design);
    const img = this.add.image(pivot.x, pivot.y, ATLASES.band.key, frame).setScale(1 / rs).setOrigin(o.x, o.y).setDepth(Depth.instrument);
    return { img, rect, home: pivot };
  }

  // --- the controller's view ---------------------------------------------------------------------------------

  /** A tapped instrument grows on its feet and springs back (a smaller bounce under reduced motion). */
  private bounce(i: number): void {
    const v = this.views[i];
    if (!v?.img || !v.home) return;
    const rs = this.layout.renderScale;
    this.tweens.killTweensOf(v.img);
    v.img.setPosition(v.home.x, v.home.y).setScale(1 / rs);
    const peak = amplitude(Tokens.ui.bandBounceScale, this.reduced);
    this.tweens.add({ targets: v.img, scale: peak / rs, duration: Tokens.Timing.bandBounceMs / 2, ease: 'Quad.easeOut', yoyo: true });
  }

  /** One gentle bob to the beat (up and back on its feet); the controller never asks under reduced motion. */
  private bob(i: number): void {
    const v = this.views[i];
    if (!v?.img || !v.home) return;
    this.tweens.killTweensOf(v.img);
    v.img.setPosition(v.home.x, v.home.y).setScale(1 / this.layout.renderScale);
    this.tweens.add({ targets: v.img, y: v.home.y - Tokens.ui.bandBobPx, duration: Tokens.Timing.bandBobMs / 2, ease: SINE_IN_OUT, yoyo: true });
  }

  /** A small burst of stars over the instrument's top (they only fade under reduced motion). */
  private sparkleAt(i: number): void {
    const r = this.views[i]?.rect;
    if (!r) return;
    sparkle(this, { x: r.x + r.width / 2, y: r.y }, { radius: Tokens.ui.bandSparkleRisePx, durationMs: Tokens.Timing.bandSparkleMs, depth: Depth.sparkle, reduced: this.reduced });
  }
}
