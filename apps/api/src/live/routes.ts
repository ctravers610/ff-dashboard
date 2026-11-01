import type { LiveFeedResponse, WinChanceResponse } from '@ffd/shared';
import type { FastifyInstance } from 'fastify';
import { sleeperNflState } from '../adapters/sleeper/index.js';
import { gamesLive, lastLiveCheck, liveEventRepo, pollLive } from './service.js';
import { thin, winChanceRepo } from './winChance.js';

export async function liveRoutes(app: FastifyInstance) {
  app.get('/api/live', async (): Promise<LiveFeedResponse> => {
    const { season, week } = await sleeperNflState();
    const [events, live] = await Promise.all([liveEventRepo.recent(season, week), gamesLive(season, week)]);
    return { week, live, lastCheckedAt: lastLiveCheck()?.toISOString() ?? null, events };
  });

  app.get('/api/live/win-chance', async (): Promise<WinChanceResponse> => {
    const { season, week } = await sleeperNflState();
    const series = await winChanceRepo.series(season, week);
    return { week, leagues: Object.fromEntries([...series].map(([key, points]) => [key, thin(points)])) };
  });

  // Look right now instead of waiting for the next 30-second check.
  app.post('/api/live/poll', async () => ({ events: (await pollLive()).length }));
}
