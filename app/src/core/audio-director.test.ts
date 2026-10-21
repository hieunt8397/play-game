// I/O matrix audio rows (Story 1.2; Story 1.3 voice channel, prompts, ducking), with fakes for Phaser's sound manager, AudioContext and document. Story 1.11: audioSession.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUDIO_SESSION_PLAYBACK,
  AudioDirector,
  MUSIC_DUCK_DB,
  rampVolume,
  setPlaybackSession,
  SOUND_COMPLETE,
  SOUND_UNLOCKED,
  VISIBILITY_CHANGE,
  type RampVolume,
  type SoundInstanceLike,
  type SoundLike,
} from "./audio-director";
import { Bus } from "./bus";
import { Timing } from "./timing";

/** Lets pending promise callbacks run. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function fakeInstance(key: string) {
  const handlers = new Map<string, Array<() => void>>();
  const inst = {
    key,
    isPlaying: false,
    isPaused: false,
    duration: 2,
    seek: 0,
    volume: 1,
    once: vi.fn((event: string, fn: () => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), fn]);
    }),
    destroy: vi.fn(() => handlers.clear()),
    /** Simulates Phaser's 'complete' at the end of playback. */
    finish() {
      inst.isPlaying = false;
      const fns = handlers.get(SOUND_COMPLETE) ?? [];
      handlers.delete(SOUND_COMPLETE);
      for (const fn of fns) fn();
    },
    play: vi.fn(() => ((inst.isPlaying = true), (inst.isPaused = false), true)),
    pause: vi.fn(
      () => ((inst.isPlaying = false), (inst.isPaused = true), true),
    ),
    resume: vi.fn(
      () => ((inst.isPlaying = true), (inst.isPaused = false), true),
    ),
    stop: vi.fn(
      () => ((inst.isPlaying = false), (inst.isPaused = false), true),
    ),
  };
  return inst satisfies SoundInstanceLike & { key: string };
}

function fakeSound(locked: boolean) {
  const onceHandlers = new Map<string, Array<() => void>>();
  const instances: Array<ReturnType<typeof fakeInstance>> = [];
  const context = {
    state: locked ? "suspended" : "running",
    /** What resume() leaves the context in. */
    resumeTo: "running",
    resume: vi.fn(async () => {
      context.state = context.resumeTo;
    }),
  };
  const sound = {
    locked,
    context,
    once: vi.fn((event: string, fn: () => void) => {
      onceHandlers.set(event, [...(onceHandlers.get(event) ?? []), fn]);
    }),
    play: vi.fn((_key: string, _config?: object) => true),
    add: vi.fn((key: string, _config?: object) => {
      const inst = fakeInstance(key);
      instances.push(inst);
      return inst;
    }),
    /** Simulates Phaser's update() after its body unlock handler resumed the context. */
    fireUnlocked() {
      sound.locked = false;
      context.state = "running";
      const fns = onceHandlers.get(SOUND_UNLOCKED) ?? [];
      onceHandlers.delete(SOUND_UNLOCKED);
      for (const fn of fns) fn();
    },
    instances,
  };
  return sound satisfies SoundLike;
}

function fakeDoc() {
  const fns: Array<() => void> = [];
  const doc = {
    visibilityState: "visible",
    addEventListener: (type: string, fn: () => void) => {
      if (type === VISIBILITY_CHANGE) fns.push(fn);
    },
    set(state: "visible" | "hidden") {
      doc.visibilityState = state;
      for (const fn of fns) fn();
    },
  };
  return doc;
}

