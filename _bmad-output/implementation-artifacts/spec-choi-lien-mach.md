---
title: 'Chơi liền mạch: xong lượt tự sang lượt mới'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_commit: 'NO_VCS'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After every round (3–5 questions, ~5–7 taps) the game leaves to the island and shows a "Chơi nữa?" overlay; a 3-year-old must understand and tap the replay button or the play stops, so the fun is cut every minute.

**Approach:** Play continues in the same game: the round's celebration plays, then a new round starts by itself (next difficulty, new seed). The child goes back to the island only with the Home button; the play-again overlay is removed.

Decisions (parent, 2026-10-21):
- The next round starts right after the celebration (~2 s); the post-round free play (e.g. ice-cream tower) is effectively dropped.
- Decorations were already removed (spec-bo-do-trang-tri).

## Boundaries & Constraints

**Always:** Difficulty is still saved on every `round:complete` (settle) and the next round starts at the saved level with a fresh seed and never resumes a snapshot. Home mid-round still abandons with a resume point (FR27); Home between rounds goes back like today's Home in free play (camera pull-back, Map idle "Mời chơi"). Navigation and start data stay owned by Map (lint rule in mini-game-base.ts). Touch-talk is unchanged (it never completes a round). Every new delay is a Timing token.

**Never:** Rewrite each game's `build()`; re-render art (the `icon/<id>/00` play-again frames, `sprite.icon` group and its layout rule stay — add them to the deferred art cleanup); change round rules, ladders or celebrations.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Next round | last answer of a round | celebration as today → `round:complete` (difficulty saved) → `nextRoundDelayMs` → short fade → same game restarts with the new level and a new seed | — |
| Home between rounds | tap Home after `round:complete`, before the restart | `round:leave` → chain → pull-back → Map idle; no restart happens | the pending next-round timer is cancelled |
| Home mid-round (round 2+) | abandon | resume point kept, fade back (as today) | — |
| Late next-round | `round:next` while a chain runs or for a game that is not running | ignored | — |
| Assets | restart of the same scene | the game's textures/sounds stay loaded (no release on the restart's SHUTDOWN) | — |
| Parent invite | round ends | no free-play invitation line (it would be cut); round-start lead invitation still works | — |

</frozen-after-approval>

## Code Map

