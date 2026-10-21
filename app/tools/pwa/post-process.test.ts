// tools/pwa/post-process.ts (Story 1.11): the SKIP_WAITING listener and Workbox doc links are removed
// from the generated worker files, on the real minified shapes.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOC_URL_REPLACEMENT, postProcessDist, stripSkipWaitingListener, stripWorkboxDocUrls } from './post-process.ts';

/** Shape vite-plugin-pwa 2.0.0 (Workbox 7.4.1, skipWaiting: false) writes, minified. */
const SW =
  'define(["./workbox-9c191d2f"],function(e){"use strict";self.addEventListener("message",e=>{e.data&&"SKIP_WAITING"===e.data.type&&self.skipWaiting()}),e.clientsClaim(),e.precacheAndRoute([{url:"index.html",revision:"1"}],{})});';

describe('stripSkipWaitingListener', () => {
  it('removes the minified listener and its separator', () => {
    expect(stripSkipWaitingListener(SW)).toBe(
      'define(["./workbox-9c191d2f"],function(e){"use strict";e.clientsClaim(),e.precacheAndRoute([{url:"index.html",revision:"1"}],{})});',
    );
  });

  it('fails loudly on the unminified template form', () => {
    const src = "self.addEventListener('message', (event) => {\n  if (event.data && event.data.type === 'SKIP_WAITING') {\n    self.skipWaiting();\n  }\n});\nclientsClaim();";
    // The template's nested `if { }` block is not matched by the minified-shape regex: the guard throws.
    expect(() => stripSkipWaitingListener(src)).toThrow(/still calls skipWaiting/);
  });

  it('throws when any skipWaiting( call would remain', () => {
    expect(() => stripSkipWaitingListener('self.skipWaiting();')).toThrow(/still calls skipWaiting/);
  });

  it('leaves a worker without the listener unchanged', () => {
    expect(stripSkipWaitingListener('e.clientsClaim()')).toBe('e.clientsClaim()');
  });
});

describe('stripWorkboxDocUrls', () => {
  it('replaces Workbox doc links in messages, leaves other URLs for the precache check', () => {
    const js = 'const t=`…NOT safe. Learn more at https://bit.ly/wb-precache`;fetch("https://cdn.example.com/a")';
    expect(stripWorkboxDocUrls(js)).toBe(`const t=\`…NOT safe. Learn more at ${DOC_URL_REPLACEMENT}\`;fetch("https://cdn.example.com/a")`);
  });
});

describe('postProcessDist', () => {
  it('rewrites dist/sw.js and dist/workbox-*.js in place', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bhc-pwa-post-'));
    try {
      writeFileSync(join(dir, 'sw.js'), SW);
      writeFileSync(join(dir, 'workbox-9c191d2f.js'), 'console.warn("see https://bit.ly/wb-precache")');
      writeFileSync(join(dir, 'other.js'), 'https://bit.ly/keep');
      postProcessDist(dir);
      expect(readFileSync(join(dir, 'sw.js'), 'utf8')).not.toContain('skipWaiting(');
      expect(readFileSync(join(dir, 'workbox-9c191d2f.js'), 'utf8')).toBe(`console.warn("see ${DOC_URL_REPLACEMENT}")`);
      expect(readFileSync(join(dir, 'other.js'), 'utf8')).toBe('https://bit.ly/keep');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
