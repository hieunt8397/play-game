// Every behavioural duration named in EXPERIENCE.md (AD-8). Exposed as `Tokens.Timing.*`.
// All values are milliseconds unless the name says otherwise. EXPERIENCE marks the hint and
// invitation timings as "to be tuned with the child" (Open Questions 3) — tune them here only.
// Visual-component motions that DESIGN.md defines (pulse, snap, return, celebrate, react) live in
// the generated design tokens, not here.

export const Timing = {
  /** NFR5: every tap gets visible/audible feedback within this budget. */
  feedbackMaxMs: 100,

  // --- Start screen (State 'Đang tải', loading-strip, button-play, button-round) ---
  /** loading-strip: one kart lap along the short road (EXPERIENCE: 'Kart chạy vòng liên tục khi đang tải'; tuned value). */
  loadingKartLapMs: 1600,
  /** loading-strip: kart tween time-scale while a failed load waits (EXPERIENCE: 'mất mạng → kart chậm lại đứng chờ'); a factor, not ms. */
  loadingKartWaitTimeScale: 0.25,
  /** Failed first load retries on its own this often, besides on window 'online' (EXPERIENCE: 'tự thử lại khi có mạng'). */
  loadRetryMs: 5000,
  /** button-play 'Nhún chậm' (slow bob): one up-or-down half cycle; matches the 1.4 s invitation bob of DESIGN station invite. */
  playBobMs: 1400,
  /** button-round press: spring back from 0.9× (epic UX › Base button 'presses to 0.9× and springs back'); well inside feedbackMaxMs for the visual start. */
  buttonPressMs: 180,
  /**
   * Technical, not an EXPERIENCE value (Story 1.11): how long Boot's readiness gate waits for the
   * first service-worker precache before it continues online. The child is never blocked; offline
   * then works from the next successful open.
   */
  swPrecacheTimeoutMs: 20000,

  // --- Map (State "Mời chơi", station-hotspot, kart) ---
  /** One station gently moves every 4–6 s while idle. */
  mapAmbientMinMs: 4000,
  mapAmbientMaxMs: 6000,
  /** First invitation (hint ring + invite + station name) after ~8 s idle. */
  mapInviteFirstMs: 8000,
  /** Later invitations at least 20 s apart … */
  mapInviteGapMs: 20000,
  /** … at most this many times, then only the ambient bob remains. */
  mapInviteMaxCount: 3,
  /** Ambient station motion: one 1 → ambientScale → 1 yoyo takes this long (Story 1.5). */
  mapAmbientMoveMs: 800,
  /** An invitation (ring + bob) shows this long unless a tap ends it: 4 bob half-cycles of 1.4 s. */
  mapInviteHoldMs: 5600,
  /** Station bounce + name readout before the kart drives (~0.5 s). */
  stationTapMs: 500,
  /** Hard cap on kart drive regardless of distance (first trip in session). */
  kartDriveMaxMs: 2000,
  /** Hard cap on later trips in the same session. */
  kartDriveRepeatMaxMs: 1500,
  /** Shortest kart drive (Story 1.7): a short hop still reads as a drive, not a jump. */
  kartDriveMinMs: 400,
  /** Camera pan + zoom onto the station before its game starts (Story 1.7). */
  cameraZoomInMs: 600,
  /** Scene fade: the reduced-motion enter, every game reveal and the return to the island (Story 1.7). */
  sceneFadeMs: 300,
  /** Story 5.2 guide Shiba: one wave frame (shiba/wave/00..03) shows this long. */
  guideWaveFrameMs: 160,
  /** Story 5.2: one wave (greeting or invitation) lasts this long — two passes over the 4 frames (2 × 4 × guideWaveFrameMs) — then idle. */
  guideWaveMs: 1280,
  /** Story 5.6: one map foam-wave bob (up and back down) takes this long (≥ flashMinPeriodMs). */
  mapWaveBobMs: 3200,
  /** Story 5.6: one fountain jet frame (fountain/spray/00..02); cycle period (3 frames) ≥ flashMinPeriodMs. */
  fountainFrameMs: 400,
  /** Story 5.6: the whale's first spout comes this long into an idle Map visit (after the greeting wave). */
  whaleFirstMs: 3000,
  /** Story 5.6: then the whale spouts again this often (on a free tick: never with a bounce or an invitation). */
  whaleEveryMs: 14000,
  /** Story 5.6: one whale spout frame (whale/spout/00..03). */
  whaleSpoutFrameMs: 250,
  /** Story 5.6: one spout lasts this long (4 × whaleSpoutFrameMs), then idle; no other prominent motion meanwhile. */
  whaleSpoutMs: 1000,

  // --- Drag & drop (draggable-item) ---
  /** Dropped off the counter → slides back after this delay. */
  dragOffCounterReturnDelayMs: 1500,

  /** Story 5.1 tap-then-tap: a selected item flies to the tapped spot over this long. */
  tapFlyMs: 250,

  // --- Tap reactions (Story 5.4, FR33 / FR53) ---
  /** A background tap's light ripple grows and fades over this. */
  tapRippleMs: 450,
  /** At most one ripple per this long (flashing ≤ 1 Hz, = flashMinPeriodMs). */
  tapRippleMinGapMs: 1000,

  // --- Hints (State "Gợi ý") ---
  /** Level 2 after this long idle (clock starts when the prompt finishes). */
  hintLevel2IdleMs: 6000,
  /** Level 3 after this much further idle. */
  hintLevel3ExtraIdleMs: 6000,
  /** Hint hand demonstration loops every ~15 s. */
  hintHandLoopMs: 15000,
  /** At level 3 the voice repeats every ~30 s. */
  hintVoiceRepeatMs: 30000,
  /** A voice retry plays at most once per 10 s. */
  voiceRetryMinGapMs: 10000,
  /** Story 1.9: the HintDirector's scene-clock tick (both hint clocks advance by this per tick). */
  hintTickMs: 100,
  /** Story 1.9 hint hand: press on the item. */
  hintHandPressMs: 250,
  /** Story 1.9 hint hand: move from the item to the target centre (ease in-out). */
  hintHandMoveMs: 1200,
  /** Story 5.1 hint hand (tap-then-tap demo): the finger lifts off the item before it travels to the target. */
  hintHandTapLiftMs: 200,
  /** Story 1.9 hint hand: lift and fade out. */
  hintHandFadeMs: 300,
  /** Story 1.9 level 4: a distractor fades to ui.hintDimAlpha over this long. */
  hintDimFadeMs: 300,

  // --- Voice channel (Interaction Primitives) ---
  /** A new line waits for the current one if it has less than this left. */
  voiceQueueTailMs: 500,

  // --- Audio mix (Voice and Tone › Âm thanh) ---
  musicDuckDownMs: 150,
  musicDuckRestoreDelayMs: 500,
  sfxFadeInMinMs: 50,
  characterSoundMaxMs: 800,

  // --- Correct answer / round end (States "Đúng", "Xong lượt") ---
  correctMusicMinMs: 1000,
  correctMusicMaxMs: 2000,
  roundCelebrationMs: 1500,
  cameraPullBackMaxMs: 1500,
  /**
   * Story 2.3: the post-round camera pull-back (zoom cameraZoomScale → 1, ease-out) after Home in a
   * finished round.
   */
  cameraPullBackMs: 1200,
  /** Story 5.3 (NFR15): a celebration or transition longer than this can be skipped with a tap. */
  skipThresholdMs: 1500,
  /** Story 5.3: a skip tap counts only this long after the sequence starts (the answering gesture never skips). */
  skipArmMs: 250,
  /** Story 5.3: a skip fast-forwards the scene's tweens and clock by this factor; a factor, not ms. */
  skipTimeScale: 40,
  /** Story 5.3: an answered prompt fades to silence over this (≤ 200 ms). */
  promptFadeOutMs: 150,
  /** Story 5.3 (NFR15): a prompt line's audio lasts at most this long (validate:content). */
  promptMaxMs: 4000,
  /** Story 5.3: the length estimate of a celebration name line (sizes a skip window). */
  celebrationLineMs: 1000,
  /**
   * Seamless play (2026-10-21): after `round:complete` (the celebration is over) the game waits this long,
   * fades out over sceneFadeMs and restarts itself with its next round.
   */
  nextRoundDelayMs: 500,

  // --- Accessibility floor ---
  /** Flashing ≤ 1 Hz → one flash cycle takes at least this long. */
  flashMinPeriodMs: 1000,

  // --- Per-game table ---
  /** Làm pizza: bake time after tapping the oven. */
  pizzaBakeMs: 2000,
  /** Làm pizza: all toppings placed but oven not tapped → ring + hand. */
  pizzaOvenIdleHintMs: 6000,
  /** Story 3.1: one fox breath (1 → ui.foxBreathScale, yoyo). */
  foxBreathMs: 2400,
  /** Story 3.1: the oven glow rises 0 → 1 over this, holds pizzaBakeMs, then falls over this (once; no blinking). */
  ovenGlowRiseMs: 400,
  /** Story 3.1: the base slides into the oven, and the baked base out to the fox's plate, over this. */
  pizzaSlideMs: 400,
  /** Story 3.1: the fox eats (eat frames + munch) this long. */
  pizzaEatMs: 1200,
  /** 2026-10-16: one oven breath while baking (a full in-out cycle), and the serve pop. */
  ovenBakeWobbleMs: 600,
  pizzaServePopMs: 280,
  /** Story 3.1: one recount bounce of a placed slice (1 → ui.pizzaCountBounceScale → 1). */
  pizzaCountBounceMs: 240,
  /** Story 3.1: steam puffs rise from the baked pizza over this. */
  pizzaSteamMs: 1200,
  /** Story 3.3 Ghép khủng long: the come-alive blink (`<s>/blink/00`) shows this long. */
  dinoBlinkMs: 160,
  /** Story 3.3: the come-alive walk to `anchor.<s>-walk` takes this long. */
  dinoWalkMs: 1200,
  /** Story 3.3 / 3.4: each walk frame (`<s>/walk/00..01`; 2 frames since Story 3.4) shows this long. */
  dinoWalkFrameMs: 300,
  /** Story 3.3: the dino's happy call plays this long before its name is said. */
  dinoCallMs: 800,
  /** Story 3.3: the next dino's ghost and pieces fade in over this. */
  dinoNextFadeMs: 500,
  /** Story 3.3: one cloud drift (± ui.dinoCloudDriftPx, yoyo) takes this long. */
  dinoCloudDriftMs: 8000,
  /** Hang tìm bóng (2026-10-22): the revealed item's happy hop and bounce (with its sparkle) after a correct reveal. */
  shadowHappyMs: 600,
  /** Hang tìm bóng (2026-10-22): the hop starts this long before the item's name is said. */
  shadowNameDelayMs: 500,
  /** Story 3.5: the shadow cross-fades to the item's colour frame over this. */
  shadowRevealMs: 400,
  /** Story 3.5: the next item and its shadows fade in over this. */
  shadowItemFadeMs: 400,
  /** Story 4.1 Đường đua: one blink of a waiting kart (≤ 1 Hz). */
  raceWaitBlinkMs: 1200,
  /** Story 4.1: one sweep of the level-2 guide glow along the dash ahead. */
  raceGuideSweepMs: 1500,
  /** Story 4.1: the short celebration after a road that is not the last. */
  raceShortCelebrateMs: 1000,
  /** Story 4.1: one frame of the driver's wave. */
  raceWaveFrameMs: 150,
  /** Story 4.2: one cone sway (± ui.raceConeSwayDeg, yoyo). */
  raceConeSwayMs: 2200,
  /** Story 4.2: one flag sway (± ui.raceFlagSwayDeg, yoyo). */
  raceFlagSwayMs: 1700,
  /** Tiệm kem: one Shiba breath (1 → ui.shibaBreathScale, yoyo) takes this long (Story 1.8). */
  shibaBreathMs: 2400,
  /** Story 6.1: free play: the full tower wobbles this long before it topples. */
  iceCreamTowerWobbleMs: 900,
  /** Story 6.1: a toppled scoop falls to the counter in this long (then a small bounce of half of it). */
  iceCreamToppleMs: 600,
  /** 2026-10-21: a dropped scoop falls (or rises) onto the table row in this long (then a bounce of half of it). */
  iceCreamRestFallMs: 260,
  /** Story 6.1: a different flavour: Shiba tastes it (a lick frame) this long before the grimace. */
  iceCreamTasteMs: 450,
  /** Story 6.1: the grimace shows this long before the scoop floats back. */
  iceCreamGrimaceMs: 700,
  /** Story 6.1: the shiver reaction lasts this long (its two frames alternate with a sideways shake). */
  iceCreamShiverMs: 1200,
  /** Story 6.1: one sneeze frame (wind-up, eyes shut, burst) shows this long; the burst holds 2 frames. */
  iceCreamSneezeFrameMs: 320,
  /** Story 6.1: the shiver's frames swap this often. */
  iceCreamShiverFrameMs: 100,
  /** Story 4.3 Câu cá: a fish's past positions are kept this long (the lookback hit test). */
  fishHistoryKeepMs: 300,
  /** Story 4.3: one swim frame. */
  fishSwimFrameMs: 200,
  /** Story 4.3: a wrong fish sinks and fades over this. */
  fishDiveMs: 400,
  /** Story 4.3: a water ripple grows and fades over this. */
  fishRippleMs: 500,
  /** Story 4.3: the caught fish is reeled up to the rod over this. */
  fishReelMs: 700,
  /** 2026-10-16: one splash: the drops fly up and fall back over this. */
  fishSplashMs: 650,
  /** Story 4.3: one wriggle frame of a caught fish. */
  fishWriggleFrameMs: 120,
  /** Story 4.3: the caught fish's jump. */
  fishJumpMs: 600,
  /** Story 4.3: after the name, the next question's fish swim in this much later. */
  fishShortCelebrateMs: 600,
  /** Story 4.3: one swim step covers at most this long (a stalled frame never teleports a fish). */
  fishMaxTickMs: 250,
  /** Câu cá: wrong fish dives and resurfaces after ~3 s. */
  fishResurfaceMs: 3000,
  /** Câu cá: hit test also against fish positions this long ago (latency compensation). */
  fishHitLookbackMs: 150,
  /** Story 4.5 Chạm là nói: a tapped prop's name follows its sound this much later (2026-10-22: 800 ms, just past the longest real prop sound, ≤ 0.8 s). */
  touchTalkNameDelayMs: 800,
  /** Story 4.5: one silent idle wiggle. */
  touchTalkWiggleMs: 900,
  /** Story 4.5: one controller tick covers at most this long (a stalled frame never skips a name). */
  touchTalkMaxTickMs: 250,
  /** Chạm là nói: idle → one random prop wiggles silently. */
  touchTalkIdleWiggleMs: 15000,
  /** Chạm là nói: scene-bubble slide between scenes. */
  touchTalkSceneSlideMs: 600,
  /** Story 7.2 Ú òa chuồng thú: an animal's name follows its call this much later (every call ≤ 0.8 s). */
  animalPensNameDelayMs: 800,
  /** Story 7.2: a door swings open or shut. */
  animalPensDoorMs: 260,
  /** Story 7.2: the animal rises into the open doorway. */
  animalPensRiseMs: 390,
  /** Story 7.2: one gentle door wiggle (with the muffled call). */
  animalPensWiggleMs: 900,
  /** Story 7.2: the harder wiggle of the asked animal's door. */
  animalPensAskWiggleMs: 1400,
  /** Story 7.2: a closed door wiggles after this long without a tap or another wiggle. */
  animalPensIdleWiggleMs: 5000,
  /** Story 7.2: an ask comes after this long without a tap (besides every ui.animalPensAskEvery reveals). */
  animalPensAskIdleMs: 15000,
  /** Story 7.2: the last reveal's name plays this long before the celebration starts. */
  animalPensCelebrateLeadMs: 1300,
  /** Story 7.2: the round's celebration (all doors open, the animals bounce) before the round completes. */
  animalPensCelebrateMs: 2600,
  /** Story 7.2: one celebration hop (up; yoyo down), and the hop's delay from one door to the next. */
  animalPensHopMs: 320,
  animalPensHopStaggerMs: 120,
  /** Story 7.2: one controller tick covers at most this long (a stalled frame never skips a name). */
  animalPensMaxTickMs: 250,
  /** Story 7.3 Ban nhạc: the soft idle beat starts after this long without a tap (an invitation to play). */
  bandIdleBeatMs: 6000,
  /** Story 7.3: one beat of the idle loop (80 BPM; music.band-beat holds content BEAT_LOOP_BEATS of them). */
  bandBeatMs: 750,
  /** Story 7.3: a tap this close to a beat (either side) shows a small sparkle (never a score). */
  bandBeatWindowMs: 150,
  /** Story 7.3: a tapped instrument bounces (squash up, spring back) — the one prominent motion while it runs. */
  bandBounceMs: 260,
  /** Story 7.3: one gentle bob of an instrument to the beat (up and back; one instrument per bob). */
  bandBobMs: 600,
  /** Story 7.3: the on-beat sparkle (a few stars rising and fading; no drift when reduced). */
  bandSparkleMs: 650,
  /** Story 7.3: one controller tick covers at most this long (a stalled frame never skips beats in a burst). */
  bandMaxTickMs: 250,
  /** Story 7.3: a band note cut by the voice cap (or Home) fades out this fast (audio clock; no click). */
  bandNoteCutMs: 40,
  /** Story 7.3 review: the island loop fades out as the band opens and back in when it closes. */
  bandMusicFadeMs: 600,
  /** Story 7.3 review: the beat fades out this fast when it stops (quiet beats, Home). */
  bandBeatFadeMs: 150,
  /** Story 7.4 Giờ đi ngủ (calm pace: every tween ≥ 600 ms): the brush travels from its cup to Shiba's mouth (and back). */
  bedtimeBrushMoveMs: 800,
  /** Story 7.4: the brush scrubs at the mouth (foam bubbles, Shiba giggles). */
  bedtimeScrubMs: 1400,
  /** Story 7.4: Shiba changes pose (a crossfade between its frames). */
  bedtimePoseFadeMs: 700,
  /** Story 7.4: the lamp clicks off (its frames crossfade). */
  bedtimeLampMs: 600,
  /** Story 7.4: the room fades to the soft blue night (never a flash; reduced motion: the same crossfade). */
  bedtimeNightFadeMs: 2000,
  /** Story 7.4: the blanket spreads over Shiba (its frames crossfade). */
  bedtimeBlanketMs: 900,
  /** Story 7.4: Shiba's yawn is held this long. */
  bedtimeYawnMs: 1500,
  /** Story 7.4: a quiet pause after a step before the next suggestion (its glow and line). */
  bedtimeStepGapMs: 700,
  /** Story 7.4: a repeat tap's small reaction (foam puff, lamp wiggle, blanket tuck): two halves of ≥ 600 ms (review). */
  bedtimeRepeatMs: 1200,
  /** Story 7.4: the suggested step's glow breathes once per this long (≤ 1 Hz). */
  bedtimeGlowPulseMs: 2000,
  /** Story 7.4: the stars at the window fade in, then twinkle softly once per this long. */
  bedtimeStarsMs: 2400,
  bedtimeTwinkleMs: 3000,
  /** Story 7.4: while asleep, a soft "khò khò" and a floating "z" come this often (the first one at once). */
  bedtimeSnoreEveryMs: 5000,
  /** Story 7.4: one "z" floats up and fades. */
  bedtimeZMs: 2600,
  /** Story 7.4: the sleeping Shiba rolls over (its frames crossfade). */
  bedtimeRollMs: 900,
  /** Story 7.4: the island loop fades out as the bedroom opens and back in when it closes; the lullaby fades in and out. */
  bedtimeMusicFadeMs: 1200,
  bedtimeLullabyFadeMs: 2000,
  /** Story 7.4: one controller tick covers at most this long (a stalled frame never skips a step's end). */
  bedtimeMaxTickMs: 250,
  /** Story 7.4: a foam bubble fades in, then floats up as it fades out. */
  bedtimeBubbleInMs: 600,
  bedtimeBubbleOutMs: 900,
  /** Story 7.4: each star fades in this long after the one before; their twinkles are this far apart. */
  bedtimeStarStaggerMs: 300,
  bedtimeTwinkleStaggerMs: 500,
  /** Story 8.1 Bác sĩ thú cưng: a patient walks in from the door (> skipThresholdMs: a tap skips it), and out again. */
  petClinicWalkMs: 1800,
  petClinicWalkOutMs: 1800,
  /** Story 8.1: a used tool flies to its spot on the patient. */
  petClinicToolFlyMs: 600,
  /** Story 8.1: a fix's own reaction (the shower and giggle, the milk and burp, the plaster pat); the blanket's short nap is longer. */
  petClinicActMs: 1500,
  petClinicNapMs: 2600,
  /** Story 8.1: the used tool goes back to its tray place. */
  petClinicToolReturnMs: 600,
  /** Story 8.1: an overlay (mud, plaster, blanket, bottle) fades in or out. */
  petClinicFadeMs: 500,
  /** Story 8.1: the correct flourish after a fix (hop, wiggle, sparkle), then the next need line. */
  petClinicFlourishMs: 900,
  /** Story 8.1: the chose-other head tilt (held, then back); the need line follows it; the tool floats back meanwhile. */
  petClinicTiltMs: 1300,
  /** Story 8.1: a tapped patient's small reaction (its call and a squash). */
  petClinicTapMs: 700,
  /** Story 8.1: the well patient thanks Xoài and hops before it walks out; a short pause before the next one walks in. */
  petClinicThanksMs: 1600,
  petClinicGapMs: 500,
  /** Story 8.1: a waiting tummy rumbles / a sleepy patient yawns this often (one cue at a time, alternating). */
  petClinicCueEveryMs: 6000,
  /** Story 8.1: the need line is said again after this long without a tap (at most ui.petClinicRemindMax times per patient). */
  petClinicRemindIdleMs: 15000,
  /** Story 8.1: after the round's last patient has walked out, the round completes after this (then the next round). */
  petClinicFinishMs: 800,
  /** Story 8.1: particles: a water drop falls, a sparkle twinkles, a "z" or heart floats up, the wavy lines bob. */
  petClinicDropMs: 700,
  petClinicDropInMs: 230,
  petClinicSparkleMs: 900,
  petClinicFloatMs: 1800,
  petClinicWaveMs: 1200,
  /** Story 8.1: one controller tick covers at most this long (a stalled frame never skips a step's end). */
  petClinicMaxTickMs: 250,
  /** Story 8.2: the wear reactions: turn to the mirror and smile (the turn frames, held), the happy hop with a wag, the giggle and wiggle. */
  dressUpTurnMs: 1400,
  dressUpHopMs: 800,
  dressUpGiggleMs: 900,
  /** Story 8.2: a reaction's frames swap this often (the happy wag, the turn). */
  dressUpFrameMs: 220,
  /** Story 8.2: the take-off: a small shake and a soft pop. */
  dressUpShakeMs: 420,
  /** Story 8.2: an item fades on or off Shiba, and its icon's halo fades. */
  dressUpFadeMs: 220,
  /** Story 8.2: a tapped icon's bounce. */
  dressUpIconBounceMs: 260,
  /** Trồng cây (2026-10-30): a packet tapped: the other fades, the seed drops into the soil and the sprout pops up. */
  gardenPlantMs: 1300,
  /** Trồng cây: one watering (the can flies over the soil, tilts and pours, the plant grows one stage, the can goes back): ≤ 1.5 s. */
  gardenGrowMs: 1400,
  /** Trồng cây: the can's flight to the soil and back (each, inside gardenGrowMs). */
  gardenCanFlyMs: 300,
  /** Trồng cây: a surprise (the worm peeks, the butterfly lands, the rainbow shows). */
  gardenSurpriseMs: 1600,
  /** Trồng cây: a picked fruit hops to Shiba's mouth; each bite; the fruit's own reaction; the flourish. */
  gardenPickMs: 550,
  gardenBiteMs: 600,
  gardenReactMs: 1300,
  gardenFlourishMs: 700,
  /** Trồng cây: after the last fruit the plant fades back into the soil, then the new packets pop in. */
  gardenClearMs: 1000,
  gardenPacketsInMs: 500,
  /** Trồng cây: a crossfade between two frames (plant stages, Shiba's faces). */
  gardenFadeMs: 250,
  /** Trồng cây: Shiba's frames swap this often (chewing, the wag, the shiver). */
  gardenFrameMs: 180,
  /** Trồng cây: after this long without a tap the next thing to tap bounces and its step line plays (≤ ui.gardenHintMax per step). */
  gardenIdleHintMs: 8000,
  /** Trồng cây: Shiba tapped (a squash and a woof); a thing tapped out of its turn (a small nudge). */
  gardenTapMs: 600,
  /** Trồng cây: a heart or a sparkle floats up and fades. */
  gardenFloatMs: 1400,
  /** Trồng cây: one controller tick covers at most this long (a stalled frame never skips a step's end). */
  gardenMaxTickMs: 250,
  /** Rửa xe (2026-10-30): a dirty car drives in from the left (longer than 1.5 s: a tap skips it). */
  carWashDriveInMs: 1800,
  /** Rửa xe: the clean car drives out to the right. */
  carWashDriveOutMs: 1300,
  /** Rửa xe (spec): a drive-in or drive-out longer than this can be skipped with a tap. */
  carWashSkipOverMs: 1500,
  /** Rửa xe: the arrival honk (the car's little hop while it honks). */
  carWashHonkMs: 600,
  /** Rửa xe: one rinse (the hose tilts, water sprays, the foam and the dirt wash away): ≤ 1.5 s, taps ignored. */
  carWashRinseMs: 1400,
  /** Rửa xe: the clean car shines (soft twinkles, two headlight blinks, a happy honk and a bounce). */
  carWashShineMs: 1800,
  /** Rửa xe: one sparkle's soft twinkle (in and out; well under 3 Hz). */
  carWashTwinkleMs: 900,
  /** Rửa xe: a surprise (the duck, the sneezed bubble, the rainbow). */
  carWashSurpriseMs: 1500,
  /** Rửa xe: a foam puff pops in; the tickled car's wiggle (and the least time between two wiggles). */
  carWashFoamPopMs: 180,
  carWashWiggleMs: 420,
  /** Rửa xe: the scrub sound plays at most this often while rubbing. */
  carWashScrubGapMs: 380,
  /** Rửa xe: after this long without a tap the car (or the hose) bounces and the step line plays (≤ ui.carWashHintMax per step). */
  carWashIdleHintMs: 8000,
  /** Rửa xe: a thing tapped out of its turn (the hose before the car is foamed): a small nudge; the hint bounce. */
  carWashTapMs: 600,
  /** Rửa xe: one controller tick covers at most this long (a stalled frame never skips a step's end). */
  carWashMaxTickMs: 250,
  /** Phi công nhí (2026-11-11): the take-off (the plane climbs from the grass to the middle height; longer than 1.5 s: a tap skips it). */
  planeTakeOffMs: 1800,
  /** Phi công nhí: the fly-off (the wings waggle, the house scrolls away; longer than 1.5 s: a tap skips it). */
  planeFlyOffMs: 1800,
  /** Phi công nhí (spec): a take-off or fly-off longer than this can be skipped with a tap. */
  planeSkipOverMs: 1500,
  /** Phi công nhí: the plane covers about two thirds of the way to its target height in this long (an exponential ease). */
  planeGlideMs: 260,
  /** Phi công nhí: after a balloon is caught or has left, the next one starts this much later. */
  planeBalloonGapMs: 700,
  /** Phi công nhí: the pilot's cheer after a catch (the happy frame). */
  planeCatchMs: 600,
  /** Phi công nhí: after this long without steering, the next balloon comes in at the plane's own height. */
  planeHelpIdleMs: 6000,
  /** Phi công nhí: the house scrolls in and the sky eases to a stop within this long. */
  planeApproachMaxMs: 3500,
  /** Phi công nhí: one gift floats down on its parachute (≤ 1.5 s); the next one starts this much later; taps ignored. */
  planeDropMs: 1200,
  planeDropStaggerMs: 350,
  /** Phi công nhí: the friend's happy move and call once its gifts have landed. */
  planeHappyMs: 1500,
  /** Phi công nhí: a surprise passes (the rainbow, the flock, the hot-air balloon, the heart cloud); no balloon comes meanwhile. */
  planeSurpriseMs: 2600,
  /** Phi công nhí: the flying propeller swaps its two soft blur frames this often (a small low-contrast blur, not a flash). */
  planePropFrameMs: 180,
  /** Phi công nhí: a flying bird flaps (swaps its two frames) this often (under 3 Hz). */
  planeFlapMs: 380,
  /** Phi công nhí: a bumped or tapped cloud's puff, a tapped bird's loop, the plane's soft bounce. */
  planeBumpMs: 500,
  /** Phi công nhí: after this long idle the next thing to touch bounces and its line plays (≤ ui.planeHintMax per step). */
  planeIdleHintMs: 8000,
  /** Phi công nhí: the hint bounce. */
  planeTapMs: 600,
  /** Phi công nhí: one controller tick covers at most this long (a stalled frame never skips a step's end). */
  planeMaxTickMs: 250,
} as const;

export type TimingTable = typeof Timing;
