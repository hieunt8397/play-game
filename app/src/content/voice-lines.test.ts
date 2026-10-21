import { describe, expect, it } from 'vitest';
import { islandPrompt } from './voice-lines';

describe('islandPrompt (Story 1.8)', () => {
  it('after a game, the island Speaker names the station the kart is parked at, never the game request', () => {
    expect(islandPrompt('ice-cream')).toBe('vo.shell.station-name.ice-cream');
    expect(islandPrompt(undefined)).toBeUndefined();
    expect(islandPrompt('nope')).toBeUndefined();
  });
});
