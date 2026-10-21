---
title: 'Story 1.2 — Màn Mở đầu: nút Chơi + mở khoá âm thanh'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'NO_VCS'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-1-khoi-tao-app-tu-starter-phaser.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The readiness gate can wait forever on navigator.serviceWorker.ready when a registration exists but its worker never activates.
    evidence: |-
      Unverified (maybe-false): this story registers no service worker, so getRegistration() resolves undefined and the SW step is skipped. If true it is high: the state stays 'loading', retryTick/online do nothing, and Start never shows. Settle it in Story 1.11 by testing a registration stuck in 'installing' (for example, a precache fetch failing offline) and, if it hangs, race sw.ready against a timeout that rejects into the retry path.
    location: >-
      app/src/core/boot-load.ts waitForReady
    severity: high (unverified)
  - summary: >-
      navigator.serviceWorker.getRegistration() rejecting would make every gate attempt fail, so the app would never leave Boot.
    evidence: |-
      Unverified (maybe-false): it is unknown whether getRegistration() rejects (for example, SecurityError in a private or locked-down browser profile) on the target iPad Safari/PWA. If it does, each retry rejects again. Settle it on a device or in Story 1.11. A `.catch(() => undefined)` treating the rejection as "no registration" would fix it.
    location: >-
      app/src/core/boot-load.ts waitForReady
    severity: high (unverified)
  - summary: >-
      AudioContext.resume() that never settles (iOS 'interrupted', such as a phone call) would hang onVisible and the overlay tap.
    evidence: |-
      Unverified (maybe-false): resumeContext() awaits ctx.resume() with no bound. If the promise stays pending, audio:suspended is never emitted and the overlay's tap() stays busy. Settle it on an iPad by taking a call or a Siri interruption while the app is in the background, then returning.
    location: >-
      app/src/core/audio-director.ts resumeContext / onVisible
    severity: medium (unverified)
  - summary: >-
      Phaser's own onGameVisible (context.suspend() then resume() after 100 ms) may race AudioDirector's visibility handling and hide a stuck context.
    evidence: |-
      Unverified (maybe-false): WebAudioSoundManager.onGameVisible (node_modules/phaser/src/sound/webaudio/WebAudioSoundManager.js) suspends and resumes the context 100 ms after VISIBLE, which is after AudioDirector.onVisible has checked context.state. If Phaser's out-of-gesture resume fails on iOS, the context ends up suspended with no audio:suspended. The fakes do not model this. Settle it on a real iPad: background the app on Map, return, and check context.state after about 200 ms. If it is stuck, re-check the state after Phaser's cycle, or own the visibility resume in a single place.
    location: >-
      app/src/core/audio-director.ts onVisible; app/src/main.ts game config
    severity: medium (unverified)
  - summary: >-
      The TOKENS_FACADE_ONLY import ban misses `core/timing.js` / `core/tokens.generated.js` specifiers.
    evidence: |-
      This existed before Story 1.2 (the ban was a Story 1.1 patch). The regex `(\.ts)?$` lets a `.js`-suffixed import of core/timing past the ban in scenes and games, and bundler resolution accepts it. The fix is to widen it to `(\.[cm]?[jt]s)?$` and add a rule test.
    location: >-
      app/eslint.config.js TOKENS_FACADE_ONLY
    severity: low
  - summary: >-
      Boot's scene wiring of the load state machine (retry on online/timer, kart slow-down, ready → launch overlay then Start) has no automated test.
    evidence: |-
      This was filed by the verification-gap layer with disposition defer. nextLoadState, kartTimeScale and waitForReady are covered in boot-load.test.ts, but Boot.dispatch/attempt run only in Phaser. Deleting `this.attempt()` or `scene.launch('AudioUnlockOverlay')` keeps `npm run check` green. Extract the dispatch loop into core when Story 1.11 adds precache to the same gate.
    location: >-
      app/src/scenes/Boot.ts dispatch / attempt
    severity: medium
  - summary: >-
      The file-existence wiring of the validate-content tool (fileExists resolved against public/) is not tested.
    evidence: |-
      This was filed by the verification-gap layer with disposition defer. The rule is tested with an injected fileExists, but tools/lint/validate-content.ts itself is not, so dropping its fileExists would silently skip the missing-file check. Add a run(publicDir) test when Story 1.3 adds voice files.
    location: >-
      app/tools/lint/validate-content.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** The app currently opens on a blank placeholder `Boot` scene. There is no loading feedback, no way for a 3-year-old to start, and no audio. iPad Safari also keeps WebAudio locked until a user gesture, and it can suspend audio again when the app comes back from the background.

