# Review — Tech Currency & Reality Check

- **Target:** `../ARCHITECTURE-SPINE.md` (draft, 2026-10-08)
- **Reviewer lens:** Is every committed technology choice, version and API claim backed by research or a check against the real thing, rather than recalled from memory?
- **Date:** 2026-10-08
- **Method:** I queried live registries (npm, PyPI, nodejs.org dist index, download.blender.org) and the Edge TTS voice-list endpoint. I downloaded and grepped the Phaser 4.2.1 source tarball, fetched the live `phaserjs/template-vite-ts` repo files, and read the web docs for Vite 8 migration, vite-plugin-pwa and Workbox, plus sources on iOS self-signed certificates. I also checked which tools exist on the authoring machine.

## Verdict

**Pass with fixes.** Every pinned version in the spine is the current release, and every named technology still exists and fits. The parent's research notes in `.memlog.md` are accurate. Two rules, however, would fail on contact with reality:

- **AD-9 precaching.** With default settings, the offline precache leaves out every asset that is not JS, CSS or HTML.
- **LAN HTTPS for the service worker.** iPad Safari rejects the certificate that basic-ssl generates.

Smaller gaps: the "bump to Vite 8" note hides config breakage in the template, the TypeScript row is out of date, and the authoring machine is missing some prerequisite tools.

## 1. Versions: verified against live registries (2026-10-08)

| Spine claim | Live reality | Status |
| --- | --- | --- |
| Phaser 4.2.1 | npm `latest` = 4.2.1 (published 2026-07-09); 4.0.0 on 2026-04-10, 4.1.0, 4.2.0 | OK |
| Vite 8.3.3 | npm `latest` = 8.3.3; engines `node ^20.19 \|\| >=22.12` | OK |
| vite-plugin-pwa 2.0.0 | `latest` = 2.0.0, published **2026-10-03** (5 days old); peer `vite ^3…^8`, `workbox-build ^7.4.1`. Its only release-note breaking change is the `@vite-pwa/assets-generator ^2` peer | OK (very new; see L4) |
| Workbox 7.4.1 | `workbox-build` latest = 7.4.1 | OK |
| free-tex-packer-core 0.3.9 | latest = 0.3.9 (2026-07-24), MIT, depends on `sharp ^0.35`, `maxrects-packer` | OK |
| edge-tts 7.2.8 | PyPI latest = 7.2.8 (2026-03-22), `requires_python >=3.7`, GPL-3.0 | OK |
| voice `vi-VN-HoaiMyNeural` | The live Edge voice list returns `vi-VN-HoaiMyNeural` and `vi-VN-NamMinhNeural` | OK |
| Blender 5.2.2 LTS | download.blender.org has 5.2.0, 5.2.1 and 5.2.2. The local install reports `Blender 5.2.2 LTS` (build 2026-09-15) | OK |
| TypeScript "5.x (template pins ~5.7; latest 5.x)" | npm `latest` = **7.0.2** (native compiler, 2026-07-08); 6.0.3 (2026-04-16); last 5.x = 5.9.3 (2025-09-30) | **Stale; see M2** |
| @vitejs/plugin-basic-ssl "latest" | 2.3.0, peer `vite ^6 \|\| ^7 \|\| ^8` | OK as a package; **does not work for iPad SW, see H2** |
| Vitest "latest" | 5.0.3, peer `vite ^6.4 \|\| ^7 \|\| ^8`, engines `node ^22.12 \|\| ^24 \|\| >=26` | OK |
| Node "current LTS" | LTS = **v24.x "Krypton"** (24.21.0, 2026-09-07); v26 is still "Current" (26.11.1, not LTS). The local machine has 24.20.0 | OK; pin 24 explicitly |
| Starter `npm create @phaserjs/game@latest` | `@phaserjs/create-game` 1.3.2. The live `template-vite-ts` is 1.4.0 and pins `phaser 4.0.0`, `vite ^6.3.1`, `typescript ~5.7.2`, `terser` | Matches `.memlog.md`; see M1 and L2 |

## 2. API claims in the Rules: checked against Phaser 4.2.1 source

| Claim | Evidence | Status |
| --- | --- | --- |
| AD-4 `input.activePointers` | `src/core/Config.js:281` reads `GetValue(config, 'input.activePointers', 1)`; `InputPlugin#addPointer(n)` is the runtime alternative | OK. This is a **Game Config key** (default 1). It is not a runtime property, which matches the `main.ts` note |
| AD-7 `Scale.FIT` + `autoCenter` | `ScaleModes.FIT = 3` and `Center.CENTER_BOTH = 1` both exist | OK. The letterbox colour comes from page/parent CSS, not from a Phaser config key, so `Tokens` must reach `style.css` or `body` |
| AD-7 JSON-hash atlases | `AtlasJSONFile.js:132` says "JSON Hash or JSON Array format"; `load.atlas` accepts it, and free-tex-packer has a JSON-hash exporter | OK |
| AD-3 Web Audio unlock | `WebAudioSoundManager` **already** unlocks on body `touchstart/touchend/mousedown/mouseup/keydown`, emits `Sound.Events.UNLOCKED`, and on focus resumes when `state === 'suspended' \|\| 'interrupted'` ("Resume interrupted audio on iOS") | Works, but overlaps with Phaser; see L1 |
| `.m4a` / AAC in Phaser | `AudioFile.getAudioURL` picks a URL only if `game.device.audio[ext]` is true; `device/Audio.js` sets `m4a = canPlayType('audio/x-m4a')`. Safari supports AAC in `decodeAudioData` | OK on iPad Safari. If the dev browser reports `m4a=false`, the loader returns `null` and the file is **silently skipped**, so check `game.device.audio.m4a` in the dev browser |
| Phaser 4 bundle vs precache limit | `dist/phaser.min.js` is 1.38 MB, which is under the 2 MiB Workbox default | OK (relevant to H1) |

