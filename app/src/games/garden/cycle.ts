// Trồng cây controller (2026-10-30, spec-trong-cay), pure and Phaser-free: free play, taps only, no score, no timer, no
// right or wrong. Behind injected ports (audio, view, the reaction picker) so every rule is node-testable; the scene
// clock drives `tick`. One plant cycle:
//   choose → `tapPacket(i)`: the seed of packet i drops into the soil and the sprout pops up (`plantMs`);
//   grow   → `tapCan()` ×3: each watering pours and grows the plant one stage (`growMs` ≤ 1.5 s); the third brings the
//            fruits (`fruitsPerPlant`);
//   fruit  → `tapFruit(n)`, in any order: the fruit hops to Shiba, who eats it (one bite, two for the giant fruit) with
//            that fruit's own reaction, then one `correct` flourish (core/reactions: never the same twice in a row);
//   after the last fruit the plant fades back into the soil and two new packets pop in (`choose` again).
// While any of these animations runs (`busy`) every tap is ignored (one prominent motion at a time). A tap on the can
// out of its turn only nudges it. `tapShiba()` gives a small reaction (a squash and a woof), at most one per `tapMs`; it
// never holds the other taps.
// Each plant brings one surprise from a shuffle bag (never the same twice in a row): the worm peeks out after the seed
// is planted, the butterfly lands when the flowers open, the rainbow shows after the last watering, and the giant fruit
// grows in the middle (two bites, Shiba's cheeks puffed).
// Voice: a fresh start says the invitation (it names Xoài) then "choose a seed"; a chosen seed says its fruit's name and
// "water it"; the fruits appearing say their name and "pick the fruit"; new packets say "choose a seed". The step line is
// also the Speaker prompt and the idle hint: after `idleHintMs` without a tap the next thing to tap bounces and the step
// line plays again (at most `hintMax` times per step).
// The last fruit's tap already moves the state to the next cycle's packets (so Home during the eating keeps it eaten);
// the scene keeps a snapshot on Home only while a plant grows (`hasPlant`). The snapshot partial is
// `{ offer, kind, waterings, left, surprise }`; `resumeGarden` validates it (invalid → fresh soil).
import {
  FRUIT_IDS,
  GIANT_BITES,
  GIANT_FRUIT,
  MOTION,
  STAGES,
  SURPRISE_IDS,
  WATERINGS,
  isFruit,
  isSurprise,
  type EatReaction,
  type FruitId,
  type StageId,
  type SurpriseId,
} from '../../content/games/garden.ts';
import { Tokens } from '../../core/tokens.ts';

export interface GardenAudio {
  sfx(id: string): void;
  say(id: string): number;
  /** Several lines back to back under one token; returns it. */
  sayChain(ids: readonly string[]): number;
  setPrompt(id: string): void;
}

/** What the idle hint bounces: both packets, the can, or one fruit still on the plant. */
export type HintTarget = { readonly kind: 'packets' } | { readonly kind: 'can' } | { readonly kind: 'fruit'; readonly index: number };

/** A plant shown at once (a resumed start). */
export interface PlantState {
  readonly fruit: FruitId;
  readonly stage: StageId;
  /** The fruits still on the plant (the fruit stage only). */
  readonly left: readonly number[];
  /** The fruit index drawn giant, if any. */
  readonly giant: number | undefined;
}

export interface GardenView {
  /** Two packets pop in over the soil (over `ms`). */
  showPackets(offer: readonly FruitId[], ms: number): void;
  /** Packet `index` was chosen: the other fades, its seed drops into the soil and the sprout pops up (over `ms`). */
  plant(fruit: FruitId, index: number, ms: number): void;
  /** One watering: the can pours and the plant grows to `stage` (the fruit stage brings the fruits; `giant`: that index is giant). */
  water(fruit: FruitId, stage: StageId, giant: number | undefined, ms: number): void;
  /** The plant's surprise shows (the giant fruit is part of the fruits instead). */
  surprise(id: Exclude<SurpriseId, 'giant'>, fruit: FruitId, ms: number): void;
  /** Fruit `index` is picked and Shiba eats it in `bites` bites with its own reaction (over `ms`). */
  eat(fruit: FruitId, index: number, reaction: EatReaction, bites: number, ms: number): void;
  /** One correct flourish (hop, wag, hearts). */
  flourish(id: string | undefined): void;
  /** The eaten plant fades back into the soil (over `ms`). */
  clear(ms: number): void;
  /** The idle hint: the next thing to tap bounces. */
  hint(target: HintTarget): void;
  /** The can tapped out of its turn: a small nudge. */
  nudgeCan(): void;
  /** Shiba tapped: a small squash. */
  tapShiba(): void;
  /** A resumed plant shows at once. */
  restore(state: PlantState): void;
}

