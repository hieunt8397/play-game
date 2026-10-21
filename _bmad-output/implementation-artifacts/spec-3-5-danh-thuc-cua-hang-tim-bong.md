---
title: 'Story 3.5 — Đánh thức cửa hang: tìm bóng cùng khủng long ba sừng'
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
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-danh-thuc-tiem-pizza-be-dem-topping.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-3-danh-thuc-cong-vien-khung-long-ghep-3-manh.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-4-ghep-khung-long-thang-3-4-6-manh-va-luot-do.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-8-tiem-kem-keo-kem-dung-vi-cho-shiba.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-9-goi-y-leo-thang.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-pipeline-hinh-render-blender-atlas-layout.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-giu-luot-do-trong-phien.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** After Story 3.4 the Hang tìm bóng station is still asleep (bounce + happy sound only). There is no shadow-match scene, cave art, item catalogue, voice or creature sound, so FR20 is unmet: the child cannot drag the thing a triceratops holds onto its matching shadow and hear its Vietnamese name.

**Approach:**
- **Wake:** register `shadow-match` in `content/games/index.ts` (and so `games/registry.ts`), flip `awake` in `content/stations.ts`, add the invite / play-again lines and a `PLAY_AGAIN_ICONS` entry. Map, KartTrip, the invitation schedule, the post-round chain, the overlay and resume then work with no Map code (as for pizza and dino-puzzle).
- **Art:** a new builder `build_shadow_match.py` makes a bright cave mouth with the spec-3-3 triceratops and 6 catalogue items (Quaternius animals, Kenney vehicles). The spec-1-4 tools emit `atlas.shadow-match` (one page), `bg.shadow-match` and `shadow-match.layout.json`; a new generic render post-step derives each item's `shadow` frame from its `color` frame; `validateShadowMatch` and a measured-contrast rule check them.
- **Game:** `games/shadow-match` follows the pizza/dino model: pure `questions.ts`, `lines.ts`, `round.ts` with Vitest, and a thin `ShadowMatch.ts` scene that applies commands through DragController, HintDirector, AudioDirector and `MiniGameBase`.
- **Ladder:** temporary one level (2 shadows from different shape groups, 4 questions). Story 3.6 extends it.

## Boundaries & Constraints

**Always:**
- **Content** (`content/games/shadow-match.ts`, data only):
  - `SHAPE_ITEMS`: `{ id; shapeGroup; askName; name }[]` (Decisions table): `dog`, `cow`, `horse` (`quadruped`), `car` (`car`), `truck`, `tractor` (`truck`). `ItemId` and `ShapeGroup` are derived unions.
  - `ShadowLevel = { id; shadows: 2|3|4; questions: 4; groups: 'distinct' }`; `ladder = [{ id: 'shadows-2', shadows: 2, questions: 4, groups: 'distinct' }]`. Story 3.6 widens `groups` and adds levels.
  - `SHADOW_COUNTS = [2] as const` (the layout rows the builder must emit; 3.6 adds 3 and 4).
  - `FORBIDDEN_ITEM = /balloon|ball|flower|bóng|bông|hoa/i` (an item `id`, `askName` or `name` matching it fails).
  - `assets = { atlases: [ATLASES['shadow-match']], images: [BACKGROUNDS['shadow-match']], audio: [every vo.shadow-match.* line, every sfx.shadow-match.* id] }`; `screen` generated from `SHAPE_ITEMS × SHADOW_COUNTS` (ids and frames below).
  - A content test checks: every `ladder[i].shadows ∈ SHADOW_COUNTS`; `≥ questions` items exist; for every item at least `shadows − 1` items of another group exist; ids are distinct kebab; nothing matches `FORBIDDEN_ITEM` or `/t-?rex/i`.
