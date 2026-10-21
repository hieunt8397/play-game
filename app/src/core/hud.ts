// Hud logic (Story 1.6): layout, Speaker wave and the button controller. Pure (no Phaser), so the
// Hud scene only wires Graphics, TapTargets, tweens and Bus subscriptions to it.
import type { HudMode } from './hud-mode';
import type { Insets } from './input/space';
import type { Circle } from './input/tap-target';
import { amplitude } from './reduced-motion';
import type { Rect } from './safe-rect';
import { Tokens } from './tokens';

export const SFX_POP = 'sfx.shell.pop';
export const VO_HOME = 'vo.shell.home';
const MS_PER_S = 1000;

export interface HudLayout {
  /** Button centres plus the hit radius (size/2 + hitPad), design px. */
  readonly home: Circle;
  readonly speaker: Circle;
  /** Button diameter, design px. */
  readonly size: number;
}

/**
 * Home sits top-left, Speaker top-right, measured from the visible design rect plus the safe-area
 * insets (already in design px).
 */
export function hudLayout(visible: Rect, insets: Insets): HudLayout {
  const sp = Tokens.spacing;
  const size = Tokens.components.buttonRound.size;
  const half = size / 2;
  const r = half + sp.hitPad;
  return {
    size,
    home: { x: visible.x + sp.edgeInset + insets.left + half, y: visible.y + sp.buttonTop + insets.top + half, r },
    speaker: {
      x: visible.x + visible.w - sp.edgeInset - insets.right - half,
      y: visible.y + sp.speakerTop + insets.top + half,
      r,
    },
  };
}

export interface WaveRing {
  readonly scale: number;
  readonly alpha: number;
}

/** One wave period (1000/hz ms). */
export function wavePeriodMs(): number {
  return MS_PER_S / Tokens.components.buttonSpeaker.wave.hz;
}

/**
 * The Speaker wave at time `tMs` since it started: `rings` rings, each scaling 1 → speakerWaveScale
 * while fading from the token alpha to 0 over one period, phase-shifted evenly.
 */
export function waveFrame(tMs: number, reduced: boolean): WaveRing[] {
  const wave = Tokens.components.buttonSpeaker.wave;
  const period = wavePeriodMs();
  const peak = amplitude(Tokens.ui.speakerWaveScale, reduced);
  const rings: WaveRing[] = [];
  for (let i = 0; i < wave.rings; i++) {
    const raw = Math.max(0, tMs) / period + i / wave.rings;
    const phase = raw - Math.floor(raw);
    rings.push({ scale: 1 + (peak - 1) * phase, alpha: wave.color.alpha * (1 - phase) });
  }
  return rings;
}

export interface HudView {
  /** Press visual (0.9× and spring back). */
  pressSpeaker(): void;
  pressHome(): void;
  /** Starts (true) or stops (false) the Speaker wave. */
  showWave(on: boolean): void;
  /** Home visible and enabled. */
  showHome(on: boolean): void;
}

export interface HudDeps {
  /** Replays the current prompt; returns its voice token, or undefined when there is none. */
  replay(): number | undefined;
  say(id: string): number;
  sfx(id: string): void;
  emitHome(): void;
  view: HudView;
}

export class HudController {
  private mode: HudMode = 'map';
  private waveToken: number | undefined;

  private readonly deps: HudDeps;

  constructor(deps: HudDeps) {
    this.deps = deps;
  }

  get currentMode(): HudMode {
    return this.mode;
  }

  /** The token the wave follows (undefined: no wave). */
  get waveFor(): number | undefined {
    return this.waveToken;
  }

  setMode(mode: HudMode): void {
    this.mode = mode;
    this.deps.view.showHome(mode === 'game');
  }

  /** Speaker onPress: press + pop at once, then replay; the wave follows the new token. */
  speaker(): void {
    this.deps.view.pressSpeaker();
    this.deps.sfx(SFX_POP);
    const token = this.deps.replay();
    if (token === undefined) return;
    this.waveToken = token;
    this.deps.view.showWave(true);
  }

  /** Home onPress: press + pop; in 'game' mode also the line and `hud:home`. */
  home(): void {
    this.deps.view.pressHome();
    this.deps.sfx(SFX_POP);
    if (this.mode !== 'game') return;
    this.deps.say(VO_HOME);
    this.deps.emitHome();
  }

  /** `speech:ended`: stops the wave only for the token it follows. */
  speechEnded(token: number): void {
    if (this.waveToken === undefined || token !== this.waveToken) return;
    this.waveToken = undefined;
    this.deps.view.showWave(false);
  }
}
