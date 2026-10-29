import type { LeagueSummary, MatchupSide, Player } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import { minutesLeft, withMinutesLeft } from './minutesLeft.js';
import type { GameScore } from './scoring/games.js';

const game = (progress: number): GameScore => ({ opponent: 'X', opponentScore: 0, started: progress > 0, progress, kickoff: null });
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

describe('withMinutesLeft', () => {
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
    const [l] = withMinutesLeft([league(6)], 6, games);
    expect([l!.matchup!.me.minutesLeft, l!.matchup!.opponent!.minutesLeft]).toEqual([60, 30]);
  });

  it('leaves a matchup pasted for another week alone', () => {
    const [l] = withMinutesLeft([league(5)], 6, games);
    expect(l!.matchup!.me.minutesLeft).toBeUndefined();
  });
});
