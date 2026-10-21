import { describe, expect, it } from 'vitest';
import { RESUME_MARK_OUTLINE_PX } from './resume-marks';
import { TOPPINGS } from '../content/games/pizza';
import { MAP_AMBIENT } from '../content/assets';
import { Tokens } from './tokens';
import { computeSafeRect, visibleRect } from './safe-rect';

/** Supported iPad landscape viewports (CSS px). */
const IPADS: Array<[number, number]> = [
  [1024, 768], // iPad 9.7"
  [1366, 1024], // iPad Pro 12.9"
  [1180, 820], // iPad Air / 10th gen
  [1194, 834], // iPad Pro 11"
  [1210, 834], // iPad Pro 11" (M4)
];

describe('Tokens shape', () => {
  it('exposes colours as typed css/value/alpha fields', () => {
    expect(Tokens.colors.sky).toEqual({ css: '#A9D3F0', value: 0xa9d3f0, alpha: 1 });
    for (const c of Object.values(Tokens.colors)) {
      expect(c.css).toMatch(/^#[0-9A-F]{6}$/);
      expect(c.value).toBe(parseInt(c.css.slice(1), 16));
    }
  });

  it('splits compound DESIGN strings into typed fields', () => {
    const ring = Tokens.components.hintRing;
    expect(ring.core).toEqual({ width: 6, color: Tokens.colors.hintCore });
    expect(ring.line.width).toBe(4);
    expect(ring.line.color.css).toBe('#5B21B6');
    expect(ring.halo.color.alpha).toBe(0.8);
    expect(ring.pulse).toEqual({ from: 0.95, to: 1.05, durationMs: 1400 });
    expect(Tokens.components.buttonHome.position).toEqual({ left: 20, top: 40 });
    expect(Tokens.components.buttonSpeaker.position).toEqual({ right: 20, top: 120 });
    expect(Tokens.components.dropTarget.snap).toEqual({ durationMs: 200, ease: 'ease-out', scale: 1.05 });
    expect(Tokens.components.character.celebrate).toEqual({ scales: [1, 1.12, 1], repeat: 2, durationMs: 800 });
  });

  it('resolves spacing and touch tokens as numbers (px)', () => {
    expect(Tokens.spacing.targetMin).toBe(80);
    expect(Tokens.spacing.snapRadius).toBe(100);
    expect(Tokens.typography.stationLabel.fontSize).toBe(18);
  });

  it('exposes behavioural timings as positive numbers', () => {
    expect(Tokens.Timing.kartDriveMaxMs).toBe(2000);
    for (const [name, v] of Object.entries(Tokens.Timing)) {
      expect(v, name).toBeGreaterThan(0);
    }
  });
});

describe('safeRect', () => {
  it('matches the spec value for 4:3 … ≈1.46', () => {
    expect(Tokens.safeRect).toEqual({ x: 0, y: 34, w: 1024, h: 700 });
  });

  it.each(IPADS)('is fully visible under ENVELOP on %ix%i', (w, h) => {
    const visible = visibleRect(Tokens.design.width, Tokens.design.height, w / h);
    const s = Tokens.safeRect;
    expect(s.x).toBeGreaterThanOrEqual(visible.x);
    expect(s.y).toBeGreaterThanOrEqual(visible.y);
    expect(s.x + s.w).toBeLessThanOrEqual(visible.x + visible.w);
    expect(s.y + s.h).toBeLessThanOrEqual(visible.y + visible.h);
  });

  it('lies inside the design frame', () => {
    const s = Tokens.safeRect;
    expect(s.x).toBeGreaterThanOrEqual(0);
    expect(s.y).toBeGreaterThanOrEqual(0);
    expect(s.x + s.w).toBeLessThanOrEqual(Tokens.design.width);
    expect(s.y + s.h).toBeLessThanOrEqual(Tokens.design.height);
  });

  it('crops left/right instead for viewports narrower than 4:3', () => {
    expect(computeSafeRect(1024, 768, 1.2, 4 / 3)).toEqual({ x: 52, y: 0, w: 920, h: 768 });
  });
});

describe('post-round chain budget (Story 2.3)', () => {
  const T = Tokens.Timing;

  it('the new values', () => {
    expect(T.cameraPullBackMs).toBe(1200);
  });

  it('the pull-back stays within its cap', () => {
    expect(T.cameraPullBackMs).toBeLessThanOrEqual(T.cameraPullBackMaxMs);
  });
});

describe('seamless play (2026-10-21)', () => {
  const T = Tokens.Timing;

  it('the next round starts within ~2.5 s of round:complete', () => {
    expect(T.nextRoundDelayMs).toBe(500);
    expect(T.nextRoundDelayMs + T.sceneFadeMs).toBeLessThanOrEqual(2500);
  });
});

describe('Tokens.art (Story 1.8)', () => {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = (css: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(css.slice(i, i + 2), 16) / 255));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };

  it('the four flavours differ pairwise in relative luminance by at least 0.1', () => {
    const entries = Object.entries(Tokens.art.flavour);
    expect(entries.map(([id]) => id)).toEqual(['strawberry', 'chocolate', 'vanilla', 'mint']);
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const d = Math.abs(luminance(entries[i]![1].css) - luminance(entries[j]![1].css));
        expect(d, `${entries[i]![0]} vs ${entries[j]![0]}`).toBeGreaterThanOrEqual(0.1);
      }
    }
  });

  it('art colours use the token colour shape', () => {
    expect(Tokens.art.flavour.mint).toEqual({ css: '#3FA86A', value: 0x3fa86a, alpha: 1 });
    expect(Tokens.art.flavourDetail.chip.value).toBe(0x3a2318);
  });

  it('Story 3.1/3.2: every pizza topping pair differs in relative luminance by at least 0.3', () => {
    const toppings = TOPPINGS;
    expect(toppings).toHaveLength(3);
    for (let i = 0; i < toppings.length; i++) {
      for (let j = i + 1; j < toppings.length; j++) {
        const d = Math.abs(luminance(Tokens.art.pizza[toppings[i]!].css) - luminance(Tokens.art.pizza[toppings[j]!].css));
        expect(d, `${toppings[i]} vs ${toppings[j]}`).toBeGreaterThanOrEqual(0.3);
      }
    }
  });

  it('Story 3.1: the pizza values', () => {
    expect(Tokens.art.pizza.dough.css).toBe('#F2D49B');
    expect(Tokens.art.pizza.ovenBody.value).toBe(0xc98a5b);
    expect(Tokens.art.pizza.pepper.css).toBe('#84C94F');
    expect(Tokens.ui.pizzaPlacedSlicePx).toBe(60);
    expect(Tokens.ui.ovenSizeTolerance).toBe(30);
    expect(Tokens.Timing.pizzaBakeMs).toBe(2000);
    expect(Tokens.Timing.ovenGlowRiseMs).toBe(400);
    // The director's level-2 ring on the oven arrives exactly when the pizza table asks for it.
    expect(Tokens.Timing.pizzaOvenIdleHintMs).toBe(Tokens.Timing.hintLevel2IdleMs);
  });

  it('the new Story 1.8 values', () => {
    expect(Tokens.Timing.shibaBreathMs).toBe(2400);
    expect(Tokens.ui.shibaBreathScale).toBe(1.02);
    expect(Tokens.ui.iceCreamRowGap).toBe(180);
    expect(Tokens.ui.iceCreamRowTolerance).toBe(20);
  });
});

