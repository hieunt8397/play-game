---
title: 'Tìm bóng: bỏ khủng long, vật to hơn, làm đẹp kiểu dễ thương'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_commit: 'NO_VCS'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** In Hang tìm bóng the triceratops in the middle is huge (≈300 px) and takes the view, while the item to drag and its shadows are small (≈150 px); the art is also still the old faceted low-poly style (Quaternius animals, Kenney cars, icosphere rocks).

**Approach:** Remove the triceratops. The held item stands big on a small pedestal at the bottom centre; the shadows get the freed space and grow with it. Restyle the whole screen in the cute-toy style (chibi animals, soft rounded vehicles, a soft pastel cave backdrop).

Decisions (parent, 2026-10-22):
- No dinosaur. The item waits on a small pedestal at the bottom centre; on a correct match the shadow turns real-coloured, the item does a happy bounce with a sparkle, and its name is said (replaces the dino's nod/happy frames and chirp).
- Restyle the art in the same change (chibi animals, soft vehicles, new cave/backdrop).

## Boundaries & Constraints

**Always:** Same game rules and content: the 8 items, their shape groups and outline features (each item keeps its distinguishing silhouette cue — horns, mane + long tail, long ears, antlers, pointy ears + curled tail, low roof, cargo box, big rear wheel), the 2 → 3 → 4-shadow ladder, questions, hints, voice lines. Items and shadows clearly bigger than today (target ≈ 1.4× `shadowItemPx`, as large as the layout rules allow), all inside the interactive rect and clear of HUD zones; shadows keep ≥ 5:1 contrast on their backdrop (existing measured rule). Art only from vendored CC0 packs or script-built (cute.py `chibi` and soft shapes; the soft bus/truck/tractor builders in `build_touch_talk.py` may be shared via cute.py).

**Never:** Change the item list, names, ladder or round logic; add new mechanics; keep any `triceratops` frame, anchor or SFX in use.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Question | any level | item big on the pedestal, 2/3/4 big shadows above/around it, no dinosaur | — |
| Correct drop | item onto its shadow | suck-in, shadow turns real-coloured, item bounce + sparkle, name line | — |
| Wrong drop | another shadow | item floats back to the pedestal (as today) | — |
| Resume | snapshot from the old layout | resumes the same question (snapshot holds ids, not positions) | — |
| Build | art:build, render, atlas | rules pass (sizes, contrast, keep-outs) | fix art, never loosen a rule |

</frozen-after-approval>

## Code Map

All under `app/`.
- `tools/render/blender/build_shadow_match.py` -- remove trike import/posing (`pose_trike` :~377, trike frames/anchor `triceratops`), add a soft pedestal + `anchor.item-rest` (bottom centre); replace `build_cave`/`build_ledges` (:279/:296) with a cute cave backdrop and ledge area sized for bigger shadows (`LEDGES`, `LEDGE_SIZE`, `LEDGE_TIERS`, `ledge_point`); `ITEM_MODELS` (:140) → chibi animals (extend `cute.chibi` kinds: cow, horse, donkey, stag beside dog) keeping each item's outline feature, KayKit `car_sedan` (or a soft car), soft truck/tractor; `soften_scene` on the plate.
- `app/tools/render/blender/cute.py` -- `chibi(kind, …)` new kinds; shared soft vehicle builders if moved here.
- `src/content/games/shadow-match.ts` -- drop `TRIKE_ANCHOR`, `trikeFrames`; rename `HAND_ANCHOR` → the pedestal anchor; `SHADOW_SCREEN` frames/anchors.
- `src/games/shadow-match/ShadowMatch.ts` (:203 hand, :228 trike image, :296 nod, :319 happy, :504) and `round.ts` commands -- remove trike drawing/frames; celebration = item bounce + sparkle (reuse existing bounce/sparkle helpers in `core/ui`), name line unchanged; drop the dino chirp SFX use (keep or delete `SFX` entries accordingly, catalogue + README).
- `src/core/tokens.ts` -- `trikeSizePx` (+tolerance) removed; `shadowItemPx` raised (≈ 1.4×, final value set by what fits); `tools/layout/rules.ts` `shadowMatchLimits` (:~1067) follows.
- `src/games/shadow-match/geometry.ts` (`heldRadius`, `shadowRadius`) -- sizes derive from tokens; check tests.
- Tests: `src/games/shadow-match/*.test.ts`, `src/content/games/shadow-match.test.ts`, `tools/layout/*shadow*` / `rules.test.ts`.
- `app/README.md` -- provenance rows for the shadow-match atlas/plate (packs used; Quaternius triceratops/animals no longer used here).

## Tasks & Acceptance

**Execution:**
- [x] Content + scene + round: no trike, pedestal anchor, item celebration (+ tests).
- [x] Tokens + rules for bigger items/shadows (+ tests).
- [x] Builder restyle; rebuild `BLENDER_BIN="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" npm run art:build -- shadow-match && npm run render -- shadow-match && npm run atlas -- shadow-match`; open the plate, atlas and a composite (plate + item + a 4-shadow row) and iterate until items read clearly and features show in silhouette.
- [x] README provenance.

**Acceptance Criteria:**
- Given any level, when a question shows, then no dinosaur is on screen and item and shadows are ≈1.4× today's size.
- Given `npm run check`, then it exits 0.

## Implementation Notes

- shadowItemPx 150 → 210 (tolerance 10 → 14), heldScale stays 0.7 (held 147 px). New ui tokens shadowHappyHopPx / shadowHappyBounceScale / shadowSparkleReachPx; Timing trikeEnterMs / trikeSwayMs removed, trikeNodMs → shadowHappyMs, trikeCallMs → shadowNameDelayMs. New art.shadowMatch palette (cave, crystals, pedestal, farm animals).
- Anchor `item-rest` (REST_ANCHOR) at (512, 618); slots arc over it (row 2: 225/799 @ 330; row 3: 160/864 @ 410 + 512 @ 190; row 4: 140/884 @ 445 + 372/652 @ 205), all ≥ 398 px from the pedestal (min ≈ 378.5). The builder places everything from design px by camera rays.
- Round command `trikeNod` + chirp `sfx` → `itemHappy {slot}`; geometry `callMs` → `nameDelayMs`. Scene: no entrance wait; hop + bounce (core/ui/scale-motion › bounce) + new `core/ui/sparkle.ts` (no sparkle helper existed); last question: celebrate bounce + sparkle + happy tune.
- `sfx.shadow-match.trike.happy` deleted (catalog, placeholder recipe, .m4a, tests, README).
- cute.py: soft shapes + bus/truck/tractor moved from build_touch_talk.py (code unchanged; touch-talk builder re-run to a scratch file OK); chibi farm kinds cow/horse/donkey/stag. Builder now removes the whole island (its trees cast shadows into the cave) and turns the Sun to light the cave from the front.
- Measured: same-group IoU max 0.741 (donkey/stag), all shadow contrast / cave luminance / hint ring checks pass.
- Not touched: `icon/shadow-match/00` in the map atlas is still a triceratops (not drawn since 2026-10-21).

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind, edge | held item placed by its centre: tall items sink ~26 px into the pedestal, the car floats ~12 px | medium | anchor item-rest y 618 vs PEDESTAL_TOP_PX 666 at held scale 0.7 | patch |
| 2 | blind, edge | no Story 5.4 tap reaction left on the screen (the trike was it) | medium | this.react removed with the trike; nothing replaces it | patch (pedestal reaction) |
| 3 | edge | ambient holds and the 'sfx' ShadowCommand are dead after the trike removal | low | no producer / nothing to pause | patch |
| 4 | edge | CAVE_HIT_PX bottom (540) overlaps the held item's hint ring (~532) | low | breaks the builder's own invariant | patch |
| 5 | verif, blind, edge | touch-talk-sfx test hard-codes MAX_MS 800 instead of reading touchTalkNameDelayMs | low | lowering the delay passes | patch (orchestrator; spec-cham-la-noi-tieng-that follow-up) |
| 6 | blind, edge | make-placeholders exits mid-loop on a missing recording | low | earlier placeholders already rewritten | patch (orchestrator; same follow-up) |
| 7 | blind, edge | orphaned roadShapeProblems doc comment above gateProblems in rules.ts | low | from the parallel gate work | patch (with the gate spec) |
| 8 | verif | itemHappy / stopHop / celebrate not tested at scene level | low | no Phaser scene harness in the repo; pure round and sparkle maths tested | defer (existing scene-harness gap) |
| 9 | blind | map icon icon/shadow-match/00 is still a triceratops | false | icon frames are no longer drawn anywhere since the play-again overlay was removed | reject |
| 10 | blind | hit.cave luminance checks only a patch; decorations near shadow squares unchecked | low | rules pass; decorations sit at the frame edges | reject |
| 11 | blind | weak token/sparkle tests; reduced-motion sparkle untested | low | coverage nice-to-have | reject |
| 12 | blind | two bounce mechanisms; celebrate bounce not stopped by clearQuestion | low | runs only at the round end before the restart | reject |
| 13 | blind | incomplete "hand" → pedestal rename in names and fixtures | low | naming only | reject |
| 14 | blind | vehicle colours shared with touch-talk tokens | low | shared on purpose (same soft vehicles) | reject |
| 15 | blind | prune keeps only Sun/CamGame2 from map-v3; late failure if renamed | low | build-time only | reject |
| 16 | edge | wall anchors ray-cast before soften_scene | false | soften_scene changes shading/normals only, not vertex positions | reject |

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.

**Manual checks:**
- Composite images for 2-, 3- and 4-shadow rows: every silhouette recognisable, item big on its pedestal, cute style matching Chạm là nói.
