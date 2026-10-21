// Kart trip controller (Story 1.7), pure. Turns station and kart taps plus `tick(delta)` into
// commands the Map applies; nothing here touches Phaser, timers or tweens, so the kart moves only on
// `tick` (a paused scene freezes it) and Vitest covers the timing.
//
//   parked → (awake tap) departing [Timing.stationTapMs] → driving → arrived → (settled) entering
//   entering → entered() → parked at that stop
//
// - Awake tap (parked/departing/driving): bounce, say + setPrompt the name, `load` the first time this
//   trip targets the id. parked → departing; departing keeps its timer; driving re-targets from the
//   current `s` with a new duration counted from the tap. Re-tapping the current target (or any awake
//   tap while `arrived`) only bounces and says the name.
// - Drive duration: clamp(|Δs| / cruise, minMs, capMs()), or 0 when Δs = 0; linear in `s`.
// - Sleeping-station tap (any state but entering): bounce + happy SFX only.
// - Kart tap: bounce + beep; while driving the remaining time × boostTimeScale.
// - `enter` is emitted once, when the drive has ended and `assetsSettled(target)` was seen (either order).
// - entering ignores every tap; `entered()` parks the kart at that stop.
import { MAX_TICK_MS } from './map-idle';
import type { Road } from './road';
import { Tokens } from './tokens';

export { MAX_TICK_MS };

export const SFX_HAPPY = 'sfx.shell.happy';
export const SFX_KART_BEEP = 'sfx.shell.kart-beep';
/** The bounce target of the kart itself. */
export const KART_TARGET = 'kart';
/** |dx| below this (a near-vertical road stretch) keeps the current facing (move dx = 0). */
export const FACING_MIN_DX = 0.25;

export type TripState = 'parked' | 'departing' | 'driving' | 'arrived' | 'entering';

export type TripCommand =
  | { readonly kind: 'bounce'; readonly target: string }
  | { readonly kind: 'say'; readonly lineId: string }
  | { readonly kind: 'setPrompt'; readonly lineId: string }
  | { readonly kind: 'sfx'; readonly id: string }
  | { readonly kind: 'load'; readonly gameId: string }
  /** `dx`: x direction of travel (−1…1); 0 = keep the current facing. */
  | { readonly kind: 'move'; readonly x: number; readonly y: number; readonly dx: number }
  | { readonly kind: 'enter'; readonly gameId: string };

export interface KartTripTiming {
  readonly departMs: number;
  readonly minMs: number;
  readonly cruisePxPerMs: number;
  readonly boostTimeScale: number;
}

export interface KartTripOptions {
  readonly road: Pick<Road, 'pointAt' | 'dirAt'>;
  /** Arc length of each station's stop (`project(anchors['<id>-stop'])`). */
  readonly stops: Readonly<Record<string, number>>;
  readonly startS: number;
  /** Drive cap: kartDriveMaxMs until the session's first arrival, then kartDriveRepeatMaxMs. */
  readonly capMs: () => number;
  /** True when the station opens a game (its id is in games/registry GAMES). */
  readonly isAwake: (id: string) => boolean;
  /** The name line of a station (content/voice-lines › stationNameLine). */
  readonly nameLine: (id: string) => string;
  /** Called on every arrival (Map counts the session's trips). */
  readonly onArrive?: (id: string) => void;
  readonly timing?: KartTripTiming;
}

export const DEFAULT_TRIP_TIMING: KartTripTiming = {
  departMs: Tokens.Timing.stationTapMs,
  minMs: Tokens.Timing.kartDriveMinMs,
  cruisePxPerMs: Tokens.ui.kartCruisePxPerMs,
  boostTimeScale: Tokens.ui.kartBoostTimeScale,
};

interface Drive {
  from: number;
  to: number;
  duration: number;
  elapsed: number;
}

export class KartTrip {
  private _state: TripState = 'parked';
  private _s: number;
  private _target: string | undefined;
  private departLeft = 0;
  private drive: Drive | undefined;
  /** Ids already loaded this trip. */
  private readonly loaded = new Set<string>();
  /** Ids whose assets settled this trip. */
  private readonly settled = new Set<string>();
  private readonly timing: KartTripTiming;
  private readonly opts: KartTripOptions;

  constructor(opts: KartTripOptions) {
    this.opts = opts;
    this._s = opts.startS;
    this.timing = opts.timing ?? DEFAULT_TRIP_TIMING;
  }

  get state(): TripState {
    return this._state;
  }

  get s(): number {
    return this._s;
  }

  get target(): string | undefined {
    return this._target;
  }

  /** Remaining drive time (ms) while driving, else 0. */
  get remainingMs(): number {
    return this.drive ? Math.max(0, this.drive.duration - this.drive.elapsed) : 0;
  }

