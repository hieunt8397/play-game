---
title: 'Tiệm kem – kem luôn nằm trên mặt bàn, tháp 5 viên, kem và ốc quế kiểu tròn mềm'
type: 'bugfix'
created: '2026-10-21'
status: 'done'
route: 'dispatch'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Resting scoops can lie on the counter's pink front face, and toppled tower scoops fall down onto it. The rest area is `hit.counter`, whose polygon (y≈471–742) covers the whole cake-counter, while the white table top is only a thin strip around the home row (y≈495–560). An 8-scoop tower also leaves too little room on the table. The scoop and cone art are faceted Kenney models that do not match the 2026-10-16 soft chibi style (Shiba).

**Approach:**
- **The table row:** scoops that are not served rest only on the table row: y = the home slots' y, with x inside the table top's x range.
- **Rest drops:** a drop that resolves to `rest`, or to `off` inside the play rect, falls onto the row at the drop's x. It is nudged sideways to the nearest clear spot (≥ minSize from every scoop), then a short drop and bounce.
- **Topple:** toppled scoops land on row spots the same way.
- **Tower:** `ui.iceCreamTowerMax` goes 8 → 5, so 4 homes + 5 toppled fit the row.
- **Art:** the scoops (4 flavours with their toppings) and the cone are rebuilt procedurally in `build_ice_cream.py`, in the soft toy style.

## Boundaries & Constraints

**Always:**
- Drop resolution order and serve zones are unchanged: cone, Shiba, own spot = home, `hit.counter-upper` = serve. Only the `rest` and `off`-inside-play-rect outcomes change: they fall onto the row.
- Off the play rect: as today, `returnLater` back to the pre-lift spot.
- Row bounds come from the layout. Use a new `hit.counter-top` polygon (the white top face, projected by the builder); the row's x range is its bbox shrunk by minSize/2. Row y = the home slots' y. Nothing is hand-entered.
- Placement is pure, in `round.ts`, and tested: the nearest clear x on the row. If the row is full (it cannot be with 4 homes + 5), the scoop floats back to its pre-lift spot.
- No scoop ever rests below the row: no resting position has y > row y, on any path (rest, topple, respawn nudge).
- Art keeps the frame names (`scoop-<flavour>/idle/00`, the cone in the plate) and the projected scoop size (`SCOOP_WIDTH_MARGIN`). It also keeps each flavour readable at a glance: strawberry pink with a strawberry, chocolate brown with chips, vanilla cream, mint green with leaves. The style is a smooth rounded scoop with a wavy melted rim, glossy, with no subdivision modifiers (cute.py `soften`). The cone is smooth with a light waffle pattern. Rebuild, render and atlas so each page is ≤ 2048².
- Every new number goes in Tokens/Timing (fall bounce, if any).

