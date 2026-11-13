---
title: 'Tàu hỏa quanh đảo (trò Tàu hỏa diễn ra trên đảo)'
type: 'feature'
created: '2026-11-13'
status: 'approved'
route: 'dispatch'
baseline_commit: 'd47b6c0'
review_loop_iteration: 0
context: ['spec-dao-moi-xe-ra-dao.md', 'spec-tau-hoa.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Today the train game happens in its own countryside, with no link to Xoài's island. On 2026-11-13 the
parent chose to have the train game take place on the island itself ("Làm theo mức B").

**Approach:** Keep the train game's play (`spec-tau-hoa.md`: free play, tap the train to go, tap a friend to board, a
tunnel peekaboo, three friends, drop them at a destination) and move it onto the island of `spec-dao-moi-xe-ra-dao.md`:
1. Xoài taps the train on the map. The camera zooms in about 2× on it, and the train game starts in the same view: the
   same island, closer. The train waits at Ga tàu beside Nhà Xoài.
2. Xoài taps the train; it toots and sets off along the island's track. The camera follows it around the island, so
   she sees the real places of her island go by: the ice-cream truck, the dinosaurs, the cave, the race track, Nhà
   Xoài.
3. Little stations along the track are named after the place beside them: "Ga Xe kem", "Ga Khủng long", "Ga Hang",
   "Ga Đường đua". At each one a friend waits. Xoài taps it, and it hops into the next empty car. The voice says
   "Bạn mèo lên tàu!" and counts.
4. The tunnel is the volcano: the train rides into the mountain, the scene dims gently, and the train comes out the
   other side with "Ú òa!".
5. After three friends, the train stops at a destination on the island: the beach (the swim ring), the whale's bay or
   the fountain park. Xoài taps it, the friends hop off and wave, and the train sets off on the next trip.

Taps any time:
- the chimney toots;
- a car names its colour;
- a place on the island that the camera passes (the ice-cream truck, the pizza shop, the cave…) says its name;
- the whale spouts.

**Home** zooms back out to the map, with the train at Ga tàu.

## Boundaries & Constraints

**Always:**
- **Every rule of `spec-tau-hoa.md` › Boundaries stays**, except where this spec says otherwise:
  - free play;
  - taps only;
  - nobody gets stuck (the train always waits);
  - the sizes;
  - boarding and drop-off ≤ 1.5 s with taps ignored;
  - the gentle tunnel (≥ 400 ms fade, ≤ 50% dim, out within 2 s);
  - the idle hint;
  - the shuffle bags;
  - calm pacing and reduced motion;
  - the voice and sound rules.

  Things that change:
  - "the train's x never changes" becomes "the camera follows the train";
  - the countryside, its destinations and its surprises are replaced by the island's.
- **The world is the island of the map:**
  - the same rail loop (`path.rail`);
  - the same places in the same spots;
  - the same style.

  The game's island plate is the map's island rendered at 2× the map's scale. It is split into tiles of at most
  2048 × 1536 px, so no texture is over the iPad limit.
- **The camera:**
  - It follows the train smoothly, leading slightly in the direction of travel.
  - It never shows past the island plate's edge.
  - It never moves faster than the train.
  - Under reduced motion it moves in short eased steps between stations instead of following continuously.
- **The train on a curve:** the engine and each car stand at their own arc length on the loop and take the heading
  frame nearest their tangent (8 headings). Sprites are never rotated. The cars keep fixed gaps along the arc.
- **Sizes in every heading:**
  - each car's hit area ≥ 80 × 80 screen px;
  - each friend ≥ 120 px with a hit area ≥ 80 px;
  - each destination hit area ≥ 150 × 110 px;
  - hit areas ≥ `targetGap` apart.

  The waiting friend and the destination stay in the interactive rect, clear of the HUD, while the train is stopped
  for them (the camera frames them).
- **Stations and destinations** are fixed arc lengths on the loop:
  - ≥ 4 friend stations, each named after the place beside it;
  - ≥ 3 destinations;
  - Ga tàu is the start.

  A trip visits 3 friend stations in loop order, then a destination, and always moves forward round the loop. The
  tunnel (the volcano) falls on the trip's path at most once, so whether a trip has it depends on where it goes. Each
  trip always has one tunnel or one surprise.
- **Place names:** a tap on a place says its name, reusing `vo.shell.station-name.<id>`, and does nothing else. It never
  leaves the train game.
- **Resume:** the snapshot partial becomes `{ friends, aboard, stops, dest, surprise }`, with stops and the destination
  given as ids. An invalid or old-shape partial falls back to a fresh trip at Ga tàu.
- **Voice lines** for every friend station ("Ga Xe kem!") and every destination ("Đến biển rồi!"). Reuse the boarding,
  colour, "Ú òa!" and count lines of `spec-tau-hoa.md`. Lines are short with no praise, voiced by ElevenLabs Thắm.

