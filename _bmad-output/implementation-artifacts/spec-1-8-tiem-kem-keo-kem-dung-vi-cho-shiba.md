---
title: 'Story 1.8 — Tiệm kem: kéo kem đúng vị cho Shiba'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'NO_VCS'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-kart-chay-toi-tram.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-6-nut-nha-va-loa-chong-cham-nham.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-pipeline-hinh-render-blender-atlas-layout.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-be-nghe-giong-doc-tieng-viet.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** After the kart drive (Story 1.7), `ice-cream` is still an empty skeleton scene. Several pieces do not exist yet:
- the Tiệm kem art, layout and voice;
- a way to drag anything (`DragController`, drop targets, `setPickable` / `setSnapScale`);
- a `hint.*` API for the game to report attempts to.

So the child cannot play FR4/FR6: hear Shiba ask for a flavour plus a colour, and drag that scoop onto the cone.

**Approach:**
- **Art:** a new Blender builder makes `art/ice-cream.blend`. It contains Quaternius `ShibaInu.fbx` recoloured, a `counter-pink` counter with a `counter-top` top, the Kenney cone, and four Kenney scoops, each with its own shape detail. The spec-1-4 tools (`render`, `atlas`) then produce `atlas.ice-cream`, `bg.ice-cream` and `ice-cream.layout.json`, and `npm run check` validates them.
- **Input:** `core/input` gains a `DragController`, drop targets and pure drop maths.
- **Hints:** `core/hint-director` ships as a stub with the final AD-5 signatures.
- **Game:** `games/ice-cream` replaces the skeleton. A pure round model handles serve, wrong, rest and off-counter drops, and the questions come from `seed`. The scene only wires Phaser.

## Boundaries & Constraints

**Always:**
- **Art builder** (`tools/render/blender/build_ice_cream.py`, run with `npm run art:build -- ice-cream`; it follows every spec-1-4 invocation, temp-dir and naming rule):
  - **Base scene:** open the vendored `art/src/map-v2.blend`. Delete the `GameIce` preview collection and `HintRing`. Use the camera `CamGame2` as the framing start, at eye level close to the counter. Re-aim it with named world-unit constants so the rules below pass. Render at 2048×1536. The island stays as the static backdrop.
  - **Counter:** a box built by the script. The front face uses `Tokens.colors.counterPink` and the top face `counterTop`; both hex values are passed in by `build.ts` and converted to linear.
  - **Shiba:** import Quaternius `animals/ShibaInu.fbx` and force alpha to 1 and OPAQUE. Recolour it with the same helper `build_map.py` uses (moved to `tools/render/blender/common.py › recolor_creature`): `creatureOrange` fur with a white face and belly. Place it centre-back, behind the counter, facing the camera.
    - Timeline frame 1 is a pose from action `AnimalArmature|Idle`.
    - Frames 10–13 come from `AnimalArmature|Eating` (the lick). On those frames, each pose bone whose name contains `Tail` is rotated ±20° alternately (the wag). If there is no such bone, print one warning and keep the frames.
  - **Cone:** Kenney `food-kit/.../ice-cream-cne.glb`, standing on the counter top at the centre. It is part of the plate.
  - **Scoops:** one per flavour, built from the Kenney `ice-cream-scoop-mint.glb` mesh. The material becomes flat Principled with the base colour from `Tokens.art.flavour[id]`. Each flavour has its own shape detail:

    | flavour | detail |
    |---|---|
    | `strawberry` | Kenney `strawberry.glb` on top, original colormap |
    | `chocolate` | 6 raised chip bumps (icosphere, subdivisions 1) in `art.flavourDetail.chip`, at fixed spherical coordinates |
    | `vanilla` | plain |
    | `mint` | two small solidified diamond leaves in `creatureGreen` |

    All four are posed at the `slot.scoop-2` position (each one renders in its own pass). They are scaled so the trimmed width is at least `draggableItem.minSize` in design px.
- **Sprite collections and render extensions** (`render_screen.py`, generic and backward compatible with map):
  - The collections are `sprite.shiba`, `sprite.scoop-strawberry|chocolate|vanilla|mint`.
  - A collection custom prop `states` (JSON `{state: [timelineFrames]}`) renders frames `<object>/<state>/<nn>`. The default is `{"idle":[1]}`. Shiba uses `{"idle":[1],"happy":[10,11,12,13]}`.
  - `holdout_occluders: true` (Shiba) turns every non-sprite object into a holdout during that sprite's pass, so the counter cuts off its lower body.
  - `movable: true` (the scoops) sets `visible_shadow = False` on its objects in the plate pass, so no baked shadow is left behind.
  - The plate renders at frame 1.
