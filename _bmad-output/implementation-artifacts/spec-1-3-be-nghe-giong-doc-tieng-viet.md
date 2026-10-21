---
title: 'Story 1.3 — Bé nghe giọng đọc tiếng Việt'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'NO_VCS'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-2-man-mo-dau-nut-choi-mo-khoa-am-thanh.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A hand-edited or corrupted .m4a whose .hash is untouched still passes npm run check.
    evidence: |-
      validateVoice checks .m4a existence and .hash vs lineHash(line) only; the audio bytes are never hashed. Settled default: "voice file edited or deleted" covers deleting either file and editing the .hash; catching .m4a content edits needs an audio digest in the .hash format (a contract change for a later story).
    location: >-
      app/src/content/validate.ts:105
    severity: medium
  - summary: >-
      Placeholder music.island is mastered with single-pass (dynamic) loudnorm, which may break the seamless loop.
    evidence: |-
      Pre-existing from Story 1.2 (tools/audio/make-placeholders.ts uses loudnorm=I=-30:TP=-3 single pass); real music will go through the two-pass linear normalize.ts path.
    location: >-
      app/tools/audio/make-placeholders.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** The app has a pop and music but no voice. A 3-year-old cannot read, so every request must be a pre-generated, warm Vietnamese female voice line that plays on one channel and ducks the music. Nothing yet produces, validates or plays such lines.

**Approach:**
- Add voice lines as content data (`content/voice-lines.ts`).
- `npm run content:export` writes a JSON file. `tools/tts` turns that JSON into normalised `.m4a` + `.hash` files with edge-tts and ffmpeg.
- `npm run check` validates the lines against those files.
- `AudioDirector` gets the voice channel: `say`, `sayChain`, `setPrompt`/`replayPrompt`, the queue/ignore rules, `speech:ended { token }` and music ducking.
- Start plays one `vo.shell.greeting` after unlock. Its real voice file is generated and committed.

## Boundaries & Constraints

**Always:**
- **Line record:** `{ id, text, keywordPauseMs?, rate?, approved?: { textHash } }`.
  - Id grammar: `vo.<scope>.<intent>[.<subjectId>][.<n>]`, where scope is `shell` or a `GameId`. Segments are kebab-case and `n` is digits.
  - Path is derived as `assets/audio/vo/<id>.m4a`, exported from content as `voicePath(id)`. Content stays type-only for imports.
- **TTS settings:**
  - edge-tts 7.2.8, voice `vi-VN-HoaiMyNeural`. Use only `--rate`/`--pitch`/`--volume`, no SSML.
  - Default rate is 0.85, mapped to `--rate=-15%`; the formula is `round((rate−1)×100)%`, using the `=` form because of the leading dash.
  - `|` splits the text into segments. Each segment is rendered, then its leading and trailing silence is trimmed. ffmpeg joins the segments with `keywordPauseMs` of generated silence.
  - ffmpeg two-pass `loudnorm` at I=−16, TP=−1.5, LRA=11: pass 1 gives the measured JSON, pass 2 uses `linear=true`. Output is AAC mono 44.1 kHz at 64k.
- **Hash:** `lineHash(line)` = sha256 hex of `JSON.stringify({v:1, voice, text: NFC(text), keywordPauseMs ?? null, rate ?? 0.85})`.
  - `<id>.hash` holds exactly that hash on one line; readers trim it.
  - `approved.textHash` is compared with the same function. A human approves a line by copying the `.hash` content into it.
- **Never overwrite or leave half-written files:**
  - `tools/tts` skips a line when `approved.textHash === lineHash` and the file exists, and never overwrites it, even with `--force`.
  - It also skips a line when the `.m4a` exists and the existing `.hash` equals `lineHash`, unless `--force` is given.
  - All work happens in a temp dir. The `.m4a` is renamed into place, then the `.hash` is written.
  - Tools are resolved before any work. `EDGE_TTS_BIN` and `FFMPEG_BIN` are env overrides with a PATH fallback, probed with `--version` / `-version`. If either is missing, the tool exits 1 with a message naming the missing tool and writes no file.
