---
title: 'Story 1.4 — Pipeline hình: render Blender → atlas + layout bản đồ'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'NO_VCS'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-be-nghe-giong-doc-tieng-viet.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Map (1.5), the kart (1.7), Tiệm kem (1.8) and the Epic 2 decorations all need the approved low-poly island as images, plus hit polygons, anchors, slots and a road path that line up with those images. Nothing yet builds the scene, renders it, packs an atlas or checks that hit areas meet the touch rules. Hand-typed coordinates are banned (AD-10).

**Approach:**
- A Blender CLI script builds `art/map.blend` reproducibly from a vendored copy of the approved reference scene. It adds the named layout objects.
- `npm run render -- map` renders a 2× background plate and full-frame station sprites. It projects the layout objects to `src/content/generated/map.layout.json` in 1× design px.
- `npm run atlas -- map` packs the sprites with free-tex-packer-core 0.3.9 into `atlas.map` and copies the plate to `bg.map`.
- `npm run check` validates the layout against `content/stations.ts` and the touch rules, and checks the asset size caps.
- The README and `npm run doctor` document the prerequisites.

## Boundaries & Constraints

**Always:**
- **Tool resolution:**
  - Blender resolves through `tools/shared/binaries.ts` with a new `BLENDER` spec: `BLENDER_BIN` first, then `blender` on PATH, probed with `--version`.
  - After that, `blender --version` must report `Blender 5.2.x`. Any other version exits 1 with "needs Blender 5.2 (found X)".
  - Resolution happens before any work. A failure exits 1 with a message naming Blender, and no file is written or replaced.
- **Blender invocations:**
  - Always pass `-b --factory-startup <blend> --python-exit-code 1 --python <script> -- <args>`. Without `--python-exit-code`, a Python error still exits 0.
  - Each run works in a fresh temp dir. Outputs are renamed into place only after Blender exits 0 and every check passes. Otherwise the existing `art/map.blend`, `.generated/render/map/`, layout JSON and `public/assets` files stay untouched.
- **Object naming (the cross-story contract):**
  - Layout objects are named `<kind>.<id>`, where kind is `anchor`, `hit`, `slot` or `path`, and id matches `^[a-z0-9]+(-[a-z0-9]+)*$`.
  - A Blender duplicate suffix (`hit.pizza.001`), a wrong case or an unknown kind fails the render and names the object. So does a duplicate `<kind>.<id>`.
  - Layout objects live in a `layout` collection with `hide_render = True`.
  - Sprite groups are collections named `sprite.<object>`. Each is rendered as frame `<object>/idle/00`. Later stories may add `state.<state>` child collections for more states or frames, using the same `<object>/<state>/<nn>` grammar.
- **Reserved ids on the map:**
  - `anchor.<stationId>`: the station's ground pivot. It is the XY centre of the sprite group's bounding box at its minimum z, and is used for bounce, label and hint-ring placement.
  - `anchor.<stationId>-stop`: the kart parking point. The builder computes it as the nearest point on `path.road`.
  - `anchor.kart-start`: where the kart starts.
  - `hit.<stationId>`: the hit polygon.
  - `slot.<stationId>-<n>`: placeholder decoration slots, two per station for now.
  - `path.road`: the drivable road centreline as a poly curve.
- **Layout JSON (v1).** Deterministic output: sorted keys, numbers rounded to 0.1, no timestamps or versions, so re-rendering the same `.blend` is byte-identical:
  `{ "v":1, "screenId":"map", "design":{"width":1024,"height":768}, "renderScale":2, "anchors":{id:{x,y}}, "hits":{id:[{x,y}…]}, "slots":{id:{x,y}}, "paths":{id:[{x,y}…]} }`.
  - Coordinates are design px with the origin top-left and y pointing down.
  - Each hit polygon is the convex hull of the projected `hit.<id>` vertices, padded outward by `Tokens.spacing.hitPad` (24). The stored polygon is the final tap area; runtime adds no further padding.