describe('resume mark (Story 2.5)', () => {
  it('the new values', () => {
    expect(Tokens.ui.resumeMarkRadiusPx).toBe(20);
    expect(Tokens.ui.resumeMarkStrokePx).toBe(8);
    expect(Tokens.ui.resumeMarkDotPx).toBe(6);
    expect(Tokens.ui.resumeMarkDepth).toBe(10000);
  });

  it('the centre dot clears the annulus hole and its inner outline, and the colours exist', () => {
    // The inner ink outline sits inside the hole: the dot must clear it too.
    expect(Tokens.ui.resumeMarkDotPx).toBeLessThan(Tokens.ui.resumeMarkRadiusPx - Tokens.ui.resumeMarkStrokePx - RESUME_MARK_OUTLINE_PX);
    expect(Tokens.colors.buttonHome.css).toMatch(/^#[0-9A-F]{6}$/i);
    expect(Tokens.colors.iconInk.css).toMatch(/^#[0-9A-F]{6}$/i);
    expect(Tokens.colors.counterTop.css).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

describe('Story 3.4 values', () => {
  it('ui.dinoPieceMinRawPx caps the loose-piece enlargement at 2.25×; a walk frame lasts 300 ms', () => {
    expect(Tokens.ui.dinoPieceMinRawPx).toBe(40);
    expect(Tokens.components.draggableItem.minSize / Tokens.ui.dinoPieceMinRawPx).toBe(2.25);
    expect(Tokens.Timing.dinoWalkFrameMs).toBe(300);
  });
});

describe('Story 3.3 values', () => {
  it('art.dino, the dino ui values and timings', () => {
    expect(Tokens.art.dino.apatosaurusBelly.css).toBe('#CFEFFF');
    expect(Tokens.art.dino.triceratopsBelly.css).toBe('#D7F2C9');
    expect(Tokens.art.dino.stegosaurusBelly.css).toBe('#FFE2C2');
    expect(Tokens.art.dino.horn.css).toBe('#FFF3D6');
    expect(Tokens.ui).toMatchObject({ dinoSizePx: 360, dinoSizeTolerance: 40, dinoWalkMaxPx: 120, dinoSlotTolerancePx: 3, dinoCloudDriftPx: 24, dinoReducedHopScale: 1.04, ghostDash: [12, 8] });
    expect(Tokens.Timing).toMatchObject({ dinoBlinkMs: 160, dinoWalkMs: 1200, dinoCallMs: 800, dinoNextFadeMs: 500, dinoCloudDriftMs: 8000 });
  });

  it('the walk shows every walk frame at least twice and the cloud drift is slower than 1 Hz', () => {
    // Story 3.4: 2 walk frames.
    expect(Tokens.Timing.dinoWalkMs / Tokens.Timing.dinoWalkFrameMs).toBeGreaterThanOrEqual(2 * 2);
    expect(Tokens.Timing.dinoCloudDriftMs).toBeGreaterThanOrEqual(Tokens.Timing.flashMinPeriodMs);
  });
});

describe('Story 3.5 values', () => {
  it('art.shadowMatch, the shadow-match ui values and timings', () => {
    expect(Tokens.art.shadowMatch.caveInner.css).toBe('#F6EEDC');
    expect(Tokens.ui).toMatchObject({
      trikeSizePx: 300,
      trikeSizeTolerance: 30,
      trikeRisePx: 24,
      trikeSwayDeg: 1.5,
      trikeNodBounceScale: 1.06,
      shadowItemPx: 150,
      shadowItemTolerance: 10,
      shadowHeldScale: 0.7,
      caveMinLuminance: 0.35,
      shadowMaxIoU: 0.85,
      raceTurnSpanPx: 30,
      raceMinTurnRadiusPx: 50,
      raceSelfClearArcPx: 220,
      racePathPointGapPx: 24,
      raceLoopMouthMaxPx: 150,
      raceConeSwayDeg: 4,
      raceFlagSwayDeg: 3,
    });
    expect(Tokens.Timing).toMatchObject({ trikeEnterMs: 900, trikeSwayMs: 3000, trikeNodMs: 600, trikeCallMs: 500, shadowRevealMs: 400, shadowItemFadeMs: 400, raceConeSwayMs: 2200, raceFlagSwayMs: 1700 });
  });

  it('the entrance takes at least 0.8 s; the nod and the call fit a character sound; the sway is slower than 1 Hz', () => {
    expect(Tokens.Timing.trikeEnterMs).toBeGreaterThanOrEqual(800);
    expect(Tokens.Timing.trikeNodMs).toBeLessThanOrEqual(Tokens.Timing.characterSoundMaxMs);
    expect(Tokens.Timing.trikeCallMs).toBeLessThanOrEqual(Tokens.Timing.characterSoundMaxMs);
    expect(Tokens.Timing.trikeSwayMs).toBeGreaterThanOrEqual(Tokens.Timing.flashMinPeriodMs);
  });

  it('the trike is at least the character minimum; a shadow at least the shadow-target minimum', () => {
    expect(Tokens.ui.trikeSizePx - Tokens.ui.trikeSizeTolerance).toBeGreaterThanOrEqual(Tokens.components.character.minSize);
    expect(Tokens.ui.shadowItemPx - Tokens.ui.shadowItemTolerance).toBeGreaterThanOrEqual(Tokens.components.shadowTarget.minSize);
  });
});

describe('Story 5.6 timing', () => {
  it('the spout is 4 frames long, shorter than the ambient gap, and starts after the greeting wave', () => {
    expect(Tokens.Timing.whaleSpoutMs).toBe(MAP_AMBIENT.whale.spout.length * Tokens.Timing.whaleSpoutFrameMs);
    expect(Tokens.Timing.whaleSpoutMs).toBeLessThan(Tokens.Timing.mapAmbientMinMs);
    expect(Tokens.Timing.whaleFirstMs).toBeGreaterThan(Tokens.Timing.guideWaveMs);
    expect(Tokens.Timing.mapWaveBobMs).toBeGreaterThanOrEqual(1000);
    expect(MAP_AMBIENT.fountain.spray.length * Tokens.Timing.fountainFrameMs).toBeGreaterThanOrEqual(Tokens.Timing.flashMinPeriodMs);
  });

  it('the map road colour is map art only: colors.road (race) keeps its grey', () => {
    expect(Tokens.art.map.road.css).toBe('#EE9F68');
    expect(Tokens.colors.road.css).toBe('#5B6270');
    expect(Tokens.art.map.road.css).not.toBe(Tokens.colors.road.css);
  });
});
