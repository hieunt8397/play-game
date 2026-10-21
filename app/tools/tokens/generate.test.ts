// I/O matrix row "Stale tokens": tokens:check fails when the generated file no longer matches DESIGN.md.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const generator = join(appRoot, 'tools/tokens/generate.ts');
const committed = join(appRoot, 'src/core/tokens.generated.ts');
const dir = mkdtempSync(join(tmpdir(), 'bhc-tokens-'));

function check(outFile: string) {
  return spawnSync(process.execPath, [generator, '--check'], {
    cwd: appRoot,
    env: { ...process.env, TOKENS_OUT: outFile },
    encoding: 'utf8',
  });
}

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('tokens:check', () => {
  it('passes for an up-to-date copy of the generated file', () => {
    const out = join(dir, 'fresh.ts');
    writeFileSync(out, readFileSync(committed, 'utf8'));
    expect(check(out).status).toBe(0);
  });

  it('fails and asks to run npm run tokens when the file is stale', () => {
    const out = join(dir, 'stale.ts');
    writeFileSync(out, readFileSync(committed, 'utf8') + '\n// hand edit\n');
    const result = check(out);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('run npm run tokens');
  });
});