export interface GardenTimings {
  readonly plantMs: number;
  readonly growMs: number;
  readonly surpriseMs: number;
  readonly pickMs: number;
  readonly biteMs: number;
  readonly reactMs: number;
  readonly flourishMs: number;
  readonly clearMs: number;
  readonly packetsInMs: number;
  readonly idleHintMs: number;
  readonly hintMax: number;
  readonly tapMs: number;
  readonly maxDtMs: number;
}

export function defaultGardenTimings(): GardenTimings {
  const t = Tokens.Timing;
  return {
    plantMs: t.gardenPlantMs,
    growMs: t.gardenGrowMs,
    surpriseMs: t.gardenSurpriseMs,
    pickMs: t.gardenPickMs,
    biteMs: t.gardenBiteMs,
    reactMs: t.gardenReactMs,
    flourishMs: t.gardenFlourishMs,
    clearMs: t.gardenClearMs,
    packetsInMs: t.gardenPacketsInMs,
    idleHintMs: t.gardenIdleHintMs,
    hintMax: Tokens.ui.gardenHintMax,
    tapMs: t.gardenTapMs,
    maxDtMs: t.gardenMaxTickMs,
  };
}

/** The time Shiba takes over one fruit: the hop to its mouth, the bites, its reaction. */
export function eatMs(bites: number, t: Pick<GardenTimings, 'pickMs' | 'biteMs' | 'reactMs'>): number {
  return t.pickMs + bites * t.biteMs + t.reactMs;
}

// --- the shuffle bags -----------------------------------------------------------------------------------------

