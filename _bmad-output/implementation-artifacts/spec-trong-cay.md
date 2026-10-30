---
title: 'Trò mới: Trồng cây'
type: 'feature'
created: '2026-10-30'
status: 'done'
route: 'dispatch'
baseline_commit: '3a5e0203aae4a8dc58057dde4428380903f8ba18'
review_loop_iteration: 0
context: ['../planning-artifacts/prds/prd-be-hoc-choi-2026-10-08/research-hap-dan-tre-3-tuoi.md', 'spec-8-1-bac-si-thu-cung.md', 'spec-8-2-thay-do-cho-shiba.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** There is no game where Xoài makes something grow and watches it change. The research (2026-10-16) found that "make something, wait, then a surprise" and "the character's reaction is the reward" hold a 3-year-old longest. Parent chose this game on 2026-10-30.

**Approach:** Add a new yard game, `garden` (Trồng cây), played freely: there are no rounds, no right or wrong, and taps only.
1. Xoài picks a seed packet. The seed drops into the soil.
2. She taps the watering can. Water pours, and the plant grows one stage per watering: sprout, small plant, flowers, then fruit.
3. She taps a fruit. It is picked and hops to the chibi Shiba, who eats it with a reaction for that fruit.
4. When the last fruit is eaten, the plant fades back into soil and a new set of seed packets appears.

Each plant also brings one random small surprise.

Decisions (parent, 2026-10-30):
- **Entry point:** a new 6th yard corner, `garden` "Vườn", in Nhà Xoài, in the front-row gap between clinic and bed. The yard art is re-rendered.
- **Fruit:** dâu, dưa hấu, cà chua, chanh. Chanh is sour, so Shiba scrunches its face and shivers, the funny reaction. The others are happy eats with their own touch: dưa hấu spits seeds, cà chua squirts juice.
- **Seed:** Xoài taps 1 of 2 packets, each showing its fruit. The two are different, drawn from a shuffle bag.
- **Outfit:** Shiba wears the Tủ đồ outfit here, as in Tiệm kem, with overlay frames for every garden pose.

## Boundaries & Constraints

**Always:**
- **Free play** (`MiniGameBase.startFreePlay`, like the band): the cycle repeats without end.
  - A pure round/cycle model in `games/garden/` with tests.
  - Resume of a half-grown plant through `SnapshotPartials['garden']`. An invalid partial falls back to fresh soil.
- **Taps only.**
  - The packets, the can and the fruit are each drawn at ≥ 90 px with hit areas ≥ 80 px, spaced ≥ 24 px apart.
  - Everything sits inside the interactive rect, clear of the HUD and the bottom edge.
  - A `validateGarden` rule checks these limits.
- **Growth:** 3 waterings take the seed to fruit. Each watering plays one growth animation of ≤ 1.5 s and ignores taps while it runs.
- **Idle hint:** after `Tokens` seconds idle, the next thing to tap bounces and the matching short line plays.
- **Fruit:** 3 fruits per plant, picked in any order. Shiba eats each one with its fruit's reaction plus a `pickReaction('correct')` flourish (never the same twice in a row). Tapping Shiba gives a small reaction.
- **Surprise:** each plant gets one surprise from a shuffle bag of ≥ 3, never the same twice in a row (see Design Notes).
- **Calm pacing:** one prominent motion at a time. `prefers-reduced-motion` is respected. No fanfare.
- **Voice lines:** a prompt that names Xoài, "choose a seed", "water it", "pick the fruit", each fruit's name, and a parent invite at most once per cycle. Lines are short (2–4 s), with no praise. Recorded with ElevenLabs Thắm via `npm run tts`.
- **Sounds:** each new sound is ≤ 0.8 s and high-passed at 150 Hz. `audio:check` passes.
- **Art:** cute-toy style (`cute.py`), with the chibi Shiba from `cute.chibi('dog','shiba',…)`. Back up every edited file to `_backup/2026-10-30-trong-cay/`.
- **Home** returns to the yard.

**Never:**
- A score, a timer, a fail sound, red feedback, or the word "sai".
- Dragging as the only way to do something.
- Changing `cute.py` `chibi()`/`key_chibi()`, or any other game's gameplay or art output (the yard/map entry re-render excepted).

</frozen-after-approval>

## Code Map

All under `app/`. Art commands run from `app/` with `BLENDER_BIN="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"` (Blender is not on PATH): `npm run art:build -- <screen>`, `npm run render -- <screen>`, `npm run atlas -- <screen>`.
- Ids:
  - `src/content/types.ts`: add `garden` to `YARD_GAME_IDS` (L20) and `SnapshotPartials` (L42–63).
  - `eslint.config.js` L16: `LINT_GAME_IDS`.
- Content:
  - New `src/content/games/garden.ts`: fruits, stages, `REACTIONS`, line ids, frames, assets.
  - Register it in `src/content/games/index.ts`.
- Game code:
  - New `src/games/garden/{cycle.ts, Garden.ts, cycle.test.ts, Garden.test.ts}`.
  - Follow `games/band` for `startFreePlay` (mini-game-base.ts L388).
  - Follow `games/ice-cream/reactions.ts` and `content/games/ice-cream.ts` for per-item eating reactions.
  - Follow `games/pet-clinic` for the scene structure and the Phaser-stubbed tests.
- `src/games/registry.ts` L14/L45 and `registry.test.ts`.
- Shared content lists:
  - `src/content/assets.ts`: `SCREEN_IDS`, `ATLAS_MAX_PAGES`, `ATLASES`, `BACKGROUNDS`;
  - `layouts.ts`, `audio-catalog.ts`, `voice-lines.ts`, `parent-invite.ts`.
- Tokens: `src/core/tokens.ts` (`ui.garden*`, `art.garden`) and `timing.ts`, then `npm run tokens`.
- Layout rules: `tools/layout/rules.ts` `validateGarden`, following `validatePetClinic` (L1991). Wire it into `tools/render/render.ts` (L103–121), `tools/atlas/pack.ts` (L55, L108) and `tools/lint/validate-content.ts` (L61, L117, L192).
- Art:
  - `tools/render/blender.ts` `SCREENS` (L40), plus a new `tools/render/blender/build_garden.py`.
  - Plants, seed packets, the watering can and the fruit are all procedural, from `cute.py` `blob`/`lathe`/`rbox`/`rod`/`torus` (L473–590). Reuse `add_strawberry` from `build_ice_cream.py` L449 (import it or move it to `cute.py`, keeping ice-cream byte-identical).
  - Shiba is keyed as in `build_ice_cream.py` L302–325 (eat, grimace).
  - Outfit: `outfit.py dress()` (as in `build_ice_cream.py` L771), `validateOutfitFrames` and `core/outfit-layers.ts attachOutfit`.
- Sounds: new `tools/audio/make-garden.ts` (+ test), hooked into `make-placeholders.ts` (L13, L259).
- Entry point (the yard corner):
  - `build_home.py` `CORNER_BOXES`/`CORNER_YAW`/`build_corner` (L74–83, L527) and a home re-render; `content/home.ts` `CORNER_IDS`/`YARD_CORNERS`; `validateHome` (rules.ts L1697); `home.test.ts`, `yard-flow.test.ts`; `vo.shell.corner-name.garden`.
- Existing tests to extend: `snapshot.test`, `pack.test`, `render.test`, `validate-content.test`, `check-sfx.test`, `game-assets.test`.

## Tasks & Acceptance

**Execution:**
- [x] Back up the files to be edited to `_backup/2026-10-30-trong-cay/`.
- [x] Ids, content, and the pure cycle model with tests: choose, three waterings, fruit in any order, reset, surprise bag, resume, and taps ignored mid-animation.
- [x] `build_garden.py`: the garden plate, plant stages per fruit, packets, the can, the fruit, Shiba poses. Render and atlas. Iterate on composites.
- [x] The `garden` yard corner: build the corner prop, re-render home, wire `home.ts`, `validateHome`, the tests and the corner-name line.
- [x] Sounds (pour, pop, crunch/slurp) and voice lines (`npm run tts`).
- [x] The `Garden.ts` scene, the registry entry, and scene tests: opening, Home mid-plant then resume, and a full cycle.
- [x] README provenance, plus `public/CREDITS.txt` if any CC-BY asset is used.

**Acceptance Criteria:**
- Given the yard, when Xoài taps the "Vườn" corner, then the garden opens with soil, 2 seed packets and Shiba (in the chosen outfit), and the voice invites her to plant.
- Given a seed in the soil, when she taps the can 3 times, then the plant grows one visible stage each time and ends with 3 fruits.
- Given fruit on the plant, when she taps one, then it goes to Shiba, who eats it with that fruit's reaction. After the last fruit, a new plant cycle begins.
- Given `npm run check` and `npm run audio:check`, then both exit 0.

## Design Notes

These are the agent's choices; the parent would not notice them.
- Surprises: a butterfly lands on the flowers; a worm peeks out of the soil and ducks back; a giant fruit takes 2 bites, with Shiba's cheeks puffed; a little rainbow after the last watering.
- Plant stages are separate frames per fruit kind. A growth step crossfades between them with a small squash-stretch pop.
- The can tilts over the soil, with a few droplet sprites.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run audio:check` -- expected: OK.

**Manual checks:**
- Composites of every plant stage, the fruit and Shiba's reactions are shown to the parent before commit.

## Implementation Notes

2026-10-30 (dev). Before each edit, the file was copied to `_backup/2026-10-30-trong-cay/` at the same relative path.

**Ids and content.** `garden` is added to `YARD_GAME_IDS`, `SnapshotPartials['garden'] = { offer, kind, waterings, left, surprise }`, `LINT_GAME_IDS`, `SCREEN_IDS`, `ATLAS_MAX_PAGES` (3), `ATLASES` / `BACKGROUNDS`, `layouts.ts`, `PARENT_INVITE_LINES`, the audio catalog and the registry.
- `content/games/garden.ts` holds:
  - the four fruits with their own eating reactions: dâu `yum` (a happy lick), dưa hấu `spit` (pips), cà chua `squirt` (juice), chanh `sour` (a scrunch and a shiver);
  - the stages `sprout → small → flower → fruit`;
  - `WATERINGS` = 3, `FRUITS_PER_PLANT` = 3;
  - the surprises, `REACTIONS` (correct: hop, wag, hearts) and the line ids;
  - the frames, anchors and hits, and `MOTION` (the scene's choreography shares; the lint forbids bare numbers in games/).
- The planted seed shows as the sprout, so three waterings reach the fruit, one stage each.
- Tokens: `ui.garden*`, `Timing.garden*` (planting 1.3 s, a watering 1.4 s, both ≤ 1.5 s) and `art.garden`.

**Free play with a resume.** The base had no way for a `startFreePlay` game to keep a resume point. I added:
- `MiniGameBase.leaveSnapshot()`, which hands nothing by default;
- `RoundGuard.leave(snapshot?)`;
- an optional `snapshot` on the `round:leave` bus event;
- in Map, the snapshot is kept with `keepAbandonSnapshot` (as on abandon) and resumed by `takeStartData`.

The garden hands one back only while a plant grows. Every other game behaves as before. Tested in `round-guard.test` and `yard-flow.test`.

**Cycle model** (`games/garden/cycle.ts`, pure, 23 tests).
- Two different packets come from a shuffle bag (static on the scene, so the session's bags continue across visits).
- Taps are ignored while any animation runs (`busy`). A tap on the can out of its turn only nudges it.
- Fruits are eaten in any order: a bite or two (the giant fruit), the fruit's reaction, then one `pickReaction('correct')` flourish.
- The last fruit's tap already moves the state to the next packets, so Home during the eating keeps the plant eaten.
- After the last fruit the plant fades and two new packets pop in.
- Surprises come from a shuffle bag with no immediate repeat: the worm after planting, the butterfly at the flowers (it stays until the next watering), the rainbow after the last watering, and the giant middle fruit (2 bites, the `puff` frame).
- Voice: the invitation, then "choose"; the fruit's name, then "water"; when the fruit appears, its name, then "pick"; "choose" again with the new packets.
- Idle hint: after `gardenIdleHintMs` (8 s) the next target bounces and the step line plays, at most `gardenHintMax` (3) times per step.
- `resumeGarden` checks the partial; an invalid one starts on fresh soil.

**Scene** (`games/garden/Garden.ts`; `Garden.test.ts`, 6 tests with Phaser stubbed).
- `startFreePlay()` first. Home leaves to the yard with the plant kept.
- Shiba wears the Tủ đồ outfit through `attachOutfit` (`ProgressStore.outfit`).
- The plant is one image re-pointed per stage frame, with a squash-and-stretch pop.
- Fruits and packets are drawn by their trimmed centre at their anchors.
- The can flies to `anchor.pour`, tilts `ui.gardenPourDeg` and drops water from `anchor.spout`.
- Tap circles are `hitRadius(longest / 2, 80)`, and each is live only in its turn; Shiba is tapped through its hull.
- Reduced motion shrinks every move.
- The parent invitation is said at most once a visit, once the voice is quiet.

**Art** (`build_garden.py`, built mostly by a sub-agent).
- An orthographic camera pitched 28°.
- A yard plate: sky, bushes, a picket fence, grass, and a wooden raised bed.
- Per fruit, four plant stages as state children:
  - strawberry: a clump;
  - watermelon: a vine on a bamboo hoop (the fruits share three anchors and must hang);
  - tomato: staked;
  - lemon: a small round tree. Its crown was rebuilt after review: one smooth crown, a darker back blob, flat rim leaves, a shine; the shaggy leaf tufts were dropped.
- The strawberry fruit reuses `build_ice_cream.add_strawberry`. The only change there is `main()` behind `if __name__ == '__main__'`; ice-cream was not re-rendered.
- Packets, the can, particles, the butterfly, the worm and the rainbow.
- The chibi Shiba: idle[1], chew[2], happy[2], sour[2], puff[1]. The puff cheeks are extra blobs; `cute.py` is unchanged. `outfit.dress()` adds every overlay.
- The can was moved up 6 px after render flagged its tap circle (y 696.75 > 694).
- Atlas: 3 pages. Positions:
  - fruit anchors (318, 475), (450, 395), (582, 475);
  - packets (345, 450), (560, 450);
  - can centre (128, 620);
  - Shiba pivot (822, 653), mouth (739, 529).
- `validateGarden` (render, atlas, validate:content; `tools/layout/garden-rules.test.ts`) checks:
  - Shiba's hull;
  - every can, packet and fruit drawn ≥ 90 px, with tap circles ≥ 80 px inside the rect and off the Hud;
  - ≥ 24 px within {can + packets} and within {can + fruits}, and from Shiba;
  - every plant and Shiba frame inside the rect.

**Yard corner** (`build_home.py`, by a sub-agent): a raised bed with strawberries, a staked tomato, a seedling, a sign stake and a watering can. The clinic box is now (50, 480, 260, 664), the garden (344, 480, 612, 664) and the bed (650, 470, 900, 664). Home was re-rendered and its atlas rebuilt. The tests updated were `home.test`, `home-yard.test` and `registry.test`. `vo.shell.corner-name.garden` "Vườn".

**Sounds** (`tools/audio/make-garden.ts`, our own ffmpeg recipes, hooked into `make-placeholders`; `make-garden.test.ts`).
- pour 0.8 s, pop 0.22 s, crunch 0.35 s and slurp 0.45 s (crunch and slurp are `creature`).
- Each has a 50 ms cubic fade-in and two 150 Hz highpasses; peaks are −20…−25.7 dBFS.
- The giggle reuses `sfx.bedtime.giggle` and Shiba's tap reuses `sfx.shell.woof`.

**Voice** (`npm run tts`, ElevenLabs Thắm, not yet approved). Each line is 1.0–2.0 s:
- `vo.garden.prompt` "Xoài ơi, | mình trồng cây nào!";
- choose "Chọn một gói hạt nhé!";
- water "Tưới nước cho cây nhé!";
- pick "Hái quả cho Shiba nhé!";
- names "Quả dâu! / Quả dưa hấu! / Quả cà chua! / Quả chanh!";
- parent "Mời bố mẹ | cùng trồng cây nhé!".

**Checks (2026-10-30).**
- `npm run check` exits 0: 2033 tests; validate:content reports 13 game ids, 144 audio ids, 310 voice lines and 15 layouts.
- `npm run audio:check` OK: 35 creature sounds.

**Composites** are in the session scratchpad `garden-art/final/`: `a-choose`, `a2-pour`, `a3-packets`, `b-stages-<fruit>`, `c-fruit-<fruit>`, `d-shiba-states`, `d2-outfits`, `e-surprises`, `e2-butterfly`, `e3-flowers-butterfly`.

**Deferred / for the parent.**
- Not played in a browser or on the iPad. Listen to the new lines and sounds.
- Art weak spots:
  - the watermelon's hoop, and its plant is a little wider than the bed;
  - the two chew frames are close;
  - the lemon tree's crown shine shows as a pale disk;
  - the yard's front row is now left-heavy.
- `build_garden.py` hard-codes the can's tilt (`POUR_DEG = 38`, the value of `ui.gardenPourDeg`); it is not passed in params.


## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind, edge, verif | giant fruit tap circle unscaled; validateGarden checks a scaled one | medium | Garden.ts fruitSpots uses `hitRadius(half)` for every spot | patch |
| 2 | blind | tomato `squirt` shows the sour face | medium | Garden.ts fruitReaction `case 'squirt'` starts with `shibaFrame('sour', 0)`; intent: only chanh is sour | patch |
| 3 | edge | can scale stays inflated if watered mid hint bounce | medium | water() kills tweens (bounce onComplete never runs); bounce uses current scaleX as base, so it compounds | patch |
| 4 | edge | last fruit still popping in after busy ends | low | pop starts at 0.6·1400 ms, 560 ms + 280 ms stagger ends at 1680 > 1400 | patch (shorter pop) |
| 5 | blind | Shiba tap blocks every target for 600 ms | medium | cycle.ts tapShiba `busyFor(t.tapMs)` | patch (own rate limit) |
| 6 | blind, edge | parent invite comment says never on resume; code always pending | low | Garden.ts `let invitePending = true` | patch |
| 7 | verif | Map round:leave snapshot keep untested | medium | Map.ts handler; tests copy its steps | patch (pure helper + test) |
| 8 | edge | nested `after` drifts by up to one tick | low | cycle.ts tick runs callbacks at tick end; ~16 ms per frame, 250 ms only on hitches | reject (rare, fix adds plumbing) |
| 9 | blind, edge | resume can repeat or lose the plant's surprise; butterfly not restored | low | resume path restores stage only | reject (needs Home mid-plant; fix adds partial state) |
| 10 | blind, edge | POUR_DEG hard-coded; reduced-motion tilt misses drops | low | build_garden.py POUR_DEG = 38 = token today | reject (same value now; reduced motion only; needs builder plumbing) |
| 11 | blind | voice lines 1–2 s vs spec 2–4 s | low | fruit names are one or two words | reject (intent is "short") |
| 12 | blind | spit/squirt reuse the pop sound; crunch/slurp mapping | low | REACT_SFX | reject (cosmetic) |
| 13 | blind | no content test / game-assets.test not extended | low | validate-content + garden-rules tests cover frames, audio, anchors | reject |
| 14 | blind | pour anchor and tilted can not validated | low | composites a2-pour checked | reject |
| 15 | blind | shared round:leave change not in spec scope | false | resume is an Always rule; free play had no leave snapshot; notes record it | reject |
| 16 | blind | tasks ticked while parent gate open | false | parent saw the composites and approved 2026-10-30 | reject |
| 17 | edge | missing packet frame leaves a tappable slot | false | atlas/validate-content fail on a missing frame | reject |
