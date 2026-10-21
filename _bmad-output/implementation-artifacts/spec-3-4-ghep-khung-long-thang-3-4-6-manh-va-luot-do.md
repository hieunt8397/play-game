---
title: 'Story 3.4 — Ghép khủng long: thang 3 → 4 → 6 mảnh và lượt dở'
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
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-3-danh-thuc-cong-vien-khung-long-ghep-3-manh.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-2-lam-pizza-thang-do-kho-toi-5-lat.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-giu-luot-do-trong-phien.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-tiem-kem-luot-3-5-cau-do-kho-tang-dan.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-pipeline-hinh-render-blender-atlas-layout.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** After Story 3.3, Ghép khủng long has a temporary one-level ladder (3 pieces, 3 dinos), so `nextLevel` always returns 0 and FR19's harder 4- and 6-piece puzzles do not exist. Each piece also always starts at the same fixed spot, and a resumed dino restarts empty: spec-3-3 snapshots `placed` but never restores it (FR27 for dino-puzzle).

**Approach:**
- **Ladder:** `content/games/dino-puzzle.ts` gets 3 levels (3 / 4 / 6 pieces, 3 dinos each) and piece lists `PIECES[4]` and `PIECES[6]`.
- **Art:** the spec-3-3 builder cuts the same posed meshes by more bone groups (rows only, no new geometry). Pieces too small to grab are shown enlarged while loose and shrink into their slot on snap.
- **Starts:** the fixed start spots become 8 generated "bays" on the lawn. A pure `arrangeStarts(seed, questionIndex, …)` shuffles pieces into bays, with a validated fallback.
- **Resume:** the round model gains `resumeQuestion`, so restored pieces sit in the ghost in real colour and the rest wait at their start spots.

## Boundaries & Constraints

