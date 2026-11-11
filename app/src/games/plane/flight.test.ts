// Phi công nhí (2026-11-11): the pure flight model — the take-off and the fly-off (and their skip), steering by tap,
// by press-and-move and a lift, a catch, a miss, the help after misses and after idle, a cloud bounce, the house after
// the third gift, the delivery and the next flight, the three bags, the idle hints and the resume.
import { describe, expect, it } from 'vitest';
import { COLOUR_IDS, FRIEND_IDS, GIFTS_PER_FLIGHT, SURPRISE_IDS, laneYs, type ColourId, type FriendId, type SurpriseId } from '../../content/games/plane';
import { Tokens } from '../../core/tokens';
import {
  createFlightController,
  createShuffleBag,
  defaultFlightSizes,
  defaultFlightTimings,
  resumeFlight,
  type FlightController,
  type FlightResume,
  type FlightSizes,
  type FlightTimings,
  type FlightView,
  type ShuffleBag,
} from './flight';

const T = defaultFlightTimings();
const Z = defaultFlightSizes();
const GEO = { width: 1024, planeX: 300, groundY: 580, topY: 190, bottomY: 440, houseX: 850 };
const [HIGH, MID, LOW] = laneYs(GEO.topY, GEO.bottomY);
const LINES = { prompt: 'prompt', balloons: 'balloons', colour: (c: ColourId) => `colour.${c}`, count: (n: number) => `count.${n}`, drop: (f: FriendId) => `drop.${f}` };
const SOUNDS = { propeller: 'propeller', whoosh: 'whoosh', boing: 'boing', pop: 'pop', chime: 'chime', puff: 'puff', chirp: 'chirp', call: (f: FriendId) => `call.${f}` };

/** A bag that hands out `ids` in order (it still never repeats the last one). */
function fixedBag<I extends string>(ids: readonly I[]): ShuffleBag<I> {
  let i = 0;
  let last: I | undefined;
  return {
    draw() {
      let id = ids[i++ % ids.length]!;
      if (id === last) id = ids[i++ % ids.length]!;
      last = id;
      return id;
    },
    note(id) {
      last = id;
    },
    get last() {
      return last;
    },
  };
}

interface Rig {
  ctl: FlightController;
  calls: string[];
  said: string[];
  sfx: string[];
  prompts: string[];
  friends: ShuffleBag<FriendId>;
  run(ms: number): void;
  /** Runs until `done()` (at most `maxMs`); true when it happened. */
  until(done: () => boolean, maxMs?: number): boolean;
}

interface RigOptions {
  friends?: FriendId[];
  colours?: ColourId[];
  surprises?: SurpriseId[];
  /** The sky's draw (default 0: every balloon in the high lane, every cloud above the band). */
  rng?: () => number;
  resume?: FlightResume | null;
  timings?: Partial<FlightTimings>;
  sizes?: Partial<FlightSizes>;
}

