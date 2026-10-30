import * as fx from '@ffd/demo/fixtures/yahoo';
import { describe, expect, it } from 'vitest';
import { flat, items, parseAdds, parseGameWeeks, parseLeagues, weekOn, parseMatchup, parseMyTeams, parseRoster, parseStandings, startersOf, toYahooSummary } from './parse.js';

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

  it('reads the matchup totals for both sides', () => {
    expect(matchup?.me).toMatchObject({ points: fx.YAHOO_ME.points, projected: fx.YAHOO_ME.projected });
    expect(matchup?.opponent).toMatchObject({ teamName: fx.YAHOO_OPP_TEAM, points: fx.YAHOO_OPP.points });
  });

  it("builds a league summary of your team and your opponent's starters", () => {
    const summary = toYahooSummary(league!, team!, roster, matchup, record, 6, roster);
    expect(summary).toMatchObject({ platform: 'yahoo', leagueId: fx.YAHOO_LEAGUE_KEY, name: fx.YAHOO_LEAGUE_NAME, myTeamId: fx.YAHOO_TEAM_KEY });
    // The whole league, best first, with managers and logos.
    expect(summary.standings).toEqual([
      expect.objectContaining({ teamId: fx.YAHOO_OPP_TEAM_KEY, teamName: fx.YAHOO_OPP_TEAM, ownerName: 'Pretend Pat', wins: 5, losses: 1, rank: 1 }),
      expect.objectContaining({ teamId: fx.YAHOO_TEAM_KEY, ownerName: 'You Made Up', wins: 4, losses: 2, rank: 3, pointsFor: 702.6, avatarUrl: expect.stringContaining('.png') }),
    ]);
    expect(summary.matchup?.me.starters).toHaveLength(9); // bench and IR left out
    expect(summary.matchup?.opponent?.starters).toHaveLength(9);
    expect(toYahooSummary(league!, team!, roster, matchup, record, 6).matchup?.opponent?.starters).toEqual([]); // roster not fetched
    expect(summary.roster.map((r) => r.status)).toEqual([...Array(9).fill('starter'), 'bench', 'ir']);
    // The Out starter and the Questionable flex both raise lineup alerts.
    expect(summary.alerts.map((a) => `${a.playerName} ${a.detail}`)).toEqual(['Tee Higgins Out', 'Jaylen Waddle Questionable']);
  });

  it("lays starters out on the league's slots, an unfilled one as empty", () => {
    expect(league?.slots).toEqual(['QB', 'WR', 'WR', 'RB', 'RB', 'TE', 'W/R/T', 'K', 'DEF']);
    const noFlex = roster.filter((r) => r.slot !== 'W/R/T');
    const starters = startersOf(noFlex, league!.slots);
    expect(starters.map((s) => `${s.slot} ${s.player?.name ?? '-'}`)).toEqual([
      'QB Josh Allen', 'WR Puka Nacua', 'WR Tee Higgins', 'RB Bijan Robinson', 'RB Derrick Henry', 'TE Travis Kelce', 'W/R/T -', 'K Cam Little', 'DEF Seattle Seahawks',
    ]);
    const summary = toYahooSummary(league!, team!, noFlex, matchup, record, 6);
    expect(summary.alerts.map((a) => a.detail)).toContain('Empty W/R/T slot');
    expect(startersOf(roster, [])).toHaveLength(9); // no settings: the filled slots as Yahoo listed them
  });

  it('copes with an empty or unexpected response', () => {
    expect(parseMyTeams({})).toEqual([]);
    expect(parseRoster({ fantasy_content: {} })).toEqual([]);
    expect(parseMatchup(null, 'x')).toBeNull();
    expect(parseStandings('nope')).toEqual([]);
  });
});

describe('Yahoo transactions', () => {
  // A made-up transactions response in Yahoo's shape: a claim with a bid and a drop, and a free-agent pickup.
  const player = (name: string, data: Record<string, string>) => [[{ player_key: '461.p.1' }, { player_id: '1' }, { name: { full: name } }, { editorial_team_abbr: 'Buf' }, { display_position: 'WR' }], { transaction_data: [data] }];
  const tx = (timestamp: string, players: unknown[], extra: Record<string, unknown> = {}) => [{ type: 'add/drop', status: 'successful', timestamp, ...extra }, { players: { ...Object.fromEntries(players.map((pl, i) => [String(i), { player: pl }])), count: players.length } }];
  const json = {
    fantasy_content: {
      league: [
        { league_key: fx.YAHOO_LEAGUE_KEY },
        {
          transactions: {
            '0': { transaction: tx('1793261400', [player('Claimed Receiver', { type: 'add', source_type: 'waivers', destination_team_key: '461.l.777001.t.4' }), player('Dropped Guy', { type: 'drop', source_type: 'team' })], { faab_bid: '13' }) },
            '1': { transaction: tx('1793290000', [player('Picked Up', { type: 'add', source_type: 'freeagents', destination_team_key: '461.l.777001.t.9' })]) },
            '2': { transaction: [{ type: 'add', status: 'failed', timestamp: '1793261400' }, { players: {} }] },
            count: 3,
          },
        },
      ],
    },
  };

  it('lists adds with when, how and the bid, leaving out drops and failed claims', () => {
    expect(parseAdds(json)).toEqual([
      { at: new Date(1793261400 * 1000), fromWaivers: true, bid: 13, player: expect.objectContaining({ name: 'Claimed Receiver', nflTeam: 'BUF' }), teamKey: '461.l.777001.t.4' },
      { at: new Date(1793290000 * 1000), fromWaivers: false, bid: null, player: expect.objectContaining({ name: 'Picked Up' }), teamKey: '461.l.777001.t.9' },
    ]);
  });
});

describe("Yahoo's week calendar", () => {
  const json = {
    fantasy_content: {
      game: [
        { game_key: '390', season: '2019' },
        { game_weeks: { '0': { game_week: { week: '1', start: '2019-09-05', end: '2019-09-09' } }, '1': { game_week: { week: '2', start: '2019-09-10', end: '2019-09-16' } }, count: 2 } },
      ],
    },
  };
  const weeks = parseGameWeeks(json);

  it('reads each week’s dates', () => {
    expect(weeks).toEqual([{ week: 1, start: '2019-09-05', end: '2019-09-09' }, { week: 2, start: '2019-09-10', end: '2019-09-16' }]);
  });

  it('places a moment in its week by the Eastern date', () => {
    expect(weekOn(weeks, new Date('2019-09-11T08:10:00Z'))).toBe(2); // a Wednesday 4:10 AM ET run
    expect(weekOn(weeks, new Date('2019-09-10T03:30:00Z'))).toBe(1); // still Monday night in New York
    expect(weekOn(weeks, new Date('2019-12-30T12:00:00Z'))).toBeNull();
  });
});
