// Story 1.6: Hud layout, Speaker wave, Speaker / Home controller and the Hud mode.
import { describe, expect, it, vi } from 'vitest';
import { Bus } from './bus';
import { homeLine, HudController, hudLayout, SFX_POP, VO_HOME, VO_HOME_YARD, waveFrame, wavePeriodMs, type HudView } from './hud';
import { getHomeTarget, getHudMode, setHomeTarget, setHudMode } from './hud-mode';
import { NO_INSETS, visibleDesignRect } from './input/space';
import { Tokens } from './tokens';

describe('hudLayout', () => {
  it('1180x820, no insets: Home (64, 112.2), Speaker (960, 192.2), hit r = 44 + hitPad', () => {
    const vis = visibleDesignRect({ w: 1180, h: 820, rotated: false, insets: NO_INSETS });
    const l = hudLayout(vis, NO_INSETS);
    expect(l.home.x).toBeCloseTo(64, 6);
    expect(Math.abs(l.home.y - 112.2)).toBeLessThan(0.1);
    expect(l.speaker.x).toBeCloseTo(960, 6);
    expect(Math.abs(l.speaker.y - 192.2)).toBeLessThan(0.1);
    expect(l.size).toBe(88);
    expect(l.speaker.r).toBe(44 + Tokens.spacing.hitPad);
  });

  it('insets push the buttons inward', () => {
    const l = hudLayout({ x: 0, y: 0, w: 1024, h: 768 }, { top: 10, right: 5, bottom: 0, left: 7 });
    expect(l.home).toMatchObject({ x: 20 + 7 + 44, y: 40 + 10 + 44 });
    expect(l.speaker).toMatchObject({ x: 1024 - 20 - 5 - 44, y: 120 + 10 + 44 });
  });
});

describe('waveFrame', () => {
  it('2 rings at 1 Hz, half a period apart, scale 1 -> 1.6 while alpha 0.4 -> 0', () => {
    expect(wavePeriodMs()).toBe(1000);
    const f0 = waveFrame(0, false);
    expect(f0).toHaveLength(2);
    expect(f0[0]).toEqual({ scale: 1, alpha: 0.4 });
    expect(f0[1]!.scale).toBeCloseTo(1.3, 9);
    expect(f0[1]!.alpha).toBeCloseTo(0.2, 9);
    const f = waveFrame(250, false);
    expect(f[0]!.scale).toBeCloseTo(1.15, 9);
    expect(f[0]!.alpha).toBeCloseTo(0.3, 9);
    // Periodic: no on/off blinking, just the phase.
    expect(waveFrame(1250, false)[0]!.scale).toBeCloseTo(1.15, 9);
    expect(waveFrame(999.999, false)[0]!.scale).toBeLessThanOrEqual(Tokens.ui.speakerWaveScale);
  });

  it('reduced motion scales the amplitude', () => {
    expect(waveFrame(500, true)[0]!.scale).toBeCloseTo(1 + 0.6 * 0.5 * 0.5, 9);
  });
});

function controller(replay: () => number | undefined) {
  const calls: string[] = [];
  const view: HudView = {
    pressSpeaker: () => calls.push('press:speaker'),
    pressHome: () => calls.push('press:home'),
    showWave: (on) => calls.push(`wave:${on}`),
    showHome: (on) => calls.push(`home:${on}`),
  };
  const deps = {
    replay: vi.fn(replay),
    say: vi.fn((id: string) => {
      calls.push(`say:${id}`);
      return 1;
    }),
    sfx: vi.fn((id: string) => calls.push(`sfx:${id}`)),
    emitHome: vi.fn(() => calls.push('emit:hud:home')),
    view,
  };
  return { c: new HudController(deps), calls, deps };
}

