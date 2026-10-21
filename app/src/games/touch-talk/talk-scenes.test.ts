// Story 4.6: the controller over three scenes — switching, the slide lockout, the distinct-touched set
// (it never grants anything since 2026-10-21) and the resume.
import { describe, expect, it } from 'vitest';
import { TOUCH_TALK_SCENES } from '../../content/games/touch-talk';
import { mulberry32 } from '../../core/rng';
import { Tokens } from '../../core/tokens';
import { createTalkController, resumeTalk, type TalkResume } from './talk';

const SLIDE = Tokens.Timing.touchTalkSceneSlideMs;
const DELAY = Tokens.Timing.touchTalkNameDelayMs;
const SEA = TOUCH_TALK_SCENES[0]!.props.map((p) => p.id);
const STREET = TOUCH_TALK_SCENES[1]!.props.map((p) => p.id);
const KITCHEN = TOUCH_TALK_SCENES[2]!.props.map((p) => p.id);

function rig(resume: TalkResume | null = null) {
  const log: string[] = [];
  let token = 0;
  const talk = createTalkController({
    scenes: TOUCH_TALK_SCENES,
    rng: mulberry32(3),
    resume,
    audio: { sfx: (id) => log.push(`sfx ${id}`), say: (id) => (log.push(`say ${id}`), ++token), setPrompt: (id) => log.push(`prompt ${id}`) },
    view: { bounce: (id) => log.push(`bounce ${id}`), wiggle: (id) => log.push(`wiggle ${id}`), slide: (a, b) => log.push(`slide ${a}->${b}`) },
  });
  const tickFor = (ms: number): void => {
    for (let t = 0; t < ms; t += 50) talk.tick(50);
  };
  return { talk, log, tickFor };
}

