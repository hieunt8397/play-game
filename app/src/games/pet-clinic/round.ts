// Bác sĩ thú cưng controller (Story 8.1), pure and Phaser-free: patients walk in with 1–2 visible problems and Xoài
// fixes them with the fitting tool, in any order. Never a judged answer, a score, a timer or a fail sound. Behind
// injected ports (audio, view, the reaction picker) so every rule is node-testable; the scene clock drives `tick`.
// - A patient walks in (`walkMs`; the scene makes it skippable). On arrival: its call, then its name and the first
//   problem's need line (a fresh start chains the invitation, which names Xoài, before them); the need line is the
//   Speaker prompt.
// - `useTool(tool)` (a tool dropped, or tapped-then-tapped, onto the patient):
//   - 'fixed': the tool fits a problem left: that problem clears with its own reaction (`view.fix`: the tool flies to
//     its spot, the problem's sounds; the blanket's nap is longer), then one `correct` flourish (core/reactions: never
//     the same twice in a row), then the next problem's need line — or, when none is left, the thank-you, a hop and
//     the walk out; the next patient walks in. The tool goes back to the tray as part of the fix.
//   - 'other': a tool that fits nothing left: one `choseOther` reaction (the head tilt or its double take) while the
//     tool floats back, then the first problem's need line again. No state change, no fail sound.
//   - 'ignored': no patient waiting (walking, reacting, leaving, or the round's end): the tool floats back.
//   While a reaction runs (`busy`) the controller ignores taps and tools (calm pace, one motion at a time).
// - `tapPatient()`: a small reaction and its call (ignored while busy).
// - While a patient waits: every `cueEveryMs` a periodic cue of a waiting tummy (gurgle) or yawn (one at a time,
//   alternating); after `remindIdleMs` with no tap the need line again (at most `remindMax` times per patient).
// - A patient's last fix (the tap that cures it) makes it "seen" at once and draws the next patient, so Home during its
//   reaction or the walk out keeps it done. On the round's last patient that same tap calls `onLastPatient` (Home then
//   completes the round); once it has walked out, `onRoundEnd` (the scene schedules the finish; continuous play follows).
// The snapshot partial is `{ patient, left, seen }`: a resumed round has the same patient, the same problems left
// and the same count.
import { PROBLEM_IDS, TOOL_FOR, isPatient, isProblem, type PatientId, type ProblemId, type ToolId } from '../../content/games/pet-clinic.ts';
import { Tokens } from '../../core/tokens.ts';

export interface ClinicAudio {
  sfx(id: string): void;
  /** Several lines back to back under one token; returns it. */
  sayChain(ids: readonly string[]): number;
  say(id: string): number;
  setPrompt(id: string): void;
}

export interface ClinicView {
  /** `patient` walks in from the door over `ms`, showing `problems`. */
  arrive(patient: PatientId, problems: readonly ProblemId[], ms: number): void;
  /** The walk in ended (the scene closes its skip window). */
  arrived(): void;
  /** `problem` is fixed with `tool`: the tool flies to its spot, the reaction plays over `ms`, the tool goes back to the tray. */
  fix(problem: ProblemId, tool: ToolId, ms: number): void;
  /** One correct flourish (hop, wiggle, sparkle). */
  flourish(id: string | undefined): void;
  /** A tool that fits nothing left: one chose-other reaction (tilt, double take); the tool floats back to the tray. */
  choseOther(id: string | undefined, tool: ToolId): void;
  /** A tool dropped on the patient while nothing can happen: it floats back to the tray. */
  returnTool(tool: ToolId): void;
  /** The patient was tapped: a small squash. */
  tapReact(): void;
  /** The well patient thanks Xoài: a hop and a heart. */
  thanks(): void;
  /** The patient walks out (over `ms`). */
  depart(ms: number): void;
  /** A waiting problem's periodic cue (the tummy's wavy lines bob, the sleepy patient sways and a "z" floats). */
  cue(problem: ProblemId): void;
}