- **Layout objects** (spec-1-4 grammar; the layout JSON v1 format is unchanged). Values come from `screen` in `content/games/ice-cream.ts`, and `npm run check` fails naming any missing id:
  - `anchor.shiba` and `anchor.cone`: ground pivots computed by the builder, as in spec-1-4.
  - `hit.shiba`: the hull of Shiba's visible evaluated vertices.
  - `hit.counter`: the whole counter.
  - `hit.counter-upper`: the counter top face plus the upper half of the front face.
  - `slot.scoop-1..4`: scoop home centres on the counter top, left to right.
  - `slot.cone-1..3`: stacked scoop centres on the cone. The builder computes them from the cone top and the scoop height.
- **Screen rules** (`tools/layout/rules.ts › validateIceCream(layout, atlasJson)`, run by `render`, `atlas` and `validate:content`):
  - Lower third, above the bottom dead strip: each `slot.scoop-*` and `anchor.cone` has `512 ≤ y ≤ 694 − draggableItem.minSize/2`.
  - Row spacing: the gaps scoop-1→scoop-2, scoop-2→cone, cone→scoop-3 and scoop-3→scoop-4 are each within `ui.iceCreamRowGap ± ui.iceCreamRowTolerance` (180 ± 20) in x, and within `spacing['2']` in y.
  - Every slot lies inside the spec-1-4 interactive rect, inset by `minSize/2`.
  - Shiba sits centre-back: `|anchor.shiba.x − 512| ≤ 1024/6` and `anchor.shiba.y < anchor.cone.y`.
  - Sizes: the frame `shiba/idle/00` has a trimmed height ÷ renderScale of at least `character.minSize` (220). Each `scoop-*/idle/00` has a trimmed width ÷ renderScale of at least 90.
  - The atlas has every frame listed in `screen.frames`, and `bg.ice-cream` is 2048×1536. The spec-1-4 bg size rule now applies to every `BACKGROUNDS` entry.
- **DragController** (`core/input/drag-controller.ts`; builds on the spec-1-6 guard API):
  - `createDraggable(router, { circle, onLift(p), onMove(p), onDrop(p), onCancel() }) → Draggable`, with `setCircle`, `destroy` and `object?` (for hint visuals).
  - **Lift:** a primary press that hits the circle and passes `inputGuard.isPickable(d)` calls `guard.setDragging(pointer, true)`, stores the grab offset and runs `onLift` in the same `pointerdown` handler.
  - **Move:** the router forwards `pointermove` for the primary pointer only. The point is `clampDrag(toDesign(p) − offset, dragBounds(), exclusions, itemRadius)`.
  - **Release:** the primary's release calls `onDrop(lastPoint)`. If the guard self-heals the primary (pause, lost up, scene switch), `onCancel()` runs instead.
  - **Guard API:** `inputGuard.setPickable(d, on)`, `isPickable(d)`, `setSnapScale(t, k)` and `snapScale(t)`, backed by a `WeakMap`. They are the only way to change pickability or snap radius. A drag that is already running continues when its item becomes unpickable.
- **Drop maths** (`core/input/drop.ts`, pure):
  - `dragBounds(view)`: `visibleDesignRect` inset by (dead strip + local inset) ÷ s.
  - `hudExclusions(view)`: the `hudLayout` circles, r = 44 + hitPad.
  - `clampDrag`: clamps the point into the bounds shrunk by the item radius and pushes it radially out of each exclusion circle grown by the item radius.
  - `createDropTarget({ id, circle } | { id, polygon })`: a circle's radius is multiplied by `snapScale(target)`; polygons do not scale.
  - `nudgeApart(p, others, minDist, rect)`.
- **Drop resolution for a scoop** (`games/ice-cream/round.ts`, pure). The first match wins:
  1. Inside the cone target (circle at `slot.cone-1`, r = `dropTarget.snapRadius` × scale): `serve`.
  2. Inside `hit.shiba`: `serve`.
  3. Within `snapRadius/2` of its own pre-lift position: `home` (settles back, no hint).
  4. Inside `hit.counter-upper`: `serve`.
  5. Inside `hit.counter`: `rest`.
  6. Anywhere else: `off`.
- **Outcomes:**
  - **`serve`, correct flavour:**
    - The scoop tweens to the next `slot.cone-*` over `dropTarget.snap.durationMs` with ease-out and a 1.05× bounce, and `sfx.ice-cream.snap` plays.
    - A fresh scoop of that flavour pops in at its home.
    - Shiba celebrates. It plays the `happy` frames and bounces through `character.celebrate.scales`, repeating `repeat` times over `durationMs` (reduced motion multiplies the amplitude). `sfx.ice-cream.happy` (~1.5 s) plays.
    - Then `hint.questionDone()`.
    - While celebrating, every scoop is unpickable.
  - **`serve`, wrong flavour:** the scoop floats back to its pre-lift position over `draggableItem.return.durationMs` with ease-out, then `hint.wrong()`. There is no other effect: no red, no ✗, no shake, no error sound.
  - **`rest`:** the scoop stays at `nudgeApart(drop point, other scoop positions, minSize, hit.counter bbox ∩ dragBounds)`. That becomes its new pre-lift position.
  - **`off`:** after `Timing.dragOffCounterReturnDelayMs` (on the scene clock), the scoop slides back to its pre-lift position. Lifting it again cancels the slide.
  - **No lost progress:** the cone contents and the question survive every outcome.
