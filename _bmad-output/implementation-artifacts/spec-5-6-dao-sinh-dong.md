---
title: 'Đảo sinh động – dấu hiệu trạm và chuyển động nền'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: false
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md']
warnings: ['oversized']
deferred:
  - summary: >-
      Map ambient wiring (periodic route, tickAmbient, spout cleanup) and build_map dressing_check geometry have no tests.
    evidence: |-
      No MapScene harness and no Python test path in the repo.
    location: >-
      app/src/scenes/Map.ts; app/tools/render/blender/build_map.py
    severity: medium
  - summary: >-
      Pre-existing build_map CHECK lines: shadow-match-1 decorations estimated near the touch-talk hit.
    evidence: |-
      Printed before and after Story 5.6; the atlas-level validateDecorations gate passes.
    location: >-
      app/tools/render/blender/build_map.py footprint_report
    severity: low
---

<intent-contract>

## Intent

**Problem:** The island is static. The road is grey, the front lawn and the beach are empty, and two stations (the ice-cream truck, the pizza shop) do not read clearly from a distance. The only motion is a station bounce now and then. FR37 asks for a landmark per station and gentle life (clouds, waves, a whale spout, a fountain) with only one prominent motion at a time (NFR11).

**Approach:** `build_map.py` adds the approved v4 dressing (`.working/render-ban-do-v4.png`):
- a toy-coloured road;
- a fountain;
- a striped swim ring;
- a chibi whale;
- a big landmark for ice-cream (a giant cone) and for pizza (a chimney). The other five stations already have a bold landmark, and the build now asserts each one exists.

The whale and the fountain become their own map sprites with frame states. Clouds and foam waves become detached frames. A builder check keeps all new dressing clear of the station hits and the decoration slots. At runtime, Map draws them. Whale spouts are scheduled through `core/map-idle`, which gets a new periodic channel that obeys the one-prominent-motion rule. The continuous background loops (cloud drift, wave bob, fountain jets) are pure functions in a new `core/map-ambient`.

## Boundaries & Constraints

**Always:**
- Every number and colour lives in `Tokens` / `Tokens.Timing` / `Tokens.art` (no-magic-numbers lint). The builder gets its colours through `tools/render/build.ts` params and never hard-codes them.
- The NFR9 soft-toy look: `cute.py` helpers, smooth shading, no SUBSURF (`check_no_subsurf`).
- The map atlas stays 1 page ≤ 2048². `validateLayout`, `validateDecorations`, the guide rules, `candidatePositions` (5.5, tested on the real layout) and the map hint contrast all still pass.
- Timers and loops run on scene `time` / `update` delta, never `setTimeout`. A paused or sleeping Map freezes them.
- Prominent motions (a station ambient bounce, a whale spout, an invitation with the guide wave) never overlap. Background loops are low amplitude, and any periodic change is at most 1 Hz.
- `prefers-reduced-motion`:
  - cloud drift speed and wave bob amplitude are multiplied by `ui.reducedMotionAmplitude`;
  - the fountain holds its first frame;
  - the whale spout still plays (a frame swap: the sprite does not move).

**Never:**
- No change to `Tokens.colors.road` / `road-edge` / `road-dash` or DESIGN.md. The race screen and the loading strip keep their road.
- No new voice lines or sounds. The whale, fountain, ring, clouds and waves have no tap target in this story: a tap on them gives the 5.4 background ripple.
- Do not rebuild `art/src/map-v3.blend` and do not move the decoration slots (`SLOT_OFFSETS`) or the stations.
- No Phaser-drawn art for dressing: everything is a pre-rendered frame.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Whale due | map-idle with `periodic [{id:'whale', firstMs, everyMs, busyMs}]`, idle, nothing busy | `{kind:'periodic', id:'whale'}` at `firstMs`, then every `everyMs`. Map plays `whale/spout/00..03` once, then shows idle | Missing frames → no spout, one warn (plan) |
| Spout due while busy | A station bounce runs (`ambientBusyMs`) or an invitation shows | The spout waits and fires on the first free tick. It is never dropped and never runs at the same time | — |
| Ambient / invite due during a spout | busyLeft > 0 | Neither fires until `busyMs` ends. The invite comes at most `busyMs` later | — |
| Suspended | Kart travelling, chain, play-again | No periodic, ambient or invite. Periodic timers pause | — |
| New visit | `reset()` | Periodic timers restart at `firstMs` | — |
| No periodic config | Existing callers and tests | Behaviour identical to today | — |
| Cloud drift | `driftX(baseX, elapsedMs, speed, span)` | Moves right, wraps inside `[−frameW, width + frameW]`. Reduced → speed × factor | Non-finite elapsed → baseX |
| Wave bob | `waveBob(elapsedMs, index, reduced)` | dy within ±`ui.mapWaveBobPx` (× factor when reduced), period `Timing.mapWaveBobMs` ≥ 1000, phases staggered by index | — |
| Fountain loop | `loopFrame(elapsedMs, frames, frameMs, reduced)` | Cycles through the frames. Reduced → frames[0]. Empty frames → undefined | — |
| Dressing collides | Fountain / ring / whale / wave / cloud bbox within `hitPad` of a station polygon, a slot union footprint or `hit.shiba` | `build_map` fails, naming the object and what it hits | Fix the position or scale in the table |
| Atlas missing new frames | Old atlas | `planMap` warns and skips that ambient item. Map runs as before | — |

