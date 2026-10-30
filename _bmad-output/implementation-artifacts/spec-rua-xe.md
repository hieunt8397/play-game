---
title: 'Trò mới: Rửa xe'
type: 'feature'
created: '2026-10-30'
status: 'done'
route: 'dispatch'
baseline_commit: 'db558f4e11e77b43382c3074dc76e0d202545b53'
review_loop_iteration: 0
context: ['spec-trong-cay.md', '../planning-artifacts/prds/prd-be-hoc-choi-2026-10-08/research-hap-dan-tre-3-tuoi.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Xoài loves cars, but the only car game is a race. The research found that washing a car with foam and water (Sago Mini) is a calm "make it clean" game that holds a 3-year-old, and rubbing is an easy motion at that age. The parent chose this game on 2026-10-30.

**Approach:** Add a new yard game, `car-wash` (Rửa xe), played freely: there are no rounds and no right or wrong.
1. A dirty special vehicle drives in and honks. Its dirt is mud, leaves, ice-cream drips or dust.
2. Xoài rubs a finger over the car. Foam bubbles appear where she rubs, and the dirt under the foam goes away.
3. When enough of the car is foamed, the hose bounces. She taps it, water sprays, and the foam rinses off.
4. The car shines with gentle sparkles that never flash. It honks happily, bounces, and drives out, and the next car drives in.

Each car brings one random small surprise.

Decisions (parent, 2026-10-30):
- **Entry point:** a new 7th yard corner, `car-wash` "Rửa xe", in Nhà Xoài. The yard is re-laid out (for example 4 + 3 corners, each a little smaller) and re-rendered.
- **Vehicles:** special vehicles from Kenney Car Kit (CC0): xe cứu hỏa, xe cảnh sát, xe cứu thương, taxi, xe rác, máy cày (≥ 5). Each has its own honk or siren, and its name is said on arrival.
- **No driver:** the car reacts by itself. It honks, wiggles when foamed (as if tickled), bounces, and blinks its headlights when clean.

## Boundaries & Constraints

**Always:**
- **Free play** (`startFreePlay`, like the garden). A pure cycle model in `games/car-wash/` with tests. A half-washed car resumes through `SnapshotPartials['car-wash']` and the `round:leave` snapshot (the garden path). An invalid partial falls back to a fresh car.
- **Rubbing**
  - Any press-and-move over the car's hull adds foam at the finger, from a fixed pool of foam sprites.
  - A plain tap on the car adds one puff of foam.
  - Lifting the finger mid-rub keeps the foam already made.
  - The car counts as foamed once a `Tokens` share of its dirt spots (≥ 6 per car, at fixed anchors) is covered.
  - No drag is required anywhere.
- **Rinse:** tapping the hose before the car is foamed only nudges it. A rinse runs at most 1.5 s, and taps are ignored while it runs.
- **Sizes and placement**
  - The hose is drawn ≥ 90 px, with a hit area ≥ 80 px.
  - The car's hull is ≥ 300 px wide.
  - Everything sits inside the interactive rect, clear of the HUD and the bottom edge.
  - A `validateCarWash` rule checks these limits.
- **Idle hint:** after `Tokens` seconds idle, the car (or the hose, once the car is foamed) bounces and the short line plays.
- **Vehicles:** a shuffle bag of the vehicles, never the same twice in a row. Each dirt kind is a frame overlay per car.
- **Calm pacing:** one prominent motion at a time. A drive-in or drive-out longer than 1.5 s can be skipped with a tap. `prefers-reduced-motion` is respected. The sparkle is a soft twinkle and never a flash (no full-screen or > 3 Hz flashes).
- **Voice lines:** a prompt that names Xoài, "rub", "rinse", each vehicle's name, and a parent invite at most once a visit. Short lines with no praise, made with ElevenLabs Thắm via `npm run tts`.
- **Sounds:** new sounds are ≤ 0.8 s and high-passed at 150 Hz. Reuse the scrub, splash and pop sounds where they fit. `audio:check` passes.
- **Art**
  - Cute-toy style: Kenney car-kit models with soft materials and smooth shading, on a car-wash bay plate.
  - Credit Kenney in the README and `public/CREDITS.txt`.
  - Back up every edited file to `_backup/2026-10-30-rua-xe/`.
- **Home** returns to the yard.

**Never:**
- A score, a timer, a fail sound, red feedback, or the word "sai".
- Changing the race game or its art, or `cute.py` `chibi()`/`key_chibi()`.
- Shiba or any other character in the car.

</frozen-after-approval>

## Code Map

All under `app/`. Art commands run from `app/` with `BLENDER_BIN="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"`; Blender is not on PATH and peaks around 2.5 GB:
- `npm run art:build -- <screen>`
- `npm run render -- <screen>`
- `npm run atlas -- <screen>`

**The template is the garden game.** Mirror every file it touched for its id, content, registry, assets, layouts, catalog, voice lines, parent invite, tokens and timing, rule wiring (render, pack, validate-content), audio maker and tests. See `spec-trong-cay.md` Code Map and Implementation Notes, and the `src/games/garden/` code.

**New files:**
- `src/content/games/car-wash.ts`: vehicles, dirt kinds, `REACTIONS`, lines, frames, anchors.
- `src/games/car-wash/{cycle.ts, CarWash.ts, cycle.test.ts, CarWash.test.ts}`.
- `tools/render/blender/build_car_wash.py`.
- `tools/audio/make-car-wash.ts` (+ test).
- `tools/layout/car-wash-rules.test.ts`.

**Rub input.** No rub helper exists yet:
- Build a target on `GuardTarget` (`src/core/input/guard.ts` L48–63: `onPress`, `onMove`, `onEnd`, `onCancel`, fed by `POINTER_MOVE` in `tap-router.ts` L84, L125).
- Give it a polygon `contains` on `hit.car`.
- Use `drag-controller.ts` and `trace-path.ts` as examples of continuous moves.
- Keep it local to the game unless it is clearly reusable.

**Particles.** These are tweened Image frames, not emitters:
- garden `centred()`/`drops()`;
- pet-clinic `drops()`;
- bedtime `bubbles()` for the foam.

**Sounds to reuse:**
- `sfx.touch-talk.toothbrush` (scrub), `sfx.touch-talk.soap` (bubble pop);
- `sfx.pet-clinic.splash` or `sfx.garden.pour` (rinse);
- `sfx.race.horn`, `sfx.touch-talk.police-car`, `sfx.touch-talk.car`.

New: a mud squish, a sparkle chime and per-vehicle honks if needed.

**Car models.**
- Source: `assets/kenney/kenney_car-kit/Models/GLB format/` (firetruck, police, ambulance, taxi, garbage-truck, tractor, plus the separate wheel-*.glb files).
- `build_race.py` L38 already imports a Kenney model (cone.glb). Follow it.

**Yard entry, with a re-layout:**
- `tools/render/blender/build_home.py` `CORNER_BOXES` (L77–84, a full 3×2 grid now; the wardrobe must stay left of x 900), `CORNER_YAW` and `build_corner`; then re-render home.
- `src/content/home.ts` `CORNER_IDS`/`YARD_CORNERS` (L16–34).
- `validateHome` (rules.ts ~L1697), `home.test.ts`, `home-yard.test.ts`, `yard-flow.test.ts`.
- The `vo.shell.corner-name.car-wash` line.

## Tasks & Acceptance

**Execution:**
- [x] Back up the files to be edited to `_backup/2026-10-30-rua-xe/`.
- [x] Ids, content, the pure cycle model and its tests. Cover:
  - drive-in and drive-out with a skip;
  - foaming coverage by tap and by rub, and a lift mid-rub;
  - the hose before and after the car is foamed;
  - the rinse and shine, then the next car;
  - the vehicle bag and the surprise bag;
  - resume.
- [x] `build_car_wash.py`: the wash-bay plate, ≥ 5 vehicles (each clean, plus dirt overlays), the hose, foam, drops, sparkle and surprise frames. Then render and atlas, and iterate on composites.
- [x] Re-lay out the yard to 7 corners with a car-wash corner prop, re-render home, and wire `home.ts`, `validateHome`, the tests and the corner-name line.
- [x] Sounds and voice lines (`npm run tts`).
- [x] The `CarWash.ts` scene with the rub target, the registry entry, and scene tests: opening, Home mid-wash then resume, and a full cycle.
- [x] README provenance and `public/CREDITS.txt` (Kenney).

**Acceptance Criteria:**
- Given the yard, when Xoài taps the "Rửa xe" corner, then a dirty special vehicle drives in, honks, and the voice names it and invites her to rub.
- Given a dirty car, when she rubs or taps on it, then foam appears where she touches and the car wiggles. Once the car is foamed, the hose invites a tap.
- Given a foamed car, when she taps the hose, then water rinses the foam and dirt away, the car twinkles and honks, drives off, and a different vehicle drives in.
- Given `npm run check` and `npm run audio:check`, then both exit 0.

## Design Notes

These are the agent's choices; the parent would not notice them.
- Surprises: a rubber duck pops out of the foam; the car sneezes a bubble; a puddle splash makes a rainbow; the fire truck's ladder or the police light spins.
- Foam coverage is counted per dirt anchor, so the count is stable and testable. Foam sprites are pooled, and their total is capped.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run audio:check` -- expected: OK.

**Manual checks:**
- Composites of each vehicle (dirty, foamed, clean), the re-laid yard and the surprises are shown to the parent before commit.

## Implementation Notes

2026-10-30 (dev). Before each edit, the file was copied to `_backup/2026-10-30-rua-xe/` at the same relative path.

**Ids and content.** `car-wash` is added to `YARD_GAME_IDS`, `SnapshotPartials['car-wash'] = { vehicle, dirt, covered, surprise }`, `LINT_GAME_IDS`, `SCREEN_IDS`, `ATLAS_MAX_PAGES` (4; it packs into 3), `ATLASES` / `BACKGROUNDS`, `layouts.ts`, `PARENT_INVITE_LINES`, the audio catalog and the registry.
- `content/games/car-wash.ts` holds the six vehicles (each with its name line and its own honk or siren), the four dirt kinds, `DIRT_SPOTS` = 6, the surprises (duck, bubble, rainbow), the line ids, the frames, anchors and hits, `neededSpots`, `BAG_SEEDS` and `MOTION` (the lint forbids bare numbers in games/).
- Tokens: `ui.carWash*` (sizes, the foam share 0.66 → 4 of 6 spots, cover radius 48 px, rub step 26 px, a pool of 40 puffs), `Timing.carWash*` (drive-in 1.8 s skippable, drive-out 1.3 s, rinse 1.4 s, shine 1.8 s, idle hint 8 s, skip threshold 1.5 s) and `art.carWash`.

**Cycle model** (`games/car-wash/cycle.ts`, pure, 11 tests): drive → dirty → foamed → wash. A press or a rub stroke puts a puff at the finger (one per 26 px while rubbing; a lift keeps everything); every spot within 48 px of a puff is covered; the car wiggles at most once per 420 ms. Any tap during a drive longer than 1.5 s jumps the clock to its end. The hose before foamed only nudges; on a foamed car the hose tap already moves the state to the next car (Home during the wash keeps nothing), then rinse → (rainbow) → shine with a happy honk → drive-out → the next car. Surprises: the bubble sneeze at half the needed spots, the duck when foamed, the rainbow after the rinse. Bags (static on the scene: vehicles, dirt, surprises) never repeat; a resumed car is `note`d so the next car differs. `resumeCarWash` refuses an untouched or invalid partial.

**Scene** (`games/car-wash/CarWash.ts`; `CarWash.test.ts`, 8 tests with Phaser stubbed). The car is a container on `anchor.car` (a soft shadow, the car frame, six dirt overlays re-pointed per car and dirt, the foam pool, the sparkles). The rub target is a plain router target with `onPress`/`onMove`/`onEnd`/`onCancel` (kept local to the game); it contains the car's hull plus `ui.carWashRubPadPx`, and foams only on the hull. The hose is a tap circle around its trimmed centre. Reduced motion shrinks every move (the drives fade).

**Art** (`build_car_wash.py`): an orthographic camera pitched 20°; the bay plate; the six Kenney car-kit models joined, merged, bevelled 3 segments, smooth shaded, rougher; turned 64° to face screen right; each 360–450 px wide on the same rest spot (520, 616). The `lights` state scales in two emissive headlight discs with halos. Dirt spots: a 3 × 2 grid over each car's drawn rect, ray-cast onto the body; each spot of each kind is its own state frame, rendered with the car as a holdout. The arch and brushes cast no shadow on the wall (soft floor shadows instead).

**Yard corner** (`build_home.py`): the front row now holds four corners — clinic (50–222), garden (296–500), bed (574–740), car-wash (814–972) — each a little smaller; the car-wash prop is a pink arch with a bubble sign and a roller brush over the Kenney taxi with foam. Home was re-rendered and its atlas rebuilt. `vo.shell.corner-name.car-wash` "Rửa xe".

**Sounds** (`tools/audio/make-car-wash.ts`, hooked into `make-placeholders`; `make-car-wash.test.ts`): squish 0.35 s, chime 0.8 s, fire siren 0.8 s, ambulance siren 0.8 s, low honk 0.5 s; 50 ms cubic fade-in, two 150 Hz highpasses, peaks −20.3…−24.1 dBFS; none is a creature. Reused: the toothbrush scrub, the soap pop, the pet-clinic splash, the touch-talk police siren and car horn, the race horn (tractor).

**Voice** (`npm run tts`, ElevenLabs Thắm, not yet approved): prompt "Xoài ơi, | mình rửa xe nào!", rub "Xoa xà phòng cho xe nhé!", rinse "Xịt nước cho xe nhé!", the six names ("Xe cứu hỏa!", "Xe cảnh sát!", "Xe cứu thương!", "Xe taxi!", "Xe rác!", "Máy cày!"), parent "Mời bố mẹ | cùng rửa xe nhé!"; 0.8–2.6 s.

**Checks (2026-10-30).** `npm run check` exits 0 (2061 tests; validate:content: 14 game ids, 149 audio ids, 321 voice lines, 16 layouts). `npm run audio:check` OK (35 creature sounds).

**Deviation (Design Notes, agent's choice).** Three surprises (duck, bubble sneeze, rainbow); the fire-truck ladder / police light spin was not built (it needs separate moving parts per model).

**Deferred / for the parent.** Not played in a browser or on the iPad. Listen to the new lines and sounds. The Kenney models stay blocky under the bevel (the spec asked for them). Composites are in the session scratchpad `cw/final/`. In `build_car_wash.py` the duck's -60° turn has no effect (the glTF import leaves a quaternion rotation mode; the home builder sets XYZ for its taxi); the rendered duck faces its default way.

- The parent asked to commit and push (2026-10-30) without the step-04 multi-reviewer pass; `npm run check` passed (2061 tests) and `audio:check` OK.