function setup(locked = true) {
  let t = 1000;
  const bus = new Bus();
  const suspended = vi.fn();
  bus.on("audio:suspended", suspended);
  const director = new AudioDirector({ bus, now: () => t });
  const sound = fakeSound(locked);
  const doc = fakeDoc();
  director.attach(sound, doc);
  return {
    director,
    sound,
    doc,
    suspended,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("AudioDirector — first tap (locked)", () => {
  it("defers the pop until unlocked, starts music once and resolves unlock()", async () => {
    const { director, sound } = setup(true);
    director.sfx("sfx.shell.pop");
    director.music("music.island");
    const unlocked = vi.fn();
    void director.unlock().then(unlocked);
    expect(sound.play).not.toHaveBeenCalled();
    expect(sound.add).not.toHaveBeenCalled();

    sound.fireUnlocked();
    await flush();

    expect(sound.play).toHaveBeenCalledTimes(1);
    expect(sound.play.mock.calls[0]?.[0]).toBe("sfx.shell.pop");
    expect(sound.add).toHaveBeenCalledTimes(1);
    expect(sound.add.mock.calls[0]).toEqual(["music.island", { loop: true }]);
    expect(sound.instances[0]?.play).toHaveBeenCalledTimes(1);
    expect(unlocked).toHaveBeenCalledTimes(1);
    expect(director.isUnlocked).toBe(true);
  });

  it("drops a pop whose unlock arrives later than feedbackMaxMs, music still starts", async () => {
    const { director, sound, advance } = setup(true);
    director.sfx("sfx.shell.pop");
    director.music("music.island");
    advance(Timing.feedbackMaxMs + 1);
    sound.fireUnlocked();
    await flush();
    expect(sound.play).not.toHaveBeenCalled();
    expect(sound.instances).toHaveLength(1);
    expect(sound.instances[0]?.play).toHaveBeenCalledTimes(1);
  });

  it("plays a pop exactly at the feedbackMaxMs limit", () => {
    const { director, sound, advance } = setup(true);
    director.sfx("sfx.shell.pop");
    advance(Timing.feedbackMaxMs);
    sound.fireUnlocked();
    expect(sound.play).toHaveBeenCalledTimes(1);
  });

  it("double tap: music starts once", async () => {
    const { director, sound } = setup(true);
    director.music("music.island");
    director.music("music.island");
    sound.fireUnlocked();
    director.music("music.island");
    await flush();
    expect(sound.add).toHaveBeenCalledTimes(1);
  });

  it("plays immediately when not locked", async () => {
    const { director, sound } = setup(false);
    director.sfx("sfx.shell.pop");
    director.music("music.island");
    expect(sound.play).toHaveBeenCalledTimes(1);
    expect(sound.instances[0]?.play).toHaveBeenCalledTimes(1);
    await director.unlock();
    expect(director.isUnlocked).toBe(true);
  });
});

describe("AudioDirector — unknown ids", () => {
  it("plays nothing and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { director, sound } = setup(false);
    director.sfx("sfx.nope");
    expect(sound.play).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("rejects a music id used as sfx (and vice versa)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { director, sound } = setup(false);
    director.sfx("music.island");
    director.music("sfx.shell.pop");
    expect(sound.play).not.toHaveBeenCalled();
    expect(sound.add).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("a missing cached asset (Phaser throws) is skipped with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { director, sound } = setup(false);
    sound.play.mockImplementation(() => {
      throw new Error('Audio key "sfx.shell.pop" not found in cache');
    });
    expect(() => director.sfx("sfx.shell.pop")).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("AudioDirector — backgrounding", () => {
  async function unlockedSession() {
    const s = setup(true);
    s.director.music("music.island");
    const p = s.director.unlock();
    s.sound.fireUnlocked();
    await p;
    return s;
  }

  it("hidden: pauses music", async () => {
    const s = await unlockedSession();
    s.doc.set("hidden");
    expect(s.sound.instances[0]?.pause).toHaveBeenCalledTimes(1);
  });

  it("return OK: resume() → running, music resumes, no audio:suspended", async () => {
    const s = await unlockedSession();
    s.doc.set("hidden");
    s.sound.context.state = "suspended";
    s.doc.set("visible");
    await flush();
    expect(s.sound.context.resume).toHaveBeenCalled();
    expect(s.sound.instances[0]?.resume).toHaveBeenCalledTimes(1);
    expect(s.suspended).not.toHaveBeenCalled();
  });

  it("return stuck: context stays suspended → audio:suspended once; unlock() resumes music", async () => {
    const s = await unlockedSession();
    s.doc.set("hidden");
    s.sound.context.state = "suspended";
    s.sound.context.resumeTo = "suspended";
    s.doc.set("visible");
    await flush();
    s.doc.set("hidden");
    s.doc.set("visible");
    await flush();
    expect(s.suspended).toHaveBeenCalledTimes(1);
    expect(s.sound.instances[0]?.resume).not.toHaveBeenCalled();

    // Overlay tap: resume inside the gesture works.
    s.sound.context.resumeTo = "running";
    await s.director.unlock();
    expect(s.sound.instances[0]?.resume).toHaveBeenCalledTimes(1);

    // A later stuck return emits again.
    s.doc.set("hidden");
    s.sound.context.state = "suspended";
    s.sound.context.resumeTo = "suspended";
    s.doc.set("visible");
    await flush();
    expect(s.suspended).toHaveBeenCalledTimes(2);
  });

  it("a rejected resume() counts as stuck and only warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const s = await unlockedSession();
    s.sound.context.state = "suspended";
    s.sound.context.resume.mockRejectedValueOnce(new Error("not allowed"));
    s.doc.set("visible");
    await flush();
    expect(s.suspended).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("hidden before the first tap: no audio:suspended", async () => {
    const s = setup(true);
    s.doc.set("hidden");
    s.doc.set("visible");
    await flush();
    expect(s.suspended).not.toHaveBeenCalled();
    expect(s.sound.context.resume).not.toHaveBeenCalled();
  });

  it("unlocked by a stray touch but never by the play tap: no audio:suspended", async () => {
    const s = setup(true);
    s.sound.fireUnlocked();
    s.sound.context.state = "suspended";
    s.sound.context.resumeTo = "suspended";
    s.doc.set("visible");
    await flush();
    expect(s.suspended).not.toHaveBeenCalled();
  });
});

describe("AudioDirector — review fixes", () => {
  it("SOUND_COMPLETE matches Phaser.Sound.Events.COMPLETE", () => {
    const require = createRequire(import.meta.url);
    const file = fileURLToPath(
      new URL(
        "../../node_modules/phaser/src/sound/events/COMPLETE_EVENT.js",
        import.meta.url,
      ),
    );
    expect(SOUND_COMPLETE).toBe(require(file));
  });

  it("SOUND_UNLOCKED matches Phaser.Sound.Events.UNLOCKED", () => {
    const require = createRequire(import.meta.url);
    // Not in phaser's package exports: load the CommonJS source file by path.
    const file = fileURLToPath(
      new URL(
        "../../node_modules/phaser/src/sound/events/UNLOCKED_EVENT.js",
        import.meta.url,
      ),
    );
    expect(SOUND_UNLOCKED).toBe(require(file));
  });

  it("overlay unlock() resolves false while the context stays suspended, true once it runs", async () => {
    const s = setup(true);
    s.director.music("music.island");
    const first = s.director.unlock();
    s.sound.fireUnlocked();
    expect(await first).toBe(true);

    s.doc.set("hidden");
    s.sound.context.state = "suspended";
    s.sound.context.resumeTo = "suspended";
    s.doc.set("visible");
    await flush();
    expect(s.suspended).toHaveBeenCalledTimes(1);

    expect(await s.director.unlock()).toBe(false);
    expect(s.sound.instances[0]?.resume).not.toHaveBeenCalled();
    // Still covered: another stuck return does not emit again.
    s.doc.set("hidden");
    s.doc.set("visible");
    await flush();
    expect(s.suspended).toHaveBeenCalledTimes(1);

    s.sound.context.resumeTo = "running";
    expect(await s.director.unlock()).toBe(true);
    expect(s.sound.instances[0]?.resume).toHaveBeenCalledTimes(1);
  });

  it("a music start that throws is forgotten, so a later music(id) retries", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { director, sound } = setup(false);
    sound.add.mockImplementationOnce(() => {
      throw new Error('Audio key "music.island" not found in cache');
    });
    director.music("music.island");
    expect(warn).toHaveBeenCalledTimes(1);
    director.music("music.island");
    expect(sound.add).toHaveBeenCalledTimes(2);
    expect(sound.instances[0]?.play).toHaveBeenCalledTimes(1);
  });
});

// --- Story 1.3: voice channel, prompts, ducking (I/O matrix rows) ------------------------------

const A = "vo.shell.greeting";

/** A second real-looking id: the director only knows the real VOICE_LINES, so tests stub isVoiceLineId. */
vi.mock("../content/voice-lines", async (importOriginal) => {
  const real = await importOriginal<typeof import("../content/voice-lines")>();
  const extra = new Set(["vo.shell.b", "vo.shell.c"]);
  return {
    ...real,
    isVoiceLineId: (id: string) => real.isVoiceLineId(id) || extra.has(id),
  };
});
const B = "vo.shell.b";
const C = "vo.shell.c";

async function voiceSession(opts: { locked?: boolean; music?: boolean } = {}) {
  let t = 1000;
  const bus = new Bus();
  const ended: Array<{ token: number; completed: boolean }> = [];
  bus.on("speech:ended", (e) => void ended.push(e));
  const ramp = vi.fn<RampVolume>();
  const director = new AudioDirector({ bus, now: () => t, rampVolume: ramp });
  const sound = fakeSound(opts.locked ?? false);
  const doc = fakeDoc();
  director.attach(sound, doc);
  if (opts.music ?? true) director.music("music.island");
  const music = sound.instances[0];
  /** The voice instances created so far (every add() after the music). */
  const voices = () => sound.instances.filter((i) => i.key.startsWith("vo."));
  return {
    director,
    sound,
    doc,
    ended,
    ramp,
    music,
    voices,
    advance: (ms: number) => (t += ms),
  };
}

const DUCKED = 10 ** (MUSIC_DUCK_DB / 20);

describe("AudioDirector — voice channel", () => {
  it("say idle: token 1, plays, ducks the music to base×0.1 over 150 ms", async () => {
    const s = await voiceSession();
    const token = s.director.say(A);
    expect(token).toBe(1);
    expect(s.voices()).toHaveLength(1);
    expect(s.voices()[0]?.play).toHaveBeenCalledTimes(1);
    expect(s.ramp).toHaveBeenCalledTimes(1);
    expect(s.ramp).toHaveBeenCalledWith(
      s.music,
      DUCKED,
      Timing.musicDuckDownMs,
      0,
    );
    expect(DUCKED).toBeCloseTo(0.1, 5);
    expect(s.ended).toEqual([]);
  });

  it("line ends: speech:ended completed:true; restore ramp with 500 ms delay", async () => {
    const s = await voiceSession();
    const token = s.director.say(A);
    s.voices()[0]?.finish();
    expect(s.ended).toEqual([{ token, completed: true }]);
    expect(s.ramp).toHaveBeenLastCalledWith(
      s.music,
      1,
      Timing.musicDuckDownMs,
      Timing.musicDuckRestoreDelayMs,
    );
    expect(s.voices()[0]?.destroy).toHaveBeenCalled();
  });

  it("tokens are increasing integers starting at 1", async () => {
    const s = await voiceSession();
    expect(s.director.say(A)).toBe(1);
    expect(s.director.say(B)).toBe(2);
    expect(s.director.say(C)).toBe(3);
  });

  it("queue tail: B waits for A (0.3 s left), then plays with no restore in between", async () => {
    const s = await voiceSession();
    const a = s.director.say(A);
    const first = s.voices()[0]!;
    first.seek = first.duration - 0.3;
    const b = s.director.say(B);
    expect(b).toBe(a + 1);
    expect(s.voices()).toHaveLength(1);
    expect(first.stop).not.toHaveBeenCalled();
    first.finish();
    expect(s.ended).toEqual([{ token: a, completed: true }]);
    expect(s.voices()).toHaveLength(2);
    expect(s.voices()[1]?.key).toBe(B);
    expect(s.voices()[1]?.play).toHaveBeenCalledTimes(1);
    expect(s.ramp).toHaveBeenCalledTimes(1); // the duck only — no restore between A and B
    s.voices()[1]?.finish();
    expect(s.ended).toEqual([
      { token: a, completed: true },
      { token: b, completed: true },
    ]);
    expect(s.ramp).toHaveBeenCalledTimes(2);
  });

  it("interrupt: A has 2 s left → A ends completed:false, B plays now", async () => {
    const s = await voiceSession();
    const a = s.director.say(A);
    const first = s.voices()[0]!;
    first.duration = 3;
    first.seek = 1;
    const b = s.director.say(B);
    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(s.ended).toEqual([{ token: a, completed: false }]);
    expect(s.voices()[1]?.key).toBe(B);
    expect(s.voices()[1]?.play).toHaveBeenCalledTimes(1);
    // A late 'complete' from the cut line is ignored.
    first.finish();
    expect(s.ended).toHaveLength(1);
    s.voices()[1]?.finish();
    expect(s.ended.at(-1)).toEqual({ token: b, completed: true });
  });

  it("same line: say(A) while A plays is ignored and returns A’s token", async () => {
    const s = await voiceSession();
    const a = s.director.say(A);
    expect(s.director.say(A)).toBe(a);
    expect(s.voices()).toHaveLength(1);
    expect(s.voices()[0]?.stop).not.toHaveBeenCalled();
    expect(s.ended).toEqual([]);
  });

  it("pending replaced: A in tail, B pending, say(C) → B ends false, C plays after A", async () => {
    const s = await voiceSession();
    const a = s.director.say(A);
    const first = s.voices()[0]!;
    first.seek = first.duration - 0.2;
    const b = s.director.say(B);
    const c = s.director.say(C);
    expect(s.ended).toEqual([{ token: b, completed: false }]);
    first.finish();
    expect(s.ended).toEqual([
      { token: b, completed: false },
      { token: a, completed: true },
    ]);
    expect(s.voices().map((v) => v.key)).toEqual([A, C]);
    s.voices()[1]?.finish();
    expect(s.ended.at(-1)).toEqual({ token: c, completed: true });
  });

  it("sfx while busy plays at once and leaves the voice alone", async () => {
    const s = await voiceSession();
    s.director.say(A);
    s.director.sfx("sfx.shell.pop");
    expect(s.sound.play).toHaveBeenCalledWith("sfx.shell.pop", {});
    expect(s.voices()[0]?.stop).not.toHaveBeenCalled();
  });

  it("locked: say(A) is held and plays on unlocked, ducking the music started then", async () => {
    const s = await voiceSession({ locked: true });
    const token = s.director.say(A);
    expect(token).toBe(1);
    expect(s.voices()).toHaveLength(0);
    s.sound.fireUnlocked();
    expect(s.voices()).toHaveLength(1);
    expect(s.voices()[0]?.play).toHaveBeenCalledTimes(1);
    const music = s.sound.instances.find((i) => i.key === "music.island");
    expect(music?.play).toHaveBeenCalledTimes(1);
    expect(s.ramp).toHaveBeenCalledWith(
      music,
      DUCKED,
      Timing.musicDuckDownMs,
      0,
    );
  });

  it("unknown id: token returned, ended completed:false on a microtask, one warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const s = await voiceSession();
    const token = s.director.say("vo.shell.nope");
    expect(token).toBe(1);
    expect(s.ended).toEqual([]);
    await flush();
    expect(s.ended).toEqual([{ token, completed: false }]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(s.ramp).not.toHaveBeenCalled();
  });

  it("not loaded (add throws): ended completed:false on a microtask, one warning, music restored", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const s = await voiceSession();
    s.sound.add.mockImplementationOnce(() => {
      throw new Error('Audio key "vo.shell.greeting" not found in cache');
    });
    const token = s.director.say(A);
    expect(s.ended).toEqual([]);
    await flush();
    expect(s.ended).toEqual([{ token, completed: false }]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(s.ramp).toHaveBeenLastCalledWith(
      s.music,
      1,
      Timing.musicDuckDownMs,
      Timing.musicDuckRestoreDelayMs,
    );
  });

  it("chain: one token; A then B back to back; one ended after B", async () => {
    const s = await voiceSession();
    const token = s.director.sayChain([A, B]);
    expect(s.voices().map((v) => v.key)).toEqual([A]);
    s.voices()[0]?.finish();
    expect(s.ended).toEqual([]);
    expect(s.voices().map((v) => v.key)).toEqual([A, B]);
    s.voices()[1]?.finish();
    expect(s.ended).toEqual([{ token, completed: true }]);
    expect(s.ramp).toHaveBeenCalledTimes(2);
  });

  it("chain: counts as ≥ 0.5 s left until its last line → a new say interrupts it", async () => {
    const s = await voiceSession();
    const token = s.director.sayChain([A, B]);
    const first = s.voices()[0]!;
    first.seek = first.duration - 0.1;
    s.director.say(C);
    expect(s.ended).toEqual([{ token, completed: false }]);
    expect(s.voices().at(-1)?.key).toBe(C);
  });

  it("chain: same chain while it plays is ignored", async () => {
    const s = await voiceSession();
    const token = s.director.sayChain([A, B]);
    expect(s.director.sayChain([A, B])).toBe(token);
    expect(s.voices()).toHaveLength(1);
  });

  it("replay: stops the playing prompt (completed:false), restarts it with a new token", async () => {
    const s = await voiceSession();
    expect(s.director.replayPrompt()).toBeUndefined();
    s.director.setPrompt(A);
    const first = s.director.replayPrompt();
    const firstInst = s.voices()[0]!;
    const second = s.director.replayPrompt();
    expect(second).toBe((first ?? 0) + 1);
    expect(firstInst.stop).toHaveBeenCalledTimes(1);
    expect(s.ended).toEqual([{ token: first, completed: false }]);
    expect(s.voices().map((v) => v.key)).toEqual([A, A]);
    expect(s.voices()[1]?.play).toHaveBeenCalledTimes(1);
  });

  it("clearPrompt (Story 1.8): nothing to replay afterwards; with an id only that prompt is cleared", async () => {
    const s = await voiceSession();
    s.director.setPrompt(A);
    s.director.clearPrompt(B);
    expect(s.director.replayPrompt()).toBeDefined();
    s.director.clearPrompt(A);
    expect(s.director.replayPrompt()).toBeUndefined();
    s.director.setPrompt(A);
    s.director.clearPrompt();
    expect(s.director.replayPrompt()).toBeUndefined();
  });

  it("chain prompt (Story 2.4): replayPrompt requests [a,b] with restart under a new token", async () => {
    const s = await voiceSession();
    s.director.setPrompt([A, B]);
    const first = s.director.replayPrompt();
    expect(s.voices().map((v) => v.key)).toEqual([A]);
    s.voices()[0]?.finish();
    expect(s.voices().map((v) => v.key)).toEqual([A, B]);
    // Speaker mid-chain: both lines restart from the first, the old token ends false, no overlap.
    const second = s.director.replayPrompt();
    expect(second).toBe((first ?? 0) + 1);
    expect(s.ended).toEqual([{ token: first, completed: false }]);
    expect(s.voices()[1]?.stop).toHaveBeenCalledTimes(1);
    expect(s.voices().map((v) => v.key)).toEqual([A, B, A]);
    s.voices()[2]?.finish();
    s.voices()[3]?.finish();
    expect(s.ended.at(-1)).toEqual({ token: second, completed: true });
  });

  it("chain prompt: clearPrompt() and clearPrompt(one of its lines) forget it; an unknown id keeps the old prompt", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const s = await voiceSession();
    s.director.setPrompt([A, B]);
    s.director.clearPrompt();
    expect(s.director.replayPrompt()).toBeUndefined();
    s.director.setPrompt([A, B]);
    s.director.clearPrompt(C);
    expect(s.director.replayPrompt()).toBeDefined();
    s.director.clearPrompt(B);
    expect(s.director.replayPrompt()).toBeUndefined();
    s.director.setPrompt(B);
    s.director.setPrompt([A, "vo.shell.nope"]);
    expect(warn).toHaveBeenCalledTimes(1);
    s.director.replayPrompt();
    expect(s.voices().at(-1)?.key).toBe(B);
  });

  it("stop(token) (Story 2.4): cuts the current utterance with that token (completed:false)", async () => {
    const s = await voiceSession();
    const a = s.director.say(A);
    s.director.stop(a);
    expect(s.voices()[0]?.stop).toHaveBeenCalledTimes(1);
    expect(s.ended).toEqual([{ token: a, completed: false }]);
    // Music restored once the channel is idle.
    expect(s.ramp).toHaveBeenLastCalledWith(s.music, 1, Timing.musicDuckDownMs, Timing.musicDuckRestoreDelayMs);
    s.director.stop(a); // already ended: no-op
    expect(s.ended).toHaveLength(1);
  });

  it("stop(token): a pending utterance is dropped; the current one keeps playing", async () => {
    const s = await voiceSession();
    const a = s.director.say(A);
    const first = s.voices()[0]!;
    first.seek = first.duration - 0.2;
    const b = s.director.say(B);
    s.director.stop(b);
    expect(s.ended).toEqual([{ token: b, completed: false }]);
    expect(first.stop).not.toHaveBeenCalled();
    first.finish();
    expect(s.voices()).toHaveLength(1);
    expect(s.ended.at(-1)).toEqual({ token: a, completed: true });
  });

  it("stop(token): another token current → untouched", async () => {
    const s = await voiceSession();
    const a = s.director.say(A);
    s.director.stop(a + 5);
    expect(s.voices()[0]?.stop).not.toHaveBeenCalled();
    expect(s.ended).toEqual([]);
  });

  it("replay also cuts an unrelated line and drops the pending one", async () => {
    const s = await voiceSession();
    s.director.setPrompt(A);
    const b = s.director.say(B);
    const inst = s.voices()[0]!;
    inst.seek = inst.duration - 0.1;
    const c = s.director.say(C);
    const r = s.director.replayPrompt();
    expect(s.ended).toEqual([
      { token: c, completed: false },
      { token: b, completed: false },
    ]);
    expect(s.voices().at(-1)?.key).toBe(A);
    expect(r).toBe(c + 1);
  });

  it("hidden: current and pending both end completed:false, music paused, nothing resumes", async () => {
    const s = await voiceSession();
    const a = s.director.say(A);
    const first = s.voices()[0]!;
    first.seek = first.duration - 0.1;
    const b = s.director.say(B);
    s.doc.set("hidden");
    expect(s.ended).toEqual([
      { token: b, completed: false },
      { token: a, completed: false },
    ]);
    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(s.music?.pause).toHaveBeenCalledTimes(1);
    s.doc.set("visible");
    await flush();
    expect(s.voices()).toHaveLength(1);
    expect(s.ended).toHaveLength(2);
  });

  it("a new line cancels a pending restore (ducks again)", async () => {
    const s = await voiceSession();
    s.director.say(A);
    s.voices()[0]?.finish(); // idle → restore ramp (delayed 500 ms)
    s.director.say(B);
    expect(s.ramp.mock.calls.map((c) => [c[1], c[3]])).toEqual([
      [DUCKED, 0],
      [1, Timing.musicDuckRestoreDelayMs],
      [DUCKED, 0],
    ]);
  });

  it("music started while a line plays starts already ducked", async () => {
    const s = await voiceSession({ music: false });
    s.director.say(A);
    s.director.music("music.island");
    const music = s.sound.instances.find((i) => i.key === "music.island");
    expect(s.sound.add).toHaveBeenLastCalledWith("music.island", {
      loop: true,
      volume: DUCKED,
    });
    s.voices()[0]?.finish();
    expect(s.ramp).toHaveBeenLastCalledWith(
      music,
      1,
      Timing.musicDuckDownMs,
      Timing.musicDuckRestoreDelayMs,
    );
  });

  it("a speech:ended listener may start the next line (no restore, no double end)", async () => {
    const s = await voiceSession();
    const bus = new Bus();
    const director = new AudioDirector({ bus, rampVolume: s.ramp });
    const sound = fakeSound(false);
    director.attach(sound, fakeDoc());
    const ended: number[] = [];
    bus.on("speech:ended", (e) => {
      ended.push(e.token);
      if (e.token === 1) director.say(B);
    });
    director.say(A);
    sound.instances[0]?.finish();
    expect(ended).toEqual([1]);
    expect(sound.instances.map((i) => i.key)).toEqual([A, B]);
  });

  it("a say() from the listener of a dropped pending line is not lost (every token ends once)", async () => {
    const s = await voiceSession();
    const bus = new Bus();
    const director = new AudioDirector({ bus, rampVolume: s.ramp });
    const sound = fakeSound(false);
    director.attach(sound, fakeDoc());
    const ended: Array<{ token: number; completed: boolean }> = [];
    let nested: number | undefined;
    director.say(A);
    sound.instances[0]!.seek = sound.instances[0]!.duration - 0.2;
    const b = director.say(B); // pending in A's tail
    bus.on("speech:ended", (e) => {
      ended.push(e);
      if (e.token === b) nested = director.say(B);
    });
    const c = director.say(C); // drops B → listener re-requests B
    expect(nested).toBeDefined();
    // The nested B replaced C as the pending line, so C ended — nothing is left without an end.
    expect(ended).toEqual([
      { token: b, completed: false },
      { token: c, completed: false },
    ]);
    sound.instances[0]?.finish();
    expect(sound.instances.map((i) => i.key)).toEqual([A, B]);
    sound.instances[1]?.finish();
    expect(ended.at(-1)).toEqual({ token: nested, completed: true });
  });
});

describe("rampVolume (default, WebAudio gain param)", () => {
  function fakeParam(value: number) {
    return {
      value,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    };
  }

  it("cancels, holds the current value, then ramps on the audio clock", () => {
    const gain = fakeParam(1);
    const inst = {
      ...fakeInstance("music.island"),
      volumeNode: { gain, context: { currentTime: 10 } },
    };
    rampVolume(inst, 0.1, 150, 0);
    expect(gain.cancelScheduledValues).toHaveBeenCalledWith(10);
    expect(gain.setValueAtTime.mock.calls).toEqual([[1, 10]]);
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.1, 10.15);
  });

  it("with a delay: holds until now+delay, then ramps (no timers)", () => {
    const gain = fakeParam(0.1);
    const inst = {
      ...fakeInstance("music.island"),
      volumeNode: { gain, context: { currentTime: 4 } },
    };
    rampVolume(inst, 1, 150, 500);
    expect(gain.cancelScheduledValues).toHaveBeenCalledWith(4);
    expect(gain.setValueAtTime.mock.calls).toEqual([
      [0.1, 4],
      [0.1, 4.5],
    ]);
    expect(gain.linearRampToValueAtTime.mock.calls[0]?.[0]).toBe(1);
    expect(gain.linearRampToValueAtTime.mock.calls[0]?.[1]).toBeCloseTo(
      4.65,
      10,
    );
  });

  it("without a gain node sets volume directly", () => {
    const inst = fakeInstance("music.island");
    rampVolume(inst, 0.1, 150, 0);
    expect(inst.volume).toBe(0.1);
  });
});

// I/O matrix (Story 1.11): audioSession present / absent / setter throws.
describe("attach: navigator.audioSession (silent switch)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("present: sets type to 'playback'", () => {
    const director = new AudioDirector({ bus: new Bus() });
    const nav = { audioSession: { type: "auto" } };
    director.attach(fakeSound(true), fakeDoc(), nav);
    expect(nav.audioSession.type).toBe(AUDIO_SESSION_PLAYBACK);
    expect(AUDIO_SESSION_PLAYBACK).toBe("playback");
  });

  it("absent (or no navigator): no-op, no warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    new AudioDirector({ bus: new Bus() }).attach(fakeSound(true), fakeDoc(), {});
    new AudioDirector({ bus: new Bus() }).attach(fakeSound(true), fakeDoc());
    expect(warn).not.toHaveBeenCalled();
  });

  it("setter throws: warns once and attach continues (visibility handling still wired)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const nav = {
      audioSession: {
        get type(): string {
          return "auto";
        },
        set type(_v: string) {
          throw new Error("NotSupportedError");
        },
      },
    };
    const director = new AudioDirector({ bus: new Bus() });
    const doc = fakeDoc();
    const listen = vi.spyOn(doc, "addEventListener");
    director.attach(fakeSound(true), doc, nav);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith(VISIBILITY_CHANGE, expect.any(Function));
  });

  it("setPlaybackSession: a throwing getter is also caught", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const nav = {
      get audioSession(): { type: string } {
        throw new Error("boom");
      },
    };
    expect(() => setPlaybackSession(nav)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("AudioDirector — speech:line (Story 3.1)", () => {
  async function lineSession() {
    const s = await voiceSession();
    const lines: Array<{ token: number; index: number; id: string }> = [];
    // voiceSession's bus is private to the director; listen through a fresh director on our own bus.
    const bus = new Bus();
    bus.on("speech:line", (e) => void lines.push(e));
    const ended: Array<{ token: number; completed: boolean }> = [];
    bus.on("speech:ended", (e) => void ended.push(e));
    const director = new AudioDirector({ bus, rampVolume: vi.fn<RampVolume>() });
    director.attach(s.sound, s.doc);
    const voices = () => s.sound.instances.filter((i) => i.key.startsWith("vo."));
    return { director, lines, ended, voices };
  }

  it("a single say emits one line, index 0, when it starts", async () => {
    const s = await lineSession();
    const token = s.director.say(A);
    expect(s.lines).toEqual([{ token, index: 0, id: A }]);
    s.voices()[0]?.finish();
    expect(s.lines).toHaveLength(1);
  });

  it("a chain emits each line in order as it starts", async () => {
    const s = await lineSession();
    const token = s.director.sayChain([A, B, C]);
    expect(s.lines).toEqual([{ token, index: 0, id: A }]);
    s.voices()[0]?.finish();
    expect(s.lines.at(-1)).toEqual({ token, index: 1, id: B });
    s.voices()[1]?.finish();
    expect(s.lines.map((l) => l.index)).toEqual([0, 1, 2]);
    expect(s.lines.at(-1)).toEqual({ token, index: 2, id: C });
  });

  it("a cut chain emits no further lines; the cutting line reports after the cut end", async () => {
    const s = await lineSession();
    const chain = s.director.sayChain([A, B, C]);
    const cutter = s.director.say(B);
    expect(s.ended).toEqual([{ token: chain, completed: false }]);
    expect(s.lines.filter((l) => l.token === chain)).toEqual([{ token: chain, index: 0, id: A }]);
    expect(s.lines.at(-1)).toEqual({ token: cutter, index: 0, id: B });
    // The old chain's instance completing late is stale: nothing more for it.
    s.voices()[0]?.finish();
    expect(s.lines.filter((l) => l.token === chain)).toHaveLength(1);
  });
});

describe("AudioDirector — Story 5.3 fadeOut / holdSfx", () => {
  /** Gives the voice instance a gain node so fadeOut ramps instead of stopping. */
  const withGain = <T extends object>(inst: T): T => {
    Object.assign(inst, {
      volumeNode: {
        gain: {
          value: 1,
          cancelScheduledValues: vi.fn(),
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        context: { currentTime: 0 },
      },
    });
    return inst;
  };

  it("fades the playing token to 0 over promptFadeOutMs; ended false once; channel free at once", async () => {
    const s = await voiceSession();
    const a = s.director.say(A);
    const inst = withGain(s.voices()[0]!);
    inst.seek = inst.duration - 0.1; // in the queue tail: a new say would normally wait
    s.director.fadeOut(a);
    expect(s.ramp).toHaveBeenCalledWith(inst, 0, Timing.promptFadeOutMs, 0);
    expect(inst.stop).not.toHaveBeenCalled();
    expect(s.ended).toEqual([{ token: a, completed: false }]);
    const b = s.director.say(B);
    expect(s.voices()).toHaveLength(2);
    expect(s.voices()[1]?.key).toBe(B);
    // The new utterance stops the fading one at once.
    expect(inst.stop).toHaveBeenCalledTimes(1);
    expect(inst.destroy).toHaveBeenCalled();
    inst.finish();
    expect(s.ended).toEqual([{ token: a, completed: false }]);
    expect(b).toBe(a + 1);
    expect(Timing.promptFadeOutMs).toBeLessThanOrEqual(200);
  });

  it("a fading instance reaching complete is released, nothing is emitted twice", async () => {
    const s = await voiceSession();
    const a = s.director.say(A);
    const inst = withGain(s.voices()[0]!);
    s.director.fadeOut(a);
    inst.finish();
    expect(inst.destroy).toHaveBeenCalledTimes(1);
    expect(s.ended).toEqual([{ token: a, completed: false }]);
    s.director.say(B); // nothing fading anymore: no extra stop
    expect(inst.stop).not.toHaveBeenCalled();
  });

  it("hiding the page stops a fading instance", async () => {
    const s = await voiceSession();
    const a = s.director.say(A);
    const inst = withGain(s.voices()[0]!);
    s.director.fadeOut(a);
    s.doc.set("hidden");
    expect(inst.stop).toHaveBeenCalledTimes(1);
    expect(s.ended).toHaveLength(1);
  });

  it("no gain node: stops at once", async () => {
    const s = await voiceSession();
    const a = s.director.say(A);
    s.director.fadeOut(a);
    expect(s.voices()[0]?.stop).toHaveBeenCalledTimes(1);
    expect(s.ended).toEqual([{ token: a, completed: false }]);
  });

  it("a pending token is dropped (completed:false); the current one keeps playing", async () => {
    const s = await voiceSession();
    s.director.say(A);
    const first = s.voices()[0]!;
    first.seek = first.duration - 0.2;
    const b = s.director.say(B);
    s.director.fadeOut(b);
    expect(s.ended).toEqual([{ token: b, completed: false }]);
    expect(first.stop).not.toHaveBeenCalled();
  });

  it("a pending line starts as soon as the current one fades", async () => {
    const s = await voiceSession();
    const a = s.director.say(A);
    const first = withGain(s.voices()[0]!);
    first.seek = first.duration - 0.2;
    s.director.say(B);
    s.director.fadeOut(a);
    expect(s.voices().at(-1)?.key).toBe(B);
  });

  it("an unknown token is a no-op", async () => {
    const s = await voiceSession();
    const a = s.director.say(A);
    s.director.fadeOut(a + 7);
    expect(s.voices()[0]?.stop).not.toHaveBeenCalled();
    expect(s.ended).toEqual([]);
  });

  it("holdSfx(true) drops sfx until released", async () => {
    const s = await voiceSession();
    s.director.holdSfx(true);
    s.director.sfx("sfx.shell.pop");
    expect(s.sound.play).not.toHaveBeenCalled();
    s.director.holdSfx(false);
    s.director.sfx("sfx.shell.pop");
    expect(s.sound.play).toHaveBeenCalledTimes(1);
  });
});
