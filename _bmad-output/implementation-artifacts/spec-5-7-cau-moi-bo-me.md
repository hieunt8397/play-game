---
title: 'Story 5.7: Câu mời bố mẹ cùng chơi'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_revision: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: true
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md']
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** FR35 asks for an occasional line that invites the parent sitting next to the child to join in ("Hỏi mẹ xem…", "Chỉ cho bố xem…"). The rules are: at most 1 per round, only at round start or in free play, never between a prompt and its hints, and on by default. No such line or hook exists yet.

**Approach:**
- Each game gets 1–2 `vo.<game>.parent.<n>` lines, plus a content constant that turns the feature on.
- A pure, tested `core/parent-invite` model decides once per round whether the round gets an invite and which line it uses. It hands out at most one line per round, and only at an allowed moment.
- MiniGameBase uses the model in two ways:
  - **Round start:** the line is chained *before* the first question's prompt through HintDirector, under the prompt's token.
  - **Free play:** `inviteParent()` is the hook Story 5.8 will call, and touch-talk calls it now.

## Boundaries & Constraints

**Always:**
- Lines go through `content/voice-lines.ts` and the TTS pipeline. Each line is ≤ 8 words, has no praise or "wrong", no homophone pair, and does **not** contain "Xoài".
- The child's input is never blocked while the line plays. A correct answer during the line fades out the whole chain (the Story 5.3 fade).
- The hint quiet clocks start only after the chain (invite + prompt) ends or is cut. The Speaker replays only the prompt and never the invite.
- Every new number goes in `Tokens` (`Tokens.ui.parentInviteChance`).
- Voice uses AudioDirector's single channel. Timers use the scene clock.

**Never:**
- No invite between a question's prompt and its hints, which means never while a question is open.
- No invite on a stepDone prompt, a retry, a replay, or any question after the round's first one.
- No invite on a resumed start (`resumeAt` non-null at create). The snapshot does not record whether one was already said, so skipping is the only way to keep the ≤ 1 rule.
- Do not build the 5.8 free-play mode. Do not change the 5.2 name rule list. Do not touch the Map/shell voice.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Invite rolled | enabled, fresh start, rand < chance | First `beginQuestion` → `sayChain([parentLine, prompt])`, one token; the hint clocks wait for its end | No error expected |
| Not rolled | rand ≥ chance, or `PARENT_INVITE_ENABLED=false`, or the game has no lines | First prompt plays exactly as today; `freePlayLine()` also returns undefined | No error expected |
| Second question / stepDone / replay | invite already used, or a question has already begun | Prompt only; `roundStartLine()` → undefined | No error expected |
| Free-play hook while a question is open | `inviteParent()` called between beginQuestion and questionDone | Nothing said, returns undefined; the invite stays unused | No error expected |
| Free-play hook, no open question | rolled, unused (touch-talk start; 5.8 later) | `audio.say(line)` once; later calls → undefined | No error expected |
| Resumed start | `resumeAt` set | No invite this start | No error expected |
| Audio port without `sayChain` | test/fake audio | Prompt only (the lead is dropped) | No error expected |
| Bad content | game with 0 or >2 parent lines, unknown id, a parent-intent line not listed, line > 4 s | `validate:content` reports it | Problem string |

</intent-contract>

## Code Map

- `app/src/games/mini-game-base.ts:95-123` -- `create()` (resets per-start state, then `build()`). This is where the per-start ParentInvite is created.
- `app/src/games/mini-game-base.ts:235-254` -- `talliedHint()`. `beginQuestion` / `questionDone` wrap every question for every game, so this is the single place to add the lead and track whether a question is open.
- `app/src/games/mini-game-base.ts:291-298` -- `cleanup()` at the terminal event. After it, the invite is unavailable.
- `app/src/core/hint-machine.ts:52-56` -- `HintQuestion`: add an optional `leadLineId`.
- `app/src/core/hint-machine.ts:75-83` -- `HintPorts.audio`: add an optional `sayChain`.
- `app/src/core/hint-machine.ts:160-167,253-258` -- `beginQuestion` calls `playPrompt(false)`. That call is where the lead chain goes. `setPrompt` stays prompt-only.
- `app/src/core/hint-director.ts:35-41,89-95` -- `HintAudio` and the port wiring: pass `sayChain` through.
- `app/src/core/audio-director.ts:302` -- `sayChain(ids)`: one token, lines back to back. `fadeOut(token)` (354) fades the whole chain.
- `app/src/content/voice-lines.ts:45-254` -- `VOICE_LINES`. Add the parent lines here.
- `app/src/content/play-again.ts` -- the pattern for a per-game content map with `.ts` specifiers that tools can import.
- `app/src/content/validate.ts:224-232,320-343` -- `NAME_INTENTS` (leave unchanged) and `PROMPT_INTENTS` (the ≤ 4 s audio check); `ContentInput` is at line 41.
- `app/tools/lint/validate-content.ts:305` -- `validateContent` input wiring (next to `playAgain`).
- `app/src/core/tokens.ts:85-86` -- `Tokens.ui.rewardChance`, the precedent for a chance token.
- `app/src/core/rng.ts` -- `mulberry32`, `randInt`, `questionSeed`.
- `app/src/games/touch-talk/TouchTalk.ts:103` -- `talk.start()`. Touch-talk has no questions, so it is free play from the start.