- **Questions** (`games/ice-cream/questions.ts`, pure):
  - `questionFor(seed, index, level)` uses `core/rng.ts › mulberry32((seed + index × 0x9E3779B9) >>> 0)`.
  - It shuffles the four flavours, takes `ladder[level].flavours`, and picks the target. When `index > 0`, the target differs from question `index − 1`'s.
  - Homes come from `HOME_SLOTS[n]`; for n = 2 they are `['scoop-2','scoop-3']`.
  - The result is deterministic: the same inputs always give the same question.
- **Round flow (Story 1.8):**
  - `build()` lays out the plate, Shiba (breathing `1 ↔ ui.shibaBreathScale` scaleY around `anchor.shiba` over `Timing.shibaBreathMs`, yoyo; paused while celebrating) and question 0.
  - Each question calls `hint.beginQuestion({ promptLineId: 'vo.ice-cream.ask.<target>', retryLineId: 'vo.ice-cream.retry.<target>', step: { correct, distractors, target: coneTarget, action: 'drag' } })`.
  - `Timing.correctMusicMaxMs` after a correct snap, the cone scoops fade out over `sceneFadeMs` (Shiba "ate" them), the scoops are rebuilt and question `index + 1` begins.
  - There is no `round:complete` in 1.8 (Story 1.10). Home is the only exit.
- **Hint stub** (`core/hint-director.ts`; the factory `createHint(scene, deps)` is used by `MiniGameBase`, and Story 1.9 swaps in the real implementation behind it):
  - `beginQuestion(q)` calls `audio.setPrompt(q.promptLineId)` and `audio.say(q.promptLineId)`, and stores `q.retryLineId`.
  - `wrong()` calls `audio.say(retryLineId)`, and is a no-op with no active question.
  - `stepDone(next, lines?)` and `replayPrompt()` are valid no-ops.
  - `questionDone()` clears the active question.
  - Types: `HintStep = { correct: Draggable[]; distractors: Draggable[]; target: DropTarget | null; action: 'drag'|'tap'|'trace'; path? }`.
  - The game never calls `audio.say`. Its round commands carry no voice ids, and `IceCream.ts` uses audio only for `sfx`.
- **Home and abandon:**
  - Spec-1-7's `MiniGameBase` handles `hud:home`. Before emitting, it calls `hint.questionDone()` and removes the scene's timed events (`time.removeAllEvents()`, so no pending slide or next question fires).
  - `snapshot()` = `{ v:1, level, seed, questionIndex, partial: { placed: FlavourId[] } }`.
  - After that the game is inert.

**Never:**
- No escalation, ring, hand, timer or `hint:level` (Story 1.9). No multi-scoop questions, `round:complete` or `nextLevel` (Story 1.10).
- No red, ✗, shake, wrong sound, praise or "sai". No text on screen.
- No `setTimeout`. No `this.sound`, `this.load` or `scene.*` navigation in games. No raw pointer events outside `core/input`. No magic numbers or hex in games.
- No hand-entered design coordinates. Every position comes from `LAYOUTS['ice-cream']`.
- No change to the spec-1-4 JSON format. Never read `.working/` or `assets/` at runtime.
- No writing files that contain backslashes through a shell heredoc. No git.

**Decisions (auto-run defaults):**
- **Flavour ids:** `strawberry | chocolate | vanilla | mint`.
- **Flavour colours** (`Tokens.art.flavour`, in core, because DESIGN.md defines none): strawberry `#FF8CC6`, chocolate `#6B3E26`, vanilla `#FFF3D6`, mint `#3FA86A`, and `flavourDetail.chip` `#3A2318`. Their relative luminances are ≈ .44 / .07 / .90 / .30, so no pair differs by less than 0.1 (enforced by a test).
- **Voice lines** (unapproved; spoken colour words: hồng, nâu, trắng, xanh):

  | id | text |
  |---|---|
  | `vo.ice-cream.ask.<f>` (strawberry, vanilla) | "Cho bạn Shiba \| kem <vị> màu <màu> nào!" |
  | `vo.ice-cream.ask.mint` | "Cho Shiba \| kem bạc hà màu xanh nào!" (fits the 8-word limit) |
  | `vo.ice-cream.ask.chocolate` | "Cho Shiba \| kem sô-cô-la nào!" (7 words; no colour word) |
  | `vo.ice-cream.retry.<f>` (strawberry, vanilla, mint) | "Mình tìm \| kem <vị> màu <màu> nhé!" |
  | `vo.ice-cream.retry.chocolate` | "Mình tìm \| kem sô-cô-la nhé!" (7 words) |

  The vị words are dâu, sô-cô-la, vani and bạc hà. Every line has `keywordPauseMs: 300`. `voiceWords` splits on hyphens, so "sô-cô-la" counts as 3 words; every line must stay ≤ 8 (Spec Change Log, 2026-10-08, found while planning 1.10).
