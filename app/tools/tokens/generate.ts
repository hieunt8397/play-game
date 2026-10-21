// tools/tokens — DESIGN.md YAML front matter → src/core/tokens.generated.ts (AD-8).
//   npm run tokens          regenerate the file
//   npm run tokens:check    fail (exit 1) if the committed file is stale
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { parseDesign, renderModule } from './parse.ts';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..', '..');
const designPath = resolve(
  appRoot,
  '..',
  '_bmad-output/planning-artifacts/ux-designs/ux-be-hoc-choi-2026-10-08/DESIGN.md',
);
// TOKENS_OUT overrides the output path (used by tools/tokens/generate.test.ts to check a stale copy).
const outPath = process.env.TOKENS_OUT
  ? resolve(process.env.TOKENS_OUT)
  : resolve(appRoot, 'src/core/tokens.generated.ts');

function fail(message: string): never {
  console.error(`tokens: ${message}`);
  process.exit(1);
}

function frontMatter(markdown: string): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(markdown);
  if (!m) fail(`no YAML front matter in ${designPath}`);
  return m[1]!;
}

if (!existsSync(designPath)) fail(`DESIGN.md not found at ${designPath}`);

let generated: string;
try {
  generated = renderModule(parseDesign(parseYaml(frontMatter(readFileSync(designPath, 'utf8')))));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const normalise = (s: string): string => s.replace(/\r\n/g, '\n');
const rel = relative(appRoot, outPath);

if (process.argv.includes('--check')) {
  const current = existsSync(outPath) ? normalise(readFileSync(outPath, 'utf8')) : '';
  if (current !== generated) {
    fail(`${rel} is stale or missing vs DESIGN.md — run npm run tokens`);
  }
  console.log(`tokens: ${rel} is up to date`);
} else {
  writeFileSync(outPath, generated, 'utf8');
  console.log(`tokens: wrote ${rel}`);
}
