import { describe, expect, it } from 'vitest';
import { AUDIO_CATALOG } from '../../src/content/audio-catalog.ts';
import { LOWPASS_STAGES, creatureIds, creatureProblems, measure, measureArgs, parseDurationMs, parseVolume } from './check-sfx.ts';

const WHOLE = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'x.m4a':
  Duration: 00:00:00.62, start: 0.000000, bitrate: 65 kb/s
[Parsed_volumedetect_0 @ 000001] n_samples: 26460
[Parsed_volumedetect_0 @ 000001] mean_volume: -27.5 dB
[Parsed_volumedetect_0 @ 000001] max_volume: -20.1 dB`;

const GOOD = { durationMs: 600, peakDb: -20, lowDb: -76, headDb: -80 };

describe('check-sfx parsers', () => {
  it('reads the duration and the volumes of ffmpeg output', () => {
    expect(parseDurationMs(WHOLE)).toBe(620);
    expect(parseVolume(WHOLE)).toEqual({ meanDb: -27.5, maxDb: -20.1 });
    expect(parseDurationMs('Duration: 00:01:02.5,')).toBe(62500);
  });

  it('-inf (silence) and missing reports', () => {
    expect(parseVolume('mean_volume: -inf dB\nmax_volume: -inf dB')).toEqual({ meanDb: -Infinity, maxDb: -Infinity });
    expect(parseVolume('nothing')).toBeUndefined();
    expect(parseDurationMs('nothing')).toBeUndefined();
  });

  it('measure args: volumedetect, a lowpass cascade at 150 Hz, the first 10 ms', () => {
    const a = measureArgs('f.m4a');
    expect(a.whole).toContain('volumedetect');
    expect(a.low[a.low.indexOf('-af') + 1]).toBe(`${Array(LOWPASS_STAGES).fill('lowpass=f=150').join(',')},volumedetect`);
    expect(a.head[a.head.indexOf('-af') + 1]).toBe('atrim=0:0.01,volumedetect');
  });

  it('measure combines the three runs; an unreadable file throws', () => {
    const low = 'Duration: 00:00:00.62\nmean_volume: -90.0 dB\nmax_volume: -76.0 dB';
    const head = 'Duration: 00:00:00.62\nmean_volume: -81.0 dB\nmax_volume: -70.0 dB';
    const run = (args: string[]): string => (args.join(' ').includes('lowpass') ? low : args.join(' ').includes('atrim') ? head : WHOLE);
    expect(measure('x.m4a', run)).toEqual({ durationMs: 620, peakDb: -20.1, lowDb: -76, headDb: -81 });
    expect(() => measure('x.m4a', () => '')).toThrow(/cannot measure/);
  });
});

describe('creatureProblems', () => {
  it('a gentle call passes', () => {
    expect(creatureProblems('sfx.x.call', GOOD)).toEqual([]);
  });

  it('a silent file (peak -inf) fails naming the id', () => {
    expect(creatureProblems('sfx.x.call', { ...GOOD, peakDb: -Infinity, lowDb: -Infinity, headDb: -Infinity })).toEqual(['sfx.x.call: silent or unreadable (peak -Infinity dBFS)']);
  });

  it('1.0 s long, a 100 Hz hum, too loud, or a click at the start each fail naming the id', () => {
    expect(creatureProblems('sfx.x.call', { ...GOOD, durationMs: 1000 })).toEqual(['sfx.x.call: 1000 ms long (max 800)']);
    expect(creatureProblems('sfx.x.call', { ...GOOD, lowDb: -29 })[0]).toMatch(/^sfx\.x\.call: -29 dBFS below 150 Hz/);
    expect(creatureProblems('sfx.x.call', { ...GOOD, peakDb: -12, headDb: -80 })[0]).toMatch(/peak -12 dBFS/);
    expect(creatureProblems('sfx.x.call', { ...GOOD, headDb: -30 })[0]).toMatch(/first 10 ms/);
  });
});

describe('creatureIds', () => {
  it('the three dino calls and the touch-talk seagull and cheese (mouse squeak) are the catalog creatures', () => {
    expect(creatureIds()).toEqual(['sfx.shell.woof', 'sfx.shell.chirp', 'sfx.ice-cream.sneeze', 'sfx.dino-puzzle.apatosaurus.happy', 'sfx.dino-puzzle.triceratops.happy', 'sfx.dino-puzzle.stegosaurus.happy', 'sfx.touch-talk.seagull', 'sfx.touch-talk.cheese']);
    expect(creatureIds({ a: { ...AUDIO_CATALOG['sfx.shell.pop'] } })).toEqual([]);
  });
});