- **SFX placeholders:** `sfx.ice-cream.snap` (a soft plop, ~150 ms) and `sfx.ice-cream.happy` (a major arpeggio, ~1.5 s). Both have a 50 ms fade-in and peak at −20 dBFS.
  - `bootAudio()` now loads only `shell`-scoped and `music.*` catalog ids. Game-scoped ids load with the game, which keeps spec-1-7's no-overlap test true.
- **Game assets:** `GameAssets` gains `images: ImageRef[]`, and `loadPlan` emits `load.image`. Tiệm kem's assets are `{ atlases:[ATLASES['ice-cream']], images:[BACKGROUNDS['ice-cream']], audio:[all vo.ice-cream.*, sfx.ice-cream.*] }`.
- **Ladder:** `ladder = [{ id: 'pick-1-of-2', flavours: 2, scoops: 1, ordered: false }]` (Story 1.10 extends it). `HOME_SLOTS` = `{2:[scoop-2,scoop-3], 3:[scoop-1,scoop-2,scoop-3], 4:[scoop-1..4]}`.
- **Endless questions** until Home in 1.8, so a child is never left waiting after a correct answer. Story 1.10 caps it.
- **Sprites:** scoops and Shiba are placed with a trimmed-centre pivot from `core/ui/sprite-pivot.ts › trimmedCentre(frame, renderScale)`; Map's kart may reuse it. A scoop's hit circle is r = max(w,h)/2 + `draggableItem.hitPad`. The lift shadow is an ellipse from `draggableItem.liftShadow`.
- **New values:**
  - `Timing.shibaBreathMs: 2400`.
  - `ui.shibaBreathScale: 1.02`, `iceCreamRowGap: 180`, `iceCreamRowTolerance: 20`.
- **Tests for games:** the Vitest include gains `src/games/**/*.test.ts`. Tested game files must not import Phaser.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enter | `{level:0, seed:7}` | plate, Shiba breathing, 2 scoops at scoop-2/3; `beginQuestion` with ask/retry of the target | — |
| Lift | first finger on a scoop | 1.1× + shadow in the same handler; follows the finger | — |
| Clamp | drag to (5, 400) or over the Speaker | held inside the bounds and outside the Hud circle | — |
| Correct on cone | target dropped 80 px from cone-1 | snap 200 ms to cone-1; respawn at home; Shiba happy; `questionDone`; next question after 2 s | — |
| Correct on Shiba / upper counter | drop inside `hit.shiba` or `counter-upper` | same as on the cone | — |
| Wrong serve | distractor on the cone | floats back 500 ms; `hint.wrong()` → `say(retry.<target>)` | — |
| Own home | dropped within 50 px of its pre-lift spot | settles; no hint | — |
| Rest | lower counter, overlapping another scoop | stays, nudged ≥ 90 px apart; new home for floats | — |
| Off counter | dropped on the grass | after 1500 ms slides back; re-lift cancels | — |
| Second finger | during a drag, another touch (incl. Home) | ignored; the drag continues | — |
| Pause mid-drag | AudioUnlockOverlay pauses | `onCancel`; the scoop returns to its pre-lift spot | — |
| Not pickable | `setPickable(d,false)` | a press on it hits nothing; a running drag continues | — |
| Snap scale | `setSnapScale(cone,2)` | cone radius 200 | — |
| Celebrating | press any scoop | nothing (unpickable) | — |
| Home | `hud:home` mid-question | one `round:abandon` with `partial.placed`; no later voice or timer; inert | — |
| Stub before question | `wrong()` | no-op | — |
| Questions | same seed/index | identical; consecutive targets differ; all 4 flavours seen in indexes 0..19 | — |
| Missing frame | `scoop-mint/idle/00` absent | one warn; the hit circle still works | console.warn |
| Layout missing id | `slot.cone-1` absent or a rule broken | render, atlas and check fail naming it | exit 1 |

</intent-contract>

## Code Map

