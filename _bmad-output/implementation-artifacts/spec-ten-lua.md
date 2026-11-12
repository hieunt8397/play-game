---
title: 'Trò mới: Tên lửa lên Mặt Trăng'
type: 'feature'
created: '2026-11-12'
status: 'in-review'
route: 'dispatch'
baseline_commit: '7df9ede'
review_loop_iteration: 0
context: ['spec-tau-hoa.md', 'spec-phi-cong-nhi.md', '../planning-artifacts/prds/prd-be-hoc-choi-2026-10-08/research-hap-dan-tre-3-tuoi.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Xoài has a car race, a car wash, a plane and a train, but nothing with a big "wow" moment. On 2026-11-12 the parent asked for a game that wows more and chose "Tên lửa lên Mặt Trăng" from the agent's ideas. The parent added: "phải làm đồ họa cho thật wow và đẹp" (the art must be truly wow and beautiful).

**Approach:** Add a new yard game, `rocket` (Tên lửa), played freely: there are no rounds and no right or wrong. One trip:
1. **Build.** A launch pad stands in a field at sunrise. Shiba waits in a round astronaut helmet. Three rocket parts come one at a time (the body, the nose cone, the fins). For each part Xoài taps one of 2 colours. The part flies onto the rocket with a "cạch" and a sparkle, and the voice names the colour ("Mũi đỏ!").
2. **Countdown.** Shiba climbs in, waves through the round porthole, and the voice counts "Ba! Hai! Một! Phóng!". Xoài taps the rocket (or simply waits for the count to end). Toon flames burst out, big soft smoke clouds billow across the pad, the screen gives a small rumble, and the rocket lifts off.
3. **Ascent.** The camera rides with the rocket. Clouds rush down past it, then a bird flock, then the little plane from Phi công nhí, which waves. The sky deepens from morning blue through violet into a starry indigo space. Each tap on the sky gives a "vút" boost: a flame burst and a speed-up. Stars twinkle in.
4. **Space.** The round Earth floats below, and the voice says "Trái Đất, nhà của Xoài!". One random surprise drifts past (see Design Notes). Xoài can tap it, the stars and the Earth.
5. **Moon landing.** The pastel Moon grows until it fills the bottom of the screen. The rocket turns and lands with soft retro puffs and a dust ring, and the voice says "Đến Mặt Trăng rồi!".
6. **On the Moon** (free play):
   - Shiba hops out. A tap on the ground makes Shiba jump very high and float down slowly because the Moon is light, landing in a little dust puff.
   - A tap on a crater: a little alien peeks out ("Ú òa!"), waves and makes its own sound.
   - A tap on a moon rock: it bounces slowly.
   - A tap on the Earth in the sky: it spins and twinkles.
   - Once per trip, Shiba plants a flag with a mango on it.
7. **Home.** After a few Moon taps (or once Xoài taps the rocket), Shiba climbs back in. The rocket lifts off, the Earth grows, a striped parachute opens, and the rocket drifts down onto the launch pad. A new trip starts at the Build step.

Learning is by naming, never by quiz:
- counting down 3-2-1;
- the colours of the parts;
- space words (tên lửa, phi hành gia, Mặt Trăng, Trái Đất, ngôi sao);
- light and heavy (the slow high jump: "Trên Mặt Trăng nhẹ tênh!").

Decisions (agent's proposal of 2026-11-12, accepted by the parent's "ok làm đi"):
- **Entry point:** a new 10th yard corner, `rocket` "Tên lửa", in Nhà Xoài: a small rocket standing on a pad, which uses the yard's vertical space well. The yard is re-laid out to 5 + 5 corners and re-rendered. **If `validateHome` cannot pass with 10 corners of ≥ 150 px, stop and ask the parent** (alternatives: a second yard "Phố xe", or a scrolling yard). Do not invent a second yard without asking.
- **Astronaut:** the chibi Shiba in a round fishbowl helmet with a small backpack. Not the Tủ đồ outfit.
- **Aliens (new characters):** ≥ 3 round, soft, friendly aliens built with `cute.py` blobs. Each has its own colour (mint, peach, lilac), one antenna with a glowing ball, big eyes, and its own sound. Never teeth, never scary.
- **Part colours:** each choice is 2 of red, yellow, blue, green and white, and never the same pair twice in a row. The finished rocket keeps Xoài's colours for the whole trip, including the yard-return parachute scene.

## Boundaries & Constraints

**Always:**
- **Free play** (`startFreePlay`, like the plane and the train).
  - A pure trip model in `games/rocket/` with tests.
  - A trip in progress resumes through `SnapshotPartials['rocket']` and the `round:leave` snapshot (step, chosen colours, surprise).
  - An invalid partial falls back to a fresh trip at Build.
- **Taps only:** no drag anywhere. Every tap target stays inside the interactive rect, clear of the HUD and the bottom edge.
- **Nobody gets stuck**
  - Every choice has exactly 2 options and no wrong one.
  - The countdown launches on its own if Xoài does not tap.
  - The ascent and the return fly on their own.
  - The Moon waits for as long as she likes; the rocket is always there to tap for home.
  - The idle hint bounces the next thing to touch, with its short line.
- **Sizes**
  - Part choices ≥ 130 px with hit areas ≥ 100 px, ≥ 2 × `targetGap` apart.
  - The rocket ≥ 160 px tall on the pad.
  - Shiba on the Moon ≥ 120 px.
  - Each crater, rock and alien hit area ≥ 80 px, ≥ `targetGap` apart.
- **Calm, never scary**
  - The launch sound is a bright "whoosh" plus puffs: no deep rumble, no explosion, nothing louder than the train's toot.
  - The screen rumble is ≤ 6 px and ≤ 800 ms. It is off under `prefers-reduced-motion`.
  - No full-screen or > 3 Hz flashes. Flame and star glow pulse at ≤ 2 Hz.
  - **Space is never black:** the darkest sky colour is a deep indigo/violet (`Tokens.art.rocket.spaceDeep`, luminance ≥ 12%), always with stars and the bright Earth or Moon on screen.
  - One prominent motion at a time. A motion longer than 1.5 s (launch, landing, return) can be hurried with a tap. In the ascent a tap is a boost that shortens it.
- **Pacing:** ascent about 5–6 s untapped (about 3 s with boosts), landing ≤ 2.5 s, return ≤ 4 s. A full trip with prompt taps is about 60–90 s, mostly spent on the Moon.
- **Variety:** shuffle bags for the colour pairs, the surprises, the aliens and the Moon reactions. Never the same surprise or the same alien twice in a row.
- **Voice:**
  - a prompt that names Xoài ("Xoài ơi, mình cùng làm tên lửa nhé!");
  - one line per part ("Thân tên lửa!", "Mũi tên lửa!", "Cánh tên lửa!") and per colour;
  - "Ba! Hai! Một! Phóng!" ("Ba/Hai/Một" may reuse `vo.pizza.count.*` if they sound right descending; "Phóng!" is new);
  - "Trái Đất, nhà của Xoài!", "Đến Mặt Trăng rồi!", "Trên Mặt Trăng nhẹ tênh!", "Ú òa!", one line per surprise, "Về nhà thôi!";
  - a parent invite at most once a visit: "Bố mẹ đếm ngược cùng Xoài nhé!".

  Lines are short with no praise, made with ElevenLabs Thắm via `npm run tts`.
- **Sounds:** each ≤ 0.8 s and high-passed at 150 Hz, `audio:check` passes:
  - part clank, sparkle, ignition whoosh, boost "vút", retro puff, dust puff;
  - star twinkle, parachute pop;
  - 3 alien calls (boing, bloop, trill).

  The launch is a short chain of these, not one long file.
- **Art — the "wow" bar** (the parent's explicit ask): cute-toy style built with `cute.py` shapes, richer than any yard game so far.
  - **Layered, deep scenes:** ≥ 3 parallax layers per scene (far, mid, near), each a different scroll speed.
  - **Glow:** flames, stars, the antenna balls, the portholes and the Earth's rim get a soft halo (baked into the sprite, plus Phaser additive blend where it helps).
  - **Living particles** (Phaser emitters, runtime): billowing launch smoke, flame embers, star twinkles, moon dust, sparkles on each part.
  - **Sky transition:** a smooth gradient from sunrise → day blue → violet → indigo space, driven by altitude. It is a stack of crossfading plates or a shader gradient, never a hard cut.
  - **Hero frames**, each a composed shot that could be a poster: the launch pad at sunrise, liftoff in a smoke cloud, the Earth from space, the Moon with the Earth rising.
  - Back up every edited file to `_backup/2026-11-12-ten-lua/`.
- **Art gate before code:** render the 4 hero frames as composites, plus the rocket in all colour combinations, Shiba in the helmet and the aliens. **Show the parent and get an OK before building the scene.** Iterate until the parent says it is wow.
- **Home** returns to the yard.

**Never:**
- A score, a timer, a fail sound, a crash, an explosion, a rocket that breaks or falls, red feedback, or the word "sai".
- A question with one right answer ("choose the red nose").
- Scary space: no black void, no deep rumble, no menacing alien, no being lost or alone (Shiba and the rocket are always on screen).
- Changing `cute.py` `chibi()`/`key_chibi()`, or any other game's gameplay or art output. The yard re-render is the one exception; the plane cameo reuses the plane atlas frames read-only.

</frozen-after-approval>

## Code Map

All under `app/`. Art commands run from `app/` with `BLENDER_BIN` set to Blender 5.2 LTS:
- `npm run art:build -- rocket`
- `npm run render -- rocket`
- `npm run atlas -- rocket`

Voice needs `ELEVENLABS_API_KEY` in `.env`. Build the art and the voice on the main dev machine.

**Prerequisite:** commit the Tàu hỏa work first, and set `baseline_commit` to that commit. The rocket touches the same shared lists and the yard.

**The template is the train game** (its commit, once made), and the plane (`2419d84`). Mirror every file they touched for:
- the id, content, registry, assets, layouts, catalog, voice lines and parent invite;
- the tokens and timing;
- the rule wiring (render, pack, validate-content);
- the audio maker and the tests.

**New files:**
- `src/content/games/rocket.ts`: parts, colour pairs, surprises, aliens, Moon spots, line ids, frames, anchors, `MOTION`.
- `src/games/rocket/{trip.ts, Rocket.ts, trip.test.ts, Rocket.test.ts}`.
- `tools/render/blender/build_rocket.py`, `tools/audio/make-rocket.ts` (+ test), `tools/layout/rocket-rules.test.ts`.

**Vertical scrolling:** the train and plane scroll sideways; this game scrolls up.
- The pure model owns the altitude, the sky phase (0–1 for the gradient), the boost queue and the surprise's position, so tests need no Phaser.
- The pad and the Moon landing ease to fixed anchors (cubic Hermite, as `flight.ts` does), so hit areas are fixed and checkable by `validateRocket`.

**Rocket colouring:** render each part per colour as its own frame: 3 parts × 5 colours = 15 frames, plus the flame and porthole frames. Stack the parts at runtime. Do not tint at runtime: tinting flattens the toy shading.

**Shared ids and lists:** the same places as the train:
- `types.ts` `YARD_GAME_IDS` and `SnapshotPartials`;
- `eslint.config.js` `LINT_GAME_IDS`;
- `assets.ts`, `layouts.ts`, `audio-catalog.ts`, `voice-lines.ts`, `parent-invite.ts`;
- `registry.ts`;
- `tokens.ts` (`ui.rocket*`, `art.rocket` including `spaceDeep`) and `timing.ts`, then `npm run tokens`.

**Yard entry (10 corners):**
- `tools/render/blender/build_home.py`:
  - `CORNER_BOXES` (today 9 boxes: train, pen, stage, wardrobe, plane / clinic, garden, bed, car-wash);
  - `CORNER_YAW`, `build_corner`;
  - a rocket-on-pad prop.
- `src/content/home.ts` `CORNER_IDS` / `YARD_CORNERS`; `validateHome`.
- The tests: home, home-yard, yard-flow, registry.
- The voice line `vo.shell.corner-name.rocket`.

## Tasks & Acceptance

**Execution:**
- [ ] Back up the files to be edited to `_backup/2026-11-12-ten-lua/`.
- [ ] **Art first.**
  - `build_rocket.py`:
    - the sky plates (sunrise, day, violet, space);
    - the pad scene layers;
    - cloud, bird and star layers;
    - the Earth with its glow rim;
    - the Moon surface layers with craters and rocks, and the Earth rising;
    - the rocket parts in 5 colours, flames (3 frames), retro puffs and the parachute;
    - Shiba in the helmet (idle, wave, jump, float, happy);
    - ≥ 3 aliens (hidden, peek, wave, happy);
    - the flag;
    - the surprise frames.
  - Render the 4 hero composites. **Parent gate.**
- [ ] Ids, content, the pure trip model and its tests. Cover:
  - the Build choices and the colour bags;
  - the countdown, with a tap and with no tap;
  - the ascent boosts and the sky phase;
  - the surprise;
  - the landing;
  - each Moon reaction, the flag once per trip, and the alien bag;
  - the return, then the next trip;
  - resume at every step.
- [ ] `validateRocket` in `tools/layout/rules.ts`, wired into render, atlas and validate-content, with its test. It checks the sizes and gaps above, keeps choices inside the interactive rect, and checks the `spaceDeep` luminance.
- [ ] The yard re-layout to 10 corners with the rocket prop (or stop and ask, per Intent). Re-render home and wire `home.ts`, `validateHome`, the tests and the corner-name line.
- [ ] Sounds (`make-rocket.ts`) and voice lines (`npm run tts`).
- [ ] The `Rocket.ts` scene: parallax, gradient, particles, glow and the reduced-motion paths. Add the registry entry and scene tests: opening, Home mid-ascent then resume, and a full trip.
- [ ] README provenance.

**Acceptance Criteria:**
- Given the yard, when Xoài taps the "Tên lửa" corner, then the pad scene opens at sunrise and the voice invites her to build.
- Given the Build step, when she taps one of 2 colours for each of 3 parts, then each part flies onto the rocket with its colour named, and the rocket shows her colours.
- Given the built rocket, when the countdown ends (tapped or not), then flames and smoke burst out, the rocket lifts off, and the sky moves smoothly from day to indigo space with stars.
- Given the ascent, when she taps the sky, then the rocket boosts with a flame burst and the ascent gets shorter.
- Given space, then the Earth is shown and named, and one surprise passes that reacts to a tap.
- Given the Moon, when she taps the ground, a crater or the Earth, then Shiba jumps high and floats down, an alien peeks out with "Ú òa!", or the Earth spins.
- Given she taps the rocket on the Moon, then it flies home, a parachute opens, it lands on the pad, and a new trip starts.
- Given a child who taps nothing, then nothing fails: the countdown launches by itself, the Moon waits, and the idle hint bounces the next target.
- Given `prefers-reduced-motion`, then there is no rumble, motions are shorter, and the particles are reduced.
- Given `npm run check` and `npm run audio:check`, then both exit 0.

## Design Notes

These are the agent's choices; the parent would not notice them.
- **Surprises (≥ 4):**
  - a comet with a star-shaped head (a small face at most) and a long rainbow tail. It must never be round, so it never reads as the Moon;
  - a ring planet that spins its ring when tapped;
  - a little UFO with an alien who waves;
  - a satellite that beeps and flaps its solar panels;
  - a shooting star that leaves a rainbow trail.
- **Palette:**
  - sunrise peach/coral → day sky (the plane's blue) → lavender → violet → `spaceDeep` indigo;
  - the Moon is pastel cream-lavender with soft lilac craters;
  - the Earth is a toy globe with bright blue seas, green land and white cloud swirls;
  - stars are warm yellow with a glow.
- **Layout, portrait-safe at 1024×768:**
  - On the pad, the rocket stands centre-left, with the 2 choices on the right side, stacked vertically.
  - On the Moon, Shiba stands centre, the rocket on the left, craters and rocks spread right and centre, and the Earth up right, clear of the Speaker zone.
- **Flame:** 3 hand-shaped toon frames looping at about 10 fps, with an additive-blend glow sprite pulsing ≤ 2 Hz. Embers are emitted downward.
- **Smoke:** volumetric (EEVEE Principled Volume: noisy density fading to nothing at each puff's rim, self-lit where dense, no absorption tint, warm point lights from the flame), never glossy blobs, because those read as the sky's clouds. A column from the nozzle to the pad, then a low bank rolling out both ways. It is rendered as a few sprite frames (the bank growing); at runtime the frames scale, drift sideways and fade over about 1.5 s. This is the liftoff hero beat.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.
- `cd app && npm run audio:check` -- expected: OK.

**Manual checks:**
- The parent approves the hero composites before the scene is built, and the final in-game look before commit.
- A browser run of one full trip at 1024×768 (`npm run dev`), checking the frame rate during liftoff smoke and particles. On the iPad through the Cloudflare tunnel, it must stay smooth (no visible stutter).

## Implementation Notes

- 2026-11-12, art gate round 1: 4 hero concepts (pad with the 2-colour choice, liftoff, space, Moon) rendered from `_backup/2026-11-12-ten-lua/concept/concept.py`, a standalone script using `cute.py` and the build_plane camera. It is the seed for `build_rocket.py`, and contains `glow()`, an additive radial halo, plus `gradient()` and `earth_mat()`. Contact sheet: `_backup/2026-11-12-ten-lua/concept/ten-lua-concept.png`. `spaceDeep` `#5E54BA` (luminance ≈ 12.3%). Awaiting the parent's verdict. Integration waits for the Tàu hỏa commit (another session was editing the train files when this round ran).
- 2026-11-12, parent feedback: the round smiling comet read as the Moon and its face was too big ("mặt trăng nhìn từ xa hơi buồn cười, mắt với miệng to quá"). The space hero now shows the real Moon far ahead, top right: cream-lavender, craters spread over its face, a soft glow behind it, and **no face** (`concept/space-v2.png`). Rule: the Moon never has a face, and nothing round and pale in the sky has a big face.
- 2026-11-12, parent feedback: the liftoff smoke "trông hơi giống mây" (looked like clouds) and should be more real. It is now volumetric (`concept/liftoff-v2.png`, `smoke_volume()` in concept.py). Rendering it costs about 4–5 min per full-size frame at tile size 1, so keep the smoke frames few.

- 2026-11-12, implementation:
  - **Art:** `build_rocket.py` renders every sprite where it stands at its step.
    - Three timeline light bands: the warm sunrise pad (frames 1…), space (101…) and the Moon (201…).
    - The fins and the pilot are cut by a holdout copy of the body.
    - The aliens are cut by the Moon ground (`bhc_holdout_sprites`), so no crater-lip sprite is needed; `earthsmall` replaces it in the frame list.
    - Full-width sprites (the lawn, the hills, the Moon) are cut 3 px from each edge by holdout strips so they fit a 2048 atlas page; the scene stretches them back (`Rocket.wide`).
    - Glows are alpha-faded discs. Their falloff reaches 0 at 90% of the quad (`GLOW_EDGE`).
    - The atlas packer (shared by every game) clears alpha < 24 and trims each frame to its alpha ≥ 64 box, so a wide baked glow shows a square edge. The big glows (the sun's, the flame's) are therefore drawn at runtime: `Rocket.softGlow` is a canvas radial gradient that fades fully to clear, tinted, with normal blending. ADD blending also added the colour of the transparent pixels, so it is not used. Only small glows stay baked (stars, the antenna balls, the far Moon and the Earths).
    - The smoke sprites are self-lit ×9 (a lone volume sprite read brown-grey, RGB ≈ 190/172/166, without the sky behind it).
    - Render plus atlas takes about 6 minutes; the atlas has 4 pages.
  - **Sky:** the sunrise → day → violet → space gradient is a runtime canvas strip (`skyAt` in content) under the space plate, which fades in near space.
  - **Moon layout:** rocket at (180, 612), Shiba at (560, 645), craters at (730, 625), (912, 548) and (390, 672) with 75 px unpadded tap rings that reach 95 px up, the flag at (285, 655).
  - **Unpadded tap areas:** the bubbles, the Moon rocket, the craters and both Earths (already cut to the interactive rect).
  - **Yard:** the 10th corner `rocket` is at (806, 96)–(874, 255), a slim rocket on a small pad. The wardrobe narrows to (636, 195)–(732, 395) and the plane box becomes (818, 327)–(974, 470), so its frame stays ≥ 150 px. `validateHome` passes.
  - **Voice:** 21 lines made by `npm run tts`, not yet approved. The countdown reuses `vo.pizza.count.3–1`.
  - **Sounds:** 11 recipes in `make-rocket.ts`, peaks −20.9 … −27.4 dBFS. The ignite whoosh is −21.8 dBFS, under the train's toot (−20.5).
  - **Checks:** `npm run check` and `npm run audio:check` pass. A headless-Chrome run (CDP, 1024×768) played a full trip: build, countdown, launch, climb with a boost, space with the satellite, Moon landing, an alien peek, a jump, home under the parachute, and a new build. The console showed no errors.

## Spec Change Log

- 2026-11-12 (implementation, agent): the parent invitation line no longer names Xoài. The content rule allows the name only in greetings, invitations to the child and prompts, so it reads "Bố mẹ | cùng đếm ngược nhé!". "Trái Đất, nhà của Xoài!" is kept as written: it names the Earth as the child's home, a place, like "Nhà Xoài", and is listed in `NAME_PLACE_LINES`.
- 2026-11-12 (implementation, agent): four space surprises (comet, ringed planet, ufo, satellite). The shooting star of the Design Notes was left out, since the spec asks for at least 4.
- 2026-11-12 (implementation, agent): the colour lines name the colour alone ("Màu đỏ!"); each part has its own line ("Mũi tên lửa!") when it is offered.

## Review Triage Log
