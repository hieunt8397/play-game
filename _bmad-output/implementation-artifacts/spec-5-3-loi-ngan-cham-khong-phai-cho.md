---
title: 'Story 5.3: Lời ngắn, chạm là không phải chờ'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_revision: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Map scene skip wiring (begin in pullBack, end in endChain, skipTap guard) has no test.
    evidence: |-
      No test imports scenes/Map; only the pure chain and skip models are tested.
    location: >-
      app/src/scenes/Map.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** When the child answers correctly, the prompt keeps talking until a later line cuts it off abruptly. Celebrations and the island's post-round chain run for 2–5 s and cannot be skipped: the pizza bake and eat, the dino coming alive, the shadow reveal, the fish catch, the 2 s ice-cream wait, and the pull-back plus fly-in. Nothing checks that prompts stay short (NFR15, NFR5).

**Approach:**
- **Prompt fade:** AudioDirector gets `fadeOut(token)`. HintMachine fades its awaited prompt or retry line when the question is done.
- **Skip:** a pure `core/skip` model runs a fast-forward. Inside a window that a game opens for a celebration longer than `Timing.skipThresholdMs`, a tap scales the scene's tweens and clock up to their end state. It also cuts the celebration's own voice and drops SFX.
- **Hooks:** MiniGameBase hosts the skip. Each game makes one `skippable(ms)` call and one `skipVoice(token)` call. Map hooks its post-round chain.
- **Length check:** `validate:content` measures every prompt `.m4a` (MP4 `mvhd` duration, pure TS, offline) and fails any prompt over 4 s.

## Boundaries & Constraints

**Always:**
- Persistence is never time-based. Reward grant (`round:complete` → reward-service), difficulty, clearResume and `round:complete` itself all still run. A skip only speeds up clocks: it never calls completion callbacks, never removes timers or tweens, and never skips a command.
- A window closes at the next `hint.beginQuestion`, at the terminal event (`MiniGameBase.cleanup`), at `skip.end()` and on scene SHUTDOWN. On close it restores time scale 1 and releases the SFX hold. A hint question therefore never runs on a scaled clock.
- A tap counts only once it arrives `Timing.skipArmMs` after `begin`, so the answering gesture never skips. Taps come through the router's `onAnyTap` (InputGuard), never a raw pointer listener in games.
- New numbers go in `core/timing.ts`, then run `npm run tokens`. Timers use scene `time`. AudioDirector schedules only on the audio clock and uses no timers.
- In each game's `say(tag, speak)` helper, `skipVoice(token)` runs **after** `this.tokens.set(token, tag)`. A synchronous `speech:ended` is then never lost.

**Never:**
- Do not skip the Map station→game trip (kart drive + zoom). It is gated by asset loading and is out of scope.
- Do not skip pizza counting, which is learning content (it comes before the oven step, not a celebration).
- Do not hook race or touch-talk: all their sequences are ≤ threshold.
- Do not gate input on voice. Do not touch 5.4 tap reactions, 5.5 reward choice or 5.8 free play. Do not change voice texts: every current prompt is ≤ 3.997 s, measured.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Correct while prompt plays | awaited token playing, `questionDone()` | `audio.fadeOut(token)`: gain → 0 over `promptFadeOutMs` (150); `speech:ended {completed:false}` once; channel free at once (next `say` plays, no queue-tail wait) | no gain node → immediate stop |
| Faded instance afterwards | fading instance hits `complete`, or a new utterance starts, or the page hides | the instance is stopped/destroyed; nothing is emitted twice | – |
| fadeOut pending / unknown token | pending utterance / foreign token | pending → dropped (`completed:false`); unknown → no-op | – |
| Short window | `begin(≤ skipThresholdMs)` + tap | nothing | – |
| Early tap | `begin(2000)`, tap at < `skipArmMs` | nothing | – |
| Skip | `begin(2000)`, tap after arm | `setTimeScale(skipTimeScale)`, `holdSfx(true)`, every tracked token stopped; second tap no-op | – |
| Voice during skip | `voice(t)` while skipping | `stopVoice(t)` at once | – |
| Reentrant end | a `stopVoice` handler leads to `beginQuestion` → `end()` | ends at scale 1, SFX released; `tap` does not touch state afterwards | – |
| End | `end()` (twice, or with no window) | scale 1, SFX released, tokens forgotten; idempotent | – |
| Long prompt | prompt-intent line `.m4a` > `promptMaxMs` | `voice "<id>": prompt lasts 4.21 s (at most 4 s, NFR15)` | fails `validate:content` |
| Unreadable length | prompt `.m4a` exists, no `mvhd` | `voice "<id>": cannot read the audio length` | fails |