</intent-contract>

## Code Map

- `app/tools/render/blender/build_map.py:38-46` -- `STATIONS`, the sprite members (a landmark joins its station's sprite, so it is tappable and counts in the hull).
- `app/tools/render/blender/build_map.py:49-74,627-662` -- the GUIDE pattern: its own `sprite.<id>` with `states` JSON and keyed frames. Copy it for the whale and the fountain.
- `app/tools/render/blender/build_map.py:82-110` -- `KEEP_IN_PLATE`, `RECOLOUR`. Add the road material recolour (`Road`, `RoadEdge`, `Dash`) here.
- `app/tools/render/blender/build_map.py:140-156` -- `SLOT_OFFSETS` (do not touch), `GROUND`.
- `app/tools/render/blender/build_map.py:458-493` -- `build_decorations`: the detached `state.<id>` pattern for `sprite.ambient` (cloud, wave).
- `app/tools/render/blender/build_map.py:577-617` -- `footprint_report`: slot unions and station polygons. Return the unions for the dressing check.
- `app/tools/render/blender/build_map.py:665-800` -- `build()`: regroup, shifts, the layout loop (`hit.*`, `anchor.*` at :739-767), slots, soften, save.
- `app/tools/render/blender/render_screen.py:1-35` -- the contract: `states`, `occlude`, `bhc_detached`, `state.*` children.
- `C:/Users/NGUYEN~1/AppData/Local/Temp/claude/C--Users-nguyentrunghieu-Desktop-workspace-play/8ce6ec61-e41f-4682-9920-169d82116a83/scratchpad/map_trial.py` -- the approved trial geometry: the fountain `tt_model("fountain")` at (−1.2, −6.05) scale 0.5, the ring torus at (3.6, −7.45), the whale parts at (7.3, −8.2) yaw −25°.
- `app/tools/render/build.ts:43-75` -- BuildParams (`colours`, `art.*`). Add `art.map`.
- `app/src/core/tokens.ts:307` -- `Tokens.art`. Add `map`. `app/src/core/timing.ts:29-58` -- Map timing.
- `app/src/content/assets.ts:97-108` -- `MAP_KART`, `MAP_GUIDE`. Add `MAP_AMBIENT` (frame names and anchor ids).
- `app/tools/lint/validate-content.ts:76-79` -- `REQUIRED_FRAMES.map`.
- `app/src/core/map-plan.ts:91-100,142-195,201-221` -- `MapPlan`, `planMap`, `planGuide`, `placeImage`.
- `app/src/core/decoration-plan.ts:1-10` -- the render-at-pivot, draw-elsewhere rule (origin = pivot).
- `app/src/core/map-idle.ts` -- the idle scheduler. Extend it with periodic + busy. Tests: `map-idle.test.ts`.
- `app/src/scenes/Map.ts:367-379` (idle create), `:479` (`update`), `:1118-1139` (`waveGuide` frame loop to copy), `:1328-1356` (`handle`, `ambient`), `:1359` (`invite`).
- `app/tools/layout/rules.ts:68-150` -- `validateLayout`. `app/tools/render/render.ts:63` -- the map rule.
- `app/tools/lint/hint-contrast.ts:7` -- the map ring ellipses (station hit bbox) on the plate.

## Tasks & Acceptance

**Execution:**
- `app/src/core/tokens.ts`, `timing.ts`, `tokens.test.ts`:
  - Add `art.map {road '#EE9F68', roadEdge '#FFFFFF', roadDash '#FFFFFF', water '#BFEFFF', cone…, chimney…}`. Reuse `colors.creatureBlue` / `creaturePink` / `creatureLight` / `iconInk` / `tintPink` for the whale and the ring.
  - Add `ui.mapCloudDriftPxPerMs`, `ui.mapWaveBobPx`.
  - Add `Timing.mapWaveBobMs` (≥ 1000), `fountainFrameMs`, `whaleFirstMs`, `whaleEveryMs`, `whaleSpoutFrameMs`, `whaleSpoutMs`.
  - Assert: `whaleSpoutMs` = spout frames × frame ms; `whaleSpoutMs` < `mapAmbientMinMs`; `whaleFirstMs` > `guideWaveMs`; wave period ≥ 1000.
- `app/tools/render/build.ts` -- Pass `art.map` (hex).
- `app/tools/render/blender/build_map.py`:
  - (a) Recolour `Road` / `RoadEdge` / `Dash` from `art.map`.
  - (b) `DRESSING` table built as in the trial. The fountain becomes `sprite.fountain` (occlude 1, states `{"spray":[1,2,3]}`; builder droplets keyed by CONSTANT scale). The ring is a plate object. The whale becomes `sprite.whale` (occlude 1, states `{"idle":[1],"spout":[2,3,4,5]}`; the spout spheres grow, then fall). Each adds `anchor.fountain` / `anchor.whale` (its ground or water pivot).
  - (c) Detached `sprite.ambient`: `state.cloud` is one `Cl*` cluster re-centred at `CLOUD_AT`, and every `Cl*` leaves the plate. `state.wave` is a small white foam crescent. Add `anchor.cloud-1..3` (top sea band) and `anchor.wave-1..5` (visible sea around the island), each rendered at its `-1` pivot.
  - (d) `LANDMARKS`. New: an ice-cream giant cone and a pizza chimney, procedural with `cute.py` parts, as members of their station sprite, positioned so the hull rules pass. Existing (asserted present, else fail): race `ArchPost*`/`Chk*`, fishing `A_FishGold`, dino `A_DinoNeck`, shadow-match `CaveMouth`, touch-talk `A_House0`.
  - (e) `dressing_check`: every dressing bbox (projected, fountain at its biggest frame, every cloud over its whole drift band) stays ≥ `hitPad` from every station polygon and `hit.shiba` and does not overlap any slot union footprint. Any problem calls `fail()`.
- `app/src/content/assets.ts` + `tools/lint/validate-content.ts` -- `MAP_AMBIENT` {whale: id/idle/spout[4], fountain: id/spray[3], cloud: frame + anchors, wave: frame + anchors}. Add every frame to `REQUIRED_FRAMES.map`. Update the validate-content tests that build `REQUIRED_FRAMES.map` fixtures.
- `app/src/core/map-plan.ts` + test -- `planAmbient`:
  - the whale and fountain images at their anchors (depth = anchor y);
  - the cloud and wave instances: origin = the `-1` pivot, position = each anchor, depth `ambientBackDepth` between the plate and the stations;
  - a missing frame or anchor → skip + warn.
- `app/src/core/map-idle.ts` + test -- Optional `periodic` and `timing.ambientBusyMs`, the event `{kind:'periodic', id}`, a busy window after ambient/periodic, and invites waiting for busy, per the matrix. Absent config = today's behaviour (the existing tests stay green).
- `app/src/core/map-ambient.ts` (new) + test -- Pure `driftX`, `waveBob`, `loopFrame`, `spoutFrame(elapsedMs, frames, frameMs)` (undefined when done), per the matrix.
- `app/src/scenes/Map.ts` -- Wiring only:
  - draw the planned ambient images (no hotspots);
  - `update` advances a clamped ambient clock for clouds, waves and the fountain;
  - `handle` → `periodic` whale → a spout frame loop like `waveGuide`, then idle;
  - pass `periodic` and `ambientBusyMs: Timing.mapAmbientMoveMs` to `createMapIdle`;
  - destroy everything on shutdown;
  - update the header comment.

**Acceptance Criteria:**
- Given `npm run art:build -- map && npm run render -- map && npm run atlas -- map`, when it finishes, then:
  - the build has no CHECK or fail lines;
  - the map layout rules pass;
  - the atlas is 1 page ≤ 2048²;
  - the plate shows the peach road with white edges and dashes, the fountain, the ring, the whale, the cone and the chimney, as in v4.
- Given the Map is idle for 30 s, when watched, then clouds drift, waves bob, the fountain jets loop and the whale spouts periodically, never at the same time as a station bounce or an invitation.
- Given reduced motion, when the Map is idle, then the drift and bob are smaller, the fountain is still, and no zoom or extra motion appears.
- Given the race game, when played, then its road still uses `colors.road` (unchanged).

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 41 findings — high 0, medium 3, low 36, false 2, maybe-false 0
- findings:
  - `[low]` `patch` (blind) compiled .pyc in the change — patched: deleted
  - `[low]` `reject` (blind) clouds jump if reduced motion flips mid-visit — the OS setting rarely changes during a visit; next visit re-bases
  - `[low]` `patch` (blind) busyLeft survives suspend/reset — patched + test
  - `[low]` `reject` (blind) scheduler vs spout clocks drift after a hitch — both bounded by the same 1 s window; worst case a frame early
  - `[low]` `patch` (blind) ambient anchor lists hard-coded in TS and Python — patched: test against the real layout
  - `[low]` `patch` (blind) ambient anchors not gated by validate-content — patched
  - `[low]` `reject` (blind) dressing_check ignores wave bob / road / labels / landmark-vs-hull — bob is a few px inside hitPad; landmarks are part of their station's own hull by design; labels sit on stations
  - `[low]` `reject` (blind) only new landmarks size-checked — the five existing landmarks are unchanged art already accepted
  - `[low]` `patch` (blind) mislabelled whale test — patched: renamed + whale-spout case
  - `[low]` `patch` (blind) "1 Hz" test name — patched: cycle period wording
  - `[low]` `patch` (blind) width source mismatch — patched: layout width
  - `[low]` `reject` (blind) hull points not simplified — layout size is small; hit-test cost negligible
  - `[low]` `reject` (blind) cloud re-centring assumes unparented objects — Cl* spheres are unparented in map-v3.blend
  - `[low]` `patch` (blind) 'Cl' filter matches the empty suffix — patched
  - `[low]` `reject` (blind) clouds/waves ignore perspective — a deliberate flat billboard; sizes read fine in the headless check
  - `[low]` `reject` (blind) build_ring uses bpy.ops / bare KeyError — build-time, fails loudly in the builder
  - `[low]` `reject` (blind) Python hygiene (_part import, unused param, frame reset, missing order) — no behaviour impact
  - `[medium]` `defer` (blind) scene side and Python geometry helpers untested — no scene/Python test harness
  - `[medium]` `defer` (verification-gap) Map ambient/spout wiring untested — no scene harness (filed defer)
  - `[low]` `defer` (verification-gap) dressing_check untested — no Python test path (filed defer)
  - `[low]` `patch` (verification-gap other) .pyc — grouped
  - `[low]` `patch` (verification-gap other) busyLeft / spout not stopped on suspend — grouped
  - `[low]` `patch` (verification-gap other) mislabelled test — grouped
  - `[low]` `patch` (edge) busyLeft on suspend/reset — grouped
  - `[medium]` `patch` (edge) whale keeps spouting during the kart trip — patched: spout stopped on suspend/reset
  - `[low]` `reject` (edge) periodic everyMs ≤ 0 / NaN — values are Timing constants with invariant tests
  - `[low]` `reject` (edge) firstMs NaN — same
  - `[low]` `reject` (edge) road material without BSDF — build-time; the reference scene has it
  - `[low]` `reject` (edge) fountain with no evaluated verts — imported CC0 asset, fixed content
  - `[low]` `reject` (edge) ground ray miss falls back to SLOT_Z — positions are on the island; dressing_check would still flag misplacement
  - `[low]` `reject` (edge) missing 'World' collection — present in map-v3
  - `[low]` `patch` (edge) 'Cl' empty suffix — grouped
  - `[low]` `reject` (edge) parented cloud — grouped with the blind row
  - `[low]` `reject` (edge) cloud plan width 0 pop — the frame always exists (validator now gates it)
  - `[low]` `reject` (edge claim) slot check skipped without decorations — the map build always builds decorations
  - `[low]` `reject` (edge claim) Cl* outside Sky stay — only the Sky clusters cast the dark shadows
  - `[false]` `reject` (intent C) Race keeps grey road — decision recorded: peach would drop the race hint core to ~2.2:1 (< 3:1)
  - `[false]` `reject` (intent D/E) continuous loops not sequenced; spout not reduced — recorded decisions (D1/E1)
  - `[low]` `reject` (intent A/B/F/G) landmark/validator/visual-parity readings — recorded decisions; headless visual check matched v4
  - `[low]` `reject` (intent side effect) cloud shadows removed — accepted difference recorded in the spec
  - `[low]` `reject` (blind) pyc .gitignore — no VCS in this project

## Design Notes

- **Road colour:** map art only. A new `Tokens.art.map.road` is applied to the Blender `Road` material, and `colors.road` stays grey. The race road draws `colors.road` under the white hint core: on grey the core reaches 6.1:1, but on peach #EE9F68 it is about 2.2:1, so race hints would fail. On the map, rings sit on the plate, where the purple line against peach is about 4.2:1 (≥ 3, passes). So the epic's "Đường đua dùng màu mới nếu đổi token" does not apply. `validate:content` re-measures the map plate.
- **Landmarks:** the minimal set is one per station. Only ice-cream and pizza lack a far-readable icon, so only they get new geometry. The other five are asserted, not added. A landmark inside the station sprite grows the hull: keep the cone on the parasol side (away from the fishing hull at x ≥ 270) and the chimney on the left roof (x < 566, under the touch-talk hull). If the hull rules cannot pass, shrink the landmark (still ≥ 60 design px tall) before considering a plate-only landmark.
- **Clouds lose their plate shadows** (the dark sea blobs in v4). Moving clouds over static shadows would look wrong. This is an accepted deviation in the visual check.
- **Fountain clearance:** v4 puts it between slots ice-cream-2 (332, 568) and pizza-1 (544, 586), which is tight. `dressing_check` decides. Shift ≤ 0.6 m or scale 0.4–0.5 if needed.
- The whale sits partly in the bottom dead zone, so it is non-interactive. A tap-to-spout whale is deferred.

## Verification

**Commands:**
- `cd app && npm run art:build -- map && npm run render -- map && npm run atlas -- map` -- expected: exit 0, no `build_map: CHECK`, layout rules OK, atlas 1 page.
- `cd app && npm run check` -- expected: typecheck, lint, vitest (map-idle, map-ambient, map-plan, tokens, reward-choice real-layout, validate-content), tokens:check, validate:content (hint contrast, frames), build and precache all pass.

**Manual checks (if no CLI):**
- Headless visual check: start `npm run dev`, open the Map in headless Chromium at 1024×768 and take a screenshot at t≈0 and t≈10 s, then compare with `render-ban-do-v4.png`. Expected: the same road colour and dressing; the new cone and chimney; clouds moved between the shots; no dressing over a station label or slot. Read the whale spout from a screenshot taken during a `periodic` event.

## Auto Run Result

Status: done

- **Summary:** the map art gets the approved v4 dressing — toy peach road with white edges/dashes (map-only Tokens.art.map; race keeps grey for hint contrast), Tiny Treats fountain and chibi whale as their own animated sprites, a striped swim ring in the plate, drifting cloud and bobbing wave frames, and new landmarks (giant cone at the ice-cream truck, chimney on the pizza shop; the five other stations' landmarks asserted); a builder dressing_check fails the build on any overlap with station hits, the guide or decoration slots; runtime: core/map-idle gains a periodic whale spout and a shared busy window so the spout, ambient bounces and invitations never overlap (spout stopped whenever idle is suspended/reset); core/map-ambient drives drift/bob/fountain loop, reduced motion honoured.
- **Files:** tools/render/blender/build_map.py, tools/render/build.ts (+render.test), core/tokens.ts, core/timing.ts (+tokens.test), content/assets.ts, tools/lint/validate-content.ts (+test), core/map-plan.ts (+test), core/map-idle.ts (+test), core/map-ambient.ts (new, +test), scenes/Map.ts; regenerated map.blend, layout, atlas, bg.
- **Review:** 41 findings — 11 patch entries (1 medium: whale spouting during the kart trip; 10 low), 3 deferred (Map ambient wiring, Python geometry tests), rest rejected with reasons.
- **Follow-up review recommended:** false.
- **Verification:** art:build + render + atlas exit 0 (one atlas page 2047×2010); npm run check exit 0 (1761 tests); headless Chrome: map matches render-ban-do-v4.png, clouds drift, waves bob, fountain loops, spouts at ~14 s never overlap invitations; reduced motion halves drift.
- **Residual risks:** 4 pre-existing builder CHECK lines (shadow-match slot near touch-talk, also present before this story); atlas near its 2048 px limit; whale spout reads small.
