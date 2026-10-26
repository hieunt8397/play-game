---
title: 'Story 7.3: Ban nhạc'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_commit: 'NO_VCS'
route: 'dispatch'
review_loop_iteration: 0
context: ['../planning-artifacts/epics.md#Story 7.3', 'spec-7-1-tram-nha-xoai-san-nha.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Xoài needs a music game that she and her parents can play together (FR58, FR59).

**Approach:** Add a new yard game `band` (sân khấu) with 5 instruments on a small stage: trống (drum), đàn gõ (xylophone), kèn (horn), chuông (bell), and one animal singer (chim or ếch).
- Each tap plays the instrument's next note from one shared pentatonic scale, so any mix of taps sounds nice. The instrument bounces.
- Several fingers can play several instruments at once. This is the only exception to first-finger-wins, and it applies only inside this game.
- When nobody taps for a while, a soft self-made beat starts and the instruments bob to it as an invitation. A tap close to the beat gives a small sparkle; nothing is scored.
- No songs, ever.

## Boundaries & Constraints

**Always:**
- **Sounds** are synthesised by our own tools (`tools/audio`, like the placeholder recipes), not recordings and not songs.
  - The scale is C-major pentatonic (C D E G A) over about 2 octaves. Each instrument has its own timbre and register: drum (pitched tom, low notes), xylophone, horn, bell, and the singer (a bird chirp or frog croak, pitched).
  - Each tap cycles that instrument through a short ascending/descending note pattern.
  - Notes ≤ 800 ms with a fade-in ≥ 50 ms, nothing below 150 Hz, never louder than the voice (NFR10).
  - The beat is a soft drum or clap loop at ≤ −30 LUFS that ducks under voice lines (NFR10).
- **Multi-touch:** each active pointer may start one instrument note. This needs a scene-local opt-out from the input router's first-finger-wins, tested. Every other game keeps first-finger-wins.
- **Round model:** pure and tested. The band has no end and no score.
  - It starts in free play: Home leaves to the yard with `round:leave`. There is no resume snapshot, or a trivial one.
  - The idle beat starts after `Tokens.Timing` idle ms and stops on the first tap after N beats with no input.
  - Bobbing is gentle, and only one prominent motion runs at a time (NFR11; reduced motion → no bob, the beat sound only).
- **Art:** instruments are script-built in the cute style (`cute.py` soft shapes); this is fine for objects. The singer is a real CC0 model if a bird or frog can be sourced (GitHub mirrors), otherwise a script-built bird.
  - The stage uses Tiny Treats / KayKit props.
  - Each instrument is ≥ 150 px, inside the interactive rect and clear of HUD zones. A `validateBand` rule checks this.
- **Voice lines** (ElevenLabs, `npm run tts`): one invite ("Xoài ơi, mình chơi nhạc nào!") and one short name per instrument for the parent label only (not spoken on tap; taps play music).
- Opened from the yard corner "sân khấu" (7.1). Home returns to the yard.

**Never:**
- Songs or melodies from existing music.
- Wrong notes or dissonance (only the scale).
- Scoring, fail sounds, a flashing beat (≤ 1 Hz visual pulses).
- Multi-touch leaking to other scenes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tap instrument | any | next note of its pattern + bounce | — |
| Two fingers | two instruments at once | both play | a third finger works too (cap ≈ 5 simultaneous voices; the oldest note is cut) |
| Rapid taps | one instrument | each tap retriggers the next note (no queue build-up) | — |
| Idle | no tap for idle ms | soft beat, instruments bob | voice line → beat ducks |
| Tap near beat | within ± window ms | small sparkle (no score) | — |
| Home | any time | back to the yard; the beat and all notes stop | — |
| Reduced motion | preference set | no bob or sparkle drift; sound unchanged | — |

</frozen-after-approval>

## Code Map

All under `app/`.
- `src/content/types.ts` (`GAME_IDS`, snapshot partial), new `src/content/games/band.ts` (instruments, scale, note patterns, screen, assets), `src/content/games/index.ts`.
- New `src/games/band/{round.ts, Band.ts, *.test.ts}`; `src/games/registry.ts`; `src/content/home.ts` wakes the corner.
- `src/core/input/*` (the first-finger-wins router): a scoped multi-pointer mode for one scene + tests.
- `src/core/audio/*`: the beat loop and ducking (reuse the existing voice ducking if present).
- `tools/audio/make-placeholders.ts` or a new `tools/audio/make-band.ts`: synthesised note files (`sfx.band.<instrument>.<note>`) and the beat loop; `audio-catalog.ts`; `npm run audio:check`.
- New `tools/render/blender/build_band.py`; `assets.ts`; `tools/layout/rules.ts`; `tokens.ts`.

## Tasks & Acceptance

**Execution:**
- [x] Synthesise the notes and beat; listen-check through ffmpeg analysis (loudness, spectrum ≥ 150 Hz).
- [x] Content + round model + multi-pointer input + tests.
- [x] Scene, registry, wake the corner; the beat with ducking.
- [x] Builder, render, atlas; composite check; iterate.
- [x] Voice lines (+ tts); `npm run check`, `audio:check`.

**Acceptance Criteria:**
- Given the stage, when any instrument is tapped, then it plays a scale note and bounces. Two fingers on two instruments play both.
- Given no taps for a while, then a soft beat starts, the instruments bob, and a tap on the beat shows a sparkle.
- Given any other game, then first-finger-wins is unchanged.
- Given `npm run check`, then it exits 0.

## Implementation Notes

2026-10-23/26 (dev). Before each edit, the file was copied to `_backup/2026-10-23-truoc-7-3/` at the same relative path (24 files, this spec included).

**Sounds** (`tools/audio/make-band.ts`, our own ffmpeg `aevalsrc` recipes; `make-placeholders › buildArgs` asks `bandArgs` first, so `npm run audio:placeholders` writes them too).
- One scale: C-major pentatonic C4…E6 (`content/games/band.ts › BAND_SCALE`). Each instrument has 5 notes in its own register:
  - drum C4–A4;
  - horn E4–D5;
  - frog G4–E5;
  - xylophone C5–A5;
  - bell G5–E6.
- Every partial is a whole multiple of the note, so any mix of notes stays consonant.
- Timbres:
  - drum: a soft pitched tom (the pitch drops 30 % into the note in 40 ms), 0.6 s;
  - horn: 5 harmonics, a swell, a 0.5 % vibrato after 0.2 s, 0.7 s;
  - frog: "ộp ộp", two buzzy syllables with a 28 Hz flutter, 0.5 s, `creature: true`;
  - xylophone: the note with its fast-dying 3rd and 4th harmonics, 0.55 s;
  - bell: the note, its octave and its 12th ringing out, 0.8 s.
- Every note has a 50 ms cubic fade-in, a fade-out and two 150 Hz highpasses.
- Measured with ffmpeg on all 25 files:
  - peak −18.5…−19.3 dBFS;
  - max momentary loudness −27.2…−32.7 LUFS (voice −16);
  - below 150 Hz (4× lowpass) ≤ −63.5 dBFS (drum C4), ≤ −84 dBFS for the rest;
  - the first 10 ms are ≥ 35 dB under the peak (measured 38.4–39.5 dB).

  `npm run audio:check` measures the 5 frog notes (27 creature sounds, OK).
- Beat `music.band-beat`: a 3 s loop of 4 beats at 80 BPM (`Timing.bandBeatMs` 750). It plays a tom on C4, a shaker, a tom on G4 and a shaker; every event ends before the loop wraps.
  - Measured: −36.1 LUFS integrated (−35.5 looped), max momentary −33.1, peak −21.3 dBFS, < 150 Hz −67 dBFS. That is below every note and well under the −30 LUFS limit.
  - It is a `music.*` id, so Boot loads it (`core/boot-load`) and the game assets do not list it (the `game-assets` test).
  - The dotted id `music.band.beat` broke the catalog id grammar, so the id is `music.band-beat`.
- The spectrogram and the loudness table were checked by eye (scratch `spec.png`). The parent has not listened yet.

**Multi-touch** (the only core input change).
- `createTapRouter(scene, { multiTouch: { pointers } })` marks its `GuardRouter.multiTouch`; this only takes effect on the `scene` layer.
- `InputGuard.decide` has a new verdict, `extra-multi`. While a primary is live, an extra finger whose topmost hit is a target of a multi-touch scene router gets `onPress` only (no anyTap, release, move or drag) when:
  - the primary belongs to that same router: it hit one of its targets, or it hit nothing while that router was the topmost active scene router (`Primary.sceneTop`);
  - and the primary does not drag.
- In every other case the old rules apply unchanged: a Hud extra finger gets `extra-hud`, otherwise `ignored`.
- `ensurePointers(input, n)` calls Phaser `input.addPointer` until `manager.pointersTotal ≥ n`. main.ts starts with 3 touch pointers; the band asks for `ui.bandVoiceCap` = 5. The added pointers stay for the session, and other scenes still ignore extra fingers.
- New `core/input/multi-touch.test.ts` (13 tests):
  - 2 and 3 fingers both play;
  - a press is decided once per key;
  - a background primary;
  - an extra finger on the background is ignored;
  - the Hud rule is kept, and a Hud primary blocks extra fingers;
  - dragging blocks;
  - another scene's primary blocks (no leak);
  - a hud-layer router flag is ignored;
  - a default router still ignores the 2nd and 3rd finger;
  - after the band is destroyed, first-finger-wins is back;
  - a paused band takes no fingers;
  - `ensurePointers`, and only a multiTouch router adds pointers.

  The existing guard and input tests are unchanged and pass.

**Audio director.**
- `note(id, cap)`: a capped pool of SFX instances, played at once and never queued (dropped while locked or held). Past the cap the oldest note is cut: its gain ramps to 0 over `Timing.bandNoteCutMs` (40) on the audio clock and it is released on complete (stopped at once without a gain node).
- `stopNotes()` cuts every note; a hidden page calls it too.
- `musicId` names the current loop.
- The beat ducks under voice lines through the existing music ducking (−20 dB).
- New `core/audio-notes.test.ts` (8 tests).

**Round model** (`games/band/round.ts`, pure, 17 tests).
- A tap plays the instrument's next note of `NOTE_PATTERN` [0,1,2,3,4,3,2,1] at once and the instrument bounces.
- After `Timing.bandIdleBeatMs` (6 s) without a tap the beat starts. Its first beat is at that moment.
- One instrument bobs every `ui.bandBobEveryBeats` (2) beats, round robin: 1.5 s apart, ≤ 1 Hz.
  - No bob while a tap bounce runs, and none under reduced motion.
- A tap within ±`bandBeatWindowMs` (150) of a beat sparkles. Nothing is counted.
- **Interpretation of "stops on the first tap after N beats with no input":** taps keep the beat going (play along, so the sparkle can happen). After `ui.bandQuietBeats` (16) beats without a tap it stops, and it comes back only after a new tap plus the idle time, so it never nags. Flagged for the parent.
- `stop()` (Home): the beat stops and nothing plays any more.

**Base and scene.**
- `MiniGameBase.startFreePlay()` (new): `round:complete` once with the empty tally, then free play without `onFreePlay` or the next-round timer. Home then emits `round:leave` and the yard comes back (7.1 nav, unchanged).
  - `SnapshotPartials.band = Record<string, never>`; there is no resume.
  - Map settles the round on `round:complete`; with no ladder, its length is 1.
- `games/band/Band.ts`:
  - it calls `startFreePlay` first;
  - the island loop makes way (`stopMusic`) and comes back on shutdown;
  - the router is multi-touch, with one target per instrument hull;
  - `update` ticks the controller even while inert, because free play is inert;
  - Home (`leave` override) and shutdown both stop the beat and every note;
  - the invite line `vo.band.prompt` is said and kept as the Speaker prompt;
  - the parent invite (`vo.band.parent.1`) plays once the voice is quiet;
  - the sparkle reuses `core/ui/sparkle` (fade only when reduced);
  - the bounce is a 1.12 scale on the bottom-centre pivot;
  - the bob is a 7 px lift.
- Registering it in `games/registry` wakes the yard's `stage` corner (`home.test` now expects pen and stage). Navigation files are unchanged.
- Ids: `YARD_GAME_IDS` gets `band`, plus `LINT_GAME_IDS`, `SCREEN_IDS`/atlas/background, `layouts.ts`, `PARENT_INVITE_LINES`, the catalog (25 notes and the beat) and the Tokens (`ui.band*`, `Timing.band*`, `art.band`).

**Art** (`build_band.py`).
- The stage is script-built in the cute style: a low wooden stage with grooves, a lilac curtain backdrop and side drapes, a yellow scalloped valance and a bunting of flags.
- Tiny Treats / KayKit props: Pretty Park street lanterns and bushes at the front corners, with Homely House trees, bushes and fences and Pretty Park grass and flowers (hazed) behind.
- Instruments are script-built with `cute.py` shapes:
  - a red drum with rims, gold lugs, a zig-zag cord and crossed sticks;
  - a gold trumpet on a blue stand, seen from the side;
  - a xylophone with 5 rainbow bars, tilted, and pink mallets;
  - a gold bell with a red bow in a blue arch stand.
- **The singer is the real Quaternius Frog** (CC0, poly.pizza/m/9Z2V8fpazF, vendored to `assets/quaternius/frog/Frog.glb` with `SOURCE.txt`, Idle pose, source colours) on an orange stool.
  - Download kept in `assets/_dl/polypizza-2026-10-23/`; nothing from it was executed.
  - Bird candidates were rejected: the CC0 Quaternius "Bird" (a jay) is a flying pose, the "Pigeon" is a chibi monster, the "Chick" is blocky, and the rest are CC-BY.
- Each instrument is fitted into a design-px box (back row horn, frog, bell; front row drum, xylophone).
- Iterations:
  - v1: the trumpet faced the camera and read as a lollipop, so it is now a side view;
  - the frog sat sunk into a big stool, so the stool is smaller and the frog bigger;
  - a long post or lantern shadow streaked across the floor, so the backdrop and lanterns cast no shadow;
  - the corner lanterns were first giant grey poles, so their scale is now 0.55.
- New `validateBand` (render, atlas, validate:content; `tools/layout/band-rules.test.ts`, 3 tests) checks:
  - the hulls: width, rect, Hud zones, ≥ targetGap apart;
  - each frame's longest side ≥ `ui.bandInstrumentMinPx` (150);
  - the frame grown by the bounce scale stays inside the rect and off the Hud zones.

  Frame sizes: drum 201×194, horn 173×177, frog 200×159, xylophone 290×130, bell 161×182 design px.

**Voice** (`npm run tts`, not yet approved):
- `vo.band.prompt` "Xoài ơi, mình chơi | nhạc nào!";
- `vo.band.name.{drum,horn,frog,xylophone,bell}`: "Cái trống!", "Cái kèn!", "Con ếch!", "Đàn gõ!", "Cái chuông!". These are the parent labels only and are never loaded or spoken by the game.
- `vo.band.parent.1` "Mời bố mẹ | cùng chơi nhạc nhé!". The parent-invite rule requires 1–2 lines for every GameId.

**Tests updated:** snapshot partials (9), registry (Band scene, `isGameId('band')`), home (stage awake), check-sfx creature list (+5 frog notes), render params (`art.band`), validate-content good tree (band atlas, bg, layout). New: `make-band.test.ts` (5).

**Checks (2026-10-26).** `npm run check` exits 0 (1863 tests; validate:content: 9 game ids, 128 audio ids, 274 voice lines, 11 layouts). `npm run audio:check` OK (27 creature sounds).

**Deferred.**
- Not played in a browser or on the iPad: the dev server was stopped, so the scene, the real multi-finger behaviour on iPad Safari and the beat/sparkle sync are untested on device.
  - The beat's sparkle window uses the scene clock from the moment `audio.music` starts the loop. AAC loop priming or drift over many loops is not measured.
- The parent should:
  - listen to the notes, the frog croak and the beat;
  - confirm the frog as the singer;
  - confirm the "beat continues while playing along" interpretation.
- The instrument name lines are not used at runtime: there is no parent-label UI yet.
- `ensurePointers` raises Phaser's touch pointers to 5 for the rest of the session after the band opens. Since the review, the slots above the shared 3 serve only a multi-touch scene (see Review patches).

**Review patches (2026-10-26).**
1. The catch-all tap reaction (`core/tap-react`, z −3, contains every point) is now `primaryOnly`. This is a new `GuardTarget` flag that `tap-router` passes through. An extra finger on the band's background is `ignored` and never ripples. The test attaches the real reaction target as the scene does.
2. The sparkle window follows the loop itself:
   - `AudioDirector.musicPositionMs` reads the playing loop's `seek`, and the band's audio port passes it as `beatPositionMs`.
   - On every tick and tap the controller re-anchors its beat clock to that position, taking the loop (`loopBeats` · `beatMs`) nearest to its scene-clock estimate.
   - The scene clock only fills in while no position is known (audio locked).
   - Beats crossed in one jump all count, and only the last one may bob.
   - A test with capped and dropped frames passes with the re-anchoring and fails without it.
3. New `games/band/Band.test.ts` (Phaser stubbed, a fake AudioDirector, the real bus and guard) checks:
   - one `round:complete`, no next-round timer and no `round:next`;
   - the controller still ticks in free play;
   - Home stops the notes and fades the beat out, then sends one `round:leave`, and nothing plays after it;
   - shutdown clears the prompt and fades the island loop back in;
   - the scene asks for the extra pointers.
4. `AudioDirector.stopMusic()` now also destroys the instance (a shared `releaseMusic`), so no stopped loop piles up in `sound.sounds`. A switch through `music()` goes the same way. Existing callers (Start, the voice tests) are unchanged and pass.
5. `InputGuard` has `SHARED_POINTERS` = 3, which main.ts now uses for `activePointers`. A press from a pointer slot above it is `ignored` unless it lands in a multi-touch scene. So the 4th and 5th fingers play in the band, but never reach the Hud or any other scene. Tested.
6. Docs: the notes' first 10 ms are ≥ 35 dB under the peak (measured 38.4–39.5 dB).
7. Music fades:
   - The island loop fades out over `Timing.bandMusicFadeMs` (600) when the band opens: new `AudioDirector.fadeOutMusic(ms)`, which ramps on the audio clock, then stops and destroys the loop through an injectable `schedule`.
   - It fades back in when the band closes (`music(id, fadeInMs)` starts silent and ramps up).
   - The beat fades out over `Timing.bandBeatFadeMs` (150) when it stops or on Home.
   - Tested in `core/audio-notes.test.ts`.

The beat behaviour and the frog are unchanged and still wait for the parent.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | input | full-screen reaction target gets extra-multi: extra finger on the background ripples | medium | Band.ts attachReactions, tap-react.ts | patch (primaryOnly target + real-wiring test) |
| 2 | beat sync | sparkle window on the scene clock drifts after hitches | medium | round.ts, Phaser smoothDelta | patch (re-anchor to music seek position + drift test) |
| 3 | verif | no test of startFreePlay / Band scene flow | medium | mini-game-base.ts, Band.ts | patch (Band.test.ts) |
| 4 | leak | stopMusic never destroyed instances | low-med | audio-director.ts | patch |
| 5 | other scenes | 5 pointers for the session let 4th/5th fingers press Hud buttons | low | tap-router.ts, main.ts | patch (SHARED_POINTERS = 3; extra slots only in multi-touch scenes) |
| 6 | docs | fade-in head claim ≥ 40 dB, measured 38.4–39.5 | low | spec notes | patch (≥ 35 dB) |
| 7 | ux | island music stops/restarts abruptly | low | Band.ts | patch (music fades) |
| 8 | sound | frog flutter sidebands, pitch glides inside fade-in | low | make-band.ts | defer (parent listen) |
| 9 | spec | beat keeps going while tapped, stops after 16 idle beats | low | round.ts | defer (parent to confirm) |
| 10 | art | frog reads as hugging the stool | low | composite | defer (parent to confirm) |
| 11 | regression | first-finger-wins elsewhere, round:next never fires, Home/hide/reduced motion, audio numbers, frog provenance | false | verified | reject |

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run audio:check` -- expected: OK.
