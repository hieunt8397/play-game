---
title: 'Story 1.5 — Màn Con đường: 7 trạm, nhãn, lời mời, trạm ngủ'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'NO_VCS'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-pipeline-hinh-render-blender-atlas-layout.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-be-nghe-giong-doc-tieng-viet.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `Map` is still a sky-only placeholder. The island art, hit polygons and anchors from Story 1.4 are never loaded or shown. A 3-year-old therefore has nothing to tap, sees no station names for the parent, and gets no idle invitation to start playing.

**Approach:**
- `Boot` also loads `atlas.map` and `bg.map`.
- `Map` draws the plate, the 7 station sprites, a static label under each station and the kart as a map prop. Each station gets a `HotspotPolygon` (new, minimal `core/input`). A tap bounces the station and either reads its name (the awake `ice-cream`) or plays a happy sound (the 6 sleeping stations).
- A pure idle scheduler in core drives two things: ambient station motion every 4–6 s, and up to 3 invitations, each drawn with a new `core/hint-visuals` ring plus a bob and voice.
- The new voice lines, SFX, timings and UI values are content and tokens.

## Boundaries & Constraints

**Always:**
- **Layout use (spec-1-4 contract, unchanged):**
  - Read `LAYOUTS.map` (`content/layouts.ts`, layout JSON v1, design px).
  - Each station image is the frame `<stationId>/idle/00` of texture `atlas.map`, placed full-frame. Its scale is `1/renderScale` and its origin is `(anchor.x/design.width, anchor.y/design.height)`, so every bounce scales around the ground pivot `anchors[id]`.
  - `bg.map` is drawn at (0,0), origin 0, scale `1/renderScale`, at the lowest depth. Station depth sorts by `anchors[id].y`.
  - Slots are never drawn (UX-DR42).
- **Hit areas:**
  - A station's hit area is exactly `hits[id]`, with no extra padding (the stored polygon is already final).
  - The kart prop's hit area is the trimmed rect of `kart/idle/00` (`spriteSourceSize ÷ renderScale`) padded by `Tokens.spacing.hitPad` on each side, registered as a 4-point `HotspotPolygon`.
  - Labels and the plate are not interactive.
- **`core/input` (minimal, extended by Story 1.6):**
  - `polygon.ts › pointInPolygon` (pure).
  - `tap-router.ts › createTapRouter(scene)`: one `pointerdown` listener per scene. It reads the point through a single `pointerPoint(pointer)` (`pointer.x/y` today; 1.6 swaps in `toDesign`) and calls the topmost matching target, meaning the last one registered. Every tap, hit or miss, first calls the router's `onAnyTap` hook, which Map uses to reset idle. A tap that misses every target does nothing else.
  - `hotspot-polygon.ts › HotspotPolygon(router, points, onTap)` with `setEnabled` and `destroy`.
  - No pointer API is used outside `core/input`, so 1.6's lint ban passes without changes.
- **Taps:** feedback starts in the same `pointerdown` handler (≤ `Timing.feedbackMaxMs`). Any tap on a target, and any tap on empty map, resets the idle clock and removes a showing invitation.
  - **Awake station** (`ice-cream`): bounce `1 → Tokens.ui.stationTapScale → 1` over `Timing.stationTapMs`, then `audio.say('vo.shell.station-name.ice-cream')` and `audio.setPrompt(<same>)`. No navigation (the kart drive is Story 1.7).
  - **Sleeping station:** the same bounce plus `audio.sfx('sfx.shell.happy')`. No voice, no navigation, no error.
  - **Prop (kart):** bounce to `tappableProp.react.scale` over `react.durationMs` plus `audio.sfx('sfx.shell.prop')`. It never opens a game.
  - A tap on an object that is already tweening restarts its bounce from scale 1×base (stop the old tween, reset the scale).
