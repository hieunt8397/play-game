---
title: 'Nhà Xoài kiểu nhà búp bê: trong nhà và ngoài sân'
type: 'feature'
created: '2026-11-13'
status: 'done'
route: 'dispatch'
baseline_commit: 'd47b6c0'
review_loop_iteration: 0
context: ['spec-7-1-tram-nha-xoai-san-nha.md', 'spec-dao-moi-xe-ra-dao.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nhà Xoài's yard is a lawn with unrelated things scattered on it: a bed, a wardrobe and a giant first-aid kit
stand on the grass. The parent finds it cluttered and illogical ("phải sắp xếp lại làm sao cho thật logic"). On
2026-11-13 the parent chose the dollhouse with a yard.

**Approach:** One screen, two clear places a 3-year-old already knows:
- **Inside the house.** On the left is a dollhouse cut open so Xoài sees in.
  - Upstairs is **the bedroom**: the bed (Giờ đi ngủ) and the wardrobe (Thay đồ cho Shiba).
  - Downstairs is **the living room**: a toy drum kit and a little piano on a rug (Ban nhạc).
- **Outside in the yard,** on the right and in front:
  - **the animal pen** by the back fence (Ú òa chuồng thú);
  - **the vegetable garden** with its watering can (Trồng cây);
  - **Shiba's dog house** with a first-aid kit beside it, where Xoài looks after the pets (Bác sĩ thú cưng);
  - **the driveway with a garage**, the family car and a hose (Rửa xe).

Each game sits where it belongs in real life: sleep and dressing in the bedroom, music in the living room, plants and
animals outside, the car on the driveway.

## Boundaries & Constraints

**Always:**
- **The 7 games keep their scenes and gameplay.** Only the yard screen (`bg.home`, `atlas.home`, `home.layout.json`) and
  the corner list change.
- **Tap targets:** each of the 7 is one corner (sprite + hit hull).
  - Each is ≥ 150 px.
  - Each is ≥ `targetGap` from the next.
  - Each is off the Home/Speaker zones.
  - `validateHome` checks them.

  The two bedroom corners and the two living-room corners are the props themselves, not the room, so a tap on a
  wall does nothing. The two upstairs props sit far enough apart to pass the gap rule.
- **Readable at a glance:** the house is cut open with its front wall removed. Its roof, floor and inner walls make the
  two rooms clearly separate. Each prop faces the camera.
- **Labels and names:** the parent-facing labels and voice lines name the thing, not the game:
  - Giường ngủ, Tủ đồ, Ban nhạc, Chuồng thú, Vườn rau, Nhà Shiba, Rửa xe.

  Where a label changes (Sân khấu → Ban nhạc, Vườn → Vườn rau, Phòng khám → Nhà Shiba), its corner-name line is
  re-voiced (ElevenLabs Thắm).
- **Corners still bounce and speak** on a tap, and open their game as today (`yard:open`). The Speaker prompt and the
  yard's invite line are unchanged.
- **Art:** cute-toy style (`cute.py`; Tiny Treats Homely House pieces where they fit: walls, floor, windows, rug, roof).
  Back up every edited file to `_backup/2026-11-13-nha-bup-be/`.

**Never:**
- Changing any game's own scene, art or gameplay.
- A room or prop that is not tappable but looks like a game (no extra toys that look like they open something). The
  rest of the dressing stays clearly part of the background: a lamp, a picture on the wall, a window, a fence, flowers.
- Stairs or doors that suggest Xoài can walk somewhere else.

</frozen-after-approval>

## Code Map

All under `app/`.

**Art:** `tools/render/blender/build_home.py` is rebuilt:
- the dollhouse (cut-open walls, two floors, a roof);
- the rooms' dressing;
- the yard (fence, garden bed, pen, dog house, driveway, garage);
- `CORNER_BOXES` and `CORNER_YAW` for the 7 corners.

Props reuse today's corner models where they fit (bed, wardrobe, pen, garden, car wash). Add new ones for the drum kit
with piano and the dog house with kit.

Run `npm run art:build -- home`, `npm run render -- home` and `npm run atlas -- home`.

**Content:** `src/content/home.ts`: `CORNER_IDS` / `YARD_CORNERS` (7; the corner ids keep their names so the tests and
the save data stay valid); the labels.

**Voice:** `vo.shell.corner-name.stage|garden|clinic` re-voiced (`npm run tts`).

**Rules and tests:** `validateHome` (`tools/layout/rules.ts`), `home.test.ts`, `home-yard.test.ts`, `yard-flow.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] Back up.
- [x] `build_home.py`: the dollhouse and the yard. Show the parent a composite of the screen before wiring.
- [x] Render, atlas, `validateHome`.
- [x] `home.ts` labels, re-voiced lines, tests.
- [x] A browser run: tap each of the 7 corners, play a little, Home back to the yard.

**Acceptance Criteria:**
- Given the yard screen, then Xoài sees a house cut open with a bedroom upstairs (bed, wardrobe) and a living room
  downstairs (drums, piano), and outside a pen, a vegetable garden, Shiba's dog house with a first-aid kit, and a car
  on the driveway.
- Given a tap on any of the 7, then it bounces, says its name and opens its game. Home in the game comes back to this
  screen.
- Given a tap on a wall, the roof or the lawn, then nothing opens.
- Given `npm run check`, then it exits 0.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.

**Manual checks:**
- A composite for the parent; a browser run at 1024 × 768; the iPad.

## Implementation Notes

2026-11-13 (dev, built in a worktree on top of the uncommitted spec-dao-moi-xe-ra-dao work). Backup:
`_backup/2026-11-13-nha-bup-be/` (build_home.py, home.ts, the three tests, voice-lines.ts, tokens.ts, rules.ts,
render.test.ts, README.md, the home atlas, plate and layout, art/home.blend, the three corner-name lines, this spec).

**Workflow decisions (no human checkpoint available during this run).**
- The spec's status was `approved` (not a bmad-build status); it was treated as `ready-for-dev` and built from step 3.
- Implemented directly by the dispatched dev agent (no nested implementation subagent); the review layers ran as
  subagents.
- The "show the parent a composite before wiring" checkpoint could not wait: the composite is
  `_backup/2026-11-13-nha-bup-be/composite-yard.png` (plate + the 7 sprites), made before the content wiring; the
  wiring went ahead. Question for the parent: is this layout and look right?

**Layout (design px, `CORNER_BOXES`).**
- The dollhouse fills the left half (x 30…492): living room floor at y 670, the slab between the rooms 376…412,
  the bedroom up to the attic slab at 126, a pink gable to the top edge. Inside: `bed` (74…286 × 220…350) and
  `wardrobe` (358…464 × 150…350) on the bedroom floor; `stage` = the band, ONE corner (74…452 × 452…648).
- The yard on the right: `pen` by the back fence (556…842 × 98…262), `clinic` = Shiba's dog house (556…712 × 336…478),
  `garden` in front (556…712 × 552…668), `car-wash` = the family car on the driveway in front of the garage
  (784…970 × 356…556). Boxes are ≥ 72 px apart; the Speaker zone (x ≥ 900, y ≤ 257) holds only the garage roof
  (plate), the Home zone only the roof.
- Indoor props are placed on their floor (`CORNER_FLOOR`; `place_in_box(…, z0)`, the anchor at the floor height).
  The builder fails if an indoor prop leaves its room (walls, back wall, ceiling).

**Deviations / decisions.**
- The spec's Boundaries say "the two living-room corners"; there is only one living-room game (Ban nhạc), so the drum
  kit and the piano are one prop and one corner (`stage`), on a rug that is part of the plate. 7 corners total, as
  the Intent says.
- Camera changed from the old close wide-angle (30 mm at y −9) to a farther 58 mm lens (y −26, z 9.5): the dollhouse
  reads front-on (no extreme perspective into the rooms); the sky is now off-screen above the trees.
- Shadows: the house shell (slabs, walls, roof, floors, wallpaper) casts no shadow, so both rooms stay lit. Like
  every yard corner since Story 7.1, the corner sprites leave no shadow in the plate (`render_screen.py ›
  movable_of` defaults to 1 for a sprite group that is not a holdout); only the plate's own dressing does.
- The bed is turned −30° (a three-quarter view toward the camera, like the yard props), so it "faces the camera".
- Homely House has no wall, floor, window or roof modules (only the whole `house`, `floor_base`, fences, trees), so
  the cut-open house is script-built with `cute.py` shapes; the lamp and the rug are KayKit Furniture Bits.
- The family car is the Kenney `sedan.glb` (the car-wash game's own cars stay as they are); its corner keeps a hose
  reel spraying water and foam on the roof; the car-wash arch is gone (the garage and driveway say where it is).
- The garage door is closed (a roller door), the house has no stairs and no doors; the dressing (windows with
  curtains, picture frames, a standing lamp, a rug, fence, trees, flowers, tufts) is plate only.
- Shiba (chibi `dog`, the island Shiba) sits at its dog house; tapping it opens Bác sĩ thú cưng (one hull with the
  dog house and the first-aid kit).
- New `Tokens.art.home` colours for the house, piano, drums, dog house, garage and driveway; the hose, nozzle, water
  and foam reuse `art.carWash`.
- The home atlas now holds only the 7 corner frames (plane, train, rocket frames dropped by the re-render).

**Voice.** `vo.shell.corner-name.stage` "Ban nhạc", `.garden` "Vườn rau", `.clinic` "Nhà Shiba" re-voiced with
`npm run tts` (ElevenLabs; 3 written, the rest skipped as up to date). Not yet heard by the parent.

**Tests.** `home.test.ts`: the 7 labels; the rendered layout puts the bed and wardrobe hulls wholly above the band's
hull and every indoor hull left of every yard hull; taps on the roof, a wall, the slab between the rooms and three
lawn spots hit no corner. `render.test.ts` fixture: the new `art.home` colours. `home-yard.test.ts` and
`yard-flow.test.ts` use synthetic layouts and corner ids, which did not change: no edit needed.

**Checks (2026-11-13).** `npm run check` exits 0 (2197 tests passed, 2 skipped; validate:content runs validateHome
on the real layout and atlas); `npm run audio:check` OK. Browser run at 1024 × 768 (headless Chrome over CDP, Vite on
5202): island → Nhà Xoài → the yard; taps on the roof, the left wall, the slab and the lawn open nothing; each of the 7
corners bounces, opens its game (the garden and the car wash need ~10 s to load their multi-page atlases on the dev
server) and Home comes back to the yard (resume marks shown). Two taps placed within 24 px of a hull opened that corner,
as the hitPad intends. Not checked: the iPad.

**Open questions for the parent.** Is the composite's layout and look right (`_backup/2026-11-13-nha-bup-be/composite-yard.png`)?
The three re-voiced names (Ban nhạc, Vườn rau, Nhà Shiba) are not yet approved by ear. The cow in the pen is still
the realistic Quaternius cow of Story 7.1 (unchanged; it is large next to the chibi Shiba).

## Review Triage Log

Review loop 0: Blind Hunter, Edge Case Hunter and Verification Gap (the gap layer found no verification gaps).

| # | Source | Finding | Verdict | Evidence | Route |
|---|--------|---------|---------|----------|-------|
| 1 | VG, ECH, BH | `coll['movable'] = 1` for upstairs corners is a no-op; its comment says the other corners keep plate shadows | low | `render_screen.py:71-72` `movable_of` defaults to 1 for non-holdout groups; no home group is a holdout, so no corner ever casts a plate shadow | patch: lines removed, notes corrected |
| 2 | VG, BH | `build_doghouse` rebuilds `c` with the same `creatureLight` value | low | `build_corner` already puts `creatureLight` in `c` | patch: `c` passed directly |
| 3 | ECH, BH | the lawn scatter can fall short of TUFTS/FLOWERS with no warning | low | the loop stops after `count * 40` tries silently | patch: a WARNING print with the count |
| 4 | ECH, BH | the room-fit check ignores the dressing (lamp, curtains, frames) | low | the current band sits in front of the lamp (it is behind it in depth, drawn over it as expected); no clash in the render; a future clash would need a new guard | reject: no current harm; fix adds guards |
| 5 | ECH | the lamp and the rug are not checked against the room | false | the render shows both inside the living room; their sizes derive from the room | reject |
| 6 | BH | stale `art.home` doc comment (stage, vet box) | low | the comment named props that are gone | patch: comment rewritten |
| 7 | BH | `SHIBA_HEIGHT` comment says a 1.3 m dog house | low | body 1.0 m + roof rise 0.62 m | patch: comment fixed |
| 8 | BH | the bedroom props lose their contact shadows while the others keep theirs | false | no corner sprite has had a plate shadow since Story 7.1 (see #1); nothing changed for the bedroom | reject |
| 9 | BH | the driveway margin for tufts is only on its left edge | false | the driveway's right edge is off-screen (x 1100…1150), so no tuft can sit there | reject |
| 10 | BH | the dollhouse layout test compares anchors only | low | a hull crossing the slab would pass | patch: compares hull y-extents (upstairs max y < band min y) |
| 11 | BH | the AC "a tap on a wall, the roof or the lawn opens nothing" has no test | medium | only the browser run covered it | patch: `home.test.ts` hit-tests 6 empty points against the real hulls |
| 12 | BH | the bed turned −62° breaks "each prop faces the camera" | medium | a frozen boundary; the bed showed its side | patch: yaw −30° (three-quarter view), re-rendered, atlas, check |
| 13 | BH | Homely House pieces not used for walls/floor/windows/roof, undocumented | low | the pack has no such modules; the fix is a spec note | reject (fix edits this spec); the fact is recorded in the notes |
| 14 | BH | dressing colours reuse `knob`, `tom`, `roof` keys | low | recolouring a drum would recolour a picture heart; unlikely in use, fix adds token keys | reject |
| 15 | BH | `GARAGE_SIZE` keeps a `None` slot | low | only `[1]` and `[2]` are read | patch: `GARAGE_DEPTH`, `GARAGE_WALL_H` |
| 16 | BH | the garage is not hazed like the fence behind it | false | the garage stands in front of the fence (ground y 300 vs 214 px), in the mid-ground with the corners | reject |
| 17 | BH | PEP 8 blank lines (one before `fail`, three before `build_band`) | low | direct correction | patch |
| 18 | BH | the roof panel height formula is duplicated with an unexplained `+ 0.12` | low | direct correction | patch: `roof_mid_z` and `ROOF_LIFT` |

No intent_gap or bad_spec entries; nothing deferred. After the patches: art rebuilt, rendered and packed, `npm run
check` exit 0, the yard and the bed re-checked in the browser.
