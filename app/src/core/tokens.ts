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
  /** Story 7.2 Ú òa chuồng thú: a gentle door wiggle turns ± this (degrees); the asked door ± animalPensAskWiggleDeg. */
  animalPensWiggleDeg: 4,
  animalPensAskWiggleDeg: 9,
  /** Story 7.2: an ask every this many reveals. */
  animalPensAskEvery: 3,
  /** Story 7.2: a celebrating animal hops this high (design px; × reducedMotionAmplitude when reduced). */
  animalPensHopPx: 26,
  /** Story 7.2: a swinging door narrows to this share of its width before its frame changes. */
  animalPensSwingSquash: 0.75,
  /** Story 7.2: a revealed animal grows from this scale to 1 on its feet. */
  animalPensPeekFromScale: 0.8,
  /** Story 7.2: each door (its frame) is at least this tall (design px; tools/layout/rules.ts › validateAnimalPens). */
  animalPensDoorMinPx: 150,
  /** Story 7.3 Ban nhạc: at most this many notes sound at once (a new tap past it cuts the oldest note). */
  bandVoiceCap: 5,
  /** Story 7.3: the beat stops after this many beats without a tap (and starts again only after a tap and the idle time). */
  bandQuietBeats: 16,
  /** Story 7.3: one instrument bobs on every this-many beats (round robin): ≤ 1 visual pulse per second. */
  bandBobEveryBeats: 2,
  /** Story 7.3: a bob lifts an instrument this high (design px); none under reduced motion. */
  bandBobPx: 7,
  /** Story 7.3: a tapped instrument grows to this scale and springs back (× reducedMotionAmplitude when reduced). */
  bandBounceScale: 1.12,
  /** Story 7.3: the on-beat sparkle's stars rise this high (design px; no drift under reduced motion). */
  bandSparkleRisePx: 40,
  /** Story 7.3: each instrument (its idle frame's longest side) is at least this big (design px; tools/layout/rules.ts › validateBand). */
  bandInstrumentMinPx: 150,
  /** Story 7.4 Giờ đi ngủ: each tap target (brush, lamp, blanket, Shiba: its padded hull's narrowest width) is at least this wide (design px; tools/layout/rules.ts › validateBedtime). */
  bedtimeTargetMinPx: 150,
  /** Story 7.4: the night is a MULTIPLY tint (art.bedtime.nightTint) over the whole room at this alpha (it fades in from 0): the composite's average luma is ~0.55 of the day (≥ 0.35 required; measured with ffmpeg, README). */
  bedtimeNightAlpha: 1,
  /** Story 7.4: the suggested step's soft glow (a warm halo behind its target): its strongest alpha and its radius past the target (design px). */
  bedtimeGlowAlpha: 0.45,
  bedtimeGlowPadPx: 26,
  /** Story 7.4: the lamp's warm halo while it is on (alpha). */
  bedtimeLampGlowAlpha: 0.38,
  /** Story 7.4: white foam bubbles that pop up at Shiba's mouth while the brush scrubs (a repeat tap: a smaller puff). */
  bedtimeBubbles: 7,
  bedtimeRepeatBubbles: 3,
  /** Story 7.4: the bubbles spread this far around the mouth and rise this high (design px; no drift when reduced). */
  bedtimeBubbleSpreadPx: 34,
  bedtimeBubbleRisePx: 36,
  /** Story 7.4: the brush scrubs ± this (design px) at Shiba's mouth (× reducedMotionAmplitude when reduced). */
  bedtimeScrubPx: 10,
  /** Story 7.4: a "z" floats this high above the sleeping head (design px; it only fades when reduced). */
  bedtimeZRisePx: 60,
  /** Story 7.4: a tapped target's small reaction (repeat, awake Shiba): a squash to this scale and back (× reducedMotionAmplitude when reduced). */
  bedtimeNudgeScale: 1.05,
  /** Story 7.4: the lamp's repeat wiggle (degrees, × reducedMotionAmplitude when reduced). */
  bedtimeWiggleDeg: 4,
  /** Story 7.4: the night tint reaches this far past the design rect (the stage may show a little more at some aspects). */
  bedtimeNightBleedPx: 200,
  /** Story 7.4: a soft glow is this many concentric ellipses (faint at the rim, strongest in the middle). */
  bedtimeGlowRings: 8,
  /** Story 7.4: the lamp's warm halo radii (design px). */
  bedtimeLampGlowRxPx: 70,
  bedtimeLampGlowRyPx: 60,
  /** Story 7.4: the suggestion glow breathes down to this alpha, the stars twinkle down to it. */
  bedtimeBreatheAlpha: 0.55,
  /** Story 7.4: the brush at Shiba's mouth: a little left of it, tilted (sitting / lying), at this scale of its rest size. */
  bedtimeBrushOffsetPx: 6,
  bedtimeBrushTiltSitDeg: 20,
  bedtimeBrushTiltLieDeg: -25,
  bedtimeBrushTravelScale: 0.8,
  /** Story 7.4: a foam bubble is drawn at this scale of its rendered size, plus up to this much more. */
  bedtimeBubbleScale: 0.25,
  bedtimeBubbleScaleJitter: 0.2,
  /** Story 7.4: the stars at the window are drawn at these scales of their rendered size (one after the other). */
  bedtimeStarScales: [0.32, 0.4, 0.48],
  /** Story 7.4: a "z" starts at this scale of its rendered size and grows to the second as it floats. */
  bedtimeZScale: 0.45,
  bedtimeZScaleEnd: 0.6,
  /** Story 7.4 review: a "z" starts this far right of and above the sleeping head's top (design px). */
  bedtimeZOffsetPx: 6,
  /** Story 8.1 Bác sĩ thú cưng: a round is this many patients (each a different animal; then the next round). */
  petClinicPatientsPerRound: 3,
  /** Story 8.1: a patient shows 1 to this many distinct problems. */
  petClinicMaxProblems: 2,
  /** Story 8.1: each tool is drawn at least this big (its frame's longest side, design px; tools/layout/rules.ts › validatePetClinic). */
  petClinicToolMinPx: 90,
  /** Story 8.1: each tool's tap circle is at least this wide (design px; content/games/pet-clinic.ts › toolHitRadius). */
  petClinicToolHitMinPx: 80,
  /** Story 8.1: the idle reminder (the need line again) comes at most this many times per patient. */
  petClinicRemindMax: 2,
  /** Story 8.1: the head tilt of the static cat and rooster (their whole body turns on its feet, degrees); the double take turns ± this. */
  petClinicTiltDeg: 12,
  /** Story 8.1: a hop (a correct flourish, the thank-you) lifts the patient this high (design px; × reducedMotionAmplitude when reduced). */
  petClinicHopPx: 34,
  /** Story 8.1: the wiggle flourish turns ± this on the patient's feet (degrees; × reducedMotionAmplitude when reduced). */
  petClinicWiggleDeg: 6,
  /** Story 8.1: the sleepy patient's slow sway (degrees; none under reduced motion). */
  petClinicSwayDeg: 3,
  /** Story 8.1: a tapped patient's small squash (scale; × reducedMotionAmplitude when reduced). */
  petClinicTapSquash: 1.06,
  /** Story 8.1: the shower's water drops: how many, how wide they spread and how far they fall (design px). */
  petClinicDrops: 9,
  petClinicDropSpreadPx: 56,
  petClinicDropFallPx: 90,
  petClinicDropScale: 0.5,
  /** Story 8.1: the sparkle flourish: this many sparkles around the patient's back, this far (design px). */
  petClinicSparkles: 5,
  petClinicSparkleSpreadPx: 90,
  petClinicSparkleScale: 0.5,
  /** Story 8.1: a "z" (the yawn's cue, the blanket nap) and a heart (the thank-you) float this high (design px; they only fade when reduced). */
  petClinicFloatRisePx: 60,
  petClinicZScale: 0.5,
  petClinicHeartScale: 0.6,
  /** Story 8.1: the tummy's wavy lines are drawn at this scale and bob ± this (design px) when the tummy rumbles. */
  petClinicWaveScale: 0.6,
  petClinicWaveBobPx: 4,
  /** Story 8.1: the shower rocks ± this (degrees) this many times while it sprays. */
  petClinicShowerShakeDeg: 6,
  petClinicShowerShakes: 3,
  /** Story 8.1: the sparkles sit on an ellipse this much flatter than it is wide. */
  petClinicSparkleSquash: 0.6,
  /** Story 8.1: in a rigged patient's double take its head turns (the tilt frame) and its body sways only this share of ui.petClinicTiltDeg. */
  petClinicDoubleTakeBodyShare: 0.4,
  /** Story 8.2: the wardrobe round completes after this many wears or take-offs (then free play, the voice silent). */
  dressUpRoundChanges: 5,
  /** Story 8.2: a wardrobe icon's longest side (design px; build_dress_up.py scales each item to it). */
  dressUpIconPx: 100,
  /** Story 8.2: an item's tap circle is at least this wide (design px; spec: icons ≥ 110 with gaps ≥ spacing.targetGap). */
  dressUpItemHitPx: 110,
  /** Story 8.2: the reflection in the mirror is Shiba (and its outfit) at this scale, mirrored (negative scaleX). */
  dressUpMirrorScale: 0.6,
  /** Story 8.2: the reflection's alpha (the glass tints it a little). */
  dressUpMirrorAlpha: 0.9,
  /** Story 8.2: the happy hop's height and the giggle wiggle's angle (× reducedMotionAmplitude when reduced). */
  dressUpHopPx: 28,
  dressUpWiggleDeg: 5,
  /** Story 8.2: the take-off shake: ± this many design px, this many times (× reducedMotionAmplitude when reduced). */
  dressUpShakePx: 7,
  dressUpShakes: 3,
  /** Story 8.2: a tapped icon bounces to this scale and back. */
  dressUpIconBounce: 1.12,
  /** Story 8.2: the soft halo behind a worn item's icon (rings, peak alpha, padding over its tap circle). */
  dressUpGlowRings: 8,
  dressUpGlowAlpha: 0.6,
  dressUpGlowPadPx: 6,
  /** Trồng cây (2026-10-30): the can, each packet and each fruit is drawn at least this big (longest side, design px). */
  gardenTargetMinPx: 90,
  /** Trồng cây: their tap circles are at least this wide (design px). */
  gardenHitMinPx: 80,
  /** Trồng cây: the giant fruit (the `giant` surprise) is drawn at this scale of a fruit. */
  gardenGiantScale: 1.3,
  /** Trồng cây: the idle hint (the next thing bounces, its step line plays) at most this many times per step. */
  gardenHintMax: 3,
  /** Trồng cây: the idle hint's bounce (scale) and a growth step's squash-and-stretch pop (scale). */
  gardenHintBounce: 1.15,
  gardenPopScale: 1.12,
  /** Trồng cây: the can tilts this far over the soil while it pours (degrees, clockwise; × reducedMotionAmplitude when reduced). */
  gardenPourDeg: 38,
  /** Trồng cây: the water drops of one watering (count, x spread, fall, scale). */
  gardenDrops: 7,
  gardenDropSpreadPx: 30,
  gardenDropFallPx: 80,
  gardenDropScale: 0.7,
  /** Trồng cây: Shiba's flourishes: the hop, the wag (degrees), the hearts (count, rise, scale); a tap's squash. */
  gardenHopPx: 26,
  gardenWagDeg: 6,
  gardenHearts: 3,
  gardenFloatRisePx: 60,
  gardenHeartScale: 0.6,
  gardenTapSquash: 1.06,
  /** Trồng cây: the lemon's sour shiver (± design px, shakes; × reducedMotionAmplitude when reduced). */
  gardenShiverPx: 5,
  gardenShivers: 4,
  /** Trồng cây: the watermelon's spat pips and the tomato's juice drops (count, flight, scale). */
  gardenPips: 3,
  gardenJuiceDrops: 5,
  gardenSpitPx: 110,
  gardenParticleScale: 0.6,
  /** Trồng cây: the worm peeks this far out of the soil; the butterfly flies in from this far off (design px). */
  gardenWormRisePx: 26,
  gardenButterflyFromPx: 260,
  gardenButterflyScale: 0.8,
  /** Trồng cây: a picked fruit shrinks to this scale in Shiba's mouth. */
  gardenBiteScale: 0.45,
  /** Rửa xe (2026-10-30): the hose is drawn at least this big (longest side, design px); its tap circle at least this wide. */
  carWashHoseMinPx: 90,
  carWashHitMinPx: 80,
  /** Rửa xe: every car's hull is at least this wide (design px). */
  carWashCarMinPx: 300,
  /** Rửa xe: the car counts as foamed once this share of its dirt spots is under foam. */
  carWashFoamShare: 0.66,
  /** Rửa xe: a foam puff covers a dirt spot whose anchor is this close (design px). */
  carWashFoamCoverPx: 48,
  /** Rửa xe: while rubbing, a new puff needs the finger this far from the last one (design px). */
  carWashFoamStepPx: 26,
  /** Rửa xe: the foam pool (at most this many puffs on the car; the oldest is reused). */
  carWashFoamMax: 40,
  /** Rửa xe: a puff's drawn scale (it varies ± this jitter). */
  carWashFoamScale: 0.9,
  carWashFoamJitter: 0.2,
  /** Rửa xe: a puff is turned up to ± this (degrees) so the foam never looks stamped. */
  carWashFoamTiltDeg: 10,
  /** Rửa xe: the rub area reaches this far around the car's hull (a rub that starts just off the car still counts on it). */
  carWashRubPadPx: 40,
  /** Rửa xe: the idle hint at most this many times per step; its bounce (scale). */
  carWashHintMax: 3,
  carWashHintBounce: 1.1,
  /** Rửa xe: the tickled wiggle (degrees), the arrival hop and the clean bounce (design px), the sneeze squash (scale). */
  carWashWiggleDeg: 2.5,
  carWashHopPx: 18,
  carWashSneezeSquash: 0.94,
  /** Rửa xe: the car drives in from (and out to) this far off its rest spot (design px). */
  carWashDrivePx: 760,
  /** Rửa xe: the rinse: the hose tilts (degrees, × reducedMotionAmplitude when reduced); drops per wave; their scale. */
  carWashHoseTiltDeg: 16,
  carWashSprayDrops: 6,
  carWashDropScale: 0.8,
  /** Rửa xe: the shine: sparkles over the car, their scale. */
  carWashSparkles: 6,
  carWashSparkleScale: 0.8,
  /** Rửa xe: the duck rises this far out of the foam; the sneezed bubble floats this far up (design px). */
  carWashDuckRisePx: 34,
  carWashBubbleRisePx: 150,
  /** Phi công nhí (2026-11-11): a balloon (with its gift) is drawn at least this big (longest side, design px). */
  planeBalloonMinPx: 90,
  /** Phi công nhí: the plane catches a balloon whose centre is this close to its own (design px; ≥ planeCatchMinPx: generous). */
  planeCatchRadiusPx: 100,
  planeCatchMinPx: 80,
  /** Phi công nhí: the friend and its house are each drawn at least this big (longest side); their tap areas (and the parked plane's) at least this wide. */
  planeFriendMinPx: 150,
  planeHitMinPx: 80,
  /** Phi công nhí: the plane's centre flies between these heights (design px from the top); balloons come in at the top, the middle and the bottom of this band. */
  planeTopY: 190,
  planeBottomY: 440,
  /** Phi công nhí: the ground scrolls this fast in flight (design px per second); a balloon floats in this fast; the clouds and the bird drift this fast. */
  planeScrollPxPerS: 200,
  planeBalloonPxPerS: 250,
  planeCloudPxPerS: 110,
  planeBirdPxPerS: 150,
  /** Phi công nhí: under reduced motion every scroll speed is × this (a slower sky). */
  planeReducedScroll: 0.6,
  /** Phi công nhí: after this many misses in a row the next balloon comes in at the plane's own height. */
  planeHelpAfterMisses: 2,
  /** Phi công nhí: things enter and leave this far outside the screen (design px). */
  planeEdgePadPx: 90,
  /** Phi công nhí: a cloud whose centre is this close to the plane's gives a soft bounce (design px); the plane dips this far. */
  planeCloudBumpPx: 70,
  planeBouncePx: 16,
  /** Phi công nhí: a press this close to a bird's or a cloud's centre makes it react (design px). */
  planeTapRadiusPx: 64,
  /** Phi công nhí: the bird crosses again after flying this far past the screen (design px). */
  planeBirdGapPx: 1100,
  /** Phi công nhí: the friend's house starts this far past the right edge (its ground pivot; the friend stands to its left), then scrolls in. */
  planeHousePadPx: 300,
  /** Phi công nhí: the idle hint at most this many times per step; its bounce (scale). */
  planeHintMax: 3,
  planeHintBounce: 1.1,
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
  /**
   * Story 7.2: Ú òa chuồng thú (build_animal_pens.py): the barn front with its four pens, the doors, the pens'
   * dark insides, the straw and the roof. The lawn, sky and haze reuse art.touchTalk.
   */
  animalPens: {
    barn: colour('#E8735F'),
    barnDark: colour('#C4574B'),
    trim: colour('#FFF4E2'),
    roof: colour('#8E5B43'),
    door: colour('#F4B870'),
    doorDark: colour('#D9914E'),
    inside: colour('#5E3B2F'),
    straw: colour('#F7D46B'),
    hinge: colour('#6B4A3A'),
    // 2026-11-03: the chibi pen animals (cute.chibi; the dog is the island Shiba, colors.creatureOrange + art.creatureLight).
    catFur: colour('#B8B2CC'),
    catStripe: colour('#8D86A6'),
    catNose: colour('#FF9DB0'),
    roosterFur: colour('#F59A4F'),
    roosterBreast: colour('#FFD08A'),
    roosterWing: colour('#D9733A'),
    roosterComb: colour('#FF4F5E'),
    roosterBeak: colour('#FFC83D'),
    roosterTail: colour('#2F8F83'),
    roosterTail2: colour('#3D6FB8'),
    cowFur: colour('#FFF8EE'),
    cowPatch: colour('#5A4741'),
    cowMuzzle: colour('#FFC4C4'),
    cowHorn: colour('#FFEBB8'),
    pigFur: colour('#FFB8C8'),
    pigLight: colour('#FFD6E0'),
    pigSnout: colour('#FF94AC'),
    pigHoof: colour('#D97A92'),
    sheepWool: colour('#FFFDF7'),
    sheepFace: colour('#F2DCC0'),
    sheepLeg: colour('#6B5650'),
    horseFur: colour('#C07D4E'),
    horseLight: colour('#F6DDBA'),
    horseMane: colour('#5E3B2F'),
    hoof: colour('#5A4741'),
  },
  /**
   * Story 7.3: Ban nhạc (build_band.py): the stage (boards, curtain, bunting), the drum, the xylophone's rainbow bars,
   * the brass horn, the gold bell on its stand and the frog's stool. The lawn, sky and haze reuse art.touchTalk.
   */
  band: {
    wood: colour('#E8B27A'),
    woodDark: colour('#C98B55'),
    curtain: colour('#8C7BFF'),
    curtainDark: colour('#6F5CE0'),
    valance: colour('#FFD23F'),
    flagRed: colour('#FF6B6B'),
    flagYellow: colour('#FFD23F'),
    flagBlue: colour('#4D96FF'),
    flagGreen: colour('#6BCB77'),
    drum: colour('#FF6B6B'),
    drumRim: colour('#FFFFFF'),
    drumHead: colour('#FFF4E0'),
    lug: colour('#FFD166'),
    stick: colour('#F3D9B1'),
    barRed: colour('#FF6B6B'),
    barOrange: colour('#FF9A3C'),
    barYellow: colour('#FFD23F'),
    barGreen: colour('#6BCB77'),
    barBlue: colour('#4D96FF'),
    xyloFrame: colour('#B8794A'),
    mallet: colour('#FF7FAE'),
    brass: colour('#FFC94A'),
    brassDark: colour('#E0A526'),
    bell: colour('#FFD23F'),
    bellDark: colour('#E8B21E'),
    stand: colour('#4D96FF'),
    stool: colour('#FF9A3C'),
  },
  /**
   * Story 7.4: Giờ đi ngủ (build_bedtime.py): the bedroom's wall, wallpaper dots, floor boards, skirting, the window
   * (frame, the night sky, the moon, the curtains), the paintings, the quilt and its pattern, the toothpaste foam,
   * the stars and the "z". `nightTint` and `glow` are runtime colours: the night tint over the plate (alpha
   * ui.bedtimeNightAlpha, multiply blend) and the warm glow of the lamp and of the suggested step.
   */
  bedtime: {
    wall: colour('#FFE3D3'),
    wallDot: colour('#FFC9B5'),
    floor: colour('#D9A273'),
    floorDark: colour('#BF8558'),
    skirting: colour('#FFF6EC'),
    windowFrame: colour('#FFFFFF'),
    daySkyTop: colour('#8FD3FF'),
    daySkyLow: colour('#E6F7FF'),
    cloud: colour('#FFFFFF'),
    skyTop: colour('#2E3F8F'),
    skyLow: colour('#7D7FD1'),
    moon: colour('#FFF1B3'),
    curtain: colour('#9FC7FF'),
    curtainDark: colour('#7EAEF2'),
    paintSun: colour('#FFD23F'),
    paintSky: colour('#BDE6FF'),
    paintHill: colour('#9EDC8A'),
    paintHeart: colour('#FF8FB1'),
    quilt: colour('#FFD86B'),
    quiltPatch: colour('#FFFFFF'),
    quiltTrim: colour('#FF9EC4'),
    stool: colour('#B9E3C6'),
    mouth: colour('#7A3B3B'),
    tongue: colour('#FF8FA3'),
    eyeLine: colour('#3A2A22'),
    foam: colour('#FFFFFF'),
    star: colour('#FFE066'),
    z: colour('#C9B8FF'),
    nightTint: colour('#6F7FD0'),
    glow: colour('#FFE7A3'),
  },
  /**
   * Trồng cây (2026-10-30, build_garden.py): the yard bed (grass, the fence, the wooden bed and its soil), the plants
   * (leaves, stems, the flowers), the four fruits (strawberry, watermelon, tomato, lemon) and their seed packets, the
   * watering can, and the particles (water drop, seed, watermelon pip, tomato juice, heart, sparkle) and surprises
   * (butterfly, worm, rainbow). Never red feedback (the strawberry and the tomato are the fruits' own colours).
   */
  garden: {
    sky: colour('#BDE6FF'),
    grass: colour('#9ED97A'),
    grassDark: colour('#7CC25C'),
    fence: colour('#FFF6EC'),
    fenceShade: colour('#EBDCC9'),
    bed: colour('#D9A066'),
    bedDark: colour('#B97F48'),
    soil: colour('#8A5A3B'),
    soilDark: colour('#6B4329'),
    leaf: colour('#5DBB63'),
    leafDark: colour('#3F9A4B'),
    leafLight: colour('#8FD98A'),
    stem: colour('#6FB34F'),
    flower: colour('#FFFFFF'),
    flowerYellow: colour('#FFE066'),
    flowerHeart: colour('#FFD23F'),
    strawberry: colour('#F2475A'),
    strawberrySeed: colour('#FFE9A6'),
    watermelon: colour('#4FB35A'),
    watermelonStripe: colour('#2E7D3A'),
    watermelonFlesh: colour('#FF6F7D'),
    tomato: colour('#F2553A'),
    lemon: colour('#FFE14D'),
    lemonLight: colour('#FFF3A6'),
    packet: colour('#FFF6E0'),
    packetBand: colour('#FFB7CE'),
    can: colour('#7FC8F8'),
    canDark: colour('#4FA8E0'),
    drop: colour('#8FD3FF'),
    seed: colour('#C98B4F'),
    pip: colour('#2B2B2B'),
    juice: colour('#FF7A5C'),
    heart: colour('#FF9EC4'),
    sparkle: colour('#FFE066'),
    butterfly: colour('#FFB347'),
    butterflyDot: colour('#FFFFFF'),
    butterflyBody: colour('#5B4636'),
    worm: colour('#FF9EB5'),
    wormLight: colour('#FFC4D2'),
    rainbow1: colour('#FF8FA3'),
    rainbow2: colour('#FFC26B'),
    rainbow3: colour('#FFE680'),
    rainbow4: colour('#9ED97A'),
    rainbow5: colour('#8FD3FF'),
    rainbow6: colour('#B9A6FF'),
  },
  /**
   * Rửa xe (2026-10-30, build_car_wash.py): the car-wash bay (sky, the back wall and its stripe, the tiled floor and
   * its grout, the drain, the puddle, the arch and its roller brushes, the bubble sign), the hose (its reel, the hose
   * itself, the spray gun), the dirt kinds (mud, leaves, ice-cream drips, dust), the foam, the particles (water drop,
   * sparkle, soap bubble) and the rainbow. The cars keep the Kenney colours. Never red feedback.
   */
  carWash: {
    sky: colour('#BDE6FF'),
    wall: colour('#FFF1DC'),
    wallStripe: colour('#9FD8F7'),
    wallTile: colour('#FFE6C4'),
    floor: colour('#E6F4FA'),
    floorGrout: colour('#C9E4EF'),
    drain: colour('#9AB3BF'),
    puddle: colour('#A8DDF7'),
    arch: colour('#FFB7CE'),
    archDark: colour('#F294B3'),
    brush: colour('#7FC8F8'),
    brushDark: colour('#4FA8E0'),
    sign: colour('#FFFFFF'),
    reel: colour('#FFC26B'),
    reelDark: colour('#E8A24A'),
    hose: colour('#5DBB63'),
    hoseDark: colour('#3F9A4B'),
    nozzle: colour('#FFE066'),
    nozzleDark: colour('#F2B33D'),
    mud: colour('#8B5E3C'),
    mudDark: colour('#6B4329'),
    leaf: colour('#8FC85A'),
    leafAutumn: colour('#F2A65A'),
    leafRed: colour('#E98A5B'),
    cream: colour('#FFB7CE'),
    creamMint: colour('#B5EAD7'),
    creamCone: colour('#F2C98B'),
    dust: colour('#C9B9A6'),
    dustDark: colour('#A8977F'),
    foam: colour('#FFFFFF'),
    foamShade: colour('#E3F1FB'),
    bubble: colour('#DDF2FF'),
    drop: colour('#8FD3FF'),
    sparkle: colour('#FFE680'),
    headlight: colour('#FFF6C2'),
    rainbow1: colour('#FF8FA3'),
    rainbow2: colour('#FFC26B'),
    rainbow3: colour('#FFE680'),
    rainbow4: colour('#9ED97A'),
    rainbow5: colour('#8FD3FF'),
    rainbow6: colour('#B9A6FF'),
  },
  /**
   * Phi công nhí (2026-11-11, build_plane.py): the sky plate (top and horizon colours, the sun), the clouds, the
   * hills, the ground strip and its flowers, the toy plane (body, belly, wings, tail, nose, propeller and its blur,
   * wheels, the pilot's goggles and scarf), the four balloons and gift boxes (red, yellow, green, purple: a colour and
   * its shade each), the string and ribbon, the parachute, the pop burst, the six friends' houses (a wall and a roof
   * each), the bird, the hot-air balloon and the rainbow. The friends use art.animalPens. Never red feedback.
   */
  plane: {
    sky: colour('#8FD3FF'),
    skyLow: colour('#DDF2FF'),
    sun: colour('#FFE680'),
    cloud: colour('#FFFFFF'),
    cloudShade: colour('#E3F1FB'),
    hill: colour('#A6DC8C'),
    hillDark: colour('#86C873'),
    grass: colour('#8FD46B'),
    grassDark: colour('#6FBE55'),
    soil: colour('#C99A6B'),
    flower: colour('#FFB7CE'),
    flowerCentre: colour('#FFE680'),
    body: colour('#FFC94D'),
    bodyDark: colour('#F2A93B'),
    belly: colour('#FFF4E2'),
    wing: colour('#FF9FB5'),
    wingDark: colour('#F27F9B'),
    nose: colour('#7FC8F8'),
    prop: colour('#8E5B43'),
    propBlur: colour('#EAF6FF'),
    wheel: colour('#5E4B45'),
    goggles: colour('#6B4A3A'),
    gogglesGlass: colour('#BDE6FF'),
    scarf: colour('#7FC8F8'),
    balloonRed: colour('#F2616D'),
    balloonRedDark: colour('#D64656'),
    balloonYellow: colour('#FFD23F'),
    balloonYellowDark: colour('#F2B33D'),
    balloonGreen: colour('#6CCB6F'),
    balloonGreenDark: colour('#4FAE57'),
    balloonPurple: colour('#A98BEF'),
    balloonPurpleDark: colour('#8A6BD6'),
    string: colour('#FFFFFF'),
    ribbon: colour('#FFFFFF'),
    parachute: colour('#FFFFFF'),
    parachuteStripe: colour('#FFB7CE'),
    pop: colour('#FFF6C2'),
    houseCat: colour('#C9B8F2'),
    houseCatRoof: colour('#8A6BD6'),
    housePig: colour('#FFC9D6'),
    housePigRoof: colour('#F27F9B'),
    houseSheep: colour('#FFF4E2'),
    houseSheepRoof: colour('#7FC8F8'),
    houseCow: colour('#E8735F'),
    houseCowRoof: colour('#8E5B43'),
    houseHorse: colour('#F4B870'),
    houseHorseRoof: colour('#6FBE55'),
    houseRooster: colour('#FFE08A'),
    houseRoosterRoof: colour('#F2616D'),
    door: colour('#8E5B43'),
    window: colour('#BDE6FF'),
    trim: colour('#FFFFFF'),
    bird: colour('#7FC8F8'),
    birdBelly: colour('#FFFFFF'),
    birdBeak: colour('#FFC26B'),
    hotAir: colour('#FF9FB5'),
    hotAirStripe: colour('#FFE680'),
    basket: colour('#C99A6B'),
    heart: colour('#FFC9D6'),
    heartShade: colour('#FFB0C4'),
    rainbow1: colour('#FF8FA3'),
    rainbow2: colour('#FFC26B'),
    rainbow3: colour('#FFE680'),
    rainbow4: colour('#9ED97A'),
    rainbow5: colour('#8FD3FF'),
    rainbow6: colour('#B9A6FF'),
  },
  /**
   * Story 8.1: Bác sĩ thú cưng (build_pet_clinic.py): the clinic room (wall, wallpaper dots, floor, skirting, the
   * window), the exam mat, the tool cart, the four tools (shower head, milk bottle, plaster, blanket), the overlays
   * (mud splats, the scrape) and the particles (water drop, wavy tummy lines, "z", sparkle, heart). Never red.
   */
  petClinic: {
    wall: colour('#C6EBE2'),
    wallDot: colour('#A8DCCF'),
    floor: colour('#F2D3A8'),
    floorDark: colour('#E0B987'),
    skirting: colour('#FFFFFF'),
    windowFrame: colour('#FFFFFF'),
    sky: colour('#BFE6FF'),
    mat: colour('#9FD8F7'),
    matTrim: colour('#FFFFFF'),
    cart: colour('#FFB7CE'),
    cartDark: colour('#F294B3'),
    cross: colour('#5CC8B4'),
    shower: colour('#7FC8F8'),
    showerDark: colour('#4FA8E0'),
    chrome: colour('#E8EEF2'),
    bottle: colour('#F4FBFF'),
    milk: colour('#FFFFFF'),
    teat: colour('#FFC26B'),
    cap: colour('#8FD6A8'),
    plaster: colour('#F7C9A0'),
    plasterPad: colour('#FFF4EA'),
    blanket: colour('#B9A6FF'),
    blanketPatch: colour('#FFFFFF'),
    mud: colour('#8B5E3C'),
    mudDark: colour('#553823'),
    scrape: colour('#F59A9A'),
    scrapeDark: colour('#E98394'),
    drop: colour('#8FD3FF'),
    wave: colour('#7A6BB0'),
    z: colour('#C9B8FF'),
    sparkle: colour('#FFE066'),
    heart: colour('#FF9EC4'),
  },
  /**
   * Story 8.2: Thay đồ cho Shiba (build_dress_up.py, outfit.py; also read by build_map.py and build_ice_cream.py for the
   * outfit items). The wardrobe room (wall, wallpaper dots, floor, skirting, rug), the open wardrobe and its shelves,
   * the standing mirror, and the eleven items: party cone, cowboy hat, gold crown, knitted beanie; round red glasses,
   * pink heart sunglasses (tinted lenses), yellow star glasses; striped T-shirt, yellow raincoat, red jumper with a
   * heart, Hawaiian flower shirt; the shirts' hanger. `glow` is a runtime colour: the soft halo behind a worn item.
   */
  dressUp: {
    wall: colour('#C9E3FF'),
    wallDot: colour('#ADD2FA'),
    floor: colour('#E8C39E'),
    floorDark: colour('#D4A87E'),
    skirting: colour('#FFFFFF'),
    rug: colour('#FFD0E1'),
    wardrobe: colour('#FFB7CE'),
    wardrobeDark: colour('#F294B3'),
    wardrobeInside: colour('#FFF1F6'),
    shelf: colour('#FFFFFF'),
    knob: colour('#FFD23F'),
    rail: colour('#C9CED6'),
    mirrorFrame: colour('#FFD23F'),
    mirrorFrameDark: colour('#E8B21E'),
    mirrorGlass: colour('#CDEBFF'),
    mirrorShine: colour('#FFFFFF'),
    partyHat: colour('#FF7EB6'),
    partyDot: colour('#FFE066'),
    partyTrim: colour('#4D96FF'),
    pompom: colour('#FFFFFF'),
    cowboy: colour('#C98B4F'),
    cowboyBand: colour('#7A4A2A'),
    crown: colour('#FFCA28'),
    gemPink: colour('#FF5C8A'),
    gemBlue: colour('#4D96FF'),
    beanie: colour('#6BCB77'),
    beanieStripe: colour('#B8F0BE'),
    beanieCuff: colour('#4FAE5C'),
    glassesRed: colour('#F23D3D'),
    heartRim: colour('#FF5FA8'),
    heartLens: colour('#FF9EC4'),
    starRim: colour('#FFC21A'),
    starLens: colour('#FFF1A8'),
    stripeA: colour('#4D96FF'),
    stripeB: colour('#FFFFFF'),
    raincoat: colour('#FFD23F'),
    raincoatTrim: colour('#E8B21E'),
    raincoatButton: colour('#3A6EA5'),
    jumper: colour('#E8373C'),
    jumperRib: colour('#C42B30'),
    jumperHeart: colour('#FFFFFF'),
    flowerShirt: colour('#3EC8C8'),
    flowerPink: colour('#FF8FB1'),
    flowerWhite: colour('#FFFFFF'),
    flowerYellow: colour('#FFE066'),
    hanger: colour('#C98B4F'),
    form: colour('#FFF6EC'),
    glow: colour('#FFE7A3'),
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
