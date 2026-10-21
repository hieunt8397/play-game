// I/O matrix (Story 1.11): Dev, Unsupported and Register rejects rows.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerServiceWorker, swRegistration, SW_SCOPE, SW_URL, type SwContainerLike } from './sw';

afterEach(() => {
  vi.restoreAllMocks();
});

function container(result: () => Promise<{ active: unknown }>): SwContainerLike & { register: ReturnType<typeof vi.fn> } {
  return { register: vi.fn((_url: string, _opts: { scope: string }) => result()) };
}

describe('registerServiceWorker', () => {
  it('registers the relative ./sw.js with scope ./ and stores the promise', async () => {
    const reg = { active: null };
    const c = container(async () => reg);
    const p = registerServiceWorker(c, false);
    expect(c.register).toHaveBeenCalledWith(SW_URL, { scope: SW_SCOPE });
    expect(SW_URL).toBe('./sw.js');
    expect(SW_SCOPE).toBe('./');
    await expect(p).resolves.toBe(reg);
    expect(swRegistration()).toBe(p);
  });

  it('dev: does not register and resolves undefined', async () => {
    const c = container(async () => ({ active: {} }));
    await expect(registerServiceWorker(c, true)).resolves.toBeUndefined();
    expect(c.register).not.toHaveBeenCalled();
    await expect(swRegistration()).resolves.toBeUndefined();
  });

  it('unsupported: no container resolves undefined', async () => {
    await expect(registerServiceWorker(undefined, false)).resolves.toBeUndefined();
    await expect(swRegistration()).resolves.toBeUndefined();
  });

  it('register rejects: one console.warn, resolves undefined', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const c = container(() => Promise.reject(new Error('SecurityError')));
    await expect(registerServiceWorker(c, false)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('register throwing synchronously is treated like a rejection', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const c: SwContainerLike = {
      register: () => {
        throw new Error('SecurityError');
      },
    };
    await expect(registerServiceWorker(c, false)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
