// Ú òa chuồng thú controller (Story 7.2), pure and Phaser-free: four pen doors, each hiding one animal; never a
// request that is judged, never a score or a fail sound. Behind injected ports (audio, view) so every rule is
// node-testable; the scene clock drives `tick`.
// - tap(door) on a closed door: it opens (the animal peeks out) and the animal's call plays at once; its name
//   follows `nameDelayMs` later (a newer reveal replaces a waiting name; `say` cuts the one playing, so the
//   latest name wins). The reveal counts; the asked door (if any) is forgotten: any door is fine.
// - tap(door) on an open door: it closes and a different animal goes behind it — never the one it had, never
//   one behind another door (so two animals of a kind never show at once). Not a reveal.
// - tick(dt): the waiting name; after `idleWiggleMs` of quiet one closed door wiggles with its animal's muffled
//   call (never the same door twice in a row while another is closed; one wiggle at a time); an ask ("Con gì
//   kêu meo meo nhỉ?") every `askEvery` reveals (once the name has been said) or after `askIdleMs` without a
//   tap: once the ask line has ended its door wiggles harder with the muffled call (and keeps being the one that
//   wiggles until a tap). A wiggle never starts while another one runs.
// - Closing a door drops its still-waiting name.
// - Round end: the `revealsPerRound`-th reveal calls `onLastReveal` (Home then completes the round) and ends
//   the input; its name, then (`celebrateLeadMs` later) the celebration (every
//   door open, the animals hop) and `onRoundEnd` (the scene schedules the round's completion). No input after.
// The snapshot partial is `{ behind, reveals }`: a resumed round has the same animals behind closed doors and
// the same reveal count.
import type { PenAnimal } from '../../content/games/animal-pens.ts';
import { Tokens } from '../../core/tokens.ts';

export interface PensAudio {
  sfx(id: string): void;
  /** Returns the utterance token (speech:ended carries it). */
  say(id: string): number;
  setPrompt(id: string): void;
}

export interface PensView {
  /** Door `door` swings open and `animalId` peeks out. */
  open(door: number, animalId: string): void;
  /** Door `door` swings shut (the animal behind it is hidden). */
  close(door: number): void;
  /** A closed door wiggles (`hard`: the asked one). */
  wiggle(door: number, hard: boolean): void;
  /** Every door opens and every animal hops. */
  celebrate(behind: readonly string[]): void;
}

export interface PensTimings {
  readonly nameDelayMs: number;
  readonly idleWiggleMs: number;
  readonly askIdleMs: number;
  readonly askEvery: number;
  readonly celebrateLeadMs: number;
  readonly maxDtMs: number;
  /** One gentle wiggle and one hard (asked) wiggle: no other wiggle starts while one runs. */
  readonly wiggleMs: number;
  readonly askWiggleMs: number;
}

export function defaultPensTimings(): PensTimings {
  const t = Tokens.Timing;
  return {
    nameDelayMs: t.animalPensNameDelayMs,
    idleWiggleMs: t.animalPensIdleWiggleMs,
    askIdleMs: t.animalPensAskIdleMs,
    askEvery: Tokens.ui.animalPensAskEvery,
    celebrateLeadMs: t.animalPensCelebrateLeadMs,
    maxDtMs: t.animalPensMaxTickMs,
    wiggleMs: t.animalPensWiggleMs,
    askWiggleMs: t.animalPensAskWiggleMs,
  };
}

export interface PensResume {
  readonly behind: readonly string[];
  readonly reveals: number;
}

export interface PensOptions {
  readonly animals: readonly PenAnimal[];
  readonly doors: number;
  readonly revealsPerRound: number;
  /** The invitation said as the game opens (and kept as the Speaker prompt). */
  readonly inviteLine: string;
  readonly rng: () => number;
  readonly resume?: PensResume | null;
  readonly audio: PensAudio;
  readonly view: PensView;
  /** The round's last reveal: from now on Home completes the round (MiniGameBase.markFinishing). */
  readonly onLastReveal: () => void;
  /** The celebration started: the scene completes the round after it. */
  readonly onRoundEnd: () => void;
  readonly timings?: Partial<PensTimings>;
}