- **Images:**
  - Renders are 2048×1536 RGBA PNG from the scene camera, keeping the reference's colour management (Standard).
  - `bg.map` is the full scene. Sprite objects have `visible_camera = False` there but still cast their shadows onto it.
  - Each sprite frame is a full-frame transparent render of just its group, so an untrimmed frame lines up pixel-for-pixel with the plate.
- **Atlas:**
  - Pack with free-tex-packer-core 0.3.9 (pinned devDependency), using exporter `JsonHash`, max 2048×2048, `allowTrim` on, rotation off, padding 2, `removeFileExtension`, and frame names equal to the relative path.
  - Outputs: `public/assets/atlases/map.png|json` (texture key `atlas.map`) and `public/assets/bg/map.png` (key `bg.map`).
  - The tool fails with no write when packing needs more than one page, when a page exceeds 2048 on either side, when any output file exceeds 8 MiB (8388608 bytes), or when a frame name breaks `<object>/<state>/<nn>`.
- **Check gate:** `validate:content` also runs the layout rules and the asset rules. Every message names the offending id or file. The rules:
  - `STATIONS` ids are exactly `GAME_IDS`, each once.
  - Each station has `hits[id]` (at least 3 points), `anchors[id]` and `anchors[id-stop]`.
  - Each `-stop` anchor and `kart-start` lie within 4 px of `paths.road`, which has at least 2 points.
  - Every slot listed in content has `slots[id]`. Each slot lies inside the interactive rect and outside every station polygon.
  - Every hit vertex lies inside the interactive rect. The interactive rect is `Tokens.safeRect` inset by `edgeDeadSide` (24) left and right, `edgeDeadTop` (32) at the top and `edgeDeadBottom` (40) at the bottom, which gives x∈[24,1000] and y∈[66,694].
  - Each hit polygon's minimum width (rotating-calipers on its hull) is at least `targetMin` (80).
  - The distance between every pair of station polygons is at least `stationGap` (40). Intersecting pairs report "not separated". `fishing`/`dino-puzzle` and `shadow-match`/`touch-talk` are named in the test.
  - Each `ATLASES` entry has its `.png` and `.json`. The JSON page size and the PNG IHDR size are at most 2048 on each side.
  - The atlas has frames `<stationId>/idle/00` for all 7 stations, plus `kart/idle/00`.
  - The `bg.map` IHDR is exactly 2048×1536.
  - Every file under `public/assets/` is at most 8 MiB.
- **Code layout:**
  - The layout geometry and rules are pure TypeScript in `tools/layout/`, used by both `render` and `validate:content`. Tokens are imported from `src/core/tokens.ts`, so that file and its imports switch to explicit `.ts` specifiers to load under Node type stripping.
  - `content/` gets only data and types: `stations.ts`, `assets.ts`, `layout-types.ts`, and `layouts.ts`, which does a JSON import for runtime use by Vite only. Tools read the JSON through `fs`.

**Never:**
- No hand-entered design-space coordinate anywhere. Builder constants are Blender world units derived from the reference.
- No Map scene, Boot loading, sprites or labels on screen (Story 1.5). No kart directions or driving (Story 1.7). No decoration catalogue (Story 2.2).
- No subdivision modifiers: the builder fails if any `SUBSURF` modifier is present. No network in tools or the app.
- No reading the `.working/` reference at build time; only the vendored copy is used.
- No writing files that contain backslashes through a shell heredoc. No git.

**Decisions (auto-run defaults):**
- **Source scene:** copy `_bmad-output/.../.working/be-hoc-choi-map-v2.blend` verbatim to `art/src/map-v2.blend`. Verified read-only: it has 363 objects, Kenney colormaps and the HDRI `meadow_2_1k` packed, EEVEE, camera `Camera` at (0.2,−15,15.6) with rot (0.768,0,0), lens 33 and 1600×1200 resolution, and collections per station.
  - `tools/render/blender/build_map.py` opens it and does the following:
    - prunes the Tiệm kem preview (`GameIce` collection, `CamGame2`, `HintRing`);
    - regroups objects into `sprite.<id>` per the station table below;
    - recolours creatures from `creature-*` (hex passed in by `build.ts` from `Tokens`, converted to linear): Shiba `creatureOrange` with a white face and belly kept; Triceratops `creatureGreen` (its Tìm bóng role); Stegosaurus `creaturePink`; long-neck `creatureBlue`; the three fish each a distinct `creature-*`;
    - creates the layout objects, with `hit.<id>` as the `bmesh` convex hull of the evaluated world vertices of the station's sprite and area objects;
    - sets the render to 2048×1536 and saves `art/map.blend`.

  Rebuilding the island procedurally was rejected: it is large work and risks drifting from the approved mockup.
