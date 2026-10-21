// HintDirector (AD-5, NFR4; Story 1.8 API, Story 1.9 behaviour). A game reports each question and its
// outcome here and never plays a prompt or retry line itself, never runs a hint timer and never draws
// a hint. The decisions live in the pure `HintMachine` (hint-machine.ts); this adapter wires it to:
//   - the scene's pausable clock: one looping `time.addEvent` of Timing.hintTickMs while a question is
//     active (scene pause and a hidden page stop it, so hint time resumes where it stopped);
//   - `speech:ended` through `bus.scoped(scene)` (the awaited token pauses the quiet clock);
//   - `core/hint-visuals` (ring follow + bob, hand demo, dim), the InputGuard (unpick, snap ×2) and
//     `hint:level { gameId: scene key, level }`.
// One module-level active director serves the Hud Speaker (`speakerReplay`). Scene SHUTDOWN ends the
// question and restores everything it changed.
import type { GameId, HintLevel } from '../content/types';
import { audio as audioDirector } from './audio-director';
import { bus as globalBus, SCENE_SHUTDOWN, type Bus, type SceneLike } from './bus';
import { HintMachine, type HintPorts, type HintQuestion, type HintStep, type HintVisualsPort, type StepLines } from './hint-machine';
import { createHintVisuals, type HintVisuals } from './hint-visuals';
import { inputGuard } from './input/guard';
import { prefersReducedMotion } from './reduced-motion';
import { Tokens } from './tokens';

export type { HintAction, HintItem, HintQuestion, HintStep } from './hint-machine';

export interface Hint {
  beginQuestion(q: HintQuestion): void;
  /** The current step is done; `next` is the following one (multi-step questions, Story 1.10). */
  stepDone(next: HintStep | null, lines?: StepLines): void;
  /** A wrong attempt: the retry voice (rate-limited) and the escalation. */
  wrong(): void;
  questionDone(): void;
  /** Replays the current prompt from the start (the Speaker); `undefined` with no active question. */
  replayPrompt(): number | undefined;
  readonly level: HintLevel;
}

/** The audio slice the hint system uses. */
export interface HintAudio {
  setPrompt(id: string): void;
  say(id: string): number;
  replayPrompt?(): number | undefined;
  /** Story 5.3: fades an awaited prompt out once the question is done. */
  fadeOut?(token: number): void;
  /** Story 5.7: the parent-invitation lead and the first prompt under one token. */
  sayChain?(ids: readonly string[]): number;
}

/** The slice of a scene's clock the adapter uses. */
export interface HintTimeEvent {
  remove(dispatchCallback?: boolean): void;
}

export interface HintSceneLike extends SceneLike {
  readonly time: { addEvent(cfg: { delay: number; loop: boolean; callback: () => void }): HintTimeEvent };
  readonly scene?: { readonly key: string };
}

export interface HintDeps {
  readonly audio: HintAudio;
  readonly guard?: HintPorts['guard'];
  readonly bus?: Bus;
  /** Visuals (tests); default `createHintVisuals(scene)` for a real scene, nothing without one. */
  readonly visuals?: HintVisualsPort & { destroy?(): void };
}

const NO_VISUALS: HintVisualsPort = { ring: () => undefined, hand: () => undefined, clearHand: () => undefined, dim: () => undefined };

let activeDirector: Hint | undefined;

/** The director of the active question, if any (tests, Hud). */
export function activeHint(): Hint | undefined {
  return activeDirector;
}

/** The Speaker: the active question's prompt, else the AudioDirector's stored prompt. */
export function speakerReplay(audio: { replayPrompt(): number | undefined } = audioDirector): number | undefined {
  return activeDirector?.replayPrompt() ?? audio.replayPrompt();
}

function isRealScene(scene: unknown): scene is Parameters<typeof createHintVisuals>[0] {
  return typeof scene === 'object' && scene !== null && 'add' in scene && 'tweens' in scene;
}

function reducedMotion(): boolean {
  return typeof window === 'undefined' ? false : prefersReducedMotion(window);
}

/** The hint system of a game scene (`MiniGameBase.hint`). Without a scene it only speaks (no clock). */
export function createHint(scene: HintSceneLike | undefined, deps: HintDeps = { audio: audioDirector }): Hint {
  const visuals: HintVisualsPort & { destroy?(): void } =
    deps.visuals ?? (isRealScene(scene) ? (createHintVisuals(scene, { reduced: reducedMotion() }) as HintVisuals) : NO_VISUALS);
  const gameId = scene?.scene?.key as GameId | undefined;
  const bus = deps.bus ?? globalBus;
  const machine = new HintMachine({
    audio: {
      say: (id) => deps.audio.say(id),
      setPrompt: (id) => deps.audio.setPrompt(id),
      ...(deps.audio.replayPrompt ? { replayPrompt: () => deps.audio.replayPrompt!() } : {}),
      ...(deps.audio.fadeOut ? { fadeOut: (token: number) => deps.audio.fadeOut!(token) } : {}),
      ...(deps.audio.sayChain ? { sayChain: (ids: readonly string[]) => deps.audio.sayChain!(ids) } : {}),
    },
    guard: deps.guard ?? inputGuard,
    visuals,
    emitLevel: (level) => {
      if (gameId) bus.emit('hint:level', { gameId, level });
    },
  });
  let tick: HintTimeEvent | undefined;
  let closed = false;

  const stopTick = (): void => {
    tick?.remove(false);
    tick = undefined;
  };

  const hint: Hint = {
    beginQuestion(q) {
      if (closed) return;
      machine.beginQuestion(q);
      activeDirector = hint;
      if (!tick && scene) {
        const ms = Tokens.Timing.hintTickMs;
        tick = scene.time.addEvent({ delay: ms, loop: true, callback: () => machine.tick(ms) });
      }
    },
    stepDone(next, lines) {
      machine.stepDone(next, lines);
    },
    wrong() {
      machine.wrong();
    },
    questionDone() {
      machine.questionDone();
      stopTick();
      if (activeDirector === hint) activeDirector = undefined;
    },
    replayPrompt() {
      return machine.replayPrompt();
    },
    get level() {
      return machine.level;
    },
  };

  if (scene) {
    bus.scoped(scene).on('speech:ended', ({ token, completed }) => machine.speechEnded(token, completed));
    scene.events.once(SCENE_SHUTDOWN, () => {
      // Visuals first: the restore then sets alpha directly instead of tweening on a closing scene.
      visuals.destroy?.();
      hint.questionDone();
      closed = true;
    });
  }
  return hint;
}
