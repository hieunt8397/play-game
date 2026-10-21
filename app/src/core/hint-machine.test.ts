// Story 1.9: the HintMachine against a fake clock (every I/O matrix row and the AC 7/8 sequences).
import { describe, expect, it, vi } from 'vitest';
import { HintMachine, type HintItem, type HintQuestion, type HintStep } from './hint-machine';
import { createDropTarget } from './input/drop';
import { InputGuard } from './input/guard';
import { Tokens } from './tokens';

const T = Tokens.Timing;
const TICK = T.hintTickMs;

function item(name: string): HintItem & { name: string } {
  return { name, object: { name } };
}

function setup() {
  let token = 0;
  const said: { id: string; token: number }[] = [];
  const guard = new InputGuard();
  let dragging = false;
  const audio = {
    say: vi.fn((id: string) => {
      token += 1;
      said.push({ id, token });
      return token;
    }),
    setPrompt: vi.fn(),
    replayPrompt: vi.fn(() => {
      token += 1;
      said.push({ id: 'replay', token });
      return token;
    }),
    fadeOut: vi.fn(),
  };
  const visuals = { ring: vi.fn(), hand: vi.fn(), clearHand: vi.fn(), dim: vi.fn() };
  const levels: number[] = [];
  const m = new HintMachine({
    audio,
    guard: {
      setPickable: (o, on) => guard.setPickable(o, on),
      setSnapScale: (o, k) => guard.setSnapScale(o, k),
      isDragging: () => dragging,
    },
    visuals,
    emitLevel: (l) => levels.push(l),
  });
  const target = createDropTarget({ id: 'cone', circle: { x: 500, y: 400, r: 100 } }, guard);
  const ask = item('ask');
  const other = item('other');
  const step: HintStep = { correct: [ask], distractors: [other], target, action: 'drag' };
  const q: HintQuestion = { promptLineId: 'P0', retryLineId: 'R0', step };
  /** Ticks `ms` of scene time. */
  const run = (ms: number): void => {
    for (let t = 0; t < ms; t += TICK) m.tick(TICK);
  };
  /** The awaited utterance ends. */
  const end = (completed = true): void => {
    const a = m.awaitedToken;
    if (a !== undefined) m.speechEnded(a, completed);
  };
  const setDragging = (on: boolean): void => {
    dragging = on;
  };
  return { m, audio, said, visuals, levels, guard, target, ask, other, step, q, run, end, setDragging };
}

