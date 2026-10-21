---
title: 'Story 2.1 — ProgressStore lưu bền vững và nhớ độ khó qua các lần mở app'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'NO_VCS'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-2-man-mo-dau-nut-choi-mo-khoa-am-thanh.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-kart-chay-toi-tram.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-tiem-kem-luot-3-5-cau-do-kho-tang-dan.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 1.2's minimal `ProgressStore` only loads and writes a v1 document. The Tiệm kem level lives in `SessionStore.levels` (spec-1-7/1-10), so a reload sends the child back to level 0. Nothing stops other code from touching storage, and there is no schema migration path.

**Approach:**
- Turn `core/progress-store.ts` into the durable store for schema **v2**:
  - typed actions (`setDifficulty`) and a clamped read (`getDifficulty`);
  - step-by-step migrations;
  - the storage-failure policy from the story.
- Map's `round:complete` handler writes the level with `ProgressStore.setDifficulty`. `startData` reads it from `getDifficulty`. `SessionStore` loses `levels`, `levelFor` and `recordRound`.
- A lint rule keeps storage APIs inside `core/progress-store.ts`.

## Boundaries & Constraints

**Always:**
- **Document** (key `bhc.progress`, `PROGRESS_SCHEMA_VERSION = 2`): `{ schemaVersion, seq, difficulty: Partial<Record<GameId, number>>, decorations: DecorationSlot[] }`.
  - `DecorationSlot = { slotId: string; stationId: GameId; decorationId: string; seq: number }` lives in `content/types.ts`. Story 2.2 fills it.
  - Defaults: `{ schemaVersion: 2, seq: 0, difficulty: {}, decorations: [] }`.
- **Actions** write the whole document synchronously with `setItem`, inside the call, with no debounce, timer or promise. Every action writes, even when the value is unchanged. The generic public `update()` from 1.2 becomes private (`commit`). Only named actions mutate the document.
- **`setDifficulty(gameId, level)`:**
  - `'touch-talk'` is a silent no-op (no write).
  - If `level` is not a non-negative integer, the call warns and does nothing.
  - Otherwise it sets `difficulty[gameId]` and writes.
  - It does not change `seq`. `seq` is the last issued `DecorationSlot.seq` and only `grantDecoration` (2.2) advances it.
- **`getDifficulty(gameId, ladderLength)`** is pure: no write and no warn.
  - It returns 0 when the key is missing, the value is not an integer (`1.5`, `"2"`, `null`), the value is negative, the game is `touch-talk`, or `ladderLength < 1`.
  - Otherwise it returns `min(value, ladderLength − 1)`.
- **`init(deps?)`** keeps 1.2's contract: idempotent, the only `navigator.storage.persist()` caller, and it never rejects.
  - Loading and migrating happen **synchronously** inside the first `init()` call. Only `persist()` is awaited. Map's reads after Start therefore see the loaded document.
- **Load pipeline:**
  1. Read the key.
  2. `JSON.parse` it.
  3. Check that `schemaVersion` is an integer ≥ 1.
  4. If it is newer than the app, reject the document.
  5. Run `migrate()` for each step `MIGRATIONS[v]` (v → v+1) until the current version.
  6. Validate the shape.
  7. Sanitise the result.
  8. If a migration ran, write the document back at once.
- **Shape:**
  - The document is an object.
  - `seq` is an integer ≥ 0.
  - `difficulty` is a plain object (not an array).
  - `decorations` is an array.
- **Sanitise** (in memory only; the cleaned version is written by the next action):
  - Drop `difficulty['touch-talk']`.
  - Drop decoration entries that are not well-formed `DecorationSlot`s. That means a string `slotId`/`decorationId`, a `stationId` in `GAME_IDS`, and an integer `seq` ≥ 0.
  - When anything is dropped, warn once.
  - Keep other `difficulty` values as they are. They are clamped when read.
- **Lint:** outside `src/core/progress-store.ts` and its test, any use of `localStorage`, `sessionStorage` or `indexedDB` fails `npm run check`. That covers both the bare globals and member access such as `window.localStorage`. So does any use of `navigator.storage`.

**Never:**
- No `grantDecoration`, decoration catalog, reward-service, fly-in, pull-back chain, overlay or resume (Stories 2.2–2.5).
- No storage access outside `core/progress-store.ts`, and no IndexedDB.
- No wall clock in the document. No async or debounced writes. No visible or audible error.
- No change to `nextLevel` (spec-1-10).
- No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **v1→v2 migration:** keep `seq` and `difficulty`, and set `decorations: []`. v1 `decorations` was `string[]`, which has no slot, and Epic 1 never writes any.
- **Corrupt vs unusable storage:**
  - Unparseable JSON, a bad shape, a missing or non-integer `schemaVersion`, or a throwing migration all count as **corrupt**. The store uses defaults in memory and **keeps storage attached**, so the next action overwrites the key with defaults plus that change (UX-DR55). It does not write at init.
  - A throwing `getItem`/`setItem`, no `localStorage`, or a **newer** `schemaVersion` mean **memory-only for the session**: storage is detached and nothing is written again.
  - Each case warns once. An action called before `init()` works in memory only, and `init()` then loads over it.
