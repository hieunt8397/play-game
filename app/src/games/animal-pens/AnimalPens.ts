// Ú òa chuồng thú (Story 7.2): a yard game (the yard's `pen` corner). Four pen doors stand in a row; each hides
// one real animal. A tap opens a door: the animal peeks out, its real call plays, then its name. A tap on an
// open door closes it and a different animal goes behind it. Now and then a closed door wiggles with the
// muffled call of the animal inside, and the voice asks "Con gì kêu meo meo nhỉ?" (that door wiggles harder).
// Any door is fine: no right or wrong, no score, no fail sound. After REVEALS_PER_ROUND reveals every door opens
// and the animals hop, the round completes, and the next round follows (continuous play, MiniGameBase).
// The scene only wires Phaser: the plate, one door sprite and one animal sprite per door (the frames are
// rendered at door 1 and shifted by the door anchors: the plate's camera is orthographic), one tap target per
// door (its hull from the layout), tweens, and the pure controller (round.ts) that decides everything.
import type { GameObjects } from 'phaser';
import { ATLASES, BACKGROUNDS } from '../../content/assets';
import {
  DOOR_COUNT,
  DOOR_FRAMES,
  DOOR_IDS,
  INVITE_LINE,
  PEN_ANIMALS,
  REVEALS_PER_ROUND,
  peekFrame,
} from '../../content/games/animal-pens';
import type { Point } from '../../content/layout-types';
import type { ScreenLayout } from '../../content/layout-types';
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
import { createPensController, resumePens, type PensController, type PensProgress } from './round';

interface FrameData {
  readonly spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

/** The wiggle: 0 → +θ → −θ → +θ → −θ → 0 (fractions of θ per step). */
const WIGGLE_STEPS = [1, -1, 1, -1, 0] as const;
const SINE_IN_OUT = 'Sine.easeInOut';
const HAPPY_SFX = 'sfx.shell.happy';
/** Draw order: the animals (behind), then the doors. */
const Depth = { animal: 1, door: 2 } as const;

interface DoorView {
  readonly door: GameObjects.Image | undefined;
  readonly animal: GameObjects.Image | undefined;
  /** This door's shift from door 1 (design px). */
  readonly dx: number;
  readonly dy: number;
}

export class AnimalPens extends MiniGameBase<'animal-pens'> {
  private layout: ScreenLayout = LAYOUTS['animal-pens'];
  private pens: PensController | undefined;
  private doors: DoorView[] = [];
  private warned = new Set<string>();
  /** The last line this game made the Speaker prompt (cleared on shutdown, and only it). */
  private prompt: string | undefined;

  constructor() {
    super('animal-pens');
  }

