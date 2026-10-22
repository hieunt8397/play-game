---
title: 'Story 7.4: Giờ đi ngủ'
type: 'feature'
created: '2026-10-22'
status: 'ready-for-dev'
baseline_commit: 'NO_VCS'
route: 'dispatch'
review_loop_iteration: 0
context: ['../planning-artifacts/epics.md#Story 7.4', 'spec-7-1-tram-nha-xoai-san-nha.md', 'spec-choi-lien-mach.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A calm game to play before real bedtime (FR62, FR63).

**Approach:** Add a new yard game `bedtime` (giường ngủ). A cosy bedroom has the Shiba friend sitting on its bed. Xoài does three things by tapping, in any order:
1. **Toothbrush:** the brush scrubs, white foam bubbles appear, and Shiba giggles.
2. **Lamp:** the lamp clicks off and the room dims to a soft blue night. It is never dark.
3. **Blanket:** the blanket covers Shiba, who yawns and falls asleep with soft "khò khò" and floating "z".

A gentle glow suggests the next step, but the order is never enforced. When all three are done:
- a soft self-made lullaby plays;
- little stars fade in at the window;
- the scene stays quiet.

Tapping Shiba then makes it roll over in its sleep. Home returns to the yard.

Decision (orchestrator, consistent with the parent's "real models" choice): the friend is the vendored Quaternius Shiba Inu (ShibaInu.fbx, the dog in Tìm bóng), posed for sit, brush, yawn, sleep and roll.

## Boundaries & Constraints

**Always:**
- **Calm pace:** slow tweens (≥ 600 ms), soft voice lines:
  - "Mình đánh răng cho bạn nào!"
  - "Tắt đèn đi ngủ thôi."
  - "Đắp chăn cho bạn nhé."
  - "Chúc bạn ngủ ngon!"

  Rendered with ElevenLabs (`npm run tts`), with a softer style tag than `[cheerfully]` if the recipe allows a per-line style (e.g. `[softly]`; the line hash already includes the style).
- **The night state is a tint/overlay over the same plate**, not a black screen: average luminance stays ≥ 35% of the day plate. The change is a slow fade (≥ 1.5 s), never a flash (NFR11; reduced motion → crossfade only).
- **Lullaby:** synthesised by our own tools (pentatonic, slow, music-box timbre, about 20–30 s, looped softly), ≤ −30 LUFS, ducking under voice lines (NFR10). It is not an existing song.
- **No continuous-play restart here.** The ending stays on screen as the destination; it is a bedtime game. This game opts out of the automatic `round:next` (a per-game flag in MiniGameBase, tested; other games unchanged). Home in the night state leaves to the yard with `round:leave`.
- **Round model:** pure and tested; the 3 steps are idempotent (a second tap on a done step gives a small reaction, not a redo); suggested-step order brush → lamp → blanket.
- **Art:**
  - The bedroom is built in a new `build_bedtime.py`: KayKit Furniture (bed_single, lamp_table, rug, shelf, picture frames), Tiny Treats Bubbly Bathroom for the toothbrush if present (otherwise script-built), and a window with a night sky.
  - Sprites: Shiba poses, brush, foam, blanket on/off, lamp on/off, star and "z" particles.
  - The tap targets (brush, lamp, blanket, Shiba) are each ≥ 150 px, inside the interactive rect and clear of HUD zones. A `validateBedtime` rule checks this.
- Opened from the yard corner "giường ngủ" (7.1).

**Never:**
- A fully dark screen, flashing, or fast motion.
- Any judging or a fail sound when steps are out of order.
- Loud sounds.
- An existing lullaby melody.
- Chibi animals.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Brush first | start | foam + giggle; glow moves to the lamp | — |
| Blanket first | start | Shiba lies down covered and yawns but stays awake-ish until the lamp is off; glow suggests the remaining steps | any order completes |
| Repeat a step | step done | small reaction (foam puff, lamp wiggle) | no state change |
| All 3 done | any order | night fade, lullaby, stars, Shiba asleep; round completes, no restart | — |
| Tap Shiba asleep | night | rolls over, soft sigh | — |
| Home | any time | back to the yard; the lullaby fades out | — |
| Resume | abandon mid-steps | same steps done | snapshot partial `{ done: string[] }` |

</frozen-after-approval>

## Code Map

All under `app/`.
- `src/content/types.ts` (`GAME_IDS`, `SnapshotPartials.bedtime`), new `src/content/games/bedtime.ts`, `src/content/games/index.ts`.
- New `src/games/bedtime/{round.ts, Bedtime.ts, *.test.ts}`; `src/games/registry.ts`; `src/content/home.ts` wakes the corner.
- `src/games/mini-game-base.ts`: a per-game opt-out of the seamless `round:next` (+ test).
- `tools/audio/*`: synthesised lullaby (and reuse of the band synth from 7.3 if it fits); `audio-catalog.ts`.
- `src/content/voice-lines.ts` (per-line style if supported) + `tools/tts/generate.ts` if a style override is needed.
- New `tools/render/blender/build_bedtime.py`; `assets.ts`; `tools/layout/rules.ts`; `tokens.ts` (night tint colour, durations).

## Tasks & Acceptance

**Execution:**
- [ ] Content + round model + base opt-out + tests.
- [ ] Builder (room, Shiba poses, props), render, atlas; composite day and night; iterate.
- [ ] Lullaby synth; voice lines (+ tts).
- [ ] Scene, registry, wake the corner; `npm run check`, `audio:check`.

**Acceptance Criteria:**
- Given the bedroom, when brush, lamp and blanket are tapped in any order, then each reacts. After the third, the room fades to a soft night with a lullaby and stars, and Shiba sleeps.
- Given the night, when Shiba is tapped, then it rolls over. No new round starts on its own.
- Given `npm run check`, then it exits 0.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run audio:check` -- expected: OK.
