---
title: 'Story 3.1 — Đánh thức tiệm pizza: bé đếm topping, nướng bánh cho cáo ăn'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'NO_VCS'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-cross-notes.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-8-tiem-kem-keo-kem-dung-vi-cho-shiba.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-9-goi-y-leo-thang.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-tiem-kem-luot-3-5-cau-do-kho-tang-dan.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-kart-chay-toi-tram.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-4-lop-phu-hoi-choi-tiep.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-giu-luot-do-trong-phien.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** After Epics 1–2 the Tiệm pizza station on the island is still asleep: a tap gives only a bounce and a happy sound. There is no pizza scene, art, layout or voice, so FR7/FR8 are unmet. The child cannot hear "Bé ơi, ba lát xúc xích nào!", drag slices onto a base while the app counts, tap the oven and watch the fox eat.

**Approach:**
- **Wake:** register `pizza` in `content/games/index.ts` (and so in `games/registry.ts`), flip `awake` in `content/stations.ts`, and add the invite and play-again lines plus a `PLAY_AGAIN_ICONS` entry. Map, KartTrip, the invitation schedule, the post-round chain, the overlay and resume then work with no Map code.
- **Art:** a new builder `build_pizza.py` produces `art/pizza.blend`. The spec-1-4/1-8 tools then emit `atlas.pizza`, `bg.pizza` and `pizza.layout.json`, which `validatePizza` checks.
- **Game:** `games/pizza` follows the ice-cream model:
  - pure `questions.ts`, `lines.ts` and `round.ts` (drop resolution, the count, the oven step, the end of the round) with Vitest;
  - a thin `Pizza.ts` scene that applies the model's commands through DragController, HintDirector, AudioDirector and `MiniGameBase`.
- **Ladder:** a temporary one-level ladder (3 questions, 1–3 slices, sausage and mushroom). Story 3.2 extends it.

## Boundaries & Constraints

**Always:**
- **Content** (`content/games/pizza.ts`, data only):
  - `TOPPINGS = ['sausage', 'mushroom'] as const`. Story 3.2 appends a third topping.
  - `PizzaLevel = { id; toppings: 2|3; minSlices; maxSlices; questions: 3|4|5 }`, and `ladder = [{ id: 'count-1-3', toppings: 2, minSlices: 1, maxSlices: 3, questions: 3 }]`.
  - `BASE_SLOTS = 8`.
  - `assets = { atlases: [ATLASES.pizza], images: [BACKGROUNDS.pizza], audio: [every vo.pizza.* line, every sfx.pizza.* id] }`.
  - `screen`: the required layout ids and atlas frames below.
  - A content test checks that `maxSlices ≤ 5`, `maxSlices ≤ BASE_SLOTS`, `minSlices ≥ 1` and `toppings ≤ TOPPINGS.length`.
- **Wake:**
  - `stations.ts`: `pizza.awake = true`. spec-1-7's awake ⇔ `GAME_CONTENT` rule then holds.
  - `GAME_CONTENT.pizza = { ladder, assets, screen }`, and `GAMES.pizza.scene = Pizza` with scene key `'pizza'`.
  - Every other station stays asleep and keeps its spec-1-5/1-7 behaviour (bounce + `sfx.shell.happy`).
- **Art builder** (`tools/render/blender/build_pizza.py`, run with `npm run art:build -- pizza`; same invocation, temp-dir, naming and colour-argument rules as spec-1-4/1-8):
  - **Base scene:** start from `art/src/map-v2.blend`. Remove the `GameIce` collection and `HintRing`. Add camera `CamPizza` (lens from `CamGame2`), aimed with named world-unit constants at a counter in front of the `Pizza` station. The camera sits close to the counter and pitches down enough for the 8 base spots to clear the spacing rule. Render at 2048×1536.
  - **Counter:** a script box. The front face is `colors.tintButter` and the top `counterTray.top`.
  - **Fox:** Quaternius `animals/Fox.fbx` with alpha forced to 1 and OPAQUE. Recolour it with `common.py › recolor_creature`: `creatureOrange` fur with the white belly and muzzle kept. It sits centre-back behind the counter, facing the camera.
  - **Fox frames:**
    - frame 1 is the `AnimalArmature|Idle` pose;
    - frames 10–13 (`eat`) come from `|Eating`, with `Tail` bones rotated ±20° alternately;
    - frames 20–23 (`happy`) are the idle pose with the same tail wag.

    A missing action or bone prints one warning, and the frames are kept.
  - **Base:** a 16-sided dough disc in `art.pizza.dough` with a sauce disc in `art.pizza.sauce`. Frame 1 is `raw`. Frame 2 is `baked`: the crust turns `art.pizza.crust` and a cheese disc in `art.pizza.cheese` becomes visible.
  - **Toppings:**
    - `sausage`: a script-built round slice in `art.pizza.sausage` with 5 raised dots (icosphere, subdivisions 1) in `art.pizza.sausageDot`.
    - `mushroom`: Kenney `food-kit/.../mushroom-half.glb`, a cap with its stem, recoloured `art.pizza.mushroom`.
    - Both are posed at their bowl slot and scaled so the trimmed width is at least 90 design px.
  - **Bowls:** Kenney `bowl.glb`, one per topping, each filled with a small static pile of that topping. They are part of the plate.
  - **Oven:** script-built, because no Kenney oven exists:
    - a low-poly box body and dome in `art.pizza.ovenBody`;
    - a door hinged at the bottom, with a glass panel.

    Its frames:
    - frame 1, `rest`: door closed, dark glass;
    - frame 2, `ready`: door open 25°;
    - frame 3, `baking`: door closed, glass emission in `colors.ovenGlow`.

    Its width is about `components.oven.size` design px, to the right of the counter.
  - **Sprite collections:**
    - `sprite.fox`: `states {"idle":[1],"eat":[10,11,12,13],"happy":[20,21,22,23]}`, `holdout_occluders: true`.
    - `sprite.oven`: `{"rest":[1],"ready":[2],"baking":[3]}`.
    - `sprite.base`: `{"raw":[1],"baked":[2]}`, `movable: true`.
    - `sprite.topping-sausage` and `sprite.topping-mushroom`: `movable: true`.
