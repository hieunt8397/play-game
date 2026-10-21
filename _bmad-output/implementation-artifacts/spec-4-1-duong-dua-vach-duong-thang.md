---
title: 'Story 4.1 — Đường đua: vạch đường thẳng cho kart chạy tới cổng caro'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'NO_VCS'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-cross-notes.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-8-tiem-kem-keo-kem-dung-vi-cho-shiba.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-9-goi-y-leo-thang.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-tiem-kem-luot-3-5-cau-do-kho-tang-dan.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-kart-chay-toi-tram.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-6-nut-nha-va-loa-chong-cham-nham.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-pipeline-hinh-render-blender-atlas-layout.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-4-lop-phu-hoi-choi-tiep.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-giu-luot-do-trong-phien.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The checkered-gate station (`race`) is still asleep. There is no race art, layout, voice or game scene, and `core/input` has no `TracePath`, so FR10/FR12 cannot be played. The child cannot trace a finger along a road and have the kart (with its little driver) follow it to the gate, without ever being "wrong" and without losing progress on a lift.

**Approach:**
- **Art:** a Blender builder makes `art/race.blend` from the vendored island scene. It reuses the map's kid kart (`Car` collection) and the checkered arch (`Race` collection), and adds three almost-straight `path.straight-<n>` roads plus a few border cones. The spec-1-4 tools then produce `atlas.race`, `bg.race` and `race.layout.json`, and a new `validateRace` rule keeps every 100 px road band clear of the edges and the Home/Speaker zones.
- **Input:** a pure `TraceModel` (windowed forward projection, tolerance bands, wait/resume) plus a thin `createTracePath` adapter in `core/input`.
- **Game:** `games/race` follows the ice-cream structure: pure `questions.ts` and `round.ts`, a ladder in `content/games/race.ts` and a wiring-only `Race.ts` scene. Hints go through HintDirector, the tally and `round:complete` through `MiniGameBase`, the resume envelope through `progress()`.
- **Shell:** the station wakes (`GAME_CONTENT` + `awake`), with an invite line, a play-again line and a `PLAY_AGAIN_ICONS` entry.

## Boundaries & Constraints

**Always:**
- **Art builder** (`tools/render/blender/build_race.py`, run with `npm run art:build -- race`; it follows every spec-1-4/1-8 invocation, temp-dir and naming rule):
  - **Base scene:** open `art/src/map-v2.blend`, then delete:
    - `GameIce`, `HintRing`, `CamGame2`;
    - the station collections `IceCream`, `Pizza`, `Town`, `Cave`, `Dino`, `Fish` and `RaceCars`;
    - the island road `Road`, `RoadEdge` and `Dash*`;
    - the flags `Flag*` and `FlagPole*`.

    Keep `World` (sea, sand, grass), `Nature` and `Sky`. Add camera `CamRace`: a high 3/4 view onto open grass, defined by named world-unit constants (`CAM_RACE_LOC`, `CAM_RACE_ROT`, `CAM_RACE_LENS`), rendering at 2048×1536.
  - **`sprite.kart`:** the `Car` collection (empty `A_KidKart` with `kart-oobi`, `character` and wheels; verified in the reference blend).
    - The builder adds a cap to `character`: a UV hemisphere plus a brim disc in `creaturePink`.
    - It adds two big eyes on the face: white discs with an `iconInk` pupil.
    - It adds a waving arm: a cylinder sleeve in `creaturePink` and a white mitten sphere, pivoting at the shoulder. The arm is `hide_render` on frame 1 and visible on frames 10–13, rotated +25°/−25° alternately.
    - It yaws `A_KidKart` by `KART_YAW` so the kart drives toward screen-right with the driver's face toward the camera.
    - It scales the kart by `KART_SCALE` so the trimmed longest side ÷ renderScale lies in [`kart.size`, 1.6 × `kart.size`].
    - Props: `states = {"idle":[1],"wave":[10,11,12,13]}`, `movable: true`.
  - **`sprite.gate`:** the arch objects of the `Race` collection (`ArchPost*`, `ArchBall*`, `Chk*`). They are scaled by `GATE_SCALE` so the trimmed width ÷ renderScale is ≥ `ui.raceGateMinPx`, and carry `movable: true`.
  - **Layout objects** (spec-1-4 grammar; the layout JSON v1 format is unchanged):
    - `path.straight-1..3`: poly curves on the grass top, 3–7 points each, almost straight (horizontal, gently rising, gently falling), starting on the left. They come from a `ROADS` table of world XY points.
    - `anchor.kart`: the kart's ground centre between the wheels, at its render pose.
    - `anchor.gate`: the midpoint between the two post feet, at its render pose.
    - `anchor.cone-1..4`: one per plate cone (Kenney car-kit `cone.glb`, placed from a `CONES` table).
