import { describe, expect, it } from 'vitest';
import { FRUIT_IDS, FRUITS, GIANT_FRUIT, SURPRISE_IDS, WATERINGS, type FruitId, type SurpriseId } from '../../content/games/garden.ts';
import { onRoundLeave } from '../../core/post-round-chain.ts';
import { mulberry32 } from '../../core/rng.ts';
import { SessionStore, takeStartData } from '../../core/session-store.ts';
import {
  createGardenController,
  createPacketBag,
  createShuffleBag,
  defaultGardenTimings,
  eatMs,
  resumeGarden,
  type GardenResume,
  type GardenTimings,
  type PacketBag,
  type ShuffleBag,
} from './cycle.ts';

const T: GardenTimings = {
  plantMs: 1000,
  growMs: 1200,
  surpriseMs: 1500,
  pickMs: 500,
  biteMs: 600,
  reactMs: 1000,
  flourishMs: 700,
  clearMs: 900,
  packetsInMs: 400,
  idleHintMs: 8000,
  hintMax: 3,
  tapMs: 600,
  maxDtMs: 250,
};
const LINES = { prompt: 'vo.garden.prompt', choose: 'vo.garden.choose', water: 'vo.garden.water', pick: 'vo.garden.pick' };
const SOUNDS = { pour: 'sfx.garden.pour', pop: 'sfx.garden.pop', woof: 'sfx.shell.woof', react: { yum: 'sfx.bedtime.giggle', spit: 'sfx.garden.pop' } };

/** A packet bag that always offers `pairs` in order (then repeats the last). */
function fixedPackets(...pairs: [FruitId, FruitId][]): PacketBag {
  let i = 0;
  return { drawPair: () => pairs[Math.min(i++, pairs.length - 1)]! };
}
function fixedSurprises(...ids: SurpriseId[]): ShuffleBag<SurpriseId> {
  let i = 0;
  let last: SurpriseId | undefined;
  return {
    draw: () => (last = ids[Math.min(i++, ids.length - 1)]!),
    get last() {
      return last;
    },
  };
}

function setup(o: { packets?: PacketBag; surprises?: ShuffleBag<SurpriseId>; resume?: GardenResume | null } = {}) {
  const log: string[] = [];
  const sfx: string[] = [];
  const said: string[][] = [];
  const prompts: string[] = [];
  const picks: string[] = [];
  const ctl = createGardenController({
    fruits: FRUITS,
    fruitsPerPlant: 3,
    packets: o.packets ?? fixedPackets(['strawberry', 'lemon'], ['tomato', 'watermelon']),
    surprises: o.surprises ?? fixedSurprises('butterfly', 'worm'),
    resume: o.resume,
    lines: LINES,
    sounds: SOUNDS,
    timings: T,
    audio: {
      sfx: (id) => void sfx.push(id),
      say: (id) => (said.push([id]), said.length),
      sayChain: (ids) => (said.push([...ids]), said.length),
      setPrompt: (id) => void prompts.push(id),
    },
    view: {
      showPackets: (offer) => void log.push(`packets ${offer.join(',')}`),
      plant: (fruit, i) => void log.push(`plant ${fruit} ${i}`),
      water: (fruit, stage, giant) => void log.push(`water ${fruit} ${stage}${giant === undefined ? '' : ` giant ${giant}`}`),
      surprise: (id) => void log.push(`surprise ${id}`),
      eat: (fruit, i, reaction, bites) => void log.push(`eat ${fruit} ${i} ${reaction} ${bites}`),
      flourish: (id) => void log.push(`flourish ${id ?? '-'}`),
      clear: () => void log.push('clear'),
      hint: (target) => void log.push(`hint ${target.kind}${target.kind === 'fruit' ? ` ${target.index}` : ''}`),
      nudgeCan: () => void log.push('nudge can'),
      tapShiba: () => void log.push('shiba'),
      restore: (s) => void log.push(`restore ${s.fruit} ${s.stage} [${s.left.join(',')}]${s.giant === undefined ? '' : ` giant ${s.giant}`}`),
    },
    pick: () => {
      const id = ['hop', 'wag', 'hearts'][picks.length % 3]!;
      picks.push(id);
      return id;
    },
  });
  const run = (ms: number): void => {
    for (let left = ms; left > 0; left -= 100) ctl.tick(Math.min(100, left));
  };
  return { ctl, log, sfx, said, prompts, run };
}

