---
title: 'Tiệm kem – Shiba hắt xì, lau mũi và tháp kem'
type: 'feature'
created: '2026-10-20'
status: 'done'
route: 'dispatch'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ice-cream has a single "correct" reaction (the happy lick) and a silent float-back for a different flavour. After the round, free play (5.8) is inert: the scoops are unpickable and nothing new happens. FR6/FR30/FR31/FR32/FR38/FR39 ask for Shiba's comic reactions and a tower game in free play.

**Approach:** New chibi Shiba frames from `build_ice_cream.py`: shiver, sneeze, grimace and nose-cream, plus `hit.shiba-nose`. `REACTIONS` grows to `correct: [lick, shiver, sneeze]` and `choseOther: [taste-grimace]`; the scene plays them. A sneeze sometimes leaves cream on the nose, and a tap on the nose wipes it (Shiba laughs). In free play the round model lets any scoop stack on the cone up to `Tokens.ui.iceCreamTowerMax`. Over that, the tower wobbles, topples onto the counter, and can be rebuilt.

## Boundaries & Constraints

**Always:**
- Round logic stays pure in `round.ts`: free-play stacking and topple positions. The scene only applies commands.
- The "different" choice order is: taste (a lick frame), then grimace, then the scoop floats back, then `hint.wrong()` once (its retry line is the voice reminder). There is never a wrong sound.
- Nose cream: a sneeze leaves cream with chance `Tokens.ui.iceCreamNoseCreamChance`, using the scene's reaction rng (deterministic per seed). While cream is on, the idle frame is `shiba/nose/00`. A tap inside `hit.shiba-nose` wipes it, plays the happy frames + `SFX.happy`, and returns to idle. A tap elsewhere on Shiba keeps the 5.4 bounce. The cream also clears at the next correct reaction.
- Free play: `onFreePlay` makes counter scoops pickable. Any flavour served onto the cone or Shiba stacks with no hint and no voice. A served home scoop respawns at home; a toppled scoop does not. Tower slot n ≥ 3 is extrapolated from `cone-2 − cone-1`. When the tower reaches `iceCreamTowerMax`, it wobbles (`Timing.iceCreamTowerWobbleMs`). Then the tower scoops (the last question's cone scoops included) fall to nudged rest spots on the counter and become draggable counter scoops.
- Free play has no voice. Shiba's correct reactions still play on each stacked scoop.
- Every new number goes in `Tokens`/`Timing`. Missing frames or hits → `console.warn` once, and the old behaviour is used (idle/happy, no nose).
- Frames stay layer-compatible with the Epic 8.2 outfit: the chibi rig is unchanged, and new poses only key existing pivots plus eye/nose-cream scale.

**Decisions (2026-10-20, from the parent):**
- **Grimace:** one shared `shiba/grimace/00` frame for every flavour. The "theo vị" part is the existing per-flavour retry voice line.
- **Sneeze sound:** a new edge-tts voice line `vo.ice-cream.sneeze` with the text "Hắt… xì!", added to `content/voice-lines.ts`, then `npm run content:export && npm run tts`, and loaded with the game's assets. It is Shiba's character sound, so it also plays in free play (the only voice there). If TTS is unavailable at build time, the line's placeholder audio is acceptable and must be reported.
- **Scope:** one story; the parent accepted the length.
- **Counter scoops in free play (2026-10-21, review):** a stacked scoop respawns at its flavour's home only when no other scoop of that flavour is left on the counter (toppled scoops included). This replaces "a served home scoop respawns at home; a toppled scoop does not" and keeps the counter bounded across topples.

**Never:**
- No change to questions, hints, difficulty, resume or the 5.8 base lifecycle.
- No new sound files other than `vo.ice-cream.sneeze`. No praise words.
- Do not regress the 2026-10-16 chibi restyle (other builders keep their output: `key_chibi` new params default to today's pose).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Correct serve | the right flavour on the cone | `celebrate` → picked one of lick/shiver/sneeze, never the same twice in a row | Missing frames for the pick → happy |
| Sneeze leaves cream | sneeze picked, chance hit | idle frame becomes nose-cream; the nose hit is live | No `hit.shiba-nose` → no cream state |
| Nose tap | cream on, tap in nose hit | wipe → happy frames + SFX.happy → idle; no bounce | Tap with no cream → 5.4 bounce |
| Different flavour | wrong scoop on the cone or Shiba | `choseOther` → taste → grimace → float back; `hintWrong` once | No error expected |
| Free-play stack | any scoop served after finish | `stack {id,to}`; home scoop → `respawn`; no hint, no voice | Not finished → the old serve path |
| Tower full | stack count reaches max | `topple {scoops:[{id?,flavour,to}]}` after the wobble; counter scoops added | Rest spots nudged inside `restRect` |
| Free-play other drops | rest/off/home drops after finish | same as during play (rest, return); the scene applies them while `freePlay` | Terminal → ignored |

</frozen-after-approval>

## Code Map

- `app/tools/render/blender/build_ice_cream.py:66-83,262-278` -- `SHIBA_STATES`, `HAPPY_FRAMES` and `build_shiba` keying. Add timeline frames and states for `shiver` (2), `sneeze` (3: wind-up, eyes shut and head back, then the burst forward), `grimace` (1, squint plus tongue) and `nose` (1, idle with a cream blob on the nose). Add a `hit.shiba-nose` polygon around the projected nose part (like `hit.shiba` at :488, a circle hull).
- `app/tools/render/blender/cute.py:170-230` -- `chibi()` parts (`{name}-nose`, `-eye{L,R}`, `-tongue`) and `key_chibi`. Add optional `eyes` ('open'|'shut'|'squint') and `nose_cream` (bool) params, with defaults that reproduce today's keys. Add a hidden cream-blob part on the nose.
- `app/tools/render/build.ts`, `render.ts`, `tools/atlas/pack.ts` -- `npm run art:build ice-cream`, `npm run render ice-cream`, `npm run atlas` (Blender: `BLENDER_BIN="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"`). The current atlas is 705×2048; it must stay ≤ 2048².
- `app/src/content/games/ice-cream.ts:44-71` -- `SHIBA_FRAMES`, `HITS`, `screen.frames/hits` and `REACTIONS`. Add the frames, `HITS.shibaNose` and the reaction ids.
- `app/src/games/ice-cream/round.ts:196-213,280-311` -- `drop`, which currently returns floatBack when `finished`. Add free-play stacking, `stack`/`topple` commands and the tower count. The `finished` check at :200 becomes the free-play branch.
- `app/src/games/ice-cream/IceCream.ts:108-113,224-280,389-499` -- the Shiba react hook, `playCorrect`/`playChoseOther`/`celebrate`, and `applyAll` (gated on `inert`). In free play, let round commands through when `freePlay` is set (this closes the 5.8 deferred "stranded drag" for ice-cream), and override `onFreePlay`.
- `app/src/core/tokens*` / `tools/tokens` -- `iceCreamTowerMax` (8), `iceCreamNoseCreamChance`, `Timing.iceCreamTowerWobbleMs`, `iceCreamTasteMs` and `iceCreamShiverMs`. These are generated tokens: edit the token source, then run `npm run tokens`.
- `app/src/games/ice-cream/round.test.ts` -- the harness (`setup`, `answer`, `serve`, `ON_CONE`) and the 5.8 free-play test, which must be replaced by the stacking behaviour.

## Tasks & Acceptance

**Execution:**
- [x] `app/tools/render/blender/cute.py`, `build_ice_cream.py` -- new poses, the nose-cream part and `hit.shiba-nose`; then rebuild, render and atlas ice-cream -- art per AC1.
- [x] Token source -- the new tokens, regenerated -- no magic numbers.
- [x] `app/src/content/games/ice-cream.ts` -- frames, hit and REACTIONS -- content contract (validate:content).
- [x] `app/src/content/voice-lines.ts` -- `vo.ice-cream.sneeze` "Hắt… xì!", then `npm run content:export && npm run tts` (audio under `public/assets/audio/vo/`, precached) -- the sneeze sound.
- [x] `app/src/games/ice-cream/round.ts` (+test) -- free-play stack/topple/respawn, choseOther unchanged; tests for every matrix row that is in the model -- pure logic.
- [x] `app/src/games/ice-cream/IceCream.ts` -- reaction playback (lick/shiver/sneeze/taste-grimace), nose-cream state and nose tap, `onFreePlay`, free-play command gate, tower wobble/topple tweens (reduced motion: no wobble, a fade drop) -- scene.
- [x] `app/src/games/registry.test.ts` or a scene-free helper test -- the nose-cream chance and the cleared-on-next-correct rule, if they live in a pure helper -- coverage.

**Acceptance Criteria:**
- Given `npm run art:build ice-cream && npm run render ice-cream && npm run atlas`, then the atlas holds the new Shiba frames and the layout has `hit.shiba-nose`, with each page ≤ 2048².
- Given a round, when the child serves right several times, then Shiba visibly varies lick/shiver/sneeze, and sometimes cream stays on the nose until tapped.
- Given free play, when the child stacks 8 scoops, then the tower wobbles, falls onto the counter, and the fallen scoops can be stacked again.
- Given `npm run check`, then it exits 0.

## Implementation Notes

- `topple` entries carry a required `id` (the snapped scoop id, or a fresh one for a scoop restored on resume): every fallen scoop is a counter scoop with a known id. The scene pairs them with its tower views by cone order.
- The model only knows when free play starts through `beginFreePlay()` (scene onFreePlay); between the last scoop and that call every drop still floats back. `toppled()` (scene, after the wobble) re-enables stacking; serves float back meanwhile.
- The nose-cream rule lives in `games/ice-cream/reactions.ts` (tested); `MiniGameBase.reactionRoll()` draws from the same seeded rng as the picker.
- `hit.shiba-nose` is a 30 px ring in the builder; to-layout pads it by spacing.hitPad (≈ 54 px radius on screen).
- `vo.ice-cream.sneeze` was rendered by edge-tts (real audio, not a placeholder).
- `DEG_TO_RAD` added to core/motion (games may not hold the 180 literal).

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | Deferred `hint.wrong()` fires after a correct serve moved the step on | medium | patch | HintMachine.wrong only checks an open question, so a stepDone in a multi-scoop question took the stale wrong. Fixed with a step key in pure helpers (reactions.ts) plus tests. |
| 2 | hintWrong↔taste pairing untested | medium | patch | Same root cause as #1; the pairing moved into `pairHintWrong` and was tested. |
| 3 | Sneeze `audio.say` cuts a step prompt or retry line | medium | patch | One voice channel, and a new say cuts the current line. Now said only when `!audio.voiceBusy`. |
| 4 | Counter scoops grow without bound across topples | medium | patch (intent renegotiated) | Home respawn on every stack plus toppled scoops staying. The parent chose "respawn only when that flavour is gone from the counter" (Decisions); a test shows it stays bounded. |
| 5 | Snap tween can setScale a destroyed image | low | patch | `killTweensOf` before destroy. |
| 6 | `reactionRoll` determinism untested | low | patch | TestGame `roll()` plus an interleaved same-seed test. |
| 7 | `DropOutcome ='serve'` formatting | low | patch | Space added. |
| 8 | Free-play scene wiring (applyAll gate, onFreePlay, stack/topple apply) untested | medium | defer | No Phaser scene harness (registry.test.ts:54); same as the 5.8 deferral. Covered by the manual check. |
| 9 | Tower 8 high covers Shiba's face; topple counts the last question's cone scoops | false | reject | The frozen intent includes the cone scoops in the tower. Slot 7 sits at y≈68 at centre x, outside the corner HUD exclusions. |
| 10 | Interrupted reaction (`stop()`) skips its onDone (cream or line lost) | low | reject | Only on rapid free-play stacks; the next reaction resets the pose. The fix adds state. |
| 11 | Nose tap also triggers the 5.4 bounce | false | reject | 5.4 reactions run only for taps no target consumed (touch router target-first). |
| 12 | Nose tap during a skip both skips and wipes | low | reject | Needs a new protected accessor on the base. Rare and harmless (the wipe is a happy reaction). |
| 13 | Shiver and topple reuse existing SFX; no wobble sound | false | reject | Intent: no new sounds besides the sneeze line. |
| 14 | Topple batch also plays `celebrate`; the stacked scoop's snap is cut by the wobble | low | reject | Cosmetic, and the comment documents it. |
| 15 | Wrong scoop sits on the cone during the taste wait | false | reject | Intended order: taste → grimace → float back. A re-grab is handled. |
| 16 | Round registers toppled scoops before their views land | low | reject | A 900 ms window; serves float back while toppling, by design. |
| 17 | Missing grimace frame drops the whole choseOther reaction | low | reject | The frames exist; the fallback path only matters for missing assets. |
| 18 | Topple spots overlap when spread exceeds restRect | low | reject | `nudgeApart` clamps; at most 8 spots on a wide counter. |
| 19 | `playChoseOther` without a view still picks a reaction | low | reject | Harmless rng draw; the view always exists for a served scoop. |
| 20 | `hit.shiba` polygon regenerated with shifts | low | reject | Rebuilt from the same idle pose; a hull a few px larger is harmless. |
| 21 | Sneeze VO not approved by listening | false | reject | Process: the parent listens during the manual check. |
| 22 | `DEG_TO_RAD` in core/motion | low | reject | Style only; lint forbids the literal in games. |

## Design Notes

- Reactions map ids to scene routines with a `switch` that ends in an exhaustive `never` check, so an id added to `REACTIONS` without a case fails typecheck (from the 5.8 review).
- Topple targets come from the model (`nudgeApart` within `restRect`), so tests can pin them. The scene only animates the fall (`Back.easeIn` drop plus a small bounce).

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.

**Manual checks (if no CLI):**
- `npm run dev`: serve right repeatedly and watch the reaction variety and the nose wipe. Serve wrong and watch the taste and grimace. Finish, then build the tower to the topple and rebuild it.
