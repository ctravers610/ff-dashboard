import type { TeamStanding } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import type { YahooMatchup, YahooRosterSpot } from '../adapters/yahoo/parse.js';
import { yahooSeason } from './index.js';

// A made-up four-team Yahoo league, two weeks played, playoffs from week 4.
const standing = (teamId: string, wins: number, losses: number, pointsFor: number): TeamStanding => ({
  teamId, teamName: `Team ${teamId}`, ownerName: '', avatarUrl: null, wins, losses, ties: 0, rank: 0, pointsFor, pointsAgainst: 0,
});
const game = (week: number, status: string, me: string, pm: number, them: string, pt: number): YahooMatchup => ({
  week, status, me: { teamKey: me, teamName: me, points: pm, projected: null }, opponent: { teamKey: them, teamName: them, points: pt, projected: null },
});
const both = (week: number, status: string, a: string, pa: number, b: string, pb: number) => [game(week, status, a, pa, b, pb), game(week, status, b, pb, a, pa)];
const all = [
  ...both(1, 'postevent', 'A', 110, 'B', 90), ...both(1, 'postevent', 'C', 100, 'D', 100),
  ...both(2, 'postevent', 'A', 95, 'C', 120), ...both(2, 'postevent', 'B', 80, 'D', 85),
  ...both(3, 'midevent', 'A', 40, 'D', 30), ...both(3, 'midevent', 'B', 20, 'C', 10),
  ...both(4, 'preevent', 'A', 0, 'B', 0), // playoffs: not part of the regular season
];
const schedule = new Map(['A', 'B', 'C', 'D'].map((t) => [t, all.filter((m) => m.me.teamKey === t)]));
const hurt: YahooRosterSpot = { player: { playerId: 'yahoo:1', name: 'Hurt Starter', position: 'WR', nflTeam: 'BUF', injuryStatus: 'Out' }, slot: 'WR', points: 0 };
const benched: YahooRosterSpot = { ...hurt, player: { ...hurt.player, name: 'Hurt Bench' }, slot: 'BN' };

describe('a Yahoo season for the outlook', () => {
  const season = yahooSeason(
    [standing('A', 1, 1, 205), standing('B', 0, 2, 170), standing('C', 1, 0, 220), standing('D', 1, 0, 185)],
    schedule,
    new Map([['D', [hurt, benched]]]),
    { playoffTeams: 2, playoffStartWeek: 4 },
    'A',
  );

  it('lists each finished game once, with results in week order', () => {
    expect(season.played).toHaveLength(4);
    expect(season.teams.find((t) => t.teamId === 'A')?.results).toEqual(['W', 'L']);
    expect(season.teams.find((t) => t.teamId === 'C')?.results).toEqual(['T', 'W']);
  });

  it('previews your next game even when another team lists a later one first', () => {
    const later = new Map([['B', [game(3, 'preevent', 'B', 0, 'A', 0)]], ['A', [game(2, 'preevent', 'A', 0, 'C', 0), game(3, 'preevent', 'A', 0, 'B', 0)]], ['C', [game(2, 'preevent', 'C', 0, 'A', 0)]]]);
    const s = yahooSeason([standing('A', 0, 0, 0), standing('B', 0, 0, 0), standing('C', 0, 0, 0)], later, new Map(), { playoffTeams: 2, playoffStartWeek: 4 }, 'A');
    expect(s.remaining.map((g) => g.week)).toEqual([2, 3]);
  });

  it("leaves this week and the rest of the regular season to play, but not the playoffs", () => {
    expect(season.remaining).toEqual([
      { week: 3, a: 'A', b: 'D' },
      { week: 3, a: 'B', b: 'C' },
    ]);
    expect(season).toMatchObject({ playoffTeams: 2, myTeamId: 'A' });
  });

  it('notes hurt starters, not hurt bench players', () => {
    expect(season.injured.get('D')).toEqual([{ name: 'Hurt Starter', position: 'WR', status: 'Out' }]);
  });
});
