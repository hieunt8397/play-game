---
title: 'Story 2.2 — Danh mục trang trí, ô trên đảo và reward-service trao thưởng lưu ngay'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'NO_VCS'
baseline_commit: 'NO_VCS'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-pipeline-hinh-render-blender-atlas-layout.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-5-man-con-duong-7-tram-nhan-loi-moi-tram-ngu.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-kart-chay-toi-tram.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-progressstore-luu-ben-vung-nho-do-kho.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** A finished round changes nothing on the island. Today:
- spec-2-1's v2 document has an empty `decorations: DecorationSlot[]` and no action that fills it.
- spec-1-4 builds only two placeholder `slot.<stationId>-<n>` objects per station, and there is no decoration art, catalogue or atlas frame.
- Nothing listens for `round:complete` / `reward:earned` outside a scene. A reward earned while Map sleeps (Tiệm kem) or is stopped (Chạm là nói, Epic 4) would be lost.

**Approach:**
- **Catalogue.** Add `content/decorations.ts`, an AI-chosen catalogue of 4 CC0 models per station (table below, human decision 2026-10-08).
- **Art.** `art/map.blend` gets 1–2 slots per station (review loop 1b: 10 in total) plus one `sprite.decoration` group whose `state.<decorationId>` children render through the spec-1-4 pipeline as frames `decoration/<decorationId>/00` in `atlas.map`.
- **Grant.** `ProgressStore.grantDecoration(stationId)` picks the slot and the item, advances `seq` and writes synchronously.
- **Reward service.** A boot-time `core/reward-service` is the only caller of `grantDecoration`. It queues each result in `SessionStore.pendingFlyIns` and answers `reward:earned` with `reward:granted`.
- **Map.** Map draws saved decorations statically. A tap on one bounces it with a happy sound.
- **Checks.** The layout, atlas and content checks enforce the slot and size rules.

## Boundaries & Constraints

