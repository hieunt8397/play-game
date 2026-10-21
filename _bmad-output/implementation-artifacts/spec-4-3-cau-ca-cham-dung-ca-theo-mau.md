---
title: 'Story 4.3 — Câu cá: chạm câu đúng con cá theo màu và hoa văn'
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
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-duong-dua-vach-duong-thang.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-danh-thuc-tiem-pizza-be-dem-topping.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-8-tiem-kem-keo-kem-dung-vi-cho-shiba.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-9-goi-y-leo-thang.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-tiem-kem-luot-3-5-cau-do-kho-tang-dan.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-6-nut-nha-va-loa-chong-cham-nham.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-pipeline-hinh-render-blender-atlas-layout.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-giu-luot-do-trong-phien.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The fish-pond station (`fishing`) is still asleep. There is no pond art, no fish sprites, layout, voice or game scene, and `core/input` cannot hit-test moving targets with latency compensation. So FR13/FR14 cannot be played: the child cannot tap the fish whose colour and pattern was called, watch it reeled up and hear its name.

**Approach:**
- **Art:** a Blender builder makes `art/fishing.blend`: sea water, a Quaternius dock and rod, and three recoloured Quaternius cutefish, each with its own pattern and brightness, in two sizes. The spec-1-4 tools then produce `atlas.fishing`, `bg.fishing` and `fishing.layout.json`. A new `validateFishing` rule and a fish-luma check guard the pond bounds, the sizes and the brightness gaps.
- **Input:** `TapTarget` gains an `area` shape, and a pure `core/input/moving-pick.ts` does the hit test against current and 150 ms-old positions, where the nearest centre wins.
- **Game:** `games/fishing` follows the ice-cream/race structure:
  - pure `questions.ts`, `lines.ts`, `swim.ts` (motion) and `round.ts`;
  - a wiring-only `Fishing.ts` scene.

  Hints go through HintDirector (`tap` step). The tally and `round:complete` go through `MiniGameBase`, and the resume envelope through `progress()`.
- **Shell:** the station wakes (`GAME_CONTENT` + `awake`), with an invite line, a play-again line and a `PLAY_AGAIN_ICONS` entry. The ladder has one level (3 fish, colour questions). Story 4.4 extends it.

## Boundaries & Constraints

**Always:**
- **Art builder** (`tools/render/blender/build_fishing.py`, run with `npm run art:build -- fishing`; it follows every spec-1-4/1-8 invocation, temp-dir, naming and colour-argument rule):
  - **Base scene:** open `art/src/map-v2.blend` and delete the same objects and collections as `build_race.py` (spec-4-1), plus `Car` and `Race`. Keep `World` (sea, sand), `Nature` and `Sky`.
  - **Camera:** add `CamFish`, a high 3/4 view over open sea next to the beach, from named constants (`CAM_FISH_LOC`, `CAM_FISH_ROT`, `CAM_FISH_LENS`). Water fills most of the frame, with a sand strip at the bottom. It renders at 2048×1536.
  - **Plate:** Quaternius `cutefish/Dock_Long.fbx` enters from the bottom-left, and `cutefish/FishingRod_Lvl1.fbx` stands on the dock tip with its tip over the water. Both are in the background plate (FBX alpha forced to 1/OPAQUE).
  - **Fish** (Quaternius cutefish, alpha forced to 1/OPAQUE, posed side-on to the camera, facing screen-right, at a common `FISH_POSE` on the water at the pond centre; each collection is rendered alone):

    | colour | model | body | pattern |
    |---|---|---|---|
    | `yellow` | `Clownfish.fbx` | `art.fishing.yellow` | its stripes recoloured `art.fishing.stripe` (white) |
    | `orange` | `Koi.fbx` | `art.fishing.orange` | 5 script icospheres (subdivisions 1) in `art.fishing.dot` on the camera-side flank |
    | `blue` | `Betta.fbx` | `art.fishing.blue` | its long fins, which are kept |

    - **Recolour:** every material becomes the body colour except the eyes (the darkest material) and the pattern parts. A material whose base colour is red-dominant (r > 0.5 and g < 0.35) becomes the body colour, so no red mark stays around the mouth.
    - **Sizes:** `FISH_SCALE[color]` is chosen so the trimmed longest side ÷ renderScale of the small `swim/00` lies in [`fish.minSize`, `fish.minSize + ui.fishSizeSlackPx`]. The big collection is a copy at `ui.fishSizeRatio` (1.6) × that scale.
    - **Collections:** `sprite.fish-<color>-<size>` with `movable: true` and `states = {"swim":[1,2,3,4],"dive":[10],"caught":[20,21]}`.
      - `swim`: if the FBX has an action whose name contains `Swim`, it is sampled; otherwise the object yaws ±8° alternately.
      - `dive`: nose pitched down 30°.
      - `caught`: rolled and yawed ±20° alternately (a wriggle).
  - **Layout objects** (spec-1-4 grammar; the layout JSON v1 format is unchanged):
    - `hit.pond-swim`: a flat convex mesh on the water from a `POND` table of world XY points. The stored polygon is the spec-1-4 padded hull, and the builder constants account for that padding.
    - `anchor.dock`: on the dock top.
    - `anchor.rod-tip`: the rod's tip.
    - `anchor.catch`: where a caught fish hangs, below the rod tip and above the water.