export interface ClinicTimings {
  readonly walkMs: number;
  readonly walkOutMs: number;
  readonly flyMs: number;
  readonly actMs: number;
  readonly napMs: number;
  readonly returnMs: number;
  readonly flourishMs: number;
  readonly tiltMs: number;
  readonly tapMs: number;
  readonly thanksMs: number;
  readonly gapMs: number;
  readonly cueEveryMs: number;
  readonly remindIdleMs: number;
  readonly remindMax: number;
  readonly maxDtMs: number;
}

export function defaultClinicTimings(): ClinicTimings {
  const t = Tokens.Timing;
  return {
    walkMs: t.petClinicWalkMs,
    walkOutMs: t.petClinicWalkOutMs,
    flyMs: t.petClinicToolFlyMs,
    actMs: t.petClinicActMs,
    napMs: t.petClinicNapMs,
    returnMs: t.petClinicToolReturnMs,
    flourishMs: t.petClinicFlourishMs,
    tiltMs: t.petClinicTiltMs,
    tapMs: t.petClinicTapMs,
    thanksMs: t.petClinicThanksMs,
    gapMs: t.petClinicGapMs,
    cueEveryMs: t.petClinicCueEveryMs,
    remindIdleMs: t.petClinicRemindIdleMs,
    remindMax: Tokens.ui.petClinicRemindMax,
    maxDtMs: t.petClinicMaxTickMs,
  };
}

/** The reaction time of one fix (the blanket's nap is longer): the tool's flight, the act, the way back. */
export function fixMs(problem: ProblemId, t: ClinicTimings): number {
  return t.flyMs + (problem === 'yawn' ? t.napMs : t.actMs) + t.returnMs;
}

// --- the shuffle bag ------------------------------------------------------------------------------------------

/**
 * The patients in a shuffled bag: each draw takes the next one not excluded; an empty bag refills with a new
 * shuffle. The last one drawn is never drawn again next (so no patient repeats across a round boundary).
 */
export interface PatientBag {
  draw(exclude: readonly string[]): PatientId;
  readonly last: PatientId | undefined;
}