## 3. Findings

### H1 (High): AD-9 "precache the whole build" will not happen with vite-plugin-pwa defaults

- vite-plugin-pwa docs: "By default, `globPatterns` will be `**/*.{js,css,html}`". As a result, atlases (`.png` + `.json`), `.m4a` audio, self-hosted fonts and the manifest icons are **not precached**.
- Workbox `maximumFileSizeToCacheInBytes` defaults to **2,097,152 (2 MiB)**. Files above it are dropped from the manifest with only a build warning. That will catch 2048-px atlas sheets, music tracks and possibly a big vendor chunk.
- The result: the app looks fine online, but offline the child gets silence and missing art. This breaks NFR7, and the "missing asset → skip silently" convention hides the failure.
- **Fix:** Add to AD-9:
  - `workbox.globPatterns: ['**/*.{js,css,html,png,webp,json,m4a,woff2,svg,ico,webmanifest}']`.
  - An explicit `maximumFileSizeToCacheInBytes` (for example 8 MiB), plus a cap on atlas page size (for example `maxrects` ≤ 2048² per page).
  - A CI/lint check that every file under `public/assets/**` appears in the generated precache manifest. Fail the build otherwise.
  - Note that the iPad's precache install will download the full payload on first launch, so the Boot loading kart must wait for the SW `installed`/`activated` state.

### H2 (High): `@vitejs/plugin-basic-ssl` will not let the iPad register a service worker over LAN

- basic-ssl generates an untrusted self-signed leaf certificate. iOS Safari "will outright reject untrusted self-signed certs, instead of showing a security warning" (Kurento docs). Service-worker script fetches fail on certificate errors with a SecurityError. So the spine's stated reason for the plugin ("service worker needs it") is not met. Page loading itself may also fail.
- **Fix:** Change the dev row to one of these options:
  - **(a)** mkcert. Create a local root CA (`mkcert -install`), use a cert for the LAN IP/hostname (`vite-plugin-mkcert`, or `server.https` with the mkcert files), install `rootCA.pem` on the iPad (AirDrop, Mail or Safari only), then turn on *Settings › General › About › Certificate Trust Settings › full trust*.
  - **(b)** Test offline/SW/Home-Screen behaviour only on a real HTTPS preview deploy (Cloudflare Pages preview, or a `cloudflared` tunnel), and keep plain `vite --host` for touch/audio iteration.

  Either way, record the iPad trust step in the README.

### M1 (Medium): "Bump to Vite 8" breaks the starter's config as shipped

- `template-vite-ts` 1.4.0 ships **two** configs (`vite/config.dev.mjs`, `vite/config.prod.mjs`). Both use `build.rollupOptions.output.manualChunks: { phaser: ['phaser'] }`, and prod also uses `minify: 'terser'`. Vite 8 migration guide: "`build.rollupOptions` renamed to `build.rolldownOptions`" (deprecated alias), and "The object form `output.manualChunks` option is not supported anymore." Minification now defaults to Oxc.
- The PWA and basic-ssl/mkcert plugins must also be added to both files, or the dev SW and prod SW will differ.
- **Fix:** Add a scaffold step to the spine. Merge into one `vite.config.ts` with `mode` branches, remove the object `manualChunks` (or use Rolldown `codeSplitting` groups), drop `terser` and use the Oxc default, keep `base: './'` (correct for a GitHub Pages subpath), and add `VitePWA` + the HTTPS plugin.

### M2 (Medium): The TypeScript row is stale, and "latest at scaffold" would pull TS 7

- npm `latest` is **7.0.2** (the native/Go compiler); 6.0.3 is the last 6.x and 5.9.3 the last 5.x. `typescript-eslint` 8.71.1 declares peer `typescript >=4.8.4 <6.1.0`, so TS 7 would break the AD-8 token lint if it is written as an ESLint rule.
- **Fix:** Pin exactly. Either `typescript ~6.0.3` (the template tsconfig, with `bundler` resolution and `ES2020` target, already avoids the options TS 6 deprecates) or `~5.9.3`. Revisit TS 7 when typescript-eslint supports it. Vite transpiles with Oxc, so the TS version only affects `tsc --noEmit` and lint.

