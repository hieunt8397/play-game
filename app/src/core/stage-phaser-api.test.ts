// Deferred from spec-1-1 (Story 1.6): core/stage.ts patches Phaser's ScaleManager and core/input
// inverts its transform. Fail loudly if a Phaser upgrade renames what they rely on.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const file = resolve(dirname(fileURLToPath(import.meta.url)), '../../node_modules/phaser/src/scale/ScaleManager.js');
const src = readFileSync(file, 'utf8');

describe('Phaser ScaleManager API used by core/stage.ts and core/input', () => {
  it.each(['getParentBounds', 'updateCenter', 'transformX', 'transformY'])('has the method %s', (name) => {
    expect(src).toMatch(new RegExp(`\\b${name}: function\\s*\\(`));
  });

  it('has canvasBounds and displayScale', () => {
    expect(src).toMatch(/this\.canvasBounds\s*=/);
    expect(src).toMatch(/this\.displayScale\s*=/);
  });
});