/** Plants packet 0 and waters it to the fruit (no surprise delays with butterfly only at the flowers). */
function toFruit(s: ReturnType<typeof setup>): void {
  s.ctl.start();
  s.run(T.packetsInMs);
  s.ctl.tapPacket(0);
  s.run(T.plantMs);
  for (let i = 0; i < WATERINGS; i++) {
    expect(s.ctl.tapCan()).toBe(true);
    s.run(T.growMs + T.surpriseMs);
  }
}

describe('garden cycle: choose', () => {
  it('a fresh start shows two packets and says the invitation, then "choose a seed" (the prompt)', () => {
    const s = setup();
    s.ctl.start();
    expect(s.log).toEqual(['packets strawberry,lemon']);
    expect(s.said).toEqual([[LINES.prompt, LINES.choose]]);
    expect(s.prompts.at(-1)).toBe(LINES.choose);
    expect(s.ctl.phase).toBe('choose');
    expect(s.ctl.hasPlant).toBe(false);
  });

  it('a tapped packet plants its seed: the sprout, its name and "water it"; the surprise is drawn', () => {
    const s = setup();
    s.ctl.start();
    s.run(T.packetsInMs);
    expect(s.ctl.tapPacket(1)).toBe(true);
    expect(s.log.at(-1)).toBe('plant lemon 1');
    expect(s.said.at(-1)).toEqual([FRUITS.lemon.nameLine, LINES.water]);
    expect(s.prompts.at(-1)).toBe(LINES.water);
    expect(s.ctl.kind).toBe('lemon');
    expect(s.ctl.stage).toBe('sprout');
    expect(s.ctl.surprise).toBe('butterfly');
    expect(s.ctl.hasPlant).toBe(true);
    s.run(T.plantMs);
    expect(s.sfx).toContain(SOUNDS.pop);
  });

  it('taps are ignored while the packets pop in and while the seed is planted', () => {
    const s = setup();
    s.ctl.start();
    expect(s.ctl.tapPacket(0)).toBe(false);
    s.run(T.packetsInMs);
    expect(s.ctl.tapPacket(0)).toBe(true);
    expect(s.ctl.tapPacket(1)).toBe(false);
    expect(s.ctl.tapCan()).toBe(false);
    expect(s.log).not.toContain('nudge can');
    s.run(T.plantMs);
    expect(s.ctl.busy).toBe(false);
  });

  it('the can tapped before a seed is planted only nudges', () => {
    const s = setup();
    s.ctl.start();
    s.run(T.packetsInMs);
    expect(s.ctl.tapCan()).toBe(false);
    expect(s.log.at(-1)).toBe('nudge can');
    expect(s.ctl.phase).toBe('choose');
  });
});

describe('garden cycle: three waterings', () => {
  it('each watering pours and grows one stage (sprout → small → flower → fruit), ignoring taps while it runs', () => {
    const s = setup({ surprises: fixedSurprises('worm') });
    s.ctl.start();
    s.run(T.packetsInMs);
    s.ctl.tapPacket(0);
    s.run(T.plantMs + T.surpriseMs);
    const stages: string[] = [];
    for (let i = 0; i < WATERINGS; i++) {
      expect(s.ctl.tapCan()).toBe(true);
      expect(s.sfx.at(-1)).toBe(SOUNDS.pour);
      expect(s.ctl.tapCan()).toBe(false);
      stages.push(s.ctl.stage!);
      s.run(T.growMs);
    }
    expect(stages).toEqual(['small', 'flower', 'fruit']);
    expect(s.log.filter((l) => l.startsWith('water'))).toEqual(['water strawberry small', 'water strawberry flower', 'water strawberry fruit']);
    expect(s.ctl.phase).toBe('fruit');
    expect(s.ctl.left).toEqual([0, 1, 2]);
    expect(s.said.at(-1)).toEqual([FRUITS.strawberry.nameLine, LINES.pick]);
    expect(s.prompts.at(-1)).toBe(LINES.pick);
    expect(s.ctl.tapCan()).toBe(false);
    expect(s.log.at(-1)).toBe('nudge can');
  });

  it('each growth animation is ≤ 1.5 s (the tokens)', () => {
    const d = defaultGardenTimings();
    expect(d.growMs).toBeLessThanOrEqual(1500);
    expect(d.plantMs).toBeLessThanOrEqual(1500);
  });
});