- `app/src/games/mini-game-base.ts`, `games/registry.ts`, `games/ice-cream/IceCream.ts` -- planned in spec-1-7 (base, guard, registry, skeleton). Add `hint`; abandon cleans up; replace the skeleton.
- `app/src/core/input/{guard,tap-router,tap-target,space}.ts` -- planned in spec-1-6 (`isPrimary`, `setDragging`, `isDragging`, `toDesign`, `visibleDesignRect`, `localInsets`). The router gains a `pointermove` forward.
- `app/src/core/hud.ts › hudLayout` -- planned in spec-1-6; reused for the exclusions.
- `app/src/core/game-assets.ts`, `content/games/{types,ice-cream,index}.ts`, `core/session-store.ts`, `core/motion.ts` -- planned in spec-1-7.
- `app/src/content/{assets,layouts,layout-types}.ts`, `tools/layout/{rules,to-layout}.ts`, `tools/render/{build,render}.ts`, `tools/render/blender/{build_map,render_screen}.py`, `tools/atlas/pack.ts` -- planned in spec-1-4. Register screen `ice-cream`.
- `app/src/core/boot-load.ts` (`bootAudio`), `content/audio-catalog.ts`, `content/voice-lines.ts`, `content/validate.ts`, `tools/lint/validate-content.ts`, `tools/audio/make-placeholders.ts` -- these exist today.
- `app/src/core/tokens.generated.ts` -- `components.{draggableItem,dropTarget,counterTray,character}`, `spacing.snapRadius`, `colors.counterPink|counterTop|creatureOrange|creatureGreen`. `core/tokens.ts` (`ui`), `core/timing.ts` (`dragOffCounterReturnDelayMs`, `correctMusicMaxMs`).
- `app/src/core/bus.ts`, `content/types.ts` -- `round:abandon` and `Snapshot` exist.
- `app/vite.config.ts` (the test include), `app/eslint.config.js` (the games rules).
- Sources: `assets/quaternius/animals/ShibaInu.fbx` (actions `AnimalArmature|Idle`, `|Eating`), and `assets/kenney/kenney_food-kit/Models/GLB format/{ice-cream-cne,ice-cream-scoop-mint,strawberry}.glb`. The mockup is `_bmad-output/planning-artifacts/ux-designs/ux-be-hoc-choi-2026-10-08/mockups/render-tiem-kem-v2.png`.

## Tasks & Acceptance

**Execution:**
- `app/src/core/tokens.ts`, `app/src/core/timing.ts` (+ tokens test for the luminance gap) -- `art.flavour`, `art.flavourDetail`, the new `ui` values and `shibaBreathMs`.
- `app/src/content/voice-lines.ts`, `app/src/content/audio-catalog.ts`, `app/tools/audio/make-placeholders.ts` (+ test), `app/src/core/boot-load.ts` (+ test) -- the 8 lines and 2 SFX, plus the shell-only boot audio. Generate them with `npm run tts` and `npm run audio:placeholders`.
- `app/src/content/games/types.ts`, `app/src/content/games/ice-cream.ts`, `app/src/content/assets.ts`, `app/src/content/layouts.ts` -- `ImageRef`, `images`, `screen` requirements, `FLAVOURS`, `ladder`, `HOME_SLOTS`, assets, and the `ice-cream` atlas, background and layout entries.
- `app/src/core/game-assets.ts` (+ test) -- image load calls and image release.
- `app/tools/render/blender/common.py`, `build_ice_cream.py`, `render_screen.py`, `app/tools/render/build.ts`, `render.ts` (+ tests) -- the builder, the `states` / `holdout_occluders` / `movable` props, and colour args from Tokens. A map re-render must stay byte-identical.
- `app/tools/layout/rules.ts` (+ test), `app/tools/atlas/pack.ts`, `app/tools/lint/validate-content.ts` (+ test) -- `validateIceCream`, required ids per `screen`, the bg rule for every background, and a test for each rule.
- `src/content/generated/ice-cream.layout.json`, `public/assets/atlases/ice-cream.{png,json}`, `public/assets/bg/ice-cream.png` -- produce them with `npm run art:build -- ice-cream && npm run render -- ice-cream && npm run atlas -- ice-cream` and the real Blender. Fix rule failures in the builder constants.
- `app/src/core/rng.ts` (+ test) -- `mulberry32`.
- `app/src/core/input/guard.ts`, `tap-router.ts`, `drag-controller.ts`, `drop.ts` (+ tests) -- pickable and snap scale, the move forward, the drag lifecycle and cancel, clamp, exclusions, drop targets and the nudge.
- `app/src/core/hint-director.ts` (+ test) -- the stub and `createHint`. The AC test: `wrong()` says the current `retryLineId`, and is a no-op before any question.
- `app/src/core/ui/sprite-pivot.ts` (+ test) -- `trimmedCentre`.
- `app/src/games/ice-cream/questions.ts`, `round.ts` (+ tests) -- the question derivation and the drop resolution, outcome commands and snapshot, covering every matrix row.
- `app/src/games/mini-game-base.ts`, `app/src/games/ice-cream/IceCream.ts` -- `hint`, the abandon cleanup, and the scene wiring (images, draggables, tweens, celebration, next question).
- `app/vite.config.ts` -- add `src/games/**/*.test.ts` to the include.
- `app/README.md` -- the provenance rows for ShibaInu, the food-kit models and the new audio.

