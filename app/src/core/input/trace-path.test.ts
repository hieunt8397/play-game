// Story 4.1: TracePath on a fake router and guard (grab circle, setDragging, release/self-heal, events).
import { describe, expect, it, vi } from 'vitest';
import { fakeScene, press } from './fakes';
import { InputGuard } from './guard';
import { locate, NO_INSETS } from './space';
import { createTapRouter } from './tap-router';
import { createTapTarget } from './tap-target';
import { createTracePath } from './trace-path';
import type { TraceEvent } from './trace-model';

const VIEW = { w: 1024, h: 768, rotated: false, insets: NO_INSETS };

function world() {
  const guard = new InputGuard((p) => locate(p, undefined, VIEW));
  const scene = fakeScene();
  const router = createTapRouter(scene, { guard });
  const events: TraceEvent[] = [];
  const trace = createTracePath(router, { points: [{ x: 100, y: 400 }, { x: 700, y: 400 }], onEvent: (e) => events.push(e), guard });
  const kinds = (): string[] => events.map((e) => e.kind);
  return { guard, scene, router, trace, events, kinds };
}

describe('createTracePath (Story 4.1)', () => {
  it('Grab: a press 90 px from the kart → grab in the same pointerdown, setDragging, lift listeners', () => {
    const w = world();
    const setDragging = vi.spyOn(w.guard, 'setDragging');
    const lifts: boolean[] = [];
    w.trace.onLiftChange((l) => lifts.push(l));
    w.scene.down(press(100, 490));
    expect(w.kinds()).toEqual(['grab']);
    expect(setDragging).toHaveBeenCalledWith(expect.anything(), true);
    expect(w.trace.state).toBe('tracing');
    expect(w.trace.isDragging()).toBe(true);
    expect(lifts).toEqual([true]);
  });

  it('Far press (130 px, on the road) does nothing', () => {
    const w = world();
    w.scene.down(press(230, 400));
    expect(w.events).toEqual([]);
    expect(w.trace.state).toBe('idle');
  });

  it('moves and ticks advance the kart; the grab circle follows it; release → wait, s kept', () => {
    const w = world();
    const p = press(100, 400);
    w.scene.down(p);
    w.scene.move(p, 200, 400);
    w.trace.tick(100);
    expect(w.trace.s).toBe(100);
    expect(w.trace.point).toEqual({ x: 200, y: 400 });
    w.scene.up(p);
    expect(w.kinds()).toEqual(['grab', 'progress', 'wait']);
    expect(w.trace.state).toBe('waiting');
    // The old start is too far now; next to the kart grabs again.
    const far = press(80, 400, 2);
    w.scene.down(far);
    expect(w.trace.state).toBe('waiting');
    w.scene.up(far);
    const q = press(210, 420, 3);
    w.scene.down(q);
    expect(w.trace.state).toBe('tracing');
    expect(w.trace.s).toBe(100);
  });

  it('Dead zone: a press at local (10, 400) never traces', () => {
    const w = world();
    w.trace.restore(0);
    const t = createTracePath(w.router, { points: [{ x: 10, y: 400 }, { x: 600, y: 400 }], onEvent: () => undefined, guard: w.guard });
    w.scene.down(press(10, 400));
    expect(t.state).toBe('idle');
  });

  it('Second finger (incl. a Hud tap) while tracing is ignored; the trace continues', () => {
    const w = world();
    const hudScene = fakeScene();
    const hud = createTapRouter(hudScene, { guard: w.guard, layer: 'hud' });
    const home = vi.fn();
    createTapTarget(hud, { circle: { x: 70, y: 70, r: 68 }, onPress: home });
    const p = press(100, 400, 1);
    w.scene.down(p);
    hudScene.down(press(70, 70, 2));
    expect(home).not.toHaveBeenCalled();
    w.scene.move(p, 160, 400);
    w.trace.tick(60);
    expect(w.trace.s).toBe(60);
    expect(w.trace.state).toBe('tracing');
  });

  it('Self-heal (scene paused before the release) releases the model; setEnabled(false) lets go; destroy stops events', () => {
    const w = world();
    const p = press(100, 400);
    w.scene.down(p);
    w.scene.state.active = false;
    w.scene.up(p);
    w.scene.state.active = true;
    expect(w.trace.state).toBe('waiting');
    expect(w.trace.isDragging()).toBe(false);

    const v = world();
    v.scene.down(press(100, 400));
    v.trace.setEnabled(false);
    expect(v.trace.state).toBe('waiting');
    v.trace.destroy();
    v.events.length = 0;
    v.scene.down(press(100, 400, 4));
    v.trace.tick(50);
    expect(v.events).toEqual([]);
  });

  it('restore(index) waits at index × step', () => {
    const w = world();
    w.trace.restore(50);
    expect(w.trace.point).toEqual({ x: 300, y: 400 });
    expect(w.trace.state).toBe('waiting');
  });
});
