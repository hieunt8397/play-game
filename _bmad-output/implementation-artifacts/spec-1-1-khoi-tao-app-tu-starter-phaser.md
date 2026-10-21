---
title: 'Story 1.1 — Khởi tạo app từ starter Phaser'
type: 'chore'
created: '2026-10-08'
status: 'done'
baseline_commit: 'NO_VCS'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-be-hoc-choi-2026-10-08/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The project has no code. Every later story needs one shared, convention-enforcing foundation (Phaser 4 app, folder layering, design tokens, typed Bus, `npm run check`) or independently built parts will drift.

**Approach:** Scaffold `app/` from the official Phaser Vite-TS starter, upgrade it to the pinned stack, strip telemetry, set the 1024×768 ENVELOP stage with page guards and CSS portrait rotation, add the token generator, timing table, typed Bus, ESLint layering/literal rules and a single `npm run check` gate. A blank (placeholder) scene running on PC localhost is the visible result.

## Boundaries & Constraints

**Always:**
- Pinned: Phaser 4.2.1, Vite 8.3.3, TypeScript ~5.9.3, typescript-eslint 8.71.1, Vitest 5.0.3, Node `>=24 <25` + `.nvmrc`.
- One `app/vite.config.ts` (`base: './'`, no object `manualChunks`, no `terser`); dev/build scripts make no outbound network calls.
- Layer rule: scenes → games/core/content; games → core/content; core → content; content imports types only — enforced by ESLint `no-restricted-imports`.
- Tokens come only from DESIGN.md YAML via `tools/tokens`; generated file is committed and checked by a diff step.
- Every behavioural duration lives in `core/timing.ts`, exposed as `Tokens.Timing.*`.

**Never:**
- No game logic, real scenes (Start/Map/Hud), audio, PWA, Blender/TTS tools — those are Stories 1.2–1.11.
- No CDN/remote fonts or analytics; no hand-copied colour values in code outside generated tokens.
- Do not edit planning artifacts.
- Decision (human, 2026-10-08): **no git** — do not run `git init` or create commits; review compares files directly.
- Decision (human, 2026-10-08): keep this spec whole (~1.9k tokens) — single foundation goal, not split.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Layer violation | `core/x.ts` imports from `scenes/` | `npm run check` fails at ESLint | lint message names the rule |
| Literal in scene | `#FF0000` or `rgba(` or magic number in `src/scenes/**` | check fails | allow-list `[-1,0,1,2,0.5]` |
| Stale tokens | DESIGN.md YAML changed, generated file not regenerated | tokens-diff step fails | prints "run npm run tokens" |
| Unknown event | `bus.emit('foo:bar', …)` or wrong payload | `tsc --noEmit` error | — |
| Scene shutdown | listener via `bus.scoped(scene)` | removed on SHUTDOWN/DESTROY | unit test |
| Portrait viewport | window taller than wide | stage rotated 90° by CSS, still landscape | — |

</frozen-after-approval>

## Code Map

- `_bmad-output/planning-artifacts/ux-designs/ux-be-hoc-choi-2026-10-08/DESIGN.md` -- YAML front matter (lines 1–141): `colors`, `typography`, `rounded`, `spacing`, `components` → input of `tools/tokens`. Compound strings (e.g. hint-ring) must become typed fields.
- `_bmad-output/planning-artifacts/ux-designs/ux-be-hoc-choi-2026-10-08/EXPERIENCE.md` -- source of all durations for `core/timing.ts` (State Patterns, Interaction Primitives, per-game table).
- `ARCHITECTURE-SPINE.md` -- AD-1 (GameId list), AD-7 (ENVELOP, safeRect), AD-8 (tokens/lint), AD-11 (Bus EventMap, `bus.scoped`), AD-12 (`npm run check`), Structural Seed (folder tree).
- Starter `phaserjs/template-vite-ts` 1.4.0 -- ships `vite/config.dev.mjs`, `vite/config.prod.mjs`, `log.js`, `src/main.ts`, `src/game/scenes/*` (Boot/Preloader/MainMenu/Game/GameOver). Reuse `index.html`, `public/`; replace scenes with one placeholder `Boot`.
- `play/assets/` -- already exists (CC0 Kenney/Quaternius sources). Do not move or modify.

## Tasks & Acceptance