- **Level that `nextLevel` starts from:** Map keeps spec-1-10's `startedLevel`, the `level` it passed in the start data. That stays correct once 2.5 resumes at `snapshot.level`.
- **`startData(id, ladderLength, rng, progress = ProgressStore)`** reads `progress.getDifficulty(id, ladderLength)`. The new parameter is a `Pick<…, 'getDifficulty'>` for tests.
- **Lint uses `no-restricted-globals` + `no-restricted-properties`,** not `no-restricted-syntax`. Flat-config entries for the same rule replace each other, and the scenes/games blocks already own `no-restricted-syntax`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First run | no key | defaults in memory and written; `getDifficulty('ice-cream',4)` = 0 | — |
| Set + reload | `setDifficulty('ice-cream',2)`; new store, same storage, `init()` | `setItem` called inside the action; reloaded `getDifficulty` = 2 | — |
| touch-talk | `setDifficulty('touch-talk',1)` | no write; key absent from `difficulty` | — |
| Bad level arg | `setDifficulty('ice-cream',-1 \| 1.5)` | ignored, no write | `console.warn` |
| Read clamp | stored 9 / −2 / 1.5 / `"2"` / missing, len 4 | 3 / 0 / 0 / 0 / 0; storage untouched | — |
| Migrate v1 | `{schemaVersion:1, seq:4, difficulty:{'ice-cream':2}, decorations:['x']}` | `{schemaVersion:2, seq:4, difficulty:{'ice-cream':2}, decorations:[]}` written during `init()` | — |
| Newer schema | `schemaVersion: 3` | defaults; key never overwritten by later actions | one warn |
| Corrupt | `"{bad"`, `null`, `{schemaVersion:2}`, `difficulty: []` | defaults; no write at init; next action writes defaults + change | one warn |
| Stray entries | v2 doc with `difficulty['touch-talk']` and one malformed decoration | both dropped in memory; rest kept | one warn |
| Storage throws | `getItem` throws, or `setItem` throws (quota) | memory-only; levels still move within the session | one warn total |
| persist | rejects / false / missing | app continues | one warn (1.2) |

</intent-contract>

## Code Map