- **Layout ids** (kebab ids per the spec-1-4 grammar; see Decisions):
  - `anchor.fox`, `hit.fox`;
  - `anchor.base`, `slot.base-1` … `slot.base-8`;
  - `anchor.bowl-<t>` and `slot.bowl-<t>` (the slice home on the bowl) for each `TOPPINGS` entry;
  - `anchor.oven`, `hit.oven`;
  - `hit.counter`;
  - `slot.fox-plate` (where the baked pizza lands in front of the fox).
  - The builder places the 8 base slots evenly on an ellipse around the base centre, starting at the top and going clockwise.
- **Screen rules** (`tools/layout/rules.ts › validatePizza(layout, atlasJson)`, run by `render`, `atlas` and `validate:content`; each message names the id):
  - **Required:** every id above, and every frame in `screen.frames`.
  - **Lower third:** `anchor.base`, each `slot.bowl-*` and `slot.fox-plate` have `512 ≤ y ≤ 694 − draggableItem.minSize/2`.
  - **Inside the interactive rect:** every `slot.*` (inset `minSize/2`) and every `hit.oven` vertex. They also stay out of the Home/Speaker keep-out zones: new `tools/layout/hud-keep-out.ts › hudKeepOutRects()` gives the 120×120 rects over both supported aspects, derived from spec-1-6's `hudLayout`. Item circles are grown by `minSize/2`. Stories 3.3, 3.5 and 4.x reuse it.
  - **Spots:** each pair of `slot.base-*` is at least `ui.pizzaPlacedSlicePx` apart.
  - **Gaps:**
    - each `slot.bowl-*` is at least `baseRadius + minSize/2 + spacing.gap` from `anchor.base`;
    - bowl slots are at least `minSize + spacing.gap` apart;
    - the `hit.oven` hull is at least `spacing.gap` from every bowl circle (r = `minSize/2`) and from the base circle.
  - **Oven:** `hit.oven` has a minimum width of at least `targetMin`. The trimmed width of `oven/rest/00` ÷ renderScale is within `components.oven.size ± ui.ovenSizeTolerance`. `anchor.oven.x` is greater than every `slot.bowl-*` x and than `anchor.base.x`.
  - **Fox:** `|anchor.fox.x − 512| ≤ 1024/6` and `anchor.fox.y < anchor.base.y`. The trimmed height of `fox/idle/00` ÷ renderScale is at least `character.minSize`.
  - **Toppings:** each `topping-*/idle/00` has a trimmed width ÷ renderScale of at least 90.
  - **Background:** `bg.pizza` is 2048×1536.
  - `baseRadius(layout)` is pure and shared with the game: the maximum distance from `anchor.base` to a `slot.base-*`, plus `ui.pizzaPlacedSlicePx/2`.
- **Questions** (`games/pizza/questions.ts › roundQuestions(seed, level) → { topping, count }[]`, pure):
  - It uses `mulberry32(seed)` and clamps `level`.
  - Each question picks a topping from the first `toppings` of `TOPPINGS` and a count in `[minSlices, maxSlices]`, and returns `ladder[level].questions` entries.
  - Question `i > 0` never equals question `i − 1` in both topping and count. Re-derive with a salted draw; never loop unbounded.
  - The result is deterministic, and Story 3.2 adds its round-level constraints here.
- **Line ids** (`games/pizza/lines.ts`, pure):
  - `askLineId(q)` = `vo.pizza.ask.<topping>.<count>`;
  - `retryLineId(q)` = `vo.pizza.retry.<topping>`;
  - `enoughLineId(n)` = `vo.pizza.enough.<n>`;
  - `countLineIds(n)` = `['vo.pizza.count.1' … 'vo.pizza.count.<n>']`;
  - `BAKE_LINE` = `vo.pizza.bake`.

  A test enumerates every reachable `(topping, count)` of every ladder level and asserts that each id is in `VOICE_LINES`.
- **Round model** (`games/pizza/round.ts`, pure):
  - **Stages** per question: `toppings → counting → oven → baking`.
  - **Inputs:** `drop(itemId, p)`, `speechEnded(tag)`, `speechLine(tag, index)`, `ovenTap()`, `eaten()`.
  - **Output:** an ordered command list. The scene only applies it.
- **Drop resolution for a slice**, first match wins:
  1. **`home`:** within `snapRadius/2` of the slice's own pre-lift position. It settles back with no hint.
  2. **`serve`:** inside the base target. The target is `createDropTarget({ id: 'base', circle: { anchor.base, r: snapRadius }, pad: baseRadius })`, so the hit radius is `pad + r × snapScale`.
  3. **`rest`:** inside `hit.counter`. The slice stays at `nudgeApart(p, other loose slices, minSize, counter bbox ∩ dragBounds)`, which becomes its new pre-lift position.
  4. **`off`:** anywhere else. After `Timing.dragOffCounterReturnDelayMs` it slides back to its pre-lift position. Lifting it again cancels the slide.
