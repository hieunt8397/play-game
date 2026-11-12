// Content validator (AD-6, AD-12). Checks the GameId list, the SFX/music catalog and the voice
// lines (id grammar, | ↔ keywordPauseMs, ≤ 8 words, banned near-homophones, line ↔ file ↔ hash,
// approval, stray files). Later stories add:
// polygons inside Tokens.safeRect / outside dead-zones, target size/gap, layout coverage.
// The filesystem and the hash function are injected (tools/lint/validate-content.ts), so the rules
// stay pure. Imports carry `.ts` so Node type stripping can run this file from tools/.
import {
  inviteLine,
  stationNameLine,
  voiceHashPath,
  voicePath,
  type VoiceLine,
} from "./voice-lines.ts";
import { isHomeStation } from "./stations.ts";

export interface AudioEntryInput {
  readonly path: string;
  readonly kind: string;
}

/** Voice-line checks; everything outside the line list is injected by the tool (or a test). */
export interface VoiceInput {
  lines: readonly VoiceLine[];
  /** `lineHash(line)` (tools/tts/line-hash.ts). */
  hashLine: (line: VoiceLine) => string;
  /** Whether a path relative to `public/` exists. */
  fileExists: (publicPath: string) => boolean;
  /** File names (not paths) found in `public/assets/audio/vo/`. */
  listVoiceFiles: () => readonly string[];
  /** Content of a `.hash` file relative to `public/` (undefined when unreadable). */
  readHash: (publicPath: string) => string | undefined;
  /**
   * Story 5.3 (NFR15): the length in ms of an audio file relative to `public/` (undefined when it
   * cannot be read). With `promptMaxMs` (Tokens.Timing.promptMaxMs, injected by the tool) every
   * existing prompt-intent file (PROMPT_INTENTS) must be at most that long.
   */
  durationMs?: (publicPath: string) => number | undefined;
  promptMaxMs?: number;
}

export interface ContentInput {
  gameIds: readonly string[];
  /** SFX/music catalog (content/audio-catalog.ts). */
  audio?: Readonly<Record<string, AudioEntryInput>>;
  /**
   * Tool only: whether a path relative to `public/` exists. Omitted in unit tests of the pure
   * rules; tools/lint/validate-content.ts passes a real filesystem check.
   */
  fileExists?: (publicPath: string) => boolean;
  /** Voice lines (content/voice-lines.ts) with the injected file and hash access. */
  voice?: VoiceInput;
  /** Map stations (content/stations.ts) and the voice-line ids they must have (Story 1.5). */
  stations?: StationsInput;
  /** Game content (content/games, Story 1.7). */
  games?: GamesInput;
  /** Decoration catalogue and slots (content/decorations.ts, stations.ts; Story 2.2). */
  decorations?: DecorationCatalogueInput;
  /** Parent invitation lines (content/parent-invite.ts; Story 5.7). */
  parentInvite?: ParentInviteInput;
}

/** Story 5.7: the per-game parent invitation lines. */
export interface ParentInviteInput {
  gameIds: readonly string[];
  /** Every voice-line id. */
  voiceIds: readonly string[];
  /** `PARENT_INVITE_LINES`. */
  lines: Readonly<Record<string, readonly string[]>>;
}

/** Story 5.7: the intent of a parent invitation line (`vo.<game>.parent.<n>`). */
export const PARENT_INTENT = "parent";
/** Story 5.7: each game has 1–2 parent lines. */
const MAX_PARENT_LINES = 2;
/** Story 5.7: `vo.<scope>.parent.<n>` (the scope is compared with the game separately). */
const PARENT_LINE_ID = /^vo\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.parent\.[0-9]+$/;

/**
 * Parent invitation rules (Story 5.7, FR35): every GameId has 1–2 lines; each listed line exists, has
 * the exact form `vo.<gameId>.parent.<n>` (its own game, a numeric <n>) and appears once in its list;
 * only GameIds are keys; every parent-intent voice line is listed.
 */
