---
title: 'Story 1.11 — Chạy offline và thử trên iPad'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: 'NO_VCS'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-2-man-mo-dau-nut-choi-mo-khoa-am-thanh.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-be-nghe-giong-doc-tieng-viet.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-pipeline-hinh-render-blender-atlas-layout.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-6-nut-nha-va-loa-chong-cham-nham.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The app runs only while online. Nothing installs it to the iPad Home Screen or precaches its assets, and no gate stops a shipped file from silently missing the cache. Boot's readiness gate still waits on a bare `serviceWorker.ready`, which can hang forever (spec-1-2 deferred items). There is also no documented way to put a build on an HTTPS host and test it on the child's real iPad.

**Approach:**
- Add `vite-plugin-pwa` (generateSW) with the AR33/AR34 config, a relative manifest and generated icons.
- The app registers the service worker itself and never applies an update mid-session.
- Boot's gate waits for the first precache with a bounded wait. Boot's load loop moves into a testable core controller.
- `npm run check` builds and then runs a precache/no-network check on `dist/`.
- The README gets the preview-deploy steps (GitHub Pages / Cloudflare Pages), Home-Screen install, parent tips and the full iPad device checklist with result cells. Nothing is deployed.

## Boundaries & Constraints

**Always:**
- **PWA config** in `vite.config.ts`:
  - `VitePWA({ strategies: 'generateSW', registerType: 'prompt', injectRegister: false, manifest: {...}, workbox: { globPatterns: ['**/*.{js,css,html,png,webp,json,m4a,woff2,svg,ico,webmanifest}'], maximumFileSizeToCacheInBytes: 8388608, skipWaiting: false, clientsClaim: true, cleanupOutdatedCaches: true, navigateFallback: 'index.html', runtimeCaching: [] } })`.
  - `devOptions` stays disabled, so `npm run dev` has no SW.
- **Manifest:**
  - `name` and `short_name` are "Bé Học Chơi", `lang: 'vi'`, `id`, `start_url` and `scope` are `'./'`, `display: 'standalone'`, `orientation: 'landscape'`.
  - `background_color`/`theme_color` come from `designTokens.colors.sky.css`, imported from `src/core/tokens.generated.ts`.
  - Icons: `icons/icon-192.png`, `icons/icon-512.png`, and `icons/icon-maskable-512.png` (`purpose: 'maskable'`). All paths are relative.
- **index.html** gains `apple-touch-icon` (`icons/apple-touch-icon.png`, 180²), `apple-mobile-web-app-capable=yes`, `apple-mobile-web-app-status-bar-style=black-translucent` and `theme-color`. No absolute or external URLs.
- **Registration:**
  - `core/sw.ts › registerServiceWorker(container, isDev)` registers `'./sw.js'` with `{ scope: './' }`. When DEV or unsupported it returns `undefined`. A rejection is warned and becomes `undefined`.
  - It stores the promise for `swRegistration()`, and `main.ts` calls it once before `new Game`.
  - Nothing ever calls `update()`, `skipWaiting` or `location.reload`, and nothing listens for `controllerchange`. A waiting worker applies at the next cold open.
- **Readiness gate** (`waitForReady`):
  - A missing registration or `registration.active` (already precached, or an update case) skips the SW step.
  - Otherwise it races `container.ready` against an injected `sleep(Timing.swPrecacheTimeoutMs)`. On timeout it gives one `console.warn` and continues; it never rejects for the SW. The font step is unchanged.
- **Audio session:** `AudioDirector.attach` sets `navigator.audioSession.type = 'playback'` when the property exists. It is injected, wrapped in try/catch and warns once on failure, so the silent switch does not mute the app.
- **Precache check** (`tools/lint/check-precache.ts`; pure rules in `checkPrecache()`). It fails with a message naming the path when:
  - a file under `public/` with a runtime extension (the glob list) is missing from the `dist/sw.js` precache manifest;
  - a file under `public/` has an extension that is neither a runtime type nor in the metadata allowlist (`.hash`, `.txt`);
  - any file in `dist/` is larger than 8 388 608 bytes;
  - `dist/index.html`, `dist/manifest.webmanifest`, `dist/sw.js` or `dist/workbox-*.js` contains `http://` or `https://`, or `sw.js` contains `importScripts(` of a non-relative URL;
  - `dist/sw.js` is missing ("run vite build").
- **Gate order:** `check` = existing steps `&& npm run build && npm run precache:check`.

