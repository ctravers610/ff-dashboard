import { cached, MINUTE } from '../../cache.js';
import type { EspnLeague } from './types.js';

const BASE_URL = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';
const VIEWS = ['mSettings', 'mTeam', 'mRoster', 'mMatchupScore', 'mScoreboard', 'mStatus'];

export interface EspnAuth {
  espnS2: string;
  swid: string;
}

// Private leagues need the espn_s2 and SWID cookies from a logged-in browser.
async function fetchLeague(leagueId: string, season: string, auth: EspnAuth | null): Promise<EspnLeague> {
  const params = new URLSearchParams(VIEWS.map((v) => ['view', v]));
  const url = `${BASE_URL}/${season}/segments/0/leagues/${leagueId}?${params}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
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
  return (await res.json()) as EspnLeague;
}

export const espnClient = {
  league: (leagueId: string, season: string, auth: EspnAuth | null) =>
    cached(`espn:league:${leagueId}:${season}`, MINUTE, () => fetchLeague(leagueId, season, auth)),
};
