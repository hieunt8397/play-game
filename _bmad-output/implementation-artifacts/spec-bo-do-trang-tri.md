---
title: 'Bỏ tính năng đồ trang trí (quà trên đảo)'
type: 'refactor'
created: '2026-10-21'
status: 'done'
baseline_commit: 'NO_VCS'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The parent finds the decoration reward loop (gifts flying onto the island after a round, the 1-of-2 gift choice, touch-talk's gift every ~8 touches) makes the game confusing for a 3-year-old.

**Approach:** Remove the decoration feature at runtime end to end: no gift is offered, chosen, flown, placed, shown or stored. Everything else after a round stays as it is today (difficulty saved, camera pull-back, "Chơi nữa?" overlay, resume of a round left midway). Continuous play (next round starts in place, overlay removed) is a separate follow-up spec.

Decisions (parent, 2026-10-21):
- Decorations already stored on the device are deleted on the next app start; saved difficulty is kept.
- Split: this spec removes decorations only; continuous play comes next.

## Boundaries & Constraints

**Always:** Saved difficulty survives the upgrade. The post-round chain order is otherwise unchanged (settle difficulty → stop game → camera pull-back → play-again overlay). Round-leave/abandon routing and resume marks keep working. Touch-talk keeps its free touching with no round end; it simply never grants anything. `npm run check` stays green; deleted features take their tests with them.

**Never:** Change the art pipeline in this spec (`tools/render/build.ts`, `build_map.py`, `content/decorations.ts` as the builder's catalogue, `tools/layout/rules.ts` decoration rules, `StationDef.slots`, map atlas frames) — the map is not re-rendered; that cleanup is deferred. Never touch difficulty logic, the play-again overlay, or game round rules.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Upgrade | stored `bhc.progress` v2 with decorations + difficulty | read as v3: difficulty kept, no decorations, no `seq`; written back as v3 | malformed → existing sanitise/defaults |
| Fresh device | no stored progress | default v3 document | — |
| Round complete then Home | ice-cream round finished | difficulty saved, pull-back, overlay opens; no gift candidates, no fly-in | — |
| Touch-talk | 8+ distinct objects touched | nothing flies out, no `reward:*` event | — |
| Home mid-round | abandon | resume mark as today; plain fade back (no offers branch) | — |

</frozen-after-approval>

## Code Map

All under `app/`.
- `src/core/reward-service.ts`, `reward-offer.ts`, `reward-choice.ts`, `decoration-grant.ts`, `decoration-plan.ts`, `fly-in.ts`, `ui/decoration-fly.ts` (+ tests) -- the feature; delete. `decoration-grant.ts` exports `padRect`/`rectPolygon` used by `tools/layout/rules.ts:8`: move those two helpers into a small kept module (e.g. `src/core/geometry-pad.ts`) rather than deleting them.
- `src/main.ts:6,52` -- `installRewardService`; remove.
- `src/core/bus.ts:13-14` -- `reward:earned`, `reward:granted`; remove (and from `bus.test.ts`, `dev-hooks.ts` `flyInTouchTalk`).
- `src/core/session-store.ts:29-32` -- `pendingOffers`, `giftedGames`; remove.
- `src/core/progress-store.ts` -- schema v3: drop `decorations` and `seq` from `ProgressState`, `MIGRATIONS[2]` strips them, `sanitise` stops checking them; remove `placeDecoration`, `placeableSlots`, `getDecorations`, `DecorationCatalog`/`CONTENT_CATALOG`. Keep `NewerSchemaError` behaviour.
- `src/core/post-round-chain.ts` -- drop the choose-offers step from `run` and the "offers pending" branch of `routeRoundAbandon` (always the plain path); keep `settle`/`save`/`clearResume`, `routeRoundLeave`, `keepAbandonSnapshot`.
- `src/scenes/Map.ts` -- remove `syncDecorations`/`planDecorationEntries`/`addDecorationProp` (:549-597), the choice step `chooseReward`…`takeOldSprite` (:662-1037), chain deps `choose`/`pending` (:454-455), pending-offer replay on create (:523-528), `syncDecorations` in `endChain` (:1042), the choice tick in `update` (:535), and their shutdown clean-up (:513-517). Fix the header comment (:12-33).
- `src/content/types.ts:56-74` -- `DecorationSlot`, `GrantResult`: remove if no kept user remains.
- Touch-talk: `src/content/games/touch-talk.ts:42` `TOUCH_TALK_REWARD_EVERY`; `src/games/touch-talk/talk.ts:49-55,119-123,178,186-199` (`rewardEvery`, `rewardAnchor`, the resume check using it); `TouchTalk.ts:4-5,40,70,80,85,106,306+` (`'reward'` layer, emits, `showReward`); `fly-out.ts` (delete).
- `src/core/hint-visuals.ts:271` (slot glow), `src/core/ui/map-prop.ts` (shake), `src/core/ui/scale-motion.ts:63-87`, `src/core/input/drag-controller.ts:68` -- remove only decoration-specific parts; check for other callers first.
- Tokens: Timing `decorationShakeMs`, `decorationFlyInMs`, `flyInLandMs`, `balloonOutMs`, `reward*Ms`, `touchTalkFlyOut*`/`SparkleMs` (`src/core/timing.ts`); ui `decorationShake*`, `flyIn*`, `balloonRisePx`, `sparkle*`, `reward*`, `flyOut*` (`src/core/tokens.ts`). Delete those with no remaining user. `tokens.generated.ts` `components.decorationItem` stays (build tool reads it).
- Voice: `vo.shell.prompt.reward` / `REWARD_PROMPT` (`src/content/voice-lines.ts`) and its `public/assets/audio/vo/*.{m4a,hash}`; delete. `DECORATION_SOUNDS` reuse shared `sfx.shell.*` ids — keep those ids.
- `src/content/validate.ts:56-57,148-185,471` `validateDecorationCatalogue` -- keep (catalogue still feeds the builder) unless it only guards runtime use; `tools/lint/validate-content.ts` likewise.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/progress-store.ts` (+test) -- v3 schema and migration as above -- delete stored decorations, keep difficulty.
- [x] `src/core/post-round-chain.ts`, `src/scenes/Map.ts`, `src/main.ts`, `src/core/session-store.ts`, `src/core/bus.ts`, `src/core/dev-hooks.ts` (+tests) -- remove the runtime feature and its wiring.
- [x] reward/decoration modules listed in the Code Map (+tests) -- delete; relocate `padRect`/`rectPolygon` for `tools/layout/rules.ts`.
- [x] touch-talk files (+tests) -- remove reward counting, fly-out and the reward layer.
- [x] tokens, timing, voice line + audio files, helpers -- remove orphans.
- [x] `app/README.md` -- drop the reward voice-line provenance row and describe decorations as removed at runtime (art still carries the frames).
- [x] `_bmad-output/planning-artifacts/prds/*` -- add a dated change note: decorations (FR17 reward part, FR22, FR24/5.5 choice) removed by parent decision 2026-10-21.

**Acceptance Criteria:**
- Given the app is built, when searching `src/` for `reward`, `pendingOffers`, `placeDecoration`, `fly-in`, then only art-pipeline catalogue/validation references remain.
- Given any game round ends, when the kid presses Home, then the existing chain plays without a gift step and the play-again overlay opens as before.

## Implementation Notes

Implemented by a subagent; baseline snapshot in the session scratchpad (NO_VCS). Kept helpers moved to `src/core/geometry-pad.ts` (they lived in decoration-plan.ts, not decoration-grant.ts); `dev-hooks.ts` deleted (its only hook was the touch-talk fly-in); PRD FR labels corrected in the note (gift FRs are FR22, FR23, FR52, FR53).

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind, edge, verif | `'abandon'` ChainKind unreachable, tested dead path | low | grep: no production `kind:'abandon'` start; only post-round-chain.test drives it | patch |
| 2 | blind, verif | play-again-layout.test still uses decoration footprints as obstacles | low | Map.playAgainObstacles passes only the station bbox; test imports DECORATIONS | patch |
| 3 | blind | ARCHITECTURE-SPINE AD-1/AD-2/EventMap still require reward-service, pendingFlyIns, reward events, v2 shape | medium | file not in diff; binding ADs contradict schema v3 and the bus; next spec (continuous play) plans from it | patch |
| 4 | blind | UX spines + epics.md still require decorations (UX wins over PRD) | medium | EXPERIENCE.md 13 refs, epics.md 53, untouched | patch |
| 5 | blind | sprint-status still shows 2-2/2-3/4-6/5-5 as live | low | statuses unchanged; risk of re-review of dead work | patch |
| 6 | blind | PRD body (FR33, journey step 7, risk line) contradicts the change note | low | lines read as current behaviour | patch |
| 7 | blind | touch-talk touched set is dead state that grows without limit | false | bounded by the fixed prop count of three scenes (snapshot shape kept on purpose); no unbounded growth | reject |
| 8 | blind | geometry-pad duplicates decorationFrameName, second `Rect` type, decoration helpers in runtime module | low | pre-existing in decoration-plan.ts (moved verbatim); placement belongs to the deferred art cleanup | reject (pre-existing; folded into art-cleanup deferral) |
| 9 | blind | DECORATION_SOUNDS/decorationSfx unused but tested | low | only tests use them; build needs id/model only | defer (art cleanup) |
| 10 | blind | touch-talk source scan bans bare 'decoration' | low | substring match fails on any comment | patch |
| 11 | blind, edge | stale v2 tab or rollback opens a v3 doc → NewerSchemaError, memory-only session | low | real but needs an old tab open across the upgrade on a family iPad; fix adds a tolerant-read branch | reject (low, unlikely, adds complexity) |
| 12 | blind | header comment leftovers (post-round-chain wrap, session-store mid-sentence, play-again-layout "more rects") | low | read in diff | patch |
| 13 | edge | stations.ts:17 comment still cites placeableSlots / 5.5 offers | low | comment present | patch |

## Design Notes

Removal order that keeps typecheck useful: progress-store schema first, then Map/chain wiring, then delete modules and let `tsc` list the leftovers. A v3 step is preferred over tolerant parsing so stale fields leave storage for good.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0 (typecheck, lint, tests, content and precache checks).

**Manual checks:**
- Dev server: finish an ice-cream round, press Home → camera pulls back, overlay shows, no gift candidates; touch-talk with 10 different objects → nothing flies.
