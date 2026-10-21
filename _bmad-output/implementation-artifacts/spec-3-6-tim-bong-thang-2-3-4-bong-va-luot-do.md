---
title: 'Story 3.6 — Tìm bóng: thang 2 → 3 → 4 bóng giống nhau dần và lượt dở'
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
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-5-danh-thuc-cua-hang-tim-bong.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-4-ghep-khung-long-thang-3-4-6-manh-va-luot-do.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-2-lam-pizza-thang-do-kho-toi-5-lat.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-giu-luot-do-trong-phien.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-tiem-kem-luot-3-5-cau-do-kho-tang-dan.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** After Story 3.5, Tìm bóng has a temporary one-level ladder (2 shadows from different shape groups), so `nextLevel` always returns 0 and FR21's 3- and 4-shadow levels with ever more similar silhouettes do not exist. The catalogue has only 3 quadrupeds, so a 4-shadow same-group question cannot be built. A resumed round restarts the right question but never validates `partial` (AC: corrupt `partial` → clean start + `console.warn`).

**Approach:**
- **Ladder:** `content/games/shadow-match.ts` gets 3 levels (2 / 3 / 4 shadows, 4 questions each) with group rules `distinct` → `mixed` → `same`.
- **Catalogue:** add donkey and stag (Quaternius) so `quadruped` has 5 members, and give every item a `features` list. A content rule checks that every item has a feature no other item in its group has, and a measured rule checks that same-group silhouettes really differ.
- **Art:** the spec-3-5 builder renders the 2 new items and the slot rows for 3 and 4 shadows. The existing `validateShadowMatch` and contrast rules then cover the new rows.
- **Resume:** the round model gains `resumeQuestion`. The question itself is rebuilt from `seed` + `level`, so the same item, shadows and correct slot return.

## Boundaries & Constraints

**Always:**
- **Content** (`content/games/shadow-match.ts`, data only, extending spec-3-5):
  - `SHAPE_ITEMS` gains `features: readonly Feature[]` on every item and two items (Decisions table): `donkey` and `stag`, both `quadruped`. `Feature` is a closed union of kebab ids: `pointy-ears | curled-tail | horns | tail-tuft | mane | long-tail | long-ears | antlers | low-roof | cargo-box | big-rear-wheel`.
  - `ShadowLevel.groups: 'distinct' | 'mixed' | 'same'`.
  - `ladder = [{ id: 'shadows-2', shadows: 2, questions: 4, groups: 'distinct' }, { id: 'shadows-3', shadows: 3, questions: 4, groups: 'mixed' }, { id: 'shadows-4', shadows: 4, questions: 4, groups: 'same' }]`.
  - `SHADOW_COUNTS = [2, 3, 4] as const`. `screen` (ids and frames) stays generated from `SHAPE_ITEMS × SHADOW_COUNTS`, so it now holds 8 items and 9 slots.
  - The content test is extended. It checks that:
    - `ladder.length === 3`; `shadows` is 2, 3, 4; `questions` is 4 at every level; every `shadows ∈ SHADOW_COUNTS`;
    - for a `same` level, the items whose group has ≥ `shadows` members number ≥ `questions`;
    - for `distinct` and `mixed` levels, every item has ≥ `shadows − 1` items in other groups;
    - every item has non-empty, distinct `features`;
    - the spec-3-5 rules (kebab ids, `FORBIDDEN_ITEM`, `/t-?rex/i`) still hold.
- **Feature rule** (`tools/lint/validate-content.ts`, generic over the catalogue): every item has at least one feature that no other item of its `shapeGroup` has. The message names the item and group. It is also exported as a pure `featureProblems(items)` with a failing unit case (cow and horse both `['mane']`).
- **Measured silhouettes** (`tools/lint/shadow-distinct.ts`, new; run by `validate:content`; pure `silhouetteIoU(a, b)` unit-tested):
  - It reads each `item-<id>/shadow/00` from the committed `atlas.shadow-match` page (an unrotated frame rect from the atlas JSON). The alpha masks (alpha ≥ 128) are scaled to the same longest side, aligned by bottom-centre, and their intersection-over-union is computed.
  - For every pair in the same group, IoU must be ≤ `ui.shadowMaxIoU`. Otherwise it fails naming both ids and the value. Every pair's IoU is printed as an info line.