**Execution:**
- [x] `app/` -- `npx degit phaserjs/template-vite-ts app`; delete `log.js`, `vite/`, template scenes; restructure to `src/{core,content,scenes,games}`, `tools/`, `src/styles/` -- starter base, Structural Seed
- [x] `app/package.json`, `app/.nvmrc` -- pin versions, `engines`, scripts `dev`, `build`, `tokens`, `check` -- AR1, AD-12
- [x] `app/vite.config.ts`, `app/tsconfig.json` -- single config, strict TS -- Vite 8 compatibility
- [x] `app/index.html`, `app/src/styles/stage.css` -- viewport `user-scalable=no, viewport-fit=cover`; `touch-action:none`, `user-select:none`, `-webkit-touch-callout:none`, `overscroll-behavior:none`; images `draggable=false`; portrait media query rotates stage 90° -- NFR6
- [x] `app/src/main.ts`, `app/src/scenes/Boot.ts` -- 1024×768, `Scale.ENVELOP` + `CENTER_BOTH`, `input.activePointers` set, background from tokens -- AD-7
- [x] `app/tools/tokens/*` -- parse DESIGN.md YAML → `src/core/tokens.generated.ts` (typed), `--check` mode for diff -- AD-8
- [x] `app/src/core/tokens.ts`, `app/src/core/timing.ts` -- `Tokens` facade incl. `safeRect` and `Timing` -- AD-7, AD-8
- [x] `app/src/core/bus.ts` (+ test) -- typed `EventMap` (`round:complete`, `round:abandon`, `reward:earned`, `reward:granted`, `hint:level`, `hud:home`, `overlay:close`), `bus.scoped(scene)` -- AD-11
- [x] `app/src/content/types.ts`, `app/src/content/validate.ts` (stub) -- `GameId` union; validator stub wired into check -- AD-1, AD-6
- [x] `app/eslint.config.js` -- layering, hex/`rgba(`/magic-number bans in scenes/games -- AD-8
- [x] `app/src/core/*.test.ts` -- Vitest for bus scoping, tokens shape, safeRect bounds -- I/O matrix
- [x] `app/README.md` -- PC dev run, DevTools iPad emulation, "every story passes `npm run check`" -- AR47

**Acceptance Criteria:**
- Given Node 24, when `npm install && npm run check` runs in `app/`, then tsc, ESLint, Vitest, tokens diff and content-validator stub all pass and exit 0.
- Given `npm run dev`, when opened at localhost in DevTools iPad 1024×768 touch and then 1180×820 / 1366×1024, then the canvas fills the screen with no black bars and `Tokens.safeRect` stays fully visible.
- Given pinch, double-tap, long-press, pull-down or text-select attempts, then nothing zooms, reloads, shows a context menu or selects.
- Given `npm run dev`/`build`, then no request leaves localhost (no `log.js`).

## Implementation Notes

- **Tools run without a build step.** `tools/**/*.ts` run directly through Node 24 type stripping (`node tools/tokens/generate.ts`). tsconfig sets `erasableSyntaxOnly` so this keeps working. `yaml` 2.9.1 is the only extra devDependency the generator needs. ESLint is pinned at 10.12.0 with `@eslint/js` 10.0.1, and `@types/node` at 24.19.1.
- **Token generator.** `tools/tokens/parse.ts` resolves `{group.key}` references and turns every compound string into typed fields:
  - Colours become `{css, value, alpha}`.
  - Strokes become `{width, color, style?}`. Pulses, motions and celebrations become `{…, durationMs}`.
  - Shadows become layers. Positions become `{left|right|top}`.
  - Any string format it does not recognise fails the generator. The only exceptions are the free-text keys `fontFamily`, `placement` and `shape`.
  - `--check` prints "… run npm run tokens" and exits 1 when the committed file is stale.
- **`Tokens` facade.** `Tokens` = generated tokens plus `design` (1024×768), `supportedAspect` {4/3 … 1.46}, `safeRect` and `Timing`. `safeRect` = {x:0, y:34, w:1024, h:700}, computed in `core/safe-rect.ts` and unit-tested.
- **Patch to Phaser's scale manager (`core/stage.ts`).** Phaser's ScaleManager measures the parent (`getParentBounds`) and the canvas (`updateCenter`) with `getBoundingClientRect()`. Under the portrait CSS rotation that returns the rotated box, which caused letterboxing and wrong centring. Both methods are patched on the prototype to use layout sizes (`clientWidth` / `offsetWidth`). I verified this with headless Chrome over CDP: the canvas fully covers 1024×768, 1180×820, 1366×1024, 768×1024 and 820×1180. Pointer mapping under rotation (`canvasBounds`) is still Phaser's default and is left to `core/input/space.ts` in Story 1.6.
- **Page guards in JS.** `installPageGuards()` backs the CSS guards with event guards: `preventDefault` on gesture*, dblclick, contextmenu, selectstart, dragstart and touchmove. iOS ignores `user-scalable=no`, so the CSS alone is not enough.
- **Lint additions beyond AD-8.**
  - `@typescript-eslint/no-magic-numbers` treats `const X = 42` and class fields as named constants and allows them. An extra `no-restricted-syntax` selector bans those too, using the same allow-list.
  - Layer patterns depend on depth inside `content/`. A file two or more levels below `content/` that imports `../games` is treated as importing `src/games` (type imports are still allowed).
