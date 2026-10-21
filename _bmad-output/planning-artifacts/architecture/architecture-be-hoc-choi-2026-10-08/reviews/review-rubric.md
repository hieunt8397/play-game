---
title: Rubric review — ARCHITECTURE-SPINE (Bé Học Chơi)
reviewed: ARCHITECTURE-SPINE.md (status draft, 2026-10-08)
inputs: prd.md (stale where UX differs), addendum.md, DESIGN.md (final), EXPERIENCE.md (final), .memlog.md
date: 2026-10-08
stakes: hobby (one child, one iPad, AI-agent build) — severities calibrated down accordingly
---

# Rubric review — Architecture Spine, Bé Học Chơi

## Verdict

The spine is solid and right-sized. Paradigm, layering, dependency rule, single owners (progress, audio, input, hints, tokens) and offline posture are the right calls, and most ADs have a checkable Rule. It is **ready for epics after a short revision**. Two Rules contradict the final UX (scaling/cropping and portrait handling). Several real seams that seven independently built games will hit are left open: who owns the HUD and transitions, outcome and difficulty policy, when rewards are persisted, how voice lines are composed and approved, and the Blender → anchors/atlas contract. No finding is High at hobby stakes.

Severity scale: **High** = units will certainly diverge or the build breaks on device. **Medium** = likely divergence or rework across stories. **Low** = polish or clarity.

## Checklist summary

| Criterion | Result |
| --- | --- |
| Fixes the real divergence points for features/epics | Mostly. Gaps: HUD/transition ownership, outcome/difficulty policy, reward persistence timing, voice-line composition, asset anchors/naming, hint level 4 ↔ input coupling (F2–F6) |
| Every AD Rule enforceable and prevents its divergence | Mostly. AD-7 conflicts with UX (F1). The AD-8 lint as written can't be enforced (F8). AD-5 can't deliver hint level 4 without touching AD-4 (F5) |
| Nothing under Deferred lets two units diverge | One item fails: "Portrait handling — build both" (F1). The others are safe |
| Named tech is verified-current | Yes for Phaser, Vite, vite-plugin-pwa, Workbox, free-tex-packer-core, edge-tts and Blender (memlog). TypeScript, Vitest and basic-ssl are unpinned and unverified (F9) |
| Covers the driving inputs' capabilities | FR1–21 and NFR1–9 are mapped, with UX overrides respected (decorations, Shiba, low-poly). Partly missed: NFR6 CSS/meta guards, reduced-motion, speaker-replay ownership, SFX/music sourcing (F3, F7, F10) |
| Every owned dimension decided, deferred, or open | Deployment: partly (base path, SW update policy and precache size limit are undecided, F7). Asset pipeline: partly (F4). Testing: thin but acceptable (F9). Operations: N/A beyond update policy. There is no Open Questions section, so the open items are scattered as [ASSUMPTION] |

## Findings

### F1 — Medium — AD-7 scaling and the portrait plan contradict the final UX

- **What:** AD-7 decides `Scale.FIT` + `autoCenter` + letterbox. DESIGN › Layout (final) says the background **covers** the screen (`object-fit: cover`). On a ~1.43 iPad it is cropped ~5–7% top/bottom, interactive objects stay inside a central safe area, and hit coordinates map through the cover scale/crop. The two models give different coordinates for every polygon, dead zone and button. Separately, the Shell lists a `RotateOverlay` scene and Deferred says "build both (RotateOverlay vs CSS rotation)". EXPERIENCE › Responsive explicitly rejects a "rotate the device" screen and decides **CSS 90° stage rotation** [ASSUMPTION, test on device]. "Build both" is a Deferred item that lets two units diverge.
- **Why it matters:** Content authors (polygons) and the scene/HUD story will pick different models. Dead-zone tokens are in **screen** pt plus safe-area, while content is in design px. Neither AD-4 nor AD-7 says which space `InputGuard` tests dead zones in.
- **Fix:** Change AD-7 to `Scale.ENVELOP` (cover) on a 1024×768 design space. Define a `SAFE_RECT` (design-space rect that is visible on every supported iPad ratio) and require every interactive item in `content/` to sit inside it, with a content validator to check this. Place HUD buttons relative to the visible viewport, not the design origin. Make `InputGuard` convert dead-zone tokens from screen space (plus `env(safe-area-inset-*)`) at event time. Remove `RotateOverlay` and replace that Deferred line with a decision: the game parent is CSS-rotated in portrait, and `InputGuard`/Scale map pointer coordinates through the rotation. Phaser's input does not account for a CSS transform on its parent, so record this as a spike/open question with a fallback.

