---
title: 'Story 3.3 — Đánh thức công viên khủng long: ghép 3 mảnh cho khủng long sống dậy'
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
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-8-tiem-kem-keo-kem-dung-vi-cho-shiba.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-9-goi-y-leo-thang.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-tiem-kem-luot-3-5-cau-do-kho-tang-dan.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-pipeline-hinh-render-blender-atlas-layout.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-danh-muc-trang-tri-o-tren-dao-reward-service.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-giu-luot-do-trong-phien.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** After Story 3.2 the Công viên khủng long station is still asleep (bounce + happy sound only). There is no dino-puzzle scene, art, layout, voice or creature sound, so FR18/FR19 are unmet: the child cannot drag pieces onto a ghost silhouette and watch a gentle dinosaur come alive.

**Approach:**
- **Wake:** register `dino-puzzle` in `content/games/index.ts` (and so `games/registry.ts`), flip `awake` in `content/stations.ts`, and add the invite / play-again lines and a `PLAY_AGAIN_ICONS` entry. Map, KartTrip, the invitation schedule, the post-round chain, the overlay and resume then work with no Map code (as for pizza).
- **Art:** a new builder `build_dino_puzzle.py` imports the three Quaternius dinos, recolours them, cuts each into 3 pieces by bone data and adds layout objects. The spec-1-4 tools emit `atlas.dino-puzzle` (multi-page, see Decisions), `bg.dino-puzzle` and `dino-puzzle.layout.json`; `validateDinoPuzzle` checks them. A new render post-step draws the ghost frames (`ghost-fill` 35 % + 4 px dashed white line).
- **Game:** `games/dino-puzzle` follows the pizza model: pure `questions.ts`, `lines.ts`, `round.ts` with Vitest, and a thin `DinoPuzzle.ts` scene that applies commands through DragController, HintDirector, AudioDirector and `MiniGameBase`.
- **Ladder:** temporary one level (3 pieces, 3 dinos). Story 3.4 extends it.

## Boundaries & Constraints

**Always:**
- **Content** (`content/games/dino-puzzle.ts`, data only):
  - `SPECIES = ['apatosaurus', 'triceratops', 'stegosaurus'] as const` (spoken: cổ dài, ba sừng, phiến lưng).
  - `PIECES = { 3: ['head-neck', 'body-legs', 'tail'] } as const`; the array order is the hint order. Story 3.4 adds keys 4 and 6.
  - `DinoLevel = { id; pieces: 3|4|6; dinos: 3 }`, `ladder = [{ id: 'pieces-3', pieces: 3, dinos: 3 }]`.
  - `assets = { atlases: [ATLASES['dino-puzzle']], images: [BACKGROUNDS['dino-puzzle']], audio: [every vo.dino-puzzle.* line, every sfx.dino-puzzle.* id] }`.
  - `screen`: the required layout ids and frames below, generated from `SPECIES × PIECES[3]`.
  - A content test checks every `ladder[i].pieces` is a key of `PIECES`, `dinos ≤ SPECIES.length`, and no id in `SPECIES` or any piece/asset path matches `/t-?rex/i`.
