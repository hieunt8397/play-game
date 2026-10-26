// Story 8.1: the clinic controller — arrival, the right tool, a tool that fits nothing (FR30), busy taps, the patient
// leaving and the next one arriving, the round's end, the shuffle bag (no repeat across the round boundary), the
// reaction picker's flourishes, the cues and reminders, and resume.
import { describe, expect, it, vi } from 'vitest';
import { CUE_SOUNDS, FIX_SOUNDS, NEED_LINES, PATIENTS, PATIENT_IDS, REACTIONS, THANKS_LINE, INVITE_LINE, type PatientId, type ProblemId } from '../../content/games/pet-clinic';
import { createReactionPicker } from '../../core/reactions';
import { mulberry32 } from '../../core/rng';
import { createClinicController, createPatientBag, defaultClinicTimings, drawProblems, fixMs, resumeClinic, type ClinicOptions, type ClinicResume } from './round';

const T = defaultClinicTimings();
const INFO = Object.fromEntries(PATIENTS.map((p) => [p.id, { callSfx: p.callSfx, nameLine: p.nameLine }])) as ClinicOptions['patients'];

function setup(over: Partial<ClinicOptions> = {}, seed = 3) {
  const audio = { sfx: vi.fn((_id: string) => undefined), say: vi.fn((_id: string) => 1), sayChain: vi.fn((_ids: readonly string[]) => 1), setPrompt: vi.fn((_id: string) => undefined) };
  const view = {
    arrive: vi.fn((..._args: unknown[]) => undefined),
    arrived: vi.fn((..._args: unknown[]) => undefined),
    fix: vi.fn((..._args: unknown[]) => undefined),
    flourish: vi.fn((..._args: unknown[]) => undefined),
    choseOther: vi.fn((..._args: unknown[]) => undefined),
    returnTool: vi.fn((..._args: unknown[]) => undefined),
    tapReact: vi.fn((..._args: unknown[]) => undefined),
    thanks: vi.fn((..._args: unknown[]) => undefined),
    depart: vi.fn((..._args: unknown[]) => undefined),
    cue: vi.fn((..._args: unknown[]) => undefined),
  };
  const picker = createReactionPicker(REACTIONS, mulberry32(seed));
  const onLastPatient = vi.fn();
  const onRoundEnd = vi.fn();
  const c = createClinicController({
    patients: INFO,
    perRound: 3,
    maxProblems: 2,
    bag: createPatientBag(PATIENT_IDS, mulberry32(seed)),
    rng: mulberry32(seed + 1),
    inviteLine: INVITE_LINE,
    needLines: NEED_LINES,
    thanksLine: THANKS_LINE,
    fixSounds: FIX_SOUNDS,
    cueSounds: CUE_SOUNDS,
    audio,
    view,
    pick: (k) => picker.pick(k),
    onLastPatient,
    onRoundEnd,
    ...over,
  });
  const run = (ms: number): void => {
    for (let x = 0; x < ms; x += 50) c.tick(50);
  };
  return { c, audio, view, onLastPatient, onRoundEnd, run };
}

const TOOL = { mud: 'shower', tummy: 'bottle', scrape: 'plaster', yawn: 'blanket' } as const;
const fixAll = (s: ReturnType<typeof setup>): void => {
  for (const p of [...s.c.left]) {
    expect(s.c.useTool(TOOL[p])).toBe('fixed');
    s.run(fixMs(p, T) + T.flourishMs + 50);
  }
};
/** The whole walk out and the next walk in. */
const turnover = T.thanksMs + T.walkOutMs + T.gapMs + T.walkMs + 200;