</intent-contract>

## Code Map

- `app/src/core/audio-director.ts` -- `sfx` L263, `stop` L335, `request` L347, `startUtterance` L403, `onItemComplete` L431 (its stale return must release a fading instance), `cutCurrent` L462, `rampVolume` L141, `onHidden` L597. No fade or SFX hold exists today. Tests are in `audio-director.test.ts`.
- `app/src/core/hint-machine.ts` -- ports audio slice L76, `questionDone` L192, `playPrompt` L245. The quiet clocks already start only on `speechEnded(awaited)`, for a completed or a cut line. `app/src/core/hint-director.ts` L35 (`HintAudio`), L88–92 (ports wiring).
- `app/src/games/mini-game-base.ts` -- `create` L70, `talliedHint.beginQuestion` L161, `scheduleFinish` L179 (`time.delayedCall`, scaled during a skip), `cleanup` L214.
- `app/src/core/input/tap-router.ts:43` -- `onAnyTap`, one slot, runs before the target's `onPress`. Games build their router in `build()` (IceCream L103, Pizza L146, DinoPuzzle L138, ShadowMatch L119, Fishing L97).
- Hook points:
  - `IceCream.ts:453` (`nextLater`, `c.ms` = correctMusicMaxMs 2000);
  - `Pizza.ts:891` (`bake`), say helper L795;
  - `DinoPuzzle.ts:712` (`comeAlive`), say L642;
  - `ShadowMatch.ts:583` (`suckIn`), say L526;
  - `Fishing.ts:475` (`catch`), say L440.
- `app/src/scenes/Map.ts` -- `router.onAnyTap` L248, `PostRoundChain` deps L326–339 (`pullBack` uses camera pan/zoom effects, not tweens), `waitScene` L523, `flyIn` L530, `endChain` L584.
- `app/src/core/post-round-chain.ts` -- persistence steps 1–3 run synchronously in `start`, before any animation.
- `app/src/content/validate.ts` -- `VoiceInput` L22, `validateVoice` L269, `NAME_INTENTS` (pattern for an intent list). `app/tools/lint/validate-content.ts:303` -- the injected voice access.
- `app/src/core/timing.ts` -- add tokens here; `loadingKartWaitTimeScale` is the precedent for a factor.

## Tasks & Acceptance

**Execution:**
- `app/src/core/timing.ts` -- add:
  - `skipThresholdMs: 1500`, `skipArmMs: 250`;
  - `skipTimeScale: 40` (a factor);
  - `promptFadeOutMs: 150`, `promptMaxMs: 4000`;
  - `celebrationLineMs: 1000` (the length estimate of a name line).
  Then run `npm run tokens`. -- AR-N4
- `app/src/core/audio-director.ts` (+ test):
  - `fadeOut(token)` per the matrix. Fading instances are kept in a set, and every start of a new utterance and `onHidden` stops them.
  - `holdSfx(on)`: while held, `sfx()` is dropped.
  -- prompt fade
- `app/src/core/hint-machine.ts`, `hint-director.ts` (+ `hint-machine.test.ts`):
  - optional `audio.fadeOut?(token)`. `questionDone` calls it with `awaited` before resetting.
  - Tests:
    - the fade is called or not called, depending on `awaited`;
    - no `guard.setPickable` while a prompt is awaited (input is not blocked);
    - escalation does not start until `speechEnded`, for both a completed and a cut prompt.
  -- AC1
- `app/src/core/skip.ts` (+ `skip.test.ts`) -- pure.
  - `createSkip(ports: { setTimeScale, holdSfx, stopVoice }, now, timings = defaultSkipTimings())` → `{ begin(expectedMs), voice(token), tap(), end(), skipping }`.
  - `tap()` sets its state first, then stops a snapshot of the tracked tokens (reentrancy-safe).
  - Tests cover every skip row of the matrix. -- testable core
