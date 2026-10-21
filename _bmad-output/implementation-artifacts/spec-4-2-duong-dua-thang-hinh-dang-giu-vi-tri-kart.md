---
title: 'Story 4.2 — Đường đua: thang hình dạng đường và giữ vị trí kart khi lượt dở'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'NO_VCS'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-cross-notes.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-duong-dua-vach-duong-thang.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-giu-luot-do-trong-phien.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-tiem-kem-luot-3-5-cau-do-kho-tang-dan.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-9-goi-y-leo-thang.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-pipeline-hinh-render-blender-atlas-layout.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** After Story 4.1, Đường đua has a single ladder level of three almost-straight roads. FR11's shape ladder (straight → gentle curve → zigzag → loop) is missing, so a child who traces well is never challenged. The validator does not stop a road band from folding onto itself at a corner or touching another part of itself. A Home tap mid-road keeps `partial.traceIndex`, but a resumed road starts from the beginning. The scene also has no background motion, so the "background stops at hint ≥ 2" rule has never been exercised.

**Approach:**
- **Art:** `build_race.py` generates nine more roads (`curve-1..3`, `zigzag-1..3`, `loop-1..3`) from parametric shape tables. It also turns the plate cones into a `sprite.cone` and keeps one map flag as a `sprite.flag`, so both can sway as ambient motion.
- **Validator:** `validateRace` gains rules for the band's own geometry: a minimum turn radius, self-clearance, point density, and the loop mouth.
- **Content:** a 4-level ladder.
- **Resume:** the round model validates `partial.traceIndex`, and the scene restores the kart through 4.1's `TracePath.restore`, with the driven stretch lit and the kart waiting.
- **Unchanged:** TraceModel's windowed forward projection already gives "no jump across the loop" and "corner cuts follow the road". This story proves it with loop and zigzag fixtures and does not change it.

## Boundaries & Constraints

**Always:**
- **Ladder** (`content/games/race.ts`, data only; `RaceLevel` from 4.1 is unchanged):

  | index | id / shape | roads | pathIds |
  |---|---|---|---|
  | 0 | `straight` | 3 | `straight-1..3` (4.1) |
  | 1 | `curve` | 4 | `curve-1..3` |
  | 2 | `zigzag` | 4 | `zigzag-1..3` |
  | 3 | `loop` | 3 | `loop-1..3` |

  `race.test.ts` checks:
  - there are 4 levels in this shape order;
  - `roads` ∈ [3, 5];
  - there are ≥ 2 distinct `pathIds`;
  - every pathId starts with `<shape>-`.
- **Road shapes** (`build_race.py`; all in world units, and every shape is a named constant with a comment). A `ROAD_SHAPES` table holds `{ id, kind, params }`. Generators sample each shape every ≤ `ROAD_STEP_WU` into the `path.<id>` poly curve (spec-1-4 grammar, unchanged JSON format):
  - `straight`: 4.1's `ROADS` points, unchanged.
  - `curve`: one gentle arc or S (sine) across the grass, starting on the left, with a large radius.
  - `zigzag`: 3–4 straight legs. Each turn is ≤ 90°, and each corner is a circular fillet of radius `ZIG_FILLET_WU` (projected ≥ 70 design px).
  - `loop`: an open circle (radius `LOOP_R_WU`) whose mouth faces the camera (bottom of the screen).
    - Its two lips are the start and the end.
    - The projected mouth chord is in [130, 150] px.
    - `loop-1`/`loop-3` run counter-clockwise on screen (start on the right lip). `loop-2` runs clockwise.
  - Rule failures are fixed in these constants, never in the validator.
- **Ambient art** (same builder):
  - **Cones:** the plate cones are removed. `sprite.cone` is one Kenney `cone.glb` rendered at the pose of `CONES[0]`. `anchor.cone-1..n` (n ∈ [2, 4]) stay as placement points, and the frame's origin comes from `anchor.cone-1`.
  - **Flag:** keep the first `FlagPole*`/`Flag*` pair by name sort as `sprite.flag` (frame `flag/idle/00`, pivot `anchor.flag-1` at the pole foot). Delete the other flags as in 4.1. `anchor.flag-1..2` come from a `FLAGS` table on the plate's back grass.
  - `RACE_SCREEN.frames` gains `cone/idle/00` and `flag/idle/00`.