- **Idle scheduler** (`core/map-idle.ts`, pure, time comes in through `tick(deltaMs)`):
  - **Ambient:** every `rand(mapAmbientMinMs..mapAmbientMaxMs)` it emits `{kind:'ambient', id}` for one station. The id is never the same twice in a row, and every station is eligible.
  - **First invitation:** emitted after `mapInviteFirstMs` of idle as `{kind:'invite', id}` for the next awake station (round-robin).
  - **Later invitations:** only when idle is at least `mapInviteFirstMs` and at least `mapInviteGapMs` has passed since the previous invitation started. At most `mapInviteMaxCount` per Map visit; taps do not reset the count.
  - **While an invitation shows** (`mapInviteHoldMs`, or until a tap): no ambient is emitted (one prominent motion, UX-DR72). When it ends, the scheduler emits `{kind:'inviteEnd', id}`.
  - **`tap()`:** resets the idle clock and the ambient timer, and ends a showing invitation with an `inviteEnd`.
  - **Deltas** are clamped to `MAX_TICK_MS` (250), so a resume after a pause never fires a burst of events.
  - **Pause:** `Map` feeds `delta` from `update()`, which does not run while `AudioUnlockOverlay` pauses the scene. Idle time therefore stops during that pause.
- **Invitation** (on `invite`):
  - `createHintRing(scene, ellipse)` from `core/hint-visuals` draws the ring around the bounding box of `hits[id]`. It uses the three layers of `Tokens.components.hintRing`, pulsing `.95↔1.05` over `pulse.durationMs`, and only one ring exists at a time.
  - The station bobs `stationHotspot.pulse.from → to` with yoyo over `pulse.durationMs`, repeating.
  - Voice: `audio.sayChain(['vo.shell.invite.<id>', 'vo.shell.station-name.<id>'])` and `audio.setPrompt('vo.shell.invite.<id>')`.
  - On `inviteEnd` the ring is destroyed and the bob stops at scale 1×base.
- **Ambient motion:** scale `1 → Tokens.ui.ambientScale → 1` over `Timing.mapAmbientMoveMs`, yoyo, once.
- **Reduced motion:** `core/reduced-motion.ts › prefersReducedMotion(win)` (`matchMedia('(prefers-reduced-motion: reduce)')`, false when it is unavailable) is read in `Map.create`. When true, every scale amplitude (the `x−1` part of tap, prop, ambient, bob and ring pulse) is multiplied by `Tokens.ui.reducedMotionAmplitude`. A pure `amplitude(scale, reduced)` helper does this. Nothing flashes; there are no sparkles in this story.
- **Labels:**
  - Each station gets a `station-label` from `STATIONS[i].label`: Phaser Text in `Tokens.components.stationLabel` (Baloo 2 18px/600, fill white, 2px stroke `labelOutline`, alpha 0.85).
  - Position: centred on `anchors[id].x`, top at `anchors[id].y + Tokens.spacing['1']`, clamped horizontally and vertically inside `Tokens.safeRect`. The position comes from a pure `labelPosition`.
  - Labels are static and depth-above all sprites.
- **Missing art (AR51):**
  - A missing frame (`!texture.has(frame)`) skips only that image, with one `console.warn` naming the frame. Its hotspot and label stay, and so does the station's tap feedback.
  - A station missing from the layout (no `hits`/`anchors`) is skipped entirely, with a `console.warn`.
  - Nothing is ever shown to the child.
- **Values:** every duration comes from `Tokens.Timing.*` and every size or scale from `Tokens.*`; scenes have no magic numbers (lint). Map logic (planning, idle, geometry) is pure core code with Vitest. `scenes/Map.ts` only wires Phaser.

**Never:**
- No kart driving, re-targeting, camera zoom or `scene.start` of a game (Story 1.7). No Hud, Speaker, Home, InputGuard first-finger rule, dead-zone filter or `toDesign` (Story 1.6). No decorations or slot rendering (Story 2.2). No HintDirector or hand (Story 1.9).
- No hand-entered coordinates, no new layout fields and no change to spec-1-4's JSON/naming.
- No `setTimeout`/`setInterval` for idle timing, and no `this.sound` or audio paths in scenes.
- No text other than the parent-facing station labels.
- No writing files that contain backslashes through a shell heredoc. No git.

**Decisions (auto-run defaults):**
- **Awake set and labels:** `content/stations.ts` entries gain `label: string` and `awake: boolean`, with `awake: true` only for `ice-cream`. Story 1.7 may derive `awake` from `games/registry.ts` instead.
  - Labels, which are also the name-line texts: ice-cream "Xe kem", pizza "Tiệm pizza", race "Đường đua", fishing "Hồ cá", touch-talk "Chạm là nói", dino-puzzle "Công viên khủng long", shadow-match "Hang tìm bóng".