- **Validator** (pure rules in `content/validate.ts`; the filesystem and hash functions are injected by `tools/lint/validate-content.ts`). Each failure message names the id. A line fails when:
  - its id breaks the grammar or is a duplicate;
  - it has `|` without `keywordPauseMs`, or `keywordPauseMs` without `|`;
  - it has more than 8 words (`|` removed);
  - one sentence (split on `.!?`, NFC, lowercased, word-tokenised) contains both words of a banned pair: dâu/đâu, cá/cà, ba/bà, bóng/bông, cam/cầm. This also covers "ở đâu" in a sentence with "dâu";
  - its `.m4a` or `.hash` is missing;
  - its `.hash` differs from `lineHash`;
  - its `approved.textHash` differs from `lineHash`.

  A stray `.m4a` or `.hash` under `public/assets/audio/vo/` with no matching line also fails, and the message names that id.
- **Voice channel** (`AudioDirector`, node-testable, still no runtime Phaser import):
  - `say(id) → token`. Tokens are increasing integers starting at 1.
  - The Bus event is `'speech:ended': { token: number; completed: boolean }`. This is AR16's `speechEnded { token }`, renamed for the `noun:verb` rule. It fires exactly once per token: `completed: true` on the sound's `'complete'`, and `false` when the line is stopped, interrupted, dropped or unknown.
  - Lines play only while unlocked. A `say` while locked is held and starts on `'unlocked'`.
- **Queue and ignore rules (UX-DR66):**
  - Same id (or the same chain) as the playing utterance: ignored, and the call returns the current token.
  - Otherwise, if the current line has less than `Timing.voiceQueueTailMs` left (`duration − seek`): the new line waits in one pending slot. A newer request replaces the pending one, which ends with `completed:false`.
  - Otherwise: the current line stops (`completed:false`) and the new one plays.
  - `sfx()` is independent of the voice channel and plays at once.
- **`sayChain(ids)`:** one token; the ids play back to back (the next starts on `'complete'`) and `speech:ended` fires after the last one. Remaining time counts as ≥ 0.5 s until the last item is playing.
- **Prompts:** `setPrompt(id)` stores a line. `replayPrompt()` stops anything playing and replays it from the start with a new token. It returns `undefined` when no prompt is set.
- **Hidden page:** stops the current and pending voice (both end `completed:false`; nothing resumes) and pauses the music. This replaces Story 1.2's `setVoiceStopHook` no-op.
- **Ducking:**
  - When a voice line starts, the music ramps from its base volume (catalog `volume ?? 1`) to base × 10^(−20/20) over `Timing.musicDuckDownMs`.
  - When the channel goes idle, the music ramps back to base over `musicDuckDownMs`, starting `Timing.musicDuckRestoreDelayMs` later.
  - A new line cancels a pending restore. Music started while a voice line plays starts already ducked.
  - The ramp goes through an injectable `rampVolume(instance, target, ms, delayMs)`. The default schedules on `instance.volumeNode.gain` with `context.currentTime` (`cancelScheduledValues`, `setValueAtTime`, `linearRampToValueAtTime`), with no timers. When no node exists, it sets `instance.volume` directly.
- **Loading the greeting:** Boot loads every `vo.shell.*` line with `AUDIO_CATALOG`, using the same retry rules.

**Never:**
- No runtime network: edge-tts runs only in `tools/tts` at build time.
- No runtime text concatenation, and no new lines beyond the greeting; later stories add theirs.
- No HintDirector or Speaker button (Stories 1.6 and 1.9).
- No `this.sound` or audio paths in scenes or games.
- No `setTimeout` in AudioDirector for ducking.
- No writing files that contain backslashes through a shell heredoc.
- No git.

**Decisions (auto-run defaults):**
- **Greeting:** `vo.shell.greeting` = `"Bé ơi, mình cùng | chơi nào!"` with `keywordPauseMs: 300`. That is 5 words, says "Bé ơi", puts the keyword "chơi" last and has no praise. It stays unapproved until a parent listens to it.
  - `createStartTap` calls `audio.say('vo.shell.greeting')` right after `unlock()`, once. Because the voice is held until `'unlocked'`, it plays once after the unlock and ducks the music already started.