describe('HintMachine — voice and clocks', () => {
  it('Begin: setPrompt + say(ask); idle stays 0 until speech:ended of that token', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    expect(s.audio.setPrompt).toHaveBeenCalledWith('P0');
    expect(s.said).toEqual([{ id: 'P0', token: 1 }]);
    s.run(20000);
    expect(s.m.level).toBe(0);
    s.m.speechEnded(1);
    s.run(T.hintLevel2IdleMs - TICK);
    expect(s.m.level).toBe(0);
    s.run(TICK);
    expect(s.m.level).toBe(2);
  });

  it('Foreign token: ignored, the clock stays paused', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.m.speechEnded(9);
    s.run(20000);
    expect(s.m.level).toBe(0);
  });

  it('Cut prompt (completed false) also starts the clock', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end(false);
    s.run(T.hintLevel2IdleMs);
    expect(s.m.level).toBe(2);
  });

  it('1 wrong + 6 s: level 1 (retry voice), then 2 with ring', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end();
    s.m.wrong();
    expect(s.m.level).toBe(1);
    expect(s.said.at(-1)?.id).toBe('R0');
    s.run(3000); // the retry is still speaking: no quiet time
    s.end();
    s.run(T.hintLevel2IdleMs);
    expect(s.m.level).toBe(2);
    expect(s.levels).toEqual([1, 2]);
    expect(s.visuals.ring).toHaveBeenLastCalledWith(s.ask);
  });

  it('Idle only: level 2 after 6 s, level 3 after 6 s more with hand + retry voice', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end();
    s.run(T.hintLevel2IdleMs);
    expect(s.m.level).toBe(2);
    expect(s.visuals.hand).not.toHaveBeenCalled();
    s.run(T.hintLevel3ExtraIdleMs);
    expect(s.m.level).toBe(3);
    expect(s.visuals.hand).toHaveBeenCalledExactlyOnceWith(s.step);
    expect(s.said.at(-1)?.id).toBe('R0');
    s.end();
    s.run(60000);
    expect(s.m.level).toBe(3); // time never reaches 4
  });

  it('4 wrongs fast: 1→2→3→4, one retry voice, distractor dimmed + unpickable, cone snap ×2', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end();
    for (let i = 0; i < 4; i++) {
      s.m.wrong();
      s.run(700);
    }
    expect(s.levels).toEqual([1, 2, 3, 4]);
    expect(s.said.filter((x) => x.id === 'R0')).toHaveLength(1);
    expect(s.visuals.dim).toHaveBeenCalledExactlyOnceWith(s.other, true);
    expect(s.guard.isPickable(s.other)).toBe(false);
    expect(s.guard.isPickable(s.ask)).toBe(true);
    expect(s.target.circle()?.r).toBe(200);
    expect(s.visuals.hand).toHaveBeenCalledOnce();
  });

  it('Rate limit: a wrong within 10 s of the last hint voice is silent; after 10 s it speaks', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end();
    s.m.wrong();
    s.end();
    s.run(T.voiceRetryMinGapMs - TICK);
    s.m.wrong();
    expect(s.said.filter((x) => x.id === 'R0')).toHaveLength(1);
    s.run(TICK);
    s.m.wrong();
    expect(s.said.filter((x) => x.id === 'R0')).toHaveLength(2);
  });

  it('Level 3 loop: 60 s with no event → hand at 0, 15, 30, 45 s; voice at entry, 30 s, 60 s of quiet', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end();
    s.run(T.hintLevel2IdleMs + T.hintLevel3ExtraIdleMs);
    expect(s.m.level).toBe(3);
    const handAt: number[] = [];
    const voiceAt: number[] = [];
    let voices = s.said.filter((x) => x.id === 'R0').length;
    expect(voices).toBe(1);
    voiceAt.push(0);
    s.visuals.hand.mockClear();
    handAt.push(0);
    for (let t = TICK; t <= 60000; t += TICK) {
      // Hint voices end at once (quiet time = active time).
      s.end();
      s.m.tick(TICK);
      if (s.visuals.hand.mock.calls.length > 0) {
        handAt.push(t);
        s.visuals.hand.mockClear();
      }
      const n = s.said.filter((x) => x.id === 'R0').length;
      if (n > voices) {
        voiceAt.push(t);
        voices = n;
      }
    }
    expect(handAt.slice(0, 4)).toEqual([0, 15000, 30000, 45000]);
    expect(voiceAt.map((v) => Math.round(v / 1000))).toEqual([0, 30, 60]);
  });

  it('Hand while dragging: deferred until the drag ends', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end();
    s.run(T.hintLevel2IdleMs);
    s.setDragging(true);
    s.run(T.hintLevel3ExtraIdleMs);
    expect(s.m.level).toBe(3);
    expect(s.visuals.hand).not.toHaveBeenCalled();
    s.run(2000);
    expect(s.visuals.hand).not.toHaveBeenCalled();
    s.setDragging(false);
    s.run(TICK);
    expect(s.visuals.hand).toHaveBeenCalledOnce();
  });

  it('Speaker at level 3: prompt restarts with a new token; level and wrong count kept; idle waits for its end', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end();
    s.m.wrong();
    s.end();
    s.run(T.hintLevel2IdleMs + T.hintLevel3ExtraIdleMs);
    expect(s.m.level).toBe(3);
    s.end();
    const tok = s.m.replayPrompt();
    expect(s.audio.setPrompt).toHaveBeenLastCalledWith('P0');
    expect(s.audio.replayPrompt).toHaveBeenCalledOnce();
    expect(tok).toBe(s.said.at(-1)?.token);
    expect(s.m.level).toBe(3);
    // Wrong count unchanged: the next wrong lifts to max(3, 2) = 3, not 4.
    s.run(T.voiceRetryMinGapMs);
    s.m.wrong();
    expect(s.m.level).toBe(3);
    expect(s.levels.at(-1)).toBe(3);
  });

  it('Before a question: wrong, stepDone and replayPrompt are no-ops', () => {
    const s = setup();
    s.m.wrong();
    s.m.stepDone(s.step);
    expect(s.m.replayPrompt()).toBeUndefined();
    s.m.tick(TICK);
    expect(s.said).toEqual([]);
    expect(s.levels).toEqual([]);
  });

  it('beginQuestion while active runs questionDone first', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end();
    s.run(T.hintLevel2IdleMs);
    s.m.beginQuestion({ ...s.q, promptLineId: 'P1' });
    expect(s.levels).toEqual([2, 0]);
    expect(s.visuals.ring).toHaveBeenLastCalledWith(undefined);
    expect(s.said.at(-1)?.id).toBe('P1');
  });
});

