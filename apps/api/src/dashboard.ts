import type { DashboardResponse } from '@ffd/shared';
import { fetchEspnLeagues } from './adapters/espn/index.js';
import { fetchManualLeagues } from './adapters/manual/index.js';
import { fetchSleeperLeagues, sleeperNflState } from './adapters/sleeper/index.js';
import { backfillHistory } from './backfill.js';
import { config } from './config.js';
import { activeSources } from './sources/store.js';
import { buildExposure } from './exposure.js';
import { adviseLeagues } from './lineupAdvice.js';
import { withMinutesLeft } from './minutesLeft.js';
import { nflGames } from './scoring/games.js';
import { recordSnapshots } from './snapshots.js';

export async function getDashboard(): Promise<DashboardResponse> {
  // Sleeper's /state/nfl doubles as our "what season/week is it" clock for all platforms.
  const nfl = await sleeperNflState();

  // Accounts and leagues from .env plus any added in the app.
  const sources = await activeSources();
  const results = await Promise.all([
    fetchSleeperLeagues(sources.sleeperUsernames),
    fetchEspnLeagues(sources.espnLeagueIds, nfl.season, config.espnAuth),
    fetchManualLeagues(nfl),
  ]);

  // The same league can show up under two of your accounts; keep it once.
  const seen = new Set<string>();
  const unique = results
    .flatMap((r) => r.leagues)
    .filter((l) => {
      const key = `${l.platform}:${l.leagueId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  // Drop alerts that can't be acted on any more and suggest bench swaps for the rest.
  const advised = await adviseLeagues(unique, nfl);
  const leagues = withMinutesLeft(advised, nfl.week, await nflGames(nfl.season, nfl.week).catch(() => null));

  // Record history in the background: a database problem must never break the dashboard.
  recordSnapshots(leagues).catch((e) => console.error('Could not save league snapshots:', e));
  backfillHistory(leagues).catch((e) => console.error('Could not backfill past weeks:', e));

  return {
    season: nfl.season,
    week: nfl.week,
    updatedAt: new Date().toISOString(),
    leagues,
    players: buildExposure(leagues),
    errors: results.flatMap((r) => r.errors),
  };
}