- **Bus.** `bus.ts` has no runtime Phaser import, so it is testable in Node. `SceneLike` is the slice of `scene.events` it needs. The SHUTDOWN/DESTROY event names are the Phaser string constants `'shutdown'` and `'destroy'`. `RoundOutcome`, `Snapshot` and `HintLevel` live in `content/types.ts`.
- **Matrix test audit (step 3).** The layer, literal and stale-token rows were only verified by hand, so automated tests were added and run in `npm run check`, giving 35 tests in total:
  - `tools/lint/rules.test.ts` uses the ESLint API with the real config.
  - `tools/tokens/generate.test.ts` checks a stale copy through the new `TOKENS_OUT` env override.
  - `src/core/stage-css.test.ts` asserts the portrait rotation rule and the guard declarations.

  `vite.config.ts` now includes `tools/**/*.test.ts` with `testTimeout` set to 20000.
- **Review patches (pass 1).** Triage rows 1–7 and 9–16 were applied. While patching, the implementer found that the first `eslint.config.js` had been written through a shell heredoc that halved its backslashes, so the named-magic-number bans never fired. The file was rewritten with `String.raw` patterns and is now covered by `tools/lint/rules.test.ts`.
- **Post-patch fix.** `npm run check` failed because `src/content/validate.test.ts` imports `vitest` and the content package ban caught it. The two content layer blocks now `ignores: ['**/*.test.ts']`. Final run: `npm run check` exit 0 with 61 tests in 8 files, and `npm run build` succeeds.
- **`input.activePointers` = 3.** Extra fingers are visible to InputGuard, which can then ignore them (Story 1.6).

## Spec Change Log

## Review Triage Log

Pass 1 (blind-hunter BH, edge-case-hunter EC, verification-gap VG). No intent_gap or bad_spec findings, so there is no loopback.

