// Post-processing of the Workbox output that vite-plugin-pwa (generateSW) writes to dist/ (Story 1.11).
// Run by the `bhc:pwa-post-process` plugin in vite.config.ts after VitePWA's closeBundle.
//
// 1. Workbox's sw-template always emits a `skipWaiting()`: with `skipWaiting: false` it becomes a
//    `message` listener that skips waiting on `{type:'SKIP_WAITING'}` (what `updateSW()` posts). This
//    app never applies an update mid-session (no updateSW, no reload), so the listener is removed and
//    sw.js contains no `skipWaiting()` call at all; a waiting worker applies at the next cold open.
// 2. The Workbox runtime (workbox-*.js) carries documentation links inside console messages (e.g.
//    "Learn more at https://bit.ly/wb-precache"). They are never fetched, but the precache check bans
//    every absolute URL in the shipped worker files, so those doc links are replaced by plain text.
//    Any other absolute URL is left alone and fails `npm run precache:check`.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** `self.addEventListener("message", e => { … "SKIP_WAITING" … self.skipWaiting() … })` plus its separator. */
const SKIP_WAITING_LISTENER =
  /self\.addEventListener\(\s*["']message["']\s*,\s*(?:\(\s*\w*\s*\)|\w+)\s*=>\s*\{[^{}]*["']SKIP_WAITING["'][^{}]*\}\s*\)\s*[,;]?/g;

/** Documentation links Workbox prints in its console messages. */
const WORKBOX_DOC_URL = /https?:\/\/(?:bit\.ly|goo\.gl|developer\.chrome\.com|developers\.google\.com)\/[^\s"'`)]*/g;
export const DOC_URL_REPLACEMENT = 'the Workbox documentation';

/** Removes the SKIP_WAITING message listener; throws when a `skipWaiting(` call would remain. */
export function stripSkipWaitingListener(swJs: string): string {
  const out = swJs.replace(SKIP_WAITING_LISTENER, '');
  if (out.includes('skipWaiting(')) {
    throw new Error('pwa post-process: sw.js still calls skipWaiting() — the Workbox template changed; update tools/pwa/post-process.ts');
  }
  return out;
}

/** Replaces Workbox documentation links in console messages with plain text. */
export function stripWorkboxDocUrls(js: string): string {
  return js.replace(WORKBOX_DOC_URL, DOC_URL_REPLACEMENT);
}

/** Applies both steps to `<distDir>/sw.js` and `<distDir>/workbox-*.js` in place. */
export function postProcessDist(distDir: string): void {
  const swPath = join(distDir, 'sw.js');
  writeFileSync(swPath, stripWorkboxDocUrls(stripSkipWaitingListener(readFileSync(swPath, 'utf8'))));
  for (const name of readdirSync(distDir)) {
    if (!/^workbox-[\w-]+\.js$/.test(name)) continue;
    const file = join(distDir, name);
    writeFileSync(file, stripWorkboxDocUrls(readFileSync(file, 'utf8')));
  }
}
