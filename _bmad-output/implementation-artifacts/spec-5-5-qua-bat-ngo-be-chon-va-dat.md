---
title: 'Quà bất ngờ, bé chọn 1 trong 2 và tự đặt lên đảo'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: true
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md']
warnings: ['oversized']
deferred:
  - summary: >-
      Map reward-choice wiring (station tap auto-place, tick, slot drop → placeOffer, tray drawing) has no scene test.
    evidence: |-
      Only the pure controller and the chain with a faked choose are tested; no MapScene harness.
    location: >-
      app/src/scenes/Map.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Every finished round auto-grants the next catalogue item into a slot that ProgressStore picks, and it flies in by itself (FR22/FR23 old). A reward that always comes feels like wages. The child also never chooses or places anything (FR22/FR23 replaced, FR52).

**Approach:** reward-service now decides on each `round:complete` / `reward:earned` whether there is a gift. The chance comes from Tokens. The first round of each game in a session always gives one, and no item repeats twice in a row. A gift becomes an *offer* of 2 candidate items, held in SessionStore. The post-round chain's fly-in step becomes a choice step: 2 big items appear by the station, the child taps one (the other flies away), and she places it by tap-then-tap or drag into a glowing placeable slot of that station. The placement is written to ProgressStore at that moment. Decision logic lives in pure, tested modules; Map only wires them.

## Boundaries & Constraints

**Always:**
- Every number goes in `Tokens.ui` / `Tokens.Timing` (lint no-magic-numbers).
- Input only through `core/input`: candidates are `createDraggable` with `onSelect`/`fly` (5.1), and slots are router targets.
- Timers use the scene `time`.
- `bus.scoped(this)`.
- The ProgressStore write is synchronous and happens before any placement animation. reward-service stays the only module that writes decorations (source scan).
- The `DecorationSlot` model and `schemaVersion` 2 stay unchanged. Existing saves load as they are, with no migration.
- The full-station rule stays: when no slot is empty, the only placeable slot is the lowest-seq one, and placing there replaces its item with the balloon-out.
- Placed decorations keep the 5.4 shake + type sound (z −1).

**Never:**
- No new voice lines or TTS, no new art (Shiba "points" with its existing wave, see Design Notes), no 5.6 landmarks, no 5.8 free play.
- The choice step is never skippable. The 5.3 skip covers only the pull-back.
- No setTimeout. No praise or "wrong" feedback.
- Do not revisit deferred items (the abandon-kind create-time chain, the scene harness).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First round of a game this session | `round:complete` ice-cream, not in `session.giftedGames`, rng = 0.99 | An offer is pushed, ice-cream joins giftedGames | — |
| Later round, no gift | rng ≥ `ui.rewardChance` | No offer. Chain = pull-back → play-again, as today | — |
| Later round, gift | rng < chance | Offer: 2 distinct candidates, never the station's newest-placed item. Items not standing at the station are preferred | — |
| Small catalogue | 1 item left after exclusion / an empty catalogue | 1-candidate offer / no offer + one warn | — |
| Offer already pending for the station | A second grant (e.g. touch-talk earns again) | Dropped: no offer, no `reward:granted` | — |
| touch-talk earns | `reward:earned` with a gift | Offer + `reward:granted {gameId, decorationId: candidates[0]}`, so the in-game fly-off still shows | — |
| Child taps candidate A | Choosing phase | B flies away. A is selected (ring) and the placeable slots glow while A is lifted | — |
| Tap / drop on a glowing slot | A held | `placeDecoration` writes, A flies into the slot, sparkle + happy sound, then the static prop. Chain ends → play-again | Invalid slot → warn, the first placeable slot is used |
| Tap / drop elsewhere | A held | A rests there (lift-stays). Slots glow again on the next lift. Still waiting | — |
| Station full | All slots taken | Only the oldest slot glows. Placing there balloons the old item out | — |
| Idle `Timing.rewardHintMs` | No tap in the choice | Guide Shiba waves + a hint ring pulses on candidate 0 (choosing) or the first placeable slot (holding). Repeats every rewardHintMs | No guide → ring only |
| Ignored `Timing.rewardAutoPlaceMs` | Still unplaced | Auto-place: the chosen item (else candidate 0) goes into the first placeable slot through the same write | — |
| Station tap during the choice | — | Auto-place now. The tap is queued and its trip runs at chain end (no play-again) | — |
| Map stops/sleeps mid-choice | — | The offer stays in session. The next Map create starts the choice chain again | App kill → the offer is lost (never written) |
| Reload | — | Every decoration stands in the slot where it was placed | — |

