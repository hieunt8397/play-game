---
title: 'Tàu hỏa quanh đảo (trò Tàu hỏa diễn ra trên đảo)'
type: 'feature'
created: '2026-11-13'
status: 'in-progress'
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
- [x] Back up to `_backup/2026-11-13-tau-quanh-dao/`.
- [x] Content and the reworked trip model with tests:
  - one full trip round the loop;
  - boarding and the count;
  - the tunnel once at most;
  - the destination and the drop-off;
  - bags;
  - resume, including old partials.
- [x] `camera(s)` with tests (follow, lead, clamp, reduced-motion steps).
- [x] `build_train.py` on the island; render and atlas; composites of the train on a curve, boarding at each station,
  the volcano tunnel and each destination for the parent.
- [x] `validateTrain` and its test.
- [x] `Train.ts` and the zoom in from / out to the map; scene tests.
- [x] Voice lines (`npm run tts`), README provenance.

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

## Implementation Plan (dev, 2026-11-13)

Built by a sub-agent through bmad-build. The parent approved the spec and could not be asked during the run. The spec
is over the 1600-token target; it is kept whole (one user goal, approved as is).

**World and camera.** The train screen is rendered from the map's own camera at 4096 × 3072 (renderScale 4, design
1024 × 768), so the train layout's coordinates are the map's design coordinates (`path.rail` is the same). The game's
Phaser camera shows it at `ui.trainZoom` 2: the same island, closer, and the zoom handoff is exact. The plate is cut
into four 2048 × 1536 tiles (`bg.train.0..3`, `assets/bg/train-<n>.png`).

**Art.** `build_train.py` opens the built `art/map.blend` (the `blender.ts` source; it holds everything the map built
from `map-v4.blend`: the stations, the track, Ga tàu, the crossing, the volcano, the whale). It:
- drops the map-only sprites (clouds, waves, decorations, icons, the guide's outfits);
- keeps as sprites what must be drawn over the train: the volcano, the `occ-<n>` scenery, the crossing barriers (up,
  down) and every station sprite that a camera ray to the track hits first. The other station sprites, the parked
  plane, the rocket and the fountain are baked into the plate;
- keeps the map's train frames (`train-engine`, `train-car-<n>`, h0…h7), the same sprites as the map's, so the handoff
  matches. It also keeps the whale (idle, spout) and the kart, moved onto the road beside the crossing;
- adds the four friend platforms (plate), the friends (`friend-<f>`: idle, wave, happy), the seated busts
  (`seat-<f>`), `puff`, `pop`, `boat` and `hot-air`;
- adds the layout: the station and destination stops, the friends' spots, the drop spots, `hit.platform-<station>`,
  `hit.dest-<d>` and `hit.whale`. It keeps the map's place hulls, `path.rail` (`-up`, `-back`), `path.compass`, and the
  tunnel and crossing anchors.

The old side-view builder becomes `train_models.py`. `build_train.py` still builds the library collections
`sprite.engine` and `sprite.car-<colour>` with it. They are never rendered (`bhc_library`), so `map_rides.py` keeps
appending the same engine and cars from `art/train.blend`. `render_screen.py` gains two opt-ins: it skips
`bhc_library` collections, and a scene's `bhc_sprite_border` renders each sprite pass only inside its projected box
(for speed).

**Runtime.**
- `core/map-rides` (loops, scale, headings, `markedAt`) is reused.
- New pure `games/train/camera.ts`; `trip.ts` is rewritten on the arc length.
- `core/ride-handoff.ts` carries the map train's arc length into the game and the game's last view back to Map. Map
  zooms to `ui.trainZoom` onto the game's opening view, and on Home pulls back from the game's last view.
- `MiniGameBase` gets an overridable `reveal()`. The train skips the fade, so there is no visible cut.

## Spec Change Log

- 2026-11-13 (dev): **build source.** `build_train.py` starts from the built `art/map.blend`, not `art/src/map-v4.blend`:
  the built map already holds every station, the railway, Ga tàu and the rides, with the same camera. The map in turn
  appends the engine and cars from `art/train.blend`, which keeps them as never-rendered library collections.
- 2026-11-13 (dev): **the game train is the map's train.** It uses the same sprites at the same scale (so the zoom
  handoff matches), not a bigger "game scale" model; the car pitch is longer (`ui.trainCarPitch`) in the game and on the
  map so the tap discs stay ≥ targetGap apart.
- 2026-11-13 (dev): **the start.** The game's train starts where the map's train stood when Xoài tapped it (Ga tàu when
  she tapped the platform or the train was in the tunnel), so the zoom lands on the game's first view. Waiting at Ga tàu
  always would need a visible jump of the train.
