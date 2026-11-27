// The train ride's handoff (2026-11-13, spec-tau-quanh-dao): each value is taken once; a bad one is dropped.
import { describe, expect, it } from 'vitest';
import { setTrainStart, setTrainView, takeTrainStart, takeTrainView } from './ride-handoff';
import { enterPlan, pullBackPlan } from './motion';
import { Tokens } from './tokens';

describe('ride handoff', () => {
  it('Map → game: the arc length is taken once', () => {
    setTrainStart(123.5);
    expect(takeTrainStart()).toBe(123.5);
    expect(takeTrainStart()).toBeUndefined();
    setTrainStart(Number.NaN);
    expect(takeTrainStart()).toBeUndefined();
  });

  it('game → Map: the view is taken once', () => {
    setTrainView({ x: 300, y: 200 });
    expect(takeTrainView()).toEqual({ x: 300, y: 200 });
    expect(takeTrainView()).toBeUndefined();
  });

  it('the zoom in and the pull-back use the train game`s zoom when asked (reduced motion: the fade)', () => {
    expect(enterPlan(false, Tokens.ui.trainZoom)).toMatchObject({ kind: 'zoom', zoom: Tokens.ui.trainZoom });
    expect(pullBackPlan(false, Tokens.ui.trainZoom)).toMatchObject({ kind: 'zoom', fromZoom: Tokens.ui.trainZoom, toZoom: 1 });
    expect(enterPlan(true, Tokens.ui.trainZoom).kind).toBe('fade');
  });
});
