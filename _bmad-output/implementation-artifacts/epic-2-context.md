# Epic 2 Context: Đảo đẹp dần và app nhớ bé

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

After a finished round the island visibly grows, and the app remembers the child between sessions. The character celebrates, the camera pulls back to the island, and a low-poly decoration flies by itself into a predefined slot near the station just played. When a station's slots are full, the oldest item floats away like a balloon and the new one takes its place. Decorations and per-game difficulty persist across app restarts. A "Hỏi chơi tiếp" overlay offers replay or "go elsewhere", nudges once and closes itself. Pressing Home mid-round keeps an in-session resume point. The epic builds the durable `ProgressStore`, the decoration catalog and slots, `reward-service`, Map's post-round chain, `PlayAgainOverlay` and `SessionStore` snapshots. It is proven on Tiệm kem, and Epics 3/4 must be able to reuse all of it without contract changes, including the `reward:earned` path that Chạm là nói will use.

## Stories

- Story 2.1: ProgressStore lưu bền vững và nhớ độ khó qua các lần mở app
- Story 2.2: Danh mục trang trí, ô trên đảo và reward-service trao thưởng lưu ngay
- Story 2.3: Chuỗi sau lượt trên bản đồ – lưu độ khó, camera lùi, trang trí bay vào
- Story 2.4: Lớp phủ "Hỏi chơi tiếp" với lời mời, nhắc lại và tự đóng
- Story 2.5: Giữ lượt dở trong phiên và tiếp tục đúng câu đang dở

## Requirements & Constraints

- **Difficulty persistence:** after each round, the level goes +1 if every question was right first try, −1 if any question reached hint level 4, and otherwise stays the same, clamped to the game's ladder. It survives app close/reload. `touch-talk` has no difficulty.
- **Storage failure is silent:** in Safari Private mode, on a throwing `localStorage`, on full quota or on corrupt JSON, fall back to memory-only for the session with a single `console.warn`. The child never sees or hears an error. Corrupt data is replaced by defaults on the next write. If iOS wipes PWA data, the island simply starts empty again.
- **Rewards:**
  - One decoration per completed round (3–5 questions), or per ~8 distinct touches in Chạm là nói.
  - It is saved immediately, before any animation, so it survives an app kill mid-animation and is never granted twice.
  - Saved decorations render statically on the Map. An empty island shows no placeholders, ghost frames or "missing" markers.
  - Tapping a decoration makes it bounce 1.1× (~0.3s) with a happy sound within 100ms. It never opens a game or triggers a station.
  - There is no collection screen and no ⭐ button.
- **Post-round timing:**
  - The sequence is: celebration ~1.5s → camera pull-back ≤ 1.5s → fly-in ~1s → overlay.
  - The total from the start of the celebration to the overlay is ≤ 4s, so `round:complete` to chain end must take ≤ 2.5s. Measure it with dev-build timing logs.
  - No confetti and no praise.
- **Overlay:**
  - Two 160px buttons sit side by side with a 48px gap, above the station just played (so the new decoration stays visible), on a 15% dim. They stay inside `safeRect` and outside the dead zones.
  - The replay button bobs and plays the "Chơi nữa với bạn <character> nhé?" line. Then the map button bobs and plays "Hay mình đi chỗ khác?".
  - After ~10s idle (counted from the end of the second line), the question repeats once and the hint ring alternates between the two buttons, one ring at a time. After ~30s total idle, the overlay fades out and the Map invitation schedule resumes.
  - The overlay never appears after `round:abandon` or for `touch-talk`.
- **Resume:** Home mid-round keeps the exact question and partial progress for the session only. A small static indicator ring marks that station on the Map; it must not blink and must look different from the invitation hint ring. Several games can hold a resume point at once. App close loses them all.
- **Motion safety:** flashing stays ≤ 1Hz. Sparkles fade out and never blink. Only one prominent motion runs at a time, so other stations stop idling during a fly-in. With `prefers-reduced-motion`, the camera move becomes a fade, decorations fade in at their slot, and replaced items fade out in place, still within ≤ 4s.

## Technical Decisions

- **ProgressStore (`core/progress-store`):**
  - It is the only module that touches persistent storage; lint fails on `localStorage`, `indexedDB` or `navigator.storage` anywhere else.
  - It uses one key, `bhc.progress`, holding `{ schemaVersion, seq, difficulty: Partial<Record<GameId, number>>, decorations: DecorationSlot[] }`. Every action writes synchronously, with no debounce.
  - `init()` runs from `Start` on the first tap and is the only caller of `navigator.storage.persist()`. A rejection or a missing API only warns.
  - Defaults are `{ schemaVersion: current, seq: 0, difficulty: {}, decorations: [] }`.
  - Migrations run step by step (v1→v2→…) and the result is written back immediately. A `schemaVersion` newer than the app knows means use in-memory defaults and never overwrite the stored key. Vitest fixtures cover each migration step.
  - `getDifficulty` clamps on read without writing (missing key = 0). `setDifficulty('touch-talk', …)` is a no-op.
- **`nextLevel(current, outcome, ladderLength)`** in `core/difficulty.ts` is pure and called only by Map. Vitest covers all 3 branches and both bounds.
- **Decorations:**
  - `DecorationSlot = { slotId, stationId, decorationId, seq }`. `seq` comes from the document's monotonic counter and never from the clock.
  - `grantDecoration(stationId) → { slot, replaced? }` fills the first empty slot in `slot.<stationId>.<n>` order. When none is empty, it replaces the lowest-`seq` slot of that same station and never touches another station's slots.
  - The item is the next catalog entry after the station's highest-`seq` item, cycling back to the start.
  - The catalog lives in `content/decorations.ts` with a fixed order per station. 3–5 slots per station is an assumption until content review.
