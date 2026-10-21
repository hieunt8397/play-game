/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { designTokens } from './src/core/tokens.generated.ts';
import { postProcessDist } from './tools/pwa/post-process.ts';

/** Every file type the app fetches at runtime: all of it is precached (AR33). */
const RUNTIME_GLOB = '**/*.{js,css,html,png,webp,json,m4a,woff2,svg,ico,webmanifest}';
/** Per-file cap (NFR / AR34): 8 MiB. tools/lint/check-precache.ts enforces the same cap on dist/. */
const MAX_PRECACHE_FILE_BYTES = 8388608;

/**
 * Removes the SKIP_WAITING listener and Workbox doc links from dist/sw.js + workbox-*.js
 * (tools/pwa/post-process.ts). Both closeBundle hooks are sequential and this one is ordered 'post',
 * so it runs after VitePWA's handler has written the worker. Like VitePWA's handler it does nothing
 * after a build error or in an SSR build (no worker is written then).
 */
function pwaPostProcess(): Plugin {
    let outDir = 'dist';
    let ssr = false;
    return {
        name: 'bhc:pwa-post-process',
        apply: 'build',
        enforce: 'post',
        configResolved(config) {
            outDir = resolve(config.root, config.build.outDir);
            ssr = Boolean(config.build.ssr);
        },
        closeBundle: {
            order: 'post',
            sequential: true,
            handler(error?: Error) {
                if (error || ssr) return;
                postProcessDist(outDir);
            }
        }
    };
}

// Single Vite config (AD-12 / Stack). No object `manualChunks`, no terser (Oxc minifier default).
// Dev and build make no outbound network calls (the starter's log.js telemetry is removed).
export default defineConfig({
    base: './',
    server: {
        host: 'localhost',
        port: 8080
    },
    build: {
        // Phaser alone is ~1.2 MB minified; one chunk is expected and precached offline.
        chunkSizeWarningLimit: 2048
    },
    plugins: [
        // Story 1.11 (AR33/AR34): offline PWA. The app registers ./sw.js itself (core/sw.ts), so no
        // injected script and no `virtual:pwa-register` (no updateSW, no reload). `registerType:
        // 'prompt'` + `skipWaiting: false`: a new worker waits and applies at the next cold open.
        // devOptions stay disabled: `npm run dev` has no service worker.
        VitePWA({
            strategies: 'generateSW',
            registerType: 'prompt',
            injectRegister: false,
            manifest: {
                id: './',
                name: 'Bé Học Chơi',
                short_name: 'Bé Học Chơi',
                lang: 'vi',
                start_url: './',
                scope: './',
                display: 'standalone',
                orientation: 'landscape',
                background_color: designTokens.colors.sky.css,
                theme_color: designTokens.colors.sky.css,
                icons: [
                    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
                ]
            },
            workbox: {
                globPatterns: [RUNTIME_GLOB],
                maximumFileSizeToCacheInBytes: MAX_PRECACHE_FILE_BYTES,
                skipWaiting: false,
                clientsClaim: true,
                cleanupOutdatedCaches: true,
                navigateFallback: 'index.html',
                runtimeCaching: []
            },
            devOptions: {
                enabled: false
            }
        }),
        pwaPostProcess()
    ],
    test: {
        environment: 'node',
        include: ['src/core/**/*.test.ts', 'src/content/**/*.test.ts', 'src/games/**/*.test.ts', 'tools/**/*.test.ts'],
        testTimeout: 20000
    }
});
