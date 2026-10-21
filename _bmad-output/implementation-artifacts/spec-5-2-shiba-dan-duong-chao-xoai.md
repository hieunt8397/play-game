---
title: 'Story 5.2: Shiba dẫn đường chào "Xoài ơi" và giọng đọc gọi tên Xoài'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_revision: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Map scene guide wiring (enter on create, invite wave, tap blocked rule, hotspot order) has no test.
    evidence: |-
      map-guide.test.ts covers only the pure model; no test runs MapScene.
    location: >-
      app/src/scenes/Map.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The child is never called by her name (every line says "Bé ơi"), and the island Shiba is baked into the ice-cream station sprite: it cannot greet, wave or react on its own, and tapping it opens the ice-cream game (FR34, FR36, NFR3).

**Approach:** Rewrite the island greeting, the 7 station invitations and one prompt family per game so they say "Xoài ơi", plus a validator rule that allows the name only in greeting/invite/prompt intents. Then render the island Shiba as its own map sprite with wave frames and its own hit area. A small pure `core/map-guide` model drives it: greet with a wave once per session on the first Map entry, wave on each idle invitation, and bounce with a small "gâu" when tapped.

## Boundaries & Constraints

**Always:**
- Every line stays ≤ 8 words, keeps `|` ↔ `keywordPauseMs` and `review`, and passes the homophone and banned-phrase rules. Rendering goes `npm run content:export` → `npm run tts` with `EDGE_TTS_BIN=C:/Users/nguyentrunghieu/.local/bin/edge-tts.exe` (7.3.1) and `FFMPEG_BIN=<the Gyan ffmpeg-9.0.2 bin/ffmpeg.exe>`. Every `.m4a` + `.hash` must match.
- Keep the voice ids. Only texts change, except for the new SFX id `sfx.shell.woof` (a creature sound: ≤ 800 ms, nothing below 150 Hz, fade-in ≥ 50 ms, peak ≈ −20 dBFS).
- The ice-cream station's `anchor.ice-cream` (and so its decoration slots and kart stop) does not move. Only its hit hull and frame lose the dog.
- Shiba taps go through the Map router. The Shiba hotspot registers after the station hotspots and before the kart, so it wins an overlap with `hit.ice-cream`. Every tap still resets idle (`router.onAnyTap`).
- New numbers go in `Tokens`/`Tokens.Timing` (wave frame period, wave length), then run `npm run tokens`. Timers use scene `time`. Under `prefers-reduced-motion`, the wave holds a single frame and the bounce amplitude goes through `amplitude(…, reduced)`.
- Art goes through `build_map.py` → `npm run art:build -- map` → `npm run render -- map` → `npm run atlas -- map`. Leave out SUBSURF, keep atlas pages ≤ 2048², and run Blender at `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe` (`BLENDER_BIN`).

