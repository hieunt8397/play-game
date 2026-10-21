---
title: 'Story 2.5 — Giữ lượt dở trong phiên và tiếp tục đúng câu đang dở'
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
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-8-tiem-kem-keo-kem-dung-vi-cho-shiba.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-tiem-kem-luot-3-5-cau-do-kho-tang-dan.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-progressstore-luu-ben-vung-nho-do-kho.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-chuoi-sau-luot-tren-ban-do.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-4-lop-phu-hoi-choi-tiep.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** After Stories 1.7–2.4, a Home tap mid-round emits `round:abandon { gameId, snapshot }`, but nobody keeps the snapshot:
- Map ignores it (spec-2-3: "no resume change");
- re-entering a station always starts a new round at the `ProgressStore` level;
- no game can rebuild a question from a snapshot;
- the Map shows no "lượt dở" mark.

FR27 / UX-DR38 are unmet, and Epics 3/4 have no generic snapshot/resume contract to implement.

**Approach:**
- **Generic contract:**
  - `content/types.ts` types the per-game `partial` (`SnapshotPartials`, every game declared, `touch-talk` included).
  - A pure `core/snapshot.ts` builds the envelope, checks it is plain JSON and validates an incoming `resume`.
  - `MiniGameBase` composes `snapshot()` from a subclass `progress()` and hands the subclass a validated `resumeAt`.
- **Map:**
  - It keeps the snapshot on `round:abandon` through `SessionStore.setResume`.
  - It draws a static `core/ui/resume-mark` on each station that holds one.
  - It starts that station with `{ level: snapshot.level, seed: snapshot.seed, resume }` on the next normal entry.
- **Tiệm kem** restores question `questionIndex` with the placed scoops already on the cone.

## Boundaries & Constraints

**Always:**
- **Types** (`content/types.ts`, type aliases, not interfaces, so they stay assignable to `JsonValue`):
  - `SnapshotPartials`:

    | game | `partial` |
    |---|---|
    | `ice-cream` | `{ placed: FlavourId[] }` |
    | `pizza` | `{ placed: number[]; baked: boolean }` |
    | `dino-puzzle` | `{ placed: string[] }` |
    | `shadow-match` | `Record<string, never>` |
    | `race` | `{ traceIndex: number }` |
    | `fishing` | `Record<string, never>` |
    | `touch-talk` | `{ sceneId: string; touchedIds: string[] }` |

    The shapes are taken from the Story 3.2/3.4/3.6/4.2/4.4/4.5/4.6 ACs.
  - `TallyState = { questions: number; firstTryCorrect: number; maxHintLevel: HintLevel }`.
  - `Snapshot<G extends GameId = GameId> = { v: 1; level; seed; questionIndex; partial: SnapshotPartials[G]; tally?: TallyState }`.
  - `GameStartData` (spec-1-7) keeps `resume?: Snapshot`. The `round:abandon` payload type is unchanged.
- **`core/snapshot.ts`** (pure):
  - `isJsonOnly(v)` is true only for `null`, strings, booleans, finite numbers, arrays, and plain objects (prototype `Object.prototype` or `null`), checked deeply. A function, class instance, `undefined`, `NaN`, `Infinity` or a cycle makes it false.
  - `makeSnapshot({ level, seed, tally, progress: { questionIndex, partial } })` returns the envelope with `v: 1`. In a dev build it calls `console.error` when `isJsonOnly` is false.
  - `readResume(resume, start: { level, seed })` returns `{ questionIndex, partial, tally }`, or `null` with one `console.warn` when any of these fails:
    - `v === 1`;
    - `level`, `seed` and `questionIndex` are integers with `questionIndex ≥ 0`;
    - `level === start.level` and `seed === start.seed`;
    - `isJsonOnly(resume)`.

    An invalid `tally` becomes the empty tally with a warn. `partial` is returned as `unknown`, and the game validates it.