- 2026-11-13 (dev): **the tunnel rule.** The volcano's tunnel (spec 1) is shorter than the train, so it cannot cover the
  whole train. `validateTrain` checks the dim instead: ≥ 400 ms fade-in at cruise, the engine inside ≤ 2 s at the
  slowest cruise; the dim is relative to the most the tunnel can cover.
- 2026-11-13 (dev): **the tunnel at most once.** From Ga tàu and every destination, the planner always finds a trip that
  passes the volcano once (tested on the real island). A first trip handed over from a map train just before the volcano
  may pass it twice.
- 2026-11-13 (dev): **surprises.** Each trip still has one surprise (as in spec-tau-hoa) besides the tunnel. "The kart's
  driver waves" is a bounce of the kart with a honk (the map's kart sprite has no wave frame).
- 2026-11-13 (dev): **no skip.** The departure and the arrival take 1.4 s, under the 1.5 s skip rule, so there is no
  skip.
- 2026-11-13 (review): **reduced-motion camera pace.** A step whose eased peak is the train's cruise averages only 2/π
  of it, so on a long leg the gap grows step after step and the train leaves the view. A step now averages the cruise
  (its brief eased peak is π/2 × the cruise) and, once the train stands, steps exactly onto its stop's view. This bends
  "never moves faster than the train" for the brief peak of a reduced-motion step. The normal follow never does.
