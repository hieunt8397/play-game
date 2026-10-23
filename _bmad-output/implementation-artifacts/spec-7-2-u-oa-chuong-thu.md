---
title: 'Story 7.2: Ú òa chuồng thú'
type: 'feature'
created: '2026-10-22'
status: 'done'
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
- [x] Source models and recordings (CC0, provenance).
- [x] Content + round model + tests.
- [x] Scene and registry; wake the yard corner.
- [x] Builder, render, atlas; composite check of doors closed and open; iterate.
- [x] Voice lines (+ tts), audio normalize; `npm run check` and `audio:check`.

**Acceptance Criteria:**
- Given the yard, when "chuồng thú" is tapped, then 4 doors show and wiggle one at a time with muffled calls.
- Given a door, when it is tapped, then an animal peeks out, its call plays and its name is said. A second tap closes the door and changes the animal.
- Given an ask, when it plays, then that animal's door wiggles harder, and any door tap reveals as usual.
- Given `npm run check`, then it exits 0.

## Implementation Notes

2026-10-22/23 (dev). Baseline copied to `_backup/2026-10-22-truoc-7-2/` (app/src, app/tools, README, package.json, eslint.config.js, this spec).

**Animals (7; the duck is left out).**
- dog = Quaternius `animals/ShibaInu.fbx`, cow = `Cow.fbx`, horse = `Horse.fbx` (vendored).
- pig, sheep = Quaternius Farm Animal Pack (real low-poly), vendored to `assets/quaternius/farm/{Pig,Sheep}.glb`.
- cat, rooster = Quaternius Cube World Kit, vendored to `assets/quaternius/cubeworld/{Cat,Chicken}.glb`. They are blocky (voxel-like), not chibi (no big head or eyes), and read clearly as a grey cat with whiskers and a white chicken with a red comb. They are the only CC0 cat and chicken found; **the parent should confirm them** (dropping both still leaves 5, below the spec's 6, so a sixth would be needed, e.g. the donkey).
- duck: no CC0 duck model in either style was found (only rubber ducks), so it is dropped and has no lines or sounds.
- Source: the four new models come from Quaternius' own uploads on Poly Pizza (poly.pizza is reachable through the firewall; static.poly.pizza serves the `.glb`). Each page shows "CC0 1.0", and quaternius.com lists both packs as CC0. `SOURCE.txt` in each folder and the README record the URLs. GitHub search turned up no mirror of these packs, only of the Ultimate Animated Animals pack already vendored. Downloads were kept in `assets/_dl/polypizza-2026-10-22/` and `assets/_dl/freesound-animal-pens-2026-10-22/`; nothing from them was executed.

**Calls.** 7 real Freesound CC0 recordings (README table: ids, authors, edits).
- Calls longer than 0.8 s (rooster, cow, sheep, horse; the dog slightly) are sped up with `atempo` (pitch kept), not cut, so the whole call shape stays.
- Every call goes through a 4× high-pass at 200–300 Hz, `audio:normalize`, then a peak of −19.5 dBFS. All are `creature: true`; `audio:check` measures them (≤ 0.77 s; < 150 Hz at −52 dBFS for the cow, ≤ −68 dBFS for the rest).
- The cow and the pig keep their 200–700 Hz body, so they are judged to still read. They are flagged for the parent to listen to.
- Muffled: a second file per animal (`.muffled`, lowpassed at 900 Hz ×2, peak −30 dBFS), also creature-checked.
- `make-placeholders › isRecording` covers `sfx.animal-pens.*`.

**Ids and content.**
- `content/types` splits `ISLAND_GAME_IDS` (the 7 with a Map station) from `YARD_GAME_IDS = ['animal-pens']`. `GAME_IDS` is both, and `isIslandGameId` is new.
- These now use the island list: stations (`StationId`, `STATION_IDS`, `GAME_STATIONS`), `DECORATIONS`, and the station and decoration checks (render, atlas, validate-content, build.ts decoration models).
- Map got two minimal guards: kart stops are only for island games, and `enterGame` returns for a yard game.
- `SnapshotPartials['animal-pens'] = { behind, reveals }`.
- `content/games/animal-pens.ts` holds the animals (call, call/muffled sfx, name and ask lines), `DOOR_IDS`, `REVEALS_PER_ROUND = 8`, the screen requirements and the assets.
- Also updated:
  - `PARENT_INVITE_LINES` (`vo.animal-pens.parent.1`);
  - `eslint.config.js › LINT_GAME_IDS`;
  - the assets, layouts and audio catalogue.

**Round model** (`games/animal-pens/round.ts`, pure, 21 tests).
- Reveal: open, then the call at once and the name after `animalPensNameDelayMs` (800). A newer reveal replaces a waiting name, and `say` cuts the current line, so the latest name wins.
- Close: the door gets an animal that is behind no door, so never the one it had and never a duplicate.
- Wiggle: after `animalPensIdleWiggleMs` (5 s) of quiet, one closed door wiggles with its muffled call (never the same door twice running). Only one wiggle runs at a time.
- Ask: every `ui.animalPensAskEvery` (3) reveals once the name has ended, or after `animalPensAskIdleMs` (15 s) idle. It goes to a closed door, which wiggles hard (and keeps being the one that wiggles) until any tap.
- Round end: the 8th name, then `animalPensCelebrateLeadMs` later every door opens and the animals hop, and `scheduleFinish(animalPensCelebrateMs)` follows. Continuous play comes from the base.
- Resume: same animals behind closed doors, same reveal count (`resumePens` validates).
- The scene says `vo.animal-pens.prompt` ("Xoài ơi, ai trốn trong chuồng nhỉ?", its Speaker prompt) and offers the parent invitation once the voice is quiet.

**Scene** (`AnimalPens.ts`).
- Each door gets one door image and one animal image.
- Every frame is rendered at door 1 (orthographic camera) and drawn at door n, shifted by `anchor.door-n − anchor.door-1`, on its bottom-centre pivot.
- Door motions:
  - door swing: a squash, then the frame swap;
  - animal reveal: grows from 0.8 on its feet (a fade under reduced motion);
  - wiggle: rocks on the bottom centre (4°, or 9° when asked);
  - celebration: hop and `sfx.shell.happy`.
- Registering it in `games/registry` wakes the yard pen corner (no edit to home.ts, HomeYard.ts or shell-nav).

**Art** (`build_animal_pens.py`).
- A red barn front with 4 pens: dark insides, straw, hay bales, and no shadows from the roof or insides so the animals are lit.
- A double barn door with Z-braces on both faces; open = leaves swung 115° out on their outer hinges.
- Animals stand in the pen turned −25° from facing the camera, with their head (the front 25 % of the body) at the door centre. They are holdout sprites, so the barn wall cuts them.
- The doors are 150×204 px; the hulls are padded ≥ 24 px apart.
- Iterations:
  - the ortho camera saw the lawn as "sky", so the lawn now ends at y 11;
  - the cow's hindquarters showed past the barn's left edge, so the animals now turn toward +x into the wall between pens;
  - the doors were too close, so the door pitch went from 2.25 to 2.3 m and the width from 1.56 to 1.5 m;
  - the open leaf left the interactive rect, so the single leaf became a double door.
- New rule `validateAnimalPens` (render, atlas, validate:content; 5 tests): door hulls (width, rect, Hud, gaps), doors on one row left to right, closed door ≥ 150 px tall, every door and peek frame at every door inside the rect and clear of the Hud zones.

**Voice.** 17 lines rendered with `npm run tts`, not yet approved: the prompt, 7 names, 7 asks ("Con gì kêu | gâu gâu nhỉ?"…) and the parent line. `review` is set on `name.pig` (heo/lợn), `ask.rooster` and `ask.cow` (onomatopoeia reading).

**Tests updated for the island/yard split**: rules, resume marks, registry (scene list, awake = registered island games), check-sfx creature list, render params (art.animalPens), home (the pen is awake), validate-content good tree (pen atlas, bg, layout), snapshot partials.

**Checks (2026-10-23).** `npm run check` exits 0 (1812 tests; validate:content: 8 game ids, 10 layouts, 8 stations). `npm run audio:check` OK (22 creature sounds).

**Deferred.**
- Not played in a browser or on the iPad in this session (the controller is unit-tested; the scene is not).
- The parent should listen to the 7 calls (the tempo-up rooster, cow, sheep and horse especially) and confirm the blocky cat and rooster.
- The pig's source colour is a muted pink.

**Review patches (2026-10-23).**
1. The last reveal calls the new `onLastReveal` port at once. The scene's `markFinishing()` makes Home complete the round during the ~2.1 s before `scheduleFinish`, so a `reveals: 8` snapshot is never abandoned. Taps are ignored from then on.
2. The ask's hard wiggle and its muffled call wait for the ask line's `speech:ended`, so they never play under the ask line.
3. `progress()` keeps `questionIndex` at 0 with the reveals in the partial, so the base's empty tally matches and resume is warning-free. `resumePens` requires `questionIndex === 0`.
4. Closing a door drops its waiting name.
5. One wiggle at a time is tracked: `wiggleLeft` comes from `animalPensWiggleMs` / `animalPensAskWiggleMs`. No wiggle starts while one runs, and a due hard wiggle waits.
6. On shutdown the scene clears only its own last prompt (`clearPrompt(id)`).
7. Each Freesound page used is saved under `assets/_dl/freesound-animal-pens-2026-10-22/pages/`, with `SOURCES.txt` mapping file → shipped id → sound, plus the CC0 parent sounds:
   - #352698 "Angry Pig Oinking" by Jofae (pig);
   - #149024 "Horse_Whinny.wav" by foxen10 (horse).

   Both parents are CC0 1.0.
8. `tools/audio/make-placeholders.ts` is restored to CRLF with only the 2-line change. `tools/render/build.ts` is restored to CRLF as well.

Tests: round.test.ts has 26 tests, adding the last reveal, close-drops-name, hard wiggle after the ask line, no-overlap wiggles and a snapshot round trip with no warning.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | edge | Home in the ~2.1 s gap after the 8th reveal abandons a finished round; resume rejects reveals 8 | medium | round.ts, AnimalPens.ts, mini-game-base.ts | patch (onLastReveal → markFinishing + test) |
| 2 | edge | hard wiggle's muffled call masked by the ask line | low-med | round.ts ask() | patch (after speech:ended + test) |
| 3 | blind | resume logs "invalid tally" (questionIndex = reveals, tally 0) | low | round.ts progress() | patch (questionIndex 0, reveals in partial) |
| 4 | edge | closing a door during the name delay still names the hidden animal | low | round.ts pending | patch |
| 5 | edge | one-wiggle-at-a-time held only by timing | low | round.ts | patch (wiggle-until tracking + test) |
| 6 | blind | clearPrompt() without id clears any prompt | low | AnimalPens.ts shutdown | patch (clearPrompt(id)) |
| 7 | provenance | Freesound CC0 checks not archived; remix parents unverified | low | README table | patch (pages saved, both parents CC0; note: assets/_dl is gitignored) |
| 8 | blind | make-placeholders.ts / build.ts lost CRLF | low | backup diff | patch (restored) |
| 9 | verif | AnimalPens scene untested and not run in a browser | medium | AnimalPens.ts | defer (parent plays on iPad; scene-harness gap) |
| 10 | art | three model styles (blocky cat/rooster, faceted pig/sheep, smooth dog/cow/horse) | low | composites | defer (parent to confirm) |
| 11 | edge | idle ask/wiggle repeat without a cap while the child is away | low | timing | defer |
| 12 | edge | open/close mashing ends a round fast; stacked calls | low | round.ts | defer |
| 13 | blind | reduced-motion amplitude helper, island/yard split, swap rule, audio:check | false | verified | reject |

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run audio:check` -- expected: OK.
