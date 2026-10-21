---
title: 'Story 4.4 — Câu cá: câu theo kích thước, thang 3→5 cá và giữ câu dở'
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
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-3-cau-ca-cham-dung-ca-theo-mau.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-2-duong-dua-thang-hinh-dang-giu-vi-tri-kart.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-giu-luot-do-trong-phien.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-tiem-kem-luot-3-5-cau-do-kho-tang-dan.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** After Story 4.3, Câu cá has one ladder level: 3 fish of 3 colours and colour questions only. The size concept ("cá to" / "cá nhỏ") from FR13 is never asked, the pond never gets busier for a child who does well, and the fishing `partial` is never validated on resume. So FR13/FR14's ladder (3 colours → size → mixed → 5 fish) is missing, and so is the AC's proof that a resumed round returns to the same question.

**Approach:**
- **Content:** a 4-level ladder and 4 size voice lines.
- **Questions:** the pure `questions.ts` learns size questions, mixed rounds and 4–5 fish. It uses one general fish-set rule for every level.
- **Round model:** it adds `resumeQuestion` for the empty `partial`.
- **No art change:** 4.3 already rendered both sizes and sized the pond for `FISH_CAPACITY = 5` big fish. No scene, input or HintDirector change is planned either: the 4.3 scene spawns whatever `q.fish` holds, and correctness goes through one pure predicate.
- **Tests:** they prove the 5-fish swim log, determinism, the resume and `nextLevel` on the 4-level ladder.

## Boundaries & Constraints