</intent-contract>

## Code Map

- `app/src/core/reward-service.ts:31-45` -- `grant()` calls `progress.grantDecoration` and pushes `pendingFlyIns`. `reward:earned` emits `reward:granted`.
- `app/src/core/reward-service.test.ts:135-150` -- the source scan that keeps `grantDecoration(` single-caller.
- `app/src/core/progress-store.ts:225-247` -- `grantDecoration`, `getDecorations`. `CONTENT_CATALOG` is at :167.
- `app/src/core/decoration-grant.ts:22-63` -- `cleanStation` / `planGrant`: item rotation plus the first-empty or lowest-seq slot.
- `app/src/core/session-store.ts:25-28` -- `guideGreeted`, `pendingFlyIns`.
- `app/src/content/types.ts:60-75` -- `DecorationSlot`, `GrantResult`.
- `app/src/core/bus.ts:11-12` -- `reward:earned` / `reward:granted` payloads (unchanged).
- `app/src/core/post-round-chain.ts:42-62` -- the ChainDeps (`flyIn`, `pending`, `staggerMs`).
- `app/src/core/post-round-chain.ts:68,82,111` -- `newestPerSlot`, `chainAnimMs`, `routeRoundAbandon(pendingCount)`.
- `app/src/core/post-round-chain.ts:195-232` -- the run loop.
- `app/src/scenes/Map.ts:346-366` -- chain deps; the skip begins in `pullBack`.
- `app/src/scenes/Map.ts:377-380` -- the abandon route.
- `app/src/scenes/Map.ts:415-420` -- the create-time chain.
- `app/src/scenes/Map.ts:437-452` -- `syncDecorations({hold})`.
- `app/src/scenes/Map.ts:474-490` -- `addDecorationProp` (hand-over of a flown image).
- `app/src/scenes/Map.ts:512-532` -- `pendingSlots`, `tapStation` queue.
- `app/src/scenes/Map.ts:558-611` -- `flyIn`: the old-sprite balloon and `playFlyIn`.
- `app/src/scenes/Map.ts:614` -- `endChain`.
- `app/src/scenes/Map.ts:723` -- `applyGuide`.
- `app/src/core/input/drag-controller.ts:37-79` -- `DraggableOptions` / `Draggable`, `CATCHER_Z` −2.
- `app/src/core/input/drag-controller.ts:140` -- private `flyTo`.
- `app/src/core/decoration-plan.ts:26-45,159` -- `PlannedDecoration.footprint/hit`, `DECORATION_Z`.
- `app/src/core/fly-in.ts`, `app/src/core/ui/decoration-fly.ts` -- `flyInPlan` / `playFlyIn` (balloon + sparkles), reused for the landing.
- `app/src/core/hint-visuals.ts:45,280` -- `createHintRing`, `createSelectionRing`.
- `app/src/core/map-guide.ts:44` -- `invite()` gives a wave.
- `app/src/games/touch-talk/TouchTalk.ts:85,94,296` -- emits `reward:earned`, pops the `reward:granted` decorationId.
- `app/src/content/decorations.ts:34` -- 4 items per station.
- `app/src/content/stations.ts:27` -- 1–2 slots per station.
- `app/src/core/rng.ts:7,24` -- `mulberry32`, `shuffled`.
- `app/src/core/timing.ts:113-139`, `app/src/core/tokens.ts:30-110` -- Timing / ui tables. `tokens.test.ts:84,101` pins fly-in values.

## Tasks & Acceptance