- **`MiniGameBase`** (spec-1-7/1-8/1-10 base):
  - `init(data)` sets `protected resumeAt = data.resume ? readResume(data.resume, data) : null`.
  - When `resumeAt` is set, `tally.restore(resumeAt.tally)` adds those closed questions to the round tally.
  - The subclass's spec-1-7 `snapshot()` becomes `protected abstract progress(): { questionIndex: number; partial: SnapshotPartials[G] }`. The base's `snapshot()` is `makeSnapshot({ level, seed, tally: tally.state(), progress: progress() })`, and `abandon()` emits it.
  - `build()` starts fresh when `resumeAt` is null. Otherwise it begins question `resumeAt.questionIndex` with the progress from its validated `partial`. That question begins through `hint.beginQuestion`, so the level is 0 and the full prompt is read again (spec-1-9).
  - **Invalid partial:** the game warns once and begins that question clean.
  - **Out-of-range `questionIndex`** (≥ the level's question count): the game warns once and starts from question 0 with the same level and seed.
  - The Home-while-finishing rule (spec-1-10) is unchanged. No snapshot is ever made after the last `questionDone`.
- **`core/round-tally.ts`** (spec-1-10) gains:
  - `state(): TallyState`, covering closed questions only;
  - `restore(s)`, which adds `s` (counts summed, max taken) before any question begins.
- **Tiệm kem:**
  - **Snapshot:** `progress()` = `{ questionIndex, partial: { placed } }` from the pure round model (spec-1-8/1-10), with `placed` in cone order.
  - **Restore:** the round model gains `resumeQuestion(index, partial) → { placed } | null`, which returns `null` (invalid) unless all of these hold:
    - `partial` is `{ placed: string[] }`;
    - every entry is in `questionFor(seed, index, level).wanted`;
    - the entries are distinct;
    - `placed.length < wanted.length`;
    - on an ordered level, `placed` equals `wanted.slice(0, n)`.
  - **Scene build** of the resumed question:
    1. Draw the counter as usual.
    2. Put the placed scoops straight on `slot.cone-1…n` with no tween, no sfx and no celebration, locked like served scoops, with fresh copies at home (spec-1-10 respawn).
    3. Call `hint.beginQuestion({ promptLineId: askLineId(q), retryLineId: retryLineId(q, n), step: <stage step for n placed> })`, with the same step rules as spec-1-10's `stepDone`.
- **`SessionStore`** (spec-1-7…2-3; `resume` and `clearResume` come from spec-2-3):
  - `setResume(id, s)` stores `JSON.parse(JSON.stringify(s))`, so the stored copy never aliases game state.
  - `getResume(id)`.
  - `resumeIds(): GameId[]`, in `GAME_IDS` order.
  - It is memory only. A reload gives an empty `resume`, and a hidden page or `AudioUnlockOverlay` keeps it.
- **`resumeStartData(id, ladderLength, session = SessionStore)`** (`core/session-store.ts`, next to `startData`):
  - With a stored snapshot whose `level` is in `[0, ladderLength − 1]`, it returns `{ level: s.level, seed: s.seed, resume: s }`.
  - With a stored snapshot whose level is outside that range, it warns and returns `null`.
  - With no snapshot, it returns `null`.
- **Map wiring:**
  - **`round:abandon`** from the running game, synchronously on receipt: `SessionStore.setResume(gameId, snapshot)`. spec-2-3's return path then runs unchanged (the fade, or the abandon chain when fly-ins are pending). There is no `setDifficulty`, no grant and no overlay.
  - **Start** (spec-1-7 `enter`):
    1. `data = (enter.via === 'replay' ? null : resumeStartData(id, len)) ?? startData(id, len, rng)`.
    2. `startedLevel = data.level`.
    3. `SessionStore.clearResume(id)` in both cases: a start without resume clears it, and a resumed start consumes it.
    4. `syncResumeMarks()`.
    5. spec-1-7's start.
  - **Marks:** `syncResumeMarks()` runs on `create`, on every `wake` (including the chain path of spec-2-3), and at start.
- **Resume mark:**
  - **Plan:** pure `core/resume-marks.ts › resumeMarkPlan(ids, hits, interactive) → { id, x, y }[]`.
    - One mark per id, centred on the top-right corner of `bbox(hits[id])`, moved inwards by `ui.resumeMarkRadiusPx`.
    - Then clamped so the whole circle lies inside the interactive rect (safeRect minus the dead bands, as in spec-2-2).
  - **Drawing:** `core/ui/resume-mark.ts › drawResumeMark(scene, at)` draws one Graphics:
    - an annulus of radius `ui.resumeMarkRadiusPx` and width `ui.resumeMarkStrokePx` in `colors.buttonHome`;
    - a 2 px `colors.iconInk` outline on both edges;
    - a `colors.counterTop` centre dot of radius `ui.resumeMarkDotPx`;
    - depth `ui.resumeMarkDepth`, above every map sprite.
  - **No motion:** there is no tween, pulse or alpha change, and no reaction to reduced motion (nothing moves).
  - **Not a target:** the mark is not interactive. A tap on it hits the station polygon underneath.
  - **Sync:** `syncResumeMarks()` destroys the marks for ids no longer in `resumeIds()` and creates the missing ones.

**Never:**
- No persistence of `resume` (no `ProgressStore`/`localStorage` field) and no new schema version.
- No snapshot write outside Map's `round:abandon` handler. No `setResume`/`clearResume` in games.
- No game reads `SessionStore`, `ProgressStore` or the Bus to find its own resume. It reads only `init` data.
- No overlay, grant, `setDifficulty` or `nextLevel` on abandon. No resume on the replay path (spec-2-4).
- No blinking, pulsing or animated mark. No reuse of `createHintRing` for the mark. No text.
- No change to the `round:abandon` payload, the chain order, or the HintDirector machine.
- No git. No writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **Consume on start:** a resumed start clears `resume[id]` at once. The mark therefore vanishes as the game starts. A second Home writes a fresh snapshot, and a complete leaves nothing stale. The architecture's "only Map clears" still holds.
- **Every Home mid-round keeps a snapshot**, even at question 0 with nothing placed, because the same seed then gives the same question back.
- **`tally` is a base-owned extra field.** Without it, a resumed round would judge `nextLevel` only on the questions after the resume, so a level-4 question before Home would be forgotten.
  - It is optional in the type. The ACs' `{ v, level, seed, questionIndex, partial }` holds as a subset, and tests use `toMatchObject` for those fields plus an explicit `tally` assertion.
  - The open question's hint level before Home is not kept, because the AC restarts it at level 0.
- **The mark design is assumed** (UX gives only "vòng nhỏ"). It is a small Home-yellow ring with a white dot on the station's top-right corner, which ties it to the Home button. It is visibly different from the purple-and-white pulsing `hint-ring` ellipse around the whole station.
- **New values:** `ui.resumeMarkRadiusPx: 20`, `resumeMarkStrokePx: 8`, `resumeMarkDotPx: 6`, `resumeMarkDepth: 10000`.
- **All seven partials are declared now** from the epics' ACs, so Epic 3/4 stories implement them without editing the contract.
- **`touch-talk` start data** always carries `level: 0`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Home mid-question | L1, question 2 (index 1), strawberry placed | one `round:abandon`; snapshot ⊇ `{v:1, level:1, seed, questionIndex:1, partial:{placed:['strawberry']}}`, `tally` = q1; game inert | — |
| JSON | that snapshot | `JSON.parse(JSON.stringify(s))` deep-equals `s`; `isJsonOnly` true | — |
| Not JSON | progress with a function / a GameObject / `NaN` | `isJsonOnly` false | dev console.error |
| Map stores | `round:abandon` | `getResume('ice-cream')` equals it, not the same object; mark at the truck; no `setDifficulty`/grant/overlay | — |
| Resume start | resume L1; ProgressStore says 2 | start `{level:1, seed, resume}`; `startedLevel` 1; `resume` cleared; mark gone | — |
| Resumed build | that start | question 1 identical to before; strawberry on cone-1; `beginQuestion(ask, retry for 1 placed)`; hint level 0 | — |
| Ordered restore | L3, placed `[wanted[0]]` | cone-1 = wanted[0]; next step = wanted[1] | — |
| Bad partial | placed has a non-wanted / duplicate / out-of-order / full-length value | question 1 begins clean | console.warn once |
| Bad index | `questionIndex` 9 at L0 | starts at question 0, same seed | console.warn once |
| Bad envelope | `v:2`, or seed mismatch | `readResume` null; fresh round at the start level | console.warn |
| Bad level | stored level 7, ladder 4 | `resumeStartData` null; normal start | console.warn |
| Tally carry | q1 hint 4, Home, resume, q2–q3 clean | `round:complete` questions 3, firstTry 2, maxHint 4 → `nextLevel` −1 | — |
| Replay | overlay replay after a resumed round | `via:'replay'`; no resume; new seed | — |
| Final celebration | `hud:home` after the last `questionDone` | `round:complete` only; no `setResume`; no mark | — |
| Two games | `setResume` ice-cream then pizza; clear ice-cream | pizza kept; `resumeIds` `['pizza']`; plan gives 1 mark | — |
| Mark placement | real `map.layout.json`, each of 7 stations | circle inside the interactive rect | — |
| Reload | fresh `SessionStore` | `resume` `{}`; no marks; start uses `getDifficulty` | — |
| Touch-talk type | `Snapshot<'touch-talk'>` with `{sceneId:'sea', touchedIds:['a']}` | type-checks; `{placed:[]}` is a type error | tsc |

</intent-contract>

## Code Map

- `app/src/content/types.ts` -- real `Snapshot`, `JsonValue`, `HintLevel`, `GAME_IDS`. Add `SnapshotPartials` and `TallyState`, and make `Snapshot` generic. `GameStartData` is planned in spec-1-7.
- `app/src/core/bus.ts` -- real `'round:abandon': { gameId; snapshot: Snapshot }`. Unchanged.
- `app/src/core/snapshot.ts` (new, + test) -- `isJsonOnly`, `makeSnapshot`, `readResume`.
- `app/src/core/round-tally.ts` (+ test) -- planned in spec-1-10. Add `state` and `restore`.
- `app/src/games/mini-game-base.ts` -- planned in spec-1-7/1-8/1-9/1-10. Add `resumeAt`, the abstract `progress()` and the composed `snapshot()`.
- `app/src/games/ice-cream/round.ts`, `questions.ts`, `lines.ts`, `IceCream.ts` -- planned in spec-1-8/1-10. Add `progress`, `resumeQuestion` and the resumed build.
- `app/src/core/session-store.ts` (+ test) -- planned in spec-1-7, changed in 2.1–2.3 (`startData`, `pendingFlyIns`, `resume`, `clearResume`). Add `setResume`, `getResume`, `resumeIds` and `resumeStartData`.
- `app/src/core/resume-marks.ts` (new, + test) and `app/src/core/ui/resume-mark.ts` (new) -- the plan and the drawing.
- `app/src/core/tokens.ts` (+ `tokens.test.ts`) -- real `ui`. Add the 4 values. `colors.buttonHome`, `iconInk` and `counterTop` are real in `tokens.generated.ts`.
- `app/src/scenes/Map.ts` -- real file, extended by spec-1-5…2-4 (`enter` command with `via`, the terminal handlers, `wake`/`create`, `startedLevel`). Add the abandon write, the start choice and the marks.
- `app/src/content/generated/map.layout.json` -- `hits` and the safe/dead-zone data used by the mark plan test (spec-1-4/1-5).

## Tasks & Acceptance

**Execution:**
- [x] `app/src/content/types.ts` -- the types above. Add a `tsd`-style compile test in `snapshot.test.ts` using `// @ts-expect-error` for a wrong touch-talk partial.
- [x] `app/src/core/snapshot.ts` (+ test) -- every `isJsonOnly` case, `makeSnapshot`, and every `readResume` rejection row.
- [x] `app/src/core/round-tally.ts` (+ test) -- `state` covers closed questions only, and `restore` sums them (the tally-carry row).
- [x] `app/src/games/mini-game-base.ts` -- `resumeAt`, `progress`, the composed `snapshot`, and `tally.restore`. Update the spec-1-7 skeleton contract users, then grep that no subclass still defines `snapshot()`.
- [x] `app/src/games/ice-cream/round.ts` (+ test) -- `progress` and `resumeQuestion` with each matrix row: the home snapshot, JSON, the ordered restore, every bad-partial variant and the bad index.
- [x] `app/src/games/ice-cream/IceCream.ts` -- the resumed build (static scoops on the cone, home copies, `beginQuestion` with the stage step).
- [x] `app/src/core/session-store.ts` (+ test) -- `setResume` (copy, not alias), `getResume`, `resumeIds`, `resumeStartData`, the two-games row and the reload row. Add a source scan that `setResume(` appears under `src/` (tests excluded) only in `session-store.ts` and `scenes/Map.ts`.
- [x] `app/src/core/resume-marks.ts` (+ test), `app/src/core/ui/resume-mark.ts`, `app/src/core/tokens.ts` -- the plan, including the real-layout row for all 7 stations; the drawing; the tokens.
- [x] `app/src/scenes/Map.ts` -- the abandon write, `resumeStartData` before `startData` unless `via === 'replay'`, clear on every start, and `syncResumeMarks` on create, wake and start.

**Acceptance Criteria:**
- Given a fresh `npm run dev` on Tiệm kem at level 1 (2 scoops), when the child serves one correct scoop on question 2 and taps Home:
  - "pụp" and "Về đảo nào!" play;
  - the island returns with the kart at the truck, and a small yellow ring with a white dot sits still at the truck's top-right corner;
  - there is no overlay, no fly-in and no level change in `bhc.progress`.
- Given that ring, when the child waits 30 s or the invitation ring plays, then the yellow mark never moves or blinks, and the purple invitation ring looks clearly different.
- Given that ring, when the child taps the truck and the kart arrives:
  - the same two flavours stand on the counter, and the served scoop is already on the cone;
  - the full question is spoken again, and the ring is gone from the Map;
  - finishing that question and the round gives the normal chain, and no ring comes back.
- Given `bhc.progress` holds level 2 for ice-cream (set in DevTools) while a level-1 snapshot is held, when the truck is re-entered, then the resumed question is the level-1 question (2 scoops). After the round, the next normal entry uses the level that the chain saved.
- Given a held ring, when the tab is hidden and shown (unlock overlay, ▶), then the ring is still there. When the page is reloaded and ▶ tapped, then there is no ring, and the truck starts question 1 at the stored level.
- Given the last scoop of the last question is served, when Home is tapped during Shiba's celebration, then the post-round chain runs (the level is saved and a decoration flies in) and no ring appears.
- Given the overlay after a resumed round, when the child taps replay, then a fresh round (question 1, new flavours possible) starts at the stored level.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind, edge, verification-gap | The restored tally is kept when the game falls back to question 1, so closed questions are counted twice | medium | `MiniGameBase.create` restores `resumeAt.tally` before `IceCream.build` rejects an out-of-range index or partial; the outcome can exceed the question count and skew `nextLevel` | patch |
| 2 | blind, edge | `readResume` never checks `tally.questions === questionIndex` | low | A mismatched envelope passes and miscounts the outcome; one direct check | patch |
| 3 | blind, edge | `setResume` can throw (cycle/BigInt) inside the abandon handler before `follow(...)`, leaving the child in the game | low | `JSON.parse(JSON.stringify(s))`; `makeSnapshot` only logs in dev; a try/catch keeps the return path | patch |
| 4 | verification-gap | Map's abandon store (running guard, store before the return) runs in no test | medium | Only a source-text scan; dropping the guard stays green | patch |
| 5 | verification-gap, edge | Map's resumed-vs-fresh start data (replay exclusion, clear on every start) runs in no test; `resumeStartData` accepts a seed/envelope that `readResume` later rejects | medium | Removing the replay exclusion or `clearResume` stays green; a bad seed reaches the start data | patch |
| 6 | verification-gap | `IceCream.build`'s resume decision (resume vs start, `restoreCone`) runs in no test | medium | Reverting build to `round.start()` stays green | patch |
| 7 | blind | Token test ignores the ink outline; `RESUME_MARK_EXTENT` test asserts only `>= R`; the degenerate clamp branch is untested | low | Weak assertions; direct test corrections | patch |
| 8 | blind | Stale headers (session-store "empty until Story 2.5"; MiniGameBase silent on tally after a rejected resume) | low | Comments contradict the code | patch |
| 9 | blind | Snapshot types do not tie the partial to the game id at the store | low | Runtime `readResume` per game rejects foreign partials | reject |
| 10 | blind | Resume cleared before the game confirms its start | low | Spec: clear on every start; the scene start is synchronous | reject |
| 11 | blind | An empty-progress snapshot still sets a mark and pins level/seed | low | Spec stores every abandon from the running game | reject |
| 12 | blind | `content/types.ts` imports `FlavourId` from a game content module | low | Type-only import; no runtime cycle | reject |
| 13 | blind | Mark depth 10000 may draw above Map overlays | low | Play-again is a separate scene above Map; fly-in ends before marks matter | reject |
| 14 | blind | Centre-dot colour borrowed from `counterTop` | low | Colour coupling only | reject |
| 15 | blind | `restoreConeScoop` relies on `addScoop` internals | maybe-false | Would need a Phaser run to show a leaked registration | reject |
| 16 | verification-gap | Resume marks rendering (`syncResumeMarks` on create/wake/start) untested | low | No scene harness; `resumeMarkPlan` is tested | defer |

## Design Notes

**Why the base owns the envelope:** each game supplies only what it knows (`questionIndex` and its `partial`). `level`, `seed`, `v` and `tally` are the same for every game, so they cannot drift across Epic 3/4. The game side of resume is one pattern:

```ts
protected build() {
  const at = this.resumeAt;                        // null = fresh
  const start = at && at.questionIndex < this.questionCount ? at : null;
  if (at && !start) console.warn('ice-cream: resume index out of range');
  const placed = start ? this.round.resumeQuestion(start.questionIndex, start.partial) : null;
  if (start && !placed) console.warn('ice-cream: bad resume partial');
  this.beginQuestion(start?.questionIndex ?? 0, placed?.placed ?? []);
}
```

**Why consume-on-start:** the AC needs the ring gone as soon as the game starts. Keeping the snapshot until `round:complete` would also leave it stale for games that never complete (`touch-talk` only abandons, so its next Home simply overwrites it). Clearing at start makes the mark mean exactly "a round is waiting", and a second Home writes a fresh snapshot.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0. The snapshot, tally, round, session-store (including the `setResume` source scan), resume-mark plan (including the real layout) and token tests pass, and the `@ts-expect-error` partial case compiles.
- `cd app && npx vitest run src/core/snapshot.test.ts src/core/session-store.test.ts src/games/ice-cream/round.test.ts src/core/resume-marks.test.ts` -- expected: every matrix row passes.

**Manual checks:**
- Run the AC walkthroughs at 1180×820 touch emulation, with and without reduced motion. The mark is identical in both and never moves.
- Hold a resume at the truck while the pull-back chain of another reward plays (`window.bhcDev.flyInTouchTalk()`). The mark stays static and the chain is unchanged.