### M3 (Medium): The tool pipeline's prerequisites are absent on the authoring machine

- I checked this machine on 2026-10-08:
  - **No Python** (only the Windows Store alias). edge-tts needs Python ≥ 3.7.
  - **No ffmpeg** on PATH. The `loudnorm` two-pass step needs it.
  - Blender 5.2.2 LTS is installed at `C:/Program Files/Blender Foundation/Blender 5.2/` but is **not on PATH**.
- **Fix:** Add a "Tool prerequisites" line to the Stack section: Python 3.12+ via `winget install Python.Python.3.12`, then `pipx install edge-tts==7.2.8`; `winget install Gyan.FFmpeg`; and a `BLENDER_BIN` env var used by `tools/render`. Optionally add a `tools/doctor` script that verifies all three.

### L1 (Low): AD-3 "AudioDirector owns the unlock" duplicates Phaser's built-in unlock

- Phaser 4.2.1 already unlocks the AudioContext on body touch/mouse events and resumes `suspended`/`interrupted` contexts on focus. Running a second `resume()` path in the AudioDirector is harmless, but two owners make the behaviour hard to reason about.
- **Fix:** Reword AD-3. The AudioDirector *wraps* Phaser's unlock: it reads `sound.locked`, listens for `Sound.Events.UNLOCKED`, and adds only the `visibilitychange` re-resume as a safety net. Scenes never touch either path.

### L2 (Low): The starter command is interactive and the template phones home

- `npm create @phaserjs/game@latest` is a prompts-driven CLI with no documented non-interactive flags, so an AI build agent cannot drive it reliably.
- The template's default `dev`/`build` scripts run `log.js`, which makes an HTTPS GET to `gryzor.co` with the Phaser version and project name. This is build-time only, not in the shipped app, but it conflicts with the spirit of NFR8.
- **Fix:** Use `npx degit phaserjs/template-vite-ts app` as the deterministic equivalent (it is the same template). Delete `log.js` and use the `*-nolog` script bodies.

### L3 (Low): The Vite 8 browser baseline is Safari 16.4

- Vite 8's default `build.target` is Baseline Widely Available as of 2026-01-01 (Safari 16.4).
- **Fix:** State a minimum iPadOS version (≥ 16.4; ideally 17+ for `navigator.storage.persist()` and the Home Screen storage behaviour) in the README and on the device test checklist.

### L4 (Low): vite-plugin-pwa 2.0.0 is five days old

- It is a major version, but its only documented breaking change is the `@vite-pwa/assets-generator ^2` peer. The risk is low.
- **Fix:** Pin `2.0.0` exactly, not `^2`. If the Vite 8 build misbehaves, `1.3.0` is a known fallback that also accepts `vite ^8`.

### Also checked, no change needed

- Node: today's LTS is 24.x; Node 26 is not yet LTS. Pin `"engines": { "node": ">=24 <25" }` plus `.nvmrc` so "current LTS" does not drift mid-project.
- edge-tts: still works today (the voice list is live). The spine already records that it is unofficial and gives an Azure/Google fallback, which is the right mitigation.
- Deferred items (`navigator.audioSession`, manifest orientation, rotate overlay) are correctly marked "test on device" rather than asserted.

## 4. Sources

- npm registry: `registry.npmjs.org/{phaser,vite,vite-plugin-pwa,workbox-build,free-tex-packer-core,typescript,vitest,@vitejs/plugin-basic-ssl,@phaserjs/create-game,typescript-eslint}`
- PyPI: https://pypi.org/pypi/edge-tts/json
- Node releases: https://nodejs.org/dist/index.json
- Blender: https://download.blender.org/release/Blender5.2/
- Phaser 4.2.1 source tarball: `src/core/Config.js`, `src/input/InputManager.js`, `src/scale/const/*`, `src/loader/filetypes/AtlasJSONFile.js`, `src/loader/filetypes/AudioFile.js`, `src/device/Audio.js`, `src/sound/webaudio/WebAudioSoundManager.js`
- Phaser v3→v4 migration guide: https://unpkg.com/phaser@4.2.1/changelog/v4/4.0/MIGRATION-GUIDE.md
- Template: https://github.com/phaserjs/template-vite-ts (package.json, vite/config.*.mjs, log.js, src/game/main.ts)
- create-game: https://github.com/phaserjs/create-game
- Vite 8 migration: https://vite.dev/guide/migration
- vite-plugin-pwa static assets: https://vite-pwa-org.netlify.app/guide/static-assets ; releases: https://github.com/vite-pwa/vite-plugin-pwa/releases
- Workbox `maximumFileSizeToCacheInBytes` default 2097152: https://developer.chrome.com/docs/workbox/modules/workbox-webpack-plugin
- iOS self-signed certificates and mkcert: https://doc-kurento.readthedocs.io/en/latest/knowledge/selfsigned_certs.html ; https://mswjs.io/docs/recipes/using-local-https
- Edge TTS voice list: `speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list`
