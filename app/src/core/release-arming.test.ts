// Seamless play I/O matrix, "Assets" row: a restart of the same scene keeps its assets.
import { describe, expect, it } from 'vitest';
import { ReleaseArming } from './release-arming';

describe('ReleaseArming (seamless play: keep assets on restart)', () => {
  it('a restart → rearm (no release); the real exit after it → release once', () => {
    const r = new ReleaseArming();
    r.arm('ice-cream');
    r.markRestart('ice-cream');
    expect(r.onShutdown('ice-cream')).toBe('rearm');
    expect(r.onShutdown('ice-cream')).toBe('release');
    expect(r.onShutdown('ice-cream')).toBe('ignore');
  });

  it('two restarts in a row, then the exit: rearm, rearm, release', () => {
    const r = new ReleaseArming();
    r.arm('pizza');
    const seen: string[] = [];
    r.markRestart('pizza');
    seen.push(r.onShutdown('pizza'));
    r.markRestart('pizza');
    seen.push(r.onShutdown('pizza'));
    seen.push(r.onShutdown('pizza'));
    expect(seen).toEqual(['rearm', 'rearm', 'release']);
  });

  it('a restart mark for another game does not suppress this game\'s release', () => {
    const r = new ReleaseArming();
    r.arm('ice-cream');
    r.arm('pizza');
    r.markRestart('pizza');
    expect(r.onShutdown('ice-cream')).toBe('release');
    expect(r.onShutdown('pizza')).toBe('rearm');
  });

  it('no restart: the first shutdown releases; a fresh start drops a stale restart mark', () => {
    const r = new ReleaseArming();
    r.arm('race');
    expect(r.onShutdown('race')).toBe('release');
    r.markRestart('race');
    r.arm('race');
    expect(r.onShutdown('race')).toBe('release');
  });

  it('a game never armed: ignore', () => {
    expect(new ReleaseArming().onShutdown('fishing')).toBe('ignore');
  });
});
