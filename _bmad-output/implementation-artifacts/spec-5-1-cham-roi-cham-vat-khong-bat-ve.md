---
title: 'Story 5.1: Chạm-rồi-chạm và vật không bật về khi nhấc tay'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_revision: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A resting item can be nudged under a Hud button (the play rect ignores Hud exclusions).
    evidence: |-
      Rounds call nudgeApart(p, others, minSize, geo.playRect()); defaultPlayRect() returns dragBounds without hudExclusions, so a drop next to the Home corner can be nudged into the exclusion where the Hud router wins.
    location: >-
      app/src/core/input/drag-controller.ts defaultPlayRect; app/src/games/*/round.ts rest
    severity: medium
  - summary: >-
      No scene-level test covers the four games' onSelect/onDeselect/fly wiring.
    evidence: |-
      Only drag.test.ts (fake fly) and round tests exist; no harness constructs the IceCream/Pizza/DinoPuzzle/ShadowMatch scenes.
    location: >-
      app/src/games/{ice-cream,pizza,dino-puzzle,shadow-match}
    severity: medium
---

<intent-contract>

## Intent

**Problem:** A 3-year-old often lifts the finger mid-drag; today the four drag games (ice-cream, pizza, dino-puzzle, shadow-match) send an item dropped outside their rest area ("off") back home after 1.5 s, and there is no way to move an item without holding the finger down the whole way (FR29, NFR2).

**Approach:** Teach the shared `core/input/drag-controller` to tell a tap from a drag: a press-release with movement below a token threshold selects the item (it stays lifted with a selection ring); the next tap on the play area flies it there and is resolved exactly like a drop. In every round model, an "off" drop that lands inside the play area now rests where it landed (nudged apart) instead of returning; the level-3 hint hand shows tap-item → tap-target.

## Boundaries & Constraints

**Always:**
- Tap-vs-drag is decided in `drag-controller` only (press point vs furthest pointer movement < `Tokens.ui.tapMoveMaxPx`); games opt in by passing the new optional callbacks; a game that passes none keeps today's behaviour.
- A tap-target resolves through the same `round.drop(...)` path (same outcomes, same `hintWrong` counting). Tap on the selected item again → deselect (resolved like a drop at its current centre, i.e. `home`/`rest`).
- While an item is selected, a tap on another pickable item switches the selection (old one deselects first); taps on Hud/overlay layers are unaffected (other layers win in the guard as today).
- "Rest anywhere": for a drop inside the play rect (`defaultDragArea().bounds`, the clamp already keeps centres inside it) that hits no target/home/rest-area, the item rests at the nudged point within the play rect. `returnLater` stays only for a point outside the play rect (defensive) and for `cancel`.
- Every new number in `Tokens` / `Tokens.Timing` (threshold, fly duration, selection ring width/pulse if any). Feedback ≤ 100 ms (lift visual in the pointerdown handler).
- First finger wins (guard unchanged); a second finger never selects while one item is selected.

**Never:**
- No per-game tap detection; no change to the trace games (race) or tap games (fishing, touch-talk).
- No new "wrong" sound/colour; no hint climb for rests/selects/deselects.
- No change to which drops are correct/wrong.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tap-select | press+release on item, move < threshold | `onSelect(centre)`; item stays lifted, ring shown; no `onDrop` | – |
| Tap-target correct | item selected, tap on correct target | `fly(to)` then `onDrop(to)` → same commands as a drag drop there | – |
| Tap-target wrong | selected, tap on wrong target (wrong flavour cone, decoy shadow, other dino slot) | `floatBack` + `hintWrong` (as drag) | – |
| Tap elsewhere | selected, tap empty play area | item flies there and rests (nudged apart) | – |
| Tap item again | selected, tap same item | deselect; item settles where it is | – |
| Switch | selected A, tap pickable B | A deselects (settles), B selected | – |
| Mid-drag lift | drag released off rest area, inside play rect | `rest` at nudged point, no `returnLater` | – |
| Off play rect | drop point outside play rect (unit test only) | `returnLater` as before | – |
| Cancel | pointer lost / pause while selected or dragging | `onCancel`; selection cleared | – |

</intent-contract>

## Code Map

- `app/src/core/input/drag-controller.ts` -- `createDraggable` (L63–138): add press point + max movement tracking in `onPress`/`onMove`; in `onEnd` branch tap vs drop; new optional `DraggableOptions.onSelect(p)`, `onDeselect()`, `fly(to, done)`; selected-state catcher target registered on the same router with lowest `z` (−2, below Map decorations' −1) covering the drag bounds while selected; module-level "currently selected draggable" per router so a tap on another item switches. `Draggable.isSelected()` for hints/tests.
- `app/src/core/input/guard.ts` -- read-only: `onPress/onMove/onEnd/onCancel` contract (L62–127); `isPickable`, `setDragging`.
- `app/src/core/input/drag.test.ts` -- existing controller tests (fakes in `fakes.ts`); add tap-select / tap-target / deselect / switch / mid-drag rest / cancel tests here.
- `app/src/core/hint-visuals.ts` -- `handRoute` (L160) and `handPose` (L207): for `action:'drag'` the hand now presses+lifts on the item, travels lifted, presses+lifts on the target (tap-then-tap demo); timing from existing `hintHand*` tokens plus one new tap-press token if needed. Tests in `core/hint-visuals.test.ts` (or existing hint test file) for the pose sequence.
- `app/src/games/ice-cream/round.ts` -- `resolve` (L170–178) / `drop` (L188–210): `'off'` inside `geo.playRect()` → rest via `nudgeApart(p, others, minSize, geo.playRect())`; add `playRect` to the geometry type; tests `round.test.ts:140,170` updated (off inside play rect rests; a point outside play rect still `returnLater`).
- `app/src/games/pizza/round.ts` -- `resolve`/`drop` (L242–275): same change; test `round.test.ts:181`.
- `app/src/games/dino-puzzle/round.ts` -- `resolve` (L220–232, `DROP_ORDER` in `content/games/dino-puzzle.ts:54`): `off` inside play rect rests with the radius-sum min distance; test `round.test.ts:159`.
- `app/src/games/shadow-match/round.ts` -- `resolve`/`drop` (L171–195): no rest area today; `off` inside play rect → rests where dropped (new `rest` command handled by the scene like the other games' rest tween); tests `round.test.ts:94,134`.
- `app/src/games/{ice-cream/IceCream.ts:274, pizza/Pizza.ts:646, dino-puzzle/DinoPuzzle.ts:325, shadow-match/ShadowMatch.ts:347}` -- pass `onSelect` (lift visual + selection ring), `onDeselect` (settle visual), `fly` (existing `moveTo` tween, `Tokens.Timing.tapFlyMs`); geometry gets `playRect: () => defaultDragArea()?.bounds ?? <screen rect>`; ShadowMatch adds the `rest` command handler.
- `app/src/core/tokens.ts`, `app/src/core/timing.ts` -- new `tapMoveMaxPx`, `tapFlyMs`, selection ring values; run `npm run tokens`.

## Tasks & Acceptance

**Execution:**
- `app/src/core/tokens.ts` / `app/src/core/timing.ts` -- add `ui.tapMoveMaxPx` (≈12 design px), `Timing.tapFlyMs` (≈250), selection-ring style values -- AR-N4
- `app/src/core/input/drag-controller.ts` -- tap detection, selected state, catcher target, switch, `fly`, `isSelected`, cancel clears selection -- FR29 core
- `app/src/core/input/drag.test.ts` -- tests for every I/O row above -- FR29 tests
- `app/src/core/hint-visuals.ts` (+ test) -- drag demo becomes tap-item → tap-target pose -- AC hint
- `app/src/games/{ice-cream,pizza,dino-puzzle,shadow-match}/round.ts` (+ tests) -- off-inside-play-rect rests; geometry `playRect` -- NFR2
- the four scenes -- wire `onSelect`/`onDeselect`/`fly`, selection ring (reuse hint-ring look, thinner), shadow-match `rest` handler -- FR29 UI
- `cd app && npm run tokens && npm run check` -- all green

**Acceptance Criteria:**
- Given any of the four drag games, when the child taps a scoop/slice/piece/animal, then within one frame it lifts with a ring, and a second tap on the right target serves it exactly as a drag would (same voice, same celebration).
- Given the level-3 hint, when the hand demo plays, then it taps the item, travels lifted and taps the target.
- Given the child drags and lifts the finger in the air above the counter / on the sky / on the cave wall, then the item stays there and can be picked up again; no 1.5 s slide back.
- Given the race, fishing and touch-talk games, when played, then their input behaves exactly as before.

## Design Notes

- Catcher target: while an item is selected, the controller adds `{ z: -2, contains: p ⇒ inRect(p, area.bounds), onPress: … }` so it only receives taps no other target in that router wants; real targets (other items, cone, hit polygons registered as router targets) keep priority because they have higher z or later registration. Remove it on deselect/drop/cancel/destroy.
- A tap on a drop target that is not a router target (cones, shadows are plain DropTargets tested by the round) arrives at the catcher, which calls `fly(p)` then `onDrop(p)`: the round resolves it.
- `fly` absent → controller calls `onMove(p)` then `onDrop(p)` (jump), keeping old callers valid.

## Verification

**Commands:**
- `cd app && npx vitest run src/core/input src/core src/games` -- expected: all pass
- `cd app && npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- Headless Chrome run (dev server + CDP driver in the session scratchpad) of ice-cream: tap scoop, tap cone → served; drag scoop to the sky, release → stays.

## Spec Change Log

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 31 findings — high 0, medium 7, low 20, false 4, maybe-false 0
- findings:
  - `[medium]` `patch` (blind) fly stuck if its tween is stopped by another moveTo — patched: moveTo runs the stopped tween's pending onDone
  - `[false]` `reject` (blind) only ShadowMatch moveTo takes onDone — IceCream/Pizza/DinoPuzzle moveTo already had onDone (IceCream.ts:340, Pizza.ts:713, DinoPuzzle.ts:392)
  - `[low]` `reject` (blind) catcher ignores the round lock — a locked round answers with floatBack, the item returns; no visible defect
  - `[low]` `reject` (blind) ground tap acts on press — deliberate for ≤100 ms feedback; worst case moves the selected item to the press point
  - `[low]` `patch` (blind) selection ring leaks a shutdown listener — patched: off() in destroy
  - `[low]` `patch` (blind) ShadowMatch duplicates inRect — patched
  - `[low]` `reject` (blind) slide-back path unreachable in live play — drags are clamped into the play rect so "outside" cannot be produced; branch kept as the spec's defensive path
  - `[medium]` `defer` (blind) play rect ignores Hud exclusions — deferred (frontmatter)
  - `[low]` `patch` (blind) tap-tap lift phase untested — patched: mid-lift + mid-fade samples
  - `[low]` `patch` (blind) IceCream selection ring without depth — patched: Depth.lifted
  - `[low]` `reject` (blind) sleep / pause-in-flight / destroy-in-flight untested — no game scene sleeps; a 250 ms flight resolving after resume is harmless
  - `[medium]` `defer` (blind) no scene tests for the new wiring — grouped with VG2, deferred
  - `[low]` `reject` (blind) reduced motion ignored for fly — the move is the action's result, not decoration
  - `[low]` `patch` (blind) redundant prev.settle() in select() — patched: deleted
  - `[low]` `patch` (verification-gap) createHintVisuals.hand composition untested — patched: pure helper + tests
  - `[medium]` `defer` (verification-gap) four scenes' tap wiring untested — no scene harness (filed disposition defer)
  - `[low]` `reject` (verification-gap other) sleep subscription never emitted — unreachable for game routers today
  - `[medium]` `patch` (edge) fly stuck when the tween is stopped — grouped with blind row 1, patched
  - `[low]` `reject` (edge) pause during flight not cancelled — harmless
  - `[low]` `reject` (edge) stale area after rotation mid-selection — rare; only shifts the clamp
  - `[false]` `reject` (edge) destroy leaves the ring on a surviving image — every destroy path runs after the selection ended; a destroyed image removes its ring
  - `[low]` `patch` (edge) shutdown listener leak — grouped, patched
  - `[medium]` `patch` (edge) shadow-match home checked before pick near a rest spot — patched: pick before home + test
  - `[low]` `reject` (edge) pizza home before serve near a rest spot — rest inside the base only when nearer a bowl; reordering would serve on a deselect tap
  - `[medium]` `defer` (edge) nudge into a Hud exclusion — grouped with the deferred Hud row
  - `[medium]` `patch` (edge claim) correctness changed by home-before-target — grouped with the shadow pick fix
  - `[false]` `reject` (edge claim) pause in flight breaks the cancel contract — the cancel row covers selected/dragging, not a flight
  - `[false]` `reject` (edge claim) rests may overlap Hud — duplicate of the deferred Hud row
  - `[low]` `reject` (intent i1–i3) tests sit at controller/round seams, not the scene — scene coverage deferred with VG2
  - `[low]` `reject` (intent i4–i6) ring drawn on release while the lift visual is on press; wrong-tap hint relies on the shared drop path — accepted design, the shared path is tested at the round
  - `[low]` `reject` (intent i7–i9) shared tap-router onPause touches other games — no listener registers outside the four drag games

## Auto Run Result

Status: done

- **Summary:** shared tap-then-tap in `core/input/drag-controller` (tap below `Tokens.ui.tapMoveMaxPx` selects; next tap flies the item there via `fly` and resolves through `round.drop`; tap again deselects; switching; pause cancels); an off drop inside the play rect now rests (nudged) in ice-cream, pizza, dino-puzzle and shadow-match; level-3 hint hand demonstrates tap-item → tap-target; selection ring.
- **Files:** `core/input/drag-controller.ts` (tap/select/fly/catcher), `core/input/tap-router.ts` (`onPause`), `core/input/drop.ts` (`inRect`), `core/input/fakes.ts` (pause helper), `core/hint-visuals.ts` (tap-tap pose, `handDemo`, `createSelectionRing`), `core/tokens.ts` + `core/timing.ts` (new tokens), the four `round.ts` (playRect rests; shadow-match `rest` + pick-before-home), the four scenes (wiring, `moveTo` runs a stopped tween's `onDone`), tests in `drag.test.ts`, `hint-visuals.test.ts`, four `round.test.ts`.
- **Review:** 31 findings — 8 patch entries applied (2 medium: stuck fly, shadow pick order; 6 low), 2 deferred (Hud-exclusion rest nudge; scene-level wiring tests), 21 rejected with reasons in the triage log.
- **Follow-up review recommended:** true — two medium entries were patched (stuck-fly recovery in four scenes' `moveTo` is only typechecked, no scene test exercises it).
- **Verification:** `npm run check` exit 0 (112 files, 1585 tests) after patches; no headless-browser check this run.
- **Residual risks:** scene wiring untested; Hud-corner rest nudge (deferred).
