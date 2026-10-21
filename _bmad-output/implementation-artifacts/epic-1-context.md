# Epic 1 Context: Bé mở app, lái kart trên đảo và chơi Tiệm kem

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A 3-year-old taps one big "Chơi" button (which unlocks audio), sees a low-poly toy island, drives the kart to the ice-cream truck, and plays one full Tiệm kem round with Shiba. The round has Vietnamese voice prompts, escalating hints and a celebration, then returns to the island. All of it runs offline on an iPad. The epic also lays the foundation for the whole project: the Phaser starter, the folder layout and dependency rules, tokens generated from DESIGN.md, the core services (Bus, AudioDirector, InputGuard, HintDirector, difficulty), the Blender→atlas and TTS→audio pipelines, the offline PWA, the `npm run check` gate, and an HTTPS preview deploy for testing on a real iPad. The other 6 stations appear on the island but are "asleep": tapping one makes it bounce and play a happy sound, and it does not open a game.

## Stories

- Story 1.1: Khởi tạo app từ starter Phaser
- Story 1.2: Màn Mở đầu: nút Chơi + mở khoá âm thanh
- Story 1.3: Bé nghe giọng đọc tiếng Việt
- Story 1.4: Pipeline hình: render Blender → atlas + layout bản đồ
- Story 1.5: Màn Con đường: 7 trạm, nhãn, lời mời, trạm ngủ
- Story 1.6: Nút Nhà và Loa, chống chạm nhầm
- Story 1.7: Kart chạy tới trạm
- Story 1.8: Tiệm kem: kéo kem đúng vị cho Shiba
- Story 1.9: Gợi ý leo thang
- Story 1.10: Tiệm kem: lượt 3–5 câu và độ khó tăng dần
- Story 1.11: Chạy offline và thử trên iPad

## Requirements & Constraints

- **Start screen:** while the first load runs, show only a `loading-strip` (a kart looping on a short road) with no text and no progress bar. `button-play` (~200px, yellow, slow bob) appears only once required assets and the self-hosted Baloo 2 font are ready. On load failure the kart slows and waits, then retries on its own. Errors go only to `console.warn`.
- **First tap:** it gives a "pụp" within 100ms, unlocks audio for the whole session, starts soft background music, plays a short `vo.shell.*` greeting and goes to the Map.
- **Backgrounding:** when the app is hidden, stop voice and music. On return, try to resume the AudioContext. If it is still suspended, show `button-play` over the current scene with a light dim and pause everything, hint clocks included. A tap resumes exactly where play stopped.
- **Map:** 7 stations, each with a polygon hit-map at least 80px across and at least 40px apart. Each has a static, non-tappable parent label (Baloo 2, 18px, white 85%).
  - Idle behaviour: every 4–6s exactly one station gently moves. After ~8s idle, one station gets a hint ring, an invitation and its name read aloud. Later invitations come at least 20s apart, at most 3 times. Any tap resets the idle clock.
  - The empty island never shows placeholder or "missing" slots.
- **Kart:**
  - Tapping a station makes it bounce and reads its name. The kart then drives to it in at most 2s whatever the distance (1.5s on later trips in the same session).
  - Tapping another awake station mid-drive re-targets the kart. Tapping the kart gives a "bíp" and a speed-up.
  - When the child returns to the Map, the kart is parked at the last station played (session only).
- **HUD:**
  - The Speaker button is on the Map, in every game and on overlays, but not on Start. It replays the latest prompt. Tapping it during playback restarts the line with no overlap, does not count as a wrong answer and does not reset hints.
  - The Home button is in games only. It needs no confirmation and says *"Về đảo nào!"*.
  - There is no menu, no ⭐ button, no settings and no collection screen.
- **Tiệm kem:**
  - The voice asks for flavour plus colour ("kem dâu màu hồng"). The child drags a scoop onto the cone. Dropping it on Shiba's body or the upper half of the counter also counts.
  - Correct: the scoop snaps in, Shiba wags and licks, and happy music plays for 1–2s.
  - Wrong flavour: the scoop floats back (~0.5s) and a short retry line plays.
  - The counter never runs out of scoops. Each flavour differs in shape and brightness, not only colour: dâu has a strawberry and is bright pink, sô-cô-la has chips and is dark brown, vani is plain round ivory, bạc hà has a leaf and is green.