describe('garden cycle: the surprises', () => {
  it('the worm peeks after planting, the butterfly lands at the flowers, the rainbow shows after the last watering; taps wait for them', () => {
    for (const [id, at] of [
      ['worm', 0],
      ['butterfly', 2],
      ['rainbow', 3],
    ] as const) {
      const s = setup({ surprises: fixedSurprises(id) });
      s.ctl.start();
      s.run(T.packetsInMs);
      s.ctl.tapPacket(0);
      s.run(T.plantMs);
      for (let w = 1; w <= at; w++) {
        s.ctl.tapCan();
        s.run(T.growMs);
      }
      expect(s.log.at(-1)).toBe(`surprise ${id}`);
      expect(s.ctl.busy).toBe(true);
      s.run(T.surpriseMs);
      expect(s.ctl.busy).toBe(false);
      expect(s.log.filter((l) => l.startsWith('surprise'))).toHaveLength(1);
    }
  });

  it('the rainbow comes before "pick the fruit"', () => {
    const s = setup({ surprises: fixedSurprises('rainbow') });
    toFruit(s);
    const i = s.log.indexOf('surprise rainbow');
    expect(i).toBeGreaterThan(s.log.indexOf('water strawberry fruit'));
    expect(s.said.at(-1)).toEqual([FRUITS.strawberry.nameLine, LINES.pick]);
  });

  it('the giant fruit grows in the middle and takes two bites', () => {
    const s = setup({ surprises: fixedSurprises('giant') });
    toFruit(s);
    expect(s.log).toContain(`water strawberry fruit giant ${GIANT_FRUIT}`);
    expect(s.ctl.tapFruit(GIANT_FRUIT)).toBe(true);
    expect(s.log.at(-1)).toBe(`eat strawberry ${GIANT_FRUIT} yum 2`);
    s.run(eatMs(2, T) + T.flourishMs);
    expect(s.sfx.filter((id) => id === FRUITS.strawberry.biteSfx)).toHaveLength(2);
  });

  it('the surprise bag never draws the same twice in a row and draws every surprise', () => {
    const bag = createShuffleBag(SURPRISE_IDS, mulberry32(7));
    const seq = Array.from({ length: 60 }, () => bag.draw());
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    expect(new Set(seq)).toEqual(new Set(SURPRISE_IDS));
    expect(bag.last).toBe(seq.at(-1));
  });
});

