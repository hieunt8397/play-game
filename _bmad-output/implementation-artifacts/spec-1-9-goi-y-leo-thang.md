---
title: 'Story 1.9 — Gợi ý leo thang (NFR4)'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'NO_VCS'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-8-tiem-kem-keo-kem-dung-vi-cho-shiba.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-6-nut-nha-va-loa-chong-cham-nham.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-5-man-con-duong-7-tram-nhan-loi-moi-tram-ngu.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-be-nghe-giong-doc-tieng-viet.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** After Story 1.8, Tiệm kem talks to a stub `hint.*`. The stub plays the prompt and the retry line and does nothing else. A child who is stuck never gets a ring, a hand or easier targets. The Speaker ignores the active question. Nothing escalates on time or on wrong attempts, so NFR4 ("never stuck, never done for the child") is unmet.

**Approach:**
- A pure, node-tested `HintMachine` in core owns levels, clocks and voice decisions. It talks to injected ports for audio, guard, visuals and the Bus.
- `core/hint-director.ts › createHint(scene, deps)` replaces the stub behind the same factory and signatures. It wires the machine to the scene's pausable `time`, to `speech:ended` through `bus.scoped(scene)`, and to `core/hint-visuals`.
- `core/hint-visuals` gains the ring follow, the item bob, the 72 px hand demo and the dim effect. The Map invitation keeps its existing call.
- The Hud Speaker routes through the active hint. `MiniGameBase` stops ambient motion at level ≥ 2. Tiệm kem changes only to register its ambient tween and to send `questionDone` before it locks the scoops for the celebration.

## Boundaries & Constraints

**Always:**
- **Protocol** (AD-5 signatures from spec-1-8, unchanged): `beginQuestion({promptLineId, retryLineId, step})`, `wrong()`, `stepDone(nextStep, {promptLineId?, retryLineId?}?)`, `questionDone()`, `replayPrompt(): number | undefined`, plus a read-only `level: HintLevel`.
  - `wrong`, `stepDone` and `questionDone` are no-ops when no question is active. `replayPrompt` then returns `undefined`.
  - `beginQuestion` while a question is active first runs `questionDone`.
- **Voice** (HintDirector is the only caller of `audio.say` for prompt and hint lines):
  - **Prompt plays:** `beginQuestion`, `replayPrompt` and a `stepDone` that carries `promptLineId`. Each calls `audio.setPrompt(p)`, then `say(p)`, and sets the awaited token to the returned token.
  - **Hint voice:** `say(currentRetry)`. It is requested by every `wrong()`, on entering level 3, and every `Timing.hintVoiceRepeatMs` of quiet time while at level ≥ 3.
  - **Rate limit:** hint voice plays only if `Timing.voiceRetryMinGapMs` has passed on the active clock since the last hint voice started. Otherwise it is dropped. Prompt plays are never rate-limited and do not reset the gap.
  - **Awaited token:** the token of the latest hint-owned utterance. The quiet clock is paused while one is awaited. `speech:ended` for exactly that token, `completed` true or false, clears it and restarts idle at 0. Any other token is ignored.