- **Builder** (`build_shadow_match.py`, extending spec-3-5):
  - `ITEM_MODELS` gains `donkey` → `quaternius/animals/Donkey.fbx` and `stag` → `quaternius/animals/Stag.fbx`, both posed with `AnimalArmature|Idle` (present in both files, verified 2026-10-08) in side profile, with the same yaw convention as horse. `build.ts` already passes every content id through `--items`.
  - `SHADOW_SPOTS` gains rows 3 and 4. The ledges may grow (named constants `LEDGE_SIZE`, `LEDGE_TIERS`: each ledge gets an upper and a lower tier). Row 3 = left upper, left lower, right middle; row 4 = two tiers on each ledge. Positions are named world-unit constants, tuned until `validateShadowMatch` and the contrast rule pass. Row 2 stays where it is.
  - The atlas stays one page (8 items × `color` + `shadow`, plus the triceratops frames).
- **Screen rules:** `validateShadowMatch` and the spec-3-5 contrast rules are unchanged and simply run over rows 3 and 4 (each slot inside the interactive rect and outside `hudKeepOutRects()`; pairwise gap ≥ `spacing.targetGap` between shadow circles; hand distance ≥ `shadowR + snapRadius × hintSnapScale + heldR`; ≥ 5:1 under every slot; ring sites for every slot).
- **Questions** (`games/shadow-match/questions.ts › roundQuestions(seed, level)`, replacing spec-3-5's decoy rule; pure, no retry loops). Steps:
  1. Clamp `level` and set `rng = mulberry32(seed)`.
  2. **Pool:** for `same`, the items whose group has ≥ `shadows` members; otherwise all items. Held items are the first `questions` of a Fisher–Yates shuffle over the pool, so they are distinct in a round.
  3. **Decoys** (never the held item, all distinct), per question:
     - `distinct`: the first `shadows − 1` of a shuffle of the items in other groups.
     - `mixed`: if the held item's group has another member, the first decoy is the first of a shuffle of those same-group members. The other decoys come from a shuffle of other-group items. With no same-group mate, every decoy comes from other groups. So there are always ≥ 2 groups, and one look-alike when one exists.
     - `same`: the first `shadows − 1` of a shuffle of the other members of the held item's group.
  4. **`correctSlot`** and the fill order are as in spec-3-5 (uniform over `[0, n)` excluding the previous question's slot; decoys in shuffled order).
- **Round model** (`round.ts`, extending spec-3-5):
  - The slot row is `ladder[clamp(level)].shadows`. The scene builds `n` shadow images and `n` drop targets on `slot.shadow-<n>-1..n`.
  - The hint step's `distractors` are all `n − 1` decoy shadows. Level 4 dims all of them.
  - **`resumeQuestion(index, partial) → {} | null`**, pure. It returns `null` unless `partial` is a plain object (not null, not an array) with no own keys. `index` is range-checked by the caller (spec-3-5).
  - `progress()` stays `{ questionIndex, partial: {} }`.
- **Scene** (`ShadowMatch.ts`). `build()` follows spec-3-2/3-4:
  - out-of-range `questionIndex` → one warn, then question 0 (spec-3-5);
  - `resumeQuestion` null → `console.warn('shadow-match: bad resume partial')` once, then the same question begins clean (the result is identical either way);
  - otherwise it begins `resumeAt.questionIndex`.

  The resumed question shows `roundQuestions(seed, level)[index]` (same item, same shadows in the same slots), and `hint.beginQuestion` re-asks at hint level 0. No error is shown.
- **Voice:** 4 new lines (Decisions). Every catalogue item has exactly one `ask` line and one `name` line. A test asserts this both ways: no `vo.shadow-match.{ask,name}.<x>` exists for an `x` outside the catalogue.

**Ask First:**
- Row 4 cannot pass the layout rules even with two-tier ledges at `shadowItemPx 150` (lowering `shadowItemPx` would break the held-size rule: 0.7 × (150 − 10) = 98 ≥ 90 is the margin).
- A same-group pair keeps IoU > `shadowMaxIoU` after yaw and pose tuning (for example horse vs donkey). Then swap the item or change the threshold.

**Never:**
- No difficulty logic in the game, and no `SessionStore` access. No change to `SnapshotPartials['shadow-match']` or to the spec-2-5 envelope.
- No alpaca as a play item (see Decisions). No T-rex, no balloons, balls or flowers, no "bóng/bông" pair in a line.
- No colour-only differences: features describe outline, and the shadows are one flat colour.
- No auto-placing. No red, ✗, shake, wrong sound, praise, "sai" or on-screen text. No hand-entered coordinates, magic numbers or hex in the game.
- No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **Groups stay `quadruped`, `car`, `truck`; no `bird`.** There are no bird or cat models in `assets/` (spec-3-5). The AC's "ví dụ mèo, chó, bò, ngựa" becomes chó, bò, ngựa, lừa, nai.
- **New quadrupeds: donkey and stag, not alpaca.** spec-2-2's decoration catalogue puts an `alpaca` on the island at the cave station and excludes models that are game characters. Using the alpaca here would show the same animal as decoration and as a quiz item. Bull (too close to cow), Horse_White (same as horse), Wolf (may scare a toddler) and Fox (pizza character) are out.
- **Level 2 asks only quadrupeds:** it is the only group with ≥ 4 members. A 4-shadow vehicle group would need several similar Kenney trucks whose outlines differ too little.
- **`mixed` = one look-alike + other groups:** this makes level 1 a real step between "all different" and "all same", and satisfies "ít nhất 2 nhóm" by construction.
- **Feature list per item** (outline cues, not colour):

  | item | group | `features` | `askName` | `vo.shadow-match.ask.<i>` | `vo.shadow-match.name.<i>` |
  |---|---|---|---|---|---|
  | dog | quadruped | pointy-ears, curled-tail | chó | (3.5) | (3.5) |
  | cow | quadruped | horns, tail-tuft | bò | (3.5) | (3.5) |
  | horse | quadruped | mane, long-tail | ngựa | (3.5) | (3.5) |
  | donkey | quadruped | long-ears | lừa | "Bạn lừa trốn ở cái \| bóng nào?" (7) | "Con lừa!" |
  | stag | quadruped | antlers | nai | "Bạn nai trốn ở cái \| bóng nào?" (7) | "Con nai!" |
  | car | car | low-roof | ô tô | (3.5) | (3.5) |
  | truck | truck | cargo-box | xe tải | (3.5) | (3.5) |
  | tractor | truck | big-rear-wheel | máy cày | (3.5) | (3.5) |

  "Nai" rather than "hươu", so that it is not confused with "hươu cao cổ" (giraffe). The new lines are unapproved, need no `review` flag, and use `keywordPauseMs: 300`.
- **Measured IoU on top of features:** the AC's feature list is declarative; the IoU rule proves on the real render that the outlines differ. `ui.shadowMaxIoU 0.85`.
- **Corrupt `partial` gives the same question as a valid one:** shadow-match has no in-question progress, so the only observable effect is the warn.
- **Decoys may recur across questions** (spec-3-5); within a question all shadows are distinct items.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Level 0 | `{level:0, seed}` | 4 questions; 2 shadows on `slot.shadow-2-*` from 2 groups | — |
| Level 1 | `{level:1, seed}` | 3 shadows on `slot.shadow-3-*`; ≥ 2 groups; a held quadruped or truck/tractor has one same-group decoy | — |
| Level 1, car | held `car` | both decoys from other groups | — |
| Level 2 | `{level:2, seed}` | 4 distinct quadrupeds held; each question has 4 distinct quadruped shadows | — |
| Clamp | `level 5` / `−1` | treated as 2 / 0 | — |
| Questions sweep | seeds 0…999 × levels | identical on repeat; exactly 1 correct shadow; no item twice in a question; no held item twice in a round; correct slot ≠ previous | — |
| Level 4 hint at L2 | idle and wrong drops | 3 decoys at 60 %; correct zone ×2; a drop nearer a decoy's edge still floats back | — |
| Home at q3 | L1, two decoy drops, then Home | one `round:abandon`; `progress()` = `{questionIndex:2, partial:{}}`; snapshot `toMatchObject({v:1, level:1, seed, questionIndex:2, partial:{}})`; JSON round-trips | — |
| Resume | that snapshot via `scene.start` | question 3's item at the hand, the same 3 shadows in the same slots; ask replayed; hint level 0 | — |
| Bad partial | `null`, `[]`, `'x'`, `{placed:[1]}` | same question begins clean | console.warn once |
| Resume out of range | `questionIndex 4` | question 0 | console.warn once |
| Outcome | any level, one question reaching hint 4 | `round:complete` with `questions 4`, `maxHintLevel 4` | — |
| Catalogue | horse and donkey both `['mane']`; a same-group pair with IoU 0.9 | check fails naming the items | exit 1 |
| Voice | `vo.shadow-match.ask.cat` exists, or `name.stag` missing | check fails naming the id | exit 1 |
| Layout | row 4 slot under Speaker, or two row-4 shadows 10 px apart | render, atlas and check fail naming the id | exit 1 |

</intent-contract>

## Code Map

- `app/src/content/games/shadow-match.ts` (+ test) -- planned in spec-3-5: `SHAPE_ITEMS`, `ShadowLevel`, one-level `ladder`, `SHADOW_COUNTS = [2]`, `FORBIDDEN_ITEM`, `assets`, `screen`. Add `Feature`, `features`, donkey and stag, the 3-level ladder, rows 3 and 4.
- `app/src/games/shadow-match/{questions,lines,round,ShadowMatch}.ts` (+ tests) -- planned in spec-3-5. Replace the decoy rule, add the row-driven targets, `resumeQuestion`, and the resumed `build()`.
- `app/src/games/mini-game-base.ts`, `app/src/core/snapshot.ts`, `app/src/core/round-tally.ts` -- planned in spec-1-10/2-5: `resumeAt`, `progress()`, `readResume`, tally restore, `maxHintLevel`. Unchanged.
- `app/src/content/types.ts` -- real `GameId`; `SnapshotPartials['shadow-match'] = Record<string, never>` planned in spec-2-5, unchanged.
- `app/src/core/hint-director.ts` -- planned in spec-1-9/3-1/3-5 (`HintStep.focus`). Unchanged.
- `app/src/content/voice-lines.ts`, `app/src/content/validate.ts` -- real (`BANNED_PAIRS`, `MAX_VOICE_WORDS`, `VOICE_ID`).
- `app/tools/render/blender/build_shadow_match.py`, `app/tools/layout/rules.ts › validateShadowMatch`, `app/tools/lint/{validate-content,hint-contrast}.ts` -- planned in spec-3-5/3-1. New: `app/tools/lint/shadow-distinct.ts`.
- `app/src/core/tokens.ts` -- real; `ui.shadow*` planned in spec-3-5. Add `ui.shadowMaxIoU`.
- Sources: `assets/quaternius/animals/{Donkey,Stag}.fbx` (actions `AnimalArmature|Idle`).

## Tasks & Acceptance

**Execution:**
- [x] `app/src/core/tokens.ts` (+ test) -- `ui.shadowMaxIoU 0.85`.
- [x] `app/src/content/games/shadow-match.ts` (+ test) -- `Feature`, `features`, donkey and stag, `groups` union, the ladder, `SHADOW_COUNTS`, and the extended content checks.
- [x] `app/src/content/voice-lines.ts` (+ test) -- 4 lines and the catalogue ↔ lines both-ways test. Generate with `npm run content:export && npm run tts`.
- [x] `app/tools/lint/validate-content.ts` (+ test) -- `featureProblems` with a failing case.
- [x] `app/tools/render/blender/build_shadow_match.py` -- the donkey and stag rows, `SHADOW_SPOTS[3|4]`, `LEDGE_SIZE`/`LEDGE_TIERS`.
- [x] `app/src/content/generated/shadow-match.layout.json`, `public/assets/atlases/shadow-match.{png,json}`, `public/assets/bg/shadow-match.png` -- re-render with the real Blender. Fix rule failures in the builder constants.
- [x] `app/tools/lint/shadow-distinct.ts` (+ test), wired into `validate:content` -- `silhouetteIoU` unit cases (identical masks → 1, disjoint → 0), and the pairwise rule over the real atlas.
- [x] `app/src/games/shadow-match/questions.ts` (+ test) -- the pool and the 3 decoy rules; the sweep rows of the matrix.
- [x] `app/src/games/shadow-match/round.ts` (+ test) -- row-driven slots, all decoys as distractors, `resumeQuestion` with every bad-partial row, the outcome row through `RoundTally`.
- [x] `app/src/games/shadow-match/ShadowMatch.ts` -- `n` shadows and targets from the level's row, and the resumed `build()`.
- [x] `app/README.md` -- provenance rows for Donkey, Stag and the new audio.

**Acceptance Criteria:**
- Given a fresh `npm run dev` at 1180×820 touch emulation with shadow-match at level 2 (`window.bhcDev` or `bhc.progress`), when the round starts, then the triceratops holds an animal and 4 quadruped shadows (from dog, cow, horse, donkey, stag) sit on the ledges. Each shadow is at least 120 px, none touches another or sits under Home or Speaker, and each can be told apart by its outline (horns, mane, long ears, antlers, curled tail). With levels 0 and 1 there are 2 and 3 shadows.
- Given level 1, when the triceratops holds the horse, then one of the 3 shadows is another four-legged animal and at least one is a vehicle. A drop on the look-alike floats back with the question replayed.
- Given level 1 on question 3 after two wrong drops, when the child taps Home and the shell restarts the scene with the abandoned snapshot (Epic 2 Map, or `scene.start('shadow-match', { level, seed, resume })` from DevTools), then the triceratops holds the same item with the same 3 shadows in the same places, the question plays again and the hint starts at level 0.
- Given a resume whose `partial` is edited to `{ placed: [1] }`, then question 3 begins normally, one `console.warn` is logged and nothing is shown to the child.
- Given a level-2 round in which one question idles to hint 4, then exactly one `round:complete { gameId: 'shadow-match', questions: 4, maxHintLevel: 4 }` is emitted, and Map's `nextLevel` lowers the level.
- Given `cd app && npm run check`, then it exits 0. It includes the feature rule, the IoU rule, the voice ↔ file ↔ hash and homophone rules for the 16 item lines, and the layout and contrast rules for 9 slots.

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

- 2026-10-12: the three subagent review layers (blind-hunter, edge-case-hunter, verification-gap) were NOT run: subagents were not authorised in this session. An inline self-review by the implementer found no defects to patch. Notes: (1) core HintMachine idle escalation stops at level 3 (spec-1-9), so the AC "idles to hint 4" is tested as idle → 3 then decoy drops → 4 (round.test.ts); (2) a resume with `partial` missing (`undefined`) is treated as a bad partial (warn, same question clean); (3) the shadow-rules hand fixture assertion became `toContain` because moving the hand up also trips the new row-4 lower-right slot.

## Design Notes

**Decoy rule as code** (one shuffle per need, no retries):

```ts
const others = shuffle(ITEMS.filter(x => x.shapeGroup !== held.shapeGroup), rng);
const mates  = shuffle(ITEMS.filter(x => x.shapeGroup === held.shapeGroup && x.id !== held.id), rng);
const decoys = groups === 'same'     ? mates.slice(0, n - 1)
             : groups === 'distinct' ? others.slice(0, n - 1)
             : [...mates.slice(0, 1), ...others].slice(0, n - 1); // mixed
```

**Why two tiers per ledge:** four 150 px shadows need about 2 × 174 px per side, and every slot must stay ≥ 75 + 200 + 52 ≈ 327 px from the hand point (level-4 snap zone). Stacking two shadows per ledge keeps them high and wide of the centre, where the triceratops and the hand are.

## Verification

**Commands:**
- `cd app && npm run content:export && npm run tts` -- expected: 4 new `vo.shadow-match.*` files; a second run skips them.
- `cd app && npm run art:build -- shadow-match && npm run render -- shadow-match && npm run atlas -- shadow-match` -- expected: exit 0; one page with 8 items × `color`/`shadow`; 9 shadow slots; a second `render` gives a byte-identical layout.
- `cd app && npx vitest run src/games/shadow-match src/content tools/lint` -- expected: every matrix row passes.
- `cd app && npm run check` -- expected: exit 0; the IoU info lines list every same-group pair ≤ 0.85.
- `cd app && npm run build` -- expected: exit 0.

**Manual checks:**
- In `preview.png` and in game at level 2: the donkey's ears, the stag's antlers, the horse's mane and the cow's horns are visible in their shadows; the ledges stay bright with 4 shadows.
- Run the resume AC with a level-1 snapshot and check the shadow positions match the abandoned question.
