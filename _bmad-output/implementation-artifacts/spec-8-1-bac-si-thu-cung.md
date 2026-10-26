---
title: 'Story 8.1: Bác sĩ thú cưng'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_commit: 'f41b47e397b7a8909f1d72db153f1072e4b70d45'
baseline_tree: 'ab3eed65cfab6a33292655d7c26e33fb09e90ac0' # working-tree snapshot before 8.1 (Epic 7 is uncommitted); review diffs against this tree
route: 'dispatch'
review_loop_iteration: 0
context: ['../planning-artifacts/epics.md#Story 8.1', 'epic-8-context.md', 'spec-7-2-u-oa-chuong-thu.md', 'spec-7-4-gio-di-ngu.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Xoài needs a caring game where she sees that she can help a friend (FR56, FR57), using the shared tap-then-tap (FR29) and the funny reaction when she picks something else (FR30).

**Approach:** Add a new yard game `pet-clinic` (phòng khám). An animal walks in with 1–2 visible problems:
- mud splats → shower;
- a rumbling tummy → milk bottle;
- a scrape → plaster;
- yawning → blanket.

Xoài drags a tool onto the animal, or taps the tool and then the animal. Each fix clears its problem with its own reaction: a giggle under the shower, a burp after the milk, a pat on the plaster, a short nap under the blanket. A tool that doesn't fit makes the animal tilt its head in a funny way, and a short voice line repeats what it needs. Once well, the animal thanks her, hops and leaves, and the next one walks in.

Decisions (parent, 2026-10-26):
- **Patients are the real low-poly models** from `animal-pens`, not chibi: Quaternius CC0 dog, cow, horse, pig and sheep, plus the Poly by Google CC-BY 3.0 cat and rooster (attribution stays in the README and `public/CREDITS.txt`). The parent rejected chibi animals as unrecognisable.
- The pig is "lợn", never "heo".
- The game id is `pet-clinic`. Registering it wakes the yard's `clinic` corner (7.1).
- Voice is ElevenLabs Thắm via `npm run tts`. A per-line style (e.g. `[softly]` for the blanket line) is allowed, as in bedtime.
- **All 7 pen animals visit the clinic** (dog, cat, pig, sheep, rooster, cow, horse); the cow and horse are drawn at clinic size, like the dog.

## Boundaries & Constraints

**Always:**
- **Round model:** pure and tested (`MiniGameBase` + RoundGuard).
  - A round is `Tokens` N patients (3). Each patient is a different animal from a shuffled bag, with no repeat across the round boundary, and has 1–2 distinct problems.
  - Problems can be fixed in any order.
  - After the last patient leaves: `scheduleFinish`, then continuous play (`round:next`), as in animal-pens.
- **FR30, a different tool:** `pickReaction('choseOther')` (the head tilt plus one comic variant), then the problem's short need line. The tool floats back to the tray (the ice-cream precedent). There is no fail sound, no red, and the voice never says "sai".
- **Correct fix:** the problem's own reaction plus one of ≥ 3 `correct` flourishes (hop, wiggle, sparkle…), never the same twice in a row (`core/reactions.ts`).
- **Input (FR29):** `createDraggable` with `onSelect`, and a `createDropTarget` over the patient. A tool released away from the patient stays where it was released and does not snap back. A tool used on the patient goes back to the tray. Tapping the patient gets a small reaction and its call.
- **Sizes and placement:**
  - each tool is drawn ≥ 90 px, with a hit area ≥ 80 px and gaps ≥ 24 px;
  - the patient and tools sit inside the interactive rect, clear of the HUD;
  - a `validatePetClinic` rule checks this.
- **Audio:**
  - reuse `sfx.animal-pens.<id>` calls (on arrival and when the patient is tapped);
  - new sounds (gurgle, burp, splash, plaster pat) are ≤ 0.8 s, high-passed at 150 Hz and `creature` where they come from the animal;
  - `audio:check` must pass.
- **Voice lines:**
  - the prompt, which names Xoài;
  - 4 need lines, also used as the reminders;
  - a thank-you line;
  - a parent invite, at most once per round.

  The animal's name on arrival reuses `vo.animal-pens.name.<id>`. Lines are short (2–4 s). There is no praise.
- **Calm pacing:** a walk-in or walk-out longer than 1.5 s can be skipped with a tap. One prominent motion at a time. `prefers-reduced-motion` is respected.
- **Home** returns to the yard.

**Never:**
- Chibi animals, or "heo".
- Judging, a score, a timer, a fail sound or red feedback.
- Edits to the yard or navigation code (`home.ts`, `HomeYard.ts`, shell-nav) beyond what registration wakes.
- Touching the `animal-pens` gameplay or its art output.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Arrival | new patient | walks in, call + name, then the first need line | tap skips the walk |
| Right tool | drag or tap-then-tap onto patient | problem overlay clears with its reaction + one correct flourish; tool returns to tray | taps ignored while the reaction runs |
| Other tool | tool fits no remaining problem | choseOther tilt, need line again, tool floats back | no state change |
| Released mid-drag | finger up off the patient | tool stays there | — |
| All fixed | last problem cleared | thank line, hop, walks out; the next patient walks in | Home during the exit completes the patient |
| Round end | N patients done | `scheduleFinish` → `round:next` | Home while finishing completes (base) |
| Resume | abandon mid-patient | same patient, same problems left, same count | partial `{ patient, left, seen }`; invalid → fresh start |

</frozen-after-approval>

## Code Map

All under `app/`.
- `src/content/types.ts` -- add `pet-clinic` to `YARD_GAME_IDS` and `SnapshotPartials['pet-clinic']`. `eslint.config.js › LINT_GAME_IDS`.
- `src/content/home.ts` -- the `clinic` corner already points to `pet-clinic`. Do not edit it; `home.test.ts` expects the clinic to be awake.
- New `src/content/games/pet-clinic.ts` (+ `index.ts`):
  - `PROBLEM_IDS`, `TOOL_IDS`, the problem → tool map, `PATIENT_IDS`;
  - `REACTIONS: ReactionSet` (the `ice-cream.ts` pattern);
  - the lines, the screen requirements and the assets.
- New `src/games/pet-clinic/{round.ts, PetClinic.ts, round.test.ts, PetClinic.test.ts}`. Mirror the ports and audio interface of `games/animal-pens/round.ts` and `games/bedtime/round.ts`, and the scene structure of `AnimalPens.ts`: the door/anchor offset rendering and `markFinishing` on the last patient.
- `src/games/registry.ts` (+ `registry.test.ts`) -- register the scene.
- `src/games/mini-game-base.ts` -- reuse it unchanged: `pickReaction`, `reactionSet`, `scheduleFinish`/`markFinishing`, `skippable`, `inviteParent`, `attachReactions`.
- `src/core/input/drag-controller.ts`, `drop.ts` -- reuse unchanged. `games/ice-cream/IceCream.ts` (`createDraggable({…onSelect})`, the choseOther float-back) is the model.
- `src/core/reactions.ts` -- reuse it as is.
- `src/content/{assets.ts, audio-catalog.ts, voice-lines.ts, parent-invite.ts, layouts.ts}`; `src/core/{tokens.ts, timing.ts}`, then `npm run tokens`.
- New `tools/render/blender/build_pet_clinic.py`:
  - Reuse `import_model`, `pose_idle`, `ANIMALS` and the `JUNK_MESHES` cleanup from `build_animal_pens.py` (import them or move them to `common.py`; the animal-pens output must stay byte-identical).
  - Rig posing for a head-tilt frame follows the `turn`/`aim`/`follow_feet`/`ground` helpers in `build_bedtime.py`.
- `tools/layout/rules.ts` -- `validatePetClinic`, following `validateAnimalPens`/`validateBedtime`. Wire it into render, atlas and validate-content.
- New `tools/audio/make-pet-clinic.ts`, following `make-bedtime.ts`. Hook it into `make-placeholders › buildArgs`. Add to `check-sfx.test` creature list.
- `README.md` -- provenance for the new art and sounds. `public/CREDITS.txt` already covers the cat and rooster; add a line only if a new CC-BY asset is used.

## Tasks & Acceptance

**Execution:**
- [x] Back up every file before editing it to `_backup/2026-10-26-truoc-8-1/`.
- [x] Content, ids, the round model and its tests (the matrix rows, the shuffle bag, the choseOther picker, resume).
- [x] Builder: render, atlas, a composite check of each animal with each overlay; iterate.
- [x] Sounds and voice lines (`npm run tts`), then `audio:normalize`.
- [x] Scene, registry and the corner wake; scene tests with Phaser stubbed (Home mid-patient → abandon with the partial; Home on the exit → complete).
- [x] `npm run check` and `audio:check`.

**Acceptance Criteria:**
- Given the yard, when "Phòng khám" is tapped, then an animal from the pens walks in showing 1–2 of mud, a rumbling tummy, a scrape or a yawn, and the voice says what it needs.
- Given a patient, when a tool is dragged or tapped-then-tapped onto it, then a fitting tool clears that problem with its own reaction. A tool that doesn't fit gets a funny head tilt and the need line again, never a "wrong" sound.
- Given every problem is fixed, then the animal thanks Xoài, hops and leaves, and a different animal arrives.
- Given `npm run check`, then it exits 0.

## Design Notes

These are the agent's choices; a parent would not notice them.
- **Art: one base frame per patient plus overlay frames.** Each patient has a base frame plus overlays (`mud`, `scrape`, `plaster`, `blanket`, and `bottle` held at the mouth). All are rendered with the same camera and anchor, so Phaser stacks them.
  - The overlays are rendered with the animal as a holdout, so only their visible parts show.
  - Rigged models also get a `tilt` frame (head bone turned about 20°). The static cat and rooster tilt the whole body on its feet in Phaser instead.
- **How the problems show:**
  - Rumbling tummy: little wavy lines at the belly anchor and a periodic gurgle, ≥ 150 Hz.
  - Yawn: a periodic yawn sound, a slow sway and one soft "z".
  - Blanket fix: a short nap (snore, "z"), then the animal wakes up refreshed.
  - The plaster stays on until the patient leaves.
- **The room** is in the cute-toy style: KayKit furniture, with Tiny Treats Bubbly Bathroom for the shower head if present. Smooth shading, no subdivision. The tool tray runs along the bottom-right, clear of the HUD.
- **Sounds:**
  - The shower splash may be a Freesound CC0 recording (as in 7.2).
  - The gurgle, burp and pat come from our own ffmpeg recipes.
  - The giggle, yawn, snore and rustle reuse `sfx.bedtime.*` where they fit.

## Implementation Notes

2026-10-26 (dev). Before each edit, the file was copied to `_backup/2026-10-26-truoc-8-1/` at the same relative path (this spec included).

**Ids and content.** `YARD_GAME_IDS` gets `pet-clinic`; `SnapshotPartials['pet-clinic'] = { patient, left, seen }`; `LINT_GAME_IDS`, `SCREEN_IDS`/atlas (up to 3 pages, `ATLAS_MAX_PAGES`)/background, `layouts.ts`, `PARENT_INVITE_LINES`, the catalog, Tokens (`ui.petClinic*`, `Timing.petClinic*`, `art.petClinic`). `content/games/pet-clinic.ts` holds the problems, tools and `TOOL_FOR`, the 7 patients (call `sfx.animal-pens.<id>.call`, name `vo.animal-pens.name.<id>`), `REACTIONS` (correct: hop, wiggle, sparkle; choseOther: tilt, double-take), the need lines, fix/cue sounds, frames, anchors and `toolHitRadius`. Registering the scene wakes the yard's `clinic` corner (`home.test` expects pen, stage, bed, clinic); no yard/navigation file was edited.

**Round model** (`games/pet-clinic/round.ts`, pure, 15 tests). A session-wide shuffle bag (`createPatientBag`, static on the scene so it carries across `round:next` restarts) draws each patient, excluding the patients seen this round and the last one drawn (no repeat across the boundary); each patient gets 1–2 distinct problems. Walk-in (1.8 s) → call, then `sayChain([prompt (fresh start only), name, need])`; the need line is the Speaker prompt. `useTool`: fitting → `view.fix` (fly 0.6 s, act 1.5 s / nap 2.6 s, return 0.6 s, the problem's start/end sounds), then one `correct` flourish, then the next need line or the thanks; not fitting → `pickReaction('choseOther')`, the tool floats back, the need line after the tilt; busy → `ignored`, the tool floats back. The patient's last fix marks it seen and draws the next patient at once (Home during the walk out abandons with it counted). The round's last patient calls `onLastPatient` (`markFinishing`: Home completes) and, after its walk out, `onRoundEnd` (`scheduleFinish(petClinicFinishMs)`, then continuous play). Cues: a waiting tummy (gurgle + wavy lines bob) and yawn (yawn + sway + one "z") alternate every 6 s; the need line repeats after 15 s idle, at most twice per patient. `resumeClinic` validates the partial (invalid → fresh start).

**Scene** (`PetClinic.ts`; `PetClinic.test.ts`, 8 tests with Phaser stubbed: opening, Home mid-patient → abandon with the partial and silence, Home on a non-last exit → abandon with it seen, Home on the last exit → complete + leave, a full round → one complete, resume, chose-other without a sound, prompt cleanup). The patient is a container on `anchor.patient` holding base/tilt/overlays (all rendered at the spot, origin at the pivot), walking along the row from `anchor.door`; the exit flips it (scaleX −1) and walks back out. Walks open a skip window (`skippable`) closed on arrival (`skippable(0)`); `update` ticks the controller with `delta × time.timeScale` so a skip fast-forwards it. Tools are `createDraggable` with `onSelect`/fly (tap-then-tap); `createDropTarget` on `hit.patient`; a tool released off the patient stays there; a used tool flies to its spot and goes back to the tray. The patient tap target lets taps through while a tool is selected (the catcher flies the tool). Static cat/rooster tilt the container on its feet; the rigged five crossfade to the tilt frame. Reduced motion shrinks hops/wiggles and drops the sway and drifts.

**Art** (`build_pet_clinic.py`, built by a sub-agent; see README). Ortho camera, the room, the mat and the cart; the 7 real models via `build_animal_pens` (its `main()` is now behind `if __name__ == '__main__'` — the only change there; animal-pens was not re-rendered, its outputs are untouched). Overlays over a holdout copy of each posed patient; tilt frames for dog, pig, sheep, cow, horse. Atlas: 2 pages. `validatePetClinic` (render, atlas, validate:content; `tools/layout/pet-clinic-rules.test.ts`, 3 tests): hull width/rect/Hud, door row, anchors on screen, every patient frame inside the rect and clear of the Hud, tool longest side ≥ 90, tool circles (r = max(half, 40)) inside, clear of the Hud, ≥ 24 apart and ≥ 24 from the patient hull. Final: tools ~112 px, circles r ≈ 56 at (742, 450), (912, 457), (742, 625), (912, 628); hull x 203–650, y 291–663.

**Sounds** (`tools/audio/make-pet-clinic.ts`, own ffmpeg recipes, hooked into `make-placeholders › buildArgs`; `make-pet-clinic.test.ts`). splash 0.7 s, burp 0.4 s (creature), gurgle 0.7 s (creature), pat 0.35 s; 50 ms cubic fade-in, two 150 Hz highpasses, peaks −20.8…−21.6 dBFS. Giggle, yawn, snore and rustle reuse `sfx.bedtime.*`; the thanks plays `sfx.shell.happy`. These are synthesised, so `audio:normalize` (for recordings) was not used.

**Voice** (`npm run tts`, not yet approved): `vo.pet-clinic.prompt` "Xoài ơi, | có bạn đến khám này!", need lines (mud "Bạn bẩn quá, | tắm cho bạn nhé!", tummy "Bạn đói bụng, | cho bạn bú sữa nhé!", scrape "Bạn bị trầy, | dán băng cho bạn nhé!", yawn "Bạn buồn ngủ, | đắp chăn cho bạn nhé." `[softly]`), thanks "Khỏe rồi! | Cảm ơn nhé!", parent "Mời bố mẹ | cùng chữa cho bạn nhé!"; 1.6–2.3 s each.

**Checks (2026-10-26).** `npm run check` exits 0 (1941 tests; validate:content: 11 game ids, 139 audio ids, 287 voice lines, 13 layouts). `npm run audio:check` OK (33 creature sounds).

**Deferred / for the parent.** Not played in a browser or on the iPad. Listen to the new lines and sounds. Art weak spots: the rooster's blanket is a small saddle and its mud/scrape spots overlap a little; mud contrast on the brown cow and horse is lower; the dog's tilt is subtle. Composites: `plate.png`, `overview-dog.png`, `patient-<id>.png`, `tilt-heads.png`, `particles-tools.png` in the session scratchpad.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | edge, claim | next patient / onLastPatient only in leave(): Home during the last fix's reaction saved an unresumable partial or abandoned the round | medium | round.ts useTool/leave, resumeClinic | patch (well() at the curing tap + round and scene tests) |
| 2 | edge, blind, verif | reminders reset after every non-final fix (cap is per patient) | low | round.ts:319 | patch + test |
| 3 | edge, blind | tummy wave stayed at the door: fade() killed the walk tween | medium | PetClinic.ts arrive | patch (one x+alpha tween) |
| 4 | edge | lifting a tool mid floatHome/fly: counter tween kept moving it | medium | PetClinic.ts moveTool/lift | patch (per-tool move, stopped on lift) |
| 5 | edge, blind | tap during the yawn sway left the patient tilted | low | PetClinic.ts tapReact | patch (setAngle(0)) |
| 6 | blind | CREDITS.txt did not name the pet-clinic atlas for the CC-BY cat/rooster | low | public/CREDITS.txt | patch |
| 7 | blind | highpass test title claims two, asserts one | low | make-pet-clinic.test.ts | patch (count) |
| 8 | verif | anyTap and the session bag across round restarts unpinned | low | round.test, PetClinic.test | patch (tests added) |
| 9 | verif, blind | drag / tap-then-tap / drop-off-patient wiring never exercised (stub has no textures) | medium | PetClinic.test.ts stub | defer (scene harness with atlas frames; parent play-through) |
| 10 | edge | controller tick capped at 250 ms while a skipped walk runs at timeScale 40 | low | PetClinic.update | reject (~0.2 s lag, no stuck state) |
| 11 | edge, blind | a tool released off the patient may rest under Home/Speaker or on another tool | low | PetClinic.drop | reject (spec: stays where released; fix adds guards) |
| 12 | edge, blind | after a reload the resumed patient is not bag.last | low | round.ts bag | reject (rare; needs new API) |
| 13 | edge | bag fallback can pick an excluded id; resume with empty left | false | 7 patients, 3 a round; resumeClinic rejects empty left | reject |
| 14 | blind | validatePetClinic lacks anchor-in-hull checks; borrows pens' row tolerance | low | rules.ts | reject (composites checked; complexity) |
| 15 | blind | abandon before ctl writes an unresumable partial | low | PetClinic.progress | reject (fresh start is the intended fallback) |
| 16 | blind | assets missing from the diff | false | the review diff excluded binaries/JSON by filter; files exist and npm run check builds | reject |
| 17 | blind | spec/sprint status not moved | false | the orchestrator moves status | reject |

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run audio:check` -- expected: OK.
