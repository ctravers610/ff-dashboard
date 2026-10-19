import type { HistoryResponse } from '@ffd/shared';
import type { FastifyInstance } from 'fastify';
import { sleeperNflState } from '../adapters/sleeper/index.js';
import { buildHistory } from '../history.js';
import { snapshotRepo } from '../snapshots.js';

export async function historyRoutes(app: FastifyInstance) {
  app.get('/api/history', async (): Promise<HistoryResponse> => {
    const nfl = await sleeperNflState();
    const rows = await snapshotRepo.listForSeason(nfl.season);
    return { season: nfl.season, week: nfl.week, leagues: buildHistory(rows, nfl.week) };
  });
}
