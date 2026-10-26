import { describe, expect, it, vi } from 'vitest';
import type { RoundOutcome } from '../content/types';
import { chainAnimMs, keepAbandonSnapshot, PostRoundChain, routeChainEnd, routeRoundAbandon, routeRoundComplete, routeRoundLeave, routeRoundNext, type ChainDeps, type ChainFinish } from './post-round-chain';
import { ProgressStoreService } from './progress-store';
import { SessionStore } from './session-store';
import { Timing } from './timing';

/** Lets every pending promise callback run. */
const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

const PERFECT: RoundOutcome = { gameId: 'ice-cream', questions: 4, firstTryCorrect: 4, maxHintLevel: 0 };

/** How long the fake camera pull-back takes in `timed` mode (scene clock). */
const PULL_MS = Timing.cameraPullBackMs;

/**
 * Fake deps on a fake scene clock: stopGameAndWake and pullBack resolve when the test says so, at
 * once with `auto`, or (pullBack, with `timed`) after PULL_MS of scene time on `advance`.
 */
function harness(opts: { auto?: boolean; timed?: boolean } = {}) {
  let clock = 0;
  let timers: { at: number; fn: () => void }[] = [];
  const calls: string[] = [];
  const session = new SessionStore();
  const ends: ChainFinish[] = [];
  const logs: string[] = [];
  const warns: string[] = [];
  let wake: () => void = () => {};
  let pulled: () => void = () => {};

  const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      timers.push({ at: clock + ms, fn: resolve });
    });

  const deps: ChainDeps = {
    setDifficulty: vi.fn((id, l) => calls.push(`setDifficulty ${id} ${l}`)),
    clearResume: vi.fn((id) => {
      calls.push(`clearResume ${id}`);
      session.clearResume(id);
    }),
    ladderLength: (id) => (id === 'ice-cream' ? 4 : id === 'touch-talk' ? undefined : 5),
    stopGameAndWake: vi.fn(() => {
      calls.push('stopGameAndWake');
      return opts.auto || opts.timed ? Promise.resolve() : new Promise<void>((r) => (wake = r));
    }),
    pullBack: vi.fn(async (focus) => {
      calls.push(`pullBack ${focus}`);
      if (opts.timed) {
        await wait(PULL_MS);
        calls.push(`pulled ${focus}`);
        return;
      }
      if (!opts.auto) await new Promise<void>((r) => (pulled = r));
    }),
    end: vi.fn((e: ChainFinish) => {
      calls.push(`end ${e.kind}`);
      ends.push(e);
    }),
    now: () => clock,
    log: (line) => logs.push(line),
    warn: (msg) => warns.push(msg),
  };

  let paused = false;

  /**
   * Advances the fake scene clock in timer order, flushing promise callbacks after each timer. While
   * paused (scene.pause()) frames go by but the scene clock does not move.
   */
  async function advance(ms: number): Promise<void> {
    if (paused) {
      await flush();
      return;
    }
    const target = clock + ms;
    await flush();
    for (;;) {
      const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((t) => t !== due);
      clock = due.at;
      due.fn();
      await flush();
    }
    clock = target;
    await flush();
  }

  return {
    deps,
    chain: new PostRoundChain(deps),
    session,
    calls,
    ends,
    logs,
    warns,
    advance,
    pause: () => void (paused = true),
    resume: () => void (paused = false),
    sceneTime: () => clock,
    wake: async () => {
      wake();
      await flush();
    },
    pulled: async () => {
      pulled();
      await flush();
    },
  };
}

