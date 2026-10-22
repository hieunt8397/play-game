// The only way code reads design values (AD-7, AD-8): `Tokens.*` and `Tokens.Timing.*`.
import { designTokens } from './tokens.generated.ts';
import { Timing } from './timing.ts';
import { computeSafeRect } from './safe-rect.ts';

/** Design space: 1024×768 px (4:3) at 1× (AD-7). */
const design = { width: 1024, height: 768 } as const;

/**
 * Supported iPad landscape aspect ratios (w/h). 4:3 (1024×768, 1366×1024) up to ≈1.46
 * (1180×820 ≈ 1.439, 1210×834 ≈ 1.451) — see spec Design Notes.
 */
const supportedAspect = { min: 4 / 3, max: 1.46 } as const;

/**
 * UI motion values DESIGN.md does not define (Story 1.2 adds them in core, DESIGN.md unchanged).
 * Source: epic UX › Base button (press to 0.9× and spring back) and EXPERIENCE button-play 'Nhún chậm'.
 */
const ui = {
  /** button-round press scale. */
  pressScale: 0.9,
  /** button-play slow bob amplitude (px, design space). */
  playBobPx: 10,
  /** Map station tap bounce peak (Story 1.5: 1 → 1.1 → 1 over Timing.stationTapMs). */
  stationTapScale: 1.1,
  /** Map ambient station motion peak (1 → 1.04 → 1 over Timing.mapAmbientMoveMs). */
  ambientScale: 1.04,
  /** prefers-reduced-motion: every scale amplitude (scale − 1) is multiplied by this. */
  reducedMotionAmplitude: 0.5,
  /** Speaker wave ring peak scale (Story 1.6: each ring 1 → 1.6 while fading out, buttonSpeaker.wave). */
  speakerWaveScale: 1.6,
  /** Kart cruise speed along the road (Story 1.7, design px per ms); drives are clamped to Timing.kartDrive*Ms. */
  kartCruisePxPerMs: 0.6,
  /** Kart tap while driving: the remaining drive time is multiplied by this (a visible speed-up). */
  kartBoostTimeScale: 0.6,
  /** Camera zoom onto a station before its game starts (Story 1.7). */
  cameraZoomScale: 1.8,
  /** Tiệm kem Shiba breathing: scaleY 1 ↔ this around its ground pivot (Story 1.8). */
  shibaBreathScale: 1.02,
  /** Tiệm kem row: centre gap (design px) between neighbours of scoop, scoop, cone, scoop, scoop (Story 1.8). */
  iceCreamRowGap: 180,
  /** Allowed deviation from iceCreamRowGap (design px). */
  iceCreamRowTolerance: 20,
  /** Story 6.1: free play: the cone tower topples when it holds this many scoops (5: the four homes and five fallen scoops fit the table row). */
  iceCreamTowerMax: 5,
  /** Story 6.1: the chance (0 ≤ x ≤ 1) that a sneeze leaves ice cream on Shiba's nose (the reaction rng). */
  iceCreamNoseCreamChance: 0.5,
  /** Story 6.1: the full tower sways ± this (degrees) around the cone before it falls (none under reduced motion). */
  iceCreamTowerWobbleDeg: 6,
  /** Story 6.1: full ± swings in the tower's wobble. */
  iceCreamTowerWobbleSwings: 3,
  /** Story 6.1: Shiba shivers ± this (design px) sideways. */
  iceCreamShiverPx: 4,
  /** Story 6.1: a toppled scoop bounces this high (design px) after it lands on the counter. */
  iceCreamToppleBouncePx: 14,
  /** 2026-10-21: a scoop resting on the table row lands with a bounce this high (design px; none under reduced motion). */
  iceCreamRestBouncePx: 8,
  /** 2026-10-21: each half of that landing bounce (up, down) takes this share of Timing.iceCreamRestFallMs. */
  iceCreamRestHopShare: 0.25,
  /** 2026-10-21: a rest within this (design px) of the row height slides along it (no fall). */
  iceCreamRestSlideTolerancePx: 1,
  /** Story 1.9 hint ring around a game item: its bounds plus this (design px) on every side. */
  hintRingPad: 12,
  /**
   * Story 5.1 tap-then-tap: a press whose finger never moves farther than this (design px) from where
   * it went down is a tap (select / tap a target), not a drag.
   */
  tapMoveMaxPx: 12,
  /** Story 5.1: the selection ring around a tapped item: its bounds plus this (design px) on every side. */
  selectionRingPad: 8,
  /** Story 5.1: the selection ring draws the hint-ring strokes at this fraction of their width (thinner). */
  selectionRingWidthScale: 0.5,
  /** Story 5.4: a background tap's light ripple starts at this radius (design px) and grows by tapRippleGrowScale. */
  tapRippleRadiusPx: 18,
  /** Story 5.4: the ripple's radius grows 1 → this while it fades (its amplitude goes through `amplitude`). */
  tapRippleGrowScale: 2.2,
  /** Story 5.4: the ripple's depth, above every game and map sprite, below the resume mark. */
  tapRippleDepth: 9000,
  /** Story 1.9 hint item bob: scale 1 ↔ this, yoyo over components.hintRing.pulse.durationMs. */
  hintItemBobScale: 1.06,
  /** Story 1.9 level 4: distractors fade to this alpha ("mờ 60%" read as 60 % opacity). */
  hintDimAlpha: 0.6,
  /** Story 1.9 level 4: the drop target's snap radius factor. */
  hintSnapScale: 2,
  /**
   * Story 5.7 (FR35): the chance (0 ≤ x ≤ 1) that a fresh round gets its one parent invitation
   * ("Hỏi mẹ xem…"), rolled once per round from the round seed (core/parent-invite).
   */
  parentInviteChance: 0.3,
  /**
   * Story 2.4: a game icon's trimmed longest side (design px). Its overlay was removed 2026-10-21; only the
   * art pipeline's `icon/<id>/00` frames still use it (deferred art cleanup).
   */
  playAgainIconPx: 112,
  /** Story 2.5 resume mark: outer radius (design px) of the static ring on a station holding a resume point. */
  resumeMarkRadiusPx: 20,
  /** Story 2.5 resume mark: width (design px) of the Home-yellow annulus. */
  resumeMarkStrokePx: 8,
  /** Story 2.5 resume mark: radius (design px) of the white centre dot. */
  resumeMarkDotPx: 6,
  /** Story 2.5 resume mark: depth, above every map sprite (stations, decorations, kart, ring). */
  resumeMarkDepth: 10000,
  /** Story 3.1 Tiệm pizza: the fox breathes scaleY 1 ↔ this around its ground pivot. */
  foxBreathScale: 1.02,
  /** Story 3.1: an oven tap before the base is full nudges it 1 → this → 1 (no bake, not wrong). */
  ovenNudgeScale: 1.05,
  /** Story 3.1: during the recount each placed slice bounces 1 → this → 1 on its number. */
  pizzaCountBounceScale: 1.15,
  /** Story 3.1: a placed slice (and a faint base spot) is this wide (design px); spots stay this far apart. */
  pizzaPlacedSlicePx: 60,
  /** Story 3.1: the oven frame's trimmed width may differ from components.oven.size by this (design px). */
  ovenSizeTolerance: 30,
  /** Story 3.1: diameter (design px) of one smoke / steam puff (2026-10-16: bigger, softer puffs). */
  pizzaPuffPx: 22,
  /** 2026-10-16: puffs per smoke / steam burst, and how much each grows (1 → this) as it rises. */
  pizzaPuffCount: 5,
  pizzaPuffGrow: 1.8,
  /** 2026-10-16: puff spread and arc (× pizzaPuffPx per puff from the centre); the burst staggers over 1 / this of the rise. */
  pizzaPuffSpread: 0.7,
  pizzaPuffArc: 0.4,
  pizzaPuffStagger: 3,
  /** 2026-10-16: while baking the oven breathes scaleY 1 ↔ this around its ground pivot. */
  ovenBakeWobbleScale: 1.05,
  /** 2026-10-16: the baked pizza pops 1 → this → 1 as it lands on the fox's plate. */
  pizzaServePopScale: 1.15,
  /** 2026-10-16: the fox chews (scaleY 1 ↔ this) while eating; the pizza shrinks away in this many bites. */
  foxChewScale: 1.06,
  pizzaBites: 3,
  /** 2026-10-16: a bite nibbles down within 1 / this of its step, then pauses. */
  pizzaBiteNibble: 3,
  /** Story 3.3 Ghép khủng long: the trimmed longest side (design px) of every whole dino frame `<s>/idle/00`. */
  dinoSizePx: 360,
  /** Story 3.3: allowed deviation (design px) from dinoSizePx. */
  dinoSizeTolerance: 40,
  /** Story 3.3: the come-alive walk moves the dino at most this far (design px). */
  dinoWalkMaxPx: 120,
  /** Story 3.3: `slot.<s>-<p>` lies within this (design px) of its piece frame's trimmed centre. */
  dinoSlotTolerancePx: 3,
  /** Story 3.3: the clouds drift ± this (design px) in x (ambient). */
  dinoCloudDriftPx: 24,
  /** Story 3.3 reduced motion: the walk becomes an on-the-spot hop 1 → this → 1. */
  dinoReducedHopScale: 1.04,
  /** Story 3.3: the ghost outline dash and gap (design px; × renderScale in the rendered frame). */
  ghostDash: [12, 8],
  /**
   * Story 3.4: a dino piece's trimmed longest side ÷ renderScale must be at least this (design px). A
   * loose piece is drawn enlarged to draggableItem.minSize, so this caps the enlargement at 2.25×.
   */
  dinoPieceMinRawPx: 40,
  /**
   * Story 3.5 Hang tìm bóng: each shadow-match item's trimmed longest side (design px), the size of its
   * shadow. 2026-10-22: 150 → 210 (≈ 1.4×; the triceratops is gone, the shadows use its space).
   */
  shadowItemPx: 210,
  /** Story 3.5: allowed deviation (design px) from shadowItemPx (2026-10-22: 10 → 14, scaled with it). */
  shadowItemTolerance: 14,
  /** Story 3.5: the item waiting on the pedestal is drawn at this × its shadow size. */
  shadowHeldScale: 0.7,
  /** 2026-10-22: a correct reveal makes the revealed item hop up this far (design px) and back. */
  shadowHappyHopPx: 28,
  /** 2026-10-22: … while it bounces 1 → this → 1. */
  shadowHappyBounceScale: 1.12,
  /** 2026-10-22: the sparkle burst of a correct reveal ends this far (design px) beyond the item's shown radius. */
  shadowSparkleReachPx: 24,
  /** Story 3.5: every pixel of `hit.cave` on `bg.shadow-match` has at least this relative luminance (no dark cave). */
  caveMinLuminance: 0.35,
  /** Story 3.6: two shadows of one shape group overlap (alpha-mask IoU, bottom-centre aligned) at most this much. */
  shadowMaxIoU: 0.85,
  /** Story 4.1 Đường đua: a press within this (design px) of the kart grabs it. */
  raceGrabRadius: 100,
  /** Story 4.1: a finger farther than this (design px) from the road ahead makes the kart wait. */
  traceStopPx: 140,
  /** Story 4.1: between tracePath.tolerance and traceStopPx the kart catches up at this × full speed. */
  traceMidSpeedScale: 0.5,
  /** Story 4.1: the kart's full catch-up speed (design px per ms). */
  traceKartPxPerMs: 1.0,
  /** Story 4.1: the road is resampled every this many px of arc length (traceIndex = s / step). */
  traceSampleStepPx: 4,
  /** Story 4.1: the finger is projected only onto the road from the kart to this far ahead. */
  traceLookaheadPx: 240,
  /** Story 4.1: within this of the road's end the kart snaps to the end and arrives. */
  traceArriveSlackPx: 8,
  /** Story 4.1: tracing this far counts as hint activity (stepDone with the same step). */
  traceHintProgressPx: 120,
  /** Story 4.1: the hand demo traces this stretch of road ahead of the kart. */
  raceHintStretchPx: 240,
  /** Story 4.1: the level-2 guide glow lights this stretch of dash ahead of the kart. */
  raceGuideGlowPx: 240,
  /** Story 4.1: the checkered gate's trimmed width (design px) is at least this. */
  raceGateMinPx: 150,
  /** 2026-10-22: the gate's yaw follows the road's arrival direction over its last this many px of arc. */
  raceGateTangentPx: 40,
  /** 2026-10-22: the gate's pivot (post-feet midpoint) sits this many px of arc before the road's end. */
  raceGateBackPx: 16,
  /** Story 4.1: a waiting kart blinks between alpha 1 and this. */
  raceWaitAlpha: 0.55,
  /** Story 4.1: the driven part of the road is overlaid in hintCore at this alpha. */
  raceDrivenAlpha: 0.3,
  /** Story 4.1: the road's dashed centre line (design px). */
  roadDashWidth: 6,
  roadDashLen: 18,
  roadDashGap: 14,
  /** Story 4.1: below this |dx| of the road's direction the kart keeps its last facing (no flip-flop). */
  raceFacingMinDx: 0.05,
  /** Story 4.1: the height (design px) of the soft shadow ellipse under the kart and the gate. */
  raceShadowHeightPx: 32,
  /** Story 4.2: the turn radius is measured through the samples this far (arc px) either side. */
  raceTurnSpanPx: 30,
  /** Story 4.2: a road's turn radius is at least this (design px, half the band: the inner edge never folds). */
  raceMinTurnRadiusPx: 50,
  /** Story 4.2: road samples this far apart in arc are at least tracePath.width apart (the band never touches itself). */
  raceSelfClearArcPx: 220,
  /** Story 4.2: consecutive layout points of every road shape except straight (curve, zigzag, loop, wave, hairpin, snake, spiral) are at most this far apart. */
  racePathPointGapPx: 24,
  /** Story 4.2: a loop's start and end (its mouth) are at most this far apart. */
  raceLoopMouthMaxPx: 150,
  /** Story 4.2: the cones sway ± this (degrees, ambient). */
  raceConeSwayDeg: 4,
  /** Story 4.2: the flags sway ± this (degrees, ambient). */
  raceFlagSwayDeg: 3,
  /** Story 4.3 Câu cá: a big fish is this × the small one (trimmed longest sides). */
  fishSizeRatio: 1.6,
  /** Story 4.3: allowed deviation of the big/small ratio. */
  fishSizeRatioTol: 0.1,
  /** Story 4.3: a small fish's trimmed longest side is within [fish.minSize, fish.minSize + this]. */
  fishSizeSlackPx: 20,
  /** Story 4.3: the fish colours' mean luminances (rendered) differ pairwise by at least this. */
  fishLumaGapMin: 0.12,
  /** Story 4.3: a fish cruises at [this, 1] × fish.speedMax (seeded). */
  fishMinSpeedScale: 0.5,
  /** Story 4.3: under reduced motion the fish swim at this × their speed. */
  fishReducedSpeedScale: 0.6,
  /** Story 4.3: at hint level ≥ 2 the hinted fish swim at this × their speed (the others stop). */
  fishHintSpeedScale: 0.5,
  /** Story 4.3: a new waypoint lies at least this far from the fish. */
  fishWaypointMinPx: 120,
  /** Story 4.3: seeded placement tries per fish before the grid scan. */
  fishPlaceAttempts: 200,
  /** Story 4.3: a diving fish sinks this far (design px). */
  fishDiveDropPx: 24,
  /** Story 4.3: a diving fish fades to this alpha. */
  fishDiveAlpha: 0.15,
  /** Story 4.3: the radius of a dive bubble (design px). */
  fishBubblePx: 8,
  /** Story 4.3: a water tap's ripple grows to this radius (design px). */
  fishRippleRadiusPx: 40,
  /** Story 4.3: the fishing line's width (design px). */
  fishLineWidth: 3,
  /** 2026-10-16: the fishing line sags this far (design px) at its middle, like a real line. */
  fishLineSagPx: 36,
  /** 2026-10-16: a splash throws this many drops (radius px) up to fishSplashRisePx and out to fishSplashSpreadPx. */
  fishSplashDrops: 7,
  fishSplashDropPx: 6,
  fishSplashRisePx: 70,
  fishSplashSpreadPx: 60,
  /** Story 4.3: a caught fish jumps this high (design px). */
  fishJumpPx: 80,
  /** Story 4.3: the fish placement's fallback grid scan steps this far (design px). */
  fishGridStepPx: 8,
  /** Story 4.5 Chạm là nói: an idle prop wiggles ± this (degrees). */
  touchTalkWiggleDeg: 6,
  /** Story 4.5: the square kept clear around each Hud button centre (design px; EXPERIENCE "~120×120"). */
  hudKeepOutPx: 120,
  /** Story 4.5: each prop's trimmed longest side (design px) lies in [this, touchTalkPropMaxPx]. */
  touchTalkPropMinPx: 100,
  /** Story 4.6: a scene bubble's thumbnail sits this far inside its rim (design px). */
  sceneBubbleInsetPx: 6,
  touchTalkPropMaxPx: 220,
  /** Story 5.6: a new station landmark (the ice-cream cone, the pizza chimney) is at least this tall (design px; build_map.py). */
  mapLandmarkMinPx: 60,
  /** Story 5.6: the map clouds drift right at this speed (design px per ms; × reducedMotionAmplitude when reduced). */
  mapCloudDriftPxPerMs: 0.008,
  /** Story 5.6: the map foam waves bob ± this (design px; × reducedMotionAmplitude when reduced). */
  mapWaveBobPx: 3,
  /** Story 5.6: neighbouring waves are this fraction of a bob cycle apart (staggered phases). */
  mapWaveBobPhaseStep: 0.37,
  /** Story 5.6: the clouds and waves draw at this depth: above the plate (−1), below every station, decoration and the kart. */
  mapAmbientBackDepth: -0.5,
} as const;

