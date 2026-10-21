// Story 1.9: the HintDirector adapter with a fake scene clock, fake Bus and fake visuals.
import { describe, expect, it, vi } from 'vitest';
import { Bus } from './bus';
import { activeHint, createHint, speakerReplay, type HintQuestion, type HintSceneLike } from './hint-director';
import { createDropTarget } from './input/drop';
import { InputGuard } from './input/guard';
import { Tokens } from './tokens';

const T = Tokens.Timing;

function fakeScene(key = 'ice-cream') {
  const handlers = new Map<string, Set<() => void>>();
  const events: { cb: () => void; removed: boolean; delay: number; loop: boolean }[] = [];
  const scene: HintSceneLike & { emit(ev: string): void } = {
    scene: { key },
    events: {
      once: (ev: string, fn: () => void) => {
        let set = handlers.get(ev);
        if (!set) handlers.set(ev, (set = new Set()));
        const wrap = (): void => {
          set!.delete(wrap);
          fn();
        };
        set.add(wrap);
        (fn as { wrap?: () => void }).wrap = wrap;
      },
      off: (ev: string, fn: () => void) => {
        const w = (fn as { wrap?: () => void }).wrap;
        if (w) handlers.get(ev)?.delete(w);
      },
    },
    time: {
      addEvent: (cfg) => {
        const e = { cb: cfg.callback, removed: false, delay: cfg.delay, loop: cfg.loop };
        events.push(e);
        return { remove: () => void (e.removed = true) };
      },
    },
    emit: (ev: string) => {
      for (const fn of [...(handlers.get(ev) ?? [])]) fn();
    },
  };
  /** Advances the scene clock by `ms` (only live events fire). */
  const advance = (ms: number): void => {
    for (let t = 0; t < ms; t += T.hintTickMs) for (const e of events) if (!e.removed) e.cb();
  };
  return { scene, events, advance };
}

function setup() {
  const s = fakeScene();
  const bus = new Bus();
  let token = 0;
  const audio = {
    setPrompt: vi.fn(),
    say: vi.fn(() => ++token),
    replayPrompt: vi.fn(() => ++token),
    fadeOut: vi.fn(),
    sayChain: vi.fn((_ids: readonly string[]) => ++token),
  };
  const guard = new InputGuard();
  const visuals = { ring: vi.fn(), hand: vi.fn(), clearHand: vi.fn(), dim: vi.fn(), destroy: vi.fn() };
  const levels: number[] = [];
  bus.on('hint:level', ({ gameId, level }) => {
    expect(gameId).toBe('ice-cream');
    levels.push(level);
  });
  const hint = createHint(s.scene, { audio, bus, guard, visuals });
  const target = createDropTarget({ id: 'cone', circle: { x: 1, y: 1, r: 100 } }, guard);
  const ask = { object: {} };
  const other = { object: {} };
  const q: HintQuestion = { promptLineId: 'P', retryLineId: 'R', step: { correct: [ask], distractors: [other], target, action: 'drag' } };
  const end = (t: number): void => bus.emit('speech:ended', { token: t, completed: true });
  return { ...s, bus, audio, guard, visuals, levels, hint, target, ask, other, q, end };
}