- **`serve` outcomes:**
  - **Right topping, `toppings` stage, `placed < count`:**
    - The slice tweens to the lowest free `slot.base-<n>` over `dropTarget.snap.durationMs` (ease-out, 1.05× bounce) and shrinks to `ui.pizzaPlacedSlicePx`. `sfx.pizza.snap` plays in the drop handler.
    - The slice is now locked and part of the base group.
    - A fresh slice of that topping pops in at `slot.bowl-<t>`, so the bowl never runs out.
    - The game says `vo.pizza.count.<placed>`.
    - If `placed < count`: `hint.stepDone(toppingStep)` (level kept, idle restarted, so steady progress never triggers the ring).
    - If `placed === count`: the stage becomes `counting` and every slice becomes unpickable. When the count line's `speech:ended` arrives (`completed` true or false), the game calls `audio.sayChain(countLineIds(count))`.
  - **Recount:** each `speech:line { token, index }` for that chain bounces the slice in `slot.base-<index+1>` by `1 → ui.pizzaCountBounceScale → 1` over `Timing.pizzaCountBounceMs`, so one slice moves at a time. When the chain's `speech:ended` arrives:
    1. The stage becomes `oven`, the oven shows `oven/ready/00`, and the slices become pickable again.
    2. If `hint.level < 2`, the game draws the ready ring around the `hit.oven` bbox with `createHintRing`.
    3. Then `hint.stepDone({ correct: [ovenItem], distractors: [], target: null, action: 'tap' }, { promptLineId: 'vo.pizza.bake', retryLineId: enoughLineId(count) })`.
  - **Wrong topping (any stage), or the right topping in the `oven` stage (an extra slice):** the slice floats back to its pre-lift position over `draggableItem.return.durationMs`, then `hint.wrong()`. The placed count never changes.
  - **`counting` and `baking`:** every slice is unpickable, so no drop is possible.
- **Hint steps:**
  - **Toppings:** `{ correct: [the wanted topping's bowl slice, then any loose slices of it], distractors: [every other topping's slices], target: baseTarget, action: 'drag' }`.
  - **Ready ring:** the game destroys its ready ring on `hint:level ≥ 2` and on the oven tap. Its destroy is idempotent. The director's ring replaces it at level 2, so only one ring ever shows.
  - Each question begins with `hint.beginQuestion({ promptLineId: askLineId(q), retryLineId: retryLineId(q), step: toppingStep })`.
- **Oven:**
  - **Tap target:** a `HotspotPolygon` on `hits.oven`.
  - **`ovenTap()` in `toppings` or `counting`:** the oven nudges `1 → ui.ovenNudgeScale → 1` over `Timing.buttonPressMs`, starting in the press handler. There is no bake, no `wrong()` and no voice.
  - **In `baking`:** ignored.
  - **In `oven`:**
    1. Destroy the ready ring, call `hint.questionDone()`, lock the slices and `holdAmbient('bake', true)`.
    2. The base group slides into `anchor.oven` and fades over `Timing.pizzaSlideMs`.
    3. The `oven/baking/00` overlay alpha rises 0 → 1 over `Timing.ovenGlowRiseMs`, holds `Timing.pizzaBakeMs` with small white smoke puffs, then falls over `ovenGlowRiseMs`. There is no blinking.
    4. `sfx.pizza.ting`.
    5. The base comes out as `base/baked/00`, with its slices, to `slot.fox-plate` over `pizzaSlideMs`, with steam puffs rising.
    6. The fox plays `fox/eat/*` with `sfx.pizza.munch` for `Timing.pizzaEatMs`.
    7. `eaten()`.
  - **The model advances `questionIndex` on the oven tap.**
- **`eaten()`:**
  - **Not the last question:** the baked base fades over `sceneFadeMs`, the fox returns to idle, `holdAmbient('bake', false)`, and the next question begins with an empty raw base.
  - **Last question:** the fox plays `fox/happy/*` and bounces through `character.celebrate`, and `sfx.pizza.happy` plays. Then `{ kind: 'finishRound', afterMs: Timing.roundCelebrationMs }`.
  - spec-1-10's Home-while-finishing applies from the last oven tap: `hud:home` gives `round:complete`, never `round:abandon`.
- **Base visuals:** the base group holds the raw base sprite plus 8 faint spots. Each spot is an ellipse of `pizzaPlacedSlicePx` foreshortened like the base, filled with `ghostSlot.line.color` at `ghostSlot.fillOpacity`. A placed slice covers its spot.
- **Fox ambient:** the fox breathes `1 ↔ ui.foxBreathScale` (scaleY around `anchor.fox`) over `Timing.foxBreathMs`, registered with `addAmbient`. The base holds it at hint level ≥ 2 (spec-1-9). The game holds it during bake, eat and celebration.
- **Snapshot and resume:**
  - `progress()` = `{ questionIndex, partial: { placed: <slot numbers 1–8 in placement order>, baked: false } }`.
  - When `resumeAt` is set, `build()` begins `resumeAt.questionIndex` with an empty base, because the base has already restored the tally. An out-of-range index warns once and starts at 0.
  - Restoring `placed` and the `partial` validation belong to Story 3.2.
