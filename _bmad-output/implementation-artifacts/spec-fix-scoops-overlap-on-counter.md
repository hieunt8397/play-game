---
title: 'Kem chồng lên nhau trên quầy'
type: 'bugfix'
created: '2026-10-21'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Resting items overlap even when the counter still has room. `nudgeApart` (core/input/drop.ts) pushes away from one neighbour at a time, clamps to the rect, and gives up after 12 passes. Near an edge or between two items it bounces back into an overlap. Ice-cream's topple spots use it too. Separately, ice-cream respawns a scoop at its home slot without checking whether another scoop is resting there. A 200-session simulation of the round model showed overlaps from `rest`, `topple` and `respawn`, mostly in free play (6.1), where the counter holds up to ~12 scoops.

**Approach:** When the iterative push ends in an overlap, `nudgeApart` searches candidate points in rings around `p` (step = minDist/2) inside `rect`. It takes the nearest one clear of every other point. Only a really full rect keeps the best-effort result. In ice-cream, a respawn at an occupied home nudges the resting occupant away with a `rest {id, at}` command, so the home slot stays where the layout puts it. Pizza and dino-puzzle get the `nudgeApart` fix for free; their behaviour is otherwise unchanged.

</frozen-after-approval>

## Implementation Notes
- `app/src/core/input/drop.ts`: `nudgeApart` falls back to `ringSearch` (first clear point on the innermost ring, step minDist/2) when the push ends in an overlap. Pizza and dino-puzzle share it.
- `app/src/games/ice-cream/round.ts`: `respawnHome` returns `respawn` plus a `rest` (and a `cancelReturn` if a slide back was pending) for each scoop resting on the home. It nudges in restRect, or in the play rect for a scoop resting off the counter.
- Tests: 4 in `core/input/drag.test.ts` and 1 in `games/ice-cream/round.test.ts`. The 200-session round simulation (scratchpad) went from thousands of new overlaps to 0. `npm run check`: 1831/1831.

## Review Triage Log

- low/patch: a nudged scoop's pending slide back still targeted its old spot. It now sends `cancelReturn` before `rest`.
- low/patch: an occupant resting off the counter was clamped into restRect. It now nudges in its own rect.
- low/patch: `ringSearch` had a dead nearest-point comparison and docs that claimed "nearest". Simplified, and the docs now say "first clear point on the innermost ring".
- low/patch: the round.ts header did not mention the nudge. Updated.
- low/reject: `nudgeApart` gives no "full" signal. It is documented as best effort, and every caller only needs a position.
- low/reject: the ring search is coarse (rings start at minDist/2). The result is clear and nearby; precision is not needed for toys on a counter.
- low/reject: no cost cap for a tiny minDist. Every caller passes `draggableItem.minSize`, so it only matters for a misconfiguration.
- low/reject: overlap thresholds differ by an epsilon. A sub-micron rest tween is invisible.
- low/reject: test gaps (free-play respawn path, several occupants, hardcoded 90, the full-rect assert, proof that the ring branch ran). The 200-session simulation exercised these paths with 0 overlaps.
