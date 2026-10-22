---
title: 'Đường đua: cổng đích xoay theo hướng đường'
type: 'bugfix'
created: '2026-10-22'
status: 'done'
baseline_commit: 'NO_VCS'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The finish gate is one fixed sprite (an arch facing the camera, posts left and right) placed with its post-feet midpoint on the road's end point. Most roads arrive horizontally, so the road runs into the left post and stops between the posts lengthwise instead of passing through the arch; the parent sees the gate in the wrong place relative to the road (every road, old and new).

**Approach:** Render the gate at several yaw angles and, at runtime, show the frame whose crossing direction best matches the road's arrival direction, positioned so the road's end passes between the posts (the arch straddles the road near its end).

## Boundaries & Constraints

**Always:** The road visibly passes under the arch for all 24 roads; the gate stays inside the play rect and clear of HUD zones; the drop target and arrival logic (end point) unchanged; the kart still finishes under the arch. Depth rule (kart above the gate on the first half, below after) still reads right.

**Never:** Change road shapes, trace logic or difficulty; new art style for the gate.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Horizontal arrival | straight-1, wave, snake | arch seen side-on, posts above/below the road | — |
| Diagonal arrival | zigzag, curve | arch at the matching diagonal | — |
| Vertical arrival | spiral end heading up, loop lips | arch facing the camera (today's frame) | — |
| Missing frame | an angle frame missing from the atlas | fall back to the nearest available angle, warn once | — |

</frozen-after-approval>

## Code Map

All under `app/`.
- `tools/render/blender/build_race.py` -- `build_gate` / `GATE_*` (sprite `gate`, render states): key the gate root at N yaw states (e.g. 0°, 30°, 60°, 90°, 120°, 150° — the arch is symmetric, so 180° covers all) as `gate/<deg>/00` frames, each with its post-feet midpoint as the pivot; keep `gate/idle/00` = today's camera-facing angle or replace it consistently.
- `src/content/games/race.ts` -- `gateFrames` (+ angle list); `RACE_SCREEN.frames`.
- `src/games/race/Race.ts` (:237–246 `beginRoad` gate placement, :297 depth switch) -- pick the frame from the screen-space tangent of the last ~40 px of the road (projecting each rendered yaw to its on-screen crossing direction, computed once by the builder and exported, or measured from the frame), place it so the arch's centre sits on the road a little before the end point; pure helper in `src/games/race/questions.ts` (or a new `gate.ts`) with tests.
- `tools/layout/rules.ts` (`validateRace`, gate size rule `raceGateMinPx`) -- check the chosen gate rect per path stays in bounds/HUD-clear.
- Rebuild: `BLENDER_BIN="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" npm run art:build -- race && npm run render -- race && npm run atlas -- race`.
- Visual check: composite each of the 24 roads with its chosen gate on the plate (script pattern: `scratchpad/gate/draw.cjs` draws road bands + the gate crop with ffmpeg).

## Tasks & Acceptance

**Execution:**
- [x] builder angle states + render/atlas.
- [x] content frames; pure gate-choice helper + tests (horizontal/diagonal/vertical/missing frame).
- [x] Race.ts uses it; rules check per path.
- [x] composite all 24 roads and look at each.

**Acceptance Criteria:**
- Given any road, when it is shown, then the road passes between the gate's posts at its end.
- Given `npm run check`, then it exits 0.

## Implementation Notes

- Frames are `gate/<deg>/00` for 0/30/60/90/120/150 (`gate/idle/00` replaced; 0° is the old camera-facing pose and the size-rule frame). Builder keys the gate root's yaw at timeline frames 2–7 (before the kart's wave frames 10–13, whose arm would otherwise show), and exports `anchor.gate-cross-<deg>` / `anchor.gate-post-<deg>`.
- Render pose moved from the end of straight-1 (right edge, x≈880: posts leaned hard and 0°/150° were cut by the frame edge) to mid-screen (2.5, 0.33): posts stand upright. Road ground probing hides the gate so a post never kinks a road (all 24 paths identical to before).
- `GATE_BACK_PX` (content) sets the arch further back on curve-3 (20), wave-3 (20) and zigzag-3 (46): with the default 16 px their arch reaches into the Speaker keep-out zone. validateRace checks each road's arch rect (interactive rect, Hud keep-out) and that both post feet are ≥ roadWidth/2 from the road.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | verif | scene and validator build separate placeGate calls (can drift) | medium | Race.placeGateAt and rules.gateProblems each pass back/tangent; no test ties them | patch (one shared helper + real-layout test) |
| 2 | blind | kart drawn behind the arch when it arrives toward the camera | medium | the half-road depth rule predates turned gates; a loop lip heading down ends in front of the arch | patch (depth by side of the pivot) |
| 3 | edge, blind | fallback keeps the previous yaw frame; one warning for two causes | low | !g branch resets only position/alpha | patch |
| 4 | edge | posts checked for distance only, not opposite sides | low | a curving road could pass with both feet on one side | patch |
| 5 | verif | no failing-case test for "leaves the interactive rect" | low | only the passing real layout covers it | patch |
| 6 | verif, edge, blind | gateProblems inserted under the Story 4.2 JSDoc of roadShapeProblems | low | orphaned doc | patch |
| 7 | blind | GATE_BACK_PX ids unchecked; test hard-codes 16 | low | a renamed road drops its override silently | patch |
| 8 | blind | build_race.py header line past the wrap width | low | style | patch |
| 9 | verif, edge, blind | nine shadowMatch colours changed in tokens.ts | false | they belong to the parallel spec-tim-bong-bo-khung-long-lam-dep work, not this change; render.test pins them | reject |
| 10 | edge | validator reports a missing frame for an untrimmed atlas export | false | the packer always writes spriteSourceSize (trimmed atlas) | reject |
| 11 | blind | gate not checked against cones/flags/kart start/nearby legs | low | composites of all 24 roads show no overlap | reject |
| 12 | blind | perspective baked at mid-screen, shown near the edges | low | composites read correctly at every road end | reject |
| 13 | blind | tangent span (40 px) and pivot back (up to 46 px) differ | low | chosen yaws match the arrival in all 24 composites | reject |
| 14 | blind | GATE_YAWS duplicated in Python and TS | low | required frames are validated; extras are harmless | reject |
| 15 | blind | no scene-level test of placeGateAt | low | no Phaser scene harness; #1 moves the logic into a tested pure helper | defer (scene-harness gap) |

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.

**Manual checks:**
- 24 composites: the arch straddles every road end.
