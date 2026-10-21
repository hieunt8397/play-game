---
title: 'Khung chơi tự do, phản ứng "chọn khác" và phản ứng ngẫu nhiên'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_revision: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: false
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md']
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** When a round's last question is done, `MiniGameBase.finishRound` emits `round:complete`, which makes the game inert at once. Map then stops the game and runs the post-round chain, so the child is pulled out of a game she may still want to play with (FR32). Games also have no shared way to vary their "correct" reactions (FR31) or their "chose-other" reactions (FR30).

**Approach:**
- `RoundGuard` gets a free-play state between `round:complete` and a new `round:leave` event.
- `MiniGameBase` stays on screen in that state: the voice goes silent, question input is off, and tap reactions keep working. Home emits `round:leave`.
- Map saves the round on `round:complete`, which means difficulty and clearResume (the reward offer is already queued by reward-service). It runs the rest of the post-round chain on `round:leave`.
- A pure `core/reactions` picker (seeded, never the same pick twice in a row) is exposed through the base. Ice-cream is wired through it as the sample game.

## Boundaries & Constraints

**Always:**
- Each start emits exactly one `round:complete` or `round:abandon`. Free play adds exactly one `round:leave`, and only after `round:complete`.
- reward-service still gets `round:complete` unchanged.
- Difficulty and clearResume are written synchronously on `round:complete`, not on Home.
- Free play is a `MiniGameBase` concern that every game inherits, through `freePlay`, the `onFreePlay()` hook (default does nothing) and `inviteParent()`, called once on entry.
- A game with no free-play rules (all 7 today) keeps only the 5.4 tap reactions. Its question handlers stop because `inert` is now true in free play too.
- A "chose-other" reaction never plays a wrong sound and never feeds the tally twice. The game still calls `hint.wrong()` once, as today.
- Lifecycle decisions go in pure, tested code (RoundGuard, post-round-chain, reactions).
- Every new number goes in `Tokens`/`Timing`. The rng salt is a named const in `core/rng`.

**Never:**
- No new art, voice lines or TTS. No per-game free-play rules (those are Epic 6).
- Touch-talk is unchanged: it never finishes and is free play from the start.
- Do not change the play-again overlay logic or reward-service.
- Do not change Fishing's existing wrong-fish SFX (Epic 6 owns that game's reactions).
- Games never call `scene.*`. No `setTimeout`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Round ends | last question done → `finishRound()` | `round:complete` (tallied) once. Hint question closed. `audio.clearPrompt()`. `freePlay` and `inert` true. `input.enabled` stays true. `inviteParent()` then `onFreePlay()` called once. Timed events are not removed | No error expected |
| Free play tap | tap a sprite or the background | 5.4 bounce or ripple still happens (reactions are blocked only when terminal or skipping) | No error expected |
| Home in free play | `hud:home` | Cleanup (removeAllEvents, invite closed), then `round:leave {gameId}` once, then input disabled. No `round:abandon`, no snapshot | A second Home does nothing |
| Home while finishing | `hud:home` during the celebration delay | `round:complete`, then `round:leave`, in the same tick | No error expected |
| Map on `round:complete` | running game matches | `chain.settle`: setDifficulty(nextLevel) and clearResume now. The game keeps running and Map stays asleep | Another game, or no running game → ignore |
| Map on `round:leave` | settled game, chain idle | `chain.start({kind:'complete', gameId})` skips steps 1–2, then stop+wake → pull-back → gift choice → `onChainEnd` → play-again overlay as today | Chain already active → fade return. Not settled → chain warns "difficulty unchanged" and still runs |
| Picker | list `[a,b,c]`, kind `correct` | Each pick is from the list and never equals the previous pick of that kind. The same seed gives the same sequence | List of 1 → always that entry. Empty list → `undefined` |
| Ice-cream wrong serve | wrong flavour onto the cone | Round emits `choseOther{id,to}` + `hintWrong`. The scene plays the picked chose-other reaction (`float-back`, no SFX) | No error expected |
| Ice-cream after finish | any drop in free play | Round gives `floatBack` only (no serve, no hintWrong). The scene command path is gated on `inert` | No error expected |

</intent-contract>

## Code Map

