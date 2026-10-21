// app/index.html (Story 1.11): the iOS Home-Screen meta and touch icon, relative paths only, and a
// theme-color that matches the manifest (designTokens.colors.sky).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { designTokens } from '../../src/core/tokens.generated.ts';

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(APP_DIR, 'index.html'), 'utf8');

const meta = (name: string): string | undefined => new RegExp(`<meta name="${name}" content="([^"]*)"`).exec(html)?.[1];

describe('index.html', () => {
  it('declares the standalone, full-bleed Home-Screen app', () => {
    expect(meta('apple-mobile-web-app-capable')).toBe('yes');
    expect(meta('apple-mobile-web-app-status-bar-style')).toBe('black-translucent');
    expect(meta('viewport')).toContain('viewport-fit=cover');
  });

  it('theme-color equals the manifest colour (sky token)', () => {
    expect(meta('theme-color')?.toUpperCase()).toBe(designTokens.colors.sky.css.toUpperCase());
  });

  it('links the 180² apple-touch-icon by a relative path that exists in public/', () => {
    const href = /<link rel="apple-touch-icon"[^>]*href="([^"]+)"/.exec(html)?.[1];
    expect(href).toBe('icons/apple-touch-icon.png');
    expect(existsSync(join(APP_DIR, 'public', href ?? ''))).toBe(true);
  });

  it('has no absolute or external URL', () => {
    expect(html).not.toMatch(/(href|src)="(https?:)?\/\//);
    expect(html).not.toMatch(/https?:\/\//);
  });
});