**Acceptance Criteria:**
- Given the real Blender, when running `art:build`, `render` and `atlas` for `ice-cream`, then `atlas.ice-cream` (1 page, ≤ 2048²), `bg.ice-cream` (2048×1536) and `ice-cream.layout.json` exist, and `preview.png` shows the orange-white Shiba centred behind the pink counter with scoop, cone and scoop in one row in the lower third.
- Given `npm run dev` at 1180×820 touch emulation, when the kart reaches the truck, then the Tiệm kem screen shows a breathing Shiba and two distinct scoops, and a line like "Cho bạn Shiba… kem dâu màu hồng nào!" plays. The Speaker replays it.
- Given that screen, when the child drags the asked scoop onto the cone, Shiba or the upper counter, then it snaps onto the cone with a bounce, a new scoop appears at its home, Shiba wags, licks and bounces with a short happy tune, and a new request follows about 2 s later.
- Given a wrong scoop dropped on the cone, when it is released, then it glides back and only the retry voice ("Mình tìm kem … nhé!") plays. There is no red, no shake and no error sound.
- Given a scoop dropped on the grass, when about 1.5 s passes, then it slides home. A scoop dropped on the lower counter stays put without overlapping another.
- Given a question in progress, when the child taps Home, then "Về đảo nào!" plays, the island returns with the kart at the truck, and exactly one `round:abandon` was emitted.
- Given `slot.cone-1` removed from the layout JSON, when running `npm run check`, then it fails naming `cone-1`.

## Spec Change Log

- **2026-10-09: `slot.scoop-1..4` are the scoops' contact points on the counter top, not their centres.** A scoop centre sits about 25 design px above `anchor.cone` (a ground pivot), which breaks the "within `spacing['2']` in y" row rule. With contact points the row lies on one projected line. The scene draws a scoop at `slot + (trimmedCentre(scoop frame) − slot.scoop-2)`, because every scoop frame is rendered at `slot.scoop-2`. `slot.cone-*` stay scoop centres, as specified.
- **2026-10-09: Shiba placement.**
  - The island's own `A_Shiba` is pruned too; otherwise two dogs would show.
  - The FBX actions key the armature object itself, so assigning an action reset its transform. The placement (location, yaw 25°, scale 0.62) therefore goes on a parent empty `shiba-root`.
  - Shiba stands at z 1.25 behind the counter, on nothing the camera sees. With its ground pivot on the island ground, `anchor.shiba.y < anchor.cone.y` cannot hold: from a camera above the counter, a ground point behind it always projects lower than the counter top.
  - It needs scale 0.62 (about 1.9 m) to reach `character.minSize` (trimmed height 254 px).
  - `sprite.shiba` also gets `movable = 1`, so it leaves no floating shadow in the plate.
- **2026-10-09: the happy frames sample `|Eating` frames 3, 6, 8 and 6.** From frame about 10 on, the Eating action lowers the head to the ground, behind the counter, which left a headless dog. The early frames show the dip towards the cone.
- **2026-10-09: `hit.counter-upper` covers the upper half of the *visible* front face, without padding.** The front face runs past the bottom of the frame, and every hit is padded by `hitPad`. As specified, the upper area reached below the drag bounds, so `rest` could never happen.
  - The builder now takes the half down to the interactive rect's bottom (`rect.y1`).
  - `toLayout` gained an `unpadded` id list. The JSON format is unchanged.
  - The camera target was lowered so the row sits at y 520 and more of the front shows.
  - Scoops clamp with radius `draggableItem.minSize/2` instead of their full half size.