| # | Src | Finding | Verdict | Evidence | Route |
|---|-----|---------|---------|----------|-------|
| 1 | BH,EC | Bus Set dedupes the same handler, so one owner's off removes the other's subscription | medium | `bus.ts` `on()` adds `handler` to a `Set`; a second `on` with the same fn is a no-op | patch |
| 2 | EC | emit snapshot still calls a handler unsubscribed mid-emit | medium | `for (const fn of [...set])` has no `set.has` check | patch |
| 3 | BH,EC | ScopedBus.on after cleanup leaks a global listener; `on` returns no unsubscribe | low | after `cleanup` runs, `on` still pushes `this.on(...)` and nothing removes it | patch |
| 4 | BH | restart test reuses one handler, so it passes even if cleanup never runs | low | the Set dedupe masks duplicates | patch |
| 5 | VG,BH | parseDesign fail-closed branches untested | medium | no test imports `parse.ts`; real DESIGN.md never hits the throw branches | patch |
| 6 | VG | validateContent never checked against bad input | low | no test imports `validate.ts` | patch |
| 7 | VG,BH | installPageGuards untested | medium | no test imports `stage.ts`; dropping `touchmove` or setting `passive:true` passes every test | patch |
| 8 | VG,BH | ScaleManager prototype patch untested | medium | needs a DOM; the node test env lacks layout sizes | defer |
| 9 | VG,BH | lint rule branches unexercised | medium | `rules.test.ts` has no case for games→scenes, registry, nested content, package value imports, template or class-field literals | patch |
| 10 | BH,EC | nested game file cross-game import not caught | medium | `^\.\./(ids)` matches only one level up; `../../pizza/x` from `games/ice-cream/sub/` matches no pattern | patch |
| 11 | EC | `./../scenes` prefix bypasses layer regexes | low | regexes anchor on `^(\.\./)+`; a direct regex correction fixes it | patch |
| 12 | BH,EC | GAME_IDS duplicated in eslint.config.js and content/types.ts | low | a new game added only to types silently weakens the cross-game rule | patch |
| 13 | EC | unanchored hex in a string (`'color:#FF0000'`) and `hsl()` bypass the colour ban | low | selectors use `^#…$` and `^rgba?\(` only | patch |
| 14 | BH | scenes/games can import `core/tokens.generated` / `core/timing` directly | low | no ban on these specifiers; README says values only via `Tokens.*` | patch |
| 15 | BH,EC | portrait taps not mapped (CSS rotation, pointer still uses the rotated rect) | low | the intent excludes InputGuard and `space.ts` (Story 1.6); only the README wording is wrong | patch (README note) |
| 16 | BH | README misdescribes the check (tools tests) and omits the DESIGN.md dependency | low | `vite.config.ts` includes `tools/**/*.test.ts`; `generate.ts` reads `../_bmad-output/...` | patch |
| 17 | EC | `app/` checked out without `_bmad-output` fails tokens:check | false | by design: generate.ts fails loudly with "DESIGN.md not found"; the Code Map names this dependency | reject |
| 18 | BH | timing.ts can drift from EXPERIENCE.md | medium | hand-copied values; the test only checks positivity | defer |
| 19 | BH,EC | safeRect covers aspect ≤ 1.46 only (iPad mini 1.52, Safari toolbars) | maybe-false | depends on the actual target device, which is unknown; settle by checking the child's iPad model | defer (unverified medium) |
| 20 | EC | ESLint ignoreEnums allows enum magic numbers | false | the epics AC explicitly allow enums ("ngoài [-1,0,1,2,0.5], enum, type index") | reject |
| 21 | EC | safe-rect bad input (NaN, aspect ≤ 0) | false | inputs are compile-time constants in `tokens.ts`; unreachable | reject |
| 22 | BH,EC | images added later stay DOM-draggable | false | CSS `img {-webkit-user-drag:none; pointer-events:none}` covers all images regardless of timing | reject |
| 23 | BH | blocking dblclick does not stop iOS double-tap zoom | false | double-tap zoom is stopped by `touch-action:none` in stage.css; the dblclick block is an extra layer | reject |
| 24 | BH | document touchmove preventDefault blocks future scroll UI | false | no scrollable UI exists or is planned (UX: no menus or settings) | reject |
| 25 | EC | camelCase key collisions in parse.ts | low | unlikely in DESIGN.md; the fix adds guards | reject |
| 26 | EC | rgba channel > 255 / alpha > 1 not validated | low | unlikely authoring error; the fix adds guards | reject |
| 27 | EC | percentage alpha > 100% emitted | low | same as #26 | reject |
| 28 | EC | free-text value with a newline breaks the generated file | false | the failure is loud (tsc fails in check), which is correct behaviour | reject |
| 29 | EC | BOM or front matter at EOF without a newline | low | DESIGN.md has neither; the fix adds parsing branches | reject |
| 30 | BH | `@media (orientation: portrait)` also matches Split View / Stage Manager | low | toddler PWA runs fullscreen; the fix needs extra viewport logic | reject |
| 31 | BH | index.html lacks manifest, apple meta and theme-color | false | PWA install meta is Story 1.11 scope by intent ("Never: … PWA") | reject |
| 32 | BH | favicon.png referenced but missing | false | `app/public/favicon.png` exists on disk; it was excluded from the staged diff only | reject |
| 33 | BH | white flash before JS sets the body background | low | brief pre-load flash; Story 1.2 owns the loading screen; the fix would add a colour literal outside Tokens | reject |
| 34 | BH | no lockfile committed | false | `app/package-lock.json` exists; it was excluded from the staged diff only | reject |
| 35 | BH | TypeScript uses `~5.9.3` while others are exact | false | the spec pins `~5.9.3` explicitly | reject |
| 36 | BH | .gitignore lacks coverage/.env; LICENSE missing; vite-env.d.ts duplicate; mixed indentation | false/low | LICENSE exists; the rest is cosmetic with no named harm | reject |

## Design Notes

`Tokens.safeRect` = the design-space rect visible on all supported iPad ratios under ENVELOP: 4:3 shows all 1024×768; wider ratios (≈1.44–1.46, e.g. 1180×820) crop top/bottom ≈ 5–7%. Compute it from the widest supported ratio (≈1.46 → visible height ≈ 1024/1.46 ≈ 701, so safeRect ≈ `{x:0, y:34, w:1024, h:700}`) and unit-test it.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0
- `cd app && npm run build` -- expected: `dist/` produced, no network calls
- Temporarily add `import '../scenes/Boot'` in a `core/` file → `npm run check` -- expected: ESLint failure (revert after)

**Manual checks:**
- `npm run dev`, Chrome DevTools device toolbar iPad landscape + touch: full-bleed canvas; portrait toggle shows rotated stage.
