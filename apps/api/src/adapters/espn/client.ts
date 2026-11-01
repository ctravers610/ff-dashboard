import { cached, MINUTE } from '../../cache.js';
import { config } from '../../config.js';
import type { SourceError } from '@ffd/shared';
import type { EspnActivity, EspnFreeAgents, EspnLeague, EspnTransaction } from './types.js';

const VIEWS = ['mSettings', 'mTeam', 'mRoster', 'mMatchupScore', 'mScoreboard', 'mStatus'];

export interface EspnAuth {
  espnS2: string;
  swid: string;
}

/** ESPN refused the cookies we sent: they expired, or you signed out of ESPN. */
export class EspnCookiesError extends Error {
  readonly code = 'espn-cookies' as const;
}

/** A failed ESPN league as a source error, tagged when the fix is new cookies. */
export function espnSourceError(leagueId: string, e: unknown): SourceError {
  const message = e instanceof Error ? e.message : String(e);
  return e instanceof EspnCookiesError ? { source: `espn:${leagueId}`, message, code: e.code } : { source: `espn:${leagueId}`, message };
}

// Private leagues need the espn_s2 and SWID cookies from a logged-in browser.
async function get<T>(
  leagueId: string,
  season: string,
  auth: EspnAuth | null,
  params: URLSearchParams,
  extraHeaders: Record<string, string> = {},
  path = '',
): Promise<T> {
  const url = `${config.upstream.espnFantasy}/${season}/segments/0/leagues/${leagueId}${path}?${params}`;
  const headers: Record<string, string> = { Accept: 'application/json', ...extraHeaders };
  if (auth) headers.Cookie = `espn_s2=${auth.espnS2}; SWID=${auth.swid}`;

  const res = await fetch(url, { headers });
  if (res.status === 401 || res.status === 403) {
    if (auth) throw new EspnCookiesError(`ESPN rejected the cookies for league ${leagueId} (they may have expired)`);
    throw new Error(`League ${leagueId} is private: set ESPN_S2 and ESPN_SWID in .env`);
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

export const ESPN_TRADE_MESSAGE = 244;

const TRADE_ACTIVITY_FILTER = {
  topics: {
    filterType: { value: ['ACTIVITY_TRANSACTIONS'] },
    filterIncludeMessageTypeIds: { value: [ESPN_TRADE_MESSAGE] },
    limit: 200,
    limitPerMessageSet: { value: 200 },
    offset: 0,
    sortMessageDate: { sortPriority: 1, sortAsc: false },
    sortFor: { sortPriority: 2, sortAsc: false },
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
  // A week's transactions; processed waiver claims show when the league's waivers run.
  transactions: (leagueId: string, season: string, week: number, auth: EspnAuth | null) =>
    cached(`espn:transactions:${leagueId}:${season}:${week}`, 6 * 60 * MINUTE, () => {
      const params = views('mTransactions2');
      params.set('scoringPeriodId', String(week));
      return get<{ transactions?: EspnTransaction[] }>(leagueId, season, auth, params);
    }),
  // The same, fresh: signed in as you, ESPN includes your own pending claims (and
  // nobody else's). Kept only briefly, so a claim you just made shows up within a minute.
  pendingTransactions: (leagueId: string, season: string, week: number, auth: EspnAuth | null) =>
    cached(`espn:pending:${leagueId}:${season}:${week}`, 30_000, () => {
      const params = views('mTransactions2');
      params.set('scoringPeriodId', String(week));
      return get<{ transactions?: EspnTransaction[] }>(leagueId, season, auth, params);
    }),
  // Every completed trade this season, whoever made it. mTransactions2 has the
  // players in your own trades only, and this feed doesn't answer for past seasons.
  tradeActivity: (leagueId: string, season: string, auth: EspnAuth | null) =>
    cached(`espn:trade-activity:${leagueId}:${season}`, 5 * MINUTE, () =>
      get<EspnActivity>(leagueId, season, auth, views('kona_league_communication'), { 'X-Fantasy-Filter': JSON.stringify(TRADE_ACTIVITY_FILTER) }, '/communication/'),
    ),
  // Specific players by id, with stats for the week, e.g. the ones in your claims.
  // ESPN refuses a limit that comes without a sort.
  players: (leagueId: string, season: string, week: number, ids: number[], auth: EspnAuth | null) => {
    const params = views('kona_player_info');
    params.set('scoringPeriodId', String(week));
    const filter = { players: { filterIds: { value: ids } } };
    return get<EspnFreeAgents>(leagueId, season, auth, params, { 'X-Fantasy-Filter': JSON.stringify(filter) });
  },
  freeAgents: (leagueId: string, season: string, week: number, auth: EspnAuth | null) =>
    cached(`espn:free-agents:${leagueId}:${season}:${week}`, 5 * MINUTE, () => {
      const params = views('kona_player_info');
      params.set('scoringPeriodId', String(week));
      return get<EspnFreeAgents>(leagueId, season, auth, params, { 'X-Fantasy-Filter': JSON.stringify(FREE_AGENT_FILTER) });
    }),
};
