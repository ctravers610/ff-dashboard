import { cached, MINUTE } from '../../cache.js';
import { config } from '../../config.js';
import type { EspnFreeAgents, EspnLeague } from './types.js';

const VIEWS = ['mSettings', 'mTeam', 'mRoster', 'mMatchupScore', 'mScoreboard', 'mStatus'];

export interface EspnAuth {
  espnS2: string;
  swid: string;
}

// Private leagues need the espn_s2 and SWID cookies from a logged-in browser.
async function get<T>(
  leagueId: string,
  season: string,
  auth: EspnAuth | null,
  params: URLSearchParams,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const url = `${config.upstream.espnFantasy}/${season}/segments/0/leagues/${leagueId}?${params}`;
  const headers: Record<string, string> = { Accept: 'application/json', ...extraHeaders };
  if (auth) headers.Cookie = `espn_s2=${auth.espnS2}; SWID=${auth.swid}`;

  const res = await fetch(url, { headers });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      auth
        ? `ESPN rejected the cookies for league ${leagueId} (they may have expired)`
        : `League ${leagueId} is private: set ESPN_S2 and ESPN_SWID in .env`,
    );
  }
  if (!res.ok) throw new Error(`ESPN league ${leagueId} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

const views = (...names: string[]) => new URLSearchParams(names.map((v) => ['view', v]));

// Players nobody in the league has, most-owned across ESPN first, with stats for
// the given week (and the season) scored by the league's own settings.
const FREE_AGENT_FILTER = {
  players: {
    filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
    limit: 200,
    sortPercOwned: { sortPriority: 1, sortAsc: false },
  },
};

export const espnClient = {
  league: (leagueId: string, season: string, auth: EspnAuth | null) =>
    cached(`espn:league:${leagueId}:${season}`, MINUTE, () => get<EspnLeague>(leagueId, season, auth, views(...VIEWS))),
  // Rosters, waiver order and budgets, with each player's projection for a given week.
  rostersForWeek: (leagueId: string, season: string, week: number, auth: EspnAuth | null) =>
    cached(`espn:rosters:${leagueId}:${season}:${week}`, 5 * MINUTE, () => {
      const params = views('mRoster', 'mTeam', 'mSettings');
      params.set('scoringPeriodId', String(week));
      return get<EspnLeague>(leagueId, season, auth, params);
    }),
  freeAgents: (leagueId: string, season: string, week: number, auth: EspnAuth | null) =>
    cached(`espn:free-agents:${leagueId}:${season}:${week}`, 5 * MINUTE, () => {
      const params = views('kona_player_info');
      params.set('scoringPeriodId', String(week));
      return get<EspnFreeAgents>(leagueId, season, auth, params, { 'X-Fantasy-Filter': JSON.stringify(FREE_AGENT_FILTER) });
    }),
};