- `app/src/core/skip-scene.ts` -- `createSceneSkip(scene)`. Its ports:
  - set `scene.tweens.timeScale` and `scene.time.timeScale`; on a scale > 1, call `effectComplete()` on each running main-camera `panEffect`, `zoomEffect` and `fadeEffect`;
  - `audio.holdSfx`, `audio.stop`;
  - `now` = `scene.time.now`;
  - `end()` on SHUTDOWN.
  -- thin adapter
- `app/src/games/mini-game-base.ts`:
  - Create the skip in `create`.
  - `protected skippable(expectedMs)` → `begin`; `protected skipVoice(token)` → `voice`.
  - `protected attachSkip(router)` chains `router.onAnyTap` (keeping any previous handler) to `skip.tap()`.
  - `end()` in `talliedHint.beginQuestion` and in `cleanup`.
  -- framework
- The five games:
  - call `attachSkip(this.router)` after the router is created;
  - at the hook point, call `skippable(<sum from Design Notes>)`;
  - put `skipVoice(token)` last in the say helper (dino, shadow, fishing).
  -- AC2
- `app/src/core/post-round-chain.ts` (+ test) -- `chainAnimMs(reduced, pendingCount)` = (reduced ? `sceneFadeMs` : `cameraPullBackMs`) + (pendingCount > 0 ? `decorationFlyInMs` + (pendingCount−1)·`flyInStaggerMs` : 0). Test that steps 1–2 still write when `pullBack`/`flyIn` resolve at once. -- AC2 Map
- `app/src/scenes/Map.ts`:
  - `createSceneSkip(this)` in `create`.
  - `onAnyTap` first runs `skip.tap()`.
  - The `pullBack` dep first calls `skip.begin(chainAnimMs(this.reduced, session.pendingFlyIns.length))`.
  - `endChain` calls `skip.end()`.
  -- transition skip
- `app/tools/audio/m4a-duration.ts` (+ test) -- `m4aDurationMs(buf): number | undefined`. It walks top-level boxes into `moov`/`mvhd` (v0 32-bit, v1 64-bit; `moov` may follow `mdat`) and returns duration / timescale × 1000. Tests use synthetic buffers for v0, v1, moov-last, truncated and no-moov. -- offline length
- `app/src/content/validate.ts` (+ `voice-rules.test.ts`):
  - Add `PROMPT_INTENTS = ['ask','ask-order','order-first','order-next','prompt','retry','bake','enough']`.
  - Add `VoiceInput.durationMs?(publicPath)`. When it is given, an existing prompt file that is longer than `promptMaxMs`, or whose length is unreadable, reports per the matrix.
  -- AC3
- `app/tools/lint/validate-content.ts` -- pass `durationMs` (`readFileSync` + `m4aDurationMs`, try/catch → undefined).

**Acceptance Criteria:**
- Given a prompt playing, when the child drags or taps a playable item, then it responds within one frame. If that completes the question, the prompt fades to silence within 200 ms. The hint level-2 clock starts only after the prompt has ended or been cut.
- Given these sequences, when the child taps ≥ 250 ms after the sequence starts, then it jumps to its end state within a few frames, with no SFX burst and its name line cut, and the game continues at normal speed:
  - the pizza bake and eat;
  - a dino coming alive;
  - the shadow reveal;
  - a fish catch;
  - the ice-cream wait before the next question;
  - the island pull-back with a fly-in.
