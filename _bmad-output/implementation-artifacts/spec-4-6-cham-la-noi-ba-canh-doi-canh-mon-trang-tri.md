---
title: 'Story 4.6 — Chạm là nói: ba cảnh, nút đổi cảnh và món trang trí sau ~8 vật'
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
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-5-cham-la-noi-canh-bien-cham-vat-nghe-ten.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-danh-muc-trang-tri-o-tren-dao-reward-service.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-chuoi-sau-luot-tren-ban-do.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-giu-luot-do-trong-phien.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-3-danh-thuc-cong-vien-khung-long-ghep-3-manh.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-6-nut-nha-va-loa-chong-cham-nham.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** After Story 4.5, Chạm là nói has only the beach. There is no street or kitchen, no way to switch scenes, and tapping never earns anything. So FR15/FR17's three scenes and the "every ~8 distinct things → a decoration flies to the island" reward (the only no-round reward path in the app) are missing, and the 5 + 3 count across a Home/resume is unproven.

**Approach:**
- **Art:** add `street` and `kitchen` plates (10 props each) to `art/touch-talk.blend` through 4.5's multi-plate pipeline, plus a round thumbnail frame per scene. The atlas goes multi-page (spec-3-3).
- **Game:** extend 4.5's pure `talk.ts` controller with the scene list, scene switching (a timed slide during which prop taps are ignored), the distinct-prop counter and an `earned` port. The scene draws three scene bubbles, slides or crossfades between scene containers, and on `reward:granted` shows that decoration beside the prop with fading sparkles, then flies it off-frame.

## Boundaries & Constraints

**Always:**
- **Art builder** (`build_touch_talk.py`; every 4.5 builder rule applies: Tokens hex args, `states = {"idle":[1],"react":[10]}`, a `REACT_POSE` row per prop, the size rule `ui.touchTalkPropMinPx..MaxPx`, convex-hull `hit.prop-<propId>`, fixes go in the per-scene `*_PROPS` / `PROP_SCALE` constants):
  - **Plates:** two new Blender scenes `street` and `kitchen`. Each copies the `sea` render settings (2048×1536, engine, colour management) and has its own camera from named constants (`CAM_STREET_*`, `CAM_KITCHEN_*`, the same low 3/4 view).
    - `street`: links the `Sky` collection and the sea world. Ground is a plane in `art.touchTalk.pavement`. A row of Kenney city-kit-roads tiles (`road-straight.glb`, `road-crossing.glb`) runs across the middle third. `low-detail-building-a/b/c.glb` stand along the back as a non-tappable backdrop.
    - `kitchen`: a script-built room: floor plane `art.touchTalk.floor`, back and side walls `art.touchTalk.wall`, a window plane in the sky colour, a long counter box `art.touchTalk.counter` across the middle, and one area light.
  - **Street props** (`STREET_PROPS`):

    | propId | source | colour |
    |---|---|---|
    | `car` | Kenney car-kit `sedan.glb` | source |
    | `bus` | script: bevelled box body, white window band, 4 car-kit `wheel-default.glb` | body `creatureYellow` |
    | `traffic-light` | Kenney city-kit-roads `traffic-light.glb` | source |
    | `tree` | script: cylinder trunk, 3 stacked icospheres | trunk `art.touchTalk.trunk`, crown `creatureGreen` |
    | `house` | script: cube, pyramid roof, door, 2 windows | walls `creaturePink`, roof `creatureBlue`, door `creatureOrange` |
    | `police-car` | car-kit `police.glb` | source |
    | `truck` | car-kit `truck.glb` | source |
    | `tractor` | car-kit `tractor.glb` | source |
    | `dumpster` | city-kit-roads `dumpster.glb` | `creatureGreen` |
    | `cone` | city-kit-roads `construction-cone.glb` | source |

  - **Kitchen props** (`KITCHEN_PROPS`, Kenney food-kit, source colours unless noted): `pot` (`pot.glb`), `frying-pan` (`frying-pan.glb`), `apple` (`apple.glb`), `bread` (`loaf.glb`), `banana` (`banana.glb`), `carrot` (`carrot.glb`), `mug` (`mug.glb`, `creatureBlue`), `spoon` (`utensil-spoon.glb`), `egg` (`egg.glb`), `watermelon` (`watermelon.glb`).
  - No prop uses a touch-talk decoration model (`firetruck`, `ambulance`, `taxi`, `light-curved`), so the reward item always stands out.