- `app/src/core/round-guard.ts:7-44` -- one-terminal guard; add the `playing → free → done` states.
- `app/src/core/bus.ts:8-10` -- EventMap; add `'round:leave': { gameId: GameId }`.
- `app/src/games/mini-game-base.ts:129-133` -- `hud:home` routing.
- `app/src/games/mini-game-base.ts:143-146` -- `inert`.
- `app/src/games/mini-game-base.ts:197-211` -- `attachReactions` blocked check.
- `app/src/games/mini-game-base.ts:283-287` -- `inviteParent` inert check.
- `app/src/games/mini-game-base.ts:315-340` -- `finishRound`, `complete` and `cleanup`.
- `app/src/core/post-round-chain.ts:84-104` -- `TerminalRoute`, `routeRoundComplete`, `routeRoundAbandon`.
- `app/src/core/post-round-chain.ts:161-182` -- `start` steps 1–2.
- `app/src/scenes/Map.ts:463-473` -- `follow` plus the bus subscriptions.
- `app/src/scenes/Map.ts:1-36` -- header doc (Stories 2.3/2.4).
- `app/src/core/reward-service.ts:59` -- the `round:complete` listener. Unchanged; it must keep firing at round end.
- `app/src/core/rng.ts:70-76` -- `parentInviteSeed` pattern for `reactionSeed`.
- `app/src/games/ice-cream/round.ts:199` -- wrong serve → floatBack + hintWrong.
- `app/src/games/ice-cream/round.ts:196` -- finished → floatBack.
- `app/src/games/ice-cream/IceCream.ts:389-392` -- `applyAll`, gated on `inert`.
- `app/src/games/ice-cream/IceCream.ts:416-420` -- floatBack.
- `app/src/games/ice-cream/IceCream.ts:449-451` -- celebrate.
- `app/src/content/games/ice-cream.ts:44-64` -- frames and SFX; the reaction list goes next to them.
- `app/src/games/registry.test.ts:55-130` -- TestGame harness.
- `app/src/games/registry.test.ts:266-330` -- finish tests that assert inert and input off after complete; these must be updated.
- `app/src/core/round-guard.test.ts`, `app/src/core/post-round-chain.test.ts:371-395` -- existing route tests.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/core/round-guard.ts` (+test) -- Add `complete()` (playing→free), `leave()` (free→done, emits `round:leave`) and `abandon()` (playing only). `inert` means "not playing", `freePlay` means free, `terminal` means done. `onInert` runs on done only. -- Pure lifecycle with one terminal event.
- [x] `app/src/core/bus.ts` -- Add `round:leave`. -- Typed event.
- [x] `app/src/core/reactions.ts` (+`reactions.test.ts`) -- Add `ReactionKind = 'correct' | 'choseOther'`, `ReactionSet = { correct: readonly string[]; choseOther: readonly string[] }` and `createReactionPicker(set, rand) → { pick(kind): string | undefined }` with the no-repeat rule per kind. -- FR30/FR31 shared core.
- [x] `app/src/core/rng.ts` -- Add `reactionSeed(seed)` with its own salt. -- Decorrelated rng.
- [x] `app/src/games/mini-game-base.ts` -- Add:
  - `finishRound` enters free play: skip.end, inner.questionDone, clearPrompt, `guard.complete`, `inviteParent()`, then `onFreePlay()`.
  - Home in free play calls `leave()`, which runs cleanup and then `guard.leave`. Home while finishing calls finishRound and then leave.
  - Reactions and `inviteParent` are blocked only when terminal.
  - New `protected get freePlay`, `protected onFreePlay()`, `protected reactionSet()` (default empty lists) and `protected pickReaction(kind)`. The picker is built in `create` from `reactionSeed(seed)`.
  - Update the header doc.
  -- Every game inherits free play.
- [x] `app/src/core/post-round-chain.ts` (+test) -- Add:
  - `TerminalRoute` gets `settle`. `routeRoundComplete` returns `settle`.
  - New `routeRoundLeave(running, gameId, chainActive)` → `chain`, `fade` or `ignore`.
  - `PostRoundChain.settle(req)` runs steps 1–2 and remembers the gameId. `start` skips steps 1–2 for a settled gameId and forgets it.
  -- Map wiring stays trivial and tested.
- [x] `app/src/scenes/Map.ts` -- `follow` handles `settle` (calls `chain.settle`). Subscribe to `round:leave` and route it with `routeRoundLeave`. Update the header doc. -- The chain runs at Home.
- [x] `app/src/content/games/ice-cream.ts` -- Add `REACTIONS: ReactionSet = { correct: ['shiba-happy'], choseOther: ['float-back'] }`. -- Today's reactions as entries; Epic 6.1 adds more.
- [x] `app/src/games/ice-cream/round.ts` (+test) -- The wrong serve emits `{kind:'choseOther', id, to}` instead of floatBack. Add a test that after the round is finished, drops only float back. -- Sample free-play transition.
- [x] `app/src/games/ice-cream/IceCream.ts` -- Override `reactionSet()`. `celebrate` and `choseOther` go through `pickReaction`, with a switch on the id: `shiba-happy` → `celebrate()`, `float-back` → moveTo with the return duration and no SFX. -- Picker wired.
- [x] `app/src/games/registry.test.ts` -- Extend TestGame (`leave`, `freePlay`, a `reactionSet` override and an `onFreePlay` spy). Update the finish tests and add the matrix rows: free-play entry, tap reactions still on, Home → `round:leave` once and no abandon, Home while finishing, invite once. -- Base lifecycle coverage.

**Acceptance Criteria:**
- Given any of the six round games finishes, when its last question is done, then the scene stays on screen with Home visible, no prompt, retry, hint or next question plays, and the Speaker replays nothing.
- Given free play, when the child taps Home, then Map stops the game, the pull-back and the gift choice run on the island, and the play-again overlay opens afterwards as today.
- Given a reload during free play, then the difficulty is already saved and no resume mark shows for that game.
- Given `npm run check`, then lint (no-magic-numbers, no scene calls in games), types and all Vitest suites pass.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | Free-play drops never reach the scene (applyAll gated on `inert`); dragged piece stays where dropped | medium | defer | Real for ice-cream on a drag crossing the round end; other games' pickability unverified; per-game free-play rules belong to Epic 6. |
| 2 | Round-level "free play floats back" test passes on behaviour the scene discards | medium | defer | Same root cause as #1; grouped with it. |
| 3 | Map `settle` / `round:leave` wiring untested | medium | defer | No Map test harness; pure routes are tested. |
| 4 | IceCream `choseOther` scene handling untested; switch not exhaustive | low | defer | Filed as defer by the verification layer. |
| 5 | Ungated timers speak in free play (ShadowMatch.ts:612) | false | reject | `ShadowMatch.say` returns on `this.inert` (line 535); other timers found are visual or gated. |
| 6 | Parent-invite voice continues over the island after Home | low | reject | One voice channel: Map's next line interrupts it; same as a line playing on abandon. Fixing it needs new token state. |
| 7 | `RoundGuard.leave` emits before `onInert` (unlike abandon) | false | reject | The frozen matrix requires "round:leave once, then input disabled"; disabling input on a stopping scene is harmless. |
| 8 | `settled` goes stale on the fade route | false | reject | Every `complete` start comes from `round:leave`, which always follows a `settle` for that game that overwrites `settled`. |
| 9 | `round:leave` ignored when no running game strands the scene | false | reject | Same guard as the existing `round:complete`/abandon routes; `running` is always set while a game runs. |
| 10 | Home while finishing bypasses `finishRound` overrides | false | reject | No game overrides `finishRound` or `complete`. |
| 11 | IceCream header says both reactions have "no SFX" | low | patch | `celebrate()` plays `SFX.happy`; comment corrected. |
| 12 | REACTIONS ids not tied to switch cases | low | reject | Hypothetical future mis-wiring; the fix adds type machinery. |
| 13 | Free play has no exit except Home / no cue | false | reject | Intent: Home exits free play (FR32). |
| 14 | Ice-cream has no game-specific free-play behaviour | false | reject | Intent excludes per-game rules (Epic 6). |
| 15 | Diff omits bus/rng hunks | false | reject | Process note (no VCS); both exist and pass check. |

## Design Notes

- **Why a new `round:leave` event:** reusing `round:abandon` would store a snapshot and show a resume mark. Emitting `round:complete` only at Home would delay saving the difficulty, which the AC forbids. So save on `round:complete`, and run the chain on `round:leave`.
- **`inert` widened, not renamed:** every game already gates its question handlers on `this.inert`, so making it true in free play switches off targets in all games without touching them. Epic 6 games use `freePlay` in their own handlers. Input stays enabled because the router must still deliver tap reactions.
- **No `removeAllEvents` at free-play entry:** removing events would kill the 5.4 'react' hold release and any ambient loops. Pending game timers end in `applyAll`, which is gated on `inert`. Cleanup still runs on leave and on abandon.
- **Play-again overlay:** unchanged. It still opens from the `complete` chain end on the island, now after Home rather than after the celebration.
- **Picker:** `pick` draws `randInt(rand, n−1)` over the list without the last pick (n > 1), so it costs one rng call per pick and is deterministic per seed.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0 (lint, typecheck, Vitest incl. reactions, round-guard, post-round-chain, registry, ice-cream round).

**Manual checks (if no CLI):**
- `npm run dev`, then play ice-cream to the end. Shiba celebrates, the scene stays, and taps on Shiba or the background still react. Home → island pull-back → gift choice (if any) → play-again.
