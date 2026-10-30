// ESLint flat config (AD-8, AD-12).
// Layer rule (ARCHITECTURE-SPINE › Design Paradigm), enforced with no-restricted-imports:
//   scenes → games / core / content
//   games  → core / content          (never scenes, never another game, never the registry)
//   core   → content                 (never scenes or games)
//   content → nothing but types      (value imports from other layers/packages banned)
// Scenes and games: no colour literals, no magic numbers, and design values only through the
// `Tokens` facade (core/tokens) — never core/tokens.generated or core/timing directly.
// Relative-path bans are text patterns: a game's own files must import each other with paths that
// stay inside its folder (`./x`, not `../ice-cream/x`).
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

/** Must equal GAME_IDS in src/content/types.ts (asserted by tools/lint/rules.test.ts). */
export const LINT_GAME_IDS = ['ice-cream', 'pizza', 'race', 'fishing', 'touch-talk', 'dino-puzzle', 'shadow-match', 'animal-pens', 'band', 'bedtime', 'pet-clinic', 'dress-up', 'garden', 'car-wash'];

const GAME_ALT = LINT_GAME_IDS.join('|');
const RULE = '@typescript-eslint/no-restricted-imports';
/** Optional leading `./` before `../` segments (e.g. `./../scenes/Boot`). */
const UP = String.raw`^(\./)?(\.\./)+`;

const ban = (regex, message, allowTypeImports = false) => ({ regex, message, allowTypeImports });

const TOKENS_FACADE_ONLY = ban(
  String.raw`(^|/)core/(tokens\.generated|timing)(\.ts)?$`,
  'Use the Tokens facade (core/tokens: Tokens.* / Tokens.Timing.*), not core/tokens.generated or core/timing.',
);

// esquery's selector parser drops backslash escapes, so these regexes avoid them (no \b, no \().
const HEX = '#[0-9a-fA-F]{3,8}([^0-9a-zA-Z_]|$)';
const FN_COLOR = '(rgb|hsl)a?[(]';
const NO_COLOR_LITERALS = [
  { selector: `Literal[value=/${HEX}/]`, message: 'Hex colour literal: use Tokens.colors.* (generated from DESIGN.md).' },
  { selector: `Literal[value=/${FN_COLOR}/]`, message: 'rgb()/rgba()/hsl()/hsla() colour literal: use Tokens.* (generated from DESIGN.md).' },
  { selector: `TemplateElement[value.raw=/${HEX}/]`, message: 'Hex colour literal: use Tokens.colors.* (generated from DESIGN.md).' },
  { selector: `TemplateElement[value.raw=/${FN_COLOR}/]`, message: 'rgb()/rgba()/hsl()/hsla() colour literal: use Tokens.* (generated from DESIGN.md).' },
];

// no-magic-numbers treats `const SPEED = 42` / `speed = 42` class fields as named constants and
// allows them; AD-8 wants those numbers in Tokens/content too. Allow-list mirrors [-1, 0, 1, 2, 0.5].
const NOT_ALLOWED_NUMBER = ':not([value=0]):not([value=1]):not([value=2]):not([value=0.5])';
const NO_NAMED_MAGIC_NUMBERS = [
  `VariableDeclarator > Literal[raw=/^[0-9.]/]${NOT_ALLOWED_NUMBER}`,
  `VariableDeclarator > UnaryExpression[operator='-'] > Literal[raw=/^[0-9.]/]:not([value=1])`,
  `PropertyDefinition > Literal[raw=/^[0-9.]/]${NOT_ALLOWED_NUMBER}`,
  `PropertyDefinition > UnaryExpression[operator='-'] > Literal[raw=/^[0-9.]/]:not([value=1])`,
].map((selector) => ({
  selector,
  message: 'Magic number in a named constant: put it in Tokens (DESIGN/EXPERIENCE) or content/.',
}));