describe('PostRoundChain › complete', () => {
  it('L1, 4/4 first try: setDifficulty + clearResume synchronously, then the exact order 1 → 5 (no gift step)', async () => {
    const h = harness();
    h.session.resume['ice-cream'] = { v: 1, level: 1, seed: 1, questionIndex: 0, partial: { placed: [] } };
    const p = h.chain.start({ kind: 'complete', gameId: 'ice-cream', outcome: PERFECT, startedLevel: 1 });
    // Steps 1–3 ran before `start` returned its promise.
    expect(h.calls).toEqual(['setDifficulty ice-cream 2', 'clearResume ice-cream', 'stopGameAndWake']);
    expect(h.session.resume).toEqual({});
    expect(h.chain.active).toBe(true);
    await flush();
    expect(h.deps.pullBack).not.toHaveBeenCalled();
    await h.wake();
    expect(h.calls.at(-1)).toBe('pullBack ice-cream');
    expect(h.deps.end).not.toHaveBeenCalled();
    await h.pulled();
    await p;
    expect(h.calls).toEqual(['setDifficulty ice-cream 2', 'clearResume ice-cream', 'stopGameAndWake', 'pullBack ice-cream', 'end complete']);
    expect(h.ends).toEqual([{ kind: 'complete', gameId: 'ice-cream', queuedStation: undefined }]);
    expect(h.chain.active).toBe(false);
  });

  it('the level written comes from nextLevel (−1 after full help; clamped at the ladder top)', () => {
    const a = harness({ auto: true });
    void a.chain.start({ kind: 'complete', gameId: 'ice-cream', outcome: { ...PERFECT, firstTryCorrect: 2, maxHintLevel: 4 }, startedLevel: 2 });
    expect(a.deps.setDifficulty).toHaveBeenCalledWith('ice-cream', 1);
    const b = harness({ auto: true });
    void b.chain.start({ kind: 'complete', gameId: 'ice-cream', outcome: PERFECT, startedLevel: 3 });
    expect(b.deps.setDifficulty).toHaveBeenCalledWith('ice-cream', 3);
  });

  it('writes through a real ProgressStore before the first await', () => {
    const store = new ProgressStoreService();
    const h = harness({ auto: true });
    h.deps.setDifficulty = (id, l) => store.setDifficulty(id, l);
    const chain = new PostRoundChain(h.deps);
    void chain.start({ kind: 'complete', gameId: 'ice-cream', outcome: PERFECT, startedLevel: 0 });
    expect(store.getDifficulty('ice-cream', 4)).toBe(1);
  });

  it('dev timing log: post-round: <kind> <gameId> → onChainEnd <ms> ms', async () => {
    const h = harness({ timed: true });
    const p = h.chain.start({ kind: 'complete', gameId: 'ice-cream', outcome: PERFECT, startedLevel: 0 });
    await h.advance(PULL_MS);
    await p;
    expect(h.logs).toEqual([`post-round: complete ice-cream → onChainEnd ${PULL_MS} ms`]);
  });
});

