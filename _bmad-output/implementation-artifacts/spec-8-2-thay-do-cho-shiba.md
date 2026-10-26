---
title: 'Story 8.2: Thay đồ cho Shiba'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_commit: 'f41b47e397b7a8909f1d72db153f1072e4b70d45'
baseline_tree: '6663094f38d2755a08070e90c2c98b506e4c3379' # working-tree snapshot before 8.2 (Epic 7 and 8.1 are uncommitted); review diffs against this tree
route: 'dispatch'
review_loop_iteration: 0
context: ['../planning-artifacts/epics.md#Story 8.2', 'epic-8-context.md', 'spec-6-1-tiem-kem-shiba-hat-xi-lau-mui-thap-kem.md', 'spec-7-4-gio-di-ngu.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Xoài has no way to make Shiba "her own" (FR60, FR61). The yard corner "Tủ đồ" (`wardrobe` → `dress-up`) still sleeps.

**Approach:** Add a new yard game `dress-up`. A wardrobe room shows the existing **chibi Shiba** (`cute.chibi('dog','shiba',…)`, the dog on the map and in Tiệm kem) beside a standing mirror, and an open wardrobe with ≥ 4 hats, 3 glasses and 4 shirts.
- Tap an item: Shiba wears it (one per slot; a new hat replaces the old hat), turns to the mirror and reacts.
- Tap a worn item: it comes off.
- The outfit is saved (ProgressStore) and the map guide Shiba and the Tiệm kem Shiba wear it in every frame.
- Registering `dress-up` wakes the corner (7.1). Voice: ElevenLabs Thắm via `npm run tts`.

Decision (parent, 2026-10-26): the items are, all script-built in the cute style:
- hats: party cone, cowboy hat, gold crown, knitted beanie with a pompom;
- glasses: round red glasses, pink heart sunglasses, yellow star glasses;
- shirts: striped T-shirt, yellow raincoat, red jumper with a heart, Hawaiian flower shirt.

## Boundaries & Constraints

**Always:**
- **Items are overlay sprites, not pre-composited Shibas.** Each item is rendered alone, for every Shiba state frame of a screen, with the same camera and full frame as the Shiba. The Shiba's own meshes act as holdouts, so its head hides the back of a hat. At runtime the overlay draws on the Shiba's anchor and origin, depth shirt < glasses < hat, just above the Shiba.
- One overlay frame per item per state frame: `shiba-<item>/<state>/<nn>` mirrors `shiba/<state>/<nn>`. Identical frames are aliased by the packer (`detectIdentical`).
- Overlays follow the Shiba every frame: position, scale (breath, bounce, the shiver shake, a negative scaleX), alpha, visibility and frame. A missing overlay frame hides that layer, with one `console.warn`; the bare Shiba still works.
- ProgressStore schema v4 `{ schemaVersion, difficulty, outfit: { hat?, glasses?, shirt? } }`. The migration 3 → 4 adds `outfit: {}`. Sanitise drops unknown ids and ids in the wrong slot. `setOutfit(slot, id | null)` writes synchronously, like `setDifficulty`.
- No judging: there is no right outfit. Reactions: ≥ 3 random ones on wear (turn to the mirror and smile, a happy hop with a tail wag, a giggle and a wiggle), with no immediate repeat. Take-off: a small shake and a soft "pop".
- **Round:** the round completes after `Tokens.ui.dressUpRoundChanges` (5) wears or take-offs, then `finishRoundAndStay()` (7.4). After that, free play continues with the voice silent. Home returns to the yard.
- Voice lines are short, with no praise:
  - prompt: "Xoài ơi, mình thay đồ cho Shiba nào!";
  - one name line per item, spoken on wear before the round completes (e.g. "Mũ sinh nhật!");
  - parent invite: "Hỏi mẹ xem mẹ thích mũ nào nhé!".
- Tap targets: item icons ≥ 110 design px with gaps ≥ 24; Shiba and the mirror are tappable too (they react). A new `validateDressUp` rule checks this.

**Never:**
- Changing the chibi rig, the existing Shiba frames, or the map and ice-cream poses or behaviour.
- Pre-rendering every outfit combination.
- Putting the outfit on the Quaternius Shiba in Giờ đi ngủ or Tìm bóng: those are other models, out of scope.
- Dragging items. Wearing is a tap. Items are not moved, so the drag rules do not apply.
- A "wrong" sound, praise, or instruction text.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Wear | tap a hat, no hat on | the hat appears on Shiba and in the mirror; reaction; name line; store `hat=id` | — |
| Replace | tap another hat | the old hat comes off, the new one goes on; one store write | — |
| Take off | tap the worn item's icon | the item comes off; shake + pop; store `hat=null` | — |
| Rapid taps | tap during a reaction | the outfit changes at once; the reaction restarts (no queue) | — |
| Map / ice cream | outfit saved | the guide (idle and wave) and the ice-cream Shiba (every reaction) wear it | missing frame → that layer is hidden + warn |
| Old save | v3 document | migrates to v4 with `outfit: {}`, written back | corrupt → defaults (existing policy) |
| Bad outfit | unknown or wrong-slot id | that slot is dropped in memory | — |
| Resume | abandon mid-round | the change count is restored (`{ changes: number }`); the outfit comes from the store | bad partial → fresh start |

</frozen-after-approval>

## Code Map

All under `app/`.
- `tools/render/blender/render_screen.py:231-266`: the sprite pass. Add a collection prop `bhc_holdout_sprites` (a JSON list of sprite names). Their objects become holdouts instead of being hidden in this pass, so the Shiba cuts its items. The change is backward compatible.
- New `tools/render/blender/outfit.py`: `ITEMS` (id, slot, mesh builder, parent `head`/`body`) and `dress(rig, base_coll, scene)`. It creates one `sprite.shiba-<id>` per item with the base's `states` and `holdout_occluders`, `movable` = 1, and `bhc_holdout_sprites=["shiba"]`. It also creates an `item.<id>` icon builder for the wardrobe.
- `tools/render/blender/build_map.py:1200-1215` (guide coll, `GUIDE_STATES` 5 frames) and `build_ice_cream.py:663-666` (`SHIBA_STATES` 12 frames, holdout): call `dress()`.
- New `tools/render/blender/build_dress_up.py`: the room, the wardrobe, the mirror (`area.mirror-glass` hull), and the Shiba with states `idle`[1], `happy`[2] and `turn`[2] (yaw toward the mirror), plus `dress()` and the icons.
- **Atlas estimate** (trimmed, before aliasing):
  - map: 11 × 5 = 55 small frames (map Shiba ≈ 100 px);
  - ice cream: 11 × 12 = 132 frames (Shiba ≈ 335 × 555), ≈ 5.6 M px against 4.2 M per page, with the page already full;
  - dress-up: 55 + 11 icons.

  `content/assets.ts:29` `ATLAS_MAX_PAGES`: `ice-cream` 3, `map` 2, `dress-up` 2 (multiatlas, ≤ 2048² and ≤ 8 MiB per page). Lower them if packing allows.
- New `src/core/outfit-layers.ts` (+ test):
  - pure `outfitFrame(baseFrame, itemId)`;
  - `attachOutfit(scene, base, atlasKey, outfit)`, which returns `{ setFrame, set(outfit), destroy }`. Its `setFrame` sets the frame then puts the origin back (as `Map.waveGuide` does); it syncs on the scene `POST_UPDATE` event.
- `src/scenes/Map.ts:545-601,698` and `src/games/ice-cream/IceCream.ts:235-262,330-360`: attach after the Shiba image is created, and route every Shiba `setFrame` through the layers. Read the outfit from `progress.state.outfit`.
- `src/core/progress-store.ts` (+ test): v4, `MIGRATIONS[3]`, the shape check, sanitise, `setOutfit`, `outfit`.
- `src/content/games/dress-up.ts`: `OUTFIT_ITEMS`, `SLOTS`, frames, hits, and the voice ids.
- `src/content/types.ts` (`GAME_IDS`, `YARD_GAME_IDS`, `SnapshotPartials['dress-up']`), `games/index.ts`, `assets.ts`, `layouts.ts`, `audio-catalog.ts`, `voice-lines.ts`, `parent-invite.ts`, `core/tokens.ts`/`timing.ts`, and `eslint.config.js` (`LINT_GAME_IDS`).
- New `src/games/dress-up/{round.ts, DressUp.ts, *.test.ts}` and `games/registry.ts` (this wakes `wardrobe`; `home.test` expects it awake). The mirror is a clone of the Shiba and its layers with scaleX < 0, masked by the glass hull.
- `tools/layout/rules.ts` (+ `dress-up-rules.test.ts`): `validateDressUp`.

## Tasks & Acceptance

**Execution:**
- [x] ProgressStore v4 + migration/sanitise/setOutfit tests.
- [x] `render_screen.py` holdout prop; `outfit.py`; builder edits in map and ice-cream; new `build_dress_up.py`. Then build, render and atlas the three screens, iterate on composites, and set the page limits.
- [x] `outfit-layers.ts` + tests; wire into Map and IceCream (scene tests: an overlay follows the frame and scale; a missing frame warns once).
- [x] Content, round model (wear, replace, take off, count, resume) + tests; DressUp scene, mirror, reactions; registry; layout rule.
- [x] Voice lines + `npm run tts`; sounds (pop, giggle reuse) under `audio:check`.

**Acceptance Criteria:**
- Given `npm run art:build <screen> && npm run render <screen> && npm run atlas` for map, ice-cream and dress-up, then every `shiba/<state>/<nn>` has a `shiba-<item>/<state>/<nn>` for all 11 items, and the page limits hold.
- Given a hat, glasses and a shirt chosen in the wardrobe, when the child opens the map and Tiệm kem, then the guide wave and every ice-cream reaction show all three, aligned with no gap or float.
- Given a fresh install, then Shiba is bare everywhere and the corner "Tủ đồ" is awake.
- Given `npm run check` and `npm run audio:check`, then both exit 0.

## Implementation Notes

2026-10-26 (dev). Backups before 8.2 are in `_backup/2026-10-26-truoc-8-2/`. The work was resumed from an interrupted dev run; its code (store, layers, content, round, scene, rules, builders) was kept and finished.

**Store.** ProgressStore v4: `MIGRATIONS[3]` adds `outfit: {}`; the shape check requires an `outfit` object; `sanitiseOutfit` drops unknown ids and ids in the wrong slot (memory only, one warn); `setOutfit(slot, id | null)` writes synchronously; `outfit` is a copy. Tested (v3 → v4 written back, wear/replace/take off, bad ids).

**Layers** (`core/outfit-layers.ts`). `attachOutfit` adds one image per worn slot at depth base + 0.001 × (shirt 1, glasses 2, hat 3) and copies frame, origin, position, scale (incl. negative scaleX), angle, alpha and visibility from the Shiba on every `postupdate`; `setFrame` sets the frame, restores the origin and syncs at once. A missing overlay frame hides that layer and warns once per frame name. Map routes the guide's wave through it and calls `set(ProgressStore.outfit)` in `update` (the island scene stays alive behind the yard); IceCream routes every Shiba frame change through `setShibaFrame`. The layer behaviour is unit-tested with a fake scene (no Phaser scene harness for Map/IceCream, as in 5.8/6.1).

**Game.** Pure round model (`games/dress-up/round.ts`, tested: wear, replace, take off, rapid taps, the 5th change completes once, names silent after, resume `{ changes }` with bad partials → fresh). Scene `DressUp.ts`: icons drawn where rendered with a tap circle `max(longest/2, 55)`; a worn halo; Shiba and the mirror react on tap; wear → name line (before completion only), a random reaction of 3 (mirror-smile, hop-wag, giggle-wiggle; no immediate repeat); take off → shake + `sfx.dress-up.pop`; `finishRoundAndStay()` after 5 changes; the reflection is a clone of the Shiba and its layers with scaleX < 0 (×0.6) at `anchor.mirror`, masked by `hit.mirror-glass` through a WebGL mask filter where available. Registered: wakes the `wardrobe` corner (home.test updated). `SFX.hop` (`sfx.shell.happy`) is a Boot sound, so it is not in the game's load list.

**Art.**
- `render_screen.py`: `bhc_holdout_sprites` (JSON list) turns the listed sprites' objects into holdouts in that group's pass (backward compatible).
- `outfit.py`: the 11 items, `dress()` (one `sprite.shiba-<id>` per item, base states, `movable` 1, the Shiba as holdout) and `icon()`. Wardrobe shirt icons are flattened, their sides straightened (no barrel) and the jumper/raincoat sleeves moved to the shoulders.
- `build_dress_up.py`: room, mirror, open wardrobe (casts no shadow, so its inside is bright; icons cast none either), Shiba states idle[1], happy[2], turn[2]. Iteration: the first plate had a dark wardrobe inside and shirts hanging below the floor line; the ground pivot moved to y 683, the shelves/rail up 27 px and the plinth lowered.
- Rebuilt, rendered and atlased map, ice-cream and dress-up. Every `shiba/<state>/<nn>` has all 11 overlays (`validateOutfitFrames`, run by atlas/validate:content, tested). Pages: map 1 (2048×1881, 113 frames), ice-cream 3, dress-up 2 (each ≤ 2048², ≤ 8 MiB). The old single `ice-cream.png` page was removed. The map and ice-cream plates are unchanged (PSNR vs the 8.2 backup 92.8 dB / 99.8 dB).
- Scratch composites (session scratchpad): map guide idle/wave with 4 outfits, ice-cream idle/shiver/sneeze/happy/nose with outfits (the counter and cone cut the shirt), dress-up idle/happy/turn. Aligned, no gaps; a hat sits between the ears.

**Layout rule.** `validateDressUp` (render, atlas, validate:content; `tools/layout/dress-up-rules.test.ts`): Shiba and mirror hulls ≥ targetMin, inside the rect, clear of the HUD; item circles ≥ 110 px, ≥ 24 px from each other and from the hulls; anchors on screen; every frame in the atlas.

**Voice/sound.** 13 lines (`npm run tts`, ElevenLabs): prompt, 11 names, parent invite — not yet approved by the parent. `sfx.dress-up.pop` is our own ffmpeg recipe; the giggle and rustle reuse the bedtime sounds.

**Checks.** `npm run check` exits 0 (1993 tests); `npm run audio:check` OK.

**Not verified.** Not played in a browser or on the iPad: the mirror mask filter (WebGL), the reflection's placement in the glass, and the overlays during the live map wave and ice-cream reactions are verified only by composites and unit tests.

## Spec Change Log

## Review Triage Log

Iteration 0 (2026-10-26). Layers: blind (B), edge-case (E), verification-gap (V).

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| V-o / B2 | Outfit layers sit at Shiba depth + 0.001…0.003 while IceCream draws everything at depth 0 in list order, so the shirt/glasses/hat draw over the scoops on the cone (cone slots lie inside Shiba's hull); setDepth also runs every frame (queues a display-list sort each call, Phaser 4.2.1 Depth.js:56) | high | IceCream.ts:75 "everything here is drawn at depth 0", scoops ordered by `children.bringToTop` (554–555); outfit-layers syncOne calls `setDepth(base.depth + step)` every postupdate | patch |
| V1 | DressUp scene test never creates the layers (`textures.exists → false`), so `shibaLayers/mirrorLayers.set` is unverified | medium | gap filed pre-verified | patch |
| E2 / B4a | Mirror mask Graphics (`make.graphics(…, false)`) is never destroyed: one leaks per wardrobe visit | low | no destroy on shutdown in DressUp.ts maskToGlass | patch |
| E3 | Home before any change abandons with `{ changes: 0 }`; the next open logs a false "bad resume" warning | low | resumeDressUp rejects changes < 1; DressUp.build warns whenever resumeAt && !resume; common (Home right away) | patch |
| V2, V3, E10, B10a | No Map / IceCream scene-level tests for the outfit wiring (spec task asked for them) | medium | gap filed pre-verified; repo has no Map/IceCream Phaser harness | defer |
| B5 | The reflection's fit inside the glass is not validated and was never seen in a browser | maybe-false (medium if true) | needs a browser/iPad look or a rule checking the scaled hull inside `hit.mirror-glass` | defer |
| B1 | Layers outlive a destroyed base while the scene lives | false | Map clears `guide` only in its shutdown handler (Map.ts:425–434), where the layers are destroyed too | reject |
| B3 | Map.update polls the store every frame | low | an object copy and a no-op set per frame; fix needs an event or wake hook | reject |
| B4b | Silent skip when make.graphics / enableFilters is missing | low | WebGL renderer always has them; Canvas fallback only | reject |
| B6, E5, E6 | hit.shiba hull adds only the party hat (cowboy brim, crown tips outside) | low | a missed tap on a brim edge only skips a reaction; fix needs a rebuild | reject |
| B7, E4 | Sleeves fall back silently / may bind to a `.001` leg | maybe-false (low) | composites show sleeves on the waving leg; no duplicate leg names found in the builds | reject |
| B8 | validate-content dress-up branch skips validateOutfitFrames | false | `DRESS_UP_SCREEN.frames` lists every overlay frame, so the screen check already requires them | reject |
| B9 | No GPU memory budget for the extra atlas pages | low | page limits set by the spec; dino-puzzle already ships 4 pages | reject |
| B10b | DressUp tests miss Shiba/mirror taps, no-repeat rule, parent invite, bad resume | low | no-repeat and invite are core/reactions and base behaviour tested elsewhere | reject |
| B11 | IceCream setShibaFrame updates size/origin only on the outfit path | false | every Shiba frame shares the full-frame source size; the origin is restored at once | reject |
| B12 | Spec/tracking loose ends | false | status moves with the workflow; approval of voice lines is a parent step | reject |
| B13 | Parent line asks only about hats; giggle reuses dressUpShakes; unused params | false / low | the parent line is the spec's wording; others cosmetic | reject |
| E1 | Icon without spriteSourceSize vanishes silently | low | the packer always writes spriteSourceSize | reject |
| E7, E8 | Raw JSON/ZeroDivision errors in Blender tools | low | build-time only, fails loudly | reject |
| E9 | Only mirror-smile turns to the mirror | false | the spec lists "turn to the mirror and smile" as one of ≥ 3 random reactions | reject |

## Design Notes

Overlays beat pre-composited variants: 11 items over 3 slots give 5 × 4 × 5 = 100 combinations per frame. Overlays need only 11 per frame and keep the base frames untouched (6.1 kept the rig layer-compatible for this).

Phaser keeps the full-frame origin for trimmed frames, so the same anchor gives the same `originFor` for the base and every overlay. Mirroring uses a negative scaleX about that origin, never `flipX`.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run audio:check` -- expected: OK.

**Manual checks:**
- Scratch composites of the map, ice-cream (idle, shiver, sneeze) and dress-up frames with a full outfit: no seams, the hat sits behind the ears where they overlap, and the shirt stays behind the counter in Tiệm kem.
