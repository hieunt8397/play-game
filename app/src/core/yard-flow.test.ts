// Story 7.1 navigation, end to end over the pure shell pieces Map and HomeYard run: the kart trip to the
// home station (core/kart-trip), the yard's corner controller (core/home-yard), Map's navigation reducer
// (core/shell-nav — the same functions Map.ts applies, not a copy), the terminal-event routing
// (core/post-round-chain), the Hud's Home line (core/hud) and the start / resume data (core/session-store).
// Rows: island → yard → game → back to the yard; yard → island; a sleeping corner; the open guard; abandon and
// resume of a yard game; continuous play inside it (the restarted record keeps its yard origin); an island
// game's abandon after round:next.
import { describe, expect, it } from 'vitest';
import { HOME_STATION } from '../content/stations';
import type { GameId, RoundOutcome, Snapshot } from '../content/types';
import { YardController } from './home-yard';
import { homeLine, VO_HOME, VO_HOME_YARD } from './hud';
import { KartTrip, type TripCommand } from './kart-trip';
import { keepAbandonSnapshot, onRoundLeave, PostRoundChain, routeRoundAbandon, routeRoundComplete, routeRoundLeave, routeRoundNext, type RunningGame } from './post-round-chain';
import { createRoad } from './road';
import { SessionStore, takeStartData } from './session-store';
import { INITIAL_NAV, navEnterYard, navLeaveYard, navRestart, navReturn, navYardClosed, navYardOpen, type ShellNav } from './shell-nav';
import { Timing } from './timing';

// A yard corner whose game is registered: `pizza` stands in for a yard game (7.2–7.4 add theirs).
const YARD_GAME: GameId = 'pizza';
const isGame = (id: string): id is GameId => id === YARD_GAME || id === 'ice-cream';
const corners = [
  { id: 'pen' as const, gameId: YARD_GAME, awake: true },
  { id: 'clinic' as const, gameId: 'pet-clinic', awake: false },
];
const progress = { getDifficulty: () => 1 };

function yard(): YardController {
  return new YardController({ corners, nameLine: (id) => `vo.shell.corner-name.${id}`, departMs: Timing.stationTapMs });
}

/** Drives the kart from the start to the home station; returns the commands. */
function driveHome(): TripCommand[] {
  const road = createRoad([
    { x: 0, y: 0 },
    { x: 2000, y: 0 },
  ]);
  const trip = new KartTrip({
    road,
    stops: { 'ice-cream': 300, [HOME_STATION]: 1500 },
    startS: 100,
    capMs: () => Timing.kartDriveMaxMs,
    isAwake: (id) => id === HOME_STATION || isGame(id),
    nameLine: (id) => `vo.shell.station-name.${id}`,
  });
  const cmds = trip.tapStation(HOME_STATION);
  for (let t = 0; t < 20_000 && trip.state !== 'arrived'; t += 10) cmds.push(...trip.tick(10));
  cmds.push(...trip.assetsSettled(HOME_STATION));
  return cmds;
}

/** The yard taps an awake corner until it asks to open; returns the game id it asks for. */
function openCorner(y: YardController): string | undefined {
  y.tapCorner('pen');
  y.assetsSettled(YARD_GAME);
  let enter;
  for (let ms = 0; ms <= Timing.stationTapMs && !enter; ms += 50) enter = y.tick(50).find((c) => c.kind === 'enter');
  return enter?.kind === 'enter' ? enter.gameId : undefined;
}

/** Map's start data (Map.startDataOf): takeStartData on a test session. */
const startData = (session: SessionStore) => (id: GameId) => takeStartData(id, 3, session, () => 0.25, progress);

/** Map's `yard:open` handler: the reducer with Map's context. */
const open = (nav: ShellNav, gameId: string, session: SessionStore, chainActive = false) =>
  navYardOpen(nav, gameId, { chainActive, isGame, startData: startData(session) });

