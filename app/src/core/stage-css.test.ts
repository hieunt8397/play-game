// I/O matrix row "Portrait viewport": stage.css rotates the whole stage 90° in portrait,
// and carries the NFR6 page guards. (Visual result is checked manually in DevTools / on iPad.)
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../styles/stage.css'), 'utf8');

describe('stage.css', () => {
  it('rotates #stage 90° inside a portrait media query', () => {
    const portrait = /@media\s*\(orientation:\s*portrait\)\s*\{([\s\S]*?)\n\}/.exec(css);
    expect(portrait).not.toBeNull();
    expect(portrait![1]).toMatch(/#stage[\s\S]*transform:\s*rotate\(90deg\)/);
  });

  it.each(['touch-action: none', 'user-select: none', '-webkit-touch-callout: none', 'overscroll-behavior: none'])(
    'declares %s',
    (decl) => {
      expect(css).toContain(decl);
    },
  );
});
