# Epic 3 Context: Trò kéo và ghép – Làm pizza, Ghép khủng long, Tìm bóng

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Wake three sleeping island stations and ship three drag-and-drop mini-games for a 2–4-year-old. In **Làm pizza** the child drags the requested number of topping slices onto a base while the app counts aloud, then taps the oven so the fox can eat. In **Ghép khủng long** the child drags pieces into a ghost silhouette until a gentle dinosaur "comes alive". In **Tìm bóng** the child drags the animal or vehicle that a triceratops holds onto its matching purple-grey shadow at a bright cave mouth. Each game reuses the Epic 1 foundation unchanged (MiniGameBase + registry, DragController/drop-target, HintDirector, AudioDirector, the Blender→layout→atlas and TTS pipelines). A game adds only its scene, `content/games/<GameId>.ts` data and rendered assets. Each game supports a 3-level ladder and in-round resume snapshots. It must play a full round and return to the island whether or not Epic 2 exists.

## Stories

- Story 3.1: Đánh thức tiệm pizza – bé đếm topping, nướng bánh cho cáo ăn
- Story 3.2: Làm pizza – thang độ khó tới 5 lát, nhiều loại topping và lượt dở
- Story 3.3: Đánh thức công viên khủng long – ghép 3 mảnh cho khủng long sống dậy
- Story 3.4: Ghép khủng long – thang 3 → 4 → 6 mảnh và lượt dở
- Story 3.5: Đánh thức cửa hang – tìm bóng cùng khủng long ba sừng
- Story 3.6: Tìm bóng – thang 2 → 3 → 4 bóng giống nhau dần và lượt dở

## Requirements & Constraints

- **Waking a station:** the station in `content/stations.ts` switches from sleeping to awake. A tap on it gives a bounce, reads the station name and drives the kart (≤ 2s, ≤ 1.5s on later trips) while the shell loads `atlas.<GameId>` (+ `bg.<GameId>`). The idle invitation schedule may now pick the station. Stations that are still asleep keep their Epic 1 behaviour.
- **Pizza:**
  - The voice asks for a count and a topping ("Bé ơi, ba lát xúc xích nào!"). Each slice snaps into the next free spot of 8 faint spots on the base, and the voice counts that number ("Một!", "Hai!"…).
  - Bowls never run out. When the count is reached, `sayChain` re-counts the whole set seamlessly. Each slice bounces in time with its number.
  - Then the oven opens (`ready` with a hint ring) and the voice says *"Mình nướng bánh nào!"*.
  - A wrong topping floats back with `hint.wrong()`. An extra slice floats back with *"Đủ <n> lát rồi!"*. The placed count never decreases.
  - Tapping the oven before the base is full only gives a 1.05× nudge: it neither bakes nor counts as wrong.
  - Baking: a soft `oven-glow` rises for 0.4s and holds ~2s with no flashing, then "ting", steam, and the fox goes "măm măm" and wags.
  - If the oven is not tapped after ~6s, a ring appears, followed by the hand.
  - Ladder:
    - Level 0: 3 questions, 1–3 slices, sausage and mushroom.
    - Level 1: 4 questions, 2–4 slices.
    - Level 2: 5 questions, 3–5 slices, plus a third topping that differs in shape and brightness.
- **Dino puzzle:**
  - The species are long-neck, triceratops and stegosaurus only, with 3 per round in seed order. No T-rex, fangs or claws.
  - Pieces are 3 → 4 → 6 (6 = head, neck, body, front leg, back leg, tail). A piece matches only its own slot, in any order and with no rotation. When a drop point falls within the snap radius of several slots, the piece's own slot wins.
  - Wrong-slot drop: the piece floats back with `hint.wrong()`. Drop on grass: it stays where it lands. Drop off the play area: it slides back after ~1.5s.
  - Coming alive: blink → bounce → walk ≤ 120px (stays within `safeRect`) → small happy call → species name ("Khủng long cổ dài!"). The next dino then fades in over ~0.5s.
