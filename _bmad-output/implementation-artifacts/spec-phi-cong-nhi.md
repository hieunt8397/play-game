---
title: 'Trò mới: Phi công nhí (máy bay giao quà)'
type: 'feature'
created: '2026-11-11'
status: 'done'
route: 'dispatch'
baseline_commit: 'db9efffbf45b448d9319bb8bc5935e2f2577a866'
review_loop_iteration: 0
context: ['spec-rua-xe.md', 'spec-trong-cay.md', '../planning-artifacts/prds/prd-be-hoc-choi-2026-10-08/research-hap-dan-tre-3-tuoi.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Xoài has car games (a race, a car wash) but nothing that flies. The parent asked for a plane game on 2026-11-10 and chose "fly and deliver gifts" from five ideas.

**Approach:** Add a new yard game, `plane` (Máy bay), played freely: there are no rounds and no right or wrong.
1. A little toy plane waits on the grass. Xoài taps it, the propeller spins and it takes off.
2. The sky scrolls past by itself (clouds, hills, birds). She touches the sky and the plane glides up or down to her finger's height.
3. Balloons in four colours float in, each carrying a gift box. When the plane touches one, the balloon pops, the gift hops into the plane, the voice names the colour ("Bóng đỏ!") and counts ("Một! Hai! Ba!").
4. After 3 gifts, an animal friend's house scrolls in and the sky stops. She taps the friend, the gifts float down on little parachutes, and the friend reacts with its own happy move and call.
5. The plane waggles its wings and flies on to the next friend.

Each flight brings one random small surprise.

Decisions (agent's proposal of 2026-11-10, accepted by the parent's "làm cho 1 đi"):
- **Entry point:** a new 8th yard corner, `plane` "Máy bay", in Nhà Xoài. The yard is re-laid out to 4 + 4 corners and re-rendered.
- **Learning is by naming, not by quiz:** the voice names colours and counts as things happen. It never asks for "the red one".
- **Pilot** (parent, 2026-11-11): the chibi Shiba in pilot goggles flies the plane and reacts to each catch. It does not wear the Tủ đồ outfit here.
- **Friends:** the chibi pen animals (at least 4 of cat, pig, sheep, cow, horse, rooster), each in front of its own little house.

## Boundaries & Constraints

**Always:**
- **Free play** (`startFreePlay`, like the garden and the car wash). A pure flight model in `games/plane/` with tests. A flight in progress resumes through `SnapshotPartials['plane']` and the `round:leave` snapshot. An invalid partial falls back to a fresh take-off.
- **Steering**
  - A press anywhere in the sky sets the plane's target height; the plane eases to it.
  - While the finger stays down and moves, the target follows it. Lifting the finger keeps the height.
  - No drag is required anywhere: taps alone can play the whole game.
  - The plane's x never changes during a flight, and it always stays inside the interactive rect, clear of the HUD and the bottom edge.
- **Nobody gets stuck**
  - A missed balloon costs nothing. Balloons keep coming until 3 gifts are in.
  - Catching is generous (a `Tokens` catch radius ≥ 80 px around a balloon drawn ≥ 90 px).
  - After a `Tokens` number of misses in a row, or a `Tokens` idle time, the next balloon comes in at the plane's own height.
  - One balloon is on its way at a time, so there is never a choice between two.
- **Clouds and birds:** a cloud in the plane's way gives a soft bounce and a puff; it never stops or hurts the plane. Tapping a bird or a cloud gives a small reaction.
- **Delivery:** the friend and its house are each ≥ 150 px with a hit area ≥ 80 px. A tap anywhere on the friend or the house drops the gifts. The drop runs at most 1.5 s per gift and ignores taps while it runs.
- **Idle hint:** after `Tokens` seconds idle, the next thing to touch bounces (the plane before take-off, the friend at the house) and the matching short line plays.
- **Variety:** shuffle bags for the friends, the balloon colours and the surprises, never the same friend or surprise twice in a row.
- **Calm pacing:** one prominent motion at a time. A take-off or fly-off longer than 1.5 s can be skipped with a tap. `prefers-reduced-motion` is respected (slower scroll, shorter moves). No full-screen or > 3 Hz flashes.
- **Voice lines:** a prompt that names Xoài, "touch the balloons", "drop the gifts for <friend>", the four colour names, the counts 1–3, and a parent invite at most once a visit. Short lines with no praise, made with ElevenLabs Thắm via `npm run tts`.
- **Sounds:** new sounds are ≤ 0.8 s and high-passed at 150 Hz. Reuse the animal calls and existing pops where they fit. `audio:check` passes.
- **Art:** cute-toy style built with `cute.py` shapes: a round toy propeller plane, balloons, gift boxes, parachutes, clouds, hills, the friends' houses. The friends are `cute.chibi()` animals. Back up every edited file to `_backup/2026-11-11-phi-cong-nhi/`.
- **Home** returns to the yard.

**Never:**
- A score, a timer, a fail sound, a crash, red feedback, or the word "sai".
- A question with one right answer ("touch the red balloon").
- Changing `cute.py` `chibi()`/`key_chibi()`, or any other game's gameplay or art output (the yard re-render excepted).

</frozen-after-approval>

## Code Map

All under `app/`. Art commands run from `app/` with `BLENDER_BIN="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"` (Blender is not on PATH; `npm run doctor` reports ffmpeg and the ElevenLabs key present):
- `npm run art:build -- <screen>`, `npm run render -- <screen>`, `npm run atlas -- <screen>`.

**The template is the car-wash game** (commit `f3cc88d`, 79 files; `git show --stat f3cc88d` lists them). Mirror every file it touched for its id, content, registry, assets, layouts, catalog, voice lines, parent invite, tokens and timing, rule wiring (render, pack, validate-content), audio maker and tests. `spec-rua-xe.md` and `spec-trong-cay.md` (Code Map, Implementation Notes) name the lines.

**New files:**
- `src/content/games/plane.ts`: friends, colours, surprises, line ids, frames, anchors, `MOTION`.
- `src/games/plane/{flight.ts, Plane.ts, flight.test.ts, Plane.test.ts}`.
- `tools/render/blender/build_plane.py`, `tools/audio/make-plane.ts` (+ test), `tools/layout/plane-rules.test.ts`.

**Steering input.** `src/core/input/guard.ts` L48–63 `GuardTarget` (`onPress`, `onMove`, `onEnd`, `onCancel`). `src/games/car-wash/CarWash.ts` L204–217 is a local press-and-move target; build the sky target the same way.

**Scrolling.** Nothing scrolls in the app yet (no `tileSprite`, no camera scroll). Keep the plate (`bg.plane`) a still sky, and move looping atlas sprites (clouds, hills, the ground strip) in the scene at different speeds. The pure model owns the world x and the positions of balloons, clouds and the house, so tests need no Phaser.

**Shared ids and lists:** `src/content/types.ts` L20 `YARD_GAME_IDS` and `SnapshotPartials`; `eslint.config.js` `LINT_GAME_IDS`; `src/content/assets.ts`; `layouts.ts`; `audio-catalog.ts`; `voice-lines.ts`; `parent-invite.ts`; `src/games/registry.ts`; `src/core/tokens.ts` (`ui.plane*`, `art.plane`) and `timing.ts`, then `npm run tokens`.

**Reuse:**
- `MiniGameBase.startFreePlay`, `leaveSnapshot`, `skippable`, `inviteParent` (`src/games/mini-game-base.ts` L239, L348, L389, L454).
- Chibi animals: `cute.py` `chibi()` L189 with `FARM_KINDS` / `PEN_KINDS`, coloured from `Tokens.art.animalPens` (see `build_animal_pens.py`). Shapes: `blob`, `lathe`, `rbox`, `rod`, `torus` (L616–720).
- Sounds: `sfx.animal-pens.<animal>.call` (as `content/games/pet-clinic.ts` L56 does), `sfx.garden.pop`, `sfx.car-wash.chime`.
- Counts: `vo.pizza.count.1–3` exist (`voice-lines.ts` L182–184); reuse them if the content validator allows a cross-game voice id, else add `vo.plane.count.*`.

**Yard entry, with a re-layout:**
- `tools/render/blender/build_home.py` `CORNER_BOXES` (L80–88: back row pen, stage, wardrobe; front row clinic, garden, bed, car-wash), `CORNER_YAW`, `build_corner`. The wardrobe's hull must stay left of x 900 (the Speaker zone). Every corner frame is ≥ 150 px.
- `src/content/home.ts` `CORNER_IDS` / `YARD_CORNERS`; `validateHome` (`tools/layout/rules.ts` ~L1725); `home.test.ts`, `home-yard.test.ts`, `yard-flow.test.ts`, `registry.test.ts`; the `vo.shell.corner-name.plane` line.

## Tasks & Acceptance

**Execution:**
- [x] Back up the files to be edited to `_backup/2026-11-11-phi-cong-nhi/`.
- [x] Ids, content, the pure flight model and its tests. Cover:
  - take-off and fly-off with a skip;
  - steering by tap, by press-and-move, and a lift;
  - a catch, a miss, the help after misses and after idle;
  - a cloud bounce;
  - the house arriving after the third gift, the delivery, then the next flight;
  - the three bags, and resume.
- [x] `build_plane.py`: the sky plate; the plane with the goggled Shiba pilot (idle, propeller frames, wing waggle, a happy pose for a catch); balloons and gifts in four colours; parachutes; clouds, hills, the ground strip, birds; ≥ 4 friends (idle, happy) with houses; the surprise frames. Then render and atlas, and iterate on composites.
- [x] Re-lay out the yard to 8 corners with a plane corner prop, re-render home, and wire `home.ts`, `validateHome`, the tests and the corner-name line.
- [x] `validatePlane` in `tools/layout/rules.ts`, wired into render, atlas and validate-content, with its test.
- [x] Sounds (propeller, whoosh, boing; `make-plane.ts`) and voice lines (`npm run tts`).
- [x] The `Plane.ts` scene with the sky target, the registry entry, and scene tests: opening, Home mid-flight then resume, and a full flight.
- [x] README provenance.

**Acceptance Criteria:**
- Given the yard, when Xoài taps the "Máy bay" corner, then the plane waits on the grass and the voice invites her; when she taps the plane, it takes off and the sky starts to scroll.
- Given a flight, when she touches the sky above or below the plane, then the plane glides to that height; when it reaches a balloon, the balloon pops, the gift goes into the plane, and the voice names the colour and the count.
- Given 3 gifts, when the friend's house arrives and she taps the friend, then the gifts float down, the friend reacts with its call, and the plane flies on to a different friend.
- Given a child who never steers, when balloons are missed, then a balloon soon comes at the plane's height and the flight still reaches a house.
- Given `npm run check` and `npm run audio:check`, then both exit 0.

## Design Notes

These are the agent's choices; the parent would not notice them.
- Surprises (≥ 3): a rainbow arch the plane flies through; a flock of small birds that flies alongside for a moment; a hot-air balloon that waves in the distance; a cloud shaped like a heart.
- Three flight heights are enough for balloon spawns (high, middle, low); the plane itself moves freely between the top and bottom limits.
- The house scrolls in on the ground strip and the scroll eases to a stop with the house at a fixed anchor, so the delivery hit areas are fixed and checkable by `validatePlane`.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run audio:check` -- expected: OK.

**Manual checks:**
- Composites of the plane, the balloons, each friend with its house, the re-laid yard and the surprises are shown to the parent before commit.
- A browser run of one full flight at 1024×768 (`npm run dev`).

## Implementation Notes

2026-11-11 (dev). Backups in `_backup/2026-11-11-phi-cong-nhi/`.
- **Ids and content:** `plane` in every shared list (mirroring car-wash); `SnapshotPartials['plane'] = { friend, gifts, surprise }`; colours red, yellow, green, purple (no blue: the sky is blue); six chibi pen friends; surprises rainbow, flock, hot-air balloon, heart cloud. Counts reuse `vo.pizza.count.1–3`.
- **Flight model** (`games/plane/flight.ts`, pure): ground → take-off → fly → approach → house → drop → fly-off. Catch radius 100 px; help after 2 misses or 6 s; the drop line is said when the house arrives; the approach eases from cruise to a stop (cubic Hermite).
- **Deviation:** the parked plane's tap area is its drawn rect (≥ 80 px), not a circle.
- **Art** (`build_plane.py`, 2 atlas pages): the ground strip is 1021.5 px (atlas padding), so the scene tiles 3 copies overlapping 1 px. Yard back row: pen, stage, wardrobe, plane (corner 165 px).
- **Deferred / for the parent:** not played in a browser or on the iPad; 14 new voice lines not yet approved; the yard corner plane has a closed canopy and no Shiba; the friends' happy pose moves only the head. Composites in the session scratchpad `plane-art/final/`.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind | drop line said on the 3rd catch while `tapFriend` is refused for the whole approach | medium | flight.ts `caught` chains `drop(friend)`; `tapFriend` only in phase `house`; approach 3.5 s | patch (say it on arrival) |
| 2 | blind | approach ease starts faster than cruise (cap applies) | low | D = 1324 − 850 = 474 px, 2D/cruise = 4740 ms > 3500 cap → 271 px/s vs 200 (reduced: vs 120) | patch (Hermite from cruise) |
| 3 | blind | `MOTION.bobPx` unused | low | only defined in plane.ts L283 | patch (delete) |
| 4 | blind | `friendFade` doc wrong | low | Plane.ts L738 uses `1 − friendFade` for the hops | patch |
| 5 | verif, blind | parked-plane router target untested | medium | every test calls `ctl.tapPlane()` | patch (test) |
| 6 | verif | real bag `note()` untested | low | flight.test uses its own fixedBag | patch (test) |
| 7 | blind | `seen` unused, misplaced comment in flight.test | low | diff | patch |
| 8 | blind | high-lane balloons pass the Speaker zone | low | balloons are caught by the plane, not tapped; a press there only steers for the moment it crosses | reject |
| 9 | blind | parked hit x uses groundAt.x, drawing planeAt.x | low | validatePlane keeps the two anchors' x within 1 px | reject |
| 10 | blind | scene recomputes drop timing from Tokens | low | same token source today; no override in the app | reject |
| 11 | blind | landed gifts don't scroll with the house | low | 1050 + 350 < 1500 ms, they fade first | reject |
| 12 | blind | skip moves the world in one step | low | a skip is meant to jump; bumps only run in fly/approach, not take-off/fly-off | reject |
| 13 | blind | help balloon while a finger is held still | false | a balloon at the plane's height is the intended help, not a harm | reject |
| 14 | blind | hint bounces can stack | low | arrived bounce and idle hint are ≥ 8 s apart; yoyo is 1 tap long | reject |
| 15 | blind | yard corner plane has a closed canopy, no Shiba | low | the corner still reads as a plane; a fix needs a home re-render | reject (told the parent) |
| 16 | blind | validatePlane misses ground width / hill / gifts checks | low | current frames: 3 copies cover 2·1020.5 ≥ 1024; hills ≤ 262 half-width | reject |
| 17 | blind | house hull, parent invite, reduced-motion branches untested | low | covered by `validatePlane` hull checks and the base invite tests | reject |
| 18 | edge | anchor.gifts missing leaves cargo drawn | false | validatePlane and validate-content fail on a missing anchor | reject |
| 19 | edge | approach while the old house is still on screen | false | 3 catches take ≥ 3 × 3.3 s balloon travel; the old house is gone in 1.8 + 5.75 s | reject |
| 20 | edge | approachMs ≤ 0 → NaN | false | houseX is validated inside the interactive rect, < width + pad | reject |
| 21 | edge | colour can repeat after a resume | false | the intent's no-repeat rule covers friends and surprises only | reject |
| 22 | edge | groundW ≤ 1 → NaN | false | the ground frame is validated as a full-width strip | reject |
| 23 | edge | leave() while not yet in free play freezes the model | false | `build()` calls `startFreePlay()` before any input is live | reject |
| 24 | verif (other) | approach() replaces a house without houseGone | false | same as #19 | reject |