export function validateParentInvite(input: ParentInviteInput): string[] {
  const problems: string[] = [];
  const ids = new Set(input.voiceIds);
  const listed = new Set<string>();
  for (const key of Object.keys(input.lines)) {
    if (!input.gameIds.includes(key)) problems.push(`parent-invite: key "${key}" is not a GameId`);
  }
  for (const gameId of input.gameIds) {
    const lines = input.lines[gameId] ?? [];
    if (lines.length === 0 || lines.length > MAX_PARENT_LINES)
      problems.push(`parent-invite "${gameId}": ${lines.length} lines (1–${MAX_PARENT_LINES})`);
    const own = new Set<string>();
    for (const id of lines) {
      if (own.has(id)) problems.push(`parent-invite "${gameId}": "${id}" is listed twice`);
      own.add(id);
      listed.add(id);
      if (!ids.has(id)) problems.push(`parent-invite "${gameId}": voice line "${id}" does not exist`);
      if (!PARENT_LINE_ID.test(id) || id.split(".")[1] !== gameId)
        problems.push(`parent-invite "${gameId}": "${id}" is not a vo.${gameId}.${PARENT_INTENT}.<n> line`);
    }
  }
  for (const id of input.voiceIds) {
    if (id.split(".")[2] === PARENT_INTENT && !listed.has(id))
      problems.push(`parent-invite: voice line "${id}" is not listed in PARENT_INVITE_LINES`);
  }
  return problems;
}

/** Story 2.2: the decoration catalogue per station and each station's slot ids. */
export interface DecorationCatalogueInput {
  gameIds: readonly string[];
  catalogue: Readonly<Record<string, ReadonlyArray<{ readonly id: string; readonly model: string }>>>;
  stations: ReadonlyArray<{ readonly id: string; readonly slots: readonly string[] }>;
}

const DECORATION_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** `model` is relative to `assets/`: a Kenney or Quaternius GLB/FBX. */
export const DECORATION_MODEL = /^(kenney|quaternius)\/.+\.(glb|fbx)$/;

/**
 * Decoration catalogue rules (Story 2.2): every GameId has a non-empty catalogue; ids are kebab-case
 * and unique across all stations (the atlas frame is `decoration/<id>/00`); every model is a
 * Kenney/Quaternius .glb/.fbx under `assets/`; every station has ≥ 1 slot, with ids `<ownId>-1..k`.
 */
export function validateDecorationCatalogue(input: DecorationCatalogueInput): string[] {
  const problems: string[] = [];
  const owner = new Map<string, string>();
  for (const gameId of input.gameIds) {
    const items = input.catalogue[gameId] ?? [];
    if (items.length === 0) problems.push(`decorations "${gameId}": the catalogue is empty`);
    for (const it of items) {
      if (!DECORATION_ID.test(it.id)) problems.push(`decoration "${it.id}" (${gameId}): id is not kebab-case`);
      const first = owner.get(it.id);
      if (first !== undefined) problems.push(`decoration "${it.id}" (${gameId}): id is already used by "${first}"`);
      else owner.set(it.id, gameId);
      if (!DECORATION_MODEL.test(it.model)) {
        problems.push(`decoration "${it.id}" (${gameId}): model "${it.model}" must match ${DECORATION_MODEL.source}`);
      }
    }
  }
  for (const id of Object.keys(input.catalogue).filter((k) => !input.gameIds.includes(k))) {
    problems.push(`decorations "${id}": not a GameId`);
  }
  for (const s of input.stations) {
    if (s.slots.length === 0) problems.push(`station "${s.id}": has no decoration slot`);
    s.slots.forEach((slot, i) => {
      const expected = `${s.id}-${i + 1}`;
      if (slot !== expected) problems.push(`station "${s.id}": slot "${slot}" must be "${expected}" (ids <id>-1..k in order)`);
    });
  }
  return problems;
}

export interface StationInput {
  readonly id: string;
  readonly label: string;
  readonly awake: boolean;
}

export interface StationsInput {
  stations: readonly StationInput[];
  /** Every voice-line id (content/voice-lines.ts). */
  voiceIds: readonly string[];
  /** Ids with game content (`GAME_CONTENT`, Story 1.7): a station is awake exactly when listed. */
  playable?: readonly string[];
}

