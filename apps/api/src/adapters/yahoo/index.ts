// Your Yahoo leagues, live: under the Yahoo Fantasy API agreement (personal
// use), the dashboard shows only your own team in each league, fetches it fresh
// every time, and never stores or caches it. Yahoo leagues are also kept out of
// everything that saves data: history snapshots and backfill, the live feed's
// event log, recaps, playoff odds and trades (see dashboard.ts and live/track.ts).
//
// Calls per load: your teams and your leagues (one each, for all leagues),
// then per league your roster with this week's points, your matchup, and your
// standing. Throttled calls back off and retry (client.ts).

import type { SourceError } from '@ffd/shared';
import type { AdapterResult } from '../types.js';
import { isConnected, yahooConfigured } from './auth.js';
import { yahooGet } from './client.js';
import { parseLeagues, parseMatchup, parseMyTeams, parseRoster, parseStandings, toYahooSummary } from './parse.js';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function fetchYahooLeagues(nfl: { week: number }): Promise<AdapterResult> {
  if (!yahooConfigured() || !(await isConnected().catch(() => false))) return { leagues: [], errors: [] };
  try {
    const [teamsJson, leaguesJson] = await Promise.all([
      yahooGet('users;use_login=1/games;game_codes=nfl/teams'),
      yahooGet('users;use_login=1/games;game_codes=nfl/leagues'),
    ]);
    const leagues = new Map(parseLeagues(leaguesJson).map((l) => [l.leagueKey, l]));
    const errors: SourceError[] = [];
    const summaries = await Promise.all(
      parseMyTeams(teamsJson).map(async (team) => {
        const league = leagues.get(team.leagueKey);
        if (!league) return null;
        const week = league.currentWeek || nfl.week;
        try {
          const [roster, matchup, standing] = await Promise.all([
            yahooGet(`team/${team.teamKey}/roster;week=${week}/players/stats;type=week;week=${week}`),
            yahooGet(`team/${team.teamKey}/matchups;weeks=${week}`),
            yahooGet(`team/${team.teamKey}/standings`),
          ]);
          return toYahooSummary(league, team, parseRoster(roster), parseMatchup(matchup, team.teamKey), parseStandings(standing), week);
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