- **Duck depth:** 20 dB, which gives a margin over the required ≥ 18 dB. The restore ramp reuses the 150 ms duck-down time.
- **Export file:** `app/.generated/voice-lines.json` (gitignored). Each record carries its `textHash`. `tools/tts` fails with "run npm run content:export" when the file is missing.
- **`tools/audio`:**
  - Add `normalize.ts` (`npm run audio:normalize -- <src> <audioId>`). It applies two-pass loudnorm to the catalog path: music at I=−30, TP=−3; SFX at I=−20, TP=−3 with a 50 ms `afade` in. SFX are measured on short files, and −20 keeps them under the −16 voice.
  - Binary resolution moves to `tools/shared/binaries.ts`, which `make-placeholders`, `normalize` and `tts` reuse.
  - The README provenance table lists every audio file with its source and licence. Today's files are synthesized in-house or generated by TTS.
- **Picked-up deferred item (1.2):** `validate-content.ts` exports `run(publicDir) → problems[]`, and a test runs it against temp dirs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Say idle | unlocked, idle, music playing | token 1; plays; duck ramp to base×0.1 over 150 ms | — |
| Line ends | `'complete'` | `speech:ended {token, completed:true}`; restore ramp delay 500 | — |
| Queue tail | current has 0.3 s left, `say(B)` | B plays after A completes; no restore between | — |
| Interrupt | current has 2 s left, `say(B)` | A ends `completed:false`; B plays now | — |
| Same line | `say(A)` while A plays | ignored; returns A's token | — |
| Pending replaced | A in tail, B pending, `say(C)` | B ends `completed:false`; C plays after A | — |
| SFX while busy | `sfx('sfx.shell.pop')` during voice | plays at once | — |
| Locked | `say(A)` before unlock | plays on `'unlocked'` | — |
| Unknown / not loaded | bad id, or `add` throws | token returned; ended `completed:false` on a microtask | one `console.warn` |
| Chain | `sayChain([A,B])` | one token; A then B; one ended after B | — |
| Replay | prompt set, playing | stop (`completed:false`), restart, new token; no prompt → `undefined` | — |
| Hidden | voice + pending | both end `completed:false`; music paused | — |
| Start greeting | first tap | `say('vo.shell.greeting')` once after `unlock()` | — |
| Validator | each failing line kind from Always | problem text includes the id | check exits 1 |
| TTS tool missing | no edge-tts or no ffmpeg | exit 1 naming the tool; no file written | message |
| TTS skip | approved + hash match, or `.hash` current | line skipped (approved even with `--force`) | — |
| TTS args | rate 0.85, `"a | b"`, 300 ms | `--rate=-15%`; segments `["a","b"]`; 300 ms silence in the concat | — |
| Loudnorm parse | pass-1 stderr | `input_i`, `input_tp`, `input_lra`, `input_thresh`, `target_offset` read | bad JSON throws |

</intent-contract>

## Code Map

- `app/src/core/audio-director.ts` -- the Story 1.2 director (unlock wrapper, `sfx`, `music`, visibility, `setVoiceStopHook` no-op used only by its test). Extend `SoundInstanceLike` with `once`, `duration`, `seek`, `volume`, `destroy?` and `volumeNode?`. Phaser's `WebAudioSound` emits `'complete'` (not on `stop()`). Its `volume` setter is `setValueAtTime(v,0)`, and `add()` throws on a key missing from the cache.
- `app/src/core/shell-flow.ts` / `.test.ts` -- `createStartTap`; add the greeting `say`, and extend `deps.audio`'s `Pick` with `say`.
- `app/src/core/bus.ts` / `.test.ts` -- `EventMap`; add `'speech:ended'`.
- `app/src/core/timing.ts` -- already has `voiceQueueTailMs` 500, `musicDuckDownMs` 150 and `musicDuckRestoreDelayMs` 500.
- `app/src/content/audio-catalog.ts`, `validate.ts`, `app/tools/lint/validate-content.ts` -- the pattern for catalog, rules and tool injection (`fileExists`). The voice rules extend it.
- `app/src/scenes/Boot.ts` -- `attempt()` loads `AUDIO_IDS`; add the `vo.shell.*` lines.
- `app/tools/audio/make-placeholders.ts` (+ test) -- `resolveFfmpeg`/`probeBinary`, to be moved to `tools/shared/binaries.ts`, keeping the `resolveFfmpeg` export.
- `app/eslint.config.js` -- the AUDIO_PATH ban already covers scenes/games, and `rules.test.ts` already has the audio cases. Keep `String.raw` for regexes.
- `app/vite.config.ts` -- Vitest runs on node over `src/core|content` and `tools/**`. Tests must not spawn edge-tts or ffmpeg; inject the runners.
- `app/.gitignore`, `app/package.json`, `app/README.md` -- scripts, ignores, prerequisites and provenance.
- Binaries on this machine: see `persistent_facts` (`EDGE_TTS_BIN`, `FFMPEG_BIN`).