export interface PensProgress {
  readonly questionIndex: number;
  readonly partial: { behind: string[]; reveals: number };
}

export interface PensController {
  readonly reveals: number;
  readonly celebrating: boolean;
  /** The animal behind each door, left to right. */
  readonly behind: readonly string[];
  isOpen(door: number): boolean;
  /** The door the last ask points at while no tap has followed it, else null. */
  readonly askDoor: number | null;
  start(): void;
  tap(door: number): void;
  /** Any press (background and Hud too): the idle clocks restart. */
  anyTap(): void;
  tick(dtMs: number): void;
  speechEnded(token: number): void;
  progress(): PensProgress;
}

/** `count` distinct ids drawn from `ids` with `rng`. */
export function drawDistinct(ids: readonly string[], count: number, rng: () => number): string[] {
  const pool = [...ids];
  const out: string[] = [];
  while (out.length < count && pool.length > 0) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
  return out;
}

export function createPensController(opts: PensOptions): PensController {
  const t = { ...defaultPensTimings(), ...opts.timings };
  const { audio, view, animals } = opts;
  const byId = new Map(animals.map((a) => [a.id, a]));
  const ids = animals.map((a) => a.id);
  if (ids.length < opts.doors + 1) throw new Error(`animal-pens: ${ids.length} animals cannot fill ${opts.doors} doors and swap`);
  const behind: string[] = opts.resume ? [...opts.resume.behind] : drawDistinct(ids, opts.doors, opts.rng);
  const open: boolean[] = behind.map(() => false);
  let reveals = opts.resume?.reveals ?? 0;
  let sinceAsk = 0;
  let pending: { id: string; door: number; msLeft: number } | null = null;
  let speaking: number | null = null;
  let quietMs = 0;
  let idleMs = 0;
  let lastWiggled: number | null = null;
  let askDoor: number | null = null;
  /** The ask line's token: its door's hard wiggle (and muffled call) waits for the line to end. */
  let askToken: number | null = null;
  /** A hard wiggle due (the ask line ended) but waiting for a running wiggle to finish. */
  let hardDue = false;
  /** Time left on the wiggle that runs (one wiggle at a time). */
  let wiggleLeft = 0;
  /** The round's last reveal happened: no more taps; the name, then the celebration. */
  let last = false;
  let ending: number | null = null;
  let celebrating = false;

  const pick = <T>(xs: readonly T[]): T | undefined => (xs.length === 0 ? undefined : xs[Math.floor(opts.rng() * xs.length)]);
  const closedDoors = (): number[] => behind.map((_, i) => i).filter((i) => !open[i]);
  const animal = (door: number): PenAnimal => byId.get(behind[door]!)!;
  const wiggle = (door: number, hard: boolean): void => {
    lastWiggled = door;
    wiggleLeft = hard ? t.askWiggleMs : t.wiggleMs;
    view.wiggle(door, hard);
    audio.sfx(animal(door).muffledSfx);
  };

  const ask = (): boolean => {
    const door = pick(closedDoors());
    if (door === undefined) return false;
    askDoor = door;
    sinceAsk = 0;
    idleMs = 0;
    quietMs = 0;
    const line = animal(door).askLine;
    audio.setPrompt(line);
    speaking = audio.say(line);
    askToken = speaking;
    return true;
  };

  return {
    get reveals() {
      return reveals;
    },
    get celebrating() {
      return celebrating;
    },
    get behind() {
      return behind;
    },
    get askDoor() {
      return askDoor;
    },
    isOpen(door) {
      return open[door] ?? false;
    },
    start() {
      audio.setPrompt(opts.inviteLine);
      speaking = audio.say(opts.inviteLine);
    },
    tap(door) {
      if (celebrating || last || door < 0 || door >= behind.length) return;
      idleMs = 0;
      quietMs = 0;
      if (open[door]) {
        open[door] = false;
        view.close(door);
        // A name still waiting for this door would name an animal no longer showing.
        if (pending?.door === door) pending = null;
        const next = pick(ids.filter((id) => !behind.includes(id)));
        if (next !== undefined) behind[door] = next;
        return;
      }
      open[door] = true;
      askDoor = null;
      askToken = null;
      hardDue = false;
      const a = animal(door);
      view.open(door, a.id);
      audio.sfx(a.callSfx);
      pending = { id: a.id, door, msLeft: t.nameDelayMs };
      reveals += 1;
      sinceAsk += 1;
      if (reveals >= opts.revealsPerRound) {
        last = true;
        opts.onLastReveal();
      }
    },
    anyTap() {
      idleMs = 0;
      quietMs = 0;
    },
    tick(dtMs) {
      if (celebrating) return;
      const dt = Math.max(0, Math.min(t.maxDtMs, Number.isFinite(dtMs) ? dtMs : 0));
      wiggleLeft = Math.max(0, wiggleLeft - dt);
      if (pending) {
        pending.msLeft -= dt;
        if (pending.msLeft <= 0) {
          const line = byId.get(pending.id)!.nameLine;
          pending = null;
          audio.setPrompt(line);
          speaking = audio.say(line);
          quietMs = 0;
          if (last) ending = t.celebrateLeadMs;
        }
        return;
      }
      if (ending !== null) {
        ending -= dt;
        if (ending <= 0) {
          ending = null;
          celebrating = true;
          open.fill(true);
          askDoor = null;
          view.celebrate([...behind]);
          opts.onRoundEnd();
        }
        return;
      }
      if (hardDue && wiggleLeft <= 0) {
        hardDue = false;
        quietMs = 0;
        if (askDoor !== null && !open[askDoor]) wiggle(askDoor, true);
        return;
      }
      quietMs += dt;
      idleMs += dt;
      // An ask after `askEvery` reveals waits for the last name to end (and a beat of quiet); the idle ask does not.
      const askDue = (sinceAsk >= t.askEvery && speaking === null && quietMs >= t.nameDelayMs) || idleMs >= t.askIdleMs;
      if (askDue && askToken === null && ask()) return;
      if (quietMs >= t.idleWiggleMs && wiggleLeft <= 0 && askToken === null) {
        quietMs = 0;
        if (askDoor !== null && !open[askDoor]) {
          wiggle(askDoor, true);
          return;
        }
        const closed = closedDoors();
        const door = pick(closed.length > 1 ? closed.filter((i) => i !== lastWiggled) : closed);
        if (door !== undefined) wiggle(door, false);
      }
    },
    speechEnded(token) {
      if (speaking === token) speaking = null;
      // The asked door wiggles hard with its muffled call once the ask line has ended (never under it).
      if (askToken === token) {
        askToken = null;
        hardDue = true;
      }
    },
    progress() {
      // The reveals live in the partial; questionIndex stays 0 (no question is ever closed, so the tally is empty).
      return { questionIndex: 0, partial: { behind: [...behind], reveals } };
    },
  };
}

/**
 * The resume a snapshot allows, or null: `partial.behind` holds `doors` distinct known animal ids,
 * `partial.reveals` is an integer in [0, revealsPerRound), and `questionIndex` is 0 (the reveals are not questions).
 */
export function resumePens(
  resumeAt: { readonly questionIndex: number; readonly partial?: unknown } | null,
  animals: readonly PenAnimal[],
  doors: number,
  revealsPerRound: number,
): PensResume | null {
  if (!resumeAt) return null;
  const p = resumeAt.partial;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return null;
  const { behind, reveals } = p as { behind?: unknown; reveals?: unknown };
  if (!Array.isArray(behind) || behind.length !== doors) return null;
  const known = new Set(animals.map((a) => a.id));
  if (!behind.every((id): id is string => typeof id === 'string' && known.has(id))) return null;
  if (new Set(behind).size !== behind.length) return null;
  if (typeof reveals !== 'number' || !Number.isInteger(reveals) || reveals < 0 || reveals >= revealsPerRound) return null;
  if (resumeAt.questionIndex !== 0) return null;
  return { behind: [...behind], reveals };
}
