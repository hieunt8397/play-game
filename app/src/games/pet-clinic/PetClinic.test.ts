// Story 8.1: the clinic scene's base flow with Phaser stubbed and a fake AudioDirector: a fresh start walks a patient in
// and says the invitation, its name and its need; Home mid-patient abandons with `{ patient, left, seen }` and nothing
// plays after; Home while a (not last) patient walks out abandons with it counted as seen; the round's last patient
// makes Home complete the round (then leave); a full round completes once; a resume brings the same patient back.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  /** A chainable display-object stub: every method returns itself; `alpha` reads 1. */
  const obj = (): unknown => {
    const o: Record<string | symbol, unknown> = {};
    return new Proxy(o, { get: (_t, k) => (k === 'alpha' ? 1 : k === 'then' ? undefined : () => obj()) });
  };
  class Scene {
    readonly sys: { settings: { key: string }; isActive: () => boolean };
    readonly input = { enabled: true, on: vi.fn(), off: vi.fn(), manager: { pointersTotal: 3 }, addPointer: vi.fn() };
    /** A tiny scene clock: delayed calls run when `advance` passes them. */
    private timers: { at: number; fn: () => void }[] = [];
    readonly time = {
      now: 0,
      timeScale: 1,
      removeAllEvents: () => {
        this.timers = [];
      },
      delayedCall: vi.fn((ms: number, fn: () => void) => {
        this.timers.push({ at: this.time.now + ms, fn });
        return obj();
      }),
    };
    readonly tweens = { timeScale: 1, add: vi.fn(() => obj()), chain: vi.fn(() => obj()), addCounter: vi.fn(() => obj()), killTweensOf: vi.fn() };
    readonly textures = { exists: () => false };
    readonly add = { image: vi.fn(() => obj()), graphics: vi.fn(() => obj()), rectangle: vi.fn(() => obj()), container: vi.fn(() => obj()) };
    readonly scale = { on: vi.fn(), off: vi.fn() };
    readonly cameras = { main: { setBackgroundColor: vi.fn(), fadeIn: vi.fn(), fadeOut: vi.fn(), once: vi.fn() } };
    readonly children = { bringToTop: vi.fn() };
    private readonly fns = new Map<string, Array<() => void>>();
    readonly events = {
      once: (ev: string, fn: () => void) => this.fns.set(ev, [...(this.fns.get(ev) ?? []), fn]),
      on: (ev: string, fn: () => void) => this.fns.set(ev, [...(this.fns.get(ev) ?? []), fn]),
      off: (ev: string, fn?: () => void) => {
        if (fn === undefined) this.fns.delete(ev);
        else this.fns.set(ev, (this.fns.get(ev) ?? []).filter((g) => g !== fn));
      },
    };
    constructor(key: string) {
      this.sys = { settings: { key }, isActive: () => true };
    }
    emit(ev: string): void {
      const fns = this.fns.get(ev) ?? [];
      this.fns.delete(ev);
      for (const fn of fns) fn();
    }
    advance(ms: number): void {
      this.time.now += ms;
      const due = this.timers.filter((t) => t.at <= this.time.now);
      this.timers = this.timers.filter((t) => t.at > this.time.now);
      for (const t of due) t.fn();
    }
  }
  return { Scene };
});

const fake = vi.hoisted(() => ({
  audio: {
    musicId: 'music.island',
    voiceBusy: false,
    sfx: vi.fn(),
    say: vi.fn(() => 1),
    sayChain: vi.fn(() => 1),
    setPrompt: vi.fn(),
    clearPrompt: vi.fn(),
    replayPrompt: vi.fn(),
    stop: vi.fn(),
    fadeOut: vi.fn(),
    holdSfx: vi.fn(),
    music: vi.fn(),
    stopMusic: vi.fn(),
    fadeOutMusic: vi.fn(),
  },
}));

vi.mock('../../core/audio-director', async (orig) => ({ ...(await orig<object>()), audio: fake.audio }));

(globalThis as { window?: object }).window ??= {};

const { bus } = await import('../../core/bus');
const { Tokens } = await import('../../core/tokens');
const { INVITE_LINE, NEED_LINES, TOOL_FOR } = await import('../../content/games/pet-clinic');
const { PetClinic } = await import('./PetClinic');
const { resumeClinic } = await import('./round');

type Ctl = {
  useTool(t: string): string;
  readonly patient: string;
  readonly left: readonly (keyof typeof TOOL_FOR)[];
  readonly seen: readonly string[];
  readonly waiting: boolean;
};
type Stub = InstanceType<typeof PetClinic> & { emit(ev: string): void; advance(ms: number): void };
const ctl = (scene: Stub): Ctl => (scene as unknown as { ctl: Ctl }).ctl;
const T = Tokens.Timing;

