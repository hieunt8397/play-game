# Epic 6 Context: Bảy trò quen thuộc vui hơn (The seven familiar games, more fun)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make each of the seven existing mini-games (Ice cream, Pizza, Race, Fishing, Touch-talk, Dino puzzle, Shadow match) more fun for a 3-year-old (Xoài). Each game gets its own version of the shared Epic 5 framework: funny character reactions are the reward, a "different" choice is funny instead of wrong, there is a free-play mode after the last question, and there are small surprises. Examples: Shiba sneezes ice cream onto his nose, you can pile on as many pizza toppings as you like, you wash the car after the race, fish play peek-a-boo and go into the child's own fish tank, hiding spots in Touch-talk, dinos dance, and animals shake their heads at the wrong shadow. Parent feedback was that the games felt like "question → answer → reward" drills. This epic turns them into toys.

## Stories

- Story 6.1: Ice cream: Shiba sneezes, nose wipe and ice-cream tower
- Story 6.2: Pizza: unlimited toppings and fox reacts by flavor
- Story 6.3: Race: short track, car color choice and car wash
- Story 6.4: Fishing: fish peek-a-boo behind weeds and the child's fish tank
- Story 6.5: Touch-talk: multiple reactions and hiding spots
- Story 6.6: Dino puzzle: per-species dance and funny misplaced pieces
- Story 6.7: Shadow match: bigger objects, head shake and peek-out greeting

## Requirements & Constraints

- **Different choice is never "wrong"**: each game has its own funny character reaction, then a short voice reminder. There is no "wrong" sound or color, and the voice never says "sai"/"không đúng". There is no praise anywhere, including no praise that uses the name "Xoài".
- **Random reactions**: each game has 3 or more distinct "correct" reactions. They are picked at random with no immediate repeat (seeded rng).
- **Free play**: after the last question, `round:complete` still fires (reward and difficulty work as before), but the game stays on screen. The voice goes silent, targets turn off, and the game's own free-play rules apply. Home returns to the island.
- **Per-game behaviors**:
  - **Ice cream**: a different flavor makes Shiba take a taste, pull a face specific to that flavor, then the scoop floats back and a voice reminder plays. A correct flavor gets lick, shiver or sneeze. A sneeze sometimes leaves ice cream on Shiba's nose, which the child taps to wipe. In free play, the tower grows to about 8 scoops, wobbles, topples onto the counter, and can be rebuilt.
  - **Pizza**: extra slices are always accepted. The pizza jiggles, the fox's eyes go round, and the voice keeps counting. The oven still works. Toppings get their own reactions (bell pepper → "cay quá!" plus a puff of smoke; mushroom and sausage have their own). Keep the existing bake and eat animation. In free play, the child can add any toppings and bake again and again.
  - **Race**: the level-1 track is short enough to draw in one stroke (length set by a token). Before the first track, show 3–4 color swatches (≥ 120px each). The chosen color persists in ProgressStore and is also used by the kart on the island. After the last finish there is a car wash: water spray, foam where the child touches, a rinse, then a sparkle that does not flash. The car wash has no right or wrong.
  - **Fishing**: fish sometimes hide behind weeds or rocks and then peek out. A hidden fish can never be the only remaining target. Tapping the wrong fish gives a splash and a dive (already built) plus a random reaction. Caught fish go into the child's fish tank (ProgressStore, max N). The tank is an island decoration near the pond. Tapping it opens an overlay where the fish swim. Tapping a fish makes it wiggle and reads its name.
  - **Touch-talk**: each object has 2–3 reactions (different frames and sounds). Each scene has at least 2 hiding spots: tapping one makes an animal or object pop out, make its sound, have its name read, then hide again. A hiding spot counts toward the distinct-touch counter.
  - **Dino puzzle**: each species has its own dance and its own small sound (≤ 0.8s, no loud roar). A piece dropped in another piece's slot stays there for now and the dino says "ơ?". After about 2s (token) the piece slides back to the tray. The hint level rises by at most one step per misplacement.
  - **Shadow match**: the held object is at least the minimum drag size (≥ 90px) and at least a token ratio of its shadow's size. On a wrong shadow, the animal shakes its head and says "Không phải nhà tớ", then returns to the dino's hand. On the right shadow, it goes in, the shadow fills with color, and the animal peeks out to greet.