**Approach:**
- `Boot` shows a text-free `loading-strip`, loads the `shared`/`map` assets (only audio exists for now) and waits for the readiness gate (SW and the self-hosted Baloo 2 font).
- `Start` then shows a bobbing `button-play`. The first tap gives a "pụp", unlocks audio through `AudioDirector` (which wraps Phaser's unlock), starts looping music, calls `ProgressStore.init()` once and goes to a placeholder `Map`.
- `AudioDirector` stops audio when the app is hidden and re-resumes it when it returns. If the AudioContext is still suspended, it asks `AudioUnlockOverlay` to pause the current scene behind a dimmed `button-play`.

## Boundaries & Constraints

**Always:**
- **All sound goes through `core/audio-director.ts`,** by catalog id only. Ids live in `content/audio-catalog.ts`: `sfx.shell.pop` and `music.island`, with files at `public/assets/audio/{sfx|music}/<id>.m4a`. ESLint bans `this.sound` and audio paths (`.m4a`, `assets/audio`) in scenes and games.
- **`AudioDirector` uses Phaser's mechanism:**
  - It reads `sound.locked` and listens for `'unlocked'` (`Sound.Events.UNLOCKED`).
  - When `visibilitychange` reports the page hidden, it pauses music and calls the voice-stop hook (a no-op until Story 1.3).
  - When the page is visible again, it calls `context.resume()`. If that succeeds, music resumes. If the context is still suspended, it emits `audio:suspended` on the Bus, but only after the session has been unlocked once.
  - It depends on a small `SoundLike`/`DocLike` interface slice and does not import Phaser at runtime, so it is unit-testable in node. Event names are string constants, as in `bus.ts`.
- **An SFX requested while audio is locked is deferred until `'unlocked'`.** It plays only if it is still at most `Tokens.Timing.feedbackMaxMs` old; otherwise it is dropped. The press visual (0.9× then spring back) starts on pointerdown.
- **`ProgressStore.init()`** in `core/progress-store.ts` is idempotent: a second call returns the first call's promise.
  - It owns key `bhc.progress`, shaped `{schemaVersion:1, seq:0, difficulty:{}, decorations:[]}`.
  - It is the only code that calls `navigator.storage.persist()`.
  - Rejection, a `false` result, a missing API, corrupt JSON or a `localStorage` throw each produce one `console.warn` and an in-memory fallback. Startup never fails because of them.
- **Readiness gate:**
  - If `import.meta.env.DEV` or there is no SW registration, the SW step is skipped. Otherwise the gate awaits `navigator.serviceWorker.ready`. Story 1.11 adds precache completion.
  - It then awaits `document.fonts.load("600 18px 'Baloo 2'")` after registering a `FontFace('Baloo 2', 'url(assets/fonts/Baloo2-wght.woff2)')`. The URL is relative, which works with `base: './'`.
- **Load failure:** on a loader `loaderror` or a gate rejection, the kart slows and waits. The load retries on `window` `online` or every `Tokens.Timing.loadRetryMs`. The only error output is `console.warn`; nothing is shown on screen.
- **Values:** values come only through the `Tokens` facade. New durations go in `core/timing.ts`, each with a source comment. The overlay dim reuses `Tokens.components.playAgainOverlay.backdrop` (the light dim). DESIGN.md is not edited.

**Never:**
- No voice lines or TTS (Story 1.3).
- No real Map, stations or HUD (Stories 1.5 and 1.6).
- No InputGuard or `toDesign` (Story 1.6). For now, buttons use Phaser `setInteractive`, and Story 1.6 migrates them to `TapTarget`.
- No PWA or SW registration (Story 1.11).
- No text on Start or the overlay.
- No runtime network calls: the font is vendored, with no CDN `<link>`.
- No `setTimeout` in scenes: use the scene `time`.
- No git.

**Decisions (auto-run defaults):**
- **Placeholder audio** is synthesized by the committed `tools/audio/make-placeholders.ts`. It uses `FFMPEG_BIN`, falls back to PATH, and fails clearly if ffmpeg is missing. Output is mono AAC 44.1 kHz at 64k in `.m4a`, so it can be regenerated or replaced later.
  - `sfx.shell.pop`: 140 ms of sine 700→1100 Hz, with a 50 ms fade-in (the SFX rule) and an exponential tail. Nothing below 150 Hz. Peak about −20 dBFS, so it stays quieter than the −16 LUFS voice.
  - `music.island`: a 12 s seamless pad and arpeggio (C–E–G, integer-Hz sines, soft tremolo, loopable) normalised with `loudnorm=I=-30:TP=-3`.
- **Baloo 2 font:** fetched once during implementation as `Baloo2[wght].ttf` from github.com/google/fonts (`ofl/baloo2`, plus `OFL.txt`). It is subset to Latin plus Vietnamese and converted to woff2 with `uvx --from "fonttools[woff]" pyftsubset`. The result is vendored as `public/assets/fonts/Baloo2-wght.woff2` with `OFL.txt`, and the steps are recorded in the README.
- **The "Start screen" is two scenes:** `Boot` (loading-strip) and `Start` (button-play), on the same sky background.
- **The loading-strip and button-round are drawn with Phaser Graphics** from tokens: a road `surface` strip and a 96 px kart made of a body and wheels. The atlas art comes in Story 1.4.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First tap, locked | `sound.locked=true`, tap button | press tween; `sfx.shell.pop` plays on `'unlocked'`; music loop starts once; `init()` once; `Map` starts | — |
| Late unlock | `'unlocked'` arrives > `feedbackMaxMs` after the sfx request | pop dropped, music still starts | none |
| Double tap | 2nd tap during transition | ignored; `init()`, music and `scene.start` happen once | — |
| Hidden | `visibilitychange` → hidden | music paused, voice hook called | — |
| Return OK | visible, `resume()` → `running` | music resumes, no `audio:suspended` | — |
| Return stuck | visible, context stays `suspended` | `audio:suspended` emitted once | — |
| Hidden before first tap | on Start, not yet unlocked | no `audio:suspended` | — |
| Unknown id | `audio.sfx('sfx.nope')` | nothing plays | one `console.warn` |
| persist denied | `persist()` rejects/false/absent | app continues, store usable | `console.warn` |
| Corrupt store | `bhc.progress` = `"{bad"` / storage throws | default state, in-memory fallback | `console.warn` |
| Load fails | file error / font reject | state `waiting`, kart slow, retry on `online` or timer, then `ready` | `console.warn` only |
| Gate dev | DEV or no SW registration | SW step skipped, font awaited | — |
| Overlay | `audio:suspended` while `Map` runs | `Map` `scene.pause()`; overlay dim plus button; a backdrop zone swallows other taps; button tap → unlock → `resume()` same scene; no `Start` | — |

</intent-contract>

## Code Map

- `app/src/main.ts` -- Phaser config; `scene: [Boot]`. Add `Start`, `Map` and `AudioUnlockOverlay`, and call `audio.attach(game.sound, document)` after `new Game` (main.ts is not under the `this.sound` ban).
- `app/src/scenes/Boot.ts` -- placeholder; becomes the loading-strip, loader and gate, then starts `Start`.
- `app/src/core/bus.ts` -- typed `EventMap`. Add `'audio:suspended': undefined` and `'audio:resumed': undefined`. Scenes subscribe through `bus.scoped(this)`.
- `app/src/core/tokens.ts` / `timing.ts` -- the `Tokens` facade. `Tokens.components.buttonRound` (88, highlight, a 3-layer shadow whose first layer is the solid y=6 base), `buttonPlay` (200, `#FFD23F`), `loadingStrip` (`surface`, kart 96), `playAgainOverlay.backdrop` and `colors.sky`. DESIGN.md has no press-scale or bob token, so add them in core.
- `app/src/content/types.ts`, `validate.ts`, `app/tools/lint/validate-content.ts` -- validator stub; extend it with the catalog checks.
- `app/eslint.config.js` + `tools/lint/rules.test.ts` -- per lesson 1.1, write regexes with `String.raw` and never through a shell heredoc (it halves backslashes). esquery drops `\` escapes. Content blocks ignore `*.test.ts`.
- `app/vite.config.ts` -- Vitest node env includes `src/core|content/**` and `tools/**` tests, so tests must not import Phaser at runtime.
- `app/node_modules/phaser/src/sound/webaudio/WebAudioSoundManager.js` -- `locked`, `unlock()` (body touchstart/touchend/mouse/keydown), and an `onBlur`/`onFocus` suspend/resume of its own.
- `app/public/` -- only `favicon.png` and an empty `assets/`.

## Tasks & Acceptance

**Execution:**
- `app/tools/audio/make-placeholders.ts` (+ `make-placeholders.test.ts`) -- add a pure `buildArgs(id)` and `resolveFfmpeg(env)`. The script writes both `.m4a` files; run it once and commit the outputs. Add the `npm run audio:placeholders` script. Tests cover the args (mono, 44.1 kHz, aac, fade ≥ 50 ms for SFX, `loudnorm I=-30` for music) and the error when ffmpeg is missing.
- `app/public/assets/fonts/Baloo2-wght.woff2`, `OFL.txt` -- vendor them per the Decision.
- `app/src/content/audio-catalog.ts` -- `AUDIO_CATALOG: Record<AudioId, {path, kind:'sfx'|'music', loop?, volume?}>` -- AD-6.
- `app/src/content/validate.ts` (+ test), `app/tools/lint/validate-content.ts` -- id grammar (`sfx.<scope>.<name>` / `music.<name>`), path = `assets/audio/<kind>/<id>.m4a`, and (tool only) the file exists under `public/`.
- `app/src/core/bus.ts` (+ test) -- add the two audio events.
- `app/src/core/timing.ts` -- add `loadingKartLapMs`, `loadingKartWaitTimeScale`, `loadRetryMs`, `playBobMs` and `buttonPressMs`, with a source comment for each.
- `app/src/core/audio-director.ts` (+ `audio-director.test.ts`) -- `attach`, `sfx`, `music`, `stopMusic`, `unlock()` (resolves on `'unlocked'` or immediately if not locked), `isUnlocked` and the visibility handling. It exports the singleton `audio`. The tests cover the audio rows of the matrix with fakes.
- `app/src/core/progress-store.ts` (+ test) -- `init(deps?)` with injectable `storage`/`persist`. The tests cover the init, persist and corrupt-store rows.
- `app/src/core/boot-load.ts` (+ test) -- a pure `nextLoadState(state, event)` (`loading|waiting|ready` × `error|online|retryTick|complete`) plus the kart time-scale for each state, and `waitForReady({isDev, sw, fonts, fontFace})` with fakes.
- `app/src/core/ui/round-button.ts`, `app/src/core/ui/loading-strip.ts` -- Phaser Graphics builders:
  - `button-round` visual: circle, top-left white highlight, solid 6 px base shadow, ▶ icon in `icon` ink. Press 0.9× and spring back; slow bob.
  - Kart loop on the road strip, whose speed is set through `setTimeScale`.
- `app/src/scenes/Boot.ts`, `Start.ts`, `Map.ts`, `AudioUnlockOverlay.ts` -- the shell flow from the matrix.
  - `Map` is a sky placeholder.
  - The overlay is launched once by `Boot` and then put to sleep. It subscribes to `audio:suspended`, pauses the active scenes other than itself, wakes, and calls `bringToTop`. On a tap it calls `await audio.unlock()`, resumes the scenes it paused, sleeps again and emits `audio:resumed`.
- `app/eslint.config.js` + `tools/lint/rules.test.ts` -- in scenes/games, ban `this.sound` and string literals matching `.m4a` or `assets/audio`. Add positive and negative rule tests.
- `app/package.json`, `app/README.md` -- the new script, the font and audio provenance, and the regenerate steps.

**Acceptance Criteria:**
- Given a cold `npm run dev` with throttled or offline assets, when the page opens, then only the sky, the road strip and a looping kart are visible: no text, no bar, no button.
- Given the loads and the font gate complete, when `Boot` finishes, then `Start` shows the ~200 px yellow ▶ `button-play`, centred inside `Tokens.safeRect` and slowly bobbing.
- Given `Start`, when the button is tapped, then the pop is heard within 100 ms after the tap, music loops quietly, and the placeholder `Map` appears.
- Given `Map` with DevTools, when `AudioContext.suspend()` is forced and the tab is hidden and shown again, then the dimmed overlay button appears and `Map` is paused. Tapping elsewhere does nothing, and tapping the button resumes `Map` and the music.
- Given the built app, when it runs, then no request leaves the origin.

## Spec Change Log

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 55 findings — high 0, medium 14, low 20, false 13, maybe-false 8
- grouped entries: A = Start waits on an unlock that can stall (B1, E2, VG-O1, IA-D7). B = the overlay closes while audio is still suspended (B2, E4, E18, VG-O2, IA-D8). C = sw.ready can hang (B3, E7). D = Phaser's onGameVisible races the visibility handling (B13, VG-O3, IA-D9). S = Start/overlay flow logic untested (B11, VG-G1, VG-G2, IA-D1). L = corrupt store stays memory-only (B4, E11). E = ESLint audio-ban bypasses (B6, E12).
- findings:
  - blind-hunter
    - `[medium]` `[patch]` (A) Start can hang forever with the button disabled when Phaser's `'unlocked'` never fires — confirmed: Phaser's unlockHandler removes its listeners on a rejected resume() without setting `unlocked`. Patched: `createStartTap` (core/shell-flow.ts) leaves without waiting for `unlock()`. Test: "leaves even when the unlock never resolves".
    - `[medium]` `[patch]` (B) The overlay dismisses itself even when audio did not come back — patched: `unlock()` now resolves `boolean` (context running) and leaves `suspendedEmitted` set while still suspended. `SuspendOverlayController.tap()` resumes the scenes and hides only on `true`; otherwise it stays up for another tap. Tests in shell-flow.test.ts and audio-director.test.ts.
    - `[maybe-false]` `[defer]` (C) The readiness gate can block forever on `serviceWorker.ready` — no SW is registered until Story 1.11, so this is unreachable now. It would be high if a registration got stuck installing. Deferred with the settle step.
    - `[low]` `[reject]` (L) A corrupt or newer-schema store stops persistence for good — real, but the matrix row mandates "default state, in-memory fallback". It needs a corrupt blob, which only this app writes, and the fix adds backup/overwrite logic.
    - `[low]` `[reject]` `update()` before `init()` silently loses data — `update()` has no caller in this story (Epic 2), and the fix adds a guard or queue.
    - `[low]` `[reject]` (E) The direct-audio ESLint ban is easy to bypass (`scene.sound`, destructuring, `this.sys.sound`) — the spec scopes the ban to `this.sound`. Bypassing it takes deliberate code, and the fix adds selectors plus tests.
    - `[low]` `[reject]` `core/ui/` holds design constants outside DESIGN.md — the spec says "DESIGN.md has no press-scale or bob token, so add them in core". The other constants are shape proportions of placeholder Graphics that Story 1.4 replaces with atlas art.
    - `[low]` `[reject]` Rerunning `audio:placeholders` overwrites real audio — every catalog file is a placeholder today. The case needs real audio under an existing placeholder id plus a rerun, and the fix adds a flag or list.
    - `[maybe-false]` `[reject]` The "seamless 12 s loop" may click (AAC priming, dynamic loudnorm) — not verifiable without listening on Safari. If true it is only low (placeholder music at −30 LUFS). Settle it by listening to the loop seam on an iPad.
    - `[false]` `[reject]` The diff deletes `package-lock.json` and `public/favicon.png` — both exist on disk (`ls`). The reversed hunks are an artifact of how snap.sh builds the diff, as in Story 1.1.
    - `[medium]` `[patch]` (S) No tests for the Start/Overlay/Boot scene flows — patched for Start and Overlay: the tap and pause bookkeeping moved to `core/shell-flow.ts`, with 8 node tests. Boot wiring is deferred (VG-G3).
    - `[false]` `[reject]` `audio.attach()` depends on `game.sound` existing right after `new Game()` — the module script runs at readyState `interactive`, and Phaser's DOMContentLoaded helper then boots synchronously. The double cast was replaced with `satisfies SoundLike` (see VG-G4).
    - `[maybe-false]` `[defer]` (D) Phaser's built-in blur/focus audio handling is not addressed — this needs a real device. Deferred with the settle step.
    - `[false]` `[reject]` SFX can play late after backgrounding — the only `sfx()` call site is Start's first tap, which runs while locked (deferred path). While suspended, the overlay pauses the scenes and its backdrop swallows taps.
    - `[low]` `[patch]` README contradictions — patched: "Later stories add more content checks and the precache check", and the Start-flow paragraph now describes the stay-up overlay and `core/shell-flow.ts`.
    - `[low]` `[reject]` The audio-catalog validator misses volume range, loop-only-on-music, shared files and stray files — there are 2 catalog entries today, and the fix adds four new rules.
  - edge-case-hunter
    - `[false]` `[reject]` `scene.sleep()` in `create()` is overridden by RUNNING — `ScenePlugin.sleep` only `queueOp`s. `processQueue` runs it after `SceneManager.create` sets RUNNING (the queue loop re-reads its length), so the overlay ends up SLEEPING.
    - `[medium]` `[patch]` (A) `unlock()` waits forever when `'unlocked'` never fires — see A.
    - `[maybe-false]` `[defer]` `ctx.resume()` that never settles (iOS 'interrupted') hangs onVisible and the overlay — depends on device behaviour. It would be medium. Deferred.
    - `[medium]` `[patch]` (B) The overlay closes while the context is still suspended — see B.
    - `[low]` `[reject]` Page hidden again while onVisible awaits resume → music resumes in the background — needs a hide/show/hide within one resume() promise, and the fix adds a guard.
    - `[low]` `[patch]` `startMusic` throwing keeps `current` with no instance, so `music(sameId)` is a no-op — patched: the catch clears `this.current`. Test: "a music start that throws is forgotten".
    - `[maybe-false]` `[defer]` (C) The SW never activates → stuck in 'loading' — see C.
    - `[maybe-false]` `[defer]` `getRegistration()` rejects → the gate fails every retry — unknown whether it rejects on iPad Safari/PWA. It would be high. Deferred with the settle step.
    - `[low]` `[reject]` `update()` before `init()` overwritten by `load()` — same as the blind-hunter row: no caller, and the fix adds a guard.
    - `[low]` `[reject]` Stored JSON with malformed element types is accepted — only this app writes the key, and the fix adds deep validation.
    - `[low]` `[reject]` (L) The corrupt value is never repaired — see L.
    - `[low]` `[reject]` (E) A helper using `scene.sound` bypasses the lint ban — see E.
    - `[low]` `[defer]` `core/timing.js` import bypasses TOKENS_FACADE_ONLY — this existed before the story (Story 1.1 added the ban). Deferred.
    - `[false]` `[reject]` The `make-placeholders` argv path comparison can skip `main()` on Windows — `npm run audio:placeholders` ran during this pass and wrote both files.
    - `[false]` `[reject]` `package-lock.json` deleted — it exists (82,701 B). This is a diff artifact.
    - `[false]` `[reject]` `favicon.png` deleted — it exists. This is a diff artifact.
    - `[low]` `[reject]` The DevTools AC can't reproduce the overlay (Chrome resumes outside a gesture with sticky activation) — this affects only how the manual check is run, not users on iPad. The fix would edit this spec's manual check.
    - `[medium]` `[patch]` (B) The overlay tap resumes Map silently — see B.
  - verification-gap
    - `[medium]` `[patch]` (S) The Start tap sequence has no test — patched: `createStartTap` in core plus tests for order, init once, double tap and leaving without unlock.
    - `[medium]` `[patch]` (S) The AudioUnlockOverlay pause/resume bookkeeping has no test — patched: `SuspendOverlayController` plus tests for cover, no-op re-cover, resume of exactly the paused keys, double tap, stay-up on suspended and re-cover.
    - `[medium]` `[defer]` Boot wiring of the load state machine is not exercised — the filed disposition is defer. The pure parts are pinned, and extraction fits Story 1.11's gate work.
    - `[low]` `[patch]` The Phaser sound-manager contract is asserted only against fakes — patched: a test asserts `SOUND_UNLOCKED` equals phaser `src/sound/events/UNLOCKED_EVENT.js`, and main.ts uses `game.sound satisfies SoundLike` (the tsc check now runs).
    - `[low]` `[patch]` ProgressStore production defaults are never exercised — patched: a `vi.stubGlobal` test calls `init()` with no deps and asserts that persist runs once and the default state is written.
    - `[low]` `[defer]` The content-validator tool's file-existence wiring is not verified — the filed disposition is defer (Story 1.3 voice files).
    - `[medium]` `[patch]` (A) Other: Start hangs if Phaser's unlock rejects — see A.
    - `[medium]` `[patch]` (B) Other: `unlock()` reports success while still suspended — see B.
    - `[maybe-false]` `[defer]` (D) Other: Phaser's onGameVisible interaction is not modelled — see D.
    - `[false]` `[reject]` Other: lockfile and favicon listed as deleted — both exist. This is a diff artifact.
  - intent-alignment
    - `[medium]` `[patch]` (S) D1: verification lives at a different layer from the intent — patched for the flow logic (Start, Overlay). The visual ACs (no text, size, bob, dim) remain the spec's manual checks.
    - `[false]` `[reject]` D2: `shared` + `map` vs two audio files — the intent-contract Approach says "loads the shared/map assets (only audio exists for now)".
    - `[false]` `[reject]` D3: the kart slows rather than stops, and yoyos — the contract says "the kart slows and waits" (state `waiting`) and "kart loop on the road strip". 0.25× while waiting satisfies it.
    - `[false]` `[reject]` D4: no `offline` listener — the contract names the triggers as "loader loaderror or gate rejection", and an offline fetch fails quickly into `loaderror`.
    - `[false]` `[reject]` D5: the gate omits precache — the contract says "Story 1.11 adds precache completion".
    - `[low]` `[reject]` D6: pop on pointerup, not pointerdown — on the locked first tap, the pop cannot sound before Phaser's touchend unlock anyway. Moving it gains nothing and risks iOS gesture rules.
    - `[medium]` `[patch]` (A) D7: the transition to Map depends on unlock resolving — see A.
    - `[medium]` `[patch]` (B) D8: the overlay closes even if audio did not come back — see B.
    - `[maybe-false]` `[defer]` (D) D9: backgrounding is tested against fakes, not Phaser's blur handling — see D.
    - `[low]` `[reject]` D10: "exactly once" and "only persist() caller" hold by convention — exactly once is now tested (createStartTap double-tap test). A lint rule for `persist()` would add a rule for a call nobody else makes.
    - `[false]` `[reject]` D11: scope beyond the intent — the ESLint bans, the placeholder generator and the catalog validation are all listed in the spec's Tasks. The re-adds and deletions are diff artifacts.

## Design Notes

**Overlay pause:** `scene.pause()` is the only pause mechanism (AR7). It also stops scene time, so the hint clocks that come later are covered. Scenes paused by the overlay are tracked in a list, so only those scenes are resumed.

**Phaser behaviour:** Phaser's own `pauseOnBlur` suspends and resumes the context. `AudioDirector` checks `context.state` after its own `resume()` attempt, and the result of that check decides whether the overlay is needed.

## Verification

**Commands:**
- `cd app && npm run audio:placeholders` -- expected: two `.m4a` files exist. `ffmpeg -i <file> -af ebur128 -f null -` shows music at about −30 LUFS.
- `cd app && npm run check` -- expected: exit 0, with every matrix row covered by Vitest.
- `cd app && npm run build` -- expected: `dist/assets/audio/**` and `dist/assets/fonts/*.woff2` are present.

**Manual checks:**
- `npm run dev` in DevTools at iPad 1024×768 with touch: run through the flows in the ACs. In the Network tab, set "Offline" during Boot to see the kart slow down, then go back online and it continues to `Start`.

## Auto Run Result

**Summary:** Story 1.2 adds the Start-screen shell:
- `Boot` shows the text-free loading-strip kart, loads the audio, and waits for the readiness gate (SW skipped in dev or with no registration, then the vendored Baloo 2 font). It retries on `online` or on a timer.
- `Start` shows the bobbing yellow ▶. The tap gives the pop, starts the music loop, unlocks audio through `AudioDirector`, calls `ProgressStore.init()` once and goes to the placeholder `Map`.
- `AudioDirector` (the only sound path, by catalog id) handles hide and show. A stuck context brings up `AudioUnlockOverlay`, which pauses the running scenes behind a dimmed ▶.
- Supporting work: placeholder audio synthesized with ffmpeg, the Baloo 2 font vendored, catalog validation, and ESLint audio bans.

The review pass made three main changes. Start no longer waits for the Phaser unlock before leaving. The overlay stays up until audio really runs again. The Start and overlay logic moved into the testable `core/shell-flow.ts`.

**Files changed (story total; review-pass edits marked ★):**
- `app/src/core/audio-director.ts` ★ -- AudioDirector: catalog-id sfx/music, Phaser unlock wrapper, visibility handling, `audio:suspended`. ★ `unlock()` now resolves `boolean`; a failed music start is forgotten.
- `app/src/core/audio-director.test.ts` ★ -- the matrix audio rows. ★ Adds the Phaser `UNLOCKED` constant check, unlock-false-while-suspended, and music retry.
- `app/src/core/shell-flow.ts` ★ (new) -- `createStartTap` (pop, music, unlock, init once, leave) and `SuspendOverlayController` (pause/resume bookkeeping, stays up while suspended).
- `app/src/core/shell-flow.test.ts` ★ (new) -- First tap, Double tap and Overlay matrix rows (8 tests).
- `app/src/core/progress-store.ts` / `.test.ts` ★ -- idempotent `init()`, the only `persist()` caller, in-memory fallbacks. ★ Adds a production-defaults test.
- `app/src/core/boot-load.ts` / `.test.ts` -- load state machine, kart time-scale, readiness gate.
- `app/src/core/bus.ts` / `.test.ts` -- `audio:suspended` and `audio:resumed` events.
- `app/src/core/timing.ts`, `app/src/core/tokens.ts` -- new timings and `Tokens.ui.pressScale`/`playBobPx`.
- `app/src/core/ui/round-button.ts`, `app/src/core/ui/loading-strip.ts` -- Phaser Graphics button-round and loading-strip.
- `app/src/scenes/Boot.ts`, `app/src/scenes/Map.ts` -- loading scene and placeholder Map.
- `app/src/scenes/Start.ts` ★ -- binds `createStartTap` to button-play.
- `app/src/scenes/AudioUnlockOverlay.ts` ★ -- binds `SuspendOverlayController` to the ScenePlugin.
- `app/src/main.ts` ★ -- registers the scenes and attaches AudioDirector. ★ `game.sound satisfies SoundLike` replaces the `as unknown` cast.
- `app/src/content/audio-catalog.ts`, `validate.ts` / `.test.ts`, `app/tools/lint/validate-content.ts` -- audio catalog and its validation.
- `app/tools/audio/make-placeholders.ts` / `.test.ts`, `app/public/assets/audio/**` -- the ffmpeg placeholder generator and its outputs.
- `app/public/assets/fonts/Baloo2-wght.woff2`, `OFL.txt` -- the vendored font.
- `app/eslint.config.js`, `app/tools/lint/rules.test.ts` -- the direct-audio ban and its tests.
- `app/package.json`, `app/README.md` ★ -- the `audio:placeholders` script and provenance. ★ The README now has the stay-up overlay and the content-checks wording.

**Review findings breakdown:** 55 findings (high 0, medium 14, low 20, false 13, maybe-false 8). 17 were patched, 10 deferred and 28 rejected.

Patched entries:
- A (medium): Start no longer waits on the unlock.
- B (medium): the overlay stays up while suspended.
- S (medium): Start and overlay flow logic extracted and tested.
- low: Phaser contract test plus `satisfies`.
- low: ProgressStore defaults test.
- low: music-start retry.
- low: README wording.

Deferred to frontmatter `deferred` (7 items):
- C: `sw.ready` hang (high, unverified).
- `getRegistration` reject (high, unverified).
- `resume()` that never settles (medium, unverified).
- D: Phaser onGameVisible race (medium, unverified).
- `.js` import bypass of the Tokens facade (low, pre-existing).
- Boot wiring tests (medium).
- validate-content tool wiring test (low).

Rejected, with reasons:
- Low:
  - Corrupt store stays memory-only, ×2: the spec mandates the fallback; rare; a large fix.
  - `update()` before `init()`, ×2: no caller yet; the fix is a guard.
  - ESLint `scene.sound` bypasses, ×2: needs deliberate code; scoped by the spec.
  - Design constants in `core/ui`: placeholder proportions, and the spec allows the core tokens.
  - Placeholder rerun overwrites real audio: no real audio yet; the fix adds a flag.
  - Validator rule gaps: two entries; the fix adds four rules.
  - Re-hide during the resume await: a narrow race; the fix is a guard.
  - Element-type validation: only the app writes the key.
  - DevTools AC unreproducible: the fix would edit this spec.
  - D6 pop on pointerup: no gain on a locked first tap.
  - D10 `persist()` lint: a new rule for a call nobody else makes.
- Maybe-false: the AAC loop seam. It would be low even if true (placeholder music).
- False:
  - Lockfile and favicon deletions, ×4: they exist; diff artifact.
  - `attach` timing: synchronous boot at readyState `interactive`.
  - Late SFX after backgrounding: no reachable call site.
  - `sleep()` in `create()`: queued op, ends SLEEPING.
  - `argv` path check: the script ran and wrote both files.
  - D2, D3, D4, D5 and D11: each is explicitly licensed by the intent-contract or the Tasks.

**Follow-up review recommendation:** `true`. This pass patched 3 medium and 4 low entries (0 high). The named unverified risk: two flow changes are now verified only against fakes, never in Phaser on an iPad.
- Start now leaves without waiting for the Phaser unlock.
- The overlay now stays up while `AudioContext` remains suspended.

On a real iPad, check four things:
- The first tap still gives pop and music.
- `Map` starts correctly.
- After backgrounding, the overlay appears and clears in one tap.
- The overlay never traps the child when Phaser's own onGameVisible suspend/resume runs (deferred item D).

**Verification performed:**
- `npm run check`: exit 0. tsc, ESLint, Vitest (13 files, 141 tests), tokens:check and validate:content ("2 audio ids") all passed.
- `npm run audio:placeholders` (FFMPEG_BIN set): wrote both `.m4a` files. `ebur128` reports music integrated loudness of −30.1 LUFS.
- `npm run build`: exit 0. `dist/assets/audio/{sfx,music}/*.m4a`, `dist/assets/fonts/Baloo2-wght.woff2` and `OFL.txt` are present.
- I/O matrix audit: every row is covered by a passing test.
  - core/audio-director.test.ts: First tap, Late unlock, Hidden, Return OK, Return stuck, Hidden before first tap, Unknown id.
  - core/shell-flow.test.ts: Double tap, Overlay pause/resume (the backdrop tap-swallowing is visual and stays a manual check).
  - core/progress-store.test.ts: persist denied, Corrupt store.
  - core/boot-load.test.ts: Load fails (state machine), Gate dev.
- The review diff (`story-1-2.diff`) was regenerated with snap.sh against the patched tree.
- The manual DevTools and iPad checks were not run in this auto run.

**Residual risks:**
- None of the scene code (Boot, Start and overlay wiring, Graphics visuals) runs in tests. The ACs about visuals, the bob, the dim and the 100 ms pop are manual checks only.
- If Phaser's unlock rejects, the session continues without sound: Phaser removes its listeners, and nothing retries until the next stuck-return overlay.
- iOS-specific behaviour is unverified on a device (deferred items C, D and the never-settling `resume()`).