function open(resume?: object): { scene: Stub; events: string[]; payloads: unknown[]; off: () => void } {
  const events: string[] = [];
  const payloads: unknown[] = [];
  const offs = [
    bus.on('round:complete', () => events.push('complete')),
    bus.on('round:next', () => events.push('next')),
    bus.on('round:leave', () => events.push('leave')),
    bus.on('round:abandon', (p) => {
      events.push('abandon');
      payloads.push(p);
    }),
  ];
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const scene = new PetClinic() as Stub;
  scene.init({ level: 0, seed: 11, ...(resume ? { resume } : {}) } as never);
  scene.create();
  return { scene, events, payloads, off: () => offs.forEach((o) => o()) };
}

/** Plays `ms` of scene time in 50 ms frames (the controller and the scene's delayed calls). */
const run = (scene: Stub, ms: number): void => {
  for (let t = 0; t < ms; t += 50) {
    scene.update(0, 50);
    scene.advance(50);
  }
};
/** Fixes every problem of the waiting patient. */
const cure = (scene: Stub): void => {
  for (const p of [...ctl(scene).left]) {
    expect(ctl(scene).useTool(TOOL_FOR[p])).toBe('fixed');
    run(scene, T.petClinicToolFlyMs + T.petClinicNapMs + T.petClinicToolReturnMs + T.petClinicFlourishMs + 100);
  }
};
const turnover = T.petClinicThanksMs + T.petClinicWalkOutMs + T.petClinicGapMs + T.petClinicWalkMs + 200;

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  PetClinic.resetSession();
});

