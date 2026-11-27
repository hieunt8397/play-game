---
title: 'Sửa tàu đi gượng và tên lửa nhảy chỗ khi phun khói (đảo)'
type: 'bugfix'
created: '2026-11-27'
status: 'done'
baseline_commit: '1b41245ba3f902d047cd8f3cfdcc6f020cf0310d'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** (1) On the island the toy train looks stiff and fake: each piece shows one of only 8 pre-rendered headings (45° steps) picked from the raw polyline segment direction, so on curves the cars pop between angles, sit visibly askew on the rails, and segment noise (±1–3° per ~8 px vertex, a kink near the crossing) can flicker a piece between two frames. (2) The island's rocket "sometimes jumps": every 9 s it swaps to its 3 steam-puff frames, and those were rendered with the rocket ~180 source px right of the idle frame and without the shrunk yellow pad ring (verified by cropping `map-0.png`).

**Approach:** (1) Decision (user): re-render the train pieces and the plane in **16 headings** (22.5° steps) AND in code pick the frame from a smoothed rail tangent with hysteresis, then rotate the sprite in screen space by the small residual angle (≤ ~±11°) so each piece lines up with the rail and turns continuously. Same logic in the train game (it uses the same frames and `headingFrame`). (2) Fix the Blender build so each puff state is an exact copy of the idle rocket + pad (same placement), plus the steam blobs; re-render the map.

## Boundaries & Constraints

**Always:** Pure rules in `core/map-rides.ts` (node-testable); views only wire Phaser. The train's speed model, stops, coupling, tunnel, barriers, tap boxes and the map↔train-game handoff are unchanged. Reduced motion honoured (no new motion added). Frames missing from the atlas fall back via `hasFrame` as today. `MAP_RIDES.headings` stays the single runtime source of the heading count (core constant kept equal by a test).

**Never:** Do not touch the uncommitted phone-stage work (`stage.ts`, `main.ts`, `input/*`, `stage.css`); commit only this spec's files. No change to the rocket game, the puff timing, or other map art (plate/stations must come out the same apart from the rides' frames).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Curve | piece on a curve | frame from the smoothed tangent; residual rotation keeps it on the rail; heading changes look continuous | N/A |
| Noise / kink | tangent wobbles near a frame boundary | no back-and-forth frame flicker (hysteresis) | N/A |
| Straight | rail straight | rotation ≈ 0, stable frame | N/A |
| Degenerate compass | `path.compass` missing/zero det | frame 0, rotation 0 | as today |
| Rocket puff | puff frame k shown | rocket and pad pixel-identical in place to idle; only steam added | N/A |

</frozen-after-approval>

## Code Map

- `app/src/core/map-rides.ts:162-190` -- `HEADINGS = 8`, `headingFrame` (round to 45°). `createLoop.dirAt` = raw segment dir.
- `app/src/scenes/map-rides-view.ts` `drawTrain` / `drawPlane` -- choose `headingFrameName(sprite, headingFrame(loop.dirAt(s)))`, no rotation.
- `app/src/games/train/Train.ts:534` -- same choice in the train game (pieces are in the same atlas frames).
- `app/src/content/assets.ts:186-221` -- `MAP_RIDES.headings: 8`, preload list. `content/games/train.ts:181,233` derive from it.
- `app/tools/render/blender/map_rides.py:46` `HEADINGS`, `build_train` (`45.0 * k`), plane (`45.0 * k`, `round(yaw/45)`), `build_rocket:845-853` (puff states re-append + re-seat rocket.blend → wrong place, pad not shrunk).
- `app/tools/render/blender/build_train.py:19,251` -- keeps the map's heading frames; `round(deg/45) % mr.HEADINGS`.
- `app/tools/render/blender.ts` -- Blender is not on PATH: `export BLENDER_BIN='C:/Program Files/Blender Foundation/Blender 5.2/blender.exe'`. `map` (art/src/map-v4.blend → build_map.py) then `train` (from built art/map.blend). Build map first.
- `app/src/core/map-rides.test.ts`, `games/train/Train.test.ts` -- existing heading tests.

## Tasks & Acceptance