- **Station table** (sprite objects; area-only objects stay in the plate but count toward the hit hull):

  | stationId | sprite group | area-only |
  |---|---|---|
  | ice-cream | `IceCream` collection | — |
  | pizza | `Pizza` collection | — |
  | race | `Race` + `RaceCars` collections | — |
  | fishing | fish, `A_Dock`, `A_Rod` | `Pond`, `PStone*` |
  | touch-talk | `Town` collection | — |
  | dino-puzzle | the 3 dinos | the fence next to them |
  | shadow-match | `Cave` collection | — |

  The kart (`Car` collection) becomes `sprite.kart`. The volcano and lava stay in the plate.
- **Rule fixes stay in the builder:** if a rule fails, `build_map.py` may leave edge pieces (flags, cones) in the plate or shift a station group by at most 0.6 m in XY. Each shift is a named constant with a comment.
- **Road and slots:** `path.road` comes from a `ROAD_CENTRE` table of world XY points read once off the `Road` mesh. Slots are two grass points per station, offset away from the road and the station hull.
- **Dead zones** are checked in design px. That is conservative because the ENVELOP scale is at least 1 on every supported iPad.
- **Intermediate outputs:** `app/.generated/render/map/` holds `bg.png`, `frames/<object>/<state>/<nn>.png`, `raw.json` and `preview.png`. `.generated/` is already gitignored. `preview.png` is the plate with the hit polygons, anchors, slots and road drawn on it, for the human alignment check.
- **Scripts:** `art:build`, `render`, `atlas` and `doctor`. `doctor` reports all three of Blender, ffmpeg and edge-tts and exits 1 if any is missing. `sharp` 0.35.5 is pinned for the preview and the bg re-encode.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy render | Blender 5.2.2, `art/map.blend` | `bg.png`, 8 frames, `map.layout.json`, `preview.png`; a second run gives a byte-identical layout | — |
| No Blender | `BLENDER_BIN` unset and not on PATH, or a bad path | exit 1 naming Blender and `BLENDER_BIN`; nothing written | message |
| Wrong version | Blender 4.x | exit 1 "needs Blender 5.2" | message |
| No blend / bad screen | `art/map.blend` missing, or screen `foo` | exit 1 "run npm run art:build -- map" / lists known screens | message |
| Blender fails | Python exception in the script | exit 1 with the stderr tail; outputs untouched | message |
| Bad object name | `hit.pizza.001`, `Hit.X`, duplicate id | render fails naming the object | no write |
| Out of frame | layout point behind the camera or outside the render | render fails naming the object | no write |
| Rule violation | polygon narrower than 80, outside the rect, gap under 40, missing hit/anchor/stop/slot | render and `npm run check` fail naming the id(s) | exit 1 |
| Station set | a `STATIONS` id not in `GAME_IDS`, or a GameId missing | check fails naming the id | exit 1 |
| Atlas caps | 2 pages, a page over 2048, or a file over 8 MiB | `atlas` fails, no write; check fails on files already present | exit 1 |
| Missing render | `atlas -- map` before `render` | exit 1 "run npm run render -- map" | message |

</intent-contract>

## Code Map

