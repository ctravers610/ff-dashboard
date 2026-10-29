// Your Yahoo leagues: your team, this week's opponent and the standings in
// each. Like the other platforms, they feed History (snapshots and backfill,
// see history.ts), the live feed, recaps, playoff odds and waivers.
//
// Calls per load: your teams and your leagues (one each, for all leagues),
// then per league your roster with this week's points, your matchup, and the
// league's standings, then your opponent's roster. Throttled calls back off and retry (client.ts).

import type { SourceError } from '@ffd/shared';
import type { AdapterResult } from '../types.js';
import { isConnected, yahooConfigured } from './auth.js';
import { yahooGet } from './client.js';
import { parseLeagues, parseMatchup, parseMyTeams, parseRoster, parseStandings, toYahooSummary, type YahooLeagueInfo, type YahooTeamRef } from './parse.js';

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Whether there are Yahoo leagues to load: the app is set up and you've connected. */
export const yahooReady = async () => yahooConfigured() && (await isConnected().catch(() => false));

/** Your team in each of this season's Yahoo leagues, with that league. */
export async function myYahooTeams(): Promise<{ team: YahooTeamRef; league: YahooLeagueInfo }[]> {
  // game_keys=nfl is this season's game; game_codes=nfl would be every season you've ever played.
  const [teamsJson, leaguesJson] = await Promise.all([
    yahooGet('users;use_login=1/games;game_keys=nfl/teams'),
    yahooGet('users;use_login=1/games;game_keys=nfl/leagues;out=settings'), // settings: the lineup slots
  ]);
  const leagues = new Map(parseLeagues(leaguesJson).map((l) => [l.leagueKey, l]));
  return parseMyTeams(teamsJson).flatMap((team) => {
    const league = leagues.get(team.leagueKey);
    return league ? [{ team, league }] : [];
  });
}

export async function fetchYahooLeagues(nfl: { week: number }): Promise<AdapterResult> {
  if (!(await yahooReady())) return { leagues: [], errors: [] };
  try {
    const errors: SourceError[] = [];
    const summaries = await Promise.all(
      (await myYahooTeams()).map(async ({ team, league }) => {
        const week = league.currentWeek || nfl.week;
        try {
          const [roster, matchup, standing] = await Promise.all([
            yahooGet(`team/${team.teamKey}/roster;week=${week}/players/stats;type=week;week=${week}`),
            yahooGet(`team/${team.teamKey}/matchups;weeks=${week}`),
            yahooGet(`league/${league.leagueKey}/standings`),
          ]);
          const versus = parseMatchup(matchup, team.teamKey);
          const opponentRoster = versus?.opponent
            ? await yahooGet(`team/${versus.opponent.teamKey}/roster;week=${week}/players/stats;type=week;week=${week}`)
            : null;
          return toYahooSummary(league, team, parseRoster(roster), versus, parseStandings(standing), week, parseRoster(opponentRoster));
        } catch (e) {
          errors.push({ source: `yahoo:${league.leagueKey}`, message: errorMessage(e) });
          return null;
        }
      }),
    );
    return { leagues: summaries.filter((s) => s != null), errors };
  } catch (e) {
    return { leagues: [], errors: [{ source: 'yahoo', message: errorMessage(e) }] };
  }
}