### F2 — Medium — AD-1 leaves the shell↔game seam under-specified (scene shape, HUD, transitions, outcome)

- **What:** "Each screen is a Phaser Scene", but AD-1 never says whether a `MiniGame` *is* a `Phaser.Scene` (key = `GameId`) or an object mounted into a host scene. It also leaves open:
  - **Who renders Home/Speaker** (FR3, on every game screen, at fixed token positions). As written, seven games will each draw their own.
  - **Who owns the camera zoom-in/zoom-out and kart transition** between Map and a game (EXPERIENCE "Đang chuyển cảnh", "Xong lượt": celebrate ~1.5s → camera pull-back ≤1.5s → decoration ~1s → overlay, total ≤4s).
  - **The shape of `outcome`.** The Map "asks ProgressStore to change difficulty", but no shared policy (when to promote or demote) is fixed, so each game's ladder data will encode its own rule.
  - **The shape of `snapshot` / `resume`** and who keys it in `SessionStore`.
- **Fix:** Add to AD-1:
  - `MiniGame` = a `Phaser.Scene` subclass, key = `GameId`, started only by the shell via `scene.start(gameId, { difficulty, resume })`.
  - A shell-owned `Hud` scene launched in parallel over every game. It renders Home/Speaker, and Home emits a request; the game answers with `round:abandon`.
  - The shell owns all transitions. A game only plays its in-scene celebration and then emits.
  - `RoundOutcome = { questions: number; maxHintLevel: number[] }` and one `nextDifficulty(ladder, outcome)` function in `core/`. Ladders in `content/` are data only.
  - `SessionStore` is keyed by `GameId`, and the snapshot is opaque and game-typed (`MiniGame<TSnap>`).

### F3 — Medium — Reward persistence is tied to the Map animation, so a touch-talk reward can be lost

- **What:** AD-1 says "Only the Map scene grants decorations". Chạm là nói emits `reward:earned` while it stays running (no round end), and EXPERIENCE wants the item to sparkle in-scene, fly off, and be waiting on the map next time. If the Map scene is stopped or asleep, or the app is closed before returning, nothing persists it. The same race exists between `round:complete` and the end of the decoration fly-in.
- **Fix:** Split **grant** from **reveal**. A single listener in core (`ProgressStore.grantDecoration(stationId)`) persists immediately on `round:complete` / `reward:earned` and marks the item `revealed: false`. The Map only *animates* unrevealed items, then calls `markRevealed`. Add `revealed` to `DecorationSlotState`.

### F4 — Medium — The asset pipeline contract stops at "PNG → atlas"; anchors, naming, frame animation and precache limits are open

- **What:**
  1. AD-7 requires positions and polygons "measured on the fixed Blender camera", but nothing says *how* they get from Blender to `content/` (hand-measured vs exported). Per-object sprites need anchor positions that match the background plate.
  2. There is no atlas key/frame naming convention and no max atlas size. Each game will invent keys.
  3. "Motion in the app is 2D tween only" conflicts with the UX's character beats (Shiba wags and licks, fox eats, dino blinks and walks a few steps, fish wriggles). These need pre-rendered frame sequences or pose swaps. An agent reading the rule literally will refuse frame animations.
  4. Workbox's default `maximumFileSizeToCacheInBytes` is **2 MiB**. 2048×1536 background PNGs or large atlases can exceed it and are then silently left out of the precache, which breaks offline (NFR7) only on device.
