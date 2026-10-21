---
title: 'Story 2.3 — Chuỗi sau lượt trên bản đồ – lưu độ khó, camera lùi, trang trí bay vào'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'NO_VCS'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-kart-chay-toi-tram.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-tiem-kem-luot-3-5-cau-do-kho-tang-dan.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-progressstore-luu-ben-vung-nho-do-kho.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-danh-muc-trang-tri-o-tren-dao-reward-service.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** After Stories 2.1 and 2.2, a finished Tiệm kem round saves the new level and the decoration. The return to the island is still spec-1-7's plain fade, though:
- the new decoration simply appears, because 2.2's `syncDecorations` on `wake` draws it statically;
- `SessionStore.pendingFlyIns` is filled but never drained;
- station taps during the return are not handled;
- there is no `onChainEnd` hook for Story 2.4's overlay.

**Approach:**
- A pure `core/post-round-chain` runner owns the single awaited sequence:
  1. `setDifficulty`.
  2. Clear resume.
  3. Stop the game and wake Map.
  4. Pull the camera back.
  5. Fly in each pending item.
  6. End through `onChainEnd`.
- The runner also queues station taps that arrive during the chain.
- A pure `core/fly-in` plan describes the fly-in, balloon, sparkle and reduced-motion fade timelines. `core/ui/decoration-fly.ts` plays them with scene tweens.
- `core/motion` gains `pullBack`.
- Map wires all of this for `round:complete`, for `round:abandon` with pending items, and for a Map `create` with pending items.

## Boundaries & Constraints

**Always:**
- **Runner** (`core/post-round-chain.ts › PostRoundChain`, pure, all effects injected):
  - **Start:** `start({ kind: 'complete' | 'abandon', gameId, outcome?, startedLevel? }) → Promise<void>`. It runs steps 1–3 synchronously, before its first `await`.
    1. Only for `complete`: `deps.setDifficulty(gameId, nextLevel(startedLevel, outcome, ladderLength))`. This replaces spec-2-1's direct call in Map's handler.
    2. Only for `complete`: `deps.clearResume(gameId)`.
    3. `await deps.stopGameAndWake()`. It is a no-op that resolves at once when no game is running (the `create` path). It resolves on Map's `wake` event.
    4. `await deps.pullBack(focusId)`.
    5. **Fly-ins:** take a copy of `deps.pending()`. Item `i` starts after `i × Timing.flyInStaggerMs` via `deps.wait`, and `deps.flyIn(entry)` plays it. When an item resolves, that same object is removed from the live `SessionStore.pendingFlyIns`. The runner awaits all items. Entries added while the chain runs stay in `pendingFlyIns` for the next return.
    6. `deps.end({ kind, gameId, queuedStation })`.
  - **`active`:** true from `start` until `end`. A second `start` while active warns and is ignored.
  - **`queueTap(id)`:** stores the last id; any earlier queued tap is dropped.
  - **Timing log (dev only):** `deps.now()` is read at `start` and at `end`. In a dev build the runner logs `post-round: <kind> <gameId> → onChainEnd <ms> ms`.
  - **Pause:** `deps.wait` and every animation run on scene `time` and tweens, so the `AudioUnlockOverlay` `scene.pause()` freezes the chain mid-step, and it continues on resume. No `setTimeout` is used anywhere.
- **Map wiring:**
  - **`round:complete`** for the running game → `chain.start({ kind:'complete', gameId, outcome, startedLevel })` (`startedLevel` from spec-2-1).
  - **`round:abandon`:**
    - If `pendingFlyIns` is non-empty, `chain.start({ kind:'abandon', gameId })`.
    - Otherwise keep spec-1-7's fade return unchanged, with no chain.
    - Either way there is no `setDifficulty` and no resume change. Snapshots are Story 2.5.
  - **`create`** with a non-empty `pendingFlyIns` (Map was stopped, Epic 4) → `chain.start({ kind:'abandon', gameId: pending[0].slot.stationId })`.
  - **Pull-back focus** is `gameId`. The kart stays parked at `lastStation` (spec-1-7).