- **Rules** (`tools/layout/rules.ts › validateRace`; every message names the path or anchor id):
  - **Existing 4.1 rules,** applied to every pathId of every ladder level. These are: present, ≥ 2 points, band inside the inset interactive rect and clear of the HUD keep-out, and the frames.
  - **Turn radius:** on the ≤ 4 px resample, the circumradius through the samples at `s − ui.raceTurnSpanPx`, `s` and `s + raceTurnSpanPx` (30) is ≥ `ui.raceMinTurnRadiusPx` (50 = width/2). Below that, the band's inner edge folds.
  - **Self-clearance:** any two samples whose arc lengths differ by ≥ `ui.raceSelfClearArcPx` (220) are ≥ `tracePath.width` (100) apart. Below that, the band touches another part of itself.
  - **Density:** for `curve`/`zigzag`/`loop` paths, consecutive layout points are ≤ `ui.racePathPointGapPx` (24) apart.
  - **Loop mouth:** for `loop` paths, the distance from the first to the last point is ≤ `ui.raceLoopMouthMaxPx` (150).
  - **Ambient anchors:** every `anchor.cone-*` and `anchor.flag-*` lies ≥ `tracePath.width/2 + spacing.targetGap` from every path of every level. There are ≥ 2 cones and exactly 2 flags.
- **Questions:** 4.1's `roundRoads(seed, level)` is unchanged. Its tests now cover all 4 levels: the length equals `roads`, no two consecutive ids match, the result is deterministic per `(seed, level)`, and a level outside the ladder is clamped.
- **Resume** (`games/race/round.ts`, pure; spec-2-5 contract):
  - `resumeQuestion(partial, maxTraceIndex) → { traceIndex } | null` returns null unless:
    - `partial` is `{ traceIndex }` with an integer `0 ≤ traceIndex ≤ maxTraceIndex`;
    - `maxTraceIndex = floor((length − ui.traceArriveSlackPx) / ui.traceSampleStepPx) − 1`, from the TracePath built for that road. A restored kart therefore never arrives without the child's finger.
  - **`start(resumeAt)`:**
    - The index rules of 4.1 are unchanged (an out-of-range index warns once and begins road 0).
    - For the resumed road, a null `resumeQuestion` warns once and begins that road clean.
    - `traceIndex 0` is a clean start.
    - `traceIndex > 0` gives `beginRoad{ index, pathId, restoreIndex }`.
  - `progressed(s)` takes the restored `s` as its activity baseline, so a restore never fires `hintActivity`.
  - `progress()` straight after a restore returns the same `traceIndex`.
- **Scene restore** (`Race.ts`; wiring only), on `beginRoad` with `restoreIndex`:
  1. Draw the road.
  2. Call `trace.restore(restoreIndex)`. The model is now `waiting` at `s = restoreIndex × step`.
  3. Place the kart on `trace.point`, facing the tangent there.
  4. Draw the driven overlay up to `s` with no tween.
  5. Start the waiting blink.
  6. Then `hint.beginQuestion` as in 4.1 (prompt re-read, level 0).

  There is no grab pulse, no engine sfx, and no `hintActivity`. A press within `raceGrabRadius` of the kart continues from there.