- **Fix:** Add an AD-10 "asset contract":
  - `tools/render` exports per screen `<screen>.layout.json` (anchor point per object plus projected hit polygon, in design px), and `content/` imports the generated layout, never hand-typed coordinates.
  - Atlas key `atlas.<screen>`, frame names `<object>/<pose>/<nn>`, max 4096² (2048² preferred for iPad memory), backgrounds as separate PNG/WebP plates.
  - Allowed motion = tweens + Phaser frame animations from pre-rendered frames. No runtime 3D.
  - Set `workbox.maximumFileSizeToCacheInBytes` explicitly, and add a build check that every file in `public/assets` is in the precache manifest.
  - Loading: each scene preloads only its own keys from an asset manifest in `content/`, and textures are released on scene shutdown.

### F5 — Medium — AD-5 cannot deliver hint levels 1 and 4 or "background motion stops" without crossing into AD-4 and every scene

- **What:** In EXPERIENCE, level 1 = item floats back plus a short repeat (game/drag behaviour). Level 4 = wrong items dimmed 60% **and not liftable**, with the target snap radius **doubled**. At level 2+, all background motion stops, and only one salient motion is allowed at a time. AD-5 only lets `HintDirector` "render ring/hand/dim". Disabling pickup and scaling snap radius belong to `DragController` (AD-4), and ambient motion lives in every scene. Without a stated mechanism, each game will hand-roll level 4 and the ambient pause. Several screens also have non-standard hint cadences: the map idle invitation (8s, then ≥20s, max 3), the play-again overlay alternating ring (10s/30s), the pizza oven (~6s), touch-talk idle wiggle (~15s) and race trace-hand. It is unstated whether these go through `HintDirector`.
- **Fix:** Extend the AD-5 Rule:
  - `hint.targets({ correct, distractors, dropTarget, actionPath })`.
  - `HintDirector` emits `hint:level` on `Bus`. `DragController` subscribes and applies `lockDistractors` / `snapScale = 2` at level 4.
  - A core `AmbientMotion` registry that every idle tween registers with, paused while a ring is shown or on `prefers-reduced-motion`.
  - "Hint schedules (timings, caps) are data in `content/`. Every timed nudge, including map invite, overlay and touch-talk wiggle, runs through `HintDirector` with a named schedule."

### F6 — Medium — AD-6 voice-line shape can't express composed phrases, pauses or human approval

- **What:**
  - **Composed phrases.** Many lines are combinatorial: counts 1–5 × toppings, "Một!… Hai!… Ba!", fish names by colour × size × pattern ("Cá vàng nhỏ!", "cá vàng sọc"), "Đủ ba lát rồi!", per-character play-again lines, flavour + colour pairs. The spine doesn't decide between enumerating every full sentence and concatenating fragments at runtime. Games will do both.
  - **Pauses.** EXPERIENCE requires ~300 ms pause before the keyword and ~0.85× rate. edge-tts no longer accepts custom SSML (only rate/pitch/volume), so the pause has to come from segment splitting plus ffmpeg silence, or from text punctuation. The `{id, text, file}` record has no field for it.
  - **Approval.** EXPERIENCE says an adult listens to and approves every file (loanwords separately). Regeneration would silently overwrite approved audio.
- **Fix:** Make the record `{ id, text, file, rate?, keywordPauseMs?, approved?: { textHash } }`. `tools/tts` renders `text` split at a marker (e.g. `|`) with inserted silence, and refuses to overwrite a file whose `textHash` matches an approved entry. Decide one composition policy: **full sentences enumerated in content** for prompts, and `audio.sayChain([ids])` (gapless on one voice channel) only for counting and name readouts. Document this in AD-3/AD-6.

### F7 — Low–Medium — Deployment is an [ASSUMPTION]; PWA update policy and base path are undecided

- **What:**
  - GitHub Pages serves under `/<repo>/`, which changes Vite `base`, manifest `start_url`/`scope` and SW scope. Cloudflare Pages serves at root. Leaving the host as an assumption lets the PWA-config story and the asset-URL code diverge.
  - No SW update policy. `registerType: 'autoUpdate'` with immediate reload would reload mid-play in front of a 3-year-old.
  - NFR6 page-level guards (viewport `user-scalable=no`, `touch-action`, `-webkit-touch-callout`, `overscroll-behavior`, `draggable=false`, manifest `display`) have no owner in the capability map. Only `core/input` is listed.
