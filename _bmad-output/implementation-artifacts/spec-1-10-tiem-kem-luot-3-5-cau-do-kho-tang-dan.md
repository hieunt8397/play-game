---
title: 'Story 1.10 — Tiệm kem: lượt 3–5 câu và độ khó tăng dần (FR5)'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'NO_VCS'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-8-tiem-kem-keo-kem-dung-vi-cho-shiba.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-9-goi-y-leo-thang.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-kart-chay-toi-tram.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-be-nghe-giong-doc-tieng-viet.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** After Stories 1.8 and 1.9, Tiệm kem has one ladder level (1 scoop out of 2 flavours), asks questions forever until Home, never emits `round:complete`, and the level never changes. FR5 (difficulty that grows from 1-of-2 to 2–3 scoops, with order enforced only at the top level), a finished 3–5 question round and AR8's `nextLevel` are all missing.

**Approach:**
- `content/games/ice-cream.ts` gets a 4-level ladder with a question count per level. Every multi-scoop and order request is enumerated as its own voice line.
- The pure `questions.ts` / `round.ts` from spec-1-8 learn multi-scoop questions, ordered checking at the top level, `stepDone` after each correct scoop, and the end of the round.
- A pure `core/round-tally.ts` behind `MiniGameBase` counts `questions`, `firstTryCorrect` and `maxHintLevel` from the hint protocol. The base emits `round:complete` after the celebration, then goes inert.
- A pure `core/difficulty.ts › nextLevel` is called only by `Map` on `round:complete`. It writes the new level to `SessionStore.levels` (memory only).

## Boundaries & Constraints

**Always:**
- **Ladder** (`content/games/ice-cream.ts`, data only). `IceCreamLevel = { id; flavours: 2|3|4; scoops: 1|2|3; ordered: boolean; questions: 3|4|5 }`:

  | idx | id | flavours | scoops | ordered | questions |
  |---|---|---|---|---|---|
  | 0 | `one-of-2` | 2 | 1 | false | 3 |
  | 1 | `two-of-3` | 3 | 2 | false | 4 |
  | 2 | `three-of-4` | 4 | 3 | false | 5 |
  | 3 | `three-in-order` | 4 | 3 | true | 5 |

  A content test enforces the following:
  - level 0 is 1-of-2;
  - `flavours` and `scoops` never decrease;
  - every level after 0 raises at least one of them, except the last, which adds `ordered`;
  - `scoops ≤ min(flavours, 3)` (three `slot.cone-*` exist);
  - questions are 3–5;
  - only the last level is `ordered`.
