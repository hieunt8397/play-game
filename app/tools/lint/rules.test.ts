// Exercises eslint.config.js rule branches on virtual files (nothing is written to disk).
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { LINT_GAME_IDS } from '../../eslint.config.js';
import { GAME_IDS } from '../../src/content/types.ts';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const eslint = new ESLint({ cwd: appRoot });

async function ruleIds(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: resolve(appRoot, file) });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

const IMPORTS = '@typescript-eslint/no-restricted-imports';
const SYNTAX = 'no-restricted-syntax';

describe('eslint.config.js', () => {
  it('keeps its GameId list in sync with content/types.ts', () => {
    expect(LINT_GAME_IDS).toEqual([...GAME_IDS]);
  });

  it.each([
    ['games → scenes', 'src/games/pizza/scene.ts', "import '../../scenes/Boot';"],
    ['game → registry', 'src/games/pizza/scene.ts', "import '../registry';"],
    ['game → sibling game', 'src/games/pizza/scene.ts', "import '../ice-cream/scene';"],
    ['nested game → other game', 'src/games/ice-cream/sub/x.ts', "import '../../pizza/x';"],
    ['core → games', 'src/core/x.ts', "import '../games/pizza/scene';"],
    ['core → scenes with ./ prefix', 'src/core/x.ts', "import './../scenes/Boot';"],
    ['content value import from phaser', 'src/content/x.ts', "import { Scene } from 'phaser';\nexport const s = Scene;"],
    ['nested content value import from core', 'src/content/voice/x.ts', "import { bus } from '../../core/bus';\nexport const b = bus;"],
    ['scenes → core/timing', 'src/scenes/X.ts', "import { Timing } from '../core/timing';\nexport const t = Timing;"],
    ['games → core/tokens.generated', 'src/games/pizza/scene.ts', "import { designTokens } from '../../core/tokens.generated';\nexport const t = designTokens;"],
  ])('bans import: %s', async (_name, file, code) => {
    expect(await ruleIds(file, code)).toContain(IMPORTS);
  });

  it.each([
    ['template-literal hex', 'export const c = `#FF0000`;'],
    ['hex inside a longer string', "export const c = 'color:#FF0000';"],
    ['hsl()', "export const c = 'hsl(0, 100%, 50%)';"],
    ['negative named constant', 'export const S = -42;'],
    ['class field', 'export class K { speed = 42; }'],
  ])('bans in scenes: %s', async (_name, code) => {
    expect(await ruleIds('src/scenes/X.ts', code)).toContain(SYNTAX);
  });

  it.each([
    ['this.sound in a scene', 'src/scenes/X.ts', 'export class S { sound = { play: (_k: string) => true }; f() { this.sound.play(AUDIO_ID); } }\nconst AUDIO_ID = String(1);'],
    ['this.game.sound in a game', 'src/games/pizza/scene.ts', 'export class S { game = { sound: {} }; f() { return this.game.sound; } }'],
    ['.m4a path in a scene', 'src/scenes/X.ts', "export const p = 'pop.m4a';"],
    ['assets/audio path in a game', 'src/games/pizza/scene.ts', "export const p = 'assets/audio/sfx/x';"],
    ['template-literal audio path', 'src/scenes/X.ts', 'export const id = String(1);\nexport const p = `assets/audio/sfx/${id}.m4a`;'],
  ])('bans direct audio: %s', async (_name, file, code) => {
    expect(await ruleIds(file, code)).toContain(SYNTAX);
  });

  it.each([
    ['audio catalog id in a scene', 'src/scenes/X.ts', "import { audio } from '../core/audio-director';\naudio.sfx('sfx.shell.pop');\naudio.music('music.island');"],
    ['audio catalog paths inside content/', 'src/content/x.ts', "export const p = 'assets/audio/sfx/sfx.shell.pop.m4a';"],
    ['this.sound inside core/', 'src/core/x.ts', 'export class S { sound = { locked: false }; f() { return this.sound.locked; } }'],
    ['an unrelated .sound property in a scene', 'src/scenes/X.ts', 'export const o = { sound: true };\nexport const s = o.sound;'],
  ])('allows audio use: %s', async (_name, file, code) => {
    expect(await ruleIds(file, code)).toEqual([]);
  });

  it.each([
    ['scene-level pointerdown in Map', 'src/scenes/Map.ts', "export function f(s: { input: { on(e: string, fn: () => void): void } }) { s.input.on('pointerdown', () => undefined); }"],
    ['gameobjectup once in a game', 'src/games/pizza/scene.ts', "export function f(o: { once(e: string, fn: () => void): void }) { o.once('gameobjectup', () => undefined); }"],
    ['addEventListener pointermove in core', 'src/core/x.ts', "export function f(d: Document) { d.addEventListener('pointermove', () => undefined); }"],
    ['pointerupoutside via addListener in a scene', 'src/scenes/X.ts', "export function f(o: { addListener(e: string, fn: () => void): void }) { o.addListener('pointerupoutside', () => undefined); }"],
    ['Input.Events.POINTER_DOWN in a scene', 'src/scenes/X.ts', "import { Input } from 'phaser';\nexport const e = Input.Events.POINTER_DOWN;"],
    ['POINTER_UP in core', 'src/core/x.ts', "export const f = (E: { POINTER_UP: string }) => E.POINTER_UP;"],
    ['e.clientX in a scene', 'src/scenes/X.ts', 'export const f = (e: MouseEvent) => e.clientX;'],
    ['pageY in core', 'src/core/x.ts', 'export const f = (e: MouseEvent) => e.pageY;'],
    ['destructured clientY in a game', 'src/games/pizza/scene.ts', 'export const f = ({ clientY }: MouseEvent) => clientY;'],
  ])('bans raw pointer input: %s', async (_name, file, code) => {
    expect(await ruleIds(file, code)).toContain(SYNTAX);
  });

  it.each([
    ['pointerdown inside core/input', 'src/core/input/x.ts', "export function f(s: { input: { on(e: string, fn: () => void): void } }) { s.input.on('pointerdown', () => undefined); }"],
    ['clientX inside core/input', 'src/core/input/x.ts', 'export const f = (e: MouseEvent) => e.clientX + e.pageY;'],
    ['pointer events in a test', 'src/core/x.test.ts', "export function f(d: Document) { d.addEventListener('pointerdown', () => undefined); return (d as unknown as MouseEvent).clientX; }"],
    ['other events in a scene', 'src/scenes/X.ts', "export function f(s: { events: { on(e: string, fn: () => void): void } }) { s.events.on('shutdown', () => undefined); }"],
  ])('allows: %s', async (_name, file, code) => {
    expect(await ruleIds(file, code)).toEqual([]);
  });

  const GAME_FILE = 'src/games/ice-cream/IceCream.ts';
  it.each([
    ['this.scene.start', "export class G { scene = { start: (_k: string) => undefined }; f() { this.scene.start('Map'); } }"],
    ['this.scene.stop', 'export class G { scene = { stop: () => undefined }; f() { this.scene.stop(); } }'],
    ['this.scene.sleep', 'export class G { scene = { sleep: () => undefined }; f() { this.scene.sleep(); } }'],
    ['this.scene.wake', "export class G { scene = { wake: (_k: string) => undefined }; f() { this.scene.wake('Map'); } }"],
    ['this.scene.launch', "export class G { scene = { launch: (_k: string) => undefined }; f() { this.scene.launch('Hud'); } }"],
    ['this.scene.run', "export class G { scene = { run: (_k: string) => undefined }; f() { this.scene.run('Hud'); } }"],
    ['this.scene.switch', "export class G { scene = { switch: (_k: string) => undefined }; f() { this.scene.switch('Map'); } }"],
    ['this.scene.manager.start', "export class G { scene = { manager: { start: (_k: string) => undefined } }; f() { this.scene.manager.start('Map'); } }"],
    ['this.game.scene.stop', "export class G { game = { scene: { stop: (_k: string) => undefined } }; f() { this.game.scene.stop('Map'); } }"],
    ['scene.start on a local', "export const f = (scene: { start(k: string): void }) => scene.start('Map');"],
    ['this.load.image', "export class G { load = { image: (_k: string, _u: string) => undefined }; f() { this.load.image('k', 'u.png'); } }"],
    ['this.load alone', 'export class G { load = {}; f() { return this.load; } }'],
    ['x.load.start', 'export const f = (s: { load: { start(): void } }) => s.load.start();'],
  ])('bans in games: %s', async (_name, code) => {
    expect(await ruleIds(GAME_FILE, code)).toContain(SYNTAX);
  });

  it.each([
    ['this.scene.start in a scene', "export class S { scene = { start: (_k: string) => undefined }; f() { this.scene.start('Map'); } }"],
    ['this.scene.manager.start / sleep / wake in a scene', "export class S { scene = { manager: { start: (_k: string) => undefined }, sleep: () => undefined, wake: () => undefined }; f() { this.scene.manager.start('ice-cream'); this.scene.sleep(); this.scene.wake(); } }"],
    ['this.load.atlas + start in a scene', "export class S { load = { atlas: (_k: string, _p: string, _j: string) => undefined, start: () => undefined }; f() { this.load.atlas('k', 'p.png', 'j.json'); this.load.start(); } }"],
  ])('allows in scenes: %s', async (_name, code) => {
    expect(await ruleIds('src/scenes/Map.ts', code)).toEqual([]);
  });

  it('games keep the literal bans next to the navigation ban', async () => {
    const ids = await ruleIds(GAME_FILE, "export const c = '#FF0000';\nexport class G { scene = { start: (_k: string) => undefined }; f() { this.scene.start('Map'); } }");
    expect(ids.filter((id) => id === SYNTAX)).toHaveLength(2);
  });

  it('a game may call its own non-navigation members (input, cameras, tweens)', async () => {
    const code = 'export class G { input = { enabled: true }; cameras = { main: { setZoom: (_z: number) => undefined } }; f() { this.input.enabled = false; this.cameras.main.setZoom(1); } }';
    expect(await ruleIds(GAME_FILE, code)).toEqual([]);
  });

  it('the scenes/games block keeps its literal bans next to the pointer ban', async () => {
    const ids = await ruleIds('src/scenes/X.ts', "export const c = '#FF0000';\nexport const f = (e: MouseEvent) => e.clientX;");
    expect(ids.filter((id) => id === SYNTAX)).toHaveLength(2);
  });

  const STORAGE_RULES = ['no-restricted-globals', 'no-restricted-properties'];
  const storageHits = (ids: string[]) => ids.filter((id) => STORAGE_RULES.includes(id));

  it.each([
    ['localStorage.getItem in a scene', 'src/scenes/X.ts', "export const v = localStorage.getItem('k');"],
    ['window.localStorage in core', 'src/core/x.ts', 'export const s = window.localStorage;'],
    ['indexedDB.open in a game', 'src/games/pizza/scene.ts', "export const r = indexedDB.open('x');"],
    ['navigator.storage.persist in session-store', 'src/core/session-store.ts', 'export const p = navigator.storage.persist();'],
    ['bare sessionStorage in content', 'src/content/x.ts', 'export const s = sessionStorage;'],
  ])('bans storage outside core/progress-store: %s', async (_name, file, code) => {
    expect(storageHits(await ruleIds(file, code)).length).toBeGreaterThan(0);
  });

  it.each([
    ['localStorage.getItem', "export const v = localStorage.getItem('k');"],
    ['window.localStorage', 'export const s = window.localStorage;'],
    ['indexedDB.open', "export const r = indexedDB.open('x');"],
    ['navigator.storage.persist', 'export const p = navigator.storage.persist();'],
  ])('allows storage in core/progress-store: %s', async (_name, code) => {
    expect(storageHits(await ruleIds('src/core/progress-store.ts', code))).toEqual([]);
  });

  it.each([
    ['a scene', 'src/scenes/X.ts'],
    ['core', 'src/core/x.ts'],
    ['a game', 'src/games/pizza/scene.ts'],
  ])('allows navigator.userAgent in %s', async (_name, file) => {
    expect(await ruleIds(file, 'export const ua = navigator.userAgent;')).toEqual([]);
  });

  it.each([
    ['scene → Tokens facade, games, content', 'src/scenes/X.ts', "import { Tokens } from '../core/tokens';\nimport '../games/pizza/scene';\nimport '../content/types';\nexport const t = Tokens;"],
    ['game → own file, core, content', 'src/games/pizza/scene.ts', "import './helpers';\nimport { bus } from '../../core/bus';\nimport '../../content/games/pizza';\nexport const b = bus;"],
    ['content type import from core', 'src/content/x.ts', "import type { Bus } from '../core/bus';\nexport type B = Bus;"],
    ['allowed numbers in scenes', 'src/scenes/X.ts', 'export const a = [-1, 0, 1, 2, 0.5];\nexport const b = 2;'],
  ])('allows: %s', async (_name, file, code) => {
    expect(await ruleIds(file, code)).toEqual([]);
  });
});