function shuffle<T>(xs: readonly T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function createPatientBag(ids: readonly PatientId[], rng: () => number): PatientBag {
  let bag: PatientId[] = [];
  let last: PatientId | undefined;
  const pickFrom = (exclude: readonly string[]): number => bag.findIndex((id) => id !== last && !exclude.includes(id));
  return {
    draw(exclude) {
      let i = pickFrom(exclude);
      if (i < 0) {
        bag = [...bag, ...shuffle(ids, rng)];
        i = pickFrom(exclude);
      }
      // Everything is excluded (never with 7 patients and 3 a round): any but the last.
      if (i < 0) i = Math.max(0, bag.findIndex((id) => id !== last));
      const id = bag.splice(i, 1)[0] ?? ids[0]!;
      last = id;
      return id;
    },
    get last() {
      return last;
    },
  };
}

/** 1 … `max` distinct problems in a random order. */
export function drawProblems(rng: () => number, max: number): ProblemId[] {
  const n = 1 + Math.floor(rng() * Math.max(1, max));
  return shuffle(PROBLEM_IDS, rng).slice(0, Math.min(n, PROBLEM_IDS.length));
}

// --- the controller -------------------------------------------------------------------------------------------

export interface ClinicResume {
  readonly patient: PatientId;
  readonly left: readonly ProblemId[];
  readonly seen: readonly PatientId[];
}

export interface ClinicPatientInfo {
  readonly callSfx: string;
  readonly nameLine: string;
}

export interface ClinicOptions {
  readonly patients: Readonly<Record<PatientId, ClinicPatientInfo>>;
  readonly perRound: number;
  readonly maxProblems: number;
  readonly bag: PatientBag;
  readonly rng: () => number;
  readonly resume?: ClinicResume | null;
  readonly inviteLine: string;
  readonly needLines: Readonly<Record<ProblemId, string>>;
  readonly thanksLine: string;
  readonly fixSounds: Readonly<Record<ProblemId, { readonly start?: string; readonly end?: string }>>;
  readonly cueSounds: Readonly<Partial<Record<ProblemId, string>>>;
  readonly audio: ClinicAudio;
  readonly view: ClinicView;
  /** core/reactions via MiniGameBase.pickReaction. */
  readonly pick: (kind: 'correct' | 'choseOther') => string | undefined;
  /** The round's last patient is well: Home now completes the round (MiniGameBase.markFinishing). */
  readonly onLastPatient: () => void;
  /** The round's last patient has walked out: the scene schedules the finish. */
  readonly onRoundEnd: () => void;
  readonly timings?: Partial<ClinicTimings>;
}

export type ToolResult = 'fixed' | 'other' | 'ignored';

export interface ClinicProgress {
  readonly questionIndex: number;
  readonly partial: { patient: string; left: string[]; seen: string[] };
}

export interface ClinicController {
  start(): void;
  useTool(tool: ToolId): ToolResult;
  /** True when the tap did something. */
  tapPatient(): boolean;
  /** Any press: the idle reminder clock restarts. */
  anyTap(): void;
  tick(dtMs: number): void;
  stop(): void;
  progress(): ClinicProgress;
  readonly patient: PatientId;
  readonly left: readonly ProblemId[];
  readonly seen: readonly PatientId[];
  /** Nothing can be done now (walking, a reaction, leaving, the round's end). */
  readonly busy: boolean;
  /** The patient is on the exam spot waiting for a tool. */
  readonly waiting: boolean;
  readonly done: boolean;
}

export function createClinicController(opts: ClinicOptions): ClinicController {
  const t = { ...defaultClinicTimings(), ...opts.timings };
  const { audio, view } = opts;
  const seen: PatientId[] = [...(opts.resume?.seen ?? [])];
  let patient: PatientId = opts.resume?.patient ?? opts.bag.draw(seen);
  let left: ProblemId[] = opts.resume ? [...opts.resume.left] : drawProblems(opts.rng, opts.maxProblems);
  let now = 0;
  let busyUntil = 0;
  let waiting = false;
  let stopped = false;
  let done = false;
  let firstArrival = !opts.resume;
  let idleMs = 0;
  let cueMs = 0;
  let cueTurn = 0;
  let reminders = 0;
  let queue: { at: number; fn: () => void }[] = [];

  const after = (ms: number, fn: () => void): void => {
    queue.push({ at: now + ms, fn });
    queue.sort((a, b) => a.at - b.at);
  };
  const isBusy = (): boolean => !waiting || now < busyUntil;
  const need = (): string => opts.needLines[left[0]!];

  const sayNeed = (): void => {
    audio.setPrompt(need());
    audio.say(need());
  };

  const walkIn = (): void => {
    waiting = false;
    reminders = 0;
    idleMs = 0;
    cueMs = 0;
    view.arrive(patient, [...left], t.walkMs);
    after(t.walkMs, () => {
      view.arrived();
      const info = opts.patients[patient];
      audio.sfx(info.callSfx);
      const lines = [...(firstArrival ? [opts.inviteLine] : []), info.nameLine, need()];
      firstArrival = false;
      audio.setPrompt(need());
      audio.sayChain(lines);
      waiting = true;
      busyUntil = now;
    });
  };

  /**
   * The patient's last problem is fixed: it is seen at once, and either the round is done (Home now completes it) or
   * the next patient is drawn, so Home at any point of the reaction and the walk out keeps this one done.
   */
  const well = (): void => {
    seen.push(patient);
    if (seen.length >= opts.perRound) {
      done = true;
      opts.onLastPatient();
    } else {
      patient = opts.bag.draw(seen);
      left = drawProblems(opts.rng, opts.maxProblems);
    }
  };

  /** After the last fix's reaction: thanks, a hop, the walk out, then the next patient (or the round's end). */
  const leave = (): void => {
    const last = done;
    waiting = false;
    audio.say(opts.thanksLine);
    view.thanks();
    after(t.thanksMs, () => {
      view.depart(t.walkOutMs);
      after(t.walkOutMs, () => {
        if (last) opts.onRoundEnd();
        else after(t.gapMs, walkIn);
      });
    });
  };

  return {
    start() {
      if (stopped) return;
      walkIn();
    },
    useTool(tool) {
      if (stopped || done || isBusy()) {
        if (!stopped) view.returnTool(tool);
        return 'ignored';
      }
      idleMs = 0;
      const problem = left.find((p) => TOOL_FOR[p] === tool);
      if (problem === undefined) {
        view.choseOther(opts.pick('choseOther'), tool);
        busyUntil = now + t.tiltMs;
        after(t.tiltMs, () => {
          if (waiting && left.length > 0) sayNeed();
        });
        return 'other';
      }
      left = left.filter((p) => p !== problem);
      const ms = fixMs(problem, t);
      const sounds = opts.fixSounds[problem];
      view.fix(problem, tool, ms);
      if (sounds.start) after(t.flyMs, () => audio.sfx(sounds.start!));
      if (sounds.end) after(ms - t.returnMs, () => audio.sfx(sounds.end!));
      const cured = left.length === 0;
      if (cured) well();
      busyUntil = now + ms + t.flourishMs;
      after(ms, () => view.flourish(opts.pick('correct')));
      after(ms + t.flourishMs, () => {
        if (cured) leave();
        else sayNeed();
      });
      return 'fixed';
    },
    tapPatient() {
      if (stopped || isBusy()) return false;
      idleMs = 0;
      view.tapReact();
      audio.sfx(opts.patients[patient].callSfx);
      busyUntil = now + t.tapMs;
      return true;
    },
    anyTap() {
      idleMs = 0;
    },
    tick(dtMs) {
      if (stopped) return;
      const dt = Math.max(0, Math.min(t.maxDtMs, Number.isFinite(dtMs) ? dtMs : 0));
      now += dt;
      while (queue.length > 0 && queue[0]!.at <= now && !stopped) queue.shift()!.fn();
      if (stopped || isBusy() || left.length === 0) return;
      idleMs += dt;
      cueMs += dt;
      const cued = left.filter((p) => opts.cueSounds[p] !== undefined);
      if (cueMs >= t.cueEveryMs && cued.length > 0) {
        cueMs = 0;
        const p = cued[cueTurn++ % cued.length]!;
        audio.sfx(opts.cueSounds[p]!);
        view.cue(p);
      }
      if (idleMs >= t.remindIdleMs && reminders < t.remindMax) {
        idleMs = 0;
        reminders += 1;
        sayNeed();
      }
    },
    stop() {
      stopped = true;
      queue = [];
    },
    progress() {
      // questionIndex stays 0 (no hint question is ever closed); the count lives in `seen`.
      return { questionIndex: 0, partial: { patient, left: [...left], seen: [...seen] } };
    },
    get patient() {
      return patient;
    },
    get left() {
      return left;
    },
    get seen() {
      return seen;
    },
    get busy() {
      return isBusy();
    },
    get waiting() {
      return waiting;
    },
    get done() {
      return done;
    },
  };
}

/**
 * The resume a snapshot allows, or null: a known patient not in `seen`, 1 … maxProblems distinct known problems
 * left, `seen` distinct known patients (fewer than `perRound`), and `questionIndex` 0.
 */
export function resumeClinic(
  resumeAt: { readonly questionIndex: number; readonly partial?: unknown } | null,
  perRound: number,
  maxProblems: number,
): ClinicResume | null {
  if (!resumeAt || resumeAt.questionIndex !== 0) return null;
  const p = resumeAt.partial;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return null;
  const { patient, left, seen } = p as { patient?: unknown; left?: unknown; seen?: unknown };
  if (!isPatient(patient)) return null;
  if (!Array.isArray(left) || left.length < 1 || left.length > maxProblems || !left.every(isProblem) || new Set(left).size !== left.length) return null;
  if (!Array.isArray(seen) || seen.length >= perRound || !seen.every(isPatient) || new Set(seen).size !== seen.length || seen.includes(patient)) return null;
  return { patient, left: [...left], seen: [...seen] };
}