- **Pipeline:**
  - `SCREEN_PLATES['touch-talk'] = ['sea', 'street', 'kitchen']`.
  - `SCREEN_MAX_PAGES['touch-talk'] = 3` (spec-3-3 multiatlas), so `ATLASES['touch-talk']` gets `pages: 3`. Each page must be ≤ 2048² and each file ≤ 8 MiB.
  - **Thumbnails:** for a plated screen, `render` writes `frames/scene-thumb-<plate>/idle/00.png` from that plate's bg with sharp (deterministic, so a re-render is byte-identical). The crop is a centred square of side `bgHeight × THUMB_CROP` (0.6, a named constant), resized to `(sceneBubble.base.size − 2 × ui.sceneBubbleInsetPx) × renderScale` px and masked to a circle (SVG `dest-in`).
- **Content** (`content/games/touch-talk.ts`):
  - `TOUCH_TALK_SCENES` = sea, street, kitchen, in that order (which is also the bubble order, top to bottom). New `BACKGROUNDS['touch-talk-street' | 'touch-talk-kitchen']` (keys `bg.touch-talk.<scene>`).
  - `TOUCH_TALK_REWARD_EVERY = 8`. The content test checks it is an integer in `[2, total props]`, plus 4.5's existing checks over all three scenes.
- **Rules** (`validateTouchTalk`): the 4.5 rules run for every scene. Also, each scene has `scene-thumb-<id>/idle/00`, and no prop id starts with `scene-thumb`.
- **Controller** (`talk.ts`): `createTalkController({ scenes, rewardEvery, rng, resume, audio:{sfx, say, setPrompt}, view:{bounce, wiggle, slide}, earned })` replaces 4.5's single `scene`. `current` is the scene index (`resume?.sceneIndex ?? 0`).
  - **`isActive(id)`** is true when `id` is in `scenes[current]` and no slide is running.
  - **`tap(id)`:** when `!isActive(id)`, the tap is ignored entirely (no bounce, no sfx, no count). Otherwise the 4.5 steps run, and step 2 becomes:
    - if `id` is new, add it to `touched`;
    - if `touched.size ≥ rewardEvery`, set `earnedFrom = id`, clear `touched`, then call `earned(id)`.
  - **`sceneTap(i)`:** during a slide, it is ignored. Every other call resets the idle clock. Then:
    - `i === current`: if the scene name is already speaking or queued, it does nothing more. Otherwise it calls `setPrompt` + `say` with the scene's `nameLineId`.
    - `i !== current`: it drops any pending prop name, calls `view.slide(current, i)`, sets `current = i` and `slideMsLeft = Timing.touchTalkSceneSlideMs`, then calls `setPrompt` + `say` with the new scene's name. It sets `lastWiggled = null`, and wiggle picks come only from `scenes[current]`.
  - **`tick(dt)`:** also counts `slideMsLeft` down. The slide ends at ≤ 0.
  - **`rewardAnchor()`** returns `earnedFrom ?? lastTappedId ?? null`.
  - **`progress()`** = `{ questionIndex: current, partial: { sceneId: scenes[current].id, touchedIds } }`. During a slide this is already the target scene.
  - **`resumeTalk`:** the known ids are every prop of every scene. `touchedIds.length` must be `< rewardEvery`, and `sceneId` must match `scenes[questionIndex]`. Anything else gives 4.5's single warn and a clean sea start with 0. A valid resume starts directly in that scene: no slide and no voice, only `setPrompt(scene name)`.