  protected build(): void {
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.reduced = prefersReducedMotion(window);
    this.layout = LAYOUTS['animal-pens'];
    this.doors = [];
    const resume = resumePens(this.resumeAt, PEN_ANIMALS, DOOR_COUNT, REVEALS_PER_ROUND);
    if (this.resumeAt && !resume) console.warn('animal-pens: bad resume — a fresh round');
    if (resume) this.acceptResume();

    const rs = this.layout.renderScale;
    const bg = BACKGROUNDS['animal-pens'];
    if (this.textures.exists(bg.key)) this.add.image(0, 0, bg.key).setOrigin(0).setScale(1 / rs);
    else this.warnOnce(bg.key, `animal-pens: texture "${bg.key}" is missing — plate skipped`);

    const router = createTapRouter(this);
    this.attachReactions(router);
    const pens = createPensController({
      animals: PEN_ANIMALS,
      doors: DOOR_COUNT,
      revealsPerRound: REVEALS_PER_ROUND,
      inviteLine: INVITE_LINE,
      rng: mulberry32(this.seed >>> 0),
      resume,
      audio: { sfx: (id) => audio.sfx(id), say: (id) => audio.say(id), setPrompt: (id) => {
          this.prompt = id;
          audio.setPrompt(id);
        },
      },
      view: {
        open: (d, id) => this.openDoor(d, id),
        close: (d) => this.closeDoor(d),
        wiggle: (d, hard) => this.wiggle(d, hard),
        celebrate: (behind) => this.celebrate(behind),
      },
      // Review: from the last reveal on, Home completes the round (never abandons a finished round).
      onLastReveal: () => this.markFinishing(),
      onRoundEnd: () => this.scheduleFinish(Tokens.Timing.animalPensCelebrateMs),
    });
    this.pens = pens;
    router.onAnyTap = () => pens.anyTap();

    const first = this.layout.anchors[DOOR_IDS[0]!];
    DOOR_IDS.forEach((id, d) => {
      const at = this.layout.anchors[id];
      const dx = at && first ? at.x - first.x : 0;
      const dy = at && first ? at.y - first.y : 0;
      if (!at) this.warnOnce(id, `animal-pens: anchor "${id}" is missing from the layout`);
      const animal = this.placeImage(peekFrame(pens.behind[d]!), dx, dy)?.setDepth(Depth.animal).setVisible(false);
      const door = this.placeImage(DOOR_FRAMES.closed, dx, dy)?.setDepth(Depth.door);
      this.doors.push({ door, animal, dx, dy });
      const hull = this.layout.hits[id];
      if (!hull) {
        this.warnOnce(`hit.${id}`, `animal-pens: hit "${id}" is missing from the layout`);
        return;
      }
      createTapTarget(router, { area: { contains: (p) => pointInPolygon(p, hull) }, onPress: () => this.pens?.tap(d) });
    });

    // The parent invitation (at most once; never on a resumed start) waits until the voice is quiet.
    let invitePending = true;
    const inviteWhenQuiet = (): void => {
      if (!invitePending || audio.voiceBusy || this.inert) return;
      invitePending = false;
      this.inviteParent();
    };
    bus.scoped(this).on('speech:ended', ({ token }) => {
      pens.speechEnded(token);
      inviteWhenQuiet();
    });
    // The Speaker must never replay one of this game's lines after it.
    this.events.once('shutdown', () => {
      if (this.prompt !== undefined) audio.clearPrompt(this.prompt);
    });
    pens.start();
  }

  protected progress(): PensProgress {
    return this.pens?.progress() ?? { questionIndex: 0, partial: { behind: [], reveals: 0 } };
  }

  override update(_time: number, delta: number): void {
    if (this.inert) return;
    this.pens?.tick(delta);
  }

  private warnOnce(what: string, msg: string): void {
    if (this.warned.has(what)) return;
    this.warned.add(what);
    console.warn(msg);
  }

  private frameRect(frame: string): TrimmedRect | undefined {
    const key = ATLASES['animal-pens'].key;
    if (!this.textures.exists(key) || !this.textures.get(key).has(frame)) return undefined;
    const ss = (this.textures.get(key).get(frame).customData as FrameData | undefined)?.spriteSourceSize;
    return ss ? { x: ss.x, y: ss.y, width: ss.w, height: ss.h } : undefined;
  }

  /** The bottom centre of a frame's visible pixels (design px, at door 1). */
  private pivotOf(frame: string): Point | undefined {
    const r = this.frameRect(frame);
    const rs = this.layout.renderScale;
    return r ? { x: (r.x + r.width / 2) / rs, y: (r.y + r.height) / rs } : undefined;
  }

  /** A full-frame image of `frame` pivoting on its bottom centre, shifted by (dx, dy). */
  private placeImage(frame: string, dx: number, dy: number): GameObjects.Image | undefined {
    const p = this.pivotOf(frame);
    if (!p) {
      this.warnOnce(frame, `animal-pens: frame "${frame}" is missing`);
      return undefined;
    }
    const img = this.add.image(0, 0, ATLASES['animal-pens'].key, frame).setScale(1 / this.layout.renderScale);
    this.setFrameAt(img, frame, dx, dy);
    return img;
  }

  /** Shows `frame` on `img`, keeping the frame's own bottom-centre pivot (frames differ in their trims). */
  private setFrameAt(img: GameObjects.Image, frame: string, dx: number, dy: number): void {
    const p = this.pivotOf(frame);
    if (!p) return;
    const o = originFor(p, this.layout.design);
    img.setFrame(frame, false, false).setOrigin(o.x, o.y).setPosition(p.x + dx, p.y + dy);
  }