- **Reduced motion:** every bounce, nudge, breath and celebration amplitude goes through `amplitude(…, reduced)`. Smoke and steam puffs are drawn static (no rise tween). Frame swaps still play.
- **Voice:** the game calls `audio.say` only for `count.<n>` and `audio.sayChain` only for the recount. Prompts, retries and the bake line go through `hint.*`. Tags map tokens; any other token is ignored.

**Never:**
- No ladder levels beyond the one, no third topping, no `placed` restore (Story 3.2). No difficulty logic in the game.
- No red, ✗, shake, wrong sound, praise or "sai". No text on screen. No flashing (the glow rises once and falls once).
- No auto-placing a slice and no auto-baking. The hand only demonstrates.
- No `setTimeout`, `this.sound`, `this.load` or `scene.*` navigation in the game. No Epic 2 import. No hand-entered coordinates and no magic numbers or hex in the game.
- No change to the spec-1-4 JSON format or to Map/KartTrip code.
- No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **Kebab layout ids:** the AC's `slot.base.1` and `anchor.bowl.sausage` break spec-1-4's id grammar (`^[a-z0-9]+(-[a-z0-9]+)*$`), so they are `slot.base-1` and `anchor.bowl-sausage`.
- **`questionDone` on the oven tap**, not after the munch. This follows the spec-1-9/1-10 order (`questionDone` → lock → celebrate): the ring and hand vanish at the answer, and a Home tap during the bake does not save an answered question. So `partial.baked` is always `false` (see the cross-note for 3.2).
- **The oven's `ready` ring** is the game's static-position `createHintRing` (spec-1-5 one-live-ring), shown only while the hint level is below 2. The director's level-2 ring (about 6 s later through `hintLevel2IdleMs`, which a timing test pins equal to `pizzaOvenIdleHintMs`) replaces it, and then the hand follows at level 3.
- **Per-slice `stepDone`:** the hint protocol has no "progress" call, so without it a slow but correct child would get the ring mid-count.
- **The ring sits on the bowl's top slice**, the draggable that lives on the bowl. It follows the slice if the child lifts it.
- **Bowls never run out:** a slice respawns on its bowl when one is placed. A resting loose slice stays draggable, and the bowl's pile is plate art, so the bowl never looks empty.
- **Base snap zone:** "trong 100px quanh đế" is read as within `snapRadius` of the base's edge. The own-home check comes first, so a slice lifted and dropped back on its bowl never counts.
- **"4 trạm còn ngủ"** in the AC is a miscount: after this story 5 stations sleep, and all keep the Epic 1 behaviour.
- **Small core extensions** (additive; existing callers unchanged):
  - **`HintStep.correct` and `distractors`** become `readonly HintItem[]`, with the structural `HintItem = { object?; onLiftChange? }`, which `Draggable` satisfies:
    - the bob skips the lift pause when `onLiftChange` is absent;
    - `setPickable` and the dim keep working through the guard `WeakMap` and `object`.

    This lets a tap target (the oven) be hinted. It is the shape spec-4-1 plans, so 4.1 reuses it.
  - **`speech:line { token, index, id }`** is a new Bus event that AudioDirector emits when each line of an utterance starts. The recount bounce uses it, so there is no duration guessing.
  - **`createDropTarget`** gains `pad` for circles: hit radius = `pad + r × snapScale(target)`.
  - **`VoiceLine.review?: string`** (a reason for a parent to listen). `content/validate.ts` gains two rules:
    - `REVIEW_WORDS = ['pizza', 'xúc xích']`: an unapproved line containing one of them must carry `review`. `validate:content` prints the unapproved `review` lines as an info list, which is not a failure.
    - `BANNED_PHRASES = ['sai', 'không đúng', 'giỏi', 'giỏi quá', 'tuyệt vời', 'xuất sắc', 'đúng rồi', 'hoan hô', 'hay quá']`: a word-sequence match fails the check.
- **Voice lines** (unapproved; `voiceWords` counts each hyphen part):

  | id | text | words |
  |---|---|---|
  | `vo.pizza.ask.<t>.<n>` (6) | "Bé ơi, \| <một/hai/ba> lát <xúc xích/nấm> nào!" | ≤ 7 |
  | `vo.pizza.retry.sausage` / `.mushroom` | "Mình lấy \| xúc xích nhé!" / "Mình lấy \| nấm nhé!" | 5 / 4 |
  | `vo.pizza.enough.<n>` (1–3) | "Đủ <một/hai/ba> lát rồi!" | 4 |
  | `vo.pizza.count.<n>` (1–3) | "Một!", "Hai!", "Ba!" | 1 |
  | `vo.pizza.bake` | "Mình nướng bánh nào!" | 4 |
  | `vo.shell.invite.pizza` | "Bé ơi, mình làm \| pizza nhé!" | 6 |
  | `vo.shell.play-again-ask.pizza` | "Chơi nữa với bạn cáo nhé?" | 6 |

  - `keywordPauseMs: 300` applies wherever `|` appears.
  - `review` is set on every sausage line ("xúc xích"), on `invite.pizza`, and on the existing `vo.shell.station-name.pizza` ("pizza").
- **SFX placeholders** (`make-placeholders.ts`; all with a 50 ms fade-in, a −20 dBFS peak and partials ≥ 300 Hz, so nothing is below 150 Hz):
  - `sfx.pizza.snap`: a soft "pụp", about 150 ms;
  - `sfx.pizza.ting`: a bell, about 400 ms;
  - `sfx.pizza.munch`: two soft clicks, ≤ 700 ms;
  - `sfx.pizza.happy`: a major arpeggio, about 1.5 s.
