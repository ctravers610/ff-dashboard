// What the trade loaders share: finished weeks and their stats.

import { cached, HOUR } from '../cache.js';
import { nflGames } from '../scoring/games.js';
import { fetchStats } from '../scoring/live.js';

// A finished week's stats don't change.
export const pastStats = (season: string, week: number) => cached(`trades:stats:${season}:${week}`, 6 * HOUR, () => fetchStats(season, week));

/** The latest week whose games are all over, up to the end of the regular season. */
export async function lastFinishedWeek(season: string, week: number, lastWeek: number): Promise<number> {
  const games = await nflGames(season, week).catch(() => null);
  const currentDone = games != null && games.size > 0 && [...games.values()].every((g) => g.progress >= 1);
  return Math.min(lastWeek, currentDone ? week : week - 1);
}