- **Difficulty:** a round is 3–5 questions. The ladder goes from 1 scoop out of 2 flavours up to 2–3 scoops. Any order is accepted except at the top level, where the spoken order is enforced (a scoop in the wrong order floats back and counts as wrong). Within Epic 1 the level is kept in memory only.
- **Hints (4 levels):** a level escalates on time OR on wrong attempts, whichever comes first. It never drops within a question and resets when the next question starts. The hint clock starts only after the prompt has finished playing.
  1. Float back plus a short retry line.
  2. Hint ring around the correct item, which also bounces; background motion stops.
  3. The hand demonstrates the drag, looping ~15s; the voice repeats ~30s.
  4. Distractors fade to 60% and cannot be picked up, and the target snap radius doubles.

  The app never does the task for the child, and a voice retry plays at most once per 10s.
- **Touch:**
  - Hit areas are at least 80px with gaps of at least 24px. Hit area = visual + 24px. Draggables are displayed at least 90px. Snap radius is 100px.
  - First finger wins: extra pointers are ignored and never cancel the first.
  - Dead zones are 24px left/right, 32px top and 40px bottom, plus safe-area.
  - A drop mid-way onto the counter stays put and is nudged so items do not overlap. A drop off the counter slides back after ~1.5s.
  - Every tap gets feedback within 100ms.
- **Voice:** no instructional text anywhere. Prompts use a pre-generated female Vietnamese voice:
  - At most 8 words, one request per sentence, keyword last, ~300ms pause before the keyword, speed ~0.85×.
  - Never "sai" or "không đúng", and no praise.
  - Banned near-homophone pairs in the same sentence: dâu/đâu, cá/cà, ba/bà, bóng/bông, cam/cầm.
- **Audio:**
  - Voice is about −16 LUFS. Music stays at or below −30 LUFS and ducks a further 18dB or more while voice plays (150ms down, restored 500ms after the line ends).
  - SFX are never louder than the voice and fade in over at least 50ms. Only one voice channel exists.
- **Safety and motion:**
  - No red, ✗, shaking or "wrong" sounds.
  - Flashing stays at or below 1Hz, and only one prominent motion runs at a time.
  - Honour `prefers-reduced-motion`: reduce amplitudes and replace camera zoom with a fade.
- **Platform:**
  - iPadOS 16.4+ Safari, installed to the Home Screen, landscape. The 1024×768 design frame covers the screen.
  - In portrait, CSS rotates the whole stage 90°; there is no "rotate your device" screen.
  - Zoom, pull-to-refresh, long-press menus and text selection are all blocked.
- **Offline and network:** fully offline after the first open, with no network requests at all (no analytics, no font CDN, no remote TTS). A service-worker update applies only on the next cold start and never reloads mid-play.
- **Performance:** atlas pages are at most 2048², each shipped file is at most 8 MiB, and game assets load while the kart drives.

## Technical Decisions

- **Stack:**
  - Starter: `npx degit phaserjs/template-vite-ts app` (template 1.4.0), then upgrade to Phaser 4.2.1 and Vite 8.3.3.
  - Toolchain: TypeScript ~5.9.3, typescript-eslint 8.71.1, Vitest 5.0.3, Node 24 (`engines ">=24 <25"`, `.nvmrc`).
  - Vite: a single `vite.config.ts` with `base: './'`, no `manualChunks` object, no terser. Delete the `log.js` telemetry.
  - `main.ts`: 1024×768, `Scale.ENVELOP` + `CENTER_BOTH`, `input.activePointers` set.
- **Layers:** `app/src/{core,content,scenes,games}`, plus `app/tools/`, `art/` (.blend files) and `assets/` (CC0 sources, not shipped).
  - Allowed imports: scenes → games/core/content; games → core/content; core → content. `content/` imports types only.
  - Enforced by ESLint `no-restricted-imports`.
- **MiniGame contract:**
  - `MiniGameBase` plus `games/registry.ts`. `GameId` is one of `ice-cream | pizza | race | fishing | touch-talk | dino-puzzle | shadow-match`, and `stationId === GameId`.
  - Only the shell calls `scene.start(gameId, { level, seed, resume? })`, and at most one game runs at a time. Games never call `scene.start/stop/launch` or `this.load.*`.
  - Each start emits exactly one `round:complete` (`{ gameId, questions, firstTryCorrect, maxHintLevel }`, after the celebration) or one `round:abandon { gameId, snapshot }`. The game then goes inert.
