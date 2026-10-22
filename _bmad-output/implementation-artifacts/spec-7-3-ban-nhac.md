---
title: 'Story 7.3: Ban nhạc'
type: 'feature'
created: '2026-10-22'
status: 'ready-for-dev'
baseline_commit: 'NO_VCS'
route: 'dispatch'
review_loop_iteration: 0
context: ['../planning-artifacts/epics.md#Story 7.3', 'spec-7-1-tram-nha-xoai-san-nha.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Xoài needs a music game that she and her parents can play together (FR58, FR59).

**Approach:** Add a new yard game `band` (sân khấu) with 5 instruments on a small stage: trống (drum), đàn gõ (xylophone), kèn (horn), chuông (bell), and one animal singer (chim or ếch).
- Each tap plays the instrument's next note from one shared pentatonic scale, so any mix of taps sounds nice. The instrument bounces.
- Several fingers can play several instruments at once. This is the only exception to first-finger-wins, and it applies only inside this game.
- When nobody taps for a while, a soft self-made beat starts and the instruments bob to it as an invitation. A tap close to the beat gives a small sparkle; nothing is scored.
- No songs, ever.

## Boundaries & Constraints

**Always:**
- **Sounds** are synthesised by our own tools (`tools/audio`, like the placeholder recipes), not recordings and not songs.
  - The scale is C-major pentatonic (C D E G A) over about 2 octaves. Each instrument has its own timbre and register: drum (pitched tom, low notes), xylophone, horn, bell, and the singer (a bird chirp or frog croak, pitched).
  - Each tap cycles that instrument through a short ascending/descending note pattern.
  - Notes ≤ 800 ms with a fade-in ≥ 50 ms, nothing below 150 Hz, never louder than the voice (NFR10).
  - The beat is a soft drum or clap loop at ≤ −30 LUFS that ducks under voice lines (NFR10).
- **Multi-touch:** each active pointer may start one instrument note. This needs a scene-local opt-out from the input router's first-finger-wins, tested. Every other game keeps first-finger-wins.
- **Round model:** pure and tested. The band has no end and no score.
  - It starts in free play: Home leaves to the yard with `round:leave`. There is no resume snapshot, or a trivial one.
  - The idle beat starts after `Tokens.Timing` idle ms and stops on the first tap after N beats with no input.
  - Bobbing is gentle, and only one prominent motion runs at a time (NFR11; reduced motion → no bob, the beat sound only).
- **Art:** instruments are script-built in the cute style (`cute.py` soft shapes); this is fine for objects. The singer is a real CC0 model if a bird or frog can be sourced (GitHub mirrors), otherwise a script-built bird.
  - The stage uses Tiny Treats / KayKit props.
  - Each instrument is ≥ 150 px, inside the interactive rect and clear of HUD zones. A `validateBand` rule checks this.
- **Voice lines** (ElevenLabs, `npm run tts`): one invite ("Xoài ơi, mình chơi nhạc nào!") and one short name per instrument for the parent label only (not spoken on tap; taps play music).
- Opened from the yard corner "sân khấu" (7.1). Home returns to the yard.

**Never:**
- Songs or melodies from existing music.
- Wrong notes or dissonance (only the scale).
- Scoring, fail sounds, a flashing beat (≤ 1 Hz visual pulses).
- Multi-touch leaking to other scenes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tap instrument | any | next note of its pattern + bounce | — |
| Two fingers | two instruments at once | both play | a third finger works too (cap ≈ 5 simultaneous voices; the oldest note is cut) |
| Rapid taps | one instrument | each tap retriggers the next note (no queue build-up) | — |
| Idle | no tap for idle ms | soft beat, instruments bob | voice line → beat ducks |
| Tap near beat | within ± window ms | small sparkle (no score) | — |
| Home | any time | back to the yard; the beat and all notes stop | — |
| Reduced motion | preference set | no bob or sparkle drift; sound unchanged | — |

</frozen-after-approval>

## Code Map

All under `app/`.
- `src/content/types.ts` (`GAME_IDS`, snapshot partial), new `src/content/games/band.ts` (instruments, scale, note patterns, screen, assets), `src/content/games/index.ts`.
- New `src/games/band/{round.ts, Band.ts, *.test.ts}`; `src/games/registry.ts`; `src/content/home.ts` wakes the corner.
- `src/core/input/*` (the first-finger-wins router): a scoped multi-pointer mode for one scene + tests.
- `src/core/audio/*`: the beat loop and ducking (reuse the existing voice ducking if present).
- `tools/audio/make-placeholders.ts` or a new `tools/audio/make-band.ts`: synthesised note files (`sfx.band.<instrument>.<note>`) and the beat loop; `audio-catalog.ts`; `npm run audio:check`.
- New `tools/render/blender/build_band.py`; `assets.ts`; `tools/layout/rules.ts`; `tokens.ts`.

## Tasks & Acceptance

**Execution:**
- [ ] Synthesise the notes and beat; listen-check through ffmpeg analysis (loudness, spectrum ≥ 150 Hz).
- [ ] Content + round model + multi-pointer input + tests.
- [ ] Scene, registry, wake the corner; the beat with ducking.
- [ ] Builder, render, atlas; composite check; iterate.
- [ ] Voice lines (+ tts); `npm run check`, `audio:check`.

**Acceptance Criteria:**
- Given the stage, when any instrument is tapped, then it plays a scale note and bounces. Two fingers on two instruments play both.
- Given no taps for a while, then a soft beat starts, the instruments bob, and a tap on the beat shows a sparkle.
- Given any other game, then first-finger-wins is unchanged.
- Given `npm run check`, then it exits 0.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run audio:check` -- expected: OK.
