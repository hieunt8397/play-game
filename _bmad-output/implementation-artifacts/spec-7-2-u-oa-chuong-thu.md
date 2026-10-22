---
title: 'Story 7.2: Ú òa chuồng thú'
type: 'feature'
created: '2026-10-22'
status: 'ready-for-dev'
baseline_commit: 'NO_VCS'
route: 'dispatch'
review_loop_iteration: 0
context: ['../planning-artifacts/epics.md#Story 7.2', 'spec-7-1-tram-nha-xoai-san-nha.md', 'spec-cham-la-noi-tieng-that.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Xoài needs a hide-and-seek game that teaches animal names and their calls (FR54, FR55).

**Approach:** Add a new yard game `animal-pens` (chuồng thú). Four pen doors stand in a row. Each door wiggles now and then, with the muffled call of the animal inside.
- Tapping a door opens it. The animal peeks out, plays its real call, and the voice says its name.
- Tapping an open door again closes it and puts a different animal behind it: random, never the same one twice in a row, and never one that is already showing.
- Now and then the voice asks "Con gì kêu <call> nhỉ?". The door hiding that animal wiggles harder. Any door is fine to tap: there is no right or wrong answer, no score and no fail sound.

Decisions (parent, 2026-10-22):
- Real models (Quaternius), not chibi.
- Pens, fence and props use Tiny Treats / KayKit.

## Boundaries & Constraints

**Always:**
- **Animals:** at least 6 a toddler knows by their call. Preferred set: chó, mèo, gà trống, vịt, bò, heo, cừu, ngựa.
  - Use vendored Quaternius models where they exist (dog, cow, horse, donkey…).
  - Missing ones (cat, chicken, duck, pig, sheep) may come from CC0 Quaternius/Kenney packs on GitHub (corporate firewall: use GitHub mirrors, check the licence file).
  - Whatever cannot be sourced CC0 is left out. At least 6 animals must remain.
  - README provenance for every model.
- **Calls:** real CC0 recordings (Freesound HQ previews, as in spec-cham-la-noi-tieng-that).
  - `npm run audio:normalize`; each ≤ 800 ms.
  - Calls follow NFR10 (high-passed at 150 Hz, no sudden loud sound). The cow and pig get the same treatment, and are dropped if they no longer read.
  - The muffled call while the door wiggles is the same file played quieter through a filter, or a second mastered file.
- **Voice lines** (ElevenLabs, `npm run tts`):
  - the name, e.g. "Con mèo!";
  - the ask, e.g. "Con gì kêu meo meo nhỉ?", once per animal;
  - an invite line.

  The call text in the ask is the Vietnamese onomatopoeia (gâu gâu, meo meo, ò ó o, cạp cạp, ò ò, ụt ịt, be be, hí hí).
- **Round model:** pure and tested (`MiniGameBase` + RoundGuard).
  - A round completes after a set number of reveals (`Tokens.Timing`/content constant, e.g. 8). Then a small celebration (all doors open, the animals bounce), then continuous play (`round:next`).
  - Asks come every N reveals or after M seconds idle (tokens).
  - One wiggle at a time (NFR11).
- **Screen:** a door is ≥ 150 px tall to tap; doors and animals sit inside the interactive rect and clear of HUD zones. A `validateAnimalPens` rule checks this; the `atlas ≤ 2048²` pages rule applies.
- Opened from the yard corner "chuồng thú" (7.1). Home returns to the yard.

**Never:**
- Any right/wrong judging, score, timer or fail sound.
- Two animals of the same kind showing at once.
- Predator roars or loud sounds.
- Chibi animals.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tap closed door | idle | door opens, animal peeks + call, then name line | — |
| Tap open door | animal showing | door closes; next tap shows a different animal | never the same kind twice in a row on that door, never a kind already showing |
| Ask | after N reveals / idle | "Con gì kêu …?"; that door wiggles harder | tap any door → normal reveal, no judging |
| Fast taps | taps during a reveal | first-finger-wins (existing input router); the voice line is not stacked (the latest name wins) | — |
| Round end | reveal count reached | celebration, then the next round | Home during the celebration completes the round (existing base) |
| Resume | abandon mid-round | reopens with the same animals behind doors and the same reveal count | snapshot partial `{ behind: string[]; reveals: number }` |

</frozen-after-approval>

## Code Map

All under `app/`.
- `src/content/types.ts` (`GAME_IDS` + `SnapshotPartials['animal-pens']`), new `src/content/games/animal-pens.ts` (animals, calls, lines, screen requirements, assets), `src/content/games/index.ts`.
- New `src/games/animal-pens/{round.ts, AnimalPens.ts, *.test.ts}`; `src/games/registry.ts`; `src/content/home.ts` wakes the corner.
- New `tools/render/blender/build_animal_pens.py` (plate + door frames closed / wiggle / open, `animal-<id>/peek/00` sprites).
- `src/content/assets.ts`, `src/content/audio-catalog.ts`, `src/content/voice-lines.ts`, `tools/layout/rules.ts`, `src/core/tokens.ts`.
- `app/README.md` provenance (models, recordings).

## Tasks & Acceptance

**Execution:**
- [ ] Source models and recordings (CC0, provenance).
- [ ] Content + round model + tests.
- [ ] Scene and registry; wake the yard corner.
- [ ] Builder, render, atlas; composite check of doors closed and open; iterate.
- [ ] Voice lines (+ tts), audio normalize; `npm run check` and `audio:check`.

**Acceptance Criteria:**
- Given the yard, when "chuồng thú" is tapped, then 4 doors show and wiggle one at a time with muffled calls.
- Given a door, when it is tapped, then an animal peeks out, its call plays and its name is said. A second tap closes the door and changes the animal.
- Given an ask, when it plays, then that animal's door wiggles harder, and any door tap reveals as usual.
- Given `npm run check`, then it exits 0.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run audio:check` -- expected: OK.