- **Fix:** Pick one host now (Cloudflare Pages avoids the base-path issue) or mandate `base: './'` and relative asset URLs. Decide "new SW waits; activates on next cold launch, never reloads a running session". Map NFR6 to `index.html` + `src/styles/stage.css` owned by the Boot/shell story.

### F8 — Low — AD-8's lint rule isn't enforceable as written, and the tokens mirror will drift

- **What:** "Reject pixel literals ≥ 8 outside tokens.ts/content" can't tell pixels from ms, counts, indices or angles, so agents will either disable the rule or launder numbers into `content/`. A hand-maintained `tokens.ts` "mirroring DESIGN.md" will drift, and many DESIGN token values are CSS-ish strings (`'scale .92→1.08, 1.4s'`, box-shadows) that Phaser can't consume directly.
- **Fix:** Generate `core/tokens.ts` from DESIGN.md's YAML front matter with a `tools/tokens` script (numbers parsed, composite strings split into typed fields), and fail the check on diff. Narrow the lint to hex/`rgb(` literals plus ESLint `no-magic-numbers` in `scenes/` and `games/` with an allowlist (0, 1, -1, 2, 0.5).

### F9 — Low — Unpinned or unverified versions, and no single verification gate

- **What:** TypeScript "5.x (latest 5.x at scaffold)", Vitest "latest", basic-ssl "latest" and Node "current LTS" aren't in the memlog's verified list. TypeScript 6.x may be current by now, and Vitest/basic-ssl must declare Vite 8 peer support. AD-6 says "CI/lint fails" but there is no CI. Testing has no automated content checks (safe-area, target-min, gap, polygon validity) even though these are the cheapest way to enforce NFR1 across seven content files.
- **Fix:** Verify and pin these at scaffold and record them in the memlog. Define one `npm run check` = `tsc --noEmit` + eslint + vitest + content validators (voice↔file, homophones, ids, polygons inside `SAFE_RECT`/outside dead zones, target sizes ≥ tokens, station gaps) + precache-manifest check. State that every story must pass it, and that CI (GitHub Actions) is optional.

### F10 — Low — Smaller coverage gaps

- **Speaker replay ownership:** "replay the most recent line of the screen" needs one owner. Add `audio.setPrompt(lineId)` with the HUD speaker calling `audio.replayPrompt()`. Interrupt rules (restart, no overlap, ≤1 repeat per 10s) belong to `AudioDirector`.
- **SFX/music provenance and loudness:** the pipeline only covers TTS. Add a `tools/audio` loudnorm pass for SFX/music (≤ voice, ≥50 ms fade-in, no <150 Hz content) and a CC0 source list, which is the PRD's open licence question.
- **Reduced motion** (`prefers-reduced-motion` → cross-fade instead of camera zoom): put it in the shell transitions and `AmbientMotion` (see F5).
- **Font:** Baloo 2 is self-hosted, but Phaser canvas text must wait for `document.fonts.load` in Boot, or labels render in the fallback font.
- **Bus typing:** declare a typed `BusEvents` map in `core/bus.ts` so event payloads can't drift.
- **Open Questions section:** collect the scattered [ASSUMPTION]s (host, CSS rotation, silent switch, palm radius, font) into one list with "decide by" stories.

## Things done well (keep)

- The dependency rule is crisp and lintable (`games/*` ↛ `games/*`, `scenes/`; `core` ↛ `scenes/`/`games/`).
- Single owners for persistence, audio, input and hints match the UX's cross-cutting behaviours exactly (first-finger-wins, one voice channel, ducking, hint escalation).
- UX overrides of the PRD are stated up front and applied in the capability map (decorations replace FR22–23, touch-talk `reward:earned`).
- Correct iPadOS facts: no manifest orientation lock, AudioContext resume on gesture/visibility, Home Screen exemption from eviction, `storage.persist()`.
- Build-time-only TTS with a named fallback provider makes edge-tts's unofficial status a contained risk.
- Deferred is mostly correct: ladders, catalogue, choreography and state library are all safely deferrable behind fixed contracts.