## Tasks & Acceptance

**Execution:**
- `app/src/content/voice-lines.ts`:
  - **What:** Add the lines below, all "Not yet approved", with no "Xoài":
    - `vo.ice-cream.parent.1` "Hỏi mẹ xem | mẹ thích kem gì?" and `.parent.2` "Mời bố ăn | kem cùng nhé!"
    - `vo.pizza.parent.1` "Hỏi bố xem | bố thích nấm không?"
    - `vo.dino-puzzle.parent.1` "Chỉ cho mẹ xem | khủng long nhé!"
    - `vo.shadow-match.parent.1` "Hỏi mẹ xem | bóng này là gì?"
    - `vo.race.parent.1` "Chỉ cho bố xem | xe chạy nhé!"
    - `vo.fishing.parent.1` "Hỏi bố xem | cá nào to nhất?"
    - `vo.touch-talk.parent.1` "Hỏi mẹ xem | đây là gì nhé!"

    Each line uses `keywordPauseMs: 300`. Wording may be adjusted if a validator objects, but must stay within the rules.
  - **Why:** FR35 content, following the AR-N3 pipeline.
- `app/src/content/parent-invite.ts` (new):
  - **What:** Add `PARENT_INVITE_ENABLED = true` and `PARENT_INVITE_LINES: Readonly<Record<GameId, readonly string[]>>`. Use `.ts` specifiers as in play-again.ts.
  - **Why:** The "on by default via a content constant" requirement.
- `app/src/core/tokens.ts`:
  - **What:** Add `ui.parentInviteChance: 0.3`, with a doc comment.
  - **Why:** "Occasionally" as a token value, not a magic number.
- `app/src/core/parent-invite.ts` (new, pure):
  - **What:** Add `createParentInvite({ enabled, lines, rand, chance, resumed })`. It returns:
    - `roundStartLine()`: the line only if no question has begun yet; it consumes the invite.
    - `freePlayLine()`: the line only if no question is open; it consumes the invite.
    - `questionBegan()` and `questionClosed()`.
    - `close()`: the terminal event.
    - `used`.

    The model rolls once at creation (`rand() < chance`) and picks the line with `randInt`. It returns nothing when disabled, resumed, or there are no lines.
  - **Why:** The scenes have no test harness, so the ≤ 1 / allowed-moment rule lives here.
- `app/src/core/parent-invite.test.ts` (new):
  - **What:** Cover the matrix rows:
    - over any call sequence the line is handed out at most once;
    - nothing while a question is open;
    - round start only before the first question;
    - disabled, resumed, empty and `chance` 0/1 cases;
    - deterministic results with a fixed rand;
    - nothing after `close()`.
  - **Why:** The AC's vitest requirement.
- `app/src/core/hint-machine.ts` + `hint-director.ts`:
  - **What:** Add an optional `leadLineId` to `HintQuestion` and an optional `audio.sayChain`. `beginQuestion` plays `sayChain([lead, prompt])` when both exist, otherwise `say(prompt)`. The awaited token is the chain token. `setPrompt`, `replayPrompt` and `stepDone` prompts never include the lead.
  - **Why:** The invite precedes the prompt and never falls between the prompt and its hints.
- `app/src/core/hint-machine.test.ts`:
  - **What:** Test that:
    - the lead is chained and awaited;
    - the quiet clock stays still until the chain token ends;
    - a replay plays the prompt only;
    - questionDone fades the chain token;
    - without `sayChain`, only the prompt plays.
  - **Why:** Regression coverage for the lead.