- **Sleeping stations do not read their name.** The AC asks for a bounce plus a happy sound, and saying the name would invite the child somewhere that cannot open. Only awake stations are invited.
- **Voice lines** (scope `shell`, all unapproved until a parent listens):
  - `vo.shell.station-name.<id>` × 7, with the label texts above.
  - `vo.shell.invite.ice-cream` = "Bé ơi, mình đi ăn | kem nhé!" (`keywordPauseMs: 300`), from the EXPERIENCE flow.
  - Boot already loads every `vo.shell.*` line.
- **SFX:** `sfx.shell.happy` (sleeping-station "tiếng vui") and `sfx.shell.prop` (the small prop sound), as synthesized placeholders in `tools/audio/make-placeholders.ts`. Both stay quieter than the voice with a fade-in of at least 50 ms.
- **Kart as the map prop:** `kart/idle/00` is placed full-frame like the stations and is the one `tappable-prop` in Epic 1. Story 1.7 replaces its tap with "bíp" plus a speed-up. Story 2.2 decorations reuse `createMapProp`.
- **New values:**
  - `Timing.mapAmbientMoveMs: 800` and `Timing.mapInviteHoldMs: 5600` (4 bob half-cycles).
  - `Tokens.ui.stationTapScale: 1.1`, `ui.ambientScale: 1.04` and `ui.reducedMotionAmplitude: 0.5`.
- **Content check:** `content/validate.ts` also requires a non-empty label for every station, a `vo.shell.station-name.<id>` line for every station, and a `vo.shell.invite.<id>` line for every awake station. Each failure names the id.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enter Map | layout + atlas loaded | plate, 7 sprites, 7 labels, kart; no slot markers | — |
| Tap ice-cream | point inside `hits['ice-cream']` | bounce starts same handler; `say` + `setPrompt` name line | — |
| Tap sleeping | point inside `hits.pizza` | bounce + `sfx.shell.happy`; no say, no navigation | — |
| Tap kart | inside padded kart rect | 1.1× bounce + `sfx.shell.prop` | — |
| Tap empty | outside all targets | nothing visible; idle clock reset | — |
| Overlap | point inside two targets | only the last-registered (topmost) target fires | — |
| Ambient | idle, tick 4–6 s | one `ambient` event; next id ≠ previous | — |
| First invite | idle 8 s | `invite` for ice-cream; ring + bob + chain; no ambient while showing | — |
| Invite ends | hold 5.6 s elapsed, or a tap | `inviteEnd`; ring gone; bob reset | — |
| Later invites | idle continues | next `invite` ≥ 20 s after the previous start; none after the 3rd | — |
| Tap resets | tap at idle 7 s | no invite until 8 s after the tap | — |
| No awake | awake set empty | ambient only, never `invite` | — |
| Pause/resume | delta 30 000 ms after resume | treated as 250 ms | — |
| Reduced motion | `reduce` matches | amplitudes × 0.5 (1.1 → 1.05, .92/1.08 → .96/1.04) | — |
| Missing frame | `pizza/idle/00` absent | no pizza image; label + hotspot remain; one warn | console.warn |
| Missing station | layout lacks `hits.race` | station skipped | console.warn |
| Label at edge | anchor near the safeRect bottom | label clamped inside `safeRect` | — |

</intent-contract>

## Code Map

- `app/src/scenes/Map.ts` -- the current sky-only placeholder; it becomes the island scene.
- `app/src/scenes/Boot.ts`, `app/src/core/boot-load.ts` (+ test) -- `attempt()` loads `bootAudio()`. Add `bootTextures()` built from `ATLASES.map` / `BACKGROUNDS.map` (planned in spec-1-4, `content/assets.ts`), loaded with `load.atlas` / `load.image` and skipped when `textures.exists(key)`. The same error and retry rules apply.
- `app/src/core/audio-director.ts` -- `audio` singleton: `say`, `sayChain`, `sfx`, `setPrompt` (exists).
- `app/src/core/timing.ts`, `app/src/core/tokens.ts` -- add the new Timing and `ui` values. `Tokens.components.{stationHotspot,stationLabel,hintRing,tappableProp}` already exist in `tokens.generated.ts`.
- `app/src/content/stations.ts`, `layouts.ts`, `layout-types.ts`, `assets.ts` -- planned in spec-1-4. `stations.ts` gains `label`/`awake`.
- `app/src/content/voice-lines.ts`, `audio-catalog.ts`, `validate.ts` (+ test) -- the new lines, SFX and rules.
- `app/tools/audio/make-placeholders.ts` (+ test) -- the exhaustive `buildArgs` switch gets the two new SFX.
- `app/src/core/ui/round-button.ts` -- the existing tween and press pattern to mirror.
- Consumers: 1.6 (`tap-router`, the `pointerPoint` swap, Speaker → `audio.replayPrompt()` replays the invite or name), 1.7 (kart prop, awake set, station tap → drive), 1.9 (`hint-visuals` ring reuse), 2.2 (`createMapProp`, slots).