- **Shell scenes:**
  - `Boot`, `Start`, `Map`, `Hud` (runs in parallel), `PlayAgainOverlay` (Epic 2) and `AudioUnlockOverlay`.
  - `AudioUnlockOverlay` uses `scene.pause()`/`resume()`, which is the only pause mechanism.
  - Transitions (kart drive, zoom, reduced-motion fade) live in `core/motion`.
- **Bus:** `core/bus.ts` has a typed `EventMap`; event names follow `noun:verb`. Scenes subscribe only through `bus.scoped(scene)`, which auto-unsubscribes on SHUTDOWN/DESTROY.
- **AudioDirector:**
  - API: `say(lineId) → token` (which emits `speechEnded { token }`), `sayChain`, `sfx`, `music`, `setPrompt`/`replayPrompt`.
  - It wraps Phaser's unlock (`sound.locked`, `Sound.Events.UNLOCKED`) and re-resumes on `visibilitychange`.
  - Voice queue: a new `say` while the current line has less than 0.5s left waits for it; repeating the line that is playing is ignored.
  - Lint bans `this.sound.*` and audio paths in scenes/games.
- **InputGuard (`core/input`):**
  - Primitives `TapTarget`, `DragController`, `TracePath` and `HotspotPolygon`. Lint bans raw pointer events and `clientX/Y` outside this module.
  - `space.ts › toDesign()` is the only coordinate transform; it handles the ENVELOP crop and CSS rotation.
  - Pickability and snap radius change only through `setPickable` and `setSnapScale`.
- **HintDirector:**
  - API: `beginQuestion({ promptLineId, retryLineId, step })`, `wrong()`, `stepDone(nextStep, {promptLineId?, retryLineId?})`, `questionDone()`, `replayPrompt()`.
  - It plays all prompt and hint voice itself; games never play prompt or retry lines.
  - The clock uses scene `time` (never `setTimeout`) and starts on `speechEnded` for the matching token.
  - Visuals come from `core/hint-visuals`, which the Map also reuses for its invitations. It emits `hint:level`. The HUD Speaker calls `hint.replayPrompt()` when a question is active and `audio.replayPrompt()` otherwise.
- **Difficulty:** `core/difficulty.ts › nextLevel(current, outcome, ladderLength)` is a pure function called only by `Map`. It returns +1 if `firstTryCorrect === questions`, −1 if `maxHintLevel === 4`, otherwise 0, clamped to the ladder.
- **Stores:**
  - `ProgressStore` uses key `bhc.progress`, holds `{ schemaVersion, seq, difficulty, decorations }` and writes synchronously. Its `init()` runs on the first Start tap and is the only place that calls `navigator.storage.persist()`. Epic 1 needs only a minimal version.
  - `SessionStore` is memory only and holds `lastStation`, `resume` and `pendingFlyIns`.
- **Content as data:**
  - `content/voice-lines.ts` entries are `{ id, text, keywordPauseMs?, rate?, approved?: { textHash } }`, with ids `vo.<scope>.<intent>[.<subjectId>][.<n>]` and files at `public/assets/audio/vo/<id>.m4a`. Every combination is enumerated as its own line, with no runtime concatenation.
  - SFX and music ids are `sfx.<scope>.<name>` and `music.<name>` in `content/audio-catalog.ts`. Ladders live in `content/games/<GameId>.ts`, and questions derive deterministically from `seed`.
- **Tokens:**
  - `tools/tokens` generates `core/tokens.generated.ts` from the DESIGN.md YAML; compound strings such as hint-ring become typed fields. `core/timing.ts` holds every behavioural duration.
  - Values are used only through `Tokens.*` and `Tokens.Timing.*`. Lint bans hex/`rgba(` literals and magic numbers (except `[-1,0,1,2,0.5]`) in scenes/games.
  - `Tokens.safeRect` is the area visible on every iPad aspect ratio, and all interactive items must sit inside it.