- **Play-again icon:** `PLAY_AGAIN_ICONS.pizza = { model: 'quaternius/animals/Fox.fbx', creature: 'creatureOrange' }`. Re-render the map to get `icon/pizza/00`.
- **Hint contrast:** spec-1-9's `hint-contrast.ts` gains the `pizza` sites: each `slot.bowl-*` and the `hit.oven` bbox on `bg.pizza`.
- **New values:**
  - `Tokens.art.pizza`: dough `#F2D49B`, crust `#D9A35B`, sauce `#E0703A`, cheese `#FFE08A`, sausage `#B8442A`, sausageDot `#F2B48C`, mushroom `#F3E6CC`, ovenBody `#C98A5B`. A test requires a relative-luminance gap of at least 0.3 between every topping pair.
  - `ui.foxBreathScale 1.02`, `ovenNudgeScale 1.05`, `pizzaCountBounceScale 1.15`, `pizzaPlacedSlicePx 60`, `ovenSizeTolerance 30`, `pizzaPuffPx 10`.
  - `Timing.foxBreathMs 2400`, `ovenGlowRiseMs 400`, `pizzaSlideMs 400`, `pizzaEatMs 1200`, `pizzaCountBounceMs 240`, `pizzaSteamMs 1200`. The existing `pizzaBakeMs` (2000) is used as is.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enter | `{level:0, seed:7}` | raw base with 8 spots, 2 bowls with slices, fox breathing; `beginQuestion(ask.<t>.<n>, retry.<t>, toppingStep)` | — |
| Place 1 of 3 | sausage dropped 80 px outside the base edge | snap to slot.base-1, 60 px, 200 ms; "pụp"; `say(count.1)`; respawn on bowl; `stepDone(toppingStep)` | — |
| Third slice | placed 2 → 3 | `say(count.3)`; slices locked; after it ends, `sayChain([count.1..3])` | — |
| Recount bounce | `speech:line` index 0,1,2 for the chain token | slot.base-1, -2, -3 bounce in turn; a foreign token is ignored | — |
| Oven ready | chain `speech:ended` (completed or not) | `oven/ready`; ready ring if level < 2; slices pickable; `stepDone(ovenStep, {bake, enough.3})` → "Mình nướng bánh nào!" | — |
| Wrong topping | mushroom on the base | floats back 500 ms; `hint.wrong()`; placed unchanged | — |
| Extra slice | oven stage, 4th sausage on the base | floats back; `wrong()` → "Đủ ba lát rồi!"; placed stays 3 | — |
| Back to bowl | lifted and dropped within 50 px of its pre-lift spot | settles; no hint | — |
| Rest | dropped on the counter, not on the base | stays, nudged ≥ 90 px from other loose slices | — |
| Off | dropped on the grass or the oven | slides back after 1500 ms; re-lift cancels | — |
| Early oven tap | toppings stage | nudge 1.05× in the handler; no bake, no `wrong()`, no voice | — |
| Oven idle | oven stage, no tap | ~6 s after the bake line ends: director ring on the oven (ready ring gone), `hint:level 2`; ~6 s later the hand taps the oven | — |
| Speaker | oven stage | replays "Mình nướng bánh nào!"; level kept | — |
| Bake | oven tap in the oven stage | `questionDone`; slide in; glow 400 ms up, 2000 ms hold, down; ting; baked base to fox-plate with steam; eat + munch; next question | — |
| Last question | 3rd oven tap, then eaten | fox happy + bounce + tune; one `round:complete {gameId:'pizza', questions:3, firstTryCorrect, maxHintLevel}` 1500 ms later; inert | — |
| Tally | q1 clean; q2 one extra slice; q3 oven idle to level 2 | `firstTryCorrect 1`, `maxHintLevel 2` | — |
| Home mid-question | 2 of 3 placed | one `round:abandon`; `progress()` = `{questionIndex, partial:{placed:[1,2], baked:false}}` | — |
| Home during the last bake | after the 3rd oven tap | `round:complete`, never `round:abandon` | — |
| Resume | `resumeAt.questionIndex 1` | question 1 begins clean; `beginQuestion` at level 0 | — |
| Resume out of range | `questionIndex 7` | question 0 | console.warn once |
| Questions | same seed and level | identical list; consecutive questions differ; counts 1–3; toppings ⊂ first 2 | — |
| Reduced motion | `reduce` | smaller bounces and nudge; static puffs | — |
| Missing frame | `oven/baking/00` absent | one warn; the glow is skipped and the bake timing is kept | console.warn |
| Layout | `slot.base-8` missing or a rule broken | render, atlas and check fail naming it | exit 1 |
| Voice rules | a sausage line without `review`, or a line containing "giỏi" | check fails naming the id | exit 1 |

</intent-contract>

## Code Map