/** Game content (Story 1.7): the audio ids each game loads must exist. */
export interface GamesInput {
  games: ReadonlyArray<{ readonly id: string; readonly audio: readonly string[] }>;
  /** Every voice-line id. */
  voiceIds: readonly string[];
  /** Every audio-catalog id. */
  audioIds: readonly string[];
}

/** Game rules: every `assets.audio` id is a voice line or an audio-catalog id. */
export function validateGames(input: GamesInput): string[] {
  const known = new Set([...input.voiceIds, ...input.audioIds]);
  const problems: string[] = [];
  for (const g of input.games) {
    for (const id of g.audio) {
      if (!known.has(id))
        problems.push(`game "${g.id}": asset audio id "${id}" is neither a voice line nor an audio-catalog id`);
    }
  }
  return problems;
}

/** Station rules: a non-empty label, a name line for every station, an invite line for every awake one. */
export function validateStations(input: StationsInput): string[] {
  const problems: string[] = [];
  const ids = new Set(input.voiceIds);
  for (const s of input.stations) {
    if (s.label.trim().length === 0)
      problems.push(`station "${s.id}": label is empty`);
    const name = stationNameLine(s.id);
    if (!ids.has(name))
      problems.push(`station "${s.id}": voice line "${name}" is missing`);
    const invite = inviteLine(s.id);
    if (s.awake && !ids.has(invite))
      problems.push(`station "${s.id}": awake but voice line "${invite}" is missing`);
    // Story 7.1: the home station opens the yard, not a game: no GAME_CONTENT entry.
    if (input.playable && !isHomeStation(s.id)) {
      const playable = input.playable.includes(s.id);
      if (s.awake && !playable)
        problems.push(`station "${s.id}": awake but GAME_CONTENT has no "${s.id}" entry`);
      if (!s.awake && playable)
        problems.push(`station "${s.id}": GAME_CONTENT has "${s.id}" but the station is not awake`);
    }
  }
  return problems;
}

/** Most words in one line (UX: ≤ 8 words). */
export const MAX_VOICE_WORDS = 8;

/** Near-homophone pairs that must never share a sentence (EXPERIENCE › Voice). */
export const BANNED_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["dâu", "đâu"],
  ["cá", "cà"],
  ["ba", "bà"],
  ["bóng", "bông"],
  ["cam", "cầm"],
];

/**
 * Story 3.1: phrases a parent must hear before a line is approved (loanwords, hard words). An
 * unapproved line containing one (as a word sequence) must carry `review`. Story 3.2 adds
 * "năm lát nấm" (năm/nấm side by side may blur).
 */
export const REVIEW_WORDS: readonly string[] = ['pizza', 'xúc xích', 'năm lát nấm'];

/** Story 3.1: never spoken — no "wrong" and no praise (EXPERIENCE › Voice). A word-sequence match fails. */
export const BANNED_PHRASES: readonly string[] = ['sai', 'không đúng', 'giỏi', 'tuyệt vời', 'xuất sắc', 'đúng rồi', 'hoan hô', 'hay quá'];

/**
 * Story 5.2 (FR36, NFR3): the child's name. It may only be spoken in a line whose intent (the
 * `<intent>` segment of `vo.<scope>.<intent>…`, i.e. `id.split('.')[2]`) is a greeting, an invitation or a prompt — never in praise, counts or retries.
 */
export const NAME_WORD = 'xoài';
export const NAME_INTENTS: readonly string[] = ['greeting', 'invite', 'ask', 'prompt', 'scene'];
/**
 * Story 7.1: lines where "Xoài" is part of a place's own name, never praise: the home station "Nhà Xoài"
 * (its parent label and name line, required by spec-7-1). Only these exact ids are exempt.
 */
// 2026-11-12 (Tên lửa lên Mặt Trăng, spec-ten-lua): "Trái Đất, nhà của Xoài!" names the Earth as the child's home (a place), like "Nhà Xoài".
export const NAME_PLACE_LINES: readonly string[] = ['vo.shell.station-name.home', 'vo.rocket.earth'];

