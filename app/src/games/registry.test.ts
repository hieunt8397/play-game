// Registry and MiniGame contract (Story 1.7) with Phaser's Scene stubbed (node has no canvas).
import { describe, expect, it, vi } from 'vitest';
import type { GameStartData, Snapshot } from '../content/types';

vi.mock('phaser', () => {
  class Scene {
    readonly sys: { settings: { key: string } };
    readonly input = { enabled: true };
    readonly time = { removeAllEvents: vi.fn(), delayedCall: vi.fn(), timeScale: 1, now: 0 };
    /** Story 5.3: the skip scales these. */
    readonly tweens = { timeScale: 1 };
    readonly cameras = {
      main: {
        setBackgroundColor: vi.fn(),
        fadeIn: vi.fn(),
        fadeOut: vi.fn(),
        once: vi.fn(),
      },
    };
    private readonly onceFns = new Map<string, Array<() => void>>();
    readonly events = {
      once: (ev: string, fn: () => void) => this.onceFns.set(ev, [...(this.onceFns.get(ev) ?? []), fn]),
      on: (ev: string, fn: () => void) => this.onceFns.set(ev, [...(this.onceFns.get(ev) ?? []), fn]),
      off: (ev: string, fn?: () => void) => {
        if (fn === undefined) this.onceFns.delete(ev);
        else this.onceFns.set(ev, (this.onceFns.get(ev) ?? []).filter((g) => g !== fn));
      },
    };
    constructor(key: string) {
      this.sys = { settings: { key } };
    }
    shutdown(): void {
      const fns = this.onceFns.get('shutdown') ?? [];
      this.onceFns.delete('shutdown');
      for (const fn of fns) fn();
    }
  }
  return { Scene };
});

const { GAME_CONTENT } = await import('../content/games/index');
const { STATIONS } = await import('../content/stations');
const { bus } = await import('../core/bus');
const { getHudMode, setHudMode } = await import('../core/hud-mode');
const { GAMES, GAME_SCENES, isGameId, ladderLength } = await import('./registry');
const { IceCream } = await import('./ice-cream/IceCream');
const { Pizza } = await import('./pizza/Pizza');
const { DinoPuzzle } = await import('./dino-puzzle/DinoPuzzle');
const { ShadowMatch } = await import('./shadow-match/ShadowMatch');
const { Race } = await import('./race/Race');
const { Fishing } = await import('./fishing/Fishing');
const { TouchTalk } = await import('./touch-talk/TouchTalk');
const { MiniGameBase } = await import('./mini-game-base');

/** A minimal game: the base contract without the ice-cream scene (which needs a real Phaser). */
class TestGame extends MiniGameBase<'ice-cream'> {
  readonly hints: string[] = [];
  /** Story 5.7: every question the hint system received (its `leadLineId`). */
  readonly questions: Array<{ leadLineId?: string }> = [];
  /** The open question index reported by progress(). */
  at = 0;
  get resumePoint() {
    return this.resumeAt;
  }
  constructor() {
    super('ice-cream');
  }
  protected override createHintSystem() {
    return {
      beginQuestion: (q: { leadLineId?: string }) => {
        this.questions.push(q);
        this.hints.push('begin');
      },
      stepDone: () => undefined,
      wrong: () => this.hints.push('wrong'),
      questionDone: () => this.hints.push('done'),
      replayPrompt: () => undefined,
      level: 0 as const,
    };
  }
  /** Whether build() takes the resume (a real game decides from its own question count / partial). */
  static acceptsResume = true;
  protected build(): void {
    if (this.resumeAt && TestGame.acceptsResume) this.acceptResume();
  }
  ask() {
    this.hint.beginQuestion({ promptLineId: 'p', retryLineId: 'r', step: { correct: [], distractors: [], target: null, action: 'drag' } });
  }
  answer() {
    this.hint.questionDone();
  }
  /** Story 5.7. */
  invite() {
    return this.inviteParent();
  }
  beginWithoutHint() {
    this.questionBegunWithoutHint();
  }
  finishIn(ms: number) {
    this.scheduleFinish(ms);
  }
  lastAnswered() {
    this.markFinishing();
  }
  celebrate(ms: number) {
    this.skippable(ms);
  }
  wire(router: { onAnyTap: ((p: { x: number; y: number }) => void) | undefined }) {
    this.attachSkip(router as never);
  }
  end() {
    this.finishRound();
  }
  /** Story 5.8. */
  readonly freePlaySpy = vi.fn();
  protected override onFreePlay(): void {
    this.freePlaySpy();
  }
  static reactions = { correct: ['c1', 'c2', 'c3'], choseOther: ['o1'] };
  protected override reactionSet() {
    return TestGame.reactions;
  }
  pick(kind: 'correct' | 'choseOther') {
    return this.pickReaction(kind);
  }
  roll() {
    return this.reactionRoll();
  }
  get isFreePlay() {
    return this.freePlay;
  }
  get isInert() {
    return this.inert;
  }
  goHome() {
    this.leave();
  }
  /** Story 5.4. */
  wireReactions(router: unknown) {
    this.attachReactions(router as never);
  }
  reactTo(sprite: unknown) {
    return this.react(sprite as never);
  }
  ambientAdd(t: unknown) {
    return this.addAmbient(t as never);
  }
  ambientHold(reason: string, on: boolean) {
    this.holdAmbient(reason, on);
  }
  protected progress() {
    return { questionIndex: this.at, partial: { placed: [] as never[] } };
  }
}