- `app/tools/shared/binaries.ts` (+ test) -- `resolveBinary`, `FFMPEG`, `EDGE_TTS`, `Env`, `Probe`. Add `BLENDER` and a `blenderVersion(bin)` parser.
- `app/tools/lint/validate-content.ts` (+ test) -- `run(publicDir)` and `main`. Extend `run` with layout and asset problems: read `src/content/generated/*.layout.json` with fs and scan `public/assets/**` sizes.
- `app/src/content/types.ts` -- `GAME_IDS`, `GameId`.
- `app/src/core/tokens.ts`, `safe-rect.ts`, `tokens.generated.ts` -- `Tokens.safeRect` `{0,34,1024,700}` and `Tokens.spacing.{hitPad,targetMin,stationGap,edgeDead*}`. `tokens.ts` imports change to `./x.ts`.
- `app/eslint.config.js` -- content may import `./generated/*.json` (relative imports within content are allowed).
- `app/vite.config.ts` -- Vitest includes `tools/**/*.test.ts`. Tests never spawn Blender; inject the runner and the probe.
- `art/src/map-v2.blend` (new, vendored) and `art/map.blend` (built) -- project root, not shipped.
- Consumers: Story 1.5 (Boot loads `ATLASES.map`/`BACKGROUNDS.map`, Map uses `hits`/`anchors`), Story 1.6 (`HotspotPolygon` takes `hits[id]`), Story 1.7 (`paths.road`, `-stop`, `kart-start`, `kart/idle/00`), Story 1.8 (adds `art/ice-cream.blend` with the same tools), Story 2.2 (`slots`).

## Tasks & Acceptance

**Execution:**
- `art/src/map-v2.blend` -- copy the reference verbatim.
- `app/tools/shared/binaries.ts` (+ test) -- `BLENDER` spec and `blenderVersion` parsing (`Blender 5.2.2 LTS` → `5.2.2`).
- `app/src/core/tokens.ts` -- switch to explicit `.ts` import specifiers.
- `app/src/content/layout-types.ts`, `stations.ts`, `assets.ts`, `layouts.ts`:
  - `ScreenLayout`/`Point` types.
  - `STATIONS: {id: GameId; slots: string[]}[]` for the 7 stations.
  - `ScreenId`, `ATLASES.map`, `BACKGROUNDS.map` (keys and paths).
  - The runtime JSON import.
- `app/tools/layout/geometry.ts` (+ test) -- `convexHull`, `padHull`, `minWidth`, `polygonDistance` (0 when intersecting), `pointInPolygon`, `distToPolyline`.
- `app/tools/layout/to-layout.ts` (+ test) -- raw.json → `ScreenLayout`: name grammar, duplicates, out-of-frame, ÷renderScale, hull + pad, rounding, sorted keys.
- `app/tools/layout/rules.ts` (+ test) -- `validateLayout(layout, {stations, gameIds, limits})` and `validateAssets(...)`. One test per rule and matrix row, plus a passing fixture.
- `app/tools/render/blender/build_map.py` -- the builder per the Decisions; fails on `SUBSURF`.
- `app/tools/render/blender/render_screen.py` -- generic: plate pass, one pass per `sprite.*` collection, and projection of layout objects (`world_to_camera_view`, every evaluated vertex for `hit`, the origin for `anchor`/`slot`, evaluated curve points for `path`) into raw.json in render px.
- `app/tools/render/build.ts` and `render.ts` (+ tests) -- the CLIs `art:build -- <screen>` and `render -- <screen>`: resolve and check the version first, build pure args, use a temp dir, run `toLayout` and `validateLayout` before the atomic move, and draw `preview.png` with sharp.
- `app/tools/atlas/pack.ts` (+ test) and `free-tex-packer-core.d.ts` -- the CLI `atlas -- <screen>` with pure `packOptions()` and `checkAtlas()`. The bg is re-encoded with sharp (PNG, compression 9).
- `app/tools/doctor/doctor.ts` -- reports all three tools.
- `app/tools/lint/validate-content.ts` (+ test) -- wire in the layout and asset rules; temp-dir tests for an oversized file and a missing frame.
- `src/content/generated/map.layout.json`, `public/assets/atlases/map.{png,json}`, `public/assets/bg/map.png` -- produce them by running `npm run art:build -- map && npm run render -- map && npm run atlas -- map` with the real Blender. Fix rule failures in `build_map.py`.
- `app/package.json`, `app/README.md`:
  - Pin `free-tex-packer-core` 0.3.9 and `sharp` 0.35.5, and add the scripts.
  - "Image pipeline" section: Blender 5.2.2 installed and on PATH or set via `BLENDER_BIN`; the commands; the naming contract; `assets/` and `art/` are not shipped.
  - Provenance and licence rows: Kenney car-kit, city-kit-commercial 2.1, city-kit-roads and food-kit (CC0, `License.txt`); Quaternius animals, cars, cutefish, dinosaurs and food (CC0, quaternius.com); Poly Haven HDRI meadow_2 (CC0).

