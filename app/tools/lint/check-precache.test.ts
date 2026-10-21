// tools/lint/check-precache.ts (Story 1.11, AR36): every failing kind of the rules, the manifest
// regex on a real-format sample, and run(appDir) against temp public/ + dist/ trees.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkPrecache, MAX_FILE_BYTES, parseManifestUrls, run, type PrecacheInput } from './check-precache.ts';

/** Minified generateSW output shape (vite-plugin-pwa 2.0.0 / Workbox 7.4.1). */
const SW_SAMPLE =
  'define(["./workbox-9c191d2f"],function(e){"use strict";e.clientsClaim(),e.precacheAndRoute([' +
  '{url:"manifest.webmanifest",revision:"03c5"},{url:"index.html",revision:"759c2465"},{url:"assets/x.m4a",revision:"0a1b"},{url:"assets/index-B.js",revision:null},' +
  '{url:"icons/icon-192.png",revision:"fe83"}],{}),e.cleanupOutdatedCaches(),' +
  'e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("index.html")))});';

function input(over: Partial<PrecacheInput> = {}): PrecacheInput {
  return {
    publicFiles: ['assets/x.m4a', 'assets/x.hash', 'assets/fonts/OFL.txt', 'icons/icon-192.png'],
    distFiles: [
      { path: 'index.html', bytes: 1000 },
      { path: 'assets/x.m4a', bytes: 2000 },
    ],
    manifestUrls: parseManifestUrls(SW_SAMPLE),
    textFiles: [
      { path: 'index.html', text: '<link rel="manifest" href="./manifest.webmanifest">' },
      { path: 'sw.js', text: SW_SAMPLE },
      { path: 'workbox-9c191d2f.js', text: 'console.warn("Learn more at the Workbox documentation")' },
    ],
    ...over,
  };
}

describe('parseManifestUrls', () => {
  it('collects every url:"…" of a real-format manifest', () => {
    expect(parseManifestUrls(SW_SAMPLE)).toEqual(['manifest.webmanifest', 'index.html', 'assets/x.m4a', 'assets/index-B.js', 'icons/icon-192.png']);
    expect(parseManifestUrls('[{"url":"a.png","revision":"1"}]')).toEqual(['a.png']);
  });
});

describe('checkPrecache', () => {
  it('ok: every runtime file precached → no problems, runtime count', () => {
    expect(checkPrecache(input())).toEqual({ problems: [], runtimeCount: 2 });
  });

  it('a runtime public file missing from the manifest fails naming it', () => {
    const r = checkPrecache(input({ publicFiles: [...input().publicFiles, 'assets/atlases/new.png'] }));
    expect(r.problems).toEqual(['public/assets/atlases/new.png is not precached by dist/sw.js']);
  });

  it('a file of unknown type (.mp3) fails naming it', () => {
    const r = checkPrecache(input({ publicFiles: ['assets/x.m4a', 'icons/icon-192.png', 'assets/audio/sfx/boom.mp3'] }));
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/^public\/assets\/audio\/sfx\/boom\.mp3: extension "\.mp3"/);
  });

  it('a dist file over 8 MiB fails naming it; exactly 8 MiB passes', () => {
    const r = checkPrecache(
      input({
        distFiles: [
          { path: 'assets/bg/huge.bin', bytes: MAX_FILE_BYTES + 1 },
          { path: 'assets/bg/edge.bin', bytes: MAX_FILE_BYTES },
        ],
      }),
    );
    expect(r.problems).toEqual([`dist/assets/bg/huge.bin is ${MAX_FILE_BYTES + 1} bytes (> 8388608)`]);
  });

  it('an absolute URL in sw.js, workbox-*.js, index.html or the manifest fails naming the file', () => {
    for (const path of ['sw.js', 'workbox-abc.js', 'index.html', 'manifest.webmanifest']) {
      const r = checkPrecache(input({ textFiles: [{ path, text: 'x("https://cdn.example.com/a.js")' }] }));
      expect(r.problems).toEqual([`dist/${path} contains an absolute http(s):// URL`]);
    }
    const http = checkPrecache(input({ textFiles: [{ path: 'index.html', text: '<script src="http://x/y.js">' }] }));
    expect(http.problems).toHaveLength(1);
  });

  it('importScripts of a non-relative URL fails; a relative one or a variable passes', () => {
    const bad = checkPrecache(input({ textFiles: [{ path: 'sw.js', text: 'importScripts("//cdn.example.com/wb.js")' }] }));
    expect(bad.problems).toEqual(['dist/sw.js: importScripts("//cdn.example.com/wb.js") is not a relative URL']);
    const ok = checkPrecache(input({ textFiles: [{ path: 'sw.js', text: 'importScripts("./workbox-1.js");importScripts(s)' }] }));
    expect(ok.problems).toEqual([]);
  });

  it('sw.js calling skipWaiting() fails', () => {
    const r = checkPrecache(input({ textFiles: [{ path: 'sw.js', text: 'self.skipWaiting()' }] }));
    expect(r.problems).toEqual(['dist/sw.js calls skipWaiting() (updates must wait for the next cold open)']);
  });

  it('a missing dist/sw.js fails with "run vite build"', () => {
    const r = checkPrecache(input({ manifestUrls: undefined }));
    expect(r.problems).toEqual(['dist/sw.js is missing (run vite build)']);
  });

  it('a Vite-emitted dist/ file missing from the manifest fails naming it (sw.js / workbox-*.js exempt)', () => {
    const r = checkPrecache(
      input({
        manifestUrls: ['index.html', 'assets/x.m4a', 'icons/icon-192.png'],
        distFiles: [
          { path: 'index.html', bytes: 1 },
          { path: 'assets/index-B.js', bytes: 1 },
          { path: 'sw.js', bytes: 1 },
          { path: 'workbox-9c191d2f.js', bytes: 1 },
        ],
      }),
    );
    expect(r.problems).toEqual(['dist/assets/index-B.js is not precached by dist/sw.js']);
  });

  it('index.html missing from the manifest fails', () => {
    const r = checkPrecache(input({ manifestUrls: ['assets/x.m4a', 'icons/icon-192.png'] }));
    expect(r.problems).toEqual(['dist/index.html is not precached by dist/sw.js']);
  });
});