- **Assets and layout:**
  - `art/map.blend` gains `slot.<stationId>.<n>` objects for all 7 stations. `tools/render` writes their anchors into `content/generated/map.layout.json`, and `tools/atlas` puts frames `decoration/<decorationId>/<nn>` into `atlas.map` (pages ≤ 2048²).
  - The validator fails when a registered station has 0 slots, a slotId has no anchor, a slot lies outside `safeRect`, inside a dead zone or overlapping any station polygon, an item displays below 80px, or a station's catalog is empty.
  - A saved `decorationId` that is missing from the catalog or atlas is skipped with `console.warn`.
- **reward-service (`core/reward-service`):**
  - It subscribes globally at boot and is not a scene. It is the only caller of `grantDecoration`.
  - On `round:complete` or `reward:earned` it grants first, then pushes the result to `SessionStore.pendingFlyIns`. For `reward:earned` it also emits `reward:granted { gameId, decorationId }`.
  - Each event must produce exactly one grant, with no duplicates when listeners re-register after a replay.
- **Map post-round chain:** a single awaited sequence:
  1. `setDifficulty` (synchronous, on receipt).
  2. Clear `resume[gameId]`.
  3. Stop the game and release its assets.
  4. Camera pull-back through `core/motion`, with the kart parked at the station.
  5. Animate each `pendingFlyIns` entry, removing it once played.
  6. An `onChainEnd` hook, which opens the overlay.

  Station taps during the chain are queued and only the last applies at the end, with no overlay. The Speaker stays live through `audio.replayPrompt()`.

  On `round:abandon` with pending fly-ins, Map still pulls back and plays them about 0.3s apart, with no `setDifficulty` and no overlay. A pause from `AudioUnlockOverlay` (`scene.pause()`) freezes the chain mid-step.
- **PlayAgainOverlay:**
  - It has no interactive backdrop. A tap on a station polygon falls through to the Map hotspot, and Map emits `overlay:close`. Taps on empty space or decorations do not close it.
  - Replay clears `resume`, uses the level from `ProgressStore.getDifficulty` with a new seed, and zooms back in (~1.5s, or a fade with reduced motion). First finger wins, so the game can never start twice.
  - The question is registered with `audio.setPrompt`, using voice lines `vo.shell.play-again-ask.<gameId>`.
  - Ring visuals come from `core/hint-visuals`. Timers run on scene `time`, never `setTimeout`. Every duration comes from `Tokens.Timing`.
- **SessionStore and Snapshot:**
  - `SessionStore` is memory only and holds `resume: Partial<Record<GameId, Snapshot>>`, `pendingFlyIns` and `lastStation`.
  - Only Map writes a snapshot (on `round:abandon`) and only Map clears it (on that game's `round:complete`, or when starting without resume).
  - `Snapshot = { v: 1, level, seed, questionIndex, partial }` is plain JSON. Vitest checks that a JSON round-trip deep-equals the original.
  - The `Snapshot` type also declares the `touch-talk` partial (current scene plus distinct touched ids) so Epic 4 can reuse it.
  - Resume always uses `snapshot.level`, even when `ProgressStore` holds a different level. The question is rebuilt deterministically from `seed`, and HintDirector restarts that question at level 0 and re-reads the prompt.
- **Home edge case:** pressing Home during the final celebration, before `round:complete` has been emitted, completes the round instead of abandoning it. Each game start still emits exactly one ending event, and the game is inert afterwards.
- **Gate:** every story must pass `npm run check`.

## UX & Interaction Patterns

- **Overlay buttons:**
  - `button-replay`: 160px, `colors.button-replay` (green is an assumption). Its icon is the game's character (Shiba for Tiệm kem) with a small circular arrow in one corner.
  - `button-back-to-map`: 160px, `colors.button-map`. Its icon is a small island with the kart.
  - Both use the `button-round` press style: 0.9× and spring back.
- **Fly-in:** the item flies from the station toward its slot anchor (~1s ease-out) and lands with a slight bounce, with small fading `sparkle` stars. A replacement shows the old item drifting up and fading like a balloon, overlapping with the new item flying in, all within ~1s.
- **Back to map:** closes the overlay only. The kart stays parked at the last station, every station is tappable immediately, and the invitation schedule restarts.
- **Asleep stations:** tapping a station that is still asleep closes the overlay but only bounces and plays its happy sound.

## Cross-Story Dependencies

- **Epic 1 prerequisites:** Bus, `MiniGameBase` (`round:complete`/`round:abandon`), `core/motion`, `core/hint-visuals`, AudioDirector (`setPrompt`), InputGuard, the minimal ProgressStore, `nextLevel`, and the render and atlas pipeline.
- **Story order:**
  - 2.1 replaces Epic 1's in-memory difficulty and comes before 2.2, which adds `grantDecoration` and the persistent decorations.
  - 2.3 consumes 2.1 and 2.2 and exposes the `onChainEnd` hook. Until 2.4 lands, Map returns to its invitation state there.
  - 2.4 attaches the overlay to `onChainEnd` and depends on 2.3's queued-tap handling.
  - 2.5 relies on 2.3 clearing `resume` on `round:complete`, and on 2.4 replay starting without resume.
- **Downstream:** Epics 3 and 4 plug their games in without changing these contracts. Epic 4's `touch-talk` uses `reward:earned`/`reward:granted` and the snapshot `partial` declared here.