**Execution:**
- [x] `app/tools/render/blender/map_rides.py` -- `HEADINGS = 16`, `HEADING_STEP = 360/HEADINGS` used for train/plane yaw and the plane's parked-heading rounding; fix log/comment text; in `build_rocket` make each puff state duplicate the idle state's objects (object copies sharing mesh data, parent links remapped, same matrices) instead of re-appending, then add the blobs.
- [x] `app/tools/render/blender/build_train.py` -- replace the 45° rounding with `360 / mr.HEADINGS`; comment.
- [x] `app/src/content/assets.ts` -- `headings: 16`; comments.
- [x] `app/src/core/map-rides.ts` -- `HEADINGS = 16`; `smoothDirAt(loop, s, half)` (chord pointAt(s+half) − pointAt(s−half), fallback dirAt); `headingPose(d, compass, prev?)` → `{ frame, rotation }`: keep `prev` while the world angle stays within half a step + a hysteresis margin, rotation = screen angle of `d` minus screen angle of the frame's world heading (via compass), wrapped, clamped to ±(step/2 + margin).
- [x] `app/src/scenes/map-rides-view.ts` -- train pieces and flying plane use smoothed dir + `headingPose` with per-piece previous frame; `setRotation(rotation)`; parked plane rotation 0; reset prev on `parkAll`.
- [x] `app/src/games/train/Train.ts` -- same for its pieces.
- [x] `app/src/core/map-rides.test.ts` (+ train tests if they assert 8) -- tests: 16-way rounding, hysteresis holds near a boundary and switches past margin, rotation sign/clamp, smoothed dir on a polygonal circle, `HEADINGS === MAP_RIDES.headings`.
- [x] Rebuild art: `art:build map` → `render map` → `art:build train` → `render train` (BLENDER_BIN set), regenerate atlases/layouts as the pipeline does; confirm only rides frames + atlas packing changed.

**Acceptance Criteria:**
- Given the island map, when the train runs its full lap, then no piece visibly sits askew or flickers and turns look continuous (burst capture at 250 ms on the right-side curve).
- Given the island map, when the rocket puffs, then the rocket and its pad do not move; only steam appears.
- Given the train game, when its train runs, then pieces use the 16 frames + rotation the same way.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | headingPose clamps a screen residual with a world-angle limit (blind, edge) | medium | map compass E=(37.7,0) N=(-0.2,-25.8): h3→h4 is ~32° on screen, so near N/S the needed residual (~22°) is cut to 15.75° → up to ~7° askew on the island's north/south runs | patch |
| 2 | Tests only check the clamp, not alignment (blind) | medium | no test asserts frame screen angle + rotation = atan2(d) across headings; would have caught #1 | patch |
| 3 | Residual tilt up to ±15.75° world (more near N/S) leans 3D sprites (blind, edge claim) | low | hysteresis margin 0.2·step beyond the half step; the smoothed tangent already removes the ±1–3° noise, so a smaller margin suffices; one-constant change | patch |
| 4 | Board/drop hop uses the unrotated seatOffset (edge, Train.ts:633,673) | low | sync rotates the seat offset by the piece rotation; the hop start/target do not → friend lands a few px off, then snaps | patch |
| 5 | Parked plane drawn at rotation 0, first flying frame rotated by its residual → snap at take-off/landing (blind, edge) | low | parked branch setRotation(0) while flight applies headingPose rotation from a near-identical runway tangent | patch |
| 6 | content/games/train.ts:16 comment still says 8 heading frames (verification-gap) | low | text at line 16 | patch |
| 7 | validate-content.ts comment nested-parenthesis wording (blind) | low | comment only | patch |
| 8 | Train scene rotation/seat/wobble not asserted by tests (verification-gap) | medium | Train.test Proxy stub records no display calls | defer |
| 9 | map-rides-view per-piece heading memory, parkAll reset, parked rotation untested (verification-gap) | medium | no harness for the view exists | defer |
| 10 | Map↔train-game handoff does not seed hysteresis frames (blind, edge) | low | at a boundary the game may pick the adjacent frame; rotation compensates so the piece still lies on the rail; fix needs new handoff surface | reject |
| 11 | Tap boxes ignore rotation (blind) | low | ≤16° about the ground anchor moves car ends a few px, within hitPad | reject |
| 12 | headingPose early-out returns an unvalidated prev / NaN compass (edge) | low | prev only ever comes from headingPose's own frames; compass is validated layout data | reject |
| 13 | smoothDirAt chord wraps on very short loops (edge) | false | rail ~2000 px, plane loop larger; half = 20·k px | reject |
| 14 | copy_state does not remap modifier/constraint targets (edge) | false | rendered puff frames match idle exactly (same trimmed box 321,1108 178×204; visual crop) | reject |
| 15 | rail-back lost 5 points near the rocket (blind, edge) | false | those marks came from the stray mis-placed puff rockets acting as occluders; the fix removes them, the real rocket still occludes | reject |
| 16 | path.plane shape moved (blind) | false | only hits.plane changed (hull of the 16-way parked frame); paths.plane-loop is unchanged | reject |
| 17 | copy_state names can collide (blind) | low | names do not affect output (states are by collection) | reject |
| 18 | Python banker's rounding vs Math.round on exact ties (blind) | low | needs an exact .5 boundary heading; practically unreachable | reject |
| 19 | Rocket fix has no automated pixel check (blind) | low | verified by atlas bounds/crop; adding a check is new surface | reject |
| 20 | Atlas growth ~2.1 MB (blind) | low | the cost was stated and accepted with the 16-heading decision | reject |

## Verification

**Commands:**
- `cd app && npm run check` -- expected: typecheck, lint, tests, tokens, content validation, build, precache all pass

**Manual checks (if no CLI):**
- Headless Chrome burst capture of the train on the right-side curve and of the rocket across a puff (crop `map-0.png` rocket frames side by side: same rocket position).
