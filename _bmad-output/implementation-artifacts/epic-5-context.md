# Epic 5 Context: Mọi trò đều dễ chạm, vui khi "sai" và có giờ chơi tự do

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epics 1–4 shipped seven playable games. A parent reported they don't hold a 3-year-old's interest for long. Epic 5 adds a shared experience layer to all of them and to the island map. Moving things gets easier: the child can tap the item and then tap where it goes, and lifting a finger mid-drag no longer sends the item back. Choosing the wrong thing gets a funny character reaction instead of a "wrong" signal. Correct answers get a random reaction each time. When a round's questions run out, the game stays open in a quiet free-play mode. Anything on screen reacts when tapped. A chibi Shiba greets "Xoài ơi" on the island. Rewards become occasional surprises: the child picks one of two items and places it on the island herself. The island also gains station landmarks and gentle motion. Epic 6, which adds per-game reactions and free-play rules, and Epic 7, the new Nhà Xoài games, both build on this framework. So the work here should be generic core mechanisms plus a minimal per-game hookup.

## Stories

- Story 5.1: Chạm-rồi-chạm và vật không bật về khi nhấc tay
- Story 5.2: Shiba dẫn đường chào "Xoài ơi" và giọng đọc gọi tên Xoài
- Story 5.3: Lời ngắn, chạm là không phải chờ
- Story 5.4: Chạm gì cũng có phản ứng
- Story 5.5: Quà bất ngờ, bé chọn 1 trong 2 và tự đặt lên đảo
- Story 5.6: Đảo sinh động – dấu hiệu trạm và chuyển động nền
- Story 5.7: Câu mời bố mẹ cùng chơi
- Story 5.8: Khung chơi tự do, phản ứng "chọn khác" và phản ứng ngẫu nhiên

## Requirements & Constraints

- **Tap-then-tap (FR29, NFR2):** any "bring item to place" action works two ways:
  - **Drag**, as today.
  - **Tap the item, then tap the destination:**
    - The tapped item lifts (scale up plus a selection ring) within 100ms.
    - Tapping a valid target is handled exactly like a drop there, with the same outcome.
    - Tapping elsewhere in the play area moves the item there and it stays.
    - Tapping the item again deselects it.
  - **Dropping mid-drag** inside the play area leaves the item where the finger lifted. It is nudged slightly so items don't overlap, and question progress is kept.
  - **Dropping outside the play area** (dead zone, off-frame) still slides the item back.
  - Applies to every drag game: ice-cream, pizza, dino-puzzle, shadow-match.
