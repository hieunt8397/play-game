// Story 4.5: the Chạm là nói controller (every non-visual matrix row), resumeTalk, the Bus spy and the source scan.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOUCH_TALK_SCENES } from '../../content/games/touch-talk';
import { Bus } from '../../core/bus';
import { mulberry32 } from '../../core/rng';
import { Tokens } from '../../core/tokens';
import { createTalkController, resumeTalk, type TalkResume } from './talk';

function rig(resume: TalkResume | null = null) {
  const log: string[] = [];
  let token = 0;
  const said: { id: string; token: number }[] = [];
  const talk = createTalkController({
    scenes: TOUCH_TALK_SCENES,
    rng: mulberry32(7),
    resume,
    audio: {
      sfx: (id) => log.push(`sfx ${id}`),
      say: (id) => {
        token += 1;
        said.push({ id, token });
        log.push(`say ${id}`);
        return token;
      },
      setPrompt: (id) => log.push(`prompt ${id}`),
    },
    view: { bounce: (id) => log.push(`bounce ${id}`), wiggle: (id) => log.push(`wiggle ${id}`) },
  });
  return { talk, log, said };
}
const DELAY = Tokens.Timing.touchTalkNameDelayMs;
const IDLE = Tokens.Timing.touchTalkIdleWiggleMs;
const tickFor = (talk: ReturnType<typeof rig>['talk'], ms: number, step = 50): void => {
  for (let t = 0; t < ms; t += step) talk.tick(step);
};

