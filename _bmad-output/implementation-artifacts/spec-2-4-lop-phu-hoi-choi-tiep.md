---
title: 'Story 2.4 — Lớp phủ "Hỏi chơi tiếp" với lời mời, nhắc lại và tự đóng'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'NO_VCS'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-chuoi-sau-luot-tren-ban-do.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-danh-muc-trang-tri-o-tren-dao-reward-service.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-6-nut-nha-va-loa-chong-cham-nham.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-kart-chay-toi-tram.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-9-goi-y-leo-thang.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** After spec-2-3, a finished round ends in Map's public `onChainEnd` hook, whose default just returns the island to "Mời chơi". The child is never asked "chơi nữa?", has no one-tap way to replay at the next level, and nothing nudges or closes on its own. FR25 / UX-DR53 are unmet.

**Approach:**
- A pure, node-tested `core/play-again.ts › PlayAgainController` owns the question sequence, the idle clock, the one re-ask, the ring alternation and the four ways to close (replay, back, station tap, auto).
- A thin `scenes/PlayAgainOverlay.ts` draws the 15% dim and the two 160 px buttons on the `overlay` input layer and binds the controller to scene `time`, `speech:ended` and the views. It has no interactive backdrop.
- Map replaces the `onChainEnd` default:
  - it creates the controller and launches the overlay only for `complete` and not `touch-talk`;
  - it emits `overlay:close` on any station tap while the overlay is open;
  - replay goes through a new `KartTrip.replay(id)` into a 1.5 s zoom-in and a fresh start.
- AudioDirector gains chain prompts, `clearPrompt` and `stop(token)`.
- `atlas.map` gains a Shiba icon frame.

## Boundaries & Constraints