- `app/src/games/mini-game-base.ts`:
  - **What:**
    - In `create()` (before `build`), build the start's invite from the content constant and lines, `mulberry32` of a seed derived from `this.seed` (separate from the game's question rng), `Tokens.ui.parentInviteChance`, and `resumed: this.resumeAt !== null`.
    - In `talliedHint.beginQuestion`, take `roundStartLine()` (only the first question gets it), call `questionBegan()`, then pass `{ ...q, leadLineId }` on.
    - In `questionDone`, call `questionClosed()`.
    - Add `protected inviteParent(): number | undefined`, which says `freePlayLine()` through `audio.say`. Document it as the 5.8 hook.
    - In `cleanup()`, call `close()`.
  - **Why:** Every game inherits the behaviour, and 5.8 only has to call the hook.
- `app/src/games/touch-talk/TouchTalk.ts`:
  - **What:** Call `this.inviteParent()` right after `talk.start()`.
  - **Why:** The only game with no questions already counts as free play.
- `app/src/content/validate.ts` + `validate.test.ts` + `tools/lint/validate-content.ts`:
  - **What:**
    - Add `parent` to `PROMPT_INTENTS`, so the ≤ 4 s check covers it.
    - Add `validateParentInvite({ gameIds, voiceIds, lines })`: every GameId has 1–2 lines; each line exists and has intent `parent`; every `vo.*.parent*` voice id is listed.
    - Wire it into `ContentInput` and the tool.
    - Add tests: a Xoài parent line is rejected by the existing name rule, plus the count and orphan cases.
  - **Why:** Content guards.
- Run `npm run content:export` + `npm run tts` (EDGE_TTS_BIN / FFMPEG_BIN as in 5.2). This adds 8 `.m4a` + `.hash` files under `app/public/assets/audio/vo/`.

**Acceptance Criteria:**
- Given any fresh round, when it is played to the end, then at most one parent line is said, and only as the lead of the first question's prompt.
- Given `PARENT_INVITE_ENABLED = false`, when any round runs, then no parent line plays and every prompt behaves exactly as before.
- Given the parent line is playing, when the child drags or taps, then input works. A correct answer fades the line within `promptFadeOutMs`, and the hint level stays 0 until the chain has ended.
- Given touch-talk opens with an invite rolled, when the scene starts, then the parent line is said once and never again in that start.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 26 findings — high 0, medium 2, low 18, false 6, maybe-false 0
- findings:
  - `[false]` `reject` (blind) no sayChain implementation — AudioDirector.sayChain exists (audio-director.ts:302) and createHint forwards it (hint-director.ts:97)
  - `[low]` `reject` (blind) invite used up when the lead is dropped — sayChain always exists in production (see above); only test fakes lack it
  - `[false]` `reject` (blind) no audio/.hash for the 8 lines — files are on disk under public/assets/audio/vo (binaries are not in a text diff); validate:content passes
  - `[low]` `reject` (blind) ≤ 4 s not checked for lead + prompt — the lead addresses the parent; the child's input is never blocked and a correct tap fades the chain
  - `[low]` `patch` (blind) touch-talk invite can cut its opening line — patched: invite after the opening line ends
  - `[medium]` `patch` (blind) MiniGameBase wiring untested — patched: registry test
  - `[low]` `patch` (blind) validateParentInvite loose ids / duplicates — patched + tests
  - `[low]` `reject` (blind) parentInviteChance not range-checked — single token, documented
  - `[low]` `reject` (blind) on/off switch is compile-time — the AC asks for a content constant
  - `[low]` `reject` (blind) single-line games name one parent; touch-talk wording — content choice, lines await the parent's listen-approval
  - `[low]` `reject` (blind) property test shares one rng stream / chance 1 — other unit cases cover the not-rolled and close paths
  - `[low]` `reject` (blind) same seed repeats the decision — deterministic by design (seeded rounds)
  - `[low]` `patch` (edge) unknown lead id would reject the whole chain — patched: lines typed as voice-line ids (compile-time)
  - `[low]` `patch` (edge) PARENT_INVITE_LINES typed string[] — grouped
  - `[low]` `patch` (edge) Race/Fishing skip the first beginQuestion so the lead lands mid-round — patched
  - `[low]` `reject` (edge) combined chain ~8 s — grouped with the blind row
  - `[low]` `patch` (edge) duplicate / malformed ids — grouped
  - `[low]` `reject` (edge claim) parents-like ids escape the orphan scan — ids are authored constants; the validator now enforces the exact shape
  - `[medium]` `patch` (verification-gap) MiniGameBase wiring — grouped
  - `[medium]` `patch` (verification-gap) createHint sayChain pass-through untested — patched: director test
  - `[false]` `reject` (intent) "no sayChain in the director" — exists (see first row)
  - `[false]` `reject` (intent) audio not in the diff — on disk
  - `[low]` `reject` (intent) frequency token lives in core/tokens, not content — the AC's content constant is the on/off switch; numbers live in Tokens by AR-N4
  - `[low]` `reject` (intent) free play read as touch-talk start — touch-talk has no questions; Story 5.8 calls inviteParent() for the other games
  - `[false]` `reject` (intent) R1b every round — "thỉnh thoảng" (now and then) selects R1a
  - `[false]` `reject` (intent) check result not shown — run by the orchestrator (exit 0)