describe('HintDirector adapter (Story 1.9)', () => {
  it('Story 5.3: questionDone fades the awaited prompt through createHint; after its end nothing fades', () => {
    const s = setup();
    s.hint.beginQuestion(s.q);
    const prompt = s.audio.say.mock.results.at(-1)?.value as number;
    s.hint.questionDone();
    expect(s.audio.fadeOut).toHaveBeenCalledWith(prompt);
    s.hint.beginQuestion(s.q);
    s.end(s.audio.say.mock.results.at(-1)?.value as number);
    s.hint.questionDone();
    expect(s.audio.fadeOut).toHaveBeenCalledTimes(1);
  });

  it('Story 5.7: a lead is passed through createHint as sayChain([lead, prompt]) and its token is awaited', () => {
    const s = setup();
    s.hint.beginQuestion({ ...s.q, leadLineId: 'L' });
    expect(s.audio.sayChain).toHaveBeenCalledExactlyOnceWith(['L', 'P']);
    expect(s.audio.say).not.toHaveBeenCalled();
    const chain = s.audio.sayChain.mock.results[0]?.value as number;
    s.advance(T.hintLevel2IdleMs * 2);
    expect(s.hint.level).toBe(0);
    s.end(chain);
    s.advance(T.hintLevel2IdleMs);
    expect(s.hint.level).toBe(2);
    s.hint.questionDone();
  });

  it('one looping tick event of hintTickMs while a question is active; removed by questionDone', () => {
    const s = setup();
    s.hint.beginQuestion(s.q);
    expect(s.events).toHaveLength(1);
    expect(s.events[0]).toMatchObject({ delay: T.hintTickMs, loop: true, removed: false });
    s.hint.questionDone();
    expect(s.events[0]!.removed).toBe(true);
  });

  it('speech:ended of the prompt starts the quiet clock; ticks escalate and emit hint:level with the scene key', () => {
    const s = setup();
    s.hint.beginQuestion(s.q);
    s.advance(T.hintLevel2IdleMs);
    expect(s.hint.level).toBe(0);
    s.end(1);
    s.advance(T.hintLevel2IdleMs);
    expect(s.hint.level).toBe(2);
    expect(s.levels).toEqual([2]);
    expect(s.visuals.ring).toHaveBeenLastCalledWith(s.ask);
  });

  it('ticks stop when the time event stops (scene paused): no escalation until it runs again', () => {
    const s = setup();
    s.hint.beginQuestion(s.q);
    s.end(1);
    s.hint.wrong();
    s.end(2);
    s.advance(3000);
    s.events[0]!.removed = true; // paused: Phaser stops the scene clock
    s.advance(30000);
    expect(s.hint.level).toBe(1);
    s.events[0]!.removed = false;
    s.advance(T.hintLevel2IdleMs - 3000);
    expect(s.hint.level).toBe(2);
  });

  it('SHUTDOWN restores pickable, snap scale and the visuals, and clears the active director', () => {
    const s = setup();
    s.hint.beginQuestion(s.q);
    s.end(1);
    for (let i = 0; i < 4; i++) s.hint.wrong();
    expect(s.guard.isPickable(s.other)).toBe(false);
    expect(s.target.circle()?.r).toBe(200);
    expect(activeHint()).toBe(s.hint);
    s.scene.emit('shutdown');
    expect(s.guard.isPickable(s.other)).toBe(true);
    expect(s.target.circle()?.r).toBe(100);
    expect(s.visuals.destroy).toHaveBeenCalled();
    expect(s.visuals.ring).toHaveBeenLastCalledWith(undefined);
    expect(s.events[0]!.removed).toBe(true);
    expect(activeHint()).toBeUndefined();
    expect(s.levels.at(-1)).toBe(0);
    // After shutdown the director is inert, and speech:ended no longer reaches it.
    s.hint.beginQuestion(s.q);
    expect(s.events).toHaveLength(1);
    expect(s.bus.listenerCount('speech:ended')).toBe(0);
  });

  it('speakerReplay: the active question replays its prompt; without one, audio.replayPrompt()', () => {
    const s = setup();
    const fallback = { replayPrompt: vi.fn(() => 42) };
    s.hint.beginQuestion(s.q);
    s.end(1);
    const tok = speakerReplay(fallback);
    expect(s.audio.replayPrompt).toHaveBeenCalledOnce();
    expect(s.audio.setPrompt).toHaveBeenLastCalledWith('P');
    expect(tok).toBe(2);
    expect(fallback.replayPrompt).not.toHaveBeenCalled();
    s.hint.questionDone();
    expect(speakerReplay(fallback)).toBe(42);
  });

  it('without a scene it speaks but has no clock (the base field before create)', () => {
    const audio = { setPrompt: vi.fn(), say: vi.fn(() => 1) };
    const hint = createHint(undefined, { audio });
    hint.beginQuestion({ promptLineId: 'P', retryLineId: 'R', step: { correct: [], distractors: [], target: null, action: 'drag' } });
    expect(audio.say).toHaveBeenCalledWith('P');
    hint.wrong();
    expect(audio.say).toHaveBeenLastCalledWith('R');
    hint.questionDone();
    expect(hint.replayPrompt()).toBeUndefined();
  });
});