## Tasks & Acceptance

**Execution:**
- `app/src/content/voice-lines.ts` -- `VoiceLine` type, `VOICE_DEFAULTS {voice, rate:0.85}`, `VOICE_LINES` (the greeting), `VoiceLineId`, `isVoiceLineId` and `voicePath`.
- `app/src/content/validate.ts` (+ test) -- the voice rules from Always. Injected: `voice: {lines, hashLine, fileExists, listVoiceFiles, readHash}`.
- `app/tools/lint/validate-content.ts` (+ new `validate-content.test.ts`) -- export `run(publicDir)` wired to the real fs and `lineHash`. The test uses a temp public dir: a missing file and a stray file each fail, and a good tree passes.
- `app/tools/shared/binaries.ts` -- `resolveBinary({envVar, name, versionArg, installHint}, env, probe)`. Update `make-placeholders.ts` to use it.
- `app/tools/tts/line-hash.ts`, `app/tools/content/export-voice-lines.ts` -- the hash, and the JSON export (script `content:export`).
- `app/tools/tts/generate.ts` (+ `generate.test.ts`):
  - Pure functions: `rateArg`, `splitSegments`, `planLine`, `edgeTtsArgs`, `concatArgs`, `loudnormPass1Args`, `parseLoudnorm`, `loudnormPass2Args`.
  - `main` handles `--force`, uses a temp dir and renames atomically. Script: `tts`.
  - The tests cover the TTS matrix rows, including missing-tool ordering (resolution happens before any write) with an injected probe.
- `app/tools/audio/normalize.ts` (+ test) -- argument building for music and SFX targets. Script: `audio:normalize`.
- `app/src/core/bus.ts` (+ test) -- the `speech:ended` event.
- `app/src/core/audio-director.ts` (+ `audio-director.test.ts`) -- the voice channel, prompts, ducking and the hidden-page stop. Remove `setVoiceStopHook`. The tests cover every AudioDirector matrix row with fakes, plus the default `rampVolume` against a fake AudioParam.
- `app/src/core/shell-flow.ts` (+ test) -- the greeting row.
- `app/src/scenes/Boot.ts` -- load the `vo.shell.*` lines by `voicePath`.
- `app/public/assets/audio/vo/vo.shell.greeting.{m4a,hash}` -- generate them by running `npm run content:export && npm run tts` with the env bins (network at build time is allowed), then commit both.
- `app/.gitignore`, `app/package.json`, `app/README.md`:
  - `.generated/` and the scripts.
  - Prerequisites: Python 3.12+ with `pipx install edge-tts==7.2.8`; ffmpeg on PATH (`winget install Gyan.FFmpeg`) or `FFMPEG_BIN`; `EDGE_TTS_BIN`; the fallback (Azure / Google Cloud vi-VN neural TTS, same `.m4a` + `.hash` contract).
  - The approval workflow and the audio provenance and licence table.

**Acceptance Criteria:**
- Given the env bins, when running `npm run content:export && npm run tts` twice, then the first run writes `vo.shell.greeting.m4a` (AAC mono 44.1 kHz) and `.hash`, and the second run skips the line.
- Given the generated greeting, when running `ffmpeg -i … -af ebur128 -f null -`, then its integrated loudness is −16 ± 1 LUFS and an audible ~300 ms pause comes before "chơi".
- Given a fresh `npm run dev` with DevTools, when the child taps ▶, then the pop sounds at once, the greeting plays once on the placeholder Map, and the music audibly dips while it plays and returns about 0.5 s after it ends.
- Given a voice file edited or deleted, or a line's text edited without regenerating, when running `npm run check`, then it fails and names the id.