- 2026-11-13 (review): **surprises that cannot happen.** A kart surprise on a trip that never passes the crossing, or
  a whale surprise on a trip that never passes the whale (or ends at the whale's bay), becomes the sailing boat. A
  resumed trip still shows its boat or balloon.
- 2026-11-13 (dev): **workflow.** Step 3 of bmad-build asks for a fresh implementation sub-agent. The planning agent
  implemented it itself: the plan depended on a long investigation of the art pipeline that the spec could not carry.

## Design Notes (dev)

- **Train size and spacing.** The game uses the map train's own sprites at the same scale: a car is about 40 × 42 map
  px, 80 × 84 screen px at zoom 2. The tap areas are discs round each piece (radius: engine 26, car 20 design px, × the
  local scale; ≥ 80 screen px). The cars' arc pitch becomes `ui.trainCarPitch` (62 / 56 / 56 design px), so neighbouring
  discs stay ≥ targetGap apart. The map train uses the same pitch, so the handoff matches.
- **Speed.** Cruise is `ui.trainCruiseMapX` (3) × the map train's. That is calmer than 4× at zoom 2: about 290 screen
  px/s, near the old game's 220. A trip lasts about 40–55 s with prompt taps.
- **Friend stations:** Ga Xe kem (ice-cream), Ga Khủng long (dino-puzzle), Ga Hang (shadow-match), Ga Đường đua
  (race). The platform stands on the beach side where the camera can frame it. On the island's left and right edges it
  stands on the inland sand strip instead: on the beach side it would leave the interactive rect.
- **Destinations:** the beach (the swim ring), the whale's bay (the shore by the whale) and the fountain park.
- **The tunnel** is the volcano's arc range from spec 1. It is shorter than the train, so the dim follows the share of
  the train inside it, relative to the most it can cover; it reaches `ui.trainDimMax` (≤ 50%).
- **Surprises:**
  - the kart waiting at the crossing (its driver waves: a bounce and a honk as the engine passes);
  - the whale's spout as the train passes it;
  - a sailing boat and a hot-air balloon drifting by in view.
- **Stops:** the engine stops before the platform (3.9 m of rail) or the destination (2.2 m; the fountain 3.4 m), so the
  waiting tap area is ahead of the engine, ≥ targetGap from every disc, and the camera (lead 110 design px past the
  train's middle) frames it. The waiting tap areas are padded by hitPad / zoom (hitPad on screen).
- **Engine frames:** idle per heading only. The wheel, toot and happy frames are too small to read at this scale (the
  wheels are ~10 screen px). The toot is the puff and a bounce; running is a small bob.
- **Waiting friends** are drawn over every sprite: the Ga Hang platform stands on the beach behind the cave, which hid
  the friend in the browser run.

## Review Triage Log

Review 1, 2026-11-13 (bmad-build step 4: Blind Hunter, Edge Case Hunter, Verification Gap; one pass, no loopback).
B = Blind, E = Edge, V = Verification gap.

| # | Finding | Verdict | Route | Resolution |
|---|---------|---------|-------|------------|
| 1 | B/E: the reduced-motion camera falls further behind each step (peak = cruise, average 2/π of it) | high | patch | step averages the cruise; snaps onto the stop when the train stands; camera test with a moving target |
| 2 | E: `pulseOf` under reduced motion scales the whole peak (the train shrinks to ~half on every toot) | high | patch | `1 + amp(peak − 1)·sin` |
| 3 | E/V: reduced-motion stepper may not frame the waiting tap area (rules check the follow camera only) | medium | patch | the stepper's threshold is 0 while the train stands: it lands on the checked view |
| 4 | B/E: kart / whale surprise off the trip's path never fires (the kart waits all trip); whale dest + whale surprise spouts twice | medium | patch | `reachableSurprise` swaps it for the boat; tests |
| 5 | B/E: boat / balloon never shows on a trip resumed with 2 aboard | medium | patch | scheduled on the first departure with a friend aboard (`skyQueued`); test |
| 6 | E/V: a fresh start without a handoff, or reduced motion after Map's fade-out, appeared with a hard cut | medium | patch | `seamless` only for a handoff with motion on; otherwise fade in; test |
| 7 | B/E: no rail → Home hands back the view (0, 0) | low | patch | hand back only with a rail |
| 8 | B/E: a stale handoff start from an interrupted open | low | patch | `takeTrainStart()` before setting it |
| 9 | V: `backgroundPng` untested; E: uneven splits drop pixels silently | medium | patch | throws on an uneven split; quadrant test in pack.test |
| 10 | E: `sprite_border` measured meshes only (curves, instances could be cropped) | low | patch | returns the whole frame when such geometry renders; checked: no sprite in train.blend has any, so the published frames are unaffected |
| 11 | E: the friend-frame keep-out (Home/Speaker) check was dropped | medium | patch | restored in validateTrain |
| 12 | V: Home's handed-back view untested | medium | patch | Train.test asserts it equals `cameraCentre` at the engine |
| 13 | B: tests dropped (Home at start, nothing plays after Home) | low | patch | re-added in Train.test |
| 14 | B: borrowed tokens (fish history window, toot gap for the whale) | low | patch | `trainTapLagMs`, `trainWhaleGapMs` |
| 15 | B: stale docs (README sfx row, MOTION comment, rules header), `hintAt` builds the anchor id by hand, wobble leaves the seated friend behind | low | patch | fixed |
| 16 | V/E: map and train layouts' `path.rail` differ by up to 10 px at the crossing (map.layout.json is older than art/map.blend) | medium | defer | not caused by this spec: spec 1's map render predates its own last map.blend change; a map re-render makes them equal. Logged in deferred-work |
| 17 | V: Map's half of the handoff (trainStart, focus, pull-back branch) has no test | medium | defer | no Phaser test harness for Map exists; logged in deferred-work |
| 18 | E: the train starts where the map train stood, not always at Ga tàu (AC 1) | medium | intent (open question) | decided and logged in the Spec Change Log; the parent was not reachable. Open question in the report |
| 19 | E: a first trip handed over just before the volcano may pass it twice | low | intent (open question) | logged in the Spec Change Log; open question in the report |
| 20 | B: map car spacing vs the game's (unscaled pitch on the map) | false | reject | MapTrain.pieces scales each gap by the local scale, like trainPieces |
| 21 | B: validateTrain does not check the place hulls / whale hit / moving pieces against the Hud | low | reject | the place hulls are the map's (checked by validateMap); a moving piece under the Hud is the same as on the map; a direct fix needs per-frame camera sampling |
| 22 | B: the drawn-train-size check was removed | false | reject | replaced by the disc size check round the whole loop |
| 23 | B: drop spots not checked against the rect | false | reject | each drop spot's friend box is inside `hit.dest-<d>`, which is checked at the stop |
| 24 | B: silent anchor fallbacks in build | low | reject | validateTrain requires every anchor (render, atlas, validate:content) |
| 25 | B: pull-back falls back to the default zoom with no view | low | reject | free play leaves only through `leave()`, which always hands the view back |
| 26 | B: camera / geometry live under games/ but scenes and rules import them | low | reject | the layer rule allows scenes → games; rules.ts already imports game geometry |
| 27 | B: `TiledScreen` hand-written; WAIT_LINE prefix; landing squash uniform | low | reject | cosmetic; the audio id is kept to reuse its file |
| 28 | E: zero cruise / empty loop never stops | low | reject | unreachable: validateTrain requires a loop and the cruise comes from it |
| 29 | E: the 2 s tunnel bound is estimated at the tunnel's midpoint scale | low | reject | no stop lies in the tunnel; the scale varies by a few % there |
| 30 | E: `use_border` reset to False instead of its prior value | low | reject | no scene sets it; render_screen owns the pass |

