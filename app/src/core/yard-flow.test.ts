// Story 7.1 navigation, end to end over the pure shell pieces Map and HomeYard wire together:
// the kart trip to the home station (core/kart-trip), the yard's corner controller (core/home-yard), Map's
// routing of `yard:open` and of a yard game's terminal events (core/post-round-chain), the Hud's Home line
// (core/hud) and the start / resume data (core/session-store). Rows: island → yard → game → back to the
// yard; yard → island; a sleeping corner; abandon and resume of a yard game; continuous play inside it.
import { describe, expect, it } from 'vitest';
import { HOME_STATION } from '../content/stations';
import type { GameId, RoundOutcome, Snapshot } from '../content/types';
import { YardController } from './home-yard';
import { homeLine, VO_HOME, VO_HOME_YARD } from './hud';
import { KartTrip, type TripCommand } from './kart-trip';
import {
  keepAbandonSnapshot,
  PostRoundChain,
  returnTarget,
  routeRoundAbandon,
  routeRoundComplete,
  routeRoundLeave,
  routeRoundNext,
  routeYardOpen,
  type RunningGame,
} from './post-round-chain';
import { createRoad } from './road';
import { SessionStore, takeStartData } from './session-store';
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

/** Map's `yard:open`: route, then start like Map.openFromYard (takeStartData, origin 'yard'). */
function mapOpen(session: SessionStore, gameId: string, running: RunningGame | undefined, yardOpen = true) {
  const route = routeYardOpen(running, gameId, { yardOpen, chainActive: false }, isGame);
  if (route.action !== 'open') return undefined;
  const data = takeStartData(route.gameId, 3, session, () => 0.25, progress);
  return { running: { id: route.gameId, level: data.level, origin: 'yard' as const }, data };
}

const outcome: RoundOutcome = { gameId: YARD_GAME, questions: 3, firstTryCorrect: 3, maxHintLevel: 0 };

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
  });

  it('an awake corner opens its game from the yard; leave returns to the yard with the fade', () => {
    const session = new SessionStore();
    const gameId = openCorner(yard());
    expect(gameId).toBe(YARD_GAME);
    const started = mapOpen(session, gameId!, undefined)!;
    expect(started.running).toEqual({ id: YARD_GAME, level: 1, origin: 'yard' });
    expect(homeLine('game', returnTarget(started.running))).toBe(VO_HOME_YARD);
    // Free play then Home: round:leave → the fade back to the yard, never the island chain.
    expect(routeRoundLeave(started.running, YARD_GAME, false)).toEqual({ action: 'fade', gameId: YARD_GAME });
    expect(returnTarget(started.running)).toBe('yard');
  });

  it('Home in the yard goes back to the island ("Về đảo nào!"), the kart parked at the home stop', () => {
    const y = yard();
    expect(homeLine('yard', 'island')).toBe(VO_HOME);
    expect(y.home()).toEqual([{ kind: 'leave' }]);
    const session = new SessionStore();
    session.lastStation = HOME_STATION; // Map.enterYard: the kart parks at `home-stop` on wake
    expect(session.lastStation).toBe('home');
  });

  it('a sleeping corner bounces with a happy sound and nothing opens', () => {
    const y = yard();
    expect(y.tapCorner('clinic').map((c) => c.kind)).toEqual(['bounce', 'sfx']);
    expect(y.tick(10_000)).toEqual([]);
    // Even a stray yard:open of an unregistered game is ignored by Map.
    expect(routeYardOpen(undefined, 'pet-clinic', { yardOpen: true, chainActive: false }, isGame)).toEqual({ action: 'ignore' });
  });

  it('yard:open is ignored while a game runs, the yard is closed or a chain runs', () => {
    const running: RunningGame = { id: 'ice-cream', level: 0, origin: 'island' };
    expect(routeYardOpen(running, YARD_GAME, { yardOpen: true, chainActive: false }, isGame).action).toBe('ignore');
    expect(routeYardOpen(undefined, YARD_GAME, { yardOpen: false, chainActive: false }, isGame).action).toBe('ignore');
    expect(routeYardOpen(undefined, YARD_GAME, { yardOpen: true, chainActive: true }, isGame).action).toBe('ignore');
    expect(routeYardOpen(undefined, YARD_GAME, { yardOpen: true, chainActive: false }, isGame)).toEqual({ action: 'open', gameId: YARD_GAME });
  });
});

describe('Story 7.1: a yard game mid-round, continuous play', () => {
  it('Home mid-round: round:abandon keeps the snapshot and fades back to the yard; reopening resumes it', () => {
    const session = new SessionStore();
    const y = yard();
    const first = mapOpen(session, openCorner(y)!, undefined)!;
    const snapshot: Snapshot = { v: 1, level: first.running.level, seed: first.data.seed, questionIndex: 1, partial: { placed: [0], baked: false } };
    expect(keepAbandonSnapshot(first.running, YARD_GAME, snapshot, session)).toBe(true);
    expect(routeRoundAbandon(first.running, YARD_GAME)).toEqual({ action: 'fade', gameId: YARD_GAME });
    expect(returnTarget(first.running)).toBe('yard');
    expect(session.resumeIds()).toEqual([YARD_GAME]);
    // The yard is back (woke) and the corner is tapped again: the game resumes its snapshot.
    y.woke();
    const again = mapOpen(session, openCorner(y)!, undefined)!;
    expect(again.data).toEqual({ level: snapshot.level, seed: snapshot.seed, resume: snapshot });
    expect(session.resumeIds()).toEqual([]);
  });

  it('round complete: settled at once, then round:next restarts the game in place (still a yard game)', () => {
    const session = new SessionStore();
    const started = mapOpen(session, openCorner(yard())!, undefined)!;
    const saved: Array<[GameId, number]> = [];
    const chain = new PostRoundChain({
      setDifficulty: (id, level) => saved.push([id, level]),
      clearResume: (id) => session.clearResume(id),
      ladderLength: () => 3,
      stopGameAndWake: () => Promise.resolve(),
      pullBack: () => Promise.resolve(),
      end: () => undefined,
      now: () => 0,
    });
    const settle = routeRoundComplete(started.running, outcome);
    expect(settle.action).toBe('settle');
    if (settle.action === 'settle') chain.settle(settle.start);
    expect(saved).toHaveLength(1);
    expect(routeRoundNext(started.running, YARD_GAME, chain.active)).toEqual({ action: 'restart', gameId: YARD_GAME });
    // The next round starts fresh (settled: no resume), the running game keeps its yard origin.
    const next = takeStartData(YARD_GAME, 3, session, () => 0.5, progress);
    expect(next.resume).toBeUndefined();
    // Home in that free play: back to the yard; the chain forgets the settled game (no island chain).
    expect(routeRoundLeave(started.running, YARD_GAME, chain.active)).toEqual({ action: 'fade', gameId: YARD_GAME });
    chain.forget(YARD_GAME);
    expect(chain.active).toBe(false);
  });

  it('an island game still takes the post-round chain on leave', () => {
    const island: RunningGame = { id: 'ice-cream', level: 0, origin: 'island' };
    expect(routeRoundLeave(island, 'ice-cream', false)).toEqual({ action: 'chain', start: { kind: 'complete', gameId: 'ice-cream' } });
    expect(returnTarget(island)).toBe('island');
    expect(returnTarget({ id: 'ice-cream', level: 0 })).toBe('island');
  });
});
