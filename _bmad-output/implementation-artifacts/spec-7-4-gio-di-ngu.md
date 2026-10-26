---
title: 'Story 7.4: Giờ đi ngủ'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_commit: 'NO_VCS'
route: 'dispatch'
review_loop_iteration: 0
context: ['../planning-artifacts/epics.md#Story 7.4', 'spec-7-1-tram-nha-xoai-san-nha.md', 'spec-choi-lien-mach.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A calm game to play before real bedtime (FR62, FR63).

**Approach:** Add a new yard game `bedtime` (giường ngủ). A cosy bedroom has the Shiba friend sitting on its bed. Xoài does three things by tapping, in any order:
1. **Toothbrush:** the brush scrubs, white foam bubbles appear, and Shiba giggles.
2. **Lamp:** the lamp clicks off and the room dims to a soft blue night. It is never dark.
3. **Blanket:** the blanket covers Shiba, who yawns and falls asleep with soft "khò khò" and floating "z".

A gentle glow suggests the next step, but the order is never enforced. When all three are done:
- a soft self-made lullaby plays;
- little stars fade in at the window;
- the scene stays quiet.

Tapping Shiba then makes it roll over in its sleep. Home returns to the yard.

Decision (orchestrator, consistent with the parent's "real models" choice): the friend is the vendored Quaternius Shiba Inu (ShibaInu.fbx, the dog in Tìm bóng), posed for sit, brush, yawn, sleep and roll.

## Boundaries & Constraints

**Always:**
- **Calm pace:** slow tweens (≥ 600 ms), soft voice lines:
  - "Mình đánh răng cho bạn nào!"
  - "Tắt đèn đi ngủ thôi."
  - "Đắp chăn cho bạn nhé."
  - "Chúc bạn ngủ ngon!"

  Rendered with ElevenLabs (`npm run tts`), with a softer style tag than `[cheerfully]` if the recipe allows a per-line style (e.g. `[softly]`; the line hash already includes the style).
- **The night state is a tint/overlay over the same plate**, not a black screen: average luminance stays ≥ 35% of the day plate. The change is a slow fade (≥ 1.5 s), never a flash (NFR11; reduced motion → crossfade only).
- **Lullaby:** synthesised by our own tools (pentatonic, slow, music-box timbre, about 20–30 s, looped softly), ≤ −30 LUFS, ducking under voice lines (NFR10). It is not an existing song.
- **No continuous-play restart here.** The ending stays on screen as the destination; it is a bedtime game. This game opts out of the automatic `round:next` (a per-game flag in MiniGameBase, tested; other games unchanged). Home in the night state leaves to the yard with `round:leave`.
- **Round model:** pure and tested; the 3 steps are idempotent (a second tap on a done step gives a small reaction, not a redo); suggested-step order brush → lamp → blanket.
- **Art:**
  - The bedroom is built in a new `build_bedtime.py`: KayKit Furniture (bed_single, lamp_table, rug, shelf, picture frames), Tiny Treats Bubbly Bathroom for the toothbrush if present (otherwise script-built), and a window with a night sky.
  - Sprites: Shiba poses, brush, foam, blanket on/off, lamp on/off, star and "z" particles.
  - The tap targets (brush, lamp, blanket, Shiba) are each ≥ 150 px, inside the interactive rect and clear of HUD zones. A `validateBedtime` rule checks this.
- Opened from the yard corner "giường ngủ" (7.1).

**Never:**
- A fully dark screen, flashing, or fast motion.
- Any judging or a fail sound when steps are out of order.
- Loud sounds.
- An existing lullaby melody.
- Chibi animals.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Brush first | start | foam + giggle; glow moves to the lamp | — |
| Blanket first | start | Shiba lies down covered and yawns but stays awake-ish until the lamp is off; glow suggests the remaining steps | any order completes |
| Repeat a step | step done | small reaction (foam puff, lamp wiggle) | no state change |
| All 3 done | any order | night fade, lullaby, stars, Shiba asleep; round completes, no restart | — |
| Tap Shiba asleep | night | rolls over, soft sigh | — |
| Home | any time | back to the yard; the lullaby fades out | — |
| Resume | abandon mid-steps | same steps done | snapshot partial `{ done: string[] }` |

</frozen-after-approval>

## Code Map

All under `app/`.
- `src/content/types.ts` (`GAME_IDS`, `SnapshotPartials.bedtime`), new `src/content/games/bedtime.ts`, `src/content/games/index.ts`.
- New `src/games/bedtime/{round.ts, Bedtime.ts, *.test.ts}`; `src/games/registry.ts`; `src/content/home.ts` wakes the corner.
- `src/games/mini-game-base.ts`: a per-game opt-out of the seamless `round:next` (+ test).
- `tools/audio/*`: synthesised lullaby (and reuse of the band synth from 7.3 if it fits); `audio-catalog.ts`.
- `src/content/voice-lines.ts` (per-line style if supported) + `tools/tts/generate.ts` if a style override is needed.
- New `tools/render/blender/build_bedtime.py`; `assets.ts`; `tools/layout/rules.ts`; `tokens.ts` (night tint colour, durations).

## Tasks & Acceptance

**Execution:**
- [x] Content + round model + base opt-out + tests.
- [x] Builder (room, Shiba poses, props), render, atlas; composite day and night; iterate.
- [x] Lullaby synth; voice lines (+ tts).
- [x] Scene, registry, wake the corner; `npm run check`, `audio:check`.

**Acceptance Criteria:**
- Given the bedroom, when brush, lamp and blanket are tapped in any order, then each reacts. After the third, the room fades to a soft night with a lullaby and stars, and Shiba sleeps.
- Given the night, when Shiba is tapped, then it rolls over. No new round starts on its own.
- Given `npm run check`, then it exits 0.

## Implementation Notes

2026-10-26 (dev). Before each edit, the file was copied to `_backup/2026-10-26-truoc-7-4/` at the same relative path (this spec included).

**No restart (the per-game opt-out).**
- `MiniGameBase.finishRoundAndStay()` (new, protected) reuses the existing `enterFreePlay(outcome, stay = false)` path, the same one `startFreePlay` (7.3) and "Home while finishing" use: `round:complete` once with the tallied outcome, then free play with no `onFreePlay` and no next-round timer, so `round:next` never fires. Home then runs `leave()` → `round:leave`, and the yard comes back (7.1 nav, unchanged). `startFreePlay` now calls it.
- No new flag was needed: every other game keeps calling `finishRound`/`scheduleFinish` and is unchanged (their tests pass as before).
- Tested in `games/registry.test.ts` ("Story 7.4 opt-out"): one `round:complete`, no `delayedCall`, no `onFreePlay`, a second call ignored, Home → one `round:leave`.
- The bedtime controller calls `onAllDone` at the third step's tap, so the round is complete before its ending plays; Home during the ending leaves (never abandons a finished bedtime). Before that, Home abandons with the snapshot `{ done }`.

**Content** (`content/games/bedtime.ts`). `YARD_GAME_IDS` gets `bedtime`; `SnapshotPartials.bedtime = { done: string[] }`; `LINT_GAME_IDS`, `SCREEN_IDS`/atlas/background, `layouts.ts`, `PARENT_INVITE_LINES`, the catalog and Tokens (`ui.bedtime*`, `Timing.bedtime*`, `art.bedtime`). Registering the scene wakes the yard's `bed` corner (`home.test` now expects pen, stage and bed). Navigation files are unchanged.

**Round model** (`games/bedtime/round.ts`, pure, 18 tests).
- A fresh start says the invitation chained before the first suggestion (`sayChain`); the glow and the soft line go to the first step not done (brush → lamp → blanket); the line is the Speaker prompt.
- Brush: the brush travels to the mouth (`brush` sitting or `lie-brush` lying), scrubs with foam, the toothbrush recording and a giggle, then goes back. Lamp: a soft click, the lamp frames crossfade and the night fades in over `bedtimeNightFadeMs` (2 s). Blanket: the quilt spreads, Shiba lies down under it and yawns, then stays awake lying until the end.
- A step's reaction makes the controller busy; taps are ignored meanwhile (calm pace). After it and `bedtimeStepGapMs`, the next suggestion.
- A done step: a small reaction only (foam puff, lamp wiggle, blanket tuck); no state change. Awake Shiba: a nudge and a giggle.
- The ending: "Chúc bạn ngủ ngon!", a yawn (unless the blanket was last: it has just yawned), sleep, stars, the lullaby, then a soft snore with a floating "z" every 5 s. A tap on the sleeping Shiba rolls it over (and back), with a sigh.
- Resume: `resumeBedtime` accepts distinct known steps, fewer than three, at question 0; the steps show done at once.
- Every tween is ≥ 600 ms (tested). Reduced motion: the night is the same crossfade, bubbles and "z" only fade, the scrub and wiggles are smaller, the glow does not breathe.

**Scene** (`games/bedtime/Bedtime.ts`; `Bedtime.test.ts`, 5 tests, Phaser stubbed): the island loop fades out on open and back in on shutdown; any order → one `round:complete`, the lullaby, never `round:next` over 60 s; Home after the end → lullaby fade-out and one `round:leave`; Home mid-steps → `round:abandon` with `{ done: ['lamp'] }` and nothing plays after; a resume shows the steps done.
- The night is a full-screen rectangle in `art.bedtime.nightTint` (#6F7FD0) with the MULTIPLY blend, its alpha tweened 0 → `ui.bedtimeNightAlpha` (1). The stars, the "z" and the suggestion glow are drawn above it.
- Glows (lamp halo, suggestion) are concentric ADD ellipses; the lamp halo fades with the lamp.
- Particles (bubble, star, z) are detached frames placed by their trimmed centre.

**Night luminance (measured).** Composites of the plate and the sprites (day: sitting Shiba, folded quilt, lamp on; night: sleeping Shiba, quilt on, lamp off, multiply tint, the five stars), ffmpeg `signalstats`: mean Y day 194.5, night 105.6 → ratio **0.54** (0.50 with the 16-offset of limited-range Y), well above 0.35. An earlier alpha-blend navy tint (0.42 over #25336E) read grey rather than blue (ratio 0.71), so the multiply tint was chosen.

**Art** (`build_bedtime.py`).
- The room is script-built (peach dotted wall, floor boards, skirting, a window with an evening sky gradient and a crescent moon between blue curtains, two paintings in KayKit frames, a KayKit wall shelf with books). KayKit: `bed_single_A` (side on, headboard right), `cabinet_small` nightstand, `table_small` stool, `rug_oval_A`, `lamp_table` (sprite on/off; "on" adds a warm emission). Tiny Treats Bubbly Bathroom was present: `toothbrush_cup` with `toothbrush_pink` in the plate, `toothbrush_blue` as the brush sprite.
- **Shiba poses** (the real Quaternius ShibaInu, source colours, scale 0.46, posed from its armature by script; Idle frame 1 as the base). The FBX has no IK constraints and its paws are weighted to the root-level IK foot bones, so each foot bone follows its lower leg's change and every root bone is grounded.
  - sit: body pitched up 47° about the hips, front legs straight down, hind legs folded on the ground;
  - brush: sitting, head tipped up and to the side, eyes shut happy, mouth open (giggle);
  - lie: sphinx pose, head up and turned 30° toward the camera;
  - lie-brush: lying, giggling (eyes shut, mouth open);
  - yawn: lying, head raised high, eyes shut, wide open mouth with a tongue;
  - sleep: lying, chin lowered toward its paws and turned to the camera, eyes shut;
  - roll: asleep rolled onto its side (the sphinx pose turned 75° about its long axis, belly and paws toward the camera, head on its cheek).
  - No jaw or eyelid bones: shut eyes are the eye materials set to the fur colour plus a dark line, the open mouth a small dark blob with a pink tongue, both bone-parented to the head.
  - Iterations: a 180° roll onto its back gave a broken hip pose, and the Death action (on its side) showed only a small sideways head, so the roll is the turned sphinx. The first sleep buried the face, so the head now turns to the camera.
- Other iterations:
  - the mattress height was first read off the pillow, so the quilt and the lying Shiba floated; it is now read over the bed's foot half;
  - the quilt hump was a tall ball poking under the hem; it is now a flat-bottomed half ellipsoid over the body's back 75 %;
  - the camera came closer, the bed grew to 1.4×, and the pieces were spaced so the padded hulls keep ≥ 24 px gaps.
- `render_screen.py`: a `state.<x>` child collection may carry a `bhc_state` prop naming its state (collection names are global, so the lamp's and the blanket's `on`/`off` clashed). Backward compatible; other screens are unchanged.
- New rule `validateBedtime` (render, atlas, validate:content; `tools/layout/bedtime-rules.test.ts`, 3 tests): each target hull (padded) ≥ `ui.bedtimeTargetMinPx` (150) wide, inside the interactive rect, clear of the Hud zones, ≥ targetGap apart; anchors on screen; every frame in the atlas. Raw hulls: brush 158×261, lamp 150×207, blanket 133×186, shiba 216×205 design px (+24 px padding each side).

**Sounds** (`tools/audio/make-bedtime.ts`, our own ffmpeg recipes; `make-placeholders › buildArgs` asks `bedtimeArgs` too; `make-bedtime.test.ts`, 3 tests).
- giggle (three voiced chirps E5 G5 A5), yawn (a 520 → 330 Hz glide with breath), snore ("khò khò", two breathy syllables), sigh, click, blanket rustle.
  - All ≤ 0.8 s with a 50 ms cubic fade-in and two 150 Hz highpasses; peak −19.5…−22.8 dBFS.
  - The four Shiba sounds are `creature`; `npm run audio:check` OK (31 creature sounds).
  - The brush reuses `sfx.touch-talk.toothbrush`.
- **Lullaby** `music.bedtime-lullaby`: an original 8-bar tune in 3/4 at 60 BPM (24 beats, a 24 s loop) on C-major pentatonic (E G A G | E D C | D | E G C' A | G E D | C).
  - Music-box timbre: the note, its octave and its 12th (whole-number partials), a 12 ms attack and a slow decay, over one soft low note per bar (C4/A3/G3, all ≥ 196 Hz). Every note ends before the loop wraps.
  - Measured: **−33.2 LUFS integrated**, max momentary −28.7 LUFS, peak −17.9 dBFS.
  - It plays on the music channel, so it ducks under every voice line (existing director ducking). It fades in over 2 s and fades out on Home.

**Voice** (`npm run tts`, not yet approved).
- Per-line style: `VoiceLine.style` (new, optional) replaces `VOICE_DEFAULTS.style` in `spokenText`, the export and `lineHash`. The default keeps every older hash unchanged: tts re-rendered only the new lines.
- The bedtime lines use `[softly]`: the four spec lines (`vo.bedtime.prompt.{brush,lamp,blanket}`, `vo.bedtime.goodnight`) and `vo.bedtime.parent.1` "Mời bố mẹ | cùng ru bạn ngủ nhé!".
- **Added** `vo.bedtime.prompt` "Xoài ơi, mình đi ngủ nào.", chained before the first suggestion of a fresh start. The existing name rule test (every game has a named ask/prompt/scene line, Story 5.2) requires it; none of the four spec lines names Xoài.

**Tests updated:** registry (Bedtime scene, `isGameId('bedtime')`, the opt-out), home (bed awake), snapshot partials (10), check-sfx creature list (+4), render params (`art.bedtime`), validate-content good tree (bedtime atlas, bg, layout).

**Checks (2026-10-26).** `npm run check` exits 0 (1906 tests; validate:content: 10 game ids, 135 audio ids, 280 voice lines, 12 layouts). `npm run audio:check` OK (31 creature sounds).

**Deferred.**
- Not played in a browser or on the iPad (the dev server was stopped). Untested on a device:
  - the MULTIPLY night tint in Phaser 4 WebGL (if the blend misbehaves on a device, a NORMAL-blend fallback needs a re-measure);
  - the brush path;
  - the glows.
- The parent should:
  - listen to the `[softly]` lines, the giggle, yawn, snore and sigh, and the lullaby;
  - confirm the Shiba poses (the roll is "onto its side", not "onto its back");
  - confirm the added Xoài invitation line.
- Scratch composites: `bedtime-day.png`, `bedtime-night.png`, `bedtime-blanket-first.png`, `bedtime-day-night.png` in the session scratchpad.


**Review patches (2026-10-26).**
1. **Calm pace.** Every scene motion is now ≥ 600 ms per tween:
   - bubble fade-in 600 ms (`Timing.bedtimeBubbleInMs`, was 300);
   - the repeat reaction (foam puff, lamp wiggle, blanket tuck, the awake nudge) is `Timing.bedtimeRepeatMs` 1200 ms in two 600 ms halves (was two 350 ms halves); the controller's busy time follows it.

   The "every tween is calm" test now also checks the scene tokens (bubble in/out, repeat half, scrub half, glow and twinkle halves, star fade, "z" halves, music and lullaby fades).
2. **Art.** Rebuilt, rendered and atlased.
   - The spread quilt is no longer a dome. It is a heightfield drape (`drape()` in `build_bedtime.py`): flat at the foot, rising softly over Shiba's body to 0.6 × its back height, easing down to 45 % at the shoulders, with a rolled white hem across them.
   - Lying Shibas sink 0.14 m into the bed and lie 0.25 m further from the headboard (`HEADBOARD_GAP` 0.75). The folded quilt is narrower to keep the hit gaps.
   - The sleep pose turns its head 60° to the camera and rests it on the pillow, so the closed-eyed face is clearly visible above the hem. The other lying poses read with the new quilt too.
   - The plate's window now shows a day sky (light blue gradient, two soft clouds; `art.bedtime.daySkyTop/daySkyLow/cloud`).
   - The evening sky and crescent moon are a new `window` sprite (`window/night/00`, holdout: the frame bars and curtains cut it). It crossfades in with the night tint (`fadeNight`), and the stars appear over it at the end.
   - Hulls (design px, raw): brush 158×261, lamp 150×207, blanket 117×186, shiba 215×222; every padded gap is ≥ 24.
   - **Luminance re-measured** (day: sitting Shiba, folded quilt, lamp on; night: sleeping Shiba under the quilt, lamp off, night window, multiply tint, stars): mean Y 198.2 → 105.6, ratio **0.53** (0.49 offset-corrected), ≥ 0.35.
3. **Empty resume.** A resume with no step done (`{ done: [] }`) is a fresh start: the invitation is said (`opts.resume?.length`). Tested.
4. **Glow tweens.** `glowOn` kills the glow's tweens first, so two alpha tweens never run at once.
5. **Comment.** The glow comment now says it stays still under reduced motion (the code was right).
6. **"z" offset.** The "z" offset has its own token `ui.bedtimeZOffsetPx`.
7. **Verification.** New scene tests in `Bedtime.test.ts`:
   - Home during the night fade: abandon with `{ done: ['lamp'] }`; nothing said or played after.
   - Home between the third tap and the lullaby: complete then leave; the lullaby never starts and Shiba never falls asleep.
   - The blanket-first path.
   - Reduced motion: the night is the same 2 s crossfade and no tween repeats (no breathing or twinkle), while the default does breathe.

   New `tools/tts/generate.test.ts` cases: a line without `style` keeps its old recipe-v2 hash (recomputed from the old payload), `[softly]` changes it, and `spokenText`, `planLine` and the export use the line's own style.

   `npm run check` exits 0 (1913 tests) and `npm run audio:check` is OK (31 creature sounds).

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | edge, spec | scene tweens under 600 ms (bubble 300, wiggles 2×350); test covered controller timings only | medium | timing.ts, Bedtime.ts | patch (≥ 600 ms + test over scene tokens) |
| 2 | art | night quilt dome dominates; sleeping Shiba squeezed at the headboard; day window showed a night sky | medium | composites (reviewer + orchestrator) | patch (draped quilt with hem, head on pillow, day sky + night sprite crossfade; luminance 0.53) |
| 3 | verif | MULTIPLY tint never rendered at runtime / on iPad | medium | Bedtime.ts | defer (device check; Phaser 4.2.1 source supports MULTIPLY in both renderers) |
| 4 | edge | { done: [] } counted as resume, invite skipped | low | round.ts | patch + test |
| 5 | edge | one stale id discards the whole resume | low | round.ts | reject (defensive fresh start) |
| 6 | blind | glowOn left the fade-in tween running | low | Bedtime.ts | patch (killTweensOf) |
| 7 | blind | wrong reduced-motion glow comment | low | Bedtime.ts | patch |
| 8 | code | "z" offset reused the brush token | low | Bedtime.ts | patch (own token) |
| 9 | verif | no scene tests for Home in the night fade / before the lullaby, blanket first, reduced motion; no style-hash unit test | medium | Bedtime.test.ts, line-hash | patch (tests added) |
| 10 | audio | snore (−38.5 LUFS) may be masked by the lullaby | low | measurement | defer (parent listen) |
| 11 | ux | parent invite fires right after the prompt | low | Bedtime.ts | defer |
| 12 | blind | startFreePlay refactor, voice hashes, render_screen.py, leaks, MULTIPLY support | false | verified (280/280 hashes match) | reject |

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run audio:check` -- expected: OK.