**Never:**
- Never use "Xoài" in praise, celebration, name, count, retry or play-again lines, and add no praise line at all.
- Do not change `cute.chibi()` geometry, which is shared with the ice-cream/pizza screens. The wave pivot is map-builder-local.
- No 5.4 general tap reactions, no 5.5 pointing, no 5.6 ambient art. Do not change the invitation schedule (`core/map-idle`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First Map entry | `session.guideGreeted` false, Map `create` | Shiba waves, `say('vo.shell.greeting')` once, Speaker prompt = greeting when there is no island prompt; flag set | – |
| Later entries | flag true (create again, or wake from a game) | no greeting, no wave | – |
| Invitation | `map-idle` emits `invite` | Shiba waves alongside the station ring/bob and the invite line | – |
| Tap Shiba | parked, no chain | bounce (tappableProp.react) + `sfx.shell.woof`; ice-cream does not open; idle resets | – |
| Tap Shiba during chain / play-again | chain active or overlay open | ignored (like the kart) | – |
| Wave while waving | invite during a running wave | restarts the wave from frame 00 (one wave timer) | – |
| Missing art | atlas lacks `shiba/*` or the layout lacks `anchor/hit.shiba` | Map warns once, skips the image, keeps the hotspot when `hit.shiba` exists; nothing throws | console.warn |
| Name rule | line with "Xoài" whose intent ∉ {greeting, invite, ask, prompt, scene} | validator problem naming the id | fails `validate:content` |

</intent-contract>

## Code Map

- `app/src/content/voice-lines.ts` -- L45 `vo.shell.greeting`; L55–61 invites; L77–80 ice-cream single asks; L134–153 pizza asks; L169 dino ask; L176–183 shadow asks; L193 race prompt; L197–199 fishing colour prompts; L216, L225–229 touch-talk scene lines.
- `app/src/content/validate.ts` -- L195–216 rule constants, L263–330 `validateVoice`: add the name rule here. Tests go in `voice-rules.test.ts`.
- `app/src/core/shell-flow.ts:28` -- Start says `vo.shell.greeting` today. Test at `shell-flow.test.ts:31`.
- `app/src/content/audio-catalog.ts:22–25, 84–91` -- shell SFX ids and entries (`creature` flag). `app/tools/audio/make-placeholders.ts:230` has the seagull creature recipe and L289 the per-id switch. Boot loads `sfx.shell.*` (`core/boot-load.ts:17`).
- `app/tools/shared/binaries.ts:35–40`, `app/tools/tts/generate.ts:5` -- edge-tts install hint and header still say 7.2.8. Resolution only probes `--version`.
- `app/tools/render/blender/build_map.py` -- `STATIONS` L38 (`C:IceCream` holds `A_Shiba`; confirmed: `A_Shiba` ∈ `sprite.ice-cream` in art/map.blend). Regroup L600–629, hulls/anchors L651–666. The `states` collection prop is honoured by `render_screen.py:255` (`<name>/<state>/<nn>`) and used, for example, by `build_ice_cream.py:441–446`.
- `app/tools/render/blender/cute.py:170–230` -- rig part names `shiba-legR`, `shiba-pawR`, `shiba-head`, `shiba-tail`, `shiba-body`, `shiba-tongue`. `key_chibi(rig, frame, head_roll, tail, bob)` keys with CONSTANT interpolation.
- `app/tools/layout/rules.ts:62–135` -- `validateLayout`, map stations only. It is called from `tools/render/render.ts:63` and `tools/lint/validate-content.ts:126`. Required map frames are at `validate-content.ts:77`.
- `app/src/content/assets.ts:97` -- `MAP_KART`. Add `MAP_GUIDE` beside it.
- `app/src/core/map-plan.ts:126–176` -- `planMap`/`placeImage`. Add a planned guide (frame, image at `anchors.shiba`, `hits.shiba`, depth = anchor y). Tests in `map-plan.test.ts`.
- `app/src/core/session-store.ts:20–30` -- session flags (`lastStation`, `kartTrips`). Add `guideGreeted`.
- `app/src/scenes/Map.ts` -- router L225–232, station loop L234–241, kart L265 / `addKart` L617, idle L272–284, `syncIdle` L696, `onWake` L793–820, `invite` L855–878, `bounceKart` L703 (bounce pattern).

## Tasks & Acceptance

**Execution:**
- `app/src/content/voice-lines.ts` -- change these texts (ids kept), using the golden lines in Design Notes:
  - the greeting;
  - the 7 invites ("Xoài ơi, … nào!");
  - the ice-cream single asks (4);
  - the pizza asks (15: "Bé ơi," → "Xoài ơi,", and the mushroom.5 `review` text to match);
  - the dino ask;
  - the shadow asks (8);
  - the race prompt;
  - the fishing colour prompts (3);
  - the touch-talk scene lines (3).
  - Also update the file header and the comment quotes in `content/games/shadow-match.ts:37` and `games/*/lines.ts`.
  -- FR36
- `app/src/content/validate.ts` -- add `NAME_WORD = 'xoài'` and `NAME_INTENTS = ['greeting','invite','ask','prompt','scene']`. A line whose words contain the name and whose intent segment is not in `NAME_INTENTS` reports `voice "<id>": the name "Xoài" is only for greetings, invitations and prompts (never praise)` -- NFR3
- `app/src/content/voice-rules.test.ts` -- tests: the name in `vo.pizza.happy` fails; in `vo.pizza.ask.x` it passes; on the real lines, every `GAME_IDS` scope has ≥ 1 line with the name and an `ask|prompt|scene` intent; the greeting and every `vo.shell.invite.*` contain it -- AC1
- `app/src/core/shell-flow.ts` (+ `shell-flow.test.ts:31`) -- Start no longer says the greeting (pop, music, unlock, leave) -- the greeting moves to the island
- `app/src/content/audio-catalog.ts`, `app/tools/audio/make-placeholders.ts` (+ its test, if it lists ids) -- add `sfx.shell.woof` (creature): two short soft "gâu" yips around 500–700 Hz, ≤ 400 ms. Run `npm run audio:placeholders` and `npm run audio:check` -- FR33 tap sound
- `app/tools/shared/binaries.ts`, `app/tools/tts/generate.ts` -- change the 7.2.8 mentions to 7.3.1. Then run `npm run tts` with the env vars above -- AR-N3
- `app/tools/render/blender/build_map.py` -- add a `GUIDE` group:
  - Move `A_Shiba` and its descendants out of the ice-cream sprite into `sprite.shiba` (`occlude` = 1, `states` = `{"idle":[1],"wave":[20,21,22,23]}`).
  - `anchor.ice-cream` is still computed from the ice-cream points plus the dog's points; `hit.ice-cream` uses the ice-cream points only.
  - Add `hit.shiba` (hull of the dog's evaluated verts) and `anchor.shiba` (ground pivot).
  - Wave keys: re-parent `shiba-legR` and `shiba-pawR` onto a new pivot `shiba-arm` at the shoulder (keep the world transform; key it at rest on frame 1). On frames 20–23, alternate the paw raised high and mid, the head roll ±8° and the tail ±20°, using `key_chibi` plus CONSTANT keys on the pivot.
  - Fail loudly if a part name is missing.
  -- FR34 art
- `app/tools/layout/rules.ts` (+ `rules.test.ts`), `app/tools/render/render.ts:63`, `app/tools/lint/validate-content.ts:77,126` -- `validateLayout` takes an optional `guide: 'shiba'`: anchor and hit present, hit inside the interactive rect, min width ≥ `targetMin`. Both call sites pass it, and the map's required frames gain `shiba/idle/00` and `shiba/wave/00..03` -- layout safety
- Run `npm run art:build -- map`, `npm run render -- map` and `npm run atlas -- map` (`BLENDER_BIN` set) -- the generated `map.layout.json`, bg and atlas update. The existing decoration and station rules must still pass.
- `app/src/core/tokens.ts`/`timing.ts` -- add `Timing.guideWaveFrameMs` (≈ 160) and `Timing.guideWaveMs` (≈ 1300, two passes over the 4 frames), then run `npm run tokens` -- AR-N4
- `app/src/content/assets.ts` -- `MAP_GUIDE = { id: 'shiba', idle: 'shiba/idle/00', wave: ['shiba/wave/00', …, 'shiba/wave/03'] }` -- one source of frame names
- `app/src/core/map-plan.ts` (+ test) -- `MapPlan.guide?: { image?, hit, depth }`, with a warning for a missing frame or layout entry -- planned like a station without a label
- `app/src/core/map-guide.ts` (+ `map-guide.test.ts`) -- pure:
  - `createMapGuide({ greeted(): boolean, markGreeted() })` with:
    - `enter()`: on the first call per session, returns `[wave, say greeting, setPrompt greeting?]`; afterwards `[]`;
    - `invite()`: returns `[wave]`;
    - `tap({ blocked })`: returns `[bounce, sfx woof]`, or `[]` when blocked.
  - `waveFrame(elapsedMs, reduced)` returns the frame to show, or `undefined` once `guideWaveMs` has passed. With `reduced`, it holds `wave/00`.
  - The tests cover every matrix row except Missing art.
  -- testable core
- `app/src/core/session-store.ts` -- `guideGreeted = false` -- once per session
- `app/src/scenes/Map.ts`:
  - Draw the guide image at depth = anchor y.
  - Register a `HotspotPolygon` on `hit.shiba` after the stations; on tap, run `guide.tap({ blocked: chain active || playAgain })`.
  - Run `guide.enter()` at the end of `create` (setPrompt only when `islandPrompt` is undefined).
  - In `invite(id)`, also run `guide.invite()`.
  - The wave runs on a scene `time` loop that swaps frames via `waveFrame` and restores `idle`. Cancel it on shutdown.
  - Bounce follows the `bounceKart` pattern.
  -- FR34 wiring

**Acceptance Criteria:**
- Given content and its rendered audio, when `npm run validate:content` and `npm run audio:check` run, then both pass. In addition, the greeting "Xoài ơi, chơi gì nào?", every invite and ≥ 1 prompt family per game contain "Xoài", with no line over 8 words and no name outside greeting/invite/prompt intents.
- Given a fresh session, when the Start button is tapped and the island appears, then the Shiba by the ice-cream truck waves and "Xoài ơi, chơi gì nào?" plays once. Returning from a game, it does not repeat.
- Given the child sits still until an invitation, when the ring and bob start on a station, then the Shiba waves at the same time.
- Given the parked island, when the child taps the Shiba, then it bounces with a small "gâu" within one frame and the ice-cream game does not start. Tapping the ice-cream truck still opens it.
- Given `cd app && npm run check`, then it exits 0.

## Spec Change Log

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 27 findings — high 0, medium 2, low 18, false 7, maybe-false 0
- findings:
  - `[false]` `reject` (blind) name allowed on ask lines replayed as retries/hints — NFR3 bans the name only in praise; a re-asked request is still a request (FR36)
  - `[low]` `patch` (blind) NAME_INTENTS comment says second segment, code reads third; double quotes — patched: comment + quotes
  - `[low]` `reject` (blind) exact-token name check misses "Xoai" — content is authored in-repo; no misspelt name exists
  - `[low]` `reject` (blind) fishing size prompts not named — spec chose colour prompts; "at least one prompt per game" met
  - `[low]` `patch` (blind) ice-cream ask comment stale after rewording — patched: comment updated (line text kept: still a request "… kem … nào!")
  - `[low]` `patch` (blind) wave runs 1300 ms vs 1280 ms of frames, extra frame — patched: guideWaveMs 1280, exact test
  - `[low]` `patch` (blind) woof test regex unescaped — patched; hard-coded partial numbers left (placeholder sound)
  - `[low]` `patch` (blind) guide tap during kart drive / zoom — patched: blocked unless parked; idle reset already via router onAnyTap (no change)
  - `[false]` `reject` (blind) generated assets missing — atlas, woof and vo files are on disk (binaries not in a text diff); validate:content passes
  - `[false]` `reject` (blind) edge-tts bump unrelated — required: 7.2.8 is refused by the service (HTTP 403); recorded in README/memlog
  - `[low]` `reject` (blind) GuideCommand ids typed as string — ids come from two exported constants used by tests; adding branded types is extra surface
  - `[false]` `reject` (blind) idle frame inherits wave keys — make_source_v3 swap_shiba keys the rig at frame 1 (key_chibi(rig, 1))
  - `[low]` `reject` (blind) `_keyframes` private import — internal tool module, same package
  - `[medium]` `defer` (blind) occludesKart/waveGuide/bounceGuide untested — scene code, grouped with VG1
  - `[low]` `reject` (blind) greeting test pins exact text — intended: the greeting text is an AC
  - `[low]` `reject` (blind) validateLayout does not check guide anchor in interactive rect — the guide is decoration-like; anchor comes from the existing dog
  - `[medium]` `defer` (verification-gap) Map scene guide wiring untested — no scene harness (filed defer)
  - `[low]` `patch` (verification-gap) validate:content guide checks unproven — patched: two failing-case tests
  - `[low]` `patch` (verification-gap other) tap ignores kart state — grouped with the parked patch
  - `[low]` `patch` (verification-gap other) comment segment mismatch — grouped
  - `[low]` `reject` (verification-gap other) fishing doc comment mixes forms — deliberate, size prompts unchanged
  - `[low]` `patch` (edge) degenerate shiba hit (< 3 points) accepted — patched: ≥ 3 guard + test
  - `[low]` `patch` (edge) extra wave frame — grouped with timing patch
  - `[low]` `reject` (edge) wave clock keeps running while paused — Map pauses only behind the unlock overlay; ending the wave early is harmless
  - `[low]` `patch` (edge) tap during kart drive — grouped
  - `[false]` `reject` (edge claim) wave timing claim — same finding as the timing patch (kept there)
  - `[false]` `reject` (intent) divergences A/B/C/D are the spec's recorded decisions (text rewrite in place, greeting moved to the island, strict intent allowlist); scene/pipeline coverage deferred with VG1

## Design Notes

Golden lines (each ≤ 8 words, counted by `voiceWords`; "sô-cô-la" counts as 3):
```
vo.shell.greeting            Xoài ơi, chơi gì nào?            (no "|")
vo.shell.invite.ice-cream    Xoài ơi, mình đi ăn | kem nào!   (… pizza "mình làm | pizza nào!", touch-talk "mình đi | chạm là nói nào!" = 8)
vo.ice-cream.ask.mint        Xoài ơi, | kem bạc hà màu xanh nào!   (same pattern for dâu/hồng, vani/trắng; sô-cô-la without a colour)
vo.dino-puzzle.ask           Xoài ơi, ghép bạn | khủng long nào!
vo.shadow-match.ask.tractor  Xoài ơi, bạn máy cày ở | bóng nào?
vo.race.prompt               Xoài ơi, lái xe | tới cổng nhé!
vo.fishing.prompt.color-blue Xoài ơi, câu cá | xanh vây dài nào!
vo.touch-talk.scene.sea      Xoài ơi, | biển!
```

Decisions taken for intent gaps (auto-run):
- **Which prompts carry the name:** one family per game, picked from the lines heard earliest or every round (lowest-level ice-cream asks, all pizza asks, the single dino/race prompts, the colour fishing prompts, the touch-talk scene names). Ice-cream drops "cho Shiba" to keep the colour words within 8 words. Size prompts, retries and multi-scoop asks keep "Bé"/no name.
- **One greeting per session:** the Start greeting moves to the island. The id `vo.shell.greeting` is kept with the new text, so boot and audio tests stay valid, and Start no longer speaks it. This avoids two back-to-back greetings and the Map line cutting the Start line.
- **Which Shiba:** the existing island dog beside the ice-cream truck becomes the guide, so no new spot has to clear the layout rules. Its points still count toward `anchor.ice-cream`, so the slots don't move. It has its own hull, which wins taps over the ice-cream hull.
- **Wave = raised right paw** on a map-local pivot plus a head tilt and tail wag, 4 frames played twice. This is a stated exception to "one prominent motion": the invitation and the wave are one combined call to action, as the AC asks.
- **"Gâu"** is a synthesized placeholder `sfx.shell.woof` like the other SFX, replaceable later under the same id.
- **Taps during the post-round chain / play-again overlay are ignored**, like the kart, so they never collide with 5.5's choice step.
- **Depth risk:** the dog and truck are now separate images sorted by anchor y. Check the composed map against the previous render, and if the order looks wrong, nudge `anchor.shiba` depth in `map-plan` (not the art).

## Verification

**Commands:**
- `cd app && npx vitest run src/content src/core/map-guide.test.ts src/core/map-plan.test.ts src/core/shell-flow.test.ts tools/layout` -- expected: all pass
- `cd app && npm run audio:check && npm run validate:content` -- expected: exit 0, no missing or mismatched `.m4a`/`.hash`
- `cd app && npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- Inspect `app/.generated/render/map/frames/shiba/wave/*.png` and the atlas: the paw is visibly raised on the wave frames, and `ice-cream/idle/00` no longer contains the dog.
- Run a headless Chrome pass (dev server + CDP driver in the session scratchpad): enter the Map → wave + greeting; wait for an invite → wave; tap the dog → bounce, ice-cream not opened.

## Auto Run Result

Status: done

- **Summary:** the island Shiba is its own map sprite (`sprite.shiba`, idle + wave frames, own hit/anchor) that greets "Xoài ơi, chơi gì nào?" once per session on the island (greeting moved off Start), waves with each idle invitation and bounces + "gâu" when tapped (blocked during the post-round chain, play-again overlay, kart drive). 43 voice lines rewritten with "Xoài" (greeting, 7 invites, one prompt family per game) and re-synthesised with edge-tts 7.3.1; validator rule keeps the name out of every intent but greeting/invite/ask/prompt/scene.
- **Files:** `content/voice-lines.ts`, `content/validate.ts` (+ `voice-rules.test.ts`), `core/map-guide.ts` (+ test), `core/map-plan.ts` (+ test), `core/session-store.ts`, `core/shell-flow.ts`, `core/timing.ts`, `content/assets.ts` (`MAP_GUIDE`), `scenes/Map.ts`, `scenes/Start.ts`, `tools/render/blender/build_map.py`, `tools/layout/rules.ts` (+ test), `tools/lint/validate-content.ts` (+ test), `tools/render/render.ts`, `tools/audio/make-placeholders.ts` (+ test, `sfx.shell.woof`), `tools/shared/binaries.ts`, `tools/tts/generate.ts`; regenerated map.blend/layout/atlas and audio.
- **Review:** 27 findings — 7 patch entries (all low) applied, 2 deferred (Map scene wiring tests), 18 rejected with reasons.
- **Follow-up review recommended:** false (no high, no medium patched).
- **Verification:** `npm run check` exit 0 (113 files, 1604 tests); headless Chrome: dog drawn by the truck, tap bounces without opening ice-cream, truck still opens ice-cream.
- **Residual risks:** 43 new lines need a parent's listen-approval; the wave is subtle from the map camera (art tuning `GUIDE_ARM_*`); scene wiring untested.
