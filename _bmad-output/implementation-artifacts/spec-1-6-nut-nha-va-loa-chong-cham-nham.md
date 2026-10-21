---
title: 'Story 1.6 — Nút Nhà và Loa, chống chạm nhầm'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'NO_VCS'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-5-man-con-duong-7-tram-nhan-loi-moi-tram-ngu.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-pipeline-hinh-render-blender-atlas-layout.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-be-nghe-giong-doc-tieng-viet.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The app has no HUD. A child on the Map cannot hear the last line again, and later games will have no way home. Input is also fragile:
- every tap is taken at face value, so a thumb holding the iPad or a parent's pointing finger can hijack or cancel play;
- touches in the screen edge strip still count;
- in portrait, where CSS rotates the stage 90°, Phaser's pointer coordinates are wrong (deferred from spec-1-1).

**Approach:**
- Grow spec-1-5's minimal `core/input` into InputGuard:
  - `space.ts` is the one screen↔design transform, covering the ENVELOP crop, the CSS rotation and safe-area insets;
  - one global guard dedupes each press across scenes and applies the dead zones and the first-finger rule, then resolves the press to the topmost target across the layers overlay > hud > scene;
  - `TapTarget` (a circle) joins `HotspotPolygon`.
- Add a parallel `Hud` scene with the Speaker button (Map, games and overlays) and the Home button (games only).
- An ESLint rule bans raw pointer events and `clientX/Y` outside `core/input`. Start and AudioUnlockOverlay migrate onto `TapTarget`.
- Add DOM-level tests for the ScaleManager rotation patch.

## Boundaries & Constraints

**Always:**
- **`core/input/space.ts`, the only coordinate transform.** Its pure core:
  - `View = { w, h, rotated, insets:{top,right,bottom,left} }`. `w`/`h` are the stage's layout size in CSS px (`#stage.clientWidth/Height`, which ignores transforms). `rotated` is `matchMedia('(orientation: portrait)')`, the same query stage.css uses.
  - `toLocal(client, view)`: client CSS px → stage-local CSS px. Landscape is the identity. Rotated (`rotate(90deg)`, origin top-left, `left:100dvw`): `u = y`, `v = view.h − x`.
  - `localToDesign(local, view)` / `designToLocal`: ENVELOP with `s = max(w/1024, h/768)` and centred offsets `ox = (w − 1024s)/2`, `oy = (h − 768s)/2`. `toDesign(pointer)` composes `readView()`, the pointer's client point and these two steps.
  - Insets are read from CSS custom properties `--sai-top|right|bottom|left` set from `env(safe-area-inset-*, 0px)` on `:root` in stage.css. Rotated, they map to the local frame as local top = screen right, local right = screen bottom, local bottom = screen left and local left = screen top (pure `localInsets`).
  - `visibleDesignRect(view)` gives the design rect of the whole stage.