**Execution:**
- `app/src/core/reward-offer.ts` (new) + test -- Pure `drawOffer({stationId, items, placed, gifted, pending, rng, chance})` returns `RewardOffer {stationId, candidates}` or null, per the matrix rows 1–5. Tested with a fixed `mulberry32`: the chance rate over N draws, first-of-session forced, no repeat of the newest-placed item, distinct candidates, the 1-item and empty catalogues -- keeps the decision out of the bus wiring.
- `app/src/core/session-store.ts` -- Replace `pendingFlyIns` with `pendingOffers: RewardOffer[]`. Add `giftedGames: Set<GameId>` -- memory-only offer state.
- `app/src/core/decoration-grant.ts` -- Replace `planGrant` with `placeableSlots(decorations, stationId, slots)` (the empty slots in order, else the lowest-seq one) and `planPlace(decorations, seq, stationId, slots, slotId, decorationId)` (same cleanup, seq+1, `replaced`). Keep `cleanStation` -- the slot rule is unchanged, the item is now chosen.
- `app/src/core/progress-store.ts` -- Replace `grantDecoration` with `placeDecoration(stationId, slotId, decorationId)`: the item must be in the catalogue and the slot must be placeable, else warn + null + no write. Add a read `placeableSlots(stationId)`. Keep the schema at v2.
- `app/src/core/reward-service.ts` -- On round:complete / reward:earned, call `drawOffer` (injectable `rng`, default Math.random; chance from `Tokens.ui.rewardChance`) and push the offer. On reward:earned, also emit `reward:granted {decorationId: candidates[0]}`. Export `placeOffer(offer, slotId, decorationId, deps?)`: it calls `placeDecoration` (or the first placeable slot when the slot is stale), removes the offer from session and returns the `GrantResult`. Move the source scan to `placeDecoration(`.
- `app/src/core/reward-choice.ts` (new) + test -- A pure controller for one offer: phases `choosing → holding → placed`. Methods: `choose(i)`, `lift()`, `drop(slotId | null)`, `tick(ms)` (hint every `rewardHintMs` idle, auto-place at `rewardAutoPlaceMs`), `stationTap()` (auto). It returns commands (`flyAway`, `glow`, `unglow`, `hint`, `place {slotId, decorationId}`).
- `app/src/core/reward-choice.ts` -- Also pure `candidatePositions(stationBox, slotFootprints, safeRect)`: 2 centres ≥ `ui.rewardCandidateApartPx` apart, each item ≥ `ui.rewardCandidateMinPx`, inside the safe rect, clear of the station's slot footprints. Tested against the real map layout for every station.
- `app/src/core/input/drag-controller.ts` -- Add `Draggable.flyTo(p): boolean`. It works only while selected and runs the existing private `flyTo`. Test it in drag.test.ts -- lets a slot target (z above stations) resolve a tap-selected item exactly like a catcher tap.
- `app/src/core/post-round-chain.ts` -- Step 5 becomes: for each pending offer, oldest first, `await deps.choose(offer)`. Remove `flyIn`/`staggerMs`/`newestPerSlot`. `chainAnimMs(reduced)` returns the camera only. `routeRoundAbandon` takes the offer count. Update its tests.
- `app/src/scenes/Map.ts` -- Wiring only:
  - `choose`: draw candidates (decoration frames scaled to ≥ min px).
  - `createDraggable` per candidate: lift/select → `choice.choose`/`lift`; `onDrop(p)` → the slot whose `hit` contains p, else rest.
  - Slot targets on `PlannedDecoration.hit` at z 1, enabled while holding: `draggable.flyTo` or a drop.
  - Glow with hint-ring visuals. `hint` → `applyGuide(guideModel.invite())` + a hint ring on the target.
  - `place` → `placeOffer` first, then the landing via `flyInPlan`/`playFlyIn` (from = the item's spot, old item balloons), then `addDecorationProp` hand-over.
  - `tick` comes from `update`. `tapStation` while choosing → `choice.stationTap()` + `queueTap`.
  - Drop `pendingSlots`/hold and the old `flyIn`. The create-time chain reads `pendingOffers`.
- `app/src/core/tokens.ts`, `app/src/core/timing.ts`, `tokens.test.ts` -- Add `ui.rewardChance` (0 < x < 1), `rewardCandidateMinPx` (120), `rewardCandidateApartPx`, `rewardCandidateOffsetPx`, `rewardSlotPad`. Add `Timing.rewardHintMs` (10000), `rewardAutoPlaceMs`, `rewardPopInMs`, `rewardFlyAwayMs`. Assert their invariants.
- `app/src/content/types.ts`, `decorations.ts`, `stations.ts`, `core/dev-hooks.ts` -- Update the doc comments that name `grantDecoration` / `pendingFlyIns`. TouchTalk code is unchanged.

**Acceptance Criteria:**
- Given a reload after a placement, when Map opens, then the item is drawn at the slot the child chose and shakes + plays its type sound when tapped.
- Given a round with no gift, when the child returns, then the chain timing and play-again behave exactly as before (tokens test: pull-back alone ≤ `roundEndToOverlayMaxMs − roundCelebrationMs`).
- Given an existing v2 save with auto-granted decorations, when the app loads, then every entry stays in its slot and nothing is migrated or rewritten.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 34 findings (incl. 1 from the orchestrator's headless run) — high 0, medium 5, low 25, false 4, maybe-false 0
- findings:
  - `[medium]` `patch` (orchestrator headless run) candidates appeared by the volcano and the pond, far from the ice-cream truck — patched: max distance from the station anchor + real-layout test
  - `[low]` `patch` (blind) shutdown mid-landing never resolves choose — patched
  - `[medium]` `patch` (blind) drag moves do not reset idle; auto-place yanks the item mid-drag — patched + test
  - `[low]` `patch` (blind) station tap auto-places only the current offer — patched: all remaining offers once a tap is queued
  - `[medium]` `patch` (blind) tap on a slot near the edge misses after the clamp — patched: slot id carried to the drop
  - `[low]` `reject` (blind) reward:granted carries a teaser, names say "grant" — documented in the spec (touch-talk teaser); renaming is churn
  - `[low]` `reject` (blind) offers not kill-safe — spec decision C1: next session's first round of that game always gifts
  - `[low]` `reject` (blind) round-end-to-overlay budget dropped on gift rounds — spec decision: the choice is the child's own pace
  - `[low]` `patch` (blind) candidate pop-in ignores reduced motion — patched
  - `[medium]` `patch` (blind) no voice cue in the choice step — patched: one "Xoài ơi, chọn quà nào!" line + Speaker prompt
  - `[low]` `patch` (blind) store tests deleted, not ported — patched
  - `[low]` `reject` (blind) dropped earn while an offer is pending is silent — intended (one pending offer per station)
  - `[low]` `reject` (blind) fallback passes an empty id — only reachable with an empty catalogue, already warned; covered by the placeOffer pending guard
  - `[low]` `reject` (blind) createSlotGlow duplicates ring strokes / SelectionRing type — small, consistent with 5.1's ring
  - `[low]` `reject` (blind) session-store header line merged — cosmetic
  - `[medium]` `patch` (edge) slot tap clamp miss — grouped
  - `[low]` `patch` (edge) unclamped no-room fallback — patched
  - `[medium]` `patch` (edge) drag idle / auto-place mid-drag — grouped
  - `[low]` `patch` (edge) landReward destroys a drag mid-press — patched: cancel first
  - `[low]` `reject` (edge) chooseReward executor throws — no throwing path in the executor
  - `[low]` `patch` (edge) placeOffer for a non-pending offer — patched: warn + null
  - `[low]` `patch` (edge) router gone in landReward — grouped with shutdown resolve
  - `[low]` `patch` (edge) shutdown handler does not resolve — grouped
  - `[low]` `reject` (edge) placeDecoration null after splice — item ids come from the station catalogue at draw time
  - `[false]` `reject` (edge deletion) syncDecorations draws a duplicate during landing — syncDecorations is not called during the chain (decorations frozen while the chain runs)
  - `[false]` `reject` (edge claim) fallback off-screen — duplicate of the patched fallback row
  - `[low]` `reject` (edge claim) 1-candidate offer — only when a station catalogue has a single other item; acceptable
  - `[medium]` `defer` (verification-gap) Map reward-choice wiring never run by a test — no scene harness (filed defer)
  - `[low]` `patch` (verification-gap other) old chain stays active after shutdown — grouped with shutdown resolve
  - `[false]` `reject` (intent A–D) readings A1/B1/C1/D1 — the spec's recorded decisions
  - `[low]` `reject` (intent E) wave stands in for pointing — no pointing art; recorded
  - `[low]` `reject` (intent F) size checked in design px — the stage scales design px uniformly
  - `[false]` `reject` (intent G) reload + tap reaction not exercised in scene — store reload is tested; decorations reuse the 5.4 reaction (tested)
  - `[low]` `reject` (intent extras) auto-place / station-tap / teaser not in the AC — spec decisions for ignore/leave gaps

## Design Notes

- **Candidates:** both come from the station's own catalogue. Shuffle with the injected rng and drop the station's highest-seq (newest) placed item, so no item comes twice in a row. Prefer items not currently standing at that station; fall back to the ones standing there. "First round" means the first gift-eligible event of that game this session (`giftedGames`). For touch-talk, each `reward:earned` counts as a round.
- **Save timing:** an offer is only memory, and nothing is written until placement. Placement writes synchronously before any animation, and auto-place uses the same path. An app kill before placement loses the offer. That is acceptable for a surprise, and the next session's first round of that game always gives one again. Map stop/sleep keeps the offer, and the create-time chain replays the choice.
- **Ignore / leave:** after `rewardHintMs` idle, the guide waves and a hint ring pulses. There is no pointing art yet, so the wave stands in for pointing. After `rewardAutoPlaceMs`, or on a station tap, the item is auto-placed so the island never hangs. The 4 s round-end-to-overlay budget applies only to rounds without a gift.
- **touch-talk fly-off:** the payload is unchanged, and `decorationId` = candidates[0] as a teaser. Choosing happens on the island when the child returns. There is at most one pending offer per station, so repeated earns in one visit do not stack.
- **Migration:** none. The slot model is unchanged. Old auto-granted items stay and become ordinary placed items. The removed in-memory `pendingFlyIns` needs nothing.
- **Candidate placement (auto-run decision, 2026-10-19):** the island is too dense for two 120 px candidates that touch nothing near most stations. Candidates may overlap their OWN station's sprite/hit box (they belong to it and register after it, so they win the tap), but never another station's hit polygon (padded by `ui.rewardSlotPad`), a station label, the Hud or the station's own slots; the 120 px floor stays. Order: beside (nearest the anchor, ≤ `ui.rewardCandidateMaxDistPx`, the gap relaxed down to the box size), then directly above the station sprite, then the **tray**: both side by side at the centre of the play rect while Map dims the island under them (`ui.rewardTrayDimAlpha`), draws a pedestal behind them and rings the station that earned the gift; the dim goes once an item is chosen. The choice draws at `ui.rewardChoiceDepth`, above every map sprite and decoration.
- **Hit order:** slot targets z 1 (above stations), candidates default z 0, decorations z −1 (taps already ignored during the chain), catcher z −2, ripple z −3.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: lint (no-magic-numbers), typecheck, all Vitest suites (reward-offer, reward-choice, decoration-grant, progress-store, reward-service source scan, post-round-chain, drag flyTo, tokens) and the content/layout validators pass.

**Manual checks (if no CLI):**
- `npm run dev`: the first ice-cream round → 2 items by the truck. Tap one → the other leaves and the slots glow. Tap a slot → it lands, then play-again. Reload → it is still there. Wait 10 s without tapping → Shiba waves + a ring on an item.

## Auto Run Result

Status: done

- **Summary:** rewards become surprise offers (core/reward-offer.ts: first round of each game per session always, later by Tokens chance; no repeat of the station's newest item); the post-round chain's fly-in step is now an awaited choice (core/reward-choice.ts controller + Map wiring): two 120 px candidates near the station (may overlap its own sprite, never another station/label/Hud/slot; a dimmed centred tray when no room), a voice cue "Xoài ơi, chọn quà nào!", the chosen item goes by drag or tap-then-tap into a glowing slot, the other flies away, hint after 10 s idle (Shiba wave + ring), auto-place after a timeout or on a station tap; placement writes synchronously via ProgressStore.placeDecoration; placed items react on tap (5.4).
- **Files:** core/reward-offer.ts (new), core/reward-choice.ts (new), core/reward-service.ts, core/decoration-grant.ts, core/progress-store.ts, core/session-store.ts, core/post-round-chain.ts, core/input/drag-controller.ts (flyTo, cancel), core/hint-visuals.ts (createSlotGlow), core/tokens.ts, core/timing.ts, content/voice-lines.ts (+ audio), scenes/Map.ts, with tests.
- **Review:** 34 findings (one from the orchestrator's headless run) — 16 patch entries applied (5 medium: candidates far from / over other stations, drag idle auto-place, edge-slot clamp miss, missing voice cue; 11 low), 1 deferred (Map wiring scene test), rest rejected. Placement needed two extra rounds: the island has no clear room by most stations, so the decision "own-station overlap allowed, centred dimmed tray as last resort" was taken (Design Notes).
- **Follow-up review recommended:** true — five medium entries patched and the tray drawing (dim/pedestal/ring) was only seen for the beside case in the headless run.
- **Verification:** npm run check exit 0 (1732 tests); headless Chrome: after an ice-cream round the gift choice shows a sundae on the truck with a hint ring and a popsicle at the lower left, neither on another station.
- **Residual risks:** tray look unverified on screen; candidate pairs can be far apart at pizza/dino; the new reward line needs a listen.