- **Asset pipeline:**
  - Render: `tools/render` runs the Blender 5.2.2 CLI via `BLENDER_BIN`. It outputs PNG frames plus `content/generated/<screenId>.layout.json`, taken from `anchor.<id>`, `hit.<id>` and `slot.<id>` objects. Nobody enters coordinates by hand.
  - Atlas: `tools/atlas` (free-tex-packer-core 0.3.9) produces Phaser JSON hash with key `atlas.<screenId>` and frames named `<object>/<state>/<nn>`, plus a separate background `bg.<screenId>`. Lighting uses the HDRI meadow_2.
  - TTS: edge-tts 7.2.8 with voice `vi-VN-HoaiMyNeural`. Use rate/pitch/volume only, no SSML. A `|` in `text` marks where ffmpeg inserts silence. Normalise with two-pass ffmpeg `loudnorm` and write a `.hash`. Never overwrite an approved file whose hash matches. Output is `.m4a` AAC mono 44.1kHz.
  - Tools must fail clearly when Blender, edge-tts or ffmpeg is missing. Blender is not yet installed on this machine.
- **PWA:**
  - `vite-plugin-pwa` 2.0.0 (Workbox 7.4.1) in `generateSW` mode.
  - Glob `**/*.{js,css,html,png,webp,json,m4a,woff2,svg,ico,webmanifest}`, max 8388608 bytes.
  - `registerType: 'prompt'` with no UI, `skipWaiting: false`, `clientsClaim: true`, and no `updateSW()` call.
- **Gate:** `npm run check` runs `tsc --noEmit`, ESLint, Vitest (`core/`, `content/`), the content and layout validators, the tokens diff and the precache check (after `vite build`). Every story must pass it.
- **Errors:** never show an error to the child. A missing asset is skipped silently with `console.warn`.

## UX & Interaction Patterns

- **Base button:** `button-round` is 88px with a white highlight top-left and a solid 6px bottom shadow. On tap it presses to 0.9× and springs back.
  - Home: yellow, left 20 and top 40, plus safe-area.
  - Speaker: blue, right edge, top 120 (clear of Control Center). While it plays, 2 white 40% rings ripple at 1Hz.
- **Hint ring:** three layers — 6px white core, 4px `#5B21B6` purple line, 3px white halo at 80%. It pulses .95↔1.05 over 1.4s, only one shows at a time, and it stays until the answer is correct. At least one layer must reach a 3:1 contrast against the background behind it.
- **Hint hand:** 72px with a drop shadow.
- **Station invitation:** hint ring plus a .92→1.08 scale bob over 1.4s.
- **Ice-cream layout:** Shiba sits centre-back at 220px or more. Scoop, cone and scoop line up horizontally ~180px apart in the lower third, above the bottom dead zone.
  - The counter body is `counter-pink` and its top is the neutral `counter-top`.
  - On pickup a scoop scales to 1.1× and gets a drop shadow. On snap it eases out over 0.2s with a 1.05× bounce.
- **Character celebration:** bounce 1.0→1.12→1.0 twice over 0.8s, with 1–2s of music. No confetti or praise.
- **Visual style:** low-poly toy look with flat shading and bright pastels. Creatures are recoloured with `creature-*` (Shiba is warm orange with a white face and belly). No dark scenes.

## Cross-Story Dependencies

- **Foundation:** 1.1 (scaffold, tokens, Bus, check gate) comes before everything else.
  - 1.2 provides Start, the AudioDirector unlock and the minimal ProgressStore. 1.3 completes the voice pipeline and the AudioDirector channel and ducking.
  - 1.4 produces `map.layout.json` and the atlas that 1.5 and 1.7 consume.
- **Map and navigation:** 1.6 provides the Hud, InputGuard and `toDesign`. 1.7 provides `MiniGameBase`, the registry and `core/motion`, and starts `ice-cream` as a skeleton scene.
- **Ice-cream game:**
  - 1.8 builds the game against a stub `hint.*` API that already has the final signatures. In 1.9 the full HintDirector replaces the stub with no changes to Tiệm kem code.
  - 1.10 adds the ladder, `round:complete` and `nextLevel`, with session-only levels.
- **Offline and device testing:** 1.11 covers PWA, offline and the real-iPad checklist. The checklist confirms the `toDesign` rotation mapping, silent-switch audio (`navigator.audioSession.type = 'playback'`) and whether palm filtering is possible (`Touch.radiusX/Y`). Failed items become fixes before the epic closes.
- **Later epics:**
  - Epic 2 adds persistent difficulty, decorations via `reward-service`, the post-round chain and `PlayAgainOverlay`, and session resume. In Epic 1, `round:complete` simply returns to the Map.
  - Epics 3 and 4 reuse DragController, drop targets and HintDirector, and wake the 6 sleeping stations.