describe('PostRoundChain › taps, re-entry, failures', () => {
  it('queued taps: pizza then ice-cream mid-chain → only ice-cream reaches end', async () => {
    const h = harness();
    h.chain.queueTap('pizza'); // before start: not queued
    const p = h.chain.start({ kind: 'complete', gameId: 'ice-cream', outcome: PERFECT, startedLevel: 0 });
    await h.wake();
    h.chain.queueTap('pizza');
    h.chain.queueTap('ice-cream');
    expect(h.chain.queuedStation).toBe('ice-cream');
    await h.pulled();
    await p;
    expect(h.ends).toEqual([{ kind: 'complete', gameId: 'ice-cream', queuedStation: 'ice-cream' }]);
    expect(h.chain.queuedStation).toBeUndefined();
  });

  it('a second start while active warns and is ignored', async () => {
    const h = harness();
    const p = h.chain.start({ kind: 'complete', gameId: 'ice-cream', outcome: PERFECT, startedLevel: 0 });
    await h.chain.start({ kind: 'complete', gameId: 'pizza', outcome: { ...PERFECT, gameId: 'pizza' }, startedLevel: 0 });
    expect(h.warns).toHaveLength(1);
    expect(h.deps.stopGameAndWake).toHaveBeenCalledTimes(1);
    expect(h.deps.setDifficulty).toHaveBeenCalledTimes(1);
    await h.wake();
    await h.pulled();
    await p;
    expect(h.ends).toHaveLength(1);
    // A new chain may start once the first one ended.
    void h.chain.start({ kind: 'complete', gameId: 'pizza', outcome: { ...PERFECT, gameId: 'pizza' }, startedLevel: 0 });
    expect(h.deps.stopGameAndWake).toHaveBeenCalledTimes(2);
  });

  it('a failing pull-back warns and the chain still ends', async () => {
    const h = harness({ auto: true });
    h.deps.pullBack = vi.fn(() => Promise.reject(new Error('boom')));
    await new PostRoundChain(h.deps).start({ kind: 'complete', gameId: 'ice-cream', outcome: PERFECT, startedLevel: 0 });
    expect(h.warns).toHaveLength(1);
    expect(h.ends).toHaveLength(1);
  });

  it('pause: no progress while the scene is paused; it continues from the same point after resume', async () => {
    const h = harness({ timed: true });
    const p = h.chain.start({ kind: 'complete', gameId: 'ice-cream', outcome: PERFECT, startedLevel: 0 });
    await h.advance(PULL_MS / 2);
    expect(h.sceneTime()).toBe(PULL_MS / 2);
    h.pause();
    await h.advance(PULL_MS * 10);
    expect(h.sceneTime()).toBe(PULL_MS / 2);
    expect(h.calls).not.toContain('pulled ice-cream');
    expect(h.deps.end).not.toHaveBeenCalled();
    expect(h.chain.active).toBe(true);
    h.resume();
    await h.advance(PULL_MS / 2 - 1);
    expect(h.calls).not.toContain('pulled ice-cream');
    await h.advance(1);
    await p;
    expect(h.sceneTime()).toBe(PULL_MS);
    expect(h.calls.slice(-2)).toEqual(['pulled ice-cream', 'end complete']);
  });

  it('kill mid-pull-back: the level is already written; after a reload it is the new one', async () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    const store = new ProgressStoreService();
    await store.init({ storage, persist: async () => true });
    const h = harness({ timed: true });
    h.deps.setDifficulty = (id, l) => store.setDifficulty(id, l);
    void new PostRoundChain(h.deps).start({ kind: 'complete', gameId: 'ice-cream', outcome: PERFECT, startedLevel: 1 });
    await h.advance(PULL_MS / 2);
    // The app dies here: the pull-back never finishes, so the chain never ends.
    expect(h.deps.end).not.toHaveBeenCalled();

    const reloaded = new ProgressStoreService();
    await reloaded.init({ storage, persist: async () => true });
    expect(reloaded.getDifficulty('ice-cream', 4)).toBe(2);
    expect(reloaded.state).toEqual({ schemaVersion: 4, difficulty: { 'ice-cream': 2 }, outfit: {} });
  });
});

describe('PostRoundChain › complete without its data', () => {
  it.each([
    ['no outcome', { startedLevel: 1 }],
    ['no started level', { outcome: PERFECT }],
  ])('%s: warns, writes no difficulty, still clears resume and runs', async (_name, extra) => {
    const h = harness({ auto: true });
    await h.chain.start({ kind: 'complete', gameId: 'ice-cream', ...extra });
    expect(h.deps.setDifficulty).not.toHaveBeenCalled();
    expect(h.warns).toHaveLength(1);
    expect(h.deps.clearResume).toHaveBeenCalledWith('ice-cream');
    expect(h.ends).toHaveLength(1);
  });

  it('an unknown ladder warns and writes no difficulty', async () => {
    const h = harness({ auto: true });
    await h.chain.start({ kind: 'complete', gameId: 'touch-talk', outcome: { ...PERFECT, gameId: 'touch-talk' }, startedLevel: 0 });
    expect(h.deps.setDifficulty).not.toHaveBeenCalled();
    expect(h.warns).toEqual([expect.stringContaining('ladder')]);
  });
});