- **Ambient** (`Race.ts`, through spec-1-9's `addAmbient`/`holdAmbient`):
  - **Cones:** one cone image per `anchor.cone-*`. Each cone sways `angle` ±`ui.raceConeSwayDeg` with a yoyo period of `Timing.raceConeSwayMs`, phase-staggered by its index.
  - **Flags:** one flag image per `anchor.flag-*`. Each sways ±`ui.raceFlagSwayDeg` with a period of `Timing.raceFlagSwayMs`.
  - Amplitudes go through `amplitude(…, reduced)`. Depth: `bg.race` < cones/flags < road.
  - Ambient is held at hint level ≥ 2 (base `'hint'` hold) and during every celebration (`'celebrate'`). So while a ring or glow shows, the only motion is the ring and the guide glow.
- **Reduced motion:**
  - The guide glow is 4.1's static fade.
  - The celebration bounce uses the reduced amplitude.
  - `kart/wave` shows frame `00` held, instead of alternating frames.
  - The waiting blink keeps its 1200 ms period (≤ 1 Hz).
- **Kart and gate depth:** the kart draws above the gate while `s < length / 2` and below it after that. On a loop, the kart at the start lip is not hidden by the arch 130–150 px away, and on arrival it still drives "into" the arch.
- **Difficulty:** the game has no difficulty logic. Two tests cover it:
  - **`nextLevel` with the race ladder length (4):**
    - level 2 with `{questions 4, firstTryCorrect 4, maxHintLevel 0}` → 3;
    - level 2 with maxHint 3 → 2;
    - level 3 perfect → 3.
  - **Source scan:** no file under `src/games/race/` contains `.wrong(`. So `maxHintLevel ≤ 3`, and the race never steps down.

**Never:**
- No change to TraceModel's projection, bands or speeds, to the HintDirector machine, to `nextLevel`, or to the snapshot envelope.
- No new voice lines. The prompt, retry and celebration lines stay as in 4.1.
- No clouds. The high 3/4 race camera shows no sky.
- No ambient tween outside `addAmbient`. No `setTimeout`, `this.sound`, `this.load` or `scene.*` in `games/race`.
- No hand-typed design-px road points. Every road comes from Blender through the layout.
- No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **Roads per level:** 3/4/4/3. Loops are about 2× the arc of a straight road, so 3 loops keep the round about as long as a 4-road zigzag round.
- **Shapes stay pure per level**, with 3 roads per shape. Three ids allow variety under the "no two consecutive the same" rule.
- **"Bán kính góc đủ" as measurable rules:**
  - Turn radius ≥ half the band, so the inner edge never folds. The builder aims for ≥ 70 px to leave margin for the rounding of layout points.
  - Self-clearance ≥ the band width beyond 220 px of arc. 220 px is the arc separating the legs of a 90° filleted turn when they are 100 px apart.
- **Loop mouth 130–150 px:** this makes the AC's "start and gate ≤ 150 px" true on real data, while self-clearance keeps the lips ≥ 100 px apart. A finger pressed on the gate is then > 100 px from the kart (no grab). A finger dragged there projects onto the window [s, s + 240], which runs away from the gate, so the kart cannot advance.
- **Ambient = cones + flags.** "Mây" (clouds) is out: no sky is visible. 4.1's static plate cones become sprites so they can sway.
- **Reduced "vẫy":** the arm stays raised (one frame). The frames are pre-rendered at ±25°, so a held frame is the only smaller amplitude.
- **`traceIndex 0` means a clean start** (state `idle`, no blink). Nothing has been driven, so "kart waiting at its old position" looks the same.
- **New values:**
  - `ui`: `raceTurnSpanPx 30`, `raceMinTurnRadiusPx 50`, `raceSelfClearArcPx 220`, `racePathPointGapPx 24`, `raceLoopMouthMaxPx 150`, `raceConeSwayDeg 4`, `raceFlagSwayDeg 3`.
  - `Timing`: `raceConeSwayMs 2200`, `raceFlagSwayMs 1700`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ladder | `{level:2, seed:7}` | 4 roads from `zigzag-1..3`, no two consecutive equal; same list on a second start | — |
| Clamp | `level:9` | level 3 list | — |
| Loop, gate press | loop fixture, kart at s 0, press at the end point (140 px away) | no grab; s 0 | — |
| Loop, drag to gate | grabbed at start, finger moved onto the gate | window [0, 240] runs away from the gate → projection clamps to s, no advance; `arrive` only after the whole loop | — |
| Zigzag corner cut | finger 60 px inside a filleted corner | s grows along the arc; `point` stays on the polyline (distance < 0.5 px) | — |
| Home at 60 % | road 2 (index 1), `s = 0.6·length` | `round:abandon`; snapshot ⊇ `{v:1, level, seed, questionIndex:1, partial:{traceIndex: floor(s/4)}}`; `isJsonOnly` true | — |
| Resume | that snapshot as `resume` | road 2; `|restored s − s| < 4`; overlay lit to s; state `waiting`, blinking; prompt re-read; level 0; no `hintActivity` | — |
| Resume, then Home | Home at once | same `traceIndex` | — |
| Resume at 0 | `traceIndex 0` | road clean, state `idle` | — |
| Bad partial | `traceIndex` −1, 2.5, `"9"`, ≥ the arrive index, or `{}` | that road clean | console.warn once |
| Ambient at hint 2 | idle 6 s | cones and flags stop; only ring + glow move | — |
| Celebration | arrival | ambient held; released before the next road | — |
| Reduced motion | `prefers-reduced-motion` | sway smaller, glow static, wave held on frame 00, blink 1200 ms | — |
| nextLevel | L2 perfect / L2 maxHint 3 / L3 perfect | 3 / 2 / 3 | — |
| Fold | zigzag fixture with a sharp, unfilleted 90° corner | check fails naming the path (turn radius) | exit 1 |
| Touch self | U-turn fixture with legs 80 px apart | check fails naming the path (self-clearance) | exit 1 |
| Wide mouth | loop fixture with a 200 px mouth | check fails naming it | exit 1 |
| Missing path | ladder `loop-2` absent from the layout | check fails naming `loop-2` | exit 1 |
| Cone on road | `anchor.cone-2` 40 px from `curve-1` | check fails naming both | exit 1 |

</intent-contract>

## Code Map

- `app/src/content/games/race.ts` (+ `race.test.ts`) -- planned in spec-4-1 (`RaceLevel`, the 1-level `ladder`, `RACE_SCREEN`, `RACE_KART`, `assets`). Extend the ladder and the frames.
- `app/tools/render/blender/build_race.py` -- planned in spec-4-1 (`ROADS`, `CONES`, `CamRace`, `sprite.kart`/`gate`). Add `ROAD_SHAPES` + generators, `sprite.cone`, `sprite.flag` and the `FLAGS` anchors.
- `app/tools/layout/rules.ts` (+ test) -- planned in spec-1-4, `validateRace` from spec-4-1. Add the geometry rules. `tools/layout/geometry.ts` (`distToPolyline`, spec-1-4) and `core/road.ts` (resample, spec-1-7/4-1) are reused.
- `app/tools/lint/hint-contrast.ts` -- planned in spec-1-9/4-1. Its race samples now cover every ladder path's first point (no code change if it already iterates the ladder).
- `app/src/core/input/trace-model.ts` (+ test) -- planned in spec-4-1, unchanged. Add the loop and zigzag fixture tests.
- `app/src/core/input/trace-path.ts` -- planned in spec-4-1 (`restore(index)`). Unchanged.
- `app/src/games/race/{questions,round,Race}.ts` (+ tests) -- planned in spec-4-1. Add `resumeQuestion`, `restoreIndex` in `start`, and the scene's restore, ambient and depth swap.
- `app/src/games/mini-game-base.ts` -- planned in spec-1-9/1-10/2-5 (`addAmbient`, `holdAmbient`, `resumeAt`, `progress()`, `snapshot()`).
- `app/src/core/snapshot.ts` (`isJsonOnly`), `core/difficulty.ts` (`nextLevel`) -- planned in spec-2-5 and spec-1-10.
- `app/src/core/tokens.ts`, `app/src/core/timing.ts` -- real. Add the new values.
- `app/src/content/generated/race.layout.json`, `public/assets/atlases/race.{png,json}`, `public/assets/bg/race.png` -- regenerated.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/core/tokens.ts`, `app/src/core/timing.ts` -- add the 7 `ui` and 2 `Timing` values (+ `tokens.test.ts` rows).
- [x] `app/src/content/games/race.ts` (+ `race.test.ts`) -- the 4-level ladder, plus `cone/idle/00` and `flag/idle/00` in `RACE_SCREEN.frames`.
- [x] `app/tools/layout/rules.ts` (+ `rules.test.ts`) -- the turn radius, self-clearance, density, loop mouth and ambient-anchor rules, with each failing fixture from the matrix and a passing loop and zigzag fixture.
- [x] `app/tools/render/blender/build_race.py` -- the shape tables and generators, the cone and flag sprites and anchors, and the removal of the plate cones. Run `art:build`, `render` and `atlas` for `race`, and tune the constants until the rules pass.
- [x] `app/src/core/input/trace-model.test.ts` -- the loop gate-press, loop drag-to-gate (arrival only after the full loop) and zigzag corner-cut rows.
- [x] `app/src/games/race/questions.test.ts` -- all 4 levels for length, consecutive distinctness and determinism over 200 seeds, plus clamping.
- [x] `app/src/games/race/round.ts` (+ `round.test.ts`) -- `resumeQuestion`, `start` with `restoreIndex`, the activity baseline and `progress()` after a restore, covering every resume and bad-partial row. Add the snapshot row through `toMatchObject` + `isJsonOnly`.
- [x] `app/src/games/race/Race.ts` -- the restore sequence, the ambient sprites and tweens, the reduced wave, and the kart/gate depth swap.
- [x] `app/src/core/difficulty.test.ts` (or `games/race/round.test.ts`) -- the three race `nextLevel` rows and the `.wrong(` source scan.
- [x] `app/README.md` -- note the race ladder and the Kenney cone and map flag reuse in the provenance rows.

**Acceptance Criteria:**
- Given the real Blender, when running `art:build`, `render` and `atlas` for `race`, then `race.layout.json` holds `path.{straight,curve,zigzag,loop}-1..3`, ≥ 2 `anchor.cone-*` and `anchor.flag-1..2`. `preview.png` shows the twelve roads, all clear of the corners and the HUD, with zigzags that have rounded corners and loops that open toward the camera. `npm run check` exits 0.
- Given a layout edited so that a ladder pathId is missing, or a zigzag corner is sharp, when running `npm run check`, then it fails naming that path.
- Given `npm run dev` with the race started directly at `{ level: 3, seed: 5 }`, when the child puts a finger on the gate while the kart is at the start of a loop, then nothing moves. Tracing around the loop brings the kart to the gate only after the whole circle.
- Given `{ level: 2 }`, when the child traces a zigzag cutting the corners by up to 80 px, then the kart keeps to the road surface and moves forward along it.
- Given road 2 traced to about 60 % and Home tapped, when the race is started again with `{ level, seed, resume: snapshot }` (in DevTools, or with Epic 2 by re-entering the station), then road 2 shows the kart at the same spot, the driven part lit, and the kart blinking and waiting. "Bé lái xe… tới cổng nhé!" plays again, and help starts from level 0.
- Given idle until the ring appears, then the swaying cones and flags freeze, and only the ring and the glow ahead move. With `prefers-reduced-motion`, the sway is smaller, the glow is a static fade, the driver's arm stays raised at the gate, and the waiting blink is no faster than 1 Hz.
- Given a level-2 round finished with every road at hint level 0, when Map applies `nextLevel`, then the next race starts at the loop level. A level-3 perfect round stays at level 3.

## Spec Change Log

- **2026-10-09 (before implementation): Epic 2 APIs that every new game must follow.** Epic 2 was built after this spec was written; read the current code, not only older specs.
  - **Game base and resume (Story 2.5).** `MiniGameBase<G>` builds `snapshot()` itself through `makeSnapshot`, so a game must not define `snapshot()`. Instead it:
    - implements `protected abstract progress()`;
    - reads `this.resumeAt` (already validated by `readResume`);
    - calls `this.acceptResume()` only when it takes the resume.
    
    Put the resume decision in a pure `startCommands(round, resumeAt)` in the game's `round.ts`, as Tiệm kem does. Declare the game's partial in `SnapshotPartials` in `content/types.ts`.
  - **Difficulty and return path.** The level is written by the post-round chain (`core/post-round-chain.ts`), not by the game or by Map directly. Start data comes from `takeStartData` in `core/session-store.ts`.
  - **Rewards.** `round:complete` grants a decoration through `core/reward-service.ts`, which must stay the only caller of `grantDecoration`. A game never grants directly.
  - **Decoration slots.** Story 2.2 left each station 1–2 decoration slots (10 in total).
  - **Map routing.** Map decides through pure helpers: `routeRoundComplete` / `routeRoundAbandon` / `keepAbandonSnapshot` in `post-round-chain.ts`, and `routePlayAgainClose` in `play-again.ts`. Keep new Map logic in pure core helpers with tests, because scenes have no test harness.
## Review Triage Log

- 2026-10-12: subagent review layers NOT run (not authorised); inline self-review. Notes: (1) `RaceTimings` gained `step` and `maxTraceIndex(pathId)` (the scene computes it from a TraceModel of the layout path). (2) A resume without `partial` is a bad partial (warn, clean road). (3) Loop mouth tuned to `LOOP_MOUTH_WU` 1.1 (≈140 px). (4) The kart depth swap uses an extra layer `kartFront` above the gate. (5) In-browser AC walkthroughs not run.

## Design Notes

**Why nothing changes in TraceModel:** 4.1 already projects only onto [s, s + 240], never decreases `s`, and moves at most the catch-up speed along the arc. On a loop the gate is ~1200 px of arc ahead, so it is never in the window. At a zigzag corner, the finger's nearest point inside the window lies further along the road, and the kart travels there along the fillet, never across it. The new tests pin this on real-shaped fixtures:

```ts
const loop = openCircle({ r: 220, mouthChord: 140 });  // start right lip, end left lip
const m = new TraceModel(loop, opts);
expect(m.press(loop.at(-1))).toBe(false);              // gate 140 px away: no grab
m.press(loop.at(0)); m.move(loop.at(-1)); m.tick(250);
expect(m.s).toBe(0);                                    // window runs away from the gate
```

**Drawing curves:** 4.1 draws the road bands from the resampled points. For curves, draw each band as thick segments plus a filled circle of radius width/2 at every sample (round joins), so corners have no notches. Dashes are laid by arc length so they stay even on loops.

**Self-clearance threshold:** two legs of a 90° turn are `L·√2` apart at about `2L` of arc. They reach 100 px at L ≈ 71, so after 220 px of arc they are about 155 px apart. A tight circle of radius 60 fails at about 300 px of arc (chord ≈ 72 px), so the rule rejects real self-overlap but accepts every filleted turn the builder may use.

## Verification

**Commands:**
- `cd app && npm run art:build -- race && npm run render -- race && npm run atlas -- race` -- expected: exit 0; a second `render` gives a byte-identical layout; the atlas is 1 page ≤ 2048² with `cone/idle/00` and `flag/idle/00`.
- `cd app && npm run check` -- expected: exit 0; the race ladder, rules, trace-model, questions, round and difficulty tests pass, and validate:content accepts the layout.
- `cd app && npm run build` -- expected: exit 0.

**Manual checks:**
- At 1180×820 and 1024×768, start the race at each level from DevTools (`game.scene.start('race', { level, seed })`). The road shapes match the level, the kart faces its direction of travel all around a loop, and it never leaves the road.
- Check the resume flow from the AC, plus a resume at road 1 with `traceIndex 0`, which starts clean.
- With `prefers-reduced-motion`, check the ambient sway, the glow and the wave as in the AC.