describe('HintMachine — steps and restore', () => {
  it('stepDone plain: level kept, idle 0, ring re-targets', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end();
    s.run(T.hintLevel2IdleMs);
    const b = item('b');
    const s2: HintStep = { correct: [b], distractors: [], target: s.target, action: 'drag' };
    s.run(T.hintLevel3ExtraIdleMs - 1000);
    s.m.stepDone(s2);
    expect(s.m.level).toBe(2);
    expect(s.visuals.ring).toHaveBeenLastCalledWith(b);
    s.run(T.hintLevel3ExtraIdleMs - TICK);
    expect(s.m.level).toBe(2); // idle restarted at stepDone
    s.run(TICK);
    expect(s.m.level).toBe(3);
  });

  it('stepDone retry: a later wrong says the override', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end();
    s.m.stepDone(s.step, { retryLineId: 'X' });
    s.m.wrong();
    expect(s.said.at(-1)?.id).toBe('X');
  });

  it('stepDone prompt: says P, replay says P, the clock waits for P', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end();
    s.m.stepDone(s.step, { promptLineId: 'P' });
    expect(s.said.at(-1)?.id).toBe('P');
    expect(s.audio.setPrompt).toHaveBeenLastCalledWith('P');
    s.run(20000);
    expect(s.m.level).toBe(0);
    s.end();
    s.m.replayPrompt();
    expect(s.audio.setPrompt).toHaveBeenLastCalledWith('P');
  });

  it('stepDone at level 4 restores the old step, then dims the new one', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end();
    for (let i = 0; i < 4; i++) s.m.wrong();
    const d2 = item('d2');
    const s2: HintStep = { correct: [s.ask], distractors: [d2], target: null, action: 'drag' };
    s.m.stepDone(s2);
    expect(s.guard.isPickable(s.other)).toBe(true);
    expect(s.visuals.dim).toHaveBeenCalledWith(s.other, false);
    expect(s.guard.isPickable(d2)).toBe(false);
    expect(s.target.circle()?.r).toBe(100);
  });

  it('questionDone at level 4: ring, hand, dim restored; hint:level 0; overrides cleared', () => {
    const s = setup();
    const untouched = item('untouched');
    s.guard.setPickable(untouched, false);
    s.m.beginQuestion(s.q);
    s.end();
    s.m.stepDone(s.step, { retryLineId: 'X' });
    for (let i = 0; i < 4; i++) s.m.wrong();
    s.m.questionDone();
    expect(s.visuals.ring).toHaveBeenLastCalledWith(undefined);
    expect(s.visuals.clearHand).toHaveBeenCalled();
    expect(s.visuals.dim).toHaveBeenLastCalledWith(s.other, false);
    expect(s.guard.isPickable(s.other)).toBe(true);
    expect(s.guard.isPickable(untouched)).toBe(false);
    expect(s.target.circle()?.r).toBe(100);
    expect(s.levels.at(-1)).toBe(0);
    expect(s.m.level).toBe(0);
    s.m.beginQuestion(s.q);
    s.end();
    s.m.wrong();
    expect(s.said.at(-1)?.id).toBe('R0');
    expect(s.m.level).toBe(1);
  });

  it('questionDone at level 0 emits nothing', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.m.questionDone();
    expect(s.levels).toEqual([]);
  });

  it('Paused: no ticks → no escalation; resume continues where it stopped (AC: level 1, hidden 30 s)', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end();
    s.m.wrong();
    s.end();
    s.run(3000);
    // Hidden / overlay: no ticks for 30 s.
    expect(s.m.level).toBe(1);
    s.run(T.hintLevel2IdleMs - 3000 - TICK);
    expect(s.m.level).toBe(1);
    s.run(TICK);
    expect(s.m.level).toBe(2);
  });
});

describe('HintMachine — Story 3.1: a tap step on an item without onLiftChange (the pizza oven)', () => {
  it('stepDone to the oven tap step: prompt plays, ring then hand on the oven, retry is the override', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end();
    const oven: HintItem = { object: { name: 'oven' } };
    expect(oven.onLiftChange).toBeUndefined();
    const ovenStep: HintStep = { correct: [oven], distractors: [], target: null, action: 'tap' };
    s.m.stepDone(ovenStep, { promptLineId: 'BAKE', retryLineId: 'ENOUGH' });
    expect(s.said.at(-1)?.id).toBe('BAKE');
    s.end();
    s.run(T.hintLevel2IdleMs);
    expect(s.m.level).toBe(2);
    expect(s.visuals.ring).toHaveBeenLastCalledWith(oven);
    s.run(T.hintLevel3ExtraIdleMs);
    expect(s.m.level).toBe(3);
    expect(s.visuals.hand).toHaveBeenLastCalledWith(ovenStep);
    expect(s.said.at(-1)?.id).toBe('ENOUGH');
  });

  it('level 4 on the tap step: no distractor to dim and no target to scale', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end();
    const oven: HintItem = { object: { name: 'oven' } };
    s.m.stepDone({ correct: [oven], distractors: [], target: null, action: 'tap' }, { retryLineId: 'ENOUGH' });
    s.visuals.dim.mockClear();
    const snap = vi.spyOn(s.guard, 'setSnapScale');
    const pick = vi.spyOn(s.guard, 'setPickable');
    for (let i = 0; i < 4; i++) s.m.wrong();
    expect(s.m.level).toBe(4);
    expect(s.visuals.dim).not.toHaveBeenCalled();
    expect(pick).not.toHaveBeenCalled();
    expect(snap).not.toHaveBeenCalled();
    expect(s.said.filter((x) => x.id === 'ENOUGH')).toHaveLength(1);
  });
});

