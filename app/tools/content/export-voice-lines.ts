// `npm run content:export` — writes the voice lines (content/voice-lines.ts) as JSON for the TTS
// tool: app/.generated/voice-lines.json (gitignored). Each record carries its `textHash`
// (tools/tts/line-hash.ts), so `npm run tts` needs no TypeScript content import.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOICE_LINES, voicePath, type VoiceLine } from '../../src/content/voice-lines.ts';
import { lineHash } from '../tts/line-hash.ts';

export interface ExportedVoiceLine {
  id: string;
  text: string;
  keywordPauseMs?: number;
  rate?: number;
  /** Story 7.4: the line's own v3 audio tag (absent: VOICE_DEFAULTS.style). */
  style?: string;
  approved?: { textHash: string };
  /** Relative to `public/`. */
  path: string;
  textHash: string;
}

export const EXPORT_FILE = '.generated/voice-lines.json';

export function exportRecords(lines: readonly VoiceLine[]): ExportedVoiceLine[] {
  return lines.map((line) => {
    const record: ExportedVoiceLine = { id: line.id, text: line.text.normalize('NFC'), path: voicePath(line.id), textHash: lineHash(line) };
    if (line.keywordPauseMs !== undefined) record.keywordPauseMs = line.keywordPauseMs;
    if (line.rate !== undefined) record.rate = line.rate;
    if (line.style !== undefined) record.style = line.style;
    if (line.approved) record.approved = { textHash: line.approved.textHash };
    return record;
  });
}

function main(): void {
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const out = resolve(appRoot, EXPORT_FILE);
  mkdirSync(dirname(out), { recursive: true });
  const tmp = `${out}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(exportRecords(VOICE_LINES), null, 2)}\n`, 'utf8');
  renameSync(tmp, out);
  console.log(`content:export: wrote ${EXPORT_FILE} (${VOICE_LINES.length} voice lines)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