## Tasks & Acceptance

**Execution:**
- `app/src/core/timing.ts`, `app/src/core/tokens.ts` -- add `mapAmbientMoveMs`, `mapInviteHoldMs`, and `ui.stationTapScale`, `ambientScale`, `reducedMotionAmplitude`.
- `app/src/content/stations.ts` -- add `label` and `awake` per the Decisions.
- `app/src/content/voice-lines.ts`, `app/src/content/audio-catalog.ts` -- 7 name lines, the ice-cream invite, and `sfx.shell.happy` / `sfx.shell.prop`.
- `app/src/content/validate.ts` (+ test), `app/tools/lint/validate-content.ts` -- the station label, name-line and invite-line rules.
- `app/tools/audio/make-placeholders.ts` (+ test) -- synthesize the two SFX: a short rising two-note chime for happy, a ~100 ms soft tick for prop; 50 ms fade-in, peak −20 dBFS.
- `app/src/core/input/polygon.ts`, `tap-router.ts`, `hotspot-polygon.ts` (+ tests) -- point-in-polygon (concave, edge and vertex cases); topmost-wins routing with a fake scene input; enable/destroy.
- `app/src/core/reduced-motion.ts` (+ test) -- `prefersReducedMotion`, `amplitude`.
- `app/src/core/map-idle.ts` (+ test) -- the scheduler; every idle, invite, reset, clamp and no-awake matrix row, with an injected rng.
- `app/src/core/map-plan.ts` (+ test) -- pure `planMap(layout, stations, hasFrame, frameRect)`. It returns per-station image, label position, hit, awake, the kart prop rect and warnings. It covers missing frame, missing station, label clamp, no slot items and depth order.
- `app/src/core/hint-visuals.ts` -- `createHintRing(scene, {x,y,width,height}) → {destroy()}`: three ellipse strokes plus a pulse tween, one live ring (creating a new one destroys the old).
- `app/src/core/ui/map-prop.ts` -- `createMapProp(scene, router, {frame, rect, onTap})` for the tappable-prop bounce.
- `app/src/core/boot-load.ts` (+ test), `app/src/scenes/Boot.ts` -- `bootTextures()` and loading.
- `app/src/scenes/Map.ts` -- wire the plan, images, labels, hotspots, prop, idle `update`, invitations and audio; reduced motion read once.
- `app/public/assets/audio/{vo,sfx}/…` -- generate by running `npm run audio:placeholders` and `npm run tts` with the env bins.

**Acceptance Criteria:**
- Given 1.4's outputs and a fresh `npm run dev`, when the child taps Chơi and the Map opens, then the island fills the screen with 7 stations, each with a small, translucent, outlined label below it, and no empty decoration markers.
- Given the Map, when the child taps the ice-cream truck, then it bounces at once and "Xe kem" is spoken. When the child taps the pizza shop, it bounces with a happy sound, says nothing and the scene stays on Map. When the child taps the kart, it bounces 1.1× with a small sound.
- Given the Map left untouched, when watching for 70 s, then only one station moves every 4–6 s. At ~8 s the ice-cream truck gets the purple-and-white ring, bobs and the invitation plays followed by "Xe kem". At most 3 invitations come, at least 20 s apart, and nothing else moves while the ring shows.
- Given idle at 7 s, when the child taps anywhere, then no invitation appears until 8 s after that tap.
- Given DevTools rendering emulation `prefers-reduced-motion: reduce`, when reloading and watching, then the bounces and bobs are visibly smaller and nothing flashes.
- Given `atlas.map` with the `pizza/idle/00` frame removed from the JSON, when the Map opens, then pizza's label and tap sound remain, one `console.warn` names the frame, and the child sees no error.
- Given a station label, name line or invite line removed from content, when running `npm run check`, then it fails and names the id.

## Spec Change Log

