import type { Player } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import type { YahooLeagueInfo, YahooRosterSpot } from '../adapters/yahoo/parse.js';
import { yahooWaiverLeague, type YahooWaiverInput } from './yahoo.js';

// A made-up Yahoo league: QB, WR, flex. Your WR is out for the claim week.
const player = (id: string, name: string, position: string, injuryStatus: Player['injuryStatus'] = null): Player => ({ playerId: `yahoo:${id}`, name, position, nflTeam: 'BUF', injuryStatus });
const spot = (p: Player, slot: string): YahooRosterSpot => ({ player: p, slot, points: 0 });
const league: YahooLeagueInfo = { leagueKey: '461.l.777001', leagueId: '777001', name: 'Made-Up Yahoo League', season: '2026', currentWeek: 8, slots: ['QB', 'WR', 'W/R/T'] };
const input: YahooWaiverInput = {
  league,
  settings: { playoffTeams: 6, playoffStartWeek: 15, usesFaab: true, rosterSize: 4 },
  scoring: { rec: 1, rec_yd: 0.1 },
  standing: { priority: 3, faabBalance: 42 },
  teams: 10,
  roster: [spot(player('1', 'Made Up Quarterback', 'QB'), 'QB'), spot(player('2', 'Hurt Receiver', 'WR', 'Out'), 'WR'), spot(player('3', 'Flex Back', 'RB'), 'W/R/T')],
  available: [{ ...spot(player('9', 'Open Receiver', 'WR'), ''), onWaivers: true }, { ...spot(player('8', 'Free Kicker', 'K'), ''), onWaivers: false }],
};
// Sleeper's projections for the claim week, then the week after, by Sleeper id.
type Stats = Record<string, number>;
const weeks = [new Map<string, Stats>([['s9', { rec: 5, rec_yd: 60 }], ['s2', {}]]), new Map<string, Stats>([['s9', { rec: 4, rec_yd: 50 }]])];
const sleeperIdOf = (p: Player) => `s${p.playerId.split(':')[1]}`;
const ctx = { season: '2026', week: 8, lastWeek: 14, byeTeams: null, trendingAdds: new Map() };

describe('a Yahoo waiver league', () => {
  const view = yahooWaiverLeague(input, weeks, sleeperIdOf, ctx);

  it("reads FAAB and priority from Yahoo, with the starting budget unknown", () => {
    expect(view.rules).toEqual({ type: 'faab', faabTotal: null, faabLeft: 42, priority: 3, teams: 10 });
    expect(view.openRosterSpots).toBe(1);
  });

  it("values available players with Sleeper's projections in the league's scoring, at positions it starts", () => {
    expect(view.available).toEqual([expect.objectContaining({ player: expect.objectContaining({ name: 'Open Receiver' }), week: 11, restOfSeason: 20, availability: 'waivers' })]);
  });

  it('suggests a pickup for the starter who is out', () => {
    expect(view.moves[0]).toMatchObject({ slot: 'WR', reason: 'injury' });
  });
});
