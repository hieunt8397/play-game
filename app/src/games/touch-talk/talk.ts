// Chạm là nói controller (Stories 4.5, 4.6), pure and Phaser-free: free taps on a scene's props, each
// with its sound at once and its name a moment later; never a request, never right or wrong. Behind
// injected ports (audio, view) so every rule is node-testable; the scene clock drives `tick`.
// - tap(id): bounce + sound now; the prop joins the distinct-touched set (kept in the snapshot; it never
//   grants anything, parent decision 2026-10-21); the idle clock restarts; its name waits
//   `nameDelayMs` unless it is the prop being named or already waiting (a newer tap replaces a waiting name).
// - tick(dt): the waiting name is said (setPrompt + say) when its wait runs out; after `idleWiggleMs`
//   without a tap one prop of the current scene wiggles silently (never the same one twice in a row);
//   Story 4.6: a scene slide counts down, and props are not tappable until it ends.
// - sceneTap(i) (Story 4.6): the same scene says its name again (unless it is already speaking); another
//   one drops a waiting prop name, slides there and says its name.
// It never touches the Bus, hints, tallies or the round end.
import type { TouchTalkScene } from '../../content/games/touch-talk.ts';
import { Tokens } from '../../core/tokens.ts';

export interface TalkAudio {
  sfx(id: string): void;
  /** Returns the utterance token (speech:ended carries it). */
  say(id: string): number;
  setPrompt(id: string): void;
}

export interface TalkView {
  bounce(id: string): void;
  wiggle(id: string): void;
  /** Story 4.6: slide from scene `from` to scene `to`. */
  slide?(from: number, to: number): void;
}

export interface TalkTimings {
  readonly nameDelayMs: number;
  readonly idleWiggleMs: number;
  readonly slideMs: number;
  readonly maxDtMs: number;
}

export function defaultTalkTimings(): TalkTimings {
  const t = Tokens.Timing;
  return { nameDelayMs: t.touchTalkNameDelayMs, idleWiggleMs: t.touchTalkIdleWiggleMs, slideMs: t.touchTalkSceneSlideMs, maxDtMs: t.touchTalkMaxTickMs };
}

export interface TalkResume {
  readonly sceneIndex: number;
  readonly touchedIds: readonly string[];
}

export interface TalkOptions {
  readonly scenes: readonly TouchTalkScene[];
  readonly rng: () => number;
  readonly resume?: TalkResume | null;
  readonly audio: TalkAudio;
  readonly view: TalkView;
  readonly timings?: Partial<TalkTimings>;
}

export interface TalkProgress {
  readonly questionIndex: number;
  readonly partial: { readonly sceneId: string; readonly touchedIds: string[] };
}

export interface TalkController {
  readonly current: number;
  start(): void;
  /** True when prop `id` belongs to the current scene and no slide runs. */
  isActive(id: string): boolean;
  tap(id: string): void;
  /** Any press (background and Hud too): the idle clock restarts. */
  anyTap(): void;
  sceneTap(i: number): void;
  tick(dtMs: number): void;
  speechEnded(token: number): void;
  progress(): TalkProgress;
}

export function createTalkController(opts: TalkOptions): TalkController {
  const t = { ...defaultTalkTimings(), ...opts.timings };
  const scenes = opts.scenes;
  const { audio, view } = opts;
  let current = opts.resume ? opts.resume.sceneIndex : 0;
  const touched = new Set<string>(opts.resume?.touchedIds ?? []);
  let pending: { id: string; msLeft: number } | null = null;
  let speaking: { id: string; token: number } | null = null;
  let sceneSpeaking: number | null = null;
  let idleMs = 0;
  let lastWiggled: string | null = null;
  let slideMsLeft = 0;

  const scene = (): TouchTalkScene => scenes[current]!;
  const findProp = (id: string) => scene().props.find((p) => p.id === id);
  const sayLine = (line: string): number => {
    audio.setPrompt(line);
    return audio.say(line);
  };

  return {
    get current() {
      return current;
    },
    start() {
      audio.setPrompt(scene().nameLineId);
    },
    isActive(id) {
      return slideMsLeft <= 0 && findProp(id) !== undefined;
    },
    tap(id) {
      if (!this.isActive(id)) return;
      const prop = findProp(id)!;
      view.bounce(id);
      audio.sfx(prop.sfxId);
      touched.add(id);
      idleMs = 0;
      if (speaking?.id === id || pending?.id === id) return;
      pending = { id, msLeft: t.nameDelayMs };
    },
    anyTap() {
      idleMs = 0;
    },
    sceneTap(i) {
      if (slideMsLeft > 0 || i < 0 || i >= scenes.length) return;
      idleMs = 0;
      if (i === current) {
        if (sceneSpeaking === null) sceneSpeaking = sayLine(scene().nameLineId);
        return;
      }
      pending = null;
      view.slide?.(current, i);
      current = i;
      slideMsLeft = t.slideMs;
      lastWiggled = null;
      sceneSpeaking = sayLine(scene().nameLineId);
    },
    tick(dtMs) {
      const dt = Math.max(0, Math.min(t.maxDtMs, Number.isFinite(dtMs) ? dtMs : 0));
      if (slideMsLeft > 0) slideMsLeft -= dt;
      if (pending) {
        pending.msLeft -= dt;
        if (pending.msLeft <= 0) {
          const id = pending.id;
          pending = null;
          const prop = findProp(id);
          if (prop) speaking = { id, token: sayLine(prop.nameLineId) };
        }
      }
      idleMs += dt;
      if (idleMs >= t.idleWiggleMs) {
        idleMs = 0;
        const pool = scene().props.filter((p) => p.id !== lastWiggled);
        if (pool.length > 0) {
          const pick = pool[Math.floor(opts.rng() * pool.length)]!.id;
          lastWiggled = pick;
          view.wiggle(pick);
        }
      }
    },
    speechEnded(token) {
      if (speaking?.token === token) speaking = null;
      if (sceneSpeaking === token) sceneSpeaking = null;
    },
    progress() {
      return { questionIndex: current, partial: { sceneId: scene().id, touchedIds: [...touched] } };
    },
  };
}

/**
 * The resume a snapshot allows, or null: `partial.sceneId` must be `scenes[questionIndex].id` and
 * `touchedIds` distinct known prop ids (of every scene).
 */
export function resumeTalk(resumeAt: { readonly questionIndex: number; readonly partial?: unknown } | null, scenes: readonly TouchTalkScene[]): TalkResume | null {
  if (!resumeAt) return null;
  const i = resumeAt.questionIndex;
  const s = Number.isInteger(i) ? scenes[i] : undefined;
  const p = resumeAt.partial;
  if (!s || typeof p !== 'object' || p === null || Array.isArray(p)) return null;
  const { sceneId, touchedIds } = p as { sceneId?: unknown; touchedIds?: unknown };
  if (sceneId !== s.id || !Array.isArray(touchedIds)) return null;
  const known = new Set(scenes.flatMap((sc) => sc.props.map((pr) => pr.id)));
  if (!touchedIds.every((id): id is string => typeof id === 'string' && known.has(id))) return null;
  if (new Set(touchedIds).size !== touchedIds.length) return null;
  return { sceneIndex: i, touchedIds: [...touchedIds] };
}