/** A colour in the generated-token shape (`css`, `value`, `alpha`). */
function colour(css: string): { readonly css: string; readonly value: number; readonly alpha: 1 } {
  return { css, value: Number.parseInt(css.slice(1), 16), alpha: 1 };
}

/**
 * Art colours DESIGN.md does not define (Story 1.8, kept in core). Used by the Blender builders
 * (through tools/render/build.ts) and by the content checks; games read them only through Tokens.
 */
const art = {
  /** Tiệm kem scoop colours; their relative luminances differ pairwise by at least 0.1 (tested). */
  flavour: {
    strawberry: colour('#FF8CC6'),
    chocolate: colour('#6B3E26'),
    vanilla: colour('#FFF3D6'),
    mint: colour('#3FA86A'),
  },
  /** Shape details on the scoops (the chocolate chips) and the cone. */
  flavourDetail: {
    chip: colour('#3A2318'),
    /** 2026-10-21 soft scoops: the strawberry on top, its seeds and leaves, and the mint leaves. */
    berry: colour('#E8364F'),
    berrySeed: colour('#FFE08A'),
    berryLeaf: colour('#4FB84F'),
    mintLeaf: colour('#A6EB8C'),
    /** The soft cone and the light waffle lines on it. */
    cone: colour('#EBBF7A'),
    coneLine: colour('#C98F4E'),
  },
  /** Light fur of the creatures (Shiba's face and belly). */
  creatureLight: colour('#FFF8EE'),
  /**
   * Story 3.1 Tiệm pizza: base, toppings and oven. The topping colours differ pairwise in relative
   * luminance by at least 0.3 (tested), so the slices never rely on hue alone.
   */
  pizza: {
    dough: colour('#F2D49B'),
    crust: colour('#D9A35B'),
    sauce: colour('#E0703A'),
    cheese: colour('#FFE08A'),
    sausage: colour('#B8442A'),
    sausageDot: colour('#F2B48C'),
    mushroom: colour('#F3E6CC'),
    /** Story 3.2: the green bell-pepper ring (mid luminance, ≥ 0.3 from both other toppings). */
    pepper: colour('#84C94F'),
    ovenBody: colour('#C98A5B'),
  },
  /**
   * Story 3.3 Ghép khủng long: the pale bellies and accents of the three dinosaurs (the bodies are
   * colors.creatureBlue / creatureGreen / creatureOrange, the stegosaurus plates creaturePink).
   */
  dino: {
    apatosaurusBelly: colour('#CFEFFF'),
    triceratopsBelly: colour('#D7F2C9'),
    stegosaurusBelly: colour('#FFE2C2'),
    /** The triceratops' horns and frill: pastel, never a dark or sharp-looking colour. */
    horn: colour('#FFF3D6'),
  },
  /**
   * Story 3.5 Hang tìm bóng: the lit inner back wall of the cave (bright, never black; the rocks and floor use
   * colors.caveMouth). 2026-10-22 (spec-tim-bong-hinh-that-them-vat): back to the rock cave and the real
   * models; only the pedestal (no dinosaur) is kept from the cute restyle.
   */
  shadowMatch: {
    caveInner: colour('#F6EEDC'),
    pedestal: colour('#FF8FB8'),
    pedestalTop: colour('#FFF1E0'),
  },
  /**
   * Story 4.3 Câu cá: the three fish bodies (relative luminances ≈ 0.68 / 0.45 / 0.17, pairwise ≥ 0.2 apart,
   * tested), their white patterns and the fishing line.
   */
  /** Story 4.5 Chạm là nói: the seagull's white and its beak. */
  touchTalk: {
    white: colour('#FFFFFF'),
    beak: colour('#FFC93C'),
    /** Story 4.6: the street's pavement. */
    pavement: colour('#C9CED6'),
    /** Story 4.6: the bus body (no creatureYellow token exists; the Hud yellow). */
    bus: colour('#FFD23F'),
    /**
     * 2026-10-21 cute-toy restyle (build_touch_talk.py): the quiet backdrops (sky gradient, sea, sand, the
     * street verge and kerb lines, the haze that softens distant models) and the script-built soft props.
     */
    skyTop: colour('#9ED6F7'),
    skyHorizon: colour('#E6F6FF'),
    seaNear: colour('#A6E6F6'),
    seaFar: colour('#6CC8EE'),
    sandLight: colour('#F5D9A3'),
    sandWet: colour('#E8C489'),
    verge: colour('#B4E09A'),
    pavementLine: colour('#C0C6D0'),
    haze: colour('#EEF6FC'),
    fin: colour('#FFD45C'),
    gullTip: colour('#B8C4D6'),
    shell: colour('#FFB3C1'),
    coconut: colour('#7CC46B'),
    boatHull: colour('#FF7B72'),
    tire: colour('#3B4252'),
    hub: colour('#EEF1F5'),
    glass: colour('#BDE6FF'),
    banana: colour('#FFD84A'),
    bananaTip: colour('#8A5A33'),
    egg: colour('#FFF1DC'),
    melonRind: colour('#3E9E52'),
    melonStripe: colour('#2C7A3D'),
    melonLight: colour('#D9F5C2'),
    melonFlesh: colour('#FF5D73'),
    /** 2026-10-21 (batch 2): the picnic lawn's near green (it blends to `verge` in the distance). */
    grassNear: colour('#A2DA84'),
  },
  /**
   * Story 5.6 island dressing (map art only; colors.road / roadEdge / roadDash stay for the race screen):
   * the toy-coloured map road, the fountain and spout water, the foam of the waves, the ice-cream giant
   * cone and the pizza chimney. The whale and the swim ring reuse colors.creatureBlue / creaturePink /
   * tintPink / iconInk and art.creatureLight.
   */
  map: {
    road: colour('#EE9F68'),
    roadEdge: colour('#FFFFFF'),
    roadDash: colour('#FFFFFF'),
    water: colour('#BFEFFF'),
    foam: colour('#FFFFFF'),
    coneWaffle: colour('#E9B872'),
    coneScoop: colour('#FF8CC6'),
    coneScoopTop: colour('#FFF3D6'),
    coneCherry: colour('#FF5C8A'),
    chimneyBrick: colour('#E8825E'),
    chimneyCap: colour('#F3E6CC'),
    chimneySoot: colour('#8A5A48'),
  },
  /**
   * Story 7.1: the yard (build_home.py): the stage's wood, the drum, the vet box's cross, the wardrobe and
   * the shirt on its hook. The lawn, sky and haze reuse art.touchTalk (the picnic lawn's palette).
   */
  home: {
    wood: colour('#E8B27A'),
    woodDark: colour('#C98B55'),
    curtain: colour('#FF7FAE'),
    drum: colour('#FF6B6B'),
    drumRim: colour('#FFFFFF'),
    drumHead: colour('#FFF4E0'),
    stick: colour('#F3D9B1'),
    kit: colour('#FFFFFF'),
    cross: colour('#F0525B'),
    wardrobe: colour('#C9A8FF'),
    wardrobeDoor: colour('#E2D3FF'),
    knob: colour('#FFE08A'),
    shirt: colour('#FF9A3C'),
  },
  fishing: {
    yellow: colour('#FFD23F'),
    orange: colour('#FF9A3C'),
    blue: colour('#2F6FDB'),
    stripe: colour('#FFFFFF'),
    dot: colour('#FFFFFF'),
    line: colour('#F5F5F5'),
  },
} as const;

export const Tokens = {
  ...designTokens,
  design,
  supportedAspect,
  /** Design-space rect visible on every supported iPad ratio; interactive items must lie inside it. */
  safeRect: computeSafeRect(design.width, design.height, supportedAspect.min, supportedAspect.max),
  ui,
  art,
  Timing,
} as const;

export type TokensType = typeof Tokens;
export type { Rect } from './safe-rect.ts';

/** Milliseconds per second (speeds in px/s, ticks in ms). */
export const MS_PER_SECOND = 1000;
