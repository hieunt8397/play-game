---
title: 'Story 1.7 — Kart chạy tới trạm'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'NO_VCS'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-6-nut-nha-va-loa-chong-cham-nham.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-5-man-con-duong-7-tram-nhan-loi-moi-tram-ngu.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-pipeline-hinh-render-blender-atlas-layout.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** On the Map, tapping the awake ice-cream truck only bounces it and reads its name. The kart is a static prop, no game scene exists, and nothing connects a station tap to a game. The MiniGame contract (`MiniGameBase`, `games/registry.ts`), shell-owned transitions (`core/motion`) and `SessionStore.lastStation` do not exist yet, and Stories 1.8–1.10 and Epics 3–4 need all of them.

**Approach:**
- A pure `core/kart-trip` controller turns station and kart taps plus `tick(delta)` into commands. It drives the kart along `paths.road` under the 2 s / 1.5 s cap, re-targets, boosts, and enters the game once the kart has arrived and the game's assets are loaded.
- Map loads the game's registry `assets` while the kart drives. `core/motion` zooms the camera in (or fades under reduced motion). The shell then starts the game scene with `{ level, seed }`, and Map sleeps.
- `MiniGameBase` gives each game a one-terminal-event guard, sets HUD mode `'game'` and turns `hud:home` into `round:abandon`. On a terminal event, Map stops the game, wakes up and parks the kart at `SessionStore.lastStation`.
- `ice-cream` is an empty skeleton scene; the Home button returns from it.

## Boundaries & Constraints

**Always:**
- **Road geometry** (`core/road.ts`, pure). It works on `LAYOUTS.map.paths.road`, an open polyline in design px. It provides:
  - `length`;
  - `project(p) → s`, the arc length of the nearest point;
  - `pointAt(s) → {x,y}`;
  - `dirAt(s, sign) → dx` for facing.
  - Stop of a station = `project(anchors['<id>-stop'])`. Start = `project(anchors['kart-start'])`.