describe('pet-clinic controller (Story 8.1)', () => {
  it('arrival: the patient walks in, then its call, the invitation, its name and the first need line', () => {
    const s = setup();
    s.c.start();
    expect(s.view.arrive).toHaveBeenCalledWith(s.c.patient, s.c.left, T.walkMs);
    expect(s.c.left.length).toBeGreaterThanOrEqual(1);
    expect(s.c.left.length).toBeLessThanOrEqual(2);
    expect(s.c.busy).toBe(true);
    expect(s.audio.sayChain).not.toHaveBeenCalled();
    s.run(T.walkMs + 50);
    expect(s.view.arrived).toHaveBeenCalled();
    expect(s.audio.sfx).toHaveBeenCalledWith(`sfx.animal-pens.${s.c.patient}.call`);
    expect(s.audio.sayChain).toHaveBeenCalledWith([INVITE_LINE, `vo.animal-pens.name.${s.c.patient}`, NEED_LINES[s.c.left[0]!]]);
    expect(s.audio.setPrompt).toHaveBeenLastCalledWith(NEED_LINES[s.c.left[0]!]);
    expect(s.c.waiting).toBe(true);
  });

  it('a tool before the patient has arrived floats back with no state change', () => {
    const s = setup();
    s.c.start();
    const left = [...s.c.left];
    expect(s.c.useTool('shower')).toBe('ignored');
    expect(s.view.returnTool).toHaveBeenCalledWith('shower');
    expect(s.c.left).toEqual(left);
  });

  it('the right tool clears its problem with its own reaction and sounds, then a flourish, then the next need', () => {
    const s = setup({ resume: { patient: 'pig', left: ['mud', 'tummy'], seen: [] } });
    s.c.start();
    s.run(T.walkMs + 50);
    expect(s.c.useTool('shower')).toBe('fixed');
    expect(s.view.fix).toHaveBeenCalledWith('mud', 'shower', fixMs('mud', T));
    expect(s.c.left).toEqual(['tummy']);
    // Busy while it runs: a second tool floats back, a tap is ignored.
    expect(s.c.useTool('bottle')).toBe('ignored');
    expect(s.c.tapPatient()).toBe(false);
    s.run(fixMs('mud', T));
    expect(s.audio.sfx).toHaveBeenCalledWith(FIX_SOUNDS.mud.start);
    expect(s.audio.sfx).toHaveBeenCalledWith(FIX_SOUNDS.mud.end);
    expect(s.view.flourish).toHaveBeenCalledTimes(1);
    s.run(T.flourishMs + 50);
    expect(s.audio.say).toHaveBeenLastCalledWith(NEED_LINES.tummy);
    expect(s.audio.setPrompt).toHaveBeenLastCalledWith(NEED_LINES.tummy);
    expect(s.c.busy).toBe(false);
  });

  it('problems can be fixed in any order', () => {
    const s = setup({ resume: { patient: 'cow', left: ['scrape', 'yawn'], seen: [] } });
    s.c.start();
    s.run(T.walkMs + 50);
    expect(s.c.useTool('blanket')).toBe('fixed');
    s.run(fixMs('yawn', T) + T.flourishMs + 50);
    expect(s.c.left).toEqual(['scrape']);
    expect(s.c.useTool('plaster')).toBe('fixed');
    expect(s.c.seen).toEqual(['cow']);
  });

  it('FR30: a tool that fits nothing left — a chose-other reaction, the tool floats back, the need line again; never a fail sound', () => {
    const s = setup({ resume: { patient: 'dog', left: ['tummy'], seen: [] } });
    s.c.start();
    s.run(T.walkMs + 50);
    s.audio.sfx.mockClear();
    s.audio.say.mockClear();
    expect(s.c.useTool('shower')).toBe('other');
    const [id, tool] = s.view.choseOther.mock.calls[0]!;
    expect(REACTIONS.choseOther).toContain(id);
    expect(tool).toBe('shower');
    expect(s.c.left).toEqual(['tummy']);
    expect(s.audio.say).not.toHaveBeenCalled();
    s.run(T.tiltMs + 50);
    expect(s.audio.say).toHaveBeenCalledWith(NEED_LINES.tummy);
    expect(s.audio.sfx).not.toHaveBeenCalled();
    // The variants alternate (never the same twice in a row with two of them).
    expect(s.c.useTool('plaster')).toBe('other');
    expect(s.view.choseOther.mock.calls[1]![0]).not.toBe(id);
  });

  it('all fixed: the thank-you, a hop, the walk out, and a different patient walks in', () => {
    const s = setup();
    s.c.start();
    s.run(T.walkMs + 50);
    const first = s.c.patient;
    fixAll(s);
    expect(s.audio.say).toHaveBeenCalledWith(THANKS_LINE);
    expect(s.view.thanks).toHaveBeenCalled();
    // Seen at once: Home during the walk out keeps it done, with the next patient in the partial.
    expect(s.c.seen).toEqual([first]);
    expect(s.c.patient).not.toBe(first);
    expect(s.c.progress().partial.seen).toEqual([first]);
    s.run(T.thanksMs + 50);
    expect(s.view.depart).toHaveBeenCalledWith(T.walkOutMs);
    s.run(T.walkOutMs + T.gapMs + 50);
    expect(s.view.arrive).toHaveBeenCalledTimes(2);
    expect(s.view.arrive.mock.calls[1]![0]).toBe(s.c.patient);
    s.run(T.walkMs + 50);
    // No invitation after the first arrival.
    expect(s.audio.sayChain.mock.calls[1]![0]).toEqual([`vo.animal-pens.name.${s.c.patient}`, NEED_LINES[s.c.left[0]!]]);
  });

  it('round end: three different patients, onLastPatient at the last fix, onRoundEnd once it has walked out; then nothing', () => {
    const s = setup();
    s.c.start();
    s.run(T.walkMs + 50);
    const seen: PatientId[] = [];
    for (let k = 0; k < 3; k++) {
      seen.push(s.c.patient);
      fixAll(s);
      if (k < 2) {
        expect(s.onLastPatient).not.toHaveBeenCalled();
        s.run(turnover);
      }
    }
    expect(new Set(seen).size).toBe(3);
    expect(s.onLastPatient).toHaveBeenCalledTimes(1);
    expect(s.c.done).toBe(true);
    expect(s.onRoundEnd).not.toHaveBeenCalled();
    s.run(T.thanksMs + T.walkOutMs + 100);
    expect(s.onRoundEnd).toHaveBeenCalledTimes(1);
    expect(s.c.useTool('shower')).toBe('ignored');
    s.run(30000);
    expect(s.view.arrive).toHaveBeenCalledTimes(3);
  });

  it('the correct flourishes come from ≥ 3 and never repeat back to back', () => {
    expect(REACTIONS.correct.length).toBeGreaterThanOrEqual(3);
    const s = setup();
    s.c.start();
    s.run(T.walkMs + 50);
    for (let k = 0; k < 3; k++) {
      fixAll(s);
      if (k < 2) s.run(turnover);
    }
    const ids = s.view.flourish.mock.calls.map(([id]) => id as string);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    for (const id of ids) expect(REACTIONS.correct).toContain(id);
    for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
  });

  it('a tap on the waiting patient: a small reaction and its call; ignored while it runs', () => {
    const s = setup({ resume: { patient: 'sheep', left: ['mud'], seen: [] } });
    s.c.start();
    expect(s.c.tapPatient()).toBe(false);
    s.run(T.walkMs + 50);
    expect(s.c.tapPatient()).toBe(true);
    expect(s.view.tapReact).toHaveBeenCalledTimes(1);
    expect(s.audio.sfx).toHaveBeenLastCalledWith('sfx.animal-pens.sheep.call');
    expect(s.c.tapPatient()).toBe(false);
    s.run(T.tapMs + 50);
    expect(s.c.tapPatient()).toBe(true);
  });

  it('cues: a waiting tummy rumbles and a sleepy patient yawns in turn; reminders after idle, capped', () => {
    const s = setup({ resume: { patient: 'horse', left: ['tummy', 'yawn'], seen: [] } });
    s.c.start();
    s.run(T.walkMs + 50);
    s.audio.say.mockClear();
    s.run(2 * T.cueEveryMs + 100);
    expect(s.view.cue.mock.calls.map(([p]) => p)).toEqual(['tummy', 'yawn']);
    expect(s.audio.sfx).toHaveBeenCalledWith(CUE_SOUNDS.tummy);
    expect(s.audio.sfx).toHaveBeenCalledWith(CUE_SOUNDS.yawn);
    s.run(T.remindIdleMs * 4);
    expect(s.audio.say.mock.calls.filter(([id]) => id === NEED_LINES.tummy)).toHaveLength(T.remindMax);
  });

  it('review: the curing tap makes the patient seen and draws the next one at once; a progress() mid-reaction resumes', () => {
    const s = setup({ resume: { patient: 'dog', left: ['mud'], seen: [] } });
    s.c.start();
    s.run(T.walkMs + 50);
    expect(s.c.useTool('shower')).toBe('fixed');
    s.run(T.flyMs);
    const p = s.c.progress();
    expect(p.partial.seen).toEqual(['dog']);
    expect(p.partial.patient).not.toBe('dog');
    expect(resumeClinic(p, 3, 2)).toEqual({ patient: p.partial.patient, left: p.partial.left, seen: ['dog'] });
  });

  it('review: on the round’s last patient the curing tap calls onLastPatient at once (Home then completes the round)', () => {
    const s = setup({ resume: { patient: 'cow', left: ['scrape'], seen: ['dog', 'cat'] } });
    s.c.start();
    s.run(T.walkMs + 50);
    expect(s.c.useTool('plaster')).toBe('fixed');
    expect(s.onLastPatient).toHaveBeenCalledTimes(1);
    expect(s.c.done).toBe(true);
    expect(s.onRoundEnd).not.toHaveBeenCalled();
  });

  it('review: the reminder cap holds per patient, across its fixes', () => {
    const s = setup({ resume: { patient: 'pig', left: ['mud', 'scrape'], seen: [] } });
    s.c.start();
    s.run(T.walkMs + 50);
    s.run(T.remindIdleMs + 100);
    expect(s.c.useTool('shower')).toBe('fixed');
    s.run(fixMs('mud', T) + T.flourishMs + 50);
    s.audio.say.mockClear();
    s.run(T.remindIdleMs * 4);
    expect(s.audio.say.mock.calls.filter(([id]) => id === NEED_LINES.scrape)).toHaveLength(T.remindMax - 1);
  });

  it('review: anyTap just before the reminder postpones it by a full remindIdleMs', () => {
    const s = setup({ resume: { patient: 'sheep', left: ['mud'], seen: [] } });
    s.c.start();
    s.run(T.walkMs + 50);
    s.audio.say.mockClear();
    s.run(T.remindIdleMs - 200);
    s.c.anyTap();
    s.run(T.remindIdleMs - 200);
    expect(s.audio.say).not.toHaveBeenCalled();
    s.run(400);
    expect(s.audio.say).toHaveBeenCalledWith(NEED_LINES.mud);
  });

  it('the shuffle bag: no patient twice in a round, and never the previous round’s last one first', () => {
    const bag = createPatientBag(PATIENT_IDS, mulberry32(9));
    let last: string | undefined;
    for (let round = 0; round < 40; round++) {
      const seen: string[] = [];
      for (let k = 0; k < 3; k++) seen.push(bag.draw(seen));
      expect(new Set(seen).size).toBe(3);
      if (last) expect(seen[0]).not.toBe(last);
      last = seen[2];
    }
    const counts = new Map<string, number>();
    for (let k = 0; k < 70; k++) {
      const id = bag.draw([]);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.size).toBe(PATIENT_IDS.length);
  });

  it('a patient has 1–2 distinct problems', () => {
    const rng = mulberry32(5);
    const sizes = new Set<number>();
    for (let k = 0; k < 50; k++) {
      const ps: ProblemId[] = drawProblems(rng, 2);
      expect(new Set(ps).size).toBe(ps.length);
      sizes.add(ps.length);
    }
    expect([...sizes].sort()).toEqual([1, 2]);
  });

  it('resume: the same patient, the same problems left and the same count; the next patient is a new one', () => {
    const resume: ClinicResume = { patient: 'cat', left: ['scrape'], seen: ['dog'] };
    const s = setup({ resume });
    s.c.start();
    expect(s.view.arrive).toHaveBeenCalledWith('cat', ['scrape'], T.walkMs);
    s.run(T.walkMs + 50);
    // A resumed start says no invitation.
    expect(s.audio.sayChain).toHaveBeenCalledWith(['vo.animal-pens.name.cat', NEED_LINES.scrape]);
    expect(s.c.progress()).toEqual({ questionIndex: 0, partial: { patient: 'cat', left: ['scrape'], seen: ['dog'] } });
    fixAll(s);
    expect(s.c.seen).toEqual(['dog', 'cat']);
    expect(['dog', 'cat']).not.toContain(s.c.patient);
  });

  it('resumeClinic accepts a valid partial and rejects bad ones (a fresh start)', () => {
    const ok = { questionIndex: 0, partial: { patient: 'pig', left: ['mud', 'yawn'], seen: ['cow'] } };
    expect(resumeClinic(ok, 3, 2)).toEqual({ patient: 'pig', left: ['mud', 'yawn'], seen: ['cow'] });
    const bad = (partial: unknown, q = 0) => resumeClinic({ questionIndex: q, partial }, 3, 2);
    expect(resumeClinic(null, 3, 2)).toBeNull();
    expect(bad(ok.partial, 1)).toBeNull();
    expect(bad({ ...ok.partial, patient: 'duck' })).toBeNull();
    expect(bad({ ...ok.partial, left: [] })).toBeNull();
    expect(bad({ ...ok.partial, left: ['mud', 'mud'] })).toBeNull();
    expect(bad({ ...ok.partial, left: ['mud', 'tummy', 'yawn'] })).toBeNull();
    expect(bad({ ...ok.partial, left: ['sneeze'] })).toBeNull();
    expect(bad({ ...ok.partial, seen: ['pig'] })).toBeNull();
    expect(bad({ ...ok.partial, seen: ['dog', 'cat', 'cow'] })).toBeNull();
    expect(bad('nope')).toBeNull();
  });

  it('stop: nothing more happens', () => {
    const s = setup();
    s.c.start();
    s.c.stop();
    s.run(10000);
    expect(s.view.arrived).not.toHaveBeenCalled();
    expect(s.audio.sayChain).not.toHaveBeenCalled();
  });
});