// AD-3: all sound goes through core/audio-director by catalog id (content/audio-catalog).
// esquery regexes: no slashes or backslashes inside, so 'assets.audio' and '[.]m4a'.
const AUDIO_PATH = '[.]m4a|assets.audio';
const AUDIO_MSG = 'Sound only through core/audio-director by catalog id (content/audio-catalog), never this.sound or audio paths.';
const NO_DIRECT_AUDIO = [
  { selector: "MemberExpression[object.type='ThisExpression'][property.name='sound']", message: AUDIO_MSG },
  { selector: "MemberExpression[property.name='sound'][object.property.name='game']", message: AUDIO_MSG },
  { selector: `Literal[value=/${AUDIO_PATH}/]`, message: AUDIO_MSG },
  { selector: `TemplateElement[value.raw=/${AUDIO_PATH}/]`, message: AUDIO_MSG },
];

// AD-4 / Story 1.6: input only through core/input (InputGuard, TapRouter, TapTarget, HotspotPolygon).
// Merged into the scenes/games no-restricted-syntax block below (a second block would override it in
// flat config) and applied alone to the rest of src/ (core, content) except core/input and tests.
const POINTER_MSG = 'Input only through core/input (createTapRouter / createTapTarget / HotspotPolygon), never raw pointer events.';
const CLIENT_MSG = 'Client coordinates are read only in core/input (pointer-adapter / space.ts toDesign).';
const POINTER_EVENT = '/^(pointer|gameobject)(down|move|up|upoutside)$/';
const LISTEN_FN = '/^(on|once|addListener|addEventListener)$/';
const CLIENT_PROP = '/^(clientX|clientY|pageX|pageY)$/';
const NO_RAW_POINTER = [
  { selector: `CallExpression[callee.property.name=${LISTEN_FN}][arguments.0.value=${POINTER_EVENT}]`, message: POINTER_MSG },
  { selector: `CallExpression[callee.name=${LISTEN_FN}][arguments.0.value=${POINTER_EVENT}]`, message: POINTER_MSG },
  { selector: "MemberExpression[property.name=/^(POINTER_DOWN|POINTER_MOVE|POINTER_UP)$/]", message: POINTER_MSG },
  { selector: `MemberExpression[property.name=${CLIENT_PROP}]`, message: CLIENT_MSG },
  { selector: `ObjectPattern > Property[key.name=${CLIENT_PROP}]`, message: CLIENT_MSG },
];

// AD-1 / Story 1.7: the shell owns navigation and loading. Games never call scene.start/stop/launch/
// run/switch/sleep/wake (on `this.scene`, `scene`, `game.scene` or `scene.manager`) and never touch a
// loader (`this.load` or any `.load.` member). Applied to games only (scenes navigate and load).
const NAV_MSG = 'Games never navigate: Map (the shell) starts, stops, sleeps and wakes scenes (AD-1).';
const LOAD_MSG = 'Games never load: Map loads the registry assets while the kart drives (AD-1).';
const NAV_FN = '/^(start|stop|launch|run|switch|sleep|wake)$/';
const NO_GAME_NAV = [
  { selector: `CallExpression[callee.property.name=${NAV_FN}][callee.object.property.name=/^(scene|manager)$/]`, message: NAV_MSG },
  { selector: `CallExpression[callee.property.name=${NAV_FN}][callee.object.name=/^(scene|manager)$/]`, message: NAV_MSG },
  { selector: "MemberExpression[object.type='ThisExpression'][property.name='load']", message: LOAD_MSG },
  { selector: "MemberExpression[object.property.name='load']", message: LOAD_MSG },
];

const STORAGE_MSG = 'Persistent storage only through core/progress-store (ProgressStore actions), never localStorage / sessionStorage / indexedDB / navigator.storage.';

const CORE_MSG = 'Layer rule: core/ must not import scenes/ or games/ (core → content only).';
const GAME_SCENES_MSG = 'Layer rule: games/ must not import scenes/ (games → core/content only).';
const GAME_CROSS_MSG = 'Layer rule: a game must not import another game or the registry.';
const CONTENT_MSG = 'Layer rule: content/ may only import types from other layers.';
const CONTENT_PKG_MSG = 'Layer rule: content/ may only import types from packages.';