describe('HudController', () => {
  it('Speaker with a prompt: press + pop, replay, wave until speech:ended for that token', () => {
    const { c, calls } = controller(() => 7);
    c.speaker();
    expect(calls).toEqual(['press:speaker', `sfx:${SFX_POP}`, 'wave:true']);
    expect(c.waveFor).toBe(7);
    c.speechEnded(6);
    expect(calls).not.toContain('wave:false');
    c.speechEnded(7);
    expect(calls.at(-1)).toBe('wave:false');
    expect(c.waveFor).toBeUndefined();
  });

  it('Speaker re-tap: the wave follows the new token; the old ended is ignored', () => {
    let next = 7;
    const { c, calls } = controller(() => next++);
    c.speaker();
    c.speaker();
    expect(c.waveFor).toBe(8);
    c.speechEnded(7);
    expect(calls).not.toContain('wave:false');
    c.speechEnded(8);
    expect(calls.at(-1)).toBe('wave:false');
  });

  it('Speaker with no prompt: only press + pop', () => {
    const { c, calls } = controller(() => undefined);
    c.speaker();
    expect(calls).toEqual(['press:speaker', `sfx:${SFX_POP}`]);
  });

  it('Home: only in game mode it says the line and emits hud:home', () => {
    const { c, calls, deps } = controller(() => undefined);
    c.setMode('map');
    expect(calls).toEqual(['home:false']);
    c.home();
    expect(deps.emitHome).not.toHaveBeenCalled();
    expect(deps.say).not.toHaveBeenCalled();
    c.setMode('game');
    calls.length = 0;
    c.home();
    expect(calls).toEqual(['press:home', `sfx:${SFX_POP}`, `say:${VO_HOME}`, 'emit:hud:home']);
  });
});

describe('hud-mode', () => {
  it('stores the mode and emits hud:mode', () => {
    const bus = new Bus();
    const seen: string[] = [];
    bus.on('hud:mode', ({ mode }) => seen.push(mode));
    setHudMode('game', bus);
    expect(getHudMode()).toBe('game');
    setHudMode('map', bus);
    expect(getHudMode()).toBe('map');
    expect(seen).toEqual(['game', 'map']);
  });

  it('hud:home with no subscriber is a no-op', () => {
    const bus = new Bus();
    expect(() => bus.emit('hud:home')).not.toThrow();
    expect(bus.listenerCount('hud:home')).toBe(0);
  });
});

describe('Story 7.1: the yard and the Home line', () => {
  it('homeLine: "Về nhà nào!" only in a game opened from the yard; "Về đảo nào!" in island games and in the yard', () => {
    expect(homeLine('game', 'yard')).toBe(VO_HOME_YARD);
    expect(homeLine('game', 'island')).toBe(VO_HOME);
    expect(homeLine('yard', 'yard')).toBe(VO_HOME);
    expect(homeLine('yard', 'island')).toBe(VO_HOME);
  });

  it("'yard' mode shows Home; its press says Về đảo nào and emits hud:home", () => {
    const { c, calls } = controller(() => undefined);
    c.setMode('yard');
    expect(calls.at(-1)).toBe('home:true');
    c.home();
    expect(calls.slice(-4)).toEqual(['press:home', `sfx:${SFX_POP}`, `say:${VO_HOME}`, 'emit:hud:home']);
  });

  it("a game opened from the yard: Home says Về nhà nào (deps.homeTarget)", () => {
    const calls: string[] = [];
    const c = new HudController({
      replay: () => undefined,
      say: (id) => {
        calls.push(`say:${id}`);
        return 1;
      },
      sfx: () => undefined,
      emitHome: () => calls.push('emit'),
      homeTarget: () => 'yard',
      view: { pressSpeaker: () => undefined, pressHome: () => undefined, showWave: () => undefined, showHome: () => undefined },
    });
    c.setMode('game');
    c.home();
    expect(calls).toEqual([`say:${VO_HOME_YARD}`, 'emit']);
  });

  it('setHomeTarget / getHomeTarget keep where a game Home leads', () => {
    setHomeTarget('yard');
    expect(getHomeTarget()).toBe('yard');
    setHomeTarget('island');
    expect(getHomeTarget()).toBe('island');
  });
});