- **Kart** (replaces spec-1-5's kart prop; `createMapProp` stays for Story 2.2):
  - Image: frame `kart/idle/00` of `atlas.map` at scale `1/renderScale`. Its pivot is the centre of the frame's trimmed rect (spriteSourceSize ÷ renderScale), placed on `pointAt(s)`.
  - Depth: the pivot's y, each tick.
  - Facing: mirror with `scaleX` sign = `MAP_KART.artFacing × sign(dx)` of travel. Keep the last facing while parked, and never use `flipX` (it would shift a full-frame sprite).
  - Hit area: a `TapTarget` circle centred on the pivot, `r = components.kart.size/2 + components.kart.hitPad` (72). It follows the kart through `setCircle` each tick.
  - Start position: `lastStation`'s stop when `SessionStore.lastStation` is set, else start. A missing frame warns once and keeps the hit target and the behaviour (AR51).
- **Trip controller** (`core/kart-trip.ts › KartTrip`, pure, injected `capMs()` and `isAwake(id)`):
  - **States:** `parked → departing → driving → arrived → entering`.
  - **Inputs:** `tapStation(id)`, `tapKart()`, `tick(deltaMs)` (clamped to `MAX_TICK_MS` 250), `assetsSettled(id)`, `entered()`.
  - **Commands** returned in order: `bounce{target}`, `say{lineId}`, `setPrompt{lineId}`, `sfx{id}`, `load{gameId}`, `move{x,y,dx}`, `enter{gameId}`.
  - **Awake tap** while `parked`/`departing`/`driving`:
    - bounce, `say` + `setPrompt` the `vo.shell.station-name.<id>` line, and `load{id}` the first time this trip targets that id;
    - from `parked`, go to `departing` for `Timing.stationTapMs`;
    - from `departing`, only the target changes and the timer runs on;
    - from `driving`, a new drive starts from the current `s`, with its duration counted from that tap;
    - re-tapping the current target only bounces and says the name.
  - **Drive duration:** `clamp(|Δs| / ui.kartCruisePxPerMs, Timing.kartDriveMinMs, capMs())`, or 0 when `Δs = 0`. `capMs()` is `kartDriveMaxMs` until the first arrival of the session, then `kartDriveRepeatMaxMs`. Easing is linear in `s`.
  - **Sleeping-station tap** (any state except `entering`): bounce + `sfx.shell.happy` only, as in spec-1-5. The target, the timer and the kart are unchanged.
  - **Kart tap:** bounce + `sfx.shell.kart-beep`. In `driving`, the remaining time is multiplied by `ui.kartBoostTimeScale`. In `parked`/`departing`/`arrived`, nothing else happens.
  - **Arrival:** when the drive ends the state is `arrived`. `enter{id}` is emitted exactly once, when the drive has ended and `assetsSettled(id)` has been seen, in either order. The state becomes `entering`; arrival marks the session's first trip done.
  - **`entering`:** every tap is ignored. `entered()` (after the scene starts) returns the controller to `parked` at that stop.
  - A tap on empty map does nothing, as in spec-1-5. Map's idle clock is still reset by the router's `onAnyTap`.
- **Feedback:** the bounce and the SFX start in the `pointerdown` handler (≤ `Timing.feedbackMaxMs`). Station bounce and the reduced-motion amplitude follow spec-1-5.
- **Idle while travelling:** `core/map-idle.ts` gains `suspend()`, `resume()` (which resets the idle clock and the ambient timer) and `reset()` (a new Map visit: invite count 0).
  - Map suspends idle when the controller leaves `parked` and resumes it on return to `parked`, so the kart is the only prominent motion (UX-DR72).
  - A showing invitation ends on the tap that starts the trip.
- **Game assets** (`content/games/types.ts › GameAssets = { atlases: AtlasRef[]; audio: string[] }`, where `audio` holds voice or catalog ids):
  - `core/game-assets.ts` has a pure `loadPlan(assets, isCached) → LoadCall[]`, which skips cached keys, It resolves audio ids to URLs through `voicePath` or `AUDIO_CATALOG`. It also provides `AssetTracker` (`track(id, keys)`, `fileDone(key)`, `drainSettled() → GameId[]`, where a game is settled once every key is cached or reported failed) and `releasePlan(assets)`.
  - Map runs the plan on its own loader (`load.atlas` / `load.audio`, then `load.start()`) and feeds `filecomplete` / `loaderror` keys to the tracker. An empty plan is settled at once.
  - A failed file gives one `console.warn` and the game still starts (AR51).
  - When the game scene shuts down, Map removes that game's keys from the texture and audio caches (AR39).
- **Enter** (`core/motion.ts`). `enterStation(scene, focus, reduced) → Promise<void>`:
  - Normal: the camera pans to `anchors[id]` and zooms to `ui.cameraZoomScale` over `Timing.cameraZoomInMs`.
  - Reduced (`prefersReducedMotion`): the camera fades out over `Timing.sceneFadeMs`, with no zoom.
  - `revealScene(scene)`: fade in over `sceneFadeMs`.
  - A pure `enterPlan(reduced)` is unit-tested; the Phaser calls stay thin.
- **Starting the game** (Map, wiring only):
  - `SessionStore.lastStation = id`.
  - `data = startData(id, ladderLength, rng)`, which gives `{ level: SessionStore.levelFor(id, ladderLength), seed }`.
  - Stop any running `GameId` scene (at most one MiniGame).
  - `this.scene.manager.start(id, data)`, then `this.scene.sleep()` on Map, then `kartTrip.entered()`.
  - Map's scoped Bus subscriptions stay alive while it sleeps.
- **Return:**
  - On `round:abandon` or `round:complete` from the running game, Map stops that scene, releases its assets and wakes.
  - On `wake`: reset the camera (zoom 1, scroll 0), `revealScene`, `setHudMode('map')`, `idle.reset()`, and park the kart at `lastStation`'s stop.
  - Map writes no resume snapshot and calls no `nextLevel` (Epic 2 and Story 1.10).
- **`SessionStore`** (`core/session-store.ts`, memory only, singleton plus a class for tests): `lastStation?: GameId`, `kartTrips: number`, `levels: Partial<Record<GameId, number>>`, and `levelFor(id, ladderLength)`, which returns `levels[id] ?? 0` clamped to the ladder. Epic 2 adds `resume` and `pendingFlyIns`. A cold start gives a fresh store, so the kart starts at `kart-start`.
- **MiniGame contract:**
  - `games/mini-game-base.ts › abstract class MiniGameBase extends Phaser.Scene`. Its constructor takes a `GameId` key. `init(data: GameStartData)` stores `level`, `seed` and `resume?`.
  - `create()` calls `setHudMode('game')` and `revealScene`. It subscribes `hud:home` through `bus.scoped(this)`. Subclasses implement `build()` and `snapshot(): Snapshot`.
  - Protected `complete(outcome)` and `abandon()` go through `core/round-guard.ts › RoundGuard`. It emits exactly one `round:complete` or `round:abandon {gameId, snapshot}` per start. After that the game is `inert`: input is disabled through `input.enabled = false`, and a second Home tap is ignored.
  - `games/registry.ts`: `GAMES: Partial<Record<GameId, { scene: typeof MiniGameBase subclass; ladder: readonly unknown[]; assets: GameAssets }>>`, built from `content/games/index.ts › GAME_CONTENT`, plus `GAME_SCENES` for `main.ts`.
  - Content stays data-only. `stations[i].awake` must equal `id in GAME_CONTENT`; `content/validate.ts` names the id on a mismatch. Map treats a station as awake only if it is in `GAMES`.
- **Lint** (`src/games/**`): ban the member calls `scene.start|stop|launch|run|switch|sleep|wake` and any `this.load` / `.load.` call. `rules.test.ts` gets cases for both, and the same code in `scenes/` passes.

**Never:**
- No real Tiệm kem gameplay, ladder, HintDirector or drag (Stories 1.8–1.10). No difficulty change, resume snapshot write, decoration, pull-back chain or `PlayAgainOverlay` (Epic 2).
- No `setTimeout`/`setInterval` or Phaser tweens for kart motion; it moves only on `tick(delta)`, so the AudioUnlockOverlay pause freezes it.
- No `this.sound` or audio paths in scenes or games. No hand-entered coordinates. No change to the spec-1-4 layout format.
- No game scene calls `scene.*` navigation or `this.load.*`. No second MiniGame running.
- No writing files that contain backslashes through a shell heredoc. No git.

**Decisions (auto-run defaults):**
- **Map sleeps instead of shutting down.** The shell starts the game through the SceneManager and Map sleeps. Map can then receive the terminal event and come back with the kart already parked. `lastStation` still covers a Map re-create.
- **Return transition in Epic 1** is a fade-in. The camera pull-back belongs to Epic 2's post-round chain.
- **Taps:** a tap on empty map during a drive gives no reaction, consistent with spec-1-5. "Chạm chỗ khác chỉ nảy nhẹ" is met by sleeping stations' bounce. Taps during the ≤ 600 ms `entering` phase are ignored.
- **Level and seed:** in Epic 1 the level lives in `SessionStore.levels` (the epic keeps levels in memory). The seed is `floor(rng() × 2^31)` with an injected `rng` (default `Math.random`).
- **The `ice-cream` skeleton:**
  - `content/games/ice-cream.ts` exports `ladder = [{ id: 'skeleton' }]` and `assets = { atlases: [], audio: [] }`. Story 1.8 replaces both.
  - `games/ice-cream/IceCream.ts` draws only the sky background. Its `snapshot()` is `{ v:1, level, seed, questionIndex: 0, partial: null }`.
  - Game asset keys must not overlap boot keys; a core test checks this against `bootAudio()` / `bootTextures()`.
- **`MAP_KART`** in `content/assets.ts` = `{ frame: 'kart/idle/00', artFacing: 1 }`. Set `artFacing` to −1 if `preview.png` shows the rendered kart facing left.
- **New values:**
  - `Timing.kartDriveMinMs: 400`, `cameraZoomInMs: 600`, `sceneFadeMs: 300`.
  - `Tokens.ui.kartCruisePxPerMs: 0.6`, `kartBoostTimeScale: 0.6`, `cameraZoomScale: 1.8`.
  - SFX `sfx.shell.kart-beep`: a synthesized placeholder two-tone horn, about 200 ms, 50 ms fade-in, peak −20 dBFS.
- **Scene order:** `main.ts` registers `[Boot, Start, MapScene, ...GAME_SCENES, Hud, AudioUnlockOverlay]`, so Hud renders above games.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First trip | parked at start, tap ice-cream | bounce, say + setPrompt name, load; drive starts after 500 ms; ≤ 2000 ms | — |
| Long road | Δs = road length | duration = cap (2000) | — |
| Short hop | Δs 30 px | duration 400 ms | — |
| Same stop | parked at ice-cream stop, tap it | departing, then 0 ms drive, arrived | — |
| Later trip | after the first arrival | cap 1500 | — |
| Re-target | driving, tap another awake id | new drive from current s; duration ≤ cap from the tap; say new name | — |
| Re-tap target | driving, tap the same id | bounce + say only | — |
| Sleeping tap | driving, tap pizza | bounce + happy sfx; kart unchanged | — |
| Kart boost | driving 1000 ms left, tap kart | beep; 600 ms left | — |
| Kart parked | tap kart | bounce + beep; stays parked | — |
| Wait for assets | arrived, not settled | no enter until `assetsSettled` | — |
| Assets first | settled before arrival | enter on arrival tick, once | — |
| Load error | one file fails | counted settled; game starts | console.warn |
| Entering | tap anything | ignored | — |
| Pause | delta 30 000 | treated as 250 | — |
| Reduced motion | `reduce` | fade 300 ms instead of zoom | — |
| Home in game | `hud:home` twice | one `round:abandon`; Map wakes; kart at ice-cream stop | — |
| Complete twice | `complete()` then `abandon()` | one event only | — |
| Cold start | new SessionStore | kart at `kart-start` | — |
| Awake mismatch | `awake: true` without `GAME_CONTENT` | check fails naming the id | exit 1 |

</intent-contract>

## Code Map

- `app/src/scenes/Map.ts` -- planned in spec-1-5/1-6: the island, the tap router, the kart prop, idle `update`, the Hud launch and `setHudMode('map')`. The kart prop is replaced by the kart, and trips, loading, enter and return are added.
- `app/src/core/map-idle.ts` (+ test) -- planned in spec-1-5. Add `suspend`, `resume` and `reset`.
- `app/src/core/input/{tap-router,tap-target,hotspot-polygon}.ts` -- planned in spec-1-5/1-6. `createTapTarget(...).setCircle` is used for the moving kart.
- `app/src/core/hud-mode.ts` -- planned in spec-1-6: `setHudMode`. `scenes/Hud.ts` already emits `hud:home` and says `vo.shell.home`.
- `app/src/core/reduced-motion.ts`, `app/src/core/hint-visuals.ts`, `app/src/core/ui/map-prop.ts` -- planned in spec-1-5.
- `app/src/content/layouts.ts`, `assets.ts`, `stations.ts` -- planned in spec-1-4/1-5: `paths.road`, `anchors['<id>-stop'|'kart-start']`, `ATLASES.map`, `awake`.
- `app/src/core/boot-load.ts` -- `bootAudio()` exists; `bootTextures()` is planned in spec-1-5.
- `app/src/core/bus.ts` -- `round:complete`, `round:abandon` and `hud:home` exist; `hud:mode` is planned in spec-1-6.
- `app/src/content/types.ts` -- `GameId`, `Snapshot`, `RoundOutcome`. Add `GameStartData`.
- `app/src/core/timing.ts` -- `stationTapMs`, `kartDriveMaxMs` and `kartDriveRepeatMaxMs` exist. `app/src/core/tokens.ts` -- `ui`. `tokens.generated.ts` -- `components.kart {size 96, hitPad 24}`, `tappableProp.react`.
- `app/src/content/audio-catalog.ts`, `app/tools/audio/make-placeholders.ts` (+ test) -- the new SFX.
- `app/src/main.ts` -- the scene list. `app/eslint.config.js`, `app/tools/lint/rules.test.ts` -- the games rule; the existing games import bans already allow `../mini-game-base`.

## Tasks & Acceptance

**Execution:**
- `app/src/core/timing.ts`, `app/src/core/tokens.ts` -- add the new values.
- `app/src/content/audio-catalog.ts`, `app/tools/audio/make-placeholders.ts` (+ test) -- `sfx.shell.kart-beep`. Generate it with `npm run audio:placeholders`.
- `app/src/content/types.ts`, `app/src/content/games/types.ts`, `ice-cream.ts`, `index.ts`, `app/src/content/assets.ts` -- `GameStartData`, `GameAssets`/`AtlasRef`, the skeleton content, `GAME_CONTENT`, `MAP_KART`.
- `app/src/content/validate.ts` (+ test) -- the awake ⇔ `GAME_CONTENT` rule, plus a check that game audio ids exist in the voice lines or the catalog.
- `app/src/core/session-store.ts` (+ test) -- the store, `levelFor` and `startData`.
- `app/src/core/road.ts` (+ test) -- polyline maths, with projection onto interior, end and corner points.
- `app/src/core/kart-trip.ts` (+ test) -- the controller. Every trip row of the matrix, with fake caps and awake sets.
- `app/src/core/game-assets.ts` (+ test) -- `loadPlan`, `AssetTracker` and `releasePlan`, plus the no-overlap check against the boot keys.
- `app/src/core/round-guard.ts` (+ test) -- the terminal-once guard and `inert`.
- `app/src/core/motion.ts` (+ test for `enterPlan`) -- `enterStation` and `revealScene`.
- `app/src/core/map-idle.ts` (+ test) -- `suspend`, `resume` and `reset`.
- `app/src/games/mini-game-base.ts`, `app/src/games/registry.ts`, `app/src/games/ice-cream/IceCream.ts` -- the contract, the registry and the skeleton.
- `app/eslint.config.js`, `app/tools/lint/rules.test.ts` -- the games navigation and load ban.
- `app/src/scenes/Map.ts` -- the kart, the trip wiring in `update`, the loader and tracker, enter and start, return on terminal events, `wake` handling, and idle suspend/resume.
- `app/src/main.ts` -- the scene list with `GAME_SCENES`.

**Acceptance Criteria:**
- Given a fresh `npm run dev` with the kart parked at its start, when the child taps the ice-cream truck, then it bounces and "Xe kem" plays, and after about 0.5 s the kart drives along the road to the truck in at most 2 s. The camera zooms in and an empty ice-cream screen with the Home and Speaker buttons appears.
- Given the kart driving, when the child taps the pizza shop, then the shop bounces with a happy sound and the kart keeps its course. When the child taps the kart, it beeps and visibly speeds up. When the child taps the Speaker, the name replays.
- Given the ice-cream screen, when the child taps Home, then "Về đảo nào!" plays, the island fades back with the kart parked at the truck, and the next trip there is capped at 1.5 s. After a page reload, the kart is back at its start.
- Given DevTools `prefers-reduced-motion: reduce`, when the kart arrives, then the screen fades instead of zooming.
- Given a temporary `this.scene.start('Map')` or `this.load.image(...)` in `games/ice-cream/IceCream.ts`, when running `npm run lint`, then it fails.

## Spec Change Log

- **2026-10-08: `MAP_KART.artFacing = -1`.** The rendered frame `app/.generated/render/map/frames/kart/idle/00.png` shows the kart's nose and driver facing down-left, towards the camera. A drive to the right therefore mirrors it (checked in a headless-Chrome screenshot).
- **2026-10-08: the kart pivot y is the ground point.** The pivot x is the centre of the trimmed rect, as specified. The pivot y is `anchor.kart-start`'s y (where the frame was rendered), not the rect centre. Placed on `pointAt(s)`, the kart then sits on the road exactly as rendered, and its depth is its ground y like the stations. Without that anchor the rect centre is used. The hit circle (r 72) is centred on the visible centre (`PlannedKart.centerOffset`, about 12 px above the pivot).
- **2026-10-08: the kart is a Container holding the image.** `scale-motion › bounce` tweens `scale`, which would reset the mirrored `scaleX`. The bounce now runs on the container, and the facing mirror stays on the image.
- **2026-10-08: a station drawn in front of the kart keeps its taps.** `createTapTarget` gained an optional `excludes(p)`. The kart's target excludes points inside the hit polygon of a station with a greater depth. Reason: the ice-cream stop lies behind the truck, so the parked kart's 72 px circle covered the top of the truck, and a tap there beeped instead of going back in. The kart still registers last, so it wins over stations behind it.
- **2026-10-08: facing keeps on near-vertical stretches.** `move.dx` is 0 (keep facing) when |dx| < `FACING_MIN_DX` 0.25, so the kart does not flip on the race loop's near-vertical bend. The facing comes from the segment just travelled.
- **2026-10-08: an awake tap while `arrived`** (the kart has arrived, assets still loading) only bounces and says the name. The spec lists awake taps only for parked/departing/driving.
- **2026-10-08: `KartTrip` gets `nameLine` and `onArrive` options and a `parkAt(s)` method.** `onArrive` lets Map count `SessionStore.kartTrips`, which drives `capMs()`. `parkAt` places the kart on wake.
- **2026-10-08: `games/registry.ts` also exports `isGameId` and `ladderLength(entry)`.** `ladderLength` follows spec-cross-notes (4.5) from the start, and Map uses it for `startData`.
- **2026-10-08: `MiniGameBase.complete` takes the outcome without `gameId`**, and the guard adds it. `init` accepts a partial data object (defaults: level 0, seed 0). The stored resume is `resumeAt`, so it does not shadow Phaser's `Scene.resume`.
- **2026-10-08: `vite.config.ts` includes `src/games/**/*.test.ts`.** The new `games/registry.test.ts` stubs Phaser's `Scene` with `vi.mock` to test the registry and the MiniGame contract (home twice → one abandon, inert input). Test files under `scenes/`/`games/` are exempt from the literal-ban block, as they already are elsewhere.
- **2026-10-08: the games lint is a separate, merged `no-restricted-syntax` block.** It holds the literal, audio and pointer bans plus `NO_GAME_NAV`, applied to `src/games/**` only (flat config would otherwise override one block with the other). Navigation calls are matched on an object named `scene` or `manager`, or a `.scene`/`.manager` member. `this.load` and any `.load.` member are banned.
- **2026-10-08: fades go to the sky colour** (`Tokens.colors.sky`) instead of black.

## Review Triage Log

## Design Notes

**Why a pure controller fed by `tick`:** cap maths, re-target, boost and the "arrived ∧ settled" gate are timing logic that Vitest can cover only without Phaser. `Map.update` just applies commands:

```ts
update(_: number, delta: number): void {
  for (const c of this.trip.tick(delta)) this.apply(c);   // move → kart.setPosition/scaleX/depth + target.setCircle
  for (const id of this.tracker.drainSettled()) this.applyAll(this.trip.assetsSettled(id));
}
```

**Why sleep/wake:** AD-1 has Map own the post-round chain, which needs Map alive while the game runs. Sleeping keeps its state and scoped subscriptions, stops its `update` (so idle and the kart freeze) and deactivates its router for InputGuard.

## Verification

**Commands:**
- `cd app && npm run audio:placeholders` -- expected: `sfx.shell.kart-beep.m4a` is written.
- `cd app && npm run check` -- expected: exit 0. Vitest covers every matrix row; the lint rule tests pass.
- `cd app && npm run build` -- expected: exit 0.

**Manual checks:**
- Run each AC walkthrough in `npm run dev` with 1180×820 touch emulation. Also check that the kart faces its direction of travel, stays on the road, and is drawn behind or in front of stations by its y.
- Under DevTools CPU throttling ×4, the drive still ends within the cap. Tapping the Speaker during a drive replays without stopping the kart.

## Auto Run Result

**Status:** in-review. `cd app && npm run check` exits 0: 40 test files, 485 tests (after the review fixes). `validate:content` reports "7 game ids, 5 audio ids, 10 voice lines, 1 layout(s) with 7 stations, 1 atlas(es), 30 asset files". `npm run build` exits 0.

**Summary:**
- A tap on the awake ice-cream truck now bounces it and says the name, and the kart drives along `paths.road` to the truck's stop. The drive is capped at 2 s, then 1.5 s for later trips. On arrival the camera zooms in (a fade under reduced motion), and the empty ice-cream scene starts with Home and Speaker.
- Home returns: one `round:abandon` is emitted, Map stops the game, releases its assets and wakes. The island fades back with the kart parked at the truck.
- New pure core:
  - `road`: polyline arc-length maths;
  - `kart-trip`: the trip state machine;
  - `game-assets`: `loadPlan`, `AssetTracker` and `releasePlan`;
  - `round-guard`, `motion` and `session-store`;
  - `map-idle`: `suspend`, `resume` and `reset`.
- The MiniGame contract is in place: `MiniGameBase`, `games/registry.ts`, the `ice-cream` skeleton and `content/games`. ESLint bans navigation and loading in games.

**Files changed:**
- `app/src/core/timing.ts`, `app/src/core/tokens.ts`: the new Timing and `ui` values.
- `app/src/content/audio-catalog.ts`: `sfx.shell.kart-beep`.
- `app/tools/audio/make-placeholders.ts` (+ test): the two-tone horn.
- `app/public/assets/audio/sfx/sfx.shell.kart-beep.m4a` (binary): generated; the same run rewrote the other placeholders.
- `app/src/content/types.ts`: `GameStartData`.
- `app/src/content/games/{types,ice-cream,index}.ts`: `GameAssets`, `GameContent`, the skeleton content and `GAME_CONTENT`.
- `app/src/content/assets.ts`: `MAP_KART` (artFacing −1).
- `app/src/content/validate.ts` (+ test), `app/tools/lint/validate-content.ts`: the awake ⇔ `GAME_CONTENT` rule and `validateGames` (game audio ids must exist).
- `app/src/core/session-store.ts` (+ test): `SessionStore`, `levelFor`, `startData` and the `session` singleton.
- `app/src/core/road.ts` (+ test): `createRoad`, plus a test against the real map road.
- `app/src/core/kart-trip.ts` (+ test): `KartTrip`, covering every trip row of the matrix.
- `app/src/core/game-assets.ts` (+ test): `loadPlan`, `AssetTracker`, `releasePlan`, and the no-overlap test against the boot keys.
- `app/src/core/round-guard.ts` (+ test), `app/src/core/motion.ts` (+ test).
- `app/src/core/map-idle.ts` (+ test): `suspend`, `resume`, `reset`.
- `app/src/core/map-plan.ts` (+ test): the kart is planned as `PlannedKart` instead of a prop.
- `app/src/core/input/tap-target.ts` (+ `input.test.ts`): the optional `excludes`.
- `app/src/games/mini-game-base.ts`, `registry.ts`, `registry.test.ts`, `ice-cream/IceCream.ts`: the contract, the registry and the skeleton.
- `app/eslint.config.js`, `app/tools/lint/rules.test.ts`: `NO_GAME_NAV` in a games-only block, plus ban and allow cases.
- `app/vite.config.ts`: the test include adds `src/games/**`.
- `app/src/scenes/Map.ts`: the kart, the trip wiring, the loader and tracker, enter and start, return on terminal events, `wake`, and idle suspend/resume.
- `app/src/main.ts`: `[Boot, Start, MapScene, ...GAME_SCENES, Hud, AudioUnlockOverlay]`.

**Verification:**
- `npm run audio:placeholders` (with `FFMPEG_BIN`) wrote `sfx.shell.kart-beep.m4a`.
- `npm run check`: exit 0, 484 tests.
- `npm run build`: exit 0.
- Smoke test in headless Chrome at 1180×820 against `vite preview`, with CDP touch emulation and a script kept outside the project:
  - Start → Chơi → tap the truck. At 0.9 s the kart is on the road heading right (mirrored).
  - A tap on the sleeping pizza shop did not change the kart's course.
  - At about 3.5 s the empty sky scene shows with Home and Speaker.
  - Home → the island is back with the kart parked at the truck's stop, drawn behind the truck by depth.
  - A tap on the top of the truck went to the truck, not the parked kart: the zoom ran and the game started again.
  - The same run with `prefers-reduced-motion: reduce` reached the game and returned.
  - No exceptions were logged.

**Residual risks:**
- The ice-cream stop lies behind the truck, so the parked kart is mostly hidden. This is correct by depth but hard to see. Moving `anchor.ice-cream-stop` is a layout change for a later story.
- `enterGame` awaits a camera event. If the camera effect never completes (for example the tab stays hidden), the game starts only once it does.
- The game asset load and release paths run against an empty asset list today. Story 1.8 is the first to load real files through them.
- The beep and the drive feel have not been checked by ear or on a device.

**Review fixes (2026-10-09):**
- [medium] A file that downloads but fails processing (undecodable audio, bad atlas JSON, corrupt PNG) emits neither `filecomplete` nor `loaderror` in Phaser 4.2.1. The tracker then waited forever and the kart stayed `arrived`.
  - New `AssetTracker.flushPending()` settles every waiting game and returns the stuck keys.
  - Map listens to the loader's `complete` event and calls it, with one `console.warn` per key.
  - New tracker test: complete arrives with keys still pending.
- [low] A trip re-targeted from A to B never released A's assets.
  - Map now records the games it loaded this visit (`loadedGames`).
  - When a game shuts down, Map releases that game and every other recorded game that is neither running nor the current trip target, through the new `releaseAssets(id)`.
- Files: `app/src/core/game-assets.ts`, `app/src/core/game-assets.test.ts`, `app/src/scenes/Map.ts`.
- `npm run check` exits 0 (40 files, 485 tests), and `npm run build` exits 0.

**Manual checks still due:**
- The AC walkthroughs in `npm run dev` with 1180×820 touch emulation:
  - the beep and the speed-up on a kart tap;
  - the Speaker replaying the name without stopping the kart;
  - the zoom, and the fade under reduced motion;
  - the 1.5 s cap on the second trip;
  - the kart back at start after a reload.
- DevTools CPU throttling ×4: the drive still ends within the cap.
- Listen to `sfx.shell.kart-beep`.