describe('run(appDir)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function put(root: string, rel: string, content: string | Buffer): void {
    const file = join(root, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }

  /** A good app tree: public/ runtime + metadata files, dist/ with a real-format sw.js. */
  function goodApp(): string {
    const app = mkdtempSync(join(tmpdir(), 'bhc-precache-'));
    dirs.push(app);
    for (const rel of ['assets/x.m4a', 'icons/icon-192.png']) {
      put(app, `public/${rel}`, 'data');
      put(app, `dist/${rel}`, 'data');
    }
    put(app, 'public/assets/x.hash', 'abc');
    put(app, 'dist/assets/index-B.js', 'console.log(1)');
    put(app, 'dist/index.html', '<html></html>');
    put(app, 'dist/manifest.webmanifest', '{"start_url":"./"}');
    put(app, 'dist/sw.js', SW_SAMPLE);
    put(app, 'dist/workbox-9c191d2f.js', 'self.x=1');
    return app;
  }

  it('passes on a good tree and reports counts', () => {
    const r = run(goodApp());
    expect(r.problems).toEqual([]);
    expect(r.runtimeCount).toBe(2);
    expect(r.manifestCount).toBe(5);
  });

  it('fails naming a runtime asset added to public/ but not precached', () => {
    const app = goodApp();
    put(app, 'public/assets/bg/new.png', 'png');
    expect(run(app).problems).toEqual(['public/assets/bg/new.png is not precached by dist/sw.js']);
  });

  it('fails naming an oversized dist file', () => {
    const app = goodApp();
    put(app, 'dist/assets/bg/huge.png', Buffer.alloc(MAX_FILE_BYTES + 1));
    expect(run(app).problems).toContain(`dist/assets/bg/huge.png is ${MAX_FILE_BYTES + 1} bytes (> 8388608)`);
  });

  it('scans workbox-*.js for absolute URLs', () => {
    const app = goodApp();
    put(app, 'dist/workbox-9c191d2f.js', 'importScripts("https://storage.googleapis.com/workbox-cdn/x.js")');
    const problems = run(app).problems;
    expect(problems).toContain('dist/workbox-9c191d2f.js contains an absolute http(s):// URL');
    expect(problems).toContain('dist/workbox-9c191d2f.js: importScripts("https://storage.googleapis.com/workbox-cdn/x.js") is not a relative URL');
  });

  it('fails with "run vite build" when dist/ has no sw.js', () => {
    const app = goodApp();
    rmSync(join(app, 'dist', 'sw.js'));
    expect(run(app).problems).toEqual(['dist/sw.js is missing (run vite build)']);
  });
});