- **Wake:** `stations.ts` `'dino-puzzle'.awake = true`; `GAME_CONTENT['dino-puzzle'] = { ladder, assets, screen }`; `GAMES['dino-puzzle'].scene = DinoPuzzle` with scene key `'dino-puzzle'`. Every other sleeping station keeps its spec-1-5/1-7 behaviour.
- **Art builder** (`tools/render/blender/build_dino_puzzle.py`, `npm run art:build -- dino-puzzle`; same invocation, temp-dir, naming and colour-argument rules as spec-1-4/1-8/3-1):
  - **Base scene:** start from `art/src/map-v2.blend`. Remove `GameIce`, `HintRing` and the three station dinos (keep the fence). Add camera `CamDino` (lens from `CamGame2`) aimed by named world-unit constants at a lawn beside the dino-park fence, horizon in the top fifth. Render 2048×1536.
  - **Dinos:** Quaternius `dinosaurs/{Apatosaurus,Triceratops,Stegosaurus}.fbx`, alpha forced to 1 and OPAQUE. Never import `Trex.fbx` or `Parasaurolophus.fbx`, never use an `*_Attack` action. All three stand at the same world spot `DINO_SPOT`, in 3/4 side view facing `DINO_FACING`, scaled so the trimmed longest side of `<s>/idle/00` is `ui.dinoSizePx ± ui.dinoSizeTolerance`.
  - **Recolour** by material-name table `MATERIAL_ROLES` (FBX materials, verified 2026-10-08):

    | species | body | belly/feet | accent |
    |---|---|---|---|
    | apatosaurus | `Brown` → `creatureBlue` | `Material` → `art.dino.apatosaurusBelly` | — |
    | triceratops | `Purple` → `creatureGreen` | `LightBrown` → `art.dino.triceratopsBelly` | `Brown` (horns/frill) → `art.dino.horn` |
    | stegosaurus | `DarkBrown` → `creatureOrange` | `LightBrown` → `art.dino.stegosaurusBelly` | `Brown` (plates) → `creaturePink` |

    An unknown material becomes body colour with one warning. No grey or brown source colour survives.
  - **Eyes:** the FBX have none. The builder adds per species two eyes (white sphere + dark pupil, flat materials) parented to the `Head` bone, offsets in table `EYES`.
  - **Frames** on the `sprite.<s>` collection (`movable: true`, so no baked shadow): `states {"idle":[1],"blink":[2],"happy":[10,11],"walk":[20,21,22,23]}`.
    - 1: pose from the action ending `<Species>_Idle` (missing → rest pose + one warning).
    - 2: idle pose, pupils hidden, flattened lid discs in body colour.
    - 10–11: idle pose with `Head` pitched +10° and `Tail1` yawed ±15°.
    - 20–23: four evenly spaced frames of `<Species>_Walk` with the `root` location zeroed (in place).
  - **Pieces:** at frame 1 the posed mesh is applied to a static copy and split by `PIECE_BONES[pieceId]`. A face goes to the piece holding the majority of its vertices' dominant bone. `head-neck` = `Neck, Head, Head_end`; `tail` = `Tail1…Tail5_end`; `body-legs` = every other bone. Each piece's open boundary is filled (`holes_fill`) and its eyes go with `head-neck`. Each piece is collection `sprite.<s>-<p>` (`movable: true`, `ghost: true`), rendered in place, so an untrimmed piece frame lines up pixel-for-pixel with the whole dino. `build.ts` passes the content piece ids; an unknown id fails the build.
  - `sprite.<s>` also gets `ghost: true`.
  - **Clouds:** `sprite.cloud-1`, `sprite.cloud-2` (3 white flat icospheres each, `movable: true`) in the sky strip, with `anchor.cloud-1/2`.
  - **Layout objects** (kebab ids per spec-3-1's note): per species `anchor.<s>` (ground pivot), `anchor.<s>-walk` (= pivot + `WALK_DISTANCE_M` along the facing), per piece `slot.<s>-<p>` (projected centre of the piece's evaluated vertices) and `anchor.<s>-<p>-start` (ground points from table `START_SPOTS`: head-neck left of the ghost, tail right, body-legs below), plus `hit.grass` (the projected lawn quad `LAWN_RECT_M`).
- **Render extension** (`tools/render/render.ts` + new `tools/render/ghost.ts`, generic): for a collection with `ghost: true`, after the Blender pass, derive `frames/<object>/ghost/00.png` from `<object>/idle/00.png`:
  - `traceOuterContours(alpha, w, h, 128)` (marching squares, every outer component), `simplify(ε = 1 px)`;
  - `ghostSvg(contours, w, h)`: fill `ghostSlot.fill` at `ghostSlot.fillOpacity`, stroke `ghostSlot.line.color` width `line.width × renderScale`, dash `ui.ghostDash` × renderScale; rasterised full-canvas with sharp. Deterministic: a re-render is byte-identical.
- **Atlas pages:** `tools/atlas/pack.ts` gains `SCREEN_MAX_PAGES = { 'dino-puzzle': 4 }` (default 1, every existing screen unchanged). Multi-page screens write `dino-puzzle-<n>.png` and one `dino-puzzle.json` in Phaser multiatlas format. Each page ≤ 2048², each file ≤ 8 MiB; more pages than allowed → fail, no write. `AtlasRef.pages?: number`; `core/game-assets.ts › loadPlan` emits `multiatlas` when `pages > 1`, and Map's loader calls `load.multiatlas`. The check gate validates every page.
- **Screen rules** (`tools/layout/rules.ts › validateDinoPuzzle(layout, atlasJson)`, run by `render`, `atlas` and `validate:content`; each message names the id). Piece rect = trimmed frame size ÷ renderScale centred at a point; piece r = max side / 2:
  - **Required:** every id above and every frame `<s>/{idle,blink}/00`, `<s>/happy/00..01`, `<s>/walk/00..03`, `<s>/ghost/00`, `<s>-<p>/{idle,ghost}/00`, `cloud-1|2/idle/00`.
  - **Sizes:** `<s>/idle/00` longest side within `dinoSizePx ± dinoSizeTolerance` and ≥ `character.minSize`; each piece's longest side ≥ `draggableItem.minSize`.
  - **Slots:** `slot.<s>-<p>` within `ui.dinoSlotTolerancePx` of the piece frame's trimmed centre.
  - **Starts:** each piece rect at its start lies inside the interactive rect, outside every `hudKeepOutRects()` rect (spec-3-1), and its centre inside `hit.grass`; pairwise rect gap ≥ `spacing.gap`; no overlap with the `<s>/ghost/00` rect grown by `spacing.gap`; start centre ≥ `dropTarget.snapRadius` from every slot of its species.
  - **Walk:** `|anchor.<s>-walk − anchor.<s>| ≤ ui.dinoWalkMaxPx`; the idle rect shifted by that vector stays inside `Tokens.safeRect`.
  - `bg.dino-puzzle` is 2048×1536.