describe('PetClinic scene (Story 8.1)', () => {
  it('opens: a patient walks in, then the invitation, its name and its need; no round event yet', () => {
    const { scene, events, off } = open();
    expect(fake.audio.sayChain).not.toHaveBeenCalled();
    run(scene, T.petClinicWalkMs + 100);
    const c = ctl(scene);
    expect(c.waiting).toBe(true);
    expect(fake.audio.sayChain).toHaveBeenCalledWith([INVITE_LINE, `vo.animal-pens.name.${c.patient}`, NEED_LINES[c.left[0]!]]);
    expect(events).toEqual([]);
    scene.emit('shutdown');
    off();
  });

  it('Home mid-patient: round:abandon with { patient, left, seen }; nothing plays after it', () => {
    const { scene, events, payloads, off } = open();
    run(scene, T.petClinicWalkMs + 100);
    const c = ctl(scene);
    const partial = { patient: c.patient, left: [...c.left], seen: [] };
    bus.emit('hud:home');
    expect(events).toEqual(['abandon']);
    expect((payloads[0] as { snapshot: { partial: unknown } }).snapshot.partial).toEqual(partial);
    fake.audio.say.mockClear();
    fake.audio.sayChain.mockClear();
    run(scene, 30000);
    expect(fake.audio.say).not.toHaveBeenCalled();
    expect(fake.audio.sayChain).not.toHaveBeenCalled();
    scene.emit('shutdown');
    off();
  });

  it('Home while a patient (not the last) walks out: abandon with it counted as seen and the next patient in the partial', () => {
    const { scene, events, payloads, off } = open();
    run(scene, T.petClinicWalkMs + 100);
    const first = ctl(scene).patient;
    cure(scene);
    bus.emit('hud:home');
    expect(events).toEqual(['abandon']);
    const partial = (payloads[0] as { snapshot: { partial: { patient: string; seen: string[]; left: string[] } } }).snapshot.partial;
    expect(partial.seen).toEqual([first]);
    expect(partial.patient).not.toBe(first);
    expect(partial.left.length).toBeGreaterThan(0);
    scene.emit('shutdown');
    off();
  });

  it('the round’s last patient: Home on its exit completes the round, then leaves (never abandons)', () => {
    const { scene, events, off } = open();
    run(scene, T.petClinicWalkMs + 100);
    for (let k = 0; k < Tokens.ui.petClinicPatientsPerRound; k++) {
      cure(scene);
      if (k < Tokens.ui.petClinicPatientsPerRound - 1) run(scene, turnover);
    }
    expect(events).toEqual([]);
    bus.emit('hud:home');
    expect(events).toEqual(['complete', 'leave']);
    scene.emit('shutdown');
    off();
  });

  it('a full round: three different patients, then one round:complete after the last has walked out', () => {
    const { scene, events, off } = open();
    run(scene, T.petClinicWalkMs + 100);
    const seen: string[] = [];
    for (let k = 0; k < Tokens.ui.petClinicPatientsPerRound; k++) {
      seen.push(ctl(scene).patient);
      cure(scene);
      if (k < Tokens.ui.petClinicPatientsPerRound - 1) run(scene, turnover);
    }
    run(scene, T.petClinicThanksMs + T.petClinicWalkOutMs + T.petClinicFinishMs + 300);
    expect(events).toEqual(['complete']);
    expect(new Set(seen).size).toBe(3);
    scene.emit('shutdown');
    off();
  });

  it('review: Home during a patient’s last reaction (not the round’s last): abandon with a resumable partial, the patient counted', () => {
    const resume = { v: 1, level: 0, seed: 11, questionIndex: 0, partial: { patient: 'dog', left: ['mud'], seen: [] }, tally: { questions: 0, firstTryCorrect: 0, maxHintLevel: 0 } };
    const { scene, events, payloads, off } = open(resume);
    run(scene, T.petClinicWalkMs + 100);
    expect(ctl(scene).useTool('shower')).toBe('fixed');
    run(scene, T.petClinicToolFlyMs);
    bus.emit('hud:home');
    expect(events).toEqual(['abandon']);
    const snap = (payloads[0] as { snapshot: { questionIndex: number; partial: { seen: string[] } } }).snapshot;
    expect(snap.partial.seen).toEqual(['dog']);
    expect(resumeClinic(snap, Tokens.ui.petClinicPatientsPerRound, Tokens.ui.petClinicMaxProblems)).not.toBeNull();
    scene.emit('shutdown');
    off();
  });

  it('review: Home during the round’s last patient’s last reaction completes the round, then leaves', () => {
    const resume = { v: 1, level: 0, seed: 11, questionIndex: 0, partial: { patient: 'cow', left: ['scrape'], seen: ['dog', 'cat'] }, tally: { questions: 0, firstTryCorrect: 0, maxHintLevel: 0 } };
    const { scene, events, off } = open(resume);
    run(scene, T.petClinicWalkMs + 100);
    expect(ctl(scene).useTool('plaster')).toBe('fixed');
    run(scene, T.petClinicToolFlyMs);
    bus.emit('hud:home');
    expect(events).toEqual(['complete', 'leave']);
    scene.emit('shutdown');
    off();
  });

  it('review: the session bag carries over a round restart: the next round’s first patient is not the last one', () => {
    const first = open();
    run(first.scene, T.petClinicWalkMs + 100);
    let last = '';
    for (let k = 0; k < Tokens.ui.petClinicPatientsPerRound; k++) {
      last = ctl(first.scene).patient;
      cure(first.scene);
      if (k < Tokens.ui.petClinicPatientsPerRound - 1) run(first.scene, turnover);
    }
    run(first.scene, T.petClinicThanksMs + T.petClinicWalkOutMs + T.petClinicFinishMs + 300);
    expect(first.events).toEqual(['complete']);
    first.scene.emit('shutdown');
    first.off();
    // No resetSession: Map restarts the scene with the next seed.
    const next = new PetClinic() as Stub;
    next.init({ level: 0, seed: 12 } as never);
    next.create();
    expect(ctl(next).patient).not.toBe(last);
    next.emit('shutdown');
  });

  it('a resume brings back the same patient with the same problems left and the same count', () => {
    const resume = { v: 1, level: 0, seed: 11, questionIndex: 0, partial: { patient: 'pig', left: ['scrape'], seen: ['dog'] }, tally: { questions: 0, firstTryCorrect: 0, maxHintLevel: 0 } };
    const { scene, off } = open(resume);
    const c = ctl(scene);
    expect(c.patient).toBe('pig');
    expect(c.left).toEqual(['scrape']);
    expect(c.seen).toEqual(['dog']);
    run(scene, T.petClinicWalkMs + 100);
    expect(fake.audio.sayChain).toHaveBeenCalledWith(['vo.animal-pens.name.pig', NEED_LINES.scrape]);
    scene.emit('shutdown');
    off();
  });

  it('a tool that fits nothing: no fail sound, the need line again', () => {
    const resume = { v: 1, level: 0, seed: 11, questionIndex: 0, partial: { patient: 'cat', left: ['mud'], seen: [] }, tally: { questions: 0, firstTryCorrect: 0, maxHintLevel: 0 } };
    const { scene, off } = open(resume);
    run(scene, T.petClinicWalkMs + 100);
    fake.audio.sfx.mockClear();
    expect(ctl(scene).useTool('bottle')).toBe('other');
    run(scene, T.petClinicTiltMs + 100);
    expect(fake.audio.sfx).not.toHaveBeenCalled();
    expect(fake.audio.say).toHaveBeenLastCalledWith(NEED_LINES.mud);
    scene.emit('shutdown');
    off();
  });

  it('shutdown forgets only its own prompt', () => {
    const { scene, off } = open();
    run(scene, T.petClinicWalkMs + 100);
    scene.emit('shutdown');
    expect(fake.audio.clearPrompt).toHaveBeenCalledWith(NEED_LINES[ctl(scene).left[0]!]);
    off();
  });
});
