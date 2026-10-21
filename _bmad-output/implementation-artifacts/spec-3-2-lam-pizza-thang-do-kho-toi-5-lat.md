---
title: 'Story 3.2 — Làm pizza: thang độ khó tới 5 lát, nhiều loại topping và lượt dở'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'NO_VCS'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-cross-notes.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-danh-thuc-tiem-pizza-be-dem-topping.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-giu-luot-do-trong-phien.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-tiem-kem-luot-3-5-cau-do-kho-tang-dan.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-9-goi-y-leo-thang.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** After Story 3.1, Tiệm pizza has a temporary one-level ladder (3 questions, 1–3 slices, sausage and mushroom). `nextLevel` therefore always returns 0. There are no 4- or 5-slice requests and no third topping, so FR9's "tới 5" and the harder level are missing. A resumed round also always restarts its question with an empty base: spec-3-1 snapshots `placed` but never restores it (FR27 for pizza).

**Approach:**
- **Ladder:** `content/games/pizza.ts` gets the 3-level ladder and a third topping, `pepper` (a green bell-pepper ring from Kenney `paprika-slice.glb`).
- **Questions:** the pure `roundQuestions(seed, level)` gains round-level constraints. The ice-cream question model is the pattern to copy.
- **Art:** the art builder renders a pepper slice and turns every bowl into its own sprite, so the counter shows exactly the level's bowls.
- **Voice:** the voice catalogue covers every topping × count 1–5. "năm lát nấm" is flagged for a parent to review.
- **Resume:** the round model gains `resumeQuestion`, so a resumed question shows its placed slices at their old spots without re-counting them.

## Boundaries & Constraints

**Always:**
- **Content** (`content/games/pizza.ts`, data only):
  - `TOPPINGS = ['sausage', 'mushroom', 'pepper'] as const`. The level's toppings are the first `toppings` entries.
  - `ladder`:

    | idx | id | toppings | minSlices | maxSlices | questions |
    |---|---|---|---|---|---|
    | 0 | `count-1-3` | 2 | 1 | 3 | 3 |
    | 1 | `count-2-4` | 2 | 2 | 4 | 4 |
    | 2 | `count-3-5` | 3 | 3 | 5 | 5 |

  - The spec-3-1 content test is extended. It checks that:
    - `ladder.length === 3`;
    - `minSlices` and `maxSlices` never decrease;
    - every level raises `maxSlices`;
    - `maxSlices ≤ min(5, BASE_SLOTS)` and `minSlices ≥ 1`;
    - `toppings ≤ TOPPINGS.length`;
    - `questions` is 3, 4 and 5 for levels 0, 1 and 2.
  - `screen.frames` adds `bowl-<t>/idle/00` for every topping and `topping-pepper/idle/00`.
