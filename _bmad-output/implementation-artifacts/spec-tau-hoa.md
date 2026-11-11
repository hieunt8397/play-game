---
title: 'Trò mới: Tàu hỏa chở bạn'
type: 'feature'
created: '2026-11-11'
status: 'ready-for-dev'
route: 'dispatch'
baseline_commit: '2419d84'
review_loop_iteration: 0
context: ['spec-phi-cong-nhi.md', 'spec-rua-xe.md', 'spec-trong-cay.md', '../planning-artifacts/prds/prd-be-hoc-choi-2026-10-08/research-hap-dan-tre-3-tuoi.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Xoài has a car race, a car wash and a plane, but no train. The parent asked for a train game on 2026-11-11 and chose "Tàu hỏa chở bạn" with the tunnel peekaboo from the agent's ideas ("ok làm đi").

**Approach:** Add a new yard game, `train` (Tàu hỏa), played freely: there are no rounds and no right or wrong.
1. A toy steam train waits at a little station, with the chibi Shiba driving in a conductor's cap. Xoài taps the train; it toots ("tu tu"), puffs smoke and pulls away.
2. The countryside scrolls past by itself (hills, trees, fences, a bridge). The train rides on one fixed track; there is nothing to steer.
3. The train slows into a station where an animal friend is waiting. Xoài taps the friend; it hops into the next empty car, makes its own call, and the voice says "Bạn mèo lên tàu!" then counts ("Một! Hai! Ba!"). The train pulls away again.
4. Once a trip, the train rides into a tunnel. The scene dims gently, there is a short pause, then the train comes out into the light and the voice says "Ú òa!".
5. After 3 friends, the train arrives at a destination (the beach, a playground, a fair). Xoài taps it, and the friends hop off one by one and wave. The train toots and sets off on the next trip with new friends.

Xoài can tap at any moment for small reactions:
- the chimney: a puff of smoke and a toot;
- a car: it wobbles and the voice names its colour ("Toa đỏ!");
- a cow or bird by the track: a small reaction.

Each trip brings one random small surprise.

Decisions (agent's proposal of 2026-11-11, accepted by the parent):
- **Entry point:** a new 9th yard corner, `train` "Tàu hỏa", in Nhà Xoài. The yard is re-laid out to 5 + 4 corners and re-rendered. 5 corners of ≥ 150 px plus 4 gaps of `targetGap` 24 px is 846 px, which fits the back row's span of about 926 px.
- **Learning is by naming, not by quiz:**
  - The voice names each friend as it boards and counts the friends aboard.
  - It names a car's colour when Xoài taps the car.
  - It never asks for "the red car".
- **Driver:** the chibi Shiba in a conductor's cap. It does not wear the Tủ đồ outfit here.
- **Friends:** the chibi pen animals (at least 4 of cat, pig, sheep, cow, horse, rooster), each waiting on its own station platform.
- **Cars:** three cars in fixed colours, red, yellow and blue (the background is grass and ground, so blue reads well here). The engine is green.

## Boundaries & Constraints

**Always:**
- **Free play** (`startFreePlay`, like the plane, the garden and the car wash).
  - A pure trip model in `games/train/` with tests.
  - A trip in progress resumes through `SnapshotPartials['train']` and the `round:leave` snapshot.
  - An invalid partial falls back to a fresh trip at the first station.
- **Taps only:** no drag anywhere. The train's x never changes during a trip: the world scrolls past it. The train and every tap target stay inside the interactive rect, clear of the HUD and the bottom edge.
- **Nobody gets stuck**
  - The train always waits at a station until the friend is tapped. There is no timer and no missed train.
  - A tap anywhere on the friend or its platform boards it.
  - The idle hint makes the friend bounce and wave.
  - Only one friend waits at a time, so there is never a choice between two.
- **Sizes**
  - The train and each car are ≥ 110 px wide, with a car hit area ≥ 80 px.
  - Each friend is ≥ 120 px with a hit area ≥ 80 px.
  - The destination is ≥ 150 px with a hit area ≥ 80 px.
  - Hit areas are ≥ `targetGap` apart.
- **Boarding:** a boarding runs at most 1.5 s and ignores taps on the friend while it runs.
- **Drop-off:** a drop-off runs at most 1.5 s per friend and ignores taps while it runs.
- **Tunnel**
  - The dim fades in over ≥ 400 ms and darkens the scene by at most 50%.
  - It is never black, never a flash, and never a full-screen white.
  - It happens at most once per trip and never while a friend is boarding.
- **Idle hint:** after `Tokens` seconds idle, the next thing to touch bounces and the matching short line plays:
  - the train at the start station;
  - the friend at a station;
  - the destination on arrival.
- **Variety:** shuffle bags for the friends, the destinations and the surprises. Never the same friend twice in one trip, and never the same destination or surprise twice in a row.
- **Calm pacing**
  - One prominent motion at a time.
  - A departure or arrival longer than 1.5 s can be skipped with a tap.
  - `prefers-reduced-motion` is respected (slower scroll, shorter moves, a shorter dim).
  - No full-screen or > 3 Hz flashes.
- **Voice lines**
  - a prompt that names Xoài ("Xoài ơi, chạm vào tàu để tàu chạy nhé!");
  - one "Bạn <friend> lên tàu!" per friend;
  - the three car colours;
  - "Ú òa!" for the tunnel;
  - one line per destination ("Đến biển rồi!");
  - a parent invite at most once a visit.

  Lines are short with no praise, made with ElevenLabs Thắm via `npm run tts`. Counts reuse `vo.pizza.count.1–3`, as the plane does.
- **Sounds:** new sounds (toot, chug, puff, brake hiss) are ≤ 0.8 s and high-passed at 150 Hz. Reuse the animal calls and the existing pops where they fit. `audio:check` passes.
- **Art:** cute-toy style built with `cute.py` shapes:
  - a round toy steam engine with three cars;
  - station platforms, the track, a tunnel mouth in a hill;
  - hills, trees, fences, the destinations;
  - the friends are `cute.chibi()` animals.

  Back up every edited file to `_backup/2026-11-11-tau-hoa/`.
- **Home** returns to the yard.

**Never:**
- A score, a timer, a fail sound, a crash, a derailment, red feedback, or the word "sai".
- A question with one right answer ("put the cat in the red car").
- A scary tunnel: no full darkness, no spooky sound, no long wait (the train is out within 2 s).
- Changing `cute.py` `chibi()`/`key_chibi()`, or any other game's gameplay or art output. The yard re-render is the one exception.

</frozen-after-approval>

## Code Map

All under `app/`. Art commands run from `app/` with `BLENDER_BIN` set to Blender 5.2 LTS:
- `npm run art:build -- <screen>`
- `npm run render -- <screen>`
- `npm run atlas -- <screen>`

Voice needs `ELEVENLABS_API_KEY` in `.env`. Neither tool is set up on the machine that only runs the dev server (`npm run doctor` there reports both MISSING), so the art and the voice must be built on the main dev machine.

**The template is the plane game** (commit `2419d84`, 81 files; `git show --stat 2419d84` lists them). Mirror every file it touched for:
- the id, content, registry, assets, layouts, catalog, voice lines and parent invite;
- the tokens and timing;
- the rule wiring (render, pack, validate-content);
- the audio maker and the tests.

`spec-phi-cong-nhi.md` (Code Map, Implementation Notes) names the lines.

**New files:**
- `src/content/games/train.ts`: friends, car colours, destinations, surprises, line ids, frames, anchors, `MOTION`.
- `src/games/train/{trip.ts, Train.ts, trip.test.ts, Train.test.ts}`.
- `tools/render/blender/build_train.py`, `tools/audio/make-train.ts` (+ test), `tools/layout/train-rules.test.ts`.

**Scrolling:** reuse the plane's approach (`games/plane/Plane.ts`, `flight.ts`).
- The plate (`bg.train`) is a still sky.
- Looping atlas sprites (hills, trees, the track strip, fences) move at different speeds in the scene.
- The pure model owns the world x and the positions of stations, the tunnel and the destination, so tests need no Phaser.
- Stations and the destination ease to a stop at fixed anchors (cubic Hermite from cruise, as `flight.ts` does for the house), so their hit areas are fixed and checkable by `validateTrain`.

**Shared ids and lists:**
- `src/content/types.ts` L20 `YARD_GAME_IDS` (append `'train'`) and `SnapshotPartials`.
- `eslint.config.js` `LINT_GAME_IDS`.
- `src/content/assets.ts`, `layouts.ts`, `audio-catalog.ts`, `voice-lines.ts`, `parent-invite.ts`.
- `src/games/registry.ts`.
- `src/core/tokens.ts` (`ui.train*`, `art.train`) and `timing.ts`, then `npm run tokens`.

**Reuse:**
- `MiniGameBase.startFreePlay`, `leaveSnapshot`, `skippable`, `inviteParent` in `src/games/mini-game-base.ts`.
- Chibi animals: `cute.py` `chibi()` with `PEN_KINDS`, coloured from `Tokens.art.animalPens` (see `build_animal_pens.py` and the plane's friends in `build_plane.py`).
- Sounds: `sfx.animal-pens.<animal>.call`, `sfx.garden.pop`, `sfx.car-wash.chime`.
- Counts: `vo.pizza.count.1–3` (`content/games/plane.ts` `countLine` already does this).

**Yard entry, with a re-layout to 9 corners:**
- `tools/render/blender/build_home.py`:
  - `CORNER_BOXES` (L84–93; today back row pen, stage, wardrobe, plane; front row clinic, garden, bed, car-wash);
  - `CORNER_YAW`, `build_corner`;
  - a train corner prop (a small engine with one car on a stub of track).
- The plane box sits under the Speaker zone (top ≥ 257 + hitPad). Keep every hull clear of the Home/Speaker keep-out, ≥ `targetGap` apart, and every corner frame ≥ 150 px.
- `src/content/home.ts` `CORNER_IDS` / `YARD_CORNERS`; `validateHome` (`tools/layout/rules.ts` L1743).
- Tests: `home.test.ts`, `home-yard.test.ts`, `yard-flow.test.ts`, `registry.test.ts`.
- The voice line `vo.shell.corner-name.train`.

## Tasks & Acceptance

**Execution:**
- [ ] Back up the files to be edited to `_backup/2026-11-11-tau-hoa/`.
- [ ] Ids, content, the pure trip model and its tests. Cover:
  - departure and arrival with a skip;
  - boarding at each station, and taps ignored during a boarding;
  - the count;
  - the tunnel (once per trip, never during a boarding);
  - the destination after the third friend, the drop-off, then the next trip;
  - car and chimney taps;
  - the three bags, and resume.
- [ ] `build_train.py`:
  - the sky plate;
  - the engine with the capped Shiba driver (idle, wheel frames, a toot pose with a smoke puff, a happy pose);
  - three cars, empty and with a friend seated;
  - platforms, the track strip, the tunnel hill (front and back layers so the train passes inside);
  - hills, trees, fences;
  - ≥ 4 friends (idle, wave, happy);
  - ≥ 3 destinations;
  - the surprise frames.

  Then render and atlas, and iterate on composites.
- [ ] Re-lay out the yard to 9 corners with a train corner prop, re-render home, and wire `home.ts`, `validateHome`, the tests and the corner-name line.
- [ ] `validateTrain` in `tools/layout/rules.ts`, wired into render, atlas and validate-content, with its test.
- [ ] Sounds (toot, chug, puff, brake hiss; `make-train.ts`) and voice lines (`npm run tts`).
- [ ] The `Train.ts` scene, the registry entry, and scene tests: opening, Home mid-trip then resume, and a full trip.
- [ ] README provenance.

**Acceptance Criteria:**
- Given the yard, when Xoài taps the "Tàu hỏa" corner, then the train waits at the station and the voice invites her. When she taps the train, it toots and pulls away and the countryside starts to scroll.
- Given a station with a friend waiting, when she taps the friend, then it hops into the next empty car with its call, the voice says "Bạn <friend> lên tàu!" and the count, and the train pulls away.
- Given a trip, when the train enters the tunnel, then the scene dims gently and the train comes out within 2 s with "Ú òa!".
- Given 3 friends aboard, when the destination arrives and she taps it, then the friends hop off and wave, and the next trip starts with different friends.
- Given a child who taps nothing, then nothing fails: the train waits and the idle hint bounces the next target.
- Given any car tap during a trip, then the car wobbles and the voice names its colour.
- Given `npm run check` and `npm run audio:check`, then both exit 0.

## Design Notes

These are the agent's choices; the parent would not notice them.
- **Surprises (≥ 3):**
  - a level crossing where a little car waits and its driver waves;
  - a bridge over a river with a fish that jumps;
  - a hot-air balloon waving in the distance;
  - a rainbow over the hills.
- **Destinations (≥ 3):** the beach (a sand strip, an umbrella), a playground (a slide, a swing), a fair (a little Ferris wheel).
- **Trip shape:** start station → ride → station 1 → ride → station 2 → ride (the tunnel falls on this leg or the previous one, by bag) → station 3 → ride → destination.
  - Each ride lasts about 3–4 s at cruise.
  - A full trip is about 45–60 s when Xoài taps promptly.
- **Train layout:** the engine is on the right, facing right; the cars trail to the left.
  - All four pieces fit within about 700 px, so the destination anchor on the right stays clear of the train.
  - The boarding car is always the next empty one from the engine back, so the order is predictable.
- **Tunnel:** a hill with a front layer drawn above the train and a back layer below it.
  - The train slides behind the front layer while the dim fades in.
  - After a pause (≤ 600 ms in the dark), the train slides out of the far side as the dim fades out.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run audio:check` -- expected: OK.

**Manual checks:**
- Show the parent composites of the train, the cars with friends seated, the stations, the tunnel, each destination, the re-laid yard and the surprises before commit.
- A browser run of one full trip at 1024×768 (`npm run dev`), and on the iPad through the Cloudflare tunnel.

## Implementation Notes

## Spec Change Log

## Review Triage Log
