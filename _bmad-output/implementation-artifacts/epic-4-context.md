# Epic 4 Context: Trò chạm và vạch – Đường đua, Câu cá, Chạm là nói

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The last three sleeping stations on the island (checkered gate, fish pond, street) wake up and become playable. In **Đường đua** the child traces a finger along a ready-made road so the kart, with its little driver, drives to the checkered gate; the kart never leaves the road and lifting the finger never loses progress. In **Câu cá** the child taps the fish whose colour/pattern or size was called and hears its name. In **Chạm là nói** the child freely taps objects in three scenes (sea, street, kitchen) to hear their Vietnamese names, and every ~8 distinct objects earns an island decoration. Each game is a standard `MiniGame` built on the existing core services, so the epic proves the touch/trace primitives and the no-round reward path. Every game must stay fully playable without Epic 2's reward feedback.

## Stories

- Story 4.1: Đường đua – vạch đường thẳng cho kart chạy tới cổng caro
- Story 4.2: Đường đua – thang hình dạng đường và giữ vị trí kart khi lượt dở
- Story 4.3: Câu cá – chạm câu đúng con cá theo màu và hoa văn
- Story 4.4: Câu cá – câu theo kích thước, thang 3→5 cá và giữ câu dở
- Story 4.5: Chạm là nói – cảnh biển, chạm vật nghe tên
- Story 4.6: Chạm là nói – ba cảnh, nút đổi cảnh và món trang trí sau ~8 vật

## Requirements & Constraints

- **Đường đua (race):**
  - Prompt *"Bé lái xe tới cổng nhé!"*. The `trace-path` is 100px wide; the kart starts at one end and the checkered gate is at the other.
  - The kart follows the nearest projected point on the road and only moves forward. It searches only the segment just ahead of it, so it never jumps to another part of the road that happens to be near the finger (loops, zigzag corners).
  - Finger tolerance: up to 80px off-centre the kart follows closely; 80–140px it moves at half speed; over 140px it stops as if the finger lifted.
  - On lift the kart waits and blinks gently (≤ 1Hz). Putting a finger back within ~100px of the kart continues; further away does nothing. The road already driven is brighter.
  - There is no "wrong": the game never calls `hint.wrong()` and the kart never drives itself, so `maxHintLevel` is at most 3.
  - Shape ladder (4 levels): almost straight → gentle curve → zigzag → loop, with 3–5 roads per round. Two consecutive roads are never the same. At the gate the driver waves and a happy horn plays.
