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
  /** Story 3.5 Hang tìm bóng: the triceratops fades in and rises over this (≥ 800 ms, never popping). */
  trikeEnterMs: 900,
  /** Story 3.5: one triceratops sway (± ui.trikeSwayDeg, yoyo) takes this long. */
  trikeSwayMs: 3000,
  /** Story 3.5: the nod frame and its bounce after a correct reveal. */
  trikeNodMs: 600,
  /** Story 3.5: the triceratops' chirp plays this long before the item's name is said. */
  trikeCallMs: 500,
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
  /** Story 4.5 Chạm là nói: a tapped prop's name follows its sound this much later. */
  touchTalkNameDelayMs: 350,
  /** Story 4.5: one silent idle wiggle. */
  touchTalkWiggleMs: 900,
  /** Story 4.5: one controller tick covers at most this long (a stalled frame never skips a name). */
  touchTalkMaxTickMs: 250,
  /** Chạm là nói: idle → one random prop wiggles silently. */
  touchTalkIdleWiggleMs: 15000,
  /** Chạm là nói: scene-bubble slide between scenes. */
  touchTalkSceneSlideMs: 600,
} as const;

export type TimingTable = typeof Timing;
