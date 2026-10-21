---
title: 'Story 4.5 — Chạm là nói: cảnh biển, chạm vật nghe tên'
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
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-3-cau-ca-cham-dung-ca-theo-mau.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-duong-dua-vach-duong-thang.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-danh-thuc-tiem-pizza-be-dem-topping.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-3-danh-thuc-cong-vien-khung-long-ghep-3-manh.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-giu-luot-do-trong-phien.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-pipeline-hinh-render-blender-atlas-layout.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-6-nut-nha-va-loa-chong-cham-nham.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-kart-chay-toi-tram.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-8-tiem-kem-keo-kem-dung-vi-cho-shiba.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The street station (`touch-talk`) is still asleep. There is no sea scene art, no prop sprites, layout, sounds or name lines, and no game scene. So FR16/FR17 cannot be played: the child cannot freely tap things in a scene, see them move, hear their sound and then hear their Vietnamese name, with no request and no right/wrong.

**Approach:**
- **Art:** a Blender builder makes `art/touch-talk.blend` with one Blender scene per plate (only `sea` in this story). It holds 10 bright props from Quaternius/Kenney plus a few script-built ones. The spec-1-4 tools gain multi-plate screens and produce `atlas.touch-talk`, `bg.touch-talk.sea` and `touch-talk.layout.json`. A new `validateTouchTalk` rule guards the hit size, the gaps, the edges, the Home/Speaker zones and the reserved scene-bubble column.
- **Game:** `games/touch-talk` has a pure `talk.ts` controller (taps, the name delay, the one-voice rules, the idle wiggle and the snapshot) behind injected audio/view ports, plus a wiring-only `TouchTalk.ts` scene. There is no HintDirector, no round, no ladder and no `round:complete`.
- **Shell:** the station wakes (`GAME_CONTENT` + `awake`) with an invite line. It has no ladder (Map uses level 0) and no play-again entry.

## Boundaries & Constraints

