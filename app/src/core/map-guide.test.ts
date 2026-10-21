// Story 5.2 I/O matrix: First Map entry, Later entries, Invitation, Tap Shiba, Tap during chain,
// Wave while waving (Missing art is planned in map-plan.test.ts).
import { describe, expect, it } from 'vitest';
import { MAP_GUIDE } from '../content/assets';
import { SessionStore } from './session-store';
import { createMapGuide, GUIDE_GREETING, GUIDE_WOOF, waveFrame } from './map-guide';
import { Tokens } from './tokens';

function sessionGuide(store = new SessionStore()) {
  return {
    store,
    guide: createMapGuide({
      greeted: () => store.guideGreeted,
      markGreeted: () => {
        store.guideGreeted = true;
      },
    }),
  };
}

describe('createMapGuide', () => {
  it('first Map entry: wave, the greeting once, the greeting as the prompt; the session flag is set', () => {
    const { store, guide } = sessionGuide();
    expect(store.guideGreeted).toBe(false);
    expect(guide.enter()).toEqual([
      { kind: 'wave' },
      { kind: 'say', lineId: 'vo.shell.greeting' },
      { kind: 'setPrompt', lineId: 'vo.shell.greeting' },
    ]);
    expect(GUIDE_GREETING).toBe('vo.shell.greeting');
    expect(store.guideGreeted).toBe(true);
  });

  it('first entry with an island prompt already set: no setPrompt', () => {
    const { guide } = sessionGuide();
    expect(guide.enter({ hasPrompt: true })).toEqual([{ kind: 'wave' }, { kind: 'say', lineId: GUIDE_GREETING }]);
  });

  it('later entries (create again or a wake) neither greet nor wave — also from a new guide in the same session', () => {
    const store = new SessionStore();
    const a = sessionGuide(store).guide;
    expect(a.enter()).toHaveLength(3);
    expect(a.enter()).toEqual([]);
    expect(sessionGuide(store).guide.enter()).toEqual([]);
  });

  it('invitation: a wave', () => {
    expect(sessionGuide().guide.invite()).toEqual([{ kind: 'wave' }]);
  });

  it('tap while parked: bounce + woof; while the chain blocks it: nothing', () => {
    const { guide } = sessionGuide();
    expect(guide.tap({ blocked: false })).toEqual([{ kind: 'bounce' }, { kind: 'sfx', id: 'sfx.shell.woof' }]);
    expect(GUIDE_WOOF).toBe('sfx.shell.woof');
    expect(guide.tap({ blocked: true })).toEqual([]);
  });
});

describe('waveFrame', () => {
  const t = Tokens.Timing;
  const [f0, f1, f2, f3] = MAP_GUIDE.wave;

  it('the timing tokens: 160 ms frames, exactly two passes over the 4 frames (1280 ms)', () => {
    expect(t.guideWaveFrameMs).toBe(160);
    expect(t.guideWaveMs).toBe(2 * MAP_GUIDE.wave.length * t.guideWaveFrameMs);
    expect(t.guideWaveMs).toBe(1280);
  });

  it('cycles the 4 frames, then ends (undefined → idle)', () => {
    expect(waveFrame(0, false)).toBe(f0);
    expect(waveFrame(t.guideWaveFrameMs, false)).toBe(f1);
    expect(waveFrame(2 * t.guideWaveFrameMs + 1, false)).toBe(f2);
    expect(waveFrame(3 * t.guideWaveFrameMs, false)).toBe(f3);
    expect(waveFrame(4 * t.guideWaveFrameMs, false)).toBe(f0);
    // The wave ends exactly after the second pass: the last frame is wave/03, then idle.
    expect(waveFrame(t.guideWaveMs - 1, false)).toBe(f3);
    expect(waveFrame(t.guideWaveMs, false)).toBeUndefined();
    expect(waveFrame(-1, false)).toBeUndefined();
  });

  it('wave while waving: a restart (elapsed back to 0) shows frame 00 again', () => {
    expect(waveFrame(5 * t.guideWaveFrameMs, false)).toBe(f1);
    expect(waveFrame(0, false)).toBe(f0);
  });

  it('reduced motion holds the first frame for the whole wave', () => {
    for (const ms of [0, t.guideWaveFrameMs, 3 * t.guideWaveFrameMs, t.guideWaveMs - 1]) expect(waveFrame(ms, true)).toBe(f0);
    expect(waveFrame(t.guideWaveMs, true)).toBeUndefined();
  });

  it('only the frames given (missing art): none → no wave', () => {
    expect(waveFrame(t.guideWaveFrameMs, false, [f0!, f2!])).toBe(f2);
    expect(waveFrame(0, false, [])).toBeUndefined();
  });
});