const outcome: RoundOutcome = { gameId: YARD_GAME, questions: 3, firstTryCorrect: 3, maxHintLevel: 0 };

function chainFor(session: SessionStore, saved: Array<[GameId, number]> = []): PostRoundChain {
  return new PostRoundChain({
    setDifficulty: (id, level) => saved.push([id, level]),
    clearResume: (id) => session.clearResume(id),
    ladderLength: () => 3,
    stopGameAndWake: () => Promise.resolve(),
    pullBack: () => Promise.resolve(),
    end: () => undefined,
    now: () => 0,
  });
}

describe('Story 7.1: island → yard → game → yard → island', () => {
  it('tap the home station: the kart drives there, says its name, loads the yard and enters it', () => {
    const cmds = driveHome();
    expect(cmds.slice(0, 4)).toEqual([
      { kind: 'bounce', target: HOME_STATION },
      { kind: 'say', lineId: 'vo.shell.station-name.home' },
      { kind: 'setPrompt', lineId: 'vo.shell.station-name.home' },
      { kind: 'load', gameId: HOME_STATION },
    ]);
    expect(cmds.at(-1)).toEqual({ kind: 'enter', gameId: HOME_STATION });
    expect(navEnterYard(INITIAL_NAV)).toEqual({ state: { running: undefined, yardOpen: true }, effects: [] });
  });

  it('openFromYard: the corner game starts with origin yard, the Home target yard, and the yard sleeps', () => {
    const session = new SessionStore();
    const nav = navEnterYard(INITIAL_NAV).state;
    const step = open(nav, openCorner(yard())!, session);
    expect(step.state).toEqual({ yardOpen: true, running: { id: YARD_GAME, level: 1, origin: 'yard' } });
    expect(step.effects).toEqual([
      { kind: 'setHomeTarget', target: 'yard' },
      { kind: 'startGame', gameId: YARD_GAME, data: { level: 1, seed: 2 ** 29 } },
      { kind: 'sleepYard' },
    ]);
    expect(homeLine('game', 'yard')).toBe(VO_HOME_YARD);
  });

  it("a yard game's leave (free play) wakes the yard, never the island", () => {
    const session = new SessionStore();
    const running = open(navEnterYard(INITIAL_NAV).state, YARD_GAME, session).state;
    expect(routeRoundLeave(running.running, YARD_GAME, false)).toEqual({ action: 'fade', gameId: YARD_GAME });
    const back = navReturn(running, YARD_GAME);
    expect(back.state).toEqual({ running: undefined, yardOpen: true });
    expect(back.effects).toEqual([{ kind: 'forget', gameId: YARD_GAME }, { kind: 'stopGame', gameId: YARD_GAME }, { kind: 'wakeYard' }]);
  });

  it('Home in the yard: "Về đảo nào!", the yard stops and Map wakes with the kart parked at home-stop', () => {
    expect(homeLine('yard', 'island')).toBe(VO_HOME);
    expect(yard().home()).toEqual([{ kind: 'leave' }]);
    const step = navLeaveYard(navEnterYard(INITIAL_NAV).state);
    expect(step.state.yardOpen).toBe(false);
    expect(step.effects).toEqual([{ kind: 'stopYard' }, { kind: 'wakeMap', parkAt: HOME_STATION }]);
    // Not while a yard game runs (its Home handles it), nor when the yard is closed.
    const running = open(navEnterYard(INITIAL_NAV).state, YARD_GAME, new SessionStore()).state;
    expect(navLeaveYard(running).effects).toEqual([]);
    expect(navLeaveYard(INITIAL_NAV).effects).toEqual([]);
    expect(navYardClosed(navEnterYard(INITIAL_NAV).state).state.yardOpen).toBe(false);
  });

  it('a sleeping corner bounces with a happy sound and nothing opens; a stray yard:open is ignored', () => {
    const y = yard();
    expect(y.tapCorner('clinic').map((c) => c.kind)).toEqual(['bounce', 'sfx']);
    expect(y.tick(10_000)).toEqual([]);
    const nav = navEnterYard(INITIAL_NAV).state;
    expect(open(nav, 'pet-clinic', new SessionStore())).toEqual({ state: nav, effects: [] });
  });

  it('yard:open is ignored while a game runs, the yard is closed or a chain runs', () => {
    const session = new SessionStore();
    const nav = navEnterYard(INITIAL_NAV).state;
    const busy: ShellNav = { ...nav, running: { id: 'ice-cream', level: 0, origin: 'island' } };
    expect(open(busy, YARD_GAME, session).effects).toEqual([]);
    expect(open(INITIAL_NAV, YARD_GAME, session).effects).toEqual([]);
    expect(open(nav, YARD_GAME, session, true).effects).toEqual([]);
  });

  it('the open guard: Map ignores the open, the yard wakes itself and releases what it loaded', () => {
    const y = yard();
    const gameId = openCorner(y)!;
    expect(open(INITIAL_NAV, gameId, new SessionStore()).effects).toEqual([]); // yard not open: ignored
    expect(y.state).toBe('entering');
    expect(y.woke()).toEqual([{ kind: 'release', gameId: YARD_GAME }]);
    expect(y.state).toBe('idle');
  });
});