- **Questions** (`games/pizza/questions.ts › roundQuestions(seed, level) → { topping, count }[]`, pure; replaces spec-3-1's per-question draw):
  - Clamp `level`. Draw a whole candidate round from `mulberry32(seed + attempt × SALT)` for `attempt` 0…31. Each question picks a topping from the level's toppings and a count in `[minSlices, maxSlices]`.
  - Accept the first candidate with all three properties:
    1. no question equals its predecessor in **both** topping and count (spec-3-1's reading);
    2. at least one question has `count === maxSlices`;
    3. every topping of the level appears at least once.
  - If all 32 candidates fail, use the deterministic `fallbackRound(seed, level)`:
    - topping `i` = `toppings[(i + seed) mod k]`;
    - count `i` = `maxSlices − (i mod span)`.

    It satisfies all three properties by construction.
  - The result is identical for the same `(seed, level)`.
- **Lines:**
  - `lines.ts` is unchanged in shape: `askLineId`, `retryLineId`, `enoughLineId`, `countLineIds` and `BAKE_LINE`.
  - spec-3-1's coverage test now walks all 3 levels. A second test asserts that every `topping × 1–5` ask, every `retry.<t>`, `enough.1–5` and `count.1–5` id is in `VOICE_LINES` (the AC's "mọi tổ hợp").
- **Round model** (`games/pizza/round.ts`, extending spec-3-1):
  - **`resumeQuestion(index, partial) → { placed: number[] } | null`**, pure. It returns `null` (invalid) unless all of these hold:
    - `partial` is a plain object;
    - `partial.placed` is an array of distinct integers in `1…BASE_SLOTS`, with length ≤ `roundQuestions(seed, level)[index].count`;
    - `partial.baked === false`.

    Extra keys are ignored.
  - **`beginQuestion(index, placed = [])`** emits, in order:
    1. `restoreSlices{ slots: placed }`: the scene puts locked slices of the question's topping straight on those `slot.base-<n>`, at `pizzaPlacedSlicePx`, with no tween, no sfx and no count voice.
    2. Then one of two branches:
       - **`placed.length < count`:** stage `toppings`, then `beginQuestion({ promptLineId: askLineId(q), retryLineId: retryLineId(q), step: toppingStep })`.
       - **`placed.length === count`** (Home was tapped during the recount or in the oven stage): stage `oven`, no recount, `ovenReady` (the frame plus the ready ring), then `beginQuestion({ promptLineId: BAKE_LINE, retryLineId: enoughLineId(count), step: ovenStep })`. This uses the same step rules as spec-3-1's `stepDone`.
  - A placed slice still goes to the **lowest free** slot. Its count line is `count.<placed.length>`, so a resume with `[1, 2]` makes the next slice say "Ba!".
  - `progress()` stays `{ questionIndex, partial: { placed, baked: false } }`. `placed` lists the slot numbers in placement order, restored ones first.
- **Hint step at 3 toppings:** `toppingStep.distractors` = for each other topping of the level, its bowl sprite, then its bowl slice and its loose slices, all as `HintItem`s. `correct` and `target` are as in spec-3-1. So level 4 dims both wrong bowls and their slices to 60% and makes them unpickable, and `setSnapScale(base, 2)` widens only the `r` part of the padded target. Nothing is ever placed by the app.
- **Scene** (`Pizza.ts`):
  - Draw `bowl-<t>/idle/00` at `anchor.bowl-<t>` and a slice at `slot.bowl-<t>` only for the level's toppings. The other bowls are not created.
  - `build()` follows spec-2-5's pattern:
    - out-of-range `questionIndex` → warn once, start at question 0 (spec-3-1);
    - `resumeQuestion` null → `console.warn('pizza: bad resume partial')` once, then begin that question clean;
    - otherwise `beginQuestion(index, placed)`.

    No error is shown.
- **Art** (`tools/render/blender/build_pizza.py`):
  - **Pepper slice:** Kenney `food-kit/.../paprika-slice.glb`, recoloured `art.pizza.pepper`, posed at `slot.bowl-pepper`, with a trimmed width of at least 90 design px. It must read as a hollow lobed ring. If the GLB's silhouette has no hole, the builder builds the ring itself (a bmesh torus with 3 lobes) and prints one warning.
  - **Bowls leave the plate:** each topping gets a collection `sprite.bowl-<t>` (`states {"idle":[1]}`): Kenney `bowl.glb` with its static pile.
  - **Row** in the lower third, left to right: pepper bowl, sausage bowl, base, mushroom bowl, oven. The builder's named constants are tuned until `validatePizza` passes.
  - spec-3-1's id and rule loops already iterate `TOPPINGS`, so `slot.bowl-pepper` / `anchor.bowl-pepper` become required with no new rule code. `validatePizza` additionally requires each `bowl-<t>/idle/00` frame.
- **Voice:**
  - The 14 new lines are unapproved, use `keywordPauseMs: 300` where `|` appears, and follow spec-3-1's templates:

    | id | text | words |
    |---|---|---|
    | `ask.sausage.4/.5` | "Bé ơi, \| bốn/năm lát xúc xích nào!" | 7 |
    | `ask.mushroom.4/.5` | "Bé ơi, \| bốn/năm lát nấm nào!" | 6 |
    | `ask.pepper.1–5` | "Bé ơi, \| <một…năm> lát ớt chuông nào!" | 7 |
    | `retry.pepper` | "Mình lấy \| ớt chuông nhé!" | 5 |
    | `enough.4/.5` | "Đủ bốn/năm lát rồi!" | 4 |
    | `count.4/.5` | "Bốn!", "Năm!" | 1 |

  - The sausage lines carry `review` (spec-3-1 rule). `REVIEW_WORDS` gains the phrase `'năm lát nấm'`, so `ask.mushroom.5` must carry `review: 'năm/nấm đứng cạnh nhau – nếu nghe lẫn, đổi thành "Bé ơi, năm lát nhé, | lát nấm nào!"'` (8 words).
- **Tokens:** `art.pizza.pepper = '#84C94F'` (relative luminance ≈ 0.47, against sausage ≈ 0.15 and mushroom ≈ 0.80). spec-3-1's pairwise luminance-gap test (≥ 0.3) now covers 3 pairs.

**Never:**
- No difficulty logic in the game. Only Map's `nextLevel(…, ladder.length = 3)` changes the level.
- No re-count of restored slices, no auto-placing, no auto-baking, and no `SessionStore` access from the game.
- No change to the `SnapshotPartials.pizza` shape or the spec-2-5 envelope. No 4th level, no topping beyond 3, no count above 5.
- No red, ✗, shake, wrong sound, praise, "sai" or on-screen text. No hand-entered coordinates and no hex in the game.
- No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **Third topping = green bell pepper ("ớt chuông")**, from Kenney `paprika-slice.glb`:
  - its hollow lobed ring differs in shape from the solid dotted disc (sausage) and the capped stem (mushroom);
  - its mid luminance clears the 0.3 gap to both;
  - it forms no banned pair, and broccoli ("bông cải") would clash with "bóng/bông".
- **`baked` is kept** in `SnapshotPartials.pizza` (no contract churn) and is always `false`, as spec-3-1 explains. `baked: true` is treated as corrupt.
- **Full base on resume** goes to the oven stage with the bake line as the replayed prompt. That is the prompt current at that stage, and it honours "do not re-count".
- **Restored slots are used as stored** (any distinct slots), not forced to `1…n`. This keeps "đúng slot cũ" literal, and lowest-free filling continues correctly.
- **Every topping of the level appears once per round.** The story adds a topping "khi em đã làm tốt", and a level-2 round that never asks for it would not practise it.
- **All 15 ask lines are produced**, including the unreachable `pepper.1/.2`, because the AC asks for every combination.
- **Bowls become sprites** because a third bowl baked into `bg.pizza` would show at levels 0–1 and break "số bát đúng theo bậc". Bowl positions are fixed, so at levels 0–1 the pepper place is plain counter.
- **Bowls are dimmed as distractors** because the AC dims "hai bát sai", not only their slices. A `HintItem` with no `onLiftChange` is valid (spec-3-1).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Level 0 | `{level:0, seed}` | 3 questions, counts 1–3, sausage and mushroom bowls only, a 3 present, both toppings asked | — |
| Level 1 | `{level:1}` | 4 questions, counts 2–4, 2 bowls, a 4 present | — |
| Level 2 | `{level:2}` | 5 questions, counts 3–5, 3 bowls, a 5 present, pepper asked ≥ once | — |
| Clamp | `level 7` / `−1` | treated as 2 / 0 | — |
| Determinism | seeds 0…999 × each level | identical on repeat; every property holds | — |
| Fallback | `fallbackRound` for each level and seeds 0…99 | all three properties hold | — |
| Five mushrooms | L2, "Bé ơi, năm lát nấm nào!", 5 correct drops | `count.1`…`count.5` in turn; then `sayChain(count.1…5)` with 5 bounces; then the oven is ready | — |
| Level-4 hint | L2, idle/wrong until level 4 | sausage and pepper bowls and slices at 60%, unpickable; mushroom bowl slice pickable; base snap ×2; nothing placed | — |
| Home mid-question | L1, question index 2, 2 of 4 sausage placed | `round:abandon`; snapshot ⊇ `{v:1, level:1, seed, questionIndex:2, partial:{placed:[1,2], baked:false}}`; `JSON.parse(JSON.stringify)` round-trips | — |
| Resume partial | that snapshot | slots 1–2 hold slices at once, with no count or pụp; ask line replayed; level 0; next drop → slot 3, "Ba!" | — |
| Resume gap | `placed:[1,3]`, count 4 | slices at 1 and 3; next → slot 2, "Ba!" | — |
| Resume full | `placed:[1,2,3]`, count 3 | 3 slices, oven ready + ring, "Mình nướng bánh nào!", no recount | — |
| Bad partial | `{}`, `placed:'x'`, `[0]`, `[9]`, `[1,1]`, `[1.5]`, length > count, `baked` missing or `true` | empty base, ask replayed | console.warn once |
| Outcome | L2 round, q4 one extra slice in the oven stage | `round:complete` questions 5, firstTryCorrect 4 | — |
| Voice coverage | all `topping × 1–5`, `enough.1–5`, `count.1–5` | in `VOICE_LINES`, one `.m4a` and `.hash` each | missing → exit 1 |
| Review rule | `ask.mushroom.5` without `review` | check fails naming the id | exit 1 |
| Layout | `slot.bowl-pepper` or `bowl-pepper/idle/00` missing | render, atlas and check fail naming it | exit 1 |

</intent-contract>

## Code Map

- `app/src/content/games/pizza.ts` (+ test) -- planned in spec-3-1: `TOPPINGS`, `PizzaLevel`, one-level `ladder`, `BASE_SLOTS`, `assets`, `screen`. Extend to 3 toppings and 3 levels.
- `app/src/games/pizza/{questions,lines,round,Pizza}.ts` (+ tests) -- planned in spec-3-1. Replace `roundQuestions`, add `resumeQuestion`, `beginQuestion(index, placed)`, `restoreSlices`, and the level-driven bowls.
- `app/src/games/mini-game-base.ts` -- planned in spec-1-7…2-5: `resumeAt`, `progress()`, `hint` wrapper, tally. Unchanged.
- `app/src/core/snapshot.ts` -- planned in spec-2-5: `readResume`, `isJsonOnly`. `app/src/content/types.ts` -- real `Snapshot`, `JsonValue`; `SnapshotPartials.pizza` is planned in spec-2-5 and unchanged.
- `app/src/core/hint-director.ts` -- planned in spec-1-9/3-1: `HintItem`, the level-4 dim and `setSnapScale`.
- `app/src/content/voice-lines.ts` -- real `VOICE_LINES`, `VoiceLine` (`review?` planned in spec-3-1). `app/src/content/validate.ts` -- real `voiceWords`, `BANNED_PAIRS`, `bannedPairsIn`; `REVIEW_WORDS` is planned in spec-3-1.
- `app/src/core/tokens.ts` (+ test) -- real; `art.pizza` is planned in spec-3-1.
- `app/tools/render/blender/build_pizza.py`, `app/tools/layout/rules.ts › validatePizza` -- planned in spec-3-1.
- `app/src/core/difficulty.ts › nextLevel`, `app/src/scenes/Map.ts` -- planned in spec-1-10/2-1. Map uses `GAMES.pizza.ladder.length`, with no change.
- Source: `assets/kenney/kenney_food-kit/Models/GLB format/paprika-slice.glb`.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/core/tokens.ts` (+ test) -- add `art.pizza.pepper`. The gap test covers all topping pairs.
- [x] `app/src/content/voice-lines.ts`, `app/src/content/validate.ts` (+ test) -- add the 14 lines and the `ask.mushroom.5` review text, and add `'năm lát nấm'` to `REVIEW_WORDS` with pass and fail cases. Generate them with `npm run content:export && npm run tts`.
- [x] `app/src/content/games/pizza.ts` (+ test) -- `TOPPINGS`, the ladder, `screen.frames`, and the ladder rules.
- [x] `app/tools/render/blender/build_pizza.py`, `app/tools/layout/rules.ts` (+ test) -- the pepper slice, the bowl sprites, the row constants, and the bowl-frame requirement with a failing case.
- [x] `app/src/content/generated/pizza.layout.json`, `public/assets/atlases/pizza.{png,json}`, `public/assets/bg/pizza.png` -- re-render them with the real Blender, and fix rule failures in the builder constants.
- [x] `app/src/games/pizza/questions.ts` (+ test) -- the candidate draw, `fallbackRound`, clamping, and the determinism and property sweep over seeds 0…999.
- [x] `app/src/games/pizza/lines.ts` (+ test) -- coverage over 3 levels plus the all-combinations test.
- [x] `app/src/games/pizza/round.ts` (+ test) -- `resumeQuestion` with every bad-partial row, `beginQuestion(index, placed)` for both branches, lowest-free filling after a gap, the 3-topping distractors, the five-mushroom chain and the outcome row.
- [x] `app/src/games/pizza/Pizza.ts` -- the level-driven bowls and slices, `restoreSlices`, the resumed `build()`, and bowl sprites as distractor `HintItem`s.
- [x] `app/README.md` -- a provenance row for `paprika-slice.glb`.

**Acceptance Criteria:**
- Given a fresh `npm run dev` at 1180×820 touch emulation and pizza at level 0 (`window.bhcDev` or `bhc.progress` set to 0), when the round starts, then only the sausage and mushroom bowls stand on the counter, and the 3 requests stay within one to three slices. With level 2, three bowls show (the green pepper ring clearly differs from both in greyscale), the round has 5 requests from three to five slices, and at least one asks for five.
- Given level 2 and "Bé ơi, năm lát nấm nào!", when the child places five mushroom slices, then the voice says "Một!" … "Năm!", re-counts "Một, Hai, Ba, Bốn, Năm" with each slice bouncing on its number, and only then the oven opens with "Mình nướng bánh nào!".
- Given level 2 and a child who does nothing, when the hint reaches level 4, then the two other bowls and their slices fade to 60% and cannot be lifted, a drop near the base rim snaps more easily, and no slice moves by itself.
- Given level 1 with 2 of 4 sausage slices on the third pizza, when the child taps Home and later re-enters Tiệm pizza (Epic 2 present), then the two slices are already on their old spots with no counting, the request is spoken again, and the next sausage slice says "Ba!".
- Given a resume whose `partial` is edited in DevTools to `{ placed: [1, 1] }`, when the station is re-entered, then the question starts with an empty base and the request, one `console.warn` is logged, and nothing is shown to the child.
- Given a level-2 round finished with one extra slice dropped in an oven stage, then exactly one `round:complete { gameId: 'pizza', questions: 5, firstTryCorrect: 4 }` is emitted, and Map's `nextLevel` keeps level 2.
- Given `cd app && npm run check`, then it exits 0. validate:content accepts the pizza layout with three bowls and the 29 `vo.pizza.*` files, and lists `ask.mushroom.5` among the `review` lines.

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
- **2026-10-10 (implementation): what changed from the spec, and why.**
  - **Commands.** `beginQuestion(index, placed)` is `PizzaRound.begin(index, placed)`, emitting `build{toppings, slices}` → `restoreSlices{topping, slots}` → `pickable` → `beginQuestion`, or, with a full base, `ovenReady` → `readyRing` → a new `beginOvenQuestion{bake, enough.<n>}` (a `hint.beginQuestion` with the oven step). Toppings-step distractors are `HintRef`s (`{slice}` / `{bowl}`) that the scene maps to Draggables or bowl `HintItem`s.
  - **Resume.** `startCommands(round, resumeAt)` makes the decision. A bad partial is still `accepted` (the tally restore is kept, as in Tiệm kem) and warns `pizza: bad resume partial`. An out-of-range index warns `pizza: resume index out of range (…)`. A class instance counts as not a plain object.
  - **Lint.** Magic numbers are banned in `games/`, so the candidate salt lives in `core/rng.ts › candidateSeed` and `ROUND_ATTEMPTS` (32) in `content/games/pizza.ts`.
  - **Art.** `paprika-slice.glb` has a real hole, found by a BVH ray probe, so the lobed-ring fallback did not run. Bowls are 0.56 m wide (they were 0.62). The first row tuning passed the layout rules, but the pepper slot's hint ring sampled grass left of the counter (3.00:1). The whole row moved right: pepper 124.6, sausage 241.1, base 448.8, mushroom 661.1 and the oven hull 760–957 px. Hint contrast now passes on all 4 pizza rings.
## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | verification-gap, blind | A collapsed `candidateSeed` (retries repeat attempt 0) would send ~58% of rounds to the fixed `fallbackRound` pattern with every test green | medium | Attempt 0 fails the properties for 579–595/1000 seeds; the fallback has all properties; no test compares against it | patch |
| 2 | edge, blind | `fallbackRound`/`candidate` preconditions (toppings ≥ 2, questions ≥ toppings, non-empty pool) are unchecked | low | Unreachable with today's ladder; a direct ladder-rule assertion catches a future level | patch |
| 3 | blind | round.test.ts comment says bowl homes sit inside the 240 px target, but the pepper home is ~325 px away | low | Comment contradicts the layout; direct correction | patch |
| 4 | verification-gap | `roundQuestions`' exhausted-attempts branch never runs in a test | low | Unreachable with 32 attempts; needs an injectable attempt count | defer |
| 5 | verification-gap, blind | Pizza scene handlers (`addBowls`, `restoreSlices`, `beginOvenQuestion`, bowl dim refs) untested | medium | No Phaser scene harness; the round command contract is pinned | defer |
| 6 | blind | A missing bowl frame stores a HintItem with an undefined object | false | Edge review checked: the dim ignores undefined objects | reject |
| 7 | blind | A resume without `partial` now warns; 3.1 saves land on different questions | low | Resume points live only in the session (memory); `makeSnapshot` always writes `partial` | reject |
| 8 | blind | `redrawSeed`/`questionSeed` may be dead | low | Unverified; no harm | reject |
| 9 | blind | `pepper_slice` ignores imported transforms; the fallback ring is not normalised; the GLB is re-imported per call | low | The GLB branch ran and the frames were checked by eye; the fallback is unused | reject |
| 10 | blind | Bowls may have lost their counter contact shadow | low | Visual; noted for the human look | reject |
| 11 | blind | Regenerated assets / `bowlAnchor` missing from the diff | false | Excluded from the review diff by size; typecheck resolves `bowlAnchor` | reject |
| 12 | blind | Vietnamese `review` text, hard-coded line count, core test importing content, thin pepper luminance margin | low | Consistency only | reject |

## Design Notes

**Why rejection sampling with a constructive fallback:** the three round properties interact (topping coverage limits the topping draw, the maximum-count rule limits the count draw, and the no-repeat rule couples neighbours). Patching one draw can break another. A whole-round redraw succeeds about a third of the time per attempt at every level, so 32 attempts essentially never reach the fallback, and the fallback is still valid. Both paths are deterministic.

**Resume, game side:**

```ts
const at = this.resumeAt;
const start = at && at.questionIndex < qs.length ? at : null;
if (at && !start) console.warn('pizza: resume index out of range');
const ok = start ? round.resumeQuestion(start.questionIndex, start.partial) : null;
if (start && !ok) console.warn('pizza: bad resume partial');
apply(round.beginQuestion(start?.questionIndex ?? 0, ok?.placed ?? []));
```

## Verification

**Commands:**
- `cd app && npm run content:export && npm run tts` -- expected: 14 new `vo.pizza.*` `.m4a` and `.hash` files are written; a second run skips them.
- `cd app && npm run art:build -- pizza && npm run render -- pizza && npm run atlas -- pizza` -- expected: exit 0; the atlas is one page ≤ 2048² with `bowl-*` and `topping-pepper` frames, and a second `render` gives a byte-identical layout.
- `cd app && npx vitest run src/games/pizza src/content` -- expected: every matrix row passes.
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run build` -- expected: exit 0.

**Manual checks:**
- In `preview.png` (greyscale view), the three toppings are told apart by shape and brightness. The pepper slice is a ring with a visible hole.
- Listen to `ask.mushroom.5` and the five-count recount, and leave `approved` unset for the parent. If "năm lát nấm" blurs, switch to the review text's replacement and re-run `tts`.
- Run the resume AC with and without `prefers-reduced-motion`. Restored slices appear instantly in both.