- **2026-10-08: small API shapes chosen while building.**
  - `planMap` takes a fifth, optional `opts` (`measureLabel`, `safeRect`, `labelGap`, `hitPad`, `atlasKey`). The label size is only known after Phaser measures the Text, so Map passes a measure that creates each label once.
  - A router target exposes `isEnabled()` instead of an `enabled` getter, so `HotspotPolygon` needs no `this` alias.
  - `createMapProp` takes the planned image placement (`frame: PlannedImage`) and the padded hit polygon (`rect`). The kart's pivot is `anchor.kart-start`, so its bounce scales around the ground point like the stations do.
  - The bounce, ambient move and bob live in a new `core/ui/scale-motion.ts`. Each object has one motion at a time; a new one stops the old one and resets the scale to 1×base. The bob is a sine around the mid scale (.92↔1.08 → mid 1), so it starts without a jump.
- **2026-10-08: the awake station's name line starts in the tap handler**, together with the bounce, instead of after the 500 ms bounce. The AC says "bounces at once and 'Xe kem' is spoken", and NFR5 wants feedback within 100 ms.
- **2026-10-08: the hint ring is the ellipse inscribed in the bounding box of `hits[id]`.** The stored polygon is already padded by 24 px, so the inscribed ellipse sits around the art. A circumscribed one (×√2) would reach into the neighbouring stations.
- **2026-10-08: `npm run tts` had transient edge-tts failures** (`NoAudioReceived`) on the first run. A second run wrote the remaining 2 lines, and a third run skipped all 9.

## Review Triage Log

## Design Notes

**Why pure core + thin scene:** Phaser does not run under Vitest (node). The scheduler, planner, geometry and routing are plain functions with fakes, so every matrix row is tested. `Map.ts` only maps events to tweens and audio calls:

```ts
update(_: number, delta: number): void {
  for (const ev of this.idle.tick(delta)) {
    if (ev.kind === 'ambient') this.ambient(ev.id);
    else if (ev.kind === 'invite') this.invite(ev.id);
    else this.endInvite(ev.id);
  }
}
```

**Why `tick(delta)` and not `scene.time.now`:** the clock time jumps across a pause, but `update` deltas do not arrive while the scene is paused. With the clamp, idle time stops while the audio-unlock overlay pauses the Map.

## Verification

**Commands:**
- `cd app && npm run audio:placeholders && npm run tts` -- expected: the two SFX and 8 new voice lines are written; a second `tts` run skips them.
- `cd app && npm run check` -- expected: exit 0; Vitest covers every matrix row; validate:content reports 7 stations and 9 voice lines.
- `cd app && npm run build` -- expected: exit 0; `dist/assets/atlases/map.*` and `dist/assets/bg/map.png` are present.

**Manual checks:**
- In `npm run dev`, run the AC walkthroughs: taps, the 70 s idle watch, reduced motion and the pizza-frame removal (restore the file afterwards).
- The labels are readable but subtle, sit under their stations, and none is cut off at the edges.

## Auto Run Result

**Status:** in-review. `cd app && npm run check` exits 0: 27 test files, 336 tests. `validate:content` reports "7 game ids, 4 audio ids, 9 voice lines, 1 layout(s) with 7 stations, 1 atlas(es), 27 asset files".

**Summary:**
- Boot also loads `atlas.map` (`load.atlas`) and `bg.map` (`load.image`) through `bootTextures()`. It skips keys that already exist and follows the same error and retry rules.
- `Map` draws the plate, the 7 station sprites, a static label under each station and the kart prop. The sprites are full frame on their anchors at scale 1/renderScale. Each station has a `HotspotPolygon` on its stored hit polygon. The kart's hit area is its padded trimmed rect.
- Taps:
  - ice-cream bounces, says "Xe kem" and sets it as the prompt;
  - a sleeping station bounces and plays `sfx.shell.happy`;
  - the kart bounces 1.1× and plays `sfx.shell.prop`;
  - every tap resets idle and ends a showing invitation.
- The pure `core/map-idle` drives the ambient motion every 4–6 s and up to 3 invitations. An invitation is a ring, a bob, `sayChain([invite, name])` and the prompt. Deltas are clamped to 250 ms.
- Reduced motion halves every scale amplitude. A missing frame skips only the image, with one `console.warn`. A missing station is skipped with a warning.
- Content: `label` and `awake` on stations, 8 new voice lines (unapproved), 2 new SFX, and the station rules in `validate:content`.