describe('Story 7.1: a yard game mid-round, continuous play', () => {
  it('Home mid-round: round:abandon keeps the snapshot and wakes the yard; reopening resumes it', () => {
    const session = new SessionStore();
    const y = yard();
    const first = open(navEnterYard(INITIAL_NAV).state, openCorner(y)!, session);
    const run = first.state.running!;
    const data = first.effects.find((e) => e.kind === 'startGame');
    const seed = data?.kind === 'startGame' ? data.data.seed : -1;
    const snapshot: Snapshot = { v: 1, level: run.level, seed, questionIndex: 1, partial: { placed: [0], baked: false } };
    expect(keepAbandonSnapshot(run, YARD_GAME, snapshot, session)).toBe(true);
    expect(routeRoundAbandon(run, YARD_GAME)).toEqual({ action: 'fade', gameId: YARD_GAME });
    const back = navReturn(first.state, YARD_GAME);
    expect(back.effects.at(-1)).toEqual({ kind: 'wakeYard' });
    expect(session.resumeIds()).toEqual([YARD_GAME]);
    // The yard is back (woke; Map had taken the game) and the corner is tapped again: the game resumes.
    y.handedOff();
    expect(y.woke()).toEqual([]);
    const again = open(back.state, openCorner(y)!, session);
    expect(again.effects[1]).toEqual({ kind: 'startGame', gameId: YARD_GAME, data: { level: snapshot.level, seed: snapshot.seed, resume: snapshot } });
    expect(session.resumeIds()).toEqual([]);
  });

  it('2026-10-30 (the garden): Home in free play with a half-grown plant (round:leave + snapshot) keeps it; reopening resumes it', () => {
    const session = new SessionStore();
    const run: RunningGame = { id: 'garden', level: 0, origin: 'yard' };
    const partial = { offer: ['lemon', 'tomato'], kind: 'lemon', waterings: 2, left: [], surprise: 'worm' };
    const snapshot: Snapshot = { v: 1, level: 0, seed: 7, questionIndex: 0, partial };
    // Map's round:leave handler: the snapshot is kept first, then the yard's fade return.
    expect(onRoundLeave(run, { gameId: 'garden', snapshot }, false, session)).toEqual({ action: 'fade', gameId: 'garden' });
    expect(session.resumeIds()).toEqual(['garden']);
    const data = startData(session)('garden');
    expect(data).toEqual({ level: 0, seed: 7, resume: snapshot });
    // (games/garden/cycle.test.ts checks that resumeGarden accepts this kept partial: core may not import games/.)
    expect(data.resume?.partial).toEqual(partial);
    expect(session.resumeIds()).toEqual([]);
    // Bare soil hands no snapshot: nothing is kept.
    expect(onRoundLeave(run, { gameId: 'garden' }, false, session)).toEqual({ action: 'fade', gameId: 'garden' });
    expect(session.resumeIds()).toEqual([]);
  });

  it('2026-10-30 (the car wash): Home with a half-washed car (round:leave + snapshot) keeps it; reopening resumes it; a clean bay keeps nothing', () => {
    const session = new SessionStore();
    const run: RunningGame = { id: 'car-wash', level: 0, origin: 'yard' };
    const partial = { vehicle: 'taxi', dirt: 'mud', covered: [0, 3], surprise: 'duck' };
    const snapshot: Snapshot = { v: 1, level: 0, seed: 9, questionIndex: 0, partial };
    expect(onRoundLeave(run, { gameId: 'car-wash', snapshot }, false, session)).toEqual({ action: 'fade', gameId: 'car-wash' });
    expect(session.resumeIds()).toEqual(['car-wash']);
    const data = startData(session)('car-wash');
    expect(data).toEqual({ level: 0, seed: 9, resume: snapshot });
    // (games/car-wash/cycle.test.ts checks that resumeCarWash accepts this kept partial: core may not import games/.)
    expect(data.resume?.partial).toEqual(partial);
    expect(session.resumeIds()).toEqual([]);
    expect(onRoundLeave(run, { gameId: 'car-wash' }, false, session)).toEqual({ action: 'fade', gameId: 'car-wash' });
    expect(session.resumeIds()).toEqual([]);
  });

  it('2026-11-11 (the plane): Home in mid-flight (round:leave + snapshot) keeps the flight; reopening resumes it; a parked plane keeps nothing', () => {
    const session = new SessionStore();
    const run: RunningGame = { id: 'plane', level: 0, origin: 'yard' };
    const partial = { friend: 'cat', gifts: ['red', 'purple'], surprise: 'rainbow' };
    const snapshot: Snapshot = { v: 1, level: 0, seed: 9, questionIndex: 0, partial };
    expect(onRoundLeave(run, { gameId: 'plane', snapshot }, false, session)).toEqual({ action: 'fade', gameId: 'plane' });
    expect(session.resumeIds()).toEqual(['plane']);
    const data = startData(session)('plane');
    expect(data).toEqual({ level: 0, seed: 9, resume: snapshot });
    // (games/plane/flight.test.ts checks that resumeFlight accepts this kept partial: core may not import games/.)
    expect(data.resume?.partial).toEqual(partial);
    expect(session.resumeIds()).toEqual([]);
    expect(onRoundLeave(run, { gameId: 'plane' }, false, session)).toEqual({ action: 'fade', gameId: 'plane' });
    expect(session.resumeIds()).toEqual([]);
  });

  it('2026-11-12 (the train): Home with a friend aboard (round:leave + snapshot) keeps the trip; reopening resumes it; a train at its start station keeps nothing', () => {
    const session = new SessionStore();
    const run: RunningGame = { id: 'train', level: 0, origin: 'yard' };
    const partial = { friends: ['cat', 'pig', 'cow'], aboard: 1, dest: 'beach', surprise: 'bridge', tunnelLeg: 2 };
    const snapshot: Snapshot = { v: 1, level: 0, seed: 9, questionIndex: 0, partial };
    expect(onRoundLeave(run, { gameId: 'train', snapshot }, false, session)).toEqual({ action: 'fade', gameId: 'train' });
    expect(session.resumeIds()).toEqual(['train']);
    const data = startData(session)('train');
    expect(data).toEqual({ level: 0, seed: 9, resume: snapshot });
    // (games/train/trip.test.ts checks that resumeTrip accepts this kept partial: core may not import games/.)
    expect(data.resume?.partial).toEqual(partial);
    expect(session.resumeIds()).toEqual([]);
    expect(onRoundLeave(run, { gameId: 'train' }, false, session)).toEqual({ action: 'fade', gameId: 'train' });
    expect(session.resumeIds()).toEqual([]);
  });

  it('round complete → round:next: the restarted record keeps origin yard, so a later leave or abandon still wakes the yard', () => {
    const session = new SessionStore();
    const saved: Array<[GameId, number]> = [];
    const chain = chainFor(session, saved);
    const started = open(navEnterYard(INITIAL_NAV).state, YARD_GAME, session).state;
    const settle = routeRoundComplete(started.running, outcome);
    expect(settle.action).toBe('settle');
    if (settle.action === 'settle') chain.settle(settle.start);
    expect(saved).toHaveLength(1);
    expect(routeRoundNext(started.running, YARD_GAME, chain.active)).toEqual({ action: 'restart', gameId: YARD_GAME });
    const restarted = navRestart(started, YARD_GAME, startData(session));
    // The record Map keeps after the restart (Map.restartGame applies exactly this state).
    expect(restarted.state.running).toEqual({ id: YARD_GAME, level: 1, origin: 'yard' });
    expect(restarted.state.yardOpen).toBe(true);
    expect(restarted.effects).toEqual([{ kind: 'restartGame', gameId: YARD_GAME, data: { level: 1, seed: 2 ** 29 } }]);
    // Leave in the next round's free play, and abandon mid-round: both back to the yard.
    expect(routeRoundLeave(restarted.state.running, YARD_GAME, false)).toEqual({ action: 'fade', gameId: YARD_GAME });
    expect(navReturn(restarted.state, YARD_GAME).effects.at(-1)).toEqual({ kind: 'wakeYard' });
    expect(routeRoundAbandon(restarted.state.running, YARD_GAME)).toEqual({ action: 'fade', gameId: YARD_GAME });
    // After the return the yard can still be left (yardOpen kept, no game running).
    expect(navLeaveYard(navReturn(restarted.state, YARD_GAME).state).effects).toEqual([{ kind: 'stopYard' }, { kind: 'wakeMap', parkAt: HOME_STATION }]);
  });

  it('an island game: round:next keeps origin island; an abandon after it fades back to the island', () => {
    const session = new SessionStore();
    const island: ShellNav = { running: { id: 'ice-cream', level: 0, origin: 'island' }, yardOpen: false };
    const restarted = navRestart(island, 'ice-cream', startData(session));
    expect(restarted.state.running).toEqual({ id: 'ice-cream', level: 1, origin: 'island' });
    expect(routeRoundAbandon(restarted.state.running, 'ice-cream')).toEqual({ action: 'fade', gameId: 'ice-cream' });
    const back = navReturn(restarted.state, 'ice-cream');
    expect(back.state.running).toBeUndefined();
    // Map wakes (the kart stays at the station: no parkAt); the chain's settled mark is forgotten too.
    expect(back.effects).toEqual([{ kind: 'forget', gameId: 'ice-cream' }, { kind: 'stopGame', gameId: 'ice-cream' }, { kind: 'wakeMap' }]);
    const leave: RunningGame = { id: 'ice-cream', level: 0, origin: 'island' };
    expect(routeRoundLeave(leave, 'ice-cream', false)).toEqual({ action: 'chain', start: { kind: 'complete', gameId: 'ice-cream' } });
  });

  it('a restart or return for another game id changes nothing', () => {
    const nav: ShellNav = { running: { id: YARD_GAME, level: 0, origin: 'yard' }, yardOpen: true };
    expect(navRestart(nav, 'ice-cream', startData(new SessionStore()))).toEqual({ state: nav, effects: [] });
    expect(navReturn(nav, 'ice-cream')).toEqual({ state: nav, effects: [] });
  });
});