- **Scene** (`TouchTalk.ts`, wiring only):
  - **Scene containers:** one Container per scene (bg + props). Only the current one is visible.
  - **Prop targets:** each prop's `area.contains` is `controller.isActive(id) && pointInPolygon(…)`.
  - **Slide:** the outgoing container moves 0 → `−dir × W` and the incoming one `dir × W` → 0 (dir = sign(to − from)). W is the camera's visible world width. The tween is Sine.InOut over `Timing.touchTalkSceneSlideMs`. At the end the outgoing container is hidden and reset to x 0.
    - **Reduced motion:** the incoming container crossfades in (alpha 0 → 1 over the same time) above the outgoing one. Nothing moves.
  - **Scene bubbles:**
    - **Placement:** 3 bubbles at `sceneBubbleCentres(hudLayout, 3)` (spec-4-5), recomputed on resize. They sit above the scene containers and below the HUD, and they do not slide.
    - **Look:** each draws a circle in `sceneBubble.background`, one shadow (from the first `shadow` entry), the `scene-thumb-<id>` frame, and, on the current one, a static `sceneBubble.activeRing` (core/line/halo, no pulse).
    - **Tap:** each bubble is a `createTapTarget` circle of radius `size/2`. A press bounces the bubble (the `tappableProp.react` tween with `amplitude`), plays `sfx.shell.pop` and calls `controller.sceneTap(i)`. The ring moves at once.
  - **Reward:**
    - The `earned` port emits `reward:earned { gameId: 'touch-talk' }`.
    - `bus.scoped(this).on('reward:granted')` keeps only `gameId === 'touch-talk'` and anchors on `rewardAnchor()`. With a null anchor it does nothing.
    - It draws frame `decoration/<decorationId>/00` of the shell-resident `atlas.map` (spec-2-2; textures outlive the stopped Map) with the `trimmedCentre` origin and scale `1/renderScale`, above the props and below the bubbles. A missing texture or frame gives one warn and shows nothing.
    - It plays `planFlyOut` with scene tweens and destroys the item at the end. The item is not a tap target, so prop taps keep working while it flies.
- **`games/touch-talk/fly-out.ts › planFlyOut({ propRect, itemSize, safeRect, reduced })`** (pure):
  - **Start:** beside the prop, on the side facing the screen centre: the item centre sits at the prop edge ± (`spacing.targetGap` + itemW/2), at the prop centre y, clamped so the item rect stays inside `safeRect`.
  - **Pop:** over 0–`ui.flyOutPopMs` (200) it scales 0.5 → 1 and fades in.
  - **Sparkles:** spec-2-3's rule (`ui.sparkleCount` stars in `decorationItem.sparkle`, radius `sparkleRadiusPx`, fixed even angles, drifting outward `sparkleSpreadPx`, alpha strictly non-increasing 1 → 0) over [0, 600] ms. They never blink.
  - **Flight:** from 300 ms to `Timing.touchTalkFlyOutMs` (1000) it follows a quadratic arc (control point `ui.flyInArcPx` above the midpoint) to an exit point fully off-frame beyond the design's top-left corner (toward Home and the island), scaling 1 → `ui.flyOutEndScale` (0.6).
  - **Reduced:** no translation, no scaling and no sparkle drift. The item fades in over the pop, holds, and fades out over [600, 1000]. The sparkles only fade.