/**
 * Story 5.3 (NFR15): the "câu yêu cầu" intents — the hint system's prompt and retry families — whose
 * audio is length-checked. Story 5.7: `parent` too (the invitation leads the first prompt).
 */
export const PROMPT_INTENTS: readonly string[] = ['ask', 'ask-order', 'order-first', 'order-next', 'prompt', 'retry', 'bake', 'enough', 'parent'];
const MS_PER_S = 1000;

/** True when the words of `phrase` appear consecutively in `text` (voiceWords of both). */
export function hasPhrase(text: string, phrase: string): boolean {
  const words = voiceWords(text);
  const want = voiceWords(phrase);
  if (want.length === 0) return false;
  for (let i = 0; i + want.length <= words.length; i++) {
    if (want.every((w, k) => words[i + k] === w)) return true;
  }
  return false;
}

/** Story 3.1: the unapproved lines a parent should listen to (`review` set), for validate:content's info list. */
export function reviewLines(lines: readonly VoiceLine[]): Array<{ id: string; text: string; review: string }> {
  return lines.flatMap((l) => (l.review?.trim() && !l.approved ? [{ id: l.id, text: l.text, review: l.review }] : []));
}

const KEBAB = "[a-z][a-z0-9]*(?:-[a-z0-9]+)*";
const VOICE_ID = new RegExp(
  String.raw`^vo\.(${KEBAB})\.${KEBAB}(?:\.${KEBAB})?(?:\.[0-9]+)?$`,
);
const VOICE_FILE = /^(.+)\.(m4a|hash)$/;