All under `app/`.
- `src/games/mini-game-base.ts` -- `enterFreePlay` (:~380): after `guard.complete`, schedule (scene clock, `this.time`) `Timing.nextRoundDelayMs`, then a camera fade-out (`Timing.sceneFadeMs`), then emit `round:next { gameId }` only if the guard is still in free play; drop the `inviteParent()` call there (touch-talk's start call stays). `leave()`'s `cleanup` already removes timed events — keep it cancelling this. `create()` already fades in.
- `src/core/bus.ts` (+test) -- add `round:next: { gameId: GameId }`.
- `src/core/post-round-chain.ts` (+test) -- pure `routeRoundNext(running, gameId, chainActive)` → `{action:'restart', gameId}` or `ignore` (extend `TerminalRoute`).
- `src/scenes/Map.ts` -- subscribe `round:next`; on `restart`: `takeStartData(id, len)` (no resume: settle already cleared it), update `this.running.level`, restart the game scene with the new data WITHOUT triggering `releaseGame` (the `SHUTDOWN` once-listener set in `enterGame` :~851 must not fire for a restart — e.g. a `restarting` flag or re-arming the listener), `syncResumeMarks()`. `onChainEnd` (:~188) → always Map idle (no overlay). Remove `openPlayAgain`, `playAgainObstacles`, `playAgainClosed`, `PLAY_AGAIN_KEY` stop on shutdown (:~510).
- `src/core/session-store.ts` (+test) -- `takeStartData` loses the `via: 'replay'` param (nothing replays any more).
- `src/core/kart-trip.ts` (+test) -- remove `replay()` / `via:'replay'`; `src/scenes/Map.ts` `enterGame` loses `via`; `enterZoomMs(via)` → single zoom; `replayZoomInMs` token goes.
- Delete (+tests): `src/scenes/PlayAgainOverlay.ts` (registered in `src/main.ts`), `src/core/play-again.ts`, `src/core/play-again-layout.ts`, `src/core/ui/play-again-icons.ts`, `src/content/play-again.ts`; `validatePlayAgain` in `src/content/validate.ts` and its call in `tools/lint/validate-content.ts`; `Rect` in `core/geometry-pad.ts` only if no user remains.
- Check and trim play-again references in `src/core/map-guide.ts`, `resume-marks.ts`, `tap-react.ts`, `ui/tap-reactions.ts`, `ui/round-button.ts`, `scenes/AudioUnlockOverlay.ts` (comments or shared helpers — keep shared code used elsewhere).
- Voice: `vo.shell.play-again-ask.*`, `vo.shell.play-again-ask`, `vo.shell.play-again-elsewhere` (`src/content/voice-lines.ts`) + their `public/assets/audio/vo/*.{m4a,hash}`; tests in `src/content/games/{fishing,race,touch-talk}.test.ts`.
- `src/core/timing.ts` / `tokens.ts` -- add `nextRoundDelayMs: 500`; remove `playAgain*`, `replayZoomInMs`, `roundEndToOverlayMaxMs` and ui `playAgain*` with no remaining user (`tokens.generated.ts` stays; `tools/atlas/pack.ts`, `tools/render/build.ts`, `tools/layout/rules.ts` icon parts are art pipeline — leave).
- Docs: `app/README.md` (provenance rows of the deleted voice lines, a note), PRD (FR25 and FR22's overlay part), `ARCHITECTURE-SPINE.md` (AD-1 chain end), `EXPERIENCE.md`, `epics.md`, `sprint-status.yaml` (2-4 superseded comment) -- dated 2026-10-21 amendments, bodies not rewritten.

## Tasks & Acceptance

**Execution:**
- [x] `bus.ts`, `post-round-chain.ts` (+tests) -- `round:next` and `routeRoundNext` with the matrix's ignore cases.
- [x] `mini-game-base.ts` -- next-round timer + fade + emit; no free-play invite.
- [x] `Map.ts`, `session-store.ts`, `kart-trip.ts` (+tests) -- restart in place keeping assets; chain end → idle; replay path removed.
- [x] play-again modules, scene, content, validation, voice lines + audio, tokens -- delete.
- [x] `app/README.md`, planning docs, `sprint-status.yaml`, `deferred-work.md` (append the `icon/*` frames and `sprite.icon` to the art-cleanup entry as a new entry) -- amendments.

**Acceptance Criteria:**
- Given any of the six round games, when a round ends, then within ~2.5 s of `round:complete` the next round's prompt plays in the same game with no island or overlay in between.
- Given the app is built, when searching `src/` for `PlayAgain`, `play-again`, `replay`, then nothing remains outside comments about history.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | verif, blind | Map restart wiring (round:next subscription, restartGame, listenShutdown re-arm) has no test | medium | no Map scene harness; pure parts (routeRoundNext, ReleaseArming, MiniGameBase emit) are tested; dropping markRestart or the re-arm passes check | defer |
| 2 | blind, edge | `overlay:close` bus event has no emitter or listener | low | both sides removed with the overlay | patch |
| 3 | edge | non-forced `cam.fadeOut` ignored while a fade runs → no round:next | false | Phaser 4.2.1 Camera.fadeOut calls fadeEffect.start(true, …, force = true) (node_modules/phaser/src/cameras/2d/Camera.js:344): fadeOut is always forced | reject |
| 4 | edge | round:next ignored after the fade leaves the game stuck faded | false | emit only while the guard is free; the only ways to a chain or a non-running game (Home → leave/abandon) end free play first and suppress the emit | reject |
| 5 | edge | previous round's line overlaps the new prompt | false | AudioDirector has one voice channel and `say` cuts the current line; the new round's prompt cuts any tail | reject |
| 6 | edge, blind | fadeOutScene promise/listener left pending when Home stops the scene mid-fade | low | closure is dropped with the scene camera; no user-visible effect; fix adds a SHUTDOWN branch | reject (low, adds code) |
| 7 | edge | stale restart mark if restart emits no SHUTDOWN | false | Phaser `scene.restart` always shuts the scene down (SHUTDOWN) before starting it | reject |
| 8 | edge | build_map.py comment points at deleted content/play-again.ts | low | stale reference | patch |
| 9 | edge, blind | play-again names live on in tokens (`playAgainOverlay.backdrop`, `ui.playAgainIconPx`) and `validatePlayAgainIcons` | low | tokens.generated.ts / DESIGN.md and the icon pipeline are kept by the spec; rename belongs with the art cleanup | defer |
| 10 | blind | PRD amendment says next round "~2 s after the celebration", code and other docs say ~0.5 s + fade | low | text mismatch | patch |
| 11 | blind | tokens test "within ~2.5 s" is trivially true | low | it does check the spec's AC budget (delay + fade after round:complete); weak but not wrong | reject |
| 12 | blind | `ReleaseArming.reset()` has no production caller | low | Map creates a new instance per create | patch |
| 13 | blind | play-again voice files not shown as deleted | false | the diff's "Deleted audio files" section lists all 16 `vo.shell.play-again-*` files removed | reject |
| 14 | blind | session-store "seamless next round" test misnamed | low | it calls clearResume by hand | patch (rename) |
| 15 | blind | free-play hooks (onFreePlay) still run ~0.8 s before the fade | low | intended by the parent's decision (free play effectively dropped); keeping the hook avoids touching every game | reject |
| 16 | blind | no idle exit when the child walks away | false | pre-existing: a round left idle mid-way already repeats hints with no exit; the overlay's auto-close only ever covered the gap after a round | reject (pre-existing) |
| 17 | blind | Story 2-4 left `review` with a superseded comment; epics body unchanged | low | same convention as spec-bo-do-trang-tri (comment, status untouched, dated amendment) | reject |

## Design Notes

Restart via Phaser `scene.restart(data)` from Map (it owns start data): every game already rebuilds its whole round in `create()`/`build()`, so no game changes. `releaseGame` listens to the game's `SHUTDOWN`, which a restart also emits — guard it, or the restarted round loses its atlas.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.

**Manual checks:**
- Dev server: play three ice-cream rounds in a row without touching Home; difficulty rises; Home between rounds → island; Home mid-round → resume ring on the station.