**Never:**
- No `round:complete`, `hint.*`, ring or hand on props, tally, ladder, difficulty entry, play-again entry, "sai", red or text.
- No grant logic, `ProgressStore`/`SessionStore` access or storage in `games/touch-talk`. The counter lives only in the controller and the snapshot, so a closed app restarts at sea with 0.
- `ATLASES.map` is never listed in touch-talk `assets` (Map would unload it at shutdown).
- No `setTimeout`, `this.sound`, `this.load`, `scene.*` navigation, raw pointer events, hand-entered coordinates, magic numbers or hex in games.
- No change to the layout JSON v1 format, AudioDirector rules, the guard, reward-service or the fly-in chain.
- No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **Props:** the kits have no bus, tree or toddler-style house, so those are script-built (as in 4.5). The stop sign was left out because "Biển báo" starts with the sea scene's name "Biển". Ids carry no scene prefix, and none clashes with sea.
- **The slide timer lives in the controller,** on the scene clock, so "prop taps during a slide are ignored" is node-testable and freezes with pause. Bubble taps during a slide are ignored too, so slides never chain.
- **A switch drops a waiting prop name** (it belongs to the old scene). A line already playing follows AudioDirector's queue/interrupt rule.
- **Counter reset:** reaching the threshold clears `touched` before `earned` runs, so the triggering prop starts nothing. Every prop counts again in the next group, so 16 distinct taps (30 props exist) → exactly 2.
- **Reward anchor:** the prop that triggered the reward. If a `reward:granted` arrives with no earn (dev hook), the last tapped prop is used. With nothing tapped, nothing is shown.
- **Decoration art reuse:** `atlas.map` is loaded by Map and stays in the texture cache while Map is stopped. Drawing that frame avoids rendering the 4 street decorations twice.
- **Fly-out goes toward Home (top-left).** Home is the way back to the island. The epic's "~1s" becomes `Timing.touchTalkFlyOutMs` 1000.
- **The active ring is static,** because the epic allows one prominent motion at a time and the ring is a state marker.
- **Voice lines** (unapproved, no `|`, keyword last):

  | id | text |
  |---|---|
  | `vo.touch-talk.scene.street` / `kitchen` | "Đường phố!" / "Nhà bếp!" |
  | `name.car` / `bus` / `traffic-light` / `tree` / `house` | "Ô tô!" / "Xe buýt!" / "Đèn giao thông!" / "Cái cây!" / "Ngôi nhà!" |
  | `name.police-car` / `truck` / `tractor` / `dumpster` / `cone` | "Xe cảnh sát!" / "Xe tải!" / "Máy cày!" / "Thùng rác!" / "Cọc tiêu!" |
  | `name.pot` / `frying-pan` / `apple` / `bread` / `banana` | "Cái nồi!" / "Cái chảo!" / "Quả táo!" / "Bánh mì!" / "Quả chuối!" |
  | `name.carrot` / `mug` / `spoon` / `egg` / `watermelon` | "Củ cà rốt!" / "Cái cốc!" / "Cái thìa!" / "Quả trứng!" / "Quả dưa hấu!" |

  Lines with a `review` flag (spec-3-1):
  - `police-car`: 'cảnh sát/công an';
  - `mug`: 'cốc/ly';
  - `spoon`: 'thìa/muỗng';
  - `cone`: 'cọc tiêu: từ khó, cân nhắc đổi vật'.
- **SFX placeholders** (4.5 rules: ≤ 350 ms, 50 ms fade-in, −20 dBFS, partials ≥ 300 Hz):
  - car: "bíp bíp" horn; bus: lower two-tone horn; traffic-light: ding; tree: leaf rustle; house: door knock;
  - police-car: soft short "wee-oo"; truck: deep "pưm" horn; tractor: "put-put"; dumpster: lid clank; cone: hollow tok;
  - pot: lid clang; frying-pan: sizzle; apple: crunch; bread: crackle; banana: swish;
  - carrot: snap; mug: clink; spoon: tink; egg: crack; watermelon: thump.