describe('PostRoundChain › settle (Story 5.8 free play)', () => {
  it('settle writes difficulty and clears resume at once; the chain does not run', () => {
    const h = harness({ auto: true });
    h.chain.settle({ kind: 'complete', gameId: 'ice-cream', outcome: PERFECT, startedLevel: 1 });
    expect(h.calls).toEqual(['setDifficulty ice-cream 2', 'clearResume ice-cream']);
    expect(h.chain.active).toBe(false);
    expect(h.deps.stopGameAndWake).not.toHaveBeenCalled();
    expect(h.ends).toHaveLength(0);
  });

  it('the leave start of a settled game skips steps 1–2 (no warning) and runs the rest', async () => {
    const h = harness({ auto: true });
    h.chain.settle({ kind: 'complete', gameId: 'ice-cream', outcome: PERFECT, startedLevel: 1 });
    await h.chain.start({ kind: 'complete', gameId: 'ice-cream' });
    expect(h.calls).toEqual(['setDifficulty ice-cream 2', 'clearResume ice-cream', 'stopGameAndWake', 'pullBack ice-cream', 'end complete']);
    expect(h.warns).toEqual([]);
  });

  it('settled is forgotten after one start: a later complete start without data warns again', async () => {
    const h = harness({ auto: true });
    h.chain.settle({ kind: 'complete', gameId: 'ice-cream', outcome: PERFECT, startedLevel: 1 });
    await h.chain.start({ kind: 'complete', gameId: 'ice-cream' });
    await h.chain.start({ kind: 'complete', gameId: 'ice-cream' });
    expect(h.warns).toEqual([expect.stringContaining('difficulty unchanged')]);
  });

  it('a leave start for a game that was not settled warns "difficulty unchanged" and still runs', async () => {
    const h = harness({ auto: true });
    h.chain.settle({ kind: 'complete', gameId: 'pizza', outcome: { ...PERFECT, gameId: 'pizza' }, startedLevel: 0 });
    await h.chain.start({ kind: 'complete', gameId: 'ice-cream' });
    expect(h.warns).toEqual([expect.stringContaining('difficulty unchanged')]);
    expect(h.deps.clearResume).toHaveBeenCalledWith('ice-cream');
    expect(h.ends).toHaveLength(1);
  });
});

describe('Map terminal-event routing', () => {
  const running = { id: 'ice-cream' as const, level: 1 };

  it('round:complete of the running game → settle (Story 5.8) carrying the outcome and the started level', () => {
    expect(routeRoundComplete(running, PERFECT)).toEqual({
      action: 'settle',
      start: { kind: 'complete', gameId: 'ice-cream', outcome: PERFECT, startedLevel: 1 },
    });
  });

  it('round:complete of another game, or with no running game → nothing', () => {
    expect(routeRoundComplete({ id: 'pizza', level: 0 }, PERFECT)).toEqual({ action: 'ignore' });
    expect(routeRoundComplete(undefined, PERFECT)).toEqual({ action: 'ignore' });
  });

  it('round:leave of the running game → a complete chain (no outcome: steps 1–2 ran at settle)', () => {
    expect(routeRoundLeave(running, 'ice-cream', false)).toEqual({ action: 'chain', start: { kind: 'complete', gameId: 'ice-cream' } });
  });

  it('round:leave with a chain already running → the fade return', () => {
    expect(routeRoundLeave(running, 'ice-cream', true)).toEqual({ action: 'fade', gameId: 'ice-cream' });
  });

  it('round:leave of another game, or with no running game → nothing', () => {
    expect(routeRoundLeave(running, 'pizza', false)).toEqual({ action: 'ignore' });
    expect(routeRoundLeave(undefined, 'ice-cream', false)).toEqual({ action: 'ignore' });
  });

  it('round:next of the running game → restart in place (seamless play 2026-10-21)', () => {
    expect(routeRoundNext(running, 'ice-cream', false)).toEqual({ action: 'restart', gameId: 'ice-cream' });
  });

  it('a late round:next (a chain running, another game, none running) → nothing', () => {
    expect(routeRoundNext(running, 'ice-cream', true)).toEqual({ action: 'ignore' });
    expect(routeRoundNext(running, 'pizza', false)).toEqual({ action: 'ignore' });
    expect(routeRoundNext(undefined, 'ice-cream', false)).toEqual({ action: 'ignore' });
  });

  it('round:abandon of the running game → the fade return (no gift chain)', () => {
    expect(routeRoundAbandon(running, 'ice-cream')).toEqual({ action: 'fade', gameId: 'ice-cream' });
  });

  it('round:abandon of another game, or with no running game → nothing', () => {
    expect(routeRoundAbandon(running, 'pizza')).toEqual({ action: 'ignore' });
    expect(routeRoundAbandon(undefined, 'ice-cream')).toEqual({ action: 'ignore' });
  });
});