**Always:**
- **Content** (`content/games/dino-puzzle.ts`, data only):
  - `PIECES = { 3: ['head-neck', 'body-legs', 'tail'], 4: ['head-neck', 'front', 'back', 'tail'], 6: ['head', 'neck', 'body', 'front-legs', 'back-legs', 'tail'] } as const`. Array order is the hint order. `PIECE_IDS` is the deduplicated union (10 ids). A piece id in several cuts is the same frame and slot.
  - `ladder = [{ id: 'pieces-3', pieces: 3, dinos: 3 }, { id: 'pieces-4', pieces: 4, dinos: 3 }, { id: 'pieces-6', pieces: 6, dinos: 3 }]`.
  - `DINO_BAYS = 8` and `DROP_ORDER = ['own', 'home', 'other', 'rest', 'off'] as const`. `round.ts` resolves drops in exactly this order (spec-3-3's list, now data, so the validator can see the "ô đúng thắng" rule).
  - `screen` is generated from `SPECIES × PIECE_IDS` (slots, frames) plus `anchor.dino-bay-1..8`. The `anchor.<s>-<p>-start` ids of spec-3-3 are removed.
  - The content test is extended. It checks that:
    - `ladder.length === 3`, `pieces` is 3, 4, 6 and `dinos` is 3 at every level;
    - every `PIECES[k]` has length `k` and distinct kebab ids;
    - `PIECES[6]` is exactly head, neck, body, front-legs, back-legs, tail (the AC's đầu, cổ, thân, chân trước, chân sau, đuôi);
    - `DROP_ORDER[0] === 'own'`.
- **Builder** (`build_dino_puzzle.py`, extending spec-3-3):
  - **Cuts:** `build.ts` passes the content cuts (`--cuts 3:head-neck,body-legs,tail;4:…;6:…`). `PIECE_BONES` is keyed by piece id and lists bones by exact name or prefix (bones verified in the FBX 2026-10-08):

    | piece | bones |
    |---|---|
    | `head-neck` | `Neck`, `Head`, `Head_end` |
    | `body-legs` | `root`, `Body`, `Hips`, `Torso`, `Shoulders`, `Front*`, `Back*` |
    | `tail` | `Tail*` |
    | `front` | `Shoulders`, `Torso`, `Front*` |
    | `back` | `root`, `Body`, `Hips`, `Back*` |
    | `head` | `Head`, `Head_end` |
    | `neck` | `Neck` |
    | `body` | `root`, `Body`, `Hips`, `Torso`, `Shoulders` |
    | `front-legs` | `Front*` |
    | `back-legs` | `Back*` |

  - Each cut must partition every deform bone exactly once, and every piece must get at least `PIECE_MIN_FACES` faces. Otherwise the build fails naming the cut, piece and bone. The eyes go with the piece that holds `Head`.
  - **Small-piece fix:** an optional per-species table `CUT_PLANES[(species, from, to)]` (a world-space plane) moves the faces of piece `from` beyond the plane into `to` after the bone pass. It is used only to grow a piece that fails `dinoPieceMinRawPx`, for example the triceratops `neck`, whose bone may carry almost no faces. Values are named constants, tuned until the rules pass.
  - Each piece id is rendered once per species (`sprite.<s>-<p>`, `movable: true`, `ghost: true`, in place, as in spec-3-3).
  - **Bays:** `anchor.dino-bay-1..8` are ground points from table `BAY_SPOTS` in a ring on the lawn around `DINO_SPOT`. `START_SPOTS` and the per-piece start anchors are removed.
  - **Walk frames:** `walk` is 2 frames (`"walk":[20,22]`) to keep the atlas within 4 pages (spec-3-3's fallback, applied up front). `Timing.dinoWalkFrameMs` becomes 300.
- **Loose-piece scale** (`games/dino-puzzle/starts.ts`, pure, Phaser-free, imported by both the game and `tools/layout/rules.ts`):
  - `pieceScale(rawLongest) = max(1, draggableItem.minSize / rawLongest)`, where `rawLongest` is the trimmed frame's longest side ÷ renderScale.
  - A loose piece is drawn at `pieceScale`. Its displayed rect is the trimmed size × `pieceScale`, centred on its trimmed centre. Its hit circle has r = displayed max side / 2 + `draggableItem.hitPad`.
  - On `own`, the snap tween also eases the scale to 1 and lands frame-aligned (spec-3-3). Lift is 1.1× the loose scale.
- **Start arrangement** (`starts.ts › arrangeStarts(seed, questionIndex, species, cut, geo) → Record<PieceId, Point>`):
  - `geo` holds the bay points, the slot points and the displayed rects, read from layout + atlas.
  - For `attempt` 0…63: `rng = mulberry32(seed + questionIndex × Q_SALT + attempt × A_SALT)`, Fisher–Yates over the bays, piece `i` (PIECES order) → bay `i`. Accept the first result where `pairsClear` holds (every pair of displayed rects is ≥ `spacing.targetGap` apart) and `clearOfOwnSlot` holds (every start centre is ≥ `dropTarget.snapRadius` from its own slot).
  - If none passes, use the identity fallback (piece `i` → bay `i`), which the validator guarantees.
  - The same `(seed, questionIndex, species, cut)` gives the same spots, and so does a resume.
- **Screen rules** (`tools/layout/rules.ts › validateDinoPuzzle`, replacing spec-3-3's starts and sizes rules; every message names the id):
  - **Required:** `slot.<s>-<p>` for every `PIECE_IDS` entry, frames `<s>-<p>/{idle,ghost}/00`, `<s>/walk/00..01`, `anchor.dino-bay-1..8`, and spec-3-3's other ids and frames.
  - **Sizes:** each piece's `rawLongest ≥ ui.dinoPieceMinRawPx`, its displayed longest side ≥ `draggableItem.minSize` (90), and its hit diameter ≥ `spacing.targetMin` (80).
  - **Bay × piece** (every bay with every piece of every cut of every species): the displayed rect is inside the interactive rect and outside every `hudKeepOutRects()` rect, its centre is inside `hit.grass`, and it is clear of the `<s>/ghost/00` rect grown by `spacing.targetGap`. These checks hold for any assignment.
  - **Fallback:** for every species × cut, the identity assignment passes `pairsClear` and `clearOfOwnSlot`.
  - **Close slots:** if two slots of one species are < `dropTarget.snapRadius` apart, the check fails unless `DROP_ORDER[0] === 'own'`. Each close pair is printed as an info line.
- **Questions:** `roundSpecies(seed, level)` is unchanged. It now takes `ladder[level].dinos` over 3 levels.
- **Round model** (`round.ts`, extending spec-3-3):
  - The cut is `ladder[clamp(level)].pieces`.
  - **`resumeQuestion(index, partial) → { placed: PieceId[] } | null`**, pure. It returns `null` unless `partial` is a plain object and `placed` is an array of distinct strings, each in `PIECES[cut]`, with length < cut. Extra keys are ignored.
  - **`beginQuestion(index, placed = [])`** emits, in order:
    1. `showDino{ species, starts: arrangeStarts(…) }` for the unplaced pieces;
    2. `restorePieces{ ids: placed }`: the scene sets those pieces locked, frame-aligned, at scale 1 and real-coloured, with no tween and no sfx;
    3. `hint.beginQuestion({ promptLineId: ASK_LINE, retryLineId: RETRY_LINE, step: stepFor(first unplaced in PIECES order) })`.
  - `progress().partial.placed` lists piece ids in placement order, restored ones first.
- **Scene** (`DinoPuzzle.ts`):
  - It creates draggables and slot targets only for `PIECES[cut]`.
  - `build()` follows spec-3-2's pattern:
    - out-of-range `questionIndex` → warn once, start at dino 0;
    - `resumeQuestion` null → `console.warn('dino-puzzle: bad resume partial')` once, then begin that dino clean;
    - otherwise `beginQuestion(index, placed)`.

    No error is shown.
- **Hint-contrast sites:** each bay rect, sized to the largest displayed piece of the species, on `bg.dino-puzzle`.

**Ask First:**
- Raising `SCREEN_MAX_PAGES['dino-puzzle']` above 4, if the atlas still overflows with 2 walk frames.

**Never:**
- No difficulty logic in the game, and no `SessionStore` access. No change to the `SnapshotPartials['dino-puzzle']` shape or to the spec-2-5 envelope.
- No auto-placing, no rotation of pieces, and no fourth ladder level. No sfx, tween or voice for restored pieces.
- No hand-entered coordinates, magic numbers or hex in the game. No T-rex, no red, ✗, shake, wrong sound, praise, "sai" or on-screen text.
- No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **Kebab ids:** the AC's `slot.<species>.<piece>` is `slot.<s>-<p>` (spec-3-3).
- **4-piece cut = head-neck, front, back, tail.** Each piece is one connected chunk, which is easier for a toddler to read than "four loose legs". The 6-piece cut is the AC's list.
- **Enlarge while loose, true size when placed** reads the AC's "mảnh nhỏ như chân được phóng to tới tối thiểu" while keeping spec-3-3's pixel-exact assembly and come-alive swap. `dinoPieceMinRawPx` caps the enlargement at 2.25×.
- **"Ô đúng thắng" lives in `DROP_ORDER`.** The validator reads it and a Vitest drives it over every close pair in the real layout, so close slots are allowed only while own-slot-wins holds.
- **Bays + shuffle** instead of free placement: the validator proves every bay fits every piece, so the runtime only checks the pairwise gap and own-slot distance, and the identity fallback is valid by construction. Starts also vary per dino (`questionIndex` in the seed).
- **Full `placed` is invalid:** the last snap advances `questionIndex` (spec-3-3), so a valid snapshot never holds every piece.
- **Resume restarts loose pieces at their arranged starts.** Grass drops are not snapshotted (AC: "2 mảnh còn lại ở chỗ bắt đầu").
- **No new voice or sfx:** prompts, retries and names are the same at every level.
- **New values:** `ui.dinoPieceMinRawPx 40`; `Timing.dinoWalkFrameMs 300` (was 150).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Level 0/1/2 | `{level:0|1|2, seed}` | 3 dinos in `roundSpecies` order; 3 / 4 / 6 pieces each; ghost + pieces at arranged bays | — |
| Clamp | `level 7` / `−1` | treated as 2 / 0 | — |
| Starts determinism | seeds 0…999 × level × dino | identical on repeat; `pairsClear`; every start ≥ 100 px from its own slot; > 1 distinct arrangement per species × cut | — |
| Small piece | L2 triceratops `neck`, raw 50 px | loose at 1.8× (90 px); snaps to scale 1 at its frame spot | — |
| Close slots | L2 `head` dropped at the `neck` slot centre, 60 px from its own | snaps into `head` (own wins); not wrong | — |
| Wrong slot | L2 `tail` dropped on the `head` slot, > 100 px from its own | floats back; `hint.wrong()` | — |
| Home mid-dino | L2, dino 2, 4 of 6 placed | one `round:abandon`; `progress()` = `{questionIndex:1, partial:{placed:[4 ids]}}`; JSON round-trips | — |
| Resume | that snapshot via `scene.start` | 4 pieces at once in place, real colour, no pụp; 2 at their arranged starts; ask replayed; hint level 0; ring target = first unplaced | — |
| Bad partial | `{}`, `placed:'x'`, `[1]`, `['wing']`, `['head-neck']` at L2, duplicates, 6 ids at L2 | that dino starts clean | console.warn once |
| Resume out of range | `questionIndex 3` | dino 0 | console.warn once |
| Clean L1 round | no wrong drops | `round:complete` questions 3, firstTryCorrect 3, maxHintLevel 0 | — |
| One piece at level 4 | L1, one piece idles to hint 4 | `maxHintLevel 4`; that dino still counts first-try if no `wrong()` | — |
| Layout | a piece with raw longest 30 px; a bay under Home with the body piece; an identity fallback with 2 pieces 10 px apart | render, atlas and check fail naming the id | exit 1 |
| Cut | a bone in no piece of cut 4 | `art:build` fails naming the cut and bone | exit 1 |
| Atlas | > 4 pages | atlas fails, no write | exit 1 |

</intent-contract>

## Code Map

- `app/src/content/games/dino-puzzle.ts` (+ test) -- planned in spec-3-3: `SPECIES`, `PIECES[3]`, `DinoLevel`, the one-level `ladder`, `assets`, `screen`. Add the cuts, the ladder, `PIECE_IDS`, `DINO_BAYS`, `DROP_ORDER`.
- `app/src/games/dino-puzzle/{questions,lines,round,DinoPuzzle}.ts` (+ tests) -- planned in spec-3-3. Add `resumeQuestion`, `beginQuestion(index, placed)`, `restorePieces`, the cut-driven pieces and the loose scale. New: `starts.ts`.
- `app/src/games/mini-game-base.ts`, `app/src/core/snapshot.ts` -- planned in spec-1-7…2-5: `resumeAt`, `progress()`, `readResume`, tally restore. Unchanged.
- `app/src/content/types.ts` -- real `Snapshot`; `SnapshotPartials['dino-puzzle'] = { placed: string[] }` is planned in spec-2-5 and unchanged.
- `app/src/core/rng.ts › mulberry32`, `core/round-tally.ts`, `core/difficulty.ts › nextLevel` -- planned in spec-1-8/1-10.
- `app/src/core/tokens.ts`, `app/src/core/timing.ts` -- real; `spacing.targetGap` (24), `spacing.targetMin` (80), `components.draggableItem.{minSize,hitPad}`, `components.dropTarget.snapRadius` exist in `tokens.generated.ts`. The `ui.dino*` and `Timing.dino*` values are planned in spec-3-3.
- `app/tools/render/blender/build_dino_puzzle.py`, `app/tools/render/build.ts`, `app/tools/layout/{rules,hud-keep-out}.ts`, `app/tools/lint/hint-contrast.ts`, `app/tools/atlas/pack.ts` (`SCREEN_MAX_PAGES`) -- planned in spec-3-3/3-1.
- Source bones (all three FBX): `root, Body, Hips, Torso, Shoulders, Neck, Head(_end), Tail1–5(_end), Front{Leg,UpLeg,LowLeg,Foot}.{L,R}(_end), Back{…}.{L,R}(_end)`.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/core/tokens.ts`, `app/src/core/timing.ts` (+ tests) -- `ui.dinoPieceMinRawPx`, `dinoWalkFrameMs` 300.
- [x] `app/src/content/games/dino-puzzle.ts` (+ test) -- cuts, ladder, `PIECE_IDS`, `DINO_BAYS`, `DROP_ORDER`, the screen ids and frames, and the ladder and cut rules.
- [x] `app/tools/render/build.ts` (+ test), `app/tools/render/blender/build_dino_puzzle.py` -- the `--cuts` argument, `PIECE_BONES` rows, the partition and face checks, `CUT_PLANES`, `BAY_SPOTS`, 2 walk frames.
- [x] `app/src/games/dino-puzzle/starts.ts` (+ test) -- `pieceScale`, displayed rects, `pairsClear`, `clearOfOwnSlot`, `arrangeStarts`. The test sweeps seeds 0…999 over the real generated layout.
- [x] `app/tools/layout/rules.ts` (+ test), `app/tools/lint/hint-contrast.ts` (+ test) -- the new rules with a failing case each, and the bay sites.
- [x] `app/src/content/generated/dino-puzzle.layout.json`, `public/assets/atlases/dino-puzzle{.json,-0..n.png}`, `public/assets/bg/dino-puzzle.png` -- re-render them with the real Blender. Fix rule failures in the builder constants (`BAY_SPOTS`, `CUT_PLANES`, `dinoSizePx` within its tolerance).
- [x] `app/src/games/dino-puzzle/round.ts` (+ test) -- `resumeQuestion` with every bad-partial row, `beginQuestion` with and without `placed`, the close-slot sweep over the real layout, and the tally rows through `RoundTally`.
- [x] `app/src/games/dino-puzzle/DinoPuzzle.ts` -- the cut-driven draggables and targets, the loose scale and snap-to-1, `restorePieces`, and the resumed `build()`.

**Acceptance Criteria:**
- Given a fresh `npm run dev` at 1180×820 touch emulation and dino-puzzle at level 2 (`window.bhcDev` or `bhc.progress` set to 2), when the round starts, then every dino shows 6 pieces (head, neck, body, front legs, back legs, tail) spread on the lawn around the ghost. None overlaps, none covers the ghost or the Home/Speaker corners, and every piece, including the smallest leg or neck, looks at least as big as a fingertip. With levels 0 and 1 the dinos have 3 and 4 pieces.
- Given level 2, when the child drops the neck piece onto the ghost's neck, then it snaps with "pụp", shrinks to its true size and joins the body with no visible seam. When all 6 are placed, the dino comes alive as in Story 3.3.
- Given level 2 with 4 of 6 pieces placed on the second dino, when the child taps Home and the shell restarts the scene with the abandoned snapshot (Epic 2 Map, or `scene.start('dino-puzzle', { level, seed, resume })` from DevTools), then the 4 pieces are already in the ghost in real colour with no sound, the other 2 wait at the same spots as before, "Mình ghép bạn khủng long nào!" plays, and the hint starts from level 0.
- Given a resume whose `partial.placed` is edited to `['wing']`, then the second dino starts empty with the request, one `console.warn` is logged, and nothing is shown to the child.
- Given a level-1 round with no wrong drop, then exactly one `round:complete { gameId: 'dino-puzzle', questions: 3, firstTryCorrect: 3, maxHintLevel: 0 }` is emitted, and Map's `nextLevel` may raise the level to 2.
- Given `cd app && npm run check`, then it exits 0, and `validate:content` accepts the dino layout with 30 slots and 8 bays.

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
  - **`Back` spine bone.** All three FBX have a deform bone named exactly `Back` (between the hips and the tail; 5–26 dominant vertices). The table's `Back*` prefix would have put it in `back-legs`. The back-leg patterns are therefore `BackLeg*`, `BackUpLeg*`, `BackLowLeg*`, `BackFoot*` (front legs likewise), and `Back` joins the body piece of every cut (`body-legs`, `back`, `body`).
  - **Consistent faces across cuts.** A piece id is rendered once, so faces are assigned to "atoms" (bones that share a piece in every cut), ties to the atom holding `Body`; a piece is the union of its atoms. Every cut stays an exact partition with one frame per piece id.
  - **`CUT_PLANES` value.** Instead of a hand-typed world point and normal, a value is `(bone, t)`: the plane through the posed bone at fraction `t`, normal along the bone. It is still a world-space plane at build time, but it follows the pose. Only `('apatosaurus', 'neck', 'head'): ('Neck', 0.88)` is needed (the long-neck's head alone was 34 px; now 64 px).
  - **`PIECE_MIN_FACES` = 12.**
  - **Bays.** `BAY_SPOTS` were tuned with an offline search of the bay × piece envelope (all 10 pieces × 3 species): bays 1 (180, 330) left-back, 2 (874, 386) right, 3–6 the front row at y 560 (x 400, 640, 160, 860), 7 (180, 450) left, 8 (874, 480) right. The front row cannot hold more bays: the stegosaurus' 252 px body-legs fits only y∈[552, 568] below its ghost.
  - **Start seed.** `rng = mulberry32(startSeed(seed, questionIndex, attempt))` with the salts in `core/rng.ts` (magic numbers are banned in games); `START_ATTEMPTS = 64` lives in content.
  - **Commands.** `build` is renamed `showDino { species, cut, pieces, fade }` (slot targets for the whole cut, loose pieces for the unplaced ones), followed by `restorePieces { ids }` and `beginQuestion`. `DropOutcome` is now content `DROP_ORDER`'s type and `resolve` walks `DROP_ORDER`.
  - **Bad partial is still `accepted`** (tally restore kept), as in pizza; the warning is `dino-puzzle: bad resume partial`.
  - **Matrix row "One piece at level 4".** Idle escalation stops at level 3 (spec-1-9); level 4 needs 4 `wrong()` calls, and `RoundTally` (spec-1-10) counts a dino first-try only when its hint level stayed 0. The test therefore idles to 3, drops wrong to reach 4 and expects `maxHintLevel 4` with that dino not first-try. Core tally semantics were not changed.
  - **Close-slot info lines** are printed by `validate:content` (`content: info …`, with "30 slots, 8 bays"); `validateDinoPuzzle` takes an optional `info` sink.
  - **Atlas.** 3 pages (≤ 4); `SCREEN_MAX_PAGES` unchanged.
  - **Review fix: `clearOfOwnSlot` → `clearOfSlots`.** A start must be ≥ snapRadius from every slot of the cut, not only its own (else a small drag off a bay could resolve as `other`). Both `arrangeStarts` and the validator's identity-fallback check use it; the real layout passes unchanged (no re-render). The validator reports "fewer bays than a cut" once and names a fallback it cannot check; the always-true "displayed side ≥ itemMin" check was dropped.
## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind, edge | The old "start ≥ snapRadius from every slot of its species" rule was replaced by an own-slot check only, so a bay can sit inside another piece's snap zone and a small drag off the bay counts as wrong | medium | `clearOfOwnSlot` checks only the own slot; `home` covers only snapRadius/2 around the bay | patch |
| 2 | verification-gap | The identity-fallback own-slot branch and the "more pieces than bays" branch of `validateDinoPuzzle` are untested | medium | Deleting the `clearOfOwnSlot` line keeps every dino-rules test green | patch |
| 3 | blind, edge | The bay-count problem repeats per species and is skipped without an atlas; the fallback check is skipped silently when the atlas is absent or a bay is missing | low | Direct move out of the loop and atlas branch | patch |
| 4 | blind, edge | Snap scale tweens are not stored on the view, so `destroyPiece` mid-snap leaves tweens on a destroyed image | low | Direct fix | patch |
| 5 | blind | Enlarged pieces only shrink on snap; the 1.05× bounce never shows | low | Direct fix (overshoot relative to the start) | patch |
| 6 | blind | `starts(index)` clamps the species index but passes the raw index to `arrangeStarts` | low | Direct fix | patch |
| 7 | blind, edge | `dinoLayoutInfo` rebuilds the close-slot message, swallows errors with an empty catch, and throws on a layout without slots/anchors | low | Use the `info` callback; direct fix | patch |
| 8 | blind, verification-gap | Weak tests: "known to exactly the cuts" checks one cut; the fallback test uses a hard-coded 90 and the wrong size formula; the close-slot sweep does not assert its seed; the displayed-size test title claims a rule it does not trip | low | Each test is weaker than its title | patch |
| 9 | blind | Explanatory comments removed from round.test.ts | low | Direct restore where still true | patch |
| 10 | verification-gap, blind | DinoPuzzle scene handling of `showDino`/`restorePieces`, loose/lift scales and hit radius untested | medium | No Phaser scene harness | defer |
| 11 | blind, edge | `begin` trusts `placed`; fewer bays than pieces would leave undefined starts | low | `startCommands` validates `placed` via `resumeQuestion`; `validateDinoPuzzle` enforces bays ≥ pieces | reject |
| 12 | blind | `restorePieces` adds a hidden ellipse per restored piece | low | Negligible | reject |
| 13 | blind | Heavy arrangeStarts sweep | low | Suite passes in normal time | reject |
| 14 | blind | Ring contrast sized from the widest/tallest piece | low | Conservative approximation | reject |
| 15 | edge | `DROP_ORDER` could move `other` before `home` | low | Constant in content, reviewed with code | reject |
| 16 | edge | Resumes without `partial` now warn | low | Resume points live only in the session; `makeSnapshot` always writes `partial` | reject |

## Design Notes

**Why bays:** a free seeded scatter of 6 differently sized pieces around a 360 px ghost in a 976×628 interactive rect would need a search the validator cannot prove. With bays, the "fits anywhere" checks are static (8 bays × 10 pieces × 3 species), and only two cheap pairwise checks depend on the shuffle.

```ts
for (let a = 0; a < 64; a++) {
  const order = shuffle(bays, mulberry32(seed + qi * Q_SALT + a * A_SALT));
  const at = Object.fromEntries(pieces.map((p, i) => [p, order[i]]));
  if (pairsClear(at, geo) && clearOfOwnSlot(at, geo)) return at;
}
return Object.fromEntries(pieces.map((p, i) => [p, bays[i]])); // validated
```

**Atlas budget:** each species has 7 whole frames (idle, blink, 2 happy, 2 walk, ghost), about 2.1 MP at renderScale 2. The 10 unique pieces × (idle + ghost) add about 2.35 whole-frame areas × 2. The total is about 10.5 MP for 3 species, against 4 × 4.19 MP of pages. The 4 walk frames would leave too little packing slack.

## Verification

**Commands:**
- `cd app && npm run art:build -- dino-puzzle && npm run render -- dino-puzzle && npm run atlas -- dino-puzzle` -- expected: exit 0; ≤ 4 pages, each ≤ 2048² and ≤ 8 MiB, with 10 piece frames per species; a second `render` gives a byte-identical layout.
- `cd app && npx vitest run src/games/dino-puzzle src/content tools/layout` -- expected: every matrix row passes.
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run build` -- expected: exit 0; every atlas page is precached.

**Manual checks:**
- In `preview.png` and in game at level 2: the 6-piece cut of each species reads as head / neck / body / front legs / back legs / tail; no piece is a sliver; enlarged loose pieces shrink smoothly into place.
- Run the resume AC with and without `prefers-reduced-motion`; the restored pieces appear instantly in both.

## Auto Run Result

**Status:** in-review. `cd app && npm run check` exits 0 (89 test files, 1279 tests; validate:content OK with the dino layout's 30 slots and 8 bays, 24 dino hint-contrast rings; build and precache OK).

**Summary:**
- Content: `PIECES[3|4|6]`, `PIECE_IDS` (10), 3-level ladder, `DINO_BAYS`, `START_ATTEMPTS`, `DROP_ORDER`, bay anchors, 2 walk frames; the screen is generated from SPECIES × PIECE_IDS plus 8 bays.
- Builder: `--cuts`, explicit `PIECE_BONES`, partition and face-count checks (fail names species, cut, piece/bone), `CUT_PLANES`, `BAY_SPOTS`, `walk` [20, 22].
- `games/dino-puzzle/starts.ts`: `pieceScale`, displayed rect, hit radius, `pairsClear`, `clearOfOwnSlot`, `arrangeStarts` with identity fallback.
- `validateDinoPuzzle`: raw/displayed/hit sizes, bay × piece envelope, identity fallback per species × cut, close-slot rule against `DROP_ORDER`; hint-contrast sites are the bays.
- Round model: cut by level, arranged starts, `resumeQuestion`, `begin(index, fade, placed)`, `restorePieces`; scene: cut-driven targets/draggables, loose scale (lift 1.1× loose), snap eases to scale 1, restored pieces in place with no tween/sfx.
- Tokens: `ui.dinoPieceMinRawPx 40`, `Timing.dinoWalkFrameMs 300`.

**Verification:** `art:build`, `render`, `atlas` for dino-puzzle exit 0 (3 pages, each ≤ 2048², ≤ 1.9 MB); a second `render` gives a byte-identical layout; a deliberately bad cut (`4:head-neck,front,head,tail`) fails naming `cut 4: bone "root" is in no piece`; `npx vitest run src/games/dino-puzzle src/content tools/layout` passes (starts swept over seeds 0…999 × 3 dinos × species × cut on the real layout); `npm run check` exit 0.

**Residual risks / manual checks still due:**
- No browser run: the scene (loose scale, snap-to-1 tween, `restorePieces`, resumed build) is covered only through the pure model and typecheck. Run the ACs at 1180×820 (levels 0/1/2, the resume AC with and without reduced motion, the `['wing']` partial).
- Level-2 slots sit close together (down to ~43 px); own-slot-wins makes this safe, but a wrong-slot drop is rare at level 2.
- Look at the 6-piece cuts in game: some pieces read loosely (e.g. the stegosaurus `body` carries the plates; the apatosaurus `head` includes the last stretch of the neck).
- The published atlas was packed from the first of the two renders (PNG bytes vary slightly between EEVEE renders; the layout is identical).