**Always:**
- **Slot naming (the spec-1-4 grammar wins over the epic's `slot.<id>.<n>`):**
  - Blender objects are `slot.<stationId>-<n>`, with n = 1..3 and no gaps. The layout key and `DecorationSlot.slotId` are `<stationId>-<n>`.
  - `STATIONS[i].slots` lists them in order. That order is the fill order.
- **Catalogue** (`content/decorations.ts`, data only):
  - `DECORATIONS: Readonly<Record<GameId, readonly { id: string; model: string }[]>>`.
  - `model` is a path relative to `assets/`. Order is fixed.
  - Ids are kebab-case and unique across all stations, because the frame is `decoration/<id>/00`.
- **`grantDecoration(stationId): GrantResult | null`** (`GrantResult = { slot: DecorationSlot; replaced?: { decorationId: string } }`, which lives in `content/types.ts`):
  - **Item:** the catalogue entry after the one held by the station's highest-`seq` entry, wrapping at the end. If the station has no entries, or that item has left the catalogue, it takes the first item.
  - **Slot:** the first slot in `STATIONS` order that has no entry. If every slot is taken, it uses the slot whose entry has the lowest `seq` among this station's current slots, and `replaced` holds the old `decorationId`.
  - **Cleanup:** before choosing, it drops this station's orphans (a `slotId` no longer in `slots`) and duplicate-slot entries, keeping the highest `seq`.
  - **Write:** `seq = doc.seq + 1`, which becomes both the new entry's `seq` and `doc.seq`. No clock is used. One synchronous `commit` happens inside the call. Other stations' entries are never touched.
  - **No slots or empty catalogue:** returns `null` with one `console.warn` and no write.
  - **Storage:** it follows the spec-2-1 policy (memory-only mode still grants in memory).
- **`getDecorations(): readonly DecorationSlot[]`** returns copies. It is Map's only read path.
- **reward-service** (`core/reward-service.ts › installRewardService(deps?)`):
  - It subscribes with global `bus.on` to `round:complete` and `reward:earned`. It is installed in `main.ts` before `new Game`, so it is always subscribed before Map and runs first.
  - A second install on the same Bus is a no-op that returns the same uninstall function.
  - **Each event:** it calls `progress.grantDecoration(gameId)` first. A non-null result is pushed to `SessionStore.pendingFlyIns`. For `reward:earned` only, it then emits `reward:granted { gameId, decorationId: result.slot.decorationId }`.
  - A `null` result does nothing more.
- **SessionStore** (spec-1-7) gains `pendingFlyIns: GrantResult[]`, in memory only. Story 2.3 drains it. In this story nothing removes entries from it.
- **Art pipeline** (spec-1-4 contract, extended):
  - **Inputs.** `build_map.py` receives the catalogue from `build.ts` as JSON: `{id, stationId, model (absolute path)}`. `art:build` fails before Blender if a model file is missing, and names it.
  - **Import.**
    - GLB comes in through the glTF importer from its original folder, so `Textures/colormap.png` resolves.
    - FBX comes in through the FBX importer, with every material forced to Alpha 1 / opaque.
  - **Build each item:**
    - normalise it to `DECO_SIZE_M` (largest dimension) times an optional `DECO_SCALE[id]`;
    - stand it on the ground at the world position of its station's `slot.<stationId>-1`;
    - turn it by `DECO_YAW` toward the camera;
    - add a flat dark blob-shadow disc at 25% alpha;
    - put it in the collection `state.<id>` under `sprite.decoration`.
  - **`sprite.decoration` is detached** (custom property `bhc_detached = 1`). It is excluded from the plate pass entirely, so it is neither visible nor casts shadows on `bg.map`.
  - **`render_screen.py`** renders one full-frame transparent pass per `state.*` child of a sprite group, with the other states hidden. Frame names stay `<object>/<state>/<nn>`.
- **Placement contract:**
  - Every frame of a station's decorations was rendered at `pivot = slots[STATIONS[station].slots[0]]`.
  - At a slot S, Map draws the full-frame image at `(S.x, S.y)` with origin `(pivot.x/design.width, pivot.y/design.height)` and scale `1/renderScale`. Its depth is `S.y`, the same scheme as the stations.
  - The footprint is the trimmed rect (`spriteSourceSize ÷ renderScale`) shifted by `S − pivot`. The tap rect is the footprint padded by `Tokens.components.tappableProp.hitPad`.
- **Check gate** (`tools/layout/rules.ts › validateDecorations`, run by `npm run atlas` before writing and by `validate:content`). Each message names the id:
  - Every `STATIONS` entry has ≥ 1 slot, and the ids are `<ownId>-1..k`.
  - Every layout `slots` key is listed in content, and every content slot has an anchor (the latter is spec-1-4's rule).
  - Every station's catalogue is non-empty, with kebab-case, globally unique ids.
  - `atlas.map` has `decoration/<id>/00` for every id.
  - For every (slot, item of that slot's station) pair:
    - the footprint's longest side is ≥ `Tokens.components.decorationItem.minSize` (80);
    - each side of the tap rect is ≥ `spacing.targetMin`;
    - the tap rect lies inside the interactive rect (safeRect minus the dead bands);
    - the footprint does not intersect any station hit polygon (UX-DR9). The polygon is used as drawn, with no extra padding. The 24 px tap pad may overlap a station, because the station's higher z wins the tap;
    - **next to its station:** the slot point lies within `DECO_MAX_STATION_DIST` = 170 design px of its station's anchor, and within 110 px of the station's slot 1 (the render pivot).
      - **Exception (amended in review loop 1b):** a station whose slots cannot all fit within 170 px, once the other stations' slots are placed, may use a per-station limit of up to 240 px. It is listed in a commented `DECO_STATION_DIST_OVERRIDE` table in `tools/layout/rules.ts`, with the reason.
      - Pick that station so the result reads well. Prefer `dino-puzzle` near the volcano, which fits its theme.
      - Every station still gets ≥ 1 slot, and no slot overlaps another slot.
  - The union footprints of any two slots, **from any stations**, do not overlap.
- **Map** (static only):
  - A pure `core/decoration-plan.ts › planDecorations(saved, layout, stations, catalogue, frameRect)` returns the draw items and the warnings.
  - Map calls it in `create` and again on `wake`, then diffs by `slotId` + `seq`: changed sprites are destroyed and new ones added, with no animation.
  - **Skipped entries,** each with one `console.warn` and nothing shown:
    - an unknown `decorationId`;
    - a missing frame;
    - a `slotId` with no anchor or not in its station's slots;
    - a duplicate slot (the highest `seq` is kept).
  - An empty island draws nothing at all: no placeholders.
- **Tap:**
  - Taps go through `createMapProp` (spec-1-5), extended with optional `at`, `origin` and `z`.
  - The press runs a bounce of `1 → tappableProp.react.scale` over `react.durationMs` around the ground pivot (reduced-motion `amplitude`). In the same handler it calls `audio.sfx('sfx.shell.happy')`.
  - The tap opens no game, does not touch `KartTrip` and does not trigger a station.
  - Decoration targets use `z: -1`. The router (spec-1-5/1-6) picks the highest `z` in a layer, then the last registered target, so a station polygon always wins an overlap.

**Never:**
- No fly-in, sparkle, camera pull-back, `onChainEnd`, draining of `pendingFlyIns`, overlay or resume (Stories 2.3–2.5). No collection screen and no ⭐ button.
- No `grantDecoration` call outside `core/reward-service.ts` (tests excepted). Map never grants.
- No wall clock in `seq`. No async or deferred write. No new storage key.
- No hand-typed design coordinates. Slot positions and builder offsets are Blender world units.
- No network. No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **Catalogue (AI-chosen per the human decision; all CC0, already in `assets/`):**

  | station | ids in order → model |
  |---|---|
  | ice-cream | `parasol` → kenney_city-kit-commercial_2.1/…/detail-parasol-a.glb · `giant-cone` → kenney_food-kit/…/ice-cream.glb · `popsicle` → …/popsicle.glb · `sundae` → …/sundae.glb |
  | pizza | `pizza-pie` → kenney_food-kit/…/pizza.glb · `tomato` → …/tomato.glb · `cheese` → …/cheese.glb · `pizza-box` → …/pizza-box.glb |
  | race | `cone` → kenney_car-kit/…/cone.glb · `traffic-light` → kenney_city-kit-roads/…/traffic-light.glb · `race-car` → kenney_car-kit/…/race-future.glb · `barrier` → kenney_city-kit-roads/…/construction-barrier.glb |
  | fishing | `boat` → quaternius/cutefish/Boat.fbx · `puffer` → …/Puffer.fbx · `koi` → …/Koi.fbx · `butterfly-fish` → …/ButterflyFish.fbx |
  | touch-talk | `fire-truck` → kenney_car-kit/…/firetruck.glb · `ambulance` → …/ambulance.glb · `taxi` → …/taxi.glb · `street-lamp` → kenney_city-kit-roads/…/light-curved.glb |
  | dino-puzzle | `parasaurolophus` → quaternius/dinosaurs/Parasaurolophus.fbx · `pineapple` → kenney_food-kit/…/pineapple.glb (no T-rex anywhere: UX-DR75; swapped 2026-10-08, see spec-cross-notes) · `dino-egg` → kenney_food-kit/…/egg.glb · `coconut` → …/coconut.glb |
  | shadow-match | `mushroom` → kenney_food-kit/…/mushroom.glb · `pumpkin` → …/pumpkin.glb · `lamp-post` → kenney_city-kit-roads/…/light-square.glb · `alpaca` → quaternius/animals/Alpaca.fbx |

  - `…` is `Models/GLB format/` inside the Kenney kit.
  - Excluded: balloons and flags (they are not in the packs); Shiba, the fox and the station dinos (already game characters); and Apatosaurus, Stegosaurus and Triceratops (already in the dino and cave stations).
  - 28 items in total. Each station has more items than slots, so a replacement always brings in a different item.
- **2 slots per station (14 in total)** (amended 2026-10-09, review loop 1). `build_map.py` grows spec-1-4's 2-point slot table to a named `SLOT_OFFSETS` table. Its points are on grass or sand, beside their own station (see the "next to its station" rule), and away from the road.
  - If a second point cannot pass the rules, the builder may drop that station to 1 slot, with a commented constant, and `STATIONS` must match. The rule is only ≥ 1. If even 1 slot cannot pass for a station, stop and report it as blocked; do not move a slot away from its station.
- **Size target:** tune `DECO_SIZE_M` so items display at about 84–110 px on their longest side, smaller where the space beside a station is tight. The rules enforce ≥ 80, and the atlas must stay on one page. Per-item tweaks go only in `DECO_SCALE`, and **every catalogue id has a `DECO_SCALE` entry**: the builder fails, naming the id, when one is missing or a key is not in the catalogue.
- **Item sound** is `sfx.shell.happy` (spec-1-5's "tiếng vui"), not `sfx.shell.prop`.
- **Pivot = slot 1:** one render per item serves every slot of its station, and the perspective drift across about 100 px is negligible. There is no new layout field.
- **A Vitest source scan** in `reward-service.test.ts` enforces the single-caller rule instead of a lint rule, because flat-config `no-restricted-syntax` entries replace each other (spec-2-1).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First grant | empty doc, `grantDecoration('ice-cream')` | `{slot:{slotId:'ice-cream-1', decorationId:'parasol', seq:1}}`; `doc.seq` 1; `setItem` ran before return | — |
| Fill 3 | 3 grants | slots -1,-2,-3 ← parasol, giant-cone, popsicle; seq 1,2,3 | — |
| Reload | new store on same storage + `init()` | `getDecorations()` has the same 3 entries | — |
| Full | 4th grant | slot -1 (seq 1) ← `sundae`, seq 4; `replaced:{decorationId:'parasol'}` | — |
| Second lap | 5th, 6th grant | -2 ← parasol (wrap), then -3 ← giant-cone; ≤ 3 entries for ice-cream | — |
| Isolation | pizza full; grant ice-cream | pizza entries unchanged | — |
| Orphan / dup | saved `ice-cream-9`, two entries on `ice-cream-1` | dropped/deduped on the next ice-cream grant | — |
| Gone item | highest-seq item not in catalogue | next item = first | — |
| No slots | station with `slots: []` (test stub) | `null`, no write | one warn |
| touch-talk earned | `reward:earned {gameId:'touch-talk'}` | 1 entry at `touch-talk-1`; 1 `pendingFlyIns`; 1 `reward:granted` with `fire-truck` | — |
| round:complete | one `round:complete` | exactly 1 grant, 1 pending, no `reward:granted` | — |
| Double install | `installRewardService()` twice, emit once | 1 listener per event; 1 grant | — |
| Storage dead | `setItem` throws | grant still in memory; reward flow unchanged | spec-2-1 warn |
| Map plan | saved unknown id / missing frame / no anchor | entry skipped | one warn each |
| Rule breach | footprint inside a station hull, < 80 px, missing frame, empty catalogue | `atlas` refuses to write; `check` fails naming the id | exit 1 |

</intent-contract>

## Code Map

- `app/src/core/progress-store.ts` (+ test) -- the v2 store from spec-2-1 (planned): `commit`, sanitise, `PROGRESS_SCHEMA_VERSION = 2`. Add `grantDecoration`, `getDecorations`, and an injectable `catalog` dep (`slots(id)`, `items(id)`) that defaults to `STATIONS`/`DECORATIONS`. Schema version is unchanged.
- `app/src/core/decoration-grant.ts` (new) -- pure `planGrant(decorations, seq, stationId, slots, items)`.
- `app/src/core/reward-service.ts` (new) -- `installRewardService({ bus, progress, session })`.
- `app/src/core/bus.ts` -- `round:complete`, `reward:earned` and `reward:granted` already exist. Unchanged.
- `app/src/core/session-store.ts` -- planned in spec-1-7 and reduced in spec-2-1. Add `pendingFlyIns`.
- `app/src/content/types.ts` -- `DecorationSlot` (spec-2-1). Add `GrantResult`.
- `app/src/content/decorations.ts` (new), `stations.ts` (spec-1-4/1-5, `slots` → 3 ids each), `validate.ts` (+ test) -- catalogue shape rules.
- `app/src/core/decoration-plan.ts` (new) -- the pure draw plan.
- `app/src/core/ui/map-prop.ts`, `core/input/tap-router.ts`, `hotspot-polygon.ts` -- planned in spec-1-5/1-6. Add `at`/`origin`/`z`, and the z tiebreak.
- `app/src/scenes/Map.ts` -- planned in spec-1-5/1-7. Add `syncDecorations()` on create and on wake.
- `app/src/main.ts` -- add the `installRewardService()` call.
- `app/tools/render/blender/build_map.py`, `render_screen.py`, `tools/render/build.ts` -- planned in spec-1-4. Add decoration import, slots, detached group and state passes.
- `app/tools/layout/rules.ts`, `tools/atlas/pack.ts`, `tools/lint/validate-content.ts` -- planned in spec-1-4. Add `validateDecorations`.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/content/types.ts`, `app/src/content/decorations.ts`, `app/src/content/stations.ts` -- `GrantResult`; the catalogue table; 3 slot ids per station.
- [x] `app/src/content/validate.ts` (+ test) -- non-empty catalogue per `GAME_IDS`; unique kebab ids; `model` matches `^(kenney|quaternius)/.+\.(glb|fbx)$`; slot ids are `<ownId>-1..k`.
- [x] `app/src/core/decoration-grant.ts` (+ test) -- every grant row of the matrix.
- [x] `app/src/core/progress-store.ts` (+ test) -- `grantDecoration` and `getDecorations`; write-before-return; the reload test; the memory-only grant test.
- [x] `app/src/core/session-store.ts` (+ test) -- `pendingFlyIns: []` on a fresh store.
- [x] `app/src/core/reward-service.ts` (+ test) -- install, idempotence, ordering (the grant has been written before `pendingFlyIns` and `reward:granted`), the touch-talk and round:complete rows, and a source scan that `grantDecoration(` appears only in `progress-store.ts` and `reward-service.ts` under `src/` (tests excluded).
- [x] `app/src/main.ts` -- call `installRewardService()` before `new Game(config)`.
- [x] `app/src/core/input/tap-router.ts`, `hotspot-polygon.ts`, `app/src/core/ui/map-prop.ts` (+ tests) -- the `z` option and the tiebreak (a higher z wins; at equal z, the last registered wins); `createMapProp` `at`/`origin`/`z`.
- [x] `app/src/core/decoration-plan.ts` (+ test) -- position, origin, depth, tap rect and every skip/warn case.
- [x] `app/src/scenes/Map.ts` -- `syncDecorations()` on create and on `wake`, with z −1 targets and the bounce plus happy sfx.
- [x] `app/tools/render/build.ts` (+ test), `app/tools/render/blender/build_map.py` -- pass the catalogue JSON; fail fast on a missing model; `SLOT_OFFSETS` × 3; `sprite.decoration` with `state.<id>` and blob shadows; `DECO_SIZE_M`, `DECO_SCALE`, `DECO_YAW`.
- [x] `app/tools/render/blender/render_screen.py` -- detached groups are excluded from the plate; one pass per `state.*` child.
- [x] `app/tools/layout/rules.ts` (+ test), `app/tools/atlas/pack.ts`, `app/tools/lint/validate-content.ts` (+ test) -- `validateDecorations`, with one test per rule plus a passing fixture. Wire it into atlas (refuse to write) and into check.
- [x] `src/content/generated/map.layout.json`, `public/assets/atlases/map.{png,json}` -- regenerate with `npm run art:build -- map && npm run render -- map && npm run atlas -- map`, fixing rule failures in the builder tables.

- [x] `app/tools/layout/rules.ts` (+ test) -- review loop 1: the "next to its station" distance rule (≤ 170 px from the anchor, ≤ 110 px from slot 1) and the no-overlap rule across all stations, each with a failing fixture; `build_map.py` `SLOT_OFFSETS` re-derived to 2 slots per station beside each station, `STATIONS` to match, the complete-`DECO_SCALE` check (adding `lamp-post`), and art/layout/atlas regenerated.
- [x] `app/src/core/decoration-plan.ts` (or a sibling core file) (+ test) -- review loop 1: move Map's keyed prop diff (`slotId#seq`: keep, destroy replaced or removed, add new) and its `customData.spriteSourceSize` → `Rect` adapter into pure helpers, so `Map.syncDecorations` is wiring only. Tests: a grant made while Map sleeps is added on the next sync, a replacement (new seq) swaps the prop, and `{x,y,w,h}` maps to `{x,y,width,height}`.
- [x] `app/src/core/reward-service.test.ts` -- review loop 1: extend the source scan so it asserts `main.ts` calls `installRewardService()` before `new Game(`.

**Acceptance Criteria:**
- Given the regenerated outputs, when running `npm run check`, then it exits 0. The layout has 2 slots per station (`<stationId>-1..2`; 1 where a station had to drop to 1), each beside its own station, `atlas.map` is one page ≤ 2048² holding 28 `decoration/<id>/00` frames, and every item footprint is ≥ 80 px, clear of every station polygon and of every other slot's footprint.
- Given `npm run dev` with an empty `bhc.progress`, when the Map opens, then no decoration, placeholder or marker is visible.
- Given a finished Tiệm kem round, when the island fades back, then `bhc.progress.decorations` already holds `{slotId:'ice-cream-1', decorationId:'parasol', seq:1}` (it was written before Map woke). The parasol stands statically next to the ice-cream truck. After a full reload and ▶, it is still there, without animation.
- Given three finished Tiệm kem rounds, when the Map is shown, then the two ice-cream slots show the popsicle (slot 1, which replaced the parasol on the 3rd grant) and the giant cone (slot 2). There are never more than 2 ice-cream items, and the other stations are untouched. (Amended in review loop 1b: 2 ice-cream slots. The 3-slot matrix rows are unit rows run against a 3-slot stub catalogue.)
- Given a decoration on the Map, when the child taps it, then it bounces 1.1× over ~0.3 s with the happy sound in the same frame. No station reacts, no kart moves and no game opens. A tap inside a station polygon that overlaps a decoration's tap rect goes to the station.
- Given `bhc.progress` edited in DevTools to contain `decorationId:'unicorn'`, when the Map opens, then that entry is not drawn, one `console.warn` names it, and the child sees nothing unusual.

## Spec Change Log

- **2026-10-09: the slots sit mostly on the southern shore, not next to every station.** The padded station polygons cover most of the island's middle. A ~95 px item (with its 24 px tap pad) clears them only on the southern grass and beach, around the volcano, and in one infield pocket below the pond.
  - `SLOT_OFFSETS` came from a scratch search (outside the project). Slot 1 is the clear point nearest each station. Slots 2–3 can be far from their station, and they can overlap other stations' slots, because the rules only forbid overlap within one station.
  - `build_map.py` accepts `Sand` as well as `Grass` (`GROUND`), because the beach band is the only clear ground south of the pizza and race stations.
  - Several stations' slots are well over 100 px from slot 1, the render pivot. Those items show a visible perspective mismatch, which goes past the Design Notes' "negligible drift" assumption.
- **2026-10-09 (review loop 1, bad_spec): slots must sit next to their own station.**
  - **Triggering finding.** Review plus a slot overlay on `bg.png` showed the problem:
    - All 3 `shadow-match` slots are in the bottom-right corner, `race-2` is at the far west edge, and `dino-puzzle` slots are by the volcano.
    - `fishing-3` is 10.8 px from `ice-cream-1`, and other cross-station pairs are about 21 px apart.
    - This breaks the AC "the parasol stands next to the ice-cream truck" and the intent that a decoration belongs to its station. Overlapping slots also let a decoration drawn behind steal taps.
  - **Amended:**
    - 2 slots per station, with a drop to 1 allowed.
    - New rule: each slot within 170 px of its station anchor and within 110 px of slot 1.
    - No footprint overlap across stations.
    - Station polygons are used unpadded for the footprint test.
    - Size target lowered to 84–110 px.
    - A complete `DECO_SCALE` is enforced.
  - **Known-bad state avoided:** decorations bunched on the southern shore far from their stations, cross-station overlaps, and the render pivot more than 110 px from a slot.
  - **KEEP:** everything else in the first implementation stays as built:
    - catalogue (`content/decorations.ts`), `planGrant`, `grantDecoration` / `getDecorations`, `pendingFlyIns`;
    - `reward-service` and its install in `main.ts`;
    - tap-router / `HotspotPolygon` `z`, `createMapProp` `at` / `origin` / `z`, `planDecorations`;
    - `validateDecorationCatalogue`;
    - the `build.ts` catalogue hand-off, and the GLB/FBX import, blob shadows and `sprite.decoration` / `state.<id>` group in `build_map.py`;
    - `render_screen.py`'s detached-group handling;
    - the `pack.ts` / `validate-content` gate wiring and all existing tests.
    
    Only `SLOT_OFFSETS`, the slot count in `STATIONS`, the size tuning, the new rules in `validateDecorations` (with tests) and the regenerated art, layout and atlas change.
- **2026-10-09: item size is about 94 px, not 96–120.** At 96–120 px the 21 footprints do not fit beside the station polygons. `DECO_SIZE_M = 1.85`, and `DECO_SCALE` is tuned per item so each item measures about 94 px on its longest side at its station's pivot (rule: ≥ 80).
- **2026-10-09: small API shapes.** `HotspotPolygon` takes an optional 4th argument, `{ z }`, and router targets carry an optional `z`. `core/decoration-plan.ts` uses `.ts` import specifiers so that `tools/layout/rules.ts` reuses its footprint maths. `build.ts` passes the catalogue as `--decorations <file>` and logs the builder's `build_map:` report lines. `validate-content` decoration frame problems are named by `validateDecorations`, not by the generic required-frames list.
- **2026-10-09 (review loop 1b): one station may use a per-station distance limit of up to 240 px.**
  - Why: the implementer's search in Blender on the real scene found that dino-puzzle, touch-talk and shadow-match compete for two free pockets under the 170 px rule, so one of the three could not get even 1 slot. Item sizes were 81–110 px with zero margin.
  - Amendment: the station that cannot fit within 170 px gets a commented override of ≤ 240 px, preferring dino-puzzle near the volcano. The no-overlap rule across all stations and the ≥ 1 slot rule stay.
  - "Unpadded" means the stored station hit polygon as drawn, with no extra padding, which is what the code already does.
  - KEEP: the loop-1 work already done — `spriteSourceRect` / `diffDecorations`, the `main.ts` source scan, `check_deco_scale` with `lamp-post`.
- **2026-10-09 (review loop 1b, done): final slots, 10 in total.**
  - **Slots per station:**
    - ice-cream, pizza and race have 2 slots.
    - fishing, touch-talk, dino-puzzle and shadow-match have 1. No second slot fits beside these four without overlapping another footprint or a station polygon.
  - **Distance override:** `dino-puzzle` uses `DECO_STATION_DIST_OVERRIDE` (240 px). Its slot stands by the volcano, 201 px from its anchor.
  - **Distances:** every other slot is 123–167 px from its station's anchor, and every slot 2 is 85–104 px from its slot 1.
  - **Item sizes:** items measure 84–111 px on their longest side at their station's pivot, except the slender street lamp at about 85 px tall.
  - **Small deviation:** `build_map.py` turns the curved street lamp to 270° (`DECO_YAW_OVERRIDE_DEG`). At the shared 30° its arm points at the camera, which leaves the footprint about 27 px wide, so its tap rect is under 80 px.
  - **Test change:** the progress-store grant tests now use a 3-slot stub catalogue, which keeps the spec's matrix rows. A new test covers the real 2-slot ice-cream replacement.

## Review Triage Log

Loop 0 (first implementation):

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind, edge | Slots far from their station and overlapping other stations' slots; a decoration drawn behind can steal taps (z tie → last registered) | high | Slot overlay on bg.png: all `shadow-match-*` in the bottom-right corner, `race-2` at x 98, `fishing-3` 10.8 px from `ice-cream-1`; breaks the AC "next to the ice-cream truck" | bad_spec (loop 1) |
| 2 | blind, edge | `DECO_SCALE` lacks `lamp-post`; keys unchecked | low | build_map.py has no `lamp-post` key (grep); the item silently uses scale 1.0 | folded into loop 1 |
| 3 | verification-gap | `main.ts` boot install of the reward service untested | medium | No test reads main.ts; deleting the call keeps check green | folded into loop 1 (source scan) |
| 4 | verification-gap | `Map.syncDecorations` keyed diff and frame adapter untested | medium | No test runs Map; swapping w/h or keying by slotId alone stays green | folded into loop 1 (pure helper) |
| 5 | verification-gap | The plate's exclusion of the detached decoration group is unverified | medium | Needs Blender in the loop; only a human look at bg.png catches it | defer |
| 6 | blind, edge | One round could earn two decorations (`round:complete` + `reward:earned`) | maybe-false | No game emits `reward:earned` yet (grep); touch-talk is Epic 4 (Story 4.5/4.6 must emit only `reward:earned`) | defer |
| 7 | blind, edge | "More items than slots" not enforced by a validator | low | Real data has 4 items for ≤ 3 slots; fix adds a rule | reject |
| 8 | edge | `planGrant` may pick an item already placed when the newest item left the catalogue | low | Needs a catalogue edit plus saved data; unlikely | reject |
| 9 | edge | An entry with seq ≥ doc seq (edited document) misorders grants | low | Only through hand-edited storage | reject |
| 10 | edge | A grant while Map is awake is not drawn until the next wake | low | Every current grant arrives while Map sleeps (round:complete) | reject |
| 11 | edge | A second install with different deps silently ignores them | low | Single production install | reject |
| 12 | edge | Warning says "newer" for an equal seq | low | Diagnostics wording only | reject |
| 13 | edge | `footprint_report` never fails the build | low | `validateDecorations` fails atlas/check with the same rules | reject |
| 14 | edge | Removed build-time slot checks in `slot_problems` | low | TS gate covers them | reject |
| 15 | edge | validate-content test exact-equality assertion weakened | low | Other assertions in the file pin the decoration messages | reject |
| 16 | blind | Decoration rules duplicated in content/validate.ts and tools/layout/rules.ts; two frame-name helpers | low | Duplicate reports only; no wrong result shown | reject |
| 17 | blind | `pendingFlyIns` never drained | low | Draining is Story 2.3 (fly-in) | reject |
| 18 | blind | TS gate misses road / kart overlap | low | Blender builder keeps slots off the road; spec rules list no road rule | reject |
| 19 | blind | Tests need the CC0 model packs on disk | low | `assets/` is part of this repo; no CI | reject |
| 20 | blind | No attribution list for CC0 models | low | CC0 needs none; packs are named in the README provenance section | reject |
| 21 | blind | `'sfx.shell.happy'` hard-coded in Map.ts | low | Id exists in AUDIO_CATALOG; lint accepts it | reject |
| 22 | blind | Map shutdown does not destroy props | false | Phaser destroys scene children and the scoped router on shutdown | reject |

Loop 1 (after the 1b placement amendment):

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 23 | edge, blind | Saved seq lower than an entry's seq misorders grants | low | carried #9 — only through hand-edited storage | reject |
| 24 | blind | Gone newest item falls back to `items[0]`, which may already be placed | low | carried #8 | reject |
| 25 | edge, blind | One round could earn two decorations | maybe-false | carried #6 — no game emits `reward:earned` yet | defer (already logged) |
| 26 | edge | A grant while Map is awake or paused is not drawn | low | carried #10 | reject |
| 27 | blind | "More items than slots" enforced only by a test | low | carried #7; real data 4 items vs ≤ 2 slots | reject |
| 28 | blind | Catalogue rules duplicated and reported twice | low | carried #16 | reject |
| 29 | blind | TS gate has no road / kart check | low | carried #18 | reject |
| 30 | blind | `footprint_report` never fails; pad token differs from TS gate | low | carried #13; both tokens are 24 today | reject |
| 31 | blind | Tests need the CC0 packs / regenerated files on disk | low | carried #19; generated files are on disk, excluded from the review diff only for size | reject |
| 32 | verification-gap | The plate's exclusion of the detached group is unverified | medium | carried #5 | defer (already logged) |
| 33 | blind | Static draw plus `pendingFlyIns` will double-show once 2.3 adds the fly-in | low | carried #17 — Story 2.3 owns the fly-in and the queue | reject |
| 34 | edge, blind | `planDecorations` dedupes by slot before validity checks, so an invalid newer entry hides a valid one | low | Needs a hand-edited document; sanitise drops malformed entries | reject |
| 35 | blind | Equal-seq duplicate warning says "newer" | low | carried #12 | reject |
| 36 | edge, blind | Model path regex accepts `..` segments | low | Catalogue is code reviewed in-repo; no external input | reject |
| 37 | edge | A zero-extent model divides by zero in build_map.py | low | Build fails loudly; all 28 models measure non-zero | reject |
| 38 | blind | Padded tap rects of neighbouring decorations may overlap | low | Footprints never overlap; `syncDecorations` registers in depth order, so the front item wins | reject |
| 39 | blind | A station with no anchor passes the distance rule | low | spec-1-4's rule already fails a missing anchor in the same gate | reject |
| 40 | blind | Single-caller scan misses `.tsx`/`.js` and computed access | low | The app has only `.ts` sources | reject |
| 41 | blind | Stale comments: build_map.py header "three slots", decoration-plan.ts "hitPad (4 points)", decoration-grant.test.ts helper "from an empty document" | low | Comments contradict the code; direct correction | patch |
| 42 | verification-gap | `MapScene.syncDecorations` glue (call sites, router readiness, z) untested | medium | No Phaser scene harness; pure helpers are covered | defer |
| 43 | verification-gap | Boot install checked only by a text scan | low | Scan catches deletion or reordering; a guarded call would slip | defer |

## Design Notes

**Why render at slot 1 and re-anchor:** spec-1-4 frames are full-frame and pixel-aligned to the plate, which works for things that never move. A decoration can sit in any of its station's slots, so its frame is aligned at one known point instead (`pivot`, slot 1). Map sets the origin to that point and places it at the target slot:

```ts
const p = layout.slots[station.slots[0]], s = layout.slots[entry.slotId];
scene.add.image(s.x, s.y, 'atlas.map', `decoration/${id}/00`)
  .setScale(1 / layout.renderScale).setOrigin(p.x / layout.design.width, p.y / layout.design.height)
  .setDepth(s.y);
```

**Why the grant lives in the store and not in Map:** this is AD-2. Choosing and writing in one synchronous action means an app kill mid-animation can never lose a reward or grant twice. A Chạm là nói reward also lands while Map is stopped.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0. Tests for grant, reward-service, plan, router z and rules pass, and `validate:content` reports 10 slots and 28 decorations.
- `cd app && npm run art:build -- map && npm run render -- map && npm run atlas -- map` -- expected: exit 0, a one-page atlas with 28 decoration frames, and a byte-identical layout on a re-render.
- `cd app && npx vitest run src/core/reward-service.test.ts src/core/decoration-grant.test.ts` -- expected: every matrix row passes.

**Manual checks:**
- In `app/.generated/render/map/preview.png`, the slots sit on grass, away from the road and the stations. Each `decoration/<id>/00` frame looks like the low-poly toy style, with a soft blob shadow and no fully transparent FBX parts.
- In `npm run dev`, set `bhc.progress` decorations by hand to fill every slot (one item per station). The island reads uncluttered, and nothing covers a station or a label.
