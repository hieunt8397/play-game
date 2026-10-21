import { describe, expect, it, vi } from 'vitest';

// stage.ts imports `Scale` from phaser, which needs a browser; installPageGuards does not use it.
vi.mock('phaser', () => ({ Scale: {} }));

const { installPageGuards } = await import('./stage');

describe('installPageGuards', () => {
  function fakeDoc() {
    const calls: Array<{ type: string; fn: (e: Event) => void; opts: AddEventListenerOptions | undefined }> = [];
    const images = [{ draggable: true }, { draggable: true }];
    const doc = {
      images,
      addEventListener(type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions) {
        calls.push({ type, fn, opts });
      },
    };
    return { doc: doc as unknown as Document, calls, images };
  }

  it('blocks zoom, menus, selection, dragging and page scroll with non-passive listeners', () => {
    const { doc, calls, images } = fakeDoc();
    installPageGuards(doc);

    expect(new Set(calls.map((c) => c.type))).toEqual(
      new Set(['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'selectstart', 'dragstart', 'touchmove']),
    );
    for (const c of calls) {
      expect(c.opts?.passive, c.type).toBe(false);
      const event = { cancelable: true, preventDefault: vi.fn() };
      c.fn(event as unknown as Event);
      expect(event.preventDefault, c.type).toHaveBeenCalledTimes(1);
    }
    expect(images.every((img) => img.draggable === false)).toBe(true);
  });

  it('does not call preventDefault on a non-cancelable event', () => {
    const { doc, calls } = fakeDoc();
    installPageGuards(doc);
    const event = { cancelable: false, preventDefault: vi.fn() };
    calls[0]!.fn(event as unknown as Event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