- **Screen rules** (`tools/layout/rules.ts › validateRace(layout, atlasJson)`, run by `render`, `atlas` and `validate:content`; every message names the id):
  - Every `pathId` in any `RACE_LADDER` level has `paths[id]` with ≥ 2 points.
  - **Road band:** resample each path every ≤ 4 px. Every sample must lie inside the spec-1-4 interactive rect inset by `tracePath.width/2`, and at ≥ `tracePath.width/2` from every HUD keep-out rect (see below).
  - Each `anchor.cone-*` lies ≥ `tracePath.width/2 + spacing.targetGap` from every path.
  - The atlas has every frame in `RACE_SCREEN.frames`, which are `kart/idle/00`, `kart/wave/00..03` and `gate/idle/00`. The trimmed sizes follow the kart and gate rules above, and `bg.race` is 2048×1536 (spec-1-8's background rule).
- **HUD keep-out** (`tools/layout/hud-keep-out.ts › hudKeepOutRects()`, pure):
  - For aspect = `supportedAspect.min` and `.max`, take `visibleRect(1024, 768, aspect)` and spec-1-6's `hudLayout` with zero insets.
  - Around each Home and Speaker centre, build a square of side `ui.hudKeepOutPx` (120). Each button's result is the bounding rect of its two squares.
  - If `core/hud.ts` cannot load under Node type stripping, move `hudLayout` into a pure `core/hud-layout.ts` (`.ts` specifiers) and re-export it.
- **TraceModel** (`core/input/trace-model.ts`, pure, no Phaser). It is built from `(points, opts)`, with the defaults coming from Tokens:
  - **Resampling:** the path is resampled every `ui.traceSampleStepPx` (4) of arc length. `s` is the kart's arc length, `index = floor(s / step)` and `point = pointAt(s)`. Use spec-1-7's `core/road.ts` polyline maths, generalised to any polyline if it is bound to the map road.
  - **States:** `idle` (before the first grab), `tracing`, `waiting`, `arrived`.
  - **`press(p) → boolean`:** grabs when the state is `idle` or `waiting` and `|p − point| ≤ ui.raceGrabRadius` (100). The state becomes `tracing` and the stored finger is `p`.
  - **`move(p)`:** while `tracing`, stores the finger. While `waiting` with the finger still down, `p` within `raceGrabRadius` of the kart re-grabs.
  - **`release()`:** `tracing` → `waiting`, and `s` is kept.
  - **`tick(dt)`** (dt clamped to 250 ms):
    - Project the finger onto the sub-path [s, s + `ui.traceLookaheadPx`] only. A projection behind `s` clamps to `s`.
    - Let `d` be the distance from the finger to the projected point and `gap` the arc ahead.
    - `d ≤ tracePath.tolerance` (80): advance `min(gap, ui.traceKartPxPerMs × dt)`.
    - `80 < d ≤ ui.traceStopPx` (140): advance `min(gap, ui.traceMidSpeedScale × ui.traceKartPxPerMs × dt)`.
    - `d > 140`: `waiting` (held), no advance.
    - `s` never decreases. Reaching `length − ui.traceArriveSlackPx` snaps `s = length` and the state becomes `arrived`, which is terminal.
  - **Events** returned from calls: `grab`, `progress{s,index}` (only when `s` changed), `wait`, `arrive`.
  - **`restore(index)`** sets `s = index × step` in state `waiting`. Story 4.2 uses it.
- **TracePath adapter** (`core/input/trace-path.ts`; builds on spec-1-6's router and guard and spec-1-8's `pointermove` forward):
  - `createTracePath(router, { points, onEvent }) → TracePath`, with `tick(dt)`, `restore(index)`, `setEnabled`, `destroy`, the read-only `s` / `index` / `point` / `state`, and for hints `object?` and `onLiftChange(fn)`.
  - Its grab target is a circle at `point` with r = `raceGrabRadius`, updated after every tick.
  - A primary press on it runs `model.press`. On a grab it calls `guard.setDragging(pointer, true)` and emits `grab` in the same `pointerdown` handler.
  - Release and the guard's self-heal both call `model.release()`.
  - Dead-zone and second-finger presses never reach it (spec-1-6 guard). While dragging, a Hud press by a second finger is also ignored.
- **Questions** (`games/race/questions.ts`, pure): `roundRoads(seed, level) → PathId[]`.
  - It uses `mulberry32(seed >>> 0)` and returns `ladder[level].roads` ids from `ladder[level].pathIds`. Two consecutive ids never match.
  - The result is deterministic, and an out-of-range `level` is clamped.
- **Round model** (`games/race/round.ts`, pure; the commands follow spec-1-8's `apply` pattern):
  - **`start(resumeAt)`:**
    - It begins road `resumeAt?.questionIndex ?? 0`. An out-of-range index warns once and begins road 0.
    - It emits `beginRoad{index, pathId}`. The scene draws the road, places the gate and the kart at the start, and calls `hint.beginQuestion({ promptLineId: 'vo.race.prompt', retryLineId: 'vo.race.retry', step })`.
    - The step is `{ action: 'trace', correct: [tracePath], distractors: [], target: gateTarget, path: () => aheadPoints(ui.raceHintStretchPx) }`. `gateTarget` is `createDropTarget({ id: 'gate', circle at the path end, r: spacing.snapRadius })`.
  - **`progressed(s)`:** emits `hintActivity` each time `s` grows by ≥ `ui.traceHintProgressPx` since the last one. The scene answers with `hint.stepDone(step)`: the level is kept and idle restarts, so a child who is tracing is not escalated.
  - **`arrived()`:** the spec-1-9/1-10 order applies: `questionDone` → `lockTrace` → `celebrate{final}`. The model advances `questionIndex` at once.
    - Not the last road: `nextRoad{afterMs: Timing.raceShortCelebrateMs}`. The scene fades the road, gate and kart out over `sceneFadeMs`, then begins the next road.
    - The last road (`index + 1 === roads.length`): `finishRound{afterMs: Timing.roundCelebrationMs}`.
  - **`progress()`** = `{ questionIndex, partial: { traceIndex } }`. `traceIndex` is the TracePath `index`, or 0 after the advance. Story 4.2 consumes `partial.traceIndex` on resume; in 4.1 the resumed road starts clean.
  - The game never calls `hint.wrong()`.
- **Scene** (`games/race/Race.ts extends MiniGameBase`; wiring only):
  - **Depth:** `bg.race` < road < kart < gate.
  - **Road drawing** (from the resampled points):
    - static layers drawn once per road: an edge band of width `tracePath.width` in `tracePath.edge.color`, a surface band `width − 2·edge.width` in `tracePath.surface`, and a dashed centre line in `tracePath.guide` (`ui.roadDashWidth`, `roadDashLen`, `roadDashGap`);
    - a driven overlay of `hintCore` at `ui.raceDrivenAlpha` over samples ≤ `s`, redrawn only when `s` changes.
  - **Kart and gate placement:** each sprite's origin = its `anchor` ÷ the full design frame (full-frame frames, spec-1-4), at scale `1/renderScale`. The kart pivot sits on `point`. Its scaleX sign is `RACE_KART.artFacing × sign(tangent dx)`, and it keeps the last facing when dx ≈ 0. A `draggableItem.liftShadow`-coloured ellipse sits under the kart and the gate.
  - **Grab feedback:** in the press handler, the kart pulses 1 → `tappableProp.react.scale` → 1 over `react.durationMs` (amplitude through `amplitude(…, reduced)`), and `sfx.race.engine` plays.
  - **Waiting:** the kart alpha yoyos 1 ↔ `ui.raceWaitAlpha` with a period of `Timing.raceWaitBlinkMs` (1200 ms, so ≤ 1 Hz). This runs only while the state is `waiting` and the hint level is < 2.
  - **Hint level ≥ 2** (own `hint:level` subscription): a guide glow runs. A `hintCore` stretch of the dash ahead of the kart lights up progressively over `ui.raceGuideGlowPx`, looping every `Timing.raceGuideSweepMs`. Under reduced motion it is a static highlight of the same stretch that fades in. The glow stops at level 0. Ring, bob and hand come from HintDirector unchanged.
  - **`update(_, delta)`:** `trace.tick(delta)`, then the events go to the round model and the visuals. It does nothing once the round has ended.
  - **Celebration:**
    - Short (not the last road): `kart/wave` frames every `Timing.raceWaveFrameMs` and `sfx.race.horn`.
    - Final: the same, plus `sfx.race.happy` and the kart bouncing through `character.celebrate` (scales, repeat, durationMs; reduced amplitude).
- **HintStep widening** (`core/hint-director.ts`, spec-1-8/1-9):
  - `correct` and `distractors` become `readonly HintItem[]`, where `HintItem = { readonly object?: GameObject; onLiftChange?(fn): void }`. `Draggable` and `TracePath` both satisfy it.
  - `path` becomes `readonly Point[] | (() => readonly Point[])`, resolved when each hand demo starts.
  - Machine behaviour is unchanged.
- **Content** (`content/games/race.ts`, data only):
  - `RaceLevel = { id; shape: 'straight'|'curve'|'zigzag'|'loop'; roads: 3|4|5; pathIds: readonly string[] }`, with `ladder = [{ id: 'straight', shape: 'straight', roads: 3, pathIds: ['straight-1','straight-2','straight-3'] }]`.
  - `RACE_SCREEN` holds the frames and anchors listed above. `RACE_KART = { artFacing: 1 }`.
  - `assets = { atlases: [ATLASES.race], images: [BACKGROUNDS.race], audio: [every vo.race.*, sfx.race.*] }`.
  - The game is registered in `content/games/index.ts › GAME_CONTENT`, and the `race` station gets `awake: true`.

**Never:**
- No `hint.wrong()`, no "sai", no red, ✗, shake or error sound. The kart never moves without the child's finger.
- No curve, zigzag or loop roads, no ladder levels beyond 0, no `traceIndex` restore on resume, no background ambient (flags, clouds, cone wobble). Those are Story 4.2.
- No `setTimeout`, `this.sound`, `this.load` or `scene.*` navigation in `games/race`. No raw pointer events outside `core/input`. No hand-entered design coordinates, magic numbers or hex in games.
- No change to the spec-1-4 JSON format or to the HintDirector machine. No difficulty logic in the game.
- No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **Road naming:** the epic's `anchor.path.<shape>-<n>.<nn>` is illegal in spec-1-4's id grammar (dots and `.NNN` suffixes are rejected). Roads therefore use the existing `path.<id>` kind, whose ordered curve points are the `<nn>` samples. "pathId has no anchor" is checked as a missing `paths[id]`.
- **Half speed** means half the kart's catch-up speed (`traceKartPxPerMs` 1.0 → 0.5) toward the projected point. "Theo sát" means catching up at full speed. Both are measurable per tick.
- **Leaving the band while the finger is down** acts like a lift: the kart waits and blinks. The same finger coming back within 100 px of the kart resumes without lifting.
- **`questionDone` comes before the celebration** (the spec-1-9/1-10 order). The ring vanishes on arrival, and a Home tap during the celebration snapshots the next road. This satisfies the AC's "short celebration, then `questionDone`" intent: each road still closes through `questionDone`.
- **Tracing counts as hint activity** through `stepDone(sameStep)` every 120 px. Without it, a slow tracer would get rings, and `firstTryCorrect` would drop while the child was busy.
- **The prompt is re-read for each road** (`beginQuestion`), as in Tiệm kem.
- **The gate is a `DropTarget`.** That gives HintDirector's `trace` hand a non-null target; level 4 is unreachable.
- **Voice lines** (unapproved, `keywordPauseMs: 300`):

  | id | text |
  |---|---|
  | `vo.race.prompt` | "Bé lái xe \| tới cổng nhé!" |
  | `vo.race.retry` | "Đưa ngón theo đường \| tới cổng nhé!" |
  | `vo.shell.invite.race` | "Bé ơi, mình đi \| đua xe nhé!" |
  | `vo.shell.play-again-ask.race` | "Chơi nữa với bạn lái xe nhé?" (no pause) |

- **SFX placeholders** (50 ms fade-in, peak −20 dBFS, game-scoped):
  - `sfx.race.engine`: a soft rising two-partial "vroom", ~400 ms;
  - `sfx.race.horn`: a happy two-tone beep, ~300 ms;
  - `sfx.race.happy`: a major arpeggio, ~1.5 s.
- **Play-again icon:** `PLAY_AGAIN_ICONS.race = { model: 'kenney/kenney_car-kit/Models/GLB format/kart-oobi.glb' }`. spec-2-4's `creature` becomes optional, and when it is absent the icon keeps the source colours. `atlas.map` is re-rendered for `icon/race/00`.
- **Contrast:** spec-1-9's `hint-contrast` also samples `bg.race` around each path's first point, with ring diameter `kart.size + 2·hintRingPad`.
- **Dead zones** are checked in design px, ignoring safe-area (the spec-1-4 precedent, conservative).
- **New values:**
  - `ui`: `raceGrabRadius 100`, `traceStopPx 140`, `traceMidSpeedScale 0.5`, `traceKartPxPerMs 1.0`, `traceSampleStepPx 4`, `traceLookaheadPx 240`, `traceArriveSlackPx 8`, `traceHintProgressPx 120`, `raceHintStretchPx 240`, `raceGuideGlowPx 240`, `raceGateMinPx 150`, `raceWaitAlpha 0.55`, `raceDrivenAlpha 0.3`, `roadDashWidth 6`, `roadDashLen 18`, `roadDashGap 14`, `hudKeepOutPx 120`.
  - `Timing`: `raceWaitBlinkMs 1200`, `raceGuideSweepMs 1500`, `raceShortCelebrateMs 1000`, `raceWaveFrameMs 150`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enter | `{level:0, seed:7}` | 3 distinct-consecutive straight roads; road 0 drawn, kart at start, gate at end; `beginQuestion(prompt, retry, trace step)` | — |
| Grab | press 90 px from kart | `grab`; pulse + engine in the same handler; `setDragging` | — |
| Far press | press 130 px from kart, on the road | nothing | — |
| Close band | horizontal road, finger 100 px ahead, 60 px off | tick 50 ms → `s += 50` | — |
| Mid band | same, 110 px off | tick 50 ms → `s += 25` | — |
| Stop band | same, 160 px off | `wait`; no advance; blink | — |
| Back in, still down | after the stop, finger 70 px from kart | re-grab, advancing again | — |
| Backward | finger behind the kart | `s` unchanged | — |
| Near other part | finger near a road point 400 px of arc ahead (outside the window) | projects only within [s, s+240]; no jump | — |
| Lift | release mid-road | `waiting`; `s` kept; blink ≤ 1 Hz | — |
| Re-place far | press 150 px from the waiting kart | nothing | — |
| Second finger | another touch (incl. Home) while tracing | ignored; the trace continues | — |
| Dead zone | press at local (10, 400) | no trace | — |
| Arrive | `s ≥ length − 8` | `s = length`; `questionDone` → lock → short celebration → next road after 1000 ms | — |
| Hint activity | traced 130 px | one `stepDone(step)`; level unchanged | — |
| Idle | prompt ended, 6 s, then 6 s more | level 2: ring + bob + guide glow, blink stops; level 3: hand along the 240 px ahead + retry voice | — |
| Last road | 3rd arrival | final celebration; after 1500 ms exactly one `round:complete {gameId:'race', questions:3, firstTryCorrect, maxHintLevel ≤ 3}`; inert | — |
| Tally | road 1 clean, road 2 idle to level 2, road 3 clean | `firstTryCorrect 2, maxHintLevel 2` | — |
| Home mid-road | `hud:home` at index 1, `s` = 60 % | one `round:abandon`; `progress()` = `{questionIndex:1, partial:{traceIndex}}` | — |
| Resume (4.1) | `resume.questionIndex 1` | road 1 from the start, prompt re-read, level 0 | — |
| Bad index | `resume.questionIndex 7` | road 0 | console.warn once |
| Road in HUD zone | a path point at Home's keep-out | render, atlas and check fail naming `straight-n` | exit 1 |
| Missing path | ladder `straight-3` absent from the layout | check fails naming it | exit 1 |
| Determinism | same `(seed, level)` | identical road list | — |

</intent-contract>

## Code Map

- `app/src/core/input/{guard,tap-router,tap-target,space}.ts` -- planned in spec-1-6 (primary, `setDragging`, dead zones, `toDesign`); spec-1-8 adds the router's `pointermove` forward and `drop.ts › createDropTarget`. New: `trace-model.ts`, `trace-path.ts`.
- `app/src/core/road.ts` -- planned in spec-1-7 (polyline `length`, `project`, `pointAt`); reused, generalised if it is map-bound.
- `app/src/core/hint-director.ts`, `hint-machine.ts`, `hint-visuals.ts` -- planned in spec-1-8/1-9 (`HintStep`, the `trace` hand along `step.path`). Widen `HintStep`.
- `app/src/games/mini-game-base.ts` -- planned in spec-1-7/1-8/1-9/1-10/2-5 (`hint` wrapper + tally, `finishRound`, `progress()`, `resumeAt`, `addAmbient`).
- `app/src/games/ice-cream/{questions,round,IceCream}.ts` -- planned in spec-1-8/1-10; the model for `games/race`.
- `app/src/core/rng.ts` (`mulberry32`), `core/ui/sprite-pivot.ts`, `core/reduced-motion.ts › amplitude` -- planned in spec-1-8/1-5.
- `app/src/content/games/{types,index}.ts`, `content/stations.ts`, `content/assets.ts` (`ATLASES`, `BACKGROUNDS`), `content/layouts.ts` -- planned in spec-1-4/1-5/1-7/1-8.
- `app/src/content/play-again.ts` -- planned in spec-2-4 (`PLAY_AGAIN_ICONS`); `tools/render/blender/build_map.py` icon branch.
- `app/src/content/voice-lines.ts`, `content/audio-catalog.ts`, `content/validate.ts` (`voiceWords`, `BANNED_PAIRS`) -- real. `tools/audio/make-placeholders.ts` -- real.
- `app/src/core/tokens.generated.ts` -- real `components.tracePath {width 100, surface, edge{6}, guide, tolerance 80}`, `kart {96, 24}`, `character.celebrate`, `tappableProp.react`. `core/tokens.ts` (`ui`, `supportedAspect`), `core/safe-rect.ts › visibleRect` -- real. `core/timing.ts` -- real.
- `app/tools/layout/rules.ts`, `tools/render/{build,render}.ts`, `tools/render/blender/{common,render_screen}.py`, `tools/atlas/pack.ts`, `tools/lint/{validate-content,hint-contrast}.ts` -- planned in spec-1-4/1-8/1-9.
- Sources: `art/src/map-v2.blend` (`Car` = `A_KidKart` + `kart-oobi` + `character` + wheels; `Race` = `ArchPost±1`, `ArchBall±1`, `Chk0_*`/`Chk1_*`, flags), `assets/kenney/kenney_car-kit/Models/GLB format/{cone,kart-oobi}.glb`.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/core/tokens.ts`, `app/src/core/timing.ts` -- add the new `ui` and `Timing` values.
- [x] `app/src/content/voice-lines.ts`, `app/src/content/audio-catalog.ts`, `app/tools/audio/make-placeholders.ts` (+ test) -- add the 4 lines and 3 SFX. Generate them with `npm run content:export && npm run tts` and `npm run audio:placeholders`.
- [x] `app/src/content/games/race.ts` (+ `race.test.ts`: level 0 is straight, roads 3–5, ≥ 2 distinct `pathIds`), `content/games/index.ts`, `content/stations.ts`, `content/assets.ts`, `content/layouts.ts` -- the ladder, screen, assets, registration, `awake: true`, `ATLASES.race`, `BACKGROUNDS.race` and `LAYOUTS.race`.
- [x] `app/src/content/play-again.ts` (+ test), `app/tools/render/blender/build_map.py` -- optional `creature` and the `race` entry.
- [x] `app/tools/render/blender/build_race.py`, `app/tools/render/build.ts`, `render.ts` (+ tests) -- the builder and screen `race` registration (colour args from Tokens). Fix rule failures in the builder constants.
- [x] `app/tools/layout/hud-keep-out.ts` (+ test: the rects for 4:3 and 1.46), `tools/layout/rules.ts` (+ test per rule), `tools/atlas/pack.ts`, `tools/lint/validate-content.ts` (+ test), `tools/lint/hint-contrast.ts` (+ test) -- `validateRace`, the keep-out, and the race contrast samples.
- [x] `src/content/generated/race.layout.json`, `public/assets/atlases/race.{png,json}`, `public/assets/bg/race.png` -- produce them with the real Blender.
- [x] `app/src/core/road.ts` (+ test) -- generalise it to any polyline if needed.
- [x] `app/src/core/input/trace-model.ts` (+ test) -- every input/band/wait/arrive matrix row on a horizontal road and on an S-shaped fixture (window, no jump).
- [x] `app/src/core/input/trace-path.ts` (+ test with a fake router/guard) -- grab circle, `setDragging`, release/self-heal, events, `onLiftChange`.
- [x] `app/src/core/hint-director.ts`, `hint-visuals.ts` (+ tests) -- `HintItem`, the `path` getter resolved per demo. Ice-cream tests still pass.
- [x] `app/src/games/race/questions.ts`, `round.ts` (+ tests) -- the road list, the command order, `hintActivity`, `progress()`, resume index and bad index; every round row of the matrix.
- [x] `app/src/games/race/Race.ts` -- the scene wiring per the Boundaries.
- [x] `app/README.md` -- the provenance rows (map-v2 kart and arch, car-kit cone) and the new audio.

**Acceptance Criteria:**
- Given the real Blender, when running `art:build`, `render` and `atlas` for `race`, then `atlas.race` (1 page ≤ 2048², every file ≤ 8 MiB), `bg.race` (2048×1536) and `race.layout.json` exist. `preview.png` shows three roads on grass clear of the corners, the kart driver with a pink cap and big eyes, and the checkered arch.
- Given `npm run dev` at 1180×820 touch emulation, when the child taps the checkered gate on the island, then it bounces and "Đường đua" plays, the kart drives there, and the race screen shows a grey road with a light edge and a yellow centre dash, the kart at the left end and the arch at the right end, while "Bé lái xe… tới cổng nhé!" plays.
- Given that screen, when the child puts a finger on the kart and traces along the road (even wobbling about 60 px off it), then the kart follows on the road with no visible delay and the driven part turns lighter. Dragging backwards never moves it back.
- Given the kart mid-road, when the child lifts the finger, then the kart stays and blinks gently. A touch far from it does nothing, and a touch next to it continues from the same spot.
- Given the child does nothing after the prompt, then after about 6 s a ring circles the kart and the dash ahead lights up progressively. About 6 s later a hand traces a stretch ahead of the kart and "Đưa ngón theo đường… tới cổng nhé!" plays. No "wrong" feedback ever appears.
- Given the third road, when the kart reaches the arch, then the driver waves, a happy beep and a short tune play and the kart bounces, then the island returns. Exactly one `round:complete` with `questions: 3` was emitted (with Epic 2, the play-again overlay asks "Chơi nữa với bạn lái xe nhé?" with the kart icon).
- Given a road in progress, when the child taps Home, then "Về đảo nào!" plays, the island returns, and exactly one `round:abandon` with `partial.traceIndex` was emitted.
- Given a `path.straight-1` point moved into the Home keep-out (or a temporary `this.sound.play` in `games/race/Race.ts`), when running `npm run check` (or `npm run lint`), then it fails naming `straight-1` (or the rule).

## Spec Change Log

- **2026-10-09 (before implementation): Epic 2 APIs that every new game must follow.** Epic 2 was built after this spec was written; read the current code, not only older specs.
  - **Game base and resume (Story 2.5).** `MiniGameBase<G>` builds `snapshot()` itself through `makeSnapshot`, so a game must not define `snapshot()`. Instead it:
    - implements `protected abstract progress()`;
    - reads `this.resumeAt` (already validated by `readResume`);
    - calls `this.acceptResume()` only when it takes the resume.
    
    Put the resume decision in a pure `startCommands(round, resumeAt)` in the game's `round.ts`, as Tiệm kem does. Declare the game's partial in `SnapshotPartials` in `content/types.ts`.
  - **Difficulty and return path.** The level is written by the post-round chain (`core/post-round-chain.ts`), not by the game or by Map directly. Start data comes from `takeStartData` in `core/session-store.ts`.
  - **Rewards.** `round:complete` grants a decoration through `core/reward-service.ts`, which must stay the only caller of `grantDecoration`. A game never grants directly.
  - **Decoration slots.** Story 2.2 left each station 1–2 decoration slots (10 in total).
  - **Map routing.** Map decides through pure helpers: `routeRoundComplete` / `routeRoundAbandon` / `keepAbandonSnapshot` in `post-round-chain.ts`, and `routePlayAgainClose` in `play-again.ts`. Keep new Map logic in pure core helpers with tests, because scenes have no test harness.
## Review Triage Log

- 2026-10-12: the three subagent review layers were NOT run (subagents not authorised this session); inline self-review by the implementer. Notes: (1) `hud-keep-out.ts` already existed (Story 3.1) and is reused; `ui.hudKeepOutPx` was not added (`HUD_KEEP_OUT_PX` = 120 there). (2) The kart model's front is its local +y (`FRONT_Y`), so `KART_YAW` is −120°. (3) Two extra ui tokens: `raceFacingMinDx` and `raceShadowHeightPx` (lint forbids magic numbers in games). (4) `GAME_CONTENT` lists race after pizza (station order). (5) In-browser AC walkthroughs not run.

## Design Notes

**Why a windowed forward projection:** the nearest point on the whole road would let a finger near a later part (a loop in 4.2, a zigzag corner) teleport the kart. Projecting only onto [s, s + 240] and never decreasing `s` keeps the kart on the road and forward-only, and 4.2 inherits it unchanged. A catch-up speed per tick makes "half speed" a testable number:

```ts
const m = new TraceModel(line([0,300],[600,300]), opts);
m.press({x:5,y:300}); m.move({x:100,y:360}); m.tick(50); // s 50 (≤ 80 px band)
m.move({x:150,y:410}); m.tick(50);                       // s 75 (110 px band → half)
m.move({x:150,y:460}); expect(m.tick(50)).toContainEqual({kind:'wait'}); // 160 px
```

**Shared helpers with Epic 3 (built first):**
- **HUD keep-out:** Stories 3.3 and 3.5 also need "outside the ~120×120 Home/Speaker zones". If Epic 3 already added an equivalent helper in `tools/layout`, reuse it and skip `hud-keep-out.ts`.
- **`HintItem`:** Epic 3's tap games may already have widened `HintStep.correct` beyond `Draggable`. Reuse that type, and add only the `path` getter.

Fishing (4.3) and touch-talk (4.5) reuse `hudKeepOutRects` too.

**Why `stepDone(sameStep)` as activity:** spec-1-9 deliberately has no "activity" call. A trace step has no natural sub-steps, so re-issuing the same step is the existing protocol's way to say "the child is progressing": it keeps the level and restarts idle, with no new API.

## Verification

**Commands:**
- `cd app && npm run content:export && npm run tts && npm run audio:placeholders` -- expected: 4 new voice `.m4a` + `.hash` and 3 `sfx.race.*` files are written; a second `tts` run skips them.
- `cd app && npm run art:build -- race && npm run render -- race && npm run atlas -- race` -- expected: exit 0, and a second `render` gives a byte-identical layout.
- `cd app && npm run art:build -- map && npm run render -- map && npm run atlas -- map` -- expected: exit 0; `icon/race/00` is present, and the map layout is unchanged.
- `cd app && npm run check` -- expected: exit 0. TraceModel, TracePath, round, questions, keep-out, rules, play-again and contrast tests pass, and validate:content reports the race layout, frames and voice lines.
- `cd app && npm run build` -- expected: exit 0, with `dist/assets/atlases/race.png` present.

**Manual checks:**
- Run the AC walkthroughs at 1180×820 and 1024×768, in landscape and in rotated portrait. Check that the kart faces its travel direction, never leaves the road, and that the blink and glow stay at or below 1 Hz.
- With `prefers-reduced-motion`: the grab pulse and the bounce are smaller, and the guide glow is a static fade.
- With multi-touch: hold the trace with one finger and tap Home with another, and nothing happens. Lift, tap Home, and the game returns to the island.