- Given the same skip on a round's last question, then `round:complete` fires exactly once with the unskipped outcome. The reward, difficulty and resume are saved as without a skip, and the post-round chain still runs.
- Given race, touch-talk or a ≤ 1.5 s sequence, when the child taps, then nothing is skipped.
- Given the real content, when `npm run validate:content` runs, then it passes. A prompt `.m4a` over 4 s would fail it, naming the id.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 36 findings — high 0, medium 6, low 26, false 4, maybe-false 0
- findings:
  - `[medium]` `patch` (blind) skip tap also reaches targets; on the Map it queues a station tap replayed by endChain — patched: tap() returns whether it skipped; Map does not forward that tap (game targets are locked during their celebrations)
  - `[medium]` `patch` (blind) short begin leaves an older window armed — patched: end() before the threshold check + test
  - `[low]` `patch` (blind) Pizza opens the window before the !base guard — patched
  - `[low]` `patch` (blind) Map window sized on unfiltered pending count — patched: newestPerSlot play count
  - `[low]` `reject` (blind) global boolean SFX hold / no sleep handling — Map's window always ends in endChain before a game starts; windows never overlap
  - `[low]` `reject` (blind) sprite anims not sped up — games animate frames through tween counters on the scaled clock
  - `[low]` `reject` (blind) attachSkip depends on call order — each game calls it once in create after setting its own handler
  - `[medium]` `patch` (blind) questionDone re-enters through the synchronous fade end — patched: state cleared before fading + test
  - `[medium]` `defer` (blind) game/scene wiring tests missing — MiniGameBase part patched (registry test); Map wiring deferred
  - `[low]` `reject` (blind) m4a claim ignores elst/priming — over-long reading errs on the safe side for a ≤ 4 s limit; longest prompt 3.997 s
  - `[low]` `reject` (blind) PROMPT_INTENTS test restates the literal — verification-gap confirmed every intent the games use is in the list
  - `[low]` `patch` (blind) Dino window opens before afterSnaps — patched
  - `[medium]` `patch` (verification-gap) createHint fadeOut passthrough untested — patched: director test
  - `[medium]` `patch` (verification-gap) MiniGameBase skip lifecycle untested — patched: registry test
  - `[medium]` `defer` (verification-gap) Map skip wiring untested — no Map harness (filed defer)
  - `[low]` `patch` (verification-gap other) Map window count — grouped
  - `[false]` `reject` (edge) new utterance hard-stops a fading prompt — recorded design: one voice at a time; the next line follows at once
  - `[false]` `reject` (edge) pending line makes the fade 0 ms — same recorded design
  - `[low]` `reject` (edge) fade of a token shared by key with a game line — prompts and game lines use distinct ids
  - `[medium]` `patch` (edge) questionDone re-entry — grouped
  - `[medium]` `patch` (edge) begin short keeps old window — grouped
  - `[low]` `reject` (edge) stopVoice reentry during tap snapshot loop — tap sets state before the loop; a nested begin opens a new window as designed
  - `[medium]` `patch` (edge) skip tap reaches targets — grouped (Map)
  - `[low]` `reject` (edge) onAnyTap reassigned after attachSkip — grouped with the blind row
  - `[low]` `patch` (edge) Dino inert window — grouped
  - `[low]` `patch` (edge) Pizza window size per path — grouped
  - `[low]` `reject` (edge) shake/flash/rotate effects not finished — no celebration uses them
  - `[low]` `reject` (edge) sleep while skipping — grouped with the SFX-hold row
  - `[low]` `reject` (edge) SFX hold shared by two windows — grouped
  - `[low]` `reject` (edge) toFixed shows 4.00 s for 4000.4 ms — cosmetic in a developer-only message
  - `[low]` `patch` (edge) mvhd duration 0 / unknown — patched: undefined
  - `[low]` `reject` (edge) 64-bit box size precision — guarded by end > to
  - `[low]` `patch` (edge) cut-prompt test ignores completed — patched
  - `[false]` `reject` (edge claim) pizza/ice-cream never cut their celebration voice — the spec routes skipVoice through dino, shadow, fishing only; those two say no line inside their window that outlives it
  - `[false]` `reject` (edge claim) prompt cut abruptly when a celebration line follows — recorded design (one voice)
  - `[low]` `patch` (edge claim) cut-prompt coverage false confidence — grouped with the test patch

## Design Notes