- **`wake` while `chain.active`:**
  - Skip spec-1-7's camera reset and `revealScene`; `pullBack` owns the camera.
  - Call `syncDecorations({ hold })`, where `hold` = the `slotId`s of the pending entries. A held slot keeps whatever sprite it has now (the old item, or nothing) and gets no new sprite.
  - `idle.reset()` then `idle.suspend()`, so no ambient, invite or bob runs during the chain (UX-DR72).
  - `setHudMode('map')` and park the kart, as before.
- **`pullBack(scene, focus, reduced)`** (`core/motion.ts`, pure `pullBackPlan(reduced)`):
  - **Normal:** set the camera at once to zoom `ui.cameraZoomScale`, centred on `anchors[focus]`. Then zoom to 1 and pan to the island centre (scroll 0) over `Timing.cameraPullBackMs`, with an ease-out.
  - **Reduced:** camera at zoom 1, scroll 0, then `revealScene` (fade in over `sceneFadeMs`).
- **Fly-in plan** (`core/fly-in.ts › flyInPlan({ from, to, hasOld, reduced })`, pure, values only from Tokens/Timing):
  - **Normal:**
    - **New item:** it starts at `from` = `anchors[stationId]` at scale `ui.flyInStartScale` and depth above every sprite.
      - It moves along a quadratic arc, peaking `ui.flyInArcPx` above the straight line, to `to` (the slot's draw position from 2.2's `planDecorations`), with an ease-out. Over the same `flight = decorationFlyInMs − flyInLandMs` it scales to 1.
      - Then it bounces `1 → ui.flyInLandScale → 1` over `flyInLandMs`, and its depth becomes the slot depth.
    - **Old item** (`hasOld`): from t=0 it rises `ui.balloonRisePx` while alpha goes 1→0 over `balloonOutMs`, then it is destroyed. It overlaps the new item's flight, so the old one has left the slot before the new one lands.
    - **Sparkles:** `ui.sparkleCount` small stars in `components.decorationItem.sparkle`, at fixed angles evenly spaced around `to`, start at t = flight/2. Each drifts outward by `ui.sparkleSpreadPx` while its alpha falls monotonically 1→0, and it is gone by `decorationFlyInMs`. They never blink.
  - **Reduced:** no movement and no sparkles.
    - With an old item: the old item's alpha goes 1→0 over [0, ½·decorationFlyInMs], then the new item's alpha goes 0→1 over [½, 1]·decorationFlyInMs, both in place.
    - Without one: the new item fades in over [0, 1]·decorationFlyInMs.
  - **Total:** every timeline ends at or before `decorationFlyInMs`.
- **`flyIn(entry)` in Map** (Phaser player `core/ui/decoration-fly.ts › playFlyIn(scene, plan, sprites)`):
  - Run `planDecorations([entry.slot], …)` from 2.2. If it skips the entry (unknown id, missing frame or no anchor), it warns once there and resolves at once.
  - **Old sprite:** the sprite already at that slot. If there is none and `entry.replaced` is set, a temporary sprite of `replaced.decorationId` is created at the slot. If there is neither, there is no balloon.
  - **On land:** `audio.sfx('sfx.shell.happy')` once. The new sprite is handed to Map's decoration registry under `slotId + seq`, together with 2.2's z −1 tap target, so the final `syncDecorations()` at chain end is a no-op for it.
- **Taps during the chain:**
  - The Map router resolves hits through a new `createTapRouter` option `toWorld(p)` (default: identity). Map passes `p => cameras.main.getWorldPoint(p.x, p.y)`, so taps hit what the child sees while zoomed.
  - A station tap calls `chain.queueTap(id)`. It shows no reaction and starts no trip.
  - Kart taps and decoration taps are ignored.
  - The Hud Speaker is untouched. It works throughout through `speakerReplay` / `audio.replayPrompt()` and never awaits or affects the chain.
