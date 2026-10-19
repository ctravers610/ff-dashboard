import type { DashboardResponse } from '@ffd/shared';
import { fetchEspnLeagues } from './adapters/espn/index.js';
import { fetchManualLeagues } from './adapters/manual/index.js';
import { fetchSleeperLeagues, sleeperNflState } from './adapters/sleeper/index.js';
import { config } from './config.js';
import { buildExposure } from './exposure.js';

export async function getDashboard(): Promise<DashboardResponse> {
  // Sleeper's /state/nfl doubles as our "what season/week is it" clock for all platforms.
  const nfl = await sleeperNflState();

  const results = await Promise.all([
    fetchSleeperLeagues(config.sleeperUsernames),
    fetchEspnLeagues(config.espnLeagueIds, nfl.season, config.espnAuth),
    fetchManualLeagues(nfl),
  ]);

  // The same league can show up under two of your accounts; keep it once.
  const seen = new Set<string>();
  const leagues = results
    .flatMap((r) => r.leagues)
    .filter((l) => {
      const key = `${l.platform}:${l.leagueId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    season: nfl.season,
    week: nfl.week,
    updatedAt: new Date().toISOString(),
    leagues,
    players: buildExposure(leagues),
    errors: results.flatMap((r) => r.errors),
  };
}