**Never:**
- No change to the questions, hints, Shiba reactions, nose cream or the 5.8 lifecycle.
- Do not move the home slots, the cone anchor or Shiba (the layout may shift a few px from the new cone geometry; the cone slots follow the cone).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Drop on the pink front | `rest` outcome at (x, y > row) | `rest` at (x', rowY), x' nearest clear x on the row | Row full → floatBack |
| Drop in the air above the table | `off` inside the play rect | `rest` at (x', rowY) | — |
| Drop off the play rect | `off` outside | `returnLater` as today | — |
| Topple, 5 scoops | free play, tower reaches 5 | `topple` spots all on the row, ≥ minSize apart and from the homes | Row full → that scoop's spot = floatBack target (never below the row) |
| Respawn nudge | a scoop rests on the home | the occupant is nudged along the row | — |

</frozen-after-approval>

## Code Map

- `app/src/games/ice-cream/round.ts` -- `RoundGeometry` (add `row(): {y, x0, x1}`), `drop` `rest`/`off` cases, `rest()`, `topple()`, `respawnHome` nudge. Replace the 2-D `nudgeApart` use with a pure 1-D row placer (nearest clear x).
- `app/src/games/ice-cream/IceCream.ts:162-188` -- `geometry()`: build `row` from `hit.counter-top` (bbox x shrunk by minSize/2) and the home slots' y. Optional fall tween for `rest` from above or below the row.
- `app/src/content/games/ice-cream.ts` -- `HITS.counterTop` in `screen.hits`.
- `app/tools/render/blender/build_ice_cream.py` -- `import_scoop` (:345, Kenney `ice-cream-scoop-mint.glb`), `add_chips` / `add_strawberry` / `add_leaves`, the cone import (:529, `ice-cream-cne.glb`). Replace them with procedural soft meshes (cute.py `_part`/`soften` style). Add `hit.counter-top` (the counter top face's visible hull, like `hit.counter-upper` at `counter_upper_points`).
- `app/src/core/tokens.ts` -- `iceCreamTowerMax` 8 → 5.
- `app/src/games/ice-cream/round.test.ts` -- fixture `GEO` gets a `row`. Rest, topple and respawn tests assert y === rowY and spacing ≥ minSize.
- `tools/layout/rules.test.ts` fixture -- add the new hit.

## Tasks & Acceptance

**Execution:**
- [x] `build_ice_cream.py` (+cute.py helpers if shared) -- soft scoops, toppings and cone; `hit.counter-top`; then `npm run art:build ice-cream && npm run render ice-cream && npm run atlas` (BLENDER_BIN="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe") -- art and layout.
- [x] `content/games/ice-cream.ts`, `tokens.ts` -- hit id; tower 5 -- contract.
- [x] `round.ts` (+test) -- row geometry, 1-D placer, rest/off/topple/respawn on the row; tests for every matrix row -- the fix.
- [x] `IceCream.ts` -- `row` geometry; the rest move reads as a fall onto the table -- scene.

**Acceptance Criteria:**
- Given any play or free-play session, then no scoop ever rests on the pink front face or below the table.
- Given the rebuilt atlas, then the scoops and cone read as soft, rounded toys in the same style as Shiba, with every flavour still recognisable.
- Given `npm run check`, then it exits 0.

## Implementation Notes

- `round.ts`: `RoundGeometry.restRect` replaced by `row(): TableRow`; pure `placeOnRow` (nearest clear x, undefined = full → floatBack) and `packRow` (left-packed spots, max capacity). Topple takes the packed spots nearest the cone x (greedy nearest-x could strand the 5th scoop when homes sit a few px off the 180 px grid); beyond capacity a scoop lands at the cone x on the row (overlap, never below).
- Row from the real layout: hit.counter-top x 78.1–945.9 → row x 123.1–900.9, y = slot.scoop-2 y + scoop offset. Capacity with four homes is exactly 5 (gaps 180/360/180) — it relies on the rows being exactly rowGap apart.
- `IceCream.ts` `restOnRow`: Quad.easeIn fall over Timing.iceCreamRestFallMs + ui.iceCreamRestBouncePx bounce (none under reduced motion); a nudge along the row just slides.
- New colours in Tokens.art.flavourDetail (berry, berrySeed, berryLeaf, mintLeaf, cone, coneLine), passed to the builder as params.art.flavourDetail. `CLEAR_EPSILON` exported from core/input/drop for the row placer (lint: no magic numbers in games/).
- Art: cone-1 moved 395.6 → 402.5 (new cone height); homes, cone anchor and Shiba unchanged. Atlas 2029×2043.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | Row ends let scoops hang over the trapezoid top's slanted edges | medium | patch | bbox x 123–901 vs a face ~117–907 at the home row, and a ~103 px scoop. The row now runs between the outer home centres (`tableRowFrom`), tested on the real layout (≥ towerMax spots). |
| 2 | Topple overflow overlaps at the cone x (matrix/AC: no overlaps) | medium | patch | `packRow` fewer spots → `rowSpot` fallback. Only the top scoops that fit fall now; the rest stay in the tower. Scattered-counter test. |
| 3 | Real row never tested (fixture ROW hand-written) | medium | patch | Grouped with #1; real-layout test added. |
| 4 | restOnRow: a drop from below rises with gravity easing plus an upward bounce; exact float compare; magic hop split | low | patch | Slides up from below; 1 px tolerance; hop share as a token. |
| 5 | Stale bounce closures run after a lift (tweenDone kept) | low | patch | lift() clears tweenDone. |
| 6 | packRow loops forever for minDist ≤ 0 or NaN | low | patch | Early return. |
| 7 | Outdated playRect doc / README attribution / unused `art.chip` | low | patch | Updated or removed. |
| 8 | Respawn nudge overlaps when the row is full | low | reject | With the bounded counter rule the row cannot fill while a home is free. The fix adds a branch. |
| 9 | tableRow fallbacks when both hits are missing / homeY from one slot | false | reject | tableRow is replaced by home-based `tableRowFrom`. |
| 10 | Unnamed literals in build_ice_cream.py; make_cone uses bpy.ops torus | low | reject | Builder style only; the output is verified by render. |
| 11 | hit.shiba re-hulled | low | reject | A ~13 px top shift of the serve zone from the new cone occlusion; serve drops on Shiba's body are unaffected. |
| 12 | Line-ending churn (round.test.ts, build.ts) | low | reject | No VCS; harmless. |
| 13 | restOnRow and other scene paths have no test | medium | defer | No Phaser scene harness (same as the 5.8/6.1 deferrals). |
| 14 | `hit.counter-top` is now emitted and required but unused by the scene | low | reject | Harmless layout data; it may serve later rules. |

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.

**Manual checks (if no CLI):**
- Render preview of the atlas: the scoops and cone are soft and rounded. In the game, drop scoops on the pink front and in the air: they land on the table. Build a tower of 5: it topples onto the table, with no overlaps.
