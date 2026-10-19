import type { DashboardResponse } from '@ffd/shared';
import { fetchSleeperLeagues, sleeperNflState } from './adapters/sleeper/index.js';
import { config } from './config.js';

export async function getDashboard(): Promise<DashboardResponse> {
  // Sleeper's /state/nfl doubles as our "what week is it" clock for all platforms.
  const [nfl, sleeper] = await Promise.all([
    sleeperNflState(),
    fetchSleeperLeagues(config.sleeperUsernames),
  ]);

  const results = [sleeper];

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
    errors: results.flatMap((r) => r.errors),
  };
}
