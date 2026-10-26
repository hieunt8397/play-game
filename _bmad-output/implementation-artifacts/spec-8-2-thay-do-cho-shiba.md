---
title: 'Story 8.2: Thay đồ cho Shiba'
type: 'feature'
created: '2026-10-26'
status: 'in-progress'
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
- [ ] ProgressStore v4 + migration/sanitise/setOutfit tests.
- [ ] `render_screen.py` holdout prop; `outfit.py`; builder edits in map and ice-cream; new `build_dress_up.py`. Then build, render and atlas the three screens, iterate on composites, and set the page limits.
- [ ] `outfit-layers.ts` + tests; wire into Map and IceCream (scene tests: an overlay follows the frame and scale; a missing frame warns once).
- [ ] Content, round model (wear, replace, take off, count, resume) + tests; DressUp scene, mirror, reactions; registry; layout rule.
- [ ] Voice lines + `npm run tts`; sounds (pop, giggle reuse) under `audio:check`.

**Acceptance Criteria:**
- Given `npm run art:build <screen> && npm run render <screen> && npm run atlas` for map, ice-cream and dress-up, then every `shiba/<state>/<nn>` has a `shiba-<item>/<state>/<nn>` for all 11 items, and the page limits hold.
- Given a hat, glasses and a shirt chosen in the wardrobe, when the child opens the map and Tiệm kem, then the guide wave and every ice-cream reaction show all three, aligned with no gap or float.
- Given a fresh install, then Shiba is bare everywhere and the corner "Tủ đồ" is awake.
- Given `npm run check` and `npm run audio:check`, then both exit 0.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Overlays beat pre-composited variants: 11 items over 3 slots give 5 × 4 × 5 = 100 combinations per frame. Overlays need only 11 per frame and keep the base frames untouched (6.1 kept the rig layer-compatible for this).

Phaser keeps the full-frame origin for trimmed frames, so the same anchor gives the same `originFor` for the base and every overlay. Mirroring uses a negative scaleX about that origin, never `flipX`.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run audio:check` -- expected: OK.

**Manual checks:**
- Scratch composites of the map, ice-cream (idle, shiver, sneeze) and dress-up frames with a full outfit: no seams, the hat sits behind the ears where they overlap, and the shirt stays behind the counter in Tiệm kem.