- **Clocks** (no `setTimeout`):
  - One `scene.time.addEvent({ delay: Timing.hintTickMs, loop: true })` runs while a question is active and is removed by `questionDone`. Each callback is `machine.tick(Timing.hintTickMs)`.
  - Scene pause (AudioUnlockOverlay) and a hidden page (Phaser's loop pause) stop the ticks, so time resumes exactly where it stopped.
  - **`activeMs`** advances on every tick. It drives the retry gap.
  - **`idleMs`** advances only when no awaited token exists. It drives escalation, the hand loop and the voice repeat.
- **Levels** (`HintLevel` 0–4; ring at ≥ 2, hand at ≥ 3, dim at 4; levels are cumulative):
  - **Effective level:** `level = max(level, min(wrongCount, 4))` after each `wrong()`.
  - **Time escalation:** once `idleMs` since the later of the last idle restart and the last level change reaches `T(level)`, the level rises. From 0 or 1 it goes to 2 after `hintLevel2IdleMs`. From 2 it goes to 3 after `hintLevel3ExtraIdleMs`. Time never reaches 4.
  - **Idle restarts:** the awaited speech ends; `wrong()` with no hint voice and nothing awaited; `stepDone` with nothing awaited.
  - The level never drops within a question. `questionDone` resets it to 0 and clears `wrongCount` and the per-step line overrides.
  - Every change emits `hint:level { gameId: scene key, level }`, including the reset to 0 (emitted only if the level was > 0).
- **`stepDone(next, lines?)`:**
  - The level is kept. `step` becomes `next` and visuals re-target to it.
  - `retryLineId` overrides the retry line. `promptLineId` overrides the prompt and plays it, and becomes what `replayPrompt` and the Speaker replay.
  - Without `promptLineId`, idle restarts now, unless a hint utterance is still awaited.
- **Visuals per level** (all from `core/hint-visuals`; `correct[0]` is the hinted item):
  - **Level ≥ 2:**
    - One ring around `correct[0].object`: its bounds plus `ui.hintRingPad`, using the spec-1-5 three layers and pulse. The ring follows the object every frame.
    - The item bobs `1 ↔ ui.hintItemBobScale`, yoyo over `hintRing.pulse.durationMs`. The bob pauses while the item is lifted (via `Draggable.onLiftChange`, called before `onLift` and after `onDrop`/`onCancel`) or while a tween runs on it, and it restores the captured scale.
    - The ring stays through taps and drags on other items until `stepDone` or `questionDone`.
  - **Level ≥ 3, hand demo** (72 px `hintHand`, drawn in core with Graphics: white fill and a `hintLine` outline, plus the shadow ellipse from `hintHand.shadow`):
    - It plays on entering level 3 and every `Timing.hintHandLoopMs` of `activeMs` after that.
    - `drag`: the hand presses on the item (`hintHandPressMs`, `ui.pressScale`), moves to the target centre (`hintHandMoveMs`, ease in-out), lifts and fades (`hintHandFadeMs`).
    - `tap`: press and fade on the item. `trace`: follow `step.path`. With no target or no path it falls back to `tap`.
    - Only the hand moves; the item never moves. A demo that falls due while `inputGuard.isDragging()` waits until the drag ends. The item bob pauses during a demo (one prominent motion).
  - **Level 4:** for each `distractor`, `inputGuard.setPickable(d, false)` and alpha tweens to `ui.hintDimAlpha` over `hintDimFadeMs`. Then `inputGuard.setSnapScale(step.target, ui.hintSnapScale)` when a target exists. A `stepDone` restores the old step, then applies to the new one.
  - **Restore:** `questionDone` (and scene SHUTDOWN) removes the ring, bob and hand, and restores pickable `true`, snap scale 1 and alpha 1 for every object it changed. It never touches others.
- **Reduced motion:** the ring pulse and bob amplitudes go through spec-1-5's `amplitude(…, reduced)`. The hand path is unchanged because it is the instruction.
- **Speaker:** `core/hint-director.ts` keeps one module-level active director, set by `beginQuestion` and cleared by `questionDone`/SHUTDOWN. `speakerReplay(audio) = active?.replayPrompt() ?? audio.replayPrompt()` replaces spec-1-6's default `replay` in `scenes/Hud.ts`.
  - A replay keeps the level, does not count as wrong, pauses the quiet clock while speaking, and restarts idle at its `speech:ended`.
- **Ambient (AD-5, UX-DR72):** `MiniGameBase` gains `addAmbient(tween)` and `holdAmbient(reason, on)`. Ambient tweens play only while no reason is held. The base subscribes to `hint:level` for its own key and holds `'hint'` while level ≥ 2.
- **Tiệm kem edits (only these):**
  - The Shiba breath registers with `addAmbient`, and the celebration uses `holdAmbient('celebrate', …)`.
  - The `round.ts` correct-serve command order becomes `questionDone` → lock scoops → celebrate. The ring vanishes on the correct answer, and the restore cannot unlock scoops during the celebration.

**Never:**
- No auto-solving: no item moves by itself, and no drop is ever completed for the child.
- No per-game timers or retry voice in games. No `setTimeout`/`setInterval`. No `this.sound`.
- No red, shake, wrong sound, flashing above 1 Hz, or text.
- No `round:complete`, multi-scoop questions or `nextLevel` (Story 1.10). No overlay re-ask (Epic 2).
- No new voice lines. No change to the spec-1-4 JSON or to the Map invitation behaviour.
- No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **What "idle" means:** time without a protocol event (`wrong`, `stepDone`, the end of a hint utterance). Lifting or moving items does not reset it, because the protocol has no activity call. A child dragging slowly may see the ring early, which only adds help.
- **The hand never moves the scoop.** A ghost scoop could read as the app doing the task, so the hand goes alone.
- **Repeated voice uses the retry line** (short, names the target) rather than the full prompt.
- **Dim alpha is 0.6**: "mờ 60%" read as 60 % opacity.
- **New values:**
  - `Timing.hintTickMs: 100`, `hintHandPressMs: 250`, `hintHandMoveMs: 1200`, `hintHandFadeMs: 300`, `hintDimFadeMs: 300`.
  - `ui.hintRingPad: 12`, `hintItemBobScale: 1.06`, `hintDimAlpha: 0.6`, `hintSnapScale: 2`.
- **Contrast "on the real render":** `tools/lint/hint-contrast.ts` reads `bg.ice-cream` and `bg.map` with sharp (pinned in spec-1-4).
  - It samples 32 pixels just outside the ring ellipse at every `slot.scoop-*`. The ellipse diameter is `draggableItem.minSize + 2·hintRingPad`, × renderScale. It also samples around every Map station `hits` bbox.
  - Each sample must reach ≥ 3:1 against `hintRing.core` or against `hintRing.line`.
  - It runs inside `validate:content`. A pure `ringContrastProblems` is unit-tested.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Begin | `beginQuestion(q)` | `setPrompt(ask)`, `say(ask)` → t1; idle stays 0 until `speech:ended{t1}` | — |
| Foreign token | `speech:ended{t9}` while t1 awaited | ignored; clock still paused | — |
| Cut prompt | t1 ends `completed:false` | clock starts | — |
| 1 wrong + 6 s | wrong at 0 s; retry ends; 6000 ms idle | level 1, then 2 (ring + bob); `hint:level` 1, 2 | — |
| Idle only | 6 s, then 6 s more | level 2, then level 3: hand + retry voice | — |
| 4 wrongs fast | four `wrong()` within 3 s | levels 1→2→3→4; one retry voice (gap 10 s); level 4 dims and unpicks the distractor; cone snap ×2 | — |
| Level 3 loop | at level 3, 60 s with no event | hand at 0, 15, 30, 45 s; voice at entry, 30, 60 s (quiet time) | — |
| Hand while dragging | demo due during a drag | deferred until the drag ends | — |
| Speaker at level 3 | `speakerReplay()` | prompt restarts, new token; level 3 kept; wrongCount unchanged; idle resumes after its end | — |
| Speaker, no question | no active hint | `audio.replayPrompt()` | — |
| stepDone plain | `stepDone(s2)` | level kept; idle 0; ring re-targets to `s2.correct[0]` | — |
| stepDone retry | `stepDone(s2,{retryLineId:'X'})`, then `wrong()` | says `X` | — |
| stepDone prompt | `stepDone(s2,{promptLineId:'P'})` | says `P`; replay says `P`; clock waits for P's end | — |
| questionDone | at level 4 | ring, hand and bob gone; pickable, snap 1 and alpha 1 restored; `hint:level 0`; overrides cleared; tick event removed | — |
| Paused | scene paused 20 s at level 1 | no ticks; no escalation; resume continues | — |
| Before question | `wrong()`, `stepDone()`, `replayPrompt()` | no-op; `undefined` | — |
| Ring vs others | level 2, child drags a distractor | ring stays on the target and follows it if lifted | — |
| Contrast | a bg pixel next to the ring below 3:1 on both layers | `validate:content` fails naming screen + slot | exit 1 |

</intent-contract>

## Code Map

- `app/src/core/hint-director.ts` -- planned in spec-1-8 as the stub plus `createHint(scene, deps)` and the `HintStep` type. It becomes the real adapter: machine, tick event, `bus.scoped` `speech:ended`, visuals, active registry, `speakerReplay`.
- `app/src/core/hint-visuals.ts` -- planned in spec-1-5 (`createHintRing(scene, rect)`, one live ring). Add `follow`, `createItemBob`, `playHandDemo`, `dimItems`.
- `app/src/core/reduced-motion.ts` -- planned in spec-1-5 (`amplitude`).
- `app/src/core/input/{guard,drag-controller,drop}.ts` -- planned in spec-1-8 (`setPickable`, `setSnapScale`, `isDragging`, `Draggable.object`). Add `Draggable.onLiftChange`.
- `app/src/core/hud.ts`, `app/src/scenes/Hud.ts` -- planned in spec-1-6; `HudController({replay,…})` with an `audio.replayPrompt()` default.
- `app/src/games/mini-game-base.ts`, `app/src/games/ice-cream/{IceCream,round}.ts` -- planned in spec-1-7/1-8.
- `app/src/core/audio-director.ts` -- real: `say(id): number`, `setPrompt`, `replayPrompt(): number | undefined`.
- `app/src/core/bus.ts` -- real: `'hint:level'` and `'speech:ended'` exist. `app/src/content/types.ts` -- real: `HintLevel`.
- `app/src/core/timing.ts` -- real: `hintLevel2IdleMs`, `hintLevel3ExtraIdleMs`, `hintHandLoopMs`, `hintVoiceRepeatMs`, `voiceRetryMinGapMs`. `core/tokens.ts` (`ui`), `tokens.generated.ts` (`hintRing`, `hintHand`).
- `app/tools/lint/validate-content.ts` -- real `run(publicDir)`; it adds the contrast check.

## Tasks & Acceptance

**Execution:**
- `app/src/core/timing.ts`, `app/src/core/tokens.ts` -- add the new values.
- `app/src/core/hint-machine.ts` (+ `hint-machine.test.ts`) -- the pure state machine with ports `{audio:{say,setPrompt}, guard:{setPickable,setSnapScale,isDragging}, visuals, emitLevel}` and `tick(ms)`. The tests use a fake clock for every matrix row and for every AC 7/8 sequence in the story.
- `app/src/core/input/drag-controller.ts` (+ test) -- `onLiftChange(fn)`, ordered before `onLift` and after drop/cancel.
- `app/src/core/hint-visuals.ts` (+ a pure geometry test for the ring rect, hand path and bob amplitude) -- follow, bob, hand, dim. Map calls still compile and behave the same.
- `app/src/core/hint-director.ts` (+ test with fake scene/time/bus) -- replace the stub. The adapter test covers ticks stopping when the time event stops, SHUTDOWN restore, the active registry and `speakerReplay`.
- `app/src/scenes/Hud.ts` -- `replay: () => speakerReplay(audio)`.
- `app/src/games/mini-game-base.ts` -- `addAmbient`/`holdAmbient` and the `hint:level` subscription.
- `app/src/games/ice-cream/round.ts` (+ test), `IceCream.ts` -- the command order, the ambient registration and the celebration hold.
- `app/tools/lint/hint-contrast.ts` (+ test), `app/tools/lint/validate-content.ts` -- the render contrast check.

**Acceptance Criteria:**
- Given `npm run dev` in Tiệm kem, when the prompt finishes and the child does nothing, then after about 6 s a white–purple ring pulses around the asked scoop and it bobs while Shiba stops breathing. About 6 s later a hand shows the drag from that scoop to the cone, and the retry voice plays. The hand repeats about every 15 s.
- Given a fresh question, when the child drops the wrong scoop four times, then it floats back each time, the retry voice plays at most once in 10 s, the ring and hand appear, and finally the wrong scoop turns 60 % faded and cannot be lifted. The asked scoop still has to be dragged by the child, and it snaps from up to 200 px away.
- Given the ring is showing, when the child lifts the asked scoop and drops it on the lower counter, then the ring follows it and stays. When the scoop is served, the ring, hand and fade disappear at once and the next question starts calm at level 0.
- Given level 3, when the child taps the Speaker, then the prompt replays from the start with the wave, and the hints neither drop nor jump.
- Given level 1, when the app is hidden for 30 s (or the unlock overlay shows) and then resumed, then the ring has not yet appeared and arrives about 6 s of play time after the retry ended.
- Given `cd app && npm run check`, then it exits 0 with the machine, adapter and contrast tests passing.

## Spec Change Log

- **2026-10-09: the hint types live in `core/hint-machine.ts`.** `HintStep`, `HintQuestion`, `HintAction` and a structural `HintItem { object?, onLiftChange?, isDragging? }` are defined there and re-exported from `hint-director.ts`, so the pure machine needs no import from the adapter. `HintStep.correct`/`distractors` are `HintItem[]`; a `Draggable` satisfies it. This is the shape spec-3-1/4-1 plan, so they can reuse it.
- **2026-10-09: the Speaker replay restarts through `audio.replayPrompt()`.** `AudioDirector.say(id)` of the line that is already playing returns the playing token instead of restarting it. The machine's prompt replay therefore calls `setPrompt(p)` and then `replayPrompt()`, falling back to `say(p)`. `beginQuestion` and a `stepDone` prompt still use `say`.
- **2026-10-09: the ring box of a game item is the trim rect of its frame.** The ice-cream sprites are full-frame (2048×1536 source size), so Phaser's `getBounds()` covered the whole plate. The headless smoke showed a screen-sized ring. `hint-visuals › itemBounds` uses `frame.data.spriteSourceSize` when the frame is trimmed, and `getBounds()` otherwise.
- **2026-10-09: the contrast lint samples around the runtime ring.** For `ice-cream` it uses the vanilla scoop's trimmed bounds + `hintRingPad`, moved from `slot.scoop-2` to each `slot.scoop-*`. It falls back to the specified `minSize + 2·pad` circle when the atlas cannot be read. Samples sit just outside the halo at the pulse's largest scale. `run()` stays synchronous, because sharp is async; `main()` awaits `hintContrastProblems` and adds its problems.
- **2026-10-09: small API shapes.**
  - `Hint.replayPrompt()` returns `number | undefined`, and `Hint` gained the read-only `level`.
  - `createHint(undefined, deps)` (the base's field before `create`) speaks but has no clock or visuals.
  - `stepDone` also clears a running hand demo.
  - The voice repeat counts quiet time since the last hint-voice request (played or dropped) or idle restart, so a dropped repeat is not retried on every tick.
  - `MiniGameBase.addAmbient` returns the tween. Tiệm kem still restarts its breath after the celebration, as in 1.8, besides the `'celebrate'` hold.

## Review Triage Log

## Design Notes

**Why a pure machine plus an adapter:** the AC demands fake-clock tests of the escalation table. Every decision (level, voice, gap, hand due) lives in `hint-machine.ts` as state and port calls. The adapter only turns `scene.time` ticks and `speech:ended` into `tick` and `speechEnded(token)` and draws.

```ts
m.beginQuestion(q);        // ports.audio.setPrompt('ask'); say → 1
m.speechEnded(1); m.wrong(); // level 1; say('retry') → 2
m.speechEnded(2); m.tick(6000); // level 2 → visuals.showRing(correct[0]); emitLevel(2)
```

**Why two clocks:** the retry gap protects the child's ears in real (pausable) time. Escalation must not run while the app is speaking, or a long prompt would eat the child's thinking time.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0. Vitest covers every matrix row, and validate:content reports the hint contrast samples for `ice-cream` and `map`.
- `cd app && npm run build` -- expected: exit 0.

**Manual checks:**
- Run the AC walkthroughs at 1180×820 touch emulation, with and without `prefers-reduced-motion`: smaller pulse and bob, the same hand path, and only one prominent motion at a time.
- Screenshot the level 2 ring over the pink counter and the grass. It is clearly visible, with no flashing.

## Auto Run Result

**Status:** in-review. `cd app && npm run check` exits 0: 50 test files, 601 tests. `validate:content` reports "hint contrast ice-cream 4 rings, map 7 rings". `npm run build` exits 0.

**Summary:**
- **`core/hint-machine.ts`** is the pure state machine. It has two clocks (`activeMs` for the retry gap and the hand loop, quiet time for escalation and the voice repeat), the awaited token, levels 0–4 (wrong count and time) and the 10 s rate limit. It shows the ring at ≥ 2 and the hand plus retry voice at ≥ 3, and at level 4 it unpicks the distractors and sets snap ×2. `questionDone` restores everything it changed.
- **`core/hint-director.ts`** is the adapter. It runs one looping `scene.time` tick of `hintTickMs` while a question is active, listens to `speech:ended` through `bus.scoped`, and emits `hint:level` with the scene key. It keeps the module-level active director and `speakerReplay`, and SHUTDOWN restores everything.
- **`core/hint-visuals.ts`:**
  - `createHintVisuals`: a ring that follows the item every frame, and the item bob. The bob pauses while the item is lifted (`onLiftChange`), while another tween runs on it or during a hand demo.
  - The 72 px Graphics hand: press, ease in-out move to the cone, then lift and fade. Only the hand moves.
  - The level 4 dim.
  - Pure `itemBounds`, `itemRingBox`, `handRoute`, `handPose` and `bobFactor`. The Map ring API is unchanged (it gained `setCentre`).
- **`Draggable.onLiftChange`** fires before `onLift` and after `onDrop`/`onCancel`.
- **The Hud Speaker** uses `speakerReplay(audio)`.
- **`MiniGameBase`** gained `addAmbient`/`holdAmbient`, and holds `'hint'` while its level is ≥ 2.
- **Tiệm kem:** the breath is ambient and the celebration holds `'celebrate'`. A correct serve now sends `questionDone` first.
- **`tools/lint/hint-contrast.ts`** runs in `validate:content`.

**Files changed:** the list is in `.changed-1-9.txt`.
- New:
  - `app/src/core/hint-machine.ts` and its test: the machine.
  - `app/src/core/hint-visuals.test.ts`: the geometry tests.
  - `app/tools/lint/hint-contrast.ts` and its test: the render contrast check.
- Changed:
  - `hint-director.ts` and its test: the adapter.
  - `hint-visuals.ts`: follow, bob, hand and dim.
  - `input/drag-controller.ts` and `drag.test.ts`: `onLiftChange`.
  - `timing.ts` and `tokens.ts`: the new values.
  - `scenes/Hud.ts`: `speakerReplay`.
  - `games/mini-game-base.ts` and `registry.test.ts`: ambient.
  - `games/ice-cream/IceCream.ts`, `round.ts` and `round.test.ts`: the ambient registration and the command order.
  - `tools/lint/validate-content.ts`: the async main with the contrast check.

**Verification:**
- `npm run check`: exit 0, with 601 tests. `npm run build`: exit 0.
- **Headless Chrome smoke** (raw CDP, 1180×820 touch, `vite preview`; the scripts are kept outside the project in the temp dir `h19/`):
  - The ring appears around the asked scoop about 7.5 s after the game shows (prompt about 1.5 s, then 6 s). Shiba stops breathing; the screenshot diffs change only around the ring.
  - The hand demo starts about 6 s later, with the hand at the cone. It repeats at about 15 s intervals (seen at 14.9 s, 29.5 s and 44.5 s).
  - A Speaker tap at level 3 kept the ring and the hand loop.
  - Four wrong drops of the distractor on the cone: it floats back each time, then shows at 60 % and could not be lifted.
  - The asked scoop dropped 170 px from the cone snapped onto it (snap ×2). The ring and fade vanished at once, and the next question started with no ring.
  - The same run with `prefers-reduced-motion: reduce` behaved the same.
  - No exceptions, failed requests or HTTP errors were logged.

**Residual risks:**
- With a white core and a purple line, almost any background colour reaches 3:1 against one of the two layers. The contrast rule can only fail for mid-greys with luminance near 0.30, so it is a weak guard.
- "Idle" counts only protocol events. A child who drags slowly without dropping still escalates, which only adds help.
- The pause on a hidden page and on the unlock overlay is unit-tested only (fake clock). CDP cannot hide the page.
- The hand is a simple Graphics glyph (finger, palm and thumb). It has not been art-reviewed.
- The bob's capture and restore of the scale was checked in screenshots, not through a lift at level 2 on a device.

**Manual checks still due:**
- The AC walkthroughs at 1180×820 touch, with and without reduced motion. With reduced motion the pulse and bob should be smaller, the hand path the same, and only one prominent motion at a time.
- A level 2 screenshot over the pink counter and the grass: the ring should be clearly visible and should not flash.
- On a device: hide the app for 30 s at level 1. The ring should not appear early.
- The hand art by eye.

**Review (lean loop, 2026-10-08):** No high or medium findings. 1 latent low: the bob could adopt a mid-bob scale as its base after a non-scale tween paused it. Fixed in hint-visuals startBob: the base is recaptured only after a pause that restored the scale. npm run check exit 0.