describe('garden cycle: the fruit', () => {
  it('fruit is picked in any order; Shiba eats each with its reaction and one flourish; taps wait meanwhile', () => {
    const s = setup({ packets: fixedPackets(['watermelon', 'tomato'], ['lemon', 'strawberry']) });
    toFruit(s);
    expect(s.ctl.tapFruit(2)).toBe(true);
    expect(s.log.at(-1)).toBe('eat watermelon 2 spit 1');
    expect(s.ctl.tapFruit(0)).toBe(false);
    expect(s.ctl.tapShiba()).toBe(false);
    s.run(eatMs(1, T));
    expect(s.log.at(-1)).toBe('flourish hop');
    expect(s.sfx).toContain(FRUITS.watermelon.biteSfx);
    s.run(T.flourishMs);
    expect(s.ctl.left).toEqual([0, 1]);
    expect(s.ctl.tapFruit(2)).toBe(false);
    expect(s.ctl.tapFruit(0)).toBe(true);
    s.run(eatMs(1, T) + T.flourishMs);
    expect(s.log.filter((l) => l.startsWith('flourish'))).toEqual(['flourish hop', 'flourish wag']);
  });

  it('the lemon is sour and the tomato squirts (each fruit keeps its own reaction)', () => {
    for (const fruit of FRUIT_IDS) {
      const other = FRUIT_IDS.find((f) => f !== fruit)!;
      const s = setup({ packets: fixedPackets([fruit, other]) });
      toFruit(s);
      s.ctl.tapFruit(1);
      expect(s.log.at(-1)).toBe(`eat ${fruit} 1 ${FRUITS[fruit].eat} 1`);
    }
    expect(FRUITS.lemon.eat).toBe('sour');
    expect(FRUITS.tomato.eat).toBe('squirt');
    expect(FRUITS.watermelon.eat).toBe('spit');
  });

  it('after the last fruit the plant fades back into soil and two new packets appear ("choose a seed")', () => {
    const s = setup();
    toFruit(s);
    for (const n of [1, 0, 2]) {
      expect(s.ctl.tapFruit(n)).toBe(true);
      s.run(eatMs(1, T) + T.flourishMs);
    }
    expect(s.log.at(-1)).toBe('clear');
    expect(s.ctl.busy).toBe(true);
    s.run(T.clearMs);
    expect(s.log.at(-1)).toBe('packets tomato,watermelon');
    expect(s.said.at(-1)).toEqual([LINES.choose]);
    expect(s.prompts.at(-1)).toBe(LINES.choose);
    s.run(T.packetsInMs);
    expect(s.ctl.busy).toBe(false);
    expect(s.ctl.tapPacket(0)).toBe(true);
    expect(s.ctl.kind).toBe('tomato');
  });

  it('the last fruit tap moves the state to the next packets at once (Home during the eating keeps it eaten)', () => {
    const s = setup();
    toFruit(s);
    s.ctl.tapFruit(0);
    s.run(eatMs(1, T) + T.flourishMs);
    s.ctl.tapFruit(1);
    s.run(eatMs(1, T) + T.flourishMs);
    s.ctl.tapFruit(2);
    expect(s.ctl.hasPlant).toBe(false);
    expect(s.ctl.progress().partial).toEqual({ offer: ['tomato', 'watermelon'], kind: null, waterings: 0, left: [], surprise: null });
  });

  it('a Shiba tap never holds the packets, the can or the fruit; Shiba itself reacts at most once per tapMs', () => {
    const s = setup();
    s.ctl.start();
    s.run(T.packetsInMs);
    expect(s.ctl.tapShiba()).toBe(true);
    expect(s.ctl.busy).toBe(false);
    expect(s.ctl.tapShiba()).toBe(false);
    expect(s.ctl.tapPacket(0)).toBe(true);
    s.run(T.plantMs);
    expect(s.ctl.tapShiba()).toBe(true);
    expect(s.ctl.tapCan()).toBe(true);
    expect(s.log.filter((l) => l === 'shiba')).toHaveLength(2);
  });

  it('Shiba tapped while nothing runs: a small reaction and a woof', () => {
    const s = setup();
    s.ctl.start();
    s.run(T.packetsInMs);
    expect(s.ctl.tapShiba()).toBe(true);
    expect(s.log.at(-1)).toBe('shiba');
    expect(s.sfx.at(-1)).toBe(SOUNDS.woof);
  });
});

describe('garden cycle: the idle hint', () => {
  it('after idleHintMs the next thing bounces and its line plays, at most hintMax times per step; a tap restarts the clock', () => {
    const s = setup();
    s.ctl.start();
    s.run(T.packetsInMs);
    s.ctl.anyTap();
    s.run(T.idleHintMs - 100);
    s.ctl.anyTap();
    s.run(T.idleHintMs - 100);
    expect(s.log.filter((l) => l.startsWith('hint'))).toEqual([]);
    s.run(100);
    expect(s.log.at(-1)).toBe('hint packets');
    expect(s.said.at(-1)).toEqual([LINES.choose]);
    s.run(T.idleHintMs * 5);
    expect(s.log.filter((l) => l.startsWith('hint'))).toHaveLength(T.hintMax);
    s.ctl.tapPacket(0);
    s.run(T.plantMs + T.idleHintMs);
    expect(s.log.at(-1)).toBe('hint can');
    expect(s.said.at(-1)).toEqual([LINES.water]);
  });

  it('in the fruit stage the hint bounces a fruit still on the plant', () => {
    const s = setup();
    toFruit(s);
    s.ctl.tapFruit(0);
    s.run(eatMs(1, T) + T.flourishMs + T.idleHintMs);
    expect(s.log.at(-1)).toBe('hint fruit 1');
    expect(s.said.at(-1)).toEqual([LINES.pick]);
  });
});