- **Questions** (`games/dino-puzzle/questions.ts › roundSpecies(seed, level) → SpeciesId[]`, pure): clamp `level`; Fisher–Yates over `SPECIES` with `mulberry32(seed)`; first `ladder[level].dinos`. Deterministic; distinct.
- **Lines** (`lines.ts`, pure): `ASK_LINE = 'vo.dino-puzzle.ask'`, `RETRY_LINE = 'vo.dino-puzzle.retry'`, `nameLineId(s) = 'vo.dino-puzzle.name.<s>'`, `callSfxId(s) = 'sfx.dino-puzzle.<s>.happy'`. A test asserts every id exists in `VOICE_LINES` / `AUDIO_CATALOG`.
- **Round model** (`round.ts`, pure; inputs `lift(pieceId)`, `drop(pieceId, p)`, `speechEnded(tag)`; output an ordered command list). Geometry (slots, starts, grass polygon, piece radii) comes from the layout; slot targets are `createDropTarget({ id: 'slot-<p>', circle: { slot, r: snapRadius } })`, so `setSnapScale` applies.
- **Drop resolution for a loose piece**, first match wins:
  1. **`own`:** inside its own slot target → snap, even when the point is also inside another slot's zone.
  2. **`home`:** within `snapRadius/2` of its pre-lift position → settles, no hint.
  3. **`other`:** inside any other slot target of the current dino (filled or not) → floats back to its pre-lift position over `draggableItem.return.durationMs`, then `hint.wrong()`.
  4. **`rest`:** inside `hit.grass` → stays at `nudgeApart(p, other loose piece centres, r(this) + max r(others), grass bbox ∩ dragBounds)`; that becomes its pre-lift position.
  5. **`off`:** anywhere else → after `Timing.dragOffCounterReturnDelayMs` slides back to its pre-lift position; lifting again cancels.
- **`own` outcome:** `sfx.dino-puzzle.snap` in the drop handler; the piece tweens its trimmed centre to its frame-aligned position over `dropTarget.snap.durationMs` (ease-out, 1.05× bounce) and locks (`setPickable` false). Its real colours now cover that part of the ghost.
  - Not the last piece: `hint.stepDone(stepFor(firstUnplaced))`, level kept.
  - Last piece: `hint.questionDone()`, `questionIndex` advances, every piece locked, `holdAmbient('alive', true)`, then `comeAlive`.
- **Hint step:** `{ correct: [the piece's Draggable], distractors: [], target: its slot target, action: 'drag' }` for the first unplaced piece in `PIECES` order. Each dino begins with `hint.beginQuestion({ promptLineId: ASK_LINE, retryLineId: RETRY_LINE, step })`. Level 4 therefore dims nothing and only `setSnapScale(slot, 2)`.
- **Slot highlight:** while `hint:level ≥ 2` (own key, `bus.scoped(this)`), the scene shows `<s>-<p>/ghost/00` (frame-aligned, alpha 1) for the hinted piece; it moves on `stepDone` and hides on level < 2 or `questionDone`. Static, no blink.
- **Come alive** (scene tween chain, scene clock): swap the ghost and pieces for `<s>/idle/00` (same pixels) → `blink/00` for `Timing.dinoBlinkMs` → bounce `character.celebrate` around `anchor.<s>` → walk: `walk/00..03` every `Timing.dinoWalkFrameMs` while moving to `anchor.<s>-walk` over `Timing.dinoWalkMs` → `happy/00..01` + `audio.sfx(callSfxId(s))` → after `Timing.dinoCallMs`, `audio.say(nameLineId(s))` (tag `name`).
  - On the name's `speech:ended` (completed or not): not last → the dino fades over `sceneFadeMs`, the next dino's ghost and pieces fade in over `Timing.dinoNextFadeMs`, `holdAmbient('alive', false)`, `beginQuestion`. Last → bounce again + `sfx.dino-puzzle.happy` (tune ~1.5 s), then `finishRound` after `Timing.roundCelebrationMs`. spec-1-10's Home-while-finishing applies from the last piece's snap.
- **Ambient:** clouds drift `±ui.dinoCloudDriftPx` in x over `Timing.dinoCloudDriftMs` (yoyo) via `addAmbient`; the base holds it at hint ≥ 2.
- **Reduced motion:** amplitudes through `amplitude(…, reduced)`; the walk becomes an on-the-spot hop `1 → ui.dinoReducedHopScale → 1` with the idle frame and no translation; clouds stay still.
- **Snapshot/resume:** `progress()` = `{ questionIndex, partial: { placed: <pieceIds in placement order> } }`. With `resumeAt`, `build()` begins `resumeAt.questionIndex` clean (out of range → one warn, dino 0). Restoring `placed` is Story 3.4.
- **Voice:** the game calls `audio.say` only for the name; prompts and retries go through `hint.*`. Tags map tokens; foreign tokens are ignored.