- **Client point** (`pointer-adapter.ts`, the only file that reads `clientX/Y`): taken from `pointer.event`. For a TouchEvent, use the `changedTouches` entry whose `identifier === pointer.identifier`, falling back to `touches`. For a mouse or PointerEvent, use `clientX/Y`. With no event coordinates, recover the point by inverting Phaser's transform (`pointer.x / scale.displayScale.x + scale.canvasBounds.left`, and the same for y).
- **Dead zones:** a press is dead when its stage-local start point lies within `spacing.edgeDeadSide` (24) of the left/right edge, `edgeDeadTop` (32) of the top or `edgeDeadBottom` (40) of the bottom, each plus the local inset, all in CSS px. A dead press is dropped before anything else: it hits no target, does not run `onAnyTap`, never becomes the primary and never blocks another finger.
- **The guard** (`core/input/guard.ts`, a pure `InputGuard` class plus the singleton `inputGuard`):
  - The press key is `pointer.id` (Phaser's pointer slot) plus `pointer.downTime`. Every router's scene-level `pointerdown` forwards to `guard.press(pointer)`. The first forward of a key decides the press; later forwards of the same key (from other scenes) are no-ops. Verdicts are `dead`, `primary`, `extra-hud` or `ignored`.
  - **No live primary:** the press becomes the primary. It resolves against the active routers from the highest layer down, and within a layer to the topmost (last-registered) target. Every active router's `onAnyTap` runs, then the hit target's `onPress`.
  - **A live primary exists:** if the press hits a `hud`-layer target and `!guard.isDragging()`, that target fires (`extra-hud`) without becoming the primary and without touching it. Otherwise the press is `ignored`: no target, no `onAnyTap`, and the primary is never cancelled.
  - The primary is released on its `pointerup`/`pointerupoutside`. It is also released on the next guard query once the stored Phaser pointer reports `!isDown` or a different `downTime`, which self-heals after a pause or a scene switch.
  - `onRelease` (optional on a target) fires only for the primary press that hit it.
  - API for Story 1.8's DragController: `isPrimary(pointer)`, `setDragging(pointer, on)` (ignored unless the pointer is the primary) and `isDragging()`. A drag ends when the primary releases.
  - A router is active only while its scene `sys.isActive()`, so paused and sleeping scenes get nothing.
- **Router and targets** (extending spec-1-5):
  - `createTapRouter(scene, { layer = 'scene' })` registers with the guard on create and unregisters on SHUTDOWN/DESTROY. It listens to `pointerdown`, `pointerup` and `pointerupoutside`.
  - `pointerPoint` is deleted. Hit tests use `toDesign`.
  - `createTapTarget(router, { circle:{x,y,r}, onPress, onRelease? })` exposes `setCircle`, `setEnabled` and `destroy`.
  - `HotspotPolygon` keeps its 1.5 signature.
  - Map code is unchanged except that imports compile.
- **Hud scene** (`scenes/Hud.ts`, wiring only; logic in `core/hud.ts`):
  - Map's `create` launches Hud once (`scene.launch` if it is not running) and calls `setHudMode('map')`. Hud is never launched on Start.
  - `core/hud-mode.ts` stores the current `HudMode = 'map' | 'game'` and emits the new Bus event `'hud:mode': { mode }`. Hud reads the stored mode on create, then follows the event. Story 1.7's MiniGameBase sets `'game'`.
  - **Buttons:** `createRoundButton` gains `icon: 'play' | 'home' | 'speaker'`, drawn with Graphics in `icon` ink.
    - Speaker uses `buttonSpeaker.background`. Home uses `buttonHome.background`. Both are `buttonRound.size` (88) design px.
    - Each hit area is a circle of radius `size/2 + spacing.hitPad`.
  - **Layout:** pure `hudLayout(visible, insetsDesign)`. The inputs are `visibleDesignRect(view)` and the local insets divided by `s`.
    - Home centre = `(vis.x + edgeInset + insL + 44, vis.y + buttonTop + insT + 44)`.
    - Speaker centre = `(vis.right − edgeInset − insR − 44, vis.y + speakerTop + insT + 44)`.
    - Hud re-lays out on the ScaleManager `resize` event.
  - **Visibility:** Speaker is visible and enabled in every mode. Home is visible and enabled only in `'game'`. There is no other HUD element.
  - **Speaker tap** (`onPress`):
    - `pressButton` (0.9×) and `audio.sfx('sfx.shell.pop')` in the same handler.
    - Then `token = deps.replay()`, where the default is `audio.replayPrompt()`. Story 1.9 swaps in the HintDirector-aware replay.
    - If a token comes back, the wave shows until `speech:ended` for exactly that token. A new tap restarts the line (AudioDirector already stops it, so lines never overlap) and moves the wave to the new token.
    - With no prompt (`undefined`), only the button effect plays.
  - **Wave:** `buttonSpeaker.wave` defines 2 rings, white at 40%, at 1 Hz. Each ring scales from 1 to `Tokens.ui.speakerWaveScale` while its alpha fades from 0.4 to 0, over a period of `1000/hz` ms. The second ring is phase-shifted by half a period. There is no on/off blinking. Under reduced motion the scale amplitude is multiplied by `reducedMotionAmplitude`.
  - **Home tap:** press and pop, then only in `'game'` mode `audio.say('vo.shell.home')` and `bus.emit('hud:home')`. The shell never subscribes to `hud:home` in this story, so the event is a no-op without a running MiniGame. Story 1.7's game handles it.
- **Lint** (eslint.config.js, `src/**/*.ts` minus `src/core/input/**` and `**/*.test.ts`):
  - It bans calls to `on`, `once`, `addListener` or `addEventListener` whose first argument is a string matching `^(pointer|gameobject)(down|move|up|upoutside)$`.
  - It bans the members `POINTER_DOWN`, `POINTER_MOVE` and `POINTER_UP`.
  - It bans reading the members `clientX`, `clientY`, `pageX` and `pageY`.
- **Feedback:** all tap feedback starts in the `pointerdown` handler, within `Timing.feedbackMaxMs`.

**Never:**
- No kart drive, MiniGameBase, registry or game scene (Story 1.7). No DragController, drop targets or `setPickable`/`setSnapScale` (Story 1.8). No HintDirector (Story 1.9).
- No menu, ⭐, settings or any other HUD control. No text.
- No `setTimeout` for the wave. No `this.sound`.
- No second coordinate transform anywhere, and no patch of Phaser's `transformPointer`.
- No git, and no writing files that contain backslashes through a shell heredoc.

**Decisions (auto-run defaults):**
- **Units:**
  - Dead zones are CSS px of the stage-local frame, as the AC says.
  - Button sizes and edge offsets are design px, measured from the visible edge. Safe-area insets (CSS px) are converted with `÷ s`.
  - On a 1024×768 iPad (`s = 1`), the outer 4 px of Home lies in the 24 px side strip. That part does not respond, and the rest of the button does.
- **Hud accepts a second finger only through the guard's `extra-hud` rule.** Dead-zone presses never count as the first finger, so a thumb resting on the bezel cannot block the child.
- **Taps fire on press**, for Hud and game targets alike. Start and AudioUnlockOverlay keep their release semantics from spec-1-2 through `onRelease`, which keeps the audio unlock on a user-gesture `touchend`. Both scenes migrate to `createTapTarget` with layers `scene` and `overlay`. The overlay's full-screen backdrop becomes visual only, because paused scenes' routers are inactive.
- **New values:**
  - `Tokens.ui.speakerWaveScale: 1.6`.
  - New Bus event `'hud:mode'`.
  - The voice line `vo.shell.home` = "Về đảo nào!" (no pause, unapproved).
- **Device checklist:** `app/README.md` gains a "Device checklist (Story 1.11)" section with three checks: portrait tap mapping, a thumb in the edge strip plus a child's tap, and Speaker while a finger rests on the Map.
- **Deferred item (spec-1-1), DOM-level tests:**
  - `core/stage.dom.test.ts` runs under `// @vitest-environment happy-dom`, with `happy-dom` pinned exactly (20.14.5 at planning time).
  - It mocks `phaser` with a fake `Scale.ScaleManager` prototype and `Center`, and calls the patched `getParentBounds` and `updateCenter` on real `HTMLElement`s whose layout sizes are stubbed under `transform: rotate(90deg)`.
  - A node test reads `node_modules/phaser/src/scale/ScaleManager.js` and asserts that `getParentBounds`, `updateCenter`, `transformX`, `transformY` and `canvasBounds` still exist.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Landscape 4:3 | view 1024×768, client (512,384) | design (512,384) | — |
| 1180×820 | client (0,0) | design (0, 28.2±1); `designToLocal(safeRect top-left)` is on screen | — |
| 1366×1024 | client (683,512) | design (512,384)±1 | — |
| Portrait rotated | screen 820×1180, view w 1180 h 820 rotated, client (820,0) | local (0,0) → design (0, 28.2±1) | — |
| Rotated insets | screen insets top 24 | local left 24 | — |
| Dead press | local (10,400) | `dead`; no target, no onAnyTap; next finger can be primary | — |
| First finger | no primary, hits station | `primary`; onAnyTap + onPress | — |
| Extra finger | primary down on Map, second taps station | `ignored`; primary keeps working; its release fires its onRelease | — |
| Extra on Hud | primary down (no drag), second hits Speaker | `extra-hud`; Speaker fires | — |
| Extra on Hud while dragging | `setDragging(primary,true)` | `ignored` | — |
| Same press twice | Hud and Map both forward one key | decided once | — |
| Lost up | primary pointer `isDown` false | released on next query | — |
| Overlap layers | point hits Hud and Map targets | only Hud fires | — |
| Speaker, prompt set | `replay()` → token 7 | press + pop; wave until `speech:ended{token:7}` | — |
| Speaker re-tap | wave on token 7, tap | new token 8; wave follows 8; ended 7 is ignored | — |
| Speaker, no prompt | `replay()` → undefined | press + pop only | — |
| Home in map mode | tap (Home hidden or disabled) | nothing | — |
| `hud:home` without a game | emit on Map | nothing; no scene change | — |
| Layout 1180×820 | vis.y 28.2, no insets | Home (64, 112.2), Speaker (960, 192.2) | — |
| Lint | `scene.input.on('pointerdown')`, `e.clientX` in a scene | ESLint error; same code in `core/input/` passes | — |

</intent-contract>

## Code Map

- `app/src/core/input/{polygon,tap-router,hotspot-polygon}.ts` -- planned in spec-1-5. The router gains a layer option, guard registration, up listeners and `toDesign`.
- `app/src/core/stage.ts` -- `installRotationSafeScaleManager` (the deferred tests target it). `app/src/styles/stage.css` holds the portrait rotation and gets the `--sai-*` vars.
- `app/src/core/safe-rect.ts` -- `visibleRect` (reuse its maths idea). `Tokens.safeRect` = y 34 at ratio 1.46.
- `app/src/core/ui/round-button.ts` -- `createRoundButton` (currently `setInteractive`), `pressButton`. Add icons and drop the `setInteractive`.
- `app/src/scenes/Start.ts`, `app/src/scenes/AudioUnlockOverlay.ts` -- `button.on('pointerdown'|'pointerup')`. These migrate to `createTapTarget`.
- `app/src/scenes/Map.ts` -- planned in spec-1-5. Add the Hud launch and `setHudMode('map')`.
- `app/src/main.ts` -- add `Hud` to the scene list after `MapScene`, before `AudioUnlockOverlay`.
- `app/src/core/audio-director.ts` -- `replayPrompt(): number | undefined`, `sfx`, `say`. `app/src/core/bus.ts` -- the `EventMap` (`hud:home` exists).
- `app/src/core/tokens.generated.ts` -- `spacing.edgeDead*`, `edgeInset`, `buttonTop`, `speakerTop`, `hitPad`; `components.buttonHome`, `buttonSpeaker.wave`. `app/src/core/tokens.ts` -- `ui`.
- `app/src/core/reduced-motion.ts` -- planned in spec-1-5 (`amplitude`).
- `app/eslint.config.js`, `app/tools/lint/rules.test.ts` -- the new rule and its cases.
- `app/vite.config.ts` -- the test include already covers `src/core/**`.

## Tasks & Acceptance

**Execution:**
- `app/src/styles/stage.css` -- add `:root { --sai-top: env(safe-area-inset-top, 0px); … }`.
- `app/src/core/input/space.ts` (+ test) -- `View`, `readView(doc, win)`, `toLocal`, `localInsets`, `localToDesign`, `designToLocal`, `visibleDesignRect`, `isDeadZone(local, view)`, `toDesign(pointer)`. Cover the space rows of the matrix, round-trips and the safeRect corners at every ratio.
- `app/src/core/input/pointer-adapter.ts` (+ test) -- `clientPoint(pointer, scale)`: touch identifier matching, mouse events and the inverse fallback.
- `app/src/core/input/guard.ts` (+ test) -- `InputGuard` and `inputGuard`. Cover the guard rows of the matrix with fake routers and pointers.
- `app/src/core/input/tap-router.ts`, `tap-target.ts`, `hotspot-polygon.ts` (+ tests) -- layers, registration, `onRelease`, `createTapTarget`; remove `pointerPoint`.
- `app/src/core/hud-mode.ts`, `app/src/core/bus.ts` (+ tests) -- `HudMode`, `setHudMode`, `getHudMode`, and the `'hud:mode'` event.
- `app/src/core/hud.ts` (+ test) -- pure `hudLayout`, `waveFrame(tMs, reduced)` and `HudController({replay, say, emitHome, sfx})`, covering the Speaker, wave-token and Home rows.
- `app/src/core/tokens.ts` -- `ui.speakerWaveScale`.
- `app/src/content/voice-lines.ts` -- `vo.shell.home`. Generate it with `npm run tts`.
- `app/src/core/ui/round-button.ts` -- add `icon`; remove `setInteractive`.
- `app/src/scenes/Hud.ts` -- wiring: buttons, targets on the `hud` layer, the relayout, the wave tweens, and scoped `speech:ended` / `hud:mode` subscriptions.
- `app/src/scenes/Start.ts`, `app/src/scenes/AudioUnlockOverlay.ts`, `app/src/scenes/Map.ts`, `app/src/main.ts` -- the migration, the Hud launch and registration.
- `app/eslint.config.js`, `app/tools/lint/rules.test.ts` -- the pointer and clientX ban, plus allow cases inside `core/input/`.
- `app/package.json`, `app/src/core/stage.dom.test.ts`, `app/src/core/stage-phaser-api.test.ts` -- add `happy-dom` and the deferred tests.
- `app/README.md` -- the device checklist section.

**Acceptance Criteria:**
- Given `npm run dev` at 1180×820 touch emulation, when the child taps Chơi and the Map opens, then a blue speaker button sits at the right edge about 120 px down and no Home button shows. Start shows neither button.
- Given the Map after an invitation has played, when the child taps the Speaker, then the button dips and pops at once, the invitation replays from the start, and two soft white rings ripple once per second until it ends. A second tap mid-line restarts it with no overlap.
- Given a fresh Map with no prompt yet, when the child taps the Speaker, then only the dip and pop happen.
- Given DevTools in portrait 820×1180, when the child taps the ice-cream station, then it reacts exactly like the landscape tap on the same station.
- Given a press starting 10 px from the left edge over a station, when it lifts, then nothing reacts. A tap on the station a moment later still reacts.
- Given a temporary `this.input.on('pointerdown', …)` in `scenes/Map.ts`, when running `npm run lint`, then it fails.

## Spec Change Log

- **2026-10-08: `happy-dom` pinned to 20.14.5** as planned. It was published on 2026-09-12 (26 days ago) and is still the latest release.
- **2026-10-08: `onRelease` fires only when the primary is released over its target** (and the target is still enabled). This keeps spec-1-2's "pointerup on the button" semantics for Start and the unlock overlay: sliding off the ▶ before lifting cancels, as before.
- **2026-10-08: the Start and overlay ▶ hit circles are `size/2 + spacing.hitPad`**, the same rule as the Hud buttons. Before, the hit circle was the drawn circle only.
- **2026-10-08: small API shapes chosen while building.**
  - The guard takes a locator `(pointer, scale) => { local, design, dead }`; the default is `space.ts › locate`, which reads the live view. Tests pass a fixed view. Without a DOM (node), `locate` uses the pointer's x/y as design px and nothing is dead.
  - `createTapRouter(scene, { layer, guard })`: the optional `guard` lets tests use their own `InputGuard`. `RouterSceneLike` gains `sys.isActive()` and an optional `scale` (for the inverse fallback). A router target now has `onPress`/`onRelease?` instead of 1.5's `onTap`; `HotspotPolygon` keeps its constructor and maps its callback to `onPress`.
  - `space.ts` also exports `toClient`, `envelop`, `designInsets`, `currentView` and `locate`. `hud.ts` exports `wavePeriodMs` so the scene has no literal 1000.
  - `src/core/input/fakes.ts` holds the fake scene and pointers shared by the input tests (imported only by tests).
- **2026-10-08: the lint ban is two blocks with one shared selector list** (per spec-cross-notes). The scenes/games `no-restricted-syntax` block now also spreads `NO_RAW_POINTER`. A new block applies `NO_RAW_POINTER` alone to the rest of `src/**/*.ts`, ignoring `src/core/input/**`, tests, scenes and games, so neither block overrides the other. The ban also covers destructured `{ clientX }` and bare `on('pointerdown')` calls.
- **2026-10-08: the wave rings are filled white discs behind the Speaker**, scaled and faded per `waveFrame`. This avoids a stroke-width value that no token defines.

## Review Triage Log

## Design Notes

**Why a global guard with per-scene forwarding:** Phaser delivers a scene-level `pointerdown` to every active scene's input plugin, and the order depends on the scene list. If each scene decided alone, a tap on Speaker could also select the station under it. Deciding once per press key, across layers, makes the result independent of that order and gives the first-finger rule one owner:

```ts
press(p): Verdict {
  if (this.seen(p)) return this.last;      // other scenes' forward of the same press
  const local = toLocal(clientPoint(p), view);
  if (isDeadZone(local, view)) return 'dead';
  if (this.livePrimary()) return this.tryHud(p) ? 'extra-hud' : 'ignored';
  ...
}
```

**Why read raw client coordinates:** under the CSS rotation, Phaser's `canvasBounds` is the rotated box. `pointer.x/y` therefore mixes the axes, and only the raw point plus `View` maps correctly. The inverse fallback keeps synthetic or test pointers working.

## Verification

**Commands:**
- `cd app && npm install` -- expected: `happy-dom` is added at an exact version.
- `cd app && npm run tts` -- expected: `vo.shell.home` is written; a second run skips it.
- `cd app && npm run check` -- expected: exit 0. Vitest covers every matrix row, including the happy-dom stage tests. The lint rule tests pass.
- `cd app && npm run build` -- expected: exit 0.

**Manual checks:**
- DevTools touch emulation at 1024×768, 1180×820, 1366×1024 and 820×1180 portrait: the Speaker sits at the right edge, the taps land where expected, and nothing is cut off.
- Multi-touch (on a device or with DevTools multi-touch): hold one finger on the map and tap a station with another, and nothing happens. Tap the Speaker with another, and it replays.

## Auto Run Result

**Status:** in-review. `cd app && npm run check` exits 0: 33 test files, 406 tests (after the review fix). `validate:content` reports "7 game ids, 4 audio ids, 10 voice lines, 1 layout(s) with 7 stations, 1 atlas(es), 29 asset files".

**Summary:**
- `core/input` is now InputGuard:
  - `space.ts` is the one screen ↔ design transform (ENVELOP, the portrait rotation, `--sai-*` insets, dead zones);
  - `pointer-adapter.ts` is the only reader of `clientX/Y`;
  - `guard.ts` decides each press once across scenes (dead, first finger, `extra-hud`, layers overlay > hud > scene, self-healing primary, drag API for 1.8);
  - routers register with the guard and forward down/up/upoutside;
  - `createTapTarget` adds circle targets.
- The new `Hud` scene sits above Map: a blue Speaker (top-right) and a yellow Home (top-left, `'game'` mode only), drawn by `createRoundButton` with the new `icon` option.
  - Speaker: press + pop, then `audio.replayPrompt()`. A two-ring wave runs until `speech:ended` for that token.
  - Home: press + pop, then in game mode `vo.shell.home` and `hud:home`.
  - Layout follows the visible rect and insets, and is redone on ScaleManager `resize`.
- Map launches Hud once and sets `'map'` mode. Start and AudioUnlockOverlay moved to `createTapTarget` (press feedback, release action), and the overlay backdrop is visual only.
- ESLint bans raw pointer events, `POINTER_*` members and `clientX/Y`/`pageX/Y` outside `core/input` and tests.
- The deferred spec-1-1 stage tests now exist (happy-dom DOM test and a Phaser source API test).

**Files changed:**
- `app/package.json` (+ lock): `happy-dom` 20.14.5 (dev).
- `app/eslint.config.js`: `NO_RAW_POINTER`, merged into the scenes/games block plus one block for the rest of `src/`.
- `app/tools/lint/rules.test.ts`: ban and allow cases for the pointer/client rule.
- `app/src/styles/stage.css`: `--sai-*` custom properties.
- `app/src/core/input/space.ts` (+ `space.test.ts`): the transform, insets, dead zones, `readView`, `locate`, `toDesign`.
- `app/src/core/input/pointer-adapter.ts` (+ test): `clientPoint`.
- `app/src/core/input/guard.ts` (+ `guard.test.ts`): `InputGuard`, `inputGuard`.
- `app/src/core/input/tap-router.ts`: layers, guard registration, up listeners; `pointerPoint` removed.
- `app/src/core/input/tap-target.ts`: `createTapTarget`, `inCircle`.
- `app/src/core/input/hotspot-polygon.ts`: fires through `onPress`.
- `app/src/core/input/fakes.ts`: test fakes; `app/src/core/input/input.test.ts`: router tests on the guard plus TapTarget tests.
- `app/src/core/hud.ts` (+ `hud.test.ts`): `hudLayout`, `waveFrame`, `wavePeriodMs`, `HudController`.
- `app/src/core/hud-mode.ts`: `HudMode`, `getHudMode`, `setHudMode`.
- `app/src/core/bus.ts`: the `'hud:mode'` event.
- `app/src/core/tokens.ts`: `ui.speakerWaveScale` 1.6.
- `app/src/core/ui/round-button.ts`: `icon` (play, home, speaker); no `setInteractive`.
- `app/src/content/voice-lines.ts`: `vo.shell.home` "Về đảo nào!" (unapproved).
- `app/public/assets/audio/vo/vo.shell.home.{m4a,hash}`: the generated line.
- `app/src/scenes/Hud.ts`: the Hud scene.
- `app/src/scenes/Start.ts`, `AudioUnlockOverlay.ts`: moved to `createTapTarget`.
- `app/src/scenes/Map.ts`: launches Hud and sets `'map'` mode.
- `app/src/main.ts`: `Hud` in the scene list after `MapScene`.
- `app/src/core/stage.dom.test.ts`, `app/src/core/stage-phaser-api.test.ts`: the deferred stage tests.
- `app/README.md`: the *Input and Hud* section and the *Device checklist (Story 1.11)*.

**Verification:**
- `npm install --save-dev --save-exact happy-dom@20.14.5`: added at the exact version.
- `npm run tts` wrote `vo.shell.home` (1 written, 9 skipped). A second run printed "0 written, 10 skipped".
- `npm run check` exits 0 (405 tests, including every guard, space, Hud and lint matrix row and the happy-dom stage tests).
- `npm run build` exits 0.
- Smoke test in headless Chrome against `vite preview`, using CDP touch emulation and a script kept outside the project:
  - At 1180×820, after the tap on Chơi, the Map shows the blue Speaker at the right edge (client y ≈ 189) and no Home button.
  - Switched to portrait 820×1180, a touch on the ice-cream station at its rotated screen point set the prompt. A touch on the Speaker then showed the two white wave rings, which were gone about 3 s later, after the line ended.
  - No exceptions were logged.

**Residual risks:**
- Real multi-touch was not exercised (CDP single touch only). The guard rules are covered by unit tests with fake pointers.
- `readView` reads `#stage.clientWidth/Height` and the `--sai-*` values on each press. If iOS reports the `env()` insets late after a rotation, the dead zones may lag by one press.
- On a 1024×768 iPad, the outer 4 px of Home lie in the side dead strip, as accepted in the spec.
- A primary whose pointerup is lost while its pointer still reports `isDown` (for example a page hide in mid-press) blocks other fingers until that slot is pressed again. Phaser normally resets pointers on blur.

**Manual checks still due:**
- DevTools touch emulation at 1024×768, 1180×820, 1366×1024 and 820×1180 portrait: the Speaker sits at the right edge, taps land where expected, and nothing is cut off.
- Multi-touch on a device: with one finger held on the map, a tap on a station does nothing and a tap on the Speaker replays.
- Listen to `vo.shell.home` and approve it.
- The device checklist in `app/README.md` (Story 1.11).

**Review (lean loop, 2026-10-08):** 1 finding: a router destroyed while the child still held one of its targets left that target enabled, so the lift could call `onRelease` against a destroyed scene. Fixed in `createTapRouter.add`, which now registers a wrapper whose `isEnabled` is `live && target.isEnabled()`. New guard test: press, destroy the router, release, and no `onRelease`. Input tests: 46 passed. `npm run check` re-run: exit 0, 406 tests.
