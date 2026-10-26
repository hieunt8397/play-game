// Story 7.3: AudioDirector's capped note pool (the band's notes), stopNotes, musicId, and the beat's ducking (the
// existing music ducking under a voice line).
import { describe, expect, it, vi } from 'vitest';
import { AudioDirector, SOUND_COMPLETE, type RampVolume, type SoundInstanceLike, type SoundLike } from './audio-director';
import { Bus } from './bus';
import { Timing } from './timing';

function fakeInstance(key: string, withGain: boolean) {
  const handlers = new Map<string, Array<() => void>>();
  const inst = {
    key,
    isPlaying: false,
    isPaused: false,
    duration: 0.6,
    seek: 0,
    volume: 1,
    ...(withGain ? { volumeNode: { gain: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, context: { currentTime: 0 } } } : {}),
    once: vi.fn((event: string, fn: () => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), fn]);
    }),
    destroy: vi.fn(),
    finish() {
      inst.isPlaying = false;
      for (const fn of handlers.get(SOUND_COMPLETE) ?? []) fn();
      handlers.delete(SOUND_COMPLETE);
    },
    play: vi.fn(() => ((inst.isPlaying = true), true)),
    pause: vi.fn(() => true),
    resume: vi.fn(() => true),
    stop: vi.fn(() => ((inst.isPlaying = false), true)),
  };
  return inst satisfies SoundInstanceLike & { key: string };
}

function setup(opts: { locked?: boolean; withGain?: boolean } = {}) {
  const instances: Array<ReturnType<typeof fakeInstance>> = [];
  const sound = {
    locked: opts.locked ?? false,
    context: { state: 'running', resume: vi.fn(async () => undefined) },
    once: vi.fn(),
    play: vi.fn(() => true),
    add: vi.fn((key: string) => {
      const inst = fakeInstance(key, opts.withGain ?? false);
      instances.push(inst);
      return inst;
    }),
  } satisfies SoundLike;
  const ramp = vi.fn<RampVolume>();
  const director = new AudioDirector({ bus: new Bus(), now: () => 0, rampVolume: ramp });
  director.attach(sound, { visibilityState: 'visible', addEventListener: () => undefined });
  return { director, sound, instances, ramp };
}

const NOTES = ['sfx.band.drum.c4', 'sfx.band.horn.e4', 'sfx.band.frog.g4', 'sfx.band.xylophone.c5', 'sfx.band.bell.g5', 'sfx.band.drum.d4'];