  // --- the controller's view ---------------------------------------------------------------------------------

  /** The door swings open (a quick squash to the open frame) and the animal pops up in the doorway. */
  private openDoor(d: number, animalId: string): void {
    const v = this.doors[d];
    if (!v) return;
    const ms = Tokens.Timing.animalPensDoorMs;
    const rs = this.layout.renderScale;
    if (v.door) this.swing(v, DOOR_FRAMES.open, ms);
    if (v.animal) {
      this.tweens.killTweensOf(v.animal);
      this.setFrameAt(v.animal, peekFrame(animalId), v.dx, v.dy);
      // It grows out of the doorway on its feet (its pivot), or fades in under reduced motion.
      const from = this.reduced ? 1 : Tokens.ui.animalPensPeekFromScale;
      v.animal.setVisible(true).setAlpha(this.reduced ? 0 : 1).setScale(from / rs);
      this.tweens.add({ targets: v.animal, scale: 1 / rs, alpha: 1, duration: Tokens.Timing.animalPensRiseMs, ease: 'Back.easeOut' });
    }
  }

  private closeDoor(d: number): void {
    const v = this.doors[d];
    if (!v) return;
    if (v.door) this.swing(v, DOOR_FRAMES.closed, Tokens.Timing.animalPensDoorMs);
    if (v.animal) {
      this.tweens.killTweensOf(v.animal);
      v.animal.setVisible(false);
    }
  }

  /** A door's frame change: squash its width, swap the frame, spring back (a crossfade-like snap when reduced). */
  private swing(v: DoorView, frame: string, ms: number): void {
    const img = v.door!;
    const rs = this.layout.renderScale;
    this.tweens.killTweensOf(img);
    img.setAngle(0).setScale(1 / rs);
    if (this.reduced) {
      this.setFrameAt(img, frame, v.dx, v.dy);
      return;
    }
    this.tweens.add({
      targets: img,
      scaleX: Tokens.ui.animalPensSwingSquash / rs,
      duration: ms / 2,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.setFrameAt(img, frame, v.dx, v.dy);
        this.tweens.add({ targets: img, scaleX: 1 / rs, duration: ms / 2, ease: 'Back.easeOut' });
      },
    });
  }

  /** A closed door rocks on its bottom centre (harder and longer for the asked door; smaller when reduced). */
  private wiggle(d: number, hard: boolean): void {
    const img = this.doors[d]?.door;
    if (!img) return;
    this.tweens.killTweensOf(img);
    img.setAngle(0).setScale(1 / this.layout.renderScale);
    const ui = Tokens.ui;
    const deg = amplitude(hard ? ui.animalPensAskWiggleDeg : ui.animalPensWiggleDeg, this.reduced);
    const ms = hard ? Tokens.Timing.animalPensAskWiggleMs : Tokens.Timing.animalPensWiggleMs;
    this.tweens.chain({
      targets: img,
      tweens: WIGGLE_STEPS.map((k) => ({ angle: k * deg, duration: ms / WIGGLE_STEPS.length, ease: SINE_IN_OUT })),
    });
  }

  /** Every door opens and every animal hops (yoyo) until the round completes; the happy chime. */
  private celebrate(behind: readonly string[]): void {
    audio.sfx(HAPPY_SFX);
    const hop = amplitude(Tokens.ui.animalPensHopPx, this.reduced);
    this.doors.forEach((v, d) => {
      if (v.door && v.door.frame.name !== DOOR_FRAMES.open) this.swing(v, DOOR_FRAMES.open, Tokens.Timing.animalPensDoorMs);
      const id = behind[d];
      if (!v.animal || id === undefined) return;
      this.tweens.killTweensOf(v.animal);
      this.setFrameAt(v.animal, peekFrame(id), v.dx, v.dy);
      v.animal.setVisible(true).setAlpha(1).setScale(1 / this.layout.renderScale);
      this.tweens.add({ targets: v.animal, y: v.animal.y - hop, duration: Tokens.Timing.animalPensHopMs, ease: 'Sine.easeOut', yoyo: true, repeat: -1, delay: d * Tokens.Timing.animalPensHopStaggerMs });
    });
  }
}
