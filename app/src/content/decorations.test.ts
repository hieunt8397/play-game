// Story 5.4: every decoration has a tap sound type, and every type maps to a boot-loaded shell SFX.
import { describe, expect, it } from 'vitest';
import { AUDIO_CATALOG, AUDIO_IDS } from './audio-catalog';
import { DECORATION_SOUNDS, DECORATIONS, decorationSfx } from './decorations';

describe('decoration sounds (Story 5.4)', () => {
  it('every decoration has a sound type with a DECORATION_SOUNDS entry', () => {
    for (const d of Object.values(DECORATIONS).flat()) {
      expect(Object.keys(DECORATION_SOUNDS), d.id).toContain(d.sound);
    }
  });

  it('every DECORATION_SOUNDS value is an sfx.shell.* catalog id', () => {
    for (const id of Object.values(DECORATION_SOUNDS)) {
      expect(id).toMatch(/^sfx\.shell\./);
      expect(AUDIO_IDS).toContain(id);
      expect(AUDIO_CATALOG[id].kind).toBe('sfx');
    }
  });

  it('food keeps the happy chime; a vehicle beeps, a creature chirps, a thing ticks; unknown ids fall back to happy', () => {
    expect(decorationSfx('sundae')).toBe('sfx.shell.happy');
    expect(decorationSfx('taxi')).toBe('sfx.shell.kart-beep');
    expect(decorationSfx('koi')).toBe('sfx.shell.chirp');
    expect(decorationSfx('alpaca')).toBe('sfx.shell.chirp');
    expect(decorationSfx('street-lamp')).toBe('sfx.shell.prop');
    expect(decorationSfx('nope')).toBe('sfx.shell.happy');
  });
});