function rig(opts: RigOptions = {}): Rig {
  const calls: string[] = [];
  const said: string[] = [];
  const sfx: string[] = [];
  const prompts: string[] = [];
  const view: FlightView = {
    park: () => calls.push('park'),
    takeOff: () => calls.push('takeOff'),
    skip: () => calls.push('skip'),
    balloonIn: (c) => calls.push(`balloonIn ${c}`),
    balloonGone: () => calls.push('balloonGone'),
    caught: (c, n) => calls.push(`caught ${c} #${n}`),
    cloudBump: (i) => calls.push(`cloudBump ${i}`),
    cloudTapped: (i) => calls.push(`cloudTapped ${i}`),
    birdTapped: () => calls.push('birdTapped'),
    surprise: (id) => calls.push(`surprise ${id}`),
    houseIn: (f) => calls.push(`houseIn ${f}`),
    arrived: (f) => calls.push(`arrived ${f}`),
    drop: (f, gifts) => calls.push(`drop ${f} [${gifts.join(',')}]`),
    friendHappy: (f) => calls.push(`friendHappy ${f}`),
    flyOff: () => calls.push('flyOff'),
    houseGone: () => calls.push('houseGone'),
    hint: (t) => calls.push(`hint ${t}`),
    restore: (s) => calls.push(`restore ${s.friend} [${s.gifts.join(',')}] ${s.atHouse ? 'house' : 'air'}`),
  };
  const friends = fixedBag(opts.friends ?? ['cat', 'pig', 'cow']);
  const ctl = createFlightController({
    friends,
    colours: fixedBag(opts.colours ?? ['red', 'yellow', 'green', 'purple']),
    surprises: fixedBag(opts.surprises ?? ['rainbow', 'flock', 'heart']),
    rng: opts.rng ?? (() => 0),
    geometry: GEO,
    resume: opts.resume ?? null,
    lines: LINES,
    sounds: SOUNDS,
    audio: {
      sfx: (id) => sfx.push(id),
      say: (id) => {
        said.push(id);
        return 1;
      },
      sayChain: (ids) => {
        said.push(ids.join('+'));
        return 1;
      },
      setPrompt: (id) => prompts.push(id),
    },
    view,
    ...(opts.timings ? { timings: opts.timings } : {}),
    ...(opts.sizes ? { sizes: opts.sizes } : {}),
  });
  const run = (ms: number): void => {
    for (let t = 0; t < ms; t += 50) ctl.tick(50);
  };
  const until = (done: () => boolean, maxMs = 60000): boolean => {
    for (let t = 0; t < maxMs && !done(); t += 50) ctl.tick(50);
    return done();
  };
  return { ctl, calls, said, sfx, prompts, friends, run, until };
}

/** A plane in the air (its take-off played out). */
function flying(opts?: RigOptions): Rig {
  const r = rig(opts);
  r.ctl.start();
  r.ctl.tapPlane();
  r.run(T.takeOffMs + 50);
  return r;
}

/** Steers to each balloon as it comes until `n` gifts are on board. */
function catchGifts(r: Rig, n: number): void {
  while (r.ctl.gifts.length < n) {
    expect(r.until(() => r.ctl.balloon !== null)).toBe(true);
    r.ctl.press({ x: 700, y: r.ctl.balloon!.y });
    r.ctl.lift();
    const had = r.ctl.gifts.length;
    expect(r.until(() => r.ctl.gifts.length > had)).toBe(true);
  }
}

/** A plane hovering at the friend's house with all its gifts. */
function atHouse(opts?: RigOptions): Rig {
  const r = flying(opts);
  catchGifts(r, GIFTS_PER_FLIGHT);
  expect(r.until(() => r.ctl.phase === 'house')).toBe(true);
  return r;
}