**Never:**
- Everything under `spec-tau-hoa.md` › Never.
- A camera jump, a fast pan, or a pan while a friend is boarding.
- Showing a place that is not on the island.
- Leaving the game from a place tap.

</frozen-after-approval>

## Code Map

All under `app/`.

**Depends on `spec-dao-moi-xe-ra-dao.md` being built first:** `path.rail`, the tunnel range, Ga tàu, the map train
frames, and the `train` ride with origin `'island'`.

**Art:** `tools/render/blender/build_train.py` is rebuilt on the map's source scene (`art/src/map-v4.blend`):
- the 2× island plate in tiles (`bg.train-0..n`), the same camera as the map with a narrower ortho/lens and 2× resolution;
- the engine (idle, wheel frames, toot, happy) and three cars × 8 headings at the game scale;
- the seated friends; the waiting friends (idle, wave, happy); the platforms;
- the volcano's front layer for the tunnel;
- the destination dressing if it is not in the plate.

Drop the countryside layers from the atlas. Layout: `anchors` for every station and destination arc point, `hits` for
the places that say their name, and `path.rail` at game scale.

**Model:** rework `src/games/train/trip.ts`:
- the world scroll becomes the train's arc length `s` on a closed loop;
- the platforms, the destination and the tunnel become arc ranges;
- arrivals ease to a stop at the station's arc length, as they do today;
- add a `camera(s)` function (pure, tested) for the follow with lead and clamp.

Keep the phases (start, depart, ride, arrive, wait, board, dest, dropoff) and the ports.

**Content:** `src/content/games/train.ts`: the stations (id, place id, arc point, voice line), the destinations, the
surprises (the kart waiting at the crossing whose driver waves, the whale spout, a sailing boat, a hot-air balloon),
the 8 heading frames, the new partial.

**Scene:** `src/games/train/Train.ts`:
- tiles for the plate, the camera follow, the train pieces on the path, the depth sort by y;
- the tunnel front layer and the dim;
- place tap areas (from the layout, in world space).

Home → `round:leave` → Map's zoom-out (the reverse of the opening zoom), with the train at Ga tàu.

**Rules:** `validateTrain` is rewritten for the new world:
- tap sizes in every heading;
- station and destination framing inside the rect;
- the tunnel arc covers the whole train;
- the fade ≥ 400 ms at cruise.

**Tests:** `trip.test.ts` and `Train.test.ts` are reworked. Add camera tests and the resume of an old-shape partial.

## Tasks & Acceptance

**Execution:**
- [ ] Back up to `_backup/2026-11-13-tau-quanh-dao/`.
- [ ] Content and the reworked trip model with tests:
  - one full trip round the loop;
  - boarding and the count;
  - the tunnel once at most;
  - the destination and the drop-off;
  - bags;
  - resume, including old partials.
- [ ] `camera(s)` with tests (follow, lead, clamp, reduced-motion steps).
- [ ] `build_train.py` on the island; render and atlas; composites of the train on a curve, boarding at each station,
  the volcano tunnel and each destination for the parent.
- [ ] `validateTrain` and its test.
- [ ] `Train.ts` and the zoom in from / out to the map; scene tests.
- [ ] Voice lines (`npm run tts`), README provenance.

**Acceptance Criteria:**
- Given the map, when Xoài taps the train, then the view zooms in on the same island and the train waits at Ga tàu.
- Given a trip, then the camera follows the train past the real places of the island. At each friend station the voice
  names the station, and a tap on the friend boards it with its name and the count.
- Given a trip through the volcano, then the scene dims gently and the train comes out within 2 s with "Ú òa!".
- Given three friends aboard, when the train reaches the destination and she taps it, then the friends hop off and
  wave, and the next trip starts.
- Given a tap on a place the camera passes, then its name plays and the game goes on.
- Given Home, then the view zooms back out to the map with the train at Ga tàu.
- Given `npm run check` and `npm run audio:check`, then both exit 0.

## Design Notes

- **Speed:** the game cruises at about 4× the map train's speed in map units, so a full trip (3 stations and a
  destination, about ¾ of a lap) lasts about 45–60 s when Xoài taps promptly, as before.
- **Friends:** the six chibi pen friends of today. They wait on a small platform on the beach side of the track, so the
  island's stations are never covered.
- **Zoom handoff:** Map zooms to 2× on the train's map position and fades in the game's own plate under it (the same
  picture at a higher resolution), so there is no visible cut.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run audio:check` -- expected: OK.

**Manual checks:**
- Composites for the parent before commit.
- A browser run of two full trips at 1024 × 768 (CDP), Home mid-trip and the resume.
- The iPad, watching memory (the tiles) and frame rate while the camera follows.