- **Câu cá (fishing):**
  - 3–5 fish swim at ≤ 60px/s inside a safe swim polygon, at least 24px apart. At least one correct fish is always present and the correct fish never leaves the screen.
  - Each colour has its own pattern and clearly different brightness. Each fish comes in two sizes: big ≈ 1.6× small, and small is shown at ≥ 100px. The hit area is the sprite + 30px.
  - Hit-test also against each fish's position 150ms earlier; if two fish are hit, the one whose centre is nearest wins.
  - Prompts ask for colour + pattern (*"Câu con cá vàng sọc nào!"*) or for size (*"Câu con cá to nào!"*), never both. A size question includes a small fish of the same colour as a big one.
  - Wrong fish: it dives (sinks and fades, with bubbles), can't be tapped while diving and resurfaces after ~3s. Tapping the water gives a ripple and "tõm", is not counted, and does not call `wrong()`.
  - Correct fish: the line reels it up, it wriggles, its name is read (*"Cá vàng nhỏ!"*) and it jumps happily.
  - Ladder: 3 clearly different colours → size questions with 3–4 fish → mixed colour/size with 4 fish → 5 fish. A question is "first try correct" when the first fish tapped is the right one (water taps don't count).
- **Chạm là nói (touch-talk):**
  - No prompt, no right/wrong, no hints, no rounds, and no difficulty entry. Each scene has 8–12 props.
  - Tapping a prop makes it bounce 1.1× for 0.3s and plays its sound within 100ms, then its name is read. Tapping the background does nothing.
  - After ~15s idle, one random prop wiggles silently; this repeats every ~15s and any tap resets the clock.
  - Speaker replays the last name read, or the scene name (*"Biển!"*) if nothing has been tapped yet.
  - Every ~8 **distinct** props (threshold from content, counted across all scenes) emits one `reward:earned` and resets the counter. Re-tapping a prop doesn't count; 16 distinct props → exactly 2 rewards.
  - The Home button is the only way out. Closing the app resets the game to the sea scene with a count of 0.
- **Shared rules:**
  - Hit areas are at least 80px with gaps of at least 24px. First finger wins.
  - A touch that starts in a dead zone (24/32/40px + safe-area) does nothing. Roads, fish and scene buttons stay out of the dead zones and out of the ~120×120px area around Home/Speaker.
  - Every touch gets feedback within 100ms.
  - Only one prominent motion at a time; at hint level ≥ 2 all background motion stops. Flashing stays at or below 1Hz and no light/dark area larger than 25% of the screen flips quickly.
  - With `prefers-reduced-motion`, amplitudes and speeds drop, the moving road highlight becomes a static fade, bubbles become a fade, and slides become fades.
  - Voice lines: at most 8 words, keyword last, no banned near-homophone pairs (cá/cà, cam/cầm…), never "sai", no praise.
  - The game counts as done only when `npm run check` passes.

## Technical Decisions

- **MiniGame contract:**
  - Games `race`, `fishing` and `touch-talk` are registered in `games/registry.ts` with their `ladder` (none for touch-talk) and `assets`, and `stationId === GameId`.
  - Only the shell starts games, using `scene.start(gameId, { level, seed, resume? })`. Games never call `scene.*` or `this.load.*`, and never call `this.sound.*`.
  - race and fishing emit exactly one `round:complete { gameId, questions, firstTryCorrect, maxHintLevel }` after the celebration, or `round:abandon` on `hud:home`, and then go inert. Earlier roads/questions end with a short celebration followed by `hint.questionDone()`.
  - touch-talk never emits `round:complete`.
- **Input:**
  - Use only `core/input` primitives: `TracePath` for race and `TapTarget` for fishing and touch-talk. If `TracePath` doesn't exist yet, Story 4.1 implements it with Vitest coverage of projection and tolerance.
  - Pickability changes only through `InputGuard.setPickable` (hint level 4 dims wrong fish).
- **Hints:**
  - race and fishing call `HintDirector.beginQuestion({ promptLineId, retryLineId?, step: { action: 'trace'|'tap', correct, distractors, target, path? } })`. HintDirector plays all prompt and retry voice, and its clock starts on the matching `speechEnded`.
  - Games listen to `hint:level` to stop background motion.
  - touch-talk does not use HintDirector at all. It calls `audio.say` and `audio.setPrompt` directly, and its idle clock uses scene `time` (never `setTimeout`).
- **Audio:** there is a single voice channel. A new tap waits if the current line has less than 0.5s left; re-tapping the prop being named skips its voice; bounce and SFX still play immediately. Music ducks by ≥ 18dB under voice.
- **Rewards (touch-talk):**
  - The game emits `reward:earned { gameId: 'touch-talk' }`. On `reward:granted { gameId, decorationId }` (subscribed via `bus.scoped(scene)`), that exact item appears next to the last prop with a fading `sparkle` and flies off-frame (~1s) while play continues. No reply means nothing is shown and nothing breaks.
  - `reward-service` (Epic 2) pushes to `SessionStore.pendingFlyIns`.
- **Resume snapshot:**
  - Shape: `{ v: 1, level, seed, questionIndex, partial }`, plain JSON. Questions derive deterministically from `seed`.
  - race: `partial: { traceIndex }`. The kart is restored to within 1 sample point, the driven segment stays lit, the kart is waiting, the prompt replays and the hint level is 0.
  - fishing: `partial: {}`, resuming the same question.
  - touch-talk: `partial: { sceneId, touchedIds }`.
- **Difficulty:** `nextLevel` in Map: +1 when every question was first-try correct, −1 when any question hit hint level 4, clamped to the ladder.
- **Content as data:**
  - Ladders live in `content/games/{race,fishing,touch-talk}.ts`. Voice ids look like `vo.race.prompt`, `vo.race.retry`, `vo.fishing.prompt.size.*`, `vo.fishing.name.<color>-<size>` and `vo.touch-talk.name.<propId>`. Every colour × size combination used is its own line, file and hash.
  - SFX are `sfx.race.horn`, `sfx.race.engine`, … in `content/audio-catalog.ts`. Every value comes through `Tokens` / `Tokens.Timing` (for example `components.trace-path.width`, `components.fish.speed-max` and `hit-pad`).
- **Assets:**
  - Sources are `art/race.blend`, `art/fishing.blend` and `art/touch-talk.blend` (Kenney/Quaternius CC0, recoloured with `creature-*`, no red mark around the fishes' mouths). `tools/render` then `tools/atlas` produce `content/generated/<id>.layout.json` and `atlas.<id>`.
  - Frames: `kart/idle|wave`, `gate/idle`, `fish-<color>-<size>/swim|dive|caught`, `<propId>/idle|react`.
  - Backgrounds: `bg.race`, `bg.fishing`, `bg.touch-talk.{sea,street,kitchen}`.
  - Layout anchors and hit areas:
    - race: `anchor.path.<shape>-<n>.<nn>` points.
    - fishing: `hit.pond-swim` plus anchors for the dock and rod.
    - touch-talk: `hit.prop.<propId>`.
  - Atlas pages are at most 2048² and each file at most 8 MiB.
- **Validators (`npm run check`):** `check` fails when:
  - any point of a 100px road falls outside `Tokens.safeRect`, in a dead zone or in a button area;
  - a `pathId` used in content has no anchor;
  - the swim polygon, shrunk by half a big fish plus 30px, breaks those same bounds;
  - a prop hit area is under 80px or closer than 24px to another, or overlaps the scene-bubble column;
  - a voice line, its file and its hash don't match, or a banned homophone appears.

## UX & Interaction Patterns

- **Race hints:**
  - Level 2: `hint-ring` around the kart, plus the centre line ahead gradually lights up.
  - Level 3: a 72px `hint-hand` traces a stretch ahead of the kart, looping ~15s.
  - The road surface uses `road`, with a 6px `road-edge` border and a `road-dash` centre line.
- **Fishing hints:**
  - Level 2: ring around the correct fish, which slows down while the other fish stop.
  - Level 3: the hand taps the correct fish.
  - Level 4: wrong fish fade to 60% and can't be tapped.
  - The ring persists until the answer is correct.
- **Scene bubbles:** 3 round 88px buttons run down the right edge below Speaker (starting under top 120), with gaps ≥ 24px. Each shows a scene thumbnail, and the current scene has a thin hint-ring.
  - Tapping another scene slides horizontally (~0.6s) and reads the scene name. Tapping the current scene only re-reads its name. Prop taps during a slide are ignored.
- **Characters:** celebrations bounce 1.0→1.12→1.0 twice over 0.8s, with 1–2s of music.
  - The kart driver has a bright face, big eyes and a colourful hat.
  - Fish jump out of the water and wriggle.
  - There is no confetti, red, ✗ or "wrong" sound.

## Cross-Story Dependencies

- **Built on Epic 1:** the shell, Map, kart drive, Hud, AudioDirector, HintDirector, hint-visuals, InputGuard (`TapTarget`; `TracePath` may still be missing), tokens, the render/atlas/TTS pipelines and the check gate. Each first story (4.1, 4.3, 4.5) wakes its sleeping station.
- **Within each game:** each second story extends the first: 4.2 builds on 4.1, 4.4 on 4.3 and 4.6 on 4.5. It adds ladder/scene assets to the same `.blend`, uses the same deterministic `seed` generation, and implements the abandon snapshot on the game side.
- **Epic 2 (optional at runtime):** persistent difficulty, `reward-service` (`reward:granted`, `pendingFlyIns`), and Map passing the resume snapshot back. Games must work and pass their tests without Epic 2; resume is verified by starting the game with `resume` directly.
- **Independent of Epic 3:** Epics 3 and 4 can be done in either order.