- **Hints with tap-then-tap:** a wrong target tap counts as one wrong drop, so the hint ladder climbs the same way. The level-3 hand demonstrates tap-item, then tap-target.
- **Touch sizing (NFR1):** tap targets aim for about 2 cm. Draggable items stay at least 90px. Nothing important sits near the bottom edge (keep the existing 40px band). First finger wins everywhere (the multi-touch exception is Epic 7's band game only).
- **Everything reacts (FR33, FR53):**
  - Tapping any character or sprite that isn't the current target makes it bounce, with a small "pụp" sound, within 100ms. This is not a wrong choice and never climbs hints.
  - Tapping empty background shows a small fading light ripple at the finger, at most 1Hz and silent.
  - Island decorations shake and play a sound by type. They never open a station or block taps on a neighbouring station.
- **Wrong choice is fun (FR30):** each game has its own comic character reaction, followed by a short re-prompt. There is never a "wrong" sound.
- **Correct reactions (FR31):** each game has at least 3, picked at random with a seeded rng and never the same one twice in a row.
- **Free play (FR32):** after the last question of a round:
  - The game emits `round:complete`, so rewards and difficulty are saved as before, but stays on screen.
  - The voice goes silent and targets turn off, but the items stay playable.
  - Home returns to the island, and the post-round chain runs there.
  - Games without their own free-play rules yet just stay on screen with tap reactions.
- **Short lines, no waiting (NFR15):**
  - Prompt lines run about 2–4s. A content validator flags prompts over 4s, measured from the audio file length.
  - Input is never blocked while a prompt plays. If the child already answered correctly, the prompt fades out within 200ms.
  - The hint timer still starts only after the prompt ends or is interrupted.
  - Any celebration or transition longer than about 1.5s (a `Tokens.Timing` value) can be skipped with a tap: it jumps to its end state. Skipping never skips progress persistence.
- **Name "Xoài" (FR36, NFR3):** the name appears in the island greeting ("Xoài ơi, chơi gì nào?"), station invitations ("Xoài ơi, … nào!") and at least one prompt per game. It is **never** used in praise: there is still no praise at all. This overrides the PRD's "Xoài giỏi quá" example. Lines stay at most 8 words and pass the homophone and banned-phrase validators.
- **Guide Shiba (FR34):** a chibi Shiba on the map waves and greets once per session on the first map entry. It waves again with each idle invitation. Tapping it makes it bounce with a small "gâu".
- **Parent prompt (FR35):** each game has 1–2 lines inviting a parent to join ("Hỏi mẹ xem…", "Chỉ cho bố xem…"):
  - At most 1 per round.
  - Played only at round start or during free play, never between a prompt and its hints.
  - On by default through a content constant.
- **Surprise rewards (FR22/FR23 replaced, FR52):**
  - Not every round gives a reward. The chance comes from `Tokens`.
  - The first round of each game in a session always gives one.
  - The same item never comes twice in a row.
  - Rewards are saved on the device and placed into the station's existing slots. The "replace the oldest item when full" rule stays.
- **Island life (FR37, NFR11):** each station gets a large landmark (ice-cream cone, pizza chimney, race flag, …). The island gains toy-coloured paths, a fountain, swim rings and a chibi whale. Ambient motion (clouds, waves, a periodic whale spout) shows only one prominent motion at a time and is reduced under `prefers-reduced-motion`. Background contrast checks must still pass.
- **Done when:** `npm run check` passes, with Vitest coverage for every new pure model.

## Technical Decisions

- **Input core:** tap-then-tap and lift-stays live in `core/input/drag-controller` as shared behaviour, not per game.
  - Tap vs drag is decided by a movement threshold below which a press counts as a tap.
  - Tests cover tap-select, tap-target, deselect, mid-drag lift stays, and out-of-area return.
  - The new pickup visual reuses the selection-ring/hint-ring vocabulary.
- **Tap routing (5.4):** a pure tap router classifies each tap as current target, ordinary sprite, or background, and is tested in Vitest. It must not interfere with `InputGuard` pickability or HintDirector counting.
- **Reactions (5.8):** a new `core/reactions` picker takes a per-game list of "correct" and "chose-other" reactions and a seeded rng, and never repeats the last pick. Free-play mode is a `MiniGameBase` concern so every game inherits it. The sample game for tests is ice-cream.
- **Rewards (5.5):**
  - Extend `reward-service`: a probabilistic grant with an injectable rng, first-of-session forced, and a no-repeat rule, tested with a fixed rng.
  - On the map, the post-round chain shows 2 candidate items (≥ 120px, well apart) beside the station:
    - The child taps one, and the other flies away.
    - The chosen one moves by tap-then-tap or drag into an empty slot she picks. Slots light up while the item is held.
    - After about 10s idle, Shiba points at one item.
  - Persist immediately to `ProgressStore`. The item must reappear in the same slot after a reload.
- **Content/TTS (AR-N3):** every new line, including those with "Xoài", is added through `content`, then `npm run content:export` and `npm run tts`. The `.m4a` and `.hash` files must exist, and `audio:check` and `validate:content` must pass.
- **Numbers (AR-N4):** all new behaviour numbers go in `Tokens` / `Tokens.Timing`: tap threshold, lift scale, nudge, skip threshold, reward probability, ripple, ~10s choice hint and fade-out. The `no-magic-numbers` lint enforces this.
- **Art (NFR9, replaced):**
  - Soft "cute toy" style: rounded, smooth shading (edges over 65° stay sharp), chibi characters with big heads, big eyes and pink cheeks, bright pastels.
  - Sources are Tiny Treats / KayKit / Kenney / Quaternius CC0 plus models built through `tools/render/blender/cute.py`. Build files contain no subdivision modifiers.
  - Map work goes through `build_map.py` with `art/src/map-v3.blend` (`npm run art:build -- map`, then render and atlas). The reference look is `.working/render-ban-do-v4.png`.
  - Atlas pages stay at most 2048². New dressing must not overlap station or decoration hit areas, which the layout validators enforce.
  - The Shiba guide sprite (wave frames) is new map art.
- **Existing conventions still apply:**
  - Games never call `scene.*`, `this.load.*` or `this.sound.*`. Voice goes through AudioDirector's single channel.
  - Timers use scene `time`, never `setTimeout`.
  - Layout ids are kebab-case.
  - Subscribe to the Bus with `bus.scoped(scene)`.

## UX & Interaction Patterns

- **Feedback:** the bounce reaction uses the existing token scale bounce (about 1.1×). The selection ring follows the hint-ring style. Flashing stays at or below 1Hz, and no red, ✗ or "wrong" sound is ever used.
- **Reward choice:** 2 large items appear near the station. Choosing one makes the other fly off, and the valid empty slots glow while the item is held.
- **Free play:** the child sees no change of mode. The voice simply goes quiet and the items keep responding. Home is the only exit.

## Cross-Story Dependencies

- **Within Epic 5:**
  - 5.1 (tap-then-tap) is needed by 5.5's item placement.
  - 5.4 (tap reactions) is the free-play fallback in 5.8 and the decoration reaction in 5.5.
  - 5.2's map Shiba is reused by 5.5 (pointing hint) and later by Epic 8 (8.2 dress-up).
  - 5.2 and 5.7 both add content lines and should share one TTS pass if built close together.
  - 5.6 touches only map art and ambient motion.
- **Later epics:** Epic 6 plugs per-game reactions and free-play rules into the 5.8 framework (`core/reactions`, `MiniGameBase` free-play). Epic 7 needs 5.1 and 5.8.
- **Existing systems changed:** `drag-controller`, the HintDirector/hint hand demo, `MiniGameBase` (round completion now keeps the scene alive), `reward-service` and `post-round-chain` (choice-and-place step replaces the automatic fly-in), the map decoration rendering, AudioDirector (prompt interruption/fade) and the content validators (4s prompt limit, Xoài-in-praise check).