describe('HintMachine — Story 3.5 HintStep.focus', () => {
  it('level 2 rings the focus item; the hand still demonstrates correct[0] → target; questionDone removes the ring', () => {
    const s = setup();
    const shadow = item('shadow');
    const decoy = item('decoy-shadow');
    const step: HintStep = { correct: [s.ask], distractors: [decoy], target: s.target, action: 'drag', focus: shadow };
    s.m.beginQuestion({ promptLineId: 'P0', retryLineId: 'R0', step });
    s.end();
    s.run(T.hintLevel2IdleMs);
    expect(s.m.level).toBe(2);
    expect(s.visuals.ring).toHaveBeenLastCalledWith(shadow);
    s.run(T.hintLevel3ExtraIdleMs);
    expect(s.m.level).toBe(3);
    expect(s.visuals.hand).toHaveBeenLastCalledWith(step);
    expect(s.visuals.hand.mock.calls.at(-1)?.[0].correct[0]).toBe(s.ask);
    for (let i = 0; i < 4; i++) s.m.wrong();
    expect(s.m.level).toBe(4);
    expect(s.guard.isPickable(decoy)).toBe(false);
    expect(s.target.circle()?.r).toBe(100 * Tokens.ui.hintSnapScale);
    s.m.questionDone();
    expect(s.visuals.ring).toHaveBeenLastCalledWith(undefined);
    expect(s.guard.isPickable(decoy)).toBe(true);
    expect(s.target.circle()?.r).toBe(100);
  });

  it('stepDone at level ≥ 2 re-targets the ring to the new focus; without focus it is correct[0] (unchanged)', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end();
    s.run(T.hintLevel2IdleMs);
    expect(s.visuals.ring).toHaveBeenLastCalledWith(s.ask);
    const shadow = item('shadow');
    s.m.stepDone({ ...s.step, focus: shadow });
    expect(s.visuals.ring).toHaveBeenLastCalledWith(shadow);
    s.m.stepDone(s.step);
    expect(s.visuals.ring).toHaveBeenLastCalledWith(s.ask);
  });
});

describe('HintMachine — Story 5.3: answered prompts fade, input never waits', () => {
  it('questionDone while the prompt is awaited fades that token out', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.m.questionDone();
    expect(s.audio.fadeOut).toHaveBeenCalledTimes(1);
    expect(s.audio.fadeOut).toHaveBeenCalledWith(1);
  });

  it('questionDone after the prompt ended does not fade anything', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end();
    s.m.questionDone();
    expect(s.audio.fadeOut).not.toHaveBeenCalled();
  });

  it('questionDone while the retry line is awaited fades the retry token', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.end();
    s.m.wrong();
    const retry = s.said.at(-1)!;
    expect(retry.id).toBe('R0');
    s.m.questionDone();
    expect(s.audio.fadeOut).toHaveBeenCalledWith(retry.token);
  });

  it('a fadeOut that ends the line synchronously finds the question already reset (no re-entry)', () => {
    const s = setup();
    const seen: Array<number | undefined> = [];
    s.audio.fadeOut.mockImplementation((token: number) => {
      seen.push(s.m.awaitedToken);
      s.m.speechEnded(token, false);
    });
    s.m.beginQuestion(s.q);
    s.m.wrong();
    s.m.questionDone();
    expect(s.audio.fadeOut).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([undefined]);
    expect(s.m.level).toBe(0);
    // The machine is idle: ticks escalate nothing, and the next question starts cleanly.
    s.run(T.hintLevel2IdleMs * 2);
    expect(s.m.level).toBe(0);
    s.m.beginQuestion(s.q);
    expect(s.m.awaitedToken).toBe(s.said.at(-1)?.token);
  });

  it('a port without fadeOut is fine (optional)', () => {
    const s = setup();
    delete (s.audio as { fadeOut?: unknown }).fadeOut;
    s.m.beginQuestion(s.q);
    expect(() => s.m.questionDone()).not.toThrow();
  });

  it('no setPickable while a prompt is awaited (input is not blocked)', () => {
    const s = setup();
    const spy = vi.spyOn(s.guard, 'setPickable');
    s.m.beginQuestion(s.q);
    s.run(5000);
    expect(spy).not.toHaveBeenCalled();
    expect(s.m.awaitedToken).toBe(1);
  });

  it('escalation waits for speechEnded — a completed prompt', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.run(T.hintLevel2IdleMs * 2);
    expect(s.m.level).toBe(0);
    s.end(true);
    s.run(T.hintLevel2IdleMs);
    expect(s.m.level).toBe(2);
  });

  it('escalation waits for speechEnded — a cut prompt', () => {
    const s = setup();
    s.m.beginQuestion(s.q);
    s.run(T.hintLevel2IdleMs * 2);
    expect(s.m.level).toBe(0);
    s.end(false);
    s.run(T.hintLevel2IdleMs - TICK);
    expect(s.m.level).toBe(0);
    s.run(TICK);
    expect(s.m.level).toBe(2);
  });
});