Expected lengths passed to `skippable` (all from `Tokens.Timing`; ≤ 1500 means not skippable):
```
ice-cream nextLater   c.ms (correctMusicMaxMs 2000)        last question: 1500 → not hooked
pizza bake            2·pizzaSlideMs + 2·ovenGlowRiseMs + pizzaBakeMs + pizzaEatMs  (≈4800)
dino comeAlive        dinoBlinkMs + dinoWalkMs + dinoCallMs + celebrationLineMs     (≈3160)
shadow suckIn         shadowRevealMs + trikeCallMs + celebrationLineMs + shadowItemFadeMs (≈2300)
fishing catch         fishReelMs + fishJumpMs + celebrationLineMs + fishShortCelebrateMs  (≈2900)
map pullBack          chainAnimMs(reduced, pending)  (2200+ with one fly-in)
```

Decisions taken for intent gaps (auto-run):
- **Skip = fast-forward, not teleport.** Scaling the scene clocks plays every remaining step and callback in order, but ×40 faster. Chains, persistence and `round:complete` therefore behave exactly as without a skip. Camera effects are not scaled by Phaser, so the adapter completes them. A short ambient speed-up during the window is accepted.
- **"Answered correctly" = `questionDone`.** A partial step (`stepDone` without a new prompt) lets the prompt continue, because it still names what is left.
- **A new utterance stops a fading one at once.** This keeps one voice at a time, and it is what happens today.
- **Celebration voice is cut on skip.** The child chose to move on. The arm delay (250 ms) stops the answering gesture from skipping the name.
- **Prompt intents** = the hint system's prompt and retry families listed above. Greeting and invite lines are not "câu yêu cầu" (they measure ≤ 3 s anyway).
- **Length source = the `mvhd` box,** which matches ffprobe on every current file (max 3.997 s). No manifest and no binary at validate time.

## Verification

**Commands:**
- `cd app && npm run tokens` -- expected: generated tokens updated
- `cd app && npx vitest run src/core/skip.test.ts src/core/audio-director.test.ts src/core/hint-machine.test.ts src/core/post-round-chain.test.ts src/content tools/audio tools/lint` -- expected: all pass
- `cd app && npm run validate:content` -- expected: exit 0
- `cd app && npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- Headless Chrome (dev server + CDP driver in the session scratchpad). Steps:
  - pizza: place the toppings, tap the oven, then tap again → the eaten state and the next question within about 0.3 s;
  - finish an ice-cream question mid-prompt → the voice fades;
  - finish a round with a grant, then tap during the pull-back → the decoration is in its slot and the play-again overlay opens.

## Auto Run Result

Status: done

- **Summary:** answered prompts fade out (AudioDirector.fadeOut, 150 ms; HintMachine.questionDone fades the awaited line, state cleared first); a pure skip model (core/skip.ts) + Phaser adapter (core/skip-scene.ts) fast-forward celebrations longer than 1.5 s by 40× after a 250 ms arm (all callbacks still run, so persistence and round:complete are never skipped); MiniGameBase hosts it (skippable/skipVoice/attachSkip); windows in ice-cream, pizza, dino-puzzle, shadow-match, fishing and the Map post-round chain (the skip tap is not forwarded to station taps); validate:content fails a prompt line longer than 4 s, read from the m4a mvhd box.
- **Files:** core/audio-director.ts, core/hint-machine.ts, core/hint-director.ts, core/skip.ts (new), core/skip-scene.ts (new), core/post-round-chain.ts, core/timing.ts, games/mini-game-base.ts, the five game scenes, scenes/Map.ts, content/validate.ts, tools/audio/m4a-duration.ts (new), tools/lint/validate-content.ts, with tests (skip, skip-scene, audio-director, hint-machine, hint-director, post-round-chain, voice-rules, validate-content, m4a-duration, registry).
- **Review:** 36 findings — 10 patch entries applied (5 medium: Map skip tap forwarded, questionDone re-entry, stale window on short begin, fadeOut passthrough test, base skip lifecycle test; 5 low), 1 deferred (Map skip wiring test), rest rejected with reasons.
- **Follow-up review recommended:** true — five medium entries were patched; the Map skip-tap guard (skipTap flag in onAnyTap + tapStation) is scene code with no test.
- **Verification:** npm run check exit 0 (1650 tests); headless Chrome earlier: chain 2233 → 685 ms with a tap, pizza bake/eat 5117 → 674 ms, tap < 250 ms does not skip.
- **Residual risks:** Map wiring untested; prompt fade only unit-tested (not heard).