describe('chain end → onChainEnd hook (Story 2.4 regression)', () => {
  it('a queued tap never reaches the hook: end({queuedStation}) routes to the tap, so no overlay opens', async () => {
    const h = harness({ timed: true });
    const hook = vi.fn();
    const taps: string[] = [];
    (h.deps.end as ReturnType<typeof vi.fn>).mockImplementation((e: ChainFinish) => {
      const route = routeChainEnd(e);
      if (route.action === 'tap') taps.push(route.stationId);
      else hook(route.end);
    });
    const p = h.chain.start({ kind: 'complete', gameId: 'ice-cream', outcome: PERFECT, startedLevel: 0 });
    h.chain.queueTap('pizza');
    await h.advance(PULL_MS);
    await p;
    expect(taps).toEqual(['pizza']);
    expect(hook).not.toHaveBeenCalled();
  });


  it('no queued tap: the hook gets {kind, gameId}', () => {
    expect(routeChainEnd({ kind: 'complete', gameId: 'ice-cream', queuedStation: undefined })).toEqual({
      action: 'hook',
      end: { kind: 'complete', gameId: 'ice-cream' },
    });
  });
});

describe('keepAbandonSnapshot (Story 2.5)', () => {
  const SNAP = { v: 1 as const, level: 1, seed: 3, questionIndex: 1, partial: { placed: ['mint' as const] }, tally: { questions: 1, firstTryCorrect: 1, maxHintLevel: 0 as const } };

  it('the running game: stored as a copy, before the return path', () => {
    const s = new SessionStore();
    expect(keepAbandonSnapshot({ id: 'ice-cream', level: 1 }, 'ice-cream', SNAP, s)).toBe(true);
    expect(s.getResume('ice-cream')).toEqual(SNAP);
    expect(s.getResume('ice-cream')).not.toBe(SNAP);
  });

  it.each([
    ['no running game', undefined],
    ['another running game', { id: 'pizza' as const, level: 0 }],
  ])('%s: nothing stored', (_name, running) => {
    const s = new SessionStore();
    expect(keepAbandonSnapshot(running, 'ice-cream', SNAP, s)).toBe(false);
    expect(s.resumeIds()).toEqual([]);
  });

  it('a throwing store (cycle / BigInt) never throws: one warn, nothing stored, the route still follows', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = new SessionStore();
    const bad = { ...SNAP, partial: { placed: [] as never[], big: BigInt(1) } } as never;
    expect(() => keepAbandonSnapshot({ id: 'ice-cream', level: 1 }, 'ice-cream', bad, s)).not.toThrow();
    expect(s.resumeIds()).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    expect(routeRoundAbandon({ id: 'ice-cream', level: 1 }, 'ice-cream')).toEqual({ action: 'fade', gameId: 'ice-cream' });
    warn.mockRestore();
  });
});

describe('Story 5.3: skipping the chain animation', () => {
  it('chainAnimMs: the pull-back (or the reduced fade) alone', () => {
    expect(chainAnimMs(false)).toBe(Timing.cameraPullBackMs);
    expect(chainAnimMs(true)).toBe(Timing.sceneFadeMs);
    // The pull-back stays within its cap.
    expect(chainAnimMs(false)).toBeLessThanOrEqual(Timing.cameraPullBackMaxMs);
  });

  it('steps 1–2 still write and the chain ends when pullBack resolves at once', async () => {
    const h = harness({ auto: true });
    const chain = new PostRoundChain(h.deps);
    const p = chain.start({ kind: 'complete', gameId: 'ice-cream', outcome: PERFECT, startedLevel: 1 });
    expect(h.calls.slice(0, 2)).toEqual(['setDifficulty ice-cream 2', 'clearResume ice-cream']);
    await h.advance(0);
    await p;
    expect(h.calls.at(-1)).toBe('end complete');
  });
});
