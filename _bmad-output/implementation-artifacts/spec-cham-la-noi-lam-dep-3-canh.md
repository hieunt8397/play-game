---
title: 'Chạm là nói: làm đẹp lại 3 cảnh Biển, Đường phố, Nhà bếp'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_commit: 'NO_VCS'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Chạm là nói still uses the old faceted low-poly art: props are blocky Kenney/Quaternius models, the plates are flat colour areas with big blurry shadow blobs (sea), and the parent finds it ugly next to the restyled games.

**Approach:** Rebuild the three scenes (sea, street, kitchen) in the project's "cute toy" style (Tiny Treats/KayKit look: rounded, smooth-shaded, pastel, chibi faces on creatures): a real dressed backdrop per plate and a soft model for every prop. Same scenes, same props, same voice lines and behaviour.

Decisions (parent, 2026-10-21):
- Keep every current prop (bus, truck, tractor, banana, egg, watermelon included); props with no cute CC0 model are script-built in the same soft style.
- No look-dev preview step: build all three scenes directly in the Tiệm kem style.
- This is batch 1 of 3 (batch 2: new scenes Phòng tắm, Tiệm bánh, Dã ngoại; batch 3: real CC0 sounds).

## Boundaries & Constraints

**Always:** Prop ids, scene ids, `PROP_BOXES` screen boxes, frames (`<id>/idle/00`, `<id>/react/00`, `scene-thumb-<id>/idle/00`), `hit.prop-<id>` hulls and the layout rules (prop size in [touchTalkPropMinPx, touchTalkPropMaxPx], bubble column clear) stay as they are, so no TypeScript game code changes. Models only from CC0 packs already vendored in `assets/` (tinytreats, kaykit incl. the new City-Builder/Furniture/Homely-House/Bubbly-Bathroom/Pleasant-Picnic folders) or script-built. Every builder mesh gets the soft shading (`cute.soften_scene` on every plate scene, not only the sea). Atlas pages ≤ 2048². Readable for a 3-year-old: each prop a clear silhouette, colourful, a friendly face on creatures (fish, crab, starfish, seagull).

**Never:** Change voice lines, SFX, game logic, scene count or prop lists; add non-CC0 assets; download anything new.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Build | `npm run art:build -- touch-talk` then `render` and `atlas` | three plates + 30 props + 3 thumbs rendered; layout JSON regenerated | missing model → builder fails naming it |
| Plates | sea / street / kitchen backgrounds | dressed cute backdrop, no shadow blobs from sprites, nothing inside a prop box that reads as tappable | — |
| Rules | layout/asset checks in `npm run check` | pass (sizes, hulls, bubble column, atlas size) | fix the art, never loosen a rule |

</frozen-after-approval>

## Code Map

- `app/tools/render/blender/build_touch_talk.py` -- the builder (sea :~397, street :667, kitchen :699, props tables `SEA_PROPS`, `STREET_PROPS`, `KITCHEN_PROPS`, `RECOLOUR`, `REACT_POSE`, script builders `build_crab/starfish/bucket/seagull/beach_ball/bus/tree/house`). Keep `PROP_BOXES`, `BOX_ROW`, `Screen`, `fit`, `place_in_box`, `build_box_prop`, hull and state keying. `main()` calls `soften_scene` only for the sea scene — call it for every plate scene.
- `app/tools/render/blender/cute.py` -- `tt_model(name)` (finds `<name>.gltf` under assets/tinytreats|kaykit), `import_joined`, `soften`, `chibi` (dog/fox rig) — reuse; add small shared soft-shape helpers here only if two builders need them.
- `app/tools/render/blender/build_ice_cream.py` -- reference for the target look (procedural glossy rounded shapes, Tiny Treats props, lighting).
- Model choices (by `tt_model` stem):
  - Kitchen plate: Charming Kitchen walls/`wall_plain_kitchen_window`, `countertop_*`, `stove`, `fridge`, `wall_shelf_kitchen`, `floor_tiles_kitchen`, `extractor_hood`. Props: pot→`pot`, frying-pan→`pan`, mug→`mug_red` (or blue/yellow), spoon→`spoon`, bread→`bread` (Baked Goods), apple→`apple` (Picnic), carrot→`food_ingredient_carrot` (KayKit Restaurant); banana, egg, watermelon script-built soft.
  - Street plate: City Builder `road_straight`, `road_straight_crossing`, `building_A`–`H`, `bush`, `streetlight`, `bench`, Pretty Park `tree_large`/`flower_*`. Props: car→`car_sedan`, police-car→`car_police`, traffic-light→`trafficlight_A`, dumpster→`dumpster`, tree→Pretty Park `tree`, house→a small City Builder building (or script cottage); bus, truck, tractor, cone script-built soft (rounded bodies, big round wheels, pastel).
  - Sea plate: soft sand, calm stylised water, pastel sky with puffy clouds (no island leftovers that cast blobs). Props script-built soft with chibi eyes where living: fish, crab, starfish, seagull (or Pretty Park `bird` recoloured white), shell; boat, parasol, bucket, beach-ball, coconut soft.