- **Wake:** `stations.ts` `'shadow-match'.awake = true`; `GAME_CONTENT['shadow-match'] = { ladder, assets, screen }`; `GAMES['shadow-match'].scene = ShadowMatch`, scene key `'shadow-match'`. Every other sleeping station keeps its Epic 1 behaviour.
- **Art builder** (`tools/render/blender/build_shadow_match.py`, `npm run art:build -- shadow-match`; same invocation, temp-dir, naming and colour-argument rules as spec-1-4/3-1/3-3):
  - **Base scene:** `art/src/map-v2.blend`; remove `GameIce`, `HintRing`, the three station dinos and the `Cave` collection. Add camera `CamCave` (lens from `CamGame2`) aimed by named world-unit constants at a script-built cave mouth near the old `Cave` spot. Render 2048×1536.
  - **Cave mouth:** low-poly rock arch (displaced icospheres, flat shading) in `colors.caveMouth`; the inner back wall is a flat panel in `art.shadowMatch.caveInner`, lit, never black. Two flat rock **ledges** facing the camera, left and right of the mouth, in `colors.caveMouth` with emission `LEDGE_EMISSION` (named constant tuned until the measured-contrast rule passes). Shadows are drawn over the ledges.
  - **Triceratops:** Quaternius `dinosaurs/Triceratops.fbx` dressed exactly as spec-3-3 (`MATERIAL_ROLES['triceratops']`, builder eyes `EYES['triceratops']`), via a shared `common.py › dress_dino(…)` (see Decisions). Never import `Trex.fbx`/`Parasaurolophus.fbx` or an `*_Attack` action. It stands centre-back in the mouth, 3/4 front view, scaled so the trimmed longest side of `triceratops/idle/00` is `ui.trikeSizePx ± ui.trikeSizeTolerance`. Collection `sprite.triceratops` (`movable: true`), `states {"idle":[1],"nod":[10],"happy":[20,21]}`: 1 = `Triceratops_Idle` pose with `Head` pitched down `HEAD_OFFER_DEG` toward the hand point; 10 = idle with `Head` pitched a further −12°; 20–21 = idle with `Head` +10° and `Tail1` yawed ±15°. A missing action/bone prints one warning; frames are kept.
  - **Items:** `build.ts` passes the content ids (`--items dog,cow,…`); table `ITEM_MODELS[id] = (path, yaw_deg, action)`: dog `quaternius/animals/ShibaInu.fbx`, cow `…/Cow.fbx`, horse `…/Horse.fbx` (pose `AnimalArmature|Idle`), car `kenney_car-kit/Models/GLB format/sedan.glb`, truck `…/truck.glb`, tractor `…/tractor.glb`. An unknown id fails the build. FBX alpha forced to 1 and OPAQUE; source colours kept. Each item is posed in side profile at one staging spot `ITEM_STAGE` in its own `sprite.item-<id>` collection (`movable: true`, `silhouette: true`, `states {"color":[1]}`), scaled so its projected bbox longest side is `ui.shadowItemPx × renderScale` (computed from evaluated vertices with `world_to_camera_view`).
  - **Layout objects:** `anchor.triceratops` (ground pivot), `anchor.triceratops-hand` (ground point in front of its front feet, where the held item sits), `slot.shadow-<n>-<k>` for each `n ∈ SHADOW_COUNTS`, `k = 1..n` (points on the ledges from table `SHADOW_SPOTS[n]`; row 2 = one per ledge), `hit.cave` (projected inner-wall quad).
- **Render extension** (`tools/render/render.ts` + `tools/render/ghost.ts` of spec-3-3, generic): a collection with `silhouette: true` gets, after the Blender pass, `frames/<object>/shadow/00.png` from `<object>/color/00.png`: same canvas, RGB := `colors.shadowTarget`, alpha unchanged. So both frames share the exact trimmed rect and outline. Deterministic (byte-identical re-render).
- **Screen rules** (`tools/layout/rules.ts › validateShadowMatch(layout, atlasJson)`, run by `render`, `atlas`, `validate:content`; each message names the id). Item rect = trimmed `color` size ÷ renderScale; `shadowR` = max over items of longest side / 2; `heldR` = `shadowR × ui.shadowHeldScale`:
  - **Required:** every id above; frames `triceratops/{idle,nod}/00`, `triceratops/happy/00..01`, `item-<id>/{color,shadow}/00` for every item.
  - **Sizes:** `triceratops/idle/00` longest side within `trikeSizePx ± trikeSizeTolerance` and ≥ `character.minSize`; `|anchor.triceratops.x − 512| ≤ 1024/6`. Each item's longest side within `shadowItemPx ± shadowItemTolerance` and ≥ `shadowTarget.minSize`; × `shadowHeldScale` ≥ `draggableItem.minSize`; held hit diameter (`2·heldR + 2·draggableItem.hitPad`) ≥ `spacing.targetMin`. `color` and `shadow` trimmed rects are equal.
  - **Slots (per row n):** each circle (`shadowR`) inside the interactive rect and outside every `hudKeepOutRects()` rect (spec-3-1); pairwise centre distance ≥ `2·shadowR + spacing.targetGap`; centre-to-hand distance ≥ `shadowR + dropTarget.snapRadius × ui.hintSnapScale + heldR` (no item ever starts inside a snap zone, even at level 4).
  - **Hand:** the held circle (`heldR`) inside the interactive rect, outside the keep-out rects, `y ≥ 512` (lower third).
  - **Reveal area:** `(2·shadowR)² ≤ 0.25 × 1024 × 768`.
  - `bg.shadow-match` is 2048×1536.
