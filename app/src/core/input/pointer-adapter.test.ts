// Story 1.6: the pointer's raw client point (touch identifier matching, mouse, inverse fallback).
import { describe, expect, it } from 'vitest';
import { clientPoint } from './pointer-adapter';

const touch = (identifier: number, clientX: number, clientY: number) => ({ identifier, clientX, clientY });

describe('clientPoint', () => {
  it('a touch event: the changedTouches entry with the pointer identifier', () => {
    const event = { changedTouches: [touch(3, 1, 2), touch(7, 30, 40)], touches: [] };
    expect(clientPoint({ x: 0, y: 0, identifier: 7, event })).toEqual({ x: 30, y: 40 });
  });

  it('falls back to touches when changedTouches lacks the identifier', () => {
    const event = { changedTouches: [touch(3, 1, 2)], touches: [touch(3, 1, 2), touch(9, 50, 60)] };
    expect(clientPoint({ x: 0, y: 0, identifier: 9, event })).toEqual({ x: 50, y: 60 });
  });

  it('a mouse / pointer event: clientX/Y', () => {
    expect(clientPoint({ x: 0, y: 0, event: { clientX: 11, clientY: 22 } })).toEqual({ x: 11, y: 22 });
  });

  it('no usable event: inverts Phaser transformX/Y with the scale manager', () => {
    const scale = { displayScale: { x: 0.5, y: 0.5 }, canvasBounds: { left: -10, top: 20 } };
    expect(clientPoint({ x: 100, y: 50 }, scale)).toEqual({ x: 190, y: 120 });
    // Touch event without the finger: also the fallback.
    expect(clientPoint({ x: 100, y: 50, identifier: 1, event: { changedTouches: [], touches: [] } }, scale)).toEqual({ x: 190, y: 120 });
  });

  it('no event and no scale: the pointer point as is', () => {
    expect(clientPoint({ x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
  });
});