export default defineConfig(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // --- Layering --------------------------------------------------------------
  {
    files: ['src/core/**/*.ts'],
    rules: {
      [RULE]: [
        'error',
        {
          patterns: [
            ban(`${UP}(scenes|games)(/|$)`, CORE_MSG),
            ban('(^|/)src/(scenes|games)(/|$)', CORE_MSG),
          ],
        },
      ],
    },
  },
  {
    files: ['src/scenes/**/*.ts'],
    rules: {
      [RULE]: ['error', { patterns: [TOKENS_FACADE_ONLY] }],
    },
  },
  {
    files: ['src/games/**/*.ts'],
    rules: {
      [RULE]: [
        'error',
        {
          patterns: [
            ban(`${UP}scenes(/|$)|(^|/)src/scenes(/|$)`, GAME_SCENES_MSG),
            ban(String.raw`${UP}(${GAME_ALT}|registry)(/|\.|$)`, GAME_CROSS_MSG),
            ban(String.raw`^(\./)?\.\./(\.\./)+games(/|$)|(^|/)src/games(/|$)`, GAME_CROSS_MSG),
            TOKENS_FACADE_ONLY,
          ],
        },
      ],
    },
  },
  {
    files: ['src/content/*.ts'],
    ignores: ['**/*.test.ts'], // tests may import vitest; layer rule applies to shipped content only
    rules: {
      [RULE]: [
        'error',
        {
          patterns: [
            ban(`${UP}(core|scenes|games)(/|$)|(^|/)src/(core|scenes|games)(/|$)`, CONTENT_MSG, true),
            ban('^[^./]', CONTENT_PKG_MSG, true),
          ],
        },
      ],
    },
  },
  {
    files: ['src/content/*/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      [RULE]: [
        'error',
        {
          patterns: [
            ban(
              String.raw`${UP}(core|scenes)(/|$)|^(\./)?\.\./(\.\./)+games(/|$)|(^|/)src/(core|scenes|games)(/|$)`,
              CONTENT_MSG,
              true,
            ),
            ban('^[^./]', CONTENT_PKG_MSG, true),
          ],
        },
      ],
    },
  },

  // --- Raw pointer input outside core/input (AD-4, Story 1.6); scenes/games get it below ------------
  {
    files: ['src/**/*.ts'],
    ignores: ['src/core/input/**', '**/*.test.ts', 'src/scenes/**', 'src/games/**'],
    rules: {
      'no-restricted-syntax': ['error', ...NO_RAW_POINTER],
    },
  },

  // --- Persistent storage only in core/progress-store (AD-2, Story 2.1) ------------------------------
  // no-restricted-globals / no-restricted-properties (not no-restricted-syntax: flat-config entries for
  // the same rule replace each other, and the scenes/games blocks own no-restricted-syntax).
  {
    files: ['src/**/*.ts'],
    ignores: ['src/core/progress-store.ts', 'src/core/progress-store.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['localStorage', 'sessionStorage', 'indexedDB'].map((name) => ({ name, message: STORAGE_MSG })),
      ],
      'no-restricted-properties': [
        'error',
        ...['localStorage', 'sessionStorage', 'indexedDB'].map((property) => ({ property, message: STORAGE_MSG })),
        { object: 'navigator', property: 'storage', message: STORAGE_MSG },
      ],
    },
  },

  // --- Literals, direct audio and raw pointer input in scenes and games (AD-8, AD-3, AD-4) ----------
  {
    files: ['src/scenes/**/*.ts', 'src/games/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...NO_COLOR_LITERALS, ...NO_NAMED_MAGIC_NUMBERS, ...NO_DIRECT_AUDIO, ...NO_RAW_POINTER],
      'no-magic-numbers': 'off',
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1, 2, 0.5],
          ignoreEnums: true,
          ignoreTypeIndexes: true,
          ignoreNumericLiteralTypes: true,
          detectObjects: true,
        },
      ],
    },
  },

  // --- Games: the same literal/audio/pointer bans plus no navigation and no loading (AD-1, Story 1.7) --
  // One merged list: a second no-restricted-syntax block for the same files would override the first.
  {
    files: ['src/games/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...NO_COLOR_LITERALS,
        ...NO_NAMED_MAGIC_NUMBERS,
        ...NO_DIRECT_AUDIO,
        ...NO_RAW_POINTER,
        ...NO_GAME_NAV,
      ],
    },
  },
);