**Files changed:**
- `app/src/core/timing.ts`: `mapAmbientMoveMs`, `mapInviteHoldMs`.
- `app/src/core/tokens.ts`: `ui.stationTapScale`, `ui.ambientScale`, `ui.reducedMotionAmplitude`.
- `app/src/content/stations.ts`: `label`, `awake`, `KART_FRAME`, `stationFrame`.
- `app/src/content/voice-lines.ts`: 7 name lines, the ice-cream invite, `stationNameLine`, `inviteLine`.
- `app/src/content/audio-catalog.ts`: `sfx.shell.happy`, `sfx.shell.prop`.
- `app/src/content/validate.ts` (+ test): `validateStations` (label, name line, invite line of awake stations).
- `app/tools/lint/validate-content.ts`: wires in the station rules; frame names come from `stationFrame`/`KART_FRAME`.
- `app/tools/audio/make-placeholders.ts` (+ test): the two synthesized SFX.
- `app/src/core/input/polygon.ts`, `tap-router.ts`, `hotspot-polygon.ts` (+ `input.test.ts`): geometry, routing and hotspots.
- `app/src/core/reduced-motion.ts` (+ test): `prefersReducedMotion`, `amplitude`.
- `app/src/core/map-idle.ts` (+ test): the idle scheduler.
- `app/src/core/map-plan.ts` (+ test): `planMap`, `labelPosition`, `estimateLabelSize`.
- `app/src/core/hint-visuals.ts`: `createHintRing` (one live ring), `ringRadii`.
- `app/src/core/ui/scale-motion.ts`: `bounce`, `bob`, `stopMotion`, `isMoving`.
- `app/src/core/ui/map-prop.ts`: `createMapProp`.
- `app/src/core/boot-load.ts` (+ test), `app/src/scenes/Boot.ts`: `bootTextures` and the texture loading.
- `app/src/scenes/Map.ts`: the island scene.
- Generated audio: `app/public/assets/audio/sfx/sfx.shell.{happy,prop}.m4a` and `app/public/assets/audio/vo/vo.shell.{station-name.*,invite.ice-cream}.{m4a,hash}`.

**Verification:**
- `npm run audio:placeholders` wrote 4 files. `happy` is 0.35 s with a −19.8 dBFS peak; `prop` is 0.10 s with a −20.1 dBFS peak.
- `npm run tts` wrote the 8 new lines over two runs (see the change log). A further run printed "0 written, 9 skipped".
- `npm run check` exits 0 (336 tests).
- `npm run build` exits 0. `dist/assets/atlases/map.{png,json}` and `dist/assets/bg/map.png` are present.
- Smoke test in headless Chrome against `vite preview`, driven by a CDP script kept outside the project:
  - After the tap on Chơi, the island, 7 sprites, 7 labels and the kart render, with no slot markers and no exceptions.
  - The ring shows around Xe kem about 8 s after the last tap and is gone after the hold.
  - With `pizza/idle/00` removed from `dist/assets/atlases/map.json` and reduced motion emulated, there is exactly one warning (`map: frame "pizza/idle/00" is missing from atlas.map — image skipped`) and no error. `dist` was rebuilt afterwards.

**Residual risks:**
- No sound was heard in the headless run. The voice and SFX calls are covered only by their code paths and unit tests.
- The labels sit at `anchor.y + 8`, so some overlap the bottom of their sprite ("Xe kem" over the truck's wheels, "Tiệm pizza" on the pizza box). This follows the spec, but a human should judge readability.
- The ring is inscribed in the box around the hit polygon. For tall stations it is a tall ellipse and may touch a neighbour's label.
- Labels are measured with Baloo 2 after the readiness gate. If the font ever fails, they are measured with the fallback font.

**Manual checks still due:**
- In `npm run dev`, with sound:
  - the tap walkthroughs;
  - the 70 s idle watch (one motion every 4–6 s, 3 invitations 20 s apart);
  - reduced motion through DevTools;
  - the pizza-frame removal in `public/assets/atlases/map.json` (restore the file afterwards).
- Listen to the 8 new voice lines and approve them by copying each `.hash` into `approved.textHash`.
- Check that the labels are readable but subtle and that none is cut off.

**Review (lean loop, 2026-10-08):** 1 finding (low): an ambient bounce on another station could still run when a later invitation started. Fixed in Map.invite() by settling every station before the ring and bob. npm run check re-run: exit 0, 336 tests.