- `app/tools/render/build.ts`, `src/core/tokens.ts` (`art.touchTalk` colours) -- add colour tokens only if needed (no magic colours in the builder).
- `app/README.md` -- touch-talk provenance rows: list the CC0 packs now used (Tiny Treats Charming Kitchen / Baked Goods / Pleasant Picnic / Pretty Park, KayKit City Builder Bits / Restaurant Bits) and drop sources no longer used.

## Tasks & Acceptance

**Execution:**
- [x] `build_touch_talk.py` -- restyle sea, street and kitchen plates and all 30 props as above; soften every plate scene; stop sprites casting shadow blobs onto plates.
- [x] Run `BLENDER_BIN="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" npm run art:build -- touch-talk && npm run render -- touch-talk && npm run atlas -- touch-talk` -- regenerate plates, atlas and layout.
- [x] Look at every rendered plate and the atlas page (open the PNGs) and iterate until each prop reads clearly and nothing looks broken.
- [x] `app/README.md` -- provenance rows.

**Acceptance Criteria:**
- Given the three scenes in the game, when compared with the old art, then no faceted Kenney/Quaternius prop remains and every plate is a dressed scene without dark blobs.
- Given `npm run check`, then it exits 0 with the regenerated assets.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | verif | make_source_v3 tree/tree_large now resolve to Homely House | medium | tt_model sorts matches; Homely House sorts before Pretty Park and ships both stems; the map source would change on its next regeneration | patch |
| 2 | blind, edge | tt_model pack filter matches the whole absolute path | low | substring test on full path | patch |
| 3 | blind | starfish reaction yaws about world z after the 68° lean | low | REACT_POSE keys the root; the lean is on a child | patch |
| 4 | blind, edge | kitchen floor tiles -7..6 (asymmetric) | low | Python floor division precedence | patch |
| 5 | edge | watermelon reads face normals without normal_update | low | bmesh normals stale after vertex moves | patch |
| 6 | blind | dead code (× 0.0 terms, del leaf/c, unused param, no-op dict copy, rug scale after put) | low | read in diff | patch |
| 7 | blind | gradient_material docstring wrong; header promises a kitchen window | low | code mixes towards hex0; no window is built | patch |
| 8 | blind | art.touchTalk trunk/wall/floor/counter tokens now unused | low | their builders were removed | patch |
| 9 | blind, edge | boat/fish below WATER_Z: hull covers hidden parts | false | sprites draw over the plate, so the whole sprite (keel included) is visible and its hull matches what is seen; the rendered atlas shows full boat/fish | reject |
| 10 | blind | clear_island may leave master-collection objects in the sea render | false | the rendered sea plate shows only sky, sea, foam, sand — nothing leaked | reject |
| 11 | blind | haze() shares material slots across copies | low | works today (no stem in both haze lists); fix adds per-object links | reject (low, no current effect) |
| 12 | blind | unexplained hard-coded offsets / verge positions not derived from boxes | low | style of the builder; outputs checked visually and by layout rules | reject |
| 13 | blind | sea props keep yaw on the keyed root (vs pivot) | false | idle and react frames of boat/fish in the atlas share their orientation, so key_pose does not overwrite the yaw | reject |
| 14 | blind | boat band uses object scale, ellipse vs narrowed bow | low | cosmetic; the boat renders cleanly in the atlas | reject |
| 15 | blind | no test that builder colour keys exist / pack filter test | low | a missing key fails the Blender build loudly; adding a Python harness is out of proportion | reject |
| 16 | blind | review material incomplete (tokens baseline, no before/after, tap widths) | false | tap-target minimum and spacing are enforced by validateTouchTalk on the regenerated layout (tests pass); images checked by the orchestrator | reject |
| 17 | edge | shell rim may stay open | low | the shell reads closed in the atlas | reject |
| 18 | edge | recolour/haze skip materials without Principled BSDF silently | low | pot/pan recolours visible in the atlas; Tiny Treats/KayKit materials are Principled | reject |
| 19 | edge | kitchen side walls removed; background may show at frame edges | false | the rendered kitchen plate is fully covered edge to edge | reject |

## Design Notes

Keep the composition: the boxes already give three readable rows (back / middle / front). Make the backdrop quiet (lower contrast, slightly desaturated) so props pop; props saturated pastel with soft highlights. Creatures get the chibi eye style used in Tiệm kem.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.

**Manual checks:**
- Open `app/public/assets/bg/touch-talk-{sea,street,kitchen}.png` and `app/public/assets/atlases/touch-talk-*.png`: every prop recognisable at a glance, soft shading, no blobs.
