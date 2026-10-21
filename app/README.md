# Bé Học Chơi — app

Offline toddler learning games for iPad Safari (landscape, Home-Screen PWA), built with
Phaser 4 + Vite + TypeScript. Scaffolded from `phaserjs/template-vite-ts` 1.4.0. The starter's
`log.js` telemetry, `vite/` configs and template scenes have been removed.

Architecture: `../_bmad-output/planning-artifacts/architecture/architecture-be-hoc-choi-2026-10-08/ARCHITECTURE-SPINE.md`.

## Requirements

- Node.js 24 (`.nvmrc`; `engines: ">=24 <25"`). Tools under `tools/` run as `.ts` directly via
  Node 24 type stripping, so there is no build step for them.
- Only to (re)generate audio (not needed for `npm run check` or to run the app):
  - **ffmpeg** on PATH (`winget install Gyan.FFmpeg`), or `FFMPEG_BIN` set to the full path of `ffmpeg.exe`.
  - **An ElevenLabs API key** with text-to-speech and voices-read access, as `ELEVENLABS_API_KEY` in
    the environment or in a `.env` file in `app/` or the project root (never commit it; `tts` and
    `doctor` never print it). `npm run tts` calls the ElevenLabs API (model `eleven_v3`, voice
    "Thắm", `VOICE_DEFAULTS` in `src/content/voice-lines.ts`), so it needs the network **at build
    time only**; the app never does. One full render of the ~185 lines costs about 1,700 credits.
  - `tts` resolves ffmpeg (env var, then PATH, probed with `-version`) and reads the key before any
    work, and exits 1 naming the missing one without writing any file.
  - **Changing the voice or engine:** keep the recipe (the whole sentence in one request, silence
    trimmed, two-pass loudnorm to −16 LUFS, AAC mono 44.1 kHz 64k) and the `<id>.m4a` + `<id>.hash`
    pair (`lineHash` in `tools/tts/line-hash.ts`; bump its `v` when the recipe changes). Until
    2026-10-21 the lines were rendered with edge-tts (vi-VN-HoaiMyNeural) in `|` segments.

- Only to (re)build the images (not needed for `npm run check` or to run the app):
  - **Blender 5.2.2 LTS** (blender.org) with `blender` on PATH, or `BLENDER_BIN` set to the full path of
    `blender.exe` (e.g. `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe`). Any other version
    than 5.2.x is refused ("needs Blender 5.2 (found X)").
  - `npm run doctor` reports Blender, ffmpeg and the ElevenLabs key together and exits 1 if one is missing.

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies (the only step that uses the network) |
| `npm run dev` | Dev server at <http://localhost:8080> (no outbound requests) |
| `npm run build` | Production build into `dist/` (relative `base: './'`), including the PWA files `sw.js`, `workbox-*.js` and `manifest.webmanifest` |
| `npm run preview` | Serve the built `dist/` at <http://localhost:4173> (service worker active; test offline here) |
| `npm run pwa:icons` | Re-draw the PWA / Home-Screen icons into `public/icons/` (deterministic, no network) |
| `npm run precache:check` | Check `dist/` after a build: every runtime file under `public/` is precached, no file > 8 MiB, no `http(s)://` in the worker/manifest/HTML (see *Offline, install and preview deploy*) |
| `npm run tokens` | Regenerate `src/core/tokens.generated.ts` from the DESIGN.md YAML front matter |
| `npm run audio:placeholders` | Re-synthesize the placeholder SFX/music `.m4a` files with ffmpeg (see *Assets and provenance*) |
| `npm run audio:check` | Story 3.3: measure every creature sound (catalog `creature: true`) with ffmpeg: ≤ 800 ms, nothing below 150 Hz, peak ≤ −18 dBFS, soft fade-in. Not part of `check` |
| `npm run audio:normalize -- <src> <audioId>` | Master a real SFX/music file into its catalog path (two-pass loudnorm: music −30 LUFS; SFX −20 LUFS with a 50 ms fade-in) |
| `npm run content:export` | Write the voice lines to `.generated/voice-lines.json` (gitignored) for the TTS tool |
| `npm run tts [-- --force]` | Render new or changed voice lines to `public/assets/audio/vo/<id>.m4a` + `.hash` (see *Voice lines*) |
| `npm run doctor` | Report the build-time tools (Blender 5.2, ffmpeg, the ElevenLabs key); exit 1 if any is missing |
| `npm run art:build -- map` | Build `../art/map.blend` from the vendored reference `../art/src/map-v3.blend` (made from `map-v2.blend` by `tools/render/blender/make_source_v3.py`) (see *Image pipeline*) |
| `npm run render -- map` | Render `../art/map.blend` → `.generated/render/map/` + `src/content/generated/map.layout.json` |
| `npm run atlas -- map` | Pack the rendered frames → `public/assets/atlases/map.{png,json}` and copy the plate → `public/assets/bg/map.png` |
| `npm run check` | **The gate.** `tsc --noEmit` → ESLint → Vitest (`src/core/**`, `src/content/**`, `tools/**` tests) → tokens diff → content validator → `vite build` → precache check |

Vitest also runs the tools tests: `tools/tokens/parse.test.ts` (token parser fails closed),
`tools/lint/rules.test.ts` (each ESLint layer/literal/audio rule, plus the GameId list kept in sync),
`tools/audio/*.test.ts` (ffmpeg arguments), `tools/shared/binaries.test.ts` (missing-tool errors),
`tools/tts/generate.test.ts` (TTS arguments, skip rules, loudnorm parsing and missing tools, with
fake binaries) and `tools/lint/validate-content.test.ts` (the validator against temp `public/` trees).
The content validator checks the audio catalog (id grammar, path convention, each file exists) and
the voice lines (see *Voice lines*).

