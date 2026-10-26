import * as fx from '@ffd/demo/fixtures/yahoo';
import { describe, expect, it } from 'vitest';
import { flat, items, parseLeagues, parseMatchup, parseMyTeams, parseRoster, parseStandings, toYahooSummary } from './parse.js';

// Made-up responses only (packages/demo/src/fixtures/yahoo.ts).
describe('Yahoo JSON helpers', () => {
  it('merges one-key-object arrays and lists collections in order', () => {
    expect(flat([{ a: 1 }, [{ b: 2 }], [], { c: 3 }])).toEqual({ a: 1, b: 2, c: 3 });
    expect(items({ '1': { team: 'y' }, '0': { team: 'x' }, count: 2 }, 'team')).toEqual(['x', 'y']);
  });
});

describe('parsing a Yahoo league', () => {
  const [team] = parseMyTeams(fx.userTeams());
  const [league] = parseLeagues(fx.userLeagues());
  const roster = parseRoster(fx.roster());
  const matchup = parseMatchup(fx.matchups(), fx.YAHOO_TEAM_KEY);
  const record = parseStandings(fx.standings());

  it('finds your team and league', () => {
    expect(team).toEqual({ teamKey: fx.YAHOO_TEAM_KEY, teamName: fx.YAHOO_MY_TEAM, leagueKey: fx.YAHOO_LEAGUE_KEY });
    expect(league).toMatchObject({ leagueKey: fx.YAHOO_LEAGUE_KEY, name: fx.YAHOO_LEAGUE_NAME, currentWeek: 6 });
  });

  it('reads your roster: slots, points, NFL teams and injuries', () => {
    expect(roster).toHaveLength(fx.YAHOO_LINEUP.length);
    expect(roster[0]).toMatchObject({ slot: 'QB', points: 21.3, player: { name: 'Josh Allen', position: 'QB', nflTeam: 'BUF', injuryStatus: null } });
    expect(roster.find((r) => r.player.name === 'Tee Higgins')?.player.injuryStatus).toBe('Out');
    expect(roster.find((r) => r.slot === 'W/R/T')?.player).toMatchObject({ name: 'Jaylen Waddle', injuryStatus: 'Questionable' });
  });

  it('reads the matchup, with the opponent as totals only', () => {
    expect(matchup?.me).toMatchObject({ points: fx.YAHOO_ME.points, projected: fx.YAHOO_ME.projected });
    expect(matchup?.opponent).toMatchObject({ teamName: fx.YAHOO_OPP_TEAM, points: fx.YAHOO_OPP.points });
  });

  it('builds a league summary of your own team only', () => {
    const summary = toYahooSummary(league!, team!, roster, matchup, record, 6);
    expect(summary).toMatchObject({ platform: 'yahoo', leagueId: fx.YAHOO_LEAGUE_KEY, name: fx.YAHOO_LEAGUE_NAME, myTeamId: fx.YAHOO_TEAM_KEY });
    expect(summary.standings).toEqual([expect.objectContaining({ teamId: fx.YAHOO_TEAM_KEY, wins: 4, losses: 2, rank: 3 })]);
    expect(summary.matchup?.me.starters).toHaveLength(9); // bench and IR left out
    expect(summary.matchup?.opponent?.starters).toEqual([]); // never another team's roster
    expect(summary.roster.map((r) => r.status)).toEqual([...Array(9).fill('starter'), 'bench', 'ir']);
    // The Out starter and the Questionable flex both raise lineup alerts.
    expect(summary.alerts.map((a) => `${a.playerName} ${a.detail}`)).toEqual(['Tee Higgins Out', 'Jaylen Waddle Questionable']);
  });

  it('copes with an empty or unexpected response', () => {
    expect(parseMyTeams({})).toEqual([]);
    expect(parseRoster({ fantasy_content: {} })).toEqual([]);
    expect(parseMatchup(null, 'x')).toBeNull();
    expect(parseStandings('nope')).toBeNull();
  });
});