describe('HintMachine — Story 5.7: the parent-invitation lead', () => {
  function withChain() {
    const s = setup();
    let token = 100;
    const chains: { ids: readonly string[]; token: number }[] = [];
    const sayChain = vi.fn((ids: readonly string[]) => {
      token += 1;
      chains.push({ ids, token });
      return token;
    });
    const m = new HintMachine({
      audio: { ...s.audio, sayChain },
      guard: { setPickable: () => undefined, setSnapScale: () => undefined, isDragging: () => false },
      visuals: s.visuals,
      emitLevel: (l) => s.levels.push(l),
    });
    const lead: HintQuestion = { ...s.q, leadLineId: 'L0' };
    const run = (ms: number): void => {
      for (let t = 0; t < ms; t += TICK) m.tick(TICK);
    };
    return { ...s, m, sayChain, chains, lead, run };
  }

  it('beginQuestion chains [lead, prompt] under one awaited token; the Speaker prompt stays prompt-only', () => {
    const s = withChain();
    s.m.beginQuestion(s.lead);
    expect(s.chains).toEqual([{ ids: ['L0', 'P0'], token: 101 }]);
    expect(s.audio.say).not.toHaveBeenCalled();
    expect(s.audio.setPrompt).toHaveBeenCalledWith('P0');
    expect(s.m.awaitedToken).toBe(101);
  });

  it('the quiet clock stays still until the chain token ends', () => {
    const s = withChain();
    s.m.beginQuestion(s.lead);
    s.run(T.hintLevel2IdleMs * 3);
    expect(s.m.level).toBe(0);
    s.m.speechEnded(101, false);
    s.run(T.hintLevel2IdleMs - TICK);
    expect(s.m.level).toBe(0);
    s.run(TICK);
    expect(s.m.level).toBe(2);
  });

  it('a replay plays the prompt only (never the lead)', () => {
    const s = withChain();
    s.m.beginQuestion(s.lead);
    s.m.replayPrompt();
    expect(s.sayChain).toHaveBeenCalledTimes(1);
    expect(s.said.at(-1)?.id).toBe('replay');
  });

  it('a step prompt never carries the lead', () => {
    const s = withChain();
    s.m.beginQuestion(s.lead);
    s.m.stepDone(s.step, { promptLineId: 'P1' });
    expect(s.sayChain).toHaveBeenCalledTimes(1);
    expect(s.said.at(-1)?.id).toBe('P1');
  });

  it('questionDone fades the whole chain token', () => {
    const s = withChain();
    s.m.beginQuestion(s.lead);
    s.m.questionDone();
    expect(s.audio.fadeOut).toHaveBeenCalledWith(101);
  });

  it('a question without a lead plays its prompt with say (no chain)', () => {
    const s = withChain();
    s.m.beginQuestion(s.q);
    expect(s.sayChain).not.toHaveBeenCalled();
    expect(s.said).toEqual([{ id: 'P0', token: 1 }]);
  });

  it('without sayChain only the prompt plays (the lead is dropped)', () => {
    const s = setup();
    s.m.beginQuestion({ ...s.q, leadLineId: 'L0' });
    expect(s.said).toEqual([{ id: 'P0', token: 1 }]);
    expect(s.m.awaitedToken).toBe(1);
  });
});