- **End:**
  - `syncDecorations()` with no hold.
  - `idle.resume()`.
  - Then, if `queuedStation` is set, `applyAll(trip.tapStation(queuedStation))`: bounce, name or happy sound, and a drive exactly as for a live tap. `onChainEnd` is not called.
  - Otherwise call `this.onChainEnd(end)`.
- **`onChainEnd` hook:** `onChainEnd: (e: ChainEnd) => void` is a public Map field, `ChainEnd = { kind, gameId }`. Its default in this story returns Map to "Mời chơi": `idle.reset()`. Story 2.4 replaces it and opens the overlay only for `kind === 'complete'` and non-`touch-talk`.
- **`SessionStore`** gains `resume: Partial<Record<GameId, Snapshot>>` (empty; Story 2.5 writes it) and `clearResume(id)`.

**Never:**
- No `PlayAgainOverlay`, no voice line, no praise, no confetti, and no new music. No snapshot write or resume start (Stories 2.4–2.5).
- No grant, no `ProgressStore` decoration write, and no change to `grantDecoration` or reward-service. Map never grants.
- No `setTimeout`/`setInterval`, no wall clock outside the dev timing log, and no magic numbers in scenes.
- No blinking or any flash faster than 1 Hz. No second prominent motion during a fly-in.
- No new art, layout fields or atlas frames. No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **Budget:** `Timing.cameraPullBackMs: 1200` (≤ `cameraPullBackMaxMs`). With `decorationFlyInMs` 1000, one item takes 2200 ms, leaving about 300 ms of frame slack under the 2500 ms limit from `round:complete` to `onChainEnd`. A token test asserts `cameraPullBackMs ≤ cameraPullBackMaxMs` and `cameraPullBackMs + decorationFlyInMs ≤ roundEndToOverlayMaxMs − roundCelebrationMs`.
- **New values:**
  - `Timing.flyInStaggerMs: 300`, `flyInLandMs: 200`, `balloonOutMs: 600`.
  - `Tokens.ui.flyInStartScale: 0.5`, `flyInArcPx: 90`, `flyInLandScale: 1.08`, `balloonRisePx: 140`, `sparkleCount: 5`, `sparkleRadiusPx: 6`, `sparkleSpreadPx: 48`.
- **Queued taps give no immediate feedback.** The AC says the chain must not be cut and only the last tap applies (bounce + name at the end), so this deliberately departs from NFR5 during the ≤ 2.5 s chain. The Speaker still gives instant feedback.
- **Abandon with no pending items keeps the fade return.** The camera pull-back marks "something new on the island", and a Home tap has nothing new to show.
- **The landing sound reuses `sfx.shell.happy`.** It is the existing "tiếng vui", and no new asset is needed.
- **Dev hook:** `core/dev-hooks.ts › installDevHooks(game)`, called from `main.ts` only when `import.meta.env.DEV`, exposes `window.bhcDev.flyInTouchTalk()`. It emits `reward:earned { gameId:'touch-talk' }`, then restarts Map, which exercises the `create` + abandon path.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Complete | `round:complete` L1, 4/4 first try; 1 pending (empty slot) | `setDifficulty('ice-cream',2)` and `clearResume` before the first await; then stopGameAndWake → pullBack → flyIn → pending empty → `onChainEnd({complete})` | — |
| Order | fakes record calls | exact order 1→6; `end` after every flyIn resolved | — |
| Replace | pending has `replaced:{parasol}`, slot sprite exists | that sprite balloons and is destroyed; new lands; only the new sprite remains at the slot | — |
| Replace, no sprite | fresh Map (`create` path), `replaced` set | a temporary old sprite is created, then balloons | — |
| Abandon + pending | `round:abandon`, 2 touch-talk pending | no `setDifficulty`/`clearResume`; items start at 0 and 300 ms; `end({abandon})`; default hook only resets idle | — |
| Abandon, none pending | `round:abandon`, `[]` | spec-1-7 fade return; no chain | — |
| Queued taps | taps pizza, then ice-cream mid-chain | no reaction; at end `trip.tapStation('ice-cream')`; `onChainEnd` not called | — |
| Kart/deco tap | mid-chain | ignored | — |
| Re-entry | `start` while active | ignored | console.warn |
| Skipped entry | pending `decorationId` not in the catalogue | resolves at once; removed from pending | 2.2 warn |
| Pause | scene paused mid-flight | no progress; resumes at the same point | — |
| Kill mid-flight | fresh `SessionStore`, same storage | `pendingFlyIns` empty; item static at its slot; level already new | — |
| Plan total | every plan variant | each ends ≤ `decorationFlyInMs`; sparkle alpha non-increasing | — |
| Reduced | `reduce` | fade camera; old out over [0, 500], new in over [500, 1000] ms; no sparkles | — |
| Pull-back plan | normal / reduced | zoom `cameraZoomScale`→1 over 1200 ms / fade 300 ms | — |
| Tap while zoomed | zoom 1.8 at the ice-cream anchor | `toWorld` maps the design point to the station seen on screen | — |