- `app/src/core/progress-store.ts` / `.test.ts` -- the Story 1.2 store: `PROGRESS_KEY`, `ProgressState`, `defaultProgress`, `StorageLike`, `ProgressDeps`, `ProgressStoreService` (`init`, `state`, public `update`, `load`, `write`, `requestPersist`) and the `ProgressStore` singleton. It is rewritten in place. The 1.2 tests that expect `seq` to bump on `update`, or no write after a corrupt load, change to the new policy.
- `app/src/content/types.ts` -- `GAME_IDS`, `GameId`. Add `DecorationSlot`.
- `app/src/core/shell-flow.ts` / `app/src/scenes/Start.ts` -- `initStore: () => ProgressStore.init()` exists. No change.
- `app/src/core/session-store.ts` (+ test) -- planned in spec-1-7 (`levels`, `levelFor`, `startData`) and spec-1-10 (`recordRound`). Remove the level parts.
- `app/src/core/difficulty.ts` -- planned in spec-1-10: `nextLevel(current, outcome, ladderLength)`. It is used unchanged.
- `app/src/scenes/Map.ts` -- planned in spec-1-7/1-10. It keeps `{ id, level }` of the running game, and calls `recordRound` on `round:complete` before stopping the game.
- `app/eslint.config.js`, `app/tools/lint/rules.test.ts` -- the flat config and the `ruleIds(file, code)` helper for rule cases.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/content/types.ts` -- add `DecorationSlot`.
- [x] `app/src/core/progress-store.ts` -- schema v2, an exported pure `migrate(raw): ProgressState` (throws on a bad shape or a newer version), `MIGRATIONS`, sanitise, `setDifficulty`, `getDifficulty`, private `commit`, and the corrupt vs detached policy. Update the file header.
- [x] `app/src/core/progress-store.test.ts` -- one test per matrix row. Add a fixture per migration step (`v1→v2`), plus a generic "v1 fixture → current" test that loops `MIGRATIONS` and asserts the difficulty is unchanged. Add a test that `setItem` has run before `setDifficulty` returns.
- [x] `app/src/core/session-store.ts` (+ test) -- remove `levels`, `levelFor` and `recordRound`. `startData` reads `getDifficulty` through the injectable `progress`. Tests: fake progress returns 2 → `level: 2`. Using a real `ProgressStoreService` on memory storage, set 2, re-create and `init()` → `startData` gives `level: 2`.
- [x] `app/src/scenes/Map.ts` -- on `round:complete`, synchronously on receipt, call `ProgressStore.setDifficulty(id, nextLevel(startedLevel, outcome, GAMES[id].ladder.length))`. This replaces `SessionStore.recordRound`, and the rest of the return path is unchanged.
- [x] `app/eslint.config.js` -- a block for `src/**/*.ts` that ignores `src/core/progress-store.ts` and `src/core/progress-store.test.ts`:
  - `no-restricted-globals`: `localStorage`, `sessionStorage`, `indexedDB`.
  - `no-restricted-properties`: `{property:'localStorage'}`, `{property:'sessionStorage'}`, `{property:'indexedDB'}`, `{object:'navigator', property:'storage'}`.
- [x] `app/tools/lint/rules.test.ts` -- ban cases:
  - `localStorage.getItem(k)` in `src/scenes/X.ts`;
  - `window.localStorage` in `src/core/x.ts`;
  - `indexedDB.open('x')` in `src/games/pizza/scene.ts`;
  - `navigator.storage.persist()` in `src/core/session-store.ts`.

  Allow cases: the same code in `src/core/progress-store.ts`, and `navigator.userAgent` anywhere.

**Acceptance Criteria:**
- Given a fresh `npm run dev`, when the child finishes a Tiệm kem round with every answer right the first time, then `bhc.progress` in DevTools shows `difficulty['ice-cream'] = 1` right after Shiba's celebration. After a full page reload and the tap on ▶, the next Tiệm kem round starts at level 1, which is visible in the ladder's flavour/scoop count.
- Given `bhc.progress` set in DevTools to a v1 document with `difficulty: {'ice-cream': 3}`, when the page reloads and ▶ is tapped, then the key reads `schemaVersion: 2` with the same difficulty, and Tiệm kem starts at level 3.
- Given Safari Private mode or `bhc.progress` = `"{bad"`, when the child plays two rounds, then nothing is shown or heard about storage. The console has one `progress:` warning and the level still moves within the session. For `"{bad"`, the key holds a valid v2 document after the first round.
- Given a file outside `core/progress-store` that uses `localStorage`, `indexedDB` or `navigator.storage`, when running `npm run check`, then lint fails.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | verification-gap, blind | Map's `round:complete` → `setDifficulty(nextLevel(...))` composition has no test since `recordRound` and its test were removed | medium | No test runs Map (vitest include excludes scenes); dropping the call or passing `run.level` keeps every test green | patch |
| 2 | blind | `const CORE_MSG ='…'` lost its space | low | Unrelated formatting regression in eslint.config.js; direct correction | patch |
| 3 | blind, edge | Storage ban misses destructuring, computed access, `window.navigator.storage`, Cache API, cookies | low | Spec fixes the rule shape (globals + properties); bypasses need deliberate code; fix adds no-restricted-syntax conflicts | reject |
| 4 | blind | New block may silently replace other `no-restricted-globals/properties` entries | false | No other block in eslint.config.js sets either rule (only lines 200/204) | reject |
| 5 | blind | `state` getter returns the mutable document | low | Pre-existing (1.2); no caller mutates it | reject |
| 6 | blind, edge | sanitise keeps malformed difficulty values and unknown keys | low | Spec: "Keep other difficulty values as they are. They are clamped when read."; unknown keys only cost bytes | reject |
| 7 | blind | No duplicate-slot / seq consistency checks on decorations | low | Decoration granting is Story 2.2 (intent Never list) | reject |
| 8 | blind | Corrupt document overwritten with no backup | low | Spec decision (UX-DR55): corrupt → defaults, next action overwrites | reject |
| 9 | blind | No multi-tab handling | low | Home-Screen app runs one instance; unlikely | reject |
| 10 | blind, edge | Pre-init actions discarded on some paths, kept on detached ones | low | Map only acts after Start → init(); spec says init loads over pre-init state; nothing to load when detached | reject |
| 11 | blind | `defaultPersist` try/catch untested | low | Defensive guard; failure path is a null persist already covered | reject |
| 12 | blind | getDifficulty table titles use `%#` (row index) instead of the expected value | low | progress-store.test.ts:137; misleading failure names; direct correction | patch |
| 13 | blind | migrate corrupt-input test's instanceof check could pass vacuously | low | The preceding line asserts the throw | reject |
| 14 | edge | AC "one progress: warning" breaks when persist() resolves false | low | The persist warn is a separate 1.2 row ("one warn (1.2)"); AC counts the storage warning | reject |

## Design Notes

**Why corrupt data keeps storage attached but a newer schema does not:** corrupt bytes have no value worth keeping, and UX-DR55 wants a clean island next time. A newer document belongs to a newer app build, for example after a rollback, and overwriting it would erase real progress.

**Migration shape:**
```ts
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  1: (d) => ({ ...d, schemaVersion: 2, decorations: [] }),
};
```
`migrate` runs `MIGRATIONS[v]` while `v < PROGRESS_SCHEMA_VERSION`. A missing step throws, and the document is then treated as corrupt.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0. The new progress-store, session-store and lint cases pass, and no file outside `core/progress-store.ts` references storage APIs.
- `cd app && npx vitest run src/core/progress-store.test.ts` -- expected: every matrix row, plus the migration fixtures, passes.

**Manual checks:**
- In `npm run dev`, go through AC 1–3 in DevTools Application › Local Storage. The ladder level is visible from the number of flavours and scoops (spec-1-10 ladder).