- **Screen rules** (`tools/layout/rules.ts › validateFishing(layout, atlasJson)`, run by `render`, `atlas` and `validate:content`; every message names the id):
  - **Required:** `hits['pond-swim']` (≥ 3 points), `anchors.dock`, `anchors['rod-tip']`, `anchors.catch`, and every frame in `FISHING_SCREEN.frames`. That is every `FISH_COLORS × FISH_SIZES` combination with `swim/00..03`, `dive/00` and `caught/00..01`.
  - **Bounds:** the pond polygon grown by `fish.hitPad` (30) has every point inside the spec-1-4 interactive rect. Its distance to every `hudKeepOutRects()` rect (spec-3-1's helper, reused) is at least `fish.hitPad`.
  - **Sizes:**
    - The small `swim/00` longest trimmed side ÷ renderScale is within [`fish.minSize`, `minSize + fishSizeSlackPx`].
    - The big/small ratio of longest sides is within `fishSizeRatio ± ui.fishSizeRatioTol` (0.1).
  - **Background:** `bg.fishing` is 2048×1536 (the generic bg rule).
- **Fish brightness** (`tools/lint/fish-luma.ts`, run by `atlas` and `validate:content`): for each colour, take the mean relative luminance of the opaque pixels of `fish-<c>-small/swim/00` in `atlas.fishing` (read with sharp). Every pair must differ by at least `ui.fishLumaGapMin`. The pure `fishLumaProblems(means)` is unit-tested. Each colour also has a distinct `FISH_PATTERN`, which a content test checks.
- **Tap area** (`core/input/tap-target.ts`, additive): `createTapTarget(router, { area: { contains(p) }, onPress(p) })` is an alternative to `circle`. `onPress` receives the design point, which is passed to every target (existing callers ignore it). Guard behaviour is unchanged.
- **Moving pick** (`core/input/moving-pick.ts`, pure):
  - `PositionHistory`: `push(tMs, p)` keeps samples for `Timing.fishHistoryKeepMs` (300). `at(tMs)` interpolates between samples. It returns the oldest sample when asked for something earlier, and the newest when empty.
  - `pickMoving(p, candidates, pad) → id | null`. Each candidate is `{ id, now, past, halfW, halfH }`.
    - A candidate is hit when `p` lies in the rect `now ± (half + pad)` or `past ± (half + pad)`.
    - Among hits, the lowest `min(|p − now|, |p − past|)` wins. A tie goes to the earlier candidate.
- **Content** (`content/games/fishing.ts`, data only):
  - `FISH_COLORS = ['yellow','orange','blue'] as const`, `FISH_SIZES = ['small','big'] as const`, `FISH_PATTERN = { yellow:'stripes', orange:'dots', blue:'long-fins' }`.
  - `FishingLevel = { id; ask: 'color'|'size'|'mixed'; fish: 3|4|5; questions: 3|4|5 }`, with `ladder = [{ id:'color-3', ask:'color', fish:3, questions:3 }]`.
  - `FISH_CAPACITY = 5`: the pond must fit 5 big fish (see capacity test).
  - `FISHING_SCREEN` holds the ids and frames above.
  - `assets = { atlases:[ATLASES.fishing], images:[BACKGROUNDS.fishing], audio:[every vo.fishing.*, sfx.fishing.*] }`.
  - The game is registered in `GAME_CONTENT`, the `fishing` station gets `awake: true`, and `GAMES.fishing.scene = Fishing` with scene key `'fishing'`.
- **Questions** (`games/fishing/questions.ts`, pure):
  - `roundQuestions(seed, level) → FishQuestion[]`, where `FishQuestion = { ask:'color', color, fish: { color, size }[] }`. It uses `mulberry32(seed >>> 0)` and clamps `level`.
  - Level 0: 3 fish of the 3 distinct colours in seeded order, with seeded sizes. Exactly one fish matches the asked colour.
  - The asked colour of question `i > 0` differs from question `i − 1`.
  - `questionSeed(seed, i) = (seed ^ Math.imul(i + 1, 0x9E3779B1)) >>> 0` seeds the swim placement, so a resumed question gets the same start.
- **Line ids** (`games/fishing/lines.ts`, pure):
  - `promptLineId(q)` = `vo.fishing.prompt.color-<c>`;
  - `retryLineId(q)` = `vo.fishing.retry.color-<c>`;
  - `nameLineId(f)` = `vo.fishing.name.<c>-<s>`.

  A test enumerates every reachable id of every ladder level and checks it against `VOICE_LINES`.
- **Swim model** (`games/fishing/swim.ts`, pure, no Phaser):
  - It is built from the `(pond polygon, fish specs with halfW/halfH, rng)`.
  - **Body rect** = centre ± (halfW, halfH). A position is valid when all 4 corners are inside the pond polygon (convex, so straight moves between valid points stay valid). It is also valid only when the rect keeps ≥ `spacing.targetGap` (24) from every other fish's rect, diving fish included.
  - **`place()`:** seeded rejection sampling, capped at `ui.fishPlaceAttempts` per fish, then a deterministic scan of a grid over the polygon bbox. It throws only if the grid also fails, which the capacity test prevents.
  - **`tick(dt)`** (dt clamped to 250 ms): each swimming fish moves toward its waypoint at its cruise speed. The cruise speed is seeded in [`ui.fishMinSpeedScale`, 1] × `fish.speedMax`, × `ui.fishReducedSpeedScale` under reduced motion. The step is ≤ speed × dt.
    - If the step would break validity, the fish stays and draws a new waypoint (valid, ≥ `ui.fishWaypointMinPx` away, bounded attempts).
    - Reaching a waypoint draws the next one.
    - Diving fish do not move.
    - Facing = sign of vx, kept when |vx| < 1 px/s.
  - **`setCalm(ids | null)`:** while set, the listed fish move at `ui.fishHintSpeedScale` × their speed, and every other fish stops.
  - **`dive(id)` / `resurface(id)`** switch the state `swim` ↔ `diving`.
  - **`candidates(now, past)`** gives the `pickMoving` input of the non-diving fish.
- **Round model** (`games/fishing/round.ts`, pure; the commands follow spec-1-8's `apply` pattern):
  - **`start(resumeAt)`** begins question `resumeAt?.questionIndex ?? 0`. An out-of-range index warns once and begins question 0.
    - It emits `beginQuestion{index, q}`. The scene spawns the fish (`swim.place()` from `questionSeed`) and fades them in over `sceneFadeMs`.
    - It calls `hint.beginQuestion({ promptLineId, retryLineId, step })` with `step = { action:'tap', correct:[asked-colour fish items], distractors:[the others], target:null }`.
  - **`tap(hitId | null, p)`:**
    - **Locked** (from a correct tap to the next question): `[]`.
    - **`null`:** `ripple` (the scene draws it at `p` and plays `sfx.fishing.plop`). There is no `wrong()` and no tally change.
    - **Wrong fish:** `dive{id}` (sink + fade + bubbles, and `sfx.fishing.bubble` in the press handler), then `wrong`, then `resurface{id, afterMs: Timing.fishResurfaceMs}` on the scene clock.
    - **Correct fish:** `questionDone` → `lock` → `catch{id}`, and the model advances `questionIndex` at once (the spec-1-9/1-10 order).
  - **`reeled(id)`** → `say{tag:'name', id: nameLineId}` + `jump{id}` + `sfx.fishing.happy`.
  - **`speechEnded('name')`** (`completed` true or false):
    - not the last question: `nextQuestion{afterMs: Timing.fishShortCelebrateMs}`. The scene fades every fish out over `sceneFadeMs`, then begins the next question.
    - the last question: `finishRound{afterMs: Timing.roundCelebrationMs}`.
  - **`progress()`** = `{ questionIndex, partial: {} }`.
  - Any other speech token is ignored.
- **Scene** (`games/fishing/Fishing.ts extends MiniGameBase`; wiring only):
  - **Depth:** `bg.fishing` < fish < fishing line < ripples and bubbles.
  - **Fish view:** a Container (the `HintItem.object`) at the fish centre, holding the sprite at scale `1/renderScale` with the `trimmedCentre` pivot (spec-1-8), re-applied on every frame swap.
    - Facing is the inner sprite's scaleX sign, so HintDirector's bob on the container never fights it.
    - `swim` frames advance every `Timing.fishSwimFrameMs`.
    - `halfW`/`halfH` come from the `swim/00` trimmed size ÷ renderScale.
  - **Input:** one `createTapTarget(router, { area: { contains: () => true } })` on the scene layer. Hud wins Home/Speaker and the guard drops dead-zone and second-finger presses.
    - In `onPress(p)`: `now = time.now`, then `pickMoving(p, swim.candidates(now, now − Timing.fishHitLookbackMs), fish.hitPad)`, skipping any item with `!inputGuard.isPickable(item)`. The result goes to `round.tap`.
    - All feedback starts in that handler.
  - **`update(_, delta)`:** while not locked or ended, `swim.tick(delta)`, then push each fish's position into its `PositionHistory` and move the containers.
  - **Hint level** (own `hint:level` subscription): at ≥ 2, `swim.setCalm(correctIds)`; at 0, `setCalm(null)`. Ring, bob, hand and the level-4 dim/unpick come from HintDirector unchanged.
  - **Dive:**
    - The container sinks `ui.fishDiveDropPx` and its alpha goes to `ui.fishDiveAlpha` over `Timing.fishDiveMs`, with the `dive/00` frame and 3 bubbles (`colors.hintCore`, r `ui.fishBubblePx`) rising and fading.
    - Under reduced motion the bubbles are skipped (the fade alone shows the dive), and the sink distance goes through `amplitude(…, reduced)`.
    - On resurface, it rises back and its alpha goes to `isPickable(item) ? 1 : ui.hintDimAlpha`, so it never undoes a level-4 dim.
  - **Ripple:** a `colors.seaShallow` ring expands to `ui.fishRippleRadiusPx` and fades over `Timing.fishRippleMs`.
  - **Catch:**
    - In the handler: `sfx.fishing.reel`, and a line (`art.fishing.line`, `ui.fishLineWidth`) is drawn from `anchors['rod-tip']` to the fish.
    - The fish tweens to `anchors.catch` over `Timing.fishReelMs`, showing `caught` frames every `Timing.fishWriggleFrameMs`. The other fish hold still (`setCalm([])`).
    - Then `round.reeled(id)`.
  - **Jump:** the fish rises `ui.fishJumpPx` and falls back once over `Timing.fishJumpMs`, then bounces through `character.celebrate` (amplitudes through `amplitude(…, reduced)`).
- **HintStep:** `HintItem` (spec-3-1) is used as is. A fish item is `{ object: container }` with no `onLiftChange`.

**Never:**
- No size questions, no mixed levels, no 4 or 5 fish, and no `partial` restore beyond the question index. Those are Story 4.4.
- No red, ✗, shake, error sound, praise or "sai". No text on screen. Water taps never call `wrong()`.
- No auto-catching: the hand only demonstrates.
- No `setTimeout`, `this.sound`, `this.load` or `scene.*` navigation in `games/fishing`. No raw pointer events outside `core/input`. No hand-entered design coordinates, magic numbers or hex in games.
- No change to the spec-1-4 JSON format or to the HintDirector machine. No difficulty logic in the game. No Epic 2 import.
- No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **Kebab voice ids:** the epic's `vo.fishing.prompt.size.*` style breaks the real `VOICE_ID` grammar (only a numeric 4th segment is allowed), so prompts are `vo.fishing.prompt.color-<c>` (4.4: `prompt.size-big|size-small`).
- **Colours:** `creatureBlue` (L ≈ 0.51) is too close to `creatureOrange` (L ≈ 0.45), so the fish get their own `Tokens.art.fishing` like `art.pizza`:
  - `yellow #FFD23F` (L ≈ 0.68);
  - `orange #FF9A3C` (= `creatureOrange`);
  - `blue #2F6FDB` (L ≈ 0.17);
  - `stripe #FFFFFF`, `dot #FFFFFF`, `line #F5F5F5`.

  A token test requires a body luminance gap of at least 0.2.
- **"xanh vây dài"**, not the AC example's "vây to": "to" is the size word in Story 4.4's "cá to".
- **The swim region** is the area the whole fish body stays in, as the AC's "nằm trọn trong vùng bơi" says. The validator therefore grows it by the 30 px hit pad (the outermost tap area) for the bounds checks. This is the same guarantee as "the region minus half a big fish plus 30".
- **The hit area** is the trimmed rect, made symmetric about the body centre (max half-extents), + 30. This is slightly generous whatever the facing.
- **Diving is model state, not `setPickable`.** A diving fish is skipped by the pick, so a tap there counts as water. Using `setPickable` would let a resurfacing fish undo HintDirector's level-4 dim.
- **A tap anywhere that misses a fish is water** (ripple + "tõm"). The camera frames the pond, so this gives every touch feedback.
- **`questionDone` on the correct tap**, before the reel and celebration, as in 1.10/3.1/4.1. The ring disappears at the answer, and Home during the celebration snapshots the next question.
- **First-try** stays the spec-1-10 rule: the question's level stayed 0. A wrong fish always raises the level and a water tap never does, which matches the AC. Idle help also counts as help.
- **Sizes in colour questions:** each fish draws its size from the seed, so the name always includes the size ("Cá vàng nhỏ!"). All 6 name lines exist from this story.
- **Pond capacity is sized now:** a test places `FISH_CAPACITY` (5) big fish, so Story 4.4 needs no art change.
- **Voice lines** (unapproved, `keywordPauseMs: 300` wherever `|` appears):

  | id | text | words |
  |---|---|---|
  | `vo.fishing.prompt.color-yellow` / `-orange` / `-blue` | "Câu con cá \| vàng sọc nào!" / "… \| cam chấm nào!" / "… \| xanh vây dài nào!" | 6 / 6 / 7 |
  | `vo.fishing.retry.color-yellow` / `-orange` / `-blue` | "Con cá \| vàng sọc nhé!" / "Con cá \| cam chấm nhé!" / "Con cá \| xanh vây dài nhé!" | 5 / 5 / 6 |
  | `vo.fishing.name.<c>-<s>` (6) | "Cá vàng nhỏ!", "Cá vàng to!", "Cá cam nhỏ!", "Cá cam to!", "Cá xanh nhỏ!", "Cá xanh to!" (no pause) | 3 |
  | `vo.shell.invite.fishing` | "Bé ơi, mình đi \| câu cá nhé!" | 7 |
  | `vo.shell.play-again-ask.fishing` | "Chơi nữa với bạn cá nhé?" (no pause) | 6 |

- **SFX placeholders** (50 ms fade-in, −20 dBFS peak, partials ≥ 300 Hz, game-scoped):
  - `sfx.fishing.plop`: a soft water "tõm", ~200 ms;
  - `sfx.fishing.bubble`: three rising blips, ~400 ms;
  - `sfx.fishing.reel`: a soft ratchet, ~600 ms;
  - `sfx.fishing.happy`: a major arpeggio, ~1.5 s.
- **Play-again icon:** `PLAY_AGAIN_ICONS.fishing = { model: 'quaternius/cutefish/Koi.fbx', creature: 'creatureOrange' }`. Re-render the map for `icon/fishing/00`.
- **Hint contrast:** spec-1-9's `hint-contrast.ts` samples `bg.fishing` at the `pond-swim` centroid and at the midpoints from the centroid to each vertex. The ring diameter is the big fish's longest side + 2·`hintRingPad`.
- **New values:**
  - `ui`: `fishSizeRatio 1.6`, `fishSizeRatioTol 0.1`, `fishSizeSlackPx 20`, `fishLumaGapMin 0.12`, `fishMinSpeedScale 0.5`, `fishReducedSpeedScale 0.6`, `fishHintSpeedScale 0.5`, `fishWaypointMinPx 120`, `fishPlaceAttempts 200`, `fishDiveDropPx 24`, `fishDiveAlpha 0.15`, `fishBubblePx 8`, `fishRippleRadiusPx 40`, `fishLineWidth 3`, `fishJumpPx 80`.
  - `Timing`: `fishHistoryKeepMs 300`, `fishSwimFrameMs 200`, `fishDiveMs 400`, `fishRippleMs 500`, `fishReelMs 700`, `fishWriggleFrameMs 120`, `fishJumpMs 600`, `fishShortCelebrateMs 600`. The existing `fishResurfaceMs` and `fishHitLookbackMs` are used as they are.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enter | `{level:0, seed:7}` | 3 fish (yellow, orange, blue; seeded sizes) fade in; `beginQuestion(prompt.color-<c>, retry.color-<c>, tap step)` with 1 correct, 2 distractors | — |
| Swim | 600 ticks of 16 ms | every step ≤ 60 px/s × dt; every body rect inside the pond; rect gaps ≥ 24 | — |
| Lookback hit | fish at 60 px/s; tap at its centre 150 ms ago, 9 px outside its current hit rect | that fish is hit | — |
| Overlap | the tap lies in two fish rects | the fish with the nearer centre (current or past) wins | — |
| Water | tap hits no fish | ripple + "tõm" in the handler; no `wrong()`; tally unchanged | — |
| Wrong fish | tap a distractor | dives (sink, fade, bubbles) in the handler; `hint.wrong()`; resurfaces after 3000 ms | — |
| Tap diving | tap a fish while it dives | treated as water | — |
| Level 2 | idle 6 s after the prompt | ring + bob on the correct fish; it swims at half speed; the others stop | — |
| Level 3 | 6 s more | the hand taps the correct fish; retry voice | — |
| Level 4 | 4 wrong taps | the distractors dim to 0.6 and are unpickable; tapping one = water; a resurfacing fish stays dimmed | — |
| Correct | tap the correct fish | `questionDone` → lock → reel sfx + line; fish to `anchor.catch` wriggling; name line; jump + happy tune | — |
| Locked tap | any tap during the catch | nothing | — |
| Next | name `speech:ended` (not last) | after 600 ms the fish fade out; question i+1 begins | — |
| Second finger | another touch while the first is down | ignored | — |
| Dead zone | press at local (10, 400) | nothing | — |
| Last question | 3rd correct catch, name ends | after 1500 ms exactly one `round:complete {gameId:'fishing', questions:3, firstTryCorrect, maxHintLevel}`; inert | — |
| Tally | q1 clean; q2 one wrong fish; q3 water taps only | `firstTryCorrect 2, maxHintLevel 1` | — |
| Home mid-question | `hud:home` at index 1 | one `round:abandon`; `progress()` = `{questionIndex:1, partial:{}}` | — |
| Resume | `resume.questionIndex 1` | question 1 with the same colour and start positions; prompt re-read; level 0 | — |
| Bad index | `resume.questionIndex 7` | question 0 | console.warn once |
| Determinism | same `(seed, level)` | identical questions and start positions | — |
| Pond in HUD zone | the pond grown by 30 touches Home's keep-out | render, atlas and check fail naming `pond-swim` | exit 1 |
| Luma too close | two colour means differ < 0.12 | check fails naming both colours | exit 1 |
| Capacity | 5 big fish, seeds 1–50 | `place()` succeeds for every seed | — |

</intent-contract>

## Code Map

- `app/src/core/input/{guard,tap-router,tap-target,polygon}.ts` -- planned in spec-1-5/1-6 (`createTapTarget` circle, layers, dead zones, `pointInPolygon`) and spec-1-8 (`setPickable`/`isPickable`). `tap-target.ts` gains `area` and `onPress(p)`. New: `moving-pick.ts`.
- `app/src/core/hint-director.ts`, `hint-machine.ts`, `hint-visuals.ts` -- planned in spec-1-8/1-9. `HintItem` (planned in spec-3-1), `tap` hand, level-4 dim via `setPickable` and alpha.
- `app/src/games/mini-game-base.ts` -- planned in spec-1-7/1-8/1-9/1-10/2-5 (`hint` wrapper + tally, `finishRound`, `progress()`, `resumeAt`, `hint:level`).
- `app/src/games/race/{questions,round,Race}.ts` (planned in spec-4-1) and `games/ice-cream/*` (spec-1-8/1-10) -- the structure to copy.
- `app/src/core/rng.ts › mulberry32`, `core/ui/sprite-pivot.ts › trimmedCentre`, `core/reduced-motion.ts › amplitude` -- planned in spec-1-5/1-8.
- `app/src/content/games/{types,index}.ts`, `content/stations.ts`, `content/assets.ts`, `content/layouts.ts`, `content/play-again.ts` -- planned in spec-1-4/1-5/1-7/1-8/2-4.
- `app/src/content/voice-lines.ts`, `content/validate.ts` (`VOICE_ID`, `voiceWords`, `BANNED_PAIRS`; `REVIEW_WORDS`/`BANNED_PHRASES` planned in spec-3-1), `content/audio-catalog.ts`, `tools/audio/make-placeholders.ts` -- real.
- `app/src/core/tokens.generated.ts` -- real `components.fish {hitPad 30, minSize 100, speedMax 60}`, `colors.{seaShallow,hintCore,creatureOrange}`, `character.celebrate`. `core/tokens.ts` (`ui`, `art`), `core/timing.ts` (`fishResurfaceMs`, `fishHitLookbackMs`, `sceneFadeMs`, `roundCelebrationMs`) -- real.
- `app/tools/layout/{rules,geometry,hud-keep-out}.ts`, `tools/render/{build,render}.ts`, `tools/render/blender/{common,render_screen,build_race}.py`, `tools/atlas/pack.ts`, `tools/lint/{validate-content,hint-contrast}.ts` -- planned in spec-1-4/1-8/1-9/3-1/4-1.
- Sources: `assets/quaternius/cutefish/{Clownfish,Koi,Betta,Dock_Long,FishingRod_Lvl1}.fbx`, `art/src/map-v2.blend`.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/core/tokens.ts`, `app/src/core/timing.ts` (+ tests) -- `art.fishing`, the new `ui` and `Timing` values, and the body luminance-gap test.
- [x] `app/src/content/voice-lines.ts`, `app/src/content/audio-catalog.ts`, `app/tools/audio/make-placeholders.ts` (+ test) -- the 14 lines and 4 SFX. Generate them with `npm run content:export && npm run tts` and `npm run audio:placeholders`.
- [x] `app/src/content/games/fishing.ts` (+ `fishing.test.ts`: the ladder shape, distinct patterns, `fish ≤ FISH_CAPACITY`), `content/games/index.ts`, `content/stations.ts`, `content/assets.ts`, `content/layouts.ts`, `content/play-again.ts` -- the content, registration, `awake: true`, `ATLASES.fishing`, `BACKGROUNDS.fishing`, `LAYOUTS.fishing` and the icon entry.
- [x] `app/tools/render/blender/build_fishing.py`, `app/tools/render/build.ts`, `render.ts` (+ tests) -- the builder and the `fishing` screen registration with colour args from Tokens. Fix rule failures in the builder constants.
- [x] `app/tools/layout/rules.ts` (+ a failing case per rule), `tools/atlas/pack.ts`, `tools/lint/fish-luma.ts` (+ test), `tools/lint/validate-content.ts` (+ test), `tools/lint/hint-contrast.ts` (+ test) -- `validateFishing`, the luma check and the fishing contrast sites.
- [x] `src/content/generated/fishing.layout.json`, `public/assets/atlases/fishing.{png,json}`, `public/assets/bg/fishing.png`, re-rendered `atlas.map` -- produce them with the real Blender.
- [x] `app/src/core/input/tap-target.ts` (+ test), `app/src/core/input/moving-pick.ts` (+ test) -- `area`, `onPress(p)`, `PositionHistory` and `pickMoving`: the lookback, overlap, tie and empty-history rows.
- [x] `app/src/games/fishing/questions.ts`, `lines.ts`, `swim.ts`, `round.ts` (+ tests) -- every non-visual matrix row, including the swim log, the capacity test against the generated layout and the line coverage.
- [x] `app/src/games/fishing/Fishing.ts`, `app/src/games/registry.ts` -- the scene wiring per the Boundaries.
- [x] `app/README.md` -- provenance rows (cutefish Clownfish, Koi, Betta, Dock_Long, FishingRod_Lvl1) and the new audio.

**Acceptance Criteria:**
- Given the real Blender, when running `art:build`, `render` and `atlas` for `fishing`, then `atlas.fishing` (1 page ≤ 2048², every file ≤ 8 MiB), `bg.fishing` (2048×1536) and `fishing.layout.json` exist. `preview.png` shows the pond polygon on open water clear of the corners, the dock and the rod. The atlas shows a white-striped yellow fish, a white-dotted orange fish and a dark-blue long-finned fish, each in two sizes and with no red mouth.
- Given `npm run dev` at 1180×820 touch emulation, when the child taps the fish pond on the island, then it bounces and "Hồ cá" plays, the kart drives there, and the pond screen shows three fish swimming slowly while "Câu con cá… vàng sọc nào!" (or another colour) plays. The Speaker replays it.
- Given that screen, when the child taps a wrong fish, then within 100 ms it sinks and fades with bubbles, and a short retry line plays (at most once per 10 s). About 3 s later it resurfaces. A tap on open water gives a ripple and "tõm" and no line. There is never red, ✗ or an error sound.
- Given the child does nothing, then after about 6 s a ring circles the correct fish, which slows while the others stop. About 6 s later a hand taps it. After four wrong taps the other fish fade to 60 % and tapping them only ripples the water.
- Given the child taps the correct fish (even just behind it as it swims), when it is caught, then a line reels it up to the rod, it wriggles, "Cá vàng nhỏ!" (its colour and size) plays, it jumps with a happy tune, and new fish swim in with a new request.
- Given the third catch, when its celebration ends, then the island returns with the kart at the pond. Exactly one `round:complete { gameId: 'fishing', questions: 3 }` was emitted (with Epic 2, the play-again overlay asks "Chơi nữa với bạn cá nhé?" with the koi icon).
- Given a fish round in progress, when the child taps Home, then "Về đảo nào!" plays, the island returns, and exactly one `round:abandon` with `partial: {}` was emitted.
- Given a `hit.pond-swim` vertex moved into the Speaker keep-out (or a temporary `this.sound.play` in `games/fishing/Fishing.ts`), when running `npm run check` (or `npm run lint`), then it fails naming `pond-swim` (or the rule).

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

- 2026-10-12: subagent review layers NOT run (not authorised); inline self-review. Notes: (1) `hit.pond-swim` is stored unpadded (SCREEN_SEPARATE) and the validator keeps the pond ≥ 2 × hitPad from the Hud zones (polygon distance), equivalent to the grown pond keeping hitPad. (2) Built back to back with 4.4: questions already use the general fish-set rule, `isCorrect` and the `FishQuestion` union; `resumeQuestion` is in round.ts. (3) Five real big fish did not always fit greedy placement: the pond was enlarged and `place()` falls back to packing every fish on the grid. (4) Camera faces north (the south view had sun glare on the water). (5) Extra tokens: `ui.fishGridStepPx`, `Timing.fishMaxTickMs`, `MS_PER_SECOND` (lint forbids numbers in games). (6) In-browser AC walkthroughs not run.

## Design Notes

**Why one area target plus a pure pick:** the guard resolves a press to the topmost target, so per-fish circles cannot express "also 150 ms ago" or "nearest centre wins". A single scene-layer area hands the design point to `pickMoving`, which is pure and node-tested. HUD buttons still win because the Hud layer resolves first. Pickability still flows only through `inputGuard.isPickable`:

```ts
onPress(p) {
  const now = this.time.now;
  const c = this.swim.candidates(now, now - Timing.fishHitLookbackMs)
    .filter((f) => inputGuard.isPickable(this.items[f.id]));
  for (const cmd of this.round.tap(pickMoving(p, c, fish.hitPad), p)) this.apply(cmd);
}
```

**Why a Container per fish:** HintDirector's bob scales `correct[0].object` and restores the captured scale. Putting the facing flip on the inner sprite keeps a turning fish from fighting the bob, and the ring follows the container every frame.

## Verification

**Commands:**
- `cd app && npm run content:export && npm run tts && npm run audio:placeholders` -- expected: 14 new voice `.m4a` + `.hash` and 4 `sfx.fishing.*` files are written; a second `tts` run skips them.
- `cd app && npm run art:build -- fishing && npm run render -- fishing && npm run atlas -- fishing` -- expected: exit 0, a second `render` gives a byte-identical layout, and the luma check passes.
- `cd app && npm run art:build -- map && npm run render -- map && npm run atlas -- map` -- expected: exit 0; `icon/fishing/00` is present and the map layout is unchanged.
- `cd app && npm run check` -- expected: exit 0. The moving-pick, swim, round, questions, lines, rules, luma and contrast tests pass, and validate:content reports the fishing layout, frames and voice lines.
- `cd app && npm run build` -- expected: exit 0, with `dist/assets/atlases/fishing.png` present.

**Manual checks:**
- Run the AC walkthroughs at 1180×820 and 1024×768, in landscape and in rotated portrait. Check that no fish enters the corners or the Home/Speaker zones and that the fish never overlap.
- View the atlas in greyscale: the three colours are clearly different in brightness and pattern.
- With `prefers-reduced-motion`: the fish swim slower, and the wriggle and jump are smaller.
- With multi-touch: hold one finger on the water and tap a fish with another, and nothing happens.