- **2026-10-09: `pack.ts` clears alpha < 24 before trimming (`ALPHA_NOISE_FLOOR`).** EEVEE leaves scattered alpha 1–20 pixels around a sprite rendered against holdouts. They widened Shiba's trimmed frame to 1272 px and showed as faint specks. A re-pack of `map` would change slightly for the same reason; it was not re-packed.
- **2026-10-09: guard drag hooks.** `GuardTarget.onPress(p, pointer?)` passes the pointer, so the DragController can call `setDragging` itself. Targets may add `onMove`, `onEnd` (the primary's release, anywhere) and `onCancel`. `onCancel` runs on a self-heal and on a release whose router is inactive, for example a scene paused by the unlock overlay. The router forwards `pointermove`, and its wrapper drops drag callbacks after `destroy`. `HotspotPolygon` wraps its callback, so it still receives only the point.
- **2026-10-09: small API shapes.**
  - `Tokens.art.creatureLight` `#FFF8EE` is Shiba's face and belly; the FBX `Main_Light` is grey.
  - `build.ts` passes every `Tokens.colors` entry, plus `art`, `draggableMinSize` and `rowGap`.
  - `ImageRef = BackgroundRef`, and `GameAssets.images` is optional.
  - `GameContent.screen` holds the required ids and frames; validate-content and `pack.ts` read it.
  - `core/rng.ts` also has `questionSeed`, `randInt` and `shuffled`.
  - `createHint(scene, deps = { audio })`.
  - `drop.ts` also exports `intersectRect`.
  - `drag-controller.ts` exports `defaultDragArea`.
  - The cone uses 0.85 × the scoop scale.
- **2026-10-09: a wrong serve calls `hint.wrong()` at release, together with the float-back,** rather than after the 500 ms float, so the retry voice follows the action at once.
- **2026-10-09: `render.ts › replaceDir` copies the current render dir aside when Windows refuses to rename it (EPERM).** This happened on three of the ice-cream renders.
- **2026-10-09: `pack.ts` trims to the bounds of alpha ≥ 64, plus 2 px.** Holdout edges leave 1 px slivers up to alpha ~60 at the frame border.
- **2026-10-09: the MiniGameBase tests use a minimal `TestGame` subclass.** The real Tiệm kem `build()` needs a real Phaser. The registry test still constructs `IceCream`.

## Review Triage Log

## Design Notes

**Why the game never touches the voice for prompts:** every prompt and retry goes through `hint.*`, so Story 1.9 can replace `createHint` with the timed HintDirector without editing `IceCream.ts`. The stub's `setPrompt` keeps the Story 1.6 Speaker useful in 1.8.

**Why a pure round model:** the drop order (cone, Shiba, home, upper counter, counter, off) and its outcomes are the story's logic, so Vitest owns them. The scene only applies commands:

```ts
onDrop(p) { for (const c of this.round.drop(item.id, p)) this.apply(c); }
// → {snap, slot} | {floatBack, to} | {rest, at} | {returnLater, ms} | {respawn, flavour} | {celebrate} | {hintWrong} | {questionDone}
```

**Why `serve` wins over `rest` on the upper counter:** the AC counts "nửa trên quầy" as giving the scoop to Shiba. Resting therefore only happens on the lower counter. The own-home check comes before the upper counter, so a hesitant child who drops a scoop back where it was gets no wrong hint.

## Verification

**Commands:**
- `cd app && npm run tts && npm run audio:placeholders` -- expected: the 8 `vo.ice-cream.*` lines and 2 `sfx.ice-cream.*` files are written; a second `tts` run skips them.
- `cd app && npm run art:build -- ice-cream && npm run render -- ice-cream && npm run atlas -- ice-cream` -- expected: exit 0. A second `render` gives a byte-identical layout, and `render -- map` still matches the committed map layout.
- `cd app && npm run check` -- expected: exit 0. Vitest covers every matrix row, and validate:content reports the ice-cream layout, frames and voice lines.
- `cd app && npm run build` -- expected: exit 0, and `dist/assets/atlases/ice-cream.png` is present.

**Manual checks:**
- In `preview.png` and in the game, each flavour is distinguishable in greyscale: the strawberry on top, the chips, the plain ivory scoop and the leaf. Shiba is not grey-brown.
- With multi-touch: hold a scoop with one finger and tap Home with another, and nothing happens. Lift the finger, tap Home, and the game returns to the island.
- With `prefers-reduced-motion`, the breathing and celebration amplitudes are visibly smaller.

## Auto Run Result

**Status:** in-review. `cd app && npm run check` exits 0: 46 test files, 561 tests. `validate:content` reports "7 game ids, 7 audio ids, 18 voice lines, 2 layout(s) with 7 stations, 2 atlas(es), 51 asset files". `npm run build` exits 0, and `dist/assets/atlases/ice-cream.png` is present.

**Summary:**
- **Art:** `build_ice_cream.py` makes `art/ice-cream.blend` from the island. It has a re-aimed `CamGame2`, a script-built pink and white counter, the recoloured Quaternius Shiba (idle frame 1; lick and tail wag on frames 10–13), the Kenney cone in the plate and four flavour scoops (strawberry on top, chocolate chips, plain vanilla, mint leaves).
  - `render_screen.py` gained the generic `states`, `holdout_occluders` and `movable` props. The map output is unchanged.
  - The outputs are `atlas.ice-cream` (1 page, 1076×1820), `bg.ice-cream` (2048×1536) and `ice-cream.layout.json`.
  - `validateIceCream` runs in `render` (layout only), `atlas` and `validate:content`.
- **Input:**
  - DragController: lift in the pointerdown, move forwarded for the primary only, drop, and cancel on self-heal or on a paused scene.
  - Pure drop maths: `dragBounds`, `hudExclusions`, `clampDrag`, `createDropTarget` with `snapScale`, and `nudgeApart`.
  - Guard: `setPickable`/`isPickable` and `setSnapScale`/`snapScale`, backed by a WeakMap.
- **Hint stub:** `core/hint-director.ts` with the final AD-5 types. `MiniGameBase.hint` is created per start. On Home the base calls `hint.questionDone()` and `time.removeAllEvents()` before the single `round:abandon`.
- **Game:**
  - `questions.ts` derives each question from the seed with `mulberry32`.
  - `round.ts` is the pure drop resolution (cone, Shiba, own home, upper counter, counter, off), the outcome commands and the snapshot.
  - `IceCream.ts` only wires Phaser: plate, Shiba breathing and celebration, scoops with lift and shadow, tweens, and scene-clock timers.
- **Content:** 8 voice lines (unapproved) and 2 SFX placeholders. `bootAudio` now loads only `sfx.shell.*` and `music.*`. `GameAssets.images` is loaded with `load.image`.

**Files changed:** the list is in `.changed-1-8.txt`.
- New: `core/rng.ts`, `core/hint-director.ts`, `core/ui/sprite-pivot.ts`, `core/input/drop.ts`, `core/input/drag-controller.ts`, `games/ice-cream/questions.ts`, `games/ice-cream/round.ts`, `tools/render/blender/common.py` and `build_ice_cream.py`, each with tests where they are TypeScript.
- Changed: guard, tap-router and hotspot-polygon (drag hooks); `mini-game-base` (hint, Home cleanup); `IceCream.ts` (the game); content (`assets`, `layouts`, `voice-lines`, `audio-catalog`, `games/*`); `boot-load` and `game-assets` (images); `Map.ts` (`load.image`); `tokens` and `timing` (art, ui, `shibaBreathMs`).
- Tools: `rules.ts` (`validateIceCream`, `requiredIdProblems`), `to-layout.ts` (`unpadded`), `render.ts` (ice-cream rules, the EPERM fallback), `build.ts` and `blender.ts` (params, screen), `pack.ts` (noise floor, trim box, atlas rules), `validate-content.ts`, `make-placeholders.ts`, `build_map.py` (now uses `common.py`) and `render_screen.py`.
- `README.md`: provenance rows.

**Verification:**
- `npm run tts` wrote the 8 `vo.ice-cream.*` lines. A second run printed "0 written, 18 skipped".
- `npm run audio:placeholders` wrote `sfx.ice-cream.snap` and `sfx.ice-cream.happy`.
- `npm run art:build -- ice-cream && npm run render -- ice-cream && npm run atlas -- ice-cream`: exit 0.
  - A second `render -- ice-cream` gave a byte-identical layout (`cmp`).
  - `render -- map` reproduced the committed `map.layout.json` byte for byte.
- `npm run check`: exit 0. `npm run build`: exit 0.
- **Headless Chrome smoke test** (raw CDP, 1180×820 touch emulation, against `vite preview`; the script is kept outside the project):
  - Start → Chơi → tap the truck: the atlas, plate, 8 voice lines and 2 SFX load through the 1.7 loader path (all HTTP 200). Tiệm kem shows Shiba behind the counter and two scoops.
  - Wrong scoop on the cone: it floats back.
  - Right scoop on the cone: it snaps onto the cone, a fresh scoop appears at its home, and Shiba plays the lick frames in place. About 2 s later the cone is cleared and a new pair is asked.
  - Drop on the grass: the scoop slides home after 1.5 s.
  - Drop on the lower counter: the scoop stays.
  - A second finger on Home during a drag is ignored.
  - Home returns to the island. Entering the game again reloads the released assets.
  - The same run with `prefers-reduced-motion: reduce` showed no exceptions.
  - No exceptions, failed requests or HTTP errors were logged.

**Residual risks:**
- Shiba is large (scale 0.62, about 1.9 m) so it meets `character.minSize`, and it stands on nothing the camera sees. Its paws show just above the counter edge, which looks a little odd.
- The lower-counter `rest` band is narrow, about y 628–654 for scoop centres on 1180×820 (wider at 4:3). A child will often reach the upper area and serve instead.
- The pickable-during-celebration rule and the pause cancel are unit-tested only. CDP touch cannot pause a scene.
- `pack.ts` now clears alpha < 24 and trims at alpha ≥ 64 for every screen. A future `atlas -- map` will differ slightly in fringe pixels.
- The happy frames are 4 sampled poses, and the wag angle axis is chosen automatically. Both have been checked only by eye in the frames.

**Manual checks still due:**
- Listen to and approve the 8 `vo.ice-cream.*` lines and the 2 SFX.
- `preview.png` and the game in greyscale: the four flavours should be distinguishable (strawberry on top, chips, plain ivory, leaves).
- Real multi-touch on a device: hold a scoop and tap Home, and nothing happens. Release, tap Home, and the game returns to the island.
- The reduced-motion amplitude by eye.

**Review fixes (2026-10-09):**
- [medium] After an off-counter drop, the hit circle stayed at the old home spot.
  - `drag-controller.ts`: on release the circle moves to the drop point before `onDrop`.
  - `IceCream.ts`: `place()` moves the circle with the drawn scoop on every tween frame, instead of jumping it to the tween's destination at the start.
  - New test in `drag.test.ts`: after a drop, a press at the old spot does nothing and a press at the drop point lifts.
- [medium] The ice-cream request stayed on the Speaker after Home.
  - New `AudioDirector.clearPrompt(id?)`, with a test.
  - New pure `content/voice-lines.ts › islandPrompt(lastStation)`, tested in the new `voice-lines.test.ts`.
  - `Map.onWake` sets the prompt to the parked station's name line, or clears it when there is none.
- [low] The round test "cone and question survive …" could not fail. It now drives the distractor through wrong, home, rest and off, both before and after the target is served. After each outcome it asserts the target, `questionIndex` 0 and `placed` (`[]`, then `[target]`).
- `npm run check`: exit 0, 47 test files, 564 tests. `npm run build`: exit 0.
- **Headless smoke re-run** (1180×820, touch):
  - A scoop dropped on the grass was lifted again from the grass within the 1.5 s and dropped on the lower counter, where it stayed. The slide back was cancelled.
  - A tap on its empty home spot did nothing.
  - After Home, a tap on the island's Speaker logged no warning.
  - No exceptions were logged.