**Always:**
- **Opening** (`Map.onChainEnd(e)`, replacing spec-2-3's default):
  - `e.kind === 'complete'`, `e.gameId !== 'touch-talk'` and `e.gameId in GAMES` → `openPlayAgain(e.gameId)`. Anything else keeps the default `idle.reset()`.
  - The queued-tap end of spec-2-3 never calls `onChainEnd`, so the overlay never appears there. This is unchanged and is covered by a regression test.
  - `openPlayAgain`:
    1. `idle.suspend()`.
    2. Stop any still-running `PlayAgainOverlay`.
    3. `this.playAgain = new PlayAgainController(deps)`. The controller subscribes to `overlay:close` in its constructor.
    4. `scene.launch('PlayAgainOverlay', { controller, gameId, placement })`.
  - The Map keeps running underneath. Hud stays in `'map'` mode with the Speaker live.
- **Controller** (pure; ports `say(id)→token`, `setPrompt(ids)`, `clearPrompt()`, `stopVoice(token)`, `onOverlayClose(h)→off` and `onClosed(reason)`, given at construction; the `view` port arrives later through `attach(view)` from the scene):
  - **Phases:** `idle` (built, not open) → `asking` → `waiting` (⇄ `reasking`) → `closed`.
  - **`open()`:**
    - `setPrompt(lines)` with `lines = [ask, elsewhere]`;
    - `view.bob('replay', true)`;
    - `t = say(ask)`.
  - **Own token ends:**
    - **`ask` completed:** bob replay off, bob map on, `t = say(elsewhere)`.
    - **`elsewhere` ends, or `ask` ends `completed:false`:** all bobs off. The phase becomes `waiting` and `idleMs = 0`. A cut `ask` never triggers `elsewhere`.
    - Foreign tokens are ignored, including Speaker replays.
  - **Clock:** `tick(ms)` advances `idleMs` only in `waiting`/`reasking`, so the clock starts when the question has finished. `activity()` sets `idleMs = 0` and does not change the phase.
  - **Re-ask (at most once per opening):** when `idleMs ≥ Timing.playAgainRepromptMs`, it replays the two-line sequence as `reasking`, with the ring on `replay` during `ask` and on `map` during `elsewhere`.
    - When the re-ask ends, the ring alternates `replay`/`map` every `Timing.playAgainRingSwapMs` (counted by ticks) until close.
    - Only one ring exists at a time, and the ring only swaps, it never blinks.
  - **Auto close:** when `idleMs ≥ Timing.playAgainAutoCloseMs`, it calls `close('auto')`.
  - **`replay()` / `backToMap()` / `overlay:close`** → `close('replay' | 'back' | 'station')`.
  - **`close(reason)`** works only from a non-closed phase (first call wins; later calls and inputs are no-ops). In order:
    1. `stopVoice` each live own token;
    2. `clearPrompt()`;
    3. `view.ring(null)`, all bobs off, `view.disable()`;
    4. `view.fadeOut(reason === 'auto' ? Timing.playAgainFadeOutMs : Timing.sceneFadeMs)`;
    5. unsubscribe `overlay:close`;
    6. `onClosed(reason)` exactly once.
- **Voice lines** (`content/play-again.ts › playAgainLines(gameId)`):
  - `ask` = `vo.shell.play-again-ask.<gameId>` when that line exists, else the generic `vo.shell.play-again-ask`.
  - `elsewhere` = `vo.shell.play-again-elsewhere`.
  - Boot already loads every `vo.shell.*` line.
- **AudioDirector** (`core/audio-director.ts`, backwards compatible):
  - `setPrompt(id | ids)` stores a chain, and `replayPrompt()` plays it through `request(chain, true)`, so the Speaker restarts both lines from the first with no overlap.
  - `clearPrompt()` makes the next `replayPrompt()` return `undefined`.
  - `stop(token)` cuts the current or pending utterance only if it has that token, ending it `completed:false`. Any other token is left alone.
- **Overlay scene** (`scenes/PlayAgainOverlay.ts`, wiring only):
  - **Create:** if `controller.closed`, `scene.stop()` at once and nothing is drawn or said.
  - **Drawing:**
    - A non-interactive full visible-rect dim in `playAgainOverlay.backdrop` (15%).
    - `button-replay` (`buttonReplay`, 160) and `button-back-to-map` (`buttonBackToMap`, 160), built with `createRoundButton(…, icon:'none')` plus children from `core/ui/play-again-icons.ts`.
    - Everything fades in over `sceneFadeMs`.
  - **Input:** `createTapRouter(this, { layer:'overlay' })` with two `createTapTarget` circles of `r = size/2 + spacing.hitPad`.
    - `onPress` → `pressButton` + `audio.sfx('sfx.shell.pop')` in the same handler, then `controller.replay()` or `backToMap()`.
    - Router `onAnyTap` → `controller.activity()`. The guard runs it for every primary press, including the Speaker, empty map and decorations.
  - **Clock and speech:**
    - `time.addEvent({ delay: Timing.hintTickMs, loop:true })` → `controller.tick(hintTickMs)`.
    - `bus.scoped(this).on('speech:ended', …)` forwards to the controller.
    - After `fadeOut`, `scene.stop()`.
  - **Bob and ring:**
    - The bob is `startBob` with its amplitude through `amplitude(…, reduced)`; stopping it returns the button to its base y.
    - The ring is `core/hint-visuals › createHintRing` around the button circle: diameter `size + 2·ui.hintRingPad`.
- **Placement** (pure `core/play-again-layout.ts › playAgainPlacement(obstacles, interactive)`):
  - Replay is on the left and map on the right. The centres are `size + gap` (208) apart, on one row.
  - Each button's box is its circle plus `ui.playBobPx` vertically.
  - **Obstacles:** the bbox of `hits[gameId]` ∪ the footprints of the decorations currently drawn at that station's slots (Map's registry, including the item that just landed).
  - **Candidates, first fit wins:**
    1. pair centred at x = 512, bottom edge `ui.playAgainClearPx` above the obstacles;
    2. the same centred below them;
    3. candidates 1 and 2 with x at the centre of the screen half away from the station.
  - **Fit:** both boxes inside the interactive rect (safeRect minus the dead bands, as in spec-2-2's rules) and clear of every obstacle.
  - **No fit:** clamp candidate 1 into the interactive rect and `console.warn`.
- **Icons** (`core/ui/play-again-icons.ts`):
  - **Replay:** frame `icon/<gameId>/00` of `atlas.map`, pivoted at `trimmedCentre` (spec-1-8) and scaled so its trimmed longest side is `ui.playAgainIconPx`.
    - If that frame is missing, use `<gameId>/idle/00`, with one warn.
    - A circular arrow badge (`ui.playAgainArrowPx`, `buttonRound.icon` ink, Graphics) sits at the lower-right.
  - **Map:** a Graphics island (`sand` ellipse under a `grass` ellipse, on a `sea` disc) with `kart/idle/00` scaled to `ui.playAgainKartPx` on top.
- **Map wiring while `playAgain` is open:**
  - **Station polygon tap:** in the same handler, `bus.emit('overlay:close')` first, then the normal `applyAll(trip.tapStation(id))`. That path gives a bounce plus name and a drive for an awake station (including the one just played), or a bounce plus happy sound for a sleeping one.
  - **Decoration, kart and empty taps:** unchanged (bounce/beep/nothing). The overlay stays open.
  - **`onClosed`:**
    - **`back` / `auto` / `station`:** `idle.reset()` then `idle.resume()`, so the invitation schedule restarts (UX-DR41). The kart stays parked at `lastStation`. For `station`, this runs before the trip commands, and a departing trip suspends idle again (spec-1-7).
    - **`replay`:**
      1. `SessionStore.clearResume(gameId)`;
      2. `applyAll(trip.replay(gameId))`.
- **`KartTrip.replay(id)`** (spec-1-7 controller):
  - Valid only in `parked` at `id`'s stop. Otherwise it returns `[]` and warns.
  - It returns `[load{id}]`, sets `via = 'replay'` and enters `entering`. Every tap is ignored while entering.
  - `enter{gameId:id, via:'replay'}` is emitted once, when `assetsSettled(id)` has been seen (before or after the call).
- **Enter on replay:**
  - Map calls `enterStation(scene, anchors[id], reduced, via === 'replay' ? Timing.replayZoomInMs : Timing.cameraZoomInMs)`. The new optional `zoomMs` parameter defaults to `cameraZoomInMs`. Under reduced motion it stays the `sceneFadeMs` fade.
  - Then spec-1-7's start runs with `startData` (the level from `ProgressStore.getDifficulty`, a new seed) and no `resume`.
- **Pause and timers:**
  - Everything runs on the overlay scene's `time` and tweens. The `AudioUnlockOverlay` pause (it pauses every other active scene) and a hidden page freeze the clock, bobs, ring and fades.
  - No `setTimeout` or `setInterval`. Every duration comes from `Tokens.Timing`, and every size from `Tokens`.

**Never:**
- No interactive backdrop, no text, no praise, no confetti, no new music.
- No overlay after `round:abandon`, for `touch-talk`, or when a queued tap ends the chain.
- No snapshot write and no resume start (Story 2.5).
- No second game start, and no game start outside Map/KartTrip.
- No change to the reward path, `grantDecoration`, the chain order or the Hud.
- No station hit-testing inside the overlay (Map owns the polygons). No blinking or flash faster than 1 Hz.
- No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **Idle clock:**
  - It starts when the question ends and runs through the re-ask. Any primary press anywhere (`onAnyTap`) resets it, because the child is not "yên".
  - The re-ask happens once per opening; a tap after it does not re-arm it.
  - The overlay therefore closes about 30 s after the question, or about 30 s after the last tap.
- **The Speaker** replays both lines (the chain prompt). A Speaker press during `ask` cuts it, and the controller skips `elsewhere` because the replay already contains it.
- **Close fades:** `sceneFadeMs` for replay, back and station; `Timing.playAgainFadeOutMs: 800` for auto ("mờ dần"). Input is disabled at once in all cases, so taps fall straight to Map.
- **The kart tap keeps the overlay open.** The AC closes only on station polygons.
- **Icon art:**
  - `art/map.blend` gains a detached `sprite.icon` group (spec-2-2 grammar) with `state.ice-cream` = Quaternius `animals/ShibaInu.fbx`. It uses spec-1-8's `recolor_creature` (`creatureOrange`, white face and belly kept) and alpha forced to 1. It is normalised by `ICON_SIZE_M` so the trimmed longest side ÷ renderScale is ≥ `ui.playAgainIconPx`.
  - The list lives in `content/play-again.ts › PLAY_AGAIN_ICONS = { 'ice-cream': { model:'quaternius/animals/ShibaInu.fbx', creature:'creatureOrange' } }`, passed by `tools/render/build.ts` like the decoration catalogue.
  - Epics 3/4 add their own entries. Until then the station-frame fallback and the generic line keep the overlay working ("tự hoạt động").
- **Voice lines** (scope `shell`, unapproved until a parent listens):
  - `vo.shell.play-again-ask.ice-cream` = "Chơi nữa với bạn Shiba nhé?" (6 words);
  - `vo.shell.play-again-ask` = "Mình chơi nữa nhé?";
  - `vo.shell.play-again-elsewhere` = "Hay mình đi chỗ khác?".
- **New values:**
  - `Timing.playAgainRingSwapMs: 2000` (≥ `flashMinPeriodMs`), `playAgainFadeOutMs: 800`.
  - `ui.playAgainIconPx: 112`, `playAgainArrowPx: 44`, `playAgainKartPx: 72`, `playAgainClearPx: 24`.
  - The existing `playAgainRepromptMs`, `playAgainAutoCloseMs` and `replayZoomInMs` are used as they are.
- **Scene order:** `[Boot, Start, MapScene, ...GAME_SCENES, PlayAgainOverlay, Hud, AudioUnlockOverlay]`, so the dim never covers the Speaker. Input priority comes from the guard layers, not the scene order.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open | chain end `{complete, ice-cream}` | `setPrompt([ask.ice-cream, elsewhere])`; replay bobs; `say(ask)` → t1 | — |
| Second line | t1 ends completed | replay bob off; map bob on; `say(elsewhere)` → t2 | — |
| Clock start | t2 ends | `waiting`; idle 0; bobs off | — |
| Cut ask | t1 ends `completed:false` (Speaker) | no `elsewhere`; `waiting`, idle 0 | — |
| Foreign token | `speech:ended{t9}` | ignored | — |
| Re-ask | 10 000 ms of ticks in `waiting` | ring replay + `say(ask)`; then ring map + `say(elsewhere)`; then ring swaps every 2000 ms | — |
| Activity | tap at idle 9 s | idle 0; re-ask 10 s later | — |
| One re-ask | idle reaches 10 s again after the re-ask | no second re-ask | — |
| Auto close | idle 30 000 ms | stop own tokens; `clearPrompt`; ring off; fade 800; `onClosed('auto')`; Map `idle.reset/resume` | — |
| Replay | press replay, then press again | one `onClosed('replay')`; `clearResume`; `trip.replay` → load → `enter{via:'replay'}` once; zoom 1500 ms | — |
| Back | press map | fade 300; `onClosed('back')`; kart parked; stations live at once | — |
| Station tap | tap pizza while open | `overlay:close` → closed; then bounce + happy sfx; idle restarted | — |
| Played station | tap ice-cream while open | closed; bounce + name; kart 0 ms drive; game starts at the saved level | — |
| Deco / empty / kart | tap while open | overlay stays; deco bounces; idle 0 | — |
| Close before create | `overlay:close` before the scene creates | scene stops at once; no `say` ever | — |
| Close mid-ask | `overlay:close` during t1 | `stopVoice(t1)`; no t2 | — |
| Abandon / touch-talk | `end({abandon})` or touch-talk | no controller; `idle.reset()` | — |
| Queued tap | spec-2-3 end with `queuedStation` | `onChainEnd` not called; no overlay; no "Chơi nữa…" | — |
| Paused | no ticks for 60 s | nothing changes; continues on resume | — |
| Missing line | gameId `pizza`, no per-game line | `ask` = `vo.shell.play-again-ask` | — |
| Missing icon | no `icon/pizza/00` | `pizza/idle/00` used | console.warn once |
| Placement | real `map.layout.json`, each of the 7 stations, worst-case items at all its slots | a candidate fits: inside the interactive rect, clear of obstacles, centres 208 apart | — |
| No fit | synthetic obstacle covering everything | candidate 1 clamped | console.warn |
| Audio chain prompt | `setPrompt([a,b])`; `replayPrompt()` | `request([a,b], restart)`; new token | — |
| Audio stop | `stop(t)` while t current / t pending / other current | that one ends `completed:false` / untouched | — |
| Trip replay | `parked` at ice-cream stop; `replay('ice-cream')`; settled | `[load]`; taps ignored; `enter{via:'replay'}` once | — |
| Trip replay invalid | `driving` | `[]` | console.warn |

</intent-contract>

## Code Map

- `app/src/core/play-again.ts` (new, + test) -- `PlayAgainController`, `PlayAgainView`, `CloseReason`.
- `app/src/core/play-again-layout.ts` (new, + test) -- `playAgainPlacement`, `PlayAgainPlacement`.
- `app/src/content/play-again.ts` (new) -- `PLAY_AGAIN_ICONS` and `playAgainLines(gameId, isLine = isVoiceLineId)`.
- `app/src/core/ui/play-again-icons.ts` (new) -- the replay and map icon children and the arrow badge.
- `app/src/scenes/PlayAgainOverlay.ts` (new) -- wiring. `app/src/scenes/AudioUnlockOverlay.ts` is the real pattern for an overlay scene: dim, `createRoundButton`, sleep/stop. It migrates to `TapTarget` in spec-1-6.
- `app/src/core/audio-director.ts` (+ test) -- real: `say`, `sayChain`, `setPrompt(id: string)`, `replayPrompt`, private `request`/`cutCurrent`/`dropPending`. Add the chain prompt, `clearPrompt` and `stop`.
- `app/src/core/bus.ts` -- real: `'overlay:close'` and `'speech:ended'` exist. Unchanged.
- `app/src/core/timing.ts`, `app/src/core/tokens.ts` (+ `tokens.test.ts`) -- real: `playAgainRepromptMs`, `playAgainAutoCloseMs`, `replayZoomInMs`, `sceneFadeMs` (spec-1-7) and `ui`. `tokens.generated.ts` (real) has `buttonReplay`, `buttonBackToMap`, `playAgainOverlay.{gap,backdrop}`, `colors.{sea,sand,grass}`.
- `app/src/core/ui/round-button.ts` -- real `createRoundButton`, `pressButton`, `startBob`. Its `icon` option is planned in spec-1-6; add `'none'`.
- `app/src/core/input/{tap-router,tap-target,guard}.ts` -- planned in spec-1-5/1-6/2-2/2-3 (layers, `onAnyTap`, `z`, `toWorld`).
- `app/src/core/hint-visuals.ts` -- `createHintRing`, planned in spec-1-5/1-9. `app/src/core/reduced-motion.ts` -- `amplitude`, planned in spec-1-5. `app/src/core/ui/sprite-pivot.ts` -- `trimmedCentre`, planned in spec-1-8.
- `app/src/core/kart-trip.ts` (+ test) -- planned in spec-1-7. Add `replay(id)` and `enter.via`.
- `app/src/core/motion.ts` (+ test) -- `enterStation`/`enterPlan`, planned in spec-1-7/2-3. Add `zoomMs`.
- `app/src/core/session-store.ts` -- `clearResume`, planned in spec-2-3.
- `app/src/core/decoration-plan.ts` -- footprints, planned in spec-2-2. `app/src/core/post-round-chain.ts` -- `ChainEnd`, planned in spec-2-3.
- `app/src/scenes/Map.ts` -- planned in spec-1-5…2-3: `onChainEnd`, the station tap handler, the `enter` command and the decoration registry.
- `app/src/main.ts` -- the scene list (real; `GAME_SCENES`/`Hud` come with spec-1-6/1-7).
- `app/src/content/voice-lines.ts`, `app/src/content/validate.ts` (+ test) -- real. Add the 3 lines and the rules.
- `app/tools/render/build.ts`, `app/tools/render/blender/build_map.py`, `app/tools/layout/rules.ts`, `app/tools/atlas/pack.ts`, `app/tools/lint/validate-content.ts` -- planned in spec-1-4/2-2. Add `sprite.icon` and the icon-frame rule.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/core/timing.ts`, `app/src/core/tokens.ts`, `tokens.test.ts` -- the new values. Assert `playAgainRingSwapMs ≥ flashMinPeriodMs` and `playAgainRepromptMs < playAgainAutoCloseMs`.
- [x] `app/src/content/voice-lines.ts`, `app/src/content/play-again.ts`, `app/src/content/validate.ts` (+ test):
  - the 3 lines, then `npm run tts`;
  - `PLAY_AGAIN_ICONS`, `playAgainLines`;
  - rules: every `vo.shell.play-again-ask.<x>` and every `PLAY_AGAIN_ICONS` key is a `GameId` other than `touch-talk`; the generic and `elsewhere` lines exist.
- [x] `app/src/core/audio-director.ts` (+ test) -- the chain prompt, `clearPrompt` and `stop(token)`, with the audio matrix rows. Existing single-id prompt tests stay green.
- [x] `app/src/core/play-again.ts` (+ test) -- every controller row of the matrix with fake ports and fake ticks.
- [x] `app/src/core/play-again-layout.ts` (+ test) -- the candidate order, the no-fit warn, and the real-layout row (worst-case footprints from `planDecorations` over every catalogue item at every slot of the station).
- [x] `app/src/core/kart-trip.ts`, `app/src/core/motion.ts` (+ tests) -- `replay`, `enter.via`, `zoomMs`.
- [x] `app/src/core/ui/round-button.ts`, `app/src/core/ui/play-again-icons.ts` -- the `'none'` icon, the icon children and the frame fallback.
- [x] `app/src/scenes/PlayAgainOverlay.ts`, `app/src/main.ts` -- the scene and its registration in the order above.
- [x] `app/src/scenes/Map.ts` -- the `onChainEnd` replacement, `openPlayAgain`, `overlay:close` on station taps, `onClosed`, replay through `trip.replay`, and the `enter` duration. Add a Vitest regression in `post-round-chain.test.ts` that a queued tap never reaches `end` → hook.
- [x] `app/tools/render/build.ts` (+ test), `build_map.py`, `app/tools/layout/rules.ts` (+ test), `validate-content.ts`:
  - `sprite.icon` / `state.<id>`, plus `ICON_SIZE_M`;
  - rule: `icon/<id>/00` exists for every `PLAY_AGAIN_ICONS` key, with trimmed longest side ÷ renderScale ≥ `ui.playAgainIconPx`, naming the id.
  - Regenerate with `npm run art:build -- map && npm run render -- map && npm run atlas -- map`.

**Acceptance Criteria:**
- Given a fresh `npm run dev` at 1180×820 touch emulation, when a Tiệm kem round ends and the fly-in lands:
  - The island dims slightly, and a green button with Shiba and a small circular arrow appears next to a blue button with a little island and kart. They sit side by side, 48 px apart, above the truck, and the new decoration stays visible.
  - The green button bobs while "Chơi nữa với bạn Shiba nhé?" plays. Then the blue one bobs while "Hay mình đi chỗ khác?" plays.
  - A Speaker tap mid-question restarts both lines from the first, with no overlap.
- Given the overlay is open, when the child taps the green button and then taps it again with two fingers, then the overlay closes, the camera zooms into the truck over about 1.5 s (a fade under reduced motion), and Tiệm kem starts exactly once at the level stored in `bhc.progress`.
- Given the overlay is open, when the child taps the blue button, then only the overlay closes. The kart stays at the truck, a station tap works immediately, and an invitation comes after about 8 s idle.
- Given the overlay is open, when the child taps the pizza shop, then the overlay closes and the shop bounces with the happy sound. When the child taps a decoration or empty grass, the overlay stays and the decoration bounces.
- Given the overlay is open and the child does nothing, then about 10 s after the question the question plays once more and the ring moves between the two buttons, one ring at a time. About 30 s after the question the overlay fades out and the "Mời chơi" invitations resume.
- Given the overlay is open, when the tab is hidden and shown so that `AudioUnlockOverlay` appears, then the overlay's clock and bobs freeze, and after the ▶ tap they continue from the same point.
- Given the child taps the pizza shop during the fly-in, when the chain ends, then no overlay appears, no "Chơi nữa…" line plays, and the kart drives to the pizza shop.
- Given `window.bhcDev.flyInTouchTalk()` (spec-2-3) or a Home tap mid-round, when Map returns, then no overlay appears.

## Spec Change Log

- **2026-10-09 (before implementation): what Story 2.3 actually built.**
  - The post-round chain lives in `core/post-round-chain.ts`, as `PostRoundChain` with `routeRoundComplete` / `routeRoundAbandon`.
  - Map's public `onChainEnd` hook defaults to `idle.reset()`.
  - A chain that Map `create` starts for pending fly-ins, with no round played, uses kind `abandon` and the first pending slot's station as `gameId`. The overlay must not offer "play again" for that start. Distinguish it (for example with a new `ChainKind`), as recorded in deferred-work.md.
  - Story 2.2 left 1–2 decoration slots per station (10 in total).
- **2026-10-09 (review patch): replay always waits for this load's settle.** `KartTrip.replay` drops the id from `settled` and emits only `load`; `enter{via:'replay'}` follows the settle of that load. This replaces the earlier "settled before or after the call" allowance, because the game's assets are released when its scene shuts down (triage #1).

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind | `KartTrip.replay` keeps the previous trip's `settled` set, so `enter{via:'replay'}` fires at once while the game's assets (released on its shutdown, AR39) are reloading | high | kart-trip.ts `replay`: `if (this.settled.has(id)) out.push(...this.enterReplay())` with no reset; Map `releaseGame` frees the assets on shutdown | patch |
| 2 | blind, edge | A refused replay (kart not parked at its stop, or no trip) leaves Map with no overlay, no game and idle suspended; `clearResume` already ran | medium | Map.ts `playAgainClosed` returns after `trip.replay` with no fallback | patch |
| 3 | verification-gap | Map's play-again close routing (four reasons) and the `via:'replay'` zoom choice run in no test | medium | No test runs Map.ts; swapping the replay branch keeps every test green | patch |
| 4 | blind, edge | `close()` calls `clearPrompt()` without an id, wiping another owner's prompt | low | `AudioDirector.clearPrompt(id)` already supports the id; direct fix | patch |
| 5 | verification-gap | PlayAgainOverlay's forwarding of `speech:ended` / tick / activity to the controller is untested | medium | Thin Phaser wiring; no scene harness | defer |
| 6 | edge | Hud Speaker/Home circles are not obstacles for button placement | maybe-false | Would matter only if a candidate reaches the top-right Hud corner; the real-layout test does not include Hud rects | defer |
| 7 | edge | Replay button offered for a game with no stop | low | Every registered game has a stop anchor | reject |
| 8 | blind | "No overlay for touch-talk" written in two places | low | No divergence today | reject |
| 9 | blind | Icon atlas rule skipped when map.json is missing; atlas read twice | low | The atlas always exists; other rules fail first | reject |
| 10 | blind | Icon colour token typed as `string` | low | A typo fails `art:build` loudly | reject |
| 11 | blind | A Speaker replay during asking starts the idle clock early | low | Only shortens the re-ask/auto-close window; no child-visible break | reject |
| 12 | blind | Dim not resized on viewport change while open | low | Stage rotation keeps the design space; the overlay lasts ≤ 30 s | reject |
| 13 | blind | Reduced-motion bob height reuses `amplitude` on a pixel value | low | Works with the current function; no harm shown | reject |
| 14 | blind | Stop and relaunch of the overlay in one tick may be order-sensitive | maybe-false | No path reopens the overlay while one is open in normal play | reject |
| 15 | blind | Empty-chain warning names a fake line; `stop(token)` chain behaviour undocumented | low | Diagnostics only | reject |
| 16 | blind | `fittedImage` stretches frames without trim data | low | Every atlas frame has `spriteSourceSize` | reject |
| 17 | blind | Replay hit circle vs `playAgainClearPx` not tied by a test | low | hitPad 24 = clear 24 today | reject |
| 18 | edge | Real-layout placement test builds footprints itself instead of via `planDecorations` | low | Same footprint maths (`decorationFootprint`) | reject |

## Design Notes

**Why the controller is built by Map, not by the overlay scene:** `scene.launch` runs on the next scene-manager step. A station tap in that gap would emit `overlay:close` before the scene could subscribe, and the question would then start after the kart had left. Because the controller exists synchronously at chain end and subscribes at once, the race cannot happen. The scene only checks `controller.closed` in `create`:

```ts
create({ controller, gameId, placement }: PlayAgainData) {
  if (controller.closed) { this.scene.stop(); return; }
  const view = buildPlayAgainView(this, gameId, placement); // buttons, dim, ring/bob ports
  controller.attach(view);
  bus.scoped(this).on('speech:ended', (e) => controller.speechEnded(e.token, e.completed));
  this.time.addEvent({ delay: Tokens.Timing.hintTickMs, loop: true, callback: () => controller.tick(Tokens.Timing.hintTickMs) });
  controller.open();
}
```

**Why `KartTrip.replay` and not a direct start:** the game's assets were released when it stopped (AR39). KartTrip already owns "load, then enter once settled, ignore taps while entering". Reusing it gives the first-finger and no-double-start guarantees with no second start path.

**Cross-epic contract:** a new game gets a working overlay through the generic line and the station-frame icon. To get the AC-quality version, it adds `vo.shell.play-again-ask.<id>` (for example "Chơi nữa với bạn cáo nhé?") and a `PLAY_AGAIN_ICONS` entry.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0. The controller, placement (including the real layout), audio, kart-trip, motion, token and content tests pass, and `validate:content` reports the `icon/ice-cream/00` frame.
- `cd app && npx vitest run src/core/play-again.test.ts src/core/play-again-layout.test.ts` -- expected: every matrix row passes.
- `cd app && npm run art:build -- map && npm run render -- map && npm run atlas -- map` -- expected: exit 0; `atlas.map` stays one page ≤ 2048² and includes `icon/ice-cream/00`.

**Manual checks:**
- Run the AC walkthroughs at 1180×820 and in portrait 820×1180, with and without reduced motion. Check:
  - the buttons sit inside the safe area, clear of the edge strips;
  - the Speaker is never dimmed;
  - nothing blinks, and only the speaking button bobs.
- Check that the Shiba icon reads clearly at 160 px and is orange with a white face, not grey-brown.