- **Questions** (`games/ice-cream/questions.ts › questionFor(seed, index, level)` → `{ counter: FlavourId[]; wanted: FlavourId[] }`, which replaces spec-1-8's `target`):
  - Same rng and shuffle as spec-1-8. `counter` = the first `flavours` of the shuffle, placed on `HOME_SLOTS[flavours]`. `wanted` = `scoops` distinct flavours drawn from `counter`.
  - Unordered levels sort `wanted` in `FLAVOURS` order (the spoken order). Ordered levels keep the drawn sequence.
  - When `index > 0`, `wanted` differs from question `index − 1`'s: the set for unordered levels, the sequence for ordered levels. Re-derive with a salted rng; never loop unbounded.
  - The result is deterministic for `(seed, index, level)`. An out-of-range `level` is clamped.
- **Voice line ids** (`games/ice-cream/lines.ts`, pure):
  - `askLineId(q)`: for 1 scoop, `vo.ice-cream.ask.<f>` (spec-1-8). For unordered 2–3 scoops, `vo.ice-cream.ask.<f1>-<f2>[-<f3>]`. For ordered, `vo.ice-cream.ask-order.<f1>-<f2>-<f3>`.
  - `retryLineId(q, placedCount)`: unordered uses `vo.ice-cream.retry.<first remaining wanted>` (spec-1-8). Ordered uses `vo.ice-cream.order-first.<wanted[0]>` when nothing is placed, else `vo.ice-cream.order-next.<wanted[placed]>`.
  - A test enumerates every reachable `wanted` for every level (6 pairs, 4 triples, 24 ordered triples) and asserts each ask and retry id is in `VOICE_LINES`.
- **New voice lines** (listed literally in `content/voice-lines.ts`, unapproved, `keywordPauseMs: 300` where `|` appears; each must pass `voiceWords` ≤ 8, where sô-cô-la counts as 3 words and bạc hà as 2):

  | id pattern | count | text template | worst case |
  |---|---|---|---|
  | `ask.<a>-<b>` | 6 | "Cho Shiba \| <a> và <b>!" | 8 |
  | `ask.<a>-<b>-<c>` | 4 | "Cho Shiba \| <a>, <b>, <c>!" | 8 |
  | `ask-order.<a>-<b>-<c>` | 24 | "<A>, rồi <b>, rồi <c>!" (no `\|`) | 8 |
  | `order-first.<f>` | 4 | "Trước tiên là \| kem <vị>!" | 7 |
  | `order-next.<f>` | 4 | "Tiếp theo là \| kem <vị>!" | 7 |

  The vị words are dâu, sô-cô-la, vani and bạc hà. `assets.audio` keeps "every `vo.ice-cream.*` line", so the new lines load with the game.
- **Drop resolution changes** (`round.ts`; spec-1-8's drop order and the `home`/`rest`/`off` outcomes are unchanged). A `serve` of flavour `f` with `placed` so far is:
  - **correct** when `f ∈ wanted \ placed` and, on an ordered level, `f === wanted[placed.length]`;
  - **wrong** otherwise. That includes a flavour that is already placed (its respawned copy) and, at the top level, a wanted flavour in the wrong order. A wrong serve floats back and calls `hint.wrong()` exactly as in spec-1-8, with no other effect.
- **Correct serve that is not the last scoop:**
  - The scoop snaps to `slot.cone-<placed.length+1>`, so the stack follows the child's order. `sfx.ice-cream.snap` plays and a fresh scoop respawns at home.
  - Then `hint.stepDone(nextStep, { retryLineId: retryLineId(q, placed.length) })`. Shiba does not celebrate. The level is kept and the clock restarts (spec-1-9).
- **Correct serve of the last scoop:** the spec-1-9 order applies: `questionDone` → lock scoops → celebrate. The model then advances `questionIndex` at once, so a snapshot taken during the celebration points at the next question with `placed: []`.
  - If that was not the last question, the next question starts after `Timing.correctMusicMaxMs`, as in spec-1-8.
  - If it was the last (`index + 1 === ladder[level].questions`), there is no fade and no next question. The command `finishRound` fires after `Timing.roundCelebrationMs`, on the scene clock.
- **`HintStep` per stage:**
  - Unordered: `correct` = the remaining wanted draggables in spoken order, `distractors` = every other counter draggable (already-placed flavours included), `target` = the cone.
  - Ordered: `correct` = `[next in order]`, `distractors` = all the others.
  - The level-4 dimming of spec-1-9 therefore never dims a scoop that is still wanted.
- **Round tally** (`core/round-tally.ts`, pure, reusable by every game) with `beginQuestion()`, `level(l)`, `questionDone()` and `outcome(gameId): RoundOutcome`:
  - `questions` = the number of questions closed by `questionDone`.
  - `maxHintLevel` = the max level seen while any question was open.
  - `firstTryCorrect` = the number of closed questions whose own max level stayed 0.
  - `level()` with no open question is ignored, so the reset to 0 after `questionDone` cannot leak.
- **`MiniGameBase` changes** (spec-1-7 and spec-1-9 base):
  - `this.hint` becomes a thin wrapper over `createHint`. `beginQuestion` → `tally.beginQuestion()`. `questionDone` → `tally.questionDone()` before it is forwarded. The existing `hint:level` subscription (own key) feeds `tally.level`.
  - Protected `finishRound()` → `complete(tally.outcome(key))`.
  - `complete()` first runs the same cleanup as abandon (`hint.questionDone()`, `time.removeAllEvents()`), then the `RoundGuard` emits exactly one `round:complete` and the game is inert: input off, no hints, Home ignored.
  - **Home while finishing** (between the last `questionDone` and `finishRound`): `hud:home` calls `finishRound()` at once instead of abandon. The round counts and the child goes home.
- **`core/difficulty.ts › nextLevel(current, outcome, ladderLength)`** (pure, Vitest):
  - Clamp `current` to the ladder first, then apply +1 if `outcome.questions > 0 && firstTryCorrect === questions`, else −1 if `maxHintLevel === 4`, else 0.
  - Clamp the result to `[0, ladderLength − 1]`. `ladderLength < 1` gives 0.
- **Map on `round:complete`** (wiring; spec-1-7's return path is unchanged):
  - Synchronously on receipt, `SessionStore.recordRound(id, startedLevel, outcome, GAMES[id].ladder.length)`, which sets `levels[id] = nextLevel(...)`. `startedLevel` is the `level` Map passed in the start data, so Map keeps `{ id, level }` of the running game.
  - Then stop the game, release its assets, wake, and park the kart at the truck.
  - The next entry to the same game uses `levelFor(id)`, i.e. the new level. A cold start gives a fresh store, so level 0.

**Never:**
- No persistence of the level, no `ProgressStore.setDifficulty`, no decoration, camera pull-back, `PlayAgainOverlay` or resume (Epic 2).
- No difficulty logic in games or in `Map` beyond calling `nextLevel`. No runtime concatenation of voice lines. No game calls `audio.say`.
- No change to the HintDirector machine, the spec-1-4 layout format or the art. No new Blender render (three cone slots already exist).
- No red, ✗, shake, wrong sound, praise or "sai". No text on screen. No `setTimeout`.
- No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **Ladder shape:** four levels, from the story's sequence "1-of-2 → more flavours and 2–3 scoops → order at the top". Order is enforced only once the child has mastered 3 unordered scoops.
- **Scoops in one question are distinct flavours.** A repeated flavour would need "two strawberry" lines and counting, which is out of FR5.
- **`firstTryCorrect` means the question's hint level stayed 0:** no wrong drop and no time-escalated ring. Level ≥ 1 comes only from a wrong drop or from ≥ 6 s of idle help, so +1 means the child solved every question unaided.
- **Unordered prompts name the flavours in `FLAVOURS` order**, so 2- and 3-scoop prompts need 10 lines instead of 30. The retry names the first remaining flavour (EXPERIENCE Flow 2).
- **"Giọng nhắc lại thứ tự"** is the `order-first` / `order-next` line for the flavour expected next. The Speaker still replays the full `ask-order` line.
- **Multi-scoop prompts drop colour words** to fit the 8-word limit. The colour stays in the single-scoop and retry lines, and the scoop shapes carry the distinction.
- **The full celebration runs only on the last scoop of a question.** Intermediate scoops get only the snap sound, so there is one prominent motion and no praise inflation.
- **Home during the final celebration completes the round** rather than abandoning a finished round.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Level 0 round | `{level:0, seed:7}` | 3 questions, 2 scoops on the counter, 1 wanted; `round:complete` after the 3rd | — |
| Two any order | L1, wanted [strawberry, chocolate], child serves chocolate then strawberry | chocolate → cone-1, `stepDone(.., retry.strawberry)`; strawberry → cone-2, `questionDone`, celebrate | — |
| Duplicate | L1, strawberry placed, its respawn served | float back; `hint.wrong()`; placed unchanged | — |
| Ordered ok | L3, wanted [mint, vanilla, strawberry], served in order | cone-1..3; retries order-first.mint → order-next.vanilla → order-next.strawberry | — |
| Wrong order | L3, nothing placed, vanilla served | float back; `wrong()` speaks `order-first.mint` (rate-limited by 1.9) | — |
| Level-4 dim, unordered | L2, 1 of 3 placed, level 4 | only non-wanted and placed flavours dimmed; both remaining wanted pickable | — |
| Last question | final scoop snaps | celebrate; after 1500 ms exactly one `round:complete {gameId:'ice-cream', questions:5, firstTryCorrect, maxHintLevel}`; inert | — |
| Home while finishing | `hud:home` during that 1500 ms | `round:complete` now, never `round:abandon` | — |
| Home mid-celebration (not last) | after the question's `questionDone` | `round:abandon`, snapshot `questionIndex = index+1`, `placed: []` | — |
| Home mid-question | 1 of 2 placed | `round:abandon`, `partial.placed = [f]` | — |
| Tally | q1 clean; q2 one wrong; q3 idle to level 3 | `questions 3, firstTryCorrect 1, maxHintLevel 3` | — |
| nextLevel +1 | current 1, 4/4 first try, len 4 | 2 | — |
| nextLevel −1 | current 2, maxHint 4 | 1 | — |
| Clamp low | current 0, maxHint 4 | 0 | — |
| Clamp high | current 3, all first try | 3 | — |
| Neither | 3/4 first try, maxHint 3 | unchanged | — |
| Bad current | current 9 or −2, len 4 | clamped first (3 / 0), then the rule | — |
| Session level | complete at L0 with all first try, re-enter | started with `level: 1`; after reload `level: 0` | — |
| Determinism | same `(seed, index, level)` | identical question; consecutive `wanted` differ | — |
| Missing line | an `ask-order.*` combination absent | lines test and `npm run check` fail naming the id | exit 1 |

</intent-contract>

## Code Map

- `app/src/content/games/ice-cream.ts` -- planned in spec-1-8: `FLAVOURS`, one-level `ladder`, `HOME_SLOTS`, `assets`, `screen`. The ladder and its type are extended.
- `app/src/content/voice-lines.ts` -- real (literal `VOICE_LINES as const`); spec-1-8 adds `ask.<f>` / `retry.<f>`. Add the 42 lines. `app/src/content/validate.ts › voiceWords`, `MAX_VOICE_WORDS` -- real word rule; the id grammar `vo.<scope>.<intent>[.<subject>]` with kebab segments allows `ask.strawberry-chocolate`.
- `app/src/games/ice-cream/{questions,round,IceCream}.ts` -- planned in spec-1-8 (pure question/drop model, scene wiring), changed in spec-1-9 (command order, ambient).
- `app/src/games/mini-game-base.ts` -- planned in spec-1-7 (`RoundGuard`, `complete`, `abandon`, `hud:home`), spec-1-8 (`hint`, abandon cleanup) and spec-1-9 (`hint:level` subscription, ambient).
- `app/src/core/round-guard.ts`, `app/src/core/session-store.ts` (`levels`, `levelFor`, `startData`) -- planned in spec-1-7.
- `app/src/core/hint-director.ts` -- planned in spec-1-9 (`createHint`, `level`, `hint:level` emits).
- `app/src/scenes/Map.ts` -- planned in spec-1-7: terminal-event return path, `startData`.
- `app/src/content/types.ts` -- real `RoundOutcome`, `HintLevel`. `app/src/core/bus.ts` -- real `'round:complete'`. `app/src/core/timing.ts` -- real `roundCelebrationMs` (1500) and `correctMusicMaxMs`.

## Tasks & Acceptance

**Execution:**
- `app/src/core/difficulty.ts` (+ `difficulty.test.ts`) -- `nextLevel` with every rule, clamp and bad-input row.
- `app/src/core/round-tally.ts` (+ test) -- the tally, including the ignored post-close level 0 and the matrix tally row.
- `app/src/core/session-store.ts` (+ test) -- `recordRound`. A test checks that the next `levelFor` returns the new level and that a fresh store returns 0.
- `app/src/content/games/ice-cream.ts` (+ `ice-cream.test.ts` for the ladder rules) -- `IceCreamLevel` and the 4-level ladder.
- `app/src/content/voice-lines.ts` -- the 42 literal lines. Generate them with `cd app && npm run tts`.
- `app/src/games/ice-cream/lines.ts` (+ test) -- `askLineId` and `retryLineId`, with the exhaustive coverage test against `VOICE_LINES`.
- `app/src/games/ice-cream/questions.ts` (+ test) -- counter, `wanted`, sorting, the differs-from-previous rule, clamping and determinism over seeds 0..99 for every level.
- `app/src/games/ice-cream/round.ts` (+ test) -- multi-scoop and ordered serve rules, stage `HintStep`s, `stepDone` lines, last question → `finishRound` after `roundCelebrationMs`, the snapshot index advance. Cover every round row of the matrix.
- `app/src/games/mini-game-base.ts` -- the tallied `hint` wrapper, `finishRound`, the complete cleanup and Home while finishing.
- `app/src/games/ice-cream/IceCream.ts` -- apply the new commands: stacked slot index, `stepDone`, `finishRound`, scoops per `counter`.
- `app/src/scenes/Map.ts` -- keep `{ id, level }` of the running game, and call `recordRound` on `round:complete` before stopping it.

**Acceptance Criteria:**
- Given a fresh `npm run dev`, when the child drives to Tiệm kem and answers three single-scoop requests, then after the third Shiba celebrates for about 1.5 s, the island fades back with the kart parked at the truck, and exactly one `round:complete` with `questions: 3` was emitted. No overlay or decoration appears.
- Given the round was played with no wrong drop and no ring, when the child drives back to the truck, then the counter shows three flavours and the request names two ("Cho Shiba… dâu và vani!"). The scoops stack on the cone in the order the child places them.
- Given level 3 (set `SessionStore.levels['ice-cream'] = 3` in dev), when the child places a wanted scoop out of the spoken order, then it glides back and "Trước tiên là… kem bạc hà!" (or `order-next`) plays. A ring appears after the usual escalation.
- Given a round where one question reached hint level 4, when it completes, then re-entering starts one level lower (or stays at 0). After a page reload it starts at level 0.
- Given `cd app && npm run check`, then it exits 0, with the `nextLevel`, tally, ladder, lines-coverage, questions and round tests passing, and validate:content accepts the 42 new voice files.

## Spec Change Log

- **2026-10-09: `retryLineId(q, placed)` takes the placed flavours, not a count.** The unordered retry names the first remaining wanted flavour. That depends on which flavours are on the cone, not only on how many.
- **2026-10-09: the base finish API.**
  - The base cannot see a round model. `MiniGameBase` therefore gained `protected scheduleFinish(ms)` beside `finishRound()`. It sets "finishing" and calls `finishRound()` through `time.delayedCall`.
  - Tiệm kem's `finishRound` command calls `scheduleFinish(c.afterMs)`. A Home tap while finishing calls `finishRound()` at once.
  - `hint` is now a read-only tallied wrapper over the hint system that `protected createHintSystem()` returns. Tests override that hook instead of assigning `hint`.
  - Terminal cleanup ends the raw hint question, so an open (unanswered) question is never counted.
- **2026-10-09: the re-draw.**
  - ESLint bans magic numbers in game code, so the salt lives in `core/rng.ts › redrawSeed(qSeed)`.
  - When the first draw repeats the previous request, one salted rng picks among the requests from the counter that differ. This is bounded, with no loop.
  - As a result, level 0's targets differ from 1.8's for the same seed.
- **2026-10-09: small shapes.**
  - `Question` keeps `scoops` (the counter with its homes) and gains `ordered`.
  - The `beginQuestion`/`stepDone` commands carry the line ids and the stage's scoop ids.
  - `RoundGeometry` gains `finishDelayMs` (`Timing.roundCelebrationMs`).
  - The round model clamps its level.
  - `core/game-assets.test.ts` now expects 50 `vo.ice-cream.*` lines.

## Review Triage Log

## Design Notes

**Why the tally sits behind `MiniGameBase`:** every game already reports its questions through `hint.beginQuestion` / `questionDone`, and its levels through `hint:level`. Counting there gives Epics 3–4 a correct `RoundOutcome` for free and keeps difficulty policy out of games (AD-1). The game only says when the round is over:

```ts
// round.ts command after the last questionDone
{ kind: 'finishRound', afterMs: Timing.roundCelebrationMs }
// IceCream.apply → this.time.delayedCall(c.afterMs, () => this.finishRound())
```

**Why questions advance on `questionDone`:** a Home tap during a celebration must not save an answered question as "in progress" for Epic 2's resume.

## Verification

**Commands:**
- `cd app && npm run tts` -- expected: 42 new `vo.ice-cream.*` `.m4a` and `.hash` files are written; a second run skips them.
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run build` -- expected: exit 0.

**Manual checks:**
- Run the AC walkthroughs at 1180×820 touch emulation. Listen to a sample of the `ask-order` lines and confirm the order reads clearly and slowly at rate 0.85.
- At level 2, confirm three stacked scoops sit visibly on the cone (`slot.cone-1..3`) without covering Shiba's face.

## Auto Run Result

**Status:** in-review. `cd app && npm run check` exits 0: 54 test files, 638 tests. `validate:content` reports 60 voice lines OK. `npm run build` exits 0.

**Summary:**
- **Ladder:** `content/games/ice-cream.ts` has the 4-level ladder (`one-of-2`, `two-of-3`, `three-of-4`, `three-in-order`), with 3/4/5/5 questions. `assets.audio` loads every `vo.ice-cream.*` line.
- **Voice lines:** 42 new literal lines in `content/voice-lines.ts` (6 pairs, 4 triples, 24 ordered triples, 4 `order-first`, 4 `order-next`). All are unapproved and all are at most 8 words. `npm run tts` wrote all 42 on its first run, and a second run skipped all 60.
- **Questions:** `games/ice-cream/questions.ts` builds the counter and a distinct `wanted`. Unordered requests use the spoken order. Consecutive requests differ (one bounded salted re-draw), and the level is clamped. `games/ice-cream/lines.ts` holds `askLineId` and `retryLineId`.
- **Round model:** `games/ice-cream/round.ts` handles multi-scoop and ordered serves.
  - Placed or out-of-order flavours are wrong.
  - Scoops stack on `cone-1..3`.
  - Every scoop except the last sends `stepDone` with the next stage and its retry line.
  - The last scoop sends `questionDone` and celebrates, and the index advances at once.
  - After the last question, `finishRound` follows after 1500 ms.
- **Core:** pure `core/round-tally.ts` and `core/difficulty.ts › nextLevel`. `SessionStore.recordRound` keeps levels in memory only.
- **`MiniGameBase`:** a tallied `hint` wrapper, `scheduleFinish`/`finishRound`, and the shared terminal cleanup. A Home tap while finishing completes the round.
- **Map:** keeps `{ id, level }` of the running game and calls `recordRound` on `round:complete` before it stops the game.

**Files changed:** the list is in `.changed-1-10.txt`.
- New:
  - `app/src/core/difficulty.ts` and its test: `nextLevel`.
  - `app/src/core/round-tally.ts` and its test: the tally.
  - `app/src/content/games/ice-cream.test.ts`: the ladder rules and the audio list.
  - `app/src/games/ice-cream/lines.ts` and its test: the line ids, with exhaustive coverage.
- Changed:
  - `core/session-store.ts` and its test: `recordRound`.
  - `core/rng.ts`: `redrawSeed`.
  - `content/games/ice-cream.ts`: the ladder and the audio list.
  - `content/voice-lines.ts`: the 42 lines.
  - `games/ice-cream/questions.ts`, `round.ts` and their tests: multi-scoop, order and the round end.
  - `games/ice-cream/IceCream.ts`: applies `stepDone` and `finishRound`, and uses the line ids from the commands.
  - `games/mini-game-base.ts` and `games/registry.test.ts`: the tally, the finish, and Home while finishing.
  - `scenes/Map.ts`: `recordRound`.
  - `core/game-assets.test.ts`: expects 50 ice-cream lines.
- Assets: 42 `.m4a` and 42 `.hash` files in `app/public/assets/audio/vo/`.

**Verification:**
- `npm run tts`: 42 written. The re-run wrote 0 and skipped 60.
- `npm run check`: exit 0, with 638 tests.
- `npm run build`: exit 0.

**Residual risks:**
- `IceCream.ts` scene wiring (`stepDone` stage swaps, stacked cone slots, `scheduleFinish`) is covered only through the pure model and the base tests. There was no headless browser run this time.
- Map's `recordRound` wiring has no unit test. It is one call before the existing return path.
- The level stays in memory until Story 2.1.

**Manual checks still due:**
- Run the AC walkthroughs at 1180×820 touch emulation:
  - a level 0 round ends after 3 questions and the island fades back;
  - re-entering after a clean round shows 3 flavours and 2 requested scoops;
  - at level 3 (`SessionStore.levels['ice-cream'] = 3` in dev) an out-of-order scoop glides back with the `order-first`/`order-next` line;
  - a reload goes back to level 0.
- Listen to a sample of the `ask-order` lines at rate 0.85.
- At level 2, check that three stacked scoops on `slot.cone-1..3` do not cover Shiba's face.

**Review (lean loop, 2026-10-08):** No high or medium findings. Low fixed: RoundTally.beginQuestion counted an open question as closed; it now discards it, with a new test. Low rejected: Map recordRound wiring has no scene-level test, since it needs a Phaser scene harness; this is covered by manual AC walkthroughs. npm run check exit 0.