describe('flight model (Phi công nhí)', () => {
  it('a fresh start: the plane waits on the grass, the invitation is said and is the Speaker prompt; nothing else reacts', () => {
    const r = rig();
    r.ctl.start();
    expect(r.calls).toEqual(['park']);
    expect(r.said).toEqual(['prompt']);
    expect(r.prompts).toEqual(['prompt']);
    expect(r.ctl.phase).toBe('ground');
    expect(r.ctl.planeY).toBe(GEO.groundY);
    expect(r.ctl.hasProgress).toBe(false);
    // The sky and the friend do nothing yet; the ground stands still.
    expect(r.ctl.press({ x: 600, y: 200 })).toBe('none');
    expect(r.ctl.tapFriend()).toBe(false);
    r.run(3000);
    expect(r.ctl.scroll).toBe(0);
    expect(r.ctl.balloon).toBeNull();
  });

  it('the idle hint before take-off: the plane bounces and the invitation plays, at most hintMax times; a tap restarts the clock', () => {
    const r = rig();
    r.ctl.start();
    r.run(T.idleHintMs - 100);
    expect(r.calls).toEqual(['park']);
    r.ctl.anyTap();
    r.run(T.idleHintMs - 100);
    expect(r.calls).toEqual(['park']);
    r.run(200);
    expect(r.calls).toEqual(['park', 'hint plane']);
    expect(r.said).toEqual(['prompt', 'prompt']);
    r.run(T.idleHintMs * (T.hintMax + 2));
    expect(r.calls.filter((c) => c === 'hint plane')).toHaveLength(T.hintMax);
  });

  it('the take-off: a tap on the plane spins the propeller; it climbs to the middle height while the sky starts to scroll; then "touch the balloons"', () => {
    const r = rig();
    r.ctl.start();
    expect(r.ctl.tapPlane()).toBe(true);
    expect(r.sfx).toEqual(['propeller']);
    expect(r.calls).toEqual(['park', 'takeOff']);
    expect(r.ctl.phase).toBe('takeoff');
    expect(r.ctl.busy).toBe(true);
    expect(r.ctl.tapPlane()).toBe(false);
    r.run(T.takeOffMs / 2);
    expect(r.ctl.planeY).toBeLessThan(GEO.groundY);
    expect(r.ctl.planeY).toBeGreaterThan(MID);
    expect(r.ctl.scroll).toBeGreaterThan(0);
    // Steering waits for the climb to end.
    expect(r.ctl.press({ x: 600, y: HIGH })).toBe('none');
    r.run(T.takeOffMs / 2 + 50);
    expect(r.ctl.phase).toBe('fly');
    expect(r.ctl.planeY).toBe(MID);
    expect(r.ctl.busy).toBe(false);
    expect(r.ctl.hasProgress).toBe(true);
    expect(r.said).toEqual(['prompt', 'balloons']);
    expect(r.prompts).toEqual(['prompt', 'balloons']);
    // The sky scrolls at the cruise speed now.
    const before = r.ctl.scroll;
    r.run(1000);
    expect(r.ctl.scroll - before).toBeCloseTo(Z.scrollPxPerS, 0);
  });

  it('a long take-off is skipped by any tap: it jumps to its end', () => {
    expect(T.takeOffMs).toBeGreaterThan(T.skipOverMs);
    const r = rig();
    r.ctl.start();
    r.ctl.tapPlane();
    r.run(200);
    r.ctl.anyTap();
    expect(r.calls).toEqual(['park', 'takeOff', 'skip']);
    expect(r.ctl.phase).toBe('fly');
    expect(r.ctl.planeY).toBe(MID);
    expect(r.ctl.busy).toBe(false);
    // A short take-off cannot be skipped.
    const s = rig({ timings: { takeOffMs: 1000 } });
    s.ctl.start();
    s.ctl.tapPlane();
    s.run(200);
    s.ctl.anyTap();
    expect(s.calls).toEqual(['park', 'takeOff']);
    expect(s.ctl.phase).toBe('takeoff');
  });

  it('steering by tap: a press in the sky sets the target height and the plane eases there; the band clamps it', () => {
    const r = flying({ timings: { firstBalloonMs: 999999 } });
    expect(r.ctl.press({ x: 700, y: 250 })).toBe('steer');
    r.ctl.lift();
    expect(r.ctl.targetY).toBe(250);
    r.run(100);
    expect(r.ctl.planeY).toBeLessThan(MID);
    expect(r.ctl.planeY).toBeGreaterThan(250);
    r.run(2500);
    expect(r.ctl.planeY).toBeCloseTo(250, 0);
    // Above and below the band: the plane stops at its limits (clear of the Hud and the ground).
    r.ctl.press({ x: 100, y: 10 });
    expect(r.ctl.targetY).toBe(GEO.topY);
    r.ctl.press({ x: 100, y: 760 });
    expect(r.ctl.targetY).toBe(GEO.bottomY);
    r.run(4000);
    expect(r.ctl.planeY).toBeLessThanOrEqual(GEO.bottomY);
    expect(r.ctl.planeY).toBeCloseTo(GEO.bottomY, 0);
  });

  it('steering by press-and-move: the target follows the finger; a lift keeps the height; a move without a press does nothing', () => {
    const r = flying({ timings: { firstBalloonMs: 999999 } });
    r.ctl.press({ x: 600, y: 300 });
    r.ctl.move({ x: 620, y: 360 });
    expect(r.ctl.targetY).toBe(360);
    r.ctl.move({ x: 640, y: 400 });
    expect(r.ctl.targetY).toBe(400);
    r.ctl.lift();
    r.ctl.move({ x: 640, y: 200 });
    expect(r.ctl.targetY).toBe(400);
    r.run(3000);
    expect(r.ctl.planeY).toBeCloseTo(400, 0);
    r.run(3000);
    expect(r.ctl.planeY).toBeCloseTo(400, 0);
  });

  it('a catch: the balloon pops, its gift goes on board, the voice names the colour and the count; the first catch shows the surprise', () => {
    const r = flying();
    expect(r.until(() => r.ctl.balloon !== null, 1000)).toBe(true);
    expect(r.calls.at(-1)).toBe('balloonIn red');
    expect(r.ctl.balloon).toMatchObject({ colour: 'red', y: HIGH });
    expect(r.ctl.balloon!.x).toBeGreaterThan(GEO.width);
    r.ctl.press({ x: 800, y: HIGH });
    r.ctl.lift();
    expect(r.until(() => r.ctl.gifts.length === 1, 6000)).toBe(true);
    expect(r.ctl.gifts).toEqual(['red']);
    expect(r.ctl.balloon).toBeNull();
    // (A cloud up there may have given its soft boing on the way.)
    expect(r.sfx.filter((s) => s !== 'boing')).toEqual(['propeller', 'pop']);
    expect(r.said.at(-1)).toBe('colour.red+count.1');
    expect(r.calls.slice(-2)).toEqual(['caught red #1', 'surprise rainbow']);
    // No balloon comes while the surprise passes; then the next one (another colour).
    r.run(T.surpriseMs - 200);
    expect(r.ctl.balloon).toBeNull();
    r.run(400);
    expect(r.ctl.balloon).toMatchObject({ colour: 'yellow' });
    // The second catch brings no second surprise.
    catchGifts(r, 2);
    expect(r.said.at(-1)).toBe('colour.yellow+count.2');
    expect(r.calls.filter((c) => c.startsWith('surprise'))).toHaveLength(1);
  });

  it('a miss costs nothing: the balloon floats away, no sound, no line, and the next one comes — one at a time', () => {
    const r = flying({ timings: { helpIdleMs: 999999 }, sizes: { helpAfterMisses: 99 } });
    expect(r.until(() => r.ctl.balloon !== null, 1000)).toBe(true);
    // The plane stays in the middle; the balloon passes above it.
    for (let k = 0; k < 400 && r.ctl.misses === 0; k++) r.run(50);
    expect(r.ctl.misses).toBe(1);
    expect(r.ctl.gifts).toEqual([]);
    expect(r.calls.filter((c) => c.startsWith('balloonIn'))).toHaveLength(1);
    expect(r.calls.at(-1)).toBe('balloonGone');
    expect(r.sfx).toEqual(['propeller']);
    expect(r.said).toEqual(['prompt', 'balloons']);
    expect(r.ctl.phase).toBe('fly');
    r.run(T.balloonGapMs + 100);
    expect(r.ctl.balloon).not.toBeNull();
    expect(r.calls.filter((c) => c.startsWith('balloonIn'))).toHaveLength(2);
  });

  it('help after misses in a row: the next balloon comes in at the height of the plane and is caught without steering', () => {
    const r = flying({ timings: { helpIdleMs: 999999 } });
    expect(r.until(() => r.ctl.misses === Z.helpAfterMisses)).toBe(true);
    expect(r.ctl.gifts).toEqual([]);
    expect(r.until(() => r.ctl.balloon !== null, 2000)).toBe(true);
    expect(r.ctl.balloon!.y).toBe(r.ctl.planeY);
    expect(r.until(() => r.ctl.gifts.length === 1, 8000)).toBe(true);
    // A catch ends the run of misses.
    expect(r.ctl.misses).toBe(0);
  });

  it('help after idle: a while without steering and the next balloon comes in at the height of the plane', () => {
    const r = flying({ sizes: { helpAfterMisses: 99 } });
    // The plane was steered low, then left alone: the first balloon (high) is missed, a later one comes to it.
    r.ctl.press({ x: 600, y: LOW });
    r.ctl.lift();
    expect(r.until(() => r.ctl.gifts.length === 1, 30000)).toBe(true);
    expect(r.ctl.planeY).toBeCloseTo(LOW, 0);
    expect(r.ctl.misses).toBe(0);
  });

  it('a child who never steers still reaches a house', () => {
    const r = flying({ rng: () => 0.99 });
    expect(r.until(() => r.ctl.phase === 'house', 180000)).toBe(true);
    expect(r.ctl.gifts).toHaveLength(GIFTS_PER_FLIGHT);
    expect(r.calls).toContain('arrived cat');
  });

  it('a cloud in the way of the plane: one soft bounce per pass, a boing, and the plane flies on', () => {
    // rng 0.6: the clouds drift at the plane's middle height; the balloons come low (never caught here).
    const r = flying({ rng: () => 0.6, timings: { helpIdleMs: 999999 }, sizes: { helpAfterMisses: 99 } });
    expect(Math.abs(r.ctl.clouds[0]!.y - MID)).toBeLessThan(Z.cloudBumpPx);
    expect(r.until(() => r.calls.includes('cloudBump 0'), 20000)).toBe(true);
    expect(r.sfx).toContain('boing');
    expect(r.ctl.phase).toBe('fly');
    expect(r.ctl.planeY).toBe(MID);
    const scroll = r.ctl.scroll;
    r.run(1000);
    expect(r.ctl.scroll).toBeGreaterThan(scroll);
    // Still one bounce for that pass.
    expect(r.calls.filter((c) => c === 'cloudBump 0')).toHaveLength(1);
    expect(r.until(() => r.calls.includes('cloudBump 1'), 20000)).toBe(true);
  });

  it('a press on the bird or on a cloud: a small reaction, and the plane still steers there', () => {
    const r = flying({ timings: { firstBalloonMs: 999999 } });
    const bird = { ...r.ctl.bird };
    expect(r.until(() => r.ctl.bird.x < GEO.width - 100)).toBe(true);
    expect(r.ctl.bird.x).toBeLessThan(bird.x);
    expect(r.ctl.press({ x: r.ctl.bird.x + 10, y: r.ctl.bird.y + 10 })).toBe('bird');
    expect(r.calls.at(-1)).toBe('birdTapped');
    expect(r.sfx.at(-1)).toBe('chirp');
    expect(r.ctl.targetY).toBe(GEO.topY);
    r.ctl.lift();
    // (rng 0.6: the clouds drift in the middle of the band, away from the bird.)
    const s = flying({ rng: () => 0.6, timings: { firstBalloonMs: 999999 } });
    const cloud = s.ctl.clouds[1]!;
    expect(s.ctl.press({ x: cloud.x - 20, y: cloud.y + 20 })).toBe('cloud');
    expect(s.calls.at(-1)).toBe('cloudTapped 1');
    expect(s.sfx.at(-1)).toBe('puff');
    expect(s.ctl.targetY).toBe(cloud.y + 20);
  });

  it('the house arrives after the third gift: the voice names the colour, counts and asks to drop the gifts; the sky eases to a stop', () => {
    const r = flying();
    catchGifts(r, GIFTS_PER_FLIGHT);
    expect(r.ctl.gifts).toEqual(['red', 'yellow', 'green']);
    // The catch names only the colour and the count; the drop line waits until the friend can be tapped.
    expect(r.said.at(-1)).toBe('colour.green+count.3');
    expect(r.said).not.toContain('drop.cat');
    expect(r.prompts.at(-1)).toBe('drop.cat');
    expect(r.calls.at(-1)).toBe('houseIn cat');
    expect(r.ctl.phase).toBe('approach');
    expect(r.ctl.house).toMatchObject({ friend: 'cat' });
    expect(r.ctl.house!.x).toBeGreaterThan(GEO.width);
    // No more balloons; the friend cannot be tapped before it stands still.
    expect(r.ctl.tapFriend()).toBe(false);
    r.run(500);
    const x = r.ctl.house!.x;
    expect(x).toBeLessThan(GEO.width + Z.housePadPx);
    expect(r.until(() => r.ctl.phase === 'house', T.approachMaxMs + 200)).toBe(true);
    expect(r.calls.at(-1)).toBe('arrived cat');
    expect(r.said.at(-1)).toBe('drop.cat');
    expect(r.ctl.house!.x).toBe(GEO.houseX);
    expect(r.ctl.balloon).toBeNull();
    const scroll = r.ctl.scroll;
    r.run(2000);
    expect(r.ctl.scroll).toBe(scroll);
    expect(r.ctl.house!.x).toBe(GEO.houseX);
    expect(r.ctl.hasProgress).toBe(true);
    // The plane can still glide up and down while it waits.
    expect(r.ctl.press({ x: 300, y: HIGH })).toBe('steer');
  });

  it('the idle hint at the house: the friend bounces and its line plays', () => {
    const r = atHouse();
    r.run(T.idleHintMs + 100);
    expect(r.calls.at(-1)).toBe('hint friend');
    expect(r.said.at(-1)).toBe('drop.cat');
  });

  it('the delivery: a tap on the friend drops the gifts (taps ignored), the friend reacts with its call, the plane flies on to another friend', () => {
    const r = atHouse();
    const sfx = r.sfx.length;
    expect(r.ctl.tapFriend()).toBe(true);
    expect(r.calls.at(-1)).toBe('drop cat [red,yellow,green]');
    expect(r.ctl.phase).toBe('drop');
    expect(r.ctl.busy).toBe(true);
    // The state already moved on: Home now keeps nothing.
    expect(r.ctl.hasProgress).toBe(false);
    expect(r.ctl.friend).toBe('pig');
    expect(r.ctl.gifts).toEqual([]);
    expect(r.ctl.surprise).toBe('flock');
    // Taps are ignored while the gifts float down.
    expect(r.ctl.tapFriend()).toBe(false);
    expect(r.ctl.tapPlane()).toBe(false);
    expect(r.ctl.press({ x: 500, y: 300 })).toBe('none');
    expect(T.dropMs).toBeLessThanOrEqual(1500);
    const landed = T.dropMs + T.dropStaggerMs * (GIFTS_PER_FLIGHT - 1);
    r.run(landed + 50);
    expect(r.calls.at(-1)).toBe('friendHappy cat');
    expect(r.sfx.slice(sfx)).toEqual(['puff', 'puff', 'puff', 'call.cat', 'chime']);
    r.run(T.happyMs);
    expect(r.calls.at(-1)).toBe('flyOff');
    expect(r.sfx.at(-1)).toBe('whoosh');
    expect(r.ctl.phase).toBe('flyoff');
    r.run(T.flyOffMs + 50);
    expect(r.ctl.phase).toBe('fly');
    expect(r.ctl.busy).toBe(false);
    expect(r.prompts.at(-1)).toBe('balloons');
    // The old house scrolls away while the next flight's balloons come.
    expect(r.ctl.house).toMatchObject({ friend: 'cat' });
    expect(r.until(() => r.ctl.house === null, 20000)).toBe(true);
    expect(r.calls).toContain('houseGone');
    // The next flight: three more gifts, then the pig's house; its surprise shows once.
    catchGifts(r, GIFTS_PER_FLIGHT);
    expect(r.calls.at(-1)).toBe('houseIn pig');
    expect(r.calls.filter((c) => c.startsWith('surprise'))).toEqual(['surprise rainbow', 'surprise flock']);
    // Never a score, a fail sound or a timer: only these sounds were ever played.
    expect(new Set(r.sfx)).toEqual(new Set(['propeller', 'boing', 'pop', 'puff', 'call.cat', 'chime', 'whoosh']));
  });

  it('a long fly-off is skipped by any tap', () => {
    expect(T.flyOffMs).toBeGreaterThan(T.skipOverMs);
    const r = atHouse();
    r.ctl.tapFriend();
    expect(r.until(() => r.ctl.phase === 'flyoff')).toBe(true);
    r.run(200);
    const calls = r.calls.length;
    r.ctl.anyTap();
    expect(r.calls.slice(calls)).toEqual(['skip']);
    expect(r.ctl.phase).toBe('fly');
    expect(r.ctl.busy).toBe(false);
  });

  it('a tap during the drop skips nothing', () => {
    // A tap during the drop itself skips nothing.
    const r = atHouse();
    r.ctl.tapFriend();
    r.run(300);
    r.ctl.anyTap();
    expect(r.calls).not.toContain('skip');
    expect(r.ctl.phase).toBe('drop');
  });

  it('reduced motion: a slower sky', () => {
    const slow = defaultFlightSizes(true);
    expect(slow.speedScale).toBe(Tokens.ui.planeReducedScroll);
    expect(slow.speedScale).toBeLessThan(1);
    const r = flying({ sizes: slow, timings: { firstBalloonMs: 999999 } });
    const before = r.ctl.scroll;
    r.run(1000);
    expect(r.ctl.scroll - before).toBeCloseTo(Z.scrollPxPerS * slow.speedScale, 0);
  });

  it('the catch is generous and the plane never leaves its band', () => {
    expect(Z.catchRadius).toBeGreaterThanOrEqual(Tokens.ui.planeCatchMinPx);
    expect(Tokens.ui.planeCatchMinPx).toBeGreaterThanOrEqual(80);
    const r = flying({ rng: () => 0.4 });
    for (const y of [0, 800, 300, -50, 1000, 440, 190]) {
      r.ctl.press({ x: 500, y });
      r.ctl.lift();
      for (let k = 0; k < 30; k++) {
        r.run(50);
        expect(r.ctl.planeY).toBeGreaterThanOrEqual(GEO.topY);
        expect(r.ctl.planeY).toBeLessThanOrEqual(GEO.bottomY);
      }
    }
  });

  it('the bags: never the same friend, colour or surprise twice in a row; every id comes up', () => {
    let seed = 7;
    const rng = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (const ids of [FRIEND_IDS, COLOUR_IDS, SURPRISE_IDS] as readonly (readonly string[])[]) {
      const bag = createShuffleBag(ids, rng);
      const drawn = Array.from({ length: 200 }, () => bag.draw());
      for (let i = 1; i < drawn.length; i++) expect(drawn[i]).not.toBe(drawn[i - 1]);
      expect(new Set(drawn)).toEqual(new Set(ids));
      // The first lap deals every id once.
      expect(new Set(drawn.slice(0, ids.length)).size).toBe(ids.length);
    }
    expect(FRIEND_IDS.length).toBeGreaterThanOrEqual(4);
    expect(COLOUR_IDS).toHaveLength(4);
    expect(SURPRISE_IDS.length).toBeGreaterThanOrEqual(3);
    expect(() => createShuffleBag([], rng)).toThrow();
    // A resumed friend is noted: the next draw is never it.
    for (let k = 0; k < 20; k++) {
      const bag = createShuffleBag(FRIEND_IDS, rng);
      bag.note('cow');
      expect(bag.draw()).not.toBe('cow');
    }
  });

  it('the approach starts at the cruise speed (no jump) and eases to a stop at the house', () => {
    const r = flying();
    catchGifts(r, GIFTS_PER_FLIGHT);
    expect(r.ctl.phase).toBe('approach');
    const s0 = r.ctl.scroll;
    r.ctl.tick(50);
    const v = (r.ctl.scroll - s0) / 50;
    const cruise = Z.scrollPxPerS / 1000;
    expect(v).toBeGreaterThan(cruise * 0.97);
    expect(v).toBeLessThanOrEqual(cruise * 1.001);
    expect(r.until(() => r.ctl.phase === 'house', T.approachMaxMs + 200)).toBe(true);
    expect(r.ctl.house!.x).toBe(GEO.houseX);
  });

  it('progress: the partial carries the friend, the gifts on board and the surprise; kept only in the air', () => {
    const r = rig();
    r.ctl.start();
    expect(r.ctl.progress()).toEqual({ questionIndex: 0, partial: { friend: 'cat', gifts: [], surprise: 'rainbow' } });
    expect(r.ctl.hasProgress).toBe(false);
    r.ctl.tapPlane();
    expect(r.ctl.hasProgress).toBe(false);
    r.run(T.takeOffMs + 50);
    catchGifts(r, 2);
    expect(r.ctl.hasProgress).toBe(true);
    expect(r.ctl.progress().partial).toEqual({ friend: 'cat', gifts: ['red', 'yellow'], surprise: 'rainbow' });
  });

  it('resumeFlight: a valid partial resumes; anything else is a fresh take-off', () => {
    const ok = { friend: 'cow', gifts: ['red', 'purple'], surprise: 'heart' };
    expect(resumeFlight({ questionIndex: 0, partial: ok })).toEqual(ok);
    expect(resumeFlight({ questionIndex: 0, partial: { ...ok, gifts: [] } })).toEqual({ ...ok, gifts: [] });
    // The partial core/yard-flow.test.ts keeps.
    expect(resumeFlight({ questionIndex: 0, partial: { friend: 'cat', gifts: ['red', 'purple'], surprise: 'rainbow' } })).not.toBeNull();
    expect(resumeFlight(null)).toBeNull();
    expect(resumeFlight({ questionIndex: 1, partial: ok })).toBeNull();
    expect(resumeFlight({ questionIndex: 0 })).toBeNull();
    expect(resumeFlight({ questionIndex: 0, partial: [] })).toBeNull();
    expect(resumeFlight({ questionIndex: 0, partial: { ...ok, friend: 'dog' } })).toBeNull();
    expect(resumeFlight({ questionIndex: 0, partial: { ...ok, surprise: 'duck' } })).toBeNull();
    expect(resumeFlight({ questionIndex: 0, partial: { ...ok, gifts: ['blue'] } })).toBeNull();
    expect(resumeFlight({ questionIndex: 0, partial: { ...ok, gifts: 'red' } })).toBeNull();
    expect(resumeFlight({ questionIndex: 0, partial: { ...ok, gifts: ['red', 'red', 'red', 'red'] } })).toBeNull();
  });

  it('a resumed flight: in the air at once with its gifts, no second surprise, another friend next', () => {
    const r = rig({ resume: { friend: 'cow', gifts: ['purple'], surprise: 'heart' } });
    r.ctl.start();
    expect(r.calls).toEqual(['restore cow [purple] air']);
    expect(r.said).toEqual(['balloons']);
    expect(r.prompts).toEqual(['balloons']);
    expect(r.ctl.phase).toBe('fly');
    expect(r.ctl.planeY).toBe(MID);
    expect(r.ctl.busy).toBe(false);
    expect(r.friends.last).toBe('cow');
    catchGifts(r, GIFTS_PER_FLIGHT);
    expect(r.calls.some((c) => c.startsWith('surprise'))).toBe(false);
    expect(r.calls.at(-1)).toBe('houseIn cow');
    expect(r.until(() => r.ctl.phase === 'house')).toBe(true);
    r.ctl.tapFriend();
    expect(r.ctl.friend).not.toBe('cow');
  });

  it('a resumed flight with all its gifts: the plane hovers at the house, ready to drop', () => {
    const r = rig({ resume: { friend: 'sheep', gifts: ['red', 'green', 'yellow'], surprise: 'flock' } });
    r.ctl.start();
    expect(r.calls).toEqual(['restore sheep [red,green,yellow] house']);
    expect(r.said).toEqual(['drop.sheep']);
    expect(r.prompts).toEqual(['drop.sheep']);
    expect(r.ctl.phase).toBe('house');
    expect(r.ctl.house).toEqual({ friend: 'sheep', x: GEO.houseX });
    r.run(1000);
    expect(r.ctl.scroll).toBe(0);
    expect(r.ctl.tapFriend()).toBe(true);
    expect(r.calls.at(-1)).toBe('drop sheep [red,green,yellow]');
  });

  it('stop: nothing plays after', () => {
    const r = flying();
    r.ctl.stop();
    const calls = r.calls.length;
    const said = r.said.length;
    r.run(30000);
    expect(r.ctl.tapPlane()).toBe(false);
    expect(r.ctl.press({ x: 500, y: 300 })).toBe('none');
    expect(r.calls).toHaveLength(calls);
    expect(r.said).toHaveLength(said);
  });
});