- **Shadow match:**
  - The triceratops (`creature-green`, ≥ 220px) fades and rises in over ≥ 0.8s.
  - There are 2–4 shadows in `shadow-target` `#5B4E96` on a bright `cave-mouth` background, with no dark areas.
  - Correct drop: the item snaps in, the shadow cross-fades to full colour (~0.4s), the triceratops bounces, nods and chirps, then the name plays ("Con mèo!").
  - Decoy drop: the item floats back to the triceratops's hand with `hint.wrong()`. Background drop: it slides back and is not counted as wrong.
  - Ladder (4 questions per round):
    - Level 0: 2 shadows from different `shapeGroup`s.
    - Level 1: 3 shadows from at least 2 groups.
    - Level 2: 4 shadows from the same group, each distinct in silhouette (horn, mane, tail…).
  - No item repeats within a round. The correct shadow never stays in the same position as in the previous question.
  - The catalogue must not include balloons, balls or flowers (to avoid confusion with "bóng"/"bông").
- **Hints (4 levels, shared):**
  - Level 2 shows a ring on ONE target: the correct bowl, the first unplaced piece (its slot also gets a dashed highlight), or the correct shadow. Background motion stops.
  - Level 3 shows the hand demonstrating the drag.
  - Level 4 fades distractors to 60% with `setPickable(false)` and applies `setSnapScale(target, 2)`. For dinos there are no distractors, so nothing fades. The app never completes the task for the child.
- **Voice:**
  - New lines go in `content/voice-lines.ts`, one file per combination (e.g. every topping × count 1–5, `vo.pizza.enough.<n>`, `vo.shadow-match.ask|name.<itemId>`).
  - Lines are ≤ 8 words with the keyword last (~300ms pause), ~0.85× speed, ≈ −16 LUFS.
  - Never "sai"/"không đúng" and no praise. No banned homophone pairs (ba/bà, bóng/bông…).
  - "pizza", "xúc xích" and "năm lát nấm" need adult review; replace a line that fails review.
- **Creature SFX:** ≤ 0.8s, nothing below 150Hz, never louder than the voice, fade-in ≥ 50ms, no roars.
- **Safety and accessibility:** no red, ✗, shake or "wrong" sound. One prominent motion at a time. Flashing ≤ 1Hz. Honour `prefers-reduced-motion` (smaller bounces, static oven smoke, dino walk replaced by an on-the-spot bounce). Never rely on colour alone.
- **Touch and layout:**
  - Draggables are displayed at ≥ 90px with hit areas ≥ 80px. Gaps are ≥ 24px. The snap radius is 100px.
  - Everything stays inside `Tokens.safeRect`, outside the edge dead zones and the ~120×120 areas around Home and Speaker.
  - Shadows are ≥ 120px. The character is ≥ 220px at centre-back, with props in the lower third.

## Technical Decisions

- **Game contract:**
  - Register `pizza`, `dino-puzzle` and `shadow-match` in `games/registry.ts` with `ladder` + `assets`.
  - The scene key equals the `GameId`, which equals the `stationId`.
  - Games never call `scene.start/stop/launch` or `this.load.*`; the shell starts them with `{ level, seed, resume? }`.
- **Terminal events:**
  - Emit exactly one `round:complete { gameId, questions, firstTryCorrect, maxHintLevel }` AFTER the celebration (~1.5s), or one `round:abandon { gameId, snapshot }` on Home. The game then goes inert.
  - `firstTryCorrect` counts questions with zero `hint.wrong()` calls (for pizza, the oven step included). `maxHintLevel` is the highest level reached in the round.
  - Games must not import anything from Epic 2.