## Spec Change Log

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 25 findings — high 0, medium 7, low 14, false 2, maybe-false 2
- findings:
  - `[medium]` `[patch]` (verification-gap) Boot's shell voice load list untested — moved to `bootAudio()` in core/boot-load.ts, Boot uses it; Vitest asserts the greeting key/URL and every catalog id.
  - `[low]` `[patch]` (verification-gap) `trimArgs` never asserted — added a "trim" args test (silenceremove/areverse pair, mono 44.1 kHz PCM).
  - `[medium]` `[patch]` (verification-gap other) approved line with missing/stale .hash is unrepairable — `runTts` rewrites the .hash on an approved skip when it differs; the --force test now asserts the repair.
  - `[low]` `[patch]` (blind) README/voice-lines header claim check enforces "one request per sentence, keyword last" — reworded as unchecked authoring guidance.
  - `[medium]` `[patch]` (blind) misplaced/empty `|` segments pass validation — new rule: no empty text or empty segment around `|` (test added). Multiple `|` stays allowed: the intent says `|` splits text into segments.
  - `[low]` `[reject]` (blind) rate/keywordPauseMs ranges and rate precision not checked — needs new guards; unlikely with hand-written content lines.
  - `[medium]` `[patch]` (blind) `tts` can render from a stale export — the `tts` script now runs `content:export` first.
  - `[false]` `[reject]` (blind) greeting .m4a missing — it exists on disk (binary files are excluded from the NO_VCS diff); validate:content passes against the real public/.
  - `[low]` `[defer]` (blind) placeholder music single-pass loudnorm may break the loop — pre-existing from Story 1.2.
  - `[low]` `[reject]` (blind) AudioDirector takes plain string ids — the intent defines the runtime unknown-id behaviour (warn + completed:false); typing would add surface beyond the story.
  - `[low]` `[reject]` (blind) .m4a moved before .hash can leave a mismatch on a failed rename — rare, and check names the id; the fix needs extra state handling.
  - `[low]` `[reject]` (blind) test names broader than their assertions — cosmetic.
  - `[low]` `[reject]` (blind) GameId vs KEBAB digits, 'shutdown' literal, duplicated encode constants — no named caller breaks today; cosmetic.
  - `[low]` `[patch]` (blind) README stray double blank line — removed. Table vs bullets duplication not changed: the bullets carry the subset command and synthesis details.
  - `[medium]` `[patch]` (edge) re-entrant say() from a speech:ended listener during dropPending/cutCurrent could overwrite a nested pending line without ending it — `request` now holds cut/drop ends until the channel is settled, then emits them; test added.
  - `[maybe-false]` `[reject]` (edge) inst.play() returning false leaves the channel stuck — Phaser returns false on a freshly added sound only for pending removal / missing marker; if true only low (settle with a device check).
  - `[maybe-false]` `[reject]` (edge) gain.value mid-ramp on older Safari — target iPadOS ≥ 16.4; if true the result is a volume jump (low).
  - `[medium]` `[patch]` (edge) empty/only-`|` text passes the validator — same root cause and fix as the empty-segment rule above.
  - `[low]` `[reject]` (edge) more than one `|` — allowed by the intent (segments).
  - `[low]` `[reject]` (edge) non-positive pause/rate — new guards for an unlikely authoring error.
  - `[medium]` `[patch]` (edge) approved line with stale .hash unfixable — same root cause and fix as the verification-gap other finding.
  - `[low]` `[reject]` (edge) non-array export JSON throws a TypeError — the export is tool-written; a crash still exits non-zero.
  - `[false]` `[reject]` (edge claim) same id as pending returns the pending token — the intent's "same line is ignored" applies; tested.
  - `[medium]` `[defer]` (edge claim) an edited .m4a with an untouched .hash passes check — default chosen and recorded in deferred.
  - `[low]` `[reject]` (intent-alignment) runtime surface (real Phaser/WebAudio, audible ducking) not exercised by automation — covered by the spec's manual checks; no node harness for Phaser exists.

