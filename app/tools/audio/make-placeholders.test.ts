import { describe, expect, it } from 'vitest';
import { AUDIO_IDS } from '../../src/content/audio-catalog.ts';
import { ALL_PROPS } from '../../src/content/games/touch-talk.ts';
import { DINO_PARTIALS, FISHING_PARTIALS, PIZZA_PARTIALS, RACE_PARTIALS, SHADOW_PARTIALS, WOOF_PARTIALS, WOOF_SECONDS, CHIRP_PARTIALS, CHIRP_SECONDS, buildArgs, isRecording, resolveFfmpeg } from './make-placeholders.ts';

function valueAfter(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

describe('buildArgs', () => {
  it.each(['sfx.shell.pop', 'music.island'] as const)('%s encodes mono AAC 44.1 kHz 64k to the given file', (id) => {
    const args = buildArgs(id, 'out.m4a');
    expect(valueAfter(args, '-ac')).toBe('1');
    expect(valueAfter(args, '-ar')).toBe('44100');
    expect(valueAfter(args, '-c:a')).toBe('aac');
    expect(valueAfter(args, '-b:a')).toBe('64k');
    expect(args.at(-1)).toBe('out.m4a');
    expect(valueAfter(args, '-i')).toMatch(/^aevalsrc='.+':s=44100:d=/);
  });

  it('pop: 140 ms, fade-in ≥ 50 ms, nothing below 150 Hz, peak −20 dBFS', () => {
    const args = buildArgs('sfx.shell.pop', 'o.m4a');
    expect(valueAfter(args, '-i')).toMatch(/:d=0\.14$/);
    expect(valueAfter(args, '-i')).toMatch(/^aevalsrc='0\.1\*sin\(/);
    const af = valueAfter(args, '-af') ?? '';
    const fadeIn = /afade=t=in:st=0:d=([0-9.]+)/.exec(af);
    expect(Number(fadeIn?.[1])).toBeGreaterThanOrEqual(0.05);
    expect(af).toMatch(/afade=t=out:.*curve=exp/);
    expect(af).toMatch(/highpass=f=150/);
  });

  it.each(['sfx.shell.happy', 'sfx.shell.prop'] as const)('%s: fade-in ≥ 50 ms, nothing below 150 Hz, peak −20 dBFS', (id) => {
    const args = buildArgs(id, 'o.m4a');
    expect(valueAfter(args, '-i')).toMatch(/^aevalsrc='0\.1\*/);
    const af = valueAfter(args, '-af') ?? '';
    const fadeIn = /afade=t=in:st=0:d=([0-9.]+)/.exec(af);
    expect(Number(fadeIn?.[1])).toBeGreaterThanOrEqual(0.05);
    expect(af).toMatch(/highpass=f=150/);
  });

  it('happy: a rising two-note chime of 0.35 s; prop: a ~100 ms tick', () => {
    const happy = valueAfter(buildArgs('sfx.shell.happy', 'o.m4a'), '-i') ?? '';
    expect(happy).toMatch(/:d=0\.35$/);
    expect(happy).toMatch(/784\*t.*1047\*t/);
    expect(valueAfter(buildArgs('sfx.shell.prop', 'o.m4a'), '-i')).toMatch(/:d=0\.1$/);
  });

  it('kart-beep: a ~200 ms two-tone horn, fade-in ≥ 50 ms, nothing below 150 Hz, peak ≤ −20 dBFS', () => {
    const args = buildArgs('sfx.shell.kart-beep', 'o.m4a');
    const src = valueAfter(args, '-i') ?? '';
    expect(src).toMatch(/:d=0\.2$/);
    expect(src).toMatch(/659\*t.*880\*t/);
    // Each tone: 0.07 + 0.03 under a sin envelope → peak 0.1.
    expect(src.match(/0\.07\*sin/g)).toHaveLength(2);
    expect(src.match(/0\.03\*sin/g)).toHaveLength(2);
    const af = valueAfter(args, '-af') ?? '';
    expect(Number(/afade=t=in:st=0:d=([0-9.]+)/.exec(af)?.[1])).toBeGreaterThanOrEqual(0.05);
    expect(af).toMatch(/highpass=f=150/);
  });

  it('woof (Story 5.2): two soft yips ≤ 400 ms, partials ≥ 300 Hz, cubic fade-in, highpass 150 Hz, peak −20 dBFS', () => {
    const args = buildArgs('sfx.shell.woof', 'o.m4a');
    const src = valueAfter(args, '-i') ?? '';
    expect(src).toMatch(/^aevalsrc='0\.1\*/);
    expect(WOOF_SECONDS).toBeLessThanOrEqual(0.4);
    expect(src).toMatch(new RegExp(`:d=${WOOF_SECONDS}$`));
    for (const hz of WOOF_PARTIALS) expect(hz).toBeGreaterThanOrEqual(300);
    const af = valueAfter(args, '-af') ?? '';
    expect(af).toMatch(/afade=t=in:st=0:d=0\.05:curve=cub/);
    expect(af).toMatch(/highpass=f=150/);
  });

  it('chirp (Story 5.4): two soft high chirps ≤ 400 ms, partials ≥ 300 Hz, cubic fade-in, highpass 150 Hz, peak −20 dBFS', () => {
    const args = buildArgs('sfx.shell.chirp', 'o.m4a');
    const src = valueAfter(args, '-i') ?? '';
    expect(src).toMatch(/^aevalsrc='0\.1\*/);
    expect(CHIRP_SECONDS).toBeLessThanOrEqual(0.4);
    expect(src).toMatch(new RegExp(`:d=${CHIRP_SECONDS}$`));
    for (const hz of CHIRP_PARTIALS) expect(hz).toBeGreaterThanOrEqual(300);
    const af = valueAfter(args, '-af') ?? '';
    expect(af).toMatch(/afade=t=in:st=0:d=0\.05:curve=cub/);
    expect(af).toMatch(/highpass=f=150/);
  });

  it.each(['sfx.ice-cream.snap', 'sfx.ice-cream.happy'] as const)('%s (Story 1.8): fade-in ≥ 50 ms, nothing below 150 Hz, peak −20 dBFS', (id) => {
    const args = buildArgs(id, 'o.m4a');
    expect(valueAfter(args, '-i')).toMatch(/^aevalsrc='0\.1\*/);
    const af = valueAfter(args, '-af') ?? '';
    expect(Number(/afade=t=in:st=0:d=([0-9.]+)/.exec(af)?.[1])).toBeGreaterThanOrEqual(0.05);
    expect(af).toMatch(/highpass=f=150/);
  });

  it('ice-cream snap: a ~150 ms plop; happy: a ~1.5 s C-E-G-C arpeggio', () => {
    expect(valueAfter(buildArgs('sfx.ice-cream.snap', 'o.m4a'), '-i')).toMatch(/:d=0\.15$/);
    const tune = valueAfter(buildArgs('sfx.ice-cream.happy', 'o.m4a'), '-i') ?? '';
    expect(tune).toMatch(/:d=1\.5$/);
    expect(tune).toMatch(/523\*t.*659\*t.*784\*t.*1047\*t/);
  });

  it('music: 12 s loop normalised with loudnorm I=-30', () => {
    const args = buildArgs('music.island', 'o.m4a');
    expect(valueAfter(args, '-i')).toMatch(/:d=12$/);
    expect(valueAfter(args, '-af')).toMatch(/loudnorm=I=-30:TP=-3/);
  });
});

describe('resolveFfmpeg', () => {
  it('prefers FFMPEG_BIN when it runs', () => {
    expect(resolveFfmpeg({ FFMPEG_BIN: 'C:/ff/ffmpeg.exe' }, (bin) => bin === 'C:/ff/ffmpeg.exe')).toBe('C:/ff/ffmpeg.exe');
  });

  it('falls back to ffmpeg on PATH', () => {
    expect(resolveFfmpeg({}, (bin) => bin === 'ffmpeg')).toBe('ffmpeg');
  });

  it('fails clearly when ffmpeg is missing', () => {
    expect(() => resolveFfmpeg({}, () => false)).toThrow(/ffmpeg not found: install ffmpeg .* FFMPEG_BIN/);
  });

  it('fails clearly when FFMPEG_BIN points nowhere', () => {
    expect(() => resolveFfmpeg({ FFMPEG_BIN: 'nope' }, () => false)).toThrow(/FFMPEG_BIN="nope" does not run/);
  });
});

describe('Tiệm pizza SFX (Story 3.1)', () => {
  const IDS = ['sfx.pizza.snap', 'sfx.pizza.ting', 'sfx.pizza.munch', 'sfx.pizza.happy'] as const;

  it.each(IDS)('%s: fade-in ≥ 50 ms, highpass 150 Hz, peak ≤ −20 dBFS', (id) => {
    const args = buildArgs(id, 'o.m4a');
    const af = valueAfter(args, '-af') ?? '';
    expect(Number(/afade=t=in:st=0:d=([0-9.]+)/.exec(af)?.[1])).toBeGreaterThanOrEqual(0.05);
    expect(af).toMatch(/highpass=f=150/);
    expect(valueAfter(args, '-i')).toMatch(/^aevalsrc='(0\.1\*|between)/);
  });

  it.each(IDS)('%s: every partial is ≥ 300 Hz and appears in the expression', (id) => {
    const src = valueAfter(buildArgs(id, 'o.m4a'), '-i') ?? '';
    for (const hz of PIZZA_PARTIALS[id]) {
      expect(hz).toBeGreaterThanOrEqual(300);
      expect(src).toContain(`${hz}`);
    }
    // No other frequency hides in a `2*PI*<hz>*t` term.
    for (const m of src.matchAll(/2\*PI\*\(?(\d+)\*t/g)) expect(PIZZA_PARTIALS[id]).toContain(Number(m[1]));
  });

  it('durations: snap ~150 ms, ting ~400 ms, munch ≤ 700 ms, happy ~1.5 s', () => {
    const d = (id: (typeof IDS)[number]): number => Number(/:d=([0-9.]+)$/.exec(valueAfter(buildArgs(id, 'o.m4a'), '-i') ?? '')?.[1]);
    expect(d('sfx.pizza.snap')).toBe(0.15);
    expect(d('sfx.pizza.ting')).toBe(0.4);
    expect(d('sfx.pizza.munch')).toBeLessThanOrEqual(0.7);
    expect(d('sfx.pizza.happy')).toBe(1.5);
  });
});

describe('Ghép khủng long SFX (Story 3.3)', () => {
  const IDS = Object.keys(DINO_PARTIALS) as (keyof typeof DINO_PARTIALS)[];
  const CALLS = ['sfx.dino-puzzle.apatosaurus.happy', 'sfx.dino-puzzle.triceratops.happy', 'sfx.dino-puzzle.stegosaurus.happy'] as const;
  const d = (id: (typeof IDS)[number]): number => Number(/:d=([0-9.]+)$/.exec(valueAfter(buildArgs(id, 'o.m4a'), '-i') ?? '')?.[1]);

  it.each(IDS)('%s: fade-in ≥ 50 ms, highpass 150 Hz, peak ≤ −20 dBFS, partials ≥ 300 Hz', (id) => {
    const args = buildArgs(id, 'o.m4a');
    const af = valueAfter(args, '-af') ?? '';
    expect(Number(/afade=t=in:st=0:d=([0-9.]+)/.exec(af)?.[1])).toBeGreaterThanOrEqual(0.05);
    expect(af).toMatch(/highpass=f=150/);
    const src = valueAfter(args, '-i') ?? '';
    expect(src).toMatch(/^aevalsrc='0\.1\*/);
    for (const hz of DINO_PARTIALS[id]) expect(hz).toBeGreaterThanOrEqual(300);
  });

  it('the creature calls: soft hoot 600 ms, two chirps 400 ms, trill 500 ms (all ≤ 800 ms, cubic fade-in)', () => {
    expect(CALLS.map(d)).toEqual([0.6, 0.4, 0.5]);
    for (const id of CALLS) expect(valueAfter(buildArgs(id, 'o.m4a'), '-af')).toMatch(/curve=cub/);
    expect(valueAfter(buildArgs('sfx.dino-puzzle.apatosaurus.happy', 'o.m4a'), '-i')).toMatch(/392\*t.*330\*t/);
    expect(valueAfter(buildArgs('sfx.dino-puzzle.triceratops.happy', 'o.m4a'), '-i')).toMatch(/659\*t.*784\*t/);
    expect(valueAfter(buildArgs('sfx.dino-puzzle.stegosaurus.happy', 'o.m4a'), '-i')).toMatch(/523\*t-2\.5\*cos/);
  });

  it('snap ~150 ms, happy tune ~1.5 s', () => {
    expect(d('sfx.dino-puzzle.snap')).toBe(0.15);
    expect(d('sfx.dino-puzzle.happy')).toBe(1.5);
  });
});

describe('Hang tìm bóng SFX (Story 3.5)', () => {
  const IDS = Object.keys(SHADOW_PARTIALS) as (keyof typeof SHADOW_PARTIALS)[];
  const d = (id: (typeof IDS)[number]): number => Number(/:d=([0-9.]+)$/.exec(valueAfter(buildArgs(id, 'o.m4a'), '-i') ?? '')?.[1]);

  it.each(IDS)('%s: fade-in ≥ 50 ms, highpass 150 Hz, peak ≤ −20 dBFS, partials ≥ 300 Hz', (id) => {
    const args = buildArgs(id, 'o.m4a');
    const af = valueAfter(args, '-af') ?? '';
    expect(Number(/afade=t=in:st=0:d=([0-9.]+)/.exec(af)?.[1])).toBeGreaterThanOrEqual(0.05);
    expect(af).toMatch(/highpass=f=150/);
    expect(valueAfter(args, '-i') ?? '').toMatch(/^aevalsrc='0\.1\*/);
    for (const hz of SHADOW_PARTIALS[id]) expect(hz).toBeGreaterThanOrEqual(300);
  });

  it('snap ~150 ms, happy ~1.5 s (2026-10-22: no triceratops chirp any more)', () => {
    expect(d('sfx.shadow-match.snap')).toBe(0.15);
    expect(d('sfx.shadow-match.happy')).toBe(1.5);
    // The snap decays exponentially: at its end the envelope is near silence (≤ 5 % of the peak).
    const snap = valueAfter(buildArgs('sfx.shadow-match.snap', 'o.m4a'), '-i') ?? '';
    const k = Number(/exp\(-([0-9.]+)\*t\)/.exec(snap)?.[1]);
    expect(k).toBeGreaterThan(0);
    expect(Math.exp(-k * d('sfx.shadow-match.snap'))).toBeLessThanOrEqual(0.05);
    expect(Object.keys(SHADOW_PARTIALS)).toEqual(['sfx.shadow-match.snap', 'sfx.shadow-match.happy']);
  });
});

describe('Đường đua SFX (Story 4.1)', () => {
  const IDS = Object.keys(RACE_PARTIALS) as (keyof typeof RACE_PARTIALS)[];
  const d = (id: (typeof IDS)[number]): number => Number(/:d=([0-9.]+)$/.exec(valueAfter(buildArgs(id, 'o.m4a'), '-i') ?? '')?.[1]);

  it.each(IDS)('%s: fade-in ≥ 50 ms, highpass 150 Hz, peak ≤ −20 dBFS, partials ≥ 300 Hz', (id) => {
    const args = buildArgs(id, 'o.m4a');
    const af = valueAfter(args, '-af') ?? '';
    expect(Number(/afade=t=in:st=0:d=([0-9.]+)/.exec(af)?.[1])).toBeGreaterThanOrEqual(0.05);
    expect(af).toMatch(/highpass=f=150/);
    expect(valueAfter(args, '-i') ?? '').toMatch(/^aevalsrc='0\.1\*/);
    for (const hz of RACE_PARTIALS[id]) expect(hz).toBeGreaterThanOrEqual(300);
  });

  it('engine ~400 ms, horn ~300 ms, happy ~1.5 s', () => {
    expect(d('sfx.race.engine')).toBe(0.4);
    expect(d('sfx.race.horn')).toBe(0.3);
    expect(d('sfx.race.happy')).toBe(1.5);
  });
});

describe('Câu cá SFX (Story 4.3)', () => {
  const IDS = Object.keys(FISHING_PARTIALS) as (keyof typeof FISHING_PARTIALS)[];
  const d = (id: (typeof IDS)[number]): number => Number(/:d=([0-9.]+)$/.exec(valueAfter(buildArgs(id, 'o.m4a'), '-i') ?? '')?.[1]);

  it.each(IDS)('%s: fade-in ≥ 50 ms, highpass 150 Hz, peak ≤ −20 dBFS, partials ≥ 300 Hz', (id) => {
    const args = buildArgs(id, 'o.m4a');
    const af = valueAfter(args, '-af') ?? '';
    expect(Number(/afade=t=in:st=0:d=([0-9.]+)/.exec(af)?.[1])).toBeGreaterThanOrEqual(0.05);
    expect(af).toMatch(/highpass=f=150/);
    expect(valueAfter(args, '-i') ?? '').toMatch(/^aevalsrc='0\.1\*/);
    for (const hz of FISHING_PARTIALS[id]) expect(hz).toBeGreaterThanOrEqual(300);
  });

  it('plop ~200 ms, bubble ~400 ms, reel ~600 ms, happy ~1.5 s', () => {
    expect(d('sfx.fishing.plop')).toBe(0.2);
    expect(d('sfx.fishing.bubble')).toBe(0.4);
    expect(d('sfx.fishing.reel')).toBe(0.6);
    expect(d('sfx.fishing.happy')).toBe(1.5);
  });
});

describe('real recordings (Chạm là nói batch 3, Tiệm kem sneeze)', () => {
  const touchTalk = AUDIO_IDS.filter((id) => id.startsWith('sfx.touch-talk.'));
  it('every Chạm là nói prop sound (one per ALL_PROPS entry) and the sneeze are recordings: no recipe, so main() never overwrites them', () => {
    expect([...touchTalk].sort()).toEqual(ALL_PROPS.map((p) => p.sfxId).sort());
    for (const id of [...touchTalk, 'sfx.ice-cream.sneeze' as const]) {
      expect(isRecording(id), id).toBe(true);
      expect(() => buildArgs(id, 'o.m4a'), id).toThrow(/no recipe/);
    }
  });

  it('every other catalog id still has a placeholder recipe', () => {
    for (const id of AUDIO_IDS.filter((i) => !isRecording(i))) expect(() => buildArgs(id, 'o.m4a'), id).not.toThrow();
  });
});