**Ask First:**
- `vite-plugin-pwa@2.0.0` declares a peer range that excludes Vite 8.3.3 → HALT. Do not use `--force`/`--legacy-peer-deps` and do not swap versions.

**Never:**
- No deploy, upload, `wrangler`/`gh-pages` run or git command. Hosts appear only in README text.
- No update UI, no `updateSW()`, no reload.
- No runtime network: no CDN, analytics, remote fonts, remote TTS or runtime caching rules.
- No in-app text for Guided Access or install tips.
- No change to `Tokens.supportedAspect`/`safeRect` (human decision: regular iPad / Air / Pro, ratio ≤ 1.46).

**Decisions (auto-run defaults):**
- **`display: 'standalone'`:** iPadOS honours standalone, and `black-translucent` + `viewport-fit=cover` make it edge-to-edge. Without black-translucent, the ~24pt status bar narrows the iPad Air viewport to about 1180×796 (≈1.48 > 1.46) and safeRect would crop. This picks up the spec-1-1 aspect deferred item.
- **Own registration, not `virtual:pwa-register`:** it avoids a getRegistration race with Boot, keeps the unused `updateSW` out of the bundle and settles spec-1-2's "getRegistration rejects" item.
- **Soft precache timeout, `swPrecacheTimeoutMs: 20000`:** the child is never blocked. A failed or redundant install (ready never resolves) degrades to an online session, and offline works from the next successful open. This settles spec-1-2's "ready hangs" item. The README tells the parent to wait for the Chơi button on the first online open.
- **Icons:** `tools/pwa/make-icons.ts` writes deterministic PNGs with a tiny zlib encoder: sky background, a yellow `designTokens.colors.buttonPlay` circle and a white play triangle. The maskable icon keeps its content in the 80 % safe zone. The icons are committed and replaceable later.
- **Boot extraction (spec-1-2 deferred, medium):** `createBootLoader(adapter)` in `core/boot-load.ts` owns `dispatch`/`attempt`/`gate`. `Boot.ts` becomes a thin Phaser adapter.
- **Checklist results:** the README table ships with every result set to "chưa chạy". Running it on the real iPad is a human step before the epic closes, and a failed item is appended to `deferred-work.md` as a fix.
- **Palm data:** `Touch.radiusX/Y` is measured with Safari Web Inspector (Mac) using a README console snippet. With no Mac, record "không đo được", which keeps first-finger-wins (UX-DR65).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dev | `isDev` | no register; gate skips SW | — |
| Unsupported | `container` undefined | `undefined`; gate skips SW | — |
| Register rejects | SecurityError | `undefined` | one `console.warn` |
| First install | reg without `active`, ready resolves | gate waits for ready, then the font | — |
| Already active | `reg.active` set (update waiting) | no wait | — |
| Install stuck | ready never resolves | after `swPrecacheTimeoutMs`, continue to font | one `console.warn` |
| Loader error → online | adapter `loadAll` fails | waiting, kart slows; `online` → retry; complete → overlay launched then Start, once | warn per file |
| audioSession | present / absent / setter throws | `'playback'` / no-op / continue | warn on throw |
| Precache ok | every runtime file in manifest | exit 0, prints counts | — |
| Missing / big / unknown / external | file outside the manifest, > 8 MiB, `.mp3` not in either list, `https://` in sw.js | exit 1 naming the path | message |

</intent-contract>

## Code Map

- `app/vite.config.ts` -- single config (`base: './'`, Vitest node include). Add `VitePWA`.
- `app/index.html` -- viewport already set; add the apple and theme meta plus the touch-icon link.
- `app/src/main.ts` -- add `registerServiceWorker(...)` before `new Game`, and pass `navigator` to `audio.attach`.
- `app/src/core/boot-load.ts` (+ test) -- `waitForReady`, `ServiceWorkerLike`, `nextLoadState`, `bootAudio`. Replace `sw: ServiceWorkerLike` with `registration` + `ready` + `sleep`, and add `createBootLoader`.
- `app/src/scenes/Boot.ts` -- `dispatch`/`attempt`/`gate` move to core. It keeps the loading-strip, the timers and `this.load` calls as adapter callbacks. Story 1.4 (planned) adds atlas/bg loads to the same list; keep `bootAudio()` as one input of the adapter's load list.
- `app/src/core/audio-director.ts` (+ test) -- `attach(sound, doc)` at line 193; add an optional `nav` for `audioSession`.
- `app/src/core/timing.ts` -- add `swPrecacheTimeoutMs`.
- `app/tools/lint/validate-content.ts` -- pattern for `run(dir)` + `main` + temp-dir tests.
- `app/public/` -- `favicon.png`; `assets/{audio,fonts}` (with `.hash` and `OFL.txt` metadata). Story 1.4 (planned) adds `assets/atlases/*.{png,json}` and `assets/bg/*.png`.
- `app/README.md` -- the "Run on the PC…" section already mentions SW on localhost. "Tip for parents" exists. Spec-1-6 (planned) adds "Device checklist (Story 1.11)" with 3 checks; extend that section and keep those 3.