## Design Notes

**Why `completed`:** later consumers (HintDirector 1.9, Map invitations 1.5) must never hang on a token whose line was cut. Ending every token exactly once, and flagging how it ended, keeps "react only to your own token" safe.

**Ducking without timers:** the 500 ms restore delay and the ramps are scheduled on the WebAudio `GainNode` param, so they follow the audio clock and are cancelled by `cancelScheduledValues` when the next line starts. That keeps AudioDirector free of `setTimeout` and testable through the injected `rampVolume`.

## Verification

**Commands:**
- `cd app && npm run content:export && npm run tts` -- expected: the greeting is written, then skipped on a second run. With `EDGE_TTS_BIN` pointing at a bad path, the run exits 1 naming edge-tts, and no new file appears.
- `cd app && npm run check` -- expected: exit 0, with every matrix row covered by Vitest and validate:content reporting the voice line count.
- `cd app && npm run build` -- expected: exit 0 with `dist/assets/audio/vo/vo.shell.greeting.m4a` present.

**Manual checks:**
- Listen to the greeting: a warm female voice, slow, with a pause before "chơi". Leave `approved` unset for the parent.

## Auto Run Result

**Summary:** Story 1.3 adds the Vietnamese voice channel. Voice lines are content data; `content:export` + `tts` (edge-tts vi-VN-HoaiMyNeural, two-pass loudnorm) render `.m4a` + `.hash`; `npm run check` validates lines ↔ files ↔ hashes; AudioDirector gains say/sayChain/setPrompt/replayPrompt with queueing, `speech:ended` and music ducking. Start plays `vo.shell.greeting` after unlock. This run resumed an interrupted review.

**Files changed (app/):**
- `src/content/voice-lines.ts` — line type, defaults, VOICE_LINES, voicePath.
- `src/content/validate.ts` (+ test) — voice rules, incl. the review's empty-segment check.
- `src/core/audio-director.ts` (+ test) — voice channel, ducking; review fix: ends held during request.
- `src/core/bus.ts` (+ test) — `speech:ended`.
- `src/core/shell-flow.ts` (+ test) — greeting after unlock.
- `src/core/boot-load.ts` (+ test) — review fix: `bootAudio()` load list.
- `src/scenes/Boot.ts`, `src/scenes/Start.ts` — load shell voice lines; greeting wiring.
- `tools/tts/generate.ts` (+ test), `tools/tts/line-hash.ts`, `tools/content/export-voice-lines.ts` — pipeline; review fix: repair approved .hash.
- `tools/shared/binaries.ts` (+ test), `tools/audio/normalize.ts` (+ test), `tools/audio/make-placeholders.ts` — binary resolution, mastering.
- `tools/lint/validate-content.ts` (+ test) — real-fs wiring.
- `public/assets/audio/vo/vo.shell.greeting.{m4a,hash}` — generated greeting (not yet approved).
- `package.json` (tts runs content:export first), `.gitignore`, `README.md`.

**Review:** 25 findings. Patched 9 rows (5 distinct medium root causes, 3 low fixes). Deferred 2 (m4a content edits undetected — medium; placeholder music loudnorm — low, pre-existing). Rejected 14 with reasons in the triage log.

**Follow-up review:** recommended (`true`) — 5 medium entries patched on a first pass. Unverified risk: the held-ends change in `AudioDirector.request` reorders `speech:ended` relative to the new utterance starting; only fakes exercise it, not real Phaser WebAudio.

**Verification:** `npm run check` exit 0 (typecheck, lint, 227 Vitest tests, tokens, validate:content OK with 1 voice line). `npm run tts` with env bins: export rewritten, greeting skipped as up to date. The greeting was measured at −16.1 LUFS, mono 44.1 kHz AAC, 0.3 s keyword pause.

**Residual risks:** no automated runtime test on real Phaser / iPad Safari (manual listening and ducking check still due); the greeting awaits parent approval.