- **New values:**
  - `ui`: `sceneBubbleInsetPx 6`, `flyOutPopMs 200`, `flyOutEndScale 0.6`.
  - `Timing`: `touchTalkFlyOutMs 1000`.
  - `art.touchTalk`: `pavement '#C9CED6'`, `trunk '#9C6B3F'`, `wall '#FFF1D6'`, `floor '#F2C7A5'`, `counter '#C98B5B'`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Switch | at sea, `sceneTap(1)` | `slide(0,1)`; `setPrompt`+`say('vo.touch-talk.scene.street')`; `progress().partial.sceneId` 'street' | — |
| Tap during slide | `tap('car')` at 300 ms into the slide | no bounce, no sfx, no count; `isActive('car')` false; at 600 ms true | — |
| Old scene prop | after the switch, `tap('crab')` | ignored | — |
| Bubble during slide | `sceneTap(2)` mid-slide | ignored | — |
| Same bubble | `sceneTap(current)` twice quickly | one `say` of the scene name, no `slide` | — |
| Pending dropped | tap crab, switch within 350 ms | no `say` of the crab name | — |
| 8th distinct | 7 distinct, then an 8th new | exactly one `earned(id8)`; `touched` empty; `rewardAnchor()` id8 | — |
| Same prop ×8 | tap crab 8 times | no `earned` | — |
| 16 distinct | 16 distinct across 2 scenes | exactly 2 `earned` | — |
| Re-count | after the 1st reward, re-tap an old prop | counts 1 in the new group | — |
| Granted | real Bus + reward-service stub replying `{gameId:'touch-talk', decorationId:'fire-truck'}` | the scene adds one item `decoration/fire-truck/00` beside the anchor; prop taps still work | — |
| No service | `reward:earned` with no listener | nothing shown, no error, play continues | — |
| Other game grant | `reward:granted {gameId:'race'}` | ignored | — |
| Missing frame | the decoration frame is not in `atlas.map` | nothing shown | console.warn once |
| Home in kitchen | 5 distinct in the current group | `partial` = `{sceneId:'kitchen', touchedIds:[5 ids]}`, `questionIndex` 2 | — |
| Resume 5+3 | that snapshot via `scene.start('touch-talk',{level:0, seed, resume})` | kitchen shown directly; 3 new distinct → one `reward:earned` | — |
| Bad resume | `touchedIds` length ≥ 8, or an unknown id | clean sea, 0 | console.warn once |
| Fresh start | no resume (app reopened) | sea, `touched` empty | — |
| Fly-out plan | any prop rect, normal / reduced | start inside `safeRect`; end fully off-frame (normal) or at start (reduced); total 1000 ms; sparkle alpha non-increasing | — |
| Atlas overflow | frames exceed 3 pages | `atlas` fails, no write | exit 1 |

</intent-contract>

## Code Map