**Acceptance Criteria:**
- Given Blender 5.2.2 via `BLENDER_BIN` and the built `art/map.blend`, when running `npm run render -- map` twice, then `src/content/generated/map.layout.json` holds the anchors, hits, `-stop` anchors, slots for all 7 stations, `kart-start` and `path.road`, and the second run leaves it byte-identical.
- Given `BLENDER_BIN=C:/nope`, when running `npm run render -- map`, then it exits 1 naming Blender and every existing output keeps its timestamp.
- Given the render, when running `npm run atlas -- map`, then `atlas.map` is one page of at most 2048² in JSON hash with frames `<id>/idle/00` and `kart/idle/00`, and `bg/map.png` is 2048×1536, each file at most 8 MiB.
- Given `preview.png`, when a human views it, then every hit polygon wraps its station with visible padding, and no polygon covers another station.
- Given a layout or content edit that breaks any check-gate rule, when running `npm run check`, then it fails and names the id. With the real generated files, it passes.
- Given a fresh Windows machine, when reading the README, then it lists the Blender prerequisite, the commands and the CC0 sources. `npm run doctor` reports Blender, ffmpeg and edge-tts together.

## Spec Change Log

- **2026-10-08: sharp is pinned to 0.35.4, not 0.35.5.** 0.35.5 was published on 2026-09-27, only 11 days ago, and the brief requires versions at least two weeks old. 0.35.4 (2026-08-26) has the same API. free-tex-packer-core 0.3.9 (2026-07-24) is pinned as specified.
- **2026-10-08: `toLayout` separates the hit polygons.** With the real camera, tall props reach into the station behind them on screen: the dino necks and fence against the jumping goldfish, and the town's buildings against the cave and the pizza sign. The padded hulls overlapped by up to about 90 px. The allowed 0.6 m shifts move them only about 25 px.
  - `toLayout` now takes `separate: { ids, gap }`, set to the 7 station ids and `stationGap` (40).
  - When two padded hulls are closer than the gap, both are clipped by parallel lines on either side of their best separating axis (`geometry.ts › separatePair`, `clipHalfPlane`).
  - The polygons stay convex and padded everywhere except along the shared cut.
  - Every rule still runs on the stored polygons, and all pass. Minimum widths are 114–192 px.
- **2026-10-08: the builder's rule fixes go beyond flags and cones.**
  - `KEEP_IN_PLATE` leaves these in the plate: the two outer race flags, the town's stop sign and traffic light, and the tall right-hand town building (`building-g`, right in front of the cave).
  - `STATION_SHIFT` moves three stations, each by at most 0.6 m: pizza (0, −0.6), dino-puzzle (0, +0.6) and shadow-match (+0.6, 0).
- **2026-10-08: `pack.ts` pre-trims the atlas frames.** free-tex-packer-core 0.3.9 checks the untrimmed image size against the page size before it trims ("Invalid size. Min: 2052x1540"), so it cannot pack full-frame 2048×1536 sprites directly.
  - `pack.ts` trims each frame to its alpha bounds with sharp and packs the trimmed frames.
  - `restoreTrim` then writes the full-frame offsets back: `trimmed: true`, `spriteSourceSize` within the 2048×1536 frame, and `sourceSize` 2048×1536. This is the same JSON the packer's own trim produces.
  - The packer options are unchanged; `allowTrim` stays on.