## Tasks & Acceptance

**Execution:**
- [x] `app/package.json` -- add devDependency `vite-plugin-pwa` `2.0.0` exact (Workbox 7.4.1 comes with it), and the scripts `pwa:icons` and `precache:check` (`preview` already exists). Add the build steps to `check` -- AR33/AR42.
- [x] `app/tools/pwa/make-icons.ts` (+ test) -- `encodePng(w,h,rgba)` plus the icon painter. `main` writes `public/icons/*.png`. The test checks the PNG signature, the IHDR size and identical bytes across two runs -- manifest icons with no network.
- [x] `app/public/icons/*.png` -- generate with `npm run pwa:icons` and commit.
- [x] `app/vite.config.ts` -- the PWA config and manifest from Always -- AR33/AR34.
- [x] `app/index.html` -- the meta and link tags -- standalone full-bleed and the iOS icon.
- [x] `app/src/core/sw.ts` (+ `sw.test.ts`) -- `registerServiceWorker`, `swRegistration`, `SW_URL` -- the matrix rows Dev, Unsupported and Register rejects.
- [x] `app/src/core/timing.ts` -- `swPrecacheTimeoutMs: 20000` with a comment that this is technical, not an EXPERIENCE value.
- [x] `app/src/core/boot-load.ts` (+ test) -- the new gate deps, and `createBootLoader({ missing(), loadAll(list, done(failed)), gate(), setTimeScale(s), onReady() })` with `dispatch(event)` and `start()` -- the gate rows and the loader row.
- [x] `app/src/scenes/Boot.ts` -- adapter over `createBootLoader`. `sleep` uses `this.time.delayedCall` -- the deferred extraction.
- [x] `app/src/core/audio-director.ts` (+ test) -- `audioSession` -- the silent switch.
- [x] `app/src/main.ts` -- wiring.
- [x] `app/tools/lint/check-precache.ts` (+ test) -- `checkPrecache({ publicFiles, distFiles, manifestUrls, textFiles })`, where `parseManifestUrls(swJs)` collects every `url:"…"`, and `run(appDir)`. The test covers each failing kind from Always, a good temp `dist/` + `public/` tree, and the regex on a real-format sample (`{url:"assets/x.m4a",revision:"…"}`) -- AR36.
- [x] `app/README.md`:
  - Commands table: `check` now builds and runs the precache check; add `pwa:icons` and `preview`.
  - New "Offline, install and preview deploy (Story 1.11)" section:
    - offline behaviour and update-on-cold-open;
    - test locally with `npm run build && npm run preview`;
    - deploy option A, Cloudflare Pages: direct upload of `dist/` in the dashboard, or `npx wrangler pages deploy dist`, no git needed;
    - deploy option B, GitHub Pages: a repo with Pages from a `gh-pages` branch or an Actions artifact, served under `/<repo>/`, which works because `base: './'`;
    - "host still to be decided".
  - Home-Screen steps (Safari › Share › Thêm vào MH chính; open once online and wait for Chơi).
  - Supported devices: regular iPad, Air and Pro installed to the Home Screen. iPad mini and Safari tabs are not supported because safeRect needs a ratio ≤ 1.46.
  - Tip for parents: Guided Access plus Settings › Multitasking › turn off gestures (iPadOS 16: "Cử chỉ"), and if iOS clears data, reopen online and the island starts empty.
  - Device checklist table (Item | Cách làm | Kỳ vọng | Kết quả | Ngày/máy):
    - real-finger taps;
    - palm and multi-touch, plus the `Touch.radiusX/Y` snippet;
    - Safari audio unlock and the silent switch;
    - return from background;
    - Home-Screen install (fullscreen, no bars, safeRect not cropped, device model + `innerWidth/innerHeight`);
    - airplane-mode run of Start → Map → Tiệm kem with voice and music;
    - portrait CSS rotation with correct `toDesign` (keep spec-1-6's 3 checks);
    - SW update: deploy a visibly changed build mid-session; no reload, and the change appears only after a cold open from the app switcher.

    Failed items go to `deferred-work.md`. -- AR47–AR50, NFR6/7/8/14.

**Acceptance Criteria:**
- Given `npm run build`, when `dist/` is inspected, then `sw.js`, `workbox-*.js` and `manifest.webmanifest` exist. The manifest has relative `start_url`/`scope`, standalone, landscape and 3 icons. `sw.js` precaches every runtime file under `public/` and `index.html`, and has no `skipWaiting()` call.
- Given a `public/assets/` file that is a runtime type but not precached, or a dist file > 8 MiB, when `npm run check` runs, then it exits 1 naming the file. Clean, it exits 0.
- Given `npm run build && npm run preview` in Chrome, when the page has been opened once and then reloaded with DevTools Network "Offline", then Start → Map → Tiệm kem plays with voice and music, every request is served by the ServiceWorker, and no request goes to a non-localhost origin.
- Given the preview open on Map, when a rebuilt `dist/` is served and the page polls an update, then the new worker shows "waiting" in DevTools › Application, the page does not reload, and the new build is active only after all tabs close and the page reopens.
- Given the README, when a parent reads it, then it has both deploy options, the Home-Screen steps, the tips and the device checklist with a result cell for every AC item.

## Spec Change Log

- **2026-10-09: Workbox output is post-processed (`tools/pwa/post-process.ts`, plugin `bhc:pwa-post-process` in vite.config.ts).** Workbox 7.4.1's sw-template always emits `skipWaiting()`: with `skipWaiting: false` it becomes a `message` listener for `SKIP_WAITING` (what `updateSW()` posts). The AC requires no `skipWaiting()` in sw.js, so the listener is stripped after VitePWA's closeBundle; the build throws if a `skipWaiting(` call would remain. The Workbox runtime `workbox-*.js` also contains a doc link in a console message (`https://bit.ly/wb-precache`), which the precache rule bans; known Workbox doc links (bit.ly, goo.gl, developer.chrome.com, developers.google.com) are replaced by plain text. Any other absolute URL still fails the check. The precache check also flags `skipWaiting(` in sw.js and requires `index.html` in the manifest (AC 1).
- **2026-10-09: `waitForReady` no longer takes `isDev`.** DEV is handled by `registerServiceWorker` resolving `undefined`, so the gate's deps are `registration`, `ready`, `sleep`, `fonts`, `fontFace`. `createBootLoader`'s `done` receives the failed file keys, and core warns once per key.
- **2026-10-09: `AudioDirector.attach(sound, doc, nav?)` takes `nav` as `object`.** The DOM lib does not type `navigator.audioSession`, so `setPlaybackSession` checks `'audioSession' in nav`.
- **2026-10-09: vite-plugin-pwa 2.0.0 was published on 2026-10-03** (6 days before install). The spec pins it exactly, and its peer range includes Vite ^8.0.0, so it was installed as specified; this is younger than the two-week rule used for sharp in spec-1-4.

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | verification-gap, blind | precache:check never verifies Vite-emitted `dist/assets/*.js/css` are precached | medium | `checkPrecache` only compares `public/` files + index.html; dropping `js` from the glob keeps the gate green while offline breaks | patch |
| 2 | verification-gap | Manifest icon `src` not checked against real files | low | Only a typo in vite.config would trigger it; the fix needs manifest parsing (added logic) | reject |
| 3 | verification-gap | `main.ts` wiring (registerServiceWorker, `navigator` to attach) untested | medium | No test runs main.ts; device checklist items 3/6 are the planned check | defer |
| 4 | verification-gap | Boot adapter `isCached`/`loadAll` kind dispatch untested | low | Phaser adapter; repo tests only node core; dispatch logic mirrors the pre-story code | defer |
| 5 | verification-gap, blind, edge | Every gate retry re-enters the 20 s SW wait (and warns again) | medium | `createBootLoader` reruns `adapter.gate()` → `waitForReady` per retry; with `reg.active` still null each retry waits `swPrecacheTimeoutMs` again | patch |
| 6 | verification-gap, blind, edge | Failed-load warning lost `file.src` | low | Old Boot warned with `file.src`; new path warns the key only, so device diagnostics lose the URL; direct fix | patch |
| 7 | blind | App bundles not scanned for `http(s)://` | false | Spec limits the scan to index.html/manifest/sw.js/workbox-*.js; README table states exactly that scope | reject |
| 8 | blind | RUNTIME_GLOB / max bytes duplicated between vite.config and check-precache | low | Drift fails loudly (public file flagged unknown or not precached); no silent harm named | reject |
| 9 | blind | Test "removes the unminified template form too" asserts a throw | low | `post-process.test.ts` name contradicts its expectation; direct rename | patch |
| 10 | blind | `createBootLoader` has no dispose; callbacks after Boot shutdown | false | Boot only shuts down through its own `onReady` → `scene.start('Start')`, after which no gate/load is pending | reject |
| 11 | blind | First open downloads assets twice / no total-size budget | low | Trade-off the spec chose (soft 20 s timeout degrades to online); no defect at a cited line | reject |
| 12 | blind, edge | OS junk files (`Thumbs.db`, `.DS_Store`) fail the gate | low | Gate names the path (the contract); unlikely under public/; fix adds a skip list | reject |
| 13 | blind | Worker sourcemaps keep the removed skipWaiting/doc links | false | `dist/` contains no `.map` files after build | reject |
| 14 | blind | audioSession 'playback' interrupts other audio | low | Intended effect of the spec's decision | reject |
| 15 | blind | `sw.ts` tests depend on order through module state | low | Each test calls `registerServiceWorker`, which overwrites the state first; no failing order shown | reject |
| 16 | blind | Device checklist lacks timeout / eviction / clean-build rows | low | Intent lists the checklist rows; additions are nice-to-have | reject |
| 17 | blind | make-icons IHDR comment says "adaptive filter set" but rows use filter 0 | low | Wrong comment; direct correction | patch |
| 18 | edge | `adapter.gate()` throwing synchronously hangs Boot | false | Boot's gate returns an async `waitForReady(...)`; its arguments (`swRegistration()`, `navigator.serviceWorker.ready` behind an `in` check) do not throw | reject |
| 19 | edge | `serviceWorker` in navigator but undefined | false | No supported browser exposes the key with an undefined value | reject |
| 20 | edge | post-process closeBundle throws ENOENT on a build error / SSR build, masking the real error | low | VitePWA's own closeBundle returns on `error` and skips SSR (vite-plugin-pwa dist/index.js:419-427); ours reads sw.js unconditionally | patch |
| 21 | edge | Scene clock pauses while hidden, so 20 s is not wall-clock | low | Pausing while the child is away is harmless; the wait resumes on return | reject |
| 22 | edge | Uppercase extension gives a misleading message | low | Message still names the path; unlikely | reject |
| 23 | edge | Symlinked dirs not followed by listFiles | low | No symlinks in public/; unlikely | reject |
| 24 | edge | `skipWaiting(` aliasing slips the gate | false | The substring check matches `e.skipWaiting(` and `self.skipWaiting(` alike | reject |
| 25 | edge | Atlas png+json both failing gives duplicate keys | low | Only duplicate warnings; unlikely; fix adds a branch | reject |

## Design Notes

**Why `reg.active` skips the wait:** precache runs in `install`. A worker becomes `active` only after its install succeeded, so an active worker means its precache is complete and the app can run offline. An update installing in the background must not delay Start, because the old cache still serves.

**Gate sketch:**
```ts
const reg = await deps.registration;
if (reg && !reg.active) {
  const r = await Promise.race([deps.ready.then(() => 'ok'), deps.sleep(Timing.swPrecacheTimeoutMs).then(() => 'timeout')]);
  if (r === 'timeout') console.warn('boot: precache not finished — continuing online');
}
```

## Verification

**Commands:**
- `cd app && npm install` -- expected: `vite-plugin-pwa@2.0.0` installs with no peer error.
- `cd app && npm run pwa:icons` (twice) -- expected: 4 PNGs, byte-identical on rerun.
- `cd app && npm run check` -- expected: exit 0. Output ends with the precache check summary (runtime file count, 0 problems).
- `cd app && npm run build && grep -c "skipWaiting()" dist/sw.js` -- expected: 0. `grep -E "https?://" dist/sw.js dist/index.html dist/manifest.webmanifest` -- expected: no match.

**Manual checks:**
- Run `npm run preview` with DevTools: test offline reload and the waiting-update behaviour per the ACs. In Lighthouse/Application › Manifest, the app is installable with no icon errors.
- The README checklist is complete. The real-iPad run is a human step before the Epic 1 retro.
