// The train ride's handoff between Map and the train game (2026-11-13, spec-tau-quanh-dao). Both draw the same island
// in the same design coordinates (the game's plate is the map's at 2×), so the handoff is two numbers:
//   - Map → game: the arc length on `path.rail` where the map's train stood when Xoài tapped it (Ga tàu when she tapped
//     the platform or the train was in the tunnel): the game's train starts there, under Map's zoomed camera;
//   - game → Map: the centre of the game's camera when Home was pressed: Map's pull-back starts from that view.
// Each value is taken once (a later start or wake never reuses a stale one).
import type { Point } from '../content/layout-types';

let trainStart: number | undefined;
let trainView: Point | undefined;

export function setTrainStart(s: number): void {
  trainStart = Number.isFinite(s) ? s : undefined;
}

export function takeTrainStart(): number | undefined {
  const s = trainStart;
  trainStart = undefined;
  return s;
}

export function setTrainView(p: Point): void {
  trainView = Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : undefined;
}

export function takeTrainView(): Point | undefined {
  const p = trainView;
  trainView = undefined;
  return p;
}
