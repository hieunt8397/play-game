---
title: 'Tìm bóng: quay về hình thật (Quaternius/Kenney), thêm 21 con vật và đồ vật'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_commit: 'NO_VCS'
route: 'dispatch'
review_loop_iteration: 0
context: ['spec-tim-bong-bo-khung-long-lam-dep.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After the cute restyle (spec-tim-bong-bo-khung-long-lam-dep), the chibi animals and soft vehicles are so rounded that the parent cannot tell what they are; the earlier look (Quaternius animals, Kenney vehicles, low-poly rock cave) read better. The game also has only 8 items, which gets repetitive.

**Approach:** Bring back the pre-restyle art (the backup `_backup/2026-10-22-truoc-tim-bong-lam-dep/`): the real models with their source colours and the rock cave. Keep what the parent liked in the last change: no dinosaur, the item standing big on a pedestal at the bottom centre, bigger shadows, pedestal tap bounce, the happy bounce + sparkle on a match. Then add 21 new items from the vendored CC0 packs.

Decisions (parent, 2026-10-22):
- Back to the old rock cave and real models; keep only "no dinosaur" (and its pedestal, bigger items, celebration) from the last change.
- Add all four groups: land animals, sea fish, special vehicles, fruit and kitchen things.

New items (id · ask line · name line · model):

| Group (shapeGroup) | id | Ask ("Xoài ơi, … ở bóng nào?") | Name | Model |
|---|---|---|---|---|
| quadruped | fox | bạn cáo | Con cáo! | quaternius/animals/Fox.fbx |
| quadruped | bull | bạn bò tót | Con bò tót! | quaternius/animals/Bull.fbx |
| fish | goldfish | bạn cá vàng | Cá vàng! | quaternius/cutefish/Goldfish.fbx |
| fish | shark | bạn cá mập | Cá mập! | quaternius/cutefish/Shark.fbx |
| fish | puffer | bạn cá nóc | Cá nóc! | quaternius/cutefish/Puffer.fbx |
| fish | swordfish | bạn cá kiếm | Cá kiếm! | quaternius/cutefish/Swordfish.fbx |
| car | taxi | xe taxi | Xe taxi! | kenney car-kit taxi.glb |
| car | police | xe cảnh sát | Xe cảnh sát! | kenney car-kit police.glb |
| truck | firetruck | xe cứu hỏa | Xe cứu hỏa! | kenney car-kit firetruck.glb |
| truck | ambulance | xe cứu thương | Xe cứu thương! | kenney car-kit ambulance.glb |
| truck | garbage-truck | xe chở rác | Xe chở rác! | kenney car-kit garbage-truck.glb |
| truck | excavator | máy xúc | Máy xúc! | kenney car-kit tractor-shovel.glb |
| fruit | apple | quả táo | Quả táo! | kenney food-kit apple.glb |
| fruit | banana | quả chuối | Quả chuối! | kenney food-kit banana.glb |
| fruit | pineapple | quả dứa | Quả dứa! | kenney food-kit pineapple.glb |
| fruit | pear | quả lê | Quả lê! | kenney food-kit pear.glb |
| fruit | strawberry | quả dâu tây | Quả dâu tây! | kenney food-kit strawberry.glb |
| fruit | carrot | củ cà rốt | Củ cà rốt! | kenney food-kit carrot.glb |
| kitchen | mug | cái cốc | Cái cốc! | kenney food-kit mug.glb |
| kitchen | pan | cái chảo | Cái chảo! | kenney food-kit frying-pan.glb |
| kitchen | ice-cream | cây kem | Cây kem! | kenney food-kit ice-cream-cne.glb |

## Boundaries & Constraints

**Always:**
- Same game rules: the 2 → 3 → 4-shadow ladder, question count, hints, round flow, continuous play.
- Each item keeps one outline feature of its own in its shape group (`featureProblems`). The measured same-group silhouette check (`shadow-distinct`) passes for every group.
- Items and shadows stay at today's bigger size (`shadowItemPx` 210 or whatever fits). Everything stays inside the interactive rect and clear of HUD zones. Shadows keep ≥ 5:1 contrast on their ledges.
- Every item is posed so a toddler recognises it in silhouette: animals and vehicles in side profile; fruit and kitchen things upright, at their most typical angle.
- Items of very different real sizes (horse vs strawberry) are normalised to the same on-screen box.
- New voice lines use the current ElevenLabs recipe (`npm run tts`); only new or changed lines are rendered.
- Art comes only from the vendored CC0 packs above. README provenance is updated.
- The current chibi version is backed up first to `_backup/2026-10-22-tim-bong-chibi/` (builder, cute.py changes, atlas, plate, layout, tokens).

**Never:**
- Bring back the dinosaur or any `triceratops` frame, anchor or SFX.
- Use a balloon, ball or flower, or a name with "bóng/bông/hoa" (`FORBIDDEN_ITEM`).
- Loosen a layout or contrast rule to make the art pass.
- Use the alpaca (it is an island decoration on the map).

**Fallback:** If bull is too close to cow in silhouette to pass `shadow-distinct`, or a model reads badly, drop that one item. Record it in Implementation Notes; do not substitute an item without the parent.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Question | any level | real-model item big on the pedestal in the rock cave, 2/3/4 shadows, no dinosaur | — |
| Level `same` (4 shadows) | groups with ≥ 4 items: quadruped, fish, truck, fruit | held item and all decoys from one group | groups < 4 (car, kitchen) never held at this level |
| Level `mixed` | any held item | one look-alike from its group when it has one | — |
| Resume | snapshot with an old item id | resumes (all 8 old ids kept) | an unknown id → fresh question (existing behaviour) |
| Build | art:build, render, atlas | rules pass; atlas may use several pages | fix art, never loosen a rule |

</frozen-after-approval>

## Code Map

All under `app/`.
- `tools/render/blender/build_shadow_match.py` -- start from the backup builder (rock cave `build_cave`/`build_ledges`, `ITEM_MODELS` with Quaternius/Kenney, `ITEM_YAW` fixes). Carry over from the current builder: no trike, pedestal plus `anchor.item-rest`/`anchor.pedestal-top`, `hit.pedestal`, `CAVE_HIT_PX` (ending at y 520), ledge sizes for the bigger shadows. Add the 21 `ITEM_MODELS` rows (food-kit and cutefish paths, per-model yaw/tilt and up-axis fixes).
- `tools/render/blender/cute.py` -- keep the `chibi` additions only if something else uses them (touch-talk uses dog/fox/cow…); otherwise leave as-is.
- `src/content/games/shadow-match.ts` -- `SHAPE_ITEMS` +21 rows; new `Feature` values (e.g. `bushy-tail`, `hump`, `dorsal-fin`, `round-spiky`, `long-bill`, `roof-sign`, `light-bar`, `ladder`, `tall-box`, `bin-arm`, `digger-arm`, `round-stem`, `curved`, `leaf-crown`, `pear-shape`, `seeded-tip`, `leafy-top`, `handle-side`, `long-handle`, `cone`); comments.
- `src/content/voice-lines.ts` -- 42 lines `vo.shadow-match.ask.<id>` / `vo.shadow-match.name.<id>`; run `npm run tts`.
- `src/core/tokens.ts` -- `art.shadowMatch` colours back to the backup values where the cave uses them; pedestal colour kept. `render.test` pins follow.
- `tools/layout/rules.ts`, `tools/lint/shadow-distinct.ts` and tests -- unchanged rules. Thresholds may need per-group data, not looser limits.
- `src/games/shadow-match/questions.ts` -- check that decoy choice handles groups of 3 (car, kitchen) and the new groups (tests).
- `app/README.md` -- provenance: Quaternius animals and cutefish, Kenney car-kit and food-kit for the shadow-match atlas.

## Tasks & Acceptance

**Execution:**
- [x] Backup the chibi version to `_backup/2026-10-22-tim-bong-chibi/`.
- [x] Builder: restore the backup's look, keep the pedestal/no-trike changes, add the 21 models. Rebuild with `BLENDER_BIN="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" npm run art:build -- shadow-match && npm run render -- shadow-match && npm run atlas -- shadow-match`. Open the plate, the atlas and one composite per group (plate + held item + a 4-shadow row) and iterate until every item reads clearly in colour and in silhouette.
- [x] Content, features, voice lines (+ `npm run tts`), tokens, tests.
- [x] README provenance; deferred-work note if an item was dropped.

**Acceptance Criteria:**
- Given the game, when any item is shown, then it is the real model (not chibi), standing on the pedestal in the rock cave with no dinosaur.
- Given the catalogue, then it holds the 8 old items plus the new ones (21, minus any dropped under the Fallback), each with ask and name lines rendered.
- Given `npm run check`, then it exits 0.

## Implementation Notes

- **Backup:** the chibi version is in `_backup/2026-10-22-tim-bong-chibi/` (same paths as the earlier backup: builder, cute.py, rules, tokens and tokens test, content and its test, scene files, layout, atlas JSON + PNG, plate, audio catalogue, README, `art/shadow-match.blend`; plus `shadow-distinct.ts` + test and `voice-lines.ts`).
- **Builder** (`tools/render/blender/build_shadow_match.py`): kept the current camera, design-px placement (`Screen`), `SHADOW_SPOTS`, pedestal, `anchor.item-rest` / `anchor.pedestal-top`, `hit.pedestal` and `CAVE_HIT_PX` (ending at y 520). The pastel cave (gradient wall, pastel rocks, crystals, mushrooms) is replaced by the old rock look scaled up for the bigger shadows: the backup's low-poly jittered icosphere stones in `colors.caveMouth` (emission 0.45) framing the top edge/corners plus six floor boulders, a caveMouth floor, and a lit `caveInner` back wall that is now coarse and jittered (triangulated facets, it casts no shadow on itself) so it reads as rock; `WALL_EMISSION` 0.3 (0.75 blew it out to white). The old two slab ledges could not hold the 2/3/4 rows of 210 px shadows that arc over the pedestal, so the lit inner wall is the shadows' ledge; the measured 5:1 contrast and cave-luminance tests pass on the real plate. Pedestal kept (pink/cream, now a 12-sided low-poly drum). Items: the backup's import path (FBX with `|Idle` pose, glTF as is, source colours, `force_opaque`), posed by a per-item `{yaw, tilt}`: animals, fish and vehicles in pure side profile facing screen right (the glTF front turn is now +90°, so the vehicles face right like the animals; they faced left before the restyle); fruit/kitchen upright with a 10° tilt toward the camera, the pan 40° so its round face shows. Fitted to `shadowItemPx` on the pedestal (strawberry and horse get the same box). `cute.py` left as-is (its chibi farm kinds are now unused; the soft vehicles are still used by Chạm là nói).
- **Final `shadowItemPx`: 210** (tolerance 14), unchanged. **Atlas: 2 pages** (`shadow-match-0.png`, `-1.png`, multiatlas JSON); `ATLAS_MAX_PAGES['shadow-match'] = 3`; the stale single-page `shadow-match.png` was removed. `tools/lint/shadow-distinct.ts` now reads a multiatlas (frame → page image) — no threshold changed.
- **Dropped under the Fallback** (measured `shadow-distinct` IoU above `ui.shadowMaxIoU` 0.85; no substitute added, recorded in deferred-work.md): **bull** (cow/bull 0.895 — same Quaternius body), **taxi** (car/taxi 0.939 — the same Kenney sedan body; police/car 0.786 passes), **ambulance** (firetruck/ambulance 0.860 — both boxy trucks; the firetruck was kept as the more iconic one). So 18 items were added at first (36 lines, `npm run tts`: 36 written, 208 skipped). **Parent 2026-10-22: shark dropped, the model reads as a generic grey fish; excavator and banana kept.** Its two lines and their .m4a/.hash files were removed and the art rebuilt, so **17 items were added (25 in all)**; the fish group has 3 (goldfish, puffer, swordfish) and is no longer used at the 4-shadow level.
- **Model files differing from the table (same items):** `cây kem` uses food-kit `ice-cream.glb` (cone with a pink scoop) — `ice-cream-cne.glb` is an empty cone that does not read as ice cream; `cái cốc` uses `cup.glb` (white mug with a side handle) — `mug.glb` is a wooden banded tankard that reads as a barrel. Please confirm.
- **Content:** `SHAPE_ITEMS` +18 rows; `askName` now holds the whole spoken phrase ("bạn chó", "xe cảnh sát", "quả táo"; old items gained "bạn", their voice lines unchanged); new features fan-tail (goldfish, not in the spec's e.g. list), bushy-tail, dorsal-fin, round-spiky, long-bill, light-bar, side-lockers, bin-arm, front-shovel, round-stem, curved, leaf-crown, pear-shape, pointed-tip, leafy-top, handle-side, long-handle, cone (after review, named from the models' outlines: the Kenney firetruck has side lockers and no ladder, tractor-shovel is a front loader, the low-poly strawberry has no seeds in silhouette). Groups: quadruped 6, truck 5, fruit 6 (held at `same`), car 2, fish 3, kitchen 3 (never held at `same`). `questions.ts` needed no change.
- **Tokens:** `art.shadowMatch` back to `caveInner` + the kept `pedestal`/`pedestalTop` (the chibi fur/crystal colours removed); render.test pin follows.
- **Tests:** content catalogue/voice count/multiatlas, a new ask/name text test, questions (small groups at `mixed`, the four ≥ 4 groups at `same`), pack max pages, builder `--items`, validate-content good tree (multiatlas pages).
- **Review patches (2026-10-22):** `tools/lint/hint-contrast.ts` reads the shadow-match multiatlas through `atlasFrames` (before, `shadowRadii` silently fell back to `shadowItemPx/2`), with a test that a multiatlas yields the real frame sizes; `shadow-distinct.ts` exports `framePages` and takes the atlas ref, with tests for the multi-page path and the missing-page branch; comments fixed (item count, `MODEL_FRONT_DEG`: every model faces −y after import and +90° turns it to screen right); features relabelled from the models' outlines.
- **Checks:** `npm run check` exit 0 after the shark drop and the review patches (typecheck, lint, tests, tokens, validate:content incl. every same-group IoU ≤ 0.786, build, precache); `npm run audio:check` OK.
- **Look at:** the white cup is light on the cream wall (source colour); the swordfish's bill and the banana are thin at 210 px (the parent kept the banana); the voice lines are new and not yet approved by ear.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind, edge | hint-contrast reads the multiatlas JSON raw: shadow radii silently fall back to shadowItemPx/2 | medium | tools/lint/hint-contrast.ts (dino entry already used atlasFrames) | patch (atlasFrames + test) |
| 2 | verif | shark does not read as a shark; excavator/banana silhouettes questionable | medium | comp-fish.png, comp-truck.png | parent decided: shark dropped, excavator and banana kept |
| 3 | verif | multi-page path of shadow-distinct untested | low | framePages / page-missing branch | patch (tests) |
| 4 | blind | wrong comments (item counts, MODEL_FRONT_DEG facing) | low | build_shadow_match.py header, shadow-match.ts Feature | patch |
| 5 | blind | feature labels not matching models (firetruck ladder, excavator arm, strawberry seeds) | low | Kenney models | patch (relabel) |
| 6 | edge | car group (car, police) is the closest pair, always the look-alike at mixed | low | IoU 0.786 < 0.85 | defer (noted for parent) |
| 7 | edge | old snapshots regenerate different questions after the catalogue grew | low | snapshot stores seed + index only | reject (harmless) |
| 8 | blind | cute.py chibi farm kinds now unused | low | spec allowed leaving it | defer |
| 9 | spec | plate is a light faceted wall, not the old slab ledges | low | needed for 210 px shadows + 5:1 contrast; in Implementation Notes | reject (documented) |
| 10 | edge | runtime multiatlas load, question groups, FORBIDDEN_ITEM, voice files | false | verified by reviewer | reject |

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run tts` -- expected: only the new lines render.

**Manual checks:**
- Composites of each group: items recognisable, shadows distinct within a group.