describe('garden cycle: resume', () => {
  it('a half-grown plant resumes as it was (no invitation; its step line)', () => {
    const s = setup({ resume: { offer: ['lemon', 'tomato'], kind: 'tomato', waterings: 2, left: [], surprise: 'rainbow' } });
    s.ctl.start();
    expect(s.log).toEqual(['restore tomato flower []']);
    expect(s.said).toEqual([[LINES.water]]);
    expect(s.ctl.tapCan()).toBe(true);
    expect(s.ctl.stage).toBe('fruit');
  });

  it('a plant in fruit resumes with only the fruits left (and the giant one)', () => {
    const s = setup({ resume: { offer: ['lemon', 'tomato'], kind: 'lemon', waterings: 3, left: [1, 2], surprise: 'giant' } });
    s.ctl.start();
    expect(s.log).toEqual([`restore lemon fruit [1,2] giant ${GIANT_FRUIT}`]);
    expect(s.said).toEqual([[FRUITS.lemon.nameLine, LINES.pick]]);
    expect(s.ctl.tapFruit(0)).toBe(false);
    expect(s.ctl.tapFruit(1)).toBe(true);
    expect(s.log.at(-1)).toBe('eat lemon 1 sour 2');
  });

  it('progress round-trips through resumeGarden', () => {
    const s = setup();
    toFruit(s);
    s.ctl.tapFruit(1);
    const back = resumeGarden(s.ctl.progress(), 3);
    expect(back).toEqual({ offer: ['strawberry', 'lemon'], kind: 'strawberry', waterings: 3, left: [0, 2], surprise: 'butterfly' });
  });

  it('a plant kept by Map on round:leave (core/post-round-chain onRoundLeave) comes back through takeStartData and resumeGarden accepts it', () => {
    const session = new SessionStore();
    const s = setup();
    toFruit(s);
    s.ctl.tapFruit(1);
    const snapshot = { v: 1 as const, level: 0, seed: 7, ...s.ctl.progress() };
    expect(onRoundLeave({ id: 'garden', level: 0, origin: 'yard' }, { gameId: 'garden', snapshot }, false, session)).toEqual({ action: 'fade', gameId: 'garden' });
    const data = takeStartData('garden', 1, session, () => 0.25, { getDifficulty: () => 0 });
    expect(resumeGarden(data.resume ?? null, 3)).toEqual({ offer: ['strawberry', 'lemon'], kind: 'strawberry', waterings: 3, left: [0, 2], surprise: 'butterfly' });
  });

  it('an invalid partial is rejected (fresh soil)', () => {
    const ok = { offer: ['lemon', 'tomato'], kind: 'lemon', waterings: 1, left: [], surprise: 'worm' };
    expect(resumeGarden({ questionIndex: 0, partial: ok }, 3)).not.toBeNull();
    expect(resumeGarden({ questionIndex: 0, partial: { offer: ['lemon', 'tomato'], kind: null, waterings: 0, left: [], surprise: null } }, 3)).not.toBeNull();
    for (const bad of [
      null,
      [],
      { ...ok, offer: ['lemon', 'lemon'] },
      { ...ok, offer: ['lemon'] },
      { ...ok, offer: ['lemon', 'kiwi'] },
      { ...ok, kind: 'strawberry' },
      { ...ok, kind: 'kiwi' },
      { ...ok, waterings: 4 },
      { ...ok, waterings: 1.5 },
      { ...ok, left: [0] },
      { ...ok, waterings: 3, left: [] },
      { ...ok, waterings: 3, left: [0, 0] },
      { ...ok, waterings: 3, left: [3] },
      { ...ok, surprise: 'dragon' },
      { ...ok, surprise: null },
      { offer: ['lemon', 'tomato'], kind: null, waterings: 1, left: [], surprise: null },
    ]) {
      expect(resumeGarden({ questionIndex: 0, partial: bad }, 3)).toBeNull();
    }
    expect(resumeGarden({ questionIndex: 1, partial: ok }, 3)).toBeNull();
    expect(resumeGarden(null, 3)).toBeNull();
  });
});

describe('garden packets', () => {
  it('each offer is two different fruits; over time every fruit is offered', () => {
    const bag = createPacketBag(FRUIT_IDS, mulberry32(3));
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const [a, b] = bag.drawPair();
      expect(a).not.toBe(b);
      seen.add(a).add(b);
    }
    expect(seen).toEqual(new Set(FRUIT_IDS));
  });

  it('stop: nothing more happens', () => {
    const s = setup();
    s.ctl.start();
    s.ctl.stop();
    s.run(T.idleHintMs * 2);
    expect(s.ctl.tapPacket(0)).toBe(false);
    expect(s.log).toEqual(['packets strawberry,lemon']);
  });
});
