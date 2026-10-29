// History's past seasons, from the analytics warehouse: each of your Sleeper
// leagues, season by season (record, all-play, luck, bench points, pickups).

import type { AllSeasonsResponse, WarehouseLeague, WarehouseSeason } from '@ffd/shared';
import type { FastifyInstance } from 'fastify';
import { warehouseStore, type SeasonRow, type WarehouseStore } from './store.js';

const record = (wins: number, losses: number, ties: number) => ({ wins, losses, ties });

function toSeason(row: SeasonRow): WarehouseSeason {
  return {
    leagueId: row.league_id,
    season: row.season,
    teamName: row.team_name,
    teams: row.teams,
    finish: row.regular_season_rank,
    record: record(row.wins, row.losses, row.ties),
    medianRecord: row.median_wins == null ? null : record(row.median_wins, row.median_losses ?? 0, row.median_ties ?? 0),
    allPlay: record(row.all_play_wins, row.all_play_losses, row.all_play_ties),
    expectedWins: Number(row.expected_wins),
    luck: Number(row.luck),
    pointsFor: Number(row.points_for),
    pointsLeftOnBench: Number(row.points_left_on_bench),
    lineupEfficiency: row.lineup_efficiency == null ? null : Number(row.lineup_efficiency),
    pickups: row.pickups,
    faabSpent: row.faab_spent,
    pickupPoints: Number(row.pickup_points_started),
  };
}

/** One entry per league lineage, its seasons newest first (the rows come sorted that way). */
export function groupByLeague(rows: SeasonRow[]): WarehouseLeague[] {
  const leagues = new Map<string, WarehouseLeague>();
  for (const row of rows) {
    const league = leagues.get(row.league_lineage_id) ?? { lineageId: row.league_lineage_id, name: row.league_name, seasons: [] };
    league.seasons.push(toSeason(row));
    leagues.set(row.league_lineage_id, league);
  }
  return [...leagues.values()];
}

export function warehouseRoutes(store: WarehouseStore | null = warehouseStore) {
  return async (app: FastifyInstance) => {
    app.get('/api/history/seasons', async (_req, reply): Promise<AllSeasonsResponse | void> => {
      if (!store) return { available: false, leagues: [] };
      try {
        return { available: true, leagues: groupByLeague(await store.mySeasons()) };
      } catch (e) {
        app.log.error(e, 'warehouse query failed');
        return reply.code(503).send({ message: "Couldn't reach the analytics warehouse." });
      }
    });
  };
}