describe('AudioDirector.note (Story 7.3)', () => {
  it('plays each note at once as its own instance (no queue, several at a time)', () => {
    const { director, instances } = setup();
    director.note(NOTES[0]!, 5);
    director.note(NOTES[1]!, 5);
    expect(instances.map((i) => i.key)).toEqual([NOTES[0], NOTES[1]]);
    expect(instances.every((i) => i.isPlaying)).toBe(true);
    expect(director.liveNotes).toBe(2);
  });

  it('past the cap the oldest note is cut (stopped at once without a gain node)', () => {
    const { director, instances } = setup();
    for (const id of NOTES) director.note(id, 5);
    expect(director.liveNotes).toBe(5);
    expect(instances[0]!.stop).toHaveBeenCalledTimes(1);
    expect(instances.slice(1).every((i) => i.isPlaying)).toBe(true);
  });

  it('with a gain node the cut note fades over bandNoteCutMs (no click) and is released when it runs out', () => {
    const { director, instances, ramp } = setup({ withGain: true });
    for (const id of NOTES) director.note(id, 5);
    expect(ramp).toHaveBeenCalledWith(instances[0], 0, Timing.bandNoteCutMs, 0);
    expect(instances[0]!.stop).not.toHaveBeenCalled();
    instances[0]!.finish();
    expect(instances[0]!.destroy).toHaveBeenCalled();
    expect(director.liveNotes).toBe(5);
  });

  it('a finished note leaves the pool', () => {
    const { director, instances } = setup();
    director.note(NOTES[0]!, 5);
    instances[0]!.finish();
    expect(director.liveNotes).toBe(0);
    expect(instances[0]!.destroy).toHaveBeenCalled();
  });

  it('stopNotes cuts every note (Home); a hidden page does too', () => {
    const { director, instances } = setup();
    director.note(NOTES[0]!, 5);
    director.note(NOTES[1]!, 5);
    director.stopNotes();
    expect(director.liveNotes).toBe(0);
    expect(instances.every((i) => i.stop.mock.calls.length === 1)).toBe(true);
  });

  it('while locked, held (skip) or for an unknown id nothing plays and nothing waits', () => {
    const locked = setup({ locked: true });
    locked.director.note(NOTES[0]!, 5);
    expect(locked.sound.add).not.toHaveBeenCalled();
    const held = setup();
    held.director.holdSfx(true);
    held.director.note(NOTES[0]!, 5);
    expect(held.sound.add).not.toHaveBeenCalled();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    held.director.holdSfx(false);
    held.director.note('sfx.band.nope.c4', 5);
    expect(held.sound.add).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('AudioDirector.musicId and the beat (Story 7.3)', () => {
  it('names the current loop; the beat replaces it and the island loop comes back', () => {
    const { director, instances } = setup();
    director.music('music.island');
    expect(director.musicId).toBe('music.island');
    director.music('music.band-beat');
    expect(director.musicId).toBe('music.band-beat');
    expect(instances[0]!.stop).toHaveBeenCalled();
    director.stopMusic();
    expect(director.musicId).toBeUndefined();
    director.music('music.island');
    expect(director.musicId).toBe('music.island');
  });

  it('the beat ducks under a voice line (the existing music ducking)', () => {
    const { director, instances, ramp } = setup({ withGain: true });
    director.music('music.band-beat');
    const beat = instances[0]!;
    director.say('vo.band.prompt');
    expect(ramp).toHaveBeenCalledWith(beat, expect.any(Number), Timing.musicDuckDownMs, 0);
    const [, gain] = ramp.mock.calls[0]!;
    expect(gain).toBeLessThan(0.2);
  });
});

describe('Story 7.3 review: music release, fades and position', () => {
  function withSchedule() {
    const s = setup({ withGain: true });
    const scheduled: Array<{ fn: () => void; ms: number }> = [];
    const director = new AudioDirector({ bus: new Bus(), now: () => 0, rampVolume: s.ramp, schedule: (fn, ms) => scheduled.push({ fn, ms }) });
    director.attach(s.sound, { visibilityState: 'visible', addEventListener: () => undefined });
    return { ...s, director, scheduled };
  }

  it('stopMusic stops and destroys the loop (no stopped instance piles up); a new music() does too', () => {
    const { director, instances } = setup();
    director.music('music.band-beat');
    director.stopMusic();
    expect(instances[0]!.stop).toHaveBeenCalledTimes(1);
    expect(instances[0]!.destroy).toHaveBeenCalledTimes(1);
    director.music('music.band-beat');
    director.music('music.island');
    expect(instances[1]!.destroy).toHaveBeenCalledTimes(1);
  });

  it('fadeOutMusic ramps the loop to 0, frees the channel at once and releases the instance when the fade ends', () => {
    const { director, instances, ramp, scheduled } = withSchedule();
    director.music('music.island');
    director.fadeOutMusic(500);
    expect(director.musicId).toBeUndefined();
    expect(ramp).toHaveBeenLastCalledWith(instances[0], 0, 500, 0);
    expect(instances[0]!.stop).not.toHaveBeenCalled();
    expect(scheduled.map((s) => s.ms)).toEqual([500]);
    scheduled[0]!.fn();
    expect(instances[0]!.stop).toHaveBeenCalledTimes(1);
    expect(instances[0]!.destroy).toHaveBeenCalledTimes(1);
  });

  it('music(id, fadeInMs) starts silent and ramps up to its level', () => {
    const { director, sound, instances, ramp } = withSchedule();
    director.music('music.island', 400);
    expect(sound.add).toHaveBeenLastCalledWith('music.island', expect.objectContaining({ volume: 0 }));
    expect(ramp).toHaveBeenLastCalledWith(instances[0], 1, 400, 0);
  });

  it('musicPositionMs reads the playing loop’s seek (undefined when nothing plays)', () => {
    const { director, instances } = setup();
    expect(director.musicPositionMs).toBeUndefined();
    director.music('music.band-beat');
    instances[0]!.seek = 1.25;
    expect(director.musicPositionMs).toBe(1250);
  });
});