- `app/src/games/touch-talk/{talk,TouchTalk}.ts` -- planned in spec-4-5 (controller ports, `resumeTalk`, containers-less single scene). Extended here. `fly-out.ts` is new.
- `app/src/core/scene-bubbles.ts`, `app/tools/layout/hud-keep-out.ts › sceneBubbleKeepOutRect` -- planned in spec-4-5. Their centres are drawn here.
- `app/src/content/games/touch-talk.ts`, `content/assets.ts` (`ATLASES`, `BACKGROUNDS`, `AtlasRef.pages`) -- planned in spec-4-5/1-8/3-3.
- `app/src/core/bus.ts` -- real. `reward:earned` / `reward:granted` exist, and re-entrant emit is safe. `core/reward-service.ts` is planned in spec-2-2 and answers synchronously. `core/fly-in.ts` (sparkle rule) is planned in spec-2-3.
- `app/src/content/types.ts` -- real. `SnapshotPartials['touch-talk']` `{ sceneId; touchedIds }` is planned in spec-2-5 and unchanged.
- `app/src/core/{tokens,timing}.ts` -- real. They have `touchTalkSceneSlideMs` 600, `decorationFlyInMs`, `components.sceneBubble`, `decorationItem.sparkle` and `tappableProp`. `ui.sparkle*` / `flyInArcPx` are planned in spec-2-3.
- `app/src/content/{voice-lines,audio-catalog}.ts` -- real (`sfx.shell.pop` exists). `tools/audio/make-placeholders.ts` is real.
- `app/tools/render/{render,build}.ts`, `render/blender/build_touch_talk.py`, `tools/atlas/pack.ts`, `tools/layout/rules.ts` -- planned in spec-1-4/3-3/4-5.
- Sources: `assets/kenney/kenney_car-kit/Models/GLB format/{sedan,police,truck,tractor,wheel-default}.glb`, `kenney_city-kit-roads/…/{traffic-light,dumpster,construction-cone,road-straight,road-crossing}.glb`, `kenney_city-kit-commercial_2.1/…/low-detail-building-{a,b,c}.glb`, `kenney_food-kit/…/{pot,frying-pan,apple,loaf,banana,carrot,mug,utensil-spoon,egg,watermelon}.glb`.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/core/tokens.ts`, `app/src/core/timing.ts` (+ tests) -- the new values.
- [x] `app/src/content/voice-lines.ts`, `content/audio-catalog.ts`, `tools/audio/make-placeholders.ts` (+ test) -- 22 lines and 20 SFX. Run `npm run content:export && npm run tts && npm run audio:placeholders`.
- [x] `app/src/content/games/touch-talk.ts` (+ test), `content/assets.ts` -- the scenes, backgrounds, `TOUCH_TALK_REWARD_EVERY` and `pages: 3`.
- [x] `app/tools/render/render.ts` (+ test), `tools/atlas/pack.ts` -- the plates list, thumbnail frames and `SCREEN_MAX_PAGES['touch-talk']`.
- [x] `app/tools/render/blender/build_touch_talk.py`, `tools/render/build.ts` (+ test) -- the two plates, the 20 props and the colour args.
- [x] `app/tools/layout/rules.ts` (+ failing cases) -- the thumbnail-frame and id rules.
- [x] `src/content/generated/touch-talk.layout.json`, `public/assets/atlases/touch-talk{.json,-0..n.png}`, `public/assets/bg/touch-talk-{street,kitchen}.png` -- produce them with the real Blender.
- [x] `app/src/games/touch-talk/talk.ts` (+ test) -- the controller changes. Its test covers every non-visual matrix row with a real `Bus`. 4.5's "40 taps → 0 `reward:earned`" row becomes "40 taps on ≤ 7 distinct props".
- [x] `app/src/games/touch-talk/fly-out.ts` (+ test) -- `planFlyOut`.
- [x] `app/src/games/touch-talk/TouchTalk.ts` -- the containers, slide/crossfade, bubbles, `earned` emit and `reward:granted` fly-out.
- [x] `app/src/core/scene-bubbles.test.ts` -- at both supported aspects, the 3 circles lie in the interactive rect, outside `hudKeepOutRects()` and inside `sceneBubbleKeepOutRect()`, with gaps ≥ 24.
- [x] `app/README.md` -- provenance rows for the new models and script-built props, plus the new audio.

**Acceptance Criteria:**
- Given the real Blender, when running `art:build`, `render` and `atlas` for `touch-talk`, then `bg/touch-talk-street.png` and `bg/touch-talk-kitchen.png` (2048×1536) exist, the atlas has ≤ 3 pages (each ≤ 2048², each file ≤ 8 MiB) with `idle`/`react` frames for all 30 props and 3 `scene-thumb-*` frames, and `preview-street.png` / `preview-kitchen.png` show 10 bright props clear of the corners, the HUD zones and the bubble column.
- Given `npm run dev` at 1180×820 touch emulation in the beach scene, when the child looks at the right edge, then three round 88 px thumbnails sit below the Speaker, with the beach one ringed.
- Given the beach scene, when the child taps the street bubble, then within 100 ms the bubble bounces with a pop, the beach slides out as the street slides in (~0.6 s), "Đường phố!" is read and the ring moves to the street bubble. Taps on props during the slide do nothing. Tapping the car then gives a horn and "Ô tô!".
- Given the street, when the child taps the street bubble, then only "Đường phố!" is read again. With `prefers-reduced-motion`, a switch is a crossfade.
- Given Epic 2 is built, when the child taps 8 different props across scenes, then a fire truck appears beside the 8th prop with fading stars and flies off toward the top-left in about 1 s while taps keep working. Back on the island, it flies to the street station (`pendingFlyIns`).
- Given Epic 2 is absent (no reward-service installed), when 8 different props are tapped, then nothing appears and play continues without errors.
- Given the kitchen with 5 distinct props in the current group, when the child taps Home and the shell restarts the game with that snapshot, then the kitchen opens directly and 3 new props give one decoration. After a page reload, the game starts at the beach and needs 8 props again.

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

- 2026-10-12: subagent review layers NOT run (not authorised); inline self-review. Notes: (1) headless Blender ignores -S for the Python context: render_screen.py and the builder switch `window_manager.windows[0].scene`; plate scenes get a fake user so they are saved. (2) Street/kitchen props are fitted into a fixed 10-box grid on screen (unprojected onto each row's surface) instead of world XY tables. (3) No creatureYellow token exists: the bus uses a new `art.touchTalk.bus` (#FFD23F). (4) Thin props: the spoon is tilted and the traffic light made chunkier (PROP_TILT / PROP_STRETCH). (5) New Timing values touchTalkFlyStartMs (300) and touchTalkSparkleMs (600) name the plan's fixed times. (6) The kitchen camera sits higher than the sea/street one (the shelf must be below it). (7) The reward fly-out and bubbles are scene code without a Phaser test harness; the controller and planFlyOut carry the matrix rows. (8) In-browser AC walkthroughs not run.

## Design Notes

The controller owns every rule the ACs count (active scene, slide window, distinct counter), so the Phaser scene just mirrors it:

```ts
const c = createTalkController({ scenes: TOUCH_TALK_SCENES, rewardEvery: TOUCH_TALK_REWARD_EVERY, rng, resume,
  audio, view: { bounce, wiggle, slide: (a, b) => this.slide(a, b) },
  earned: () => bus.emit('reward:earned', { gameId: 'touch-talk' }) });