describe('games/registry', () => {
  it('GAMES lists exactly the games with content, each with its scene keyed by its id', () => {
    expect(Object.keys(GAMES)).toEqual(Object.keys(GAME_CONTENT));
    for (const [id, entry] of Object.entries(GAMES)) {
      const scene = new entry!.scene();
      expect(scene.gameId).toBe(id);
      expect((scene as unknown as { sys: { settings: { key: string } } }).sys.settings.key).toBe(id);
      expect(entry!.ladder).toBe(GAME_CONTENT[id as keyof typeof GAME_CONTENT]!.ladder);
    }
    expect(GAME_SCENES).toEqual([IceCream, Pizza, Race, Fishing, TouchTalk, DinoPuzzle, ShadowMatch]);
  });

  it('awake stations are exactly the registered games', () => {
    // Story 7.1: the home station is awake too, but opens the yard (not a game).
    expect(STATIONS.filter((s) => s.awake && s.id !== 'home').map((s) => s.id)).toEqual(Object.keys(GAMES));
    expect(STATIONS.find((s) => s.id === 'home')?.awake).toBe(true);
    expect(isGameId('home')).toBe(false);
    expect(isGameId('ice-cream')).toBe(true);
    expect(isGameId('pizza')).toBe(true);
    expect(isGameId('race')).toBe(true);
    expect(isGameId('fishing')).toBe(true);
    expect(isGameId('touch-talk')).toBe(true);
    expect(isGameId('map')).toBe(false);
  });

  it('ladderLength: the ladder length, 1 without a ladder', () => {
    expect(ladderLength({ ladder: [1, 2, 3] })).toBe(3);
    expect(ladderLength({})).toBe(1);
  });
});