- **2026-10-08: the sprite passes use holdouts.** Station frames render plate objects as holdouts (collection prop `occlude = 1`). Plate objects in front of a station, such as trees, then cut the sprite, so the stacked layers match the plate. The kart (`occlude = 0`) renders alone because it moves.
- **2026-10-08: the rules report slots the builder cannot place.** Instead of failing, `build_map.py` prints a warning with rejection counts, so `render` and `check` name the missing `slot.<id>`. All 14 slots are placed today.
- **2026-10-08: `free-tex-packer-core.d.ts` is a local types module.** The package ships an `index.d.ts` that wraps `declare module` inside a module file, which does not type the import. `pack.ts` therefore loads the package with `createRequire` and uses the local types. `render_screen.py` also accepts `--images 0`, which projects the layout without rendering (for diagnosis).
- **2026-10-08 (review fix): moving sprites cast no shadow into the plate.** Sprite collections with `occlude = 0` (the kart) get `visible_shadow = False` during the plate pass. Otherwise `bg.map` keeps a ghost kart shadow on the road at `kart-start`. This departs from "sprites still cast their shadows", which now holds for the static station sprites only. Sprite passes also hide or hold out plate *geometry* only, so the `Sun` light stays on and lights the kart frame.

## Review Triage Log

## Design Notes

**Why full-frame sprites:** each station frame is trimmed by the packer, but the JSON hash keeps `sourceSize` 2048×1536 and `spriteSourceSize`. Story 1.5 can therefore place a station with its pivot on its anchor, without any per-sprite offsets:

```ts
const a = layout.anchors['ice-cream'];
scene.add.image(a.x, a.y, 'atlas.map', 'ice-cream/idle/00')
  .setScale(0.5).setOrigin(a.x / 1024, a.y / 768); // bounce scales around the ground pivot
```

**Why a hull in TypeScript:** Python only projects points in render px. Hulling, padding, scaling and every rule live in tested pure TS, shared by `render` (it refuses to publish a bad layout) and `check` (it catches hand edits).

## Verification

**Commands:**
- `cd app && npm run doctor` -- expected: Blender 5.2.2, ffmpeg and edge-tts found; exit 0.
- `cd app && npm run art:build -- map && npm run render -- map && npm run atlas -- map` -- expected: exit 0 with the outputs above. Re-running `render` and comparing with `cmp` shows an identical layout.
- `cd app && BLENDER_BIN=C:/nope npm run render -- map` -- expected: exit 1 naming Blender; nothing changes.
- `cd app && npm run check` -- expected: exit 0; `validate:content` reports the layout and asset counts.

**Manual checks:**
- `app/.generated/render/map/preview.png` matches the approved mockup's look (bright pastel, soft shadows, static volcano) and its polygons fit the stations.
- Placing `atlas.map` frames over `bg.map` at scale 0.5 shows no seams or offsets.

## Auto Run Result

**Status:** in-review. `cd app && npm run check` exits 0: 23 test files, 291 tests. `validate:content` reports "7 game ids, 2 audio ids, 1 voice lines, 1 layout(s) with 7 stations, 1 atlas(es), 9 asset files".

**Summary:**
- Blender 5.2 is resolved and its version checked (`BLENDER`, `resolveBlender`).
- `art:build -- map` builds `art/map.blend` from the vendored `art/src/map-v2.blend`. It prunes the GameIce preview, makes 8 `sprite.*` groups and recolours the creatures from Tokens. It adds 7 hits, 15 anchors, 14 slots and `path.road` in a hidden `layout` collection.
- `render -- map` renders the 2048×1536 plate and 8 full-frame sprites, then projects the layout. Pure TS converts and validates it, draws `preview.png` and publishes the outputs atomically.
- `atlas -- map` packs the sprites into one 1689×598 page and re-encodes the bg.
- `validate:content` runs the layout and asset rules, and `npm run doctor` reports all three tools.