## Design Notes

- **Which rounds:** one roll per round with `Tokens.ui.parentInviteChance = 0.3`, seeded from the round seed (reproducible, like the questions). Inviting every round would be nagging and would delay every first prompt. A chance keeps it "thỉnh thoảng" (occasional).
- **Not delaying the child:**
  - The invite is a lead in front of the first prompt, not a separate utterance before `beginQuestion`. Only ~30% of rounds pay the ~2 s, and input is never blocked: the child can answer at once, which fades out the whole chain.
  - The hint clock simply starts later, so no hint arrives early or overlaps the line.
  - Deferring `beginQuestion` itself was rejected: a correct answer could then land on a question that has not begun.
- **Intent `parent`:** the line addresses the child ("ask mum…"), but its purpose is neither greeting, invite, nor prompt. It is not added to `NAME_INTENTS`, so the existing 5.2 rule automatically forbids "Xoài" in it. Lines stay short and nothing about the name rule changes. It is added to `PROMPT_INTENTS` so the ≤ 4 s length check applies.
- **5.8 hook:**
  - When the round's questions run out, 5.8 calls `inviteParent()` in free play. The model returns a line only if the round's roll succeeded and the round-start lead did not already use it.
  - 5.8 may choose to skip the round-start lead for free-play-capable games; that is its decision, and it changes no model rule.
  - `questionClosed()` is already called by then, so the "no open question" guard allows it.

## Verification

**Commands:**
- `cd app && EDGE_TTS_BIN=C:/Users/nguyentrunghieu/.local/bin/edge-tts.exe FFMPEG_BIN=C:/Users/nguyentrunghieu/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe npm run tts` -- expected: 8 new `vo.*.parent.*` `.m4a` + `.hash` files, no errors
- `cd app && npm run validate:content` -- expected: passes, including the ≤ 4 s check for the parent lines
- `cd app && npx vitest run src/core/parent-invite.test.ts src/core/hint-machine.test.ts src/content/validate.test.ts` -- expected: all pass
- `cd app && npm run check` -- expected: typecheck, lint (no-magic-numbers), test, tokens:check, validate:content, build and precache:check all pass

**Manual checks (if no CLI):**
- In `npm run dev`, set `parentInviteChance` to 1 temporarily, then enter Xe kem. The parent line should play, then the prompt right after it. A tap on the correct scoop during the line should fade it out. Restore the value afterwards.

## Auto Run Result

Status: done

- **Summary:** 8 parent-invitation lines (vo.<game>.parent.<n>, no "Xoài", ≤ 4 s) listed per game in content/parent-invite.ts (PARENT_INVITE_ENABLED = true); a pure core/parent-invite model rolls once per round (Tokens.ui.parentInviteChance 0.3, salted seed) and hands out at most one line — as the lead of the round's first prompt (HintMachine chains lead + prompt under one token via AudioDirector.sayChain, so hints wait for both) or in free play via MiniGameBase.inviteParent() (the Story 5.8 hook; touch-talk calls it at the first quiet moment); resumed starts never invite; validator enforces 1–2 well-formed lines per game.
- **Files:** content/voice-lines.ts (+ audio), content/parent-invite.ts (new), content/validate.ts (+test), core/parent-invite.ts (new, +test), core/rng.ts, core/tokens.ts, core/hint-machine.ts (+test), core/hint-director.ts (+test), core/audio-director.ts (voiceBusy), games/mini-game-base.ts (+registry tests), games/{race,fishing,touch-talk}, tools/lint/validate-content.ts, updated line-count tests.
- **Review:** 26 findings — 9 patch entries (2 medium: MiniGameBase wiring test, createHint sayChain pass-through test; 7 low), 0 deferred, rest rejected (incl. 6 false: sayChain and audio already present).
- **Follow-up review recommended:** true — two medium entries patched (test gaps only; behaviour unchanged).
- **Verification:** npm run check exit 0 (1791 tests). Not heard on device.
- **Residual risks:** 8 new lines need a parent's listen-approval; touch-talk's invite can land between two prop names if the child taps continuously.