describe('MiniGameBase', () => {
  function start(data: Partial<GameStartData> = { level: 0, seed: 42 }) {
    const game = new TestGame();
    game.init(data);
    game.create();
    return game as TestGame & { input: { enabled: boolean }; time: { removeAllEvents: ReturnType<typeof vi.fn> }; shutdown(): void };
  }

  it('create: Hud in game mode; snapshot carries level and seed', () => {
    setHudMode('map');
    const game = start({ level: 0, seed: 42 });
    expect(getHudMode()).toBe('game');
    expect(game.snapshot()).toEqual({ v: 1, level: 0, seed: 42, questionIndex: 0, partial: { placed: [] }, tally: { questions: 0, firstTryCorrect: 0, maxHintLevel: 0 } });
    game.shutdown();
  });

  it('hud:home twice: one round:abandon, then inert (input disabled)', () => {
    const game = start();
    const abandon = vi.fn();
    const off = bus.on('round:abandon', abandon);
    bus.emit('hud:home');
    bus.emit('hud:home');
    expect(abandon).toHaveBeenCalledTimes(1);
    expect(abandon).toHaveBeenCalledWith({ gameId: 'ice-cream', snapshot: game.snapshot() });
    expect(game.input.enabled).toBe(false);
    game.shutdown();
    off();
  });

  it('Home (Story 1.8): the hint question ends and the timed events are removed before round:abandon, once', () => {
    const game = start();
    const order: string[] = [];
    game.time.removeAllEvents.mockImplementation(() => order.push('timers'));
    const off = bus.on('round:abandon', () => order.push(`abandon:${game.hints.join(',')}`));
    bus.emit('hud:home');
    bus.emit('hud:home');
    expect(order).toEqual(['timers', 'abandon:done']);
    expect(game.time.removeAllEvents).toHaveBeenCalledTimes(1);
    game.shutdown();
    off();
  });

  it('ambient (Story 1.9): paused while hint level ≥ 2 for this game or any hold reason; resumed when none is left', () => {
    const game = start();
    const tween = { pause: vi.fn(), resume: vi.fn(), isDestroyed: () => false };
    game.ambientAdd(tween);
    bus.emit('hint:level', { gameId: 'pizza', level: 2 });
    expect(tween.pause).not.toHaveBeenCalled();
    bus.emit('hint:level', { gameId: 'ice-cream', level: 1 });
    expect(tween.pause).not.toHaveBeenCalled();
    bus.emit('hint:level', { gameId: 'ice-cream', level: 2 });
    expect(tween.pause).toHaveBeenCalledOnce();
    bus.emit('hint:level', { gameId: 'ice-cream', level: 3 });
    game.ambientHold('celebrate', true);
    expect(tween.pause).toHaveBeenCalledOnce();
    bus.emit('hint:level', { gameId: 'ice-cream', level: 0 });
    expect(tween.resume).not.toHaveBeenCalled();
    game.ambientHold('celebrate', false);
    expect(tween.resume).toHaveBeenCalledOnce();
    // A tween added while held starts paused.
    game.ambientHold('celebrate', true);
    const late = { pause: vi.fn(), resume: vi.fn(), isDestroyed: () => false };
    game.ambientAdd(late);
    expect(late.pause).toHaveBeenCalledOnce();
    game.shutdown();
  });

  type Started = ReturnType<typeof start> & { time: { delayedCall: ReturnType<typeof vi.fn> } };

  /** q1 clean; q2 one level-1; q3 idle to level 3 (the matrix tally row), then the finish is scheduled. */
  function playRound(game: Started) {
    game.ask();
    game.answer();
    bus.emit('hint:level', { gameId: 'ice-cream', level: 0 });
    game.ask();
    bus.emit('hint:level', { gameId: 'ice-cream', level: 1 });
    game.answer();
    bus.emit('hint:level', { gameId: 'ice-cream', level: 0 });
    game.ask();
    bus.emit('hint:level', { gameId: 'pizza', level: 4 });
    bus.emit('hint:level', { gameId: 'ice-cream', level: 2 });
    bus.emit('hint:level', { gameId: 'ice-cream', level: 3 });
    game.answer();
    bus.emit('hint:level', { gameId: 'ice-cream', level: 0 });
    game.finishIn(1500);
  }

  it('finish (Story 1.10, 5.8): after the scheduled delay, exactly one tallied round:complete; free play after (input on, timers kept)', () => {
    const game = start() as Started;
    const complete = vi.fn();
    const abandon = vi.fn();
    const leave = vi.fn();
    const offC = bus.on('round:complete', complete);
    const offA = bus.on('round:abandon', abandon);
    const offL = bus.on('round:leave', leave);
    playRound(game);
    expect(game.time.delayedCall).toHaveBeenCalledOnce();
    expect(game.time.delayedCall.mock.calls[0]![0]).toBe(1500);
    expect(complete).not.toHaveBeenCalled();
    game.hints.length = 0;
    (game.time.delayedCall.mock.calls[0]![1] as () => void)();
    expect(complete).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith({ gameId: 'ice-cream', questions: 3, firstTryCorrect: 1, maxHintLevel: 3 });
    expect(game.hints).toEqual(['done']);
    expect(game.time.removeAllEvents).not.toHaveBeenCalled();
    expect(game.input.enabled).toBe(true);
    expect(game.isInert).toBe(true);
    expect(game.isFreePlay).toBe(true);
    expect(game.freePlaySpy).toHaveBeenCalledOnce();
    // Story 5.8: Home in free play — cleanup, then one round:leave, then input off.
    bus.emit('hud:home');
    expect(game.time.removeAllEvents).toHaveBeenCalledOnce();
    expect(leave).toHaveBeenCalledExactlyOnceWith({ gameId: 'ice-cream' });
    expect(game.input.enabled).toBe(false);
    expect(game.isFreePlay).toBe(false);
    bus.emit('hud:home');
    (game.time.delayedCall.mock.calls[0]![1] as () => void)();
    expect(complete).toHaveBeenCalledOnce();
    expect(leave).toHaveBeenCalledOnce();
    expect(abandon).not.toHaveBeenCalled();
    expect(game.freePlaySpy).toHaveBeenCalledOnce();
    game.shutdown();
    offC();
    offA();
    offL();
  });

  describe('seamless play (2026-10-21): the next round', () => {
    type Cam = { fadeOut: ReturnType<typeof vi.fn>; once: ReturnType<typeof vi.fn> };
    const cam = (game: Started): Cam => (game as unknown as { cameras: { main: Cam } }).cameras.main;
    /** Fires the camera's FADE_OUT_COMPLETE handler(s) registered so far. */
    const fadeDone = (game: Started): void => {
      for (const [ev, fn] of cam(game).once.mock.calls as [string, () => void][]) if (ev === 'camerafadeoutcomplete') fn();
    };
    const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

    it('round:complete → nextRoundDelayMs (scene clock) → fade out over sceneFadeMs → one round:next', async () => {
      const { Timing } = await import('../core/timing');
      const game = start() as Started;
      const next = vi.fn();
      const off = bus.on('round:next', next);
      game.end();
      const call = game.time.delayedCall.mock.calls.at(-1)!;
      expect(call[0]).toBe(Timing.nextRoundDelayMs);
      expect(cam(game).fadeOut).not.toHaveBeenCalled();
      (call[1] as () => void)();
      expect(cam(game).fadeOut).toHaveBeenCalledWith(Timing.sceneFadeMs, expect.any(Number), expect.any(Number), expect.any(Number));
      expect(next).not.toHaveBeenCalled();
      fadeDone(game);
      await flush();
      expect(next).toHaveBeenCalledExactlyOnceWith({ gameId: 'ice-cream' });
      game.shutdown();
      off();
    });

    it('Home before the timer: round:leave, the timer is removed (cleanup) and a late callback emits nothing', async () => {
      const game = start() as Started;
      const next = vi.fn();
      const off = bus.on('round:next', next);
      game.end();
      const call = game.time.delayedCall.mock.calls.at(-1)!;
      bus.emit('hud:home');
      expect(game.time.removeAllEvents).toHaveBeenCalledOnce();
      (call[1] as () => void)();
      expect(cam(game).fadeOut).not.toHaveBeenCalled();
      fadeDone(game);
      await flush();
      expect(next).not.toHaveBeenCalled();
      game.shutdown();
      off();
    });

    it('Home during the fade: no round:next', async () => {
      const game = start() as Started;
      const next = vi.fn();
      const off = bus.on('round:next', next);
      game.end();
      (game.time.delayedCall.mock.calls.at(-1)![1] as () => void)();
      bus.emit('hud:home');
      fadeDone(game);
      await flush();
      expect(next).not.toHaveBeenCalled();
      game.shutdown();
      off();
    });

    it('Home while finishing (complete and leave at once): no next-round timer', () => {
      const game = start() as Started;
      game.lastAnswered();
      const before = game.time.delayedCall.mock.calls.length;
      bus.emit('hud:home');
      expect(game.time.delayedCall.mock.calls.length).toBe(before);
      game.shutdown();
    });
  });

  it('Story 5.8 free-play entry: hint closed, Speaker prompt forgotten, then complete and onFreePlay once; no abandon on Home', async () => {
    const { audio } = await import('../core/audio-director');
    const order: string[] = [];
    const clear = vi.spyOn(audio, 'clearPrompt').mockImplementation(() => void order.push('clearPrompt'));
    const game = start() as Started;
    const complete = vi.fn((_o: unknown) => order.push('complete'));
    const abandon = vi.fn();
    const offC = bus.on('round:complete', complete);
    const offA = bus.on('round:abandon', abandon);
    game.freePlaySpy.mockImplementation(() => order.push('onFreePlay'));
    game.ask();
    game.hints.length = 0;
    game.end();
    expect(game.hints).toEqual(['done']);
    expect(order).toEqual(['clearPrompt', 'complete', 'onFreePlay']);
    game.end();
    expect(complete).toHaveBeenCalledOnce();
    expect(game.freePlaySpy).toHaveBeenCalledOnce();
    bus.emit('hud:home');
    expect(abandon).not.toHaveBeenCalled();
    clear.mockRestore();
    game.shutdown();
    offC();
    offA();
  });

  it('Home while finishing: round:complete then round:leave in the same tick (never round:abandon, no free-play hook)', () => {
    const game = start() as Started;
    const order: string[] = [];
    const complete = vi.fn((_o: unknown) => order.push('complete'));
    const abandon = vi.fn();
    const leave = vi.fn(() => order.push('leave'));
    const offC = bus.on('round:complete', complete);
    const offA = bus.on('round:abandon', abandon);
    const offL = bus.on('round:leave', leave);
    playRound(game);
    bus.emit('hud:home');
    expect(order).toEqual(['complete', 'leave']);
    expect(complete.mock.calls[0]![0]).toMatchObject({ questions: 3 });
    expect(abandon).not.toHaveBeenCalled();
    expect(game.freePlaySpy).not.toHaveBeenCalled();
    expect(game.input.enabled).toBe(false);
    bus.emit('hud:home');
    expect(complete).toHaveBeenCalledOnce();
    expect(leave).toHaveBeenCalledOnce();
    game.shutdown();
    offC();
    offA();
    offL();
  });

  it('Story 5.8 reactions: picks come from reactionSet, never twice in a row; the same seed repeats the sequence', () => {
    const draw = (seed: number): (string | undefined)[] => {
      const game = start({ level: 0, seed });
      const picks = Array.from({ length: 12 }, () => game.pick('correct'));
      expect(game.pick('choseOther')).toBe('o1');
      game.shutdown();
      return picks;
    };
    const a = draw(3);
    a.forEach((id, i) => {
      expect(TestGame.reactions.correct).toContain(id);
      if (i > 0) expect(id).not.toBe(a[i - 1]);
    });
    expect(draw(3)).toEqual(a);
    // Story 6.1: reactionRoll shares the seeded reaction rng: an interleaved pick/roll sequence repeats.
    const mixed = (seed: number): (string | number | undefined)[] => {
      const game = start({ level: 0, seed });
      const out: (string | number | undefined)[] = [];
      for (let i = 0; i < 8; i++) out.push(game.pick('correct'), game.roll());
      game.shutdown();
      return out;
    };
    const m = mixed(3);
    for (const v of m.filter((x): x is number => typeof x === 'number')) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(mixed(3)).toEqual(m);
    expect(m.filter((x) => typeof x === 'string')).not.toEqual(a.slice(0, 8));
  });

  it('Story 3.1: after markFinishing (the last pizza still bakes) Home completes; scheduleFinish still schedules', () => {
    const game = start() as Started;
    const complete = vi.fn();
    const abandon = vi.fn();
    const offC = bus.on('round:complete', complete);
    const offA = bus.on('round:abandon', abandon);
    game.ask();
    game.answer();
    (game as unknown as TestGame).lastAnswered();
    (game as unknown as TestGame).finishIn(1500);
    expect(game.time.delayedCall).toHaveBeenCalledOnce();
    bus.emit('hud:home');
    expect(complete).toHaveBeenCalledOnce();
    expect(abandon).not.toHaveBeenCalled();
    game.shutdown();
    offC();
    offA();
  });

  it('Home before the finish is scheduled abandons as before', () => {
    const game = start() as Started;
    const complete = vi.fn();
    const abandon = vi.fn();
    const offC = bus.on('round:complete', complete);
    const offA = bus.on('round:abandon', abandon);
    game.ask();
    game.answer();
    bus.emit('hud:home');
    expect(abandon).toHaveBeenCalledOnce();
    expect(complete).not.toHaveBeenCalled();
    game.shutdown();
    offC();
    offA();
  });

  it('Home mid-round (Story 2.5): the composed snapshot carries the progress and the closed-question tally; plain JSON', () => {
    const game = start({ level: 1, seed: 9 }) as Started;
    const abandon = vi.fn();
    const off = bus.on('round:abandon', abandon);
    game.ask();
    bus.emit('hint:level', { gameId: 'ice-cream', level: 2 });
    game.answer();
    bus.emit('hint:level', { gameId: 'ice-cream', level: 0 });
    game.ask(); // open when Home is tapped: not in the tally
    bus.emit('hint:level', { gameId: 'ice-cream', level: 4 });
    game.at = 1;
    bus.emit('hud:home');
    expect(abandon).toHaveBeenCalledOnce();
    const snap = abandon.mock.calls[0]![0].snapshot as Snapshot;
    expect(snap).toMatchObject({ v: 1, level: 1, seed: 9, questionIndex: 1, partial: { placed: [] } });
    expect(snap.tally).toEqual({ questions: 1, firstTryCorrect: 0, maxHintLevel: 2 });
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    game.shutdown();
    off();
  });

  it('a matching resume (Story 2.5): resumeAt is validated and its tally counts towards round:complete', () => {
    const resume: Snapshot = { v: 1, level: 0, seed: 5, questionIndex: 1, partial: { placed: [] }, tally: { questions: 1, firstTryCorrect: 0, maxHintLevel: 4 } };
    const game = start({ level: 0, seed: 5, resume }) as Started;
    expect(game.resumePoint).toEqual({ questionIndex: 1, partial: { placed: [] }, tally: resume.tally });
    const complete = vi.fn();
    const off = bus.on('round:complete', complete);
    for (let q = 0; q < 2; q++) {
      game.ask();
      game.answer();
      bus.emit('hint:level', { gameId: 'ice-cream', level: 0 });
    }
    game.finishIn(1500);
    bus.emit('hud:home');
    expect(complete).toHaveBeenCalledWith({ gameId: 'ice-cream', questions: 3, firstTryCorrect: 2, maxHintLevel: 4 });
    game.shutdown();
    off();
  });

  it('a resume the game rejects (Story 2.5): the snapshot tally is not restored (counted once, not twice)', () => {
    const resume: Snapshot = { v: 1, level: 0, seed: 5, questionIndex: 1, partial: { placed: [] }, tally: { questions: 1, firstTryCorrect: 0, maxHintLevel: 4 } };
    TestGame.acceptsResume = false;
    try {
      const game = start({ level: 0, seed: 5, resume }) as Started;
      expect(game.resumePoint).not.toBeNull();
      expect(game.snapshot().tally).toEqual({ questions: 0, firstTryCorrect: 0, maxHintLevel: 0 });
      const complete = vi.fn();
      const off = bus.on('round:complete', complete);
      game.ask();
      game.answer();
      game.finishIn(1500);
      bus.emit('hud:home');
      expect(complete).toHaveBeenCalledWith({ gameId: 'ice-cream', questions: 1, firstTryCorrect: 1, maxHintLevel: 0 });
      game.shutdown();
      off();
    } finally {
      TestGame.acceptsResume = true;
    }
  });

  it.each([
    ['v 2', { v: 2 }],
    ['a seed mismatch', { seed: 6 }],
    ['a level mismatch', { level: 1 }],
  ])('a bad envelope (%s, Story 2.5): resumeAt null, a fresh round, one warn', (_name, patch) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const resume = { v: 1, level: 0, seed: 5, questionIndex: 1, partial: { placed: [] }, ...patch } as unknown as Snapshot;
    const game = start({ level: 0, seed: 5, resume });
    expect(game.resumePoint).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    game.shutdown();
  });

  it('no resume: resumeAt null', () => {
    const game = start({ level: 0, seed: 5 });
    expect(game.resumePoint).toBeNull();
    game.shutdown();
  });

  it('Story 5.3 skip lifecycle: an armed router tap fast-forwards; beginQuestion, or the terminal cleanup, restores scale 1 and SFX', async () => {
    const { audio } = await import('../core/audio-director');
    const { Tokens } = await import('../core/tokens');
    const T = Tokens.Timing;
    const hold = vi.spyOn(audio, 'holdSfx');
    for (const close of ['beginQuestion', 'cleanup'] as const) {
      hold.mockClear();
      const game = start() as ReturnType<typeof start> & { time: { timeScale: number; now: number }; tweens: { timeScale: number } };
      const previous = vi.fn();
      const router: { onAnyTap: ((p: { x: number; y: number }) => void) | undefined } = { onAnyTap: previous };
      game.wire(router);
      game.celebrate(T.skipThresholdMs + 1);
      game.time.now += T.skipArmMs;
      router.onAnyTap?.({ x: 0, y: 0 });
      expect(previous).toHaveBeenCalledOnce();
      expect(game.tweens.timeScale).toBe(T.skipTimeScale);
      expect(game.time.timeScale).toBe(T.skipTimeScale);
      expect(hold).toHaveBeenLastCalledWith(true);
      if (close === 'beginQuestion') game.ask();
      else game.end();
      expect(game.tweens.timeScale, close).toBe(1);
      expect(game.time.timeScale, close).toBe(1);
      expect(hold, close).toHaveBeenLastCalledWith(false);
      game.shutdown();
    }
    hold.mockRestore();
  });

  describe('Story 5.4 tap reactions', () => {
    async function reactWorld() {
      const { audio } = await import('../core/audio-director');
      const { fakeScene } = await import('../core/input/fakes');
      const { InputGuard } = await import('../core/input/guard');
      const { createTapRouter } = await import('../core/input/tap-router');
      const { Tokens } = await import('../core/tokens');
      const game = start() as ReturnType<typeof start> & {
        time: { now: number; delayedCall: ReturnType<typeof vi.fn> };
        tweens: { add?: ReturnType<typeof vi.fn> };
        add?: unknown;
      };
      const graphics: unknown[] = [];
      const bounces: unknown[] = [];
      const stub = game as unknown as { tweens: Record<string, unknown>; add: unknown };
      stub.tweens.add = vi.fn((cfg: { targets: unknown }) => {
        if (cfg.targets === sprite) bounces.push(cfg);
        return { stop: vi.fn(), isPlaying: () => true };
      });
      stub.add = {
        graphics: vi.fn(() => {
          const g = { setDepth: () => g, lineStyle: () => g, strokeCircle: () => g, destroy: vi.fn() };
          graphics.push(g);
          return g;
        }),
      };
      const sprite = { x: 300, y: 300, scaleX: 1, scaleY: 1, scale: 1, alpha: 1, visible: true, scene: {}, setScale: vi.fn(), getBounds: () => ({ x: 250, y: 250, width: 100, height: 100 }) };
      const input = fakeScene();
      const router = createTapRouter(input, { guard: new InputGuard() });
      game.wire(router);
      game.wireReactions(router);
      game.reactTo({ image: sprite });
      const sfx = vi.spyOn(audio, 'sfx').mockImplementation(() => undefined);
      const done = (): void => {
        sfx.mockRestore();
        game.shutdown();
      };
      return { game, input, sprite, bounces, graphics, sfx, done, T: Tokens.Timing };
    }

    it('a sprite tap bounces with pop, a background tap ripples; the hint (wrong) and the tally stay untouched', async () => {
      const w = await reactWorld();
      const before = w.game.snapshot().tally;
      w.input.tap(300, 300);
      w.game.time.now += w.T.tapRippleMinGapMs;
      w.input.tap(700, 600);
      expect(w.bounces).toHaveLength(1);
      expect(w.sfx).toHaveBeenCalledExactlyOnceWith('sfx.shell.pop');
      expect(w.graphics).toHaveLength(1);
      expect(w.game.hints).toEqual([]);
      expect(w.game.snapshot().tally).toEqual(before);
      w.done();
    });

    it('an armed skip tap, and a tap while the fast-forward runs, give no bounce, pop or ripple', async () => {
      const w = await reactWorld();
      w.game.celebrate(w.T.skipThresholdMs + 1);
      w.game.time.now += w.T.skipArmMs;
      w.input.tap(300, 300);
      w.input.tap(300, 300);
      w.input.tap(700, 600);
      expect(w.bounces).toHaveLength(0);
      expect(w.sfx).not.toHaveBeenCalled();
      expect(w.graphics).toHaveLength(0);
      w.done();
    });

    it('Story 5.8: free play still reacts (bounce and ripple)', async () => {
      const w = await reactWorld();
      w.game.end();
      w.input.tap(300, 300);
      w.game.time.now += w.T.tapRippleMinGapMs;
      w.input.tap(700, 600);
      expect(w.bounces).toHaveLength(1);
      expect(w.sfx).toHaveBeenCalledExactlyOnceWith('sfx.shell.pop');
      expect(w.graphics).toHaveLength(1);
      w.done();
    });

    it('nothing reacts after the start ends (Home in free play)', async () => {
      const w = await reactWorld();
      w.game.end();
      w.game.goHome();
      w.input.tap(300, 300);
      w.input.tap(700, 600);
      expect(w.bounces).toHaveLength(0);
      expect(w.sfx).not.toHaveBeenCalled();
      expect(w.graphics).toHaveLength(0);
      w.done();
    });

    it("two overlapping bounces keep the 'react' ambient hold until the second bounce's timer", async () => {
      const w = await reactWorld();
      const tween = { pause: vi.fn(), resume: vi.fn(), isDestroyed: () => false };
      w.game.ambientAdd(tween);
      w.game.time.delayedCall.mockClear();
      w.input.tap(300, 300);
      w.input.tap(300, 300);
      expect(tween.pause).toHaveBeenCalledOnce();
      const timers = w.game.time.delayedCall.mock.calls.map((c) => c[1] as () => void);
      expect(timers).toHaveLength(2);
      timers[0]!();
      expect(tween.resume).not.toHaveBeenCalled();
      timers[1]!();
      expect(tween.resume).toHaveBeenCalledOnce();
      w.done();
    });
  });

  describe('Story 5.7 parent invitation', () => {
    async function seeds() {
      const { mulberry32, parentInviteSeed } = await import('../core/rng');
      const { Tokens } = await import('../core/tokens');
      const rolls = (seed: number): boolean => mulberry32(parentInviteSeed(seed))() < Tokens.ui.parentInviteChance;
      let hit = 0;
      while (!rolls(hit)) hit++;
      let miss = 0;
      while (rolls(miss)) miss++;
      return { hit, miss };
    }
    const PARENT = /^vo\.ice-cream\.parent\.[0-9]+$/;

    it('a rolled fresh round: the first ask carries the parent lead, the second none; inviteParent is then spent', async () => {
      const { hit } = await seeds();
      const game = start({ level: 0, seed: hit });
      game.ask();
      game.answer();
      game.ask();
      expect(game.questions[0]!.leadLineId).toMatch(PARENT);
      expect(game.questions[1]!.leadLineId).toBeUndefined();
      game.answer();
      expect(game.invite()).toBeUndefined();
      game.shutdown();
    });

    it('not rolled: no lead', async () => {
      const { miss } = await seeds();
      const game = start({ level: 0, seed: miss });
      game.ask();
      expect(game.questions[0]!.leadLineId).toBeUndefined();
      game.shutdown();
    });

    it('the same seed with resume data: no lead and no free-play invite', async () => {
      const { hit } = await seeds();
      const resume: Snapshot = { v: 1, level: 0, seed: hit, questionIndex: 1, partial: { placed: [] }, tally: { questions: 1, firstTryCorrect: 1, maxHintLevel: 0 } };
      const game = start({ level: 0, seed: hit, resume });
      expect(game.invite()).toBeUndefined();
      game.ask();
      expect(game.questions[0]!.leadLineId).toBeUndefined();
      game.shutdown();
    });

    it('free play: inviteParent says the line once (none while a question is open); nothing after the start ends', async () => {
      const { audio } = await import('../core/audio-director');
      const say = vi.spyOn(audio, 'say').mockImplementation(() => 7);
      const { hit } = await seeds();
      const open = start({ level: 0, seed: hit });
      open.beginWithoutHint();
      expect(open.invite()).toBeUndefined();
      open.answer();
      expect(open.invite()).toBe(7);
      expect(say).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(PARENT));
      expect(open.invite()).toBeUndefined();
      open.shutdown();
      // Seamless play (2026-10-21): entering free play no longer invites by itself (the next round would
      // cut it); Home while finishing never invites.
      const ended = start({ level: 0, seed: hit });
      ended.end();
      expect(say).toHaveBeenCalledTimes(1);
      ended.shutdown();
      const left = start({ level: 0, seed: hit });
      left.lastAnswered();
      bus.emit('hud:home');
      expect(left.invite()).toBeUndefined();
      left.shutdown();
      expect(say).toHaveBeenCalledTimes(1);
      say.mockRestore();
    });

    it('seamless play matrix "Parent invite": a rolled, unused invite says nothing when the round completes; the round-start lead still works', async () => {
      const { audio } = await import('../core/audio-director');
      const say = vi.spyOn(audio, 'say').mockImplementation(() => 7);
      const { hit } = await seeds();
      // Rolled but not taken as a lead (the first question had no hint question): completing says nothing.
      const unused = start({ level: 0, seed: hit });
      unused.beginWithoutHint();
      unused.answer();
      unused.end();
      expect(say).not.toHaveBeenCalled();
      // The invite really was rolled and still unused: the hook (touch-talk's start call) would say it.
      expect(unused.invite()).toBe(7);
      expect(say).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(PARENT));
      unused.shutdown();
      say.mockClear();
      // The round-start lead case is unchanged.
      const lead = start({ level: 0, seed: hit });
      lead.ask();
      expect(lead.questions[0]!.leadLineId).toMatch(PARENT);
      lead.answer();
      lead.end();
      expect(say).not.toHaveBeenCalled();
      lead.shutdown();
      say.mockRestore();
    });

    it('a first question begun without a hint question (Race/Fishing): no later question gets the lead', async () => {
      const { hit } = await seeds();
      const game = start({ level: 0, seed: hit });
      game.beginWithoutHint();
      game.answer();
      game.ask();
      expect(game.questions[0]!.leadLineId).toBeUndefined();
      game.shutdown();
    });
  });

  it('after shutdown the scene no longer listens to hud:home', () => {
    const game = start();
    game.shutdown();
    const abandon = vi.fn();
    const off = bus.on('round:abandon', abandon);
    bus.emit('hud:home');
    expect(abandon).not.toHaveBeenCalled();
    off();
  });
});