- **Carried-over constraints**: response to every touch within 100ms. Any celebration longer than about 1.5s can be skipped with a tap. Prompts are about 2–4s, ≤ 8 words, and avoid banned near-homophones. Flashing is ≤ 1Hz, with one standout motion at a time, and `prefers-reduced-motion` is respected. Character sounds are high-pitched and short, with no sudden loud sounds. Never show errors to the child; a missing asset is skipped silently with `console.warn`.
- **Done gate**: every story adds Vitest tests for its round-model logic and passes `npm run check`.

## Technical Decisions

- **Game structure**: a pure round model plus a thin scene on `MiniGameBase`. Games never call `scene.start/stop/launch` or `this.load.*`, and never import other games or scenes. Questions derive deterministically from `seed`. If new mid-question state must survive a round abandon, it goes into `Snapshot.partial`.
- **Shared Epic 5 building blocks to reuse, not re-implement**: `core/reactions` (random picker with no repeat, "correct" vs "different" lists), the free-play mode switch in `MiniGameBase`, tap-then-tap and stay-where-dropped in `core/input/drag-controller`, the touch router (target, plain object, background), and skip-long-animation.
- **Input**: only through `core/input` primitives (`TapTarget`, `DragController`, `TracePath`, `HotspotPolygon`). Picking and snap changes go only through `InputGuard.setPickable`/`setSnapScale`. Gameplay uses one pointer (first finger wins).
- **Hints**: `HintDirector` owns prompt and hint voice and the timers. A "different" choice calls `wrong()`. Free play must turn off hints and targets.
- **Audio**: only through `AudioDirector` (`say`, `sayChain`, `sfx`). No `this.sound.*` and no file paths. New voice lines go in `content/voice-lines.ts` (id `vo.<scope>.<intent>…`), then `npm run content:export` and `npm run tts` (edge-tts, now 7.3.1). New SFX go in `content/audio-catalog.ts` (`sfx.<scope>.<name>`). Character sounds (sneeze, chewing, dino calls) need CC0 sources and license entries.
- **Numbers**: all new behavior numbers (tower height, slide-back delay, size ratio, track length, fish-tank max, etc.) go in `Tokens` / `Tokens.Timing`. The lint rules `no-magic-numbers` and no hex/rgba literals apply in `scenes/` and `games/`.
- **Persistence**: only `ProgressStore` touches storage (`bhc.progress`). New fields (car color, caught fish) require a `schemaVersion` bump plus a migration, and writes are synchronous.
- **Art**: pre-rendered sprites from Blender builders (`build_<id>.py`, sharing `tools/render/blender/cute.py`). The style is the soft cute toy look: rounded, smooth shading, chibi, pastel, with no subdivision modifiers in builds. New frames use names like `<object>/<state>/<nn>` (e.g. Shiba shiver/sneeze/grimace/nose-cream). New hit areas come from `hit.<id>` objects, e.g. `hit.shiba-nose`, never hand-entered coordinates. Atlas pages are ≤ 2048² and files are ≤ 8 MiB. Car color can be done with a tint or with separate frames. Motion is tweens plus frame animations only.
- **Bus**: the existing typed events (`round:complete`, `round:abandon`, `reward:earned`, `hint:level`). Touch-talk still has no rounds and emits `reward:earned` about every 8 distinct touches.

## UX & Interaction Patterns

- The character's reaction is the reward. Characters must have readable emotions: happy, surprised, grimacing, sleepy.
- A "different" choice runs in this order: comic reaction, then the item returns (or stays briefly, as in Dino puzzle), then a short reminder. There are never failure sounds or colors.
- Free play has no voice. Objects keep the game's physical toy behavior. Home is always the exit.
- No text instructions. Car color swatches, the car wash and the fish tank are learned purely from touch.

## Cross-Story Dependencies

- **Depends on Epic 5**: Story 5.1 (tap-then-tap and stay-where-dropped), 5.3 (skippable animations), 5.4 (touch router), 5.5 (island decorations and placement, needed for the 6.4 fish tank) and 5.8 (free-play mode and `core/reactions`). Without them, each game has nothing to plug into.
- **Story 6.3** car color changes the island kart sprite on the Map. **Story 6.4** adds a tank object and an overlay on the Map. Both add ProgressStore schema fields; coordinate the migrations if they are built in parallel.
- **Story 6.1** Shiba frames should stay compatible with the later Shiba outfit work (Epic 8.2), where Shiba wears the outfit in Ice cream.
- Stories 6.1, 6.2 and 6.4 modify scenes that were already restyled or reanimated on 2026-10-16 (Pizza bake and eat, Fishing splash and line). Extend that work and do not regress it.