`npm run tokens` and the tokens-diff step read DESIGN.md from
`../_bmad-output/planning-artifacts/ux-designs/ux-be-hoc-choi-2026-10-08/DESIGN.md`, outside `app/`.
`app/` alone (without that folder next to it) cannot pass `npm run check`.

**Every story must pass `npm run check` before it is done.** Since Story 1.11 it ends with
`npm run build && npm run precache:check`; its last line is the precache summary.

## Run on the PC with iPad emulation (primary dev loop)

1. `npm run dev`, then open <http://localhost:8080> in Chrome or Edge.
2. Open DevTools (F12) and toggle the device toolbar (Ctrl+Shift+M).
3. Pick **iPad** (or a custom 1024×768 device), set it to **landscape**, and keep touch emulation on.
4. Check the other iPad sizes too: 1180×820 (iPad Air) and 1366×1024 (iPad Pro 12.9").
   The canvas must fill the screen with no bars. On wider screens the top and bottom are cropped
   slightly, but `Tokens.safeRect` stays visible.
5. Use the rotate button to switch to portrait. The whole stage turns 90° and stays landscape;
   there is no "rotate your device" screen. **Only the picture is correct in portrait so far:**
   taps are not mapped to the right game coordinates until Story 1.6 adds `core/input/space.ts`.

`npm run dev` registers no service worker. `localhost` is a secure context, so the service worker
and offline behaviour are tested on the PC with `npm run build && npm run preview` (see *Offline,
install and preview deploy*). Real-device checks happen on the iPad through an HTTPS preview deploy.

## Layout and rules

```text
src/
  main.ts          Phaser config: 1024×768, Scale.ENVELOP + CENTER_BOTH, input.activePointers
  styles/stage.css NFR6 page guards (touch-action, user-select, callout, overscroll) + portrait rotation
  core/            services: tokens(.generated), timing, bus, stage …   (core → content)
  content/         typed data; imports only types from other layers
  scenes/          shell scenes: Boot, Start, Map (placeholder), AudioUnlockOverlay  (scenes → games/core/content)
  games/<GameId>/  one MiniGame scene per folder                    (games → core/content)
tools/
  tokens/          DESIGN.md YAML → src/core/tokens.generated.ts (`--check` = diff gate)
  lint/            content validators (GameIds, audio catalog, voice lines)
  audio/           make-placeholders.ts (synthesized placeholder SFX/music), normalize.ts (master real SFX/music)
  content/         export-voice-lines.ts: voice lines → .generated/voice-lines.json
  tts/             generate.ts (ElevenLabs + ffmpeg → .m4a + .hash), elevenlabs.ts (the API call), line-hash.ts
  shared/          binaries.ts: env-override/PATH resolution of ffmpeg and Blender (5.2 check)
  layout/          geometry, raw → layout conversion and the layout/asset rules (pure, shared by render and check)
  render/          build.ts (art:build), render.ts, blender/*.py (run inside Blender)
  atlas/           pack.ts (free-tex-packer-core)
  doctor/          doctor.ts
```

- **Layers** are enforced by ESLint `@typescript-eslint/no-restricted-imports`.
- **Design values** come only from `Tokens.*`. Behaviour durations come only from
  `Tokens.Timing.*`, defined in `src/core/timing.ts` from EXPERIENCE.md.
- `src/core/tokens.generated.ts` is generated and checked in, so never edit it by hand.
- In `scenes/` and `games/`, ESLint rejects hex/`rgba(` colour literals and magic numbers. Only
  `-1, 0, 1, 2, 0.5` are allowed.
- **Cross-scene events** go through the typed `bus` (`src/core/bus.ts`). Scenes subscribe with
  `bus.scoped(this)`, which unsubscribes them on scene SHUTDOWN or DESTROY.
- **Sound** goes only through `audio` (`src/core/audio-director.ts`), by catalog id from
  `src/content/audio-catalog.ts` or voice-line id from `src/content/voice-lines.ts`. In `scenes/` and `games/`, ESLint rejects `this.sound` and
  `.m4a` / `assets/audio` strings.

## Start flow (Story 1.2)

`Boot` shows only the loading-strip (a kart on a short road) while it loads the audio and waits
for the readiness gate: the first service-worker precache has finished (skipped in dev, with no
registration or an already active worker; after `Tokens.Timing.swPrecacheTimeoutMs` = 20 s it warns
and continues online — Story 1.11) and the vendored Baloo 2 font has loaded. The load loop lives in
`src/core/boot-load.ts › createBootLoader` (tested in node); `Boot` is its Phaser adapter. If a load fails, the kart slows down and the load retries on
`online` or every `Tokens.Timing.loadRetryMs`. Errors go only to `console.warn`.

`Start` shows the bobbing yellow ▶. A tap plays the pop, starts the music loop, unlocks audio,
plays the `vo.shell.greeting` voice line once (over the ducked music), calls `ProgressStore.init()` and opens the placeholder `Map`. If the app comes back from the
background with a suspended AudioContext, `AudioUnlockOverlay` pauses the scene under a light dim
and a ▶. A tap on the ▶ resumes it once audio runs again; otherwise the overlay stays up for
another tap. The tap and overlay logic lives in `src/core/shell-flow.ts` (tested in node).

To see the failure path in DevTools, set Network to *Offline* while the kart drives, then go back
online.

## Voice lines (Story 1.3)

Every spoken line is data in `src/content/voice-lines.ts`: `{ id, text, keywordPauseMs?, rate?, approved? }`.
Code plays it by id with `audio.say(id)` / `audio.sayChain(ids)`. There is one voice channel, and the
music ducks by 20 dB while a line plays. `npm run check` enforces these rules and names the id of
every failure:

- the id is `vo.<shell|GameId>.<intent>[.<subjectId>][.<n>]` in kebab-case, and the file is
  `public/assets/audio/vo/<id>.m4a`;
- at most 8 words; `|` marks the keyword (no empty segment around it) and needs
  `keywordPauseMs` (about 300), and vice versa. The sentence is spoken whole (no inserted pause);
- never dâu/đâu, cá/cà, ba/bà, bóng/bông or cam/cầm in one sentence. No praise, never "sai";
- the `.m4a` and `.hash` exist, the `.hash` matches the line, and no stray file is left in `vo/`.

**Add or change a line:** edit `voice-lines.ts`, run `npm run content:export && npm run tts`, and
commit both files. `tts` skips lines whose `.hash` is current (`--force` re-renders them) and
**never** overwrites an approved line. When you remove a line, delete its two files by hand.
The API sometimes answers 429 or 5xx; `tts` retries each line up to 5 times. eleven_v3 is not
deterministic: a re-render (`--force`) gives a new take, so listen before approving.

**Approve a line (a parent):** listen to the `.m4a`. It should be a warm, lively female voice with
natural intonation. If it is right, copy the content of its `.hash` into the line as
`approved: { textHash: '<hash>' }`. If the text is edited later, `npm run check` fails until the
line is regenerated and approved again. `vo.shell.greeting` is not approved yet.

## Assets and provenance

> 2026-10-21 (seamless play, `spec-choi-lien-mach`): a finished round now restarts in place, so the
> "Chơi nữa?" overlay is gone. Its voice lines (`vo.shell.play-again-ask.*`, `vo.shell.play-again-ask`,
> `vo.shell.play-again-elsewhere`) and their `.m4a`/`.hash` files were deleted; the `icon/<id>/00` frames
> stay in the map atlas until the deferred art cleanup.

| File | Source | Licence |
| --- | --- | --- |
| `public/assets/fonts/Baloo2-wght.woff2` | Baloo 2 by The Baloo 2 Project Authors, github.com/google/fonts `ofl/baloo2`, subset (see below) | SIL OFL 1.1 (`OFL.txt`) |
| `public/assets/audio/sfx/sfx.shell.pop.m4a` | Synthesized in-house by `tools/audio/make-placeholders.ts` (ffmpeg) | Project's own (MIT) |
| `public/assets/audio/music/music.island.m4a` | Synthesized in-house by `tools/audio/make-placeholders.ts` (ffmpeg) | Project's own (MIT) |
| `public/assets/audio/vo/vo.shell.greeting.m4a` (+ `.hash`) | Generated by `npm run tts`: ElevenLabs eleven_v3, library voice "Thắm - Giọng Nữ Miền Bắc" (all lines re-rendered 2026-10-21; before: edge-tts vi-VN-HoaiMyNeural), processed with ffmpeg | Our own text; generated speech, subject to the ElevenLabs terms of service |

| `public/assets/atlases/map.{png,json}`, `public/assets/bg/map.png` | Rendered by `npm run render`/`atlas` from `../art/map.blend` (built from the approved reference scene) | Project's own render of the CC0 models below |
| `public/assets/atlases/ice-cream.{png,json}`, `public/assets/bg/ice-cream.png` | Story 1.8: rendered by `npm run render`/`atlas` from `../art/ice-cream.blend` (`tools/render/blender/build_ice_cream.py`: the island backdrop, a script-built counter, the chibi Shiba (`cute.py`, primitives), and (2026-10-21) the four scoops with their toppings and the waffle cone, all procedural meshes) | Project's own render of the CC0 models below (the island backdrop) |
| `public/assets/audio/sfx/sfx.ice-cream.{snap,happy}.m4a` | Story 1.8: synthesized in-house by `tools/audio/make-placeholders.ts` (ffmpeg) | Project's own (MIT) |
| `public/assets/audio/sfx/sfx.ice-cream.sneeze.m4a` | Story 6.1: "small dog sneezing.wav" by Dienamyte, freesound.org/s/548465 (HQ preview), trimmed to 0.46–1.06 s, high-passed at 220 Hz and mastered with `npm run audio:normalize` (peak lowered to −19.5 dBFS); a creature sound measured by `npm run audio:check` | CC0 1.0 |
| `public/assets/audio/vo/vo.ice-cream.{ask,retry}.*.m4a` (+ `.hash`) | Story 1.8: generated by `npm run tts` (ElevenLabs eleven_v3, voice "Thắm"; re-rendered 2026-10-21), not yet approved | Our own text; generated speech, subject to the ElevenLabs terms of service |
| `public/assets/atlases/pizza.{png,json}`, `public/assets/bg/pizza.png` | Story 3.1: rendered by `npm run render`/`atlas` from `../art/pizza.blend` (`tools/render/blender/build_pizza.py`: the island backdrop, a script-built counter, oven, base and sausage slices, Quaternius `animals/Fox.fbx` recoloured, Kenney food-kit `bowl.glb` and `mushroom-half.glb` recoloured) | Project's own render of the CC0 models below |
| `icon/pizza/00` in `public/assets/atlases/map.{png,json}` | Story 3.1: the game icon (drawn on the play-again overlay until 2026-10-21; kept in the atlas until the art cleanup), Quaternius `animals/Fox.fbx` recoloured (`build_map.py`) | Project's own render of the CC0 models below |
| `public/assets/audio/sfx/sfx.pizza.{snap,ting,munch,happy}.m4a` | Story 3.1: synthesized in-house by `tools/audio/make-placeholders.ts` (ffmpeg) | Project's own (MIT) |
| `public/assets/audio/vo/vo.pizza.*.m4a`, `vo.shell.invite.pizza.m4a` (+ `.hash`) | Story 3.1: generated by `npm run tts` (ElevenLabs eleven_v3, voice "Thắm"; re-rendered 2026-10-21), not yet approved; the "pizza" and "xúc xích" lines carry `review` for a parent | Our own text; generated speech, subject to the ElevenLabs terms of service |
| `bowl-*`, `topping-pepper` in `public/assets/atlases/pizza.{png,json}` | Story 3.2: the bowls (Kenney food-kit `bowl.glb` with a static pile) became one sprite per topping; the green bell-pepper ring is Kenney food-kit `paprika-slice.glb` recoloured `art.pizza.pepper` (`build_pizza.py`) | Project's own render of the CC0 models below |
| `public/assets/atlases/dino-puzzle{.json,-0..n.png}`, `public/assets/bg/dino-puzzle.png` | Story 3.3: rendered by `npm run render`/`atlas` from `../art/dino-puzzle.blend` (`tools/render/blender/build_dino_puzzle.py`: the island backdrop by the dino-park lawn, Quaternius `dinosaurs/Apatosaurus.fbx`, `Triceratops.fbx` and `Stegosaurus.fbx` recoloured with builder-made eyes and cut into pieces by bone groups, script-built clouds); the ghost frames are traced and drawn by `tools/render/ghost.ts` | Project's own render of the CC0 models below |
| `icon/dino-puzzle/00` in `public/assets/atlases/map.{png,json}` | Story 3.3: the game icon (drawn on the play-again overlay until 2026-10-21; kept in the atlas until the art cleanup), Quaternius `dinosaurs/Apatosaurus.fbx` recoloured and drawn in its rest pose (`build_map.py`) | Project's own render of the CC0 models below |
| `public/assets/audio/sfx/sfx.dino-puzzle.{snap,happy}.m4a`, `sfx.dino-puzzle.{apatosaurus,triceratops,stegosaurus}.happy.m4a` | Story 3.3: synthesized in-house by `tools/audio/make-placeholders.ts` (ffmpeg); the three creature calls are measured by `npm run audio:check` | Project's own (MIT) |
| `public/assets/audio/vo/vo.dino-puzzle.*.m4a`, `vo.shell.invite.dino-puzzle.m4a` (+ `.hash`) | Story 3.3: generated by `npm run tts` (ElevenLabs eleven_v3, voice "Thắm"; re-rendered 2026-10-21), not yet approved | Our own text; generated speech, subject to the ElevenLabs terms of service |
| `public/assets/atlases/shadow-match.{png,json}`, `public/assets/bg/shadow-match.png` | Stories 3.5, 3.6: rendered by `npm run render`/`atlas` from `../art/shadow-match.blend` (`tools/render/blender/build_shadow_match.py`: the island backdrop with a script-built low-poly cave mouth and two two-tier rock ledges, Quaternius `dinosaurs/Triceratops.fbx` recoloured with builder-made eyes (`common.py › dress_dino`), Quaternius `animals/ShibaInu.fbx`, `Cow.fbx`, `Horse.fbx`, `Donkey.fbx`, `Stag.fbx` (Story 3.6; posed with their `Idle` action) and Kenney car-kit `sedan.glb`, `truck.glb`, `tractor.glb` in their source colours); the `item-*/shadow/00` frames are derived from the colour frames by `tools/render/ghost.ts › silhouetteFrame` | Project's own render of the CC0 models below |
| `icon/shadow-match/00` in `public/assets/atlases/map.{png,json}` | Story 3.5: the game icon (drawn on the play-again overlay until 2026-10-21; kept in the atlas until the art cleanup), Quaternius `dinosaurs/Triceratops.fbx` recoloured and drawn in its rest pose (`build_map.py`) | Project's own render of the CC0 models below |
| `public/assets/audio/sfx/sfx.shadow-match.{snap,happy}.m4a`, `sfx.shadow-match.trike.happy.m4a` | Story 3.5: synthesized in-house by `tools/audio/make-placeholders.ts` (ffmpeg); the triceratops chirp is a creature sound measured by `npm run audio:check` | Project's own (MIT) |
| `public/assets/audio/vo/vo.shadow-match.{ask,name}.*.m4a`, `vo.shell.invite.shadow-match.m4a` (+ `.hash`) | Story 3.5 (Story 3.6: `ask.donkey`, `ask.stag`, `name.donkey`, `name.stag`): generated by `npm run tts` (ElevenLabs eleven_v3, voice "Thắm"; re-rendered 2026-10-21), not yet approved | Our own text; generated speech, subject to the ElevenLabs terms of service |
| `public/assets/atlases/race.{png,json}`, `public/assets/bg/race.png` | Stories 4.1, 4.2: rendered by `npm run render`/`atlas` from `../art/race.blend` (`tools/render/blender/build_race.py`: the island backdrop (`map-v2.blend` world, nature and sky) seen from a high 3/4 camera, the map-v2 kid kart (`Car`: Kenney `kart-oobi` and its driver) with a builder-made pink cap, big eyes and waving arm, the map-v2 checkered arch (`Race`); Story 4.2: the twelve ladder roads (straight, curve, zigzag, loop) generated from parametric tables, one swaying Kenney car-kit `cone.glb` sprite and one swaying map-v2 race flag sprite (`FlagPole-1`/`Flag-1`)) | Project's own render of the CC0 models below |
| `icon/race/00` in `public/assets/atlases/map.{png,json}` | Story 4.1: the game icon (drawn on the play-again overlay until 2026-10-21; kept in the atlas until the art cleanup), Kenney car-kit `kart-oobi.glb` in its source colours (`build_map.py`) | Project's own render of the CC0 models below |
| `public/assets/audio/sfx/sfx.race.{engine,horn,happy}.m4a` | Story 4.1: synthesized in-house by `tools/audio/make-placeholders.ts` (ffmpeg) | Project's own (MIT) |
| `public/assets/audio/vo/vo.race.{prompt,retry}.m4a`, `vo.shell.invite.race.m4a` (+ `.hash`) | Story 4.1: generated by `npm run tts` (ElevenLabs eleven_v3, voice "Thắm"; re-rendered 2026-10-21), not yet approved | Our own text; generated speech, subject to the ElevenLabs terms of service |
| `public/assets/atlases/fishing.{png,json}`, `public/assets/bg/fishing.png` | Story 4.3: rendered by `npm run render`/`atlas` from `../art/fishing.blend` (`tools/render/blender/build_fishing.py`: the island backdrop (`map-v2.blend` world, nature and sky) seen from the north beach over open sea, Quaternius `cutefish/Dock_Long.fbx` and `FishingRod_Lvl1.fbx` in the plate, and Quaternius `cutefish/Clownfish.fbx`, `Koi.fbx`, `Betta.fbx` recoloured from `Tokens.art.fishing` (white stripes kept, builder-made white dots, long fins kept) in two sizes) | Project's own render of the CC0 models below |
| `icon/fishing/00` in `public/assets/atlases/map.{png,json}` | Story 4.3: the game icon (drawn on the play-again overlay until 2026-10-21; kept in the atlas until the art cleanup), Quaternius `cutefish/Koi.fbx` recoloured `creatureOrange` (`build_map.py`) | Project's own render of the CC0 models below |
| `public/assets/audio/sfx/sfx.fishing.{plop,bubble,reel,happy}.m4a` | Story 4.3: synthesized in-house by `tools/audio/make-placeholders.ts` (ffmpeg) | Project's own (MIT) |
| `public/assets/audio/vo/vo.fishing.{prompt,retry,name}.*.m4a`, `vo.shell.invite.fishing.m4a` (+ `.hash`) | Story 4.3 (Story 4.4: `prompt.size-*`, `retry.size-*`): generated by `npm run tts` (ElevenLabs eleven_v3, voice "Thắm"; re-rendered 2026-10-21), not yet approved | Our own text; generated speech, subject to the ElevenLabs terms of service |
| `public/assets/atlases/touch-talk-<n>.png`, `touch-talk.json`, `public/assets/bg/touch-talk-{sea,street,kitchen}.png` | Stories 4.5, 4.6; cute-toy restyle 2026-10-21: rendered by `npm run render`/`atlas` from `../art/touch-talk.blend` (`tools/render/blender/build_touch_talk.py`, one Blender scene per plate, only the island's world and Sun kept; a round `scene-thumb-<plate>` frame per plate cut from its background by `render`). `sea`: script-built gradient sky, puffy clouds, sea, foam and sand; props all script-built soft (fish, crab, starfish and seagull with chibi faces, boat, parasol, bucket and shovel, beach ball, green coconut, scallop shell). `street`: KayKit City Builder Bits `road_straight`, `road_straight_crossing`, `building_A`–`H`, `streetlight`, Tiny Treats Pretty Park `bush`, `flower_A/B`, `tree_large` (hazed) on a script-built sidewalk and verge; props KayKit City Builder `car_sedan`, `car_police`, `trafficlight_A`, `dumpster`, Tiny Treats Pretty Park `tree`, Homely House `house`, and script-built bus, truck, tractor and cone. `kitchen`: Tiny Treats Charming Kitchen `floor_tiles_kitchen`, `wall_tiles_kitchen_straight`, `wall_shelf_kitchen`, `countertop_straight_A/B/C`, `fridge` and KayKit Furniture Bits `rug_rectangle_stripes_A` (hazed); props Charming Kitchen `pot` (recoloured `creatureBlue`), `pan` (recoloured `art.touchTalk.tire`), `mug_red`, `spoon`, Baked Goods `bread`, Pleasant Picnic `apple` (with a builder-made leaf), KayKit Restaurant Bits `food_ingredient_carrot`, and script-built banana, egg and half watermelon | Project's own render of the CC0 models below |
| `public/assets/audio/sfx/sfx.touch-talk.*.m4a` | Stories 4.5, 4.6: synthesized in-house by `tools/audio/make-placeholders.ts` (ffmpeg); the seagull call is a creature sound measured by `npm run audio:check` | Project's own (MIT) |
| `public/assets/audio/vo/vo.touch-talk.{scene,name}.*.m4a`, `vo.shell.invite.touch-talk.m4a` (+ `.hash`) | Stories 4.5, 4.6: generated by `npm run tts` (ElevenLabs eleven_v3, voice "Thắm"; re-rendered 2026-10-21), not yet approved | Our own text; generated speech, subject to the ElevenLabs terms of service |
| `public/assets/audio/vo/vo.pizza.{ask,retry,enough,count}.*.m4a` for counts 4–5 and `ớt chuông` (+ `.hash`) | Story 3.2: generated by `npm run tts` (ElevenLabs eleven_v3, voice "Thắm"; re-rendered 2026-10-21), not yet approved; `ask.mushroom.5` ("năm lát nấm") carries `review` | Our own text; generated speech, subject to the ElevenLabs terms of service |

3D source models and textures used by `../art/` (all CC0 1.0, no attribution required):

| Source | Packs | Licence |
| --- | --- | --- |
| Kenney (kenney.nl) | car-kit, city-kit-commercial 2.1, city-kit-roads, food-kit | CC0 (`License.txt` in each pack under `../assets/kenney/`) |
| Quaternius (quaternius.com) | animals, cars, cutefish, dinosaurs, food | CC0 |
| Poly Haven (polyhaven.com) | HDRI `meadow_2` (1k, packed in the .blend) | CC0 |
| Tiny Treats (Isa & Kay Lousberg, github.com/TinyTreats-Game-Assets) | Pretty Park, Baked Goods (trees, bushes, flowers in `../art/src/map-v3.blend`, texture packed), Charming Kitchen, Pleasant Picnic, Homely House (Chạm là nói) | CC0 (`LICENSE.txt` under `../assets/tinytreats/`) |
| KayKit (Kay Lousberg, github.com/KayKit-Game-Assets) | Restaurant Bits, City Builder Bits, Furniture Bits (Chạm là nói) | CC0 (`LICENSE.txt` under `../assets/kaykit/`) |

Add a row for every new audio, font or image file. Real SFX and music go through `npm run audio:normalize`.

- **Font:** `public/assets/fonts/Baloo2-wght.woff2` is the Baloo 2 variable font (wght 400–800),
  © The Baloo 2 Project Authors, under the SIL Open Font License 1.1 (`public/assets/fonts/OFL.txt`).
  Source: `Baloo2[wght].ttf` and `OFL.txt` from github.com/google/fonts `ofl/baloo2`, fetched once
  on 2026-10-08. It was subset to Latin + Vietnamese and converted to woff2 with:

  ```sh
  uvx --from "fonttools[woff]" pyftsubset "Baloo2[wght].ttf" --layout-features='*' --flavor=woff2 \
    --output-file=Baloo2-wght.woff2 \
    --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+1EA0-1EF9,U+2000-206F,U+20AB,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
  ```

  The app registers it with `FontFace` and a relative URL (no CDN `<link>`), so it works offline.
- **Placeholder audio:** `tools/audio/make-placeholders.ts` synthesizes both files as mono AAC
  44.1 kHz 64 kb/s:
  - `public/assets/audio/sfx/sfx.shell.pop.m4a`: a 140 ms sine sweep 700→1100 Hz with a 50 ms
    fade-in, peak about −20 dBFS.
  - `public/assets/audio/music/music.island.m4a`: a 12 s seamless C–E–G pad and arpeggio,
    normalised to −30 LUFS.

  Regenerate them with `npm run audio:placeholders`. ffmpeg comes from `FFMPEG_BIN` (full path) or
  PATH, and the tool fails with a clear message if neither works. winget's `Gyan.FFmpeg` installs to
  `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-*\bin\ffmpeg.exe` without adding it
  to PATH, so point `FFMPEG_BIN` there. Check loudness with `ffmpeg -i <file> -af ebur128 -f null -`.
  To replace a placeholder with real audio, keep its id and path.

## Image pipeline (Story 1.4)

Screens are low-poly Blender scenes rendered to images; nothing on screen is drawn from hand-typed
coordinates (AD-10). The pipeline for the island map:

```sh
npm run art:build -- map   # art/src/map-v3.blend → art/map.blend (tools/render/blender/build_map.py)
npm run render -- map      # art/map.blend → .generated/render/map/ + src/content/generated/map.layout.json
npm run atlas -- map       # frames → public/assets/atlases/map.{png,json} (atlas.map), plate → public/assets/bg/map.png (bg.map)
```

- Blender always runs as `blender -b --factory-startup <blend> --python-exit-code 1 --python <script> -- …`,
  in a temp dir. Outputs are replaced only after Blender exits 0 and every check passes; a failure
  (missing Blender, wrong version, a Python error, a broken rule) exits 1 and leaves every existing
  output untouched.
- `art:build` opens the vendored reference scene, removes the Tiệm kem preview, groups each station
  into a `sprite.<id>` collection, recolours the creatures from `Tokens.colors.creature*`, and adds the
  layout objects. Its constants (station table, road centreline, the few rule fixes) are Blender
  world units read off the reference; it fails if any object has a subdivision modifier.
- `render` renders a 2048×1536 plate (`bg.png`, sprites hidden from the camera but still casting
  shadows) and one full-frame transparent frame per sprite collection (`frames/<object>/idle/00.png`), so
  an untrimmed frame lines up pixel-for-pixel with the plate. It projects the layout objects into
  `raw.json`, converts them to design px (`tools/layout/to-layout.ts`), validates them
  (`tools/layout/rules.ts`) and draws `.generated/render/map/preview.png` (hit polygons, anchors, slots,
  road) for a human alignment check. Re-rendering the same `.blend` gives a byte-identical layout JSON.
- `atlas` packs with free-tex-packer-core 0.3.9 (JSON hash, max 2048², trim on, no rotation, padding 2).
  It fails with no write on a second page, a page over 2048, a file over 8 MiB or a bad frame name.
- **Naming contract** (in the `.blend`): layout objects live in a `layout` collection (hide_render) and
  are named `<kind>.<id>` with kind `anchor`, `hit`, `slot` or `path` and a kebab-case id
  (`hit.pizza`, `anchor.pizza-stop`, `slot.pizza-1`, `path.road`, `anchor.kart-start`). A Blender
  duplicate suffix (`.001`), upper case or an unknown kind fails the render. Sprite groups are collections
  named `sprite.<object>` → atlas frames `<object>/<state>/<nn>`.
- Hit polygons are the convex hull of the station's projected vertices padded by `Tokens.spacing.hitPad`.
  Where perspective makes two padded hulls closer than `stationGap` (tall props reaching into the station
  behind), both are clipped either side of their best separating line. The stored polygon is the final
  tap area.
- `npm run check` (`validate:content`) re-checks the layout (stations = GameIds; hit, anchor, `-stop`
  and slots present; vertices inside `safeRect` minus the edge dead zones; width ≥ 80; stations ≥ 40 apart;
  stops on the road) and the assets (atlas pages ≤ 2048, required frames, bg 2048×1536, every file under
  `public/assets/` ≤ 8 MiB).
- `../assets/` (source models) and `../art/` (scenes) are not shipped; only `public/` is.
- **Island decorations are removed at runtime** (parent decision 2026-10-21): no gift is offered after a
  round or by Chạm là nói, nothing is placed or drawn on the island, and the app deletes decorations
  stored by older builds on its next start (`bhc.progress` schema v3 keeps only the difficulty levels).
  The art still carries them: `slot.*` layout objects, the `decoration/<id>/00` atlas frames and their
  checks (`content/decorations.ts`, `tools/layout/rules.ts`) stay until the map is re-rendered. The
  `vo.shell.prompt.reward` voice line ("Xoài ơi, chọn quà nào!") and its audio file were deleted.

## Input and Hud (Story 1.6)

- Every tap goes through `src/core/input`: one `TapRouter` per scene forwards each press to the global
  `InputGuard`. It drops presses in the edge strip (24 px sides, 32 px top, 40 px bottom, plus the
  safe-area inset), lets only the first finger play (a second finger may still tap the Hud's Speaker),
  and resolves the press to the topmost target over the layers overlay > hud > scene.
- `src/core/input/space.ts` is the only screen ↔ design transform; it also handles the portrait CSS rotation.
- ESLint bans raw pointer events (`pointerdown`, `gameobjectup`, `POINTER_DOWN`, …) and `clientX/Y`,
  `pageX/Y` outside `src/core/input/`.
- The Hud scene runs above Map and the games: Speaker (top-right) replays the last prompt; Home
  (top-left) shows only inside a game.

## Offline, install and preview deploy (Story 1.11)

**Offline behaviour.** The build is a PWA (`vite-plugin-pwa` 2.0.0, Workbox 7.4.1, `generateSW`). The
service worker precaches every runtime file (`js, css, html, png, webp, json, m4a, woff2, svg, ico,
webmanifest`; at most 8 MiB each) on the first online open. After that the app runs with no network at
all: there is no runtime caching, CDN, analytics, remote font or remote TTS. The app registers
`./sw.js` itself (`src/core/sw.ts`); nothing is registered in `npm run dev`.

**Updates apply only on a cold open.** When a new build is deployed, the new worker installs in the
background and then *waits*. Nothing calls `update()`, `skipWaiting()` or reloads the page, so a child
playing is never interrupted. The new version starts the next time the app is fully closed (swiped
away in the app switcher) and opened again.

**On the first open** Boot waits for the precache before it shows ▶, for at most 20 s
(`Tokens.Timing.swPrecacheTimeoutMs`). If the precache is slower or fails, the app still starts
online, and offline works from the next successful open.

**Test locally (PC):**
1. `npm run build && npm run preview`, then open <http://localhost:4173> in Chrome or Edge.
2. Wait for ▶ (the first open precaches everything). DevTools › Application › Service workers shows
   `sw.js` *activated and running*; Application › Manifest shows the name, the 3 icons and no errors.
3. DevTools › Network: tick *Offline* and reload. Start → Map → Tiệm kem must play with voice and
   music, every request must show *(ServiceWorker)*, and no request may go to another origin.
4. Update check: with the page open on the Map, change something visible, run `npm run build` again
   (keep `preview` running or restart it), and click *Update* in Application › Service workers. The new
   worker shows *waiting to activate*, and the page does not reload. It becomes active only after every
   tab of the app is closed and the page is opened again.

### Preview deploy (host still to be decided)

Any static HTTPS host works, because `base: './'` makes every URL relative. Nothing is deployed by
the tools in this repo; these are manual steps.

- **Option A — Cloudflare Pages (no git needed).** Run `npm run build`. Then, in the Cloudflare
  dashboard, go to Workers & Pages › Create › Pages › *Upload assets*, and drag in the `dist/` folder.
  Alternatively, run `npx wrangler pages deploy dist` (it asks you to log in once). You get a
  `https://<project>.pages.dev` URL. Upload a new `dist/` to update it.
- **Option B — GitHub Pages.** Create a repository and publish `dist/` either from a `gh-pages` branch
  (push the contents of `dist/` to that branch and choose it in Settings › Pages) or with a GitHub
  Actions workflow that uploads `dist/` as the Pages artifact. The app is served under
  `https://<user>.github.io/<repo>/`, which works because all paths are relative.

### Install on the iPad (Home Screen)

1. Open the HTTPS preview URL in **Safari** while online.
2. Tap **Share** › **Thêm vào MH chính** (Add to Home Screen) › **Thêm**.
3. Open **Bé Học Chơi** from the Home Screen **once while online**, and wait until the yellow ▶
   (Chơi) button appears: the whole app is now stored on the iPad.
4. From then on it works in airplane mode.

**Supported devices:** a regular iPad, iPad Air or iPad Pro, landscape, **installed to the Home
Screen**. The iPad mini and Safari tabs are not supported: the visible area must have an aspect ratio of
at most 1.46 for `Tokens.safeRect` to fit, and the iPad mini screen, or Safari's toolbars, are narrower
than that.

## Tip for parents

- Turn on **Guided Access** (Settings › Accessibility › Guided Access, then triple-click the top
  button inside the app) so the child cannot leave the app.
- Turn off the multitasking gestures: Settings › Multitasking & Gestures (on iPadOS 16: Settings ›
  Home Screen & Multitasking › **Cử chỉ** / Gestures) and switch the gestures off.
- If iOS ever clears the website data (for example after a long time without use, or when storage is
  low), open the app again **while online**: it downloads itself again, and every game starts again at its easiest level.

## Device checklist (Story 1.11)

Run this on the real iPad with the app installed from the HTTPS preview before the Epic 1 retro.
Fill in *Kết quả* (`đạt` / `không đạt` / `không đo được`) and *Ngày/máy* (date, iPad model, iPadOS
version). Every failed item is added to `_bmad-output/implementation-artifacts/deferred-work.md` as a
fix before the epic closes.

| # | Item | Cách làm | Kỳ vọng | Kết quả | Ngày/máy |
|---|---|---|---|---|---|
| 1 | Real-finger taps | Tap ▶, each awake/asleep station, the kart, the Speaker and (in Tiệm kem) Home with a fingertip, as a child would. | Each tap reacts within ~100 ms; nothing needs a second tap. | chưa chạy | |
| 2 | Palm and multi-touch | Hold the iPad as a child does and let a palm rest on the island, then tap a station with one finger; also put the palm down *after* a finger is already on a station. Measure with Safari Web Inspector (Mac › Safari › Develop › the iPad › the app): paste the snippet below, touch with a fingertip, then with a palm. | A palm landing after the finger never cancels it (first finger wins). Note whether a palm resting *first* blocks the child in normal holding. Record fingertip vs palm `radiusX/Y`, or `không đo được` without a Mac (first-finger-wins stays, UX-DR65). | chưa chạy | |
| 3 | Safari audio unlock and the silent switch | Turn the side silent switch (or Control Center's mute) **on**, open the app and tap ▶. | The pop, the music and the greeting play although the iPad is muted (`navigator.audioSession.type = 'playback'`). | chưa chạy | |
| 4 | Return from background | On the Map, press Home (or switch apps), wait 10 s, come back. Repeat during a voice line and after a phone call / Siri if possible. | Voice and music stopped while away; on return the music resumes, or the dimmed ▶ appears and one tap resumes exactly where play stopped. The overlay never traps the child. | chưa chạy | |
| 5 | Home-Screen install | Install per *Install on the iPad*, open from the icon. In Web Inspector run `[innerWidth, innerHeight]`. | Fullscreen with no Safari bars and a transparent status bar; the icon is the yellow ▶ on sky; no part of the play area is cropped (the Speaker is fully visible at the top-right, the stations are not cut). Record the device model and `innerWidth × innerHeight` (ratio ≤ 1.46). | chưa chạy | |
| 6 | Airplane-mode run | After one online open, turn on airplane mode, close the app from the app switcher and open it again. Play Start → Map → Tiệm kem one full round. | Everything works with voice and music; no missing image or sound. | chưa chạy | |
| 7 | Portrait CSS rotation and `toDesign` | Hold the iPad in portrait (the stage turns 90°). Tap the ice-cream station; tap the Speaker where it is drawn. | The station reacts exactly as in landscape and the Speaker responds where it is drawn (taps land on the right design coordinates). | chưa chạy | |
| 8 | Thumb in the edge strip plus a child's tap (spec-1-6) | Rest a thumb on the screen edge (within about 2 cm of the bezel) and tap a station with another finger. | The station reacts. The thumb alone triggers nothing. | chưa chạy | |
| 9 | Speaker while a finger rests on the Map (spec-1-6) | Keep one finger on the island, then tap the Speaker with another; then tap a station with the second finger. | The last line replays; the station tap does nothing. | chưa chạy | |
| 10 | SW update | With the app open on the Map, deploy a visibly changed build (e.g. a different greeting or icon) to the same URL. Keep playing for a minute, then close the app from the app switcher and open it again (twice if needed: the first open fetches the new worker). | No reload or interruption mid-session; the change appears only after a cold open from the app switcher. | chưa chạy | |

**Palm-size snippet** for item 2 (paste into the Web Inspector console, then touch the screen):

```js
addEventListener('touchstart', (e) => {
  for (const t of e.changedTouches) console.log('touch', t.identifier, 'radiusX', t.radiusX, 'radiusY', t.radiusY, 'force', t.force);
}, { passive: true, capture: true });
```