**Always:**
- **Multi-plate screens** (`tools/render/render.ts`, `render_screen.py`, `tools/atlas/pack.ts`; backward compatible):
  - `SCREEN_PLATES = { 'touch-talk': ['sea'] }`. Any screen not listed keeps the current one-plate behaviour.
  - For a plated screen, `render` runs `render_screen.py` once per plate with a new optional `--scene <plate>` argument (default: the file's active scene). Each run uses its own temp subdir.
  - The bg of each plate is written as `bg-<plate>.png`. The frames of all plates go into one `frames/` tree, and a frame path that appears in two plates fails naming it.
  - The raw JSONs merge into one `touch-talk.layout.json` (layout JSON v1, unchanged) through `toLayout`. A `<kind>.<id>` that appears in two plates fails naming it. `preview-<plate>.png` draws only that plate's objects.
  - `atlas` packs every frame into `atlas.touch-talk` (one page, the spec-1-4 caps). It copies each plate bg to `public/assets/bg/<screen>-<plate>.png`, and the bg rule (2048×1536) applies to each.
- **Art builder** (`tools/render/blender/build_touch_talk.py`, run with `npm run art:build -- touch-talk`; it follows every spec-1-4/1-8/4-3 invocation, temp-dir, naming, colour-argument and FBX-alpha rule):
  - **Base:** open `art/src/map-v2.blend` and delete the same objects as `build_fishing.py` (spec-4-3). Keep `World` (sea, sand), `Nature` and `Sky`. Rename the scene to `sea`.
  - **Camera:** add `CamSea` from named constants (`CAM_SEA_LOC/ROT/LENS`). It is a low 3/4 view along the beach: sand in the lower two thirds, then the sea, with sky at the top. It renders at 2048×1536.
  - **Props** (one collection `sprite.<propId>` each; placed from a `SEA_PROPS` table of world XY, yaw and `PROP_SCALE`; every colour comes from Tokens as hex args):

    | propId | source | colour |
    |---|---|---|
    | `boat` | Quaternius `cutefish/Boat.fbx`, on the water | source colours |
    | `fish` | Quaternius `cutefish/BlueTang.fbx`, leaping from the shallows | source colours; red-dominant materials (spec-4-3 rule) → `creatureBlue` |
    | `crab` | script: squashed UV-sphere body, 2 claws (sphere + 2 cones) on empties `ClawL/R`, 6 cylinder legs, 2 eye stalks with white eyes and `iconInk` pupils | `creatureOrange` |
    | `starfish` | script: 10-vertex star (radii 1 / 0.45), extruded | `creaturePink` |
    | `parasol` | Kenney city-kit-commercial `detail-parasol-a.glb`, on the sand | source colours |
    | `bucket` | script: open tapered cylinder with a torus handle, plus a shovel (flattened cube blade, cylinder handle) leaning in | bucket `creatureBlue`, shovel `creatureGreen` |
    | `seagull` | script: ellipsoid body and head, 2 flattened wing ellipsoids on empties `WingL/R`, cone beak, `iconInk` eyes | `art.touchTalk.white`, beak `art.touchTalk.beak` |
    | `coconut` | Kenney food-kit `coconut.glb` | source colours |
    | `shell` | Kenney food-kit `mussel-open.glb` | `creaturePurple` |
    | `beach-ball` | script: UV sphere; faces get material `floor(azimuth / 60°) % 3` | `creatureGreen`, white, `creatureOrange` |

  - **States:** `states = {"idle":[1],"react":[10]}`. Frame 10 is the pose from a `REACT_POSE` table:
    - boat rolls 8°; fish pitches up 20°; crab claws rise 30°; starfish turns 15° in its plane; parasol tilts 6°; bucket tilts 10°;
    - seagull wings rise 35°; coconut rolls 15°; shell tips 10°; beach ball squashes (z 0.85, xy 1.08).
  - **Size:** each prop's `idle/00` trimmed longest side ÷ renderScale lies in [`ui.touchTalkPropMinPx`, `ui.touchTalkPropMaxPx`].
  - **Layout objects:** `hit.prop-<propId>` is the `bmesh` convex hull of the prop's evaluated world vertices (spec-1-4 pads it by `hitPad` 24, which is the "hình + 24px" tap area). No anchors.
  - Rule failures are fixed in the builder's `SEA_PROPS`/`PROP_SCALE` constants.
- **Scene-bubble column** (reserved now, drawn in Story 4.6):
  - `core/scene-bubbles.ts › sceneBubbleCentres(hud: HudLayout, count)` (pure). x = the Speaker centre x. The first centre y = Speaker y + `ui.hudKeepOutPx/2` + `spacing.targetGap` + `sceneBubble.base.size/2`. Each next one is `size + targetGap` lower.
  - `tools/layout/hud-keep-out.ts › sceneBubbleKeepOutRect()`: for `supportedAspect.min` and `.max`, take the bounding rect of the `TOUCH_TALK_SCENE_SLOTS` (3) circles grown by `spacing.targetGap`, then take the union. The `hudLayout` inputs are the same as `hudKeepOutRects()` (spec-3-1).
- **Screen rules** (`tools/layout/rules.ts › validateTouchTalk(layout, atlasJson)`, run by `render`, `atlas` and `validate:content`; each message names the id):
  - Every prop of every `TOUCH_TALK_SCENES` entry has `hits['prop-<id>']` (≥ 3 points), `<id>/idle/00` and `<id>/react/00`, and passes the size rule above.
  - Each hit polygon has min width ≥ `spacing.targetMin` (80), and every vertex lies inside the spec-1-4 interactive rect (safeRect minus the dead bands).
  - It does not intersect any `hudKeepOutRects()` rect or `sceneBubbleKeepOutRect()`.
  - Within one scene, every pair of hit polygons is at least `spacing.targetGap` (24) apart (`polygonDistance`).
  - Every scene bg `bg.touch-talk.<scene>` is 2048×1536.
- **Content** (`content/games/touch-talk.ts`, data only):
  - `TouchTalkProp = { id; sfxId; nameLineId }`.
  - `TOUCH_TALK_SCENES = [{ id: 'sea', bg: BACKGROUNDS['touch-talk-sea'], nameLineId: 'vo.touch-talk.scene.sea', props: [the 10 above] }]` and `TOUCH_TALK_SCENE_SLOTS = 3`.
  - The `sfxId` is `sfx.touch-talk.<id>` and the `nameLineId` is `vo.touch-talk.name.<id>`.
  - `assets = { atlases:[ATLASES['touch-talk']], images:[every scene bg], audio:[every vo.touch-talk.*, sfx.touch-talk.*] }`. There is **no `ladder` export**.
  - A content test checks:
    - 8–12 props per scene;
    - prop ids are kebab and unique across all scenes (4.6 counts across scenes, so ids carry no scene prefix);
    - every `sfxId` is in `AUDIO_CATALOG` and every `nameLineId` is in `VOICE_LINES`.
- **Registry without a ladder** (`content/games/types.ts`, `games/registry.ts`):
  - `ladder` becomes optional, and `ladderLength(entry) = entry.ladder?.length ?? 1`.
  - Every `.ladder.length` use (Map `startData`/`resumeStartData`, spec-2-1/2-3 `nextLevel`) goes through it, so touch-talk always starts at level 0 and `resumeStartData` accepts its level 0.
  - `ProgressStore` already ignores `touch-talk` (spec-2-1).
  - The `touch-talk` station gets `awake: true`, and `GAMES['touch-talk'].scene = TouchTalk` with scene key `'touch-talk'`.
- **Controller** (`games/touch-talk/talk.ts`, pure, no Phaser). It is built as `createTalkController({ scene, rng, resume, audio: { sfx, say, setPrompt }, view: { bounce, wiggle } })`:
  - **`start()`:** `setPrompt(scene.nameLineId)`. No voice is played on entry.
  - **`tap(id)`**, in this order, all synchronous:
    1. `view.bounce(id)` and `audio.sfx(prop.sfxId)`, on every tap;
    2. add `id` to `touched` if new (insertion order);
    3. reset the idle clock;
    4. if `id` is the prop being named (`speaking.id`) or already waiting (`pending.id`), there is no voice change. Otherwise `pending = { id, msLeft: Timing.touchTalkNameDelayMs }`, which replaces any other pending name.
  - **`anyTap()`** (router `onAnyTap`, background and HUD taps included): reset the idle clock.
  - **`tick(dt)`** (dt clamped to 250 ms):
    - **Pending name:** `msLeft -= dt`. At ≤ 0, it calls `setPrompt(line)`, then `token = say(line)`, and sets `speaking = { id, token }`.
    - **Idle clock:** it adds `dt`. At ≥ `Timing.touchTalkIdleWiggleMs` it calls `view.wiggle(pick)` and the clock restarts at 0. `pick` is drawn by `rng` among the scene's props, and is never the previous wiggled prop.
  - **`speechEnded(token)`:** clears `speaking` when the token matches.
  - **`progress()`** = `{ questionIndex: sceneIndex, partial: { sceneId, touchedIds: [...touched] } }`. It is plain JSON, and `touchedIds` are the distinct ids since the start (Story 4.6 resets them at each `reward:earned`).
  - **Resume:** a pure `resumeTalk(resumeAt, scenes)` returns `{ sceneIndex, touchedIds }` or `null`.
    - It is valid only when `partial.sceneId === scenes[questionIndex].id` and `touchedIds` is an array of distinct, known prop ids.
    - `null` gives one `console.warn` and a clean sea start. A valid result seeds `touched`.
  - It never touches the Bus, `hint`, tallies or `complete`.
- **Scene** (`games/touch-talk/TouchTalk.ts extends MiniGameBase`; wiring only):
  - **Build:** the scene bg at scale `1/renderScale`. Each prop is an image of `<id>/idle/00` with the spec-1-8 `trimmedCentre` pivot, at depth = pivot y. Swapping to `react/00` keeps the same pivot (the frames are full-frame). A missing frame warns once, and the hit target stays.
  - **Input:** one `createTapRouter(this)` with `onAnyTap: controller.anyTap`. Each prop gets `createTapTarget(router, { area: { contains: (p) => pointInPolygon(p, hits['prop-<id>']) }, onPress: () => controller.tap(id) })` (spec-4-3 `area`). A background tap hits nothing. The guard handles dead-zone and second-finger presses.
  - **Bounce:** it kills the prop's tweens and resets scale and angle. It shows `react/00` and tweens 1 → `amplitude(tappableProp.react.scale, reduced)` → 1 over `tappableProp.react.durationMs`, then shows `idle/00`.
  - **Wiggle:** angle 0 → +θ → −θ → +θ → 0 over `Timing.touchTalkWiggleMs`, with θ = `ui.touchTalkWiggleDeg` × (`reducedMotionAmplitude` when reduced). There is no sound, ring or alpha change. A tap on that prop cancels it (bounce reset).
  - **Clock:** `update(_, delta)` calls `controller.tick(delta)` until the game is inert, so pause/overlay freezes the idle clock and the pending name. `speech:ended` comes through `bus.scoped(this)`.
  - **Exit:** `progress()` delegates to the controller. Home goes through `MiniGameBase` (`round:abandon` with the snapshot, then inert). SHUTDOWN calls `audio.clearPrompt()` (spec-2-4), so the Map Speaker never replays a prop name.

**Never:**
- No prompt line, `hint.*`, HintDirector, ring, hand, tally, `round:complete`, `finishRound` or `complete(`. No "sai", red, ✗ or error sound. No text on screen.
- No second or third scene, no scene bubbles drawn, no `reward:earned`/`reward:granted` handling and no fly-out. Those are Story 4.6.
- No `ladder`, no difficulty entry and no `vo.shell.play-again-ask.touch-talk` or `PLAY_AGAIN_ICONS` entry (spec-2-4 forbids both).
- No `setTimeout`, `this.sound`, `this.load` or `scene.*` navigation in `games/touch-talk`. No raw pointer events outside `core/input`. No hand-entered coordinates, magic numbers or hex in games.
- No change to the layout JSON v1 format, the AudioDirector queue rules or the guard.
- No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **Kebab hit ids:** the epic's `hit.prop.<propId>` breaks spec-1-4's id grammar (as `slot.base.1` did in 3.1), so the ids are `hit.prop-<propId>` → `hits['prop-<id>']`. Voice ids `vo.touch-talk.name.<propId>` already fit `VOICE_ID`.
- **Props:** the packs have no crab, starfish, bucket, seagull or beach ball, so those are script-built low-poly models (the same approach as 4.3's dots). That keeps the AC's example set and gives 10 props (within 8–12).
- **One file, several plates:** the AC asks for one `touch-talk.layout.json` and one atlas but per-scene backgrounds, so plates are Blender scenes in one `.blend`, merged at render time. Story 4.6 only appends `street` and `kitchen` to `SCREEN_PLATES`.
- **Name delay:** "sound, then name" is a `Timing.touchTalkNameDelayMs` (350) wait on the scene clock, and every prop SFX is ≤ 350 ms. A newer tap during the wait replaces the waiting name (the latest prop wins). Lines never overlap: AudioDirector's queue/interrupt rule (spec-1-3) handles a tap that lands while a name plays, and a waiting re-tap or a re-tap of the prop being named changes no voice.
- **Speaker:** each name sets the prompt as it is spoken, and `start()` sets the scene name. `speakerReplay` has no active hint, so it falls back to `audio.replayPrompt()` (spec-1-9). There is no voice on entry, because the kart already said "Chạm là nói" and the AC forbids a prompt.
- **Resume is read now:** Map (spec-2-5) hands back the 4.5 snapshot within the session. Restoring `touchedIds` here costs one pure function and keeps Story 4.6's 5+3 count correct.
- **"Bus spy" AC:** a test drives the real controller and a real `Bus` with fake audio/view through 40 taps, 60 s of ticks and speech ends, and finds no `round:complete`. A source scan finds no `hint.`, `complete(`, `finishRound` or `'round:complete'` under `games/touch-talk/`.
- **Voice lines** (unapproved; no `|`):

  | id | text | words |
  |---|---|---|
  | `vo.touch-talk.scene.sea` | "Biển!" | 1 |
  | `vo.touch-talk.name.boat` / `fish` / `crab` / `starfish` / `parasol` | "Con thuyền!" / "Con cá!" / "Con cua!" / "Sao biển!" / "Cái ô!" | 2 |
  | `vo.touch-talk.name.bucket` / `seagull` / `coconut` / `shell` / `beach-ball` | "Cái xô!" / "Chim hải âu!" / "Quả dừa!" / "Vỏ sò!" / "Quả bóng!" | 2–3 |
  | `vo.shell.invite.touch-talk` | "Bé ơi, mình đi \| chạm là nói nhé!" (`keywordPauseMs: 300`) | 8 |

  `name.parasol` carries `review: 'ô/dù: chọn từ quen của bé'` (spec-3-1 `review`).
- **SFX placeholders** (`make-placeholders.ts`; 50 ms fade-in, −20 dBFS peak, partials ≥ 300 Hz, each ≤ 350 ms):
  - boat: "tu tu" two-tone horn;
  - fish: splash (high-passed noise burst);
  - crab: two clicks; starfish: twinkle; parasol: whoosh; bucket: tin clink;
  - seagull: soft two-chirp call, `creature: true` (spec-3-3 `audio:check`);
  - coconut: woodblock "cộc"; shell: chime; beach-ball: "boing" pitch drop.
- **New values:**
  - `ui`: `touchTalkWiggleDeg 6`, `touchTalkPropMinPx 100`, `touchTalkPropMaxPx 220`.
  - `Timing`: `touchTalkNameDelayMs 350`, `touchTalkWiggleMs 900`. The existing `touchTalkIdleWiggleMs` (15000) is used as it is.
  - `art.touchTalk = { white '#FFFFFF', beak '#FFC93C' }`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enter | `{level:0, seed:7}` | sea bg + 10 props; `setPrompt('vo.touch-talk.scene.sea')`; no `say`, no hint call | — |
| Tap prop | tap crab | same call: `bounce(crab)`, `sfx('sfx.touch-talk.crab')`; after 350 ms `setPrompt` + `say('vo.touch-talk.name.crab')` | — |
| Background | tap no prop | no target; idle clock reset; no sfx, no voice | — |
| Re-tap while named | crab speaking, tap crab | bounce + sfx; no `say` | — |
| Re-tap while waiting | tap crab twice within 350 ms | 2 bounces + 2 sfx; one `say` at 350 ms after the first | — |
| Quick taps | 5 props within 1 s | 5 bounces + 5 sfx at once; `say` only for props whose wait ran out; never two lines at once (AudioDirector) | — |
| Name tail | A has 0.3 s left, B's wait ends | `say(B)` queues; B plays after A | — |
| Speaker, nothing tapped | `audio.replayPrompt()` | "Biển!" | — |
| Speaker after names | crab then boat named | replays "Con thuyền!" | — |
| Idle | 15 000 ms of ticks, no tap | one `wiggle`, no sound; another after 15 000 more; never the same prop twice in a row | — |
| Idle reset | tap at 14 s | no wiggle until 15 s after that tap | — |
| Paused | no `update` calls | clock and pending name frozen | — |
| 40 taps | spy on a real Bus | 0 `round:complete`, 0 `reward:earned` | — |
| Home | touched crab, boat, crab | one `round:abandon`; snapshot ⊇ `{v:1, level:0, seed, questionIndex:0, partial:{sceneId:'sea', touchedIds:['crab','boat']}}`; JSON round-trips; inert | — |
| Resume | `resume.partial.touchedIds ['crab']` | sea; `touched` = {crab}; a crab tap adds nothing | — |
| Bad resume | unknown id, duplicate, or a `sceneId` that does not match the index | clean sea start | console.warn once |
| Map start | `touch-talk`, no ladder | `ladderLength` 1 → `{level:0, seed}`; a stored level-0 snapshot is accepted | — |
| Small hit | a prop's padded hull narrower than 80 | render, atlas and check fail naming `prop-<id>` | exit 1 |
| Too close | two sea hulls 20 px apart | fail naming both | exit 1 |
| HUD / column | a hull touches the Speaker keep-out or the bubble column | fail naming the id | exit 1 |
| Plate clash | the same `hit.prop-x` in two plates | render fails naming it | no write |

</intent-contract>

## Code Map

- `app/src/core/input/{guard,tap-router,tap-target,polygon}.ts` -- planned in spec-1-5/1-6 (router, `onAnyTap`, layers, dead zones, `pointInPolygon`). `area` and `onPress(p)` are planned in spec-4-3.
- `app/src/core/audio-director.ts` -- real `say`, `sfx`, `setPrompt`, `replayPrompt` and the queue/ignore rules. `clearPrompt` is planned in spec-2-4. `core/hint-director.ts › speakerReplay` is planned in spec-1-9.
- `app/src/games/mini-game-base.ts` -- planned in spec-1-7/1-8/1-9/1-10/2-5 (`hud:home` → `round:abandon`, inert, `progress()`, `resumeAt`). `games/registry.ts` (spec-1-7) and `games/fishing/*` (spec-4-3) are the structure to copy.
- `app/src/core/{rng,reduced-motion,scene-bubbles}.ts`, `core/ui/sprite-pivot.ts` -- `mulberry32`, `amplitude` and `trimmedCentre` are planned in spec-1-5/1-8. `scene-bubbles.ts` is new. `core/hud.ts › hudLayout` is planned in spec-1-6.
- `app/src/core/session-store.ts › startData/resumeStartData`, `core/post-round-chain.ts`, `scenes/Map.ts` -- planned in spec-1-7/2-3/2-5. Their `.ladder.length` uses switch to `ladderLength`.
- `app/src/content/games/{types,index}.ts`, `content/stations.ts`, `content/assets.ts` -- planned in spec-1-4/1-7/1-8.
- `app/src/content/voice-lines.ts`, `content/audio-catalog.ts`, `content/validate.ts`, `tools/audio/make-placeholders.ts` -- real. `review` is planned in spec-3-1, and `creature`/`audio:check` in spec-3-3.
- `app/src/core/tokens.ts`, `core/timing.ts` -- real. They already have `touchTalkIdleWiggleMs`, `components.tappableProp`, `sceneBubble.base.size` and `spacing.targetGap/targetMin`.
- `app/tools/layout/{rules,geometry,to-layout,hud-keep-out}.ts`, `tools/render/{build,render}.ts`, `tools/render/blender/{common,render_screen,build_fishing}.py`, `tools/atlas/pack.ts`, `tools/lint/validate-content.ts` -- planned in spec-1-4/1-8/3-1/3-3/4-3.
- Sources: `assets/quaternius/cutefish/{Boat,BlueTang}.fbx`, `assets/kenney/kenney_city-kit-commercial_2.1/Models/GLB format/detail-parasol-a.glb`, `assets/kenney/kenney_food-kit/Models/GLB format/{coconut,mussel-open}.glb`, `art/src/map-v2.blend`.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/core/tokens.ts`, `app/src/core/timing.ts` (+ tests) -- the new `ui`, `Timing` and `art.touchTalk` values.
- [x] `app/src/content/voice-lines.ts`, `content/audio-catalog.ts`, `tools/audio/make-placeholders.ts` (+ test) -- 12 lines and 10 SFX. Generate them with `npm run content:export && npm run tts` and `npm run audio:placeholders`.
- [x] `app/src/content/games/types.ts`, `games/registry.ts` (+ test), `core/session-store.ts`, `core/post-round-chain.ts`, `scenes/Map.ts` -- the optional `ladder` and `ladderLength`, and the Map-start row.
- [x] `app/src/content/games/touch-talk.ts` (+ `touch-talk.test.ts`), `content/games/index.ts`, `content/stations.ts`, `content/assets.ts` -- the content, `awake: true`, `ATLASES['touch-talk']` and `BACKGROUNDS['touch-talk-sea']`.
- [x] `app/src/core/scene-bubbles.ts` (+ test), `app/tools/layout/hud-keep-out.ts` (+ test) -- the centres and the column keep-out rect at both aspects.
- [x] `app/tools/render/render.ts`, `render_screen.py`, `tools/layout/to-layout.ts`, `tools/atlas/pack.ts` (+ tests) -- the multi-plate path, the duplicate checks and the per-plate bg copy. Existing screens' args and outputs stay byte-identical.
- [x] `app/tools/render/blender/build_touch_talk.py`, `tools/render/build.ts` (+ test) -- the builder and the colour args.
- [x] `app/tools/layout/rules.ts` (+ a failing case per rule), `tools/lint/validate-content.ts` (+ test) -- `validateTouchTalk`.
- [x] `src/content/generated/touch-talk.layout.json`, `public/assets/atlases/touch-talk.{png,json}`, `public/assets/bg/touch-talk-sea.png` -- produce them with the real Blender.
- [x] `app/src/games/touch-talk/talk.ts` (+ test) -- the controller and `resumeTalk`: every non-visual matrix row, the Bus-spy test and the source scan.
- [x] `app/src/games/touch-talk/TouchTalk.ts` -- the scene wiring per the Boundaries.
- [x] `app/README.md` -- provenance rows (Boat, BlueTang, detail-parasol-a, coconut, mussel-open, and the script-built props) and the new audio.

**Acceptance Criteria:**
- Given the real Blender, when running `art:build`, `render` and `atlas` for `touch-talk`, then `touch-talk.layout.json`, `atlas.touch-talk` (one page ≤ 2048², frames `<propId>/idle/00` and `react/00` for all 10 props, each file ≤ 8 MiB) and `bg/touch-talk-sea.png` (2048×1536) exist. `preview-sea.png` shows 10 brightly coloured props on the beach and water with padded hulls, all clear of the corners, the Home/Speaker zones and the right-edge bubble column.
- Given `npm run dev` at 1180×820 touch emulation, when the child taps the street station on the island, then it bounces and "Chạm là nói" plays, the kart drives there, and the beach scene appears with no request line and no ring.
- Given the beach scene, when the child taps the crab, then within 100 ms it bounces to 1.1× and back over 0.3 s and its click sound plays, then "Con cua!" is read. Tapping the sand or sky gives no voice and no error.
- Given the beach scene, when the child taps five props quickly, re-taps the prop being named, or taps another as a name ends, then every tap bounces and sounds at once, two voices never overlap, and the music dips under each name. The Speaker replays the last name, or "Biển!" before any tap.
- Given no tap for about 15 s, then one prop wiggles silently. Another wiggles 15 s later, and any tap restarts the wait. With `prefers-reduced-motion`, the bounce and wiggle are smaller.
- Given the scene, when the child taps Home, then "Về đảo nào!" plays, the island returns, and exactly one `round:abandon { gameId:'touch-talk' }` with `partial.sceneId 'sea'` was emitted. No play-again overlay appears.
- Given a hit hull moved into the Speaker keep-out (or a temporary `hint.` call in `games/touch-talk/talk.ts`), when running `npm run check`, then it fails naming `prop-<id>` (or the scan).

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

- 2026-10-12: subagent review layers NOT run (not authorised); inline self-review. Notes: (1) plates are selected with Blender -S <plate>; render_screen.py scopes sprite/layout collections to the active scene (layout.<plate>); an existing screen (race) re-renders byte-identical. (2) The controller already has 4.6's shape (scenes array, optional rewardEvery/earned/slide). (3) Props are fitted to a target px size per prop rather than a fixed PROP_SCALE. (4) A sand apron was added to the sea plate. (5) In-browser AC walkthroughs not run.

## Design Notes

**Why a controller with ports:** touch-talk has no round model to make pure, but its rules (the name wait, the skip on re-tap, idle picks, the snapshot) are timing logic that must be node-tested and must provably never emit `round:complete`. Injecting `audio` and `view` keeps the Phaser scene to sprites and tweens:

```ts
const c = createTalkController({ scene, rng: mulberry32(seed >>> 0), resume,
  audio: { sfx: (id) => audio.sfx(id), say: (id) => audio.say(id), setPrompt: (id) => audio.setPrompt(id) },
  view: { bounce: (id) => this.bounce(id), wiggle: (id) => this.wiggle(id) } });
bus.scoped(this).on('speech:ended', (e) => c.speechEnded(e.token));
```

**Why the column is reserved now:** if 4.5 placed props under the right-edge bubble column, 4.6 would have to move art. Deriving the column from `hudLayout` (like `hudKeepOutRects`) lets the validator and 4.6's drawing share one source.

## Verification

**Commands:**
- `cd app && npm run content:export && npm run tts && npm run audio:placeholders && npm run audio:check` -- expected: 12 voice `.m4a` + `.hash` and 10 `sfx.touch-talk.*` files are written; the seagull passes the creature check; a second `tts` run skips them.
- `cd app && npm run art:build -- touch-talk && npm run render -- touch-talk && npm run atlas -- touch-talk` -- expected: exit 0; a second `render` gives a byte-identical layout.
- `cd app && npm run render -- fishing` -- expected: its layout is unchanged byte for byte (the one-plate path is unaffected).
- `cd app && npm run check` -- expected: exit 0. The talk, scene-bubble, keep-out, rules, registry and content tests pass, and validate:content reports the touch-talk layout, frames and lines.
- `cd app && npm run build` -- expected: exit 0, with `dist/assets/atlases/touch-talk.png` present.

**Manual checks:**
- Run the AC walkthroughs at 1180×820 and 1024×768, in landscape and in rotated portrait. No prop sits under Home, Speaker or the empty right column.
- Listen to every name (a warm, slow voice; "Cái ô" flagged for the parent) and every prop sound (soft, no harsh highs). Leave `approved` unset.
- With multi-touch: hold one finger on the sand and tap a prop with another, and nothing happens.