**Files changed:**
- `art/src/map-v2.blend`: vendored reference scene (verbatim copy).
- `art/map.blend`: built scene (binary, not shipped).
- `app/package.json` and `package-lock.json`: free-tex-packer-core 0.3.9 and sharp 0.35.4; the `art:build`, `render`, `atlas` and `doctor` scripts.
- `app/README.md`: Blender prerequisite, commands, *Image pipeline* section, naming contract and CC0 provenance rows.
- `app/src/core/tokens.ts`: explicit `.ts` import specifiers.
- `app/src/content/layout-types.ts`, `stations.ts`, `assets.ts`, `layouts.ts`: layout types, `STATIONS`, `ATLASES`/`BACKGROUNDS`/`FRAME_NAME`, and the runtime JSON import.
- `app/src/content/generated/map.layout.json`: the generated layout (deterministic).
- `app/public/assets/atlases/map.png`, `map.json` and `app/public/assets/bg/map.png`: the generated images.
- `app/tools/shared/binaries.ts` (+ test): `BLENDER`, `pathName`, `blenderVersion`, `checkBlenderVersion`, `resolveBlender`.
- `app/tools/layout/geometry.ts`, `to-layout.ts`, `rules.ts` (+ tests): geometry, raw → layout conversion, and the layout and asset rules.
- `app/tools/render/blender.ts`, `build.ts`, `render.ts` (+ `render.test.ts`): the CLIs and the shared Blender runner.
- `app/tools/render/blender/build_map.py`, `render_screen.py`: the Blender scripts.
- `app/tools/atlas/pack.ts` (+ test) and `free-tex-packer-core.d.ts`: the atlas CLI.
- `app/tools/doctor/doctor.ts` (+ test): the tool report.
- `app/tools/lint/validate-content.ts` (+ test): the layout and asset rules wired in.

**Verification:**
- `npm run doctor` (with the toml env paths) found Blender 5.2.2 LTS, ffmpeg and edge-tts, and exited 0.
- `npm run art:build -- map && npm run render -- map && npm run atlas -- map` exited 0.
  - A second `render` produced a byte-identical `map.layout.json` (`cmp`).
  - The atlas is one page, 1689×598 and 436 KB, with frames `<id>/idle/00` for the 7 stations plus `kart/idle/00`.
  - `bg/map.png` is 2048×1536 and 2.5 MB.
- `BLENDER_BIN=C:/nope npm run render -- map` exited 1 with `Blender not found: BLENDER_BIN="C:/nope" does not run…`. The layout file's timestamp did not change.
- `npm run check` exited 0.

**Review fixes (2026-10-08):**
- `render_screen.py`: `plate_objs` now holds geometry only, with no LIGHT, CAMERA or LIGHT_PROBE objects, so the kart frame keeps the Sun. Moving sprites (`occlude = 0`) have `visible_shadow = False` in the plate pass.
- `validate-content.ts`: a layout that is not an object, or that lacks `anchors`, `hits`, `slots` or `paths`, is reported (`layout "map": missing "paths"`) instead of throwing. A test was added.
- `render.ts`: `replaceDir` moves the old render dir to `<dir>.old` and restores it if the move-in fails. The `.layout.json.tmp` is removed in `finally`. A test was added.
- Re-ran `render -- map` and `atlas -- map` (`art:build` was not needed). The layout is byte-identical to the previous one. A crop of `bg.map` at kart-start shows no ghost shadow, and the kart frame shows directional shading. `npm run check` exits 0 with 291 tests.

**Residual risks:**
- Hit polygons are clipped where stations overlap on screen: dino-puzzle/fishing, touch-talk/shadow-match/pizza, fishing/ice-cream and race/touch-talk. Parts of tall props, such as the long-neck's head and the top of the town, sit outside their tap area or close to a cut edge. A human needs to judge this on the preview.
- `building-g` now stays in the plate, but it sits inside the shadow-match polygon, so tapping it opens Tìm bóng.
- The station shifts move the dino fence partly onto the sand, and the cave no longer sits exactly at the end of the road.
- The reference scene sets the ice-cream cone sign (`A_IceSign`) to hide_render, so the truck shows no cone, unlike the approved mockup render.
- EEVEE renders take about 2.5 min. The layout is deterministic, but the PNG bytes vary slightly between renders.

**Manual checks still due:**
- View `app/.generated/render/map/preview.png`: the polygons should fit the stations with visible padding, and no polygon should cover another station's main body. Compare its look with the approved mockup.
- In Story 1.5, overlay the `atlas.map` frames on `bg.map` at scale 0.5 and check for seams. A composite made during this run lined up.