scoped.on('reward:granted', (e) => { if (e.gameId === 'touch-talk') this.flyOut(e.decorationId, c.rewardAnchor()); });
```

reward-service answers inside the `emit`, so the fly-out starts in the same tap. That is fine because the bounce and SFX already ran in step 1.

## Verification

**Commands:**
- `cd app && npm run content:export && npm run tts && npm run audio:placeholders && npm run audio:check` -- expected: 22 new voice files with hashes and 20 `sfx.touch-talk.*` files.
- `cd app && npm run art:build -- touch-talk && npm run render -- touch-talk && npm run atlas -- touch-talk` -- expected: exit 0; a second `render` gives a byte-identical layout and identical thumbnails.
- `cd app && npm run render -- fishing` -- expected: unchanged output (the one-plate path is unaffected).
- `cd app && npm run check` -- expected: exit 0, including the talk, fly-out, scene-bubbles, content and rules tests.
- `cd app && npm run build` -- expected: exit 0, with every touch-talk atlas page and bg in `dist/assets`.

**Manual checks:**
- Run the AC walkthroughs at 1180×820 and 1024×768 in landscape. Bubbles never sit under the Speaker, and while sliding the next scene never peeks in early.
- With Epic 2, run `window.bhcDev` fly-in and real play: the fly-out never blinks, and only one thing moves prominently.
- Listen to the 22 lines and 20 sounds. Leave `approved` unset, and point the parent to the review-flagged words.
