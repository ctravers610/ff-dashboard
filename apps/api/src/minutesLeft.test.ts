import type { LeagueSummary, MatchupSide, Player } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import { minutesLeft, starterGame, withGameProgress } from './minutesLeft.js';
import { gameClock, type GameScore } from './scoring/games.js';

const game = (progress: number): GameScore => ({ opponent: 'X', opponentScore: 0, started: progress > 0, progress, kickoff: null, clock: progress > 0 && progress < 1 ? 'Q2 0:00' : null });
const games = new Map([
  ['KC', game(0)], // not started: 60
  ['BUF', game(0.5)], // halftime: 30
  ['SF', game(1)], // final: 0
  ['WAS', game(0.25)], // a quarter played: 45
]);
const p = (nflTeam: string | null): Player => ({ playerId: String(nflTeam), name: 'x', position: 'WR', nflTeam, injuryStatus: null });
const side = (teams: (string | null)[]): MatchupSide => ({
  teamId: '1',
  teamName: 'Me',
  points: 0,
  starters: teams.map((t) => ({ slot: 'WR', player: t === 'empty' ? null : p(t), points: 0 })),
});

describe('minutesLeft', () => {
  it('counts 60 per starter, less what his game has played', () => {
    expect(minutesLeft(side(['KC', 'BUF', 'SF', 'WAS']), games)).toBe(60 + 30 + 0 + 45);
  });

  it('counts nothing for a bye or an empty slot', () => {
    expect(minutesLeft(side(['DEN', 'empty']), games)).toBe(0);
  });
});

describe('starterGame', () => {
  it('says where his game stands', () => {
    expect(starterGame(p('KC'), games)).toEqual({ state: 'pre', clock: null, kickoff: null });
    expect(starterGame(p('BUF'), games)).toEqual({ state: 'live', clock: 'Q2 0:00', kickoff: null });
    expect(starterGame(p('SF'), games)?.state).toBe('final');
  });

  it('is a bye for a team not on the schedule, and nothing for an empty slot', () => {
    expect(starterGame(p('DEN'), games)?.state).toBe('bye');
    expect(starterGame(null, games)).toBeNull();
  });
});

describe('gameClock', () => {
  it('reads the quarter and clock only while a game is on', () => {
    expect(gameClock('in', 3, 372)).toBe('Q3 6:12');
    expect(gameClock('in', 4, 5)).toBe('Q4 0:05');
    expect(gameClock('in', 5, 300)).toBe('OT');
    expect(gameClock('pre', 0, 900)).toBeNull();
    expect(gameClock('post', 4, 0)).toBeNull();
  });
});

describe('withGameProgress', () => {
  const league = (week: number): LeagueSummary => ({
    leagueId: 'L',
    platform: 'ffpc',
    account: 'me',
    name: 'L',
    season: '2026',
    week: 6,
    myTeamId: '1',
    standings: [],
    alerts: [],
    roster: [],
    matchup: { week, me: side(['KC']), opponent: side(['BUF']) },
  });

  it('adds both sides for this week', () => {
    const [l] = withGameProgress([league(6)], 6, games);
    expect([l!.matchup!.me.minutesLeft, l!.matchup!.opponent!.minutesLeft]).toEqual([60, 30]);
    expect([l!.matchup!.me.starters[0]!.game?.state, l!.matchup!.opponent!.starters[0]!.game?.state]).toEqual(['pre', 'live']);
  });

  it('leaves a matchup pasted for another week alone', () => {
    const [l] = withGameProgress([league(5)], 6, games);
    expect(l!.matchup!.me.minutesLeft).toBeUndefined();
    expect(l!.matchup!.me.starters[0]!.game).toBeUndefined();
  });

  it('leaves everything alone when the schedule is unknown', () => {
    const [l] = withGameProgress([league(6)], 6, new Map());
    expect(l!.matchup!.me.starters[0]!.game).toBeUndefined();
  });
});