  /** Duration (ms) of the current drive (since its start, re-target or boost), else 0. */
  get driveMs(): number {
    return this.drive?.duration ?? 0;
  }

  /** Drive time for |Δs| = `distance` px under the current cap. */
  durationFor(distance: number): number {
    const d = Math.abs(distance);
    if (d === 0) return 0;
    return Math.min(this.opts.capMs(), Math.max(this.timing.minMs, d / this.timing.cruisePxPerMs));
  }

  tapStation(id: string): TripCommand[] {
    if (this._state === 'entering') return [];
    if (!this.opts.isAwake(id)) return [{ kind: 'bounce', target: id }, { kind: 'sfx', id: SFX_HAPPY }];
    const line = this.opts.nameLine(id);
    const out: TripCommand[] = [{ kind: 'bounce', target: id }, { kind: 'say', lineId: line }];
    const stop = this.opts.stops[id];
    if (this._state === 'arrived' || stop === undefined) return out;
    if (this._state !== 'parked' && id === this._target) return out;
    out.push({ kind: 'setPrompt', lineId: line });
    if (!this.loaded.has(id)) {
      this.loaded.add(id);
      out.push({ kind: 'load', gameId: id });
    }
    this._target = id;
    if (this._state === 'parked') {
      this._state = 'departing';
      this.departLeft = this.timing.departMs;
    } else if (this._state === 'driving') {
      this.startDrive();
    }
    return out;
  }

  tapKart(): TripCommand[] {
    if (this._state === 'entering') return [];
    if (this._state === 'driving' && this.drive) {
      const left = Math.max(0, this.drive.duration - this.drive.elapsed);
      this.drive = { from: this._s, to: this.drive.to, duration: left * this.timing.boostTimeScale, elapsed: 0 };
    }
    return [
      { kind: 'bounce', target: KART_TARGET },
      { kind: 'sfx', id: SFX_KART_BEEP },
    ];
  }

  tick(deltaMs: number): TripCommand[] {
    let d = Math.min(MAX_TICK_MS, Math.max(0, Number.isFinite(deltaMs) ? deltaMs : 0));
    if (this._state === 'departing') {
      this.departLeft -= d;
      if (this.departLeft > 0) return [];
      d = -this.departLeft;
      this.startDrive();
    }
    if (this._state !== 'driving' || !this.drive) return [];
    const drive = this.drive;
    drive.elapsed += d;
    const done = drive.elapsed >= drive.duration;
    this._s = done ? drive.to : drive.from + ((drive.to - drive.from) * drive.elapsed) / drive.duration;
    const out: TripCommand[] = [this.move(Math.sign(drive.to - drive.from))];
    if (done) out.push(...this.arrive());
    return out;
  }

  /** The game's assets are cached (or failed): enter once the kart has also arrived. */
  assetsSettled(id: string): TripCommand[] {
    this.settled.add(id);
    return this._state === 'arrived' && id === this._target ? this.enter() : [];
  }

  /** The game scene started: park at its stop for the next trip. */
  entered(): void {
    this._state = 'parked';
    this.resetTrip();
  }

  /** Parks the kart at `s` (Map wake / re-create); returns the move that places it. */
  parkAt(s: number): TripCommand[] {
    this._state = 'parked';
    this._s = s;
    this.resetTrip();
    return [this.move(0)];
  }

  private resetTrip(): void {
    this._target = undefined;
    this.drive = undefined;
    this.departLeft = 0;
    this.loaded.clear();
    this.settled.clear();
  }

  private startDrive(): void {
    const to = this._target === undefined ? this._s : (this.opts.stops[this._target] ?? this._s);
    this.drive = { from: this._s, to, duration: this.durationFor(to - this._s), elapsed: 0 };
    this._state = 'driving';
  }

  /** Move to the current `s`; facing from the segment just travelled (`sign` of Δs, 0 = keep). */
  private move(sign: number): TripCommand {
    const p = this.opts.road.pointAt(this._s);
    const dx = sign === 0 ? 0 : -this.opts.road.dirAt(this._s, -sign);
    // On a near-vertical stretch keep the facing instead of flipping on a tiny x component.
    return { kind: 'move', x: p.x, y: p.y, dx: Math.abs(dx) < FACING_MIN_DX ? 0 : dx };
  }

  private arrive(): TripCommand[] {
    this._state = 'arrived';
    this.drive = undefined;
    const id = this._target;
    if (id === undefined) return [];
    this.opts.onArrive?.(id);
    return this.settled.has(id) ? this.enter() : [];
  }

  private enter(): TripCommand[] {
    const id = this._target;
    if (id === undefined) return [];
    this._state = 'entering';
    return [{ kind: 'enter', gameId: id }];
  }
}