function shuffle<T>(xs: readonly T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** A shuffled bag: each draw takes the next id that is not the last one drawn (never the same twice in a row); an empty bag refills. */
export interface ShuffleBag<T extends string> {
  draw(): T;
  readonly last: T | undefined;
}

export function createShuffleBag<T extends string>(ids: readonly T[], rng: () => number): ShuffleBag<T> {
  if (ids.length === 0) throw new Error('garden: an empty shuffle bag');
  let bag: T[] = [];
  let last: T | undefined;
  return {
    draw() {
      let i = bag.findIndex((id) => id !== last);
      if (i < 0) {
        bag = [...bag, ...shuffle(ids, rng)];
        i = bag.findIndex((id) => id !== last);
      }
      // A one-id bag can only repeat.
      const id = bag.splice(Math.max(0, i), 1)[0]!;
      last = id;
      return id;
    },
    get last() {
      return last;
    },
  };
}

/** The packets on offer: two different fruits, drawn from a shuffled bag of every fruit (it refills when it runs low). */
export interface PacketBag {
  drawPair(): [FruitId, FruitId];
}

export function createPacketBag(ids: readonly FruitId[], rng: () => number): PacketBag {
  if (new Set(ids).size < 2) throw new Error('garden: a packet pair needs two different fruits');
  let bag: FruitId[] = [];
  const take = (not: FruitId | undefined): FruitId => {
    let i = bag.findIndex((id) => id !== not);
    if (i < 0) {
      bag = [...bag, ...shuffle(ids, rng)];
      i = bag.findIndex((id) => id !== not);
    }
    return bag.splice(i, 1)[0]!;
  };
  return {
    drawPair() {
      const a = take(undefined);
      return [a, take(a)];
    },
  };
}

// --- the controller -------------------------------------------------------------------------------------------

export type GardenPhase = 'choose' | 'grow' | 'fruit';

export interface GardenPartial {
  offer: string[];
  kind: string | null;
  waterings: number;
  left: number[];
  surprise: string | null;
}

export interface GardenResume {
  readonly offer: readonly [FruitId, FruitId];
  readonly kind: FruitId | null;
  readonly waterings: number;
  readonly left: readonly number[];
  readonly surprise: SurpriseId | null;
}

export interface GardenFruitInfo {
  readonly nameLine: string;
  readonly eat: EatReaction;
  readonly biteSfx: string;
}

export interface GardenLines {
  readonly prompt: string;
  readonly choose: string;
  readonly water: string;
  readonly pick: string;
}

export interface GardenSounds {
  readonly pour: string;
  readonly pop: string;
  readonly woof: string;
  /** A fruit's reaction sound as its reaction starts (none: the reaction is silent). */
  readonly react: Readonly<Partial<Record<EatReaction, string>>>;
}

export interface GardenOptions {
  readonly fruits: Readonly<Record<FruitId, GardenFruitInfo>>;
  readonly fruitsPerPlant: number;
  readonly packets: PacketBag;
  readonly surprises: ShuffleBag<SurpriseId>;
  readonly resume?: GardenResume | null | undefined;
  readonly lines: GardenLines;
  readonly sounds: GardenSounds;
  readonly audio: GardenAudio;
  readonly view: GardenView;
  /** core/reactions via MiniGameBase.pickReaction. */
  readonly pick: (kind: 'correct') => string | undefined;
  readonly timings?: Partial<GardenTimings>;
}

export interface GardenProgress {
  readonly questionIndex: number;
  readonly partial: GardenPartial;
}

export interface GardenController {
  start(): void;
  /** True when the tap planted that packet's seed. */
  tapPacket(index: number): boolean;
  /** True when the tap watered the plant. */
  tapCan(): boolean;
  /** True when the tap picked that fruit. */
  tapFruit(index: number): boolean;
  /** True when Shiba reacted. */
  tapShiba(): boolean;
  /** Any press: the idle hint clock restarts. */
  anyTap(): void;
  tick(dtMs: number): void;
  stop(): void;
  progress(): GardenProgress;
  readonly phase: GardenPhase;
  readonly offer: readonly FruitId[];
  readonly kind: FruitId | null;
  readonly waterings: number;
  readonly stage: StageId | undefined;
  readonly left: readonly number[];
  readonly surprise: SurpriseId | null;
  /** A plant grows (planted and not yet eaten): Home keeps it to resume. */
  readonly hasPlant: boolean;
  /** An animation runs: taps are ignored. */
  readonly busy: boolean;
}

export function createGardenController(opts: GardenOptions): GardenController {
  const t = { ...defaultGardenTimings(), ...opts.timings };
  const { audio, view } = opts;
  const r = opts.resume ?? null;
  let offer: [FruitId, FruitId] = r ? [r.offer[0], r.offer[1]] : opts.packets.drawPair();
  let kind: FruitId | null = r?.kind ?? null;
  let waterings = r?.kind ? r.waterings : 0;
  let left: number[] = r?.kind ? [...r.left] : [];
  let surprise: SurpriseId | null = r?.kind ? r.surprise : null;
  let now = 0;
  let busyUntil = 0;
  /** Shiba's own reaction runs until then (it never holds the packets, the can or the fruit). */
  let shibaUntil = 0;
  let stopped = false;
  let idleMs = 0;
  let hints = 0;
  let queue: { at: number; fn: () => void }[] = [];

  const after = (ms: number, fn: () => void): void => {
    queue.push({ at: now + ms, fn });
    queue.sort((a, b) => a.at - b.at);
  };
  const isBusy = (): boolean => now < busyUntil;
  /** The phase from the state (the last fruit's tap already moved it to `choose`). */
  const phase = (): GardenPhase => (kind === null ? 'choose' : waterings < WATERINGS ? 'grow' : 'fruit');
  const giantIndex = (): number | undefined => (surprise === 'giant' ? GIANT_FRUIT : undefined);
  const stepLine = (): string => (phase() === 'choose' ? opts.lines.choose : phase() === 'grow' ? opts.lines.water : opts.lines.pick);
  /** A new step begins: its line is the prompt, the idle hint starts over. */
  const step = (lines: readonly string[]): void => {
    hints = 0;
    idleMs = 0;
    audio.setPrompt(stepLine());
    if (lines.length === 1) audio.say(lines[0]!);
    else audio.sayChain(lines);
  };
  const busyFor = (ms: number): void => {
    busyUntil = Math.max(busyUntil, now + ms);
  };

  /** The surprise that shows at this stage (the worm at the sprout, the butterfly at the flowers, the rainbow at the fruit). */
  const surpriseAt = (stage: StageId): Exclude<SurpriseId, 'giant'> | undefined => {
    if (surprise === 'worm' && stage === 'sprout') return 'worm';
    if (surprise === 'butterfly' && stage === 'flower') return 'butterfly';
    if (surprise === 'rainbow' && stage === 'fruit') return 'rainbow';
    return undefined;
  };
  /** After a growth animation: the stage's surprise (if any), then `then`. */
  const thenSurprise = (stage: StageId, ms: number, then: () => void): void => {
    const s = surpriseAt(stage);
    busyFor(ms + (s ? t.surpriseMs : 0));
    after(ms, () => {
      if (s && kind) view.surprise(s, kind, t.surpriseMs);
      if (s) after(t.surpriseMs, then);
      else then();
    });
  };

  return {
    start() {
      if (stopped) return;
      if (kind === null) {
        view.showPackets(offer, t.packetsInMs);
        busyFor(t.packetsInMs);
        step(r ? [opts.lines.choose] : [opts.lines.prompt, opts.lines.choose]);
        return;
      }
      view.restore({ fruit: kind, stage: STAGES[waterings]!, left: [...left], giant: giantIndex() });
      step(phase() === 'fruit' ? [opts.fruits[kind].nameLine, opts.lines.pick] : [opts.lines.water]);
    },
    tapPacket(index) {
      if (stopped || isBusy() || phase() !== 'choose' || index < 0 || index >= offer.length) return false;
      const fruit = offer[index]!;
      kind = fruit;
      waterings = 0;
      left = [];
      surprise = opts.surprises.draw();
      view.plant(fruit, index, t.plantMs);
      after(t.plantMs * MOTION.growPopAt, () => audio.sfx(opts.sounds.pop));
      step([opts.fruits[fruit].nameLine, opts.lines.water]);
      thenSurprise('sprout', t.plantMs, () => undefined);
      return true;
    },
    tapCan() {
      if (stopped || isBusy()) return false;
      if (phase() !== 'grow' || kind === null) {
        view.nudgeCan();
        return false;
      }
      const fruit = kind;
      waterings += 1;
      const stage = STAGES[waterings]!;
      const last = waterings === WATERINGS;
      if (last) left = Array.from({ length: opts.fruitsPerPlant }, (_, n) => n);
      idleMs = 0;
      hints = 0;
      audio.sfx(opts.sounds.pour);
      view.water(fruit, stage, last ? giantIndex() : undefined, t.growMs);
      after(t.growMs * MOTION.growPopAt, () => audio.sfx(opts.sounds.pop));
      thenSurprise(stage, t.growMs, () => {
        if (last) step([opts.fruits[fruit].nameLine, opts.lines.pick]);
      });
      return true;
    },
    tapFruit(index) {
      if (stopped || isBusy() || phase() !== 'fruit' || kind === null || !left.includes(index)) return false;
      const fruit = kind;
      const info = opts.fruits[fruit];
      const bites = index === giantIndex() ? GIANT_BITES : 1;
      const ms = eatMs(bites, t);
      left = left.filter((n) => n !== index);
      idleMs = 0;
      hints = 0;
      audio.sfx(opts.sounds.pop);
      view.eat(fruit, index, info.eat, bites, ms);
      for (let b = 0; b < bites; b++) after(t.pickMs + b * t.biteMs, () => audio.sfx(info.biteSfx));
      const reactSfx = opts.sounds.react[info.eat];
      if (reactSfx) after(t.pickMs + bites * t.biteMs, () => audio.sfx(reactSfx));
      after(ms, () => view.flourish(opts.pick('correct')));
      const done = left.length === 0;
      busyFor(ms + t.flourishMs + (done ? t.clearMs + t.packetsInMs : 0));
      if (!done) return true;
      // The plant is eaten: the next cycle's packets are drawn now (Home during the eating keeps it eaten).
      kind = null;
      waterings = 0;
      surprise = null;
      offer = opts.packets.drawPair();
      const next = offer;
      after(ms + t.flourishMs, () => {
        view.clear(t.clearMs);
        after(t.clearMs, () => {
          view.showPackets(next, t.packetsInMs);
          audio.sfx(opts.sounds.pop);
          step([opts.lines.choose]);
        });
      });
      return true;
    },
    tapShiba() {
      if (stopped || isBusy() || now < shibaUntil) return false;
      idleMs = 0;
      view.tapShiba();
      audio.sfx(opts.sounds.woof);
      shibaUntil = now + t.tapMs;
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
      if (stopped || isBusy()) return;
      idleMs += dt;
      if (idleMs < t.idleHintMs || hints >= t.hintMax) return;
      idleMs = 0;
      hints += 1;
      const p = phase();
      view.hint(p === 'choose' ? { kind: 'packets' } : p === 'grow' ? { kind: 'can' } : { kind: 'fruit', index: left[0]! });
      audio.say(stepLine());
    },
    stop() {
      stopped = true;
      queue = [];
    },
    progress() {
      // questionIndex stays 0: free play closes no question.
      return { questionIndex: 0, partial: { offer: [...offer], kind, waterings, left: [...left], surprise } };
    },
    get phase() {
      return phase();
    },
    get offer() {
      return offer;
    },
    get kind() {
      return kind;
    },
    get waterings() {
      return waterings;
    },
    get stage() {
      return kind === null ? undefined : STAGES[waterings];
    },
    get left() {
      return left;
    },
    get surprise() {
      return surprise;
    },
    get hasPlant() {
      return kind !== null;
    },
    get busy() {
      return isBusy();
    },
  };
}

/**
 * The resume a snapshot allows, or null (a fresh soil): `questionIndex` 0; two different known fruits on offer; either
 * no plant (`kind` null, no waterings, no fruit, no surprise) or a planted fruit from the offer with 0 … WATERINGS
 * waterings, a known surprise, no fruit before the last watering and 1 … `fruitsPerPlant` distinct fruit indices after it.
 */
export function resumeGarden(resumeAt: { readonly questionIndex: number; readonly partial?: unknown } | null, fruitsPerPlant: number): GardenResume | null {
  if (!resumeAt || resumeAt.questionIndex !== 0) return null;
  const p = resumeAt.partial;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return null;
  const { offer, kind, waterings, left, surprise } = p as Partial<Record<keyof GardenPartial, unknown>>;
  if (!Array.isArray(offer) || offer.length !== 2 || !offer.every(isFruit) || offer[0] === offer[1]) return null;
  const pair: [FruitId, FruitId] = [offer[0] as FruitId, offer[1] as FruitId];
  if (kind === null) {
    if (waterings !== 0 || !Array.isArray(left) || left.length !== 0 || surprise !== null) return null;
    return { offer: pair, kind: null, waterings: 0, left: [], surprise: null };
  }
  if (!isFruit(kind) || !pair.includes(kind)) return null;
  if (typeof waterings !== 'number' || !Number.isInteger(waterings) || waterings < 0 || waterings > WATERINGS) return null;
  if (!isSurprise(surprise)) return null;
  if (!Array.isArray(left) || !left.every((n) => Number.isInteger(n) && n >= 0 && n < fruitsPerPlant) || new Set(left).size !== left.length) return null;
  if (waterings < WATERINGS ? left.length !== 0 : left.length === 0) return null;
  return { offer: pair, kind, waterings, left: [...(left as number[])], surprise };
}

/** Every fruit id and every surprise id (the scene's bags). */
export const ALL_FRUITS: readonly FruitId[] = FRUIT_IDS;
export const ALL_SURPRISES: readonly SurpriseId[] = SURPRISE_IDS;