describe('createTalkController (Story 4.5)', () => {
  it('Enter: the prompt is the scene name; no voice', () => {
    const { talk, log } = rig();
    talk.start();
    expect(log).toEqual(['prompt vo.touch-talk.scene.sea']);
  });

  it('Tap prop: bounce + sfx at once; after 350 ms setPrompt + say its name', () => {
    const { talk, log } = rig();
    talk.tap('crab');
    expect(log).toEqual(['bounce crab', 'sfx sfx.touch-talk.crab']);
    tickFor(talk, DELAY - 50);
    expect(log).toHaveLength(2);
    talk.tick(50);
    expect(log.slice(2)).toEqual(['prompt vo.touch-talk.name.crab', 'say vo.touch-talk.name.crab']);
  });

  it('Background: anyTap only restarts the idle clock (no sfx, no voice); an unknown prop does nothing', () => {
    const { talk, log } = rig();
    talk.anyTap();
    talk.tap('car');
    tickFor(talk, 1000);
    expect(log).toEqual([]);
  });

  it('Re-tap while named: bounce + sfx, no new say; Re-tap while waiting: one say 350 ms after the first tap', () => {
    const a = rig();
    a.talk.tap('crab');
    tickFor(a.talk, DELAY);
    a.talk.tap('crab');
    tickFor(a.talk, DELAY);
    expect(a.log.filter((l) => l.startsWith('say'))).toEqual(['say vo.touch-talk.name.crab']);
    expect(a.log.filter((l) => l === 'bounce crab')).toHaveLength(2);
    const b = rig();
    b.talk.tap('crab');
    b.talk.tick(100);
    b.talk.tap('crab');
    tickFor(b.talk, DELAY - 100);
    expect(b.log.filter((l) => l.startsWith('say'))).toEqual(['say vo.touch-talk.name.crab']);
    expect(b.log.filter((l) => l.startsWith('bounce'))).toHaveLength(2);
  });

  it('Quick taps: 5 props within 1 s → 5 bounces + 5 sfx at once; a newer tap replaces a waiting name', () => {
    const { talk, log } = rig();
    for (const id of ['crab', 'boat', 'fish', 'shell', 'bucket']) {
      talk.tap(id);
      talk.tick(100);
    }
    expect(log.filter((l) => l.startsWith('bounce'))).toHaveLength(5);
    expect(log.filter((l) => l.startsWith('sfx'))).toHaveLength(5);
    tickFor(talk, DELAY);
    expect(log.filter((l) => l.startsWith('say'))).toEqual(['say vo.touch-talk.name.bucket']);
  });

  it('Speaker: the prompt follows the last name said (the scene name before any)', () => {
    const { talk, log } = rig();
    talk.start();
    talk.tap('crab');
    tickFor(talk, DELAY);
    talk.tap('boat');
    tickFor(talk, DELAY);
    expect(log.filter((l) => l.startsWith('prompt')).at(-1)).toBe('prompt vo.touch-talk.name.boat');
  });

  it('Idle: one silent wiggle per 15 000 ms, never the same prop twice in a row; a tap restarts the wait', () => {
    const { talk, log } = rig();
    tickFor(talk, IDLE);
    expect(log.filter((l) => l.startsWith('wiggle'))).toHaveLength(1);
    let prev = log.at(-1);
    for (let k = 0; k < 20; k++) {
      tickFor(talk, IDLE);
      const w = log.filter((l) => l.startsWith('wiggle'));
      expect(w.at(-1)).not.toBe(prev);
      prev = w.at(-1);
    }
    expect(log.some((l) => l.startsWith('sfx') || l.startsWith('say'))).toBe(false);
    const r = rig();
    tickFor(r.talk, 14_000);
    r.talk.anyTap();
    tickFor(r.talk, 14_000);
    expect(r.log.filter((l) => l.startsWith('wiggle'))).toHaveLength(0);
    tickFor(r.talk, 1000);
    expect(r.log.filter((l) => l.startsWith('wiggle'))).toHaveLength(1);
  });

  it('Paused: without ticks the waiting name and the idle clock stay frozen', () => {
    const { talk, log } = rig();
    talk.tap('crab');
    expect(log.some((l) => l.startsWith('say'))).toBe(false);
    tickFor(talk, DELAY);
    expect(log.some((l) => l.startsWith('say'))).toBe(true);
  });

  it('Home: crab, boat, crab → progress {questionIndex 0, partial {sceneId sea, touchedIds [crab, boat]}}; JSON round-trips', () => {
    const { talk } = rig();
    talk.tap('crab');
    talk.tap('boat');
    talk.tap('crab');
    const p = talk.progress();
    expect(p).toEqual({ questionIndex: 0, partial: { sceneId: 'sea', touchedIds: ['crab', 'boat'] } });
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });

  it('Resume: touchedIds [crab] → touched {crab}; a crab tap adds nothing; Bad resume → null', () => {
    const r = resumeTalk({ questionIndex: 0, partial: { sceneId: 'sea', touchedIds: ['crab'] } }, TOUCH_TALK_SCENES);
    expect(r).toEqual({ sceneIndex: 0, touchedIds: ['crab'] });
    const { talk } = rig(r);
    talk.tap('crab');
    expect(talk.progress().partial.touchedIds).toEqual(['crab']);
    for (const bad of [
      { questionIndex: 0, partial: { sceneId: 'sea', touchedIds: ['dragon'] } },
      { questionIndex: 0, partial: { sceneId: 'sea', touchedIds: ['crab', 'crab'] } },
      { questionIndex: 0, partial: { sceneId: 'street', touchedIds: [] } },
      { questionIndex: 3, partial: { sceneId: 'sea', touchedIds: [] } },
      { questionIndex: 0, partial: null },
    ]) {
      expect(resumeTalk(bad, TOUCH_TALK_SCENES), JSON.stringify(bad)).toBeNull();
    }
    expect(resumeTalk(null, TOUCH_TALK_SCENES)).toBeNull();
  });

  it('40 taps on a real Bus: 0 round:complete', () => {
    const bus = new Bus();
    let complete = 0;
    bus.on('round:complete', () => complete++);
    const { talk, said } = rig();
    const ids = TOUCH_TALK_SCENES[0]!.props.map((p) => p.id);
    for (let i = 0; i < 40; i++) {
      talk.tap(ids[i % ids.length]!);
      talk.tick(200);
      const last = said.at(-1);
      if (last) talk.speechEnded(last.token);
    }
    tickFor(talk, 60_000);
    expect(complete).toBe(0);
  });

  it('source scan: nothing under games/touch-talk calls hint., complete(, finishRound, round:complete, or uses decoration frames or atlas.map', () => {
    const dir = join(import.meta.dirname);
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      for (const banned of ['hint.', 'complete(', 'finishRound', "'round:complete'", 'decoration/', 'ATLASES.map']) expect(src.includes(banned), `${f}: ${banned}`).toBe(false);
    }
  });
});