**Always:**
- **Ladder** (`content/games/fishing.ts`, data only; 4.3's `FishingLevel` is unchanged):

  | index | id | ask | fish | questions |
  |---|---|---|---|---|
  | 0 | `color-3` | `color` | 3 | 3 (4.3) |
  | 1 | `size-3` | `size` | 3 | 4 |
  | 2 | `mixed-4` | `mixed` | 4 | 4 |
  | 3 | `mixed-5` | `mixed` | 5 | 5 |

  - A new constant `SIZE_ASK_RUN_MAX = 2` is the longest run of the same size request.
  - `fishing.test.ts` checks:
    - there are ≥ 4 levels in this order of `ask`;
    - `fish` is non-decreasing and in [3, `FISH_CAPACITY`];
    - `questions` ∈ [3, 5];
    - the last level has 5 fish.
- **Question type** (`games/fishing/questions.ts`): `FishQuestion = { ask:'color'; color; fish } | { ask:'size'; size; fish }`, where `fish: { color, size }[]`.
  - The pure `isCorrect(q, f)` compares only the asked attribute.
  - Every caller in `round.ts` and `lines.ts` uses `isCorrect` and never compares colours inline.
- **`roundQuestions(seed, level)`** (pure, `mulberry32(seed >>> 0)`, `level` clamped; the length is `questions`):
  - **Ask kind per question:**
    - `color` and `size` levels use their own kind.
    - On a `mixed` level, each question draws its kind from the seed, and a round holds ≥ 1 of each kind. If every draw is the same kind, the last question flips.
  - **Request:**
    - A colour question's colour differs from the previous colour question's colour (the 4.3 rule).
    - A size question's size never makes a run longer than `SIZE_ASK_RUN_MAX`.
    - A round with ≥ 2 size questions asks both sizes.
  - **Fish set** for `N = level.fish` (exactly one fish matches the request):
    - **Colour question:** the correct fish has the asked colour and a seeded size. The other `N − 1` fish use only the other two colours, with counts differing by ≤ 1, and each has a seeded size. On level 0 this gives 3 distinct colours, as in 4.3.
    - **Size question `s`:** the correct fish is `(c, s)`, with `c` from the seed. The other `N − 1` fish all have the other size `s̄`. Their colours include `c` (the twin), and the counts over the 3 colours differ by ≤ 1. So a small and a big fish of the same colour are always on screen, and size is the only difference between them.
    - The fish order is a seeded shuffle, so the correct fish is not always spawned first.
  - `questionSeed(seed, i)` and the swim placement are the 4.3 functions, unchanged.
- **Lines** (`games/fishing/lines.ts`):
  - For a size question, `promptLineId` is `vo.fishing.prompt.size-<s>` and `retryLineId` is `vo.fishing.retry.size-<s>`.
  - Colour ids and `nameLineId(f) = vo.fishing.name.<c>-<s>` are unchanged, so the caught fish's name always includes its size ("Cá cam to!").
  - The 4.3 coverage test, which enumerates every reachable id of every ladder level, now covers all 4 levels.
- **Round model** (`games/fishing/round.ts`, pure; spec-2-5 contract):
  - `resumeQuestion(index, partial) → {} | null` returns null unless `partial` is a plain object with no own keys.
  - `start(resumeAt)` keeps 4.3's index rule: an out-of-range index warns once and begins question 0. For the resumed index, a null `resumeQuestion` warns once and begins that question clean.
  - Fishing has no partial progress, so "clean" and "restored" begin the same way: every fish is surfaced at its `questionSeed` start, `hint.beginQuestion` runs (prompt re-read, level 0), and no dive is carried over.
  - The tap, dive, catch and celebration paths of 4.3 are unchanged, but they use `isCorrect`. Tapping a small fish on a "cá to" question dives exactly like any wrong fish.
  - `progress()` stays `{ questionIndex, partial: {} }`.
- **Scene** (`Fishing.ts`): no planned change. It must already:
  - spawn `q.fish.length` fish (3–5) through `swim.place()`;
  - build the hint step from `isCorrect` (1 correct, `N − 1` distractors);
  - size every container from its own `fish-<c>-<s>` frame.

  If 4.3 hard-coded any of these, fix it here.
- **Motion with 5 fish** (4.3's `swim.ts`, unchanged):
  - The speed is ≤ `fish.speedMax` (× `ui.fishReducedSpeedScale` under reduced motion).
  - Every body rect stays inside the pond.
  - Rect gaps are ≥ `spacing.targetGap`.
  - At hint level ≥ 2, only the correct fish moves (`setCalm`).
  - The correct fish never dives, so ≥ 1 correct fish is always on screen.
- **Difficulty:** the game has no difficulty logic. `nextLevel` (spec-1-10) is applied by Map with `GAMES.fishing.ladder.length` (4).

**Never:**
- No question that asks colour and size together. No prompt that names a pattern on a size question.
- No art, layout, atlas, pond, token-colour or HUD change. No new frames. 4.3 rendered both sizes and proved the 5-fish capacity.
- No change to the snapshot envelope, `SnapshotPartials.fishing`, `MiniGameBase`, HintDirector, `nextLevel` or the tap/moving-pick input.
- No red, ✗, error sound, praise or "sai". No text on screen. Water taps never call `wrong()`.
- No `setTimeout`, `this.sound`, `this.load` or `scene.*` in `games/fishing`. No magic numbers in games.
- No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **The ladder is 3 colour → 3 size → 4 mixed → 5 mixed**, with 3/4/4/5 questions:
  - The size level keeps 3 fish so that only the asked attribute changes from level 0. That is within the epic's "3–4".
  - The 5-fish level stays mixed, because "5 cá" names a count, not a new question kind.
- **Exactly one correct fish per question**, as in 4.3. The hint step has one ring target, and "first try" stays unambiguous.
- **Balanced colours** (counts differ by ≤ 1) keep the screen varied, with no all-yellow pond. With 5 fish, two fish may look identical. They are always distractors, so this is harmless.
- **Size runs:** strict alternation on a 4-question size level would teach "it alternates" instead of "to/nhỏ", so up to 2 repeats are allowed. Colour asks keep 4.3's no-repeat rule.
- **`resumeQuestion` for `{}`:** a non-empty partial is corrupt (warn once). It still begins the same question, because nothing else is restorable. The AC's "chạm sai 1 lần" is not restored: the open question's wrong tap is not in the base tally (spec-2-5 counts closed questions only), and the dived fish starts surfaced.
- **Voice lines** (unapproved, `keywordPauseMs: 300`):

  | id | text | words |
  |---|---|---|
  | `vo.fishing.prompt.size-big` / `size-small` | "Câu con cá \| to nào!" / "Câu con cá \| nhỏ nào!" | 5 |
  | `vo.fishing.retry.size-big` / `size-small` | "Con cá \| to nhé!" / "Con cá \| nhỏ nhé!" | 4 |

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Size round | `{level:1, seed:7}` | 4 questions, all `size`; each has 3 fish: 1 of the asked size and 2 of the other, one of which shares the correct fish's colour; prompt `prompt.size-<s>` | — |
| Size runs | level 1, seeds 1–500 | no run of > 2 equal sizes; both sizes asked in every round | — |
| Mixed | level 2/3, seeds 1–500 | ≥ 1 colour and ≥ 1 size question each; no question has both; colour asks never repeat consecutively | — |
| Fish count | every level, seeds 1–500 | `fish.length === level.fish`; exactly one `isCorrect`; colour counts among the others differ by ≤ 1 | — |
| Determinism | same `(seed, level)` twice | identical questions, fish order and `place()` positions from the generated layout | — |
| Clamp | `level: 9` | level 3 questions | — |
| Small on big ask | tap the small twin | dives; `hint.wrong()`; resurfaces after 3000 ms | — |
| Catch name | catch the correct `(orange, big)` | `say vo.fishing.name.orange-big` ("Cá cam to!") | — |
| 5-fish swim log | level 3, 5 fish, 600 ticks × 16 ms, seeds 1–20, normal and reduced | step ≤ speedMax × dt (× 0.6 reduced); rects inside the pond; gaps ≥ 24; the correct fish is never diving | — |
| Calm | `setCalm([correct])` | only the correct fish moves, at half speed | — |
| Home at q3 | level 2, q1–q2 caught, 1 wrong tap on q3, `hud:home` | one `round:abandon`; snapshot `toMatchObject {v:1, level:2, seed, questionIndex:2, partial:{}}`; `isJsonOnly` true | — |
| Resume | that snapshot as `resume` | question 2 deep-equals `roundQuestions(seed,2)[2]`, the same start positions, every fish surfaced; prompt re-read; level 0 | — |
| Bad partial | `partial` `{x:1}`, `[]` or `null` | question 2 begins clean | console.warn once |
| Bad index | `questionIndex 9` | question 0 | console.warn once |
| nextLevel | L0 perfect / L1 maxHint 4 / L0 maxHint 4 / L3 perfect (len 4) | 1 / 0 / 0 / 3 | — |

</intent-contract>

## Code Map

- `app/src/content/games/fishing.ts` (+ `fishing.test.ts`) -- planned in spec-4-3 (`FishingLevel`, the 1-level `ladder`, `FISH_CAPACITY`, `FISH_COLORS`/`FISH_SIZES`, `assets` listing every `vo.fishing.*`). Extend the ladder and add `SIZE_ASK_RUN_MAX`.
- `app/src/games/fishing/questions.ts` (+ test) -- planned in spec-4-3 (`roundQuestions`, `questionSeed`). Widen `FishQuestion`, add `isCorrect` and replace the generator with the general rule.
- `app/src/games/fishing/lines.ts` (+ test) -- planned in spec-4-3. Add the size ids.
- `app/src/games/fishing/round.ts` (+ test) -- planned in spec-4-3 (`start`, `tap`, `reeled`, `speechEnded`, `progress`). Add `resumeQuestion` and switch to `isCorrect`.
- `app/src/games/fishing/swim.ts` (+ test) -- planned in spec-4-3, unchanged. Add the 5-fish log tests.
- `app/src/games/fishing/Fishing.ts` -- planned in spec-4-3. Check that it is generic over the fish count.
- `app/src/games/mini-game-base.ts`, `app/src/core/snapshot.ts` (`makeSnapshot`, `isJsonOnly`, `readResume`), `app/src/core/difficulty.ts` (`nextLevel`) -- planned in spec-2-5/1-10, unchanged.
- `app/src/content/voice-lines.ts`, `app/src/content/validate.ts` (`VOICE_ID`, `BANNED_PAIRS` incl. `cá/cà`) -- real. Add 4 lines.
- `app/src/content/generated/fishing.layout.json` -- generated by spec-4-3, read by the determinism and swim tests.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/content/voice-lines.ts` -- add the 4 size lines. Generate them with `npm run content:export && npm run tts`.
- [x] `app/src/content/games/fishing.ts` (+ `fishing.test.ts`) -- the 4-level ladder and `SIZE_ASK_RUN_MAX`, with the ladder-shape test.
- [x] `app/src/games/fishing/questions.ts` (+ `questions.test.ts`) -- `FishQuestion` union, `isCorrect` and `roundQuestions` per the Boundaries. Cover the size, size-run, mixed, fish-count, determinism and clamp rows over seeds 1–500, and keep 4.3's level-0 assertions passing.
- [x] `app/src/games/fishing/lines.ts` (+ `lines.test.ts`) -- the size prompt and retry ids. The coverage test iterates every ladder level and checks `VOICE_LINES`.
- [x] `app/src/games/fishing/round.ts` (+ `round.test.ts`) -- `resumeQuestion` and the `isCorrect` switch. Cover the small-on-big, catch-name, Home-at-q3 (via `makeSnapshot` + `toMatchObject` + `isJsonOnly`), resume, bad-partial and bad-index rows.
- [x] `app/src/games/fishing/swim.test.ts` -- the 5-fish swim log (normal and reduced), calm, and the placement determinism against the generated layout.
- [x] `app/src/games/fishing/round.test.ts` (or `core/difficulty.test.ts`) -- the four `nextLevel` rows with `ladder.length`.
- [x] `app/src/games/fishing/Fishing.ts` -- only if 4.3 assumed 3 fish or compared colours inline: make the spawn and hint step generic over `q.fish` and `isCorrect`.

**Acceptance Criteria:**
- Given `npm run dev` with `game.scene.start('fishing', { level: 1, seed: 7 })`, when the screen appears, then three fish swim, one big and two small (or the reverse), and two of them share a colour. "Câu con cá… to nào!" (or "nhỏ") plays. Tapping the other-size twin makes it dive, and catching the right one reads e.g. "Cá cam to!". Starting again with the same seed shows the same fish in the same start positions.
- Given `{ level: 3, seed: 5 }`, then five fish swim without overlapping or touching the corners or the Home/Speaker zones. Over the round, both colour and size requests appear, never both in one prompt. When the ring appears, only the ringed fish moves.
- Given `prefers-reduced-motion`, then five fish swim slower, a wrong fish only fades (no bubbles), and the wriggle and jump are smaller.
- Given question 3 of a level-2 round after one wrong tap, when the child taps Home and the game is started again with `{ level: 2, seed, resume: snapshot }` (DevTools, or with Epic 2 by re-entering the pond), then the same request and fish return, the prompt is re-read, and help starts from level 0.
- Given a level-2 round finished with every question first-try, when Map applies `nextLevel`, then the next fishing round starts at the 5-fish level. A round with a level-4 hint steps down one level, clamped at 0.
- Given `cd app && npm run check`, then it exits 0. validate:content finds exactly one line, file and hash for every ladder-reachable `vo.fishing.*` id, and the homophone check passes.

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

- 2026-10-12: subagent review layers NOT run (not authorised); inline self-review. Notes: (1) built back to back with 4.3 per the cross-notes: the general fish-set rule, `isCorrect`, `resumeQuestion` and the fish-count-generic scene came with 4.3; this story added the ladder, the 4 size lines and the tests. (2) Tests live in `games/fishing/fishing-ladder.test.ts` (+ 4.3's `fishing.test.ts`). (3) In-browser AC walkthroughs not run.

## Design Notes

**One fish-set rule for all levels.** Using "exactly one match; others balanced over the allowed colours" everywhere avoids per-level special cases. It also makes the twin guarantee fall out of the size branch:

```ts
// size question, N = 4, asked 'big', correct colour 'orange'
others = balanced(N - 1, FISH_COLORS, mustInclude: 'orange')  // e.g. orange, yellow, blue
fish   = shuffle([{orange,big}, ...others.map(c => ({c, small}))], rng)
```

**Why the scene should need no change:** 4.3 built the scene to spawn from `q.fish`, size each container from its own frame and take `correct`/`distractors` from the model. 4.4 changes only data and pure functions, so every new rule is testable in Node.

## Verification

**Commands:**
- `cd app && npm run content:export && npm run tts` -- expected: 4 new `vo.fishing.*size-*` `.m4a` + `.hash`; a second run skips them.
- `cd app && npm run check` -- expected: exit 0. The ladder, questions, lines, round, swim and nextLevel tests pass, and validate:content accepts the new voice files.
- `cd app && npm run build` -- expected: exit 0.

**Manual checks:**
- At 1180×820 and 1024×768, start each level from DevTools (`game.scene.start('fishing', { level, seed })`): the fish count matches the level, and size questions always show a same-colour pair of both sizes.
- Run the resume flow from the AC.
- With multi-touch on level 3: hold one finger on the water and tap a fish with another, and nothing happens.