</intent-contract>

## Code Map

- `app/src/core/post-round-chain.ts` (new, + test) -- `PostRoundChain`, `ChainEnd` and `ChainDeps`, with `nextLevel` from `core/difficulty.ts` (spec-1-10).
- `app/src/core/fly-in.ts` (new, + test) -- the pure `flyInPlan`. `app/src/core/ui/decoration-fly.ts` (new) -- `playFlyIn` with scene tweens and Graphics stars.
- `app/src/core/motion.ts` (+ test) -- planned in spec-1-7 (`enterStation`, `revealScene`, `enterPlan`). Add `pullBack` and `pullBackPlan`.
- `app/src/core/timing.ts`, `app/src/core/tokens.ts` (+ `tokens.test.ts`) -- real. `cameraPullBackMaxMs`, `decorationFlyInMs`, `roundCelebrationMs` and `roundEndToOverlayMaxMs` exist; `ui` exists. `components.decorationItem.sparkle` is real in `tokens.generated.ts`.
- `app/src/core/session-store.ts` (+ test) -- planned in spec-1-7, changed by 2.1 and 2.2 (`pendingFlyIns`). Add `resume` and `clearResume`.
- `app/src/core/input/tap-router.ts` (+ test) -- planned in spec-1-5/1-6. Add the `toWorld` option.
- `app/src/core/decoration-plan.ts` -- planned in spec-2-2 (`planDecorations`). Used unchanged.
- `app/src/core/map-idle.ts` -- `suspend`, `resume` and `reset` (spec-1-7). `app/src/core/kart-trip.ts` -- `tapStation` (spec-1-7).
- `app/src/scenes/Map.ts` -- planned in spec-1-5/1-7/2-2. Terminal-event handlers, `wake`/`create`, `syncDecorations({hold})`, the decoration registry, the router `toWorld`, and the `onChainEnd` field.
- `app/src/core/dev-hooks.ts` (new), `app/src/main.ts` -- the dev-only hook.
- `app/src/core/bus.ts`, `app/src/content/types.ts` -- real: `round:*`, `reward:*`, `Snapshot`, `RoundOutcome`. `GrantResult` comes from spec-2-2. Unchanged.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/core/timing.ts`, `app/src/core/tokens.ts`, `app/src/core/tokens.test.ts` -- the new values and the two budget assertions.
- [x] `app/src/core/session-store.ts` (+ test) -- `resume: {}` on a fresh store; `clearResume` removes only that id.
- [x] `app/src/core/fly-in.ts` (+ test) -- the plan for normal, replace and reduced. Tests cover the totals, the arc peak, the land bounce, the balloon overlapping and ending before land, sparkle angles and monotonic alpha, and reduced crossfade windows.
- [x] `app/src/core/motion.ts` (+ test) -- `pullBack` and `pullBackPlan`.
- [x] `app/src/core/post-round-chain.ts` (+ test) -- every runner row of the matrix with fake deps and a fake `wait` clock. Also test that `setDifficulty` has been called synchronously when `start` returns its promise, and that a stagger of 3 items gives starts at 0, 300 and 600 ms.
- [x] `app/src/core/input/tap-router.ts` (+ test) -- with `toWorld`, a point is hit-tested after the transform; the default is unchanged.
- [x] `app/src/core/ui/decoration-fly.ts` -- the thin player: tweens on `scene.tweens`, sparkle Graphics, old-sprite handling and hand-over.
- [x] `app/src/scenes/Map.ts` -- wiring as in Boundaries. Remove the direct `setDifficulty` call from the `round:complete` handler (it moves into the runner).
- [x] `app/src/core/dev-hooks.ts`, `app/src/main.ts` -- `installDevHooks` behind `import.meta.env.DEV`.

**Acceptance Criteria:**
- Given a fresh `npm run dev`, when the child finishes a Tiệm kem round:
  - Shiba celebrates for about 1.5 s, then the island appears zoomed on the truck and pulls back smoothly with the kart parked at the truck.
  - The parasol then flies from the truck in an arc to its slot, lands with a slight bounce and a happy sound, and small yellow stars fade around it.
  - Other stations stay still during this.
  - The console shows `post-round: complete ice-cream → onChainEnd <ms> ms` with ms ≤ 2500.
  - The island then returns to "Mời chơi", and an invitation comes after about 8 s idle. There is no confetti and no praise voice.
- Given all three ice-cream slots are full, when a fourth round ends, then the parasol in slot 1 rises and fades like a balloon while the sundae flies in to the same spot. Afterwards slot 1 shows only the sundae.
- Given the chain is running, when the child taps the pizza shop and then the ice-cream truck, then nothing reacts until the fly-in ends. Then the truck bounces, "Xe kem" plays and the kart drives there. When the child taps the Speaker mid-chain, the last line replays and the chain continues unchanged.
- Given DevTools `prefers-reduced-motion: reduce`, when a round ends, then the island fades in without zoom and the new item fades in at its slot (a replaced item fades out first). The logged time is ≤ 2500 ms.
- Given the chain is mid-flight, when the tab is hidden and shown so that `AudioUnlockOverlay` appears, then the flight is frozen, and after the tap it continues from where it stopped. Given the page is reloaded mid-flight, when ▶ is tapped, then the item stands statically at its slot, with no flight, and the next round starts at the new level.
- Given `window.bhcDev.flyInTouchTalk()` in the dev console, when it runs, then Map pulls back and the fire truck flies to `touch-talk-1`. No overlay hook path other than the default runs, and the difficulty is unchanged.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | verification-gap, blind | Map's terminal-event routing (`round:complete` guard and `startedLevel`/`outcome` hand-off, abandon with vs without pending) untested; `PostRoundChain.start` silently skips `setDifficulty` when a field is missing | medium | Scenes are outside the Vitest include; dropping `startedLevel` at Map.ts:284 stops all level saves with every test green | patch |
| 2 | verification-gap, blind, edge | `persistRoundLevel` is now dead and its "Map on round:complete" tests guard nothing | low | grep: no production caller; tests exercise the dead helper | patch (with #1) |
| 3 | verification-gap, blind | `playFlyIn` (decoration-fly.ts) has no test | medium | No test imports it; a wrong final scale or a leaked sparkle sprite stays green | patch |
| 4 | blind, edge | Two pending grants for the same slot animate badly (a temporary sprite of the still-flying item balloons; both land) | medium | touch-talk has 1 slot since 2.2 loop 1b and can earn several items per visit (Epic 4); the item-2 flight starts 300 ms into item 1 | patch |
| 5 | edge | `endChain`'s final `syncDecorations()` draws grants added mid-chain statically, so their fly-in never plays | low | Contradicts "entries added while the chain runs stay pending for the next return"; one-line fix (hold pending slots) | patch |
| 6 | blind | "kill mid-flight" and "pause" tests assert nothing about the chain | low | The first checks a brand-new store; the second never advances the clock | patch |
| 7 | blind | The replaced prop's bounce tween may still run on the image reused as the balloon | low | `flyIn` destroys only the hotspot; direct fix: kill the image's tweens first | patch |
| 8 | blind | `round:complete` during an active chain is dropped (no level write, game not stopped) | low | No game can run during a chain: station taps are queued until `endChain` | reject |
| 9 | blind | A mismatched or orphaned `round:complete` is swallowed silently | low | Only reachable through the dev hook restart | reject |
| 10 | blind | The create-time chain uses kind `abandon`; Story 2.4 cannot tell it from a real abandon | low | Story 2.4 owns the overlay trigger; noted in deferred-work for 2.4 | defer |
| 11 | blind, edge | The chain hangs if the scene shuts down mid-chain | low | Only the dev hook restarts Map; `create` builds a fresh chain | reject |
| 12 | edge | `deps.end` throwing becomes an unhandled rejection | low | `end` is Map's own code with no throwing path shown | reject |
| 13 | edge | `endChain` queued tap with no trip/commands leaves Map stuck | low | `trip` exists from `create`; `tapStation` always returns commands for a station | reject |
| 14 | edge | `flyInTouchTalk` dev hook while a game runs leaves it stuck | low | Dev-only hook | reject |
| 15 | edge | Abandon with only unplannable pending entries plays a pull-back for nothing | low | Needs corrupted entries; harmless | reject |
| 16 | blind | Timing budget breaks with 2–3 pending items (2500 / 2800 ms) | low | Several pending items only arise once Epic 4 grants away from Map; the stagger is the spec's value | defer |
| 17 | blind | Dev timing log mixes wall clock and scene clock | low | Dev log only | reject |
| 18 | blind | Stop/wake logic duplicated between `stopRunningGameAndWake` and `returnFrom` | low | No divergence shown | reject |
| 19 | blind | dev-hooks main.ts regex test is brittle | low | Build check (`grep bhcDev dist`) verified separately | reject |
| 20 | edge | Flying depth is `ringDepth`, below station labels | low | Labels are text, not sprites; the spec's "above every sprite" holds | reject |

## Design Notes

**Why one injected runner:** the order (save → clear → stop → camera → fly → end), the stagger, the queued tap and the abandon variant are timing logic Vitest can check only without Phaser. Map passes thin effects:

```ts
chain = new PostRoundChain({
  setDifficulty: (id, l) => ProgressStore.setDifficulty(id, l), clearResume: (id) => SessionStore.clearResume(id),
  stopGameAndWake: () => this.stopRunningGameAndWake(),      // resolves on 'wake'
  pullBack: (id) => pullBack(this, LAYOUTS.map.anchors[id], this.reduced),
  flyIn: (e) => this.flyIn(e), wait: (ms) => this.waitScene(ms), // time.delayedCall → Promise
  pending: () => SessionStore.pendingFlyIns, end: (e) => this.endChain(e), now: () => performance.now(),
});
```

**Why `hold` on wake:** the item is already saved before Map wakes (AD-2). Without `hold`, 2.2's sync would draw the new item and remove the old one before the animation could show either.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0. The runner, fly-in plan, motion, session-store, tap-router and token budget tests pass.
- `cd app && npx vitest run src/core/post-round-chain.test.ts src/core/fly-in.test.ts` -- expected: every matrix row passes.
- `cd app && npm run build` -- expected: exit 0, and `bhcDev` is absent from `dist` (`grep -r bhcDev dist` finds nothing).

**Manual checks:**
- Run the AC walkthroughs at 1180×820 touch emulation, with and without reduced motion. Check that only one thing moves prominently, that nothing blinks, and that sparkles only fade.
- Under DevTools CPU throttling ×4, the logged chain time stays ≤ 2500 ms, or note the overshoot for the iPad check (Story 1.11 checklist).