describe('three scenes (Story 4.6)', () => {
  it('Switch: at sea, sceneTap(1) → slide(0,1), setPrompt + say the street; progress is already the street', () => {
    const { talk, log } = rig();
    talk.sceneTap(1);
    expect(log).toEqual(['slide 0->1', 'prompt vo.touch-talk.scene.street', 'say vo.touch-talk.scene.street']);
    expect(talk.progress()).toEqual({ questionIndex: 1, partial: { sceneId: 'street', touchedIds: [] } });
  });

  it('Tap during slide / Old scene prop / Bubble during slide: all ignored until the slide ends', () => {
    const { talk, log, tickFor } = rig();
    talk.sceneTap(1);
    log.length = 0;
    tickFor(300);
    expect(talk.isActive('car')).toBe(false);
    talk.tap('car');
    talk.sceneTap(2);
    expect(log).toEqual([]);
    tickFor(SLIDE - 300);
    expect(talk.isActive('car')).toBe(true);
    talk.tap('crab');
    expect(log).toEqual([]);
    talk.tap('car');
    expect(log).toEqual(['bounce car', 'sfx sfx.touch-talk.car']);
  });

  it('Same bubble: sceneTap(current) twice quickly → one say, no slide; again after it ended', () => {
    const { talk, log } = rig();
    talk.sceneTap(0);
    talk.sceneTap(0);
    expect(log.filter((l) => l.startsWith('say'))).toEqual(['say vo.touch-talk.scene.sea']);
    expect(log.some((l) => l.startsWith('slide'))).toBe(false);
    talk.speechEnded(1);
    talk.sceneTap(0);
    expect(log.filter((l) => l.startsWith('say'))).toHaveLength(2);
  });

  it('Pending dropped: tap crab, switch within 350 ms → the crab name is never said', () => {
    const { talk, log, tickFor } = rig();
    talk.tap('crab');
    tickFor(100);
    talk.sceneTap(1);
    tickFor(DELAY + SLIDE);
    expect(log).not.toContain('say vo.touch-talk.name.crab');
  });

  it('distinct props are tracked once each, across scenes, and nothing clears them', () => {
    const { talk, tickFor } = rig();
    for (let i = 0; i < 8; i++) talk.tap(SEA[0]!);
    for (const id of SEA) talk.tap(id);
    expect(talk.progress().partial.touchedIds).toEqual(SEA);
    talk.sceneTap(1);
    tickFor(SLIDE);
    for (const id of STREET.slice(0, 6)) talk.tap(id);
    expect(talk.progress().partial.touchedIds).toEqual([...SEA, ...STREET.slice(0, 6)]);
  });

  it('Home in kitchen with 5 → {questionIndex 2, partial {kitchen, 5 ids}}; Resume 5+3 → 8 touched; Bad resume → null', () => {
    const { talk, tickFor } = rig();
    talk.sceneTap(2);
    tickFor(SLIDE);
    for (const id of KITCHEN.slice(0, 5)) talk.tap(id);
    const p = talk.progress();
    expect(p).toEqual({ questionIndex: 2, partial: { sceneId: 'kitchen', touchedIds: KITCHEN.slice(0, 5) } });
    const resume = resumeTalk(JSON.parse(JSON.stringify(p)) as typeof p, TOUCH_TALK_SCENES);
    expect(resume).toEqual({ sceneIndex: 2, touchedIds: KITCHEN.slice(0, 5) });
    const again = rig(resume);
    again.talk.start();
    expect(again.log).toEqual(['prompt vo.touch-talk.scene.kitchen']);
    for (const id of KITCHEN.slice(5, 8)) again.talk.tap(id);
    expect(again.talk.progress().partial.touchedIds).toEqual(KITCHEN.slice(0, 8));
    // Any number of distinct known props resumes (nothing is ever granted, so no threshold).
    expect(resumeTalk({ questionIndex: 2, partial: { sceneId: 'kitchen', touchedIds: KITCHEN.slice(0, 8) } }, TOUCH_TALK_SCENES)).toEqual({ sceneIndex: 2, touchedIds: KITCHEN.slice(0, 8) });
    expect(resumeTalk({ questionIndex: 2, partial: { sceneId: 'kitchen', touchedIds: ['dragon'] } }, TOUCH_TALK_SCENES)).toBeNull();
    // A street prop is known (every scene's props count), even from the kitchen.
    expect(resumeTalk({ questionIndex: 2, partial: { sceneId: 'kitchen', touchedIds: ['car'] } }, TOUCH_TALK_SCENES)).toEqual({ sceneIndex: 2, touchedIds: ['car'] });
  });

  it('2026-10-21 six scenes: a new-scene bubble slides there and says its name; its props bounce, sound, then are named', () => {
    const { talk, log, tickFor } = rig();
    const names = ['bathroom', 'bakery', 'picnic'];
    names.forEach((id, k) => {
      const i = 3 + k;
      log.length = 0;
      const from = talk.current;
      talk.sceneTap(i);
      expect(log).toEqual([`slide ${from}->${i}`, `prompt vo.touch-talk.scene.${id}`, `say vo.touch-talk.scene.${id}`]);
      const pid = TOUCH_TALK_SCENES[i]!.props[0]!.id;
      talk.tap(pid);
      expect(log).toHaveLength(3);
      tickFor(SLIDE);
      log.length = 0;
      talk.tap(pid);
      expect(log).toEqual([`bounce ${pid}`, `sfx sfx.touch-talk.${pid}`]);
      tickFor(DELAY + 100);
      expect(log).toContain(`say vo.touch-talk.name.${pid}`);
    });
  });

  it('Resume in a new scene: Home mid-picnic → the same scene and touched set; old snapshot ids still valid', () => {
    const { talk, tickFor } = rig();
    talk.sceneTap(5);
    tickFor(SLIDE);
    const PICNIC = TOUCH_TALK_SCENES[5]!.props.map((p) => p.id);
    for (const id of PICNIC.slice(0, 3)) talk.tap(id);
    const p = talk.progress();
    expect(p).toEqual({ questionIndex: 5, partial: { sceneId: 'picnic', touchedIds: PICNIC.slice(0, 3) } });
    expect(resumeTalk(JSON.parse(JSON.stringify(p)) as typeof p, TOUCH_TALK_SCENES)).toEqual({ sceneIndex: 5, touchedIds: PICNIC.slice(0, 3) });
    // A three-scene snapshot (sea / street / kitchen ids) still resumes.
    expect(resumeTalk({ questionIndex: 2, partial: { sceneId: 'kitchen', touchedIds: ['crab', 'car', 'pot'] } }, TOUCH_TALK_SCENES)).toEqual({ sceneIndex: 2, touchedIds: ['crab', 'car', 'pot'] });
  });

  it('Fresh start: sea, nothing touched; wiggles only come from the current scene after a switch', () => {
    const { talk, log, tickFor } = rig();
    expect(talk.progress()).toEqual({ questionIndex: 0, partial: { sceneId: 'sea', touchedIds: [] } });
    talk.sceneTap(2);
    tickFor(Tokens.Timing.touchTalkIdleWiggleMs * 3);
    const wiggled = log.filter((l) => l.startsWith('wiggle')).map((l) => l.slice('wiggle '.length));
    expect(wiggled.length).toBeGreaterThan(0);
    for (const id of wiggled) expect(KITCHEN).toContain(id);
  });
});