**Never:**
- No ladder levels beyond one, no 4/6-piece cuts, no `placed` restore, no seed-shuffled start spots (Story 3.4). No difficulty logic in the game.
- No T-rex, fangs, claws, roars, `*_Attack` poses. No red, ✗, shake, wrong sound, praise, "sai" or on-screen text. Flashing ≤ 1 Hz.
- No auto-placing a piece. The hand only demonstrates. No rotation of pieces.
- No `setTimeout`, `this.sound`, `this.load` or `scene.*` navigation in the game; no Epic 2 import; no hand-entered coordinates, magic numbers or hex in the game.
- No change to the layout JSON v1 format or to Map/KartTrip code beyond the multiatlas load call.
- No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **Kebab ids:** the AC's `slot.<species>.<piece>` / `anchor.<species>.<piece>.start` become `slot.<s>-<p>` / `anchor.<s>-<p>-start` (spec-1-4 grammar, spec-3-1 note). Species ids are the asset names.
- **Pieces are cut by bone weights**, so 3.4's 4/6 cuts only add `PIECE_BONES` rows and no hand-made geometry.
- **Frame-aligned snapping:** pieces and the whole dino are rendered in place, so a placed piece sits at its untrimmed origin and the "come alive" swap is pixel-identical. The slot id is the snap-target centre only; a rule ties it to the frame's trimmed centre.
- **Ghost frames come from a traced contour rasterised by sharp** (SVG `stroke-dasharray`), because Blender cannot draw a 2D dashed outline. Per-piece ghost frames give the AC's "ô sáng nét đứt" at hint level 2.
- **Multi-page atlas for this screen only:** 3 species × (idle, blink, 2 happy, 4 walk, ghost) + 6 piece frames at renderScale 2 cannot fit one 2048² page; the AC caps each page, not the page count. 4 pages ≈ 64 MB of texture, acceptable on the target iPads. Story 3.4's 4/6-piece frames must fit the same cap or reduce `walk` to 2 frames.
- **Wrong slot includes filled slots**, so any drop on another part of the ghost is gently "wrong"; the own-slot-wins and own-home checks come first, so a level-4 ×2 zone never turns a re-drop into a mistake.
- **Off area = outside `hit.grass`**; drags are already clamped to `dragBounds`, so "outside" means the fence, trees or sky.
- **Name and creature call are game voice/sound** (feedback, like pizza's count); `questionDone` fires at the last snap (spec-1-9/1-10 order).
- **Eyes and blink are builder-made** because the FBX have no eye geometry (inspected 2026-10-08).
- **T-rex anywhere:** UX-DR75 bans T-rex app-wide, but spec-2-2's catalogue lists decoration `t-rex` (Trex.fbx) at this station. This story replaces it with `pineapple` (Kenney food-kit `pineapple.glb`) and re-renders `atlas.map`; a saved `t-rex` grant is skipped by 2.2's unknown-id rule (one warn). `validate:content` gains a rule: no file under `src/content/` or `tools/render/blender/` references `/trex|t-rex/i` (except the rule's own pattern).
- **Creature-sound check:** new `tools/audio/check-sfx.ts` (`npm run audio:check`) runs ffmpeg on every catalog entry with `creature: true`: duration ≤ 800 ms; energy below 150 Hz (`lowpass=150`, `volumedetect`) ≤ −40 dBFS max; `max_volume` ≤ −18 dBFS (below the −16 LUFS voice); the first 10 ms RMS ≥ 20 dB below the peak (fade-in ≥ 50 ms). Parsers are pure and tested on canned output. It is not part of `check` (needs ffmpeg); it is a Verification command.
- **Audio ids** may carry a subject segment (`sfx.dino-puzzle.<s>.happy`); `validate-content`'s audio id rule is widened like the voice id rule.
- **Voice lines** (unapproved, none needs `review`):

  | id | text | words |
  |---|---|---|
  | `vo.dino-puzzle.ask` | "Mình ghép bạn \| khủng long nào!" | 6 |
  | `vo.dino-puzzle.retry` | "Mình thử \| chỗ khác nhé!" | 5 |
  | `vo.dino-puzzle.name.apatosaurus` / `.triceratops` / `.stegosaurus` | "Khủng long \| cổ dài!" / "… \| ba sừng!" / "… \| phiến lưng!" | 4 |
  | `vo.shell.invite.dino-puzzle` | "Bé ơi, mình ghép \| khủng long nhé!" | 7 |
  | `vo.shell.play-again-ask.dino-puzzle` | "Chơi nữa với bạn khủng long nhé?" | 7 |

  `keywordPauseMs: 300` wherever `|` appears.
- **SFX placeholders** (`make-placeholders.ts`; 50 ms fade-in, −20 dBFS peak, highpass 150 Hz, partials ≥ 300 Hz): `snap` soft "pụp" ~150 ms; `happy` major arpeggio ~1.5 s; creature calls (`creature: true`): apatosaurus soft two-note hoot 392→330 Hz 600 ms, triceratops two chirps 659/784 Hz 400 ms, stegosaurus trill 523 Hz ±30 Hz 500 ms.
- **Play-again icon:** `PLAY_AGAIN_ICONS['dino-puzzle'] = { model: 'quaternius/dinosaurs/Apatosaurus.fbx', creature: 'creatureBlue' }`.
- **Hint contrast:** `hint-contrast.ts` gains the `dino-puzzle` sites: each piece rect at its start on `bg.dino-puzzle`.
- **New values:** `art.dino`: apatosaurusBelly `#CFEFFF`, triceratopsBelly `#D7F2C9`, stegosaurusBelly `#FFE2C2`, horn `#FFF3D6`. `ui`: `dinoSizePx 360`, `dinoSizeTolerance 40`, `dinoWalkMaxPx 120`, `dinoSlotTolerancePx 3`, `dinoCloudDriftPx 24`, `dinoReducedHopScale 1.04`, `ghostDash [12, 8]`. `Timing`: `dinoBlinkMs 160`, `dinoWalkMs 1200`, `dinoWalkFrameMs 150`, `dinoCallMs 800`, `dinoNextFadeMs 500`, `dinoCloudDriftMs 8000`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enter | `{level:0, seed:7}` | ghost of `roundSpecies(7,0)[0]`, 3 pieces at their starts, clouds drifting; `beginQuestion(ask, retry, step(head-neck))` | — |
| Own slot | body-legs dropped 80 px from its slot | "pụp" in handler; 200 ms snap + 1.05× bounce; locked; `stepDone(step(head-neck))` | — |
| Other slot | body-legs dropped on the head-neck slot | floats back 500 ms; `wrong()` → "Mình thử chỗ khác nhé!"; nothing placed | — |
| Overlap | point inside both own and another slot zone | snaps to own | — |
| Hinted vs other | ring on head-neck, child places tail | counted; next step stays head-neck; level kept | — |
| Home | lifted and dropped within 50 px | settles; no hint | — |
| Rest | dropped on grass away from slots | stays, nudged clear of other loose pieces | — |
| Off | dropped on the fence/sky | slides back after 1500 ms; re-lift cancels | — |
| Level 2 | idle ~6 s | ring on first unplaced piece + its dashed slot highlight; clouds stop | — |
| Level 4 | more wrongs | hand demo; slot snap ×2; no piece dimmed; nothing auto-placed | — |
| Last piece | 3rd piece snaps | `questionDone`; blink → bounce ×2 → walk ≤ 120 px → call → "Khủng long cổ dài!"; next dino fades in 500 ms | — |
| Reduced motion | `reduce` | small bounces; hop in place instead of walk; clouds still | — |
| Round end | 3rd dino named | bounce + tune; one `round:complete {gameId:'dino-puzzle', questions:3, firstTryCorrect, maxHintLevel}` after 1500 ms; inert | — |
| Tally | dino 1 clean, dino 2 one wrong, dino 3 reaches level 2 | `firstTryCorrect 1`, `maxHintLevel 2` | — |
| Home mid-dino | 2 of 3 placed on dino 2 | one `round:abandon`; `progress()` = `{questionIndex:1, partial:{placed:[…2 ids]}}` | — |
| Home during last come-alive | after last snap | `round:complete`, never `round:abandon` | — |
| Resume | `resumeAt.questionIndex 2` | dino 2 begins clean; level 0 | — |
| Resume out of range | `questionIndex 5` | dino 0 | console.warn once |
| Questions | same seed/level; seeds 0…99 | identical; 3 distinct species; all 6 orders occur | — |
| Missing frame | `<s>/blink/00` absent | one warn; the sequence skips that step, timing kept | console.warn |
| Layout | a start inside a HUD keep-out, a piece < 90 px, walk 140 px | render, atlas and check fail naming the id | exit 1 |
| Atlas | frames need 5 pages | atlas fails, no write | exit 1 |
| Scary asset | a content/builder file names `Trex.fbx` | check fails naming the file | exit 1 |
| Creature sound | a call 1.0 s long or with a 100 Hz hum | `audio:check` fails naming the id | exit 1 |

</intent-contract>

## Code Map

- `app/src/content/stations.ts`, `content/games/{types,index,pizza}.ts`, `games/registry.ts`, `games/mini-game-base.ts` -- planned in spec-1-5/1-7/1-8/1-10/2-5/3-1: `awake`, `GAME_CONTENT`, `GAMES`, `screen`, `hint` wrapper, `finishRound`, `addAmbient`/`holdAmbient`, `progress()`, `resumeAt`. Model to copy: `games/pizza/{questions,lines,round,Pizza}.ts` (planned in spec-3-1/3-2).
- `app/src/core/input/{drag-controller,drop,guard}.ts` -- planned in spec-1-8/1-9/3-1 (`createDraggable`, `createDropTarget` with `pad`, `nudgeApart`, `dragBounds`, `setPickable`, `setSnapScale`).
- `app/src/core/hint-director.ts`, `hint-visuals.ts` -- planned in spec-1-9/3-1 (`HintItem`, one-live ring, hand, dim).
- `app/src/core/audio-director.ts`, `core/bus.ts` -- real `say`, `sfx`, `speech:ended`; `speech:line` planned in spec-3-1.
- `app/src/core/rng.ts › mulberry32`, `core/ui/sprite-pivot.ts`, `core/reduced-motion.ts`, `core/round-tally.ts` -- planned in spec-1-5/1-8/1-10.
- `app/src/core/game-assets.ts` (`loadPlan`, `AtlasRef`), `scenes/Map.ts` loader -- planned in spec-1-7/1-8. Add `multiatlas`.
- `app/src/content/voice-lines.ts`, `content/validate.ts` -- real (`VOICE_LINES`, `voiceWords`, `BANNED_PAIRS`); `review`/`BANNED_PHRASES` planned in spec-3-1.
- `app/src/content/audio-catalog.ts`, `tools/audio/make-placeholders.ts` -- real. Add `creature?` and 5 ids; new `tools/audio/check-sfx.ts`.
- `app/src/content/play-again.ts` (spec-2-4), `content/decorations.ts` + `tools/render/blender/build_map.py` decoration table (spec-2-2) -- the icon entry and the `t-rex` → `pineapple` swap.
- `app/src/content/{assets,layouts}.ts`, `tools/render/{build,render}.ts`, `tools/render/blender/{common,render_screen}.py`, `tools/atlas/pack.ts`, `tools/layout/{rules,hud-keep-out}.ts`, `tools/lint/{validate-content,hint-contrast}.ts` -- planned in spec-1-4/1-8/1-9/3-1.
- `app/src/core/timing.ts`, `core/tokens.ts`, `tokens.generated.ts` -- real `dragOffCounterReturnDelayMs`, `roundCelebrationMs`, `sceneFadeMs`, `components.{ghostSlot,draggableItem,dropTarget,character}`, `colors.creature*`.
- Sources: `assets/quaternius/dinosaurs/{Apatosaurus,Triceratops,Stegosaurus}.fbx` (bones `root, Body, Hips, Torso, Shoulders, Neck, Head, Tail1–5, *Leg*, *Foot*`; actions `Armature|Armature|<Species>_{Idle,Walk,…}`; the Apatosaurus file also carries a stray `Stegosaurus_Death`), `assets/kenney/kenney_food-kit/Models/GLB format/pineapple.glb`, `art/src/map-v2.blend`.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/core/tokens.ts`, `app/src/core/timing.ts` (+ tests) -- `art.dino`, the new `ui` and `Timing` values.
- [x] `app/src/content/voice-lines.ts`, `app/src/content/audio-catalog.ts`, `app/tools/audio/make-placeholders.ts` (+ test), `app/src/content/validate.ts` (+ test) -- 7 lines, 5 SFX with `creature`, the widened audio id rule; generate with `npm run tts && npm run audio:placeholders`.
- [x] `app/tools/audio/check-sfx.ts` (+ test), `app/package.json` -- `audio:check` and its pure parsers.
- [x] `app/src/content/games/dino-puzzle.ts` (+ test), `content/games/index.ts`, `content/stations.ts`, `content/assets.ts`, `content/layouts.ts`, `content/play-again.ts` -- content, wake, registration, icon.
- [x] `app/src/content/decorations.ts`, `app/tools/render/blender/build_map.py` -- replace `t-rex` with `pineapple`; re-render `map`.
- [x] `app/tools/render/blender/build_dino_puzzle.py`, `render_screen.py`, `app/tools/render/build.ts` (+ test) -- the builder, piece ids and colour args; `ghost` prop passed through raw.json.
- [x] `app/tools/render/ghost.ts` (+ test), `app/tools/render/render.ts` -- contour, simplify, SVG ghost frames; byte-identical re-render.
- [x] `app/tools/atlas/pack.ts` (+ test), `app/src/core/game-assets.ts` (+ test), `app/src/scenes/Map.ts` -- multi-page packing, multiatlas JSON, `pages`, `load.multiatlas`.
- [x] `app/tools/layout/rules.ts` (+ test), `app/tools/lint/validate-content.ts` (+ test), `app/tools/lint/hint-contrast.ts` (+ test) -- `validateDinoPuzzle` with a failing case per rule, the page checks, the no-T-rex rule, the contrast sites.
- [x] `app/src/content/generated/dino-puzzle.layout.json`, `public/assets/atlases/dino-puzzle{.json,-0..n.png}`, `public/assets/bg/dino-puzzle.png`, re-rendered `atlas.map` -- produce with the real Blender; fix rule failures in builder constants.
- [x] `app/src/games/dino-puzzle/questions.ts`, `lines.ts`, `round.ts` (+ tests) -- every matrix row except Phaser-only visuals.
- [x] `app/src/games/dino-puzzle/DinoPuzzle.ts`, `app/src/games/registry.ts` -- scene: bg, clouds, ghost, piece draggables, slot targets, highlight, come-alive chain, tag → token map, resume start.
- [x] `app/README.md` -- provenance rows for the three dinos, `pineapple.glb` and the new audio.

**Acceptance Criteria:**
- Given a fresh `npm run dev` at 1180×820 touch emulation, when the child taps Công viên khủng long, then it bounces, the name plays, the kart drives there while `atlas.dino-puzzle`/`bg.dino-puzzle` load, and the puzzle opens. Idle ~8 s on the island can invite this station with "Bé ơi, mình ghép… khủng long nhé!".
- Given the real Blender, when running `art:build`, `render` and `atlas` for `dino-puzzle`, then `preview.png` shows a blue long-neck, green triceratops and orange stegosaurus (no grey/brown, no teeth or claws) on a bright lawn with three piece starts around the ghost, and every atlas page is ≤ 2048² and ≤ 8 MiB.
- Given the ghost of a long-neck and "Mình ghép bạn khủng long nào!" played, when the child drops the body piece on the head slot and then on its own slot, then it first glides back with only "Mình thử chỗ khác nhé!", then snaps with "pụp" and that part turns real-coloured.
- Given ~6 s idle on a dino, then a ring circles the first unplaced piece, its slot shows a dashed outline and the clouds stop; later a hand drags it; no piece ever fades and nothing is placed for the child.
- Given the last piece snaps, then the dino blinks, bounces twice, walks a few steps, chirps softly and the name plays ("Khủng long cổ dài!"); the next dino fades in. After the third, exactly one `round:complete { gameId: 'dino-puzzle', questions: 3 }` is emitted and the island returns with the kart at the park.
- Given `cd app && npm run check`, then it exits 0, and `npm run audio:check` passes every creature sound.

## Spec Change Log

- **2026-10-09 (before implementation): Epic 2 APIs that every new game must follow.** Epic 2 was built after this spec was written; read the current code, not only older specs.
  - **Game base and resume (Story 2.5).** `MiniGameBase<G>` builds `snapshot()` itself through `makeSnapshot`, so a game must not define `snapshot()`. Instead it:
    - implements `protected abstract progress()`;
    - reads `this.resumeAt` (already validated by `readResume`);
    - calls `this.acceptResume()` only when it takes the resume.
    
    Put the resume decision in a pure `startCommands(round, resumeAt)` in the game's `round.ts`, as Tiệm kem does. Declare the game's partial in `SnapshotPartials` in `content/types.ts`.
- **2026-10-10 (implementation): what changed from the spec, and why.**
  - **`spacing.gap`** does not exist; the rules use `spacing.targetGap` (24), as the cross-notes say.
  - **Camera and lawn.** The park lawn is only ~2.3 m deep (fence y 4.75 → sand y 7.1), and the stegosaurus' ghost (~250 px) plus its body-legs piece (~250 px) below it must fit between the horizon and the bottom of the interactive rect. `CamDino` therefore stands just inside the fence at (−3.1, 4.85, 1.05), pitched ~19° (horizon y ≈ 70), with `DINO_SPOT` (−3.1, 6.75) at the back of the lawn; the dinos stand against the sea. The fence is behind the camera, so "off" is the sky, sea and sand. The pond's jumping fish (`A_FishGold/Clown/Koi`) are pruned too: they stood in front of the first camera tried.
  - **Facing −40°** (3/4 toward the camera): at −25° the stegosaurus' head-neck piece was 70×76 px (< 90); at −40° it is 81×97.
  - **`hit.grass`** is `LAWN_RECT_M` clipped to the camera frame (Sutherland–Hodgman, `clip_to_frame`), because a near lawn edge would project out of the render, and it is stored unpadded (`SCREEN_SEPARATE`).
  - **Render-time rules.** Nearly every dino rule needs frame sizes, so `render` measures the rendered frames' trim boxes (`pack.ts › frameTrimRect`, the same trim as `atlas`) and runs `validateDinoPuzzle` with them; `atlas` and `validate:content` run it on the published multiatlas.
  - **Multiatlas.** Single-page screens are unchanged. `AtlasRef.pages` is the cap (4) taken from `content/assets.ts › ATLAS_MAX_PAGES`, which `pack.ts › SCREEN_MAX_PAGES` reuses; the real pack uses 3 pages. Even one page would be written as `dino-puzzle-0.png`; pages a bigger earlier pack left are removed.
  - **Creature check.** One `lowpass=f=150` (2-pole) still passes a 330 Hz hoot at about −34 dBFS, so `audio:check` cascades four of them (48 dB/oct). The creature calls use a cubic 50 ms fade-in.
  - **Play-again icon.** `build_map.py` recolours the Apatosaurus icon's `Brown` material (`ICON_MATERIAL_BY_MODEL`), since the FBX has no `Main`.
  - **Unknown materials.** The Apatosaurus also has `LightBrown` and `Black`; both become body colour with one warning each, as specified.
  - **Comments** in `content/decorations.ts` that named the meat-eater were reworded, so the new scan passes.
  - **Difficulty and return path.** The level is written by the post-round chain (`core/post-round-chain.ts`), not by the game or by Map directly. Start data comes from `takeStartData` in `core/session-store.ts`.
  - **Rewards.** `round:complete` grants a decoration through `core/reward-service.ts`, which must stay the only caller of `grantDecoration`. A game never grants directly.
  - **Decoration slots.** Story 2.2 left each station 1–2 decoration slots (10 in total).
  - **Map routing.** Map decides through pure helpers: `routeRoundComplete` / `routeRoundAbandon` / `keepAbandonSnapshot` in `post-round-chain.ts`, and `routePlayAgainClose` in `play-again.ts`. Keep new Map logic in pure core helpers with tests, because scenes have no test harness.
## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind, edge | The no-meat-eater scan matches only `/t-?rex/i`, is defined twice, and skips `art/`, `src/games` and public asset names; Velociraptor/Tyrannosaurus/Raptor/Spinosaurus/Allosaurus pass | medium | The Quaternius dinosaur pack ships a Velociraptor; decorations.ts claims validate:content enforces UX-DR75 | patch |
| 2 | verification-gap | The dino-puzzle branch of `layoutProblems` is never exercised through `run()` | medium | Deleting the branch keeps every validate-content test green | patch |
| 3 | edge | The last piece's snap tween is stopped by `comeAlive` in the same batch, so the piece jumps instead of gliding | low | Visible on every dino; direct fix (start come-alive after the snap) | patch |
| 4 | blind | Walk frames follow the eased position, not elapsed time | low | Legs crawl then rush; direct fix | patch |
| 5 | edge | A silent creature call passes `audio:check` (-inf peak) | low | Direct check | patch |
| 6 | blind | `multiAtlas()` silently drops a frame name repeated across pages; a PNG/JSON count mismatch is reported as "needs N pages" | low | Direct fail + message | patch |
| 7 | blind | `vo.dino-puzzle.name.stegosaurus` uses a coined name with no `review` flag | low | Parent should check wording/TTS; direct flag | patch |
| 8 | blind | Test title "Level-4 zone ×2" uses ×4; README icon row mentions an unrelated pineapple | low | Direct corrections | patch |
| 9 | verification-gap | `scaryAssetProblems` wiring into `run()` not asserted | low | Needs an `appDir` seam on `run` | defer |
| 10 | verification-gap, blind | Multi-page stale cleanup unverified and misses a leftover single-page png/json | low | Only fires when page count shrinks | defer |
| 11 | blind | DinoPuzzle scene (come-alive chain, token mapping, highlight, hand-over, bounce) untested | medium | No Phaser scene harness | defer |
| 12 | blind | Round stuck in `alive` if `speech:ended` never arrives | low | AudioDirector always ends an utterance (completed or cut), as in pizza | reject |
| 13 | blind | Slot zones overlap (113 px apart, snap 100), so "wrong slot" is rare | low | A drop near another slot's centre (> 100 px from its own) still floats back; the larger zone at hint levels is intended help | reject |
| 14 | blind, edge | Level types allow 4/6 pieces with no cut; resume accepted but drops placed pieces | low | Both are Story 3.4 scope; the current ladder has only 3 | reject |
| 15 | blind | Builder handles only the first mesh per model | low | All three models are single-mesh; frames checked by eye | reject |
| 16 | blind | `audio:check` is not part of `check`; snap/happy not measured | low | Spec makes it a separate command | reject |
| 17 | blind | Two dinos overlap during the hand-over fade | low | Visual polish | reject |
| 18 | blind, edge | Hint contrast skips rest spots and the slot highlight; rest spot may sit on the ghost; grass with < 3 points skips the start check | low | No failing case shown | reject |

## Design Notes

**Why one drop order:** own slot first makes "ô đúng thắng" and the level-4 ×2 zone safe; home before other means lifting a piece near an enlarged zone and putting it back is never a mistake.

```ts
onDrop(p) { for (const c of round.drop(piece.id, p)) apply(c); }
// own  → sfx snap · snapTo{piece} · lock{piece} · stepDone(step(firstUnplaced))
// last → … · questionDone · lockAll · comeAlive{species, last}
// name speech:ended → nextDino{index} | celebrate · finishRound{afterMs}
```

**Atlas budget:** at `dinoSizePx` 360 a whole frame is ~720×500 px; 10 whole-size frames per species plus pieces ≈ 3–4 pages. If 3.4's extra cuts overflow 4 pages, drop `walk` to 2 frames before raising the cap.

## Verification

**Commands:**
- `cd app && npm run content:export && npm run tts && npm run audio:placeholders` -- expected: 7 new `vo.*` and 5 `sfx.dino-puzzle.*` files; a second `tts` run skips them.
- `cd app && npm run audio:check` -- expected: exit 0 for the 3 creature calls.
- `cd app && npm run art:build -- dino-puzzle && npm run render -- dino-puzzle && npm run atlas -- dino-puzzle` -- expected: exit 0; a second `render` gives a byte-identical layout and ghost frames.
- `cd app && npm run art:build -- map && npm run render -- map && npm run atlas -- map` -- expected: exit 0; `atlas.map` one page with `icon/dino-puzzle/00` and `decoration/pineapple/00`, no `t-rex`.
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run build` -- expected: exit 0; every `dist/assets/atlases/dino-puzzle-*.png` is precached.

**Manual checks:**
- In `preview.png` and in game: dinos read friendly (eyes visible, no teeth, horns/plates pastel), ghost is purple-grey 35 % with a white dashed edge, pieces at rest never cover the ghost or the Home/Speaker corners.
- The come-alive swap shows no jump between the assembled pieces and the whole dino. With `prefers-reduced-motion` the dino hops in place. Listen to each call: short, soft, no roar.
