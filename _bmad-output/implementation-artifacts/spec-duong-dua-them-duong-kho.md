---
title: 'Đường đua: thêm hình đường khó hơn'
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

**Problem:** Đường đua has 12 roads in 4 levels (straight, curve, zigzag, loop, 3 each, 3–4 roads per round); the parent finds there are too few roads, they are too easy and the game gets boring fast.

**Approach:** Extend the difficulty ladder past the loop with new, longer and twistier road shapes, more roads per shape and more roads per round at the top, so a child who masters the loop keeps getting new challenges. Tracing stays forgiving (same band width and tolerance): harder means longer and twistier, never stricter.

Decisions (parent, 2026-10-22):
- Chosen: harder road shapes (this spec) and stars to collect along the road (separate next spec).
- Not chosen: narrower roads at high levels, new backdrops.

## Boundaries & Constraints

**Always:** Every new road passes the existing race layout rules (band inside the play rect and clear of HUD zones, min turn radius `raceMinTurnRadiusPx`, self-clearance `raceSelfClearArcPx` — the road never touches or crosses itself, point gap, gate at the end visible). Levels are only appended after `loop`, so a child's saved level keeps meaning the same shape. The difficulty step rule (`core/difficulty.ts` nextLevel) is unchanged. No change to the trace input, hint ladder or kart behaviour.

**Never:** Narrow the road or tighten trace tolerances; crossing roads (figure-8); new art or backdrops; touch other games.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Saved level ≤ loop | existing child | same roads as today until they level up | — |
| Level up past loop | all roads first-try at `loop` | next round uses the first new shape | — |
| Top level | at the last new level | rounds keep drawing from its roads (random, no immediate repeat as today) | — |
| Build | `npm run art:build -- race && npm run render -- race && npm run atlas -- race` | all new `path.<id>` in race.layout.json; rules pass | a shape that cannot fit → builder fails naming it; adjust params, never loosen a rule |

</frozen-after-approval>

## Code Map

All under `app/`.
- `src/content/games/race.ts` -- `RoadShape`, `ladder` (4 levels now). Append levels (proposed, in order): `wave` (2–3 sine periods across the screen), `hairpin` (out to the right, a U-turn, back left — gate near the start side), `snake` (serpentine over three rows, long), `spiral` (about 1¼ turns inward, ends in the middle). 3 roads each; `roads` per round 4, 4, 5, 5. Widen `roads` type to allow 5 where needed (already `3 | 4 | 5`).
- `tools/render/blender/build_race.py` -- `ROAD_SHAPES` (:~70), `road_points()` (:~479) and the shape generators (`shape_arc`, `shape_zigzag`, `shape_loop`); add generators for the new kinds (dense sample → `resample_xy`). Camera/plate unchanged; roads live on the open grass (world x ≈ −0.9…5.8, y ≈ −0.5…1.4 for today's roads — the new shapes may use the whole grass area the rules allow).
- `tools/layout/rules.ts` (~:1195–1330) -- race rules; `DENSE_SHAPES` (:~1283) lists shapes checked for point gap — add the new shapes. A loop-only rule (`loopMouthMax`) must not apply to new shapes.
- `src/games/race/questions.ts` (`roundRoads`), `round.ts` -- check they work for any ladder length / roads count (tests).
- Tests: `src/content/games/race.test.ts`, `src/games/race/round.test.ts`, `tools/layout/*race*` / `rules.test.ts` race cases; `src/core/difficulty*` unchanged.
- `src/content/voice-lines.ts` -- no new lines needed (prompt/retry are shape-agnostic).

## Tasks & Acceptance

**Execution:**
- [x] `race.ts` -- four new levels + shapes (+ tests: ladder order, path ids unique, roads per round).
- [x] `build_race.py` -- generators and 12 new roads; rebuild with `BLENDER_BIN="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"`; open the race plate with every new road overlaid (draw the layout paths onto a copy of the plate PNG with ffmpeg/node) and check each reads clearly and fits.
- [x] `rules.ts` (+tests) -- new shapes in the dense-shape checks.
- [x] `questions.ts`/`round.ts` tests for 5-road rounds and the longer ladder.

**Acceptance Criteria:**
- Given a child at the old top level who plays well, when the difficulty steps up, then new longer/twistier roads appear, up to 5 per round.
- Given `npm run check`, then it exits 0.

## Implementation Notes

- Ladder: wave (4 roads/round), hairpin (4), snake (5), spiral (5) appended after loop; ids `<shape>-1..3`.
- Builder: `wave` kind (sine, 2–2½ periods, amplitude capped so crests stay ≈ 56 px turn radius) and a generic `track` kind (turtle of line/arc moves) for hairpin, snake and spiral (stadium spiral: ½ + ½ + ¼ turn, ends mid-screen heading up so the gate stands on open grass).
- Road points now ignore the flat island flowers (`Flower*`) when finding the ground: a petal lifted the spiral top coil and broke the turn-radius rule. The 12 existing paths, anchors, plate and atlas came out byte-identical.
- Rules: the new shapes are in `DENSE_SHAPES`; `loopMouthMax` still applies to `loop` only.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind | race.test title "3 roads each" vs 4/4/5/5 roads per round | low | title wording | patch |
| 2 | blind | snake self-clearance test uses a 40 px arc (below the 50 px min), so it can pass on the wrong rule | low | read in test | patch |
| 3 | blind | DENSE_SHAPES duplicates the shape list | low | a missed shape disables the point-gap check silently | patch (test) |
| 4 | blind | snake-2 / spiral-2 start heading left; kart faces right until dragged | low | Race.ts beginRoad resets facing to 1 | patch |
| 5 | verif | tokens.ts racePathPointGapPx comment lists old shapes | low | comment | patch |
| 6 | blind, edge | new 5-road test lacks a "no two equal in a row" assert | false | round.test.ts:160-176 asserts no immediate repeat over 200 seeds for every level, new ones included | reject |
| 7 | blind | hairpin-2 and snake-1 open with the same straight | low | cosmetic; different levels | reject |
| 8 | blind, edge | gate at a spiral's end may touch the outer coil; no rule for gate vs band | low | measured overlap ≤ 10 px on spiral-3; gate draws above the road | reject (noted to parent) |
| 9 | blind | other code may depend on 4 levels / top level | false | difficulty clamps by ladder length; no UI keys on the top level; tests cover loop → wave and the top | reject |
| 10 | blind | "band width and tolerance unchanged" not pinned | low | tokens untouched in the diff | reject |
| 11 | blind | flower ground-ignore also affects the old roads | false | the 12 old paths, anchors, plate and atlas came out byte-identical | reject |
| 12 | blind, edge | 'Flower' prefix could match a solid object | low | no such object in the source scene | reject |
| 13 | edge | malformed track tuple / degenerate wave give a traceback instead of a named fail | low | build-time only, hand-written tables | reject |
| 14 | edge | ground probe exhausted after 8 ignored hits | low | not reachable with today's scene | reject |
| 15 | edge | "more roads per shape" claim vs 3 path ids each | false | the approved Code Map says 3 roads per new shape; variety comes from 4 new shapes | reject |

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.

**Manual checks:**
- Overlay image of the 12 new roads on the race plate: no road touches itself, none runs under the HUD, gates visible.