- `app/src/content/stations.ts`, `content/games/{types,index,ice-cream}.ts`, `games/registry.ts`, `games/mini-game-base.ts` -- planned in spec-1-5/1-7/1-8/1-10/2-5: `awake`, `GAME_CONTENT`, `GAMES`, `screen`, `hint` wrapper, `finishRound`, `addAmbient`/`holdAmbient`, `progress()`, `resumeAt`. Model to copy: `games/ice-cream/{questions,lines,round,IceCream}.ts`.
- `app/src/core/input/{drag-controller,drop,guard,hotspot-polygon,tap-router}.ts` -- planned in spec-1-5/1-6/1-8/1-9. `drop.ts › createDropTarget` gains `pad`.
- `app/src/core/hint-director.ts`, `hint-machine.ts`, `hint-visuals.ts` -- planned in spec-1-8/1-9. Widen `HintStep.correct`/`distractors` to `HintItem`; `createHintRing` is one-live-ring.
- `app/src/core/audio-director.ts` -- real `say`, `sayChain`, `request`/`startUtterance`. Emit `speech:line` at each line start. `app/src/core/bus.ts` -- real event map; add `'speech:line'`.
- `app/src/core/rng.ts › mulberry32`, `core/ui/sprite-pivot.ts`, `core/reduced-motion.ts`, `core/round-tally.ts` -- planned in spec-1-5/1-8/1-10.
- `app/src/content/voice-lines.ts` -- real `VoiceLine`, `VOICE_LINES`. Add `review?` and the 17 lines; add `review` to `vo.shell.station-name.pizza` (spec-1-5). `app/src/content/validate.ts` -- real `voiceWords`, `BANNED_PAIRS`, `validateVoice`. Add `REVIEW_WORDS` and `BANNED_PHRASES`.
- `app/src/content/audio-catalog.ts`, `app/tools/audio/make-placeholders.ts` -- real. Add the 4 `sfx.pizza.*` ids.
- `app/src/content/play-again.ts` -- planned in spec-2-4: `PLAY_AGAIN_ICONS`.
- `app/src/content/{assets,layouts}.ts` -- planned in spec-1-4/1-8: `ATLASES`, `BACKGROUNDS`, `LAYOUTS`.
- `app/tools/render/{build,render}.ts`, `tools/render/blender/{common,render_screen,build_ice_cream,build_map}.py`, `tools/atlas/pack.ts`, `tools/layout/rules.ts`, `tools/lint/{validate-content,hint-contrast}.ts` -- planned in spec-1-4/1-8/1-9/2-4.
- `app/src/core/timing.ts` -- real `pizzaBakeMs`, `pizzaOvenIdleHintMs`, `dragOffCounterReturnDelayMs`, `roundCelebrationMs`, `sceneFadeMs` (spec-1-7). `app/src/core/tokens.ts` (`ui`, `art`), `tokens.generated.ts` -- real `components.{oven,counterTray,ghostSlot,draggableItem,dropTarget,character}`, `colors.{ovenGlow,creatureOrange,tintButter}`.
- Sources: `assets/quaternius/animals/Fox.fbx`, `assets/kenney/kenney_food-kit/Models/GLB format/{bowl,mushroom-half}.glb`, `art/src/map-v2.blend`.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/core/tokens.ts`, `app/src/core/timing.ts` (+ tests) -- `art.pizza`, the new `ui` and `Timing` values, the topping luminance-gap test and the `pizzaOvenIdleHintMs === hintLevel2IdleMs` test.
- [x] `app/src/core/bus.ts`, `app/src/core/audio-director.ts` (+ test) -- `speech:line` for a single line (index 0) and for each chain line in order. A cut chain emits no further lines.
- [x] `app/src/core/input/drop.ts` (+ test), `app/src/core/hint-director.ts`, `hint-machine.ts`, `hint-visuals.ts` (+ tests) -- `pad`, and `HintItem` with a tap-step ring and hand on an object that has no `onLiftChange`.
- [x] `app/src/content/voice-lines.ts`, `app/src/content/validate.ts` (+ test) -- `review`, the 17 lines and the station-name review flag; `REVIEW_WORDS` and `BANNED_PHRASES` rules with cases. Generate with `npm run content:export && npm run tts`.
- [x] `app/src/content/audio-catalog.ts`, `app/tools/audio/make-placeholders.ts` (+ test) -- the 4 SFX, with a test that every partial is ≥ 300 Hz and munch is ≤ 800 ms. Generate with `npm run audio:placeholders`.
- [x] `app/src/content/games/pizza.ts` (+ test), `content/games/index.ts`, `content/stations.ts`, `content/assets.ts`, `content/layouts.ts`, `content/play-again.ts` -- content, the ladder rules, the wake, registration and the icon entry.
- [x] `app/tools/render/blender/build_pizza.py`, `app/tools/render/build.ts` (+ test) -- the builder and the screen registration with colour args. A map re-render stays byte-identical except for the new `icon/pizza/00`.
- [x] `app/tools/layout/hud-keep-out.ts` (+ test), `app/tools/layout/rules.ts` (+ test), `app/tools/lint/validate-content.ts` (+ test), `app/tools/lint/hint-contrast.ts` (+ test) -- `validatePizza`, `baseRadius`, a failing case for each rule, the review info list and the pizza contrast sites.
- [x] `app/src/content/generated/pizza.layout.json`, `public/assets/atlases/pizza.{png,json}`, `public/assets/bg/pizza.png`, re-rendered `atlas.map` -- produce them with the real Blender, and fix rule failures in the builder constants.
- [x] `app/src/games/pizza/questions.ts`, `lines.ts`, `round.ts` (+ tests) -- every matrix row except the Phaser-only visuals, plus the lines coverage test.
- [x] `app/src/games/pizza/Pizza.ts`, `app/src/games/registry.ts` -- the scene: plate, base group with spots, bowls' draggables, oven hotspot, fox ambient, command application, the tag → token map, the `speech:line` and `speech:ended` subscriptions through `bus.scoped(this)`, puffs, and the resume start.
- [x] `app/README.md` -- provenance rows for Fox.fbx, `bowl.glb`, `mushroom-half.glb` and the new audio.

**Acceptance Criteria:**
- Given a fresh `npm run dev` at 1180×820 touch emulation, when the child taps Tiệm pizza, then it bounces, "Tiệm pizza" plays, the kart drives there in at most 2 s while `atlas.pizza`/`bg.pizza` load, and the pizza screen opens. If the child stays idle about 8 s on the island, the invitation can ring Tiệm pizza with "Bé ơi, mình làm… pizza nhé!". Taps on the five sleeping stations still give only a bounce and a happy sound.
- Given the real Blender, when running `art:build`, `render` and `atlas` for `pizza`, then `preview.png` shows the orange-white fox centred behind a butter counter with a sausage bowl, the base and a mushroom bowl in one row in the lower third, and the oven at the right. The atlas is one page ≤ 2048² and `npm run check` passes the pizza rules.
- Given the prompt "Bé ơi, ba lát xúc xích nào!", when the child drags three sausage slices onto the base, then each snaps to the next spot with "pụp" and the voice says "Một!", "Hai!", "Ba!". Then "Một, Hai, Ba" is re-counted with each slice bouncing on its number, the oven opens with a ring, and "Mình nướng bánh nào!" plays.
- Given that state, when the child drops a fourth sausage, then it glides back to the bowl and "Đủ ba lát rồi!" plays. A mushroom dropped earlier on the base also glides back. There is no red, shake or error sound.
- Given the oven is ready and the child does nothing, when about 6 s pass after the bake line, then a ring pulses around the oven, and about 6 s later a hand taps it. When the child taps the oven, the pizza slides in, the window glows softly about 2 s without blinking, "ting" plays, and the fox munches the steaming pizza and wags. Then a new base and request follow.
- Given the third pizza is eaten, when the fox's happy bounce ends (about 1.5 s), then the island returns with the kart at Tiệm pizza (with Epic 2, the normal chain and the play-again overlay with the fox icon and "Chơi nữa với bạn cáo nhé?"). Exactly one `round:complete { gameId: 'pizza', questions: 3 }` was emitted.
- Given `cd app && npm run check`, then it exits 0. validate:content reports the pizza layout, frames and contrast. It lists the `review` lines ("pizza", "xúc xích") for a parent, and finds no banned pair or phrase.

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
- **2026-10-09 (implementation): what changed from the spec, and why.**
  - **Art.** The camera is `(1.9, -7.0, 6.0)` → `(1.9, -3.6, 1.4)` (about 53° down), the only pitch that keeps the 8 spots ≥ 60 px apart (closest 71 px). From that height the shop's pizza sign hid the fox, so `build_pizza.py` also prunes `A_PizzaSign`, the pine `Pine3.6-5.4*` / `PTr3.6-5.4` / `Flower10` in front of the counter, and the reference `Car` collection (the parked kid kart). The counter is 5.0 m wide so its front corners stay in frame; `hit.counter` points below the frame are lifted along z into it. Toppings face the camera (`to_track_quat`), the mushroom by its flat cut face. Base frames: the cheese shows by keyed scale, not `hide_render` (frame_set would re-apply it in other sprites' passes). Bowls stand at `BOWL_Y` (nearer the counter front) so the slice homes are in the lower third.
  - **`spacing.gap`** does not exist; the rules use `spacing.targetGap` (24), as the cross-notes say.
  - **Atlas.** The fox's alternating wag repeats poses (eat 11 = 13, happy 20 = 22, 21 = 23), but EEVEE noise makes those renders differ slightly, so the packer's `detectIdentical` missed them and the atlas needed 2 pages. `pack.ts` now packs frames whose trim boxes match and whose RGBA differ by ≤ `NEAR_IDENTICAL_DIFF` (16) once. A re-pack of `map` is byte-identical.
  - **Finishing.** `MiniGameBase.markFinishing()` (new) makes a Home tap complete the round from the last oven tap on; `scheduleFinish` still schedules the finish after the celebration.
  - **TTS.** "Một!" is shorter than loudnorm's 400 ms gating block (integrated loudness `-inf`), so `tools/tts/generate.ts` re-measures such a line padded with silence (`apad=whole_dur=1`, pass 1 only).
  - **Scene.** The scene keeps the latest voice token per tag; the first `speech:line` of its own request arrives before `say` returns, so it is adopted through the tag being issued. Placed slices stay scene children (the base group and they move together), so hint visuals keep reading true positions. Depths come from an ordered layer list (`erasableSyntaxOnly` forbids enums).
  - **Review fixes.**
    - At the last slice the hint step is cleared (`stepDone(null)`) until the oven step, so no ring, hand or retry plays over the count.
    - A count line or recount cut (`completed: false`) is said again once; a second cut moves on.
    - A drop serves only when it is nearer `anchor.base` than every bowl home, because the base target (≈ 240 px) reaches past both bowls (≈ 217 px).
    - The last oven tap emits `markFinishing`.
    - An empty `review` does not count, and `'giỏi quá'` is dropped from `BANNED_PHRASES` (it is covered by `'giỏi'`).
  - **`slot.fox-plate`** sits at the minimum lower-third y (516) in front of the fox; the baked pizza there overlaps the mushroom bowl while the fox eats.
## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | verification-gap | Pizza's `markFinishing()` on the last bake has no test on the real path; deleting it makes Home during the last bake abandon | medium | Only the TestGame stub and the `isFinishing` getter are tested | patch |
| 2 | blind, edge | The hint keeps its toppings step during counting; an idle ring/retry line can cut the count, and a cut count/recount (completed=false) skips the recount and opens the oven | medium | round.ts `serve` at the last slice emits no stepDone/pause; `speechEnded` ignores `completed` | patch |
| 3 | blind | Both bowls sit inside the base drop target (hit r ≈ 137 + snapRadius 100 = 237 px vs bowls ≈ 217 px), so a wrong slice put back near its bowl (> 50 px) counts as wrong and "rest" near the bowls never happens | medium | tokens.generated.ts snapRadius 100; round.ts classifies `serve` before `rest` | patch |
| 4 | verification-gap, blind, edge | TTS short-line loudnorm fallback untested, and the `"input_i"` regex matches any parseLoudnorm error | low | Fake exec always returns valid pass 1; error message embeds the whole JSON | patch |
| 5 | blind, edge | Atlas twin match ignores box width/height | low | Equal area, different shape could alias; direct check | patch |
| 6 | blind, verification-gap | Tests that cannot fail: `order` never written (audio-director), hint snapScale reads the setup target, round "Tally" test checks its own fake, trivially-true token inequality, duplicate munch assertion and title | low | Each asserts nothing about the named behaviour | patch |
| 7 | edge | A respawned slice lifted during its pop-in keeps the pop-in tween, which overrides the lift scale | low | Pop-in tween not stored in `view.tween`; direct fix | patch |
| 8 | blind | `celebrate()` holds ambient and never releases; `snap()` destroys the shadow before `moveTo` updates it; a missing base leaks the slice image | low | Direct cleanup fixes | patch |
| 9 | edge, blind | An empty `review` string satisfies the rule; `'giỏi quá'` duplicates `'giỏi'` | low | Direct fixes (trim, drop duplicate) | patch |
| 10 | verification-gap | Near-identical frame aliasing in `packScreen` not exercised | low | Needs real PNG fixtures | defer |
| 11 | blind | No fallback if `speech:ended` never arrives | low | AudioDirector always emits `speech:ended` (completed or cut) | reject |
| 12 | edge | `issuing` fallback could tag a foreign index-0 line | maybe-false | Needs a nested request from a speech:ended listener during `say()`; none exists | reject |
| 13 | blind | Eat frames sample raw action frame numbers; happy frames repeat | low | Agent checked the frames by eye; poses read correctly | reject |
| 14 | blind | `hit.fox` built but never tapped | low | Spec requires the hull for the layout rules only | reject |
| 15 | blind | Generated assets missing from the diff | false | Excluded from the review diff for size; present on disk | reject |
| 16 | blind | Resume drops placed slices; `baked` is a dead field | low | Placed-slice resume is Story 3.2 scope | reject |
| 17 | blind | Rules check bowl slots, runtime uses frame centres | low | Frames are rendered at the slots | reject |
| 18 | blind | Steam puffs borrow `counterTop`; fox and Shiba icons share orange | low | Colour coupling only | reject |
| 19 | edge | Level +Infinity clamps to 0 | low | Levels come from clamped `getDifficulty` | reject |

## Design Notes

**Why counting is game voice but prompts are not:** counting is immediate feedback for a drop, like the snap sound, so the game owns it. Prompts and retries stay with `hint.*`, so the escalation, the Speaker and rate limits work unchanged. A count line that cuts the prompt clears the director's awaited token (`completed: false`), and its idle clock restarts, as spec-1-9 defines.

**Command flow for the last slice** (scene side):

```ts
onDrop(p) { for (const c of round.drop(item.id, p)) apply(c); }
// → snap{slot:3} · sfx snap · respawn{sausage} · lockSlices · say{tag:'count', 'vo.pizza.count.3'}
// speech:ended(count) → round.speechEnded('count') → sayChain{tag:'recount', ids}
// speech:line(recount, i) → bounce{slot:i+1}
// speech:ended(recount) → ovenReady · unlockSlices · readyRing? · stepDone(ovenStep, {bake, enough.3})
```

**Why the base target has a `pad`:** the spots fill a 120 px+ disc, so a plain 100 px circle around the centre would reject a drop on the base's rim. `pad` keeps "100 px from the edge" honest, and Story 3.2's `setSnapScale(base, 2)` still doubles only the forgiving margin.

## Verification

**Commands:**
- `cd app && npm run content:export && npm run tts && npm run audio:placeholders` -- expected: 17 new `vo.*` files and 4 `sfx.pizza.*` files are written; a second `tts` run skips them.
- `cd app && npm run art:build -- pizza && npm run render -- pizza && npm run atlas -- pizza` -- expected: exit 0, and a second `render` gives a byte-identical layout.
- `cd app && npm run art:build -- map && npm run render -- map && npm run atlas -- map` -- expected: exit 0; `map.layout.json` is unchanged and `atlas.map` has `icon/pizza/00` on one page.
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run build` -- expected: exit 0, and `dist/assets/atlases/pizza.png` is present.

**Manual checks:**
- In `preview.png` and in the game, sausage and mushroom differ in greyscale (dotted dark disc vs. pale cap with stem), and the fox is not grey-brown.
- Listen to every `review` line ("pizza", "xúc xích") and leave `approved` unset for the parent. Listen to the recount: the bounce lands on each number.
- With `prefers-reduced-motion`, bounces are visibly smaller and the smoke and steam do not move. With multi-touch, holding a slice and tapping the oven or Home with another finger does nothing.