- **Difficulty:** only `nextLevel(current, outcome, ladder.length=3)` decides difficulty. Games contain no difficulty logic.
- **Determinism:** questions, species order and start positions derive from `seed` + `level`. Vitest tests in `content/` cover the generators (determinism, no consecutive repeats, ladder edge cases, no piece starting inside its own snap zone).
- **Snapshot:**
  - Shape: `{ v: 1, level, seed, questionIndex, partial }`, plain JSON with no object references.
  - Pizza `partial = { placed: [slot indices], baked }`. Dino `partial = { placed: [pieceId…] }`. Shadow `partial = {}`.
  - On resume: restore the progress, replay the prompt and restart hints at level 0. Pizza does not re-count slices already placed.
  - An invalid `partial` restarts that question cleanly and logs `console.warn`, with no error shown.
- **HintDirector:**
  - The game calls `beginQuestion({ promptLineId, retryLineId, step:{correct, distractors, target, action} })`, `wrong()`, `stepDone(nextStep, {promptLineId?, retryLineId?})` and `questionDone()`.
  - Pizza uses `stepDone` to switch to the oven `tap` step with `vo.pizza.bake` / `vo.pizza.enough.<n>`.
  - Games never play prompt or retry voice themselves. The game stops background motion at hint level ≥ 2 (it listens to `hint:level`).
- **Audio:** `say`/`sayChain` (chains are only for counting and names) and `sfx` ids are `sfx.<GameId>.<name>`, registered in `content/audio-catalog.ts`. There is no `this.sound.*`.
- **Assets:**
  - Each game has `art/<GameId>.blend` with `anchor.*`, `slot.*` and `hit.*` objects. `tools/render` produces `content/generated/<GameId>.layout.json`; nobody enters coordinates by hand.
  - `tools/atlas` produces frames named `<object>/<state>/<nn>` (e.g. fox `idle|happy|eat`, oven `rest|ready|baking`, base `raw|baked`; dino `idle|blink|happy|walk` + ghost + pieces; shadow items `color|shadow`).
  - Atlas pages are ≤ 2048², and each file is ≤ 8 MiB.
  - Creatures are recoloured with `creature-*` (fox `creature-orange` with a white belly/muzzle; triceratops `creature-green`).
  - Tokens used: `ghost-fill` at 35% with a 4px dashed white line, `shadow-target` on `cave-mouth` (≥ 5:1, measured on the real render), `oven-glow`, and a `counter-top` tray.
- **Gate:** `npm run check` (tsc, ESLint, Vitest, content/layout validators, tokens diff, precache) must pass for every story. Missing assets are skipped with `console.warn`.

## UX & Interaction Patterns

- **Drag feel:** on pickup the item scales to 1.1× and gets a drop shadow. On snap it eases out over 0.2s with a 1.05× bounce and a "pụp" within 100ms. A wrong target floats the item back over ~0.5s. A drop on the counter or grass stays put (nudged so items do not overlap). A drop outside the play area slides back after ~1.5s.
- **Celebration:** the character bounces 1.0→1.12→1.0 twice over 0.8s with 1–2s of music. There is no praise or confetti; the voice only names what the child made.
- **Speaker:** it replays the current prompt without resetting the hint level. In the oven step it replays *"Mình nướng bánh nào!"*.
- **Hint ring:** three layers (white core, `#5B21B6` purple line, white halo), and at least one layer must reach 3:1 against the background (including `cave-mouth`). Only one ring shows at a time, and it stays until the answer is correct.

## Cross-Story Dependencies

- **Prerequisites:** Epic 1 must be complete. The work needs the registry, MiniGameBase guard, DragController/drop-target, `setPickable`/`setSnapScale`, HintDirector, hint-visuals, AudioDirector `sayChain`, `core/motion`, both pipelines and the check gate. Blender must be installed for `tools/render`.
- **Pairs:** 3.1→3.2, 3.3→3.4 and 3.5→3.6 are independent of each other. The first story of each pair ships a temporary 1-level ladder, and the second replaces it with the full 3-level ladder plus snapshot/resume.
- **Epic 2 (optional at runtime):** persisting difficulty, decorations, `PlayAgainOverlay`, and the Map storing and passing `resume` (Story 2.5) all activate automatically when Epic 2 exists. Resume is verified on the game side via `scene.start(id, { level, seed, resume })`.