/** Words of a text (NFC, lower-cased, `|` removed, split on anything not a letter or digit). */
export function voiceWords(text: string): string[] {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replaceAll("|", " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

/** The banned pairs found together in one sentence (split on `.!?`). */
export function bannedPairsIn(text: string): Array<readonly [string, string]> {
  const found: Array<readonly [string, string]> = [];
  for (const sentence of text.normalize("NFC").split(/[.!?]+/)) {
    const words = new Set(voiceWords(sentence));
    for (const pair of BANNED_PAIRS) {
      if (words.has(pair[0]) && words.has(pair[1]) && !found.includes(pair))
        found.push(pair);
    }
  }
  return found;
}

function validateVoice(
  voice: VoiceInput,
  gameIds: readonly string[],
): string[] {
  const problems: string[] = [];
  const scopes = new Set(["shell", ...gameIds]);
  const seen = new Set<string>();
  for (const line of voice.lines) {
    const id = line.id;
    const match = VOICE_ID.exec(id);
    if (!match || !scopes.has(match[1] ?? "")) {
      problems.push(
        `voice id "${id}" must match vo.<shell|GameId>.<intent>[.<subjectId>][.<n>] (kebab-case)`,
      );
    }
    if (seen.has(id)) problems.push(`voice id "${id}" is duplicated`);
    seen.add(id);

    const hasBar = line.text.includes("|");
    if (hasBar && line.keywordPauseMs === undefined)
      problems.push(`voice "${id}": text has "|" but no keywordPauseMs`);
    if (!hasBar && line.keywordPauseMs !== undefined)
      problems.push(`voice "${id}": keywordPauseMs is set but text has no "|"`);
    if (line.text.split("|").some((segment) => segment.trim().length === 0)) {
      problems.push(`voice "${id}": empty text or empty segment around "|"`);
    }

    const words = voiceWords(line.text).length;
    if (words > MAX_VOICE_WORDS)
      problems.push(
        `voice "${id}": ${words} words (at most ${MAX_VOICE_WORDS})`,
      );

    for (const phrase of BANNED_PHRASES) {
      if (hasPhrase(line.text, phrase)) problems.push(`voice "${id}": banned phrase "${phrase}" (no "wrong" and no praise)`);
    }
    if (!line.approved && !line.review?.trim()) {
      for (const phrase of REVIEW_WORDS) {
        if (hasPhrase(line.text, phrase)) problems.push(`voice "${id}": contains "${phrase}" but has no review (a reason for a parent to listen)`);
      }
    }
    const intent = id.split('.')[2] ?? '';
    if (voiceWords(line.text).includes(NAME_WORD.normalize('NFC')) && !NAME_INTENTS.includes(intent) && !NAME_PLACE_LINES.includes(id)) {
      problems.push(`voice "${id}": the name "Xoài" is only for greetings, invitations and prompts (never praise)`);
    }
    for (const [a, b] of bannedPairsIn(line.text)) {
      problems.push(
        `voice "${id}": near-homophones "${a}" and "${b}" in one sentence`,
      );
    }

    const hash = voice.hashLine(line);
    const audioPath = voicePath(id);
    const hashPath = voiceHashPath(id);
    if (!voice.fileExists(audioPath))
      problems.push(
        `voice "${id}": file public/${audioPath} is missing (run npm run content:export && npm run tts)`,
      );
    else if (voice.durationMs && voice.promptMaxMs !== undefined && PROMPT_INTENTS.includes(intent)) {
      const ms = voice.durationMs(audioPath);
      if (ms === undefined) problems.push(`voice "${id}": cannot read the audio length`);
      else if (ms > voice.promptMaxMs)
        problems.push(`voice "${id}": prompt lasts ${(ms / MS_PER_S).toFixed(2)} s (at most ${voice.promptMaxMs / MS_PER_S} s, NFR15)`);
    }
    if (!voice.fileExists(hashPath)) {
      problems.push(
        `voice "${id}": file public/${hashPath} is missing (run npm run content:export && npm run tts)`,
      );
    } else if (voice.readHash(hashPath)?.trim() !== hash) {
      problems.push(
        `voice "${id}": public/${hashPath} does not match the line (text or settings changed; run npm run tts)`,
      );
    }
    if (line.approved && line.approved.textHash !== hash) {
      problems.push(
        `voice "${id}": approved.textHash does not match the line (listen again, then copy the new .hash)`,
      );
    }
  }

  for (const name of voice.listVoiceFiles()) {
    const m = VOICE_FILE.exec(name);
    if (m && !seen.has(m[1] ?? "")) {
      problems.push(
        `voice "${m[1]}": stray file public/assets/audio/vo/${name} has no line in content/voice-lines.ts`,
      );
    }
  }
  return problems;
}

/** `sfx.<scope>.<name>`, or (Story 3.3) with a subject segment: `sfx.<scope>.<subject>.<name>`. */
const SFX_ID = /^sfx\.[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)?\.[a-z][a-z0-9-]*$/;
const MUSIC_ID = /^music\.[a-z][a-z0-9-]*$/;

/** Returns a list of human-readable problems; empty means valid. */
export function validateContent(input: ContentInput): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const id of input.gameIds) {
    if (!/^[a-z]+(-[a-z]+)*$/.test(id))
      problems.push(`GameId "${id}" is not kebab-case`);
    if (seen.has(id)) problems.push(`GameId "${id}" is duplicated`);
    seen.add(id);
  }

  for (const [id, entry] of Object.entries(input.audio ?? {})) {
    const kind = SFX_ID.test(id)
      ? "sfx"
      : MUSIC_ID.test(id)
        ? "music"
        : undefined;
    if (!kind) {
      problems.push(
        `audio id "${id}" must match sfx.<scope>[.<subject>].<name> or music.<name>`,
      );
      continue;
    }
    if (entry.kind !== kind)
      problems.push(
        `audio id "${id}" has kind "${entry.kind}", expected "${kind}"`,
      );
    const expected = `assets/audio/${kind}/${id}.m4a`;
    if (entry.path !== expected) {
      problems.push(
        `audio id "${id}" has path "${entry.path}", expected "${expected}"`,
      );
    } else if (input.fileExists && !input.fileExists(entry.path)) {
      problems.push(
        `audio id "${id}": file public/${entry.path} is missing (run npm run audio:placeholders)`,
      );
    }
  }

  if (input.voice) problems.push(...validateVoice(input.voice, input.gameIds));
  if (input.stations) problems.push(...validateStations(input.stations));
  if (input.games) problems.push(...validateGames(input.games));
  if (input.decorations) problems.push(...validateDecorationCatalogue(input.decorations));
  if (input.parentInvite) problems.push(...validateParentInvite(input.parentInvite));
  return problems;
}