- **Measured contrast** (`tools/lint/hint-contrast.ts`, extending spec-1-9/3-1; pure `shadowContrastProblems(bg, sites, color, min)` unit-tested): for every `slot.shadow-*` the 5th-percentile relative luminance of `bg.shadow-match` pixels inside the slot's `shadowR` square must give ≥ 5:1 against `colors.shadowTarget`; every pixel of `hit.cave` has relative luminance ≥ `ui.caveMinLuminance` (no dark area). Hint-ring sites: every `slot.shadow-*` circle and the hand circle (≥ 3:1 on one ring layer).
- **Questions** (`games/shadow-match/questions.ts › roundQuestions(seed, level) → { item: ItemId; shadows: ItemId[]; correctSlot: number }[]`, pure): clamp `level`; `rng = mulberry32(seed)`; held items = first `questions` of a Fisher–Yates over `SHAPE_ITEMS` (distinct in a round); decoys (`groups: 'distinct'`) = the first `shadows − 1` of a shuffle of items whose group differs from the held item's; `correctSlot` uniform over `[0, n)` excluding the previous question's slot; `shadows[correctSlot] = item`, decoys fill the other slots in shuffled order. No retry loops; deterministic.
- **Lines** (`lines.ts`, pure): `askLineId(i) = 'vo.shadow-match.ask.<i>'`, `nameLineId(i) = 'vo.shadow-match.name.<i>'`, `TRIKE_CALL = 'sfx.shadow-match.trike.happy'`. The retry line is the ask line (the director re-asks). A test asserts every reachable id exists in `VOICE_LINES` / `AUDIO_CATALOG`.
- **Round model** (`round.ts`, pure; inputs `drop(p, inside: readonly number[])`, `revealed()`, `speechEnded(tag)`; output an ordered command list). Geometry (slots of row n, hand point, `shadowR`) comes from layout + atlas. Shadow targets are `createDropTarget({ id: 'shadow-<k>', circle: { slot, r: snapRadius }, pad: shownR(k) })` (spec-3-1 `pad`; `shownR` = that shadow's longest side / 2), so `setSnapScale` applies; the scene passes the indices whose `contains(p)` is true.
- **Drop resolution**, first match wins:
  1. **`home`:** within `snapRadius/2` of the hand → settles, no hint.
  2. **`target`:** `inside` non-empty → pick the index with the smallest `|p − slot| − shownR` (tie → correct). Correct → `correct`; otherwise **`decoy`**: floats back to the hand over `draggableItem.return.durationMs`, then `hint.wrong()`.
  3. **`off`:** anywhere else → after `Timing.dragOffCounterReturnDelayMs` slides back to the hand over `return.durationMs`; not wrong; lifting again cancels.
- **`correct` outcome:** `sfx.shadow-match.snap` in the drop handler; `hint.questionDone()`; `questionIndex` advances; item locked; `holdAmbient('reveal', true)`. Then (scene tweens, scene clock): the item tweens its trimmed centre to the slot, scale → 1, alpha → 0 over `dropTarget.snap.durationMs` (ease-out) — it is "sucked in"; a `item-<id>/color/00` sprite on the slot cross-fades in while the shadow fades out over `Timing.shadowRevealMs` (monotonic alphas, no flash) → `revealed()` → triceratops `nod/00` for `Timing.trikeNodMs` with a bounce `1 → ui.trikeNodBounceScale → 1` around `anchor.triceratops` + `audio.sfx(TRIKE_CALL)` → after `Timing.trikeCallMs`, `audio.say(nameLineId(item))` (tag `name`).
  - On the name's `speech:ended` (completed or not): not last → revealed sprite and decoys fade over `sceneFadeMs`, the next item fades in at the hand and its shadows fade in over `Timing.shadowItemFadeMs`, `holdAmbient('reveal', false)`, `beginQuestion`. Last → `triceratops/happy/*` + `character.celebrate` bounce + `sfx.shadow-match.happy` (tune ~1.5 s), then `finishRound` after `Timing.roundCelebrationMs`. spec-1-10's Home-while-finishing applies from the last correct drop.
- **Hint step:** `{ correct: [item Draggable], distractors: [decoy shadow HintItems], target: correct shadow target, action: 'drag', focus: correct shadow HintItem }` (`HintItem = { object: shadow image }`, no `onLiftChange`). Each question begins with `hint.beginQuestion({ promptLineId: askLineId(item), retryLineId: askLineId(item), step })`. Level 2 = ring + bob on the correct shadow; level 3 = hand from the hand point to it; level 4 = decoys dimmed to `hintDimAlpha` + `setSnapScale(correct, 2)`. A drop on a dimmed decoy is still `decoy` (floats back, `wrong()`).
- **Entrance:** at `build()` the triceratops fades in (alpha 0 → 1) while rising `ui.trikeRisePx` → 0 over `Timing.trikeEnterMs` (ease-out); then the first item and shadows fade in and the first question begins.
- **Ambient:** the triceratops sways `±ui.trikeSwayDeg` around `anchor.triceratops` over `Timing.trikeSwayMs` (yoyo) via `addAmbient`; the base holds it at hint ≥ 2, the game during reveal and celebration.
- **Reduced motion:** amplitudes via `amplitude(…, reduced)`; no rise on entrance (fade only); no sway. Frame swaps and fades still play.
- **Snapshot/resume:** `progress()` = `{ questionIndex, partial: {} }`. With `resumeAt`, `build()` begins `resumeAt.questionIndex` clean (out of range → one warn, question 0). `resumeQuestion` and partial validation are Story 3.6.
- **Voice:** the game calls `audio.say` only for the name; prompts and retries go through `hint.*`. Tags map tokens; foreign tokens are ignored.

**Never:**
- No ladder levels beyond one, no 3/4-shadow rows, no `features` data, no `resumeQuestion` (Story 3.6). No difficulty logic in the game.
- No T-rex, fangs, roars, `*_Attack` poses; no balloons, balls or flowers in the catalogue. No red, ✗, shake, wrong sound, praise, "sai" or on-screen text. No dark cave interior. Flashing ≤ 1 Hz.
- No auto-placing the item. The hand only demonstrates.
- No `setTimeout`, `this.sound`, `this.load` or `scene.*` navigation in the game; no Epic 2 import; no hand-entered coordinates, magic numbers or hex in the game.
- No change to the layout JSON v1 format or to Map/KartTrip code.
- No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **Kebab ids:** the AC's `anchor.triceratops.hand` / `slot.shadow-match.*` become `anchor.triceratops-hand` / `slot.shadow-<n>-<k>` (spec-1-4 grammar, spec-3-1 note). One row of slots per shadow count, so 2 shadows can sit wider apart than 4.
- **No cat in the packs:** the AC example (mèo + ô tô) becomes dog + car. The catalogue uses only models present in `assets/` (verified 2026-10-08). Shiba as "con chó" is fine: it plays a different role from the ice-cream character.
- **"Holds"** for a quadruped = the item rests on the ground at `anchor.triceratops-hand`, in front of its feet, with the head lowered toward it.
- **Ring on the shadow, hand from the item:** spec-1-9 rings `correct[0].object`. This story adds an optional `HintStep.focus?: HintItem` (additive): when set, the level-2 ring and bob go on `focus.object`; the hand still demos `correct[0]` → `target`; restore covers it. Satisfies "ring + bóng nhún" without breaking existing callers.
- **Nearest-edge target pick** instead of "correct always wins": shadow zones overlap (pad + 100 px), so a drop right on a decoy must stay a decoy, while level 4's ×2 zone only adds forgiveness away from decoys.
- **Background drops slide back** (AC), not "stay put": the cave has no counter or lawn to rest on.
- **Reveal = sucked in, then colour cross-fade:** the item fades into the shadow during the 200 ms snap, then the shadow cross-fades to the item's colour frame over 400 ms. Shadow rects are ≤ 25 % of the screen by rule.
- **Shadow frames are derived, not rendered:** same alpha → identical outline (AC "cùng đường viền"), flat `shadowTarget` fill, no Blender lighting on the shadow.
- **Held items distinct in a round; decoys may recur** — a 4-shadow same-group level (3.6) cannot avoid it.
- **Retry = the ask line** (AC: "HintDirector nhắc lại câu hỏi"); no extra retry lines.
- **Shared dino dressing:** move spec-3-3's `MATERIAL_ROLES`, `EYES` and eye/lid code from `build_dino_puzzle.py` into `common.py › dress_dino(armature, meshes, species, colours)`; both builders call it (if 3.3 is built first, extract it now without changing its output).
- **No shared tap helper:** this is a drag game; spec-4-3's `TapTarget area` is not needed here.
- **Voice lines** (unapproved, none needs `review`; `keywordPauseMs: 300` wherever `|` appears):

  | item | `askName` | `vo.shadow-match.ask.<i>` | `vo.shadow-match.name.<i>` |
  |---|---|---|---|
  | dog | chó | "Bạn chó trốn ở cái \| bóng nào?" (7) | "Con chó!" |
  | cow | bò | "Bạn bò trốn ở cái \| bóng nào?" (7) | "Con bò!" |
  | horse | ngựa | "Bạn ngựa trốn ở cái \| bóng nào?" (7) | "Con ngựa!" |
  | car | ô tô | "Bạn ô tô trốn ở cái \| bóng nào?" (8) | "Ô tô!" |
  | truck | xe tải | "Bạn xe tải trốn ở cái \| bóng nào?" (8) | "Xe tải!" |
  | tractor | máy cày | "Bạn máy cày trốn ở cái \| bóng nào?" (8) | "Máy cày!" |

  Plus `vo.shell.invite.shadow-match` "Bé ơi, mình đi \| tìm bóng nhé!" (7) and `vo.shell.play-again-ask.shadow-match` "Chơi nữa với bạn ba sừng nhé?" (7). Name = one id through `say`.
- **SFX placeholders** (`make-placeholders.ts`; 50 ms fade-in, −20 dBFS peak, highpass 150 Hz, partials ≥ 300 Hz): `snap` soft "pụp" ~150 ms; `happy` major arpeggio ~1.5 s; `trike.happy` (`creature: true`) two soft chirps 659/784 Hz, 400 ms (same recipe as `sfx.dino-puzzle.triceratops.happy`). `npm run audio:check` (spec-3-3) covers it.
- **Play-again icon:** `PLAY_AGAIN_ICONS['shadow-match'] = { model: 'quaternius/dinosaurs/Triceratops.fbx', creature: 'creatureGreen' }`; re-render `atlas.map` for `icon/shadow-match/00`.
- **New values:** `art.shadowMatch.caveInner #F6EEDC`. `ui`: `trikeSizePx 300`, `trikeSizeTolerance 30`, `trikeRisePx 24`, `trikeSwayDeg 1.5`, `trikeNodBounceScale 1.06`, `shadowItemPx 150`, `shadowItemTolerance 10`, `shadowHeldScale 0.7`, `caveMinLuminance 0.35`. `Timing`: `trikeEnterMs 900`, `trikeSwayMs 3000`, `trikeNodMs 600`, `trikeCallMs 500`, `shadowRevealMs 400`, `shadowItemFadeMs 400`. A timing test pins `trikeEnterMs ≥ 800` and `trikeNodMs, trikeCallMs ≤ characterSoundMaxMs`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enter | `{level:0, seed:7}` | triceratops fades + rises 900 ms; item of `roundQuestions(7,0)[0]` fades in at the hand, 2 shadows on `slot.shadow-2-*`; `beginQuestion(ask.<i>, ask.<i>, step)` | — |
| Decoy | dog dropped on the car shadow | floats back 500 ms; `wrong()` → ask replayed; nothing revealed | — |
| Correct | dog dropped 90 px from the dog shadow's edge | "pụp"; `questionDone`; sucked in 200 ms; shadow → colour 400 ms; nod + bounce + chirp; "Con chó!" | — |
| Overlap | point in both zones, nearer the decoy's edge | `decoy` | — |
| Home | lifted and dropped within 50 px of the hand | settles; no hint | — |
| Off | dropped on the cave wall far from shadows | slides back after 1500 ms; not wrong; re-lift cancels | — |
| Level 2 | idle ~6 s | ring + bob on the correct shadow; sway stops | — |
| Level 3 | +6 s | hand drags from the hand point to the correct shadow | — |
| Level 4 | more wrongs | decoy 60 % alpha; correct zone ×2; drop on the dim decoy still floats back; nothing auto-placed | — |
| Speaker | any level | ask replayed; level kept | — |
| Next question | name `speech:ended`, not last | fades; new item + shadows; correct slot ≠ previous; level 0 | — |
| Round end | 4th name ends | happy frames + bounce + tune; one `round:complete {gameId:'shadow-match', questions:4, firstTryCorrect, maxHintLevel}` after 1500 ms; inert | — |
| Tally | q1 clean, q2 one decoy, q3 level 2, q4 clean | `firstTryCorrect 3`, `maxHintLevel 2` | — |
| Home mid-question | question 3 | one `round:abandon`; `progress()` = `{questionIndex:2, partial:{}}` | — |
| Home during last reveal | after the 4th correct drop | `round:complete`, never `round:abandon` | — |
| Resume | `resumeAt.questionIndex 2` | question 2's item and shadows; level 0 | — |
| Resume out of range | `questionIndex 9` | question 0 | console.warn once |
| Questions | same seed/level; seeds 0…999 | identical; 4 distinct held items; 2 distinct shadows from different groups; correct slot alternates | — |
| Reduced motion | `reduce` | fade-only entrance; no sway; small bounces | — |
| Missing frame | `triceratops/nod/00` absent | one warn; the step is skipped, timing kept | console.warn |
| Layout | a slot under Speaker, a shadow < 120 px, the hand inside a ×2 snap zone | render, atlas and check fail naming the id | exit 1 |
| Contrast | ledge rendered too dark (< 5:1) or a dark pixel in `hit.cave` | check fails naming the slot / screen | exit 1 |
| Catalogue | an item `ball` or name "bóng bay" | check fails naming it | exit 1 |

</intent-contract>

## Code Map

- `app/src/content/stations.ts`, `content/games/{types,index,pizza,dino-puzzle}.ts`, `games/registry.ts`, `games/mini-game-base.ts` -- planned in spec-1-5/1-7/1-8/1-10/2-5/3-1/3-3: `awake`, `GAME_CONTENT`, `GAMES`, `screen`, `hint` wrapper, `finishRound`, `addAmbient`/`holdAmbient`, `progress()`, `resumeAt`. Model to copy: `games/dino-puzzle/{questions,lines,round,DinoPuzzle}.ts`.
- `app/src/content/types.ts` -- real `GameId` (includes `'shadow-match'`); `SnapshotPartials['shadow-match'] = Record<string, never>` planned in spec-2-5.
- `app/src/core/input/{drag-controller,drop,guard}.ts` -- planned in spec-1-8/1-9/3-1 (`createDraggable`, `createDropTarget` with `pad`, `dragBounds`, `setPickable`, `setSnapScale`).
- `app/src/core/hint-director.ts`, `hint-machine.ts`, `hint-visuals.ts` -- planned in spec-1-9/3-1 (`HintStep`, `HintItem`, ring/bob/hand/dim). Add `HintStep.focus?`.
- `app/src/core/audio-director.ts`, `core/bus.ts` -- real `say`, `sfx`, `speech:ended`.
- `app/src/core/rng.ts › mulberry32`, `core/ui/sprite-pivot.ts`, `core/reduced-motion.ts`, `core/round-tally.ts` -- planned in spec-1-5/1-8/1-10.
- `app/src/content/voice-lines.ts`, `content/validate.ts`, `content/audio-catalog.ts` -- real; `review`/`BANNED_PHRASES` (spec-3-1) and `creature?` + subject audio ids (spec-3-3) planned.
- `app/tools/audio/make-placeholders.ts` -- real; `tools/audio/check-sfx.ts` planned in spec-3-3.
- `app/src/content/{assets,layouts,play-again}.ts` -- planned in spec-1-4/1-8/2-4.
- `app/tools/render/{build,render,ghost}.ts`, `tools/render/blender/{common,render_screen,build_dino_puzzle}.py`, `tools/atlas/pack.ts`, `tools/layout/{rules,hud-keep-out}.ts`, `tools/lint/{validate-content,hint-contrast}.ts` -- planned in spec-1-4/1-8/1-9/3-1/3-3.
- `app/src/core/timing.ts`, `core/tokens.ts`, `tokens.generated.ts` -- real `dragOffCounterReturnDelayMs`, `roundCelebrationMs`, `sceneFadeMs`, `characterSoundMaxMs`; `colors.{caveMouth,shadowTarget,creatureGreen}`, `components.{shadowTarget,draggableItem,dropTarget,character}`, `spacing.{targetMin,targetGap}`.
- Sources: `assets/quaternius/dinosaurs/Triceratops.fbx`, `assets/quaternius/animals/{ShibaInu,Cow,Horse}.fbx`, `assets/kenney/kenney_car-kit/Models/GLB format/{sedan,truck,tractor}.glb`, `art/src/map-v2.blend`.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/core/tokens.ts`, `app/src/core/timing.ts` (+ tests) -- `art.shadowMatch`, the new `ui` and `Timing` values and the timing test.
- [x] `app/src/core/hint-director.ts`, `hint-visuals.ts` (+ tests) -- `HintStep.focus`: ring + bob on `focus.object`, hand from `correct[0]`, restore on `questionDone`; unchanged without `focus`.
- [x] `app/src/content/voice-lines.ts`, `app/src/content/audio-catalog.ts`, `app/tools/audio/make-placeholders.ts` (+ test) -- 14 lines, 3 SFX (`trike.happy` with `creature: true`); generate with `npm run content:export && npm run tts && npm run audio:placeholders`.
- [x] `app/src/content/games/shadow-match.ts` (+ test), `content/games/index.ts`, `content/stations.ts`, `content/assets.ts`, `content/layouts.ts`, `content/play-again.ts` -- catalogue, ladder, wake, registration, icon.
- [x] `app/tools/render/blender/common.py`, `build_dino_puzzle.py` -- extract `dress_dino`; dino-puzzle output unchanged.
- [x] `app/tools/render/blender/build_shadow_match.py`, `render_screen.py`, `app/tools/render/build.ts` (+ test) -- builder, `--items`, colour args, `silhouette` prop passed through raw.json.
- [x] `app/tools/render/ghost.ts` (+ test), `app/tools/render/render.ts` -- `silhouetteFrame`; byte-identical re-render; equal trimmed rects.
- [x] `app/tools/layout/rules.ts` (+ test), `app/tools/lint/validate-content.ts` (+ test), `app/tools/lint/hint-contrast.ts` (+ test) -- `validateShadowMatch` with a failing case per rule, `FORBIDDEN_ITEM` catalogue rule, `shadowContrastProblems`, cave luminance and ring sites.
- [x] `app/src/content/generated/shadow-match.layout.json`, `public/assets/atlases/shadow-match.{png,json}`, `public/assets/bg/shadow-match.png`, re-rendered `atlas.map` -- produce with the real Blender; fix rule failures in builder constants (`LEDGE_EMISSION`, `SHADOW_SPOTS`, camera).
- [x] `app/src/games/shadow-match/questions.ts`, `lines.ts`, `round.ts` (+ tests) -- every matrix row except Phaser-only visuals, plus the lines coverage test.
- [x] `app/src/games/shadow-match/ShadowMatch.ts`, `app/src/games/registry.ts` -- scene: bg, triceratops entrance/sway/nod/happy, shadows, item draggable, targets with `pad`, reveal, tag → token map, resume start.
- [x] `app/README.md` -- provenance rows for Triceratops, ShibaInu, Cow, Horse, sedan, truck, tractor and the new audio.

**Acceptance Criteria:**
- Given a fresh `npm run dev` at 1180×820 touch emulation, when the child taps Hang tìm bóng, then it bounces, "Hang tìm bóng" plays, the kart drives there while `atlas.shadow-match`/`bg.shadow-match` load, and the cave opens with the green triceratops fading and rising in (≥ 0.8 s, never popping). Idle ~8 s on the island can invite this station with "Bé ơi, mình đi… tìm bóng nhé!".
- Given the real Blender, when running `art:build`, `render` and `atlas` for `shadow-match`, then `preview.png` shows a bright cave mouth (no black inside), a friendly green triceratops with eyes and pastel horns, two ledges, and the atlas is one page ≤ 2048² with `color` and `shadow` frames for 6 items; `npm run check` passes the layout, ≥ 5:1 shadow contrast and catalogue rules.
- Given the triceratops holds the dog, 2 shadows (dog + car) and "Bạn chó trốn ở cái bóng nào?" played, when the child drops the dog on the car shadow and then near the dog shadow, then it first glides back with the question replayed, then is sucked in, the shadow turns real-coloured softly, the triceratops nods and chirps, and "Con chó!" plays. A drop on bare rock glides back after ~1.5 s with no voice. No red, shake or error sound.
- Given ~6 s idle, then a ring pulses around the correct shadow and it bobs while the triceratops stops swaying; later a hand drags from the triceratops to it; after more wrong drops the decoy fades to 60 % and the correct shadow accepts from twice as far. Speaker replays the question without lowering the hint.
- Given the 4th name ends, then the triceratops does its happy pose with a short tune, and exactly one `round:complete { gameId: 'shadow-match', questions: 4 }` is emitted; the island returns with the kart at the cave. Home mid-round emits exactly one `round:abandon`. All of this works without Epic 2.
- Given `cd app && npm run check`, then it exits 0, and `npm run audio:check` passes `sfx.shadow-match.trike.happy`.

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
- **2026-10-10 (implementation): what changed from the spec, and why.**
  - **Tally row.** Core `RoundTally` (spec-1-10, unchanged) counts a question first-try only while its hint level stayed 0, so "q1 clean, q2 one decoy, q3 level 2, q4 clean" gives `firstTryCorrect 2`, not 3; the test asserts the core behaviour.
  - **`focus`** lives in `core/hint-machine.ts` (`HintStep.focus`, `ringItem(step)`); hint-visuals already rings any `HintItem.object`, so it needed no change.
  - **Commands.** `start()` and a resumed start both fade the first item in after the entrance; the snap sfx is a `snapSfx` command; the reveal waits for the suck-in tween in the scene.
  - **Art.** `CamCave` (6.6, 3.62, 1.32) → (6.6, 6.4, 0.86); arch of 10 stones + 7 back stones (radius 0.25/0.45), inner wall and floor emissive (`CAVE_INNER_EMISSION` 0.75, `ROCK_EMISSION` 0.45), ledges 0.52 × 0.8 m with `LEDGE_EMISSION` 0.9 (measured 5.93:1 / 6.36:1; darkest `hit.cave` pixel L 0.42). `hit.cave` is the wall inside the pillars (unpadded). Trike faces −78° at (6.46, 6.62); hand 0.62 m ahead → (508, 554); slots (150, 385) / (813, 385), 396 / 348 px from the hand (min 328.4). Atlas one page 1938×2003.
  - **Play-again icon.** `build_map.py` recolours the triceratops icon's `Purple` and draws it in its rest pose (its horns keep the source brown, as the island's own triceratops).
  - **`dress_dino`** moved to `common.py`; a dino-puzzle rebuild gave a byte-identical layout and frames within EEVEE noise.
  - **Determinism.** A second render gives a byte-identical layout; shadow frames are byte-identical for the same colour frame (tested), but EEVEE noise changes some colour frames' alpha between renders, so a re-rendered shadow frame may differ by a few pixels. The atlas is packed from one render.
## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | verification-gap | The scene's hint step (`focus` = the correct shadow, `distractors` = the other shadows, `target`, `correct[0]` = the held item) is untested; dropping `focus` restores the old ring-on-item behaviour with every test green | medium | `ShadowMatch.step()` is the only producer of `focus`; hint-machine tests build their own step | patch |
| 2 | blind, edge | The nod bounce counter and its idle-frame delayedCall keep running into `celebrate()`, so two scale counters fight and the idle frame snaps back mid-celebration | low | Reachable when the last name line is short or cut; direct fix | patch |
| 3 | blind | After `ask`, the round still emits `floatBack`, which would stop the suck-in tween and freeze the reveal | low | Unreachable today (`lockItem` destroys the drag), but the model emits a command that breaks the scene; direct guard | patch |
| 4 | blind | `FORBIDDEN_ITEM` has no word boundaries (`hoa` matches "khoai", `ball` matches "football") | low | Direct fix | patch |
| 5 | blind | The snap placeholder has no envelope and may click; the comment promises an exponential tail | low | Direct fix in the expression | patch |
| 6 | blind | The "dog" item renders `ShibaInu.fbx`, the Tiệm kem host Shiba, but is called "Bạn chó" | medium | Possible confusion for a child who knows Shiba; needs a human choice (another model, a recolour, or accept) | defer |
| 7 | blind | A `speech:ended` arriving synchronously with no `speech:line` before the token is mapped would leave the round waiting | maybe-false | Same `issuing` pattern as Pizza and Dino; the director emits `speech:line` before ending a played line | defer |
| 8 | verification-gap | `hintContrastProblems` wiring of the shadow-match rings and plate checks is never asserted | low | Pattern since Story 1.9; a small real-tree test would close it | defer |
| 9 | blind | ShadowMatch scene (suck-in → reveal, token tagging, disposal, reduced motion) untested | medium | No Phaser scene harness | defer |
| 10 | edge | Decoys could include two of one shape group at ≥ 3 shadows | low | Current ladder has 2 shadows; Story 3.6 adds 3–4 and must honour the group rule | reject |
| 11 | blind | Kenney glTF vehicles skip `force_opaque`, so shadows could have see-through windows | maybe-false | The composite preview showed solid shadows | reject |
| 12 | blind, edge | Ledge contrast samples a square, may clip at the plate edge, and assumes RGB | low | Measured 5.93 / 6.36:1 with margin | reject |
| 13 | blind | Only the idle trike frame is size-checked | low | Frames come from one fit | reject |
| 14 | blind | Reduced motion keeps the suck-in travel | low | Spec does not define a reduced-motion suck-in | reject |
| 15 | blind | Missing generated assets in the diff | false | Excluded from the review diff by size; present on disk | reject |
| 16 | blind, edge | Small harness gaps (stray describe, snap scale 20 test, `warned` not reset, `ITEM_MODELS` sync, zero-extent fit) | low | No failing behaviour shown | reject |

## Design Notes

**Command flow for a correct drop** (scene side):

```ts
onDrop(p) { for (const c of round.drop(p, targets.filter(t => t.contains(p)).map(t => t.index))) apply(c); }
// correct → sfx snap · questionDone · lockItem · suckIn{slot} · reveal{slot,item} → revealed()
// revealed() → trikeNod · sfx trike.happy · say{tag:'name', id, afterMs: trikeCallMs}
// name speech:ended → nextQuestion{index} | celebrate · finishRound{afterMs}
```

**Why `pad` on shadow targets:** a 150 px car shadow is long and low; "trong 100 px quanh bóng" is honest only when measured from the shape, so the hit radius is `shownR + 100 × snapScale`.

**Contrast budget:** flat `#5B4E96` on flat `#E9D8B4` is only ≈ 5.0:1, so any shading on the ledge fails. The ledge is lit by emission and the rule measures the real render; raise `LEDGE_EMISSION`, never change the tokens.

## Verification

**Commands:**
- `cd app && npm run content:export && npm run tts && npm run audio:placeholders` -- expected: 14 new `vo.*` and 3 `sfx.shadow-match.*` files; a second `tts` run skips them.
- `cd app && npm run audio:check` -- expected: exit 0, including `sfx.shadow-match.trike.happy`.
- `cd app && npm run art:build -- shadow-match && npm run render -- shadow-match && npm run atlas -- shadow-match` -- expected: exit 0; a second `render` gives a byte-identical layout and shadow frames.
- `cd app && npm run art:build -- dino-puzzle && npm run render -- dino-puzzle` -- expected: exit 0 and unchanged frames after the `dress_dino` extraction (if 3.3 is built).
- `cd app && npm run art:build -- map && npm run render -- map && npm run atlas -- map` -- expected: exit 0; `atlas.map` one page with `icon/shadow-match/00`.
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run build` -- expected: exit 0; `dist/assets/atlases/shadow-match.png` precached.

**Manual checks:**
- In `preview.png` and in game: the cave reads bright and friendly; each shadow is a clean purple-grey copy of its item's outline; the held item and shadows never sit under Home/Speaker.
- The reveal has no flash; with `prefers-reduced-motion` the triceratops only fades in and does not sway. Listen to the chirp: short, soft, no roar.
